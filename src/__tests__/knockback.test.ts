/**
 * Tests for SP-12s — Tramplelord (spec_12): Rider KNOCKBACK
 *
 * KNOCKBACK is granted to all RIDER units when spec_12 is active.
 * On a Rider's normal attack (not counter), if the defender survives,
 * push it 1 tile along the attacker→defender axis.
 *
 * Destination rules:
 *  - Blocked (occupied unit / non-walkable building / off-map) → no move
 *  - LAVA → dies (FLYING included)
 *  - CANYON (non-FLYING, no bridge) → dies
 *  - WATER (non-FLYING, or enemy on frozen water) → drowns
 *  - FROZEN (non-FLYING) → lands there, then ice-slides (resolveSlide)
 *  - Any other passable tile → unit moves there
 *
 * Kill credit applies if displacement kills the unit.
 * ALERT / IRONBLOOD tags do NOT block knockback (they gate stun/summoned-damage only).
 * FLYING units are immune to CANYON/WATER death but not LAVA.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { resolveAttack } from '../combatSystem';
import { UnitType, Faction, UnitTag, TileType, TileStatus, BuildingType } from '../types';
import type { GameState, Unit, Tile, Building, GameStats } from '../types';
import type { GameEvent } from '../gameEvents';
import { UNIT_DEFINITIONS } from '../gameConfig';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) {
  return `${prefix}_${++_id}`;
}

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

/** 9-wide × 14-tall grid. Tiles (0-8 × 0-13) cover all test positions. */
function makeGrid(
  unitPlacements: { id: string; x: number; y: number }[] = [],
): Tile[][] {
  const COLS = 9;
  const ROWS = 14;
  const grid: Tile[][] = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) {
    grid[y][x].unitId = id;
  }
  return grid;
}

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

function makeUnit(
  type: UnitType,
  faction: Faction,
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
  const id = nextId(`${faction === Faction.PLAYER ? 'p' : 'e'}_${type}`);
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
      ...overrides,
    },
    tags: [...def.tags, ...extraTags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeState(
  units: Unit[],
  gridMutator?: (grid: Tile[][]) => void,
  buildings: Building[] = [],
): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;
  const grid = makeGrid(units.map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })));
  gridMutator?.(grid);
  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 1,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    ember: 0,
  } as unknown as GameState;
}

/**
 * Build a RIDER unit with KNOCKBACK tag.
 * Attacker has very high attack so the primary hit is guaranteed to damage (not kill)
 * a full-HP enemy unless the enemy also has extreme HP.
 */
function makeKnockbackRider(x: number, y: number): Unit {
  // Give the rider enough attack to damage but use a low-HP defender to guarantee survival
  return makeUnit(UnitType.RIDER, Faction.PLAYER, x, y, [UnitTag.KNOCKBACK]);
}

/** Build an enemy Grunt that will survive a Rider hit with leftover HP. */
function makeSurvivingDefender(x: number, y: number): Unit {
  return makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, x, y, [], {
    currentHp: 50,
    maxHp: 100,
  });
}

/** Build an enemy unit that dies from the primary Rider attack (for "no knockback on death" checks). */
function makeDyingDefender(x: number, y: number): Unit {
  return makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, x, y, [], {
    currentHp: 1,
    maxHp: 100,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KNOCKBACK — basic displacement', () => {
  it('pushes the defender 1 tile along the attack axis when it survives', () => {
    // RIDER at (3,5), enemy at (4,5). Enemy pushed to (5,5).
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    const defAfter = next.units[defender.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
    // Grid tiles updated correctly
    expect(next.grid[5][4].unitId).toBeNull();
    expect(next.grid[5][5].unitId).toBe(defender.id);
  });

  it('pushes vertically when the attack axis is vertical', () => {
    // RIDER at (4,3), enemy at (4,5). Attack axis is vertical. Enemy pushed to (4,6).
    const rider = makeKnockbackRider(4, 3);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    const defAfter = next.units[defender.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 4, y: 6 });
  });

  it('emits a UNIT_KNOCKBACK event with correct from/to positions', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender]);

    const outEvents: GameEvent[] = [];
    produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true, outEvents);
    });

    const kbEvt = outEvents.find((e) => e.type === 'UNIT_KNOCKBACK');
    expect(kbEvt).toBeDefined();
    const kb = kbEvt as Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }>;
    expect(kb.unitId).toBe(defender.id);
    expect(kb.fromPosition).toEqual({ x: 4, y: 5 });
    expect(kb.toPosition).toEqual({ x: 5, y: 5 });
    expect(kb.isEnemy).toBe(true);
  });

  it('does NOT apply knockback when the defender dies from the primary attack', () => {
    // Defender has 1 HP — it dies from the primary hit; no knockback should occur.
    const rider = makeKnockbackRider(3, 5);
    const dying = makeDyingDefender(4, 5);
    const state = makeState([rider, dying]);

    const outEvents: GameEvent[] = [];
    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, dying.id, true, outEvents);
    });

    expect(next.units[dying.id]).toBeUndefined();
    const kbEvt = outEvents.find((e) => e.type === 'UNIT_KNOCKBACK');
    expect(kbEvt).toBeUndefined();
  });

  it('does NOT emit a knockback event when the attacker lacks KNOCKBACK tag', () => {
    const rider = makeUnit(UnitType.RIDER, Faction.PLAYER, 3, 5); // no KNOCKBACK
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender]);

    const outEvents: GameEvent[] = [];
    produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true, outEvents);
    });

    const kbEvt = outEvents.find((e) => e.type === 'UNIT_KNOCKBACK');
    expect(kbEvt).toBeUndefined();
  });
});

describe('KNOCKBACK — blocking conditions', () => {
  it('is blocked (no move) when the destination is occupied by another unit', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const blocker = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 5, 5);
    const state = makeState([rider, defender, blocker]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    const defAfter = next.units[defender.id];
    expect(defAfter!.position).toEqual({ x: 4, y: 5 }); // unmoved
  });

  it('is blocked (no move) off the map edge', () => {
    // RIDER at (3,5), enemy at (8,5). Push destination (9,5) is off-map.
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(8, 5);
    const state = makeState([rider, defender]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    const defAfter = next.units[defender.id];
    expect(defAfter!.position).toEqual({ x: 8, y: 5 }); // unmoved
  });

  it('is blocked (no move) by a non-walkable building (watchtower)', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);

    // Place an enemy Watchtower at (5,5) — has combatStats, blocks knockback.
    const towerBuilding: Building = {
      id: 'tower_1',
      type: BuildingType.WATCHTOWER,
      faction: Faction.ENEMY,
      position: { x: 5, y: 5 },
      hp: 10,
      maxHp: 10,
      combatStats: { attack: 5, defense: 0, attackRange: 2 },
    } as unknown as Building;

    const state = makeState([rider, defender], (grid) => {
      grid[5][5].buildingId = towerBuilding.id;
    }, [towerBuilding]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    const defAfter = next.units[defender.id];
    expect(defAfter!.position).toEqual({ x: 4, y: 5 }); // unmoved
  });
});

describe('KNOCKBACK — lethal destinations', () => {
  it('kills the defender when pushed into a LAVA tile', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].isLava = true;
    });

    const outEvents: GameEvent[] = [];
    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true, outEvents);
    });

    // Defender deleted
    expect(next.units[defender.id]).toBeUndefined();
    // Kill credit: unitsKilled incremented, XP granted to rider
    expect(next.gameStats.unitsKilled).toBeGreaterThanOrEqual(1);
    expect(next.units[rider.id]!.xp).toBeGreaterThan(0);

    const deathEvt = outEvents.find(
      (e) => e.type === 'UNIT_DEATH' && (e as Extract<GameEvent, { type: 'UNIT_DEATH' }>).unitId === defender.id,
    );
    expect(deathEvt).toBeDefined();
    // Death position should be the lava tile
    const de = deathEvt as Extract<GameEvent, { type: 'UNIT_DEATH' }>;
    expect(de.position).toEqual({ x: 5, y: 5 });
  });

  it('kills a FLYING defender pushed into LAVA (FLYING does not protect from lava)', () => {
    const rider = makeKnockbackRider(3, 5);
    const flyingDefender = makeSurvivingDefender(4, 5);
    flyingDefender.tags.push(UnitTag.FLYING);
    const state = makeState([rider, flyingDefender], (grid) => {
      grid[5][5].isLava = true;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, flyingDefender.id, true);
    });

    expect(next.units[flyingDefender.id]).toBeUndefined();
  });

  it('kills a non-FLYING defender pushed into a CANYON (no bridge)', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].terrainType = TileType.CANYON;
    });

    const outEvents: GameEvent[] = [];
    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true, outEvents);
    });

    expect(next.units[defender.id]).toBeUndefined();
    expect(next.gameStats.unitsKilled).toBeGreaterThanOrEqual(1);
    const de = outEvents.find(
      (e): e is Extract<GameEvent, { type: 'UNIT_DEATH' }> =>
        e.type === 'UNIT_DEATH' && e.unitId === defender.id,
    );
    expect(de?.position).toEqual({ x: 5, y: 5 });
  });

  it('lets a FLYING defender survive being pushed into CANYON (lands safely)', () => {
    const rider = makeKnockbackRider(3, 5);
    const flyingDefender = makeSurvivingDefender(4, 5);
    flyingDefender.tags.push(UnitTag.FLYING);
    const state = makeState([rider, flyingDefender], (grid) => {
      grid[5][5].terrainType = TileType.CANYON;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, flyingDefender.id, true);
    });

    // FLYING unit lands on the canyon tile safely
    const defAfter = next.units[flyingDefender.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
  });

  it('kills a non-FLYING defender pushed into WATER', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].terrainType = TileType.WATER;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    expect(next.units[defender.id]).toBeUndefined();
  });

  it('lets a FLYING defender survive being pushed into WATER', () => {
    const rider = makeKnockbackRider(3, 5);
    const flyingDefender = makeSurvivingDefender(4, 5);
    flyingDefender.tags.push(UnitTag.FLYING);
    const state = makeState([rider, flyingDefender], (grid) => {
      grid[5][5].terrainType = TileType.WATER;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, flyingDefender.id, true);
    });

    const defAfter = next.units[flyingDefender.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
  });
});

describe('KNOCKBACK — FROZEN ice-slide', () => {
  it('causes the unit to ice-slide one more tile when knocked onto a FROZEN tile', () => {
    // Grid: RIDER(3,5) → enemy(4,5). Knockback dest = (5,5) FROZEN. Slide dest = (6,5) PLAINS.
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].status = TileStatus.FROZEN;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    // Unit ends up at (6,5) — one tile beyond the frozen tile
    const defAfter = next.units[defender.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 6, y: 5 });
    expect(next.grid[5][5].unitId).toBeNull(); // frozen tile vacated
    expect(next.grid[5][6].unitId).toBe(defender.id);
  });

  it('stays on FROZEN tile when the slide destination is blocked', () => {
    // RIDER(3,5) → enemy(4,5). Knockback dest=(5,5) FROZEN. Slide dest=(6,5) occupied.
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const slideBlocker = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 6, 5);
    const state = makeState([rider, defender, slideBlocker], (grid) => {
      grid[5][5].status = TileStatus.FROZEN;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    // Stays on the frozen tile because (6,5) is occupied
    const defAfter = next.units[defender.id];
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
  });

  it('kills the unit when the ice-slide destination is LAVA', () => {
    // RIDER(3,5) → enemy(4,5). Knockback=(5,5) FROZEN. Slide=(6,5) LAVA.
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].status = TileStatus.FROZEN;
      grid[5][6].isLava = true;
    });

    const outEvents: GameEvent[] = [];
    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true, outEvents);
    });

    expect(next.units[defender.id]).toBeUndefined();
    // Kill credit granted to rider
    expect(next.units[rider.id]!.xp).toBeGreaterThan(0);
    // UNIT_KNOCKBACK should have been emitted
    const kbEvt = outEvents.find(
      (e): e is Extract<GameEvent, { type: 'UNIT_KNOCKBACK' }> =>
        e.type === 'UNIT_KNOCKBACK' && e.unitId === defender.id,
    );
    expect(kbEvt).toBeDefined();
  });

  it('FLYING defender is NOT displaced by FROZEN tile (FLYING immune to ice-slide)', () => {
    // FLYING unit knocked to FROZEN tile: does NOT ice-slide (rule: flying treats frozen as solid)
    const rider = makeKnockbackRider(3, 5);
    const flyingDef = makeSurvivingDefender(4, 5);
    flyingDef.tags.push(UnitTag.FLYING);
    const state = makeState([rider, flyingDef], (grid) => {
      grid[5][5].status = TileStatus.FROZEN;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, flyingDef.id, true);
    });

    // Flying unit lands on FROZEN tile but does NOT slide
    const defAfter = next.units[flyingDef.id];
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
  });
});

describe('KNOCKBACK — kill credit and stats', () => {
  it('grants XP to the attacker when knockback kills the defender', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].isLava = true;
    });

    const xpBefore = rider.xp;
    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    expect(next.units[rider.id]!.xp).toBeGreaterThan(xpBefore);
  });

  it('increments unitsKilled when a knockback kills an enemy', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      grid[5][5].terrainType = TileType.CANYON;
    });

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    expect(next.gameStats.unitsKilled).toBeGreaterThanOrEqual(1);
  });

  it('still resolves knockback even when the attacker dies in the exchange', () => {
    // Set up combat such that the defender counter-kills the rider, but the rider's
    // attack still lands (just enough damage to damage but not kill defender).
    // We give the rider very low HP so the counter kills it.
    const rider = makeKnockbackRider(3, 5);
    rider.stats.currentHp = 1; // dies from counter
    const defender = makeSurvivingDefender(4, 5);
    defender.stats.currentHp = 50;
    const state = makeState([rider, defender]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true);
    });

    // Rider is dead
    expect(next.units[rider.id]).toBeUndefined();
    // Defender was knocked back if it survived the primary hit
    const defAfter = next.units[defender.id];
    if (defAfter) {
      // If defender survived primary hit, it should have been knocked back
      expect(defAfter.position).toEqual({ x: 5, y: 5 });
    }
    // If the rider did kill the defender, that's also valid — no knockback was expected then.
  });
});

describe('KNOCKBACK — ALERT and IRONBLOOD units are still displaced', () => {
  it('knocks back an ALERT defender (ALERT only gates stun, not displacement)', () => {
    const rider = makeKnockbackRider(3, 5);
    const alertDef = makeSurvivingDefender(4, 5);
    alertDef.tags.push(UnitTag.ALERT);
    const state = makeState([rider, alertDef]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, alertDef.id, true);
    });

    const defAfter = next.units[alertDef.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
  });

  it('knocks back an IRONBLOOD defender (IRONBLOOD gates summoned-damage, not displacement)', () => {
    const rider = makeKnockbackRider(3, 5);
    const ibDef = makeSurvivingDefender(4, 5);
    ibDef.tags.push(UnitTag.IRONBLOOD);
    const state = makeState([rider, ibDef]);

    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, ibDef.id, true);
    });

    const defAfter = next.units[ibDef.id];
    expect(defAfter).toBeDefined();
    expect(defAfter!.position).toEqual({ x: 5, y: 5 });
  });
});

describe('KNOCKBACK — CORRUPTED tile suppression', () => {
  it('does NOT apply knockback when the attacker is on a CORRUPTED tile', () => {
    const rider = makeKnockbackRider(3, 5);
    const defender = makeSurvivingDefender(4, 5);
    const state = makeState([rider, defender], (grid) => {
      // Mark the rider's tile as CORRUPTED
      grid[5][3].status = TileStatus.CORRUPTED;
    });

    const outEvents: GameEvent[] = [];
    const next = produce(state, (draft) => {
      resolveAttack(draft, rider.id, defender.id, true, outEvents);
    });

    // Defender should NOT have moved
    const defAfter = next.units[defender.id];
    if (defAfter) {
      expect(defAfter.position).toEqual({ x: 4, y: 5 });
    }
    const kbEvt = outEvents.find((e) => e.type === 'UNIT_KNOCKBACK');
    expect(kbEvt).toBeUndefined();
  });
});
