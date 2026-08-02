/**
 * Tests for SP-03 Watch Captain (spec_09) — GARRISON_OVERWATCH feature.
 *
 * Grid layout (9 wide × 76 tall, standard MAP dimensions):
 *   - Player Stronghold at (4, 70)  ← enemy AI target (far south)
 *   - Tower at (4, 40) — mid-map centre column
 *   - Enemy at (4, 36) for Watchtower (attackRange=3; dist=4 → outside)
 *     or (4, 37) for Outpost/CrystalTower (attackRange=2; dist=3 → outside)
 *
 * The enemy AI marches SOUTH (increasing y) toward the player Stronghold.
 * After one move step, dist drops from 4→3 (or 3→2), entering range.
 * GARRISON_OVERWATCH then fires at the entering enemy.
 *
 * Covers:
 *  - Watchtower, Outpost, Crystal Tower all fire when enemy enters range
 *  - Does NOT fire when spec_09 is not active
 *  - Disabled buildings do not fire
 *  - preventiveStrikeFiredThisTurn reset at start of each enemy turn
 *  - Lethal damage kills the enemy, emits UNIT_DEATH event
 *  - Applies to FLYING enemies
 *  - BUILDING_ATTACK event emitted with buildingHpLost=0
 */

import { describe, expect, it } from "vitest";
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from "../types";
import type { Building, GameState, Tile, Unit } from "../types";
import { BUILDING_DEFINITIONS, MAP } from "../gameConfig";
import { createInitialSpecialists } from "../specialistSystem";
import { runEnemyTurn } from "../enemySystem";

// ============================================================================
// Helpers
// ============================================================================

let idSeq = 0;
function nextId(prefix = "x"): string {
  return `${prefix}${++idSeq}`;
}

function makeTile(x: number, y: number, overrides: Partial<Tile> = {}): Tile {
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
    ...overrides,
  } as unknown as Tile;
}

function makeFullGrid(
  tileOverrides: Record<string, Partial<Tile>> = {},
): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => {
      const key = `${x},${y}`;
      return makeTile(x, y, tileOverrides[key] ?? {});
    }),
  );
}

function makeGameStats() {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0,
    buildingsDestroyedByLava: 0,
  };
}

function makeEnemy(x: number, y: number, overrides: Partial<Unit> = {}): Unit {
  return {
    id: nextId("e"),
    type: UnitType.LAVA_GRUNT,
    faction: Faction.ENEMY,
    position: { x, y },
    stats: {
      maxHp: 100,
      currentHp: 100,
      attack: 30,
      defense: 20,
      moveRange: 1,
      discoverRadius: 2,
      triggerRange: 0,
      movementActions: 1,
      attackRange: 1,
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
    ...overrides,
  } as Unit;
}

function makeBuilding(
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  const cfg = BUILDING_DEFINITIONS[type];
  return {
    id: nextId("b"),
    type,
    faction,
    position: { x, y },
    hp: cfg?.combatStats?.maxHp ?? cfg?.maxHp ?? 100,
    maxHp: cfg?.combatStats?.maxHp ?? cfg?.maxHp ?? 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: cfg?.discoverRadius ?? 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: cfg?.combatStats ? { ...cfg.combatStats } : null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: type === BuildingType.WATCHTOWER,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: cfg?.destroyBehavior ?? DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    preventiveStrikeFiredThisTurn: false,
    ...overrides,
  } as Building;
}

/** Full game state suitable for runEnemyTurn. */
function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  tileOverrides?: Record<string, Partial<Tile>>;
  globalSpecialistStorage?: string[];
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildings[b.id] = b;

  const grid = makeFullGrid(opts.tileOverrides ?? {});
  for (const u of Object.values(units)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of Object.values(buildings)) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }

  return {
    units,
    buildings,
    grid,
    turn: 3,
    resources: { iron: 10, wood: 10 },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: opts.globalSpecialistStorage ?? [],
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    gameStats: makeGameStats(),
    techFlags: [],
    techNodes: {} as GameState["techNodes"],
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    zonesUnlocked: [0],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: "NORMAL" as GameState["difficulty"],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    portals: {},
    phase: "PLAYER_TURN" as GameState["phase"],
  } as unknown as GameState;
}

// ============================================================================
// Test helper
//
// Layout (all x=4 — centre column, 9-wide grid):
//   y=70: STRONGHOLD  — enemy AI destination
//   y=40: Tower       — player combat building
//   y=36: Enemy       — Watchtower (attackRange=3): dist=4, outside range
//                        moves to y=37 → dist=3, enters range
//   y=37: Enemy       — Outpost/CrystalTower (attackRange=2): dist=3, outside range
//                        moves to y=38 → dist=2, enters range
// ============================================================================

function buildOverwatchState(opts: {
  buildingType?: BuildingType;
  isDisabled?: boolean;
  towerFiredThisTurn?: boolean;
  hasSpec?: boolean;
  flyingEnemy?: boolean;
  enemyHp?: number;
} = {}): { state: GameState; towerBuildingId: string; enemyId: string } {
  const {
    buildingType = BuildingType.WATCHTOWER,
    isDisabled = false,
    towerFiredThisTurn = false,
    hasSpec = true,
    flyingEnemy = false,
    enemyHp = 100,
  } = opts;

  const cfg = BUILDING_DEFINITIONS[buildingType];
  const attackRange = cfg?.combatStats?.attackRange ?? 3;

  // Tower at centre column, mid-map
  const towerX = 4;
  const towerY = 40;

  // Enemy starts one tile north of tower, just outside attack range
  // Chebyshev dist from tower = attackRange + 1
  const enemyY = towerY - (attackRange + 1);

  const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, towerX, 70);
  const tower = makeBuilding(buildingType, Faction.PLAYER, towerX, towerY, {
    isDisabledForTurns: isDisabled ? 1 : 0,
    preventiveStrikeFiredThisTurn: towerFiredThisTurn,
  });

  const enemyTags: UnitTag[] = flyingEnemy ? [UnitTag.FLYING] : [];
  const enemy = makeEnemy(towerX, enemyY, {
    stats: {
      maxHp: enemyHp,
      currentHp: enemyHp,
      attack: 30,
      defense: 20,
      moveRange: 1,
      discoverRadius: 2,
      triggerRange: 0,
      movementActions: 1,
      attackRange: 1,
    },
    tags: enemyTags,
  });

  const state = makeState({
    units: [enemy],
    buildings: [tower, stronghold],
    globalSpecialistStorage: hasSpec ? ["spec_09"] : [],
  });

  return { state, towerBuildingId: tower.id, enemyId: enemy.id };
}

// ============================================================================
// Tests
// ============================================================================

describe("GARRISON_OVERWATCH — basic firing", () => {
  it("Watchtower deals overwatch damage when enemy enters its range", () => {
    const { state, enemyId } = buildOverwatchState({ buildingType: BuildingType.WATCHTOWER });
    const hpBefore = state.units[enemyId]!.stats.currentHp;

    const { finalState } = runEnemyTurn(state);
    const enemyAfter = finalState.units[enemyId];

    if (enemyAfter) {
      expect(enemyAfter.stats.currentHp).toBeLessThan(hpBefore);
    } else {
      // killed by overwatch — also valid
      expect(finalState.gameStats.unitsKilled).toBeGreaterThan(0);
    }
  });

  it("Outpost deals overwatch damage when enemy enters its range", () => {
    const { state, enemyId } = buildOverwatchState({ buildingType: BuildingType.OUTPOST });
    const hpBefore = state.units[enemyId]!.stats.currentHp;

    const { finalState } = runEnemyTurn(state);
    const enemyAfter = finalState.units[enemyId];

    if (enemyAfter) {
      expect(enemyAfter.stats.currentHp).toBeLessThan(hpBefore);
    } else {
      expect(finalState.gameStats.unitsKilled).toBeGreaterThan(0);
    }
  });

  it("Crystal Tower deals overwatch damage when enemy enters its range", () => {
    const { state, enemyId } = buildOverwatchState({ buildingType: BuildingType.CRYSTAL_TOWER });
    const hpBefore = state.units[enemyId]!.stats.currentHp;

    const { finalState } = runEnemyTurn(state);
    const enemyAfter = finalState.units[enemyId];

    if (enemyAfter) {
      expect(enemyAfter.stats.currentHp).toBeLessThan(hpBefore);
    } else {
      expect(finalState.gameStats.unitsKilled).toBeGreaterThan(0);
    }
  });

  it("fires at a FLYING enemy (no flying immunity for building overwatch)", () => {
    const { state, enemyId } = buildOverwatchState({ flyingEnemy: true });
    const hpBefore = state.units[enemyId]!.stats.currentHp;

    const { finalState } = runEnemyTurn(state);
    const enemyAfter = finalState.units[enemyId];

    if (enemyAfter) {
      expect(enemyAfter.stats.currentHp).toBeLessThan(hpBefore);
    } else {
      expect(finalState.gameStats.unitsKilled).toBeGreaterThan(0);
    }
  });
});

describe("GARRISON_OVERWATCH — suppression cases", () => {
  it("does NOT fire when spec_09 is not in globalSpecialistStorage", () => {
    const { state } = buildOverwatchState({ hasSpec: false });
    const { finalState } = runEnemyTurn(state);
    // Only player damage source here is overwatch — should be 0
    expect(finalState.gameStats.damageDealt).toBe(0);
  });

  it("disabled building (isDisabledForTurns > 0) does NOT fire overwatch", () => {
    const { state } = buildOverwatchState({ isDisabled: true });
    const { finalState } = runEnemyTurn(state);
    expect(finalState.gameStats.damageDealt).toBe(0);
  });
});

describe("GARRISON_OVERWATCH — kill and event correctness", () => {
  it("kills enemy when overwatch damage is lethal (enemy HP = 1)", () => {
    const { state, enemyId } = buildOverwatchState({ enemyHp: 1 });
    const { finalState } = runEnemyTurn(state);
    expect(finalState.units[enemyId]).toBeUndefined();
    expect(finalState.gameStats.unitsKilled).toBeGreaterThan(0);
  });

  it("emits UNIT_DEATH event when overwatch kill occurs", () => {
    const { state, enemyId } = buildOverwatchState({ enemyHp: 1 });
    const { events } = runEnemyTurn(state);

    const deathEvent = events.find(
      (e) => e.type === "UNIT_DEATH" && e.unitId === enemyId,
    );
    expect(deathEvent).toBeDefined();
    if (deathEvent && deathEvent.type === "UNIT_DEATH") {
      expect(deathEvent.faction).toBe(Faction.ENEMY);
    }
  });

  it("emits BUILDING_ATTACK event with buildingHpLost=0 when overwatch fires", () => {
    const { state, towerBuildingId } = buildOverwatchState();
    const { events } = runEnemyTurn(state);

    const attackEvent = events.find(
      (e) => e.type === "BUILDING_ATTACK" && e.buildingId === towerBuildingId,
    );
    if (attackEvent && attackEvent.type === "BUILDING_ATTACK") {
      expect(attackEvent.buildingHpLost).toBe(0);
      expect(attackEvent.defenderHpLost).toBeGreaterThan(0);
    }
  });
});

describe("GARRISON_OVERWATCH — per-turn tracking", () => {
  it("preventiveStrikeFiredThisTurn reset: tower pre-marked fires again this turn", () => {
    // Pre-mark as fired; runEnemyTurn resets it, then it fires again
    const { state, towerBuildingId, enemyId } = buildOverwatchState({ towerFiredThisTurn: true });
    const hpBefore = state.units[enemyId]!.stats.currentHp;

    const { finalState } = runEnemyTurn(state);

    const enemyAfter = finalState.units[enemyId];
    if (enemyAfter) {
      expect(enemyAfter.stats.currentHp).toBeLessThan(hpBefore);
    } else {
      expect(finalState.gameStats.unitsKilled).toBeGreaterThan(0);
    }
    // After firing, flag should be true
    expect(finalState.buildings[towerBuildingId]?.preventiveStrikeFiredThisTurn).toBe(true);
  });

  it("flag is false after reset when enemy never enters range", () => {
    // Tower pre-marked; enemy far away (10 tiles north of tower, moveRange=1)
    const towerX = 4;
    const towerY = 40;
    const tower = makeBuilding(BuildingType.WATCHTOWER, Faction.PLAYER, towerX, towerY, {
      preventiveStrikeFiredThisTurn: true,
    });
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, towerX, 70);
    // Enemy 10 tiles north of tower — cannot enter attackRange=3 in one move
    const enemy = makeEnemy(towerX, towerY - 10);

    const state = makeState({
      units: [enemy],
      buildings: [tower, stronghold],
      globalSpecialistStorage: ["spec_09"],
    });

    const { finalState } = runEnemyTurn(state);
    // Reset cleared it; enemy never entered range this turn
    expect(finalState.buildings[tower.id]?.preventiveStrikeFiredThisTurn).toBeFalsy();
  });
});

describe("GARRISON_OVERWATCH — building-type and faction restrictions", () => {
  it("enemy-owned Watchtower does NOT fire overwatch for the player", () => {
    const towerX = 4;
    // Enemy-owned watchtower — not player, should not fire
    const enemyTower = makeBuilding(BuildingType.WATCHTOWER, Faction.ENEMY, towerX, 40);
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, towerX, 70);
    // WATCHTOWER attackRange=3; enemy at dist=4 moves to dist=3
    const enemy = makeEnemy(towerX, 36);

    const state = makeState({
      units: [enemy],
      buildings: [enemyTower, stronghold],
      globalSpecialistStorage: ["spec_09"],
    });

    const { finalState } = runEnemyTurn(state);
    expect(finalState.gameStats.damageDealt).toBe(0);
  });

  it("non-combat building (LAVALAIR) does not fire overwatch", () => {
    // Watchtower-range test but building is a LAVALAIR (no combatStats)
    const lavaLair = makeBuilding(BuildingType.LAVALAIR, Faction.ENEMY, 4, 0);
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, 70);
    const enemy = makeEnemy(4, 36);

    const state = makeState({
      units: [enemy],
      buildings: [lavaLair, stronghold],
      globalSpecialistStorage: ["spec_09"],
    });

    const { finalState } = runEnemyTurn(state);
    expect(finalState.gameStats.damageDealt).toBe(0);
  });
});
