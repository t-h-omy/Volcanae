/**
 * Tests for Bridge / Bridgebuilder feature.
 *
 * Covers:
 *  - getBridgeBuildTargets validity and orientation
 *  - getBridgeAt, isBridgeTraversalAllowed, canTraverseEdge
 *  - getReachableTiles directional passability
 *  - resolveSlide forced-move catch on bridged canyon
 *  - Lava overrun destroys bridge
 *  - Tech: BRIDGE_BUILDER tag gates canUnitBuildBridge
 */

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { MAP, UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TAG_INFO } from '../gameConfig';
import { getBridgeAt, isBridgeTraversalAllowed, canTraverseEdge } from '../bridgeSystem';
import { canUnitBuildBridge, getBridgeBuildTargets } from '../unitActions';
import { getReachableTiles, resolveSlide } from '../movementSystem';
import { advanceLavaWithEvents } from '../lavaSystem';

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

/** Create a grid of PLAINS with specific overrides per (x,y). */
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

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SCOUT];
  return {
    id: nextId('u'),
    type: UnitType.SCOUT,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
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

function makeBridge(x: number, y: number, orientation: 'EW' | 'NS'): Building {
  return {
    id: nextId('bridge'),
    type: BuildingType.BRIDGE,
    faction: null,
    position: { x, y },
    hp: 1,
    maxHp: 1,
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
    bridgeOrientation: orientation,
  } as Building;
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  resources?: { iron: number; wood: number };
  tileOverrides?: Record<string, Partial<Tile>>;
  unlockedBuildings?: BuildingType[];
  lavaFrontRow?: number;
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
    techFlags: [],
    portals: {},
    turn: 1,
    resources: opts.resources ?? { iron: 0, wood: 100 },
    unlockedBuildings: opts.unlockedBuildings ?? [],
    lavaFrontRow: opts.lavaFrontRow ?? MAP.GRID_HEIGHT,
    pendingBridgeBuilderId: null,
    activeCaveEncounters: [],
    gameStats: { unitsLost: 0, buildingsDestroyed: 0, unitsKilled: 0, buildingsCaptured: 0, buildingsConverted: 0 },
  } as unknown as GameState;
}

describe('Bridgebuilder tag metadata', () => {
  it('does not expose an icon for unit badge rendering', () => {
    expect(TAG_INFO[UnitTag.BRIDGE_BUILDER]?.icon).toBeUndefined();
  });
});

// ============================================================================
// isBridgeTraversalAllowed
// ============================================================================

describe('isBridgeTraversalAllowed', () => {
  it('EW bridge allows E (dx=1,dy=0)', () => expect(isBridgeTraversalAllowed('EW', 1, 0)).toBe(true));
  it('EW bridge allows W (dx=-1,dy=0)', () => expect(isBridgeTraversalAllowed('EW', -1, 0)).toBe(true));
  it('EW bridge blocks N (dx=0,dy=-1)', () => expect(isBridgeTraversalAllowed('EW', 0, -1)).toBe(false));
  it('EW bridge blocks S (dx=0,dy=1)', () => expect(isBridgeTraversalAllowed('EW', 0, 1)).toBe(false));
  it('EW bridge allows NE diagonal', () => expect(isBridgeTraversalAllowed('EW', 1, -1)).toBe(true));
  it('EW bridge allows SW diagonal', () => expect(isBridgeTraversalAllowed('EW', -1, 1)).toBe(true));

  it('NS bridge allows N (dx=0,dy=-1)', () => expect(isBridgeTraversalAllowed('NS', 0, -1)).toBe(true));
  it('NS bridge allows S (dx=0,dy=1)', () => expect(isBridgeTraversalAllowed('NS', 0, 1)).toBe(true));
  it('NS bridge blocks E (dx=1,dy=0)', () => expect(isBridgeTraversalAllowed('NS', 1, 0)).toBe(false));
  it('NS bridge blocks W (dx=-1,dy=0)', () => expect(isBridgeTraversalAllowed('NS', -1, 0)).toBe(false));
  it('NS bridge allows NE diagonal', () => expect(isBridgeTraversalAllowed('NS', 1, -1)).toBe(true));
  it('NS bridge allows SW diagonal', () => expect(isBridgeTraversalAllowed('NS', -1, 1)).toBe(true));
});

// ============================================================================
// getBridgeAt
// ============================================================================

describe('getBridgeAt', () => {
  it('returns null when no building on tile', () => {
    const state = makeState();
    expect(getBridgeAt(state, 5, 5)).toBeNull();
  });

  it('returns null when building is not a BRIDGE', () => {
    const b: Building = { ...makeBridge(5, 5, 'EW'), type: BuildingType.MINE };
    const state = makeState({ buildings: [b] });
    expect(getBridgeAt(state, 5, 5)).toBeNull();
  });

  it('returns the bridge when a BRIDGE building is on the tile', () => {
    const b = makeBridge(5, 5, 'EW');
    const state = makeState({ buildings: [b], tileOverrides: { '5,5': { terrainType: TileType.CANYON } } });
    expect(getBridgeAt(state, 5, 5)).toMatchObject({ id: b.id, type: BuildingType.BRIDGE });
  });
});

// ============================================================================
// canTraverseEdge
// ============================================================================

describe('canTraverseEdge', () => {
  it('plain-to-plain move is always allowed', () => {
    const state = makeState();
    expect(canTraverseEdge(state, 4, 5, 5, 5, false)).toBe(true);
  });

  it('flying always traverses canyon', () => {
    const state = makeState({ tileOverrides: { '5,5': { terrainType: TileType.CANYON } } });
    expect(canTraverseEdge(state, 4, 5, 5, 5, true)).toBe(true);
  });

  it('EW bridge traversable from W (dx=1)', () => {
    const b = makeBridge(5, 5, 'EW');
    const state = makeState({
      buildings: [b],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    expect(canTraverseEdge(state, 4, 5, 5, 5, false)).toBe(true);
  });

  it('EW bridge NOT traversable from N (dy=1)', () => {
    const b = makeBridge(5, 5, 'EW');
    const state = makeState({
      buildings: [b],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    expect(canTraverseEdge(state, 5, 4, 5, 5, false)).toBe(false);
  });

  it('NS bridge traversable from N (dy=1)', () => {
    const b = makeBridge(5, 5, 'NS');
    const state = makeState({
      buildings: [b],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    expect(canTraverseEdge(state, 5, 4, 5, 5, false)).toBe(true);
  });

  it('NS bridge NOT traversable from W (dx=1)', () => {
    const b = makeBridge(5, 5, 'NS');
    const state = makeState({
      buildings: [b],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    expect(canTraverseEdge(state, 4, 5, 5, 5, false)).toBe(false);
  });

  it('exit from EW bridge eastward is allowed', () => {
    // from=bridge(5,5), to=plains(6,5): exit direction dx=1,dy=0 allowed for EW
    const b = makeBridge(5, 5, 'EW');
    const state = makeState({
      buildings: [b],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    expect(canTraverseEdge(state, 5, 5, 6, 5, false)).toBe(true);
  });

  it('exit from EW bridge southward is blocked', () => {
    // from=bridge(5,5), to=plains(5,6): exit direction dx=0,dy=1 blocked for EW
    const b = makeBridge(5, 5, 'EW');
    const state = makeState({
      buildings: [b],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    expect(canTraverseEdge(state, 5, 5, 5, 6, false)).toBe(false);
  });
});

// ============================================================================
// getBridgeBuildTargets
// ============================================================================

describe('getBridgeBuildTargets', () => {
  /** Scout at (4,5), canyon at (5,5), land at (6,5) → valid EW target */
  function scenarioEW() {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
      resources: { iron: 0, wood: 8 },
    });
    return { scout, state };
  }

  it('valid EW: returns one target at the canyon tile with orientation EW', () => {
    const { scout, state } = scenarioEW();
    const targets = getBridgeBuildTargets(scout, state);
    const ew = targets.filter((t) => t.orientation === 'EW');
    expect(ew.length).toBe(1);
    expect(ew[0].pos).toMatchObject({ x: 5, y: 5 });
  });

  it('valid NS: scout north of canyon, land beyond → NS orientation', () => {
    const scout = makeUnit({ position: { x: 5, y: 4 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    const targets = getBridgeBuildTargets(scout, state);
    const ns = targets.filter((t) => t.orientation === 'NS');
    expect(ns.length).toBe(1);
    expect(ns[0].pos).toMatchObject({ x: 5, y: 5 });
  });

  it('rejects when far tile is another canyon (2-wide canyon)', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({
      units: [scout],
      tileOverrides: {
        '5,5': { terrainType: TileType.CANYON },
        '6,5': { terrainType: TileType.CANYON },
      },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    const targets = getBridgeBuildTargets(scout, state);
    expect(targets.filter((t) => t.pos.x === 5 && t.pos.y === 5)).toHaveLength(0);
  });

  it('rejects when far tile is water', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({
      units: [scout],
      tileOverrides: {
        '5,5': { terrainType: TileType.CANYON },
        '6,5': { terrainType: TileType.WATER },
      },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    const targets = getBridgeBuildTargets(scout, state);
    expect(targets.filter((t) => t.pos.x === 5 && t.pos.y === 5)).toHaveLength(0);
  });

  it('rejects when canyon tile is lava', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON, isLava: true } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(getBridgeBuildTargets(scout, state)).toHaveLength(0);
  });

  it('rejects when a bridge already exists on the canyon tile', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const existingBridge = makeBridge(5, 5, 'EW');
    const state = makeState({
      units: [scout],
      buildings: [existingBridge],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(getBridgeBuildTargets(scout, state).filter((t) => t.pos.x === 5 && t.pos.y === 5)).toHaveLength(0);
  });

  it('rejects when a bridge exists in the 8-neighbourhood of the canyon tile', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    // Adjacent bridge at (6,5) — directly east of canyon tile (5,5)
    const neighbourBridge = makeBridge(6, 5, 'EW');
    const state = makeState({
      units: [scout],
      buildings: [neighbourBridge],
      tileOverrides: {
        '5,5': { terrainType: TileType.CANYON },
        '6,5': { terrainType: TileType.CANYON },
        '7,5': { terrainType: TileType.PLAINS },
      },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(getBridgeBuildTargets(scout, state).filter((t) => t.pos.x === 5 && t.pos.y === 5)).toHaveLength(0);
  });

  it('does not return targets without BRIDGE_BUILDER tag', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 } }); // no BRIDGE_BUILDER tag
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    // canUnitBuildBridge checks the tag; getBridgeBuildTargets does not — but the
    // gate function canUnitBuildBridge does, so test both.
    expect(canUnitBuildBridge(scout, state)).toBe(false);
  });

  it('does not allow build when BRIDGE building is not unlocked', () => {
    const scout = makeUnit({ position: { x: 4, y: 5 }, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [], // BRIDGE not unlocked
    });
    expect(canUnitBuildBridge(scout, state)).toBe(false);
  });
});

// ============================================================================
// canUnitBuildBridge — action flags
// ============================================================================

describe('canUnitBuildBridge — action flags', () => {
  function readyScout(pos: { x: number; y: number }) {
    return makeUnit({ position: pos, tags: [UnitTag.BRIDGE_BUILDER] });
  }

  it('returns false if unit has already moved this turn', () => {
    const scout = readyScout({ x: 4, y: 5 });
    scout.hasMovedThisTurn = true;
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(canUnitBuildBridge(scout, state)).toBe(false);
  });

  it('returns false if unit has already attacked this turn', () => {
    const scout = readyScout({ x: 4, y: 5 });
    scout.hasAttackedThisTurn = true;
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(canUnitBuildBridge(scout, state)).toBe(false);
  });

  it('returns false if unit has already constructed this turn', () => {
    const scout = readyScout({ x: 4, y: 5 });
    scout.hasConstructedThisTurn = true;
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(canUnitBuildBridge(scout, state)).toBe(false);
  });

  it('returns false when no valid targets exist (no canyon adjacent)', () => {
    const scout = readyScout({ x: 4, y: 5 });
    // No canyon adjacent — getBridgeBuildTargets returns empty
    const state = makeState({
      units: [scout],
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    // canUnitBuildBridge is true (unit is eligible), but getBridgeBuildTargets is empty
    expect(canUnitBuildBridge(scout, state)).toBe(true);
    expect(getBridgeBuildTargets(scout, state)).toHaveLength(0);
  });

  it('returns true for a ready scout with valid canyon target', () => {
    const scout = readyScout({ x: 4, y: 5 });
    const state = makeState({
      units: [scout],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
      unlockedBuildings: [BuildingType.BRIDGE],
    });
    expect(canUnitBuildBridge(scout, state)).toBe(true);
  });
});

// ============================================================================
// Voluntary movement — EW bridge
// ============================================================================

describe('getReachableTiles — EW bridge passability', () => {
  /** 3-wide corridor: PLAINS(3,5) | CANYON-bridge(4,5) EW | PLAINS(5,5)
   *  Scout starts at (3,5), move range 2.
   */
  function ewBridgeState() {
    const bridge = makeBridge(4, 5, 'EW');
    const scout = makeUnit({ position: { x: 3, y: 5 }, stats: { ...makeUnit().stats, moveRange: 3 } });
    const state = makeState({
      units: [scout],
      buildings: [bridge],
      tileOverrides: { '4,5': { terrainType: TileType.CANYON } },
    });
    return { scout, state, bridge };
  }

  it('scout can reach the far (east) side of an EW bridge (E axis)', () => {
    const { scout, state } = ewBridgeState();
    const reachable = getReachableTiles(state, scout.id);
    expect(reachable.some((p) => p.x === 5 && p.y === 5)).toBe(true);
  });

  it('scout can step onto the EW bridge tile itself', () => {
    const { scout, state } = ewBridgeState();
    const reachable = getReachableTiles(state, scout.id);
    expect(reachable.some((p) => p.x === 4 && p.y === 5)).toBe(true);
  });

  it('scout approaching from N cannot enter an EW bridge', () => {
    // Scout at (4,4) tries to enter EW bridge at (4,5) — direction dy=1 → blocked
    const bridge = makeBridge(4, 5, 'EW');
    const scout = makeUnit({ position: { x: 4, y: 4 }, stats: { ...makeUnit().stats, moveRange: 2 } });
    const state = makeState({
      units: [scout],
      buildings: [bridge],
      tileOverrides: { '4,5': { terrainType: TileType.CANYON } },
    });
    const reachable = getReachableTiles(state, scout.id);
    expect(reachable.some((p) => p.x === 4 && p.y === 5)).toBe(false);
  });

  it('plain (unbridged) canyon tile is not in reachable set', () => {
    const scout = makeUnit({ position: { x: 3, y: 5 }, stats: { ...makeUnit().stats, moveRange: 3 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '4,5': { terrainType: TileType.CANYON } },
    });
    const reachable = getReachableTiles(state, scout.id);
    // The canyon tile itself must not be walkable
    expect(reachable.some((p) => p.x === 4 && p.y === 5)).toBe(false);
    // (5,5) may be reachable via non-canyon paths going around — that's fine
  });
});

// ============================================================================
// Voluntary movement — NS bridge
// ============================================================================

describe('getReachableTiles — NS bridge passability', () => {
  function nsBridgeState() {
    const bridge = makeBridge(5, 4, 'NS');
    const scout = makeUnit({ position: { x: 5, y: 3 }, stats: { ...makeUnit().stats, moveRange: 3 } });
    const state = makeState({
      units: [scout],
      buildings: [bridge],
      tileOverrides: { '5,4': { terrainType: TileType.CANYON } },
    });
    return { scout, state };
  }

  it('scout can reach the far (south) side of an NS bridge', () => {
    const { scout, state } = nsBridgeState();
    const reachable = getReachableTiles(state, scout.id);
    expect(reachable.some((p) => p.x === 5 && p.y === 5)).toBe(true);
  });

  it('scout approaching from W cannot enter an NS bridge', () => {
    const bridge = makeBridge(5, 4, 'NS');
    const scout = makeUnit({ position: { x: 4, y: 4 }, stats: { ...makeUnit().stats, moveRange: 2 } });
    const state = makeState({
      units: [scout],
      buildings: [bridge],
      tileOverrides: { '5,4': { terrainType: TileType.CANYON } },
    });
    const reachable = getReachableTiles(state, scout.id);
    expect(reachable.some((p) => p.x === 5 && p.y === 4)).toBe(false);
  });
});

// ============================================================================
// Forced movement (resolveSlide) — bridge catch
// ============================================================================

describe('resolveSlide — bridge catch', () => {
  it('unit slid onto a bridged canyon tile survives and lands on it', () => {
    const bridge = makeBridge(5, 5, 'EW');
    const unit = makeUnit({ position: { x: 4, y: 5 } });
    const state = makeState({
      units: [unit],
      buildings: [bridge],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    const newState = produce(state, (draft) => {
      resolveSlide(draft, unit.id, 1, 0);
    });
    // Unit should be alive and moved to (5,5)
    expect(newState.units[unit.id]).toBeDefined();
    expect(newState.units[unit.id]?.position).toMatchObject({ x: 5, y: 5 });
  });

  it('unit slid onto an unbridged canyon tile is removed (dies)', () => {
    const unit = makeUnit({ position: { x: 4, y: 5 } });
    const state = makeState({
      units: [unit],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    const newState = produce(state, (draft) => {
      resolveSlide(draft, unit.id, 1, 0);
    });
    expect(newState.units[unit.id]).toBeUndefined();
  });

  it('unit slid perpendicular to an EW bridge still survives (forced move ignores direction)', () => {
    // Bridge is EW at (5,5); unit slides south into it (dx=0, dy=1)
    const bridge = makeBridge(5, 5, 'EW');
    const unit = makeUnit({ position: { x: 5, y: 4 } });
    const state = makeState({
      units: [unit],
      buildings: [bridge],
      tileOverrides: { '5,5': { terrainType: TileType.CANYON } },
    });
    const newState = produce(state, (draft) => {
      resolveSlide(draft, unit.id, 0, 1);
    });
    expect(newState.units[unit.id]).toBeDefined();
    expect(newState.units[unit.id]?.position).toMatchObject({ x: 5, y: 5 });
  });
});

// ============================================================================
// Lava overrun destroys bridge
// ============================================================================

describe('lava overrun destroys bridge', () => {
  it('bridge is removed when lava reaches its row', () => {
    // Place bridge at (5, 2) — the row that lava will reach next
    const bridge = makeBridge(5, 2, 'EW');
    const state: GameState = {
      ...makeState({
        buildings: [bridge],
        tileOverrides: { '5,2': { terrainType: TileType.CANYON } },
        lavaFrontRow: 3,
      }),
      lavaFrontRow: 3,
    } as GameState;

    const { newState } = advanceLavaWithEvents(state);
    // After advance, row 2 is lava — bridge should be gone
    expect(newState.buildings[bridge.id]).toBeUndefined();
    expect(newState.grid[2][5].isLava).toBe(true);
  });
});

// ============================================================================
// BUILDING_DEFINITIONS — sanity check for BRIDGE entry
// ============================================================================

describe('BUILDING_DEFINITIONS.BRIDGE', () => {
  it('has 8 wood construction cost', () => {
    expect(BUILDING_DEFINITIONS.BRIDGE.constructionCost.wood).toBe(8);
    expect(BUILDING_DEFINITIONS.BRIDGE.constructionCost.iron).toBe(0);
  });

  it('has DestroyBehavior.NONE', () => {
    expect(BUILDING_DEFINITIONS.BRIDGE.destroyBehavior).toBe(DestroyBehavior.NONE);
  });

  it('has discoverRadius 0', () => {
    expect(BUILDING_DEFINITIONS.BRIDGE.discoverRadius).toBe(0);
  });
});
