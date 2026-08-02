/**
 * Tests for VF-01 - Flying units must not ice-slide on frozen tiles.
 *
 * Covers:
 *  - Enemy FLYING unit moves onto a FROZEN tile via moveEnemyUnit (called by
 *    runEnemyTurn) and stays on that tile; it does NOT slide.
 *  - Enemy non-flying unit moves onto a FROZEN tile and slides one additional
 *    tile in the movement direction.
 *
 * Grid layout (column x=4, south = increasing y):
 *   y=28: enemy unit start
 *   y=29: FROZEN tile
 *   y=30: empty plains (slide destination for non-flying)
 *   y=70: player STRONGHOLD (AI movement target)
 */

import { describe, expect, it } from 'vitest';
import { BuildingType, DestroyBehavior, Faction, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { BUILDING_DEFINITIONS, MAP } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { runEnemyTurn } from '../enemySystem';

// ============================================================================
// Helpers
// ============================================================================

let idSeq = 0;
function nextId(prefix = 'x'): string {
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

function makeFullGrid(tileOverrides: Record<string, Partial<Tile>> = {}): Tile[][] {
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
    id: nextId('e'),
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

function makeStronghold(x: number, y: number): Building {
  const cfg = BUILDING_DEFINITIONS[BuildingType.STRONGHOLD];
  return {
    id: nextId('b'),
    type: BuildingType.STRONGHOLD,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: cfg?.combatStats?.maxHp ?? 500,
    maxHp: cfg?.combatStats?.maxHp ?? 500,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: cfg?.discoverRadius ?? 3,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: cfg?.combatStats ? { ...cfg.combatStats } : null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
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
  } as Building;
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  tileOverrides?: Record<string, Partial<Tile>>;
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
    globalSpecialistStorage: [],
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    gameStats: makeGameStats(),
    techFlags: [],
    techNodes: {} as GameState['techNodes'],
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
// Tests
// ============================================================================

const COL = 4;
const ENEMY_Y = 28;
const FROZEN_Y = 29;
const SLIDE_DEST_Y = 30;
const STRONGHOLD_Y = 70;

function makeCorridorTileOverrides(): Record<string, Partial<Tile>> {
  const overrides: Record<string, Partial<Tile>> = {
    [`${COL},${FROZEN_Y}`]: { status: TileStatus.FROZEN },
  };

  for (let y = ENEMY_Y; y <= SLIDE_DEST_Y + 1; y += 1) {
    for (let x = 0; x < MAP.GRID_WIDTH; x += 1) {
      if (x === COL) continue;
      overrides[`${x},${y}`] = { terrainType: TileType.CANYON };
    }
  }

  return overrides;
}

describe('VF-01: FLYING enemy does not ice-slide on FROZEN tile', () => {
  it('FLYING enemy lands on FROZEN tile and stays there (no slide)', () => {
    const enemy = makeEnemy(COL, ENEMY_Y, { tags: [UnitTag.FLYING] });
    const stronghold = makeStronghold(COL, STRONGHOLD_Y);

    const state = makeState({
      units: [enemy],
      buildings: [stronghold],
      tileOverrides: makeCorridorTileOverrides(),
    });

    const { finalState } = runEnemyTurn(state);

    const movedUnit = finalState.units[enemy.id];
    expect(movedUnit, 'unit should still be alive').toBeDefined();
    // Flying unit should land on the FROZEN tile and not slide further.
    expect(movedUnit!.position.y).toBe(FROZEN_Y);
    expect(movedUnit!.position.x).toBe(COL);
  });

  it('non-flying enemy lands on FROZEN tile and slides one additional tile south', () => {
    const enemy = makeEnemy(COL, ENEMY_Y, { tags: [] });
    const stronghold = makeStronghold(COL, STRONGHOLD_Y);

    const state = makeState({
      units: [enemy],
      buildings: [stronghold],
      tileOverrides: makeCorridorTileOverrides(),
    });

    const { finalState } = runEnemyTurn(state);

    const movedUnit = finalState.units[enemy.id];
    expect(movedUnit, 'unit should still be alive').toBeDefined();
    // Non-flying unit should slide one tile beyond the FROZEN tile.
    expect(movedUnit!.position.y).toBe(SLIDE_DEST_Y);
    expect(movedUnit!.position.x).toBe(COL);
  });
});
