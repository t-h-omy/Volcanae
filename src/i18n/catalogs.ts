import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import ptBR from './locales/pt-BR.json'
import type { LocaleCode } from '../../config/i18n'

export type Catalog = Record<keyof typeof en, string>

export const catalogs: Record<LocaleCode, Catalog> = {
  en,
  de,
  fr,
  es,
  it,
  'pt-BR': ptBR,
}

export type MessageKey = keyof typeof en
