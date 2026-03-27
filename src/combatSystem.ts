/**
 * Combat system module for Volcanae.
 * Implements Polytopia-style combat formulas and resolution logic.
 */

import type { Unit, GameState } from './types';
import type { Draft } from 'immer';
import { Faction } from './types';
import { useFloaterStore } from './floaterStore';

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
  // Calculate effective attack based on attacker's current HP ratio
  const attackerHpRatio = attacker.stats.currentHp / attacker.stats.maxHp;
  const effectiveAttack = attacker.stats.attack * (0.5 + 0.5 * attackerHpRatio);

  // Calculate effective defense based on defender's current HP ratio
  const defenderHpRatio = defender.stats.currentHp / defender.stats.maxHp;
  const effectiveDefense =
    defender.stats.defense * (0.5 + 0.5 * defenderHpRatio);

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
 * - If defender survives, applies counter-damage to attacker
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

  // Calculate combat result
  const combatResult = calculateCombat(attacker, defender);

  // Apply damage to defender
  const newDefenderHp = defender.stats.currentHp - combatResult.defenderHpLost;
  const defenderDead = newDefenderHp <= 0;

  // If defender survives, apply counter-damage to attacker
  const attackerTakesCounterDamage = !defenderDead;
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
}
