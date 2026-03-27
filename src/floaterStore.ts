/**
 * Zustand store for damage floaters – purely visual, not part of GameState.
 */

import { create } from 'zustand';
import { UI } from './gameConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface DamageFloater {
  id: string;
  value: number;
  x: number;
  y: number;
  /** true = enemy took damage (orange), false = player took damage (red) */
  isEnemy: boolean;
}

interface FloaterState {
  floaters: DamageFloater[];
}

interface FloaterActions {
  addFloater: (floater: Omit<DamageFloater, 'id'>) => void;
  removeFloater: (id: string) => void;
}

type FloaterStore = FloaterState & FloaterActions;

// ============================================================================
// STORE
// ============================================================================

export const useFloaterStore = create<FloaterStore>((set) => ({
  floaters: [],

  addFloater: (floater) => {
    const id = crypto.randomUUID();
    set((state) => ({ floaters: [...state.floaters, { ...floater, id }] }));
    setTimeout(() => {
      useFloaterStore.getState().removeFloater(id);
    }, UI.DAMAGE_FLOAT_DURATION_MS);
  },

  removeFloater: (id) => {
    set((state) => ({ floaters: state.floaters.filter((f) => f.id !== id) }));
  },
}));
