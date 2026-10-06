/**
 * Pure helpers for building recruit-block warning messages shown on each
 * recruit option in the HUD panel.
 *
 * Keeping these out of HUD.tsx makes them easy to unit-test without mounting
 * React components.
 */

import { BuildingType, type UnitPopulationCost } from './types';
import { buildingNameRef } from './i18n/entityText';
import type { TextRef } from './i18n/i18n';

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
  resourceWarningMsg: TextRef | null;
  /** Non-null when there is insufficient population for this unit. */
  popWarningMsg: TextRef | null;
  /** Non-null when the recruitment cap blocks this unit. */
  capWarningMsg: TextRef | null;
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
 * @param buildingType      Building type used for the unit-limit warning.
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
  buildingType: BuildingType,
): RecruitBlockMessages {
  // --- Resource warning ---
  let resourceWarningMsg: TextRef | null = null;
  if (!canAffordUnit) {
    if (isCrystalCost) {
      const missing = crystalCost - arcaneCrystals;
      resourceWarningMsg = { key: 'recruit.notEnoughCrystals', params: { need: crystalCost, have: arcaneCrystals, missing } };
    } else if (cost) {
      const lacksIron = resources.iron < cost.iron;
      const lacksWood = resources.wood < cost.wood;
      if (lacksIron && lacksWood) {
        resourceWarningMsg = {
          key: 'recruit.notEnoughIronAndWood',
          params: { ironNeed: cost.iron, ironHave: resources.iron, woodNeed: cost.wood, woodHave: resources.wood },
        };
      } else if (lacksIron) {
        resourceWarningMsg = { key: 'recruit.notEnoughIron', params: { need: cost.iron, have: resources.iron } };
      } else if (lacksWood) {
        resourceWarningMsg = { key: 'recruit.notEnoughWood', params: { need: cost.wood, have: resources.wood } };
      } else {
        resourceWarningMsg = { key: 'recruit.notEnoughResources' };
      }
    } else {
      resourceWarningMsg = { key: 'recruit.notEnoughResources' };
    }
  }

  // --- Population warning ---
  let popWarningMsg: TextRef | null = null;
  if (!hasPopulation && canAffordUnit && popCost) {
    const needFarmers =
      popCost.farmers > 0 &&
      popUsage.farmersUsed + popCost.farmers > popCapacity.farmerCapacity;
    const needNobles =
      popCost.nobles > 0 &&
      popUsage.noblesUsed + popCost.nobles > popCapacity.nobleCapacity;
    if (needFarmers && needNobles) popWarningMsg = { key: 'recruit.notEnoughFarmersAndNobles' };
    else if (needFarmers) popWarningMsg = { key: 'recruit.notEnoughFarmers' };
    else if (needNobles) popWarningMsg = { key: 'recruit.notEnoughNobles' };
  }

  // --- Cap warning ---
  let capWarningMsg: TextRef | null = null;
  if (atUnitLimit && canAffordUnit && hasPopulation) {
    if (isCrystalCave) {
      capWarningMsg = { key: 'recruit.caveHostsDrake' };
    } else {
      capWarningMsg = {
        key: 'recruit.unitLimitReached',
        params: { count: recruitedUnits, max: unitLimit, building: buildingNameRef(buildingType) },
      };
    }
  }

  return { resourceWarningMsg, popWarningMsg, capWarningMsg };
}
