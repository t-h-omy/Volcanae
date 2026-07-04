/**
 * Zustand store for the Market trade panel.
 *
 * The panel opens when a player unit triggers the Trade action on a Market
 * building. It stays open until the player explicitly closes it.
 *
 * Opening and closing the panel is free — it does NOT set hasTradedThisTurn.
 * Only a completed purchase (resource buy or specialist acquisition) sets the
 * flag (handled in gameStore.ts).
 *
 * `pendingSpecialistSlot` is non-null when the player has tapped a specialist
 * offer and storage is full: the sub-view lists owned specialists to swap out.
 * Cancelling resets it to null without charging crystals.
 */

import { create } from 'zustand';

interface MarketPanelState {
  open: boolean;
  marketId: string | null;
  unitId: string | null;
  /** Non-null when the player has initiated a specialist swap (storage full). */
  pendingSpecialistSlot: number | null;
}

interface MarketPanelActions {
  openPanel: (marketId: string, unitId: string) => void;
  closePanel: () => void;
  beginSpecialistSwap: (slotIndex: number) => void;
  cancelSpecialistSwap: () => void;
}

export const useMarketPanelStore = create<MarketPanelState & MarketPanelActions>((set) => ({
  open: false,
  marketId: null,
  unitId: null,
  pendingSpecialistSlot: null,

  openPanel: (marketId, unitId) =>
    set({ open: true, marketId, unitId, pendingSpecialistSlot: null }),

  closePanel: () =>
    set({ open: false, marketId: null, unitId: null, pendingSpecialistSlot: null }),

  beginSpecialistSwap: (slotIndex) =>
    set({ pendingSpecialistSlot: slotIndex }),

  cancelSpecialistSwap: () =>
    set({ pendingSpecialistSlot: null }),
}));
