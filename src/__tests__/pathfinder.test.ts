import { describe, expect, it } from 'vitest';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { constructBuilding } from '../constructionSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { BuildingType, Faction, TileType, UnitTag, UnitType } from '../types';
import type { GameState, GameStats, Tile, Unit } from '../types';
import { produce } from 'immer';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTile(x: number, y: number): Tile {
  return {
    position: { x, y },
    isRevealed: false,
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

function makeGameStats(): GameStats {
  return {
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
  };
}

function makeBuilder(x: number, y: number): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SWORDSMAN];
  return {
    id: 'builder',
    type: UnitType.SWORDSMAN,
    faction: Faction.PLAYER,
    position: { x, y },
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
    tags: [...def.tags, UnitTag.BUILDANDCAPTURE],
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
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
}

function makeState(builderX: number, builderY: number): GameState {
  const grid = makeGrid();
  const builder = makeBuilder(builderX, builderY);

  // Mark the builder's tile as isStrongholdRuin so STRONGHOLD construction is valid
  grid[builderY][builderX].isStrongholdRuin = true;
  grid[builderY][builderX].unitId = builder.id;

  return {
    turn: 1,
    phase: undefined as unknown as GameState['phase'],
    units: { [builder.id]: builder },
    buildings: {},
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
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
    gameStats: makeGameStats(),
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: undefined as unknown as GameState['difficulty'],
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
  };
}

/**
 * Returns the [startRow, endRow] (inclusive) for the zone that contains row y.
 */
function zoneRowRange(y: number): [number, number] {
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - y) / MAP.ZONE_HEIGHT);
  const zone = zoneIndex + 1;
  const endRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - (zone - 1) * MAP.ZONE_HEIGHT;
  const startRow = endRow - MAP.ZONE_HEIGHT + 1;
  return [startRow, endRow];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SP-21 Pathfinder (spec_21) — STRONGHOLD_ZONE_REVEAL', () => {
  // Pick a tile well inside the map (zone 3, not near lava or the very top)
  // Zone 3: endRow = 76 - 6 - 1 - (3-1)*7 = 69 - 14 = 55; startRow = 49
  const builderX = 4;
  const builderY = 52; // middle of zone 3

  it('reveals every tile in the stronghold\'s zone when STRONGHOLD_ZONE_REVEAL is active', () => {
    const state = makeState(builderX, builderY);
    state.globalSpecialistStorage = ['spec_21'];

    const nextState = produce(state, (draft) => {
      constructBuilding(draft, 'builder', { x: builderX, y: builderY }, BuildingType.STRONGHOLD);
    });

    const [startRow, endRow] = zoneRowRange(builderY);

    // All tiles in the zone must be revealed
    for (let y = startRow; y <= endRow; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        expect(nextState.grid[y][x].isRevealed).toBe(true);
      }
    }

    // Total revealed rows = ZONE_HEIGHT
    expect(endRow - startRow + 1).toBe(MAP.ZONE_HEIGHT);
  });

  it('does NOT reveal tiles outside the stronghold\'s zone', () => {
    const state = makeState(builderX, builderY);
    state.globalSpecialistStorage = ['spec_21'];

    const nextState = produce(state, (draft) => {
      constructBuilding(draft, 'builder', { x: builderX, y: builderY }, BuildingType.STRONGHOLD);
    });

    const [startRow, endRow] = zoneRowRange(builderY);

    // Row just above the zone (lower y = further from lava = different zone)
    if (startRow > 0) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        expect(nextState.grid[startRow - 1][x].isRevealed).toBe(false);
      }
    }

    // Row just below the zone (higher y = closer to lava)
    if (endRow + 1 < MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        expect(nextState.grid[endRow + 1][x].isRevealed).toBe(false);
      }
    }
  });

  it('does NOT reveal tiles when STRONGHOLD_ZONE_REVEAL is not active', () => {
    const state = makeState(builderX, builderY);
    // No specialist in globalSpecialistStorage

    const nextState = produce(state, (draft) => {
      constructBuilding(draft, 'builder', { x: builderX, y: builderY }, BuildingType.STRONGHOLD);
    });

    const [startRow, endRow] = zoneRowRange(builderY);

    for (let y = startRow; y <= endRow; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        expect(nextState.grid[y][x].isRevealed).toBe(false);
      }
    }
  });

  it('does NOT reveal tiles when the specialist is dormant', () => {
    const state = makeState(builderX, builderY);
    state.globalSpecialistStorage = ['spec_21'];
    state.specialists['spec_21']!.dormant = true;

    const nextState = produce(state, (draft) => {
      constructBuilding(draft, 'builder', { x: builderX, y: builderY }, BuildingType.STRONGHOLD);
    });

    const [startRow, endRow] = zoneRowRange(builderY);

    for (let y = startRow; y <= endRow; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        expect(nextState.grid[y][x].isRevealed).toBe(false);
      }
    }
  });

  it('only reveals the zone of the constructed stronghold, not other zones', () => {
    // Build at builderY which is in zone 3 — zone 5 tiles should stay hidden
    const state = makeState(builderX, builderY);
    state.globalSpecialistStorage = ['spec_21'];

    const nextState = produce(state, (draft) => {
      constructBuilding(draft, 'builder', { x: builderX, y: builderY }, BuildingType.STRONGHOLD);
    });

    const [startRow] = zoneRowRange(builderY);

    // Zone 5 startRow (highest zone, lowest y):
    // zone 5: endRow = 76 - 6 - 1 - (5-1)*7 = 69 - 28 = 41; startRow = 35
    const [zone5Start, zone5End] = zoneRowRange(38); // y=38 is in zone 5
    // Ensure zone 5 is indeed a different zone from zone 3
    expect(zone5Start).not.toBe(startRow);

    for (let y = zone5Start; y <= zone5End; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        expect(nextState.grid[y][x].isRevealed).toBe(false);
      }
    }
  });
});
