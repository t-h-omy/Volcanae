/**
 * Static descriptions, tags, and tag info for units and buildings.
 * Used by the info-popup system in HUD.tsx.
 */

import { UnitType, UnitTag, BuildingType } from './types';

// ============================================================================
// UNIT DESCRIPTIONS
// ============================================================================

export const UNIT_DESCRIPTIONS: Partial<Record<UnitType, string>> = {
  [UnitType.INFANTRY]:  'Versatile foot soldier that can move, fight, build structures, and capture enemy buildings.',
  [UnitType.ARCHER]:    'Ranged attacker that strikes from 2 tiles away without stepping into melee range.',
  [UnitType.RIDER]:     'Swift cavalry that covers 2 tiles per move to outflank and pressure the enemy.',
  [UnitType.SIEGE]:     'Long-range bombard with 3-tile reach; must prepare one turn before it can fire.',
  [UnitType.SCOUT]:     'Lightly armored explorer that reveals more fog of war than any other unit.',
  [UnitType.GUARD]:     'Heavily armored defender with high defense, best used to hold key buildings.',
  [UnitType.EMBERLING]: 'Fragile fire spirit that explodes on death, dealing heavy damage to everything nearby.',
};

// ============================================================================
// UNIT TAGS (base tags shown in info popups — runtime tags may differ)
// ============================================================================

export const UNIT_TAGS: Partial<Record<UnitType, UnitTag[]>> = {
  [UnitType.INFANTRY]:  [UnitTag.BUILDANDCAPTURE],
  [UnitType.ARCHER]:    [UnitTag.RANGED, UnitTag.BUILDANDCAPTURE],
  [UnitType.RIDER]:     [UnitTag.BUILDANDCAPTURE],
  [UnitType.SIEGE]:     [UnitTag.RANGED, UnitTag.PREP],
  [UnitType.SCOUT]:     [],
  [UnitType.GUARD]:     [UnitTag.PREP],
  [UnitType.EMBERLING]: [UnitTag.SACRIFICIAL, UnitTag.EXPLOSIVE],
};

// ============================================================================
// TAG INFO
// ============================================================================

export const TAG_INFO: Record<UnitTag, { label: string; desc: string }> = {
  [UnitTag.RANGED]:          { label: 'Ranged',          desc: 'Attacks from a distance; cannot retaliate when struck by an adjacent attacker.' },
  [UnitTag.PREP]:            { label: 'Prep',            desc: 'Must spend one turn in a prepared state before it can attack.' },
  [UnitTag.BUILDANDCAPTURE]: { label: 'Build & Capture', desc: 'Can construct buildings on open terrain and capture enemy strongholds.' },
  [UnitTag.SACRIFICIAL]:     { label: 'Sacrificial',     desc: 'Destroyed after it performs its special action.' },
  [UnitTag.EXPLOSIVE]:       { label: 'Explosive',       desc: 'Deals heavy area damage to all adjacent units when it dies.' },
  [UnitTag.FIELDWORK]:       { label: 'Fieldwork',       desc: 'Can sacrifice itself on its current tile to instantly erect a Watchtower.' },
  [UnitTag.ASSASSIN]:        { label: 'Assassin',        desc: 'Deals bonus damage when striking an enemy that is still at full health.' },
  [UnitTag.PATCHUP]:         { label: 'Patch Up',        desc: 'Can spend its action to restore health on one adjacent friendly unit.' },
  [UnitTag.LAVABOOST]:       { label: 'Lava-Boosted',    desc: 'Gains combat bonuses when fighting near the advancing lava front.' },
  [UnitTag.CORRUPT]:         { label: 'Corrupt',         desc: 'Can corrupt forest and mountain terrain tiles.' },
};

// ============================================================================
// BUILDING DESCRIPTIONS
// ============================================================================

export const BUILDING_DESCRIPTIONS: Partial<Record<BuildingType, string>> = {
  [BuildingType.STRONGHOLD]:      'Your capital — if the enemy captures all five strongholds, you lose.',
  [BuildingType.MINE]:            'Produces iron every turn, the primary resource for training units.',
  [BuildingType.WOODCUTTER]:      'Produces wood every turn, used alongside iron for buildings and recruitment.',
  [BuildingType.BARRACKS]:        'Military hall that trains Infantry.',
  [BuildingType.ARCHER_CAMP]:     'Archery range that trains Archers.',
  [BuildingType.RIDER_CAMP]:      'Stable that trains Riders.',
  [BuildingType.SIEGE_CAMP]:      'Engineering works that trains Siege engines.',
  [BuildingType.WATCHTOWER]:      'Unmanned tower that passively expands your vision into the fog.',
  [BuildingType.FARM]:            'Housing for common folk — each pop raised lets you field one more basic unit.',
  [BuildingType.PATRICIANHOUSE]:  'Noble estate — each noble raised lets you field one more elite unit.',
  [BuildingType.CRYSTAL_CHAMBER]: 'Arcane resonator that generates crystals used to unlock new technologies.',
};
