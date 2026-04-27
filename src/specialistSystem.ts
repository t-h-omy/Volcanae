/**
 * Specialist system module for Volcanae.
 * Implements specialist assignment, unassignment, and storage.
 *
 * Rules:
 * - Unassigned specialists are stored in state.globalSpecialistStorage (array of specialist IDs)
 * - All player-owned STRONGHOLDs show the global specialist storage in their UI
 * - Assigning a specialist:
 *   - Flow: globalSpecialistStorage to building.specialistSlot
 *   - Cost: building is disabled for SPECIALIST_ASSIGN_DISABLE_TURNS (1 turn)
 *   - Cannot assign if building was attacked last enemy turn
 *   - Cannot assign if building already has a specialist
 * - Unassigning a specialist:
 *   - Flow: building.specialistSlot to globalSpecialistStorage
 *   - Cost: building is disabled for SPECIALIST_ASSIGN_DISABLE_TURNS (1 turn)
 *   - Cannot unassign if building was attacked last enemy turn
 * - When lava destroys a player building with a specialist: specialist goes to globalSpecialistStorage
 *   (handled in lavaSystem.ts)
 * - When enemy captures a player building with a specialist: specialist is LOST
 *   (handled in captureSystem.ts)
 */

import type { GameState, Specialist } from './types';
import type { Draft } from 'immer';
import { Faction, BuildingType } from './types';
import { BUILDINGS } from './gameConfig';

// ============================================================================
// INITIAL SPECIALISTS
// ============================================================================

/**
 * Creates the 5 placeholder specialists for the game.
 * These are not yet in globalSpecialistStorage - player must find them.
 */
export function createInitialSpecialists(): Record<string, Specialist> {
  const spec01Params = { hpMultiplier: 1.2, attackMultiplier: 0.8 };
  const spec02Params = { range: 10, healPercent: 0.2, defensePenalty: 0.25 };
  const spec05Params = { range: 10, woodGrant: 3, lavaSpeedup: 1 };

  return {
    spec_01: {
      id: 'spec_01',
      name: 'Iron Forgemaster',
      description:
        `Units recruited here have +${Math.round((spec01Params.hpMultiplier - 1) * 100)}% max HP and -${Math.round((1 - spec01Params.attackMultiplier) * 100)}% attack.`,
      effects: [
        {
          type: 'RECRUIT_STAT_MOD',
          params: spec01Params,
        },
      ],
      assignedBuildingId: null,
      upkeepIron: 0,
      upkeepWood: 0,
      dormant: false,
    },
    spec_02: {
      id: 'spec_02',
      name: 'Lava Warden',
      description:
        `Units within range ${spec02Params.range} heal ${Math.round(spec02Params.healPercent * 100)}% max HP at turn start but have -${Math.round(spec02Params.defensePenalty * 100)}% defense that turn.`,
      effects: [
        {
          type: 'AOE_HEAL_WITH_DEFENSE_PENALTY',
          params: spec02Params,
        },
      ],
      assignedBuildingId: null,
      upkeepIron: 0,
      upkeepWood: 0,
      dormant: false,
    },
    spec_03: {
      id: 'spec_03',
      name: 'Master Fletcher',
      description: 'Unlocks an upgraded unit in the Archer Camp.',
      effects: [
        {
          type: 'UNLOCK_UNIT',
          params: {
            buildingType: BuildingType.ARCHER_CAMP,
            unitType: 'ARCHER_ELITE',
          },
        },
      ],
      assignedBuildingId: null,
      upkeepIron: 0,
      upkeepWood: 0,
      dormant: false,
    },
    spec_04: {
      id: 'spec_04',
      name: 'Siege Engineer',
      description: 'Unlocks an upgraded unit in the Siege Camp.',
      effects: [
        {
          type: 'UNLOCK_UNIT',
          params: {
            buildingType: BuildingType.SIEGE_CAMP,
            unitType: 'SIEGE_ELITE',
          },
        },
      ],
      assignedBuildingId: null,
      upkeepIron: 0,
      upkeepWood: 0,
      dormant: false,
    },
    spec_05: {
      id: 'spec_05',
      name: 'Ash Harvester',
      description:
        `Buildings destroyed by lava within range ${spec05Params.range} grant ${spec05Params.woodGrant} wood. Lava advances ${spec05Params.lavaSpeedup} turn faster.`,
      effects: [
        {
          type: 'LAVA_HARVEST',
          params: spec05Params,
        },
      ],
      assignedBuildingId: null,
      upkeepIron: 0,
      upkeepWood: 0,
      dormant: false,
    },
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Checks if a specialist can be assigned to a building.
 */
function canAssignSpecialist(
  state: GameState | Draft<GameState>,
  specialistId: string,
  buildingId: string
): { valid: boolean; reason?: string } {
  const specialist = state.specialists[specialistId];
  const building = state.buildings[buildingId];

  // Check if specialist exists
  if (!specialist) {
    return { valid: false, reason: 'Specialist not found' };
  }

  // Check if building exists
  if (!building) {
    return { valid: false, reason: 'Building not found' };
  }

  // Check if specialist is in global storage (unassigned)
  if (!state.globalSpecialistStorage.includes(specialistId)) {
    return { valid: false, reason: 'Specialist is not available in storage' };
  }

  // Check if building belongs to player
  if (building.faction !== Faction.PLAYER) {
    return { valid: false, reason: 'Building does not belong to player' };
  }

  // Check if building was attacked last enemy turn
  if (building.wasAttackedLastEnemyTurn) {
    return { valid: false, reason: 'Building was attacked last enemy turn' };
  }

  // Check if building already has a specialist
  if (building.specialistSlot !== null) {
    return { valid: false, reason: 'Building already has a specialist' };
  }

  return { valid: true };
}

/**
 * Checks if a specialist can be unassigned from a building.
 */
function canUnassignSpecialist(
  state: GameState | Draft<GameState>,
  buildingId: string
): { valid: boolean; reason?: string } {
  const building = state.buildings[buildingId];

  // Check if building exists
  if (!building) {
    return { valid: false, reason: 'Building not found' };
  }

  // Check if building belongs to player
  if (building.faction !== Faction.PLAYER) {
    return { valid: false, reason: 'Building does not belong to player' };
  }

  // Check if building has a specialist to unassign
  if (building.specialistSlot === null) {
    return { valid: false, reason: 'Building has no specialist to unassign' };
  }

  // Check if building was attacked last enemy turn
  if (building.wasAttackedLastEnemyTurn) {
    return { valid: false, reason: 'Building was attacked last enemy turn' };
  }

  return { valid: true };
}

// ============================================================================
// SPECIALIST ACTIONS
// ============================================================================

/**
 * Assigns a specialist from global storage to a building.
 * - Removes specialist from globalSpecialistStorage
 * - Adds specialist to building.specialistSlot
 * - Updates specialist.assignedBuildingId
 * - Disables building for SPECIALIST_ASSIGN_DISABLE_TURNS
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param specialistId - ID of the specialist to assign
 * @param buildingId - ID of the building to assign to
 */
export function assignSpecialist(
  state: Draft<GameState>,
  specialistId: string,
  buildingId: string
): void {
  const validation = canAssignSpecialist(state, specialistId, buildingId);

  if (!validation.valid) {
    // In production, could log or throw an error
    return;
  }

  const specialist = state.specialists[specialistId];
  const building = state.buildings[buildingId];

  // Remove specialist from global storage (validation ensures it exists)
  const storageIndex = state.globalSpecialistStorage.indexOf(specialistId);
  state.globalSpecialistStorage.splice(storageIndex, 1);

  // Assign specialist to building
  building.specialistSlot = specialistId;
  specialist.assignedBuildingId = buildingId;

  // Disable building for the configured number of turns
  building.isDisabledForTurns = BUILDINGS.SPECIALIST_ASSIGN_DISABLE_TURNS;
}

/**
 * Unassigns a specialist from a building and returns it to global storage.
 * - Removes specialist from building.specialistSlot
 * - Adds specialist to globalSpecialistStorage
 * - Updates specialist.assignedBuildingId to null
 * - Disables building for SPECIALIST_ASSIGN_DISABLE_TURNS
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param buildingId - ID of the building to unassign from
 */
export function unassignSpecialist(
  state: Draft<GameState>,
  buildingId: string
): void {
  const validation = canUnassignSpecialist(state, buildingId);

  if (!validation.valid) {
    // In production, could log or throw an error
    return;
  }

  const building = state.buildings[buildingId];
  const specialistId = building.specialistSlot as string;
  const specialist = state.specialists[specialistId];

  if (!specialist) {
    return;
  }

  // Remove specialist from building
  building.specialistSlot = null;

  // Return specialist to global storage
  specialist.assignedBuildingId = null;
  state.globalSpecialistStorage.push(specialistId);

  // Disable building for the configured number of turns
  building.isDisabledForTurns = BUILDINGS.SPECIALIST_ASSIGN_DISABLE_TURNS;
}

/**
 * Deducts upkeep costs for all hired specialists at the end of each player turn.
 * Specialists whose upkeep cannot be paid are marked dormant (effects disabled).
 * Specialists with zero upkeep are never affected.
 *
 * Must be called inside an immer-draft context (Phase 6 bookkeeping in endPlayerTurn).
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function deductSpecialistUpkeep(state: Draft<GameState>): void {
  // Collect all specialist IDs currently owned by the player
  // (both in globalStorage and assigned to buildings).
  const ownedIds = new Set<string>([
    ...state.globalSpecialistStorage,
    ...Object.values(state.buildings)
      .map((b) => b.specialistSlot)
      .filter((id): id is string => id !== null),
  ]);

  for (const specId of ownedIds) {
    const spec = state.specialists[specId];
    if (!spec) continue;

    const iron = spec.upkeepIron ?? 0;
    const wood = spec.upkeepWood ?? 0;

    // No upkeep — always active, never touch dormant
    if (iron === 0 && wood === 0) {
      spec.dormant = false;
      continue;
    }

    const canPay =
      state.resources.iron >= iron && state.resources.wood >= wood;

    if (canPay) {
      state.resources.iron -= iron;
      state.resources.wood -= wood;
      spec.dormant = false;
    } else {
      // Cannot afford — mark dormant but do not push resources negative
      spec.dormant = true;
    }
  }
}

/**
 * Applies specialist effects to the game state.
 * Dormant specialists (upkeep unpaid) are skipped entirely.
 * STUB: Returns state unchanged for now.
 * Effects will be implemented in future prompts.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function applySpecialistEffects(state: Draft<GameState>): void {
  // Iterate through assigned specialists and apply effects
  for (const specialist of Object.values(state.specialists)) {
    if (specialist.assignedBuildingId !== null) {
      // Skip dormant specialists — upkeep was not paid
      if (specialist.dormant) continue;

      // Effects would be applied here based on specialist.effects
      // For now, this is a no-op
    }
  }
}
