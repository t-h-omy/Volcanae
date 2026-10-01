/**
 * Portal occupancy regression tests.
 *
 * Covers the invariant that no portal movement or teleport may ever overwrite
 * or clear grid occupancy owned by a different unit, so two enemy units can
 * never end up stacked on a portal entrance or exit tile.
 */

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createInitialSpecialists } from '../specialistSystem';
import { computeUnitAiScores } from '../enemySystem';
import {
  processPendingPortalTeleports,
  tryTeleportThroughPortal,
} from '../portalSystem';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { expectUnitGridOccupancyConsistent } from './helpers/occupancy';
import {
  DestroyBehavior,
  BuildingType,
  Faction,
  GamePhase,
  TileType,
  UnitType,
  type Building,
  type GameState,
  type Tile,
  type Unit,
} from '../types';
import type { GameEvent } from '../gameEvents';

const ENTRANCE = { x: 5, y: 10 };
const EXIT = { x: 5, y: 14 };

let nextId = 0;
function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
}

function makeTile(x: number, y: number): Tile {
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
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(type: UnitType, faction: Faction, x: number, y: number): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: makeId(`unit_${type}`),
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
  } as Unit;
}

function makeStronghold(x: number, y: number): Building {
  return {
    id: makeId('building'),
    type: BuildingType.STRONGHOLD,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 1,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(units: Unit[], buildings: Building[] = []): GameState {
  const grid = makeGrid();
  const unitMap: Record<string, Unit> = {};
  for (const unit of units) {
    unitMap[unit.id] = unit;
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }
  const buildingMap: Record<string, Building> = {};
  for (const building of buildings) {
    buildingMap[building.id] = building;
    grid[building.position.y][building.position.x].buildingId = building.id;
  }
  return {
    turn: 12,
    phase: GamePhase.ENEMY_TURN,
    grid,
    units: unitMap,
    buildings: buildingMap,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    lavaFrontRow: MAP.GRID_HEIGHT,
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
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
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
    portals: {},
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    activeWaveTheme: null,
  } as unknown as GameState;
}

function withPortal(state: GameState, casterId: string, pendingTeleportUnitId: string | null = null): GameState {
  return produce(state, (draft) => {
    draft.portals['portal_test'] = {
      id: 'portal_test',
      casterId,
      entrancePos: { ...ENTRANCE },
      exitPos: { ...EXIT },
      createdTurn: 12,
      lastUsableTurn: 14,
      pendingTeleportUnitId,
    };
  });
}

describe('portal occupancy invariants', () => {
  it('leaves a unit waiting on the entrance when the exit is occupied', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const waiter = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const blocker = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, EXIT.x, EXIT.y);
    const base = withPortal(makeState([caster, waiter, blocker]), caster.id);

    const events: GameEvent[] = [];
    const next = produce(base, (draft) => {
      const teleported = tryTeleportThroughPortal(draft, waiter.id, 'portal_test', events);
      expect(teleported).toBe(false);
    });

    expect(next.portals['portal_test'].pendingTeleportUnitId).toBe(waiter.id);
    expect(next.units[waiter.id].position).toEqual(ENTRANCE);
    expect(next.grid[ENTRANCE.y][ENTRANCE.x].unitId).toBe(waiter.id);
    expect(next.grid[EXIT.y][EXIT.x].unitId).toBe(blocker.id);
    expect(events).toHaveLength(0);
    expectUnitGridOccupancyConsistent(next);
  });

  it('does not let a second unit replace the pending waiter or overwrite the entrance', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const waiter = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const blocker = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, EXIT.x, EXIT.y);
    const second = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, ENTRANCE.x + 1, ENTRANCE.y);
    const base = withPortal(makeState([caster, waiter, blocker, second]), caster.id, waiter.id);

    const next = produce(base, (draft) => {
      // Simulate a buggy caller trying to teleport the second unit through the
      // entrance it does not own.
      draft.units[second.id].position = { ...ENTRANCE };
      const teleported = tryTeleportThroughPortal(draft, second.id, 'portal_test', []);
      expect(teleported).toBe(false);
      draft.units[second.id].position = { x: ENTRANCE.x + 1, y: ENTRANCE.y };
    });

    expect(next.portals['portal_test'].pendingTeleportUnitId).toBe(waiter.id);
    expect(next.grid[ENTRANCE.y][ENTRANCE.x].unitId).toBe(waiter.id);
    expectUnitGridOccupancyConsistent(next);

    // The AI must not even offer MOVE_TO_PORTAL for the second unit.
    const scores = computeUnitAiScores(next, second.id);
    expect(scores.some((action) => action.type === 'MOVE_TO_PORTAL')).toBe(false);
  });

  it('teleports exactly the pending unit when the exit clears and leaves the entrance empty', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const waiter = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const blocker = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, EXIT.x, EXIT.y);
    const base = withPortal(makeState([caster, waiter, blocker]), caster.id, waiter.id);

    const events: GameEvent[] = [];
    const next = produce(base, (draft) => {
      // The blocker walks off the exit tile.
      draft.grid[EXIT.y][EXIT.x].unitId = null;
      draft.units[blocker.id].position = { x: EXIT.x + 1, y: EXIT.y };
      draft.grid[EXIT.y][EXIT.x + 1].unitId = blocker.id;
      processPendingPortalTeleports(draft, events);
    });

    expect(next.portals['portal_test'].pendingTeleportUnitId).toBeNull();
    expect(next.units[waiter.id].position).toEqual(EXIT);
    expect(next.grid[EXIT.y][EXIT.x].unitId).toBe(waiter.id);
    expect(next.grid[ENTRANCE.y][ENTRANCE.x].unitId).toBeNull();
    expect(events.filter((event) => event.type === 'PORTAL_USED')).toHaveLength(1);
    expectUnitGridOccupancyConsistent(next);
  });

  it('allows two sequential portal users in the same turn once the exit clears', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const first = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const second = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, ENTRANCE.x + 1, ENTRANCE.y);
    const base = withPortal(makeState([caster, first, second]), caster.id);

    const events: GameEvent[] = [];
    const afterFirst = produce(base, (draft) => {
      expect(tryTeleportThroughPortal(draft, first.id, 'portal_test', events)).toBe(true);
      // First user steps off the exit tile, freeing it again.
      draft.grid[EXIT.y][EXIT.x].unitId = null;
      draft.units[first.id].position = { x: EXIT.x, y: EXIT.y + 1 };
      draft.grid[EXIT.y + 1][EXIT.x].unitId = first.id;
    });
    expect(afterFirst.grid[ENTRANCE.y][ENTRANCE.x].unitId).toBeNull();
    expectUnitGridOccupancyConsistent(afterFirst);

    // With the entrance free and no pending waiter, the second unit may still use it.
    const scores = computeUnitAiScores(afterFirst, second.id);
    expect(scores.some((action) => action.type === 'MOVE_TO_PORTAL')).toBe(true);

    const afterSecond = produce(afterFirst, (draft) => {
      draft.grid[ENTRANCE.y][ENTRANCE.x + 1].unitId = null;
      draft.units[second.id].position = { ...ENTRANCE };
      draft.grid[ENTRANCE.y][ENTRANCE.x].unitId = second.id;
      expect(tryTeleportThroughPortal(draft, second.id, 'portal_test', events)).toBe(true);
    });

    expect(afterSecond.units[second.id].position).toEqual(EXIT);
    expect(afterSecond.grid[ENTRANCE.y][ENTRANCE.x].unitId).toBeNull();
    expectUnitGridOccupancyConsistent(afterSecond);
  });

  it('clears stale pending state when the waiting unit is removed', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const waiter = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const blocker = makeUnit(UnitType.LAVA_ARCHER, Faction.ENEMY, EXIT.x, EXIT.y);
    const base = withPortal(makeState([caster, waiter, blocker]), caster.id, waiter.id);

    const next = produce(base, (draft) => {
      delete draft.units[waiter.id];
      draft.grid[ENTRANCE.y][ENTRANCE.x].unitId = null;
      processPendingPortalTeleports(draft, []);
    });

    expect(next.portals['portal_test'].pendingTeleportUnitId).toBeNull();
    expectUnitGridOccupancyConsistent(next);
  });

  it('clears stale pending state when the entrance tile no longer points at the waiter', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const waiter = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const base = withPortal(makeState([caster, waiter]), caster.id, waiter.id);

    const next = produce(base, (draft) => {
      // Corrupt bookkeeping: the entrance tile is owned by nobody.
      draft.grid[ENTRANCE.y][ENTRANCE.x].unitId = null;
      processPendingPortalTeleports(draft, []);
    });

    expect(next.portals['portal_test'].pendingTeleportUnitId).toBeNull();
    expect(next.units[waiter.id].position).toEqual(ENTRANCE);
  });

  it('does not offer MOVE_TO_PORTAL when the entrance is occupied by another unit', () => {
    nextId = 0;
    const caster = makeUnit(UnitType.RIFT_LORD, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y - 1);
    const squatter = makeUnit(UnitType.EMBERLING, Faction.ENEMY, ENTRANCE.x, ENTRANCE.y);
    const mover = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, ENTRANCE.x + 2, ENTRANCE.y);
    const stronghold = makeStronghold(ENTRANCE.x, EXIT.y + 4);
    const occupied = withPortal(makeState([caster, squatter, mover], [stronghold]), caster.id);

    expect(computeUnitAiScores(occupied, mover.id).some((a) => a.type === 'MOVE_TO_PORTAL')).toBe(false);

    const free = produce(occupied, (draft) => {
      delete draft.units[squatter.id];
      draft.grid[ENTRANCE.y][ENTRANCE.x].unitId = null;
    });
    expect(computeUnitAiScores(free, mover.id).some((a) => a.type === 'MOVE_TO_PORTAL')).toBe(true);
  });
});
