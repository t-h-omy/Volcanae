import { describe, expect, it } from 'vitest';
import { ABILITIES, CRYSTAL_CHAMBER_CONFIG, MAP, MAGE } from '../gameConfig';
import { computeCrystalIncomePerTurn } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { BuildingType, DestroyBehavior, Faction, TileType, TechFlag } from '../types';
import type { Building, GameState, Tile } from '../types';

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

function makeState(buildings: Building[]): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const buildingMap = Object.fromEntries(buildings.map((b) => [b.id, b]));
  for (const building of buildings) {
    grid[building.position.y][building.position.x].buildingId = building.id;
  }

  return {
    turn: 1,
    phase: 'PLAYER_TURN' as GameState['phase'],
    units: {},
    buildings: buildingMap,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
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
    difficulty: 'NORMAL' as GameState['difficulty'],
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
    portals: {},
  } as unknown as GameState;
}

describe('computeCrystalIncomePerTurn', () => {
  it('returns base chamber income only when no specialist/tech bonus applies', () => {
    const chamber = makeBuilding('chamber', BuildingType.CRYSTAL_CHAMBER, 1, 1, { resonanceTurnsRemaining: 2 });
    const state = makeState([chamber]);

    const result = computeCrystalIncomePerTurn(state);

    expect(result.resonatingChambers).toBe(1);
    expect(result.echoWardenBonus).toBe(0);
    expect(result.graveHarvestExpected).toBe(0);
    expect(result.crystalsPerTurn).toBe(CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN);
  });

  it('includes Echo Warden bonus and excludes disabled chambers from that bonus', () => {
    const activeEchoChamber = makeBuilding('active', BuildingType.CRYSTAL_CHAMBER, 1, 1, {
      resonanceTurnsRemaining: 2,
      resonanceCrystalBonus: true,
    });
    const disabledEchoChamber = makeBuilding('disabled', BuildingType.CRYSTAL_CHAMBER, 2, 1, {
      resonanceTurnsRemaining: 2,
      resonanceCrystalBonus: true,
      isDisabledForTurns: 1,
    });
    const state = makeState([activeEchoChamber, disabledEchoChamber]);
    state.globalSpecialistStorage = ['spec_18'];

    const result = computeCrystalIncomePerTurn(state);

    expect(result.resonatingChambers).toBe(1);
    expect(result.echoWardenChambers).toBe(1);
    expect(result.echoWardenBonus).toBe(ABILITIES.RESONANCE_BONUS_CRYSTALS);
    expect(result.crystalsPerTurn).toBe(
      CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN + ABILITIES.RESONANCE_BONUS_CRYSTALS,
    );
  });

  it('includes Grave Harvest as fractional expected value', () => {
    const gravestones = [
      makeBuilding('g1', BuildingType.GRAVESTONE, 1, 1),
      makeBuilding('g2', BuildingType.GRAVESTONE, 2, 1),
      makeBuilding('g3', BuildingType.GRAVESTONE, 3, 1),
    ];
    const state = makeState(gravestones);
    state.techFlags = [TechFlag.GRAVE_HARVEST];

    const result = computeCrystalIncomePerTurn(state);
    const expected = 3 * (MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE / 100);

    expect(result.gravestoneCount).toBe(3);
    expect(result.graveHarvestExpected).toBe(expected);
    expect(result.crystalsPerTurn).toBe(expected);
  });

  it('returns a total equal to base + Echo Warden + Grave Harvest expected', () => {
    const chamber = makeBuilding('chamber', BuildingType.CRYSTAL_CHAMBER, 1, 1, {
      resonanceTurnsRemaining: 2,
      resonanceCrystalBonus: true,
    });
    const gravestone = makeBuilding('gravestone', BuildingType.GRAVESTONE, 2, 1);
    const state = makeState([chamber, gravestone]);
    state.globalSpecialistStorage = ['spec_18'];
    state.techFlags = [TechFlag.GRAVE_HARVEST];

    const result = computeCrystalIncomePerTurn(state);
    const expectedSum = (result.resonatingChambers * CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN)
      + result.echoWardenBonus
      + result.graveHarvestExpected;

    expect(result.crystalsPerTurn).toBeCloseTo(expectedSum, 8);
  });
});
