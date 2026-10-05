import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { useLocaleStore } from '../i18n/localeStore';
import {
  hintDetail,
  spellTargetHint,
  statAbbr,
  techEffectText,
  unitDesc,
  unitName,
} from '../i18n/entityText';
import { SpellId, UnitTag, UnitType } from '../types';

describe('entity text helpers', () => {
  it('returns localized names and formatted descriptions', async () => {
    await useLocaleStore.getState().setLocale('en');
    expect(unitName(UnitType.RIFT_LORD)).toBe('Rift Lord');
    expect(unitDesc(UnitType.ARCHER)).toContain(`${UNIT_DEFINITIONS.ARCHER.attackRange} tiles away`);
  });

  it('maps current and max HP to the same stat abbreviation', () => {
    expect(statAbbr('currentHp')).toBe(statAbbr('maxHp'));
  });

  it('localizes tech effects and their entity labels', () => {
    const message = techEffectText({
      type: 'GRANT_UNIT_TAG',
      unitType: UnitType.SWORDSMAN,
      tag: UnitTag.LEAVES_GRAVESTONE,
    });
    expect(message).toContain(unitName(UnitType.SWORDSMAN));
    expect(message).toContain('Gravestone');
  });

  it('formats specialist slot plurals and second spell target hints', async () => {
    await useLocaleStore.getState().setLocale('en');
    expect(techEffectText({ type: 'SPECIALIST_SLOT_MOD', value: 1 })).toBe('+1 specialist slot');
    expect(techEffectText({ type: 'SPECIALIST_SLOT_MOD', value: 2 })).toBe('+2 specialist slots');
    expect(spellTargetHint(SpellId.TRANSPOSE, true)).toContain('second');
  });

  it('resolves hint copy through the active locale', () => {
    expect(hintDetail('H13_BURNING')).toContain('immune');
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
