/**
 * Zustand store for camera zoom level.
 *
 * - `zoom` — current zoom multiplier (default 1.0)
 * - `setZoom(z)` — set zoom, clamped to [ZOOM_MIN, ZOOM_MAX]
 * - `stepZoom(delta)` — add delta to current zoom, clamped
 */

import { create } from 'zustand';
import { RENDER } from './renderConfig';

interface ZoomState {
  zoom: number;
  setZoom: (z: number) => void;
  stepZoom: (delta: number) => void;
}

function clampZoom(z: number): number {
  return Math.min(RENDER.ZOOM_MAX, Math.max(RENDER.ZOOM_MIN, z));
}

export const useZoomStore = create<ZoomState>((set) => ({
  zoom: RENDER.ZOOM_DEFAULT,
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  stepZoom: (delta) => set((s) => ({ zoom: clampZoom(s.zoom + delta) })),
}));
