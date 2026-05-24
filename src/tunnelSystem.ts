/**
 * Tunnel system for Volcanae.
 *
 * Implements the multi-turn tunnel state machine for units with the TUNNEL tag
 * (currently RIFTWORM).
 *
 * Map orientation reminder:
 *   - Zone 1 (player stronghold) is at HIGH Y (south).
 *   - Zone 5 (enemy territory) is at LOW Y (north).
 *   - Enemies move southward (increasing Y) to attack the player.
 *   - "South" in gameplay = higher Y = toward the player stronghold.
 *   - The burrower tunnels SOUTHWARD (increasing Y) to emerge past the
 *     player's defensive line, between the line and the stronghold.
 */

import type { Draft } from 'immer';
import type { GameState, Position } from './types';
import { Faction, UnitTag, TileType } from './types';
import {
  TUNNEL_RANGE_MIN,
  TUNNEL_RANGE_MAX,
  TUNNEL_EMERGE_DAMAGE,
  TUNNEL_COOLDOWN_TURNS,
  TUNNEL_MAX_RETRY_TURNS,
  TUNNEL_FORCED_EMERGE_HP_MULTIPLIER,
  MAP,
} from './gameConfig';
import { applyTileStatus } from './tileStatusSystem';
import { TileStatus } from './types';
import type { GameEvent } from './gameEvents';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True when the tile at (x, y) is a valid dig-in / emergence position. */
function isTileValidForTunnel(state: Draft<GameState>, x: number, y: number): boolean {
  if (x < 0 || x >= MAP.GRID_WIDTH || y < 0 || y >= MAP.GRID_HEIGHT) return false;
  const tile = state.grid[y][x];
  // Must not be lava
  if (tile.isLava) return false;
  // Must not be impassable terrain
  if (tile.terrainType === TileType.CANYON) return false;
  // Must not have a building or ruin
  if (tile.buildingId !== null) return false;
  if (tile.isStrongholdRuin) return false;
  return true;
}

/** True when the tile at (x, y) is free for a unit to stand on (no occupying unit). */
function isTileFreeForUnit(state: Draft<GameState>, x: number, y: number): boolean {
  if (!isTileValidForTunnel(state, x, y)) return false;
  return state.grid[y][x].unitId === null;
}

/**
 * Find a valid emergence position in the column `x`, between
 * `baseY + TUNNEL_RANGE_MIN` and `baseY + TUNNEL_RANGE_MAX` (southward = higher Y).
 * Returns the first valid free tile, or null if none exists.
 */
function findEmergenceTile(
  state: Draft<GameState>,
  x: number,
  baseY: number,
): Position | null {
  for (let dy = TUNNEL_RANGE_MIN; dy <= TUNNEL_RANGE_MAX; dy++) {
    const ey = baseY + dy;
    if (isTileFreeForUnit(state, x, ey)) {
      return { x, y: ey };
    }
  }
  return null;
}

/**
 * Find a fallback emergence tile within Chebyshev distance 1 of `center`.
 * Used when the planned emergence tile becomes invalid and retry budget is exhausted.
 * Returns the first valid free tile found in raster order, or null.
 */
function findFallbackEmergence(
  state: Draft<GameState>,
  center: Position,
): Position | null {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue; // skip the center itself
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (isTileFreeForUnit(state, nx, ny)) {
        return { x: nx, y: ny };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exported state-machine functions
// ---------------------------------------------------------------------------

/**
 * Determines if a unit should begin tunneling this enemy turn.
 * Called during the enemy AI phase, before standard movement decisions.
 *
 * A unit begins tunneling if:
 *  - It has the TUNNEL tag
 *  - Its tunnelState is IDLE or null/undefined
 *  - tunnelCooldownUntil is null/undefined or <= state.turn
 *  - Its current tile is valid for digging in
 *  - There is at least one valid emergence tile TUNNEL_RANGE_MIN..MAX southward
 *  - Heuristic: ≥ 3 player units are south of the burrower (higher Y) —
 *    meaning a dense player formation exists between the burrower and the stronghold
 *
 * Returns true if tunneling begins, false otherwise.
 */
export function tryBeginTunnel(
  state: Draft<GameState>,
  unitId: string,
  events?: GameEvent[],
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (!unit.tags.includes(UnitTag.TUNNEL)) return false;

  // Already in a tunnel state other than IDLE
  if (unit.tunnelState && unit.tunnelState !== 'IDLE') return false;

  // Check cooldown
  if (unit.tunnelCooldownUntil != null && unit.tunnelCooldownUntil > state.turn) return false;

  const { x, y } = unit.position;

  // Current tile must be valid (not on building/ruin/canyon/lava)
  if (!isTileValidForTunnel(state, x, y)) return false;

  // Find a valid emergence tile
  const emergenceTile = findEmergenceTile(state, x, y);
  if (!emergenceTile) return false;

  // Heuristic: only tunnel if ≥ 3 player units are south (higher Y) of the burrower
  const playerUnitsSouth = Object.values(state.units).filter(
    u => u.faction === Faction.PLAYER && u.position.y > y,
  ).length;
  if (playerUnitsSouth < 3) return false;

  // Begin tunneling
  unit.tunnelState = 'DIGGING_IN';
  unit.tunnelStartPosition = { x, y };
  unit.tunnelPlannedEmergence = emergenceTile;
  unit.tunnelTurnsUnderground = 0;

  // Remove unit from tile grid (invisible and unattackable while underground)
  const tile = state.grid[y][x];
  if (tile.unitId === unitId) {
    tile.unitId = null;
  }

  events?.push({
    type: 'TUNNEL_DIG_IN',
    unitId,
    position: { x, y },
  });

  return true;
}

/**
 * Processes one turn of tunneling for a unit currently in a tunnel state.
 * Handles transitions between DIGGING_IN → UNDERGROUND → EMERGING → IDLE.
 *
 * Returns true if the unit's turn was consumed by tunnel mechanics (caller
 * should skip normal AI action). Returns false if the unit should act normally.
 */
export function processTunnelTurn(
  state: Draft<GameState>,
  unitId: string,
  events?: GameEvent[],
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;

  const tunnelState = unit.tunnelState;
  if (!tunnelState || tunnelState === 'IDLE') return false;

  switch (tunnelState) {
    case 'DIGGING_IN': {
      // Transition to fully underground — no further action this turn
      unit.tunnelState = 'UNDERGROUND';
      unit.tunnelTurnsUnderground = (unit.tunnelTurnsUnderground ?? 0) + 1;
      return true;
    }

    case 'UNDERGROUND': {
      const planned = unit.tunnelPlannedEmergence;
      if (!planned) {
        // Corrupt state — abort tunnel
        _abortTunnel(state, unitId);
        return false;
      }

      // Validate that the planned emergence tile is still free
      if (isTileFreeForUnit(state, planned.x, planned.y)) {
        // Transition to EMERGING and warn the player
        unit.tunnelState = 'EMERGING';
        events?.push({
          type: 'TUNNEL_EMERGE_WARNING',
          unitId,
          position: { x: planned.x, y: planned.y },
        });
        return true;
      }

      // Tile is blocked
      const turns = unit.tunnelTurnsUnderground ?? 0;
      if (turns < TUNNEL_MAX_RETRY_TURNS) {
        // Stay underground one more turn and retry
        unit.tunnelTurnsUnderground = turns + 1;
        return true;
      }

      // Retry budget exhausted — try to find an alternative
      const fallback = findFallbackEmergence(state, planned);
      if (fallback) {
        unit.tunnelPlannedEmergence = fallback;
        unit.tunnelState = 'EMERGING';
        events?.push({
          type: 'TUNNEL_EMERGE_WARNING',
          unitId,
          position: { x: fallback.x, y: fallback.y },
        });
        return true;
      }

      // Last resort: force-emerge on planned tile with HP reduction
      unit.stats.currentHp = Math.max(1, Math.floor(unit.stats.currentHp * TUNNEL_FORCED_EMERGE_HP_MULTIPLIER));
      unit.tunnelState = 'EMERGING';
      events?.push({
        type: 'TUNNEL_EMERGE_WARNING',
        unitId,
        position: { x: planned.x, y: planned.y },
      });
      return true;
    }

    case 'EMERGING': {
      const planned = unit.tunnelPlannedEmergence;
      if (!planned) {
        _abortTunnel(state, unitId);
        return false;
      }

      // Determine emergence position (use planned or best available)
      let emergePos: Position;
      if (isTileFreeForUnit(state, planned.x, planned.y)) {
        emergePos = { x: planned.x, y: planned.y };
      } else {
        const fallback = findFallbackEmergence(state, planned);
        if (fallback) {
          emergePos = fallback;
        } else {
          // Force emerge anyway — displace any occupant by just landing on planned
          emergePos = { x: planned.x, y: planned.y };
        }
      }

      // Place the unit on the emergence tile
      const emTile = state.grid[emergePos.y][emergePos.x];
      emTile.unitId = unitId;
      unit.position = { x: emergePos.x, y: emergePos.y };

      // Apply emergence AoE damage to adjacent player units (Chebyshev 1)
      const affectedPositions = _applyEmergenceDamage(state, unitId, emergePos, events ?? []);

      // Corrupt the emergence tile
      applyTileStatus(state, emergePos, TileStatus.CORRUPTED, events);

      // Reset tunnel state
      unit.tunnelState = 'IDLE';
      unit.tunnelStartPosition = null;
      unit.tunnelPlannedEmergence = null;
      unit.tunnelTurnsUnderground = 0;
      unit.tunnelCooldownUntil = state.turn + TUNNEL_COOLDOWN_TURNS;

      events?.push({
        type: 'TUNNEL_EMERGE',
        unitId,
        position: { x: emergePos.x, y: emergePos.y },
        affectedPositions,
      });

      return true;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Apply flat AoE damage to all player units within Chebyshev distance 1 of
 * the emergence position. Returns the positions of all units that took damage.
 */
function _applyEmergenceDamage(
  state: Draft<GameState>,
  _burrowerUnitId: string,
  emergePos: Position,
  events: GameEvent[],
): Position[] {
  const affected: Position[] = [];
  for (const target of Object.values(state.units)) {
    if (target.faction !== Faction.PLAYER) continue;
    const dx = Math.abs(target.position.x - emergePos.x);
    const dy = Math.abs(target.position.y - emergePos.y);
    if (Math.max(dx, dy) > 1) continue;

    // Snapshot position before any mutation so the VFX placement is correct
    // even if the unit dies below.
    affected.push({ x: target.position.x, y: target.position.y });

    target.stats.currentHp -= TUNNEL_EMERGE_DAMAGE;
    state.gameStats.damageReceived += TUNNEL_EMERGE_DAMAGE;

    if (target.stats.currentHp <= 0) {
      const deathPos = { x: target.position.x, y: target.position.y };
      const tile = state.grid[deathPos.y][deathPos.x];
      if (tile.unitId === target.id) tile.unitId = null;
      delete state.units[target.id];
      state.gameStats.unitsLost += 1;
      events.push({
        type: 'UNIT_DEATH',
        unitId: target.id,
        position: deathPos,
        faction: target.faction,
      });
    }
  }
  return affected;
}

/**
 * Abort a tunnel mid-way (corrupt state recovery).
 * Attempts to place the unit back on its dig-in tile or the nearest free tile.
 */
function _abortTunnel(state: Draft<GameState>, unitId: string): void {
  const unit = state.units[unitId];
  if (!unit) return;

  const start = unit.tunnelStartPosition;
  let restorePos: Position | null = null;

  if (start && isTileFreeForUnit(state, start.x, start.y)) {
    restorePos = start;
  } else {
    // Try to find any free adjacent tile
    const base = start ?? unit.position;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = base.x + dx;
        const ny = base.y + dy;
        if (isTileFreeForUnit(state, nx, ny)) {
          restorePos = { x: nx, y: ny };
          break;
        }
      }
      if (restorePos) break;
    }
  }

  if (restorePos) {
    unit.position = restorePos;
    state.grid[restorePos.y][restorePos.x].unitId = unitId;
  }
  // Clear tunnel state
  unit.tunnelState = 'IDLE';
  unit.tunnelStartPosition = null;
  unit.tunnelPlannedEmergence = null;
  unit.tunnelTurnsUnderground = 0;
  unit.tunnelCooldownUntil = state.turn + TUNNEL_COOLDOWN_TURNS;
}
