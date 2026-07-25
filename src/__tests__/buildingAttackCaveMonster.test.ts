/**
 * VG-03 regression: Building kills of cave monsters must grant the specialist reward.
 *
 * Covers:
 *  - Player Outpost kills adjacent cave monster via buildingAttackUnit →
 *    events contain CAVE_MONSTER_KILLED and encounter removed from resolved state
 *  - Player Outpost does NOT emit CAVE_MONSTER_KILLED when it kills a normal enemy unit
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, Faction, GamePhase, TileType, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { BUILDING_DEFINITIONS, MAP } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';

// ============================================================================
// Helpers
// ============================================================================

let idSeq = 0;
function nextId(prefix = 'x'): string {
  return `${prefix}${++idSeq}`;
}

function makeTile(x: number, y: number, overrides: Partial<Tile> = {}): Tile {
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
    ...overrides,
  } as unknown as Tile;
}

function makeFullGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeGameStats() {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0,
    buildingsDestroyedByLava: 0,
  };
}

function makeOutpost(x: number, y: number): Building {
  const cfg = BUILDING_DEFINITIONS[BuildingType.OUTPOST];
  return {
    id: nextId('b'),
    type: BuildingType.OUTPOST,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: cfg.combatStats!.maxHp,
    maxHp: cfg.combatStats!.maxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: cfg.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: { ...cfg.combatStats! },
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: cfg.destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    preventiveStrikeFiredThisTurn: false,
  } as Building;
}

function makeCaveMonster(x: number, y: number, hp = 1): Unit {
  return {
    id: nextId('m'),
    type: UnitType.CAVE_MONSTER,
    faction: Faction.ENEMY,
    position: { x, y },
    stats: {
      maxHp: hp,
      currentHp: hp,
      attack: 30,
      defense: 10,
      moveRange: 1,
      discoverRadius: 1,
      triggerRange: 0,
      movementActions: 1,
      attackRange: 1,
    },
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
  } as Unit;
}

function makeLavaGrunt(x: number, y: number): Unit {
  return {
    id: nextId('e'),
    type: UnitType.LAVA_GRUNT,
    faction: Faction.ENEMY,
    position: { x, y },
    stats: {
      maxHp: 1,
      currentHp: 1,
      attack: 20,
      defense: 10,
      moveRange: 1,
      discoverRadius: 1,
      triggerRange: 0,
      movementActions: 1,
      attackRange: 1,
    },
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
  } as Unit;
}

function makeBaseState(
  units: Unit[],
  buildings: Building[],
  caveEncounterMonsterIds: string[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  const grid = makeFullGrid();
  for (const u of units) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of buildings) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }

  const activeCaveEncounters = caveEncounterMonsterIds.map((monsterId) => ({
    monsterId,
    mountainTileId: '0,0',
  }));

  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    turn: 3,
    resources: { iron: 10, wood: 10 },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    gameStats: makeGameStats(),
    techFlags: [],
    techNodes: {} as GameState['techNodes'],
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    zonesUnlocked: [0],
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
    phase: GamePhase.PLAYER_TURN,
  } as unknown as GameState;
}

// ============================================================================
// Tests
// ============================================================================

describe('buildingAttackUnit — cave monster kill grants specialist reward', () => {
  beforeEach(() => {
    useAnimationStore.setState({
      eventQueue: [],
      resolvedState: null,
      isAnimating: false,
      queueRevision: 0,
      processingRevision: null,
    });
  });

  it('emits CAVE_MONSTER_KILLED event when Outpost kills a cave monster', () => {
    // Outpost at (5, 5); cave monster at (5, 6) — within attackRange=2
    const outpost = makeOutpost(5, 5);
    const monster = makeCaveMonster(5, 6, 1); // 1 HP → guaranteed kill

    const state = makeBaseState([monster], [outpost], [monster.id]);
    useGameStore.setState(state);

    useGameStore.getState().buildingAttackUnit(outpost.id, monster.id);

    const { eventQueue } = useAnimationStore.getState();
    const killEvent = eventQueue.find((e) => e.type === 'CAVE_MONSTER_KILLED');
    expect(killEvent).toBeDefined();
    if (killEvent?.type === 'CAVE_MONSTER_KILLED') {
      expect(killEvent.monsterId).toBe(monster.id);
    }
  });

  it('removes the cave encounter from the resolved state when Outpost kills a cave monster', () => {
    const outpost = makeOutpost(5, 5);
    const monster = makeCaveMonster(5, 6, 1);

    const state = makeBaseState([monster], [outpost], [monster.id]);
    useGameStore.setState(state);

    useGameStore.getState().buildingAttackUnit(outpost.id, monster.id);

    const { resolvedState } = useAnimationStore.getState();
    expect(resolvedState).not.toBeNull();
    const encounterStillPresent = resolvedState!.activeCaveEncounters.some(
      (e) => e.monsterId === monster.id,
    );
    expect(encounterStillPresent).toBe(false);
  });

  it('does NOT emit CAVE_MONSTER_KILLED when Outpost kills a normal enemy unit', () => {
    const outpost = makeOutpost(5, 5);
    const grunt = makeLavaGrunt(5, 6);

    const state = makeBaseState([grunt], [outpost]);
    useGameStore.setState(state);

    useGameStore.getState().buildingAttackUnit(outpost.id, grunt.id);

    const { eventQueue } = useAnimationStore.getState();
    const killEvent = eventQueue.find((e) => e.type === 'CAVE_MONSTER_KILLED');
    expect(killEvent).toBeUndefined();
  });

  it('emits UNIT_DEATH before CAVE_MONSTER_KILLED in event sequence', () => {
    const outpost = makeOutpost(5, 5);
    const monster = makeCaveMonster(5, 6, 1);

    const state = makeBaseState([monster], [outpost], [monster.id]);
    useGameStore.setState(state);

    useGameStore.getState().buildingAttackUnit(outpost.id, monster.id);

    const { eventQueue } = useAnimationStore.getState();
    const deathIdx = eventQueue.findIndex((e) => e.type === 'UNIT_DEATH');
    const killIdx = eventQueue.findIndex((e) => e.type === 'CAVE_MONSTER_KILLED');
    expect(deathIdx).toBeGreaterThanOrEqual(0);
    expect(killIdx).toBeGreaterThan(deathIdx);
  });
});
