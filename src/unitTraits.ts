import { UnitTag, type UnitType } from './types';
import type { Unit } from './types';
import { MAGE_PATH_BY_UNIT_TYPE, MAGE_UNIT_TYPES } from '../config/magic';
import type { MagicPath } from './types';

type TaggedUnit = Pick<Unit, 'tags'>;

export function isMageUnit(unit: { type: UnitType }): boolean {
  return MAGE_UNIT_TYPES.includes(unit.type);
}

export function getMagePath(unit: { type: UnitType }): MagicPath | null {
  return MAGE_PATH_BY_UNIT_TYPE[unit.type] ?? null;
}

export function isPopulationFree(unit: TaggedUnit): boolean {
  return unit.tags.includes(UnitTag.SUMMONED) || unit.tags.includes(UnitTag.MECH);
}

export function isExcludedFromUnitLimit(unit: TaggedUnit): boolean {
  return unit.tags.includes(UnitTag.SUMMONED);
}

export function cannotBeHealed(unit: TaggedUnit): boolean {
  return unit.tags.includes(UnitTag.SUMMONED) || unit.tags.includes(UnitTag.MECH);
}

export function cannotTrade(unit: TaggedUnit): boolean {
  return unit.tags.includes(UnitTag.SUMMONED) || unit.tags.includes(UnitTag.MECH);
}

export function isMech(unit: TaggedUnit): boolean {
  return unit.tags.includes(UnitTag.MECH);
}
