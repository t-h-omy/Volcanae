/**
 * Tests for PROMPT 2 changes:
 *
 *   2A – Preventive Strike disabled on corrupted tiles
 *   2B – Explosive only detonates when adjacent to an enemy
 *   2C – Grimbeak picks summoned target over non-summoned when both are in range
 *   2D – Tagless unit on CORRUPTED tile has no debuff; RAGE unit does
 *
 * All tests that invoke resolveExplosion / runEnemyTurn do so via pure logic
 * (no React stores / floaters).
 * The grid uses MAP.GRID_WIDTH × MAP.GRID_HEIGHT so the BFS never goes
 * out-of-bounds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { produce } from 'immer';
import { resolveExplosion, runEnemyTurn } from '../enemySystem';
import { isUnitOnCorruptedTile } from '../tileStatusSystem';
import { canUnitHeal, getHealTargets } from '../unitActions';
import { CORRUPTED_SUPPRESSED_TAGS, UNIT_DEFINITIONS, MAP } from '../gameConfig';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { RENDER } from '../renderConfig';
import {
  Faction, UnitType, UnitTag, TileType, TileStatus, DestroyBehavior, BuildingType,
} from '../types';
import type { GameState, Unit, Tile, Building, GameStats } from '../types';
import type { GameEvent } from '../gameEvents';

// ── ID counter ────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
  };
}

function makeTile(x: number, y: number, overrides: Partial<Tile> = {}): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status: null,
    ...overrides,
  };
}

/**
 * Creates a full-sized grid (MAP.GRID_WIDTH × MAP.GRID_HEIGHT) so the BFS in
 * the AI never accesses an out-of-bounds row.
 */
function makeFullGrid(
  unitPlacements: { id: string; x: number; y: number }[] = [],
  buildingPlacements: { id: string; x: number; y: number }[] = [],
  tileOverrides: { x: number; y: number; overrides: Partial<Tile> }[] = [],
): Tile[][] {
  const cols = MAP.GRID_WIDTH;
  const rows = MAP.GRID_HEIGHT;
  const grid: Tile[][] = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) grid[y][x].unitId = id;
  for (const { id, x, y } of buildingPlacements) grid[y][x].buildingId = id;
  for (const { x, y, overrides } of tileOverrides) {
    grid[y][x] = { ...grid[y][x], ...overrides };
  }
  return grid;
}

/** Smaller grid for tests that don't trigger BFS (resolveExplosion, pure logic). */
function makeSmallGrid(
  unitPlacements: { id: string; x: number; y: number }[] = [],
): Tile[][] {
  const cols = 9;
  const rows = 10;
  const grid: Tile[][] = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) grid[y][x].unitId = id;
  return grid;
}

function makeBuilding(
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id: nextId(`bld_${type}`),
    type,
    faction,
    position: { x, y },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 2,
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
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    ...overrides,
  };
}

function makeUnit(
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  overrides: Partial<Unit> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  const id = nextId(`u_${type}_${faction}`);
  return {
    id,
    type,
    faction,
    position: { x, y },
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
    lastMovedTurn: 0,
    ...overrides,
  };
}

/** Build a GameState backed by a full MAP-sized grid for runEnemyTurn tests. */
function makeStateForEnemyTurn(
  units: Unit[],
  buildings: Building[] = [],
  tileOverrides: { x: number; y: number; overrides: Partial<Tile> }[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  const grid = makeFullGrid(
    units.map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })),
    buildings.map((b) => ({ id: b.id, x: b.position.x, y: b.position.y })),
    tileOverrides,
  );

  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 3,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow: 70,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techNodes: {} as GameState['techNodes'],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    portals: {},
    phase: 'PLAYER_TURN' as GameState['phase'],
  } as unknown as GameState;
}

/** Build a GameState backed by a small grid for pure-logic tests (no BFS). */
function makeSmallState(
  units: Unit[],
  tileOverrides: { x: number; y: number; overrides: Partial<Tile> }[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;

  const grid = makeSmallGrid(
    units.map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })),
  );
  for (const { x, y, overrides } of tileOverrides) {
    grid[y][x] = { ...grid[y][x], ...overrides };
  }

  return {
    units: unitsMap,
    buildings: {},
    grid,
    techFlags: [],
    gameStats: {
      unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
      unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
      techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
    },
    turn: 3,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow: 70,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techNodes: {} as GameState['techNodes'],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    portals: {},
    phase: 'PLAYER_TURN' as GameState['phase'],
  } as unknown as GameState;
}

// ============================================================================
// 2A — Preventive Strike disabled on corrupted tiles
// ============================================================================

describe('2A – Preventive Strike disabled on corrupted tiles', () => {
  /**
   * PREVENTIVE_STRIKE must be in CORRUPTED_SUPPRESSED_TAGS so the debuff
   * visualisation (GridRenderer + HUD) flags it correctly.
   */
  it('PREVENTIVE_STRIKE is in CORRUPTED_SUPPRESSED_TAGS', () => {
    expect(CORRUPTED_SUPPRESSED_TAGS.has(UnitTag.PREVENTIVE_STRIKE)).toBe(true);
  });

  /**
   * A siege unit with PREVENTIVE_STRIKE standing on a CLEAN tile fires at an
   * enemy that moves from outside (distance 4) into range (distance ≤ 3).
   * Grid: 9 wide × 76 tall (MAP dimensions) to avoid BFS OOB errors.
   *   siege at (4, 40) — centre column, mid-map.
   *   enemy LAVA_GRUNT at (4, 36) — distance 4 from siege, outside attackRange 3.
   *   player anchor at (4, 70) — attracts the grunt southward.
   * After runEnemyTurn the grunt moves to (4, 37), distance 3 → in range → overwatch fires.
   */
  it('siege unit on CLEAN tile fires preventive strike when enemy enters range', () => {
    // Siege with PREVENTIVE_STRIKE at row 40, triggerRange=3, attackRange=3.
    const siege = makeUnit(UnitType.SIEGE, Faction.PLAYER, 4, 40, {
      tags: [UnitTag.PREVENTIVE_STRIKE, UnitTag.RANGED, UnitTag.PREP],
      stats: {
        maxHp: 75, currentHp: 75, attack: 85, defense: 0,
        moveRange: 1, discoverRadius: 1, triggerRange: 3, movementActions: 1, attackRange: 3,
      },
    });

    // Player anchor unit far south to attract the grunt.
    const playerAnchor = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 70);

    // Enemy grunt starts at (4,36): distance to siege = 40-36 = 4 → outside range.
    // It will move toward the player (south), reaching (4,37): distance 3 → in range.
    const lavaGrunt = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 36, {
      stats: {
        maxHp: 100, currentHp: 100, attack: 50, defense: 50,
        moveRange: 1, discoverRadius: 1, triggerRange: 3, movementActions: 1, attackRange: 1,
      },
    });

    const lavaLair = makeBuilding(BuildingType.LAVALAIR, Faction.ENEMY, 4, 0);

    const state = makeStateForEnemyTurn(
      [siege, playerAnchor, lavaGrunt],
      [lavaLair],
    );

    const hpBefore = state.units[lavaGrunt.id]!.stats.currentHp;
    const { finalState } = runEnemyTurn(state);
    const enemyAfter = finalState.units[lavaGrunt.id];
    const hpAfter = enemyAfter?.stats.currentHp ?? 0;

    // Preventive strike should have fired — enemy HP must have dropped.
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  /**
   * Same setup, but the siege tile is CORRUPTED.
   * The grunt moves into range but the overwatch must NOT fire.
   */
  it('siege unit on CORRUPTED tile does NOT fire preventive strike', () => {
    const siege = makeUnit(UnitType.SIEGE, Faction.PLAYER, 4, 40, {
      tags: [UnitTag.PREVENTIVE_STRIKE, UnitTag.RANGED, UnitTag.PREP],
      stats: {
        maxHp: 75, currentHp: 75, attack: 85, defense: 0,
        moveRange: 1, discoverRadius: 1, triggerRange: 3, movementActions: 1, attackRange: 3,
      },
    });

    const playerAnchor = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 70);
    const lavaGrunt = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 36, {
      stats: {
        maxHp: 100, currentHp: 100, attack: 50, defense: 50,
        moveRange: 1, discoverRadius: 1, triggerRange: 3, movementActions: 1, attackRange: 1,
      },
    });
    const lavaLair = makeBuilding(BuildingType.LAVALAIR, Faction.ENEMY, 4, 0);

    // Siege tile is CORRUPTED → overwatch suppressed.
    const state = makeStateForEnemyTurn(
      [siege, playerAnchor, lavaGrunt],
      [lavaLair],
      [{ x: 4, y: 40, overrides: { status: TileStatus.CORRUPTED } }],
    );

    const hpBefore = state.units[lavaGrunt.id]!.stats.currentHp;
    const { finalState } = runEnemyTurn(state);
    const enemyAfter = finalState.units[lavaGrunt.id];
    const hpAfter = enemyAfter?.stats.currentHp ?? 0;

    // No overwatch shot; grunt should arrive at its new position with full HP.
    // (No other player unit is adjacent to fire at the grunt.)
    expect(hpAfter).toBe(hpBefore);
  });
});

// ============================================================================
// 2B — Explosive only detonates when adjacent to an enemy
// ============================================================================

describe('2B – Explosive unit does not detonate with no adjacent player', () => {
  /**
   * resolveExplosion called with no player units adjacent → unit survives,
   * no EXPLOSION event is emitted.
   */
  it('resolveExplosion aborts silently when no adjacent player units exist', () => {
    const emberling = makeUnit(UnitType.EMBERLING, Faction.ENEMY, 4, 4);

    const state = makeSmallState([emberling]);
    const events: GameEvent[] = [];

    const nextState = produce(state, (draft) => {
      resolveExplosion(draft, emberling.id, events);
    });

    // No EXPLOSION event must have been emitted.
    expect(events.some((e) => e.type === 'EXPLOSION')).toBe(false);

    // The unit must still be alive (not removed).
    expect(nextState.units[emberling.id]).toBeDefined();
  });

  /**
   * resolveExplosion with an adjacent player unit → EXPLOSION event emitted,
   * player unit takes damage, explosive unit is destroyed.
   */
  it('resolveExplosion fires and destroys the unit when a player is adjacent', () => {
    const emberling = makeUnit(UnitType.EMBERLING, Faction.ENEMY, 4, 4);
    const player = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 5); // adjacent

    const state = makeSmallState([emberling, player]);
    const events: GameEvent[] = [];

    const nextState = produce(state, (draft) => {
      resolveExplosion(draft, emberling.id, events);
    });

    // EXPLOSION event must have been emitted.
    expect(events.some((e) => e.type === 'EXPLOSION')).toBe(true);

    // The explosive unit must be removed.
    expect(nextState.units[emberling.id]).toBeUndefined();

    // The adjacent player unit must have taken damage (or been killed).
    const playerAfter = nextState.units[player.id];
    const playerHp = playerAfter?.stats.currentHp ?? 0;
    expect(playerHp).toBeLessThan(player.stats.currentHp);
  });
});

// ============================================================================
// 2C — Grimbeak picks summoned target when both are in range
// ============================================================================

describe('2C – Grimbeak prefers summoned target over non-summoned target', () => {
  /**
   * Grimbeak at (4, 40) with two player units adjacent:
   *   - SPEARMAN (no SUMMONED tag) at (3, 40)
   *   - A SUMMONED-tagged unit at (5, 40)
   * Grimbeak should attack the SUMMONED unit.
   * Grid is full MAP size to allow BFS to run safely.
   */
  it('Grimbeak attacks the summoned unit when both targets are in melee range', () => {
    const grimbeak = makeUnit(UnitType.GRIMBEAK, Faction.ENEMY, 4, 40);
    // Summoned unit (give it SUMMONED tag to represent any summoned unit).
    const summonedUnit = makeUnit(UnitType.EMBER_DEMON, Faction.PLAYER, 5, 40, {
      tags: [UnitTag.SUMMONED],
    });
    const normalUnit = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 3, 40);

    const lavaLair = makeBuilding(BuildingType.LAVALAIR, Faction.ENEMY, 4, 0);

    const state = makeStateForEnemyTurn(
      [grimbeak, summonedUnit, normalUnit],
      [lavaLair],
    );

    const { finalState } = runEnemyTurn(state);

    // The summoned unit should have taken damage (preferred target).
    const summonedAfter = finalState.units[summonedUnit.id];
    const summonedHp = summonedAfter?.stats.currentHp ?? 0;
    expect(summonedHp).toBeLessThan(summonedUnit.stats.currentHp);

    // The non-summoned unit should NOT have taken damage.
    const normalAfter = finalState.units[normalUnit.id];
    expect(normalAfter?.stats.currentHp).toBe(normalUnit.stats.currentHp);
  });
});

// ============================================================================
// 2D — Corruption debuff only applies when unit has suppressed tags
// ============================================================================

describe('2D – Corruption debuff logic (CORRUPTED_SUPPRESSED_TAGS)', () => {
  /**
   * A tagless player unit on a CORRUPTED tile must have no suppressed tags
   * → corruptionAffectsUnit = false.
   */
  it('tagless unit on CORRUPTED tile has no tags in CORRUPTED_SUPPRESSED_TAGS', () => {
    const scout = makeUnit(UnitType.SCOUT, Faction.PLAYER, 4, 4, {
      tags: [], // explicitly no tags
    });

    const state = makeSmallState(
      [scout],
      [{ x: 4, y: 4, overrides: { status: TileStatus.CORRUPTED } }],
    );

    expect(isUnitOnCorruptedTile(state, scout.id)).toBe(true);
    const hasAffectedTag = scout.tags.some((t) => CORRUPTED_SUPPRESSED_TAGS.has(t));
    expect(hasAffectedTag).toBe(false);
    // corruptionAffectsUnit = isOnCorruptedTile && hasAffectedTag = false
    expect(isUnitOnCorruptedTile(state, scout.id) && hasAffectedTag).toBe(false);
  });

  /**
   * A RAGE unit on a CORRUPTED tile has a suppressed tag → corruptionAffectsUnit = true.
   */
  it('RAGE unit on CORRUPTED tile has suppressed tag → corruptionAffectsUnit is true', () => {
    const rageUnit = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 4, {
      tags: [UnitTag.RAGE],
    });

    const state = makeSmallState(
      [rageUnit],
      [{ x: 4, y: 4, overrides: { status: TileStatus.CORRUPTED } }],
    );

    expect(isUnitOnCorruptedTile(state, rageUnit.id)).toBe(true);
    const hasAffectedTag = rageUnit.tags.some((t) => CORRUPTED_SUPPRESSED_TAGS.has(t));
    expect(hasAffectedTag).toBe(true);
    expect(isUnitOnCorruptedTile(state, rageUnit.id) && hasAffectedTag).toBe(true);
  });

  /**
   * A SIEGE unit with PREVENTIVE_STRIKE on a CORRUPTED tile has a suppressed tag
   * → corruptionAffectsUnit = true.
   */
  it('PREVENTIVE_STRIKE siege unit on CORRUPTED tile → corruptionAffectsUnit is true', () => {
    const siege = makeUnit(UnitType.SIEGE, Faction.PLAYER, 4, 4, {
      tags: [UnitTag.PREVENTIVE_STRIKE, UnitTag.RANGED, UnitTag.PREP],
    });

    const state = makeSmallState(
      [siege],
      [{ x: 4, y: 4, overrides: { status: TileStatus.CORRUPTED } }],
    );

    expect(isUnitOnCorruptedTile(state, siege.id)).toBe(true);
    const hasAffectedTag = siege.tags.some((t) => CORRUPTED_SUPPRESSED_TAGS.has(t));
    expect(hasAffectedTag).toBe(true);
  });

  it('PATCHUP unit on CORRUPTED tile still passes canUnitHeal but is in suppressed-tag set', () => {
    const healer = makeUnit(UnitType.SCOUT, Faction.PLAYER, 4, 4, {
      tags: [UnitTag.PATCHUP],
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
      hasCapturedThisTurn: false,
      hasConstructedThisTurn: false,
      hasDestroyedThisTurn: false,
    });

    const state = makeSmallState(
      [healer],
      [{ x: 4, y: 4, overrides: { status: TileStatus.CORRUPTED } }],
    );

    expect(canUnitHeal(healer)).toBe(true);
    expect(isUnitOnCorruptedTile(state, healer.id)).toBe(true);
    expect(healer.tags.some((t) => CORRUPTED_SUPPRESSED_TAGS.has(t))).toBe(true);
  });

  it('PATCHUP can heal normal units but not Brandmarked units', () => {
    const healer = makeUnit(UnitType.SCOUT, Faction.PLAYER, 4, 4, {
      tags: [UnitTag.PATCHUP],
    });
    const normalTarget = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 5, 4);
    normalTarget.stats.currentHp = 40;
    const brandmarkedTarget = makeUnit(UnitType.SPEARMAN, Faction.PLAYER, 4, 5, { tags: [UnitTag.BRANDMARKED] });
    brandmarkedTarget.stats.currentHp = 40;

    const state = makeSmallState([healer, normalTarget, brandmarkedTarget]);
    const targets = getHealTargets(state, healer.id);

    expect(targets).toContain(normalTarget.id);
    expect(targets).not.toContain(brandmarkedTarget.id);
  });
});

describe('PB – enemy frozen slide kill animation/event', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCombatAnimationStore.setState({
      unitAnimations: new Map(),
      slideKillGhosts: new Map(),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    useCombatAnimationStore.setState({
      unitAnimations: new Map(),
      slideKillGhosts: new Map(),
    });
  });

  it('enemy sliding from FROZEN into WATER emits UNIT_DEATH at water tile and adds slide-kill ghost', () => {
    const enemy = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 2, 37);
    const player = makeUnit(UnitType.SWORDSMAN, Faction.PLAYER, 8, 37);

    const state = makeStateForEnemyTurn(
      [enemy, player],
      [],
      [
        { x: 2, y: 38, overrides: { status: TileStatus.FROZEN } },
        { x: 2, y: 39, overrides: { terrainType: TileType.WATER, status: null } },
      ],
    );

    const addSlideKillGhostSpy = vi.spyOn(useCombatAnimationStore.getState(), 'addSlideKillGhost');
    const { events } = runEnemyTurn(state);

    const deathEvent = events.find(
      (e) => e.type === 'UNIT_DEATH' && e.unitId === enemy.id,
    );
    expect(deathEvent).toEqual({
      type: 'UNIT_DEATH',
      unitId: enemy.id,
      position: { x: 2, y: 39 },
      faction: Faction.ENEMY,
    });

    expect(addSlideKillGhostSpy).toHaveBeenCalledTimes(1);
    const ghost = addSlideKillGhostSpy.mock.calls[0][0];
    expect(ghost.deathTileX).toBe(2);
    expect(ghost.deathTileY).toBe(39);
    expect(Math.abs(ghost.slideDx)).toBe(0);
    expect(ghost.slideDy).toBe(-RENDER.TILE_SIZE_DESKTOP);
  });
});
