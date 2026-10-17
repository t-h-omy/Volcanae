/**
 * Hint system configuration for Volcanae.
 * Single source of truth for hint IDs and global constants.
 */

import { POPULATION, TRAINING } from './economy';
import { BURNING_TILE_DAMAGE } from './tileStatus';
import { CRYSTAL_CHAMBER_CONFIG } from './buildings';
import { ABILITIES } from './abilities';
import { CORRUPTED_QORK, CRYSTAL_KHYRON, GHOUL } from './units';
import { MAGE } from './magic';

// ============================================================================
// CONSTANTS
// ============================================================================

export const HINTS = {
  /** Maximum number of times any single hint may be shown globally across all savegames */
  GLOBAL_MAX_SHOWS: 2,
  /** Hints begin firing on the second player turn and later. */
  START_TURN: 2,
} as const;

// ============================================================================
// HINT IDS
// ============================================================================

export type HintId =
  | 'H01_BUILD_WOODCUTTER'
  | 'H01B_RECRUIT_GUARD'
  | 'H02_BUILD_MINE'
  | 'H03_BUILD_ON_RUIN'
  | 'H04_RUIN_MENU_FIRST'
  | 'H05_ATTACK_ENDS_TURN'
  | 'H06_LAVA_ADVANCE'
  | 'H07_RECRUIT_NO_RESOURCES'
  | 'H08_RECRUIT_NO_POPULATION'
  | 'H09_RECRUIT_NO_CAPACITY'
  | 'H10_HOMELESS'
  | 'H11_UNTRAINED'
  | 'H12_CORRUPTION'
  | 'H13_BURNING'
  | 'H14_FIRST_TECH_FIELD_DUTIES'
  | 'H15_CHAMBER_RESONANCE'
  | 'H16_CHAMBER_NOT_RESONATING'
  | 'H17_CAVE_NOT_RESONATING'
  | 'H18_EMBER_LEVEL'
  | 'H19_EMBERBIND_LEASH'
  | 'H20_BUILD_NO_RESOURCES'
  | 'H21_KHYRON_RESONANCE'
  | 'H22_QORK_CORRUPTION'
  | 'H23_INFESTED_SPREAD'
  | 'H24_MAGE_PORTAL'
  | 'H25_KHYRON_LEVEL_UP'
  | 'H26_GHOUL_GRAVESTONES'
  | 'H27_STONE_SKIN_ROOTED';

export const ALL_HINT_IDS: HintId[] = [
  'H01_BUILD_WOODCUTTER',
  'H01B_RECRUIT_GUARD',
  'H02_BUILD_MINE',
  'H03_BUILD_ON_RUIN',
  'H04_RUIN_MENU_FIRST',
  'H05_ATTACK_ENDS_TURN',
  'H06_LAVA_ADVANCE',
  'H07_RECRUIT_NO_RESOURCES',
  'H08_RECRUIT_NO_POPULATION',
  'H09_RECRUIT_NO_CAPACITY',
  'H10_HOMELESS',
  'H11_UNTRAINED',
  'H12_CORRUPTION',
  'H13_BURNING',
  'H14_FIRST_TECH_FIELD_DUTIES',
  'H15_CHAMBER_RESONANCE',
  'H16_CHAMBER_NOT_RESONATING',
  'H17_CAVE_NOT_RESONATING',
  'H18_EMBER_LEVEL',
  'H19_EMBERBIND_LEASH',
  'H20_BUILD_NO_RESOURCES',
  'H21_KHYRON_RESONANCE',
  'H22_QORK_CORRUPTION',
  'H23_INFESTED_SPREAD',
  'H24_MAGE_PORTAL',
  'H25_KHYRON_LEVEL_UP',
  'H26_GHOUL_GRAVESTONES',
  'H27_STONE_SKIN_ROOTED',
];

// ============================================================================
// HINT DEFINITIONS
// ============================================================================

export interface HintDefinition {
  textParams?: { [name: string]: number };
}

export const HINT_DEFINITIONS: Record<HintId, HintDefinition> = {
  H01_BUILD_WOODCUTTER: {
  },
  H01B_RECRUIT_GUARD: {
  },
  H02_BUILD_MINE: {
  },
  H03_BUILD_ON_RUIN: {
  },
  H04_RUIN_MENU_FIRST: {
  },
  H05_ATTACK_ENDS_TURN: {
  },
  H06_LAVA_ADVANCE: {
  },
  H07_RECRUIT_NO_RESOURCES: {
  },
  H08_RECRUIT_NO_POPULATION: {
  },
  H09_RECRUIT_NO_CAPACITY: {
  },
  H10_HOMELESS: {
  textParams: { defensePenalty: POPULATION.HOMELESS_DEF_PENALTY, hpLoss: POPULATION.HOMELESS_HP_LOSS_PER_TURN },
  },
  H11_UNTRAINED: {
  textParams: { attackPenalty: TRAINING.UNTRAINED_ATK_PENALTY },
  },
  H12_CORRUPTION: {
  },
  H13_BURNING: {
  textParams: { damage: BURNING_TILE_DAMAGE },
  },
  H14_FIRST_TECH_FIELD_DUTIES: {
  },
  H15_CHAMBER_RESONANCE: {
  textParams: { duration: CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION, crystalsPerTurn: CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN },
  },
  H16_CHAMBER_NOT_RESONATING: {
  },
  H17_CAVE_NOT_RESONATING: {
  },
  H18_EMBER_LEVEL: {
  },
  H19_EMBERBIND_LEASH: {
  },
  H20_BUILD_NO_RESOURCES: {
  },
  H21_KHYRON_RESONANCE: {
    textParams: { healAmount: ABILITIES.RESONANCE_HEAL_AMOUNT, maxLevel: CRYSTAL_KHYRON.MAX_LEVEL },
  },
  H22_QORK_CORRUPTION: {
    textParams: { hpLoss: CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS, explosionDamage: CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE },
  },
  H23_INFESTED_SPREAD: {
    textParams: { hpLoss: MAGE.INFESTED_HP_LOSS_PER_TURN },
  },
  H24_MAGE_PORTAL: {
  },
  H25_KHYRON_LEVEL_UP: {
  },
  H26_GHOUL_GRAVESTONES: {
    textParams: { maxLevel: GHOUL.MAX_LEVEL, killHealPercent: GHOUL.KILL_HEAL_PERCENT },
  },
  H27_STONE_SKIN_ROOTED: {
    textParams: { stoneHp: MAGE.STONE_SKIN_HP },
  },
};
