/**
 * Zustand store for the cave screams popup.
 * Opened from selectUnit when a player unit is standing on a cave mountain tile
 * that has not yet been resolved, and the unit did not arrive this turn.
 */

import { create } from 'zustand';
import type { Position } from './types';

interface CaveScreamsState {
  /** Position of the mountain tile triggering the popup, or null if not active */
  tilePos: Position | null;
}

interface CaveScreamsActions {
  open: (tilePos: Position) => void;
  close: () => void;
}

export const useCaveScreamsStore = create<CaveScreamsState & CaveScreamsActions>((set) => ({
  tilePos: null,

  open: (tilePos) => set({ tilePos }),

  close: () => set({ tilePos: null }),
}));
