import { ANIMATION } from '../../config/animation';
import { MAP } from '../../config/map';
import { TERRAIN_RENDER } from '../../config/terrain';
import { cubicBezierEase } from '../cameraMotion';
import type { Tile } from '../types';

const fogLiftEase = cubicBezierEase(...ANIMATION.FOG_LIFT_EASE_BEZIER);

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

export function isFogFree(tile: Tile, y: number, lavaFlowRow?: number): boolean {
  return tile.isRevealed || tile.isLava || y === lavaFlowRow;
}

/**
 * Plans delays after the first drawn frame, spreading from revealed or lifting tiles.
 * Isolated groups start at the tile closest to their centroid.
 */
export function planFogLift(
  prevRevealed: Uint8Array | null,
  grid: Tile[][],
  lifting: ReadonlySet<number>,
  staggerMs: number,
  lavaFlowRow?: number,
): Map<number, number> {
  if (!prevRevealed) return new Map();

  const size = MAP.GRID_WIDTH * MAP.GRID_HEIGHT;
  const newlyRevealed = new Uint8Array(size);
  const depths = new Uint8Array(size);

  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const index = y * MAP.GRID_WIDTH + x;
      if (isFogFree(grid[y][x], y, lavaFlowRow) && !prevRevealed[index]) newlyRevealed[index] = 1;
    }
  }

  const forNeighbors = (index: number, visit: (neighbor: number) => void) => {
    const x = index % MAP.GRID_WIDTH;
    const y = Math.floor(index / MAP.GRID_WIDTH);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      visit(ny * MAP.GRID_WIDTH + nx);
    }
  };

  const spread = (queue: number[]) => {
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      const depth = Math.min(depths[index] + 1, ANIMATION.FOG_LIFT_MAX_DEPTH);
      forNeighbors(index, (neighbor) => {
        if (!newlyRevealed[neighbor] || depths[neighbor] !== 0) return;
        depths[neighbor] = depth;
        queue.push(neighbor);
      });
    }
  };

  const queue: number[] = [];
  for (let index = 0; index < size; index++) {
    if (!prevRevealed[index] && !lifting.has(index)) continue;
    forNeighbors(index, (neighbor) => {
      if (!newlyRevealed[neighbor] || depths[neighbor] !== 0) return;
      depths[neighbor] = 1;
      queue.push(neighbor);
    });
  }
  spread(queue);

  const grouped = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    if (!newlyRevealed[index] || depths[index] !== 0 || grouped[index]) continue;
    const group = [index];
    grouped[index] = 1;
    for (let cursor = 0; cursor < group.length; cursor++) {
      forNeighbors(group[cursor], (neighbor) => {
        if (!newlyRevealed[neighbor] || depths[neighbor] !== 0 || grouped[neighbor]) return;
        grouped[neighbor] = 1;
        group.push(neighbor);
      });
    }
    let cx = 0;
    let cy = 0;
    for (const member of group) {
      cx += member % MAP.GRID_WIDTH;
      cy += Math.floor(member / MAP.GRID_WIDTH);
    }
    cx /= group.length;
    cy /= group.length;
    let seed = group[0];
    let best = Infinity;
    for (const member of group) {
      const dx = member % MAP.GRID_WIDTH - cx;
      const dy = Math.floor(member / MAP.GRID_WIDTH) - cy;
      const distance = dx * dx + dy * dy;
      if (distance < best || (distance === best && member < seed)) {
        best = distance;
        seed = member;
      }
    }
    depths[seed] = 1;
    spread([seed]);
  }

  const delays = new Map<number, number>();
  for (let index = 0; index < size; index++) {
    if (depths[index] > 0) delays.set(index, (depths[index] - 1) * staggerMs);
  }
  return delays;
}

/** Moves planned lifts to absolute start times on the frame that first draws them. */
export function activatePendingLifts(pending: Map<number, number>, starts: Map<number, number>, nowMs: number): void {
  for (const [index, delayMs] of pending) {
    if (!starts.has(index)) starts.set(index, nowMs + delayMs);
  }
  pending.clear();
}

/** Fog value of a lifting tile, always below the fog-at-rest value. */
export function fogValueAt(startMs: number, nowMs: number, liftMs: number): number {
  const progress = Math.min(1, Math.max(0, (nowMs - startMs) / Math.max(1, liftMs)));
  return Math.round(TERRAIN_RENDER.FOG_LIFT_START_VALUE * (1 - fogLiftEase(progress)));
}

export function snapshotRevealed(
  grid: Tile[][],
  out?: Uint8Array,
  lavaFlowRow?: number,
): Uint8Array {
  const length = MAP.GRID_WIDTH * MAP.GRID_HEIGHT;
  const snapshot = out?.length === length ? out : new Uint8Array(length);
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      snapshot[y * MAP.GRID_WIDTH + x] = isFogFree(grid[y][x], y, lavaFlowRow) ? 1 : 0;
    }
  }
  return snapshot;
}
