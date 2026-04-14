/**
 * Gameplay and balance configuration for Volcanae.
 * Contains only pure gameplay constants (map layout, unit stats, AI parameters,
 * resource rates, XP/level-up values, etc.).
 * Presentation-layer constants (animation, UI, rendering, input) live in
 * animationConfig.ts, uiConfig.ts, renderConfig.ts, and inputConfig.ts.
 */

import { UnitTag, DestroyBehavior, BuildingType, UnitType, ResourceType, TechFlag } from './types';
import type { UnitPopulationCost, UnitLevelDefinition, TechNodeDefinition } from './types';

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
    attack: 70,
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
    attack: 85,
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
    tags: [UnitTag.PREP],
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
    attack: 70,
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
    attack: 85,
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
    moveRange: 2,
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
  STRONGHOLD_SPAWN_SKIP_FIRST_ROWS: 3,
  /** Number of rows at the end (high-Y end) of a zone where strongholds may not spawn */
  STRONGHOLD_SPAWN_SKIP_LAST_ROWS: 0,
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
    OUTPOST: 3,
    LAVALAIR: 2,
    INFERNALSANCTUM: 2,
    FARM: 2,
    PATRICIANHOUSE: 2,
    MAGMASPYR: 2,
    EMBERNEST: 2,
    CRYSTAL_CHAMBER: 2,
  },
  /** What happens to a tile when a building of each type is destroyed */
  DESTROY_BEHAVIOR: {
    STRONGHOLD: DestroyBehavior.STRONGHOLD_RUIN,
    MINE: DestroyBehavior.RUIN,
    WOODCUTTER: DestroyBehavior.RUIN,
    BARRACKS: DestroyBehavior.RUIN,
    ARCHER_CAMP: DestroyBehavior.RUIN,
    RIDER_CAMP: DestroyBehavior.RUIN,
    SIEGE_CAMP: DestroyBehavior.RUIN,
    WATCHTOWER: DestroyBehavior.RUIN,
    OUTPOST: DestroyBehavior.NONE,
    LAVALAIR: DestroyBehavior.RUIN,
    INFERNALSANCTUM: DestroyBehavior.STRONGHOLD_RUIN,
    FARM: DestroyBehavior.RUIN,
    PATRICIANHOUSE: DestroyBehavior.RUIN,
    MAGMASPYR: DestroyBehavior.RESOURCE,
    EMBERNEST: DestroyBehavior.RESOURCE,
    CRYSTAL_CHAMBER: DestroyBehavior.RUIN,
  },
  /** Watchtower combat configuration */
  WATCHTOWER_STATS: {
    maxHp: 150,
    attack: 50,
    defense: 65,
    attackRange: 3,
  },
  /** Outpost combat configuration (player-built by Infantry via Fieldwork tech) */
  OUTPOST_STATS: {
    maxHp: 150,
    attack: 40,
    defense: 55,
    attackRange: 2,
  },
} as const;

// ============================================================================
// LAVA LAIR / CORRUPTION BUILDING CONFIGURATION
// ============================================================================

export const LAVA_LAIR = {
  /** Combat stats for MAGMA_SPYR buildings (created on corrupted MOUNTAIN tiles) */
  MAGMA_SPYR_STATS: {
    maxHp: 120,
    attack: 30,
    defense: 50,
    attackRange: 2,
    maxAttacksPerTurn: 2,
  },
  /** Number of turns between EMBER_NEST Emberling spawns */
  EMBER_NEST_SPAWN_INTERVAL: 3,
  /** Maximum number of EMBERLINGs allowed near an EMBER_NEST (within 8 tiles) */
  EMBER_NEST_MAX_EMBERLINGS: 2,
} as const;

// ============================================================================
// CRYSTAL CHAMBER CONFIGURATION
// ============================================================================

export const CRYSTAL_CHAMBER_CONFIG = {
  /** Number of turns all surviving chambers resonate after one is destroyed by lava */
  RESONANCE_DURATION: 3,
  /** Arcane crystals granted per resonating chamber per player turn */
  CRYSTALS_PER_CHAMBER_PER_TURN: 1,
  /** Construction cost */
  COST: { iron: 2, wood: 3 },
  /** Max HP */
  MAX_HP: 100,
  /** Discovery radius */
  DISCOVER_RADIUS: 2,
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
  START_IRON: 3,
  /** Wood available at the start of a new game */
  START_WOOD: 3,
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
  ENEMY_THREAT_SPAWN_BONUS: 0,
  /** Base probability (0.0–1.0) of spawning a unit per recruitment building per turn when no player unit is in discover radius and threat is 0 */
  BASE_SPAWN_PROBABILITY: 0.1,
  /** Maximum additional probability granted at max threat (0.0–1.0) */
  MAX_THREAT_BONUS: 0.9,
  /** Threat level at which the full MAX_THREAT_BONUS is reached */
  MAX_THREAT: 15,
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
  BASE_INTERCEPT_CAPTOR: 100,
  /** Walk onto an unoccupied neutral or player building to begin capturing it */
  BASE_CAPTURE_BUILDING: 100,
  /** Move to a building already occupied by a player unit to disrupt their capture attempt */
  BASE_CONTEST_BUILDING: 80,
  /** Perform a melee attack against an adjacent player unit */
  BASE_ATTACK_UNIT: 75,
  /** Perform a melee attack against an adjacent player-owned building */
  BASE_ATTACK_BUILDING: 76,
  /** Perform a ranged attack against a player-owned building from a safe distance */
  BASE_RANGED_ATTACK_BUILDING: 75,
  /** Perform a ranged attack against a player unit from outside melee range */
  BASE_RANGED_ATTACK_UNIT: 76,
  /** Move towards a building that was previously enemy-owned but recently captured by the player */
  BASE_RETAKE_BUILDING: 65,
  /** Move towards a friendly LAVA_LAIR or INFERNAL_SANCTUM to keep it defended */
  BASE_PROTECT_SPAWNER: 58,
  /** Move towards the player's starting stronghold (zone 1) to apply pressure */
  BASE_PUSH_TO_STRONGHOLD: 50,
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
  BASE_FLANK_UNIT: 25,
  /** Move toward the lava front; always a candidate for unmoved units */
  BASE_ADVANCE_TOWARD_LAVA: 18,
  /** Voluntarily walk into lava to boost the threat level when no better action exists */
  BASE_SACRIFICE_TO_LAVA: 12,
  /** Stay in place; fallback when every other action scores 0 or is unavailable */
  BASE_HOLD_POSITION: 3,

  // ── Distance ─────────────────────────────────────────────────────────────

  /** Score subtracted for every tile of Manhattan distance between the unit and its target */
  DISTANCE_PENALTY_PER_TILE: 8,

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

  /**
   * Base score for a ranged unit moving to a tile from which it can attack
   * a player unit at distance > 1 while no player unit is adjacent to that tile.
   * Must beat BASE_RANGED_ATTACK_UNIT (76) + BONUS_RANGED_SAFE_ATTACK (45) = 121
   * to be preferred over an immediately available safe ranged attack.
   * Set lower so it loses to an already-safe attack but wins over ATTACK_UNIT (75)
   * and all pure movement actions.
   */
  BASE_MOVE_TO_SAFE_RANGED_POSITION: 88,

  /**
   * Bonus added when the (tile, target) pair found by MOVE_TO_SAFE_RANGED_POSITION
   * would also kill the target (no counter possible anyway).
   */
  BONUS_SAFE_RANGED_KILL: 50,

  /**
   * Bonus added for PREP-tagged ranged units when their current-position target
   * cannot counter-attack (target's attackRange < distance to this unit).
   * Applied on top of BASE_RANGED_ATTACK_UNIT.
   */
  BONUS_PREP_UNCOUNTERABLE_TARGET: 40,

  // ── Lava-specific ─────────────────────────────────────────────────────────

  /** Large bonus added to SACRIFICE_TO_LAVA for units with the SACRIFICIAL tag */
  BONUS_SACRIFICIAL_SACRIFICE_TO_LAVA: 160,
  /** How many tiles toward lava (increasing Y) to scan when checking if a SACRIFICIAL unit is blocked */
  SACRIFICIAL_BLOCKED_CHECK_DISTANCE: 3,

  // ── Construction AI ───────────────────────────────────────────────────────

  /** Base score for moving toward a neutral building outside trigger range, in an underrepresented column */
  BASE_SPREAD_TO_FLANK: 32,
  /** Score penalty per enemy unit already occupying the same X column as the target building */
  SPREAD_COLUMN_COVERAGE_PENALTY: 10,
  /** Distance penalty per tile for SPREAD_TO_FLANK (lighter than DISTANCE_PENALTY_PER_TILE to reward lateral travel) */
  SPREAD_DISTANCE_PENALTY: 3,

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
  BONUS_SACRIFICIAL_ADVANCE_TOWARD_LAVA: 160,
  /**
   * Extra bonus added to EXPLODE for a SACRIFICIAL unit that is confirmed blocked
   * from reaching lava. Ensures EXPLODE beats ADVANCE_TOWARD_LAVA (18 + 160 = 178)
   * when the unit is adjacent to a player unit and has no path forward.
   */
  BONUS_BLOCKED_SACRIFICIAL_EXPLODE: 250,
  /**
   * Penalty subtracted from a movement action's score when the unit's first step
   * toward the target would land on a friendly enemy recruitment building (LAVA_LAIR
   * or INFERNAL_SANCTUM). Keeps spawner tiles free for recruitment.
   */
  PENALTY_STEP_ONTO_RECRUITMENT_BUILDING: 70,
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
  RIDER: { iron: 5, wood: 2 },
  SIEGE: { iron: 4, wood: 4 },
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
  RUINS_PER_ZONE: 6,
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
  HOUSE_GROWTH_INTERVAL: 3,
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
  LAVA_ARCHER: 1,
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
  KILL_UNIT: 1,
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
  HP_BOOST_DEFAULT2: 40,
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
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  ARCHER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  RIDER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  SIEGE: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  SCOUT: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
  ],
  GUARD: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  LAVA_GRUNT: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  LAVA_ARCHER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  LAVA_RIDER: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  LAVA_SIEGE: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
  ],
  EMBERLING: [
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
    { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
  ],
};

// ============================================================================
// TECH CONFIGURATION
// ============================================================================

export const TECH = {
  /** Number of crystals granted at game start (before first lava consumption) */
  CRYSTALS_ON_GAME_START: 2,
  /** Number of crystals granted each time a player building is consumed by lava */
  CRYSTALS_ON_LAVA_CONSUMPTION: 0,
  /** Number of crystals granted each time the player captures a new zone stronghold */
  CRYSTALS_ON_ZONE_STRONGHOLD: 0,
} as const;

// ============================================================================
// TECH TREE CONFIGURATION
// ============================================================================

/**
 * Tech tree node definitions.
 * Add a new tech node by adding one entry to this array — no logic files
 * touched, no switch statements updated, no hardcoded references.
 */
export const TECH_TREE: TechNodeDefinition[] = [
  // ── Root node (auto-unlocked at game start, not a pick) ──
  {
    id: 'CONSCRIPTION',
    name: 'Conscription',
    description: 'Basic military infrastructure',
    requires: [],
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.BARRACKS },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.FARM },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.CRYSTAL_CHAMBER },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.INFANTRY },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SCOUT },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.GUARD },
    ],
  },

  // ── Branch 1: Nobility ──
  {
    id: 'A_NOBLE_STEAD',
    name: 'A Noble Stead',
    description: 'Attract the upper class and field swift cavalry',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.PATRICIANHOUSE },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.RIDER_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.RIDER },
    ],
  },
  {
    id: 'DEEP_VEINS',
    name: 'Deep Veins',
    description: 'Mines occasionally produce bonus iron',
    requires: ['A_NOBLE_STEAD'],
    cost: 3,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.MINE, resource: ResourceType.IRON, chancePercent: 30, amount: 1 },
    ],
  },

  // ── Branch 2: Ranged ──
  {
    id: 'FAR_REACH',
    name: 'Far Reach',
    description: 'Establish archery ranges and train bowmen',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.ARCHER_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.ARCHER },
    ],
  },
  {
    id: 'SIEGE_WORKS',
    name: 'Siege Works',
    description: 'Build Siege Camps and field devastating siege engines',
    requires: ['FAR_REACH'],
    cost: 3,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.SIEGE_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SIEGE },
    ],
  },
  {
    id: 'CLEAN_CUTS',
    name: 'Clean Cuts',
    description: 'Woodcutters occasionally produce bonus wood',
    requires: ['FAR_REACH'],
    cost: 3,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.WOODCUTTER, resource: ResourceType.WOOD, chancePercent: 30, amount: 1 },
    ],
  },
  {
    id: 'TO_THE_FRONT',
    name: 'To the Front',
    description: 'Units far from the front line move faster',
    requires: ['CLEAN_CUTS'],
    cost: 5,
    effects: [
      { type: 'FLAG', flag: TechFlag.TO_THE_FRONT },
    ],
  },

  // ── Branch 3: Fortification ──
  {
    id: 'FIELD_DUTIES',
    name: 'Field Duties',
    description: 'Guards can now construct and capture like builders',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.BUILDANDCAPTURE },
    ],
  },
  {
    id: 'HOLD_GROUND',
    name: 'Hold Ground',
    description: 'Units on own buildings gain a defense bonus',
    requires: ['FIELD_DUTIES'],
    cost: 3,
    effects: [
      { type: 'FLAG', flag: TechFlag.HOLD_GROUND },
    ],
  },
  {
    id: 'FIELDWORK',
    name: 'Fieldwork',
    description: 'Infantry can sacrifice themselves to construct an Outpost',
    requires: ['FIELD_DUTIES'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.INFANTRY, tag: UnitTag.FIELDWORK },
    ],
  },

  // ── Branch 4: Reconnaissance ──
  {
    id: 'BIG_EYES',
    name: 'Big Eyes',
    description: 'Scouts see further into the fog',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'discoverRadius', mode: 'add', value: 1 },
    ],
  },
  {
    id: 'ASSASSIN',
    name: 'Assassin',
    description: 'Scouts deal bonus damage with no retaliation damage when striking full-HP enemies',
    requires: ['BIG_EYES'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.ASSASSIN },
    ],
  },
  {
    id: 'PATCH_UP',
    name: 'Patch Up',
    description: 'Scouts can heal adjacent friendly units',
    requires: ['BIG_EYES'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.PATCHUP },
    ],
  },

  // ── Branch 5: Stronghold Development ──
  {
    id: 'WALLED_SETTLEMENT',
    name: 'Walled Settlement',
    description: 'Strongholds sustain more farmers and produce goods for the realm',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'farmer', amount: 1 },
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.STRONGHOLD, resource: ResourceType.WOOD, chancePercent: 50, amount: 1 },
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.STRONGHOLD, resource: ResourceType.IRON, chancePercent: 50, amount: 1 },
    ],
  },
  {
    id: 'CITADEL',
    name: 'Citadel',
    description: 'An imposing fortress that houses nobles and trains elite warriors',
    requires: ['WALLED_SETTLEMENT'],
    cost: 3,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'noble', amount: 1 },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'maxHp', mode: 'add', value: 40 },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.GUARD, stat: 'maxHp', mode: 'add', value: 40 },
    ],
  },
];

// ============================================================================
// ABILITIES — Balance-tunable constants for tag/flag-based abilities
// ============================================================================

export const ABILITIES = {
  /** Damage multiplier applied when ASSASSIN tag attacks a full-HP target */
  ASSASSIN_DAMAGE_MULTIPLIER: 3,
  /** Flat defense bonus applied when HOLD_GROUND flag is active and unit stands on own building */
  HOLD_GROUND_DEFENSE_BONUS: 30,
  /** Extra move range granted by TO_THE_FRONT flag */
  TO_THE_FRONT_MOVE_BONUS: 1,
  /** Minimum tile distance from lava front required for TO_THE_FRONT bonus to apply */
  TO_THE_FRONT_MIN_DISTANCE: 7,
  /** HP restored per PATCHUP heal action */
  PATCHUP_HEAL_AMOUNT: 50,
  /** Multiplier applied to the building unit's currentHp to determine the Outpost's starting HP */
  FIELDWORK_HP_MULTIPLIER: 2,
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
  AI_RECRUITMENT,
  UNIT_COSTS,
  XP,
  LEVEL_UP_VALUES,
  UNIT_LEVEL_UP,
  TECH,
  TECH_TREE,
  CRYSTAL_CHAMBER_CONFIG,
  ABILITIES,
} as const;

export default GAME_CONFIG;
