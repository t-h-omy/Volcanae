/**
 * Resource system module for Volcanae.
 * Implements resource production, recruitment, and unit spawning.
 */

import type { GameState, Building, Position, Tile, UnitPopulationCost } from './types';
import type { Draft } from 'immer';
import { Faction, BuildingType, UnitType, UnitTag, ResourceType, TechFlag } from './types';
import { RESOURCES, ABILITIES, UNIT_DEFINITIONS, POPULATION, CRYSTAL_CHAMBER_CONFIG, BUILDING_DEFINITIONS, TECH_TREE, MAGE } from './gameConfig';
import type { UnitCost } from './gameConfig';
import { getGrantedTags, getStatMods, getBuildingProductionMods, getFlatIncomeMods, grantArcaneCrystals, getStrongholdEffectiveCap, getRemovedTags, getCostMods } from './techSystem';
import { getTagsFromActiveSpecialists, isSpecialistEffectActive, getTagsFromActiveSpecialistsForSourceTag, getActiveEffectParams } from './specialistSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';

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
 * Returns the effective per-building housing cap for FARM/PATRICIANHOUSE.
 * Strongholds are excluded (they use getStrongholdEffectiveCap instead).
 */
export function getEffectiveHousingPopulationCap(
  state: GameState | Draft<GameState>,
  building: Building,
): number {
  if (building.type !== BuildingType.FARM && building.type !== BuildingType.PATRICIANHOUSE) {
    return building.populationCap;
  }

  const farmerBonus = Number(getActiveEffectParams(state, 'HOUSING_CAP_BONUS')?.amount ?? 0);
  const nobleBonus = Number(getActiveEffectParams(state, 'NOBLE_HOUSING_CAP_BONUS')?.amount ?? 0);
  const bonus = building.type === BuildingType.FARM ? farmerBonus : nobleBonus;
  const flatCap = building.populationCap + (Number.isFinite(bonus) ? bonus : 0);
  return flatCap;
}

/**
 * Returns the effective (tech adjusted) population caps for a Stronghold.
 * Wraps getStrongholdEffectiveCap and applies tech-provided flat bonuses.
 */
export function getStrongholdEffectiveCapWithDoctrines(
  state: GameState | Draft<GameState>,
): { farmerCap: number; nobleCap: number; totalCap: number } {
  const { farmerCap, nobleCap } = getStrongholdEffectiveCap(state);
  return { farmerCap, nobleCap, totalCap: farmerCap + nobleCap };
}

/** True if the building TYPE is a recruitment building (ignores state). */
export function isRecruitmentBuildingType(type: BuildingType): boolean {
  return (
    type === BuildingType.BARRACKS ||
    type === BuildingType.ARCHER_CAMP ||
    type === BuildingType.RIDER_CAMP ||
    type === BuildingType.SIEGE_CAMP ||
    type === BuildingType.STRONGHOLD ||
    type === BuildingType.CRYSTAL_CHAMBER ||
    type === BuildingType.CRYSTAL_CAVE
  );
}

/**
 * Permissive recruit check used by the map-layer badge: returns true for
 * any building whose TYPE can recruit, ignoring conditional state like
 * resonance. For CRYSTAL_CHAMBER this still requires that MAGE has been
 * unlocked by tech, so the badge doesn't appear before research.
 *
 * CRYSTAL_CAVE has no separate unlock — the cave only exists if the spell
 * is unlocked and was cast — so any existing cave can recruit.
 */
export function canBuildingEverRecruit(
  state: { unlockedUnits: UnitType[] },
  building: Building,
): boolean {
  if (!isRecruitmentBuildingType(building.type)) return false;
  if (building.type === BuildingType.CRYSTAL_CHAMBER) {
    return state.unlockedUnits.includes(UnitType.MAGE);
  }
  return true;
}

/**
 * Checks if a building is a recruitment building.
 *
 * CRYSTAL_CHAMBER and CRYSTAL_CAVE are both gated on `resonanceTurnsRemaining > 0` —
 * they may only recruit while resonance is active. (Recruiting does NOT consume a
 * resonance tick — the window decays only on its own end-of-turn schedule.)
 */
function isRecruitmentBuilding(building: Building): boolean {
  if (!isRecruitmentBuildingType(building.type)) return false;
  if (building.type === BuildingType.CRYSTAL_CHAMBER || building.type === BuildingType.CRYSTAL_CAVE) {
    return building.resonanceTurnsRemaining > 0;
  }
  return true;
}

/**
 * Gets an array of unit types that can be recruited from a building type.
 */
export function getRecruitableUnitTypes(buildingType: BuildingType): UnitType[] {
  switch (buildingType) {
    case BuildingType.BARRACKS:
      return [UnitType.SPEARMAN, UnitType.SWORDSMAN];
    case BuildingType.ARCHER_CAMP:
      return [UnitType.ARCHER, UnitType.CROSSBOWMAN];
    case BuildingType.RIDER_CAMP:
      return [UnitType.RIDER];
    case BuildingType.SIEGE_CAMP:
      return [UnitType.SIEGE];
    case BuildingType.STRONGHOLD:
      return [UnitType.SCOUT, UnitType.GUARD];
    case BuildingType.CRYSTAL_CHAMBER:
      return [UnitType.MAGE];
    case BuildingType.CRYSTAL_CAVE:
      return [UnitType.CRYSTAL_DRAKE];
    default:
      return [];
  }
}

/**
 * Computes the current unit count and cap for a recruitment building type.
 *
 * - `current`: number of player-owned units whose type can be recruited from this building.
 * - `limit`: (number of player-owned buildings of this type) × (unitLimit + RECRUIT_CAP_BONUS) from BUILDING_DEFINITIONS.
 *   Returns Infinity when the building type has no unitLimit defined (uncapped).
 *
 * For CRYSTAL_CAVE: when `specificBuildingId` is provided, returns per-cave usage
 * (current = number of drakes roosted to that cave, limit = CAVE_UNIT_LIMIT + bonus).
 * Without it, returns the global summary across all caves.
 */
export function computeRecruitmentBuildingUsage(
  state: Pick<GameState, 'units' | 'buildings'> & Partial<Pick<GameState, 'specialists' | 'globalSpecialistStorage'>>,
  buildingType: BuildingType,
  specificBuildingId?: string,
): { current: number; limit: number } {
  const baseUnitLimit = BUILDING_DEFINITIONS[buildingType]?.unitLimit;
  if (baseUnitLimit === undefined) {
    return { current: 0, limit: Infinity };
  }
  const recruitCapParams = state.specialists !== undefined && state.globalSpecialistStorage !== undefined
    ? getActiveEffectParams(state as GameState, 'RECRUIT_CAP_BONUS')
    : null;
  const bonusPerBuilding = recruitCapParams ? Number(recruitCapParams.amount) : 0;
  const unitLimit = baseUnitLimit + bonusPerBuilding;

  // CRYSTAL_CAVE: each cave has its own cap of 1 drake (enforced per-cave via roostBuildingId).
  // When specificBuildingId is provided, return per-cave usage so the caller can gate
  // recruitment on whether THIS cave already has a roosted drake.
  if (buildingType === BuildingType.CRYSTAL_CAVE) {
    if (specificBuildingId) {
      const current = Object.values(state.units).filter(
        (u) => u.faction === Faction.PLAYER && u.roostBuildingId === specificBuildingId,
      ).length;
      return { current, limit: unitLimit };
    }
    // Global summary (used for informational display when no specific cave is selected).
    let buildingCount = 0;
    const caveIds = new Set<string>();
    for (const building of Object.values(state.buildings)) {
      if (building.faction === Faction.PLAYER && building.type === BuildingType.CRYSTAL_CAVE) {
        buildingCount += 1;
        caveIds.add(building.id);
      }
    }
    let current = 0;
    for (const unit of Object.values(state.units)) {
      if (
        unit.faction === Faction.PLAYER &&
        unit.roostBuildingId &&
        caveIds.has(unit.roostBuildingId)
      ) {
        current += 1;
      }
    }
    return { current, limit: buildingCount * unitLimit };
  }

  const recruitableTypes = new Set(getRecruitableUnitTypes(buildingType));

  let current = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER && recruitableTypes.has(unit.type as UnitType)) {
      // Summoned units do not count toward building unit limits
      if (unit.tags.includes(UnitTag.SUMMONED)) continue;
      current += 1;
    }
  }

  let buildingCount = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.faction === Faction.PLAYER && building.type === buildingType) {
      buildingCount += 1;
    }
  }

  return { current, limit: buildingCount * unitLimit };
}

/**
 * Computes the effective iron+wood recruit cost for a unit type, including tech cost mods.
 * Returns null when the unit has no iron/wood cost (e.g. Crystal Drake).
 */
export function getEffectiveRecruitCost(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): { iron: number; wood: number } | null {
  const baseCost = UNIT_DEFINITIONS[unitType]?.cost;
  if (!baseCost || (baseCost.iron === 0 && baseCost.wood === 0 && baseCost.crystals !== undefined)) {
    return null;
  }
  const costMod = getCostMods(state, unitType);
  const iron = baseCost.iron + costMod.iron;
  const wood = baseCost.wood + costMod.wood;
  return { iron, wood };
}

// ============================================================================
// CHARCOAL KILN HELPERS
// ============================================================================

/**
 * Returns the number of active, non-disabled player Charcoal Kilns that are
 * within range of the given player-owned MINE or DEEP_MINE.
 *
 * Each in-range kiln contributes one additive bonus increment. Only player
 * kilns buff player mines; kilns with isDisabledForTurns > 0 grant no bonus.
 * When the KILN_BONUS specialist effect is active, the effective radius is
 * increased by ABILITIES.KILN_RADIUS_BONUS.
 */
export function getMineKilnBonusCount(
  state: GameState | Draft<GameState>,
  mine: Building,
): number {
  const radiusBonus = isSpecialistEffectActive(state, 'KILN_BONUS')
    ? ABILITIES.KILN_RADIUS_BONUS
    : 0;
  const effectiveRadius = RESOURCES.CHARCOAL_KILN_RADIUS + radiusBonus;
  let count = 0;
  for (const b of Object.values(state.buildings)) {
    if (
      b.faction === Faction.PLAYER &&
      b.type === BuildingType.CHARCOAL_KILN &&
      b.isDisabledForTurns <= 0 &&
      isTileWithinEdgeCircleRange(
        b.position.x, b.position.y,
        mine.position.x, mine.position.y,
        effectiveRadius,
      )
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Returns the iron bonus awarded per in-range Charcoal Kiln.
 * When the KILN_BONUS specialist effect is active, ABILITIES.KILN_IRON_BONUS
 * is added on top of the base CHARCOAL_KILN_IRON_BONUS.
 * Applies to both MINE and DEEP_MINE buildings.
 */
function getKilnIronBonusPerKiln(state: GameState | Draft<GameState>): number {
  const ironBonus = isSpecialistEffectActive(state, 'KILN_BONUS')
    ? ABILITIES.KILN_IRON_BONUS
    : 0;
  return RESOURCES.CHARCOAL_KILN_IRON_BONUS + ironBonus;
}

/** Backward-compatible boolean helper used by UI affordances. Returns true when the given MINE or DEEP_MINE is buffed by at least one active in-range kiln. */
export function isMineBuffedByKiln(
  state: GameState | Draft<GameState>,
  mine: Building,
): boolean {
  return getMineKilnBonusCount(state, mine) > 0;
}

/**
 * Collects resources from all player-owned, non-disabled resource buildings.
 * Production happens at the START of the player turn.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */

/**
 * Returns the set of building types currently owned by the player (active, non-disabled).
 * Used to gate flat income mods that require at least one specific building.
 */
function getActivePlayerBuildingTypes(
  state: GameState | Draft<GameState>,
): Set<BuildingType> {
  return new Set(
    Object.values(state.buildings)
      .filter((b) => b.faction === Faction.PLAYER && b.isDisabledForTurns === 0)
      .map((b) => b.type),
  );
}

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
      // Additive Charcoal Kiln bonus: each active in-range kiln adds one
      // increment to this mine (base + any KILN_BONUS specialist modifier).
      const kilnBonusCount = getMineKilnBonusCount(state, building);
      if (kilnBonusCount > 0) {
        state.resources.iron += getKilnIronBonusPerKiln(state) * kilnBonusCount;
      }
    } else if (building.type === BuildingType.DEEP_MINE) {
      state.resources.iron += RESOURCES.DEEP_MINE_IRON_PER_TURN;
      // Additive Charcoal Kiln bonus: each active in-range kiln adds one
      // increment to this deep mine (base + any KILN_BONUS specialist modifier).
      const kilnBonusCountDeep = getMineKilnBonusCount(state, building);
      if (kilnBonusCountDeep > 0) {
        state.resources.iron += getKilnIronBonusPerKiln(state) * kilnBonusCountDeep;
      }
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

  // Apply flat income mods once (independent of building count — requires ≥1 of the gate building)
  const playerBuildingTypes = getActivePlayerBuildingTypes(state);
  for (const mod of getFlatIncomeMods(state)) {
    if (playerBuildingTypes.has(mod.requiresBuilding)) {
      if (mod.resource === ResourceType.IRON) {
        state.resources.iron += mod.amount;
      } else if (mod.resource === ResourceType.WOOD) {
        state.resources.wood += mod.amount;
      }
    }
  }

  // Deduct recruitment building upkeep
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.isDisabledForTurns > 0) continue;
    const def = BUILDING_DEFINITIONS[building.type];
    const iron = def.upkeepIron ?? 0;
    const wood = def.upkeepWood ?? 0;
    if (iron === 0 && wood === 0) continue;
    // Deduct without pushing resources below zero
    state.resources.iron = Math.max(0, state.resources.iron - iron);
    state.resources.wood = Math.max(0, state.resources.wood - wood);
  }

  // Tick resonance for Crystal Chambers (grant crystals) and Crystal Caves (no crystals).
  for (const building of Object.values(state.buildings)) {
    if (
      building.faction !== Faction.PLAYER ||
      (building.type !== BuildingType.CRYSTAL_CHAMBER && building.type !== BuildingType.CRYSTAL_CAVE) ||
      building.resonanceTurnsRemaining <= 0
    ) {
      continue;
    }

    if (building.type === BuildingType.CRYSTAL_CHAMBER && building.isDisabledForTurns <= 0) {
      grantArcaneCrystals(state, CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN);
    }
    building.resonanceTurnsRemaining -= 1;
    if (building.type === BuildingType.CRYSTAL_CHAMBER && building.resonanceTurnsRemaining <= 0) {
      building.resonanceCrystalBonus = false;
    }
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
      // Additive Charcoal Kiln bonus (deterministic — always +integer).
      const kilnBonusCount = getMineKilnBonusCount(state, building);
      if (kilnBonusCount > 0) {
        ironPerTurn += getKilnIronBonusPerKiln(state) * kilnBonusCount;
      }
    } else if (building.type === BuildingType.DEEP_MINE) {
      ironPerTurn += RESOURCES.DEEP_MINE_IRON_PER_TURN;
      // Additive Charcoal Kiln bonus (deterministic — always +integer).
      const kilnBonusCountDeep = getMineKilnBonusCount(state, building);
      if (kilnBonusCountDeep > 0) {
        ironPerTurn += getKilnIronBonusPerKiln(state) * kilnBonusCountDeep;
      }
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

  // Flat income mods apply once when the player owns ≥1 of the required building
  const playerBuildingTypesForFlat = getActivePlayerBuildingTypes(state);
  for (const mod of getFlatIncomeMods(state)) {
    if (playerBuildingTypesForFlat.has(mod.requiresBuilding)) {
      if (mod.resource === ResourceType.IRON) {
        ironPerTurn += mod.amount;
      } else if (mod.resource === ResourceType.WOOD) {
        woodPerTurn += mod.amount;
      }
    }
  }

  return { ironPerTurn, woodPerTurn };
}

// ============================================================================
// RESOURCE INCOME BREAKDOWN (for HUD display)
// ============================================================================

/** A single line in the resource income breakdown */
export interface ResourceIncomeEntry {
  /** Human-readable source label */
  label: string;
  /** Iron amount (positive = income, negative = cost) */
  iron: number;
  /** Wood amount (positive = income, negative = cost) */
  wood: number;
}

/**
 * Returns a detailed, source-attributed breakdown of resource income for the
 * current player turn.  All amounts are deterministic expected values
 * (probabilistic bonuses are included as fractions).
 *
 * The breakdown mirrors the logic in `computeResourceIncome` and
 * `computeSpecialistUpkeep` exactly so UI numbers always match gameplay.
 */
export function computeResourceIncomeBreakdown(
  state: GameState | Draft<GameState>,
): ResourceIncomeEntry[] {
  const entries: ResourceIncomeEntry[] = [];

  // Pre-build a map from "buildingType|resource|amount|chance" → tech name so
  // attribution is O(techs × effects) once instead of per-building.
  const modKeyToTechName = new Map<string, string>();
  for (const t of TECH_TREE) {
    if (!state.techNodes[t.id]?.unlocked) continue;
    for (const e of t.effects) {
      if (e.type === 'BUILDING_PRODUCTION_MOD') {
        const key = `${e.buildingType}|${e.resource}|${e.amount}|${e.chancePercent}`;
        if (!modKeyToTechName.has(key)) {
          modKeyToTechName.set(key, t.name);
        }
      }
    }
  }

  // Per-building-type counters and per-tech bonus accumulators
  let mineCount = 0;
  let deepMineCount = 0;
  let woodcutterCount = 0;
  // Count total additive kiln bonus increments across all player mines.
  let kilnBonusIncrementCount = 0;
  const techIron: Record<string, number> = {};
  const techWood: Record<string, number> = {};

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.isDisabledForTurns > 0) continue;

    if (building.type === BuildingType.MINE) {
      mineCount++;
      kilnBonusIncrementCount += getMineKilnBonusCount(state, building);
    } else if (building.type === BuildingType.DEEP_MINE) {
      deepMineCount++;
      kilnBonusIncrementCount += getMineKilnBonusCount(state, building);
    } else if (building.type === BuildingType.WOODCUTTER) {
      woodcutterCount++;
    }

    for (const mod of getBuildingProductionMods(state, building.type)) {
      const expected = mod.amount * (mod.chancePercent / 100);
      const key = `${building.type}|${mod.resource}|${mod.amount}|${mod.chancePercent}`;
      const techName = modKeyToTechName.get(key) ?? 'Tech bonus';
      if (mod.resource === ResourceType.IRON) {
        techIron[techName] = (techIron[techName] ?? 0) + expected;
      } else if (mod.resource === ResourceType.WOOD) {
        techWood[techName] = (techWood[techName] ?? 0) + expected;
      }
    }
  }

  if (mineCount > 0) {
    entries.push({
      label: `Mine ×${mineCount}`,
      iron: mineCount * RESOURCES.MINE_IRON_PER_TURN,
      wood: 0,
    });
  }
  if (deepMineCount > 0) {
    entries.push({
      label: `Deep Mine ×${deepMineCount}`,
      iron: deepMineCount * RESOURCES.DEEP_MINE_IRON_PER_TURN,
      wood: 0,
    });
  }
  // Charcoal Kiln bonus — one line for all additive increments combined.
  if (kilnBonusIncrementCount > 0) {
    entries.push({
      label: `Charcoal Kiln bonus ×${kilnBonusIncrementCount}`,
      iron: kilnBonusIncrementCount * getKilnIronBonusPerKiln(state),
      wood: 0,
    });
  }
  if (woodcutterCount > 0) {
    entries.push({
      label: `Woodcutter ×${woodcutterCount}`,
      iron: 0,
      wood: woodcutterCount * RESOURCES.WOODCUTTER_WOOD_PER_TURN,
    });
  }

  // Tech-attributed building production bonuses
  const techNames = new Set([...Object.keys(techIron), ...Object.keys(techWood)]);
  for (const name of techNames) {
    const iron = techIron[name] ?? 0;
    const wood = techWood[name] ?? 0;
    entries.push({ label: name, iron, wood });
  }

  // Flat income mods — build a map of tech name → iron/wood for breakdown display
  const playerBuildingTypesForBreakdown = getActivePlayerBuildingTypes(state);
  const flatTechName = new Map<string, string>();
  for (const t of TECH_TREE) {
    if (!state.techNodes[t.id]?.unlocked) continue;
    for (const e of t.effects) {
      if (e.type === 'FLAT_INCOME_MOD') {
        flatTechName.set(`${e.resource}|${e.amount}|${e.requiresBuilding}`, t.name);
      }
    }
  }
  const flatIron: Record<string, number> = {};
  const flatWood: Record<string, number> = {};
  for (const mod of getFlatIncomeMods(state)) {
    if (!playerBuildingTypesForBreakdown.has(mod.requiresBuilding)) continue;
    const name = flatTechName.get(`${mod.resource}|${mod.amount}|${mod.requiresBuilding}`) ?? 'Tech bonus';
    if (mod.resource === ResourceType.IRON) {
      flatIron[name] = (flatIron[name] ?? 0) + mod.amount;
    } else if (mod.resource === ResourceType.WOOD) {
      flatWood[name] = (flatWood[name] ?? 0) + mod.amount;
    }
  }
  const flatNames = new Set([...Object.keys(flatIron), ...Object.keys(flatWood)]);
  for (const name of flatNames) {
    entries.push({ label: name, iron: flatIron[name] ?? 0, wood: flatWood[name] ?? 0 });
  }

  // Specialist upkeep (negative modifiers)
  for (const specId of state.globalSpecialistStorage) {
    const spec = state.specialists[specId];
    if (!spec || spec.dormant) continue;
    const iron = spec.upkeepIron ?? 0;
    const wood = spec.upkeepWood ?? 0;
    if (iron > 0 || wood > 0) {
      entries.push({
        label: `${spec.name} (upkeep)`,
        iron: -iron,
        wood: -wood,
      });
    }
  }

  // Recruitment building upkeep (negative modifiers), grouped by building type
  const buildingUpkeepIron: Partial<Record<BuildingType, number>> = {};
  const buildingUpkeepWood: Partial<Record<BuildingType, number>> = {};
  const buildingUpkeepCount: Partial<Record<BuildingType, number>> = {};
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.isDisabledForTurns > 0) continue;
    const def = BUILDING_DEFINITIONS[building.type];
    const iron = def.upkeepIron ?? 0;
    const wood = def.upkeepWood ?? 0;
    if (iron === 0 && wood === 0) continue;
    buildingUpkeepIron[building.type] = (buildingUpkeepIron[building.type] ?? 0) + iron;
    buildingUpkeepWood[building.type] = (buildingUpkeepWood[building.type] ?? 0) + wood;
    buildingUpkeepCount[building.type] = (buildingUpkeepCount[building.type] ?? 0) + 1;
  }
  for (const buildingType of Object.keys(buildingUpkeepCount) as BuildingType[]) {
    const count = buildingUpkeepCount[buildingType] ?? 0;
    const iron = buildingUpkeepIron[buildingType] ?? 0;
    const wood = buildingUpkeepWood[buildingType] ?? 0;
    const label = buildingType
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
    entries.push({
      label: `${label} ×${count} (upkeep)`,
      iron: -iron,
      wood: -wood,
    });
  }

  return entries;
}

/**
 * Computes the total specialist upkeep that will be deducted from player resources
 * each turn for all active (non-dormant) specialists in globalSpecialistStorage.
 *
 * Use this alongside computeResourceIncome to show the player their NET income
 * (gross income minus upkeep) so the two numbers are directly comparable.
 */
export function computeSpecialistUpkeep(
  state: GameState | Draft<GameState>,
): { ironUpkeep: number; woodUpkeep: number } {
  let ironUpkeep = 0;
  let woodUpkeep = 0;
  for (const specId of state.globalSpecialistStorage) {
    const spec = state.specialists[specId];
    if (!spec || spec.dormant) continue;
    ironUpkeep += spec.upkeepIron ?? 0;
    woodUpkeep += spec.upkeepWood ?? 0;
  }
  return { ironUpkeep, woodUpkeep };
}

/**
 * Computes the total recruitment building upkeep that will be deducted from
 * player resources each turn for all active (non-disabled) player-owned
 * recruitment buildings.
 *
 * Use this alongside computeResourceIncome and computeSpecialistUpkeep to
 * show the player their NET income so UI numbers always match gameplay.
 */
export function computeBuildingUpkeep(
  state: GameState | Draft<GameState>,
): { ironUpkeep: number; woodUpkeep: number } {
  let ironUpkeep = 0;
  let woodUpkeep = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.isDisabledForTurns > 0) continue;
    const def = BUILDING_DEFINITIONS[building.type];
    ironUpkeep += def.upkeepIron ?? 0;
    woodUpkeep += def.upkeepWood ?? 0;
  }
  return { ironUpkeep, woodUpkeep };
}

// ============================================================================
// CRYSTAL INCOME
// ============================================================================

/**
 * Returns the number of arcane crystals that would be granted this turn from
 * all current crystal income sources:
 * - resonating player-owned Crystal Chambers (deterministic base)
 * - Echo Warden resonance bonus (deterministic specialist bonus)
 * - Grave Harvest per-gravestone tech bonus (fractional expected value)
 * Matches gameplay expected value logic so UI numbers always match end-of-turn outcomes.
 */
export function computeCrystalIncomePerTurn(
  state: GameState | Draft<GameState>,
): {
  crystalsPerTurn: number;
  resonatingChambers: number;
  echoWardenBonus: number;
  echoWardenChambers: number;
  graveHarvestExpected: number;
  gravestoneCount: number;
} {
  let resonatingChambers = 0;
  let echoWardenChambers = 0;
  let gravestoneCount = 0;

  const echoWardenActive = isSpecialistEffectActive(state, 'RESONANCE_CRYSTAL_BONUS');
  const graveHarvestActive = state.techFlags.includes(TechFlag.GRAVE_HARVEST);

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;

    if (building.type === BuildingType.CRYSTAL_CHAMBER) {
      const isResonatingAndActive = building.isDisabledForTurns <= 0 && building.resonanceTurnsRemaining > 0;
      if (isResonatingAndActive) {
        resonatingChambers++;
      }
      if (
        echoWardenActive &&
        isResonatingAndActive &&
        building.resonanceCrystalBonus
      ) {
        echoWardenChambers++;
      }
    } else if (graveHarvestActive && building.type === BuildingType.GRAVESTONE) {
      gravestoneCount++;
    }
  }

  const baseCrystals = resonatingChambers * CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN;
  const echoWardenBonus = echoWardenChambers * ABILITIES.RESONANCE_BONUS_CRYSTALS;
  const graveHarvestExpected = gravestoneCount * (MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE / 100);

  return {
    crystalsPerTurn: baseCrystals + echoWardenBonus + graveHarvestExpected,
    resonatingChambers,
    echoWardenBonus,
    echoWardenChambers,
    graveHarvestExpected,
    gravestoneCount,
  };
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
    // Summoned units (EMBER_DEMON, SKELETON) do not consume population
    if (unit.tags.includes(UnitTag.SUMMONED)) continue;

    const cost = UNIT_DEFINITIONS[unit.type as UnitType]?.populationCost as UnitPopulationCost | undefined;
    if (cost) {
      farmersUsed += cost.farmers;
      noblesUsed += cost.nobles;
    }
  }

  return { farmersUsed, noblesUsed };
}

// ----------------------------------------------------------------------------
// POPULATION BREAKDOWN
// ----------------------------------------------------------------------------

/** A single entry in the capacity or usage breakdown for the population popup. */
export interface PopulationBreakdownEntry {
  /** Human-readable source label */
  label: string;
  /** Farmer contribution (positive integer) */
  farmers: number;
  /** Noble contribution (positive integer) */
  nobles: number;
}

/** A single unit-type usage entry for the population popup. */
export interface PopulationUsageEntry {
  /** The unit type, so the popup can look up display names / emojis */
  unitType: UnitType;
  /** How many of these units are currently fielded */
  count: number;
  /** Total farmers consumed by these units (count × cost.farmers) */
  farmers: number;
  /** Total nobles consumed by these units (count × cost.nobles) */
  nobles: number;
}

export interface PopulationBreakdown {
  capacityEntries: PopulationBreakdownEntry[];
  usageEntries: PopulationUsageEntry[];
  farmerCapacity: number;
  nobleCapacity: number;
  farmersUsed: number;
  noblesUsed: number;
}

/**
 * Returns a detailed, source-attributed breakdown of population capacity and
 * usage for the population info popups.
 *
 * Capacity entries mirror the logic in `computePopulationCapacity` exactly.
 * Usage entries mirror `computePopulationUsage`, aggregated by unit type.
 */
export function computePopulationBreakdown(
  state: GameState | Draft<GameState>,
): PopulationBreakdown {
  // ── Capacity breakdown ────────────────────────────────────────────────────
  let farmCount = 0;
  let farmFarmerCap = 0;
  let houseCount = 0;
  let houseNobleCap = 0;
  let strongholdCount = 0;
  let strongholdFarmerCap = 0;
  let strongholdNobleCap = 0;

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.type === BuildingType.FARM) {
      farmCount++;
      farmFarmerCap += building.populationCount;
    } else if (building.type === BuildingType.PATRICIANHOUSE) {
      houseCount++;
      houseNobleCap += building.populationCount;
    } else if (building.type === BuildingType.STRONGHOLD) {
      strongholdCount++;
      strongholdFarmerCap += building.populationCount;
      strongholdNobleCap += building.strongholdNobles;
    }
  }

  const capacityEntries: PopulationBreakdownEntry[] = [];

  if (farmCount > 0) {
    capacityEntries.push({
      label: `Farm ×${farmCount}`,
      farmers: farmFarmerCap,
      nobles: 0,
    });
  }
  if (houseCount > 0) {
    capacityEntries.push({
      label: `Patrician House ×${houseCount}`,
      farmers: 0,
      nobles: houseNobleCap,
    });
  }
  if (strongholdCount > 0) {
    const { farmerCap, nobleCap } = getStrongholdEffectiveCapWithDoctrines(state);
    capacityEntries.push({
      label: `Stronghold ×${strongholdCount} (max ${farmerCap}🌾 / ${nobleCap}🎖️ each)`,
      farmers: strongholdFarmerCap,
      nobles: strongholdNobleCap,
    });
  }

  const farmerCapacity = farmFarmerCap + strongholdFarmerCap;
  const nobleCapacity = houseNobleCap + strongholdNobleCap;

  // ── Usage breakdown ───────────────────────────────────────────────────────
  const unitTypeCounts = new Map<UnitType, number>();

  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.PLAYER) continue;
    if (unit.tags.includes(UnitTag.SUMMONED)) continue;
    const cost = UNIT_DEFINITIONS[unit.type as UnitType]?.populationCost as UnitPopulationCost | undefined;
    if (!cost || (cost.farmers === 0 && cost.nobles === 0)) continue;
    unitTypeCounts.set(unit.type as UnitType, (unitTypeCounts.get(unit.type as UnitType) ?? 0) + 1);
  }

  const usageEntries: PopulationUsageEntry[] = [];
  let farmersUsed = 0;
  let noblesUsed = 0;

  for (const [unitType, count] of unitTypeCounts.entries()) {
    const cost = UNIT_DEFINITIONS[unitType]?.populationCost as UnitPopulationCost | undefined;
    if (!cost) continue;
    const f = cost.farmers * count;
    const n = cost.nobles * count;
    usageEntries.push({ unitType, count, farmers: f, nobles: n });
    farmersUsed += f;
    noblesUsed += n;
  }

  return { capacityEntries, usageEntries, farmerCapacity, nobleCapacity, farmersUsed, noblesUsed };
}

/**
 * Returns the IDs of player units that should currently carry the HOMELESS tag.
 * Units are sorted by recruitedOnTurn descending (most recent first), then by id for
 * determinism. The "excess" units (the last ones recruited that pushed over the cap)
 * get the tag.
 */
export function computeHomelessUnitIds(state: GameState | Draft<GameState>): Set<string> {
  const { farmerCapacity, nobleCapacity } = computePopulationCapacity(state);
  const playerUnits = Object.values(state.units).filter(
    (u) => u.faction === Faction.PLAYER,
  );

  const homelessIds = new Set<string>();

  for (const resourceType of ['farmers', 'nobles'] as const) {
    const cap = resourceType === 'farmers' ? farmerCapacity : nobleCapacity;
    const unitsCostingThis = playerUnits
      .filter((u) => {
        const def = UNIT_DEFINITIONS[u.type as UnitType];
        const cost = def?.populationCost as UnitPopulationCost | undefined;
        return cost && cost[resourceType] > 0;
      })
      .sort((a, b) => {
        const ta = a.recruitedOnTurn ?? 0;
        const tb = b.recruitedOnTurn ?? 0;
        return tb !== ta ? tb - ta : b.id.localeCompare(a.id);
      });

    let used = 0;
    for (const u of unitsCostingThis) {
      const def = UNIT_DEFINITIONS[u.type as UnitType];
      const cost = (def?.populationCost as UnitPopulationCost | undefined)?.[resourceType] ?? 0;
      used += cost;
      if (used > cap) {
        homelessIds.add(u.id);
      }
    }
  }

  return homelessIds;
}

/**
 * Returns the set of player unit IDs that should carry the UNTRAINED tag.
 * A unit is untrained when the TOTAL number of player units recruited from its
 * building type exceeds the COMBINED capacity of all player buildings of that
 * type (capacity pools across all buildings of the same type).
 */
export function computeUntrainedUnitIds(
  state: Pick<GameState, 'units' | 'buildings'>,
): Set<string> {
  const untrainedIds = new Set<string>();

  const RECRUITING_BUILDING_TYPES: BuildingType[] = [
    BuildingType.BARRACKS,
    BuildingType.ARCHER_CAMP,
    BuildingType.RIDER_CAMP,
    BuildingType.SIEGE_CAMP,
    BuildingType.STRONGHOLD,
    BuildingType.CRYSTAL_CHAMBER,
  ];

  for (const buildingType of RECRUITING_BUILDING_TYPES) {
    const { current, limit } = computeRecruitmentBuildingUsage(state, buildingType);
    if (!isFinite(limit) || current <= limit) continue;

    const recruitableTypes = new Set(getRecruitableUnitTypes(buildingType));
    for (const unit of Object.values(state.units)) {
      if (unit.faction !== Faction.PLAYER) continue;
      if (!recruitableTypes.has(unit.type as UnitType)) continue;
      if (unit.tags.includes(UnitTag.SUMMONED)) continue;
      untrainedIds.add(unit.id);
    }
  }

  return untrainedIds;
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
      // Grow farmers and nobles separately, farmers first.
      // getStrongholdEffectiveCapWithDoctrines is the single source of truth for the cap.
      const { farmerCap, nobleCap } = getStrongholdEffectiveCapWithDoctrines(state);
      const canGrowFarmer = building.populationCount < farmerCap;
      const canGrowNoble = building.strongholdNobles < nobleCap;
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
    } else if (building.populationCount < getEffectiveHousingPopulationCap(state, building)) {
      building.populationGrowthCounter += 1;
      if (building.populationGrowthCounter >= POPULATION.HOUSE_GROWTH_INTERVAL) {
        building.populationCount += 1;
        building.populationGrowthCounter = 0;
      }
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

  // ── Cost validation ────────────────────────────────────────────────────────
  // Crystal Drake (Crystal Cave) is special: it costs arcane crystals rather
  // than iron/wood, and recruiting it does NOT consume a resonance tick (the
  // resonance window decays on its own end-of-turn schedule). All other units
  // use the standard iron/wood cost path.
  const isCrystalDrake = unitType === UnitType.CRYSTAL_DRAKE;
  let cost = { iron: 0, wood: 0 };
  if (isCrystalDrake) {
    const crystalCost = UNIT_DEFINITIONS[UnitType.CRYSTAL_DRAKE].cost.crystals ?? 0;
    if (state.arcaneCrystals < crystalCost) {
      return;
    }
  } else {
    const effectiveCost = getEffectiveRecruitCost(state, unitType);
    if (!effectiveCost) {
      return;
    }
    cost = effectiveCost;

    // Validate player can afford the unit
    if (!canAfford(state, cost)) {
      return;
    }
  }

  // Validate player has enough population capacity
  if (!canAffordPopulation(state, unitType)) {
    return;
  }

  // Validate recruitment building unit limit.
  // For CRYSTAL_CAVE: enforce per-cave (each cave may only host one drake).
  const { current, limit } = computeRecruitmentBuildingUsage(
    state,
    building.type,
    building.type === BuildingType.CRYSTAL_CAVE ? buildingId : undefined,
  );
  if (current >= limit) {
    return;
  }

  // Validate this building has not already recruited this turn
  if (building.lastRecruitmentTurn === state.turn) {
    return;
  }

  // Find spawn position — reject if no free tile available
  const spawnPosition = findSpawnPosition(state, building.position);
  if (spawnPosition === null) {
    return;
  }

  // Deduct resources
  if (isCrystalDrake) {
    state.arcaneCrystals -= UNIT_DEFINITIONS[UnitType.CRYSTAL_DRAKE].cost.crystals ?? 0;
  } else {
    state.resources.iron -= cost.iron;
    state.resources.wood -= cost.wood;
  }

  // Spawn the unit immediately, but flag it as having used all actions this turn
  const unitId = generateUnitId();
  const baseTags: UnitTag[] = [...(UNIT_DEFINITIONS[unitType]?.tags ?? [])];
  // Add any tags granted by unlocked techs
  for (const tag of getGrantedTags(state, unitType)) {
    if (!baseTags.includes(tag)) baseTags.push(tag);
  }
  // Add any tags granted by active specialists (GRANT_UNIT_TAG_ALL by unit type)
  for (const tag of getTagsFromActiveSpecialists(state, unitType)) {
    if (!baseTags.includes(tag)) baseTags.push(tag);
  }
  // Add any tags derived via GRANT_TAG_TO_UNITS_WITH_TAG (e.g. Hellbinder grants
  // RAGE+CLEAVE to units that carry the SUMMONED tag, such as Crystal Drake).
  for (const sourceTag of [...baseTags]) {
    for (const t of getTagsFromActiveSpecialistsForSourceTag(state, sourceTag)) {
      if (!baseTags.includes(t)) baseTags.push(t);
    }
  }
  // Remove any tags that unlocked techs strip (e.g. OUTRIDERS removes BUILDANDCAPTURE)
  const removedTags = getRemovedTags(state, unitType);
  const spawnTags = baseTags.filter((t) => !removedTags.includes(t));
  if (
    isSpecialistEffectActive(state, 'CINDERBORN_RECRUIT') &&
    state.lavaFrontRow - building.position.y <= ABILITIES.CINDERBORN_ROWS &&
    !spawnTags.includes(UnitTag.CINDERBORN)
  ) {
    spawnTags.push(UnitTag.CINDERBORN);
  }
  const cinderbornAttackBonus = spawnTags.includes(UnitTag.CINDERBORN)
    ? ABILITIES.CINDERBORN_ATTACK_BONUS
    : 0;

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
      attack: UNIT_DEFINITIONS[unitType].attack + cinderbornAttackBonus,
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
    hasTradedThisTurn: false,
    hasConstructedThisTurn: !isReady,
    hasDestroyedThisTurn: !isReady,
    spellsCastThisTurn: 0,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    recruitedOnTurn: state.turn,
    // Crystal Drake is life-bound to the Crystal Cave that summoned it.
    // The shared `cleanupRoostedUnits` hook removes the drake whenever the
    // cave is removed from state.buildings (lava/capture/conversion/etc.).
    roostBuildingId: isCrystalDrake ? buildingId : undefined,
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

  // Mark this building as having recruited this turn
  building.lastRecruitmentTurn = state.turn;

  // Update recruitment stats
  state.gameStats.unitsRecruited += 1;
}
