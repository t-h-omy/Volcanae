/**
 * Enemy spawn, wave theme, AI scoring, AI recruitment, and Sanctum Collapse configuration.
 */


export const LAVA_LAIR = {
  /** Number of turns between EMBER_NEST Emberling spawns */
  EMBER_NEST_SPAWN_INTERVAL: 3,
  /** Maximum number of EMBERLINGs allowed near an EMBER_NEST (within 8 tiles) */
  EMBER_NEST_MAX_EMBERLINGS: 2,
} as const;


export const ENEMY = {
  /** Maximum distance from lava for boost calculation */
  MAX_LAVA_BOOST_DISTANCE: 20,
  /** Maximum multiplier for lava proximity boost */
  MAX_LAVA_BOOST_MULTIPLIER: 0,
  /** Number of player turns between automatic threat level increases */
  THREAT_LEVEL_INCREASE_INTERVAL: 10,
} as const;

/**
 * SPAWN BUDGET SYSTEM
 *
 * Replaces per-building spawn probability. Each enemy turn ONE global budget
 * (expected spawns per turn) is computed, paid into a fractional accumulator,
 * and whole spawns are distributed over eligible spawner buildings by
 * distance-to-player weighting. Over any stretch of turns the spawn COUNT
 * equals the summed budget exactly (zero streak variance); randomness remains
 * only in WHICH building spawns and WHICH unit type.
 *
 * HOW TO TUNE (read before changing values):
 * - Quantity over a run: budget = clamp(BASE_BUDGET + ember * EMBER_BUDGET_PER_LEVEL
 *   + ddaRelief, MIN_BUDGET, MAX_BUDGET). The ember scaling stops mattering once
 *   BASE_BUDGET + ember * EMBER_BUDGET_PER_LEVEL >= MAX_BUDGET; ember levels beyond
 *   that point raise only unit quality (unlock tiers), not quantity.
 * - DDA relief is RELIEF ONLY (never positive) and only active while contactActive
 *   (see DDA_CONTACT_RANGE). It starts once margin < DDA_EXPECTED_MARGIN and grows
 *   by DDA_PER_ROW per missing row until DDA_MIN. Full DDA_MIN is reached at
 *   margin = DDA_EXPECTED_MARGIN + DDA_MIN / DDA_PER_ROW.
 * - The MIN_BUDGET floor absorbs relief at low ember: the full DDA_MIN only has
 *   full effect while BASE_BUDGET + ember * EMBER_BUDGET_PER_LEVEL + DDA_MIN
 *   >= MIN_BUDGET; below that, part of the relief is clamped away and the enemy
 *   never drops under MIN_BUDGET spawns per turn.
 * - Throughput ceiling: at most 1 spawn per eligible spawner per turn, so the
 *   number of living spawner buildings hard-caps output regardless of budget;
 *   surplus banks in the accumulator up to ACCUMULATOR_CAP and is discarded
 *   beyond it. ACCUMULATOR_CAP must stay > MAX_BUDGET or budget is silently
 *   lost EVERY turn even without blockades.
 * - Spatial concentration: weight falls linearly from WEIGHT_MAX at distance 0
 *   to WEIGHT_MIN, which is reached at distance
 *   (WEIGHT_MAX - WEIGHT_MIN) / WEIGHT_DECAY_PER_TILE; beyond that all rear
 *   spawners are equally (un)likely. Spawners with a player unit inside their
 *   discoverRadius additionally multiplies their weight by
 *   WEIGHT_IN_RANGE_MULTIPLIER (superlinear front focus). Sharpen concentration
 *   via WEIGHT_DECAY_PER_TILE or the multiplier; give the deep rear more
 *   activity via WEIGHT_MIN.
 */
export const SPAWN_BUDGET = {
  /** Expected spawns per turn at ember 0 (before relief and clamps) */
  BASE_BUDGET: 1.25,
  /** Budget added per ember level; quantity saturates once the MAX_BUDGET clamp binds (see block comment) */
  EMBER_BUDGET_PER_LEVEL: 0.25,
  /** Floor: the enemy never produces fewer expected spawns per turn than this, DDA relief cannot push below it */
  MIN_BUDGET: 1.0,
  /** Ceiling: expected spawns per turn never exceed this, regardless of ember */
  MAX_BUDGET: 5.0,
  /** Frontline-to-lava margin (in rows) below which DDA relief starts; at or above it relief is 0 */
  DDA_EXPECTED_MARGIN: 12,
  /** Relief per row of missing margin (subtracted from the budget) */
  DDA_PER_ROW: 0.25,
  /** Maximum total relief (most negative value the DDA term can take) */
  DDA_MIN: -3.0,
  /** DDA gate: relief only applies while any enemy entity (unit or building) is within this edge-circle range of any player entity; prevents permanent early-game relief from spawning close to the lava without any enemy contact */
  DDA_CONTACT_RANGE: 3,
  /** Max banked fractional/blocked spawn debt; must stay greater than MAX_BUDGET (see block comment) */
  ACCUMULATOR_CAP: 6.0,
  /** Selection weight at distance 0 to the nearest player unit */
  WEIGHT_MAX: 10,
  /** Selection weight floor for distant spawners; also the uniform weight when no player units exist */
  WEIGHT_MIN: 1,
  /** Weight lost per tile of edge-circle distance to the nearest player unit */
  WEIGHT_DECAY_PER_TILE: 0.5,
  /** Extra multiplier on top of the distance weight for spawners with a player unit inside their discoverRadius */
  WEIGHT_IN_RANGE_MULTIPLIER: 3,
} as const;


export const ENEMY_WAVE_THEME = {
  /** Number of ember tiers above current ember allowed in theme composition */
  UNLOCK_LOOKAHEAD: 1,
  /** Minimum number of distinct unit types in a themed wave */
  MIN_UNIT_TYPES: 1,
  /** Maximum number of distinct unit types in a themed wave */
  MAX_UNIT_TYPES: 3,
  /** Minimum percentage of wave slots a unit type must fill to qualify as the theme */
  MIN_UNIT_PERCENT: 15,
  /** Filler-unit percent ranges by core theme size (1, 2, 3) */
  FILLER_PERCENT_RANGE_BY_THEME_SIZE: {
    1: { min: 15, max: 35 },
    2: { min: 0, max: 0 },
    3: { min: 0, max: 0 },
  },
  /** Probability (0–1) that the wave reads the player army to counter-pick */
  READ_PLAYER_CHANCE: 0.2,
  /** Minimum number of counter-pick waves per game */
  READ_PLAYER_MIN_PER_GAME: 1,
  /** Maximum number of counter-pick waves per game */
  READ_PLAYER_MAX_PER_GAME: 2,
  /** Number of counter units spawned in a counter-pick wave */
  READ_PLAYER_COUNTER_PICK: 3,
  /** Maximum number of re-rolls when trying to avoid a repeated wave composition */
  ANTI_REPEAT_MAX_REROLLS: 8,
} as const;


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

  /**
   * Bonus added to ATTACK_UNIT / MOVE_TO_UNIT scores when a GRIMBEAK is targeting
   * a SUMMONED unit (Ember Demon, Skeleton, etc.). Ensures GRIMBEAK prefers
   * summoned targets over equally-rated non-summoned targets.
   */
  GRIMBEAK_SUMMONED_TARGET_BONUS: 30,
} as const;

export const AI_RECRUITMENT = {

  // ── Base scores per unit type ────────────────────────────────────────────
  // Starting score before any context bonuses or penalties are applied.
  // Keep low - context should drive decisions. Adjust for coarse balancing.
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

  // ── Per-unit recruitment scoring: advanced enemy units ─────────────────────
  // Base scores
  BASE_SCORE_REAPER: 60,
  BASE_SCORE_LANCER: 55,
  BASE_SCORE_BULLWARK: 55,
  BASE_SCORE_KINDLER: 50,
  BASE_SCORE_RIFTWORM: 55,
  BASE_SCORE_GRIMBEAK: 50,
  BASE_SCORE_RIFT_LORD: 70,
  // REAPER
  REAPER_BONUS_CLUSTER_TARGET: 30,
  REAPER_BONUS_SLOW_MELEE_HEAVY: 20,
  REAPER_PENALTY_FAST_PLAYER: -15,
  // LANCER
  LANCER_BONUS_BACKLINE_FORMATION: 25,
  LANCER_BONUS_MAGE_PRESENT: 30,
  LANCER_PENALTY_OVERREPRESENTED: -20,
  // BULLWARK
  BULLWARK_BONUS_GUARDS_PRESENT: 25,
  BULLWARK_BONUS_MELEE_PROTECTION_NEEDED: 15,
  BULLWARK_PENALTY_PLAYER_RANGED: -20,
  // KINDLER
  KINDLER_BONUS_STATIC_FORMATION: 25,
  KINDLER_BONUS_RANGED_GAP: 15,
  KINDLER_PENALTY_MOBILE_PLAYER: -20,
  // RIFTWORM
  RIFTWORM_BONUS_DENSE_FORMATION: 30,
  RIFTWORM_BONUS_BACKLINE_TARGETS: 25,
  RIFTWORM_BONUS_FRONTLINE_BYPASS: 20,
  RIFTWORM_PENALTY_SPREAD_PLAYER: -15,
  // GRIMBEAK
  GRIMBEAK_BONUS_SUMMONED_PRESENT: 25,
  GRIMBEAK_BONUS_BRANDMARK_ACTIVE: 20,
  GRIMBEAK_BONUS_CLUSTER_TARGET: 20,
  // RIFT_LORD
  RIFT_LORD_BACKLINE_THRESHOLD: 50,
  RIFT_LORD_BONUS_HIGH_BACKLINE_VALUE: 35,
  RIFT_LORD_BONUS_PLAYER_DOMINATING: 25,
  RIFT_LORD_PENALTY_NO_PORTAL_USERS: -30,

} as const;

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
  SPAWN_FREEZE_TURNS: 2,

  /**
   * Amount added to turnsUntilLavaAdvance when a Sanctum Collapse is triggered.
   * This directly increases the countdown until the next lava advance, buying
   * the player extra time without fully freezing the lava clock.
   * Set to 0 to disable this bonus while keeping other Sanctum Collapse effects active.
   */
  LAVA_ADVANCE_BONUS_TURNS: 0,
} as const;


