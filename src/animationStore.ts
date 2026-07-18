/**
 * Zustand store for the animation event queue system.
 * Manages event playback, camera targeting, and animation state.
 * Separate from gameStore to keep concerns isolated.
 */

import { create } from 'zustand';
import type { GameEvent } from './gameEvents';
import type { GameState, Position } from './types';
import { MAP } from './gameConfig';

// ============================================================================
// TYPES
// ============================================================================

interface AnimationState {
  /** Queue of events waiting to be played */
  eventQueue: GameEvent[];

  /** The fully resolved GameState after all queued events complete */
  resolvedState: GameState | null;

  /** Monotonic queue revision; increments on enqueue/clear */
  queueRevision: number;

  /** Revision currently being processed by the animation engine */
  processingRevision: number | null;

  /** Camera target — the grid position the viewport should center on */
  cameraTarget: Position;

  /** True while the animation engine is processing the queue */
  isAnimating: boolean;
}

interface AnimationActions {
  /** Push a batch of events and store the resolved state */
  enqueue: (events: GameEvent[], resolvedState: GameState) => void;
  /** Pop the first event from the queue */
  shiftEvent: () => GameEvent | undefined;
  /** Set the camera target position */
  setCameraTarget: (pos: Position) => void;
  /** Set animation active state */
  setIsAnimating: (v: boolean) => void;
  /** Marks the current queue revision as the active processing batch */
  beginProcessingCurrentQueue: () => void;
  /** Clears the active processing marker */
  finishProcessing: () => void;
  /** Clear the queue and resolved state */
  clear: () => void;
}

type AnimationStore = AnimationState & AnimationActions;

// ============================================================================
// STORE
// ============================================================================

export const useAnimationStore = create<AnimationStore>((set, get) => ({
  eventQueue: [],
  resolvedState: null,
  queueRevision: 0,
  processingRevision: null,
  cameraTarget: {
    x: Math.floor(MAP.GRID_WIDTH / 2),
    y: MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - Math.floor(MAP.ZONE_HEIGHT / 2),
  },
  isAnimating: false,

  enqueue: (events, resolvedState) => {
    const nextRevision = get().queueRevision + 1;
    set({
      eventQueue: events,
      resolvedState,
      queueRevision: nextRevision,
    });
  },

  shiftEvent: () => {
    const { eventQueue } = get();
    if (eventQueue.length === 0) return undefined;
    const [first, ...rest] = eventQueue;
    set({ eventQueue: rest });
    return first;
  },

  setCameraTarget: (pos) => {
    set({ cameraTarget: pos });
  },

  setIsAnimating: (v) => {
    set({ isAnimating: v });
  },

  beginProcessingCurrentQueue: () => {
    set({ processingRevision: get().queueRevision });
  },

  finishProcessing: () => {
    set({ processingRevision: null });
  },

  clear: () => {
    const nextRevision = get().queueRevision + 1;
    set({ eventQueue: [], resolvedState: null, isAnimating: false, queueRevision: nextRevision });
  },
}));
