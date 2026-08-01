/**
 * Tests for BB-03 — Enemy frozen-tile slide animates in sequence.
 *
 * Verifies that when an enemy unit moves onto a FROZEN tile:
 *  1. The events array contains ENEMY_MOVE followed by UNIT_KNOCKBACK.
 *  2. UNIT_KNOCKBACK.fromPosition matches the frozen tile (targetPosition),
 *     UNIT_KNOCKBACK.toPosition matches the slid tile.
 *  3. When the slide kills the unit (lava), UNIT_KNOCKBACK is followed by UNIT_DEATH.
 *  4. FLYING enemy on FROZEN tile: no UNIT_KNOCKBACK emitted (no slide for flyers).
 *
 * Grid layout (column x=4, south = increasing y):
 *   y=28: enemy unit start
 *   y=29: FROZEN tile  (target of the enemy's one-tile move)
 *   y=30: slide destination (plains or lava depending on test)
 *   y=70: player STRONGHOLD (AI movement target)
 *
 * CANYON tiles at (3,29) and (5,29) ensure the BFS path goes straight south to
 * (4,29) — blocking diagonals so the test is deterministic regardless of the
 * direction-shuffle inside findBfsPath.
 */

import { describe, expect, it } from 'vitest';
import { BuildingType, DestroyBehavior, Faction, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';
import { BUILDING_DEFINITIONS, MAP } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { runEnemyTurn } from '../enemySystem';

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

function makeFullGrid(tileOverrides: Record<string, Partial<Tile>> = {}): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => {
      const key = `${x},${y}`;
      return makeTile(x, y, tileOverrides[key] ?? {});
    }),
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

function makeEnemy(x: number, y: number, overrides: Partial<Unit> = {}): Unit {
  return {
    id: nextId('e'),
    type: UnitType.LAVA_GRUNT,
    faction: Faction.ENEMY,
    position: { x, y },
    stats: {
      maxHp: 100,
      currentHp: 100,
      attack: 30,
      defense: 20,
      moveRange: 1,
      discoverRadius: 2,
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
    ...overrides,
  } as Unit;
}

function makeStronghold(x: number, y: number): Building {
  const cfg = BUILDING_DEFINITIONS[BuildingType.STRONGHOLD];
  return {
    id: nextId('b'),
    type: BuildingType.STRONGHOLD,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: cfg?.combatStats?.maxHp ?? 500,
    maxHp: cfg?.combatStats?.maxHp ?? 500,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: cfg?.discoverRadius ?? 3,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: cfg?.combatStats ? { ...cfg.combatStats } : null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: cfg?.destroyBehavior ?? DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    preventiveStrikeFiredThisTurn: false,
  } as Building;
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  tileOverrides?: Record<string, Partial<Tile>>;
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildings[b.id] = b;

  const grid = makeFullGrid(opts.tileOverrides ?? {});
  for (const u of Object.values(units)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of Object.values(buildings)) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }

  return {
    units,
    buildings,
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
    activeCaveEncounters: [],
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
    phase: 'PLAYER_TURN' as GameState['phase'],
  } as unknown as GameState;
}

// ============================================================================
// Grid constants
// ============================================================================

const COL = 4;
const ENEMY_Y = 28;
const FROZEN_Y = 29;
const SLIDE_Y = 30;
const STRONGHOLD_Y = 70;

/**
 * Canyon tiles adjacent to the FROZEN tile that block diagonal BFS paths,
 * ensuring the enemy unit steps straight south into (COL, FROZEN_Y).
 * Without these, the shuffled BFS may choose (COL±1, FROZEN_Y) first.
 */
const CANYON_BLOCKERS: Record<string, Partial<Tile>> = {
  [`${COL - 1},${FROZEN_Y}`]: { terrainType: TileType.CANYON },
  [`${COL + 1},${FROZEN_Y}`]: { terrainType: TileType.CANYON },
};

// ============================================================================
// Tests
// ============================================================================

describe('BB-03: Enemy frozen-slide events', () => {
  it('enemy moving onto FROZEN tile: final state has unit at slid position', () => {
    const enemy = makeEnemy(COL, ENEMY_Y);
    const stronghold = makeStronghold(COL, STRONGHOLD_Y);

    const state = makeState({
      units: [enemy],
      buildings: [stronghold],
      tileOverrides: {
        ...CANYON_BLOCKERS,
        [`${COL},${FROZEN_Y}`]: { status: TileStatus.FROZEN },
      },
    });

    const { finalState } = runEnemyTurn(state);

    const movedUnit = finalState.units[enemy.id];
    expect(movedUnit, 'unit should survive the slide').toBeDefined();
    expect(movedUnit!.position.y).toBe(SLIDE_Y);
    expect(movedUnit!.position.x).toBe(COL);
  });

  it('enemy moving onto FROZEN tile: events contain ENEMY_MOVE then UNIT_KNOCKBACK', () => {
    const enemy = makeEnemy(COL, ENEMY_Y);
    const stronghold = makeStronghold(COL, STRONGHOLD_Y);

    const state = makeState({
      units: [enemy],
      buildings: [stronghold],
      tileOverrides: {
        ...CANYON_BLOCKERS,
        [`${COL},${FROZEN_Y}`]: { status: TileStatus.FROZEN },
      },
    });

    const { events } = runEnemyTurn(state);

    const moveEvt = events.find(
      (e): e is Extract<GameEvent, { type: 'ENEMY_MOVE' }> =>
        e.type === 'ENEMY_MOVE' && e.unitId === enemy.id,
    );
    expect(moveEvt, 'ENEMY_MOVE event should exist').toBeDefined();

    const knockbackEvt = events.find(
      (e): e is Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }> =>
        e.type === 'UNIT_KNOCKBACK' && e.unitId === enemy.id,
    );
    expect(knockbackEvt, 'UNIT_KNOCKBACK event should exist').toBeDefined();
    expect(knockbackEvt!.fromPosition).toEqual({ x: COL, y: FROZEN_Y });
    expect(knockbackEvt!.toPosition).toEqual({ x: COL, y: SLIDE_Y });
    expect(knockbackEvt!.isEnemy).toBe(true);
    expect(knockbackEvt!.faction).toBe(Faction.ENEMY);

    // ENEMY_MOVE must appear before UNIT_KNOCKBACK
    const moveIdx = events.indexOf(moveEvt!);
    const knockbackIdx = events.indexOf(knockbackEvt!);
    expect(moveIdx).toBeLessThan(knockbackIdx);
  });

  it('enemy slide into lava: unit removed, UNIT_KNOCKBACK followed by UNIT_DEATH', () => {
    const enemy = makeEnemy(COL, ENEMY_Y);
    const stronghold = makeStronghold(COL, STRONGHOLD_Y);

    // Block diagonals around the FROZEN tile so BFS routes the unit straight
    // south to (COL, FROZEN_Y) even though (COL, SLIDE_Y) is lava (lava is
    // impassable in BFS, so the direct south path detours — the diagonals must
    // be blocked so (COL, FROZEN_Y) remains the forced first step).
    const state = makeState({
      units: [enemy],
      buildings: [stronghold],
      tileOverrides: {
        ...CANYON_BLOCKERS,
        [`${COL},${FROZEN_Y}`]: { status: TileStatus.FROZEN },
        [`${COL},${SLIDE_Y}`]: { isLava: true },
      },
    });

    const { finalState, events } = runEnemyTurn(state);

    // Unit should be destroyed by sliding into lava
    expect(finalState.units[enemy.id], 'unit should be dead after slide into lava').toBeUndefined();

    // UNIT_KNOCKBACK should exist and point from the frozen tile to the lava tile
    const knockbackEvt = events.find(
      (e): e is Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }> =>
        e.type === 'UNIT_KNOCKBACK' && e.unitId === enemy.id,
    );
    expect(knockbackEvt, 'UNIT_KNOCKBACK event should exist for slide-kill').toBeDefined();
    expect(knockbackEvt!.fromPosition).toEqual({ x: COL, y: FROZEN_Y });
    expect(knockbackEvt!.toPosition).toEqual({ x: COL, y: SLIDE_Y });

    // UNIT_DEATH should follow UNIT_KNOCKBACK
    const knockbackIdx = events.indexOf(knockbackEvt!);
    const deathEvt = events.find(
      (e): e is Extract<GameEvent, { type: 'UNIT_DEATH' }> =>
        e.type === 'UNIT_DEATH' && e.unitId === enemy.id,
    );
    expect(deathEvt, 'UNIT_DEATH event should exist').toBeDefined();
    const deathIdx = events.indexOf(deathEvt!);
    expect(knockbackIdx).toBeLessThan(deathIdx);
  });

  it('FLYING enemy on FROZEN tile does NOT emit UNIT_KNOCKBACK (no slide)', () => {
    const enemy = makeEnemy(COL, ENEMY_Y, { tags: [UnitTag.FLYING] });
    const stronghold = makeStronghold(COL, STRONGHOLD_Y);

    const state = makeState({
      units: [enemy],
      buildings: [stronghold],
      tileOverrides: {
        ...CANYON_BLOCKERS,
        [`${COL},${FROZEN_Y}`]: { status: TileStatus.FROZEN },
      },
    });

    const { events } = runEnemyTurn(state);

    const knockbackEvt = events.find(
      (e): e is Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }> =>
        e.type === 'UNIT_KNOCKBACK' && e.unitId === enemy.id,
    );
    expect(knockbackEvt, 'FLYING unit should not produce a UNIT_KNOCKBACK').toBeUndefined();
  });
});
