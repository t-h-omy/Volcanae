/**
 * Animation engine hook for Volcanae.
 * Processes the event queue with timing, camera movement, combat animations,
 * and state application. Used once at the top level of App.tsx.
 */

import { useEffect } from 'react';
import { useAnimationStore } from './animationStore';
import { useGameStore } from './gameStore';
import { useCombatAnimationStore } from './combatAnimationStore';
import { useShockwaveStore } from './shockwaveStore';
import { useZoneClearedStore } from './zoneClearedStore';
import { useSpecialistHireStore } from './specialistHireStore';
import { useFloaterStore } from './floaterStore';
import { ANIMATION } from './animationConfig';
import { MAP, MAGE } from './gameConfig';
import { RENDER } from './renderConfig';
import { BuildingType, Faction, UnitTag, UnitType } from './types';
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
 * Sound effect keys for spell actions.
 * Trigger implementation lives in soundOptionsStore.ts (triggerSpellSfx).
 */

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
      // Pan to the cave monster (attacker) so the player can see it strike
      if (useGameStore.getState().units[event.attackerId]?.type === UnitType.CAVE_MONSTER) {
        return event.attackerPosition;
      }
      return event.defenderPosition;
    case 'PLAYER_ATTACK':
      return event.defenderPosition;
    case 'BUILDING_ATTACK':
      return event.buildingPosition;
    case 'BUILDING_ATTACK_BUILDING':
      return event.targetBuildingPosition;
    case 'UNIT_ATTACK_BUILDING':
      return event.buildingPosition;
    case 'UNIT_DEATH':
      return event.position;
    case 'BUILDING_CAPTURE':
      return event.position;
    case 'EXPLOSION':
      return event.position;
    case 'LAVA_ADVANCE':
      return { x: Math.floor(MAP.GRID_WIDTH / 2), y: event.newLavaRow };
    case 'RESONANCE_TRIGGERED':
      return event.destroyedChamberPosition;
    case 'SANCTUM_COLLAPSE':
      return event.sanctumPosition;
    case 'ZONE_CLEARED':
      return event.sanctumPosition;
    case 'CAVE_MONSTER_KILLED':
      // No camera position needed — handled as a blocking modal, not a spatial event.
      return { x: Math.floor(MAP.GRID_WIDTH / 2), y: Math.floor(MAP.GRID_HEIGHT / 2) };
    case 'EMBER_LEVEL_UP':
      return event.position;
    case 'TILE_DAMAGE':
      return event.position;
    case 'CLEAVE_DAMAGE':
      return event.position;
    case 'PIERCE_DAMAGE':
      return event.position;
    case 'SPLASH_DAMAGE':
      return event.position;
    case 'TILE_CORRUPTED':
      return event.position;
    case 'STUN_APPLIED':
      return event.position;
    case 'TUNNEL_DIG_IN':
      return event.position;
    case 'TUNNEL_EMERGE_WARNING':
      return event.position;
    case 'TUNNEL_EMERGE':
      return event.position;
    case 'PORTAL_CREATED':
      return event.entrancePos;
    case 'PORTAL_USED':
      return event.fromPos;
    case 'PORTAL_CLOSED':
      return event.entrancePos;
    case 'STUN_BLOCKED':
      return event.position;
    case 'DEFENSE_BONUS_IGNORED':
      return event.defenderPosition;
    case 'CORRUPTION_APPLIED':
      return event.position;
    case 'CAVE_MONSTER_RETREAT':
      return event.position;
    case 'LEASH_DEFECT':
      return event.demonPos;
  }
}
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
      // Cave monster attacks are always visible so the camera always pans to them
      if (useGameStore.getState().units[event.attackerId]?.type === UnitType.CAVE_MONSTER) {
        return true;
      }
      return isTileRevealed(event.attackerPosition) || isTileRevealed(event.defenderPosition);
    case 'PLAYER_ATTACK':
      return isTileRevealed(event.attackerPosition) || isTileRevealed(event.defenderPosition);
    case 'BUILDING_ATTACK':
      return isTileRevealed(event.buildingPosition) || isTileRevealed(event.defenderPosition);
    case 'BUILDING_ATTACK_BUILDING':
      return isTileRevealed(event.attackingBuildingPosition) || isTileRevealed(event.targetBuildingPosition);
    case 'UNIT_ATTACK_BUILDING':
      return isTileRevealed(event.attackerPosition) || isTileRevealed(event.buildingPosition);
    case 'UNIT_DEATH':
      return isTileRevealed(event.position);
    case 'BUILDING_CAPTURE':
      return isTileRevealed(event.position);
    case 'EXPLOSION':
      return isTileRevealed(event.position);
    case 'LAVA_ADVANCE':
      // Always focus on lava advances — the camera should track the lava front
      // regardless of whether any tiles on the new row have been revealed yet.
      return true;
    case 'RESONANCE_TRIGGERED':
      return isTileRevealed(event.destroyedChamberPosition);
    case 'SANCTUM_COLLAPSE':
      return isTileRevealed(event.sanctumPosition);
    case 'ZONE_CLEARED':
      return isTileRevealed(event.sanctumPosition);
    case 'CAVE_MONSTER_KILLED':
      // Always show the modal regardless of tile visibility.
      return true;
    case 'EMBER_LEVEL_UP':
      return isTileRevealed(event.position);
    case 'TILE_DAMAGE':
      return isTileRevealed(event.position);
    case 'CLEAVE_DAMAGE':
      return isTileRevealed(event.position);
    case 'PIERCE_DAMAGE':
      return isTileRevealed(event.position);
    case 'SPLASH_DAMAGE':
      return isTileRevealed(event.position);
    case 'TILE_CORRUPTED':
      return isTileRevealed(event.position);
    case 'STUN_APPLIED':
      return isTileRevealed(event.position);
    case 'TUNNEL_DIG_IN':
      return isTileRevealed(event.position);
    case 'TUNNEL_EMERGE_WARNING':
      return isTileRevealed(event.position);
    case 'TUNNEL_EMERGE':
      return isTileRevealed(event.position);
    case 'PORTAL_CREATED':
      return isTileRevealed(event.entrancePos) || isTileRevealed(event.exitPos);
    case 'PORTAL_USED':
      return isTileRevealed(event.fromPos) || isTileRevealed(event.toPos);
    case 'PORTAL_CLOSED':
      return isTileRevealed(event.entrancePos) || isTileRevealed(event.exitPos);
    case 'STUN_BLOCKED':
      return isTileRevealed(event.position);
    case 'DEFENSE_BONUS_IGNORED':
      return isTileRevealed(event.defenderPosition);
    case 'CORRUPTION_APPLIED':
      return isTileRevealed(event.position);
    case 'CAVE_MONSTER_RETREAT':
      return isTileRevealed(event.position);
    case 'LEASH_DEFECT':
      return isTileRevealed(event.demonPos) || isTileRevealed(event.magePos);
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
 * NOTE: do NOT multiply by zoom here. The projectile layer lives inside the
 * CSS-scaled grid-container, so positions must be in unscaled local space.
 */
function getTileSize(): number {
  const baseSize = typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
    ? RENDER.TILE_SIZE_MOBILE
    : RENDER.TILE_SIZE_DESKTOP;
  return baseSize;
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
 * Returns the projectile character for a given unit type.
 * (Will be replaced with sprite images in a future task.)
 */
function projectileChar(unitType: string): string {
  if (unitType === UnitType.ARCHER || unitType === UnitType.LAVA_ARCHER) return '🏹';
  if (unitType === UnitType.SIEGE || unitType === UnitType.LAVA_SIEGE) return '💣';
  return '•';
}

/**
 * True when this attacker should visually shoot a fire-spit line instead of
 * a generic emoji projectile. Driven by tags, not by UnitType, so any future
 * unit with BURN + RANGED automatically participates.
 */
function usesFireSpitVfx(attacker: { tags: UnitTag[] } | undefined): boolean {
  if (!attacker) return false;
  return attacker.tags.includes(UnitTag.BURN) && attacker.tags.includes(UnitTag.RANGED);
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

      const fireSpitDuration = clamp(
        distance * ANIMATION.RANGED_PROJECTILE_MS_PER_TILE,
        ANIMATION.FIRE_SPIT_MIN_MS,
        ANIMATION.FIRE_SPIT_MAX_MS,
      );

      if (usesFireSpitVfx(attacker)) {
        store.addLineVfx({
          id: crypto.randomUUID(),
          fromPx,
          toPx,
          variant: 'FIRE_SPIT',
          durationMs: fireSpitDuration,
        });
        await wait(fireSpitDuration);
      } else {
        store.addProjectile({
          id: crypto.randomUUID(),
          fromPx,
          toPx,
          emoji: projectileChar(attacker?.type ?? ''),
          rotationDeg: angleBetween(fromPx, toPx),
          durationMs: projectileDuration,
        });
        await wait(projectileDuration);
      }
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

  // ── Apply damage to display state (without melee advance, so dying unit stays visible) ──
  // Temporarily strip the advance so that the defender tile is not overwritten
  // before the skull animation can render.
  const savedAdvance = event.advancedToPosition;
  (event as Record<string, unknown>).advancedToPosition = null;
  useGameStore.getState().applyEvent(event);
  (event as Record<string, unknown>).advancedToPosition = savedAdvance;

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

  // ── Apply melee advance after die animation so the dying defender was visible ──
  if (savedAdvance) {
    useGameStore.getState().applyMeleeAdvance(event.attackerId, savedAdvance);
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

  // Crystal Tower: show crystal gain floater AFTER death animation
  if (visible && dyingIds.size > 0) {
    const attackingBuilding = useGameStore.getState().buildings[event.buildingId];
    if (attackingBuilding?.type === BuildingType.CRYSTAL_TOWER) {
      useFloaterStore.getState().addFloater({
        value: 0,
        label: `💎 +${MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD}`,
        x: event.defenderPosition.x,
        y: event.defenderPosition.y,
        isEnemy: false,
        floaterType: 'revive',
      });
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

      const fireSpitDuration = clamp(
        distance * ANIMATION.RANGED_PROJECTILE_MS_PER_TILE,
        ANIMATION.FIRE_SPIT_MIN_MS,
        ANIMATION.FIRE_SPIT_MAX_MS,
      );

      if (usesFireSpitVfx(attacker)) {
        store.addLineVfx({
          id: crypto.randomUUID(),
          fromPx,
          toPx,
          variant: 'FIRE_SPIT',
          durationMs: fireSpitDuration,
        });
        await wait(fireSpitDuration);
      } else {
        store.addProjectile({
          id: crypto.randomUUID(),
          fromPx,
          toPx,
          emoji: projectileChar(attacker?.type ?? ''),
          rotationDeg: angleBetween(fromPx, toPx),
          durationMs: projectileDuration,
        });
        await wait(projectileDuration);
      }
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
      // Tracks a specialist hired during this batch so the hire can be
      // applied after setGameState(resolvedState) without being overwritten.
      let hiredSpecialistId: string | null = null;
      // Tracks a swap performed during this batch (outgoing replaced by incoming).
      let swapResult: { incomingId: string; outgoingId: string } | null = null;

      while (true) {
        const event = useAnimationStore.getState().shiftEvent();
        if (!event) break;

        const visible = isEventVisible(event);

        // ── Special handling for RESONANCE_TRIGGERED (pan to each surviving chamber, then activate it) ──
        // Handled before the main camera-pan block so we never pan to the destroyed chamber.
        if (event.type === 'RESONANCE_TRIGGERED') {
          if (visible) {
            for (const chamberId of event.survivingChamberIds) {
              const chamber = useGameStore.getState().buildings[chamberId];
              if (chamber) {
                useAnimationStore.getState().setCameraTarget(chamber.position);
                await wait(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);

                // Activate this chamber in the live state so the sprite switches to active
                useGameStore.getState().activateCrystalChamber(chamberId);

                // Play crystal-blue activation VFX
                useCombatAnimationStore.getState().setBuildingAnimation(chamberId, 'CRYSTAL_ACTIVATE');
                await wait(ANIMATION.CRYSTAL_ACTIVATE_VFX_DURATION_MS);
                useCombatAnimationStore.getState().setBuildingAnimation(chamberId, null);

                await wait(ANIMATION.POST_ACTION_IDLE_MS);
              }
            }
          }
          continue;
        }

        // ── Special handling for LAVA_ADVANCE (camera focus + optional crystal VFX) ──
        if (event.type === 'LAVA_ADVANCE') {
          // Focus on the destroyed Crystal Chamber when present; otherwise centre on the new lava row.
          const focusPos = event.destroyedChamberPosition
            ?? { x: Math.floor(MAP.GRID_WIDTH / 2), y: event.newLavaRow };
          useAnimationStore.getState().setCameraTarget(focusPos);
          await wait(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);

          // Apply lava state change first so lava visually advances before crystal VFX
          useGameStore.getState().applyEvent(event);
          await wait(ANIMATION.LAVA_ADVANCE_PAUSE_MS);

          if (event.destroyedChamberPosition) {
            const pos = event.destroyedChamberPosition;
            const key = `${pos.x},${pos.y}`;
            const tileSize = getTileSize();

            // Crystal-blue tile flash burst on the destroyed chamber
            useCombatAnimationStore.getState().addTileFlash(
              pos.x, pos.y, ANIMATION.ZONE_CLEARED_SANCTUM_SHATTER_MS, 'crystal',
            );
            setTimeout(
              () => useCombatAnimationStore.getState().removeTileFlash(key),
              ANIMATION.ZONE_CLEARED_SANCTUM_SHATTER_MS,
            );

            // Crystal-blue expanding shockwave ring from the chamber centre
            useShockwaveStore.getState().addShockwave({
              id: crypto.randomUUID(),
              cx: pos.x * tileSize + tileSize / 2,
              cy: pos.y * tileSize + tileSize / 2,
              durationMs: ANIMATION.ZONE_CLEARED_SHOCKWAVE_MS,
              variant: 'crystal',
            });

            await wait(ANIMATION.ZONE_CLEARED_SANCTUM_SHATTER_MS);
          }

          continue;
        }

        // ── Special handling for ZONE_CLEARED (celebration VFX + blocking popup) ──
        if (event.type === 'ZONE_CLEARED') {
          if (visible) {
            const tileSize = getTileSize();

            // 1. Camera pan to sanctum
            useAnimationStore.getState().setCameraTarget(event.sanctumPosition);
            await wait(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);

            // 2. Sanctum radial burst (tile flash on sanctum position)
            const sanctumKey = `${event.sanctumPosition.x},${event.sanctumPosition.y}`;
            useCombatAnimationStore.getState().addTileFlash(
              event.sanctumPosition.x,
              event.sanctumPosition.y,
              ANIMATION.ZONE_CLEARED_SANCTUM_SHATTER_MS,
            );
            setTimeout(
              () => useCombatAnimationStore.getState().removeTileFlash(sanctumKey),
              ANIMATION.ZONE_CLEARED_SANCTUM_SHATTER_MS,
            );

            // 3. Expanding shockwave ring from sanctum center
            useShockwaveStore.getState().addShockwave({
              id: crypto.randomUUID(),
              cx: event.sanctumPosition.x * tileSize + tileSize / 2,
              cy: event.sanctumPosition.y * tileSize + tileSize / 2,
              durationMs: ANIMATION.ZONE_CLEARED_SHOCKWAVE_MS,
            });

            await wait(ANIMATION.ZONE_CLEARED_SANCTUM_SHATTER_MS / 2);

            // 4. Staggered per-tile flash bursts across all cleared positions
            const allPositions = [
              ...event.clearedUnitPositions,
              ...event.clearedBuildingPositions,
            ];
            for (const pos of allPositions) {
              const key = `${pos.x},${pos.y}`;
              useCombatAnimationStore.getState().addTileFlash(
                pos.x, pos.y, ANIMATION.ZONE_CLEARED_TILE_FLASH_MS,
              );
              setTimeout(
                () => useCombatAnimationStore.getState().removeTileFlash(key),
                ANIMATION.ZONE_CLEARED_TILE_FLASH_MS,
              );
              await wait(ANIMATION.ZONE_CLEARED_TILE_FLASH_STAGGER_MS);
            }

            // 5. Let VFX settle
            await wait(ANIMATION.ZONE_CLEARED_SETTLE_MS);

            // 6. Show popup — block until player dismisses
            await new Promise<void>((resolve) => {
              useZoneClearedStore.getState().show(event.zone, resolve);
            });
          }

          // Apply event to game state (no-op for ZONE_CLEARED)
          useGameStore.getState().applyEvent(event);

          // Consume the following SANCTUM_COLLAPSE event — apply it without
          // additional animation so units/buildings vanish from the grid now.
          const nextQueue = useAnimationStore.getState().eventQueue;
          if (nextQueue.length > 0 && nextQueue[0].type === 'SANCTUM_COLLAPSE') {
            const collapseEvent = useAnimationStore.getState().shiftEvent();
            if (collapseEvent) {
              useGameStore.getState().applyEvent(collapseEvent);
            }
          }

          continue;
        }

        // ── Special handling for CAVE_MONSTER_KILLED (blocking specialist hire modal) ──
        if (event.type === 'CAVE_MONSTER_KILLED') {
          // Apply event first (removes activeCaveEncounters entry from live state)
          useGameStore.getState().applyEvent(event);

          // Draw a random specialist not already in global storage
          const { specialists, globalSpecialistStorage, specialistSlotCap } = useGameStore.getState();
          const allIds = Object.keys(specialists);
          const available = allIds.filter((id) => !globalSpecialistStorage.includes(id));

          await new Promise<void>((resolve) => {
            if (available.length === 0) {
              useSpecialistHireStore.getState().showExhausted((_hired) => {
                // pool exhausted — the hired parameter is always false; nothing to act on
                resolve();
              });
            } else {
              const drawn = available[Math.floor(Math.random() * available.length)];
              if (globalSpecialistStorage.length >= specialistSlotCap) {
                // All slots full — show swap flow
                useSpecialistHireStore.getState().showSwap(drawn, (outgoingId) => {
                  if (outgoingId !== null) {
                    swapResult = { incomingId: drawn, outgoingId };
                  }
                  resolve();
                });
              } else {
                // Empty slot available — show hire flow
                useSpecialistHireStore.getState().showHire(drawn, (hired) => {
                  if (hired) hiredSpecialistId = drawn;
                  resolve();
                });
              }
            }
          });

          // Apply hire/swap immediately so the specialist appears in the slots
          // right after the modal is dismissed, without waiting for all remaining
          // animations (e.g. lava events) to finish.
          if (hiredSpecialistId) {
            useGameStore.getState().hireSpecialist(hiredSpecialistId);
          }
          if (swapResult) {
            const swap = swapResult as { outgoingId: string; incomingId: string };
            useGameStore.getState().swapSpecialist(swap.outgoingId, swap.incomingId);
          }

          continue;
        }

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

          // Consume following CLEAVE_DAMAGE events and play them simultaneously with the attack
          {
            const cleaveEvents: Extract<GameEvent, { type: 'CLEAVE_DAMAGE' }>[] = [];
            // Peek ahead and gather all consecutive CLEAVE_DAMAGE events
            while (true) {
              const { eventQueue: eq } = useAnimationStore.getState();
              if (eq.length === 0 || eq[0].type !== 'CLEAVE_DAMAGE') break;
              const cleaveEvent = useAnimationStore.getState().shiftEvent() as Extract<GameEvent, { type: 'CLEAVE_DAMAGE' }>;
              cleaveEvents.push(cleaveEvent);
            }
            if (cleaveEvents.length > 0 && visible) {
              const { addCleaveVfx, removeCleaveVfx, setUnitAnimation } = useCombatAnimationStore.getState();
              // Trigger VFX ring (only once since they all share the same attacker position)
              const vfxId = crypto.randomUUID();
              addCleaveVfx({
                id: vfxId,
                cx: cleaveEvents[0].attackerPosition.x,
                cy: cleaveEvents[0].attackerPosition.y,
                durationMs: ANIMATION.CLEAVE_VFX_DURATION_MS,
              });
              setTimeout(() => removeCleaveVfx(vfxId), ANIMATION.CLEAVE_VFX_DURATION_MS);
              // Apply damage and show HIT shake on all cleave targets simultaneously
              for (const ce of cleaveEvents) {
                useGameStore.getState().applyEvent(ce);
                setUnitAnimation(ce.unitId, { type: 'HIT' });
              }
              await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
              for (const ce of cleaveEvents) {
                useCombatAnimationStore.getState().setUnitAnimation(ce.unitId, null);
              }
              // Consume any following UNIT_DEATH events for cleave-killed targets
              for (const ce of cleaveEvents) {
                const { eventQueue: eq } = useAnimationStore.getState();
                if (eq.length > 0 && eq[0].type === 'UNIT_DEATH' && eq[0].unitId === ce.unitId) {
                  const deathEvt = eq[0] as Extract<GameEvent, { type: 'UNIT_DEATH' }>;
                  useAnimationStore.getState().shiftEvent();
                  useCombatAnimationStore.getState().setUnitAnimation(deathEvt.unitId, { type: 'DYING' });
                  await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
                  useCombatAnimationStore.getState().setUnitAnimation(deathEvt.unitId, null);
                  useGameStore.getState().applyEvent(deathEvt);
                  dyingIds.add(deathEvt.unitId);
                }
              }
            } else if (cleaveEvents.length > 0) {
              // Not visible — just apply damage silently
              for (const ce of cleaveEvents) {
                useGameStore.getState().applyEvent(ce);
              }
              // Consume following UNIT_DEATH events for cleave kills
              for (const ce of cleaveEvents) {
                const { eventQueue: eq } = useAnimationStore.getState();
                if (eq.length > 0 && eq[0].type === 'UNIT_DEATH' && eq[0].unitId === ce.unitId) {
                  const deathEvt = eq[0] as Extract<GameEvent, { type: 'UNIT_DEATH' }>;
                  useAnimationStore.getState().shiftEvent();
                  useGameStore.getState().applyEvent(deathEvt);
                  dyingIds.add(deathEvt.unitId);
                }
              }
            }
          }

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

        // ── Special handling for BUILDING_ATTACK_BUILDING (building fires projectile at another building) ──
        if (event.type === 'BUILDING_ATTACK_BUILDING') {
          if (visible) {
            const tileSize = getTileSize();
            const distance = manhattanDistance(event.attackingBuildingPosition, event.targetBuildingPosition);
            const projectileDuration = clamp(
              distance * ANIMATION.RANGED_PROJECTILE_MS_PER_TILE,
              ANIMATION.RANGED_PROJECTILE_MIN_MS,
              ANIMATION.RANGED_PROJECTILE_MAX_MS,
            );

            const fromPx = {
              x: event.attackingBuildingPosition.x * tileSize + tileSize / 2,
              y: event.attackingBuildingPosition.y * tileSize + tileSize / 2,
            };
            const toPx = {
              x: event.targetBuildingPosition.x * tileSize + tileSize / 2,
              y: event.targetBuildingPosition.y * tileSize + tileSize / 2,
            };

            useCombatAnimationStore.getState().addProjectile({
              id: crypto.randomUUID(),
              fromPx,
              toPx,
              emoji: '🗡️',
              rotationDeg: angleBetween(fromPx, toPx),
              durationMs: projectileDuration,
            });

            await wait(projectileDuration);
          }

          useGameStore.getState().applyEvent(event);

          if (visible) {
            await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
            await wait(ANIMATION.POST_ACTION_IDLE_MS);
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

        // ── Special handling for TUNNEL_DIG_IN: dust hides the sprite swap ──
        if (event.type === 'TUNNEL_DIG_IN') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'BURROW_DUST',
              durationMs: ANIMATION.BURROW_DUST_MS,
            });
            await wait(ANIMATION.BURROW_DIG_IN_COVER_DELAY_MS);
            // applyEvent now flips tunnelState to DIGGING_IN — sprite swaps under dust.
            useGameStore.getState().applyEvent(event);
            // Let the dust finish before yielding back to the queue.
            await wait(ANIMATION.BURROW_DUST_MS - ANIMATION.BURROW_DIG_IN_COVER_DELAY_MS);
          } else {
            useGameStore.getState().applyEvent(event);
          }
          continue;
        }

        // ── Special handling for TUNNEL_EMERGE: dust hides the swap, then cleave rings on AoE ──
        if (event.type === 'TUNNEL_EMERGE') {
          if (visible) {
            const store = useCombatAnimationStore.getState();
            store.addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'BURROW_DUST',
              durationMs: ANIMATION.BURROW_DUST_MS,
            });
            await wait(ANIMATION.BURROW_EMERGE_COVER_DELAY_MS);

            // applyEvent now places the unit on the emergence tile under the dust.
            useGameStore.getState().applyEvent(event);

            // Then fire the existing cleave-slash ring on each tile that took AoE damage.
            // This reuses CLEAVE_VFX_DURATION_MS and the .cleave-vfx-ring CSS — no new VFX type.
            if (event.affectedPositions && event.affectedPositions.length > 0) {
              await wait(ANIMATION.BURROW_EMERGE_AOE_DELAY_MS);
              const { addCleaveVfx, removeCleaveVfx } = useCombatAnimationStore.getState();
              for (const pos of event.affectedPositions) {
                const vfxId = crypto.randomUUID();
                addCleaveVfx({
                  id: vfxId,
                  cx: pos.x,
                  cy: pos.y,
                  durationMs: ANIMATION.CLEAVE_VFX_DURATION_MS,
                });
                setTimeout(() => removeCleaveVfx(vfxId), ANIMATION.CLEAVE_VFX_DURATION_MS);
              }
            }

            // Wait out the remaining dust window so the queue does not start the
            // next event before the dust has visually settled.
            const remaining =
              ANIMATION.BURROW_DUST_MS -
              ANIMATION.BURROW_EMERGE_COVER_DELAY_MS -
              ANIMATION.BURROW_EMERGE_AOE_DELAY_MS;
            if (remaining > 0) await wait(remaining);
          } else {
            useGameStore.getState().applyEvent(event);
          }
          continue;
        }

        // ── Special handling for CLEAVE_DAMAGE ──
        if (event.type === 'CLEAVE_DAMAGE') {
          if (visible) {
            const { addCleaveVfx, removeCleaveVfx, setUnitAnimation } = useCombatAnimationStore.getState();
            const vfxId = crypto.randomUUID();
            addCleaveVfx({
              id: vfxId,
              cx: event.attackerPosition.x,
              cy: event.attackerPosition.y,
              durationMs: ANIMATION.CLEAVE_VFX_DURATION_MS,
            });
            setTimeout(() => removeCleaveVfx(vfxId), ANIMATION.CLEAVE_VFX_DURATION_MS);
            // Apply HP delta immediately
            useGameStore.getState().applyEvent(event);
            // Show HIT shake on target
            setUnitAnimation(event.unitId, { type: 'HIT' });
            await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
            setUnitAnimation(event.unitId, null);
          } else {
            useGameStore.getState().applyEvent(event);
          }
          // Consume any following UNIT_DEATH for this target
          {
            const { eventQueue } = useAnimationStore.getState();
            if (eventQueue.length > 0) {
              const next = eventQueue[0];
              if (next.type === 'UNIT_DEATH' && next.unitId === event.unitId) {
                useAnimationStore.getState().shiftEvent();
                if (visible) {
                  useCombatAnimationStore.getState().setUnitAnimation(next.unitId, { type: 'DYING' });
                  await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
                  useCombatAnimationStore.getState().setUnitAnimation(next.unitId, null);
                }
                useGameStore.getState().applyEvent(next);
              }
            }
          }
          if (visible) await wait(ANIMATION.POST_ACTION_IDLE_MS);
          continue;
        }

        // ── Special handling for PIERCE_DAMAGE ──
        if (event.type === 'PIERCE_DAMAGE') {
          if (visible) {
            const tileSize = getTileSize();
            // Fire a projectile from primaryDefenderPosition toward target position
            const fromPx = {
              x: event.primaryDefenderPosition.x * tileSize + tileSize / 2,
              y: event.primaryDefenderPosition.y * tileSize + tileSize / 2,
            };
            const toPx = {
              x: event.position.x * tileSize + tileSize / 2,
              y: event.position.y * tileSize + tileSize / 2,
            };
            const projId = crypto.randomUUID();
            useCombatAnimationStore.getState().addLineVfx({
              id: crypto.randomUUID(),
              fromPx,
              toPx,
              variant: 'PIERCE_LINE',
              durationMs: ANIMATION.PIERCE_LINE_MS,
            });
            useCombatAnimationStore.getState().addProjectile({
              id: projId,
              fromPx,
              toPx,
              emoji: '🗡',
              rotationDeg: angleBetween(fromPx, toPx),
              durationMs: ANIMATION.PIERCE_VFX_MS_PER_TILE,
            });
            await wait(ANIMATION.PIERCE_VFX_MS_PER_TILE);
            useCombatAnimationStore.getState().removeProjectile(projId);
            useGameStore.getState().applyEvent(event);
            if (event.unitId) {
              useCombatAnimationStore.getState().setUnitAnimation(event.unitId, { type: 'HIT' });
              await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
              useCombatAnimationStore.getState().setUnitAnimation(event.unitId, null);
            }
          } else {
            useGameStore.getState().applyEvent(event);
          }
          // Consume any following UNIT_DEATH for this target unit
          if (event.unitId) {
            const { eventQueue } = useAnimationStore.getState();
            if (eventQueue.length > 0) {
              const next = eventQueue[0];
              if (next.type === 'UNIT_DEATH' && next.unitId === event.unitId) {
                useAnimationStore.getState().shiftEvent();
                if (visible) {
                  useCombatAnimationStore.getState().setUnitAnimation(next.unitId, { type: 'DYING' });
                  await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
                  useCombatAnimationStore.getState().setUnitAnimation(next.unitId, null);
                }
                useGameStore.getState().applyEvent(next);
              }
            }
          }
          if (visible) await wait(ANIMATION.POST_ACTION_IDLE_MS);
          continue;
        }

        // ── Special handling for SPLASH_DAMAGE ──
        if (event.type === 'SPLASH_DAMAGE') {
          useGameStore.getState().applyEvent(event);
          if (visible) {
            useCombatAnimationStore.getState().setUnitAnimation(event.unitId, { type: 'HIT' });
            await wait(ANIMATION.HIT_SHAKE_DURATION_MS);
            useCombatAnimationStore.getState().setUnitAnimation(event.unitId, null);
          }
          // Consume any following UNIT_DEATH for this target
          {
            const { eventQueue } = useAnimationStore.getState();
            if (eventQueue.length > 0) {
              const next = eventQueue[0];
              if (next.type === 'UNIT_DEATH' && next.unitId === event.unitId) {
                useAnimationStore.getState().shiftEvent();
                if (visible) {
                  useCombatAnimationStore.getState().setUnitAnimation(next.unitId, { type: 'DYING' });
                  await wait(ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS);
                  useCombatAnimationStore.getState().setUnitAnimation(next.unitId, null);
                }
                useGameStore.getState().applyEvent(next);
              }
            }
          }
          if (visible) await wait(ANIMATION.POST_ACTION_IDLE_MS);
          continue;
        }

        // ── Special handling for STUN_BLOCKED ──
        if (event.type === 'STUN_BLOCKED') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'STUN_BLOCKED_SHIELD',
              durationMs: ANIMATION.STUN_BLOCKED_SHIELD_MS,
            });
            await wait(ANIMATION.STUN_BLOCKED_SHIELD_MS);
          }
          // STUN_BLOCKED has no game-state effect. applyEvent is a silent no-op for it.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for DEFENSE_BONUS_IGNORED ──
        if (event.type === 'DEFENSE_BONUS_IGNORED') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.defenderPosition.x,
              y: event.defenderPosition.y,
              variant: 'DEFENSE_IGNORED',
              durationMs: ANIMATION.DEFENSE_IGNORED_MS,
            });
            // Do NOT await the full duration here. The VFX plays out via the layer's
            // onAnimationEnd cleanup. The attack's HIT_SHAKE already provides timing.
          }
          // No game-state effect.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for STUN_APPLIED ──
        if (event.type === 'STUN_APPLIED') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'SPELL_IMPACT_STUN',
              durationMs: ANIMATION.STUN_APPLIED_BURST_MS,
            });
          }
          // Do not block on the VFX duration — the persistent stun indicator
          // (driven by unit.pinnedUntilTurn) takes over as the long-term cue.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for TILE_DAMAGE ──
        if (event.type === 'TILE_DAMAGE') {
          if (visible) {
            // Pan camera to player units taking tile damage so it's always visible
            useAnimationStore.getState().setCameraTarget(event.position);
            await wait(ANIMATION.CAMERA_MOVE_DURATION_MS);
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'BURNING_DAMAGE',
              durationMs: ANIMATION.BURNING_DAMAGE_VFX_MS,
            });
          }
          // applyEvent emits the damage floater. The VFX is short enough that the
          // floater rises through it visibly.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for CORRUPTION_APPLIED ──
        if (event.type === 'CORRUPTION_APPLIED') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'CORRUPTION_APPLIED',
              durationMs: ANIMATION.CORRUPTION_APPLIED_VFX_MS,
            });
          }
          // No state effect; applyEvent will silently no-op.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for PORTAL_USED ──
        if (event.type === 'PORTAL_USED') {
          if (visible) {
            const store = useCombatAnimationStore.getState();
            store.addTileVfx({
              id: crypto.randomUUID(),
              x: event.fromPos.x,
              y: event.fromPos.y,
              variant: 'SPELL_IMPACT_PORTAL_ENTER',
              durationMs: ANIMATION.PORTAL_VFX_MS,
            });
            store.addTileVfx({
              id: crypto.randomUUID(),
              x: event.toPos.x,
              y: event.toPos.y,
              variant: 'SPELL_IMPACT_PORTAL_EXIT',
              durationMs: ANIMATION.PORTAL_VFX_MS,
            });
          }
          // No state effect to apply per-event; resolved state at queue end has
          // the final position.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for ENEMY_SPAWN ──
        if (event.type === 'ENEMY_SPAWN') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'SPELL_IMPACT_SPAWN_ENEMY',
              durationMs: ANIMATION.SPAWN_VFX_MS,
            });
          }
          // applyEvent places the unit on the tile so the sprite appears under
          // the spawn pop.
          useGameStore.getState().applyEvent(event);
          // Preserve the existing longer post-action idle inline (every other
          // special-handling block uses `continue`, which skips the generic
          // post-action wait; reproduce SPAWN_PAUSE_MS here instead).
          if (visible) {
            await wait(ANIMATION.SPAWN_PAUSE_MS);
          }
          continue;
        }

        // ── Special handling for BUILDING_CAPTURE ──
        if (event.type === 'BUILDING_CAPTURE') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: event.newFaction === Faction.PLAYER
                ? 'SPELL_IMPACT_CAPTURE_PLAYER'
                : 'SPELL_IMPACT_CAPTURE_ENEMY',
              durationMs: ANIMATION.CAPTURE_VFX_MS,
            });
          }
          // applyEvent flips the building faction so the sprite recolours under the wash.
          useGameStore.getState().applyEvent(event);
          continue;
        }

        // ── Special handling for EXPLOSION (Emberling explode VFX) ──
        if (event.type === 'EXPLOSION' && visible) {
          const tileSize = getTileSize();
          const flashKey = `${event.position.x},${event.position.y}`;

          // Tile flash at explosion center
          useCombatAnimationStore.getState().addTileFlash(
            event.position.x,
            event.position.y,
            ANIMATION.EXPLOSION_TILE_FLASH_MS,
          );
          setTimeout(
            () => useCombatAnimationStore.getState().removeTileFlash(flashKey),
            ANIMATION.EXPLOSION_TILE_FLASH_MS,
          );

          // Expanding shockwave ring from explosion center.
          // The ring box-shadow has a 3px spread on a 0×0 element; to reach a
          // visual radius of 1.5 tiles the final scale must be 1.5*tileSize/3.
          const explosionFinalScale = Math.round((1.5 * tileSize) / 3);
          useShockwaveStore.getState().addShockwave({
            id: crypto.randomUUID(),
            cx: event.position.x * tileSize + tileSize / 2,
            cy: event.position.y * tileSize + tileSize / 2,
            durationMs: ANIMATION.EXPLOSION_SHOCKWAVE_MS,
            finalScale: explosionFinalScale,
          });

          // Wait for the explosion VFX to complete before applying state and
          // continuing. This ensures the UNIT_DEATH events that follow (for
          // killed player units and the emberling itself) play their dying
          // animations AFTER the explosion visuals, not before.
          await wait(ANIMATION.EXPLOSION_TILE_FLASH_MS);
          useGameStore.getState().applyEvent(event);
          await wait(ANIMATION.POST_ACTION_IDLE_MS);
          continue;
        }

        // ── Special handling for LEASH_DEFECT (demon defects during enemy turn) ──
        if (event.type === 'LEASH_DEFECT') {
          // sweepLeashes already mutated faction in the immer draft. applyEvent is
          // called here for consistency (it is a no-mutation no-op for LEASH_DEFECT)
          // so the live display state stays coherent with the resolved state.
          useGameStore.getState().applyEvent(event);
          if (visible) {
            const combatStore = useCombatAnimationStore.getState();
            useAnimationStore.getState().setCameraTarget(event.demonPos);
            await wait(ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS);

            combatStore.addLeashBurstPair({
              mageId: event.mageId,
              demonId: event.demonId,
              magePos: event.magePos,
              demonPos: event.demonPos,
            });
            combatStore.setUnitAnimation(event.demonId, {
              type: 'DEFECT_TO_ENEMY',
              durationMs: ANIMATION.DEFECT_VFX_DURATION_MS,
            });
            useFloaterStore.getState().addFloater({
              value: 0,
              label: '⚠️ Defected!',
              x: event.demonPos.x,
              y: event.demonPos.y,
              isEnemy: true,
              floaterType: 'revive',
            });

            await wait(ANIMATION.LEASH_BURST_VFX_DURATION_MS);

            combatStore.setUnitAnimation(event.demonId, null);
            combatStore.removeLeashBurstPair(event.demonId);

            await wait(ANIMATION.POST_ACTION_IDLE_MS);
          }
          continue;
        }

        // ── Special handling for CAVE_MONSTER_RETREAT: burrow-dust, then disappear ──
        if (event.type === 'CAVE_MONSTER_RETREAT') {
          if (visible) {
            useCombatAnimationStore.getState().addTileVfx({
              id: crypto.randomUUID(),
              x: event.position.x,
              y: event.position.y,
              variant: 'BURROW_DUST',
              durationMs: ANIMATION.BURROW_DUST_MS,
            });
            await wait(ANIMATION.BURROW_DIG_IN_COVER_DELAY_MS);
            useGameStore.getState().applyEvent(event);
            await wait(ANIMATION.BURROW_DUST_MS - ANIMATION.BURROW_DIG_IN_COVER_DELAY_MS);
            await wait(ANIMATION.POST_ACTION_IDLE_MS);
          } else {
            useGameStore.getState().applyEvent(event);
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
      // Finalize any pending Brandmark transforms (deferred demon spawn + unit removal).
      // Idempotent: no-ops on empty queue. Must run after setGameState so the
      // resolved pendingBrandmarkTransforms list is in the live store.
      useGameStore.getState().finalizeBrandmarkTransforms();
      // If the player hired a specialist during this batch, apply the hire now
      // (after setGameState so it isn't overwritten by the resolved state).
      if (hiredSpecialistId) {
        useGameStore.getState().hireSpecialist(hiredSpecialistId);
      }
      // If the player swapped a specialist, apply the swap after setGameState.
      if (swapResult) {
        const swap = swapResult as { outgoingId: string; incomingId: string };
        useGameStore.getState().swapSpecialist(swap.outgoingId, swap.incomingId);
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
