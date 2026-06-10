/**
 * Lava system module for Volcanae.
 * Implements lava advancement, destruction of units/buildings, and preview tiles.
 *
 * Rules:
 * - Lava starts beyond the south edge of the map (lavaFrontRow = MAP.GRID_HEIGHT)
 * - The lava buffer occupies the southernmost rows (GRID_HEIGHT - LAVA_BUFFER_ROWS .. GRID_HEIGHT - 1)
 * - Lava advances 1 row northward (decreasing Y) every LAVA_ADVANCE_INTERVAL player turns (default 3)
 * - Lava phase happens between turns (after player ends turn, before next turn starts)
 * - When lava advances to row N:
 *   - All tiles at row N become isLava: true
 *   - Any unit (player or enemy) on row N is instantly destroyed
 *   - Any building on row N is instantly destroyed
 *   - If destroyed building had an assigned specialist AND belonged to player: specialist goes to globalSpecialistStorage
 *   - If destroyed building had an assigned specialist AND belonged to enemy: specialist is lost
 * - Lava preview: next LAVA_ADVANCE_INTERVAL rows north of current lava front are marked isLavaPreview: true
 * - Units cannot move into lava tiles
 */

import type { GameState } from './types';
import type { Draft } from 'immer';
import { produce } from 'immer';
import { Faction, BuildingType } from './types';
import { MAP, TECH, CRYSTAL_CHAMBER_CONFIG, getLavaAdvanceInterval } from './gameConfig';
import type { GameEvent } from './gameEvents';
import { grantArcaneCrystals } from './techSystem';
import { removePortalsOnLava } from './portalSystem';
import { cleanupRoostedUnits, getRoostedUnits } from './buildingRemoval';

// ============================================================================
// LAVA STATE QUERIES
// ============================================================================

/**
 * Checks if it is time for lava to advance.
 * @param state - Current game state
 * @returns True if turnsUntilLavaAdvance has reached 0
 */
export function shouldLavaAdvance(
  state: GameState | Draft<GameState>
): boolean {
  return state.turnsUntilLavaAdvance <= 0;
}

// ============================================================================
// LAVA PREVIEW UPDATE
// ============================================================================

/**
 * Updates the lava preview tiles on the grid.
 * The next LAVA_ADVANCE_INTERVAL rows north of the current lava front are marked isLavaPreview: true.
 * All other tiles have isLavaPreview set to false.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
function updateLavaPreview(state: Draft<GameState>): void {
  const lavaFrontRow = state.lavaFrontRow;
  const previewRows = getLavaAdvanceInterval(state.difficulty);

  // Clear all preview markers first
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      state.grid[y][x].isLavaPreview = false;
    }
  }

  // Mark preview rows (rows north of lava front, i.e. decreasing Y)
  for (let i = 1; i <= previewRows; i++) {
    const previewRow = lavaFrontRow - i;
    // Only mark valid rows
    if (previewRow >= 0 && previewRow < MAP.GRID_HEIGHT) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        // Don't mark tiles that are already lava
        if (!state.grid[previewRow][x].isLava) {
          state.grid[previewRow][x].isLavaPreview = true;
        }
      }
    }
  }
}

// ============================================================================
// LAVA ADVANCEMENT
// ============================================================================

/**
 * Advances lava by 1 row northward (decreasing Y).
 * - Converts all tiles in the new lava row to lava
 * - Destroys any units on that row
 * - Destroys any buildings on that row
 * - Handles specialist storage (player specialists go to global storage, enemy specialists are lost)
 * - Updates lava preview tiles
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function advanceLava(state: Draft<GameState>, outEvents?: GameEvent[], skipRoostedCleanup?: boolean): void {
  // Advance lava front row (northward = decreasing Y)
  const newLavaRow = state.lavaFrontRow - 1;

  // If lava has reached beyond the grid, no need to advance further
  if (newLavaRow < 0) {
    return;
  }

  // Update lava front row
  state.lavaFrontRow = newLavaRow;

  // Process all tiles in the new lava row
  for (let x = 0; x < MAP.GRID_WIDTH; x++) {
    const tile = state.grid[newLavaRow][x];
    const tileId = `${x},${newLavaRow}`;

    // Convert tile to lava; clear any ruins, status, or frozen overlay.
    // Note: we directly null the status here rather than calling clearTileStatus()
    // because the lava will consume the tile anyway — the drown side-effect from
    // thawing FROZEN water would be redundant (the unit is destroyed below).
    tile.isLava = true;
    tile.isLavaPreview = false;
    tile.status = null;
    tile.isRuin = false;
    tile.isStrongholdRuin = false;

    // Clear hasCaveMonster flag — the mountain is consumed, no popup
    if (tile.hasCaveMonster) {
      tile.hasCaveMonster = false;
    }

    // Silently remove any active cave encounter on this tile
    const encounterIdx = state.activeCaveEncounters.findIndex(
      (e) => e.mountainTileId === tileId
    );
    if (encounterIdx !== -1) {
      const encounter = state.activeCaveEncounters[encounterIdx];
      // Remove the cave monster unit (silent — no death animation, no hire modal)
      delete state.units[encounter.monsterId];
      // Ensure tile's unitId is cleared if it matches the monster
      if (tile.unitId === encounter.monsterId) {
        tile.unitId = null;
      }
      // Remove the encounter entry
      state.activeCaveEncounters.splice(encounterIdx, 1);
    }

    // Destroy any unit on this tile
    if (tile.unitId !== null) {
      const unitId = tile.unitId;
      const unit = state.units[unitId];
      // Units in UNDERGROUND or EMERGING tunnel states are below the surface —
      // they are immune to lava advance on their tile grid position.
      if (unit && (unit.tunnelState === 'UNDERGROUND' || unit.tunnelState === 'EMERGING')) {
        tile.unitId = null; // The hole/tile is consumed but the unit survives
      } else {
        // Any enemy unit destroyed by lava advance increases threat level
        if (unit && unit.faction === Faction.ENEMY) {
          state.ember += 1;
          state.emberLevelSources.other += 1;
        }
        if (unit && unit.faction === Faction.PLAYER) {
          state.gameStats.unitsLost += 1;
        }
        // Remove unit from state
        delete state.units[unitId];
        // Clear unit from tile
        tile.unitId = null;
      }
    }

    // Destroy any building on this tile
    if (tile.buildingId !== null) {
      const buildingId = tile.buildingId;
      const building = state.buildings[buildingId];

      if (building) {
        // Grant tech pick when player building is consumed by lava
        if (building.faction === Faction.PLAYER) {
          grantArcaneCrystals(state, TECH.CRYSTALS_ON_LAVA_CONSUMPTION);
          state.gameStats.buildingsDestroyedByLava += 1;
        }

        // Collect life-bound units BEFORE removal so we can emit UNIT_DEATH events.
        const roosted = outEvents ? getRoostedUnits(state, buildingId) : [];

        // Remove building from state. When skipRoostedCleanup is true (display-state
        // applyEvent path), leave roosted units alive so the queued UNIT_DEATH events
        // can animate their deaths and let the auto-cam pan to them.  In all other
        // paths (resolved-state computation, debug) we clean up immediately.
        if (!skipRoostedCleanup) {
          cleanupRoostedUnits(state, buildingId);
        }
        delete state.buildings[buildingId];
        // Note: resonance for surviving crystal chambers is NOT applied here.
        // It is applied to the resolvedState in advanceLavaWithEvents so that
        // the live state only transitions to the active sprite when the
        // per-chamber RESONANCE_TRIGGERED animation VFX fires.

        // Emit UNIT_DEATH for any life-bound drakes so the auto-cam tracks them.
        if (outEvents && roosted.length > 0) {
          for (const death of roosted) {
            outEvents.push({
              type: 'UNIT_DEATH',
              unitId: death.unitId,
              position: death.position,
              faction: death.faction,
            });
          }
        }
      }

      // Clear building from tile
      tile.buildingId = null;
    }
  }

  // Update lava preview for next rows
  updateLavaPreview(state);

  // Clear stale tunnel references for underground units whose dig-in position
  // has just been consumed by lava. These units exist in state.units with no
  // tile reference (tile.unitId was cleared when they dug in), so the tile loop
  // above does not reach them. Clear tunnelStartPosition so that the hole-sprite
  // overlay is not rendered on a lava tile.
  for (const unit of Object.values(state.units)) {
    if (unit.tunnelState !== 'UNDERGROUND' && unit.tunnelState !== 'EMERGING') continue;
    if (unit.tunnelStartPosition && unit.tunnelStartPosition.y === newLavaRow) {
      unit.tunnelStartPosition = null;
    }
    if (unit.tunnelPlannedEmergence && unit.tunnelPlannedEmergence.y === newLavaRow) {
      unit.tunnelPlannedEmergence = null;
    }
  }

  // Remove any portal pair whose entrance or exit tile is now lava.
  removePortalsOnLava(state, outEvents);
}

// ============================================================================
// LAVA TICK (MAIN ENTRY POINT)
// ============================================================================

/**
 * Ticks the lava system between turns (after player ends turn, before next turn starts).
 * - Decrements turnsUntilLavaAdvance
 * - If counter reaches 0 or less, advances lava and resets counter
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @returns True if lava advanced this tick
 */
export function tickLava(state: Draft<GameState>): boolean {
  // Decrement the counter
  state.turnsUntilLavaAdvance -= 1;

  // Check if lava should advance (counter reached 0 or below)
  if (shouldLavaAdvance(state)) {
    // Advance lava
    advanceLava(state);

    // Reset the counter
    state.turnsUntilLavaAdvance = getLavaAdvanceInterval(state.difficulty);

    return true;
  }

  return false;
}

// ============================================================================
// LAVA ADVANCE WITH EVENTS (for animation system)
// ============================================================================

/**
 * Advances lava by 1 row and returns the new state alongside a LAVA_ADVANCE event.
 * Used by the animation event-queue system.
 *
 * @param state - Plain (non-draft) game state
 * @returns Object with newState and LAVA_ADVANCE event
 */
export function advanceLavaWithEvents(state: GameState): { newState: GameState; events: GameEvent[] } {
  const newLavaRow = state.lavaFrontRow - 1;
  const destroyedUnitIds: string[] = [];
  const destroyedBuildingIds: string[] = [];

  // Collect what will be destroyed before applying
  if (newLavaRow >= 0 && newLavaRow < MAP.GRID_HEIGHT) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const tile = state.grid[newLavaRow][x];
      if (tile.unitId) destroyedUnitIds.push(tile.unitId);
      if (tile.buildingId) destroyedBuildingIds.push(tile.buildingId);
    }
  }

  // Check if a player Crystal Chamber will be destroyed (triggers resonance)
  let destroyedChamberPosition: { x: number; y: number } | null = null;
  for (const bId of destroyedBuildingIds) {
    const b = state.buildings[bId];
    if (b && b.faction === Faction.PLAYER && b.type === BuildingType.CRYSTAL_CHAMBER) {
      destroyedChamberPosition = { x: b.position.x, y: b.position.y };
      break;
    }
  }

  let portalEvents: GameEvent[] = [];
  let newState = produce(state, (draft) => {
    advanceLava(draft, portalEvents);
  });

  const events: GameEvent[] = [
    {
      type: 'LAVA_ADVANCE',
      newLavaRow,
      destroyedUnitIds,
      destroyedBuildingIds,
      ...(destroyedChamberPosition ? { destroyedChamberPosition } : {}),
    },
    ...portalEvents,
  ];

  // If a Crystal Chamber was destroyed, emit RESONANCE_TRIGGERED so the camera
  // pans to each surviving chamber that just got activated. Crystal Caves
  // share the same resonance window — they are listed via the parallel
  // `survivingCaveIds` field so the animation engine can pan + activate them.
  if (destroyedChamberPosition) {
    const survivingChamberIds: string[] = [];
    const survivingCaveIds: string[] = [];
    for (const b of Object.values(newState.buildings)) {
      if (b.faction !== Faction.PLAYER) continue;
      if (b.type === BuildingType.CRYSTAL_CHAMBER) {
        survivingChamberIds.push(b.id);
      } else if (b.type === BuildingType.CRYSTAL_CAVE) {
        survivingCaveIds.push(b.id);
      }
    }
    if (survivingChamberIds.length > 0 || survivingCaveIds.length > 0) {
      // Apply resonance to the resolvedState for surviving chambers AND caves.
      // advanceLava intentionally does NOT set resonanceTurnsRemaining so that the
      // live state only switches to the active sprite when the per-building VFX fires
      // in the animation engine (via activateCrystalChamber / activateCrystalCave).
      // The resolvedState (applied at the very end of the animation sequence) must
      // still reflect the activated buildings so the final state is correct.
      newState = produce(newState, (draft) => {
        for (const bId of survivingChamberIds) {
          const b = draft.buildings[bId];
          if (b) {
            b.resonanceTurnsRemaining = Math.max(
              b.resonanceTurnsRemaining,
              CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
            );
          }
        }
        for (const bId of survivingCaveIds) {
          const b = draft.buildings[bId];
          if (b) {
            b.resonanceTurnsRemaining = Math.max(
              b.resonanceTurnsRemaining,
              CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
            );
          }
        }
      });
      events.push({
        type: 'RESONANCE_TRIGGERED',
        destroyedChamberPosition,
        survivingChamberIds,
        survivingCaveIds,
        resonanceDuration: CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
      });
    }
  }

  return { newState, events };
}
