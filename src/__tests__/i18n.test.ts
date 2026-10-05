import { afterEach, describe, expect, it } from 'vitest';
import { type LocaleCode } from '../../config/i18n';
import { formatMessage, formatList, formatNumber, formatSigned, type TextKey } from '../i18n/i18n';
import { detectLocale, useLocaleStore } from '../i18n/localeStore';
import { pseudoLocalize } from '../i18n/pseudo';
import type { Catalog } from '../i18n/catalogs';

const asKey = (key: string) => key as TextKey;

afterEach(async () => {
  await useLocaleStore.getState().setLocale('en');
});

describe('localization runtime', () => {
  it('formats interpolation and plural messages', () => {
    const catalog: Catalog = {
      'test.interpolation': 'Hello, {name}!',
      'test.plural': '{count, plural, one {# turn} other {# turns}}',
    };
    const getCatalog = () => catalog;
    expect(formatMessage('en', asKey('test.interpolation'), { name: 'Ada' }, getCatalog)).toBe('Hello, Ada!');
    expect(formatMessage('en', asKey('test.plural'), { count: 1 }, getCatalog)).toBe('1 turn');
    expect(formatMessage('en', asKey('test.plural'), { count: 3 }, getCatalog)).toBe('3 turns');
  });

  it('uses target messages and falls back to English for missing keys', () => {
    const catalogs: Record<string, Catalog> = {
      en: { 'test.target': 'English text', 'test.fallback': 'Fallback {name}' },
      fr: { 'test.target': 'Texte français' },
    };
    const getCatalog = (locale: LocaleCode) => catalogs[locale];
    expect(formatMessage('fr', asKey('test.target'), undefined, getCatalog)).toBe('Texte français');
    expect(formatMessage('fr', asKey('test.fallback'), { name: 'Ada' }, getCatalog)).toBe('Fallback Ada');
  });

  it('falls back to the key when target and English formatting fail', () => {
    const catalogs: Record<string, Catalog> = {
      en: { 'test.required': 'Required {name}' },
      de: { 'test.required': 'Benötigt {name}' },
    };
    expect(formatMessage('de', asKey('test.required'), undefined, (locale) => catalogs[locale])).toBe('test.required');
  });

  it('pseudo-localizes with brackets, padding, and unchanged digits', () => {
    const result = pseudoLocalize('A1 b');
    expect(result).toBe('[À1 ƀ~~]');
    expect(result).toHaveLength('A1 b'.length + 4);
  });

  it('detects exact and base language matches without returning unsupported locales', () => {
    expect(detectLocale(['de-AT', 'en'], ['en', 'de'])).toBe('de');
    expect(detectLocale(['pt-PT'], ['en', 'pt-BR'])).toBe('pt-BR');
    expect(detectLocale(['ja'], ['en'])).toBe('en');
    expect(detectLocale([], ['en', 'de'])).toBe('en');
    expect(detectLocale(['ja-JP'], ['en', 'de'])).not.toBe('ja-JP');
  });

  it('formats numbers and lists using the selected locale', async () => {
    await useLocaleStore.getState().setLocale('de');
    expect(formatNumber(1.5)).toBe('1,5');
    expect(formatSigned(2)).toBe('+2');
    expect(formatSigned(0)).toBe('0');
    expect(formatList(['a', 'b'])).toBe('a und b');
  });
});
