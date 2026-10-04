import { useLocaleStore } from './localeStore'
import { t } from './i18n'

export function useText() {
  useLocaleStore((state) => state.locale)
  return { t }
}
