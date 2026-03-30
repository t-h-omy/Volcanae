/**
 * Game conditions module for Volcanae.
 * Implements win and loss condition checking.
 *
 * Win condition:
 * - Player wins when they own a STRONGHOLD in zone 5 (the northernmost zone)
 * - On win: set state.phase to VICTORY
 *
 * Loss conditions:
 * - Player loses if they have zero player-owned strongholds at any point
 * - On loss: set state.phase to GAME_OVER
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, GamePhase } from './types';
import { MAP } from './gameConfig';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the zone number (1-5) for a given position.
 * Zone 1 is closest to lava, zone 5 is northernmost.
 * Returns 0 for positions in the lava buffer.
 */
function getZoneForPosition(position: Position): number {
  const row = position.y;
  if (row < MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((row - MAP.LAVA_BUFFER_ROWS) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

// ============================================================================
// WIN CONDITION
// ============================================================================

/**
 * Checks if the player has won.
 * Player wins when they own a STRONGHOLD in zone 5 (the northernmost zone).
 * Since strongholds can be destroyed (captured creates ruin), the player may need
 * to reconstruct one in zone 5 using a unit with BUILDANDCAPTURE tag.
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

  const playerStrongholds = Object.values(state.buildings).filter(
    (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER
  );

  // Check if any player-owned stronghold is in zone 5
  const hasZone5Stronghold = playerStrongholds.some(
    (b) => getZoneForPosition(b.position) === MAP.ZONE_COUNT
  );

  if (hasZone5Stronghold) {
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
