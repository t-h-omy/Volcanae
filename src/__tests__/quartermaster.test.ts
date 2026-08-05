import { describe, expect, it } from 'vitest';
import { ABILITIES, BUILDING_DEFINITIONS } from '../gameConfig';
import { computeRecruitmentBuildingUsage, recruitUnit } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { BuildingType, DestroyBehavior, Faction, UnitType } from '../types';
import type { Building, GameState } from '../types';

function makeBuilding(
  id: string,
  type: BuildingType,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
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
  } as Building;
}

function makeState(
  buildings: Record<string, Building>,
  specialistIds: string[] = [],
): GameState {
  return {
    buildings,
    units: {},
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: specialistIds,
  } as unknown as GameState;
}

const BASE_STRONGHOLD_LIMIT = BUILDING_DEFINITIONS[BuildingType.STRONGHOLD]?.unitLimit ?? 4;
const BASE_BARRACKS_LIMIT = BUILDING_DEFINITIONS[BuildingType.BARRACKS]?.unitLimit ?? 3;
const BASE_SIEGE_CAMP_LIMIT = BUILDING_DEFINITIONS[BuildingType.SIEGE_CAMP]?.unitLimit ?? 2;
const BASE_CHAMBER_LIMIT = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CHAMBER]?.unitLimit ?? 1;
const BASE_CAVE_LIMIT = BUILDING_DEFINITIONS[BuildingType.CRYSTAL_CAVE]?.unitLimit ?? 1;

describe('Quartermaster specialist', () => {
  it('STRONGHOLD limit is base without Quartermaster', () => {
    const stronghold = makeBuilding('s', BuildingType.STRONGHOLD);
    const state = makeState({ s: stronghold });
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD_LIMIT);
  });

  it('STRONGHOLD limit is base + 1 with Quartermaster active', () => {
    const stronghold = makeBuilding('s', BuildingType.STRONGHOLD);
    const state = makeState({ s: stronghold }, ['spec_26']);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD_LIMIT + ABILITIES.RECRUITMENT_CAP_BONUS);
  });

  it('BARRACKS (3-limit building) gains +1 with Quartermaster', () => {
    const barracks = makeBuilding('b', BuildingType.BARRACKS);
    const state = makeState({ b: barracks }, ['spec_26']);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(BASE_BARRACKS_LIMIT + ABILITIES.RECRUITMENT_CAP_BONUS);
  });

  it('SIEGE_CAMP (2-limit building) gains +1 with Quartermaster', () => {
    const siegeCamp = makeBuilding('sc', BuildingType.SIEGE_CAMP);
    const state = makeState({ sc: siegeCamp }, ['spec_26']);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.SIEGE_CAMP);
    expect(limit).toBe(BASE_SIEGE_CAMP_LIMIT + ABILITIES.RECRUITMENT_CAP_BONUS);
  });

  it('CRYSTAL_CHAMBER limit is unchanged with Quartermaster active', () => {
    const chamber = makeBuilding('c', BuildingType.CRYSTAL_CHAMBER, { resonanceTurnsRemaining: 5 });
    const state = makeState({ c: chamber }, ['spec_26']);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER);
    expect(limit).toBe(BASE_CHAMBER_LIMIT);
  });

  it('CRYSTAL_CAVE per-cave limit is unchanged with Quartermaster active', () => {
    const cave = makeBuilding('cave', BuildingType.CRYSTAL_CAVE);
    const state = makeState({ cave }, ['spec_26']);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE, 'cave');
    expect(limit).toBe(BASE_CAVE_LIMIT);
  });

  it('Quartermaster + Pop Doubling Doctrine: STRONGHOLD limit = base * 2 + 1', () => {
    const stronghold = makeBuilding('s', BuildingType.STRONGHOLD);
    const state = makeState({ s: stronghold }, ['spec_26', 'spec_23']);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD_LIMIT * 2 + ABILITIES.RECRUITMENT_CAP_BONUS);
  });

  it('dormant Quartermaster grants no bonus', () => {
    const stronghold = makeBuilding('s', BuildingType.STRONGHOLD);
    const state = makeState({ s: stronghold }, ['spec_26']);
    state.specialists['spec_26'].dormant = true;
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD_LIMIT);
  });

  it('recruit gate: allows one more SPEARMAN with Quartermaster raising BARRACKS limit', () => {
    const barracks = makeBuilding('b', BuildingType.BARRACKS, { position: { x: 0, y: 0 } });
    // STRONGHOLD with populationCount provides farmer capacity for the population check
    const stronghold = makeBuilding('sh', BuildingType.STRONGHOLD, {
      position: { x: 2, y: 0 },
      populationCount: BASE_BARRACKS_LIMIT + 1,
    });
    const grid = [[
      { position: { x: 0, y: 0 }, isRevealed: true, buildingId: barracks.id, unitId: null, isLava: false, isLavaPreview: false, isRuin: false, isStrongholdRuin: false, terrainType: 'PLAINS', status: null, hasCaveMonster: false },
      { position: { x: 1, y: 0 }, isRevealed: true, buildingId: null, unitId: null, isLava: false, isLavaPreview: false, isRuin: false, isStrongholdRuin: false, terrainType: 'PLAINS', status: null, hasCaveMonster: false },
      { position: { x: 2, y: 0 }, isRevealed: true, buildingId: stronghold.id, unitId: null, isLava: false, isLavaPreview: false, isRuin: false, isStrongholdRuin: false, terrainType: 'PLAINS', status: null, hasCaveMonster: false },
    ]];

    const baseState = {
      units: {},
      buildings: { b: barracks, sh: stronghold },
      grid,
      resources: { iron: 999, wood: 999 },
      arcaneCrystals: 0,
      techNodes: {},
      techFlags: [],
      specialists: createInitialSpecialists(),
      globalSpecialistStorage: [],
      gameStats: { unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0, unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0, techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0, buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0 },
      turn: 1,
      lavaFrontRow: 999,
    } as unknown as GameState;

    // Fill to the base limit; each recruit occupies the barracks tile, subsequent ones need
    // the tile to be free. We release tile occupation between recruits for this test.
    for (let i = 0; i < BASE_BARRACKS_LIMIT; i++) {
      grid[0][0].unitId = null; // ensure tile is free
      recruitUnit(baseState, barracks.id, UnitType.SPEARMAN);
      barracks.lastRecruitmentTurn = 0; // reset per-turn recruitment lock
    }
    expect(Object.keys(baseState.units)).toHaveLength(BASE_BARRACKS_LIMIT);

    // One more recruitment should fail without Quartermaster (at cap)
    grid[0][0].unitId = null;
    barracks.lastRecruitmentTurn = 0;
    recruitUnit(baseState, barracks.id, UnitType.SPEARMAN);
    expect(Object.keys(baseState.units)).toHaveLength(BASE_BARRACKS_LIMIT);

    // With Quartermaster, one more should succeed
    baseState.globalSpecialistStorage.push('spec_26');
    grid[0][0].unitId = null;
    barracks.lastRecruitmentTurn = 0;
    recruitUnit(baseState, barracks.id, UnitType.SPEARMAN);
    expect(Object.keys(baseState.units)).toHaveLength(BASE_BARRACKS_LIMIT + 1);

    // But not a further one beyond base + bonus
    grid[0][0].unitId = null;
    barracks.lastRecruitmentTurn = 0;
    recruitUnit(baseState, barracks.id, UnitType.SPEARMAN);
    expect(Object.keys(baseState.units)).toHaveLength(BASE_BARRACKS_LIMIT + 1);
  });
});
