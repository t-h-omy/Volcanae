import { create } from 'zustand';
import { useGraphicsOptionsStore } from '../graphicsOptionsStore';
import { GraphicsQuality, type GraphicsQuality as GraphicsQualityType } from '../types';

export type WebglStatus = 'ready' | 'unavailable';
export type TerrainRenderMode = 'shader' | 'png';

interface TerrainRenderState {
  webglStatus: WebglStatus;
  markWebglUnavailable: () => void;
}

function probeWebgl(): WebglStatus {
  if (typeof document === 'undefined') return 'unavailable';
  try {
    return document.createElement('canvas').getContext('webgl2') ? 'ready' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export const useTerrainRenderStore = create<TerrainRenderState>()((set) => ({
  webglStatus: probeWebgl(),
  markWebglUnavailable: () => set({ webglStatus: 'unavailable' }),
}));

export function resolveTerrainRenderMode(quality: GraphicsQualityType, status: WebglStatus): TerrainRenderMode {
  return quality === GraphicsQuality.BASIC || status === 'unavailable' ? 'png' : 'shader';
}

export function useTerrainRenderMode(): TerrainRenderMode {
  const quality = useGraphicsOptionsStore((state) => state.quality);
  const status = useTerrainRenderStore((state) => state.webglStatus);
  return resolveTerrainRenderMode(quality, status);
}
