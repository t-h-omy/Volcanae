/**
 * buildingRemoval.ts
 *
 * Single shared cleanup hook that must be invoked at every code path which
 * removes a building from `state.buildings`. Currently this handles
 * "life-bound" units — most prominently the Crystal Drake, whose existence is
 * bound to its Crystal Cave via `roostBuildingId`.
 *
 * Centralising this prevents any removal path (lava consumption, capture,
 * conversion, demolition, combat destruction, sanctum collapse, spell-induced
 * removal, etc.) from leaving an orphaned drake roaming the map after its
 * cave has ceased to exist.
 *
 * **Call this BEFORE deleting the building** so that the caller may still
 * look up the building object if needed (the helper itself does not delete
 * the building, only the units bound to it). Callers must still do:
 *
 *     cleanupRoostedUnits(state, buildingId);
 *     delete state.buildings[buildingId];
 *
 * (Tile-side `buildingId` clearing remains the caller's responsibility, as
 * different callers handle tile bookkeeping differently.)
 */

import type { GameState } from './types';
import { Faction } from './types';

/** Minimal info needed to emit a UNIT_DEATH event for a removed roosted unit. */
export interface RoostedUnitDeath {
  unitId: string;
  position: { x: number; y: number };
  faction: typeof Faction[keyof typeof Faction];
}

/**
 * Returns info about every unit whose `roostBuildingId` matches the supplied
 * building id, WITHOUT mutating state. Use this before calling
 * `cleanupRoostedUnits` when you need to emit UNIT_DEATH events for the
 * removed units.
 */
export function getRoostedUnits(
  state: GameState,
  buildingId: string,
): RoostedUnitDeath[] {
  const result: RoostedUnitDeath[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.roostBuildingId !== buildingId) continue;
    result.push({ unitId: unit.id, position: { x: unit.position.x, y: unit.position.y }, faction: unit.faction });
  }
  return result;
}

/**
 * Remove every unit whose `roostBuildingId` matches the supplied building id.
 *
 * - Deletes the unit from `state.units`.
 * - Clears the corresponding tile's `unitId` if it still points at the unit.
 * - Increments `gameStats.unitsLost` for each player-faction unit removed
 *   (mirroring existing unit-removal bookkeeping; SUMMONED units count as
 *   lost when their host is destroyed because they did exist on the field).
 *
 * Returns an array of `RoostedUnitDeath` records for callers that need them.
 *
 * Safe to call when no roosted units exist (returns [] in that case).
 *
 * Works on both plain `GameState` (direct mutation contexts) and Immer
 * `Draft<GameState>` (the operations are simple object/property assignments
 * supported by both).
 */
export function cleanupRoostedUnits(
  state: GameState,
  buildingId: string,
): RoostedUnitDeath[] {
  const deaths: RoostedUnitDeath[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.roostBuildingId !== buildingId) continue;

    // Clear the tile reference if the unit is still on the map.
    const tile = state.grid[unit.position.y]?.[unit.position.x];
    if (tile && tile.unitId === unit.id) {
      tile.unitId = null;
    }

    if (unit.faction === Faction.PLAYER) {
      state.gameStats.unitsLost += 1;
    }

    deaths.push({ unitId: unit.id, position: { x: unit.position.x, y: unit.position.y }, faction: unit.faction });
    delete state.units[unit.id];
  }
  return deaths;
}
