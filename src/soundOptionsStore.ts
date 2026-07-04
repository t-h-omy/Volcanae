/**
 * Sound options store for Volcanae.
 * Holds the master volume (0–1) and muted state, persisted to localStorage.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'volcanae_sound_options';

interface SoundOptionsState {
  volume: number;
  muted: boolean;
  setVolume: (value: number) => void;
  setMuted: (value: boolean) => void;
}

function loadFromStorage(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ volume: number; muted: boolean }>;
      return {
        volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : 0.5,
        muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
      };
    }
  } catch {
    // ignore
  }
  return { volume: 0.5, muted: false };
}

function saveToStorage(volume: number, muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    // ignore
  }
}

const initial = loadFromStorage();

export const useSoundOptionsStore = create<SoundOptionsState>()((set) => ({
  volume: initial.volume,
  muted: initial.muted,
  setVolume: (value) => {
    set((state) => {
      saveToStorage(value, state.muted);
      return { volume: value };
    });
  },
  setMuted: (value) => {
    set((state) => {
      saveToStorage(state.volume, value);
      return { muted: value };
    });
  },
}));

/**
 * Triggers a named spell sound effect.
 * Currently a no-op — wire to real audio files once assets are available.
 *
 * Keys:
 *   'spell_cast' — generic spell confirmation
 *   'summon'     — Emberbind / Raise Skeleton
 *   'freeze'     — Frostcraft ice creation
 *
 * TODO: replace the no-op body with:
 *   const { volume, muted } = useSoundOptionsStore.getState();
 *   if (muted || volume === 0) return;
 *   const audio = new Audio(SFX_PATHS[key]);
 *   audio.volume = volume;
 *   audio.play().catch(() => undefined);
 */
export function triggerSpellSfx(_key: 'spell_cast' | 'summon' | 'freeze'): void {
  // no-op until audio assets are available
}
