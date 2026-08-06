/**
 * Unit XP rewards and level-up values.
 */


/**
 * XP reward values and global level system constants.
 */
export const XP = {
  /** XP granted for killing an enemy unit */
  KILL_UNIT: 1,
  /** XP granted for destroying an enemy building (incl. Watchtower going neutral) */
  DESTROY_BUILDING: 1,
  /** XP granted for capturing an enemy building (incl. Watchtower going neutral) */
  CAPTURE_BUILDING: 1,
  /** XP granted for constructing a building */
  CONSTRUCT_BUILDING: 1,
  /** Maximum level a unit can reach */
  MAX_LEVEL: 3,
} as const;

/**
 * Shared XP thresholds and stat-boost values referenced by UNIT_LEVEL_UP.
 * Change these to re-balance all unit types at once.
 */
export const LEVEL_UP_VALUES = {
  /** Cumulative XP required to reach level 2 (applies to all unit types) */
  XP_TO_LEVEL_2: 3,
  /** Cumulative XP required to reach level 3 (applies to all unit types) */
  XP_TO_LEVEL_3: 7,
  /** Max-HP flat boost per level for most unit types */
  HP_BOOST_DEFAULT: 30,
  HP_BOOST_DEFAULT2: 40,
  /** Max-HP flat boost per level for Scout units */
  HP_BOOST_SCOUT: 15,
  /** Max-HP flat boost per level for Emberling units */
  HP_BOOST_EMBERLING: 10,
} as const;

