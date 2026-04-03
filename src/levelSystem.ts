/**
 * Level system for Volcanae.
 * Handles XP grants, level-up application, and deferred enemy level-up processing.
 */

import type { Draft } from 'immer';
import type { GameState } from './types';
import { Faction, GamePhase } from './types';
import { UNITS, UNIT_LEVEL_UP, XP } from './gameConfig';

/**
 * Returns the target level for a unit based on its current XP.
 * Never exceeds XP.MAX_LEVEL.
 */
export function computeLevelFromXp(unitType: string, xp: number): number {
  const levelDefs = UNIT_LEVEL_UP[unitType];
  if (!levelDefs || levelDefs.length === 0) return 1;

  let targetLevel = 1;
  for (let i = 0; i < levelDefs.length; i++) {
    if (xp >= levelDefs[i].xpRequired) {
      targetLevel = i + 2; // level-up definitions start at level 2
    }
  }

  return Math.min(targetLevel, XP.MAX_LEVEL);
}

/**
 * Applies level-up stat changes to a unit, upgrading from its current level
 * to targetLevel. Restores HP to the new maxHp on each level gained.
 * Uses base stats from UNITS[unitType] for percent calculations.
 * Mutates the immer draft directly.
 */
export function applyLevelUps(
  state: Draft<GameState>,
  unitId: string,
  targetLevel: number,
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  const levelDefs = UNIT_LEVEL_UP[unit.type];
  if (!levelDefs) return;

  const baseStats = UNITS[unit.type as keyof typeof UNITS];

  for (let newLevel = unit.level + 1; newLevel <= targetLevel; newLevel++) {
    const levelDef = levelDefs[newLevel - 2]; // index 0 = level 2
    if (!levelDef) continue;

    for (const boost of levelDef.boosts) {
      const stat = boost.stat;
      if (boost.mode === 'add') {
        (unit.stats[stat] as number) += boost.value;
      } else if (boost.mode === 'percent') {
        const baseValue = (baseStats as unknown as Record<string, number>)[stat] ?? unit.stats[stat];
        (unit.stats[stat] as number) += Math.round((baseValue as number) * boost.value / 100);
      }
    }

    // Restore HP to new maxHp after applying boosts for this level
    unit.stats.currentHp = unit.stats.maxHp;
    unit.level = newLevel;
  }
}

/**
 * Grants XP to a unit and immediately applies level-up when appropriate:
 * - PLAYER units: always level up immediately.
 * - ENEMY units during ENEMY_TURN: level up immediately.
 * - ENEMY units during PLAYER_TURN: XP is banked; level-up is deferred to
 *   the call of processEnemyLevelUps at the start of the next enemy turn.
 * Mutates the immer draft directly.
 */
export function grantXp(
  state: Draft<GameState>,
  unitId: string,
  amount: number,
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  unit.xp += amount;

  const targetLevel = computeLevelFromXp(unit.type, unit.xp);
  if (targetLevel <= unit.level) return;

  if (unit.faction === Faction.PLAYER) {
    // Player units always level up immediately
    applyLevelUps(state, unitId, targetLevel);
  } else if (unit.faction === Faction.ENEMY && state.phase === GamePhase.ENEMY_TURN) {
    // Enemy units level up immediately during their own turn
    applyLevelUps(state, unitId, targetLevel);
  }
  // Otherwise (enemy unit during player turn): defer to processEnemyLevelUps
}

/**
 * Called at the start of the enemy turn.
 * Finds all enemy units whose XP meets the threshold for their next level
 * and applies level-ups to them.
 */
export function processEnemyLevelUps(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.ENEMY) continue;
    const targetLevel = computeLevelFromXp(unit.type, unit.xp);
    if (targetLevel > unit.level) {
      applyLevelUps(state, unit.id, targetLevel);
    }
  }
}
