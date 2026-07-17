import { describe, expect, it, beforeEach } from 'vitest';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';
import {
  BuildingType,
  DestroyBehavior,
  Difficulty,
  Faction,
  GamePhase,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';

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
  id: string,
  type: UnitType,
  position: Position,
  overrides: Partial<Unit> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { ...position },
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
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
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

function makeBuilding(id: string, type: BuildingType, faction: Faction, position: Position): Building {
  return {
    id,
    type,
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
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}

function makeState(units: Unit[]): GameState {
  const grid = makeGrid();
  const stronghold = {
    ...makeBuilding('stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, { x: 0, y: 11 }),
    strongholdNobles: 1,
  };
  const farm = {
    ...makeBuilding('farm', BuildingType.FARM, Faction.PLAYER, { x: 1, y: 11 }),
    populationCount: 10,
    populationCap: 10,
  };
  grid[stronghold.position.y][stronghold.position.x].buildingId = stronghold.id;
  grid[farm.position.y][farm.position.x].buildingId = farm.id;
  for (const unit of units) {
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }

  return {
    turn: 1,
    phase: GamePhase.PLAYER_TURN,
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    buildings: { [stronghold.id]: stronghold, [farm.id]: farm },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: ['spec_24'],
    resources: { iron: 999, wood: 999 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 3,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
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
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    seenHints: [],
  };
}

describe('SP-24 Field Chirurgeon idle heal', () => {
  beforeEach(() => {
    useAnimationStore.getState().clear();
  });

  it('heals only player units that took no action and emits one heal event per healed unit', () => {
    const idle = makeUnit('idle', UnitType.SWORDSMAN, { x: 2, y: 8 });
    idle.stats.currentHp = idle.stats.maxHp - (ABILITIES.IDLE_HEAL_AMOUNT + 5);

    const capHeal = makeUnit('cap', UnitType.ARCHER, { x: 3, y: 8 });
    capHeal.stats.currentHp = capHeal.stats.maxHp - 10;

    const moved = makeUnit('moved', UnitType.SWORDSMAN, { x: 4, y: 8 }, { hasMovedThisTurn: true });
    moved.stats.currentHp = moved.stats.maxHp - 20;

    const attacked = makeUnit('attacked', UnitType.SWORDSMAN, { x: 5, y: 8 }, { hasAttackedThisTurn: true });
    attacked.stats.currentHp = attacked.stats.maxHp - 20;

    const constructed = makeUnit('constructed', UnitType.SWORDSMAN, { x: 6, y: 8 }, { hasConstructedThisTurn: true });
    constructed.stats.currentHp = constructed.stats.maxHp - 20;

    const captured = makeUnit('captured', UnitType.SWORDSMAN, { x: 7, y: 8 }, { hasCapturedThisTurn: true });
    captured.stats.currentHp = captured.stats.maxHp - 20;

    const mage = makeUnit('mage', UnitType.MAGE, { x: 8, y: 8 }, { spellsCastThisTurn: 1 });
    mage.stats.currentHp = mage.stats.maxHp - 20;
    const expectedIdleHp = idle.stats.maxHp - 5;
    const expectedCappedHp = capHeal.stats.maxHp;
    const expectedMovedHp = moved.stats.currentHp;
    const expectedAttackedHp = attacked.stats.currentHp;
    const expectedConstructedHp = constructed.stats.currentHp;
    const expectedCapturedHp = captured.stats.currentHp;
    const expectedMageHp = mage.stats.currentHp;

    const state = makeState([idle, capHeal, moved, attacked, constructed, captured, mage]);
    useGameStore.setState(state);

    useGameStore.getState().endPlayerTurn();

    const queuedEvents = useAnimationStore.getState().eventQueue.filter((event) => event.type === 'UNIT_HEAL');
    const resolvedState = useAnimationStore.getState().resolvedState;

    expect(queuedEvents).toHaveLength(2);
    expect(queuedEvents).toEqual([
      expect.objectContaining({
        type: 'UNIT_HEAL',
        unitId: 'idle',
        position: { x: 2, y: 8 },
        amount: ABILITIES.IDLE_HEAL_AMOUNT,
      }),
      expect.objectContaining({
        type: 'UNIT_HEAL',
        unitId: 'cap',
        position: { x: 3, y: 8 },
        amount: 10,
      }),
    ]);

    expect(resolvedState).not.toBeNull();
    expect(resolvedState!.units.idle.stats.currentHp).toBe(expectedIdleHp);
    expect(resolvedState!.units.cap.stats.currentHp).toBe(expectedCappedHp);
    expect(resolvedState!.units.moved.stats.currentHp).toBe(expectedMovedHp);
    expect(resolvedState!.units.attacked.stats.currentHp).toBe(expectedAttackedHp);
    expect(resolvedState!.units.constructed.stats.currentHp).toBe(expectedConstructedHp);
    expect(resolvedState!.units.captured.stats.currentHp).toBe(expectedCapturedHp);
    expect(resolvedState!.units.mage.stats.currentHp).toBe(expectedMageHp);
  });

  it('applies heal events through applyEvent with a heal floater', () => {
    const idle = makeUnit('idle', UnitType.SWORDSMAN, { x: 2, y: 8 });
    idle.stats.currentHp = idle.stats.maxHp - 20;
    useGameStore.setState(makeState([idle]));

    useGameStore.getState().applyEvent({
      type: 'UNIT_HEAL',
      unitId: 'idle',
      position: { x: 2, y: 8 },
      amount: 15,
    });

    const updated = useGameStore.getState().units.idle;
    expect(updated.stats.currentHp).toBe(updated.stats.maxHp - 5);
  });
});
