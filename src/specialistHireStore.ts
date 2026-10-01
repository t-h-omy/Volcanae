/**
 * Zustand store for the cave specialist reward / no-survivor modal.
 *
 * Opened by the animation engine when a CAVE_MONSTER_KILLED event is processed.
 * Three modes:
 *   'hire'      — empty slot available; player may hire or rob.
 *   'exhausted' — no eligible specialists; flavor-text only.
 *   'swap'      — all slots full; player may replace one current specialist or rob.
 */

import { create } from 'zustand';

type HireMode = 'hire' | 'exhausted' | 'swap' | null;

export type CaveSpecialistRewardOutcome =
  | { type: 'hire' }
  | { type: 'swap'; outgoingId: string }
  | { type: 'rob' };

interface SpecialistHireState {
  mode: HireMode;
  /** ID of the incoming (drawn) specialist. */
  specialistId: string | null;
  onResolve: ((outcome: CaveSpecialistRewardOutcome) => void) | null;
  onCloseExhausted: (() => void) | null;
}

interface SpecialistHireActions {
  /** Show the hire modal for a specific specialist (empty-slot flow). */
  showHire: (specialistId: string, onResolve: (outcome: CaveSpecialistRewardOutcome) => void) => void;
  /** Show the pool-exhausted / no-survivor modal. */
  showExhausted: (onClose: () => void) => void;
  /** Show the swap modal (all slots full). */
  showSwap: (specialistId: string, onResolve: (outcome: CaveSpecialistRewardOutcome) => void) => void;
  resolveReward: (outcome: CaveSpecialistRewardOutcome) => void;
  closeExhausted: () => void;
}

export const useSpecialistHireStore = create<SpecialistHireState & SpecialistHireActions>((set, get) => ({
  mode: null,
  specialistId: null,
  onResolve: null,
  onCloseExhausted: null,

  showHire: (specialistId, onResolve) =>
    set({ mode: 'hire', specialistId, onResolve, onCloseExhausted: null }),

  showExhausted: (onCloseExhausted) =>
    set({ mode: 'exhausted', specialistId: null, onResolve: null, onCloseExhausted }),

  showSwap: (specialistId, onResolve) =>
    set({ mode: 'swap', specialistId, onResolve, onCloseExhausted: null }),

  resolveReward: (outcome) => {
    const { mode, onResolve } = get();
    if (!onResolve || !(
      (mode === 'hire' && (outcome.type === 'hire' || outcome.type === 'rob')) ||
      (mode === 'swap' && (outcome.type === 'swap' || outcome.type === 'rob'))
    )) return;
    set({ mode: null, specialistId: null, onResolve: null, onCloseExhausted: null });
    onResolve(outcome);
  },

  closeExhausted: () => {
    const { mode, onCloseExhausted } = get();
    if (mode !== 'exhausted' || !onCloseExhausted) return;
    set({ mode: null, specialistId: null, onResolve: null, onCloseExhausted: null });
    onCloseExhausted();
  },
}));
