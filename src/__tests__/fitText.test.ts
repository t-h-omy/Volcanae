import { describe, expect, it } from 'vitest';
import { computeFitFontSize, resolveMinFontSize } from '../fitText';

describe('resolveMinFontSize', () => {
  it.each([
    [11, 9],
    [13, 9.75],
    [16, 12],
    [8, 8],
  ])('resolves %i px to a minimum of %i px', (basePx, expectedPx) => {
    expect(resolveMinFontSize(basePx)).toBe(expectedPx);
  });
});

describe('computeFitFontSize', () => {
  it('keeps the base size when it fits', () => {
    expect(computeFitFontSize({
      basePx: 14,
      minPx: 9,
      stepPx: 0.5,
      fits: () => true,
    })).toEqual({ sizePx: 14, fitted: true });
  });

  it('returns the first smaller size that fits', () => {
    expect(computeFitFontSize({
      basePx: 14,
      minPx: 9,
      stepPx: 0.5,
      fits: (sizePx) => sizePx <= 12,
    })).toEqual({ sizePx: 12, fitted: true });
  });

  it('returns the minimum and marks the result clipped when nothing fits', () => {
    expect(computeFitFontSize({
      basePx: 14,
      minPx: 9,
      stepPx: 0.5,
      fits: () => false,
    })).toEqual({ sizePx: 9, fitted: false });
  });

  it('tests the minimum as the last candidate when the step does not reach it', () => {
    const candidates: number[] = [];
    expect(computeFitFontSize({
      basePx: 10,
      minPx: 9.2,
      stepPx: 0.5,
      fits: (sizePx) => {
        candidates.push(sizePx);
        return false;
      },
    })).toEqual({ sizePx: 9.2, fitted: false });
    expect(candidates).toEqual([10, 9.5, 9.2]);
  });

  it('keeps the base size when the step is zero', () => {
    expect(computeFitFontSize({
      basePx: 14,
      minPx: 9,
      stepPx: 0,
      fits: () => false,
    })).toEqual({ sizePx: 14, fitted: false });
  });
});
