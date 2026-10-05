import IntlMessageFormat from 'intl-messageformat';
import {
  DEFAULT_LOCALE,
  I18N,
  PSEUDO_LOCALE,
  type LocaleCode,
} from '../../config/i18n';
import { getCatalog, type Catalog } from './catalogs';
import { useLocaleStore, type ActiveLocale } from './localeStore';
import { pseudoLocalize } from './pseudo';
import en from './locales/en.json';

export type TextKey = keyof typeof en;
export type TextParams = { [name: string]: string | number };
export type TextRef = { key: TextKey; params?: TextParams };

export function isTextRef(value: unknown): value is TextRef {
  return typeof value === 'object'
    && value !== null
    && 'key' in value
    && typeof value.key === 'string';
}

type CatalogGetter = (locale: LocaleCode) => Catalog | undefined;

const formatterCache = new Map<string, Map<string, IntlMessageFormat>>();
const messageCache = new Map<string, Map<string, string>>();
const warnedKeys = new Set<string>();

function getFormatter(locale: string, key: string, message: string): IntlMessageFormat {
  let localeCache = formatterCache.get(locale);
  let localeMessages = messageCache.get(locale);
  if (!localeCache) {
    localeCache = new Map();
    formatterCache.set(locale, localeCache);
  }
  if (!localeMessages) {
    localeMessages = new Map();
    messageCache.set(locale, localeMessages);
  }
  if (localeMessages.get(key) !== message) {
    localeCache.set(key, new IntlMessageFormat(message, locale));
    localeMessages.set(key, message);
  }
  return localeCache.get(key)!;
}

function warnFormatError(key: string, error: unknown): void {
  if (import.meta.env.DEV && !warnedKeys.has(key)) {
    warnedKeys.add(key);
    console.warn(`Unable to format localization key "${key}"`, error);
  }
}

export function formatMessage(
  locale: ActiveLocale,
  key: TextKey,
  params: TextParams | undefined,
  catalogFor: CatalogGetter,
): string {
  const sourceLocale = locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;
  const targetMessage = catalogFor(sourceLocale)?.[key];
  const englishMessage = catalogFor(DEFAULT_LOCALE)?.[key] ?? en[key];
  const format = (message: string, formatLocale: string) =>
    String(getFormatter(formatLocale, key, message).format(params ?? {}));
  let result: string;
  if (targetMessage !== undefined) {
    try {
      result = format(targetMessage, sourceLocale);
    } catch (error) {
      warnFormatError(key, error);
      if (sourceLocale === DEFAULT_LOCALE || englishMessage === undefined) {
        result = key;
      } else {
        try {
          result = format(englishMessage, DEFAULT_LOCALE);
        } catch (fallbackError) {
          warnFormatError(key, fallbackError);
          result = key;
        }
      }
    }
  } else if (englishMessage !== undefined) {
    try {
      result = format(englishMessage, DEFAULT_LOCALE);
    } catch (error) {
      warnFormatError(key, error);
      result = key;
    }
  } else {
    result = key;
  }
  return locale === PSEUDO_LOCALE ? pseudoLocalize(result) : result;
}

export function t(key: TextKey, params?: TextParams): string;
export function t(ref: TextRef): string;
export function t(keyOrRef: TextKey | TextRef, params?: TextParams): string {
  const ref = typeof keyOrRef === 'string' ? { key: keyOrRef, params } : keyOrRef;
  const locale = useLocaleStore.getState().locale;
  return formatMessage(locale, ref.key, ref.params, getCatalog);
}

function formatLocale(): string {
  const locale: ActiveLocale = useLocaleStore.getState().locale;
  return locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;
}

export function formatNumber(
  n: number,
  maxFractionDigits = I18N.DEFAULT_MAX_FRACTION_DIGITS,
): string {
  return new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: maxFractionDigits }).format(n);
}

export function formatSigned(
  n: number,
  maxFractionDigits = I18N.DEFAULT_MAX_FRACTION_DIGITS,
): string {
  return new Intl.NumberFormat(formatLocale(), {
    maximumFractionDigits: maxFractionDigits,
    signDisplay: 'exceptZero',
  }).format(n);
}

export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(formatLocale(), { type: 'conjunction' }).format(items);
}

export function formatRelativeTime(timestampMs: number, nowMs = Date.now()): string {
  const deltaSeconds = (timestampMs - nowMs) / I18N.MILLISECONDS_PER_SECOND;
  const absoluteSeconds = Math.abs(deltaSeconds);
  let unit: Intl.RelativeTimeFormatUnit;
  let divisor: number;
  if (absoluteSeconds < I18N.RELATIVE_TIME_MINUTE_SECONDS) {
    unit = 'second';
    divisor = 1;
  } else if (absoluteSeconds < I18N.RELATIVE_TIME_MINUTE_SECONDS ** 2) {
    unit = 'minute';
    divisor = I18N.RELATIVE_TIME_MINUTE_SECONDS;
  } else if (absoluteSeconds < I18N.RELATIVE_TIME_MINUTE_SECONDS ** 3) {
    unit = 'hour';
    divisor = I18N.RELATIVE_TIME_MINUTE_SECONDS ** 2;
  } else {
    unit = 'day';
    divisor = I18N.RELATIVE_TIME_MINUTE_SECONDS ** 3;
  }
  return new Intl.RelativeTimeFormat(formatLocale(), { numeric: 'auto', style: 'narrow' })
    .format(Math.round(deltaSeconds / divisor), unit);
}

export function formatKilobytes(bytes: number): string {
  const megabytes = bytes >= I18N.MEGABYTE_BYTES;
  const value = bytes / (megabytes ? I18N.MEGABYTE_BYTES : I18N.KILOBYTE_BYTES);
  return new Intl.NumberFormat(formatLocale(), {
    style: 'unit',
    unit: megabytes ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: I18N.DEFAULT_MAX_FRACTION_DIGITS,
  }).format(value);
}

export function toLocaleUpper(value: string): string {
  return value.toLocaleUpperCase(formatLocale());
}
