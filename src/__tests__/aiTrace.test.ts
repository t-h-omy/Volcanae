import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createInitialSpecialists } from '../specialistSystem';
import { deleteSlot, openSaveDb } from '../saveSystem';
import { runEnemyTurn, ENEMY_ACTION_TYPES } from '../enemySystem';
import { AI_TRACE, BUILDING_DEFINITIONS, MAP, SAVE, UNIT_DEFINITIONS } from '../gameConfig';
import {
  ACTION_TABLE,
  AI_ROW_COLUMNS,
  getStopCode,
  type AiRow,
  type AiTraceChunk,
} from '../aiTrace';
import {
  appendChunk,
  deleteTurnsAfter,
  getTraceStatus,
  readMeta,
  readRun,
} from '../aiTraceStore';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  GamePhase,
  TileType,
  TileStatus,
  UnitType,
} from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import * as saveSystem from '../saveSystem';

let nextId = 0;

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

function makeUnit(
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  overrides: Partial<Unit> = {},
): Unit {
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

function makeBuilding(
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
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
  activeCaveEncounters?: GameState['activeCaveEncounters'];
  zoneLockoutUntilTurn?: GameState['zoneLockoutUntilTurn'];
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
    activeCaveEncounters: params.activeCaveEncounters ?? [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    activeWaveTheme: null,
  } as unknown as GameState;
}

function getTraceRows(chunk: AiTraceChunk): AiRow[] {
  return chunk.rows;
}

function getZoneForRow(row: number): number {
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

async function countTraceRecords(): Promise<number> {
  const db = await openSaveDb();
  return await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(SAVE.STORE_TRACE, 'readonly');
    const req = tx.objectStore(SAVE.STORE_TRACE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function makeChunk(slotId: string, turn: number, row: AiRow, unitIdValue = `u_${turn}`): AiTraceChunk {
  return {
    key: `${slotId}:${String(turn).padStart(6, '0')}`,
    slotId,
    turn,
    rows: [row],
    units: [[row[2], unitIdValue, UnitType.LAVA_GRUNT, turn, null, row[7], row[8], -1, '', 1]],
    buildings: [],
    summary: {
      t: turn,
      eu: 1,
      pu: 0,
      pHp: 0,
      pAtk: 0,
      pB: 0,
      eHp: 10,
      eAtk: 5,
      eB: 0,
      em: 0,
      lf: MAP.GRID_HEIGHT,
      front: [-1, row[8]],
      sp: 0,
      budget: null,
      acts: {},
      stops: {},
      blocked: 0,
      static: 0,
      slot2: 0,
      kills: 0,
      losses: 0,
      lockouts: [],
      threats: [],
    },
  };
}

beforeEach(() => {
  nextId = 0;
  vi.restoreAllMocks();
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  if (!('localStorage' in globalThis)) {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
      configurable: true,
    });
  }
  globalThis.localStorage.clear();
});

describe('aiTrace recorder', () => {
  it('pins ACTION_TABLE to the EnemyActionType order', () => {
    expect(ACTION_TABLE.slice(0, 26)).toEqual([...ENEMY_ACTION_TYPES]);
  });

  it('returns trace null with tracking off and leaves STORE_TRACE empty', async () => {
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, 10);
    const result = runEnemyTurn(makeState({ units: [enemy], buildings: [stronghold] }));
    expect(result.trace).toBeNull();
    expect(await countTraceRecords()).toBe(0);
  });

  it('records one row per executed action and uses slot 1 then 2 for a unit that acts twice', () => {
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4, {
      stats: { ...UNIT_DEFINITIONS[UnitType.LAVA_GRUNT], currentHp: UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp },
    } as Partial<Unit>);
    enemy.stats.moveRange = 1;
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 6);
    const result = runEnemyTurn(makeState({ units: [enemy, player] }), { trace: true, slotId: 'slot_slots' });
    expect(result.trace).not.toBeNull();
    const rows = getTraceRows(result.trace!);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row[1])).toEqual([1, 2]);
  });

  it('writes full-width rows and fixed-width ctx arrays', () => {
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, 10);
    const result = runEnemyTurn(makeState({ units: [enemy], buildings: [stronghold] }), { trace: true, slotId: 'slot_shape' });
    const rows = getTraceRows(result.trace!);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveLength(AI_ROW_COLUMNS.length);
      expect(row[24]).toHaveLength(8);
    }
  });

  it('captures the required movement stop reasons', () => {
    const col = 4;
    const blockers = {
      [`${col - 1},5`]: { terrainType: TileType.CANYON },
      [`${col + 1},5`]: { terrainType: TileType.CANYON },
    } satisfies Record<string, Partial<Tile>>;

    const noPathEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, 4);
    const noPathState = makeState({
      units: [noPathEnemy],
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
    const noPath = runEnemyTurn(noPathState, { trace: true, slotId: 'slot_no_path' }).trace!.rows[0][18];
    expect(noPath).toBe(getStopCode('NO_PATH'));

    const blockedEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, 4);
    blockedEnemy.stats.attackRange = 0;
    const blockedPlayer = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, col, 5);
    const blocked = runEnemyTurn(makeState({
      units: [blockedEnemy, blockedPlayer],
      tileOverrides: blockers,
    }), { trace: true, slotId: 'slot_blocked' }).trace!.rows[0][18];
    expect(blocked).toBe(getStopCode('BLOCKED_UNIT'));

    const rangeEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, 4);
    rangeEnemy.stats.moveRange = 1;
    const ranged = runEnemyTurn(makeState({
      units: [rangeEnemy],
      buildings: [makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, col, 12)],
      tileOverrides: blockers,
    }), { trace: true, slotId: 'slot_range' }).trace!.rows[0][18];
    expect(ranged).toBe(getStopCode('RANGE'));

    const lockoutRow = Array.from({ length: MAP.GRID_HEIGHT - 1 }, (_, y) => y).find((y) => getZoneForRow(y) > getZoneForRow(y + 1) && getZoneForRow(y + 1) > 0) ?? 10;
    const lockoutEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, lockoutRow);
    const lockoutZone = getZoneForRow(lockoutRow + 1);
    const zoneLocked = runEnemyTurn(makeState({
      units: [lockoutEnemy],
      buildings: [makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, col, lockoutRow + 8)],
      tileOverrides: blockers,
      zoneLockoutUntilTurn: { [lockoutZone]: 999 },
    }), { trace: true, slotId: 'slot_lockout' }).trace!.rows[0][18];
    expect(zoneLocked).toBe(getStopCode('ZONE_LOCKOUT'));

    const slideEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, 28);
    slideEnemy.stats.moveRange = 1;
    const slid = runEnemyTurn(makeState({
      units: [slideEnemy],
      buildings: [makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, col, 70)],
      tileOverrides: {
        [`${col - 1},29`]: { terrainType: TileType.CANYON },
        [`${col + 1},29`]: { terrainType: TileType.CANYON },
        [`${col},29`]: { status: TileStatus.FROZEN },
      },
    }), { trace: true, slotId: 'slot_slide' }).trace!.rows[0][18];
    expect(slid).toBe(getStopCode('SLID'));

    const alreadyThereEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, col, 4);
    alreadyThereEnemy.stats.moveRange = 0;
    const alreadyThere = runEnemyTurn(makeState({ units: [alreadyThereEnemy] }), { trace: true, slotId: 'slot_already' }).trace!.rows[0][18];
    expect(alreadyThere).toBe(getStopCode('ALREADY_THERE'));
  });

  it('records the terrain string for entered tiles including bridge crossings', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    enemy.stats.moveRange = 2;
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, 8);
    const bridge = makeBuilding(BuildingType.BRIDGE, null, 4, 5, { bridgeOrientation: 'NS' });
    const result = runEnemyTurn(makeState({
      units: [enemy],
      buildings: [stronghold, bridge],
      tileOverrides: {
        ['4,5']: { terrainType: TileType.CANYON },
        ['4,6']: { status: TileStatus.BURNING },
        ['3,5']: { terrainType: TileType.CANYON },
        ['5,5']: { terrainType: TileType.CANYON },
        ['3,6']: { terrainType: TileType.CANYON },
        ['5,6']: { terrainType: TileType.CANYON },
      },
    }), { trace: true, slotId: 'slot_terrain' });
    expect(result.trace!.rows[0][20]).toBe('BPb');
    randomSpy.mockRestore();
  });

  it('records cave monster pseudo-actions with null scores', () => {
    const mountain = { x: 4, y: 10 };
    const monster = makeUnit(UnitType.CAVE_MONSTER, Faction.ENEMY, mountain.x, mountain.y - 1);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, mountain.x, mountain.y);
    const result = runEnemyTurn(makeState({
      units: [monster, player],
      activeCaveEncounters: [{ mountainTileId: `${mountain.x},${mountain.y}`, monsterId: monster.id }],
      tileOverrides: { [`${mountain.x},${mountain.y}`]: { terrainType: TileType.MOUNTAIN, hasCaveMonster: true } },
    }), { trace: true, slotId: 'slot_cave' });
    const row = result.trace!.rows[0];
    expect(ACTION_TABLE[row[3]]).toMatch(/^CM_/);
    expect(row[4]).toBeNull();
    expect(row[5]).toBeNull();
  });

  it('persists appended turns and reads them back in order after reopening', async () => {
    const slotId = 'slot_persist';
    await appendChunk(slotId, makeChunk(slotId, 3, [3, 1, 0, 0, 5, null, [0], 0, 0, 1, 1, 10, 0, -1, -1, -1, -1, 1, 0, 1, 'P', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    await appendChunk(slotId, makeChunk(slotId, 1, [1, 1, 1, 0, 4, null, [0], 0, 0, 1, 1, 10, 0, -1, -1, -1, -1, 1, 0, 1, 'P', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    await appendChunk(slotId, makeChunk(slotId, 2, [2, 1, 2, 0, 6, null, [0], 0, 0, 1, 1, 10, 0, -1, -1, -1, -1, 1, 0, 1, 'P', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    (await openSaveDb()).close();
    const { chunks } = await readRun(slotId);
    expect(chunks.map((chunk) => chunk.turn)).toEqual([1, 2, 3]);
  });

  it('keeps unit indices stable across a simulated restart seeded from meta', async () => {
    const slotId = 'slot_seed';
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 6);
    const first = runEnemyTurn(makeState({ units: [enemy, player] }), { trace: true, slotId });
    await appendChunk(slotId, first.trace!);
    const meta = await readMeta(slotId);
    expect(meta).not.toBeNull();

    const persistedEnemy = { ...enemy, position: { x: 4, y: 5 } };
    const persistedPlayer = { ...player, position: { x: 4, y: 6 } };
    const freshEnemy = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, 6, 4);
    const second = runEnemyTurn(makeState({ units: [persistedEnemy, persistedPlayer, freshEnemy] }), {
      trace: true,
      slotId,
      unitIndexSeed: {
        nextUnitIndex: meta!.nextUnitIndex,
        nextBuildingIndex: meta!.nextBuildingIndex,
        unitIds: meta!.unitIds,
        buildingIds: meta!.buildingIds,
        buildingTypes: meta!.buildingTypes,
      },
    });
    const secondRows = second.trace!.rows;
    expect(secondRows.some((row) => row[2] === meta!.unitIds[enemy.id])).toBe(true);
    expect(secondRows.some((row) => row[2] >= meta!.nextUnitIndex)).toBe(true);
  });

  it('deleteTurnsAfter removes later chunks and leaves earlier ones', async () => {
    const slotId = 'slot_trim';
    await appendChunk(slotId, makeChunk(slotId, 1, [1, 1, 0, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    await appendChunk(slotId, makeChunk(slotId, 2, [2, 1, 1, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    await appendChunk(slotId, makeChunk(slotId, 3, [3, 1, 2, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    await deleteTurnsAfter(slotId, 1);
    const { chunks } = await readRun(slotId);
    expect(chunks.map((chunk) => chunk.turn)).toEqual([1]);
  });

  it('deleteSlot clears trace chunks and the meta record', async () => {
    const slotId = 'slot_delete';
    await appendChunk(slotId, makeChunk(slotId, 1, [1, 1, 0, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
    await deleteSlot(slotId);
    const { meta, chunks } = await readRun(slotId);
    expect(meta).toBeNull();
    expect(chunks).toHaveLength(0);
  });

  it('sets STOPPED_QUOTA on write failure and does not throw into the caller', async () => {
    const spy = vi.spyOn(saveSystem, 'openSaveDb').mockRejectedValue(new DOMException('quota', 'QuotaExceededError'));
    await expect(appendChunk('slot_quota', makeChunk('slot_quota', 1, [1, 1, 0, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]))).resolves.toBeUndefined();
    expect(getTraceStatus()).toBe('STOPPED_QUOTA');
    spy.mockRestore();
  });

  it('caps recording at MAX_ROWS without losing stored rows', async () => {
    const originalMaxRows = AI_TRACE.MAX_ROWS;
    (AI_TRACE as { MAX_ROWS: number }).MAX_ROWS = 1;
    try {
      const slotId = 'slot_cap';
      await appendChunk(slotId, makeChunk(slotId, 1, [1, 1, 0, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
      await appendChunk(slotId, makeChunk(slotId, 2, [2, 1, 1, 0, 1, null, [0], 0, 0, 0, 0, 10, 0, -1, -1, -1, -1, 0, -1, 0, '', 0, 0, 0, [0, 0, 0, 0, 0, -1, 0, -1], -1, null, null]));
      const { meta, chunks } = await readRun(slotId);
      expect(meta?.capped).toBe(true);
      expect(chunks.map((chunk) => chunk.turn)).toEqual([1]);
      expect(getTraceStatus()).toBe('CAPPED');
    } finally {
      (AI_TRACE as { MAX_ROWS: number }).MAX_ROWS = originalMaxRows;
    }
  });

  it('persists devOptionsStore and tolerates corrupt localStorage entries', async () => {
    const first = await import('../devOptionsStore');
    expect(first.useDevOptionsStore.getState().recordAiTrace).toBe(false);
    first.useDevOptionsStore.getState().setShowAiScores(true);
    first.useDevOptionsStore.getState().setShowRecruitingScores(true);
    first.useDevOptionsStore.getState().setRecordAiTrace(true);

    vi.resetModules();
    const second = await import('../devOptionsStore');
    expect(second.useDevOptionsStore.getState().showAiScores).toBe(true);
    expect(second.useDevOptionsStore.getState().showRecruitingScores).toBe(true);
    expect(second.useDevOptionsStore.getState().recordAiTrace).toBe(true);

    localStorage.setItem('volcanae_dev_options', '{bad json');
    vi.resetModules();
    const third = await import('../devOptionsStore');
    expect(third.useDevOptionsStore.getState().recordAiTrace).toBe(false);
    expect(third.useDevOptionsStore.getState().showAiScores).toBe(false);
  });

  it('keeps GameState identical with tracing on and off', () => {
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 6);
    const state = makeState({ units: [enemy, player] });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const withoutTrace = runEnemyTurn(state).finalState;
    randomSpy.mockReturnValue(0.25);
    const withTrace = runEnemyTurn(state, { trace: true, slotId: 'slot_neutral' }).finalState;
    expect(withTrace).toEqual(withoutTrace);
    randomSpy.mockRestore();
  });

  it('summarizes threatened enemy buildings with def 0 when nearby units do not respond', () => {
    const enemyBuilding = makeBuilding(BuildingType.WATCHTOWER, Faction.ENEMY, 6, 10, {
      combatStats: { attack: 5, defense: 5, attackRange: 2, maxHp: 50 },
      hp: 50,
      maxHp: 50,
    } as Partial<Building>);
    const idleEnemy = makeUnit(UnitType.CAVE_MONSTER, Faction.ENEMY, 6, 8);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 6, 11);
    const result = runEnemyTurn(makeState({
      units: [idleEnemy, player],
      activeCaveEncounters: [{ mountainTileId: '6,6', monsterId: idleEnemy.id }],
      buildings: [enemyBuilding, makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 2, 20)],
      tileOverrides: {
        ['6,6']: { terrainType: TileType.MOUNTAIN, hasCaveMonster: true },
        ['5,7']: { terrainType: TileType.CANYON },
        ['6,7']: { terrainType: TileType.CANYON },
        ['7,7']: { terrainType: TileType.CANYON },
        ['5,8']: { terrainType: TileType.CANYON },
        ['7,8']: { terrainType: TileType.CANYON },
        ['5,9']: { terrainType: TileType.CANYON },
        ['6,9']: { terrainType: TileType.CANYON },
        ['7,9']: { terrainType: TileType.CANYON },
      },
    }), { trace: true, slotId: 'slot_threat' });
    expect(result.trace!.summary.threats).toHaveLength(1);
    expect(result.trace!.summary.threats[0]).toMatchObject({ b: enemyBuilding.id, def: 0 });
  });
});
