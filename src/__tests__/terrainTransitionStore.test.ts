import { describe, expect, it, vi } from 'vitest';
import { getLavaFlowProgress, useTerrainTransitionStore } from '../terrain/terrainTransitionStore';

describe('getLavaFlowProgress', () => {
  const flow = { row: 4, startedAt: 100, durationMs: 200, phase: 'flow' as const };

  it('returns smooth progress at the start, middle, and end', () => {
    expect(getLavaFlowProgress(flow, 100)).toBe(0);
    expect(getLavaFlowProgress(flow, 200)).toBe(0.5);
    expect(getLavaFlowProgress(flow, 300)).toBe(1);
  });

  it('completes zero-duration and engulf flows immediately', () => {
    expect(getLavaFlowProgress({ ...flow, durationMs: 0 }, 100)).toBe(1);
    expect(getLavaFlowProgress({ ...flow, phase: 'engulf' }, 100)).toBe(1);
  });
});

describe('useTerrainTransitionStore', () => {
  it('starts, phases, and ends a lava flow', () => {
    vi.spyOn(performance, 'now').mockReturnValue(123);
    const store = useTerrainTransitionStore.getState();
    store.startLavaFlow(7, 900);
    expect(useTerrainTransitionStore.getState().lavaFlow).toEqual({
      row: 7, startedAt: 123, durationMs: 900, phase: 'flow',
    });
    useTerrainTransitionStore.getState().setLavaPhase('engulf');
    expect(useTerrainTransitionStore.getState().lavaFlow?.phase).toBe('engulf');
    useTerrainTransitionStore.getState().endLavaFlow();
    expect(useTerrainTransitionStore.getState().lavaFlow).toBeNull();
    vi.restoreAllMocks();
  });
});
