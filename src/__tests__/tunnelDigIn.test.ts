import { describe, expect, it } from 'vitest';
import { tryBeginTunnel, processTunnelTurn } from '../tunnelSystem';
import { ABILITIES, UNIT_DEFINITIONS } from '../gameConfig';
import { Faction, TileType, UnitTag, UnitType } from '../types';
import type { GameState, GameStats, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

// ---------------------------------------------------------------------------
// Shared helpers (mirrors tunnelSystem.test.ts style)
// ---------------------------------------------------------------------------

function makeTile(x: number, y: number): Tile {
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
    status: null,
  };
}

function makeGrid(
  unitPlacements: { id: string; x: number; y: number }[],
  terrainOverrides: { x: number; y: number; terrainType?: TileType; isRuin?: boolean; buildingId?: string | null }[] = [],
): Tile[][] {
  const width = 9;
  const height = 12;
  const grid: Tile[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
  }
  for (const override of terrainOverrides) {
    const { x, y, terrainType, isRuin, buildingId } = override;
    if (terrainType !== undefined) grid[y][x].terrainType = terrainType;
    if (isRuin !== undefined) grid[y][x].isRuin = isRuin;
    if (buildingId !== undefined) grid[y][x].buildingId = buildingId;
  }
  return grid;
}

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0,
    unitsLost: 0,
    damageDealt: 0,
    damageReceived: 0,
    unitsRecruited: 0,
    buildingsConstructed: 0,
    buildingsConverted: 0,
    techsUnlocked: 0,
    enemyBuildingsDestroyed: 0,
    enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0,
    buildingsCapturedByEnemy: 0,
    buildingsDestroyedByLava: 0,
  };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function makeUnit(
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  overrides: Partial<Unit> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId(type),
    type,
    faction,
    position: { x, y },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
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
  };
}

type TileOverride = {
  x: number;
  y: number;
  terrainType?: TileType;
  isRuin?: boolean;
  buildingId?: string | null;
};

function makeState(
  units: Unit[],
  tileOverrides: TileOverride[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;

  const placements = units
    .filter((u) => u.tunnelState !== 'UNDERGROUND' && u.tunnelState !== 'EMERGING')
    .map((u) => ({ id: u.id, x: u.position.x, y: u.position.y }));

  return {
    units: unitsMap,
    buildings: {},
    grid: makeGrid(placements, tileOverrides),
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 1,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
  } as unknown as GameState;
}

/** Three player spearmen south of y=2, to satisfy the tunnel heuristic. */
function makeSouthPlayerUnits(): Unit[] {
  return [
    makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 0, 9),
    makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 1, 9),
    makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 2, 9),
  ];
}

// ---------------------------------------------------------------------------
// Tests: dig-in blocked on restricted terrain / tiles
// ---------------------------------------------------------------------------

describe('Riftworm dig-in restrictions', () => {
  it('rejects dig-in on a FOREST tile', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    expect(worm.tags).toContain(UnitTag.TUNNEL);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [{ x: 4, y: 2, terrainType: TileType.FOREST }],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(false);
    expect(state.units[worm.id].tunnelState).toBeFalsy();
  });

  it('rejects dig-in on a MOUNTAIN tile', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [{ x: 4, y: 2, terrainType: TileType.MOUNTAIN }],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(false);
  });

  it('rejects dig-in on a tile with isRuin = true', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [{ x: 4, y: 2, isRuin: true }],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(false);
  });

  it('rejects dig-in on a tile with a building (regression guard)', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [{ x: 4, y: 2, buildingId: 'b_watchtower_1' }],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(false);
  });

  it('allows dig-in on a plain tile (positive control)', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    const players = makeSouthPlayerUnits();

    const state = makeState([worm, ...players]);

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(true);
    expect(state.units[worm.id].tunnelState).toBe('DIGGING_IN');
  });
});

// ---------------------------------------------------------------------------
// Tests: abort restore onto FOREST tile
// ---------------------------------------------------------------------------

describe('Riftworm abort restore onto FOREST tile', () => {
  it('restores an aborted worm onto its FOREST start tile', () => {
    // Put the worm in EMERGING state with no planned emergence tile (null),
    // which triggers _abortTunnel. The start position is a FOREST tile.
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2, {
      tunnelState: 'EMERGING',
      tunnelStartPosition: { x: 4, y: 2 },
      tunnelPlannedEmergence: null,
      tunnelTurnsUnderground: 1,
    });

    // State: worm is EMERGING (removed from grid), start tile is FOREST and free
    const state = makeState(
      [worm],
      [{ x: 4, y: 2, terrainType: TileType.FOREST }],
    );
    // EMERGING units are not placed on the grid by makeState, so tile (4,2) is free
    expect(state.grid[2][4].unitId).toBeNull();

    const events: GameEvent[] = [];
    const consumed = processTunnelTurn(state, worm.id, events);

    // processTunnelTurn returns false when it aborts
    expect(consumed).toBe(false);
    // Worm should be back on the FOREST tile
    expect(state.units[worm.id].position).toEqual({ x: 4, y: 2 });
    expect(state.grid[2][4].unitId).toBe(worm.id);
    expect(state.units[worm.id].tunnelState).toBe('IDLE');
  });
});

// ---------------------------------------------------------------------------
// Tests: emergence still refuses FOREST and MOUNTAIN
// ---------------------------------------------------------------------------

describe('Riftworm emergence still blocked by FOREST and MOUNTAIN', () => {
  it('skips FOREST as an emergence target', () => {
    // Worm at (4,2): valid plain dig-in tile.
    // Emergence span is based on ABILITIES.TUNNEL_RANGE_MIN..ABILITIES.TUNNEL_RANGE_MAX, yielding y=4,5,6 here.
    // Block y=4 and y=5 with FOREST; y=6 is plain, so emergence lands there.
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [
        { x: 4, y: 4, terrainType: TileType.FOREST },
        { x: 4, y: 5, terrainType: TileType.FOREST },
      ],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(true);
    // Emergence must not be on any FOREST tile
    const emergence = state.units[worm.id].tunnelPlannedEmergence!;
    expect(state.grid[emergence.y][emergence.x].terrainType).not.toBe(TileType.FOREST);
    expect(emergence).toEqual({ x: 4, y: 2 + ABILITIES.TUNNEL_RANGE_MAX });
  });

  it('skips MOUNTAIN as an emergence target', () => {
    // Block y=4 and y=5 with MOUNTAIN; y=6 is plain, so emergence lands there.
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [
        { x: 4, y: 4, terrainType: TileType.MOUNTAIN },
        { x: 4, y: 5, terrainType: TileType.MOUNTAIN },
      ],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(true);
    const emergence = state.units[worm.id].tunnelPlannedEmergence!;
    expect(state.grid[emergence.y][emergence.x].terrainType).not.toBe(TileType.MOUNTAIN);
    expect(emergence).toEqual({ x: 4, y: 2 + ABILITIES.TUNNEL_RANGE_MAX });
  });
});
