/**
 * Tests for combat-math fixes:
 *   Change 4 — SPLASH damage is applied even when the primary target dies.
 *   Change 5 — PIERCE deals fullPrimaryDamage to the rear unit without
 *               subtracting the rear unit's defense a second time.
 *
 * These tests operate entirely on the resolved game state — no animation
 * plumbing (stores, floaters) is involved. `suppressFloaters = true` is
 * passed to resolveAttack so all visual side-effects are skipped.
 *
 * Grid layout used by most tests (9 columns × 12 rows):
 *
 *   (1,5) = SIEGE/LANCER attacker  →  (4,5) = primary defender  →  (5,5) = pierce rear
 *                                      (3,5),(5,5),(4,4),(4,6) = splash adjacents
 *
 * MAP.GRID_WIDTH = 9, MAP.GRID_HEIGHT = 76. Units placed at y=3–6 satisfy all
 * in-bounds checks (nx/ny < MAP.GRID_WIDTH/HEIGHT) without needing a full 76-row grid.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { resolveAttack } from '../combatSystem';
import { UnitType, Faction, UnitTag, TileType } from '../types';
import type { GameState, Unit, Tile, Building, GameStats } from '../types';
import type { GameEvent } from '../gameEvents';
import { UNIT_DEFINITIONS } from '../gameConfig';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

/** Create a minimal tile at the given position with no occupants. */
function makeTile(x: number, y: number): Tile {
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
  };
}

/**
 * Create a 9×12 grid (enough for all test positions).
 * Returns a mutable 2-D array of Tile.
 */
function makeGrid(
  unitPlacements: { id: string; x: number; y: number }[] = [],
): Tile[][] {
  const COLS = 9;
  const ROWS = 12;
  const grid: Tile[][] = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
  }
  return grid;
}

/** Create a minimal GameStats object with all counters zeroed. */
function makeGameStats(): GameStats {
  return {
    unitsKilled: 0,
    unitsLost: 0,
    damageDealt: 0,
    damageReceived: 0,
    unitsRecruited: 0,
    buildingsConstructed: 0,
    buildingsConverted: 0,
    techsUnlocked: 0,
    enemyBuildingsDestroyed: 0,
    enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0,
    buildingsCapturedByEnemy: 0,
    buildingsDestroyedByLava: 0,
  };
}

/** Build a minimal player unit from UNIT_DEFINITIONS, with override tags. */
function makePlayerUnit(
  type: UnitType,
  x: number,
  y: number,
  extraTags: UnitTag[] = [],
  overrides: Partial<Unit['stats']> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  const id = nextId(`p_${type}`);
  return {
    id,
    type,
    faction: Faction.PLAYER,
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
      ...overrides,
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

/** Build a minimal enemy unit. */
function makeEnemyUnit(
  type: UnitType,
  x: number,
  y: number,
  overrides: Partial<Unit['stats']> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  const id = nextId(`e_${type}`);
  return {
    id,
    type,
    faction: Faction.ENEMY,
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
      ...overrides,
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
  };
}

/**
 * Assemble a minimal GameState.
 * Only the fields accessed by resolveAttack and its callees are populated;
 * the rest are satisfied by the `as unknown as GameState` cast.
 */
function makeState(
  units: Unit[],
  buildings: Building[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  const grid = makeGrid(units.map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })));

  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 1,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
  } as unknown as GameState;
}

// ── CHANGE 4: SPLASH damage tests ────────────────────────────────────────────

describe('Change 4 – SPLASH damage', () => {
  /**
   * 4.1 Primary survives: splash targets take damage.
   *
   * Setup: SIEGE (SPLASH, PLAYER) at (1,5) attacks LAVA_GRUNT at (4,5).
   * Adjacent splash targets: LAVA_GRUNT at (3,5), (5,5), (4,6).
   * Primary defender has full HP so it survives. Splash targets should lose HP.
   */
  it('applies splash damage to surrounding enemies when the primary survives', () => {
    const siege = makePlayerUnit(UnitType.SIEGE, 1, 5, [UnitTag.SPLASH]);
    const primary = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5);
    const splash1 = makeEnemyUnit(UnitType.LAVA_GRUNT, 3, 5);
    const splash2 = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5);
    const splash3 = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 6);

    const initialHp1 = splash1.stats.currentHp;
    const initialHp2 = splash2.stats.currentHp;
    const initialHp3 = splash3.stats.currentHp;

    const initialState = makeState([siege, primary, splash1, splash2, splash3]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, siege.id, primary.id, true, outEvents);
    });

    // Primary should have taken damage (survived since it has 100 HP)
    expect(nextState.units[primary.id]).toBeDefined();

    // Each splash target must have lost HP
    expect(nextState.units[splash1.id]!.stats.currentHp).toBeLessThan(initialHp1);
    expect(nextState.units[splash2.id]!.stats.currentHp).toBeLessThan(initialHp2);
    expect(nextState.units[splash3.id]!.stats.currentHp).toBeLessThan(initialHp3);

    // SPLASH_DAMAGE events should be present in outEvents for each target
    const splashEvents = outEvents.filter((e) => e.type === 'SPLASH_DAMAGE');
    expect(splashEvents.length).toBe(3);
    const splashTargetIds = splashEvents.map((e) => (e as { unitId: string }).unitId);
    expect(splashTargetIds).toContain(splash1.id);
    expect(splashTargetIds).toContain(splash2.id);
    expect(splashTargetIds).toContain(splash3.id);
  });

  /**
   * 4.2 Primary dies: splash damage is still applied.
   *
   * The primary defender has currentHp = 1 so the SIEGE attack kills it.
   * SPLASH should still fire because the only suppression condition is
   * `attackerDead` (counter never happens vs a full-HP ranged attacker
   * against a target 3 tiles away). Surrounding enemies must take HP loss.
   */
  it('applies splash damage to surrounding enemies when the primary dies', () => {
    const siege = makePlayerUnit(UnitType.SIEGE, 1, 5, [UnitTag.SPLASH]);
    // Primary with only 1 HP — guaranteed kill.
    const primary = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    const splash1 = makeEnemyUnit(UnitType.LAVA_GRUNT, 3, 5);
    const splash2 = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5);

    const initialHp1 = splash1.stats.currentHp;
    const initialHp2 = splash2.stats.currentHp;

    const initialState = makeState([siege, primary, splash1, splash2]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, siege.id, primary.id, true, outEvents);
    });

    // Primary must be dead (removed from state)
    expect(nextState.units[primary.id]).toBeUndefined();

    // SIEGE attacker must still be alive (no counter from 3 tiles away)
    expect(nextState.units[siege.id]).toBeDefined();

    // Splash targets must have taken damage even though the primary died
    expect(nextState.units[splash1.id]!.stats.currentHp).toBeLessThan(initialHp1);
    expect(nextState.units[splash2.id]!.stats.currentHp).toBeLessThan(initialHp2);
  });

  /**
   * 4.3 Regression: SPLASH_DAMAGE events appear in outEvents when primary dies.
   *
   * The animation layer (Change 1) relies on these events being present in the
   * event queue to play inline splash VFX. This test pins that the events are
   * emitted even in the primary-dies case.
   *
   * Note: `outEvents` (the secondary event array passed to resolveAttack) does NOT
   * contain the primary defender's UNIT_DEATH — that event is assembled by
   * gameStore.ts/attackUnit after resolveAttack returns. Only SPLASH_DAMAGE
   * (and any splash-target UNIT_DEATH events) live in outEvents.
   */
  it('emits SPLASH_DAMAGE events in outEvents when the primary dies (regression)', () => {
    const siege = makePlayerUnit(UnitType.SIEGE, 1, 5, [UnitTag.SPLASH]);
    const primary = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    const splash1 = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 4);
    const splash2 = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 6);

    const initialState = makeState([siege, primary, splash1, splash2]);
    const outEvents: GameEvent[] = [];
    produce(initialState, (draft) => {
      resolveAttack(draft, siege.id, primary.id, true, outEvents);
    });

    const splashEvents = outEvents.filter((e) => e.type === 'SPLASH_DAMAGE');
    expect(splashEvents.length).toBeGreaterThan(0);

    // Every SPLASH_DAMAGE must carry a non-zero amount
    for (const evt of splashEvents) {
      expect((evt as { amount: number }).amount).toBeGreaterThan(0);
    }

    // Each splash target must appear in the event list
    const splashTargetIds = splashEvents.map((e) => (e as { unitId: string }).unitId);
    expect(splashTargetIds).toContain(splash1.id);
    expect(splashTargetIds).toContain(splash2.id);
  });
});

// ── CHANGE 5: PIERCE double-defense-subtraction fix ──────────────────────────

describe('Change 5 – PIERCE rear-unit damage', () => {
  /**
   * Compute the expected fullPrimaryDamage for LANCER (att=75, hp=120) vs
   * LAVA_GRUNT (def=50, hp=100) at full HP:
   *   eff_att = 75, eff_def = 50, total = 125
   *   damage  = round(75 × 75/125) = round(45) = 45
   * fullPrimaryDamage = 45.
   *
   * LANCER is melee (attackRange=1) so the LAVA_GRUNT can counter; counter
   * damage = round(50 × 50/80) = round(31.25) = 31.
   * LANCER hp 120 − 31 = 89 → LANCER survives, so PIERCE fires.
   */
  const EXPECTED_FULL_PRIMARY_DAMAGE = 45;

  /**
   * 5.1 Rear unit with high defense takes fullPrimaryDamage × PIERCE_SECONDARY_DAMAGE_MULTIPLIER, NOT 1.
   *
   * Before the fix: Math.max(1, 45 − 50) = 1.
   * After the fix:  Math.max(1, 45)       = 45.
   */
  it('deals fullPrimaryDamage to a high-defense rear unit (no second defense subtraction)', () => {
    const lancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontDef = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5); // defense = 50, survives
    // Rear unit with defense=50 — bug would collapse this to 1 dmg
    const rearUnit = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5);

    const rearInitialHp = rearUnit.stats.currentHp; // 100

    const initialState = makeState([lancer, frontDef, rearUnit]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, lancer.id, frontDef.id, true, outEvents);
    });

    // Rear unit must still exist (100 − 45 = 55)
    expect(nextState.units[rearUnit.id]).toBeDefined();
    const hpLost = rearInitialHp - nextState.units[rearUnit.id]!.stats.currentHp;

    // HP lost must equal the full pre-multiplier primary damage, not 1
    expect(hpLost).toBe(EXPECTED_FULL_PRIMARY_DAMAGE);
  });

  /**
   * 5.2 Rear unit damage is independent of the rear unit's defense value.
   *
   * Two scenarios with identical attacker + front defender but different rear
   * unit defense values must yield identical HP loss on the rear unit.
   */
  it('rear-unit HP loss is independent of the rear unit defense stat', () => {
    function pierceScenario(rearDefense: number): number {
      const lancer = makePlayerUnit(UnitType.LANCER, 3, 5);
      const frontDef = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5);
      const rearUnit = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5, {
        defense: rearDefense,
        currentHp: 100,
        maxHp: 100,
      });

      const initialState = makeState([lancer, frontDef, rearUnit]);
      const nextState = produce(initialState, (draft) => {
        resolveAttack(draft, lancer.id, frontDef.id, true);
      });

      const rear = nextState.units[rearUnit.id];
      if (!rear) return 100; // killed — HP lost = 100
      return 100 - rear.stats.currentHp;
    }

    const hpLostLowDef  = pierceScenario(0);   // rear def = 0
    const hpLostHighDef = pierceScenario(50);   // rear def = 50 (was giving 1 before fix)

    expect(hpLostLowDef).toBe(EXPECTED_FULL_PRIMARY_DAMAGE);
    expect(hpLostHighDef).toBe(EXPECTED_FULL_PRIMARY_DAMAGE);
    // Identical regardless of rear unit's defense
    expect(hpLostLowDef).toBe(hpLostHighDef);
  });

  /**
   * 5.3 PIERCE_DAMAGE event is emitted with the correct (full) amount.
   */
  it('emits a PIERCE_DAMAGE event with amount equal to fullPrimaryDamage', () => {
    const lancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontDef = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5);
    const rearUnit = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5, {
      defense: 50, // high defense — would give wrong value before the fix
      currentHp: 100,
      maxHp: 100,
    });

    const initialState = makeState([lancer, frontDef, rearUnit]);
    const outEvents: GameEvent[] = [];
    produce(initialState, (draft) => {
      resolveAttack(draft, lancer.id, frontDef.id, true, outEvents);
    });

    const pierceEvt = outEvents.find((e) => e.type === 'PIERCE_DAMAGE');
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(EXPECTED_FULL_PRIMARY_DAMAGE);
  });

  /**
   * 5.4 Front unit still takes the reduced (PIERCE_PRIMARY_DAMAGE_MULTIPLIER) damage.
   * The fix must not change the front defender's damage.
   *
   * LANCER vs LAVA_GRUNT (def=50, hp=100):
   *   fullPrimaryDamage = 45
   *   front damage      = floor(45 × 0.5) = 22
   */
  it('front unit still takes pierce-multiplier-reduced damage', () => {
    const FRONT_DAMAGE = 22; // floor(45 × 0.5)

    const lancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontDef = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5);
    const rearUnit = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5);

    const frontInitialHp = frontDef.stats.currentHp; // 100
    const initialState = makeState([lancer, frontDef, rearUnit]);
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, lancer.id, frontDef.id, true);
    });

    const frontHpLost = frontInitialHp - nextState.units[frontDef.id]!.stats.currentHp;
    expect(frontHpLost).toBe(FRONT_DAMAGE);
  });
});
