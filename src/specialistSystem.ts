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
  return {
    spec_01: {
      id: 'spec_01',
      name: 'Iron Forgemaster',
      description:
        'Units recruited here have +20% max HP and -20% attack.',
      effects: [
        {
          type: 'RECRUIT_STAT_MOD',
          params: {
            hpMultiplier: 1.2,
            attackMultiplier: 0.8,
          },
        },
      ],
      assignedBuildingId: null,
    },
    spec_02: {
      id: 'spec_02',
      name: 'Lava Warden',
      description:
        'Units within range 10 heal 20% max HP at turn start but have -25% defense that turn.',
      effects: [
        {
          type: 'AOE_HEAL_WITH_DEFENSE_PENALTY',
          params: {
            range: 10,
            healPercent: 0.2,
            defensePenalty: 0.25,
          },
        },
      ],
      assignedBuildingId: null,
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
    },
    spec_05: {
      id: 'spec_05',
      name: 'Ash Harvester',
      description:
        'Buildings destroyed by lava within range 10 grant 3 wood. Lava advances 1 turn faster.',
      effects: [
        {
          type: 'LAVA_HARVEST',
          params: {
            range: 10,
            woodGrant: 3,
            lavaSpeedup: 1,
          },
        },
      ],
      assignedBuildingId: null,
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
 * Applies specialist effects to the game state.
 * STUB: Returns state unchanged for now.
 * Effects will be implemented in future prompts.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function applySpecialistEffects(state: Draft<GameState>): void {
  // Stub - effects not yet implemented
  // Just iterate through assigned specialists and do nothing
  for (const specialist of Object.values(state.specialists)) {
    if (specialist.assignedBuildingId !== null) {
      // Effects would be applied here based on specialist.effects
      // For now, this is a no-op
    }
  }
}
