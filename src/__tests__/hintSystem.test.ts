/**
 * Tests for the hint system (tryTriggerHint, stores, queue behavior).
 * Runs in a node environment; localStorage access is guarded by try/catch in the stores.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { HINTS } from '../hintConfig';

// ── Minimal gameStore stub ──────────────────────────────────────────────────
// vi.hoisted ensures mockState is initialized before the mock factory runs,
// even though vi.mock is hoisted to the top of the file.
const mockState = vi.hoisted(() => ({
  seenHints: [] as string[],
  turn: 2,
}));

vi.mock('../gameStore', () => ({
  useGameStore: {
    getState: () => ({
      seenHints: mockState.seenHints,
      turn: mockState.turn,
      markHintSeen: (id: string) => {
        if (!mockState.seenHints.includes(id)) mockState.seenHints.push(id);
      },
    }),
  },
}));

import { tryTriggerHint } from '../hintSystem';

function resetStores(hintsEnabled = true) {
  useHintStore.getState().reset();
  useHintOptionsStore.setState({ hintsEnabled, globalShowCounts: {} });
  mockState.seenHints = [];
  mockState.turn = 2;
}

describe('tryTriggerHint', () => {
  beforeEach(() => {
    resetStores();
  });

  it('enqueues once, marks seenHints, increments globalShowCounts', () => {
    const result = tryTriggerHint('H01_BUILD_WOODCUTTER');
    expect(result).toBe(true);

    const { activeHintId } = useHintStore.getState();
    expect(activeHintId).toBe('H01_BUILD_WOODCUTTER');

    expect(mockState.seenHints).toContain('H01_BUILD_WOODCUTTER');

    const { globalShowCounts } = useHintOptionsStore.getState();
    expect(globalShowCounts['H01_BUILD_WOODCUTTER']).toBe(1);
  });

  it('returns false on second call (seenHints gate), no duplicate queue entry', () => {
    tryTriggerHint('H01_BUILD_WOODCUTTER');

    // Reset queue to simulate a fresh banner state but keep seenHints.
    useHintStore.getState().reset();

    const result = tryTriggerHint('H01_BUILD_WOODCUTTER');
    expect(result).toBe(false);
    expect(useHintStore.getState().activeHintId).toBeNull();
  });

  it('returns false when globalShowCounts reaches HINTS.GLOBAL_MAX_SHOWS', () => {
    useHintOptionsStore.setState({
      hintsEnabled: true,
      globalShowCounts: { H01_BUILD_WOODCUTTER: HINTS.GLOBAL_MAX_SHOWS },
    });

    const result = tryTriggerHint('H01_BUILD_WOODCUTTER');
    expect(result).toBe(false);
    expect(useHintStore.getState().activeHintId).toBeNull();
  });

  it('returns false when hintsEnabled is false', () => {
    resetStores(false);
    const result = tryTriggerHint('H03_BUILD_ON_RUIN');
    expect(result).toBe(false);
    expect(useHintStore.getState().activeHintId).toBeNull();
    expect(mockState.seenHints).not.toContain('H03_BUILD_ON_RUIN');
  });

  it('returns false during turn 1 without enqueueing or recording the hint', () => {
    mockState.turn = 1;
    const result = tryTriggerHint('H01_BUILD_WOODCUTTER');
    expect(result).toBe(false);
    expect(useHintStore.getState().activeHintId).toBeNull();
    expect(mockState.seenHints).not.toContain('H01_BUILD_WOODCUTTER');
    expect(useHintOptionsStore.getState().globalShowCounts['H01_BUILD_WOODCUTTER']).toBeUndefined();
  });

  it('allows hints from HINTS.START_TURN onward', () => {
    mockState.turn = HINTS.START_TURN;
    const result = tryTriggerHint('H01_BUILD_WOODCUTTER');
    expect(result).toBe(true);
    expect(useHintStore.getState().activeHintId).toBe('H01_BUILD_WOODCUTTER');
  });

  it('resetShowCounts clears counters so a fresh save can trigger again', () => {
    useHintOptionsStore.setState({
      hintsEnabled: true,
      globalShowCounts: { H04_RUIN_MENU_FIRST: HINTS.GLOBAL_MAX_SHOWS },
    });
    expect(tryTriggerHint('H04_RUIN_MENU_FIRST')).toBe(false);

    useHintOptionsStore.getState().resetShowCounts();

    // Counter was blocked so mockState.seenHints is still empty from resetStores.
    expect(tryTriggerHint('H04_RUIN_MENU_FIRST')).toBe(true);
    expect(useHintStore.getState().activeHintId).toBe('H04_RUIN_MENU_FIRST');
  });
});

describe('hintStore queue behavior', () => {
  beforeEach(() => {
    resetStores();
  });

  it('enqueue three hints, active advances on dismissActive, expanded resets', () => {
    tryTriggerHint('H05_ATTACK_ENDS_TURN');
    tryTriggerHint('H06_LAVA_ADVANCE');
    tryTriggerHint('H07_RECRUIT_NO_RESOURCES');

    let s = useHintStore.getState();
    expect(s.activeHintId).toBe('H05_ATTACK_ENDS_TURN');
    expect(s.queue).toEqual(['H06_LAVA_ADVANCE', 'H07_RECRUIT_NO_RESOURCES']);
    expect(s.expanded).toBe(false);

    // Expand then dismiss: expanded must reset.
    useHintStore.getState().toggleExpanded();
    expect(useHintStore.getState().expanded).toBe(true);

    useHintStore.getState().dismissActive();
    s = useHintStore.getState();
    expect(s.activeHintId).toBe('H06_LAVA_ADVANCE');
    expect(s.queue).toEqual(['H07_RECRUIT_NO_RESOURCES']);
    expect(s.expanded).toBe(false);

    useHintStore.getState().dismissActive();
    s = useHintStore.getState();
    expect(s.activeHintId).toBe('H07_RECRUIT_NO_RESOURCES');
    expect(s.queue).toEqual([]);

    useHintStore.getState().dismissActive();
    s = useHintStore.getState();
    expect(s.activeHintId).toBeNull();
    expect(s.queue).toEqual([]);
  });

  it('ignores duplicate enqueue when hint is active', () => {
    tryTriggerHint('H08_RECRUIT_NO_POPULATION');
    // Manually try to enqueue the same hint again via the store.
    useHintStore.getState().enqueue('H08_RECRUIT_NO_POPULATION');

    const s = useHintStore.getState();
    expect(s.activeHintId).toBe('H08_RECRUIT_NO_POPULATION');
    expect(s.queue).toEqual([]);
  });

  it('ignores duplicate enqueue when hint is queued', () => {
    tryTriggerHint('H08_RECRUIT_NO_POPULATION');
    tryTriggerHint('H09_RECRUIT_NO_CAPACITY');
    // Manually enqueue a duplicate of the queued item.
    useHintStore.getState().enqueue('H09_RECRUIT_NO_CAPACITY');

    const s = useHintStore.getState();
    expect(s.queue).toEqual(['H09_RECRUIT_NO_CAPACITY']);
  });
});
