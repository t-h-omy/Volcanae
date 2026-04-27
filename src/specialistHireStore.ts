/**
 * Zustand store for the specialist hire / no-survivor modal.
 *
 * Opened by the animation engine when a CAVE_MONSTER_KILLED event is processed.
 * Two modes:
 *   'hire'      — a specialist was drawn; player may hire or send away.
 *   'exhausted' — all specialists are already hired; flavor-text only.
 */

import { create } from 'zustand';

type HireMode = 'hire' | 'exhausted' | null;

interface SpecialistHireState {
  mode: HireMode;
  specialistId: string | null;
  /** Resolve callback — called with true if the specialist was hired. */
  onDismiss: ((hired: boolean) => void) | null;
}

interface SpecialistHireActions {
  /** Show the hire modal for a specific specialist. */
  showHire: (specialistId: string, onDismiss: (hired: boolean) => void) => void;
  /** Show the pool-exhausted / no-survivor modal. */
  showExhausted: (onDismiss: (hired: boolean) => void) => void;
  /** Dismiss the modal; hired=true if the player clicked Hire. */
  dismiss: (hired: boolean) => void;
}

export const useSpecialistHireStore = create<SpecialistHireState & SpecialistHireActions>((set, get) => ({
  mode: null,
  specialistId: null,
  onDismiss: null,

  showHire: (specialistId, onDismiss) =>
    set({ mode: 'hire', specialistId, onDismiss }),

  showExhausted: (onDismiss) =>
    set({ mode: 'exhausted', specialistId: null, onDismiss }),

  dismiss: (hired) => {
    get().onDismiss?.(hired);
    set({ mode: null, specialistId: null, onDismiss: null });
  },
}));
