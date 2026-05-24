/**
 * Zustand store for expanding shockwave ring VFX.
 * Drives the ShockwaveLayer in GridRenderer.
 */

import { create } from 'zustand';

export interface Shockwave {
  id: string;
  /** Pixel center X in unscaled grid-container space */
  cx: number;
  /** Pixel center Y in unscaled grid-container space */
  cy: number;
  durationMs: number;
  /**
   * Final CSS scale value for the expansion animation.
   * When present (Emberling explosions) the ring is constrained to a specific
   * tile-size-relative radius instead of the default zone-clear scale.
   */
  finalScale?: number;
  /**
   * Visual variant of the shockwave ring.
   * When set to 'crystal', the ring renders in light-blue crystal colours.
   */
  variant?: string;
}

interface ShockwaveState {
  shockwaves: Shockwave[];
}

interface ShockwaveActions {
  addShockwave: (sw: Shockwave) => void;
  removeShockwave: (id: string) => void;
}

export const useShockwaveStore = create<ShockwaveState & ShockwaveActions>((set) => ({
  shockwaves: [],
  addShockwave: (sw) => set((s) => ({ shockwaves: [...s.shockwaves, sw] })),
  removeShockwave: (id) => set((s) => ({ shockwaves: s.shockwaves.filter((w) => w.id !== id) })),
}));
