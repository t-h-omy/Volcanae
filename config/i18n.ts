export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'pt-BR'] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const RELEASE_LOCALES: readonly LocaleCode[] = ['en', 'de'];
export const DEFAULT_LOCALE: LocaleCode = 'en';
export const PSEUDO_LOCALE = 'en-XA' as const;

export const LOCALE_ENDONYMS: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  'pt-BR': 'Português (Brasil)',
};

export const I18N = {
  STORAGE_KEY: 'volcanae_locale',
  PSEUDO_EXPANSION_RATIO: 0.3,
  PSEUDO_OPEN: '[',
  PSEUDO_CLOSE: ']',
  RELATIVE_TIME_MINUTE_SECONDS: 60,
  MILLISECONDS_PER_SECOND: 1000,
  KILOBYTE_BYTES: 1024,
  MEGABYTE_BYTES: 1024 * 1024,
  DEFAULT_MAX_FRACTION_DIGITS: 1,
} as const;
