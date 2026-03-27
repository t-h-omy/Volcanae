/**
 * Lava system module for Volcanae.
 * Implements lava advancement, destruction of units/buildings, and preview tiles.
 *
 * Rules:
 * - Lava starts below the map (lavaFrontRow = -1)
 * - Rows 0 to 4 are the lava buffer - lava advances through these first
 * - Lava advances 1 row northward every LAVA_ADVANCE_INTERVAL player turns (default 2)
 * - Lava phase happens between turns (after player ends turn, before next turn starts)
 * - When lava advances to row N:
 *   - All tiles at row N become isLava: true
 *   - Any unit (player or enemy) on row N is instantly destroyed
 *   - Any building on row N is instantly destroyed
 *   - If destroyed building had an assigned specialist AND belonged to player: specialist goes to globalSpecialistStorage
 *   - If destroyed building had an assigned specialist AND belonged to enemy: specialist is lost
 * - Lava preview: next LAVA_ADVANCE_INTERVAL rows above current lava front are marked isLavaPreview: true
 * - Units cannot move into lava tiles
 */

import type { GameState } from './types';
import type { Draft } from 'immer';
import { Faction } from './types';
import { MAP, LAVA } from './gameConfig';

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
 * The next LAVA_ADVANCE_INTERVAL rows above the current lava front are marked isLavaPreview: true.
 * All other tiles have isLavaPreview set to false.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
function updateLavaPreview(state: Draft<GameState>): void {
  const lavaFrontRow = state.lavaFrontRow;
  const previewRows = LAVA.LAVA_ADVANCE_INTERVAL;

  // Clear all preview markers first
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      state.grid[y][x].isLavaPreview = false;
    }
  }

  // Mark preview rows (rows above lava front up to LAVA_ADVANCE_INTERVAL)
  for (let i = 1; i <= previewRows; i++) {
    const previewRow = lavaFrontRow + i;
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
 * Advances lava by 1 row northward.
 * - Converts all tiles in the new lava row to lava
 * - Destroys any units on that row
 * - Destroys any buildings on that row
 * - Handles specialist storage (player specialists go to global storage, enemy specialists are lost)
 * - Updates lava preview tiles
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function advanceLava(state: Draft<GameState>): void {
  // Advance lava front row
  const newLavaRow = state.lavaFrontRow + 1;

  // If lava has reached beyond the grid, no need to advance further
  if (newLavaRow >= MAP.GRID_HEIGHT) {
    return;
  }

  // Update lava front row
  state.lavaFrontRow = newLavaRow;

  // Process all tiles in the new lava row
  for (let x = 0; x < MAP.GRID_WIDTH; x++) {
    const tile = state.grid[newLavaRow][x];

    // Convert tile to lava
    tile.isLava = true;
    tile.isLavaPreview = false;

    // Destroy any unit on this tile
    if (tile.unitId !== null) {
      const unitId = tile.unitId;
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
    state.turnsUntilLavaAdvance = LAVA.LAVA_ADVANCE_INTERVAL;

    return true;
  }

  return false;
}
