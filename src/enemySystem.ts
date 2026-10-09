/**
 * Enemy AI system module for Volcanae.
 * Implements enemy unit spawning and scoring-based AI behavior.
 */

import type { GameState, Unit, Building, Position, SpawnBudgetSnapshot, Tile } from './types';
import type { Draft } from 'immer';
import { current, produce } from 'immer';
import { Faction, UnitType, UnitTag, BuildingType, TileType, TileStatus } from './types';
import { UNIT_DEFINITIONS, MAP, TERRAIN, AI_SCORING, AI_RECRUITMENT, XP, DIFFICULTY_MULTIPLIER, SANCTUM_COLLAPSE, ABILITIES, SPAWN_BUDGET, AI_TRACE } from './gameConfig';
import { resolveAttack, calculateCombat, resolveBuildingAttack, buildingToCombatant, calculateCombatFromStats, unitToCombatant, resolveAttackOnBuilding, detectBrandmarkSpawnPos, updateBerserkLatch } from './combatSystem';
import { isTileWithinEdgeCircleRange, edgeCircleDistance } from './rangeUtils';
import { initiateCapture, canCapture } from './captureSystem';
import { corruptTerrain, processMagmaSpyrAttacks, processEmberNestSpawns } from './corruptionSystem';
import { enemyConstructBuilding } from './constructionSystem';
import { getBridgeAt, canTraverseEdge } from './bridgeSystem';
import { processEnemyLevelUps, grantXp, canGrantXp } from './levelSystem';
import type { GameEvent } from './gameEvents';
import {
  hasUnitActed,
  applySpawnActionFlags,
  isAttackableEnemyUnit,
  getTauntRestrictedAttackTargets,
} from './unitActions';
import { sweepLeashes } from './spellSystem';
import { checkGraveTrapTrigger, checkScoutTrapTrigger, resolveSlide } from './movementSystem';
import { tryBeginTunnel, processTunnelTurn } from './tunnelSystem';
import { cleanupPortals, cleanupExpiredPortalsEndOfTurn, tryPlanPortalCast, castPortal, getUsablePortalAtEntrance, tryTeleportThroughPortal, processPendingPortalTeleports, getPlayerFrontlineRow } from './portalSystem';
import { cleanupRoostedUnits, getRoostedUnits } from './buildingRemoval';
import { isUnitOnCorruptedTile } from './tileStatusSystem';
import { applyUnitDamage, getUnitDamageOutcome } from './unitDamage';
import { processInfestedFactionTurn } from './infestedSystem';
import { isCounterThemeUnitType, pickUnitFromTheme, scoreCountersForPlayer } from './waveThemeSystem';
import { isSpecialistEffectActive } from './specialistSystem';
import {
  AiTraceCollector,
  TERM_CODES,
  finalizeTraceTerms,
  getActionCode,
  getBuildingFactionCode,
  getDominantTraceTerm,
  getOutcomeBitMask,
  getStopCode,
  pushCandidate,
  type AiThreatEntry,
  type AiTraceChunk,
  type AiTraceIndexSeed,
  type MoveStopReason,
  type TraceTerm,
} from './aiTrace';

// ============================================================================
// ID GENERATION
// ============================================================================

let enemyIdCounter = 0;

function generateEnemyId(): string {
  return `enemy_unit_${Date.now()}_${++enemyIdCounter}`;
}

function getPlayerFrontmostStrongholdRow(state: Draft<GameState>): number {
  let frontline: number = MAP.GRID_HEIGHT;
  for (const building of Object.values(state.buildings)) {
    if (
      building.faction === Faction.PLAYER &&
      building.type === BuildingType.STRONGHOLD &&
      building.position.y < frontline
    ) {
      frontline = building.position.y;
      if (frontline === 0) break;
    }
  }
  return frontline;
}

// ============================================================================
// AI TYPES (local to this module)
// ============================================================================

export const ENEMY_ACTION_TYPES = [
  'ATTACK_UNIT',
  'RANGED_ATTACK_UNIT',
  'ATTACK_BUILDING',
  'RANGED_ATTACK_BUILDING',
  'INTERCEPT_CAPTOR',
  'CAPTURE_BUILDING',
  'CONTEST_BUILDING',
  'RETAKE_BUILDING',
  'DEFEND_ENEMY_BUILDING',
  'PROTECT_SPAWNER',
  'PUSH_TO_STRONGHOLD',
  'PUSH_TO_ZONE_EDGE',
  'SPREAD_TO_FLANK',
  'MOVE_TO_PLAYER_BUILDING',
  'MOVE_TO_NEUTRAL_BUILDING',
  'MOVE_TO_UNIT',
  'ADVANCE_TOWARD_LAVA',
  'FLANK_UNIT',
  'SACRIFICE_TO_LAVA',
  'CORRUPT_TERRAIN',
  'BUILD_LAVA_LAIR',
  'BUILD_INFERNAL_SANCTUM',
  'MOVE_TO_SAFE_RANGED_POSITION',
  'EXPLODE',
  'MOVE_TO_PORTAL',
  'HOLD_POSITION',
] as const;

export type EnemyActionType = typeof ENEMY_ACTION_TYPES[number];

interface ScoredAction {
  type: EnemyActionType;
  score: number;
  targetUnitId?: string;
  targetBuildingId?: string;
  targetPosition?: Position;
  /** Portal ID tagged on MOVE_TO_PORTAL actions for intent tracking. */
  portalIntentId?: string;
  traceTerms?: TraceTerm[];
}

export type { ScoredAction };

const T = TERM_CODES;

export interface MoveOutcome {
  steps: number;
  pathLen: number;
  stop: MoveStopReason;
  terr: string;
  bridgeSteps: number;
  slid: boolean;
}

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

  /** Raw count of Mage units. */
  mageCount: number;
  /** Raw count of Guard units. */
  guardCount: number;
  /** Count of units with base DEF > ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD. */
  highDefCount: number;
  /** Count of SUMMONED units (Ember Demons, Skeletons). */
  summonedCount: number;
  /** True if any unit has the BRANDMARKED tag. */
  brandmarkActive: boolean;
  /** Ratio of units with moveRange === 1 (static formation indicator). */
  staticRatio: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * @deprecated Use `edgeCircleDistance` from `rangeUtils.ts` instead.
 * Manhattan distance under-estimates reachability of diagonal targets by ~41%
 * compared to the 8-directional movement system.
 */
export function manhattanDistance(a: Position, b: Position): number {
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

function isPlayerUnitInDiscoverRadius(state: Draft<GameState>, building: Building): boolean {
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.PLAYER) continue;
    if (isTileWithinEdgeCircleRange(building.position.x, building.position.y, unit.position.x, unit.position.y, building.discoverRadius)) {
      return true;
    }
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Weighted sampling without replacement. Draws up to `count` distinct items
 * from `items` proportional to their weights. Returns the drawn items.
 */
function pickWeightedWithoutReplacement<T>(items: Array<{ item: T; weight: number }>, count: number): T[] {
  const pool = items.slice();
  const result: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * totalWeight;
    let pickedIdx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) { pickedIdx = j; break; }
    }
    result.push(pool[pickedIdx].item);
    pool.splice(pickedIdx, 1);
  }
  return result;
}

const SPAWNER_TYPES: BuildingType[] = [BuildingType.BARRACKS, BuildingType.ARCHER_CAMP, BuildingType.RIDER_CAMP, BuildingType.SIEGE_CAMP, BuildingType.LAVALAIR, BuildingType.INFERNALSANCTUM];
const RESOURCE_TYPES: BuildingType[] = [BuildingType.MINE, BuildingType.DEEP_MINE, BuildingType.WOODCUTTER];

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
 * Returns true when a building on the given tile should block enemy unit movement.
 * Mirrors the rule used for player movement in getReachableTiles:
 *   - Any building with combatStats blocks movement, regardless of faction.
 *   - Neutral (unowned) watchtowers are the sole exception — they can be walked
 *     onto to initiate capture (which consumes the capturing unit).
 * Non-combat buildings (mines, barracks, etc.) of any faction remain passable.
 */
function isBlockedBuildingForEnemyMovement(state: Draft<GameState>, buildingId: string | null): boolean {
  if (buildingId === null) return false;
  const building = state.buildings[buildingId];
  if (!building) return false;
  if (building.combatStats === null) return false;
  // Neutral watchtowers are passable so they can be captured (capture consumes the unit)
  if (building.faction === null && building.type === BuildingType.WATCHTOWER) return false;
  return true;
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
      if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) {
        // Impassable terrain unless a bridge provides a crossable path
        if (!getBridgeAt(state, nx, ny) || !canTraverseEdge(state, x, y, nx, ny, false)) continue;
      }
      if (tile.unitId !== null || isBlockedBuildingForEnemyMovement(state, tile.buildingId)) continue;
      // Lava tiles ahead are valid sacrifice destinations — unit is not blocked
      if (tile.isLava) {
        if (ny > startY) return false;
        continue; // lava at same or lower Y — not a valid sacrifice destination, skip
      }
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

  // GRIMBEAK prefers SUMMONED targets.
  if (attacker.type === UnitType.GRIMBEAK && defender.tags.includes(UnitTag.SUMMONED)) {
    bonus += AI_SCORING.GRIMBEAK_SUMMONED_TARGET_BONUS;
  }

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

function applyTraceScoreAdjustment(candidate: ScoredAction, code: number, delta: number): void {
  if (!candidate.traceTerms) return;
  const terms = [...candidate.traceTerms, [code, delta] as TraceTerm];
  const normalized = finalizeTraceTerms(terms);
  candidate.score = normalized.score;
  candidate.traceTerms = normalized.terms;
}

const BFS_DIRECTIONS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Finds a path from `from` to `target` using BFS on the 8-directional grid.
 * Returns the full path as an ordered array of positions starting with the
 * first step (not including `from` itself), or an empty array if no path exists.
 *
 * Passability rules during BFS traversal:
 *   - Out-of-bounds tiles: impassable
 *   - Lava tiles: impassable UNLESS it is the target tile itself
 *   - isBlockedBuildingForEnemyMovement: impassable
 *   - Unit-occupied tiles: impassable UNLESS it is the target tile itself
 *
 * Treating unit-occupied tiles as impassable (except the target) ensures that
 * enemy units route diagonally around blocking units rather than planning a
 * straight path through them and then getting stuck on execution.
 */
function findBfsPath(
  from: Position,
  target: Position,
  state: Draft<GameState>,
): Position[] {
  if (from.x === target.x && from.y === target.y) return [];

  // Shuffle directions to avoid systematic directional bias (e.g. left-diagonal drift).
  const dirs = [...BFS_DIRECTIONS] as [number, number][];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  const fromKey = `${from.x},${from.y}`;
  const visited = new Set<string>();
  const prev = new Map<string, Position | null>();
  const queue: Position[] = [from];
  visited.add(fromKey);
  prev.set(fromKey, null);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const nkey = `${nx},${ny}`;
      if (visited.has(nkey)) continue;
      visited.add(nkey);
      const tile = state.grid[ny][nx];
      const isTarget = nx === target.x && ny === target.y;
      // CANYON / WATER tiles: impassable unless a bridge provides a directional crossing
      if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) {
        if (!getBridgeAt(state, nx, ny) || !canTraverseEdge(state, current.x, current.y, nx, ny, false)) continue;
      }
      if (tile.isLava && !isTarget) continue;
      if (isBlockedBuildingForEnemyMovement(state, tile.buildingId)) continue;
      if (tile.unitId !== null && !isTarget) continue;
      const next: Position = { x: nx, y: ny };
      prev.set(nkey, current);
      if (isTarget) {
        // Reconstruct path from target back to from
        const path: Position[] = [];
        let pos: Position | null = next;
        while (pos !== null) {
          const pKey: string = `${pos.x},${pos.y}`;
          if (pKey === fromKey) break;
          path.unshift(pos);
          pos = prev.get(pKey) ?? null;
        }
        return path;
      }
      queue.push(next);
    }
  }

  return [];
}

function alliedUnitsNear(pos: Position, radius: number, excludeId: string, state: Draft<GameState>): number {
  let count = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.ENEMY) continue;
    if (unit.id === excludeId) continue;
    if (edgeCircleDistance(unit.position.x, unit.position.y, pos.x, pos.y) <= radius) {
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
  const u = UNIT_DEFINITIONS[unitType];
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
      mageCount: 0, guardCount: 0, highDefCount: 0,
      summonedCount: 0, brandmarkActive: false, staticRatio: 0,
    };
  }

  let offensiveCount = 0, defensiveCount = 0;
  let offensiveSum = 0, defensiveSum = 0;
  let slowMeleeCount = 0, meleeCount = 0, fastCount = 0;
  let siegeCount = 0, rangedCount = 0;
  let mageCount = 0, guardCount = 0, highDefCount = 0;
  let summonedCount = 0;
  let brandmarkActive = false;
  let staticCount = 0;

  for (const unit of units) {
    const { off, def } = calcUnitScores(unit.type);
    const u = UNIT_DEFINITIONS[unit.type as UnitType];

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

    if (unit.type === UnitType.MAGE) mageCount++;
    if (unit.type === UnitType.GUARD) guardCount++;
    if (u.defense > ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD) highDefCount++;
    if (unit.tags.includes(UnitTag.SUMMONED)) summonedCount++;
    if (unit.tags.includes(UnitTag.BRANDMARKED)) brandmarkActive = true;
    if (u.moveRange === 1) staticCount++;
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
    mageCount,
    guardCount,
    highDefCount,
    summonedCount,
    brandmarkActive,
    staticRatio: staticCount / total,
  };
}

function createEnemyUnit(
  position: Position,
  unitType: UnitType,
  difficultyMult: number
): Unit {
  const baseHp: number = UNIT_DEFINITIONS[unitType].maxHp;
  const baseAttack: number = UNIT_DEFINITIONS[unitType].attack;
  const baseDefense: number = UNIT_DEFINITIONS[unitType].defense;

  const finalHp: number = Math.round(baseHp * difficultyMult);
  const finalAttack: number = Math.round(baseAttack * difficultyMult);
  const finalDefense: number = Math.round(baseDefense * difficultyMult);
  const tags: UnitTag[] = [...UNIT_DEFINITIONS[unitType].tags];

  const unit: Unit = {
    id: generateEnemyId(),
    type: unitType,
    faction: Faction.ENEMY,
    position: { ...position },
    stats: {
      maxHp: finalHp,
      currentHp: finalHp,
      attack: finalAttack,
      defense: finalDefense,
      moveRange: UNIT_DEFINITIONS[unitType].moveRange,
      discoverRadius: UNIT_DEFINITIONS[unitType].discoverRadius,
      triggerRange: UNIT_DEFINITIONS[unitType].triggerRange,
      movementActions: UNIT_DEFINITIONS[unitType].movementActions,
      attackRange: UNIT_DEFINITIONS[unitType].attackRange,
    },
    tags,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasConsumedGravestoneThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
  return applySpawnActionFlags(unit);
}

/**
 * Spawns enemy units each enemy turn using the global spawn budget system.
 * Pipeline:
 *   1. Decrement spawnCooldownRemaining on all enemy recruitment buildings (always).
 *   2. If frozen by Sanctum Collapse, return early without accruing budget.
 *   3. Compute eligible spawners (cooldown 0, tile free, not lava).
 *   4. Evaluate per-turn budget with ember scaling and contact-gated DDA relief.
 *   5. Advance the fractional accumulator; floor to get spawnsNow.
 *   6. Weight eligible spawners by distance to nearest player unit, pick spawnsNow.
 *   7. Spawn one unit per picked building and write the snapshot.
 *
 * See the SPAWN_BUDGET block comment in config/enemyAi.ts for tuning guidance.
 */
function spawnEnemyUnits(state: Draft<GameState>, events?: GameEvent[]): void {
  // Step 1: Decrement cooldowns unconditionally for all enemy recruitment buildings.
  // This ordering is intentional: cooldowns must tick even during a spawn freeze
  // so buildings are ready to spawn again as soon as the freeze ends.
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (!isRecruitmentBuilding(building)) continue;
    if (building.spawnCooldownRemaining > 0) building.spawnCooldownRemaining -= 1;
  }

  // Step 2: Freeze check - no budget accrues while frozen; otherwise the banked
  // debt would refund the removed pressure the moment the freeze ends.
  if (SANCTUM_COLLAPSE.SPAWN_FREEZE_TURNS > 0 &&
      state.spawnFreezeUntilTurn > 0 &&
      state.turn < state.spawnFreezeUntilTurn) {
    return;
  }

  // Step 3: Collect eligible spawners.
  const eligibleSpawners = Object.values(state.buildings).filter(
    (b) =>
      b.faction === Faction.ENEMY &&
      isRecruitmentBuilding(b) &&
      b.spawnCooldownRemaining === 0 &&
      state.grid[b.position.y][b.position.x].unitId === null &&
      !state.grid[b.position.y][b.position.x].isLava,
  );

  // Step 4: Compute budget.
  const playerUnits = Object.values(state.units).filter((u) => u.faction === Faction.PLAYER);
  const noPlayerUnits = playerUnits.length === 0;
  const frontlineRow = getPlayerFrontlineRow(state);
  const frontmostStrongholdRow = getPlayerFrontmostStrongholdRow(state);
  const noPlayerStrongholds = frontmostStrongholdRow === MAP.GRID_HEIGHT;
  const reliefReferenceRow = noPlayerStrongholds ? frontlineRow : frontmostStrongholdRow;
  const margin = state.lavaFrontRow - reliefReferenceRow;

  let contactActive = false;
  // Check if any enemy entity is within DDA_CONTACT_RANGE of any player entity.
  const enemyEntities: Array<{ x: number; y: number }> = [
    ...Object.values(state.units)
      .filter((u) => u.faction === Faction.ENEMY)
      .map((u) => ({ x: u.position.x, y: u.position.y })),
    ...Object.values(state.buildings)
      .filter((b) => b.faction === Faction.ENEMY)
      .map((b) => ({ x: b.position.x, y: b.position.y })),
  ];
  const playerEntities: Array<{ x: number; y: number }> = [
    ...playerUnits.map((u) => ({ x: u.position.x, y: u.position.y })),
    ...Object.values(state.buildings)
      .filter((b) => b.faction === Faction.PLAYER)
      .map((b) => ({ x: b.position.x, y: b.position.y })),
  ];
  if (playerEntities.length > 0) {
    outer: for (const e of enemyEntities) {
      for (const p of playerEntities) {
        if (isTileWithinEdgeCircleRange(e.x, e.y, p.x, p.y, SPAWN_BUDGET.DDA_CONTACT_RANGE)) {
          contactActive = true;
          break outer;
        }
      }
    }
  }

  const base = SPAWN_BUDGET.BASE_BUDGET;
  const emberTerm = state.ember * SPAWN_BUDGET.EMBER_BUDGET_PER_LEVEL;
  let ddaRelief = 0;
  if (contactActive && !noPlayerUnits) {
    ddaRelief = clamp(
      (margin - SPAWN_BUDGET.DDA_EXPECTED_MARGIN) * SPAWN_BUDGET.DDA_PER_ROW,
      SPAWN_BUDGET.DDA_MIN,
      0,
    );
  }
  const budget = clamp(base + emberTerm + ddaRelief, SPAWN_BUDGET.MIN_BUDGET, SPAWN_BUDGET.MAX_BUDGET);

  // Step 5: Accumulator update.
  const accumulatorBefore = state.spawnAccumulator;
  state.spawnAccumulator = Math.min(state.spawnAccumulator + budget, SPAWN_BUDGET.ACCUMULATOR_CAP);
  const spawnsNow = Math.min(Math.floor(state.spawnAccumulator), eligibleSpawners.length);
  state.spawnAccumulator -= spawnsNow;
  const accumulatorAfter = state.spawnAccumulator;

  // Step 6: Compute weights for eligible spawners.
  const spawnerCandidates: Array<{ item: Building; weight: number; distance: number }> = [];
  for (const building of eligibleSpawners) {
    let d = Infinity;
    for (const unit of playerUnits) {
      const dist = edgeCircleDistance(building.position.x, building.position.y, unit.position.x, unit.position.y);
      if (dist < d) d = dist;
    }
    let weight: number;
    if (noPlayerUnits) {
      weight = SPAWN_BUDGET.WEIGHT_MIN;
      d = Infinity;
    } else {
      const distW = clamp(
        SPAWN_BUDGET.WEIGHT_MAX - d * SPAWN_BUDGET.WEIGHT_DECAY_PER_TILE,
        SPAWN_BUDGET.WEIGHT_MIN,
        SPAWN_BUDGET.WEIGHT_MAX,
      );
      weight = distW * (isPlayerUnitInDiscoverRadius(state, building) ? SPAWN_BUDGET.WEIGHT_IN_RANGE_MULTIPLIER : 1);
    }
    spawnerCandidates.push({ item: building, weight, distance: d });
  }

  // Step 7: Pick spawnsNow distinct spawners by weight.
  const picked = new Set<string>();
  if (spawnsNow > 0) {
    const selected = pickWeightedWithoutReplacement(
      spawnerCandidates.map((c) => ({ item: c.item, weight: c.weight })),
      spawnsNow,
    );
    for (const b of selected) picked.add(b.id);
  }

  // Step 8: Spawn one unit per picked building.
  for (const building of eligibleSpawners) {
    if (!picked.has(building.id)) continue;

    const unitType: UnitType = pickUnitFromTheme(state, building);
    const spawnPosition: Position = { ...building.position };
    const unit = createEnemyUnit(spawnPosition, unitType, DIFFICULTY_MULTIPLIER[state.difficulty]);

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
    state.enemyUnitsSpawnedLastTurn += 1;

    if (events) {
      events.push({
        type: 'ENEMY_SPAWN',
        position: { ...spawnPosition },
        unit: unitSnapshot,
        buildingId: building.id,
      });
    }
  }

  // Step 9: Write snapshot.
  const snapshot: SpawnBudgetSnapshot = {
    base,
    emberTerm,
    margin,
    contactActive,
    ddaRelief,
    budget,
    accumulatorBefore,
    spawnsNow,
    accumulatorAfter,
    spawnerWeights: spawnerCandidates.map((c) => ({
      buildingId: c.item.id,
      distance: c.distance,
      weight: c.weight,
      picked: picked.has(c.item.id),
    })),
  };
  state.lastSpawnBudget = snapshot;
}

// ============================================================================
// LAVA_LAIR / INFERNAL_SANCTUM DYNAMIC RECRUITMENT
// ============================================================================

/**
 * Gets the zone number (1-5) for a given row position.
 * Zone 1 is at high Y (near lava), zone 5 is at low Y (far from lava).
 *
 * Zone numbering: Zone 1 = player side (south, high Y, lava-adjacent).
 * Zone 5 = enemy side (north, low Y). Higher zone number = closer to enemy stronghold.
 * Enemies advance by *decreasing* zone number; player advances by *increasing* zone number.
 */
function getZoneForRow(row: number): number {
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

function getTerrainTraceCode(tile: Tile, usedBridge: boolean): string {
  const terrainBase = usedBridge
    ? 'B'
    : tile.terrainType === TileType.PLAINS
      ? 'P'
      : tile.terrainType === TileType.FOREST
        ? 'F'
        : tile.terrainType === TileType.MOUNTAIN
          ? 'M'
          : tile.terrainType === TileType.CANYON
            ? 'C'
            : tile.terrainType === TileType.WATER
              ? 'W'
              : 'E';
  const statusSuffix = tile.status === TileStatus.FROZEN
    ? 'f'
    : tile.status === TileStatus.BURNING
      ? 'b'
      : tile.status === TileStatus.CORRUPTED
        ? 'c'
        : '';
  return `${terrainBase}${statusSuffix}`;
}

function countActualMoveTiles(from: Position, to: Position): number {
  return from.x === to.x && from.y === to.y ? 0 : edgeCircleDistance(from.x, from.y, to.x, to.y);
}

function getNearestDistance(
  from: Position,
  positions: Position[],
): number {
  if (positions.length === 0) return -1;
  let best = Infinity;
  for (const position of positions) {
    best = Math.min(best, edgeCircleDistance(from.x, from.y, position.x, position.y));
  }
  return Number.isFinite(best) ? best : -1;
}

function buildThreatBoard(state: Draft<GameState>): AiThreatEntry[] {
  const enemyUnits = Object.values(state.units).filter((unit) => unit.faction === Faction.ENEMY);
  const playerUnits = Object.values(state.units).filter((unit) => unit.faction === Faction.PLAYER);
  const threats: AiThreatEntry[] = [];
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    let adjacentPlayers = 0;
    for (const unit of playerUnits) {
      if (edgeCircleDistance(building.position.x, building.position.y, unit.position.x, unit.position.y) <= 1) {
        adjacentPlayers += 1;
      }
    }
    const captureInProgress = building.isBeingCapturedBy !== null || building.captureProgress > 0;
    if (adjacentPlayers === 0 && !captureInProgress) continue;
    let nearbyEnemies = 0;
    for (const unit of enemyUnits) {
      if (edgeCircleDistance(building.position.x, building.position.y, unit.position.x, unit.position.y) <= AI_TRACE.THREAT_RADIUS) {
        nearbyEnemies += 1;
      }
    }
    threats.push({
      b: building.id,
      ty: building.type,
      p: [building.position.x, building.position.y],
      adj: adjacentPlayers,
      cap: captureInProgress,
      near: nearbyEnemies,
      def: 0,
    });
  }
  return threats;
}

function buildTraceContext(
  unit: Unit,
  state: Draft<GameState>,
  trace: AiTraceCollector,
  threats: AiThreatEntry[],
): number[] {
  const playerUnits = Object.values(state.units).filter((candidate) => candidate.faction === Faction.PLAYER);
  const playerBuildings = Object.values(state.buildings).filter((candidate) => candidate.faction === Faction.PLAYER);
  let alliesNear = 0;
  for (const candidate of Object.values(state.units)) {
    if (candidate.id === unit.id || candidate.faction !== Faction.ENEMY) continue;
    if (edgeCircleDistance(unit.position.x, unit.position.y, candidate.position.x, candidate.position.y) <= AI_TRACE.ALLY_RADIUS) {
      alliesNear += 1;
    }
  }

  const tileBuildingId = state.grid[unit.position.y]?.[unit.position.x]?.buildingId ?? null;
  const tileBuilding = tileBuildingId ? state.buildings[tileBuildingId] ?? null : null;
  const tileBuildingIndex = tileBuilding ? trace.buildingIndex(tileBuilding.id, tileBuilding.type) : -1;
  const ownThreatDistance = getNearestDistance(
    unit.position,
    threats.map((entry) => ({ x: entry.p[0], y: entry.p[1] })),
  );

  return [
    getZoneForRow(unit.position.y),
    state.lavaFrontRow - unit.position.y,
    getNearestDistance(unit.position, playerUnits.map((candidate) => candidate.position)),
    getNearestDistance(unit.position, playerBuildings.map((candidate) => candidate.position)),
    alliesNear,
    tileBuildingIndex,
    getBuildingFactionCode(tileBuilding),
    ownThreatDistance,
  ];
}

function countThreatDefenders(
  rows: readonly number[][],
  threats: AiThreatEntry[],
  buildingIndexById: Map<string, number>,
): AiThreatEntry[] {
  const defendActionCodes = new Set([
    getActionCode('DEFEND_ENEMY_BUILDING'),
    getActionCode('CONTEST_BUILDING'),
    getActionCode('RETAKE_BUILDING'),
    getActionCode('PROTECT_SPAWNER'),
  ]);
  const interceptCode = getActionCode('INTERCEPT_CAPTOR');
  return threats.map((entry) => {
    const buildingIndex = buildingIndexById.get(entry.b) ?? -1;
    let defenders = 0;
    for (const row of rows) {
      if (defendActionCodes.has(row[3] as number) && row[12] === 2 && row[13] === buildingIndex) {
        defenders += 1;
        continue;
      }
      if (
        row[3] === interceptCode &&
        row[12] === 1 &&
        row[14] >= 0 &&
        edgeCircleDistance(entry.p[0], entry.p[1], row[14] as number, row[15] as number) <= 1
      ) {
        defenders += 1;
      }
    }
    return { ...entry, def: defenders };
  });
}

function determineDeathCause(bits: number): string {
  if (bits & getOutcomeBitMask(['EXPLODED'])) return 'EXPLODED';
  if (bits & getOutcomeBitMask(['SLID'])) return 'SLID';
  if (bits & getOutcomeBitMask(['TRAPPED'])) return 'TRAPPED';
  return 'DIED';
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

  // Ember-gated eligible unit types; Emberlings only spawn from Ember Nests
  const eligibleTypes: UnitType[] = (Object.entries(UNIT_DEFINITIONS) as [UnitType, { enemyUnlockEmber?: number }][])
    .filter(([, def]) => def.enemyUnlockEmber !== undefined && state.ember >= def.enemyUnlockEmber)
    .map(([type]) => type)
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
  const counterScoresByType = new Map<UnitType, number>(
    scoreCountersForPlayer(state, { zoneId: buildingZone }).map((entry) => [entry.type, entry.score]),
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
    if (isCounterThemeUnitType(unitType)) {
      const counterScore = counterScoresByType.get(unitType);
      // Counter-theme units eligible by ember are always scored by scoreCountersForPlayer with unlock lookahead coverage.
      if (counterScore === undefined) continue;
      score = counterScore;
      results.push({ type: unitType, score });
      continue;
    }

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
  tracing = false,
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
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, tx, ty);

      // ── BUILD_LAVA_LAIR on ruin tiles ──
      if (tile.isRuin) {
        const baseScore = AI_SCORING.BASE_BUILD_LAVA_LAIR;
        const distancePenalty = -AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;
        let score = baseScore + distancePenalty;

        // Bonus if no other LAVA_LAIR buildings exist within 4 tiles (encourages spread)
        const nearbyLavaLair = Object.values(state.buildings).some(
          b => b.type === BuildingType.LAVALAIR && edgeCircleDistance(b.position.x, b.position.y, tx, ty) <= 4,
        );
        const spreadBonus = !nearbyLavaLair ? 15 : 0;
        if (!nearbyLavaLair) {
          score += spreadBonus;
        }

        if (tracing) {
          pushCandidate(candidates, 'BUILD_LAVA_LAIR', [
            [T.BASE, baseScore],
            [T.DISTANCE, distancePenalty],
            [T.OTHER, spreadBonus],
          ], { targetPosition: { x: tx, y: ty } }, true);
        } else {
          candidates.push({ type: 'BUILD_LAVA_LAIR', score: Math.max(0, score), targetPosition: { x: tx, y: ty } });
        }
      }

      // ── BUILD_INFERNAL_SANCTUM on stronghold ruin tiles ──
      if (tile.isStrongholdRuin) {
        const baseScore = AI_SCORING.BASE_BUILD_LAVA_LAIR + 20;
        const distancePenalty = -AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;
        const score = baseScore + distancePenalty;
        if (tracing) {
          pushCandidate(candidates, 'BUILD_INFERNAL_SANCTUM', [
            [T.BASE, baseScore],
            [T.DISTANCE, distancePenalty],
          ], { targetPosition: { x: tx, y: ty } }, true);
        } else {
          candidates.push({ type: 'BUILD_INFERNAL_SANCTUM', score: Math.max(0, score), targetPosition: { x: tx, y: ty } });
        }
      }

      // ── CORRUPT_TERRAIN for CORRUPT tag units on FOREST/MOUNTAIN tiles ──
      if (unit.tags.includes(UnitTag.CORRUPT)) {
        if ((tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) && !tile.buildingId) {
          const baseScore = AI_SCORING.BASE_CORRUPT_TERRAIN;
          const distancePenalty = -AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;
          const score = baseScore + distancePenalty;
          if (tracing) {
            pushCandidate(candidates, 'CORRUPT_TERRAIN', [
              [T.BASE, baseScore],
              [T.DISTANCE, distancePenalty],
            ], { targetPosition: { x: tx, y: ty } }, true);
          } else {
            candidates.push({ type: 'CORRUPT_TERRAIN', score: Math.max(0, score), targetPosition: { x: tx, y: ty } });
          }
        }
      }
    }
  }
}

// ============================================================================
// ENEMY MOVEMENT HELPER
// ============================================================================

/**
 * Triggers PREVENTIVE_STRIKE overwatch for all player SIEGE units with the
 * PREVENTIVE_STRIKE tag. Called after an enemy unit moves to its new position.
 * Each siege unit fires at most once per enemy turn (tracked via
 * `preventiveStrikeFiredThisTurn`, reset at the start of every enemy turn).
 * Does NOT consume the siege unit's attack action — preventive strike is an
 * automatic reaction shot separate from the player's normal attack action.
 * Only fires when the enemy enters range (was outside range before the move).
 * No counter-attack is applied — this is a one-directional reaction shot.
 */
function triggerPreventiveStrike(
  state: Draft<GameState>,
  enemyUnitId: string,
  fromPosition: Position,
  events?: GameEvent[],
): void {
  const enemyUnit = state.units[enemyUnitId];
  if (!enemyUnit || enemyUnit.faction !== Faction.ENEMY) return;

  // Do not fire at enemies that are in fog of war — the player cannot see them.
  const enemyTile = state.grid[enemyUnit.position.y]?.[enemyUnit.position.x];
  if (!enemyTile?.isRevealed) return;

  const suppressFloaters = !!events;

  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.PLAYER) continue;
    if (!unit.tags.includes(UnitTag.PREVENTIVE_STRIKE)) continue;
    if (!state.units[enemyUnitId]) break; // enemy was destroyed by a previous overwatch shot

    // PREVENTIVE_STRIKE is suppressed when the siege unit stands on a CORRUPTED tile.
    if (isUnitOnCorruptedTile(state, unit.id)) continue;

    // Each siege unit fires at most once per enemy turn.
    if (unit.preventiveStrikeFiredThisTurn) continue;

    // Only fire if the enemy moved from outside this siege unit's range INTO range
    const wasInRange = isTileWithinEdgeCircleRange(
      unit.position.x, unit.position.y,
      fromPosition.x, fromPosition.y,
      unit.stats.attackRange,
    );
    if (wasInRange) continue; // enemy was already in range — not a range-entry event

    const isInRange = isTileWithinEdgeCircleRange(
      unit.position.x, unit.position.y,
      enemyUnit.position.x, enemyUnit.position.y,
      unit.stats.attackRange,
    );
    if (!isInRange) continue; // enemy is not in range after the move either

    const attackerId = unit.id;
    const defenderId = enemyUnitId;
    const attackerPos = { x: unit.position.x, y: unit.position.y };
    const defenderPos = { x: enemyUnit.position.x, y: enemyUnit.position.y };
    const defenderType = enemyUnit.type;
    // Capture pre-attack XP qualification so the event reflects what grantXp actually granted.
    const attackerCanReceiveXp = canGrantXp(unit.type, unit.xp);

    // Calculate one-directional Preventive Strike damage:
    // PREVENTIVE_STRIKE_DAMAGE_PERCENT% of the damage the siege unit would deal in a
    // normal attack against this specific enemy unit.
    const attackerCombatant = unitToCombatant(unit);
    const defenderCombatant = unitToCombatant(enemyUnit);
    const normalCombat = calculateCombatFromStats(attackerCombatant, defenderCombatant);
    const strikeRaw = normalCombat.defenderHpLost * (ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT / 100);
    const strikeDamage = Math.max(1, Math.round(strikeRaw));

    const defenderDamageOutcome = getUnitDamageOutcome(enemyUnit, strikeDamage);
    const defenderDead = defenderDamageOutcome.died;
    applyUnitDamage(enemyUnit, strikeDamage);

    // Update game stats
    state.gameStats.damageDealt += strikeDamage;

    if (defenderDead) {
      // Remove enemy from grid
      const defenderTile = state.grid[enemyUnit.position.y][enemyUnit.position.x];
      if (defenderTile.unitId === defenderId) {
        defenderTile.unitId = null;
      }
      delete state.units[defenderId];
      state.gameStats.unitsKilled += 1;
      // Grant XP to the siege unit for the kill
      grantXp(state, attackerId, XP.KILL_UNIT, suppressFloaters);
      // If the killed unit was a cave monster, remove its encounter entry
      if (defenderType === UnitType.CAVE_MONSTER) {
        state.activeCaveEncounters = state.activeCaveEncounters.filter(
          (e) => e.monsterId !== defenderId,
        );
      }
    } else {
      updateBerserkLatch(enemyUnit);
    }

    // Note: Preventive Strike does NOT consume the siege unit's attack action.
    // It fires at most once per enemy turn per siege unit (tracked via
    // preventiveStrikeFiredThisTurn, reset at the start of each enemy turn).
    // The siege unit deals damage but receives no counter-attack.
    unit.preventiveStrikeFiredThisTurn = true;

    if (events) {
      const attackerAfter = state.units[attackerId];
      const defenderAfter = state.units[defenderId];
      events.push({
        type: 'PLAYER_ATTACK',
        attackerId,
        defenderId,
        attackerPosition: attackerPos,
        defenderPosition: defenderPos,
        attackerHpLost: 0,
        defenderHpLost: strikeDamage,
        advancedToPosition: null,
        attackerXpGained: !defenderAfter && attackerAfter && attackerCanReceiveXp ? XP.KILL_UNIT : null,
        defenderXpGained: null,
      });
      if (!defenderAfter) {
        events.push({ type: 'UNIT_DEATH', unitId: defenderId, position: defenderPos, faction: Faction.ENEMY });
        // If the killed unit was a cave monster, trigger the specialist-draw event
        if (defenderType === UnitType.CAVE_MONSTER) {
          events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: defenderId });
        }
      }
    }
  }
}

/**
 * Triggers GARRISON_OVERWATCH for all player Watchtower/Outpost/Crystal Tower
 * buildings. When the GARRISON_OVERWATCH specialist effect is active, each such
 * building fires one overwatch shot at any enemy unit that moves from outside
 * into its attackRange, dealing PREVENTIVE_STRIKE_DAMAGE_PERCENT% of the
 * building's normal attack damage. Applies to flying enemies too.
 * Cap: once per building per enemy turn (reuses the preventiveStrikeFiredThisTurn
 * bookkeeping on buildings, reset at the start of each enemy turn).
 */
function triggerGarrisonOverwatch(
  state: Draft<GameState>,
  enemyUnitId: string,
  fromPosition: Position,
  events?: GameEvent[],
): void {
  if (!isSpecialistEffectActive(state, 'GARRISON_OVERWATCH')) return;

  const enemyUnit = state.units[enemyUnitId];
  if (!enemyUnit || enemyUnit.faction !== Faction.ENEMY) return;

  // Do not fire at enemies that are in fog of war — the player cannot see them.
  const enemyTile = state.grid[enemyUnit.position.y]?.[enemyUnit.position.x];
  if (!enemyTile?.isRevealed) return;

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (
      building.type !== BuildingType.WATCHTOWER &&
      building.type !== BuildingType.OUTPOST &&
      building.type !== BuildingType.CRYSTAL_TOWER
    ) continue;
    if (!building.combatStats) continue;
    if (building.isDisabledForTurns > 0) continue;
    if (!state.units[enemyUnitId]) break; // enemy destroyed by a previous overwatch shot

    // Each building fires at most once per enemy turn.
    if (building.preventiveStrikeFiredThisTurn) continue;

    const attackRange = building.combatStats.attackRange;

    // Only fire if the enemy moved from outside this building's range INTO range.
    const wasInRange = isTileWithinEdgeCircleRange(
      building.position.x, building.position.y,
      fromPosition.x, fromPosition.y,
      attackRange,
    );
    if (wasInRange) continue; // enemy was already in range — not a range-entry event

    const isInRange = isTileWithinEdgeCircleRange(
      building.position.x, building.position.y,
      enemyUnit.position.x, enemyUnit.position.y,
      attackRange,
    );
    if (!isInRange) continue; // enemy is not in range after the move either

    // Calculate overwatch damage: PREVENTIVE_STRIKE_DAMAGE_PERCENT% of the damage the
    // building would deal in normal combat against this specific enemy unit.
    const bCombatant = buildingToCombatant(building);
    if (!bCombatant) continue;
    const eCombatant = unitToCombatant(enemyUnit);
    const normalCombat = calculateCombatFromStats(bCombatant, eCombatant);
    const strikeRaw = normalCombat.defenderHpLost * (ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT / 100);
    const strikeDamage = Math.max(1, Math.round(strikeRaw));

    const buildingId = building.id;
    const defenderId = enemyUnitId;
    const buildingPos = { x: building.position.x, y: building.position.y };
    const defenderPos = { x: enemyUnit.position.x, y: enemyUnit.position.y };
    const defenderType = enemyUnit.type;

    const defenderDamageOutcome = getUnitDamageOutcome(enemyUnit, strikeDamage);
    const defenderDead = defenderDamageOutcome.died;
    applyUnitDamage(enemyUnit, strikeDamage);

    state.gameStats.damageDealt += strikeDamage;

    if (defenderDead) {
      // Remove the enemy unit from the grid.
      const defTile = state.grid[enemyUnit.position.y][enemyUnit.position.x];
      if (defTile.unitId === defenderId) {
        defTile.unitId = null;
      }
      delete state.units[defenderId];
      state.gameStats.unitsKilled += 1;
      // If the killed unit was a cave monster, remove its encounter entry
      if (defenderType === UnitType.CAVE_MONSTER) {
        state.activeCaveEncounters = state.activeCaveEncounters.filter(
          (e) => e.monsterId !== defenderId,
        );
      }
    } else {
      updateBerserkLatch(enemyUnit);
    }

    // Mark this building as having fired during the current enemy turn.
    building.preventiveStrikeFiredThisTurn = true;

    if (events) {
      const defenderAfter = state.units[defenderId];
      events.push({
        type: 'BUILDING_ATTACK',
        buildingId,
        defenderId,
        buildingPosition: buildingPos,
        defenderPosition: defenderPos,
        buildingHpLost: 0,
        defenderHpLost: strikeDamage,
        defenderXpGained: null,
      });
      if (!defenderAfter) {
        events.push({
          type: 'UNIT_DEATH',
          unitId: defenderId,
          position: defenderPos,
          faction: Faction.ENEMY,
        });
        // If the killed unit was a cave monster, trigger the specialist-draw event
        if (defenderType === UnitType.CAVE_MONSTER) {
          events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: defenderId });
        }
      }
    }
  }
}

function moveEnemyUnit(state: Draft<GameState>, unitId: string, targetPosition: Position, events?: GameEvent[]): void {
  const unit = state.units[unitId];
  if (!unit || unit.tags.includes(UnitTag.STONE_SKIN)) return;

  const from = { x: unit.position.x, y: unit.position.y };
  const oldTile = state.grid[unit.position.y][unit.position.x];
  const newTile = state.grid[targetPosition.y][targetPosition.x];

  // Occupancy ownership: never overwrite a tile owned by a different unit.
  if (newTile.unitId !== null && newTile.unitId !== unitId) {
    if (import.meta.env.DEV) {
      console.warn(
        `[enemyMove] unit ${unitId} cannot move to (${targetPosition.x}, ${targetPosition.y}) — tile is occupied by unit ${newTile.unitId}`,
      );
    }
    return;
  }

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
    const isSacrifice = unit.tags.includes(UnitTag.SACRIFICIAL);
    const sacrificePos = { x: targetPosition.x, y: targetPosition.y };
    destroyUnit(state, unitId, events);
    state.ember += 1;
    if (isSacrifice) {
      state.emberLevelSources.emberlingSacrifices += 1;
    } else {
      state.emberLevelSources.other += 1;
    }
    if (events) {
      events.push({
        type: 'EMBER_LEVEL_UP',
        position: sacrificePos,
        amount: 1,
        source: isSacrifice ? 'EMBERLING_SACRIFICE' : 'LAVA_DEATH',
      });
    }
    return;
  }

  // PREVENTIVE_STRIKE: player siege units with this tag fire at the newly moved unit
  // Pass fromPosition so the trigger can check for range-entry (not already in range)
  triggerPreventiveStrike(state, unitId, from, events);

  // GARRISON_OVERWATCH: player Watchtower/Outpost/Crystal Tower buildings fire at the
  // newly moved unit when the Watch Captain specialist effect is active.
  triggerGarrisonOverwatch(state, unitId, from, events);

  // GRAVE_TRAP / SCOUT_TRAP: check if the enemy unit landed on a player trap
  checkGraveTrapTrigger(state, unitId, events);
  checkScoutTrapTrigger(state, unitId, events);

  // PORTAL: check if the unit stepped onto a portal entrance.
  if (state.units[unitId]) {
    const movedUnit = state.units[unitId];
    const portal = getUsablePortalAtEntrance(state, movedUnit.position);
    if (portal && portal.casterId !== movedUnit.id) {
      // Sacrificial units are NOW allowed to use portals (Decision rework).
      tryTeleportThroughPortal(state, movedUnit.id, portal.id, events);
      // If exit was blocked, the unit is now waiting (pendingTeleportUnitId set).
      // The waiter will teleport automatically when the exit clears.
    }
  }

  // After this unit's movement, give other waiting units a chance to teleport
  // (this unit may have vacated a tile that was someone else's portal exit).
  processPendingPortalTeleports(state, events);

  // FROZEN tile: trigger the slippery slide mechanic (same as player units).
  // Re-fetch the unit — it must still be alive (not killed by a trap or other effect).
  // Skip slide if the unit has teleported away from the frozen tile (its position no longer
  // matches targetPosition — portal exit clears lastMovementDirection for the same reason).
  const unitAfterEffects = state.units[unitId];
  if (
    newTile.status === TileStatus.FROZEN &&
    unitAfterEffects &&
    !unitAfterEffects.tags.includes(UnitTag.FLYING) &&
    unitAfterEffects.position.x === targetPosition.x &&
    unitAfterEffects.position.y === targetPosition.y
  ) {
    const moveDx = targetPosition.x - from.x;
    const moveDy = targetPosition.y - from.y;
    const slideDirX = Math.sign(moveDx);
    const slideDirY = Math.sign(moveDy);
    const factionBeforeSlide = state.units[unitId]?.faction;
    // Normalise to a unit-step: enemy can move multiple tiles per step via moveEnemyUnitToward,
    // but the slide should always cover exactly one tile in the movement direction.
    resolveSlide(state, unitId, slideDirX, slideDirY);

    const unitAfterSlide = state.units[unitId];
    if (
      unitAfterSlide &&
      (unitAfterSlide.position.x !== targetPosition.x || unitAfterSlide.position.y !== targetPosition.y)
    ) {
      // Unit survived and slid to a new position: emit UNIT_KNOCKBACK so the event
      // queue drives the slide animation at the correct point in the turn replay.
      if (events) {
        events.push({
          type: 'UNIT_KNOCKBACK',
          unitId,
          fromPosition: targetPosition,
          toPosition: { x: unitAfterSlide.position.x, y: unitAfterSlide.position.y },
          isEnemy: true,
          faction: Faction.ENEMY,
        });
      }
    }

    if (!unitAfterSlide && factionBeforeSlide !== undefined) {
      // Unit was destroyed by the slide (lava / canyon / water): emit UNIT_KNOCKBACK
      // so the animation engine plays the slide before the death sequence.
      const deathTileX = targetPosition.x + slideDirX;
      const deathTileY = targetPosition.y + slideDirY;
      if (events) {
        events.push({
          type: 'UNIT_KNOCKBACK',
          unitId,
          fromPosition: targetPosition,
          toPosition: { x: deathTileX, y: deathTileY },
          isEnemy: true,
          faction: factionBeforeSlide,
        });
        events.push({
          type: 'UNIT_DEATH',
          unitId,
          position: { x: deathTileX, y: deathTileY },
          faction: factionBeforeSlide,
        });
      }
    }
  }
}

// ============================================================================
// MULTI-TILE MOVEMENT HELPER

/**
 * Moves an enemy unit up to its full moveRange toward a target position.
 * Uses BFS to find the optimal path around terrain and buildings.
 * Stops early if a unit is occupying the next tile or the unit is destroyed
 * (e.g., by lava). The path is computed once from the unit's current position;
 * a blocking unit that has since moved will be re-evaluated next turn.
 */
function moveEnemyUnitToward(
  state: Draft<GameState>,
  unitId: string,
  targetPosition: Position,
  events?: GameEvent[],
  recordTrace = false,
): MoveOutcome {
  const unit = state.units[unitId];
  if (!unit) {
    return { steps: 0, pathLen: 0, stop: 'NO_PATH', terr: '', bridgeSteps: 0, slid: false };
  }
  if (unit.position.x === targetPosition.x && unit.position.y === targetPosition.y) {
    unit.hasMovedThisTurn = true;
    return { steps: 0, pathLen: 0, stop: 'ALREADY_THERE', terr: '', bridgeSteps: 0, slid: false };
  }
  const moveRange = unit.stats.moveRange;
  const path = findBfsPath(unit.position, targetPosition, state);
  const terrainEntries: string[] = [];
  let bridgeSteps = 0;
  let steps = 0;
  let stop: MoveStopReason = path.length === 0 ? 'NO_PATH' : 'REACHED';
  let slid = false;

  for (let step = 0; step < Math.min(moveRange, path.length); step++) {
    const current = state.units[unitId];
    if (!current) {
      stop = 'DIED';
      break;
    }
    const nextPos = path[step];
    const fromPos = { x: current.position.x, y: current.position.y };
    if (SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS > 0) {
      const nextZone = getZoneForRow(nextPos.y);
      const currentZone = getZoneForRow(state.units[unitId].position.y);
      if (
        nextZone < currentZone &&
        state.zoneLockoutUntilTurn[nextZone] !== undefined &&
        state.turn < (state.zoneLockoutUntilTurn[nextZone] ?? 0)
      ) {
        stop = 'ZONE_LOCKOUT';
        break;
      }
    }
    const tile = state.grid[nextPos.y][nextPos.x];
    if (tile.unitId !== null) {
      stop = 'BLOCKED_UNIT';
      break;
    }
    const usedBridge = !!getBridgeAt(state, nextPos.x, nextPos.y) && canTraverseEdge(state, fromPos.x, fromPos.y, nextPos.x, nextPos.y, false);
    moveEnemyUnit(state, unitId, nextPos, events);
    if (recordTrace) {
      terrainEntries.push(getTerrainTraceCode(tile, usedBridge));
      if (usedBridge) bridgeSteps += 1;
    }
    steps += 1;
    const afterMove = state.units[unitId];
    if (!afterMove) {
      stop = 'DIED';
      if (recordTrace && tile.status === TileStatus.FROZEN) {
        const slidePos = {
          x: nextPos.x + Math.sign(nextPos.x - fromPos.x),
          y: nextPos.y + Math.sign(nextPos.y - fromPos.y),
        };
        const slideTile = state.grid[slidePos.y]?.[slidePos.x];
        if (slideTile) {
          terrainEntries.push(getTerrainTraceCode(slideTile, !!getBridgeAt(state, slidePos.x, slidePos.y)));
          steps += 1;
        }
      }
      break;
    }
    if (afterMove.position.x !== nextPos.x || afterMove.position.y !== nextPos.y) {
      stop = 'SLID';
      slid = true;
      const slideTile = state.grid[afterMove.position.y]?.[afterMove.position.x];
      if (recordTrace && slideTile) {
        const slidViaBridge = !!getBridgeAt(state, afterMove.position.x, afterMove.position.y);
        terrainEntries.push(getTerrainTraceCode(slideTile, slidViaBridge));
        if (slidViaBridge) bridgeSteps += 1;
      }
      steps += 1;
      break;
    }
    if (step === path.length - 1) {
      stop = 'REACHED';
    } else if (step === moveRange - 1 && path.length > moveRange) {
      stop = 'RANGE';
    }
  }

  if (path.length > 0 && moveRange === 0 && steps === 0) {
    stop = 'RANGE';
  }

  if (path.length === 0) {
    const uFallback = state.units[unitId];
    if (
      uFallback &&
      (uFallback.position.x !== targetPosition.x || uFallback.position.y !== targetPosition.y)
    ) {
      let bestDist = Infinity;
      const fallbackCandidates: Position[] = [];
      for (const [dx, dy] of BFS_DIRECTIONS) {
        const nx = uFallback.position.x + dx;
        const ny = uFallback.position.y + dy;
        if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
        const nTile = state.grid[ny][nx];
        if (nTile.terrainType === TileType.CANYON || nTile.terrainType === TileType.WATER) {
          if (!getBridgeAt(state, nx, ny) || !canTraverseEdge(state, uFallback.position.x, uFallback.position.y, nx, ny, false)) continue;
        }
        if (nTile.isLava) continue;
        if (isBlockedBuildingForEnemyMovement(state, nTile.buildingId)) continue;
        if (nTile.unitId !== null) continue;
        if (SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS > 0) {
          const nextZone = getZoneForRow(ny);
          const curZone = getZoneForRow(uFallback.position.y);
          if (
            nextZone < curZone &&
            state.zoneLockoutUntilTurn[nextZone] !== undefined &&
            state.turn < (state.zoneLockoutUntilTurn[nextZone] ?? 0)
          ) continue;
        }
        const dist = edgeCircleDistance(nx, ny, targetPosition.x, targetPosition.y);
        if (dist < bestDist) {
          bestDist = dist;
          fallbackCandidates.length = 0;
          fallbackCandidates.push({ x: nx, y: ny });
        } else if (dist === bestDist) {
          fallbackCandidates.push({ x: nx, y: ny });
        }
      }
      if (fallbackCandidates.length > 0) {
        const chosen = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
        const fromPos = { x: uFallback.position.x, y: uFallback.position.y };
        const fallbackTile = state.grid[chosen.y][chosen.x];
        const usedBridge = !!getBridgeAt(state, chosen.x, chosen.y) && canTraverseEdge(state, fromPos.x, fromPos.y, chosen.x, chosen.y, false);
        moveEnemyUnit(state, unitId, chosen, events);
        steps = Math.max(steps, 1);
        stop = 'FALLBACK';
        if (recordTrace) {
          terrainEntries.push(getTerrainTraceCode(fallbackTile, usedBridge));
          if (usedBridge) bridgeSteps += 1;
          const afterFallback = state.units[unitId];
          if (!afterFallback) {
            stop = 'DIED';
          } else if (afterFallback.position.x !== chosen.x || afterFallback.position.y !== chosen.y) {
            stop = 'SLID';
            slid = true;
            const slideTile = state.grid[afterFallback.position.y]?.[afterFallback.position.x];
            if (slideTile) {
              const slidViaBridge = !!getBridgeAt(state, afterFallback.position.x, afterFallback.position.y);
              terrainEntries.push(getTerrainTraceCode(slideTile, slidViaBridge));
              if (slidViaBridge) bridgeSteps += 1;
            }
            steps += 1;
          }
        } else {
          const afterFallback = state.units[unitId];
          if (!afterFallback) {
            stop = 'DIED';
          } else if (afterFallback.position.x !== chosen.x || afterFallback.position.y !== chosen.y) {
            stop = 'SLID';
            slid = true;
            steps += countActualMoveTiles(chosen, afterFallback.position);
          }
        }
      }
    }
  }

  const unitAfterLoop = state.units[unitId];
  if (unitAfterLoop) unitAfterLoop.hasMovedThisTurn = true;
  return {
    steps,
    pathLen: path.length,
    stop,
    terr: recordTrace ? terrainEntries.join('') : '',
    bridgeSteps,
    slid,
  };
}

function buildDirectMoveOutcome(
  state: Draft<GameState>,
  unitId: string,
  from: Position,
  intendedTarget: Position,
): MoveOutcome {
  const enteredTiles: string[] = [];
  const enteredTile = state.grid[intendedTarget.y]?.[intendedTarget.x];
  const usedBridge = !!enteredTile && !!getBridgeAt(state, intendedTarget.x, intendedTarget.y) &&
    canTraverseEdge(state, from.x, from.y, intendedTarget.x, intendedTarget.y, false);
  if (enteredTile) {
    enteredTiles.push(getTerrainTraceCode(enteredTile, usedBridge));
  }

  const unitAfter = state.units[unitId];
  if (!unitAfter) {
    return {
      steps: 1,
      pathLen: 1,
      stop: 'DIED',
      terr: enteredTiles.join(''),
      bridgeSteps: usedBridge ? 1 : 0,
      slid: false,
    };
  }

  if (unitAfter.position.x !== intendedTarget.x || unitAfter.position.y !== intendedTarget.y) {
    const slideTile = state.grid[unitAfter.position.y]?.[unitAfter.position.x];
    if (slideTile) {
      enteredTiles.push(getTerrainTraceCode(slideTile, !!getBridgeAt(state, unitAfter.position.x, unitAfter.position.y)));
    }
    return {
      steps: 1 + countActualMoveTiles(intendedTarget, unitAfter.position),
      pathLen: 1,
      stop: 'SLID',
      terr: enteredTiles.join(''),
      bridgeSteps: (usedBridge ? 1 : 0) + (slideTile && getBridgeAt(state, unitAfter.position.x, unitAfter.position.y) ? 1 : 0),
      slid: true,
    };
  }

  return {
    steps: countActualMoveTiles(from, unitAfter.position),
    pathLen: 1,
    stop: 'REACHED',
    terr: enteredTiles.join(''),
    bridgeSteps: usedBridge ? 1 : 0,
    slid: false,
  };
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

  const unitConfig = UNIT_DEFINITIONS[unit.type as UnitType] as { explosionDamage?: number };
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

  // Apply flat damage to each target; abort silently if no adjacent player units
  // exist — the unit should not self-destruct for nothing.
  if (targets.length === 0) return;
  const deathEvents: GameEvent[] = [];
  for (const targetId of targets) {
    const target = state.units[targetId];
    if (!target) continue;

    const damageOutcome = applyUnitDamage(target, explosionDamage);
    updateBerserkLatch(target);
    damagedUnitIds.push(targetId);
    // Track damage received by player
    state.gameStats.damageReceived += explosionDamage;

    if (damageOutcome.died) {
      const deathPos = { x: target.position.x, y: target.position.y };
      const deathFaction = target.faction;
      // Remove unit
      const tile = state.grid[target.position.y][target.position.x];
      if (tile.unitId === targetId) {
        tile.unitId = null;
      }
      delete state.units[targetId];
      state.gameStats.unitsLost += 1;
      // Collect death event — will be pushed AFTER the EXPLOSION event so
      // the explosion VFX plays before dying animations.
      deathEvents.push({
        type: 'UNIT_DEATH',
        unitId: targetId,
        position: deathPos,
        faction: deathFaction,
      });
    }
  }

  // Emit explosion event FIRST so VFX plays before any dying animations.
  events.push({
    type: 'EXPLOSION',
    unitId,
    position: unitPos,
    damagedUnitIds,
    damagePerUnit: explosionDamage,
  });

  // Now push UNIT_DEATH events for killed targets.
  for (const e of deathEvents) {
    events.push(e);
  }

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

  // Explosion may have freed portal exit tiles; resolve any waiting teleports.
  processPendingPortalTeleports(state, events);
}

// ============================================================================
// SCORING FUNCTION
// ============================================================================

// The enemy AI derives its own canAttackThisTurn inline because it is a
// self-contained AI pipeline. Player-facing action availability rules
// (including all UnitTag checks for player units) live in unitActions.ts.
function scoreActionsForUnit(
  unit: Unit,
  state: Draft<GameState>,
  targetingIntents: Map<string, number>,
  recentlyLostBuildingIds: Set<string>,
  portalUsageIntents: Map<string, number>,
  tracing = false,
): ScoredAction[] {
  const candidates: ScoredAction[] = [];
  const triggerRange = unit.stats.triggerRange;
  const attackRange = unit.stats.attackRange;
  // PREP tag prevents attacking after moving; PASSIVE tag prevents attacking entirely
  const canAttackThisTurn = !hasUnitActed(unit, state) && !(unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP)) && !unit.tags.includes(UnitTag.PASSIVE);

  // Gather player units in trigger range
  const playerUnitsInTriggerRange: Unit[] = [];
  for (const u of Object.values(state.units)) {
    if (u.faction !== Faction.PLAYER) continue;
    if (u.stats.currentHp <= 0) continue; // skip 0-HP BRANDMARKED units mid-transform
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
  const legallyAttackablePlayerUnitsInRange = Object.values(state.units).filter((target) =>
      target.stats.currentHp > 0
      && isAttackableEnemyUnit(target, unit.faction, state.grid)
      && isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        target.position.x, target.position.y,
        attackRange,
      ));
  const attackablePlayerUnitsInRange = getTauntRestrictedAttackTargets(
    legallyAttackablePlayerUnitsInRange,
    playerUnitsInAttackRange,
  );

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
      captors.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const target = captors[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
      const combatScore = projectCombatScore(unit, target);
      const saturation = saturationPenalty(target.id, targetingIntents);
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const score = AI_SCORING.BASE_INTERCEPT_CAPTOR
        + distancePenalty
        + combatScore
        + AI_SCORING.BONUS_PLAYER_CAPTURING
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'INTERCEPT_CAPTOR', [
          [T.BASE, AI_SCORING.BASE_INTERCEPT_CAPTOR],
          [T.DISTANCE, distancePenalty],
          [T.COMBAT, combatScore],
          [T.THREAT, AI_SCORING.BONUS_PLAYER_CAPTURING],
          [T.SATURATION, -saturation],
        ], { targetUnitId: target.id, targetPosition: target.position }, true);
      } else {
        candidates.push({ type: 'INTERCEPT_CAPTOR', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
      }
    }
  }

  // ── CAPTURE_BUILDING ──
  if (!hasUnitActed(unit, state) && !unit.hasMovedThisTurn && unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
    const tile = state.grid[unit.position.y][unit.position.x];
    if (tile.buildingId) {
      const building = state.buildings[tile.buildingId];
      // Exclude buildings that consume the capturing unit (e.g. watchtowers) — they must be attacked/destroyed instead
      if (building && building.faction !== Faction.ENEMY && !building.consumesUnitOnCapture) {
        const baseScore = AI_SCORING.BASE_CAPTURE_BUILDING;
        const buildingValue = baseScore * buildingValueMultiplier(building.type);
        const buildingValueBonus = buildingValue - baseScore;
        const saturation = saturationPenalty(building.id, targetingIntents);
        const score = buildingValue - saturation;
        if (tracing) {
          pushCandidate(candidates, 'CAPTURE_BUILDING', [
            [T.BASE, baseScore],
            [T.BUILDING_VALUE, buildingValueBonus],
            [T.SATURATION, -saturation],
          ], { targetBuildingId: building.id, targetPosition: building.position }, true);
        } else {
          candidates.push({ type: 'CAPTURE_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
        }
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
      contestable.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = contestable[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      const baseScore = AI_SCORING.BASE_CONTEST_BUILDING;
      const buildingValue = baseScore * buildingValueMultiplier(building.type);
      const buildingValueBonus = buildingValue - baseScore;
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const capturingBonus = building.isBeingCapturedBy ? AI_SCORING.BONUS_PLAYER_CAPTURING : 0;
      const saturation = saturationPenalty(building.id, targetingIntents);
      const score = buildingValue
        + distancePenalty
        + AI_SCORING.BONUS_PLAYER_ON_BUILDING
        + capturingBonus
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'CONTEST_BUILDING', [
          [T.BASE, baseScore],
          [T.BUILDING_VALUE, buildingValueBonus],
          [T.DISTANCE, distancePenalty],
          [T.THREAT, AI_SCORING.BONUS_PLAYER_ON_BUILDING + capturingBonus],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: building.id, targetPosition: building.position }, true);
      } else {
        candidates.push({ type: 'CONTEST_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── RETAKE_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const retakeable = allBuildings.filter(b => recentlyLostBuildingIds.has(b.id));
    if (retakeable.length > 0) {
      retakeable.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = retakeable[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      const baseScore = AI_SCORING.BASE_RETAKE_BUILDING;
      const buildingValue = baseScore * buildingValueMultiplier(building.type);
      const buildingValueBonus = buildingValue - baseScore;
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const saturation = saturationPenalty(building.id, targetingIntents);
      const score = buildingValue
        + distancePenalty
        + AI_SCORING.BONUS_RECENT_LOSS
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'RETAKE_BUILDING', [
          [T.BASE, baseScore],
          [T.BUILDING_VALUE, buildingValueBonus],
          [T.DISTANCE, distancePenalty],
          [T.THREAT, AI_SCORING.BONUS_RECENT_LOSS],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: building.id, targetPosition: building.position }, true);
      } else {
        candidates.push({ type: 'RETAKE_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── ATTACK_UNIT ──
  if (canAttackThisTurn && attackablePlayerUnitsInRange.length > 0) {
    let bestTarget: Unit | null = null;
    let bestCombatScore = -Infinity;
    for (const target of attackablePlayerUnitsInRange) {
      const cs = projectCombatScore(unit, target);
      if (cs > bestCombatScore) {
        bestCombatScore = cs;
        bestTarget = target;
      }
    }
    if (bestTarget) {
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, bestTarget.position.x, bestTarget.position.y);
      const combatScore = projectCombatScore(unit, bestTarget);
      const saturation = saturationPenalty(bestTarget.id, targetingIntents);
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const score = AI_SCORING.BASE_ATTACK_UNIT
        + distancePenalty
        + combatScore
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'ATTACK_UNIT', [
          [T.BASE, AI_SCORING.BASE_ATTACK_UNIT],
          [T.DISTANCE, distancePenalty],
          [T.COMBAT, combatScore],
          [T.SATURATION, -saturation],
        ], { targetUnitId: bestTarget.id, targetPosition: bestTarget.position }, true);
      } else {
        candidates.push({ type: 'ATTACK_UNIT', score: Math.max(0, score), targetUnitId: bestTarget.id, targetPosition: bestTarget.position });
      }
    }
  }

  // ── RANGED_ATTACK_UNIT ──
  if (canAttackThisTurn && unit.tags.includes(UnitTag.RANGED)) {
    const rangedTargets = attackablePlayerUnitsInRange.filter(u => edgeCircleDistance(unit.position.x, unit.position.y, u.position.x, u.position.y) > 1);
    if (rangedTargets.length > 0) {
      // PREP units that haven't moved yet: score each target individually and prefer uncounterable ones
      if (unit.tags.includes(UnitTag.PREP) && !unit.hasMovedThisTurn) {
        let bestTarget: Unit | null = null;
        let bestScore = -Infinity;
        for (const target of rangedTargets) {
          const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
          const uncounterable = target.stats.attackRange < distance;
          const combatScore = projectCombatScore(unit, target);
          const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
          const prepBonus = uncounterable ? AI_SCORING.BONUS_PREP_UNCOUNTERABLE_TARGET : 0;
          const saturation = saturationPenalty(target.id, targetingIntents);
          const score = AI_SCORING.BASE_RANGED_ATTACK_UNIT
            + distancePenalty
            + combatScore
            + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
            + prepBonus
            - saturation;
          if (score > bestScore) {
            bestScore = score;
            bestTarget = target;
          }
        }
        if (bestTarget) {
          const distance = edgeCircleDistance(unit.position.x, unit.position.y, bestTarget.position.x, bestTarget.position.y);
          const combatScore = projectCombatScore(unit, bestTarget);
          const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
          const prepBonus = bestTarget.stats.attackRange < distance ? AI_SCORING.BONUS_PREP_UNCOUNTERABLE_TARGET : 0;
          const saturation = saturationPenalty(bestTarget.id, targetingIntents);
          if (tracing) {
            pushCandidate(candidates, 'RANGED_ATTACK_UNIT', [
              [T.BASE, AI_SCORING.BASE_RANGED_ATTACK_UNIT],
              [T.DISTANCE, distancePenalty],
              [T.COMBAT, combatScore],
              [T.TAG, AI_SCORING.BONUS_RANGED_SAFE_ATTACK + prepBonus],
              [T.SATURATION, -saturation],
            ], { targetUnitId: bestTarget.id, targetPosition: bestTarget.position }, true);
          } else {
            candidates.push({ type: 'RANGED_ATTACK_UNIT', score: Math.max(0, bestScore), targetUnitId: bestTarget.id, targetPosition: bestTarget.position });
          }
        }
      } else {
        rangedTargets.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
        const target = rangedTargets[0];
        const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
        const combatScore = projectCombatScore(unit, target);
        const saturation = saturationPenalty(target.id, targetingIntents);
        const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
        const score = AI_SCORING.BASE_RANGED_ATTACK_UNIT
          + distancePenalty
          + combatScore
          + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
          - saturation;
        if (tracing) {
          pushCandidate(candidates, 'RANGED_ATTACK_UNIT', [
            [T.BASE, AI_SCORING.BASE_RANGED_ATTACK_UNIT],
            [T.DISTANCE, distancePenalty],
            [T.COMBAT, combatScore],
            [T.TAG, AI_SCORING.BONUS_RANGED_SAFE_ATTACK],
            [T.SATURATION, -saturation],
          ], { targetUnitId: target.id, targetPosition: target.position }, true);
        } else {
          candidates.push({ type: 'RANGED_ATTACK_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
        }
      }
    }
  }

  // ── MOVE_TO_SAFE_RANGED_POSITION ──
  // Only for ranged units that haven't moved yet and don't already have a safe ranged attack available
  if (unit.tags.includes(UnitTag.RANGED) && !unit.hasMovedThisTurn) {
    const safeRangedTargetsFromCurrent = canAttackThisTurn
      ? playerUnitsInAttackRange.filter(u => edgeCircleDistance(unit.position.x, unit.position.y, u.position.x, u.position.y) > 1)
      : [];
    if (safeRangedTargetsFromCurrent.length === 0) {
      // BFS to find all reachable tiles within moveRange
      const moveRange = unit.stats.moveRange;
      const reachableTiles: Position[] = [];
      const bfsVisited = new Set<string>();
      const bfsQueue: Array<{ x: number; y: number; steps: number }> = [
        { x: unit.position.x, y: unit.position.y, steps: 0 },
      ];
      bfsVisited.add(`${unit.position.x},${unit.position.y}`);
      let bfsHead = 0;
      while (bfsHead < bfsQueue.length) {
        const { x, y, steps } = bfsQueue[bfsHead++];
        if (steps >= moveRange) continue;
        for (const [dx, dy] of BFS_DIRECTIONS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
          const nkey = `${nx},${ny}`;
          if (bfsVisited.has(nkey)) continue;
          bfsVisited.add(nkey);
          const tile = state.grid[ny][nx];
          if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) {
            // Allow if a bridge exists and the direction is valid
            if (!getBridgeAt(state, nx, ny) || !canTraverseEdge(state, x, y, nx, ny, false)) continue;
          }
          if (tile.isLava) continue;
          if (isBlockedBuildingForEnemyMovement(state, tile.buildingId)) continue;
          if (tile.unitId !== null) continue; // must be unoccupied to land on
          reachableTiles.push({ x: nx, y: ny });
          bfsQueue.push({ x: nx, y: ny, steps: steps + 1 });
        }
      }

      // Gather all player units for adjacency and target checks
      const allPlayerUnits = Object.values(state.units).filter(u => u.faction === Faction.PLAYER);

      let bestPairScore = -Infinity;
      let bestPairTile: Position | null = null;
      let bestPairTarget: Unit | null = null;

      // Also track the best safe-only tile (no attack required) for a pure retreat
      // fallback when no safe+attack pair is found but the archer is being melee'd.
      let bestSafeTile: Position | null = null;
      let bestSafeMinDist = -1;

      for (const dest of reachableTiles) {
        // Check no player unit at Chebyshev distance ≤ 1 from destination
        let adjacentPlayer = false;
        for (const pu of allPlayerUnits) {
          const cdx = Math.abs(pu.position.x - dest.x);
          const cdy = Math.abs(pu.position.y - dest.y);
          if (Math.max(cdx, cdy) <= 1) {
            adjacentPlayer = true;
            break;
          }
        }
        if (adjacentPlayer) continue;

        // Track the safe tile that is furthest from all player units (for pure retreat)
        let minDist = Infinity;
        for (const pu of allPlayerUnits) {
          const d = edgeCircleDistance(dest.x, dest.y, pu.position.x, pu.position.y);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestSafeMinDist) {
          bestSafeMinDist = minDist;
          bestSafeTile = dest;
        }

        // Find player units at edgeCircleDistance > 1 AND <= attackRange from destination
        for (const pu of allPlayerUnits) {
          const dist = edgeCircleDistance(dest.x, dest.y, pu.position.x, pu.position.y);
          if (dist <= 1 || dist > attackRange) continue;
          const cs = projectCombatScore(unit, pu);
          const { defenderHpLost } = calculateCombat(unit, pu);
          const kill = defenderHpLost >= pu.stats.currentHp;
          const pairScore = cs + (kill ? AI_SCORING.BONUS_SAFE_RANGED_KILL : 0);
          if (pairScore > bestPairScore) {
            bestPairScore = pairScore;
            bestPairTile = dest;
            bestPairTarget = pu;
          }
        }
      }

      if (bestPairTile && bestPairTarget) {
        const saturation = saturationPenalty(bestPairTarget.id, targetingIntents);
        const score = AI_SCORING.BASE_MOVE_TO_SAFE_RANGED_POSITION
          + bestPairScore
          - saturation;
        if (tracing) {
          pushCandidate(candidates, 'MOVE_TO_SAFE_RANGED_POSITION', [
            [T.BASE, AI_SCORING.BASE_MOVE_TO_SAFE_RANGED_POSITION],
            [T.COMBAT, bestPairScore],
            [T.SATURATION, -saturation],
          ], { targetUnitId: bestPairTarget.id, targetPosition: bestPairTile }, true);
        } else {
          candidates.push({
            type: 'MOVE_TO_SAFE_RANGED_POSITION',
            score: Math.max(0, score),
            targetUnitId: bestPairTarget.id,
            targetPosition: bestPairTile,
          });
        }
      } else if (bestSafeTile) {
        // No safe+attack pair was found. If the archer is currently adjacent to
        // a player unit it should still retreat to safety rather than attacking
        // melee. Generate a pure-retreat candidate so this action beats
        // ATTACK_UNIT in the normal case (no kill available).
        const isCurrentlyAdjacent = allPlayerUnits.some((pu) => {
          const cdx = Math.abs(pu.position.x - unit.position.x);
          const cdy = Math.abs(pu.position.y - unit.position.y);
          return Math.max(cdx, cdy) <= 1;
        });
        if (isCurrentlyAdjacent) {
          if (tracing) {
            pushCandidate(candidates, 'MOVE_TO_SAFE_RANGED_POSITION', [
              [T.BASE, AI_SCORING.BASE_RETREAT_FROM_ADJACENT],
            ], { targetPosition: bestSafeTile }, true);
          } else {
            candidates.push({
              type: 'MOVE_TO_SAFE_RANGED_POSITION',
              score: AI_SCORING.BASE_RETREAT_FROM_ADJACENT,
              targetPosition: bestSafeTile,
            });
          }
        }
      }
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
        const distance = edgeCircleDistance(unit.position.x, unit.position.y, bestBuilding.position.x, bestBuilding.position.y);
        const combatScore = projectBuildingCombatScore(unit, bestBuilding);
        const saturation = saturationPenalty(bestBuilding.id, targetingIntents);
        const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
        const score = AI_SCORING.BASE_ATTACK_BUILDING
          + distancePenalty
          + combatScore
          - saturation;
        if (tracing) {
          pushCandidate(candidates, 'ATTACK_BUILDING', [
            [T.BASE, AI_SCORING.BASE_ATTACK_BUILDING],
            [T.DISTANCE, distancePenalty],
            [T.COMBAT, combatScore],
            [T.SATURATION, -saturation],
          ], { targetBuildingId: bestBuilding.id, targetPosition: bestBuilding.position }, true);
        } else {
          candidates.push({ type: 'ATTACK_BUILDING', score: Math.max(0, score), targetBuildingId: bestBuilding.id, targetPosition: bestBuilding.position });
        }
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
      return edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y) > 1;
    });

    if (rangedBuildingTargets.length > 0) {
      rangedBuildingTargets.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const target = rangedBuildingTargets[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
      const combatScore = projectBuildingCombatScore(unit, target);
      const saturation = saturationPenalty(target.id, targetingIntents);
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const score = AI_SCORING.BASE_RANGED_ATTACK_BUILDING
        + distancePenalty
        + combatScore
        + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'RANGED_ATTACK_BUILDING', [
          [T.BASE, AI_SCORING.BASE_RANGED_ATTACK_BUILDING],
          [T.DISTANCE, distancePenalty],
          [T.COMBAT, combatScore],
          [T.TAG, AI_SCORING.BONUS_RANGED_SAFE_ATTACK],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: target.id, targetPosition: target.position }, true);
      } else {
        candidates.push({ type: 'RANGED_ATTACK_BUILDING', score: Math.max(0, score), targetBuildingId: target.id, targetPosition: target.position });
      }
    }
  }

  // ── DEFEND_ENEMY_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const defendable = buildingsInTriggerRange.filter(b => {
      if (b.faction !== Faction.ENEMY) return false;
      if (isRecruitmentBuilding(b)) return false;
      for (const u of Object.values(state.units)) {
        if (u.faction !== Faction.PLAYER) continue;
        if (edgeCircleDistance(u.position.x, u.position.y, b.position.x, b.position.y) <= 3) return true;
      }
      return false;
    });

    if (defendable.length > 0) {
      defendable.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = defendable[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      const isUndefended = alliedUnitsNear(building.position, 3, unit.id, state) === 0;
      const baseScore = AI_SCORING.BASE_DEFEND_ENEMY_BUILDING;
      const buildingValue = baseScore * buildingValueMultiplier(building.type);
      const buildingValueBonus = buildingValue - baseScore;
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const undefendedBonus = isUndefended ? AI_SCORING.BONUS_UNDEFENDED_BUILDING : 0;
      const saturation = saturationPenalty(building.id, targetingIntents);
      const score = buildingValue
        + distancePenalty
        + undefendedBonus
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'DEFEND_ENEMY_BUILDING', [
          [T.BASE, baseScore],
          [T.BUILDING_VALUE, buildingValueBonus],
          [T.DISTANCE, distancePenalty],
          [T.THREAT, undefendedBonus],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: building.id, targetPosition: building.position }, true);
      } else {
        candidates.push({ type: 'DEFEND_ENEMY_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── PROTECT_SPAWNER ──
  if (!unit.hasMovedThisTurn) {
    const spawners = buildingsInTriggerRange.filter(b => {
      if (b.faction !== Faction.ENEMY) return false;
      if (!isRecruitmentBuilding(b)) return false;
      for (const u of Object.values(state.units)) {
        if (u.faction !== Faction.PLAYER) continue;
        if (edgeCircleDistance(u.position.x, u.position.y, b.position.x, b.position.y) <= 5) return true;
      }
      return false;
    });

    if (spawners.length > 0) {
      spawners.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = spawners[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      const isUndefended = alliedUnitsNear(building.position, 3, unit.id, state) === 0;
      const baseScore = AI_SCORING.BASE_PROTECT_SPAWNER;
      const buildingValue = baseScore * AI_SCORING.BUILDING_VALUE_SPAWNER;
      const buildingValueBonus = buildingValue - baseScore;
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const undefendedBonus = isUndefended ? AI_SCORING.BONUS_UNDEFENDED_BUILDING : 0;
      const saturation = saturationPenalty(building.id, targetingIntents);
      const score = buildingValue
        + distancePenalty
        + undefendedBonus
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'PROTECT_SPAWNER', [
          [T.BASE, baseScore],
          [T.BUILDING_VALUE, buildingValueBonus],
          [T.DISTANCE, distancePenalty],
          [T.THREAT, undefendedBonus],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: building.id, targetPosition: building.position }, true);
      } else {
        candidates.push({ type: 'PROTECT_SPAWNER', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── PUSH_TO_STRONGHOLD ──
  if (!unit.hasMovedThisTurn) {
    const playerStrongholds = allBuildings.filter(b => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER);
    if (playerStrongholds.length > 0) {
      playerStrongholds.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = playerStrongholds[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      // If a player unit is standing on the stronghold and the enemy is already within its attack
      // range, suppress this action so attack actions take priority instead.
      // Melee units have attackRange === 1 (adjacent only); ranged units have attackRange > 1.
      // Using attackRange directly handles both cases without special-casing.
      const strongholdTile = state.grid[building.position.y][building.position.x];
      const playerUnitOnStronghold = strongholdTile.unitId != null
        && state.units[strongholdTile.unitId]?.faction === Faction.PLAYER;
      if (!(playerUnitOnStronghold && distance <= attackRange)) {
        const baseScore = AI_SCORING.BASE_PUSH_TO_STRONGHOLD;
        const buildingValue = baseScore * AI_SCORING.BUILDING_VALUE_STRONGHOLD;
        const buildingValueBonus = buildingValue - baseScore;
        const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
        const saturation = saturationPenalty(building.id, targetingIntents);
        const score = buildingValue
          + distancePenalty
          - saturation;
        if (tracing) {
          pushCandidate(candidates, 'PUSH_TO_STRONGHOLD', [
            [T.BASE, baseScore],
            [T.BUILDING_VALUE, buildingValueBonus],
            [T.DISTANCE, distancePenalty],
            [T.SATURATION, -saturation],
          ], { targetBuildingId: building.id, targetPosition: building.position }, true);
        } else {
          candidates.push({ type: 'PUSH_TO_STRONGHOLD', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
        }
      }
    }
  }

  // ── MOVE_TO_PLAYER_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const playerBuildings = buildingsInTriggerRange.filter(b => b.faction === Faction.PLAYER && b.type !== BuildingType.STRONGHOLD);
    if (playerBuildings.length > 0) {
      playerBuildings.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = playerBuildings[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      const baseScore = AI_SCORING.BASE_MOVE_TO_PLAYER_BUILDING;
      const buildingValue = baseScore * buildingValueMultiplier(building.type);
      const buildingValueBonus = buildingValue - baseScore;
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const saturation = saturationPenalty(building.id, targetingIntents);
      const score = buildingValue
        + distancePenalty
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'MOVE_TO_PLAYER_BUILDING', [
          [T.BASE, baseScore],
          [T.BUILDING_VALUE, buildingValueBonus],
          [T.DISTANCE, distancePenalty],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: building.id, targetPosition: building.position }, true);
      } else {
        candidates.push({ type: 'MOVE_TO_PLAYER_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── MOVE_TO_NEUTRAL_BUILDING ──
  if (!unit.hasMovedThisTurn) {
    const neutralBuildings = buildingsInTriggerRange.filter(b => b.faction === null && b.type !== BuildingType.MARKET);
    if (neutralBuildings.length > 0) {
      neutralBuildings.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = neutralBuildings[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
      const baseScore = AI_SCORING.BASE_MOVE_TO_NEUTRAL_BUILDING;
      const buildingValue = baseScore * buildingValueMultiplier(building.type);
      const buildingValueBonus = buildingValue - baseScore;
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const saturation = saturationPenalty(building.id, targetingIntents);
      const score = buildingValue
        + distancePenalty
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'MOVE_TO_NEUTRAL_BUILDING', [
          [T.BASE, baseScore],
          [T.BUILDING_VALUE, buildingValueBonus],
          [T.DISTANCE, distancePenalty],
          [T.SATURATION, -saturation],
        ], { targetBuildingId: building.id, targetPosition: building.position }, true);
      } else {
        candidates.push({ type: 'MOVE_TO_NEUTRAL_BUILDING', score: Math.max(0, score), targetBuildingId: building.id, targetPosition: building.position });
      }
    }
  }

  // ── MOVE_TO_UNIT ──
  if (!unit.hasMovedThisTurn) {
    const outOfAttackRange = playerUnitsInTriggerRange.filter(u => !playerUnitsInAttackRange.includes(u));
    if (outOfAttackRange.length > 0) {
      // GRIMBEAK: sort summoned targets to the front so they are preferred when in range.
      const sorted = unit.type === UnitType.GRIMBEAK
        ? [...outOfAttackRange].sort((a, b) => {
            const aSummoned = a.tags.includes(UnitTag.SUMMONED) ? 1 : 0;
            const bSummoned = b.tags.includes(UnitTag.SUMMONED) ? 1 : 0;
            if (bSummoned !== aSummoned) return bSummoned - aSummoned;
            return edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y)
              - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y);
          })
        : [...outOfAttackRange].sort((a, b) =>
            edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y)
            - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y)
          );
      const target = sorted[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
      const { defenderHpLost } = calculateCombat(unit, target);
      const nextTurnKillBonus = defenderHpLost >= target.stats.currentHp ? AI_SCORING.KILL_BONUS * 0.5 : 0;
      const grimbeakSummonedBonus =
        unit.type === UnitType.GRIMBEAK && target.tags.includes(UnitTag.SUMMONED)
          ? AI_SCORING.GRIMBEAK_SUMMONED_TARGET_BONUS
          : 0;
      const saturation = saturationPenalty(target.id, targetingIntents);
      const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
      const score = AI_SCORING.BASE_MOVE_TO_UNIT
        + distancePenalty
        + nextTurnKillBonus
        + grimbeakSummonedBonus
        - saturation;
      if (tracing) {
        pushCandidate(candidates, 'MOVE_TO_UNIT', [
          [T.BASE, AI_SCORING.BASE_MOVE_TO_UNIT],
          [T.DISTANCE, distancePenalty],
          [T.COMBAT, nextTurnKillBonus],
          [T.TAG, grimbeakSummonedBonus],
          [T.SATURATION, -saturation],
        ], { targetUnitId: target.id, targetPosition: target.position }, true);
      } else {
        candidates.push({ type: 'MOVE_TO_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
      }
    }
  }

  // ── PUSH_TO_ZONE_EDGE ──
  if (!unit.hasMovedThisTurn) {
    const hasPlayerTargets = playerUnitsInTriggerRange.length > 0;
    const hasCapturable = buildingsInTriggerRange.some(b => (b.faction === null || b.faction === Faction.PLAYER) && b.type !== BuildingType.MARKET);
    if (!hasPlayerTargets && !hasCapturable) {
      if (tracing) {
        pushCandidate(candidates, 'PUSH_TO_ZONE_EDGE', [
          [T.BASE, AI_SCORING.BASE_PUSH_TO_ZONE_EDGE],
        ], {}, true);
      } else {
        candidates.push({ type: 'PUSH_TO_ZONE_EDGE', score: AI_SCORING.BASE_PUSH_TO_ZONE_EDGE });
      }
    }
  }

  // ── SPREAD_TO_FLANK ──
  // Steers idle units toward neutral buildings in columns with few allied units,
  // ensuring horizontal map coverage when no immediate threats exist.
  if (!unit.hasMovedThisTurn) {
    const triggerRangeIds = new Set(buildingsInTriggerRange.map(b => b.id));
    const outOfRangeNeutrals = Object.values(state.buildings).filter(b => {
      if (b.faction !== null) return false;
      if (b.type === BuildingType.MARKET) return false;
      return !triggerRangeIds.has(b.id);
    });

    if (outOfRangeNeutrals.length > 0) {
      let bestBuilding: Building | null = null;
      let bestScore = -Infinity;

      for (const building of outOfRangeNeutrals) {
        const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
        const alliesInColumn = Object.values(state.units).filter(
          u => u.faction === Faction.ENEMY && u.id !== unit.id && u.position.x === building.position.x,
        ).length;
        const score =
          AI_SCORING.BASE_SPREAD_TO_FLANK
          - distance * AI_SCORING.SPREAD_DISTANCE_PENALTY
          - alliesInColumn * AI_SCORING.SPREAD_COLUMN_COVERAGE_PENALTY
          - saturationPenalty(building.id, targetingIntents);
        if (score > bestScore) {
          bestScore = score;
          bestBuilding = building;
        }
      }

      if (bestBuilding && bestScore > 0) {
        const distance = edgeCircleDistance(unit.position.x, unit.position.y, bestBuilding.position.x, bestBuilding.position.y);
        const alliesInColumn = Object.values(state.units).filter(
          u => u.faction === Faction.ENEMY && u.id !== unit.id && u.position.x === bestBuilding.position.x,
        ).length;
        const saturation = saturationPenalty(bestBuilding.id, targetingIntents);
        if (tracing) {
          pushCandidate(candidates, 'SPREAD_TO_FLANK', [
            [T.BASE, AI_SCORING.BASE_SPREAD_TO_FLANK],
            [T.DISTANCE, -distance * AI_SCORING.SPREAD_DISTANCE_PENALTY],
            [T.ZONE, -alliesInColumn * AI_SCORING.SPREAD_COLUMN_COVERAGE_PENALTY],
            [T.SATURATION, -saturation],
          ], { targetBuildingId: bestBuilding.id, targetPosition: bestBuilding.position }, true);
        } else {
          candidates.push({
            type: 'SPREAD_TO_FLANK',
            score: bestScore,
            targetBuildingId: bestBuilding.id,
            targetPosition: bestBuilding.position,
          });
        }
      }
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
        const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
        const distancePenalty = -distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE;
        const score = AI_SCORING.BASE_FLANK_UNIT
          + distancePenalty;
        if (tracing) {
          pushCandidate(candidates, 'FLANK_UNIT', [
            [T.BASE, AI_SCORING.BASE_FLANK_UNIT],
            [T.DISTANCE, distancePenalty],
          ], { targetUnitId: target.id, targetPosition: target.position }, true);
        } else {
          candidates.push({ type: 'FLANK_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
        }
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
    const sacrificialBonus = unit.tags.includes(UnitTag.SACRIFICIAL) ? AI_SCORING.BONUS_SACRIFICIAL_ADVANCE_TOWARD_LAVA : 0;
    const score = AI_SCORING.BASE_ADVANCE_TOWARD_LAVA + sacrificialBonus;
    const lavaTarget: Position = { x: unit.position.x, y: Math.min(MAP.GRID_HEIGHT - 1, state.lavaFrontRow) };
    if (isBlockedFromLava) {
      // When blocked, target the nearest player unit to push through the blocker
      const playerUnits = Object.values(state.units).filter(u => u.faction === Faction.PLAYER);
      if (playerUnits.length > 0) {
        playerUnits.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
        if (tracing) {
          pushCandidate(candidates, 'ADVANCE_TOWARD_LAVA', [
            [T.BASE, AI_SCORING.BASE_ADVANCE_TOWARD_LAVA],
            [T.LAVA, sacrificialBonus],
          ], { targetPosition: playerUnits[0].position }, true);
        } else {
          candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: playerUnits[0].position });
        }
      } else {
        // No player units to push through — BFS will navigate around obstacles
        if (tracing) {
          pushCandidate(candidates, 'ADVANCE_TOWARD_LAVA', [
            [T.BASE, AI_SCORING.BASE_ADVANCE_TOWARD_LAVA],
            [T.LAVA, sacrificialBonus],
          ], { targetPosition: lavaTarget }, true);
        } else {
          candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: lavaTarget });
        }
      }
    } else {
      if (tracing) {
        pushCandidate(candidates, 'ADVANCE_TOWARD_LAVA', [
          [T.BASE, AI_SCORING.BASE_ADVANCE_TOWARD_LAVA],
          [T.LAVA, sacrificialBonus],
        ], { targetPosition: lavaTarget }, true);
      } else {
        candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: lavaTarget });
      }
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
      const sacrificialBonus = unit.tags.includes(UnitTag.SACRIFICIAL) ? AI_SCORING.BONUS_SACRIFICIAL_SACRIFICE_TO_LAVA : 0;
      const score = AI_SCORING.BASE_SACRIFICE_TO_LAVA + sacrificialBonus;
      if (tracing) {
        pushCandidate(candidates, 'SACRIFICE_TO_LAVA', [
          [T.BASE, AI_SCORING.BASE_SACRIFICE_TO_LAVA],
          [T.LAVA, sacrificialBonus],
        ], { targetPosition: adjacentLavaPos }, true);
      } else {
        candidates.push({ type: 'SACRIFICE_TO_LAVA', score, targetPosition: adjacentLavaPos });
      }
    }
  }

  // ── EXPLODE (EXPLOSIVE + SACRIFICIAL blocked, or pure EXPLOSIVE — reusable for any explosive unit) ──
  if (!hasUnitActed(unit, state) && unit.tags.includes(UnitTag.EXPLOSIVE)) {
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
        // Only award the big "blocked sacrificial" bonus once the unit has already moved this
        // turn — ensuring it tries to advance first and only explodes when truly stuck.
        const blockedBonus = (isSacrificial && isBlockedFromLava && unit.hasMovedThisTurn) ? AI_SCORING.BONUS_BLOCKED_SACRIFICIAL_EXPLODE : 0;
        if (tracing) {
          pushCandidate(candidates, 'EXPLODE', [
            [T.BASE, AI_SCORING.BASE_EXPLODE],
            [T.LAVA, blockedBonus],
          ], {}, true);
        } else {
          candidates.push({ type: 'EXPLODE', score: AI_SCORING.BASE_EXPLODE + blockedBonus });
        }
      }
    }
  }

  // ── CONSTRUCTION & CORRUPTION ──
  // scoreConstructionActions handles BUILD_LAVA_LAIR, BUILD_INFERNAL_SANCTUM, and CORRUPT_TERRAIN
  if (!hasUnitActed(unit, state) && !unit.hasMovedThisTurn) {
    scoreConstructionActions(unit, state, candidates, tracing);
  }

  // ── HOLD_POSITION ──
  if (tracing) {
    pushCandidate(candidates, 'HOLD_POSITION', [
      [T.BASE, AI_SCORING.BASE_HOLD_POSITION],
    ], {}, true);
  } else {
    candidates.push({ type: 'HOLD_POSITION', score: AI_SCORING.BASE_HOLD_POSITION });
  }

  // ── MOVE_TO_PORTAL ──
  // Add a strong incentive to step onto a portal entrance when the exit advances
  // this unit southward (toward the player) and the per-turn limit is not yet hit.
  if (!unit.hasMovedThisTurn) {
    for (const portal of Object.values(state.portals)) {
      // Caster never uses own portal.
      if (portal.casterId === unit.id) continue;
      // Skip if portal is no longer usable.
      if (state.turn < portal.createdTurn || state.turn > portal.lastUsableTurn) continue;
      // Skip if the portal exit is not south of the entrance (no advance value).
      if (portal.exitPos.y <= portal.entrancePos.y) continue;
      // Skip if usage limit for this turn is already hit.
      const usersThisTurn = portalUsageIntents.get(portal.id) ?? 0;
      if (usersThisTurn >= ABILITIES.EMBER_PORTAL_MAX_USERS_PER_TURN) continue;
      // Skip while another unit is already waiting on the entrance for the exit to clear.
      if (portal.pendingTeleportUnitId !== null && portal.pendingTeleportUnitId !== unit.id) continue;
      // Skip if the entrance tile is currently occupied by another unit.
      const entranceTile = state.grid[portal.entrancePos.y]?.[portal.entrancePos.x];
      if (!entranceTile) continue;
      if (entranceTile.unitId !== null && entranceTile.unitId !== unit.id) continue;

      // Check reachability using BFS path existence.
      const path = findBfsPath(unit.position, portal.entrancePos, state);
      if (path.length === 0 && (unit.position.x !== portal.entrancePos.x || unit.position.y !== portal.entrancePos.y)) continue;

      const distance = edgeCircleDistance(unit.position.x, unit.position.y, portal.entrancePos.x, portal.entrancePos.y);
      const score = ABILITIES.EMBER_PORTAL_BASE_USE_SCORE - (distance * ABILITIES.EMBER_PORTAL_DISTANCE_PENALTY);
      if (score <= 0) continue;

      if (tracing) {
        pushCandidate(candidates, 'MOVE_TO_PORTAL', [
          [T.PORTAL, ABILITIES.EMBER_PORTAL_BASE_USE_SCORE],
          [T.DISTANCE, -(distance * ABILITIES.EMBER_PORTAL_DISTANCE_PENALTY)],
        ], {
          targetPosition: portal.entrancePos,
          portalIntentId: portal.id,
        }, true);
      } else {
        candidates.push({
          type: 'MOVE_TO_PORTAL',
          score,
          targetPosition: portal.entrancePos,
          portalIntentId: portal.id,
        });
      }
    }
  }

  // ── Recruitment-building step penalty ──
  // Subtract a penalty from any movement candidate whose first step toward the
  // target would land on a friendly enemy recruitment building. This keeps
  // spawner tiles free so recruitment can proceed each turn.
  if (!unit.hasMovedThisTurn) {
    for (const candidate of candidates) {
      if (!candidate.targetPosition) continue;
      const bfsPath = findBfsPath(unit.position, candidate.targetPosition, state);
      if (bfsPath.length === 0) continue;
      const nextStep = bfsPath[0];
      const tile = state.grid[nextStep.y][nextStep.x];
      if (!tile.buildingId) continue;
      const b = state.buildings[tile.buildingId];
      if (b && b.faction === Faction.ENEMY && isRecruitmentBuilding(b)) {
        candidate.score = Math.max(0, candidate.score - AI_SCORING.PENALTY_STEP_ONTO_RECRUITMENT_BUILDING);
        if (tracing) {
          applyTraceScoreAdjustment(candidate, T.TERRAIN, -AI_SCORING.PENALTY_STEP_ONTO_RECRUITMENT_BUILDING);
        }
      }
    }
  }

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

function executeAction(
  unit: Unit,
  action: ScoredAction,
  state: Draft<GameState>,
  events?: GameEvent[],
  recordTrace = false,
): MoveOutcome | null {
  const currentUnit = state.units[unit.id];
  if (!currentUnit) return null;

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
          const attackerId = currentUnit.id;
          const defenderId = action.targetUnitId;
          const stateBeforeAction = current(state);
          const defenderTileStatusBefore = state.grid[defenderPos.y]?.[defenderPos.x]?.status;

          const secondaryEvents: GameEvent[] = [];
          const attackDamage = resolveAttack(state, attackerId, defenderId, suppressFloaters, secondaryEvents);

          if (events) {
            const attackerAfter = state.units[attackerId];
            const defenderAfter = state.units[defenderId];
            const advancedToPosition = (
              !defenderAfter &&
              attackerAfter &&
              (attackerAfter.position.x !== attackerPos.x || attackerAfter.position.y !== attackerPos.y)
            ) ? { x: attackerAfter.position.x, y: attackerAfter.position.y } : null;
            // Attacker earns XP for killing the defender; defender earns XP for a counter-kill.
            // Use pre-attack XP to mirror the grantXp early-return for MAX_LEVEL units.
            const attackerCanReceiveXp = canGrantXp(stateBeforeAction.units[attackerId]?.type ?? '', stateBeforeAction.units[attackerId]?.xp ?? 0);
            const defenderCanReceiveXp = canGrantXp(stateBeforeAction.units[defenderId]?.type ?? '', stateBeforeAction.units[defenderId]?.xp ?? 0);
            const attackerXpGained = !defenderAfter && attackerAfter && attackerCanReceiveXp ? XP.KILL_UNIT : null;
            const defenderXpGained = !attackerAfter && defenderCanReceiveXp ? XP.KILL_UNIT : null;
            const defenderSpawnBrandmarkReplacement = targetUnit.tags.includes(UnitTag.BRANDMARKED);
            const attackerSpawnBrandmarkReplacement = currentUnit.tags.includes(UnitTag.BRANDMARKED);
            const defenderBrandmarkSpawnPosition = defenderSpawnBrandmarkReplacement
              ? detectBrandmarkSpawnPos(state, stateBeforeAction, defenderPos)
              : null;
            const attackerBrandmarkSpawnPosition = attackerSpawnBrandmarkReplacement
              ? detectBrandmarkSpawnPos(state, stateBeforeAction, attackerPos)
              : null;
            const tileBurningPosition = (
              defenderTileStatusBefore !== TileStatus.BURNING &&
              state.grid[defenderPos.y]?.[defenderPos.x]?.status === TileStatus.BURNING
            ) ? { ...defenderPos } : undefined;
            events.push({
              type: 'ENEMY_ATTACK',
              attackerId,
              defenderId,
              attackerPosition: attackerPos,
              defenderPosition: defenderPos,
              attackerHpLost: attackDamage?.attackerDamage ?? 0,
              defenderHpLost: attackDamage?.defenderDamage ?? 0,
              advancedToPosition,
              attackerXpGained,
              defenderXpGained,
              tileBurningPosition,
            });
            // Emit UNIT_KNOCKBACK before the defender's UNIT_DEATH so the animation
            // engine can animate the push before the death sequence.
            const knockbackDefEvt = secondaryEvents.find(
              (e): e is Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }> =>
                e.type === 'UNIT_KNOCKBACK' && (e as Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }>).unitId === defenderId,
            );
            const remainingSecEvts = secondaryEvents.filter(
              (e) => !(e.type === 'UNIT_KNOCKBACK' && (e as Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }>).unitId === defenderId),
            );
            if (knockbackDefEvt) events.push(knockbackDefEvt);
            if (!defenderAfter) {
              events.push({
                type: 'UNIT_DEATH',
                unitId: defenderId,
                position: knockbackDefEvt ? knockbackDefEvt.toPosition : defenderPos,
                faction: targetUnit.faction,
                brandmarkSpawnPosition: defenderBrandmarkSpawnPosition,
              });
            }
            if (!attackerAfter) {
              events.push({
                type: 'UNIT_DEATH',
                unitId: attackerId,
                position: attackerPos,
                faction: currentUnit.faction,
                brandmarkSpawnPosition: attackerBrandmarkSpawnPosition,
              });
            }
            events.push(...remainingSecEvts);
          }
        } else if (!currentUnit.hasMovedThisTurn) {
          return moveEnemyUnitToward(state, currentUnit.id, targetUnit.position, events, recordTrace);
        }
      }
      break;
    }

    case 'RANGED_ATTACK_UNIT': {
      if (action.targetUnitId && state.units[action.targetUnitId]) {
        const targetUnit = state.units[action.targetUnitId];
        const attackerPos = { x: currentUnit.position.x, y: currentUnit.position.y };
        const defenderPos = { x: targetUnit.position.x, y: targetUnit.position.y };
        const attackerId = currentUnit.id;
        const defenderId = action.targetUnitId;
        const stateBeforeAction = current(state);
        const defenderTileStatusBefore = state.grid[defenderPos.y]?.[defenderPos.x]?.status;

        const secondaryEvents: GameEvent[] = [];
        const attackDamage = resolveAttack(state, attackerId, defenderId, suppressFloaters, secondaryEvents);

        if (events) {
          const attackerAfter = state.units[attackerId];
          const defenderAfter = state.units[defenderId];
          // Use pre-attack XP to mirror the grantXp early-return for MAX_LEVEL units.
          const attackerCanReceiveXp = canGrantXp(stateBeforeAction.units[attackerId]?.type ?? '', stateBeforeAction.units[attackerId]?.xp ?? 0);
          const defenderCanReceiveXp = canGrantXp(stateBeforeAction.units[defenderId]?.type ?? '', stateBeforeAction.units[defenderId]?.xp ?? 0);
          const attackerXpGained = !defenderAfter && attackerAfter && attackerCanReceiveXp ? XP.KILL_UNIT : null;
          const defenderXpGained = !attackerAfter && defenderCanReceiveXp ? XP.KILL_UNIT : null;
          const defenderSpawnBrandmarkReplacement = targetUnit.tags.includes(UnitTag.BRANDMARKED);
          const attackerSpawnBrandmarkReplacement = currentUnit.tags.includes(UnitTag.BRANDMARKED);
          const defenderBrandmarkSpawnPosition = defenderSpawnBrandmarkReplacement
            ? detectBrandmarkSpawnPos(state, stateBeforeAction, defenderPos)
            : null;
          const attackerBrandmarkSpawnPosition = attackerSpawnBrandmarkReplacement
            ? detectBrandmarkSpawnPos(state, stateBeforeAction, attackerPos)
            : null;
          const tileBurningPosition = (
            defenderTileStatusBefore !== TileStatus.BURNING &&
            state.grid[defenderPos.y]?.[defenderPos.x]?.status === TileStatus.BURNING
          ) ? { ...defenderPos } : undefined;
          events.push({
            type: 'ENEMY_ATTACK',
            attackerId,
            defenderId,
            attackerPosition: attackerPos,
            defenderPosition: defenderPos,
            attackerHpLost: attackDamage?.attackerDamage ?? 0,
            defenderHpLost: attackDamage?.defenderDamage ?? 0,
            advancedToPosition: null,
            attackerXpGained,
            defenderXpGained,
            tileBurningPosition,
          });
          // Emit UNIT_KNOCKBACK before the defender's UNIT_DEATH so the animation
          // engine can animate the push before the death sequence.
          const knockbackDefEvt2 = secondaryEvents.find(
            (e): e is Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }> =>
              e.type === 'UNIT_KNOCKBACK' && (e as Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }>).unitId === defenderId,
          );
          const remainingSecEvts2 = secondaryEvents.filter(
            (e) => !(e.type === 'UNIT_KNOCKBACK' && (e as Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }>).unitId === defenderId),
          );
          if (knockbackDefEvt2) events.push(knockbackDefEvt2);
          if (!defenderAfter) {
            events.push({
              type: 'UNIT_DEATH',
              unitId: defenderId,
              position: knockbackDefEvt2 ? knockbackDefEvt2.toPosition : defenderPos,
              faction: targetUnit.faction,
              brandmarkSpawnPosition: defenderBrandmarkSpawnPosition,
            });
          }
          if (!attackerAfter) {
            events.push({
              type: 'UNIT_DEATH',
              unitId: attackerId,
              position: attackerPos,
              faction: currentUnit.faction,
              brandmarkSpawnPosition: attackerBrandmarkSpawnPosition,
            });
          }
          events.push(...remainingSecEvts2);
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
            const buildingHpBefore = building.hp;
            const attackerId = currentUnit.id;
            const buildingId = action.targetBuildingId;

            // Collect any life-bound units (e.g. Crystal Drake) BEFORE the attack
            // so we can emit UNIT_DEATH events if the building is destroyed.
            const roosted = events ? getRoostedUnits(state, buildingId) : [];
            const secondaryEvents: GameEvent[] = [];
            const attackDamage = resolveAttackOnBuilding(state, attackerId, buildingId, suppressFloaters, secondaryEvents);

            if (events) {
              const attackerAfter = state.units[attackerId];
              const buildingAfter = state.buildings[buildingId];
              // Detect melee advance: attacker's position changed after the kill.
              const advancedToPosition = (
                !buildingAfter &&
                attackerAfter &&
                (attackerAfter.position.x !== attackerPos.x || attackerAfter.position.y !== attackerPos.y)
              ) ? { x: attackerAfter.position.x, y: attackerAfter.position.y } : null;
              // Enemy attackers don't earn XP for killing player buildings via resolveAttackOnBuilding.
              events.push({
                type: 'UNIT_ATTACK_BUILDING',
                attackerId,
                buildingId,
                attackerPosition: attackerPos,
                buildingPosition: buildingPos,
                attackerHpLost: attackDamage?.attackerDamage ?? 0,
                buildingHpLost: buildingAfter ? buildingHpBefore - buildingAfter.hp : buildingHpBefore,
                advancedToPosition,
              });
              if (!attackerAfter) {
                events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
              }
              events.push(...secondaryEvents);
              // Emit UNIT_DEATH for any life-bound drakes so the auto-cam tracks them.
              if (!buildingAfter && roosted.length > 0) {
                for (const death of roosted) {
                  events.push({
                    type: 'UNIT_DEATH',
                    unitId: death.unitId,
                    position: death.position,
                    faction: death.faction,
                  });
                }
              }
            }
          } else if (!currentUnit.hasMovedThisTurn) {
            return moveEnemyUnitToward(state, currentUnit.id, building.position, events, recordTrace);
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
          // Collect any life-bound units (e.g. Crystal Drake) BEFORE the capture so we
          // can emit their UNIT_DEATH events *after* BUILDING_CAPTURE in the queue —
          // that way the auto-camera pans to their death position at the right moment.
          const roosted = events && building ? getRoostedUnits(state, building.id) : [];
          initiateCapture(state, currentUnit.id, action.targetBuildingId, suppressFloaters);
          if (events && capturedPosition && capturedType) {
            events.push({
              type: 'BUILDING_CAPTURE',
              buildingId: action.targetBuildingId,
              position: capturedPosition,
              newFaction: currentUnit.faction,
              buildingType: capturedType,
              xpGained: XP.CAPTURE_BUILDING,
            });
            // Emit drake deaths after the cave's own event so narrative order is correct.
            for (const death of roosted) {
              events.push({
                type: 'UNIT_DEATH',
                unitId: death.unitId,
                position: death.position,
                faction: death.faction,
              });
            }
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
    case 'MOVE_TO_NEUTRAL_BUILDING':
    case 'SPREAD_TO_FLANK': {
      if (action.targetPosition) {
        return moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events, recordTrace);
      }
      break;
    }

    case 'MOVE_TO_UNIT':
    case 'FLANK_UNIT': {
      if (action.targetPosition) {
        return moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events, recordTrace);
      }
      break;
    }

    case 'MOVE_TO_SAFE_RANGED_POSITION': {
      if (action.targetPosition && !currentUnit.hasMovedThisTurn) {
        const from = { x: currentUnit.position.x, y: currentUnit.position.y };
        moveEnemyUnit(state, currentUnit.id, action.targetPosition, events);
        return recordTrace ? buildDirectMoveOutcome(state, currentUnit.id, from, action.targetPosition) : null;
      }
      break;
    }

    case 'ADVANCE_TOWARD_LAVA': {
      const lavaTarget: Position = action.targetPosition ?? {
        x: currentUnit.position.x,
        y: Math.min(MAP.GRID_HEIGHT - 1, currentUnit.position.y + currentUnit.stats.moveRange),
      };
      return moveEnemyUnitToward(state, currentUnit.id, lavaTarget, events, recordTrace);
    }

    case 'SACRIFICE_TO_LAVA': {
      // Move the unit into the adjacent lava tile; moveEnemyUnit handles lava entry
      // (emits ENEMY_MOVE event, destroys the unit, and increments threat level).
      if (action.targetPosition) {
        const from = { x: currentUnit.position.x, y: currentUnit.position.y };
        moveEnemyUnit(state, currentUnit.id, action.targetPosition, events);
        return recordTrace ? buildDirectMoveOutcome(state, currentUnit.id, from, action.targetPosition) : null;
      } else {
        // Fallback: destroy in place (should not normally happen)
        const fallbackPos = { x: currentUnit.position.x, y: currentUnit.position.y };
        destroyUnit(state, currentUnit.id, events);
        state.ember += 1;
        state.emberLevelSources.emberlingSacrifices += 1;
        if (events) {
          events.push({
            type: 'EMBER_LEVEL_UP',
            position: fallbackPos,
            amount: 1,
            source: 'EMBERLING_SACRIFICE',
          });
        }
      }
      return null;
    }

    case 'PUSH_TO_ZONE_EDGE': {
      const playerBuildings = Object.values(state.buildings).filter(b => b.faction === Faction.PLAYER);
      let targetY = Math.min(MAP.GRID_HEIGHT - 1, currentUnit.position.y + currentUnit.stats.moveRange);
      if (playerBuildings.length > 0) {
        targetY = Math.min(MAP.GRID_HEIGHT - 1, Math.max(...playerBuildings.map(b => b.position.y)));
      }
      const targetPos: Position = { x: currentUnit.position.x, y: targetY };
      return moveEnemyUnitToward(state, currentUnit.id, targetPos, events, recordTrace);
    }

    case 'BUILD_LAVA_LAIR': {
      if (action.targetPosition) {
        const isOnTile = currentUnit.position.x === action.targetPosition.x && currentUnit.position.y === action.targetPosition.y;
        if (isOnTile) {
          enemyConstructBuilding(state, currentUnit.id, action.targetPosition, BuildingType.LAVALAIR, suppressFloaters);
        } else if (!currentUnit.hasMovedThisTurn) {
          return moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events, recordTrace);
        }
      }
      break;
    }

    case 'BUILD_INFERNAL_SANCTUM': {
      if (action.targetPosition) {
        const isOnTile = currentUnit.position.x === action.targetPosition.x && currentUnit.position.y === action.targetPosition.y;
        if (isOnTile) {
          enemyConstructBuilding(state, currentUnit.id, action.targetPosition, BuildingType.INFERNALSANCTUM, suppressFloaters);
        } else if (!currentUnit.hasMovedThisTurn) {
          return moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events, recordTrace);
        }
      }
      break;
    }

    case 'CORRUPT_TERRAIN': {
      if (action.targetPosition) {
        const isOnTile = currentUnit.position.x === action.targetPosition.x && currentUnit.position.y === action.targetPosition.y;
        if (isOnTile) {
          // Unit is on the terrain tile — corrupt it
          corruptTerrain(state, currentUnit.id, action.targetPosition, events ?? undefined);
          currentUnit.hasConstructedThisTurn = true;
        } else if (!currentUnit.hasMovedThisTurn) {
          // Move 1 step toward the terrain tile
          return moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events, recordTrace);
        }
      }
      break;
    }

    case 'EXPLODE': {
      resolveExplosion(state, currentUnit.id, events ?? []);
      return null;
    }

    case 'HOLD_POSITION':
      break;

    case 'MOVE_TO_PORTAL': {
      if (action.targetPosition && !currentUnit.hasMovedThisTurn) {
        return moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events, recordTrace);
      }
      break;
    }
  }
  return null;
}

// ============================================================================
// DECISION LOOP
// ============================================================================

function decideAndExecute(
  unit: Unit,
  state: Draft<GameState>,
  targetingIntents: Map<string, number>,
  recentlyLostBuildingIds: Set<string>,
  portalUsageIntents: Map<string, number>,
  events?: GameEvent[],
  trace?: AiTraceCollector,
  slot = 1,
  threats: AiThreatEntry[] = [],
): void {
  // All units go through the unified scoring — tag-based behaviors
  // (EXPLOSIVE, SACRIFICIAL, etc.) are handled within scoreActionsForUnit
  const tracing = !!trace;
  const candidates = scoreActionsForUnit(unit, state, targetingIntents, recentlyLostBuildingIds, portalUsageIntents, tracing);

  candidates.sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  if (!chosen) return;

  // Register intent for saturation tracking
  const intentKey = chosen.targetUnitId ?? chosen.targetBuildingId ?? null;
  if (intentKey) {
    targetingIntents.set(intentKey, (targetingIntents.get(intentKey) ?? 0) + 1);
  }

  // Register portal usage intent for per-turn usage tracking
  if (chosen.type === 'MOVE_TO_PORTAL' && chosen.portalIntentId) {
    portalUsageIntents.set(chosen.portalIntentId, (portalUsageIntents.get(chosen.portalIntentId) ?? 0) + 1);
  }

  if (!trace) {
    executeAction(unit, chosen, state, events, false);
    return;
  }

  const beforeUnit = state.units[unit.id];
  if (!beforeUnit) return;
  const from = { x: beforeUnit.position.x, y: beforeUnit.position.y };
  const ownHpBefore = beforeUnit.stats.currentHp;
  const targetUnitBefore = chosen.targetUnitId ? state.units[chosen.targetUnitId] : null;
  const targetBuildingBefore = chosen.targetBuildingId ? state.buildings[chosen.targetBuildingId] : null;
  let targetKind: 0 | 1 | 2 | 3 = 0;
  let targetIndex = -1;
  let targetPosition: Position | null = null;
  let targetDistance = -1;
  let targetHpBefore: number | null = null;
  if (targetUnitBefore) {
    targetKind = 1;
    targetIndex = trace.unitIndex(targetUnitBefore);
    targetPosition = { x: targetUnitBefore.position.x, y: targetUnitBefore.position.y };
    targetDistance = edgeCircleDistance(from.x, from.y, targetPosition.x, targetPosition.y);
    targetHpBefore = targetUnitBefore.stats.currentHp;
  } else if (targetBuildingBefore) {
    targetKind = 2;
    targetIndex = trace.buildingIndex(targetBuildingBefore.id, targetBuildingBefore.type);
    targetPosition = { x: targetBuildingBefore.position.x, y: targetBuildingBefore.position.y };
    targetDistance = edgeCircleDistance(from.x, from.y, targetPosition.x, targetPosition.y);
    targetHpBefore = targetBuildingBefore.hp;
  } else if (chosen.targetPosition) {
    targetKind = 3;
    targetPosition = { x: chosen.targetPosition.x, y: chosen.targetPosition.y };
    targetDistance = edgeCircleDistance(from.x, from.y, targetPosition.x, targetPosition.y);
  }
  const context = buildTraceContext(beforeUnit, state, trace, threats);
  const eventStart = events?.length ?? 0;
  const moveOutcome = executeAction(unit, chosen, state, events, true);
  const recentEvents = events ? events.slice(eventStart) : [];
  const actingUnitAfter = state.units[unit.id];
  let to = actingUnitAfter
    ? { x: actingUnitAfter.position.x, y: actingUnitAfter.position.y }
    : { x: from.x, y: from.y };
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    const event = recentEvents[i];
    if (event.type === 'PORTAL_USED' && event.unitId === unit.id) {
      to = { x: event.toPos.x, y: event.toPos.y };
      break;
    }
    if (event.type === 'UNIT_KNOCKBACK' && event.unitId === unit.id) {
      to = { x: event.toPosition.x, y: event.toPosition.y };
      break;
    }
    if (event.type === 'UNIT_DEATH' && event.unitId === unit.id) {
      to = { x: event.position.x, y: event.position.y };
      break;
    }
    if (event.type === 'ENEMY_MOVE' && event.unitId === unit.id) {
      to = { x: event.to.x, y: event.to.y };
      break;
    }
  }

  const ownHpAfter = actingUnitAfter?.stats.currentHp ?? 0;
  const targetHpAfter = targetUnitBefore
    ? state.units[targetUnitBefore.id]?.stats.currentHp ?? 0
    : targetBuildingBefore
      ? state.buildings[targetBuildingBefore.id]?.hp ?? 0
      : targetHpBefore ?? 0;
  const flags = getOutcomeBitMask([
    ...(targetUnitBefore && !state.units[targetUnitBefore.id] ? ['KILL' as const] : []),
    ...(!actingUnitAfter ? ['DIED' as const] : []),
    ...(recentEvents.some((event) => event.type === 'BUILDING_CAPTURE' && event.buildingId === chosen.targetBuildingId) ? ['CAPTURED' as const] : []),
    ...(recentEvents.some((event) => event.type === 'TILE_CORRUPTED') ? ['CORRUPTED' as const] : []),
    ...(chosen.type === 'EXPLODE' ? ['EXPLODED' as const] : []),
    ...(recentEvents.some((event) => event.type === 'PORTAL_USED' && event.unitId === unit.id) ? ['TELEPORTED' as const] : []),
    ...(moveOutcome?.slid ? ['SLID' as const] : []),
    ...(recentEvents.some((event) =>
      (event.type === 'TILE_DAMAGE' && event.damageSource === 'TRAP' && event.unitId === unit.id) ||
      (event.type === 'STUN_APPLIED' && event.unitId === unit.id),
    ) ? ['TRAPPED' as const] : []),
    ...(recentEvents.some((event) =>
      (event.type === 'ENEMY_ATTACK' || event.type === 'UNIT_ATTACK_BUILDING') &&
      'attackerHpLost' in event &&
      event.attackerHpLost > 0,
    ) ? ['COUNTERED' as const] : []),
    ...(recentEvents.some((event) => event.type === 'BUILDING_ATTACK' && event.defenderId === unit.id) ? ['OVERWATCH_HIT' as const] : []),
    ...(recentEvents.some((event) => event.type === 'PLAYER_ATTACK' && event.defenderId === unit.id) ? ['PREVENTIVE_HIT' as const] : []),
    ...((moveOutcome?.bridgeSteps ?? 0) > 0 ? ['BRIDGE_USED' as const] : []),
    ...((chosen.type === 'BUILD_LAVA_LAIR' || chosen.type === 'BUILD_INFERNAL_SANCTUM') &&
      chosen.targetPosition &&
      state.grid[chosen.targetPosition.y]?.[chosen.targetPosition.x]?.buildingId !== null
      ? ['BUILT' as const]
      : []),
  ]);

  if (targetUnitBefore && !state.units[targetUnitBefore.id]) {
    trace.markDeath(targetUnitBefore.id, 'KILLED');
  }
  if (targetBuildingBefore && !state.buildings[targetBuildingBefore.id]) {
    targetIndex = trace.buildingIndex(targetBuildingBefore.id, targetBuildingBefore.type);
  }
  if (!actingUnitAfter) {
    trace.markDeath(unit.id, determineDeathCause(flags));
  } else {
    trace.unitIndex(actingUnitAfter);
  }

  const winnerTerms = chosen.traceTerms ?? null;
  const runnerUpTerms = candidates[1]?.traceTerms ?? null;
  const contested = shouldPersistDecisionTerms(chosen.score, candidates[1]?.score ?? null, chosen.type, moveOutcome ? moveOutcome.steps : null);

  trace.pushDecision({
    slot,
    unit: beforeUnit,
    action: chosen.type,
    score: chosen.score,
    secondScore: candidates[1]?.score ?? null,
    candidates: candidates.filter((candidate) => candidate.score > 0).map((candidate) => getActionCode(candidate.type)),
    from,
    to,
    hp: ownHpBefore,
    targetKind,
    targetIndex,
    targetPosition,
    targetDistance,
    moveTiles: moveOutcome?.steps ?? 0,
    stopReason: moveOutcome ? getStopCode(moveOutcome.stop) : -1,
    pathLength: moveOutcome?.pathLen ?? 0,
    terrain: moveOutcome?.terr ?? '',
    damage: targetHpBefore === null ? 0 : Math.max(0, targetHpBefore - targetHpAfter),
    received: Math.max(0, ownHpBefore - ownHpAfter),
    flags,
    context,
    domTerm: getDominantTraceTerm(winnerTerms),
    terms: contested ? winnerTerms : null,
    terms2: contested ? runnerUpTerms : null,
  });
}

export function shouldPersistDecisionTerms(
  winnerScore: number | null,
  runnerUpScore: number | null,
  actionType: EnemyActionType,
  moveTiles: number | null,
): boolean {
  const isCloseCall = winnerScore !== null
    && runnerUpScore !== null
    && winnerScore - runnerUpScore < AI_TRACE.CLOSE_CALL_DELTA;
  return isCloseCall || actionType === 'HOLD_POSITION' || moveTiles === 0;
}

export function increaseEmberOnStrongholdCapture(
  state: Draft<GameState>,
  position: Position,
  events?: GameEvent[],
): void {
  state.ember += 1;
  state.emberLevelSources.other += 1;
  if (events) {
    events.push({
      type: 'EMBER_LEVEL_UP',
      position: { x: position.x, y: position.y },
      amount: 1,
      source: 'STRONGHOLD_CAPTURE',
    });
  }
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
    if (building.hasAttackedThisTurn) continue;
    // MAGMA_SPYR is handled separately by processMagmaSpyrAttacks (supports multi-attack)
    if (building.type === BuildingType.MAGMASPYR) continue;

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
    const defenderId = bestTarget.id;

    const attackDamage = resolveBuildingAttack(state, building.id, defenderId, suppressFloaters);

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
        defenderHpLost: attackDamage?.defenderDamage ?? 0,
        // Defender is a player unit defending against an enemy building attack —
        // player units do not earn XP for counter-killing buildings.
        defenderXpGained: null,
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
// CAVE MONSTER AI
// ============================================================================

/**
 * Chebyshev distance between two grid positions (max of |dx|, |dy|).
 * Used for patrol radius checks.
 */
function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Parse a mountainTileId string ("x,y") back to a Position.
 */
function parseMountainTileId(mountainTileId: string): Position | null {
  const parts = mountainTileId.split(',');
  if (parts.length !== 2) return null;
  const x = parseInt(parts[0], 10);
  const y = parseInt(parts[1], 10);
  if (isNaN(x) || isNaN(y)) return null;
  return { x, y };
}

/**
 * Resolve a cave monster's attack against a player unit, emitting the
 * appropriate events and cleaning up the encounter if the monster is
 * counter-killed.  Shared by the direct-attack path (already in range) and
 * the post-move attack path (moved into range this turn).
 */
function resolveCaveMonsterAttack(
  state: Draft<GameState>,
  attackerId: string,
  defenderId: string,
  events?: GameEvent[],
): void {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (!attacker || !defender) return;

  const attackerPos = { x: attacker.position.x, y: attacker.position.y };
  const defenderPos = { x: defender.position.x, y: defender.position.y };
  const defenderTileStatusBefore = state.grid[defenderPos.y]?.[defenderPos.x]?.status;
  const defenderFaction = defender.faction;
  // Capture pre-attack XP qualification to mirror the grantXp early-return for MAX_LEVEL units.
  const attackerCanReceiveXp = canGrantXp(attacker.type, attacker.xp);
  const defenderCanReceiveXp = canGrantXp(defender.type, defender.xp);

  const attackDamage = resolveAttack(state, attackerId, defenderId, !!events);

  // If the cave monster was killed by the counter-attack, clean up its encounter
  // entry from the state so the resolved state is consistent.
  if (!state.units[attackerId]) {
    state.activeCaveEncounters = state.activeCaveEncounters.filter(
      (e) => e.monsterId !== attackerId,
    );
  }

  if (events) {
    const attackerAfter = state.units[attackerId];
    const defenderAfter = state.units[defenderId];
    const advancedToPosition = (
      !defenderAfter &&
      attackerAfter &&
      (attackerAfter.position.x !== attackerPos.x || attackerAfter.position.y !== attackerPos.y)
    ) ? { x: attackerAfter.position.x, y: attackerAfter.position.y } : null;
    const tileBurningPosition = (
      defenderTileStatusBefore !== TileStatus.BURNING &&
      state.grid[defenderPos.y]?.[defenderPos.x]?.status === TileStatus.BURNING
    ) ? { ...defenderPos } : undefined;
    events.push({
      type: 'ENEMY_ATTACK',
      attackerId,
      defenderId,
      attackerPosition: attackerPos,
      defenderPosition: defenderPos,
      attackerHpLost: attackDamage?.attackerDamage ?? 0,
      defenderHpLost: attackDamage?.defenderDamage ?? 0,
      advancedToPosition,
      attackerXpGained: !defenderAfter && attackerAfter && attackerCanReceiveXp ? XP.KILL_UNIT : null,
      defenderXpGained: !attackerAfter && defenderCanReceiveXp ? XP.KILL_UNIT : null,
      tileBurningPosition,
    });
    if (!defenderAfter) {
      events.push({
        type: 'UNIT_DEATH',
        unitId: defenderId,
        position: defenderPos,
        faction: defenderFaction,
      });
    }
    if (!attackerAfter) {
      events.push({
        type: 'UNIT_DEATH',
        unitId: attackerId,
        position: attackerPos,
        faction: Faction.ENEMY,
      });
      // Cave monster was counter-killed → trigger specialist draw
      events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: attackerId });
    }
  }
}

/**
 * Dedicated AI loop for all CAVE_MONSTER units.
 * Runs once per enemy turn, before the standard enemy unit loop.
 * Implements three mutually-exclusive priority actions:
 *
 *   1. Attack — if a player unit is already in attack range, strike it.
 *   2. Move + Attack — if a player unit is within PATROL_RADIUS (nearby),
 *      move toward it; after moving, attack if now in range.
 *   3. Return — move toward the home mountain; despawn upon arrival.
 */
function runCaveMonsterAi(
  state: Draft<GameState>,
  events?: GameEvent[],
  trace?: AiTraceCollector,
  threats: AiThreatEntry[] = [],
): void {
  const PATROL_RADIUS = TERRAIN.CAVE_MONSTER_PATROL_RADIUS;

  for (const encounter of [...state.activeCaveEncounters]) {
    const unit = state.units[encounter.monsterId];
    if (!unit) {
      // Monster was killed by player — clean up the encounter entry
      state.activeCaveEncounters = state.activeCaveEncounters.filter(
        (e) => e.monsterId !== encounter.monsterId,
      );
      continue;
    }

    // Skip if the unit already acted this turn (prevents double-acting within the same enemy turn)
    if (hasUnitActed(unit, state)) continue;

    // PIN_DOWN / PUNCTURE stun: mirror the standard enemy loop behaviour
    if (unit.pinnedUntilTurn >= state.turn) {
      unit.hasMovedThisTurn = true;   // block movement
      unit.hasAttackedThisTurn = true; // block attack
      continue;
    }

    const homePos = parseMountainTileId(encounter.mountainTileId);
    if (!homePos) continue;

    const playerUnits = Object.values(state.units).filter(
      (u) => u.faction === Faction.PLAYER,
    );

    // ── Priority 1: Attack a player unit already in attack range ─────────
    const playerUnitsInAttackRange = playerUnits.filter((playerUnit) =>
      isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        playerUnit.position.x, playerUnit.position.y,
        unit.stats.attackRange,
      ));
    const legallyAttackablePlayerUnits = playerUnitsInAttackRange.filter((playerUnit) =>
      isAttackableEnemyUnit(playerUnit, unit.faction, state.grid));
    const directTarget = getTauntRestrictedAttackTargets(
      legallyAttackablePlayerUnits,
      playerUnitsInAttackRange,
    )[0] ?? null;

    if (directTarget) {
      const from = { x: unit.position.x, y: unit.position.y };
      const ownHpBefore = unit.stats.currentHp;
      const targetHpBefore = directTarget.stats.currentHp;
      const context = trace ? buildTraceContext(unit, state, trace, threats) : null;
      const eventStart = events?.length ?? 0;
      resolveCaveMonsterAttack(state, unit.id, directTarget.id, events);
      if (trace && context) {
        const recentEvents = events ? events.slice(eventStart) : [];
        const monsterAfter = state.units[unit.id];
        if (!monsterAfter) {
          trace.markDeath(unit.id, determineDeathCause(getOutcomeBitMask(['DIED'])));
        } else {
          trace.unitIndex(monsterAfter);
        }
        if (!state.units[directTarget.id]) {
          trace.markDeath(directTarget.id, 'KILLED');
        }
        trace.pushDecision({
          slot: 1,
          unit,
          action: 'CM_ATTACK_IN_RANGE',
          score: null,
          secondScore: null,
          candidates: [],
          from,
          to: monsterAfter ? { x: monsterAfter.position.x, y: monsterAfter.position.y } : from,
          hp: ownHpBefore,
          targetKind: 1,
          targetIndex: trace.unitIndex(directTarget),
          targetPosition: { x: directTarget.position.x, y: directTarget.position.y },
          targetDistance: edgeCircleDistance(from.x, from.y, directTarget.position.x, directTarget.position.y),
          moveTiles: 0,
          stopReason: -1,
          pathLength: 0,
          terrain: '',
          damage: Math.max(0, targetHpBefore - (state.units[directTarget.id]?.stats.currentHp ?? 0)),
          received: Math.max(0, ownHpBefore - (monsterAfter?.stats.currentHp ?? 0)),
          flags: getOutcomeBitMask([
            ...(!state.units[directTarget.id] ? ['KILL' as const] : []),
            ...(!monsterAfter ? ['DIED' as const] : []),
            ...(recentEvents.some((event) =>
              (event.type === 'ENEMY_ATTACK' || event.type === 'UNIT_ATTACK_BUILDING') &&
              'attackerHpLost' in event &&
              event.attackerHpLost > 0,
            ) ? ['COUNTERED' as const] : []),
          ]),
          context,
        });
      }
      continue;
    }

    // ── Priority 2: Move toward a nearby player, then attack if in range ──
    // "Nearby" = within PATROL_RADIUS Chebyshev distance of the monster's
    // current position.  Once the player moves out of that range the monster
    // stops chasing and falls through to return-home (Priority 3).
    let aggroTarget: Unit | null = null;
    let aggroPathLen = Infinity;

    for (const playerUnit of playerUnits) {
      const dist = chebyshevDistance(unit.position, playerUnit.position);
      if (dist > PATROL_RADIUS) continue; // outside aggro range
      const path = findBfsPath(unit.position, playerUnit.position, state);
      if (path.length > 0 && path.length < aggroPathLen) {
        aggroPathLen = path.length;
        aggroTarget = playerUnit;
      }
    }

    if (aggroTarget) {
      const from = { x: unit.position.x, y: unit.position.y };
      const ownHpBefore = unit.stats.currentHp;
      const targetHpBefore = aggroTarget.stats.currentHp;
      const context = trace ? buildTraceContext(unit, state, trace, threats) : null;
      const eventStart = events?.length ?? 0;
      const moveOutcome = moveEnemyUnitToward(state, unit.id, aggroTarget.position, events, !!trace);
      // Re-fetch the unit — it may have been destroyed (e.g. PREVENTIVE_STRIKE)
      const movedUnit = state.units[unit.id];
      if (!movedUnit) {
        if (trace && context) {
          trace.markDeath(unit.id, determineDeathCause(getOutcomeBitMask(['DIED'])));
          trace.pushDecision({
            slot: 1,
            unit,
            action: 'CM_MOVE_AND_ATTACK',
            score: null,
            secondScore: null,
            candidates: [],
            from,
            to: from,
            hp: ownHpBefore,
            targetKind: 1,
            targetIndex: trace.unitIndex(aggroTarget),
            targetPosition: { x: aggroTarget.position.x, y: aggroTarget.position.y },
            targetDistance: edgeCircleDistance(from.x, from.y, aggroTarget.position.x, aggroTarget.position.y),
            moveTiles: moveOutcome.steps,
            stopReason: getStopCode(moveOutcome.stop),
            pathLength: moveOutcome.pathLen,
            terrain: moveOutcome.terr,
            damage: 0,
            received: ownHpBefore,
            flags: getOutcomeBitMask([
              'DIED',
              ...(moveOutcome.slid ? ['SLID' as const] : []),
              ...((moveOutcome.bridgeSteps > 0) ? ['BRIDGE_USED' as const] : []),
            ]),
            context,
          });
        }
        state.activeCaveEncounters = state.activeCaveEncounters.filter(
          (e) => e.monsterId !== encounter.monsterId,
        );
        continue;
      }
      // If the target is now in attack range after moving, attack in the same turn
      if (
        state.units[aggroTarget.id] &&
        isTileWithinEdgeCircleRange(
          movedUnit.position.x, movedUnit.position.y,
          aggroTarget.position.x, aggroTarget.position.y,
          movedUnit.stats.attackRange,
        )
      ) {
        resolveCaveMonsterAttack(state, movedUnit.id, aggroTarget.id, events);
      }
      if (trace && context) {
        const recentEvents = events ? events.slice(eventStart) : [];
        const monsterAfter = state.units[unit.id];
        if (!monsterAfter) {
          trace.markDeath(unit.id, determineDeathCause(getOutcomeBitMask(['DIED'])));
        } else {
          trace.unitIndex(monsterAfter);
        }
        if (!state.units[aggroTarget.id]) {
          trace.markDeath(aggroTarget.id, 'KILLED');
        }
        trace.pushDecision({
          slot: 1,
          unit,
          action: 'CM_MOVE_AND_ATTACK',
          score: null,
          secondScore: null,
          candidates: [],
          from,
          to: monsterAfter ? { x: monsterAfter.position.x, y: monsterAfter.position.y } : from,
          hp: ownHpBefore,
          targetKind: 1,
          targetIndex: trace.unitIndex(aggroTarget),
          targetPosition: { x: aggroTarget.position.x, y: aggroTarget.position.y },
          targetDistance: edgeCircleDistance(from.x, from.y, aggroTarget.position.x, aggroTarget.position.y),
          moveTiles: moveOutcome.steps,
          stopReason: getStopCode(moveOutcome.stop),
          pathLength: moveOutcome.pathLen,
          terrain: moveOutcome.terr,
          damage: Math.max(0, targetHpBefore - (state.units[aggroTarget.id]?.stats.currentHp ?? 0)),
          received: Math.max(0, ownHpBefore - (monsterAfter?.stats.currentHp ?? 0)),
          flags: getOutcomeBitMask([
            ...(!state.units[aggroTarget.id] ? ['KILL' as const] : []),
            ...(!monsterAfter ? ['DIED' as const] : []),
            ...(recentEvents.some((event) => event.type === 'PORTAL_USED' && event.unitId === unit.id) ? ['TELEPORTED' as const] : []),
            ...(moveOutcome.slid ? ['SLID' as const] : []),
            ...((moveOutcome.bridgeSteps > 0) ? ['BRIDGE_USED' as const] : []),
            ...(recentEvents.some((event) => event.type === 'BUILDING_ATTACK' && event.defenderId === unit.id) ? ['OVERWATCH_HIT' as const] : []),
            ...(recentEvents.some((event) => event.type === 'PLAYER_ATTACK' && event.defenderId === unit.id) ? ['PREVENTIVE_HIT' as const] : []),
            ...(recentEvents.some((event) =>
              (event.type === 'TILE_DAMAGE' && event.damageSource === 'TRAP' && event.unitId === unit.id) ||
              (event.type === 'STUN_APPLIED' && event.unitId === unit.id),
            ) ? ['TRAPPED' as const] : []),
            ...(recentEvents.some((event) =>
              (event.type === 'ENEMY_ATTACK' || event.type === 'UNIT_ATTACK_BUILDING') &&
              'attackerHpLost' in event &&
              event.attackerHpLost > 0,
            ) ? ['COUNTERED' as const] : []),
          ]),
          context,
        });
      }
      continue;
    }

    // ── Priority 3: Return to home mountain; despawn on arrival ──────────
    // This priority fires under the same conditions as when no Crystal Cave
    // existed — no nearby player units (Priority 1 & 2 didn't trigger).
    // The return trigger is NOT affected by what is on the mountain tile.
    const onHomeTile =
      unit.position.x === homePos.x && unit.position.y === homePos.y;

    if (onHomeTile) {
      if (trace) {
        trace.unitIndex(unit);
        trace.pushDecision({
          slot: 1,
          unit,
          action: 'CM_DESPAWN',
          score: null,
          secondScore: null,
          candidates: [],
          from: { x: unit.position.x, y: unit.position.y },
          to: { x: unit.position.x, y: unit.position.y },
          hp: unit.stats.currentHp,
          targetKind: 3,
          targetIndex: -1,
          targetPosition: { x: homePos.x, y: homePos.y },
          targetDistance: 0,
          moveTiles: 0,
          stopReason: -1,
          pathLength: 0,
          terrain: '',
          damage: 0,
          received: 0,
          flags: 0,
          context: buildTraceContext(unit, state, trace, threats),
        });
        trace.markDeath(unit.id, 'DESPAWN');
      }
      // Despawn: monster has returned to its mountain with no nearby threat.
      const tile = state.grid[unit.position.y][unit.position.x];
      if (tile.unitId === unit.id) tile.unitId = null;
      // If a Mine or Crystal Cave was built on the mountain while the monster
      // was away, the monster destroys it upon return.  For a Crystal Cave the
      // destruction follows the standard building-removal chain: the cave is
      // removed first, then cleanupRoostedUnits removes the bound Crystal
      // Drake — the monster never targets the drake directly.
      if (tile.buildingId !== null) {
        const building = state.buildings[tile.buildingId];
        if (
          building &&
          (building.type === BuildingType.MINE || building.type === BuildingType.DEEP_MINE || building.type === BuildingType.CRYSTAL_CAVE)
        ) {
          tile.buildingId = null;
          // Collect any life-bound units BEFORE cleanup so we can emit UNIT_DEATH events.
          const roosted = events ? getRoostedUnits(state, building.id) : [];
          cleanupRoostedUnits(state, building.id);
          delete state.buildings[building.id];
          // Emit UNIT_DEATH before CAVE_MONSTER_RETREAT so the auto-cam pans to
          // the drake death first, then shows the monster retreating.
          if (events && roosted.length > 0) {
            for (const death of roosted) {
              events.push({
                type: 'UNIT_DEATH',
                unitId: death.unitId,
                position: death.position,
                faction: death.faction,
              });
            }
          }
        }
      }
      tile.hasCaveMonster = false;
      if (events) {
        events.push({
          type: 'CAVE_MONSTER_RETREAT',
          unitId: unit.id,
          position: { x: unit.position.x, y: unit.position.y },
        });
      }
      delete state.units[unit.id];
      state.activeCaveEncounters = state.activeCaveEncounters.filter(
        (e) => e.monsterId !== encounter.monsterId,
      );
      continue;
    }

    // Not on home tile — move toward home mountain
    const from = { x: unit.position.x, y: unit.position.y };
    const ownHpBefore = unit.stats.currentHp;
    const context = trace ? buildTraceContext(unit, state, trace, threats) : null;
    const eventStart = events?.length ?? 0;
    const moveOutcome = moveEnemyUnitToward(state, unit.id, homePos, events, !!trace);
    // If destroyed en route (e.g. lava), clean up the encounter
    if (trace && context) {
      const recentEvents = events ? events.slice(eventStart) : [];
      const monsterAfter = state.units[unit.id];
      if (!monsterAfter) {
        trace.markDeath(unit.id, determineDeathCause(getOutcomeBitMask(['DIED'])));
      } else {
        trace.unitIndex(monsterAfter);
      }
      trace.pushDecision({
        slot: 1,
        unit,
        action: 'CM_RETURN_HOME',
        score: null,
        secondScore: null,
        candidates: [],
        from,
        to: monsterAfter ? { x: monsterAfter.position.x, y: monsterAfter.position.y } : from,
        hp: ownHpBefore,
        targetKind: 3,
        targetIndex: -1,
        targetPosition: { x: homePos.x, y: homePos.y },
        targetDistance: edgeCircleDistance(from.x, from.y, homePos.x, homePos.y),
        moveTiles: moveOutcome.steps,
        stopReason: getStopCode(moveOutcome.stop),
        pathLength: moveOutcome.pathLen,
        terrain: moveOutcome.terr,
        damage: 0,
        received: Math.max(0, ownHpBefore - (monsterAfter?.stats.currentHp ?? 0)),
        flags: getOutcomeBitMask([
          ...(!monsterAfter ? ['DIED' as const] : []),
          ...(recentEvents.some((event) => event.type === 'PORTAL_USED' && event.unitId === unit.id) ? ['TELEPORTED' as const] : []),
          ...(moveOutcome.slid ? ['SLID' as const] : []),
          ...((moveOutcome.bridgeSteps > 0) ? ['BRIDGE_USED' as const] : []),
          ...(recentEvents.some((event) => event.type === 'BUILDING_ATTACK' && event.defenderId === unit.id) ? ['OVERWATCH_HIT' as const] : []),
          ...(recentEvents.some((event) => event.type === 'PLAYER_ATTACK' && event.defenderId === unit.id) ? ['PREVENTIVE_HIT' as const] : []),
          ...(recentEvents.some((event) =>
            (event.type === 'TILE_DAMAGE' && event.damageSource === 'TRAP' && event.unitId === unit.id) ||
            (event.type === 'STUN_APPLIED' && event.unitId === unit.id),
          ) ? ['TRAPPED' as const] : []),
        ]),
        context,
      });
    }
    if (!state.units[unit.id]) {
      state.activeCaveEncounters = state.activeCaveEncounters.filter(
        (e) => e.monsterId !== encounter.monsterId,
      );
    }
  }
}

// ============================================================================
// MAIN ENEMY TURN FUNCTION
// ============================================================================

interface EnemyTurnOptions {
  trace?: boolean;
  slotId?: string;
  unitIndexSeed?: AiTraceIndexSeed & { buildingTypes?: Record<string, string> };
}

function summarizeArmy(state: GameState, faction: Faction): { count: number; hp: number; atk: number } {
  let count = 0;
  let hp = 0;
  let atk = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== faction) continue;
    count += 1;
    hp += unit.stats.currentHp;
    atk += unit.stats.attack;
  }
  return { count, hp, atk };
}

function countBuildingsForFaction(state: GameState, faction: Faction): number {
  return Object.values(state.buildings).filter((building) => building.faction === faction).length;
}

function getFrontRows(state: GameState): [number, number] {
  const playerRows = Object.values(state.units).filter((unit) => unit.faction === Faction.PLAYER).map((unit) => unit.position.y);
  const enemyRows = Object.values(state.units).filter((unit) => unit.faction === Faction.ENEMY).map((unit) => unit.position.y);
  return [
    playerRows.length > 0 ? Math.min(...playerRows) : -1,
    enemyRows.length > 0 ? Math.max(...enemyRows) : -1,
  ];
}

function getActiveLockouts(state: GameState): number[] {
  return Object.entries(state.zoneLockoutUntilTurn)
    .filter(([, turn]) => typeof turn === 'number' && state.turn < turn)
    .map(([zone]) => parseInt(zone, 10))
    .sort((a, b) => a - b);
}

export function runEnemyTurn(
  state: GameState,
  options?: EnemyTurnOptions,
): { finalState: GameState; events: GameEvent[]; trace: AiTraceChunk | null } {
  const events: GameEvent[] = [];
  const shouldTrace = !!options?.trace && !!options?.slotId;
  const traceCollector = shouldTrace ? new AiTraceCollector(state.turn, options?.slotId ?? '', options?.unitIndexSeed) : null;
  const startEnemy = summarizeArmy(state, Faction.ENEMY);
  const startPlayer = summarizeArmy(state, Faction.PLAYER);
  const startThreats = shouldTrace ? buildThreatBoard(state as Draft<GameState>) : [];
  const startingEnemyPositions = new Map(
    Object.values(state.units)
      .filter((unit) => unit.faction === Faction.ENEMY)
      .map((unit) => [unit.id, { x: unit.position.x, y: unit.position.y }]),
  );
  const finalState = produce(state, (draft) => {
    // 0. Process deferred enemy level-ups (XP may have been earned during player turn)
    processEnemyLevelUps(draft);

    // Reset the per-turn spawn counter at the start of each enemy turn
    draft.enemyUnitsSpawnedLastTurn = 0;

    // Reset PREVENTIVE_STRIKE per-turn tracking for all player siege units so
    // each siege unit may fire at most once during this enemy turn.
    for (const unit of Object.values(draft.units)) {
      if (unit.faction === Faction.PLAYER && unit.preventiveStrikeFiredThisTurn) {
        unit.preventiveStrikeFiredThisTurn = false;
      }
    }

    // Reset GARRISON_OVERWATCH per-turn tracking for all player combat buildings so
    // each building may fire at most once during this enemy turn.
    for (const building of Object.values(draft.buildings)) {
      if (building.faction === Faction.PLAYER && building.preventiveStrikeFiredThisTurn) {
        building.preventiveStrikeFiredThisTurn = false;
      }
    }

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

    // 2a. Clean up expired/orphaned portals at the start of each enemy turn
    cleanupPortals(draft, events);

    // 2b. Cave monster AI (dedicated, separate from standard enemy AI)
    if (traceCollector) traceCollector.setThreats(startThreats);
    runCaveMonsterAi(draft, events, traceCollector ?? undefined, startThreats);

    // 2c. Enemy-owned attacking buildings (e.g. watchtowers) fire at player units in range
    executeBuildingAttacks(draft, events);

    // 3. Process each enemy unit (excluding CAVE_MONSTER — handled above)
    const targetingIntents = new Map<string, number>();
    const portalUsageIntents = new Map<string, number>();
    const enemyUnits = Object.values(draft.units).filter(
      u => u.faction === Faction.ENEMY && u.type !== UnitType.CAVE_MONSTER,
    );

    for (const unit of enemyUnits) {
      if (!draft.units[unit.id]) continue;
      // Allow each enemy unit to act up to 2 times per turn (1 move + 1 attack/capture),
      // matching player units that can move then attack/capture.
      const maxActions = 2;
      for (let i = 0; i < maxActions; i++) {
        const currentUnit = draft.units[unit.id];
        if (!currentUnit) break;
        if (hasUnitActed(currentUnit, draft)) break;
        // PIN_DOWN stun: skip movement and attack for stunned units
        if (currentUnit.pinnedUntilTurn >= draft.turn) {
          currentUnit.hasMovedThisTurn = true;   // block movement
          currentUnit.hasAttackedThisTurn = true; // block attack
        }
        // Tunnel mechanic — pre-empts normal AI for TUNNEL-tagged units
        if (currentUnit.tags.includes(UnitTag.TUNNEL)) {
          if (currentUnit.tunnelState && currentUnit.tunnelState !== 'IDLE') {
            const consumed = processTunnelTurn(draft, currentUnit.id, events);
            if (consumed) break; // Skip normal AI turn
          } else {
            const began = tryBeginTunnel(draft, currentUnit.id, events);
            if (began) break; // Skip normal AI turn (tunnel just started)
          }
        }
        // Portal mechanic — hexcasters never attack; they cast a portal each turn
        if (currentUnit.tags.includes(UnitTag.EMBER_PORTAL)) {
          const cast = tryPlanPortalCast(draft, currentUnit.id);
          if (cast) {
            castPortal(draft, currentUnit.id, cast.entrancePos, cast.exitPos, events);
            // Hexcaster's action is fully consumed by casting — skip normal AI
            break;
          }
          // If no cast possible, fall through to standard movement (toward player)
        }
        decideAndExecute(
          currentUnit,
          draft,
          targetingIntents,
          recentlyLostBuildingIds,
          portalUsageIntents,
          events,
          traceCollector ?? undefined,
          i + 1,
          startThreats,
        );
      }
      // Sweep leashes after each enemy unit's turn to handle mage displacement
      // Pre-capture mage/demon positions before sweepLeashes mutates faction.
      const leashSnapshot = new Map<string, { mageId: string; demonPos: { x: number; y: number }; magePos: { x: number; y: number } }>();
      for (const u of Object.values(draft.units)) {
        if (!u.tags.includes(UnitTag.LEASHED) || u.faction !== Faction.PLAYER) continue;
        const mage = u.controllerMageId ? draft.units[u.controllerMageId] : null;
        leashSnapshot.set(u.id, {
          mageId: u.controllerMageId ?? '',
          demonPos: { x: u.position.x, y: u.position.y },
          magePos: mage ? { x: mage.position.x, y: mage.position.y } : { x: u.position.x, y: u.position.y },
        });
      }
      const defectedIds = sweepLeashes(draft);
      for (const demonId of defectedIds) {
        const snap = leashSnapshot.get(demonId);
        if (snap) {
          events.push({
            type: 'LEASH_DEFECT',
            demonId,
            mageId: snap.mageId,
            demonPos: snap.demonPos,
            magePos: snap.magePos,
          });
        }
      }
    }

    // 3b. Magma Spyr attacks (after unit movement)
    processMagmaSpyrAttacks(draft, events);

    // 3c. Spawn enemy units after movement so that freed building tiles can be used
    //     (recruitment is scored fresh per-building inside spawnEnemyUnits)
    spawnEnemyUnits(draft, events);

    processInfestedFactionTurn(draft, Faction.ENEMY, events);

    // 4. Reset enemy unit action flags for next turn
    for (const unit of Object.values(draft.units)) {
      updateBerserkLatch(unit);
    }
    for (const unit of Object.values(draft.units)) {
      if (unit.faction === Faction.ENEMY) {
        unit.hasMovedThisTurn = false;
        unit.hasAttackedThisTurn = false;
        unit.spellsCastThisTurn = 0;
        unit.hasCapturedThisTurn = false;
        unit.hasTradedThisTurn = false;
        unit.hasConstructedThisTurn = false;
        unit.hasDestroyedThisTurn = false;
        unit.hasConsumedGravestoneThisTurn = false;
        unit.hasUsedPostAttackMoveThisTurn = false;
      }
    }

    // Reset enemy building action flags for next turn
    for (const building of Object.values(draft.buildings)) {
      if (building.faction === Faction.ENEMY && building.combatStats) {
        building.hasAttackedThisTurn = false;
      }
    }

    // 5. Remove portal pairs whose lastUsableTurn equals the current turn.
    //    This runs AFTER all enemy unit actions, ensuring portals are usable
    //    for the full L turns and then removed at end of their last usable turn.
    cleanupExpiredPortalsEndOfTurn(draft, events);
  });
  if (!traceCollector || !options?.slotId) {
    return { finalState, events, trace: null };
  }

  const acts: Record<number, number> = {};
  const stops: Record<number, number> = {};
  let blocked = 0;
  const slot2Units = new Set<number>();
  const traceChunk = traceCollector.finish({
    t: state.turn,
    eu: startEnemy.count,
    pu: startPlayer.count,
    pHp: startPlayer.hp,
    pAtk: startPlayer.atk,
    pB: countBuildingsForFaction(state, Faction.PLAYER),
    eHp: startEnemy.hp,
    eAtk: startEnemy.atk,
    eB: countBuildingsForFaction(state, Faction.ENEMY),
    em: state.ember,
    lf: state.lavaFrontRow,
    front: getFrontRows(state),
    sp: finalState.enemyUnitsSpawnedLastTurn,
    budget: state.lastSpawnBudget ? JSON.parse(JSON.stringify(state.lastSpawnBudget)) as SpawnBudgetSnapshot : null,
    acts,
    stops,
    blocked,
    static: 0,
    slot2: slot2Units.size,
    kills: events.filter((event) => event.type === 'UNIT_DEATH' && event.faction === Faction.PLAYER).length,
    losses: events.filter((event) => event.type === 'UNIT_DEATH' && event.faction === Faction.ENEMY).length,
    lockouts: getActiveLockouts(state),
    threats: startThreats,
  });
  for (const row of traceChunk.rows) {
    acts[row[3]] = (acts[row[3]] ?? 0) + 1;
    if (row[18] >= 0) {
      stops[row[18]] = (stops[row[18]] ?? 0) + 1;
      if (row[17] === 0) blocked += 1;
    }
    if (row[1] === 2) {
      slot2Units.add(row[2]);
    }
  }
  traceChunk.summary.acts = acts;
  traceChunk.summary.stops = stops;
  traceChunk.summary.blocked = blocked;
  traceChunk.summary.slot2 = slot2Units.size;
  traceChunk.summary.static = [...startingEnemyPositions.entries()].filter(([unitId, position]) => {
    const finalUnit = finalState.units[unitId];
    return finalUnit !== undefined && finalUnit.position.x === position.x && finalUnit.position.y === position.y;
  }).length;
  const seed = traceCollector.getIndexSeed();
  const buildingIndexById = new Map(Object.entries(seed.buildingIds).map(([id, index]) => [id, index]));
  traceChunk.summary.threats = countThreatDefenders(traceChunk.rows as unknown as number[][], startThreats, buildingIndexById);
  return { finalState, events, trace: traceChunk };
}

// ============================================================================
// DEBUG / DEV: AI SCORE INSPECTION
// ============================================================================

/**
 * Computes and returns all scored actions for an enemy unit, sorted by score
 * descending. Intended for dev/debug use only (AI Score inspector).
 *
 * CAVE_MONSTER units use a dedicated AI loop (runCaveMonsterAi) with fixed
 * priority behaviour (Aggro → Return → Patrol → Despawn) rather than the
 * scored-action system, so this function returns an empty array for them.
 */
export function computeUnitAiScores(state: GameState, unitId: string, tracing = false): ScoredAction[] {
  const unit = state.units[unitId];
  if (!unit || unit.faction !== Faction.ENEMY) return [];
  // Cave monsters use their own dedicated AI loop — not scored actions.
  // Priority order: Attack → Move+Attack (nearby) → Return/Despawn.
  if (unit.type === UnitType.CAVE_MONSTER) return [];

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
  const portalUsageIntents = new Map<string, number>();
  const scores = scoreActionsForUnit(
    unit,
    state as Draft<GameState>,
    targetingIntents,
    recentlyLostBuildingIds,
    portalUsageIntents,
    tracing,
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
