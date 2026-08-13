import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MAP, ENEMY } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { advanceLavaWithEvents } from '../lavaSystem';
import { increaseEmberOnStrongholdCapture } from '../enemySystem';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';
import { shouldShowTurnPopupEmberRose } from '../turnPopup';
import { BuildingType, DestroyBehavior, Difficulty, Faction, GamePhase, TileType, UnitType } from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
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
    hasCaveMonster: false,
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(id: string, type: UnitType, faction: Faction, position: Position): Unit {
  return {
    id,
    type,
    faction,
    position: { ...position },
    stats: { maxHp: 20, currentHp: 20, attack: 5, defense: 2, moveRange: 1, discoverRadius: 2, triggerRange: 0, movementActions: 1, attackRange: 1 },
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
  } as Unit;
}

function makeStronghold(id: string, faction: Faction, position: Position): Building {
  return {
    id,
    type: BuildingType.STRONGHOLD,
    faction,
    position: { ...position },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 1,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(): GameState {
  const grid = makeGrid();
  const playerUnit = makeUnit('p1', UnitType.SPEARMAN, Faction.PLAYER, { x: 3, y: 10 });
  const stronghold = makeStronghold('s1', Faction.PLAYER, { x: 2, y: 11 });
  grid[playerUnit.position.y][playerUnit.position.x].unitId = playerUnit.id;
  grid[stronghold.position.y][stronghold.position.x].buildingId = stronghold.id;

  return {
    turn: 1,
    phase: GamePhase.PLAYER_TURN,
    units: { [playerUnit.id]: playerUnit },
    buildings: { [stronghold.id]: stronghold },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 20, wood: 20 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [1],
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
    difficulty: Difficulty.STANDARD,
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    spawnAccumulator: 0,
    lastSpawnBudget: null,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    seenHints: [],
  };
}

describe('ember level up events', () => {
  beforeEach(() => {
    useAnimationStore.getState().clear();
  });

  it('emits STRONGHOLD_CAPTURE source event and keeps source bookkeeping intact', () => {
    const events: GameEvent[] = [];
    const next = produce(makeState(), (draft) => {
      increaseEmberOnStrongholdCapture(draft, { x: 4, y: 8 }, events);
    });

    expect(next.ember).toBe(1);
    expect(next.emberLevelSources.turns).toBe(0);
    expect(next.emberLevelSources.emberlingSacrifices).toBe(0);
    expect(next.emberLevelSources.other).toBe(1);
    expect(events).toEqual([
      {
        type: 'EMBER_LEVEL_UP',
        position: { x: 4, y: 8 },
        amount: 1,
        source: 'STRONGHOLD_CAPTURE',
      },
    ]);
  });

  it('emits LAVA_ADVANCE source event when lava consumes an enemy unit', () => {
    const state = makeState();
    const enemy = makeUnit('e1', UnitType.LAVA_GRUNT, Faction.ENEMY, { x: 5, y: MAP.GRID_HEIGHT - 1 });
    state.units[enemy.id] = enemy;
    state.grid[enemy.position.y][enemy.position.x].unitId = enemy.id;

    const { events } = advanceLavaWithEvents(state);
    const emberEvent = events.find((event) => event.type === 'EMBER_LEVEL_UP');
    expect(emberEvent).toEqual({
      type: 'EMBER_LEVEL_UP',
      position: { x: enemy.position.x, y: enemy.position.y },
      amount: 1,
      source: 'LAVA_ADVANCE',
    });
  });

  it('queues TURN_INTERVAL source event through end-turn flow', () => {
    const state = makeState();
    state.turn = ENEMY.THREAT_LEVEL_INCREASE_INTERVAL;
    useGameStore.setState(state);

    useGameStore.getState().endPlayerTurn();

    const queued = useAnimationStore.getState().eventQueue.find(
      (event) => event.type === 'EMBER_LEVEL_UP' && event.source === 'TURN_INTERVAL',
    );
    expect(queued).toEqual({
      type: 'EMBER_LEVEL_UP',
      amount: 1,
      source: 'TURN_INTERVAL',
    });
  });
});

describe('turn popup ember-rise line condition', () => {
  it('is true only on turns immediately after an interval boundary', () => {
    expect(shouldShowTurnPopupEmberRose(1)).toBe(false);
    expect(shouldShowTurnPopupEmberRose(ENEMY.THREAT_LEVEL_INCREASE_INTERVAL)).toBe(false);
    expect(shouldShowTurnPopupEmberRose(ENEMY.THREAT_LEVEL_INCREASE_INTERVAL + 1)).toBe(true);
    expect(shouldShowTurnPopupEmberRose(ENEMY.THREAT_LEVEL_INCREASE_INTERVAL + 2)).toBe(false);
  });
});
