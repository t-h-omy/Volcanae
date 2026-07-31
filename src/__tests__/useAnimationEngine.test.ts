import { describe, expect, it } from 'vitest';
import { buildCaveSpecialistExclusionSet } from '../useAnimationEngine';
import { BuildingType } from '../types';
import type { Building, GameState } from '../types';

describe('buildCaveSpecialistExclusionSet', () => {
  it('excludes owned specialists and specialists currently offered in market slots', () => {
    const market = {
      id: 'm1',
      type: BuildingType.MARKET,
      marketSpecialistSlots: ['spec_03', null, 'spec_07'],
    } as Building;
    const nonMarket = {
      id: 'b2',
      type: BuildingType.MINE,
      marketSpecialistSlots: ['spec_09'],
    } as unknown as Building;

    const excluded = buildCaveSpecialistExclusionSet({
      globalSpecialistStorage: ['spec_01'],
      buildings: { [market.id]: market, [nonMarket.id]: nonMarket },
    } as Pick<GameState, 'globalSpecialistStorage' | 'buildings'>);

    expect(excluded.has('spec_01')).toBe(true);
    expect(excluded.has('spec_03')).toBe(true);
    expect(excluded.has('spec_07')).toBe(true);
    expect(excluded.has('spec_09')).toBe(false);
  });
});
