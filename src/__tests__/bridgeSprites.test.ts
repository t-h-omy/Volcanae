import { describe, expect, it } from 'vitest';
import { BUILDING_SPRITE, getBridgeSprite } from '../assetRegistry';
import { BuildingType } from '../types';

describe('bridge sprites', () => {
  it('registers horizontal and vertical bridge artwork', () => {
    expect(BUILDING_SPRITE[BuildingType.BRIDGE]).toBe(getBridgeSprite('EW'));
    expect(getBridgeSprite('EW')).toContain('/sprites/buildings/bridge_horizonal_100px.png');
    expect(getBridgeSprite('NS')).toContain('/sprites/buildings/bridge_vertical_100px.png');
    expect(getBridgeSprite(undefined)).toBe(getBridgeSprite('EW'));
  });
});
