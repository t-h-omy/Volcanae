import { describe, expect, it } from 'vitest';
import { createResonanceLightningPaths } from '../resonanceVfx';

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
