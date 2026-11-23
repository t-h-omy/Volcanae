import { describe, expect, it } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { MAP } from '../../config/map';
import { TERRAIN_RESOURCE_SPRITE, TILE_SPRITE } from '../assetRegistry';
import { collectLavaVictims, getLavaAdvanceHoldMs } from '../lavaPresentation';
import { BuildingType, Faction, TileType } from '../types';
import type { GameState, Tile } from '../types';
import type { GameEvent } from '../gameEvents';

function fixture(): GameState {
  const grid: Tile[][] = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y },
      isRevealed: true,
      buildingId: null,
      unitId: null,
      isLava: false,
      isLavaPreview: false,
      isRuin: false,
      isStrongholdRuin: false,
      terrainType: TileType.PLAINS,
    })),
  );
  grid[4][0].unitId = 'visible';
  grid[4][1].unitId = 'underground';
  grid[4][2].unitId = 'emerging';
  grid[4][3].terrainType = TileType.FOREST;
  grid[4][4].buildingId = 'cave';
  grid[4][5].isRuin = true;
  grid[4][6].isStrongholdRuin = true;
  grid[4][7].isRevealed = false;
  grid[4][8].isRevealed = false;
  grid[4][8].unitId = 'hidden';
  grid[3][0].unitId = 'other-row';
  return {
    grid,
    units: {
      visible: { id: 'visible', position: { x: 0, y: 4 } },
      underground: { id: 'underground', position: { x: 1, y: 4 }, tunnelState: 'UNDERGROUND' },
      emerging: { id: 'emerging', position: { x: 2, y: 4 }, tunnelState: 'EMERGING' },
      hidden: { id: 'hidden', position: { x: 8, y: 4 } },
      'other-row': { id: 'other-row', position: { x: 0, y: 3 } },
    },
    buildings: {
      cave: {
        id: 'cave', type: BuildingType.CRYSTAL_CAVE, faction: Faction.PLAYER,
        position: { x: 4, y: 4 }, resonanceTurnsRemaining: 2,
      },
    },
  } as unknown as GameState;
}

const event: Extract<GameEvent, { type: 'LAVA_ADVANCE' }> = {
  type: 'LAVA_ADVANCE',
  newLavaRow: 4,
  destroyedUnitIds: ['visible', 'underground', 'emerging', 'missing', 'hidden', 'other-row'],
  destroyedBuildingIds: ['cave'],
};

describe('collectLavaVictims', () => {
  it('collects revealed row units and object silhouettes, excluding tunnel and hidden victims', () => {
    const victims = collectLavaVictims(fixture(), event);
    expect(victims.unitIds).toEqual(['visible']);
    expect(victims.objects).toEqual([
      { x: 3, y: 4, maskSrc: TERRAIN_RESOURCE_SPRITE[TileType.FOREST] },
      { x: 4, y: 4, maskSrc: expect.stringContaining('/sprites/buildings/crystal_cave_active_100px.png') },
      { x: 5, y: 4, maskSrc: TILE_SPRITE.ruin },
      { x: 6, y: 4, maskSrc: TILE_SPRITE.strongholdRuin },
    ]);
    expect(victims.tiles).toEqual([
      { x: 0, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
    ]);
  });

  it('calculates the flow and engulf hold windows', () => {
    const victims = Math.max(ANIMATION.LAVA_ENGULF_MS, ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
    expect(getLavaAdvanceHoldMs({ reducedMotion: false, hasVictims: true })).toBe(ANIMATION.LAVA_FLOW_MS + victims);
    expect(getLavaAdvanceHoldMs({ reducedMotion: true, hasVictims: true })).toBe(victims);
    expect(getLavaAdvanceHoldMs({ reducedMotion: false, hasVictims: false })).toBe(ANIMATION.LAVA_FLOW_MS);
  });
});
