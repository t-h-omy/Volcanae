/**
 * GridRenderer – renders the Volcanae 20×105 game grid with camera pan/drag,
 * sprite-based tile/unit/building rendering, HP bars, zoom, and click interaction.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useFloaterStore } from '../floaterStore';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import type { Projectile, SlideKillGhost, CleaveVfx, TileVfx, LineVfx } from '../combatAnimationStore';
import { useShockwaveStore } from '../shockwaveStore';
import { canCapture } from '../captureSystem';
import { getConstructionOptionsForTile } from '../constructionSystem';
import { MAP, UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TAG_INFO } from '../gameConfig';
import { getStrongholdEffectiveCap } from '../techSystem';
import { computeRecruitmentBuildingUsage, canBuildingEverRecruit } from '../resourceSystem';
import { ANIMATION } from '../animationConfig';
import { UI } from '../uiConfig';
import { RENDER } from '../renderConfig';
import { INPUT } from '../inputConfig';
import { computeLevelFromXp } from '../levelSystem';
import { useZoomStore } from '../zoomStore';
import { UNIT_SPRITE, BUILDING_SPRITE, TILE_SPRITE, TILE_STATUS_SPRITE, RESOURCE_SPRITE, ENEMY_BUILDING_SPRITE, PLAYER_BUILDING_SPRITE, TERRAIN_RESOURCE_SPRITE, CRYSTAL_CHAMBER_ACTIVE_SPRITE, ENEMY_UNIT_SPRITE, PLAYER_UNIT_SPRITE, TUNNEL_HOLE_SPRITE, TUNNEL_EARTHQUAKE_SPRITE, PORTAL_ENTRANCE_SPRITE, PORTAL_EXIT_SPRITE } from '../assetRegistry';
import MissingSprite from './MissingSprite';
import {
  Faction,
  UnitType,
  UnitTag,
  BuildingType,
  TileType,
  TileStatus,
  type Tile,
  type Unit,
  type Building,
} from '../types';
import { isTileWithinEdgeCircleRange } from '../rangeUtils';
import { canUnitMove, getMovableTiles, canUnitAttack, getAttackTargets, canUnitConstruct, canUnitCapture, hasUnitActed, getHealTargets } from '../unitActions';
import { getValidSpellTargets } from '../spellSystem';
import { MAGE } from '../gameConfig';
import './GridRenderer.css';

// ============================================================================
// HELPERS
// ============================================================================

function useTileSize(): number {
  const [baseSize, setBaseSize] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
      ? RENDER.TILE_SIZE_MOBILE
      : RENDER.TILE_SIZE_DESKTOP,
  );

  useEffect(() => {
    const onResize = () => {
      setBaseSize(
        window.innerWidth <= RENDER.MOBILE_BREAKPOINT
          ? RENDER.TILE_SIZE_MOBILE
          : RENDER.TILE_SIZE_DESKTOP,
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Zoom is applied via CSS transform scale on the grid container rather than
  // changing tile sizes, so tileSize stays at the base (unzoomed) value.
  return baseSize;
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Returns set of "x,y" keys for tiles that are attackable by the selected player unit.
 *  Includes tiles with enemy units and tiles with enemy buildings (no unit on the tile). */
/** Returns set of "x,y" keys for tiles an enemy unit or enemy building occupies that are
 *  within attack range of a player-owned attacking building (e.g. watchtower). */
function getBuildingAttackableTileKeys(
  building: Building,
  units: Record<string, Unit>,
  buildings: Record<string, Building>,
): Set<string> {
  const keys = new Set<string>();
  if (!building.combatStats || building.faction !== Faction.PLAYER || building.hasAttackedThisTurn) return keys;

  // Enemy units in range
  for (const other of Object.values(units)) {
    if (other.faction === Faction.ENEMY) {
      const inRange = isTileWithinEdgeCircleRange(
        building.position.x, building.position.y,
        other.position.x, other.position.y,
        building.combatStats.attackRange,
      );
      if (inRange) {
        keys.add(posKey(other.position.x, other.position.y));
      }
    }
  }

  // Enemy buildings in range (skip tiles that already have an enemy unit — unit takes priority)
  for (const other of Object.values(buildings)) {
    if (other.faction === Faction.ENEMY && other.combatStats !== null && other.id !== building.id) {
      const key = posKey(other.position.x, other.position.y);
      if (keys.has(key)) continue; // unit on this tile already takes priority
      const inRange = isTileWithinEdgeCircleRange(
        building.position.x, building.position.y,
        other.position.x, other.position.y,
        building.combatStats.attackRange,
      );
      if (inRange) {
        keys.add(key);
      }
    }
  }

  return keys;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function GridRenderer() {
  // ── Store selectors ──
  const grid = useGameStore((s) => s.grid);
  const units = useGameStore((s) => s.units);
  const buildings = useGameStore((s) => s.buildings);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);

  const selectUnit = useGameStore((s) => s.selectUnit);
  const selectBuilding = useGameStore((s) => s.selectBuilding);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const selectTile = useGameStore((s) => s.selectTile);
  const moveUnit = useGameStore((s) => s.moveUnit);
  const attackUnit = useGameStore((s) => s.attackUnit);
  const attackBuilding = useGameStore((s) => s.attackBuilding);
  const buildingAttackUnit = useGameStore((s) => s.buildingAttackUnit);
  const buildingAttackBuilding = useGameStore((s) => s.buildingAttackBuilding);
  const healUnit = useGameStore((s) => s.healUnit);
  const pendingHealerId = useGameStore((s) => s.pendingHealerId);
  const cancelHealMode = useGameStore((s) => s.cancelHealMode);
  const pendingSpellCast = useGameStore((s) => s.pendingSpellCast);
  const pendingTransposeFirstUnitId = useGameStore((s) => s.pendingTransposeFirstUnitId);
  const cancelSpellCast = useGameStore((s) => s.cancelSpellCast);
  const castSpell = useGameStore((s) => s.castSpell);
  const strongholdTotalCap = useGameStore((s) => getStrongholdEffectiveCap(s).totalCap);
  const portals = useGameStore((s) => s.portals);
  // Precompute recruitment usage (current/limit) for each player-owned recruitment building type.
  // Uses stable s.units / s.buildings selectors + useMemo so the result object is only
  // recreated when actual unit or building state changes — avoids an infinite re-render loop
  // that would occur if the selector returned a new object reference on every call.
  const _recruitUnits = useGameStore((s) => s.units);
  const _recruitBuildings = useGameStore((s) => s.buildings);
  const recruitmentUsage = useMemo(() => {
    const result: Partial<Record<BuildingType, { current: number; limit: number }>> = {};
    const recruitingTypes = [
      BuildingType.STRONGHOLD,
      BuildingType.BARRACKS,
      BuildingType.ARCHER_CAMP,
      BuildingType.RIDER_CAMP,
      BuildingType.SIEGE_CAMP,
      BuildingType.CRYSTAL_CHAMBER,
    ] as BuildingType[];
    for (const bt of recruitingTypes) {
      if (BUILDING_DEFINITIONS[bt]?.unitLimit !== undefined) {
        result[bt] = computeRecruitmentBuildingUsage(
          { units: _recruitUnits, buildings: _recruitBuildings },
          bt,
        );
      }
    }
    return result;
  }, [_recruitUnits, _recruitBuildings]);

  // ── Animation store selectors ──
  const isAnimating = useAnimationStore((s) => s.isAnimating);
  const cameraTarget = useAnimationStore((s) => s.cameraTarget);

  // ── Zoom store ──
  // Subscribe to zoom for rendering; mutations go through getState() to avoid extra subscriptions.
  const zoom = useZoomStore((s) => s.zoom);

  const tileSize = useTileSize();
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Pinch-to-zoom state ──
  const pinchState = useRef<{
    active: boolean;
    prevDist: number;
    prevMidX: number;
    prevMidY: number;
    pointers: Map<number, { x: number; y: number }>;
  }>({ active: false, prevDist: 0, prevMidX: 0, prevMidY: 0, pointers: new Map() });

  // ── Camera drag state ──
  const dragState = useRef({
    isDragging: false,
    isDragActive: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    lastMoveTime: 0,
    lastMoveX: 0,
    lastMoveY: 0,
    velocityX: 0,
    velocityY: 0,
  });
  // Tracks whether the last RMB press resulted in a drag (used by contextmenu handler)
  const rmbWasDragging = useRef(false);
  // rAF handle for touch inertia; cancelled when a new drag starts
  const inertiaRaf = useRef<number | null>(null);

  // Offset the inner container; we store actual scroll position internally
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Keep a ref to the latest offset so it can be read synchronously in effects
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // Helper: zoom to a new value and adjust offset so the given focal point (in viewport px)
  // stays fixed on screen. Call this for wheel and button zooming.
  const applyZoom = useCallback((newZoom: number, focalX: number, focalY: number) => {
    const clampedZoom = Math.min(RENDER.ZOOM_MAX, Math.max(RENDER.ZOOM_MIN, newZoom));
    const oldZoom = useZoomStore.getState().zoom;
    const ratio = clampedZoom / oldZoom;
    const { x: ox, y: oy } = offsetRef.current;
    setOffset({ x: focalX - (focalX - ox) * ratio, y: focalY - (focalY - oy) * ratio });
    useZoomStore.getState().setZoom(clampedZoom);
  }, [setOffset]);

  // ── Mouse wheel zoom (zooms around cursor position) ──
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const oldZoom = useZoomStore.getState().zoom;
      const delta = e.deltaY < 0 ? +RENDER.ZOOM_STEP : -RENDER.ZOOM_STEP;
      applyZoom(oldZoom + delta, e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, [applyZoom]);

  // Zoom buttons: step zoom around the viewport centre.
  const handleZoomButton = useCallback((delta: number) => {
    const vp = viewportRef.current;
    if (vp) applyZoom(useZoomStore.getState().zoom + delta, vp.clientWidth / 2, vp.clientHeight / 2);
  }, [applyZoom]);

  // Saves the camera position just before animations begin so it can be restored afterwards
  const preAnimationOffsetRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (isAnimating) {
      // Animation starting — capture the current camera position
      preAnimationOffsetRef.current = offsetRef.current;
    } else {
      // Animation ended — restore the camera to where it was before
      if (preAnimationOffsetRef.current) {
        setOffset(preAnimationOffsetRef.current);
        preAnimationOffsetRef.current = null;
      }
    }
  }, [isAnimating]);

  // Set the CSS custom property for camera transition duration once on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty('--camera-move-duration', `${ANIMATION.CAMERA_MOVE_DURATION_MS}ms`);
    }
  }, []);

  // When camera target changes, update offset to center viewport on target.
  // Zoom is intentionally NOT a dependency: we don't re-centre during pinch/wheel
  // zoom — those handlers adjust offset themselves to keep the focal point fixed.
  useEffect(() => {
    const viewportEl = viewportRef.current;
    if (!viewportEl) return;
    const viewportW = viewportEl.clientWidth;
    const viewportH = viewportEl.clientHeight;
    const currentZoom = useZoomStore.getState().zoom;
    setOffset({
      x: viewportW / 2 - (cameraTarget.x * tileSize + tileSize / 2) * currentZoom,
      y: viewportH / 2 - (cameraTarget.y * tileSize + tileSize / 2) * currentZoom,
    });
  }, [cameraTarget, tileSize]);

  // ── Pan / Drag handlers ──
  // On desktop: drag is activated only while RMB is held.
  // On touch / pen: drag is activated by primary pointer (finger).
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isAnimating) return; // Lock drag during animation

      const isTouch = e.pointerType === 'touch';
      const isRMB = e.button === 2;

      // ── Pinch tracking ──
      if (isTouch) {
        const ps = pinchState.current;
        ps.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ps.pointers.size === 2) {
          const pts = Array.from(ps.pointers.values());
          const startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          ps.prevDist = startDist;
          ps.prevMidX = (pts[0].x + pts[1].x) / 2;
          ps.prevMidY = (pts[0].y + pts[1].y) / 2;
          ps.active = true;
          // Capture both pointers so move events aren't lost if fingers move off the element.
          // We use e.currentTarget (the viewport div) as the capture target so both pointers
          // route to the same element regardless of which child was under each finger.
          const vpEl = e.currentTarget as HTMLElement;
          for (const [pid] of ps.pointers) {
            vpEl.setPointerCapture?.(pid);
          }
          // Cancel any active pan drag — we're switching to pinch
          dragState.current.isDragActive = false;
          // Suppress CSS transition during pinch
          if (containerRef.current) containerRef.current.classList.add('no-transition');
          // Cancel any ongoing inertia
          if (inertiaRaf.current !== null) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
          }
          return; // don't start a drag during pinch
        }
      }

      // Reset isDragging on any pointer-down so a post-drag LMB click isn't blocked
      dragState.current.isDragging = false;

      const shouldDrag = isRMB || (isTouch && e.isPrimary);
      if (!shouldDrag) return;

      // Cancel any ongoing inertia scroll before starting a new drag
      if (inertiaRaf.current !== null) {
        cancelAnimationFrame(inertiaRaf.current);
        inertiaRaf.current = null;
      }

      // Suppress the CSS transition while the user is panning manually
      if (containerRef.current) containerRef.current.classList.add('no-transition');

      dragState.current = {
        isDragging: false,
        isDragActive: true,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: offset.x,
        scrollTop: offset.y,
        lastMoveTime: performance.now(),
        lastMoveX: e.clientX,
        lastMoveY: e.clientY,
        velocityX: 0,
        velocityY: 0,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [offset, isAnimating],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // ── Pinch-to-zoom ──
    if (e.pointerType === 'touch') {
      const ps = pinchState.current;
      if (ps.pointers.has(e.pointerId)) {
        ps.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (ps.active && ps.pointers.size === 2) {
        const pts = Array.from(ps.pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mx = (pts[0].x + pts[1].x) / 2;
        const my = (pts[0].y + pts[1].y) / 2;

        if (ps.prevDist > 0) {
          // Incremental zoom: scale relative to the previous frame so the
          // pinch midpoint stays fixed under both fingers.
          const oldZoom = useZoomStore.getState().zoom;
          const newZoom = Math.min(RENDER.ZOOM_MAX, Math.max(RENDER.ZOOM_MIN, oldZoom * (dist / ps.prevDist)));
          const ratio = newZoom / oldZoom;

          // Adjust offset so the element under prevMid stays under curMid after scaling.
          // Formula: newOffset = curMid - (prevMid - oldOffset) * (newZoom / oldZoom)
          const { x: ox, y: oy } = offsetRef.current;
          const newOx = mx - (ps.prevMidX - ox) * ratio;
          const newOy = my - (ps.prevMidY - oy) * ratio;

          useZoomStore.getState().setZoom(newZoom);
          setOffset({ x: newOx, y: newOy });
        }

        ps.prevDist = dist;
        ps.prevMidX = mx;
        ps.prevMidY = my;
        return; // don't pan while pinching
      }
    }

    const ds = dragState.current;
    if (!ds.isDragActive) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.isDragging && Math.abs(dx) + Math.abs(dy) > 4) {
      ds.isDragging = true;
    }
    if (ds.isDragging) {
      setOffset({ x: ds.scrollLeft + dx, y: ds.scrollTop + dy });

      // Sample velocity for touch inertia using exponential moving average
      // so the lift-off velocity reflects the recent motion, not just the
      // last (potentially tiny) event delta.
      if (e.pointerType === 'touch') {
        const now = performance.now();
        const dt = now - ds.lastMoveTime;
        if (dt > 0) {
          const instantVx = (e.clientX - ds.lastMoveX) / dt;
          const instantVy = (e.clientY - ds.lastMoveY) / dt;
          // alpha grows with dt so a long gap fully replaces the stored value
          const alpha = Math.min(1, dt / 50);
          ds.velocityX = alpha * instantVx + (1 - alpha) * ds.velocityX;
          ds.velocityY = alpha * instantVy + (1 - alpha) * ds.velocityY;
        }
        ds.lastMoveTime = now;
        ds.lastMoveX = e.clientX;
        ds.lastMoveY = e.clientY;
      }
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    // ── Pinch cleanup ──
    if (e.pointerType === 'touch') {
      const ps = pinchState.current;
      ps.pointers.delete(e.pointerId);
      if (ps.active) {
        ps.active = false;
        // Restore CSS transition once pinch gesture ends
        if (containerRef.current) containerRef.current.classList.remove('no-transition');
        return;
      }
    }

    const ds = dragState.current;
    if (!ds.isDragActive) return;
    // Capture drag state before clearing, so the contextmenu handler can read it
    if (e.pointerType === 'mouse' && e.button === 2) {
      rmbWasDragging.current = ds.isDragging;
    }
    ds.isDragActive = false;
    // isDragging intentionally not reset here – onClick checks it to skip post-drag clicks

    // Start inertia scroll for touch swipes
    if (e.pointerType === 'touch' && ds.isDragging) {
      // Keep no-transition active during inertia to prevent CSS transitions from
      // stacking on every setOffset call. Remove it only when inertia has ended.
      let vx = ds.velocityX;
      let vy = ds.velocityY;
      let lastTime = performance.now();

      const inertiaFrame = (now: number) => {
        const dt = Math.min(now - lastTime, 32); // cap to avoid large jumps on tab-switch
        lastTime = now;

        const dx = vx * dt;
        const dy = vy * dt;

        const current = offsetRef.current;
        setOffset({ x: current.x + dx, y: current.y + dy });

        // Time-based decay: consistent deceleration regardless of frame rate
        const decayFactor = Math.pow(INPUT.SWIPE_FRICTION, dt / 16.67);
        vx *= decayFactor;
        vy *= decayFactor;

        if (Math.abs(vx) > INPUT.SWIPE_MIN_VELOCITY || Math.abs(vy) > INPUT.SWIPE_MIN_VELOCITY) {
          inertiaRaf.current = requestAnimationFrame(inertiaFrame);
        } else {
          inertiaRaf.current = null;
          // Restore the CSS transition now that inertia has fully ended
          if (containerRef.current) containerRef.current.classList.remove('no-transition');
        }
      };

      inertiaRaf.current = requestAnimationFrame(inertiaFrame);
    } else {
      // Non-touch drag (RMB) or touch tap without drag: restore CSS transition immediately
      if (containerRef.current) containerRef.current.classList.remove('no-transition');
    }
  }, []);

  // ── Reachable / Attackable sets ──
  const selectedUnit = selectedUnitId ? units[selectedUnitId] : undefined;
  const selectedBuilding = selectedBuildingId ? buildings[selectedBuildingId] : undefined;

  const reachableSet = useMemo<Set<string>>(() => {
    if (!selectedUnit || selectedUnit.faction !== Faction.PLAYER) return new Set();
    return getMovableTiles(selectedUnit, useGameStore.getState());
  }, [selectedUnit]);

  const attackableSet = useMemo<Set<string>>(() => {
    // Unit attack range (enemy units and enemy buildings)
    if (selectedUnit && selectedUnit.faction === Faction.PLAYER) {
      return getAttackTargets(selectedUnit, units, buildings, grid);
    }
    // Building attack range (e.g. player watchtower)
    if (selectedBuilding && selectedBuilding.combatStats && selectedBuilding.faction === Faction.PLAYER) {
      return getBuildingAttackableTileKeys(selectedBuilding, units, buildings);
    }
    return new Set();
  }, [selectedUnit, selectedBuilding, units, buildings, grid]);

  // Heal target highlighting: when a healer is in heal-mode, show healable tiles
  const healableSet = useMemo<Set<string>>(() => {
    if (!pendingHealerId) return new Set();
    const targets = getHealTargets(useGameStore.getState(), pendingHealerId);
    const set = new Set<string>();
    for (const tid of targets) {
      const u = units[tid];
      if (u) set.add(posKey(u.position.x, u.position.y));
    }
    return set;
  }, [pendingHealerId, units]);

  // Spell target highlighting: when a spell cast is pending, show valid target tiles
  const spellTargetSet = useMemo<Set<string>>(() => {
    if (!pendingSpellCast) return new Set();
    const targets = getValidSpellTargets(
      useGameStore.getState(),
      pendingSpellCast.mageId,
      pendingSpellCast.spellId,
    );
    const set = new Set<string>();
    for (const p of targets) set.add(posKey(p.x, p.y));
    return set;
  }, [pendingSpellCast, pendingTransposeFirstUnitId, units, buildings, grid]);

  // Leash visual: when a Mage (with leashed demons) or an Ember Demon is selected,
  // highlight both the demon tile and the mage tile.
  const leashSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!selectedUnit) return set;
    if (selectedUnit.type === UnitType.MAGE) {
      // Find all leashed demons controlled by this mage
      for (const u of Object.values(units)) {
        if (u.type === UnitType.EMBER_DEMON && u.controllerMageId === selectedUnit.id) {
          set.add(posKey(u.position.x, u.position.y));
          set.add(posKey(selectedUnit.position.x, selectedUnit.position.y));
        }
      }
    } else if (selectedUnit.type === UnitType.EMBER_DEMON && selectedUnit.controllerMageId) {
      const mage = units[selectedUnit.controllerMageId];
      if (mage) {
        set.add(posKey(selectedUnit.position.x, selectedUnit.position.y));
        set.add(posKey(mage.position.x, mage.position.y));
      }
    }
    return set;
  }, [selectedUnit, units]);

  // Leash-warn set: tiles that are at risk (mage is out of leash range of demon)
  const leashWarnSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!selectedUnit) return set;
    let mage: typeof selectedUnit | undefined;
    let demons: (typeof selectedUnit)[] = [];
    if (selectedUnit.type === UnitType.MAGE) {
      mage = selectedUnit;
      demons = Object.values(units).filter(
        (u) => u.type === UnitType.EMBER_DEMON && u.controllerMageId === selectedUnit.id,
      );
    } else if (selectedUnit.type === UnitType.EMBER_DEMON && selectedUnit.controllerMageId) {
      mage = units[selectedUnit.controllerMageId];
      demons = [selectedUnit];
    }
    if (!mage) return set;
    for (const demon of demons) {
      const inRange = isTileWithinEdgeCircleRange(
        mage.position.x, mage.position.y,
        demon.position.x, demon.position.y,
        MAGE.EMBER_DEMON_LEASH_RANGE,
      );
      if (!inRange) {
        set.add(posKey(demon.position.x, demon.position.y));
        set.add(posKey(mage.position.x, mage.position.y));
      }
    }
    return set;
  }, [selectedUnit, units]);

  // Slide preview: for each FROZEN destination in the reachable set, compute
  // where the unit would slide to and highlight that secondary destination.
  // Direction is sign(frozenTile - unit), which is identical to what moveUnit
  // computes as moveDx/moveDy — so the preview always matches the actual slide.
  const slidePreviewSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!selectedUnit || selectedUnit.faction !== Faction.PLAYER) return set;
    for (const key of reachableSet) {
      const [kx, ky] = key.split(',').map(Number);
      const tile = grid[ky]?.[kx];
      if (!tile || tile.status !== TileStatus.FROZEN) continue;
      // Implied slide direction: from unit position toward this frozen destination
      const dx = Math.sign(kx - selectedUnit.position.x);
      const dy = Math.sign(ky - selectedUnit.position.y);
      if (dx === 0 && dy === 0) continue; // same tile (shouldn't happen)
      const slideX = kx + dx;
      const slideY = ky + dy;
      if (slideX < 0 || slideX >= MAP.GRID_WIDTH || slideY < 0 || slideY >= MAP.GRID_HEIGHT) continue;
      const slideDest = grid[slideY]?.[slideX];
      if (!slideDest) continue;
      // Mirror the resolveSlide blocking conditions so the preview matches actual behaviour.
      // A unit on the slide destination means the slide would be blocked — skip.
      if (slideDest.unitId !== null) continue;
      // A combat building (combatStats !== null, except neutral Watchtower) blocks the slide.
      if (slideDest.buildingId !== null) {
        const bld = buildings[slideDest.buildingId];
        if (bld && bld.combatStats !== null) {
          const isNeutralWatchtower = bld.type === BuildingType.WATCHTOWER && bld.faction === null;
          if (!isNeutralWatchtower) continue;
        }
      }
      set.add(`${slideX},${slideY}`);
    }
    return set;
  }, [selectedUnit, reachableSet, grid, buildings]);

  // ── Tunnel visualization sets ──
  const tunnelHoleSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const unit of Object.values(units)) {
      if (!unit.tunnelStartPosition) continue;
      if (unit.tunnelState === 'DIGGING_IN' || unit.tunnelState === 'UNDERGROUND') {
        set.add(`${unit.tunnelStartPosition.x},${unit.tunnelStartPosition.y}`);
      }
    }
    return set;
  }, [units]);

  const earthquakeSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const unit of Object.values(units)) {
      if (!unit.tunnelPlannedEmergence) continue;
      if (unit.tunnelState === 'EMERGING') {
        set.add(`${unit.tunnelPlannedEmergence.x},${unit.tunnelPlannedEmergence.y}`);
      }
    }
    return set;
  }, [units]);

  // ── Portal visualization sets ──
  const portalEntranceSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const portal of Object.values(portals)) {
      set.add(`${portal.entrancePos.x},${portal.entrancePos.y}`);
    }
    return set;
  }, [portals]);

  const portalExitSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const portal of Object.values(portals)) {
      set.add(`${portal.exitPos.x},${portal.exitPos.y}`);
    }
    return set;
  }, [portals]);

  // ── Tile click ──
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (dragState.current.isDragging) return;
      if (isAnimating) return; // Lock clicks during animation

      const tile = grid[y][x];
      const key = posKey(x, y);

      // Priority 0 — Heal mode: if waiting for heal target selection
      if (pendingHealerId && healableSet.has(key) && tile.unitId) {
        healUnit(pendingHealerId, tile.unitId);
        return;
      }
      if (pendingHealerId) {
        // Clicked outside healable tiles — cancel heal mode
        cancelHealMode();
        return;
      }

      // Priority 0.5 — Spell cast mode: clicking a valid target casts the spell; anything else cancels
      if (pendingSpellCast && spellTargetSet.has(key)) {
        castSpell({ x, y });
        return;
      }
      if (pendingSpellCast) {
        // Provide feedback when clicking a blocked EMBERBIND or RAISE_SKELETON target
        // (e.g. an embernest or gravestone with a unit on it).
        if (pendingSpellCast.spellId === 'EMBERBIND' && tile.buildingId) {
          const b = buildings[tile.buildingId];
          if (b?.type === BuildingType.EMBERNEST && tile.unitId) {
            useFloaterStore.getState().addFloater({
              value: 0,
              label: '🚫 Occupied',
              x,
              y,
              isEnemy: false,
              floaterType: 'damage',
            });
            return;
          }
        }
        if (pendingSpellCast.spellId === 'RAISE_SKELETON' && tile.buildingId) {
          const b = buildings[tile.buildingId];
          if (b?.type === BuildingType.GRAVESTONE && tile.unitId) {
            useFloaterStore.getState().addFloater({
              value: 0,
              label: '🚫 Occupied',
              x,
              y,
              isEnemy: false,
              floaterType: 'damage',
            });
            return;
          }
        }
        cancelSpellCast();
        return;
      }

      // Priority 1 — Own player unit on tile
      // Cycle: if this unit is already selected and there is also a building → select the building
      if (tile.unitId) {
        const u = units[tile.unitId];
        if (u && u.faction === Faction.PLAYER) {
          if (selectedUnitId === tile.unitId && tile.buildingId) {
            selectBuilding(tile.buildingId);
          } else {
            selectUnit(tile.unitId);
          }
          return;
        }
      }

      // Priority 2 — Enemy unit on tile, valid attack available (unit or building attack)
      // Priority 3 — Enemy unit on tile, no valid attack: select for inspection
      // Cycle: if this enemy unit is already selected and there is also a building → select the building
      if (tile.unitId) {
        const u = units[tile.unitId];
        if (u && u.faction === Faction.ENEMY) {
          // Unit attack
          if (
            selectedUnit &&
            canUnitAttack(selectedUnit) &&
            attackableSet.has(key)
          ) {
            attackUnit(selectedUnit.id, tile.unitId);
            return;
          }
          // Building attack (e.g. player watchtower attacking enemy unit)
          if (
            selectedBuilding &&
            selectedBuilding.combatStats &&
            selectedBuilding.faction === Faction.PLAYER &&
            !selectedBuilding.hasAttackedThisTurn &&
            attackableSet.has(key)
          ) {
            buildingAttackUnit(selectedBuilding.id, tile.unitId);
            return;
          }
          if (selectedUnitId === tile.unitId && tile.buildingId) {
            selectBuilding(tile.buildingId);
          } else {
            selectUnit(tile.unitId);
          }
          return;
        }
      }

      // Priority 4 — Tile in movement range, unit can still move
      if (
        selectedUnit &&
        canUnitMove(selectedUnit) &&
        reachableSet.has(key)
      ) {
        moveUnit(selectedUnit.id, { x, y });
        return;
      }

      // Priority 5a — Enemy building on tile (no enemy unit), player unit or player building can attack it
      if (tile.buildingId) {
        const b = buildings[tile.buildingId];
        if (b && b.faction === Faction.ENEMY && attackableSet.has(key)) {
          // Player unit attacks the building
          if (
            selectedUnit &&
            selectedUnit.faction === Faction.PLAYER &&
            canUnitAttack(selectedUnit)
          ) {
            attackBuilding(selectedUnit.id, tile.buildingId);
            return;
          }
          // Player building (e.g. watchtower) attacks the enemy building
          if (
            selectedBuilding &&
            selectedBuilding.combatStats &&
            selectedBuilding.faction === Faction.PLAYER &&
            !selectedBuilding.hasAttackedThisTurn
          ) {
            buildingAttackBuilding(selectedBuilding.id, tile.buildingId);
            return;
          }
        }
      }

      // Priority 5b — Building on tile, select it
      // Cycle: if this building is already selected and there is also a unit → select the unit
      if (tile.buildingId) {
        if (selectedBuildingId === tile.buildingId && tile.unitId) {
          selectUnit(tile.unitId);
        } else {
          selectBuilding(tile.buildingId);
        }
        return;
      }

      // Priority 6 — Fallback: select the terrain tile if revealed, otherwise clear selection
      if (tile.isRevealed && !tile.isLava) {
        selectTile({ x, y });
      } else {
        clearSelection();
      }
    },
    [grid, selectedUnitId, selectedBuildingId, selectedUnit, selectedBuilding, attackableSet, healableSet, spellTargetSet, reachableSet, units, buildings, selectUnit, selectBuilding, selectTile, clearSelection, moveUnit, attackUnit, attackBuilding, buildingAttackUnit, buildingAttackBuilding, healUnit, pendingHealerId, cancelHealMode, pendingSpellCast, castSpell, cancelSpellCast, isAnimating],
  );

  // Right-click / tap-hold → deselect (only when not used for drag-panning)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!rmbWasDragging.current) {
        clearSelection();
      }
      rmbWasDragging.current = false;
    },
    [clearSelection],
  );

  // Long-press for touch deselect
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      clearSelection();
    }, 500);
  }, [clearSelection]);
  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ── Render ──
  const gridWidth = MAP.GRID_WIDTH * tileSize;
  const gridHeight = MAP.GRID_HEIGHT * tileSize;

  return (
    <div
      className="grid-viewport"
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={handleContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className="grid-container"
        ref={containerRef}
        style={{
          width: gridWidth,
          height: gridHeight,
          gridTemplateColumns: `repeat(${MAP.GRID_WIDTH}, ${tileSize}px)`,
          gridTemplateRows: `repeat(${MAP.GRID_HEIGHT}, ${tileSize}px)`,
          // Zoom is applied as a CSS scale (GPU-composited, no layout recalculation).
          // transform-origin is set to 0 0 so the scale is anchored at the container
          // origin, matching the offset arithmetic used throughout this component.
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {grid.map((row, y) =>
          row.map((tile, x) => {
            const building = tile.buildingId ? buildings[tile.buildingId] : undefined;
            const unit = tile.unitId ? units[tile.unitId] : undefined;
            const key = posKey(x, y);
            const isReachable = reachableSet.has(key);
            const isAttackable = attackableSet.has(key);
            const isHealable = healableSet.has(key);
            const isSpellTarget = spellTargetSet.has(key);
            const isLeashed = leashSet.has(key);
            const isLeashWarn = leashWarnSet.has(key);
            const isSlidePreview = slidePreviewSet.has(key);
            const isTunnelHole = tunnelHoleSet.has(key);
            const isEarthquakeIndicator = earthquakeSet.has(key);
            const isPortalEntrance = portalEntranceSet.has(key);
            const isPortalExit = portalExitSet.has(key);
            const isSelected =
              (tile.unitId != null && tile.unitId === selectedUnitId) ||
              (tile.buildingId != null && tile.buildingId === selectedBuildingId);

            return (
              <TileCell
                key={key}
                tile={tile}
                unit={unit}
                building={building}
                tileSize={tileSize}
                isReachable={isReachable}
                isAttackable={isAttackable}
                isHealable={isHealable}
                isSpellTarget={isSpellTarget}
                isLeashed={isLeashed}
                isLeashWarn={isLeashWarn}
                isSlidePreview={isSlidePreview}
                isSelected={isSelected}
                strongholdTotalCap={strongholdTotalCap}
                recruitmentUsage={recruitmentUsage}
                onClick={() => handleTileClick(x, y)}
                isTunnelHole={isTunnelHole}
                isEarthquakeIndicator={isEarthquakeIndicator}
                isPortalEntrance={isPortalEntrance}
                isPortalExit={isPortalExit}
              />
            );
          }),
        )}
        <CaptureIndicatorLayer tileSize={tileSize} />
        <BuildIndicatorLayer tileSize={tileSize} />
        <LevelUpIndicatorLayer tileSize={tileSize} />
        <DamageFloaterLayer tileSize={tileSize} />
        <LeashLineLayer tileSize={tileSize} />
        <CrystalTowerConnectionLayer tileSize={tileSize} />
        <ProjectileLayer />
        <SlideKillGhostLayer tileSize={tileSize} />
        <ShockwaveLayer />
        <CleaveVfxLayer tileSize={tileSize} />
        <TileVfxLayer tileSize={tileSize} />
        <LineVfxLayer tileSize={tileSize} />
      </div>
      <div className="zoom-controls">
        <button onClick={() => handleZoomButton(-RENDER.ZOOM_STEP)}>−</button>
        <button onClick={() => handleZoomButton(+RENDER.ZOOM_STEP)}>+</button>
      </div>
    </div>
  );
}

// ============================================================================
// TILE CELL (memoised)
// ============================================================================

interface TileCellProps {
  tile: Tile;
  unit: Unit | undefined;
  building: Building | undefined;
  tileSize: number;
  isReachable: boolean;
  isAttackable: boolean;
  isHealable: boolean;
  isSpellTarget: boolean;
  isLeashed: boolean;
  isLeashWarn: boolean;
  /** Whether this tile is the predicted slide destination from an adjacent FROZEN tile. */
  isSlidePreview: boolean;
  isSelected: boolean;
  /** Pre-computed total population cap for STRONGHOLD buildings (farmers + nobles, including tech mods). */
  strongholdTotalCap: number;
  /** Pre-computed recruitment usage per building type (current units / cap). */
  recruitmentUsage: Partial<Record<BuildingType, { current: number; limit: number }>>;
  onClick: () => void;
  /** True when a TUNNEL unit is DIGGING_IN or UNDERGROUND here — show hole sprite. */
  isTunnelHole: boolean;
  /** True when a TUNNEL unit is EMERGING here — show earthquake indicator. */
  isEarthquakeIndicator: boolean;
  /** True when an active portal entrance is on this tile. */
  isPortalEntrance: boolean;
  /** True when an active portal exit is on this tile. */
  isPortalExit: boolean;
}

function TileCellInner({
  tile,
  unit,
  building,
  tileSize,
  isReachable,
  isAttackable,
  isHealable,
  isSpellTarget,
  isLeashed,
  isLeashWarn,
  isSlidePreview,
  isSelected,
  strongholdTotalCap,
  recruitmentUsage,
  onClick,
  isTunnelHole,
  isEarthquakeIndicator,
  isPortalEntrance,
  isPortalExit,
}: TileCellProps) {
  const buildingIconSize = tileSize;

  // ── Tile sprite path ──
  // Ruin tiles use the underlying terrain as their base; the ruin graphic is
  // rendered as a separate overlay so its transparent areas show the ground.
  // When the tile has an active status and a dedicated status sprite exists for
  // that terrain+status combination, it replaces the plain base terrain sprite.
  const tileStatusSpritePath: string | undefined =
    tile.isRevealed && tile.status
      ? TILE_STATUS_SPRITE[tile.terrainType]?.[tile.status]
      : undefined;
  const tileSpritePath: string | undefined = tile.isLava
    ? TILE_SPRITE['lava']
    : !tile.isRevealed
      ? TILE_SPRITE['unrevealed']
      : (tileStatusSpritePath ?? TILE_SPRITE[tile.terrainType]);

  // ── Ruin overlay sprite (rendered on top of terrain, like a building) ──
  const ruinSpritePath: string | undefined = tile.isRevealed
    ? tile.isStrongholdRuin
      ? TILE_SPRITE['strongholdRuin']
      : tile.isRuin
        ? TILE_SPRITE['ruin']
        : undefined
    : undefined;

  const [tileSpriteError, setTileSpriteError] = useState(false);
  const [ruinSpriteError, setRuinSpriteError] = useState(false);
  const showTileImg = typeof tileSpritePath === 'string' && tileSpritePath !== '' && !tileSpriteError;
  const showRuinOverlay = typeof ruinSpritePath === 'string' && ruinSpritePath !== '' && !ruinSpriteError;

  // Lava preview overlay (only on discovered tiles)
  const overlay =
    tile.isRevealed && tile.isLavaPreview && !tile.isLava
      ? RENDER.COLORS.LAVA_PREVIEW_OVERLAY
      : null;

  // Highlight overlays
  let highlightOverlay: string | null = null;
  if (isHealable) highlightOverlay = RENDER.COLORS.HEALABLE_OVERLAY;
  else if (isAttackable) highlightOverlay = RENDER.COLORS.ATTACKABLE_OVERLAY;
  else if (isReachable) highlightOverlay = RENDER.COLORS.REACHABLE_OVERLAY;

  const showUnit = unit && tile.isRevealed &&
    unit.tunnelState !== 'UNDERGROUND' && unit.tunnelState !== 'EMERGING';
  const showBuilding = building && tile.isRevealed;

  // Terrain resource overlay (forest / mountain shown on top of grass when no building)
  const terrainResourcePath = tile.isRevealed && !building && !tile.isLava
    ? TERRAIN_RESOURCE_SPRITE[tile.terrainType]
    : undefined;
  const [terrainResSpriteError, setTerrainResSpriteError] = useState(false);
  const showTerrainResource = typeof terrainResourcePath === 'string' && terrainResourcePath !== '' && !terrainResSpriteError;

  // Shared style for full-tile overlay images (terrain resource, ruin, etc.)
  const fullTileOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 1,
  };

  // Corruption visual overlay for MAGMA_SPYR and EMBER_NEST buildings
  const corruptionOverlayClass =
    showBuilding && building
      ? building.type === BuildingType.MAGMASPYR
        ? 'corruption-magmaspyr'
        : building.type === BuildingType.EMBERNEST
          ? 'corruption-embernest'
          : null
      : null;

  // Population display for player-owned FARM, PATRICIANHOUSE, and STRONGHOLD
  const showPopulation =
    showBuilding &&
    building &&
    building.faction === Faction.PLAYER &&
    (building.type === BuildingType.FARM || building.type === BuildingType.PATRICIANHOUSE || building.type === BuildingType.STRONGHOLD);

  // Unit-limit badge for player-owned recruitment buildings
  const unlockedUnits = useGameStore((s) => s.unlockedUnits);
  const showUnitLimit =
    showBuilding &&
    building &&
    building.faction === Faction.PLAYER &&
    recruitmentUsage[building.type as BuildingType] !== undefined &&
    canBuildingEverRecruit({ unlockedUnits }, building);

  const isResonating = building?.type === BuildingType.CRYSTAL_CHAMBER && building.resonanceTurnsRemaining > 0;
  const isCrystalActivating = useCombatAnimationStore(
    (s) => building !== undefined && s.buildingAnimations.get(building.id) === 'CRYSTAL_ACTIVATE',
  );

  const tileFlashEntry = useCombatAnimationStore(
    (s) => s.tileFlashes.get(`${tile.position.x},${tile.position.y}`),
  );

  // Building sprite selection:
  // - Enemy buildings use ENEMY_BUILDING_SPRITE when a faction-specific override exists.
  // - Player buildings use PLAYER_BUILDING_SPRITE when a faction-specific override exists.
  // - Neutral resource nodes (MINE, WOODCUTTER) use RESOURCE_SPRITE.
  // - Active (resonating) Crystal Chambers use CRYSTAL_CHAMBER_ACTIVE_SPRITE.
  // - All other buildings use BUILDING_SPRITE directly.
  const buildingSpritePath = building
    ? building.faction === Faction.ENEMY && ENEMY_BUILDING_SPRITE[building.type]
      ? ENEMY_BUILDING_SPRITE[building.type]
      : building.faction === Faction.PLAYER && PLAYER_BUILDING_SPRITE[building.type]
        ? PLAYER_BUILDING_SPRITE[building.type]
        : building.faction === null && RESOURCE_SPRITE[building.type]
          ? RESOURCE_SPRITE[building.type]
          : isResonating
            ? CRYSTAL_CHAMBER_ACTIVE_SPRITE
            : BUILDING_SPRITE[building.type]
    : undefined;
  const [buildingSpriteError, setBuildingSpriteError] = useState(false);
  const buildingExhaustedFilter = building && building.combatStats && building.hasAttackedThisTurn
    ? RENDER.UNIT_EXHAUSTED_FILTER
    : undefined;

  return (
    <div
      className={[
        'grid-tile',
        isSelected && 'tile-selected',
        isResonating && 'tile--resonating',
        isCrystalActivating && 'tile--crystal-activating',
        isLeashWarn ? 'tile--leash-warn' : isLeashed ? 'tile--leashed' : null,
      ].filter(Boolean).join(' ')}
      style={{
        width: tileSize,
        height: tileSize,
        ...(isCrystalActivating && { '--crystal-activate-duration': `${ANIMATION.CRYSTAL_ACTIVATE_VFX_DURATION_MS}ms` }),
      } as React.CSSProperties}
      onClick={onClick}
    >
      {/* tile sprite or missing-sprite placeholder */}
      {showTileImg ? (
        <img
          src={tileSpritePath}
          alt=""
          onError={() => setTileSpriteError(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
          }}
        />
      ) : tile.terrainType === TileType.CANYON ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundColor: RENDER.COLORS.CANYON, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
            <line x1="30" y1="10" x2="35" y2="90" stroke="#3D2A12" strokeWidth="2" opacity="0.6" />
            <line x1="60" y1="5" x2="55" y2="85" stroke="#3D2A12" strokeWidth="1.5" opacity="0.5" />
            <line x1="70" y1="20" x2="75" y2="70" stroke="#3D2A12" strokeWidth="1" opacity="0.4" />
          </svg>
        </div>
      ) : tile.terrainType === TileType.WATER ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundColor: RENDER.COLORS.WATER, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
            <path d="M10 40 Q25 35 40 40 Q55 45 70 40 Q85 35 95 40" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
            <path d="M5 55 Q20 50 35 55 Q50 60 65 55 Q80 50 95 55" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <path d="M10 70 Q25 65 40 70 Q55 75 70 70 Q85 65 95 70" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
          </svg>
        </div>
      ) : (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <MissingSprite size={tileSize} />
        </div>
      )}

      {/* lava-preview overlay */}
      {overlay && <div className="tile-overlay" style={{ backgroundColor: overlay }} />}

      {/* terrain resource overlay (forest / mountain on top of grass) */}
      {showTerrainResource && (
        <>
          <div className={tile.terrainType === TileType.FOREST ? 'forest-contact-shadow' : 'building-contact-shadow'} />
          <img
            src={terrainResourcePath}
            alt=""
            onError={() => setTerrainResSpriteError(true)}
            style={fullTileOverlayStyle}
          />
        </>
      )}

      {/* ruin overlay — rendered on top of the terrain tile so transparent
          areas in the ruin PNG reveal the ground beneath */}
      {showRuinOverlay && (
        <>
          <div className="building-contact-shadow" />
          <img
            src={ruinSpritePath}
            alt=""
            onError={() => setRuinSpriteError(true)}
            style={fullTileOverlayStyle}
          />
        </>
      )}

      {/* corruption visual overlay */}
      {corruptionOverlayClass && <div className={`tile-overlay ${corruptionOverlayClass}`} />}

      {/* highlight overlay */}
      {highlightOverlay && (
        <div className="tile-overlay" style={{ backgroundColor: highlightOverlay }} />
      )}

      {/* spell target overlay */}
      {isSpellTarget && <div className="tile-overlay tile--spell-target" />}

      {/* slide-preview overlay — secondary destination when moving onto a FROZEN tile */}
      {isSlidePreview && <div className="tile-overlay tile--slide-preview" />}

      {/* corrupted tile overlay — only shown as a CSS fallback when no dedicated status sprite exists */}
      {tile.status === TileStatus.CORRUPTED && tile.isRevealed && !tileStatusSpritePath && <div className="tile-overlay tile--corrupted" />}

      {/* burning tile overlay — only shown as a CSS fallback when no dedicated status sprite exists */}
      {tile.status === TileStatus.BURNING && tile.isRevealed && !tileStatusSpritePath && <div className="tile-overlay tile--burning" />}

      {/* tunnel hole overlay — shown while a TUNNEL unit is DIGGING_IN or UNDERGROUND */}
      {isTunnelHole && tile.isRevealed && (
        TUNNEL_HOLE_SPRITE
          ? <img src={TUNNEL_HOLE_SPRITE} alt="" className="tile-overlay" style={{ width: tileSize, height: tileSize, objectFit: 'cover' }} />
          : <div className="tile-overlay tile--tunnel-hole" />
      )}

      {/* earthquake indicator — shown while a TUNNEL unit is about to emerge */}
      {isEarthquakeIndicator && tile.isRevealed && (
        TUNNEL_EARTHQUAKE_SPRITE
          ? <img src={TUNNEL_EARTHQUAKE_SPRITE} alt="" className="tile-overlay" style={{ width: tileSize, height: tileSize, objectFit: 'cover' }} />
          : <div className="tile-overlay tile--tunnel-earthquake" />
      )}

      {/* portal entrance overlay — shown while an active portal entrance is on this tile */}
      {isPortalEntrance && tile.isRevealed && (
        PORTAL_ENTRANCE_SPRITE
          ? <img src={PORTAL_ENTRANCE_SPRITE} alt="" className="tile-overlay" style={{ width: tileSize, height: tileSize, objectFit: 'cover' }} />
          : <div className="tile-overlay tile--portal-entrance" />
      )}

      {/* portal exit overlay — shown while an active portal exit is on this tile */}
      {isPortalExit && tile.isRevealed && (
        PORTAL_EXIT_SPRITE
          ? <img src={PORTAL_EXIT_SPRITE} alt="" className="tile-overlay" style={{ width: tileSize, height: tileSize, objectFit: 'cover' }} />
          : <div className="tile-overlay tile--portal-exit" />
      )}

      {/* crystal chamber activation VFX overlay */}
      {isCrystalActivating && <div className="tile-crystal-activate-overlay" />}

      {/* zone cleared per-tile flash overlay */}
      {tileFlashEntry && (
        <div
          className="tile-clear-flash-overlay"
          style={{ '--tile-clear-flash-duration': `${tileFlashEntry.durationMs}ms` } as React.CSSProperties}
        />
      )}

      {/* building sprite or missing-sprite */}
      {showBuilding && building && (
        <>
          {/* contact shadow sits behind the building sprite */}
          <div className="building-contact-shadow" />
          {typeof buildingSpritePath === 'string' && buildingSpritePath !== '' && !buildingSpriteError ? (
            <img
              src={buildingSpritePath}
              className="tile-building-img"
              width={buildingIconSize}
              height={buildingIconSize}
              alt=""
              onError={() => setBuildingSpriteError(true)}
              style={{ filter: buildingExhaustedFilter }}
            />
          ) : (
            <div className="tile-building" style={{ filter: buildingExhaustedFilter }}>
              <MissingSprite size={buildingIconSize} />
            </div>
          )}
        </>
      )}

      {showBuilding && building && building.combatStats && building.faction && building.hp < building.maxHp && (
        <div
          className="hp-bar-wrapper building-hp-bar"
          style={
            {
              '--color-hp-red': RENDER.COLORS.HP_RED,
              '--color-hp-green': RENDER.COLORS.HP_GREEN,
            } as React.CSSProperties
          }
        >
          <div className="hp-bar-fill" style={{ width: `${(building.hp / building.maxHp) * 100}%` }} />
        </div>
      )}

      {/* stacked badges at bottom-center: population (FARM/PATRICIANHOUSE/STRONGHOLD)
          and/or unit-limit (recruitment buildings).  Rendered in a shared flex column
          so that when both are present (e.g. STRONGHOLD) they stack without overlap. */}
      {(showPopulation || showUnitLimit) && building && (() => {
        const popBadge = showPopulation && (() => {
          const popCount = building.type === BuildingType.STRONGHOLD
            ? building.populationCount + building.strongholdNobles
            : building.populationCount;
          const capDisplay = building.type === BuildingType.STRONGHOLD
            ? strongholdTotalCap
            : building.populationCap;
          return <div className="population-badge">👥{popCount}/{capDisplay}</div>;
        })();
        const unitBadge = showUnitLimit && (() => {
          const usage = recruitmentUsage[building.type as BuildingType]!;
          const badgeEmoji = '⚔️';
          return <div className="unit-limit-badge">{badgeEmoji}{usage.current}/{usage.limit}</div>;
        })();
        return (
          <div className="building-badges">
            {popBadge}
            {unitBadge}
          </div>
        );
      })()}

      {/* unit rendering */}
      {showUnit && unit && (
        <>
          {/* contact shadow sits behind the unit sprite */}
          <div className="unit-contact-shadow" />
          <UnitBadge unit={unit} tileSize={tileSize} />
        </>
      )}
    </div>
  );
}

const TileCell = React.memo(TileCellInner);

// ============================================================================
// UNIT BADGE
// ============================================================================

function UnitBadge({ unit, tileSize }: { unit: Unit; tileSize: number }) {
  const hpPct = (unit.stats.currentHp / unit.stats.maxHp) * 100;
  const hasLavaBoost = unit.tags.includes(UnitTag.LAVABOOST);
  const unitEmojiSize = tileSize;

  // Unit sprite selection — faction-specific overrides take priority over UNIT_SPRITE.
  const unitSpritePath =
    unit.faction === Faction.ENEMY && ENEMY_UNIT_SPRITE[unit.type]
      ? ENEMY_UNIT_SPRITE[unit.type]
      : unit.faction === Faction.PLAYER && PLAYER_UNIT_SPRITE[unit.type]
        ? PLAYER_UNIT_SPRITE[unit.type]
        : UNIT_SPRITE[unit.type];
  const [unitSpriteError, setUnitSpriteError] = useState(false);
  const showUnitImg = typeof unitSpritePath === 'string' && unitSpritePath !== '' && !unitSpriteError;

  // A player unit that has moved but has no valid attack targets left to hit
  // should also appear exhausted — there's nothing more it can do this turn.
  const noAttackTargets = useGameStore((s) => {
    if (unit.faction !== Faction.PLAYER || !unit.hasMovedThisTurn || hasUnitActed(unit)) return false;
    return getAttackTargets(unit, s.units, s.buildings, s.grid).size === 0;
  });

  const currentTurn = useGameStore((s) => s.turn);
  const isStunned = unit.pinnedUntilTurn >= currentTurn;

  // A unit recruited this turn also gets the toned-down filter — it can't act this turn.
  const isRecruitedThisTurn = (unit.recruitedOnTurn ?? 0) === currentTurn && currentTurn > 0;
  const isExhausted = isRecruitedThisTurn || hasUnitActed(unit) || noAttackTargets;

  const anim = useCombatAnimationStore((s) => s.unitAnimations.get(unit.id));

  const ANIM_CLASS_MAP: Partial<Record<string, string>> = {
    HIT: 'anim-hit',
    DYING: 'anim-dying',
    LEVEL_UP: 'anim-levelup',
    XP_GAIN: 'anim-xpgain',
    TRANSFORM_TO_DEMON: 'unit--transforming',
    DEFECT_TO_ENEMY: 'unit--defecting',
  };
  const animClass = (anim ? (ANIM_CLASS_MAP[anim.type] ?? '') : '');

  const animStyle: React.CSSProperties | undefined =
    anim?.type === 'LUNGE' || anim?.type === 'RECOIL'
      ? {
          transform: `translate(${anim.dx}px, ${anim.dy}px)`,
          transition: `transform ${anim.type === 'LUNGE' ? ANIMATION.MELEE_LUNGE_DURATION_MS / 2 : ANIMATION.RANGED_RECOIL_DURATION_MS}ms ease-out`,
        }
      : anim?.type === 'SLIDE'
        ? ({
            '--slide-start-x': `${anim.dx}px`,
            '--slide-start-y': `${anim.dy}px`,
            animation: `slide-from-ice ${ANIMATION.SLIDE_DURATION_MS}ms ease-in ${ANIMATION.SLIDE_PAUSE_MS}ms both`,
          } as React.CSSProperties)
        : undefined;

  const isEmberling = unit.type === UnitType.EMBERLING;

  const tagIcons = unit.tags
    .map((tag) => TAG_INFO[tag]?.icon)
    .filter((icon): icon is string => !!icon);

  return (
    <div
      className={['tile-unit', animClass, isEmberling && 'emberling-unit'].filter(Boolean).join(' ')}
      style={
        {
          ...animStyle,
          filter: isExhausted ? RENDER.UNIT_EXHAUSTED_FILTER : undefined,
          '--hit-shake-duration': `${ANIMATION.HIT_SHAKE_DURATION_MS}ms`,
          '--die-flash-duration': `${ANIMATION.DIE_FLASH_DURATION_MS}ms`,
          '--die-fade-duration': `${ANIMATION.DIE_FADE_DURATION_MS}ms`,
          '--levelup-anim-duration': `${ANIMATION.LEVEL_UP_ANIM_DURATION_MS}ms`,
          '--levelup-scale-peak': ANIMATION.LEVEL_UP_SCALE_PEAK,
          '--levelup-scale-mid1': ANIMATION.LEVEL_UP_SCALE_MID1,
          '--levelup-scale-mid2': ANIMATION.LEVEL_UP_SCALE_MID2,
          '--levelup-brightness-peak': ANIMATION.LEVEL_UP_BRIGHTNESS_PEAK,
          '--levelup-brightness-mid1': ANIMATION.LEVEL_UP_BRIGHTNESS_MID1,
          '--levelup-brightness-mid2': ANIMATION.LEVEL_UP_BRIGHTNESS_MID2,
          '--levelup-glow-peak': `${ANIMATION.LEVEL_UP_GLOW_PEAK_PX}px`,
          '--levelup-glow-mid1': `${ANIMATION.LEVEL_UP_GLOW_MID1_PX}px`,
          '--levelup-glow-mid2': `${ANIMATION.LEVEL_UP_GLOW_MID2_PX}px`,
          '--levelup-glow-color': RENDER.COLORS.LEVEL_UP_GLOW,
          '--xpgain-anim-duration': `${ANIMATION.XP_GAIN_ANIM_DURATION_MS}ms`,
          '--unit-hp-text-font-size': `${UI.UNIT_HP_TEXT_FONT_SIZE_PX}px`,
        } as React.CSSProperties
      }
    >
      {unit.stats.currentHp < unit.stats.maxHp && (
        <>
          <div
            className="hp-bar-wrapper"
            style={
              {
                '--color-hp-red': RENDER.COLORS.HP_RED,
                '--color-hp-green': RENDER.COLORS.HP_GREEN,
              } as React.CSSProperties
            }
          >
            <div className="hp-bar-fill" style={{ width: `${hpPct}%` }} />
          </div>
          <span className="unit-hp-text">{unit.stats.currentHp}</span>
        </>
      )}
      {UNIT_DEFINITIONS[unit.type]?.levelUp?.length > 0 && (
        <span className="unit-xp-text">{unit.xp} xp</span>
      )}
      {showUnitImg ? (
        <img
          src={unitSpritePath}
          className="unit-main-img"
          width={unitEmojiSize}
          height={unitEmojiSize}
          alt=""
          onError={() => setUnitSpriteError(true)}
        />
      ) : (
        <MissingSprite size={unitEmojiSize} />
      )}
      {isEmberling && (
        <span className="emberling-hover-explosion" style={{ fontSize: `${Math.floor(unitEmojiSize * 0.5)}px` }}>
          💥
        </span>
      )}
      {anim?.type === 'DYING' && (
        <span className="unit-skull-emoji" style={{ fontSize: `${unitEmojiSize}px` }}>
          💀
        </span>
      )}
      {hasLavaBoost && (
        <div
          className="lava-boost-bar"
          style={{ '--color-lava-boost': RENDER.COLORS.LAVA_BOOST_BAR } as React.CSSProperties}
        />
      )}
      {isStunned && (
        <span className="unit-stun-symbol">💫</span>
      )}
      {tagIcons.length > 0 && (
        <div className="unit-tag-icons">
          {tagIcons.map((icon, i) => (
            <span key={i} className="unit-tag-icon">{icon}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CAPTURE INDICATOR LAYER
// ============================================================================

function CaptureIndicatorLayer({ tileSize }: { tileSize: number }) {
  const units = useGameStore((s) => s.units);
  const buildings = useGameStore((s) => s.buildings);

  const captureReadyPositions = useMemo(() => {
    const state = useGameStore.getState();
    const result: Array<{ key: string; x: number; y: number }> = [];
    for (const unit of Object.values(units)) {
      if (unit.faction !== Faction.PLAYER) continue;
      for (const building of Object.values(buildings)) {
        if (
          building.position.x === unit.position.x &&
          building.position.y === unit.position.y &&
          building.faction !== Faction.PLAYER
        ) {
          if (canUnitCapture(unit) && canCapture(state, unit.id, building.id)) {
            result.push({ key: building.id, x: unit.position.x, y: unit.position.y });
          }
        }
      }
    }
    return result;
  }, [units, buildings]);

  if (captureReadyPositions.length === 0) return null;

  return (
    <div className="capture-indicator-layer">
      {captureReadyPositions.map(({ key, x, y }) => (
        <div
          key={key}
          className="capture-indicator"
          style={
            {
              left: x * tileSize,
              top: y * tileSize,
              width: tileSize,
              '--capture-bounce-duration': `${UI.CAPTURE_INDICATOR_BOUNCE_DURATION_MS}ms`,
            } as React.CSSProperties
          }
        >
          <span className="capture-bubble">💬</span>
          <span className="capture-fire">🔥</span>
        </div>
      ))}
    </div>
  );
}

function BuildIndicatorLayer({ tileSize }: { tileSize: number }) {
  const units = useGameStore((s) => s.units);
  const grid = useGameStore((s) => s.grid);

  const buildReadyPositions = useMemo(() => {
    const state = useGameStore.getState();
    const result: Array<{ key: string; x: number; y: number }> = [];
    for (const unit of Object.values(units)) {
      if (unit.faction !== Faction.PLAYER) continue;
      if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) continue;
      if (!canUnitConstruct(unit)) continue;
      const options = getConstructionOptionsForTile(state, unit.position);
      if (options.length > 0) {
        result.push({ key: unit.id, x: unit.position.x, y: unit.position.y });
      }
    }
    return result;
  }, [units, grid]);

  if (buildReadyPositions.length === 0) return null;

  return (
    <div className="build-indicator-layer">
      {buildReadyPositions.map(({ key, x, y }) => (
        <div
          key={key}
          className="build-indicator"
          style={
            {
              left: x * tileSize,
              top: y * tileSize,
              width: tileSize,
              '--capture-bounce-duration': `${UI.CAPTURE_INDICATOR_BOUNCE_DURATION_MS}ms`,
            } as React.CSSProperties
          }
        >
          <span className="capture-bubble">💬</span>
          <span className="build-hammer">🔨</span>
        </div>
      ))}
    </div>
  );
}

function LevelUpIndicatorLayer({ tileSize }: { tileSize: number }) {
  const units = useGameStore((s) => s.units);

  const levelUpReadyPositions = useMemo(() => {
    const result: Array<{ key: string; x: number; y: number }> = [];
    for (const unit of Object.values(units)) {
      if (unit.faction !== Faction.PLAYER) continue;
      if (computeLevelFromXp(unit.type, unit.xp) > unit.level) {
        result.push({ key: unit.id, x: unit.position.x, y: unit.position.y });
      }
    }
    return result;
  }, [units]);

  if (levelUpReadyPositions.length === 0) return null;

  return (
    <div className="levelup-indicator-layer">
      {levelUpReadyPositions.map(({ key, x, y }) => (
        <div
          key={key}
          className="levelup-indicator"
          style={
            {
              left: x * tileSize,
              top: y * tileSize,
              width: tileSize,
              '--capture-bounce-duration': `${UI.CAPTURE_INDICATOR_BOUNCE_DURATION_MS}ms`,
            } as React.CSSProperties
          }
        >
          <span className="capture-bubble">💬</span>
          <span className="levelup-arrow">⬆️</span>
        </div>
      ))}
    </div>
  );
}

function DamageFloaterLayer({ tileSize }: { tileSize: number }) {
  const floaters = useFloaterStore((s) => s.floaters);

  return (
    <div
      className="floater-layer"
      style={
        {
          '--color-heal-floater': RENDER.COLORS.HEAL_FLOATER,
          '--color-levelup-floater': RENDER.COLORS.LEVEL_UP_FLOATER,
          '--color-xp-floater': RENDER.COLORS.XP_FLOATER,
          '--color-revive-floater': RENDER.COLORS.REVIVE_FLOATER,
          '--damage-floater-font-size': `${UI.DAMAGE_FLOATER_FONT_SIZE_PX}px`,
          '--levelup-floater-font-size': `${UI.LEVEL_UP_FLOATER_FONT_SIZE_PX}px`,
          '--xp-floater-font-size': `${UI.XP_FLOATER_FONT_SIZE_PX}px`,
        } as React.CSSProperties
      }
    >
      {floaters.map((floater) => {
        const colorClass =
          floater.floaterType === 'heal'
            ? 'floater-heal'
            : floater.floaterType === 'levelup'
              ? 'floater-levelup'
              : floater.floaterType === 'xp'
                ? 'floater-xp'
                : floater.floaterType === 'revive'
                  ? 'floater-revive'
                  : floater.isEnemy
                    ? 'floater-enemy'
                    : 'floater-player';
        const content =
          floater.label !== undefined
            ? floater.label
            : floater.floaterType === 'heal'
              ? `+${floater.value}`
              : floater.value;
        return (
          <div
            key={floater.id}
            className={`damage-floater ${colorClass}`}
            style={
              {
                left: floater.x * tileSize + tileSize / 2,
                top: floater.y * tileSize,
                '--float-duration': `${UI.DAMAGE_FLOAT_DURATION_MS}ms`,
                '--float-rise': `-${UI.DAMAGE_FLOAT_RISE_PX}px`,
              } as React.CSSProperties
            }
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// PROJECTILE LAYER
// ============================================================================

function ProjectileLayer() {
  const projectiles = useCombatAnimationStore((s) => s.projectiles);
  const removeProjectile = useCombatAnimationStore((s) => s.removeProjectile);

  return (
    <div className="projectile-layer">
      {projectiles.map((p) => (
        <ProjectileSprite key={p.id} projectile={p} onDone={() => removeProjectile(p.id)} />
      ))}
    </div>
  );
}

function ProjectileSprite({
  projectile,
  onDone,
}: {
  projectile: Projectile;
  onDone: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Force the browser to apply the starting position before transitioning
    el.getBoundingClientRect();

    // Trigger transition to destination
    el.style.transform = `translate(${projectile.toPx.x}px, ${projectile.toPx.y}px) rotate(${projectile.rotationDeg}deg)`;
    el.style.opacity = '1';

    const timer = setTimeout(onDone, projectile.durationMs);
    return () => clearTimeout(timer);
  }, [projectile, onDone]);

  return (
    <span
      ref={ref}
      className="projectile-emoji"
      style={
        {
          transform: `translate(${projectile.fromPx.x}px, ${projectile.fromPx.y}px) rotate(${projectile.rotationDeg}deg)`,
          transition: `transform ${projectile.durationMs}ms linear`,
          '--projectile-duration': `${projectile.durationMs}ms`,
        } as React.CSSProperties
      }
    >
      {projectile.emoji}
    </span>
  );
}

// ============================================================================
// SHOCKWAVE LAYER
// ============================================================================

// ============================================================================
// SLIDE-KILL GHOST LAYER
// ============================================================================

/**
 * Renders ghost visuals for units that have been deleted from game state
 * while they were sliding into a lethal tile (LAVA / CANYON / WATER).
 * The sequence is: slide → skull-flash (DYING) → fall/shrink to nothing.
 */
function SlideKillGhostLayer({ tileSize }: { tileSize: number }) {
  const ghosts = useCombatAnimationStore((s) => s.slideKillGhosts);
  return (
    <div className="slide-kill-ghost-layer">
      {Array.from(ghosts.values()).map((ghost) => (
        <SlideKillGhostSprite key={ghost.id} ghost={ghost} tileSize={tileSize} />
      ))}
    </div>
  );
}

function SlideKillGhostSprite({ ghost, tileSize }: { ghost: SlideKillGhost; tileSize: number }) {
  const spritePath =
    ghost.faction === Faction.ENEMY && ENEMY_UNIT_SPRITE[ghost.unitType]
      ? ENEMY_UNIT_SPRITE[ghost.unitType]
      : ghost.faction === Faction.PLAYER && PLAYER_UNIT_SPRITE[ghost.unitType]
        ? PLAYER_UNIT_SPRITE[ghost.unitType]
        : UNIT_SPRITE[ghost.unitType];
  const showImg = typeof spritePath === 'string' && spritePath !== '';

  const tilePixelX = ghost.deathTileX * tileSize;
  const tilePixelY = ghost.deathTileY * tileSize;
  const phaseClass = `slide-kill-ghost--${ghost.phase}`;

  return (
    <div
      className={`slide-kill-ghost ${phaseClass}`}
      style={
        {
          width: tileSize,
          height: tileSize,
          transform: `translate(${tilePixelX}px, ${tilePixelY}px)`,
          '--slide-start-x': `${ghost.slideDx}px`,
          '--slide-start-y': `${ghost.slideDy}px`,
          '--slide-kill-slide-duration': `${ANIMATION.SLIDE_DURATION_MS}ms`,
          '--slide-kill-slide-pause': `${ANIMATION.SLIDE_PAUSE_MS}ms`,
          '--die-flash-duration': `${ANIMATION.DIE_FLASH_DURATION_MS}ms`,
          '--die-fade-duration': `${ANIMATION.DIE_FADE_DURATION_MS}ms`,
          '--slide-kill-fall-duration': `${ANIMATION.SLIDE_KILL_FALL_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      {/* sprite/emoji */}
      {showImg ? (
        <img
          src={spritePath as string}
          className="slide-kill-ghost__sprite"
          width={tileSize}
          height={tileSize}
          alt=""
        />
      ) : (
        <div className="slide-kill-ghost__sprite">
          <MissingSprite size={tileSize} />
        </div>
      )}
      {/* skull emoji — visible only during 'dying' phase */}
      {ghost.phase === 'dying' && (
        <span
          className="slide-kill-ghost__skull"
          style={{ fontSize: `${tileSize}px` }}
        >
          💀
        </span>
      )}
    </div>
  );
}

// ============================================================================

function ShockwaveLayer() {
  const shockwaves = useShockwaveStore((s) => s.shockwaves);
  const remove = useShockwaveStore((s) => s.removeShockwave);
  return (
    <div className="shockwave-layer">
      {shockwaves.map((sw) => (
        <div
          key={sw.id}
          className="shockwave-ring"
          style={{
            left: sw.cx,
            top: sw.cy,
            '--shockwave-duration': `${sw.durationMs}ms`,
            ...(sw.finalScale !== undefined ? { '--sw-final-scale': sw.finalScale } : {}),
          } as React.CSSProperties}
          onAnimationEnd={() => remove(sw.id)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// LEASH LINE LAYER
// ============================================================================

interface LeashPair {
  magePos: { x: number; y: number };
  demonPos: { x: number; y: number };
  warn: boolean;
  burst?: boolean;
}

/** Renders a single leash SVG path group. Shared by selection-based and burst-VFX pairs. */
function LeashPathGroup({ pair, tileSize, index, filterId }: {
  pair: LeashPair;
  tileSize: number;
  index: number;
  filterId: string;
}) {
  const half = tileSize / 2;
  const mx = pair.magePos.x * tileSize + half;
  const my = pair.magePos.y * tileSize + half;
  const dx = pair.demonPos.x * tileSize + half;
  const dy = pair.demonPos.y * tileSize + half;

  const lx = dx - mx;
  const ly = dy - my;
  const len = Math.sqrt(lx * lx + ly * ly) || 1;
  const px = (-ly / len) * tileSize * 0.8;
  const py = (lx / len) * tileSize * 0.8;

  const cp1x = mx + lx / 3 + px;
  const cp1y = my + ly / 3 + py;
  const cp2x = mx + (lx * 2) / 3 - px;
  const cp2y = my + (ly * 2) / 3 - py;

  const d = `M ${mx},${my} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${dx},${dy}`;
  const color = pair.warn || pair.burst ? '#ff3333' : '#ff8800';
  let dashClass = 'leash-line-dash';
  if (pair.warn) dashClass += ' leash-line-warn-wiggle';
  else if (pair.burst) dashClass += ' leash-line-burst';

  return (
    <g key={index}>
      {/* glow backdrop */}
      <path
        d={d}
        stroke={color}
        strokeWidth={pair.burst ? 14 : 8}
        fill="none"
        strokeLinecap="round"
        opacity={pair.burst ? 0.45 : 0.25}
        filter={`url(#${filterId})`}
      />
      {/* main line with dash animation */}
      <path
        d={d}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray="8 5"
        className={dashClass}
        opacity={0.9}
      />
    </g>
  );
}

/**
 * Renders SVG curves connecting each leashed Ember Demon to its controlling Mage
 * when either unit is selected, AND always for leash-burst VFX pairs.
 * Provides "magic leash" visual feedback.
 */
function LeashLineLayer({ tileSize }: { tileSize: number }) {
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const selectedUnit = selectedUnitId ? units[selectedUnitId] : undefined;
  const burstPairs = useCombatAnimationStore((s) => s.leashBurstPairs);

  const selectionPairs = useMemo<LeashPair[]>(() => {
    if (!selectedUnit) return [];
    const result: LeashPair[] = [];

    let mage: typeof selectedUnit | undefined;
    let demons: (typeof selectedUnit)[] = [];

    if (selectedUnit.type === UnitType.MAGE) {
      mage = selectedUnit;
      demons = Object.values(units).filter(
        (u) => u.type === UnitType.EMBER_DEMON && u.controllerMageId === selectedUnit.id,
      );
    } else if (selectedUnit.type === UnitType.EMBER_DEMON && selectedUnit.controllerMageId) {
      mage = units[selectedUnit.controllerMageId];
      demons = [selectedUnit];
    }

    if (!mage) return result;
    for (const demon of demons) {
      const inRange = isTileWithinEdgeCircleRange(
        mage.position.x, mage.position.y,
        demon.position.x, demon.position.y,
        MAGE.EMBER_DEMON_LEASH_RANGE,
      );
      result.push({ magePos: mage.position, demonPos: demon.position, warn: !inRange });
    }
    return result;
  }, [selectedUnit, units]);

  // Build burst-VFX pairs, excluding any already shown by selection.
  const effectiveBurstPairs = useMemo<LeashPair[]>(() => {
    const selKeys = new Set(selectionPairs.map((p) => `${p.demonPos.x},${p.demonPos.y}`));
    return burstPairs
      .filter((bp) => !selKeys.has(`${bp.demonPos.x},${bp.demonPos.y}`))
      .map((bp) => ({ magePos: bp.magePos, demonPos: bp.demonPos, warn: false, burst: true }));
  }, [burstPairs, selectionPairs]);

  if (selectionPairs.length === 0 && effectiveBurstPairs.length === 0) return null;

  return (
    <svg
      className="leash-line-layer"
      style={{ width: MAP.GRID_WIDTH * tileSize, height: MAP.GRID_HEIGHT * tileSize }}
    >
      {selectionPairs.map((pair, i) => (
        <LeashPathGroup key={`sel-${i}`} pair={pair} tileSize={tileSize} index={i} filterId="leash-blur" />
      ))}
      {effectiveBurstPairs.map((pair, i) => (
        <LeashPathGroup key={`burst-${i}`} pair={pair} tileSize={tileSize} index={i} filterId="leash-blur" />
      ))}
      <defs>
        <filter id="leash-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
    </svg>
  );
}

// ============================================================================
// CRYSTAL TOWER CONNECTION LAYER
// ============================================================================

/**
 * Renders turquoise SVG curves between each selected Crystal Tower (or Crystal Chamber)
 * and all player-owned Crystal Chambers (or Crystal Towers) within the tower's attack range.
 * Visually communicates the attack bonus synergy.
 */
function CrystalTowerConnectionLayer({ tileSize }: { tileSize: number }) {
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const buildings = useGameStore((s) => s.buildings);
  const selectedBuilding = selectedBuildingId ? buildings[selectedBuildingId] : undefined;

  interface TowerChamberPair {
    towerPos: { x: number; y: number };
    chamberPos: { x: number; y: number };
  }

  const pairs = useMemo<TowerChamberPair[]>(() => {
    if (!selectedBuilding || selectedBuilding.faction !== Faction.PLAYER) return [];
    const result: TowerChamberPair[] = [];

    if (selectedBuilding.type === BuildingType.CRYSTAL_TOWER && selectedBuilding.combatStats) {
      const range = selectedBuilding.combatStats.attackRange;
      for (const b of Object.values(buildings)) {
        if (b.type === BuildingType.CRYSTAL_CHAMBER && b.faction === Faction.PLAYER) {
          if (isTileWithinEdgeCircleRange(
            selectedBuilding.position.x, selectedBuilding.position.y,
            b.position.x, b.position.y,
            range,
          )) {
            result.push({ towerPos: selectedBuilding.position, chamberPos: b.position });
          }
        }
      }
    } else if (selectedBuilding.type === BuildingType.CRYSTAL_CHAMBER) {
      // Also show connections when the chamber is selected — find any tower that has this chamber in range.
      for (const b of Object.values(buildings)) {
        if (b.type === BuildingType.CRYSTAL_TOWER && b.faction === Faction.PLAYER && b.combatStats) {
          const range = b.combatStats.attackRange;
          if (isTileWithinEdgeCircleRange(
            b.position.x, b.position.y,
            selectedBuilding.position.x, selectedBuilding.position.y,
            range,
          )) {
            result.push({ towerPos: b.position, chamberPos: selectedBuilding.position });
          }
        }
      }
    }

    return result;
  }, [selectedBuilding, buildings]);

  if (pairs.length === 0) return null;

  const half = tileSize / 2;
  const color = '#00ddc0';

  return (
    <svg
      className="leash-line-layer crystal-tower-connection-layer"
      style={{ width: MAP.GRID_WIDTH * tileSize, height: MAP.GRID_HEIGHT * tileSize }}
    >
      {pairs.map((pair, i) => {
        const tx = pair.towerPos.x * tileSize + half;
        const ty = pair.towerPos.y * tileSize + half;
        const cx = pair.chamberPos.x * tileSize + half;
        const cy = pair.chamberPos.y * tileSize + half;

        const lx = cx - tx;
        const ly = cy - ty;
        const len = Math.sqrt(lx * lx + ly * ly) || 1;
        const px = (-ly / len) * tileSize * 0.6;
        const py = (lx / len) * tileSize * 0.6;

        const cp1x = tx + lx / 3 + px;
        const cp1y = ty + ly / 3 + py;
        const cp2x = tx + (lx * 2) / 3 - px;
        const cp2y = ty + (ly * 2) / 3 - py;

        const d = `M ${tx},${ty} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${cx},${cy}`;

        return (
          <g key={i}>
            {/* glow backdrop */}
            <path
              d={d}
              stroke={color}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              opacity={0.25}
              filter="url(#tower-chamber-blur)"
            />
            {/* main line with dash animation */}
            <path
              d={d}
              stroke={color}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray="8 5"
              className="tower-chamber-line-dash"
              opacity={0.9}
            />
          </g>
        );
      })}
      <defs>
        <filter id="tower-chamber-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
    </svg>
  );
}

// ============================================================================
// CLEAVE VFX LAYER
// ============================================================================

function CleaveVfxLayer({ tileSize }: { tileSize: number }) {
  const cleaveVfxList = useCombatAnimationStore((s) => s.cleaveVfxList);
  // The ring element has 0×0 size with a box-shadow spread of 3px.
  // To visually expand to 1.25 tile widths the scale must equal (1.25 * tileSize) / 3.
  const finalScale = Math.round((1.25 * tileSize) / 3);
  return (
    <div className="cleave-vfx-layer">
      {cleaveVfxList.map((vfx: CleaveVfx) => (
        <div
          key={vfx.id}
          className="cleave-vfx-ring"
          style={{
            left: vfx.cx * tileSize + tileSize / 2,
            top: vfx.cy * tileSize + tileSize / 2,
            '--cleave-final-scale': finalScale,
            '--cleave-duration': `${vfx.durationMs}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ============================================================================
// TILE VFX LAYER — generic semantic tile-anchored VFX (one variant per CSS class)
// ============================================================================

function TileVfxLayer({ tileSize }: { tileSize: number }) {
  const tileVfx = useCombatAnimationStore((s) => s.tileVfx);
  const removeTileVfx = useCombatAnimationStore((s) => s.removeTileVfx);
  return (
    <div className="tile-vfx-layer">
      {tileVfx.map((vfx: TileVfx) => (
        <div
          key={vfx.id}
          className={`tile-vfx tile-vfx--${vfx.variant.toLowerCase().replace(/_/g, '-')}`}
          style={{
            left: vfx.x * tileSize,
            top: vfx.y * tileSize,
            width: tileSize,
            height: tileSize,
            '--tile-vfx-duration': `${vfx.durationMs}ms`,
          } as React.CSSProperties}
          onAnimationEnd={() => removeTileVfx(vfx.id)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// LINE VFX LAYER — generic semantic SVG line VFX (one variant per CSS class)
// ============================================================================

function LineVfxLayer({ tileSize }: { tileSize: number }) {
  const lineVfx = useCombatAnimationStore((s) => s.lineVfx);
  const removeLineVfx = useCombatAnimationStore((s) => s.removeLineVfx);
  // Coordinate space: unscaled local pixels, same as ProjectileLayer and
  // LeashLineLayer. The layer lives inside the CSS-scaled grid-container,
  // so positions are not multiplied by zoom.
  return (
    <svg
      className="line-vfx-layer"
      style={{ width: MAP.GRID_WIDTH * tileSize, height: MAP.GRID_HEIGHT * tileSize }}
    >
      {lineVfx.map((vfx: LineVfx) => (
        <line
          key={vfx.id}
          className={`line-vfx line-vfx--${vfx.variant.toLowerCase().replace(/_/g, '-')}`}
          x1={vfx.fromPx.x}
          y1={vfx.fromPx.y}
          x2={vfx.toPx.x}
          y2={vfx.toPx.y}
          style={{ '--line-vfx-duration': `${vfx.durationMs}ms` } as React.CSSProperties}
          onAnimationEnd={() => removeLineVfx(vfx.id)}
        />
      ))}
    </svg>
  );
}
