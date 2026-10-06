/**
 * Text parameters and icons for each UnitTag.
 *
 * This module exists as its own file because TAG_INFO references BUILDING_DEFINITIONS
 * construction costs (FIELDWORK and BRIDGE_BUILDER entries) at declaration time;
 * merging it into abilities.ts would create a cycle with buildings.ts.
 */

import { UnitTag } from '../src/types';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';
import { BUILDING_DEFINITIONS } from './buildings';
import { POPULATION, TRAINING } from './economy';


/**
 * Numeric text values are exposed only as textParams for localized ICU messages.
 */
export const TAG_INFO: Record<UnitTag, { icon?: string; textParams?: { [name: string]: number } }> = {
  [UnitTag.RANGED]: {},
  [UnitTag.PREP]: {},
  [UnitTag.BUILDANDCAPTURE]: {},
  [UnitTag.SACRIFICIAL]: {},
  [UnitTag.EXPLOSIVE]: {},
  [UnitTag.FIELDWORK]: { textParams: { woodCost: BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood, hpMultiplier: ABILITIES.FIELDWORK_HP_MULTIPLIER } },
  [UnitTag.ASSASSIN]: { textParams: { damageMultiplier: ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER } },
  [UnitTag.PATCHUP]: { textParams: { healAmount: ABILITIES.PATCHUP_HEAL_AMOUNT } },
  [UnitTag.PHALANX]: { textParams: { defenseBonus: ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER, attackBonus: ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY } },
  [UnitTag.CORRUPT]: {},
  [UnitTag.PASSIVE]: {},
  [UnitTag.LANCE_CHARGE]: { textParams: { attackBonus: ABILITIES.LANCE_CHARGE_ATTACK_BONUS } },
  [UnitTag.KNIGHT]: { textParams: { maxHpBonus: ABILITIES.KNIGHT_MAX_HP_BONUS } },
  [UnitTag.HIT_AND_RUN]: { textParams: { postAttackMoveRange: ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE, defensePenalty: Math.abs(ABILITIES.HIT_AND_RUN_DEFENSE_MOD) } },
  [UnitTag.OUTRIDER]: { textParams: { moveBonus: ABILITIES.OUTRIDER_MOVE_BONUS } },
  [UnitTag.COVER]: {},
  [UnitTag.SKIRMISHER]: { textParams: { moveBonus: ABILITIES.SKIRMISHER_MOVE_BONUS } },
  [UnitTag.PIN_DOWN]: { textParams: { stunChancePct: Math.round(ABILITIES.PIN_DOWN_STUN_CHANCE * 100) } },
  [UnitTag.DISTRACTION]: { textParams: { defenseReduction: ABILITIES.DISTRACTION_DEF_REDUCTION, attackReduction: Math.abs(ABILITIES.DISTRACTION_ATTACK_MOD) } },
  [UnitTag.PREVENTIVE_STRIKE]: { textParams: { damagePercent: ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT } },
  [UnitTag.ELITE]: { textParams: { maxHpBonus: ABILITIES.ELITE_MAX_HP_BONUS } },
  [UnitTag.FORTIFIED_GARRISON]: { textParams: { attackBonus: ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS, rangeBonus: ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS } },
  [UnitTag.BLOODLUST]: {},
  [UnitTag.SPLASH]: { textParams: { damagePercent: Math.round(ABILITIES.SPLASH_DAMAGE_RATIO * 100) } },
  [UnitTag.READY]: {},
  [UnitTag.REVIVABLE]: { textParams: { reviveCrystalCost: ABILITIES.REVIVE_CRYSTAL_COST } },
  [UnitTag.SUMMONED]: {},
  [UnitTag.BRANDMARKED]: { icon: '🩸', textParams: { attackBonus: MAGE.BRANDMARK_ATTACK_BONUS, hpLossPerTurn: MAGE.BRANDMARK_HP_LOSS_PER_TURN } },
  [UnitTag.LEASHED]: {},
  [UnitTag.NO_GRAVESTONE]: {},
  [UnitTag.LEAVES_GRAVESTONE]: {},
  [UnitTag.LAVA]: {},
  [UnitTag.CLEAVE]: { textParams: { damagePercent: ABILITIES.CLEAVE_DAMAGE_MULTIPLIER * 100 } },
  [UnitTag.PIERCE]: { textParams: { primaryDamagePercent: ABILITIES.PIERCE_PRIMARY_DAMAGE_MULTIPLIER * 100, secondaryDamagePercent: ABILITIES.PIERCE_SECONDARY_DAMAGE_MULTIPLIER * 100 } },
  [UnitTag.RAGE]: { textParams: { attackPerAdjacent: ABILITIES.RAGE_ATK_PER_ADJACENT, adjacentCap: ABILITIES.RAGE_MAX_ADJACENT_COUNT, attackCap: ABILITIES.RAGE_ATK_PER_ADJACENT * ABILITIES.RAGE_MAX_ADJACENT_COUNT } },
  [UnitTag.ALERT]: {},
  [UnitTag.IRONBLOOD]: { textParams: { damagePercent: ABILITIES.IRONBLOOD_SUMMONED_DAMAGE_MULTIPLIER * 100 } },
  [UnitTag.BLOCK]: { textParams: { damagePercent: ABILITIES.BLOCK_MELEE_DAMAGE_MULTIPLIER * 100 } },
  [UnitTag.PUNCTURE]: { textParams: { defenseThreshold: ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD, stunDuration: ABILITIES.PUNCTURE_STUN_DURATION } },
  [UnitTag.RELOAD]: { textParams: { defensePenaltyPct: ABILITIES.RELOAD_DEF_PENALTY_PCT } },
  [UnitTag.BURN]: {},
  [UnitTag.TUNNEL]: { textParams: { rangeMin: ABILITIES.TUNNEL_RANGE_MIN, rangeMax: ABILITIES.TUNNEL_RANGE_MAX, emergenceDamage: ABILITIES.TUNNEL_EMERGE_DAMAGE } },
  [UnitTag.EMBER_PORTAL]: {},
  [UnitTag.HOMELESS]: { icon: '🏚️', textParams: { defensePenalty: POPULATION.HOMELESS_DEF_PENALTY, hpLossPerTurn: POPULATION.HOMELESS_HP_LOSS_PER_TURN } },
  [UnitTag.UNTRAINED]: { icon: '📉', textParams: { attackPenalty: TRAINING.UNTRAINED_ATK_PENALTY } },
  [UnitTag.FLYING]: { icon: '🕊️', textParams: { rangedDamageTakenPct: Math.round((ABILITIES.FLYING_RANGED_DAMAGE_TAKEN_MULTIPLIER - 1) * 100) } },
  [UnitTag.CORRUPTED]: { icon: '☠️' },
  [UnitTag.BRIDGE_BUILDER]: { textParams: { woodCost: BUILDING_DEFINITIONS.BRIDGE.constructionCost.wood } },
  [UnitTag.KNOCKBACK]: {},
  [UnitTag.CINDERBORN]: { textParams: { rows: ABILITIES.CINDERBORN_ROWS, attackBonus: ABILITIES.CINDERBORN_ATTACK_BONUS } },
  [UnitTag.BERSERK]: { textParams: { hpThresholdPct: ABILITIES.BERSERK_HP_THRESHOLD_PCT, attackPct: ABILITIES.BERSERK_ATTACK_PCT } },
  [UnitTag.BATTERY]: { textParams: { attackPerAdjacent: ABILITIES.SIEGE_BATTERY_ATK_PER_ADJACENT, stackCap: ABILITIES.SIEGE_BATTERY_CAP } },
};
