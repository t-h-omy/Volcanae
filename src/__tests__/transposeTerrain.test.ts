/**
 * Transpose terrain legality: a swap is legal only when each unit may stand
 * on the other unit's tile under normal terrain occupancy rules.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  SpellId,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import {
  castSpell,
  explainInvalidSpellTarget,
  getTransposeTerrainBlockedTargets,
  getValidSpellTargets,
} from '../spellSystem';
import { canUnitOccupyTerrain, getReachableTiles } from '../movementSystem';
import { useGameStore } from '../gameStore';

let nextIdValue = 0;

function nextId(prefix: string): string {
  nextIdValue += 1;
  return `${prefix}_${nextIdValue}`;
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
    ...overrides,
  };
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId('unit'),
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
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags, ...tags],
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

function makeBuilding(type: BuildingType, position: Position): Building {
  return {
    id: nextId('building'),
    type,
    faction: Faction.PLAYER,
    position: { ...position },
    hp: 1,
    maxHp: 1,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 0,
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
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState({
  units = [],
  buildings = [],
  pendingTransposeFirstUnitId = null,
}: {
  units?: Unit[];
  buildings?: Building[];
  pendingTransposeFirstUnitId?: string | null;
} = {}): GameState {
  const grid = makeGrid();
  const unitMap: Record<string, Unit> = {};
  const buildingMap: Record<string, Building> = {};

  for (const unit of units) {
    unitMap[unit.id] = unit;
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }

  for (const building of buildings) {
    buildingMap[building.id] = building;
    grid[building.position.y][building.position.x].buildingId = building.id;
  }

  return {
    turn: 1,
    phase: 'PLAYER',
    grid,
    units: unitMap,
    buildings: buildingMap,
    specialists: {},
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 0,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    techNodes: {},
    techFlags: [],
    arcaneCrystals: 0,
    unlockedBuildings: [BuildingType.BRIDGE],
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
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'normal',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
  } as unknown as GameState;
}

const TERRAIN_REASON = 'Cannot transpose: unit cannot occupy that terrain.';

interface Scenario {
  state: GameState;
  mage: Unit;
  first: Unit;
  second: Unit;
}

/** Mage at (5,5); first unit at (6,5) on plains; second unit at (5,6) on the given terrain. */
function makeScenario({
  firstType = UnitType.GUARD,
  secondType = UnitType.GARGOYLE,
  secondTerrain,
  secondStatus = null,
  faction = Faction.PLAYER,
  firstTerrain = TileType.PLAINS,
  buildings = [],
}: {
  firstType?: UnitType;
  secondType?: UnitType;
  secondTerrain: TileType;
  secondStatus?: TileStatus | null;
  faction?: Faction;
  firstTerrain?: TileType;
  buildings?: Building[];
}): Scenario {
  const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
  const first = makeUnit(firstType, { x: 6, y: 5 }, faction);
  const second = makeUnit(secondType, { x: 5, y: 6 }, faction);
  const state = makeState({
    units: [mage, first, second],
    buildings,
    pendingTransposeFirstUnitId: first.id,
  });
  state.grid[6][5].terrainType = secondTerrain;
  state.grid[6][5].status = secondStatus;
  state.grid[5][6].terrainType = firstTerrain;
  state.unlockedSpells = [SpellId.TRANSPOSE];
  state.arcaneCrystals = 1;
  state.pendingSpellCast = { mageId: mage.id, spellId: SpellId.TRANSPOSE };
  return { state, mage, first, second };
}

function hasPos(list: Position[], p: Position): boolean {
  return list.some((q) => q.x === p.x && q.y === p.y);
}

function expectRejected({ state, mage, first, second }: Scenario): void {
  expect(hasPos(getValidSpellTargets(state, mage.id, SpellId.TRANSPOSE), second.position)).toBe(false);
  expect(hasPos(getTransposeTerrainBlockedTargets(state, mage.id), second.position)).toBe(true);
  expect(explainInvalidSpellTarget(state, mage.id, SpellId.TRANSPOSE, second.position))
    .toBe(TERRAIN_REASON);

  const next = produce(state, (draft) => {
    expect(castSpell(draft, mage.id, SpellId.TRANSPOSE, second.position)).toBe(false);
  });
  expect(next.units[first.id].position).toEqual(first.position);
  expect(next.units[second.id].position).toEqual(second.position);
  expect(next.grid[first.position.y][first.position.x].unitId).toBe(first.id);
  expect(next.grid[second.position.y][second.position.x].unitId).toBe(second.id);
  expect(next.arcaneCrystals).toBe(1);
  expect(next.pendingTransposeFirstUnitId).toBe(first.id);
}

function expectAccepted({ state, mage, first, second }: Scenario): void {
  expect(hasPos(getValidSpellTargets(state, mage.id, SpellId.TRANSPOSE), second.position)).toBe(true);
  expect(hasPos(getTransposeTerrainBlockedTargets(state, mage.id), second.position)).toBe(false);
  expect(explainInvalidSpellTarget(state, mage.id, SpellId.TRANSPOSE, second.position)).toBeNull();

  const next = produce(state, (draft) => {
    expect(castSpell(draft, mage.id, SpellId.TRANSPOSE, second.position)).toBe(true);
  });
  expect(next.units[first.id].position).toEqual(second.position);
  expect(next.units[second.id].position).toEqual(first.position);
  expect(next.arcaneCrystals).toBe(0);
}

describe('Transpose terrain legality', () => {
  it('rejects a non-flying unit swapping onto ordinary water held by a flyer', () => {
    expectRejected(makeScenario({ secondTerrain: TileType.WATER }));
  });

  it('rejects a non-flying unit swapping onto a canyon without a bridge', () => {
    expectRejected(makeScenario({ secondTerrain: TileType.CANYON }));
  });

  it('rejects the swap regardless of pick order (flyer picked first)', () => {
    expectRejected(makeScenario({
      firstType: UnitType.GARGOYLE,
      secondType: UnitType.GUARD,
      firstTerrain: TileType.WATER,
      secondTerrain: TileType.PLAINS,
    }));
  });

  it('allows a non-flying unit onto a bridged canyon tile', () => {
    const bridge = makeBuilding(BuildingType.BRIDGE, { x: 5, y: 6 });
    expectAccepted(makeScenario({ secondTerrain: TileType.CANYON, buildings: [bridge] }));
  });

  it('allows two flying units to swap across water and canyon', () => {
    expectAccepted(makeScenario({
      firstType: UnitType.GARGOYLE,
      secondType: UnitType.GARGOYLE,
      firstTerrain: TileType.CANYON,
      secondTerrain: TileType.WATER,
    }));
  });

  it('allows a non-flying player unit onto frozen water, matching player movement', () => {
    const scenario = makeScenario({ secondTerrain: TileType.WATER, secondStatus: TileStatus.FROZEN });
    expect(canUnitOccupyTerrain(scenario.state, scenario.first, 5, 6)).toBe(true);
    expectAccepted(scenario);
  });

  it('rejects a non-flying enemy unit onto frozen water, matching enemy movement', () => {
    expectRejected(makeScenario({
      faction: Faction.ENEMY,
      firstType: UnitType.ARCHER,
      secondTerrain: TileType.WATER,
      secondStatus: TileStatus.FROZEN,
    }));
  });

  it('keeps movement reachability consistent with the occupancy helper', () => {
    const player = makeUnit(UnitType.GUARD, { x: 5, y: 5 });
    const enemy = makeUnit(UnitType.GUARD, { x: 5, y: 10 }, Faction.ENEMY);
    const state = makeState({ units: [player, enemy] });
    state.grid[5][6].terrainType = TileType.WATER;
    state.grid[5][6].status = TileStatus.FROZEN;
    state.grid[10][6].terrainType = TileType.WATER;
    state.grid[10][6].status = TileStatus.FROZEN;
    state.grid[6][5].terrainType = TileType.CANYON;

    expect(hasPos(getReachableTiles(state, player.id), { x: 6, y: 5 })).toBe(true);
    expect(hasPos(getReachableTiles(state, enemy.id), { x: 6, y: 10 })).toBe(false);
    expect(hasPos(getReachableTiles(state, player.id), { x: 5, y: 6 })).toBe(false);
  });
});

describe('Transpose terrain legality via the game store', () => {
  afterEach(() => {
    useGameStore.setState({ pendingSpellCast: null, pendingTransposeFirstUnitId: null });
  });

  it('spends no crystal or Mage cast and keeps targeting active on an illegal swap', () => {
    const { state, mage, first, second } = makeScenario({ secondTerrain: TileType.WATER });
    useGameStore.setState(state);

    useGameStore.getState().castSpell(second.position);

    const after = useGameStore.getState();
    expect(after.arcaneCrystals).toBe(1);
    expect(after.units[mage.id].spellsCastThisTurn ?? 0).toBe(0);
    expect(after.pendingSpellCast).toEqual({ mageId: mage.id, spellId: SpellId.TRANSPOSE });
    expect(after.pendingTransposeFirstUnitId).toBe(first.id);
    expect(after.units[first.id].position).toEqual(first.position);
    expect(after.units[second.id].position).toEqual(second.position);
  });
});
