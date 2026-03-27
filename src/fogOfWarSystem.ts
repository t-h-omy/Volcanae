/**
 * Fog of War system module for Volcanae.
 * Implements tile discovery using player unit vision.
 *
 * Rules:
 * - Tiles are either not-discovered or discovered (no fog of war once seen)
 * - Only player units discover tiles within their visionRange
 * - Player buildings do NOT auto-discover tiles
 * - Once a tile is discovered (isRevealed true), it stays discovered permanently
 * - Undiscovered tiles: shown as light grey with a cloud emoji
 * - Discovered tiles: always fully visible
 */

import type { GameState } from './types';
import type { Draft } from 'immer';
import { Faction } from './types';
import { MAP } from './gameConfig';
import { getTilesWithinEdgeCircleRange } from './rangeUtils';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Converts a position to a string key for Set storage.
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns String key in format "x,y"
 */
function positionToKey(x: number, y: number): string {
  return `${x},${y}`;
}

// ============================================================================
// VISIBILITY CALCULATION
// ============================================================================

/**
 * Gets all tiles currently visible to the player.
 * A tile is visible if it is within the vision range of any player unit.
 * Vision range is determined using the edge-circle range system.
 *
 * @param state - Current game state
 * @returns Set of "x,y" string keys representing currently visible tiles
 */
export function getVisibleTiles(
  state: GameState | Draft<GameState>
): Set<string> {
  const visibleTiles = new Set<string>();

  // Only player units reveal tiles (buildings do not auto-discover zones)
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER) {
      // Include the unit's own tile
      visibleTiles.add(positionToKey(unit.position.x, unit.position.y));
      // Include all tiles within edge-circle vision range
      const tilesInRange = getTilesWithinEdgeCircleRange(
        unit.position.x,
        unit.position.y,
        unit.stats.visionRange,
        MAP.GRID_WIDTH,
        MAP.GRID_HEIGHT,
      );
      for (const { x, y } of tilesInRange) {
        visibleTiles.add(positionToKey(x, y));
      }
    }
  }

  return visibleTiles;
}

// ============================================================================
// FOG OF WAR UPDATE
// ============================================================================

/**
 * Updates tile discovery state based on current player unit positions.
 * - Marks tiles within player unit vision range as discovered (isRevealed = true)
 * - Once revealed, tiles are never hidden again
 * - Buildings do not contribute to discovery
 *
 * This function mutates the draft state directly (immer pattern).
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function updateFogOfWar(state: Draft<GameState>): void {
  // Get currently visible tiles
  const visibleTiles = getVisibleTiles(state);

  // Mark visible tiles as permanently discovered
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const key = positionToKey(x, y);
      if (visibleTiles.has(key)) {
        state.grid[y][x].isRevealed = true;
      }
    }
  }
}
