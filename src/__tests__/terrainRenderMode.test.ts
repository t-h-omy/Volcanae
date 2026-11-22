import { describe, expect, it } from 'vitest';
import { resolveTerrainRenderMode } from '../terrain/terrainRenderStore';
import { GraphicsQuality } from '../types';

describe('resolveTerrainRenderMode', () => {
  it.each([
    [GraphicsQuality.HIGH, 'ready', 'shader'],
    [GraphicsQuality.SAVER, 'ready', 'shader'],
    [GraphicsQuality.BASIC, 'ready', 'png'],
    [GraphicsQuality.HIGH, 'unavailable', 'png'],
    [GraphicsQuality.SAVER, 'unavailable', 'png'],
    [GraphicsQuality.BASIC, 'unavailable', 'png'],
  ] as const)('resolves %s quality with %s WebGL to %s', (quality, status, expected) => {
    expect(resolveTerrainRenderMode(quality, status)).toBe(expected);
  });
});
