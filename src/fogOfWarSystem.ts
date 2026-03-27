/**
 * Fog of War system module for Volcanae.
 * Implements vision calculation and fog of war state management.
 *
 * Rules:
 * - Each tile has isRevealed (ever seen before) and isInFogOfWar (currently not visible)
 * - Vision is calculated using manhattan distance
 * - Player units reveal tiles within their visionRange
 * - Player buildings reveal tiles within their visionRange
 * - Enemy units and buildings do NOT reveal fog for the player
 * - Once a tile is revealed (isRevealed true), it stays revealed permanently
 * - Unrevealed tiles: completely hidden (show as dark tile)
 * - Revealed + in fog: show terrain only, no live unit or building state
 * - Visible (revealed + in vision range of player unit/building): show everything
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { Faction } from './types';
import { MAP, BUILDINGS } from './gameConfig';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates the manhattan distance between two positions.
 * @param a - First position
 * @param b - Second position
 * @returns Manhattan distance between the two positions
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

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
 * A tile is visible if it is within the vision range of any player unit or player building.
 *
 * @param state - Current game state
 * @returns Set of "x,y" string keys representing currently visible tiles
 */
export function getVisibleTiles(
  state: GameState | Draft<GameState>
): Set<string> {
  const visibleTiles = new Set<string>();

  // Collect all vision sources (player units and player buildings)
  const visionSources: Array<{ position: Position; visionRange: number }> = [];

  // Add player units as vision sources
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER) {
      visionSources.push({
        position: unit.position,
        visionRange: unit.stats.visionRange,
      });
    }
  }

  // Add player buildings as vision sources
  for (const building of Object.values(state.buildings)) {
    if (building.faction === Faction.PLAYER) {
      visionSources.push({
        position: building.position,
        visionRange: BUILDINGS.BUILDING_VISION_RANGE,
      });
    }
  }

  // Calculate visible tiles for each vision source
  for (const source of visionSources) {
    const { position, visionRange } = source;

    // Check all tiles within vision range (manhattan distance)
    for (let dx = -visionRange; dx <= visionRange; dx++) {
      for (let dy = -visionRange; dy <= visionRange; dy++) {
        const targetX = position.x + dx;
        const targetY = position.y + dy;

        // Check bounds
        if (
          targetX < 0 ||
          targetX >= MAP.GRID_WIDTH ||
          targetY < 0 ||
          targetY >= MAP.GRID_HEIGHT
        ) {
          continue;
        }

        // Check manhattan distance
        const targetPos: Position = { x: targetX, y: targetY };
        if (manhattanDistance(position, targetPos) <= visionRange) {
          visibleTiles.add(positionToKey(targetX, targetY));
        }
      }
    }
  }

  return visibleTiles;
}

// ============================================================================
// FOG OF WAR UPDATE
// ============================================================================

/**
 * Updates the fog of war state for all tiles based on current unit and building positions.
 * - Calculates which tiles are currently visible to the player
 * - Marks visible tiles as revealed (permanently) and not in fog
 * - Marks non-visible tiles as in fog (but keeps isRevealed status)
 *
 * This function mutates the draft state directly (immer pattern).
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function updateFogOfWar(state: Draft<GameState>): void {
  // Get currently visible tiles
  const visibleTiles = getVisibleTiles(state);

  // Update all tiles
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const tile = state.grid[y][x];
      const key = positionToKey(x, y);
      const isVisible = visibleTiles.has(key);

      if (isVisible) {
        // Tile is currently visible
        tile.isRevealed = true; // Permanently revealed
        tile.isInFogOfWar = false; // Not in fog
      } else {
        // Tile is not currently visible
        // isRevealed stays as is (once revealed, always revealed)
        tile.isInFogOfWar = true; // In fog
      }
    }
  }
}
