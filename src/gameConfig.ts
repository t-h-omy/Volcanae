/**
 * Gameplay and balance configuration for Volcanae.
 * Contains only pure gameplay constants (map layout, unit stats, AI parameters,
 * resource rates, XP/level-up values, etc.).
 * Presentation-layer constants (animation, UI, rendering, input) live in
 * animationConfig.ts, uiConfig.ts, renderConfig.ts, and inputConfig.ts.
 */

import { UnitTag, DestroyBehavior, BuildingType, UnitType, ResourceType, TechFlag, Difficulty, SpellId } from './types';
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
  STRONGHOLD_SPAWN_SKIP_LAST_ROWS: 1,
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
  /** Per-building unit limit (max live Mages per Crystal Chamber) */
  CHAMBER_UNIT_LIMIT: 1,
} as const;

// ============================================================================
// MAGE SYSTEM CONFIGURATION
// ============================================================================

export const MAGE = {
  // ── Mage unit ────────────────────────────────────────────────────────
  /** Default spell range (edge-circle range) before SPELL_REACH is researched */
  SPELL_RANGE_BASE: 2,
  /** Range bonus granted by the SPELL_REACH tech */
  SPELL_RANGE_BONUS: 1,

  // ── Ember Demon spell/leash parameters ──────────────────────────────
  /** Tile range within which a Mage must remain to keep its summoned demon LEASHED */
  EMBER_DEMON_LEASH_RANGE: 2,
  /** Crystals granted to the player when a hostile EMBER_DEMON is killed by the player */
  EMBER_DEMON_KILL_CRYSTAL_REWARD: 1,

  // ── Spell parameters ─────────────────────────────────────────────────
  /** HP lost by a BRANDMARKED unit at the end of every player turn */
  BRANDMARK_HP_LOSS_PER_TURN: 5,
  /** Flat ATK bonus while the BRANDMARKED tag is on a unit */
  BRANDMARK_ATTACK_BONUS: 20,
  /** Number of turns a unit is stunned after stepping on a GRAVE_TRAP (this turn + next) */
  GRAVE_TRAP_STUN_TURNS: 2,
  /** Percentage of the sacrificed unit's CURRENT HP dealt to each adjacent enemy by Explode */
  EXPLODE_DAMAGE_PERCENT: 50,

  // ── Crystal Tower reward ─────────────────────────────────────────────
  /** Crystals granted when an enemy unit is killed by a CRYSTAL_TOWER */
  CRYSTAL_TOWER_KILL_CRYSTAL_REWARD: 1,

  // ── GRAVE_HARVEST tech parameters ────────────────────────────────────
  /** Per-turn percent chance for each player-owned GRAVESTONE to grant 1 crystal */
  GRAVE_HARVEST_CRYSTAL_CHANCE: 25,
} as const;

// ============================================================================
// SPELL DEFINITIONS
// ============================================================================

export interface SpellDefinition {
  id: SpellId;
  name: string;
  emoji: string;
  description: string;
  /** Hint shown in the cast-mode focused HUD before the first target pick */
  targetHint: string;
  /** Optional second-pick hint (only Transpose uses this) */
  targetHintSecondPick?: string;
}

export const SPELL_DEFINITIONS: Record<SpellId, SpellDefinition> = {
  [SpellId.TRANSPOSE]: {
    id: SpellId.TRANSPOSE,
    name: 'Transpose',
    emoji: '🔄',
    description: `Swap the positions of two units of the same faction within ${MAGE.SPELL_RANGE_BASE} tiles of the Mage.`,
    targetHint: 'Select the first unit to swap.',
    targetHintSecondPick: 'Select the second unit (same faction as the first).',
  },
  [SpellId.EMBERBIND]: {
    id: SpellId.EMBERBIND,
    name: 'Emberbind',
    emoji: '🔥',
    description: `Target an Ember Nest within ${MAGE.SPELL_RANGE_BASE} tiles. The nest is destroyed (forest restored) and a friendly Ember Demon appears, leashed within ${MAGE.EMBER_DEMON_LEASH_RANGE} tiles of its Mage.`,
    targetHint: 'Select an Ember Nest within range.',
  },
  [SpellId.BRANDMARK_HEAL]: {
    id: SpellId.BRANDMARK_HEAL,
    name: 'Brandmark Heal',
    emoji: '🩸',
    description: `Fully heal one player unit, grant +${MAGE.BRANDMARK_ATTACK_BONUS} ATK, and mark it with the brand. The marked unit loses ${MAGE.BRANDMARK_HP_LOSS_PER_TURN} HP at the end of each turn. On death, a hostile Ember Demon rises in its place.`,
    targetHint: 'Select one of your own units within range (not another Mage).',
  },
  [SpellId.RAISE_SKELETON]: {
    id: SpellId.RAISE_SKELETON,
    name: 'Raise Skeleton',
    emoji: '💀',
    description: `Target a Gravestone within ${MAGE.SPELL_RANGE_BASE} tiles to raise a Skeleton. The gravestone is consumed.`,
    targetHint: 'Select a player Gravestone within range.',
  },
  [SpellId.FROSTCRAFT]: {
    id: SpellId.FROSTCRAFT,
    name: 'Frostcraft',
    emoji: '❄️',
    description: `Freeze a Water tile within ${MAGE.SPELL_RANGE_BASE} tiles. Player units may walk on the ice; enemies cannot. The ice persists until consumed by lava.`,
    targetHint: 'Select a water tile within range.',
  },
  [SpellId.GRAVE_TRAP]: {
    id: SpellId.GRAVE_TRAP,
    name: 'Grave Trap',
    emoji: '☠️',
    description: `Convert a Gravestone within ${MAGE.SPELL_RANGE_BASE} tiles into a magical trap. The next unit to step onto it (any faction) is stunned for ${MAGE.GRAVE_TRAP_STUN_TURNS} turns.`,
    targetHint: 'Select a player Gravestone within range.',
  },
  [SpellId.EXPLODE]: {
    id: SpellId.EXPLODE,
    name: 'Explode',
    emoji: '💥',
    description: `Sacrifice a player unit within ${MAGE.SPELL_RANGE_BASE} tiles. It deals ${MAGE.EXPLODE_DAMAGE_PERCENT}% of its current HP to each adjacent enemy. The sacrificed unit leaves a gravestone unless a tag forbids it.`,
    targetHint: 'Select one of your own units within range to sacrifice.',
  },
  [SpellId.CRYSTAL_TOWER]: {
    id: SpellId.CRYSTAL_TOWER,
    name: 'Crystal Tower',
    emoji: '💎',
    description: `Sacrifice the Mage to erect a permanent Crystal Tower on its tile. Each enemy unit the tower kills generates ${MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD} crystal.`,
    targetHint: "The Mage will be consumed where it stands. Confirm by selecting the Mage's tile.",
  },
};

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
  MAX_THREAT_BONUS: 0.3,
  /** Threat level at which the full MAX_THREAT_BONUS is reached */
  MAX_THREAT: 25,
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
  /** Minimum number of forest tiles placed per zone (used if no zone-specific override is set) */
  FORESTS_PER_ZONE_MIN: 2,
  /** Maximum number of forest tiles placed per zone (used if no zone-specific override is set) */
  FORESTS_PER_ZONE_MAX: 3,
  /**
   * Optional per-zone forest min/max overrides.
   * Keys are zone numbers (1–5). Missing keys fall back to FORESTS_PER_ZONE_MIN/MAX.
   * Example: { 1: { min: 1, max: 2 }, 3: { min: 3, max: 5 } }
   */
  FORESTS_PER_ZONE_OVERRIDES: {} as Record<number, { min: number; max: number }>,
  /** Minimum number of mountain tiles placed per zone (used if no zone-specific override is set) */
  MOUNTAINS_PER_ZONE_MIN: 2,
  /** Maximum number of mountain tiles placed per zone (used if no zone-specific override is set) */
  MOUNTAINS_PER_ZONE_MAX: 3,
  /**
   * Optional per-zone mountain min/max overrides.
   * Keys are zone numbers (1–5). Missing keys fall back to MOUNTAINS_PER_ZONE_MIN/MAX.
   * Example: { 1: { min: 1, max: 2 }, 3: { min: 3, max: 5 } }
   */
  MOUNTAINS_PER_ZONE_OVERRIDES: {} as Record<number, { min: number; max: number }>,
  /** Minimum number of ruin tiles placed per zone (used if no zone-specific override is set) */
  RUINS_PER_ZONE_MIN: 7,
  /** Maximum number of ruin tiles placed per zone (used if no zone-specific override is set) */
  RUINS_PER_ZONE_MAX: 8,
  /**
   * Optional per-zone ruin min/max overrides.
   * Keys are zone numbers (1–5). Missing keys fall back to RUINS_PER_ZONE_MIN/MAX.
   * Example: { 1: { min: 4, max: 5 }, 5: { min: 10, max: 12 } }
   */
  RUINS_PER_ZONE_OVERRIDES: {} as Record<number, { min: number; max: number }>,
  /** Minimum number of ruin tiles placed in the lava buffer rows */
  RUINS_IN_LAVA_BUFFER_MIN: 3,
  /** Maximum number of ruin tiles placed in the lava buffer rows */
  RUINS_IN_LAVA_BUFFER_MAX: 4,
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
  /**
   * Minimum edge-circle distance from the zone 1 stronghold for the guaranteed
   * mountain tile placement in zone 1.
   */
  ZONE1_MOUNTAIN_MIN_DISTANCE: 1,
  /**
   * Maximum edge-circle distance from the zone 1 stronghold for the guaranteed
   * mountain tile placement in zone 1.
   */
  ZONE1_MOUNTAIN_MAX_DISTANCE: 3,

  // Canyon config
  CANYON_LENGTH_MIN: 8,
  CANYON_LENGTH_MAX: 13,
  CANYON_DRIFT_CHANCE: 0.25,
  CANYON_WIDTH_VARIANCE_CHANCE: 0.75,
  CANYONS_PER_ZONE_MIN: 0,
  CANYONS_PER_ZONE_MAX: 2,

  // Lake config
  LAKE_WIDTH_MIN: 2,
  LAKE_WIDTH_MAX: 5,
  LAKE_HEIGHT_MIN: 2,
  LAKE_HEIGHT_MAX: 5,
  LAKE_EROSION_CHANCE: 0.3,
  LAKES_PER_ZONE_MIN: 0,
  LAKES_PER_ZONE_MAX: 2,

  // Traversability
  MIN_PASSABLE_TILES_PER_ROW: 1,
  MAX_TRAVERSABILITY_RETRIES: 10,
  IMPASSABLE_MIN_DISTANCE_FROM_STRONGHOLD: 2,

  /** Probability that a Mountain tile has a cave monster; checked once per tile at map gen */
  CAVE_MONSTER_SPAWN_CHANCE: 0.33,
  /**
   * Per-zone HP/ATK/DEF multiplier for the cave monster (index 0 = zone 1, index 4 = zone 5).
   * Higher zones are deeper into enemy territory and have stronger monsters.
   */
  CAVE_MONSTER_ZONE_SCALE: [1.0, 1.2, 1.4, 1.6, 1.8] as const,
  /**
   * Chebyshev-distance radius within which the cave monster will patrol.
   * If the monster wanders outside this radius (no aggro), it returns to its home tile.
   * Once back on the home tile it may despawn the following turn.
   */
  CAVE_MONSTER_PATROL_RADIUS: 3,

  // Long-deadend prevention (canyon/lake placement validation)
  /**
   * A canyon or lake candidate is rejected if it would create a side pocket where any
   * walkable tile is more than this many BFS steps away from the "forward core"
   * (the main south-to-north corridor through the zone).
   * Increase to allow deeper side branches; decrease to keep the map more open.
   */
  WORLDGEN_MAX_DEADEND_DEPTH: 12,
  /**
   * Controls how wide the "forward core" is.
   * The core consists of every walkable tile whose combined BFS distance to the south band
   * AND to the north band is at most (shortestSouthToNorthPath + WORLDGEN_MAIN_PATH_SLACK).
   * A value of 0 would include only tiles that lie exactly on a shortest path; higher values
   * widen the core to include tiles that take a slight detour, making the deadend check
   * more lenient about terrain placed near (but not on) the critical corridor.
   */
  WORLDGEN_MAIN_PATH_SLACK: 4,
  /**
   * How many rows at each end of a zone are used as BFS seeds for the south-to-north
   * distance calculation.
   * The bottom N rows of a zone form the "south band" (seed for distanceFromSouth) and
   * the top N rows form the "north band" (seed for distanceFromNorth).
   * Increasing this makes the bands wider, so more tiles qualify as band-adjacent
   * starting points for the forward-core BFS.
   */
  WORLDGEN_DEADEND_BAND_ROWS: 2,
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
  STRONGHOLD_NOBLE_CAP: 2,
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
  HP_BOOST_DEFAULT2: 30,
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
 *
 * Description authoring: see the DESCRIPTION AUTHORING RULE above the ABILITIES
 * constant. Descriptions that must reference the unit's own stats (attackRange,
 * moveRange, etc.) or config constants are set in the "Compute descriptions for
 * UNIT_DEFINITIONS" block below — use placeholder text here that contains NO
 * hardcoded balancing numbers (mark with `// overwritten below`).
 */
export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  SPEARMAN: {
    maxHp: 100, attack: 40, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 2, wood: 3 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Versatile foot soldier that can move, fight, build structures, and capture enemy buildings.',
  },

  SWORDSMAN: {
    maxHp: 100, attack: 55, defense: 50,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 7, wood: 4 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Heavy infantry with superior combat strength. Unlocked by the Swordsman training tech.',
  },

  ARCHER: {
    maxHp: 100, attack: 50, defense: 35,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.BUILDANDCAPTURE],
    cost: { iron: 2, wood: 5 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Ranged attacker that strikes from range without stepping into melee.', // overwritten below
  },

  RIDER: {
    maxHp: 80, attack: 65, defense: 35,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 6, wood: 3 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Swift cavalry that outflanks and pressures the enemy.', // overwritten below
  },

  SIEGE: {
    maxHp: 70, attack: 80, defense: 0,
    movementActions: 1, moveRange: 1, attackRange: 3,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.PREP],
    cost: { iron: 7, wood: 7 },
    populationCost: { farmers: 1, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Long-range bombard; cannot fire in the same turn it moves.', // overwritten below
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
    maxHp: 100, attack: 20, defense: 75,
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
    maxHp: 100, attack: 55, defense: 20,
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
    description: 'Enemy ranged unit that attacks from range.', // overwritten below
  },

  LAVA_RIDER: {
    maxHp: 100, attack: 70, defense: 30,
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
    description: 'Enemy fast cavalry.', // overwritten below
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
    description: 'Enemy long-range bombard.', // overwritten below
  },

  EMBERLING: {
    maxHp: 45, attack: 0, defense: 15,
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
    description: 'Fragile fire spirit that walks toward lava. Explodes when it cannot move closer to lava.', // overwritten below
  },

  CAVE_MONSTER: {
   maxHp: 120, attack: 55, defense: 40,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 3, triggerRange: 3,
    tags: [],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'A monstrous creature that emerged from deep within a mountain cave.',
  },

  MAGE: {
    maxHp: 60, attack: 0, defense: 25,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.PASSIVE, UnitTag.PREP],
    cost: { iron: 2, wood: 5 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
    ],
    description: 'Arcane caster that casts spells instead of attacking. Recruited from active Crystal Chambers.', // overwritten below
  },

  EMBER_DEMON: {
    maxHp: 120, attack: 70, defense: 40,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    ],
    description: 'Powerful demonic unit. Can be summoned by a Mage or encountered as a hostile enemy.', // overwritten below
  },

  SKELETON: {
    maxHp: 60, attack: 35, defense: 20,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    description: 'Undead warrior raised from a gravestone by a Mage via the Raise Skeleton spell.', // overwritten below
  },
};

// Compute descriptions for UNIT_DEFINITIONS entries that reference their own stats.
// All numeric values here are read from the unit definition or ABILITIES — never
// hardcoded literals. See the DESCRIPTION AUTHORING RULE above ABILITIES.
{
  const u = UNIT_DEFINITIONS;
  u.ARCHER.description      = `Ranged attacker that strikes from ${u.ARCHER.attackRange} tiles away without stepping into melee range.`;
  u.RIDER.description       = `Swift cavalry that covers ${u.RIDER.moveRange} tiles per move to outflank and pressure the enemy.`;
  u.SIEGE.description       = `Long-range bombard with ${u.SIEGE.attackRange}-tile reach; cannot fire in the same turn it moves.`;
  u.LAVA_ARCHER.description = `Enemy ranged unit that attacks from ${u.LAVA_ARCHER.attackRange} tiles away.`;
  u.LAVA_RIDER.description  = `Enemy fast cavalry that covers ${u.LAVA_RIDER.moveRange} tiles per move.`;
  u.LAVA_SIEGE.description  = `Enemy long-range bombard with ${u.LAVA_SIEGE.attackRange}-tile reach.`;
  u.EMBERLING.description   = `Fragile fire spirit that walks toward lava. Explodes on death, dealing ${u.EMBERLING.explosionDamage} damage to all units within 1 tile.`;
  u.MAGE.description        = `Arcane caster that casts spells within ${MAGE.SPELL_RANGE_BASE} tiles instead of attacking. Recruited from active Crystal Chambers.`;
  u.EMBER_DEMON.description = `Powerful demonic unit with ${u.EMBER_DEMON.maxHp} HP. Can be summoned by a Mage or encountered as a hostile enemy.`;
  u.SKELETON.description    = `Undead warrior raised from a gravestone by a Mage via the Raise Skeleton spell.`;
}

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
  /**
   * Maximum number of units of the recruitable type(s) per building of this type.
   * The global cap = (number of player-owned buildings of this type) × unitLimit.
   * Only relevant for recruitment buildings; undefined means no cap.
   * All current recruitment buildings use 5.
   */
  unitLimit?: number;
  description: string;
}

/**
 * Single source of truth for all per-building data.
 * Replaces BUILDINGS.DISCOVER_RADIUS, BUILDINGS.DESTROY_BEHAVIOR,
 * BUILDINGS.WATCHTOWER_STATS, BUILDINGS.OUTPOST_STATS, LAVA_LAIR.MAGMA_SPYR_STATS,
 * CONSTRUCTION.*_COST, CRYSTAL_CHAMBER_CONFIG.COST, and CRYSTAL_CHAMBER_CONFIG.DISCOVER_RADIUS.
 *
 * Description authoring: see the DESCRIPTION AUTHORING RULE above the ABILITIES
 * constant. Descriptions that must reference the building's own combatStats or
 * config constants are set in the "Compute descriptions for BUILDING_DEFINITIONS"
 * block below — use placeholder text here that contains NO hardcoded balancing
 * numbers (mark with `// overwritten below`).
 */
export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  STRONGHOLD: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
    unitLimit: 5,
    description: 'Your capital — if you lose all your strongholds, the game is over.',
  },
  MINE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 2 },
    description: 'Produces iron every turn, the primary resource for training units.', // overwritten below
  },
  WOODCUTTER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Produces wood every turn, used alongside iron for buildings and recruitment.', // overwritten below
  },
  BARRACKS: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 2, wood: 2 },
    unitLimit: 5,
    description: 'Military hall that trains Spearman and Swordsman.',
  },
  ARCHER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 1, wood: 3 },
    unitLimit: 5,
    description: 'Archery range that trains Archers.',
  },
  RIDER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 5, wood: 3 },
    unitLimit: 5,
    description: 'Stable that trains Riders.',
  },
  SIEGE_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 3, wood: 5 },
    unitLimit: 5,
    description: 'Engineering works that trains Siege engines.',
  },
  WATCHTOWER: {
    discoverRadius: 4,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 1, wood: 1 },
    combatStats: { maxHp: 150, attack: 50, defense: 65, attackRange: 3 },
    description: 'Defensive tower that attacks nearby enemies and expands your vision.', // overwritten below
  },
  OUTPOST: {
    discoverRadius: 3,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    combatStats: { maxHp: 200, attack: 40, defense: 55, attackRange: 2 },
    description: 'Field fortification built by Spearmen via Fieldwork. Attacks nearby enemies. Starting HP is based on the building unit\'s current HP.', // overwritten below
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
    description: 'Corrupted mountain spire that attacks nearby units multiple times per turn.', // overwritten below
  },
  EMBERNEST: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RESOURCE,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Corrupted forest nest that periodically spawns Emberlings.', // overwritten below
  },
  CRYSTAL_CHAMBER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 4, wood: 2 },
    unitLimit: CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT,
    description: 'Arcane resonator. When a Crystal Chamber is consumed by lava, all surviving chambers begin resonating and generate crystals each turn.', // overwritten below
  },
  GRAVESTONE: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: 'The grave of a fallen warrior.', // overwritten below (after ABILITIES)
  },
  GRAVE_TRAP: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: 'A magic trap forged from a gravestone.', // overwritten below (after MAGE)
  },
  CRYSTAL_TOWER: {
    discoverRadius: 3,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 0 },
    combatStats: {
      maxHp: 200,
      attack: 40,
      defense: 55,
      attackRange: 2,
      maxAttacksPerTurn: 1,
    },
    description: 'Arcane combat tower raised by sacrificing a Mage.', // overwritten below (after MAGE)
  },
};

// Compute descriptions for BUILDING_DEFINITIONS entries that reference their own stats or config constants.
// All numeric values here are read from combatStats, RESOURCES, LAVA_LAIR, or CRYSTAL_CHAMBER_CONFIG —
// never hardcoded literals. See the DESCRIPTION AUTHORING RULE above ABILITIES.
{
  const b = BUILDING_DEFINITIONS;
  b.MINE.description       = `Produces ${RESOURCES.MINE_IRON_PER_TURN} iron per turn, the primary resource for training units.`;
  b.WOODCUTTER.description = `Produces ${RESOURCES.WOODCUTTER_WOOD_PER_TURN} wood per turn, used alongside iron for buildings and recruitment.`;
  b.WATCHTOWER.description = `Defensive tower that attacks enemies within ${b.WATCHTOWER.combatStats!.attackRange} tiles and expands your vision.`;
  b.OUTPOST.description    = `Field fortification built by Spearmen via Fieldwork. Attacks enemies within ${b.OUTPOST.combatStats!.attackRange} tiles. Starting HP is based on the building unit's current HP, capped at ${b.OUTPOST.combatStats!.maxHp}.`;
  b.MAGMASPYR.description  = `Corrupted mountain spire that attacks nearby units up to ${b.MAGMASPYR.combatStats!.maxAttacksPerTurn} times per turn.`;
  b.EMBERNEST.description  = `Corrupted forest nest that spawns Emberlings every ${LAVA_LAIR.EMBER_NEST_SPAWN_INTERVAL} turns.`;
  b.CRYSTAL_CHAMBER.description = `Arcane resonator. When a Crystal Chamber is consumed by lava, all surviving chambers begin resonating and generate ${CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN} crystal${CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN !== 1 ? 's' : ''} per turn. While active, can recruit up to ${CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT} Mage at a time once Arcane Awakening is researched.`;
}

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
// ABILITIES — Balance-tunable constants for tag/flag-based abilities
// (Placed before TECH_TREE so node descriptions can reference these values.)
//
// ── DESCRIPTION AUTHORING RULE (applies to ALL description fields) ──────────
// Every numeric balancing value that appears in any description string
// (TECH_TREE, TAG_INFO, UNIT_DEFINITIONS, BUILDING_DEFINITIONS) MUST be
// injected via a template-literal reference to a named constant — never write
// raw numbers directly into description text.
//
// ✓  `Gain +${ABILITIES.HOLD_GROUND_DEFENSE_BONUS} defense`
// ✗  `Gain +20 defense`
//
// If a value does not yet have a named constant, add it here (or to the
// relevant config object) first, then reference it in the description.
// This keeps every visible number in sync with the actual gameplay logic
// whenever a constant is tuned.
// ============================================================================

export const ABILITIES = {
  /** Damage multiplier applied when ASSASSIN tag attacks a full-HP target */
  ASSASSIN_DAMAGE_MULTIPLIER: 3,
  /** Flat defense bonus applied when HOLD_GROUND flag is active and unit stands on own building */
  HOLD_GROUND_DEFENSE_BONUS: 20,
  /** Extra move range granted by TO_THE_FRONT flag */
  TO_THE_FRONT_MOVE_BONUS: 1,
  /** Minimum tile distance from lava front required for TO_THE_FRONT bonus to apply */
  TO_THE_FRONT_MIN_DISTANCE: 6,
  /** HP restored per PATCHUP heal action */
  PATCHUP_HEAL_AMOUNT: 50,
  /** Multiplier applied to the building unit's currentHp to determine the Outpost's starting HP */
  FIELDWORK_HP_MULTIPLIER: 3,
  /** Defense bonus granted to each adjacent friendly unit by a PHALANX tag carrier */
  PHALANX_DEFENSE_BONUS_PER_CARRIER: 8,
  /** Attack bonus gained by a PHALANX unit per adjacent friendly unit */
  PHALANX_ATTACK_BONUS_PER_ALLY: 5,
  // ── Deep tech tree abilities ─────────────────────────────────────────────────
  /** Flat attack bonus for a LANCE_CHARGE unit that attacks without having moved */
  LANCE_CHARGE_ATTACK_BONUS: 20,
  /** Permanent DEF reduction applied to the target each time it is hit by a DISTRACTION archer */
  DISTRACTION_DEF_REDUCTION: 8,
  /** Static ATK penalty applied to archers carrying the DISTRACTION tag */
  DISTRACTION_ATTACK_MOD: -10,
  /** Max HP bonus granted to a unit carrying the ELITE tag */
  ELITE_MAX_HP_BONUS: 20,
  /** DEF change (negative = penalty) applied to a unit carrying the HIT_AND_RUN tag */
  HIT_AND_RUN_DEFENSE_MOD: -15,
  /** Maximum movement range allowed for a HIT_AND_RUN post-attack move */
  HIT_AND_RUN_POST_ATTACK_MOVE_RANGE: 1,
  /** Max HP bonus granted to a unit carrying the KNIGHT tag */
  KNIGHT_MAX_HP_BONUS: 30,
  /** Move range bonus granted to SKIRMISHER-tagged archers (Skirmisher tech) */
  SKIRMISHER_MOVE_BONUS: 1,
  /** Move range bonus granted to OUTRIDER-tagged riders (Outriders tech) */
  OUTRIDER_MOVE_BONUS: 1,
  /** Discover radius bonus granted to Scouts by the BIG_EYES tech */
  SCOUT_DISCOVER_BONUS: 1,
  /** Probability (0–1) that a PIN_DOWN archer hit stuns the target (blocks move + attack) */
  PIN_DOWN_STUN_CHANCE: 0.3,
  // ── Tech-tree production bonus abilities ────────────────────────────────────
  /** % chance for a Mine to yield one extra iron per turn (DEEP_VEINS tech) */
  DEEP_VEINS_BONUS_CHANCE: 40,
  /** Extra iron amount produced per bonus proc (DEEP_VEINS tech) */
  DEEP_VEINS_BONUS_AMOUNT: 1,
  /** % chance for a Woodcutter to yield one extra wood per turn (CLEAN_CUTS tech) */
  CLEAN_CUTS_BONUS_CHANCE: 40,
  /** Extra wood amount produced per bonus proc (CLEAN_CUTS tech) */
  CLEAN_CUTS_BONUS_AMOUNT: 1,
  // ── Tech-tree stronghold/citadel abilities ───────────────────────────────────
  /** Farmer-slot capacity added to each Stronghold by the WALLED_SETTLEMENT tech */
  WALLED_SETTLEMENT_FARMER_BONUS: 2,
  /** Iron produced by each Stronghold per turn after WALLED_SETTLEMENT */
  WALLED_SETTLEMENT_IRON_AMOUNT: 1,
  /** Wood produced by each Stronghold per turn after WALLED_SETTLEMENT */
  WALLED_SETTLEMENT_WOOD_AMOUNT: 2,
  /** Noble-slot capacity added to each Stronghold by the CITADEL tech */
  CITADEL_NOBLE_BONUS: 2,
  /** Max-HP bonus applied to Scouts and Guards by the CITADEL tech */
  CITADEL_HP_BOOST: 30,
  // ── Specialist-granted ability constants ────────────────────────────────────
  /** Flat attack bonus applied to player-owned Watchtowers and Outposts by FORTIFIED_GARRISON */
  FORTIFIED_GARRISON_ATTACK_BONUS: 15,
  /** Attack-range bonus applied to player-owned Watchtowers and Outposts by FORTIFIED_GARRISON */
  FORTIFIED_GARRISON_RANGE_BONUS: 1,
  /** Fraction of dealt damage applied to each surrounding enemy by SPLASH */
  SPLASH_DAMAGE_RATIO: 0.25,
  /** Crystal cost to revive a unit from a Gravestone */
  REVIVE_CRYSTAL_COST: 1,
  /** Starting and maximum HP of a newly spawned Gravestone building */
  GRAVESTONE_MAX_HP: 25,
  /** Damage dealt by a PREVENTIVE_STRIKE shot as a percentage of normal attack damage */
  PREVENTIVE_STRIKE_DAMAGE_PERCENT: 25,
  // ── Mage system ability constants ────────────────────────────────────────────
  /** Number of turns a unit triggered by a GRAVE_TRAP is stunned */
  GRAVE_TRAP_STUN_TURNS: 2,
  /** Leash range (in tiles) within which a LEASHED unit must remain relative to its controller Mage */
  LEASH_RANGE: 4,
} as const;

// Override GRAVESTONE description now that ABILITIES is available (crystal cost is configurable).
{
  BUILDING_DEFINITIONS.GRAVESTONE.description =
    `The grave of a fallen warrior. Revive the unit by paying ${ABILITIES.REVIVE_CRYSTAL_COST} crystal.`;
  BUILDING_DEFINITIONS.GRAVE_TRAP.description =
    `A magic trap forged from a gravestone. The next unit to step onto it is stunned for ${MAGE.GRAVE_TRAP_STUN_TURNS} turns and the trap is consumed.`;
  BUILDING_DEFINITIONS.CRYSTAL_TOWER.description =
    `Arcane combat tower. Attacks enemies within ${BUILDING_DEFINITIONS.CRYSTAL_TOWER.combatStats!.attackRange} tiles. Each enemy unit it kills generates ${MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD} crystal.`;
}

// ============================================================================
// SPECIALIST DEFINITIONS — single source of truth per specialist
// ============================================================================

/** Static (balance-tunable) properties of a specialist. */
export interface SpecialistDefinition {
  name: string;
  description: string;
  effects: { type: string; params: Record<string, number | string> }[];
  /** Iron cost per turn; default 0 */
  upkeepIron?: number;
  /** Wood cost per turn; default 0 */
  upkeepWood?: number;
}

/**
 * Single source of truth for all per-specialist data.
 * Descriptions that reference config constants use template literals — no
 * raw balancing numbers allowed in description strings (see DESCRIPTION
 * AUTHORING RULE above the ABILITIES constant).
 */
export const SPECIALIST_DEFINITIONS: Record<string, SpecialistDefinition> = {
  spec_01: {
    name: 'Garrison Commander',
    description:
      `All your Watchtowers and Outposts gain +${ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS} attack and +${ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS} attack range.`,
    effects: [{ type: 'FORTIFIED_GARRISON', params: {} }],
    upkeepIron: 0,
    upkeepWood: 1,
  },
  spec_02: {
    name: 'Bloodrider',
    description:
      'When one of your Riders kills an enemy, it may attack once more this turn at half attack and without retaliation.',
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.RIDER, tag: UnitTag.BLOODLUST } }],
    upkeepIron: 2,
    upkeepWood: 0,
  },
  spec_03: {
    name: 'Siege Tactician',
    description:
      `Your Siege units deal ${Math.round(ABILITIES.SPLASH_DAMAGE_RATIO * 100)}% of their damage to all enemy units surrounding their target.`,
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SIEGE, tag: UnitTag.SPLASH } }],
    upkeepIron: 0,
    upkeepWood: 2,
  },
  spec_04: {
    name: 'Drill Sergeant',
    description:
      'Your Spearman units can move and attack immediately after being recruited.',
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SPEARMAN, tag: UnitTag.READY } }],
    upkeepIron: 1,
    upkeepWood: 1,
  },
  spec_05: {
    name: 'Deathmender',
    description:
      `When one of your Spearman or Swordsman units dies, a Gravestone is left on their tile. Pay ${ABILITIES.REVIVE_CRYSTAL_COST} crystal to revive the unit.`,
    effects: [
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SPEARMAN,  tag: UnitTag.REVIVABLE } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SWORDSMAN, tag: UnitTag.REVIVABLE } },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  },
};

// ============================================================================
// TECH TREE CONFIGURATION
// ============================================================================

/**
 * Tech tree node definitions.
 * Add a new tech node by adding one entry to this array — no logic files
 * touched, no switch statements updated, no hardcoded references.
 *
 * Description authoring: see the DESCRIPTION AUTHORING RULE comment above the
 * ABILITIES constant. All numbers in `description` strings must reference
 * ABILITIES (or another named config constant) via template literals.
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
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SPEARMAN },
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
    description: `Mines have a ${ABILITIES.DEEP_VEINS_BONUS_CHANCE}% chance to produce ${ABILITIES.DEEP_VEINS_BONUS_AMOUNT} extra iron per turn`,
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.MINE, resource: ResourceType.IRON, chancePercent: ABILITIES.DEEP_VEINS_BONUS_CHANCE, amount: ABILITIES.DEEP_VEINS_BONUS_AMOUNT },
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
    description: `Woodcutters have a ${ABILITIES.CLEAN_CUTS_BONUS_CHANCE}% chance to produce ${ABILITIES.CLEAN_CUTS_BONUS_AMOUNT} extra wood per turn`,
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.WOODCUTTER, resource: ResourceType.WOOD, chancePercent: ABILITIES.CLEAN_CUTS_BONUS_CHANCE, amount: ABILITIES.CLEAN_CUTS_BONUS_AMOUNT },
    ],
  },
  {
    id: 'TO_THE_FRONT',
    name: 'To the Front',
    description: `Units more than ${ABILITIES.TO_THE_FRONT_MIN_DISTANCE} tiles behind the front gain +${ABILITIES.TO_THE_FRONT_MOVE_BONUS} movement range`,
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
    description: `Units on own buildings gain +${ABILITIES.HOLD_GROUND_DEFENSE_BONUS} defense`,
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'FLAG', flag: TechFlag.HOLD_GROUND },
    ],
  },
  {
    id: 'FIELDWORK',
    name: 'Fieldwork',
    description: `Spearmen and Swordsmen can sacrifice themselves to build an Outpost (starting HP = unit HP × ${ABILITIES.FIELDWORK_HP_MULTIPLIER})`,
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SPEARMAN, tag: UnitTag.FIELDWORK },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.FIELDWORK },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SPEARMAN, resource: 'wood', amount: 1 },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SWORDSMAN, resource: 'iron', amount: 1 },
    ],
  },
  {
    id: 'UNLOCK_SWORDSMAN',
    name: 'Swordsman Training',
    description: 'Unlocks the Swordsman — elite heavy infantry with superior attack and defense — recruitable at the Barracks',
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_UNIT', unitType: UnitType.SWORDSMAN },
    ],
  },
  {
    id: 'PHALANX_FORMATION',
    name: 'Phalanx Formation',
    description: `Guards in formation grant +${ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER} defense to each adjacent ally and gain +${ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY} attack per adjacent ally`,
    requires: ['HOLD_GROUND'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.PHALANX },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.GUARD, resource: 'iron', amount: 2 },
    ],
  },

  // ── Branch 4: Reconnaissance ──
  {
    id: 'BIG_EYES',
    name: 'Big Eyes',
    description: `Scouts gain +${ABILITIES.SCOUT_DISCOVER_BONUS} discover radius, seeing further into the fog`,
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'discoverRadius', mode: 'add', value: ABILITIES.SCOUT_DISCOVER_BONUS },
    ],
  },
  {
    id: 'ASSASSIN',
    name: 'Assassin',
    description: `Scouts deal ${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}× damage and receive no retaliation when striking a full-HP enemy`,
    requires: ['BIG_EYES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.ASSASSIN },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'PATCH_UP',
    name: 'Patch Up',
    description: `Scouts can spend their action to restore ${ABILITIES.PATCHUP_HEAL_AMOUNT} HP on one adjacent friendly unit`,
    requires: ['BIG_EYES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.PATCHUP },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'wood', amount: 2 },
    ],
  },

  // ── Branch 5: Stronghold Development ──
  {
    id: 'WALLED_SETTLEMENT',
    name: 'Walled Settlement',
    description: `Strongholds gain +${ABILITIES.WALLED_SETTLEMENT_FARMER_BONUS} farmer capacity and produce +${ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT} iron and +${ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT} wood per turn`,
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'farmer', amount: ABILITIES.WALLED_SETTLEMENT_FARMER_BONUS },
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.STRONGHOLD, resource: ResourceType.WOOD, chancePercent: 100, amount: ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT },
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.STRONGHOLD, resource: ResourceType.IRON, chancePercent: 100, amount: ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT },
    ],
  },
  {
    id: 'CITADEL',
    name: 'Citadel',
    description: `Grants +${ABILITIES.CITADEL_NOBLE_BONUS} noble capacity to Strongholds and boosts Scout and Guard max HP by +${ABILITIES.CITADEL_HP_BOOST}`,
    requires: ['WALLED_SETTLEMENT'],
    cost: 4,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'noble', amount: ABILITIES.CITADEL_NOBLE_BONUS },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'maxHp', mode: 'add', value: ABILITIES.CITADEL_HP_BOOST },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.GUARD, stat: 'maxHp', mode: 'add', value: ABILITIES.CITADEL_HP_BOOST },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'wood', amount: 2 },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.GUARD, resource: 'wood', amount: 2 },
    ],
  },
  {
    id: 'NOBLE_HERITAGE',
    name: 'Noble Heritage',
    description: `Grants the ELITE tag to Riders, Guards, and Siege engines — each gaining +${ABILITIES.ELITE_MAX_HP_BONUS} max HP`,
    requires: ['CITADEL'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE,  tag: UnitTag.ELITE },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 2 },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.GUARD, resource: 'iron', amount: 2 },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SIEGE, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'MASTER_RECRUITER',
    name: 'Master Recruiter',
    description: 'Unlocks a third specialist slot.',
    requires: ['NOBLE_HERITAGE'],
    cost: 6,
    effects: [
      { type: 'SPECIALIST_SLOT_MOD', value: 1 },
    ],
  },

  // ── Branch 1 (Cavalry) deep upgrades ──────────────────────────────────────
  {
    id: 'LANCE_CHARGE',
    name: 'Lance Charge',
    description: `Riders gain +${ABILITIES.LANCE_CHARGE_ATTACK_BONUS} attack when striking without having moved this turn`,
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.LANCE_CHARGE },
      { type: 'REMOVE_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.BUILDANDCAPTURE },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'KNIGHTS',
    name: 'Knights',
    description: `Heavily armoured cavalry with +${ABILITIES.KNIGHT_MAX_HP_BONUS} max HP`,
    requires: ['LANCE_CHARGE'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.KNIGHT },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'HIT_AND_RUN',
    name: 'Hit and Run',
    description: `Riders can move twice: once before attacking and once after (max ${ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE} tile post-attack); DEF is reduced by ${Math.abs(ABILITIES.HIT_AND_RUN_DEFENSE_MOD)} as a trade-off`,
    requires: ['LANCE_CHARGE'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.HIT_AND_RUN },
      { type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 2 },
    ],
  },
  {
    id: 'OUTRIDERS',
    name: 'Outriders',
    description: `Fast raiding cavalry with +${ABILITIES.OUTRIDER_MOVE_BONUS} movement range`,
    requires: ['HIT_AND_RUN'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.OUTRIDER },
      { type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 2 },
    ],
  },

  // ── Branch 2 (Ranged) deep upgrades ───────────────────────────────────────
  {
    id: 'COVER',
    name: 'Cover',
    description: 'Ranged enemy units cannot counter-attack.',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.COVER },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.ARCHER, resource: 'wood', amount: 2 },
    ],
  },
  {
    id: 'SKIRMISHER',
    name: 'Skirmisher',
    description: `Archers gain +${ABILITIES.SKIRMISHER_MOVE_BONUS} movement range`,
    requires: ['COVER'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.SKIRMISHER },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.ARCHER, resource: 'wood', amount: 2 },
    ],
  },
  {
    id: 'PIN_DOWN',
    name: 'Pin Down',
    description: `Archer hits have a ${Math.round(ABILITIES.PIN_DOWN_STUN_CHANCE * 100)}% chance to stun the target for one turn — it cannot move or attack`,
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.PIN_DOWN },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.ARCHER, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'DISTRACTION',
    name: 'Distraction',
    description: `Each archer hit permanently reduces the target's DEF by ${ABILITIES.DISTRACTION_DEF_REDUCTION}. Archers carrying this tag have their own ATK reduced by ${Math.abs(ABILITIES.DISTRACTION_ATTACK_MOD)}`,
    requires: ['PIN_DOWN'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.DISTRACTION },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.ARCHER, resource: 'iron', amount: 2 },
    ],
  },

  // ── Branch 3 (Fortification) deep upgrade ─────────────────────────────────
  {
    id: 'PREVENTIVE_STRIKE',
    name: 'Preventive Strike',
    description: `Siege engines automatically fire at enemy units that move from outside into their attack range, dealing ${ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT}% of their normal attack damage`,
    requires: ['SIEGE_WORKS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE, tag: UnitTag.PREVENTIVE_STRIKE },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'wood', amount: 2 },
    ],
  },

  // ── Branch 6: Magic — root and 3 specialization paths ────────────────────
  {
    id: 'ARCANE_AWAKENING',
    name: 'Arcane Awakening',
    description: `Unlocks the Mage unit (recruited from active Crystal Chambers) and the Transpose spell.`,
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_UNIT',  unitType: UnitType.MAGE },
      { type: 'UNLOCK_SPELL', spellId: SpellId.TRANSPOSE },
    ],
  },

  // ── Summoner path ────────────────────────────────────────────────────────
  {
    id: 'EMBERBIND',
    name: 'Emberbind',
    description: `Unlocks the Emberbind spell.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.EMBERBIND },
    ],
  },
  {
    id: 'BRANDMARK_HEAL',
    name: 'Brandmark Heal',
    description: `Unlocks the Brandmark Heal spell.`,
    requires: ['EMBERBIND'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.BRANDMARK_HEAL },
    ],
  },
  {
    id: 'CRYSTAL_TOWER',
    name: 'Crystal Tower',
    description: `Unlocks the Crystal Tower spell.`,
    requires: ['BRANDMARK_HEAL'],
    cost: 7,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.CRYSTAL_TOWER },
    ],
  },

  // ── Necromancer path ─────────────────────────────────────────────────────
  {
    id: 'RAISE_SKELETON',
    name: 'Raise Skeleton',
    description: `Unlocks the Raise Skeleton spell.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_UNIT',  unitType: UnitType.SKELETON },
      { type: 'UNLOCK_SPELL', spellId: SpellId.RAISE_SKELETON },
    ],
  },
  {
    id: 'GRAVE_TRAP',
    name: 'Grave Trap',
    description: `Unlocks the Grave Trap spell.`,
    requires: ['RAISE_SKELETON'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.GRAVE_TRAP },
    ],
  },
  {
    id: 'GRAVE_HARVEST',
    name: 'Grave Harvest',
    description: `Each player-owned Gravestone has a ${MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE}% chance per turn to grant 1 arcane crystal.`,
    requires: ['GRAVE_TRAP'],
    cost: 7,
    effects: [
      { type: 'FLAG', flag: TechFlag.GRAVE_HARVEST },
    ],
  },

  // ── Elementalist path ────────────────────────────────────────────────────
  {
    id: 'FROSTCRAFT',
    name: 'Frostcraft',
    description: `Unlocks the Frostcraft spell.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.FROSTCRAFT },
    ],
  },
  {
    id: 'EXPLODE',
    name: 'Explode',
    description: `Unlocks the Explode spell.`,
    requires: ['FROSTCRAFT'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.EXPLODE },
    ],
  },
  {
    id: 'SPELL_REACH',
    name: 'Spell Reach',
    description: `Increases the Mage's spell range by +${MAGE.SPELL_RANGE_BONUS} (to ${MAGE.SPELL_RANGE_BASE + MAGE.SPELL_RANGE_BONUS} tiles).`,
    requires: ['EXPLODE'],
    cost: 7,
    effects: [
      { type: 'SPELL_RANGE_MOD', amount: MAGE.SPELL_RANGE_BONUS },
    ],
  },

];

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
  ],
  [UnitTag.HIT_AND_RUN]: [{ stat: 'defense', mode: 'add', value: ABILITIES.HIT_AND_RUN_DEFENSE_MOD }],
  [UnitTag.DISTRACTION]: [{ stat: 'attack', mode: 'add', value: ABILITIES.DISTRACTION_ATTACK_MOD }],
  [UnitTag.BRANDMARKED]: [{ stat: 'attack', mode: 'add', value: MAGE.BRANDMARK_ATTACK_BONUS }],
};

// ============================================================================
// TAG INFO — label and description for each unit tag
// ============================================================================

/**
 * Display label and tooltip description for each UnitTag.
 *
 * Description authoring: see the DESCRIPTION AUTHORING RULE above the ABILITIES
 * constant. All numbers in `desc` strings must reference ABILITIES (or another
 * named config constant) via template literals — never hardcode raw numbers.
 */
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
  [UnitTag.KNIGHT]:            { label: 'Knight',            desc: `Heavily armoured cavalry with +${ABILITIES.KNIGHT_MAX_HP_BONUS} max HP.` },
  [UnitTag.HIT_AND_RUN]:       { label: 'Hit and Run',       desc: `Can move twice: once before attacking and once after (max ${ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE} tile post-attack). DEF is reduced by ${Math.abs(ABILITIES.HIT_AND_RUN_DEFENSE_MOD)} as a trade-off for the added mobility.` },
  [UnitTag.OUTRIDER]:          { label: 'Outrider',          desc: `+${ABILITIES.OUTRIDER_MOVE_BONUS} movement range. Optimised for deep raids.` },
  [UnitTag.COVER]:             { label: 'Cover',             desc: 'Ranged enemy units cannot counter-attack.' },
  [UnitTag.SKIRMISHER]:        { label: 'Skirmisher',        desc: `+${ABILITIES.SKIRMISHER_MOVE_BONUS} movement range.` },
  [UnitTag.PIN_DOWN]:          { label: 'Pin Down',          desc: `Each hit has a ${Math.round(ABILITIES.PIN_DOWN_STUN_CHANCE * 100)}% chance to stun the target — it cannot move or attack on its next action.` },
  [UnitTag.DISTRACTION]:       { label: 'Distraction',       desc: `Each hit permanently reduces the target's DEF by ${ABILITIES.DISTRACTION_DEF_REDUCTION}. Archer ATK is reduced by ${Math.abs(ABILITIES.DISTRACTION_ATTACK_MOD)}.` },
  [UnitTag.PREVENTIVE_STRIKE]: { label: 'Preventive Strike', desc: `When an enemy moves from outside into this siege unit's attack range, it automatically fires once, dealing ${ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT}% of its normal attack damage.` },
  [UnitTag.ELITE]:             { label: 'Elite',             desc: `+${ABILITIES.ELITE_MAX_HP_BONUS} max HP. Elite unit forged in the noble tradition.` },
  [UnitTag.FORTIFIED_GARRISON]: { label: 'Fortified Garrison', desc: `Attack building gains +${ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS} ATK and +${ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS} attack range.` },
  [UnitTag.BLOODLUST]:          { label: 'Bloodlust',          desc: 'When this Rider kills an enemy, it may attack once more this turn at half attack without retaliation.' },
  [UnitTag.SPLASH]:             { label: 'Splash',             desc: `Deals ${Math.round(ABILITIES.SPLASH_DAMAGE_RATIO * 100)}% of dealt damage to all enemy units surrounding the target.` },
  [UnitTag.READY]:              { label: 'Ready',              desc: 'Can move and attack immediately after being recruited.' },
  [UnitTag.REVIVABLE]:          { label: 'Revivable',          desc: `Leaves a Gravestone on death. Pay ${ABILITIES.REVIVE_CRYSTAL_COST} crystal to revive.` },
  // ── Mage system tags ────────────────────────────────────────────────────────
  [UnitTag.SUMMONED]:           { label: 'Summoned',           desc: 'Conjured by magic. Does not consume population, cannot be healed, and does not leave a gravestone on death.' },
  [UnitTag.BRANDMARKED]:        { label: 'Brandmarked',        desc: `+${MAGE.BRANDMARK_ATTACK_BONUS} ATK. Loses ${MAGE.BRANDMARK_HP_LOSS_PER_TURN} HP at the end of every player turn. On death, leaves behind a hostile Ember Demon.` },
  [UnitTag.LEASHED]:            { label: 'Leashed',            desc: `Summoned creature bound to a Mage. If the Mage moves out of ${MAGE.EMBER_DEMON_LEASH_RANGE} tiles or dies, the leashed unit defects to the enemy.` },
  [UnitTag.NO_GRAVESTONE]:      { label: 'No Gravestone',      desc: 'Leaves no body. Cannot become a Gravestone on death.' },
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
   * Amount added to turnsUntilLavaAdvance when a Sanctum Collapse is triggered.
   * This directly increases the countdown until the next lava advance, buying
   * the player extra time without fully freezing the lava clock.
   * Set to 0 to disable this bonus while keeping other Sanctum Collapse effects active.
   */
  LAVA_ADVANCE_BONUS_TURNS: 3,
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
  MAGE,
  SPELL_DEFINITIONS,
  UNIT_DEFINITIONS,
  BUILDING_DEFINITIONS,
  SPECIALIST_DEFINITIONS,
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
