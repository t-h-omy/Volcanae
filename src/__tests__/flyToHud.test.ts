import { describe, expect, it } from 'vitest';
import { computeFlyToHudControlPoint, quadraticBezierPoint } from '../flyToHud';

describe('flyToHud bezier helpers', () => {
  it('returns exact start and end points at t=0 and t=1', () => {
    const from = { x: 10, y: 20 };
    const to = { x: 90, y: 20 };
    const control = computeFlyToHudControlPoint(from, to, 0.25);

    expect(quadraticBezierPoint(from, control, to, 0)).toEqual(from);
    expect(quadraticBezierPoint(from, control, to, 1)).toEqual(to);
  });

  it('deviates from straight midpoint at t=0.5 with curved control point', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const control = computeFlyToHudControlPoint(from, to, 0.25);
    const mid = quadraticBezierPoint(from, control, to, 0.5);
    const straightMid = { x: 50, y: 0 };

    expect(mid.x).toBeCloseTo(straightMid.x);
    expect(mid.y).not.toBeCloseTo(straightMid.y);
  });
});
