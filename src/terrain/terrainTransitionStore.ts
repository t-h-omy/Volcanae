import { create } from 'zustand';

export interface LavaFlowState {
  row: number;
  startedAt: number;
  durationMs: number;
  phase: 'flow' | 'engulf';
}

interface TerrainTransitionState {
  lavaFlow: LavaFlowState | null;
  startLavaFlow: (row: number, durationMs: number) => void;
  setLavaPhase: (phase: LavaFlowState['phase']) => void;
  endLavaFlow: () => void;
}

export function getLavaFlowProgress(flow: LavaFlowState, nowMs: number): number {
  if (flow.phase === 'engulf' || flow.durationMs <= 0) return 1;
  const linear = Math.max(0, Math.min(1, (nowMs - flow.startedAt) / flow.durationMs));
  return linear * linear * (3 - 2 * linear);
}

export const useTerrainTransitionStore = create<TerrainTransitionState>((set) => ({
  lavaFlow: null,
  startLavaFlow: (row, durationMs) => set({
    lavaFlow: { row, startedAt: performance.now(), durationMs, phase: 'flow' },
  }),
  setLavaPhase: (phase) => set((state) => state.lavaFlow
    ? { lavaFlow: { ...state.lavaFlow, phase } }
    : state),
  endLavaFlow: () => set({ lavaFlow: null }),
}));
