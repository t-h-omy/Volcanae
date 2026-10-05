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
import {
  buildingDesc,
  buildingName,
  difficultyLabel,
  populationName,
  resourceName,
  statAbbr,
  tagDesc,
  tagLabel,
  terrainTagDesc,
  terrainTagLabel,
  unitDesc,
  unitName,
} from './entityText';

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
    unitName,
    unitDesc,
    buildingName,
    buildingDesc,
    tagLabel,
    tagDesc,
    terrainTagLabel,
    terrainTagDesc,
    resourceName,
    populationName,
    difficultyLabel,
    statAbbr,
  }), [locale]);
}
