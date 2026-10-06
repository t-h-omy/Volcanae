/**
 * Tile status whitelist, burning-tile damage, corruption-suppressed tags,
 * and parameters for localized terrain-tag tooltips.
 */

import { TileType, TileStatus, TerrainTag, UnitTag } from '../src/types';


/**
 * Defines which tile statuses are allowed on which terrain.
 * Status application that is not whitelisted will only CLEAR existing statuses
 * but NOT set the new status.
 *
 * IMPORTANT: This whitelist is checked against `tile.terrainType` (the underlying
 * terrain), NOT the visual objects on the tile (Mountain, Forest, Ruin, Building).
 * For example, a PLAINS tile with a Mountain object on it has terrainType PLAINS
 * and may receive any status that PLAINS allows.
 *
 * FOREST and MOUNTAIN entries allow CORRUPTED (Magma Spyr) and FROZEN (Frostcraft -
 * resource buildings such as WOODCUTTER on FOREST and MINE on MOUNTAIN must be
 * targetable by Frostcraft).
 */
export const TILE_STATUS_WHITELIST: Record<TileType, TileStatus[]> = {
  /** All three statuses apply to PLAINS terrain. */
  [TileType.PLAINS]: [TileStatus.CORRUPTED, TileStatus.FROZEN, TileStatus.BURNING],
  /** WATER cannot BURN (water is non-combustible by design). CORRUPTED and FROZEN are valid. */
  [TileType.WATER]: [TileStatus.CORRUPTED, TileStatus.FROZEN],
  [TileType.CANYON]: [],
  [TileType.EMPTY]: [],
  /** CORRUPTED allowed (Magma Spyr). FROZEN allowed (WOODCUTTER resource building on FOREST must be targetable by Frostcraft). */
  [TileType.FOREST]: [TileStatus.CORRUPTED, TileStatus.FROZEN],
  /** CORRUPTED allowed (Magma Spyr). FROZEN allowed (MINE resource building on MOUNTAIN must be targetable by Frostcraft). */
  [TileType.MOUNTAIN]: [TileStatus.CORRUPTED, TileStatus.FROZEN],
};

/** Damage dealt to each non-LAVA, non-FLYING, non-CINDERBORN unit on a BURNING tile at end of turn. */
export const BURNING_TILE_DAMAGE = 10;

/**
 * Tags that are suppressed (i.e. have no effect) when a player unit stands on
 * a CORRUPTED tile. Used by the combat system to skip those abilities and by the
 * HUD to visually mark them as inactive.
 */
export const CORRUPTED_SUPPRESSED_TAGS = new Set<UnitTag>([
  UnitTag.LANCE_CHARGE,
  UnitTag.ASSASSIN,
  UnitTag.RAGE,
  UnitTag.PUNCTURE,
  UnitTag.PIERCE,
  UnitTag.BLOODLUST,
  UnitTag.DISTRACTION,
  UnitTag.PIN_DOWN,
  UnitTag.CLEAVE,
  UnitTag.SPLASH,
  UnitTag.BATTERY,
  UnitTag.BURN,
  UnitTag.PHALANX,
  UnitTag.PATCHUP,
  UnitTag.PREVENTIVE_STRIKE,
]);


/**
 * Text parameters for localized terrain-tag tooltips in the tile-info panel.
 */
export const TERRAIN_TAG_INFO: Record<TerrainTag, { textParams?: { [name: string]: number } }> = {
  [TerrainTag.CORRUPTED]: {},
  [TerrainTag.FROZEN]: {},
  [TerrainTag.BURNING]: { textParams: { damage: BURNING_TILE_DAMAGE } },
};
