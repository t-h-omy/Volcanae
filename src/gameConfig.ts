/**
 * Gameplay and balance configuration for Volcanae.
 * Contains only pure gameplay constants (map layout, unit stats, AI parameters,
 * resource rates, XP/level-up values, etc.).
 * Presentation-layer constants (animation, UI, rendering, input) live in
 * animationConfig.ts, uiConfig.ts, renderConfig.ts, and inputConfig.ts.
 */

import { UnitTag } from './types';
import type { UnitPopulationCost, UnitLevelDefinition } from './types';

// ============================================================================
// MAP CONFIGURATION
// ============================================================================

export const MAP = {
  /** Width of the game grid in cells */
  GRID_WIDTH: 9,
  /** Total height of the grid (35 playable + 6 lava buffer rows at the south/high-Y end) */
  GRID_HEIGHT: 41,
  /** Number of zones on the map */
  ZONE_COUNT: 5,
  /** Number of rows per zone */
  ZONE_HEIGHT: 7,
  /** Number of lava buffer rows at the south (high-Y) end of the map */
  LAVA_BUFFER_ROWS: 6,
} as const;

// ============================================================================
// LAVA CONFIGURATION
// ============================================================================

export const LAVA = {
  /** Lava advances 1 row every N player turns */
  LAVA_ADVANCE_INTERVAL: 4,
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
    tags: [UnitTag.BUILDANDCAPTURE],
  },

  ARCHER: {
    maxHp: 100,
    attack: 50,
    defense: 20,
    movementActions: 1,
    moveRange: 1,
    attackRange: 2,
    discoverRadius: 1,
    triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.BUILDANDCAPTURE],
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
    tags: [UnitTag.BUILDANDCAPTURE],
  },

  SIEGE: {
    maxHp: 100,
    attack: 80,
    defense: 0,
    movementActions: 1,
    moveRange: 1,
    attackRange: 3,
    discoverRadius: 1,
    triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.PREP],
  },

  SCOUT: {
    maxHp: 60,
    attack: 30,
    defense: 20,
    movementActions: 1,
    moveRange: 2,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
    tags: [],
  },

  GUARD: {
    maxHp: 100,
    attack: 15,
    defense: 75,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
  },

  LAVA_GRUNT: {
    maxHp: 100,
    attack: 50,
    defense: 50,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.CORRUPT],
  },

  LAVA_ARCHER: {
    maxHp: 100,
    attack: 50,
    defense: 20,
    movementActions: 1,
    moveRange: 1,
    attackRange: 2,
    discoverRadius: 1,
    triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.RANGED],
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
    tags: [UnitTag.BUILDANDCAPTURE],
  },

  LAVA_SIEGE: {
    maxHp: 100,
    attack: 80,
    defense: 0,
    movementActions: 1,
    moveRange: 1,
    attackRange: 3,
    discoverRadius: 1,
    triggerRange: 4,
    tags: [UnitTag.RANGED, UnitTag.PREP],
  },

  EMBERLING: {
    maxHp: 45,
    attack: 15,
    defense: 10,
    movementActions: 1,
    moveRange: 1,
    attackRange: 1,
    discoverRadius: 1,
    triggerRange: 0,
    explosionDamage: 40,
    tags: [UnitTag.SACRIFICIAL, UnitTag.EXPLOSIVE],
  },
};

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
  /** Number of rows at the start (low-Y end) of a zone where strongholds may not spawn */
  STRONGHOLD_SPAWN_SKIP_FIRST_ROWS: 1,
  /** Number of rows at the end (high-Y end) of a zone where strongholds may not spawn */
  STRONGHOLD_SPAWN_SKIP_LAST_ROWS: 1,
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
    defense: 65,
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
  /** Iron available at the start of a new game */
  START_IRON: 2,
  /** Wood available at the start of a new game */
  START_WOOD: 2,
} as const;

// ============================================================================
// ENEMY CONFIGURATION
// ============================================================================

export const ENEMY = {
  /** Maximum distance from lava for boost calculation */
  MAX_LAVA_BOOST_DISTANCE: 20,
  /** Maximum multiplier for lava proximity boost */
  MAX_LAVA_BOOST_MULTIPLIER: 0,
  /** Base enemy spawn count per building */
  ENEMY_SPAWN_PER_BUILDING_BASE: 1,
  /** Bonus enemy spawn per 3 threat levels */
  ENEMY_THREAT_SPAWN_BONUS: 1,
  /** Base probability (0.0–1.0) of spawning a unit per recruitment building per turn when no player unit is in discover radius and threat is 0 */
  BASE_SPAWN_PROBABILITY: 0.075,
  /** Maximum additional probability granted at max threat (0.0–1.0) */
  MAX_THREAT_BONUS: 0.60,
  /** Threat level at which the full MAX_THREAT_BONUS is reached */
  MAX_THREAT: 10,
  /** Number of player turns between automatic threat level increases */
  THREAT_LEVEL_INCREASE_INTERVAL: 10,
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
  /** Move to the lava-side edge of the current zone to push into the next zone */
  BASE_PUSH_TO_ZONE_EDGE: 25,
  /** Move to a tile that puts the unit adjacent to a player unit's flank or rear */
  BASE_FLANK_UNIT: 20,
  /** Move toward the lava front; always a candidate for unmoved units */
  BASE_ADVANCE_TOWARD_LAVA: 18,
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
  DEATH_RISK_PENALTY: 0,
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
  BONUS_PLAYER_ON_BUILDING: 45,
  /** Extra bonus on top of BONUS_PLAYER_ON_BUILDING when that player unit is actively capturing */
  BONUS_PLAYER_CAPTURING: 40,
  /** Bonus when the target building has no allied units nearby defending it */
  BONUS_UNDEFENDED_BUILDING: 25,
  /** Bonus when the target building was recently recaptured from the enemy */
  BONUS_RECENT_LOSS: 35,
  /** Number of turns after a building is captured by the player that BONUS_RECENT_LOSS applies */
  RECENTLY_LOST_WINDOW_TURNS: 4,
  /** Bonus for a ranged attack where the attacker would not be in the defender's counter range */
  BONUS_RANGED_SAFE_ATTACK: 45,

  // ── Lava-specific ─────────────────────────────────────────────────────────

  /** Large bonus added to SACRIFICE_TO_LAVA for units with the SACRIFICIAL tag */
  BONUS_SACRIFICIAL_SACRIFICE_TO_LAVA: 160,
  /** How many tiles toward lava (increasing Y) to scan when checking if a SACRIFICIAL unit is blocked */
  SACRIFICIAL_BLOCKED_CHECK_DISTANCE: 3,

  // ── Construction AI ───────────────────────────────────────────────────────

  /** Base score for a BUILD_AND_CAPTURE unit choosing to build a LAVA_LAIR on a ruin tile */
  BASE_BUILD_LAVA_LAIR: 65,
  /** Base score for a unit with the CORRUPT tag choosing to corrupt a FOREST or MOUNTAIN tile */
  BASE_CORRUPT_TERRAIN: 65,

  // ── Explosive / Sacrificial unit AI ──────────────────────────────────────
  // These scores are tag-gated and apply to any unit carrying the EXPLOSIVE or
  // SACRIFICIAL tag (e.g. EMBERLING).

  /** Base score for an EXPLOSIVE unit to detonate when adjacent to one or more player units */
  BASE_EXPLODE: 30,
  /** Bonus added to BASE_ADVANCE_TOWARD_LAVA for units with the SACRIFICIAL tag */
  BONUS_SACRIFICIAL_ADVANCE_TOWARD_LAVA: 130,
  /**
   * Extra bonus added to EXPLODE for a SACRIFICIAL unit that is confirmed blocked
   * from reaching lava. Ensures EXPLODE beats ADVANCE_TOWARD_LAVA (18 + 160 = 178)
   * when the unit is adjacent to a player unit and has no path forward.
   */
  BONUS_BLOCKED_SACRIFICIAL_EXPLODE: 250,
} as const;

export const AI_RECRUITMENT = {

  // ── Base scores per unit type ────────────────────────────────────────────
  // Starting score before any context bonuses or penalties are applied.
  // Keep low — context should drive decisions. Adjust for coarse balancing.
  BASE_SCORE_GRUNT: 0,
  BASE_SCORE_ARCHER: 0,
  BASE_SCORE_RIDER: 0,
  BASE_SCORE_SIEGE: 0,
  BASE_SCORE_EMBERLING: 0,

  // ── Classification thresholds ───────────────────────────────────────────
  /** Unit offensiveScore >= this → counted as offensive */
  OFFENSIVE_THRESHOLD: 0.6,
  /** Unit defensiveScore >= this → counted as defensive */
  DEFENSIVE_THRESHOLD: 0.4,
  /** moveRange >= this → unit is classified as fast */
  FAST_THRESHOLD: 2,
  /** attackRange >= this AND RANGED tag → classified as ranged (includes siege) */
  RANGED_THRESHOLD: 2,
  /** attackRange >= this AND RANGED tag → classified as siege */
  SIEGE_THRESHOLD: 3,
  // slow melee = attackRange < RANGED_THRESHOLD AND moveRange < FAST_THRESHOLD
  // melee = attackRange < RANGED_THRESHOLD (regardless of speed)

  // ── LAVA_GRUNT ──────────────────────────────────────────────────────────
  GRUNT_BONUS_ENEMY_OFF_EXCEEDS_DEF: 20,
  GRUNT_BONUS_PLAYER_OFFENSIVE_COUNT: 5,
  GRUNT_BONUS_ENEMY_SIEGE_EXISTS: 25,
  GRUNT_BONUS_HIGH_PLAYER_MELEE_RATIO: 20,
  GRUNT_PLAYER_MELEE_RATIO_THRESHOLD: 0.5,
  GRUNT_PENALTY_OVERREPRESENTED: 20,
  GRUNT_OVERREPRESENTED_THRESHOLD: 0.6,

  // ── LAVA_ARCHER ─────────────────────────────────────────────────────────
  ARCHER_BONUS_PLAYER_SLOW_MELEE_RATIO: 30,
  ARCHER_PLAYER_SLOW_MELEE_RATIO_THRESHOLD: 0.4,
  ARCHER_BONUS_ENEMY_DEF_COVER: 20,
  ARCHER_ENEMY_DEF_COUNT_THRESHOLD: 2,
  ARCHER_PENALTY_PLAYER_FAST_RATIO: 35,
  ARCHER_PLAYER_FAST_RATIO_THRESHOLD: 0.25,
  ARCHER_PENALTY_OVERREPRESENTED: 20,
  ARCHER_RANGED_OVERREPRESENTED_THRESHOLD: 0.4,

  // ── LAVA_RIDER ──────────────────────────────────────────────────────────
  RIDER_BONUS_PLAYER_RANGED_RATIO: 30,
  RIDER_PLAYER_RANGED_RATIO_THRESHOLD: 0.25,
  RIDER_BONUS_PLAYER_RANGED_COUNT: 8,
  RIDER_BONUS_ENEMY_FAST_GAP: 15,
  RIDER_ENEMY_FAST_GAP_THRESHOLD: 2,
  RIDER_PENALTY_OVERREPRESENTED: 20,
  RIDER_FAST_OVERREPRESENTED_THRESHOLD: 0.4,

  // ── LAVA_SIEGE ──────────────────────────────────────────────────────────
  SIEGE_BONUS_PLAYER_SLOW_MELEE_RATIO: 30,
  SIEGE_PLAYER_SLOW_MELEE_RATIO_THRESHOLD: 0.5,
  SIEGE_BONUS_ENEMY_DEF_COVER: 25,
  SIEGE_ENEMY_DEF_COUNT_THRESHOLD: 2,
  SIEGE_PENALTY_NO_COVER: 20,
  SIEGE_NO_COVER_THRESHOLD: 2,
  SIEGE_PENALTY_PLAYER_FAST_RATIO: 35,
  SIEGE_PLAYER_FAST_RATIO_THRESHOLD: 0.25,
  SIEGE_PENALTY_OVERREPRESENTED: 15,
  SIEGE_OVERREPRESENTED_THRESHOLD: 0.3,

  // ── EMBERLING ───────────────────────────────────────────────────────────
  EMBERLING_BONUS_PLAYER_MELEE_RATIO: 25,
  EMBERLING_PLAYER_MELEE_RATIO_THRESHOLD: 0.5,
  EMBERLING_BONUS_PLAYER_SLOW_MELEE_COUNT: 6,
  EMBERLING_BONUS_NONE_NEARBY: 20,
  EMBERLING_PENALTY_OVERREPRESENTED: 30,
  EMBERLING_NEARBY_OVERREPRESENTED_COUNT: 2,

} as const;

// ============================================================================
// UNIT COST CONFIGURATION
// ============================================================================

export interface UnitCost {
  iron: number;
  wood: number;
}

export const UNIT_COSTS: Record<string, UnitCost> = {
  INFANTRY: { iron: 3, wood: 2 },
  ARCHER: { iron: 2, wood: 3 },
  RIDER: { iron: 4, wood: 2 },
  SIEGE: { iron: 3, wood: 4 },
  SCOUT: { iron: 0, wood: 2 },
  GUARD: { iron: 2, wood: 0 },
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
  RUINS_PER_ZONE: 4,
  /**
   * Minimum edge-circle distance from the zone 1 stronghold for the guaranteed
   * forest tile placement in zone 1.
   */
  ZONE1_FOREST_MIN_DISTANCE: 1,
  /**
   * Maximum edge-circle distance from the zone 1 stronghold for the guaranteed
   * forest tile placement in zone 1.
   */
  ZONE1_FOREST_MAX_DISTANCE: 2,
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
  MINE_COST: { iron: 0, wood: 2 },
  /** Construction cost for a Barracks (player) */
  BARRACKS_COST: { iron: 2, wood: 2 },
  /** Construction cost for an Archer Camp (player) */
  ARCHER_CAMP_COST: { iron: 1, wood: 3 },
  /** Construction cost for a Rider Camp (player) */
  RIDER_CAMP_COST: { iron: 5, wood: 3 },
  /** Construction cost for a Siege Camp (player) */
  SIEGE_CAMP_COST: { iron: 3, wood: 5 },
  /** Construction cost for a Farm (player, built on ruins) */
  FARM_COST: { iron: 0, wood: 3 },
  /** Construction cost for a Patrician House (player, built on ruins) */
  PATRICIAN_HOUSE_COST: { iron: 3, wood: 3 },
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
  FARM_POPULATION_CAP: 2,
  /** Maximum population capacity for a Patrician House */
  PATRICIAN_HOUSE_POPULATION_CAP: 2,
  /** Farmer capacity provided by a Stronghold */
  STRONGHOLD_FARMER_CAP: 2,
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
  LAVA_ARCHER: 0,
  LAVA_RIDER: 3,
  LAVA_SIEGE: 5,
  EMBERLING: 1,
};

// ============================================================================
// UNIT XP AND LEVEL-UP CONFIGURATION
// ============================================================================

/**
 * XP reward values and global level system constants.
 */
export const XP = {
  /** XP granted for killing an enemy unit */
  KILL_UNIT: 2,
  /** XP granted for destroying an enemy building (incl. Watchtower going neutral) */
  DESTROY_BUILDING: 1,
  /** XP granted for capturing an enemy building (incl. Watchtower going neutral) */
  CAPTURE_BUILDING: 1,
  /** XP granted for constructing a building */
  CONSTRUCT_BUILDING: 1,
  /** Maximum level a unit can reach */
  MAX_LEVEL: 3,
} as const;

/**
 * Shared XP thresholds and stat-boost values referenced by UNIT_LEVEL_UP.
 * Change these to re-balance all unit types at once.
 */
export const LEVEL_UP_VALUES = {
  /** Cumulative XP required to reach level 2 (applies to all unit types) */
  XP_TO_LEVEL_2: 3,
  /** Cumulative XP required to reach level 3 (applies to all unit types) */
  XP_TO_LEVEL_3: 7,
  /** Max-HP flat boost per level for most unit types */
  HP_BOOST_DEFAULT: 20,
  /** Max-HP flat boost per level for Scout units */
  HP_BOOST_SCOUT: 15,
  /** Max-HP flat boost per level for Emberling units */
  HP_BOOST_EMBERLING: 10,
} as const;

/**
 * Per-unit-type level-up definitions.
 * Index 0 = level 2, index 1 = level 3.
 * Each entry lists the cumulative XP required and the stat boosts applied.
 */
export const UNIT_LEVEL_UP: Record<string, UnitLevelDefinition[]> = {
  INFANTRY: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  ARCHER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  RIDER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  SIEGE: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  SCOUT: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
  ],
  GUARD: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  LAVA_GRUNT: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  LAVA_ARCHER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  LAVA_RIDER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  LAVA_SIEGE: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
  ],
  EMBERLING: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
  ],
};

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
  AI_RECRUITMENT,
  UNIT_COSTS,
  XP,
  LEVEL_UP_VALUES,
  UNIT_LEVEL_UP,
} as const;

export default GAME_CONFIG;
