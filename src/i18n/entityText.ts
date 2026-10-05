import type { BuildingType, Difficulty, ResourceType, TerrainTag, UnitStats, UnitTag, UnitType } from '../types';
import { BUILDING_DEFINITIONS, TAG_INFO, TERRAIN_TAG_INFO, UNIT_DEFINITIONS } from '../gameConfig';
import { t } from './i18n';

export function unitName(type: UnitType): string {
  return t(`unit.${type}.name`);
}

export function unitDesc(type: UnitType): string {
  return t(`unit.${type}.desc`, UNIT_DEFINITIONS[type].textParams);
}

export function buildingName(type: BuildingType): string {
  return t(`building.${type}.name`);
}

export function buildingDesc(type: BuildingType): string {
  return t(`building.${type}.desc`, BUILDING_DEFINITIONS[type].textParams);
}

export function tagLabel(tag: UnitTag): string {
  return t(`tag.${tag}.label`);
}

export function tagDesc(tag: UnitTag): string {
  return t(`tag.${tag}.desc`, TAG_INFO[tag].textParams);
}

export function terrainTagLabel(tag: TerrainTag): string {
  return t(`terrainTag.${tag}.label`);
}

export function terrainTagDesc(tag: TerrainTag): string {
  return t(`terrainTag.${tag}.desc`, TERRAIN_TAG_INFO[tag].textParams);
}

export function resourceName(resource: ResourceType | 'CRYSTAL'): string {
  return t(`resource.${resource}.name`);
}

export function populationName(population: 'farmer' | 'noble'): string {
  return t(`population.${population}.name`);
}

export function difficultyLabel(difficulty: Difficulty): string {
  return t(`difficulty.${difficulty}`);
}

export function statAbbr(stat: keyof UnitStats): string {
  const key = stat === 'currentHp' ? 'hp' : stat === 'maxHp' ? 'hp' : stat;
  return t(`stat.${key}`);
}
