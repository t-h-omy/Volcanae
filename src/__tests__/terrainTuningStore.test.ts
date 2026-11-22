import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TERRAIN_LOOK, TERRAIN_TUNING_SCHEMA } from '../../config/terrain';
import { getTerrainLook } from '../terrain/terrainLook';
import { useTerrainTuningStore } from '../terrain/terrainTuningStore';

function flattenNumeric(value: unknown, path = ''): string[] {
  if (typeof value === 'number') return [path];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenNumeric(child, path ? `${path}.${key}` : key),
  );
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe('terrain tuning store', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    useTerrainTuningStore.getState().resetAll();
    useTerrainTuningStore.getState().closePanel();
    storage.clear();
  });

  it('covers every numeric look leaf exactly once', () => {
    const schemaPaths = TERRAIN_TUNING_SCHEMA.flatMap((group) =>
      group.params.map(([key]) => `${group.path}.${key}`),
    );
    const lookPaths = flattenNumeric(TERRAIN_LOOK);

    expect(new Set(schemaPaths).size).toBe(schemaPaths.length);
    expect([...schemaPaths].sort()).toEqual([...lookPaths].sort());
  });

  it('clamps a value and leaves all other look values at the config defaults', () => {
    useTerrainTuningStore.getState().setValue('terrain.plains', 'blend', 10);
    const look = getTerrainLook();

    expect(look.terrain.plains.blend).toBe(0.4);
    expect(look.terrain.plains.noise).toBe(TERRAIN_LOOK.terrain.plains.noise);
    expect(look.status.frozen).toEqual(TERRAIN_LOOK.status.frozen);
    expect(look.objects).toEqual(TERRAIN_LOOK.objects);
  });

  it('imports valid top-level prototype groups and ignores unknown or invalid values', () => {
    const count = useTerrainTuningStore.getState().importValues({
      source: 'volcanae-terrain-tuning',
      version: 1,
      terrain: { plains: { blend: -1, noise: 0.1, unknown: 0.5 }, unknown: { blend: 0.2 } },
      status: { frozen: { glare: 0.25, cracks: 'invalid' } },
      objects: { burning: 0.75, unknown: 0.5 },
    });

    expect(count).toBe(4);
    expect(getTerrainLook().terrain.plains.blend).toBe(0);
    expect(getTerrainLook().terrain.plains.noise).toBe(0.1);
    expect(getTerrainLook().status.frozen.glare).toBe(0.25);
    expect(getTerrainLook().objects.burning).toBe(0.75);
  });

  it('resets one group independently and resetAll restores the config object', () => {
    const store = useTerrainTuningStore.getState();
    store.setValue('terrain.plains', 'blend', 0.1);
    store.setValue('status.frozen', 'glare', 0.2);
    store.resetGroup('terrain.plains');

    expect(getTerrainLook().terrain.plains).toEqual(TERRAIN_LOOK.terrain.plains);
    expect(getTerrainLook().status.frozen.glare).toBe(0.2);
    useTerrainTuningStore.getState().resetAll();
    expect(getTerrainLook()).toBe(TERRAIN_LOOK);
  });

  it('persists and reapplies the exported JSON values', () => {
    useTerrainTuningStore.getState().setValue('terrain.water', 'waves', 0.15);
    const saved = storage.getItem('volcanae_terrain_tuning');
    expect(saved).not.toBeNull();

    const parsed: unknown = JSON.parse(saved ?? '{}');
    useTerrainTuningStore.getState().resetAll();
    expect(useTerrainTuningStore.getState().importValues(parsed)).toBeGreaterThan(0);
    expect(getTerrainLook().terrain.water.waves).toBe(0.15);
    expect(useTerrainTuningStore.getState().exportValues()).toMatchObject({
      source: 'volcanae-terrain-tuning',
      version: 1,
      terrain: getTerrainLook().terrain,
      status: getTerrainLook().status,
      objects: getTerrainLook().objects,
    });
  });
});
