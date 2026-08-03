/**
 * Tests for SP-23 The Matriarch (spec_23): RECRUIT_CAP_BONUS
 *
 * 1. +RECRUIT_CAP_BONUS unit cap for each recruitment building (Barracks, Archer Camp, Rider Camp, Siege Camp)
 * 2. +RECRUIT_CAP_BONUS unit cap for Stronghold
 * 3. +RECRUIT_CAP_BONUS unit cap for Crystal Chamber
 * 4. +RECRUIT_CAP_BONUS per-cave cap for Crystal Cave (per-cave path)
 * 5. No change when specialist is inactive
 * 6. Scales correctly with multiple buildings
 */
import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  BUILDING_DEFINITIONS,
  MAP,
} from '../gameConfig';
import {
  computeRecruitmentBuildingUsage,
} from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Tile, Unit } from '../types';

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

function makeUnit(id: string, type: UnitType, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
    stats: { maxHp: 100, currentHp: 100, attack: 10, defense: 10, moveRange: 1, discoverRadius: 1, triggerRange: 0, movementActions: 1, attackRange: 1 },
    tags: [],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    ...overrides,
  } as Unit;
}

function makeBaseState(
  withConscriptor: boolean,
  extraBuildings: Record<string, Building> = {},
  extraUnits: Record<string, Unit> = {},
): GameState {
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
    units: { ...extraUnits },
    buildings: { [stronghold.id]: stronghold, ...extraBuildings },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: withConscriptor ? ['spec_23'] : [],
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

// ── 1. RECRUIT_CAP_BONUS: recruitment buildings ───────────────────────────────

describe('SP-23 RECRUIT_CAP_BONUS — recruitment building unit limits', () => {
  it('increases BARRACKS unit limit by RECRUIT_CAP_BONUS when active', () => {
    const barracks = makeBuilding('b1', BuildingType.BARRACKS, 3, 0);
    const state = makeBaseState(true, { [barracks.id]: barracks });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.BARRACKS]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('increases ARCHER_CAMP unit limit by RECRUIT_CAP_BONUS when active', () => {
    const camp = makeBuilding('ac1', BuildingType.ARCHER_CAMP, 3, 0);
    const state = makeBaseState(true, { [camp.id]: camp });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.ARCHER_CAMP]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.ARCHER_CAMP);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('increases RIDER_CAMP unit limit by RECRUIT_CAP_BONUS when active', () => {
    const camp = makeBuilding('rc1', BuildingType.RIDER_CAMP, 3, 0);
    const state = makeBaseState(true, { [camp.id]: camp });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.RIDER_CAMP]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.RIDER_CAMP);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('increases SIEGE_CAMP unit limit by RECRUIT_CAP_BONUS when active', () => {
    const camp = makeBuilding('sc1', BuildingType.SIEGE_CAMP, 3, 0);
    const state = makeBaseState(true, { [camp.id]: camp });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.SIEGE_CAMP]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.SIEGE_CAMP);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('does not change BARRACKS limit when inactive', () => {
    const barracks = makeBuilding('b1', BuildingType.BARRACKS, 3, 0);
    const state = makeBaseState(false, { [barracks.id]: barracks });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.BARRACKS]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(baseLimit);
  });

  it('scales with number of buildings: two Barracks each get the bonus', () => {
    const b1 = makeBuilding('b1', BuildingType.BARRACKS, 3, 0);
    const b2 = makeBuilding('b2', BuildingType.BARRACKS, 4, 0);
    const state = makeBaseState(true, { [b1.id]: b1, [b2.id]: b2 });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.BARRACKS]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(2 * (baseLimit + ABILITIES.RECRUIT_CAP_BONUS));
  });
});

// ── 2. RECRUIT_CAP_BONUS: Stronghold ─────────────────────────────────────────

describe('SP-23 RECRUIT_CAP_BONUS — Stronghold unit limit', () => {
  it('increases STRONGHOLD unit limit by RECRUIT_CAP_BONUS when active', () => {
    const state = makeBaseState(true);
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.STRONGHOLD]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('does not change STRONGHOLD limit when inactive', () => {
    const state = makeBaseState(false);
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.STRONGHOLD]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(baseLimit);
  });
});

// ── 3. Specialist definition ──────────────────────────────────────────────────

describe('SP-23 Matriarch specialist definition', () => {
  it('has a RECRUIT_CAP_BONUS effect with default amount', () => {
    const specialists = createInitialSpecialists();
    const spec = specialists['spec_23'];
    expect(spec).toBeDefined();
    expect(spec.name).toBe('The Matriarch');
    expect(spec.effects).toHaveLength(1);
    expect(spec.effects[0].type).toBe('RECRUIT_CAP_BONUS');
    expect(spec.effects[0].params.amount).toBe(ABILITIES.RECRUIT_CAP_BONUS);
  });
});

// ── 4. RECRUIT_CAP_BONUS: Crystal Chamber ────────────────────────────────────

describe('SP-23 RECRUIT_CAP_BONUS — Crystal Chamber unit limit', () => {
  it('increases CRYSTAL_CHAMBER global limit by RECRUIT_CAP_BONUS when active', () => {
    const chamber = makeBuilding('cc1', BuildingType.CRYSTAL_CHAMBER, 3, 0);
    const state = makeBaseState(true, { [chamber.id]: chamber });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CHAMBER]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('does not change CRYSTAL_CHAMBER limit when inactive', () => {
    const chamber = makeBuilding('cc1', BuildingType.CRYSTAL_CHAMBER, 3, 0);
    const state = makeBaseState(false, { [chamber.id]: chamber });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CHAMBER]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER);
    expect(limit).toBe(baseLimit);
  });

  it('scales with multiple Crystal Chambers', () => {
    const c1 = makeBuilding('cc1', BuildingType.CRYSTAL_CHAMBER, 3, 0);
    const c2 = makeBuilding('cc2', BuildingType.CRYSTAL_CHAMBER, 4, 0);
    const state = makeBaseState(true, { [c1.id]: c1, [c2.id]: c2 });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CHAMBER]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER);
    expect(limit).toBe(2 * (baseLimit + ABILITIES.RECRUIT_CAP_BONUS));
  });
});

// ── 5. RECRUIT_CAP_BONUS: Crystal Cave (per-cave path) ───────────────────────

describe('SP-23 RECRUIT_CAP_BONUS — Crystal Cave per-cave limit', () => {
  it('increases per-cave limit by RECRUIT_CAP_BONUS when active', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 3, 0);
    const state = makeBaseState(true, { [cave.id]: cave });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CAVE]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, cave.id);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
  });

  it('does not change per-cave limit when inactive', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 3, 0);
    const state = makeBaseState(false, { [cave.id]: cave });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CAVE]!.unitLimit!;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, cave.id);
    expect(limit).toBe(baseLimit);
  });

  it('counts roosted drakes correctly — 0 drakes gives current=0', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 3, 0);
    const state = makeBaseState(true, { [cave.id]: cave });
    const { current } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, cave.id);
    expect(current).toBe(0);
  });

  it('counts roosted drakes correctly — 1 drake gives current=1', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 3, 0);
    const drake = makeUnit('drake1', UnitType.CRYSTAL_DRAKE, { roostBuildingId: cave.id });
    const state = makeBaseState(true, { [cave.id]: cave }, { [drake.id]: drake });
    const { current } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, cave.id);
    expect(current).toBe(1);
  });

  it('with Conscriptor active: a second drake is allowed (current=1 < limit=2)', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 3, 0);
    const drake = makeUnit('drake1', UnitType.CRYSTAL_DRAKE, { roostBuildingId: cave.id });
    const state = makeBaseState(true, { [cave.id]: cave }, { [drake.id]: drake });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CAVE]!.unitLimit!;
    const { current, limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, cave.id);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
    expect(current).toBe(1);
    expect(current < limit).toBe(true);
  });

  it('with Conscriptor active: two drakes fill the per-cave cap (current=2 >= limit=2)', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 3, 0);
    const drake1 = makeUnit('drake1', UnitType.CRYSTAL_DRAKE, { roostBuildingId: cave.id });
    const drake2 = makeUnit('drake2', UnitType.CRYSTAL_DRAKE, { roostBuildingId: cave.id });
    const state = makeBaseState(true, { [cave.id]: cave }, { [drake1.id]: drake1, [drake2.id]: drake2 });
    const baseLimit = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CAVE]!.unitLimit!;
    const { current, limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, cave.id);
    expect(limit).toBe(baseLimit + ABILITIES.RECRUIT_CAP_BONUS);
    expect(current).toBe(2);
    expect(current >= limit).toBe(true);
  });
});
