import { describe, expect, it } from 'vitest';
import { ABILITIES, AI_RECRUITMENT } from '../gameConfig';
import * as cfg from '../gameConfig';
import * as mapCfg from '../../config/map';
import * as tileStatusCfg from '../../config/tileStatus';
import * as economyCfg from '../../config/economy';
import * as progressionCfg from '../../config/progression';
import * as magicCfg from '../../config/magic';
import * as abilitiesCfg from '../../config/abilities';
import * as unitsCfg from '../../config/units';
import * as buildingsCfg from '../../config/buildings';
import * as tagInfoCfg from '../../config/tagInfo';
import * as techCfg from '../../config/tech';
import * as specialistsCfg from '../../config/specialists';
import * as enemyAiCfg from '../../config/enemyAi';
import * as saveCfg from '../../config/save';

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

  it('barrel re-exports every key from every config module', () => {
    const modules = [
      mapCfg,
      tileStatusCfg,
      economyCfg,
      progressionCfg,
      magicCfg,
      abilitiesCfg,
      unitsCfg,
      buildingsCfg,
      tagInfoCfg,
      techCfg,
      specialistsCfg,
      enemyAiCfg,
      saveCfg,
    ];
    for (const m of modules) {
      expect(Object.keys(m).every(k => k in cfg)).toBe(true);
    }
  });
});
