import { describe, expect, it } from 'vitest';
import { TERRAIN_LOOK } from '../../config/terrain';
import { packTerrainUniforms, TERRAIN_UNIFORM_SLOTS } from '../terrain/terrainUniforms';

const asFloats = (...values: number[]) => Array.from(new Float32Array(values));

describe('packTerrainUniforms', () => {
  it('packs every terrain and status look into the named slots', () => {
    const packed = packTerrainUniforms(TERRAIN_LOOK);
    const terrain = TERRAIN_UNIFORM_SLOTS.TP;
    const status = TERRAIN_UNIFORM_SLOTS.SE;

    expect(packed.tp.length).toBe(20);
    expect(packed.se.length).toBe(10);
    expect(Array.from(packed.tp.slice(terrain.water * 4, terrain.water * 4 + 4))).toEqual(asFloats(
      TERRAIN_LOOK.terrain.water.blend,
      TERRAIN_LOOK.terrain.water.noise,
      TERRAIN_LOOK.terrain.water.foam,
      TERRAIN_LOOK.terrain.water.waves,
    ));
    expect(Array.from(packed.tp.slice(terrain.canyon * 4, terrain.canyon * 4 + 4))).toEqual(asFloats(
      TERRAIN_LOOK.terrain.canyon.blend,
      TERRAIN_LOOK.terrain.canyon.noise,
      TERRAIN_LOOK.terrain.canyon.wallHeight,
      TERRAIN_LOOK.terrain.canyon.detail,
    ));
    expect(Array.from(packed.tp.slice(terrain.plains * 4, terrain.plains * 4 + 4))).toEqual(asFloats(
      TERRAIN_LOOK.terrain.plains.blend,
      TERRAIN_LOOK.terrain.plains.noise,
      TERRAIN_LOOK.terrain.plains.patchContrast,
      TERRAIN_LOOK.terrain.plains.tufts,
    ));
    expect(Array.from(packed.tp.slice(terrain.lava * 4, terrain.lava * 4 + 4))).toEqual(asFloats(
      TERRAIN_LOOK.terrain.lava.blend,
      TERRAIN_LOOK.terrain.lava.noise,
      TERRAIN_LOOK.terrain.lava.crust,
      TERRAIN_LOOK.terrain.lava.glow,
    ));
    expect(Array.from(packed.tp.slice(terrain.fog * 4, terrain.fog * 4 + 4))).toEqual(asFloats(
      TERRAIN_LOOK.terrain.fog.blend,
      TERRAIN_LOOK.terrain.fog.noise,
      TERRAIN_LOOK.terrain.fog.shadow,
      TERRAIN_LOOK.terrain.fog.contrast,
    ));
    expect(Array.from(packed.se.slice(status.frozen * 2, status.frozen * 2 + 2))).toEqual(asFloats(
      TERRAIN_LOOK.status.frozen.blend, TERRAIN_LOOK.status.frozen.noise,
    ));
    expect(Array.from(packed.se.slice(status.burning * 2, status.burning * 2 + 2))).toEqual(asFloats(
      TERRAIN_LOOK.status.burning.blend, TERRAIN_LOOK.status.burning.noise,
    ));
    expect(Array.from(packed.se.slice(status.corrupted * 2, status.corrupted * 2 + 2))).toEqual(asFloats(
      TERRAIN_LOOK.status.corrupted.blend, TERRAIN_LOOK.status.corrupted.noise,
    ));
    expect(Array.from(packed.se.slice(status.crystalline * 2, status.crystalline * 2 + 2))).toEqual(asFloats(
      TERRAIN_LOOK.status.crystalline.blend, TERRAIN_LOOK.status.crystalline.noise,
    ));
    expect(Array.from(packed.se.slice(0, 2))).toEqual(asFloats(0, 0));
    expect(packed.frz).toEqual([
      TERRAIN_LOOK.status.frozen.frostLayer,
      TERRAIN_LOOK.status.frozen.cracks,
      TERRAIN_LOOK.status.frozen.glare,
    ]);
    expect(packed.brn).toEqual([
      TERRAIN_LOOK.status.burning.char,
      TERRAIN_LOOK.status.burning.scorch,
      TERRAIN_LOOK.status.burning.fire,
    ]);
    expect(packed.cor).toEqual([
      TERRAIN_LOOK.status.corrupted.ash,
      TERRAIN_LOOK.status.corrupted.veins,
      TERRAIN_LOOK.status.corrupted.glow,
    ]);
    expect(packed.cry).toEqual([
      TERRAIN_LOOK.status.crystalline.density,
      TERRAIN_LOOK.status.crystalline.size,
      TERRAIN_LOOK.status.crystalline.strength,
    ]);
    expect(packed.heat).toBe(TERRAIN_LOOK.terrain.lava.previewHeat);
    expect(packed.prevEdge).toEqual([
      TERRAIN_LOOK.terrain.lava.previewBlend,
      TERRAIN_LOOK.terrain.lava.previewNoise,
    ]);
    expect(packed.fogLift).toEqual([
      TERRAIN_LOOK.terrain.fog.liftBillow,
      TERRAIN_LOOK.terrain.fog.liftDrift,
      TERRAIN_LOOK.terrain.fog.liftThin,
      TERRAIN_LOOK.terrain.fog.liftBillowSpeed,
    ]);
  });
});
