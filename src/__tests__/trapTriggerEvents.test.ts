/**
 * Tests for BB-04: Trap trigger presentation runs after the move animation.
 *
 * Covers:
 *  - checkGraveTrapTrigger with events array (enemy path):
 *      STUN_APPLIED for trigger unit, STUN_APPLIED per non-ALERT AOE victim,
 *      TRAP_TRIGGERED last; ALERT units produce no STUN_APPLIED.
 *  - checkScoutTrapTrigger with events array (enemy path):
 *      TILE_DAMAGE (damageSource: 'TRAP') + STUN_APPLIED + TRAP_TRIGGERED;
 *      FLYING units produce nothing; ALERT unit → damage only, no STUN_APPLIED.
 *  - Player path regression: calling without events keeps current behavior
 *      (state changes identical, no events emitted).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { produce } from 'immer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { checkGraveTrapTrigger, checkScoutTrapTrigger } from '../movementSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { useFloaterStore } from '../floaterStore';
import { useAnimationEngine } from '../useAnimationEngine';
import { runEnemyTurn } from '../enemySystem';
import { ANIMATION } from '../../config/animation';

const effects = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void)) => { effects.cleanup = effect(); },
}));

// ============================================================================
// Helpers
// ============================================================================

function AnimationEngineHarness() {
  useAnimationEngine();
  return null;
}

let _id = 0;
function nextId(prefix = 'x'): string {
  return `${prefix}${++_id}`;
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
    status: undefined as unknown as Tile['status'],
    hasCaveMonster: false,
    ...overrides,
  } as unknown as Tile;
}

function makeGrid(
  w = MAP.GRID_WIDTH,
  h = MAP.GRID_HEIGHT,
  tileOverrides: Record<string, Partial<Tile>> = {},
): Tile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const key = `${x},${y}`;
      return makeTile(x, y, tileOverrides[key] ?? {});
    }),
  );
}

function makeEnemyUnit(overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT];
  return {
    id: nextId('e'),
    type: UnitType.LAVA_GRUNT,
    faction: Faction.ENEMY,
    position: { x: 5, y: 5 },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
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

function makeGraveTrap(x: number, y: number, stunTurns = 1): Building {
  return {
    id: nextId('grave'),
    type: BuildingType.GRAVE_TRAP,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: 1,
    maxHp: 1,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 1,
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
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    trapStunTurns: stunTurns,
  } as Building;
}

function makeScoutTrap(x: number, y: number): Building {
  return {
    id: nextId('scout'),
    type: BuildingType.SCOUT_TRAP,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: 1,
    maxHp: 1,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 1,
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
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    trapStunTurns: ABILITIES.SCOUT_TRAP_STUN_TURNS,
    trapDamage: ABILITIES.SCOUT_TRAP_DAMAGE,
  } as Building;
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildings[b.id] = b;
  const grid = makeGrid();
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
    turn: 1,
    resources: { iron: 10, wood: 10 },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    gameStats: {
      unitsLost: 0,
      buildingsDestroyed: 0,
      unitsKilled: 0,
      buildingsCaptured: 0,
      buildingsConverted: 0,
    },
  } as unknown as GameState;
}

// ============================================================================
// checkGraveTrapTrigger — enemy path (events array provided)
// ============================================================================

describe('checkGraveTrapTrigger (enemy path, events array)', () => {
  it('emits STUN_APPLIED for trigger unit then TRAP_TRIGGERED', () => {
    const enemy = makeEnemyUnit({ position: { x: 5, y: 5 } });
    const trap = makeGraveTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });
    const events: GameEvent[] = [];

    const next = produce(state, (draft) => {
      checkGraveTrapTrigger(draft, enemy.id, events);
    });

    // State: unit is stunned, trap is gone
    expect(next.units[enemy.id]!.pinnedUntilTurn).toBe(1); // turn + stunTurns - 1 = 1 + 1 - 1
    expect(next.buildings[trap.id]).toBeUndefined();
    expect(next.grid[5][5].buildingId).toBeNull();

    // Events: ENEMY_MOVE would have been pushed before this call in production;
    // we only verify the trap-related events here.
    const stunEvents = events.filter((e) => e.type === 'STUN_APPLIED');
    const trapEvent = events.find((e) => e.type === 'TRAP_TRIGGERED');

    expect(stunEvents).toHaveLength(1);
    expect(stunEvents[0]).toMatchObject({ type: 'STUN_APPLIED', unitId: enemy.id });

    expect(trapEvent).toBeDefined();
    expect(trapEvent).toMatchObject({
      type: 'TRAP_TRIGGERED',
      buildingId: trap.id,
      position: { x: 5, y: 5 },
    });

    // TRAP_TRIGGERED must be the last event
    expect(events[events.length - 1].type).toBe('TRAP_TRIGGERED');
  });

  it('emits STUN_APPLIED for trigger unit and each non-ALERT AOE neighbour', () => {
    const trigger = makeEnemyUnit({ id: 'trigger', position: { x: 5, y: 5 } });
    const aoe1 = makeEnemyUnit({ id: 'aoe1', position: { x: 5, y: 4 } });   // directly above
    const aoe2 = makeEnemyUnit({ id: 'aoe2', position: { x: 6, y: 5 } });   // directly right
    const trap = makeGraveTrap(5, 5);
    const state = makeState({ units: [trigger, aoe1, aoe2], buildings: [trap] });
    const events: GameEvent[] = [];

    produce(state, (draft) => {
      checkGraveTrapTrigger(draft, trigger.id, events);
    });

    const stunEvents = events.filter((e) => e.type === 'STUN_APPLIED') as Extract<GameEvent, { type: 'STUN_APPLIED' }>[];
    expect(stunEvents).toHaveLength(3);
    expect(stunEvents.map((e) => e.unitId)).toContain(trigger.id);
    expect(stunEvents.map((e) => e.unitId)).toContain(aoe1.id);
    expect(stunEvents.map((e) => e.unitId)).toContain(aoe2.id);

    // All STUN_APPLIED events must come before TRAP_TRIGGERED
    const trapIdx = events.findIndex((e) => e.type === 'TRAP_TRIGGERED');
    expect(trapIdx).toBeGreaterThan(0);
    for (const sev of stunEvents) {
      expect(events.indexOf(sev)).toBeLessThan(trapIdx);
    }
  });

  it('does not emit STUN_APPLIED for ALERT-tagged trigger unit', () => {
    const alertUnit = makeEnemyUnit({ tags: [UnitTag.ALERT] });
    const trap = makeGraveTrap(5, 5);
    const state = makeState({ units: [alertUnit], buildings: [trap] });
    const events: GameEvent[] = [];

    produce(state, (draft) => {
      checkGraveTrapTrigger(draft, alertUnit.id, events);
    });

    expect(events.filter((e) => e.type === 'STUN_APPLIED')).toHaveLength(0);
    expect(events.find((e) => e.type === 'TRAP_TRIGGERED')).toBeDefined();
  });

  it('does not emit STUN_APPLIED for ALERT-tagged AOE units', () => {
    const trigger = makeEnemyUnit({ id: 'tr', position: { x: 5, y: 5 } });
    const alertNeighbour = makeEnemyUnit({ id: 'alert', position: { x: 5, y: 4 }, tags: [UnitTag.ALERT] });
    const normalNeighbour = makeEnemyUnit({ id: 'normal', position: { x: 6, y: 5 } });
    const trap = makeGraveTrap(5, 5);
    const state = makeState({ units: [trigger, alertNeighbour, normalNeighbour], buildings: [trap] });
    const events: GameEvent[] = [];

    produce(state, (draft) => {
      checkGraveTrapTrigger(draft, trigger.id, events);
    });

    const stunIds = (events.filter((e) => e.type === 'STUN_APPLIED') as Extract<GameEvent, { type: 'STUN_APPLIED' }>[]).map((e) => e.unitId);
    expect(stunIds).toContain(trigger.id);
    expect(stunIds).toContain(normalNeighbour.id);
    expect(stunIds).not.toContain(alertNeighbour.id);
  });
});

// ============================================================================
// checkGraveTrapTrigger — player path regression (no events array)
// ============================================================================

describe('checkGraveTrapTrigger (player path, no events)', () => {
  it('mutates state identically when called without events', () => {
    const enemy = makeEnemyUnit({ position: { x: 5, y: 5 } });
    const trap = makeGraveTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkGraveTrapTrigger(draft, enemy.id); // no events array
    });

    expect(next.units[enemy.id]!.pinnedUntilTurn).toBe(1);
    expect(next.buildings[trap.id]).toBeUndefined();
    expect(next.grid[5][5].buildingId).toBeNull();
  });
});

// ============================================================================
// checkScoutTrapTrigger — enemy path (events array provided)
// ============================================================================

describe('checkScoutTrapTrigger (enemy path, events array)', () => {
  it('emits TILE_DAMAGE(TRAP), STUN_APPLIED, TRAP_TRIGGERED in order', () => {
    const enemy = makeEnemyUnit({ position: { x: 5, y: 5 } });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });
    const events: GameEvent[] = [];

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id, events);
    });

    // State: unit damaged and stunned, trap gone
    expect(next.units[enemy.id]!.stats.currentHp).toBe(
      UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp - ABILITIES.SCOUT_TRAP_DAMAGE,
    );
    expect(next.units[enemy.id]!.pinnedUntilTurn).toBe(
      state.turn + ABILITIES.SCOUT_TRAP_STUN_TURNS - 1,
    );
    expect(next.buildings[trap.id]).toBeUndefined();

    // Event sequence: TILE_DAMAGE → STUN_APPLIED → TRAP_TRIGGERED
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: 'TILE_DAMAGE',
      unitId: enemy.id,
      amount: ABILITIES.SCOUT_TRAP_DAMAGE,
      damageSource: 'TRAP',
    });
    expect(events[1]).toMatchObject({ type: 'STUN_APPLIED', unitId: enemy.id });
    expect(events[2]).toMatchObject({
      type: 'TRAP_TRIGGERED',
      buildingId: trap.id,
      position: { x: 5, y: 5 },
    });
  });

  it('does not emit STUN_APPLIED for ALERT-tagged unit (still emits TILE_DAMAGE + TRAP_TRIGGERED)', () => {
    const alertEnemy = makeEnemyUnit({ tags: [UnitTag.ALERT] });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [alertEnemy], buildings: [trap] });
    const events: GameEvent[] = [];

    produce(state, (draft) => {
      checkScoutTrapTrigger(draft, alertEnemy.id, events);
    });

    expect(events.some((e) => e.type === 'TILE_DAMAGE')).toBe(true);
    expect(events.some((e) => e.type === 'STUN_APPLIED')).toBe(false);
    expect(events.some((e) => e.type === 'TRAP_TRIGGERED')).toBe(true);
  });

  it('emits nothing for FLYING units', () => {
    const flier = makeEnemyUnit({ tags: [UnitTag.FLYING] });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [flier], buildings: [trap] });
    const events: GameEvent[] = [];

    produce(state, (draft) => {
      checkScoutTrapTrigger(draft, flier.id, events);
    });

    expect(events).toHaveLength(0);
  });

  it('emits damage, death, and trap consumption in order for a lethal trigger', () => {
    const baseStats = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT];
    const enemy = makeEnemyUnit({ stats: { ...baseStats, currentHp: 1 } } as Partial<Unit>);
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });
    const events: GameEvent[] = [];

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id, events);
    });

    expect(next.units[enemy.id]).toBeUndefined();
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('TILE_DAMAGE');
    expect(events[1]).toMatchObject({ type: 'UNIT_DEATH', unitId: enemy.id });
    expect(events[2]).toMatchObject({ type: 'TRAP_TRIGGERED', buildingId: trap.id });
    expect(next.buildings[trap.id]).toBeUndefined();
  });
});

// ============================================================================
// checkScoutTrapTrigger — player path regression (no events array)
// ============================================================================

describe('checkScoutTrapTrigger (player path, no events)', () => {
  it('mutates state identically when called without events', () => {
    const enemy = makeEnemyUnit({ position: { x: 5, y: 5 } });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id); // no events array
    });

    expect(next.units[enemy.id]!.stats.currentHp).toBe(
      UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp - ABILITIES.SCOUT_TRAP_DAMAGE,
    );
    expect(next.units[enemy.id]!.pinnedUntilTurn).toBe(
      state.turn + ABILITIES.SCOUT_TRAP_STUN_TURNS - 1,
    );
    expect(next.buildings[trap.id]).toBeUndefined();
    expect(next.grid[5][5].buildingId).toBeNull();
  });
});

describe('Scout Trap animation replay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnimationStore.getState().clear();
    useFloaterStore.setState({ floaters: [] });
  });

  afterEach(() => {
    effects.cleanup?.();
    effects.cleanup = undefined;
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    useAnimationStore.getState().clear();
  });

  function enqueueTrapTrigger(lethal: boolean, tags: UnitTag[] = []) {
    const enemy = makeEnemyUnit({
      id: 'trigger',
      position: { x: 5, y: 4 },
      tags,
      stats: {
        ...makeEnemyUnit().stats,
        currentHp: lethal ? ABILITIES.SCOUT_TRAP_DAMAGE : ABILITIES.SCOUT_TRAP_DAMAGE * 3,
        maxHp: ABILITIES.SCOUT_TRAP_DAMAGE * 3,
      },
    });
    const observer = makeEnemyUnit({ id: 'next-enemy', position: { x: 8, y: 4 } });
    const trap = makeScoutTrap(5, 5);
    const live = {
      ...useGameStore.getInitialState(),
      ...makeState({ units: [enemy, observer], buildings: [trap] }),
      pendingBrandmarkTransforms: [],
    };
    const events: GameEvent[] = [
      { type: 'ENEMY_MOVE', unitId: enemy.id, from: { x: 5, y: 4 }, to: { x: 5, y: 5 } },
    ];
    const resolved = produce(live, (draft) => {
      draft.grid[4][5].unitId = null;
      draft.grid[5][5].unitId = enemy.id;
      draft.units[enemy.id].position = { x: 5, y: 5 };
      checkScoutTrapTrigger(draft, enemy.id, events);
      draft.grid[4][8].unitId = null;
      draft.grid[5][8].unitId = observer.id;
      draft.units[observer.id].position = { x: 8, y: 5 };
    });
    events.push({ type: 'ENEMY_MOVE', unitId: observer.id, from: { x: 8, y: 4 }, to: { x: 8, y: 5 } });
    useGameStore.setState(live);
    const replay = vi.spyOn(useGameStore.getState(), 'applyEvent');
    const floaters = vi.spyOn(useFloaterStore.getState(), 'addFloater');
    renderToStaticMarkup(createElement(AnimationEngineHarness));
    useAnimationStore.getState().enqueue(events, resolved);
    return { enemy, observer, trap, replay, floaters };
  }

  it('updates HP, stun, removal, and floaters at arrival before the next enemy moves', async () => {
    const { enemy, observer, trap, replay, floaters } = enqueueTrapTrigger(false);
    expect(useGameStore.getState().units[enemy.id].stats.currentHp).toBe(enemy.stats.currentHp);
    await vi.advanceTimersByTimeAsync(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);
    const state = useGameStore.getState();
    expect(state.units[enemy.id].position).toEqual({ x: 5, y: 5 });
    expect(state.units[enemy.id].stats.currentHp).toBe(enemy.stats.currentHp - ABILITIES.SCOUT_TRAP_DAMAGE);
    expect(state.units[enemy.id].pinnedUntilTurn).toBe(state.turn + ABILITIES.SCOUT_TRAP_STUN_TURNS - 1);
    expect(state.buildings[trap.id]).toBeUndefined();
    expect(state.grid[5][5].buildingId).toBeNull();
    expect(state.units[observer.id].position).toEqual(observer.position);
    expect(floaters).toHaveBeenCalledWith(expect.objectContaining({
      value: ABILITIES.SCOUT_TRAP_DAMAGE, x: 5, y: 5, isEnemy: true, floaterType: 'damage',
    }));
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().units[enemy.id].stats.currentHp).toBe(enemy.stats.currentHp - ABILITIES.SCOUT_TRAP_DAMAGE);
    expect(replay.mock.calls.filter(([event]) => event.type === 'TILE_DAMAGE')).toHaveLength(1);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('plays lethal damage and death at arrival and consumes the trap before another action', async () => {
    const { enemy, observer, trap, replay } = enqueueTrapTrigger(true);
    await vi.advanceTimersByTimeAsync(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);
    expect(useGameStore.getState().units[enemy.id].stats.currentHp).toBe(0);
    expect(useGameStore.getState().units[observer.id].position).toEqual(observer.position);
    await vi.advanceTimersByTimeAsync(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
    expect(useGameStore.getState().units[enemy.id]).toBeUndefined();
    expect(useGameStore.getState().grid[5][5].unitId).toBeNull();
    expect(useGameStore.getState().buildings[trap.id]).toBeUndefined();
    expect(useGameStore.getState().units[observer.id].position).toEqual(observer.position);
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().units[enemy.id]).toBeUndefined();
    expect(replay.mock.calls.map(([event]) => event.type)).toEqual([
      'ENEMY_MOVE', 'TILE_DAMAGE', 'UNIT_DEATH', 'TRAP_TRIGGERED', 'ENEMY_MOVE',
    ]);
  });

  it('retains ALERT immunity while replaying damage and consumption at arrival', async () => {
    const { enemy, trap } = enqueueTrapTrigger(false, [UnitTag.ALERT]);
    await vi.advanceTimersByTimeAsync(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);
    expect(useGameStore.getState().units[enemy.id].stats.currentHp).toBe(enemy.stats.currentHp - ABILITIES.SCOUT_TRAP_DAMAGE);
    expect(useGameStore.getState().units[enemy.id].pinnedUntilTurn).toBe(0);
    expect(useGameStore.getState().buildings[trap.id]).toBeUndefined();
    await vi.runAllTimersAsync();
  });
});

describe('Scout Trap enemy simulation', () => {
  it('emits arrival, damage, death, and consumption without any subsequent action by the victim', () => {
    const enemy = makeEnemyUnit({
      id: 'doomed',
      position: { x: 4, y: 28 },
      stats: { ...makeEnemyUnit().stats, currentHp: 1, moveRange: 1, movementActions: 2 },
    });
    const trap = makeScoutTrap(4, 29);
    const stronghold = { ...makeGraveTrap(4, 70), type: BuildingType.STRONGHOLD, hp: 500, maxHp: 500 };
    const state = {
      ...useGameStore.getInitialState(),
      ...makeState({ units: [enemy], buildings: [trap, stronghold] }),
      turn: 3,
      techFlags: [],
      portals: {},
      activeCaveEncounters: [],
      pendingBrandmarkTransforms: [],
    };
    state.grid[29][3].terrainType = TileType.CANYON;
    state.grid[29][5].terrainType = TileType.CANYON;
    const { finalState: resolved, events } = runEnemyTurn(state);
    expect(resolved.units[enemy.id]).toBeUndefined();
    const arrival = events.findIndex((event) => event.type === 'ENEMY_MOVE' && event.unitId === enemy.id);
    expect(arrival).toBeGreaterThanOrEqual(0);
    expect(events.slice(arrival, arrival + 4).map((event) => event.type)).toEqual([
      'ENEMY_MOVE', 'TILE_DAMAGE', 'UNIT_DEATH', 'TRAP_TRIGGERED',
    ]);
    expect(events.slice(arrival + 4).some((event) =>
      ('unitId' in event && event.unitId === enemy.id) ||
      ('attackerId' in event && event.attackerId === enemy.id),
    )).toBe(false);
  });
});
