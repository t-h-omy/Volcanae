import { describe, expect, it } from 'vitest';
import { createInitialSpecialists } from '../specialistSystem';
import { useGameStore } from '../gameStore';
import { runEnemyTurn } from '../enemySystem';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import {
  Faction,
  GamePhase,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { GameState, Position, Tile, Unit } from '../types';

let nextUnitId = 0;

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
    hasCaveMonster: false,
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(
  type: UnitType,
  faction: Faction,
  position: Position,
  extraTags: UnitTag[] = [],
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: `unit_${++nextUnitId}`,
    type,
    faction,
    position: { ...position },
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
    spellsCastThisTurn: 0,
  };
}

function makeState(units: Unit[], mountainPos: Position): GameState {
  const grid = makeGrid();
  for (const unit of units) {
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }
  grid[mountainPos.y][mountainPos.x].terrainType = TileType.MOUNTAIN;
  grid[mountainPos.y][mountainPos.x].hasCaveMonster = true;

  return {
    turn: 7,
    phase: GamePhase.PLAYER_TURN,
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    buildings: {},
    grid,
    portals: {},
    activeCaveEncounters: [],
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 0,
    techNodes: {},
    techFlags: [],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    gameStats: {
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
    },
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL',
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    pendingBridgeBuilderId: null,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    activeHint: null,
    hintQueue: [],
    seenHints: [],
  } as unknown as GameState;
}

describe('cave monster spawn timing', () => {
  it('attacks on the enemy turn immediately following its spawn turn', () => {
    const mountainPos = { x: 4, y: 10 };
    const explorer = makeUnit(
      UnitType.SPEARMAN,
      Faction.PLAYER,
      mountainPos,
      [UnitTag.BUILDANDCAPTURE],
    );
    const initialHp = explorer.stats.currentHp;
    useGameStore.setState(makeState([explorer], mountainPos));

    useGameStore.getState().exploreCave(mountainPos);
    const spawnedState = useGameStore.getState();
    expect(spawnedState.activeCaveEncounters).toHaveLength(1);

    const encounter = spawnedState.activeCaveEncounters[0];
    const monsterId = encounter.monsterId;
    const spawnedMonster = spawnedState.units[monsterId];
    expect(spawnedMonster).toBeDefined();
    expect(spawnedMonster.position).toEqual({ x: mountainPos.x, y: mountainPos.y - 1 });

    // The monster spawns with all action flags false — it acts in the first enemy turn
    expect(spawnedMonster).toMatchObject({
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
      hasCapturedThisTurn: false,
      hasConstructedThisTurn: false,
      hasDestroyedThisTurn: false,
    });

    // First enemy turn: monster is adjacent and must attack
    const firstTurn = runEnemyTurn(spawnedState);
    const monsterAfterFirstTurn = firstTurn.finalState.units[monsterId];
    const explorerAfterFirstTurn = firstTurn.finalState.units[explorer.id];

    const attackEventFirstTurn = firstTurn.events.find(
      (event) => event.type === 'ENEMY_ATTACK' && event.attackerId === monsterId,
    );
    expect(attackEventFirstTurn).toBeDefined();
    expect(explorerAfterFirstTurn).toBeDefined();
    expect(explorerAfterFirstTurn!.stats.currentHp).toBeLessThan(initialHp);

    // Monster does not act twice in one enemy turn — exactly one attack event from it
    expect(monsterAfterFirstTurn).toBeDefined();
    const monsterAttackEvents = firstTurn.events.filter(
      (event) => event.type === 'ENEMY_ATTACK' && event.attackerId === monsterId,
    );
    expect(monsterAttackEvents).toHaveLength(1);
  });
});
