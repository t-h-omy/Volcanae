import type { GraphicsQuality, GridLineMode } from '../src/types';

/** Look of the terrain layer. Keys match the export format of the terrain prototype and of the dev tuning panel (TR-04). */
export const TERRAIN_LOOK = {
  terrain: {
    plains: { blend: 0.27, noise: 0.22, patchContrast: 0.5, tufts: 0.5 },
    canyon: { blend: 0.25, noise: 0.22, wallHeight: 0.275, detail: 1 },
    water: { blend: 0.25, noise: 0.22, foam: 0.7, waves: 0.7 },
    lava: { blend: 0.25, noise: 0.22, crust: 0.5, glow: 0.5, previewHeat: 0.7 },
    fog: { blend: 0.25, noise: 0.22, shadow: 0.5, contrast: 0.6 },
  },
  status: {
    frozen: { blend: 0.4, noise: 0.3, frostLayer: 0.875, cracks: 0.675, glare: 0.775 },
    burning: { blend: 0.4, noise: 0.3, char: 0.65, scorch: 0.925, fire: 0.525 },
    corrupted: { blend: 0.3, noise: 0.3, ash: 1, veins: 0.65, glow: 0.7 },
    crystalline: { blend: 0.31, noise: 0.3, density: 0.75, size: 0.1, strength: 0.525 },
  },
  /** Strength of the status treatment on forest, mountain, building and ruin sprites (TR-03). */
  objects: { frozen: 0.4, corrupted: 0.35, crystalline: 0.55, burning: 0.4 },
} as const;
type Widen<T> = { [K in keyof T]: T[K] extends number ? number : Widen<T[K]> };
/** Same shape as TERRAIN_LOOK with every leaf widened to number (dev overrides in TR-04 produce this type). */
export type TerrainLook = Widen<typeof TERRAIN_LOOK>;

export const TERRAIN_RENDER = {
  /** Device pixel ratio cap and terrain animation frame rate per graphics quality. BASIC uses the PNG tiles. */
  QUALITY: {
    HIGH: { MAX_DPR: 2, ANIM_FPS: 30 },
    SAVER: { MAX_DPR: 1, ANIM_FPS: 15 },
  },
  /** Grid line opacity drawn by the shader (one device pixel wide). */
  GRID_ALPHA_SHADER: { FINE: 0.22, BOLD: 0.4 },
  /** Grid line opacity drawn by the DOM tiles in PNG mode. FINE equals the look before this batch. */
  GRID_ALPHA_DOM: { FINE: 0.12, BOLD: 0.28 },
  /** On-screen grid line width in CSS pixels in PNG mode, independent of zoom. */
  GRID_LINE_SCREEN_PX: 1,
  /** Heat of the farthest lava preview row relative to the row lava takes next (1). */
  PREVIEW_HEAT_MIN: 0.45,
  /** Heat levels are stored in 4 bits of the map texture. */
  HEAT_LEVEL_MAX: 15,
  /** Time after a lost WebGL context before falling back to PNG tiles. */
  CONTEXT_RESTORE_TIMEOUT_MS: 3000,
  /** Shader time wraps after this many seconds to keep float precision. */
  TIME_WRAP_S: 3600,
} as const satisfies {
  QUALITY: Record<Exclude<GraphicsQuality, 'BASIC'>, { MAX_DPR: number; ANIM_FPS: number }>;
  GRID_ALPHA_SHADER: Record<Exclude<GridLineMode, 'OFF'>, number>;
  GRID_ALPHA_DOM: Record<Exclude<GridLineMode, 'OFF'>, number>;
  GRID_LINE_SCREEN_PX: number;
  PREVIEW_HEAT_MIN: number;
  HEAT_LEVEL_MAX: number;
  CONTEXT_RESTORE_TIMEOUT_MS: number;
  TIME_WRAP_S: number;
};
