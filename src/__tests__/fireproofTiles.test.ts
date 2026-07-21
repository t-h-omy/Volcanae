/**
 * Tests for VF-04 — Corrupted and frozen tiles are fireproof.
 *
 * Covers:
 *  - BURNING onto a CORRUPTED tile → returns false, status stays CORRUPTED.
 *  - BURNING onto a FROZEN tile    → returns false, status stays FROZEN.
 *  - FROZEN onto a BURNING tile    → succeeds (Frostcraft over fire is allowed).
 *  - BURNING onto a clean PLAINS tile → succeeds (normal case).
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { TileType, TileStatus } from '../types';
import type { GameState, Tile } from '../types';
import { applyTileStatus } from '../tileStatusSystem';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTile(x: number, y: number, status: TileStatus | null = null): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status,
  } as unknown as Tile;
}

function makeState(tile: Tile): GameState {
  const grid: Tile[][] = [[tile]];
  return { grid } as unknown as GameState;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('applyTileStatus fireproof guard', () => {
  it('BURNING onto CORRUPTED returns false and preserves CORRUPTED', () => {
    const state = makeState(makeTile(0, 0, TileStatus.CORRUPTED));
    const result = produce(state, (draft) => {
      const ret = applyTileStatus(draft, { x: 0, y: 0 }, TileStatus.BURNING);
      expect(ret).toBe(false);
    });
    expect(result.grid[0][0].status).toBe(TileStatus.CORRUPTED);
  });

  it('BURNING onto FROZEN returns false and preserves FROZEN', () => {
    const state = makeState(makeTile(0, 0, TileStatus.FROZEN));
    const result = produce(state, (draft) => {
      const ret = applyTileStatus(draft, { x: 0, y: 0 }, TileStatus.BURNING);
      expect(ret).toBe(false);
    });
    expect(result.grid[0][0].status).toBe(TileStatus.FROZEN);
  });

  it('FROZEN onto BURNING succeeds (Frostcraft extinguishes fire)', () => {
    const state = makeState(makeTile(0, 0, TileStatus.BURNING));
    const result = produce(state, (draft) => {
      const ret = applyTileStatus(draft, { x: 0, y: 0 }, TileStatus.FROZEN);
      expect(ret).toBe(true);
    });
    expect(result.grid[0][0].status).toBe(TileStatus.FROZEN);
  });

  it('BURNING onto a clean PLAINS tile succeeds', () => {
    const state = makeState(makeTile(0, 0, null));
    const result = produce(state, (draft) => {
      const ret = applyTileStatus(draft, { x: 0, y: 0 }, TileStatus.BURNING);
      expect(ret).toBe(true);
    });
    expect(result.grid[0][0].status).toBe(TileStatus.BURNING);
  });
});
