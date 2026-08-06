/**
 * Unit type interface, unit cost interface, and unit definitions.
 * Includes post-declaration description-mutation blocks that interpolate
 * live stat values and ABILITIES constants into description strings.
 */

import { UnitTag, UnitType } from '../src/types';
import type { UnitLevelDefinition } from '../src/types';
import { LEVEL_UP_VALUES } from './progression';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';


/** All data for a single unit type, combining stats, tags, costs and UI descriptions. */
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

  // ── UI ───────────────────────────────────────────────────────────────────
  description: string;
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
 * Description authoring: see the DESCRIPTION AUTHORING RULE above the ABILITIES
 * constant. Descriptions that must reference the unit's own stats (attackRange,
 * moveRange, etc.) or config constants are set in the "Compute descriptions for
 * UNIT_DEFINITIONS" block below - use placeholder text here that contains NO
 * hardcoded balancing numbers (mark with `// overwritten below`).
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
    description: 'Versatile foot soldier that can move, fight, build structures, and capture enemy buildings.',
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
    description: 'Heavy infantry with superior combat strength. Unlocked by the Swordsman Training tech. Cleave can be researched separately.',
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
    description: 'Ranged attacker that strikes from range without stepping into melee.', // overwritten below
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
    description: 'Armor-piercing ranged attacker.', // overwritten below
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
    description: 'Swift cavalry that outflanks and pressures the enemy.', // overwritten below
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
    description: 'Long-range bombard; cannot fire in the same turn it moves.', // overwritten below
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
    description: 'Light and fast explorer. Can gain special abilities through technology upgrades.',
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
    description: 'Heavily armored defender with high defense; cannot attack in the same turn it moves.',
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
    description: 'Standard enemy foot soldier. Can corrupt terrain to create hostile buildings.',
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
    description: 'Enemy ranged unit that attacks from range.', // overwritten below
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
    description: 'Enemy fast cavalry.', // overwritten below
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
    description: 'Enemy long-range bombard.', // overwritten below
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
    description: 'Brutal cluster-breaker. Cleaves into adjacent enemies and grows stronger when surrounded.',
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
    description: 'Fast lancer that pierces through front lines, dealing full damage to units behind the target. Immune to stun.',
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
    description: 'Heavily armored brute that ignores defensive bonuses and stuns heavily armored targets. Resistant to melee damage.',
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
    description: 'Ranged firestarter that scorches the target\'s tile.',
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
    description: 'Resilient lava beast that resists damage from summoned units, deals extra damage to them, and prioritises attacking summoned units. Grows enraged in dense clusters.', // description interpolated below once GRIMBEAK_SUMMONED_DAMAGE_MULTIPLIER is defined
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
    description: 'Tunneling enemy unit.', // overwritten below
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
    description: 'Glass-cannon caster that opens portals behind the player line, allowing enemy units to teleport into the backline.',
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
    description: 'Fragile fire spirit that walks toward lava. Explodes when it cannot move closer to lava.', // overwritten below
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
    description: 'A monstrous creature that emerged from deep within a mountain cave.',
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
    description: 'Arcane caster that casts spells instead of attacking. Recruited from active Crystal Chambers.', // overwritten below
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
    description: 'Powerful demonic unit..', // overwritten below
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
    description: 'Undead warrior raised from a gravestone.', // overwritten below
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
    description: 'Flying skeletal gargoyle raised from a gravestone.', // overwritten below
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
    description: 'Flying summon bound to its Crystal Cave.', // overwritten below
  },
};


// Compute descriptions for UNIT_DEFINITIONS entries that reference their own stats.
// All numeric values here are read from the unit definition or ABILITIES - never
// hardcoded literals. See the DESCRIPTION AUTHORING RULE above ABILITIES.
{
  const u = UNIT_DEFINITIONS;
  u.ARCHER.description      = `Ranged attacker that strikes from ${u.ARCHER.attackRange} tiles away without stepping into melee range.`;
  u.CROSSBOWMAN.description =
    `Armor-piercing ranged attacker with ${u.CROSSBOWMAN.attackRange}-tile reach: ignores the target's defensive bonuses and stuns heavily-armored foes. ` +
    `After firing, its own DEF drops ${ABILITIES.RELOAD_DEF_PENALTY_PCT}% until its next turn.`;
  u.RIDER.description       = `Swift cavalry that covers ${u.RIDER.moveRange} tiles per move to outflank and pressure the enemy.`;
  u.SIEGE.description       = `Long-range bombard with ${u.SIEGE.attackRange}-tile reach; cannot fire in the same turn it moves.`;
  u.LAVA_ARCHER.description = `Enemy ranged unit that attacks from ${u.LAVA_ARCHER.attackRange} tiles away.`;
  u.LAVA_RIDER.description  = `Enemy fast cavalry that covers ${u.LAVA_RIDER.moveRange} tiles per move.`;
  u.LAVA_SIEGE.description  = `Enemy long-range bombard with ${u.LAVA_SIEGE.attackRange}-tile reach.`;
  u.EMBERLING.description   = `Fragile fire spirit that walks toward lava. Explodes on death, dealing ${u.EMBERLING.explosionDamage} damage to all units within 1 tile.`;
  u.MAGE.description        = `Arcane caster that casts spells instead of attacking, with ${u.MAGE.attackRange}-tile range and ${MAGE.SPELLS_PER_TURN} spell cast${MAGE.SPELLS_PER_TURN !== 1 ? 's' : ''} per turn. Recruited from active Crystal Chambers.`;
  u.EMBER_DEMON.description = `Powerful demonic unit.`;
  u.SKELETON.description    = `Undead warrior raised from a gravestone.`;
  u.GARGOYLE.description    = `Flying skeletal gargoyle raised from a Gravestone. Melee attacker that flies ${u.GARGOYLE.moveRange} tiles over canyons and water.`;
  u.CRYSTAL_DRAKE.description = `A flying Drake summoned at a Crystal Cave. If its Crystal Cave is lost, the drake dies.`;
}

// Compute descriptions for UNIT_DEFINITIONS entries that reference TUNNEL constants.
UNIT_DEFINITIONS.RIFTWORM.description = `Digs underground and re-emerges ${ABILITIES.TUNNEL_RANGE_MIN}–${ABILITIES.TUNNEL_RANGE_MAX} tiles south in the same column, avoiding resource terrain and other riftworms' planned exits. Digging in requires open ground (no buildings, ruins, forest or mountain). On emergence, deals ${ABILITIES.TUNNEL_EMERGE_DAMAGE} damage to all adjacent player units and corrupts the tile.`;
// Compute Grimbeak description referencing the summoned-damage multiplier.
UNIT_DEFINITIONS.GRIMBEAK.description = `Resilient lava beast that resists damage from summoned units, deals ${ABILITIES.GRIMBEAK_SUMMONED_DAMAGE_MULTIPLIER}× damage to them, and prioritises attacking summoned units. Grows enraged in dense clusters.`;
// ============================================================================

