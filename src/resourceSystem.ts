/**
 * Resource system module for Volcanae.
 * Implements resource production, recruitment, and unit spawning.
 */

import type { GameState, Building, Position, Tile } from './types';
import type { Draft } from 'immer';
import { Faction, BuildingType, UnitType, UnitTag } from './types';
import { RESOURCES, UNITS, UNIT_COSTS, MAP } from './gameConfig';
import type { UnitCost } from './gameConfig';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a unique ID for entities.
 * Uses a timestamp-based approach to avoid conflicts with existing IDs.
 */
let resourceSystemIdCounter = 0;
function generateUnitId(): string {
  return `unit_recruited_${Date.now()}_${++resourceSystemIdCounter}`;
}

/**
 * Checks if a position is within the grid bounds.
 */
function isWithinBounds(pos: Position): boolean {
  return (
    pos.x >= 0 &&
    pos.x < MAP.GRID_WIDTH &&
    pos.y >= 0 &&
    pos.y < MAP.GRID_HEIGHT
  );
}

/**
 * Gets adjacent positions (4-directional) that are within bounds.
 */
function getAdjacentPositions(pos: Position): Position[] {
  const adjacent: Position[] = [
    { x: pos.x, y: pos.y - 1 }, // North
    { x: pos.x + 1, y: pos.y }, // East
    { x: pos.x, y: pos.y + 1 }, // South
    { x: pos.x - 1, y: pos.y }, // West
  ];
  return adjacent.filter(isWithinBounds);
}

/**
 * Returns true if there is at least one free tile (building tile or adjacent)
 * where a unit can spawn. Can be called with a plain grid (e.g. from the HUD).
 */
export function hasSpawnSpaceAt(
  grid: Tile[][] | Draft<Tile[][]>,
  position: Position
): boolean {
  const tile = (grid as Tile[][])[position.y]?.[position.x];
  if (tile && tile.unitId === null && !tile.isLava) {
    return true;
  }
  for (const pos of getAdjacentPositions(position)) {
    const adjTile = (grid as Tile[][])[pos.y]?.[pos.x];
    if (adjTile && adjTile.unitId === null && !adjTile.isLava) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the nearest free tile to spawn a unit.
 * Returns the original position if it's free, otherwise searches adjacent tiles.
 */
function findSpawnPosition(
  state: Draft<GameState>,
  buildingPosition: Position
): Position | null {
  const tile = state.grid[buildingPosition.y][buildingPosition.x];

  // Check if building tile is free (no unit, not lava)
  if (tile.unitId === null && !tile.isLava) {
    return buildingPosition;
  }

  // Search adjacent tiles
  const adjacent = getAdjacentPositions(buildingPosition);
  for (const pos of adjacent) {
    const adjTile = state.grid[pos.y][pos.x];
    if (adjTile.unitId === null && !adjTile.isLava) {
      return pos;
    }
  }

  // No free position found
  return null;
}

/**
 * Checks if a building is a recruitment building.
 */
function isRecruitmentBuilding(building: Building): boolean {
  return (
    building.type === BuildingType.BARRACKS ||
    building.type === BuildingType.ARCHER_CAMP ||
    building.type === BuildingType.RIDER_CAMP ||
    building.type === BuildingType.SIEGE_CAMP
  );
}

/**
 * Gets the unit type that can be recruited from a building type.
 */
function getUnitTypeForBuilding(buildingType: BuildingType): UnitType | null {
  switch (buildingType) {
    case BuildingType.BARRACKS:
      return UnitType.INFANTRY;
    case BuildingType.ARCHER_CAMP:
      return UnitType.ARCHER;
    case BuildingType.RIDER_CAMP:
      return UnitType.RIDER;
    case BuildingType.SIEGE_CAMP:
      return UnitType.SIEGE;
    default:
      return null;
  }
}

// ============================================================================
// RESOURCE COLLECTION
// ============================================================================

/**
 * Collects resources from all player-owned, non-disabled resource buildings.
 * Production happens at the START of the player turn.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function collectResources(state: Draft<GameState>): void {
  for (const building of Object.values(state.buildings)) {
    // Only player-owned buildings produce resources
    if (building.faction !== Faction.PLAYER) {
      continue;
    }

    // Disabled buildings do not produce resources
    if (building.isDisabledForTurns > 0) {
      continue;
    }

    // Collect resources based on building type
    if (building.type === BuildingType.MINE) {
      state.resources.iron += RESOURCES.MINE_IRON_PER_TURN;
    } else if (building.type === BuildingType.WOODCUTTER) {
      state.resources.wood += RESOURCES.WOODCUTTER_WOOD_PER_TURN;
    }
  }
}

// ============================================================================
// AFFORDABILITY CHECK
// ============================================================================

/**
 * Checks if the player can afford a given cost.
 *
 * @param state - Current game state
 * @param cost - The cost to check against
 * @returns True if the player has enough resources
 */
export function canAfford(
  state: GameState | Draft<GameState>,
  cost: UnitCost
): boolean {
  return state.resources.iron >= cost.iron && state.resources.wood >= cost.wood;
}

// ============================================================================
// UNIT RECRUITMENT
// ============================================================================

/**
 * Recruits a unit from a building, spawning it immediately on the map.
 * The spawned unit cannot move or act until the following turn.
 *
 * Rules:
 * - Cannot recruit from a disabled building
 * - Cannot recruit if there is no free spawn tile (building tile + adjacent)
 * - Cannot recruit if insufficient resources
 * - Building must be player-owned
 * - Building must be a recruitment building
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param buildingId - ID of the building to recruit from
 * @param unitType - Type of unit to recruit
 */
export function recruitUnit(
  state: Draft<GameState>,
  buildingId: string,
  unitType: UnitType
): void {
  const building = state.buildings[buildingId];

  // Validate building exists
  if (!building) {
    return;
  }

  // Validate building is player-owned
  if (building.faction !== Faction.PLAYER) {
    return;
  }

  // Validate building is a recruitment building
  if (!isRecruitmentBuilding(building)) {
    return;
  }

  // Validate building is not disabled
  if (building.isDisabledForTurns > 0) {
    return;
  }

  // Validate the unit type can be recruited from this building
  const validUnitType = getUnitTypeForBuilding(building.type);
  if (validUnitType !== unitType) {
    return;
  }

  // Get unit cost
  const cost = UNIT_COSTS[unitType];
  if (!cost) {
    return;
  }

  // Validate player can afford the unit
  if (!canAfford(state, cost)) {
    return;
  }

  // Find spawn position — reject if no free tile available
  const spawnPosition = findSpawnPosition(state, building.position);
  if (spawnPosition === null) {
    return;
  }

  // Deduct resources
  state.resources.iron -= cost.iron;
  state.resources.wood -= cost.wood;

  // Spawn the unit immediately, but flag it as having used all actions this turn
  const unitId = generateUnitId();
  state.units[unitId] = {
    id: unitId,
    type: unitType,
    faction: Faction.PLAYER,
    position: { ...spawnPosition },
    stats: {
      maxHp: UNITS[unitType].maxHp,
      currentHp: UNITS[unitType].maxHp,
      attack: UNITS[unitType].attack,
      defense: UNITS[unitType].defense,
      moveRange: UNITS[unitType].moveRange,
      discoverRadius: UNITS[unitType].discoverRadius,
      triggerRange: UNITS[unitType].triggerRange,
      movementActions: UNITS[unitType].movementActions,
      attackRange: UNITS[unitType].attackRange,
    },
    tags: UNITS[unitType].attackRange > 1 ? [UnitTag.RANGED] : [],
    hasMovedThisTurn: true,
    hasActedThisTurn: true,
    hasCapturedThisTurn: true,
  };

  // Place unit on the grid
  state.grid[spawnPosition.y][spawnPosition.x].unitId = unitId;
}
