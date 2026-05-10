/**
 * Tech tree system for Volcanae.
 * Provides pick-grant, unlock, availability, and effect-rendering logic.
 * All node definitions live in gameConfig.ts (TECH_TREE).
 */

import type { Draft } from 'immer';
import type { GameState, TechId, TechEffect, UnitStats, StatModifier } from './types';
import { Faction, TechFlag, BuildingType } from './types';
import { TECH_TREE, ABILITIES, TAG_STAT_EFFECTS, computeResearchCost, POPULATION, MAGE } from './gameConfig';

// ============================================================================
// PICK GRANTS
// ============================================================================

/**
 * Grant arcane crystals to the player.
 * @param state - Immer draft of the game state (will be mutated)
 * @param amount - Number of crystals to grant (driven by TECH config values)
 */
export function grantArcaneCrystals(state: Draft<GameState>, amount: number): void {
  state.arcaneCrystals += amount;
}

// ============================================================================
// AVAILABILITY
// ============================================================================

/**
 * Returns the list of tech IDs that the player can currently pick.
 * A tech is available when:
 *   1. It has not been unlocked yet
 *   2. All of its prerequisite techs are already unlocked
 */
export function getAvailableTechs(state: GameState | Draft<GameState>): TechId[] {
  return TECH_TREE
    .filter((def) => {
      const nodeState = state.techNodes[def.id];
      if (!nodeState || nodeState.unlocked) return false;
      return def.requires.every((reqId) => state.techNodes[reqId]?.unlocked === true);
    })
    .map((def) => def.id);
}

// ============================================================================
// UNLOCK
// ============================================================================

/**
 * Unlock a tech node and apply its effects.
 * Spends one pending pick. No-op if the node is already unlocked or
 * the player has no pending picks.
 */
export function unlockTech(state: Draft<GameState>, techId: TechId): void {
  const nodeState = state.techNodes[techId];
  if (!nodeState || nodeState.unlocked) return;

  const def = TECH_TREE.find((d) => d.id === techId);
  if (!def) return;

  const cost = computeResearchCost(def.cost ?? 1, state.ember);

  // Check prerequisites
  if (!def.requires.every((reqId) => state.techNodes[reqId]?.unlocked === true)) return;

  if (state.arcaneCrystals < cost) return;

  // Mark as unlocked and spend the crystals
  nodeState.unlocked = true;
  state.arcaneCrystals -= cost;

  // Apply effects
  for (const effect of def.effects) {
    applyTechEffect(state, effect);
  }

  // Update tech stats
  state.gameStats.techsUnlocked += 1;
}

// ============================================================================
// EFFECT APPLICATION
// ============================================================================

function applyTechEffect(state: Draft<GameState>, effect: TechEffect): void {
  switch (effect.type) {
    case 'UNLOCK_BUILDING':
      if (!state.unlockedBuildings.includes(effect.buildingType)) {
        state.unlockedBuildings.push(effect.buildingType);
      }
      break;
    case 'UNLOCK_UNIT':
      if (!state.unlockedUnits.includes(effect.unitType)) {
        state.unlockedUnits.push(effect.unitType);
      }
      break;
    case 'FLAG':
      if (!state.techFlags.includes(effect.flag)) {
        state.techFlags.push(effect.flag);
      }
      break;
    case 'GRANT_UNIT_TAG':
      // Retroactively add the tag to all existing player units of that type
      for (const unit of Object.values(state.units)) {
        if (unit.faction === Faction.PLAYER && unit.type === effect.unitType) {
          if (!unit.tags.includes(effect.tag)) {
            unit.tags.push(effect.tag);
            // Apply any stat mods intrinsic to this tag
            const oldMax = unit.stats.maxHp;
            for (const mod of TAG_STAT_EFFECTS[effect.tag] ?? []) {
              applyStatMod(unit.stats, mod.stat, mod.mode, mod.value);
            }
            // Keep currentHp in sync when maxHp is boosted
            if (unit.stats.maxHp > oldMax) {
              unit.stats.currentHp = Math.min(unit.stats.currentHp + (unit.stats.maxHp - oldMax), unit.stats.maxHp);
            }
          }
        }
      }
      break;
    case 'REMOVE_UNIT_TAG':
      // Retroactively remove the tag from all existing player units of that type
      for (const unit of Object.values(state.units)) {
        if (unit.faction === Faction.PLAYER && unit.type === effect.unitType) {
          const idx = unit.tags.indexOf(effect.tag);
          if (idx !== -1) unit.tags.splice(idx, 1);
        }
      }
      break;
    case 'UNIT_STAT_MOD':
      // Retroactively modify the stat on all existing player units of that type
      for (const unit of Object.values(state.units)) {
        if (unit.faction === Faction.PLAYER && unit.type === effect.unitType) {
          const oldMax = unit.stats.maxHp;
          applyStatMod(unit.stats, effect.stat, effect.mode, effect.value);
          // Keep currentHp in sync when maxHp is boosted: increase by the actual delta
          if (effect.stat === 'maxHp' && unit.stats.maxHp > oldMax) {
            unit.stats.currentHp = Math.min(unit.stats.currentHp + (unit.stats.maxHp - oldMax), unit.stats.maxHp);
          }
        }
      }
      break;
    case 'UNIT_COST_MOD':
      // Applied at point-of-use in recruitUnit() — no immediate state mutation
      break;
    case 'BUILDING_PRODUCTION_MOD':
      // Applied at point-of-use in collectResources() — no immediate state mutation
      break;
    case 'STRONGHOLD_CAP_MOD':
      // Cap is computed dynamically by getStrongholdEffectiveCap() at point-of-use.
      // No mutation needed here; building.populationCap is not authoritative for Strongholds.
      break;
    case 'SPECIALIST_SLOT_MOD':
      state.specialistSlotCap += effect.value;
      break;
    case 'UNLOCK_SPELL':
      if (!state.unlockedSpells.includes(effect.spellId)) {
        state.unlockedSpells.push(effect.spellId);
      }
      break;
    case 'SPELL_RANGE_MOD':
      // Applied on demand by getMageSpellRange() — no immediate state mutation needed.
      break;
    default:
      break;
  }
}

/** Apply a single stat modification to a unit's stats. */
function applyStatMod(
  stats: Draft<UnitStats>,
  stat: keyof UnitStats,
  mode: 'add' | 'percent',
  value: number,
): void {
  if (mode === 'add') {
    (stats[stat] as number) += value;
  } else {
    (stats[stat] as number) = Math.round((stats[stat] as number) * (1 + value / 100));
  }
}

// ============================================================================
// POINT-OF-USE HELPERS
// ============================================================================

import type { UnitType, UnitTag, ResourceType } from './types';

/**
 * Returns all GRANT_UNIT_TAG effects for the given unit type from unlocked techs.
 * Used at unit spawn time to apply tech-granted tags to newly created units.
 */
export function getGrantedTags(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): UnitTag[] {
  const tags: UnitTag[] = [];
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'GRANT_UNIT_TAG' && effect.unitType === unitType) {
        tags.push(effect.tag);
      }
    }
  }
  return tags;
}

/**
 * Returns all tags that should be removed from a unit type based on unlocked techs.
 * Used at unit spawn time to strip tags that techs remove (e.g. OUTRIDERS removes BUILDANDCAPTURE).
 */
export function getRemovedTags(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): UnitTag[] {
  const tags: UnitTag[] = [];
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'REMOVE_UNIT_TAG' && effect.unitType === unitType) {
        tags.push(effect.tag);
      }
    }
  }
  return tags;
}

/**
 * Returns the total additional iron and wood cost for a unit type based on unlocked UNIT_COST_MOD techs.
 * Used at unit recruitment time to compute the effective cost.
 */
export function getCostMods(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): { iron: number; wood: number } {
  let iron = 0;
  let wood = 0;
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'UNIT_COST_MOD' && effect.unitType === unitType) {
        if (effect.resource === 'iron') iron += effect.amount;
        else if (effect.resource === 'wood') wood += effect.amount;
      }
    }
  }
  return { iron, wood };
}

/**
 * Returns all UNIT_STAT_MOD effects for the given unit type from unlocked techs,
 * plus any stat mods intrinsic to tags granted to that unit type by unlocked techs.
 * Used at unit spawn time to apply tech-granted stat mods to newly created units.
 */
export function getStatMods(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): StatModifier[] {
  const mods: StatModifier[] = [];
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'UNIT_STAT_MOD' && effect.unitType === unitType) {
        mods.push({ stat: effect.stat, mode: effect.mode, value: effect.value });
      }
      // Include stat mods intrinsic to any tag granted to this unit type
      if (effect.type === 'GRANT_UNIT_TAG' && effect.unitType === unitType) {
        for (const mod of TAG_STAT_EFFECTS[effect.tag] ?? []) {
          mods.push(mod);
        }
      }
    }
  }
  return mods;
}

/**
 * Returns all BUILDING_PRODUCTION_MOD effects for the given building type from unlocked techs.
 * Used at resource collection time to apply bonus production.
 */
export function getBuildingProductionMods(
  state: GameState | Draft<GameState>,
  buildingType: BuildingType,
): { resource: ResourceType; chancePercent: number; amount: number }[] {
  const mods: { resource: ResourceType; chancePercent: number; amount: number }[] = [];
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'BUILDING_PRODUCTION_MOD' && effect.buildingType === buildingType) {
        mods.push({ resource: effect.resource, chancePercent: effect.chancePercent, amount: effect.amount });
      }
    }
  }
  return mods;
}

/**
 * Returns the total stronghold farmer and noble cap modifiers from all unlocked techs.
 * Used at population capacity computation time and when creating/capturing strongholds.
 */
export function getStrongholdCapMods(
  state: GameState | Draft<GameState>,
): { farmerMod: number; nobleMod: number } {
  let farmerMod = 0;
  let nobleMod = 0;
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'STRONGHOLD_CAP_MOD') {
        if (effect.capType === 'farmer') farmerMod += effect.amount;
        else if (effect.capType === 'noble') nobleMod += effect.amount;
      }
    }
  }
  return { farmerMod, nobleMod };
}

/**
 * Computes the effective (tech-adjusted) population caps for a Stronghold.
 * This is the single source of truth for the Stronghold cap and must be used
 * by all consumers — both game logic and display — so that tech modifiers
 * cannot diverge between them.
 *
 * @returns farmerCap  — maximum farmer population per Stronghold
 *          nobleCap   — maximum noble population per Stronghold
 *          totalCap   — combined cap (farmerCap + nobleCap)
 */
export function getStrongholdEffectiveCap(
  state: GameState | Draft<GameState>,
): { farmerCap: number; nobleCap: number; totalCap: number } {
  const { farmerMod, nobleMod } = getStrongholdCapMods(state);
  const farmerCap = POPULATION.STRONGHOLD_FARMER_CAP + farmerMod;
  const nobleCap = POPULATION.STRONGHOLD_NOBLE_CAP + nobleMod;
  return { farmerCap, nobleCap, totalCap: farmerCap + nobleCap };
}

// ============================================================================
// EFFECT RENDERING (for UI)
// ============================================================================

/** Human-readable descriptions for FLAG effects */
const flagDescriptions: Record<TechFlag, string> = {
  [TechFlag.TO_THE_FRONT]: `Units >${ABILITIES.TO_THE_FRONT_MIN_DISTANCE} tiles south of the northmost player unit: +${ABILITIES.TO_THE_FRONT_MOVE_BONUS} movement`,
  [TechFlag.HOLD_GROUND]: 'Units on own buildings: defense bonus',
  [TechFlag.GRAVE_HARVEST]: `Each player-owned Gravestone has a ${MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE}% chance per turn to grant 1 crystal`,
};

/**
 * Translate a TechEffect into a human-readable string for display.
 */
export function renderEffect(effect: TechEffect): string {
  switch (effect.type) {
    case 'UNLOCK_BUILDING':
      return `Unlocks ${effect.buildingType} construction`;
    case 'UNLOCK_UNIT':
      return `Unlocks ${effect.unitType} recruitment`;
    case 'GRANT_UNIT_TAG':
      return `${effect.unitType} gains ${effect.tag} ability`;
    case 'REMOVE_UNIT_TAG':
      return `${effect.unitType} loses ${effect.tag} ability`;
    case 'UNIT_STAT_MOD':
      return `${effect.unitType} ${effect.stat} ${effect.mode === 'add' ? (effect.value >= 0 ? '+' : '') : ''}${effect.value}${effect.mode === 'percent' ? '%' : ''}`;
    case 'UNIT_COST_MOD':
      return `${effect.unitType} cost ${effect.resource} ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
    case 'BUILDING_PRODUCTION_MOD':
      return `${effect.buildingType} ${effect.chancePercent}% chance +${effect.amount} ${effect.resource}/turn`;
    case 'FLAG':
      return flagDescriptions[effect.flag] ?? effect.flag;
    case 'STRONGHOLD_CAP_MOD':
      return `Stronghold +${effect.amount} ${effect.capType} cap`;
    case 'SPECIALIST_SLOT_MOD':
      return `+${effect.value} specialist slot${effect.value !== 1 ? 's' : ''}`;
    case 'UNLOCK_SPELL':
      return `Unlocks ${effect.spellId} spell`;
    case 'SPELL_RANGE_MOD':
      return `Spell range +${effect.amount}`;
    default:
      return '';
  }
}
