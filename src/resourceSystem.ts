/**
 * Resource system module for Volcanae.
 * Implements resource production, recruitment, and unit spawning.
 */

import type { GameState, Building, Position, Tile } from './types';
import type { Draft } from 'immer';
import { Faction, BuildingType, UnitType, UnitTag } from './types';
import { RESOURCES, UNITS, UNIT_COSTS } from './gameConfig';
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
 * Returns true if the building's own tile is free (no unit, not lava).
 * Recruitment is only allowed when the building tile itself is unoccupied.
 */
export function hasSpawnSpaceAt(
  grid: Tile[][] | Draft<Tile[][]>,
  position: Position
): boolean {
  const tile = (grid as Tile[][])[position.y]?.[position.x];
  return !!(tile && tile.unitId === null && !tile.isLava);
}

/**
 * Finds the spawn position for a newly recruited unit.
 * Units can only be spawned on the building's own tile; returns null if occupied.
 */
function findSpawnPosition(
  state: Draft<GameState>,
  buildingPosition: Position
): Position | null {
  const tile = state.grid[buildingPosition.y][buildingPosition.x];

  // Only spawn on the building tile itself; reject if occupied or lava
  if (tile.unitId === null && !tile.isLava) {
    return buildingPosition;
  }

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
    building.type === BuildingType.SIEGE_CAMP ||
    building.type === BuildingType.STRONGHOLD
  );
}

/**
 * Gets an array of unit types that can be recruited from a building type.
 */
function getRecruitableUnitTypes(buildingType: BuildingType): UnitType[] {
  switch (buildingType) {
    case BuildingType.BARRACKS:
      return [UnitType.INFANTRY];
    case BuildingType.ARCHER_CAMP:
      return [UnitType.ARCHER];
    case BuildingType.RIDER_CAMP:
      return [UnitType.RIDER];
    case BuildingType.SIEGE_CAMP:
      return [UnitType.SIEGE];
    case BuildingType.STRONGHOLD:
      return [UnitType.SCOUT, UnitType.GUARD];
    default:
      return [];
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
  const validUnitTypes = getRecruitableUnitTypes(building.type);
  if (!validUnitTypes.includes(unitType)) {
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
    tags: [
      ...(UNITS[unitType].attackRange > 1 ? [UnitTag.RANGED] : []),
      ...(unitType === UnitType.SIEGE || unitType === UnitType.LAVA_SIEGE || unitType === UnitType.GUARD ? [UnitTag.PREP] : []),
      ...(unitType === UnitType.SCOUT ? [UnitTag.NO_CAPTURE] : []),
    ],
    hasMovedThisTurn: true,
    hasActedThisTurn: true,
    hasCapturedThisTurn: true,
  };

  // Place unit on the grid
  state.grid[spawnPosition.y][spawnPosition.x].unitId = unitId;
}
