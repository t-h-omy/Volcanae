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

/**
 * A leash connection that is currently playing a "burst" defection VFX.
 * The pair is shown regardless of which unit is selected, until cleared.
 */
export interface LeashBurstPair {
  mageId: string;
  demonId: string;
  magePos: { x: number; y: number };
  demonPos: { x: number; y: number };
}

/**
 * A cleave slash VFX rendered as an expanding ring centred on the attacker.
 */
export interface CleaveVfx {
  id: string;
  /** Grid column of the attacker */
  cx: number;
  /** Grid row of the attacker */
  cy: number;
  durationMs: number;
}

export type TileVfxVariant =
  | 'BURROW_DUST'
  | 'STUN_BLOCKED_SHIELD'
  | 'DEFENSE_IGNORED'
  | 'SPELL_IMPACT'
  | 'SPELL_IMPACT_STUN'
  | 'SPELL_IMPACT_PORTAL_ENTER'
  | 'SPELL_IMPACT_PORTAL_EXIT'
  | 'SPELL_IMPACT_SPAWN_PLAYER'
  | 'SPELL_IMPACT_SPAWN_ENEMY'
  | 'SPELL_IMPACT_CAPTURE_PLAYER'
  | 'SPELL_IMPACT_CAPTURE_ENEMY'
  | 'BURNING_DAMAGE'
  | 'CORRUPTION_APPLIED'
  | 'INVALID_ACTION';

export interface TileVfx {
  id: string;
  /** Grid column of the affected tile */
  x: number;
  /** Grid row of the affected tile */
  y: number;
  variant: TileVfxVariant;
  durationMs: number;
}

export type LineVfxVariant =
  | 'FIRE_SPIT'
  | 'SPELL_CAST'
  | 'PIERCE_LINE';

export interface LineVfx {
  id: string;
  fromPx: { x: number; y: number };
  toPx: { x: number; y: number };
  variant: LineVfxVariant;
  durationMs: number;
}

interface CombatAnimationState {
  unitAnimations: Map<string, UnitAnimationState>;
  buildingAnimations: Map<string, BuildingAnimationState>;
  projectiles: Projectile[];
  /** Active per-tile flash bursts, keyed by "x,y" */
  tileFlashes: Map<string, { durationMs: number; variant?: string }>;
  /** Ghost units rendered during slide-into-lethal-tile death animations */
  slideKillGhosts: Map<string, SlideKillGhost>;
  /** Leash pairs that are visually "bursting" — shown always, ignoring selection */
  leashBurstPairs: LeashBurstPair[];
  /** Active cleave slash VFX */
  cleaveVfxList: CleaveVfx[];
  /** Active generic tile-anchored VFX */
  tileVfx: TileVfx[];
  /** Active generic line VFX */
  lineVfx: LineVfx[];
}

interface CombatAnimationActions {
  setUnitAnimation: (unitId: string, anim: UnitAnimationState | null) => void;
  setBuildingAnimation: (buildingId: string, anim: BuildingAnimationState | null) => void;
  addProjectile: (p: Projectile) => void;
  removeProjectile: (id: string) => void;
  addTileFlash: (x: number, y: number, durationMs: number, variant?: string) => void;
  removeTileFlash: (key: string) => void;
  addSlideKillGhost: (ghost: SlideKillGhost) => void;
  setSlideKillGhostPhase: (id: string, phase: SlideKillGhost['phase']) => void;
  removeSlideKillGhost: (id: string) => void;
  addLeashBurstPair: (pair: LeashBurstPair) => void;
  removeLeashBurstPair: (demonId: string) => void;
  addCleaveVfx: (vfx: CleaveVfx) => void;
  removeCleaveVfx: (id: string) => void;
  addTileVfx: (vfx: TileVfx) => void;
  removeTileVfx: (id: string) => void;
  addLineVfx: (vfx: LineVfx) => void;
  removeLineVfx: (id: string) => void;
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
  leashBurstPairs: [],
  cleaveVfxList: [],
  tileVfx: [],
  lineVfx: [],

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

  addTileFlash: (x, y, durationMs, variant) => {
    set((state) => {
      const next = new Map(state.tileFlashes);
      next.set(`${x},${y}`, { durationMs, ...(variant ? { variant } : {}) });
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

  addLeashBurstPair: (pair) => {
    set((state) => ({
      leashBurstPairs: [...state.leashBurstPairs, pair],
    }));
  },

  removeLeashBurstPair: (demonId) => {
    set((state) => ({
      leashBurstPairs: state.leashBurstPairs.filter((p) => p.demonId !== demonId),
    }));
  },

  addCleaveVfx: (vfx) => {
    set((state) => ({ cleaveVfxList: [...state.cleaveVfxList, vfx] }));
  },

  removeCleaveVfx: (id) => {
    set((state) => ({
      cleaveVfxList: state.cleaveVfxList.filter((v) => v.id !== id),
    }));
  },

  addTileVfx: (vfx) => {
    set((state) => ({ tileVfx: [...state.tileVfx, vfx] }));
  },

  removeTileVfx: (id) => {
    set((state) => ({ tileVfx: state.tileVfx.filter((v) => v.id !== id) }));
  },

  addLineVfx: (vfx) => {
    set((state) => ({ lineVfx: [...state.lineVfx, vfx] }));
  },

  removeLineVfx: (id) => {
    set((state) => ({ lineVfx: state.lineVfx.filter((v) => v.id !== id) }));
  },
}));
