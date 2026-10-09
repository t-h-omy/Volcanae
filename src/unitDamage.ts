import type { Unit } from './types';
import { UnitTag } from './types';

export interface UnitDamageOutcome {
  currentHp: number;
  stoneSkinHp: number;
  hasStoneSkin: boolean;
  died: boolean;
}

export function getUnitDamageOutcome(unit: Unit, damage: number): UnitDamageOutcome {
  const incomingDamage = Math.max(0, damage);
  const hasStoneSkin = unit.tags.includes(UnitTag.STONE_SKIN);
  const stoneSkinHp = hasStoneSkin ? Math.max(0, unit.stoneSkinHp ?? 0) : 0;
  const absorbedDamage = Math.min(stoneSkinHp, incomingDamage);
  const remainingStoneSkinHp = stoneSkinHp - absorbedDamage;
  const currentHp = Math.max(0, unit.stats.currentHp - (incomingDamage - absorbedDamage));
  const stillHasStoneSkin = hasStoneSkin && remainingStoneSkinHp > 0;

  return {
    currentHp,
    stoneSkinHp: stillHasStoneSkin ? remainingStoneSkinHp : 0,
    hasStoneSkin: stillHasStoneSkin,
    died: currentHp <= 0,
  };
}

export function applyUnitDamage(unit: Unit, damage: number): UnitDamageOutcome {
  const outcome = getUnitDamageOutcome(unit, damage);
  unit.stats.currentHp = outcome.currentHp;

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
