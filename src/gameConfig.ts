/**
 * Centralized game configuration for Volcanae.
 * All balanceable constants should be defined here.
 * Do not hardcode these values elsewhere - always import from this file.
 */

// ============================================================================
// MAP CONFIGURATION
// ============================================================================

export const MAP = {
  /** Width of the game grid in cells */
  GRID_WIDTH: 7,
  /** Total height of the grid (35 playable + 5 lava buffer rows at the bottom) */
  GRID_HEIGHT: 40,
  /** Number of zones on the map */
  ZONE_COUNT: 5,
  /** Number of rows per zone */
  ZONE_HEIGHT: 7,
  /** Number of lava buffer rows at the bottom of the map */
  LAVA_BUFFER_ROWS: 5,
} as const;

// ============================================================================
// LAVA CONFIGURATION
// ============================================================================

export const LAVA = {
  /** Lava advances 1 row every N player turns */
  LAVA_ADVANCE_INTERVAL: 2,
} as const;

// ============================================================================
// UNIT CONFIGURATION (standard unit defaults)
// ============================================================================

export const UNITS = {
  /** Default maximum HP for units */
  UNIT_MAX_HP: 100,
  /** Default attack power for units */
  UNIT_ATTACK: 50,
  /** Default defense value for units */
  UNIT_DEFENSE: 50,
  /** Number of movement actions per turn */
  UNIT_MOVEMENT_ACTIONS: 1,
  /** Movement range in cells */
  UNIT_MOVE_RANGE: 2,
  /** Attack range (manhattan distance) */
  UNIT_ATTACK_RANGE: 1,
  /** Vision range (manhattan distance) */
  UNIT_VISION_RANGE: 5,
  /** Trigger range for enemy units only (manhattan distance) */
  UNIT_TRIGGER_RANGE: 5,
} as const;

// ============================================================================
// BUILDING CONFIGURATION
// ============================================================================

export const BUILDINGS = {
  /** Vision range for buildings (manhattan distance) */
  BUILDING_VISION_RANGE: 5,
  /** Number of turns required to capture a building */
  BUILDING_CAPTURE_TURNS: 1,
  /** Number of turns specialist assignment is disabled after use */
  SPECIALIST_ASSIGN_DISABLE_TURNS: 1,
  /** Probability of spawning a WATCHTOWER in each zone (0.0 to 1.0) */
  WATCHTOWER_SPAWN_CHANCE: 0.5,
} as const;

// ============================================================================
// RESOURCE CONFIGURATION
// ============================================================================

export const RESOURCES = {
  /** Iron produced per turn by a mine */
  MINE_IRON_PER_TURN: 1,
  /** Wood produced per turn by a woodcutter */
  WOODCUTTER_WOOD_PER_TURN: 1,
} as const;

// ============================================================================
// ENEMY CONFIGURATION
// ============================================================================

export const ENEMY = {
  /** Maximum distance from lava for boost calculation */
  MAX_LAVA_BOOST_DISTANCE: 20,
  /** Maximum multiplier for lava proximity boost */
  MAX_LAVA_BOOST_MULTIPLIER: 0.5,
  /** Base enemy spawn count per building */
  ENEMY_SPAWN_PER_BUILDING_BASE: 1,
  /** Bonus enemy spawn per 3 threat levels */
  ENEMY_THREAT_SPAWN_BONUS: 1,
} as const;

// ============================================================================
// UNIT COST CONFIGURATION
// ============================================================================

export interface UnitCost {
  iron: number;
  wood: number;
}

export const UNIT_COSTS: Record<string, UnitCost> = {
  INFANTRY: { iron: 2, wood: 1 },
  ARCHER: { iron: 1, wood: 2 },
  RIDER: { iron: 3, wood: 1 },
  SIEGE: { iron: 3, wood: 3 },
} as const;

// ============================================================================
// RENDERING CONFIGURATION
// ============================================================================

export const RENDER = {
  /** Tile size on desktop in pixels */
  TILE_SIZE_DESKTOP: 80,
  /** Tile size on mobile in pixels */
  TILE_SIZE_MOBILE: 64,
  /** Mobile breakpoint in pixels */
  MOBILE_BREAKPOINT: 768,
  /** Colors for tile rendering */
  COLORS: {
    UNREVEALED: '#b0b0b0',
    GRASS: '#4a8c3f',
    LAVA: '#e25822',
    FOG_OVERLAY: 'rgba(0, 0, 0, 0.45)',
    LAVA_PREVIEW_OVERLAY: 'rgba(226, 88, 34, 0.35)',
    BUILDING_PLAYER: '#3a7bd5',
    BUILDING_ENEMY: '#c0392b',
    BUILDING_NEUTRAL: '#4a8c3f',
    REACHABLE_OVERLAY: 'rgba(58, 123, 213, 0.35)',
    ATTACKABLE_OVERLAY: 'rgba(192, 57, 43, 0.35)',
    HP_GREEN: '#2ecc71',
    HP_RED: '#e74c3c',
    LAVA_BOOST_BAR: '#e67e22',
  },
  /** Camera smooth animation duration in ms */
  CAMERA_ANIMATION_MS: 400,
} as const;

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Full game configuration object combining all config sections.
 */
export const GAME_CONFIG = {
  MAP,
  LAVA,
  UNITS,
  BUILDINGS,
  RESOURCES,
  ENEMY,
  UNIT_COSTS,
  RENDER,
} as const;

export default GAME_CONFIG;
