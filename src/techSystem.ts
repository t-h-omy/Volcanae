/**
 * Tech tree system for Volcanae.
 * Provides pick-grant, unlock, availability, and effect-rendering logic.
 * All node definitions live in gameConfig.ts (TECH_TREE).
 */

import type { Draft } from 'immer';
import type { GameState, TechId, TechEffect } from './types';
import { TECH_TREE } from './gameConfig';

// ============================================================================
// PICK GRANTS
// ============================================================================

/**
 * Grant tech picks to the player.
 * @param state - Immer draft of the game state (will be mutated)
 * @param amount - Number of picks to grant (driven by TECH config values)
 */
export function grantTechPick(state: Draft<GameState>, amount: number): void {
  state.pendingTechPicks += amount;
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
  if (state.pendingTechPicks <= 0) return;

  const nodeState = state.techNodes[techId];
  if (!nodeState || nodeState.unlocked) return;

  const def = TECH_TREE.find((d) => d.id === techId);
  if (!def) return;

  // Check prerequisites
  if (!def.requires.every((reqId) => state.techNodes[reqId]?.unlocked === true)) return;

  // Mark as unlocked and spend the pick
  nodeState.unlocked = true;
  state.pendingTechPicks -= 1;

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
    // GRANT_UNIT_TAG, UNIT_STAT_MOD, BUILDING_PRODUCTION_MOD
    // are read at point-of-use by other systems — no immediate state mutation needed.
    default:
      break;
  }
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
