/**
 * Enemy AI system module for Volcanae.
 * Implements enemy unit spawning and scoring-based AI behavior.
 */

import type { GameState, Unit, Building, Position } from './types';
import type { Draft } from 'immer';
import { Faction, UnitType, UnitTag, BuildingType } from './types';
import { UNITS, ENEMY, MAP, AI_SCORING } from './gameConfig';
import { resolveAttack, calculateCombat } from './combatSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { initiateCapture, canCapture } from './captureSystem';

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

function getSpawnCount(threatLevel: number): number {
  return ENEMY.ENEMY_SPAWN_PER_BUILDING_BASE + Math.floor(threatLevel / 3) * ENEMY.ENEMY_THREAT_SPAWN_BONUS;
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

function getAdjacentPositions(pos: Position): Position[] {
  return [
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x - 1, y: pos.y },
  ].filter(isWithinBounds);
}

const SPAWNER_TYPES: BuildingType[] = [BuildingType.BARRACKS, BuildingType.ARCHER_CAMP, BuildingType.RIDER_CAMP, BuildingType.SIEGE_CAMP];
const RESOURCE_TYPES: BuildingType[] = [BuildingType.MINE, BuildingType.WOODCUTTER];

function buildingValueMultiplier(type: BuildingType): number {
  if (type === BuildingType.STRONGHOLD) return AI_SCORING.BUILDING_VALUE_STRONGHOLD;
  if (SPAWNER_TYPES.includes(type)) return AI_SCORING.BUILDING_VALUE_SPAWNER;
  if (RESOURCE_TYPES.includes(type)) return AI_SCORING.BUILDING_VALUE_RESOURCE;
  return AI_SCORING.BUILDING_VALUE_DEFAULT;
}

function saturationPenalty(targetId: string, targetingIntents: Map<string, number>): number {
  return (targetingIntents.get(targetId) ?? 0) * AI_SCORING.SATURATION_PENALTY_PER_ALLY;
}

function projectCombatScore(attacker: Unit, defender: Unit, isRanged: boolean): number {
  const { attackerHpLost, defenderHpLost } = calculateCombat(attacker, defender);
  let bonus = 0;

  if (defenderHpLost >= defender.stats.currentHp) {
    bonus += AI_SCORING.KILL_BONUS;
  }

  if (!isRanged && attackerHpLost >= attacker.stats.currentHp) {
    const isLowHp = attacker.stats.currentHp < attacker.stats.maxHp * AI_SCORING.LOW_HP_THRESHOLD;
    bonus -= AI_SCORING.DEATH_RISK_PENALTY * (isLowHp ? AI_SCORING.LOW_HP_RISK_FACTOR : 1);
  }

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

function spawnEnemyUnits(state: Draft<GameState>): void {
  const spawnCount = getSpawnCount(state.threatLevel);

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (!isRecruitmentBuilding(building)) continue;

    const unitType: UnitType = BUILDING_SPAWN_UNIT_TYPE[building.type] ?? UnitType.LAVA_GRUNT;

    const spawnProbability = getSpawnProbability(state, building);
    if (Math.random() >= spawnProbability) continue;

    for (let i = 0; i < spawnCount; i++) {
      let spawnPosition: Position | null = null;

      const buildingTile = state.grid[building.position.y][building.position.x];
      if (buildingTile.unitId === null && !buildingTile.isLava) {
        spawnPosition = { ...building.position };
      } else {
        const adjacent = getAdjacentPositions(building.position);
        for (const pos of adjacent) {
          const tile = state.grid[pos.y][pos.x];
          if (tile.unitId === null && !tile.isLava) {
            spawnPosition = pos;
            break;
          }
        }
      }

      if (!spawnPosition) continue;

      const unit = createEnemyUnit(spawnPosition, unitType, building.lavaBoostEnabled, state.lavaFrontRow, building.position);
      state.units[unit.id] = unit;
      state.grid[spawnPosition.y][spawnPosition.x].unitId = unit.id;
    }
  }
}

// ============================================================================
// ENEMY MOVEMENT HELPER
// ============================================================================

function moveEnemyUnit(state: Draft<GameState>, unitId: string, targetPosition: Position): void {
  const unit = state.units[unitId];
  if (!unit) return;

  const oldTile = state.grid[unit.position.y][unit.position.x];
  const newTile = state.grid[targetPosition.y][targetPosition.x];

  if (oldTile.unitId === unitId) {
    oldTile.unitId = null;
  }

  newTile.unitId = unitId;

  unit.position.x = targetPosition.x;
  unit.position.y = targetPosition.y;
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
    if (captors.length > 0) {
      captors.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const target = captors[0];
      const distance = manhattanDistance(unit.position, target.position);
      const score = AI_SCORING.BASE_INTERCEPT_CAPTOR
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, target, false)
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
      if (building && building.faction !== Faction.ENEMY) {
        const score = AI_SCORING.BASE_CAPTURE_BUILDING
          * buildingValueMultiplier(building.type)
          - saturationPenalty(building.id, targetingIntents);
        candidates.push({ type: 'CAPTURE_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── CONTEST_BUILDING ──
  {
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
  {
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
  if (!unit.hasActedThisTurn && playerUnitsInAttackRange.length > 0) {
    let bestTarget: Unit | null = null;
    let bestCombatScore = -Infinity;
    for (const target of playerUnitsInAttackRange) {
      const cs = projectCombatScore(unit, target, false);
      if (cs > bestCombatScore) {
        bestCombatScore = cs;
        bestTarget = target;
      }
    }
    if (bestTarget) {
      const distance = manhattanDistance(unit.position, bestTarget.position);
      const score = AI_SCORING.BASE_ATTACK_UNIT
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, bestTarget, false)
        - saturationPenalty(bestTarget.id, targetingIntents);
      candidates.push({ type: 'ATTACK_UNIT', score: Math.max(0, score), targetUnitId: bestTarget.id, targetPosition: bestTarget.position });
    }
  }

  // ── RANGED_ATTACK_UNIT ──
  if (!unit.hasActedThisTurn && unit.tags.includes(UnitTag.RANGED)) {
    const rangedTargets = playerUnitsInAttackRange.filter(u => manhattanDistance(unit.position, u.position) > 1);
    if (rangedTargets.length > 0) {
      rangedTargets.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
      const target = rangedTargets[0];
      const distance = manhattanDistance(unit.position, target.position);
      const score = AI_SCORING.BASE_RANGED_ATTACK_UNIT
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, target, true)
        + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
        - saturationPenalty(target.id, targetingIntents);
      candidates.push({ type: 'RANGED_ATTACK_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
    }
  }

  // ── DEFEND_ENEMY_BUILDING ──
  {
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
  {
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
  {
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
  {
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
  {
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
  {
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
  if (unit.tags.includes(UnitTag.LAVA_BOOST)) {
    const lavaDistance = unit.position.y - state.lavaFrontRow;
    const boostFactor = Math.max(0, 1 - lavaDistance / ENEMY.MAX_LAVA_BOOST_DISTANCE);
    const score = AI_SCORING.BASE_ADVANCE_WITH_LAVA
      + boostFactor * AI_SCORING.BONUS_LAVA_BOOST_AGGRESSION;
    candidates.push({ type: 'ADVANCE_WITH_LAVA', score: Math.max(0, score) });
  }

  // ── PUSH_TO_ZONE_EDGE ──
  {
    const hasPlayerTargets = playerUnitsInTriggerRange.length > 0;
    const hasCapturable = buildingsInTriggerRange.some(b => b.faction === null || b.faction === Faction.PLAYER);
    if (!hasPlayerTargets && !hasCapturable) {
      candidates.push({ type: 'PUSH_TO_ZONE_EDGE', score: AI_SCORING.BASE_PUSH_TO_ZONE_EDGE });
    }
  }

  // ── FLANK_UNIT ──
  {
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
  candidates.push({ type: 'ADVANCE_SOUTH', score: AI_SCORING.BASE_ADVANCE_SOUTH });

  // ── SACRIFICE_TO_LAVA ──
  {
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

function destroyUnit(state: Draft<GameState>, unitId: string): void {
  const unit = state.units[unitId];
  if (!unit) return;
  const tile = state.grid[unit.position.y][unit.position.x];
  if (tile.unitId === unitId) {
    tile.unitId = null;
  }
  delete state.units[unitId];
}

function executeAction(unit: Unit, action: ScoredAction, state: Draft<GameState>): void {
  const currentUnit = state.units[unit.id];
  if (!currentUnit) return;

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
          resolveAttack(state, currentUnit.id, action.targetUnitId);
        } else {
          const nextPos = stepToward(currentUnit.position, targetUnit.position, state);
          if (nextPos.x !== currentUnit.position.x || nextPos.y !== currentUnit.position.y) {
            moveEnemyUnit(state, currentUnit.id, nextPos);
          }
        }
      }
      break;
    }

    case 'RANGED_ATTACK_UNIT': {
      if (action.targetUnitId && state.units[action.targetUnitId]) {
        resolveAttack(state, currentUnit.id, action.targetUnitId);
      }
      break;
    }

    case 'CAPTURE_BUILDING': {
      if (action.targetBuildingId) {
        if (canCapture(state, currentUnit.id, action.targetBuildingId)) {
          initiateCapture(state, currentUnit.id, action.targetBuildingId);
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
        const nextPos = stepToward(currentUnit.position, action.targetPosition, state);
        if (nextPos.x !== currentUnit.position.x || nextPos.y !== currentUnit.position.y) {
          moveEnemyUnit(state, currentUnit.id, nextPos);
        }
      }
      break;
    }

    case 'MOVE_TO_UNIT':
    case 'FLANK_UNIT': {
      if (action.targetPosition) {
        const nextPos = stepToward(currentUnit.position, action.targetPosition, state);
        if (nextPos.x !== currentUnit.position.x || nextPos.y !== currentUnit.position.y) {
          moveEnemyUnit(state, currentUnit.id, nextPos);
        }
      }
      break;
    }

    case 'ADVANCE_WITH_LAVA':
    case 'ADVANCE_SOUTH': {
      const southPos: Position = { x: currentUnit.position.x, y: currentUnit.position.y - 1 };
      if (isWithinBounds(southPos)) {
        const tile = state.grid[southPos.y][southPos.x];
        if (!tile.isLava && tile.unitId === null) {
          moveEnemyUnit(state, currentUnit.id, southPos);
        }
      }
      break;
    }

    case 'SACRIFICE_TO_LAVA': {
      destroyUnit(state, currentUnit.id);
      state.threatLevel += 1;
      return;
    }

    case 'PUSH_TO_ZONE_EDGE': {
      const playerBuildings = Object.values(state.buildings).filter(b => b.faction === Faction.PLAYER);
      let targetY = currentUnit.position.y - 1;
      if (playerBuildings.length > 0) {
        targetY = Math.min(...playerBuildings.map(b => b.position.y));
      }
      const targetPos: Position = { x: currentUnit.position.x, y: targetY };
      const nextPos = stepToward(currentUnit.position, targetPos, state);
      if (nextPos.x !== currentUnit.position.x || nextPos.y !== currentUnit.position.y) {
        moveEnemyUnit(state, currentUnit.id, nextPos);
      }
      break;
    }

    case 'HOLD_POSITION':
      break;
  }

  // Post-move lava check: if unit moved onto or below lava front row, destroy it
  const movedUnit = state.units[unit.id];
  if (movedUnit && movedUnit.position.y <= state.lavaFrontRow) {
    destroyUnit(state, movedUnit.id);
    state.threatLevel += 1;
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

  executeAction(unit, chosen, state);
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
// MAIN ENEMY TURN FUNCTION
// ============================================================================

export function runEnemyTurn(state: Draft<GameState>): void {
  // 1. Build recentlyLostBuildingIds
  const recentlyLostBuildingIds = new Set<string>(
    Object.values(state.buildings)
      .filter(b =>
        b.faction === Faction.PLAYER &&
        b.turnCapturedByPlayer !== null &&
        state.turn - b.turnCapturedByPlayer <= AI_SCORING.RECENTLY_LOST_WINDOW_TURNS
      )
      .map(b => b.id)
  );

  // 2. Spawn enemy units
  spawnEnemyUnits(state);

  // 3. Process each enemy unit
  const targetingIntents = new Map<string, number>();
  const enemyUnits = Object.values(state.units).filter(u => u.faction === Faction.ENEMY);

  for (const unit of enemyUnits) {
    if (!state.units[unit.id]) continue;
    decideAndExecute(state.units[unit.id], state, targetingIntents, recentlyLostBuildingIds);
  }

  // 4. Reset enemy unit action flags for next turn
  for (const unit of Object.values(state.units)) {
    if (unit.faction === Faction.ENEMY) {
      unit.hasMovedThisTurn = false;
      unit.hasActedThisTurn = false;
      unit.hasCapturedThisTurn = false;
    }
  }
}
