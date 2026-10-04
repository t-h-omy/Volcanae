import { create } from 'zustand'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocaleCode } from '../../config/i18n'

const STORAGE_KEY = 'volcanae_locale'

function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as LocaleCode)
}

function loadLocale(): LocaleCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLocaleCode(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

const initialLocale = loadLocale()
if (typeof document !== 'undefined') document.documentElement.lang = initialLocale

interface LocaleState {
  locale: LocaleCode
  setLocale: (locale: LocaleCode) => void
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    set({ locale })
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Ignore unavailable storage.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = locale
  },
}))

export function getLocale(): LocaleCode {
  return useLocaleStore.getState().locale
}

export function setLocale(locale: LocaleCode): void {
  useLocaleStore.getState().setLocale(locale)
}
