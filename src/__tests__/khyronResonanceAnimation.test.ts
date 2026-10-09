import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMATION } from '../../config/animation';
import { CRYSTAL_CHAMBER_CONFIG, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { useGameStore } from '../gameStore';
import { useAnimationEngine } from '../useAnimationEngine';
import { advanceLavaWithEvents } from '../lavaSystem';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

const effects = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void)) => { effects.cleanup = effect(); },
}));

function Harness() {
  useAnimationEngine();
  return null;
}

function unit(id: string, x: number, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON];
  return {
    id, type: UnitType.CRYSTAL_KHYRON, faction: Faction.PLAYER,
    position: { x, y: 1 },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0, movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [], resonanceActive: false,
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasCapturedThisTurn: false,
    hasTradedThisTurn: false, hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0, lastMovedTurn: 0,
    ...overrides,
  };
}

function building(id: string, type: BuildingType, position: Position): Building {
  return {
    id, type, position, faction: Faction.PLAYER, hp: 100, maxHp: 100,
    specialistSlot: null, isDisabledForTurns: 0, wasAttackedLastEnemyTurn: false,
    captureProgress: 0, isBeingCapturedBy: null, discoverRadius: 1,
    turnCapturedByPlayer: null, wasEnemyOwnedBeforeCapture: false, combatStats: null,
    hasAttackedThisTurn: false, tags: [], consumesUnitOnCapture: false,
    populationCount: 0, populationCap: 0, populationGrowthCounter: 0, strongholdNobles: 0,
    emberSpawnCounter: 0, recruitmentQueue: null, destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0, spawnCooldownRemaining: 0, lastRecruitmentTurn: 0,
  };
}

function state(revealed = true): GameState {
  const units = [unit('first', 2), unit('second', 3)];
  const buildings = [
    building('chamber', BuildingType.CRYSTAL_CHAMBER, { x: 0, y: 0 }),
    building('cave', BuildingType.CRYSTAL_CAVE, { x: 1, y: 0 }),
  ];
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y }, isRevealed: revealed, buildingId: null as string | null,
      unitId: null as string | null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    })),
  );
  for (const u of units) grid[u.position.y][u.position.x].unitId = u.id;
  for (const b of buildings) grid[b.position.y][b.position.x].buildingId = b.id;
  return {
    ...useGameStore.getInitialState(), grid,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    buildings: Object.fromEntries(buildings.map((b) => [b.id, b])),
  };
}

function resonance(overrides: Partial<Extract<GameEvent, { type: 'RESONANCE_TRIGGERED' }>> = {}): GameEvent {
  return {
    type: 'RESONANCE_TRIGGERED', destroyedChamberPosition: { x: 0, y: 4 },
    survivingChamberIds: ['chamber'], survivingCaveIds: ['cave'],
    survivingKhyronIds: ['first', 'second'],
    resonanceDuration: CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION, ...overrides,
  };
}

function replay(events: GameEvent[]) {
  const activate = vi.spyOn(useGameStore.getState(), 'activateCrystalKhyron');
  const camera = vi.spyOn(useAnimationStore.getState(), 'setCameraTarget');
  const animation = vi.spyOn(useCombatAnimationStore.getState(), 'setUnitAnimation');
  useAnimationStore.getState().enqueue(events, useGameStore.getState());
  renderToStaticMarkup(createElement(Harness));
  // Exercise live event application without a final snapshot masking missing mutations.
  useAnimationStore.setState({ resolvedState: null });
  return { activate, camera, animation };
}

const arrival = ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS;
const presentation = ANIMATION.CRYSTAL_ACTIVATE_VFX_DURATION_MS + ANIMATION.POST_ACTION_IDLE_MS;

describe('Khyron resonance event presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnimationStore.setState(useAnimationStore.getInitialState());
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
    useGameStore.setState(state());
  });
  afterEach(() => {
    effects.cleanup?.();
    effects.cleanup = undefined;
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    useAnimationStore.getState().clear();
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
  });

  it('finishes each camera move before individual activation, after Chambers and Caves', async () => {
    const { activate, camera, animation } = replay([resonance()]);
    expect(camera).toHaveBeenLastCalledWith({ x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(arrival);
    expect(useGameStore.getState().buildings.chamber.resonanceTurnsRemaining).toBeGreaterThan(0);
    expect(activate).not.toHaveBeenCalled();
    expect(useGameStore.getState().units.first.resonanceActive).toBe(false);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(false);
    await vi.advanceTimersByTimeAsync(presentation);
    expect(camera).toHaveBeenLastCalledWith({ x: 1, y: 0 });
    await vi.advanceTimersByTimeAsync(arrival + presentation);
    expect(camera).toHaveBeenLastCalledWith({ x: 2, y: 1 });
    await vi.advanceTimersByTimeAsync(ANIMATION.CAMERA_MOVE_DURATION_MS - 1);
    expect(activate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ANIMATION.PRE_ACTION_IDLE_MS + 1);
    expect(activate.mock.calls).toEqual([['first']]);
    expect(useGameStore.getState().units.first.resonanceActive).toBe(true);
    expect(useGameStore.getState().units.first.tags).toContain(UnitTag.RESONANCE);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(false);
    expect(animation).toHaveBeenLastCalledWith('first', { type: 'CRYSTAL_ACTIVATE' });
    await vi.advanceTimersByTimeAsync(presentation);
    expect(camera).toHaveBeenLastCalledWith({ x: 3, y: 1 });
    expect(activate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(arrival);
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    await vi.runAllTimersAsync();
    expect(useCombatAnimationStore.getState().unitAnimations.size).toBe(0);
  });

  it('deduplicates IDs and repeated sources, skipping missing, dead and ineligible units', async () => {
    const live = state();
    live.units.dead = unit('dead', 4);
    live.units.dead.stats.currentHp = 0;
    live.units.enemy = unit('enemy', 5, { faction: Faction.ENEMY });
    live.units.other = unit('other', 6, { type: UnitType.SWORDSMAN });
    useGameStore.setState(live);
    const event = resonance({ survivingKhyronIds: ['missing', 'dead', 'enemy', 'other', 'first', 'first', 'second'] });
    const { activate, camera } = replay([event, event]);
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    expect(camera.mock.calls.filter(([pos]) => pos.y === 1)).toEqual([
      [{ x: 2, y: 1 }], [{ x: 3, y: 1 }],
    ]);
  });

  it('rechecks the live unit after camera arrival instead of activating a removed unit', async () => {
    const { activate } = replay([resonance({ survivingChamberIds: ['missing'], survivingCaveIds: [] })]);
    useGameStore.setState((live) => ({
      units: Object.fromEntries(Object.entries(live.units).filter(([id]) => id !== 'first')),
    }));
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['second']]);
  });

  it('activates hidden-event live Khyrons without camera, VFX or final snapshot', async () => {
    useGameStore.setState(state(false));
    const { activate, camera, animation } = replay([resonance(), resonance()]);
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(true);
    expect(camera).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
  });

  it('does not activate Khyrons for a cave-only event even with supplied IDs', async () => {
    const { activate } = replay([resonance({ survivingChamberIds: [] })]);
    await vi.runAllTimersAsync();
    expect(activate).not.toHaveBeenCalled();
    expect(useGameStore.getState().units.first.resonanceActive).toBe(false);
    expect(useGameStore.getState().buildings.cave.resonanceTurnsRemaining).toBeGreaterThan(0);
  });

  it('the store activates one eligible unit only and Chamber activation never grants globally', () => {
    const live = state();
    live.units.dead = unit('dead', 4);
    live.units.dead.stats.currentHp = 0;
    live.units.enemy = unit('enemy', 5, { faction: Faction.ENEMY });
    live.units.other = unit('other', 6, { type: UnitType.SWORDSMAN });
    useGameStore.setState(live);
    useGameStore.getState().activateCrystalChamber('chamber');
    expect(Object.values(useGameStore.getState().units).every((u) => !u.resonanceActive)).toBe(true);
    for (const id of ['missing', 'dead', 'enemy', 'other', 'first', 'first']) {
      useGameStore.getState().activateCrystalKhyron(id);
    }
    expect(useGameStore.getState().units.first.tags).toEqual([UnitTag.RESONANCE]);
    expect(useGameStore.getState().units.first.resonanceActive).toBe(true);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(false);
  });

  it.each([true, false])('emits surviving Khyron IDs only with a surviving Chamber: %s', (hasChamber) => {
    const live = state();
    const doomed = building('doomed', BuildingType.CRYSTAL_CHAMBER, { x: 0, y: 4 });
    live.buildings.doomed = doomed;
    live.grid[4][0].buildingId = doomed.id;
    live.lavaFrontRow = 5;
    live.units['doomed-unit'] = unit('doomed-unit', 1, { position: { x: 1, y: 4 } });
    live.grid[4][1].unitId = 'doomed-unit';
    live.units.enemy = unit('enemy', 5, { faction: Faction.ENEMY });
    if (!hasChamber) {
      delete live.buildings.chamber;
      live.grid[0][0].buildingId = null;
    }
    const { events, newState } = advanceLavaWithEvents(live);
    const event = events.find((e) => e.type === 'RESONANCE_TRIGGERED');
    expect(event?.type).toBe('RESONANCE_TRIGGERED');
    if (event?.type !== 'RESONANCE_TRIGGERED') return;
    if (hasChamber) expect(event.survivingKhyronIds).toEqual(['first', 'second']);
    else expect(event).not.toHaveProperty('survivingKhyronIds');
    expect(newState.units.first.resonanceActive).toBe(hasChamber);
    expect(live.units.first.resonanceActive).toBe(false);
  });
});
