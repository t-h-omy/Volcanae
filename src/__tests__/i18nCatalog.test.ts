import IntlMessageFormat from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, type LocaleCode } from '../../config/i18n';
import {
  BUILDING_DEFINITIONS,
  SPECIALIST_DEFINITIONS,
  SPELL_DEFINITIONS,
  TAG_INFO,
  TERRAIN_TAG_INFO,
  TECH_TREE,
  UNIT_DEFINITIONS,
} from '../gameConfig';
import { HINT_DEFINITIONS } from '../../config/hints';
import { BuildingType, Difficulty, SpellId, TechFlag, TerrainTag, UnitTag, UnitType } from '../types';
import context from '../i18n/context.json';
import { validateCatalogs } from '../../scripts/lib/catalogValidation.mjs';

type Catalog = Record<string, string>;
type AstNode = {
  type: number;
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
  pluralType?: string;
};
type MessageContext = { note?: string; maxLen?: number; sameAsSource?: LocaleCode[] };

const catalogs = import.meta.glob<Catalog>('../i18n/locales/*.json', { eager: true, import: 'default' });
const sources = import.meta.glob<Catalog>('../i18n/locales/sources/*.json', { eager: true, import: 'default' });
const en = catalogs['../i18n/locales/en.json']!;
const targets = SUPPORTED_LOCALES.filter((locale) => locale !== 'en');

function collectArguments(nodes: AstNode[], names = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type !== 0 && node.type !== 7 && node.value !== undefined) names.add(node.value);
    for (const option of Object.values(node.options ?? {})) collectArguments(option.value, names);
  }
  return names;
}

function astFor(message: string, locale: string): AstNode[] {
  return new IntlMessageFormat(message, locale).getAst() as AstNode[];
}

const sharedValidationErrors = validateCatalogs({
  catalogs: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [
    locale,
    catalogs[`../i18n/locales/${locale}.json`]!,
  ])),
  sources: Object.fromEntries(targets.map((locale) => [
    locale,
    sources[`../i18n/locales/sources/${locale}.json`]!,
  ])),
  context: context as Record<string, MessageContext>,
  locales: SUPPORTED_LOCALES,
});

describe('localization catalogs', () => {
  it('shared catalog checks a, b, c, g, h, i, j, and k pass', () => {
    expect(sharedValidationErrors).toEqual([]);
  });

  it('d: every entity, resource, population, difficulty, and stat key exists in English', () => {
    const keys = [
      ...Object.values(UnitType).flatMap((type) => [`unit.${type}.name`, `unit.${type}.desc`]),
      ...Object.values(BuildingType).flatMap((type) => [`building.${type}.name`, `building.${type}.desc`]),
      ...Object.values(UnitTag).flatMap((tag) => [`tag.${tag}.label`, `tag.${tag}.desc`]),
      ...Object.values(TerrainTag).flatMap((tag) => [`terrainTag.${tag}.label`, `terrainTag.${tag}.desc`]),
      ...TECH_TREE.flatMap(({ id }) => [`tech.${id}.name`, `tech.${id}.desc`]),
      ...Object.values(TechFlag).map((flag) => `techFlag.${flag}.desc`),
      ...[
        'UNLOCK_BUILDING',
        'UNLOCK_BUILDING_SPELL',
        'UNLOCK_UNIT',
        'GRANT_UNIT_TAG',
        'REMOVE_UNIT_TAG',
        'UNIT_STAT_MOD_ADD',
        'UNIT_STAT_MOD_PERCENT',
        'UNIT_COST_MOD',
        'BUILDING_PRODUCTION_MOD',
        'FLAT_INCOME_MOD',
        'STRONGHOLD_CAP_MOD',
        'SPECIALIST_SLOT_MOD',
        'UNLOCK_SPELL',
      ].map((type) => `techEffect.${type}`),
      ...Object.values(SpellId).flatMap((id) => [`spell.${id}.name`, `spell.${id}.desc`, `spell.${id}.targetHint`]),
      'spell.TRANSPOSE.targetHintSecondPick',
      ...Object.keys(SPECIALIST_DEFINITIONS).flatMap((id) => [`specialist.${id}.name`, `specialist.${id}.desc`]),
      ...Object.keys(HINT_DEFINITIONS).flatMap((id) => [`hint.${id}.short`, `hint.${id}.detail`]),
      ...Object.values(Difficulty).map((difficulty) => `difficulty.${difficulty}`),
      ...['IRON', 'WOOD', 'CRYSTAL'].map((resource) => `resource.${resource}.name`),
      ...['farmer', 'noble'].map((population) => `population.${population}.name`),
      ...['hp', 'attack', 'defense', 'moveRange', 'attackRange', 'discoverRadius', 'triggerRange', 'movementActions']
        .map((stat) => `stat.${stat}`),
    ];
    for (const key of keys) expect(en).toHaveProperty(key);
  });

  it('e: entity description arguments match configured text parameters', () => {
    const definitions = [
      ...Object.entries(UNIT_DEFINITIONS).map(([id, definition]) => [`unit.${id}.desc`, definition.textParams] as const),
      ...Object.entries(BUILDING_DEFINITIONS).map(([id, definition]) => [`building.${id}.desc`, definition.textParams] as const),
      ...Object.entries(TAG_INFO).map(([id, definition]) => [`tag.${id}.desc`, definition.textParams] as const),
      ...Object.entries(TERRAIN_TAG_INFO).map(([id, definition]) => [`terrainTag.${id}.desc`, definition.textParams] as const),
      ...TECH_TREE.map((definition) => [`tech.${definition.id}.desc`, definition.textParams] as const),
      ...TECH_TREE.filter((definition) => definition.textParams).map((definition) => [`tech.${definition.id}.desc`, definition.textParams] as const),
    ];
    for (const [key, params] of definitions) {
      expect([...collectArguments(astFor(en[key]!, 'en'))].sort(), key).toEqual(Object.keys(params ?? {}).sort());
    }

    const referencedDefinitions = [
      ...TECH_TREE.flatMap((definition) => definition.effects
        .filter((effect) => effect.type === 'FLAG')
        .map((effect) => [`techFlag.${effect.flag}.desc`, definition.textParams] as const)),
      ...Object.entries(SPELL_DEFINITIONS).flatMap(([id, definition]) => [
        [`spell.${id}.desc`, definition.textParams] as const,
        [`spell.${id}.targetHint`, definition.textParams] as const,
        ...(id === SpellId.TRANSPOSE ? [[`spell.${id}.targetHintSecondPick`, definition.textParams] as const] : []),
      ]),
      ...Object.entries(SPECIALIST_DEFINITIONS).map(([id, definition]) => [`specialist.${id}.desc`, definition.textParams] as const),
      ...Object.entries(HINT_DEFINITIONS).flatMap(([id, definition]) => [
        [`hint.${id}.short`, definition.textParams] as const,
        [`hint.${id}.detail`, definition.textParams] as const,
      ]),
    ];
    for (const [key, params] of referencedDefinitions) {
      for (const arg of collectArguments(astFor(en[key]!, 'en'))) {
        expect(Object.keys(params ?? {}), `${key}:${arg}`).toContain(arg);
      }
    }
  });

  it('f: entity messages contain no ASCII digits outside the allowlist', () => {
    const digitAllowlist: string[] = [
      // Structural numeric phrases belong here only when no gameplay constant backs them.
    ];
    for (const [key, message] of Object.entries(en)) {
      if (!/^(unit|building|tag|terrainTag|tech|techFlag|techEffect|spell|specialist|hint)\./.test(key) || digitAllowlist.includes(key)) continue;
      expect(message, key).not.toMatch(/[0-9]/);
    }
  });

  it('l: specialist names are unique in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      const names = Object.keys(SPECIALIST_DEFINITIONS).map((id) => catalog[`specialist.${id}.name`]!.trim().toLocaleLowerCase(locale));
      expect(new Set(names).size, locale).toBe(names.length);
    }
  });
});
