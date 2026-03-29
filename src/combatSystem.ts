/**
 * Combat system module for Volcanae.
 * Implements Polytopia-style combat formulas and resolution logic.
 * Supports both unit-vs-unit and building-vs-unit combat.
 */

import type { Unit, Building, GameState } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, UnitTag } from './types';
import { useFloaterStore } from './floaterStore';
import { isTileWithinEdgeCircleRange } from './rangeUtils';

// ============================================================================
// COMBAT RESULT INTERFACE
// ============================================================================

export interface CombatResult {
  /** HP lost by the attacker (from counterattack) */
  attackerHpLost: number;
  /** HP lost by the defender */
  defenderHpLost: number;
}

// ============================================================================
// COMBATANT ABSTRACTION
// ============================================================================

/**
 * A combatant represents a unit or a building that can participate in combat.
 * This unifies the combat interface so both units and attacking buildings
 * can use the same combat formula.
 */
export interface Combatant {
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  attackRange: number;
  positionX: number;
  positionY: number;
  faction: Faction;
  tags: UnitTag[];
}

/** Extracts combatant stats from a Unit. */
export function unitToCombatant(unit: Unit): Combatant {
  return {
    currentHp: unit.stats.currentHp,
    maxHp: unit.stats.maxHp,
    attack: unit.stats.attack,
    defense: unit.stats.defense,
    attackRange: unit.stats.attackRange,
    positionX: unit.position.x,
    positionY: unit.position.y,
    faction: unit.faction,
    tags: unit.tags,
  };
}

/** Extracts combatant stats from a Building with combat stats. */
export function buildingToCombatant(building: Building): Combatant | null {
  if (!building.combatStats || !building.faction) return null;
  return {
    currentHp: building.hp,
    maxHp: building.maxHp,
    attack: building.combatStats.attack,
    defense: building.combatStats.defense,
    attackRange: building.combatStats.attackRange,
    positionX: building.position.x,
    positionY: building.position.y,
    faction: building.faction,
    tags: building.tags,
  };
}

// ============================================================================
// COMBAT CALCULATIONS
// ============================================================================

/**
 * Calculates the combat result between an attacker and defender.
 * Uses Polytopia-style combat formula:
 * - Effective attack = attack × (0.5 + 0.5 × (currentHp / maxHp))
 * - Effective defense = defense × (0.5 + 0.5 × (currentHp / maxHp))
 * - Damage to defender = effectiveAttack × (effectiveAttack / (effectiveAttack + effectiveDefense))
 * - Counter-damage to attacker = effectiveDefense × (effectiveDefense / (effectiveDefense + effectiveAttack))
 *
 * @param attacker - The attacking unit
 * @param defender - The defending unit
 * @returns Combat result with HP lost by both units
 */
export function calculateCombat(attacker: Unit, defender: Unit): CombatResult {
  return calculateCombatFromStats(unitToCombatant(attacker), unitToCombatant(defender));
}

/**
 * General combat calculation using Combatant stats (works for both units and buildings).
 */
export function calculateCombatFromStats(attacker: Combatant, defender: Combatant): CombatResult {
  // Calculate effective attack based on attacker's current HP ratio
  const attackerHpRatio = attacker.currentHp / attacker.maxHp;
  const effectiveAttack = attacker.attack * (0.5 + 0.5 * attackerHpRatio);

  // Calculate effective defense based on defender's current HP ratio
  const defenderHpRatio = defender.currentHp / defender.maxHp;
  const effectiveDefense =
    defender.defense * (0.5 + 0.5 * defenderHpRatio);

  // Calculate damage dealt to defender
  const totalPower = effectiveAttack + effectiveDefense;
  const damageToDefender =
    effectiveAttack * (effectiveAttack / totalPower);

  // Calculate counter-damage dealt to attacker
  const counterDamageToAttacker =
    effectiveDefense * (effectiveDefense / totalPower);

  return {
    attackerHpLost: Math.round(counterDamageToAttacker),
    defenderHpLost: Math.round(damageToDefender),
  };
}

// ============================================================================
// ATTACK RESOLUTION
// ============================================================================

/**
 * Resolves an attack between two units by mutating the draft state.
 * - Applies damage to defender
 * - If defender survives AND the attacker is within the defender's attack range,
 *   applies counter-damage to attacker
 * - Removes dead units from state
 * - Marks attacker as having acted and moved this turn
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param attackerId - ID of the attacking unit
 * @param defenderId - ID of the defending unit
 */
export function resolveAttack(
  state: Draft<GameState>,
  attackerId: string,
  defenderId: string,
  suppressFloaters?: boolean
): void {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];

  // Validate units exist
  if (!attacker || !defender) {
    return;
  }

  // Capture defender's position before it is potentially removed from state
  const defenderPosition = { x: defender.position.x, y: defender.position.y };

  // Calculate combat result
  const combatResult = calculateCombat(attacker, defender);

  // Apply damage to defender
  const newDefenderHp = defender.stats.currentHp - combatResult.defenderHpLost;
  const defenderDead = newDefenderHp <= 0;

  // If defender survives AND attacker is within defender's attack range, apply counter-damage
  const defenderCanCounterAttack = isTileWithinEdgeCircleRange(
    defender.position.x, defender.position.y,
    attacker.position.x, attacker.position.y,
    defender.stats.attackRange,
  );
  const attackerTakesCounterDamage = !defenderDead && defenderCanCounterAttack;
  const newAttackerHp = attackerTakesCounterDamage
    ? attacker.stats.currentHp - combatResult.attackerHpLost
    : attacker.stats.currentHp;
  const attackerDead = newAttackerHp <= 0;

  // Trigger damage floaters (visual only)
  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: defender.position.x,
        y: defender.position.y,
        isEnemy: defender.faction === Faction.ENEMY,
      });
    }
    if (attackerTakesCounterDamage && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: attacker.position.x,
        y: attacker.position.y,
        isEnemy: attacker.faction === Faction.ENEMY,
      });
    }
  }

  // Update attacker
  if (attackerDead) {
    // Remove attacker from grid
    const attackerTile = state.grid[attacker.position.y][attacker.position.x];
    if (attackerTile.unitId === attackerId) {
      attackerTile.unitId = null;
    }
    // Remove attacker from units
    delete state.units[attackerId];
  } else {
    // Update attacker HP and mark as acted
    attacker.stats.currentHp = newAttackerHp;
    attacker.hasActedThisTurn = true;
    attacker.hasMovedThisTurn = true;
  }

  // Update defender
  if (defenderDead) {
    // Remove defender from grid
    const defenderTile = state.grid[defender.position.y][defender.position.x];
    if (defenderTile.unitId === defenderId) {
      defenderTile.unitId = null;
    }
    // Remove defender from units
    delete state.units[defenderId];
  } else {
    // Update defender HP
    defender.stats.currentHp = newDefenderHp;
  }

  // Melee attacker advances onto the tile the defeated defender occupied
  if (defenderDead && !attackerDead) {
    const attackerUnit = state.units[attackerId];
    if (attackerUnit && !attackerUnit.tags.includes(UnitTag.RANGED)) {
      const fromTile = state.grid[attackerUnit.position.y][attackerUnit.position.x];
      if (fromTile.unitId === attackerId) {
        fromTile.unitId = null;
      }
      const toTile = state.grid[defenderPosition.y][defenderPosition.x];
      toTile.unitId = attackerId;
      attackerUnit.position.x = defenderPosition.x;
      attackerUnit.position.y = defenderPosition.y;
    }
  }
}

// ============================================================================
// BUILDING ATTACK RESOLUTION
// ============================================================================

/**
 * Resolves an attack by a building (e.g. watchtower) against a unit.
 * Buildings always attack at range so there is no melee advance.
 * The defending unit may counter-attack if within its own range.
 * If the building's HP reaches 0, it becomes neutral instead of being destroyed.
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param buildingId - ID of the attacking building
 * @param defenderId - ID of the defending unit
 * @param suppressFloaters - Whether to suppress visual damage floaters
 */
export function resolveBuildingAttack(
  state: Draft<GameState>,
  buildingId: string,
  defenderId: string,
  suppressFloaters?: boolean,
): void {
  const building = state.buildings[buildingId];
  const defender = state.units[defenderId];

  if (!building || !building.combatStats || !building.faction || !defender) return;

  const buildingCombatant = buildingToCombatant(building)!;
  const defenderCombatant = unitToCombatant(defender);

  const combatResult = calculateCombatFromStats(buildingCombatant, defenderCombatant);

  const newDefenderHp = defender.stats.currentHp - combatResult.defenderHpLost;
  const defenderDead = newDefenderHp <= 0;

  // Defender can counter-attack if it survives and building is within its attack range
  const defenderCanCounter = isTileWithinEdgeCircleRange(
    defender.position.x, defender.position.y,
    building.position.x, building.position.y,
    defender.stats.attackRange,
  );
  const buildingTakesCounterDamage = !defenderDead && defenderCanCounter;
  const newBuildingHp = buildingTakesCounterDamage
    ? building.hp - combatResult.attackerHpLost
    : building.hp;
  const buildingDead = newBuildingHp <= 0;

  // Trigger damage floaters
  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: defender.position.x,
        y: defender.position.y,
        isEnemy: defender.faction === Faction.ENEMY,
      });
    }
    if (buildingTakesCounterDamage && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: building.position.x,
        y: building.position.y,
        isEnemy: building.faction === Faction.ENEMY,
      });
    }
  }

  // Update building
  if (buildingDead) {
    // Building becomes neutral instead of being destroyed
    building.hp = building.maxHp;
    building.faction = null;
    building.hasActedThisTurn = false;
    building.specialistSlot = null;
    building.turnCapturedByPlayer = null;
    building.wasEnemyOwnedBeforeCapture = false;
  } else {
    building.hp = newBuildingHp;
    building.hasActedThisTurn = true;
  }

  // Update defender
  if (defenderDead) {
    const defenderTile = state.grid[defender.position.y][defender.position.x];
    if (defenderTile.unitId === defenderId) {
      defenderTile.unitId = null;
    }
    delete state.units[defenderId];
  } else {
    defender.stats.currentHp = newDefenderHp;
  }
}

/**
 * Resolves an attack by a unit against a building (e.g. attacking a watchtower).
 * If the building's HP reaches 0, it becomes neutral instead of being destroyed.
 * The building may counter-attack if it has combat stats and the unit is in range.
 */
export function resolveAttackOnBuilding(
  state: Draft<GameState>,
  attackerId: string,
  buildingId: string,
  suppressFloaters?: boolean,
): void {
  const attacker = state.units[attackerId];
  const building = state.buildings[buildingId];

  if (!attacker || !building) return;

  // Only buildings with combat stats can be attacked / counter-attack
  const buildingCombatant = building.combatStats ? buildingToCombatant(building) : null;

  const attackerCombatant = unitToCombatant(attacker);

  // Calculate combat - if building has combat stats use them for defense, otherwise use 0
  const defenderStats: Combatant = buildingCombatant ?? {
    currentHp: building.hp,
    maxHp: building.maxHp,
    attack: 0,
    defense: 0,
    attackRange: 0,
    positionX: building.position.x,
    positionY: building.position.y,
    faction: building.faction ?? Faction.ENEMY,
    tags: building.tags,
  };

  const combatResult = calculateCombatFromStats(attackerCombatant, defenderStats);

  const newBuildingHp = building.hp - combatResult.defenderHpLost;
  const buildingDead = newBuildingHp <= 0;

  // Building can counter if it has combat stats, survives, and attacker is in its range
  const canCounter = buildingCombatant && !buildingDead && isTileWithinEdgeCircleRange(
    building.position.x, building.position.y,
    attacker.position.x, attacker.position.y,
    buildingCombatant.attackRange,
  );
  const newAttackerHp = canCounter
    ? attacker.stats.currentHp - combatResult.attackerHpLost
    : attacker.stats.currentHp;
  const attackerDead = newAttackerHp <= 0;

  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: building.position.x,
        y: building.position.y,
        isEnemy: building.faction === Faction.ENEMY,
      });
    }
    if (canCounter && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: attacker.position.x,
        y: attacker.position.y,
        isEnemy: attacker.faction === Faction.ENEMY,
      });
    }
  }

  // Update attacker
  if (attackerDead) {
    const attackerTile = state.grid[attacker.position.y][attacker.position.x];
    if (attackerTile.unitId === attackerId) {
      attackerTile.unitId = null;
    }
    delete state.units[attackerId];
  } else {
    attacker.stats.currentHp = newAttackerHp;
    attacker.hasActedThisTurn = true;
    attacker.hasMovedThisTurn = true;
  }

  // Update building
  if (buildingDead) {
    // Building becomes neutral at 0 HP (for WATCHTOWER type)
    if (building.type === BuildingType.WATCHTOWER) {
      building.hp = building.maxHp;
      building.faction = null;
      building.hasActedThisTurn = false;
      building.specialistSlot = null;
      building.turnCapturedByPlayer = null;
      building.wasEnemyOwnedBeforeCapture = false;
    }
    // Other building types don't have combat stats currently
  } else {
    building.hp = newBuildingHp;
  }
}
