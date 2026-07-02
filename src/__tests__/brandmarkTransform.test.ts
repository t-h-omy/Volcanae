import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { resolveAttack } from '../combatSystem';
import { useGameStore } from '../gameStore';
import { Faction, TileType, UnitTag, UnitType } from '../types';
import type { GameEvent } from '../gameEvents';
import type { GameState, GameStats, Tile, Unit } from '../types';
import { UNIT_DEFINITIONS } from '../gameConfig';

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
  unitPlacements: { id: string; x: number; y: number }[] = [],
): Tile[][] {
  const grid: Tile[][] = Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
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

function makeUnit(
  id: string,
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  overrides: Partial<Unit['stats']> = {},
  extraTags: UnitTag[] = [],
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
      ...overrides,
    },
    tags: [...def.tags, ...extraTags],
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

function makeState(units: Unit[]): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const unit of units) unitsMap[unit.id] = unit;
  return {
    units: unitsMap,
    buildings: {},
    grid: makeGrid(units.map((unit) => ({ id: unit.id, x: unit.position.x, y: unit.position.y }))),
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 1,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
  } as unknown as GameState;
}

describe('Brandmark transform placement', () => {
  const attackerId = 'enemy_attacker';
  const defenderId = 'brandmarked_defender';

  function makeScenarioUnits(): Unit[] {
    const attacker = makeUnit(
      attackerId,
      UnitType.LAVA_GRUNT,
      Faction.ENEMY,
      3,
      5,
      { attack: 999, currentHp: 100, maxHp: 100, defense: 0 },
    );
    const defender = makeUnit(
      defenderId,
      UnitType.SPEARMAN,
      Faction.PLAYER,
      4,
      5,
      { currentHp: 1, maxHp: 100 },
      [UnitTag.BRANDMARKED],
    );
    return [attacker, defender];
  }

  beforeEach(() => {
    const [attacker, defender] = makeScenarioUnits();
    useGameStore.setState({
      units: {
        [attacker.id]: attacker,
        [defender.id]: defender,
      },
      buildings: {},
      grid: makeGrid([
        { id: attacker.id, x: attacker.position.x, y: attacker.position.y },
        { id: defender.id, x: defender.position.x, y: defender.position.y },
      ]),
      gameStats: makeGameStats(),
      pendingBrandmarkTransforms: [],
      turn: 1,
    });
  });

  it('spawns the replacement demon on a free adjacent tile in resolved combat state', () => {
    const [attacker, defender] = makeScenarioUnits();
    const outEvents: GameEvent[] = [];

    const nextState = produce(makeState([attacker, defender]), (draft) => {
      resolveAttack(draft, attacker.id, defender.id, true, outEvents);
    });

    const demon = Object.values(nextState.units).find((unit) => unit.type === UnitType.EMBER_DEMON);
    expect(demon).toBeDefined();
    expect(demon?.faction).toBe(Faction.ENEMY);
    expect(demon?.position).toEqual({ x: 5, y: 5 });
    expect(nextState.grid[5][5].unitId).toBe(demon?.id);
    expect(nextState.grid[5][4].unitId).toBe(attacker.id);
    expect(nextState.units[attacker.id]?.position).toEqual({ x: 4, y: 5 });
    expect(nextState.units[defender.id]).toBeUndefined();
  });

  it('spawns the replacement demon immediately in live event application', () => {
    useGameStore.getState().applyEvent({
      type: 'ENEMY_ATTACK',
      attackerId,
      defenderId,
      attackerPosition: { x: 3, y: 5 },
      defenderPosition: { x: 4, y: 5 },
      attackerHpLost: 0,
      defenderHpLost: 1,
      advancedToPosition: { x: 4, y: 5 },
    });
    useGameStore.getState().applyEvent({
      type: 'UNIT_DEATH',
      unitId: defenderId,
      position: { x: 4, y: 5 },
      faction: Faction.PLAYER,
      brandmarkSpawnPosition: { x: 5, y: 5 },
    });

    const state = useGameStore.getState();
    const demon = Object.values(state.units).find((unit) => unit.type === UnitType.EMBER_DEMON);
    expect(demon).toBeDefined();
    expect(demon?.position).toEqual({ x: 5, y: 5 });
    expect(state.grid[5][5].unitId).toBe(demon?.id);
    expect(state.grid[5][4].unitId).toBe(attackerId);
    expect(state.units[attackerId]?.position).toEqual({ x: 4, y: 5 });
    expect(state.units[defenderId]).toBeUndefined();
  });
});
