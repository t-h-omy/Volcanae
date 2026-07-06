import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { recruitUnit } from '../resourceSystem';
import { applySpecialistEffects, createInitialSpecialists } from '../specialistSystem';
import { getAttackTargets, getUnitAttackRange } from '../unitActions';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';

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

function makeGrid(width = MAP.GRID_WIDTH, height = MAP.GRID_HEIGHT): Tile[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(overrides: Partial<Unit>): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SCOUT];
  return {
    id: overrides.id ?? 'unit',
    type: overrides.type ?? UnitType.SCOUT,
    faction: overrides.faction ?? Faction.PLAYER,
    position: overrides.position ?? { x: 4, y: 4 },
    stats: overrides.stats ?? {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: overrides.tags ?? [],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    ...overrides,
  } as Unit;
}

function makeBuilding(id: string, type: BuildingType, x: number, y: number, overrides: Partial<Building> = {}): Building {
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
  } as Building;
}

describe('Farsight Marshal', () => {
  it('grants existing scouts the RANGED tag and +1 effective attack range', () => {
    const scout = makeUnit({ id: 'scout', position: { x: 4, y: 4 } });
    const enemy = makeUnit({
      id: 'enemy',
      type: UnitType.LAVA_GRUNT,
      faction: Faction.ENEMY,
      position: { x: 4 + scout.stats.attackRange + ABILITIES.SCOUT_ATTACK_RANGE_BONUS, y: 4 },
      tags: [],
    });
    const grid = makeGrid();
    grid[scout.position.y][scout.position.x].unitId = scout.id;
    grid[enemy.position.y][enemy.position.x].unitId = enemy.id;

    const baseState = {
      units: { [scout.id]: scout, [enemy.id]: enemy },
      buildings: {},
      grid,
      turn: 1,
      resources: { iron: 10, wood: 10 },
      specialists: createInitialSpecialists(),
      globalSpecialistStorage: ['spec_11'],
      techNodes: {},
      techFlags: [],
      gameStats: {},
    } as unknown as GameState;

    expect(getAttackTargets(scout, baseState.units, baseState.buildings, baseState.grid, baseState)).toEqual(new Set());

    const state = produce(baseState, (draft) => {
      applySpecialistEffects(draft);
    });
    const updatedScout = state.units[scout.id];

    expect(updatedScout.tags).toContain(UnitTag.RANGED);
    expect(getUnitAttackRange(updatedScout, state)).toBe(
      UNIT_DEFINITIONS[UnitType.SCOUT].attackRange + ABILITIES.SCOUT_ATTACK_RANGE_BONUS,
    );
    expect(getAttackTargets(updatedScout, state.units, state.buildings, state.grid, state)).toEqual(
      new Set([`${enemy.position.x},${enemy.position.y}`]),
    );
  });

  it('grants newly recruited scouts the RANGED tag while active', () => {
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, 0, 0, {
      populationCount: 3,
    });
    const grid = [[makeTile(0, 0), makeTile(1, 0)]];
    grid[0][0].buildingId = stronghold.id;

    const state = {
      units: {},
      buildings: { [stronghold.id]: stronghold },
      grid,
      resources: { iron: 99, wood: 99 },
      arcaneCrystals: 0,
      techNodes: {},
      techFlags: [],
      specialists: createInitialSpecialists(),
      globalSpecialistStorage: ['spec_11'],
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

    recruitUnit(state, stronghold.id, UnitType.SCOUT);

    const recruited = Object.values(state.units)[0];
    expect(recruited).toBeDefined();
    expect(recruited.type).toBe(UnitType.SCOUT);
    expect(recruited.tags).toContain(UnitTag.RANGED);
  });
});
