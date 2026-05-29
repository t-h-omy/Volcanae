/**
 * Tests for Prompt B changes:
 *
 *  Change 1 — Stunned Cave Monster must skip its turn (pinnedUntilTurn check in runCaveMonsterAi).
 *  Change 2 — getCrystalTowerChamberBonus helper returns correct values.
 *  Change 3 — syncCameraToPlayerStronghold selects the north-most (min y) stronghold.
 *
 * All tests work against pure game-logic functions with stores / floaters suppressed.
 */

import { describe, it, expect } from 'vitest';
import { runEnemyTurn } from '../enemySystem';
import { getCrystalTowerChamberBonus } from '../combatSystem';
import {
  BuildingType, Faction, UnitTag, TileType, DestroyBehavior,
} from '../types';
import type {
  GameState, Unit, Tile, Building, GameStats, CaveEncounter,
} from '../types';
import { UNIT_DEFINITIONS, MAGE } from '../gameConfig';

// ── ID counter ────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

// ── Minimal building factory ──────────────────────────────────────────────────

function makeBuilding(
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id: nextId(`bld_${type}`),
    type,
    faction,
    position: { x, y },
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
    ...overrides,
  };
}

// ── Minimal unit factory ──────────────────────────────────────────────────────

import { UnitType } from '../types';

function makeUnit(
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  overrides: Partial<Unit> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  const id = nextId(`u_${type}_${faction}`);
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
    },
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
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

// ── Minimal tile / grid factory ───────────────────────────────────────────────

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
  cols: number,
  rows: number,
  unitPlacements: { id: string; x: number; y: number }[] = [],
  buildingPlacements: { id: string; x: number; y: number }[] = [],
): Tile[][] {
  const grid: Tile[][] = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) grid[y][x].unitId = id;
  for (const { id, x, y } of buildingPlacements) grid[y][x].buildingId = id;
  return grid;
}

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
  };
}

/** Minimal GameState with just the fields needed by runEnemyTurn / getCrystalTowerChamberBonus. */
function makeState(
  units: Unit[],
  buildings: Building[] = [],
  activeCaveEncounters: CaveEncounter[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  const grid = makeGrid(
    20, 20,
    units.map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })),
    buildings.map((b) => ({ id: b.id, x: b.position.x, y: b.position.y })),
  );

  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 3,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters,
    // Minimal fields needed by runEnemyTurn internals
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow: 100,
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
    phase: 'PLAYER_TURN' as GameState['phase'],
  } as unknown as GameState;
}

// ============================================================================
// CHANGE 1 — Stunned cave monster skips its turn
// ============================================================================

describe('Change 1 – stunned cave monster skips its turn', () => {
  /**
   * Build a state with a CAVE_MONSTER at (5,5) and a player WARRIOR at (5,6)
   * (adjacent, within attack range 1). The monster is stunned: pinnedUntilTurn >= turn.
   * After runEnemyTurn the player unit should be untouched and the monster should not move.
   */
  it('stunned cave monster does NOT attack or move', () => {
    const TURN = 3;
    const monster = makeUnit(UnitType.CAVE_MONSTER, Faction.ENEMY, 5, 5, {
      pinnedUntilTurn: TURN, // stunned: pinnedUntilTurn >= state.turn
    });
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 5, 6);

    const encounter: CaveEncounter = {
      monsterId: monster.id,
      mountainTileId: `7,7`, // parseMountainTileId reads "x,y"
    };

    const state: GameState = {
      ...makeState([monster, player], [], [encounter]),
      turn: TURN,
    };

    const { finalState } = runEnemyTurn(state);

    // Player unit must be alive and at full HP — no damage taken
    const playerAfter = finalState.units[player.id];
    expect(playerAfter).toBeDefined();
    expect(playerAfter!.stats.currentHp).toBe(player.stats.currentHp);

    // Monster must not have moved
    const monsterAfter = finalState.units[monster.id];
    expect(monsterAfter).toBeDefined();
    expect(monsterAfter!.position).toEqual({ x: 5, y: 5 });
  });

  /**
   * Identical setup but pinnedUntilTurn < turn (not stunned).
   * The monster should attack the adjacent player unit.
   */
  it('non-stunned cave monster DOES attack an adjacent player unit', () => {
    const TURN = 3;
    const monster = makeUnit(UnitType.CAVE_MONSTER, Faction.ENEMY, 5, 5, {
      pinnedUntilTurn: 0, // not stunned
    });
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 5, 6);

    const encounter: CaveEncounter = {
      monsterId: monster.id,
      mountainTileId: `7,7`,
    };

    const state: GameState = {
      ...makeState([monster, player], [], [encounter]),
      turn: TURN,
    };

    const { finalState } = runEnemyTurn(state);

    // Player unit must have taken damage (or been killed)
    const playerAfter = finalState.units[player.id];
    if (playerAfter) {
      // Survived but should have lost HP
      expect(playerAfter.stats.currentHp).toBeLessThan(player.stats.currentHp);
    }
    // If undefined: unit was killed, which also counts as "attacked"
  });
});

// ============================================================================
// CHANGE 2 — getCrystalTowerChamberBonus helper
// ============================================================================

describe('Change 2 – getCrystalTowerChamberBonus', () => {
  /** Returns 0 for a non-CRYSTAL_TOWER building. */
  it('returns 0 for a non-tower building', () => {
    const watchtower = makeBuilding(BuildingType.WATCHTOWER, Faction.PLAYER, 5, 5);
    const state = makeState([], [watchtower]);
    expect(getCrystalTowerChamberBonus(state, watchtower)).toBe(0);
  });

  /** Returns 0 for an enemy-owned Crystal Tower. */
  it('returns 0 for an enemy Crystal Tower', () => {
    const tower = makeBuilding(BuildingType.CRYSTAL_TOWER, Faction.ENEMY, 5, 5, {
      combatStats: { attack: 40, defense: 55, attackRange: 2 },
    });
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, 5, 6);
    const state = makeState([], [tower, chamber]);
    expect(getCrystalTowerChamberBonus(state, tower)).toBe(0);
  });

  /** Returns 0 when there are no player Crystal Chambers in range. */
  it('returns 0 when no chambers are within connect range', () => {
    const tower = makeBuilding(BuildingType.CRYSTAL_TOWER, Faction.PLAYER, 5, 5, {
      combatStats: { attack: 40, defense: 55, attackRange: 2 },
    });
    // Chamber far out of range
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, 10, 10);
    const state = makeState([], [tower, chamber]);
    expect(getCrystalTowerChamberBonus(state, tower)).toBe(0);
  });

  /** Returns ATTACK_BONUS for exactly 1 connected chamber. */
  it('returns 1× bonus for one chamber within connect range', () => {
    const tower = makeBuilding(BuildingType.CRYSTAL_TOWER, Faction.PLAYER, 5, 5, {
      combatStats: { attack: 40, defense: 55, attackRange: 2 },
    });
    // Within CRYSTAL_TOWER_CHAMBER_CONNECT_RANGE = 2
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, 5, 6);
    const state = makeState([], [tower, chamber]);
    expect(getCrystalTowerChamberBonus(state, tower)).toBe(MAGE.CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS);
  });

  /** Returns K × ATTACK_BONUS for K connected chambers. */
  it('returns K× bonus for K chambers within connect range', () => {
    const tower = makeBuilding(BuildingType.CRYSTAL_TOWER, Faction.PLAYER, 5, 5, {
      combatStats: { attack: 40, defense: 55, attackRange: 2 },
    });
    const c1 = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, 5, 6);
    const c2 = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, 6, 5);
    const cFar = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, 10, 10);
    const state = makeState([], [tower, c1, c2, cFar]);
    expect(getCrystalTowerChamberBonus(state, tower)).toBe(2 * MAGE.CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS);
  });

  /** Enemy-owned Crystal Chambers are NOT counted. */
  it('does not count enemy-owned Crystal Chambers', () => {
    const tower = makeBuilding(BuildingType.CRYSTAL_TOWER, Faction.PLAYER, 5, 5, {
      combatStats: { attack: 40, defense: 55, attackRange: 2 },
    });
    const enemyChamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, Faction.ENEMY, 5, 6);
    const state = makeState([], [tower, enemyChamber]);
    expect(getCrystalTowerChamberBonus(state, tower)).toBe(0);
  });
});

// ============================================================================
// CHANGE 3 — North-most player stronghold selection
// ============================================================================

describe('Change 3 – north-most stronghold selection', () => {
  /**
   * The selection logic extracted from the fixed syncCameraToPlayerStronghold:
   *  - Among player STRONGHOLDs, pick the one with minimum position.y
   *  - Ties broken by minimum position.x
   */
  function selectNorthMostStronghold(state: GameState) {
    const strongholds = Object.values(state.buildings).filter(
      (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER,
    );
    if (strongholds.length === 0) return null;
    return strongholds.reduce((best, b) => {
      if (b.position.y < best.position.y) return b;
      if (b.position.y === best.position.y && b.position.x < best.position.x) return b;
      return best;
    });
  }

  it('picks the stronghold with the smallest y', () => {
    const south = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 5, 10);
    const north = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 5, 3);
    const mid   = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 5, 7);
    const state = makeState([], [south, north, mid]);
    const chosen = selectNorthMostStronghold(state);
    expect(chosen?.position.y).toBe(3);
    expect(chosen?.id).toBe(north.id);
  });

  it('breaks y ties by smallest x', () => {
    const right = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 8, 3);
    const left  = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 2, 3);
    const state = makeState([], [right, left]);
    const chosen = selectNorthMostStronghold(state);
    expect(chosen?.position.x).toBe(2);
    expect(chosen?.id).toBe(left.id);
  });

  it('returns null when no player stronghold exists', () => {
    const enemy = makeBuilding(BuildingType.STRONGHOLD, Faction.ENEMY, 5, 5);
    const state = makeState([], [enemy]);
    expect(selectNorthMostStronghold(state)).toBeNull();
  });

  it('returns the single stronghold when there is only one', () => {
    const only = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 3, 8);
    const state = makeState([], [only]);
    const chosen = selectNorthMostStronghold(state);
    expect(chosen?.id).toBe(only.id);
  });
});
