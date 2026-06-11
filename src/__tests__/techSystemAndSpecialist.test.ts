import { describe, expect, it } from 'vitest';
import { renderEffect } from '../techSystem';
import { recruitUnit } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
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

describe('renderEffect', () => {
  it('renders friendly names for unlocked buildings', () => {
    expect(
      renderEffect({ type: 'UNLOCK_BUILDING', buildingType: BuildingType.CHARCOAL_KILN }),
    ).toBe('Unlocks Charcoal Kiln construction');
    expect(
      renderEffect({ type: 'UNLOCK_BUILDING', buildingType: BuildingType.CRYSTAL_TOWER }),
    ).toBe('Unlocks Crystal Tower erection via spell');
  });
});

describe('Drill Sergeant', () => {
  it('grants READY to newly recruited Swordsmen while active', () => {
    const barracks = makeBuilding('barracks', BuildingType.BARRACKS, 0, 0);
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, 1, 0, {
      populationCount: 3,
    });
    const grid = [[makeTile(0, 0), makeTile(1, 0)]];
    grid[0][0].buildingId = barracks.id;
    grid[0][1].buildingId = stronghold.id;

    const state = {
      units: {},
      buildings: {
        [barracks.id]: barracks,
        [stronghold.id]: stronghold,
      },
      grid,
      resources: { iron: 99, wood: 99 },
      arcaneCrystals: 0,
      techNodes: {} as GameState['techNodes'],
      specialists: createInitialSpecialists(),
      globalSpecialistStorage: ['spec_04'],
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
      turn: 3,
    } as unknown as GameState;

    recruitUnit(state, barracks.id, UnitType.SWORDSMAN);

    const recruited = Object.values(state.units)[0];
    expect(recruited).toBeDefined();
    expect(recruited.type).toBe(UnitType.SWORDSMAN);
    expect(recruited.tags).toContain(UnitTag.READY);
    expect(recruited.hasMovedThisTurn).toBe(false);
    expect(recruited.hasAttackedThisTurn).toBe(false);
    expect(recruited.recruitedOnTurn).toBe(state.turn);
    expect(state.resources.iron).toBe(99 - UNIT_DEFINITIONS[UnitType.SWORDSMAN].cost.iron);
    expect(state.resources.wood).toBe(99 - UNIT_DEFINITIONS[UnitType.SWORDSMAN].cost.wood);
  });
});
