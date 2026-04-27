/**
 * Resource system module for Volcanae.
 * Implements resource production, recruitment, and unit spawning.
 */

import type { GameState, Building, Position, Tile, UnitPopulationCost } from './types';
import type { Draft } from 'immer';
import { Faction, BuildingType, UnitType, UnitTag, ResourceType } from './types';
import { RESOURCES, UNIT_DEFINITIONS, POPULATION, CRYSTAL_CHAMBER_CONFIG } from './gameConfig';
import type { UnitCost } from './gameConfig';
import { getGrantedTags, getStatMods, getBuildingProductionMods, grantArcaneCrystals, getStrongholdCapMods, getRemovedTags, getCostMods } from './techSystem';
import { getTagsFromActiveSpecialists } from './specialistSystem';

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

    // Apply bonus production from unlocked tech effects (BUILDING_PRODUCTION_MOD)
    for (const mod of getBuildingProductionMods(state, building.type)) {
      if (Math.random() * 100 < mod.chancePercent) {
        if (mod.resource === ResourceType.IRON) {
          state.resources.iron += mod.amount;
        } else if (mod.resource === ResourceType.WOOD) {
          state.resources.wood += mod.amount;
        }
      }
    }
  }

  // Tick Crystal Chamber resonance: grant arcane crystals and decrement counter
  for (const building of Object.values(state.buildings)) {
    if (
      building.faction !== Faction.PLAYER ||
      building.type !== BuildingType.CRYSTAL_CHAMBER ||
      building.isDisabledForTurns > 0 ||
      building.resonanceTurnsRemaining <= 0
    ) {
      continue;
    }

    grantArcaneCrystals(state, CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN);
    building.resonanceTurnsRemaining -= 1;
  }
}

// ============================================================================
// RESOURCE INCOME
// ============================================================================

/**
 * Computes the guaranteed (deterministic) resource income per turn from all
 * player-owned, non-disabled resource buildings plus unlocked tech bonuses.
 * Probabilistic bonuses (chancePercent < 100) are included as fractional amounts.
 *
 * @returns ironPerTurn and woodPerTurn
 */
export function computeResourceIncome(
  state: GameState | Draft<GameState>,
): { ironPerTurn: number; woodPerTurn: number } {
  let ironPerTurn = 0;
  let woodPerTurn = 0;

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.isDisabledForTurns > 0) continue;

    if (building.type === BuildingType.MINE) {
      ironPerTurn += RESOURCES.MINE_IRON_PER_TURN;
    } else if (building.type === BuildingType.WOODCUTTER) {
      woodPerTurn += RESOURCES.WOODCUTTER_WOOD_PER_TURN;
    }

    for (const mod of getBuildingProductionMods(state, building.type)) {
      const expected = mod.amount * (mod.chancePercent / 100);
      if (mod.resource === ResourceType.IRON) {
        ironPerTurn += expected;
      } else if (mod.resource === ResourceType.WOOD) {
        woodPerTurn += expected;
      }
    }
  }

  return { ironPerTurn, woodPerTurn };
}

// ============================================================================
// POPULATION SYSTEM
// ============================================================================

/** Default population cost for unit types not in UNIT_DEFINITIONS */
const DEFAULT_POPULATION_COST: UnitPopulationCost = { farmers: 0, nobles: 0 };

/**
 * Computes the total population capacity from all player-owned housing buildings.
 * farmerCapacity = sum of populationCount for all player-owned FARM buildings
 * nobleCapacity = sum of populationCount for all player-owned PATRICIANHOUSE buildings
 */
export function computePopulationCapacity(
  state: GameState | Draft<GameState>
): { farmerCapacity: number; nobleCapacity: number } {
  let farmerCapacity = 0;
  let nobleCapacity = 0;

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;

    if (building.type === BuildingType.FARM) {
      farmerCapacity += building.populationCount;
    } else if (building.type === BuildingType.PATRICIANHOUSE) {
      nobleCapacity += building.populationCount;
    } else if (building.type === BuildingType.STRONGHOLD) {
      // Stronghold tracks farmers (populationCount) and nobles (strongholdNobles) separately
      farmerCapacity += building.populationCount;
      nobleCapacity += building.strongholdNobles;
    }
  }

  return { farmerCapacity, nobleCapacity };
}

/**
 * Computes the total population usage from all player-owned units.
 * Sums UNIT_DEFINITIONS[unit.type].populationCost for each player unit.
 */
export function computePopulationUsage(
  state: GameState | Draft<GameState>
): { farmersUsed: number; noblesUsed: number } {
  let farmersUsed = 0;
  let noblesUsed = 0;

  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.PLAYER) continue;

    const cost = UNIT_DEFINITIONS[unit.type as UnitType]?.populationCost as UnitPopulationCost | undefined;
    if (cost) {
      farmersUsed += cost.farmers;
      noblesUsed += cost.nobles;
    }
  }

  return { farmersUsed, noblesUsed };
}

/**
 * Checks if the player has enough population capacity to recruit a unit of the given type.
 * Farmer capacity and noble capacity are checked independently:
 * - If the unit costs farmers, ensures farmer usage + cost <= farmer capacity.
 * - If the unit costs nobles, ensures noble usage + cost <= noble capacity.
 * A shortfall in one pool does not block recruitment of units that only use the other pool.
 */
export function canAffordPopulation(
  state: GameState | Draft<GameState>,
  unitType: UnitType
): boolean {
  const capacity = computePopulationCapacity(state);
  const usage = computePopulationUsage(state);
  const cost = (UNIT_DEFINITIONS[unitType]?.populationCost as UnitPopulationCost | undefined) ?? DEFAULT_POPULATION_COST;

  const farmerOk = cost.farmers === 0 || usage.farmersUsed + cost.farmers <= capacity.farmerCapacity;
  const nobleOk = cost.nobles === 0 || usage.noblesUsed + cost.nobles <= capacity.nobleCapacity;

  return farmerOk && nobleOk;
}

/**
 * Grows population in all player-owned FARM, PATRICIANHOUSE, and STRONGHOLD buildings.
 * For each housing building below its populationCap:
 * - Increments populationGrowthCounter
 * - When counter reaches HOUSE_GROWTH_INTERVAL, increments populationCount and resets counter
 * After all buildings are updated, recomputes state.resources.farmers and state.resources.nobles.
 *
 * Call at the start of the player turn (alongside collectResources).
 */
export function growHousePopulations(state: Draft<GameState>): void {
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;

    if (
      building.type !== BuildingType.FARM &&
      building.type !== BuildingType.PATRICIANHOUSE &&
      building.type !== BuildingType.STRONGHOLD
    ) {
      continue;
    }

    if (building.type === BuildingType.STRONGHOLD) {
      // Grow farmers and nobles separately, farmers first
      const { farmerMod, nobleMod } = getStrongholdCapMods(state);
      const effectiveFarmerCap = POPULATION.STRONGHOLD_FARMER_CAP + farmerMod;
      const effectiveNobleCap = POPULATION.STRONGHOLD_NOBLE_CAP + nobleMod;
      const canGrowFarmer = building.populationCount < effectiveFarmerCap;
      const canGrowNoble = building.strongholdNobles < effectiveNobleCap;
      if (canGrowFarmer || canGrowNoble) {
        building.populationGrowthCounter += 1;
        if (building.populationGrowthCounter >= POPULATION.HOUSE_GROWTH_INTERVAL) {
          if (canGrowFarmer) {
            building.populationCount += 1;
          } else {
            building.strongholdNobles += 1;
          }
          building.populationGrowthCounter = 0;
        }
      }
    } else if (building.populationCount < building.populationCap) {
      building.populationGrowthCounter += 1;
      if (building.populationGrowthCounter >= POPULATION.HOUSE_GROWTH_INTERVAL) {
        building.populationCount += 1;
        building.populationGrowthCounter = 0;
      }
    }
  }

  // Recompute resource capacity after growth
  const capacity = computePopulationCapacity(state);
  state.resources.farmers = capacity.farmerCapacity;
  state.resources.nobles = capacity.nobleCapacity;
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

  // Get unit cost and apply any UNIT_COST_MOD from unlocked techs
  const baseCost = UNIT_DEFINITIONS[unitType]?.cost;
  if (!baseCost) {
    return;
  }
  const costMod = getCostMods(state, unitType);
  const cost = {
    iron: baseCost.iron + costMod.iron,
    wood: baseCost.wood + costMod.wood,
  };

  // Validate player can afford the unit
  if (!canAfford(state, cost)) {
    return;
  }

  // Validate player has enough population capacity
  if (!canAffordPopulation(state, unitType)) {
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
  const baseTags: UnitTag[] = [...(UNIT_DEFINITIONS[unitType]?.tags ?? [])];
  // Add any tags granted by unlocked techs
  for (const tag of getGrantedTags(state, unitType)) {
    if (!baseTags.includes(tag)) baseTags.push(tag);
  }
  // Add any tags granted by active specialists
  for (const tag of getTagsFromActiveSpecialists(state, unitType)) {
    if (!baseTags.includes(tag)) baseTags.push(tag);
  }
  // Remove any tags that unlocked techs strip (e.g. OUTRIDERS removes BUILDANDCAPTURE)
  const removedTags = getRemovedTags(state, unitType);
  const spawnTags = baseTags.filter((t) => !removedTags.includes(t));

  // READY: unit can act immediately after recruitment
  const isReady = spawnTags.includes(UnitTag.READY);

  state.units[unitId] = {
    id: unitId,
    type: unitType,
    faction: Faction.PLAYER,
    position: { ...spawnPosition },
    stats: {
      maxHp: UNIT_DEFINITIONS[unitType].maxHp,
      currentHp: UNIT_DEFINITIONS[unitType].maxHp,
      attack: UNIT_DEFINITIONS[unitType].attack,
      defense: UNIT_DEFINITIONS[unitType].defense,
      moveRange: UNIT_DEFINITIONS[unitType].moveRange,
      discoverRadius: UNIT_DEFINITIONS[unitType].discoverRadius,
      triggerRange: UNIT_DEFINITIONS[unitType].triggerRange,
      movementActions: UNIT_DEFINITIONS[unitType].movementActions,
      attackRange: UNIT_DEFINITIONS[unitType].attackRange,
    },
    tags: spawnTags,
    hasMovedThisTurn: !isReady,
    hasAttackedThisTurn: !isReady,
    hasCapturedThisTurn: !isReady,
    hasConstructedThisTurn: !isReady,
    hasDestroyedThisTurn: !isReady,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
  const unit = state.units[unitId];
  for (const mod of getStatMods(state, unitType)) {
    if (mod.mode === 'add') {
      (unit.stats[mod.stat] as number) += mod.value;
    } else {
      (unit.stats[mod.stat] as number) = Math.round(
        (unit.stats[mod.stat] as number) * (1 + mod.value / 100),
      );
    }
  }
  // Ensure current HP matches the (possibly boosted) max HP for a freshly recruited unit
  unit.stats.currentHp = unit.stats.maxHp;

  // Place unit on the grid
  state.grid[spawnPosition.y][spawnPosition.x].unitId = unitId;

  // Update recruitment stats
  state.gameStats.unitsRecruited += 1;
}
