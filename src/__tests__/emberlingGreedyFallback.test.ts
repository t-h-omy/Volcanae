/**
 * VF-10 — Emberling greedy fallback
 *
 * When `findBfsPath` returns an empty path (congested frontline), `moveEnemyUnitToward`
 * must attempt one greedy step to the best free neighbour.  Three cases:
 *
 *  (a) Ember boxed in on the direct path but with one free sideways neighbour
 *      closer to the lava target — the greedy step moves the ember there.
 *  (b) Fully surrounded ember with an adjacent player unit — on the second AI
 *      action iteration (after the no-op ADVANCE_TOWARD_LAVA sets hasMovedThisTurn),
 *      it scores and executes EXPLODE, removing the ember from the state.
 *  (c) Greedy fallback never selects a lava tile — when the only free neighbour
 *      is lava, the ember does not move.
 */

import { describe, it, expect } from 'vitest';
import { runEnemyTurn } from '../enemySystem';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { Faction, TileType, UnitTag, UnitType } from '../types';
import type { GameState, GameStats, Tile, Unit } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0,
    buildingsDestroyedByLava: 0,
  };
}

function makeTile(x: number, y: number): Tile {
  return {
    position: { x, y }, isRevealed: true, buildingId: null, unitId: null,
    isLava: false, isLavaPreview: false, isRuin: false, isStrongholdRuin: false,
    terrainType: TileType.PLAINS, status: null,
  };
}

function makeGrid(
  unitPlacements: { id: string; x: number; y: number }[],
  lavaPlacements: { x: number; y: number }[] = [],
): Tile[][] {
  const grid: Tile[][] = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
  }
  for (const { x, y } of lavaPlacements) {
    grid[y][x].isLava = true;
  }
  return grid;
}

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

function makeUnit(
  id: string,
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  statOverrides: Partial<Unit['stats']> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  return {
    id, type, faction, position: { x, y },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack,
      defense: def.defense, moveRange: def.moveRange,
      discoverRadius: def.discoverRadius, triggerRange: def.triggerRange,
      movementActions: def.movementActions, attackRange: def.attackRange,
      ...statOverrides,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false,
    hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false, hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

/** Minimal GameState sufficient for runEnemyTurn (no spawn buildings → no recruits). */
function makeState(
  units: Unit[],
  gridMutator?: (grid: Tile[][]) => void,
  lavaFrontRow = 20,
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const grid = makeGrid(units.map(u => ({ id: u.id, x: u.position.x, y: u.position.y })));
  gridMutator?.(grid);
  return {
    units: unitsMap,
    buildings: {},
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 5,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techNodes: {} as GameState['techNodes'],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 999,  // prevent any spawning during tests
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    portals: {},
    phase: 'PLAYER_TURN',
  } as unknown as GameState;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VF-10 — Emberling greedy fallback when BFS finds no path', () => {
  /**
   * (a) Ember boxed in on direct path, one free sideways neighbour closer to target.
   *
   * Layout (x 0-8, y 0-MAP.GRID_HEIGHT):
   *   Ember at (4, 8). lavaFrontRow = 20. Target = (4, 20).
   *
   *   7 of the 8 neighbours of (4,8) are occupied by enemy grunts:
   *     (3,7), (4,7), (5,7), (3,8), (5,8), (3,9), (4,9).
   *   (5,9) is the only free neighbour.
   *
   *   (5,9)'s other non-visited neighbours are also blocked:
   *     (5,10), (6,8), (6,9), (6,10) → enemy grunts.
   *
   *   With (5,9) enclosed too, BFS from (4,8) exhausts all reachable tiles
   *   without ever reaching (4,20) → returns [].
   *
   *   Greedy fallback: (5,9) is free, dist to (4,20) = max(1, 11) = 11 < 12
   *   (current dist). Ember must move to (5,9).
   */
  it('moves onto the free sideways neighbour when BFS returns empty path', () => {
    const emberId = nextId('ember');
    const ember = makeUnit(emberId, UnitType.EMBERLING, Faction.ENEMY, 4, 8);

    // Blocking grunts around (4,8), leaving only (5,9) free
    const blockers: Unit[] = [
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 9),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 9),
      // Enclose (5,9) so BFS cannot route from there to (4,20):
      // block all of (5,9)'s neighbours except (4,8) (the ember itself).
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 10),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 10),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 6, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 6, 9),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 6, 10),
    ];

    const state = makeState([ember, ...blockers], undefined, 20);
    const { finalState } = runEnemyTurn(state);

    const emberAfter = finalState.units[emberId];
    expect(emberAfter).toBeDefined();
    // Ember should have moved to the only free neighbour closer to lava
    expect(emberAfter!.position).toEqual({ x: 5, y: 9 });
    // Grid at new position must have the ember's id
    expect(finalState.grid[9][5].unitId).toBe(emberId);
  });

  /**
   * (b) Fully surrounded ember with an adjacent player unit explodes on second iteration.
   *
   * All 8 neighbours of ember (4,8) are occupied:
   *   - 7 enemy grunts + 1 player Swordsman at (4,9) (adjacent, Chebyshev dist 1).
   *
   * Iteration 1: ADVANCE_TOWARD_LAVA scored (no move possible); hasMovedThisTurn=true.
   * Iteration 2: EXPLODE scored (isSacrificial + isBlocked + hasMovedThisTurn → +BONUS);
   *              EXPLODE wins, resolveExplosion destroys the ember.
   */
  it('fully surrounded ember executes EXPLODE on second action iteration', () => {
    const emberId = nextId('ember');
    const playerId = nextId('player');
    const ember = makeUnit(emberId, UnitType.EMBERLING, Faction.ENEMY, 4, 8);
    const player = makeUnit(playerId, UnitType.SWORDSMAN, Faction.PLAYER, 4, 9);

    const blockers: Unit[] = [
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 9),
      // (4,9) is the player Swordsman — not a blocker unit here
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 9),
    ];

    const state = makeState([ember, player, ...blockers], undefined, 20);
    const { finalState, events } = runEnemyTurn(state);

    // Ember must have exploded and been destroyed
    expect(finalState.units[emberId]).toBeUndefined();
    // An EXPLOSION event must have been emitted
    const explodeEvent = events.find(e => e.type === 'EXPLOSION' && (e as { unitId: string }).unitId === emberId);
    expect(explodeEvent).toBeDefined();
  });

  /**
   * (c) Greedy fallback never selects a lava tile.
   *
   * Ember at (4,8). All 8 neighbours occupied by grunts except (5,9) which is LAVA.
   * SACRIFICE_TO_LAVA does NOT fire because (5,9) is diagonal (only cardinal lava
   * triggers it). The greedy fallback must skip (5,9) because it is lava, leaving
   * no valid candidate — the ember stays at (4,8).
   */
  it('greedy fallback never steps onto a lava tile', () => {
    const emberId = nextId('ember');
    const ember = makeUnit(emberId, UnitType.EMBERLING, Faction.ENEMY, 4, 8);

    const blockers: Unit[] = [
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 7),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 8),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 9),
      makeUnit(nextId('g'), UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 9),
      // (5,9) is left unit-free but will be marked as lava in the grid mutator
    ];

    const state = makeState([ember, ...blockers], (grid) => {
      grid[9][5].isLava = true;
    }, 20);

    const { finalState } = runEnemyTurn(state);

    const emberAfter = finalState.units[emberId];
    // Ember must still exist (no accidental lava entry)
    expect(emberAfter).toBeDefined();
    // Ember must NOT have moved to the lava tile
    expect(emberAfter!.position).toEqual({ x: 4, y: 8 });
    expect(finalState.grid[9][5].unitId).toBeNull();
  });
});
