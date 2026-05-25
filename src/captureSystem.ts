/**
 * Capture system module for Volcanae.
 * Implements building capture logic with zone unlock mechanics.
 */

import type { GameState, Position } from './types';
import type { Draft } from 'immer';
import { BuildingType, UnitTag, UnitType, Faction, DestroyBehavior } from './types';
import type { GameEvent } from './gameEvents';
import { MAP, XP, TECH, SANCTUM_COLLAPSE, ABILITIES } from './gameConfig';
import { increaseEmberOnStrongholdCapture } from './enemySystem';
import { grantXp } from './levelSystem';
import { grantArcaneCrystals } from './techSystem';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the zone number (1-5) for a given position.
 * Zone 1: high Y rows (closest to lava, south)
 * Zone 5: low Y rows (northernmost)
 *
 * Zone numbering: Zone 1 = player side (south, high Y, lava-adjacent).
 * Zone 5 = enemy side (north, low Y). Higher zone number = closer to enemy stronghold.
 * Enemies advance by *decreasing* zone number; player advances by *increasing* zone number.
 */
function getZoneForPosition(position: Position): number {
  const row = position.y;
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0; // Lava buffer, no zone
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

/**
 * Checks if a unit is on the same tile as a building.
 */
function isUnitOnBuilding(
  state: GameState | Draft<GameState>,
  unitId: string,
  buildingId: string
): boolean {
  const unit = state.units[unitId];
  const building = state.buildings[buildingId];

  if (!unit || !building) {
    return false;
  }

  return (
    unit.position.x === building.position.x &&
    unit.position.y === building.position.y
  );
}

/**
 * Updates the zonesUnlocked array based on player-owned strongholds.
 * A stronghold capture unlocks its zone AND the next zone.
 * This function always computes zones from the player's perspective because
 * zonesUnlocked is player-only state (only player captures are zone-gated).
 * It must be called whenever any stronghold changes ownership so that the
 * player's unlocked zones stay in sync.
 */
function updateZonesUnlocked(state: Draft<GameState>): void {
  // Collect all zones that should be unlocked for the player
  const unlockedZones = new Set<number>();

  // Zone 1 is always unlocked for the player
  unlockedZones.add(1);

  // Check all player-owned strongholds to determine which zones are unlocked
  for (const building of Object.values(state.buildings)) {
    if (building.type === BuildingType.STRONGHOLD && building.faction === Faction.PLAYER) {
      const zone = getZoneForPosition(building.position);

      // Owning a stronghold unlocks that zone and the next zone
      unlockedZones.add(zone);
      if (zone + 1 <= MAP.ZONE_COUNT) {
        unlockedZones.add(zone + 1);
      }
    }
  }

  // Update state with sorted array of unlocked zones
  state.zonesUnlocked = Array.from(unlockedZones).sort((a, b) => a - b);
}

// ============================================================================
// CAPTURE VALIDATION
// ============================================================================

/**
 * Checks if a unit can initiate capture of a building.
 * A unit can capture if:
 * - Unit exists and has not captured this turn
 * - Unit has not moved this turn (cannot capture in the same turn as moving onto the building)
 * - Building exists and is not owned by the unit's faction
 * - Unit is on the same tile as the building
 * - Unit has the BUILDANDCAPTURE tag
 *
 * @param state - Current game state
 * @param unitId - ID of the unit attempting to capture
 * @param buildingId - ID of the building to capture
 * @returns True if the unit can capture the building
 */
// Cross-blocking rules and tag requirements for capture live in
// unitActions.ts → canUnitCapture. Do not add tag checks or flag logic here.
// This function is a safety net for the capture preconditions only.
export function canCapture(
  state: GameState | Draft<GameState>,
  unitId: string,
  buildingId: string
): boolean {
  const unit = state.units[unitId];
  const building = state.buildings[buildingId];

  // Unit doesn't exist
  if (!unit) {
    return false;
  }

  // Building doesn't exist
  if (!building) {
    return false;
  }

  // Unit has already captured this turn
  if (unit.hasCapturedThisTurn) {
    return false;
  }

  // Unit has moved this turn — cannot capture in the same turn as moving onto a building
  if (unit.hasMovedThisTurn) {
    return false;
  }

  // Unit does not have BUILDANDCAPTURE tag
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
    return false;
  }

  // Building is already owned by unit's faction
  if (building.faction === unit.faction) {
    return false;
  }

  // Unit is not on the same tile as the building
  if (!isUnitOnBuilding(state, unitId, buildingId)) {
    return false;
  }

  return true;
}

// ============================================================================
// CAPTURE INITIATION
// ============================================================================

/**
 * Captures a building.
 * - STRONGHOLD or WATCHTOWER captured by the PLAYER: ownership is transferred to the player.
 * - All other combinations: the building is DESTROYED and the tile becomes a ruin.
 *
 * A unit must not have moved this turn to capture (i.e. must have been
 * standing on the building at the start of the turn).
 * On success:
 * - For transferred buildings: faction is changed to PLAYER; building remains on the tile.
 * - For destroyed buildings: building is removed and tile becomes a ruin.
 * - Specialist handling: player captures (destroy path) move specialist to global storage;
 *   enemy captures cause the specialist to be lost.  Transferred buildings keep their specialist.
 * - If the building was a STRONGHOLD, zones are updated and threat may increase.
 * - Unit is marked as having used all actions for this turn.
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit capturing the building
 * @param buildingId - ID of the building to capture
 */
export function initiateCapture(
  state: Draft<GameState>,
  unitId: string,
  buildingId: string,
  suppressEffects?: boolean,
  events?: GameEvent[],
): void {
  // Validate capture is allowed
  if (!canCapture(state, unitId, buildingId)) {
    return;
  }

  const unit = state.units[unitId];
  const building = state.buildings[buildingId];

  // Mark unit as having captured this turn
  unit.hasCapturedThisTurn = true;

  const unitFaction = unit.faction;
  const buildingFaction = building.faction;

  // STRONGHOLD and WATCHTOWER captured by the player: transfer ownership instead of destroying
  const isPlayerTransfer =
    unitFaction === Faction.PLAYER &&
    (building.type === BuildingType.STRONGHOLD || building.type === BuildingType.WATCHTOWER);

  if (isPlayerTransfer) {
    // Transfer ownership — building stays on the tile
    const wasEnemy = buildingFaction === Faction.ENEMY;
    building.faction = Faction.PLAYER;
    building.captureProgress = 0;
    building.isBeingCapturedBy = null;
    building.wasEnemyOwnedBeforeCapture = wasEnemy;
    building.turnCapturedByPlayer = state.turn;

    if (building.type === BuildingType.STRONGHOLD) {
      updateZonesUnlocked(state);
      increaseEmberOnStrongholdCapture(state);
      grantArcaneCrystals(state, TECH.CRYSTALS_ON_ZONE_STRONGHOLD);
    }
    if (
      building.type === BuildingType.WATCHTOWER &&
      state.fortifiedGarrisonActive &&
      building.combatStats
    ) {
      building.combatStats.attack += ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS;
      building.combatStats.attackRange += ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS;
    }

    // Grant XP to player unit for capturing the building (if it still exists)
    if (wasEnemy && !building.consumesUnitOnCapture) {
      grantXp(state, unitId, XP.CAPTURE_BUILDING, suppressEffects);
    }

    // Update capture stats
    if (wasEnemy) state.gameStats.enemyBuildingsCaptured += 1;

    // Consume the capturing unit if the building requires it (e.g. watchtower)
    if (building.consumesUnitOnCapture) {
      const tile = state.grid[unit.position.y][unit.position.x];
      if (tile.unitId === unitId) {
        tile.unitId = null;
      }
      delete state.units[unitId];
    }

    return;
  }

  // All other cases: destroy the building and create a ruin

  const { x, y } = building.position;
  const buildingType = building.type;
  const destroyBehavior = building.destroyBehavior;

  // Remove the building from state
  delete state.buildings[buildingId];

  // Clear grid tile
  const tile = state.grid[y][x];
  tile.buildingId = null;

  // Apply destroy behavior
  if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
    tile.isStrongholdRuin = true;
  } else if (destroyBehavior === DestroyBehavior.RUIN) {
    tile.isRuin = true;
  }
  // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally

  if (unitFaction === Faction.PLAYER && buildingFaction === Faction.ENEMY) {
    state.gameStats.enemyBuildingsCaptured += 1;
  } else if (unitFaction === Faction.ENEMY && buildingFaction === Faction.PLAYER) {
    state.gameStats.buildingsCapturedByEnemy += 1;
  }

  // If it was a stronghold, update zones and threat level
  if (buildingType === BuildingType.STRONGHOLD) {
    updateZonesUnlocked(state);
    // Increase threat level when player captures (destroys) a stronghold
    if (unitFaction === Faction.PLAYER) {
      increaseEmberOnStrongholdCapture(state);
    }
  }

  // If it was an Infernal Sanctum captured by the player, trigger Sanctum Collapse
  if (buildingType === BuildingType.INFERNALSANCTUM && unitFaction === Faction.PLAYER) {
    triggerSanctumCollapse(state, { x, y }, events ?? []);
  }

  // Grant XP for capturing/destroying the building
  grantXp(state, unitId, XP.CAPTURE_BUILDING, suppressEffects);
}

/**
 * Executes the Sanctum Collapse effect when a player captures an INFERNALSANCTUM.
 *
 * 1. Determines the zone of the captured sanctum using the local getZoneForPosition helper.
 * 2. Purges all ENEMY faction units whose position falls within that zone's row range.
 *    Each purged unit is removed from state.units and its tile cleared.
 *    Emit one UNIT_DEATH event per purged unit.
 * 3. Destroys all ENEMY faction buildings whose position falls within that zone's row range.
 *    Each destroyed building is removed from state.buildings, its tile cleared,
 *    and the appropriate destroy behavior (ruin / stronghold ruin) is applied.
 * 4. Sets state.zoneLockoutUntilTurn[zone] = state.turn + SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS.
 * 5. Emits one SANCTUM_COLLAPSE event with all purged unit IDs, destroyed building IDs, and the lockout turn.
 *
 * Does nothing (returns immediately) if SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS === 0.
 */
export function triggerSanctumCollapse(
  state: Draft<GameState>,
  sanctumPosition: Position,
  events: GameEvent[],
): void {
  if ((SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS as number) === 0) return;

  const zone = getZoneForPosition(sanctumPosition);
  if (zone === 0) return; // lava buffer, no valid zone

  // Compute zone row range
  const startRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - zone * MAP.ZONE_HEIGHT;
  const endRow = startRow + MAP.ZONE_HEIGHT - 1;

  // Purge all enemy units in this zone, but preserve CAVE_MONSTER units —
  // they belong to fixed encounter tiles and are not part of the zone army.
  const purgedUnitIds: string[] = [];
  const clearedUnitPositions: Position[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.ENEMY) continue;
    if (unit.type === UnitType.CAVE_MONSTER) continue;
    if (unit.position.y >= startRow && unit.position.y <= endRow) {
      purgedUnitIds.push(unit.id);
      clearedUnitPositions.push({ x: unit.position.x, y: unit.position.y });

      // Clear tile
      const tile = state.grid[unit.position.y][unit.position.x];
      if (tile.unitId === unit.id) {
        tile.unitId = null;
      }
      delete state.units[unit.id];
    }
  }

  // Destroy all enemy-owned buildings in this zone
  const destroyedBuildingIds: string[] = [];
  const clearedBuildingPositions: Position[] = [];
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (building.position.y >= startRow && building.position.y <= endRow) {
      destroyedBuildingIds.push(building.id);
      clearedBuildingPositions.push({ x: building.position.x, y: building.position.y });

      // Apply destroy behavior to the tile
      const tile = state.grid[building.position.y][building.position.x];
      const destroyBehavior = building.destroyBehavior;
      tile.buildingId = null;
      if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
        tile.isStrongholdRuin = true;
      } else if (destroyBehavior === DestroyBehavior.RUIN) {
        tile.isRuin = true;
      }
      // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally

      delete state.buildings[building.id];
    }
  }

  // Set zone lockout
  const lockoutUntilTurn = state.turn + SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS;
  state.zoneLockoutUntilTurn[zone] = lockoutUntilTurn;

  // Spawn freeze
  if (SANCTUM_COLLAPSE.SPAWN_FREEZE_TURNS > 0) {
    // Extend if a freeze is already active; never shorten an existing freeze.
    const newSpawnFreeze = state.turn + SANCTUM_COLLAPSE.SPAWN_FREEZE_TURNS;
    if (newSpawnFreeze > (state.spawnFreezeUntilTurn ?? 0)) {
      state.spawnFreezeUntilTurn = newSpawnFreeze;
    }
  }

  // Lava advance bonus: increase the countdown so lava is delayed
  if (SANCTUM_COLLAPSE.LAVA_ADVANCE_BONUS_TURNS > 0) {
    state.turnsUntilLavaAdvance += SANCTUM_COLLAPSE.LAVA_ADVANCE_BONUS_TURNS;
  }

  // Emit ZONE_CLEARED event first so celebration VFX plays while entities
  // are still visible in the live state (applied later by SANCTUM_COLLAPSE).
  events.push({
    type: 'ZONE_CLEARED',
    zone,
    sanctumPosition: { x: sanctumPosition.x, y: sanctumPosition.y },
    clearedUnitPositions,
    clearedBuildingPositions,
  });

  // Emit SANCTUM_COLLAPSE event (the animation engine's ZONE_CLEARED handler
  // will consume this from the queue and apply it after the VFX + popup).
  events.push({
    type: 'SANCTUM_COLLAPSE',
    sanctumPosition: { x: sanctumPosition.x, y: sanctumPosition.y },
    zone,
    purgedUnitIds,
    destroyedBuildingIds,
    lockoutUntilTurn,
    spawnFreezeUntilTurn: state.spawnFreezeUntilTurn,
    lavaAdvanceBonus: SANCTUM_COLLAPSE.LAVA_ADVANCE_BONUS_TURNS,
  });
}

// ============================================================================
// CAPTURE RESOLUTION
// ============================================================================

/**
 * Resolves any remaining pending captures (legacy / edge-case safety).
 * Since initiateCapture now completes captures immediately, this function
 * is a no-op under normal game flow. It is kept to handle any edge cases
 * where isBeingCapturedBy may still be set.
 *
 * STRONGHOLD and WATCHTOWER captured by the PLAYER are transferred (ownership change).
 * All other captures DESTROY the building and turn the tile into a ruin.
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function resolveCaptures(state: Draft<GameState>): void {
  // Collect building IDs first to avoid mutation during iteration
  const buildingIds = Object.keys(state.buildings);

  for (const buildingId of buildingIds) {
    const building = state.buildings[buildingId];
    if (!building) continue;

    // Skip buildings not being captured
    if (!building.isBeingCapturedBy) {
      continue;
    }

    const capturingUnit = state.units[building.isBeingCapturedBy];

    // If capturing unit was killed, cancel the capture
    if (!capturingUnit) {
      building.isBeingCapturedBy = null;
      building.captureProgress = 0;
      continue;
    }

    // STRONGHOLD and WATCHTOWER captured by the player: transfer ownership
    const isPlayerTransfer =
      capturingUnit.faction === Faction.PLAYER &&
      (building.type === BuildingType.STRONGHOLD || building.type === BuildingType.WATCHTOWER);

    if (isPlayerTransfer) {
      const wasEnemy = building.faction === Faction.ENEMY;
      building.faction = Faction.PLAYER;
      building.captureProgress = 0;
      building.isBeingCapturedBy = null;
      building.wasEnemyOwnedBeforeCapture = wasEnemy;
      building.turnCapturedByPlayer = state.turn;

      if (building.type === BuildingType.STRONGHOLD) {
        updateZonesUnlocked(state);
        increaseEmberOnStrongholdCapture(state);
        grantArcaneCrystals(state, TECH.CRYSTALS_ON_ZONE_STRONGHOLD);
      }

      capturingUnit.hasCapturedThisTurn = true;

      if (wasEnemy) state.gameStats.enemyBuildingsCaptured += 1;

      // Consume the capturing unit if the building requires it (e.g. watchtower)
      if (building.consumesUnitOnCapture) {
        const tile = state.grid[capturingUnit.position.y][capturingUnit.position.x];
        if (tile.unitId === capturingUnit.id) {
          tile.unitId = null;
        }
        delete state.units[capturingUnit.id];
      }

      continue;
    }

    // All other cases: destroy the building and create a ruin

    const { x, y } = building.position;
    const buildingType = building.type;
    const capturingFaction = capturingUnit.faction;
    const buildingFaction = building.faction;
    const destroyBehavior = building.destroyBehavior;

    // Remove the building from state
    delete state.buildings[buildingId];

    // Clear grid tile
    const tile = state.grid[y][x];
    tile.buildingId = null;

    // Apply destroy behavior
    if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
      tile.isStrongholdRuin = true;
    } else if (destroyBehavior === DestroyBehavior.RUIN) {
      tile.isRuin = true;
    }
    // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally

    // Update capture stats
    if (capturingFaction === Faction.PLAYER && buildingFaction === Faction.ENEMY) {
      state.gameStats.enemyBuildingsCaptured += 1;
    } else if (capturingFaction === Faction.ENEMY && buildingFaction === Faction.PLAYER) {
      state.gameStats.buildingsCapturedByEnemy += 1;
    }

    // If it was a stronghold, update zones and threat level
    if (buildingType === BuildingType.STRONGHOLD) {
      updateZonesUnlocked(state);
      if (capturingFaction === Faction.PLAYER) {
        increaseEmberOnStrongholdCapture(state);
      }
    }

    // Mark capturing unit actions
    capturingUnit.hasCapturedThisTurn = true;
  }
}
