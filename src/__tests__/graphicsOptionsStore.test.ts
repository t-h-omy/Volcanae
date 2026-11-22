import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
  };
})();

async function loadStore() {
  vi.resetModules();
  return import('../graphicsOptionsStore');
}

describe('graphicsOptionsStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage);
    memoryStorage.clear();
  });

  it('uses the display defaults', async () => {
    const { useGraphicsOptionsStore } = await loadStore();
    const state = useGraphicsOptionsStore.getState();

    expect(state.quality).toBe('HIGH');
    expect(state.reduceMotion).toBeNull();
    expect(state.gridLines).toBe('FINE');
  });

  it('persists and restores option changes', async () => {
    const store = await loadStore();
    store.useGraphicsOptionsStore.getState().setQuality('SAVER');
    store.useGraphicsOptionsStore.getState().setReduceMotion(true);
    store.useGraphicsOptionsStore.getState().setGridLines('BOLD');

    const restored = await loadStore();
    expect(restored.useGraphicsOptionsStore.getState()).toMatchObject({
      quality: 'SAVER',
      reduceMotion: true,
      gridLines: 'BOLD',
    });
  });

  it('falls back to defaults for invalid stored values', async () => {
    memoryStorage.setItem('volcanae_graphics_options', JSON.stringify({
      quality: 'ULTRA',
      reduceMotion: 'yes',
      gridLines: 'THICK',
    }));
    const { useGraphicsOptionsStore } = await loadStore();

    expect(useGraphicsOptionsStore.getState()).toMatchObject({
      quality: 'HIGH',
      reduceMotion: null,
      gridLines: 'FINE',
    });
  });

  it('prefers the stored reduce-motion value over the system setting', async () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { isReducedMotion, useGraphicsOptionsStore } = await loadStore();

    useGraphicsOptionsStore.getState().setReduceMotion(false);
    expect(isReducedMotion()).toBe(false);
    useGraphicsOptionsStore.getState().setReduceMotion(null);
    expect(isReducedMotion()).toBe(true);
  });
});
