import type { BuildingType, Difficulty, ResourceType, SpellId, TechEffect, TechFlag, TechId, TerrainTag, UnitStats, UnitTag, UnitType } from '../types';
import { BUILDING_DEFINITIONS, SPELL_DEFINITIONS, SPECIALIST_DEFINITIONS, TAG_INFO, TECH_TREE, TERRAIN_TAG_INFO, UNIT_DEFINITIONS } from '../gameConfig';
import { HINT_DEFINITIONS, type HintId } from '../../config/hints';
import { formatSigned, t, type TextKey, type TextParams, type TextRef } from './i18n';

export function buildingNameRef(type: BuildingType): TextRef {
  return { key: `building.${type}.name` as TextKey };
}

export function techNameRef(id: TechId): TextRef {
  return { key: `tech.${id}.name` as TextKey };
}

export function specialistNameRef(id: string): TextRef {
  return { key: `specialist.${id}.name` as TextKey };
}

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

export function resourceName(resource: ResourceType | 'CRYSTAL' | Lowercase<ResourceType>): string {
  return t(`resource.${resource.toUpperCase()}.name` as TextKey);
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

export function techName(id: TechId): string {
  return t(`tech.${id}.name` as TextKey);
}

export function techDesc(id: TechId): string {
  const definition = TECH_TREE.find((entry) => entry.id === id);
  return t(`tech.${id}.desc` as TextKey, definition?.textParams);
}

function techFlagDesc(flag: TechFlag): string {
  const id = flag === 'TO_THE_FRONT' ? 'TO_THE_FRONT' : flag === 'GRAVE_HARVEST' ? 'GRAVE_HARVEST' : undefined;
  const params = id ? TECH_TREE.find((entry) => entry.id === id)?.textParams : undefined;
  return t(`techFlag.${flag}.desc` as TextKey, params);
}

export function techEffectText(effect: TechEffect): string {
  let key: string;
  let params: TextParams;
  switch (effect.type) {
    case 'UNLOCK_BUILDING':
      key = effect.buildingType === 'CRYSTAL_TOWER' ? 'techEffect.UNLOCK_BUILDING_SPELL' : 'techEffect.UNLOCK_BUILDING';
      params = { building: buildingName(effect.buildingType) };
      break;
    case 'UNLOCK_UNIT':
      key = 'techEffect.UNLOCK_UNIT';
      params = { unit: unitName(effect.unitType) };
      break;
    case 'GRANT_UNIT_TAG':
    case 'REMOVE_UNIT_TAG':
      key = `techEffect.${effect.type}`;
      params = { unit: unitName(effect.unitType), tag: tagLabel(effect.tag) };
      break;
    case 'UNIT_STAT_MOD':
      key = effect.mode === 'add' ? 'techEffect.UNIT_STAT_MOD_ADD' : 'techEffect.UNIT_STAT_MOD_PERCENT';
      params = { unit: unitName(effect.unitType), stat: statAbbr(effect.stat), value: formatSigned(effect.value) };
      break;
    case 'UNIT_COST_MOD':
      key = 'techEffect.UNIT_COST_MOD';
      params = { unit: unitName(effect.unitType), resource: resourceName(effect.resource), value: formatSigned(effect.amount) };
      break;
    case 'BUILDING_PRODUCTION_MOD':
      key = 'techEffect.BUILDING_PRODUCTION_MOD';
      params = { building: buildingName(effect.buildingType), chance: effect.chancePercent, amount: effect.amount, resource: resourceName(effect.resource) };
      break;
    case 'FLAT_INCOME_MOD':
      key = 'techEffect.FLAT_INCOME_MOD';
      params = { amount: effect.amount, resource: resourceName(effect.resource), building: buildingName(effect.requiresBuilding) };
      break;
    case 'FLAG':
      return techFlagDesc(effect.flag);
    case 'STRONGHOLD_CAP_MOD':
      key = 'techEffect.STRONGHOLD_CAP_MOD';
      params = { building: buildingName('STRONGHOLD'), amount: effect.amount, population: populationName(effect.capType) };
      break;
    case 'SPECIALIST_SLOT_MOD':
      key = 'techEffect.SPECIALIST_SLOT_MOD';
      params = { count: effect.value };
      break;
    case 'UNLOCK_SPELL':
      key = 'techEffect.UNLOCK_SPELL';
      params = { spell: spellName(effect.spellId) };
      break;
  }
  return t(key as TextKey, params);
}

export function spellName(id: SpellId): string {
  return t(`spell.${id}.name` as TextKey);
}

export function spellDesc(id: SpellId): string {
  return t(`spell.${id}.desc` as TextKey, SPELL_DEFINITIONS[id].textParams);
}

export function spellTargetHint(id: SpellId, secondPick: boolean): string {
  const suffix = secondPick && id === 'TRANSPOSE' ? '.targetHintSecondPick' : '.targetHint';
  return t(`spell.${id}${suffix}` as TextKey, SPELL_DEFINITIONS[id].textParams);
}

export function specialistName(id: string): string {
  return t(`specialist.${id}.name` as TextKey);
}

export function specialistDesc(id: string): string {
  return t(`specialist.${id}.desc` as TextKey, SPECIALIST_DEFINITIONS[id].textParams);
}

export function hintShort(id: HintId): string {
  return t(`hint.${id}.short` as TextKey, HINT_DEFINITIONS[id].textParams);
}

export function hintDetail(id: HintId): string {
  return t(`hint.${id}.detail` as TextKey, HINT_DEFINITIONS[id].textParams);
}
