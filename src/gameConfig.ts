/**
 * Centralized game configuration for Volcanae.
 * All balanceable constants should be defined here.
 * Do not hardcode these values elsewhere - always import from this file.
 */

import type { UnitPopulationCost } from './types';

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

  SCOUT: {
    maxHp: 60,
    attack: 20,
    defense: 15,
    movementActions: 1,
    moveRange: 2,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
  },

  GUARD: {
    maxHp: 100,
    attack: 15,
    defense: 65,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
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

  EMBERLING: {
    maxHp: 40,
    attack: 15,
    defense: 10,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
    explosionDamage: 40,
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
    LAVALAIR: 0,
    INFERNALSANCTUM: 0,
    FARM: 0,
    PATRICIANHOUSE: 0,
    MAGMASPYR: 0,
    EMBERNEST: 0,
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
// LAVA LAIR / CORRUPTION BUILDING CONFIGURATION
// ============================================================================

export const LAVA_LAIR = {
  /** Combat stats for MAGMA_SPYR buildings (created on corrupted MOUNTAIN tiles) */
  MAGMA_SPYR_STATS: {
    maxHp: 120,
    attack: 40,
    defense: 60,
    attackRange: 2,
    maxAttacksPerTurn: 2,
  },
  /** Number of turns between EMBER_NEST Emberling spawns */
  EMBER_NEST_SPAWN_INTERVAL: 3,
  /** Maximum number of EMBERLINGs allowed near an EMBER_NEST (within 8 tiles) */
  EMBER_NEST_MAX_EMBERLINGS: 2,
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
  // ── Base scores per action type ──────────────────────────────────────────
  // Each BASE_* value is the starting score for that action before any
  // distance penalties, context bonuses, or multipliers are applied.
  // Higher values make the AI prioritise that action over lower-valued ones.

  /** Move into melee range of a player unit that is currently capturing a building, to stop it */
  BASE_INTERCEPT_CAPTOR: 90,
  /** Walk onto an unoccupied neutral or player building to begin capturing it */
  BASE_CAPTURE_BUILDING: 85,
  /** Move to a building already occupied by a player unit to disrupt their capture attempt */
  BASE_CONTEST_BUILDING: 80,
  /** Perform a melee attack against an adjacent player unit */
  BASE_ATTACK_UNIT: 70,
  /** Perform a melee attack against an adjacent player-owned building */
  BASE_ATTACK_BUILDING: 68,
  /** Perform a ranged attack against a player-owned building from a safe distance */
  BASE_RANGED_ATTACK_BUILDING: 66,
  /** Perform a ranged attack against a player unit from outside melee range */
  BASE_RANGED_ATTACK_UNIT: 65,
  /** Move towards a building that was previously enemy-owned but recently captured by the player */
  BASE_RETAKE_BUILDING: 65,
  /** Move towards a friendly LAVA_LAIR or INFERNAL_SANCTUM to keep it defended */
  BASE_PROTECT_SPAWNER: 58,
  /** Move towards the player's starting stronghold (zone 1) to apply pressure */
  BASE_PUSH_TO_STRONGHOLD: 52,
  /** Move to or hold position near a friendly enemy-owned building to defend it */
  BASE_DEFEND_ENEMY_BUILDING: 48,
  /** Move towards a player-owned building that is not immediately contestable */
  BASE_MOVE_TO_PLAYER_BUILDING: 42,
  /** Move towards a neutral (unowned) building to eventually capture it */
  BASE_MOVE_TO_NEUTRAL_BUILDING: 38,
  /** Move towards the nearest player unit when no higher-priority target exists */
  BASE_MOVE_TO_UNIT: 32,
  /** Move southward alongside the advancing lava front to maintain pressure */
  BASE_ADVANCE_WITH_LAVA: 28,
  /** Move to the southern edge of the current zone to push into the next zone */
  BASE_PUSH_TO_ZONE_EDGE: 25,
  /** Move to a tile that puts the unit adjacent to a player unit's flank or rear */
  BASE_FLANK_UNIT: 20,
  /** Generic southward advance when no specific target is reachable */
  BASE_ADVANCE_SOUTH: 18,
  /** Voluntarily walk into lava to boost the threat level when no better action exists */
  BASE_SACRIFICE_TO_LAVA: 12,
  /** Stay in place; fallback when every other action scores 0 or is unavailable */
  BASE_HOLD_POSITION: 3,

  // ── Distance ─────────────────────────────────────────────────────────────

  /** Score subtracted for every tile of Manhattan distance between the unit and its target */
  DISTANCE_PENALTY_PER_TILE: 6,

  // ── Combat outcome modifiers ─────────────────────────────────────────────

  /** Bonus added to an attack score when the simulated hit would kill the defender */
  KILL_BONUS: 50,
  /** Penalty subtracted when the counterattack would leave the attacker dangerously low on HP */
  DEATH_RISK_PENALTY: 20,
  /** Fraction of DEATH_RISK_PENALTY applied when HP is low but not lethal (scales linearly) */
  LOW_HP_RISK_FACTOR: 0.5,
  /** HP fraction (0–1) below which the LOW_HP_RISK_FACTOR risk penalty begins to apply */
  LOW_HP_THRESHOLD: 0.25,

  // ── Building strategic value multipliers ─────────────────────────────────
  // Base building action scores are multiplied by the appropriate value below
  // so that the AI treats more important buildings as higher-priority targets.

  /** Multiplier applied to scores targeting a STRONGHOLD building */
  BUILDING_VALUE_STRONGHOLD: 2.0,
  /** Multiplier applied to scores targeting a LAVA_LAIR or INFERNAL_SANCTUM (enemy spawners) */
  BUILDING_VALUE_SPAWNER: 1.6,
  /** Multiplier applied to scores targeting a resource-producing building (MINE, WOODCUTTER) */
  BUILDING_VALUE_RESOURCE: 1.2,
  /** Multiplier applied to scores targeting any other building type not covered above */
  BUILDING_VALUE_DEFAULT: 1.0,
  /** Multiplier applied to scores targeting a WATCHTOWER */
  BUILDING_VALUE_WATCHTOWER: 2.5,

  // ── Saturation ───────────────────────────────────────────────────────────

  /** Score penalty deducted for each allied unit already targeting the same tile or building */
  SATURATION_PENALTY_PER_ALLY: 10,

  // ── Context bonuses ───────────────────────────────────────────────────────
  // These are flat bonuses added to a candidate's score when a specific
  // contextual condition is true.

  /** Bonus when a player unit is standing on the target building (easier to contest or attack) */
  BONUS_PLAYER_ON_BUILDING: 35,
  /** Extra bonus on top of BONUS_PLAYER_ON_BUILDING when that player unit is actively capturing */
  BONUS_PLAYER_CAPTURING: 40,
  /** Bonus when the target building has no allied units nearby defending it */
  BONUS_UNDEFENDED_BUILDING: 25,
  /** Bonus when the target building was recently recaptured from the enemy */
  BONUS_RECENT_LOSS: 25,
  /** Number of turns after a building is captured by the player that BONUS_RECENT_LOSS applies */
  RECENTLY_LOST_WINDOW_TURNS: 4,
  /** Bonus for a ranged attack where the attacker would not be in the defender's counter range */
  BONUS_RANGED_SAFE_ATTACK: 25,

  // ── Lava-specific ─────────────────────────────────────────────────────────

  /** Bonus to aggressive actions (attacks, captures) when a unit is close to the lava front */
  BONUS_LAVA_BOOST_AGGRESSION: 25,
  /** Per-point bonus to SACRIFICE_TO_LAVA for each threat level below 5 (encourages sacrifices at low threat) */
  BONUS_SACRIFICE_PER_THREAT_BELOW_5: 3,

  // ── Construction AI ───────────────────────────────────────────────────────

  /** Base score for a BUILD_AND_CAPTURE unit choosing to build a LAVA_LAIR on a ruin tile */
  BASE_BUILD_LAVA_LAIR: 55,
  /** Base score for a unit with the CORRUPT tag choosing to corrupt a FOREST or MOUNTAIN tile */
  BASE_CORRUPT_TERRAIN: 60,

  // ── Explosive / Sacrificial unit AI ──────────────────────────────────────
  // These scores are tag-gated and apply to any unit carrying the EXPLOSIVE or
  // SACRIFICIAL tag (e.g. EMBERLING). BASE values are the floor shared by all
  // such units; per-unit-type bonuses are added on top via
  // sacrificialLavaMoveBonus() in enemySystem.ts so individual unit types can
  // express a much stronger preference for self-destructive actions.

  /** Base score for an EXPLOSIVE unit to detonate when adjacent to one or more player units;
   *  only scored when the lava-advance simulation finds no valid path to the lava front */
  BASE_EXPLODE: 70,
  /** Base score for a SACRIFICIAL unit to move directly onto a lava tile (self-sacrifice) */
  BASE_MOVE_TO_LAVA: 40,
  /** Base score for a SACRIFICIAL unit to advance southward toward the lava front */
  BASE_SACRIFICIAL_ADVANCE: 20,
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
  SCOUT: { iron: 0, wood: 1 },
  GUARD: { iron: 1, wood: 0 },
} as const;

// ============================================================================
// TERRAIN CONFIGURATION
// ============================================================================

export const TERRAIN = {
  /** Number of forest tiles placed per zone */
  FORESTS_PER_ZONE: 2,
  /** Number of mountain tiles placed per zone */
  MOUNTAINS_PER_ZONE: 2,
  /** Number of ruin tiles placed per zone */
  RUINS_PER_ZONE: 3,
  /**
   * Minimum edge-circle distance from the zone 1 stronghold for the guaranteed
   * forest tile placement in zone 1.
   */
  ZONE1_FOREST_MIN_DISTANCE: 2,
  /**
   * Maximum edge-circle distance from the zone 1 stronghold for the guaranteed
   * forest tile placement in zone 1.
   */
  ZONE1_FOREST_MAX_DISTANCE: 3,
} as const;

// ============================================================================
// CONSTRUCTION CONFIGURATION
// ============================================================================

export interface BuildingCost {
  iron: number;
  wood: number;
}

export const CONSTRUCTION = {
  /** Construction cost for a Woodcutter (player) */
  WOODCUTTER_COST: { iron: 0, wood: 0 },
  /** Construction cost for a Mine (player) */
  MINE_COST: { iron: 0, wood: 1 },
  /** Construction cost for a Barracks (player) */
  BARRACKS_COST: { iron: 0, wood: 2 },
  /** Construction cost for an Archer Camp (player) */
  ARCHER_CAMP_COST: { iron: 0, wood: 2 },
  /** Construction cost for a Rider Camp (player) */
  RIDER_CAMP_COST: { iron: 3, wood: 2 },
  /** Construction cost for a Siege Camp (player) */
  SIEGE_CAMP_COST: { iron: 2, wood: 3 },
  /** Construction cost for a Farm (player, built on ruins) */
  FARM_COST: { iron: 0, wood: 2 },
  /** Construction cost for a Patrician House (player, built on ruins) */
  PATRICIAN_HOUSE_COST: { iron: 2, wood: 2 },
  /** Construction cost for a Stronghold rebuild (player) */
  STRONGHOLD_COST: { iron: 0, wood: 0 },
  /** Construction cost for a Lava Lair (enemy AI, not player) */
  LAVA_LAIR_COST: { iron: 0, wood: 0 },
  /** Construction cost for an Infernal Sanctum (enemy AI, not player) */
  INFERNAL_SANCTUM_COST: { iron: 0, wood: 0 },
} as const satisfies Record<string, BuildingCost>;

// ============================================================================
// POPULATION CONFIGURATION
// ============================================================================

export const POPULATION = {
  /** Maximum population capacity for a Farm */
  FARM_POPULATION_CAP: 3,
  /** Maximum population capacity for a Patrician House */
  PATRICIAN_HOUSE_POPULATION_CAP: 3,
  /** Farmer capacity provided by a Stronghold */
  STRONGHOLD_FARMER_CAP: 3,
  /** Noble capacity provided by a Stronghold */
  STRONGHOLD_NOBLE_CAP: 1,
  /** Initial population when a housing building is constructed */
  HOUSE_INITIAL_POPULATION: 1,
  /** Number of turns between each population increase (same for all housing types) */
  HOUSE_GROWTH_INTERVAL: 2,
} as const;

// ============================================================================
// UNIT POPULATION COSTS CONFIGURATION
// ============================================================================

export const UNIT_POPULATION_COSTS: Record<string, UnitPopulationCost> = {
  INFANTRY: { farmers: 1, nobles: 0 },
  ARCHER: { farmers: 1, nobles: 0 },
  RIDER: { farmers: 0, nobles: 1 },
  SIEGE: { farmers: 1, nobles: 1 },
  SCOUT: { farmers: 1, nobles: 0 },
  GUARD: { farmers: 0, nobles: 1 },
  LAVA_GRUNT: { farmers: 0, nobles: 0 },
  LAVA_ARCHER: { farmers: 0, nobles: 0 },
  LAVA_RIDER: { farmers: 0, nobles: 0 },
  LAVA_SIEGE: { farmers: 0, nobles: 0 },
  EMBERLING: { farmers: 0, nobles: 0 },
};

// ============================================================================
// ENEMY UNIT UNLOCK CONFIGURATION
// ============================================================================

/** Minimum threat level required to unlock each enemy unit type for recruitment */
export const ENEMY_UNIT_UNLOCK: Record<string, number> = {
  LAVA_GRUNT: 0,
  LAVA_ARCHER: 2,
  LAVA_RIDER: 4,
  LAVA_SIEGE: 6,
  EMBERLING: 1,
};

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
  LAVA_LAIR,
  UNITS,
  BUILDINGS,
  RESOURCES,
  TERRAIN,
  CONSTRUCTION,
  POPULATION,
  UNIT_POPULATION_COSTS,
  ENEMY,
  ENEMY_UNIT_UNLOCK,
  AI_SCORING,
  UNIT_COSTS,
  ANIMATION,
  RENDER,
  UI,
} as const;

export default GAME_CONFIG;
