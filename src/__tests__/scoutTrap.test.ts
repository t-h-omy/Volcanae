/**
 * Tests for SP-02 Trapsmith — Scout "Set Trap" feature (spec_08, SCOUT_SET_TRAP).
 *
 * Covers:
 *  - canUnitSetTrap: gating rules (unit type, faction, specialist effect, action flags)
 *  - isTrapTileClear: tile eligibility rules (updated for ranged placement)
 *  - getTrapPlacementTargets: valid placement targets within range
 *  - checkScoutTrapTrigger: damage, stun, ALERT immunity, FLYING skip, trap deletion,
 *    unit kill on lethal damage, non-player guard, no-trap-on-tile guard
 *  - Ranged placement: adjacent empty tile succeeds, own tile succeeds, rejections
 *  - Pending mode cleared on unit deselection and end turn
 */

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { canUnitSetTrap, isTrapTileClear, getTrapPlacementTargets } from '../unitActions';
import { checkScoutTrapTrigger } from '../movementSystem';
import { createInitialSpecialists } from '../specialistSystem';

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
    terrainType: TileType.PLAINS,
    status: undefined as unknown as Tile['status'],
    hasCaveMonster: false,
    ...overrides,
  } as unknown as Tile;
}

function makeGrid(
  w = MAP.GRID_WIDTH,
  h = MAP.GRID_HEIGHT,
  tileOverrides: Record<string, Partial<Tile>> = {},
): Tile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const key = `${x},${y}`;
      return makeTile(x, y, tileOverrides[key] ?? {});
    }),
  );
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SCOUT];
  return {
    id: nextId('u'),
    type: UnitType.SCOUT,
    faction: Faction.PLAYER,
    position: { x: 5, y: 5 },
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
    tags: [],
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

function makeScoutTrap(x: number, y: number): Building {
  return {
    id: nextId('trap'),
    type: BuildingType.SCOUT_TRAP,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: 1,
    maxHp: 1,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 1,
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
    trapStunTurns: ABILITIES.SCOUT_TRAP_STUN_TURNS,
    trapDamage: ABILITIES.SCOUT_TRAP_DAMAGE,
  } as Building;
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  resources?: { iron: number; wood: number };
  tileOverrides?: Record<string, Partial<Tile>>;
  globalSpecialistStorage?: string[];
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildings[b.id] = b;
  const grid = makeGrid(MAP.GRID_WIDTH, MAP.GRID_HEIGHT, opts.tileOverrides ?? {});
  for (const u of Object.values(units)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of Object.values(buildings)) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }
  return {
    units,
    buildings,
    grid,
    turn: 1,
    resources: opts.resources ?? { iron: 10, wood: 10 },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: opts.globalSpecialistStorage ?? [],
    gameStats: {
      unitsLost: 0,
      buildingsDestroyed: 0,
      unitsKilled: 0,
      buildingsCaptured: 0,
      buildingsConverted: 0,
    },
  } as unknown as GameState;
}

// ============================================================================
// canUnitSetTrap
// ============================================================================

describe('canUnitSetTrap', () => {
  it('returns true for a fresh PLAYER Scout when SCOUT_SET_TRAP specialist is active', () => {
    const scout = makeUnit();
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(scout, state)).toBe(true);
  });

  it('returns false when no specialist with SCOUT_SET_TRAP effect is active', () => {
    const scout = makeUnit();
    const state = makeState({ units: [scout], globalSpecialistStorage: [] });
    expect(canUnitSetTrap(scout, state)).toBe(false);
  });

  it('returns false for a non-SCOUT unit type', () => {
    const warrior = makeUnit({ type: UnitType.SPEARMAN });
    const state = makeState({ units: [warrior], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(warrior, state)).toBe(false);
  });

  it('returns false for ENEMY faction', () => {
    const enemy = makeUnit({ faction: Faction.ENEMY });
    const state = makeState({ units: [enemy], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(enemy, state)).toBe(false);
  });

  it('returns false when hasMovedThisTurn', () => {
    const scout = makeUnit({ hasMovedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(scout, state)).toBe(false);
  });

  it('returns false when hasAttackedThisTurn', () => {
    const scout = makeUnit({ hasAttackedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(scout, state)).toBe(false);
  });

  it('returns false when hasConstructedThisTurn', () => {
    const scout = makeUnit({ hasConstructedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(scout, state)).toBe(false);
  });

  it('returns false when hasCapturedThisTurn', () => {
    const scout = makeUnit({ hasCapturedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(scout, state)).toBe(false);
  });

  it('returns false when hasDestroyedThisTurn', () => {
    const scout = makeUnit({ hasDestroyedThisTurn: true });
    const state = makeState({ units: [scout], globalSpecialistStorage: ['spec_08'] });
    expect(canUnitSetTrap(scout, state)).toBe(false);
  });
});

// ============================================================================
// isTrapTileClear
// ============================================================================

describe('isTrapTileClear', () => {
  it('returns true on an empty plains tile at own position', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({ units: [scout] });
    expect(isTrapTileClear(state, 5, 5, scout.id)).toBe(true);
  });

  it('returns true on adjacent empty plains tile (Scout itself does not block own tile)', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({ units: [scout] });
    // Own tile has the scout on it — Scout itself should not block
    expect(isTrapTileClear(state, 5, 5, scout.id)).toBe(true);
    // Adjacent tile (no unit)
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(true);
  });

  it('returns false when tile has another unit', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const other = makeUnit({ position: { x: 6, y: 5 } });
    const state = makeState({ units: [scout, other] });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false when tile has a building', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const trap = makeScoutTrap(6, 5);
    const state = makeState({ units: [scout], buildings: [trap] });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on a ruin tile', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { isRuin: true } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on a stronghold ruin tile', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { isStrongholdRuin: true } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on CANYON terrain', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { terrainType: TileType.CANYON } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on WATER terrain', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { terrainType: TileType.WATER } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on FOREST terrain', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { terrainType: TileType.FOREST } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on MOUNTAIN terrain', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { terrainType: TileType.MOUNTAIN } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });

  it('returns false on lava tile', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({
      units: [scout],
      tileOverrides: { '6,5': { isLava: true } },
    });
    expect(isTrapTileClear(state, 6, 5, scout.id)).toBe(false);
  });
});

// ============================================================================
// getTrapPlacementTargets
// ============================================================================

describe('getTrapPlacementTargets', () => {
  it('includes own tile when clear', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({ units: [scout] });
    const targets = getTrapPlacementTargets(scout, state);
    expect(targets.some((t) => t.x === 5 && t.y === 5)).toBe(true);
  });

  it('includes adjacent empty grass tiles', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({ units: [scout] });
    const targets = getTrapPlacementTargets(scout, state);
    // At least the adjacent cardinal tiles should be valid on a plain grid
    expect(targets.some((t) => t.x === 6 && t.y === 5)).toBe(true);
    expect(targets.some((t) => t.x === 4 && t.y === 5)).toBe(true);
  });

  it('excludes a tile at range 2 when SCOUT_TRAP_PLACE_RANGE is 1', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const state = makeState({ units: [scout] });
    const targets = getTrapPlacementTargets(scout, state);
    expect(ABILITIES.SCOUT_TRAP_PLACE_RANGE).toBe(1);
    // Distance-2 tile should not appear
    expect(targets.some((t) => t.x === 7 && t.y === 5)).toBe(false);
    expect(targets.some((t) => t.x === 5 && t.y === 7)).toBe(false);
  });
});

// ============================================================================
// checkScoutTrapTrigger
// ============================================================================

describe('checkScoutTrapTrigger', () => {
  function makeEnemyUnit(overrides: Partial<Unit> = {}): Unit {
    const def = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT];
    return {
      id: nextId('e'),
      type: UnitType.LAVA_GRUNT,
      faction: Faction.ENEMY,
      position: { x: 5, y: 5 },
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
      tags: [],
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

  it('deals trapDamage to an enemy unit and stuns it, then deletes the trap', () => {
    const enemy = makeEnemyUnit();
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id);
    });

    const surviving = next.units[enemy.id];
    expect(surviving).toBeDefined();
    expect(surviving!.stats.currentHp).toBe(
      UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp - ABILITIES.SCOUT_TRAP_DAMAGE,
    );
    // Stunned for SCOUT_TRAP_STUN_TURNS turns (pinnedUntilTurn = turn + stunTurns - 1 = 1 + 1 - 1 = 1)
    expect(surviving!.pinnedUntilTurn).toBe(state.turn + ABILITIES.SCOUT_TRAP_STUN_TURNS - 1);
    // Trap building is gone
    expect(next.buildings[trap.id]).toBeUndefined();
    expect(next.grid[5][5].buildingId).toBeNull();
  });

  it('does not trigger for PLAYER faction units', () => {
    const scout = makeUnit({ position: { x: 5, y: 5 } });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [scout], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, scout.id);
    });

    // Trap should still be there (player units don't trigger it)
    expect(next.buildings[trap.id]).toBeDefined();
  });

  it('does not trigger for FLYING enemy units', () => {
    const flier = makeEnemyUnit({ tags: [UnitTag.FLYING] });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [flier], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, flier.id);
    });

    // Trap untouched, unit undamaged
    expect(next.buildings[trap.id]).toBeDefined();
    expect(next.units[flier.id]!.stats.currentHp).toBe(next.units[flier.id]!.stats.maxHp);
  });

  it('kills the enemy unit if trap damage reduces HP to 0 and removes trap', () => {
    const base = makeEnemyUnit();
    const enemy = makeEnemyUnit({ stats: { ...base.stats, currentHp: 1 } });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id);
    });

    expect(next.units[enemy.id]).toBeUndefined();
    expect(next.grid[5][5].unitId).toBeNull();
    expect(next.buildings[trap.id]).toBeUndefined();
    expect(next.gameStats.unitsKilled).toBe(1);
  });

  it('ALERT-tagged unit takes damage but is not stunned', () => {
    const enemy = makeEnemyUnit({ tags: [UnitTag.ALERT] });
    const trap = makeScoutTrap(5, 5);
    const state = makeState({ units: [enemy], buildings: [trap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id);
    });

    const surviving = next.units[enemy.id];
    expect(surviving).toBeDefined();
    // Damage is still dealt
    expect(surviving!.stats.currentHp).toBe(
      UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp - ABILITIES.SCOUT_TRAP_DAMAGE,
    );
    // Not stunned — pinnedUntilTurn stays at 0
    expect(surviving!.pinnedUntilTurn).toBe(0);
    // Trap consumed
    expect(next.buildings[trap.id]).toBeUndefined();
  });

  it('does nothing if the tile has no trap building', () => {
    const enemy = makeEnemyUnit();
    const state = makeState({ units: [enemy] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id);
    });

    expect(next.units[enemy.id]!.stats.currentHp).toBe(
      UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp,
    );
  });

  it('does nothing if tile has a GRAVE_TRAP instead of SCOUT_TRAP', () => {
    const enemy = makeEnemyUnit();
    const graveTrap: Building = {
      ...makeScoutTrap(5, 5),
      id: nextId('grave'),
      type: BuildingType.GRAVE_TRAP,
    };
    const state = makeState({ units: [enemy], buildings: [graveTrap] });

    const next = produce(state, (draft) => {
      checkScoutTrapTrigger(draft, enemy.id);
    });

    // GRAVE_TRAP is not consumed by checkScoutTrapTrigger
    expect(next.buildings[graveTrap.id]).toBeDefined();
    expect(next.units[enemy.id]!.stats.currentHp).toBe(UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp);
  });
});

// ============================================================================
// Pending mode store tests (startTrapSetMode / placeTrapAt / clearSelection / endPlayerTurn)
// ============================================================================

import { beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';

describe('trap placement pending mode', () => {
  const SCOUT_X = 5;
  const SCOUT_Y = 5;

  function makeStoreState(scoutId: string) {
    const scout = makeUnit({ id: scoutId, position: { x: SCOUT_X, y: SCOUT_Y } });
    // Use makeState helper which produces a clean grid (all plains, no other units)
    const gs = makeState({
      units: [scout],
      globalSpecialistStorage: ['spec_08'],
      resources: { iron: 10, wood: 20 },
    });
    // Attach fields expected by the store that makeState doesn't set
    return {
      ...gs,
      pendingTrapSetterId: null,
      pendingBridgeBuilderId: null,
      pendingHealerId: null,
      pendingSpellCast: null,
      pendingTransposeFirstUnitId: null,
      pendingBrandmarkTransforms: [],
    };
  }

  beforeEach(() => {
    const scoutId = 'test-scout-pending';
    useGameStore.setState(makeStoreState(scoutId) as unknown as ReturnType<typeof useGameStore.getState>);
  });

  it('startTrapSetMode sets pendingTrapSetterId', () => {
    const scoutId = 'test-scout-pending';
    useGameStore.getState().startTrapSetMode(scoutId);
    expect(useGameStore.getState().pendingTrapSetterId).toBe(scoutId);
  });

  it('pendingTrapSetterId is cleared on selectUnit', () => {
    const scoutId = 'test-scout-pending';
    useGameStore.getState().startTrapSetMode(scoutId);
    expect(useGameStore.getState().pendingTrapSetterId).toBe(scoutId);
    useGameStore.getState().selectUnit(scoutId);
    expect(useGameStore.getState().pendingTrapSetterId).toBeNull();
  });

  it('pendingTrapSetterId is cleared on clearSelection', () => {
    const scoutId = 'test-scout-pending';
    useGameStore.getState().startTrapSetMode(scoutId);
    useGameStore.getState().clearSelection();
    expect(useGameStore.getState().pendingTrapSetterId).toBeNull();
  });

  it('placeTrapAt on adjacent valid tile places trap and consumes action', () => {
    const scoutId = 'test-scout-pending';
    useGameStore.getState().startTrapSetMode(scoutId);
    const woodBefore = useGameStore.getState().resources.wood;
    // Place on adjacent tile (SCOUT_X+1, SCOUT_Y) — known empty on clean grid
    useGameStore.getState().placeTrapAt(SCOUT_X + 1, SCOUT_Y);
    const s = useGameStore.getState();
    expect(s.pendingTrapSetterId).toBeNull();
    expect(s.resources.wood).toBe(woodBefore - ABILITIES.SCOUT_TRAP_WOOD_COST);
    expect(s.grid[SCOUT_Y][SCOUT_X + 1].buildingId).toBeTruthy();
    expect(s.units[scoutId]?.hasConstructedThisTurn).toBe(true);
  });

  it('placeTrapAt on own tile succeeds (Scout itself does not block)', () => {
    const scoutId = 'test-scout-pending';
    useGameStore.getState().startTrapSetMode(scoutId);
    useGameStore.getState().placeTrapAt(SCOUT_X, SCOUT_Y);
    const s = useGameStore.getState();
    expect(s.grid[SCOUT_Y][SCOUT_X].buildingId).toBeTruthy();
    expect(s.units[scoutId]?.hasConstructedThisTurn).toBe(true);
  });

  it('placeTrapAt on out-of-range tile (range 2 with constant 1) clears mode and does not place', () => {
    const scoutId = 'test-scout-pending';
    expect(ABILITIES.SCOUT_TRAP_PLACE_RANGE).toBe(1);
    useGameStore.getState().startTrapSetMode(scoutId);
    const woodBefore = useGameStore.getState().resources.wood;
    useGameStore.getState().placeTrapAt(SCOUT_X + 2, SCOUT_Y); // distance 2
    const s = useGameStore.getState();
    expect(s.pendingTrapSetterId).toBeNull();
    expect(s.resources.wood).toBe(woodBefore);
    expect(s.grid[SCOUT_Y][SCOUT_X + 2].buildingId).toBeNull();
  });
});
