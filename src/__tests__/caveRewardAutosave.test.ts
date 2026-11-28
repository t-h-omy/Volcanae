import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { useGameStore } from '../gameStore';
import { useMenuStore } from '../menuStore';
import { loadSlot } from '../saveSystem';
import { finishQueueResolution, applyCaveSpecialistReward } from '../useAnimationEngine';
import type { CaveRewardRecord } from '../useAnimationEngine';
import { CAVE_SPECIALIST_ROB_REWARD_CRYSTALS, SPECIALIST_DEFINITIONS } from '../../config/specialists';
import { Difficulty, Faction, GamePhase } from '../types';
import type { GameState } from '../types';

const SPECIALIST_IDS = Object.keys(SPECIALIST_DEFINITIONS);

function snapshot(): GameState {
  return structuredClone(Object.fromEntries(
    Object.entries(useGameStore.getState()).filter(([, value]) => typeof value !== 'function'),
  )) as GameState;
}

function activeSaveId(): string {
  const id = useMenuStore.getState().activeSaveId;
  if (!id) throw new Error('no active save');
  return id;
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

describe('queue-end autosave', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    useMenuStore.setState({ screen: 'MENU', panel: 'NEW', navDir: 'forward', activeSaveId: null });
    await useGameStore.getState().newGameInSlot('Test', Difficulty.STANDARD);
    useGameStore.setState({ globalSpecialistStorage: [], specialistSlotCap: 2 });
    await settle();
  });

  it('saves a hired cave reward specialist', async () => {
    const resolvedState = snapshot();
    const hire: CaveRewardRecord = { drawn: SPECIALIST_IDS[0], outcome: { type: 'hire' } };
    applyCaveSpecialistReward(hire.drawn, hire.outcome);
    finishQueueResolution(resolvedState, [hire]);
    expect(useGameStore.getState().globalSpecialistStorage).toEqual([hire.drawn]);
    const id = activeSaveId();
    await vi.waitFor(async () => {
      const saved = await loadSlot(id);
      expect(saved?.globalSpecialistStorage).toEqual([hire.drawn]);
    });
  });

  it('saves a replacement and a single rob reward', async () => {
    const [first, second, incoming] = SPECIALIST_IDS;
    useGameStore.getState().hireSpecialist(first);
    useGameStore.getState().hireSpecialist(second);
    const crystalsBefore = useGameStore.getState().arcaneCrystals;
    const resolvedState = snapshot();
    const swap: CaveRewardRecord = { drawn: incoming, outcome: { type: 'swap', outgoingId: first } };
    const rob: CaveRewardRecord = { drawn: SPECIALIST_IDS[3], outcome: { type: 'rob' } };
    applyCaveSpecialistReward(swap.drawn, swap.outcome);
    applyCaveSpecialistReward(rob.drawn, rob.outcome);
    finishQueueResolution(resolvedState, [swap, rob]);
    const id = activeSaveId();
    await vi.waitFor(async () => {
      const saved = await loadSlot(id);
      expect(saved?.globalSpecialistStorage).toEqual([incoming, second]);
      expect(saved?.arcaneCrystals).toBe(crystalsBefore + CAVE_SPECIALIST_ROB_REWARD_CRYSTALS);
    });
  });

  it('saves finalized Brandmark transforms', async () => {
    const unit = Object.values(useGameStore.getState().units).find((u) => u.faction === Faction.PLAYER);
    if (!unit) throw new Error('no player unit');
    const resolvedState = snapshot();
    resolvedState.pendingBrandmarkTransforms = [{ unitId: unit.id, position: { ...unit.position } }];
    finishQueueResolution(resolvedState, []);
    const id = activeSaveId();
    await vi.waitFor(async () => {
      const saved = await loadSlot(id);
      expect(saved?.pendingBrandmarkTransforms).toEqual([]);
      expect(saved?.units[unit.id]).toBeUndefined();
    });
  });

  it('does not autosave outside the saved phases', async () => {
    const id = activeSaveId();
    const previousTurn = (await loadSlot(id))?.turn;
    const resolvedState = snapshot();
    resolvedState.phase = GamePhase.ENEMY_TURN;
    resolvedState.turn = (previousTurn ?? 0) + 7;
    finishQueueResolution(resolvedState, []);
    await settle();
    expect((await loadSlot(id))?.turn).toBe(previousTurn);
  });

  it('autosaves on a default setGameState call', async () => {
    const id = activeSaveId();
    const previousTurn = (await loadSlot(id))?.turn ?? 0;
    const state = snapshot();
    state.turn = previousTurn + 3;
    useGameStore.getState().setGameState(state);
    await vi.waitFor(async () => {
      expect((await loadSlot(id))?.turn).toBe(previousTurn + 3);
    });
  });

  it('does not hire with a null resolved state', () => {
    const hire: CaveRewardRecord = { drawn: SPECIALIST_IDS[0], outcome: { type: 'hire' } };
    expect(() => finishQueueResolution(null, [hire])).not.toThrow();
    expect(useGameStore.getState().globalSpecialistStorage).toEqual([]);
  });
});
