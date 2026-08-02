/**
 * Transient UI store that keeps the displayed ember counter at its pre-flight
 * value while a flying-flame animation is in progress.
 *
 * When an EMBER_LEVEL_UP event is queued:
 *  1. `increment(amount)` is called immediately so the HUD shows the old value.
 *  2. On flight arrival `release(amount)` is called so the counter ticks up.
 *  3. `clear()` is called as a safety net after the animation queue concludes.
 *
 * Multiple simultaneous rises are additive — each flight manages its own slice.
 */

import { create } from 'zustand';

interface EmberDisplayState {
  pendingEmberOffset: number;
}

interface EmberDisplayActions {
  increment: (amount: number) => void;
  release: (amount: number) => void;
  clear: () => void;
}

export const useEmberDisplayStore = create<EmberDisplayState & EmberDisplayActions>((set) => ({
  pendingEmberOffset: 0,
  increment: (amount) =>
    set((state) => ({ pendingEmberOffset: state.pendingEmberOffset + amount })),
  release: (amount) =>
    set((state) => ({
      pendingEmberOffset: Math.max(0, state.pendingEmberOffset - amount),
    })),
  clear: () => set({ pendingEmberOffset: 0 }),
}));
