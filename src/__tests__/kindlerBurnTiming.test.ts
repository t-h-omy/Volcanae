import { describe, expect, it } from 'vitest';
import { runEnemyTurn } from '../enemySystem';
import { useGameStore } from '../gameStore';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { Faction, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { GameState, GameStats, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

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

function makeGrid(unitPlacements: { id: string; x: number; y: number }[]): Tile[][] {
  const grid: Tile[][] = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
  }
  return grid;
}

function makeUnit(
  id: string,
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  statOverrides: Partial<Unit['stats']> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number;
    attack: number;
    defense: number;
    moveRange: number;
    discoverRadius: number;
    triggerRange: number;
    movementActions: number;
    attackRange: number;
    tags: UnitTag[];
  };

  return {
    id,
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
      ...statOverrides,
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
  };
}

function makeEnemyTurnState({
  attackerX = 4,
  attackerY = 10,
  defenderX = 5,
  defenderY = 10,
  attackerStats = {},
  defenderStats = {},
}: {
  attackerX?: number;
  attackerY?: number;
  defenderX?: number;
  defenderY?: number;
  attackerStats?: Partial<Unit['stats']>;
  defenderStats?: Partial<Unit['stats']>;
} = {}): GameState {
  const kindler = makeUnit('enemy_kindler', UnitType.KINDLER, Faction.ENEMY, attackerX, attackerY, attackerStats);
  const defender = makeUnit('player_target', UnitType.SWORDSMAN, Faction.PLAYER, defenderX, defenderY, defenderStats);

  return {
    units: {
      [kindler.id]: kindler,
      [defender.id]: defender,
    },
    buildings: {},
    grid: makeGrid([
      { id: kindler.id, x: kindler.position.x, y: kindler.position.y },
      { id: defender.id, x: defender.position.x, y: defender.position.y },
    ]),
    gameStats: makeGameStats(),
    techFlags: [],
    turn: 5,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow: 70,
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
    spawnFreezeUntilTurn: 0,
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

describe('VF-06 kindler burn timing event plumbing', () => {
  it('emits tileBurningPosition on ENEMY_ATTACK and applyEvent burns display tile immediately', () => {
    const state = makeEnemyTurnState({ attackerStats: { moveRange: 0 } });
    state.grid[10][5].status = null;
    const { events, finalState } = runEnemyTurn(state);

    const attackEvent = events.find(
      (event): event is Extract<GameEvent, { type: 'ENEMY_ATTACK' }> =>
        event.type === 'ENEMY_ATTACK' && event.attackerId === 'enemy_kindler',
    );

    expect(attackEvent).toBeDefined();
    expect(attackEvent?.defenderPosition).toEqual({ x: 5, y: 10 });
    expect(attackEvent?.tileBurningPosition).toEqual({ x: 5, y: 10 });
    expect(finalState.grid[10][5].status).toBe(TileStatus.BURNING);

    useGameStore.setState(structuredClone(state));
    useGameStore.getState().applyEvent(attackEvent!);
    expect(useGameStore.getState().grid[10][5].status).toBe(TileStatus.BURNING);
  });

  it('also emits tileBurningPosition for ranged Kindler attacks', () => {
    const state = makeEnemyTurnState({ defenderX: 6, defenderY: 10 });
    const { events } = runEnemyTurn(state);
    const attackEvent = events.find(
      (event): event is Extract<GameEvent, { type: 'ENEMY_ATTACK' }> =>
        event.type === 'ENEMY_ATTACK' && event.attackerId === 'enemy_kindler',
    );
    expect(attackEvent?.tileBurningPosition).toEqual({ x: 6, y: 10 });
  });
});
