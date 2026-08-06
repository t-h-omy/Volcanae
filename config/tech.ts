/**
 * Tech tree crystal income constants, research cost function, and tech tree definitions.
 */

import { BuildingType, ResourceType, SpellId, TechFlag, UnitTag, UnitType } from '../src/types';
import type { TechNodeDefinition } from '../src/types';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';
import { RESOURCES } from './economy';
import { BUILDING_DEFINITIONS } from './buildings';
import { UNIT_DEFINITIONS } from './units';


export const TECH = {
  /** Number of crystals granted at game start (before first lava consumption) */
  CRYSTALS_ON_GAME_START: 2,
  /** Number of crystals granted each time a player building is consumed by lava */
  CRYSTALS_ON_LAVA_CONSUMPTION: 0,
  /** Number of crystals granted each time the player captures a new zone stronghold */
  CRYSTALS_ON_ZONE_STRONGHOLD: 0,
} as const;

/**
 * Compute the actual crystal cost to research a tech node at the current ember level.
 * Actual cost = baseCost + ember.
 */
export function computeResearchCost(baseCost: number, ember: number): number {
  return baseCost + ember;
}


/**
 * Tech tree node definitions.
 * Add a new tech node by adding one entry to this array - no logic files
 * touched, no switch statements updated, no hardcoded references.
 *
 * Description authoring: see the DESCRIPTION AUTHORING RULE comment above the
 * ABILITIES constant. All numbers in `description` strings must reference
 * ABILITIES (or another named config constant) via template literals.
 */
export const TECH_TREE: TechNodeDefinition[] = [
  // ── Root node (auto-unlocked at game start, not a pick) ──
  {
    id: 'CONSCRIPTION',
    name: 'Conscription',
    description: 'Basic military infrastructure',
    requires: [],
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.BARRACKS },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.FARM },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.CRYSTAL_CHAMBER },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SPEARMAN },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SCOUT },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.GUARD },
    ],
  },

  // ── Branch 1: Nobility ──
  {
    id: 'A_NOBLE_STEAD',
    name: 'A Noble Stead',
    description: 'Attract the upper class and field swift cavalry',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.PATRICIANHOUSE },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.RIDER_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.RIDER },
    ],
  },
  {
    // Placed beside DEEP_VEINS - both require A_NOBLE_STEAD and both buff mines
    // with iron production, making them natural thematic siblings on the tree.
    id: 'CHARCOAL_KILN',
    name: 'Charcoal Kiln',
    description: `Unlocks the Charcoal Kiln, which grants +${RESOURCES.CHARCOAL_KILN_IRON_BONUS} iron per turn per in-range kiln to nearby mines and deep mines.`,
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.CHARCOAL_KILN },
    ],
  },

  // ── Branch 2: Ranged ──
  {
    id: 'FAR_REACH',
    name: 'Far Reach',
    description: 'Establish archery ranges and train bowmen',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.ARCHER_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.ARCHER },
    ],
  },
  {
    id: 'CROSSBOWMEN',
    name: 'Crossbowmen',
    description: 'Train armor-piercing crossbowmen at your archery ranges',
    requires: ['FAR_REACH'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_UNIT', unitType: UnitType.CROSSBOWMAN },
    ],
  },
  {
    id: 'SIEGE_WORKS',
    name: 'Siege Works',
    description: 'Build Siege Camps and field devastating siege engines',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.SIEGE_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SIEGE },
    ],
  },
  {
    id: 'CLEAN_CUTS',
    name: 'Clean Cuts',
    description: `Woodcutters have a ${ABILITIES.CLEAN_CUTS_BONUS_CHANCE}% chance to produce ${ABILITIES.CLEAN_CUTS_BONUS_AMOUNT} extra wood per turn`,
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.WOODCUTTER, resource: ResourceType.WOOD, chancePercent: ABILITIES.CLEAN_CUTS_BONUS_CHANCE, amount: ABILITIES.CLEAN_CUTS_BONUS_AMOUNT },
    ],
  },
  {
    id: 'TO_THE_FRONT',
    name: 'To the Front',
    description: `Units more than ${ABILITIES.TO_THE_FRONT_MIN_DISTANCE} tiles behind the front gain +${ABILITIES.TO_THE_FRONT_MOVE_BONUS} movement range`,
    requires: ['CLEAN_CUTS'],
    cost: 7,
    effects: [
      { type: 'FLAG', flag: TechFlag.TO_THE_FRONT },
    ],
  },

  // ── Branch 3: Fortification ──
  {
    id: 'FIELD_DUTIES',
    name: 'Field Duties',
    description: 'Guards can now construct and capture like builders',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.BUILDANDCAPTURE },
    ],
  },
  {
    id: 'HOLD_GROUND',
    name: 'Hold Ground',
    description: `Units on own buildings gain +${ABILITIES.HOLD_GROUND_DEFENSE_BONUS} defense`,
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'FLAG', flag: TechFlag.HOLD_GROUND },
    ],
  },
  {
    id: 'FIELDWORK',
    name: 'Fieldwork',
    description: `Spearmen and Swordsmen can sacrifice themselves to build an Outpost (${BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood} wood; starting HP = unit HP × ${ABILITIES.FIELDWORK_HP_MULTIPLIER})`,
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SPEARMAN, tag: UnitTag.FIELDWORK },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.FIELDWORK },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SPEARMAN, resource: 'wood', amount: 1 },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SWORDSMAN, resource: 'wood', amount: 1 },
    ],
  },
  {
    id: 'UNLOCK_SWORDSMAN',
    name: 'Swordsman Training',
    description: 'Unlocks the Swordsman - elite heavy infantry with superior attack and defense - recruitable at the Barracks. Swordsman recruitment costs +2 iron.',
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_UNIT', unitType: UnitType.SWORDSMAN },
      { type: 'UNIT_COST_MOD', unitType: UnitType.SWORDSMAN, resource: 'iron', amount: 1 },
    ],
  },
  {
    id: 'SWORDSMAN_CLEAVE',
    name: 'Cleaving Strike',
    description: `Swordsmen learn to cleave through enemies: on hit, they deal ${ABILITIES.CLEAVE_DAMAGE_MULTIPLIER * 100}% damage to all enemy units adjacent to both attacker and defender (ignores Phalanx defense)`,
    requires: ['UNLOCK_SWORDSMAN'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.CLEAVE },
    ],
  },
  {
    id: 'PHALANX_FORMATION',
    name: 'Phalanx Formation',
    description: `Guards in formation grant +${ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER} defense to each adjacent ally and gain +${ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY} attack per adjacent ally`,
    requires: ['HOLD_GROUND'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.PHALANX },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.GUARD, resource: 'iron', amount: 1 },
    ],
  },

  // ── Branch 4: Reconnaissance ──
  {
    id: 'BIG_EYES',
    name: 'Big Eyes',
    description: `Scouts gain +${ABILITIES.SCOUT_DISCOVER_BONUS} discover radius, seeing further into the fog`,
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'discoverRadius', mode: 'add', value: ABILITIES.SCOUT_DISCOVER_BONUS },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'wood', amount: 1 },
    ],
  },
  {
    id: 'ASSASSIN',
    name: 'Assassin',
    description: `Scouts deal ${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}× damage and receive no retaliation when striking a full-HP enemy`,
    requires: ['BIG_EYES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.ASSASSIN },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'iron', amount: 1 },
    ],
  },
  {
    id: 'PATCH_UP',
    name: 'Patch Up',
    description: `Scouts can spend their action to restore ${ABILITIES.PATCHUP_HEAL_AMOUNT} HP on one adjacent friendly unit`,
    requires: ['BIG_EYES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.PATCHUP },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'wood', amount: 2 },
    ],
  },
  {
    id: 'BRIDGEBUILDER',
    name: 'Bridgebuilder',
    description:
      `Scouts can build a Bridge (${BUILDING_DEFINITIONS.BRIDGE.constructionCost.wood} wood) ` +
      `across a 1-tile canyon gap between two land tiles`,
    requires: ['BIG_EYES'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.BRIDGE_BUILDER },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.BRIDGE },
    ],
  },

  // ── Branch 5: Stronghold Development ──
  {
    id: 'WALLED_SETTLEMENT',
    name: 'Walled Settlement',
    description: `Strongholds gain +${ABILITIES.WALLED_SETTLEMENT_FARMER_BONUS} farmer capacity. Produces +${ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT} iron and +${ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT} wood per turn (flat, once - requires at least one Stronghold)`,
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'farmer', amount: ABILITIES.WALLED_SETTLEMENT_FARMER_BONUS },
      { type: 'FLAT_INCOME_MOD', resource: ResourceType.WOOD, amount: ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT, requiresBuilding: BuildingType.STRONGHOLD },
      { type: 'FLAT_INCOME_MOD', resource: ResourceType.IRON, amount: ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT, requiresBuilding: BuildingType.STRONGHOLD },
    ],
  },
  {
    // Placed after WALLED_SETTLEMENT - an advanced mining technique that
    // unlocks the Deep Mine, a more productive alternative to the standard Mine on mountains.
    id: 'DEEP_MINING',
    name: 'Deep Mining',
    description: `Unlocks the Deep Mine, which produces ${RESOURCES.DEEP_MINE_IRON_PER_TURN} iron per turn (vs ${RESOURCES.MINE_IRON_PER_TURN} for a standard Mine) - delving deeper into mountains for richer ore veins.`,
    requires: ['WALLED_SETTLEMENT'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.DEEP_MINE },
    ],
  },
  {
    id: 'CITADEL',
    name: 'Citadel',
    description: `Grants +${ABILITIES.CITADEL_NOBLE_BONUS} noble capacity to Strongholds and boosts Scout and Guard max HP by +${ABILITIES.CITADEL_HP_BOOST}`,
    requires: ['WALLED_SETTLEMENT'],
    cost: 4,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'noble', amount: ABILITIES.CITADEL_NOBLE_BONUS },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'maxHp', mode: 'add', value: ABILITIES.CITADEL_HP_BOOST },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.GUARD, stat: 'maxHp', mode: 'add', value: ABILITIES.CITADEL_HP_BOOST },
    ],
  },
  {
    id: 'NOBLE_HERITAGE',
    name: 'Noble Heritage',
    description: `Grants the ELITE tag to Riders, Guards, and Siege engines - each gaining +${ABILITIES.ELITE_MAX_HP_BONUS} max HP`,
    requires: ['CITADEL'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE,  tag: UnitTag.ELITE },
    ],
  },
  {
    id: 'MASTER_RECRUITER',
    name: 'Master Recruiter',
    description: 'Unlocks a third specialist slot.',
    requires: ['NOBLE_HERITAGE'],
    cost: 6,
    effects: [
      { type: 'SPECIALIST_SLOT_MOD', value: 1 },
    ],
  },

  // ── Branch 1 (Cavalry) deep upgrades ──────────────────────────────────────
  {
    id: 'LANCE_CHARGE',
    name: 'Lance Charge',
    description: `Riders gain +${ABILITIES.LANCE_CHARGE_ATTACK_BONUS} attack when striking without having moved this turn`,
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.LANCE_CHARGE },
      { type: 'REMOVE_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.BUILDANDCAPTURE },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'KNIGHTS',
    name: 'Knights',
    description: `Heavily armoured cavalry with +${ABILITIES.KNIGHT_MAX_HP_BONUS} max HP`,
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.KNIGHT },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 1 },
    ],
  },
  {
    id: 'HIT_AND_RUN',
    name: 'Hit and Run',
    description: `Riders can move twice: once before attacking and once after (max ${ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE} tile post-attack); DEF is reduced by ${Math.abs(ABILITIES.HIT_AND_RUN_DEFENSE_MOD)} as a trade-off`,
    requires: ['LANCE_CHARGE'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.HIT_AND_RUN },
      { type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 1 },
    ],
  },
  {
    id: 'OUTRIDERS',
    name: 'Outriders',
    description: `Fast raiding cavalry with +${ABILITIES.OUTRIDER_MOVE_BONUS} movement range`,
    requires: ['KNIGHTS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.OUTRIDER },
      { type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 1 },
    ],
  },

  // ── Branch 2 (Ranged) deep upgrades ───────────────────────────────────────
  {
    id: 'COVER',
    name: 'Cover',
    description: 'Ranged enemy units cannot counter-attack.',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER,      tag: UnitTag.COVER },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.CROSSBOWMAN, tag: UnitTag.COVER },
    ],
  },
  {
    id: 'SKIRMISHER',
    name: 'Skirmisher',
    description: `Archers gain +${ABILITIES.SKIRMISHER_MOVE_BONUS} movement range`,
    requires: ['COVER'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.SKIRMISHER },
    ],
  },
  {
    id: 'PIN_DOWN',
    name: 'Pin Down',
    description: `Archer hits have a ${Math.round(ABILITIES.PIN_DOWN_STUN_CHANCE * 100)}% chance to stun the target for one turn - it cannot move or attack`,
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.PIN_DOWN },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.ARCHER, resource: 'iron', amount: 2 },
    ],
  },
  {
    id: 'DISTRACTION',
    name: 'Distraction',
    description: `Each archer hit permanently reduces the target's DEF by ${ABILITIES.DISTRACTION_DEF_REDUCTION}. Archers carrying this tag have their own ATK reduced by ${Math.abs(ABILITIES.DISTRACTION_ATTACK_MOD)}`,
    requires: ['PIN_DOWN'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.DISTRACTION },
    ],
  },

  // ── Branch 3 (Fortification) deep upgrade ─────────────────────────────────
  {
    id: 'PREVENTIVE_STRIKE',
    name: 'Preventive Strike',
    description: `Siege engines automatically fire once per enemy turn at the first enemy unit that moves from outside into their attack range, dealing ${ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT}% of their normal attack damage`,
    requires: ['SIEGE_WORKS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE, tag: UnitTag.PREVENTIVE_STRIKE },
      { type: 'UNIT_COST_MOD',  unitType: UnitType.SIEGE, resource: 'wood', amount: 2 },
    ],
  },

  // ── Branch 6: Magic - root and 3 specialization paths ────────────────────
  {
    id: 'ARCANE_AWAKENING',
    name: 'Arcane Awakening',
    description: `Unlocks the Mage unit (recruited from active Crystal Chambers), the Transpose spell, and the Frostcraft spell.`,
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_UNIT',  unitType: UnitType.MAGE },
      { type: 'UNLOCK_SPELL', spellId: SpellId.TRANSPOSE },
      { type: 'UNLOCK_SPELL', spellId: SpellId.FROSTCRAFT },
    ],
  },

  // ── Summoner path ────────────────────────────────────────────────────────
  {
    id: 'EMBERBIND',
    name: 'Emberbind',
    description: `Unlocks the Emberbind spell.`,
    requires: ['BRANDMARK_HEAL'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.EMBERBIND },
    ],
  },
  {
    id: 'BRANDMARK_HEAL',
    name: 'Brandmark Heal',
    description: `Unlocks the Brandmark Heal spell.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.BRANDMARK_HEAL },
    ],
  },
  {
    id: 'CRYSTAL_TOWER',
    name: 'Crystal Tower',
    description: 'Unlocks the Crystal Tower spell and Crystal Tower building.',
    requires: ['EMBERBIND'],
    cost: 7,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.CRYSTAL_TOWER },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.CRYSTAL_TOWER },
    ],
  },
  // ── Conjurer path branch: Crystal Cave ───────────────────────────────────
  // Hangs directly off ARCANE_AWAKENING (parallel to BRANDMARK_HEAL and
  // RAISE_SKELETON, not gated behind EMBERBIND/CRYSTAL_TOWER). Unlocks
  // the Crystal Cave spell which conjures the cave building on a mountain
  // tile in range; the cave can then recruit a single life-bound Crystal
  // Drake during a resonance window.
  {
    id: 'CRYSTAL_CAVE',
    name: 'Crystal Cave',
    description: `Unlocks the Crystal Cave spell and the Crystal Drake unit.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.CRYSTAL_CAVE },
      { type: 'UNLOCK_UNIT',  unitType: UnitType.CRYSTAL_DRAKE },
    ],
  },

  // ── Necromancer path ─────────────────────────────────────────────────────
  {
    id: 'RAISE_SKELETON',
    name: 'Raise Skeleton',
    description: `Unlocks the Raise Skeleton spell and the Skeleton unit. Spearmen, Scouts, and Guards now leave Gravestones on death.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_UNIT',  unitType: UnitType.SKELETON },
      { type: 'UNLOCK_SPELL', spellId: SpellId.RAISE_SKELETON },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SPEARMAN, tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT,    tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD,    tag: UnitTag.LEAVES_GRAVESTONE },
    ],
  },
  // ── Necromancer path branch a: utility ──────────────────────────────────
  {
    id: 'GRAVE_TRAP',
    name: 'Grave Trap',
    description: `Unlocks the Grave Trap spell.`,
    requires: ['RAISE_SKELETON'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.GRAVE_TRAP },
    ],
  },
  {
    id: 'GRAVE_HARVEST',
    name: 'Grave Harvest',
    description: `Each player-owned Gravestone has a ${MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE}% chance per turn to grant 1 arcane crystal.`,
    requires: ['GRAVE_TRAP'],
    cost: 7,
    effects: [
      { type: 'FLAG', flag: TechFlag.GRAVE_HARVEST },
    ],
  },
  // ── Necromancer path branch b: gravestone expansion ──────────────────────
  {
    id: 'GRAVE_WARRIORS',
    name: 'Grave Warriors',
    description: `Riders, Swordsmen, and Archers now leave Gravestones on death.`,
    requires: ['RAISE_SKELETON'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER,    tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER,   tag: UnitTag.LEAVES_GRAVESTONE },
    ],
  },
  {
    id: 'GRAVE_ENGINES',
    name: 'Grave Engines',
    description: `Siege engines and Mages now leave Gravestones on death.`,
    requires: ['GRAVE_WARRIORS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE, tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.MAGE,  tag: UnitTag.LEAVES_GRAVESTONE },
    ],
  },

  // ── Elementalist path ────────────────────────────────────────────────────
  {
    id: 'EXPLODE',
    name: 'Explode',
    description: `Unlocks the Explode spell.`,
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.EXPLODE },
    ],
  },
  {
    id: 'SPELL_REACH',
    name: 'Spell Reach',
    description: `Increases the Mage's attack range by +${MAGE.SPELL_RANGE_BONUS} (to ${UNIT_DEFINITIONS.MAGE.attackRange + MAGE.SPELL_RANGE_BONUS} tiles).`,
    requires: ['EXPLODE'],
    cost: 7,
    effects: [
      { type: 'UNIT_STAT_MOD', unitType: UnitType.MAGE, stat: 'attackRange', mode: 'add', value: MAGE.SPELL_RANGE_BONUS },
    ],
  },

];

