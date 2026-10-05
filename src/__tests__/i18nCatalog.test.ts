import IntlMessageFormat from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, type LocaleCode } from '../../config/i18n';
import context from '../i18n/context.json';

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

function collectLiteralText(nodes: AstNode[]): string {
  return nodes.map((node) => [
    node.type === 0 ? node.value ?? '' : '',
    ...Object.values(node.options ?? {}).map((option) => collectLiteralText(option.value)),
  ].join('')).join('');
}

function emojiSet(text: string): Set<string> {
  return new Set(text.match(/\p{Extended_Pictographic}/gu) ?? []);
}

function astFor(message: string, locale: string): AstNode[] {
  return new IntlMessageFormat(message, locale).getAst() as AstNode[];
}

describe('localization catalogs', () => {
  it('a: every catalog message parses as ICU', () => {
    for (const [path, catalog] of Object.entries(catalogs)) {
      const locale = path.split('/').at(-1)!.replace('.json', '');
      for (const [key, message] of Object.entries(catalog)) {
        expect(() => new IntlMessageFormat(message, locale), `${path}:${key}`).not.toThrow();
      }
    }
  });

  it('b: every target catalog has the English key set', () => {
    for (const locale of targets) {
      expect(Object.keys(catalogs[`../i18n/locales/${locale}.json`]!).sort()).toEqual(Object.keys(en).sort());
    }
  });

  it('c: arguments and plural categories match for each locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      for (const [key, message] of Object.entries(en)) {
        const sourceAst = astFor(message, 'en');
        const targetAst = astFor(catalog[key]!, locale);
        expect([...collectArguments(targetAst)].sort(), `${locale}:${key}`).toEqual([...collectArguments(sourceAst)].sort());
        const checkPlural = (nodes: AstNode[]) => {
          for (const node of nodes) {
            if (node.pluralType) {
              const options = Object.keys(node.options ?? {});
              expect(options, `${locale}:${key} plural other`).toContain('other');
              const rules = new Intl.PluralRules(locale);
              for (let value = 0; value <= 999; value += 1) {
                const category = rules.select(value);
                expect(options, `${locale}:${key} plural ${category}`).toContain(category);
              }
            }
            for (const option of Object.values(node.options ?? {})) checkPlural(option.value);
          }
        };
        checkPlural(targetAst);
      }
    }
  });

  it('g: no catalog value contains an em dash', () => {
    for (const [path, catalog] of Object.entries(catalogs)) {
      for (const [key, message] of Object.entries(catalog)) {
        expect(message, `${path}:${key}`).not.toContain('\u2014');
      }
    }
  });

  it('h: context keys exist and max lengths have no arguments', () => {
    for (const [key, entry] of Object.entries(context as Record<string, MessageContext>)) {
      expect(en).toHaveProperty(key);
      for (const locale of SUPPORTED_LOCALES) {
        const message = catalogs[`../i18n/locales/${locale}.json`]![key]!;
        if (entry.maxLen !== undefined) {
          expect(message.length, `${locale}:${key}`).toBeLessThanOrEqual(entry.maxLen);
          expect(collectArguments(astFor(message, locale)).size, `${locale}:${key}`).toBe(0);
        }
      }
    }
  });

  it('i: source catalogs contain current English source text for every key', () => {
    for (const locale of targets) {
      const source = sources[`../i18n/locales/sources/${locale}.json`]!;
      expect(Object.keys(source).sort()).toEqual(Object.keys(en).sort());
      for (const [key, message] of Object.entries(en)) expect(source[key]).toBe(message);
    }
  });

  it('j: unchanged English text is explicitly approved in context', () => {
    for (const locale of targets) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      for (const [key, message] of Object.entries(en)) {
        if (catalog[key] === message && /[A-Za-z]/.test(collectLiteralText(astFor(message, 'en')))) {
          expect((context as Record<string, MessageContext>)[key]?.sameAsSource, `${locale}:${key}`).toContain(locale);
        }
      }
    }
  });

  it('k: every locale preserves the source emoji set', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      for (const [key, message] of Object.entries(en)) {
        expect(emojiSet(catalog[key]! ), `${locale}:${key}`).toEqual(emojiSet(message));
      }
    }
  });
});
