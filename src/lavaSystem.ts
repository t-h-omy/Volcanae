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
export function advanceLava(state: Draft<GameState>): void {
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

    // Convert tile to lava; clear any ruins
    tile.isLava = true;
    tile.isLavaPreview = false;
    tile.isRuin = false;
    tile.isStrongholdRuin = false;

    // Destroy any unit on this tile
    if (tile.unitId !== null) {
      const unitId = tile.unitId;
      const unit = state.units[unitId];
      // Any enemy unit destroyed by lava advance increases threat level
      if (unit && unit.faction === Faction.ENEMY) {
        state.ember += 1;
      }
      if (unit && unit.faction === Faction.PLAYER) {
        state.gameStats.unitsLost += 1;
      }
      // Remove unit from state
      delete state.units[unitId];
      // Clear unit from tile
      tile.unitId = null;
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

        // Handle specialist storage
        if (building.specialistSlot !== null) {
          const specialistId = building.specialistSlot;

          if (building.faction === Faction.PLAYER) {
            // Player building: specialist goes to global storage
            const specialist = state.specialists[specialistId];
            if (specialist) {
              specialist.assignedBuildingId = null;
              state.globalSpecialistStorage.push(specialistId);
            }
          } else {
            // Enemy building or neutral: specialist is lost
            delete state.specialists[specialistId];
          }
        }

        // Remove building from state
        delete state.buildings[buildingId];
        // Note: resonance for surviving crystal chambers is NOT applied here.
        // It is applied to the resolvedState in advanceLavaWithEvents so that
        // the live state only transitions to the active sprite when the
        // per-chamber RESONANCE_TRIGGERED animation VFX fires.
      }

      // Clear building from tile
      tile.buildingId = null;
    }
  }

  // Update lava preview for next rows
  updateLavaPreview(state);
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

  let newState = produce(state, (draft) => {
    advanceLava(draft);
  });

  const events: GameEvent[] = [
    {
      type: 'LAVA_ADVANCE',
      newLavaRow,
      destroyedUnitIds,
      destroyedBuildingIds,
    },
  ];

  // If a Crystal Chamber was destroyed, emit RESONANCE_TRIGGERED so the camera
  // pans to each surviving chamber that just got activated.
  if (destroyedChamberPosition) {
    const survivingChamberIds: string[] = [];
    for (const b of Object.values(newState.buildings)) {
      if (b.faction === Faction.PLAYER && b.type === BuildingType.CRYSTAL_CHAMBER) {
        survivingChamberIds.push(b.id);
      }
    }
    if (survivingChamberIds.length > 0) {
      // Apply resonance to the resolvedState for surviving chambers.
      // advanceLava intentionally does NOT set resonanceTurnsRemaining so that the
      // live state only switches to the active sprite when the per-chamber VFX fires
      // in the animation engine (via activateCrystalChamber).  The resolvedState
      // (applied at the very end of the animation sequence) must still reflect the
      // activated chambers so the final state is correct.
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
      });
      events.push({
        type: 'RESONANCE_TRIGGERED',
        destroyedChamberPosition,
        survivingChamberIds,
        resonanceDuration: CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
      });
    }
  }

  return { newState, events };
}
