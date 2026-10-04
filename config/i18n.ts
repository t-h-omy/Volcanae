export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'pt-BR'] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_ENDONYMS: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  'pt-BR': 'Português (Brasil)',
}

export const DEFAULT_LOCALE: LocaleCode = 'en'
