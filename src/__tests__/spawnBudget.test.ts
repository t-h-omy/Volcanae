/**
 * Tests for the spawn budget system (SB-01).
 * Covers budget math, accumulator carry, freeze behavior, throughput ceiling,
 * distance-based weighting, and snapshot integrity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runEnemyTurn } from '../enemySystem';
import { MAP, UNIT_DEFINITIONS, SPAWN_BUDGET } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  GamePhase,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';

// ============================================================================
// FIXTURE HELPERS
// ============================================================================

let nextId = 0;
function freshId(prefix: string): string { return `${prefix}_${++nextId}`; }

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

function makeLavaLair(position: Position, extra: Partial<Building> = {}): Building {
  return {
    id: freshId('lair'),
    type: BuildingType.LAVALAIR,
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
    discoverRadius: 5,
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
    ...extra,
  } as Building;
}

function makeUnit(type: UnitType, faction: Faction, position: Position): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: freshId('unit'),
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
    tags: [...def.tags],
    hasMovedThisTurn: true,
    hasAttackedThisTurn: true,
    hasConstructedThisTurn: true,
    hasDestroyedThisTurn: true,
    hasCapturedThisTurn: true,
    hasTradedThisTurn: true,
    hasUsedPostAttackMoveThisTurn: true,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    spellsCastThisTurn: 0,
    recruitedOnTurn: 0,
    berserkActivated: false,
  } as unknown as Unit;
}

type StateOverrides = {
  units?: Unit[];
  buildings?: Building[];
  ember?: number;
  lavaFrontRow?: number;
  spawnAccumulator?: number;
  spawnFreezeUntilTurn?: number;
  turn?: number;
};

function makeState(overrides: StateOverrides = {}): GameState {
  const {
    units = [],
    buildings = [],
    ember = 0,
    lavaFrontRow = 5,
    spawnAccumulator = 0,
    spawnFreezeUntilTurn = 0,
    turn = 1,
  } = overrides;

  const grid = makeGrid();
  for (const unit of units) {
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }
  for (const building of buildings) {
    grid[building.position.y][building.position.x].buildingId = building.id;
  }

  return {
    turn,
    phase: GamePhase.ENEMY_TURN,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    buildings: Object.fromEntries(buildings.map((b) => [b.id, b])),
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
      unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
      unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
      techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
    },
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL',
    lavaFrontRow,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    ember,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn,
    spawnAccumulator,
    lastSpawnBudget: null,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    activeHint: null,
    hintQueue: [],
    seenHints: [],
    activeWaveTheme: { entries: [], isReadPlayer: false, counterPickUsedThisGame: 0 },
  } as unknown as GameState;
}

beforeEach(() => {
  vi.restoreAllMocks();
  nextId = 0;
});

// ============================================================================
// 1. Budget math
// ============================================================================

describe('budget math', () => {
  it('ember 0 no contact gives budget = BASE_BUDGET', () => {
    // No player units => frontline sentinel => ddaRelief forced to 0 regardless of margin
    const lair = makeLavaLair({ x: 5, y: 2 });
    const state = makeState({ buildings: [lair], ember: 0 });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    expect(snap).not.toBeNull();
    expect(snap.ddaRelief).toBe(0);
    expect(snap.contactActive).toBe(false);
    expect(snap.budget).toBe(
      Math.max(SPAWN_BUDGET.MIN_BUDGET, Math.min(SPAWN_BUDGET.MAX_BUDGET, SPAWN_BUDGET.BASE_BUDGET)),
    );
  });

  it('DDA relief clamps to DDA_MIN when margin is sufficiently small with contact', () => {
    // Place player unit close to lavaFrontRow so margin = lavaFrontRow - frontlineRow hits minimum.
    // With lair at (5,2) and player at (5,5), lavaFrontRow=5:
    //   frontlineRow=5, margin=5-5=0
    //   DDA formula: clamp((0 - 12) * 0.25, -3, 0) = -3 = DDA_MIN
    // Lair at y=2, player at y=5: distance=3 which is within DDA_CONTACT_RANGE=3 for contact.
    const lairPos = { x: 5, y: 2 };
    const playerPos = { x: 5, y: 5 }; // same row as lavaFrontRow => margin = 0
    const lair = makeLavaLair(lairPos);
    const playerUnit = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, playerPos);
    const state = makeState({
      buildings: [lair],
      units: [playerUnit],
      lavaFrontRow: 5,
      ember: 0,
    });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    expect(snap.ddaRelief).toBe(SPAWN_BUDGET.DDA_MIN);
    expect(snap.contactActive).toBe(true);
  });

  it('MIN_BUDGET clamp prevents budget going below MIN_BUDGET', () => {
    // With strong DDA relief: base + ember + DDA_MIN can go negative
    // ember=0: base=1.25, DDA_MIN=-3.0 => raw = 1.25 + 0 - 3.0 = -1.75 => clamped to MIN_BUDGET=1.0
    const lairPos = { x: 5, y: 2 };
    const playerPos = { x: 5, y: 3 };
    const lair = makeLavaLair(lairPos);
    const playerUnit = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, playerPos);
    const state = makeState({
      buildings: [lair],
      units: [playerUnit],
      lavaFrontRow: 5,
      ember: 0,
    });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    const rawBudget = SPAWN_BUDGET.BASE_BUDGET + 0 * SPAWN_BUDGET.EMBER_BUDGET_PER_LEVEL + SPAWN_BUDGET.DDA_MIN;
    expect(rawBudget).toBeLessThan(SPAWN_BUDGET.MIN_BUDGET);
    expect(snap.budget).toBe(SPAWN_BUDGET.MIN_BUDGET);
  });

  it('MAX_BUDGET clamp prevents budget exceeding MAX_BUDGET', () => {
    // Choose ember such that base + ember*rate > MAX_BUDGET
    const emberAtSaturation = Math.ceil(
      (SPAWN_BUDGET.MAX_BUDGET - SPAWN_BUDGET.BASE_BUDGET) / SPAWN_BUDGET.EMBER_BUDGET_PER_LEVEL + 1,
    );
    const lair = makeLavaLair({ x: 5, y: 2 });
    const state = makeState({ buildings: [lair], ember: emberAtSaturation });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    const rawBudget = SPAWN_BUDGET.BASE_BUDGET + emberAtSaturation * SPAWN_BUDGET.EMBER_BUDGET_PER_LEVEL;
    expect(rawBudget).toBeGreaterThan(SPAWN_BUDGET.MAX_BUDGET);
    expect(snap.budget).toBe(SPAWN_BUDGET.MAX_BUDGET);
  });
});

// ============================================================================
// 2. Accumulator
// ============================================================================

describe('accumulator', () => {
  it('fractional carry: accumulator after spawn reflects remainder', () => {
    // budget = BASE_BUDGET (ember 0, no player units), 1 spawner free
    // Turn 1: accumulator 0 -> min(0+budget, cap)=budget, spawnsNow=1, after=budget-1
    const lair = makeLavaLair({ x: 5, y: 2 });
    const state = makeState({ buildings: [lair], ember: 0, spawnAccumulator: 0 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const budget = Math.min(SPAWN_BUDGET.MAX_BUDGET, Math.max(SPAWN_BUDGET.MIN_BUDGET, SPAWN_BUDGET.BASE_BUDGET));
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    expect(snap.accumulatorBefore).toBeCloseTo(0);
    expect(snap.spawnsNow).toBe(1);
    expect(snap.accumulatorAfter).toBeCloseTo(budget - 1);
  });

  it('ACCUMULATOR_CAP binds when all spawners are blocked', () => {
    // Place a player unit on the lair tile to block spawning
    const lairPos = { x: 5, y: 2 };
    const playerUnit = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, lairPos);
    const lair = makeLavaLair(lairPos);
    // Run enough turns to exceed ACCUMULATOR_CAP
    let state = makeState({ buildings: [lair], units: [playerUnit], spawnAccumulator: 0 });

    // Calculate how many turns until cap
    const budget = Math.min(SPAWN_BUDGET.MAX_BUDGET, Math.max(SPAWN_BUDGET.MIN_BUDGET, SPAWN_BUDGET.BASE_BUDGET));
    const turnsToFill = Math.ceil(SPAWN_BUDGET.ACCUMULATOR_CAP / budget) + 2;

    for (let i = 0; i < turnsToFill; i++) {
      const { finalState } = runEnemyTurn(state);
      // Keep the player unit on the lair tile to block spawning
      state = {
        ...finalState,
        units: { ...finalState.units, [playerUnit.id]: { ...finalState.units[playerUnit.id] ?? playerUnit, position: lairPos } },
      } as GameState;
      // Update grid to reflect player unit still on tile
      const newGrid = state.grid.map((row) => row.map((tile) => ({ ...tile })));
      newGrid[lairPos.y][lairPos.x] = { ...newGrid[lairPos.y][lairPos.x], unitId: playerUnit.id };
      state = { ...state, grid: newGrid } as GameState;
    }
    expect(state.spawnAccumulator).toBe(SPAWN_BUDGET.ACCUMULATOR_CAP);
  });
});

// ============================================================================
// 3. Freeze
// ============================================================================

describe('freeze', () => {
  it('frozen turn: spawnAccumulator unchanged, no snapshot, cooldown still decrements', () => {
    const lair = makeLavaLair({ x: 5, y: 2 }, { spawnCooldownRemaining: 3 });
    const state = makeState({
      buildings: [lair],
      spawnFreezeUntilTurn: 10,
      turn: 1,
      spawnAccumulator: 1.5,
    });
    const { finalState } = runEnemyTurn(state);
    // Accumulator must not change
    expect(finalState.spawnAccumulator).toBe(1.5);
    // No snapshot written
    expect(finalState.lastSpawnBudget).toBeNull();
    // Cooldown decremented
    const lairAfter = finalState.buildings[lair.id];
    expect(lairAfter.spawnCooldownRemaining).toBe(2);
  });
});

// ============================================================================
// 4. Throughput ceiling
// ============================================================================

describe('throughput ceiling', () => {
  it('spawns exactly eligibleSpawners.length units when budget exceeds eligible count', () => {
    // Set ember so budget exceeds 2 (the number of lairs)
    const emberForHighBudget = Math.ceil(
      (SPAWN_BUDGET.MAX_BUDGET - SPAWN_BUDGET.BASE_BUDGET) / SPAWN_BUDGET.EMBER_BUDGET_PER_LEVEL,
    );
    const lair1 = makeLavaLair({ x: 3, y: 2 });
    const lair2 = makeLavaLair({ x: 7, y: 2 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState({
      buildings: [lair1, lair2],
      ember: emberForHighBudget,
      // Give accumulator a large head start so floor(accumulator) >> 2
      spawnAccumulator: SPAWN_BUDGET.MAX_BUDGET - 0.01,
    });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    expect(snap.spawnsNow).toBe(2);
    expect(finalState.enemyUnitsSpawnedLastTurn).toBe(2);
  });
});

// ============================================================================
// 5. Weighting
// ============================================================================

describe('weighting', () => {
  it('with no player units, all spawners get WEIGHT_MIN', () => {
    const lair1 = makeLavaLair({ x: 3, y: 2 });
    const lair2 = makeLavaLair({ x: 8, y: 2 });
    const state = makeState({ buildings: [lair1, lair2], ember: 0 });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    for (const sw of snap.spawnerWeights) {
      expect(sw.weight).toBe(SPAWN_BUDGET.WEIGHT_MIN);
    }
  });

  it('spawner adjacent to player unit gets boosted weight including WEIGHT_IN_RANGE_MULTIPLIER', () => {
    // Lair A at (5,8): player unit at (5,7) is adjacent and within discoverRadius=5
    // Lair B at (5,1): player unit at (5,7) is 6 tiles away, outside discoverRadius=5
    // Expected weight A includes WEIGHT_IN_RANGE_MULTIPLIER; weight B does not
    const lairA = makeLavaLair({ x: 5, y: 8 });
    const lairB = makeLavaLair({ x: 5, y: 1 });
    const playerPos = { x: 5, y: 7 };
    const playerUnit = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, playerPos);
    const state = makeState({
      buildings: [lairA, lairB],
      units: [playerUnit],
      lavaFrontRow: 10,
      ember: 0,
    });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget!;
    const swA = snap.spawnerWeights.find((sw) => sw.buildingId === lairA.id)!;
    const swB = snap.spawnerWeights.find((sw) => sw.buildingId === lairB.id)!;
    expect(swA).toBeDefined();
    expect(swB).toBeDefined();
    // lairA is close (d should be small) and within discover radius -> multiplied weight
    const distA = swA.distance;
    const expectedDistWA = Math.max(
      SPAWN_BUDGET.WEIGHT_MIN,
      Math.min(SPAWN_BUDGET.WEIGHT_MAX, SPAWN_BUDGET.WEIGHT_MAX - distA * SPAWN_BUDGET.WEIGHT_DECAY_PER_TILE),
    );
    const expectedWeightA = expectedDistWA * SPAWN_BUDGET.WEIGHT_IN_RANGE_MULTIPLIER;
    expect(swA.weight).toBeCloseTo(expectedWeightA);
    // lairB is far and outside discover radius - no multiplier
    const distB = swB.distance;
    const expectedWeightB = Math.max(
      SPAWN_BUDGET.WEIGHT_MIN,
      Math.min(SPAWN_BUDGET.WEIGHT_MAX, SPAWN_BUDGET.WEIGHT_MAX - distB * SPAWN_BUDGET.WEIGHT_DECAY_PER_TILE),
    );
    expect(swB.weight).toBeCloseTo(expectedWeightB);
    // A should have strictly greater weight than B
    expect(swA.weight).toBeGreaterThan(swB.weight);
  });
});

// ============================================================================
// 6. Snapshot integrity
// ============================================================================

describe('snapshot integrity', () => {
  it('all SpawnBudgetSnapshot fields are populated after a normal call', () => {
    const lair = makeLavaLair({ x: 5, y: 2 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState({ buildings: [lair], ember: 0 });
    const { finalState } = runEnemyTurn(state);
    const snap = finalState.lastSpawnBudget;
    expect(snap).not.toBeNull();
    expect(typeof snap!.base).toBe('number');
    expect(typeof snap!.emberTerm).toBe('number');
    expect(typeof snap!.margin).toBe('number');
    expect(typeof snap!.contactActive).toBe('boolean');
    expect(typeof snap!.ddaRelief).toBe('number');
    expect(typeof snap!.budget).toBe('number');
    expect(typeof snap!.accumulatorBefore).toBe('number');
    expect(typeof snap!.spawnsNow).toBe('number');
    expect(typeof snap!.accumulatorAfter).toBe('number');
    expect(Array.isArray(snap!.spawnerWeights)).toBe(true);
    expect(snap!.spawnerWeights).toHaveLength(1);
    const sw = snap!.spawnerWeights[0];
    expect(sw.buildingId).toBe(lair.id);
    expect(typeof sw.distance).toBe('number');
    expect(typeof sw.weight).toBe('number');
    expect(typeof sw.picked).toBe('boolean');
  });
});
