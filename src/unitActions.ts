/**
 * unitActions.ts — Single source of truth for player unit action availability.
 *
 * This file exposes two layers per action type:
 *   1. Capability check — Can this unit perform this action at all this turn?
 *      Based on turn-state flags and unit tags only. Does not require game state.
 *   2. Target check — Is there a valid target for this action right now?
 *      Requires full game state. Returns the target(s) or an empty result.
 *
 * ── ADDING A NEW UNIT TAG THAT AFFECTS ACTION AVAILABILITY ──────────────────
 * Add the rule ONLY inside the relevant canUnit* function(s) below.
 * Do NOT add tag checks anywhere else in the codebase for this purpose.
 * Example: PREP prevents attacking after moving → rule is only in canUnitAttack.
 *
 * ── ADDING A NEW ACTION TYPE ────────────────────────────────────────────────
 * 1. Add a flag to the Unit interface in types.ts (e.g. hasHealedThisTurn).
 * 2. Add a canUnit* function here with the blocking rules.
 * 3. Add a target function here if applicable.
 * 4. Update hasUnitActed() to include the new flag.
 * 5. Update all OTHER canUnit* functions to block on the new flag if appropriate.
 * 6. Set the flag only in the action's own system file.
 * 7. Reset it in end-of-turn resets in gameStore.ts and enemySystem.ts.
 * 8. Initialize to false in mapGenerator.ts and all unit creation sites.
 *
 * ── CROSS-BLOCKING RULES ────────────────────────────────────────────────────
 * Move does not block attack (move → attack is the normal sequence).
 * Any non-move action blocks everything, including further movement.
 * Attack additionally blocks if PREP tag + already moved (must attack before moving).
 */

import type { GameState } from './types';
import type { Draft } from 'immer';
import { Faction, UnitTag } from './types';
import type { Unit, Building, Tile } from './types';
import { getReachableTiles } from './movementSystem';
import { getConstructionOptionsForTile } from './constructionSystem';
import type { ConstructionOption } from './constructionSystem';
import { canCapture } from './captureSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';

// ── HELPER ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit has performed any non-movement action this turn.
 * Use this wherever code previously checked hasActedThisTurn on a unit.
 * For the enemy system's "is this unit done?" check, prefer this over
 * reading individual flags directly.
 */
export function hasUnitActed(unit: Unit): boolean {
  return (
    unit.hasAttackedThisTurn ||
    unit.hasCapturedThisTurn ||
    unit.hasConstructedThisTurn ||
    unit.hasDestroyedThisTurn
  );
}

// ── MOVE ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to move this turn.
 * Does NOT check whether any reachable tiles exist.
 *
 * Blocking rules:
 *   - hasMovedThisTurn: already moved
 *   - any non-move action flag: non-move actions end the unit's turn entirely
 *
 * Tag rules: none currently.
 * To add a tag that restricts movement, add it here and only here.
 */
export function canUnitMove(unit: Unit): boolean {
  if (unit.hasMovedThisTurn) return false;
  if (hasUnitActed(unit)) return false;
  return true;
}

/**
 * Returns the set of tile keys ("x,y") the unit can legally move to.
 * Returns an empty set if canUnitMove is false.
 */
export function getMovableTiles(
  unit: Unit,
  state: GameState | Draft<GameState>,
): Set<string> {
  if (!canUnitMove(unit)) return new Set();
  const positions = getReachableTiles(state, unit.id);
  const keys = new Set<string>();
  for (const pos of positions) {
    keys.add(`${pos.x},${pos.y}`);
  }
  return keys;
}

// ── ATTACK ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to attack this turn.
 * Does NOT check whether any attack targets are in range.
 *
 * Blocking rules:
 *   - hasAttackedThisTurn: already attacked
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   PREP — cannot attack after moving (attack must come before or instead of move)
 *
 * To add a tag that restricts attack, add it here and only here.
 */
export function canUnitAttack(unit: Unit): boolean {
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP)) return false;
  return true;
}

/**
 * Returns the set of tile keys ("x,y") containing valid attack targets.
 * Includes revealed enemy units and revealed enemy buildings with combat stats.
 * Returns an empty set if canUnitAttack is false.
 */
export function getAttackTargets(
  unit: Unit,
  units: Record<string, Unit>,
  buildings: Record<string, Building>,
  grid: Tile[][],
): Set<string> {
  const keys = new Set<string>();
  if (!canUnitAttack(unit)) return keys;

  // Enemy units
  for (const other of Object.values(units)) {
    if (other.faction === Faction.ENEMY) {
      if (!grid[other.position.y]?.[other.position.x]?.isRevealed) continue;
      const inRange = isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        other.position.x, other.position.y,
        unit.stats.attackRange,
      );
      if (inRange) {
        keys.add(`${other.position.x},${other.position.y}`);
      }
    }
  }

  // Enemy buildings with combat stats on revealed tiles (skip tiles already
  // covered by an enemy unit — the unit takes priority as the attack target)
  for (const b of Object.values(buildings)) {
    if (b.faction === Faction.ENEMY && b.maxHp > 0 && b.combatStats !== null) {
      if (!grid[b.position.y]?.[b.position.x]?.isRevealed) continue;
      const key = `${b.position.x},${b.position.y}`;
      if (keys.has(key)) continue;
      const inRange = isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        b.position.x, b.position.y,
        unit.stats.attackRange,
      );
      if (inRange) {
        keys.add(key);
      }
    }
  }

  return keys;
}

// ── CAPTURE ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to capture a building this turn.
 * Does NOT check whether a capturable building is on the unit's tile.
 *
 * Blocking rules:
 *   - hasCapturedThisTurn: already captured
 *   - hasMovedThisTurn: move blocks capture
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   BUILDANDCAPTURE — only units with this tag can capture.
 *
 * To add a tag that restricts capture, add it here and only here.
 */
export function canUnitCapture(unit: Unit): boolean {
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

/**
 * Returns the capturable building on the unit's tile, or null if none.
 * Uses captureSystem.canCapture for the full precondition check (same tile,
 * faction mismatch, etc.).
 */
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

// ── CONSTRUCT ────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to construct a building this turn.
 * Does NOT check whether the unit's tile supports construction.
 *
 * Blocking rules:
 *   - hasConstructedThisTurn: already constructed
 *   - hasMovedThisTurn: move blocks construct
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   BUILDANDCAPTURE — only units with this tag can construct.
 *
 * To add a tag that restricts construction, add it here and only here.
 */
export function canUnitConstruct(unit: Unit): boolean {
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

/**
 * Returns the list of buildings the unit can construct on its current tile.
 * Returns an empty array if canUnitConstruct is false or the tile has no options.
 */
export function getConstructionTargets(
  unit: Unit,
  state: GameState | Draft<GameState>,
): ConstructionOption[] {
  if (!canUnitConstruct(unit)) return [];
  return getConstructionOptionsForTile(state, unit.position);
}

// ── DESTROY OWN BUILDING ─────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to destroy an own building this turn.
 * Does NOT check whether a destroyable building is on the unit's tile.
 *
 * Blocking rules:
 *   - hasDestroyedThisTurn: already destroyed
 *   - hasMovedThisTurn: move blocks destroy
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   BUILDANDCAPTURE — only units with this tag can destroy.
 *
 * To add a tag that restricts destruction, add it here and only here.
 */
export function canUnitDestroy(unit: Unit): boolean {
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

/**
 * Returns the player-owned building on the unit's tile that can be destroyed,
 * or null if none.
 */
export function getDestroyTarget(
  unit: Unit,
  state: GameState | Draft<GameState>,
): Building | null {
  if (!canUnitDestroy(unit)) return null;
  if (unit.faction !== Faction.PLAYER) return null;
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile?.buildingId) return null;
  const building = state.buildings[tile.buildingId];
  if (!building) return null;
  if (building.faction !== Faction.PLAYER) return null;
  return building;
}
