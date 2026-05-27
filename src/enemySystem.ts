/**
 * Enemy AI system module for Volcanae.
 * Implements enemy unit spawning and scoring-based AI behavior.
 */

import type { GameState, Unit, Building, Position } from './types';
import type { Draft } from 'immer';
import { produce } from 'immer';
import { Faction, UnitType, UnitTag, BuildingType, TileType, TileStatus } from './types';
import { UNIT_DEFINITIONS, ENEMY, MAP, TERRAIN, AI_SCORING, AI_RECRUITMENT, XP, DIFFICULTY_MULTIPLIER, SANCTUM_COLLAPSE, ABILITIES, COUNTER_UNIT_SCORING, PUNCTURE_STUN_BASE_DEF_THRESHOLD, EMBER_PORTAL_BASE_USE_SCORE, EMBER_PORTAL_DISTANCE_PENALTY, EMBER_PORTAL_MAX_USERS_PER_TURN } from './gameConfig';
import { resolveAttack, calculateCombat, resolveBuildingAttack, buildingToCombatant, calculateCombatFromStats, unitToCombatant, resolveAttackOnBuilding } from './combatSystem';
import { isTileWithinEdgeCircleRange, edgeCircleDistance } from './rangeUtils';
import { initiateCapture, canCapture } from './captureSystem';
import { corruptTerrain, processMagmaSpyrAttacks, processEmberNestSpawns } from './corruptionSystem';
import { enemyConstructBuilding } from './constructionSystem';
import { processEnemyLevelUps, grantXp } from './levelSystem';
import type { GameEvent } from './gameEvents';
import { hasUnitActed } from './unitActions';
import { sweepLeashes } from './spellSystem';
import { checkGraveTrapTrigger, resolveSlide } from './movementSystem';
import { tryBeginTunnel, processTunnelTurn } from './tunnelSystem';
import { cleanupPortals, cleanupExpiredPortalsEndOfTurn, tryPlanPortalCast, castPortal, getUsablePortalAtEntrance, tryTeleportThroughPortal, processPendingPortalTeleports } from './portalSystem';

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
  | 'SPREAD_TO_FLANK'
  | 'MOVE_TO_PLAYER_BUILDING'
  | 'MOVE_TO_NEUTRAL_BUILDING'
  | 'MOVE_TO_UNIT'
  | 'ADVANCE_TOWARD_LAVA'
  | 'FLANK_UNIT'
  | 'SACRIFICE_TO_LAVA'
  | 'CORRUPT_TERRAIN'
  | 'BUILD_LAVA_LAIR'
  | 'BUILD_INFERNAL_SANCTUM'
  | 'MOVE_TO_SAFE_RANGED_POSITION'
  | 'EXPLODE'
  | 'MOVE_TO_PORTAL'
  | 'HOLD_POSITION';

interface ScoredAction {
  type: EnemyActionType;
  score: number;
  targetUnitId?: string;
  targetBuildingId?: string;
  targetPosition?: Position;
  /** Portal ID tagged on MOVE_TO_PORTAL actions for intent tracking. */
  portalIntentId?: string;
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

  /** Raw count of Mage units. */
  mageCount: number;
  /** Raw count of Guard units. */
  guardCount: number;
  /** Count of units with base DEF > PUNCTURE_STUN_BASE_DEF_THRESHOLD. */
  highDefCount: number;
  /** Count of SUMMONED units (Ember Demons, Skeletons). */
  summonedCount: number;
  /** True if any unit has the BRANDMARKED tag. */
  brandmarkActive: boolean;
  /** Ratio of units with moveRange === 1 (static formation indicator). */
  staticRatio: number;
}
type ZoneId = number;

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
  const threatRatio = Math.min(state.ember / ENEMY.MAX_THREAT, 1);
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
        // Impassable terrain — cannot be traversed in any direction
        continue;
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
      // CANYON / WATER tiles are impassable — never enter, not even as the target
      if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) continue;
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
    if (u.defense > PUNCTURE_STUN_BASE_DEF_THRESHOLD) highDefCount++;
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
  lavaBoostEnabled: boolean,
  lavaFrontRow: number,
  buildingPosition: Position,
  difficultyMult: number
): Unit {
  const baseHp: number = UNIT_DEFINITIONS[unitType].maxHp;
  const baseAttack: number = UNIT_DEFINITIONS[unitType].attack;
  const baseDefense: number = UNIT_DEFINITIONS[unitType].defense;

  let finalHp: number = Math.round(baseHp * difficultyMult);
  let finalAttack: number = Math.round(baseAttack * difficultyMult);
  const finalDefense: number = Math.round(baseDefense * difficultyMult);
  const tags: UnitTag[] = [...UNIT_DEFINITIONS[unitType].tags];

  if (lavaBoostEnabled) {
    const boostFactor = calculateLavaBoostFactor(buildingPosition, lavaFrontRow);
    const boostMultiplier = 1 + boostFactor * ENEMY.MAX_LAVA_BOOST_MULTIPLIER;

    finalHp = Math.round(finalHp * boostMultiplier);
    finalAttack = Math.round(finalAttack * boostMultiplier);
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
      defense: finalDefense,
      moveRange: UNIT_DEFINITIONS[unitType].moveRange,
      discoverRadius: UNIT_DEFINITIONS[unitType].discoverRadius,
      triggerRange: UNIT_DEFINITIONS[unitType].triggerRange,
      movementActions: UNIT_DEFINITIONS[unitType].movementActions,
      attackRange: UNIT_DEFINITIONS[unitType].attackRange,
    },
    tags,
    hasMovedThisTurn: true,
    hasAttackedThisTurn: true,
    hasCapturedThisTurn: true,
    hasConstructedThisTurn: true,
    hasDestroyedThisTurn: true,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function spawnEnemyUnits(state: Draft<GameState>, events?: GameEvent[]): void {
  if (SANCTUM_COLLAPSE.SPAWN_FREEZE_TURNS > 0 &&
      state.spawnFreezeUntilTurn > 0 &&
      state.turn < state.spawnFreezeUntilTurn) {
    return; // spawn frozen by Sanctum Collapse
  }
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (!isRecruitmentBuilding(building)) continue;

    // Per-building spawn cooldown: skip this building for one turn after its
    // defender was killed, giving the player a window to move onto the tile.
    if (building.spawnCooldownRemaining > 0) {
      building.spawnCooldownRemaining -= 1;
      continue;
    }

    // Score recruitment fresh each time so already-spawned units affect composition
    const scored = scoreRecruitmentForBuilding(state, building);
    const unitType: UnitType = scored[0]?.type ?? BUILDING_SPAWN_UNIT_TYPE[building.type] ?? UnitType.LAVA_GRUNT;

    const spawnProbability = getSpawnProbability(state, building);
    if (Math.random() >= spawnProbability) continue;

    // Only spawn on the building's own tile; skip if occupied or lava
    const buildingTile = state.grid[building.position.y][building.position.x];
    if (buildingTile.unitId !== null || buildingTile.isLava) continue;

    const spawnPosition: Position = { ...building.position };

    const unit = createEnemyUnit(spawnPosition, unitType, building.lavaBoostEnabled, state.lavaFrontRow, building.position, DIFFICULTY_MULTIPLIER[state.difficulty]);

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

/**
 * Approximate frontline stagnation check using current frontline units.
 * Without explicit historical row snapshots in GameState, this checks whether
 * any unit currently on the southernmost enemy row has moved recently.
 */
function isEnemyFrontlineStagnant(state: GameState): boolean {
  const STAGNATION_WINDOW_TURNS = 3;
  const enemyUnits = Object.values(state.units).filter(u => u.faction === Faction.ENEMY);
  if (enemyUnits.length === 0) return false;

  const southernmostEnemyRow = enemyUnits.reduce((max, u) => Math.max(max, u.position.y), -1);
  const stagnantSinceTurn = state.turn - STAGNATION_WINDOW_TURNS;

  const frontlineMovedRecently = enemyUnits.some(
    u => u.position.y === southernmostEnemyRow && u.lastMovedTurn >= stagnantSinceTurn
  );

  return !frontlineMovedRecently;
}

/** Estimate of player backline value: weighted sum of mages, archers, crystal chambers. */
function computePlayerBacklineValue(state: GameState): number {
  const playerUnits = Object.values(state.units).filter(u => u.faction === Faction.PLAYER);
  const mageCount = playerUnits.filter(u => u.type === UnitType.MAGE).length;
  const archerCount = playerUnits.filter(u => u.type === UnitType.ARCHER).length;
  const crystalChamberCount = Object.values(state.buildings).filter(
    b => b.faction === Faction.PLAYER && b.type === BuildingType.CRYSTAL_CHAMBER
  ).length;

  return mageCount * 30 + archerCount * 10 + crystalChamberCount * 20;
}

/** Number of zones (sanctum regions) where the player has captured the sanctum. */
function countPlayerControlledZones(state: GameState): number {
  const controlledZones = new Set<number>();
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.type !== BuildingType.INFERNALSANCTUM) continue;
    controlledZones.add(getZoneForRow(building.position.y));
  }
  return controlledZones.size;
}

/** Count of enemy units of a specific type in a given zone. */
function countEnemyUnitTypeInZone(state: GameState, zoneId: ZoneId, type: UnitType): number {
  return Object.values(state.units).filter(
    u => u.faction === Faction.ENEMY && u.type === type && getZoneForRow(u.position.y) === zoneId
  ).length;
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
  const C = COUNTER_UNIT_SCORING;

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

  const results: { type: UnitType; score: number }[] = [];

  for (const unitType of eligibleTypes) {
    const baseScores: Partial<Record<UnitType, number>> = {
      [UnitType.LAVA_GRUNT]: R.BASE_SCORE_GRUNT,
      [UnitType.LAVA_ARCHER]: R.BASE_SCORE_ARCHER,
      [UnitType.LAVA_RIDER]: R.BASE_SCORE_RIDER,
      [UnitType.LAVA_SIEGE]: R.BASE_SCORE_SIEGE,
      [UnitType.REAPER]: C.BASE_SCORE_REAPER,
      [UnitType.LANCER]: C.BASE_SCORE_LANCER,
      [UnitType.BULLWARK]: C.BASE_SCORE_BULLWARK,
      [UnitType.KINDLER]: C.BASE_SCORE_KINDLER,
      [UnitType.GRIMBEAK]: C.BASE_SCORE_GRIMBEAK,
      [UnitType.RIFTWORM]: C.BASE_SCORE_RIFTWORM,
      [UnitType.RIFT_LORD]: C.BASE_SCORE_RIFT_LORD,
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

    // ── REAPER scoring ──────────────────────────────────────────
    if (unitType === UnitType.REAPER) {
      if (playerProfile.meleeRatio >= 0.5 && playerProfile.totalCount >= 6) {
        score += C.REAPER_BONUS_CLUSTER_TARGET;
      }
      if (playerProfile.slowMeleeRatio >= 0.4) {
        score += C.REAPER_BONUS_SLOW_MELEE_HEAVY;
      }
      if (playerProfile.fastRatio >= 0.3) {
        score += C.REAPER_PENALTY_FAST_PLAYER;
      }
    }

    // ── LANCER scoring ──────────────────────────────────────────
    if (unitType === UnitType.LANCER) {
      if (playerProfile.rangedCount >= 2 && playerProfile.meleeCount >= 2) {
        score += C.LANCER_BONUS_BACKLINE_FORMATION;
      }
      if (playerProfile.mageCount > 0) {
        score += C.LANCER_BONUS_MAGE_PRESENT * playerProfile.mageCount;
      }
      if (countEnemyUnitTypeInZone(state, buildingZone, UnitType.LANCER) >= 2) {
        score += C.LANCER_PENALTY_OVERREPRESENTED;
      }
    }

    // ── BULLWARK scoring ─────────────────────────────────────────
    if (unitType === UnitType.BULLWARK) {
      if (playerProfile.guardCount >= 2) {
        score += C.BULLWARK_BONUS_GUARDS_PRESENT * playerProfile.guardCount;
      }
      if (zoneProfile.meleeCount >= 3) {
        score += C.BULLWARK_BONUS_MELEE_PROTECTION_NEEDED;
      }
      if (playerProfile.rangedRatio >= 0.4) {
        score += C.BULLWARK_PENALTY_PLAYER_RANGED;
      }
    }

    // ── KINDLER scoring ───────────────────────────────────────
    if (unitType === UnitType.KINDLER) {
      if (playerProfile.slowMeleeRatio >= 0.4 && playerProfile.rangedRatio >= 0.3) {
        score += C.KINDLER_BONUS_STATIC_FORMATION;
      }
      if (zoneProfile.rangedCount < 2) {
        score += C.KINDLER_BONUS_RANGED_GAP;
      }
      if (playerProfile.fastRatio >= 0.4) {
        score += C.KINDLER_PENALTY_MOBILE_PLAYER;
      }
    }

    // ── RIFTWORM scoring ────────────────────────────────────────
    if (unitType === UnitType.RIFTWORM) {
      if (playerProfile.totalCount >= 6 && playerProfile.meleeRatio >= 0.4) {
        score += C.RIFTWORM_BONUS_DENSE_FORMATION;
      }
      if (playerProfile.mageCount > 0 || playerProfile.rangedCount >= 3) {
        score += C.RIFTWORM_BONUS_BACKLINE_TARGETS;
      }
      if (isEnemyFrontlineStagnant(state)) {
        score += C.RIFTWORM_BONUS_FRONTLINE_BYPASS;
      }
      if (playerProfile.fastRatio >= 0.3) {
        score += C.RIFTWORM_PENALTY_SPREAD_PLAYER;
      }
    }

    // ── GRIMBEAK scoring ───────────────────────────────────────────
    if (unitType === UnitType.GRIMBEAK) {
      if (playerProfile.summonedCount > 0) {
        score += C.GRIMBEAK_BONUS_SUMMONED_PRESENT * playerProfile.summonedCount;
      }
      if (playerProfile.brandmarkActive) {
        score += C.GRIMBEAK_BONUS_BRANDMARK_ACTIVE;
      }
      if (playerProfile.meleeRatio >= 0.5 && playerProfile.totalCount >= 6) {
        score += C.GRIMBEAK_BONUS_CLUSTER_TARGET;
      }
    }

    // ── RIFT_LORD scoring ───────────────────────────────────────
    if (unitType === UnitType.RIFT_LORD) {
      // Hard limit: max 1 hexcaster per zone
      if (countEnemyUnitTypeInZone(state, buildingZone, UnitType.RIFT_LORD) >= 1) {
        score = -Infinity;
      } else {
        const backlineValue = computePlayerBacklineValue(state);
        if (backlineValue >= C.RIFT_LORD_BACKLINE_THRESHOLD) {
          score += C.RIFT_LORD_BONUS_HIGH_BACKLINE_VALUE;
        }
        if (countPlayerControlledZones(state) >= 2) {
          score += C.RIFT_LORD_BONUS_PLAYER_DOMINATING;
        }
        if (zoneProfile.totalCount < 2) {
          score += C.RIFT_LORD_PENALTY_NO_PORTAL_USERS;
        }
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
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, tx, ty);

      // ── BUILD_LAVA_LAIR on ruin tiles ──
      if (tile.isRuin) {
        let score = AI_SCORING.BASE_BUILD_LAVA_LAIR
          - AI_SCORING.DISTANCE_PENALTY_PER_TILE * distance;

        // Bonus if no other LAVA_LAIR buildings exist within 4 tiles (encourages spread)
        const nearbyLavaLair = Object.values(state.buildings).some(
          b => b.type === BuildingType.LAVALAIR && edgeCircleDistance(b.position.x, b.position.y, tx, ty) <= 4,
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

/**
 * Triggers PREVENTIVE_STRIKE overwatch for all player SIEGE units with the
 * PREVENTIVE_STRIKE tag. Called after an enemy unit moves to its new position.
 * Each player siege unit may fire at most once per turn (consumes hasAttackedThisTurn).
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
    if (unit.hasAttackedThisTurn) continue;
    if (!state.units[enemyUnitId]) break; // enemy was destroyed by a previous overwatch shot

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
    const attackerHpBefore = unit.stats.currentHp;
    const defenderHpBefore = enemyUnit.stats.currentHp;

    // Calculate one-directional Preventive Strike damage:
    // PREVENTIVE_STRIKE_DAMAGE_PERCENT% of the damage the siege unit would deal in a
    // normal attack against this specific enemy unit.
    const attackerCombatant = unitToCombatant(unit);
    const defenderCombatant = unitToCombatant(enemyUnit);
    const normalCombat = calculateCombatFromStats(attackerCombatant, defenderCombatant);
    const strikeRaw = normalCombat.defenderHpLost * (ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT / 100);
    const strikeDamage = Math.max(1, Math.round(strikeRaw));

    const newDefenderHp = enemyUnit.stats.currentHp - strikeDamage;
    const defenderDead = newDefenderHp <= 0;

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
    } else {
      enemyUnit.stats.currentHp = newDefenderHp;
    }

    // Mark siege unit as having fired this turn (one shot per turn).
    // Note: Preventive Strike is one-directional — the siege unit deals damage but
    // receives no counter-attack, so attacker HP never decreases during this shot.
    unit.hasAttackedThisTurn = true;

    if (events) {
      const attackerAfter = state.units[attackerId];
      const defenderAfter = state.units[defenderId];
      events.push({
        type: 'PLAYER_ATTACK',
        attackerId,
        defenderId,
        attackerPosition: attackerPos,
        defenderPosition: defenderPos,
        attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
        defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
        advancedToPosition: null,
        attackerXpGained: !defenderAfter && attackerAfter ? XP.KILL_UNIT : null,
        defenderXpGained: null,
      });
      if (!defenderAfter) {
        events.push({ type: 'UNIT_DEATH', unitId: defenderId, position: defenderPos, faction: Faction.ENEMY });
      }
    }
  }
}

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
        isEmberlingSacrifice: isSacrifice,
      });
    }
    return;
  }

  // PREVENTIVE_STRIKE: player siege units with this tag fire at the newly moved unit
  // Pass fromPosition so the trigger can check for range-entry (not already in range)
  triggerPreventiveStrike(state, unitId, from, events);

  // GRAVE_TRAP: check if the enemy unit landed on a player trap
  checkGraveTrapTrigger(state, unitId);

  // FROZEN tile: trigger the slippery slide mechanic (same as player units).
  if (state.units[unitId] && newTile.status === TileStatus.FROZEN) {
    const dx = targetPosition.x - from.x;
    const dy = targetPosition.y - from.y;
    // Normalise to unit direction (enemy can move multiple tiles per step)
    const norm = Math.max(Math.abs(dx), Math.abs(dy));
    if (norm > 0) {
      resolveSlide(state, unitId, Math.sign(dx), Math.sign(dy));
    }
  }

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

  // FROZEN tile: trigger the slippery slide mechanic.
  // Re-fetch the unit — it must still be alive (not killed by a GRAVE_TRAP or other effect).
  if (newTile.status === TileStatus.FROZEN && state.units[unitId]) {
    const moveDx = targetPosition.x - from.x;
    const moveDy = targetPosition.y - from.y;
    resolveSlide(state, unitId, moveDx, moveDy);
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
): void {
  const unit = state.units[unitId];
  if (!unit) return;
  const moveRange = unit.stats.moveRange;
  const path = findBfsPath(unit.position, targetPosition, state);
  for (let step = 0; step < Math.min(moveRange, path.length); step++) {
    const current = state.units[unitId];
    if (!current) break; // unit was destroyed (e.g. walked into lava)
    const nextPos = path[step];
    // Zone lockout: prevent crossing into a locked-out zone.
    if (SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS > 0) {
      const nextZone = getZoneForRow(nextPos.y);
      const currentZone = getZoneForRow(state.units[unitId].position.y);
      if (
        nextZone < currentZone && // moving toward player (decreasing zone number toward zone 1; southward = increasing Y)
        state.zoneLockoutUntilTurn[nextZone] !== undefined &&
        state.turn < (state.zoneLockoutUntilTurn[nextZone] ?? 0)
      ) {
        break; // stop movement — cannot cross from above into locked zone
      }
    }
    const tile = state.grid[nextPos.y][nextPos.x];
    if (tile.unitId !== null) break; // blocked by a unit occupying the tile
    moveEnemyUnit(state, unitId, nextPos, events);
    // If the unit slid on a FROZEN tile, it's no longer at nextPos — stop multi-step movement.
    const afterMove = state.units[unitId];
    if (afterMove && (afterMove.position.x !== nextPos.x || afterMove.position.y !== nextPos.y)) break;
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

  // Apply flat damage to each target
  const deathEvents: GameEvent[] = [];
  for (const targetId of targets) {
    const target = state.units[targetId];
    if (!target) continue;

    target.stats.currentHp -= explosionDamage;
    damagedUnitIds.push(targetId);
    // Track damage received by player
    state.gameStats.damageReceived += explosionDamage;

    if (target.stats.currentHp <= 0) {
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
): ScoredAction[] {
  const candidates: ScoredAction[] = [];
  const triggerRange = unit.stats.triggerRange;
  const attackRange = unit.stats.attackRange;
  // PREP tag prevents attacking after moving; PASSIVE tag prevents attacking entirely
  const canAttackThisTurn = !hasUnitActed(unit) && !(unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP)) && !unit.tags.includes(UnitTag.PASSIVE);

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
      const score = AI_SCORING.BASE_INTERCEPT_CAPTOR
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, target)
        + AI_SCORING.BONUS_PLAYER_CAPTURING
        - saturationPenalty(target.id, targetingIntents);
      candidates.push({ type: 'INTERCEPT_CAPTOR', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
    }
  }

  // ── CAPTURE_BUILDING ──
  if (!hasUnitActed(unit) && !unit.hasMovedThisTurn && unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
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
      contestable.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = contestable[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
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
      retakeable.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = retakeable[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
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
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, bestTarget.position.x, bestTarget.position.y);
      const score = AI_SCORING.BASE_ATTACK_UNIT
        - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
        + projectCombatScore(unit, bestTarget)
        - saturationPenalty(bestTarget.id, targetingIntents);
      candidates.push({ type: 'ATTACK_UNIT', score: Math.max(0, score), targetUnitId: bestTarget.id, targetPosition: bestTarget.position });
    }
  }

  // ── RANGED_ATTACK_UNIT ──
  if (canAttackThisTurn && unit.tags.includes(UnitTag.RANGED)) {
    const rangedTargets = playerUnitsInAttackRange.filter(u => edgeCircleDistance(unit.position.x, unit.position.y, u.position.x, u.position.y) > 1);
    if (rangedTargets.length > 0) {
      // PREP units that haven't moved yet: score each target individually and prefer uncounterable ones
      if (unit.tags.includes(UnitTag.PREP) && !unit.hasMovedThisTurn) {
        let bestTarget: Unit | null = null;
        let bestScore = -Infinity;
        for (const target of rangedTargets) {
          const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
          const uncounterable = target.stats.attackRange < distance;
          const score = AI_SCORING.BASE_RANGED_ATTACK_UNIT
            - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
            + projectCombatScore(unit, target)
            + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
            + (uncounterable ? AI_SCORING.BONUS_PREP_UNCOUNTERABLE_TARGET : 0)
            - saturationPenalty(target.id, targetingIntents);
          if (score > bestScore) {
            bestScore = score;
            bestTarget = target;
          }
        }
        if (bestTarget) {
          candidates.push({ type: 'RANGED_ATTACK_UNIT', score: Math.max(0, bestScore), targetUnitId: bestTarget.id, targetPosition: bestTarget.position });
        }
      } else {
        rangedTargets.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
        const target = rangedTargets[0];
        const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
        const score = AI_SCORING.BASE_RANGED_ATTACK_UNIT
          - distance * AI_SCORING.DISTANCE_PENALTY_PER_TILE
          + projectCombatScore(unit, target)
          + AI_SCORING.BONUS_RANGED_SAFE_ATTACK
          - saturationPenalty(target.id, targetingIntents);
        candidates.push({ type: 'RANGED_ATTACK_UNIT', score: Math.max(0, score), targetUnitId: target.id, targetPosition: target.position });
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
          if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) continue;
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
        const score = AI_SCORING.BASE_MOVE_TO_SAFE_RANGED_POSITION
          + bestPairScore
          - saturationPenalty(bestPairTarget.id, targetingIntents);
        candidates.push({
          type: 'MOVE_TO_SAFE_RANGED_POSITION',
          score: Math.max(0, score),
          targetUnitId: bestPairTarget.id,
          targetPosition: bestPairTile,
        });
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
          candidates.push({
            type: 'MOVE_TO_SAFE_RANGED_POSITION',
            score: AI_SCORING.BASE_RETREAT_FROM_ADJACENT,
            targetPosition: bestSafeTile,
          });
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
      return edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y) > 1;
    });

    if (rangedBuildingTargets.length > 0) {
      rangedBuildingTargets.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const target = rangedBuildingTargets[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
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
        if (edgeCircleDistance(u.position.x, u.position.y, b.position.x, b.position.y) <= 3) return true;
      }
      return false;
    });

    if (defendable.length > 0) {
      defendable.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = defendable[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
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
        if (edgeCircleDistance(u.position.x, u.position.y, b.position.x, b.position.y) <= 5) return true;
      }
      return false;
    });

    if (spawners.length > 0) {
      spawners.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = spawners[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
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
      playerBuildings.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = playerBuildings[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
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
      neutralBuildings.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const building = neutralBuildings[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, building.position.x, building.position.y);
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
      outOfAttackRange.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
      const target = outOfAttackRange[0];
      const distance = edgeCircleDistance(unit.position.x, unit.position.y, target.position.x, target.position.y);
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

  // ── SPREAD_TO_FLANK ──
  // Steers idle units toward neutral buildings in columns with few allied units,
  // ensuring horizontal map coverage when no immediate threats exist.
  if (!unit.hasMovedThisTurn) {
    const triggerRangeIds = new Set(buildingsInTriggerRange.map(b => b.id));
    const outOfRangeNeutrals = Object.values(state.buildings).filter(b => {
      if (b.faction !== null) return false;
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
        candidates.push({
          type: 'SPREAD_TO_FLANK',
          score: bestScore,
          targetBuildingId: bestBuilding.id,
          targetPosition: bestBuilding.position,
        });
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
    const lavaTarget: Position = { x: unit.position.x, y: Math.min(MAP.GRID_HEIGHT - 1, state.lavaFrontRow) };
    if (isBlockedFromLava) {
      // When blocked, target the nearest player unit to push through the blocker
      const playerUnits = Object.values(state.units).filter(u => u.faction === Faction.PLAYER);
      if (playerUnits.length > 0) {
        playerUnits.sort((a, b) => edgeCircleDistance(unit.position.x, unit.position.y, a.position.x, a.position.y) - edgeCircleDistance(unit.position.x, unit.position.y, b.position.x, b.position.y));
        candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: playerUnits[0].position });
      } else {
        // No player units to push through — BFS will navigate around obstacles
        candidates.push({ type: 'ADVANCE_TOWARD_LAVA', score, targetPosition: lavaTarget });
      }
    } else {
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
  if (!hasUnitActed(unit) && unit.tags.includes(UnitTag.EXPLOSIVE)) {
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
  if (!hasUnitActed(unit) && !unit.hasMovedThisTurn) {
    scoreConstructionActions(unit, state, candidates);
  }

  // ── HOLD_POSITION ──
  candidates.push({ type: 'HOLD_POSITION', score: AI_SCORING.BASE_HOLD_POSITION });

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
      if (usersThisTurn >= EMBER_PORTAL_MAX_USERS_PER_TURN) continue;

      // Check reachability using BFS path existence.
      const path = findBfsPath(unit.position, portal.entrancePos, state);
      if (path.length === 0 && (unit.position.x !== portal.entrancePos.x || unit.position.y !== portal.entrancePos.y)) continue;

      const distance = edgeCircleDistance(unit.position.x, unit.position.y, portal.entrancePos.x, portal.entrancePos.y);
      const score = EMBER_PORTAL_BASE_USE_SCORE - (distance * EMBER_PORTAL_DISTANCE_PENALTY);
      if (score <= 0) continue;

      candidates.push({
        type: 'MOVE_TO_PORTAL',
        score,
        targetPosition: portal.entrancePos,
        portalIntentId: portal.id,
      });
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

          const secondaryEvents: GameEvent[] = [];
          resolveAttack(state, attackerId, defenderId, suppressFloaters, secondaryEvents);

          if (events) {
            const attackerAfter = state.units[attackerId];
            const defenderAfter = state.units[defenderId];
            const advancedToPosition = (
              !defenderAfter &&
              attackerAfter &&
              (attackerAfter.position.x !== attackerPos.x || attackerAfter.position.y !== attackerPos.y)
            ) ? { x: attackerAfter.position.x, y: attackerAfter.position.y } : null;
            // Attacker earns XP for killing the defender; defender earns XP for a counter-kill.
            const attackerXpGained = !defenderAfter && attackerAfter ? XP.KILL_UNIT : null;
            const defenderXpGained = !attackerAfter ? XP.KILL_UNIT : null;
            events.push({
              type: 'ENEMY_ATTACK',
              attackerId,
              defenderId,
              attackerPosition: attackerPos,
              defenderPosition: defenderPos,
              attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
              defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
              advancedToPosition,
              attackerXpGained,
              defenderXpGained,
            });
            if (!defenderAfter) {
              events.push({ type: 'UNIT_DEATH', unitId: defenderId, position: defenderPos, faction: targetUnit.faction });
            }
            if (!attackerAfter) {
              events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
            }
            events.push(...secondaryEvents);
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

        const secondaryEvents: GameEvent[] = [];
        resolveAttack(state, attackerId, defenderId, suppressFloaters, secondaryEvents);

        if (events) {
          const attackerAfter = state.units[attackerId];
          const defenderAfter = state.units[defenderId];
          const attackerXpGained = !defenderAfter && attackerAfter ? XP.KILL_UNIT : null;
          const defenderXpGained = !attackerAfter ? XP.KILL_UNIT : null;
          events.push({
            type: 'ENEMY_ATTACK',
            attackerId,
            defenderId,
            attackerPosition: attackerPos,
            defenderPosition: defenderPos,
            attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
            defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
            advancedToPosition: null,
            attackerXpGained,
            defenderXpGained,
          });
          if (!defenderAfter) {
            events.push({ type: 'UNIT_DEATH', unitId: defenderId, position: defenderPos, faction: targetUnit.faction });
          }
          if (!attackerAfter) {
            events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
          }
          events.push(...secondaryEvents);
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

            const secondaryEvents: GameEvent[] = [];
            resolveAttackOnBuilding(state, attackerId, buildingId, suppressFloaters, secondaryEvents);

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
                attackerHpLost: attackerAfter ? attackerHpBefore - attackerAfter.stats.currentHp : attackerHpBefore,
                buildingHpLost: buildingAfter ? buildingHpBefore - buildingAfter.hp : buildingHpBefore,
                advancedToPosition,
              });
              if (!attackerAfter) {
                events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPos, faction: currentUnit.faction });
              }
              events.push(...secondaryEvents);
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

    case 'MOVE_TO_SAFE_RANGED_POSITION': {
      if (action.targetPosition && !currentUnit.hasMovedThisTurn) {
        moveEnemyUnit(state, currentUnit.id, action.targetPosition, events);
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
        const fallbackPos = { x: currentUnit.position.x, y: currentUnit.position.y };
        destroyUnit(state, currentUnit.id, events);
        state.ember += 1;
        state.emberLevelSources.emberlingSacrifices += 1;
        if (events) {
          events.push({
            type: 'EMBER_LEVEL_UP',
            position: fallbackPos,
            amount: 1,
            isEmberlingSacrifice: true,
          });
        }
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
          enemyConstructBuilding(state, currentUnit.id, action.targetPosition, BuildingType.LAVALAIR, suppressFloaters);
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
          enemyConstructBuilding(state, currentUnit.id, action.targetPosition, BuildingType.INFERNALSANCTUM, suppressFloaters);
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
          corruptTerrain(state, currentUnit.id, action.targetPosition, events ?? undefined);
          currentUnit.hasConstructedThisTurn = true;
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

    case 'MOVE_TO_PORTAL': {
      if (action.targetPosition && !currentUnit.hasMovedThisTurn) {
        moveEnemyUnitToward(state, currentUnit.id, action.targetPosition, events);
      }
      break;
    }
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
  portalUsageIntents: Map<string, number>,
  events?: GameEvent[],
): void {
  // All units go through the unified scoring — tag-based behaviors
  // (EXPLOSIVE, SACRIFICIAL, etc.) are handled within scoreActionsForUnit
  const candidates = scoreActionsForUnit(unit, state, targetingIntents, recentlyLostBuildingIds, portalUsageIntents);

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

  executeAction(unit, chosen, state, events);
}

// ============================================================================
// EMBER SCALING
// ============================================================================

export function updateEmberFromTurn(state: Draft<GameState>): void {
  if (state.turn > 0 && state.turn % 10 === 0) {
    state.ember += 1;
    state.emberLevelSources.turns += 1;
  }
}

export function increaseEmberOnStrongholdCapture(state: Draft<GameState>): void {
  state.ember += 1;
  state.emberLevelSources.other += 1;
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
  const attackerHpBefore = attacker.stats.currentHp;
  const defenderHpBefore = defender.stats.currentHp;
  const defenderFaction = defender.faction;

  resolveAttack(state, attackerId, defenderId, !!events);

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
    events.push({
      type: 'ENEMY_ATTACK',
      attackerId,
      defenderId,
      attackerPosition: attackerPos,
      defenderPosition: defenderPos,
      attackerHpLost: attackerAfter
        ? attackerHpBefore - attackerAfter.stats.currentHp
        : attackerHpBefore,
      defenderHpLost: defenderAfter
        ? defenderHpBefore - defenderAfter.stats.currentHp
        : defenderHpBefore,
      advancedToPosition,
      attackerXpGained: !defenderAfter && attackerAfter ? XP.KILL_UNIT : null,
      defenderXpGained: !attackerAfter ? XP.KILL_UNIT : null,
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
function runCaveMonsterAi(state: Draft<GameState>, events?: GameEvent[]): void {
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

    // Skip if the unit already acted this turn (spawn turn: all flags are true)
    if (hasUnitActed(unit)) continue;

    const homePos = parseMountainTileId(encounter.mountainTileId);
    if (!homePos) continue;

    const playerUnits = Object.values(state.units).filter(
      (u) => u.faction === Faction.PLAYER,
    );

    // ── Priority 1: Attack a player unit already in attack range ─────────
    let directTarget: Unit | null = null;
    for (const playerUnit of playerUnits) {
      if (isTileWithinEdgeCircleRange(
        unit.position.x, unit.position.y,
        playerUnit.position.x, playerUnit.position.y,
        unit.stats.attackRange,
      )) {
        directTarget = playerUnit;
        break;
      }
    }

    if (directTarget) {
      resolveCaveMonsterAttack(state, unit.id, directTarget.id, events);
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
      moveEnemyUnitToward(state, unit.id, aggroTarget.position, events);
      // Re-fetch the unit — it may have been destroyed (e.g. PREVENTIVE_STRIKE)
      const movedUnit = state.units[unit.id];
      if (!movedUnit) {
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
      continue;
    }

    // ── Priority 3: Return to home mountain; despawn on arrival ──────────
    const onHomeTile =
      unit.position.x === homePos.x && unit.position.y === homePos.y;

    if (onHomeTile) {
      // Despawn: monster has returned to its mountain with no nearby threat.
      const tile = state.grid[unit.position.y][unit.position.x];
      if (tile.unitId === unit.id) tile.unitId = null;
      // Defensively destroy any Mine that may have been placed on the mountain tile
      if (tile.buildingId !== null) {
        const building = state.buildings[tile.buildingId];
        if (building && building.type === BuildingType.MINE) {
          tile.buildingId = null;
          delete state.buildings[building.id];
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
    moveEnemyUnitToward(state, unit.id, homePos, events);
    // If destroyed en route (e.g. lava), clean up the encounter
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

export function runEnemyTurn(state: GameState): { finalState: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const finalState = produce(state, (draft) => {
    // 0. Process deferred enemy level-ups (XP may have been earned during player turn)
    processEnemyLevelUps(draft);

    // Reset the per-turn spawn counter at the start of each enemy turn
    draft.enemyUnitsSpawnedLastTurn = 0;

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
    runCaveMonsterAi(draft, events);

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
        if (hasUnitActed(currentUnit)) break;
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
        decideAndExecute(currentUnit, draft, targetingIntents, recentlyLostBuildingIds, portalUsageIntents, events);
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

    // 4. Reset enemy unit action flags for next turn
    for (const unit of Object.values(draft.units)) {
      if (unit.faction === Faction.ENEMY) {
        unit.hasMovedThisTurn = false;
        unit.hasAttackedThisTurn = false;
        unit.hasCapturedThisTurn = false;
        unit.hasConstructedThisTurn = false;
        unit.hasDestroyedThisTurn = false;
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
  return { finalState, events };
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
export function computeUnitAiScores(state: GameState, unitId: string): ScoredAction[] {
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
