/**
 * GridRenderer – renders the Volcanae 20×105 game grid with camera pan/drag,
 * tile colouring, unit & building emojis, HP bars, and click interaction.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../gameStore';
import { getReachableTiles } from '../movementSystem';
import { MAP, RENDER } from '../gameConfig';
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
  [BuildingType.MINE]: '⛏️',
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
  const cameraY = useGameStore((s) => s.cameraY);

  const selectUnit = useGameStore((s) => s.selectUnit);
  const selectBuilding = useGameStore((s) => s.selectBuilding);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const moveUnit = useGameStore((s) => s.moveUnit);
  const attackUnit = useGameStore((s) => s.attackUnit);

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

  // Animated cameraY tracking
  const animRef = useRef<number | null>(null);
  const prevCameraY = useRef(cameraY);

  // When cameraY changes from store, smoothly animate the vertical offset
  useEffect(() => {
    if (cameraY === prevCameraY.current) return;
    prevCameraY.current = cameraY;

    const targetY = cameraY * tileSize;
    const startY = -offset.y; // current scroll-top (positive = scrolled down)
    const diff = targetY - startY;
    if (Math.abs(diff) < 1) return;

    const duration = RENDER.CAMERA_ANIMATION_MS;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = t * (2 - t);
      const newScrollTop = startY + diff * eased;

      setOffset((prev) => ({ ...prev, y: -newScrollTop }));

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = null;
      }
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [cameraY, tileSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan / Drag handlers ──
  // On desktop: drag is activated only while RMB is held.
  // On touch / pen: drag is activated by primary pointer (finger).
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isTouch = e.pointerType === 'touch';
      const isRMB = e.button === 2;

      // Reset isDragging on any pointer-down so a post-drag LMB click isn't blocked
      dragState.current.isDragging = false;

      const shouldDrag = isRMB || (isTouch && e.isPrimary);
      if (!shouldDrag) return;

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
    [offset],
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
    // isDragging intentionally not reset here – onClick checks it to skip post-drag clicks
  }, []);

  // ── Reachable / Attackable sets ──
  const selectedUnit = selectedUnitId ? units[selectedUnitId] : undefined;

  const reachableSet = useMemo<Set<string>>(() => {
    if (!selectedUnit || selectedUnit.faction !== Faction.PLAYER) return new Set();
    const tiles = getReachableTiles(useGameStore.getState(), selectedUnit.id);
    return new Set(tiles.map((p) => posKey(p.x, p.y)));
  }, [selectedUnit]);

  const attackableSet = useMemo<Set<string>>(() => {
    if (!selectedUnit || selectedUnit.faction !== Faction.PLAYER) return new Set();
    return getAttackableTileKeys(selectedUnit, units);
  }, [selectedUnit, units]);

  // ── Tile click ──
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (dragState.current.isDragging) return;

      const tile = grid[y][x];
      const key = posKey(x, y);

      // If a player unit is selected...
      if (selectedUnit && selectedUnit.faction === Faction.PLAYER) {
        // Attack?
        if (attackableSet.has(key) && tile.unitId) {
          attackUnit(selectedUnit.id, tile.unitId);
          return;
        }
        // Move?
        if (reachableSet.has(key)) {
          moveUnit(selectedUnit.id, { x, y });
          return;
        }
      }

      // Select unit on tile
      if (tile.unitId) {
        const u = units[tile.unitId];
        if (u && u.faction === Faction.PLAYER) {
          selectUnit(tile.unitId);
          return;
        }
      }

      // Select building on tile
      if (tile.buildingId) {
        selectBuilding(tile.buildingId);
        return;
      }

      // Clicking empty tile clears selection
      clearSelection();
    },
    [grid, selectedUnit, attackableSet, reachableSet, units, selectUnit, selectBuilding, clearSelection, moveUnit, attackUnit],
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

  // Determine overlay
  let overlay: string | null = null;
  if (!tile.isRevealed) {
    overlay = null; // already coloured
  } else if (tile.isLavaPreview && !tile.isLava) {
    overlay = RENDER.COLORS.LAVA_PREVIEW_OVERLAY;
  } else if (tile.isInFogOfWar) {
    overlay = RENDER.COLORS.FOG_OVERLAY;
  }

  // Highlight overlays
  let highlightOverlay: string | null = null;
  if (isAttackable) highlightOverlay = RENDER.COLORS.ATTACKABLE_OVERLAY;
  else if (isReachable) highlightOverlay = RENDER.COLORS.REACHABLE_OVERLAY;

  const showUnit = unit && tile.isRevealed && !tile.isInFogOfWar;
  const showBuilding = building && tile.isRevealed;

  // Resource production icon for visible resource buildings
  const resourceIcon =
    showBuilding && building && !tile.isInFogOfWar
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
      {/* fog / lava-preview overlay */}
      {overlay && <div className="tile-overlay" style={{ backgroundColor: overlay }} />}

      {/* highlight overlay */}
      {highlightOverlay && (
        <div className="tile-overlay" style={{ backgroundColor: highlightOverlay }} />
      )}

      {/* building emoji */}
      {showBuilding && building && (
        <span className="tile-building" style={{ fontSize: buildingIconSize }}>
          {BUILDING_EMOJI[building.type] ?? ''}
        </span>
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

  return (
    <div className="tile-unit">
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
      <span className="unit-emoji" style={{ fontSize: `${unitEmojiSize}px` }}>{UNIT_EMOJI[unit.type] ?? '?'}</span>
      {hasLavaBoost && (
        <div
          className="lava-boost-bar"
          style={{ '--color-lava-boost': RENDER.COLORS.LAVA_BOOST_BAR } as React.CSSProperties}
        />
      )}
    </div>
  );
}
