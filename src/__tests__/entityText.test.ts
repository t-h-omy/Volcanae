import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { useLocaleStore } from '../i18n/localeStore';
import { statAbbr, unitDesc, unitName } from '../i18n/entityText';
import { UnitType } from '../types';

describe('entity text helpers', () => {
  it('returns localized names and formatted descriptions', async () => {
    await useLocaleStore.getState().setLocale('en');
    expect(unitName(UnitType.RIFT_LORD)).toBe('Rift Lord');
    expect(unitDesc(UnitType.ARCHER)).toContain(`${UNIT_DEFINITIONS.ARCHER.attackRange} tiles away`);
  });

  it('maps current and max HP to the same stat abbreviation', () => {
    expect(statAbbr('currentHp')).toBe(statAbbr('maxHp'));
  });

  it('uses the active locale for names', async () => {
    const english = unitName(UnitType.SPEARMAN);
    try {
      await useLocaleStore.getState().setLocale('de');
      expect(unitName(UnitType.SPEARMAN)).not.toBe(english);
    } finally {
      await useLocaleStore.getState().setLocale('en');
    }
  });
});
