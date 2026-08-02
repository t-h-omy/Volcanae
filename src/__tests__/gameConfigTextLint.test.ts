import { describe, expect, it } from 'vitest';
import {
  BUILDING_DEFINITIONS,
  SPECIALIST_DEFINITIONS,
  TAG_INFO,
  TECH_TREE,
  UNIT_DEFINITIONS,
} from '../gameConfig';

const EM_DASH = '—';
const SCANNED_KEYS = new Set(['name', 'description', 'label', 'desc']);

function assertNoEmDashInStringFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoEmDashInStringFields(item);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && SCANNED_KEYS.has(key)) {
      expect(child).not.toContain(EM_DASH);
      continue;
    }
    assertNoEmDashInStringFields(child);
  }
}

describe('gameConfig text lint', () => {
  it('contains no em dashes in name/label/description string fields', () => {
    assertNoEmDashInStringFields(UNIT_DEFINITIONS);
    assertNoEmDashInStringFields(BUILDING_DEFINITIONS);
    assertNoEmDashInStringFields(SPECIALIST_DEFINITIONS);
    assertNoEmDashInStringFields(TECH_TREE);
    assertNoEmDashInStringFields(TAG_INFO);
  });

  it('exposes exactly 25 specialists with unique names', () => {
    const specialistIds = Object.keys(SPECIALIST_DEFINITIONS);
    const specialistNames = specialistIds.map((id) => SPECIALIST_DEFINITIONS[id].name);

    expect(specialistIds).toHaveLength(25);
    expect(new Set(specialistNames).size).toBe(specialistNames.length);
  });
});
