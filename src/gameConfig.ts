/**
 * Gameplay and balance configuration for Volcanae.
 * Contains only pure gameplay constants (map layout, unit stats, AI parameters,
 * resource rates, XP/level-up values, etc.).
 * Presentation-layer constants (animation, UI, rendering, input) live in
 * animationConfig.ts, uiConfig.ts, renderConfig.ts, and inputConfig.ts.
 */

import { UnitTag, DestroyBehavior, BuildingType, UnitType, ResourceType, TechFlag, Difficulty } from './types';
import type { UnitLevelDefinition, TechNodeDefinition, StatModifier } from './types';

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
// DIFFICULTY CONFIGURATION
// ============================================================================

/** Multipliers applied to enemy attack, defense, max HP, and lava advance speed per difficulty. */
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  [Difficulty.EASY]: 0.5,
  [Difficulty.STANDARD]: 1,
  [Difficulty.HARD]: 1.25,
};

/**
 * Returns the lava advance interval (turns between lava advances) for the given difficulty.
 * Higher difficulty → smaller interval → faster lava.
 */
export function getLavaAdvanceInterval(difficulty: Difficulty): number {
  return Math.max(1, Math.round(LAVA.LAVA_ADVANCE_INTERVAL / DIFFICULTY_MULTIPLIER[difficulty]));
}

// ============================================================================
// UNIT CONFIGURATION (standard unit defaults)
// ============================================================================

/** All data for a single unit type, combining stats, tags, costs and UI descriptions. */
export interface UnitDefinition {
  // ── Stats ────────────────────────────────────────────────────────────────
  maxHp: number;
  attack: number;
  defense: number;
  movementActions: number;
  moveRange: number;
  attackRange: number;
  discoverRadius: number;
  triggerRange: number;
  /** Explosion damage radius dealt on death — only EMBERLING */
  explosionDamage?: number;

  // ── Tags ─────────────────────────────────────────────────────────────────
  tags: UnitTag[];

  // ── Costs ────────────────────────────────────────────────────────────────
  /** Iron/wood recruitment cost ({iron:0,wood:0} for enemy-only units) */
  cost: { iron: number; wood: number };
  /** Population slot consumption */
  populationCost: { farmers: number; nobles: number };

  // ── Level-up progression (index 0 = L2, index 1 = L3) ───────────────────
  levelUp: UnitLevelDefinition[];

  // ── Enemy unlock threshold (omit for player units) ───────────────────────
  enemyUnlockEmber?: number;

  // ── UI ───────────────────────────────────────────────────────────────────
  description: string;
}

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
} as const;

// ============================================================================
// LAVA LAIR / CORRUPTION BUILDING CONFIGURATION
// ============================================================================

export const LAVA_LAIR = {
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
  /** Max HP */
  MAX_HP: 100,
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
  BASE_SPAWN_PROBABILITY: 0.07,
  /** Maximum additional probability granted at max threat (0.0–1.0) */
  MAX_THREAT_BONUS: 0.5,
  /** Threat level at which the full MAX_THREAT_BONUS is reached */
  MAX_THREAT: 20,
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
   * Base score for a ranged unit retreating away from an adjacent player unit
   * when no safe ranged attack position can be found. This "pure retreat"
   * candidate uses the MOVE_TO_SAFE_RANGED_POSITION action type and wins over
   * ATTACK_UNIT (75) in most cases, preventing archers from melee-attacking
   * instead of falling back to safety.
   *
   * Intentionally the same value as BASE_MOVE_TO_SAFE_RANGED_POSITION (88):
   * a pure retreat and a move-then-attack should be equally preferred over a
   * melee attack. Kept as a separate named constant so the two can be tuned
   * independently if needed.
   */
  BASE_RETREAT_FROM_ADJACENT: 88,

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

/** Iron/wood cost for a unit or building */
export interface UnitCost {
  iron: number;
  wood: number;
}

// ============================================================================
// TERRAIN CONFIGURATION
// ============================================================================

export const TERRAIN = {
  /** Minimum number of forest tiles placed per zone */
  FORESTS_PER_ZONE_MIN: 2,
  /** Maximum number of forest tiles placed per zone */
  FORESTS_PER_ZONE_MAX: 3,
  /** Minimum number of mountain tiles placed per zone */
  MOUNTAINS_PER_ZONE_MIN: 2,
  /** Maximum number of mountain tiles placed per zone */
  MOUNTAINS_PER_ZONE_MAX: 3,
  /** Minimum number of ruin tiles placed per zone */
  RUINS_PER_ZONE_MIN: 7,
  /** Maximum number of ruin tiles placed per zone */
  RUINS_PER_ZONE_MAX: 8,
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

  // Canyon config
  CANYON_LENGTH_MIN: 7,
  CANYON_LENGTH_MAX: 15,
  CANYON_DRIFT_CHANCE: 0.15,
  CANYON_WIDTH_VARIANCE_CHANCE: 0.2,
  CANYONS_PER_ZONE_MIN: 0,
  CANYONS_PER_ZONE_MAX: 2,

  // Lake config
  LAKE_WIDTH_MIN: 3,
  LAKE_WIDTH_MAX: 5,
  LAKE_HEIGHT_MIN: 3,
  LAKE_HEIGHT_MAX: 5,
  LAKE_EROSION_CHANCE: 0.35,
  LAKES_PER_ZONE_MIN: 0,
  LAKES_PER_ZONE_MAX: 2,

  // Traversability
  MIN_PASSABLE_TILES_PER_ROW: 1,
  MAX_TRAVERSABILITY_RETRIES: 10,
  IMPASSABLE_MIN_DISTANCE_FROM_STRONGHOLD: 2,
} as const;

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

// ============================================================================
// UNIT DEFINITIONS — single source of truth per unit type
// ============================================================================

/**
 * Single source of truth for all per-unit data.
 * Replaces UNITS, UNIT_COSTS, UNIT_POPULATION_COSTS, UNIT_LEVEL_UP, and ENEMY_UNIT_UNLOCK.
 */
export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  INFANTRY: {
    maxHp: 100, attack: 50, defense: 50,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 3, wood: 2 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Versatile foot soldier that can move, fight, build structures, and capture enemy buildings.',
  },

  ARCHER: {
    maxHp: 100, attack: 50, defense: 20,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.BUILDANDCAPTURE],
    cost: { iron: 2, wood: 3 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Ranged attacker that strikes from 2 tiles away without stepping into melee range.',
  },

  RIDER: {
    maxHp: 100, attack: 70, defense: 40,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 5, wood: 2 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Swift cavalry that covers 2 tiles per move to outflank and pressure the enemy.',
  },

  SIEGE: {
    maxHp: 100, attack: 85, defense: 0,
    movementActions: 1, moveRange: 1, attackRange: 3,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.PREP],
    cost: { iron: 4, wood: 4 },
    populationCost: { farmers: 1, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Long-range bombard with 3-tile reach; cannot fire in the same turn it moves.',
  },

  SCOUT: {
    maxHp: 60, attack: 25, defense: 20,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [],
    cost: { iron: 0, wood: 2 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
    ],
    description: 'Light and fast explorer. Can gain special abilities through technology upgrades.',
  },

  GUARD: {
    maxHp: 100, attack: 15, defense: 75,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.PREP],
    cost: { iron: 2, wood: 0 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Heavily armored defender with high defense; cannot attack in the same turn it moves.',
  },

  LAVA_GRUNT: {
    maxHp: 100, attack: 50, defense: 50,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.CORRUPT],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 0,
    description: 'Standard enemy foot soldier. Can corrupt terrain to create hostile buildings.',
  },

  LAVA_ARCHER: {
    maxHp: 100, attack: 50, defense: 20,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.RANGED],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 1,
    description: 'Enemy ranged unit that attacks from 2 tiles away.',
  },

  LAVA_RIDER: {
    maxHp: 100, attack: 70, defense: 40,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 3,
    description: 'Enemy fast cavalry that covers 2 tiles per move.',
  },

  LAVA_SIEGE: {
    maxHp: 100, attack: 85, defense: 0,
    movementActions: 1, moveRange: 1, attackRange: 3,
    discoverRadius: 1, triggerRange: 4,
    tags: [UnitTag.RANGED, UnitTag.PREP],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 5,
    description: 'Enemy long-range bombard with 3-tile reach.',
  },

  EMBERLING: {
    maxHp: 45, attack: 15, defense: 10,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    explosionDamage: 40,
    tags: [UnitTag.SACRIFICIAL, UnitTag.EXPLOSIVE, UnitTag.PASSIVE],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
    ],
    enemyUnlockEmber: 1,
    description: 'Fragile fire spirit that walks toward lava. Explodes on death, dealing heavy damage to all nearby enemies.',
  },
};

// ============================================================================
// BUILDING DEFINITIONS — single source of truth per building type
// ============================================================================

/** All data for a single building type, combining construction cost, combat stats and UI descriptions. */
export interface BuildingDefinition {
  discoverRadius: number;
  destroyBehavior: DestroyBehavior;
  /** Iron/wood construction cost ({iron:0,wood:0} for buildings not constructed by the player) */
  constructionCost: { iron: number; wood: number };
  /** Combat stats — only present for buildings that can attack */
  combatStats?: {
    maxHp: number;
    attack: number;
    defense: number;
    attackRange: number;
    maxAttacksPerTurn?: number;
  };
  description: string;
}

/**
 * Single source of truth for all per-building data.
 * Replaces BUILDINGS.DISCOVER_RADIUS, BUILDINGS.DESTROY_BEHAVIOR,
 * BUILDINGS.WATCHTOWER_STATS, BUILDINGS.OUTPOST_STATS, LAVA_LAIR.MAGMA_SPYR_STATS,
 * CONSTRUCTION.*_COST, CRYSTAL_CHAMBER_CONFIG.COST, and CRYSTAL_CHAMBER_CONFIG.DISCOVER_RADIUS.
 */
export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  STRONGHOLD: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Your capital — if you lose all your strongholds, the game is over.',
  },
  MINE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 2 },
    description: 'Produces iron every turn, the primary resource for training units.',
  },
  WOODCUTTER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Produces wood every turn, used alongside iron for buildings and recruitment.',
  },
  BARRACKS: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 2, wood: 2 },
    description: 'Military hall that trains Infantry.',
  },
  ARCHER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 1, wood: 3 },
    description: 'Archery range that trains Archers.',
  },
  RIDER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 5, wood: 3 },
    description: 'Stable that trains Riders.',
  },
  SIEGE_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 3, wood: 5 },
    description: 'Engineering works that trains Siege engines.',
  },
  WATCHTOWER: {
    discoverRadius: 4,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 0 },
    combatStats: { maxHp: 150, attack: 50, defense: 65, attackRange: 3 },
    description: 'Defensive tower that attacks enemies within 3 tiles and expands your vision.',
  },
  OUTPOST: {
    discoverRadius: 3,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    combatStats: { maxHp: 150, attack: 40, defense: 55, attackRange: 2 },
    description: 'Field fortification built by Infantry via Fieldwork. Attacks enemies within 2 tiles. Starting HP is based on the building unit\'s current HP, capped at 150.',
  },
  LAVALAIR: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Enemy spawner building. Produces Lava Grunt units.',
  },
  INFERNALSANCTUM: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Enemy zone stronghold. Capturing it triggers a Sanctum Collapse.',
  },
  FARM: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 3 },
    description: 'Housing for common folk — each pop raised lets you field one more basic unit.',
  },
  PATRICIANHOUSE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 3, wood: 3 },
    description: 'Noble estate — each noble raised lets you field one more elite unit.',
  },
  MAGMASPYR: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RESOURCE,
    constructionCost: { iron: 0, wood: 0 },
    combatStats: { maxHp: 120, attack: 30, defense: 50, attackRange: 2, maxAttacksPerTurn: 2 },
    description: 'Corrupted mountain spire that attacks nearby units multiple times per turn.',
  },
  EMBERNEST: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RESOURCE,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Corrupted forest nest that periodically spawns Emberlings.',
  },
  CRYSTAL_CHAMBER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 3, wood: 2 },
    description: 'Arcane resonator. When a Crystal Chamber is consumed by lava, all surviving chambers begin resonating and generate crystals each turn.',
  },
};

export const TECH = {
  /** Number of crystals granted at game start (before first lava consumption) */
  CRYSTALS_ON_GAME_START: 2,
  /** Number of crystals granted each time a player building is consumed by lava */
  CRYSTALS_ON_LAVA_CONSUMPTION: 0,
  /** Number of crystals granted each time the player captures a new zone stronghold */
  CRYSTALS_ON_ZONE_STRONGHOLD: 0,
} as const;

/**
 * Compute the actual crystal cost to research a tech node at the current ember level.
 * Actual cost = baseCost + ember.
 */
export function computeResearchCost(baseCost: number, ember: number): number {
  return baseCost + ember;
}

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
    cost: 4,
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
    cost: 4,
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
    cost: 4,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.WOODCUTTER, resource: ResourceType.WOOD, chancePercent: 30, amount: 1 },
    ],
  },
  {
    id: 'TO_THE_FRONT',
    name: 'To the Front',
    description: 'Units far from the front line move faster',
    requires: ['CLEAN_CUTS'],
    cost: 7,
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
    cost: 4,
    effects: [
      { type: 'FLAG', flag: TechFlag.HOLD_GROUND },
    ],
  },
  {
    id: 'FIELDWORK',
    name: 'Fieldwork',
    description: 'Infantry can sacrifice themselves to construct an Outpost',
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.INFANTRY, tag: UnitTag.FIELDWORK },
    ],
  },
  {
    id: 'PHALANX_FORMATION',
    name: 'Phalanx Formation',
    description: 'Guards in formation bolster each other — gaining attack and granting defense to nearby allies',
    requires: ['HOLD_GROUND'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.PHALANX },
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
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.ASSASSIN },
    ],
  },
  {
    id: 'PATCH_UP',
    name: 'Patch Up',
    description: 'Scouts can heal adjacent friendly units',
    requires: ['BIG_EYES'],
    cost: 4,
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
      { type: 'STRONGHOLD_CAP_MOD', capType: 'farmer', amount: 2 },
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.STRONGHOLD, resource: ResourceType.WOOD, chancePercent: 100, amount: 1 },
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.STRONGHOLD, resource: ResourceType.IRON, chancePercent: 100, amount: 1 },
    ],
  },
  {
    id: 'CITADEL',
    name: 'Citadel',
    description: 'An imposing fortress that houses nobles and trains elite warriors',
    requires: ['WALLED_SETTLEMENT'],
    cost: 4,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'noble', amount: 2 },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'maxHp', mode: 'add', value: 30 },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.GUARD, stat: 'maxHp', mode: 'add', value: 30 },
    ],
  },
  {
    id: 'NOBLE_HERITAGE',
    name: 'Noble Heritage',
    description: 'Veteran nobility instils resilience in your elite units',
    requires: ['CITADEL'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE,  tag: UnitTag.ELITE },
    ],
  },

  // ── Branch 1 (Cavalry) deep upgrades ──────────────────────────────────────
  {
    id: 'LANCE_CHARGE',
    name: 'Lance Charge',
    description: 'Riders strike harder when they have not yet moved this turn',
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.LANCE_CHARGE },
    ],
  },
  {
    id: 'KNIGHTS',
    name: 'Knights',
    description: 'Heavily armoured cavalry with increased HP and defence',
    requires: ['LANCE_CHARGE'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.KNIGHT },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'PURSUIT',
    name: 'Pursuit',
    description: 'Riders may move after attacking, but suffer reduced defence',
    requires: ['LANCE_CHARGE'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.PURSUIT },
    ],
  },
  {
    id: 'OUTRIDERS',
    name: 'Outriders',
    description: 'Fast raiding cavalry with extended movement; loses build & capture',
    requires: ['PURSUIT'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.OUTRIDER },
      { type: 'REMOVE_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.BUILDANDCAPTURE },
      { type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 2 },
    ],
  },

  // ── Branch 2 (Ranged) deep upgrades ───────────────────────────────────────
  {
    id: 'COVER',
    name: 'Cover',
    description: 'Archers fire from cover and suffer no ranged counter-attacks',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.COVER },
    ],
  },
  {
    id: 'SKIRMISHER',
    name: 'Skirmisher',
    description: 'Archers gain +1 movement range to reposition quickly',
    requires: ['COVER'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.SKIRMISHER },
    ],
  },
  {
    id: 'PIN_DOWN',
    name: 'Pin Down',
    description: 'Archer hits leave the target unable to move on its next action',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.PIN_DOWN },
    ],
  },
  {
    id: 'DISTRACTION',
    name: 'Distraction',
    description: 'Each archer hit permanently chips away at the target\'s defence',
    requires: ['PIN_DOWN'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.DISTRACTION },
    ],
  },

  // ── Branch 3 (Fortification) deep upgrade ─────────────────────────────────
  {
    id: 'PREVENTIVE_STRIKE',
    name: 'Preventive Strike',
    description: 'Siege engines fire automatically at enemy units moving into range',
    requires: ['SIEGE_WORKS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE, tag: UnitTag.PREVENTIVE_STRIKE },
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
  HOLD_GROUND_DEFENSE_BONUS: 20,
  /** Extra move range granted by TO_THE_FRONT flag */
  TO_THE_FRONT_MOVE_BONUS: 1,
  /** Minimum tile distance from lava front required for TO_THE_FRONT bonus to apply */
  TO_THE_FRONT_MIN_DISTANCE: 7,
  /** HP restored per PATCHUP heal action */
  PATCHUP_HEAL_AMOUNT: 50,
  /** Multiplier applied to the building unit's currentHp to determine the Outpost's starting HP */
  FIELDWORK_HP_MULTIPLIER: 2,
  /** Defense bonus granted to each adjacent friendly unit by a PHALANX tag carrier */
  PHALANX_DEFENSE_BONUS_PER_CARRIER: 8,
  /** Attack bonus gained by a PHALANX unit per adjacent friendly unit */
  PHALANX_ATTACK_BONUS_PER_ALLY: 5,
  // ── Deep tech tree abilities ─────────────────────────────────────────────────
  /** Flat attack bonus for a LANCE_CHARGE unit that attacks without having moved */
  LANCE_CHARGE_ATTACK_BONUS: 20,
  /** Permanent DEF reduction applied to a unit each time it is hit by a DISTRACTION archer */
  DISTRACTION_DEF_REDUCTION: 8,
  /** Max HP bonus granted to a unit carrying the ELITE tag */
  ELITE_MAX_HP_BONUS: 20,
  /** DEF change (negative = penalty) applied to a unit carrying the PURSUIT tag */
  PURSUIT_DEFENSE_MOD: -15,
  /** Max HP bonus granted to a unit carrying the KNIGHT tag */
  KNIGHT_MAX_HP_BONUS: 40,
  /** DEF bonus granted to a unit carrying the KNIGHT tag */
  KNIGHT_DEFENSE_BONUS: 15,
} as const;

// ============================================================================
// TAG STAT EFFECTS — stat modifiers applied when a tag is granted to a unit
// ============================================================================

/**
 * Stat changes that are intrinsic to a tag.
 * When a GRANT_UNIT_TAG effect is applied (either retroactively at tech unlock
 * or at unit spawn time), these mods are also applied to the unit's stats.
 * All values are driven by ABILITIES constants so they remain easy to balance.
 */
export const TAG_STAT_EFFECTS: Partial<Record<UnitTag, StatModifier[]>> = {
  [UnitTag.ELITE]:   [{ stat: 'maxHp',   mode: 'add', value: ABILITIES.ELITE_MAX_HP_BONUS }],
  [UnitTag.KNIGHT]:  [
    { stat: 'maxHp',   mode: 'add', value: ABILITIES.KNIGHT_MAX_HP_BONUS },
    { stat: 'defense', mode: 'add', value: ABILITIES.KNIGHT_DEFENSE_BONUS },
  ],
  [UnitTag.PURSUIT]: [{ stat: 'defense', mode: 'add', value: ABILITIES.PURSUIT_DEFENSE_MOD }],
};

// ============================================================================
// TAG INFO — label and description for each unit tag
// ============================================================================

/** Display label and tooltip description for each UnitTag. */
export const TAG_INFO: Record<UnitTag, { label: string; desc: string }> = {
  [UnitTag.RANGED]:            { label: 'Ranged',            desc: 'Attacks from a distance and does not move onto a defeated enemy\'s tile.' },
  [UnitTag.PREP]:              { label: 'Prep',              desc: 'Cannot attack in the same turn it moves. Attack first, then move — or wait a turn after moving.' },
  [UnitTag.BUILDANDCAPTURE]:   { label: 'Build & Capture',   desc: 'Can construct buildings on open terrain and capture enemy strongholds.' },
  [UnitTag.SACRIFICIAL]:       { label: 'Sacrificial',       desc: 'Prioritizes walking toward the lava to be consumed.' },
  [UnitTag.EXPLOSIVE]:         { label: 'Explosive',         desc: 'Deals heavy area damage to all adjacent enemies when it dies.' },
  [UnitTag.FIELDWORK]:         { label: 'Fieldwork',         desc: `Can sacrifice itself on its current tile to instantly erect an Outpost (HP scales with the unit's current HP × ${ABILITIES.FIELDWORK_HP_MULTIPLIER}). Cannot be used on ruins or resource terrain.` },
  [UnitTag.ASSASSIN]:          { label: 'Assassin',          desc: `Deals ${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}× damage and receives no retaliation when striking an enemy that is still at full health.` },
  [UnitTag.PATCHUP]:           { label: 'Patch Up',          desc: `Can spend its action to restore ${ABILITIES.PATCHUP_HEAL_AMOUNT} HP on one adjacent friendly unit.` },
  [UnitTag.PHALANX]:           { label: 'Phalanx',           desc: `Grants +${ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER} defense to each adjacent friendly unit and gains +${ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY} attack per adjacent friendly unit. Bonuses apply during combat only.` },
  [UnitTag.LAVABOOST]:         { label: 'Lava-Boosted',      desc: 'Spawns with boosted stats when its spawning building is close to the lava front.' },
  [UnitTag.CORRUPT]:           { label: 'Corrupt',           desc: 'Can corrupt forest and mountain terrain tiles.' },
  [UnitTag.PASSIVE]:           { label: 'Passive',           desc: 'Cannot initiate attacks. Still defends at full effectiveness when attacked by enemies.' },
  // ── Deep tech tree tags ──────────────────────────────────────────────────────
  [UnitTag.LANCE_CHARGE]:      { label: 'Lance Charge',      desc: `Gains +${ABILITIES.LANCE_CHARGE_ATTACK_BONUS} attack when striking without having moved this turn.` },
  [UnitTag.KNIGHT]:            { label: 'Knight',            desc: `Heavily armoured cavalry with +${ABILITIES.KNIGHT_MAX_HP_BONUS} max HP and +${ABILITIES.KNIGHT_DEFENSE_BONUS} DEF.` },
  [UnitTag.PURSUIT]:           { label: 'Pursuit',           desc: `May move after attacking (in the same turn). DEF is reduced by ${Math.abs(ABILITIES.PURSUIT_DEFENSE_MOD)} as a trade-off for the added mobility.` },
  [UnitTag.OUTRIDER]:          { label: 'Outrider',          desc: '+1 movement range. Cannot construct buildings or capture. Optimised for deep raids.' },
  [UnitTag.COVER]:             { label: 'Cover',             desc: 'Attacks do not trigger ranged counter-attacks from the defender.' },
  [UnitTag.SKIRMISHER]:        { label: 'Skirmisher',        desc: '+1 movement range. Archer can reposition quickly after engaging.' },
  [UnitTag.PIN_DOWN]:          { label: 'Pin Down',          desc: 'Attacks leave the target pinned — it cannot move on its next action.' },
  [UnitTag.DISTRACTION]:       { label: 'Distraction',       desc: `Each hit permanently reduces the target's DEF by ${ABILITIES.DISTRACTION_DEF_REDUCTION}.` },
  [UnitTag.PREVENTIVE_STRIKE]: { label: 'Preventive Strike', desc: 'Fires instantly at any enemy unit that moves into attack range during the enemy\'s turn.' },
  [UnitTag.ELITE]:             { label: 'Elite',             desc: `+${ABILITIES.ELITE_MAX_HP_BONUS} max HP. Elite unit forged in the noble tradition.` },
};

// ============================================================================
// SANCTUM COLLAPSE CONFIGURATION
// ============================================================================

export const SANCTUM_COLLAPSE = {
  /**
   * Number of turns enemy units are barred from crossing the lower border of
   * the captured INFERNALSANCTUM's zone after a Sanctum Collapse event.
   *
   * The "lower border" is the row that separates the captured zone from the
   * next lower zone (toward the player). Enemy units already below that row
   * are unaffected; the lockout only prevents new crossings from above.
   *
   * Set to 0 to disable the Sanctum Collapse feature entirely. When 0:
   *   - No zone purge occurs on INFERNALSANCTUM capture.
   *   - No zone lockout is applied.
   *   - No SANCTUM_COLLAPSE GameEvent is emitted.
   *   - No new state fields are written.
   */
  ZONE_LOCKOUT_TURNS: 4,

  /**
   * Number of turns enemy unit spawning is completely suppressed after a
   * Sanctum Collapse event. All LAVALAIR and INFERNALSANCTUM buildings stop
   * producing units for this many player turns.
   * Set to 0 to disable the spawn freeze effect while keeping other effects active.
   */
  SPAWN_FREEZE_TURNS: 3,

  /**
   * Number of turns the lava advance countdown is frozen after a Sanctum
   * Collapse event. turnsUntilLavaAdvance is not decremented while the freeze
   * is active, effectively pausing lava pressure.
   * Set to 0 to disable the lava pause effect while keeping other effects active.
   */
  LAVA_FREEZE_TURNS: 2,
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
  UNIT_DEFINITIONS,
  BUILDING_DEFINITIONS,
  BUILDINGS,
  RESOURCES,
  TERRAIN,
  POPULATION,
  ENEMY,
  AI_SCORING,
  AI_RECRUITMENT,
  XP,
  LEVEL_UP_VALUES,
  TECH,
  TECH_TREE,
  CRYSTAL_CHAMBER_CONFIG,
  ABILITIES,
  SANCTUM_COLLAPSE,
} as const;

export default GAME_CONFIG;
