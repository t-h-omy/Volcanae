/**
 * Unit type interface, unit cost interface, and unit definitions.
 * Unit definitions and text parameters consumed by localized catalog entries.
 */

import { UnitTag, UnitType } from '../src/types';
import type { UnitLevelDefinition } from '../src/types';
import { LEVEL_UP_VALUES } from './progression';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';


/** All data for a single unit type, combining stats, tags, costs, and localized text parameters. */
export interface UnitDefinition {
  // ── Stats ────────────────────────────────────────────────────────────────
  maxHp: number;
  attack: number;
  defense: number;
  movementActions: number;
  moveRange: number;
  attackRange: number;
  discoverRadius: number;
  triggerRange: number;
  /** Explosion damage radius dealt on death - only EMBERLING */
  explosionDamage?: number;

  // ── Tags ─────────────────────────────────────────────────────────────────
  tags: UnitTag[];

  // ── Costs ────────────────────────────────────────────────────────────────
  /** Iron/wood recruitment cost ({iron:0,wood:0} for enemy-only units). Crystal Drake also sets crystals. */
  cost: { iron: number; wood: number; crystals?: number };
  /** Population slot consumption */
  populationCost: { farmers: number; nobles: number };

  // ── Level-up progression (index 0 = L2, index 1 = L3) ───────────────────
  levelUp: UnitLevelDefinition[];

  // ── Enemy unlock threshold (omit for player units) ───────────────────────
  enemyUnlockEmber?: number;

  // ── Wave-theme eligibility (enemy wave composition system) ────────────────
  /** Whether this unit may appear in a themed enemy wave (default: true) */
  themeEligible?: boolean;
  /** Maximum percentage of wave slots this unit type may fill (default: 100) */
  maxThemePercent?: number;
  /** Maximum number of this unit type alive in the same zone simultaneously (default: Infinity) */
  maxAlivePerZone?: number;

  textParams?: { [name: string]: number };
}


/** Iron/wood cost for a unit or building */
export interface UnitCost {
  iron: number;
  wood: number;
}



/**
 * Single source of truth for all per-unit data.
 * Replaces UNITS, UNIT_COSTS, UNIT_POPULATION_COSTS, UNIT_LEVEL_UP, and ENEMY_UNIT_UNLOCK.
 *
 * Text parameter values are sourced here from unit stats or named config constants.
 */
export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  SPEARMAN: {
    maxHp: 100, attack: 45, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 4, wood: 6 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  SWORDSMAN: {
    maxHp: 120, attack: 60, defense: 55,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 14, wood: 8 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  ARCHER: {
    maxHp: 90, attack: 50, defense: 35,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.BUILDANDCAPTURE],
    cost: { iron: 2, wood: 10 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  CROSSBOWMAN: {
    maxHp: 100, attack: 65, defense: 35,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.RELOAD, UnitTag.PUNCTURE, UnitTag.BUILDANDCAPTURE],
    cost: { iron: 4, wood: 12 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  RIDER: {
    maxHp: 100, attack: 70, defense: 35,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.BUILDANDCAPTURE],
    cost: { iron: 12, wood: 6 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  SIEGE: {
    maxHp: 75, attack: 85, defense: 0,
    movementActions: 1, moveRange: 1, attackRange: 3,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.RANGED, UnitTag.PREP],
    cost: { iron: 10, wood: 14 },
    populationCost: { farmers: 1, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  SCOUT: {
    maxHp: 60, attack: 25, defense: 20,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [],
    cost: { iron: 0, wood: 4 },
    populationCost: { farmers: 1, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
    ],
  },

  GUARD: {
    maxHp: 100, attack: 20, defense: 65,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.PREP],
    cost: { iron: 4, wood: 0 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  LAVA_GRUNT: {
    maxHp: 100, attack: 50, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.CORRUPT, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 0,
  },

  LAVA_ARCHER: {
    maxHp: 100, attack: 55, defense: 20,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.RANGED, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 2,
  },

  LAVA_RIDER: {
    maxHp: 100, attack: 70, defense: 30,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.BUILDANDCAPTURE, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 4,
  },

  LAVA_SIEGE: {
    maxHp: 75, attack: 75, defense: 0,
    movementActions: 1, moveRange: 1, attackRange: 3,
    discoverRadius: 1, triggerRange: 4,
    tags: [UnitTag.RANGED, UnitTag.PREP, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 7,
  },

  REAPER: {
    maxHp: 120, attack: 50, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.CLEAVE, UnitTag.RAGE, UnitTag.CORRUPT, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 6,
  },

  LANCER: {
    maxHp: 120, attack: 75, defense: 30,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.PIERCE, UnitTag.ALERT, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 4,
  },

  BULLWARK: {
    maxHp: 130, attack: 55, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.PUNCTURE, UnitTag.BLOCK, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 5,
  },

  KINDLER: {
    maxHp: 150, attack: 30, defense: 20,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 4,
    tags: [UnitTag.BURN, UnitTag.RANGED, UnitTag.PREP, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 5,
  },

  GRIMBEAK: {
    maxHp: 150, attack: 50, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.RAGE, UnitTag.IRONBLOOD, UnitTag.CORRUPT, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 6,
  },

  RIFTWORM: {
    maxHp: 75, attack: 60, defense: 30,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.TUNNEL, UnitTag.RAGE, UnitTag.CORRUPT, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 5,
  },

  RIFT_LORD: {
    maxHp: 100, attack: 0, defense: 20,
    movementActions: 1, moveRange: 1, attackRange: 0,
    discoverRadius: 2, triggerRange: 5,
    tags: [UnitTag.EMBER_PORTAL, UnitTag.PASSIVE, UnitTag.PREP, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    enemyUnlockEmber: 7,
    maxThemePercent: 15,
    maxAlivePerZone: 1,
  },

  EMBERLING: {
    maxHp: 45, attack: 0, defense: 15,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    explosionDamage: 40,
    tags: [UnitTag.SACRIFICIAL, UnitTag.EXPLOSIVE, UnitTag.PASSIVE, UnitTag.LAVA],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_EMBERLING }] },
    ],
    enemyUnlockEmber: 1,
    themeEligible: false,
  },

  CAVE_MONSTER: {
   maxHp: 120, attack: 55, defense: 40,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 3, triggerRange: 3,
    tags: [UnitTag.ALERT],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
    themeEligible: false,
  },

  MAGE: {
    maxHp: 80, attack: 0, defense: 0,
    movementActions: 1, moveRange: 1, attackRange: 2,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.PASSIVE, UnitTag.PREP],
    cost: { iron: 4, wood: 12 },
    populationCost: { farmers: 0, nobles: 1 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_SCOUT }] },
    ],
  },

  EMBER_DEMON: {
    maxHp: 160, attack: 70, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 3,
    tags: [UnitTag.LAVA, UnitTag.READY],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    ],
  },

  SKELETON: {
    maxHp: 90, attack: 40, defense: 35,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  GARGOYLE: {
    // Medium ATK/DEF flying melee summon. All values are tunables.
    maxHp: 90, attack: 45, defense: 40,
    movementActions: 1, moveRange: 2, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [UnitTag.FLYING, UnitTag.RANGED],
    cost: { iron: 0, wood: 0 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }] },
    ],
  },

  CRYSTAL_DRAKE: {
    maxHp: 200, attack: 65, defense: 55,
    movementActions: 1,
    moveRange: 2, 
    attackRange: 2,
    discoverRadius: 2,
    triggerRange: 0,
    // SUMMONED → consumes no pop, cannot be healed, leaves no gravestone.
    // HIT_AND_RUN → can re-position after striking (mirrors Knight Rider).
    // FLYING → traverses canyon/water and shrugs off knockback over them.
    tags: [UnitTag.SUMMONED, UnitTag.HIT_AND_RUN, UnitTag.FLYING, UnitTag.READY, UnitTag.RANGED],
    cost: { iron: 0, wood: 0, crystals: 3 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_2, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
      { xpRequired: LEVEL_UP_VALUES.XP_TO_LEVEL_3, boosts: [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }] },
    ],
  },

  CRYSTAL_KHYRON: {
    // Recruited (not summoned) from a resonating Crystal Chamber for Arcane Crystals.
    // Progresses only through Resonant Assimilation, never through XP, so levelUp is empty.
    maxHp: 100, attack: 45, defense: 45,
    movementActions: 1, moveRange: 1, attackRange: 1,
    discoverRadius: 1, triggerRange: 0,
    tags: [],
    cost: { iron: 0, wood: 0, crystals: 2 },
    populationCost: { farmers: 0, nobles: 0 },
    levelUp: [],
  },
};

/**
 * Crystal Khyron progression tunables.
 * TRANSFERABLE_TAGS is the single source of truth for which enemy tags a
 * resonating Khyron permanently inherits on its first kill.
 */
export const CRYSTAL_KHYRON = {
  MAX_LEVEL: 3,
  TRANSFERABLE_TAGS: [
    UnitTag.CLEAVE,
    UnitTag.PIERCE,
    UnitTag.RAGE,
    UnitTag.ALERT,
    UnitTag.IRONBLOOD,
    UnitTag.BLOCK,
    UnitTag.PUNCTURE,
    UnitTag.BURN,
  ] as readonly UnitTag[],
} as const;

// Text parameter values mirror the gameplay definitions and named config constants.
{
  const u = UNIT_DEFINITIONS;
  u.ARCHER.textParams = { attackRange: u.ARCHER.attackRange };
  u.CROSSBOWMAN.textParams = {
    attackRange: u.CROSSBOWMAN.attackRange,
    reloadPenalty: ABILITIES.RELOAD_DEF_PENALTY_PCT,
  };
  u.RIDER.textParams = { moveRange: u.RIDER.moveRange };
  u.SIEGE.textParams = { attackRange: u.SIEGE.attackRange };
  u.LAVA_ARCHER.textParams = { attackRange: u.LAVA_ARCHER.attackRange };
  u.LAVA_RIDER.textParams = { moveRange: u.LAVA_RIDER.moveRange };
  u.LAVA_SIEGE.textParams = { attackRange: u.LAVA_SIEGE.attackRange };
  u.EMBERLING.textParams = {
    emberGain: ABILITIES.EMBERLING_EMBER_GAIN,
    explosionDamage: u.EMBERLING.explosionDamage!,
    adjacencyRange: ABILITIES.ADJACENCY_RANGE,
  };
  u.MAGE.textParams = { attackRange: u.MAGE.attackRange, spellsPerTurn: MAGE.SPELLS_PER_TURN };
  u.GARGOYLE.textParams = { moveRange: u.GARGOYLE.moveRange };
  u.RIFTWORM.textParams = {
    tunnelRangeMin: ABILITIES.TUNNEL_RANGE_MIN,
    tunnelRangeMax: ABILITIES.TUNNEL_RANGE_MAX,
    emergenceDamage: ABILITIES.TUNNEL_EMERGE_DAMAGE,
  };
  u.GRIMBEAK.textParams = { summonedDamageMultiplier: ABILITIES.GRIMBEAK_SUMMONED_DAMAGE_MULTIPLIER };
}

// ============================================================================
