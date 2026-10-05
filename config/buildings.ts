/**
 * Building type interface, crystal building configurations, building definitions,
 * and localized text parameters.
 */

import { BuildingType, DestroyBehavior } from '../src/types';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';
import { RESOURCES, MARKET } from './economy';
import { LAVA_LAIR } from './enemyAi';


export const CRYSTAL_CHAMBER_CONFIG = {
  /** Number of turns all surviving chambers resonate after one is destroyed by lava */
  RESONANCE_DURATION: 3,
  /** Arcane crystals granted per resonating chamber per player turn */
  CRYSTALS_PER_CHAMBER_PER_TURN: 1,
  /** Max HP */
  MAX_HP: 100,
  /** Per-building unit limit (max live Mages per Crystal Chamber) */
  CHAMBER_UNIT_LIMIT: 1,
} as const;


export const CRYSTAL_CAVE_CONFIG = {
  /** Maximum HP of a Crystal Cave building */
  MAX_HP: 80,
  /**
   * Per-building unit limit (max live Crystal Drakes per Crystal Cave).
   * The cave hosts at most one drake at a time. Combined with the
   * `roostBuildingId` cleanup hook, losing the cave kills the drake.
   */
  CAVE_UNIT_LIMIT: 1,
  /** Arcane crystal cost to cast the Crystal Cave spell */
  CAVE_SPELL_CRYSTAL_COST: 1,
} as const;


/** All data for a single building type, including parameters for localized text. */
export interface BuildingDefinition {
  discoverRadius: number;
  destroyBehavior: DestroyBehavior;
  /** Iron/wood construction cost ({iron:0,wood:0} for buildings not constructed by the player) */
  constructionCost: { iron: number; wood: number };
  /** Maximum HP of the building (0 for buildings that cannot be damaged) */
  maxHp?: number;
  /** Combat stats - only present for buildings that can attack */
  combatStats?: {
    maxHp: number;
    attack: number;
    defense: number;
    attackRange: number;
    maxAttacksPerTurn?: number;
  };
  /**
   * Maximum number of units of the recruitable type(s) per building of this type.
   * The global cap = (number of player-owned buildings of this type) × unitLimit.
   * Only relevant for recruitment buildings; undefined means no cap.
   * All current recruitment buildings use 5.
   */
  unitLimit?: number;
  /** Iron upkeep cost per player turn for each player-owned building of this type. */
  upkeepIron?: number;
  /** Wood upkeep cost per player turn for each player-owned building of this type. */
  upkeepWood?: number;
  textParams?: { [name: string]: number };
}

/**
 * Single source of truth for all per-building data.
 * Replaces BUILDINGS.DISCOVER_RADIUS, BUILDINGS.DESTROY_BEHAVIOR,
 * BUILDINGS.WATCHTOWER_STATS, BUILDINGS.OUTPOST_STATS, LAVA_LAIR.MAGMA_SPYR_STATS,
 * CONSTRUCTION.*_COST, CRYSTAL_CHAMBER_CONFIG.COST, and CRYSTAL_CHAMBER_CONFIG.DISCOVER_RADIUS.
 *
 * Localized text parameters use the named values in this definition or config.
 */

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  STRONGHOLD: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
    unitLimit: 4,
  },
  MINE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 4 },
    textParams: { ironPerTurn: RESOURCES.MINE_IRON_PER_TURN },
  },
  DEEP_MINE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 15 },
    textParams: { ironPerTurn: RESOURCES.DEEP_MINE_IRON_PER_TURN },
  },
  WOODCUTTER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    textParams: { woodPerTurn: RESOURCES.WOODCUTTER_WOOD_PER_TURN },
  },
  BARRACKS: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 4, wood: 4 },
    unitLimit: 3,
    upkeepIron: 1,
    upkeepWood: 1,
  },
  ARCHER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 2, wood: 14 },
    unitLimit: 3,
    upkeepWood: 2,
    upkeepIron: 2,
  },
  RIDER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 4, wood: 18 },
    unitLimit: 3,
    upkeepIron: 2,
    upkeepWood: 2,
  },
  SIEGE_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 6, wood: 16 },
    unitLimit: 2,
    upkeepIron: 2,
    upkeepWood: 2,
  },
  WATCHTOWER: (() => {
    const combatStats = { maxHp: 150, attack: 55, defense: 55, attackRange: 3 };
    return {
      discoverRadius: 4,
      destroyBehavior: DestroyBehavior.RUIN,
      constructionCost: { iron: 0, wood: 8 },
      combatStats,
      textParams: { attackRange: combatStats.attackRange },
    };
  })(),
  OUTPOST: (() => {
    const combatStats = { maxHp: 200, attack: 55, defense: 50, attackRange: 2 };
    const constructionCost = { iron: 0, wood: 4 };
    return {
      discoverRadius: 3,
      destroyBehavior: DestroyBehavior.NONE,
      constructionCost,
      combatStats,
      textParams: {
        woodCost: constructionCost.wood,
        attackRange: combatStats.attackRange,
        maxHp: combatStats.maxHp,
      },
    };
  })(),
  LAVALAIR: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 0 },
  },
  INFERNALSANCTUM: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
  },
  FARM: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 8 },
  },
  PATRICIANHOUSE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 2, wood: 16 },
  },
  MAGMASPYR: (() => {
    const combatStats = { maxHp: 120, attack: 30, defense: 50, attackRange: 2, maxAttacksPerTurn: 2 };
    return {
      discoverRadius: 2,
      destroyBehavior: DestroyBehavior.RESOURCE,
      constructionCost: { iron: 0, wood: 0 },
      combatStats,
      textParams: { maxAttacksPerTurn: combatStats.maxAttacksPerTurn! },
    };
  })(),
  EMBERNEST: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RESOURCE,
    constructionCost: { iron: 0, wood: 0 },
    textParams: { spawnInterval: LAVA_LAIR.EMBER_NEST_SPAWN_INTERVAL },
  },
  CRYSTAL_CHAMBER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 8, wood: 4 },
    unitLimit: CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT,
    textParams: { crystalsPerTurn: CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN },
  },
  GRAVESTONE: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    maxHp: ABILITIES.GRAVESTONE_MAX_HP,
    textParams: { reviveCrystalCost: ABILITIES.REVIVE_CRYSTAL_COST },
  },
  GRAVE_TRAP: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    textParams: { stunTurns: MAGE.GRAVE_TRAP_STUN_TURNS },
  },
  CRYSTAL_TOWER: (() => {
    const combatStats = { maxHp: 200, attack: 40, defense: 55, attackRange: 2, maxAttacksPerTurn: 1 };
    return {
      discoverRadius: 3,
      destroyBehavior: DestroyBehavior.RUIN,
      constructionCost: { iron: 2, wood: 4 },
      combatStats,
      textParams: {
        attackRange: combatStats.attackRange,
        crystalReward: MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD,
        chamberAttackBonus: MAGE.CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS,
        chamberConnectRange: MAGE.CRYSTAL_TOWER_CHAMBER_CONNECT_RANGE,
      },
    };
  })(),
  CRYSTAL_CAVE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    // Spell-summoned only; not constructable by units, so iron/wood are zero.
    constructionCost: { iron: 0, wood: 0 },
    maxHp: CRYSTAL_CAVE_CONFIG.MAX_HP,
    unitLimit: CRYSTAL_CAVE_CONFIG.CAVE_UNIT_LIMIT,
    // While any Crystal Chamber resonates, the cave's resonance flag is set
    // via the shared lava-resonance trigger. Recruiting a drake never consumes
    // a resonance tick - the window decays on its own end-of-turn schedule.
  },
  CHARCOAL_KILN: {
    // Shares the same sight radius and destroy behaviour as the Woodcutter -
    // both are economy-only forest buildings with no combat stats.
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 8 },
    // No combatStats → tile remains walkable (same as MINE / WOODCUTTER).
    // Description must state the additive per-kiln effect.
    textParams: {
      ironBonus: RESOURCES.CHARCOAL_KILN_IRON_BONUS,
      radius: RESOURCES.CHARCOAL_KILN_RADIUS,
    },
  },
  MARKET: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    textParams: {
      resourceSlots: MARKET.RESOURCE_SLOTS_MAX,
      specialistSlots: MARKET.SPECIALIST_SLOTS_MAX,
      tradesPerTurn: MARKET.TRADES_PER_UNIT_PER_TURN,
      freeRestocks: MARKET.FREE_RESTOCKS_PER_INTERVAL,
      freeRestockInterval: MARKET.FREE_RESTOCK_INTERVAL_TURNS,
    },
  },
  BRIDGE: {
    discoverRadius: 0,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 8 }, // balanceable wood/iron
  },
  SCOUT_TRAP: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    // Placed by Scout action, not the build menu; cost is enforced in the action handler.
    constructionCost: { iron: 0, wood: 0 },
    textParams: {
      damage: ABILITIES.SCOUT_TRAP_DAMAGE,
      stunTurns: ABILITIES.SCOUT_TRAP_STUN_TURNS,
    },
  },
};
