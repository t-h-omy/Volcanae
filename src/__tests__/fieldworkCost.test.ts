/**
 * VG-14 — Fieldwork Outpost costs wood.
 *
 * Covers:
 *  - fieldworkUnit with insufficient wood: unit survives, no building placed, resources unchanged
 *  - fieldworkUnit with sufficient wood: unit is consumed, building is placed, wood is deducted
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { MAP, BUILDING_DEFINITIONS, UNIT_DEFINITIONS, SPECIALIST_DEFINITIONS } from '../gameConfig';
import { useGameStore } from '../gameStore';

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
    status: null,
    hasCaveMonster: false,
    ...overrides,
  } as unknown as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SPEARMAN];
  return {
    id: nextId('u'),
    type: UnitType.SPEARMAN,
    faction: Faction.PLAYER,
    position: { x: 5, y: 5 },
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
    tags: [UnitTag.FIELDWORK],
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
    recruitedOnTurn: 0,
    ...overrides,
  } as Unit;
}

function makeState(opts: {
  units?: Unit[];
  wood?: number;
  iron?: number;
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  const grid = makeGrid();
  for (const u of Object.values(units)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  return {
    units,
    buildings,
    grid,
    techFlags: [],
    portals: {},
    turn: 1,
    globalSpecialistStorage: [],
    specialistSlotCap: 3,
    resources: { iron: opts.iron ?? 0, wood: opts.wood ?? 0 },
    arcaneCrystals: 0,
    specialists: Object.fromEntries(
      Object.entries(SPECIALIST_DEFINITIONS).map(([id, def]) => [id, { id, ...def, assignedBuildingId: null }])
    ),
    fortifiedGarrisonActive: false,
    gameStats: {
      buildingsConstructed: 0,
      unitsKilled: 0,
      turnsPlayed: 0,
      enemiesDefeated: 0,
      resourcesGathered: 0,
    },
  } as unknown as GameState;
}

const OUTPOST_WOOD_COST = BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood;

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  idSeq = 0;
});

afterEach(() => {
  // No external side effects to clean up.
});

describe('fieldworkUnit — wood cost', () => {
  it('refuses fieldwork when wood is insufficient (unit survives, no building placed)', () => {
    const unit = makeUnit();
    const state = makeState({ units: [unit], wood: OUTPOST_WOOD_COST - 1 });
    useGameStore.setState(state);

    useGameStore.getState().fieldworkUnit(unit.id);

    const after = useGameStore.getState();
    // Unit must still exist
    expect(after.units[unit.id]).toBeDefined();
    // No new building
    expect(Object.keys(after.buildings)).toHaveLength(0);
    // Resources unchanged
    expect(after.resources.wood).toBe(OUTPOST_WOOD_COST - 1);
  });

  it('allows fieldwork and deducts wood when resources are sufficient', () => {
    const unit = makeUnit();
    const state = makeState({ units: [unit], wood: OUTPOST_WOOD_COST + 2 });
    useGameStore.setState(state);

    useGameStore.getState().fieldworkUnit(unit.id);

    const after = useGameStore.getState();
    // Unit is consumed
    expect(after.units[unit.id]).toBeUndefined();
    // An Outpost building was placed
    const buildings = Object.values(after.buildings);
    expect(buildings).toHaveLength(1);
    expect(buildings[0].type).toBe(BuildingType.OUTPOST);
    expect(buildings[0].position).toEqual(unit.position);
    // Wood deducted
    expect(after.resources.wood).toBe(2);
  });

  it('allows fieldwork with exactly the required wood (boundary case)', () => {
    const unit = makeUnit();
    const state = makeState({ units: [unit], wood: OUTPOST_WOOD_COST });
    useGameStore.setState(state);

    useGameStore.getState().fieldworkUnit(unit.id);

    const after = useGameStore.getState();
    expect(after.units[unit.id]).toBeUndefined();
    expect(Object.keys(after.buildings)).toHaveLength(1);
    expect(after.resources.wood).toBe(0);
  });
});
