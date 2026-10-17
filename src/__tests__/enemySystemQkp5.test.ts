import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_ROW_COLUMNS, getActionCode, getOutcomeBitMask } from '../aiTrace';
import { computeUnitAiScores, runEnemyTurn } from '../enemySystem';
import { CRYSTAL_CAVE_CONFIG, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { edgeCircleDistance } from '../rangeUtils';
import { createInitialSpecialists } from '../specialistSystem';
import { BuildingType, DestroyBehavior, Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
import * as unitActions from '../unitActions';

let nextId = 0;

function makeUnit(type: UnitType, position: Position, faction = Faction.PLAYER): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `qkp5-unit-${++nextId}`,
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: definition.maxHp,
      currentHp: definition.maxHp,
      attack: definition.attack,
      defense: definition.defense,
      moveRange: definition.moveRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange,
      movementActions: definition.movementActions,
      attackRange: definition.attackRange,
    },
    tags: [...definition.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeCave(position: Position): Building {
  return {
    id: `qkp5-cave-${++nextId}`,
    type: BuildingType.CRYSTAL_CAVE,
    faction: Faction.PLAYER,
    position: { ...position },
    hp: CRYSTAL_CAVE_CONFIG.MAX_HP,
    maxHp: CRYSTAL_CAVE_CONFIG.MAX_HP,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
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
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}

function makeState(units: Unit[], buildings: Building[] = []): GameState {
  const grid: Tile[][] = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
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
    })),
  );
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) grid[building.position.y][building.position.x].buildingId = building.id;
  return {
    turn: 7,
    phase: GamePhase.PLAYER_TURN,
    grid,
    units: Object.fromEntries(units.map(unit => [unit.id, unit])),
    buildings: Object.fromEntries(buildings.map(building => [building.id, building])),
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 0,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    zoneLockoutUntilTurn: {},
    techNodes: {},
    techFlags: [],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    portals: {},
    gameStats: {
      unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
      unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
      techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
    },
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL',
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
  } as unknown as GameState;
}

afterEach(() => vi.restoreAllMocks());

describe('enemy AI Taunt execution', () => {
  it('excludes an in-range captor and actually attacks Taunt instead', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const captor = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const taunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 });
    captor.hasCapturedThisTurn = true;
    taunt.tags.push(UnitTag.TAUNT);
    const state = makeState([attacker, captor, taunt]);

    expect(computeUnitAiScores(state, attacker.id).some(action => action.type === 'INTERCEPT_CAPTOR')).toBe(false);
    const { events, finalState } = runEnemyTurn(state);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'ENEMY_ATTACK', attackerId: attacker.id, defenderId: taunt.id,
    }));
    expect(events.some(event => event.type === 'ENEMY_ATTACK' && event.defenderId === captor.id)).toBe(false);
    expect(finalState.units[captor.id].stats.currentHp).toBe(captor.stats.currentHp);
  });

  it('retains outside-range captors as movement targets despite nearby Taunt', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const captor = makeUnit(UnitType.GUARD, { x: 7, y: 5 });
    const taunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 });
    captor.hasCapturedThisTurn = true;
    taunt.tags.push(UnitTag.TAUNT);
    const state = makeState([attacker, captor, taunt]);
    const scores = computeUnitAiScores(state, attacker.id);

    expect(scores.find(action => action.type === 'INTERCEPT_CAPTOR')?.targetUnitId).toBe(captor.id);
    const { events, trace } = runEnemyTurn(state, { trace: true, slotId: 'qkp5' });
    expect(events.some(event => event.type === 'ENEMY_MOVE' && event.unitId === attacker.id)).toBe(true);
    expect(trace!.rows[0][AI_ROW_COLUMNS.indexOf('act')]).toBe(getActionCode('INTERCEPT_CAPTOR'));
  });

  it.each([
    { trace: false, intercept: false },
    { trace: true, intercept: false },
    { trace: false, intercept: true },
    { trace: true, intercept: true },
  ])('revalidates stale selections and emits nearest allowed metadata ($trace, $intercept)', ({ trace, intercept }) => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const farther = makeUnit(UnitType.GUARD, { x: 7, y: 6 });
    const nearer = makeUnit(UnitType.GUARD, { x: 5, y: 6 });
    attacker.stats.attackRange = 2;
    ordinary.hasCapturedThisTurn = intercept;
    farther.tags.push(UnitTag.TAUNT);
    nearer.tags.push(UnitTag.TAUNT);
    nearer.stats.currentHp = 1;
    const state = makeState([attacker, ordinary, farther, nearer]);
    vi.spyOn(unitActions, 'getTauntRestrictedAttackTargets').mockReturnValueOnce([ordinary]);

    const result = runEnemyTurn(state, { trace, slotId: 'qkp5' });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'ENEMY_ATTACK',
      attackerId: attacker.id,
      defenderId: nearer.id,
      defenderPosition: nearer.position,
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'UNIT_DEATH', unitId: nearer.id, position: nearer.position, faction: Faction.PLAYER,
    }));
    expect(result.finalState.units[ordinary.id].stats.currentHp).toBe(ordinary.stats.currentHp);
    if (result.trace) {
      const row = result.trace.rows[0];
      const targetIndex = row[AI_ROW_COLUMNS.indexOf('tgtIdx')];
      expect(result.trace.units.find(unit => unit[0] === targetIndex)?.[1]).toBe(nearer.id);
      expect(row[AI_ROW_COLUMNS.indexOf('tgtX')]).toBe(nearer.position.x);
      expect(row[AI_ROW_COLUMNS.indexOf('tgtY')]).toBe(nearer.position.y);
      expect(row[AI_ROW_COLUMNS.indexOf('dmg')]).toBe(nearer.stats.currentHp);
      expect(Number(row[AI_ROW_COLUMNS.indexOf('flags')]) & getOutcomeBitMask(['KILL'])).not.toBe(0);
    }
  });

  it('does not emit an attack when a selected in-range target is no longer legal', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const underground = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    underground.tunnelState = 'UNDERGROUND';
    const { events, finalState } = runEnemyTurn(makeState([attacker, underground]));

    expect(events.some(event => event.type === 'ENEMY_ATTACK')).toBe(false);
    expect(finalState.units[underground.id].stats.currentHp).toBe(underground.stats.currentHp);
    expect(finalState.units[attacker.id].hasAttackedThisTurn).toBe(false);
  });
});

describe('cave monster movement attack Taunt targeting', () => {
  it.each([false, true])('attacks Taunt after chasing an ordinary player and traces the attacked unit (kill=%s)', kill => {
    const monster = makeUnit(UnitType.CAVE_MONSTER, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 7, y: 5 });
    const taunt = makeUnit(UnitType.GUARD, { x: 7, y: 6 });
    taunt.tags.push(UnitTag.TAUNT);
    if (kill) taunt.stats.currentHp = 1;
    const state = makeState([monster, ordinary, taunt]);
    state.activeCaveEncounters = [{ mountainTileId: '5,5', monsterId: monster.id }];
    for (let y = 4; y <= 6; y++) {
      for (let x = 4; x <= 6; x++) {
        if ((x === 5 && y === 5) || (x === 6 && y === 5)) continue;
        state.grid[y][x].terrainType = TileType.CANYON;
      }
    }

    const { events, finalState, trace } = runEnemyTurn(state, { trace: true, slotId: 'qkp5' });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'ENEMY_MOVE', unitId: monster.id, to: { x: 6, y: 5 },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'ENEMY_ATTACK', attackerId: monster.id, defenderId: taunt.id, defenderPosition: taunt.position,
    }));
    expect(finalState.units[ordinary.id].stats.currentHp).toBe(ordinary.stats.currentHp);
    const row = trace!.rows.find(row => row[3] === getActionCode('CM_MOVE_AND_ATTACK'))!;
    expect(row).toBeDefined();
    expect(trace!.units.find(unit => unit[0] === row[13])?.[1]).toBe(taunt.id);
    expect([row[14], row[15]]).toEqual([taunt.position.x, taunt.position.y]);
    expect(row[16]).toBe(edgeCircleDistance(monster.position.x, monster.position.y, taunt.position.x, taunt.position.y));
    expect(row[21]).toBe(taunt.stats.currentHp - (finalState.units[taunt.id]?.stats.currentHp ?? 0));
    expect(row[23] & getOutcomeBitMask(['KILL'])).toBe(kill ? getOutcomeBitMask(['KILL']) : 0);
    if (kill) expect(trace!.units.find(unit => unit[1] === taunt.id)?.[8]).toBe('KILLED');
  });
});

describe('enemy AI lost roost provenance', () => {
  it.each(['attack', 'capture', 'return-home'] as const)('snapshots removed building type on %s', mode => {
    const cave = makeCave({ x: 5, y: 5 });
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 5, y: 15 });
    drake.roostBuildingId = cave.id;
    const attacker = makeUnit(
      mode === 'return-home' ? UnitType.CAVE_MONSTER : UnitType.LAVA_GRUNT,
      mode === 'attack' ? { x: 4, y: 5 } : cave.position,
      Faction.ENEMY,
    );
    if (mode === 'attack') {
      cave.hp = 1;
      cave.combatStats = { attack: 0, defense: 0, attackRange: 1 };
    }
    const state = makeState([attacker, drake], [cave]);
    if (mode === 'return-home') {
      state.activeCaveEncounters = [{ mountainTileId: '5,5', monsterId: attacker.id }];
      state.grid[5][5].terrainType = TileType.MOUNTAIN;
    }

    const { events, finalState } = runEnemyTurn(state);
    expect(finalState.buildings[cave.id]).toBeUndefined();
    expect(finalState.units[drake.id]).toBeUndefined();
    const deathIndex = events.findIndex(event => event.type === 'UNIT_DEATH' && event.unitId === drake.id);
    expect(events[deathIndex]).toMatchObject({
      type: 'UNIT_DEATH',
      unitId: drake.id,
      position: drake.position,
      faction: Faction.PLAYER,
      lostRoostBuildingType: BuildingType.CRYSTAL_CAVE,
    });
    const causeIndex = events.findIndex(event =>
      mode === 'attack' ? event.type === 'UNIT_ATTACK_BUILDING'
        : mode === 'capture' ? event.type === 'BUILDING_CAPTURE'
          : event.type === 'CAVE_MONSTER_RETREAT');
    expect(causeIndex).toBeGreaterThanOrEqual(0);
    expect(mode === 'return-home' ? deathIndex < causeIndex : deathIndex > causeIndex).toBe(true);
  });
});
