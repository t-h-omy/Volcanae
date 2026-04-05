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
 * - **Units**: 100×100 px PNG (fills the full tile at all zoom levels)
 * - **Buildings**: 100×100 px PNG (same as units)
 * - **Resource nodes**: 100×100 px PNG (same as units and buildings)
 * - All sprites: **transparent background** PNG
 */

import type { UnitType, BuildingType, TileType } from './types';

/** Maps every UnitType value to a sprite path (empty = missing). */
export const UNIT_SPRITE: Partial<Record<UnitType, string>> = {
  // Player units
  INFANTRY:    '/sprites/units/Spearman_100px.png',
  ARCHER:      '/sprites/units/Archer_100px.png',
  RIDER:       '/sprites/units/Rider_100px.png',
  SIEGE:       '/sprites/units/Catapult_100px.png',
  SCOUT:       '/sprites/units/Scout_100px.png',
  GUARD:       '/sprites/units/Guard_100px.png',
  // Enemy units
  LAVA_GRUNT:  '/sprites/units/Grunt_100px.png',
  LAVA_ARCHER: '/sprites/units/Spitter_100px.png',
  LAVA_RIDER:  '/sprites/units/Blazard_100px.png',
  LAVA_SIEGE:  '/sprites/units/Hurler_100px.png',
  EMBERLING:   '/sprites/units/Emberling_100px.png',
};

/** Maps every BuildingType value to a sprite path (empty = missing). */
export const BUILDING_SPRITE: Partial<Record<BuildingType, string>> = {
  STRONGHOLD:      '', // no sprite yet
  MINE:            '/sprites/buildings/mine_100px.png',
  WOODCUTTER:      '/sprites/buildings/woodcutter_100px.png',
  BARRACKS:        '/sprites/buildings/barracks_100px.png',
  ARCHER_CAMP:     '/sprites/buildings/archer_camp_100px.png',
  RIDER_CAMP:      '/sprites/buildings/horse%20camp_100px.png',
  SIEGE_CAMP:      '/sprites/buildings/siege_workshop_100px.png',
  WATCHTOWER:      '/sprites/buildings/watch_tower_100px.png',
  LAVALAIR:        '/sprites/buildings/lava_lair_100px.png',
  INFERNALSANCTUM: '/sprites/buildings/infernal_sanctum_100px.png',
  FARM:            '/sprites/buildings/farm_100px.png',
  PATRICIANHOUSE:  '', // no sprite yet
  MAGMASPYR:       '/sprites/buildings/magma_spyr_100px.png',
  EMBERNEST:       '/sprites/buildings/ember_nest_100px.png',
};

/**
 * Enemy-faction overrides for building sprites.
 * Only entries listed here override BUILDING_SPRITE when building.faction === ENEMY.
 * Keys and empty-string rules are identical to BUILDING_SPRITE.
 */
export const ENEMY_BUILDING_SPRITE: Partial<Record<BuildingType, string>> = {
  WATCHTOWER: '/sprites/buildings/watch_tower_enemy_100px.png',
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
  MINE:      '/sprites/resources/resource_mine_100px.png',
  WOODCUTTER: '/sprites/resources/ressource_forest_100px.PNG',
};

/** Maps every TileType value plus special keys to a sprite path (empty = missing). */
export const TILE_SPRITE: Partial<Record<TileType | 'lava' | 'unrevealed' | 'ruin' | 'strongholdRuin', string>> = {
  EMPTY:        '/sprites/tiles/terrain_grass_100px.png',
  PLAINS:       '/sprites/tiles/terrain_grass_100px.png',
  FOREST:       '', // no sprite yet
  MOUNTAIN:     '', // no sprite yet
  lava:         '/sprites/tiles/terrain_lava_100px.png',
  unrevealed:   '/sprites/tiles/terrain_undiscovered_100px.png',
  ruin:         '/sprites/buildings/ruin_standard_100px.png',
  strongholdRuin: '/sprites/buildings/ruin_stronghold_100px.png',
};
