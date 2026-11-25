import { describe, expect, it } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { MAP } from '../../config/map';
import { TERRAIN_LOOK, TERRAIN_RENDER } from '../../config/terrain';
import { TileType, type Tile } from '../types';
import { activatePendingLifts, fogValueAt, isFogFree, planFogLift, snapshotRevealed } from '../terrain/fogLift';

const staggerMs = TERRAIN_LOOK.terrain.fog.liftStaggerMs;
const liftMs = TERRAIN_LOOK.terrain.fog.liftMs;

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y },
      isRevealed: false,
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

function snapshot(grid: Tile[][]): Uint8Array {
  return snapshotRevealed(grid);
}

describe('fog lift planning', () => {
  it('does not lift tiles on the first encode', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    expect(planFogLift(null, grid, new Set(), staggerMs)).toEqual(new Map());
  });

  it('stagger-reveals a connected front by breadth-first depth', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    const previous = snapshot(grid);
    grid[1][0].isRevealed = true;
    grid[2][0].isRevealed = true;

    const plan = planFogLift(previous, grid, new Set(), staggerMs);
    expect(plan.get(MAP.GRID_WIDTH)).toBe(0);
    expect(plan.get(MAP.GRID_WIDTH * 2)).toBe(staggerMs);
  });

  it('ignores tiles that were already revealed', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    const previous = snapshot(grid);

    expect(planFogLift(previous, grid, new Set(), staggerMs)).toEqual(new Map());
  });

  it('uses currently lifting tiles as breadth-first sources', () => {
    const grid = makeGrid();
    grid[3][3].isRevealed = true;
    const lifting = new Set([3 * MAP.GRID_WIDTH + 2]);

    const plan = planFogLift(new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT), grid, lifting, staggerMs);
    expect(plan.get(3 * MAP.GRID_WIDTH + 3)).toBe(0);
  });

  it('uses lava tiles as fog-free targets and sources', () => {
    const grid = makeGrid();
    grid[3][2].isRevealed = true;
    const previous = snapshot(grid);
    grid[3][3].isLava = true;
    grid[3][4].isRevealed = true;

    const plan = planFogLift(previous, grid, new Set(), staggerMs);

    expect(isFogFree(grid[3][3], 3)).toBe(true);
    expect(plan.get(3 * MAP.GRID_WIDTH + 3)).toBe(0);
    expect(plan.get(3 * MAP.GRID_WIDTH + 4)).toBe(staggerMs);
  });

  it('lifts the incoming lava flow row', () => {
    const grid = makeGrid();
    const flowRow = 4;
    grid[flowRow - 1][3].isRevealed = true;
    const previous = snapshot(grid);

    const plan = planFogLift(previous, grid, new Set(), staggerMs, flowRow);

    expect(isFogFree(grid[flowRow][3], flowRow, flowRow)).toBe(true);
    expect(plan.get(flowRow * MAP.GRID_WIDTH + 3)).toBe(0);
  });

  it('caps deeper rows at the configured maximum depth', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    const previous = snapshot(grid);
    for (let y = 1; y <= ANIMATION.FOG_LIFT_MAX_DEPTH + 2; y++) grid[y][0].isRevealed = true;

    const plan = planFogLift(previous, grid, new Set(), staggerMs);
    const cappedStart = (ANIMATION.FOG_LIFT_MAX_DEPTH - 1) * staggerMs;
    expect(plan.get(ANIMATION.FOG_LIFT_MAX_DEPTH * MAP.GRID_WIDTH)).toBe(cappedStart);
    expect(plan.get((ANIMATION.FOG_LIFT_MAX_DEPTH + 2) * MAP.GRID_WIDTH)).toBe(cappedStart);
  });

  it('eases fog opacity from the lift start value to 0', () => {
    const start = 1000;
    expect(fogValueAt(start, start - 1, liftMs)).toBe(TERRAIN_RENDER.FOG_LIFT_START_VALUE);
    expect(fogValueAt(start, start, liftMs)).toBe(TERRAIN_RENDER.FOG_LIFT_START_VALUE);
    const values = Array.from({ length: 11 }, (_, step) =>
      fogValueAt(start, start + liftMs * step / 10, liftMs),
    );
    expect(values.every((value, index) => index === 0 || value < values[index - 1])).toBe(true);
    expect(values.every((value) => value < 255)).toBe(true);
    expect(fogValueAt(start, start + liftMs / 2, liftMs)).not.toBe(
      Math.round(TERRAIN_RENDER.FOG_LIFT_START_VALUE / 2),
    );
    expect(fogValueAt(start, start + liftMs, liftMs)).toBe(0);
    expect(fogValueAt(start, start + liftMs + 1, liftMs)).toBe(0);
  });

  it('does not lift any tile on the first encode, including the flow row', () => {
    const grid = makeGrid();
    const flowRow = 4;

    expect(planFogLift(null, grid, new Set(), staggerMs, flowRow)).toEqual(new Map());
  });

  it('opens isolated groups from the centroid', () => {
    const grid = makeGrid();
    const previous = snapshot(grid);
    for (let x = 2; x <= 4; x++) grid[3][x].isRevealed = true;
    const plan = planFogLift(previous, grid, new Set(), staggerMs);
    expect(plan.get(3 * MAP.GRID_WIDTH + 3)).toBe(0);
    expect(plan.get(3 * MAP.GRID_WIDTH + 2)).toBe(staggerMs);
    expect(plan.get(3 * MAP.GRID_WIDTH + 4)).toBe(staggerMs);
  });

  it('activates pending delays without replacing existing starts', () => {
    const pending = new Map([[1, 0], [2, staggerMs], [3, staggerMs]]);
    const starts = new Map([[3, 42]]);
    activatePendingLifts(pending, starts, 1000);
    expect(starts).toEqual(new Map([[3, 42], [1, 1000], [2, 1000 + staggerMs]]));
    expect(pending.size).toBe(0);
  });
});
