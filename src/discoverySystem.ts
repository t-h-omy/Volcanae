/**
 * Tile discovery system module for Volcanae.
 * Implements tile discovery using player unit presence.
 *
 * Rules:
 * - Tiles are either undiscovered or discovered
 * - Only player units discover tiles within their discoverRadius
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
// DISCOVERABLE TILES CALCULATION
// ============================================================================

/**
 * Gets all tiles currently discoverable by the player.
 * A tile is discoverable if it is within the discover radius of any player unit.
 * Discover radius is determined using the edge-circle range system.
 *
 * @param state - Current game state
 * @returns Set of "x,y" string keys representing currently discoverable tiles
 */
export function getDiscoverableTiles(
  state: GameState | Draft<GameState>
): Set<string> {
  const discoverableTiles = new Set<string>();

  // Only player units discover tiles (buildings do not auto-discover zones)
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER) {
      // Include the unit's own tile
      discoverableTiles.add(positionToKey(unit.position.x, unit.position.y));
      // Include all tiles within edge-circle discover radius
      const tilesInRange = getTilesWithinEdgeCircleRange(
        unit.position.x,
        unit.position.y,
        unit.stats.discoverRadius,
        MAP.GRID_WIDTH,
        MAP.GRID_HEIGHT,
      );
      for (const { x, y } of tilesInRange) {
        discoverableTiles.add(positionToKey(x, y));
      }
    }
  }

  return discoverableTiles;
}

// ============================================================================
// DISCOVERY UPDATE
// ============================================================================

/**
 * Updates tile discovery state based on current player unit positions.
 * - Marks tiles within player unit discover radius as discovered (isRevealed = true)
 * - Once revealed, tiles are never hidden again
 * - Buildings do not contribute to discovery
 *
 * This function mutates the draft state directly (immer pattern).
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function updateDiscovery(state: Draft<GameState>): void {
  // Get currently discoverable tiles
  const discoverableTiles = getDiscoverableTiles(state);

  // Mark discoverable tiles as permanently discovered
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const key = positionToKey(x, y);
      if (discoverableTiles.has(key)) {
        state.grid[y][x].isRevealed = true;
      }
    }
  }
}
