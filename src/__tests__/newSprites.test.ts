import { describe, expect, it } from 'vitest';
import { MAGE_PORTAL_SPRITE, UNIT_SPRITE } from '../assetRegistry';
import { UnitType } from '../types';

describe('new sprite assets', () => {
  it('registers the Ghoul and Corrupted Qork artwork', () => {
    expect(UNIT_SPRITE[UnitType.GHOUL]).toContain('/sprites/units/ghoul-100px.png');
    expect(UNIT_SPRITE[UnitType.CORRUPTED_QORK]).toContain('/sprites/units/qork_100px.png');
  });

  it('registers the player Mage Portal artwork', () => {
    expect(MAGE_PORTAL_SPRITE).toContain('/sprites/units/portal_player_100px.png');
  });
});
