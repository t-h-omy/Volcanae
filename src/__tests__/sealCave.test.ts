/**
 * BB-01: sealCave action tests.
 *
 * Coverage:
 *  - Encounter entry is removed and hasCaveMonster is cleared.
 *  - No Mine building is created on the tile.
 *  - The BUILDANDCAPTURE unit on the tile keeps all action flags unchanged.
 *  - Gating: sealCave does nothing when no player BUILDANDCAPTURE unit is on the tile.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { MAP } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';

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
    terrainType: TileType.MOUNTAIN,
    status: null,
    hasCaveMonster: true,
    ...overrides,
  } as unknown as Tile;
}

function makeFullGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) =>
      makeTile(x, y, { terrainType: TileType.PLAINS, hasCaveMonster: false }),
    ),
  );
}

function makeGameStats() {
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

function makeEngineer(x: number, y: number): Unit {
  return {
    id: nextId('eng'),
    type: UnitType.SPEARMAN,
    faction: Faction.PLAYER,
    position: { x, y },
    stats: {
      maxHp: 30,
      currentHp: 30,
      attack: 10,
      defense: 10,
      moveRange: 2,
      discoverRadius: 2,
      triggerRange: 0,
      movementActions: 1,
      attackRange: 1,
    },
    tags: [UnitTag.BUILDANDCAPTURE],
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

function makeBaseState(
  units: Unit[],
  buildings: Building[],
  activeCaveEncounters: GameState['activeCaveEncounters'] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  const grid = makeFullGrid();
  for (const u of units) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of buildings) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }

  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    turn: 1,
    resources: { iron: 20, wood: 20 },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    gameStats: makeGameStats(),
    techFlags: [],
    techNodes: {} as GameState['techNodes'],
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters,
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
    phase: GamePhase.PLAYER_TURN,
  } as unknown as GameState;
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  useAnimationStore.setState({ eventQueue: [], resolvedState: null });
});

describe('sealCave', () => {
  it('clears hasCaveMonster and removes the activeCaveEncounters entry', () => {
    const engineer = makeEngineer(5, 5);
    const tilePos = { x: 5, y: 5 };
    const mountainTileId = '5,5';

    const state = makeBaseState(
      [engineer],
      [],
      [{ mountainTileId, monsterId: 'monster_1' }],
    );
    state.grid[5][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][5].hasCaveMonster = true;

    useGameStore.setState(state);
    useGameStore.getState().sealCave(tilePos);

    const next = useGameStore.getState();
    expect(next.grid[5][5].hasCaveMonster).toBe(false);
    expect(next.activeCaveEncounters.length).toBe(0);
  });

  it('does NOT create a Mine building on the tile', () => {
    const engineer = makeEngineer(5, 5);
    const tilePos = { x: 5, y: 5 };

    const state = makeBaseState([engineer], []);
    state.grid[5][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][5].hasCaveMonster = true;

    useGameStore.setState(state);
    useGameStore.getState().sealCave(tilePos);

    const next = useGameStore.getState();
    expect(next.grid[5][5].buildingId).toBeNull();
    expect(Object.keys(next.buildings).length).toBe(0);
  });

  it('does NOT exhaust any action flags on the BUILDANDCAPTURE unit', () => {
    const engineer = makeEngineer(5, 5);
    const tilePos = { x: 5, y: 5 };

    const state = makeBaseState([engineer], []);
    state.grid[5][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][5].hasCaveMonster = true;

    useGameStore.setState(state);
    useGameStore.getState().sealCave(tilePos);

    const next = useGameStore.getState();
    const unit = next.units[engineer.id];
    expect(unit.hasMovedThisTurn).toBe(false);
    expect(unit.hasAttackedThisTurn).toBe(false);
    expect(unit.hasConstructedThisTurn).toBe(false);
    expect(unit.hasDestroyedThisTurn).toBe(false);
    expect(unit.hasCapturedThisTurn).toBe(false);
  });

  it('does nothing when there is no unit on the tile', () => {
    const tilePos = { x: 5, y: 5 };

    const state = makeBaseState([], []);
    state.grid[5][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][5].hasCaveMonster = true;

    useGameStore.setState(state);
    useGameStore.getState().sealCave(tilePos);

    const next = useGameStore.getState();
    expect(next.grid[5][5].hasCaveMonster).toBe(true);
  });

  it('does nothing when the unit on the tile is not BUILDANDCAPTURE', () => {
    const scout = makeEngineer(5, 5);
    scout.tags = [];
    const tilePos = { x: 5, y: 5 };

    const state = makeBaseState([scout], []);
    state.grid[5][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][5].hasCaveMonster = true;

    useGameStore.setState(state);
    useGameStore.getState().sealCave(tilePos);

    const next = useGameStore.getState();
    expect(next.grid[5][5].hasCaveMonster).toBe(true);
  });

  it('does nothing when the unit on the tile is enemy faction', () => {
    const enemy = makeEngineer(5, 5);
    enemy.faction = Faction.ENEMY;
    const tilePos = { x: 5, y: 5 };

    const state = makeBaseState([enemy], []);
    state.grid[5][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][5].hasCaveMonster = true;

    useGameStore.setState(state);
    useGameStore.getState().sealCave(tilePos);

    const next = useGameStore.getState();
    expect(next.grid[5][5].hasCaveMonster).toBe(true);
  });
});
