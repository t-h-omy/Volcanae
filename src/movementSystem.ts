/**
 * Movement system module for Volcanae.
 * Implements unit movement logic with reachability calculation.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, TechFlag, TileType, UnitTag } from './types';
import { MAP, ABILITIES } from './gameConfig';

// ============================================================================
// MOVEMENT CALCULATIONS
// ============================================================================

// 8-directional movement vectors shared by getReachableTiles and other helpers.
const MOVE_DIRECTIONS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Gets all tiles that a unit can reach from its current position.
 *
 * Uses an 8-directional BFS flood-fill so that impassable terrain (CANYON,
 * WATER) blocks traversal — a unit can no longer "jump over" a single-tile
 * canyon by exploiting a geometric range check.
 *
 * A tile is reachable if a path exists (within moveRange steps) where every
 * intermediate and destination tile satisfies:
 * - Not a CANYON or WATER tile (impassable for all units)
 * - Not an undiscovered tile (player units only)
 * - Not a lava tile (player units only — enemy units may enter lava)
 * - Not occupied by another unit
 * - Not occupied by a combat building, except neutral watchtowers (capturable)
 *
 * The unit must also not have already moved this turn.
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

  const unitPosition = unit.position;
  let moveRange = unit.stats.moveRange;

  // SKIRMISHER / OUTRIDER tags: bonus movement range
  if (unit.faction === Faction.PLAYER) {
    if (unit.tags.includes(UnitTag.SKIRMISHER)) {
      moveRange += ABILITIES.SKIRMISHER_MOVE_BONUS;
    } else if (unit.tags.includes(UnitTag.OUTRIDER)) {
      moveRange += ABILITIES.OUTRIDER_MOVE_BONUS;
    }
  }

  // TO_THE_FRONT tech: player units >N tiles south of the northmost player unit
  // get a movement bonus.
  if (unit.faction === Faction.PLAYER && state.techFlags.includes(TechFlag.TO_THE_FRONT)) {
    let minPlayerY = unitPosition.y;
    for (const u of Object.values(state.units)) {
      if (u.faction === Faction.PLAYER && u.position.y < minPlayerY) {
        minPlayerY = u.position.y;
      }
    }
    if (unitPosition.y - minPlayerY > ABILITIES.TO_THE_FRONT_MIN_DISTANCE) {
      moveRange += ABILITIES.TO_THE_FRONT_MOVE_BONUS;
    }
  }

  // BFS flood-fill: each step costs 1 movement point.
  // CANYON/WATER tiles block traversal — units cannot pass through them even
  // when the destination itself is a valid tile on the far side.
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; steps: number }> = [
    { x: unitPosition.x, y: unitPosition.y, steps: 0 },
  ];
  visited.add(`${unitPosition.x},${unitPosition.y}`);
  let head = 0;

  const reachableTiles: Position[] = [];

  while (head < queue.length) {
    const { x, y, steps } = queue[head++];
    if (steps >= moveRange) continue;

    for (const [dx, dy] of MOVE_DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;

      const nkey = `${nx},${ny}`;
      if (visited.has(nkey)) continue;
      visited.add(nkey);

      const tile = state.grid[ny][nx];

      // CANYON/WATER: impassable — cannot enter or traverse
      if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) continue;

      // Cannot enter undiscovered tiles (player units only)
      if (!tile.isRevealed && unit.faction === Faction.PLAYER) continue;

      // Cannot enter lava tiles (player units only — enemy units may enter lava)
      if (tile.isLava && unit.faction === Faction.PLAYER) continue;

      // Cannot enter tiles occupied by another unit
      if (tile.unitId !== null) continue;

      // Cannot enter tiles occupied by a building that has combat stats,
      // except for neutral watchtowers which can be moved onto (to capture them).
      // Owned watchtowers (player or enemy) block movement like other combat buildings.
      if (tile.buildingId !== null) {
        const tileBuilding = state.buildings[tile.buildingId];
        if (tileBuilding && tileBuilding.combatStats !== null) {
          const isNeutralWatchtower =
            tileBuilding.type === BuildingType.WATCHTOWER && tileBuilding.faction === null;
          if (!isNeutralWatchtower) continue;
        }
      }

      reachableTiles.push({ x: nx, y: ny });
      queue.push({ x: nx, y: ny, steps: steps + 1 });
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

  // If an enemy unit moves onto a lava tile, destroy it and increment threat
  if (newTile.isLava && unit.faction === Faction.ENEMY) {
    newTile.unitId = null;
    delete state.units[unitId];
    state.ember += 1;
    return;
  }

  // Mark unit as having moved this turn
  unit.hasMovedThisTurn = true;

  // HIT_AND_RUN: if this move happens after attacking, consume the post-attack move slot
  if (unit.hasAttackedThisTurn && unit.tags.includes(UnitTag.HIT_AND_RUN)) {
    unit.hasUsedPostAttackMoveThisTurn = true;
  }
}
