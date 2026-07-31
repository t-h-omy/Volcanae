import { describe, expect, it } from 'vitest';
import { createInitialSpecialists } from '../specialistSystem';
import { runEnemyTurn } from '../enemySystem';
import { applySpawnActionFlags, hasUnitActed } from '../unitActions';
import { BUILDING_DEFINITIONS, LAVA_LAIR, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { BuildingType, DestroyBehavior, Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

let nextId = 0;
function id(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
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
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(type: UnitType, faction: Faction, position: Position, extraTags: UnitTag[] = []): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: id('u'),
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

function makeEmberNest(position: Position): Building {
  return {
    id: id('b'),
    type: BuildingType.EMBERNEST,
    faction: Faction.ENEMY,
    position: { ...position },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDING_DEFINITIONS[BuildingType.EMBERNEST].discoverRadius,
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
    emberSpawnCounter: LAVA_LAIR.EMBER_NEST_SPAWN_INTERVAL - 1,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(units: Unit[], buildings: Building[]): GameState {
  const grid = makeGrid();
  for (const unit of units) {
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }
  for (const building of buildings) {
    grid[building.position.y][building.position.x].buildingId = building.id;
  }

  return {
    turn: 10,
    phase: GamePhase.PLAYER_TURN,
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    buildings: Object.fromEntries(buildings.map((building) => [building.id, building])),
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
    pendingBrandmarkTransforms: [],
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
  } as unknown as GameState;
}

function getSpawnEvent(events: GameEvent[]): Extract<GameEvent, { type: 'ENEMY_SPAWN' }> {
  const event = events.find((e) => e.type === 'ENEMY_SPAWN' && e.unit.type === UnitType.EMBERLING);
  expect(event).toBeDefined();
  return event as Extract<GameEvent, { type: 'ENEMY_SPAWN' }>;
}

describe('PROMPT A-03 enemy spawn sickness', () => {
  it('Ember Nest Emberling cannot act or explode on spawn turn, but can on next enemy turn', () => {
    const nestPos = { x: 4, y: 8 };
    const nest = makeEmberNest(nestPos);
    const adjacentPlayer = makeUnit(UnitType.SWORDSMAN, Faction.PLAYER, { x: 4, y: 9 });

    const state = makeState([adjacentPlayer], [nest]);
    const firstTurn = runEnemyTurn(state);
    const spawnEvent = getSpawnEvent(firstTurn.events);

    expect(spawnEvent.unit.hasMovedThisTurn).toBe(true);
    expect(spawnEvent.unit.hasAttackedThisTurn).toBe(true);
    expect(spawnEvent.unit.hasCapturedThisTurn).toBe(true);
    expect(spawnEvent.unit.hasTradedThisTurn).toBe(true);
    expect(spawnEvent.unit.hasConstructedThisTurn).toBe(true);
    expect(spawnEvent.unit.hasDestroyedThisTurn).toBe(true);
    expect(hasUnitActed(spawnEvent.unit)).toBe(true);
    expect(firstTurn.events.some((e) => e.type === 'ENEMY_MOVE' && e.unitId === spawnEvent.unit.id)).toBe(false);
    expect(firstTurn.events.some((e) => e.type === 'EXPLOSION' && e.unitId === spawnEvent.unit.id)).toBe(false);
    expect(firstTurn.finalState.units[spawnEvent.unit.id]).toBeDefined();

    const secondTurn = runEnemyTurn({
      ...firstTurn.finalState,
      turn: firstTurn.finalState.turn + 1,
    } as GameState);

    const actedNextTurn = secondTurn.events.some(
      (e) => (e.type === 'ENEMY_MOVE' && e.unitId === spawnEvent.unit.id) ||
        (e.type === 'ENEMY_ATTACK' && e.attackerId === spawnEvent.unit.id) ||
        (e.type === 'EXPLOSION' && e.unitId === spawnEvent.unit.id),
    );
    expect(actedNextTurn).toBe(true);
  });

  it('READY-tagged enemy units keep all action flags available at spawn', () => {
    const readyUnit = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, { x: 0, y: 0 }, [UnitTag.READY]);
    applySpawnActionFlags(readyUnit);

    expect(readyUnit.hasMovedThisTurn).toBe(false);
    expect(readyUnit.hasAttackedThisTurn).toBe(false);
    expect(readyUnit.hasCapturedThisTurn).toBe(false);
    expect(readyUnit.hasTradedThisTurn).toBe(false);
    expect(readyUnit.hasConstructedThisTurn).toBe(false);
    expect(readyUnit.hasDestroyedThisTurn).toBe(false);
    expect(hasUnitActed(readyUnit)).toBe(false);
  });
});
