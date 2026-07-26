import { describe, expect, it } from 'vitest';
import { tryBeginTunnel, processTunnelTurn } from '../tunnelSystem';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { Faction, TileType, UnitTag, UnitType } from '../types';
import type { GameState, GameStats, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

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
  terrainOverrides: { x: number; y: number; terrainType: TileType }[] = [],
): Tile[][] {
  const width = 9;
  const height = 12;
  const grid: Tile[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
  }
  for (const { x, y, terrainType } of terrainOverrides) {
    grid[y][x].terrainType = terrainType;
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

function makeState(
  units: Unit[],
  terrainOverrides: { x: number; y: number; terrainType: TileType }[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;

  const placements = units
    .filter((u) => u.tunnelState !== 'UNDERGROUND' && u.tunnelState !== 'EMERGING')
    .map((u) => ({ id: u.id, x: u.position.x, y: u.position.y }));

  return {
    units: unitsMap,
    buildings: {},
    grid: makeGrid(placements, terrainOverrides),
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 1,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
  } as unknown as GameState;
}

function makeSouthPlayerUnits(): Unit[] {
  return [
    makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 0, 9),
    makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 1, 9),
    makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 2, 9),
  ];
}

describe('Riftworm emergence validation', () => {
  it('skips FOREST and MOUNTAIN in the emergence column and selects the next valid tile', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2);
    expect(worm.tags).toContain(UnitTag.TUNNEL);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [worm, ...players],
      [
        { x: 4, y: 4, terrainType: TileType.FOREST },
        { x: 4, y: 5, terrainType: TileType.MOUNTAIN },
      ],
    );

    const began = tryBeginTunnel(state, worm.id);
    expect(began).toBe(true);
    expect(state.units[worm.id].tunnelState).toBe('DIGGING_IN');
    expect(state.units[worm.id].tunnelPlannedEmergence).toEqual({ x: 4, y: 6 });
  });

  it('prevents two worms from selecting the same planned emergence tile', () => {
    const reservedExit = { x: 4, y: 3 };
    const wormA = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 0, {
      tunnelState: 'UNDERGROUND',
      tunnelStartPosition: { x: 4, y: 0 },
      tunnelPlannedEmergence: reservedExit,
      tunnelTurnsUnderground: 1,
    });
    const wormB = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 1);
    const players = makeSouthPlayerUnits();

    const state = makeState(
      [wormA, wormB, ...players],
      [{ x: 4, y: 4, terrainType: TileType.MOUNTAIN }],
    );

    const began = tryBeginTunnel(state, wormB.id);
    expect(began).toBe(true);
    expect(state.units[wormB.id].tunnelPlannedEmergence).toEqual({ x: 4, y: 5 });
    expect(state.units[wormB.id].tunnelPlannedEmergence).not.toEqual(reservedExit);
  });

  it('allows emergence on a tile targeted only by the same worm plan', () => {
    const worm = makeUnit(UnitType.RIFTWORM, Faction.ENEMY, 4, 2, {
      tunnelState: 'EMERGING',
      tunnelStartPosition: { x: 4, y: 2 },
      tunnelPlannedEmergence: { x: 4, y: 6 },
      tunnelTurnsUnderground: 1,
    });

    const state = makeState([worm]);
    const events: GameEvent[] = [];
    const consumed = processTunnelTurn(state, worm.id, events);

    expect(consumed).toBe(true);
    expect(state.units[worm.id].position).toEqual({ x: 4, y: 6 });
    expect(state.units[worm.id].tunnelState).toBe('IDLE');
    expect(state.grid[6][4].unitId).toBe(worm.id);
  });
});
