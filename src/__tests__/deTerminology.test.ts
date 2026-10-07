import { describe, expect, it } from 'vitest';
import de from '../i18n/locales/de.json';
import en from '../i18n/locales/en.json';

const forbiddenTerms = [
  /\bTP\b/,
  /\bANG\b/,
  /\bVER\b/,
  /\bTags?\b/,
  /Lavavorderfront/,
  /Belagerungs(gerät|maschine|einheit)/,
  /\bLv\./,
  /\bXP\b/,
  /Erste Hilfe/,
  /Brandmarkiert/,
  /Sanktuarium/,
  /Heiligtum/,
  /\b(Zuges|Zugs|Züge)\b/,
];

describe('German terminology', () => {
  it('does not contain rejected terminology', () => {
    for (const [key, value] of Object.entries(de)) {
      for (const pattern of forbiddenTerms) {
        expect(value, `${key}: ${value}`).not.toMatch(pattern);
      }
    }
  });

  it('uses the approved siege unit and building name', () => {
    expect(de['unit.SIEGE.name']).toBe('Katapult');
    expect(de['building.INFERNALSANCTUM.name']).toBe(en['building.INFERNALSANCTUM.name']);
  });
});
