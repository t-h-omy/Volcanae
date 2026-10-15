import { UnitTag } from './types';
import type { Unit } from './types';

type TaggedUnit = Pick<Unit, 'tags'>;

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
