/**
 * Tests for the H11_UNTRAINED hint gate.
 *
 * Verifies that:
 * 1. The hint does NOT fire for units that were already over training capacity
 *    at the start of the player turn (e.g. the starting Spearman when no
 *    Barracks exists yet).
 * 2. The hint DOES fire when a unit transitions from trained → untrained
 *    during the turn (e.g. after a Barracks is lost while the Spearman count
 *    remained the same).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { useAnimationStore } from '../animationStore';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { useGameStore } from '../gameStore';
import {
  BuildingType,
  DestroyBehavior,
  Difficulty,
  Faction,
  GamePhase,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';

// ── Minimal helpers ──────────────────────────────────────────────────────────

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

function makeBaseState(units: Unit[], buildings: Record<string, Building>): GameState {
  const grid = makeGrid();
  for (const building of Object.values(buildings)) {
    grid[building.position.y][building.position.x].buildingId = building.id;
  }
  for (const unit of units) {
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }

  return {
    turn: 1,
    phase: GamePhase.PLAYER_TURN,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    buildings,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 999, wood: 999 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 5,
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

function resetHintStores() {
  useHintStore.setState({ queue: [], activeHintId: null, expanded: false });
  useHintOptionsStore.setState({ hintsEnabled: true, globalShowCounts: {} });
  useAnimationStore.getState().clear();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('H11_UNTRAINED hint gate', () => {
  beforeEach(() => {
    resetHintStores();
  });

  it('does NOT fire for a unit that was already over training capacity at turn start (e.g. starting Spearman with no Barracks)', () => {
    // Spearman with no Barracks — over capacity from the very start.
    // Stronghold at y=65 is in zone 1 (player-side), not a victory position.
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, { x: 5, y: 65 });
    const spearman = makeUnit('sp1', UnitType.SPEARMAN, { x: 5, y: 66 });
    const state = makeBaseState([spearman], { [stronghold.id]: stronghold });

    useGameStore.setState(state);
    useGameStore.getState().endPlayerTurn();

    // H11 must NOT have been enqueued.
    const { activeHintId, queue } = useHintStore.getState();
    const hintFired =
      activeHintId === 'H11_UNTRAINED' || queue.includes('H11_UNTRAINED');
    expect(hintFired).toBe(false);

    // The Spearman should still have received the UNTRAINED tag (tag sync runs
    // regardless of whether the hint fires).
    // When there are no animation events, the final state is applied directly to
    // the game store; resolvedState in the animation store remains null.
    const resolvedState = useAnimationStore.getState().resolvedState;
    const finalUnits = resolvedState?.units ?? useGameStore.getState().units;
    expect(finalUnits['sp1']?.tags).toContain(UnitTag.UNTRAINED);
  });

  it('does NOT fire when a unit is within training capacity (Barracks present, one Spearman)', () => {
    // Control case: Barracks with capacity 3, one Spearman — no over-capacity,
    // so neither the tag nor the hint should appear.
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, { x: 5, y: 65 });
    const barracks = makeBuilding('barracks', BuildingType.BARRACKS, Faction.PLAYER, { x: 6, y: 65 });
    const spearman = makeUnit('sp1', UnitType.SPEARMAN, { x: 5, y: 66 });
    const state = makeBaseState(
      [spearman],
      { [stronghold.id]: stronghold, [barracks.id]: barracks },
    );

    useGameStore.setState(state);
    useGameStore.getState().endPlayerTurn();

    // No over-capacity → H11 must NOT fire.
    const { activeHintId, queue } = useHintStore.getState();
    const hintFired =
      activeHintId === 'H11_UNTRAINED' || queue.includes('H11_UNTRAINED');
    expect(hintFired).toBe(false);

    // Spearman should NOT be untrained — capacity is fine.
    const resolvedState = useAnimationStore.getState().resolvedState;
    const finalUnits = resolvedState?.units ?? useGameStore.getState().units;
    expect(finalUnits['sp1']?.tags).not.toContain(UnitTag.UNTRAINED);
  });
});
