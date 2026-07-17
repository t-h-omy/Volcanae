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
import { ALL_HINT_IDS } from '../hintConfig';
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

  it('round-trips seenHints intact for a fresh state', async () => {
    const base = generateInitialGameState();
    const state: GameState = { ...base, seenHints: ['H01_BUILD_WOODCUTTER', 'H05_ATTACK_ENDS_TURN'] };
    await saveSlot({ id: 'slot_c', name: 'Test', state });
    const loaded = await loadSlot('slot_c');
    expect(loaded).not.toBeNull();
    expect(loaded?.seenHints).toEqual(['H01_BUILD_WOODCUTTER', 'H05_ATTACK_ENDS_TURN']);
  });

  it('migrates a v15 save to have all hints marked seen', async () => {
    // Simulate a version-15 save by writing raw state via IDB and then loading
    // through loadSlot (which runs migrateState).
    const base = generateInitialGameState();
    // Remove seenHints to simulate a pre-v16 save that doesn't have the field.
    const stateWithoutHints = { ...base } as unknown as Record<string, unknown>;
    delete stateWithoutHints.seenHints;

    // Write the raw IDB record with version 15.
    const idb = globalThis.indexedDB;
    const dbReq = idb.open('volcanae', 1);
    await new Promise<void>((resolve, reject) => {
      dbReq.onupgradeneeded = () => {
        const db = dbReq.result;
        if (!db.objectStoreNames.contains('saveMeta')) db.createObjectStore('saveMeta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('saveData')) db.createObjectStore('saveData', { keyPath: 'id' });
      };
      dbReq.onsuccess = () => resolve();
      dbReq.onerror = () => reject(dbReq.error);
    });
    const db = dbReq.result;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['saveMeta', 'saveData'], 'readwrite');
      tx.objectStore('saveMeta').put({ id: 'slot_v15', version: 15, turn: 1, savedAt: Date.now(), name: 'OldGame', difficulty: 'STANDARD' });
      tx.objectStore('saveData').put({ id: 'slot_v15', version: 15, state: stateWithoutHints });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const loaded = await loadSlot('slot_v15');
    expect(loaded).not.toBeNull();
    expect(Array.isArray(loaded?.seenHints)).toBe(true);
    // All hint IDs must be present so hints never fire on migrated saves.
    for (const id of ALL_HINT_IDS) {
      expect(loaded?.seenHints).toContain(id);
    }
  });
});
