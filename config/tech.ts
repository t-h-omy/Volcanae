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
 * Display text lives in src/i18n/locales/en.json. Numeric values are supplied
 * by textParams backed by named config constants.
 */
export const TECH_TREE: TechNodeDefinition[] = [
  // ── Root node (auto-unlocked at game start, not a pick) ──
  {
    id: 'CONSCRIPTION',
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
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.CHARCOAL_KILN },
    ],
  
    textParams: { ironBonus: RESOURCES.CHARCOAL_KILN_IRON_BONUS },
  },

  // ── Branch 2: Ranged ──
  {
    id: 'FAR_REACH',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.ARCHER_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.ARCHER },
    ],
  },
  {
    id: 'CROSSBOWMEN',
    requires: ['FAR_REACH'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_UNIT', unitType: UnitType.CROSSBOWMAN },
    ],
  },
  {
    id: 'SIEGE_WORKS',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.SIEGE_CAMP },
      { type: 'UNLOCK_UNIT',     unitType: UnitType.SIEGE },
    ],
  },
  {
    id: 'CLEAN_CUTS',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'BUILDING_PRODUCTION_MOD', buildingType: BuildingType.WOODCUTTER, resource: ResourceType.WOOD, chancePercent: ABILITIES.CLEAN_CUTS_BONUS_CHANCE, amount: ABILITIES.CLEAN_CUTS_BONUS_AMOUNT },
    ],
  
    textParams: { chance: ABILITIES.CLEAN_CUTS_BONUS_CHANCE, amount: ABILITIES.CLEAN_CUTS_BONUS_AMOUNT },
  },
  {
    id: 'TO_THE_FRONT',
    requires: ['CLEAN_CUTS'],
    cost: 7,
    effects: [
      { type: 'FLAG', flag: TechFlag.TO_THE_FRONT },
    ],
  
    textParams: { distance: ABILITIES.TO_THE_FRONT_MIN_DISTANCE, moveBonus: ABILITIES.TO_THE_FRONT_MOVE_BONUS },
  },

  // ── Branch 3: Fortification ──
  {
    id: 'FIELD_DUTIES',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.BUILDANDCAPTURE },
    ],
  },
  {
    id: 'HOLD_GROUND',
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'FLAG', flag: TechFlag.HOLD_GROUND },
    ],
  
    textParams: { defenseBonus: ABILITIES.HOLD_GROUND_DEFENSE_BONUS },
  },
  {
    id: 'FIELDWORK',
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SPEARMAN, tag: UnitTag.FIELDWORK },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.FIELDWORK },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.SPEARMAN, resource: 'wood', amount: 1 },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.SWORDSMAN, resource: 'wood', amount: 1 },
    ],
  
    textParams: { woodCost: BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood, hpMultiplier: ABILITIES.FIELDWORK_HP_MULTIPLIER },
  },
  {
    id: 'UNLOCK_SWORDSMAN',
    requires: ['FIELD_DUTIES'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_UNIT', unitType: UnitType.SWORDSMAN },
      //{ type: 'UNIT_COST_MOD', unitType: UnitType.SWORDSMAN, resource: 'iron', amount: 1 },
    ],
  
    textParams: { ironCost: ABILITIES.SWORDSMAN_RECRUIT_IRON_COST },
  },
  {
    id: 'SWORDSMAN_CLEAVE',
    requires: ['UNLOCK_SWORDSMAN'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.CLEAVE },
    ],
  
    textParams: { damagePercent: ABILITIES.CLEAVE_DAMAGE_MULTIPLIER * 100 },
  },
  {
    id: 'PHALANX_FORMATION',
    requires: ['HOLD_GROUND'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD, tag: UnitTag.PHALANX },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.GUARD, resource: 'iron', amount: 1 },
    ],
  
    textParams: { defenseBonus: ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER, attackBonus: ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY },
  },

  // ── Branch 4: Reconnaissance ──
  {
    id: 'BIG_EYES',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'discoverRadius', mode: 'add', value: ABILITIES.SCOUT_DISCOVER_BONUS },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'wood', amount: 1 },
    ],
  
    textParams: { discoverBonus: ABILITIES.SCOUT_DISCOVER_BONUS },
  },
  {
    id: 'ASSASSIN',
    requires: ['BIG_EYES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.ASSASSIN },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'iron', amount: 1 },
    ],
  
    textParams: { damageMultiplier: ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER },
  },
  {
    id: 'PATCH_UP',
    requires: ['BIG_EYES'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.PATCHUP },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.SCOUT, resource: 'wood', amount: 2 },
    ],
  
    textParams: { healAmount: ABILITIES.PATCHUP_HEAL_AMOUNT },
  },
  {
    id: 'BRIDGEBUILDER',
    requires: ['BIG_EYES'],
    cost: 3,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SCOUT, tag: UnitTag.BRIDGE_BUILDER },
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.BRIDGE },
    ],
  
    textParams: { woodCost: BUILDING_DEFINITIONS.BRIDGE.constructionCost.wood, gapTiles: ABILITIES.BRIDGEBUILDER_GAP_TILES },
  },

  // ── Branch 5: Stronghold Development ──
  {
    id: 'WALLED_SETTLEMENT',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'farmer', amount: ABILITIES.WALLED_SETTLEMENT_FARMER_BONUS },
      { type: 'FLAT_INCOME_MOD', resource: ResourceType.WOOD, amount: ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT, requiresBuilding: BuildingType.STRONGHOLD },
      { type: 'FLAT_INCOME_MOD', resource: ResourceType.IRON, amount: ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT, requiresBuilding: BuildingType.STRONGHOLD },
    ],
  
    textParams: { farmerBonus: ABILITIES.WALLED_SETTLEMENT_FARMER_BONUS, ironAmount: ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT, woodAmount: ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT },
  },
  {
    // Placed after WALLED_SETTLEMENT - an advanced mining technique that
    // unlocks the Deep Mine, a more productive alternative to the standard Mine on mountains.
    id: 'DEEP_MINING',
    requires: ['WALLED_SETTLEMENT'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_BUILDING', buildingType: BuildingType.DEEP_MINE },
    ],
  
    textParams: { deepMineIron: RESOURCES.DEEP_MINE_IRON_PER_TURN, mineIron: RESOURCES.MINE_IRON_PER_TURN },
  },
  {
    id: 'CITADEL',
    requires: ['WALLED_SETTLEMENT'],
    cost: 4,
    effects: [
      { type: 'STRONGHOLD_CAP_MOD', capType: 'noble', amount: ABILITIES.CITADEL_NOBLE_BONUS },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.SCOUT, stat: 'maxHp', mode: 'add', value: ABILITIES.CITADEL_HP_BOOST },
      { type: 'UNIT_STAT_MOD', unitType: UnitType.GUARD, stat: 'maxHp', mode: 'add', value: ABILITIES.CITADEL_HP_BOOST },
    ],
  
    textParams: { nobleBonus: ABILITIES.CITADEL_NOBLE_BONUS, hpBoost: ABILITIES.CITADEL_HP_BOOST },
  },
  {
    id: 'NOBLE_HERITAGE',
    requires: ['CITADEL'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.GUARD,  tag: UnitTag.ELITE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE,  tag: UnitTag.ELITE },
    ],
  
    textParams: { hpBonus: ABILITIES.ELITE_MAX_HP_BONUS },
  },
  {
    id: 'MASTER_RECRUITER',
    requires: ['NOBLE_HERITAGE'],
    cost: 6,
    effects: [
      { type: 'SPECIALIST_SLOT_MOD', value: 1 },
    ],
  
    textParams: { slotCount: ABILITIES.MASTER_RECRUITER_SLOT_COUNT },
  },

  // ── Branch 1 (Cavalry) deep upgrades ──────────────────────────────────────
  {
    id: 'LANCE_CHARGE',
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.LANCE_CHARGE },
      { type: 'REMOVE_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.BUILDANDCAPTURE },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 2 },
    ],
  
    textParams: { attackBonus: ABILITIES.LANCE_CHARGE_ATTACK_BONUS },
  },
  {
    id: 'KNIGHTS',
    requires: ['A_NOBLE_STEAD'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER, tag: UnitTag.KNIGHT },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.RIDER, resource: 'iron', amount: 1 },
    ],
  
    textParams: { maxHpBonus: ABILITIES.KNIGHT_MAX_HP_BONUS },
  },
  {
    id: 'HIT_AND_RUN',
    requires: ['LANCE_CHARGE'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.HIT_AND_RUN },
      //{ type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 1 },
    ],
  
    textParams: { moveCount: ABILITIES.HIT_AND_RUN_MOVE_COUNT, postAttackMoveRange: ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE, defensePenalty: Math.abs(ABILITIES.HIT_AND_RUN_DEFENSE_MOD) },
  },
  {
    id: 'OUTRIDERS',
    requires: ['KNIGHTS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG',  unitType: UnitType.RIDER, tag: UnitTag.OUTRIDER },
      //{ type: 'UNIT_COST_MOD',   unitType: UnitType.RIDER, resource: 'wood', amount: 1 },
    ],
  
    textParams: { moveBonus: ABILITIES.OUTRIDER_MOVE_BONUS },
  },

  // ── Branch 2 (Ranged) deep upgrades ───────────────────────────────────────
  {
    id: 'COVER',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER,      tag: UnitTag.COVER },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.CROSSBOWMAN, tag: UnitTag.COVER },
    ],
  },
  {
    id: 'SKIRMISHER',
    requires: ['COVER'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.SKIRMISHER },
    ],
  
    textParams: { moveBonus: ABILITIES.SKIRMISHER_MOVE_BONUS },
  },
  {
    id: 'PIN_DOWN',
    requires: ['FAR_REACH'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.PIN_DOWN },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.ARCHER, resource: 'iron', amount: 2 },
    ],
  
    textParams: { stunChancePct: Math.round(ABILITIES.PIN_DOWN_STUN_CHANCE * 100), stunTurns: ABILITIES.PIN_DOWN_STUN_TURNS },
  },
  {
    id: 'DISTRACTION',
    requires: ['PIN_DOWN'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER, tag: UnitTag.DISTRACTION },
    ],
  
    textParams: { defenseReduction: ABILITIES.DISTRACTION_DEF_REDUCTION, attackReduction: Math.abs(ABILITIES.DISTRACTION_ATTACK_MOD) },
  },

  // ── Branch 3 (Fortification) deep upgrade ─────────────────────────────────
  {
    id: 'PREVENTIVE_STRIKE',
    requires: ['SIEGE_WORKS'],
    cost: 7,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SIEGE, tag: UnitTag.PREVENTIVE_STRIKE },
      //{ type: 'UNIT_COST_MOD',  unitType: UnitType.SIEGE, resource: 'wood', amount: 2 },
    ],
  
    textParams: { shotsPerTurn: ABILITIES.PREVENTIVE_STRIKE_SHOTS_PER_TURN, damagePercent: ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT },
  },

  // ── Branch 6: Magic - root and 3 specialization paths ────────────────────
  {
    id: 'ARCANE_AWAKENING',
    requires: ['CONSCRIPTION'],
    cost: 2,
    effects: [
      { type: 'UNLOCK_UNIT',  unitType: UnitType.MAGE },
      { type: 'UNLOCK_SPELL', spellId: SpellId.TRANSPOSE },
      { type: 'UNLOCK_SPELL', spellId: SpellId.FROSTCRAFT },
    ],
  },
  // Direct child of ARCANE_AWAKENING: Khyrons are recruited from resonating
  // Crystal Chambers and transform through Resonance kills.
  {
    id: 'CRYSTAL_KHYRON',
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_UNIT', unitType: UnitType.CRYSTAL_KHYRON },
    ],
    textParams: { crystalCost: UNIT_DEFINITIONS.CRYSTAL_KHYRON.cost.crystals ?? 0 },
  },

  // ── Summoner path ────────────────────────────────────────────────────────
  {
    id: 'EMBERBIND',
    requires: ['BRANDMARK_HEAL'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.EMBERBIND },
    ],
  },
  {
    id: 'BRANDMARK_HEAL',
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.BRANDMARK_HEAL },
    ],
  },
  {
    id: 'CRYSTAL_TOWER',
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
    requires: ['RAISE_SKELETON'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.GRAVE_TRAP },
    ],
  },
  {
    id: 'GRAVE_HARVEST',
    requires: ['GRAVE_TRAP'],
    cost: 7,
    effects: [
      { type: 'FLAG', flag: TechFlag.GRAVE_HARVEST },
    ],
  
    textParams: { chancePercent: MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE, crystalAmount: ABILITIES.GRAVE_HARVEST_CRYSTAL_AMOUNT },
  },
  // ── Necromancer path branch b: gravestone expansion ──────────────────────
  {
    id: 'GRAVE_WARRIORS',
    requires: ['RAISE_SKELETON'],
    cost: 4,
    effects: [
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.RIDER,    tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.SWORDSMAN, tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.ARCHER,   tag: UnitTag.LEAVES_GRAVESTONE },
      { type: 'GRANT_UNIT_TAG', unitType: UnitType.CROSSBOWMAN, tag: UnitTag.LEAVES_GRAVESTONE },
    ],
  },
  {
    id: 'GRAVE_ENGINES',
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
    requires: ['ARCANE_AWAKENING'],
    cost: 4,
    effects: [
      { type: 'UNLOCK_SPELL', spellId: SpellId.EXPLODE },
    ],
  },
  {
    id: 'SPELL_REACH',
    requires: ['EXPLODE'],
    cost: 7,
    effects: [
      { type: 'UNIT_STAT_MOD', unitType: UnitType.MAGE, stat: 'attackRange', mode: 'add', value: MAGE.SPELL_RANGE_BONUS },
    ],
  
    textParams: { rangeBonus: MAGE.SPELL_RANGE_BONUS, totalRange: UNIT_DEFINITIONS.MAGE.attackRange + MAGE.SPELL_RANGE_BONUS },
  },

];
