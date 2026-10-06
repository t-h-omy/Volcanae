import { describe, expect, it } from 'vitest';
import { applyReviewedRows, parseCsv, reviewHeader, stringifyCsv } from '../../scripts/lib/reviewCsv.mjs';

describe('translation review CSV', () => {
  it('parses BOM, quoted commas, escaped quotes, and embedded newlines', () => {
    const csv = '\uFEFFkey,en\r\nhello,"A, ""brave"" world\nagain"\r\n';
    expect(parseCsv(csv)).toEqual([
      ['key', 'en'],
      ['hello', 'A, "brave" world\nagain'],
    ]);
  });

  it('writes RFC 4180 escaped cells and parses the exported representation', () => {
    const csv = stringifyCsv([['key', 'en'], ['welcome', 'Hello, "world"\nagain']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parseCsv(csv)).toEqual([
      ['key', 'en'],
      ['welcome', 'Hello, "world"\nagain'],
    ]);
  });

  it('applies valid reviewed rows and synchronizes the English source', () => {
    const header = reviewHeader('de');
    const result = applyReviewedRows({
      rows: [header, ['menu.greeting', 'menu', '', '', 'Hello {name}', 'Hallo {name}', 'Guten Tag {name}']],
      code: 'de',
      catalog: { 'menu.greeting': 'Hallo {name}' },
      source: { 'menu.greeting': 'Hello {name}' },
      en: { 'menu.greeting': 'Hello {name}' },
      context: {},
    });
    expect(result.catalog['menu.greeting']).toBe('Guten Tag {name}');
    expect(result.source['menu.greeting']).toBe('Hello {name}');
    expect(result.changedKeys).toEqual(['menu.greeting']);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid ICU arguments and reports the row key and reason', () => {
    const header = reviewHeader('de');
    const result = applyReviewedRows({
      rows: [header, ['menu.greeting', 'menu', '', '', 'Hello {name}', 'Hallo {name}', 'Guten Tag {person}']],
      code: 'de',
      catalog: { 'menu.greeting': 'Hallo {name}' },
      source: { 'menu.greeting': 'Hello {name}' },
      en: { 'menu.greeting': 'Hello {name}' },
      context: {},
    });
    expect(result.catalog['menu.greeting']).toBe('Hallo {name}');
    expect(result.changedKeys).toEqual([]);
    expect(result.errors).toEqual([{
      key: 'menu.greeting',
      reason: 'ICU arguments differ (expected name)',
    }]);
  });
});
