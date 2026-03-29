/**
 * GridRenderer – renders the Volcanae 20×105 game grid with camera pan/drag,
 * tile colouring, unit & building emojis, HP bars, and click interaction.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useFloaterStore } from '../floaterStore';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import type { Projectile } from '../combatAnimationStore';
import { getReachableTiles } from '../movementSystem';
import { canCapture } from '../captureSystem';
import { MAP, RENDER, UI, ANIMATION } from '../gameConfig';
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
// CONSTANTS / LOOKUP TABLES
// ============================================================================

const UNIT_EMOJI: Record<string, string> = {
  [UnitType.INFANTRY]: '⚔️',
  [UnitType.ARCHER]: '🏹',
  [UnitType.RIDER]: '🐴',
  [UnitType.SIEGE]: '💣',
  [UnitType.LAVA_GRUNT]: '👹',
  [UnitType.LAVA_ARCHER]: '👺',
  [UnitType.LAVA_RIDER]: '👾',
  [UnitType.LAVA_SIEGE]: '🐦‍🔥',
};

const BUILDING_EMOJI: Record<string, string> = {
  [BuildingType.STRONGHOLD]: '🏰',
  [BuildingType.MINE]: '🏔️',
  [BuildingType.WOODCUTTER]: '🛖',
  [BuildingType.BARRACKS]: '🏚️',
  [BuildingType.ARCHER_CAMP]: '🏕️',
  [BuildingType.RIDER_CAMP]: '🏘️',
  [BuildingType.SIEGE_CAMP]: '🏛️',
  [BuildingType.WATCHTOWER]: '👁️',
};

const RESOURCE_BUILDING_ICON: Record<string, string> = {
  [BuildingType.MINE]: '⛓️',
  [BuildingType.WOODCUTTER]: '🪵',
};

// ============================================================================
// HELPERS
// ============================================================================

function useTileSize(): number {
  const [size, setSize] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
      ? RENDER.TILE_SIZE_MOBILE
      : RENDER.TILE_SIZE_DESKTOP,
  );

  useEffect(() => {
    const onResize = () => {
      setSize(
        window.innerWidth <= RENDER.MOBILE_BREAKPOINT
          ? RENDER.TILE_SIZE_MOBILE
          : RENDER.TILE_SIZE_DESKTOP,
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Returns set of "x,y" keys for tiles an enemy unit occupies that are
 *  within attack range of the selected player unit. */
function getAttackableTileKeys(
  selectedUnit: Unit,
  units: Record<string, Unit>,
): Set<string> {
  const keys = new Set<string>();
  if (selectedUnit.hasActedThisTurn) return keys;
  for (const other of Object.values(units)) {
    if (other.faction === Faction.ENEMY) {
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
// TILE BACKGROUND COLOR
// ============================================================================

function tileBackground(
  tile: Tile,
  building: Building | undefined,
): string {
  if (!tile.isRevealed) return RENDER.COLORS.UNREVEALED;
  if (tile.isLava) return RENDER.COLORS.LAVA;

  if (building) {
    if (building.faction === Faction.PLAYER) return RENDER.COLORS.BUILDING_PLAYER;
    if (building.faction === Faction.ENEMY) return RENDER.COLORS.BUILDING_ENEMY;
    return RENDER.COLORS.BUILDING_NEUTRAL;
  }

  return RENDER.COLORS.GRASS;
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
  const moveUnit = useGameStore((s) => s.moveUnit);
  const attackUnit = useGameStore((s) => s.attackUnit);
  const buildingAttackUnit = useGameStore((s) => s.buildingAttackUnit);

  // ── Animation store selectors ──
  const isAnimating = useAnimationStore((s) => s.isAnimating);
  const cameraTarget = useAnimationStore((s) => s.cameraTarget);

  const tileSize = useTileSize();
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Camera drag state ──
  const dragState = useRef({
    isDragging: false,
    isDragActive: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  // Tracks whether the last RMB press resulted in a drag (used by contextmenu handler)
  const rmbWasDragging = useRef(false);

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

      // Reset isDragging on any pointer-down so a post-drag LMB click isn't blocked
      dragState.current.isDragging = false;

      const shouldDrag = isRMB || (isTouch && e.isPrimary);
      if (!shouldDrag) return;

      // Suppress the CSS transition while the user is panning manually
      if (containerRef.current) containerRef.current.classList.add('no-transition');

      dragState.current = {
        isDragging: false,
        isDragActive: true,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: offset.x,
        scrollTop: offset.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [offset, isAnimating],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.isDragActive) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.isDragging && Math.abs(dx) + Math.abs(dy) > 4) {
      ds.isDragging = true;
    }
    if (ds.isDragging) {
      setOffset({ x: ds.scrollLeft + dx, y: ds.scrollTop + dy });
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.isDragActive) return;
    // Capture drag state before clearing, so the contextmenu handler can read it
    if (e.pointerType === 'mouse' && e.button === 2) {
      rmbWasDragging.current = ds.isDragging;
    }
    ds.isDragActive = false;
    // Restore the CSS transition now that manual panning has ended
    if (containerRef.current) containerRef.current.classList.remove('no-transition');
    // isDragging intentionally not reset here – onClick checks it to skip post-drag clicks
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
    // Unit attack range
    if (selectedUnit && selectedUnit.faction === Faction.PLAYER) {
      return getAttackableTileKeys(selectedUnit, units);
    }
    // Building attack range (e.g. player watchtower)
    if (selectedBuilding && selectedBuilding.combatStats && selectedBuilding.faction === Faction.PLAYER) {
      return getBuildingAttackableTileKeys(selectedBuilding, units);
    }
    return new Set();
  }, [selectedUnit, selectedBuilding, units]);

  // ── Tile click ──
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (dragState.current.isDragging) return;
      if (isAnimating) return; // Lock clicks during animation

      const tile = grid[y][x];
      const key = posKey(x, y);

      // Priority 1 — Own player unit on tile: always select, unconditionally
      if (tile.unitId) {
        const u = units[tile.unitId];
        if (u && u.faction === Faction.PLAYER) {
          selectUnit(tile.unitId);
          return;
        }
      }

      // Priority 2 — Enemy unit on tile, valid attack available (unit or building attack)
      // Priority 3 — Enemy unit on tile, no valid attack: select for inspection
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
          selectUnit(tile.unitId);
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

      // Priority 5 — Building on tile, movement not possible
      if (tile.buildingId) {
        selectBuilding(tile.buildingId);
        return;
      }

      // Priority 6 — Fallback: clear selection
      clearSelection();
    },
    [grid, selectedUnit, selectedBuilding, attackableSet, reachableSet, units, selectUnit, selectBuilding, clearSelection, moveUnit, attackUnit, buildingAttackUnit, isAnimating],
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

            return (
              <TileCell
                key={key}
                tile={tile}
                unit={unit}
                building={building}
                tileSize={tileSize}
                isReachable={isReachable}
                isAttackable={isAttackable}
                onClick={() => handleTileClick(x, y)}
              />
            );
          }),
        )}
        <CaptureIndicatorLayer tileSize={tileSize} />
        <DamageFloaterLayer tileSize={tileSize} />
        <ProjectileLayer />
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
  onClick: () => void;
}

function TileCellInner({
  tile,
  unit,
  building,
  tileSize,
  isReachable,
  isAttackable,
  onClick,
}: TileCellProps) {
  const bg = tileBackground(tile, building);
  const buildingIconSize = Math.floor(tileSize * 0.8);
  const resourceIconSize = Math.floor(tileSize * 0.20);

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

  // Resource production icon for visible resource buildings
  const resourceIcon = building && tile.isRevealed
    ? RESOURCE_BUILDING_ICON[building.type]
    : undefined;

  return (
    <div
      className="grid-tile"
      style={{
        width: tileSize,
        height: tileSize,
        backgroundColor: bg,
      }}
      onClick={onClick}
    >
      {/* cloud emoji for undiscovered tiles */}
      {!tile.isRevealed && (
        <span className="tile-cloud" style={{ fontSize: buildingIconSize }}>☁️</span>
      )}

      {/* lava-preview overlay */}
      {overlay && <div className="tile-overlay" style={{ backgroundColor: overlay }} />}

      {/* highlight overlay */}
      {highlightOverlay && (
        <div className="tile-overlay" style={{ backgroundColor: highlightOverlay }} />
      )}

      {/* building emoji */}
      {showBuilding && building && (
        <span
          className="tile-building"
          style={{
            fontSize: buildingIconSize,
            opacity: building.combatStats && building.hasActedThisTurn
              ? RENDER.UNIT_EXHAUSTED_OPACITY
              : undefined,
          }}
        >
          {BUILDING_EMOJI[building.type] ?? ''}
        </span>
      )}

      {/* building HP bar for attacking buildings (e.g. watchtower) */}
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

      {/* resource icon */}
      {resourceIcon && (
        <span className="tile-resource-icon" style={{ fontSize: resourceIconSize }}>
          {resourceIcon}
        </span>
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
  const hasLavaBoost = unit.tags.includes(UnitTag.LAVA_BOOST);
  const unitEmojiSize = Math.floor(tileSize * 0.8);

  // A player unit that has moved but has no valid attack targets left to hit
  // should also appear exhausted — there's nothing more it can do this turn.
  const noAttackTargets = useGameStore((s) => {
    if (unit.faction !== Faction.PLAYER || !unit.hasMovedThisTurn || unit.hasActedThisTurn) return false;
    return !Object.values(s.units).some(
      (other) =>
        other.faction === Faction.ENEMY &&
        isTileWithinEdgeCircleRange(
          unit.position.x, unit.position.y,
          other.position.x, other.position.y,
          unit.stats.attackRange,
        ),
    );
  });

  const isExhausted = (unit.hasActedThisTurn && unit.hasMovedThisTurn) || noAttackTargets;

  const anim = useCombatAnimationStore((s) => s.unitAnimations.get(unit.id));

  const animClass =
    anim?.type === 'HIT'
      ? 'anim-hit'
      : anim?.type === 'DYING'
        ? 'anim-dying'
        : '';

  const animStyle: React.CSSProperties | undefined =
    anim?.type === 'LUNGE' || anim?.type === 'RECOIL'
      ? {
          transform: `translate(${anim.dx}px, ${anim.dy}px)`,
          transition: `transform ${anim.type === 'LUNGE' ? ANIMATION.MELEE_LUNGE_DURATION_MS / 2 : ANIMATION.RANGED_RECOIL_DURATION_MS}ms ease-out`,
        }
      : undefined;

  return (
    <div
      className={`tile-unit ${animClass}`}
      style={
        {
          ...animStyle,
          opacity: isExhausted ? RENDER.UNIT_EXHAUSTED_OPACITY : undefined,
          '--hit-shake-duration': `${ANIMATION.HIT_SHAKE_DURATION_MS}ms`,
          '--die-flash-duration': `${ANIMATION.DIE_FLASH_DURATION_MS}ms`,
          '--die-fade-duration': `${ANIMATION.DIE_FADE_DURATION_MS}ms`,
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
      <span className="unit-main-emoji unit-emoji" style={{ fontSize: `${unitEmojiSize}px` }}>
        {UNIT_EMOJI[unit.type] ?? '?'}
      </span>
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

function DamageFloaterLayer({ tileSize }: { tileSize: number }) {
  const floaters = useFloaterStore((s) => s.floaters);

  return (
    <div className="floater-layer">
      {floaters.map((floater) => (
        <div
          key={floater.id}
          className={`damage-floater ${floater.isEnemy ? 'floater-enemy' : 'floater-player'}`}
          style={
            {
              left: floater.x * tileSize + tileSize / 2,
              top: floater.y * tileSize,
              '--float-duration': `${UI.DAMAGE_FLOAT_DURATION_MS}ms`,
              '--float-rise': `-${UI.DAMAGE_FLOAT_RISE_PX}px`,
            } as React.CSSProperties
          }
        >
          {floater.value}
        </div>
      ))}
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
