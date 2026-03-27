/**
 * Fog of War system module for Volcanae.
 * Implements vision calculation and fog of war state management.
 *
 * Rules:
 * - Each tile has isRevealed (ever seen before) and isInFogOfWar (currently not visible)
 * - Vision is calculated using the edge-circle range system
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
 * A tile is visible if it is within the vision range of any player unit or player building.
 * Vision range is determined using the edge-circle range system.
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

  // Calculate visible tiles for each vision source using edge-circle range
  for (const source of visionSources) {
    const { position, visionRange } = source;
    // Include the source tile itself
    visibleTiles.add(positionToKey(position.x, position.y));
    // Include all tiles within edge-circle range
    const tilesInRange = getTilesWithinEdgeCircleRange(
      position.x,
      position.y,
      visionRange,
      MAP.GRID_WIDTH,
      MAP.GRID_HEIGHT,
    );
    for (const { x, y } of tilesInRange) {
      visibleTiles.add(positionToKey(x, y));
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
