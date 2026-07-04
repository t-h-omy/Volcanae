/**
 * bridgeSystem.ts
 *
 * Single source of truth for bridge-related passability logic.
 * Imported by movementSystem, enemySystem, combatSystem, and unitActions.
 */

import type { GameState, Building } from './types';
import type { Draft } from 'immer';
import { BuildingType } from './types';

// ============================================================================
// BRIDGE LOOKUP
// ============================================================================

/**
 * Returns the BRIDGE building at (x, y), or null if there is none.
 */
export function getBridgeAt(
  state: GameState | Draft<GameState>,
  x: number,
  y: number,
): Building | null {
  const tile = state.grid[y]?.[x];
  if (!tile?.buildingId) return null;
  const building = state.buildings[tile.buildingId];
  if (!building || building.type !== BuildingType.BRIDGE) return null;
  return building as Building;
}

// ============================================================================
// DIRECTION-LOCKED TRAVERSAL
// ============================================================================

/**
 * Returns true if voluntary movement is allowed through a bridge in the given
 * direction (dx, dy — each ±1 or 0).
 *
 * Rules:
 * - Diagonals (dx !== 0 && dy !== 0): always allowed.
 * - EW bridge: parallel = east/west (dy === 0); perpendicular = north/south
 *   (dx === 0). Perpendicular orthogonals are BLOCKED.
 * - NS bridge: parallel = north/south (dx === 0); perpendicular = east/west
 *   (dy === 0). Perpendicular orthogonals are BLOCKED.
 */
export function isBridgeTraversalAllowed(
  orientation: 'EW' | 'NS',
  dx: number,
  dy: number,
): boolean {
  // Diagonals are always allowed
  if (dx !== 0 && dy !== 0) return true;
  // Orthogonal: check the perpendicular axis
  if (orientation === 'EW') {
    // Parallel = E/W (dx !== 0, dy === 0) → allowed
    // Perpendicular = N/S (dx === 0, dy !== 0) → blocked
    return dy === 0;
  } else {
    // NS: Parallel = N/S (dx === 0, dy !== 0) → allowed
    // Perpendicular = E/W (dx !== 0, dy === 0) → blocked
    return dx === 0;
  }
}

// ============================================================================
// EDGE-BASED TRAVERSAL GATE
// ============================================================================

/**
 * Returns true if voluntary movement from (fromX, fromY) to (toX, toY) is
 * permitted by bridge direction rules.
 *
 * This is the main gate for voluntary movement:
 * - If the destination tile has a bridge, the entry direction must be allowed.
 * - If the source tile has a bridge, the exit direction must also be allowed.
 *   (Bridges cannot be adjacent so at most one endpoint is a bridge.)
 * - Plain canyon/water tiles are still blocked (caller must handle those).
 * - FLYING units bypass everything (pass isFlying=true to skip bridge checks).
 *
 * Note: this function only applies the bridge directional rule; it does NOT
 * enforce plain-canyon/water blockage (leave that to the caller).
 */
export function canTraverseEdge(
  state: GameState | Draft<GameState>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  isFlying: boolean,
): boolean {
  if (isFlying) return true;

  const dx = toX - fromX;
  const dy = toY - fromY;

  // Check entry into destination bridge
  const toBridge = getBridgeAt(state, toX, toY);
  if (toBridge) {
    const orientation = toBridge.bridgeOrientation ?? 'EW';
    if (!isBridgeTraversalAllowed(orientation, dx, dy)) return false;
  }

  // Check exit from source bridge
  const fromBridge = getBridgeAt(state, fromX, fromY);
  if (fromBridge) {
    const orientation = fromBridge.bridgeOrientation ?? 'EW';
    if (!isBridgeTraversalAllowed(orientation, dx, dy)) return false;
  }

  return true;
}
