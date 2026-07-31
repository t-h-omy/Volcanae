/**
 * Market system for Volcanae.
 *
 * Provides pure functions for creating and managing Market buildings:
 * - createMarket: build the initial Building record with rolled slots
 * - rollResourceOffer / rollSpecialistId: offer generation
 * - fillEmptyResourceSlots / fillEmptySpecialistSlots: auto-refill helpers
 * - restockAllSlots: paid restock (rerolls everything)
 * - tickMarketRefills: decrement countdown; trigger fill on zero
 *
 * Uses an injectable RNG source (setMarketRandomSource) identical to the
 * pattern in waveThemeSystem.ts so tests can use a seeded deterministic RNG.
 */

import type { Draft } from 'immer';
import type { Building, GameState, MarketResourceOffer, Position } from './types';
import { BuildingType, DestroyBehavior } from './types';
import { MARKET, SPECIALIST_DEFINITIONS } from './gameConfig';
import { generateId } from './mapGenerator';

// ============================================================================
// INJECTABLE RNG
// ============================================================================

type RandomSource = () => number;

const RANDOM_CLAMP_UPPER_BOUND = 0.999999999;

let randomSource: RandomSource = Math.random;

export function setMarketRandomSource(source?: RandomSource): void {
  randomSource = source ?? Math.random;
}

function rand01(): number {
  const value = randomSource();
  if (!Number.isFinite(value)) return Math.random();
  if (value <= 0) return 0;
  if (value >= 1) return RANDOM_CLAMP_UPPER_BOUND;
  return value;
}

function randInt(minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return minInclusive;
  return Math.floor(rand01() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

// ============================================================================
// OFFER ROLLING
// ============================================================================

/**
 * Draw one resource offer from MARKET.RESOURCE_OFFER_POOL.
 * If DISTINCT_RESOURCE_OFFERS is true, avoid offers already present in
 * `existing` (comparing give+gain currencies). Falls back to duplicates
 * when the pool is smaller than the number of requested distinct offers.
 */
export function rollResourceOffer(existing: MarketResourceOffer[]): MarketResourceOffer {
  const pool = MARKET.RESOURCE_OFFER_POOL as readonly MarketResourceOffer[];

  if (MARKET.DISTINCT_RESOURCE_OFFERS && existing.length < pool.length) {
    // Build a set of "give+gain currency" keys already used.
    const usedKeys = new Set(
      existing.map((o) => `${o.give.currency}:${o.give.amount}→${o.gain.currency}:${o.gain.amount}`)
    );
    const available = pool.filter(
      (o) => !usedKeys.has(`${o.give.currency}:${o.give.amount}→${o.gain.currency}:${o.gain.amount}`)
    );
    if (available.length > 0) {
      const idx = randInt(0, available.length - 1);
      return { ...available[idx], give: { ...available[idx].give }, gain: { ...available[idx].gain } };
    }
  }

  const idx = randInt(0, pool.length - 1);
  return { ...pool[idx], give: { ...pool[idx].give }, gain: { ...pool[idx].gain } };
}

/**
 * Pick a random specialist id from the global pool, excluding:
 * - those already in globalSpecialistStorage (player owned)
 * - those already offered in this market's specialist slots
 *
 * Returns null if no eligible specialist exists.
 */
export function rollSpecialistId(
  state: GameState | Draft<GameState>,
  currentSpecialistSlots: (string | null)[],
): string | null {
  const allIds = Object.keys(SPECIALIST_DEFINITIONS);
  const ownedSet = new Set(state.globalSpecialistStorage);
  const offeredSet = new Set(currentSpecialistSlots.filter((s): s is string => s !== null));

  const eligible = allIds.filter((id) => !ownedSet.has(id) && !offeredSet.has(id));
  if (eligible.length === 0) return null;

  const idx = randInt(0, eligible.length - 1);
  return eligible[idx];
}

// ============================================================================
// SLOT FILLING HELPERS
// ============================================================================

/**
 * Fill all EMPTY (null) resource slots in the market with fresh rolled offers.
 * Does NOT touch filled slots.
 */
export function fillEmptyResourceSlots(
  _state: GameState | Draft<GameState>,
  market: Building | Draft<Building>,
): void {
  if (!market.marketResourceSlots) return;
  const filled: MarketResourceOffer[] = market.marketResourceSlots.filter(
    (s): s is MarketResourceOffer => s !== null
  );
  for (let i = 0; i < market.marketResourceSlots.length; i++) {
    if (market.marketResourceSlots[i] === null) {
      (market.marketResourceSlots as (MarketResourceOffer | null)[])[i] = rollResourceOffer(filled);
      filled.push(market.marketResourceSlots[i] as MarketResourceOffer);
    }
  }
}

/**
 * Fill all EMPTY (null) specialist slots in the market.
 * Does NOT touch filled slots.
 */
export function fillEmptySpecialistSlots(
  state: GameState | Draft<GameState>,
  market: Building | Draft<Building>,
): void {
  if (!market.marketSpecialistSlots) return;
  for (let i = 0; i < market.marketSpecialistSlots.length; i++) {
    if (market.marketSpecialistSlots[i] === null) {
      const slotsCopy = [...market.marketSpecialistSlots] as (string | null)[];
      (market.marketSpecialistSlots as (string | null)[])[i] = rollSpecialistId(state, slotsCopy);
    }
  }
}

/**
 * Restock: clear ALL slots (resource and specialist) then re-roll them.
 * This is the paid player action — label "Restock" in the UI.
 */
export function restockAllSlots(
  state: GameState | Draft<GameState>,
  market: Building | Draft<Building>,
): void {
  if (market.marketOffersInitialized !== true) return;
  if (market.marketResourceSlots) {
    // Clear all slots then re-roll as if empty.
    const slots = market.marketResourceSlots as (MarketResourceOffer | null)[];
    for (let i = 0; i < slots.length; i++) {
      slots[i] = null;
    }
    const filled: MarketResourceOffer[] = [];
    for (let i = 0; i < slots.length; i++) {
      slots[i] = rollResourceOffer(filled);
      filled.push(slots[i] as MarketResourceOffer);
    }
  }
  if (market.marketSpecialistSlots) {
    const slots = market.marketSpecialistSlots as (string | null)[];
    for (let i = 0; i < slots.length; i++) {
      slots[i] = null;
    }
    for (let i = 0; i < slots.length; i++) {
      const slotsCopy = [...slots];
      slots[i] = rollSpecialistId(state, slotsCopy);
    }
  }
}

// ============================================================================
// MARKET CREATION
// ============================================================================

/**
 * Create a new Market building at the given position with rolled slot counts,
 * but empty offers until first discovery.
 */
export function createMarket(
  _state: GameState | Draft<GameState> | null,
  position: Position,
): Building {
  const resourceSlotCount = randInt(MARKET.RESOURCE_SLOTS_MIN, MARKET.RESOURCE_SLOTS_MAX);
  const specialistSlotCount = randInt(MARKET.SPECIALIST_SLOTS_MIN, MARKET.SPECIALIST_SLOTS_MAX);

  const marketResourceSlots: (MarketResourceOffer | null)[] = Array.from(
    { length: resourceSlotCount },
    () => null,
  );
  const marketSpecialistSlots: (string | null)[] = Array.from(
    { length: specialistSlotCount },
    () => null,
  );

  return {
    id: generateId('building'),
    type: BuildingType.MARKET,
    faction: null,
    position: { ...position },
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
    marketResourceSlots,
    marketSpecialistSlots,
    marketRefillCountdown: MARKET.AUTO_REFILL_INTERVAL,
    marketOffersInitialized: false,
  };
}

export function initializeMarketOffers(
  state: GameState | Draft<GameState>,
  market: Building | Draft<Building>,
): void {
  if (market.marketOffersInitialized === true) return;
  fillEmptyResourceSlots(state, market);
  fillEmptySpecialistSlots(state, market);
  market.marketRefillCountdown = MARKET.AUTO_REFILL_INTERVAL;
  market.marketOffersInitialized = true;
}

// ============================================================================
// AUTO-REFILL TICK
// ============================================================================

/**
 * Decrement each market's refill countdown. When it reaches zero,
 * fill empty slots and reset to AUTO_REFILL_INTERVAL.
 *
 * Call once per player turn-end (after other bookkeeping, alongside
 * where hasCapturedThisTurn is reset).
 */
export function tickMarketRefills(state: Draft<GameState>): void {
  for (const building of Object.values(state.buildings)) {
    if (building.type !== BuildingType.MARKET) continue;
    if (building.marketOffersInitialized !== true) continue;
    const tile = state.grid[building.position.y]?.[building.position.x];
    if (!tile?.isRevealed) continue;
    if (building.marketRefillCountdown === undefined) continue;

    building.marketRefillCountdown -= 1;
    if (building.marketRefillCountdown <= 0) {
      fillEmptyResourceSlots(state, building);
      fillEmptySpecialistSlots(state, building);
      building.marketRefillCountdown = MARKET.AUTO_REFILL_INTERVAL;
    }
  }
}
