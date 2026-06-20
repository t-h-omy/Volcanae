import { afterEach, describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { ENEMY_WAVE_THEME, UNIT_DEFINITIONS } from '../gameConfig';
import { UnitType } from '../types';
import { assignPercents, generateRandomTheme, setWaveThemeRandomSource } from '../waveThemeSystem';

function makeState(ember: number): GameState {
  return { ember } as GameState;
}

function sequenceRng(values: number[]): () => number {
  let idx = 0;
  return () => {
    const value = values[idx];
    idx = (idx + 1) % values.length;
    return value;
  };
}

describe('waveThemeSystem', () => {
  afterEach(() => {
    setWaveThemeRandomSource();
  });

  it('assignPercents distributes exactly 100 with min/cap bounds', () => {
    setWaveThemeRandomSource(sequenceRng([0.93, 0.11, 0.42, 0.8]));
    const types = [UnitType.LAVA_GRUNT, UnitType.RIFT_LORD, UnitType.LAVA_RIDER];
    const entries = assignPercents(types, makeState(7));

    expect(entries.map((entry) => entry.type)).toEqual(types);
    expect(entries.reduce((sum, entry) => sum + entry.percent, 0)).toBe(100);
    for (const entry of entries) {
      const cap = UNIT_DEFINITIONS[entry.type].maxThemePercent ?? 100;
      expect(entry.percent).toBeGreaterThanOrEqual(ENEMY_WAVE_THEME.MIN_UNIT_PERCENT);
      expect(entry.percent).toBeLessThanOrEqual(cap);
    }
  });

  it('generateRandomTheme produces eligible, unique types that sum to 100', () => {
    setWaveThemeRandomSource(sequenceRng([0.99, 0.13, 0.72, 0.44, 0.24, 0.88, 0.31, 0.57, 0.66]));
    const state = makeState(7);
    const theme = generateRandomTheme(state);

    expect(theme.isReadPlayer).toBe(false);
    expect(theme.entries.length).toBeGreaterThanOrEqual(ENEMY_WAVE_THEME.MIN_UNIT_TYPES);
    expect(theme.entries.length).toBeLessThanOrEqual(ENEMY_WAVE_THEME.MAX_UNIT_TYPES);
    expect(new Set(theme.entries.map((entry) => entry.type)).size).toBe(theme.entries.length);
    expect(theme.entries.reduce((sum, entry) => sum + entry.percent, 0)).toBe(100);
    for (const entry of theme.entries) {
      const def = UNIT_DEFINITIONS[entry.type];
      expect(def.themeEligible).not.toBe(false);
      expect(def.enemyUnlockEmber).toBeLessThanOrEqual(state.ember);
    }
  });
});
