/**
 * Static descriptions, tags, and tag info for units and buildings.
 * Used by the info-popup system in HUD.tsx.
 */

import { UnitType, UnitTag, BuildingType } from './types';
import { UNITS, BUILDINGS, ABILITIES } from './gameConfig';

// ============================================================================
// UNIT DESCRIPTIONS
// ============================================================================

export const UNIT_DESCRIPTIONS: Partial<Record<UnitType, string>> = {
  [UnitType.INFANTRY]:  'Versatile foot soldier that can move, fight, build structures, and capture enemy buildings.',
  [UnitType.ARCHER]:    `Ranged attacker that strikes from ${UNITS.ARCHER.attackRange} tiles away without stepping into melee range.`,
  [UnitType.RIDER]:     `Swift cavalry that covers ${UNITS.RIDER.moveRange} tiles per move to outflank and pressure the enemy.`,
  [UnitType.SIEGE]:     `Long-range bombard with ${UNITS.SIEGE.attackRange}-tile reach; cannot fire in the same turn it moves.`,
  [UnitType.SCOUT]:     'Light and fast explorer. Can gain special abilities through technology upgrades.',
  [UnitType.GUARD]:     'Heavily armored defender with high defense; cannot attack in the same turn it moves.',
  [UnitType.EMBERLING]: 'Fragile fire spirit that walks toward lava. Explodes on death, dealing heavy damage to all nearby enemies.',
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
  [UnitTag.RANGED]:          { label: 'Ranged',          desc: 'Attacks from a distance and does not move onto a defeated enemy\'s tile.' },
  [UnitTag.PREP]:            { label: 'Prep',            desc: 'Cannot attack in the same turn it moves. Attack first, then move — or wait a turn after moving.' },
  [UnitTag.BUILDANDCAPTURE]: { label: 'Build & Capture', desc: 'Can construct buildings on open terrain and capture enemy strongholds.' },
  [UnitTag.SACRIFICIAL]:     { label: 'Sacrificial',     desc: 'Prioritizes walking toward the lava to be consumed.' },
  [UnitTag.EXPLOSIVE]:       { label: 'Explosive',       desc: 'Deals heavy area damage to all adjacent enemies when it dies.' },
  [UnitTag.FIELDWORK]:       { label: 'Fieldwork',       desc: 'Can sacrifice itself on its current tile to instantly erect a Watchtower.' },
  [UnitTag.ASSASSIN]:        { label: 'Assassin',        desc: `Deals ${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}× damage and receives no retaliation when striking an enemy that is still at full health.` },
  [UnitTag.PATCHUP]:         { label: 'Patch Up',        desc: `Can spend its action to restore ${ABILITIES.PATCHUP_HEAL_AMOUNT} HP on one adjacent friendly unit.` },
  [UnitTag.LAVABOOST]:       { label: 'Lava-Boosted',    desc: 'Spawns with boosted stats when its spawning building is close to the lava front.' },
  [UnitTag.CORRUPT]:         { label: 'Corrupt',         desc: 'Can corrupt forest and mountain terrain tiles.' },
};

// ============================================================================
// BUILDING DESCRIPTIONS
// ============================================================================

export const BUILDING_DESCRIPTIONS: Partial<Record<BuildingType, string>> = {
  [BuildingType.STRONGHOLD]:      'Your capital — if you lose all your strongholds, the game is over.',
  [BuildingType.MINE]:            'Produces iron every turn, the primary resource for training units.',
  [BuildingType.WOODCUTTER]:      'Produces wood every turn, used alongside iron for buildings and recruitment.',
  [BuildingType.BARRACKS]:        'Military hall that trains Infantry.',
  [BuildingType.ARCHER_CAMP]:     'Archery range that trains Archers.',
  [BuildingType.RIDER_CAMP]:      'Stable that trains Riders.',
  [BuildingType.SIEGE_CAMP]:      'Engineering works that trains Siege engines.',
  [BuildingType.WATCHTOWER]:      `Defensive tower that attacks enemies within ${BUILDINGS.WATCHTOWER_STATS.attackRange} tiles and expands your vision.`,
  [BuildingType.FARM]:            'Housing for common folk — each pop raised lets you field one more basic unit.',
  [BuildingType.PATRICIANHOUSE]:  'Noble estate — each noble raised lets you field one more elite unit.',
  [BuildingType.CRYSTAL_CHAMBER]: 'Arcane resonator. When a Crystal Chamber is consumed by lava, all surviving chambers begin resonating and generate crystals each turn.',
};
