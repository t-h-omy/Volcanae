import { MAP } from '../../config/map';
import { TileStatus, TileType, type Tile } from '../types';
import { TERRAIN_RENDER } from '../../config/terrain';

export const TERRAIN_STATUS_INDEX: Record<TileStatus, number> = {
  FROZEN: 1,
  BURNING: 2,
  CORRUPTED: 3,
  CRYSTALLINE: 4,
};

const TEXEL_BYTES = 4;
const TERRAIN_LEVEL = {
  CANYON: 1,
  OTHER: 2,
  LAVA: 3,
  WATER: 0,
} as const;

export function encodeTerrainMap(
  grid: Tile[][],
  lavaFrontRow: number,
  previewRows: number,
  out?: Uint8Array,
  options?: { fog?: ReadonlyMap<number, number> },
): Uint8Array {
  const expectedLength = MAP.GRID_WIDTH * MAP.GRID_HEIGHT * TEXEL_BYTES;
  const encoded = out?.length === expectedLength ? out : new Uint8Array(expectedLength);

  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const tile = grid[y][x];
      const offset = (y * MAP.GRID_WIDTH + x) * TEXEL_BYTES;
      const level = tile.isLava
        ? TERRAIN_LEVEL.LAVA
        : tile.terrainType === TileType.CANYON
        ? TERRAIN_LEVEL.CANYON
        : tile.terrainType === TileType.WATER
        ? TERRAIN_LEVEL.WATER
        : TERRAIN_LEVEL.OTHER;
      const status = tile.isLava || !tile.status ? 0 : TERRAIN_STATUS_INDEX[tile.status];
      let heat = 0;

      if (tile.isLavaPreview && !tile.isLava) {
        const rank = lavaFrontRow - y;
        heat = Math.min(
          TERRAIN_RENDER.HEAT_LEVEL_MAX,
          Math.max(
            1,
            Math.round(
              TERRAIN_RENDER.HEAT_LEVEL_MAX
                * (1 - (1 - TERRAIN_RENDER.PREVIEW_HEAT_MIN) * (rank - 1) / Math.max(1, previewRows - 1)),
            ),
          ),
        );
      }

      encoded[offset] = level;
      encoded[offset + 1] = status + 16 * heat;
      encoded[offset + 2] = tile.isRevealed
        ? options?.fog?.get(y * MAP.GRID_WIDTH + x) ?? 0
        : 255;
      encoded[offset + 3] = ((x * 73856093) ^ (y * 19349663)) & 255;
    }
  }

  return encoded;
}
