/**
 * Runtime hint store for Volcanae.
 * Tracks the active hint banner and queue; NOT persisted.
 * A banner lost on reload is acceptable by design.
 */

import { create } from 'zustand';
import type { HintId } from './hintConfig';

interface HintStoreState {
  queue: HintId[];
  activeHintId: HintId | null;
  expanded: boolean;

  /**
   * Enqueue a hint. Ignores duplicates already active or queued.
   * Promotes the first queued entry to active when none is active.
   */
  enqueue: (hintId: HintId) => void;

  /** Advance the queue, resetting expanded state. */
  dismissActive: () => void;

  /** Toggle the expanded detail panel. */
  toggleExpanded: () => void;

  /** Clear everything; call on new game / load game. */
  reset: () => void;
}

export const useHintStore = create<HintStoreState>()((set) => ({
  queue: [],
  activeHintId: null,
  expanded: false,

  enqueue: (hintId) => {
    set((state) => {
      if (state.activeHintId === hintId || state.queue.includes(hintId)) {
        return {};
      }
      const newQueue = [...state.queue, hintId];
      if (state.activeHintId === null) {
        return { activeHintId: newQueue[0], queue: newQueue.slice(1) };
      }
      return { queue: newQueue };
    });
  },

  dismissActive: () => {
    set((state) => {
      if (state.queue.length > 0) {
        return {
          activeHintId: state.queue[0],
          queue: state.queue.slice(1),
          expanded: false,
        };
      }
      return { activeHintId: null, queue: [], expanded: false };
    });
  },

  toggleExpanded: () => {
    set((state) => ({ expanded: !state.expanded }));
  },

  reset: () => {
    set({ queue: [], activeHintId: null, expanded: false });
  },
}));
