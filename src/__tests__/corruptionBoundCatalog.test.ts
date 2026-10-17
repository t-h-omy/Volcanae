import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../../config/i18n';

type Catalog = Record<string, string>;

const catalogs = import.meta.glob<Catalog>('../i18n/locales/*.json', { eager: true, import: 'default' });
const sources = import.meta.glob<Catalog>('../i18n/locales/sources/*.json', { eager: true, import: 'default' });
const englishMessages = {
  'tag.CORRUPTION_BOUND.label': 'Corruption-Bound',
  'tag.CORRUPTION_BOUND.desc': 'Loses {hpLoss} HP at the end of its turn when not standing on a corrupted tile.',
  'unit.CORRUPTED_QORK.desc': 'A ranged creature summoned from a corrupted tile. It remains leashed to its Mage until it defects. It is Corruption-Bound and withers away from corrupted tiles. On death it explodes, dealing {explosionDamage} damage to all adjacent units, and corrupts its tile when the terrain allows.',
};

describe('Corruption-Bound localization', () => {
  it('keeps the requested English messages and every translated source snapshot synchronized', () => {
    const en = catalogs['../i18n/locales/en.json']!;
    for (const [key, message] of Object.entries(englishMessages)) {
      expect(en[key], key).toBe(message);
      for (const locale of SUPPORTED_LOCALES.filter((code) => code !== 'en')) {
        const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
        const source = sources[`../i18n/locales/sources/${locale}.json`]!;
        expect(source[key], `${locale}:${key}`).toBe(message);
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
        expect(catalog[key], `${locale}:${key}`).not.toBe(message);
        expect(catalog[key], `${locale}:${key}`).not.toContain('Corruption-Bound');
      }
    }
  });

  it('uses localized health labels and moves the loss parameter out of the Qork description', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      const tagDescription = catalog['tag.CORRUPTION_BOUND.desc']!;
      const qorkDescription = catalog['unit.CORRUPTED_QORK.desc']!;
      expect(tagDescription, locale).toContain(`{hpLoss} ${catalog['stat.hp']}`);
      expect(qorkDescription, locale).not.toContain('{hpLoss}');
      expect(qorkDescription, locale).toContain('{explosionDamage}');
      expect(qorkDescription, locale).toContain(catalog['tag.CORRUPTION_BOUND.label']);
    }
  });
});
