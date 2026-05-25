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
 *     by at least EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE.
 */

import type { Draft } from 'immer';
import type { GameState, Portal, Position } from './types';
import { Faction, TileType } from './types';
import { TileStatus } from './types';
import {
  EMBER_PORTAL_LIFETIME_TURNS,
  EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE,
  EMBER_PORTAL_PAIR_MAX_DISTANCE,
  MAP,
} from './gameConfig';
import { applyTileStatus } from './tileStatusSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import type { GameEvent } from './gameEvents';

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
  if (tile.resourceType !== null) return false;
  // No other portal entrance or exit at this tile.
  for (const portal of Object.values(state.portals)) {
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
  if (tile.resourceType !== null) return false;
  // Player unit blocks placement; enemy unit is OK (will be teleported on cast).
  if (tile.unitId !== null) {
    const occupant = state.units[tile.unitId];
    if (occupant && occupant.faction === Faction.PLAYER) return false;
    // Enemy occupant — allowed.
  }
  // No other portal entrance or exit at this tile.
  for (const portal of Object.values(state.portals)) {
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
function getPlayerFrontlineRow(state: Draft<GameState>): number {
  let frontline = MAP.GRID_HEIGHT;
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
 * 4. Exit: within EMBER_PORTAL_PAIR_MAX_DISTANCE (edge-circle) of the entrance,
 *    at Y >= frontlineRow + EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE,
 *    passes isValidExitTile.
 */
export function tryPlanPortalCast(
  state: Draft<GameState>,
  casterId: string,
): { entrancePos: Position; exitPos: Position } | null {
  const caster = state.units[casterId];
  if (!caster) return null;

  // Constraint: one pair per Rift Lord at a time.
  const hasActivePair = Object.values(state.portals).some(p => p.casterId === casterId);
  if (hasActivePair) return null;

  // Find the player's actual frontline (northernmost player unit).
  const frontlineRow = getPlayerFrontlineRow(state);
  if (frontlineRow >= MAP.GRID_HEIGHT) return null; // No player units → no target.

  // Exit must be SOUTH of the frontline by at least MIN_DISTANCE rows.
  const minExitY = frontlineRow + EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE;
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

  // Pick the exit: within EMBER_PORTAL_PAIR_MAX_DISTANCE edge-circle of the entrance,
  // and at Y >= minExitY, valid exit tile.
  let chosenExit: Position | null = null;
  for (let ty = minExitY; ty < MAP.GRID_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP.GRID_WIDTH; tx++) {
      if (!isTileWithinEdgeCircleRange(chosenEntrance.x, chosenEntrance.y, tx, ty, EMBER_PORTAL_PAIR_MAX_DISTANCE)) continue;
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
    casterId,
    entrancePos: { x: entrancePos.x, y: entrancePos.y },
    exitPos: { x: exitPos.x, y: exitPos.y },
    createdTurn: state.turn,
    // Cast on turn T with LIFETIME = L → usable on T, T+1, ..., T+L-1.
    lastUsableTurn: state.turn + EMBER_PORTAL_LIFETIME_TURNS - 1,
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

/**
 * Attempts to teleport `unitId` through the portal `portalId`.
 * - If the exit tile is currently free, performs the teleport immediately, emits PORTAL_USED,
 *   clears any `pendingTeleportUnitId` on the portal, and returns true.
 * - If the exit tile is blocked, sets `portal.pendingTeleportUnitId = unitId` so the unit
 *   waits on the entrance. Returns false.
 * - If the unit is not on the entrance tile, this is a no-op (returns false).
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

  const exitTile = state.grid[portal.exitPos.y]?.[portal.exitPos.x];
  const exitPassable =
    exitTile &&
    !exitTile.unitId &&
    !exitTile.isLava &&
    exitTile.buildingId === null;

  if (!exitPassable) {
    portal.pendingTeleportUnitId = unitId;
    return false;
  }

  // Perform teleport.
  const entranceTile = state.grid[portal.entrancePos.y][portal.entrancePos.x];
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
    for (const portal of Object.values(state.portals)) {
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
  for (const portal of Object.values(state.portals)) {
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
  for (const [id, portal] of Object.entries(state.portals)) {
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
  for (const [id, portal] of Object.entries(state.portals)) {
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
  for (const [id, portal] of Object.entries(state.portals)) {
    const entranceLava = state.grid[portal.entrancePos.y]?.[portal.entrancePos.x]?.isLava;
    const exitLava = state.grid[portal.exitPos.y]?.[portal.exitPos.x]?.isLava;
    if (entranceLava || exitLava) {
      removePortalPair(state, id, events);
    }
  }
}
