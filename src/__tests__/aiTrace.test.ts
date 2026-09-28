import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  ACTION_TABLE,
  AI_ROW_COLUMNS,
  type AiRow,
  type AiTraceChunk,
  type AiTraceMeta,
  type AiTurnSummary,
  type AiUnitRow,
  STOP_CODE_INDEX,
  ACTION_CODE_INDEX,
} from '../aiTrace';
import { appendChunk, deleteTurnsAfter, getTraceSeed, getTraceStatus, readRun } from '../aiTraceStore';
import { deleteSlot } from '../saveSystem';
import { ENEMY_ACTION_TYPES, runEnemyTurn } from '../enemySystem';
import {
  AI_TRACE,
  BUILDING_DEFINITIONS,
  MAP,
  UNIT_DEFINITIONS,
} from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { generateInitialGameState } from '../mapGenerator';
import {
  BuildingType,
  DestroyBehavior,
  Difficulty,
  Faction,
  GamePhase,
  TileStatus,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Portal, Tile, Unit } from '../types';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.restoreAllMocks();
});

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

function makeFullGrid(tileOverrides: Record<string, Partial<Tile>> = {}): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y, tileOverrides[`${x},${y}`] ?? {})),
  );
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

function makeUnit(type: UnitType, faction: Faction, x: number, y: number, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId(`u_${type}`),
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
    id: nextId(`b_${type}`),
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

function makeState(args: {
  units?: Unit[];
  buildings?: Building[];
  tileOverrides?: Record<string, Partial<Tile>>;
  portals?: Record<string, Portal>;
  activeCaveEncounters?: GameState['activeCaveEncounters'];
  turn?: number;
  lavaFrontRow?: number;
  zoneLockoutUntilTurn?: GameState['zoneLockoutUntilTurn'];
} = {}): GameState {
  const base = generateInitialGameState();
  const units = Object.fromEntries((args.units ?? []).map((unit) => [unit.id, unit]));
  const buildings = Object.fromEntries((args.buildings ?? []).map((building) => [building.id, building]));
  const grid = makeFullGrid(args.tileOverrides);
  for (const unit of Object.values(units)) grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of Object.values(buildings)) grid[building.position.y][building.position.x].buildingId = building.id;
  return {
    ...base,
    turn: args.turn ?? 3,
    phase: GamePhase.PLAYER_TURN,
    units,
    buildings,
    grid,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 10, wood: 10 },
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techFlags: [],
    arcaneCrystals: 0,
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: Difficulty.STANDARD,
    zoneLockoutUntilTurn: args.zoneLockoutUntilTurn ?? {},
    spawnFreezeUntilTurn: 0,
    spawnAccumulator: 0,
    lastSpawnBudget: null,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: args.activeCaveEncounters ?? [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: args.portals ?? {},
    lavaFrontRow: args.lavaFrontRow ?? MAP.GRID_HEIGHT,
  } as GameState;
}

function makeSummary(turn: number): AiTurnSummary {
  return {
    turn,
    enemyUnits: 0,
    playerUnits: 0,
    pHp: 0,
    pAtk: 0,
    pB: 0,
    eHp: 0,
    eAtk: 0,
    eB: 0,
    ember: 0,
    lavaFrontRow: MAP.GRID_HEIGHT,
    front: [0, 0],
    spawns: 0,
    lastSpawnBudget: null,
    actions: [],
    stops: [],
    blocked: 0,
    static: 0,
    slot2: 0,
    kills: 0,
    losses: 0,
    activeLockoutZones: [],
    threats: [],
  };
}

function makeRow(slot: number, uIdx = 0, stop = -1): AiRow {
  return [
    1, slot, uIdx, ACTION_CODE_INDEX.HOLD_POSITION,
    1, null, [ACTION_CODE_INDEX.HOLD_POSITION],
    0, 0, 0, 0, 100,
    0, -1, -1, -1, -1,
    0, stop, 0, '',
    0, 0, 0, [0, 0, -1, -1, 0, -1, 0, -1],
    -1,
    null,
    null,
  ];
}

function makeChunk(slotId: string, turn: number, rows: AiRow[], units: AiUnitRow[] = [], meta?: Partial<AiTraceMeta>): AiTraceChunk {
  return {
    key: `${slotId}:${String(turn).padStart(6, '0')}`,
    slotId,
    turn,
    rows,
    units,
    buildings: [],
    summary: {
      ...makeSummary(turn),
      enemyUnits: meta?.rowCount ?? 0,
    },
  };
}

async function runTracedTurn(state: GameState, slotId = 'slot_a') {
  const result = runEnemyTurn(state, { trace: true, slotId, unitIndexSeed: getTraceSeed(slotId) });
  if (result.trace) await appendChunk(slotId, result.trace, result.finalState);
  return result;
}

function getZone(row: number): number {
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

function findLockoutBoundary(): number {
  for (let row = 0; row < MAP.GRID_HEIGHT - 1; row++) {
    if (getZone(row + 1) < getZone(row)) return row;
  }
  return 0;
}

describe('ai trace', () => {
  it('keeps ACTION_TABLE aligned with EnemyActionType order', () => {
    expect(ACTION_TABLE.slice(0, 26)).toEqual([...ENEMY_ACTION_TYPES]);
  });

  it('returns null when tracing is off and records slot 1 then 2 when tracing is on', async () => {
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 6);
    const state = makeState({ units: [enemy, player] });

    const off = runEnemyTurn(state);
    expect(off.trace).toBeNull();
    expect((await readRun('slot_a')).chunks).toHaveLength(0);

    const on = await runTracedTurn(makeState({ units: [structuredClone(enemy), structuredClone(player)] }));
    expect(on.trace).not.toBeNull();
    expect(on.trace?.rows).toHaveLength(2);
    expect(on.trace?.rows.map((row) => row[1])).toEqual([1, 2]);
    for (const row of on.trace?.rows ?? []) {
      expect(row).toHaveLength(AI_ROW_COLUMNS.length);
      expect(row[24]).toHaveLength(8);
    }
  });

  it('records movement stop reasons, terrain strings, and cave monster CM rows', () => {
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, 12);

    const noPathEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const noPathState = makeState({
      units: [noPathEnemy],
      buildings: [stronghold],
      tileOverrides: {
        '3,3': { terrainType: TileType.WATER },
        '4,3': { terrainType: TileType.WATER },
        '5,3': { terrainType: TileType.WATER },
        '3,4': { terrainType: TileType.WATER },
        '5,4': { terrainType: TileType.WATER },
        '3,5': { terrainType: TileType.WATER },
        '4,5': { terrainType: TileType.WATER },
        '5,5': { terrainType: TileType.WATER },
      },
    });
    const noPath = runEnemyTurn(noPathState, { trace: true, slotId: 'np', unitIndexSeed: getTraceSeed('np') });
    expect(noPath.trace?.rows[0][18]).toBe(STOP_CODE_INDEX.NO_PATH);

    const blockedEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4, {
      stats: { ...makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 0, 0).stats, moveRange: 3 },
    });
    const blockingAlly = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 6);
    const neutralTarget = makeBuilding(BuildingType.MINE, null, 4, 6);
    const blocked = runEnemyTurn(makeState({ units: [blockedEnemy, blockingAlly], buildings: [neutralTarget] }), {
      trace: true,
      slotId: 'blocked',
      unitIndexSeed: getTraceSeed('blocked'),
    });
    expect(blocked.trace?.rows.some((row) => row[18] === STOP_CODE_INDEX.BLOCKED_UNIT)).toBe(true);

    const rangeEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4, {
      stats: { ...makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 0, 0).stats, triggerRange: 99 },
    });
    const rangePlayer = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 10);
    const ranged = runEnemyTurn(makeState({ units: [rangeEnemy, rangePlayer] }), {
      trace: true,
      slotId: 'range',
      unitIndexSeed: getTraceSeed('range'),
    });
    expect(ranged.trace?.rows[0][18]).toBe(STOP_CODE_INDEX.RANGE);

    const boundaryRow = findLockoutBoundary();
    const lockoutEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, boundaryRow);
    const lockout = runEnemyTurn(makeState({
      units: [lockoutEnemy],
      buildings: [makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, boundaryRow + 4)],
      zoneLockoutUntilTurn: { [getZone(boundaryRow + 1)]: 99 },
      turn: 10,
    }), {
      trace: true,
      slotId: 'lockout',
      unitIndexSeed: getTraceSeed('lockout'),
    });
    expect(lockout.trace?.rows[0][18]).toBe(STOP_CODE_INDEX.ZONE_LOCKOUT);

    const slideEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const slide = runEnemyTurn(makeState({
      units: [slideEnemy],
      buildings: [makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 4, 10)],
      tileOverrides: {
        '4,5': { status: TileStatus.FROZEN },
      },
    }), {
      trace: true,
      slotId: 'slide',
      unitIndexSeed: getTraceSeed('slide'),
    });
    expect(slide.trace?.rows[0][20].length).toBeGreaterThan(0);

    const bridge = makeBuilding(BuildingType.BRIDGE, null, 5, 5, { bridgeOrientation: 'EW' });
    const bridgeEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 5, {
      stats: { ...makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 0, 0).stats, moveRange: 2 },
    });
    const bridgeResult = runEnemyTurn(makeState({
      units: [bridgeEnemy],
      buildings: [bridge, makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 6, 5)],
      tileOverrides: {
        '5,4': { terrainType: TileType.WATER },
        '5,5': { terrainType: TileType.CANYON },
        '5,6': { terrainType: TileType.WATER },
      },
    }), {
      trace: true,
      slotId: 'bridge',
      unitIndexSeed: getTraceSeed('bridge'),
    });
    expect(bridgeResult.trace?.rows[0][20].length).toBeGreaterThan(0);

    const monster = makeUnit(UnitType.CAVE_MONSTER, Faction.ENEMY, 4, 4);
    const hero = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 5);
    const cm = runEnemyTurn(makeState({
      units: [monster, hero],
      activeCaveEncounters: [{ mountainTileId: '4,4', monsterId: monster.id }],
    }), {
      trace: true,
      slotId: 'cm',
      unitIndexSeed: getTraceSeed('cm'),
    });
    expect(cm.trace?.rows.some((row) => ACTION_TABLE[row[3]].startsWith('CM_'))).toBe(true);
    expect(cm.trace?.rows.find((row) => ACTION_TABLE[row[3]].startsWith('CM_'))?.[4]).toBeNull();
  });

  it('persists chunks in order, keeps unit indices stable across a restart, truncates later turns, and deletes slot traces', async () => {
    const u0: AiUnitRow = [0, 'u0', UnitType.LAVA_GRUNT, 1, null, 1, 1, -1, '', 1];
    await appendChunk('slot_p', makeChunk('slot_p', 1, [makeRow(1, 0)], [u0]));
    await appendChunk('slot_p', makeChunk('slot_p', 2, [makeRow(1, 0)]));
    await appendChunk('slot_p', makeChunk('slot_p', 3, [makeRow(1, 0)]));
    const read = await readRun('slot_p');
    expect(read.chunks.map((chunk) => chunk.turn)).toEqual([1, 2, 3]);

    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 4);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 6);
    const first = await runTracedTurn(makeState({ units: [enemy, player] }), 'slot_restart');
    const firstUnitIdx = first.trace?.rows[0][2];

    vi.resetModules();
    const traceStore2 = await import('../aiTraceStore');
    const enemySystem2 = await import('../enemySystem');
    await traceStore2.readMeta('slot_restart');
    const second = enemySystem2.runEnemyTurn(
      makeState({ units: [structuredClone(enemy), structuredClone(player)], turn: 4 }),
      { trace: true, slotId: 'slot_restart', unitIndexSeed: traceStore2.getTraceSeed('slot_restart') },
    );
    expect(second.trace?.rows[0][2]).toBe(firstUnitIdx);

    await deleteTurnsAfter('slot_p', 1);
    const truncated = await readRun('slot_p');
    expect(truncated.chunks.map((chunk) => chunk.turn)).toEqual([1]);

    await deleteSlot('slot_p');
    const afterDelete = await readRun('slot_p');
    expect(afterDelete.meta).toBeNull();
    expect(afterDelete.chunks).toHaveLength(0);
  });

  it('sets STOPPED_QUOTA on write failure and CAPPED at MAX_ROWS without dropping stored rows', async () => {
    const originalMaxRows = AI_TRACE.MAX_ROWS;
    (AI_TRACE as { MAX_ROWS: number }).MAX_ROWS = 2;
    const failingIndexedDb = {
      open() {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    } as unknown as IDBFactory;
    globalThis.indexedDB = failingIndexedDb;
    await expect(appendChunk('slot_fail', makeChunk('slot_fail', 1, [makeRow(1)]))).resolves.toBeUndefined();
    expect(getTraceStatus()).toBe('STOPPED_QUOTA');

    globalThis.indexedDB = new IDBFactory();
    await appendChunk('slot_cap', makeChunk('slot_cap', 1, [makeRow(1), makeRow(2)]));
    await appendChunk('slot_cap', makeChunk('slot_cap', 2, [makeRow(1)]));
    const capped = await readRun('slot_cap');
    expect(capped.chunks).toHaveLength(1);
    expect(capped.meta?.rowCount).toBe(2);
    expect(capped.meta?.capped).toBe(true);
    expect(getTraceStatus()).toBe('CAPPED');
    (AI_TRACE as { MAX_ROWS: number }).MAX_ROWS = originalMaxRows;
  });

  it('persists dev options and survives corrupt localStorage', async () => {
    vi.resetModules();
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

    localStorage.setItem('volcanae_dev_options', '{');
    vi.resetModules();
    const third = await import('../devOptionsStore');
    expect(third.useDevOptionsStore.getState().showAiScores).toBe(false);
    expect(third.useDevOptionsStore.getState().showRecruitingScores).toBe(false);
    expect(third.useDevOptionsStore.getState().recordAiTrace).toBe(false);
  });

  it('keeps GameState identical with tracing on and off and reports undefended threatened buildings', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const threatenedBuilding = makeBuilding(BuildingType.WATCHTOWER, Faction.ENEMY, 4, 4);
    const idleEnemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 6, 4, { pinnedUntilTurn: 3 });
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 5);
    const state = makeState({
      units: [idleEnemy, player],
      buildings: [threatenedBuilding],
    });
    const offState = structuredClone(state);
    const onState = structuredClone(state);
    const off = runEnemyTurn(offState);
    const on = runEnemyTurn(onState, {
      trace: true,
      slotId: 'neutrality',
      unitIndexSeed: getTraceSeed('neutrality'),
    });
    expect(on.finalState).toEqual(off.finalState);
    const threat = on.trace?.summary.threats.find((entry) => entry.b >= 0);
    expect(threat).toBeDefined();
    expect(threat?.def).toBe(0);
  });
});
