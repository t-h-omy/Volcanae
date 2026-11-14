import type { Unit } from './types';
import { UnitTag } from './types';

export interface UnitDamageOutcome {
  currentHp: number;
  /** Remaining Arcane Shield pool after the hit (0 when depleted or absent). */
  arcaneShieldHp: number;
  /** Damage soaked by the Arcane Shield in this hit. */
  absorbedByArcaneShield: number;
  stoneSkinHp: number;
  hasStoneSkin: boolean;
  died: boolean;
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
  const currentHp = Math.max(0, unit.stats.currentHp - (afterShield - absorbedDamage));
  const stillHasStoneSkin = hasStoneSkin && remainingStoneSkinHp > 0;

  return {
    currentHp,
    arcaneShieldHp: arcaneShieldHp - absorbedByArcaneShield,
    absorbedByArcaneShield,
    stoneSkinHp: stillHasStoneSkin ? remainingStoneSkinHp : 0,
    hasStoneSkin: stillHasStoneSkin,
    died: currentHp <= 0,
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
