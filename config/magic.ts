/**
 * Mage system parameters and spell definitions.
 */

import { SpellId } from '../src/types';


export const MAGE = {
  // ── Mage unit ────────────────────────────────────────────────────────
  /** Default number of spells a Mage can cast each turn */
  SPELLS_PER_TURN: 1,
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
  BRANDMARK_HP_LOSS_PER_TURN: 10,
  /** Flat ATK bonus while the BRANDMARKED tag is on a unit */
  BRANDMARK_ATTACK_BONUS: 20,
  /** Max HP multiplier applied when a unit is branded (e.g. 2 = double max HP) */
  BRANDMARK_HP_MULTIPLIER: 2,
  /** Number of turns a unit is stunned after stepping on a GRAVE_TRAP (this turn + next) */
  GRAVE_TRAP_STUN_TURNS: 2,
  /** Percentage of the sacrificed unit's CURRENT HP dealt to each adjacent enemy by Explode */
  EXPLODE_DAMAGE_PERCENT: 50,

  // ── Crystal Tower reward ─────────────────────────────────────────────
  /** Crystals granted when an enemy unit is killed by a CRYSTAL_TOWER */
  CRYSTAL_TOWER_KILL_CRYSTAL_REWARD: 1,

  // ── Crystal Tower ↔ Crystal Chamber synergy ─────────────────────────
  /** Attack bonus added to a Crystal Tower per player-owned Crystal Chamber within connection range */
  CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS: 10,
  /** Max tile distance (edge-to-edge circle) at which a Crystal Chamber counts as connected to a tower.
   *  Defaults to 2 (equal to the tower's attackRange) so existing behaviour is unchanged. */
  CRYSTAL_TOWER_CHAMBER_CONNECT_RANGE: 2,

  // ── GRAVE_HARVEST tech parameters ────────────────────────────────────
  /** Per-turn percent chance for each player-owned GRAVESTONE to grant 1 crystal */
  GRAVE_HARVEST_CRYSTAL_CHANCE: 25,

  // ── Rupture spell parameters (SP-16) ─────────────────────────────────
  /** Fraction of the target's current HP dealt as damage by the Rupture spell */
  RUPTURE_PERCENT: 0.5,
  /** Crystal cost to cast the Rupture spell */
  RUPTURE_CRYSTAL_COST: 1,

  // ── General spell cost ────────────────────────────────────────────────
  /** Crystals consumed per spell cast (applies to all Mage spells) */
  SPELL_CAST_CRYSTAL_COST: 1,
} as const;


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
    description: `Swap the positions of two units of the same faction within range of the Mage.`,
    targetHint: 'Select the first unit to swap.',
    targetHintSecondPick: 'Select the second unit (same faction as the first).',
  },
  [SpellId.EMBERBIND]: {
    id: SpellId.EMBERBIND,
    name: 'Emberbind',
    emoji: '🔥',
    description: `Target an Ember Nest within range. The nest is destroyed (forest restored) and a friendly Ember Demon appears, leashed within the Mage's attack range.`,
    targetHint: 'Select an Ember Nest within range.',
  },
  [SpellId.BRANDMARK_HEAL]: {
    id: SpellId.BRANDMARK_HEAL,
    name: 'Brandmark Heal',
    emoji: '🩸',
    description: `Fully heal one player unit, multiply its max HP by ${MAGE.BRANDMARK_HP_MULTIPLIER}×, grant +${MAGE.BRANDMARK_ATTACK_BONUS} ATK, and mark it with the brand. The marked unit loses ${MAGE.BRANDMARK_HP_LOSS_PER_TURN} HP at the end of each turn and cannot be healed by Patch Up. On death, a hostile Ember Demon rises in its place.`,
    targetHint: 'Select one of your own units within range (not another Mage).',
  },
  [SpellId.RAISE_SKELETON]: {
    id: SpellId.RAISE_SKELETON,
    name: 'Raise Skeleton',
    emoji: '💀',
    description: `Target a Gravestone within range to raise a Skeleton. The gravestone is consumed.`,
    targetHint: 'Select a player Gravestone within range.',
  },
  [SpellId.FROSTCRAFT]: {
    id: SpellId.FROSTCRAFT,
    name: 'Frostcraft',
    emoji: '❄️',
    description: `Freeze a Water tile within range. Player units may walk on the ice; enemies cannot. The ice persists until consumed by lava.`,
    targetHint: 'Select a water tile within range.',
  },
  [SpellId.GRAVE_TRAP]: {
    id: SpellId.GRAVE_TRAP,
    name: 'Grave Trap',
    emoji: '☠️',
    description: `Convert an empty Gravestone within range into a magical trap. The next enemy unit to step onto it is stunned for ${MAGE.GRAVE_TRAP_STUN_TURNS} turns, and all enemies within 1 tile are stunned as well.`,
    targetHint: 'Select a player Gravestone within range.',
  },
  [SpellId.EXPLODE]: {
    id: SpellId.EXPLODE,
    name: 'Explode',
    emoji: '💥',
    description: `Sacrifice a player unit within range. It deals ${MAGE.EXPLODE_DAMAGE_PERCENT}% of its current HP to each adjacent enemy. The unit is fully consumed - no gravestone is left.`,
    targetHint: 'Select one of your own units within range to sacrifice.',
  },
  [SpellId.CRYSTAL_TOWER]: {
    id: SpellId.CRYSTAL_TOWER,
    name: 'Crystal Tower',
    emoji: '💎',
    description: `Sacrifice the Mage to erect a permanent Crystal Tower on its tile. Each enemy unit the tower kills generates ${MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD} crystal.`,
    targetHint: "The Mage will be consumed where it stands. Confirm by selecting the Mage's tile.",
  },
  [SpellId.CRYSTAL_CAVE]: {
    id: SpellId.CRYSTAL_CAVE,
    name: 'Crystal Cave',
    emoji: '🕳️',
    description: `Conjure a Crystal Cave on a free mountain tile within range. While any of your Crystal Chambers resonate, the cave may recruit a single Crystal Drake - recruiting does not shorten the resonance window. If the cave is lost (lava, capture, conversion, destruction) the drake dies with it.`,
    targetHint: 'Select a free mountain tile within range.',
  },
  [SpellId.RUPTURE]: {
    id: SpellId.RUPTURE,
    name: 'Rupture',
    emoji: '💢',
    description: `Deal ${Math.round(MAGE.RUPTURE_PERCENT * 100)}% of the target's current HP as damage (never kills - target retains at least 1 HP). Costs ${MAGE.RUPTURE_CRYSTAL_COST} crystal. Unlocked by the Sundered specialist.`,
    targetHint: 'Select an enemy unit within range.',
  },
};

