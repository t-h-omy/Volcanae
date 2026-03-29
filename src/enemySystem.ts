/**
 * Enemy AI system module for Volcanae.
 * Implements enemy unit spawning and scoring-based AI behavior.
 */

import type { GameState, Unit, Building, Position } from './types';
import type { Draft } from 'immer';
import { produce } from 'immer';
import { Faction, UnitType, UnitTag, BuildingType } from './types';
import { UNITS, ENEMY, MAP, AI_SCORING } from './gameConfig';
import { resolveAttack, calculateCombat, resolveBuildingAttack, buildingToCombatant, calculateCombatFromStats, unitToCombatant, resolveAttackOnBuilding } from './combatSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { initiateCapture, canCapture } from './captureSystem';
import type { GameEvent } from './gameEvents';

// ============================================================================
// ID GENERATION
// ============================================================================

let enemyIdCounter = 0;

function generateEnemyId(): string {
  return `enemy_unit_${Date.now()}_${++enemyIdCounter}`;
}

// ============================================================================
// BUILDING → UNIT TYPE MAPPING
// ============================================================================

const BUILDING_SPAWN_UNIT_TYPE: Partial<Record<BuildingType, UnitType>> = {
  [BuildingType.BARRACKS]: UnitType.LAVA_GRUNT,
  [BuildingType.ARCHER_CAMP]: UnitType.LAVA_ARCHER,
  [BuildingType.RIDER_CAMP]: UnitType.LAVA_RIDER,
  [BuildingType.SIEGE_CAMP]: UnitType.LAVA_SIEGE,
};

// ============================================================================
// AI TYPES (local to this module)
// ============================================================================

type EnemyActionType =
  | 'ATTACK_UNIT'
  | 'RANGED_ATTACK_UNIT'
  | 'ATTACK_BUILDING'
  | 'RANGED_ATTACK_BUILDING'
  | 'INTERCEPT_CAPTOR'
  | 'CAPTURE_BUILDING'
  | 'CONTEST_BUILDING'
  | 'RETAKE_BUILDING'
  | 'DEFEND_ENEMY_BUILDING'
  | 'PROTECT_SPAWNER'
  | 'PUSH_TO_STRONGHOLD'
  | 'PUSH_TO_ZONE_EDGE'
  | 'MOVE_TO_PLAYER_BUILDING'
  | 'MOVE_TO_NEUTRAL_BUILDING'
  | 'MOVE_TO_UNIT'
  | 'ADVANCE_WITH_LAVA'
  | 'FLANK_UNIT'
  | 'ADVANCE_SOUTH'
  | 'SACRIFICE_TO_LAVA'
  | 'HOLD_POSITION';

interface ScoredAction {
  type: EnemyActionType;
  score: number;
  targetUnitId?: string;
  targetBuildingId?: string;
  targetPosition?: Position;
}

export type { ScoredAction };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isWithinBounds(pos: Position): boolean {
  return pos.x >= 0 && pos.x < MAP.GRID_WIDTH && pos.y >= 0 && pos.y < MAP.GRID_HEIGHT;
}

function isRecruitmentBuilding(building: Building): boolean {
  return (
    building.type === BuildingType.BARRACKS ||
    building.type === BuildingType.ARCHER_CAMP ||
    building.type === BuildingType.RIDER_CAMP ||
    building.type === BuildingType.SIEGE_CAMP
  );
}

function calculateLavaBoostFactor(buildingPosition: Position, lavaFrontRow: number): number {
  const effectiveLavaRow = Math.max(0, lavaFrontRow);
  const distanceToLava = buildingPosition.y - effectiveLavaRow;
  return Math.max(0, 1 - distanceToLava / ENEMY.MAX_LAVA_BOOST_DISTANCE);
}

function isPlayerUnitInDiscoverRadius(state: Draft<GameState>, building: Building): boolean {
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.PLAYER) continue;
    if (isTileWithinEdgeCircleRange(building.position.x, building.position.y, unit.position.x, unit.position.y, building.discoverRadius)) {
      return true;
    }
  }
  return false;
}

function getSpawnProbability(state: Draft<GameState>, building: Building): number {
  if (isPlayerUnitInDiscoverRadius(state, building)) return 1.0;
  const threatRatio = Math.min(state.threatLevel / ENEMY.MAX_THREAT, 1);
  return ENEMY.BASE_SPAWN_PROBABILITY + ENEMY.MAX_THREAT_BONUS * threatRatio;
}

const SPAWNER_TYPES: BuildingType[] = [BuildingType.BARRACKS, BuildingType.ARCHER_CAMP, BuildingType.RIDER_CAMP, BuildingType.SIEGE_CAMP];
const RESOURCE_TYPES: BuildingType[] = [BuildingType.MINE, BuildingType.WOODCUTTER];

function buildingValueMultiplier(type: BuildingType): number {
  if (type === BuildingType.STRONGHOLD) return AI_SCORING.BUILDING_VALUE_STRONGHOLD;
  if (SPAWNER_TYPES.includes(type)) return AI_SCORING.BUILDING_VALUE_SPAWNER;
  if (RESOURCE_TYPES.includes(type)) return AI_SCORING.BUILDING_VALUE_RESOURCE;
  if (type === BuildingType.WATCHTOWER) return AI_SCORING.BUILDING_VALUE_WATCHTOWER;
  return AI_SCORING.BUILDING_VALUE_DEFAULT;
}

function saturationPenalty(targetId: string, targetingIntents: Map<string, number>): number {
  return (targetingIntents.get(targetId) ?? 0) * AI_SCORING.SATURATION_PENALTY_PER_ALLY;
}

function calcDeathRiskPenalty(attacker: Unit, attackerHpLost: number, canCounter: boolean): number {
  if (!canCounter || attackerHpLost < attacker.stats.currentHp) return 0;
  const isLowHp = attacker.stats.currentHp < attacker.stats.maxHp * AI_SCORING.LOW_HP_THRESHOLD;
  return AI_SCORING.DEATH_RISK_PENALTY * (isLowHp ? AI_SCORING.LOW_HP_RISK_FACTOR : 1);
}

function projectCombatScore(attacker: Unit, defender: Unit): number {
  const { attackerHpLost, defenderHpLost } = calculateCombat(attacker, defender);
  let bonus = 0;

  if (defenderHpLost >= defender.stats.currentHp) {
    bonus += AI_SCORING.KILL_BONUS;
  }

  const defenderCanCounter = isTileWithinEdgeCircleRange(
    defender.position.x, defender.position.y,
    attacker.position.x, attacker.position.y,
    defender.stats.attackRange,
  );

  bonus -= calcDeathRiskPenalty(attacker, attackerHpLost, defenderCanCounter);

  return bonus;
}

function projectBuildingCombatScore(attacker: Unit, building: Building): number {
  if (!building.combatStats || !building.faction) return 0;

  const attackerCombatant = unitToCombatant(attacker);
  const buildingCombatant = buildingToCombatant(building)!;
  const { attackerHpLost, defenderHpLost } = calculateCombatFromStats(attackerCombatant, buildingCombatant);

  let bonus = 0;

  // Bonus for reducing building to 0 HP (it becomes neutral)
  if (defenderHpLost >= building.hp) {
    bonus += AI_SCORING.KILL_BONUS;
  }

  // Penalty if the building can counter-attack and the attacker would die
  const buildingCanCounter = isTileWithinEdgeCircleRange(
    building.position.x, building.position.y,
    attacker.position.x, attacker.position.y,
    building.combatStats.attackRange,
  );

  bonus -= calcDeathRiskPenalty(attacker, attackerHpLost, buildingCanCounter);

  return bonus;
}

function stepToward(from: Position, target: Position, state: Draft<GameState>): Position {
  const dx = target.x - from.x;
  const dy = target.y - from.y;

  const steps: Position[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) steps.push({ x: from.x + Math.sign(dx), y: from.y });
    if (dy !== 0) steps.push({ x: from.x, y: from.y + Math.sign(dy) });
  } else {
    if (dy !== 0) steps.push({ x: from.x, y: from.y + Math.sign(dy) });
    if (dx !== 0) steps.push({ x: from.x + Math.sign(dx), y: from.y });
  }

  for (const pos of steps) {
    if (isWithinBounds(pos)) {
      const tile = state.grid[pos.y][pos.x];
      if (!tile.isLava && tile.unitId === null) {
        return pos;
      }
    }
  }

  return from;
}

function alliedUnitsNear(pos: Position, radius: number, excludeId: string, state: Draft<GameState>): number {
  let count = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.ENEMY) continue;
    if (unit.id === excludeId) continue;
    if (manhattanDistance(unit.position, pos) <= radius) {
      count++;
    }
  }
  return count;
}

// ============================================================================
// ENEMY UNIT SPAWNING
// ============================================================================

function createEnemyUnit(
  position: Position,
  unitType: UnitType,
  lavaBoostEnabled: boolean,
  lavaFrontRow: number,
  buildingPosition: Position
): Unit {
  const baseHp: number = UNITS[unitType].maxHp;
  const baseAttack: number = UNITS[unitType].attack;

  let finalHp: number = baseHp;
  let finalAttack: number = baseAttack;
  const tags: UnitTag[] = [];

  if (UNITS[unitType].attackRange > 1) {
    tags.push(UnitTag.RANGED);
  }

  if (unitType === UnitType.SIEGE || unitType === UnitType.LAVA_SIEGE) {
    tags.push(UnitTag.PREP);
  }

  if (lavaBoostEnabled) {
    const boostFactor = calculateLavaBoostFactor(buildingPosition, lavaFrontRow);
    const boostMultiplier = 1 + boostFactor * ENEMY.MAX_LAVA_BOOST_MULTIPLIER;

    finalHp = Math.round(baseHp * boostMultiplier);
    finalAttack = Math.round(baseAttack * boostMultiplier);
    tags.push(UnitTag.LAVABOOST);
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
      defense: UNITS[unitType].defense,
      moveRange: UNITS[unitType].moveRange,
      discoverRadius: UNITS[unitType].discoverRadius,
      triggerRange: UNITS[unitType].triggerRange,
      movementActions: UNITS[unitType].movementActions,
      attackRange: UNITS[unitType].attackRange,
    },
    tags,
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasCapturedThisTurn: false,
  };
}

function spawnEnemyUnits(state: Draft<GameState>, events?: GameEvent[]): void {
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (!isRecruitmentBuilding(building)) continue;

    const unitType: UnitType = BUILDING_SPAWN_UNIT_TYPE[building.type] ?? UnitType.LAVA_GRUNT;

    const spawnProbability = getSpawnProbability(state, building);
    if (Math.random() >= spawnProbability) continue;

    // Only spawn on the building's own tile; skip if occupied or lava
    const buildingTile = state.grid[building.position.y][building.position.x];
    if (buildingTile.unitId !== null || buildingTile.isLava) continue;

    const spawnPosition: Position = { ...building.position };

    const unit = createEnemyUnit(spawnPosition, unitType, building.lavaBoostEnabled, state.lavaFrontRow, building.position);

    // Snapshot the unit BEFORE assigning to the draft (plain objects added
    // to a draft are not immediately proxied, so current() cannot be used).
    const unitSnapshot: Unit = {
      ...unit,
      position: { ...unit.position },
      stats: { ...unit.stats },
      tags: [...unit.tags],
    };

    state.units[unit.id] = unit;
    state.grid[spawnPosition.y][spawnPosition.x].unitId = unit.id;

    if (events) {
      events.push({
        type: 'ENEMY_SPAWN',
        position: { ...spawnPosition },
        unit: unitSnapshot,
        buildingId: building.id,
      });
    }
  }
}

// ============================================================================
// ENEMY MOVEMENT HELPER
// ============================================================================

function moveEnemyUnit(state: Draft<GameState>, unitId: string, targetPosition: Position, events?: GameEvent[]): void {
  const unit = state.units[unitId];
  if (!unit) return;

  const from = { x: unit.position.x, y: unit.position.y };
  const oldTile = state.grid[unit.position.y][unit.position.x];
  const newTile = state.grid[targetPosition.y][targetPosition.x];

  if (oldTile.unitId === unitId) {
    oldTile.unitId = null;
  }

  newTile.unitId = unitId;

  unit.position.x = targetPosition.x;
  unit.position.y = targetPosition.y;
  unit.hasMovedThisTurn = true;

  if (events) {
    events.push({
      type: 'ENEMY_MOVE',
      unitId,
      from,
      to: { x: targetPosition.x, y: targetPosition.y },
    });
  }

  // If the destination is a lava tile, destroy the unit and increment threat
  if (newTile.isLava) {
    destroyUnit(state, unitId, events);
    state.threatLevel += 1;
  }
}

// ============================================================================
// MULTI-TILE MOVEMENT HELPER
// ============================================================================

/**
 * Moves an enemy unit up to its full moveRange toward a target position.
 * Stops early if the path is blocked or the unit is destroyed (e.g., by lava).
 */
function moveEnemyUnitToward(
  state: Draft<GameState>,
  unitId: string,
  targetPosition: Position,
  events?: GameEvent[],
): void {
  const unit = state.units[unitId];
  if (!unit) return;
  const moveRange = unit.stats.moveRange;
  for (let step = 0; step < moveRange; step++) {
    const current = state.units[unitId];
    if (!current) break; // unit was destroyed (e.g. walked into lava)
    const nextPos = stepToward(current.position, targetPosition, state);
    if (nextPos.x === current.position.x && nextPos.y === current.position.y) break; // blocked
    moveEnemyUnit(state, unitId, nextPos, events);
  }
}

// ============================================================================
// SCORING FUNCTION
// ============================================================================

function scoreActionsForUnit(
  unit: Unit,
  state: Draft<GameState>,
  targetingIntents: Map<string, number>,
  recentlyLostBuildingIds: Set<string>,
): ScoredAction[] {
  const candidates: ScoredAction[] = [];
  const triggerRange = unit.stats.triggerRange;
  const attackRange = unit.stats.attackRange;
  // PREP tag prevents attacking after moving
  const canAttackThisTurn = !unit.hasActedThisTurn && !(unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP));

  // Gather player units in trigger range
  const playerUnitsInTriggerRange: Unit[] = [];
  for (const u of Object.values(state.units)) {
    if (u.faction !== Faction.PLAYER) continue;
    if (isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, u.position.x, u.position.y, triggerRange)) {
      playerUnitsInTriggerRange.push(u);
    }
  }

  // Gather player units in attack range
  const playerUnitsInAttackRange: Unit[] = [];
  for (const u of playerUnitsInTriggerRange) {
    if (isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, u.position.x, u.position.y, attackRange)) {
      playerUnitsInAttackRange.push(u);
    }
  }

  // Gather all buildings
  const allBuildings = Object.values(state.buildings);

  // Buildings in trigger range
  const buildingsInTriggerRange: Building[] = [];
  for (const b of allBuildings) {
    if (isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, b.position.x, b.position.y, triggerRange)) {
      buildingsInTriggerRange.push(b);
    }
  }

  // ── INTERCEPT_CAPTOR ──
  {
    const captors = playerUnitsInTriggerRange.filter(u => u.hasCapturedThisTurn);
    if (canAttackThisTurn && captors.length > 0) {
      captors.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const target = captors[0];
      const distance = manhattanDistance(unit.position, target.position);
      const score = AI_SCORING.BASE_INTERCEPT_CAPTOR
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, target)
        + AI_SCORING.BONUS_PLAYER_CAPTURING
        - saturationPenalty(target.id, targetingIntents);
      candidates.push({ type: 'INTERCEPT_CAPTOR', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
    }
  }

  // ── CAPTURE_BUILDING ──
  if (!unit.hasActedThisTurn) {
    const tile = state.grid[unit.position.y][unit.position.x];
    if (tile.buildingId) {
      const building = state.buildings[tile.buildingId];
      // Exclude buildings that consume the capturing unit (e.g. watchtowers) — they must be attacked/destroyed instead
      if (building && building.faction !== Faction.ENEMY && !building.consumesUnitOnCapture) {
        const score = AI_SCORING.BASE_CAPTURE_BUILDING
          * buildingValueMultiplier(building.type)
          - saturationPenalty(building.id, targetingIntents);
        candidates.push({ type: 'CAPTURE_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── CONTEST_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const contestable = buildingsInTriggerRange.filter(b => {
      if (b.faction === Faction.PLAYER) return false;
      const bTile = state.grid[b.position.y][b.position.x];
      if (bTile.unitId) {
        const tileUnit = state.units[bTile.unitId];
        if (tileUnit && tileUnit.faction === Faction.PLAYER) return true;
      }
      if (b.isBeingCapturedBy) {
        const capturingUnit = state.units[b.isBeingCapturedBy];
        if (capturingUnit && capturingUnit.faction === Faction.PLAYER) return true;
      }
      return false;
    });

    if (contestable.length > 0) {
      contestable.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = contestable[0];
      const distance = manhattanDistance(unit.position, building.position);
      const score = AI_SCORING.BASE_CONTEST_BUILDING
        * buildingValueMultiplier(building.type)
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + AI_SCORING.BONUS_PLAYER_ON_BUILDING
        + (building.isBeingCapturedBy ? AI_SCORING.BONUS_PLAYER_CAPTURING : 0)
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'CONTEST_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── RETAKE_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const retakeable = allBuildings.filter(b => recentlyLostBuildingIds.has(b.id));
    if (retakeable.length > 0) {
      retakeable.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = retakeable[0];
      const distance = manhattanDistance(unit.position, building.position);
      const score = AI_SCORING.BASE_RETAKE_BUILDING
        * buildingValueMultiplier(building.type)
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + AI_SCORING.BONUS_RECENT_LOSS
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'RETAKE_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── ATTACK_UNIT ──
  if (canAttackThisTurn && playerUnitsInAttackRange.length > 0) {
    let bestTarget: Unit | null = null;
    let bestCombatScore = -Infinity;
    for (const target of playerUnitsInAttackRange) {
      const cs = projectCombatScore(unit, target);
      if (cs > bestCombatScore) {
        bestCombatScore = cs;
        bestTarget = target;
      }
    }
    if (bestTarget) {
      const distance = manhattanDistance(unit.position, bestTarget.position);
      const score = AI_SCORING.BASE_ATTACK_UNIT
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, bestTarget)
        - saturationPenalty(bestTarget.id, targetingIntents);
      candidates.push({ type: 'ATTACK_UNIT', score: Math.max(0, score), targetUnitId: bestTarget.id, targetPosition: bestTarget.position });
    }
  }

  // ── RANGED_ATTACK_UNIT ──
  if (canAttackThisTurn && unit.tags.includes(UnitTag.RANGED)) {
    const rangedTargets = playerUnitsInAttackRange.filter(u => manhattanDistance(unit.position, u.position) > 1);
    if (rangedTargets.length > 0) {
      rangedTargets.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const target = rangedTargets[0];
      const distance = manhattanDistance(unit.position, target.position);
      const score = AI_SCORING.BASE_RANGED_ATTACK_UNIT
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, target)
        + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
        - saturationPenalty(target.id, targetingIntents);
      candidates.push({ type: 'RANGED_ATTACK_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
    }
  }

  // ── ATTACK_BUILDING ── (attack player-owned buildings with combat stats, e.g. watchtowers)
  if (canAttackThisTurn) {
    const buildingsInAttackRange = allBuildings.filter(b => {
      if (b.faction !== Faction.PLAYER) return false;
      if (!b.combatStats) return false;
      return isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        b.position.x, b.position.y,
        attackRange,
      );
    });

    if (buildingsInAttackRange.length > 0) {
      let bestBuilding: Building | null = null;
      let bestBuildingScore = -Infinity;
      for (const target of buildingsInAttackRange) {
        const cs = projectBuildingCombatScore(unit, target);
        if (cs > bestBuildingScore) {
          bestBuildingScore = cs;
          bestBuilding = target;
        }
      }
      if (bestBuilding) {
        const distance = manhattanDistance(unit.position, bestBuilding.position);
        const score = AI_SCORING.BASE_ATTACK_BUILDING
          - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
          + projectBuildingCombatScore(unit, bestBuilding)
          - saturationPenalty(bestBuilding.id, targetingIntents);
        candidates.push({ type: 'ATTACK_BUILDING', score: Math.max(0, score), targetBuildingId: bestBuilding.id, targetPosition: bestBuilding.position });
      }
    }
  }

  // ── RANGED_ATTACK_BUILDING ── (ranged units attack buildings from safe distance)
  if (canAttackThisTurn && unit.tags.includes(UnitTag.RANGED)) {
    const rangedBuildingTargets = allBuildings.filter(b => {
      if (b.faction !== Faction.PLAYER) return false;
      if (!b.combatStats) return false;
      if (!isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, b.position.x, b.position.y, attackRange)) return false;
      // Must be at a safe distance (not adjacent) to benefit from the safe-attack bonus
      return manhattanDistance(unit.position, b.position) > 1;
    });

    if (rangedBuildingTargets.length > 0) {
      rangedBuildingTargets.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const target = rangedBuildingTargets[0];
      const distance = manhattanDistance(unit.position, target.position);
      const score = AI_SCORING.BASE_RANGED_ATTACK_BUILDING
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectBuildingCombatScore(unit, target)
        + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
        - saturationPenalty(target.id, targetingIntents);
      candidates.push({ type: 'RANGED_ATTACK_BUILDING', score: Math.max(0, score), targetBuildingId: target.id, targetPosition: target.position });
    }
  }

  // ── DEFEND_ENEMY_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const defendable = buildingsInTriggerRange.filter(b => {
      if (b.faction !== Faction.ENEMY) return false;
      if (isRecruitmentBuilding(b)) return false;
      for (const u of Object.values(state.units)) {
        if (u.faction !== Faction.PLAYER) continue;
        if (manhattanDistance(u.position, b.position) <= 3) return true;
      }
      return false;
    });

    if (defendable.length > 0) {
      defendable.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = defendable[0];
      const distance = manhattanDistance(unit.position, building.position);
      const isUndefended = alliedUnitsNear(building.position, 3, unit.id, state) === 0;
      const score = AI_SCORING.BASE_DEFEND_ENEMY_BUILDING
        * buildingValueMultiplier(building.type)
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + (isUndefended ? AI_SCORING.BONUS_UNDEFENDED_BUILDING : 0)
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'DEFEND_ENEMY_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── PROTECT_SPAWNER ──
  if (!unit.hasMovedThisTurn) {
    const spawners = buildingsInTriggerRange.filter(b => {
      if (b.faction !== Faction.ENEMY) return false;
      if (!isRecruitmentBuilding(b)) return false;
      for (const u of Object.values(state.units)) {
        if (u.faction !== Faction.PLAYER) continue;
        if (manhattanDistance(u.position, b.position) <= 5) return true;
      }
      return false;
    });

    if (spawners.length > 0) {
      spawners.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = spawners[0];
      const distance = manhattanDistance(unit.position, building.position);
      const isUndefended = alliedUnitsNear(building.position, 3, unit.id, state) === 0;
      const score = AI_SCORING.BASE_PROTECT_SPAWNER
        * AI_SCORING.BUILDING_VALUE_SPAWNER
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + (isUndefended ? AI_SCORING.BONUS_UNDEFENDED_BUILDING : 0)
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'PROTECT_SPAWNER', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── PUSH_TO_STRONGHOLD ──
  if (!unit.hasMovedThisTurn) {
    const playerStrongholds = allBuildings.filter(b => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER);
    if (playerStrongholds.length > 0) {
      playerStrongholds.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = playerStrongholds[0];
      const distance = manhattanDistance(unit.position, building.position);
      const score = AI_SCORING.BASE_PUSH_TO_STRONGHOLD
        * AI_SCORING.BUILDING_VALUE_STRONGHOLD
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'PUSH_TO_STRONGHOLD', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── MOVE_TO_PLAYER_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const playerBuildings = buildingsInTriggerRange.filter(b => b.faction === Faction.PLAYER && b.type !== BuildingType.STRONGHOLD);
    if (playerBuildings.length > 0) {
      playerBuildings.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = playerBuildings[0];
      const distance = manhattanDistance(unit.position, building.position);
      const score = AI_SCORING.BASE_MOVE_TO_PLAYER_BUILDING
        * buildingValueMultiplier(building.type)
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'MOVE_TO_PLAYER_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── MOVE_TO_NEUTRAL_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const neutralBuildings = buildingsInTriggerRange.filter(b => b.faction === null);
    if (neutralBuildings.length > 0) {
      neutralBuildings.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const building = neutralBuildings[0];
      const distance = manhattanDistance(unit.position, building.position);
      const score = AI_SCORING.BASE_MOVE_TO_NEUTRAL_BUILDING
        * buildingValueMultiplier(building.type)
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        - saturationPenalty(building.id, targetingIntents);
      candidates.push({ type: 'MOVE_TO_NEUTRAL_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
    }
  }

  // ── MOVE_TO_UNIT ──
  if (!unit.hasMovedThisTurn) {
    const outOfAttackRange = playerUnitsInTriggerRange.filter(u => !playerUnitsInAttackRange.includes(u));
    if (outOfAttackRange.length > 0) {
      outOfAttackRange.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const target = outOfAttackRange[0];
      const distance = manhattanDistance(unit.position, target.position);
      const { defenderHpLost } = calculateCombat(unit, target);
      const nextTurnKillBonus = defenderHpLost >= target.stats.currentHp ? AI_SCORING.KILL_BONUS * 0.5 : 0;
      const score = AI_SCORING.BASE_MOVE_TO_UNIT
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + nextTurnKillBonus
        - saturationPenalty(target.id, targetingIntents);
      candidates.push({ type: 'MOVE_TO_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
    }
  }

  // ── ADVANCE_WITH_LAVA ──
  if (!unit.hasMovedThisTurn && unit.tags.includes(UnitTag.LAVABOOST)) {
    const lavaDistance = unit.position.y - state.lavaFrontRow;
    const boostFactor = Math.max(0, 1 - lavaDistance / ENEMY.MAX_LAVA_BOOST_DISTANCE);
    const score = AI_SCORING.BASE_ADVANCE_WITH_LAVA
      + boostFactor * AI_SCORING.BONUS_LAVA_BOOST_AGGRESSION;
    candidates.push({ type: 'ADVANCE_WITH_LAVA', score: Math.max(0, score) });
  }

  // ── PUSH_TO_ZONE_EDGE ──
  if (!unit.hasMovedThisTurn) {
    const hasPlayerTargets = playerUnitsInTriggerRange.length > 0;
    const hasCapturable = buildingsInTriggerRange.some(b => b.faction === null || b.faction === Faction.PLAYER);
    if (!hasPlayerTargets && !hasCapturable) {
      candidates.push({ type: 'PUSH_TO_ZONE_EDGE', score: AI_SCORING.BASE_PUSH_TO_ZONE_EDGE });
    }
  }

  // ── FLANK_UNIT ──
  if (!unit.hasMovedThisTurn) {
    for (const target of playerUnitsInTriggerRange) {
      const alreadyTargeted = (targetingIntents.get(target.id) ?? 0) >= 1;
      if (!alreadyTargeted) continue;

      const dx = Math.abs(target.position.x - unit.position.x);
      const dy = Math.abs(target.position.y - unit.position.y);
      if (dx >= 2 || dy >= 2) {
        const distance = manhattanDistance(unit.position, target.position);
        const score = AI_SCORING.BASE_FLANK_UNIT
          - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
        candidates.push({ type: 'FLANK_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
        break;
      }
    }
  }

  // ── ADVANCE_SOUTH ──
  if (!unit.hasMovedThisTurn) {
    candidates.push({ type: 'ADVANCE_SOUTH', score: AI_SCORING.BASE_ADVANCE_SOUTH });
  }

  // ── SACRIFICE_TO_LAVA ──
  if (!unit.hasMovedThisTurn) {
    const hasPlayerTargets = playerUnitsInTriggerRange.length > 0;
    const hasCapturable = buildingsInTriggerRange.some(b => b.faction === null || b.faction === Faction.PLAYER);
    const nearLava = unit.position.y - state.lavaFrontRow <= 5;

    if (!hasPlayerTargets && !hasCapturable && nearLava) {
      const threatDeficit = Math.max(0, 5 - state.threatLevel);
      const score = AI_SCORING.BASE_SACRIFICE_TO_LAVA
        + threatDeficit * AI_SCORING.BONUS_SACRIFICE_PER_THREAT_BELOW_5;
      candidates.push({ type: 'SACRIFICE_TO_LAVA', score: Math.max(0, score) });
    }
  }

  // ── HOLD_POSITION ──
  candidates.push({ type: 'HOLD_POSITION', score: AI_SCORING.BASE_HOLD_POSITION });

  return candidates;
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

function destroyUnit(state: Draft<GameState>, unitId: string, events?: GameEvent[]): void {
  const unit = state.units[unitId];
  if (!unit) return;
  if (events) {
    events.push({
      type: 'UNIT_DEATH',
      unitId,
      position: { x: unit.position.x, y: unit.position.y },
      faction: unit.faction,
    });
  }
  const tile = state.grid[unit.position.y][unit.position.x];
  if (tile.unitId === unitId) {
    tile.unitId = null;
  }
  delete state.units[unitId];
}

function executeAction(unit: Unit, action: ScoredAction, state: Draft<GameState>, events?: GameEvent[]): void {
  const currentUnit = state.units[unit.id];
  if (!currentUnit) return;

  const suppressFloaters = !!events;

  switch (action.type) {
    case 'ATTACK_UNIT':
    case 'INTERCEPT_CAPTOR': {
      if (action.targetUnitId && state.units[action.targetUnitId]) {
        const targetUnit = state.units[action.targetUnitId];
        const inAttackRange = isTileWithinEdgeCircleRange(
          currentUnit.position.x, currentUnit.position.y,
          targetUnit.position.x, targetUnit.position.y,
          currentUnit.stats.attackRange,
        );
        if (inAttackRange) {
          const attackerPos = { x: currentUnit.position.x, y: currentUnit.position.y };
          const defenderPos = { x: targetUnit.position.x, y: targetUnit.position.y };
          const attackerHpBefore = currentUnit.stats.currentHp;
          const defenderHpBefore = targetUnit.stats.currentHp;
          const attackerId = currentUnit.id;
          const defenderId = action.targetUnitId;

          resolveAttack(state, attackerId, defenderId, suppressFloaters);

          if (events) {
            const attackerAfter = state.units[attackerId];
            const defenderAfter = state.units[defenderId];
            const advancedToPosition = (
              !defenderAfter &&
              attackerAfter &&
              (attackerAfter.position.x !== attackerPos.x || attackerAfter.position.y !== attackerPos.y)
            ) ? { x: attackerAfter.position.x, y: attackerAfter.position.y } : null;
            events.push({
              type: 'ENEMY_ATTACK',
              attackerId,
              defenderId,
              attackerPosition: attackerPos,
              defenderPosition: defenderPos,
              attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
              defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
              advancedToPosition,
            });
            if (!defenderAfter) {
              events.push({ type: 'UNIT_DEATH', unitId: defenderId, position: defenderPos, faction: targetUnit.faction });
            }
            if (!attackerAfter) {
              events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
            }
          }
        } else if (!currentUnit.hasMovedThisTurn) {
          moveEnemyUnitToward(state, currentUnit.id, targetUnit.position, events);
        }
      }
      break;
    }

    case 'RANGED_ATTACK_UNIT': {
      if (action.targetUnitId && state.units[action.targetUnitId]) {
        const targetUnit = state.units[action.targetUnitId];
        const attackerPos = { x: currentUnit.position.x, y: currentUnit.position.y };
        const defenderPos = { x: targetUnit.position.x, y: targetUnit.position.y };
        const attackerHpBefore = currentUnit.stats.currentHp;
        const defenderHpBefore = targetUnit.stats.currentHp;
        const attackerId = currentUnit.id;
        const defenderId = action.targetUnitId;

        resolveAttack(state, attackerId, defenderId, suppressFloaters);

        if (events) {
          const attackerAfter = state.units[attackerId];
          const defenderAfter = state.units[defenderId];
          events.push({
            type: 'ENEMY_ATTACK',
            attackerId,
            defenderId,
            attackerPosition: attackerPos,
            defenderPosition: defenderPos,
            attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
            defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
            advancedToPosition: null,
          });
          if (!defenderAfter) {
            events.push({ type: 'UNIT_DEATH', unitId: defenderId, position: defenderPos, faction: targetUnit.faction });
          }
          if (!attackerAfter) {
            events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
          }
        }
      }
      break;
    }

    case 'ATTACK_BUILDING':
    case 'RANGED_ATTACK_BUILDING': {
      if (action.targetBuildingId) {
        const building = state.buildings[action.targetBuildingId];
        if (building) {
          const inAttackRange = isTileWithinEdgeCircleRange(
            currentUnit.position.x, currentUnit.position.y,
            building.position.x, building.position.y,
            currentUnit.stats.attackRange,
          );
          if (inAttackRange) {
            const attackerPos = { x: currentUnit.position.x, y: currentUnit.position.y };
            const buildingPos = { x: building.position.x, y: building.position.y };
            const attackerHpBefore = currentUnit.stats.currentHp;
            const buildingHpBefore = building.hp;
            const attackerId = currentUnit.id;
            const buildingId = action.targetBuildingId;

            resolveAttackOnBuilding(state, attackerId, buildingId, suppressFloaters);

            if (events) {
              const attackerAfter = state.units[attackerId];
              const buildingAfter = state.buildings[buildingId];
              events.push({
                type: 'UNIT_ATTACK_BUILDING',
                attackerId,
                buildingId,
                attackerPosition: attackerPos,
                buildingPosition: buildingPos,
                attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
                buildingHpLost: buildingAfter ? buildingHpBefore - buildingAfter.hp : buildingHpBefore,
              });
              if (!attackerAfter) {
                events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
              }
            }
          } else if (!currentUnit.hasMovedThisTurn) {
            moveEnemyUnitToward(state, currentUnit.id, building.position, events);
          }
        }
      }
      break;
    }

    case 'CAPTURE_BUILDING': {
      if (action.targetBuildingId) {
        if (canCapture(state, currentUnit.id, action.targetBuildingId)) {
          const building = state.buildings[action.targetBuildingId];
          initiateCapture(state, currentUnit.id, action.targetBuildingId);
          if (events && building) {
            events.push({
              type: 'BUILDING_CAPTURE',
              buildingId: action.targetBuildingId,
              position: { x: building.position.x, y: building.position.y },
              newFaction: currentUnit.faction,
              buildingType: building.type,
            });
          }
        }
      }
      break;
    }

    case 'CONTEST_BUILDING':
    case 'RETAKE_BUILDING':
    case 'DEFEND_ENEMY_BUILDING':
    case 'PROTECT_SPAWNER':
    case 'PUSH_TO_STRONGHOLD':
    case 'MOVE_TO_PLAYER_BUILDING':
    case 'MOVE_TO_NEUTRAL_BUILDING': {
      if (action.targetPosition) {
        moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events);
      }
      break;
    }

    case 'MOVE_TO_UNIT':
    case 'FLANK_UNIT': {
      if (action.targetPosition) {
        moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events);
      }
      break;
    }

    case 'ADVANCE_WITH_LAVA':
    case 'ADVANCE_SOUTH': {
      const southTarget: Position = {
        x: currentUnit.position.x,
        y: Math.max(0, currentUnit.position.y - currentUnit.stats.moveRange),
      };
      moveEnemyUnitToward(state, currentUnit.id, southTarget, events);
      break;
    }

    case 'SACRIFICE_TO_LAVA': {
      destroyUnit(state, currentUnit.id, events);
      state.threatLevel += 1;
      return;
    }

    case 'PUSH_TO_ZONE_EDGE': {
      const playerBuildings = Object.values(state.buildings).filter(b => b.faction === Faction.PLAYER);
      let targetY = Math.max(0, currentUnit.position.y - currentUnit.stats.moveRange);
      if (playerBuildings.length > 0) {
        targetY = Math.max(0, Math.min(...playerBuildings.map(b => b.position.y)));
      }
      const targetPos: Position = { x: currentUnit.position.x, y: targetY };
      moveEnemyUnitToward(state, currentUnit.id, targetPos, events);
      break;
    }

    case 'HOLD_POSITION':
      break;
  }
}

// ============================================================================
// DECISION LOOP
// ============================================================================

function decideAndExecute(
  unit: Unit,
  state: Draft<GameState>,
  targetingIntents: Map<string, number>,
  recentlyLostBuildingIds: Set<string>,
  events?: GameEvent[],
): void {
  const candidates = scoreActionsForUnit(unit, state, targetingIntents, recentlyLostBuildingIds);

  candidates.sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  if (!chosen) return;

  // Register intent for saturation tracking
  const intentKey = chosen.targetUnitId ?? chosen.targetBuildingId ?? null;
  if (intentKey) {
    targetingIntents.set(intentKey, (targetingIntents.get(intentKey) ?? 0) + 1);
  }

  executeAction(unit, chosen, state, events);
}

// ============================================================================
// THREAT SCALING
// ============================================================================

export function updateThreatFromTurn(state: Draft<GameState>): void {
  if (state.turn > 0 && state.turn % 10 === 0) {
    state.threatLevel += 1;
  }
}

export function increaseThreatOnStrongholdCapture(state: Draft<GameState>): void {
  state.threatLevel += 1;
}

// ============================================================================
// ENEMY BUILDING ATTACKS
// ============================================================================

/**
 * Enemy-owned buildings with combat stats (e.g. watchtowers) attack
 * the best player unit within their attack range.
 * Picks the target that would take the most damage (highest kill potential).
 */
function executeBuildingAttacks(state: Draft<GameState>, events?: GameEvent[]): void {
  const suppressFloaters = !!events;

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (!building.combatStats) continue;
    if (building.hasActedThisTurn) continue;

    const attackRange = building.combatStats.attackRange;
    const bCombatant = buildingToCombatant(building);
    if (!bCombatant) continue;

    // Find best player unit target in range
    let bestTarget: { id: string; score: number } | null = null;

    for (const unit of Object.values(state.units)) {
      if (unit.faction !== Faction.PLAYER) continue;
      if (!isTileWithinEdgeCircleRange(
        building.position.x, building.position.y,
        unit.position.x, unit.position.y,
        attackRange,
      )) continue;

      const dCombatant = unitToCombatant(unit);
      const { defenderHpLost } = calculateCombatFromStats(bCombatant, dCombatant);
      const killBonus = defenderHpLost >= unit.stats.currentHp ? 100 : 0;
      const score = defenderHpLost + killBonus;

      if (!bestTarget || score > bestTarget.score) {
        bestTarget = { id: unit.id, score };
      }
    }

    if (!bestTarget) continue;

    const targetUnit = state.units[bestTarget.id];
    if (!targetUnit) continue;

    const buildingPos = { x: building.position.x, y: building.position.y };
    const defenderPos = { x: targetUnit.position.x, y: targetUnit.position.y };
    const buildingHpBefore = building.hp;
    const defenderHpBefore = targetUnit.stats.currentHp;
    const defenderId = bestTarget.id;

    resolveBuildingAttack(state, building.id, defenderId, suppressFloaters);

    // Mark building wasAttackedLastEnemyTurn for player UI feedback on their buildings
    // (this flag is used for buildings attacked BY enemy, not for buildings that attack)

    if (events) {
      const buildingAfter = state.buildings[building.id];
      const defenderAfter = state.units[defenderId];

      events.push({
        type: 'BUILDING_ATTACK',
        buildingId: building.id,
        defenderId,
        buildingPosition: buildingPos,
        defenderPosition: defenderPos,
        buildingHpLost: buildingAfter ? buildingHpBefore - buildingAfter.hp : buildingHpBefore,
        defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
      });

      if (!defenderAfter) {
        events.push({
          type: 'UNIT_DEATH',
          unitId: defenderId,
          position: defenderPos,
          faction: targetUnit.faction,
        });
      }
    }
  }
}

// ============================================================================
// MAIN ENEMY TURN FUNCTION
// ============================================================================

export function runEnemyTurn(state: GameState): { finalState: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const finalState = produce(state, (draft) => {
    // 1. Build recentlyLostBuildingIds
    const recentlyLostBuildingIds = new Set<string>(
      Object.values(draft.buildings)
        .filter(b =>
          b.faction === Faction.PLAYER &&
          b.wasEnemyOwnedBeforeCapture === true &&
          b.turnCapturedByPlayer !== null &&
          draft.turn - b.turnCapturedByPlayer <= AI_SCORING.RECENTLY_LOST_WINDOW_TURNS
        )
        .map(b => b.id)
    );

    // 2. Spawn enemy units
    spawnEnemyUnits(draft, events);

    // 2b. Enemy-owned attacking buildings (e.g. watchtowers) fire at player units in range
    executeBuildingAttacks(draft, events);

    // 3. Process each enemy unit
    const targetingIntents = new Map<string, number>();
    const enemyUnits = Object.values(draft.units).filter(u => u.faction === Faction.ENEMY);

    for (const unit of enemyUnits) {
      if (!draft.units[unit.id]) continue;
      // Allow each enemy unit to act up to 2 times per turn (1 move + 1 attack/capture),
      // matching player units that can move then attack/capture.
      const maxActions = 2;
      for (let i = 0; i < maxActions; i++) {
        const currentUnit = draft.units[unit.id];
        if (!currentUnit) break;
        if (currentUnit.hasMovedThisTurn && currentUnit.hasActedThisTurn) break;
        decideAndExecute(currentUnit, draft, targetingIntents, recentlyLostBuildingIds, events);
      }
    }

    // 4. Reset enemy unit action flags for next turn
    for (const unit of Object.values(draft.units)) {
      if (unit.faction === Faction.ENEMY) {
        unit.hasMovedThisTurn = false;
        unit.hasActedThisTurn = false;
        unit.hasCapturedThisTurn = false;
      }
    }

    // Reset enemy building action flags for next turn
    for (const building of Object.values(draft.buildings)) {
      if (building.faction === Faction.ENEMY && building.combatStats) {
        building.hasActedThisTurn = false;
      }
    }
  });
  return { finalState, events };
}

// ============================================================================
// DEBUG / DEV: AI SCORE INSPECTION
// ============================================================================

/**
 * Computes and returns all scored actions for an enemy unit, sorted by score
 * descending. Intended for dev/debug use only (AI Score inspector).
 */
export function computeUnitAiScores(state: GameState, unitId: string): ScoredAction[] {
  const unit = state.units[unitId];
  if (!unit || unit.faction !== Faction.ENEMY) return [];

  const recentlyLostBuildingIds = new Set<string>(
    Object.values(state.buildings)
      .filter(
        (b) =>
          b.faction === Faction.PLAYER &&
          b.wasEnemyOwnedBeforeCapture === true &&
          b.turnCapturedByPlayer !== null &&
          state.turn - b.turnCapturedByPlayer <= AI_SCORING.RECENTLY_LOST_WINDOW_TURNS,
      )
      .map((b) => b.id),
  );

  const targetingIntents = new Map<string, number>();
  const scores = scoreActionsForUnit(
    unit,
    state as Draft<GameState>,
    targetingIntents,
    recentlyLostBuildingIds,
  );
  return scores.sort((a, b) => b.score - a.score);
}
