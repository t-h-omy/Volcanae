/**
 * Specialist effects and numeric parameters consumed by localized catalog text.
 */

import { UnitTag, UnitType } from '../src/types';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';
import { RESOURCES } from './economy';


/** Static (balance-tunable) properties of a specialist. */
export interface SpecialistDefinition {
  effects: { type: string; params: Record<string, number | string> }[];
  /** Iron cost per turn; default 0 */
  upkeepIron?: number;
  /** Wood cost per turn; default 0 */
  upkeepWood?: number;
  textParams?: { [name: string]: number };
}

/**
 * Single source of truth for specialist effects and localized text parameters.
 * Display text is stored in src/i18n/locales/en.json.
 */
const ARCHMAGE_CAST_BUDGET_BONUS = 1;
export const CAVE_SPECIALIST_ROB_REWARD_CRYSTALS = 5;

export const SPECIALIST_DEFINITIONS: Record<string, SpecialistDefinition> = {
  spec_01: {
    effects: [{ type: 'FORTIFIED_GARRISON', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { attackBonus: ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS, rangeBonus: ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS },
  },
  spec_02: {
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.RIDER, tag: UnitTag.BLOODLUST } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_03: {
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SIEGE, tag: UnitTag.SPLASH } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { damagePercent: Math.round(ABILITIES.SPLASH_DAMAGE_RATIO * 100) },
  },
  spec_04: {
    effects: [
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SPEARMAN, tag: UnitTag.READY } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SWORDSMAN, tag: UnitTag.READY } },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_05: {
    effects: [
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SPEARMAN, tag: UnitTag.LEAVES_GRAVESTONE } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SCOUT,    tag: UnitTag.LEAVES_GRAVESTONE } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.GUARD,    tag: UnitTag.LEAVES_GRAVESTONE } },
      { type: 'RAISE_GARGOYLE', params: {} },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { crystalCost: ABILITIES.GARGOYLE_CRYSTAL_COST },
  },
  spec_06: {
    effects: [{ type: 'MAGE_CAST_BUDGET_MOD', params: { amount: ARCHMAGE_CAST_BUDGET_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { casts: MAGE.SPELLS_PER_TURN + ARCHMAGE_CAST_BUDGET_BONUS, baseCasts: MAGE.SPELLS_PER_TURN },
  },
  spec_07: {
    effects: [{ type: 'KILN_BONUS', params: { radiusBonus: ABILITIES.KILN_RADIUS_BONUS, ironBonus: ABILITIES.KILN_IRON_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { range: RESOURCES.CHARCOAL_KILN_RADIUS + ABILITIES.KILN_RADIUS_BONUS, baseRange: RESOURCES.CHARCOAL_KILN_RADIUS },
  },
  spec_08: {
    effects: [{
      type: 'SCOUT_SET_TRAP',
      params: { woodCost: ABILITIES.SCOUT_TRAP_WOOD_COST, ironCost: ABILITIES.SCOUT_TRAP_IRON_COST, damage: ABILITIES.SCOUT_TRAP_DAMAGE, stunTurns: ABILITIES.SCOUT_TRAP_STUN_TURNS },
    }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { range: ABILITIES.SCOUT_TRAP_PLACE_RANGE, woodCost: ABILITIES.SCOUT_TRAP_WOOD_COST, damage: ABILITIES.SCOUT_TRAP_DAMAGE, stunTurns: ABILITIES.SCOUT_TRAP_STUN_TURNS },
  },
  spec_09: {
    effects: [{ type: 'GARRISON_OVERWATCH', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { damagePercent: ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT },
  },
  spec_10: {
    effects: [{ type: 'SCOUT_EXTINGUISH', params: { radius: ABILITIES.EXTINGUISH_RADIUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { radius: ABILITIES.EXTINGUISH_RADIUS },
  },
  spec_11: {
    effects: [
      { type: 'SCOUT_RANGE_BONUS', params: { bonus: ABILITIES.SCOUT_ATTACK_RANGE_BONUS } },
      { type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SCOUT, tag: UnitTag.RANGED } },
    ],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { rangeBonus: ABILITIES.SCOUT_ATTACK_RANGE_BONUS },
  },
  spec_12: {
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.RIDER, tag: UnitTag.KNOCKBACK } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { knockbackRange: ABILITIES.ADJACENCY_RANGE },
  },
  spec_13: {
    effects: [{ type: 'GRANT_TAG_TO_UNITS_WITH_TAG', params: { sourceTag: UnitTag.SUMMONED, tags: `${UnitTag.RAGE},${UnitTag.CLEAVE}` } }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_14: {
    effects: [{ type: 'HOUSING_CAP_BONUS', params: { amount: ABILITIES.HOUSING_CAP_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { capacityBonus: ABILITIES.HOUSING_CAP_BONUS },
  },
  spec_15: {
    effects: [{ type: 'CINDERBORN_RECRUIT', params: { rows: ABILITIES.CINDERBORN_ROWS, attackBonus: ABILITIES.CINDERBORN_ATTACK_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { rows: ABILITIES.CINDERBORN_ROWS, attackBonus: ABILITIES.CINDERBORN_ATTACK_BONUS },
  },
  spec_16: {
    effects: [{ type: 'RESONANCE_ON_UNIT_LAVA_DEATH', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_17: {
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.SIEGE, tag: UnitTag.BATTERY } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { attackPerAdjacent: ABILITIES.SIEGE_BATTERY_ATK_PER_ADJACENT, stackCap: ABILITIES.SIEGE_BATTERY_CAP },
  },
  spec_18: {
    effects: [{ type: 'RESONANCE_CRYSTAL_BONUS', params: { bonusRows: ABILITIES.RESONANCE_BONUS_ROWS, bonusCrystals: ABILITIES.RESONANCE_BONUS_CRYSTALS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { rows: ABILITIES.RESONANCE_BONUS_ROWS, crystalBonus: ABILITIES.RESONANCE_BONUS_CRYSTALS },
  },
  spec_19: {
    effects: [{ type: 'ARCHER_VS_STRUCTURE', params: { damagePct: ABILITIES.ARCHER_STRUCTURE_DMG_PCT } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { damagePercent: ABILITIES.ARCHER_STRUCTURE_DMG_PCT },
  },
  spec_20: {
    effects: [{ type: 'GRANT_UNIT_TAG_ALL', params: { unitType: UnitType.ARCHER, tag: UnitTag.BERSERK } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { hpThresholdPct: ABILITIES.BERSERK_HP_THRESHOLD_PCT, attackPct: ABILITIES.BERSERK_ATTACK_PCT },
  },
  spec_21: {
    effects: [{ type: 'STRONGHOLD_ZONE_REVEAL', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_22: {
    effects: [{ type: 'RUPTURE_UNLOCK', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { damagePercent: Math.round(ABILITIES.RUPTURE_PERCENT * 100), crystalCost: ABILITIES.RUPTURE_CRYSTAL_COST },
  },
  spec_23: {
    effects: [{ type: 'POP_DOUBLING_DOCTRINE', params: {} }],
    upkeepIron: 0,
    upkeepWood: 0,
  },
  spec_24: {
    effects: [{ type: 'IDLE_HEAL', params: { amount: ABILITIES.IDLE_HEAL_AMOUNT } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { healAmount: ABILITIES.IDLE_HEAL_AMOUNT },
  },
  spec_25: {
    effects: [{ type: 'NOBLE_HOUSING_CAP_BONUS', params: { amount: ABILITIES.NOBLE_HOUSING_CAP_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { capacityBonus: ABILITIES.NOBLE_HOUSING_CAP_BONUS },
  },
  spec_26: {
    effects: [{ type: 'RECRUITMENT_CAP_BONUS', params: { amount: ABILITIES.RECRUITMENT_CAP_BONUS } }],
    upkeepIron: 0,
    upkeepWood: 0,
  
    textParams: { capacityBonus: ABILITIES.RECRUITMENT_CAP_BONUS },
  },
};
