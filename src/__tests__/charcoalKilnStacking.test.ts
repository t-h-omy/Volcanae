import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { RESOURCES, ABILITIES, SPECIALIST_DEFINITIONS } from '../gameConfig';
import { collectResources, computeResourceIncome, computeResourceIncomeBreakdown, getMineKilnBonusCount } from '../resourceSystem';
import { BuildingType, DestroyBehavior, Faction, TileType } from '../types';
import type { Building, GameState, GameStats, Specialist, Tile } from '../types';

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

function makeBuilding(
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id: nextId(`bld_${type}`),
    type,
    faction,
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
  };
}

function makeGrid(cols: number, rows: number): Tile[][] {
  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => makeTile(x, y)),
  );
}

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
  };
}

function makeState(buildings: Building[]): GameState {
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  return {
    units: {},
    buildings: buildingsMap,
    grid: makeGrid(20, 20),
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 3,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow: 100,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techNodes: {} as GameState['techNodes'],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    portals: {},
    phase: 'PLAYER_TURN' as GameState['phase'],
  } as unknown as GameState;
}

/** Creates a state with the Ashwright (spec_07 / KILN_BONUS) specialist active. */
function makeStateWithKilnBonus(buildings: Building[]): GameState {
  const state = makeState(buildings);
  const specDef = SPECIALIST_DEFINITIONS.spec_07;
  const specialist: Specialist = {
    id: 'spec_07',
    name: specDef.name,
    description: specDef.description,
    effects: specDef.effects as Specialist['effects'],
    assignedBuildingId: null,
    upkeepIron: specDef.upkeepIron,
    upkeepWood: specDef.upkeepWood,
    dormant: false,
  };
  state.specialists = { spec_07: specialist };
  state.globalSpecialistStorage = ['spec_07'];
  return state;
}

describe('Charcoal Kiln additive stacking', () => {
  it('counts only active in-range player kilns', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    const kilnA = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10, 8);
    const kilnB = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 12, 10);
    const disabledKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 9, 10, { isDisabledForTurns: 1 });
    const enemyKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.ENEMY, 11, 10);
    const farKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 16, 10);
    const state = makeState([mine, kilnA, kilnB, disabledKiln, enemyKiln, farKiln]);

    expect(getMineKilnBonusCount(state, mine)).toBe(2);
  });

  it('adds one iron bonus increment per in-range kiln', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    const kilnA = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10, 8);
    const kilnB = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 12, 10);
    const state = makeState([mine, kilnA, kilnB]);

    const result = produce(state, (draft) => { collectResources(draft); });
    expect(result.resources.iron).toBe(
      RESOURCES.MINE_IRON_PER_TURN + RESOURCES.CHARCOAL_KILN_IRON_BONUS * 2,
    );
  });

  it('matches additive bonus in deterministic income and breakdown', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    const kilnA = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10, 8);
    const kilnB = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 12, 10);
    const state = makeState([mine, kilnA, kilnB]);

    const income = computeResourceIncome(state);
    expect(income.ironPerTurn).toBe(
      RESOURCES.MINE_IRON_PER_TURN + RESOURCES.CHARCOAL_KILN_IRON_BONUS * 2,
    );

    const breakdown = computeResourceIncomeBreakdown(state);
    const kilnEntry = breakdown.find((entry) => entry.label === 'Charcoal Kiln bonus ×2');
    expect(kilnEntry).toBeDefined();
    expect(kilnEntry?.iron).toBe(RESOURCES.CHARCOAL_KILN_IRON_BONUS * 2);
  });
});

describe('KILN_BONUS specialist (Ashwright)', () => {
  // CHARCOAL_KILN_RADIUS = 2, KILN_RADIUS_BONUS = 1 → effective radius 3
  const BASE_RADIUS = RESOURCES.CHARCOAL_KILN_RADIUS;
  const EXTENDED_RADIUS = BASE_RADIUS + ABILITIES.KILN_RADIUS_BONUS;

  it('without KILN_BONUS, a kiln at the edge of the extended radius is not counted', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    // Place kiln exactly EXTENDED_RADIUS tiles away (just outside base radius)
    const edgeKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10 + EXTENDED_RADIUS, 10);
    const state = makeState([mine, edgeKiln]);

    expect(getMineKilnBonusCount(state, mine)).toBe(0);
  });

  it('with KILN_BONUS active, a kiln at the extended radius boundary is counted', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    // Place kiln exactly EXTENDED_RADIUS tiles away
    const edgeKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10 + EXTENDED_RADIUS, 10);
    const state = makeStateWithKilnBonus([mine, edgeKiln]);

    expect(getMineKilnBonusCount(state, mine)).toBe(1);
  });

  it('with KILN_BONUS active, collectResources uses extended radius for iron income', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    const edgeKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10 + EXTENDED_RADIUS, 10);
    const state = makeStateWithKilnBonus([mine, edgeKiln]);

    const result = produce(state, (draft) => { collectResources(draft); });
    const expectedIronPerKiln = RESOURCES.CHARCOAL_KILN_IRON_BONUS + ABILITIES.KILN_IRON_BONUS;
    expect(result.resources.iron).toBe(RESOURCES.MINE_IRON_PER_TURN + expectedIronPerKiln);
  });

  it('with KILN_BONUS active, computeResourceIncome reflects extended radius and iron bonus', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    const edgeKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10 + EXTENDED_RADIUS, 10);
    const state = makeStateWithKilnBonus([mine, edgeKiln]);

    const income = computeResourceIncome(state);
    const expectedIronPerKiln = RESOURCES.CHARCOAL_KILN_IRON_BONUS + ABILITIES.KILN_IRON_BONUS;
    expect(income.ironPerTurn).toBe(RESOURCES.MINE_IRON_PER_TURN + expectedIronPerKiln);
  });

  it('with KILN_BONUS active, breakdown entry reflects correct iron per kiln', () => {
    const mine = makeBuilding(BuildingType.MINE, Faction.PLAYER, 10, 10);
    const edgeKiln = makeBuilding(BuildingType.CHARCOAL_KILN, Faction.PLAYER, 10 + EXTENDED_RADIUS, 10);
    const state = makeStateWithKilnBonus([mine, edgeKiln]);

    const breakdown = computeResourceIncomeBreakdown(state);
    const kilnEntry = breakdown.find((entry) => entry.label === 'Charcoal Kiln bonus ×1');
    expect(kilnEntry).toBeDefined();
    const expectedIronPerKiln = RESOURCES.CHARCOAL_KILN_IRON_BONUS + ABILITIES.KILN_IRON_BONUS;
    expect(kilnEntry?.iron).toBe(expectedIronPerKiln);
  });
});
