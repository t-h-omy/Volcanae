/**
 * Tests for VF-05 tap-cycle selection helper.
 *
 * Verifies the three canonical cycles:
 *   unit + building tile  →  U → B → T → U → …
 *   building-only tile    →  B → T → B → …
 *   unit-only tile        →  U → T → U → …
 */

import { describe, it, expect } from 'vitest';
import { nextTileCycleTarget } from '../tileCycleHelper';

describe('nextTileCycleTarget', () => {
  describe('unit + building tile (canSelectTerrain = true)', () => {
    it('null → unit (first tap selects unit)', () => {
      expect(nextTileCycleTarget(null, true, true, true)).toBe('unit');
    });
    it('unit → building (second tap)', () => {
      expect(nextTileCycleTarget('unit', true, true, true)).toBe('building');
    });
    it('building → terrain (third tap)', () => {
      expect(nextTileCycleTarget('building', true, true, true)).toBe('terrain');
    });
    it('terrain → unit (wrap-around, fourth tap)', () => {
      expect(nextTileCycleTarget('terrain', true, true, true)).toBe('unit');
    });
  });

  describe('building-only tile (canSelectTerrain = true)', () => {
    it('null → building (first tap)', () => {
      expect(nextTileCycleTarget(null, false, true, true)).toBe('building');
    });
    it('building → terrain (second tap)', () => {
      expect(nextTileCycleTarget('building', false, true, true)).toBe('terrain');
    });
    it('terrain → building (wrap-around)', () => {
      expect(nextTileCycleTarget('terrain', false, true, true)).toBe('building');
    });
  });

  describe('unit-only tile (canSelectTerrain = true)', () => {
    it('null → unit (first tap)', () => {
      expect(nextTileCycleTarget(null, true, false, true)).toBe('unit');
    });
    it('unit → terrain (second tap)', () => {
      expect(nextTileCycleTarget('unit', true, false, true)).toBe('terrain');
    });
    it('terrain → unit (wrap-around)', () => {
      expect(nextTileCycleTarget('terrain', true, false, true)).toBe('unit');
    });
  });

  describe('canSelectTerrain = false (lava tile edge cases)', () => {
    it('unit on non-selectable tile: unit → unit (no terrain step)', () => {
      expect(nextTileCycleTarget('unit', true, false, false)).toBe('unit');
    });
    it('unit + building on non-selectable tile: unit → building → building', () => {
      expect(nextTileCycleTarget('unit', true, true, false)).toBe('building');
      expect(nextTileCycleTarget('building', true, true, false)).toBe('building');
    });
  });
});
