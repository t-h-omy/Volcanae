/**
 * Zustand store that drives combat animation visuals.
 * Completely separate from gameStore — no game logic here.
 */

import { create } from 'zustand';

// ============================================================================
// TYPES
// ============================================================================

export type UnitAnimationState =
  | { type: 'LUNGE'; dx: number; dy: number }
  | { type: 'RECOIL'; dx: number; dy: number }
  | { type: 'HIT' }
  | { type: 'DYING' }
  | { type: 'LEVEL_UP' }
  | { type: 'XP_GAIN' }
  | { type: 'TRANSFORM_TO_DEMON'; durationMs: number };

export type BuildingAnimationState = 'CRYSTAL_ACTIVATE' | 'SANCTUM_SHATTER';

export interface Projectile {
  id: string;
  fromPx: { x: number; y: number };
  toPx: { x: number; y: number };
  emoji: string;
  rotationDeg: number;
  durationMs: number;
}

interface CombatAnimationState {
  unitAnimations: Map<string, UnitAnimationState>;
  buildingAnimations: Map<string, BuildingAnimationState>;
  projectiles: Projectile[];
  /** Active per-tile flash bursts, keyed by "x,y" */
  tileFlashes: Map<string, { durationMs: number }>;
}

interface CombatAnimationActions {
  setUnitAnimation: (unitId: string, anim: UnitAnimationState | null) => void;
  setBuildingAnimation: (buildingId: string, anim: BuildingAnimationState | null) => void;
  addProjectile: (p: Projectile) => void;
  removeProjectile: (id: string) => void;
  addTileFlash: (x: number, y: number, durationMs: number) => void;
  removeTileFlash: (key: string) => void;
}

type CombatAnimationStore = CombatAnimationState & CombatAnimationActions;

// ============================================================================
// STORE
// ============================================================================

export const useCombatAnimationStore = create<CombatAnimationStore>((set) => ({
  unitAnimations: new Map(),
  buildingAnimations: new Map(),
  projectiles: [],
  tileFlashes: new Map(),

  setUnitAnimation: (unitId, anim) => {
    set((state) => {
      const next = new Map(state.unitAnimations);
      if (anim) {
        next.set(unitId, anim);
      } else {
        next.delete(unitId);
      }
      return { unitAnimations: next };
    });
  },

  setBuildingAnimation: (buildingId, anim) => {
    set((state) => {
      const next = new Map(state.buildingAnimations);
      if (anim) {
        next.set(buildingId, anim);
      } else {
        next.delete(buildingId);
      }
      return { buildingAnimations: next };
    });
  },

  addProjectile: (p) => {
    set((state) => ({ projectiles: [...state.projectiles, p] }));
  },

  removeProjectile: (id) => {
    set((state) => ({
      projectiles: state.projectiles.filter((p) => p.id !== id),
    }));
  },

  addTileFlash: (x, y, durationMs) => {
    set((state) => {
      const next = new Map(state.tileFlashes);
      next.set(`${x},${y}`, { durationMs });
      return { tileFlashes: next };
    });
  },

  removeTileFlash: (key) => {
    set((state) => {
      const next = new Map(state.tileFlashes);
      next.delete(key);
      return { tileFlashes: next };
    });
  },
}));
