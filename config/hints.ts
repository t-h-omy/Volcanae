/**
 * Hint system configuration for Volcanae.
 * Single source of truth for hint IDs, texts, and global constants.
 */

import { POPULATION, TRAINING } from './economy';
import { BURNING_TILE_DAMAGE } from './tileStatus';
import { CRYSTAL_CHAMBER_CONFIG } from './buildings';

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
  | 'H20_BUILD_NO_RESOURCES';

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
];

// ============================================================================
// HINT DEFINITIONS
// ============================================================================

export interface HintDefinition {
  short: string;
  detail: string;
}

export const HINT_DEFINITIONS: Record<HintId, HintDefinition> = {
  H01_BUILD_WOODCUTTER: {
    short: 'Move a unit onto a forest tile to build a Woodcutter for wood income.',
    detail:
      'Most of your units can construct buildings. Select a unit, move it onto a forest tile, then choose Build. Wood is needed for buildings and many units.',
  },
  H01B_RECRUIT_GUARD: {
    short: 'Recruit a Guard in your Stronghold to help construct and expand.',
    detail:
      'Open your Stronghold and recruit a Guard. Guards are cheap, sturdy units, and after researching Field Duties they can also build and capture to support your early expansion.',
  },
  H02_BUILD_MINE: {
    short: 'Now move a unit onto a mountain tile to build a Mine for iron.',
    detail:
      'Iron pays for military units and buildings. Mountains without a cave entrance can hold a Mine. Keep expanding your economy while the lava is still far away.',
  },
  H03_BUILD_ON_RUIN: {
    short: 'Ruins are free building slots. Move a unit onto a ruin to construct.',
    detail:
      'Scattered ruins are the only places where you can put up new structures like Farms, Barracks or Crystal Chambers. Forests and mountains only hold resource buildings. Claim ruins early, they are limited.',
  },
  H04_RUIN_MENU_FIRST: {
    short: 'Farm grows farmer population. Barracks recruits Spearmen.',
    detail:
      'A Farm houses farmers, the population most units need for recruitment. A Barracks lets you recruit Spearmen and, later, Swordsmen. A solid start: one Farm, one Barracks.',
  },
  H05_ATTACK_ENDS_TURN: {
    short: "Attacking ends a unit's turn. It cannot move afterwards.",
    detail:
      'Move first, then attack. Once a unit attacks, both its move and its action are spent for this turn. Plan positioning before committing to a fight, melee attackers also take retaliation damage.',
  },
  H06_LAVA_ADVANCE: {
    short: 'The lava advances! It devours tiles, buildings and units from the south.',
    detail:
      'Every few turns the lava front moves one row north, consuming everything on it. The counter in the HUD shows turns until the next advance. You cannot stop it, keep moving north and let go of what lies behind.',
  },
  H07_RECRUIT_NO_RESOURCES: {
    short: 'Not enough resources for this unit.',
    detail:
      'Each unit costs iron, wood or crystals. Expand Mines and Woodcutters to afford stronger units, or trade at a Market if you find one.',
  },
  H08_RECRUIT_NO_POPULATION: {
    short: 'Not enough population to recruit this unit.',
    detail:
      'Units are recruited from your population: farmers live in Farms, nobles in Patrician Houses. Housing fills up over time. Build more housing, or wait for population to grow.',
  },
  H09_RECRUIT_NO_CAPACITY: {
    short: 'This building type is at its recruitment capacity.',
    detail:
      'Each building type supports a limited number of active units. Build another building of this type to raise the cap. Units above the cap become Untrained and fight worse.',
  },
  H10_HOMELESS: {
    short: 'A unit is homeless! It loses HP every turn.',
    detail: `Your population exceeds housing capacity, the most recently recruited units lose their shelter: -${POPULATION.HOMELESS_DEF_PENALTY} DEF and ${POPULATION.HOMELESS_HP_LOSS_PER_TURN} HP at the end of every player turn. Build more Farms or Patrician Houses, or the unit will wither away.`,
  },
  H11_UNTRAINED: {
    short: 'A unit is untrained! It fights with reduced attack.',
    detail: `You have more units of this kind than your training buildings support. Untrained units suffer -${TRAINING.UNTRAINED_ATK_PENALTY} ATK. Build another Barracks, camp or chamber of the matching type to restore full strength.`,
  },
  H12_CORRUPTION: {
    short: 'This unit stands on corrupted ground. Its abilities are suppressed.',
    detail:
      'Corruption is dead, poisoned terrain claimed by the enemy. Units standing on it lose the benefit of certain ability tags. Move off corrupted tiles, or research means to cleanse them (Scouts can extinguish corruption with the right tech).',
  },
  H13_BURNING: {
    short: 'Burning ground! Units standing on it take damage.',
    detail: `Burning tiles deal ${BURNING_TILE_DAMAGE} damage to every non-lava unit at the end of the turn. Move out of the fire. LAVA and CINDERBORN units are immune.`,
  },
  H14_FIRST_TECH_FIELD_DUTIES: {
    short: 'Good first research: Field Duties. Guards learn to build and capture.',
    detail:
      'Guards are cheap and sturdy but cannot construct or capture until you research Field Duties. With it, Guards become your workhorses: they build, they capture, they hold the line. Research gets more expensive as the Ember Level rises, so research early.',
  },
  H15_CHAMBER_RESONANCE: {
    short: 'Crystal Chambers awaken when the lava devours one of them.',
    detail: `When the lava consumes a Crystal Chamber, you gain crystals and all surviving chambers resonate for ${CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION} turns, producing ${CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN} crystal per turn each. Build chambers in the lava's path on purpose and chain the sacrifice. Resonating chambers can also recruit Mages once unlocked.`,
  },
  H16_CHAMBER_NOT_RESONATING: {
    short: 'This chamber is dormant. Mages can only be recruited while it resonates.',
    detail:
      'A chamber resonates for a few turns after any of your chambers is devoured by lava. Only a resonating chamber can recruit a Mage (requires Arcane Awakening). Sacrifice a chamber to the lava to wake the others.',
  },
  H17_CAVE_NOT_RESONATING: {
    short: 'This cave is dormant. The Crystal Drake needs resonance to be recruited.',
    detail:
      'Crystal Caves follow the same rule as chambers: only while your chambers resonate can the cave recruit its Crystal Drake. The drake dies if the cave is lost.',
  },
  H18_EMBER_LEVEL: {
    short: 'The Ember Level rose. Stronger enemies unlock and research gets pricier.',
    detail:
      'The Ember Level is the world\'s threat scale. It rises over time and through enemy rituals. Higher ember unlocks stronger enemy units and increases every research cost (base cost + ember). Tap the ember display for a breakdown of its sources.',
  },
  H19_EMBERBIND_LEASH: {
    short: 'The Ember Demon is leashed to your Mage. Keep them close!',
    detail:
      "The bound Ember Demon stays loyal only while it remains within the Mage's leash range. If the Mage moves too far away (checked at end of turn, and during the enemy turn), the demon defects and turns hostile. Move the Mage carefully.",
  },
  H20_BUILD_NO_RESOURCES: {
    short: 'Not enough resources to construct this building.',
    detail:
      'Each building costs iron and wood, shown on its button. Expand Woodcutters for wood and Mines for iron, and check the per-turn income badges in the top bar.',
  },
};
