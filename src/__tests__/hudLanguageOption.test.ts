import { describe, expect, it } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';

const options = HUD_TSX.slice(
  HUD_TSX.indexOf('function OptionsOverlay('),
  HUD_TSX.indexOf('function GameMenu('),
);

describe('in-game language option UI contract', () => {
  it('shows release locale endonyms only when multiple locales are released', () => {
    expect(options).toContain('{RELEASE_LOCALES.length > 1 && (');
    expect(options).toContain('LOCALE_ENDONYMS[code]');
    expect(options).toContain("t('options.language')");
    expect(options).toContain('aria-pressed={locale === code}');
  });

  it('sets the selected locale without closing the options overlay', () => {
    expect(options).toMatch(/onClick=\{\(\) => void setLocale\(code\)\}/);
  });
});
