/**
 * Movement system module for Volcanae.
 * Implements unit movement logic with reachability calculation.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { Faction } from './types';
import { MAP } from './gameConfig';
import { getTilesWithinEdgeCircleRange } from './rangeUtils';

// ============================================================================
// MOVEMENT CALCULATIONS
// ============================================================================

/**
 * Gets all tiles that a unit can reach from its current position.
 * A tile is reachable if:
 * - It is within the unit's move range (edge-circle range)
 * - It has been discovered / revealed (player units only)
 * - It is not a lava tile (player units only — enemy units may enter lava)
 * - It is not occupied by another unit
 * - The unit has not already moved this turn
 *
 * @param state - Current game state
 * @param unitId - ID of the unit to check movement for
 * @returns Array of positions that are valid destinations
 */
export function getReachableTiles(
  state: GameState | Draft<GameState>,
  unitId: string
): Position[] {
  const unit = state.units[unitId];

  // Unit doesn't exist or has already moved
  if (!unit || unit.hasMovedThisTurn) {
    return [];
  }

  const reachableTiles: Position[] = [];
  const unitPosition = unit.position;
  const moveRange = unit.stats.moveRange;

  // Get candidate tiles using the edge-circle range system
  const candidates = getTilesWithinEdgeCircleRange(
    unitPosition.x,
    unitPosition.y,
    moveRange,
    MAP.GRID_WIDTH,
    MAP.GRID_HEIGHT,
  );

  for (const { x: tx, y: ty } of candidates) {
    // Skip the unit's current position (source tile is included by getTilesWithinEdgeCircleRange)
    if (tx === unitPosition.x && ty === unitPosition.y) {
      continue;
    }

    const tile = state.grid[ty][tx];

    // Cannot move onto undiscovered tiles (player units only)
    if (!tile.isRevealed && unit.faction === Faction.PLAYER) {
      continue;
    }

    // Cannot move into lava tiles (player units only — enemy units may enter lava)
    if (tile.isLava && unit.faction === Faction.PLAYER) {
      continue;
    }

    // Cannot move onto tiles occupied by another unit
    if (tile.unitId !== null) {
      continue;
    }

    // Cannot move onto tiles occupied by a building that has combat stats
    // Buildings without combatStats (no HP/attack) can be walked onto to destroy them
    if (tile.buildingId !== null) {
      const tileBuilding = state.buildings[tile.buildingId];
      if (tileBuilding && tileBuilding.combatStats !== null) {
        continue;
      }
    }

    reachableTiles.push({ x: tx, y: ty });
  }

  return reachableTiles;
}

// ============================================================================
// MOVEMENT RESOLUTION
// ============================================================================

/**
 * Moves a unit to a target position by mutating the draft state.
 * - Validates the move is legal
 * - Updates the unit's position
 * - Updates grid tile references
 * - Marks the unit as having moved this turn
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit to move
 * @param targetPosition - Position to move the unit to
 */
export function moveUnit(
  state: Draft<GameState>,
  unitId: string,
  targetPosition: Position
): void {
  const unit = state.units[unitId];

  // Validate unit exists
  if (!unit) {
    return;
  }

  // Check if the target position is reachable
  const reachableTiles = getReachableTiles(state, unitId);
  const isValidDestination = reachableTiles.some(
    (pos) => pos.x === targetPosition.x && pos.y === targetPosition.y
  );

  if (!isValidDestination) {
    return;
  }

  // Get the old and new tiles
  const oldTile = state.grid[unit.position.y][unit.position.x];
  const newTile = state.grid[targetPosition.y][targetPosition.x];

  // Update grid: remove unit from old tile
  if (oldTile.unitId === unitId) {
    oldTile.unitId = null;
  }

  // Update grid: add unit to new tile
  newTile.unitId = unitId;

  // Update unit position
  unit.position.x = targetPosition.x;
  unit.position.y = targetPosition.y;

  // If an enemy unit moves onto a lava tile, destroy it and increment threat
  if (newTile.isLava && unit.faction === Faction.ENEMY) {
    newTile.unitId = null;
    delete state.units[unitId];
    state.threatLevel += 1;
    return;
  }

  // Mark unit as having moved this turn
  unit.hasMovedThisTurn = true;
}
