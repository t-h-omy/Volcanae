/**
 * Tests for the H01_BUILD_WOODCUTTER hint.
 *
 * Verifies that H01 fires when `initNewGame` is called even when the HUD's
 * useEffect would not re-run (i.e. the new game starts at the same turn/phase/
 * building state as the previous game, so the deps are unchanged).
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

  it('fires H01 when initNewGame is called with no prior buildings (same deps as initial HUD state)', () => {
    // Call initNewGame to start a fresh game; the HUD component would be
    // mounted and its useEffect would NOT necessarily re-run if its deps
    // (turn=1, phase=PLAYER_TURN, playerBuildingTypes={STRONGHOLD}) match
    // those already present from a previous game in the same session.
    useGameStore.getState().initNewGame(Difficulty.STANDARD);

    const { activeHintId, queue } = useHintStore.getState();
    const hintFired =
      activeHintId === 'H01_BUILD_WOODCUTTER' ||
      queue.includes('H01_BUILD_WOODCUTTER');

    expect(hintFired).toBe(true);
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
