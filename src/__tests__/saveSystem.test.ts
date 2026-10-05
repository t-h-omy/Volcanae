import { describe, expect, it } from 'vitest';
import { getNextDefaultSlotName } from '../saveSystem';
import { useLocaleStore } from '../i18n/localeStore';

describe('getNextDefaultSlotName', () => {
  it('starts at Campaign 1 when no saves exist', () => {
    expect(getNextDefaultSlotName([])).toBe('Campaign 1');
  });

  it('uses the localized prefix when finding the next slot name', async () => {
    try {
      await useLocaleStore.getState().setLocale('de');
      expect(getNextDefaultSlotName([])).toBe('Kampagne 1');
      expect(getNextDefaultSlotName([{ name: 'Kampagne 1' }])).toBe('Kampagne 2');
    } finally {
      await useLocaleStore.getState().setLocale('en');
    }
  });

  it('fills the lowest missing campaign number', () => {
    expect(getNextDefaultSlotName([
      { name: 'Campaign 1' },
      { name: 'Campaign 3' },
      { name: 'Campaign 4' },
    ])).toBe('Campaign 2');
  });

  it('ignores non-default slot names', () => {
    expect(getNextDefaultSlotName([
      { name: 'Ironman Run' },
      { name: 'Campaign 2' },
    ])).toBe('Campaign 1');
  });
});
