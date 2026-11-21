import { describe, expect, it } from 'vitest';
import { resolveLayerFx, resolveUnitBackgroundEffect } from '../unitPresentation';

describe('resolveLayerFx', () => {
  it('reports a pool rise as recharge', () => {
    expect(resolveLayerFx(0, 50)).toBe('recharge');
  });

  it('reports a drop above zero as absorb', () => {
    expect(resolveLayerFx(50, 40)).toBe('absorb');
  });

  it('reports a drop to zero as break', () => {
    expect(resolveLayerFx(10, 0)).toBe('break');
  });

  it('reports unchanged pools as null', () => {
    expect(resolveLayerFx(20, 20)).toBeNull();
  });

  it('reports an undefined to positive pool change as recharge', () => {
    expect(resolveLayerFx(undefined, 20)).toBe('recharge');
  });
});

describe('resolveUnitBackgroundEffect', () => {
  it('returns null for no active effects', () => {
    expect(resolveUnitBackgroundEffect([])).toBeNull();
  });

  it('returns a single active effect', () => {
    expect(resolveUnitBackgroundEffect(['MAGE_AURA'])).toBe('MAGE_AURA');
  });

  it('ignores unknown ids', () => {
    expect(resolveUnitBackgroundEffect(['UNKNOWN_EFFECT'])).toBeNull();
  });

  it('uses priority order when multiple ids are active', () => {
    expect(resolveUnitBackgroundEffect(['UNKNOWN_EFFECT', 'MAGE_AURA'])).toBe('MAGE_AURA');
  });
});
