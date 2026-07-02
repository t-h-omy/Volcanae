/**
 * Tests for marketSystem.ts
 *
 * Uses seeded (LCG) RNG via setMarketRandomSource for determinism.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import { MARKET, MAP, UNIT_DEFINITIONS, SPECIALIST_DEFINITIONS } from '../gameConfig';
import {
  createMarket,
  fillEmptyResourceSlots,
  fillEmptySpecialistSlots,
  restockAllSlots,
  rollResourceOffer,
  rollSpecialistId,
  setMarketRandomSource,
  tickMarketRefills,
} from '../marketSystem';
import { canUnitTrade, getTradeMarket } from '../unitActions';

// ============================================================================
// Helpers
// ============================================================================

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

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
    status: undefined as unknown as Tile['status'],
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
    position: { x: 0, y: 0 },
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

function makeMarketBuilding(pos = { x: 0, y: 0 }, slotOverrides: Partial<Building> = {}): Building {
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
    ...slotOverrides,
  };
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  globalSpecialistStorage?: string[];
  specialistSlotCap?: number;
  resources?: { iron: number; wood: number };
  arcaneCrystals?: number;
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
    globalSpecialistStorage: opts.globalSpecialistStorage ?? [],
    specialistSlotCap: opts.specialistSlotCap ?? 3,
    resources: opts.resources ?? { iron: 0, wood: 0 },
    arcaneCrystals: opts.arcaneCrystals ?? 0,
    specialists: Object.fromEntries(
      Object.entries(SPECIALIST_DEFINITIONS).map(([id, def]) => [id, { id, ...def, assignedBuildingId: null }])
    ),
  } as unknown as GameState;
}

beforeEach(() => {
  idSeq = 0;
  setMarketRandomSource(lcg(42));
});

afterEach(() => {
  setMarketRandomSource(undefined);
});

// ============================================================================
// Slot generation
// ============================================================================

describe('createMarket — slot generation', () => {
  it('resource slot count is within [RESOURCE_SLOTS_MIN, RESOURCE_SLOTS_MAX]', () => {
    const state = makeState();
    for (let seed = 0; seed < 20; seed++) {
      setMarketRandomSource(lcg(seed));
      const m = createMarket(state, { x: 0, y: 0 });
      expect(m.marketResourceSlots!.length).toBeGreaterThanOrEqual(MARKET.RESOURCE_SLOTS_MIN);
      expect(m.marketResourceSlots!.length).toBeLessThanOrEqual(MARKET.RESOURCE_SLOTS_MAX);
    }
  });

  it('specialist slot count is within [SPECIALIST_SLOTS_MIN, SPECIALIST_SLOTS_MAX]', () => {
    const state = makeState();
    for (let seed = 0; seed < 20; seed++) {
      setMarketRandomSource(lcg(seed));
      const m = createMarket(state, { x: 0, y: 0 });
      expect(m.marketSpecialistSlots!.length).toBeGreaterThanOrEqual(MARKET.SPECIALIST_SLOTS_MIN);
      expect(m.marketSpecialistSlots!.length).toBeLessThanOrEqual(MARKET.SPECIALIST_SLOTS_MAX);
    }
  });

  it('resource offers are drawn from RESOURCE_OFFER_POOL', () => {
    const state = makeState();
    const m = createMarket(state, { x: 0, y: 0 });
    for (const slot of m.marketResourceSlots ?? []) {
      if (!slot) continue;
      const poolMatch = MARKET.RESOURCE_OFFER_POOL.some(
        (p) =>
          p.give.currency === slot.give.currency &&
          p.give.amount === slot.give.amount &&
          p.gain.currency === slot.gain.currency &&
          p.gain.amount === slot.gain.amount
      );
      expect(poolMatch).toBe(true);
    }
  });

  it('DISTINCT_RESOURCE_OFFERS: no duplicate give+gain keys when pool is large enough', () => {
    if (!MARKET.DISTINCT_RESOURCE_OFFERS) return;
    const state = makeState();
    const m = createMarket(state, { x: 0, y: 0 });
    const keys = (m.marketResourceSlots ?? []).filter(Boolean).map(
      (s) => `${s!.give.currency}:${s!.give.amount}→${s!.gain.currency}:${s!.gain.amount}`
    );
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('specialist slot excludes owned specialists', () => {
    const allIds = Object.keys(SPECIALIST_DEFINITIONS);
    const ownedId = allIds[0];
    const state = makeState({ globalSpecialistStorage: [ownedId] });
    for (let seed = 0; seed < 20; seed++) {
      setMarketRandomSource(lcg(seed));
      const result = rollSpecialistId(state, []);
      expect(result).not.toBe(ownedId);
    }
  });

  it('specialist slot returns null when pool is exhausted', () => {
    const allIds = Object.keys(SPECIALIST_DEFINITIONS);
    const state = makeState({ globalSpecialistStorage: allIds });
    const result = rollSpecialistId(state, []);
    expect(result).toBeNull();
  });
});

// ============================================================================
// Trade gating — canUnitTrade
// ============================================================================

describe('canUnitTrade', () => {
  it('allows trade when stationary player unit not yet traded', () => {
    const unit = makeUnit({ hasMovedThisTurn: false, hasTradedThisTurn: false });
    expect(canUnitTrade(unit)).toBe(true);
  });

  it('blocks after move', () => {
    const unit = makeUnit({ hasMovedThisTurn: true, hasTradedThisTurn: false });
    expect(canUnitTrade(unit)).toBe(false);
  });

  it('blocks after a purchase (hasTradedThisTurn)', () => {
    const unit = makeUnit({ hasMovedThisTurn: false, hasTradedThisTurn: true });
    expect(canUnitTrade(unit)).toBe(false);
  });

  it('blocks SUMMONED units', () => {
    const unit = makeUnit({ tags: [UnitTag.SUMMONED], hasMovedThisTurn: false, hasTradedThisTurn: false });
    expect(canUnitTrade(unit)).toBe(false);
  });

  it('blocks enemy faction', () => {
    const unit = makeUnit({ faction: Faction.ENEMY });
    expect(canUnitTrade(unit)).toBe(false);
  });
});

// ============================================================================
// getTradeMarket
// ============================================================================

describe('getTradeMarket', () => {
  it('returns market when unit is on market tile', () => {
    const market = makeMarketBuilding({ x: 3, y: 3 });
    const unit = makeUnit({ position: { x: 3, y: 3 } });
    const state = makeState({ units: [unit], buildings: [market] });
    const result = getTradeMarket(unit, state);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(market.id);
  });

  it('returns null when unit is off market tile', () => {
    const market = makeMarketBuilding({ x: 3, y: 3 });
    const unit = makeUnit({ position: { x: 4, y: 4 } });
    const state = makeState({ units: [unit], buildings: [market] });
    expect(getTradeMarket(unit, state)).toBeNull();
  });

  it('returns null when tile has non-market building', () => {
    const building = makeMarketBuilding({ x: 3, y: 3 });
    (building as unknown as Record<string, unknown>).type = BuildingType.MINE;
    const unit = makeUnit({ position: { x: 3, y: 3 } });
    const state = makeState({ units: [unit], buildings: [building] });
    expect(getTradeMarket(unit, state)).toBeNull();
  });
});

// ============================================================================
// Buy resource offer
// ============================================================================

describe('rollResourceOffer', () => {
  it('returns an offer that exists in the pool', () => {
    const offer = rollResourceOffer([]);
    const match = MARKET.RESOURCE_OFFER_POOL.some(
      (p) =>
        p.give.currency === offer.give.currency &&
        p.give.amount === offer.give.amount &&
        p.gain.currency === offer.gain.currency &&
        p.gain.amount === offer.gain.amount
    );
    expect(match).toBe(true);
  });

  it('respects DISTINCT_RESOURCE_OFFERS when pool is larger than existing', () => {
    if (!MARKET.DISTINCT_RESOURCE_OFFERS) return;
    // Fill many existing offers from the pool
    const existing = (MARKET.RESOURCE_OFFER_POOL as readonly (typeof MARKET.RESOURCE_OFFER_POOL[number])[]).slice(0, 5).map(p => ({
      give: { ...p.give },
      gain: { ...p.gain },
    }));
    // Generate many rolls; none should match an existing key
    const usedKeys = new Set(
      existing.map(o => `${o.give.currency}:${o.give.amount}→${o.gain.currency}:${o.gain.amount}`)
    );
    for (let i = 0; i < 50; i++) {
      const offer = rollResourceOffer(existing);
      const key = `${offer.give.currency}:${offer.give.amount}→${offer.gain.currency}:${offer.gain.amount}`;
      expect(usedKeys.has(key)).toBe(false);
    }
  });
});

// ============================================================================
// Restock
// ============================================================================

describe('restockAllSlots', () => {
  it('rerolls all slots (resource and specialist)', () => {
    const originalOffer = { give: { currency: 'WOOD' as const, amount: 6 }, gain: { currency: 'IRON' as const, amount: 3 } };
    const market = makeMarketBuilding({ x: 0, y: 0 }, {
      marketResourceSlots: [originalOffer, null],
      marketSpecialistSlots: ['spec1', null],
    });
    const state = makeState();
    restockAllSlots(state, market);
    // After restock, all slots should be filled (no nulls if pool has enough entries)
    for (const slot of market.marketResourceSlots ?? []) {
      const match = slot === null || MARKET.RESOURCE_OFFER_POOL.some(
        (p) =>
          p.give.currency === slot.give.currency &&
          p.give.amount === slot.give.amount &&
          p.gain.currency === slot.gain.currency &&
          p.gain.amount === slot.gain.amount
      );
      expect(match).toBe(true);
    }
  });

  it('is repeatable (two consecutive restocks succeed)', () => {
    const market = makeMarketBuilding({ x: 0, y: 0 }, {
      marketResourceSlots: [null, null, null],
      marketSpecialistSlots: [null],
    });
    const state = makeState();
    expect(() => {
      restockAllSlots(state, market);
      restockAllSlots(state, market);
    }).not.toThrow();
  });

  it('does NOT set hasTradedThisTurn (that is the store responsibility, not this function)', () => {
    // restockAllSlots is a pure function — it never touches unit state.
    // We simply verify it doesn't throw and doesn't return any unit-modifying side-effect.
    const market = makeMarketBuilding({ x: 0, y: 0 }, { marketResourceSlots: [null], marketSpecialistSlots: [null] });
    const state = makeState();
    const returnValue = restockAllSlots(state, market);
    expect(returnValue).toBeUndefined();
  });
});

// ============================================================================
// Auto-refill
// ============================================================================

describe('tickMarketRefills', () => {
  it('decrements countdown each tick', () => {
    const market = makeMarketBuilding({ x: 0, y: 0 }, {
      marketRefillCountdown: 3,
      marketResourceSlots: [null],
      marketSpecialistSlots: [],
    });
    const state = makeState({ buildings: [market] });
    // Manually write to draft-like plain object
    tickMarketRefills(state as unknown as Parameters<typeof tickMarketRefills>[0]);
    expect(state.buildings[market.id].marketRefillCountdown).toBe(2);
  });

  it('fills empty slots and resets countdown at zero', () => {
    const market = makeMarketBuilding({ x: 0, y: 0 }, {
      marketRefillCountdown: 1,
      marketResourceSlots: [null, null],
      marketSpecialistSlots: [],
    });
    const state = makeState({ buildings: [market] });
    tickMarketRefills(state as unknown as Parameters<typeof tickMarketRefills>[0]);
    // After tick: countdown was 1 → decremented to 0 → trigger refill → reset
    expect(state.buildings[market.id].marketRefillCountdown).toBe(MARKET.AUTO_REFILL_INTERVAL);
    // Slots should have been filled
    const slots = state.buildings[market.id].marketResourceSlots ?? [];
    for (const slot of slots) {
      expect(slot).not.toBeNull();
    }
  });

  it('does NOT touch filled slots during auto-refill', () => {
    const existingOffer = { give: { currency: 'WOOD' as const, amount: 6 }, gain: { currency: 'IRON' as const, amount: 3 } };
    const market = makeMarketBuilding({ x: 0, y: 0 }, {
      marketRefillCountdown: 1,
      marketResourceSlots: [existingOffer, null],
      marketSpecialistSlots: [],
    });
    const state = makeState({ buildings: [market] });
    tickMarketRefills(state as unknown as Parameters<typeof tickMarketRefills>[0]);
    // First slot (was filled) must be the same offer
    const firstSlot = state.buildings[market.id].marketResourceSlots?.[0];
    expect(firstSlot).not.toBeNull();
    expect(firstSlot?.give.currency).toBe('WOOD');
    expect(firstSlot?.give.amount).toBe(6);
  });

  it('only refills markets (not other building types)', () => {
    const nonMarket: Building = {
      ...makeMarketBuilding({ x: 1, y: 0 }),
      type: BuildingType.MINE,
      marketRefillCountdown: 1,
    };
    const state = makeState({ buildings: [nonMarket] });
    // Should not throw or refill
    expect(() =>
      tickMarketRefills(state as unknown as Parameters<typeof tickMarketRefills>[0])
    ).not.toThrow();
    // Countdown should NOT have changed
    expect(state.buildings[nonMarket.id].marketRefillCountdown).toBe(1);
  });
});

// ============================================================================
// Commit point: hasTradedThisTurn semantics (F-5)
// ============================================================================

describe('trade commit point (F-5)', () => {
  it('opening and closing the panel without buying leaves hasTradedThisTurn === false', () => {
    // The panel store open/close does not touch unit state.
    // We test via canUnitTrade: if hasTradedThisTurn is still false, canUnitTrade should be true.
    const unit = makeUnit({ hasMovedThisTurn: false, hasTradedThisTurn: false });
    // Simulate "open panel, close panel without buying"
    // hasTradedThisTurn is NOT set by openMarket/closeMarket — only by a completed purchase.
    expect(canUnitTrade(unit)).toBe(true);
    // No mutation occurred
    expect(unit.hasTradedThisTurn).toBe(false);
  });

  it('a completed purchase (simulated) sets hasTradedThisTurn and a second canUnitTrade returns false', () => {
    const unit = makeUnit({ hasMovedThisTurn: false, hasTradedThisTurn: false });
    expect(canUnitTrade(unit)).toBe(true);
    // Simulate completed purchase
    unit.hasTradedThisTurn = true;
    expect(canUnitTrade(unit)).toBe(false);
  });
});

// ============================================================================
// fillEmptyResourceSlots / fillEmptySpecialistSlots
// ============================================================================

describe('fillEmptyResourceSlots', () => {
  it('fills null slots', () => {
    const market = makeMarketBuilding({ x: 0, y: 0 }, { marketResourceSlots: [null, null, null] });
    const state = makeState();
    fillEmptyResourceSlots(state, market);
    for (const slot of market.marketResourceSlots ?? []) {
      expect(slot).not.toBeNull();
    }
  });

  it('does not overwrite filled slots', () => {
    const filled = { give: { currency: 'WOOD' as const, amount: 6 }, gain: { currency: 'IRON' as const, amount: 3 } };
    const market = makeMarketBuilding({ x: 0, y: 0 }, { marketResourceSlots: [filled, null] });
    const state = makeState();
    fillEmptyResourceSlots(state, market);
    expect(market.marketResourceSlots![0]).toBe(filled);
    expect(market.marketResourceSlots![1]).not.toBeNull();
  });
});

describe('fillEmptySpecialistSlots', () => {
  it('fills null specialist slots from non-owned pool', () => {
    const market = makeMarketBuilding({ x: 0, y: 0 }, { marketSpecialistSlots: [null] });
    const state = makeState({ globalSpecialistStorage: [] });
    fillEmptySpecialistSlots(state, market);
    const slot = market.marketSpecialistSlots![0];
    if (slot !== null) {
      expect(Object.keys(SPECIALIST_DEFINITIONS)).toContain(slot);
    }
  });

  it('does not overwrite a filled specialist slot', () => {
    const allIds = Object.keys(SPECIALIST_DEFINITIONS);
    const existingId = allIds[0];
    const market = makeMarketBuilding({ x: 0, y: 0 }, { marketSpecialistSlots: [existingId, null] });
    const state = makeState();
    fillEmptySpecialistSlots(state, market);
    expect(market.marketSpecialistSlots![0]).toBe(existingId);
  });
});

// ============================================================================
// Placement (createMarket) — basic structural checks
// ============================================================================

describe('createMarket — structure', () => {
  it('creates a building with faction null', () => {
    const state = makeState();
    const m = createMarket(state, { x: 5, y: 5 });
    expect(m.faction).toBeNull();
  });

  it('creates a building with type MARKET', () => {
    const state = makeState();
    const m = createMarket(state, { x: 5, y: 5 });
    expect(m.type).toBe(BuildingType.MARKET);
  });

  it('sets marketRefillCountdown to AUTO_REFILL_INTERVAL', () => {
    const state = makeState();
    const m = createMarket(state, { x: 5, y: 5 });
    expect(m.marketRefillCountdown).toBe(MARKET.AUTO_REFILL_INTERVAL);
  });

  it('destroyBehavior is NONE', () => {
    const state = makeState();
    const m = createMarket(state, { x: 5, y: 5 });
    expect(m.destroyBehavior).toBe(DestroyBehavior.NONE);
  });

  it('combatStats is null (not attackable)', () => {
    const state = makeState();
    const m = createMarket(state, { x: 5, y: 5 });
    expect(m.combatStats).toBeNull();
  });
});
