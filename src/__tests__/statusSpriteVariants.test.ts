import { describe, expect, it } from 'vitest';
import { applyStatusToPixels, getStatusVariantKey, pickStatusSprite } from '../statusSpriteVariants';

function rgbaPixels(colors: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

describe('applyStatusToPixels', () => {
  it('returns equal pixels for zero strength without mutating input', () => {
    const source = rgbaPixels([[80, 120, 160, 255]]);
    const before = new Uint8ClampedArray(source);
    const result = applyStatusToPixels(source, 1, 1, 1, 0);

    expect(result).not.toBe(source);
    expect(result).toEqual(before);
    expect(source).toEqual(before);
  });

  it('keeps fully transparent pixels unchanged', () => {
    const source = rgbaPixels([[255, 0, 0, 0]]);
    expect(applyStatusToPixels(source, 1, 1, 1, 1)).toEqual(source);
  });

  it('adds a lighter, bluer snow cap above exposed frozen pixels', () => {
    const source = rgbaPixels([
      [0, 0, 0, 0],
      [120, 100, 80, 255],
      [120, 100, 80, 255],
    ]);
    const result = applyStatusToPixels(source, 1, 3, 1, 1);

    expect(result[4]).toBeGreaterThan(source[4]);
    expect(result[6]).toBeGreaterThan(source[6]);
  });

  it('drains saturation from corrupted green pixels', () => {
    const source = rgbaPixels([[0, 255, 0, 255]]);
    const result = applyStatusToPixels(source, 1, 1, 3, 1);
    const saturation = (pixels: Uint8ClampedArray) => Math.max(pixels[0], pixels[1], pixels[2]) - Math.min(pixels[0], pixels[1], pixels[2]);

    expect(saturation(result)).toBeLessThan(saturation(source));
  });

  it('changes an opaque edge pixel for burning and crystalline treatments', () => {
    const source = rgbaPixels([
      [100, 120, 140, 255],
      [100, 120, 140, 255],
      [0, 0, 0, 0],
    ]);

    expect(applyStatusToPixels(source, 3, 1, 2, 1).slice(0, 3)).not.toEqual(source.slice(0, 3));
    expect(applyStatusToPixels(source, 3, 1, 4, 1).slice(0, 3)).not.toEqual(source.slice(0, 3));
  });

  it('keys variants by sprite, status and strength', () => {
    expect(getStatusVariantKey('/sprite.png', 1, 0.4)).not.toBe(getStatusVariantKey('/sprite.png', 2, 0.4));
    expect(getStatusVariantKey('/sprite.png', 1, 0.4)).not.toBe(getStatusVariantKey('/sprite.png', 1, 0.5));
  });

  it('prefers a cached variant over the pending variant and source path', () => {
    expect(pickStatusSprite('/sprite.png', 'variant-key', 'data:image/png;base64,cached', {
      key: 'variant-key',
      path: 'data:image/png;base64,pending',
    })).toBe('data:image/png;base64,cached');
  });
});
