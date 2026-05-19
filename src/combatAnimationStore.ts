/**
 * Zustand store that drives combat animation visuals.
 * Completely separate from gameStore — no game logic here.
 */

import { create } from 'zustand';
import type { Faction, UnitType } from './types';

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
  | { type: 'TRANSFORM_TO_DEMON'; durationMs: number }
  | { type: 'DEFECT_TO_ENEMY'; durationMs: number }
  /**
   * Ice-slide animation: unit visually appears at the frozen tile first,
   * then slides to its actual grid position (slide destination).
   * dx/dy are the pixel offsets from slide destination back to the frozen tile.
   */
  | { type: 'SLIDE'; dx: number; dy: number };

/**
 * A "ghost" unit animation played when a unit slides off an ice tile into a
 * lethal tile (LAVA, CANYON, WATER). The unit has already been removed from
 * game state, so this overlay renders its appearance purely for visual feedback.
 */
export interface SlideKillGhost {
  /** Unique ID for the ghost entry */
  id: string;
  /** Unit type, for sprite/emoji selection */
  unitType: UnitType;
  /** Faction, for sprite variant selection */
  faction: Faction;
  /** Grid position of the death tile */
  deathTileX: number;
  deathTileY: number;
  /** Pixel offset from death tile back to frozen tile (same semantics as SLIDE dx/dy) */
  slideDx: number;
  slideDy: number;
  /** Which phase of the animation this ghost is currently in */
  phase: 'slide' | 'dying' | 'falling';
}

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
  /** Ghost units rendered during slide-into-lethal-tile death animations */
  slideKillGhosts: Map<string, SlideKillGhost>;
}

interface CombatAnimationActions {
  setUnitAnimation: (unitId: string, anim: UnitAnimationState | null) => void;
  setBuildingAnimation: (buildingId: string, anim: BuildingAnimationState | null) => void;
  addProjectile: (p: Projectile) => void;
  removeProjectile: (id: string) => void;
  addTileFlash: (x: number, y: number, durationMs: number) => void;
  removeTileFlash: (key: string) => void;
  addSlideKillGhost: (ghost: SlideKillGhost) => void;
  setSlideKillGhostPhase: (id: string, phase: SlideKillGhost['phase']) => void;
  removeSlideKillGhost: (id: string) => void;
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
  slideKillGhosts: new Map(),

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

  addSlideKillGhost: (ghost) => {
    set((state) => {
      const next = new Map(state.slideKillGhosts);
      next.set(ghost.id, ghost);
      return { slideKillGhosts: next };
    });
  },

  setSlideKillGhostPhase: (id, phase) => {
    set((state) => {
      const ghost = state.slideKillGhosts.get(id);
      if (!ghost) return {};
      const next = new Map(state.slideKillGhosts);
      next.set(id, { ...ghost, phase });
      return { slideKillGhosts: next };
    });
  },

  removeSlideKillGhost: (id) => {
    set((state) => {
      const next = new Map(state.slideKillGhosts);
      next.delete(id);
      return { slideKillGhosts: next };
    });
  },
}));
