import IntlMessageFormat from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../config/abilities';
import { ALL_HINT_IDS, HINT_DEFINITIONS, type HintId } from '../../config/hints';
import { SUPPORTED_LOCALES } from '../../config/i18n';
import { MAGE } from '../../config/magic';
import { CORRUPTED_QORK, CRYSTAL_KHYRON, GHOUL } from '../../config/units';

type Catalog = Record<string, string>;
type AstNode = {
  type: number;
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
};

const catalogs = import.meta.glob<Catalog>('../i18n/locales/*.json', { eager: true, import: 'default' });
const sources = import.meta.glob<Catalog>('../i18n/locales/sources/*.json', { eager: true, import: 'default' });
const newHintIds = [
  'H21_KHYRON_RESONANCE',
  'H22_QORK_CORRUPTION',
  'H23_INFESTED_SPREAD',
  'H24_MAGE_PORTAL',
  'H25_KHYRON_LEVEL_UP',
  'H26_GHOUL_GRAVESTONES',
  'H27_STONE_SKIN_ROOTED',
] satisfies HintId[];
const updatedHintIds: HintId[] = ['H19_EMBERBIND_LEASH', ...newHintIds];

function argumentsIn(nodes: AstNode[], names = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type !== 0 && node.type !== 7 && node.value !== undefined) names.add(node.value);
    for (const option of Object.values(node.options ?? {})) argumentsIn(option.value, names);
  }
  return names;
}

describe('hint registry and catalogs', () => {
  it('keeps unique registered IDs, definitions and catalog keys in sync', () => {
    expect(new Set(ALL_HINT_IDS).size).toBe(ALL_HINT_IDS.length);
    expect([...ALL_HINT_IDS].sort()).toEqual(Object.keys(HINT_DEFINITIONS).sort());
    for (const id of newHintIds) expect(ALL_HINT_IDS).toContain(id);
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      const hintKeys = Object.keys(catalog).filter((key) => key.startsWith('hint.')).sort();
      expect(hintKeys, locale).toEqual(ALL_HINT_IDS.flatMap((id) => [
        `hint.${id}.short`, `hint.${id}.detail`,
      ]).sort());
    }
  });

  it('gets new hint parameters from their gameplay constants', () => {
    expect(Object.fromEntries(newHintIds.map((id) => [id, HINT_DEFINITIONS[id].textParams ?? {}]))).toEqual({
      H21_KHYRON_RESONANCE: {
        healAmount: ABILITIES.RESONANCE_HEAL_AMOUNT,
        maxLevel: CRYSTAL_KHYRON.MAX_LEVEL,
      },
      H22_QORK_CORRUPTION: {
        hpLoss: CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS,
        explosionDamage: CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE,
      },
      H23_INFESTED_SPREAD: { hpLoss: MAGE.INFESTED_HP_LOSS_PER_TURN },
      H24_MAGE_PORTAL: {},
      H25_KHYRON_LEVEL_UP: {},
      H26_GHOUL_GRAVESTONES: {
        maxLevel: GHOUL.MAX_LEVEL,
        killHealPercent: GHOUL.KILL_HEAL_PERCENT,
      },
      H27_STONE_SKIN_ROOTED: { stoneHp: MAGE.STONE_SKIN_HP },
    });
  });

  it.each(SUPPORTED_LOCALES)('compiles all hint messages with configured parameters in %s', (locale) => {
    const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
    for (const id of ALL_HINT_IDS) {
      const params = HINT_DEFINITIONS[id].textParams ?? {};
      const referenced = new Set<string>();
      for (const field of ['short', 'detail']) {
        const key = `hint.${id}.${field}`;
        const message = new IntlMessageFormat(catalog[key]!, locale);
        for (const name of argumentsIn(message.getAst() as AstNode[])) {
          expect(Object.keys(params), `${locale}:${key}:${name}`).toContain(name);
          referenced.add(name);
        }
        const formatted = message.format(params);
        expect(typeof formatted, `${locale}:${key}`).toBe('string');
        expect(formatted, `${locale}:${key}`).not.toMatch(/\{[^}]+\}/);
      }
      expect([...referenced].sort(), `${locale}:${id}`).toEqual(Object.keys(params).sort());
    }
  });

  it('synchronizes updated translations with English without embedded numbers, emoji or em dashes', () => {
    const en = catalogs['../i18n/locales/en.json']!;
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      for (const id of updatedHintIds) {
        for (const field of ['short', 'detail']) {
          const key = `hint.${id}.${field}`;
          expect(catalog[key], `${locale}:${key}`).not.toMatch(/[0-9\u2014]|\p{Extended_Pictographic}/u);
          if (locale === 'en') continue;
          expect(catalog[key], `${locale}:${key}`).not.toBe(en[key]);
          expect(sources[`../i18n/locales/sources/${locale}.json`]![key], `${locale}:${key}`).toBe(en[key]);
        }
      }
    }
  });
});
