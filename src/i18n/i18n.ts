import { IntlMessageFormat } from 'intl-messageformat'
import { catalogs, type MessageKey } from './catalogs'
import { getLocale } from './localeStore'

const messageCache = new Map<string, IntlMessageFormat>()

export function t(key: MessageKey, params?: Record<string, string | number | Date>): string {
  const locale = getLocale()
  const message = catalogs[locale][key] ?? catalogs.en[key]
  const cacheKey = `${locale}:${key}`
  let formatter = messageCache.get(cacheKey)
  if (!formatter) {
    formatter = new IntlMessageFormat(message, locale)
    messageCache.set(cacheKey, formatter)
  }
  const result = formatter.format(params)
  return Array.isArray(result) ? result.map(String).join('') : String(result)
}
