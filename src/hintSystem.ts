/**
 * Hint trigger gate for Volcanae.
 *
 * IMPORTANT: tryTriggerHint must NEVER be called from inside an Immer
 * produce/set callback. Call it only after the set(produce(...)) completes.
 */

import { HINTS } from '../config/hints';
import type { HintId } from '../config/hints';
import { useHintOptionsStore } from './hintOptionsStore';
import { useHintStore } from './hintStore';
import { useGameStore } from './gameStore';
import { useAnimationStore } from './animationStore';

/**
 * Returns true and enqueues the hint if all gates pass; false otherwise.
 *
 * Gate order:
 *  1. hintsEnabled must be true.
 *  2. Hints only fire on/after HINTS.START_TURN.
 *  3. seenHints (per-save) must not include hintId.
 *  4. globalShowCounts[hintId] must be < HINTS.GLOBAL_MAX_SHOWS.
 *  5. On pass: markHintSeen, incrementShowCount, enqueue.
 */
export function tryTriggerHint(hintId: HintId): boolean {
  const { hintsEnabled, globalShowCounts, incrementShowCount } = useHintOptionsStore.getState();
  if (!hintsEnabled) return false;

  const { seenHints, markHintSeen, turn } = useGameStore.getState();
  if (typeof turn === 'number' && turn < HINTS.START_TURN) return false;

  if (Array.isArray(seenHints) && seenHints.includes(hintId)) return false;

  const showCount = globalShowCounts[hintId] ?? 0;
  if (showCount >= HINTS.GLOBAL_MAX_SHOWS) return false;

  // All gates passed: record and enqueue.
  markHintSeen(hintId);
  incrementShowCount(hintId);
  useHintStore.getState().enqueue(hintId);
  return true;
}

export function flushDeferredHints(): void {
  const deferredHints = useHintStore.getState().takeDeferred();
  for (const deferred of deferredHints) {
    const fired = tryTriggerHint(deferred.hintId);
    if (fired && deferred.cameraTarget) {
      useAnimationStore.getState().setCameraTarget(deferred.cameraTarget);
    }
  }
}
