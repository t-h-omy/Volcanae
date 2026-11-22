import type { TerrainLook } from '../../config/terrain';

export const TERRAIN_UNIFORM_SLOTS = {
  TP: {
    water: 0,
    canyon: 1,
    plains: 2,
    lava: 3,
    fog: 4,
  },
  SE: {
    frozen: 1,
    burning: 2,
    corrupted: 3,
    crystalline: 4,
  },
} as const;

export interface PackedTerrainUniforms {
  tp: Float32Array;
  se: Float32Array;
  frz: [number, number, number];
  brn: [number, number, number];
  cor: [number, number, number];
  cry: [number, number, number];
  heat: number;
}

export function packTerrainUniforms(look: TerrainLook): PackedTerrainUniforms {
  const tp = new Float32Array(20);
  const se = new Float32Array(10);
  const setTerrain = (slot: number, values: readonly number[]) => {
    tp.set(values, slot * 4);
  };
  const setStatus = (slot: number, values: readonly number[]) => {
    se.set(values, slot * 2);
  };

  setTerrain(TERRAIN_UNIFORM_SLOTS.TP.water, [
    look.terrain.water.blend, look.terrain.water.noise, look.terrain.water.foam, look.terrain.water.waves,
  ]);
  setTerrain(TERRAIN_UNIFORM_SLOTS.TP.canyon, [
    look.terrain.canyon.blend, look.terrain.canyon.noise, look.terrain.canyon.wallHeight, look.terrain.canyon.detail,
  ]);
  setTerrain(TERRAIN_UNIFORM_SLOTS.TP.plains, [
    look.terrain.plains.blend, look.terrain.plains.noise, look.terrain.plains.patchContrast, look.terrain.plains.tufts,
  ]);
  setTerrain(TERRAIN_UNIFORM_SLOTS.TP.lava, [
    look.terrain.lava.blend, look.terrain.lava.noise, look.terrain.lava.crust, look.terrain.lava.glow,
  ]);
  setTerrain(TERRAIN_UNIFORM_SLOTS.TP.fog, [
    look.terrain.fog.blend, look.terrain.fog.noise, look.terrain.fog.shadow, look.terrain.fog.contrast,
  ]);

  setStatus(TERRAIN_UNIFORM_SLOTS.SE.frozen, [look.status.frozen.blend, look.status.frozen.noise]);
  setStatus(TERRAIN_UNIFORM_SLOTS.SE.burning, [look.status.burning.blend, look.status.burning.noise]);
  setStatus(TERRAIN_UNIFORM_SLOTS.SE.corrupted, [look.status.corrupted.blend, look.status.corrupted.noise]);
  setStatus(TERRAIN_UNIFORM_SLOTS.SE.crystalline, [look.status.crystalline.blend, look.status.crystalline.noise]);

  return {
    tp,
    se,
    frz: [look.status.frozen.frostLayer, look.status.frozen.cracks, look.status.frozen.glare],
    brn: [look.status.burning.char, look.status.burning.scorch, look.status.burning.fire],
    cor: [look.status.corrupted.ash, look.status.corrupted.veins, look.status.corrupted.glow],
    cry: [look.status.crystalline.density, look.status.crystalline.size, look.status.crystalline.strength],
    heat: look.terrain.lava.previewHeat,
  };
}
