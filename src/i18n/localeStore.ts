import { create } from 'zustand';
import {
  DEFAULT_LOCALE,
  I18N,
  PSEUDO_LOCALE,
  RELEASE_LOCALES,
  SUPPORTED_LOCALES,
  type LocaleCode,
} from '../../config/i18n';
import { loadCatalog } from './catalogs';

export type ActiveLocale = LocaleCode | typeof PSEUDO_LOCALE;

interface LocaleState {
  locale: ActiveLocale;
  setLocale: (code: ActiveLocale) => Promise<void>;
}

function loadStoredLocale(): ActiveLocale | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const stored = localStorage.getItem(I18N.STORAGE_KEY);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (parsed === PSEUDO_LOCALE || (typeof parsed === 'string' && SUPPORTED_LOCALES.includes(parsed as LocaleCode))) {
      return parsed as ActiveLocale;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function persistLocale(code: ActiveLocale): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(I18N.STORAGE_KEY, JSON.stringify(code));
    }
  } catch {
    // ignore
  }
}

function syncDocumentLanguage(code: ActiveLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code === PSEUDO_LOCALE ? DEFAULT_LOCALE : code;
  }
}

export function detectLocale(languages: readonly string[], candidates: readonly LocaleCode[]): LocaleCode {
  const candidateByLower = new Map(candidates.map((candidate) => [candidate.toLowerCase(), candidate]));
  for (const language of languages) {
    const exact = candidateByLower.get(language.toLowerCase());
    if (exact) return exact;
  }
  for (const language of languages) {
    const base = language.split('-')[0]?.toLowerCase();
    const match = candidates.find((candidate) => candidate.split('-')[0]?.toLowerCase() === base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: DEFAULT_LOCALE,
  setLocale: async (code) => {
    if (code !== PSEUDO_LOCALE) await loadCatalog(code);
    set({ locale: code });
    persistLocale(code);
    syncDocumentLanguage(code);
  },
}));

export async function initLocale(): Promise<void> {
  const stored = loadStoredLocale();
  let locale: ActiveLocale;
  if (stored) {
    locale = stored;
  } else {
    const languages = typeof navigator !== 'undefined' ? navigator.languages : [];
    locale = detectLocale(languages, RELEASE_LOCALES);
  }
  await useLocaleStore.getState().setLocale(locale);
}
