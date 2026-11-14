import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { generateInitialGameState } from '../mapGenerator';
import {
  getNextDefaultSlotName,
  importSlotFromFile,
  isSlotCompatible,
  loadSlot,
  openSaveDb,
  saveSlotStrict,
  SAVE_VERSION,
} from '../saveSystem';
import { SAVE } from '../gameConfig';
import { useLocaleStore } from '../i18n/localeStore';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('getNextDefaultSlotName', () => {
  it('starts at Campaign 1 when no saves exist', () => {
    expect(getNextDefaultSlotName([])).toBe('Campaign 1');
  });

  describe('save version 24 compatibility', () => {
    it('rejects version 23 loads and imports while marking version 24 compatible', async () => {
      const state = generateInitialGameState();
      const db = await openSaveDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SAVE.STORE_DATA, 'readwrite');
        tx.objectStore(SAVE.STORE_DATA).put({ id: 'old', version: 23, state });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();

      expect(SAVE_VERSION).toBe(25);
      expect(isSlotCompatible({ id: 'old', name: 'Old', version: 23, savedAt: 0, turn: 1, difficulty: 'STANDARD' })).toBe(false);
      expect(isSlotCompatible({ id: 'new', name: 'New', version: 24, savedAt: 0, turn: 1, difficulty: 'STANDARD' })).toBe(true);
      expect(await loadSlot('old')).toBeNull();

      const oldPayload = new Blob([JSON.stringify({ version: 23, state })], { type: 'application/json' });
      expect(await importSlotFromFile(Object.assign(oldPayload, { name: 'old.json' }) as File)).toBeNull();
    });

    it('round-trips a version 24 state', async () => {
      const state = { ...generateInitialGameState(), turn: 24 };
      await saveSlotStrict({ id: 'current', name: 'Current', state });
      expect((await loadSlot('current'))?.turn).toBe(24);
    });
  });

  it('uses the localized prefix when finding the next slot name', async () => {
    try {
      await useLocaleStore.getState().setLocale('de');
      expect(getNextDefaultSlotName([])).toBe('Kampagne 1');
      expect(getNextDefaultSlotName([{ name: 'Kampagne 1' }])).toBe('Kampagne 2');
    } finally {
      await useLocaleStore.getState().setLocale('en');
    }
  });

  it('fills the lowest missing campaign number', () => {
    expect(getNextDefaultSlotName([
      { name: 'Campaign 1' },
      { name: 'Campaign 3' },
      { name: 'Campaign 4' },
    ])).toBe('Campaign 2');
  });

  it('ignores non-default slot names', () => {
    expect(getNextDefaultSlotName([
      { name: 'Ironman Run' },
      { name: 'Campaign 2' },
    ])).toBe('Campaign 1');
  });
});
