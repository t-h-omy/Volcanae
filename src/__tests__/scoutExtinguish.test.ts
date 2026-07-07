/**
 * Tests for SP-04 Cinder Warden — Scout "Extinguish" feature (spec_10, SCOUT_EXTINGUISH).
 *
 * Covers:
 *  - canUnitExtinguish: gating rules (unit type, faction, specialist effect, action flags)
 *  - scoutExtinguish action: clears BURNING and CORRUPTED tile statuses on the
 *    scout's tile and all tiles within EXTINGUISH_RADIUS; marks unit as spent;
 *    does not clear other statuses (e.g. FROZEN); does not remove buildings.
 */

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BuildingType, DestroyBehavior, Faction, TileStatus, TileType, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { canUnitExtinguish } from '../unitActions';
import { clearTileStatus } from '../tileStatusSystem';
import { getTilesWithinEdgeCircleRange } from '../rangeUtils';
import { createInitialSpecialists } from '../specialistSystem';

// ============================================================================
// Helpers
// ============================================================================

let idSeq = 0;
function nextId(prefix = 'x'): string {
  return `${prefix}${++idSeq}`;
}

function makeTile(x: number, y: number, overrides: Partial<Tile> = {}): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status: undefined as unknown as Tile['status'],
    hasCaveMonster: false,
    ...overrides,
  } as unknown as Tile;
}

function makeGrid(
  w = MAP.GRID_WIDTH,
  h = MAP.GRID_HEIGHT,
  tileOverrides: Record<string, Partial<Tile>> = {},
): Tile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const key = `${x},${y}`;
      return makeTile(x, y, tileOverrides[key] ?? {});
    }),
  );
}

function makeScout(overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SCOUT];
  return {
    id: nextId('u'),
    type: UnitType.SCOUT,
    faction: Faction.PLAYER,
    position: { x: 5, y: 5 },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    ...overrides,
  } as Unit;
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  tileOverrides?: Record<string, Partial<Tile>>;
  globalSpecialistStorage?: string[];
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildings[b.id] = b;
  const grid = makeGrid(MAP.GRID_WIDTH, MAP.GRID_HEIGHT, opts.tileOverrides ?? {});
  for (const u of Object.values(units)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of Object.values(buildings)) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }
  return {
    units,
    buildings,
    grid,
    turn: 1,
    resources: { iron: 10, wood: 10 },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: opts.globalSpecialistStorage ?? [],
    gameStats: {
      unitsLost: 0,
      buildingsDestroyed: 0,
      unitsKilled: 0,
      buildingsCaptured: 0,
      buildingsConverted: 0,
    },
  } as unknown as GameState;
}

/** Inline extinguish logic (mirrors the gameStore action, sans floater). */
function applyExtinguish(state: GameState, unitId: string): GameState {
  return produce(state, (draft) => {
    const unit = draft.units[unitId];
    if (!unit) return;
    if (!canUnitExtinguish(unit, draft)) return;

    const { x, y } = unit.position;
    const mapWidth = draft.grid[0]?.length ?? 0;
    const mapHeight = draft.grid.length;

    const tilesInRange = getTilesWithinEdgeCircleRange(
      x, y, ABILITIES.EXTINGUISH_RADIUS, mapWidth, mapHeight,
    );
    const allPositions = [{ x, y }, ...tilesInRange];

    for (const pos of allPositions) {
      const tile = draft.grid[pos.y]?.[pos.x];
      if (!tile) continue;
      if (tile.status === TileStatus.BURNING || tile.status === TileStatus.CORRUPTED) {
        clearTileStatus(draft, pos);
      }
    }

    unit.hasConstructedThisTurn = true;
  });
}

// ============================================================================
// canUnitExtinguish — gating
// ============================================================================

describe('canUnitExtinguish', () => {
  it('returns true for a fresh PLAYER Scout when SCOUT_EXTINGUISH specialist is active', () => {
    const scout = makeScout();
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(scout, state)).toBe(true);
  });

  it('returns false when no specialist with SCOUT_EXTINGUISH effect is active', () => {
    const scout = makeScout();
    const state = makeState({ units: [scout], globalSpecialistStorage: [] });
    expect(canUnitExtinguish(scout, state)).toBe(false);
  });

  it('returns false for a non-SCOUT unit type', () => {
    const warrior = makeScout({ type: UnitType.SPEARMAN });
    const state = makeState({ units: [warrior], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(warrior, state)).toBe(false);
  });

  it('returns false for ENEMY faction', () => {
    const enemy = makeScout({ faction: Faction.ENEMY });
    const state = makeState({ units: [enemy], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(enemy, state)).toBe(false);
  });

  it('returns false when hasMovedThisTurn', () => {
    const scout = makeScout({ hasMovedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(scout, state)).toBe(false);
  });

  it('returns false when hasAttackedThisTurn', () => {
    const scout = makeScout({ hasAttackedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(scout, state)).toBe(false);
  });

  it('returns false when hasConstructedThisTurn', () => {
    const scout = makeScout({ hasConstructedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(scout, state)).toBe(false);
  });

  it('returns false when hasCapturedThisTurn', () => {
    const scout = makeScout({ hasCapturedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(scout, state)).toBe(false);
  });

  it('returns false when hasDestroyedThisTurn', () => {
    const scout = makeScout({ hasDestroyedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_10'] });
    expect(canUnitExtinguish(scout, state)).toBe(false);
  });
});

// ============================================================================
// scoutExtinguish — action behaviour
// ============================================================================

describe('scoutExtinguish action', () => {
  it('clears BURNING status on the scout\'s own tile', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '5,5': { status: TileStatus.BURNING } },
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.grid[5][5].status).toBeNull();
  });

  it('clears CORRUPTED status on the scout\'s own tile', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '5,5': { status: TileStatus.CORRUPTED } },
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.grid[5][5].status).toBeNull();
  });

  it('clears BURNING status on a tile within EXTINGUISH_RADIUS', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    // Tile (6,5) is 1 step away — within radius 1
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '6,5': { status: TileStatus.BURNING } },
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.grid[5][6].status).toBeNull();
  });

  it('clears CORRUPTED status on a tile within EXTINGUISH_RADIUS', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '5,6': { status: TileStatus.CORRUPTED } },
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.grid[6][5].status).toBeNull();
  });

  it('does not clear status on a tile outside EXTINGUISH_RADIUS', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    // Tile (8,5) is 3 steps away — outside radius 1
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '8,5': { status: TileStatus.BURNING } },
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.grid[5][8].status).toBe(TileStatus.BURNING);
  });

  it('does not clear FROZEN status (only BURNING and CORRUPTED are targeted)', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '5,5': { status: TileStatus.FROZEN } },
    });

    const next = applyExtinguish(state, scout.id);
    // FROZEN is not cleared by extinguish
    expect(next.grid[5][5].status).toBe(TileStatus.FROZEN);
  });

  it('marks the scout as having constructed this turn', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.units[scout.id]!.hasConstructedThisTurn).toBe(true);
  });

  it('does nothing when canUnitExtinguish returns false (no specialist)', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: [],
      tileOverrides: { '5,5': { status: TileStatus.BURNING } },
    });

    const next = applyExtinguish(state, scout.id);
    // Status unchanged, unit not spent
    expect(next.grid[5][5].status).toBe(TileStatus.BURNING);
    expect(next.units[scout.id]!.hasConstructedThisTurn).toBe(false);
  });

  it('does not remove buildings on affected tiles', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    // Place a dummy building on the neighbour tile alongside CORRUPTED status
    const building: Building = {
      id: nextId('b'),
      type: BuildingType.MINE,
      faction: Faction.PLAYER,
      position: { x: 6, y: 5 },
      hp: 10,
      maxHp: 10,
      specialistSlot: null,
      isDisabledForTurns: 0,
      wasAttackedLastEnemyTurn: false,
      captureProgress: 0,
      isBeingCapturedBy: null,
      lavaBoostEnabled: false,
      discoverRadius: 0,
      turnCapturedByPlayer: null,
      wasEnemyOwnedBeforeCapture: false,
      combatStats: null,
      hasAttackedThisTurn: false,
      tags: [],
      consumesUnitOnCapture: false,
      populationCount: 0,
      populationCap: 0,
      populationGrowthCounter: 0,
      strongholdNobles: 0,
      emberSpawnCounter: 0,
      recruitmentQueue: null,
      destroyBehavior: DestroyBehavior.NONE,
      resonanceTurnsRemaining: 0,
      spawnCooldownRemaining: 0,
      lastRecruitmentTurn: 0,
      trapStunTurns: 0,
      trapDamage: 0,
    } as Building;

    const state = makeState({
      units: [scout],
      buildings: [building],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: { '6,5': { status: TileStatus.CORRUPTED } },
    });

    const next = applyExtinguish(state, scout.id);
    // Tile status cleared
    expect(next.grid[5][6].status).toBeNull();
    // Building still present
    expect(next.buildings[building.id]).toBeDefined();
    expect(next.grid[5][6].buildingId).toBe(building.id);
  });

  it('clears BURNING and CORRUPTED on multiple tiles in the same sweep', () => {
    const scout = makeScout({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_10'],
      tileOverrides: {
        '5,5': { status: TileStatus.BURNING },
        '6,5': { status: TileStatus.CORRUPTED },
        '5,6': { status: TileStatus.BURNING },
      },
    });

    const next = applyExtinguish(state, scout.id);
    expect(next.grid[5][5].status).toBeNull();
    expect(next.grid[5][6].status).toBeNull();
    expect(next.grid[6][5].status).toBeNull();
  });
});
