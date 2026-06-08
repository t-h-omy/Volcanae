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

import type { UnitType, BuildingType, TileType, TileStatus } from './types';
import { TileType as TT, TileStatus as TS } from './types';

/**
 * Prepend the Vite public base URL to every non-empty sprite path in a map.
 * This ensures sprites resolve correctly when deployed to a sub-path (e.g. /Volcanae/).
 */
function withBase<K extends string>(raw: Partial<Record<K, string>>): Partial<Record<K, string>> {
  const base = import.meta.env.BASE_URL;
  const result = {} as Partial<Record<K, string>>;
  for (const [key, val] of Object.entries(raw) as [K, string | undefined][]) {
    result[key] = typeof val === 'string' && val !== ''
      ? `${base}${val.replace(/^\//, '')}`
      : val ?? '';
  }
  return result;
}

/** Maps every UnitType value to a sprite path (empty = missing). */
export const UNIT_SPRITE: Partial<Record<UnitType, string>> = withBase({
  // Player units
  SPEARMAN:    '/sprites/units/Spearman_100px.png',
  SWORDSMAN:   '/sprites/units/Swordsman_100px.png',
  ARCHER:      '/sprites/units/Archer_100px.png',
  RIDER:       '/sprites/units/Rider_100px.png',
  SIEGE:       '/sprites/units/Catapult_100px.png',
  SCOUT:       '/sprites/units/Scout_100px.png',
  GUARD:       '/sprites/units/Guard_100px.png',
  MAGE:        '/sprites/units/Mage_100px.png',
  EMBER_DEMON: '/sprites/units/Ember_Demon_Player_100px.png',
  SKELETON:    '/sprites/units/Skeleton_100px.png',
  // Enemy units
  LAVA_GRUNT:   '/sprites/units/Grunt_100px.png',
  LAVA_ARCHER:  '/sprites/units/Spitter_100px.png',
  LAVA_RIDER:   '/sprites/units/Blazard_100px.png',
  LAVA_SIEGE:   '/sprites/units/Hurler_100px.png',
  REAPER:    '/sprites/units/Reaper_100px.png',
  LANCER:    '/sprites/units/Lancer_100px.png',
  BULLWARK:  '/sprites/units/Bullwark_100px.png',
  KINDLER:   '/sprites/units/Kindler_100px.png',
  GRIMBEAK:  '/sprites/units/Grimbeak_100px.png',
  RIFTWORM:  '/sprites/units/Riftworm_100px.png',
  RIFT_LORD: '/sprites/units/RiftLord_100px.png',
  EMBERLING:    '/sprites/units/Emberling_100px.png',
  CAVE_MONSTER: '/sprites/units/Cave_Monster_100px.png',
  CRYSTAL_DRAKE: '/sprites/units/Crystal_Dragon_100px.png',
});

/**
 * Player-faction overrides for unit sprites.
 * Only entries listed here override UNIT_SPRITE when unit.faction === PLAYER.
 */
export const PLAYER_UNIT_SPRITE: Partial<Record<UnitType, string>> = withBase({
  EMBER_DEMON: '/sprites/units/Ember_Demon_Player_100px.png',
});

/**
 * Enemy-faction overrides for unit sprites.
 * Only entries listed here override UNIT_SPRITE when unit.faction === ENEMY.
 */
export const ENEMY_UNIT_SPRITE: Partial<Record<UnitType, string>> = withBase({
  EMBER_DEMON: '/sprites/units/Ember_Demon_Enemy.png',
});

/** Maps every BuildingType value to a sprite path (empty = missing). */
export const BUILDING_SPRITE: Partial<Record<BuildingType, string>> = withBase({
  STRONGHOLD:      '/sprites/buildings/stronghold_100px.png',
  MINE:            '/sprites/buildings/mine_100px.png',
  WOODCUTTER:      '/sprites/buildings/woodcutter_100px.png',
  BARRACKS:        '/sprites/buildings/barracks_100px.png',
  ARCHER_CAMP:     '/sprites/buildings/archer_camp_100px.png',
  RIDER_CAMP:      '/sprites/buildings/horse%20camp_100px.png',
  SIEGE_CAMP:      '/sprites/buildings/siege_workshop_100px.png',
  WATCHTOWER:      '/sprites/buildings/watch_tower_100px.png',
  OUTPOST:         '/sprites/buildings/outpost_100px.png',
  LAVALAIR:        '/sprites/buildings/lava_lair_100px.png',
  INFERNALSANCTUM: '/sprites/buildings/infernal_sanctum_100px.png',
  FARM:            '/sprites/buildings/farm_100px.png',
  PATRICIANHOUSE:  '/sprites/buildings/patrician_house_100px.png',
  MAGMASPYR:       '/sprites/buildings/magma_spyr_100px.png',
  EMBERNEST:       '/sprites/buildings/ember_nest_100px.png',
  CRYSTAL_CHAMBER: '/sprites/buildings/crystal_chamber_100px.png',
  GRAVESTONE:      '/sprites/buildings/gravestone_100px.png',
  // TODO: replace GRAVE_TRAP and CRYSTAL_TOWER with real art when available
  GRAVE_TRAP:      '/sprites/buildings/grave_trap_100px.png',
  CRYSTAL_TOWER:   '/sprites/buildings/crystal_tower_100px.png',
  CRYSTAL_CAVE:    '/sprites/buildings/crystal_cave_100px.png',
  CHARCOAL_KILN:   '/sprites/buildings/charcoal_kiln_100px.png',
});

/**
 * Sprite path for the active (resonating) Crystal Chamber.
 * Exported separately because active/inactive variants share the same BuildingType key.
 * Point this at the real PNG once the asset is ready; an empty string shows the
 * pink MissingSprite placeholder in the meantime.
 */
export const CRYSTAL_CHAMBER_ACTIVE_SPRITE = withBase({
  active: '/sprites/buildings/crystal_chamber_active_100px.png',
}).active ?? '';

/**
 * Sprite path for the active (resonating) Crystal Cave.
 */
export const CRYSTAL_CAVE_ACTIVE_SPRITE = withBase({
  active: '/sprites/buildings/crystal_cave_active_100px.png',
}).active ?? '';

/**
 * Player-faction overrides for building sprites.
 * Only entries listed here override BUILDING_SPRITE when building.faction === PLAYER.
 * Keys and empty-string rules are identical to BUILDING_SPRITE.
 */
export const PLAYER_BUILDING_SPRITE: Partial<Record<BuildingType, string>> = withBase({
  WATCHTOWER: '/sprites/buildings/watch_tower_player_100px.png',
});

/**
 * Enemy-faction overrides for building sprites.
 * Only entries listed here override BUILDING_SPRITE when building.faction === ENEMY.
 * Keys and empty-string rules are identical to BUILDING_SPRITE.
 */
export const ENEMY_BUILDING_SPRITE: Partial<Record<BuildingType, string>> = withBase({
  WATCHTOWER: '/sprites/buildings/watch_tower_enemy_100px.png',
});

/**
 * Resource node sprites — shown when a building exists on a tile but is
 * faction-neutral (i.e. an unclaimed resource node like a forest or mine).
 * When a player or enemy claims the tile, BUILDING_SPRITE takes over.
 * When the building is destroyed, no building layer is shown.
 *
 * Keys are the BuildingType values that represent capturable resource nodes.
 * Empty string = no sprite yet → pink MissingSprite placeholder.
 */
export const RESOURCE_SPRITE: Partial<Record<BuildingType, string>> = withBase({
  MINE:      '/sprites/resources/resource_mine_100px.png',
  WOODCUTTER: '/sprites/resources/ressource_forest_100px.PNG',
});

/**
 * Terrain resource overlay sprites — shown on top of the base grass tile when
 * the terrain type is a resource (FOREST / MOUNTAIN) and no building has been
 * constructed yet.  Once a player builds a WOODCUTTER or MINE, the building
 * sprite takes over; these are only the "natural" overlays.
 */
export const TERRAIN_RESOURCE_SPRITE: Partial<Record<TileType, string>> = withBase({
  FOREST:   '/sprites/resources/ressource_forest_100px.PNG',
  MOUNTAIN: '/sprites/resources/resource_mine_100px.png',
});

/** Maps every TileType value plus special keys to a sprite path (empty = missing). */
export const TILE_SPRITE: Partial<Record<TileType | 'lava' | 'unrevealed' | 'ruin' | 'strongholdRuin', string>> = withBase({
  EMPTY:        '/sprites/tiles/terrain_grass_100px.png',
  PLAINS:       '/sprites/tiles/terrain_grass_100px.png',
  FOREST:       '/sprites/tiles/terrain_grass_100px.png',
  MOUNTAIN:     '/sprites/tiles/terrain_grass_100px.png',
  CANYON:       '/sprites/tiles/terrain_canyon_100px.png',
  WATER:        '/sprites/tiles/terrain_water_100px.png',
  lava:         '/sprites/tiles/terrain_lava_100px.png',
  unrevealed:   '/sprites/tiles/terrain_undiscovered_100px.png',
  ruin:         '/sprites/buildings/ruin_standard_100px.png',
  strongholdRuin: '/sprites/buildings/ruin_stronghold_100px.png',
});

/**
 * Status-specific terrain sprites.
 * When a tile has an active TileStatus and a sprite exists for that
 * terrain+status combination, this sprite replaces the base TILE_SPRITE.
 * Terrains not listed here fall back to the base terrain sprite + CSS overlay.
 */
export const TILE_STATUS_SPRITE: Partial<Record<TileType, Partial<Record<TileStatus, string>>>> = {
  [TT.PLAINS]: withBase({
    [TS.FROZEN]:    '/sprites/tiles/terrain_grass_frozen_100px.png',
    [TS.BURNING]:   '/sprites/tiles/terrain_grass_burning_100px.png',
    [TS.CORRUPTED]: '/sprites/tiles/terrain_grass_corrupted_100px.png',
  }),
  [TT.FOREST]: withBase({
    [TS.CORRUPTED]: '/sprites/tiles/terrain_grass_corrupted_100px.png',
  }),
  [TT.MOUNTAIN]: withBase({
    [TS.CORRUPTED]: '/sprites/tiles/terrain_grass_corrupted_100px.png',
  }),
  [TT.WATER]: withBase({
    [TS.FROZEN]:    '/sprites/tiles/terrain_water__frozen_100px.png',
    [TS.CORRUPTED]: '/sprites/tiles/terrain_water_corrupted_100px.png',
  }),
};

/**
 * Sprite path for the ice overlay rendered on top of frozen WATER tiles.
 * TODO: Replace empty string with a real ice overlay PNG once art is available.
 */
export const ICE_OVERLAY_SPRITE = withBase({ ice: '' }).ice ?? '';

/**
 * Sprite path for the tunnel hole overlay.
 * Rendered on `tunnelStartPosition` while a TUNNEL unit is DIGGING_IN or UNDERGROUND.
 */
export const TUNNEL_HOLE_SPRITE = withBase({ hole: '/sprites/buildings/riftworm_tunnel_100px.png' }).hole ?? '';

/**
 * Sprite path for the earthquake / emergence warning indicator.
 * Rendered on `tunnelPlannedEmergence` while a TUNNEL unit is in EMERGING state.
 * Empty string = pink MissingSprite placeholder until real art is ready.
 */
export const TUNNEL_EARTHQUAKE_SPRITE = withBase({ earthquake: '' }).earthquake ?? '';

/**
 * Sprite path for a portal entrance tile overlay.
 * Rendered on the entrance tile while a portal is active.
 * Empty string = pink MissingSprite placeholder until real art is ready.
 */
export const PORTAL_ENTRANCE_SPRITE = withBase({ portal_entrance: '' }).portal_entrance ?? '';

/**
 * Sprite path for a portal exit tile overlay.
 * Rendered on the exit tile while a portal is active.
 * Empty string = pink MissingSprite placeholder until real art is ready.
 */
export const PORTAL_EXIT_SPRITE = withBase({ portal_exit: '' }).portal_exit ?? '';
