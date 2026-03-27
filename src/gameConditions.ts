/**
 * Game conditions module for Volcanae.
 * Implements win and loss condition checking.
 *
 * Win condition:
 * - Player wins when ALL not-destroyed strongholds are player-owned simultaneously
 * - On win: set state.phase to VICTORY
 *
 * Loss conditions:
 * - Player loses if they have zero player-owned strongholds at any point
 * - On loss: set state.phase to GAME_OVER
 */

import type { GameState } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, GamePhase } from './types';

// ============================================================================
// WIN CONDITION
// ============================================================================

/**
 * Checks if the player has won.
 * Player wins when ALL not-destroyed strongholds are player-owned simultaneously.
 * If win condition is met, sets state.phase to VICTORY.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function checkWinCondition(state: Draft<GameState>): void {
  // Don't check if game is already over
  if (
    state.phase === GamePhase.VICTORY ||
    state.phase === GamePhase.GAME_OVER
  ) {
    return;
  }

  const strongholds = Object.values(state.buildings).filter(
    (b) => b.type === BuildingType.STRONGHOLD
  );

  // No strongholds exist at all - don't trigger victory
  if (strongholds.length === 0) {
    return;
  }

  // Check if ALL strongholds are player-owned
  const allPlayerOwned = strongholds.every(
    (b) => b.faction === Faction.PLAYER
  );

  if (allPlayerOwned) {
    state.phase = GamePhase.VICTORY;
  }
}

// ============================================================================
// LOSS CONDITION
// ============================================================================

/**
 * Checks if the player has lost.
 * Player loses if they have zero player-owned strongholds at any point.
 * If loss condition is met, sets state.phase to GAME_OVER.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function checkLossCondition(state: Draft<GameState>): void {
  // Don't check if game is already over
  if (
    state.phase === GamePhase.VICTORY ||
    state.phase === GamePhase.GAME_OVER
  ) {
    return;
  }

  const playerStrongholds = Object.values(state.buildings).filter(
    (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER
  );

  if (playerStrongholds.length === 0) {
    state.phase = GamePhase.GAME_OVER;
  }
}

// ============================================================================
// COMBINED CHECK
// ============================================================================

/**
 * Checks both win and loss conditions.
 * Should be called after every player action resolves, after enemy turn resolves,
 * and after lava phase resolves.
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @returns True if the game has ended (victory or game over)
 */
export function checkGameConditions(state: Draft<GameState>): boolean {
  checkWinCondition(state);
  checkLossCondition(state);
  return state.phase === GamePhase.VICTORY || state.phase === GamePhase.GAME_OVER;
}
