/**
 * Construction system for Volcanae.
 * Handles player building construction and enemy construction.
 */

import {
  Faction,
  UnitTag,
  BuildingType,
  TileType,
} from './types';
import type { Draft } from 'immer';
import type {
  Position,
  Building,
  GameState,
} from './types';
import { BUILDING_DEFINITIONS, POPULATION, XP, CRYSTAL_CHAMBER_CONFIG, ABILITIES } from './gameConfig';
import { generateId } from './mapGenerator';
import { grantXp } from './levelSystem';
import { getStrongholdCapMods } from './techSystem';

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
  | typeof BuildingType.STRONGHOLD
  | typeof BuildingType.CRYSTAL_CHAMBER;

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

/** Maps player-constructable BuildingType to its construction cost */
const BUILDING_COST: Record<ConstructableBuilding, { iron: number; wood: number }> = {
  [BuildingType.WOODCUTTER]: BUILDING_DEFINITIONS.WOODCUTTER.constructionCost,
  [BuildingType.MINE]: BUILDING_DEFINITIONS.MINE.constructionCost,
  [BuildingType.BARRACKS]: BUILDING_DEFINITIONS.BARRACKS.constructionCost,
  [BuildingType.ARCHER_CAMP]: BUILDING_DEFINITIONS.ARCHER_CAMP.constructionCost,
  [BuildingType.RIDER_CAMP]: BUILDING_DEFINITIONS.RIDER_CAMP.constructionCost,
  [BuildingType.SIEGE_CAMP]: BUILDING_DEFINITIONS.SIEGE_CAMP.constructionCost,
  [BuildingType.FARM]: BUILDING_DEFINITIONS.FARM.constructionCost,
  [BuildingType.PATRICIANHOUSE]: BUILDING_DEFINITIONS.PATRICIANHOUSE.constructionCost,
  [BuildingType.STRONGHOLD]: BUILDING_DEFINITIONS.STRONGHOLD.constructionCost,
  [BuildingType.CRYSTAL_CHAMBER]: BUILDING_DEFINITIONS.CRYSTAL_CHAMBER.constructionCost,
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
  [BuildingType.CRYSTAL_CHAMBER]: 'Crystal Chamber',
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
  [BuildingType.CRYSTAL_CHAMBER]: '💎',
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

  // Mountain terrain (no existing building, not a ruin) → MINE
  if (tile.terrainType === TileType.MOUNTAIN && tile.buildingId === null && !tile.isRuin) {
    options.push(makeOption(BuildingType.MINE));
  }

  // Ruin → all non-terrain player buildings that are tech-unlocked
  if (tile.isRuin) {
    const ruinBuildings = [
      BuildingType.BARRACKS,
      BuildingType.ARCHER_CAMP,
      BuildingType.RIDER_CAMP,
      BuildingType.SIEGE_CAMP,
      BuildingType.FARM,
      BuildingType.PATRICIANHOUSE,
    ];
    for (const bt of ruinBuildings) {
      if (state.unlockedBuildings.includes(bt)) {
        options.push(makeOption(bt));
      }
    }
    if (state.unlockedBuildings.includes(BuildingType.CRYSTAL_CHAMBER)) {
      options.push(makeOption(BuildingType.CRYSTAL_CHAMBER));
    }
  }

  return options;
}

/**
 * Returns true if the player unit can construct the given building at tilePos.
 */
// Cross-blocking rules and tag requirements for construction live in
// unitActions.ts → canUnitConstruct. Do not add tag checks or flag logic here.
// This function is a safety net for the construction preconditions only.
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

  // Must not have performed any action this turn
  if (unit.hasMovedThisTurn || unit.hasConstructedThisTurn || unit.hasCapturedThisTurn
      || unit.hasAttackedThisTurn || unit.hasDestroyedThisTurn) return false;

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

  // Must not have performed any action this turn
  if (unit.hasMovedThisTurn || unit.hasConstructedThisTurn || unit.hasCapturedThisTurn
      || unit.hasAttackedThisTurn || unit.hasDestroyedThisTurn) return false;

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
  overrideHp?: number,
): Building {
  const isWatchtower = type === BuildingType.WATCHTOWER;
  const isOutpost = type === BuildingType.OUTPOST;
  const isMagmaSpyr = type === BuildingType.MAGMASPYR;
  const isCrystalChamber = type === BuildingType.CRYSTAL_CHAMBER;
  const maxHp = isWatchtower
    ? BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.maxHp
    : isMagmaSpyr
      ? BUILDING_DEFINITIONS.MAGMASPYR.combatStats!.maxHp
      : isCrystalChamber
        ? CRYSTAL_CHAMBER_CONFIG.MAX_HP
        : 100;
  const combatStats = isWatchtower
    ? {
        attack: BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.attack,
        defense: BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.defense,
        attackRange: BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.attackRange,
      }
    : isOutpost
      ? {
          attack: BUILDING_DEFINITIONS.OUTPOST.combatStats!.attack,
          defense: BUILDING_DEFINITIONS.OUTPOST.combatStats!.defense,
          attackRange: BUILDING_DEFINITIONS.OUTPOST.combatStats!.attackRange,
        }
      : isMagmaSpyr
        ? {
            attack: BUILDING_DEFINITIONS.MAGMASPYR.combatStats!.attack,
            defense: BUILDING_DEFINITIONS.MAGMASPYR.combatStats!.defense,
            attackRange: BUILDING_DEFINITIONS.MAGMASPYR.combatStats!.attackRange,
            maxAttacksPerTurn: BUILDING_DEFINITIONS.MAGMASPYR.combatStats!.maxAttacksPerTurn,
          }
        : null;
  const tags: import('./types').UnitTag[] = (isWatchtower || isOutpost || isMagmaSpyr) ? [UnitTag.RANGED] : [];

  // Population initialization for housing buildings
  let populationCount = 0;
  let populationCap = 0;
  const strongholdNobles = 0;
  if (type === BuildingType.FARM) {
    populationCap = POPULATION.FARM_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.PATRICIANHOUSE) {
    populationCap = POPULATION.PATRICIAN_HOUSE_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.STRONGHOLD) {
    populationCap = POPULATION.STRONGHOLD_FARMER_CAP + POPULATION.STRONGHOLD_NOBLE_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  }

  const effectiveMaxHp = overrideHp ?? maxHp;

  return {
    id: generateId('building'),
    type,
    faction,
    position: { ...position },
    hp: effectiveMaxHp,
    maxHp: effectiveMaxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDING_DEFINITIONS[type].discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats,
    hasAttackedThisTurn: false,
    tags,
    consumesUnitOnCapture: isWatchtower,
    populationCount,
    populationCap,
    populationGrowthCounter: 0,
    strongholdNobles,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: BUILDING_DEFINITIONS[type].destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
  };
}

/**
 * Creates an Outpost building for the FIELDWORK ability.
 * The outpost's HP is derived from the sacrificing unit's current HP multiplied
 * by ABILITIES.FIELDWORK_HP_MULTIPLIER, giving stronger units a stronger outpost.
 */
export function createFieldworkOutpost(position: Position, unitCurrentHp: number): Building {
  const hp = Math.min(
    BUILDING_DEFINITIONS.OUTPOST.combatStats!.maxHp,
    Math.max(1, Math.round(unitCurrentHp * ABILITIES.FIELDWORK_HP_MULTIPLIER)),
  );
  return createBuildingObject(BuildingType.OUTPOST, position, Faction.PLAYER, hp);
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

  // Apply stronghold cap mods from unlocked techs
  if (buildingType === BuildingType.STRONGHOLD) {
    const { farmerMod, nobleMod } = getStrongholdCapMods(state);
    newBuilding.populationCap += farmerMod + nobleMod;
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

  // Mark unit as having constructed
  const unit = state.units[unitId];
  unit.hasConstructedThisTurn = true;

  // Grant XP to the unit for constructing a building
  grantXp(state, unitId, XP.CONSTRUCT_BUILDING);

  // Update construction stats
  state.gameStats.buildingsConstructed += 1;
}

/**
 * Places a Mine directly on a mountain tile, bypassing unit action flags.
 * Used by the Seal & Build Mine cave resolution path where the constructing
 * unit may not have the BUILDANDCAPTURE tag or may have already acted.
 * Deducts Mine construction cost from player resources.
 */
export function placeMineOnTile(
  state: Draft<GameState>,
  tilePos: Position,
): void {
  const tile = state.grid[tilePos.y]?.[tilePos.x];
  if (!tile) return;
  if (tile.buildingId !== null) return;
  if (tile.isLava) return;

  const cost = BUILDING_COST[BuildingType.MINE as ConstructableBuilding];
  if (!cost) return;
  if (state.resources.iron < cost.iron || state.resources.wood < cost.wood) return;

  state.resources.iron -= cost.iron;
  state.resources.wood -= cost.wood;

  const newBuilding = createBuildingObject(BuildingType.MINE, tilePos, Faction.PLAYER);
  state.buildings[newBuilding.id] = newBuilding;
  tile.buildingId = newBuilding.id;

  if (tile.isRuin) tile.isRuin = false;
  if (tile.isStrongholdRuin) tile.isStrongholdRuin = false;

  state.gameStats.buildingsConstructed += 1;
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
  suppressEffects?: boolean,
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

  // Mark unit as having constructed
  const unit = state.units[unitId];
  unit.hasConstructedThisTurn = true;

  // Grant XP to the enemy unit for constructing a building
  grantXp(state, unitId, XP.CONSTRUCT_BUILDING, suppressEffects);
}
