/**
 * Corruption system module for Volcanae.
 * Implements terrain corruption by enemy units with the CORRUPT tag.
 * Corruption converts FOREST and MOUNTAIN terrain tiles to PLAINS.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { TileType, UnitTag } from './types';

/**
 * Corrupts the terrain at the given tile position.
 * Changes FOREST or MOUNTAIN terrain to PLAINS.
 * The unit must exist, belong to the ENEMY faction, and have the CORRUPT tag.
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit performing the corruption
 * @param tilePos - Position of the tile to corrupt
 */
export function corruptTerrain(
  state: Draft<GameState>,
  unitId: string,
  tilePos: Position,
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  // Unit must have the CORRUPT tag
  if (!unit.tags.includes(UnitTag.CORRUPT)) return;

  const tile = state.grid[tilePos.y]?.[tilePos.x];
  if (!tile) return;

  // Only corrupt FOREST and MOUNTAIN terrain
  if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) {
    tile.terrainType = TileType.PLAINS;
  }
}
