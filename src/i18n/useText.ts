import { useMemo } from 'react';
import {
  formatKilobytes,
  formatList,
  formatNumber,
  formatRelativeTime,
  formatSigned,
  t,
  toLocaleUpper,
} from './i18n';
import { useLocaleStore } from './localeStore';

export function useText() {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => ({
    locale,
    t,
    formatNumber,
    formatSigned,
    formatList,
    formatRelativeTime,
    formatKilobytes,
    toLocaleUpper,
  }), [locale]);
}
