/**
 * Zustand store for the blocking "Zone Cleared" confirmation popup.
 * The animation engine stores a resolve callback and awaits a Promise
 * that only resolves when the player clicks the dismiss button.
 */

import { create } from 'zustand';

interface ZoneClearedState {
  active: boolean;
  zone: number;
  onDismiss: (() => void) | null;
}

interface ZoneClearedActions {
  show: (zone: number, onDismiss: () => void) => void;
  dismiss: () => void;
}

export const useZoneClearedStore = create<ZoneClearedState & ZoneClearedActions>((set, get) => ({
  active: false,
  zone: 0,
  onDismiss: null,

  show: (zone, onDismiss) => set({ active: true, zone, onDismiss }),

  dismiss: () => {
    get().onDismiss?.();
    set({ active: false, zone: 0, onDismiss: null });
  },
}));
