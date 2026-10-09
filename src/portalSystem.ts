/**
 * Portal system for Volcanae.
 *
 * Implements the EMBER_PORTAL mechanic for the RIFT_LORD unit.
 * The caster places a portal pair: an entrance tile adjacent to itself and
 * an exit tile behind the player frontline. Enemy units stepping on the
 * entrance are teleported to the exit (if free) or wait there until it clears.
 *
 * Map orientation reminder:
 *   - Row 0 = NORTH (top of screen) = enemy stronghold side.
 *   - Row 40 = SOUTH (bottom of screen) = player stronghold side.
 *   - Lava advances NORTHWARD (decreasing Y).
 *   - Player advances NORTHWARD (decreasing Y) to capture enemy strongholds.
 *   - "Behind the player frontline" = SOUTH of the northernmost player unit
 *     = HIGHER Y than the northernmost player unit.
 *   - Exit portal placement target: tiles with Y > northernmost player's Y
 *     by at least ABILITIES.EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE.
 */

import type { Draft } from 'immer';
import type { GameState, Portal, Position, Unit } from './types';
import { Faction, TileType, UnitType } from './types';
import { TileStatus } from './types';
import {
  ABILITIES,
  MAP,
} from './gameConfig';
import { applyTileStatus } from './tileStatusSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import type { GameEvent } from './gameEvents';
import { canUnitOccupyTerrain } from './movementSystem';
import type { TextRef } from './i18n/i18n';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a unique portal ID. */
function generatePortalId(): string {
  return `portal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Returns true if the tile at (x, y) is a valid portal exit candidate:
 * - In-bounds
 * - Not lava
 * - PLAINS terrain only
 * - No building, no ruin, no stronghold ruin
 * - No unit (any faction)
 * - No other portal entrance or exit on this tile
 * - No tile resource
 */
function isValidExitTile(state: Draft<GameState>, x: number, y: number): boolean {
  if (x < 0 || x >= MAP.GRID_WIDTH || y < 0 || y >= MAP.GRID_HEIGHT) return false;
  const tile = state.grid[y][x];
  if (tile.isLava) return false;
  if (tile.terrainType !== TileType.PLAINS) return false;
  if (tile.buildingId !== null) return false;
  if (tile.isStrongholdRuin || tile.isRuin) return false;
  if (tile.unitId !== null) return false;
  // No other portal entrance or exit at this tile.
  for (const portal of Object.values(state.portals ?? {})) {
    if (portal.entrancePos.x === x && portal.entrancePos.y === y) return false;
    if (portal.exitPos.x === x && portal.exitPos.y === y) return false;
  }
  return true;
}

/**
 * Returns true if the tile at (x, y) is a valid portal entrance candidate:
 * - In-bounds
 * - Not lava
 * - PLAINS terrain only
 * - No building and no ruin
 * - No player unit (enemy unit is OK — will be teleported on cast)
 * - No other portal entrance or exit on this tile
 * - No tile resource
 */
function isValidEntranceTile(state: Draft<GameState>, x: number, y: number): boolean {
  if (x < 0 || x >= MAP.GRID_WIDTH || y < 0 || y >= MAP.GRID_HEIGHT) return false;
  const tile = state.grid[y][x];
  if (tile.isLava) return false;
  if (tile.terrainType !== TileType.PLAINS) return false;
  if (tile.buildingId !== null) return false;
  if (tile.isStrongholdRuin || tile.isRuin) return false;
  // Player unit blocks placement
  if (tile.unitId !== null) {
    const occupant = state.units[tile.unitId];
    if (occupant && occupant.faction === Faction.PLAYER) return false;
    // Enemy occupant — allowed.
  }
  // No other portal entrance or exit at this tile.
  for (const portal of Object.values(state.portals ?? {})) {
    if (portal.entrancePos.x === x && portal.entrancePos.y === y) return false;
    if (portal.exitPos.x === x && portal.exitPos.y === y) return false;
  }
  return true;
}

/**
 * Find the northernmost row (lowest Y) that has at least one player unit.
 * This is the player's true frontline — the most-advanced position.
 * Returns MAP.GRID_HEIGHT (sentinel: "no frontline") if no player units exist.
 */
export function getPlayerFrontlineRow(state: Draft<GameState>): number {
  let frontline: number = MAP.GRID_HEIGHT;
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER && unit.position.y < frontline) {
      frontline = unit.position.y;
      if (frontline === 0) break; // Cannot be further north than row 0.
    }
  }
  return frontline;
}

// ---------------------------------------------------------------------------
// Shared removal helper
// ---------------------------------------------------------------------------

/** Removes a portal pair, emitting PORTAL_CLOSED with both endpoint positions. */
function removePortalPair(state: Draft<GameState>, portalId: string, events?: GameEvent[]): void {
  const portal = state.portals[portalId];
  if (!portal) return;
  events?.push({
    type: 'PORTAL_CLOSED',
    portalId,
    entrancePos: { x: portal.entrancePos.x, y: portal.entrancePos.y },
    exitPos: { x: portal.exitPos.x, y: portal.exitPos.y },
  });
  delete state.portals[portalId];
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Determines if a Rift Lord should cast a portal pair this turn.
 * Returns the planned entrance/exit positions, or null if no cast is possible.
 *
 * Planning logic:
 * 1. One pair per Rift Lord at a time: no cast if an active pair exists.
 * 2. Find the player's northernmost unit (true frontline).
 * 3. Entrance: any Chebyshev-1 neighbour of the caster that passes isValidEntranceTile.
 * 4. Exit: within ABILITIES.EMBER_PORTAL_PAIR_MAX_DISTANCE (edge-circle) of the entrance,
 *    at Y >= frontlineRow + ABILITIES.EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE,
 *    passes isValidExitTile.
 */
export function tryPlanPortalCast(
  state: Draft<GameState>,
  casterId: string,
): { entrancePos: Position; exitPos: Position } | null {
  const caster = state.units[casterId];
  if (!caster) return null;

  // Constraint: one pair per Rift Lord at a time.
  const hasActivePair = Object.values(state.portals ?? {}).some(p => p.casterId === casterId);
  if (hasActivePair) return null;

  // Find the player's actual frontline (northernmost player unit).
  const frontlineRow = getPlayerFrontlineRow(state);
  if (frontlineRow >= MAP.GRID_HEIGHT) return null; // No player units → no target.

  // Exit must be SOUTH of the frontline by at least MIN_DISTANCE rows.
  const minExitY = frontlineRow + ABILITIES.EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE;
  if (minExitY >= MAP.GRID_HEIGHT) return null;

  const { x: cx, y: cy } = caster.position;

  // Pick the entrance first: any Chebyshev-1 neighbour of the caster that is a valid entrance tile.
  let chosenEntrance: Position | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ex = cx + dx;
      const ey = cy + dy;
      if (isValidEntranceTile(state, ex, ey)) {
        chosenEntrance = { x: ex, y: ey };
        break;
      }
    }
    if (chosenEntrance) break;
  }
  if (!chosenEntrance) return null;

  // Pick the exit: within ABILITIES.EMBER_PORTAL_PAIR_MAX_DISTANCE edge-circle of the entrance,
  // and at Y >= minExitY, valid exit tile.
  let chosenExit: Position | null = null;
  for (let ty = minExitY; ty < MAP.GRID_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP.GRID_WIDTH; tx++) {
      if (!isTileWithinEdgeCircleRange(chosenEntrance.x, chosenEntrance.y, tx, ty, ABILITIES.EMBER_PORTAL_PAIR_MAX_DISTANCE)) continue;
      if (!isValidExitTile(state, tx, ty)) continue;
      chosenExit = { x: tx, y: ty };
      break;
    }
    if (chosenExit) break;
  }
  if (!chosenExit) return null;

  return { entrancePos: chosenEntrance, exitPos: chosenExit };
}

/**
 * Executes a portal cast: creates the Portal record, applies CORRUPTED to the
 * exit tile, and emits a PORTAL_CREATED event.
 * If an enemy unit is standing on the entrance tile at cast time, it is
 * teleported through the new portal immediately.
 */
export function castPortal(
  state: Draft<GameState>,
  casterId: string,
  entrancePos: Position,
  exitPos: Position,
  events?: GameEvent[],
): void {
  const caster = state.units[casterId];
  if (!caster) return;

  const id = generatePortalId();
  const portal: Portal = {
    id,
    kind: 'RIFT_LORD',
    casterId,
    entrancePos: { x: entrancePos.x, y: entrancePos.y },
    exitPos: { x: exitPos.x, y: exitPos.y },
    createdTurn: state.turn,
    // Cast on turn T with LIFETIME = L → usable on T, T+1, ..., T+L-1.
    lastUsableTurn: state.turn + ABILITIES.EMBER_PORTAL_LIFETIME_TURNS - 1,
    pendingTeleportUnitId: null,
  };

  state.portals[id] = portal;

  // Corrupt the exit tile (preserves the existing visual cue).
  applyTileStatus(state, exitPos, TileStatus.CORRUPTED, events);

  events?.push({
    type: 'PORTAL_CREATED',
    casterId,
    portalId: id,
    entrancePos: { x: entrancePos.x, y: entrancePos.y },
    exitPos: { x: exitPos.x, y: exitPos.y },
  });

  // If an enemy unit is standing on the entrance tile at cast time, teleport it immediately.
  const entranceTile = state.grid[entrancePos.y][entrancePos.x];
  if (entranceTile.unitId !== null) {
    tryTeleportThroughPortal(state, entranceTile.unitId, portal.id, events);
  }
}

/** Creates a persistent, bidirectional portal pair for a Mage. */
export function castMagePortalPair(
  state: Draft<GameState>,
  casterId: string,
  endpointA: Position,
  endpointB: Position,
  events?: GameEvent[],
): boolean {
  const caster = state.units[casterId];
  if (!caster || caster.type !== UnitType.MAGE || caster.faction !== Faction.PLAYER) return false;

  const id = generatePortalId();
  state.portals[id] = {
    id,
    kind: 'MAGE',
    casterId,
    entrancePos: { ...endpointA },
    exitPos: { ...endpointB },
    createdTurn: state.turn,
    lastUsableTurn: state.turn,
    pendingTeleportUnitId: null,
  };
  events?.push({
    type: 'PORTAL_CREATED',
    casterId,
    portalId: id,
    entrancePos: { ...endpointA },
    exitPos: { ...endpointB },
    portalKind: 'MAGE',
  });

  for (const [oldId, portal] of Object.entries(state.portals ?? {})) {
    if (oldId !== id && portal.kind === 'MAGE' && portal.casterId === casterId) {
      removePortalPair(state, oldId, events);
    }
  }
  return true;
}

/** True when a position is covered by any active portal pair. */
export function isPortalEndpoint(state: GameState | Draft<GameState>, pos: Position): boolean {
  return Object.values(state.portals ?? {}).some((portal) =>
    (portal.entrancePos.x === pos.x && portal.entrancePos.y === pos.y)
    || (portal.exitPos.x === pos.x && portal.exitPos.y === pos.y));
}

/** Returns the Mage portal and paired destination at either endpoint. */
export function getMagePortalAtPosition(
  state: GameState | Draft<GameState>,
  pos: Position,
): { portal: Portal; destination: Position } | null {
  for (const portal of Object.values(state.portals ?? {})) {
    if (portal.kind !== 'MAGE') continue;
    if (portal.entrancePos.x === pos.x && portal.entrancePos.y === pos.y) {
      return { portal, destination: portal.exitPos };
    }
    if (portal.exitPos.x === pos.x && portal.exitPos.y === pos.y) {
      return { portal, destination: portal.entrancePos };
    }
  }
  return null;
}

/** A Mage portal's opposite endpoint must be free before voluntary entry. */
export function isMagePortalExitAvailable(
  state: GameState | Draft<GameState>,
  pos: Position,
  unit?: Pick<Unit, 'faction' | 'tags'>,
): boolean {
  const pair = getMagePortalAtPosition(state, pos);
  if (!pair) return false;
  const tile = state.grid[pair.destination.y]?.[pair.destination.x];
  return !!tile
    && tile.unitId === null
    && tile.buildingId === null
    && !tile.isLava
    && (!unit || canUnitOccupyTerrain(state, unit, pair.destination.x, pair.destination.y));
}

/** Returns the curated reason a Mage portal endpoint cannot be entered voluntarily. */
export function explainBlockedMagePortalEntry(
  state: GameState | Draft<GameState>,
  pos: Position,
  unit: Pick<Unit, 'faction' | 'tags'>,
): TextRef | null {
  const pair = getMagePortalAtPosition(state, pos);
  if (!pair || isMagePortalExitAvailable(state, pos, unit)) return null;
  return { key: 'reason.movement.portalExitBlocked' };
}

/** Resolves portal entry after voluntary or forced movement, without chained bounce. */
export function resolvePortalEntry(
  state: Draft<GameState>,
  unitId: string,
  enteredPosition: Position,
  events?: GameEvent[],
): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.position.x !== enteredPosition.x || unit.position.y !== enteredPosition.y) return false;

  const magePair = getMagePortalAtPosition(state, enteredPosition);
  const portal = magePair?.portal ?? getUsablePortalAtEntrance(state, enteredPosition);
  if (!portal) return false;
  if (portal.kind !== 'MAGE' && portal.casterId === unitId) return false;

  const destination = magePair?.destination ?? portal.exitPos;
  const sourceTile = state.grid[enteredPosition.y]?.[enteredPosition.x];
  const destinationTile = state.grid[destination.y]?.[destination.x];
  if (!sourceTile || sourceTile.unitId !== unitId || !destinationTile) return false;

  const destinationOpen =
    destinationTile.unitId === null
    && destinationTile.buildingId === null
    && !destinationTile.isLava
    && canUnitOccupyTerrain(state, unit, destination.x, destination.y);
  if (!destinationOpen) {
    if (portal.kind === 'MAGE') {
      events?.push({
        type: 'PORTAL_BLOCKED',
        unitId,
        position: { ...enteredPosition },
      });
    } else {
      tryTeleportThroughPortal(state, unitId, portal.id, events);
    }
    return false;
  }

  sourceTile.unitId = null;
  destinationTile.unitId = unitId;
  unit.position = { ...destination };
  unit.lastMovementDirection = null;
  unit.hasMovedThisTurn = true;
  if (portal.kind !== 'MAGE' && portal.pendingTeleportUnitId === unitId) {
    portal.pendingTeleportUnitId = null;
  }
  events?.push({
    type: 'PORTAL_USED',
    unitId,
    fromPos: { ...enteredPosition },
    toPos: { ...destination },
    portalKind: portal.kind ?? 'RIFT_LORD',
  });
  return true;
}

/**
 * Attempts to teleport `unitId` through the portal `portalId`.
 * - If the exit tile is currently free, performs the teleport immediately, emits PORTAL_USED,
 *   clears any `pendingTeleportUnitId` on the portal, and returns true.
 * - If the exit tile is blocked, sets `portal.pendingTeleportUnitId = unitId` so the unit
 *   waits on the entrance — unless another unit is already waiting. Returns false.
 * - If the unit is not on the entrance tile, or the entrance tile is owned by a different
 *   unit, or the exit tile is occupied, this is a no-op teleport (returns false).
 *   A teleport never overwrites or clears occupancy owned by another unit.
 */
export function tryTeleportThroughPortal(
  state: Draft<GameState>,
  unitId: string,
  portalId: string,
  events?: GameEvent[],
): boolean {
  const portal = state.portals[portalId];
  if (!portal) return false;
  const unit = state.units[unitId];
  if (!unit) return false;
  // Caster never uses own portal (defensive).
  if (portal.casterId === unitId) return false;
  // Unit must be on the entrance tile.
  if (unit.position.x !== portal.entrancePos.x || unit.position.y !== portal.entrancePos.y) return false;

  // Occupancy ownership: the entrance tile must actually belong to this unit.
  // Never clear a tile owned by a different unit.
  const entranceTile = state.grid[portal.entrancePos.y]?.[portal.entrancePos.x];
  if (!entranceTile || entranceTile.unitId !== unitId) return false;

  const exitTile = state.grid[portal.exitPos.y]?.[portal.exitPos.x];
  const exitPassable =
    exitTile &&
    exitTile.unitId === null &&
    !exitTile.isLava &&
    exitTile.buildingId === null;

  if (!exitPassable) {
    // Only one unit may wait on the entrance at a time.
    if (portal.pendingTeleportUnitId === null || portal.pendingTeleportUnitId === unitId) {
      portal.pendingTeleportUnitId = unitId;
    }
    return false;
  }

  // Perform teleport.
  const teleportFrom = { x: unit.position.x, y: unit.position.y };
  entranceTile.unitId = null;
  unit.position = { x: portal.exitPos.x, y: portal.exitPos.y };
  exitTile.unitId = unit.id;
  unit.lastMovementDirection = null; // prevent FROZEN-slide on exit

  if (portal.pendingTeleportUnitId === unitId) {
    portal.pendingTeleportUnitId = null;
  }

  events?.push({
    type: 'PORTAL_USED',
    unitId,
    fromPos: teleportFrom,
    toPos: { x: portal.exitPos.x, y: portal.exitPos.y },
  });

  return true;
}

/**
 * Called after any unit movement / death / teleport that may have freed a portal exit tile.
 * For each portal with a pendingTeleportUnitId, re-attempts the teleport.
 * Iterates until no more teleports happen (in case a chain-reaction empties multiple exits).
 */
export function processPendingPortalTeleports(
  state: Draft<GameState>,
  events?: GameEvent[],
): void {
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const portal of Object.values(state.portals ?? {})) {
      if (!portal.pendingTeleportUnitId) continue;
      const waiterId = portal.pendingTeleportUnitId;
      const waiter = state.units[waiterId];
      if (!waiter) {
        portal.pendingTeleportUnitId = null;
        continue;
      }
      if (waiter.position.x !== portal.entrancePos.x || waiter.position.y !== portal.entrancePos.y) {
        portal.pendingTeleportUnitId = null;
        continue;
      }
      // Stale waiter: the entrance tile no longer points at the recorded waiter.
      const entranceTile = state.grid[portal.entrancePos.y]?.[portal.entrancePos.x];
      if (!entranceTile || entranceTile.unitId !== waiterId) {
        portal.pendingTeleportUnitId = null;
        continue;
      }
      const teleported = tryTeleportThroughPortal(state, waiterId, portal.id, events);
      if (teleported) progressed = true;
    }
  }
}

/**
 * Returns the active, usable portal whose entrance tile matches `pos`, or null.
 * A portal is usable if state.turn >= portal.createdTurn and <= portal.lastUsableTurn.
 */
export function getUsablePortalAtEntrance(state: GameState, pos: Position): Portal | null {
  for (const portal of Object.values(state.portals ?? {})) {
    if (portal.kind === 'MAGE') continue;
    if (portal.entrancePos.x === pos.x && portal.entrancePos.y === pos.y) {
      // Usable on createdTurn through lastUsableTurn inclusive.
      if (state.turn >= portal.createdTurn && state.turn <= portal.lastUsableTurn) {
        return portal;
      }
    }
  }
  return null;
}

/**
 * Removes portal pairs whose caster has died.
 * Called at the start of each enemy turn.
 * Expiry is handled by cleanupExpiredPortalsEndOfTurn.
 */
export function cleanupPortals(state: Draft<GameState>, events?: GameEvent[]): void {
  // Remove pairs whose caster died. (Expiry is handled by cleanupExpiredPortalsEndOfTurn.)
  for (const [id, portal] of Object.entries(state.portals ?? {})) {
    if (!state.units[portal.casterId]) {
      removePortalPair(state, id, events);
    }
  }
}

/**
 * Removes portal pairs whose lastUsableTurn equals the current turn.
 * Called at the END of each enemy turn, after all enemy unit actions.
 * This ensures portals cast on turn T with LIFETIME = L remain usable for the full L turns,
 * and are removed at the end of their last usable turn (T + L - 1).
 */
export function cleanupExpiredPortalsEndOfTurn(state: Draft<GameState>, events?: GameEvent[]): void {
  for (const [id, portal] of Object.entries(state.portals ?? {})) {
    if (portal.kind === 'MAGE') continue;
    if (state.turn >= portal.lastUsableTurn) {
      removePortalPair(state, id, events);
    }
  }
}

/**
 * Removes any portal pair whose entrance or exit tile has just been consumed by lava.
 * Called immediately when lava advance flips tiles to lava, so the pair never persists
 * in a half-broken state.
 */
export function removePortalsOnLava(state: Draft<GameState>, events?: GameEvent[]): void {
  for (const [id, portal] of Object.entries(state.portals ?? {})) {
    const entranceLava = state.grid[portal.entrancePos.y]?.[portal.entrancePos.x]?.isLava;
    const exitLava = state.grid[portal.exitPos.y]?.[portal.exitPos.x]?.isLava;
    if (entranceLava || exitLava || !state.units[portal.casterId]) {
      removePortalPair(state, id, events);
    }
  }
}
