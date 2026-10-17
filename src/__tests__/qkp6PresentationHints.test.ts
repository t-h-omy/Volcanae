import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMATION } from '../../config/animation';
import { CRYSTAL_CHAMBER_CONFIG, UNIT_DEFINITIONS } from '../gameConfig';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { useGameStore } from '../gameStore';
import { useAnimationEngine } from '../useAnimationEngine';
import { tryTriggerHint } from '../hintSystem';
import { Faction, TileType, UnitType } from '../types';
import type { Unit } from '../types';
import type { GameEvent } from '../gameEvents';

const effects = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void)) => { effects.cleanup = effect(); },
}));
vi.mock('../hintSystem', () => ({
  tryTriggerHint: vi.fn(() => false),
  flushDeferredHints: vi.fn(),
}));

function Harness() {
  useAnimationEngine();
  return null;
}

function unit(id: string, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON];
  return {
    id, type: UnitType.CRYSTAL_KHYRON, faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
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

function reset(revealed = true, units = [unit('first'), unit('second')]) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    buildings: {},
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    grid: [[{
      position: { x: 0, y: 0 }, isRevealed: revealed,
      buildingId: null, unitId: null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    }]],
  });
}

function resonance(ids = ['first', 'second']): GameEvent {
  return {
    type: 'RESONANCE_TRIGGERED', destroyedChamberPosition: { x: 0, y: 0 },
    survivingChamberIds: ['missing-chamber'], survivingCaveIds: [],
    survivingKhyronIds: ids,
    resonanceDuration: CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
  };
}

function replay(events: GameEvent[]) {
  const activate = vi.fn(useGameStore.getInitialState().activateCrystalKhyron);
  useGameStore.setState({ activateCrystalKhyron: activate });
  useAnimationStore.getState().enqueue(events, useGameStore.getState());
  renderToStaticMarkup(createElement(Harness));
  useAnimationStore.setState({ resolvedState: null });
  return activate;
}

const arrival = ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS;

describe('QKP6 presentation hint triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    useAnimationStore.setState(useAnimationStore.getInitialState());
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
    reset();
  });
  afterEach(() => {
    effects.cleanup?.();
    effects.cleanup = undefined;
    vi.clearAllTimers();
    vi.useRealTimers();
    useAnimationStore.getState().clear();
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
  });

  it('attempts H21 after the first visible activation VFX and post-idle, only once per event', async () => {
    const activate = replay([resonance()]);
    expect(tryTriggerHint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(arrival);
    expect(activate).toHaveBeenCalledWith('first');
    expect(tryTriggerHint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ANIMATION.CRYSTAL_ACTIVATE_VFX_DURATION_MS);
    expect(useCombatAnimationStore.getState().unitAnimations.size).toBe(0);
    expect(tryTriggerHint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ANIMATION.POST_ACTION_IDLE_MS - 1);
    expect(tryTriggerHint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(tryTriggerHint).toHaveBeenCalledExactlyOnceWith('H21_KHYRON_RESONANCE');
    await vi.runAllTimersAsync();
    expect(activate).toHaveBeenCalledTimes(2);
    expect(tryTriggerHint).toHaveBeenCalledTimes(1);
  });

  it('attempts H21 immediately after hidden activation and not for already presented IDs', async () => {
    reset(false);
    const activationAtHint: boolean[] = [];
    vi.mocked(tryTriggerHint).mockImplementation(() => {
      activationAtHint.push(useGameStore.getState().units.first.resonanceActive === true);
      return false;
    });
    const activate = replay([resonance(), resonance()]);
    expect(activationAtHint).toEqual([true]);
    expect(activate).toHaveBeenCalledTimes(2);
    expect(tryTriggerHint).toHaveBeenCalledExactlyOnceWith('H21_KHYRON_RESONANCE');
    await vi.runAllTimersAsync();
    expect(tryTriggerHint).toHaveBeenCalledTimes(1);
  });

  it('allows one attempt for each event that actually activates a new Khyron', async () => {
    reset(false);
    replay([resonance(['first']), resonance(['first', 'second'])]);
    await vi.runAllTimersAsync();
    expect(tryTriggerHint).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])('does not hint without an actual eligible activation (revealed: %s)', async (revealed) => {
    const dead = unit('dead');
    dead.stats.currentHp = 0;
    reset(revealed, [
      dead, unit('enemy', { faction: Faction.ENEMY }),
      unit('other', { type: UnitType.SWORDSMAN }),
    ]);
    const activate = replay([
      resonance([]), resonance(['missing', 'dead', 'enemy', 'other']),
      { ...resonance(['other']), survivingChamberIds: [] } as GameEvent,
    ]);
    await vi.runAllTimersAsync();
    expect(activate).not.toHaveBeenCalled();
    expect(tryTriggerHint).not.toHaveBeenCalled();
  });

  it('does not hint if the Khyron disappears before camera arrival', async () => {
    replay([resonance(['first'])]);
    useGameStore.setState({ units: {} });
    await vi.runAllTimersAsync();
    expect(tryTriggerHint).not.toHaveBeenCalled();
  });

  it('waits for a revealed Khyron presentation even when the resonance source is hidden', async () => {
    reset(false, [unit('first', { position: { x: 1, y: 0 } })]);
    const tile = useGameStore.getState().grid[0][0];
    useGameStore.setState({ grid: [[tile, { ...tile, position: { x: 1, y: 0 }, isRevealed: true }]] });
    replay([resonance(['first'])]);
    await vi.advanceTimersByTimeAsync(arrival + ANIMATION.CRYSTAL_ACTIVATE_VFX_DURATION_MS);
    expect(tryTriggerHint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ANIMATION.POST_ACTION_IDLE_MS);
    expect(tryTriggerHint).toHaveBeenCalledExactlyOnceWith('H21_KHYRON_RESONANCE');
    await vi.runAllTimersAsync();
  });

  it.each([
    { faction: Faction.PLAYER, source: 'QORK_DRAIN', amount: 1, hint: true },
    { faction: Faction.ENEMY, source: 'QORK_DRAIN', amount: 1, hint: false },
    { faction: Faction.PLAYER, source: 'QORK_DRAIN', amount: 0, hint: false },
    { faction: Faction.PLAYER, source: 'QORK_DRAIN', amount: -1, hint: false },
    ...(['BURNING', 'TAG', 'TRAP', 'INFESTED', 'QORK_EXPLOSION', undefined] as const)
      .map((source) => ({ faction: Faction.PLAYER, source, amount: 1, hint: false })),
  ] as const)('gates H22: $faction / $source / $amount', async ({ faction, source, amount, hint }) => {
    reset(false, [unit('first', { faction })]);
    const hp = useGameStore.getState().units.first.stats.currentHp;
    const hpAtHint: number[] = [];
    vi.mocked(tryTriggerHint).mockImplementation(() => {
      hpAtHint.push(useGameStore.getState().units.first.stats.currentHp);
      return false;
    });
    replay([{
      type: 'TILE_DAMAGE', unitId: 'first', position: { x: 0, y: 0 },
      amount, damageSource: source,
    }]);
    await vi.runAllTimersAsync();
    if (hint) {
      expect(tryTriggerHint).toHaveBeenCalledExactlyOnceWith('H22_QORK_CORRUPTION');
      expect(hpAtHint).toEqual([hp - amount]);
    } else {
      expect(tryTriggerHint).not.toHaveBeenCalled();
    }
  });

  it('does not hint for a missing Qork drain victim', async () => {
    reset(false, []);
    replay([{
      type: 'TILE_DAMAGE', unitId: 'missing', position: { x: 0, y: 0 },
      amount: 1, damageSource: 'QORK_DRAIN',
    }]);
    await vi.runAllTimersAsync();
    expect(tryTriggerHint).not.toHaveBeenCalled();
  });
});
