import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { useGameStore } from '../gameStore';
import { useMenuStore } from '../menuStore';
import { Difficulty, GamePhase } from '../types';

describe('repro new game black', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    useMenuStore.setState({ screen: 'MENU', panel: 'NEW', navDir: 'forward', activeSaveId: null });
  });

  it('newGameInSlot keeps game state stable', async () => {
    await useGameStore.getState().newGameInSlot('Test', Difficulty.STANDARD);
    expect(useMenuStore.getState().screen).toBe('GAME');
    expect(useGameStore.getState().phase).toBe(GamePhase.PLAYER_TURN);

    await new Promise((r) => setTimeout(r, 1000));
    expect(useMenuStore.getState().screen).toBe('GAME');
    expect(useGameStore.getState().phase).toBe(GamePhase.PLAYER_TURN);
  });
});
