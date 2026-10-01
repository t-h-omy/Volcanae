import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAVE_SPECIALIST_ROB_REWARD_CRYSTALS } from '../../config/specialists';
import { useGameStore } from '../gameStore';
import { useSpecialistHireStore, type CaveSpecialistRewardOutcome } from '../specialistHireStore';
import { createInitialSpecialists } from '../specialistSystem';
import { applyCaveSpecialistReward, buildCaveSpecialistExclusionSet } from '../useAnimationEngine';
import { BuildingType } from '../types';
import type { Building } from '../types';

beforeEach(() => {
  useGameStore.setState({
    arcaneCrystals: 7,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    buildings: {},
    units: {},
  });
  useSpecialistHireStore.setState({
    mode: null, specialistId: null, onResolve: null, onCloseExhausted: null,
  });
});

describe('cave reward resolution', () => {
  it('allows hire or rob with a free slot, with no dismissal outcome', () => {
    const rewards: CaveSpecialistRewardOutcome[] = [];
    const store = useSpecialistHireStore.getState();
    store.showHire('spec_01', (outcome) => rewards.push(outcome));
    store.resolveReward({ type: 'hire' });
    expect(rewards).toEqual([{ type: 'hire' }]);
    expect(useSpecialistHireStore.getState().mode).toBeNull();

    store.showHire('spec_01', (outcome) => rewards.push(outcome));
    store.resolveReward({ type: 'rob' });
    expect(rewards).toEqual([{ type: 'hire' }, { type: 'rob' }]);
    expect(useSpecialistHireStore.getState().mode).toBeNull();
  });

  it('allows swapping a named outgoing specialist or robbing without one when full', () => {
    const rewards: CaveSpecialistRewardOutcome[] = [];
    const store = useSpecialistHireStore.getState();
    store.showSwap('spec_03', (outcome) => rewards.push(outcome));
    store.resolveReward({ type: 'swap', outgoingId: 'spec_01' });
    expect(rewards).toEqual([{ type: 'swap', outgoingId: 'spec_01' }]);

    store.showSwap('spec_03', (outcome) => rewards.push(outcome));
    store.resolveReward({ type: 'rob' });
    expect(rewards[1]).toEqual({ type: 'rob' });
    expect(rewards[1]).not.toHaveProperty('outgoingId');
  });

  it('rejects mismatched reward outcomes and has no no-reward dismissal path', () => {
    const onResolve = vi.fn();
    const store = useSpecialistHireStore.getState();
    store.showHire('spec_01', onResolve);
    store.closeExhausted();
    store.resolveReward({ type: 'swap', outgoingId: 'spec_02' });
    expect(useSpecialistHireStore.getState().mode).toBe('hire');
    expect(onResolve).not.toHaveBeenCalled();
    store.resolveReward({ type: 'rob' });
    store.resolveReward({ type: 'rob' });
    expect(onResolve).toHaveBeenCalledOnce();
  });

  it('closes an exhausted pool independently, without a reward', () => {
    const onClose = vi.fn();
    const store = useSpecialistHireStore.getState();
    store.showExhausted(onClose);
    store.resolveReward({ type: 'rob' });
    expect(onClose).not.toHaveBeenCalled();
    expect(useSpecialistHireStore.getState().mode).toBe('exhausted');
    store.closeExhausted();
    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameStore.getState().arcaneCrystals).toBe(7);
    expect(useGameStore.getState().globalSpecialistStorage).toEqual([]);
  });
});

describe('cave reward mutation', () => {
  it('grants exactly the configured crystals without modifying specialists, effects or slots', () => {
    const before = useGameStore.getState();
    const specialists = before.specialists;
    before.grantCaveSpecialistRobReward();
    const after = useGameStore.getState();
    expect(after.arcaneCrystals).toBe(7 + CAVE_SPECIALIST_ROB_REWARD_CRYSTALS);
    expect(after.globalSpecialistStorage).toEqual([]);
    expect(after.specialists).toBe(specialists);
    expect(after.fortifiedGarrisonActive).toBe(false);
    expect(after.specialistSlotCap).toBe(2);
    expect(after.buildings).toEqual({});
  });

  it('hires the drawn specialist and applies its effects, without crystals', () => {
    applyCaveSpecialistReward('spec_01', { type: 'hire' });
    expect(useGameStore.getState().globalSpecialistStorage).toEqual(['spec_01']);
    expect(useGameStore.getState().fortifiedGarrisonActive).toBe(true);
    expect(useGameStore.getState().arcaneCrystals).toBe(7);
  });

  it('replaces the selected outgoing specialist and revokes its effects', () => {
    useGameStore.getState().hireSpecialist('spec_01');
    useGameStore.getState().hireSpecialist('spec_02');
    applyCaveSpecialistReward('spec_03', { type: 'swap', outgoingId: 'spec_01' });
    expect(useGameStore.getState().globalSpecialistStorage).toEqual(['spec_03', 'spec_02']);
    expect(useGameStore.getState().fortifiedGarrisonActive).toBe(false);
    expect(useGameStore.getState().arcaneCrystals).toBe(7);
  });

  it('robs without recruiting or applying effects in either slot state', () => {
    applyCaveSpecialistReward('spec_01', { type: 'rob' });
    expect(useGameStore.getState().globalSpecialistStorage).toEqual([]);
    expect(useGameStore.getState().fortifiedGarrisonActive).toBe(false);
    useGameStore.getState().hireSpecialist('spec_02');
    useGameStore.getState().hireSpecialist('spec_03');
    applyCaveSpecialistReward('spec_01', { type: 'rob' });
    expect(useGameStore.getState().globalSpecialistStorage).toEqual(['spec_02', 'spec_03']);
    expect(useGameStore.getState().fortifiedGarrisonActive).toBe(false);
    expect(useGameStore.getState().arcaneCrystals).toBe(7 + 2 * CAVE_SPECIALIST_ROB_REWARD_CRYSTALS);
  });

  it('does not exclude a robbed specialist, but still excludes owned and Market-offered specialists', () => {
    applyCaveSpecialistReward('spec_01', { type: 'rob' });
    useGameStore.setState({
      globalSpecialistStorage: ['spec_02'],
      buildings: {
        market: { type: BuildingType.MARKET, marketSpecialistSlots: ['spec_03', null] } as Building,
      },
    });
    const excluded = buildCaveSpecialistExclusionSet(useGameStore.getState());
    expect(excluded.has('spec_01')).toBe(false);
    expect(excluded.has('spec_02')).toBe(true);
    expect(excluded.has('spec_03')).toBe(true);
  });
});
