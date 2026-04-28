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
import { Faction, BuildingType, UnitTag, UnitType } from './types';
import { BUILDINGS, ABILITIES, SPECIALIST_DEFINITIONS } from './gameConfig';

// ============================================================================
// INITIAL SPECIALISTS
// ============================================================================

/**
 * Creates the 5 specialists for the game.
 * These are not yet in globalSpecialistStorage — the player must find them via cave monsters.
 */
export function createInitialSpecialists(): Record<string, Specialist> {
  const result: Record<string, Specialist> = {};
  for (const [id, def] of Object.entries(SPECIALIST_DEFINITIONS)) {
    result[id] = {
      id,
      name: def.name,
      description: def.description,
      effects: def.effects,
      assignedBuildingId: null,
      upkeepIron: def.upkeepIron ?? 0,
      upkeepWood: def.upkeepWood ?? 0,
      dormant: false,
    };
  }
  return result;
}

// ============================================================================
// EFFECT APPLICATION HELPERS
// ============================================================================

/** Returns true if any specialist with the given effect type is currently assigned (not in global storage). */
export function isSpecialistEffectActive(
  state: GameState | Draft<GameState>,
  effectType: string,
): boolean {
  for (const spec of Object.values(state.specialists)) {
    if (spec.assignedBuildingId !== null && spec.effects.some((e) => e.type === effectType)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the unit tags that active (assigned) specialists grant to a given unit type.
 * Used in recruitUnit to ensure newly spawned units carry specialist-granted tags.
 */
export function getTagsFromActiveSpecialists(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): UnitTag[] {
  const tags: UnitTag[] = [];
  for (const spec of Object.values(state.specialists)) {
    if (spec.assignedBuildingId === null || spec.dormant) continue;
    for (const effect of spec.effects) {
      if (
        effect.type === 'GRANT_UNIT_TAG_ALL' &&
        effect.params.unitType === unitType
      ) {
        const tag = effect.params.tag as UnitTag;
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }
  return tags;
}

/**
 * Applies FORTIFIED_GARRISON stat bonus to a single building's combatStats.
 * No-op if the building has no combatStats.
 */
function applyFortifiedGarrisonBonus(building: Draft<GameState>['buildings'][string]): void {
  if (!building.combatStats) return;
  building.combatStats.attack += ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS;
  building.combatStats.attackRange += ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS;
}

/**
 * Reverts FORTIFIED_GARRISON stat bonus from a single building's combatStats.
 * No-op if the building has no combatStats.
 */
function revertFortifiedGarrisonBonus(building: Draft<GameState>['buildings'][string]): void {
  if (!building.combatStats) return;
  building.combatStats.attack -= ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS;
  building.combatStats.attackRange -= ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS;
}

/**
 * Applies or reverts the FORTIFIED_GARRISON bonus to all player-owned
 * Watchtower and Outpost buildings, then updates state.fortifiedGarrisonActive.
 */
function setFortifiedGarrisonState(state: Draft<GameState>, active: boolean): void {
  if (active === state.fortifiedGarrisonActive) return; // Already in the target state
  for (const building of Object.values(state.buildings)) {
    if (
      building.faction === Faction.PLAYER &&
      (building.type === BuildingType.WATCHTOWER || building.type === BuildingType.OUTPOST)
    ) {
      if (active) {
        applyFortifiedGarrisonBonus(building);
      } else {
        revertFortifiedGarrisonBonus(building);
      }
    }
  }
  state.fortifiedGarrisonActive = active;
}

/**
 * Applies GRANT_UNIT_TAG_ALL specialist effect: adds `tag` to all currently
 * existing player units of `unitType` that don't already have it.
 */
function applyUnitTagToAllUnits(
  state: Draft<GameState>,
  unitType: UnitType,
  tag: UnitTag,
): void {
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER && unit.type === unitType && !unit.tags.includes(tag)) {
      unit.tags.push(tag);
    }
  }
}

/**
 * Reverts GRANT_UNIT_TAG_ALL specialist effect: removes `tag` from all player
 * units of `unitType`.  Only removes if no other active specialist grants the
 * same tag to the same unit type (handles duplicate specs defensively).
 */
function revokeUnitTagFromAllUnits(
  state: Draft<GameState>,
  unitType: UnitType,
  tag: UnitTag,
): void {
  // Check if another still-active specialist also grants this tag to this unit type
  const stillGranted = Object.values(state.specialists).some(
    (s) =>
      s.assignedBuildingId !== null &&
      s.effects.some(
        (e) =>
          e.type === 'GRANT_UNIT_TAG_ALL' &&
          e.params.unitType === unitType &&
          e.params.tag === tag,
      ),
  );
  if (stillGranted) return;

  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER && unit.type === unitType) {
      const idx = unit.tags.indexOf(tag);
      if (idx !== -1) unit.tags.splice(idx, 1);
    }
  }
}



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

  // Apply specialist effects
  for (const effect of specialist.effects) {
    if (effect.type === 'FORTIFIED_GARRISON') {
      setFortifiedGarrisonState(state, true);
    } else if (effect.type === 'GRANT_UNIT_TAG_ALL') {
      applyUnitTagToAllUnits(state, effect.params.unitType as UnitType, effect.params.tag as UnitTag);
    }
  }

  // Disable building for the configured number of turns
  building.isDisabledForTurns = BUILDINGS.SPECIALIST_ASSIGN_DISABLE_TURNS;
}

/**
 * Unassigns a specialist from a building and returns it to global storage.
 * - Removes specialist from building.specialistSlot
 * - Adds specialist to globalSpecialistStorage
 * - Updates specialist.assignedBuildingId to null
 * - Disables building for SPECIALIST_ASSIGN_DISABLE_TURNS
 * - Revokes the specialist's effects from units/buildings
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

  // Remove specialist from building FIRST so that revokeUnitTagFromAllUnits
  // correctly detects that this specialist is no longer assigned.
  building.specialistSlot = null;
  specialist.assignedBuildingId = null;

  // Revoke specialist effects
  for (const effect of specialist.effects) {
    if (effect.type === 'FORTIFIED_GARRISON') {
      // Only revert if no other specialist also grants FORTIFIED_GARRISON
      if (!isSpecialistEffectActive(state, 'FORTIFIED_GARRISON')) {
        setFortifiedGarrisonState(state, false);
      }
    } else if (effect.type === 'GRANT_UNIT_TAG_ALL') {
      revokeUnitTagFromAllUnits(state, effect.params.unitType as UnitType, effect.params.tag as UnitTag);
    }
  }

  // Return specialist to global storage
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

    // No upkeep — skip entirely; dormant state is untouched
    if (iron === 0 && wood === 0) continue;

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
