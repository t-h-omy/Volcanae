/**
 * Mage system parameters and spell definitions.
 */

import { SpellId } from '../src/types';


export const MAGE = {
  /** Structural tile adjacency used by Grave Trap's blast radius. */
  GRAVE_TRAP_ADJACENCY_RANGE: 1,
  /** Minimum HP retained by a target after Rupture. */
  RUPTURE_MINIMUM_REMAINING_HP: 1,
  /** Separate temporary HP pool granted by Stone Skin. */
  STONE_SKIN_HP: 50,
  /** Attack power used for each Crystal Lightning hit. */
  CRYSTAL_LIGHTNING_ATTACK_POWER: 20,
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
  emoji: string;
  textParams?: { [name: string]: number };
}

export const SPELL_DEFINITIONS: Record<SpellId, SpellDefinition> = {
  [SpellId.TRANSPOSE]: {
    id: SpellId.TRANSPOSE,
    emoji: '🔄',
  },
  [SpellId.EMBERBIND]: {
    id: SpellId.EMBERBIND,
    emoji: '🔥',
  },
  [SpellId.BRANDMARK_HEAL]: {
    id: SpellId.BRANDMARK_HEAL,
    emoji: '🩸',
  
    textParams: { hpMultiplier: MAGE.BRANDMARK_HP_MULTIPLIER, attackBonus: MAGE.BRANDMARK_ATTACK_BONUS, hpLoss: MAGE.BRANDMARK_HP_LOSS_PER_TURN },
  },
  [SpellId.RAISE_SKELETON]: {
    id: SpellId.RAISE_SKELETON,
    emoji: '💀',
  },
  [SpellId.FROSTCRAFT]: {
    id: SpellId.FROSTCRAFT,
    emoji: '❄️',
  },
  [SpellId.GRAVE_TRAP]: {
    id: SpellId.GRAVE_TRAP,
    emoji: '☠️',
  
    textParams: { stunTurns: MAGE.GRAVE_TRAP_STUN_TURNS, adjacencyRange: MAGE.GRAVE_TRAP_ADJACENCY_RANGE },
  },
  [SpellId.EXPLODE]: {
    id: SpellId.EXPLODE,
    emoji: '💥',
  
    textParams: { damagePercent: MAGE.EXPLODE_DAMAGE_PERCENT },
  },
  [SpellId.CRYSTAL_TOWER]: {
    id: SpellId.CRYSTAL_TOWER,
    emoji: '💎',
  
    textParams: { crystalReward: MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD },
  },
  [SpellId.CRYSTAL_CAVE]: {
    id: SpellId.CRYSTAL_CAVE,
    emoji: '🕳️',
  
    textParams: {  },
  },
  [SpellId.RUPTURE]: {
    id: SpellId.RUPTURE,
    emoji: '💢',
  
    textParams: { damagePercent: Math.round(MAGE.RUPTURE_PERCENT * 100), minimumHp: MAGE.RUPTURE_MINIMUM_REMAINING_HP, crystalCost: MAGE.RUPTURE_CRYSTAL_COST },
  },
  [SpellId.TAUNT]: {
    id: SpellId.TAUNT,
    emoji: '🎯',
  },
  [SpellId.STONE_SKIN]: {
    id: SpellId.STONE_SKIN,
    emoji: '🪨',
    textParams: { stoneHp: MAGE.STONE_SKIN_HP },
  },
  [SpellId.CRYSTAL_LIGHTNING]: {
    id: SpellId.CRYSTAL_LIGHTNING,
    emoji: '⚡',
    textParams: { attackPower: MAGE.CRYSTAL_LIGHTNING_ATTACK_POWER },
  },
};
