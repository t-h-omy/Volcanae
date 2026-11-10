import { describe, expect, it } from 'vitest';
import { createResonanceLightningPaths, getResonanceOverviewZoom } from '../resonanceVfx';
import { MAP } from '../../config/map';

describe('resonance overview zoom', () => {
  it.each([240, 320, 390, 480])('fits every column in a %ipx viewport, even below manual zoom limits', (width) => {
    const zoom = getResonanceOverviewZoom(width, 64, 1);
    expect(MAP.GRID_WIDTH * 64 * zoom).toBeLessThanOrEqual(width);
    expect(zoom).toBe(width / (MAP.GRID_WIDTH * 64));
  });

  it('does not zoom in when the playfield already fits', () => {
    expect(getResonanceOverviewZoom(1920, 80, 0.5)).toBe(0.5);
  });
});

describe('resonance lightning geometry', () => {
  it('draws a jagged bolt between the actual link endpoints with short side forks', () => {
    const from = { x: 40, y: 80 };
    const to = { x: 280, y: 160 };
    const { mainPath, branchPaths } = createResonanceLightningPaths(from, to, 80);

    expect(mainPath.startsWith(`M ${from.x} ${from.y}`)).toBe(true);
    expect(mainPath.endsWith(`L ${to.x} ${to.y}`)).toBe(true);
    expect(mainPath.match(/L/g)).toHaveLength(6);
    expect(branchPaths).toHaveLength(2);
    expect(branchPaths.every((path) => (path.match(/L/g) ?? []).length === 2)).toBe(true);
  });

  it('returns no artificial bolt for a zero-length connection', () => {
    const point = { x: 40, y: 80 };
    expect(createResonanceLightningPaths(point, point, 80)).toEqual({
      mainPath: '',
      branchPaths: [],
    });
  });
});
