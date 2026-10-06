import { describe, expect, it } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import MAIN_MENU_TSX from '../components/MainMenu.tsx?raw';

const options = HUD_TSX.slice(
  HUD_TSX.indexOf('function OptionsOverlay('),
  HUD_TSX.indexOf('function GameMenu('),
);
const menuOptions = MAIN_MENU_TSX.slice(
  MAIN_MENU_TSX.indexOf('function OptionsPanel('),
  MAIN_MENU_TSX.indexOf('// ============================================================================\n// MAIN MENU'),
);

describe('in-game language option UI contract', () => {
  it('shows release locale endonyms only when multiple locales are released', () => {
    expect(options).toContain('{RELEASE_LOCALES.length > 1 && (');
    expect(options).toContain('LOCALE_ENDONYMS[code]');
    expect(options).toContain("t('options.language')");
    expect(options).toContain('aria-pressed={locale === code}');
  });

  it('sets the selected locale without closing the options overlay', () => {
    expect(options).toMatch(/onClick=\{\(\) => void useLocaleStore\.getState\(\)\.setLocale\(code\)\}/);
  });

  it('offers the same in-place locale selector in main-menu Options', () => {
    expect(menuOptions).toContain('{RELEASE_LOCALES.length > 1 && (');
    expect(menuOptions).toContain('LOCALE_ENDONYMS[code]');
    expect(menuOptions).toContain("t('options.language')");
    expect(menuOptions).toContain('aria-pressed={locale === code}');
    expect(menuOptions).toMatch(/onClick=\{\(\) => void useLocaleStore\.getState\(\)\.setLocale\(code\)\}/);
  });
});
