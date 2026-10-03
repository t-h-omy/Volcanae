import { ABILITIES } from './gameConfig';
import { getBerserkDisplayBonus } from './combatSystem';
import { UnitTag, type Unit } from './types';

export type AttackDisplayRow = {
  stat: 'ATK';
  value: number;
  kind: 'active' | 'applied';
  source: string;
};

export type AttackDisplayEffect = {
  stat: 'ATK' | 'DMG';
  value: number;
  displayValue: string;
  kind: 'active';
  source: string;
  condition?: string;
};

export type AttackDisplayContext = {
  phalanxAttack: number;
  rageBonus: number;
  rageAdjacentCount: number;
  batteryBonus: number;
  lanceChargeBonus: number;
  assassinBonusActive: boolean;
};

/**
 * Computes standing ATK modifiers shown in the HUD.
 *
 * `unit.stats.attack` already includes baked/applied attack bonuses such as
 * CINDERBORN, while PHALANX / RAGE / BATTERY are added contextually. The
 * returned BERSERK bonus mirrors combat's percent boost on that pre-berserk
 * standing total so the HUD badge matches resolved combat math.
 */
export function getAttackDisplayModifiers(
  unit: Pick<Unit, 'tags' | 'stats' | 'berserkActivated' | 'bloodlustAttackAvailable'>,
  context: AttackDisplayContext,
): {
  appliedAttackBonus: number;
  contextualAttackBonus: number;
  effectiveAttackBeforeBerserk: number;
  berserkDisplayBonus: number;
  netAttackModifier: number;
  rows: AttackDisplayRow[];
  effects: AttackDisplayEffect[];
} {
  const rows: AttackDisplayRow[] = [];
  const effects: AttackDisplayEffect[] = [];
  let appliedAttackBonus = 0;
  let contextualAttackBonus = 0;

  if (unit.tags.includes(UnitTag.CINDERBORN)) {
    appliedAttackBonus += ABILITIES.CINDERBORN_ATTACK_BONUS;
    rows.push({
      stat: 'ATK',
      value: ABILITIES.CINDERBORN_ATTACK_BONUS,
      kind: 'applied',
      source: 'Cinderborn (tag)',
    });
  }

  if (context.phalanxAttack > 0) {
    contextualAttackBonus += context.phalanxAttack;
    rows.push({
      stat: 'ATK',
      value: context.phalanxAttack,
      kind: 'active',
      source: 'Phalanx Formation (adjacent guard)',
    });
  }

  if (context.rageBonus > 0) {
    contextualAttackBonus += context.rageBonus;
    rows.push({
      stat: 'ATK',
      value: context.rageBonus,
      kind: 'active',
      source: `Rage (+${ABILITIES.RAGE_ATK_PER_ADJACENT} ATK per adjacent enemy, ${context.rageAdjacentCount} nearby)`,
    });
  }

  if (context.batteryBonus > 0) {
    contextualAttackBonus += context.batteryBonus;
    rows.push({
      stat: 'ATK',
      value: context.batteryBonus,
      kind: 'active',
      source: `Battery (+${ABILITIES.SIEGE_BATTERY_ATK_PER_ADJACENT} ATK per adjacent friendly unit)`,
    });
  }

  if (context.lanceChargeBonus > 0) {
    contextualAttackBonus += context.lanceChargeBonus;
    rows.push({
      stat: 'ATK',
      value: context.lanceChargeBonus,
      kind: 'active',
      source: 'Lance Charge (has not moved this turn)',
    });
  }

  if (context.assassinBonusActive) {
    effects.push({
      stat: 'DMG',
      value: 1,
      displayValue: `×${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}`,
      kind: 'active',
      source: 'Assassin',
      condition: 'Only against full-health targets',
    });
  }

  if (unit.tags.includes(UnitTag.BLOODLUST) && unit.bloodlustAttackAvailable) {
    effects.push({
      stat: 'ATK',
      value: -1,
      displayValue: '×0.5',
      kind: 'active',
      source: 'Bloodlust second strike (base attack halved)',
    });
  }

  const effectiveAttackBeforeBerserk = unit.stats.attack + contextualAttackBonus;
  const berserkDisplayBonus = getBerserkDisplayBonus(unit, effectiveAttackBeforeBerserk);
  if (berserkDisplayBonus > 0) {
    contextualAttackBonus += berserkDisplayBonus;
    rows.push({
      stat: 'ATK',
      value: berserkDisplayBonus,
      kind: 'active',
      source: `Berserk (+${ABILITIES.BERSERK_ATTACK_PCT}% ATK, HP below ${ABILITIES.BERSERK_HP_THRESHOLD_PCT}%)`,
    });
  }

  return {
    appliedAttackBonus,
    contextualAttackBonus,
    effectiveAttackBeforeBerserk,
    berserkDisplayBonus,
    netAttackModifier: appliedAttackBonus + contextualAttackBonus,
    rows,
    effects,
  };
}
