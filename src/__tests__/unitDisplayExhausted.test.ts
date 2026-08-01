import { describe, expect, it } from 'vitest';
import { recruitUnit } from '../resourceSystem';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { isUnitDisplayExhausted } from '../unitActions';
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

function makeRecruitState(globalSpecialistStorage: string[] = []): { state: GameState; barracksId: string } {
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
    resources: { iron: 200, wood: 200 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    specialists: createInitialSpecialists(),
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
    turn: 3,
  } as unknown as GameState;

  return { state, barracksId: barracks.id };
}

function makeUnit(type: UnitType, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: `unit_${type}`,
    type,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
    stats: {
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
    tags: [...def.tags],
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
    spellsCastThisTurn: 0,
    ...overrides,
  };
}

function makeDisplayState(unit: Unit): GameState {
  const tile = makeTile(0, 0);
  tile.unitId = unit.id;
  return {
    turn: 3,
    units: { [unit.id]: unit },
    buildings: {},
    grid: [[tile]],
    arcaneCrystals: 0,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    techNodes: {},
  } as unknown as GameState;
}

describe('isUnitDisplayExhausted', () => {
  it('does not exhaust Drill Sergeant READY recruits (SWORDSMAN and SPEARMAN)', () => {
    const { state: swordState, barracksId: swordBarracksId } = makeRecruitState(['spec_04']);
    recruitUnit(swordState, swordBarracksId, UnitType.SWORDSMAN);
    const swordsman = Object.values(swordState.units)[0];
    expect(swordsman.tags).toContain(UnitTag.READY);
    expect(isUnitDisplayExhausted(swordsman, swordState)).toBe(false);

    const { state: spearState, barracksId: spearBarracksId } = makeRecruitState(['spec_04']);
    recruitUnit(spearState, spearBarracksId, UnitType.SPEARMAN);
    const spearman = Object.values(spearState.units)[0];
    expect(spearman.tags).toContain(UnitTag.READY);
    expect(isUnitDisplayExhausted(spearman, spearState)).toBe(false);
  });

  it('exhausts non-READY same-turn recruits', () => {
    const { state, barracksId } = makeRecruitState([]);
    recruitUnit(state, barracksId, UnitType.SWORDSMAN);
    const recruited = Object.values(state.units)[0];
    expect(recruited.tags).not.toContain(UnitTag.READY);
    expect(isUnitDisplayExhausted(recruited, state)).toBe(true);
  });

  it('exhausts moved units with no attack targets, even if READY', () => {
    const readyMoved = makeUnit(UnitType.SWORDSMAN, {
      hasMovedThisTurn: true,
      tags: [...UNIT_DEFINITIONS[UnitType.SWORDSMAN].tags, UnitTag.READY],
    });
    const state = makeDisplayState(readyMoved);
    expect(isUnitDisplayExhausted(readyMoved, state)).toBe(true);
  });

  it('exhausts units that already attacked', () => {
    const attackedUnit = makeUnit(UnitType.SWORDSMAN, { hasAttackedThisTurn: true });
    const state = makeDisplayState(attackedUnit);
    expect(isUnitDisplayExhausted(attackedUnit, state)).toBe(true);
  });

  it('does not exhaust a fresh READY gargoyle spawn', () => {
    const gargoyle = makeUnit(UnitType.GARGOYLE, {
      tags: [...UNIT_DEFINITIONS[UnitType.GARGOYLE].tags, UnitTag.SUMMONED, UnitTag.READY],
    });
    const state = makeDisplayState(gargoyle);
    expect(isUnitDisplayExhausted(gargoyle, state)).toBe(false);
  });
});
