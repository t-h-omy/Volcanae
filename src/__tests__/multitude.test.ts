/**
 * Tests for SP-23 The Conscriptor (spec_23): RECRUIT_CAP_BONUS
 *
 * 1. +RECRUIT_CAP_BONUS unit cap for each recruitment building (Barracks, Archer Camp, Rider Camp, Siege Camp)
 * 2. +RECRUIT_CAP_BONUS unit cap for Stronghold
 * 3. No change when specialist is inactive
 * 4. Scales correctly with multiple buildings
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
} from '../types';
import type { Building, GameState, Tile } from '../types';

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

function makeBaseState(withConscriptor: boolean, extraBuildings: Record<string, Building> = {}): GameState {
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

describe('SP-23 Conscriptor specialist definition', () => {
  it('has a RECRUIT_CAP_BONUS effect with default amount', () => {
    const specialists = createInitialSpecialists();
    const spec = specialists['spec_23'];
    expect(spec).toBeDefined();
    expect(spec.name).toBe('The Conscriptor');
    expect(spec.effects).toHaveLength(1);
    expect(spec.effects[0].type).toBe('RECRUIT_CAP_BONUS');
    expect(spec.effects[0].params.amount).toBe(ABILITIES.RECRUIT_CAP_BONUS);
  });
});
