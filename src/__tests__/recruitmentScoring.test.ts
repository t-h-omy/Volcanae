/**
 * Tests for Part 8: AI recruitment scoring responds to player army composition.
 *
 * Each test sets up a minimal GameState with a specific player army profile and
 * verifies that the scoring system surfaces the expected counter-unit type.
 *
 * Zone mapping (GRID_HEIGHT=41, LAVA_BUFFER_ROWS=6, ZONE_HEIGHT=7):
 *   Row 5  → zone 5 (north, enemy territory)
 *   Row 30 → zone 1 (south, player territory)
 */

import { describe, it, expect } from 'vitest';
import { computeRecruitmentScores } from '../enemySystem';
import { UnitType, BuildingType, Faction, UnitTag, DestroyBehavior } from '../types';
import type { GameState, Unit, Building } from '../types';
import { UNIT_DEFINITIONS } from '../gameConfig';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++_idCounter}`;
}

/** Create a minimal player unit. extraTags are appended to the type's base tags. */
function makePlayerUnit(type: UnitType, extraTags: UnitTag[] = []): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId('unit'),
    type,
    faction: Faction.PLAYER,
    position: { x: 4, y: 30 },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: [...def.tags, ...extraTags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

/** Create a minimal enemy unit at the given row. */
function makeEnemyUnit(type: UnitType, row: number, lastMovedTurn = 0): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId('enemy'),
    type,
    faction: Faction.ENEMY,
    position: { x: 4, y: row },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn,
  };
}

/** Create a minimal LAVALAIR building at the given row (zone 5 when row=5). */
function makeLavaLair(row = 5): Building {
  return {
    id: nextId('lair'),
    type: BuildingType.LAVALAIR,
    faction: Faction.ENEMY,
    position: { x: 4, y: row },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 0,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}

/**
 * Build a minimal GameState from a set of units, buildings, and ember level.
 * Only the fields accessed by scoreRecruitmentForBuilding and its helpers are
 * populated; everything else is left as defaults via the cast.
 */
function makeState(
  units: Unit[],
  buildings: Building[],
  ember: number,
  turn = 1,
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  return {
    units: unitsMap,
    buildings: buildingsMap,
    ember,
    turn,
    portals: {},
  } as unknown as GameState;
}

/** Return the top-ranked unit type from the scored list. */
function topType(scores: { type: UnitType; score: number }[]): UnitType {
  return scores[0].type;
}

/** Return the score for a specific unit type from the scored list. */
function scoreFor(
  scores: { type: UnitType; score: number }[],
  type: UnitType,
): number {
  return scores.find(s => s.type === type)?.score ?? -Infinity;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Part 8: AI recruitment scoring', () => {
  /**
   * 8.4 Test 1: REAPER is preferred when the player has a slow-melee cluster.
   *
   * Setup: 6 SPEARMAN units (all slow-melee, moveRange=1, attackRange=1).
   * Triggers: REAPER_BONUS_CLUSTER_TARGET (meleeRatio≥0.5 & totalCount≥6)
   *         + REAPER_BONUS_SLOW_MELEE_HEAVY (slowMeleeRatio≥0.4).
   */
  it('recruits REAPER preferentially when player has a slow-melee cluster', () => {
    const lair = makeLavaLair(5);
    const playerUnits = Array.from({ length: 6 }, () => makePlayerUnit(UnitType.SPEARMAN));
    const state = makeState(playerUnits, [lair], /* ember */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(topType(scores)).toBe(UnitType.REAPER);
  });

  /**
   * 8.4 Test 2: LANCER is preferred when the player has Mage units.
   *
   * Setup: 3 MAGE units.
   * Triggers: LANCER_BONUS_MAGE_PRESENT × mageCount (3×30 = 90).
   */
  it('recruits LANCER preferentially when player has Mage units', () => {
    const lair = makeLavaLair(5);
    const playerUnits = Array.from({ length: 3 }, () => makePlayerUnit(UnitType.MAGE));
    const state = makeState(playerUnits, [lair], /* ember */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(topType(scores)).toBe(UnitType.LANCER);
  });

  /**
   * 8.4 Test 3: BULLWARK is preferred when the player has Guard units.
   *
   * Setup: 6 GUARD units.
   * Triggers: BULLWARK_BONUS_GUARDS_PRESENT × guardCount (6×25 = 150), giving
   *           total 205 — comfortably above REAPER's cluster+slow-melee (110).
   */
  it('recruits BULLWARK preferentially when player has Guard units', () => {
    const lair = makeLavaLair(5);
    const playerUnits = Array.from({ length: 6 }, () => makePlayerUnit(UnitType.GUARD));
    const state = makeState(playerUnits, [lair], /* ember */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(topType(scores)).toBe(UnitType.BULLWARK);
  });

  /**
   * 8.4 Test 4: KINDLER is preferred for a static mixed formation.
   *
   * Setup: 3 SPEARMANs (slow-melee) + 2 ARCHERs (ranged, moveRange=1).
   * - slowMeleeRatio = 3/5 = 0.60 ≥ 0.4  ✓
   * - rangedRatio    = 2/5 = 0.40 ≥ 0.3  ✓
   * - totalCount = 5 (< 6) prevents the BURROWER dense-formation bonus.
   * - meleeRatio = 3/5 = 0.60 but totalCount < 6 → REAPER cluster blocked.
   */
  it('recruits KINDLER preferentially when player has a static mixed formation', () => {
    const lair = makeLavaLair(5);
    const playerUnits = [
      ...Array.from({ length: 3 }, () => makePlayerUnit(UnitType.SPEARMAN)),
      ...Array.from({ length: 2 }, () => makePlayerUnit(UnitType.ARCHER)),
    ];
    const state = makeState(playerUnits, [lair], /* ember */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(topType(scores)).toBe(UnitType.KINDLER);
  });

  /**
   * 8.4 Test 5: RIFTWORM is preferred when the enemy frontline is stagnant.
   *
   * Setup: 4 SPEARMANs + 2 MAGEs (player); 1 LAVA_GRUNT enemy unit with
   * lastMovedTurn=0 at row 5. With turn=10, stagnantSinceTurn=7:
   *   lastMovedTurn(0) < stagnantSinceTurn(7) → stagnant=true.
   * Triggers: RIFTWORM_BONUS_DENSE_FORMATION + RIFTWORM_BONUS_BACKLINE_TARGETS
   *         + RIFTWORM_BONUS_FRONTLINE_BYPASS (stagnant).
   */
  it('recruits RIFTWORM preferentially when the enemy frontline is stagnant', () => {
    const lair = makeLavaLair(5);
    const playerUnits = [
      ...Array.from({ length: 4 }, () => makePlayerUnit(UnitType.SPEARMAN)),
      ...Array.from({ length: 2 }, () => makePlayerUnit(UnitType.MAGE)),
    ];
    // Enemy frontline unit that has NOT moved recently → triggers stagnation
    const enemyFrontline = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, /* lastMovedTurn */ 0);
    const state = makeState([...playerUnits, enemyFrontline], [lair], /* ember */ 10, /* turn */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(topType(scores)).toBe(UnitType.RIFTWORM);
  });

  /**
   * 8.4 Test 6: GRIMBEAK is preferred when the player has summoned units.
   *
   * Setup: 6 SKELETON units tagged with SUMMONED.
   * Triggers: GRIMBEAK_BONUS_SUMMONED_PRESENT × summonedCount (6×25 = 150)
   *         + GRIMBEAK_BONUS_CLUSTER_TARGET (meleeRatio≥0.5 & totalCount≥6, +20).
   * Total = 50 + 150 + 20 = 220, well above REAPER (110).
   */
  it('recruits GRIMBEAK preferentially when player has summoned units', () => {
    const lair = makeLavaLair(5);
    const playerUnits = Array.from({ length: 6 }, () =>
      makePlayerUnit(UnitType.SKELETON, [UnitTag.SUMMONED]),
    );
    const state = makeState(playerUnits, [lair], /* ember */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(topType(scores)).toBe(UnitType.GRIMBEAK);
  });

  /**
   * 8.4 Test 7: RIFT_LORD is hard-capped at 1 per zone.
   *
   * When a RIFT_LORD is already present in the building's zone, the
   * scorer must return −Infinity for HEXCASTER (hard limit enforced).
   */
  it('never scores RIFT_LORD above −Infinity when one is already in the zone', () => {
    const lair = makeLavaLair(5);
    // Place an existing HEXCASTER in zone 5 (same row as the lair)
    const existingHexcaster = makeEnemyUnit(UnitType.RIFT_LORD, 5);
    const state = makeState([existingHexcaster], [lair], /* ember */ 10);

    const scores = computeRecruitmentScores(state, lair.id)!;
    expect(scores).not.toBeNull();
    expect(scoreFor(scores, UnitType.RIFT_LORD)).toBe(-Infinity);
    expect(topType(scores)).not.toBe(UnitType.RIFT_LORD);
  });
});
