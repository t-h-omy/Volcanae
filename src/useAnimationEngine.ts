/**
 * Animation engine hook for Volcanae.
 * Processes the event queue with timing, camera movement, and state application.
 * Used once at the top level of App.tsx.
 */

import { useEffect, useRef } from 'react';
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

export function useAnimationEngine(): void {
  const queueLength = useAnimationStore((s) => s.eventQueue.length);
  const isAnimating = useAnimationStore((s) => s.isAnimating);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (isAnimating || queueLength === 0) return;

    cancelRef.current = false;
    useAnimationStore.getState().setIsAnimating(true);

    processQueue();

    async function processQueue() {
      while (!cancelRef.current) {
        const event = useAnimationStore.getState().shiftEvent();
        if (!event) break;

        // 1. Move camera to event position
        useAnimationStore.getState().setCameraTarget(eventPosition(event));
        await wait(ANIMATION.CAMERA_MOVE_DURATION_MS);

        if (cancelRef.current) break;

        // 2. Pre-action idle
        await wait(ANIMATION.PRE_ACTION_IDLE_MS);

        if (cancelRef.current) break;

        // 3. Apply event to live game state
        useGameStore.getState().applyEvent(event);

        // 4. Post-action idle (duration varies by event type)
        await wait(postActionDuration(event));
      }

      if (cancelRef.current) return;

      // Queue exhausted — apply the fully resolved state and hand control back
      const resolvedState = useAnimationStore.getState().resolvedState;
      if (resolvedState) {
        useGameStore.getState().setGameState(resolvedState);
      }
      useAnimationStore.getState().setIsAnimating(false);
    }

    return () => {
      cancelRef.current = true;
    };
  }, [queueLength, isAnimating]);
}
