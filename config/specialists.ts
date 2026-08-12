/**
 * Specialist definitions (single source of truth per specialist).
 */

import { UnitTag, UnitType } from '../src/types';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';
import { RESOURCES } from './economy';


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
 * Descriptions that reference config constants use template literals - no
 * raw balancing numbers allowed in description strings (see DESCRIPTION
 * AUTHORING RULE above the ABILITIES constant).
 */
const ARCHMAGE_CAST_BUDGET_BONUS = 1;

export const SPECIALIST_DEFINITIONS: Record<string, SpecialistDefinition> = {
  spec_01: {
    name: 'Garrison Commander',
    description:
      `All your Watchtowers, Outposts, and Crystal Towers gain +${ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS} attack and +${ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS} attack range.`,
    effects: [{ type: 'FORTIFIED_GARRISON', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_02: {
    name: 'Bloodrider',
    description:
      'When one of your Riders kills an enemy, it may attack once more this turn at half attack and without retaliation.',
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.RIDER, tag: UnitTag.BLOODLUST } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_03: {
    name: 'Siege Tactician',
    description:
      `Your Siege units deal ${Math.round(ABILITIES.SPLASH_DAMAGE_RATIO * 100)}% of their damage to all enemy units surrounding their target.`,
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SIEGE, tag: UnitTag.SPLASH } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_04: {
    name: 'Drill Sergeant',
    description:
      'Your Spearman and Swordsman units can move and attack immediately after being recruited.',
    effects: [
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SPEARMAN, tag: UnitTag.READY } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SWORDSMAN, tag: UnitTag.READY } },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_05: {
    name: 'Deathmender',
    description:
      `When one of your Spearmen, Scouts, or Guards dies, a Gravestone is left on their tile. Pay ${ABILITIES.GARGOYLE_CRYSTAL_COST} crystal to raise a flying Gargoyle from any Gravestone.`,
    effects: [
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SPEARMAN, tag: UnitTag.LEAVES_GRAVESTONE } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SCOUT,    tag: UnitTag.LEAVES_GRAVESTONE } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.GUARD,    tag: UnitTag.LEAVES_GRAVESTONE } },
      { type: 'RAISE_GARGOYLE', params: {} },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_06: {
    name: 'Archmage',
    description:
      `Your Mages can cast ${MAGE.SPELLS_PER_TURN + ARCHMAGE_CAST_BUDGET_BONUS} spells per turn instead of ${MAGE.SPELLS_PER_TURN}.`,
    effects: [{ type: 'MAGE_CAST_BUDGET_MOD', params: { amount: ARCHMAGE_CAST_BUDGET_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_07: {
    name: 'Ashwright',
    description:
      `Your Charcoal Kilns affect mines and deep mines within ${RESOURCES.CHARCOAL_KILN_RADIUS + ABILITIES.KILN_RADIUS_BONUS} tiles instead of ${RESOURCES.CHARCOAL_KILN_RADIUS}.` +
      (ABILITIES.KILN_IRON_BONUS > 0 ? ` Each in-range kiln also grants an additional +${ABILITIES.KILN_IRON_BONUS} iron/turn.` : ''),
    effects: [{ type: 'KILN_BONUS', params: { radiusBonus: ABILITIES.KILN_RADIUS_BONUS, ironBonus: ABILITIES.KILN_IRON_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_08: {
    name: 'Trapsmith',
    description:
      `Your Scouts can place a Scout Trap within ${ABILITIES.SCOUT_TRAP_PLACE_RANGE} tile(s) of their position (costs ${ABILITIES.SCOUT_TRAP_WOOD_COST} wood). The next non-FLYING enemy to enter it takes ${ABILITIES.SCOUT_TRAP_DAMAGE} damage and is stunned for ${ABILITIES.SCOUT_TRAP_STUN_TURNS} turn(s).`,
    effects: [{
      type: 'SCOUT_SET_TRAP',
      params: { woodCost: ABILITIES.SCOUT_TRAP_WOOD_COST, ironCost: ABILITIES.SCOUT_TRAP_IRON_COST, damage: ABILITIES.SCOUT_TRAP_DAMAGE, stunTurns: ABILITIES.SCOUT_TRAP_STUN_TURNS },
    }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_09: {
    name: 'Watch Captain',
    description:
      `Your garrisoned Watchtowers, Outposts, and Crystal Towers fire a preventive shot at ${ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT}% damage when an enemy enters their range.`,
    effects: [{ type: 'GARRISON_OVERWATCH', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_10: {
    name: 'Cinder Warden',
    description:
      `Your Scouts can extinguish BURNING and CORRUPTED tiles within ${ABILITIES.EXTINGUISH_RADIUS} tile(s), consuming their action.`,
    effects: [{ type: 'SCOUT_EXTINGUISH', params: { radius: ABILITIES.EXTINGUISH_RADIUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_11: {
    name: 'Farsight Marshal',
    description:
      `Your Scouts gain +${ABILITIES.SCOUT_ATTACK_RANGE_BONUS} attack range and become ranged.`,
    effects: [
      { type: 'SCOUT_RANGE_BONUS', params: { bonus: ABILITIES.SCOUT_ATTACK_RANGE_BONUS } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SCOUT, tag: UnitTag.RANGED } },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_12: {
    name: 'Tramplelord',
    description:
      `Your Riders push enemies one tile away on every hit (KNOCKBACK).`,
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.RIDER, tag: UnitTag.KNOCKBACK } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_13: {
    name: 'Hellbinder',
    description:
      `All your SUMMONED units gain the RAGE and CLEAVE tags.`,
    effects: [{ type: 'GRANT_TAG_TO_UNITS_WITH_TAG', params: { sourceTag: UnitTag.SUMMONED, tags: `${UnitTag.RAGE},${UnitTag.CLEAVE}` } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_14: {
    name: 'Hearthsteward',
    description:
      `Each of your Farms can house ${ABILITIES.HOUSING_CAP_BONUS} extra farmer.`,
    effects: [{ type: 'HOUSING_CAP_BONUS', params: { amount: ABILITIES.HOUSING_CAP_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_15: {
    name: 'Forgemaster',
    description:
      `Units recruited within ${ABILITIES.CINDERBORN_ROWS} rows of the lava front gain the CINDERBORN tag (+${ABILITIES.CINDERBORN_ATTACK_BONUS} ATK and immunity to BURNING tile damage).`,
    effects: [{ type: 'CINDERBORN_RECRUIT', params: { rows: ABILITIES.CINDERBORN_ROWS, attackBonus: ABILITIES.CINDERBORN_ATTACK_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_16: {
    name: 'The Martyr',
    description:
      `When one of your units is consumed by lava, all surviving Crystal Chambers begin resonating as if a chamber were destroyed.`,
    effects: [{ type: 'RESONANCE_ON_UNIT_LAVA_DEATH', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_17: {
    name: 'Bombardier',
    description:
      `Your Siege units gain the BATTERY tag: each adjacent friendly unit grants +${ABILITIES.SIEGE_BATTERY_ATK_PER_ADJACENT} ATK, up to ${ABILITIES.SIEGE_BATTERY_CAP} stacks.`,
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SIEGE, tag: UnitTag.BATTERY } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_18: {
    name: 'Echo Warden',
    description:
      `While resonating, each Crystal Chamber within ${ABILITIES.RESONANCE_BONUS_ROWS} rows of the lava front generates +${ABILITIES.RESONANCE_BONUS_CRYSTALS} extra crystal per turn.`,
    effects: [{ type: 'RESONANCE_CRYSTAL_BONUS', params: { bonusRows: ABILITIES.RESONANCE_BONUS_ROWS, bonusCrystals: ABILITIES.RESONANCE_BONUS_CRYSTALS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_19: {
    name: 'Wallbreaker',
    description:
      `Your Archers deal ${ABILITIES.ARCHER_STRUCTURE_DMG_PCT}% bonus damage when attacking buildings.`,
    effects: [{ type: 'ARCHER_VS_STRUCTURE', params: { damagePct: ABILITIES.ARCHER_STRUCTURE_DMG_PCT } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_20: {
    name: 'Deathsworn',
    description:
      `Your Archers gain the BERSERK tag: when HP drops below ${ABILITIES.BERSERK_HP_THRESHOLD_PCT}%, they gain +${ABILITIES.BERSERK_ATTACK_PCT}% ATK. Once triggered, it stays active even if HP recovers.`,
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.ARCHER, tag: UnitTag.BERSERK } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_21: {
    name: 'Pathfinder',
    description:
      `Capturing an enemy Stronghold immediately reveals the full zone it belongs to.`,
    effects: [{ type: 'STRONGHOLD_ZONE_REVEAL', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_22: {
    name: 'The Sundered',
    description:
      `Your Mages unlock the Rupture spell: deals ${Math.round(ABILITIES.RUPTURE_PERCENT * 100)}% of the target's current HP as damage for ${ABILITIES.RUPTURE_CRYSTAL_COST} crystal.`,
    effects: [{ type: 'RUPTURE_UNLOCK', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_23: {
    name: 'The Matriarch',
    description:
      `The first time each of your housing buildings reaches full population, it immediately gains a second full complement of residents.`,
    effects: [{ type: 'POP_DOUBLING_DOCTRINE', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_24: {
    name: 'Field Chirurgeon',
    description:
      `Player units that took no action this turn are healed for ${ABILITIES.IDLE_HEAL_AMOUNT} HP at the end of the player turn.`,
    effects: [{ type: 'IDLE_HEAL', params: { amount: ABILITIES.IDLE_HEAL_AMOUNT } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_25: {
    name: 'Estate Warden',
    description:
      `Each Patrician House houses ${ABILITIES.NOBLE_HOUSING_CAP_BONUS} extra noble.`,
    effects: [{ type: 'NOBLE_HOUSING_CAP_BONUS', params: { amount: ABILITIES.NOBLE_HOUSING_CAP_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_26: {
    name: 'Quartermaster',
    description:
      `🎖️ Each recruitment building supports ${ABILITIES.RECRUITMENT_CAP_BONUS} additional unit. Crystal Caves and Crystal Chambers are not affected.`,
    effects: [{ type: 'RECRUITMENT_CAP_BONUS', params: { amount: ABILITIES.RECRUITMENT_CAP_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
};

