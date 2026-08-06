/**
 * Resource, market, building limits, population, and training configuration.
 */

import type { MarketCurrency } from '../src/types';


export const BUILDINGS = {
  /** Number of turns required to capture a building */
  BUILDING_CAPTURE_TURNS: 1,
  /** Number of turns specialist assignment is disabled after use */
  SPECIALIST_ASSIGN_DISABLE_TURNS: 1,
  /** Probability of spawning a WATCHTOWER in each zone (0.0 to 1.0) */
  WATCHTOWER_SPAWN_CHANCE: 0.75,
  /** Number of rows at the start (low-Y end) of a zone where strongholds may not spawn */
  STRONGHOLD_SPAWN_SKIP_FIRST_ROWS: 3,
  /** Number of rows at the end (high-Y end) of a zone where strongholds may not spawn */
  STRONGHOLD_SPAWN_SKIP_LAST_ROWS: 1,
  /** Minimum number of tiles between the stronghold and the left/right map border */
  STRONGHOLD_SPAWN_BORDER_MARGIN: 1,
} as const;


export const RESOURCES = {
  /** Iron produced per turn by a mine */
  MINE_IRON_PER_TURN: 2,
  /** Iron produced per turn by a deep mine */
  DEEP_MINE_IRON_PER_TURN: 3,
  /** Wood produced per turn by a woodcutter */
  WOODCUTTER_WOOD_PER_TURN: 2,
  /** Iron available at the start of a new game */
  START_IRON: 6,
  /** Wood available at the start of a new game */
  START_WOOD: 6,

  // ── Charcoal Kiln ─────────────────────────────────────────────────────────
  /**
   * Flat iron bonus added to each eligible player MINE or DEEP_MINE's iron per turn when
   * that mine is within CHARCOAL_KILN_RADIUS tiles of at least one active,
   * non-disabled player Charcoal Kiln. The bonus stacks additively: a mine
   * receives one increment per active in-range kiln.
   */
  CHARCOAL_KILN_IRON_BONUS: 1,
  /**
   * Edge-circle radius used to determine which player MINE or DEEP_MINE buildings benefit
   * from a given Charcoal Kiln (measured via isTileWithinEdgeCircleRange).
   */
  CHARCOAL_KILN_RADIUS: 2,
} as const;


/** Resource offer pool entry shape - inferred from MARKET.RESOURCE_OFFER_POOL. */
export interface MarketOfferPoolEntry {
  give: { currency: MarketCurrency; amount: number };
  gain: { currency: MarketCurrency; amount: number };
}

export const MARKET = {
  // ── Placement (mapGenerator.ts) ──────────────────────────────────────────
  MIN_PER_GAME: 2,
  MAX_PER_GAME: 2,
  /**
   * Markets spawn ONLY in the MIDDLE zones. The first HEAD zones and the last
   * TAIL zones are EXCLUDED. Eligible = all zones except the first HEAD and the
   * last TAIL. Resolved against MAP.ZONE_COUNT. Max 1 market per zone.
   *
   * DEPENDENCY - read before editing: eligible zone count = ZONE_COUNT - HEAD - TAIL.
   * If HEAD + TAIL >= MAP.ZONE_COUNT there are NO eligible zones and markets can
   * never spawn. Keep HEAD + TAIL < MAP.ZONE_COUNT.
   * Current MAP.ZONE_COUNT = 10, so excluded = {1,2,3} ∪ {8,9,10} → eligible
   * middle zones {4,5,6,7}. Revisit these if ZONE_COUNT changes.
   */
  EXCLUDED_ZONES_HEAD: 2,
  EXCLUDED_ZONES_TAIL: 3,

  // ── Slots (rolled per market at generation; default fixed at 3 / 1) ───────
  RESOURCE_SLOTS_MIN: 3,
  RESOURCE_SLOTS_MAX: 3,
  SPECIALIST_SLOTS_MIN: 1,
  SPECIALIST_SLOTS_MAX: 1,
  /** Resource slots draw distinct offers when the pool allows (else duplicates permitted). */
  DISTINCT_RESOURCE_OFFERS: true,

  // ── Auto-refill: fills EMPTY slots only, free, every N player turns ───────
  AUTO_REFILL_INTERVAL: 3,

  // ── Restock: player-paid, rerolls ALL slots (incl. full), repeatable ──────
  RESTOCK_COST: { wood: 0, iron: 0, crystal: 1 } as { wood: number; iron: number; crystal: number },
  /** One free restock is available per market every N player turns (balancable). */
  FREE_RESTOCK_INTERVAL_TURNS: 3,

  // ── Specialist offers ─────────────────────────────────────────────────────
  /** Flat crystal cost per specialist acquisition (same for every specialist). */
  SPECIALIST_PRICE_CRYSTAL: 3,

  // ── Building ──────────────────────────────────────────────────────────────
  /** Market HP (lava-only removal; kept for data-model consistency). */
  MAX_HP: 1,

  // ── Resource offer pool: give X of A → gain Y of B ────────────────────────
  RESOURCE_OFFER_POOL: [
    { give: { currency: 'WOOD'    as MarketCurrency, amount: 6  }, gain: { currency: 'IRON'    as MarketCurrency, amount: 3  } },
    { give: { currency: 'IRON'    as MarketCurrency, amount: 6  }, gain: { currency: 'WOOD'    as MarketCurrency, amount: 3  } },
    { give: { currency: 'WOOD'    as MarketCurrency, amount: 10 }, gain: { currency: 'IRON'    as MarketCurrency, amount: 6  } },
    { give: { currency: 'IRON'    as MarketCurrency, amount: 10 }, gain: { currency: 'WOOD'    as MarketCurrency, amount: 6  } },
    { give: { currency: 'WOOD'    as MarketCurrency, amount: 20 }, gain: { currency: 'IRON'    as MarketCurrency, amount: 14 } },
    { give: { currency: 'IRON'    as MarketCurrency, amount: 20 }, gain: { currency: 'WOOD'    as MarketCurrency, amount: 14 } },
    { give: { currency: 'CRYSTAL' as MarketCurrency, amount: 1  }, gain: { currency: 'WOOD'    as MarketCurrency, amount: 5  } },
    { give: { currency: 'CRYSTAL' as MarketCurrency, amount: 1  }, gain: { currency: 'IRON'    as MarketCurrency, amount: 5  } },
    { give: { currency: 'WOOD'    as MarketCurrency, amount: 10 }, gain: { currency: 'CRYSTAL' as MarketCurrency, amount: 1  } },
    { give: { currency: 'IRON'    as MarketCurrency, amount: 10 }, gain: { currency: 'CRYSTAL' as MarketCurrency, amount: 1  } },
    { give: { currency: 'CRYSTAL' as MarketCurrency, amount: 2  }, gain: { currency: 'WOOD'    as MarketCurrency, amount: 12 } },
    { give: { currency: 'CRYSTAL' as MarketCurrency, amount: 2  }, gain: { currency: 'IRON'    as MarketCurrency, amount: 12 } },
    { give: { currency: 'WOOD'    as MarketCurrency, amount: 20 }, gain: { currency: 'CRYSTAL' as MarketCurrency, amount: 2  } },
    { give: { currency: 'IRON'    as MarketCurrency, amount: 20 }, gain: { currency: 'CRYSTAL' as MarketCurrency, amount: 2  } },
  ] as MarketOfferPoolEntry[],
} as const;


export const POPULATION = {
  /** Maximum population capacity for a Farm */
  FARM_POPULATION_CAP: 2,
  /** Maximum population capacity for a Patrician House */
  PATRICIAN_HOUSE_POPULATION_CAP: 2,
  /** Farmer capacity provided by a Stronghold */
  STRONGHOLD_FARMER_CAP: 2,
  /** Noble capacity provided by a Stronghold */
  STRONGHOLD_NOBLE_CAP: 2,
  /** Initial population when a housing building is constructed */
  HOUSE_INITIAL_POPULATION: 1,
  /** Number of turns between each population increase (same for all housing types) */
  HOUSE_GROWTH_INTERVAL: 3,
  /** DEF penalty applied while a unit has the HOMELESS tag */
  HOMELESS_DEF_PENALTY: 15,
  /** HP lost per player turn end while a unit has the HOMELESS tag */
  HOMELESS_HP_LOSS_PER_TURN: 10,
} as const;

export const TRAINING = {
  /** ATK penalty applied while a unit has the UNTRAINED tag */
  UNTRAINED_ATK_PENALTY: 15,
} as const;

