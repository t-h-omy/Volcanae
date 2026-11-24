import { describe, expect, it } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { MAP } from '../../config/map';
import { TileType, type Tile } from '../types';
import { fogValueAt, isFogFree, planFogLift, snapshotRevealed } from '../terrain/fogLift';

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
    expect(planFogLift(null, grid, 100, new Map())).toEqual(new Map());
  });

  it('stagger-reveals a connected front by breadth-first depth', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    const previous = snapshot(grid);
    grid[1][0].isRevealed = true;
    grid[2][0].isRevealed = true;

    const plan = planFogLift(previous, grid, 1000, new Map());
    expect(plan.get(MAP.GRID_WIDTH)).toBe(1000);
    expect(plan.get(MAP.GRID_WIDTH * 2)).toBe(1000 + ANIMATION.FOG_LIFT_ROW_STAGGER_MS);
  });

  it('ignores tiles that were already revealed', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    const previous = snapshot(grid);

    expect(planFogLift(previous, grid, 1000, new Map())).toEqual(new Map());
  });

  it('uses currently lifting tiles as breadth-first sources', () => {
    const grid = makeGrid();
    grid[3][3].isRevealed = true;
    const lifting = new Map([[3 * MAP.GRID_WIDTH + 2, 100]]);

    const plan = planFogLift(new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT), grid, 1000, lifting);
    expect(plan.get(3 * MAP.GRID_WIDTH + 3)).toBe(1000);
  });

  it('uses lava tiles as fog-free targets and sources', () => {
    const grid = makeGrid();
    grid[3][2].isRevealed = true;
    const previous = snapshot(grid);
    grid[3][3].isLava = true;
    grid[3][4].isRevealed = true;

    const plan = planFogLift(previous, grid, 1000, new Map());

    expect(isFogFree(grid[3][3], 3)).toBe(true);
    expect(plan.get(3 * MAP.GRID_WIDTH + 3)).toBe(1000);
    expect(plan.get(3 * MAP.GRID_WIDTH + 4)).toBe(1000 + ANIMATION.FOG_LIFT_ROW_STAGGER_MS);
  });

  it('lifts the incoming lava flow row', () => {
    const grid = makeGrid();
    const flowRow = 4;
    grid[flowRow - 1][3].isRevealed = true;
    const previous = snapshot(grid);

    const plan = planFogLift(previous, grid, 1000, new Map(), flowRow);

    expect(isFogFree(grid[flowRow][3], flowRow, flowRow)).toBe(true);
    expect(plan.get(flowRow * MAP.GRID_WIDTH + 3)).toBe(1000);
  });

  it('caps deeper rows at the configured maximum depth', () => {
    const grid = makeGrid();
    grid[0][0].isRevealed = true;
    const previous = snapshot(grid);
    for (let y = 1; y <= ANIMATION.FOG_LIFT_MAX_DEPTH + 2; y++) grid[y][0].isRevealed = true;

    const plan = planFogLift(previous, grid, 1000, new Map());
    const cappedStart = 1000 + (ANIMATION.FOG_LIFT_MAX_DEPTH - 1) * ANIMATION.FOG_LIFT_ROW_STAGGER_MS;
    expect(plan.get(ANIMATION.FOG_LIFT_MAX_DEPTH * MAP.GRID_WIDTH)).toBe(cappedStart);
    expect(plan.get((ANIMATION.FOG_LIFT_MAX_DEPTH + 2) * MAP.GRID_WIDTH)).toBe(cappedStart);
  });

  it('eases fog opacity from 255 to 0 with a strictly decreasing curve', () => {
    const start = 1000;
    expect(fogValueAt(start, start - 1)).toBe(255);
    expect(fogValueAt(start, start)).toBe(255);
    const values = Array.from({ length: 11 }, (_, step) =>
      fogValueAt(start, start + ANIMATION.FOG_LIFT_MS * step / 10),
    );
    expect(values.every((value, index) => index === 0 || value <= values[index - 1])).toBe(true);
    expect(values.every((value, index) => index === 0 || value < values[index - 1])).toBe(true);
    expect(fogValueAt(start, start + ANIMATION.FOG_LIFT_MS / 2)).not.toBe(
      Math.round(255 * (1 - ANIMATION.FOG_LIFT_MS / 2 / ANIMATION.FOG_LIFT_MS)),
    );
    expect(fogValueAt(start, start + ANIMATION.FOG_LIFT_MS)).toBe(0);
    expect(fogValueAt(start, start + ANIMATION.FOG_LIFT_MS + 1)).toBe(0);
  });

  it('does not lift any tile on the first encode, including the flow row', () => {
    const grid = makeGrid();
    const flowRow = 4;

    expect(planFogLift(null, grid, 1000, new Map(), flowRow)).toEqual(new Map());
  });
});
