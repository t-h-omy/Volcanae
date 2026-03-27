/**
 * Movement system module for Volcanae.
 * Implements unit movement logic with reachability calculation.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { MAP } from './gameConfig';

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
 * Checks if a position is within the grid bounds.
 * @param pos - Position to check
 * @returns True if position is within bounds
 */
function isWithinBounds(pos: Position): boolean {
  return (
    pos.x >= 0 &&
    pos.x < MAP.GRID_WIDTH &&
    pos.y >= 0 &&
    pos.y < MAP.GRID_HEIGHT
  );
}

// ============================================================================
// MOVEMENT CALCULATIONS
// ============================================================================

/**
 * Gets all tiles that a unit can reach from its current position.
 * A tile is reachable if:
 * - It is within the unit's move range (manhattan distance)
 * - It is not a lava tile
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

  // Check all tiles within move range
  for (let dx = -moveRange; dx <= moveRange; dx++) {
    for (let dy = -moveRange; dy <= moveRange; dy++) {
      // Skip the unit's current position
      if (dx === 0 && dy === 0) {
        continue;
      }

      const targetPos: Position = {
        x: unitPosition.x + dx,
        y: unitPosition.y + dy,
      };

      // Check if within bounds
      if (!isWithinBounds(targetPos)) {
        continue;
      }

      // Check manhattan distance
      if (manhattanDistance(unitPosition, targetPos) > moveRange) {
        continue;
      }

      const tile = state.grid[targetPos.y][targetPos.x];

      // Cannot move into lava tiles
      if (tile.isLava) {
        continue;
      }

      // Cannot move onto tiles occupied by another unit
      if (tile.unitId !== null) {
        continue;
      }

      reachableTiles.push(targetPos);
    }
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

  // Mark unit as having moved this turn
  unit.hasMovedThisTurn = true;
}
