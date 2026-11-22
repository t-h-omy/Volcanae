import { create } from 'zustand';
import {
  TERRAIN_LOOK,
  TERRAIN_TUNING_SCHEMA,
  type TerrainLook,
} from '../../config/terrain';

const STORAGE_KEY = 'volcanae_terrain_tuning';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends number ? number : Mutable<T[K]>;
};

type TerrainTuningExport = {
  source: 'volcanae-terrain-tuning';
  version: 1;
  terrain: TerrainLook['terrain'];
  status: TerrainLook['status'];
  objects: TerrainLook['objects'];
};

interface TerrainTuningState {
  overrides: TerrainLook | null;
  panelOpen: boolean;
  revision: number;
  setValue: (path: string, key: string, value: number) => void;
  resetGroup: (path: string) => void;
  resetAll: () => void;
  importValues: (json: unknown) => number;
  exportValues: () => TerrainTuningExport;
  openPanel: () => void;
  closePanel: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOwnValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function cloneLook(look: TerrainLook): Mutable<TerrainLook> {
  return JSON.parse(JSON.stringify(look)) as Mutable<TerrainLook>;
}

function findGroup(path: string) {
  return TERRAIN_TUNING_SCHEMA.find((group) => group.path === path);
}

function readPath(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = getOwnValue(current, part);
  }
  return current;
}

function writeValue(look: Mutable<TerrainLook>, path: string, key: string, value: number): void {
  const group = readPath(look as unknown as Record<string, unknown>, path);
  if (isRecord(group)) {
    (group as Record<string, unknown>)[key] = value;
  }
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyValues(target: Mutable<TerrainLook>, json: unknown): number {
  if (!isRecord(json)) return 0;
  let count = 0;
  for (const group of TERRAIN_TUNING_SCHEMA) {
    const values = readPath(json, group.path);
    if (!isRecord(values)) continue;
    for (const [key, , min, max] of group.params) {
      const value = getOwnValue(values, key);
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      writeValue(target, group.path, key, clampToRange(value, min, max));
      count += 1;
    }
  }
  return count;
}

function matchesConfig(look: TerrainLook): boolean {
  return TERRAIN_TUNING_SCHEMA.every((group) =>
    group.params.every(([key]) => readPath(look as unknown as Record<string, unknown>, `${group.path}.${key}`)
      === readPath(TERRAIN_LOOK as unknown as Record<string, unknown>, `${group.path}.${key}`)),
  );
}

function sameLook(left: TerrainLook, right: TerrainLook): boolean {
  return TERRAIN_TUNING_SCHEMA.every((group) =>
    group.params.every(([key]) =>
      readPath(left as unknown as Record<string, unknown>, `${group.path}.${key}`)
        === readPath(right as unknown as Record<string, unknown>, `${group.path}.${key}`),
    ),
  );
}

function loadOverrides(): TerrainLook | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const values: unknown = JSON.parse(raw);
    const look = cloneLook(TERRAIN_LOOK);
    return applyValues(look, values) > 0 && !matchesConfig(look) ? look : null;
  } catch {
    return null;
  }
}

function saveOverrides(overrides: TerrainLook | null): void {
  try {
    if (overrides) localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const initialOverrides = loadOverrides();

export const useTerrainTuningStore = create<TerrainTuningState>()((set, get) => ({
  overrides: initialOverrides,
  panelOpen: false,
  revision: 0,
  setValue: (path, key, value) => {
    const group = findGroup(path);
    const param = group?.params.find(([paramKey]) => paramKey === key);
    if (!param || !Number.isFinite(value)) return;
    const [, , min, max] = param;
    const clamped = clampToRange(value, min, max);
    set((state) => {
      const look = cloneLook(state.overrides ?? TERRAIN_LOOK);
      if (readPath(look as unknown as Record<string, unknown>, `${path}.${key}`) === clamped) return state;
      writeValue(look, path, key, clamped);
      const overrides = matchesConfig(look) ? null : look;
      saveOverrides(overrides);
      return { overrides, revision: state.revision + 1 };
    });
  },
  resetGroup: (path) => {
    const group = findGroup(path);
    if (!group) return;
    set((state) => {
      if (!state.overrides) return state;
      const look = cloneLook(state.overrides);
      for (const [key] of group.params) {
        writeValue(look, path, key, readPath(TERRAIN_LOOK as unknown as Record<string, unknown>, `${path}.${key}`) as number);
      }
      if (group.params.every(([key]) =>
        readPath(state.overrides as unknown as Record<string, unknown>, `${path}.${key}`)
          === readPath(TERRAIN_LOOK as unknown as Record<string, unknown>, `${path}.${key}`),
      )) return state;
      const overrides = matchesConfig(look) ? null : look;
      saveOverrides(overrides);
      return { overrides, revision: state.revision + 1 };
    });
  },
  resetAll: () => {
    set((state) => {
      if (!state.overrides) return state;
      saveOverrides(null);
      return { overrides: null, revision: state.revision + 1 };
    });
  },
  importValues: (json) => {
    let applied = 0;
    set((state) => {
      const look = cloneLook(state.overrides ?? TERRAIN_LOOK);
      applied = applyValues(look, json);
      if (applied === 0 || sameLook(state.overrides ?? TERRAIN_LOOK, look)) return state;
      const overrides = matchesConfig(look) ? null : look;
      saveOverrides(overrides);
      return { overrides, revision: state.revision + 1 };
    });
    return applied;
  },
  exportValues: () => {
    const look = get().overrides ?? TERRAIN_LOOK;
    return {
      source: 'volcanae-terrain-tuning',
      version: 1,
      terrain: look.terrain,
      status: look.status,
      objects: look.objects,
    };
  },
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}));
