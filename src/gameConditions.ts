/**
 * Game conditions module for Volcanae.
 * Implements win and loss condition checking.
 *
 * Win condition:
 * - Player wins when they own a STRONGHOLD in zone 5 (the northernmost zone, low Y)
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
 * Zone 1 is closest to lava (high Y, south), zone 5 is northernmost (low Y).
 * Returns 0 for positions in the lava buffer (high Y beyond playable area).
 */
function getZoneForPosition(position: Position): number {
  const row = position.y;
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

// ============================================================================
// WIN CONDITION
// ============================================================================

/**
 * Checks if the player has won.
 * Win conditions (either is sufficient):
 * 1. Player owns a STRONGHOLD in zone 5 (the northernmost zone, low Y).
 *    Since strongholds can be destroyed (captured creates ruin), the player may need
 *    to reconstruct one in zone 5 using a unit with BUILDANDCAPTURE tag.
 * 2. All Infernal Sanctums have been destroyed. The game intro instructs the player
 *    to "raze every Infernal Sanctum", so eliminating the last one is a win.
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

  // Win condition 1: player-owned stronghold in zone 5
  const hasZone5Stronghold = playerStrongholds.some(
    (b) => getZoneForPosition(b.position) === MAP.ZONE_COUNT
  );

  if (hasZone5Stronghold) {
    state.phase = GamePhase.VICTORY;
    return;
  }

  // Win condition 2: all Infernal Sanctums have been destroyed.
  // Sanctums are placed in zones 4–5 at game start; destroying the last one
  // fulfils the core objective of the game. Guard with turn > 0 to avoid a
  // false positive if checkWinCondition is ever called before buildings are placed.
  const hasRemainingInfernalSanctum = Object.values(state.buildings).some(
    (b) => b.type === BuildingType.INFERNALSANCTUM
  );

  if (state.turn > 0 && !hasRemainingInfernalSanctum) {
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
 * @param cause - What caused the potential loss: 'LAVA', 'ENEMY', or null
 */
export function checkLossCondition(state: Draft<GameState>, cause: 'LAVA' | 'ENEMY' | null = null): void {
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
    state.gameOverCause = cause;
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
 * @param cause - What caused the potential loss: 'LAVA', 'ENEMY', or null
 * @returns True if the game has ended (victory or game over)
 */
export function checkGameConditions(state: Draft<GameState>, cause: 'LAVA' | 'ENEMY' | null = null): boolean {
  checkWinCondition(state);
  checkLossCondition(state, cause);
  return state.phase === GamePhase.VICTORY || state.phase === GamePhase.GAME_OVER;
}
