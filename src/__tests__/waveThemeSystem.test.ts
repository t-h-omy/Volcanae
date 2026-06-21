import { afterEach, describe, expect, it } from 'vitest';
import { ENEMY_WAVE_THEME, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import {
  applyThemeToFoggedUnits,
  assignPercents,
  generateRandomTheme,
  pickUnitFromTheme,
  rollNextWaveTheme,
  setWaveThemeRandomSource,
  signature,
} from '../waveThemeSystem';

function sequenceRng(values: number[]): () => number {
  let idx = 0;
  return () => {
    if (values.length === 0) return 0.5;
    const value = values[idx % values.length];
    idx += 1;
    return value;
  };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeTile(x: number, y: number, isRevealed = true): Tile {
  return {
    position: { x, y },
    isRevealed,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
  };
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y, true)),
  );
}

function makeEnemyUnit(id: string, type: UnitType, x: number, y: number): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id,
    type,
    faction: Faction.ENEMY,
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
  };
}

function makeSanctum(id: string, y: number, faction: Faction = Faction.ENEMY): Building {
  return {
    id,
    type: BuildingType.INFERNALSANCTUM,
    faction,
    position: { x: 4, y },
    hp: 100,
    maxHp: 100,
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
  };
}

function makeState(ember: number): GameState {
  return {
    ember,
    units: {},
    buildings: {},
    grid: makeGrid(),
    turn: 1,
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    portals: {},
  } as unknown as GameState;
}

describe('waveThemeSystem', () => {
  afterEach(() => {
    setWaveThemeRandomSource();
  });

  it('keeps theme shape in bounds and excludes EMBERLING/CAVE_MONSTER', () => {
    setWaveThemeRandomSource(sequenceRng([0.93, 0.11, 0.42, 0.8, 0.19, 0.77, 0.33]));
    const state = makeState(7);
    const theme = generateRandomTheme(state);

    expect(theme.entries.length).toBeGreaterThanOrEqual(ENEMY_WAVE_THEME.MIN_UNIT_TYPES);
    expect(theme.entries.length).toBeLessThanOrEqual(ENEMY_WAVE_THEME.MAX_UNIT_TYPES);
    expect(theme.entries.reduce((sum, entry) => sum + entry.percent, 0)).toBe(100);

    for (const entry of theme.entries) {
      const cap = UNIT_DEFINITIONS[entry.type].maxThemePercent ?? 100;
      expect(entry.percent).toBeGreaterThanOrEqual(ENEMY_WAVE_THEME.MIN_UNIT_PERCENT);
      expect(entry.percent).toBeLessThanOrEqual(cap);
      expect(entry.type).not.toBe(UnitType.EMBERLING);
      expect(entry.type).not.toBe(UnitType.CAVE_MONSTER);
    }
  });

  it('never selects units above ember unlock threshold', () => {
    setWaveThemeRandomSource(lcg(12345));
    const state = makeState(0);
    for (let i = 0; i < 20; i++) {
      const theme = generateRandomTheme(state);
      for (const entry of theme.entries) {
        const unlock = UNIT_DEFINITIONS[entry.type].enemyUnlockEmber;
        expect(unlock).toBeDefined();
        expect(unlock!).toBeLessThanOrEqual(state.ember);
      }
    }
  });

  it('respects RIFT_LORD maxThemePercent and maxAlivePerZone cap', () => {
    setWaveThemeRandomSource(sequenceRng([0.25, 0.9, 0.4, 0.8, 0.2]));
    const state = makeState(9);
    const entries = assignPercents([UnitType.RIFT_LORD, UnitType.LAVA_GRUNT], state);
    const riftEntry = entries.find((entry) => entry.type === UnitType.RIFT_LORD);
    expect(riftEntry).toBeDefined();
    expect(riftEntry!.percent).toBeLessThanOrEqual(UNIT_DEFINITIONS[UnitType.RIFT_LORD].maxThemePercent!);

    const existingRift = makeEnemyUnit('rift_1', UnitType.RIFT_LORD, 4, 5);
    state.units[existingRift.id] = existingRift;
    state.activeWaveTheme = { entries: [{ type: UnitType.RIFT_LORD, percent: 100 }], isReadPlayer: false };
    const pick = pickUnitFromTheme(state, { type: BuildingType.LAVALAIR, position: { x: 4, y: 5 } });
    expect(pick).not.toBe(UnitType.RIFT_LORD);
  });

  it('avoids identical consecutive signatures except when forced and keeps read-player count in range', () => {
    setWaveThemeRandomSource(lcg(987654321));
    const state = makeState(10);
    const sanctums = [makeSanctum('s1', 5), makeSanctum('s2', 12), makeSanctum('s3', 19), makeSanctum('s4', 26)];
    for (const sanctum of sanctums) state.buildings[sanctum.id] = sanctum;

    for (let roll = 0; roll < sanctums.length; roll++) {
      const previousSignature = state.lastThemeSignature;
      const readBefore = state.readPlayerThemeCount;
      const remainingSanctums = Object.values(state.buildings).filter(
        (b) => b.faction === Faction.ENEMY && b.type === BuildingType.INFERNALSANCTUM,
      ).length;
      const forcedRead = readBefore < ENEMY_WAVE_THEME.READ_PLAYER_MAX_PER_GAME
        && (ENEMY_WAVE_THEME.READ_PLAYER_MIN_PER_GAME - readBefore) >= remainingSanctums;

      const next = rollNextWaveTheme(state);
      const nextSignature = signature(next);
      if (previousSignature !== null && previousSignature === nextSignature) {
        expect(forcedRead).toBe(true);
      }

      const toCapture = Object.values(state.buildings).find(
        (b) => b.faction === Faction.ENEMY && b.type === BuildingType.INFERNALSANCTUM,
      );
      if (toCapture) toCapture.faction = Faction.PLAYER;
    }

    expect(state.readPlayerThemeCount).toBeGreaterThanOrEqual(ENEMY_WAVE_THEME.READ_PLAYER_MIN_PER_GAME);
    expect(state.readPlayerThemeCount).toBeLessThanOrEqual(ENEMY_WAVE_THEME.READ_PLAYER_MAX_PER_GAME);
  });

  it('launders only fogged enemy units and never launders into excluded unit types', () => {
    setWaveThemeRandomSource(lcg(42));
    const state = makeState(10);
    const foggedEnemy = makeEnemyUnit('fogged_enemy', UnitType.LAVA_GRUNT, 1, 5);
    const revealedEnemy = makeEnemyUnit('revealed_enemy', UnitType.LAVA_ARCHER, 2, 5);
    const secondFoggedEnemy = makeEnemyUnit('fogged_enemy_2', UnitType.LAVA_SIEGE, 3, 5);
    state.units[foggedEnemy.id] = foggedEnemy;
    state.units[revealedEnemy.id] = revealedEnemy;
    state.units[secondFoggedEnemy.id] = secondFoggedEnemy;

    state.grid[5][1].isRevealed = false;
    state.grid[5][1].unitId = foggedEnemy.id;
    state.grid[5][2].isRevealed = true;
    state.grid[5][2].unitId = revealedEnemy.id;
    state.grid[5][3].isRevealed = false;
    state.grid[5][3].unitId = secondFoggedEnemy.id;

    const theme = generateRandomTheme(state);
    applyThemeToFoggedUnits(state, theme);

    expect(state.units[revealedEnemy.id]).toBeDefined();
    expect(state.grid[5][2].unitId).toBe(revealedEnemy.id);

    const foggedTileUnitIds = [state.grid[5][1].unitId, state.grid[5][3].unitId];
    for (const unitId of foggedTileUnitIds) {
      expect(unitId).toBeTruthy();
      const unitType = state.units[unitId!].type;
      expect(unitType).not.toBe(UnitType.EMBERLING);
      expect(unitType).not.toBe(UnitType.CAVE_MONSTER);
    }
  });
});
