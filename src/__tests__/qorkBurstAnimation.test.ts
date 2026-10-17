import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMATION } from '../../config/animation';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { useFloaterStore } from '../floaterStore';
import { useGameStore } from '../gameStore';
import { useSpecialistHireStore } from '../specialistHireStore';
import { useAnimationEngine } from '../useAnimationEngine';
import { Faction, TileType, UnitType } from '../types';
import type { GameState, Unit } from '../types';
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

function unit(id: string, x: number, type: UnitType = UnitType.SWORDSMAN): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id, type, faction: Faction.ENEMY, position: { x, y: 1 },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0, movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [], hasMovedThisTurn: false, hasAttackedThisTurn: false,
    hasCapturedThisTurn: false, hasTradedThisTurn: false, hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false, hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false, xp: 0, level: 1, pinnedUntilTurn: 0,
    distractionDefPenalty: 0, lastMovedTurn: 0,
  };
}

function state(revealed = true): GameState {
  const units = [
    unit('attacker', 1), unit('qork', 2, UnitType.CORRUPTED_QORK),
    unit('first', 3), unit('second', 4), unit('chain', 5, UnitType.CORRUPTED_QORK),
    unit('deep', 6, UnitType.CORRUPTED_QORK), unit('sibling', 7, UnitType.CORRUPTED_QORK),
    unit('cleave', 8),
  ];
  units[0].faction = Faction.PLAYER;
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y }, isRevealed: revealed, buildingId: null as string | null,
      unitId: null as string | null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    })),
  );
  for (const u of units) grid[u.position.y][u.position.x].unitId = u.id;
  return {
    ...useGameStore.getInitialState(), grid, buildings: {},
    units: Object.fromEntries(units.map((u) => [u.id, u])),
  };
}

function death(id: string): Extract<GameEvent, { type: 'UNIT_DEATH' }> {
  const u = useGameStore.getState().units[id];
  return { type: 'UNIT_DEATH', unitId: id, position: { ...u.position }, faction: u.faction };
}

function burst(id: string, damagedUnitIds: string[] = []): GameEvent {
  const u = useGameStore.getState().units[id];
  return {
    type: 'QORK_DEATH_BURST', unitId: id, position: { ...u.position },
    faction: u.faction, damagedUnitIds,
  };
}

function damage(id: string): GameEvent {
  return {
    type: 'TILE_DAMAGE', unitId: id, position: { ...useGameStore.getState().units[id].position },
    amount: 1000, damageSource: 'QORK_EXPLOSION',
  };
}

function attack(defenderId = 'qork', advance = false): GameEvent {
  return {
    type: 'PLAYER_ATTACK', attackerId: 'attacker', defenderId,
    attackerPosition: { x: 1, y: 1 },
    defenderPosition: { ...useGameStore.getState().units[defenderId].position },
    attackerHpLost: 0, defenderHpLost: 1000,
    advancedToPosition: advance ? { ...useGameStore.getState().units[defenderId].position } : null,
  };
}

function secondary(type: 'PIERCE_DAMAGE' | 'CLEAVE_DAMAGE' | 'SPLASH_DAMAGE', id: string): GameEvent {
  const common = {
    unitId: id, position: { ...useGameStore.getState().units[id].position },
    amount: 1000, isEnemy: true, attackerPosition: { x: 1, y: 1 },
  };
  if (type === 'PIERCE_DAMAGE') {
    return { type, ...common, buildingId: null, primaryDefenderPosition: { x: 2, y: 1 } };
  }
  return { type, ...common };
}

function replay(events: GameEvent[]) {
  const calls: { time: number; event: GameEvent }[] = [];
  const apply = useGameStore.getState().applyEvent;
  const applied = vi.spyOn(useGameStore.getState(), 'applyEvent').mockImplementation((event, options) => {
    calls.push({ time: Date.now(), event });
    apply(event, options);
  });
  const camera = vi.spyOn(useAnimationStore.getState(), 'setCameraTarget');
  const animation = vi.spyOn(useCombatAnimationStore.getState(), 'setUnitAnimation');
  const vfx = vi.spyOn(useCombatAnimationStore.getState(), 'addTileVfx');
  useAnimationStore.getState().enqueue(events, useGameStore.getState());
  renderToStaticMarkup(createElement(Harness));
  useAnimationStore.setState({ resolvedState: null });
  return { calls, applied, camera, animation, vfx };
}

const arrival = ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS;
const dying = ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS;
const burstBeat = Math.max(dying, ANIMATION.QORK_DEATH_BURST_MS);
const impact = ANIMATION.MELEE_LUNGE_DURATION_MS / 2;

describe('Qork burst presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnimationStore.setState(useAnimationStore.getInitialState());
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
    useFloaterStore.setState({ floaters: [] });
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
    useFloaterStore.setState({ floaters: [] });
  });

  it.each(['CORRUPTION_APPLIED', 'CORRUPTION_FIZZLE'] as const)(
    'starts skull, burst, %s, all damage floaters and HITs on one camera arrival',
    async (type) => {
      const { camera, animation, vfx, calls } = replay([
        death('qork'), burst('qork', ['first', 'second']),
        { type, position: { x: 2, y: 1 } }, damage('first'), damage('second'),
      ]);
      expect(camera).toHaveBeenCalledTimes(1);
      expect(animation).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(arrival - 1);
      expect(vfx).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(animation).toHaveBeenCalledWith('qork', { type: 'DYING' });
      expect(animation).toHaveBeenCalledWith('first', { type: 'HIT' });
      expect(animation).toHaveBeenCalledWith('second', { type: 'HIT' });
      expect(vfx.mock.calls.map(([value]) => value.variant)).toEqual(['QORK_DEATH_BURST', type]);
      const hits = calls.filter(({ event }) => event.type === 'TILE_DAMAGE');
      expect(hits).toHaveLength(2);
      expect(hits[0].time).toBe(hits[1].time);
      expect(useFloaterStore.getState().floaters.filter((floater) => floater.value === 1000)).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(burstBeat - 1);
      expect(useGameStore.getState().units.qork).toBeDefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(useGameStore.getState().units.qork).toBeUndefined();
      expect(useAnimationStore.getState().isAnimating).toBe(false);
      expect(camera).toHaveBeenCalledTimes(1);
    },
  );

  it('dies all ordinary burst victims together after one shared burst beat', async () => {
    const { calls, camera } = replay([
      death('qork'), burst('qork', ['first', 'second']), damage('first'), damage('second'),
      death('first'), death('second'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + burstBeat);
    expect(useCombatAnimationStore.getState().unitAnimations.get('first')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('second')?.type).toBe('DYING');
    await vi.advanceTimersByTimeAsync(dying);
    const deaths = calls.filter(({ event }) => event.type === 'UNIT_DEATH' && event.unitId !== 'qork');
    expect(deaths).toHaveLength(2);
    expect(deaths[0].time).toBe(deaths[1].time);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('groups burst deaths across cave rewards without dropping or bypassing their modal', async () => {
    useGameStore.setState({ specialists: {}, activeCaveEncounters: [] });
    let dismiss: (() => void) | undefined;
    const reward = vi.spyOn(useSpecialistHireStore.getState(), 'showExhausted').mockImplementation((resolve) => {
      dismiss = resolve;
    });
    const { calls, camera } = replay([
      death('qork'), burst('qork', ['first', 'second']), damage('first'), damage('second'),
      death('first'), { type: 'CAVE_MONSTER_KILLED', monsterId: 'first' }, death('second'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + burstBeat);
    expect(useCombatAnimationStore.getState().unitAnimations.get('first')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('second')?.type).toBe('DYING');
    expect(reward).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(dying);
    expect(useGameStore.getState().units.first).toBeUndefined();
    expect(useGameStore.getState().units.second).toBeUndefined();
    expect(reward).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(useAnimationStore.getState().isAnimating).toBe(true);
    const deaths = calls.filter(({ event }) => event.type === 'UNIT_DEATH' && event.unitId !== 'qork');
    expect(deaths[0].time).toBe(deaths[1].time);
    expect(calls.filter(({ event }) => event.type === 'CAVE_MONSTER_KILLED')).toHaveLength(1);
    dismiss?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('keeps an interleaved heal queued while ordinary burst victims share their death beat', async () => {
    const live = useGameStore.getState();
    const attacker = { ...live.units.attacker, stats: { ...live.units.attacker.stats } };
    attacker.stats.currentHp -= 1;
    useGameStore.setState({ units: { ...live.units, attacker } });
    const heal: GameEvent = { type: 'UNIT_HEAL', unitId: 'attacker', position: { x: 1, y: 1 }, amount: 1 };
    const { calls } = replay([
      death('qork'), burst('qork', ['first', 'second']), damage('first'), damage('second'),
      death('first'), heal, death('second'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + burstBeat);
    expect(useCombatAnimationStore.getState().unitAnimations.get('first')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('second')?.type).toBe('DYING');
    expect(calls.some(({ event }) => event.type === 'UNIT_HEAL')).toBe(false);
    await vi.advanceTimersByTimeAsync(dying);
    expect(useGameStore.getState().units.first).toBeUndefined();
    expect(useGameStore.getState().units.second).toBeUndefined();
    expect(useGameStore.getState().units.attacker.stats.currentHp).toBe(attacker.stats.currentHp);
    await vi.advanceTimersByTimeAsync(arrival);
    expect(calls.filter(({ event }) => event.type === 'UNIT_HEAL').map(({ event }) => event)).toEqual([heal]);
    expect(useGameStore.getState().units.attacker.stats.currentHp).toBe(attacker.stats.maxHp);
    await vi.runAllTimersAsync();
  });

  it('preserves depth-first chained Qork queue order, with one separate camera and beat each', async () => {
    const { camera, vfx } = replay([
      death('qork'), burst('qork', ['chain', 'sibling']), damage('chain'), damage('sibling'),
      death('chain'), death('sibling'),
      burst('chain', ['deep']), damage('deep'), death('deep'),
      burst('deep'), burst('sibling'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + burstBeat);
    expect(useGameStore.getState().units.chain).toBeDefined();
    expect(useGameStore.getState().units.sibling).toBeDefined();
    expect(useCombatAnimationStore.getState().unitAnimations.get('chain')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(arrival);
    expect(useCombatAnimationStore.getState().unitAnimations.get('chain')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('sibling')).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(vfx.mock.calls.filter(([value]) => value.variant === 'QORK_DEATH_BURST')
      .map(([value]) => value.x)).toEqual([2, 5, 6, 7]);
    expect(camera.mock.calls.map(([position]) => position.x)).toEqual([2, 5, 6, 7]);
  });

  it('advances melee only when the Qork burst starts and keeps its in-place ghost', async () => {
    const { animation } = replay([attack('qork', true), death('qork'), burst('qork')]);
    await vi.advanceTimersByTimeAsync(arrival + impact + ANIMATION.HIT_SHAKE_DURATION_MS);
    expect(animation.mock.calls.filter(([id, value]) => id === 'qork' && value?.type === 'DYING')).toHaveLength(0);
    expect(useGameStore.getState().units.attacker.position).toEqual({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(ANIMATION.POST_ACTION_IDLE_MS + arrival);
    expect(useGameStore.getState().units.attacker.position).toEqual({ x: 2, y: 1 });
    expect(useCombatAnimationStore.getState().slideKillGhosts.get('qork')).toMatchObject({
      deathTileX: 2, deathTileY: 1, variant: 'dying-in-place', phase: 'dying',
    });
    expect(useGameStore.getState().grid[1][2].unitId).toBe('attacker');
    await vi.advanceTimersByTimeAsync(burstBeat);
    expect(useCombatAnimationStore.getState().slideKillGhosts.size).toBe(0);
    expect(useGameStore.getState().units.qork).toBeUndefined();
    expect(useGameStore.getState().grid[1][2].unitId).toBe('attacker');
  });

  it('applies primary, pierce and every cleave on one impact and shares impact and death waits', async () => {
    const { calls, camera } = replay([
      attack('first'), death('first'), secondary('PIERCE_DAMAGE', 'second'), death('second'),
      secondary('CLEAVE_DAMAGE', 'cleave'), death('cleave'),
      secondary('CLEAVE_DAMAGE', 'chain'), secondary('CLEAVE_DAMAGE', 'deep'),
      death('chain'), death('deep'), burst('chain'), burst('deep'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + impact);
    const hits = calls.filter(({ event }) => ['PLAYER_ATTACK', 'PIERCE_DAMAGE', 'CLEAVE_DAMAGE'].includes(event.type));
    expect(hits).toHaveLength(5);
    expect(new Set(hits.map(({ time }) => time)).size).toBe(1);
    expect(useCombatAnimationStore.getState().lineVfx.map((vfx) => vfx.variant)).toContain('PIERCE_LINE');
    expect(useCombatAnimationStore.getState().cleaveVfxList).toHaveLength(1);
    for (const id of ['first', 'second', 'cleave', 'chain', 'deep']) {
      expect(useCombatAnimationStore.getState().unitAnimations.get(id)?.type).toBe('HIT');
    }
    await vi.advanceTimersByTimeAsync(Math.max(
      ANIMATION.HIT_SHAKE_DURATION_MS, ANIMATION.PIERCE_LINE_MS, ANIMATION.CLEAVE_VFX_DURATION_MS,
    ));
    expect(useCombatAnimationStore.getState().unitAnimations.get('first')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('second')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('cleave')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().unitAnimations.get('chain')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(dying);
    const deaths = calls.filter(({ event }) => event.type === 'UNIT_DEATH');
    expect(deaths.map(({ event }) => event.type === 'UNIT_DEATH' && event.unitId)).toEqual(['first', 'second', 'cleave']);
    expect(deaths[0].time).toBe(deaths[1].time);
    expect(deaths[1].time).toBe(deaths[2].time);
    expect(camera).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
  });

  it('retains an interleaved cave reward while grouping attack-linked impact and death beats', async () => {
    const live = useGameStore.getState();
    useGameStore.setState({
      specialists: {}, activeCaveEncounters: [],
      units: { ...live.units, first: { ...live.units.first, type: UnitType.CAVE_MONSTER } },
    });
    const reward = vi.spyOn(useSpecialistHireStore.getState(), 'showExhausted').mockImplementation((resolve) => resolve());
    const { calls } = replay([
      attack('first'), death('first'), { type: 'CAVE_MONSTER_KILLED', monsterId: 'first' },
      secondary('PIERCE_DAMAGE', 'second'), death('second'),
      secondary('CLEAVE_DAMAGE', 'cleave'), death('cleave'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + impact);
    const hits = calls.filter(({ event }) => ['PLAYER_ATTACK', 'PIERCE_DAMAGE', 'CLEAVE_DAMAGE'].includes(event.type));
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map(({ time }) => time)).size).toBe(1);
    expect(reward).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(Math.max(
      ANIMATION.HIT_SHAKE_DURATION_MS, ANIMATION.PIERCE_LINE_MS, ANIMATION.CLEAVE_VFX_DURATION_MS,
    ));
    for (const id of ['first', 'second', 'cleave']) {
      expect(useCombatAnimationStore.getState().unitAnimations.get(id)?.type).toBe('DYING');
    }
    await vi.runAllTimersAsync();
    expect(reward).toHaveBeenCalledTimes(1);
    expect(calls.filter(({ event }) => event.type === 'CAVE_MONSTER_KILLED')).toHaveLength(1);
  });

  it('groups impacts across Ghoul heals but retains each heal and stops at a burst boundary', async () => {
    const live = useGameStore.getState();
    const attacker = { ...live.units.attacker, type: UnitType.GHOUL };
    attacker.stats = { ...attacker.stats, currentHp: attacker.stats.maxHp - 4 };
    useGameStore.setState({ units: { ...live.units, attacker } });
    const heals: GameEvent[] = [
      { type: 'UNIT_HEAL', unitId: 'attacker', position: { x: 1, y: 1 }, amount: 1 },
      { type: 'UNIT_HEAL', unitId: 'attacker', position: { x: 1, y: 1 }, amount: 2 },
    ];
    const { calls } = replay([
      attack('first'), death('first'), heals[0], secondary('PIERCE_DAMAGE', 'second'),
      death('second'), heals[1], secondary('CLEAVE_DAMAGE', 'cleave'), death('cleave'),
      death('qork'), burst('qork'), secondary('CLEAVE_DAMAGE', 'chain'), death('chain'), burst('chain'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + impact);
    const hits = calls.filter(({ event }) => ['PLAYER_ATTACK', 'PIERCE_DAMAGE', 'CLEAVE_DAMAGE'].includes(event.type));
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map(({ time }) => time)).size).toBe(1);
    expect(calls.some(({ event }) => event.type === 'UNIT_HEAL')).toBe(false);
    expect(useGameStore.getState().units.attacker.stats.currentHp).toBe(attacker.stats.currentHp);
    await vi.advanceTimersByTimeAsync(Math.max(
      ANIMATION.HIT_SHAKE_DURATION_MS, ANIMATION.PIERCE_LINE_MS, ANIMATION.CLEAVE_VFX_DURATION_MS,
    ));
    for (const id of ['first', 'second', 'cleave']) {
      expect(useCombatAnimationStore.getState().unitAnimations.get(id)?.type).toBe('DYING');
    }
    expect(useGameStore.getState().units.chain.stats.currentHp).toBeGreaterThan(0);
    await vi.runAllTimersAsync();
    expect(calls.filter(({ event }) => event.type === 'UNIT_HEAL').map(({ event }) => event)).toEqual(heals);
    expect(useGameStore.getState().units.attacker.stats.currentHp).toBe(attacker.stats.currentHp + 3);
    const firstBurst = calls.findIndex(({ event }) => event.type === 'QORK_DEATH_BURST');
    const laterCleave = calls.findIndex(({ event }) => event.type === 'CLEAVE_DAMAGE' && event.unitId === 'chain');
    expect(laterCleave).toBeGreaterThan(firstBurst);
  });

  it.each(['PIERCE_DAMAGE', 'SPLASH_DAMAGE'] as const)(
    'retains standalone %s timing and defers its Qork skull', async (type) => {
      const { animation, vfx, calls } = replay([secondary(type, 'qork'), death('qork'), burst('qork')]);
      const ownHitDelay = type === 'PIERCE_DAMAGE' ? ANIMATION.PIERCE_LINE_MS : 0;
      await vi.advanceTimersByTimeAsync(arrival + ownHitDelay);
      expect(calls.some(({ event }) => event.type === type)).toBe(true);
      expect(animation).toHaveBeenCalledWith('qork', { type: 'HIT' });
      expect(vfx).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(ANIMATION.HIT_SHAKE_DURATION_MS + ANIMATION.POST_ACTION_IDLE_MS);
      expect(animation.mock.calls.filter(([, value]) => value?.type === 'DYING')).toHaveLength(0);
      expect(useGameStore.getState().units.qork).toBeDefined();
      await vi.advanceTimersByTimeAsync(arrival);
      expect(animation).toHaveBeenCalledWith('qork', { type: 'DYING' });
      await vi.runAllTimersAsync();
    },
  );

  it('keeps splash on its separate hit beat after the primary impact', async () => {
    const { calls } = replay([
      attack('first'), death('first'), secondary('SPLASH_DAMAGE', 'qork'), death('qork'), burst('qork'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + impact);
    expect(calls.some(({ event }) => event.type === 'SPLASH_DAMAGE')).toBe(false);
    await vi.advanceTimersByTimeAsync(ANIMATION.HIT_SHAKE_DURATION_MS + dying);
    expect(calls.some(({ event }) => event.type === 'SPLASH_DAMAGE')).toBe(true);
    expect(useCombatAnimationStore.getState().unitAnimations.get('qork')?.type).toBe('HIT');
    await vi.runAllTimersAsync();
  });

  it('defers a tile-damaged Qork without adding an early death camera or wait', async () => {
    const { camera, animation } = replay([damage('qork'), death('qork'), burst('qork')]);
    await vi.advanceTimersByTimeAsync(arrival + ANIMATION.POST_ACTION_IDLE_MS);
    expect(camera).toHaveBeenCalledTimes(2);
    expect(animation).not.toHaveBeenCalled();
    expect(useGameStore.getState().units.qork.stats.currentHp).toBeLessThanOrEqual(0);
    await vi.advanceTimersByTimeAsync(arrival);
    expect(animation).toHaveBeenCalledWith('qork', { type: 'DYING' });
    await vi.runAllTimersAsync();
  });

  it('defers a Qork killed by attack-linked pierce while ordinary targets finish dying', async () => {
    const { calls, animation } = replay([
      attack('first'), death('first'), secondary('PIERCE_DAMAGE', 'qork'), death('qork'), burst('qork'),
    ]);
    await vi.advanceTimersByTimeAsync(arrival + impact);
    expect(calls.filter(({ event }) => event.type === 'PLAYER_ATTACK' || event.type === 'PIERCE_DAMAGE'))
      .toHaveLength(2);
    await vi.advanceTimersByTimeAsync(Math.max(ANIMATION.HIT_SHAKE_DURATION_MS, ANIMATION.PIERCE_LINE_MS) + dying);
    expect(animation.mock.calls.filter(([id, value]) => id === 'qork' && value?.type === 'DYING')).toHaveLength(0);
    expect(useGameStore.getState().units.qork).toBeDefined();
    expect(useGameStore.getState().units.first).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(animation.mock.calls.filter(([id, value]) => id === 'qork' && value?.type === 'DYING')).toHaveLength(1);
  });

  it('defers a knocked-back Qork until its own burst without dropping its slide', async () => {
    const knockback: GameEvent = {
      type: 'UNIT_KNOCKBACK', unitId: 'qork', fromPosition: { x: 2, y: 1 },
      toPosition: { x: 2, y: 2 }, isEnemy: true, faction: Faction.ENEMY,
    };
    const source = burst('qork');
    if (source.type === 'QORK_DEATH_BURST') source.position = { x: 2, y: 2 };
    const { animation } = replay([attack(), knockback, death('qork'), source]);
    await vi.advanceTimersByTimeAsync(arrival + impact + ANIMATION.HIT_SHAKE_DURATION_MS);
    expect(useCombatAnimationStore.getState().unitAnimations.get('qork')?.type).toBe('SLIDE');
    await vi.advanceTimersByTimeAsync(ANIMATION.SLIDE_PAUSE_MS + ANIMATION.SLIDE_DURATION_MS);
    expect(animation.mock.calls.filter(([, value]) => value?.type === 'DYING')).toHaveLength(0);
    expect(useGameStore.getState().units.qork.position).toEqual({ x: 2, y: 2 });
    await vi.runAllTimersAsync();
    expect(animation.mock.calls.filter(([id, value]) => id === 'qork' && value?.type === 'DYING')).toHaveLength(1);
  });

  it('does not match another Qork burst just because its tile matches a death', async () => {
    const other = burst('chain');
    if (other.type === 'QORK_DEATH_BURST') other.position = { x: 2, y: 1 };
    const { vfx } = replay([death('qork'), other]);
    await vi.advanceTimersByTimeAsync(arrival);
    expect(vfx.mock.calls.filter(([value]) => value.variant === 'QORK_DEATH_BURST')).toHaveLength(1);
    expect(useCombatAnimationStore.getState().unitAnimations.get('qork')?.type).toBe('DYING');
    await vi.runAllTimersAsync();
    expect(vfx.mock.calls.filter(([value]) => value.variant === 'QORK_DEATH_BURST')).toHaveLength(2);
  });

  it('starts direct fallback VFX and skull together without applying any burst damage', async () => {
    const hp = useGameStore.getState().units.first.stats.currentHp;
    const { calls, vfx } = replay([death('qork')]);
    await vi.advanceTimersByTimeAsync(arrival);
    expect(vfx.mock.calls.filter(([value]) => value.variant === 'QORK_DEATH_BURST')).toHaveLength(1);
    expect(useCombatAnimationStore.getState().unitAnimations.get('qork')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().slideKillGhosts.has('qork')).toBe(true);
    expect(useGameStore.getState().units.first.stats.currentHp).toBe(hp);
    expect(calls.some(({ event }) => event.type === 'TILE_DAMAGE')).toBe(false);
    await vi.advanceTimersByTimeAsync(burstBeat);
    expect(useCombatAnimationStore.getState().slideKillGhosts.size).toBe(0);
    await vi.runAllTimersAsync();
  });

  it('starts attack fallback VFX at the death beat, not after the skull wait', async () => {
    const { vfx } = replay([attack(), death('qork')]);
    await vi.advanceTimersByTimeAsync(arrival + impact + ANIMATION.HIT_SHAKE_DURATION_MS);
    expect(vfx.mock.calls.filter(([value]) => value.variant === 'QORK_DEATH_BURST')).toHaveLength(1);
    expect(useCombatAnimationStore.getState().unitAnimations.get('qork')?.type).toBe('DYING');
    expect(useCombatAnimationStore.getState().slideKillGhosts.has('qork')).toBe(true);
    await vi.runAllTimersAsync();
  });

  it('runs hidden chained bursts without cameras, animation calls or presentation waits', async () => {
    useGameStore.setState(state(false));
    const floaters = vi.spyOn(useFloaterStore.getState(), 'addFloater');
    const { camera, animation, vfx, calls } = replay([
      death('qork'), burst('qork', ['chain']), damage('chain'), death('chain'), burst('chain'),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(camera).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
    expect(vfx).not.toHaveBeenCalled();
    expect(floaters).not.toHaveBeenCalled();
    expect(useFloaterStore.getState().floaters).toHaveLength(0);
    expect(useGameStore.getState().units.qork).toBeUndefined();
    expect(useGameStore.getState().units.chain).toBeUndefined();
    expect(new Set(calls.map(({ time }) => time)).size).toBe(1);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('applies hidden attack-linked impacts and deaths in order without presentation waits', async () => {
    useGameStore.setState(state(false));
    const floaters = vi.spyOn(useFloaterStore.getState(), 'addFloater');
    const { calls, camera, animation, vfx } = replay([
      attack('first'), death('first'), secondary('PIERCE_DAMAGE', 'second'), death('second'),
      secondary('CLEAVE_DAMAGE', 'qork'), death('qork'),
      secondary('SPLASH_DAMAGE', 'chain'), death('chain'), burst('qork'), burst('chain'),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.slice(0, 3).map(({ event }) => event.type)).toEqual([
      'PLAYER_ATTACK', 'PIERCE_DAMAGE', 'CLEAVE_DAMAGE',
    ]);
    expect(new Set(calls.map(({ time }) => time)).size).toBe(1);
    expect(camera).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
    expect(vfx).not.toHaveBeenCalled();
    expect(floaters).not.toHaveBeenCalled();
    expect(useFloaterStore.getState().floaters).toHaveLength(0);
    expect(useGameStore.getState().units.first).toBeUndefined();
    expect(useGameStore.getState().units.second).toBeUndefined();
    expect(useGameStore.getState().units.qork).toBeUndefined();
    expect(useGameStore.getState().units.chain).toBeUndefined();
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it.each(['PIERCE_DAMAGE', 'CLEAVE_DAMAGE', 'SPLASH_DAMAGE', 'TILE_DAMAGE'] as const)(
    'silently applies hidden standalone %s without floaters or visual waits', async (type) => {
      useGameStore.setState(state(false));
      const floaters = vi.spyOn(useFloaterStore.getState(), 'addFloater');
      const hit = type === 'TILE_DAMAGE' ? damage('qork') : secondary(type, 'qork');
      const { camera, animation, vfx } = replay([hit, death('qork'), burst('qork')]);
      await vi.advanceTimersByTimeAsync(0);
      expect(floaters).not.toHaveBeenCalled();
      expect(useFloaterStore.getState().floaters).toHaveLength(0);
      expect(camera).not.toHaveBeenCalled();
      expect(animation).not.toHaveBeenCalled();
      expect(vfx).not.toHaveBeenCalled();
      expect(useGameStore.getState().units.qork).toBeUndefined();
      expect(useAnimationStore.getState().isAnimating).toBe(false);
    },
  );

  it('silently applies a hidden direct fallback without its VFX or a death wait', async () => {
    useGameStore.setState(state(false));
    const { camera, animation, vfx } = replay([death('qork')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(camera).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
    expect(vfx).not.toHaveBeenCalled();
    expect(useGameStore.getState().units.qork).toBeUndefined();
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it.each(['BUILDING_ATTACK', 'UNIT_ATTACK_BUILDING'] as const)(
    'preserves hidden %s timing while silently deferring its Qork death', async (type) => {
      useGameStore.setState(state(false));
      const floaters = vi.spyOn(useFloaterStore.getState(), 'addFloater');
      const hit: GameEvent = type === 'BUILDING_ATTACK'
        ? {
          type, buildingId: 'tower', defenderId: 'qork', buildingPosition: { x: 0, y: 0 },
          defenderPosition: { x: 2, y: 1 }, buildingHpLost: 0, defenderHpLost: 1000,
        }
        : {
          type, attackerId: 'qork', buildingId: 'tower', attackerPosition: { x: 2, y: 1 },
          buildingPosition: { x: 0, y: 0 }, attackerHpLost: 1000, buildingHpLost: 0,
        };
      const { camera, animation, vfx } = replay([hit, death('qork'), burst('qork')]);
      await vi.advanceTimersByTimeAsync(0);
      expect(floaters).not.toHaveBeenCalled();
      expect(camera).not.toHaveBeenCalled();
      expect(animation).not.toHaveBeenCalled();
      expect(vfx).not.toHaveBeenCalled();
      expect(useGameStore.getState().units.qork).toBeUndefined();
      expect(useAnimationStore.getState().isAnimating).toBe(false);
    },
  );

  it('reaches a lava Qork burst but never starts its DYING animation', async () => {
    useGameStore.setState({ lavaFrontRow: 2 });
    const { animation, vfx } = replay([
      { type: 'LAVA_ADVANCE', newLavaRow: 1, destroyedUnitIds: ['qork'], destroyedBuildingIds: [] },
      death('qork'), burst('qork'),
    ]);
    await vi.runAllTimersAsync();
    expect(animation.mock.calls.filter(([id, value]) => id === 'qork' && value?.type === 'DYING')).toHaveLength(0);
    expect(vfx.mock.calls.filter(([value]) => value.variant === 'QORK_DEATH_BURST')).toHaveLength(1);
    expect(useGameStore.getState().units.qork).toBeUndefined();
  });
});
