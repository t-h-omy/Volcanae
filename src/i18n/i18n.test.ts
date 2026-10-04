import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from './localeStore'
import { t } from './i18n'

describe('i18n', () => {
  afterEach(() => setLocale('en'))

  it('returns translated messages for the active locale', () => {
    expect(t('options.language')).toBe('Language')
    setLocale('de')
    expect(t('options.language')).toBe('Sprache')
  })
})
