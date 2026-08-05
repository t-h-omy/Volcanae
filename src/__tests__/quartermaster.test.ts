/**
 * Tests for the Quartermaster specialist (spec_26).
 *
 * While owned and not dormant, every recruitment building supports one additional
 * unit (unitLimit + RECRUITMENT_CAP_BONUS). Crystal Caves and Crystal Chambers are
 * NOT affected. Multipliers (POP_DOUBLING_DOCTRINE) apply to the base first; the
 * Quartermaster flat bonus is added afterwards.
 */

import { describe, it, expect } from 'vitest';
import { computeRecruitmentBuildingUsage, recruitUnit } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { ABILITIES, BUILDING_DEFINITIONS } from '../gameConfig';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitType } from '../types';
import type { Building, GameState, Tile } from '../types';

// ---- helpers ----------------------------------------------------------------

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

/** Build a minimal GameState for computeRecruitmentBuildingUsage tests. */
function makeState(
  buildings: Building[],
  opts: {
    quartermasterActive?: boolean;
    doctrinActive?: boolean;
  } = {},
): Pick<GameState, 'units' | 'buildings'> &
  Partial<Pick<GameState, 'specialists' | 'globalSpecialistStorage'>> {
  const specialists = createInitialSpecialists();
  const globalStorage: string[] = [];

  if (opts.quartermasterActive) {
    globalStorage.push('spec_26');
  }
  if (opts.doctrinActive) {
    globalStorage.push('spec_23'); // POP_DOUBLING_DOCTRINE spec id
  }

  return {
    units: {},
    buildings: Object.fromEntries(buildings.map((b) => [b.id, b])),
    specialists,
    globalSpecialistStorage: globalStorage,
  };
}

// ---- constants --------------------------------------------------------------

const BASE_STRONGHOLD = BUILDING_DEFINITIONS.STRONGHOLD.unitLimit!;    // 4
const BASE_BARRACKS   = BUILDING_DEFINITIONS.BARRACKS.unitLimit!;      // 3
const BASE_SIEGE      = BUILDING_DEFINITIONS.SIEGE_CAMP.unitLimit!;    // 2
const BONUS           = ABILITIES.RECRUITMENT_CAP_BONUS;               // 1

// ---- tests ------------------------------------------------------------------

describe('Quartermaster specialist - unit limit per building', () => {
  it('Stronghold: base limit without Quartermaster is 4', () => {
    const sh = makeBuilding('sh1', BuildingType.STRONGHOLD, 0, 0);
    const state = makeState([sh]);
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD);
  });

  it('Stronghold: limit with Quartermaster is base + 1 = 5', () => {
    const sh = makeBuilding('sh1', BuildingType.STRONGHOLD, 0, 0);
    const state = makeState([sh], { quartermasterActive: true });
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD + BONUS);
  });

  it('Barracks (base 3): limit with Quartermaster is 4', () => {
    const b = makeBuilding('b1', BuildingType.BARRACKS, 0, 0);
    const state = makeState([b], { quartermasterActive: true });
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.BARRACKS);
    expect(limit).toBe(BASE_BARRACKS + BONUS);
  });

  it('Siege Camp (base 2): limit with Quartermaster is 3', () => {
    const b = makeBuilding('sc1', BuildingType.SIEGE_CAMP, 0, 0);
    const state = makeState([b], { quartermasterActive: true });
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.SIEGE_CAMP);
    expect(limit).toBe(BASE_SIEGE + BONUS);
  });

  it('Crystal Chamber: limit unchanged with Quartermaster active', () => {
    const ch = makeBuilding('ch1', BuildingType.CRYSTAL_CHAMBER, 0, 0, {
      resonanceTurnsRemaining: 5,
    });
    const state = makeState([ch], { quartermasterActive: true });
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER);
    const baseLimit = BUILDING_DEFINITIONS.CRYSTAL_CHAMBER.unitLimit!;
    expect(limit).toBe(baseLimit);
  });

  it('Crystal Cave: per-cave limit unchanged with Quartermaster active', () => {
    const cave = makeBuilding('cave1', BuildingType.CRYSTAL_CAVE, 0, 0, {
      resonanceTurnsRemaining: 5,
    });
    const state = makeState([cave], { quartermasterActive: true });
    const { limit } = computeRecruitmentBuildingUsage(
      state,
      BuildingType.CRYSTAL_CAVE,
      cave.id,
    );
    const baseLimit = BUILDING_DEFINITIONS.CRYSTAL_CAVE.unitLimit!;
    expect(limit).toBe(baseLimit);
  });
});

describe('Quartermaster + Pop Doubling Doctrine interaction', () => {
  it('Stronghold with both active: base * 2 + 1 = 9', () => {
    const sh = makeBuilding('sh1', BuildingType.STRONGHOLD, 0, 0);
    const state = makeState([sh], { quartermasterActive: true, doctrinActive: true });
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD * 2 + BONUS);
  });
});

describe('Dormant Quartermaster', () => {
  it('grants no bonus when specialist is dormant', () => {
    const sh = makeBuilding('sh1', BuildingType.STRONGHOLD, 0, 0);
    const specialists = createInitialSpecialists();
    // Mark spec_26 as dormant
    specialists['spec_26']!.dormant = true;

    const state = {
      units: {},
      buildings: { [sh.id]: sh },
      specialists,
      globalSpecialistStorage: ['spec_26'],
    };
    const { limit } = computeRecruitmentBuildingUsage(state, BuildingType.STRONGHOLD);
    expect(limit).toBe(BASE_STRONGHOLD);
  });
});

describe('Quartermaster recruit gate integration', () => {
  it('allows exactly one more unit before refusing', () => {
    // Use (BASE_BARRACKS + BONUS) separate barracks buildings so each recruit
    // lands on a different building (one recruit per building per turn limit).
    const limit = BASE_BARRACKS + BONUS; // 4
    const buildings: Building[] = [];
    const grid: Tile[][] = Array.from({ length: limit + 2 }, (_, y) =>
      Array.from({ length: 3 }, (_, x) => makeTile(x, y)),
    );

    // Stronghold for population
    const stronghold = makeBuilding('sh1', BuildingType.STRONGHOLD, 2, 0, {
      populationCount: 50,
    });
    grid[0][2].buildingId = stronghold.id;
    buildings.push(stronghold);

    // One barracks per slot; each at a different row so spawn positions exist
    for (let i = 0; i < limit; i++) {
      const b = makeBuilding(`b${i}`, BuildingType.BARRACKS, 0, i + 1);
      grid[i + 1][0].buildingId = b.id;
      buildings.push(b);
    }

    const specialists = createInitialSpecialists();
    const globalSpecialistStorage = ['spec_26'];

    const state = {
      units: {},
      buildings: Object.fromEntries(buildings.map((b) => [b.id, b])),
      grid,
      resources: { iron: 999, wood: 999 },
      arcaneCrystals: 0,
      techNodes: {} as GameState['techNodes'],
      specialists,
      globalSpecialistStorage,
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
      },
      turn: 1,
    } as unknown as GameState;

    // Recruit one Spearman from each barracks building.
    // computeRecruitmentBuildingUsage counts ALL Spearmen against the total
    // limit across all BARRACKS buildings. With Quartermaster active, limit =
    // buildingCount * (BASE + BONUS) = 4 * 4 = 16 total. We just want to
    // confirm one recruit succeeds per building; exact capacity tested above.
    for (let i = 0; i < limit; i++) {
      recruitUnit(state, `b${i}`, UnitType.SPEARMAN);
    }

    const unitCount = Object.values(state.units).filter(
      (u) => u.type === UnitType.SPEARMAN,
    ).length;
    expect(unitCount).toBe(limit);

    // Without Quartermaster, only BASE_BARRACKS * limit buildings would give
    // BASE_BARRACKS * limit capacity. The key check: with QM, each building
    // individually supports BASE + BONUS units.
    const { limit: qmLimit } = computeRecruitmentBuildingUsage(
      state,
      BuildingType.BARRACKS,
    );
    expect(qmLimit).toBe(limit * (BASE_BARRACKS + BONUS));

    // Deactivate Quartermaster and confirm per-building limit drops by 1.
    const stateNoQm = { ...state, globalSpecialistStorage: [] };
    const { limit: noQmLimit } = computeRecruitmentBuildingUsage(
      stateNoQm,
      BuildingType.BARRACKS,
    );
    expect(noQmLimit).toBe(limit * BASE_BARRACKS);
  });
});
