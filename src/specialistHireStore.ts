/**
 * Zustand store for the specialist hire / no-survivor / swap modal.
 *
 * Opened by the animation engine when a CAVE_MONSTER_KILLED event is processed.
 * Three modes:
 *   'hire'      — empty slot available; player may hire or send away.
 *   'exhausted' — all specialists already hired; flavor-text only.
 *   'swap'      — all slots full; player may replace one current specialist or send away.
 */

import { create } from 'zustand';

type HireMode = 'hire' | 'exhausted' | 'swap' | null;

interface SpecialistHireState {
  mode: HireMode;
  /** ID of the incoming (drawn) specialist. */
  specialistId: string | null;
  /** Resolve callback for hire/exhausted modes — called with true if the specialist was hired. */
  onDismiss: ((hired: boolean) => void) | null;
  /** Resolve callback for swap mode — called with the outgoing specialist ID, or null if sent away. */
  onSwapDismiss: ((outgoingId: string | null) => void) | null;
}

interface SpecialistHireActions {
  /** Show the hire modal for a specific specialist (empty-slot flow). */
  showHire: (specialistId: string, onDismiss: (hired: boolean) => void) => void;
  /** Show the pool-exhausted / no-survivor modal. */
  showExhausted: (onDismiss: (hired: boolean) => void) => void;
  /** Show the swap modal (all slots full). */
  showSwap: (specialistId: string, onSwapDismiss: (outgoingId: string | null) => void) => void;
  /** Dismiss a hire/exhausted modal; hired=true if the player clicked Hire. */
  dismiss: (hired: boolean) => void;
  /** Dismiss the swap modal; outgoingId is the specialist being replaced, null means send away. */
  dismissSwap: (outgoingId: string | null) => void;
}

export const useSpecialistHireStore = create<SpecialistHireState & SpecialistHireActions>((set, get) => ({
  mode: null,
  specialistId: null,
  onDismiss: null,
  onSwapDismiss: null,

  showHire: (specialistId, onDismiss) =>
    set({ mode: 'hire', specialistId, onDismiss, onSwapDismiss: null }),

  showExhausted: (onDismiss) =>
    set({ mode: 'exhausted', specialistId: null, onDismiss, onSwapDismiss: null }),

  showSwap: (specialistId, onSwapDismiss) =>
    set({ mode: 'swap', specialistId, onDismiss: null, onSwapDismiss }),

  dismiss: (hired) => {
    get().onDismiss?.(hired);
    set({ mode: null, specialistId: null, onDismiss: null, onSwapDismiss: null });
  },

  dismissSwap: (outgoingId) => {
    get().onSwapDismiss?.(outgoingId);
    set({ mode: null, specialistId: null, onDismiss: null, onSwapDismiss: null });
  },
}));
