import { describe, expect, it } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { cubicBezierEase, interpolatePose, sampleTween, type CameraTween } from '../cameraMotion';

const ease = cubicBezierEase(...ANIMATION.CAMERA_EASE_BEZIER);

describe('camera motion', () => {
  it('eases to exact endpoints and the midpoint', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
  });

  it('is monotonic across the camera easing curve', () => {
    const samples = Array.from({ length: 101 }, (_, index) => ease(index / 100));
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
  });

  it('interpolates each pose component linearly', () => {
    expect(interpolatePose(
      { x: 0, y: 10, zoom: 1 },
      { x: 20, y: 30, zoom: 3 },
      0.5,
    )).toEqual({ x: 10, y: 20, zoom: 2 });
  });

  it('clamps a completed tween to its target and reports done', () => {
    const tween: CameraTween = {
      from: { x: 0, y: 0, zoom: 1 },
      to: { x: 20, y: 40, zoom: 2 },
      startMs: 100,
      durationMs: 50,
    };

    expect(sampleTween(tween, 200, ease)).toEqual({ pose: tween.to, done: true });
  });

  it('returns the target immediately for a zero-duration tween', () => {
    const tween: CameraTween = {
      from: { x: 0, y: 0, zoom: 1 },
      to: { x: 20, y: 40, zoom: 2 },
      startMs: 100,
      durationMs: 0,
    };

    expect(sampleTween(tween, 100, ease)).toEqual({ pose: tween.to, done: true });
  });
});
