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
  unlockedEntries,
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

  it('adds filler to single-type random themes using the 1-type filler range', () => {
    const range = ENEMY_WAVE_THEME.FILLER_PERCENT_RANGE_BY_THEME_SIZE[1];
    const rngSequences = [
      [0, 0.12, 0.74, 0.41, 0.27],
      [0, 0.83, 0.19, 0.66, 0.08],
    ];

    for (const sequence of rngSequences) {
      setWaveThemeRandomSource(sequenceRng(sequence));
      const state = makeState(10);
      const theme = generateRandomTheme(state);

      expect(theme.entries.length).toBe(2);
      const fillerEntries = theme.entries.filter(
        (entry) => entry.percent >= range.min && entry.percent <= range.max,
      );
      expect(fillerEntries).toHaveLength(1);
      expect(theme.entries.some((entry) => entry.percent > range.max)).toBe(true);
    }
  });

  it('keeps 2-type and 3-type random themes unchanged (no filler by default)', () => {
    const state = makeState(10);

    setWaveThemeRandomSource(sequenceRng([0.5, 0.12, 0.74, 0.41, 0.27]));
    const twoTypeTheme = generateRandomTheme(state);
    expect(twoTypeTheme.entries.length).toBe(2);

    setWaveThemeRandomSource(sequenceRng([0.95, 0.12, 0.74, 0.41, 0.27]));
    const threeTypeTheme = generateRandomTheme(state);
    expect(threeTypeTheme.entries.length).toBe(3);
  });

  it('never selects units above ember unlock threshold + lookahead', () => {
    setWaveThemeRandomSource(lcg(12345));
    const state = makeState(3);
    for (let i = 0; i < 20; i++) {
      const theme = generateRandomTheme(state);
      for (const entry of theme.entries) {
        const unlock = UNIT_DEFINITIONS[entry.type].enemyUnlockEmber;
        expect(unlock).toBeDefined();
        expect(unlock!).toBeLessThanOrEqual(state.ember + ENEMY_WAVE_THEME.UNLOCK_LOOKAHEAD);
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

  it('theme entries never exceed ember + UNLOCK_LOOKAHEAD, and at least one entry is currently unlocked', () => {
    setWaveThemeRandomSource(lcg(999));
    // Use ember=5 so there are both unlocked (<=5) and lookahead (=6) types available
    const state = makeState(5);
    let sawLookaheadEntry = false;
    for (let i = 0; i < 40; i++) {
      const theme = generateRandomTheme(state);
      // Every entry must be within the lookahead window
      for (const entry of theme.entries) {
        const unlock = UNIT_DEFINITIONS[entry.type].enemyUnlockEmber!;
        expect(unlock).toBeLessThanOrEqual(state.ember + ENEMY_WAVE_THEME.UNLOCK_LOOKAHEAD);
      }
      // At least one entry must be currently unlocked
      expect(
        theme.entries.some((e) => (UNIT_DEFINITIONS[e.type].enemyUnlockEmber ?? 0) <= state.ember),
      ).toBe(true);
      // Track whether any lookahead (locked) entry appeared
      if (theme.entries.some((e) => (UNIT_DEFINITIONS[e.type].enemyUnlockEmber ?? 0) > state.ember)) {
        sawLookaheadEntry = true;
      }
    }
    // With enough iterations at ember=5, a lookahead entry (unlock=6) should appear in at least one theme
    expect(sawLookaheadEntry).toBe(true);
  });

  it('locked entries are never picked by spawn or laundering, but become pickable when ember rises', () => {
    const lockedType = UnitType.REAPER; // enemyUnlockEmber: 6
    const unlockedType = UnitType.LAVA_GRUNT; // enemyUnlockEmber: 0
    const state = makeState(5); // lockedType is locked at ember=5

    // Theme with one locked and one unlocked entry
    state.activeWaveTheme = {
      entries: [
        { type: unlockedType, percent: 50 },
        { type: lockedType, percent: 50 },
      ],
      isReadPlayer: false,
    };

    // At ember=5, unlockedEntries should only return the unlocked type
    const atEmber5 = unlockedEntries(state.activeWaveTheme, state);
    expect(atEmber5.map((e) => e.type)).not.toContain(lockedType);
    expect(atEmber5.map((e) => e.type)).toContain(unlockedType);

    // Spawn must never return the locked type at ember=5
    setWaveThemeRandomSource(lcg(77));
    for (let i = 0; i < 30; i++) {
      const pick = pickUnitFromTheme(state, { type: BuildingType.LAVALAIR, position: { x: 4, y: 5 } });
      expect(pick).not.toBe(lockedType);
    }

    // Laundering at ember=5 must not produce the locked type
    const foggedUnit = makeEnemyUnit('fog1', UnitType.LAVA_ARCHER, 2, 5);
    state.units[foggedUnit.id] = foggedUnit;
    state.grid[5][2].isRevealed = false;
    state.grid[5][2].unitId = foggedUnit.id;

    setWaveThemeRandomSource(lcg(88));
    applyThemeToFoggedUnits(state, state.activeWaveTheme);
    const launderedId = state.grid[5][2].unitId;
    expect(launderedId).toBeTruthy();
    expect(state.units[launderedId!].type).not.toBe(lockedType);

    // Raise ember to meet lockedType's requirement — it must now appear in unlockedEntries
    state.ember = 6;
    const atEmber6 = unlockedEntries(state.activeWaveTheme, state);
    expect(atEmber6.map((e) => e.type)).toContain(lockedType);

    // Spawn CAN now return the locked type (weighted pick over both entries)
    setWaveThemeRandomSource(sequenceRng([0.99])); // high roll → picks second (lockedType) entry
    const pickAfterUnlock = pickUnitFromTheme(state, { type: BuildingType.LAVALAIR, position: { x: 4, y: 5 } });
    expect(pickAfterUnlock).toBe(lockedType);
  });
});
