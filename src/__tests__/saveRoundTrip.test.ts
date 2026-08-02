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
import { saveSlot, saveSlotStrict, loadSlot, listSlots, saveSeenHintsForSlot } from '../saveSystem';
import { ALL_HINT_IDS } from '../hintConfig';
import { BuildingType, DestroyBehavior, UnitTag } from '../types';
import { ABILITIES, MARKET } from '../gameConfig';
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

  it('can patch seenHints without overwriting the rest of the saved state', async () => {
    const state: GameState = { ...generateInitialGameState(), turn: 9, seenHints: [] };
    await saveSlot({ id: 'slot_seen', name: 'Hints', state });
    await saveSeenHintsForSlot('slot_seen', ['H10_HOMELESS']);

    const loaded = await loadSlot('slot_seen');
    expect(loaded).not.toBeNull();
    expect(loaded?.turn).toBe(9);
    expect(loaded?.seenHints).toEqual(['H10_HOMELESS']);
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

  it('migrates v17 unrevealed filled market to hidden offers + uninitialized flag', async () => {
    const state = generateInitialGameState() as GameState;
    const marketId = 'm_v17_hidden';
    state.buildings[marketId] = {
      id: marketId,
      type: BuildingType.MARKET,
      faction: null,
      position: { x: 0, y: 0 },
      hp: MARKET.MAX_HP,
      maxHp: MARKET.MAX_HP,
      specialistSlot: null,
      isDisabledForTurns: 0,
      wasAttackedLastEnemyTurn: false,
      captureProgress: 0,
      isBeingCapturedBy: null,
      lavaBoostEnabled: false,
      discoverRadius: 2,
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
      marketResourceSlots: [{ give: { currency: 'WOOD', amount: 2 }, gain: { currency: 'IRON', amount: 1 } }],
      marketSpecialistSlots: ['spec_01'],
      marketRefillCountdown: MARKET.AUTO_REFILL_INTERVAL,
    };
    state.grid[0][0].buildingId = marketId;
    state.grid[0][0].isRevealed = false;

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
      tx.objectStore('saveMeta').put({ id: 'slot_v17_hidden_market', version: 17, turn: 1, savedAt: Date.now(), name: 'OldGame', difficulty: 'STANDARD' });
      tx.objectStore('saveData').put({ id: 'slot_v17_hidden_market', version: 17, state });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const loaded = await loadSlot('slot_v17_hidden_market');
    expect(loaded).not.toBeNull();
    const migrated = loaded!.buildings[marketId];
    expect(migrated.marketOffersInitialized).toBe(false);
    expect(migrated.marketResourceSlots?.every((s) => s === null)).toBe(true);
    expect(migrated.marketSpecialistSlots?.every((s) => s === null)).toBe(true);
  });

  it('migrates v17 revealed filled market to initialized while preserving offers', async () => {
    const state = generateInitialGameState() as GameState;
    const marketId = 'm_v17_revealed';
    const originalResourceOffer = { give: { currency: 'WOOD' as const, amount: 2 }, gain: { currency: 'IRON' as const, amount: 1 } };
    state.buildings[marketId] = {
      id: marketId,
      type: BuildingType.MARKET,
      faction: null,
      position: { x: 1, y: 0 },
      hp: MARKET.MAX_HP,
      maxHp: MARKET.MAX_HP,
      specialistSlot: null,
      isDisabledForTurns: 0,
      wasAttackedLastEnemyTurn: false,
      captureProgress: 0,
      isBeingCapturedBy: null,
      lavaBoostEnabled: false,
      discoverRadius: 2,
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
      marketResourceSlots: [originalResourceOffer],
      marketSpecialistSlots: ['spec_02'],
      marketRefillCountdown: MARKET.AUTO_REFILL_INTERVAL,
    };
    state.grid[0][1].buildingId = marketId;
    state.grid[0][1].isRevealed = true;

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
      tx.objectStore('saveMeta').put({ id: 'slot_v17_revealed_market', version: 17, turn: 1, savedAt: Date.now(), name: 'OldGame', difficulty: 'STANDARD' });
      tx.objectStore('saveData').put({ id: 'slot_v17_revealed_market', version: 17, state });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const loaded = await loadSlot('slot_v17_revealed_market');
    expect(loaded).not.toBeNull();
    const migrated = loaded!.buildings[marketId];
    expect(migrated.marketOffersInitialized).toBe(true);
    expect(migrated.marketResourceSlots?.[0]).toEqual(originalResourceOffer);
    expect(migrated.marketSpecialistSlots?.[0]).toBe('spec_02');
  });

  it('migrates v18 save to backfill pendingTrapSetterId as null', async () => {
    const state = generateInitialGameState() as GameState & Record<string, unknown>;
    // Simulate a v18 save that doesn't yet have pendingTrapSetterId
    delete (state as Record<string, unknown>)['pendingTrapSetterId'];

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
      tx.objectStore('saveMeta').put({ id: 'slot_v18_trap', version: 18, turn: 1, savedAt: Date.now(), name: 'OldGame', difficulty: 'STANDARD' });
      tx.objectStore('saveData').put({ id: 'slot_v18_trap', version: 18, state });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const loaded = await loadSlot('slot_v18_trap');
    expect(loaded).not.toBeNull();
    expect(loaded!.pendingTrapSetterId).toBeNull();
  });

  it('migrates v18 save to backfill berserkActivated from current HP ratio', async () => {
    const state = generateInitialGameState() as GameState & Record<string, unknown>;
    const unitId = Object.keys(state.units)[0];
    if (!unitId) throw new Error('Expected at least one unit in initial state');
    const unit = state.units[unitId];
    unit.tags = [...unit.tags, UnitTag.BERSERK];
    const thresholdHp = unit.stats.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100;
    unit.stats.currentHp = thresholdHp - 1;
    delete (unit as unknown as Record<string, unknown>).berserkActivated;

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
      tx.objectStore('saveMeta').put({ id: 'slot_v18_berserk', version: 18, turn: 1, savedAt: Date.now(), name: 'OldGame', difficulty: 'STANDARD' });
      tx.objectStore('saveData').put({ id: 'slot_v18_berserk', version: 18, state });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const loaded = await loadSlot('slot_v18_berserk');
    expect(loaded).not.toBeNull();
    const loadedUnit = loaded!.units[unitId];
    expect(loadedUnit.berserkActivated).toBe(true);
  });
});
