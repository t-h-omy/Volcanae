/**
 * Enemy AI system module for Volcanae.
 * Implements enemy unit spawning, AI behavior, and threat scaling.
 */

import type { GameState, Unit, Building, Position } from './types';
import type { Draft } from 'immer';
import { Faction, UnitType, UnitTag, BuildingType } from './types';
import { UNITS, ENEMY, MAP } from './gameConfig';
import { resolveAttack } from './combatSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';

// ============================================================================
// ID GENERATION
// ============================================================================

let enemyIdCounter = 0;

/**
 * Generates a unique ID for enemy units.
 */
function generateEnemyId(): string {
  return `enemy_unit_${Date.now()}_${++enemyIdCounter}`;
}

// ============================================================================
// BUILDING → UNIT TYPE MAPPING
// ============================================================================

/** Maps each enemy recruitment building type to the unit type it spawns. */
const BUILDING_SPAWN_UNIT_TYPE: Partial<Record<BuildingType, UnitType>> = {
  [BuildingType.BARRACKS]: UnitType.LAVA_GRUNT,
  [BuildingType.ARCHER_CAMP]: UnitType.LAVA_ARCHER,
  [BuildingType.RIDER_CAMP]: UnitType.LAVA_RIDER,
  [BuildingType.SIEGE_CAMP]: UnitType.LAVA_SIEGE,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates the manhattan distance between two positions.
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Checks if a position is within the grid bounds.
 */
function isWithinBounds(pos: Position): boolean {
  return (
    pos.x >= 0 &&
    pos.x < MAP.GRID_WIDTH &&
    pos.y >= 0 &&
    pos.y < MAP.GRID_HEIGHT
  );
}

/**
 * Checks if a building is a recruitment building.
 */
function isRecruitmentBuilding(building: Building): boolean {
  return (
    building.type === BuildingType.BARRACKS ||
    building.type === BuildingType.ARCHER_CAMP ||
    building.type === BuildingType.RIDER_CAMP ||
    building.type === BuildingType.SIEGE_CAMP
  );
}

/**
 * Calculates the lava boost factor for a spawned unit based on building distance to lava.
 * boostFactor = Math.max(0, 1 - (distanceToLava / MAX_LAVA_BOOST_DISTANCE))
 */
function calculateLavaBoostFactor(
  buildingPosition: Position,
  lavaFrontRow: number
): number {
  // Distance is the number of rows between building and lava front
  // lavaFrontRow is the current lava row (or -1 if no lava yet)
  const effectiveLavaRow = Math.max(0, lavaFrontRow);
  const distanceToLava = buildingPosition.y - effectiveLavaRow;

  return Math.max(
    0,
    1 - distanceToLava / ENEMY.MAX_LAVA_BOOST_DISTANCE
  );
}

/**
 * Gets the number of units to spawn based on threat level.
 * Base 1 unit per building, +1 spawn per 3 threat levels.
 */
function getSpawnCount(threatLevel: number): number {
  return (
    ENEMY.ENEMY_SPAWN_PER_BUILDING_BASE +
    Math.floor(threatLevel / 3) * ENEMY.ENEMY_THREAT_SPAWN_BONUS
  );
}

/**
 * Returns true if any player unit is within the building's discover radius.
 */
function isPlayerUnitInDiscoverRadius(
  state: Draft<GameState>,
  building: Building
): boolean {
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.PLAYER) continue;
    const inRange = isTileWithinEdgeCircleRange(
      building.position.x,
      building.position.y,
      unit.position.x,
      unit.position.y,
      building.discoverRadius
    );
    if (inRange) return true;
  }
  return false;
}

/**
 * Calculates the spawn probability for a recruitment building this turn.
 * - 100% if a player unit is within the building's discover radius.
 * - Otherwise: baseSpawnProbability + maxThreatBonus * (threatLevel / maxThreat)
 */
function getSpawnProbability(
  state: Draft<GameState>,
  building: Building
): number {
  if (isPlayerUnitInDiscoverRadius(state, building)) {
    return 1.0;
  }
  const threatRatio = Math.min(state.threatLevel / ENEMY.MAX_THREAT, 1);
  return ENEMY.BASE_SPAWN_PROBABILITY + ENEMY.MAX_THREAT_BONUS * threatRatio;
}

/**
 * Finds all adjacent positions (4-directional).
 */
function getAdjacentPositions(pos: Position): Position[] {
  return [
    { x: pos.x, y: pos.y - 1 }, // South (toward lava/player, lower row)
    { x: pos.x + 1, y: pos.y }, // East
    { x: pos.x, y: pos.y + 1 }, // North (away from lava, higher row)
    { x: pos.x - 1, y: pos.y }, // West
  ].filter(isWithinBounds);
}

/**
 * Gets the next step toward a target position, avoiding occupied tiles.
 * Returns null if no valid step exists.
 */
function getNextStepToward(
  state: Draft<GameState>,
  from: Position,
  to: Position
): Position | null {
  const adjacent = getAdjacentPositions(from);

  // Filter to valid moves (not lava, not occupied)
  const validMoves = adjacent.filter((pos) => {
    const tile = state.grid[pos.y][pos.x];
    return !tile.isLava && tile.unitId === null;
  });

  if (validMoves.length === 0) {
    return null;
  }

  // Sort by distance to target (prefer closer tiles)
  validMoves.sort(
    (a, b) => manhattanDistance(a, to) - manhattanDistance(b, to)
  );

  return validMoves[0];
}

// ============================================================================
// ENEMY UNIT SPAWNING
// ============================================================================

/**
 * Creates an enemy unit of the specified type at the given position with optional lava boost.
 */
function createEnemyUnit(
  position: Position,
  unitType: UnitType,
  lavaBoostEnabled: boolean,
  lavaFrontRow: number,
  buildingPosition: Position
): Unit {
  const baseHp: number = UNITS.UNIT_MAX_HP;
  const baseAttack: number = UNITS.UNIT_ATTACK;

  let finalHp: number = baseHp;
  let finalAttack: number = baseAttack;
  const tags: UnitTag[] = [];

  if (lavaBoostEnabled) {
    const boostFactor = calculateLavaBoostFactor(buildingPosition, lavaFrontRow);
    const boostMultiplier = 1 + boostFactor * ENEMY.MAX_LAVA_BOOST_MULTIPLIER;

    finalHp = Math.round(baseHp * boostMultiplier);
    finalAttack = Math.round(baseAttack * boostMultiplier);
    tags.push(UnitTag.LAVA_BOOST);
  }

  return {
    id: generateEnemyId(),
    type: unitType,
    faction: Faction.ENEMY,
    position: { ...position },
    stats: {
      maxHp: finalHp,
      currentHp: finalHp,
      attack: finalAttack,
      defense: UNITS.UNIT_DEFENSE,
      moveRange: UNITS.UNIT_MOVE_RANGE,
      visionRange: UNITS.UNIT_VISION_RANGE,
      triggerRange: UNITS.UNIT_TRIGGER_RANGE,
      movementActions: UNITS.UNIT_MOVEMENT_ACTIONS,
      attackRange: UNITS.UNIT_ATTACK_RANGE,
    },
    tags,
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasCapturedThisTurn: false,
  };
}

/**
 * Spawns enemy units from all enemy-owned recruitment buildings.
 * Each building uses a spawn probability roll; on success, spawns units based
 * on threat level. The unit type spawned depends on the building type.
 */
function spawnEnemyUnits(state: Draft<GameState>): void {
  const spawnCount = getSpawnCount(state.threatLevel);

  for (const building of Object.values(state.buildings)) {
    // Only spawn from enemy-owned recruitment buildings
    if (building.faction !== Faction.ENEMY) {
      continue;
    }

    if (!isRecruitmentBuilding(building)) {
      continue;
    }

    // Determine unit type for this building
    const unitType: UnitType = BUILDING_SPAWN_UNIT_TYPE[building.type] ?? UnitType.LAVA_GRUNT;

    // Roll spawn probability
    const spawnProbability = getSpawnProbability(state, building);
    if (Math.random() >= spawnProbability) {
      continue;
    }

    // Spawn units based on spawn count
    for (let i = 0; i < spawnCount; i++) {
      // Find a spawn position (building tile or adjacent)
      let spawnPosition: Position | null = null;

      // Check building tile first
      const buildingTile = state.grid[building.position.y][building.position.x];
      if (buildingTile.unitId === null && !buildingTile.isLava) {
        spawnPosition = { ...building.position };
      } else {
        // Find nearest free adjacent tile
        const adjacent = getAdjacentPositions(building.position);
        for (const pos of adjacent) {
          const tile = state.grid[pos.y][pos.x];
          if (tile.unitId === null && !tile.isLava) {
            spawnPosition = pos;
            break;
          }
        }
      }

      // If no spawn position found, skip this spawn
      if (!spawnPosition) {
        continue;
      }

      // Create and place the unit
      const unit = createEnemyUnit(
        spawnPosition,
        unitType,
        building.lavaBoostEnabled,
        state.lavaFrontRow,
        building.position
      );

      state.units[unit.id] = unit;
      state.grid[spawnPosition.y][spawnPosition.x].unitId = unit.id;
    }
  }
}

// ============================================================================
// ENEMY AI
// ============================================================================

/**
 * Finds targets within trigger range for an enemy unit.
 * Returns arrays of player units, player buildings, and neutral buildings.
 */
function findTargetsInRange(
  state: Draft<GameState>,
  unit: Unit
): {
  playerUnits: Unit[];
  playerBuildings: Building[];
  neutralBuildings: Building[];
} {
  const triggerRange = unit.stats.triggerRange;
  const playerUnits: Unit[] = [];
  const playerBuildings: Building[] = [];
  const neutralBuildings: Building[] = [];

  // Find player units in range
  for (const otherUnit of Object.values(state.units)) {
    if (otherUnit.faction === Faction.PLAYER) {
      const inRange = isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        otherUnit.position.x, otherUnit.position.y,
        triggerRange,
      );
      if (inRange) {
        playerUnits.push(otherUnit);
      }
    }
  }

  // Find buildings in range
  for (const building of Object.values(state.buildings)) {
    const inRange = isTileWithinEdgeCircleRange(
      unit.position.x, unit.position.y,
      building.position.x, building.position.y,
      triggerRange,
    );
    if (inRange) {
      if (building.faction === Faction.PLAYER) {
        playerBuildings.push(building);
      } else if (building.faction === null) {
        neutralBuildings.push(building);
      }
    }
  }

  return { playerUnits, playerBuildings, neutralBuildings };
}

/**
 * Selects the best target for an enemy unit based on priority:
 * 1. Closest player unit
 * 2. Closest player building
 * 3. Closest neutral building
 */
function selectTarget(
  state: Draft<GameState>,
  unit: Unit
): { type: 'unit' | 'building'; target: Unit | Building; position: Position } | null {
  const { playerUnits, playerBuildings, neutralBuildings } = findTargetsInRange(
    state,
    unit
  );

  // Priority 1: Closest player unit
  if (playerUnits.length > 0) {
    playerUnits.sort(
      (a, b) =>
        manhattanDistance(unit.position, a.position) -
        manhattanDistance(unit.position, b.position)
    );
    return {
      type: 'unit',
      target: playerUnits[0],
      position: playerUnits[0].position,
    };
  }

  // Priority 2: Closest player building
  if (playerBuildings.length > 0) {
    playerBuildings.sort(
      (a, b) =>
        manhattanDistance(unit.position, a.position) -
        manhattanDistance(unit.position, b.position)
    );
    return {
      type: 'building',
      target: playerBuildings[0],
      position: playerBuildings[0].position,
    };
  }

  // Priority 3: Closest neutral building
  if (neutralBuildings.length > 0) {
    neutralBuildings.sort(
      (a, b) =>
        manhattanDistance(unit.position, a.position) -
        manhattanDistance(unit.position, b.position)
    );
    return {
      type: 'building',
      target: neutralBuildings[0],
      position: neutralBuildings[0].position,
    };
  }

  return null;
}

/**
 * Moves an enemy unit to a target position (1 step).
 */
function moveEnemyUnit(
  state: Draft<GameState>,
  unitId: string,
  targetPosition: Position
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  // Get the old and new tiles
  const oldTile = state.grid[unit.position.y][unit.position.x];
  const newTile = state.grid[targetPosition.y][targetPosition.x];

  // Update grid: remove unit from old tile
  if (oldTile.unitId === unitId) {
    oldTile.unitId = null;
  }

  // Update grid: add unit to new tile
  newTile.unitId = unitId;

  // Update unit position
  unit.position.x = targetPosition.x;
  unit.position.y = targetPosition.y;
}

/**
 * Runs AI for a single enemy unit.
 * 1. Find targets in trigger range
 * 2. If no targets: move 1 step south
 * 3. If target in range: attack if adjacent, else move toward target
 */
function runUnitAI(state: Draft<GameState>, unitId: string): void {
  const unit = state.units[unitId];

  // Unit may have been killed during other AI actions
  if (!unit || unit.hasActedThisTurn) {
    return;
  }

  const targetInfo = selectTarget(state, unit);

  if (!targetInfo) {
    // No targets in range - move 1 step southward toward player (y-1)
    const southPosition: Position = { x: unit.position.x, y: unit.position.y - 1 };

    if (isWithinBounds(southPosition)) {
      const tile = state.grid[southPosition.y][southPosition.x];
      if (!tile.isLava && tile.unitId === null) {
        moveEnemyUnit(state, unitId, southPosition);
      }
    }

    unit.hasActedThisTurn = true;
    return;
  }

  const inAttackRange = isTileWithinEdgeCircleRange(
    unit.position.x, unit.position.y,
    targetInfo.position.x, targetInfo.position.y,
    unit.stats.attackRange,
  );

  if (inAttackRange) {
    // Target is adjacent - attack if it's a unit
    if (targetInfo.type === 'unit') {
      resolveAttack(state, unitId, (targetInfo.target as Unit).id);
    }
    // Buildings can't be attacked by units directly in this system
    // (they need to be captured, which enemies don't do in MVP)
    unit.hasActedThisTurn = true;
  } else {
    // Target is not adjacent - move 1 step toward target
    const nextStep = getNextStepToward(state, unit.position, targetInfo.position);
    if (nextStep) {
      moveEnemyUnit(state, unitId, nextStep);
    }
    unit.hasActedThisTurn = true;
  }
}

/**
 * Runs AI for all enemy units.
 */
function runEnemyAI(state: Draft<GameState>): void {
  // Get all enemy unit IDs (copy to avoid mutation issues)
  const enemyUnitIds = Object.values(state.units)
    .filter((unit) => unit.faction === Faction.ENEMY)
    .map((unit) => unit.id);

  // Run AI for each enemy unit
  for (const unitId of enemyUnitIds) {
    runUnitAI(state, unitId);
  }
}

// ============================================================================
// THREAT SCALING
// ============================================================================

/**
 * Updates threat level based on turn count.
 * Threat level increases by 1 every 10 turns.
 */
export function updateThreatFromTurn(state: Draft<GameState>): void {
  // Check if we've crossed a 10-turn boundary
  if (state.turn > 0 && state.turn % 10 === 0) {
    state.threatLevel += 1;
  }
}

/**
 * Increases threat level when a stronghold is captured.
 * Called from captureSystem when a stronghold capture is resolved.
 */
export function increaseThreatOnStrongholdCapture(state: Draft<GameState>): void {
  state.threatLevel += 1;
}

// ============================================================================
// MAIN ENEMY TURN FUNCTION
// ============================================================================

/**
 * Runs the complete enemy turn.
 * 1. Spawn enemy units from enemy-owned recruitment buildings
 * 2. Run AI for all enemy units
 *
 * @param state - Immer draft of the game state (will be mutated)
 */
export function runEnemyTurn(state: Draft<GameState>): void {
  // 1. Spawn enemy units
  spawnEnemyUnits(state);

  // 2. Run AI for all enemy units
  runEnemyAI(state);

  // 3. Reset enemy unit action flags for next turn
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.ENEMY) {
      unit.hasMovedThisTurn = false;
      unit.hasActedThisTurn = false;
      unit.hasCapturedThisTurn = false;
    }
  }
}
