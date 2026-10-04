import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '../../config/i18n'
import context from './context.json'
import { catalogs } from './catalogs'
import en from './locales/en.json'
import deSource from './locales/sources/de.json'
import esSource from './locales/sources/es.json'
import frSource from './locales/sources/fr.json'
import itSource from './locales/sources/it.json'
import ptBRSource from './locales/sources/pt-BR.json'

const sources = {
  de: deSource,
  fr: frSource,
  es: esSource,
  it: itSource,
  'pt-BR': ptBRSource,
}
const emDash = String.fromCharCode(0x2014)

describe('i18n catalogs', () => {
  it('provides the same keys in every supported locale', () => {
    const keys = Object.keys(en).sort()
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(keys)
      for (const value of Object.values(catalogs[locale])) {
        expect(value).not.toContain(emDash)
      }
    }
  })

  it('tracks source text and context for every message', () => {
    const keys = Object.keys(en)
    for (const [locale, source] of Object.entries(sources)) {
      expect(Object.keys(source).sort()).toEqual([...keys].sort())
      for (const key of keys) expect(source[key as keyof typeof source]).toBe(en[key as keyof typeof en])
      expect(locale).toBeTruthy()
    }
    expect(Object.keys(context).sort()).toEqual(keys.sort())
  })
})
