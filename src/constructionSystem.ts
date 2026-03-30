/**
 * Construction system for Volcanae.
 * Handles player building construction, player demolition, and enemy construction.
 */

import type { Draft } from 'immer';
import {
  Faction,
  UnitTag,
  BuildingType,
  TileType,
} from './types';
import type {
  Position,
  Building,
  GameState,
} from './types';
import { CONSTRUCTION, POPULATION, BUILDINGS } from './gameConfig';
import { generateId } from './mapGenerator';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Building types the player can construct */
export type ConstructableBuilding =
  | typeof BuildingType.WOODCUTTER
  | typeof BuildingType.MINE
  | typeof BuildingType.BARRACKS
  | typeof BuildingType.ARCHER_CAMP
  | typeof BuildingType.RIDER_CAMP
  | typeof BuildingType.SIEGE_CAMP
  | typeof BuildingType.FARM
  | typeof BuildingType.PATRICIANHOUSE
  | typeof BuildingType.STRONGHOLD;

/** Building types the enemy can construct */
export type EnemyConstructableBuilding =
  | typeof BuildingType.LAVALAIR
  | typeof BuildingType.INFERNALSANCTUM;

/** A construction option presented to the player */
export interface ConstructionOption {
  buildingType: BuildingType;
  cost: { iron: number; wood: number };
  label: string;
  emoji: string;
}

// ============================================================================
// COST & DISPLAY MAPPINGS
// ============================================================================

/** Maps player-constructable BuildingType to its CONSTRUCTION cost */
const BUILDING_COST: Record<ConstructableBuilding, { iron: number; wood: number }> = {
  [BuildingType.WOODCUTTER]: CONSTRUCTION.WOODCUTTER_COST,
  [BuildingType.MINE]: CONSTRUCTION.MINE_COST,
  [BuildingType.BARRACKS]: CONSTRUCTION.BARRACKS_COST,
  [BuildingType.ARCHER_CAMP]: CONSTRUCTION.ARCHER_CAMP_COST,
  [BuildingType.RIDER_CAMP]: CONSTRUCTION.RIDER_CAMP_COST,
  [BuildingType.SIEGE_CAMP]: CONSTRUCTION.SIEGE_CAMP_COST,
  [BuildingType.FARM]: CONSTRUCTION.FARM_COST,
  [BuildingType.PATRICIANHOUSE]: CONSTRUCTION.PATRICIAN_HOUSE_COST,
  [BuildingType.STRONGHOLD]: CONSTRUCTION.STRONGHOLD_COST,
};

const BUILDING_LABEL: Record<ConstructableBuilding, string> = {
  [BuildingType.WOODCUTTER]: 'Woodcutter',
  [BuildingType.MINE]: 'Mine',
  [BuildingType.BARRACKS]: 'Barracks',
  [BuildingType.ARCHER_CAMP]: 'Archer Camp',
  [BuildingType.RIDER_CAMP]: 'Rider Camp',
  [BuildingType.SIEGE_CAMP]: 'Siege Camp',
  [BuildingType.FARM]: 'Farm',
  [BuildingType.PATRICIANHOUSE]: 'Patrician House',
  [BuildingType.STRONGHOLD]: 'Stronghold',
};

const BUILDING_EMOJI_MAP: Record<ConstructableBuilding, string> = {
  [BuildingType.WOODCUTTER]: '🛖',
  [BuildingType.MINE]: '🏔️',
  [BuildingType.BARRACKS]: '🏚️',
  [BuildingType.ARCHER_CAMP]: '🏕️',
  [BuildingType.RIDER_CAMP]: '🏘️',
  [BuildingType.SIEGE_CAMP]: '🏛️',
  [BuildingType.FARM]: '🌾',
  [BuildingType.PATRICIANHOUSE]: '🏠',
  [BuildingType.STRONGHOLD]: '🏰',
};

// ============================================================================
// HELPER: Build a ConstructionOption
// ============================================================================

function makeOption(buildingType: ConstructableBuilding): ConstructionOption {
  return {
    buildingType,
    cost: { ...BUILDING_COST[buildingType] },
    label: BUILDING_LABEL[buildingType],
    emoji: BUILDING_EMOJI_MAP[buildingType],
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Returns the list of buildings the player can construct on a given tile.
 */
export function getConstructionOptionsForTile(
  state: GameState | Draft<GameState>,
  tilePos: Position,
): ConstructionOption[] {
  const tile = state.grid[tilePos.y]?.[tilePos.x];
  if (!tile) return [];

  const options: ConstructionOption[] = [];

  // Stronghold ruin → only STRONGHOLD
  if (tile.isStrongholdRuin) {
    return [makeOption(BuildingType.STRONGHOLD)];
  }

  // Forest terrain (no existing building) → WOODCUTTER
  if (tile.terrainType === TileType.FOREST && tile.buildingId === null) {
    options.push(makeOption(BuildingType.WOODCUTTER));
  }

  // Mountain terrain (no existing building) → MINE
  if (tile.terrainType === TileType.MOUNTAIN && tile.buildingId === null) {
    options.push(makeOption(BuildingType.MINE));
  }

  // Ruin → all non-terrain player buildings
  if (tile.isRuin) {
    options.push(
      makeOption(BuildingType.BARRACKS),
      makeOption(BuildingType.ARCHER_CAMP),
      makeOption(BuildingType.RIDER_CAMP),
      makeOption(BuildingType.SIEGE_CAMP),
      makeOption(BuildingType.FARM),
      makeOption(BuildingType.PATRICIANHOUSE),
    );
  }

  return options;
}

/**
 * Returns true if the player unit can construct the given building at tilePos.
 */
export function canConstructAt(
  state: GameState | Draft<GameState>,
  unitId: string,
  tilePos: Position,
  buildingType: BuildingType,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;

  // Must have BUILDANDCAPTURE tag
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;

  // Must be on the exact same tile
  if (unit.position.x !== tilePos.x || unit.position.y !== tilePos.y) return false;

  // Must not have moved, acted, or captured this turn
  if (unit.hasMovedThisTurn || unit.hasActedThisTurn || unit.hasCapturedThisTurn) return false;

  // Tile must support the requested building type
  const options = getConstructionOptionsForTile(state, tilePos);
  if (!options.some((o) => o.buildingType === buildingType)) return false;

  // Player must have enough resources
  const cost = BUILDING_COST[buildingType as ConstructableBuilding];
  if (!cost) return false;
  if (state.resources.iron < cost.iron || state.resources.wood < cost.wood) return false;

  // Tile must not already have a building, unless it is FOREST/MOUNTAIN terrain
  const tile = state.grid[tilePos.y][tilePos.x];
  if (tile.buildingId !== null) {
    if (tile.terrainType !== TileType.FOREST && tile.terrainType !== TileType.MOUNTAIN) {
      return false;
    }
  }

  return true;
}

/**
 * Returns true if the enemy unit can construct the given building at tilePos.
 */
export function canEnemyConstructAt(
  state: GameState | Draft<GameState>,
  unitId: string,
  tilePos: Position,
  buildingType: BuildingType,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;

  // Must have BUILDANDCAPTURE tag
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;

  // Must be on the exact same tile
  if (unit.position.x !== tilePos.x || unit.position.y !== tilePos.y) return false;

  // Must not have acted this turn
  if (unit.hasActedThisTurn) return false;

  const tile = state.grid[tilePos.y][tilePos.x];

  // Stronghold ruin → only INFERNAL_SANCTUM
  if (tile.isStrongholdRuin) {
    return buildingType === BuildingType.INFERNALSANCTUM;
  }

  // Regular ruin → only LAVA_LAIR
  if (tile.isRuin) {
    return buildingType === BuildingType.LAVALAIR;
  }

  // No ruin → cannot construct
  return false;
}

// ============================================================================
// PLAYER CONSTRUCTION
// ============================================================================

/**
 * Creates a new Building object following the same pattern as createBuilding in mapGenerator.ts.
 */
function createBuildingObject(
  type: BuildingType,
  position: Position,
  faction: Faction | null,
): Building {
  const isWatchtower = type === BuildingType.WATCHTOWER;
  const maxHp = isWatchtower ? BUILDINGS.WATCHTOWER_STATS.maxHp : 100;
  const combatStats = isWatchtower
    ? {
        attack: BUILDINGS.WATCHTOWER_STATS.attack,
        defense: BUILDINGS.WATCHTOWER_STATS.defense,
        attackRange: BUILDINGS.WATCHTOWER_STATS.attackRange,
      }
    : null;
  const tags: import('./types').UnitTag[] = isWatchtower ? [UnitTag.RANGED] : [];

  // Population initialization for housing buildings
  let populationCount = 0;
  let populationCap = 0;
  if (type === BuildingType.FARM) {
    populationCap = POPULATION.FARM_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.PATRICIANHOUSE) {
    populationCap = POPULATION.PATRICIAN_HOUSE_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  }

  return {
    id: generateId('building'),
    type,
    faction,
    position: { ...position },
    hp: maxHp,
    maxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDINGS.DISCOVER_RADIUS[type],
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats,
    hasActedThisTurn: false,
    tags,
    consumesUnitOnCapture: isWatchtower,
    populationCount,
    populationCap,
    populationGrowthCounter: 0,
    emberSpawnCounter: 0,
  };
}

/**
 * Constructs a building for the player. Mutates the immer Draft directly.
 */
export function constructBuilding(
  state: Draft<GameState>,
  unitId: string,
  tilePos: Position,
  buildingType: BuildingType,
): void {
  if (!canConstructAt(state, unitId, tilePos, buildingType)) {
    throw new Error(
      `Cannot construct ${buildingType} at (${tilePos.x},${tilePos.y}) with unit ${unitId}`,
    );
  }

  // Deduct resources
  const cost = BUILDING_COST[buildingType as ConstructableBuilding];
  state.resources.iron -= cost.iron;
  state.resources.wood -= cost.wood;

  // Create the new building
  const newBuilding = createBuildingObject(buildingType, tilePos, Faction.PLAYER);

  // Add building to state
  state.buildings[newBuilding.id] = newBuilding;

  // Update grid tile
  const tile = state.grid[tilePos.y][tilePos.x];
  tile.buildingId = newBuilding.id;

  // Clear ruin flags
  if (tile.isRuin) {
    tile.isRuin = false;
  }
  if (tile.isStrongholdRuin) {
    tile.isStrongholdRuin = false;
  }

  // Mark unit as having acted
  const unit = state.units[unitId];
  unit.hasMovedThisTurn = true;
  unit.hasActedThisTurn = true;
  unit.hasCapturedThisTurn = true;
}

// ============================================================================
// PLAYER DESTROY OWN BUILDING (UI action — no unit action cost)
// ============================================================================

/**
 * Destroys a player-owned building. Triggered from the building UI panel.
 * The unit must be on the same tile as the building AND have BUILD_AND_CAPTURE tag.
 * Does NOT consume any unit actions.
 */
export function destroyOwnBuilding(
  state: Draft<GameState>,
  unitId: string,
  buildingId: string,
): void {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`Unit ${unitId} not found`);

  // Must have BUILDANDCAPTURE tag
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
    throw new Error(`Unit ${unitId} does not have BUILDANDCAPTURE tag`);
  }

  const building = state.buildings[buildingId];
  if (!building) throw new Error(`Building ${buildingId} not found`);

  // Unit must be on the building's tile
  if (unit.position.x !== building.position.x || unit.position.y !== building.position.y) {
    throw new Error(`Unit ${unitId} is not on the same tile as building ${buildingId}`);
  }

  // If building has a specialist assigned, move to global storage
  if (building.specialistSlot) {
    state.globalSpecialistStorage.push(building.specialistSlot);
    // Also clear the specialist's assignedBuildingId
    const specialist = state.specialists[building.specialistSlot];
    if (specialist) {
      specialist.assignedBuildingId = null;
    }
  }

  const { x, y } = building.position;
  const buildingType = building.type;

  // Remove building from state
  delete state.buildings[buildingId];

  // Clear grid tile
  const tile = state.grid[y][x];
  tile.buildingId = null;

  // Determine ruin type
  if (buildingType === BuildingType.STRONGHOLD) {
    tile.isStrongholdRuin = true;
  } else {
    tile.isRuin = true;
  }

  // Do NOT consume any unit actions — this is a UI action
}

// ============================================================================
// ENEMY CONSTRUCTION
// ============================================================================

/**
 * Constructs a building for the enemy. Mutates the immer Draft directly.
 */
export function enemyConstructBuilding(
  state: Draft<GameState>,
  unitId: string,
  tilePos: Position,
  buildingType: BuildingType,
): void {
  if (!canEnemyConstructAt(state, unitId, tilePos, buildingType)) {
    throw new Error(
      `Enemy cannot construct ${buildingType} at (${tilePos.x},${tilePos.y}) with unit ${unitId}`,
    );
  }

  // Create the new building with ENEMY faction
  const newBuilding = createBuildingObject(buildingType, tilePos, Faction.ENEMY);

  // LAVA_LAIR gets lava boost enabled
  if (buildingType === BuildingType.LAVALAIR) {
    newBuilding.lavaBoostEnabled = true;
  }

  // Add building to state
  state.buildings[newBuilding.id] = newBuilding;

  // Update grid tile
  const tile = state.grid[tilePos.y][tilePos.x];
  tile.buildingId = newBuilding.id;

  // Clear ruin flags
  if (tile.isRuin) {
    tile.isRuin = false;
  }
  if (tile.isStrongholdRuin) {
    tile.isStrongholdRuin = false;
  }

  // Mark unit as having acted
  const unit = state.units[unitId];
  unit.hasMovedThisTurn = true;
  unit.hasActedThisTurn = true;
}
