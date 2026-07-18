/**
 * Tests for the H01_BUILD_WOODCUTTER hint.
 *
 * Verifies that a fresh game does not surface H01 during turn 1.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { Difficulty } from '../types';
import { useGameStore } from '../gameStore';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { useAnimationStore } from '../animationStore';

function resetHintStores() {
  useHintStore.setState({ queue: [], activeHintId: null, expanded: false });
  useHintOptionsStore.setState({ hintsEnabled: true, globalShowCounts: {} });
  useAnimationStore.getState().clear();
}

describe('H01_BUILD_WOODCUTTER hint on initNewGame', () => {
  beforeEach(() => {
    resetHintStores();
  });

  it('does not fire H01 during the first turn of a fresh game', () => {
    useGameStore.getState().initNewGame(Difficulty.STANDARD);

    const { activeHintId, queue } = useHintStore.getState();
    const hintFired =
      activeHintId === 'H01_BUILD_WOODCUTTER' ||
      queue.includes('H01_BUILD_WOODCUTTER');

    expect(hintFired).toBe(false);
  });

  it('does not fire H01 when globalShowCounts is at max (GLOBAL_MAX_SHOWS=2)', () => {
    // Pre-saturate the global show count so the gate blocks the hint.
    useHintOptionsStore.setState({
      hintsEnabled: true,
      globalShowCounts: { H01_BUILD_WOODCUTTER: 2 },
    });

    useGameStore.getState().initNewGame(Difficulty.STANDARD);

    const { activeHintId, queue } = useHintStore.getState();
    const hintFired =
      activeHintId === 'H01_BUILD_WOODCUTTER' ||
      queue.includes('H01_BUILD_WOODCUTTER');

    expect(hintFired).toBe(false);
  });

  it('does not fire H01 when hintsEnabled is false', () => {
    useHintOptionsStore.setState({ hintsEnabled: false, globalShowCounts: {} });

    useGameStore.getState().initNewGame(Difficulty.STANDARD);

    const { activeHintId, queue } = useHintStore.getState();
    const hintFired =
      activeHintId === 'H01_BUILD_WOODCUTTER' ||
      queue.includes('H01_BUILD_WOODCUTTER');

    expect(hintFired).toBe(false);
  });
});
