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
  | { type: 'LEVEL_UP' };

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
  projectiles: Projectile[];
}

interface CombatAnimationActions {
  setUnitAnimation: (unitId: string, anim: UnitAnimationState | null) => void;
  addProjectile: (p: Projectile) => void;
  removeProjectile: (id: string) => void;
}

type CombatAnimationStore = CombatAnimationState & CombatAnimationActions;

// ============================================================================
// STORE
// ============================================================================

export const useCombatAnimationStore = create<CombatAnimationStore>((set) => ({
  unitAnimations: new Map(),
  projectiles: [],

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

  addProjectile: (p) => {
    set((state) => ({ projectiles: [...state.projectiles, p] }));
  },

  removeProjectile: (id) => {
    set((state) => ({
      projectiles: state.projectiles.filter((p) => p.id !== id),
    }));
  },
}));
