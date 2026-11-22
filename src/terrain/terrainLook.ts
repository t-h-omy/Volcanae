import { TERRAIN_LOOK, type TerrainLook } from '../../config/terrain';
import { useTerrainTuningStore } from './terrainTuningStore';

export function getTerrainLook(): TerrainLook {
  return useTerrainTuningStore.getState().overrides ?? TERRAIN_LOOK;
}
