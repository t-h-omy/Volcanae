/**
 * Building type interface, crystal building configurations, and building definitions.
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


/** All data for a single building type, combining construction cost, combat stats and UI descriptions. */
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
  description: string;
}

/**
 * Single source of truth for all per-building data.
 * Replaces BUILDINGS.DISCOVER_RADIUS, BUILDINGS.DESTROY_BEHAVIOR,
 * BUILDINGS.WATCHTOWER_STATS, BUILDINGS.OUTPOST_STATS, LAVA_LAIR.MAGMA_SPYR_STATS,
 * CONSTRUCTION.*_COST, CRYSTAL_CHAMBER_CONFIG.COST, and CRYSTAL_CHAMBER_CONFIG.DISCOVER_RADIUS.
 *
 * All description strings use template-literal references to named constants -
 * never raw balancing numbers. See the DESCRIPTION AUTHORING RULE in the
 * ABILITIES block above.
 */

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  STRONGHOLD: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
    unitLimit: 4,
    description: 'Your capital - if you lose all your strongholds, the game is over.',
  },
  MINE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 4 },
    description: `Produces ${RESOURCES.MINE_IRON_PER_TURN} iron per turn, the primary resource for training units.`,
  },
  DEEP_MINE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 15 },
    description: `Produces ${RESOURCES.DEEP_MINE_IRON_PER_TURN} iron per turn. An advanced mine that delves deeper into the mountain to extract richer ore veins.`,
  },
  WOODCUTTER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: `Produces ${RESOURCES.WOODCUTTER_WOOD_PER_TURN} wood per turn, used alongside iron for buildings and recruitment.`,
  },
  BARRACKS: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 4, wood: 4 },
    unitLimit: 3,
    upkeepIron: 1,
    upkeepWood: 1,
    description: 'Military hall that trains Spearman and Swordsman.',
  },
  ARCHER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 2, wood: 14 },
    unitLimit: 3,
    upkeepWood: 2,
    upkeepIron: 2,
    description: 'Archery range that trains Archers.',
  },
  RIDER_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 4, wood: 18 },
    unitLimit: 3,
    upkeepIron: 2,
    upkeepWood: 2,
    description: 'Stable that trains Riders.',
  },
  SIEGE_CAMP: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 6, wood: 16 },
    unitLimit: 2,
    upkeepIron: 2,
    upkeepWood: 2,
    description: 'Engineering works that trains Siege engines.',
  },
  WATCHTOWER: (() => {
    const combatStats = { maxHp: 150, attack: 55, defense: 55, attackRange: 3 };
    return {
      discoverRadius: 4,
      destroyBehavior: DestroyBehavior.RUIN,
      constructionCost: { iron: 0, wood: 8 },
      combatStats,
      description: `Defensive tower that attacks enemies within ${combatStats.attackRange} tiles and expands your vision.`,
    };
  })(),
  OUTPOST: (() => {
    const combatStats = { maxHp: 200, attack: 55, defense: 50, attackRange: 2 };
    return {
      discoverRadius: 3,
      destroyBehavior: DestroyBehavior.NONE,
      constructionCost: { iron: 0, wood: 4 },
      combatStats,
      description: `Field fortification built by Spearmen via Fieldwork (costs 4 wood). Attacks enemies within ${combatStats.attackRange} tiles. Starting HP is based on the building unit's current HP, capped at ${combatStats.maxHp}.`,
    };
  })(),
  LAVALAIR: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Enemy spawner building. Produces Lava Grunt units.',
  },
  INFERNALSANCTUM: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.STRONGHOLD_RUIN,
    constructionCost: { iron: 0, wood: 0 },
    description: 'Enemy zone stronghold. Capturing it triggers a Sanctum Collapse.',
  },
  FARM: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 0, wood: 8 },
    description: 'Housing for common folk - each pop raised lets you field one more basic unit.',
  },
  PATRICIANHOUSE: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 2, wood: 16 },
    description: 'Noble estate - each noble raised lets you field one more elite unit.',
  },
  MAGMASPYR: (() => {
    const combatStats = { maxHp: 120, attack: 30, defense: 50, attackRange: 2, maxAttacksPerTurn: 2 };
    return {
      discoverRadius: 2,
      destroyBehavior: DestroyBehavior.RESOURCE,
      constructionCost: { iron: 0, wood: 0 },
      combatStats,
      description: `Corrupted mountain spire that attacks nearby units up to ${combatStats.maxAttacksPerTurn} times per turn.`,
    };
  })(),
  EMBERNEST: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RESOURCE,
    constructionCost: { iron: 0, wood: 0 },
    description: `Corrupted forest nest that spawns Emberlings every ${LAVA_LAIR.EMBER_NEST_SPAWN_INTERVAL} turns.`,
  },
  CRYSTAL_CHAMBER: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.RUIN,
    constructionCost: { iron: 8, wood: 4 },
    unitLimit: CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT,
    description: `Arcane resonator. When a Crystal Chamber is consumed by lava, all surviving chambers begin resonating and generate ${CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN} crystal${CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN !== 1 ? 's' : ''} per turn. While active, Mages can be recruited once Arcane Awakening is researched.`,
  },
  GRAVESTONE: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    maxHp: ABILITIES.GRAVESTONE_MAX_HP,
    description: `The grave of a fallen warrior. Revive the unit by paying ${ABILITIES.REVIVE_CRYSTAL_COST} crystal.`,
  },
  GRAVE_TRAP: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: `A magic trap forged from a gravestone. The next enemy to step onto it is stunned for ${MAGE.GRAVE_TRAP_STUN_TURNS} turns, along with all adjacent enemies. The trap is consumed on trigger.`,
  },
  CRYSTAL_TOWER: (() => {
    const combatStats = { maxHp: 200, attack: 40, defense: 55, attackRange: 2, maxAttacksPerTurn: 1 };
    return {
      discoverRadius: 3,
      destroyBehavior: DestroyBehavior.RUIN,
      constructionCost: { iron: 2, wood: 4 },
      combatStats,
      description: `Arcane combat tower. Attacks enemies within ${combatStats.attackRange} tiles. Each enemy unit it kills generates ${MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD} crystal. Gains +${MAGE.CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS} attack per connected Crystal Chamber within ${MAGE.CRYSTAL_TOWER_CHAMBER_CONNECT_RANGE} tiles.`,
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
    description: `Conjured mountain hollow that hosts a single Crystal Drake. While resonating, it can summon a Crystal Drake. If the cave falls (lava, capture, conversion, destruction) any bound drake dies with it.`,
  },
  CHARCOAL_KILN: {
    // Shares the same sight radius and destroy behaviour as the Woodcutter -
    // both are economy-only forest buildings with no combat stats.
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 8 },
    // No combatStats → tile remains walkable (same as MINE / WOODCUTTER).
    // Description must state the additive per-kiln effect.
    description: `Grants +${RESOURCES.CHARCOAL_KILN_IRON_BONUS} iron per turn per in-range kiln to each mine and deep mine within ${RESOURCES.CHARCOAL_KILN_RADIUS} tiles.`,
  },
  MARKET: {
    discoverRadius: 2,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 0 },
    description: `A neutral market. Offers appear when the market is discovered. A unit standing here may Trade once per turn for ${MARKET.RESOURCE_SLOTS_MAX} resource swaps and ${MARKET.SPECIALIST_SLOTS_MAX} specialist offer(s). Trading ends the unit's turn. Includes one free restock every ${MARKET.FREE_RESTOCK_INTERVAL_TURNS} turns. Destroyed only by lava.`,
  },
  BRIDGE: {
    discoverRadius: 0,
    destroyBehavior: DestroyBehavior.NONE,
    constructionCost: { iron: 0, wood: 8 }, // balanceable wood/iron
    description:
      `A timber bridge spanning a single canyon tile between two land tiles. ` +
      `Cross along its axis or diagonally; lava destroys it.`,
  },
  SCOUT_TRAP: {
    discoverRadius: 1,
    destroyBehavior: DestroyBehavior.NONE,
    // Placed by Scout action, not the build menu; cost is enforced in the action handler.
    constructionCost: { iron: 0, wood: 0 },
    description: `A concealed trap laid by a Scout. The next non-FLYING enemy to enter it takes ${ABILITIES.SCOUT_TRAP_DAMAGE} damage and is stunned for ${ABILITIES.SCOUT_TRAP_STUN_TURNS} turn(s), then the trap is consumed.`,
  },
};

