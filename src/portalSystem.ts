/**
 * Portal system for Volcanae.
 *
 * Implements the EMBER_PORTAL mechanic for the RIFT_LORD unit.
 * The caster places a portal pair: an entrance tile adjacent to itself and
 * an exit tile deep in the player backline. Enemy units (except the caster
 * and SACRIFICIAL units) that step onto the entrance are teleported to the exit.
 *
 * Map orientation reminder:
 *   - Zone 1 (player stronghold) is at HIGH Y (south).
 *   - Zone 5 (enemy territory) is at LOW Y (north).
 *   - Enemies move southward (increasing Y) to attack the player.
 *   - The portal exit is placed SOUTH of the player frontline
 *     (higher Y = closer to the stronghold).
 */

import type { Draft } from 'immer';
import type { GameState, Portal, Position } from './types';
import { Faction, TileType } from './types';
import { TileStatus } from './types';
import {
  EMBER_PORTAL_EXIT_RANGE,
  EMBER_PORTAL_MIN_DISTANCE_SOUTH_OF_FRONTLINE,
  EMBER_PORTAL_USE_COOLDOWN_TURNS,
  EMBER_PORTAL_LIFETIME_TURNS,
  EMBER_PORTAL_MAX_PER_CASTER,
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
 * - Not CANYON terrain
 * - No building (enemy or player) and no ruin
 * - No other portal exit already on this tile
 */
function isValidExitTile(state: Draft<GameState>, x: number, y: number): boolean {
  if (x < 0 || x >= MAP.GRID_WIDTH || y < 0 || y >= MAP.GRID_HEIGHT) return false;
  const tile = state.grid[y][x];
  if (tile.isLava) return false;
  if (tile.terrainType === TileType.CANYON) return false;
  if (tile.buildingId !== null) return false;
  if (tile.isStrongholdRuin || tile.isRuin) return false;
  // No other portal exit already here
  for (const portal of Object.values(state.portals)) {
    if (portal.exitPos.x === x && portal.exitPos.y === y) return false;
  }
  return true;
}

/**
 * Returns true if the tile at (x, y) is a valid portal entrance candidate:
 * - In-bounds
 * - Not lava
 * - Not CANYON terrain
 * - No building and no ruin
 * - Not already a portal entrance
 * - No occupying unit (entrance must be empty so a unit can enter it)
 */
function isValidEntranceTile(state: Draft<GameState>, x: number, y: number): boolean {
  if (x < 0 || x >= MAP.GRID_WIDTH || y < 0 || y >= MAP.GRID_HEIGHT) return false;
  const tile = state.grid[y][x];
  if (tile.isLava) return false;
  if (tile.terrainType === TileType.CANYON) return false;
  if (tile.buildingId !== null) return false;
  if (tile.isStrongholdRuin || tile.isRuin) return false;
  if (tile.unitId !== null) return false;
  // No other portal entrance already here
  for (const portal of Object.values(state.portals)) {
    if (portal.entrancePos.x === x && portal.entrancePos.y === y) return false;
  }
  return true;
}

/**
 * Find the southernmost row (highest Y) that has at least one Player unit.
 * Returns -1 if no player units are present.
 */
function getPlayerFrontlineRow(state: Draft<GameState>): number {
  let frontline = -1;
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER && unit.position.y > frontline) {
      frontline = unit.position.y;
    }
  }
  return frontline;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Determines if a hexcaster should cast a portal this turn.
 * Returns the planned entrance/exit positions, or null if no cast is possible.
 *
 * Planning logic:
 * 1. Check caster cooldown (portalCastCooldownUntil).
 * 2. Count active portals for this caster. If >= EMBER_PORTAL_MAX_PER_CASTER,
 *    expire the oldest one to make room.
 * 3. Find the player frontline row and compute the minimum exit Y.
 * 4. Candidate exit tiles: within EMBER_PORTAL_EXIT_RANGE (edge-circle) of
 *    the caster, south of minimum exit Y, valid for exit.
 * 5. Entrance tile: an empty Chebyshev-1 neighbour of the caster, valid for entrance.
 */
export function tryPlanPortalCast(
  state: Draft<GameState>,
  casterId: string,
): { entrancePos: Position; exitPos: Position } | null {
  const caster = state.units[casterId];
  if (!caster) return null;

  // Check cooldown
  if (caster.portalCastCooldownUntil != null && caster.portalCastCooldownUntil > state.turn) {
    return null;
  }

  // Count active portals owned by this caster
  const casterPortals = Object.values(state.portals).filter(p => p.casterId === casterId);
  if (casterPortals.length >= EMBER_PORTAL_MAX_PER_CASTER) {
    // Expire the oldest portal to make room
    const oldest = casterPortals.reduce((a, b) => a.createdTurn < b.createdTurn ? a : b);
    delete state.portals[oldest.id];
  }

  // Determine minimum exit Y: player frontline row + offset
  const frontlineRow = getPlayerFrontlineRow(state);
  if (frontlineRow < 0) return null; // No player units → no target
  const minExitY = frontlineRow + EMBER_PORTAL_MIN_DISTANCE_SOUTH_OF_FRONTLINE;
  if (minExitY >= MAP.GRID_HEIGHT) return null; // Off map

  const { x: cx, y: cy } = caster.position;

  // Find a valid exit tile within edge-circle range that is south of the threshold
  let chosenExit: Position | null = null;
  for (let ty = minExitY; ty < MAP.GRID_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP.GRID_WIDTH; tx++) {
      if (!isTileWithinEdgeCircleRange(cx, cy, tx, ty, EMBER_PORTAL_EXIT_RANGE)) continue;
      if (!isValidExitTile(state, tx, ty)) continue;
      chosenExit = { x: tx, y: ty };
      break;
    }
    if (chosenExit) break;
  }
  if (!chosenExit) return null;

  // Find a valid entrance tile adjacent (Chebyshev 1) to the caster
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

  return { entrancePos: chosenEntrance, exitPos: chosenExit };
}

/**
 * Executes a portal cast: creates the Portal record, applies CORRUPTED to the
 * exit tile, and emits a PORTAL_CREATED event.
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
    expiresTurn: state.turn + EMBER_PORTAL_LIFETIME_TURNS,
    usableFromTurn: state.turn + EMBER_PORTAL_USE_COOLDOWN_TURNS,
  };

  state.portals[id] = portal;

  // One-turn cast cooldown
  caster.portalCastCooldownUntil = state.turn + 1;

  // Corrupt the exit tile
  applyTileStatus(state, exitPos, TileStatus.CORRUPTED, events);

  events?.push({
    type: 'PORTAL_CREATED',
    casterId,
    portalId: id,
    entrancePos: { x: entrancePos.x, y: entrancePos.y },
    exitPos: { x: exitPos.x, y: exitPos.y },
  });
}

/**
 * Returns the active, usable portal whose entrance tile matches `pos`, or null.
 * A portal is usable if state.turn >= portal.usableFromTurn and not yet expired.
 */
export function getUsablePortalAtEntrance(state: GameState, pos: Position): Portal | null {
  for (const portal of Object.values(state.portals)) {
    if (portal.entrancePos.x === pos.x && portal.entrancePos.y === pos.y) {
      if (state.turn >= portal.usableFromTurn && state.turn < portal.expiresTurn) {
        return portal;
      }
    }
  }
  return null;
}

/**
 * Removes expired portals and portals whose caster has died.
 * Called at the start of each enemy turn. Emits PORTAL_CLOSED for each removed portal.
 */
export function cleanupPortals(state: Draft<GameState>, events?: GameEvent[]): void {
  for (const [id, portal] of Object.entries(state.portals)) {
    const expired = portal.expiresTurn <= state.turn;
    const casterDead = !state.units[portal.casterId];
    if (expired || casterDead) {
      events?.push({
        type: 'PORTAL_CLOSED',
        portalId: id,
        position: { x: portal.entrancePos.x, y: portal.entrancePos.y },
      });
      delete state.portals[id];
    }
  }
}
