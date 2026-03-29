/**
 * Animation engine hook for Volcanae.
 * Processes the event queue with timing, camera movement, combat animations,
 * and state application. Used once at the top level of App.tsx.
 */

import { useEffect } from 'react';
import { useAnimationStore } from './animationStore';
import { useGameStore } from './gameStore';
import { useCombatAnimationStore } from './combatAnimationStore';
import { ANIMATION, MAP, RENDER } from './gameConfig';
import { UnitTag, UnitType } from './types';
import type { GameEvent } from './gameEvents';
import type { Position } from './types';

// ============================================================================
// HELPERS
// ============================================================================

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
    case 'PLAYER_ATTACK':
      return event.defenderPosition;
    case 'BUILDING_ATTACK':
      return event.defenderPosition;
    case 'UNIT_ATTACK_BUILDING':
      return event.buildingPosition;
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
    case 'PLAYER_ATTACK':
      return isTileRevealed(event.attackerPosition) || isTileRevealed(event.defenderPosition);
    case 'BUILDING_ATTACK':
      return isTileRevealed(event.buildingPosition) || isTileRevealed(event.defenderPosition);
    case 'UNIT_ATTACK_BUILDING':
      return isTileRevealed(event.attackerPosition) || isTileRevealed(event.buildingPosition);
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
// COMBAT ANIMATION HELPERS
// ============================================================================

/**
 * Returns the current tile size based on the viewport width.
 */
function getTileSize(): number {
  if (typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT) {
    return RENDER.TILE_SIZE_MOBILE;
  }
  return RENDER.TILE_SIZE_DESKTOP;
}

/**
 * Manhattan distance between two grid positions.
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Angle in degrees between two pixel positions (0° = right, rotating clockwise).
 */
function angleBetween(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Returns a normalised direction vector from source to target tile.
 * Clamped to one of 8 directions.
 */
function normaliseDirection(from: Position, to: Position): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  const nx = Math.round(dx / len);
  const ny = Math.round(dy / len);
  const rLen = Math.sqrt(nx * nx + ny * ny);
  return rLen === 0 ? { x: 0, y: 0 } : { x: nx / rLen, y: ny / rLen };
}

/**
 * Returns the projectile emoji for a given unit type.
 */
function projectileEmoji(unitType: string): string {
  if (unitType === UnitType.ARCHER || unitType === UnitType.LAVA_ARCHER) return '🏹';
  if (unitType === UnitType.SIEGE || unitType === UnitType.LAVA_SIEGE) return '💣';
  return '•';
}

// ============================================================================
// COMBAT ANIMATION CHOREOGRAPHY
// ============================================================================

/**
 * Plays the full combat animation sequence for an ENEMY_ATTACK or PLAYER_ATTACK event.
 * Returns the set of unit IDs that died (so the caller can consume UNIT_DEATH events).
 */
async function playAttackAnimation(
  event: Extract<GameEvent, { type: 'ENEMY_ATTACK' | 'PLAYER_ATTACK' }>,
  visible: boolean,
): Promise<Set<string>> {
  const store = useCombatAnimationStore.getState();
  const gameState = useGameStore.getState();

  const attacker = gameState.units[event.attackerId];
  const defender = gameState.units[event.defenderId];
  const tileSize = getTileSize();
  const dyingIds = new Set<string>();

  // Determine ranged status from the attacker in current display state
  const isRanged = attacker?.tags.includes(UnitTag.RANGED) ?? false;

  if (visible) {
    if (isRanged) {
      // ── Ranged: fire projectile + recoil ──
      const distance = manhattanDistance(event.attackerPosition, event.defenderPosition);
      const projectileDuration = clamp(
        distance * ANIMATION.RANGED_PROJECTILE_MS_PER_TILE,
        ANIMATION.RANGED_PROJECTILE_MIN_MS,
        ANIMATION.RANGED_PROJECTILE_MAX_MS,
      );

      const fromPx = {
        x: event.attackerPosition.x * tileSize + tileSize / 2,
        y: event.attackerPosition.y * tileSize + tileSize / 2,
      };
      const toPx = {
        x: event.defenderPosition.x * tileSize + tileSize / 2,
        y: event.defenderPosition.y * tileSize + tileSize / 2,
      };

      // Recoil: lean away from target
      const recoilDx = (fromPx.x - toPx.x) * 0.15;
      const recoilDy = (fromPx.y - toPx.y) * 0.15;

      store.setUnitAnimation(event.attackerId, { type: 'RECOIL', dx: recoilDx, dy: recoilDy });
      store.addProjectile({
        id: crypto.randomUUID(),
        fromPx,
        toPx,
        emoji: projectileEmoji(attacker?.type ?? ''),
        rotationDeg: angleBetween(fromPx, toPx),
        durationMs: projectileDuration,
      });

      await wait(projectileDuration);
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
    } else {
      // ── Melee: lunge toward defender ──
      const LUNGE_FACTOR = tileSize * 0.45;
      const dir = normaliseDirection(event.attackerPosition, event.defenderPosition);
      store.setUnitAnimation(event.attackerId, {
        type: 'LUNGE',
        dx: dir.x * LUNGE_FACTOR,
        dy: dir.y * LUNGE_FACTOR,
      });
      await wait(ANIMATION.MELEE_LUNGE_DURATION_MS / 2);
    }
  }

  // ── Apply damage to display state ──
  useGameStore.getState().applyEvent(event);

  if (visible) {
    // ── Shake hit units ──
    if (event.defenderHpLost > 0 && defender) {
      useCombatAnimationStore.getState().setUnitAnimation(event.defenderId, { type: 'HIT' });
    }
    if (event.attackerHpLost > 0 && attacker) {
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, { type: 'HIT' });
    }

    // For melee: snap back (unless advancing)
    if (!isRanged && !event.advancedToPosition) {
      await wait(ANIMATION.MELEE_LUNGE_DURATION_MS / 2);
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
    } else if (!isRanged && event.advancedToPosition) {
      // Melee kill-advance: clear lunge immediately
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
    }

    await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
    useCombatAnimationStore.getState().setUnitAnimation(event.defenderId, null);
    useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
  }

  // ── Determine dying units ──
  const updatedState = useGameStore.getState();
  const defenderAfter = updatedState.units[event.defenderId];
  const attackerAfter = updatedState.units[event.attackerId];

  // Defender died if no longer in state or HP <= 0
  if (!defenderAfter || (defenderAfter.stats.currentHp <= 0)) {
    dyingIds.add(event.defenderId);
  }
  // Attacker died if took damage and no longer in state or HP <= 0
  if (event.attackerHpLost > 0 && (!attackerAfter || (attackerAfter.stats.currentHp <= 0))) {
    dyingIds.add(event.attackerId);
  }

  // ── Die animations ──
  if (visible && dyingIds.size > 0) {
    for (const id of dyingIds) {
      if (updatedState.units[id]) {
        useCombatAnimationStore.getState().setUnitAnimation(id, { type: 'DYING' });
      }
    }

    await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);

    for (const id of dyingIds) {
      useCombatAnimationStore.getState().setUnitAnimation(id, null);
    }
  }

  return dyingIds;
}

// ============================================================================
// BUILDING ATTACK ANIMATION
// ============================================================================

/**
 * Plays the building attack animation (always ranged — fires a projectile).
 * Returns the set of unit IDs that died.
 */
async function playBuildingAttackAnimation(
  event: Extract<GameEvent, { type: 'BUILDING_ATTACK' }>,
  visible: boolean,
): Promise<Set<string>> {
  const store = useCombatAnimationStore.getState();
  const gameState = useGameStore.getState();
  const tileSize = getTileSize();
  const dyingIds = new Set<string>();
  const defender = gameState.units[event.defenderId];

  if (visible) {
    // Fire projectile from building to defender
    const distance = manhattanDistance(event.buildingPosition, event.defenderPosition);
    const projectileDuration = clamp(
      distance * ANIMATION.RANGED_PROJECTILE_MS_PER_TILE,
      ANIMATION.RANGED_PROJECTILE_MIN_MS,
      ANIMATION.RANGED_PROJECTILE_MAX_MS,
    );

    const fromPx = {
      x: event.buildingPosition.x * tileSize + tileSize / 2,
      y: event.buildingPosition.y * tileSize + tileSize / 2,
    };
    const toPx = {
      x: event.defenderPosition.x * tileSize + tileSize / 2,
      y: event.defenderPosition.y * tileSize + tileSize / 2,
    };

    store.addProjectile({
      id: crypto.randomUUID(),
      fromPx,
      toPx,
      emoji: '🗡️',
      rotationDeg: angleBetween(fromPx, toPx),
      durationMs: projectileDuration,
    });

    await wait(projectileDuration);
  }

  // Apply damage to display state
  useGameStore.getState().applyEvent(event);

  if (visible) {
    // Shake hit units
    if (event.defenderHpLost > 0 && defender) {
      useCombatAnimationStore.getState().setUnitAnimation(event.defenderId, { type: 'HIT' });
    }

    await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
    useCombatAnimationStore.getState().setUnitAnimation(event.defenderId, null);
  }

  // Determine dying units
  const updatedState = useGameStore.getState();
  const defenderAfter = updatedState.units[event.defenderId];
  if (!defenderAfter || defenderAfter.stats.currentHp <= 0) {
    dyingIds.add(event.defenderId);
  }

  // Die animations
  if (visible && dyingIds.size > 0) {
    for (const id of dyingIds) {
      if (updatedState.units[id]) {
        useCombatAnimationStore.getState().setUnitAnimation(id, { type: 'DYING' });
      }
    }
    await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
    for (const id of dyingIds) {
      useCombatAnimationStore.getState().setUnitAnimation(id, null);
    }
  }

  return dyingIds;
}

// ============================================================================
// UNIT ATTACKS BUILDING ANIMATION
// ============================================================================

/**
 * Plays the animation for a unit attacking a building (e.g. enemy unit attacks watchtower).
 * Ranged attackers fire a projectile; melee attackers lunge toward the building.
 * Returns the set of unit IDs that died (attacker killed by building counter-attack).
 */
async function playUnitAttackBuildingAnimation(
  event: Extract<GameEvent, { type: 'UNIT_ATTACK_BUILDING' }>,
  visible: boolean,
): Promise<Set<string>> {
  const store = useCombatAnimationStore.getState();
  const gameState = useGameStore.getState();
  const tileSize = getTileSize();
  const dyingIds = new Set<string>();

  const attacker = gameState.units[event.attackerId];
  const isRanged = attacker?.tags.includes(UnitTag.RANGED) ?? false;

  if (visible) {
    if (isRanged) {
      // Ranged: fire projectile from attacker to building
      const distance = manhattanDistance(event.attackerPosition, event.buildingPosition);
      const projectileDuration = clamp(
        distance * ANIMATION.RANGED_PROJECTILE_MS_PER_TILE,
        ANIMATION.RANGED_PROJECTILE_MIN_MS,
        ANIMATION.RANGED_PROJECTILE_MAX_MS,
      );

      const fromPx = {
        x: event.attackerPosition.x * tileSize + tileSize / 2,
        y: event.attackerPosition.y * tileSize + tileSize / 2,
      };
      const toPx = {
        x: event.buildingPosition.x * tileSize + tileSize / 2,
        y: event.buildingPosition.y * tileSize + tileSize / 2,
      };

      const recoilDx = (fromPx.x - toPx.x) * 0.15;
      const recoilDy = (fromPx.y - toPx.y) * 0.15;

      store.setUnitAnimation(event.attackerId, { type: 'RECOIL', dx: recoilDx, dy: recoilDy });
      store.addProjectile({
        id: crypto.randomUUID(),
        fromPx,
        toPx,
        emoji: projectileEmoji(attacker?.type ?? ''),
        rotationDeg: angleBetween(fromPx, toPx),
        durationMs: projectileDuration,
      });

      await wait(projectileDuration);
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
    } else {
      // Melee: lunge toward building
      const LUNGE_FACTOR = tileSize * 0.45;
      const dir = normaliseDirection(event.attackerPosition, event.buildingPosition);
      store.setUnitAnimation(event.attackerId, {
        type: 'LUNGE',
        dx: dir.x * LUNGE_FACTOR,
        dy: dir.y * LUNGE_FACTOR,
      });
      await wait(ANIMATION.MELEE_LUNGE_DURATION_MS / 2);
    }
  }

  // Apply damage to display state
  useGameStore.getState().applyEvent(event);

  if (visible) {
    // Shake attacker if it took counter-attack damage
    if (event.attackerHpLost > 0 && attacker) {
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, { type: 'HIT' });
    }

    // For melee: snap back
    if (!isRanged) {
      await wait(ANIMATION.MELEE_LUNGE_DURATION_MS / 2);
      useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
    }

    await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
    useCombatAnimationStore.getState().setUnitAnimation(event.attackerId, null);
  }

  // Check if attacker died (from counter-attack)
  const updatedState = useGameStore.getState();
  const attackerAfter = updatedState.units[event.attackerId];
  if (event.attackerHpLost > 0 && (!attackerAfter || attackerAfter.stats.currentHp <= 0)) {
    dyingIds.add(event.attackerId);
  }

  // Die animation for attacker
  if (visible && dyingIds.size > 0) {
    for (const id of dyingIds) {
      if (updatedState.units[id]) {
        useCombatAnimationStore.getState().setUnitAnimation(id, { type: 'DYING' });
      }
    }
    await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
    for (const id of dyingIds) {
      useCombatAnimationStore.getState().setUnitAnimation(id, null);
    }
  }

  return dyingIds;
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

        // ── Special handling for ENEMY_ATTACK or PLAYER_ATTACK with combat animations ──
        if (event.type === 'ENEMY_ATTACK' || event.type === 'PLAYER_ATTACK') {
          const dyingIds = await playAttackAnimation(event, visible);

          // Consume following UNIT_DEATH events that were already animated
          while (true) {
            const { eventQueue } = useAnimationStore.getState();
            if (eventQueue.length === 0) break;
            const next = eventQueue[0];
            if (next.type === 'UNIT_DEATH' && dyingIds.has(next.unitId)) {
              useAnimationStore.getState().shiftEvent();
              useGameStore.getState().applyEvent(next);
            } else {
              break;
            }
          }

          if (visible) {
            await wait(ANIMATION.POST_ACTION_IDLE_MS);

            if (event.advancedToPosition) {
              useAnimationStore.getState().setCameraTarget(event.advancedToPosition);
              await wait(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.POST_ACTION_IDLE_MS);
            }
          }

          continue;
        }

        // ── Special handling for BUILDING_ATTACK (building fires projectile at unit) ──
        if (event.type === 'BUILDING_ATTACK') {
          const dyingIds = await playBuildingAttackAnimation(event, visible);

          // Consume following UNIT_DEATH events that were already animated
          while (true) {
            const { eventQueue } = useAnimationStore.getState();
            if (eventQueue.length === 0) break;
            const next = eventQueue[0];
            if (next.type === 'UNIT_DEATH' && dyingIds.has(next.unitId)) {
              useAnimationStore.getState().shiftEvent();
              useGameStore.getState().applyEvent(next);
            } else {
              break;
            }
          }

          if (visible) {
            await wait(ANIMATION.POST_ACTION_IDLE_MS);
          }

          continue;
        }

        // ── Special handling for UNIT_ATTACK_BUILDING (unit attacks a building, e.g. watchtower) ──
        if (event.type === 'UNIT_ATTACK_BUILDING') {
          const dyingIds = await playUnitAttackBuildingAnimation(event, visible);

          // Consume following UNIT_DEATH events that were already animated (attacker killed by counter)
          while (true) {
            const { eventQueue } = useAnimationStore.getState();
            if (eventQueue.length === 0) break;
            const next = eventQueue[0];
            if (next.type === 'UNIT_DEATH' && dyingIds.has(next.unitId)) {
              useAnimationStore.getState().shiftEvent();
              useGameStore.getState().applyEvent(next);
            } else {
              break;
            }
          }

          if (visible) {
            await wait(ANIMATION.POST_ACTION_IDLE_MS);
          }

          continue;
        }

        // ── Special handling for standalone UNIT_DEATH (e.g. from lava) ──
        if (event.type === 'UNIT_DEATH' && visible) {
          const unitStillExists = useGameStore.getState().units[event.unitId];
          if (unitStillExists) {
            useCombatAnimationStore.getState().setUnitAnimation(event.unitId, { type: 'DYING' });
            await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
            useCombatAnimationStore.getState().setUnitAnimation(event.unitId, null);
          }
        }

        // 3. Apply event to live game state
        useGameStore.getState().applyEvent(event);

        if (visible) {
          // 4. Post-action idle (duration varies by event type)
          await wait(postActionDuration(event));
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
