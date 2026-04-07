/**
 * unitActions.ts - Single source of truth for player unit action availability.
 *
 * This file exposes two layers per action type:
 *   1. Capability check - Can this unit perform this action at all this turn?
 *      Based on turn-state flags and unit tags only. Does not require game state.
 *   2. Target check - Is there a valid target for this action right now?
 *      Requires full game state. Returns the target(s) or an empty result.
 *
 * -- ADDING A NEW UNIT TAG THAT AFFECTS ACTION AVAILABILITY ------------------
 * Add the rule ONLY inside the relevant canUnit* function(s) below.
 * Do NOT add tag checks anywhere else in the codebase for this purpose.
 * Example: PREP prevents attacking after moving -> rule is only in canUnitAttack.
 *
 * -- ADDING A NEW ACTION TYPE ------------------------------------------------
 * 1. Add a flag to the Unit interface in types.ts (e.g. hasHealedThisTurn).
 * 2. Add a canUnit* function here with the blocking rules.
 * 3. Add a target function here if applicable.
 * 4. Update hasUnitActed() to include the new flag.
 * 5. Update all OTHER canUnit* functions to block on the new flag if appropriate.
 * 6. Set the flag only in the action's own system file.
 * 7. Reset it in end-of-turn resets in gameStore.ts and enemySystem.ts.
 * 8. Initialize to false in mapGenerator.ts and all unit creation sites.
 *
 * -- CROSS-BLOCKING RULES ----------------------------------------------------
 * Move does not block attack (move -> attack is the normal sequence).
 * Any non-move action blocks everything, including further movement.
 * Attack additionally blocks if PREP tag + already moved.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { Faction, UnitTag } from './types';
import type { Unit, Building, Tile } from './types';
import { getReachableTiles } from './movementSystem';
import { getConstructionOptionsForTile } from './constructionSystem';
import { canCapture } from './captureSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';

// -- HELPER -------------------------------------------------------------------

export function hasUnitActed(unit: Unit): boolean {
  return (
    unit.hasAttackedThisTurn ||
    unit.hasCapturedThisTurn ||
    unit.hasConstructedThisTurn ||
    unit.hasDestroyedThisTurn
  );
}

// -- MOVE ---------------------------------------------------------------------

/** Tag rules: none currently. To restrict movement via a tag, add it here only. */
export function canUnitMove(unit: Unit): boolean {
  if (unit.hasMovedThisTurn) return false;
  if (hasUnitActed(unit)) return false;
  return true;
}

export function getMovableTiles(unit: Unit, state: GameState | Draft<GameState>): Position[] {
  if (!canUnitMove(unit)) return [];
  return getReachableTiles(state, unit.id);
}

// -- ATTACK -------------------------------------------------------------------

/**
 * Tag rules:
 *   PREP - cannot attack after moving.
 * To restrict attack via a tag, add it here only.
 */
export function canUnitAttack(unit: Unit): boolean {
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP)) return false;
  return true;
}

export function getAttackTargets(
  unit: Unit,
  units: Record<string, Unit>,
  buildings: Record<string, Building>,
  grid: Tile[][],
): Set<string> {
  const keys = new Set<string>();
  if (!canUnitAttack(unit)) return keys;
  // Enemy units on revealed tiles
  for (const other of Object.values(units)) {
    if (other.faction === Faction.ENEMY) {
      if (!grid[other.position.y]?.[other.position.x]?.isRevealed) continue;
      if (isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        other.position.x, other.position.y,
        unit.stats.attackRange,
      )) {
        keys.add(`${other.position.x},${other.position.y}`);
      }
    }
  }
  // Enemy buildings with combat stats on revealed tiles (no enemy unit on the tile)
  for (const b of Object.values(buildings)) {
    if (b.faction === Faction.ENEMY && b.maxHp > 0 && b.combatStats !== null) {
      if (!grid[b.position.y]?.[b.position.x]?.isRevealed) continue;
      const key = `${b.position.x},${b.position.y}`;
      if (keys.has(key)) continue;
      if (isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        b.position.x, b.position.y,
        unit.stats.attackRange,
      )) {
        keys.add(key);
      }
    }
  }
  return keys;
}

// -- CAPTURE ------------------------------------------------------------------

/**
 * Tag rules:
 *   BUILDANDCAPTURE - only units with this tag can capture.
 * To restrict capture via a tag, add it here only.
 */
export function canUnitCapture(unit: Unit): boolean {
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

export function getCaptureTarget(
  unit: Unit,
  state: GameState | Draft<GameState>,
): Building | null {
  if (!canUnitCapture(unit)) return null;
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile?.buildingId) return null;
  const building = state.buildings[tile.buildingId];
  if (!building) return null;
  if (!canCapture(state, unit.id, building.id)) return null;
  return building;
}

// -- CONSTRUCT ----------------------------------------------------------------

/**
 * Tag rules:
 *   BUILDANDCAPTURE - only units with this tag can construct.
 * To restrict construction via a tag, add it here only.
 */
export function canUnitConstruct(unit: Unit): boolean {
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

export function getConstructionTargets(
  unit: Unit,
  state: GameState | Draft<GameState>,
) {
  if (!canUnitConstruct(unit)) return [];
  return getConstructionOptionsForTile(state, unit.position);
}

// -- DESTROY ------------------------------------------------------------------

/**
 * Tag rules:
 *   BUILDANDCAPTURE - only units with this tag can destroy own buildings.
 * To restrict destruction via a tag, add it here only.
 */
export function canUnitDestroy(unit: Unit): boolean {
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}
