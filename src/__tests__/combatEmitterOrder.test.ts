import { beforeEach, describe, expect, it } from 'vitest';
import { CORRUPTED_QORK, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { runEnemyTurn } from '../enemySystem';
import type { GameEvent } from '../gameEvents';
import { Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Position, Tile, Unit } from '../types';

const ORIGIN = { x: 4, y: 20 };
const TARGET = { x: 4, y: 21 };
const PUSH_DESTINATION = { x: 4, y: 22 };

function makeUnit(id: string, type: UnitType, faction: Faction, position: Position): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id, type, faction, position: { ...position },
    stats: {
      maxHp: definition.maxHp,
      currentHp: definition.maxHp,
      attack: definition.attack,
      defense: definition.defense,
      moveRange: definition.moveRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange,
      movementActions: definition.movementActions,
      attackRange: definition.attackRange,
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
  };
}

function makeState(units: Unit[]): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x): Tile => ({
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
      hasCaveMonster: false,
    } as Tile)),
  );
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;
  return {
    ...useGameStore.getInitialState(),
    turn: 3,
    phase: GamePhase.PLAYER_TURN,
    grid,
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    buildings: {},
    portals: {},
    activeCaveEncounters: units.filter((unit) => unit.type === UnitType.CAVE_MONSTER)
      .map((unit) => ({ monsterId: unit.id, mountainTileId: '4,19' })),
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
  };
}

function emitAttack(path: 'player' | 'enemy' | 'cave', state: GameState): {
  events: GameEvent[];
  finalState: GameState;
} {
  if (path !== 'player') return runEnemyTurn(state);
  useGameStore.setState(state);
  useGameStore.getState().attackUnit('attacker', 'defender');
  const animation = useAnimationStore.getState();
  expect(animation.resolvedState).not.toBeNull();
  return { events: animation.eventQueue, finalState: animation.resolvedState! };
}

function expectOneDeath(events: GameEvent[], id: string, position: Position): void {
  expect(events.filter((event) => event.type === 'UNIT_DEATH' && event.unitId === id))
    .toEqual([expect.objectContaining({ unitId: id, position })]);
}

beforeEach(() => {
  useAnimationStore.getState().clear();
});

describe('combat emitter ordering', () => {
  it.each(['player', 'enemy', 'cave'] as const)(
    '%s retains fatal advance and emits impact and burst deaths exactly once',
    (path) => {
      const faction = path === 'player' ? Faction.PLAYER : Faction.ENEMY;
      const attacker = makeUnit('attacker',
        path === 'cave' ? UnitType.CAVE_MONSTER : UnitType.LAVA_GRUNT, faction, ORIGIN);
      attacker.stats.attack = 1000;
      attacker.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;
      const defender = makeUnit('defender', UnitType.CORRUPTED_QORK,
        faction === Faction.PLAYER ? Faction.ENEMY : Faction.PLAYER, TARGET);
      defender.stats.currentHp = 1;
      defender.stats.defense = 0;
      defender.stats.attack = 0;

      const { events, finalState } = emitAttack(path, makeState([attacker, defender]));
      const attackIndex = events.findIndex((event) =>
        event.type === 'PLAYER_ATTACK' || event.type === 'ENEMY_ATTACK');
      expect(attackIndex).toBeGreaterThanOrEqual(0);
      expect(events[attackIndex]).toMatchObject({
        attackerId: attacker.id,
        advancedToPosition: TARGET,
        attackerXpGained: null,
        defenderXpGained: null,
      });
      expectOneDeath(events, defender.id, TARGET);
      expectOneDeath(events, attacker.id, TARGET);
      const defenderDeath = events.findIndex((event) =>
        event.type === 'UNIT_DEATH' && event.unitId === defender.id);
      const burst = events.findIndex((event) => event.type === 'QORK_DEATH_BURST');
      const attackerDeath = events.findIndex((event) =>
        event.type === 'UNIT_DEATH' && event.unitId === attacker.id);
      expect(defenderDeath).toBeGreaterThan(attackIndex);
      expect(burst).toBeGreaterThan(defenderDeath);
      expect(attackerDeath).toBeGreaterThan(burst);
      expect(finalState.units[attacker.id]).toBeUndefined();
      expect(finalState.units[defender.id]).toBeUndefined();
      if (path === 'cave') {
        expect(events.filter((event) => event.type === 'CAVE_MONSTER_KILLED' &&
          event.monsterId === attacker.id)).toHaveLength(1);
        expect(finalState.activeCaveEncounters).toEqual([]);
      }
    },
  );

  it.each(['player', 'enemy'] as const)(
    '%s emits a counter-killed Qork before its secondary-only defender death',
    (path) => {
      const faction = path === 'player' ? Faction.PLAYER : Faction.ENEMY;
      const attacker = makeUnit('attacker', UnitType.CORRUPTED_QORK, faction, ORIGIN);
      attacker.tags = [UnitTag.RANGED];
      attacker.stats.currentHp = 3;
      attacker.stats.attack = 1;
      attacker.stats.triggerRange = 2;
      attacker.hasMovedThisTurn = true;
      const defender = makeUnit('defender', UnitType.LANCER,
        faction === Faction.PLAYER ? Faction.ENEMY : Faction.PLAYER, TARGET);
      defender.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;
      defender.stats.defense = 1000;
      defender.stats.attack = 1000;
      const { events, finalState } = emitAttack(path, makeState([attacker, defender]));
      const attackIndex = events.findIndex((event) =>
        event.type === 'PLAYER_ATTACK' || event.type === 'ENEMY_ATTACK');
      expect(attackIndex).toBeGreaterThanOrEqual(0);
      expect(events[attackIndex]).toMatchObject({
        attackerId: attacker.id,
        defenderId: defender.id,
        advancedToPosition: null,
        attackerXpGained: null,
        defenderXpGained: null,
      });
      expectOneDeath(events, attacker.id, ORIGIN);
      expectOneDeath(events, defender.id, TARGET);
      const attackerDeath = events.findIndex((event) =>
        event.type === 'UNIT_DEATH' && event.unitId === attacker.id);
      const burst = events.findIndex((event) => event.type === 'QORK_DEATH_BURST');
      const defenderDeath = events.findIndex((event) =>
        event.type === 'UNIT_DEATH' && event.unitId === defender.id);
      expect(attackerDeath).toBeGreaterThan(attackIndex);
      expect(burst).toBeGreaterThan(attackerDeath);
      expect(defenderDeath).toBeGreaterThan(burst);
      expect(finalState.units[attacker.id]).toBeUndefined();
      expect(finalState.units[defender.id]).toBeUndefined();
    },
  );

  it.each(['player', 'enemy', 'cave'] as const)(
    '%s emits lethal knockback immediately after the attack without duplicate death',
    (path) => {
      const faction = path === 'player' ? Faction.PLAYER : Faction.ENEMY;
      const attacker = makeUnit('attacker',
        path === 'cave' ? UnitType.CAVE_MONSTER : UnitType.LAVA_GRUNT, faction, ORIGIN);
      attacker.tags = [UnitTag.KNOCKBACK];
      attacker.stats.attack = 1;
      const defender = makeUnit('defender', UnitType.GUARD,
        faction === Faction.PLAYER ? Faction.ENEMY : Faction.PLAYER, TARGET);
      defender.stats.currentHp = 1000;
      defender.stats.defense = 100;
      defender.stats.attack = 0;
      const state = makeState([attacker, defender]);
      state.grid[PUSH_DESTINATION.y][PUSH_DESTINATION.x].isLava = true;

      const { events } = emitAttack(path, state);
      const attackIndex = events.findIndex((event) =>
        event.type === 'PLAYER_ATTACK' || event.type === 'ENEMY_ATTACK');
      expect(attackIndex).toBeGreaterThanOrEqual(0);
      expect(events[attackIndex + 1]).toMatchObject({
        type: 'UNIT_KNOCKBACK',
        unitId: defender.id,
        toPosition: PUSH_DESTINATION,
      });
      expectOneDeath(events, defender.id, PUSH_DESTINATION);
    },
  );

  it('deduplicates cave rewards for secondary Qork deaths and cleans up encounters', () => {
    const attacker = makeUnit('attacker', UnitType.LAVA_GRUNT, Faction.PLAYER, ORIGIN);
    attacker.stats.attack = 1000;
    const defender = makeUnit('defender', UnitType.CORRUPTED_QORK, Faction.ENEMY, TARGET);
    defender.stats.currentHp = 1;
    defender.stats.defense = 0;
    const monster = makeUnit('monster', UnitType.CAVE_MONSTER,
      Faction.ENEMY, PUSH_DESTINATION);
    monster.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;

    const { events, finalState } = emitAttack('player', makeState([attacker, defender, monster]));
    expectOneDeath(events, monster.id, PUSH_DESTINATION);
    expect(events.filter((event) => event.type === 'CAVE_MONSTER_KILLED' &&
      event.monsterId === monster.id)).toHaveLength(1);
    expect(finalState.activeCaveEncounters).toEqual([]);
  });

  it('emits ranged enemy chain deaths once without an advance', () => {
    const attacker = makeUnit('attacker', UnitType.LAVA_GRUNT, Faction.ENEMY, ORIGIN);
    attacker.tags = [UnitTag.RANGED];
    attacker.stats.attackRange = 2;
    attacker.stats.attack = 1000;
    attacker.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;
    const defender = makeUnit('defender', UnitType.CORRUPTED_QORK,
      Faction.PLAYER, PUSH_DESTINATION);
    defender.stats.currentHp = 1;
    defender.stats.defense = 0;
    const chained = makeUnit('chained', UnitType.CORRUPTED_QORK, Faction.ENEMY, TARGET);
    chained.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;
    chained.hasMovedThisTurn = true;
    chained.hasAttackedThisTurn = true;

    const { events, finalState } = emitAttack('enemy', makeState([attacker, defender, chained]));
    expect(events.find((event) => event.type === 'ENEMY_ATTACK')).toMatchObject({
      attackerId: attacker.id,
      defenderId: defender.id,
      advancedToPosition: null,
      attackerXpGained: null,
    });
    expectOneDeath(events, defender.id, PUSH_DESTINATION);
    expectOneDeath(events, chained.id, TARGET);
    expectOneDeath(events, attacker.id, ORIGIN);
    expect(finalState.units[attacker.id]).toBeUndefined();
  });

  it('rewards a cave target killed by knockback exactly once', () => {
    const attacker = makeUnit('attacker', UnitType.LAVA_GRUNT, Faction.PLAYER, ORIGIN);
    attacker.tags = [UnitTag.KNOCKBACK];
    attacker.stats.attack = 1;
    const defender = makeUnit('defender', UnitType.CAVE_MONSTER, Faction.ENEMY, TARGET);
    defender.stats.currentHp = 1000;
    defender.stats.defense = 100;
    defender.stats.attack = 0;
    const state = makeState([attacker, defender]);
    state.grid[PUSH_DESTINATION.y][PUSH_DESTINATION.x].isLava = true;

    const { events, finalState } = emitAttack('player', state);
    expectOneDeath(events, defender.id, PUSH_DESTINATION);
    expect(events.filter((event) => event.type === 'CAVE_MONSTER_KILLED' &&
      event.monsterId === defender.id)).toHaveLength(1);
    expect(finalState.activeCaveEncounters).toEqual([]);
  });
});
