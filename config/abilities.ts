/**
 * Balance-tunable constants for tag/flag-based unit and building abilities,
 * upgrade tradeoff tags, conditional active tags, and tag stat effects.
 *
 * All description strings in UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECH_TREE, and
 * TAG_INFO must reference named constants from this module (never raw numbers).
 */

import { UnitTag } from '../src/types';
import type { StatModifier } from '../src/types';
import { MAGE } from './magic';
import { POPULATION, TRAINING } from './economy';

// ============================================================================
// ABILITIES - Balance-tunable constants for tag/flag-based abilities
//
// ── DESCRIPTION AUTHORING RULE (applies to ALL description fields) ──────────
// Every numeric balancing value that appears in any description string
// (TECH_TREE, TAG_INFO, UNIT_DEFINITIONS, BUILDING_DEFINITIONS) MUST be
// injected via a template-literal reference to a named constant - never write
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
  ASSASSIN_DAMAGE_MULTIPLIER: 4,
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
  PHALANX_DEFENSE_BONUS_PER_CARRIER: 7,
  /** Attack bonus gained by a PHALANX unit per adjacent friendly unit */
  PHALANX_ATTACK_BONUS_PER_ALLY: 5,
  // ── Deep tech tree abilities ─────────────────────────────────────────────────
  /** Flat attack bonus for a LANCE_CHARGE unit that attacks without having moved */
  LANCE_CHARGE_ATTACK_BONUS: 20,
  /** Permanent DEF reduction applied to the target each time it is hit by a DISTRACTION archer */
  DISTRACTION_DEF_REDUCTION: 6,
  /** Static ATK penalty applied to archers carrying the DISTRACTION tag */
  DISTRACTION_ATTACK_MOD: -15,
  /** Max HP bonus granted to a unit carrying the ELITE tag */
  ELITE_MAX_HP_BONUS: 30,
  /** DEF change (negative = penalty) applied to a unit carrying the HIT_AND_RUN tag */
  HIT_AND_RUN_DEFENSE_MOD: -10,
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
  DEEP_VEINS_BONUS_CHANCE: 50,
  /** Extra iron amount produced per bonus proc (DEEP_VEINS tech) */
  DEEP_VEINS_BONUS_AMOUNT: 2,
  /** % chance for a Woodcutter to yield one extra wood per turn (CLEAN_CUTS tech) */
  CLEAN_CUTS_BONUS_CHANCE: 50,
  /** Extra wood amount produced per bonus proc (CLEAN_CUTS tech) */
  CLEAN_CUTS_BONUS_AMOUNT: 2,
  // ── Tech-tree stronghold/citadel abilities ───────────────────────────────────
  /** Farmer-slot capacity added to each Stronghold by the WALLED_SETTLEMENT tech */
  WALLED_SETTLEMENT_FARMER_BONUS: 2,
  /** Iron produced by each Stronghold per turn after WALLED_SETTLEMENT */
  WALLED_SETTLEMENT_IRON_AMOUNT: 3,
  /** Wood produced by each Stronghold per turn after WALLED_SETTLEMENT */
  WALLED_SETTLEMENT_WOOD_AMOUNT: 5,
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
  /** Crystal cost to raise a Gargoyle from any Gravestone (Deathmender specialist) */
  GARGOYLE_CRYSTAL_COST: 1,
  /** Starting and maximum HP of a newly spawned Gravestone building */
  GRAVESTONE_MAX_HP: 25,
  /** Damage dealt by a PREVENTIVE_STRIKE shot as a percentage of normal attack damage */
  PREVENTIVE_STRIKE_DAMAGE_PERCENT: 50,
  // ── Mage system ability constants ────────────────────────────────────────────
  /** Number of turns a unit triggered by a GRAVE_TRAP is stunned */
  GRAVE_TRAP_STUN_TURNS: 2,
  // ── SP-00 scaffolding: new specialist / building ability constants ──────────
  /** Extra tile radius added to Charcoal Kilns by the Ashwright specialist */
  KILN_RADIUS_BONUS: 1,
  /** Extra iron/turn added to each in-range mine or deep mine by the Ashwright specialist (on top of base kiln bonus) */
  KILN_IRON_BONUS: 0,
  /** Wood cost for a Scout to place a Scout Trap */
  SCOUT_TRAP_WOOD_COST: 4,
  /** Iron cost for a Scout to place a Scout Trap */
  SCOUT_TRAP_IRON_COST: 0,
  /** HP damage dealt to the triggering enemy by a Scout Trap */
  SCOUT_TRAP_DAMAGE: 60,
  /** Turns the triggering enemy is stunned by a Scout Trap (this turn + next) */
  SCOUT_TRAP_STUN_TURNS: 1,
  /** Tile range within which a Scout with SCOUT_SET_TRAP can place a Scout Trap (edge-circle, own tile included) */
  SCOUT_TRAP_PLACE_RANGE: 1,
  /** Tile radius within which a Scout with SCOUT_EXTINGUISH removes BURNING tile status */
  EXTINGUISH_RADIUS: 1,
  /** Attack-range bonus added to Scouts by the Farsight Marshal specialist */
  SCOUT_ATTACK_RANGE_BONUS: 1,
  /** Extra farmer capacity per Farm added by the Hearthsteward specialist */
  HOUSING_CAP_BONUS: 1,
  /** Extra noble capacity per Patrician House added by the Estate Warden specialist */
  NOBLE_HOUSING_CAP_BONUS: 1,
  /** Extra units each recruitment building supports while the Quartermaster specialist is active (Crystal Caves and Crystal Chambers excluded) */
  RECRUITMENT_CAP_BONUS: 1,
  /** Number of rows from the lava front that qualify for the Cinderborn ATK bonus */
  CINDERBORN_ROWS: 3,
  /** Flat ATK bonus granted to a unit recruited within CINDERBORN_ROWS of the lava front */
  CINDERBORN_ATTACK_BONUS: 15,
  /** ATK bonus per adjacent friendly unit granted by the BATTERY tag */
  SIEGE_BATTERY_ATK_PER_ADJACENT: 7,
  /** Maximum number of adjacent friendly units counted for the BATTERY ATK bonus */
  SIEGE_BATTERY_CAP: 3,
  /** Number of lava-front rows that qualify a chamber for the Echo Warden crystal bonus */
  RESONANCE_BONUS_ROWS: 3,
  /** Extra crystals per turn added by each qualifying resonating Crystal Chamber (Echo Warden) */
  RESONANCE_BONUS_CRYSTALS: 1,
  /** Percentage of normal damage dealt when an ARCHER_VS_STRUCTURE hit targets a building */
  ARCHER_STRUCTURE_DMG_PCT: 50,
  /** HP percentage below which a BERSERK unit activates its attack bonus */
  BERSERK_HP_THRESHOLD_PCT: 50,
  /** Percentage attack bonus granted to a BERSERK unit below the HP threshold */
  BERSERK_ATTACK_PCT: 50,
  /** HP restored to an idle (non-moved, non-attacked) player unit per turn by the Field Chirurgeon */
  IDLE_HEAL_AMOUNT: 30,
  /** Fraction of the target's current HP dealt as damage by the Rupture spell */
  RUPTURE_PERCENT: MAGE.RUPTURE_PERCENT,
  /** Crystal cost to cast the Rupture spell */
  RUPTURE_CRYSTAL_COST: MAGE.RUPTURE_CRYSTAL_COST,
  // ── Combat modifier tag mechanics ───────────────────────────────────────────
  /** Multiplier applied to primary attack damage when computing Cleave AoE damage. */
  CLEAVE_DAMAGE_MULTIPLIER: 0.5,
  /** Multiplier applied to defender damage when the attacker has PIERCE. */
  PIERCE_PRIMARY_DAMAGE_MULTIPLIER: 0.5,
  /** Multiplier applied to standard attack damage dealt to the unit behind the primary defender by PIERCE. Default 100%. */
  PIERCE_SECONDARY_DAMAGE_MULTIPLIER: 1.0,
  /** ATK bonus per adjacent enemy, granted to units with RAGE. */
  RAGE_ATK_PER_ADJACENT: 4,
  /** Maximum number of adjacent enemies that contribute to RAGE bonus. */
  RAGE_MAX_ADJACENT_COUNT: 8,
  /** Damage multiplier when a SUMMONED unit attacks a unit with IRONBLOOD. */
  IRONBLOOD_SUMMONED_DAMAGE_MULTIPLIER: 0.5,
  /** Damage multiplier applied to GRIMBEAK attacks against SUMMONED units (100% extra = 2× default). */
  GRIMBEAK_SUMMONED_DAMAGE_MULTIPLIER: 2.0,
  /** Damage multiplier when a melee unit (attackRange === 1) attacks a unit with BLOCK. */
  BLOCK_MELEE_DAMAGE_MULTIPLIER: 0.7,
  /** Base DEF threshold above which PUNCTURE-stun is triggered. */
  PUNCTURE_STUN_BASE_DEF_THRESHOLD: 60,
  /** Duration in turns of the stun applied by PUNCTURE. */
  PUNCTURE_STUN_DURATION: 1,
  /** Damage multiplier applied to FLYING units when attacked by a non-flying RANGED unit. */
  FLYING_RANGED_DAMAGE_TAKEN_MULTIPLIER: 1.5,
  /** DEF penalty applied after this unit attacks while carrying the RELOAD tag. */
  RELOAD_DEF_PENALTY_PCT: 50,
  // ── Tunnel (Riftworm) ───────────────────────────────────────────────────────
  /** TUNNEL: minimum number of tiles the unit must move south while underground. */
  TUNNEL_RANGE_MIN: 2,
  /** TUNNEL: maximum number of tiles the unit can move south while underground. */
  TUNNEL_RANGE_MAX: 4,
  /** TUNNEL: damage applied to enemy units adjacent to the emergence tile. */
  TUNNEL_EMERGE_DAMAGE: 40,
  /** TUNNEL: cooldown turns after emergence before the unit can dig again. */
  TUNNEL_COOLDOWN_TURNS: 2,
  /** TUNNEL: maximum number of turns the unit can stay underground while waiting for a free emergence tile. */
  TUNNEL_MAX_RETRY_TURNS: 1,
  /** TUNNEL: HP multiplier applied when a unit is forced to emerge with no valid free tile (last-resort fallback). */
  TUNNEL_FORCED_EMERGE_HP_MULTIPLIER: 0.7,
  // ── Ember Portal (Rift Lord) ───────────────────────────────────────────────
  /** EMBER_PORTAL: number of enemy turns the pair is usable, including the cast turn.
   * Cast on turn T → usable on T, T+1, ..., T+L-1. Removed at the END of enemy turn T+L-1.
   */
  EMBER_PORTAL_LIFETIME_TURNS: 3,
  /** EMBER_PORTAL: minimum rows the exit tile must be south of the northernmost player unit. */
  EMBER_PORTAL_MIN_DISTANCE_BEHIND_FRONTLINE: 1,
  /** EMBER_PORTAL: maximum edge-circle distance between the entry and exit portals of a pair. */
  EMBER_PORTAL_PAIR_MAX_DISTANCE: 4,
  /** EMBER_PORTAL: maximum enemy units that may score moving onto the same portal entrance per turn. */
  EMBER_PORTAL_MAX_USERS_PER_TURN: 2,
  /** EMBER_PORTAL: AI base score for moving onto a portal entrance whose exit is closer to the player. */
  EMBER_PORTAL_BASE_USE_SCORE: 80,
  /** EMBER_PORTAL: AI per-tile penalty for distance to the portal entrance. */
  EMBER_PORTAL_DISTANCE_PENALTY: 15,
} as const;

/**
 * Tags whose negative stat modifiers are intentional upgrade tradeoffs rather
 * than genuine debuffs.  Units carrying these tags must NOT show the debuff
 * visualisation (purple border / HP bar) even though TAG_STAT_EFFECTS contains
 * a negative value for them.
 */
export const UPGRADE_TRADEOFF_TAGS: ReadonlySet<UnitTag> = new Set([
  UnitTag.HIT_AND_RUN,  // −DEF is the trade-off for double-move; it's a cavalry upgrade
  UnitTag.DISTRACTION,  // −ATK is the trade-off for the DEF-reduction effect; it's an archer upgrade
]);

/** Tags whose pill should glow when their live condition is currently met. */
export const CONDITIONAL_ACTIVE_TAGS: ReadonlySet<UnitTag> = new Set([
  UnitTag.BERSERK,
  UnitTag.RAGE,
]);

/**
 * Stat changes that are intrinsic to a tag.
 * When a GRANT_UNIT_TAG effect is applied (either retroactively at tech unlock
 * or at unit spawn time), these mods are also applied to the unit's stats.
 * All values are driven by ABILITIES constants so they remain easy to balance.
 *
 * CINDERBORN is intentionally omitted here: its +ATK is baked in only at
 * recruit time in resourceSystem.ts, so listing it here would double-apply the
 * bonus when tags are granted dynamically.
 */
export const TAG_STAT_EFFECTS: Partial<Record<UnitTag, StatModifier[]>> = {
  [UnitTag.ELITE]:   [{ stat: 'maxHp',   mode: 'add', value: ABILITIES.ELITE_MAX_HP_BONUS }],
  [UnitTag.KNIGHT]:  [
    { stat: 'maxHp',   mode: 'add', value: ABILITIES.KNIGHT_MAX_HP_BONUS },
  ],
  [UnitTag.HIT_AND_RUN]: [{ stat: 'defense', mode: 'add', value: ABILITIES.HIT_AND_RUN_DEFENSE_MOD }],
  [UnitTag.DISTRACTION]: [{ stat: 'attack', mode: 'add', value: ABILITIES.DISTRACTION_ATTACK_MOD }],
  [UnitTag.BRANDMARKED]: [{ stat: 'attack', mode: 'add', value: MAGE.BRANDMARK_ATTACK_BONUS }],
  [UnitTag.HOMELESS]:   [{ stat: 'defense', mode: 'add', value: -POPULATION.HOMELESS_DEF_PENALTY }],
  [UnitTag.UNTRAINED]:  [{ stat: 'attack',  mode: 'add', value: -TRAINING.UNTRAINED_ATK_PENALTY }],
};


