/**
 * Specialist system module for Volcanae.
 * Implements global specialist storage, effect application, and upkeep.
 *
 * Rules:
 * - Specialists are global: a specialist is active as soon as it is in
 *   state.globalSpecialistStorage.
 * - No building assignment is required or used.
 * - Upkeep is deducted once per player turn; specialists that cannot pay
 *   become dormant and their effects are revoked.
 * - Zero-upkeep specialists are never dormant.
 */

import type { GameState, Specialist } from './types';
import type { Draft } from 'immer';
import { Faction, BuildingType, UnitTag, UnitType } from './types';
import { ABILITIES, SPECIALIST_DEFINITIONS } from './gameConfig';
import { applyTagStatEffects, revokeTagStatEffects } from './techSystem';

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

/** Returns true if any globally-owned, non-dormant specialist has the given effect type. */
export function isSpecialistEffectActive(
  state: GameState | Draft<GameState>,
  effectType: string,
): boolean {
  for (const specId of state.globalSpecialistStorage) {
    const spec = state.specialists[specId];
    if (spec && !spec.dormant && spec.effects.some((e) => e.type === effectType)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the unit tags that globally-owned, non-dormant specialists grant to a given unit type.
 * Used in recruitUnit to ensure newly spawned units carry specialist-granted tags.
 */
export function getTagsFromActiveSpecialists(
  state: GameState | Draft<GameState>,
  unitType: UnitType,
): UnitTag[] {
  const tags: UnitTag[] = [];
  for (const specId of state.globalSpecialistStorage) {
    const spec = state.specialists[specId];
    if (!spec || spec.dormant) continue;
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
      (building.type === BuildingType.WATCHTOWER || building.type === BuildingType.OUTPOST ||
       building.type === BuildingType.CRYSTAL_TOWER)
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
      applyTagStatEffects(unit, tag);
    }
  }
}

/**
 * Reverts GRANT_UNIT_TAG_ALL specialist effect: removes `tag` from all player
 * units of `unitType`.  Only removes if no other globally-owned, non-dormant
 * specialist also grants the same tag to the same unit type.
 */
function revokeUnitTagFromAllUnits(
  state: Draft<GameState>,
  unitType: UnitType,
  tag: UnitTag,
): void {
  // Check if another still-active (in globalStorage and non-dormant) specialist also grants this tag
  const stillGranted = state.globalSpecialistStorage.some((specId) => {
    const s = state.specialists[specId];
    return (
      s &&
      !s.dormant &&
      s.effects.some(
        (e) =>
          e.type === 'GRANT_UNIT_TAG_ALL' &&
          e.params.unitType === unitType &&
          e.params.tag === tag,
      )
    );
  });
  if (stillGranted) return;

  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.PLAYER && unit.type === unitType) {
      const idx = unit.tags.indexOf(tag);
      if (idx !== -1) {
        unit.tags.splice(idx, 1);
        revokeTagStatEffects(unit, tag);
      }
    }
  }
}


// ============================================================================
// SPECIALIST ACTIONS (hire / apply / revoke for individual specialists)
// ============================================================================

/**
 * Applies the effects of a single specialist to the current game state.
 * Safe to call multiple times — all effect application is idempotent.
 * Called immediately when a specialist is added to globalSpecialistStorage.
 */
export function applyEffectsForSpecialist(
  state: Draft<GameState>,
  specialist: Specialist,
): void {
  if (specialist.dormant) return;
  for (const effect of specialist.effects) {
    if (effect.type === 'FORTIFIED_GARRISON') {
      setFortifiedGarrisonState(state, true);
    } else if (effect.type === 'GRANT_UNIT_TAG_ALL') {
      applyUnitTagToAllUnits(state, effect.params.unitType as UnitType, effect.params.tag as UnitTag);
    }
  }
}

/**
 * Revokes the effects of a single specialist from the current game state.
 * Called immediately when a specialist is removed from globalSpecialistStorage.
 */
export function revokeEffectsForSpecialist(
  state: Draft<GameState>,
  specialist: Specialist,
): void {
  for (const effect of specialist.effects) {
    if (effect.type === 'FORTIFIED_GARRISON') {
      if (!isSpecialistEffectActive(state, 'FORTIFIED_GARRISON')) {
        setFortifiedGarrisonState(state, false);
      }
    } else if (effect.type === 'GRANT_UNIT_TAG_ALL') {
      revokeUnitTagFromAllUnits(state, effect.params.unitType as UnitType, effect.params.tag as UnitTag);
    }
  }
}

/**
 * Deducts upkeep costs for all globally-owned specialists at the end of each player turn.
 * Specialists whose upkeep cannot be paid are marked dormant (effects disabled).
 * Specialists with zero upkeep are never affected.
 *
 * Must be called inside an immer-draft context (Phase 6 bookkeeping in endPlayerTurn).
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function deductSpecialistUpkeep(state: Draft<GameState>): void {
  for (const specId of state.globalSpecialistStorage) {
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
 * Applies specialist effects to the game state for all globally-owned specialists.
 * Called every turn after deductSpecialistUpkeep so that any dormancy changes are
 * immediately reflected on units.
 *
 * - Non-dormant specialists in globalSpecialistStorage: effects are applied (idempotent).
 * - Dormant specialists: effects are revoked (if no other active specialist still grants them).
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function applySpecialistEffects(state: Draft<GameState>): void {
  for (const specId of state.globalSpecialistStorage) {
    const specialist = state.specialists[specId];
    if (!specialist) continue;

    const isDormant = !!specialist.dormant;

    for (const effect of specialist.effects) {
      if (effect.type === 'FORTIFIED_GARRISON') {
        if (!isDormant) {
          setFortifiedGarrisonState(state, true);
        } else {
          // Revert garrison bonus if no other non-dormant specialist still grants it
          if (!isSpecialistEffectActive(state, 'FORTIFIED_GARRISON')) {
            setFortifiedGarrisonState(state, false);
          }
        }
      } else if (effect.type === 'GRANT_UNIT_TAG_ALL') {
        if (!isDormant) {
          applyUnitTagToAllUnits(
            state,
            effect.params.unitType as UnitType,
            effect.params.tag as UnitTag,
          );
        } else {
          revokeUnitTagFromAllUnits(
            state,
            effect.params.unitType as UnitType,
            effect.params.tag as UnitTag,
          );
        }
      }
    }
  }
}
