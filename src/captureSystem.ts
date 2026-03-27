/**
 * Capture system module for Volcanae.
 * Implements building capture logic with zone unlock mechanics.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { BuildingType, UnitTag, Faction } from './types';
import { MAP } from './gameConfig';
import { increaseThreatOnStrongholdCapture } from './enemySystem';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the zone number (1-5) for a given position.
 * Zone 1: rows 5-24 (closest to lava)
 * Zone 5: rows 85-104 (northernmost)
 */
function getZoneForPosition(position: Position): number {
  const row = position.y;
  if (row < MAP.LAVA_BUFFER_ROWS) return 0; // Lava buffer, no zone
  const zoneIndex = Math.floor((row - MAP.LAVA_BUFFER_ROWS) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

/**
 * Checks if a unit is on the same tile as a building.
 */
function isUnitOnBuilding(
  state: GameState | Draft<GameState>,
  unitId: string,
  buildingId: string
): boolean {
  const unit = state.units[unitId];
  const building = state.buildings[buildingId];

  if (!unit || !building) {
    return false;
  }

  return (
    unit.position.x === building.position.x &&
    unit.position.y === building.position.y
  );
}

/**
 * Updates the zonesUnlocked array based on captured strongholds.
 * A stronghold capture unlocks its zone AND the next zone.
 */
function updateZonesUnlocked(
  state: Draft<GameState>,
  capturingFaction: Faction
): void {
  // Collect all zones that should be unlocked for the player
  const unlockedZones = new Set<number>();

  // Zone 1 is always unlocked for the player
  if (capturingFaction === Faction.PLAYER) {
    unlockedZones.add(1);
  }

  // Check all strongholds to determine which zones are unlocked
  for (const building of Object.values(state.buildings)) {
    if (building.type === BuildingType.STRONGHOLD) {
      const zone = getZoneForPosition(building.position);

      if (building.faction === capturingFaction) {
        // Owning a stronghold unlocks that zone and the next zone
        unlockedZones.add(zone);
        if (zone + 1 <= MAP.ZONE_COUNT) {
          unlockedZones.add(zone + 1);
        }
      }
    }
  }

  // Update state with sorted array of unlocked zones
  state.zonesUnlocked = Array.from(unlockedZones).sort((a, b) => a - b);
}

// ============================================================================
// CAPTURE VALIDATION
// ============================================================================

/**
 * Checks if a unit can initiate capture of a building.
 * A unit can capture if:
 * - Unit exists and has not captured this turn
 * - Building exists and is not owned by the unit's faction
 * - Unit is on the same tile as the building
 * - Unit does not have the NO_CAPTURE tag
 * - The building's zone is unlocked for the unit's faction
 *
 * @param state - Current game state
 * @param unitId - ID of the unit attempting to capture
 * @param buildingId - ID of the building to capture
 * @returns True if the unit can capture the building
 */
export function canCapture(
  state: GameState | Draft<GameState>,
  unitId: string,
  buildingId: string
): boolean {
  const unit = state.units[unitId];
  const building = state.buildings[buildingId];

  // Unit doesn't exist
  if (!unit) {
    return false;
  }

  // Building doesn't exist
  if (!building) {
    return false;
  }

  // Unit has already captured this turn
  if (unit.hasCapturedThisTurn) {
    return false;
  }

  // Unit has NO_CAPTURE tag
  if (unit.tags.includes(UnitTag.NO_CAPTURE)) {
    return false;
  }

  // Building is already owned by unit's faction
  if (building.faction === unit.faction) {
    return false;
  }

  // Unit is not on the same tile as the building
  if (!isUnitOnBuilding(state, unitId, buildingId)) {
    return false;
  }

  // Check zone lock for player units
  if (unit.faction === Faction.PLAYER) {
    const buildingZone = getZoneForPosition(building.position);
    if (!state.zonesUnlocked.includes(buildingZone)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// CAPTURE INITIATION
// ============================================================================

/**
 * Initiates capture of a building by a unit.
 * The capture will complete at the start of the next turn (via resolveCaptures).
 * While capturing:
 * - Unit cannot move, attack, or do anything else
 * - hasCapturedThisTurn, hasMovedThisTurn, hasActedThisTurn are all set to true
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit initiating capture
 * @param buildingId - ID of the building to capture
 */
export function initiateCapture(
  state: Draft<GameState>,
  unitId: string,
  buildingId: string
): void {
  // Validate capture is allowed
  if (!canCapture(state, unitId, buildingId)) {
    return;
  }

  const unit = state.units[unitId];
  const building = state.buildings[buildingId];

  // Mark unit as having performed all actions (locked for this turn)
  unit.hasMovedThisTurn = true;
  unit.hasActedThisTurn = true;
  unit.hasCapturedThisTurn = true;

  // Mark building as being captured
  building.isBeingCapturedBy = unitId;
  building.captureProgress = 1;
}

// ============================================================================
// CAPTURE RESOLUTION
// ============================================================================

/**
 * Resolves all pending captures at the end of the turn.
 * For each building being captured:
 * - If the capturing unit still exists, complete the capture
 * - Change building faction to capturing unit's faction
 * - If building had an enemy specialist, remove it
 * - If captured building is a STRONGHOLD, update zonesUnlocked
 * - Reset building capture state
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function resolveCaptures(state: Draft<GameState>): void {
  for (const building of Object.values(state.buildings)) {
    // Skip buildings not being captured
    if (!building.isBeingCapturedBy) {
      continue;
    }

    const capturingUnit = state.units[building.isBeingCapturedBy];

    // If capturing unit was killed, cancel the capture
    if (!capturingUnit) {
      building.isBeingCapturedBy = null;
      building.captureProgress = 0;
      continue;
    }

    // Complete the capture
    const previousFaction = building.faction;

    // Track when building was captured by player (for enemy AI retake logic)
    if (capturingUnit.faction === Faction.PLAYER) {
      building.wasEnemyOwnedBeforeCapture = building.faction === Faction.ENEMY;
      building.turnCapturedByPlayer = state.turn;
    } else {
      building.turnCapturedByPlayer = null;
    }

    building.faction = capturingUnit.faction;

    // If building had an enemy specialist, remove it
    if (building.specialistSlot && previousFaction !== capturingUnit.faction) {
      const specialistId = building.specialistSlot;
      if (state.specialists[specialistId]) {
        delete state.specialists[specialistId];
      }
      building.specialistSlot = null;
    }

    // Reset capture state
    building.isBeingCapturedBy = null;
    building.captureProgress = 0;

    // If it's a stronghold, update zones and threat level
    if (building.type === BuildingType.STRONGHOLD) {
      updateZonesUnlocked(state, capturingUnit.faction);

      // Increase threat level when player captures a stronghold
      if (capturingUnit.faction === Faction.PLAYER) {
        increaseThreatOnStrongholdCapture(state);
      }
    }
  }
}
