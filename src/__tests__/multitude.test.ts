/**
 * Tests for SP-23 The Matriarch (spec_23): POP_DOUBLING_DOCTRINE
 *
 * 1. ×2 population cap for FARM/PATRICIANHOUSE (after HOUSING_CAP_BONUS flat bonus)
 * 2. ×2 population cap for STRONGHOLD (after tech flat bonuses)
 * 3. ×2 recruitment-building unitLimit at the cap read
 * 4. Recruit cost ×0.5 ceil (iron+wood)
 * 5. Spawn maxHp ×0.5 ceil — birth-time only
 */
import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  BUILDING_DEFINITIONS,
  MAP,
  POPULATION,
  UNIT_DEFINITIONS,
} from '../gameConfig';
import {
  computeRecruitmentBuildingUsage,
  getEffectiveHousingPopulationCap,
  getEffectiveRecruitCost,
  getStrongholdEffectiveCapWithDoctrines,
  growHousePopulations,
  recruitUnit,
} from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Tile } from '../types';
import type { Draft } from 'immer';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTile(x: number, y: number): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status: null,
    hasCaveMonster: false,
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeBuilding(
  id: string,
  type: BuildingType,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    ...overrides,
  };
}

function makeBaseState(withMultitude: boolean, extraBuildings: Record<string, Building> = {}): GameState {
  const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, 0, 0, {
    populationCount: 0,
    strongholdNobles: 0,
  });
  const grid = makeGrid();
  grid[stronghold.position.y][stronghold.position.x].buildingId = stronghold.id;
  for (const b of Object.values(extraBuildings)) {
    grid[b.position.y][b.position.x].buildingId = b.id;
  }

  return {
    turn: 1,
    phase: undefined as unknown as GameState['phase'],
    units: {},
    buildings: { [stronghold.id]: stronghold, ...extraBuildings },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: withMultitude ? ['spec_23'] : [],
    resources: { iron: 999, wood: 999 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 0,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    gameStats: {
      unitsKilled: 0,
      unitsLost: 0,
      damageDealt: 0,
      damageReceived: 0,
      unitsRecruited: 0,
      buildingsConstructed: 0,
      buildingsConverted: 0,
      techsUnlocked: 0,
      enemyBuildingsDestroyed: 0,
      enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0,
      buildingsCapturedByEnemy: 0,
      buildingsDestroyedByLava: 0,
    },
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: undefined as unknown as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    seenHints: [],
  };
}

// ── 1. Population cap doubling: FARM and PATRICIANHOUSE ───────────────────────

describe('SP-23 POP_DOUBLING_DOCTRINE — housing cap ×2', () => {
  it('doubles the cap for Farm when active', () => {
    const farm = makeBuilding('farm', BuildingType.FARM, 2, 0, {
      populationCap: POPULATION.FARM_POPULATION_CAP,
    });
    const state = makeBaseState(true, { [farm.id]: farm });
    expect(getEffectiveHousingPopulationCap(state, farm)).toBe(POPULATION.FARM_POPULATION_CAP * 2);
  });

  it('doubles the cap for Patrician House when active', () => {
    const house = makeBuilding('house', BuildingType.PATRICIANHOUSE, 2, 0, {
      populationCap: POPULATION.PATRICIAN_HOUSE_POPULATION_CAP,
    });
    const state = makeBaseState(true, { [house.id]: house });
    expect(getEffectiveHousingPopulationCap(state, house)).toBe(POPULATION.PATRICIAN_HOUSE_POPULATION_CAP * 2);
  });

  it('does not double FARM cap when inactive', () => {
    const farm = makeBuilding('farm', BuildingType.FARM, 2, 0, {
      populationCap: POPULATION.FARM_POPULATION_CAP,
    });
    const state = makeBaseState(false, { [farm.id]: farm });
    expect(getEffectiveHousingPopulationCap(state, farm)).toBe(POPULATION.FARM_POPULATION_CAP);
  });

  it('applies ×2 after HOUSING_CAP_BONUS flat bonus: (base + flat) * 2', () => {
    // Hearthsteward (spec_14) provides HOUSING_CAP_BONUS
    const farm = makeBuilding('farm', BuildingType.FARM, 2, 0, {
      populationCap: POPULATION.FARM_POPULATION_CAP,
    });
    const state = makeBaseState(true, { [farm.id]: farm });
    // also add hearthsteward
    state.globalSpecialistStorage.push('spec_14');
    const flatBonus = ABILITIES.HOUSING_CAP_BONUS;
    expect(getEffectiveHousingPopulationCap(state, farm)).toBe(
      (POPULATION.FARM_POPULATION_CAP + flatBonus) * 2,
    );
  });

  it('allows Farm to grow beyond base cap when doctrine is active', () => {
    const cap = POPULATION.FARM_POPULATION_CAP;
    const farm = makeBuilding('farm', BuildingType.FARM, 2, 0, {
      populationCap: cap,
      populationCount: cap,
      populationGrowthCounter: POPULATION.HOUSE_GROWTH_INTERVAL - 1,
    });
    const state = makeBaseState(true, { [farm.id]: farm });
    growHousePopulations(state as Draft<GameState>);
    expect(farm.populationCount).toBe(cap + 1);
  });

  it('stops Farm growth at doubled cap', () => {
    const cap = POPULATION.FARM_POPULATION_CAP;
    const farm = makeBuilding('farm', BuildingType.FARM, 2, 0, {
      populationCap: cap,
      populationCount: cap * 2,
      populationGrowthCounter: POPULATION.HOUSE_GROWTH_INTERVAL - 1,
    });
    const state = makeBaseState(true, { [farm.id]: farm });
    growHousePopulations(state as Draft<GameState>);
    expect(farm.populationCount).toBe(cap * 2); // no growth at doubled cap
  });
});

// ── 2. Stronghold cap doubling ────────────────────────────────────────────────

describe('SP-23 POP_DOUBLING_DOCTRINE — stronghold cap ×2', () => {
  it('doubles farmerCap and nobleCap when active', () => {
    const state = makeBaseState(true);
    const { farmerCap, nobleCap, totalCap } = getStrongholdEffectiveCapWithDoctrines(state);
    expect(farmerCap).toBe(POPULATION.STRONGHOLD_FARMER_CAP * 2);
    expect(nobleCap).toBe(POPULATION.STRONGHOLD_NOBLE_CAP * 2);
    expect(totalCap).toBe((POPULATION.STRONGHOLD_FARMER_CAP + POPULATION.STRONGHOLD_NOBLE_CAP) * 2);
  });

  it('returns base caps when inactive', () => {
    const state = makeBaseState(false);
    const { farmerCap, nobleCap } = getStrongholdEffectiveCapWithDoctrines(state);
    expect(farmerCap).toBe(POPULATION.STRONGHOLD_FARMER_CAP);
    expect(nobleCap).toBe(POPULATION.STRONGHOLD_NOBLE_CAP);
  });

  it('allows Stronghold farmer to grow beyond base cap when doctrine is active', () => {
    const stronghold = makeBuilding('sh', BuildingType.STRONGHOLD, 0, 0, {
      populationCount: POPULATION.STRONGHOLD_FARMER_CAP,
      strongholdNobles: 0,
      populationGrowthCounter: POPULATION.HOUSE_GROWTH_INTERVAL - 1,
    });
    const state = makeBaseState(true, { [stronghold.id]: stronghold });
    // Remove the default stronghold and use our custom one
    delete state.buildings['stronghold'];
    state.grid[0][0].buildingId = stronghold.id;
    growHousePopulations(state as Draft<GameState>);
    expect(state.buildings[stronghold.id].populationCount).toBe(POPULATION.STRONGHOLD_FARMER_CAP + 1);
  });
});

// ── 3. unitLimit ×2 for recruit buildings ──────────────────────────────────────

describe('SP-23 POP_DOUBLING_DOCTRINE — unitLimit ×2', () => {
  it('doubles the unit limit for BARRACKS when active', () => {
    const barracks = makeBuilding('b1', BuildingType.BARRACKS, 3, 0);
    const state = makeBaseState(true, { [barracks.id]: barracks });
    const barracksLimit = BUILDING_DEFINITIONS[BuildingType.BARRACKS]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(barracksLimit * 2);
  });

  it('does not double the unit limit when inactive', () => {
    const barracks = makeBuilding('b1', BuildingType.BARRACKS, 3, 0);
    const state = makeBaseState(false, { [barracks.id]: barracks });
    const barracksLimit = BUILDING_DEFINITIONS[BuildingType.BARRACKS]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(barracksLimit);
  });

  it('doubles limit for STRONGHOLD when active', () => {
    const state = makeBaseState(true);
    const shLimit = BUILDING_DEFINITIONS[BuildingType.STRONGHOLD]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(shLimit * 2); // 1 stronghold in baseState
  });
});

// ── 4. Recruit cost ×0.5 ceil ─────────────────────────────────────────────────

describe('SP-23 POP_DOUBLING_DOCTRINE — recruit cost ×0.5 ceil', () => {
  it('halves (ceil) iron+wood cost for SPEARMAN when active', () => {
    const def = UNIT_DEFINITIONS[UnitType.SPEARMAN];
    const state = makeBaseState(true);
    const cost = getEffectiveRecruitCost(state, UnitType.SPEARMAN);
    expect(cost).not.toBeNull();
    expect(cost!.iron).toBe(Math.ceil(def.cost.iron * 0.5));
    expect(cost!.wood).toBe(Math.ceil(def.cost.wood * 0.5));
  });

  it('returns full cost when inactive', () => {
    const def = UNIT_DEFINITIONS[UnitType.SPEARMAN];
    const state = makeBaseState(false);
    const cost = getEffectiveRecruitCost(state, UnitType.SPEARMAN);
    expect(cost).not.toBeNull();
    expect(cost!.iron).toBe(def.cost.iron);
    expect(cost!.wood).toBe(def.cost.wood);
  });

  it('deducts halved cost from resources on recruit', () => {
    const barracks = makeBuilding('barracks', BuildingType.BARRACKS, 4, 4);
    const state = makeBaseState(true, { [barracks.id]: barracks });
    state.grid[4][4].buildingId = barracks.id;
    // Give population capacity
    state.buildings['stronghold'].populationCount = 5;
    state.buildings['stronghold'].strongholdNobles = 5;

    const def = UNIT_DEFINITIONS[UnitType.SPEARMAN];
    const expectedIron = Math.ceil(def.cost.iron * 0.5);
    const expectedWood = Math.ceil(def.cost.wood * 0.5);
    const ironBefore = state.resources.iron;
    const woodBefore = state.resources.wood;

    recruitUnit(state as Draft<GameState>, 'barracks', UnitType.SPEARMAN);

    expect(state.resources.iron).toBe(ironBefore - expectedIron);
    expect(state.resources.wood).toBe(woodBefore - expectedWood);
  });
});

// ── 5. Spawn maxHp ×0.5 ceil ─────────────────────────────────────────────────

describe('SP-23 POP_DOUBLING_DOCTRINE — spawn maxHp ×0.5 ceil', () => {
  it('sets spawned unit maxHp to ceil(baseMaxHp * 0.5) when active', () => {
    const barracks = makeBuilding('barracks', BuildingType.BARRACKS, 4, 4);
    const state = makeBaseState(true, { [barracks.id]: barracks });
    state.grid[4][4].buildingId = barracks.id;
    state.buildings['stronghold'].populationCount = 5;
    state.buildings['stronghold'].strongholdNobles = 5;

    recruitUnit(state as Draft<GameState>, 'barracks', UnitType.SPEARMAN);

    const spawnedUnit = Object.values(state.units).find((u) => u.type === UnitType.SPEARMAN);
    expect(spawnedUnit).toBeDefined();
    const expectedHp = Math.ceil(UNIT_DEFINITIONS[UnitType.SPEARMAN].maxHp * 0.5);
    expect(spawnedUnit!.stats.maxHp).toBe(expectedHp);
    expect(spawnedUnit!.stats.currentHp).toBe(expectedHp);
  });

  it('spawns unit at full maxHp when doctrine is inactive', () => {
    const barracks = makeBuilding('barracks', BuildingType.BARRACKS, 4, 4);
    const state = makeBaseState(false, { [barracks.id]: barracks });
    state.grid[4][4].buildingId = barracks.id;
    state.buildings['stronghold'].populationCount = 5;
    state.buildings['stronghold'].strongholdNobles = 5;

    recruitUnit(state as Draft<GameState>, 'barracks', UnitType.SPEARMAN);

    const spawnedUnit = Object.values(state.units).find((u) => u.type === UnitType.SPEARMAN);
    expect(spawnedUnit).toBeDefined();
    expect(spawnedUnit!.stats.maxHp).toBe(UNIT_DEFINITIONS[UnitType.SPEARMAN].maxHp);
    expect(spawnedUnit!.stats.currentHp).toBe(UNIT_DEFINITIONS[UnitType.SPEARMAN].maxHp);
  });

  it('applies ceil: odd base maxHp rounds up', () => {
    // Use SCOUT which has maxHp that may be odd; verify ceil behavior
    const stronghold = makeBuilding('sh2', BuildingType.STRONGHOLD, 2, 2);
    const state = makeBaseState(true, { [stronghold.id]: stronghold });
    state.grid[2][2].buildingId = stronghold.id;
    delete state.buildings['stronghold'];
    state.buildings['sh2'].populationCount = 5;
    state.buildings['sh2'].strongholdNobles = 5;

    const scoutMaxHp = UNIT_DEFINITIONS[UnitType.SCOUT].maxHp;
    recruitUnit(state as Draft<GameState>, 'sh2', UnitType.SCOUT);

    const spawnedUnit = Object.values(state.units).find((u) => u.type === UnitType.SCOUT);
    expect(spawnedUnit).toBeDefined();
    expect(spawnedUnit!.stats.maxHp).toBe(Math.ceil(scoutMaxHp * 0.5));
  });
});
