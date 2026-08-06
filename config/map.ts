/**
 * Map layout, lava, difficulty, and terrain configuration.
 */

import { Difficulty } from '../src/types';


export const MAP = {
  /** Width of the game grid in cells */
  GRID_WIDTH: 9,
  /** Total height of the grid (35 playable + 6 lava buffer rows at the south/high-Y end) */
  GRID_HEIGHT: 76,
  /** Number of zones on the map */
  ZONE_COUNT: 10,
  /** Number of rows per zone */
  ZONE_HEIGHT: 7,
  /** Number of lava buffer rows at the south (high-Y) end of the map */
  LAVA_BUFFER_ROWS: 6,
  /** First zone index (1-based) that spawns enemy buildings */
  FIRST_ENEMY_ZONE: 4,
} as const;


export const LAVA = {
  /** Lava advances 1 row every N player turns */
  LAVA_ADVANCE_INTERVAL: 3,
} as const;


/** Multipliers applied to enemy attack, defense, max HP, and lava advance speed per difficulty. */
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  [Difficulty.EASY]: 0.5,
  [Difficulty.STANDARD]: 1,
  [Difficulty.HARD]: 1.25,
};

/**
 * Returns the lava advance interval (turns between lava advances) for the given difficulty.
 * Higher difficulty → smaller interval → faster lava.
 */
export function getLavaAdvanceInterval(difficulty: Difficulty): number {
  return Math.max(1, Math.round(LAVA.LAVA_ADVANCE_INTERVAL / DIFFICULTY_MULTIPLIER[difficulty]));
}


export const TERRAIN = {
  /** Minimum number of forest tiles placed per zone (used if no zone-specific override is set) */
  FORESTS_PER_ZONE_MIN: 2,
  /** Maximum number of forest tiles placed per zone (used if no zone-specific override is set) */
  FORESTS_PER_ZONE_MAX: 3,
  /**
   * Optional per-zone forest min/max overrides.
   * Keys are zone numbers (1–5). Missing keys fall back to FORESTS_PER_ZONE_MIN/MAX.
   * Example: { 1: { min: 1, max: 2 }, 3: { min: 3, max: 5 } }
   */
  FORESTS_PER_ZONE_OVERRIDES: { 1: { min: 3, max: 3 }, 4: { min: 3, max: 3 }  } as Record<number, { min: number; max: number }>,
  /** Minimum number of mountain tiles placed per zone (used if no zone-specific override is set) */
  MOUNTAINS_PER_ZONE_MIN: 2,
  /** Maximum number of mountain tiles placed per zone (used if no zone-specific override is set) */
  MOUNTAINS_PER_ZONE_MAX: 3,
  /**
   * Optional per-zone mountain min/max overrides.
   * Keys are zone numbers (1–5). Missing keys fall back to MOUNTAINS_PER_ZONE_MIN/MAX.
   * Example: { 1: { min: 1, max: 2 }, 3: { min: 3, max: 5 } }
   */
  MOUNTAINS_PER_ZONE_OVERRIDES: {} as Record<number, { min: number; max: number }>,
  /** Minimum number of ruin tiles placed per zone (used if no zone-specific override is set) */
  RUINS_PER_ZONE_MIN: 8,
  /** Maximum number of ruin tiles placed per zone (used if no zone-specific override is set) */
  RUINS_PER_ZONE_MAX: 8,
  /**
   * Optional per-zone ruin min/max overrides.
   * Keys are zone numbers (1–5). Missing keys fall back to RUINS_PER_ZONE_MIN/MAX.
   * Example: { 1: { min: 4, max: 5 }, 5: { min: 10, max: 12 } }
   */
  RUINS_PER_ZONE_OVERRIDES: { 1: { min: 6, max: 6 }, 2: {min: 7, max: 7} } as Record<number, { min: number; max: number }>,
  /** Minimum number of ruin tiles placed in the lava buffer rows */
  RUINS_IN_LAVA_BUFFER_MIN: 3,
  /** Maximum number of ruin tiles placed in the lava buffer rows */
  RUINS_IN_LAVA_BUFFER_MAX: 4,
  /**
   * Minimum edge-circle distance from the zone 1 stronghold for the guaranteed
   * forest tile placement in zone 1.
   */
  ZONE1_FOREST_MIN_DISTANCE: 1,
  /**
   * Maximum edge-circle distance from the zone 1 stronghold for the guaranteed
   * forest tile placement in zone 1.
   */
  ZONE1_FOREST_MAX_DISTANCE: 2,
  /**
   * Minimum edge-circle distance from the zone 1 stronghold for the guaranteed
   * mountain tile placement in zone 1.
   */
  ZONE1_MOUNTAIN_MIN_DISTANCE: 1,
  /**
   * Maximum edge-circle distance from the zone 1 stronghold for the guaranteed
   * mountain tile placement in zone 1.
   */
  ZONE1_MOUNTAIN_MAX_DISTANCE: 2,

  // Canyon config
  CANYON_LENGTH_MIN: 8,
  CANYON_LENGTH_MAX: 13,
  CANYON_DRIFT_CHANCE: 0.25,
  CANYON_WIDTH_VARIANCE_CHANCE: 0.75,
  CANYONS_PER_ZONE_MIN: 0,
  CANYONS_PER_ZONE_MAX: 2,

  // Lake config
  LAKE_WIDTH_MIN: 2,
  LAKE_WIDTH_MAX: 5,
  LAKE_HEIGHT_MIN: 2,
  LAKE_HEIGHT_MAX: 5,
  LAKE_EROSION_CHANCE: 0.3,
  LAKES_PER_ZONE_MIN: 0,
  LAKES_PER_ZONE_MAX: 2,

  // Traversability
  MIN_PASSABLE_TILES_PER_ROW: 1,
  MAX_TRAVERSABILITY_RETRIES: 10,
  IMPASSABLE_MIN_DISTANCE_FROM_STRONGHOLD: 2,

  /** Probability that a Mountain tile has a cave monster; checked once per tile at map gen */
  CAVE_MONSTER_SPAWN_CHANCE: 0.33,
  /**
   * Per-zone HP/ATK/DEF multiplier for the cave monster (index 0 = zone 1, index 4 = zone 5).
   * Higher zones are deeper into enemy territory and have stronger monsters.
   */
  CAVE_MONSTER_ZONE_SCALE: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0] as const,
  /**
   * Chebyshev-distance radius within which the cave monster will patrol.
   * If the monster wanders outside this radius (no aggro), it returns to its home tile.
   * Once back on the home tile it may despawn the following turn.
   */
  CAVE_MONSTER_PATROL_RADIUS: 3,

  // Long-deadend prevention (canyon/lake placement validation)
  /**
   * A canyon or lake candidate is rejected if it would create a side pocket where any
   * walkable tile is more than this many BFS steps away from the "forward core"
   * (the main south-to-north corridor through the zone).
   * Increase to allow deeper side branches; decrease to keep the map more open.
   */
  WORLDGEN_MAX_DEADEND_DEPTH: 12,
  /**
   * Controls how wide the "forward core" is.
   * The core consists of every walkable tile whose combined BFS distance to the south band
   * AND to the north band is at most (shortestSouthToNorthPath + WORLDGEN_MAIN_PATH_SLACK).
   * A value of 0 would include only tiles that lie exactly on a shortest path; higher values
   * widen the core to include tiles that take a slight detour, making the deadend check
   * more lenient about terrain placed near (but not on) the critical corridor.
   */
  WORLDGEN_MAIN_PATH_SLACK: 4,
  /**
   * How many rows at each end of a zone are used as BFS seeds for the south-to-north
   * distance calculation.
   * The bottom N rows of a zone form the "south band" (seed for distanceFromSouth) and
   * the top N rows form the "north band" (seed for distanceFromNorth).
   * Increasing this makes the bands wider, so more tiles qualify as band-adjacent
   * starting points for the forward-core BFS.
   */
  WORLDGEN_DEADEND_BAND_ROWS: 2,
} as const;

