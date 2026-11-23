import { ANIMATION } from '../../config/animation';
import { MAP } from '../../config/map';
import type { Tile } from '../types';

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

export function planFogLift(
  prevRevealed: Uint8Array | null,
  grid: Tile[][],
  nowMs: number,
  lifting: ReadonlyMap<number, number>,
): Map<number, number> {
  if (!prevRevealed) return new Map();

  const newlyRevealed = new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT);
  const depths = new Uint8Array(newlyRevealed.length);
  const queue: number[] = [];

  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const index = y * MAP.GRID_WIDTH + x;
      if (grid[y][x].isRevealed && !prevRevealed[index]) newlyRevealed[index] = 1;
    }
  }

  const addNeighbors = (index: number, depth: number) => {
    const x = index % MAP.GRID_WIDTH;
    const y = Math.floor(index / MAP.GRID_WIDTH);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const neighbor = ny * MAP.GRID_WIDTH + nx;
      if (!newlyRevealed[neighbor] || depths[neighbor] !== 0) continue;
      depths[neighbor] = depth;
      queue.push(neighbor);
    }
  };

  for (let index = 0; index < newlyRevealed.length; index++) {
    if ((prevRevealed[index] || lifting.has(index)) && index < MAP.GRID_WIDTH * MAP.GRID_HEIGHT) {
      addNeighbors(index, 1);
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const depth = depths[index];
    addNeighbors(index, Math.min(depth + 1, ANIMATION.FOG_LIFT_MAX_DEPTH));
  }

  const starts = new Map<number, number>();
  for (let index = 0; index < depths.length; index++) {
    const depth = depths[index];
    if (depth > 0) {
      starts.set(index, nowMs + (depth - 1) * ANIMATION.FOG_LIFT_ROW_STAGGER_MS);
    }
  }
  return starts;
}

export function fogValueAt(startMs: number, nowMs: number): number {
  const progress = Math.min(1, Math.max(0, (nowMs - startMs) / ANIMATION.FOG_LIFT_MS));
  return Math.round(255 * (1 - progress));
}

export function snapshotRevealed(grid: Tile[][], out?: Uint8Array): Uint8Array {
  const length = MAP.GRID_WIDTH * MAP.GRID_HEIGHT;
  const snapshot = out?.length === length ? out : new Uint8Array(length);
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      snapshot[y * MAP.GRID_WIDTH + x] = grid[y][x].isRevealed ? 1 : 0;
    }
  }
  return snapshot;
}
