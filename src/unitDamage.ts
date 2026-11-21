import type { Unit } from './types';
import { UnitTag } from './types';
import { MAGE } from '../config/magic';

export interface UnitDamageOutcome {
  currentHp: number;
  /** Remaining Arcane Shield pool after the hit (0 when depleted or absent). */
  arcaneShieldHp: number;
  /** Damage soaked by the Arcane Shield in this hit. */
  absorbedByArcaneShield: number;
  stoneSkinHp: number;
  hasStoneSkin: boolean;
  died: boolean;
  deathPrevented: boolean;
}

export function getUnitDamageOutcome(unit: Unit, damage: number): UnitDamageOutcome {
  const incomingDamage = Math.max(0, damage);
  const arcaneShieldHp = Math.max(0, unit.arcaneShieldHp ?? 0);
  const absorbedByArcaneShield = Math.min(arcaneShieldHp, incomingDamage);
  const afterShield = incomingDamage - absorbedByArcaneShield;
  const hasStoneSkin = unit.tags.includes(UnitTag.STONE_SKIN);
  const stoneSkinHp = hasStoneSkin ? Math.max(0, unit.stoneSkinHp ?? 0) : 0;
  const absorbedDamage = Math.min(stoneSkinHp, afterShield);
  const remainingStoneSkinHp = stoneSkinHp - absorbedDamage;
  const rawCurrentHp = unit.stats.currentHp - (afterShield - absorbedDamage);
  const deathless = unit.tags.includes(UnitTag.DEATHLESS);
  const currentHp = deathless
    ? Math.max(MAGE.DEATHLESS_MINIMUM_HP, rawCurrentHp)
    : Math.max(0, rawCurrentHp);
  const stillHasStoneSkin = hasStoneSkin && remainingStoneSkinHp > 0;
  const deathPrevented = deathless && rawCurrentHp < MAGE.DEATHLESS_MINIMUM_HP;

  return {
    currentHp,
    arcaneShieldHp: arcaneShieldHp - absorbedByArcaneShield,
    absorbedByArcaneShield,
    stoneSkinHp: stillHasStoneSkin ? remainingStoneSkinHp : 0,
    hasStoneSkin: stillHasStoneSkin,
    died: currentHp <= 0,
    deathPrevented,
  };
}

export function applyUnitDamage(unit: Unit, damage: number): UnitDamageOutcome {
  const outcome = getUnitDamageOutcome(unit, damage);
  unit.stats.currentHp = outcome.currentHp;

  if (unit.arcaneShieldHp !== undefined) {
    if (outcome.arcaneShieldHp > 0) {
      unit.arcaneShieldHp = outcome.arcaneShieldHp;
    } else {
      delete unit.arcaneShieldHp;
    }
  }

  if (unit.tags.includes(UnitTag.STONE_SKIN)) {
    if (outcome.hasStoneSkin) {
      unit.stoneSkinHp = outcome.stoneSkinHp;
    } else {
      unit.tags = unit.tags.filter((tag) => tag !== UnitTag.STONE_SKIN);
      delete unit.stoneSkinHp;
    }
  }

  return outcome;
}
