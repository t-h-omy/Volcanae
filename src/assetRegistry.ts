/**
 * Asset Registry — the single file to edit when adding or replacing sprites.
 *
 * ## How to add a new sprite
 * 1. Place the PNG file in `public/sprites/<category>/`.
 * 2. Set the corresponding path below (e.g. `'/sprites/units/infantry.png'`).
 * 3. An **empty string** means "no sprite yet" — the pink missing-sprite
 *    placeholder will be shown in-game until a real path is provided.
 *
 * ## Required sprite sizes
 * - **Ground tiles**: 100×100 px PNG (covers desktop max zoom of 1.25 × 80 = 100 px;
 *   mobile tiles are smaller so 100 px is sufficient for both)
 * - **Units**: 80×80 px PNG (max effective size: 100 px tile × 0.8 = 80 px)
 * - **Buildings**: 80×80 px PNG (same as units)
 * - All sprites: **transparent background** PNG
 */

import type { UnitType, BuildingType, TileType } from './types';

/** Maps every UnitType value to a sprite path (empty = missing). */
export const UNIT_SPRITE: Partial<Record<UnitType, string>> = {
  INFANTRY: '',
  ARCHER: '',
  RIDER: '',
  SIEGE: '',
  SCOUT: '',
  GUARD: '',
  LAVA_GRUNT: '',
  LAVA_ARCHER: '',
  LAVA_RIDER: '',
  LAVA_SIEGE: '',
  EMBERLING: '',
};

/** Maps every BuildingType value to a sprite path (empty = missing). */
export const BUILDING_SPRITE: Partial<Record<BuildingType, string>> = {
  STRONGHOLD: '',
  MINE: '',
  WOODCUTTER: '',
  BARRACKS: '',
  ARCHER_CAMP: '',
  RIDER_CAMP: '',
  SIEGE_CAMP: '',
  WATCHTOWER: '',
  LAVALAIR: '',
  INFERNALSANCTUM: '',
  FARM: '',
  PATRICIANHOUSE: '',
  MAGMASPYR: '',
  EMBERNEST: '',
};

/**
 * Resource node sprites — shown when a building exists on a tile but is
 * faction-neutral (i.e. an unclaimed resource node like a forest or mine).
 * When a player or enemy claims the tile, BUILDING_SPRITE takes over.
 * When the building is destroyed, no building layer is shown.
 *
 * Keys are the BuildingType values that represent capturable resource nodes.
 * Empty string = no sprite yet → pink MissingSprite placeholder.
 */
export const RESOURCE_SPRITE: Partial<Record<BuildingType, string>> = {
  MINE: '',
  WOODCUTTER: '',
};

/** Maps every TileType value plus special keys to a sprite path (empty = missing). */
export const TILE_SPRITE: Partial<Record<TileType | 'lava' | 'unrevealed' | 'ruin', string>> = {
  EMPTY: '',
  PLAINS: '',
  FOREST: '',
  MOUNTAIN: '',
  lava: '',
  unrevealed: '',
  ruin: '',
};
