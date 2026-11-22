import { describe, expect, it } from 'vitest';
import { MAP } from '../../config/map';
import { TERRAIN_RENDER } from '../../config/terrain';
import { TileStatus, TileType, type Tile } from '../types';
import { encodeTerrainMap, TERRAIN_STATUS_INDEX } from '../terrain/terrainMapEncoding';

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
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
}

function channel(data: Uint8Array, x: number, y: number, index: number): number {
  return data[(y * MAP.GRID_WIDTH + x) * 4 + index];
}

describe('encodeTerrainMap', () => {
  it('encodes terrain levels and lava', () => {
    const grid = makeGrid();
    grid[0][0].terrainType = TileType.CANYON;
    grid[0][1].terrainType = TileType.WATER;
    grid[0][2].terrainType = TileType.FOREST;
    grid[0][3].isLava = true;
    const data = encodeTerrainMap(grid, 0, 0);

    expect([0, 1, 2, 3].map((x) => channel(data, x, 0, 0))).toEqual([1, 0, 2, 3]);
  });

  it('encodes status indices and clears status for lava', () => {
    const grid = makeGrid();
    const statuses = [TileStatus.FROZEN, TileStatus.BURNING, TileStatus.CORRUPTED, TileStatus.CRYSTALLINE];
    statuses.forEach((status, x) => { grid[0][x].status = status; });
    grid[1][0].isLava = true;
    grid[1][0].status = TileStatus.FROZEN;
    const data = encodeTerrainMap(grid, 0, 0);

    statuses.forEach((status, x) => {
      expect(channel(data, x, 0, 1)).toBe(TERRAIN_STATUS_INDEX[status]);
    });
    expect(channel(data, 0, 1, 1)).toBe(0);
  });

  it('encodes fog and preview heat levels derived from render config', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = false;
    for (let y = 10; y <= 12; y++) grid[y][0].isLavaPreview = true;
    grid[13][0].isLava = true;
    grid[14][0].isLavaPreview = true;
    const data = encodeTerrainMap(grid, 13, 3);
    const middle = Math.round(TERRAIN_RENDER.HEAT_LEVEL_MAX * (1 + TERRAIN_RENDER.PREVIEW_HEAT_MIN) / 2);
    const minimum = Math.round(TERRAIN_RENDER.HEAT_LEVEL_MAX * TERRAIN_RENDER.PREVIEW_HEAT_MIN);

    expect(channel(data, 0, 0, 2)).toBe(255);
    expect([10, 11, 12].map((y) => channel(data, 0, y, 1) >> 4)).toEqual([
      TERRAIN_RENDER.HEAT_LEVEL_MAX,
      middle,
      minimum,
    ]);
    expect(channel(data, 0, 14, 1) >> 4).toBe(0);
    expect(channel(data, 0, 1, 1) >> 4).toBe(0);
  });

  it('reuses an output buffer of the required size', () => {
    const grid = makeGrid();
    const out = new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT * 4);

    expect(encodeTerrainMap(grid, 0, 0, out)).toBe(out);
    expect(encodeTerrainMap(grid, 0, 0, new Uint8Array(1))).not.toHaveLength(1);
  });
});
