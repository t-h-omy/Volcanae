import type { GraphicsQuality, GridLineMode } from '../src/types';

/** Look of the terrain layer. Keys match the export format of the terrain prototype and of the dev tuning panel (TR-04). */
export const TERRAIN_LOOK = {
  terrain: {
    plains: { blend: 0.27, noise: 0.22, patchContrast: 0.5, tufts: 0.5 },
    canyon: { blend: 0.25, noise: 0.22, wallHeight: 0.275, detail: 1 },
    water: { blend: 0.25, noise: 0.22, foam: 0.7, waves: 0.7 },
    lava: { blend: 0.25, noise: 0.22, crust: 0.5, glow: 0.5, previewHeat: 0.7, previewBlend: 0.25, previewNoise: 0.22 },
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

/** Dev tuning panel: [key, label, min, max] per group, groups in tab order. Labels are dev-only English. */
export const TERRAIN_TUNING_SCHEMA = [
  { path: 'terrain.plains', label: 'Plains', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['patchContrast', 'Patch contrast', 0, 1], ['tufts', 'Grass tufts', 0, 1]] },
  { path: 'terrain.canyon', label: 'Canyon', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['wallHeight', 'Wall height', 0, 1], ['detail', 'Cracks and pebbles', 0, 1]] },
  { path: 'terrain.water', label: 'Water', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['foam', 'Foam', 0, 1], ['waves', 'Waves', 0, 1]] },
  { path: 'terrain.lava', label: 'Lava', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['crust', 'Crust', 0, 1], ['glow', 'Glow', 0, 1], ['previewHeat', 'Preview heat', 0, 1], ['previewBlend', 'Preview edge blend', 0.06, 0.4], ['previewNoise', 'Preview edge noise', 0, 0.3]] },
  { path: 'terrain.fog', label: 'Fog', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['shadow', 'Cloud shadow', 0, 1], ['contrast', 'Cloud contrast', 0, 1]] },
  { path: 'status.frozen', label: 'Frozen', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['frostLayer', 'Frost layer', 0, 1], ['cracks', 'Cracks', 0, 1], ['glare', 'Ice glare', 0, 1]] },
  { path: 'status.burning', label: 'Burning', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['char', 'Char', 0, 1], ['scorch', 'Scorch', 0, 1], ['fire', 'Embers and fire', 0, 1]] },
  { path: 'status.corrupted', label: 'Corrupted', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['ash', 'Ash tone', 0, 1], ['veins', 'Veins', 0, 1], ['glow', 'Magic glow', 0, 1]] },
  { path: 'status.crystalline', label: 'Crystalline', params: [['blend', 'Edge blend', 0, 0.4], ['noise', 'Edge noise', 0, 0.3], ['density', 'Crystal density', 0, 1], ['size', 'Crystal size', 0, 1], ['strength', 'Strength', 0, 1]] },
  { path: 'objects', label: 'Objects', params: [['frozen', 'Frozen', 0, 1], ['corrupted', 'Corrupted', 0, 1], ['crystalline', 'Crystalline', 0, 1], ['burning', 'Burning', 0, 1]] },
] as const;
export const TERRAIN_TUNING = { STEPS: 40, PANEL_MAX_HEIGHT_VH: 44 } as const;

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
