/**
 * Pure helpers for building recruit-block warning messages shown on each
 * recruit option in the HUD panel.
 *
 * Keeping these out of HUD.tsx makes them easy to unit-test without mounting
 * React components.
 */

import type { UnitPopulationCost } from './types';

export interface RecruitCost {
  iron: number;
  wood: number;
}

export interface ResourceSnapshot {
  iron: number;
  wood: number;
}

export interface PopUsage {
  farmersUsed: number;
  noblesUsed: number;
}

export interface PopCapacity {
  farmerCapacity: number;
  nobleCapacity: number;
}

export interface RecruitBlockMessages {
  /** Non-null when the unit's resource cost cannot be met. */
  resourceWarningMsg: string | null;
  /** Non-null when there is insufficient population for this unit. */
  popWarningMsg: string | null;
  /** Non-null when the recruitment cap blocks this unit. */
  capWarningMsg: string | null;
}

/**
 * Build warning messages for a single blocked recruit option.
 *
 * Only messages whose condition is *actually* blocking are populated;
 * callers decide which to display based on the ordered priority
 * (resources → population → cap).
 *
 * @param isCrystalCost     True for Crystal-Drake-style arcane-crystal cost.
 * @param cost              Iron/wood cost (undefined when isCrystalCost).
 * @param crystalCost       Arcane-crystal cost (0 when not isCrystalCost).
 * @param resources         Current player iron/wood.
 * @param arcaneCrystals    Current player arcane crystals.
 * @param canAffordUnit     Pre-computed affordability flag.
 * @param hasPopulation     Pre-computed population-availability flag.
 * @param popCost           Population cost definition for this unit type.
 * @param popUsage          Current population usage totals.
 * @param popCapacity       Current population capacity totals.
 * @param atUnitLimit       True when the recruitment cap is reached.
 * @param isCrystalCave     True when the building is a CRYSTAL_CAVE.
 * @param recruitedUnits    Current unit count toward the cap.
 * @param unitLimit         Maximum unit count for this building.
 * @param buildingTypeName  Human-readable building type name (e.g. "Barracks").
 */
export function buildRecruitBlockMessages(
  isCrystalCost: boolean,
  cost: RecruitCost | undefined,
  crystalCost: number,
  resources: ResourceSnapshot,
  arcaneCrystals: number,
  canAffordUnit: boolean,
  hasPopulation: boolean,
  popCost: UnitPopulationCost | undefined,
  popUsage: PopUsage,
  popCapacity: PopCapacity,
  atUnitLimit: boolean,
  isCrystalCave: boolean,
  recruitedUnits: number,
  unitLimit: number,
  buildingTypeName: string,
): RecruitBlockMessages {
  // --- Resource warning ---
  let resourceWarningMsg: string | null = null;
  if (!canAffordUnit) {
    if (isCrystalCost) {
      const missing = crystalCost - arcaneCrystals;
      resourceWarningMsg = `Not enough crystals (need ${crystalCost}, have ${arcaneCrystals}, missing ${missing})`;
    } else if (cost) {
      const parts: string[] = [];
      if (resources.iron < cost.iron) {
        parts.push(`iron (need ${cost.iron}, have ${resources.iron})`);
      }
      if (resources.wood < cost.wood) {
        parts.push(`wood (need ${cost.wood}, have ${resources.wood})`);
      }
      if (parts.length > 0) {
        resourceWarningMsg = `Not enough ${parts.join(' and ')}`;
      } else {
        // Fallback – cost object exists but nothing is individually short
        resourceWarningMsg = 'Not enough resources';
      }
    } else {
      resourceWarningMsg = 'Not enough resources';
    }
  }

  // --- Population warning ---
  let popWarningMsg: string | null = null;
  if (!hasPopulation && canAffordUnit && popCost) {
    const needFarmers =
      popCost.farmers > 0 &&
      popUsage.farmersUsed + popCost.farmers > popCapacity.farmerCapacity;
    const needNobles =
      popCost.nobles > 0 &&
      popUsage.noblesUsed + popCost.nobles > popCapacity.nobleCapacity;
    const parts: string[] = [];
    if (needFarmers) parts.push('farmers — build more Farms');
    if (needNobles) parts.push('nobles — build more Patrician Houses');
    if (parts.length > 0) popWarningMsg = `Not enough ${parts.join(' and ')}`;
  }

  // --- Cap warning ---
  let capWarningMsg: string | null = null;
  if (atUnitLimit && canAffordUnit && hasPopulation) {
    if (isCrystalCave) {
      capWarningMsg = 'This cave already hosts a Crystal Drake';
    } else {
      capWarningMsg = `Unit limit reached (${recruitedUnits}/${unitLimit}), build another ${buildingTypeName}`;
    }
  }

  return { resourceWarningMsg, popWarningMsg, capWarningMsg };
}
