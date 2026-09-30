import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createInitialSpecialists } from '../specialistSystem';
import {
  computeUnitAiScores,
  runEnemyTurn,
  shouldPersistDecisionTerms,
  type ScoredAction,
} from '../enemySystem';
import {
  AI_TRACE,
  BUILDING_DEFINITIONS,
  MAP,
  UNIT_DEFINITIONS,
} from '../gameConfig';
import {
  ACTION_TABLE,
  AI_ROW_COLUMNS,
  TERM_CODES,
  TERM_TABLE,
  getDominantTraceTerm,
  getStopCode,
  pushCandidate,
} from '../aiTrace';
import { buildTraceExport } from '../aiTraceExport';
import { appendChunk } from '../aiTraceStore';
import { EXPECTED_COMPUTE_UNIT_AI_SCORES, EXPECTED_ENEMY_TURN_FINAL_STATE } from './fixtures/aiTraceTerms.fixture';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  GamePhase,
  TileType,
  UnitType,
  type Building,
  type GameState,
  type Tile,
  type Unit,
} from '../types';

let nextId = 0;

beforeEach(() => {
  nextId = 0;
  vi.restoreAllMocks();
  globalThis.indexedDB = new IDBFactory();
});

function id(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
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
  } as Tile;
}

function makeGrid(overrides: Record<string, Partial<Tile>> = {}): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y, overrides[`${x},${y}`] ?? {})),
  );
}

function makeGameStats(): GameState['gameStats'] {
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

function makeUnit(type: UnitType, faction: Faction, x: number, y: number, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: id(`unit_${type}_${faction}`),
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
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    spellsCastThisTurn: 0,
    ...overrides,
  };
}

function makeBuilding(type: BuildingType, faction: Faction | null, x: number, y: number, overrides: Partial<Building> = {}): Building {
  const def = BUILDING_DEFINITIONS[type];
  return {
    id: id(`building_${type}`),
    type,
    faction,
    position: { x, y },
    hp: def?.combatStats?.maxHp ?? 100,
    maxHp: def?.combatStats?.maxHp ?? 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: def?.discoverRadius ?? 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: def?.combatStats ? { ...def.combatStats } : null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: def?.destroyBehavior ?? DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    preventiveStrikeFiredThisTurn: false,
    ...overrides,
  } as Building;
}

function makeState(params: {
  units?: Unit[];
  buildings?: Building[];
  tileOverrides?: Record<string, Partial<Tile>>;
  turn?: number;
  lavaFrontRow?: number;
  zoneLockoutUntilTurn?: GameState['zoneLockoutUntilTurn'];
  portals?: GameState['portals'];
} = {}): GameState {
  const units = Object.fromEntries((params.units ?? []).map((unit) => [unit.id, unit]));
  const buildings = Object.fromEntries((params.buildings ?? []).map((building) => [building.id, building]));
  const grid = makeGrid(params.tileOverrides ?? {});
  for (const unit of Object.values(units)) {
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }
  for (const building of Object.values(buildings)) {
    grid[building.position.y][building.position.x].buildingId = building.id;
  }
  return {
    turn: params.turn ?? 7,
    phase: GamePhase.PLAYER_TURN,
    grid,
    units,
    buildings,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    lavaFrontRow: params.lavaFrontRow ?? MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 10,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    arcaneCrystals: 0,
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    gameStats: makeGameStats(),
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: params.zoneLockoutUntilTurn ?? {},
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
    portals: params.portals ?? {},
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    activeWaveTheme: null,
  } as unknown as GameState;
}

function sumTerms(action: ScoredAction): number {
  return action.traceTerms?.reduce((sum, [, value]) => sum + value, 0) ?? 0;
}

function sanitizeFixtureValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => (typeof entry === 'number' && Number.isNaN(entry) ? null : entry))) as T;
}

function createScoreSnapshotState(): { state: GameState; unitId: string } {
  nextId = 0;
  const enemy = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, 6, 6);
  const p1 = makeUnit(UnitType.ARCHER, Faction.PLAYER, 7, 6);
  const p2 = makeUnit(UnitType.SWORDSMAN, Faction.PLAYER, 8, 6);
  const enemyB = makeBuilding(BuildingType.WATCHTOWER, Faction.ENEMY, 6, 8);
  const playerB = makeBuilding(BuildingType.WATCHTOWER, Faction.PLAYER, 8, 8);
  const neutralB = makeBuilding(BuildingType.OUTPOST, null, 6, 4);
  const state = makeState({
    units: [enemy, p1, p2],
    buildings: [enemyB, playerB, neutralB],
    turn: 9,
    lavaFrontRow: 12,
    tileOverrides: {
      '6,7': { isRuin: true },
      '5,6': { terrainType: TileType.FOREST },
      '7,7': { isStrongholdRuin: true },
    },
  });
  return { state, unitId: enemy.id };
}

function createEnemyTurnSnapshotState(): GameState {
  nextId = 0;
  const archer = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, 6, 6);
  const grunt = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 10);
  const ember = makeUnit(UnitType.EMBERLING, Faction.ENEMY, 3, 3);
  const p1 = makeUnit(UnitType.ARCHER, Faction.PLAYER, 7, 6);
  const p2 = makeUnit(UnitType.SWORDSMAN, Faction.PLAYER, 8, 6);
  const p3 = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 11);
  const enemyTower = makeBuilding(BuildingType.WATCHTOWER, Faction.ENEMY, 6, 8);
  const enemyLair = makeBuilding(BuildingType.LAVALAIR, Faction.ENEMY, 4, 12);
  const playerTower = makeBuilding(BuildingType.WATCHTOWER, Faction.PLAYER, 8, 8);
  const neutralOutpost = makeBuilding(BuildingType.OUTPOST, null, 6, 4);
  const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 8, 14);
  return makeState({
    units: [archer, grunt, ember, p1, p2, p3],
    buildings: [enemyTower, enemyLair, playerTower, neutralOutpost, stronghold],
    turn: 9,
    lavaFrontRow: 4,
    tileOverrides: {
      '6,7': { isRuin: true },
      '7,7': { isStrongholdRuin: true },
      '5,6': { terrainType: TileType.FOREST },
      '4,3': { isLava: true },
      '3,4': { isLava: true },
      '2,3': { isLava: true },
      '4,12': { buildingId: enemyLair.id },
    },
  });
}

function createHoldState(): GameState {
  nextId = 0;
  const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4, { hasMovedThisTurn: true });
  return makeState({ units: [enemy], turn: 11, lavaFrontRow: 0 });
}

function createNoPathState(): GameState {
  nextId = 0;
  const col = 4;
  const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, 4);
  return makeState({
    units: [enemy],
    buildings: [makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, col, 12)],
    tileOverrides: {
      [`${col - 1},3`]: { terrainType: TileType.CANYON },
      [`${col},3`]: { terrainType: TileType.CANYON },
      [`${col + 1},3`]: { terrainType: TileType.CANYON },
      [`${col - 1},4`]: { terrainType: TileType.CANYON },
      [`${col + 1},4`]: { terrainType: TileType.CANYON },
      [`${col - 1},5`]: { terrainType: TileType.CANYON },
      [`${col},5`]: { terrainType: TileType.CANYON },
      [`${col + 1},5`]: { terrainType: TileType.CANYON },
    },
  });
}

function createUncontestedAdvanceState(): GameState {
  nextId = 0;
  const enemy = makeUnit(UnitType.EMBERLING, Faction.ENEMY, 4, 4);
  return makeState({ units: [enemy], turn: 8, lavaFrontRow: 10 });
}

function createPortalState(): { state: GameState; unitId: string } {
  nextId = 0;
  const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 2, 2);
  const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, 0, 0);
  const state = makeState({
    units: [enemy, caster],
    turn: 12,
    portals: {
      portal_1: {
        id: 'portal_1',
        casterId: caster.id,
        entrancePos: { x: 2, y: 3 },
        exitPos: { x: 2, y: 6 },
        createdTurn: 12,
        lastUsableTurn: 13,
        pendingTeleportUnitId: null,
      },
    },
  });
  return { state, unitId: enemy.id };
}

describe('aiTrace score terms', () => {
  it('keeps each traced candidate term sum equal to its score', () => {
    const scoreCase = createScoreSnapshotState();
    const portalCase = createPortalState();
    const noPathCase = createNoPathState();
    const cases = [
      computeUnitAiScores(scoreCase.state, scoreCase.unitId, true),
      computeUnitAiScores(portalCase.state, portalCase.unitId, true),
      computeUnitAiScores(noPathCase, Object.values(noPathCase.units).find((unit) => unit.faction === Faction.ENEMY)!.id, true),
    ];

    for (const scores of cases) {
      for (const action of scores) {
        expect(action.traceTerms).toBeTruthy();
        expect(sumTerms(action)).toBe(action.score);
      }
    }
  });

  it('matches the pre-refactor computeUnitAiScores fixture exactly', () => {
    const { state, unitId } = createScoreSnapshotState();
    expect(computeUnitAiScores(state, unitId)).toEqual(EXPECTED_COMPUTE_UNIT_AI_SCORES);
  });

  it('matches the pre-refactor full enemy turn fixture exactly with deterministic randomness', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    vi.spyOn(Date, 'now').mockReturnValue(1790708367414);
    expect(sanitizeFixtureValue(runEnemyTurn(createEnemyTurnSnapshotState()).finalState)).toEqual(EXPECTED_ENEMY_TURN_FINAL_STATE);
  });

  it('omits traceTerms when tracing is off', () => {
    const { state, unitId } = createScoreSnapshotState();
    for (const action of computeUnitAiScores(state, unitId)) {
      expect('traceTerms' in action).toBe(false);
    }
  });

  it('caps long term lists by folding the smallest entries into OTHER without changing the score', () => {
    const out: ScoredAction[] = [];
    pushCandidate(out, 'ATTACK_UNIT', [
      [TERM_CODES.BASE, 10],
      [TERM_CODES.DISTANCE, -1],
      [TERM_CODES.COMBAT, 8],
      [TERM_CODES.SATURATION, -2],
      [TERM_CODES.THREAT, 3],
      [TERM_CODES.TAG, 2],
      [TERM_CODES.LAVA, 1],
    ], {}, true);
    expect(out).toHaveLength(1);
    expect(out[0].traceTerms).toHaveLength(AI_TRACE.MAX_TERMS);
    expect(out[0].traceTerms?.some(([code]) => code === TERM_CODES.OTHER)).toBe(true);
    expect(sumTerms(out[0])).toBe(out[0].score);
  });

  it('picks the largest-magnitude dominant term even when it is negative', () => {
    expect(getDominantTraceTerm([
      [TERM_CODES.BASE, 12],
      [TERM_CODES.DISTANCE, -18],
      [TERM_CODES.COMBAT, 5],
    ])).toBe(TERM_CODES.DISTANCE);
  });

  it('records terms only for contested decisions and leaves uncontested rows empty', () => {
    expect(shouldPersistDecisionTerms(10, 8, 'ATTACK_UNIT', 1)).toBe(true);
    expect(shouldPersistDecisionTerms(3, null, 'HOLD_POSITION', 0)).toBe(true);
    expect(shouldPersistDecisionTerms(20, 5, 'MOVE_TO_UNIT', 0)).toBe(true);
    expect(shouldPersistDecisionTerms(20, 5, 'ATTACK_UNIT', 1)).toBe(false);

    const holdTrace = runEnemyTurn(createHoldState(), { trace: true, slotId: 'hold_slot' }).trace!;
    expect(holdTrace.rows[0][26]).not.toBeNull();
    expect(holdTrace.rows[0][27]).toBeNull();

    const blockedTrace = runEnemyTurn(createNoPathState(), { trace: true, slotId: 'blocked_slot' }).trace!;
    expect(blockedTrace.rows[0][17]).toBe(0);
    expect(blockedTrace.rows[0][18]).toBe(getStopCode('NO_PATH'));
    expect(blockedTrace.rows[0][26]).not.toBeNull();

    const uncontestedTrace = runEnemyTurn(createUncontestedAdvanceState(), { trace: true, slotId: 'advance_slot' }).trace!;
    expect(ACTION_TABLE[uncontestedTrace.rows[0][3]]).toBe('ADVANCE_TOWARD_LAVA');
    expect(uncontestedTrace.rows[0][26]).toBeNull();
    expect(uncontestedTrace.rows[0][27]).toBeNull();
  });

  it('exports TERM_TABLE in the legend and keeps noTerms mode stripping the reserved columns', async () => {
    const fullState = createEnemyTurnSnapshotState();
    const traced = runEnemyTurn(fullState, { trace: true, slotId: 'export_terms_slot' }).trace!;
    await appendChunk('export_terms_slot', traced);
    const full = await buildTraceExport('export_terms_slot', 'full');
    const noTerms = await buildTraceExport('export_terms_slot', 'noTerms');
    expect(full).not.toBeNull();
    expect(noTerms).not.toBeNull();
    const fullJson = JSON.parse(await full!.blob.text()) as { legend: { terms: string[] }; columns: string[]; rows: unknown[][] };
    const noTermsJson = JSON.parse(await noTerms!.blob.text()) as { columns: string[]; rows: unknown[][] };
    expect(fullJson.legend.terms).toEqual([...TERM_TABLE]);
    expect(noTermsJson.columns).toEqual(fullJson.columns.filter((column) => !['domTerm', 'terms', 'terms2'].includes(column)));
    expect(noTermsJson.rows[0]).toHaveLength(noTermsJson.columns.length);
    expect(fullJson.rows[0]).toHaveLength(AI_ROW_COLUMNS.length + 1);
  });
});
