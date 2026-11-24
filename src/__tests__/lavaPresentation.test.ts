import { describe, expect, it } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { MAP } from '../../config/map';
import { TERRAIN_RESOURCE_SPRITE, TILE_SPRITE } from '../assetRegistry';
import {
  collectLavaVictims,
  getChamberHealingFocus,
  getLavaAdvanceHoldMs,
  shouldHoldOverviewAfterLava,
} from '../lavaPresentation';
import { BuildingType, Faction, TileType } from '../types';
import type { GameState, Position, Tile } from '../types';
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
  grid[4][6].buildingId = 'missing-sprite';
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
      'missing-sprite': {
        id: 'missing-sprite', type: 'UNKNOWN' as BuildingType, faction: Faction.PLAYER,
        position: { x: 9, y: 4 },
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

function resonanceEvent(): Extract<GameEvent, { type: 'RESONANCE_TRIGGERED' }> {
  return {
    type: 'RESONANCE_TRIGGERED',
    sources: [],
    reachedNodes: [],
    resonanceDuration: 0,
  };
}

describe('collectLavaVictims', () => {
  it('collects revealed row units and object silhouettes, excluding tunnel and hidden victims', () => {
    const victims = collectLavaVictims(fixture(), event);
    expect(victims.unitIds).toEqual(['visible']);
    expect(victims.objects).toEqual([
      { x: 3, y: 4, maskSrc: TERRAIN_RESOURCE_SPRITE[TileType.FOREST] },
      { x: 4, y: 4, maskSrc: expect.stringContaining('/sprites/buildings/crystal_cave_active_100px.png') },
      { x: 5, y: 4, maskSrc: TILE_SPRITE.ruin },
      { x: 6, y: 4, maskSrc: '' },
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

describe('lava advance camera helpers', () => {
  it('holds the overview for the next visible resonance', () => {
    const resonance = resonanceEvent();
    const visible = () => true;

    expect(shouldHoldOverviewAfterLava([resonance], visible)).toBe(true);
    expect(shouldHoldOverviewAfterLava([
      { type: 'PORTAL_CLOSED', portalId: 'portal', entrancePos: { x: 0, y: 0 }, exitPos: { x: 1, y: 0 } },
      resonance,
    ], visible)).toBe(true);
  });

  it('does not hold the overview when the next event is not a visible resonance', () => {
    const resonance = resonanceEvent();
    const visible = () => true;

    expect(shouldHoldOverviewAfterLava([], visible)).toBe(false);
    expect(shouldHoldOverviewAfterLava([
      { type: 'UNIT_HEAL', unitId: 'unit', position: { x: 0, y: 0 }, amount: 1 },
      resonance,
    ], visible)).toBe(false);
    expect(shouldHoldOverviewAfterLava([resonance], () => false)).toBe(false);
  });
});

describe('Chamber Healing camera focus', () => {
  const fallback: Position = { x: 9, y: 8 };
  const event: Extract<GameEvent, { type: 'CHAMBER_HEALING' }> = {
    type: 'CHAMBER_HEALING',
    chambers: [
      { buildingId: 'hidden-chamber', position: { x: 0, y: 0 } },
      { buildingId: 'revealed-chamber', position: { x: 4, y: 4 } },
    ],
    heals: [
      { unitId: 'first', position: { x: 1, y: 2 }, amount: 1 },
      { unitId: 'second', position: { x: 3, y: 4 }, amount: 1 },
      { unitId: 'hidden', position: { x: 20, y: 20 }, amount: 1 },
    ],
  };

  it('rounds the centroid of revealed heals', () => {
    expect(getChamberHealingFocus(event, ({ x, y }) => x !== 20 && y !== 20, fallback))
      .toEqual({ x: 2, y: 3 });
  });

  it('uses the single revealed heal position', () => {
    expect(getChamberHealingFocus(
      { ...event, heals: [event.heals[1]] },
      ({ x, y }) => x === 3 && y === 4,
      fallback,
    )).toEqual({ x: 3, y: 4 });
  });

  it('falls back to the first revealed chamber when no heal is revealed', () => {
    expect(getChamberHealingFocus(
      { ...event, heals: [] },
      ({ x, y }) => x === 4 && y === 4,
      fallback,
    )).toEqual({ x: 4, y: 4 });
  });

  it('uses the current camera target when nothing is revealed', () => {
    expect(getChamberHealingFocus(event, () => false, fallback)).toBe(fallback);
  });
});
