/**
 * GridRenderer – renders the Volcanae 20×105 game grid with camera pan/drag,
 * sprite-based tile/unit/building rendering, HP bars, zoom, and click interaction.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useFloaterStore } from '../floaterStore';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import type { Projectile } from '../combatAnimationStore';
import { getReachableTiles } from '../movementSystem';
import { canCapture } from '../captureSystem';
import { getConstructionOptionsForTile } from '../constructionSystem';
import { MAP } from '../gameConfig';
import { ANIMATION } from '../animationConfig';
import { UI } from '../uiConfig';
import { RENDER } from '../renderConfig';
import { INPUT } from '../inputConfig';
import { computeLevelFromXp } from '../levelSystem';
import { useZoomStore } from '../zoomStore';
import { UNIT_SPRITE, BUILDING_SPRITE, TILE_SPRITE, RESOURCE_SPRITE } from '../assetRegistry';
import MissingSprite from './MissingSprite';
import {
  Faction,
  UnitType,
  UnitTag,
  BuildingType,
  type Tile,
  type Unit,
  type Building,
} from '../types';
import { isTileWithinEdgeCircleRange } from '../rangeUtils';
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

  const zoom = useZoomStore((s) => s.zoom);
  return Math.round(baseSize * zoom);
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Returns set of "x,y" keys for tiles that are attackable by the selected player unit.
 *  Includes tiles with enemy units and tiles with enemy buildings (no unit on the tile). */
function getAttackableTileKeys(
  selectedUnit: Unit,
  units: Record<string, Unit>,
  buildings: Record<string, Building>,
  grid: Tile[][],
): Set<string> {
  const keys = new Set<string>();
  if (selectedUnit.hasActedThisTurn) return keys;
  // PREP tag: cannot attack after moving
  if (selectedUnit.hasMovedThisTurn && selectedUnit.tags.includes(UnitTag.PREP)) return keys;
  // Enemy units
  for (const other of Object.values(units)) {
    if (other.faction === Faction.ENEMY) {
      // Cannot attack enemy units on undiscovered tiles
      if (!grid[other.position.y]?.[other.position.x]?.isRevealed) continue;
      const inRange = isTileWithinEdgeCircleRange(
        selectedUnit.position.x, selectedUnit.position.y,
        other.position.x, other.position.y,
        selectedUnit.stats.attackRange,
      );
      if (inRange) {
        keys.add(posKey(other.position.x, other.position.y));
      }
    }
  }
  // Enemy buildings (only tiles without an enemy unit already in the set)
  for (const b of Object.values(buildings)) {
    if (b.faction === Faction.ENEMY) {
      if (!grid[b.position.y]?.[b.position.x]?.isRevealed) continue;
      const key = posKey(b.position.x, b.position.y);
      if (keys.has(key)) continue; // tile already covered by enemy unit
      const inRange = isTileWithinEdgeCircleRange(
        selectedUnit.position.x, selectedUnit.position.y,
        b.position.x, b.position.y,
        selectedUnit.stats.attackRange,
      );
      if (inRange) {
        keys.add(key);
      }
    }
  }
  return keys;
}

/** Returns set of "x,y" keys for tiles an enemy unit occupies that are
 *  within attack range of a player-owned attacking building (e.g. watchtower). */
function getBuildingAttackableTileKeys(
  building: Building,
  units: Record<string, Unit>,
): Set<string> {
  const keys = new Set<string>();
  if (!building.combatStats || building.faction !== Faction.PLAYER || building.hasActedThisTurn) return keys;
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

  // ── Animation store selectors ──
  const isAnimating = useAnimationStore((s) => s.isAnimating);
  const cameraTarget = useAnimationStore((s) => s.cameraTarget);

  // ── Zoom store ──
  const stepZoom = useZoomStore((s) => s.stepZoom);
  const setZoom = useZoomStore((s) => s.setZoom);

  const tileSize = useTileSize();
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Pinch-to-zoom state ──
  const pinchState = useRef<{
    active: boolean;
    startDist: number;
    startZoom: number;
    pointers: Map<number, { x: number; y: number }>;
  }>({ active: false, startDist: 0, startZoom: RENDER.ZOOM_DEFAULT, pointers: new Map() });

  // ── Mouse wheel zoom ──
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? +RENDER.ZOOM_STEP : -RENDER.ZOOM_STEP);
    };
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, [stepZoom]);

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

  // When camera target changes, update offset to center viewport on target
  useEffect(() => {
    const viewportEl = viewportRef.current;
    if (!viewportEl) return;
    const viewportW = viewportEl.clientWidth;
    const viewportH = viewportEl.clientHeight;
    setOffset({
      x: viewportW / 2 - cameraTarget.x * tileSize - tileSize / 2,
      y: viewportH / 2 - cameraTarget.y * tileSize - tileSize / 2,
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
          ps.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          ps.startZoom = useZoomStore.getState().zoom;
          ps.active = true;
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
        if (ps.startDist > 0) {
          const ratio = dist / ps.startDist;
          setZoom(ps.startZoom * ratio);
        }
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
  }, [setZoom]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    // ── Pinch cleanup ──
    if (e.pointerType === 'touch') {
      const ps = pinchState.current;
      ps.pointers.delete(e.pointerId);
      if (ps.active) {
        ps.active = false;
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
    const tiles = getReachableTiles(useGameStore.getState(), selectedUnit.id);
    return new Set(tiles.map((p) => posKey(p.x, p.y)));
  }, [selectedUnit]);

  const attackableSet = useMemo<Set<string>>(() => {
    // Unit attack range (enemy units and enemy buildings)
    if (selectedUnit && selectedUnit.faction === Faction.PLAYER) {
      return getAttackableTileKeys(selectedUnit, units, buildings, grid);
    }
    // Building attack range (e.g. player watchtower)
    if (selectedBuilding && selectedBuilding.combatStats && selectedBuilding.faction === Faction.PLAYER) {
      return getBuildingAttackableTileKeys(selectedBuilding, units);
    }
    return new Set();
  }, [selectedUnit, selectedBuilding, units, buildings, grid]);

  // ── Tile click ──
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (dragState.current.isDragging) return;
      if (isAnimating) return; // Lock clicks during animation

      const tile = grid[y][x];
      const key = posKey(x, y);

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
            !selectedUnit.hasActedThisTurn &&
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
            !selectedBuilding.hasActedThisTurn &&
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
        !selectedUnit.hasMovedThisTurn &&
        reachableSet.has(key)
      ) {
        moveUnit(selectedUnit.id, { x, y });
        return;
      }

      // Priority 5a — Enemy building on tile (no enemy unit), player unit can attack it
      if (tile.buildingId) {
        const b = buildings[tile.buildingId];
        if (
          b &&
          b.faction === Faction.ENEMY &&
          selectedUnit &&
          selectedUnit.faction === Faction.PLAYER &&
          !selectedUnit.hasActedThisTurn &&
          !(selectedUnit.tags.includes(UnitTag.PREP) && selectedUnit.hasMovedThisTurn) &&
          attackableSet.has(key)
        ) {
          attackBuilding(selectedUnit.id, tile.buildingId);
          return;
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
    [grid, selectedUnitId, selectedBuildingId, selectedUnit, selectedBuilding, attackableSet, reachableSet, units, buildings, selectUnit, selectBuilding, selectTile, clearSelection, moveUnit, attackUnit, attackBuilding, buildingAttackUnit, isAnimating],
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
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      >
        {grid.map((row, y) =>
          row.map((tile, x) => {
            const building = tile.buildingId ? buildings[tile.buildingId] : undefined;
            const unit = tile.unitId ? units[tile.unitId] : undefined;
            const key = posKey(x, y);
            const isReachable = reachableSet.has(key);
            const isAttackable = attackableSet.has(key);
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
                isSelected={isSelected}
                onClick={() => handleTileClick(x, y)}
              />
            );
          }),
        )}
        <CaptureIndicatorLayer tileSize={tileSize} />
        <BuildIndicatorLayer tileSize={tileSize} />
        <LevelUpIndicatorLayer tileSize={tileSize} />
        <DamageFloaterLayer tileSize={tileSize} />
        <ProjectileLayer />
      </div>
      <div className="zoom-controls">
        <button onClick={() => stepZoom(-RENDER.ZOOM_STEP)}>−</button>
        <button onClick={() => stepZoom(+RENDER.ZOOM_STEP)}>+</button>
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
  isSelected: boolean;
  onClick: () => void;
}

function TileCellInner({
  tile,
  unit,
  building,
  tileSize,
  isReachable,
  isAttackable,
  isSelected,
  onClick,
}: TileCellProps) {
  const buildingIconSize = Math.floor(tileSize * 0.8);

  // ── Tile sprite path ──
  const tileSpritePath: string | undefined = tile.isLava
    ? TILE_SPRITE['lava']
    : !tile.isRevealed
      ? TILE_SPRITE['unrevealed']
      : tile.isRuin || tile.isStrongholdRuin
        ? TILE_SPRITE['ruin']
        : TILE_SPRITE[tile.terrainType];

  const [tileSpriteError, setTileSpriteError] = useState(false);
  const showTileImg = typeof tileSpritePath === 'string' && tileSpritePath !== '' && !tileSpriteError;

  // Lava preview overlay (only on discovered tiles)
  const overlay =
    tile.isRevealed && tile.isLavaPreview && !tile.isLava
      ? RENDER.COLORS.LAVA_PREVIEW_OVERLAY
      : null;

  // Highlight overlays
  let highlightOverlay: string | null = null;
  if (isAttackable) highlightOverlay = RENDER.COLORS.ATTACKABLE_OVERLAY;
  else if (isReachable) highlightOverlay = RENDER.COLORS.REACHABLE_OVERLAY;

  const showUnit = unit && tile.isRevealed;
  const showBuilding = building && tile.isRevealed;

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

  // Building sprite — neutral buildings use the resource sprite registry
  const buildingSpritePath = building
    ? building.faction === null
      ? RESOURCE_SPRITE[building.type]
      : BUILDING_SPRITE[building.type]
    : undefined;
  const [buildingSpriteError, setBuildingSpriteError] = useState(false);
  const buildingExhaustedOpacity = building && building.combatStats && building.hasActedThisTurn
    ? RENDER.UNIT_EXHAUSTED_OPACITY
    : undefined;

  return (
    <div
      className={['grid-tile', isSelected && 'tile-selected'].filter(Boolean).join(' ')}
      style={{
        width: tileSize,
        height: tileSize,
        backgroundColor: '#888',
      }}
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
      ) : (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <MissingSprite size={tileSize} />
        </div>
      )}

      {/* lava-preview overlay */}
      {overlay && <div className="tile-overlay" style={{ backgroundColor: overlay }} />}

      {/* corruption visual overlay */}
      {corruptionOverlayClass && <div className={`tile-overlay ${corruptionOverlayClass}`} />}

      {/* highlight overlay */}
      {highlightOverlay && (
        <div className="tile-overlay" style={{ backgroundColor: highlightOverlay }} />
      )}

      {/* building sprite or missing-sprite */}
      {showBuilding && building && (
        <>
          {typeof buildingSpritePath === 'string' && buildingSpritePath !== '' && !buildingSpriteError ? (
            <img
              src={buildingSpritePath}
              className="tile-building-img"
              width={buildingIconSize}
              height={buildingIconSize}
              alt=""
              onError={() => setBuildingSpriteError(true)}
              style={{ opacity: buildingExhaustedOpacity }}
            />
          ) : (
            <div className="tile-building" style={{ opacity: buildingExhaustedOpacity }}>
              <MissingSprite size={buildingIconSize} />
            </div>
          )}
        </>
      )}

      {/* building HP bar for attacking buildings (e.g. watchtower, magma spyr) */}
      {showBuilding && building && building.combatStats && building.faction && (
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

      {/* population badge for FARM and PATRICIANHOUSE */}
      {showPopulation && building && (
        <div className="population-badge">
          {building.populationCount}/{building.populationCap}
        </div>
      )}

      {/* unit rendering */}
      {showUnit && unit && <UnitBadge unit={unit} tileSize={tileSize} />}
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
  const unitEmojiSize = Math.floor(tileSize * 0.8);

  const unitSpritePath = UNIT_SPRITE[unit.type];
  const [unitSpriteError, setUnitSpriteError] = useState(false);
  const showUnitImg = typeof unitSpritePath === 'string' && unitSpritePath !== '' && !unitSpriteError;

  // A player unit that has moved but has no valid attack targets left to hit
  // should also appear exhausted — there's nothing more it can do this turn.
  const noAttackTargets = useGameStore((s) => {
    if (unit.faction !== Faction.PLAYER || !unit.hasMovedThisTurn || unit.hasActedThisTurn) return false;
    // PREP units cannot attack after moving — treat as exhausted immediately
    if (unit.tags.includes(UnitTag.PREP)) return true;
    const hasEnemyUnitTarget = Object.values(s.units).some(
      (other) =>
        other.faction === Faction.ENEMY &&
        // Cannot attack enemies on undiscovered tiles
        s.grid[other.position.y]?.[other.position.x]?.isRevealed &&
        isTileWithinEdgeCircleRange(
          unit.position.x, unit.position.y,
          other.position.x, other.position.y,
          unit.stats.attackRange,
        ),
    );
    if (hasEnemyUnitTarget) return false;
    const hasEnemyBuildingTarget = Object.values(s.buildings).some(
      (b) =>
        b.faction === Faction.ENEMY &&
        s.grid[b.position.y]?.[b.position.x]?.isRevealed &&
        isTileWithinEdgeCircleRange(
          unit.position.x, unit.position.y,
          b.position.x, b.position.y,
          unit.stats.attackRange,
        ),
    );
    return !hasEnemyBuildingTarget;
  });

  const isExhausted = (unit.hasActedThisTurn && unit.hasMovedThisTurn) || noAttackTargets;

  const anim = useCombatAnimationStore((s) => s.unitAnimations.get(unit.id));

  const animClass =
    anim?.type === 'HIT'
      ? 'anim-hit'
      : anim?.type === 'DYING'
        ? 'anim-dying'
        : anim?.type === 'LEVEL_UP'
          ? 'anim-levelup'
          : anim?.type === 'XP_GAIN'
            ? 'anim-xpgain'
            : '';

  const animStyle: React.CSSProperties | undefined =
    anim?.type === 'LUNGE' || anim?.type === 'RECOIL'
      ? {
          transform: `translate(${anim.dx}px, ${anim.dy}px)`,
          transition: `transform ${anim.type === 'LUNGE' ? ANIMATION.MELEE_LUNGE_DURATION_MS / 2 : ANIMATION.RANGED_RECOIL_DURATION_MS}ms ease-out`,
        }
      : undefined;

  const isEmberling = unit.type === UnitType.EMBERLING;

  return (
    <div
      className={['tile-unit', animClass, isEmberling && 'emberling-unit'].filter(Boolean).join(' ')}
      style={
        {
          ...animStyle,
          opacity: isExhausted ? RENDER.UNIT_EXHAUSTED_OPACITY : undefined,
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
          if (canCapture(state, unit.id, building.id)) {
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
      if (unit.hasMovedThisTurn || unit.hasActedThisTurn || unit.hasCapturedThisTurn) continue;
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
