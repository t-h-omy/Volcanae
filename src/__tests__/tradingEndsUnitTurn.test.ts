/**
 * VG-08 — Trading ends the unit's turn.
 *
 * After a unit sets hasTradedThisTurn (via buyMarketOffer or directly),
 * every action gate must return false so the unit cannot move, attack, or
 * perform any other action until the next turn.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { MAP, MARKET, UNIT_DEFINITIONS, SPECIALIST_DEFINITIONS } from '../gameConfig';
import { setMarketRandomSource } from '../marketSystem';
import {
  canUnitMove,
  canUnitAttack,
  canUnitCapture,
  canUnitConstruct,
  canUnitHeal,
  canUnitFieldwork,
  canUnitBuildBridge,
  getMovableTiles,
} from '../unitActions';
import { useGameStore } from '../gameStore';
import { useMarketPanelStore } from '../marketPanelStore';

// ============================================================================
// Helpers (mirrors marketSystem.test.ts helpers)
// ============================================================================

let idSeq = 0;
function nextId(prefix = 'x'): string {
  return `${prefix}${++idSeq}`;
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
  } as unknown as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y))
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

function makeMarketBuilding(pos = { x: 5, y: 5 }): Building {
  return {
    id: nextId('m'),
    type: BuildingType.MARKET,
    faction: null,
    position: { ...pos },
    hp: MARKET.MAX_HP,
    maxHp: MARKET.MAX_HP,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
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
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    marketResourceSlots: [],
    marketSpecialistSlots: [],
    marketRefillCountdown: MARKET.AUTO_REFILL_INTERVAL,
  };
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
} = {}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) units[u.id] = u;
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildings[b.id] = b;
  const grid = makeGrid();
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
    techFlags: [],
    portals: {},
    turn: 1,
    globalSpecialistStorage: [],
    specialistSlotCap: 3,
    resources: { iron: 100, wood: 100 },
    arcaneCrystals: 0,
    specialists: Object.fromEntries(
      Object.entries(SPECIALIST_DEFINITIONS).map(([id, def]) => [id, { id, ...def, assignedBuildingId: null }])
    ),
  } as unknown as GameState;
}

beforeEach(() => {
  idSeq = 0;
  setMarketRandomSource(() => 0.5);
});

afterEach(() => {
  setMarketRandomSource(undefined);
});

// ============================================================================
// canUnitMove — hasTradedThisTurn blocks movement
// ============================================================================

describe('canUnitMove — hasTradedThisTurn', () => {
  it('returns true for a fresh unit (baseline)', () => {
    const unit = makeUnit({ hasTradedThisTurn: false });
    const state = makeState({ units: [unit] });
    expect(canUnitMove(unit, state)).toBe(true);
  });

  it('returns false after trading', () => {
    const unit = makeUnit({ hasTradedThisTurn: true });
    const state = makeState({ units: [unit] });
    expect(canUnitMove(unit, state)).toBe(false);
  });

  it('returns false for HIT_AND_RUN unit after trading', () => {
    const unit = makeUnit({ hasTradedThisTurn: true, tags: [UnitTag.HIT_AND_RUN] });
    const state = makeState({ units: [unit] });
    expect(canUnitMove(unit, state)).toBe(false);
  });
});

// ============================================================================
// canUnitAttack — hasTradedThisTurn blocks attacking
// ============================================================================

describe('canUnitAttack — hasTradedThisTurn', () => {
  it('returns true for a fresh unit (baseline)', () => {
    const unit = makeUnit({ hasTradedThisTurn: false });
    const state = makeState({ units: [unit] });
    expect(canUnitAttack(unit, state)).toBe(true);
  });

  it('returns false after trading', () => {
    const unit = makeUnit({ hasTradedThisTurn: true });
    const state = makeState({ units: [unit] });
    expect(canUnitAttack(unit, state)).toBe(false);
  });
});

// ============================================================================
// getMovableTiles — empty after trading
// ============================================================================

describe('getMovableTiles — hasTradedThisTurn', () => {
  it('returns empty set after trading', () => {
    const unit = makeUnit({ hasTradedThisTurn: true });
    const state = makeState({ units: [unit] });
    expect(getMovableTiles(unit, state).size).toBe(0);
  });

  it('returns non-empty set before trading (baseline)', () => {
    const unit = makeUnit({ hasTradedThisTurn: false });
    const state = makeState({ units: [unit] });
    expect(getMovableTiles(unit, state).size).toBeGreaterThan(0);
  });
});

// ============================================================================
// Sibling gates — all blocked after trading
// ============================================================================

describe('canUnitCapture — hasTradedThisTurn', () => {
  it('returns false after trading even with BUILDANDCAPTURE tag', () => {
    const unit = makeUnit({ hasTradedThisTurn: true, tags: [UnitTag.BUILDANDCAPTURE] });
    expect(canUnitCapture(unit)).toBe(false);
  });
});

describe('canUnitConstruct — hasTradedThisTurn', () => {
  it('returns false after trading even with BUILDANDCAPTURE tag', () => {
    const unit = makeUnit({ hasTradedThisTurn: true, tags: [UnitTag.BUILDANDCAPTURE] });
    expect(canUnitConstruct(unit)).toBe(false);
  });
});

describe('canUnitHeal — hasTradedThisTurn', () => {
  it('returns false after trading even with PATCHUP tag', () => {
    const unit = makeUnit({ hasTradedThisTurn: true, tags: [UnitTag.PATCHUP] });
    expect(canUnitHeal(unit)).toBe(false);
  });
});

describe('canUnitFieldwork — hasTradedThisTurn', () => {
  it('returns false after trading even with FIELDWORK tag', () => {
    const unit = makeUnit({ hasTradedThisTurn: true, tags: [UnitTag.FIELDWORK] });
    expect(canUnitFieldwork(unit)).toBe(false);
  });
});

describe('canUnitBuildBridge — hasTradedThisTurn', () => {
  it('returns false after trading even with BRIDGE_BUILDER tag and bridge unlocked', () => {
    const unit = makeUnit({ hasTradedThisTurn: true, tags: [UnitTag.BRIDGE_BUILDER] });
    const state = makeState({ units: [unit] });
    (state as unknown as Record<string, unknown>).unlockedBuildings = [BuildingType.BRIDGE];
    expect(canUnitBuildBridge(unit, state)).toBe(false);
  });
});

// ============================================================================
// buyMarketOffer — sets hasTradedThisTurn, gates block subsequent actions
// ============================================================================

describe('buyMarketOffer — sets hasTradedThisTurn', () => {
  it('sets hasTradedThisTurn=true on a resource purchase, blocking canUnitMove and canUnitAttack', () => {
    const unit = makeUnit({ hasTradedThisTurn: false, position: { x: 5, y: 5 } });
    const market = makeMarketBuilding({ x: 5, y: 5 });

    // Seed a known resource offer (give 2 wood, gain 3 iron)
    const offer = { give: { currency: 'WOOD' as const, amount: 2 }, gain: { currency: 'IRON' as const, amount: 3 } };
    market.marketResourceSlots = [offer];

    const grid = makeGrid();
    grid[unit.position.y][unit.position.x].unitId = unit.id;
    grid[market.position.y][market.position.x].buildingId = market.id;

    useGameStore.setState({
      units: { [unit.id]: unit },
      buildings: { [market.id]: market },
      grid,
      resources: { iron: 10, wood: 10 },
      arcaneCrystals: 0,
      globalSpecialistStorage: [],
      specialistSlotCap: 3,
    });
    useMarketPanelStore.getState().openPanel(market.id, unit.id);

    useGameStore.getState().buyMarketOffer(market.id, 0);

    const updatedUnit = useGameStore.getState().units[unit.id];
    expect(updatedUnit.hasTradedThisTurn).toBe(true);
    expect(canUnitMove(updatedUnit, useGameStore.getState())).toBe(false);
    expect(canUnitAttack(updatedUnit, useGameStore.getState())).toBe(false);
    expect(getMovableTiles(updatedUnit, useGameStore.getState()).size).toBe(0);
  });
});
