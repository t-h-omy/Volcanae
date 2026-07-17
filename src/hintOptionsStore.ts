/**
 * Hint options store for Volcanae.
 * Persists global hint settings and per-hint show counters to localStorage.
 * Mirrors the pattern of soundOptionsStore.ts.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'volcanae_hint_options';

interface HintOptionsState {
  hintsEnabled: boolean;
  globalShowCounts: Record<string, number>;
  setHintsEnabled: (value: boolean) => void;
  incrementShowCount: (hintId: string) => void;
  resetShowCounts: () => void;
}

function loadFromStorage(): { hintsEnabled: boolean; globalShowCounts: Record<string, number> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{
        hintsEnabled: boolean;
        globalShowCounts: Record<string, number>;
      }>;
      return {
        hintsEnabled: typeof parsed.hintsEnabled === 'boolean' ? parsed.hintsEnabled : true,
        globalShowCounts:
          parsed.globalShowCounts !== null &&
          typeof parsed.globalShowCounts === 'object' &&
          !Array.isArray(parsed.globalShowCounts)
            ? parsed.globalShowCounts
            : {},
      };
    }
  } catch {
    // ignore
  }
  return { hintsEnabled: true, globalShowCounts: {} };
}

function saveToStorage(hintsEnabled: boolean, globalShowCounts: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hintsEnabled, globalShowCounts }));
  } catch {
    // ignore
  }
}

const initial = loadFromStorage();

export const useHintOptionsStore = create<HintOptionsState>()((set) => ({
  hintsEnabled: initial.hintsEnabled,
  globalShowCounts: initial.globalShowCounts,

  setHintsEnabled: (value) => {
    set((state) => {
      saveToStorage(value, state.globalShowCounts);
      return { hintsEnabled: value };
    });
  },

  incrementShowCount: (hintId) => {
    set((state) => {
      const updated = { ...state.globalShowCounts, [hintId]: (state.globalShowCounts[hintId] ?? 0) + 1 };
      saveToStorage(state.hintsEnabled, updated);
      return { globalShowCounts: updated };
    });
  },

  resetShowCounts: () => {
    set((state) => {
      saveToStorage(state.hintsEnabled, {});
      return { globalShowCounts: {} };
    });
  },
}));
