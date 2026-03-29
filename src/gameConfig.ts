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
  LAVA_ADVANCE_INTERVAL: 3,
} as const;

// ============================================================================
// UNIT CONFIGURATION (standard unit defaults)
// ============================================================================

export const UNITS = {
  INFANTRY: {
    maxHp: 100,
    attack: 50,
    defense: 50,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
  },

  ARCHER: {
    maxHp: 100,
    attack: 45,
    defense: 20,
    movementActions: 1,
    moveRange: 1,
    attackRange: 2,
    discoverRadius: 1,
    triggerRange: 0,
  },

  RIDER: {
    maxHp: 100,
    attack: 65,
    defense: 40,
    movementActions: 1,
    moveRange: 2,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
  },

  SIEGE: {
    maxHp: 100,
    attack: 65,
    defense: 0,
    movementActions: 1,
    moveRange: 1,
    attackRange: 3,
    discoverRadius: 1,
    triggerRange: 0,
  },

  LAVA_GRUNT: {
    maxHp: 100,
    attack: 50,
    defense: 50,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
  },

  LAVA_ARCHER: {
    maxHp: 100,
    attack: 45,
    defense: 20,
    movementActions: 1,
    moveRange: 1,
    attackRange: 2,
    discoverRadius: 1,
    triggerRange: 3,
  },

  LAVA_RIDER: {
    maxHp: 100,
    attack: 65,
    defense: 40,
    movementActions: 1,
    moveRange: 2,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 3,
  },

  LAVA_SIEGE: {
    maxHp: 100,
    attack: 65,
    defense: 0,
    movementActions: 1,
    moveRange: 1,
    attackRange: 3,
    discoverRadius: 1,
    triggerRange: 4,
  },
} as const;

// ============================================================================
// BUILDING CONFIGURATION
// ============================================================================

export const BUILDINGS = {
  /** Number of turns required to capture a building */
  BUILDING_CAPTURE_TURNS: 1,
  /** Number of turns specialist assignment is disabled after use */
  SPECIALIST_ASSIGN_DISABLE_TURNS: 1,
  /** Probability of spawning a WATCHTOWER in each zone (0.0 to 1.0) */
  WATCHTOWER_SPAWN_CHANCE: 0.5,
  /** Discover radius per building type (balanceable) */
  DISCOVER_RADIUS: {
    STRONGHOLD: 2,
    MINE: 2,
    WOODCUTTER: 2,
    BARRACKS: 2,
    ARCHER_CAMP: 2,
    RIDER_CAMP: 2,
    SIEGE_CAMP: 2,
    WATCHTOWER: 4,
  },
  /** Watchtower combat configuration */
  WATCHTOWER_STATS: {
    maxHp: 150,
    attack: 50,
    defense: 75,
    attackRange: 3,
  },
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
  /** Base probability (0.0–1.0) of spawning a unit per recruitment building per turn when no player unit is in discover radius and threat is 0 */
  BASE_SPAWN_PROBABILITY: 0.10,
  /** Maximum additional probability granted at max threat (0.0–1.0) */
  MAX_THREAT_BONUS: 0.60,
  /** Threat level at which the full MAX_THREAT_BONUS is reached */
  MAX_THREAT: 10,
} as const;

// ============================================================================
// AI SCORING CONFIGURATION
// ============================================================================

export const AI_SCORING = {
  // Base scores per action type
  BASE_INTERCEPT_CAPTOR: 90,
  BASE_CAPTURE_BUILDING: 85,
  BASE_CONTEST_BUILDING: 80,
  BASE_ATTACK_UNIT: 70,
  BASE_RANGED_ATTACK_UNIT: 65,
  BASE_RETAKE_BUILDING: 65,
  BASE_PROTECT_SPAWNER: 58,
  BASE_PUSH_TO_STRONGHOLD: 52,
  BASE_DEFEND_ENEMY_BUILDING: 48,
  BASE_MOVE_TO_PLAYER_BUILDING: 42,
  BASE_MOVE_TO_NEUTRAL_BUILDING: 38,
  BASE_MOVE_TO_UNIT: 32,
  BASE_ADVANCE_WITH_LAVA: 28,
  BASE_PUSH_TO_ZONE_EDGE: 25,
  BASE_FLANK_UNIT: 20,
  BASE_ADVANCE_SOUTH: 18,
  BASE_SACRIFICE_TO_LAVA: 12,
  BASE_HOLD_POSITION: 3,

  // Distance
  DISTANCE_PENALTY_PER_TILE: 6,

  // Combat outcome modifiers
  KILL_BONUS: 50,
  DEATH_RISK_PENALTY: 20,
  LOW_HP_RISK_FACTOR: 0.5,
  LOW_HP_THRESHOLD: 0.25,

  // Building strategic value multipliers
  BUILDING_VALUE_STRONGHOLD: 2.0,
  BUILDING_VALUE_SPAWNER: 1.6,
  BUILDING_VALUE_RESOURCE: 1.2,
  BUILDING_VALUE_DEFAULT: 1.0,
  BUILDING_VALUE_WATCHTOWER: 2.0,

  // Saturation
  SATURATION_PENALTY_PER_ALLY: 10,

  // Context bonuses
  BONUS_PLAYER_ON_BUILDING: 35,
  BONUS_PLAYER_CAPTURING: 40,
  BONUS_UNDEFENDED_BUILDING: 25,
  BONUS_RECENT_LOSS: 25,
  RECENTLY_LOST_WINDOW_TURNS: 4,
  BONUS_RANGED_SAFE_ATTACK: 25,

  // Lava-specific
  BONUS_LAVA_BOOST_AGGRESSION: 25,
  BONUS_SACRIFICE_PER_THREAT_BELOW_5: 3,
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
  SIEGE: { iron: 2, wood: 3 },
} as const;

// ============================================================================
// ANIMATION CONFIGURATION
// ============================================================================

export const ANIMATION = {
  /** Time for viewport to pan to a new target position */
  CAMERA_MOVE_DURATION_MS: 350,
  /** Pause after camera arrives, before action executes */
  PRE_ACTION_IDLE_MS: 150,
  /** Pause after action resolves, before moving to next event */
  POST_ACTION_IDLE_MS: 250,
  /** Longer pause for lava advance — more dramatic weight */
  LAVA_ADVANCE_PAUSE_MS: 700,
  /** Pause after a unit spawns before moving to next event */
  SPAWN_PAUSE_MS: 300,
  /** Melee lunge out + snap back total duration (ms) */
  MELEE_LUNGE_DURATION_MS: 260,
  /** Ranged projectile travel time per tile (ms) */
  RANGED_PROJECTILE_MS_PER_TILE: 80,
  /** Minimum ranged projectile travel time (ms) */
  RANGED_PROJECTILE_MIN_MS: 200,
  /** Maximum ranged projectile travel time (ms) */
  RANGED_PROJECTILE_MAX_MS: 700,
  /** Ranged attacker recoil duration (ms) */
  RANGED_RECOIL_DURATION_MS: 180,
  /** Hit shake duration (ms) */
  HIT_SHAKE_DURATION_MS: 280,
  /** Die skull-flash duration (ms) */
  DIE_FLASH_DURATION_MS: 450,
  /** Die fade-out duration (ms) */
  DIE_FADE_DURATION_MS: 200,
} as const;

// ============================================================================
// UI CONFIGURATION
// ============================================================================

export const UI = {
  /** Total lifetime of a damage number before removal */
  DAMAGE_FLOAT_DURATION_MS: 2500,
  /** How far upward the number floats (half a tile height) */
  DAMAGE_FLOAT_RISE_PX: 20,
  /** Duration of the bounce animation on the capture-ready indicator */
  CAPTURE_INDICATOR_BOUNCE_DURATION_MS: 700,
  /** How long the turn label is fully visible before fading out */
  TURN_POPUP_DISPLAY_MS: 2000,
  /** Duration of the turn popup fade-out */
  TURN_POPUP_FADE_MS: 400,
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
  /** Opacity of a unit graphic when it has no actions remaining (0.0–1.0) */
  UNIT_EXHAUSTED_OPACITY: 0.5,
  /** Colors for tile rendering */
  COLORS: {
    UNREVEALED: '#d8d8d8',
    GRASS: '#4a8c3f',
    LAVA: '#e25822',
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
  AI_SCORING,
  UNIT_COSTS,
  ANIMATION,
  RENDER,
  UI,
} as const;

export default GAME_CONFIG;
