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
import { BUILDING_DEFINITIONS, POPULATION, XP, CRYSTAL_CHAMBER_CONFIG, ABILITIES, MAP } from './gameConfig';
import { generateId } from './mapGenerator';
import { grantXp } from './levelSystem';
import { cleanupRoostedUnits } from './buildingRemoval';
import { isSpecialistEffectActive } from './specialistSystem';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Building types the player can construct */
export type ConstructableBuilding =
  | typeof BuildingType.WOODCUTTER
  | typeof BuildingType.CHARCOAL_KILN
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
  [BuildingType.WOODCUTTER]:     BUILDING_DEFINITIONS.WOODCUTTER.constructionCost,
  [BuildingType.CHARCOAL_KILN]:  BUILDING_DEFINITIONS.CHARCOAL_KILN.constructionCost,
  [BuildingType.MINE]:           BUILDING_DEFINITIONS.MINE.constructionCost,
  [BuildingType.BARRACKS]:       BUILDING_DEFINITIONS.BARRACKS.constructionCost,
  [BuildingType.ARCHER_CAMP]:    BUILDING_DEFINITIONS.ARCHER_CAMP.constructionCost,
  [BuildingType.RIDER_CAMP]:     BUILDING_DEFINITIONS.RIDER_CAMP.constructionCost,
  [BuildingType.SIEGE_CAMP]:     BUILDING_DEFINITIONS.SIEGE_CAMP.constructionCost,
  [BuildingType.FARM]:           BUILDING_DEFINITIONS.FARM.constructionCost,
  [BuildingType.PATRICIANHOUSE]: BUILDING_DEFINITIONS.PATRICIANHOUSE.constructionCost,
  [BuildingType.STRONGHOLD]:     BUILDING_DEFINITIONS.STRONGHOLD.constructionCost,
  [BuildingType.CRYSTAL_CHAMBER]:BUILDING_DEFINITIONS.CRYSTAL_CHAMBER.constructionCost,
};

const BUILDING_LABEL: Record<ConstructableBuilding, string> = {
  [BuildingType.WOODCUTTER]:     'Woodcutter',
  [BuildingType.CHARCOAL_KILN]:  'Charcoal Kiln',
  [BuildingType.MINE]:           'Mine',
  [BuildingType.BARRACKS]:       'Barracks',
  [BuildingType.ARCHER_CAMP]:    'Archer Camp',
  [BuildingType.RIDER_CAMP]:     'Rider Camp',
  [BuildingType.SIEGE_CAMP]:     'Siege Camp',
  [BuildingType.FARM]:           'Farm',
  [BuildingType.PATRICIANHOUSE]: 'Patrician House',
  [BuildingType.STRONGHOLD]:     'Stronghold',
  [BuildingType.CRYSTAL_CHAMBER]:'Crystal Chamber',
};

const BUILDING_EMOJI_MAP: Record<ConstructableBuilding, string> = {
  [BuildingType.WOODCUTTER]:     '🛖',
  // 🔥 evokes the charcoal-burning process inside the kiln
  [BuildingType.CHARCOAL_KILN]:  '🔥',
  [BuildingType.MINE]:           '🏔️',
  [BuildingType.BARRACKS]:       '🏚️',
  [BuildingType.ARCHER_CAMP]:    '🏕️',
  [BuildingType.RIDER_CAMP]:     '🏘️',
  [BuildingType.SIEGE_CAMP]:     '🏛️',
  [BuildingType.FARM]:           '🌾',
  [BuildingType.PATRICIANHOUSE]: '🏠',
  [BuildingType.STRONGHOLD]:     '🏰',
  [BuildingType.CRYSTAL_CHAMBER]:'💎',
};

/**
 * Display labels for buildings that are placed by unit actions (not through the
 * player build menu). Keyed by BuildingType. Used by HUD and action-layer code
 * to show a human-readable name for these buildings.
 */
export const ACTION_PLACED_BUILDING_LABEL: Partial<Record<BuildingType, string>> = {
  [BuildingType.SCOUT_TRAP]: 'Scout Trap',
};

/**
 * Emoji icons for buildings that are placed by unit actions (not through the
 * player build menu). Keyed by BuildingType.
 */
export const ACTION_PLACED_BUILDING_EMOJI: Partial<Record<BuildingType, string>> = {
  [BuildingType.SCOUT_TRAP]: '🪤',
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
// RUIN BUILDING CONSTANTS
// ============================================================================

/**
 * The set of building types that are buildable on Ruin tiles. Single source
 * of truth, used by getConstructionOptionsForTile, canUnitConvertBuilding,
 * and getConversionTargetsForTile.
 */
export const RUIN_BUILDABLE_TYPES: BuildingType[] = [
  BuildingType.BARRACKS,
  BuildingType.ARCHER_CAMP,
  BuildingType.RIDER_CAMP,
  BuildingType.SIEGE_CAMP,
  BuildingType.FARM,
  BuildingType.PATRICIANHOUSE,
  BuildingType.CRYSTAL_CHAMBER,
];

/**
 * Building types that sit on resource terrain (Forest/Mountain) and can be
 * converted by a BUILDANDCAPTURE unit. Converting such a building does NOT go
 * through the Ruin flow — the terrain itself determines the available targets
 * (e.g. CRYSTAL_CAVE on a mountain → can be converted to MINE).
 *
 * WOODCUTTER and CHARCOAL_KILN are both listed here so that a unit can
 * convert between the two alternatives on the same forest tile (e.g. replace
 * an existing Woodcutter with a Charcoal Kiln once the tech is unlocked, or
 * swap back in the other direction).
 */
export const RESOURCE_TERRAIN_CONVERTIBLE_TYPES: BuildingType[] = [
  BuildingType.CRYSTAL_CAVE,
  BuildingType.WOODCUTTER,
  BuildingType.CHARCOAL_KILN,
];

/**
 * Returns the list of building types that can be constructed on a Ruin tile,
 * filtered by tech-unlock status.
 */
export function getRuinBuildingOptions(
  state: GameState | Draft<GameState>,
): ConstructionOption[] {
  return RUIN_BUILDABLE_TYPES
    .filter((bt) => state.unlockedBuildings.includes(bt))
    .map((bt) => makeOption(bt as ConstructableBuilding));
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

  // Forest terrain (no existing building) → always offer WOODCUTTER; also offer
  // CHARCOAL_KILN when the player has researched the CHARCOAL_KILN tech node.
  // These are mutually exclusive alternatives — only one can occupy a tile.
  if (tile.terrainType === TileType.FOREST && tile.buildingId === null) {
    options.push(makeOption(BuildingType.WOODCUTTER));
    if (state.unlockedBuildings.includes(BuildingType.CHARCOAL_KILN)) {
      options.push(makeOption(BuildingType.CHARCOAL_KILN));
    }
  }

  // Mountain terrain (no existing building, not a ruin) → MINE
  if (tile.terrainType === TileType.MOUNTAIN && tile.buildingId === null && !tile.isRuin) {
    options.push(makeOption(BuildingType.MINE));
  }

  // Ruin → all non-terrain player buildings that are tech-unlocked
  if (tile.isRuin) {
    options.push(...getRuinBuildingOptions(state));
  }

  return options;
}

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Returns the construction options for a building conversion at the given tile,
 * excluding the building currently on the tile.
 *
 * - For resource-terrain buildings (e.g. CRYSTAL_CAVE on a mountain) the
 *   available targets are derived from the tile's terrain, not the ruin list.
 * - For all other convertible buildings the ruin-buildable list is used.
 */
export function getConversionTargetsForTile(
  state: GameState | Draft<GameState>,
  position: Position,
  currentBuildingType: BuildingType,
): ConstructionOption[] {
  if (RESOURCE_TERRAIN_CONVERTIBLE_TYPES.includes(currentBuildingType)) {
    // Return terrain-appropriate options as if the tile were empty.
    // We read terrain properties directly instead of creating a fake state copy.
    const tile = state.grid[position.y]?.[position.x];
    if (!tile) return [];
    // Mirror the terrain checks from getConstructionOptionsForTile, but without
    // the buildingId guard (we know the building is being removed).
    const options: ConstructionOption[] = [];
    if (tile.isStrongholdRuin) {
      return [makeOption(BuildingType.STRONGHOLD)];
    }
    if (tile.terrainType === TileType.FOREST) {
      // Woodcutter is always available as a forest building.
      options.push(makeOption(BuildingType.WOODCUTTER));
      // Charcoal Kiln is the tech-gated alternative — offer it only when unlocked.
      if (state.unlockedBuildings.includes(BuildingType.CHARCOAL_KILN)) {
        options.push(makeOption(BuildingType.CHARCOAL_KILN));
      }
    }
    if (tile.terrainType === TileType.MOUNTAIN && !tile.isRuin) {
      options.push(makeOption(BuildingType.MINE));
    }
    if (tile.isRuin) {
      options.push(...getRuinBuildingOptions(state));
    }
    return options.filter((opt) => opt.buildingType !== currentBuildingType);
  }

  return getRuinBuildingOptions(state).filter(
    (opt) => opt.buildingType !== currentBuildingType,
  );
}

/**
 * Returns true if the given unit can initiate a building conversion at its
 * current position.
 *
 * Action-flag rules mirror canUnitConstruct in unitActions.ts exactly — a
 * conversion consumes the same action slot as construction and must change
 * whenever canUnitConstruct changes.
 */
export function canUnitConvertBuilding(
  state: GameState | Draft<GameState>,
  unitId: string,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (unit.faction !== Faction.PLAYER) return false;
  // Action-flag checks — must stay in sync with canUnitConstruct (unitActions.ts)
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;

  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile || !tile.buildingId) return false;

  const building = state.buildings[tile.buildingId];
  if (!building || building.faction !== Faction.PLAYER) return false;

  // Only buildings that are themselves Ruin-buildable or on resource terrain can be converted.
  // This implicitly excludes Watchtower, Stronghold, Mine, Woodcutter, etc.
  const isConvertible =
    RUIN_BUILDABLE_TYPES.includes(building.type) ||
    RESOURCE_TERRAIN_CONVERTIBLE_TYPES.includes(building.type);
  if (!isConvertible) return false;

  // At least one alternative conversion target must exist.
  const alternatives = getConversionTargetsForTile(state, unit.position, building.type);
  return alternatives.length > 0;
}

/**
 * Executes the building conversion.
 * Assumes canUnitConvertBuilding(state, unitId) === true.
 */
export function convertBuilding(
  state: Draft<GameState>,
  unitId: string,
  newBuildingType: BuildingType,
): void {
  if (!canUnitConvertBuilding(state, unitId)) {
    throw new Error(`Cannot convert building with unit ${unitId}`);
  }

  const unit = state.units[unitId];
  const position = unit.position;
  const tile = state.grid[position.y][position.x];
  const oldBuildingId = tile.buildingId;
  if (!oldBuildingId) {
    throw new Error(`No building to convert at (${position.x},${position.y})`);
  }

  const oldBuilding = state.buildings[oldBuildingId];
  if (oldBuilding.type === newBuildingType) {
    throw new Error(`Cannot convert building to same type`);
  }

  // Verify the target is in the valid conversion-options list
  const conversionTargets = getConversionTargetsForTile(state, position, oldBuilding.type);
  if (!conversionTargets.some((opt) => opt.buildingType === newBuildingType)) {
    throw new Error(`Invalid conversion target: ${newBuildingType}`);
  }

  // Verify resources (constructBuilding will also check, but we want a clear error)
  const cost = BUILDING_COST[newBuildingType as ConstructableBuilding];
  if (!cost || state.resources.iron < cost.iron || state.resources.wood < cost.wood) {
    throw new Error(`Insufficient resources for conversion`);
  }

  const isResourceTerrainBuilding = RESOURCE_TERRAIN_CONVERTIBLE_TYPES.includes(oldBuilding.type);

  // 1. Destroy old building
  cleanupRoostedUnits(state, oldBuildingId);
  delete state.buildings[oldBuildingId];
  tile.buildingId = null;

  // 2. For ruin-buildable buildings: re-mark tile as Ruin so constructBuilding's
  //    Ruin-branch works. For resource-terrain buildings (e.g. CRYSTAL_CAVE on a
  //    mountain): leave the tile as-is so the terrain check picks up MINE etc.
  if (!isResourceTerrainBuilding) {
    tile.isRuin = true;
  }

  // 3. Construct new building via the existing flow
  //    (handles cost deduction, isRuin clearing, tile updates, XP grant, stats update)
  constructBuilding(state, unitId, position, newBuildingType);

  // constructBuilding increments buildingsConstructed; undo that since this is
  // a conversion, not a net-new construction. Only buildingsConverted is incremented.
  state.gameStats.buildingsConstructed = Math.max(0, state.gameStats.buildingsConstructed - 1);

  // 4. Track conversion in game stats
  state.gameStats.buildingsConverted = (state.gameStats.buildingsConverted ?? 0) + 1;
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
    lastRecruitmentTurn: 0,
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

  // Apply FORTIFIED_GARRISON bonus to Watchtower if the specialist is active
  if (
    newBuilding.type === BuildingType.WATCHTOWER &&
    state.fortifiedGarrisonActive &&
    newBuilding.combatStats
  ) {
    newBuilding.combatStats.attack += ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS;
    newBuilding.combatStats.attackRange += ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS;
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

  // SP-21 Pathfinder: reveal the full zone when STRONGHOLD_ZONE_REVEAL is active
  if (buildingType === BuildingType.STRONGHOLD && isSpecialistEffectActive(state, 'STRONGHOLD_ZONE_REVEAL')) {
    const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - tilePos.y) / MAP.ZONE_HEIGHT);
    const zone = zoneIndex + 1;
    const endRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - (zone - 1) * MAP.ZONE_HEIGHT;
    const startRow = endRow - MAP.ZONE_HEIGHT + 1;
    for (let y = startRow; y <= endRow; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        if (state.grid[y]?.[x]) {
          state.grid[y][x].isRevealed = true;
        }
      }
    }
  }
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
  if (tile.terrainType !== TileType.MOUNTAIN) return;

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
