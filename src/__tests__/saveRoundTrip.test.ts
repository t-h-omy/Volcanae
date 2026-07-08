/**
 * Regression tests for the multi-slot save round-trip.
 *
 * Guards against the "Continue starts a new game" bug: the live Zustand store
 * mixes action *functions* into the same object as the serializable GameState
 * fields.  Autosave snapshots (taken via immer's current()/produce()) therefore
 * carried those functions, and IndexedDB's structured-clone threw a
 * DataCloneError on the heavy `saveData` write while the `saveMeta` write still
 * committed — so a slot's metadata advanced each turn but its full state stayed
 * frozen at the last cloneable save.  Loading it later resurfaced stale state.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { generateInitialGameState } from '../mapGenerator';
import { saveSlot, saveSlotStrict, loadSlot, listSlots } from '../saveSystem';
import type { GameState } from '../types';

beforeEach(() => {
  // Fresh in-memory IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
});

describe('saveSlot round-trip', () => {
  it('persists the full state even when the object carries action functions', async () => {
    // Simulate a live-store snapshot: a GameState with action methods mixed in,
    // exactly what the autosave paths pass in.
    const base = generateInitialGameState();
    const laterTurn = { ...base, turn: 50 } as GameState & Record<string, unknown>;
    laterTurn.moveUnit = () => {};
    laterTurn.endPlayerTurn = () => {};
    laterTurn.newGameInSlot = async () => {};

    await saveSlotStrict({ id: 'slot_a', name: 'Campaign 1', state: laterTurn as GameState });

    const slots = await listSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0].turn).toBe(50);

    const loaded = await loadSlot('slot_a');
    expect(loaded).not.toBeNull();
    // The heavy state record must reflect the latest turn, not a stale save.
    expect(loaded?.turn).toBe(50);
    // Functions must not survive into the persisted state.
    expect(typeof (loaded as unknown as Record<string, unknown>).moveUnit).not.toBe('function');
  });

  it('overwrites the previous state record when saving the same slot again', async () => {
    const s1 = { ...generateInitialGameState(), turn: 1 } as GameState;
    const s2 = { ...generateInitialGameState(), turn: 7 } as GameState & Record<string, unknown>;
    s2.selectUnit = () => {};

    await saveSlot({ id: 'slot_b', name: 'Campaign 1', state: s1 });
    await saveSlot({ id: 'slot_b', name: 'Campaign 1', state: s2 as GameState });

    const loaded = await loadSlot('slot_b');
    expect(loaded?.turn).toBe(7);
  });
});
