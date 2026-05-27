/**
 * Movement system module for Volcanae.
 * Implements unit movement logic with reachability calculation.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, TechFlag, TileType, TileStatus, UnitTag } from './types';
import { MAP, ABILITIES } from './gameConfig';
import { getTilesWithinEdgeCircleRange } from './rangeUtils';
import { useFloaterStore } from './floaterStore';

// ============================================================================
// MOVEMENT CALCULATIONS
// ============================================================================

// 8-directional movement vectors shared by getReachableTiles and other helpers.
const MOVE_DIRECTIONS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Gets all tiles that a unit can reach from its current position.
 *
 * Two independent checks are applied; a tile must pass both to be shown as
 * a valid movement destination:
 *
 * 1. GEOMETRIC RANGE (edge-circle):
 *    The tile must be within the unit's movement range as computed by the
 *    edge-circle system. This defines the movement-range shape independently
 *    of any blocking terrain — i.e., the visual "footprint" of the range.
 *
 * 2. PATH REACHABILITY (BFS flood-fill):
 *    A valid path must exist from the unit's current position to the tile,
 *    where every tile along the path satisfies:
 *    - Not a CANYON or WATER tile (blocks traversal for all units)
 *    - Not an undiscovered tile (player units only)
 *    - Not a lava tile (player units only — enemy units may enter lava)
 *    - Not occupied by another unit
 *    - Not occupied by a combat building, except neutral watchtowers
 *
 *    The BFS is step-limited to moveRange so that detour paths consuming
 *    more movement points than the unit possesses are rejected. The BFS
 *    explores freely (not bounded to inRangeSet) so that intermediate steps
 *    that go "outside" the geometric range shape are permitted as waypoints
 *    for paths that end inside it.
 *
 * The unit must also not have already moved this turn.
 *
 * @param state - Current game state
 * @param unitId - ID of the unit to check movement for
 * @returns Array of positions that are valid destinations
 */
export function getReachableTiles(
  state: GameState | Draft<GameState>,
  unitId: string
): Position[] {
  const unit = state.units[unitId];

  // Unit doesn't exist → nothing to do
  if (!unit) return [];

  // HIT_AND_RUN: allow a second move after attacking (post-attack move slot),
  // even though hasMovedThisTurn is true from the pre-attack move.
  const isHitAndRunPostAttack =
    unit.tags.includes(UnitTag.HIT_AND_RUN) &&
    unit.hasAttackedThisTurn &&
    !unit.hasUsedPostAttackMoveThisTurn;

  // All other units: blocked once they have moved this turn
  if (unit.hasMovedThisTurn && !isHitAndRunPostAttack) {
    return [];
  }

  const unitPosition = unit.position;
  let moveRange = unit.stats.moveRange;

  // SKIRMISHER / OUTRIDER tags: bonus movement range
  if (unit.faction === Faction.PLAYER) {
    if (unit.tags.includes(UnitTag.SKIRMISHER)) {
      moveRange += ABILITIES.SKIRMISHER_MOVE_BONUS;
    } else if (unit.tags.includes(UnitTag.OUTRIDER)) {
      moveRange += ABILITIES.OUTRIDER_MOVE_BONUS;
    }
  }

  // TO_THE_FRONT tech: player units >N tiles south of the northmost player unit
  // get a movement bonus.
  if (unit.faction === Faction.PLAYER && state.techFlags.includes(TechFlag.TO_THE_FRONT)) {
    let minPlayerY = unitPosition.y;
    for (const u of Object.values(state.units)) {
      if (u.faction === Faction.PLAYER && u.position.y < minPlayerY) {
        minPlayerY = u.position.y;
      }
    }
    if (unitPosition.y - minPlayerY > ABILITIES.TO_THE_FRONT_MIN_DISTANCE) {
      moveRange += ABILITIES.TO_THE_FRONT_MOVE_BONUS;
    }
  }

  // HIT_AND_RUN post-attack move: cap range to the configured post-attack value.
  if (isHitAndRunPostAttack) {
    moveRange = Math.min(moveRange, ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE);
  }

  // ── Check 1: geometric range ─────────────────────────────────────────────
  // Build the set of tile keys that fall within the edge-circle range.
  // This is computed without any knowledge of terrain or occupancy — it
  // represents the raw movement-range shape.
  const rangeCoords = getTilesWithinEdgeCircleRange(
    unitPosition.x,
    unitPosition.y,
    moveRange,
    MAP.GRID_WIDTH,
    MAP.GRID_HEIGHT,
  );
  const inRangeSet = new Set<string>();
  for (const { x, y } of rangeCoords) {
    if (x !== unitPosition.x || y !== unitPosition.y) {
      inRangeSet.add(`${x},${y}`);
    }
  }

  // ── Check 2: BFS path reachability ───────────────────────────────────────
  // Flood-fill from the unit's position, restricted to tiles that are also in
  // inRangeSet — the BFS may only use tiles within the geometric range as
  // waypoints. CANYON/WATER tiles block traversal entirely so a unit cannot
  // "jump" over them even when the destination lies within the geometric range.
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; steps: number }> = [
    { x: unitPosition.x, y: unitPosition.y, steps: 0 },
  ];
  visited.add(`${unitPosition.x},${unitPosition.y}`);
  let head = 0;

  const bfsReachable: Position[] = [];

  while (head < queue.length) {
    const { x, y, steps } = queue[head++];
    if (steps >= moveRange) continue;

    for (const [dx, dy] of MOVE_DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;

      const nkey = `${nx},${ny}`;
      if (visited.has(nkey)) continue;
      // Only traverse tiles that are within the geometric movement range.
      if (!inRangeSet.has(nkey)) continue;
      visited.add(nkey);

      const tile = state.grid[ny][nx];

      // CANYON/WATER: impassable — cannot enter or traverse
      // Exception: frozen (status === FROZEN) water tiles are passable for player units.
      if (tile.terrainType === TileType.CANYON) continue;
      if (tile.terrainType === TileType.WATER) {
        if (tile.status !== TileStatus.FROZEN) continue;
        if (unit.faction === Faction.ENEMY) continue;
      }

      // Cannot enter undiscovered tiles (player units only)
      if (!tile.isRevealed && unit.faction === Faction.PLAYER) continue;

      // Cannot enter lava tiles (player units only — enemy units may enter lava)
      if (tile.isLava && unit.faction === Faction.PLAYER) continue;

      // Cannot enter tiles occupied by another unit
      if (tile.unitId !== null) continue;

      // Cannot enter tiles occupied by a building that has combat stats,
      // except for neutral watchtowers which can be moved onto (to capture them).
      // Owned watchtowers (player or enemy) block movement like other combat buildings.
      if (tile.buildingId !== null) {
        const tileBuilding = state.buildings[tile.buildingId];
        if (tileBuilding && tileBuilding.combatStats !== null) {
          const isNeutralWatchtower =
            tileBuilding.type === BuildingType.WATCHTOWER && tileBuilding.faction === null;
          if (!isNeutralWatchtower) continue;
        }
      }

      // Player units cannot enter portal entrance or exit tiles.
      if (unit.faction === Faction.PLAYER) {
        let blockedByPortal = false;
        for (const portal of Object.values(state.portals)) {
          if (
            (portal.entrancePos.x === nx && portal.entrancePos.y === ny) ||
            (portal.exitPos.x === nx && portal.exitPos.y === ny)
          ) {
            blockedByPortal = true;
            break;
          }
        }
        if (blockedByPortal) continue;
      }

      bfsReachable.push({ x: nx, y: ny });
      queue.push({ x: nx, y: ny, steps: steps + 1 });
    }
  }

  // ── Result ───────────────────────────────────────────────────────────────
  // Every tile in bfsReachable is already within the geometric range (BFS was
  // constrained to inRangeSet) AND reachable via a valid terrain path.
  return bfsReachable;
}

// ============================================================================
// MOVEMENT RESOLUTION
// ============================================================================

/**
 * Checks whether the tile a unit just entered contains a GRAVE_TRAP building.
 * If it does, stuns the triggering unit and all enemy units in the 8-tile AOE
 * around the trap, then destroys the trap.
 */
export function checkGraveTrapTrigger(
  state: Draft<GameState>,
  unitId: string,
): void {
  const unit = state.units[unitId];
  if (!unit) return;
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile || !tile.buildingId) return;
  const building = state.buildings[tile.buildingId];
  if (!building || building.type !== BuildingType.GRAVE_TRAP) return;

  const trapPos = { x: unit.position.x, y: unit.position.y };
  const stunTurns = building.trapStunTurns ?? 1;
  const floaterStore = useFloaterStore.getState();

  // Stun the triggering unit (ALERT-tagged units are immune).
  if (!unit.tags.includes(UnitTag.ALERT)) {
    unit.pinnedUntilTurn = state.turn + stunTurns - 1;
  }
  floaterStore.addFloater({
    value: 0,
    label: '💫 Stunned',
    x: trapPos.x,
    y: trapPos.y,
    isEnemy: unit.faction !== Faction.PLAYER,
    floaterType: 'revive',
  });

  // AOE: stun all enemy (non-player) units in the 8 adjacent tiles.
  for (const [dx, dy] of MOVE_DIRECTIONS) {
    const nx = trapPos.x + dx;
    const ny = trapPos.y + dy;
    if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
    const adjTile = state.grid[ny]?.[nx];
    if (!adjTile?.unitId) continue;
    const adjUnit = state.units[adjTile.unitId];
    if (!adjUnit || adjUnit.faction === Faction.PLAYER) continue;
    // ALERT-tagged units are immune to stun.
    if (!adjUnit.tags.includes(UnitTag.ALERT)) {
      adjUnit.pinnedUntilTurn = state.turn + stunTurns - 1;
    }
    floaterStore.addFloater({
      value: 0,
      label: '💫 Stunned',
      x: nx,
      y: ny,
      isEnemy: true,
      floaterType: 'revive',
    });
  }

  delete state.buildings[tile.buildingId];
  tile.buildingId = null;
}

/**
 * Resolves a slide from a FROZEN tile.
 *
 * Called after a unit lands on a FROZEN tile. The slide moves the unit one
 * additional step in the same direction it arrived from. Chain slides are
 * intentionally not supported: landing on a second FROZEN tile after sliding
 * just moves the unit there without triggering another slide.
 *
 * Slide destination resolution (in order):
 *  - Out of bounds                → stay on FROZEN tile, no effect
 *  - Tile occupied by another unit → stay
 *  - Tile with impassable building (combatStats !== null, except neutral Watchtower) → stay
 *  - LAVA tile                    → unit dies; enemy units sacrifice to lava (ember +1)
 *  - CANYON terrain               → unit dies
 *  - WATER (not FROZEN)           → unit drowns
 *  - Any other tile (incl. MOUNTAIN, FROZEN, resource/walkable buildings) → unit moves there; no further slide
 *
 * Note: MOUNTAIN terrain is intentionally NOT a slide-stopper — units can walk
 * onto mountain tiles in normal movement, so slides must be consistent.
 */
export function resolveSlide(
  state: Draft<GameState>,
  unitId: string,
  dx: number,
  dy: number,
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  const slideX = unit.position.x + dx;
  const slideY = unit.position.y + dy;

  // Out of bounds → stay
  if (slideX < 0 || slideX >= MAP.GRID_WIDTH || slideY < 0 || slideY >= MAP.GRID_HEIGHT) return;

  const slideTile = state.grid[slideY]?.[slideX];
  if (!slideTile) return;

  // Tile occupied by another unit → stay
  if (slideTile.unitId !== null) return;

  // Tile with impassable building (combat buildings) → stay.
  // Resource buildings (MINE, WOODCUTTER, etc.) and other walkable buildings
  // (combatStats === null) do NOT block slides — consistent with normal movement.
  if (slideTile.buildingId !== null) {
    const bld = state.buildings[slideTile.buildingId];
    if (bld && bld.combatStats !== null) {
      const isNeutralWatchtower = bld.type === BuildingType.WATCHTOWER && bld.faction === null;
      if (!isNeutralWatchtower) return;
    }
  }

  // ── Death cases ────────────────────────────────────────────────────────────

  // LAVA tile → unit destroyed; enemy unit sacrifices to lava (ember +1)
  if (slideTile.isLava) {
    const currentTile = state.grid[unit.position.y][unit.position.x];
    if (currentTile.unitId === unitId) currentTile.unitId = null;
    if (unit.faction === Faction.ENEMY) {
      state.ember += 1;
    } else {
      state.gameStats.unitsLost += 1;
    }
    delete state.units[unitId];
    return;
  }

  // CANYON terrain → unit destroyed
  if (slideTile.terrainType === TileType.CANYON) {
    const currentTile = state.grid[unit.position.y][unit.position.x];
    if (currentTile.unitId === unitId) currentTile.unitId = null;
    if (unit.faction === Faction.PLAYER) {
      state.gameStats.unitsLost += 1;
    }
    delete state.units[unitId];
    return;
  }

  // WATER (not FROZEN) → unit drowns
  if (slideTile.terrainType === TileType.WATER && slideTile.status !== TileStatus.FROZEN) {
    const currentTile = state.grid[unit.position.y][unit.position.x];
    if (currentTile.unitId === unitId) currentTile.unitId = null;
    if (unit.faction === Faction.PLAYER) {
      state.gameStats.unitsLost += 1;
    }
    delete state.units[unitId];
    return;
  }

  // ── Normal slide ───────────────────────────────────────────────────────────
  // Any other passable tile (including another FROZEN tile): move there.
  // No further slide is triggered (chain slides are intentionally prevented).
  const currentTile = state.grid[unit.position.y][unit.position.x];
  if (currentTile.unitId === unitId) currentTile.unitId = null;
  slideTile.unitId = unitId;
  unit.position.x = slideX;
  unit.position.y = slideY;
}

/**
 * Moves a unit to a target position by mutating the draft state.
 * - Validates the move is legal
 * - Updates the unit's position
 * - Updates grid tile references
 * - Marks the unit as having moved this turn
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit to move
 * @param targetPosition - Position to move the unit to
 */
export function moveUnit(
  state: Draft<GameState>,
  unitId: string,
  targetPosition: Position
): void {
  const unit = state.units[unitId];

  // Validate unit exists
  if (!unit) {
    return;
  }

  // Check if the target position is reachable
  const reachableTiles = getReachableTiles(state, unitId);
  const isValidDestination = reachableTiles.some(
    (pos) => pos.x === targetPosition.x && pos.y === targetPosition.y
  );

  if (!isValidDestination) {
    return;
  }

  // Get the old and new tiles
  const oldTile = state.grid[unit.position.y][unit.position.x];
  const newTile = state.grid[targetPosition.y][targetPosition.x];

  // Compute movement direction (normalised to {-1,0,1}) before position update.
  // Stored on the unit so the slide resolver (and future systems) can reference it.
  const moveDx = Math.sign(targetPosition.x - unit.position.x);
  const moveDy = Math.sign(targetPosition.y - unit.position.y);

  // Update grid: remove unit from old tile
  if (oldTile.unitId === unitId) {
    oldTile.unitId = null;
  }

  // Update grid: add unit to new tile
  newTile.unitId = unitId;

  // Update unit position
  unit.position.x = targetPosition.x;
  unit.position.y = targetPosition.y;

  // If an enemy unit moves onto a lava tile, destroy it and increment threat
  if (newTile.isLava && unit.faction === Faction.ENEMY) {
    newTile.unitId = null;
    delete state.units[unitId];
    state.ember += 1;
    return;
  }

  // Mark unit as having moved this turn
  unit.hasMovedThisTurn = true;
  unit.lastMovedTurn = state.turn;
  unit.lastMovementDirection = { dx: moveDx, dy: moveDy };

  // HIT_AND_RUN: if this move happens after attacking, consume the post-attack move slot
  if (unit.hasAttackedThisTurn && unit.tags.includes(UnitTag.HIT_AND_RUN)) {
    unit.hasUsedPostAttackMoveThisTurn = true;
  }

  // GRAVE_TRAP: check if the unit landed on a trap
  checkGraveTrapTrigger(state, unitId);

  // FROZEN tile: trigger the slippery slide mechanic.
  // Re-fetch the unit — it must still be alive (not killed by a GRAVE_TRAP or other effect).
  if (newTile.status === TileStatus.FROZEN && state.units[unitId]) {
    resolveSlide(state, unitId, moveDx, moveDy);
  }
}
