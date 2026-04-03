/**
 * Enemy AI system module for Volcanae.
 * Implements enemy unit spawning and scoring-based AI behavior.
 */

import type { GameState, Unit, Building, Position } from './types';
import type { Draft } from 'immer';
import { produce } from 'immer';
import { Faction, UnitType, UnitTag, BuildingType, TileType } from './types';
import { UNITS, ENEMY, MAP, AI_SCORING, AI_RECRUITMENT, ENEMY_UNIT_UNLOCK } from './gameConfig';
import { resolveAttack, calculateCombat, resolveBuildingAttack, buildingToCombatant, calculateCombatFromStats, unitToCombatant, resolveAttackOnBuilding } from './combatSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { initiateCapture, canCapture } from './captureSystem';
import { corruptTerrain, processMagmaSpyrAttacks, processEmberNestSpawns } from './corruptionSystem';
import { enemyConstructBuilding } from './constructionSystem';
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
  [BuildingType.LAVALAIR]: UnitType.LAVA_GRUNT,
  [BuildingType.INFERNALSANCTUM]: UnitType.LAVA_RIDER,
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
  | 'ADVANCE_TOWARD_LAVA'
  | 'FLANK_UNIT'
  | 'SACRIFICE_TO_LAVA'
  | 'CORRUPT_TERRAIN'
  | 'BUILD_LAVA_LAIR'
  | 'BUILD_INFERNAL_SANCTUM'
  | 'EXPLODE'
  | 'HOLD_POSITION';

interface ScoredAction {
  type: EnemyActionType;
  score: number;
  targetUnitId?: string;
  targetBuildingId?: string;
  targetPosition?: Position;
}

export type { ScoredAction };

interface ArmyProfile {
  totalCount: number;

  offensiveCount: number;
  defensiveCount: number;
  offensiveAvg: number;
  defensiveAvg: number;

  slowMeleeCount: number;
  meleeCount: number;
  fastCount: number;
  siegeCount: number;
  rangedCount: number;

  slowMeleeRatio: number;
  meleeRatio: number;
  fastRatio: number;
  siegeRatio: number;
  rangedRatio: number;
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
    building.type === BuildingType.LAVALAIR ||
    building.type === BuildingType.INFERNALSANCTUM
  );
}

function calculateLavaBoostFactor(buildingPosition: Position, lavaFrontRow: number): number {
  const effectiveLavaRow = Math.min(MAP.GRID_HEIGHT - 1, lavaFrontRow);
  const distanceToLava = effectiveLavaRow - buildingPosition.y;
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

const SPAWNER_TYPES: BuildingType[] = [BuildingType.BARRACKS, BuildingType.ARCHER_CAMP, BuildingType.RIDER_CAMP, BuildingType.SIEGE_CAMP, BuildingType.LAVALAIR, BuildingType.INFERNALSANCTUM];
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

/**
 * Checks whether a SACRIFICIAL unit is blocked from reaching lava.
 * Uses a BFS path simulation: from the unit's current position, explores
 * reachable free (non-lava, unoccupied) tiles up to checkDist steps in any
 * direction. Returns true only if no reachable tile lies closer to lava.
 *
 * Coordinate system: lava is at high Y values (increasing Y = toward lava).
 * A tile at ny > startY is one step closer to lava.
 */
function isUnitBlockedFromLava(unit: Unit, state: Draft<GameState>): boolean {
  const checkDist = AI_SCORING.SACRIFICIAL_BLOCKED_CHECK_DISTANCE;
  const startX = unit.position.x;
  const startY = unit.position.y;

  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; steps: number }> = [{ x: startX, y: startY, steps: 0 }];
  visited.add(`${startX},${startY}`);
  let head = 0;

  while (head < queue.length) {
    const { x, y, steps } = queue[head++];
    if (steps >= checkDist) continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = state.grid[ny][nx];
      if (tile.unitId !== null || tile.isLava || (tile.buildingId !== null && state.buildings[tile.buildingId]?.faction === Faction.PLAYER)) continue;
      // ny > startY means the tile is closer to lava (higher Y = toward lava)
      if (ny > startY) return false;
      queue.push({ x: nx, y: ny, steps: steps + 1 });
    }
  }
  return true; // No reachable tile advances toward lava within checkDist steps
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

  // Prefer diagonal movement when both components are non-zero
  if (dx !== 0 && dy !== 0) {
    steps.push({ x: from.x + Math.sign(dx), y: from.y + Math.sign(dy) });
  }

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
      if (!tile.isLava && tile.unitId === null && (tile.buildingId === null || state.buildings[tile.buildingId]?.faction !== Faction.PLAYER)) {
        return pos;
      }
    }
  }

  return from;
}

/**
 * Finds the best target position for ADVANCE_TOWARD_LAVA using pathfinding.
 * Scans rows progressively toward the lava front row, returning the first row
 * that has a free (non-lava, unoccupied) tile and picking the tile closest to
 * the unit's current X column. This allows moveEnemyUnitToward to travel
 * diagonally or sideways rather than only straight south.
 */
function findLavaAdvanceTarget(unit: Unit, state: Draft<GameState>): Position {
  const lavaFrontRow = state.lavaFrontRow;
  const startX = unit.position.x;
  const startY = unit.position.y;
  // Scan up to moveRange + a small buffer sideways for path-finding flexibility
  const scanWidth = unit.stats.moveRange + 3;

  // Walk from just before the lava row back toward (but not including) the
  // unit's own row — we want tiles strictly ahead (higher Y = closer to lava).
  for (let ty = lavaFrontRow - 1; ty > startY; ty--) {
    let bestX: number | null = null;
    let bestDist = Infinity;

    for (let tx = Math.max(0, startX - scanWidth); tx <= Math.min(MAP.GRID_WIDTH - 1, startX + scanWidth); tx++) {
      const tile = state.grid[ty][tx];
      if (tile.isLava || tile.unitId !== null || (tile.buildingId !== null && state.buildings[tile.buildingId]?.faction === Faction.PLAYER)) continue;
      const dist = Math.abs(tx - startX);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = tx;
      }
    }

    if (bestX !== null) {
      return { x: bestX, y: ty };
    }
  }

  // Fallback: all rows ahead are fully blocked or unit is already adjacent to
  // lava. Target the lava row itself so the unit steps in (moveEnemyUnit handles
  // lava entry by destroying the unit and incrementing threat).
  return { x: startX, y: Math.min(MAP.GRID_HEIGHT - 1, lavaFrontRow) };
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

/**
 * Calculates the offensive and defensive tendency scores for a unit type
 * based purely on its stats. Used by buildArmyProfile for army composition
 * analysis during recruitment scoring.
 *
 * offensiveScore = (attack / 100) + ((moveRange - 1) * 0.5)
 * defensiveScore = (defense / 100) + (maxHp / 100) - 1
 *
 * A unit with 100hp scores 0 on the defensive hp term (neutral baseline).
 * Units below 100hp score negative, reflecting low durability.
 */
function calcUnitScores(unitType: UnitType): { off: number; def: number } {
  const u = UNITS[unitType];
  const off = (u.attack / 100) + ((u.moveRange - 1) * 0.5);
  const def = (u.defense / 100) + (u.maxHp / 100) - 1;
  return { off, def };
}

/**
 * Builds a full army composition profile from a list of units.
 * All ratios are relative to totalCount; safe to call with an empty array
 * (returns all zeros). Used in scoreRecruitmentForLavaLairs to analyse both
 * the enemy army (global + zone-local) and the player army each turn.
 *
 * Classification rules (thresholds from AI_RECRUITMENT):
 *   offensive  — offensiveScore >= OFFENSIVE_THRESHOLD
 *   defensive  — defensiveScore >= DEFENSIVE_THRESHOLD
 *   fast       — moveRange >= FAST_THRESHOLD
 *   ranged     — RANGED tag AND attackRange >= RANGED_THRESHOLD
 *   siege      — RANGED tag AND attackRange >= SIEGE_THRESHOLD
 *   melee      — attackRange < RANGED_THRESHOLD
 *   slowMelee  — melee AND NOT fast
 *
 * A unit may be counted in multiple categories (e.g. a fast melee unit
 * increments both fastCount and meleeCount).
 */
function buildArmyProfile(units: Unit[]): ArmyProfile {
  const R = AI_RECRUITMENT;
  const total = units.length;

  if (total === 0) {
    return {
      totalCount: 0,
      offensiveCount: 0, defensiveCount: 0,
      offensiveAvg: 0, defensiveAvg: 0,
      slowMeleeCount: 0, meleeCount: 0, fastCount: 0,
      siegeCount: 0, rangedCount: 0,
      slowMeleeRatio: 0, meleeRatio: 0, fastRatio: 0,
      siegeRatio: 0, rangedRatio: 0,
    };
  }

  let offensiveCount = 0, defensiveCount = 0;
  let offensiveSum = 0, defensiveSum = 0;
  let slowMeleeCount = 0, meleeCount = 0, fastCount = 0;
  let siegeCount = 0, rangedCount = 0;

  for (const unit of units) {
    const { off, def } = calcUnitScores(unit.type);
    const u = UNITS[unit.type];

    offensiveSum += off;
    defensiveSum += def;
    if (off >= R.OFFENSIVE_THRESHOLD) offensiveCount++;
    if (def >= R.DEFENSIVE_THRESHOLD) defensiveCount++;

    const isMelee = u.attackRange < R.RANGED_THRESHOLD;
    const isFast = u.moveRange >= R.FAST_THRESHOLD;
    const isRanged = unit.tags.includes(UnitTag.RANGED) && u.attackRange >= R.RANGED_THRESHOLD;
    const isSiege = unit.tags.includes(UnitTag.RANGED) && u.attackRange >= R.SIEGE_THRESHOLD;

    if (isMelee) meleeCount++;
    if (isMelee && !isFast) slowMeleeCount++;
    if (isFast) fastCount++;
    if (isRanged) rangedCount++;
    if (isSiege) siegeCount++;
  }

  return {
    totalCount: total,
    offensiveCount,
    defensiveCount,
    offensiveAvg: offensiveSum / total,
    defensiveAvg: defensiveSum / total,
    slowMeleeCount,
    meleeCount,
    fastCount,
    siegeCount,
    rangedCount,
    slowMeleeRatio: slowMeleeCount / total,
    meleeRatio: meleeCount / total,
    fastRatio: fastCount / total,
    siegeRatio: siegeCount / total,
    rangedRatio: rangedCount / total,
  };
}

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
  const tags: UnitTag[] = [...UNITS[unitType].tags];

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

    // Score recruitment fresh each time so already-spawned units affect composition
    const scored = scoreRecruitmentForBuilding(state, building);
    const unitType: UnitType = scored[0]?.type ?? BUILDING_SPAWN_UNIT_TYPE[building.type] ?? UnitType.LAVA_GRUNT;

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
// LAVA_LAIR / INFERNAL_SANCTUM DYNAMIC RECRUITMENT
// ============================================================================

/**
 * Gets the zone number (1-5) for a given row position.
 * Zone 1 is at high Y (near lava), zone 5 is at low Y (far from lava).
 */
function getZoneForRow(row: number): number {
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

/**
 * Scores all eligible unit types for a single LAVA_LAIR or INFERNAL_SANCTUM
 * building and returns them sorted by score descending.
 *
 * Rebuilds army profiles from the current state on every call so that units
 * already spawned earlier in the same turn are reflected in the composition
 * analysis. This prevents the same unit type from dominating all recruits in
 * a single turn.
 *
 * Emberlings are intentionally excluded — they only spawn from Ember Nests.
 *
 * All scoring weights and thresholds are defined in AI_RECRUITMENT (gameConfig.ts).
 *
 * Profile scoping:
 *   playerProfile  — all player units on the map (global)
 *   zoneProfile    — enemy units in the same zone as the spawning building
 *                    (local composition; used for over-representation checks
 *                    and cover/gap detection)
 *
 * Scoring logic per unit type:
 *   LAVA_GRUNT   — defensive front line; good when enemy is offense-heavy or
 *                  has siege to cover, and when player brings heavy melee.
 *   LAVA_ARCHER  — ranged support; good when player is slow-melee-heavy and
 *                  enemy has defensive cover. Penalised when player has fast
 *                  units that will reach them before they deal damage.
 *   LAVA_RIDER   — fast offensive; counter to player ranged/siege. Penalised
 *                  when already over-represented in zone.
 *   LAVA_SIEGE   — long-range; only viable when player is slow AND enemy has
 *                  enough defensive cover. Hard-penalised without cover or
 *                  when player has fast units.
 */
function scoreRecruitmentForBuilding(
  state: Draft<GameState>,
  building: Building,
): { type: UnitType; score: number }[] {
  const R = AI_RECRUITMENT;

  // Threat-gated eligible unit types; Emberlings only spawn from Ember Nests
  const eligibleTypes: UnitType[] = Object.entries(ENEMY_UNIT_UNLOCK)
    .filter(([, minThreat]) => state.threatLevel >= minThreat)
    .map(([type]) => type as UnitType)
    .filter(type => type !== UnitType.EMBERLING);

  if (eligibleTypes.length === 0) return [];

  // Rebuild profiles from current state (reflects units spawned earlier this turn)
  const allUnits = Object.values(state.units);
  const playerProfile = buildArmyProfile(allUnits.filter(u => u.faction === Faction.PLAYER));
  const enemyUnits = allUnits.filter(u => u.faction === Faction.ENEMY);

  // Zone-local enemy profile for composition/cover checks
  const buildingZone = getZoneForRow(building.position.y);
  const zoneProfile = buildArmyProfile(
    enemyUnits.filter(u => getZoneForRow(u.position.y) === buildingZone)
  );

  const results: { type: UnitType; score: number }[] = [];

  for (const unitType of eligibleTypes) {
    const baseScores: Partial<Record<UnitType, number>> = {
      [UnitType.LAVA_GRUNT]: R.BASE_SCORE_GRUNT,
      [UnitType.LAVA_ARCHER]: R.BASE_SCORE_ARCHER,
      [UnitType.LAVA_RIDER]: R.BASE_SCORE_RIDER,
      [UnitType.LAVA_SIEGE]: R.BASE_SCORE_SIEGE,
    };
    let score = baseScores[unitType] ?? 0;

    // ── LAVA_GRUNT scoring ──────────────────────────────────────────
    if (unitType === UnitType.LAVA_GRUNT) {
      // Bonus when enemy army is more offensive than defensive (needs front line)
      if (zoneProfile.offensiveAvg > zoneProfile.defensiveAvg) {
        score += R.GRUNT_BONUS_ENEMY_OFF_EXCEEDS_DEF;
      }
      // Bonus per player offensive unit (more threats = more need for defenders)
      score += playerProfile.offensiveCount * R.GRUNT_BONUS_PLAYER_OFFENSIVE_COUNT;
      // Bonus when enemy has siege to protect
      if (zoneProfile.siegeCount > 0) {
        score += R.GRUNT_BONUS_ENEMY_SIEGE_EXISTS;
      }
      // Bonus when player is melee-heavy (grunts trade well vs melee)
      if (playerProfile.meleeRatio >= R.GRUNT_PLAYER_MELEE_RATIO_THRESHOLD) {
        score += R.GRUNT_BONUS_HIGH_PLAYER_MELEE_RATIO;
      }
      // Penalty when grunts are over-represented in zone
      if (zoneProfile.totalCount > 0 && zoneProfile.meleeRatio >= R.GRUNT_OVERREPRESENTED_THRESHOLD) {
        score -= R.GRUNT_PENALTY_OVERREPRESENTED;
      }
    }

    // ── LAVA_ARCHER scoring ─────────────────────────────────────────
    if (unitType === UnitType.LAVA_ARCHER) {
      // Bonus when player has many slow melee units (easy targets)
      if (playerProfile.slowMeleeRatio >= R.ARCHER_PLAYER_SLOW_MELEE_RATIO_THRESHOLD) {
        score += R.ARCHER_BONUS_PLAYER_SLOW_MELEE_RATIO;
      }
      // Bonus when enemy has enough defensive cover
      if (zoneProfile.defensiveCount >= R.ARCHER_ENEMY_DEF_COUNT_THRESHOLD) {
        score += R.ARCHER_BONUS_ENEMY_DEF_COVER;
      }
      // Penalty when player has fast units that can close distance
      if (playerProfile.fastRatio >= R.ARCHER_PLAYER_FAST_RATIO_THRESHOLD) {
        score -= R.ARCHER_PENALTY_PLAYER_FAST_RATIO;
      }
      // Penalty when ranged units are over-represented in zone
      if (zoneProfile.totalCount > 0 && zoneProfile.rangedRatio >= R.ARCHER_RANGED_OVERREPRESENTED_THRESHOLD) {
        score -= R.ARCHER_PENALTY_OVERREPRESENTED;
      }
    }

    // ── LAVA_RIDER scoring ──────────────────────────────────────────
    if (unitType === UnitType.LAVA_RIDER) {
      // Bonus when player has ranged units (riders counter ranged)
      if (playerProfile.rangedRatio >= R.RIDER_PLAYER_RANGED_RATIO_THRESHOLD) {
        score += R.RIDER_BONUS_PLAYER_RANGED_RATIO;
      }
      // Bonus per player ranged unit
      score += playerProfile.rangedCount * R.RIDER_BONUS_PLAYER_RANGED_COUNT;
      // Bonus when enemy lacks fast units in zone (gap to fill)
      if (zoneProfile.fastCount < R.RIDER_ENEMY_FAST_GAP_THRESHOLD) {
        score += R.RIDER_BONUS_ENEMY_FAST_GAP;
      }
      // Penalty when fast units are over-represented in zone
      if (zoneProfile.totalCount > 0 && zoneProfile.fastRatio >= R.RIDER_FAST_OVERREPRESENTED_THRESHOLD) {
        score -= R.RIDER_PENALTY_OVERREPRESENTED;
      }
    }

    // ── LAVA_SIEGE scoring ──────────────────────────────────────────
    if (unitType === UnitType.LAVA_SIEGE) {
      // Bonus when player is slow-melee-heavy (can't reach siege easily)
      if (playerProfile.slowMeleeRatio >= R.SIEGE_PLAYER_SLOW_MELEE_RATIO_THRESHOLD) {
        score += R.SIEGE_BONUS_PLAYER_SLOW_MELEE_RATIO;
      }
      // Bonus when enemy has enough defensive cover to protect siege
      if (zoneProfile.defensiveCount >= R.SIEGE_ENEMY_DEF_COUNT_THRESHOLD) {
        score += R.SIEGE_BONUS_ENEMY_DEF_COVER;
      }
      // Penalty when enemy has no cover (siege is vulnerable)
      if (zoneProfile.defensiveCount < R.SIEGE_NO_COVER_THRESHOLD) {
        score -= R.SIEGE_PENALTY_NO_COVER;
      }
      // Penalty when player has fast units that can reach siege
      if (playerProfile.fastRatio >= R.SIEGE_PLAYER_FAST_RATIO_THRESHOLD) {
        score -= R.SIEGE_PENALTY_PLAYER_FAST_RATIO;
      }
      // Penalty when siege is over-represented in zone
      if (zoneProfile.totalCount > 0 && zoneProfile.siegeRatio >= R.SIEGE_OVERREPRESENTED_THRESHOLD) {
        score -= R.SIEGE_PENALTY_OVERREPRESENTED;
      }
    }

    results.push({ type: unitType, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ============================================================================
// CONSTRUCTION SCORING FOR BUILD_AND_CAPTURE UNITS
// ============================================================================

/**
 * Scores possible construction actions for a BUILDANDCAPTURE enemy unit.
 * Finds ruin tiles, stronghold ruin tiles, and corruptible terrain within range,
 * and adds scored BUILD_LAVA_LAIR, BUILD_INFERNAL_SANCTUM, and CORRUPT_TERRAIN actions.
 */
function scoreConstructionActions(
  unit: Unit,
  state: Draft<GameState>,
  candidates: ScoredAction[],
): void {
  // Only BUILDANDCAPTURE units can construct
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return;

  const moveRange = unit.stats.moveRange;

  // Scan tiles within moveRange for ruin, stronghold ruin, and terrain corruption targets
  for (let dy = -moveRange; dy <= moveRange; dy++) {
    for (let dx = -moveRange; dx <= moveRange; dx++) {
      const tx = unit.position.x + dx;
      const ty = unit.position.y + dy;
      if (!isWithinBounds({ x: tx, y: ty })) continue;
      if (!isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, tx, ty, moveRange)) continue;

      const tile = state.grid[ty][tx];
      const distance = manhattanDistance(unit.position, { x: tx, y: ty });

      // ── BUILD_LAVA_LAIR on ruin tiles ──
      if (tile.isRuin) {
        let score = AI_SCORING.BASE_BUILD_LAVA_LAIR
          - AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;

        // Bonus if no other LAVA_LAIR buildings exist within 4 tiles (encourages spread)
        const nearbyLavaLair = Object.values(state.buildings).some(
          b => b.type === BuildingType.LAVALAIR && manhattanDistance(b.position, { x: tx, y: ty }) <= 4,
        );
        if (!nearbyLavaLair) {
          score += 15;
        }

        candidates.push({ type: 'BUILD_LAVA_LAIR', score: Math.max(0, score), targetPosition: { x: tx, y: ty } });
      }

      // ── BUILD_INFERNAL_SANCTUM on stronghold ruin tiles ──
      if (tile.isStrongholdRuin) {
        const score = AI_SCORING.BASE_BUILD_LAVA_LAIR + 20
          - AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;
        candidates.push({ type: 'BUILD_INFERNAL_SANCTUM', score: Math.max(0, score), targetPosition: { x: tx, y: ty } });
      }

      // ── CORRUPT_TERRAIN for CORRUPT tag units on FOREST/MOUNTAIN tiles ──
      if (unit.tags.includes(UnitTag.CORRUPT)) {
        if ((tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) && !tile.buildingId) {
          const score = AI_SCORING.BASE_CORRUPT_TERRAIN
            - AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;
          candidates.push({ type: 'CORRUPT_TERRAIN', score: Math.max(0, score), targetPosition: { x: tx, y: ty } });
        }
      }
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
// EXPLOSION RESOLUTION (for EXPLOSIVE-tagged units)
// ============================================================================

/**
 * Resolves an explosion for any EXPLOSIVE-tagged unit. Deals flat damage to all
 * player units within Chebyshev distance 1 (including diagonals). No counter-attack,
 * no defense formula. The exploding unit is destroyed in the process.
 *
 * Reusable for any unit type that has the EXPLOSIVE tag and an explosionDamage stat.
 */
export function resolveExplosion(
  state: Draft<GameState>,
  unitId: string,
  events: GameEvent[],
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  const unitConfig = UNITS[unit.type] as { explosionDamage?: number };
  const explosionDamage = unitConfig.explosionDamage ?? 0;
  const unitPos = { x: unit.position.x, y: unit.position.y };
  const damagedUnitIds: string[] = [];

  // Find all player units within Chebyshev distance 1
  const targets: string[] = [];
  for (const u of Object.values(state.units)) {
    if (u.faction !== Faction.PLAYER) continue;
    const dx = Math.abs(u.position.x - unit.position.x);
    const dy = Math.abs(u.position.y - unit.position.y);
    if (Math.max(dx, dy) <= 1) {
      targets.push(u.id);
    }
  }

  // Apply flat damage to each target
  for (const targetId of targets) {
    const target = state.units[targetId];
    if (!target) continue;

    target.stats.currentHp -= explosionDamage;
    damagedUnitIds.push(targetId);

    if (target.stats.currentHp <= 0) {
      const deathPos = { x: target.position.x, y: target.position.y };
      const deathFaction = target.faction;
      // Remove unit
      const tile = state.grid[target.position.y][target.position.x];
      if (tile.unitId === targetId) {
        tile.unitId = null;
      }
      delete state.units[targetId];
      // Emit death event
      events.push({
        type: 'UNIT_DEATH',
        unitId: targetId,
        position: deathPos,
        faction: deathFaction,
      });
    }
  }

  // Emit explosion event
  events.push({
    type: 'EXPLOSION',
    unitId,
    position: unitPos,
    damagedUnitIds,
    damagePerUnit: explosionDamage,
  });

  // Remove the exploding unit
  const unitTile = state.grid[unit.position.y][unit.position.x];
  if (unitTile.unitId === unitId) {
    unitTile.unitId = null;
  }
  delete state.units[unitId];

  // Emit death event for the exploding unit
  events.push({
    type: 'UNIT_DEATH',
    unitId,
    position: unitPos,
    faction: Faction.ENEMY,
  });
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
  if (!unit.hasActedThisTurn && unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
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
      // If a player unit is standing on the stronghold and the enemy is already within its attack
      // range, suppress this action so attack actions take priority instead.
      // Melee units have attackRange === 1 (adjacent only); ranged units have attackRange > 1.
      // Using attackRange directly handles both cases without special-casing.
      const strongholdTile = state.grid[building.position.y][building.position.x];
      const playerUnitOnStronghold = strongholdTile.unitId != null
        && state.units[strongholdTile.unitId]?.faction === Faction.PLAYER;
      if (!(playerUnitOnStronghold && distance <= attackRange)) {
        const score = AI_SCORING.BASE_PUSH_TO_STRONGHOLD
          * AI_SCORING.BUILDING_VALUE_STRONGHOLD
          - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
          - saturationPenalty(building.id, targetingIntents);
        candidates.push({ type: 'PUSH_TO_STRONGHOLD', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
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

  // ── Blocked-from-lava detection for SACRIFICIAL units ──
  const isBlockedFromLava = unit.tags.includes(UnitTag.SACRIFICIAL)
    ? isUnitBlockedFromLava(unit, state)
    : false;

  // ── ADVANCE_TOWARD_LAVA ──
  if (!unit.hasMovedThisTurn) {
    const score = AI_SCORING.BASE_ADVANCE_TOWARD_LAVA
      + (unit.tags.includes(UnitTag.SACRIFICIAL) ? AI_SCORING.BONUS_SACRIFICIAL_ADVANCE_TOWARD_LAVA : 0);
    if (isBlockedFromLava) {
      // When blocked, target the nearest player unit to push through the blocker
      const playerUnits = Object.values(state.units).filter(u => u.faction === Faction.PLAYER);
      if (playerUnits.length > 0) {
        playerUnits.sort((a, b) => manhattanDistance(unit.position, a.position) - manhattanDistance(unit.position, b.position));
        candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: playerUnits[0].position });
      } else {
        // No player units to push through — still use pathfinding to advance
        const lavaTarget = findLavaAdvanceTarget(unit, state);
        candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: lavaTarget });
      }
    } else {
      // Use pathfinding target so movement can be diagonal/sideways around obstacles
      const lavaTarget = findLavaAdvanceTarget(unit, state);
      candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: lavaTarget });
    }
  }

  // ── SACRIFICE_TO_LAVA ──
  // Only score this when lava is directly adjacent — unit will step into it this turn.
  if (!unit.hasMovedThisTurn) {
    let adjacentLavaPos: Position | null = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = unit.position.x + dx;
      const ny = unit.position.y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      if (state.grid[ny][nx].isLava) {
        adjacentLavaPos = { x: nx, y: ny };
        break;
      }
    }
    if (adjacentLavaPos) {
      const score = AI_SCORING.BASE_SACRIFICE_TO_LAVA
        + (unit.tags.includes(UnitTag.SACRIFICIAL) ? AI_SCORING.BONUS_SACRIFICIAL_SACRIFICE_TO_LAVA : 0);
      candidates.push({ type: 'SACRIFICE_TO_LAVA', score, targetPosition: adjacentLavaPos });
    }
  }

  // ── EXPLODE (EXPLOSIVE + SACRIFICIAL blocked, or pure EXPLOSIVE — reusable for any explosive unit) ──
  if (!unit.hasActedThisTurn && unit.tags.includes(UnitTag.EXPLOSIVE)) {
    const isSacrificial = unit.tags.includes(UnitTag.SACRIFICIAL);
    // Only score EXPLODE for SACRIFICIAL units when they are blocked from lava
    if (!isSacrificial || isBlockedFromLava) {
      let hasAdjacentPlayer = false;
      for (const u of Object.values(state.units)) {
        if (u.faction !== Faction.PLAYER) continue;
        const dx = Math.abs(u.position.x - unit.position.x);
        const dy = Math.abs(u.position.y - unit.position.y);
        if (Math.max(dx, dy) <= 1) {
          hasAdjacentPlayer = true;
          break;
        }
      }
      if (hasAdjacentPlayer) {
        const blockedBonus = (isSacrificial && isBlockedFromLava) ? AI_SCORING.BONUS_BLOCKED_SACRIFICIAL_EXPLODE : 0;
        candidates.push({ type: 'EXPLODE', score: AI_SCORING.BASE_EXPLODE + blockedBonus });
      }
    }
  }

  // ── CONSTRUCTION & CORRUPTION ──
  // scoreConstructionActions handles BUILD_LAVA_LAIR, BUILD_INFERNAL_SANCTUM, and CORRUPT_TERRAIN
  if (!unit.hasActedThisTurn) {
    scoreConstructionActions(unit, state, candidates);
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
          // Save building info before capture (initiateCapture now destroys the building)
          const capturedPosition = building ? { x: building.position.x, y: building.position.y } : null;
          const capturedType = building?.type;
          initiateCapture(state, currentUnit.id, action.targetBuildingId);
          if (events && capturedPosition && capturedType) {
            events.push({
              type: 'BUILDING_CAPTURE',
              buildingId: action.targetBuildingId,
              position: capturedPosition,
              newFaction: currentUnit.faction,
              buildingType: capturedType,
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

    case 'ADVANCE_TOWARD_LAVA': {
      const lavaTarget: Position = action.targetPosition ?? {
        x: currentUnit.position.x,
        y: Math.min(MAP.GRID_HEIGHT - 1, currentUnit.position.y + currentUnit.stats.moveRange),
      };
      moveEnemyUnitToward(state, currentUnit.id, lavaTarget, events);
      break;
    }

    case 'SACRIFICE_TO_LAVA': {
      // Move the unit into the adjacent lava tile; moveEnemyUnit handles lava entry
      // (emits ENEMY_MOVE event, destroys the unit, and increments threat level).
      if (action.targetPosition) {
        moveEnemyUnit(state, currentUnit.id, action.targetPosition, events);
      } else {
        // Fallback: destroy in place (should not normally happen)
        destroyUnit(state, currentUnit.id, events);
        state.threatLevel += 1;
      }
      return;
    }

    case 'PUSH_TO_ZONE_EDGE': {
      const playerBuildings = Object.values(state.buildings).filter(b => b.faction === Faction.PLAYER);
      let targetY = Math.min(MAP.GRID_HEIGHT - 1, currentUnit.position.y + currentUnit.stats.moveRange);
      if (playerBuildings.length > 0) {
        targetY = Math.min(MAP.GRID_HEIGHT - 1, Math.max(...playerBuildings.map(b => b.position.y)));
      }
      const targetPos: Position = { x: currentUnit.position.x, y: targetY };
      moveEnemyUnitToward(state, currentUnit.id, targetPos, events);
      break;
    }

    case 'BUILD_LAVA_LAIR': {
      if (action.targetPosition) {
        const isOnTile = currentUnit.position.x === action.targetPosition.x && currentUnit.position.y === action.targetPosition.y;
        if (isOnTile) {
          enemyConstructBuilding(state, currentUnit.id, action.targetPosition, BuildingType.LAVALAIR);
        } else if (!currentUnit.hasMovedThisTurn) {
          moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events);
        }
      }
      break;
    }

    case 'BUILD_INFERNAL_SANCTUM': {
      if (action.targetPosition) {
        const isOnTile = currentUnit.position.x === action.targetPosition.x && currentUnit.position.y === action.targetPosition.y;
        if (isOnTile) {
          enemyConstructBuilding(state, currentUnit.id, action.targetPosition, BuildingType.INFERNALSANCTUM);
        } else if (!currentUnit.hasMovedThisTurn) {
          moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events);
        }
      }
      break;
    }

    case 'CORRUPT_TERRAIN': {
      if (action.targetPosition) {
        const isOnTile = currentUnit.position.x === action.targetPosition.x && currentUnit.position.y === action.targetPosition.y;
        if (isOnTile) {
          // Unit is on the terrain tile — corrupt it
          corruptTerrain(state, currentUnit.id, action.targetPosition);
          currentUnit.hasActedThisTurn = true;
        } else if (!currentUnit.hasMovedThisTurn) {
          // Move 1 step toward the terrain tile
          moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events);
        }
      }
      break;
    }

    case 'EXPLODE': {
      resolveExplosion(state, currentUnit.id, events ?? []);
      return; // unit is destroyed, no further processing
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
  // All units go through the unified scoring — tag-based behaviors
  // (EXPLOSIVE, SACRIFICIAL, etc.) are handled within scoreActionsForUnit
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

    // 2. Process Ember Nest spawns (at start of enemy turn)
    processEmberNestSpawns(draft, events);

    // 2a. Spawn enemy units (recruitment is scored fresh per-building inside spawnEnemyUnits)
    spawnEnemyUnits(draft, events);

    // 2c. Enemy-owned attacking buildings (e.g. watchtowers) fire at player units in range
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

    // 3b. Magma Spyr attacks (after unit movement)
    processMagmaSpyrAttacks(draft, events);

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

/**
 * Computes recruitment scores for an enemy LAVA_LAIR or INFERNAL_SANCTUM
 * building and returns them sorted by score descending.
 * Returns null if the building is not an enemy recruiting building.
 * Intended for dev/debug use only (Recruiting Score inspector).
 */
export function computeRecruitmentScores(
  state: GameState,
  buildingId: string,
): { type: UnitType; score: number }[] | null {
  const building = state.buildings[buildingId];
  if (!building || building.faction !== Faction.ENEMY) return null;
  if (building.type !== BuildingType.LAVALAIR && building.type !== BuildingType.INFERNALSANCTUM) return null;
  return scoreRecruitmentForBuilding(state as Draft<GameState>, building);
}
