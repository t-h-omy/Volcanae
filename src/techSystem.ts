/**
 * Tech tree system for Volcanae.
 * Provides pick-grant, unlock, availability, and effect-rendering logic.
 * All node definitions live in gameConfig.ts (TECH_TREE).
 */

import type { Draft } from 'immer';
import type { GameState, TechId, TechEffect, UnitStats } from './types';
import { Faction } from './types';
import { TECH_TREE } from './gameConfig';

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
  if (state.arcaneCrystals <= 0) return;

  const nodeState = state.techNodes[techId];
  if (!nodeState || nodeState.unlocked) return;

  const def = TECH_TREE.find((d) => d.id === techId);
  if (!def) return;

  // Check prerequisites
  if (!def.requires.every((reqId) => state.techNodes[reqId]?.unlocked === true)) return;

  // Mark as unlocked and spend the pick
  nodeState.unlocked = true;
  state.arcaneCrystals -= 1;

  // Apply effects
  for (const effect of def.effects) {
    applyTechEffect(state, effect);
  }
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
          }
        }
      }
      break;
    case 'UNIT_STAT_MOD':
      // Retroactively modify the stat on all existing player units of that type
      for (const unit of Object.values(state.units)) {
        if (unit.faction === Faction.PLAYER && unit.type === effect.unitType) {
          applyStatMod(unit.stats, effect.stat, effect.mode, effect.value);
        }
      }
      break;
    case 'BUILDING_PRODUCTION_MOD':
      // Applied at point-of-use in collectResources() — no immediate state mutation
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

import type { UnitType, UnitTag, BuildingType, ResourceType } from './types';

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
 * Returns all UNIT_STAT_MOD effects for the given unit type from unlocked techs.
 * Used at unit spawn time to apply tech-granted stat mods to newly created units.
 */
export function getStatMods(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): { stat: keyof UnitStats; mode: 'add' | 'percent'; value: number }[] {
  const mods: { stat: keyof UnitStats; mode: 'add' | 'percent'; value: number }[] = [];
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const effect of def.effects) {
      if (effect.type === 'UNIT_STAT_MOD' && effect.unitType === unitType) {
        mods.push({ stat: effect.stat, mode: effect.mode, value: effect.value });
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

// ============================================================================
// EFFECT RENDERING (for UI)
// ============================================================================

/** Human-readable descriptions for FLAG effects */
const flagDescriptions: Record<string, string> = {
  TO_THE_FRONT: 'Units >10 tiles from lava front: +1 movement',
  HOLD_GROUND: 'Units on own buildings: defense bonus',
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
    case 'UNIT_STAT_MOD':
      return `${effect.unitType} ${effect.stat} ${effect.mode === 'add' ? '+' : ''}${effect.value}${effect.mode === 'percent' ? '%' : ''}`;
    case 'BUILDING_PRODUCTION_MOD':
      return `${effect.buildingType} ${effect.chancePercent}% chance +${effect.amount} ${effect.resource}/turn`;
    case 'FLAG':
      return flagDescriptions[effect.flag] ?? effect.flag;
    default:
      return '';
  }
}
