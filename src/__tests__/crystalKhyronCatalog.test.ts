import IntlMessageFormat from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../../config/i18n';
import { TAG_INFO, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { UnitTag, UnitType } from '../types';

type Catalog = Record<string, string>;

const catalogs = import.meta.glob<Catalog>('../i18n/locales/*.json', { eager: true, import: 'default' });
const sources = import.meta.glob<Catalog>('../i18n/locales/sources/*.json', { eager: true, import: 'default' });
const englishMessages = {
  'unit.CRYSTAL_KHYRON.desc': 'Resonates whenever your Crystal Chambers resonate. While resonating it heals {healAmount} HP each turn, and its first enemy kill or destroyed enemy building earns a Level Up that copies useful tags from the defeated enemy. Up to level {maxLevel}.',
  'tech.CRYSTAL_KHYRON.desc': 'Unlocks the Crystal Khyron, a Mech you recruit from a resonating Crystal Chamber for {crystalCost, plural, one {# Arcane Crystal} other {# Arcane Crystals}}. It resonates with your Chambers and levels up when killing while resonating.',
  'tag.RESONANCE.desc': "Active while your Crystal Chambers resonate. Heals {healAmount} HP at the start of each turn. The first enemy kill or destroyed enemy building in each Resonance earns a Level Up, up to level {maxLevel}. Tap Level Up to apply it and copy the defeated enemy's transferable tags: Cleave, Pierce, Rage, Alert, Ironblood, Block, Puncture, Burn, Build & Capture, Ranged. Ranged also raises attack range to the defeated enemy's range.",
  'hud.unitPanel.resonating': 'Resonating: {turns, plural, one {# turn} other {# turns}} remaining',
};
const transferableTags = [
  'CLEAVE', 'PIERCE', 'RAGE', 'ALERT', 'IRONBLOOD', 'BLOCK', 'PUNCTURE', 'BURN', 'BUILDANDCAPTURE', 'RANGED',
];

describe('Crystal Khyron localization', () => {
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
      }
    }
  });

  it('uses localized HP, exact transferable tag labels, and parameterized healing and level limits', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      for (const key of ['unit.CRYSTAL_KHYRON.desc', 'tag.RESONANCE.desc']) {
        const message = catalog[key]!;
        expect(message, `${locale}:${key}`).toContain(`{healAmount} ${catalog['stat.hp']}`);
        expect(message, `${locale}:${key}`).toContain('{maxLevel}');
        expect(message, `${locale}:${key}`).not.toMatch(/[0-9]|\u2014|\p{Extended_Pictographic}/u);
      }
      const resonance = catalog['tag.RESONANCE.desc']!;
      for (const tag of transferableTags) {
        expect(resonance, `${locale}:${tag}`).toContain(catalog[`tag.${tag}.label`]);
      }
      expect(resonance, locale).not.toMatch(/cannot stack|nicht stapelbar|ne se cumulent pas|no se acumulan|non si accumulano|não se acumulam/);
      expect(catalog['tech.CRYSTAL_KHYRON.desc'], locale).toContain(catalog['tag.MECH.label']);
    }
  });

  it('formats descriptions with configured parameters and shares building resonance countdown plurals', () => {
    const descriptions = [
      ['unit.CRYSTAL_KHYRON.desc', UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].textParams],
      ['tag.RESONANCE.desc', TAG_INFO[UnitTag.RESONANCE].textParams],
      ['tech.CRYSTAL_KHYRON.desc', TECH_TREE.find(({ id }) => id === 'CRYSTAL_KHYRON')!.textParams],
    ] as const;
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`]!;
      for (const [key, params] of descriptions) {
        const formatted = new IntlMessageFormat(catalog[key], locale).format(params);
        expect(formatted, `${locale}:${key}`).not.toMatch(/[{}]/);
      }
      const unit = catalog['hud.unitPanel.resonating']!;
      const building = catalog['hud.buildingPanel.resonating']!;
      expect(unit, locale).toBe(building);
      for (const turns of [0, 1, 2]) {
        const formatted = new IntlMessageFormat(unit, locale).format({ turns });
        expect(formatted, `${locale}:${turns}`).toBe(
          new IntlMessageFormat(building, locale).format({ turns }),
        );
        expect(formatted, `${locale}:${turns}`).not.toMatch(/[{}]/);
        expect(formatted, `${locale}:${turns}`).toContain(String(turns));
      }
    }
  });
});
