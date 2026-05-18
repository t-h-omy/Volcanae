/**
 * Tile Status System — core API for reading and writing tile statuses.
 *
 * Exports:
 *   isStatusAllowedOnTerrain  – whitelist check
 *   clearTileStatus           – remove status (+ drowning side-effect)
 *   applyTileStatus           – set status (clears first, enforces whitelist)
 *   isUnitOnCorruptedTile     – tag-suppression query used by Part 5
 *   processTileStatusEndOfTurn – end-of-turn hook (no-op until Part 6)
 */

import type { Draft } from 'immer';
import { TileType, TileStatus, Faction, UnitTag } from './types';
import type { GameState, Position } from './types';
import type { GameEvent } from './gameEvents';
import { TILE_STATUS_WHITELIST, BURNING_TILE_DAMAGE } from './gameConfig';

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Returns true if the given status is whitelisted for the terrain type.
 */
export function isStatusAllowedOnTerrain(
  terrainType: TileType,
  status: TileStatus,
): boolean {
  const allowed = TILE_STATUS_WHITELIST[terrainType] ?? [];
  return allowed.includes(status);
}

// ============================================================================
// MUTATION HELPERS
// ============================================================================

/**
 * Clears the tile status. No-op if the tile has no status.
 *
 * Side effects:
 * - If FROZEN is cleared from a WATER tile that has a unit on it,
 *   the unit drowns: it is removed from the board and a UNIT_DEATH event
 *   is pushed (if an events array is provided).
 *
 * This side effect lives here (not in applyTileStatus) so it fires both
 * on a direct clear *and* on an overwrite via applyTileStatus.
 */
export function clearTileStatus(
  state: Draft<GameState>,
  position: Position,
  events?: GameEvent[],
): void {
  const tile = state.grid[position.y]?.[position.x];
  if (!tile || !tile.status) return;

  const wasFrozenWater =
    tile.status === TileStatus.FROZEN && tile.terrainType === TileType.WATER;

  tile.status = null;

  if (wasFrozenWater && tile.unitId) {
    const unitId = tile.unitId;
    const unit = state.units[unitId];
    if (unit) {
      if (events) {
        events.push({
          type: 'UNIT_DEATH',
          unitId,
          position: { x: unit.position.x, y: unit.position.y },
          faction: unit.faction,
        });
      }
      tile.unitId = null;
      delete state.units[unitId];
    }
  }
}

/**
 * Applies a tile status. Any existing status is always cleared first
 * (and its side effects fire, e.g., drowning). If the new status is not
 * whitelisted for the tile's terrain, only the existing status is cleared —
 * no new status is set.
 *
 * @returns true if the new status was written, false if only a clear occurred.
 */
export function applyTileStatus(
  state: Draft<GameState>,
  position: Position,
  newStatus: TileStatus,
  events?: GameEvent[],
): boolean {
  const tile = state.grid[position.y]?.[position.x];
  if (!tile) return false;

  // Step 1: Always clear the existing status first (triggers side effects).
  clearTileStatus(state, position, events);

  // Step 2: Enforce the whitelist on the terrain type.
  if (!isStatusAllowedOnTerrain(tile.terrainType, newStatus)) {
    return false;
  }

  // Step 3: Set the new status.
  tile.status = newStatus;
  return true;
}

// ============================================================================
// QUERY — TAG SUPPRESSION
// ============================================================================

/**
 * Returns true if a Player-faction unit is currently standing on a CORRUPTED
 * tile. Used by tag-suppression checks (Part 5). Enemy units are unaffected
 * by corruption in the current iteration.
 */
export function isUnitOnCorruptedTile(
  state: GameState | Draft<GameState>,
  unitId: string,
): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.faction !== Faction.PLAYER) return false;
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  return tile?.status === TileStatus.CORRUPTED;
}

// ============================================================================
// END-OF-TURN HOOK
// ============================================================================

/**
 * End-of-turn processing for tile statuses. Called once per player turn,
 * before the lava tick (Phase 3.5 in endPlayerTurn).
 *
 * BURNING: every non-LAVA unit standing on a BURNING tile takes
 * BURNING_TILE_DAMAGE hp. Units that die emit a UNIT_DEATH event.
 * A TILE_DAMAGE event is emitted for each unit that takes damage (for floaters).
 */
export function processTileStatusEndOfTurn(
  state: Draft<GameState>,
  events?: GameEvent[],
): void {
  // Collect IDs of units that die from burn damage; process after the scan loop
  // to avoid mutating the grid while we iterate it.
  const burnDying: Array<{ unitId: string; position: Position; faction: Faction }> = [];

  for (let y = 0; y < state.grid.length; y++) {
    for (let x = 0; x < state.grid[y].length; x++) {
      const tile = state.grid[y][x];
      if (tile.status !== TileStatus.BURNING) continue;
      if (!tile.unitId) continue;

      const unit = state.units[tile.unitId];
      if (!unit) continue;
      // LAVA-tagged units are immune to BURNING tile damage.
      if (unit.tags.includes(UnitTag.LAVA)) continue;

      const damage = Math.min(BURNING_TILE_DAMAGE, unit.stats.currentHp);
      unit.stats.currentHp -= damage;

      if (events) {
        events.push({
          type: 'TILE_DAMAGE',
          unitId: unit.id,
          position: { x: unit.position.x, y: unit.position.y },
          amount: damage,
        });
      }

      if (unit.stats.currentHp <= 0) {
        burnDying.push({
          unitId: unit.id,
          position: { x: unit.position.x, y: unit.position.y },
          faction: unit.faction,
        });
      }
    }
  }

  // Process deaths: remove dead units and emit UNIT_DEATH events.
  for (const { unitId, position, faction } of burnDying) {
    const tile = state.grid[position.y]?.[position.x];
    if (tile && tile.unitId === unitId) {
      tile.unitId = null;
    }
    if (faction === Faction.PLAYER) {
      state.gameStats.unitsLost += 1;
    }
    delete state.units[unitId];

    if (events) {
      events.push({
        type: 'UNIT_DEATH',
        unitId,
        position,
        faction,
      });
    }
  }
}
