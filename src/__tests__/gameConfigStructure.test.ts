import { describe, expect, it } from 'vitest';
import { ABILITIES, AI_RECRUITMENT } from '../gameConfig';
import * as cfg from '../gameConfig';

describe('gameConfig structure', () => {
  it('exposes merged ABILITIES constants as numbers', () => {
    expect(typeof ABILITIES.TUNNEL_EMERGE_DAMAGE).toBe('number');
    expect(typeof ABILITIES.CLEAVE_DAMAGE_MULTIPLIER).toBe('number');
    expect(typeof ABILITIES.RELOAD_DEF_PENALTY_PCT).toBe('number');
    expect(typeof ABILITIES.GRAVESTONE_MAX_HP).toBe('number');
  });

  it('exposes merged AI recruitment constants as numbers', () => {
    expect(typeof AI_RECRUITMENT.BASE_SCORE_REAPER).toBe('number');
    expect(typeof AI_RECRUITMENT.RIFT_LORD_PENALTY_NO_PORTAL_USERS).toBe('number');
  });

  it('does not export deprecated counter scoring object or default export', () => {
    expect((cfg as Record<string, unknown>).COUNTER_UNIT_SCORING).toBeUndefined();
    expect((cfg as Record<string, unknown>).default).toBeUndefined();
  });
});
