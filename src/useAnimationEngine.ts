/**
 * Animation engine hook for Volcanae.
 * Processes the event queue with timing, camera movement, and state application.
 * Used once at the top level of App.tsx.
 */

import { useEffect } from 'react';
import { useAnimationStore } from './animationStore';
import { useGameStore } from './gameStore';
import { ANIMATION, MAP } from './gameConfig';
import type { GameEvent } from './gameEvents';
import type { Position } from './types';

// ============================================================================
// HELPERS
// ============================================================================

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Returns the Position the camera should center on for each event type.
 */
function eventPosition(event: GameEvent): Position {
  switch (event.type) {
    case 'ENEMY_SPAWN':
      return event.position;
    case 'ENEMY_MOVE':
      return event.to;
    case 'ENEMY_ATTACK':
      return event.defenderPosition;
    case 'UNIT_DEATH':
      return event.position;
    case 'BUILDING_CAPTURE':
      return event.position;
    case 'LAVA_ADVANCE':
      return { x: Math.floor(MAP.GRID_WIDTH / 2), y: event.newLavaRow };
  }
}

/**
 * Checks whether a grid position is on a discovered (revealed) tile.
 */
function isTileRevealed(pos: Position): boolean {
  const grid = useGameStore.getState().grid;
  if (grid.length === 0 || pos.y < 0 || pos.y >= grid.length) return false;
  if (pos.x < 0 || pos.x >= grid[0].length) return false;
  return grid[pos.y][pos.x].isRevealed;
}

/**
 * Determines whether an event takes place on any discovered tile.
 * Only visible events get the full animation treatment (camera pan + delays).
 */
function isEventVisible(event: GameEvent): boolean {
  switch (event.type) {
    case 'ENEMY_SPAWN':
      return isTileRevealed(event.position);
    case 'ENEMY_MOVE':
      return isTileRevealed(event.from) || isTileRevealed(event.to);
    case 'ENEMY_ATTACK':
      return isTileRevealed(event.attackerPosition) || isTileRevealed(event.defenderPosition);
    case 'UNIT_DEATH':
      return isTileRevealed(event.position);
    case 'BUILDING_CAPTURE':
      return isTileRevealed(event.position);
    case 'LAVA_ADVANCE': {
      // Visible if any tile on the new lava row is revealed
      const grid = useGameStore.getState().grid;
      const row = event.newLavaRow;
      if (row < 0 || row >= grid.length) return false;
      return grid[row].some((tile) => tile.isRevealed);
    }
  }
}

/**
 * Returns the post-action pause duration for each event type.
 */
function postActionDuration(event: GameEvent): number {
  if (event.type === 'LAVA_ADVANCE') return ANIMATION.LAVA_ADVANCE_PAUSE_MS;
  if (event.type === 'ENEMY_SPAWN') return ANIMATION.SPAWN_PAUSE_MS;
  return ANIMATION.POST_ACTION_IDLE_MS;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Subscribes to the animation store and processes queued events when available.
 * Uses Zustand's subscribe API to avoid React re-render race conditions.
 */
export function useAnimationEngine(): void {
  useEffect(() => {
    let processing = false;

    async function processQueue() {
      while (true) {
        const event = useAnimationStore.getState().shiftEvent();
        if (!event) break;

        const visible = isEventVisible(event);

        if (visible) {
          // 1. Move camera to event position
          useAnimationStore.getState().setCameraTarget(eventPosition(event));
          await wait(ANIMATION.CAMERA_MOVE_DURATION_MS);

          // 2. Pre-action idle
          await wait(ANIMATION.PRE_ACTION_IDLE_MS);
        }

        // 3. Apply event to live game state
        useGameStore.getState().applyEvent(event);

        if (visible) {
          // 4. Post-action idle (duration varies by event type)
          await wait(postActionDuration(event));

          // 5. Brief extra camera pan to show where a melee attacker advanced after a kill
          if (event.type === 'ENEMY_ATTACK' && event.advancedToPosition) {
            useAnimationStore.getState().setCameraTarget(event.advancedToPosition);
            await wait(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.POST_ACTION_IDLE_MS);
          }
        }
      }

      // Queue exhausted — apply the fully resolved state and hand control back
      const resolvedState = useAnimationStore.getState().resolvedState;
      if (resolvedState) {
        useGameStore.getState().setGameState(resolvedState);
      }
      useAnimationStore.getState().setIsAnimating(false);
      processing = false;
    }

    // Subscribe to animation store changes; start processing when events are enqueued
    const unsubscribe = useAnimationStore.subscribe(() => {
      const { isAnimating, eventQueue } = useAnimationStore.getState();
      if (processing || isAnimating || eventQueue.length === 0) return;

      processing = true;
      useAnimationStore.getState().setIsAnimating(true);
      void processQueue();
    });

    return unsubscribe;
  }, []);
}
