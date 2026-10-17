import IntlMessageFormat from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../../config/i18n';
import { MAGE, SPELL_DEFINITIONS } from '../gameConfig';
import { SpellId } from '../types';

type Catalog = Record<string, string>;
const catalogs = import.meta.glob<Catalog>('../i18n/locales/*.json', { eager: true, import: 'default' });
const sources = import.meta.glob<Catalog>('../i18n/locales/sources/*.json', { eager: true, import: 'default' });
const messages = {
  'reason.spell.stoneSkinMech': 'Mech units cannot receive Stone Skin',
  'spell.STONE_SKIN.desc': 'Grant a friendly non-Mech unit {stoneHp} Stone HP. Stone HP absorbs damage before normal HP. The unit cannot move while it has Stone HP.',
  'floater.roostLost': '{building} destroyed',
};

describe('QKP5 localized spell restrictions and roost loss', () => {
  it('synchronizes all three English messages and every translated source snapshot', () => {
    for (const [key, english] of Object.entries(messages)) {
      expect(catalogs['../i18n/locales/en.json'][key], key).toBe(english);
      for (const locale of SUPPORTED_LOCALES) {
        const message = catalogs[`../i18n/locales/${locale}.json`][key];
        expect(message, `${locale}:${key}`).toBeTruthy();
        expect(message, `${locale}:${key}`).not.toMatch(/\u2014|\p{Extended_Pictographic}|[0-9]/u);
        if (locale === 'en') continue;
        expect(message, `${locale}:${key}`).not.toBe(english);
        expect(sources[`../i18n/locales/sources/${locale}.json`][key], `${locale}:${key}`).toBe(english);
      }
    }
  });

  it('uses exact localized entity labels and formats every message with its unchanged parameters', () => {
    expect(SPELL_DEFINITIONS[SpellId.STONE_SKIN].textParams).toEqual({ stoneHp: MAGE.STONE_SKIN_HP });
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[`../i18n/locales/${locale}.json`];
      const restriction = catalog['reason.spell.stoneSkinMech'];
      const description = catalog['spell.STONE_SKIN.desc'];
      expect(restriction, locale).toContain(catalog['tag.MECH.label']);
      expect(restriction, locale).toContain(catalog['spell.STONE_SKIN.name']);
      expect(description, locale).toContain(catalog['tag.MECH.label']);
      expect(description, locale).toContain('{stoneHp}');
      expect(description, locale).toContain(catalog['stat.hp']);
      const stoneSkin = new IntlMessageFormat(description, locale).format({ stoneHp: MAGE.STONE_SKIN_HP });
      expect(stoneSkin, locale).not.toMatch(/[{}]/);
      expect(stoneSkin, locale).toContain(String(MAGE.STONE_SKIN_HP));
      const building = catalog['building.EMBERNEST.name'];
      const roostLost = new IntlMessageFormat(catalog['floater.roostLost'], locale).format({ building });
      expect(roostLost, locale).toContain(building);
      expect(roostLost, locale).not.toMatch(/[{}]/);
      expect(new IntlMessageFormat(restriction, locale).format(), locale).toBe(restriction);
    }
  });
});
