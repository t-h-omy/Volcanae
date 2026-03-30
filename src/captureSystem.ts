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
 * Updates the zonesUnlocked array based on player-owned strongholds.
 * A stronghold capture unlocks its zone AND the next zone.
 * This function always computes zones from the player's perspective because
 * zonesUnlocked is player-only state (only player captures are zone-gated).
 * It must be called whenever any stronghold changes ownership so that the
 * player's unlocked zones stay in sync.
 */
function updateZonesUnlocked(state: Draft<GameState>): void {
  // Collect all zones that should be unlocked for the player
  const unlockedZones = new Set<number>();

  // Zone 1 is always unlocked for the player
  unlockedZones.add(1);

  // Check all player-owned strongholds to determine which zones are unlocked
  for (const building of Object.values(state.buildings)) {
    if (building.type === BuildingType.STRONGHOLD && building.faction === Faction.PLAYER) {
      const zone = getZoneForPosition(building.position);

      // Owning a stronghold unlocks that zone and the next zone
      unlockedZones.add(zone);
      if (zone + 1 <= MAP.ZONE_COUNT) {
        unlockedZones.add(zone + 1);
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
 * - Unit has not moved this turn (cannot capture in the same turn as moving onto the building)
 * - Building exists and is not owned by the unit's faction
 * - Unit is on the same tile as the building
 * - Unit has the BUILDANDCAPTURE tag
 * - The building's zone is unlocked for player units (enemy units are NOT zone-locked)
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

  // Unit has moved this turn — cannot capture in the same turn as moving onto a building
  if (unit.hasMovedThisTurn) {
    return false;
  }

  // Unit does not have BUILDANDCAPTURE tag
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
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
 * Captures a building by DESTROYING it and turning its tile into a ruin.
 * A unit must not have moved this turn to capture (i.e. must have been
 * standing on the building at the start of the turn).
 * On success:
 * - Building is removed from state and its tile becomes a ruin
 * - Specialist handling: player captures move specialist to global storage;
 *   enemy captures cause the specialist to be lost
 * - If the building was a STRONGHOLD, zones are updated and threat may increase
 * - Unit is marked as having used all actions for this turn
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit capturing the building
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

  // Handle specialist
  if (building.specialistSlot) {
    const specialistId = building.specialistSlot;
    if (unit.faction === Faction.PLAYER) {
      // Player captures: move specialist to global storage
      state.globalSpecialistStorage.push(specialistId);
      if (state.specialists[specialistId]) {
        state.specialists[specialistId].assignedBuildingId = null;
      }
    } else {
      // Enemy captures: specialist is lost
      if (state.specialists[specialistId]) {
        delete state.specialists[specialistId];
      }
    }
  }

  // Store building info before removing
  const buildingType = building.type;
  const { x, y } = building.position;

  // Remove the building from state
  delete state.buildings[buildingId];

  // Clear grid tile
  const tile = state.grid[y][x];
  tile.buildingId = null;

  // Determine ruin type
  if (buildingType === BuildingType.STRONGHOLD) {
    tile.isStrongholdRuin = true;
  } else {
    tile.isRuin = true;
  }

  // If it was a stronghold, update zones and threat level
  if (buildingType === BuildingType.STRONGHOLD) {
    updateZonesUnlocked(state);
    // Increase threat level when player captures (destroys) a stronghold
    if (unit.faction === Faction.PLAYER) {
      increaseThreatOnStrongholdCapture(state);
    }
  }
}

// ============================================================================
// CAPTURE RESOLUTION
// ============================================================================

/**
 * Resolves any remaining pending captures (legacy / edge-case safety).
 * Since initiateCapture now completes captures immediately, this function
 * is a no-op under normal game flow. It is kept to handle any edge cases
 * where isBeingCapturedBy may still be set.
 *
 * Capturing now DESTROYS the building and turns the tile into a ruin.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function resolveCaptures(state: Draft<GameState>): void {
  // Collect building IDs first to avoid mutation during iteration
  const buildingIds = Object.keys(state.buildings);

  for (const buildingId of buildingIds) {
    const building = state.buildings[buildingId];
    if (!building) continue;

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

    // Handle specialist
    if (building.specialistSlot) {
      const specialistId = building.specialistSlot;
      if (capturingUnit.faction === Faction.PLAYER) {
        // Player captures: move specialist to global storage
        state.globalSpecialistStorage.push(specialistId);
        if (state.specialists[specialistId]) {
          state.specialists[specialistId].assignedBuildingId = null;
        }
      } else {
        // Enemy captures: specialist is lost
        if (state.specialists[specialistId]) {
          delete state.specialists[specialistId];
        }
      }
    }

    // Store building info before removing
    const buildingType = building.type;
    const { x, y } = building.position;

    // Remove the building from state
    delete state.buildings[buildingId];

    // Clear grid tile
    const tile = state.grid[y][x];
    tile.buildingId = null;

    // Determine ruin type
    if (buildingType === BuildingType.STRONGHOLD) {
      tile.isStrongholdRuin = true;
    } else {
      tile.isRuin = true;
    }

    // If it was a stronghold, update zones and threat level
    if (buildingType === BuildingType.STRONGHOLD) {
      updateZonesUnlocked(state);
      if (capturingUnit.faction === Faction.PLAYER) {
        increaseThreatOnStrongholdCapture(state);
      }
    }

    // Mark capturing unit actions
    capturingUnit.hasCapturedThisTurn = true;
    capturingUnit.hasMovedThisTurn = true;
    capturingUnit.hasActedThisTurn = true;
  }
}
