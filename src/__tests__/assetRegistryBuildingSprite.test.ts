import { describe, expect, it } from 'vitest';
import {
  BUILDING_SPRITE,
  CRYSTAL_CAVE_ACTIVE_SPRITE,
  CRYSTAL_CHAMBER_ACTIVE_SPRITE,
  ENEMY_BUILDING_SPRITE,
  PLAYER_BUILDING_SPRITE,
  RESOURCE_SPRITE,
  getBuildingSpritePath,
  getBridgeSprite,
} from '../assetRegistry';
import { BuildingType, Faction } from '../types';
import type { Building } from '../types';

function building(type: BuildingType, faction: Faction | null, fields: Partial<Building> = {}): Building {
  return { type, faction, ...fields } as Building;
}

describe('getBuildingSpritePath', () => {
  it('preserves bridge orientation and faction-specific overrides', () => {
    expect(getBuildingSpritePath(building(BuildingType.BRIDGE, Faction.PLAYER, { bridgeOrientation: 'EW' }))).toBe(getBridgeSprite('EW'));
    expect(getBuildingSpritePath(building(BuildingType.BRIDGE, Faction.ENEMY, { bridgeOrientation: 'NS' }))).toBe(getBridgeSprite('NS'));
    expect(getBuildingSpritePath(building(BuildingType.WATCHTOWER, Faction.PLAYER))).toBe(PLAYER_BUILDING_SPRITE[BuildingType.WATCHTOWER]);
    expect(getBuildingSpritePath(building(BuildingType.WATCHTOWER, Faction.ENEMY))).toBe(ENEMY_BUILDING_SPRITE[BuildingType.WATCHTOWER]);
  });

  it('preserves neutral resource and resonating building sprites', () => {
    expect(getBuildingSpritePath(building(BuildingType.MINE, null))).toBe(RESOURCE_SPRITE[BuildingType.MINE]);
    expect(getBuildingSpritePath(building(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, { resonanceTurnsRemaining: 1 }))).toBe(CRYSTAL_CHAMBER_ACTIVE_SPRITE);
    expect(getBuildingSpritePath(building(BuildingType.CRYSTAL_CAVE, Faction.PLAYER, { resonanceTurnsRemaining: 1 }))).toBe(CRYSTAL_CAVE_ACTIVE_SPRITE);
    expect(getBuildingSpritePath(building(BuildingType.CRYSTAL_CAVE, Faction.PLAYER, { resonanceTurnsRemaining: 0 }))).toBe(BUILDING_SPRITE[BuildingType.CRYSTAL_CAVE]);
  });
});
