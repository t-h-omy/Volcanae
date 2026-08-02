/**
 * Tests for PROMPT 1 combat resolution fixes:
 *   1A (21) – BLOODLUST corrupted-advance: charge granted when kill advances onto clean tile
 *   1A (19) – BLOODLUST no-dangle: charge cleared when no target is reachable after kill
 *   1A (1)  – BLOODLUST level-up: pending charge survives applyLevelUps
 *   1B (12) – PIERCE friendly fire: friendly rear unit/building takes 0 damage, VFX still emitted
 *   1C (10) – FLYING ranged vulnerability: +25% from non-flying RANGED, not from melee/flying-ranged
 *   1D (5)  – SPLASH fog: unrevealed tiles still take damage and emit events; no floater
 *
 * All tests use suppressFloaters = true (resolveAttack 3rd arg) to skip store side-effects.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { resolveAttack, resolveAttackOnBuilding, unitToCombatant, buildingToCombatant, calculateCombatFromStats } from '../combatSystem';
import { applyLevelUps } from '../levelSystem';
import { UnitType, Faction, UnitTag, TileType, TileStatus, DestroyBehavior, BuildingType } from '../types';
import type { GameState, Unit, Tile, Building, GameStats } from '../types';
import type { GameEvent } from '../gameEvents';
import { UNIT_DEFINITIONS, FLYING_RANGED_DAMAGE_TAKEN_MULTIPLIER, PIERCE_SECONDARY_DAMAGE_MULTIPLIER } from '../gameConfig';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

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

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
  };
}

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
    id, type, faction: Faction.PLAYER,
    position: { x, y },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius, triggerRange: def.triggerRange,
      movementActions: def.movementActions, attackRange: def.attackRange, ...overrides,
    },
    tags: [...def.tags, ...extraTags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false, hasCapturedThisTurn: false,
      hasTradedThisTurn: false, hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false, xp: 0, level: 1, pinnedUntilTurn: 0,
    distractionDefPenalty: 0, lastMovedTurn: 0,
  };
}

function makeEnemyUnit(
  type: UnitType,
  x: number,
  y: number,
  overrides: Partial<Unit['stats']> = {},
  extraTags: UnitTag[] = [],
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  const id = nextId(`e_${type}`);
  return {
    id, type, faction: Faction.ENEMY,
    position: { x, y },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius, triggerRange: def.triggerRange,
      movementActions: def.movementActions, attackRange: def.attackRange, ...overrides,
    },
    tags: [...def.tags, ...extraTags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false, hasCapturedThisTurn: false,
      hasTradedThisTurn: false, hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false, xp: 0, level: 1, pinnedUntilTurn: 0,
    distractionDefPenalty: 0, lastMovedTurn: 0,
  };
}

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
    units: unitsMap, buildings: buildingsMap, grid,
    techFlags: [], gameStats: makeGameStats(), turn: 1,
    arcaneCrystals: 0, pendingBrandmarkTransforms: [],
  } as unknown as GameState;
}

/** Minimal enemy building for testing PIERCE through buildings. */
function makeEnemyBuilding(x: number, y: number, hp = 50): Building {
  const id = nextId('bld');
  return {
    id,
    type: BuildingType.WATCHTOWER,
    faction: Faction.ENEMY,
    position: { x, y },
    hp,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 1,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: { attack: 30, defense: 30, attackRange: 1 },
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0, populationCap: 0, populationGrowthCounter: 0,
    strongholdNobles: 0, emberSpawnCounter: 0, recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0, spawnCooldownRemaining: 0, lastRecruitmentTurn: 0,
  };
}

/** Minimal player building (e.g. friendly outpost). */
function makePlayerBuilding(x: number, y: number, hp = 50): Building {
  const bld = makeEnemyBuilding(x, y, hp);
  return { ...bld, id: nextId('pbld'), faction: Faction.PLAYER };
}

/** Minimal neutral building (e.g. Market/Watchtower/Gravestone ownership = null). */
function makeNeutralBuilding(x: number, y: number, hp = 50): Building {
  const bld = makeEnemyBuilding(x, y, hp);
  return { ...bld, id: nextId('nbld'), faction: null };
}

function makeNeutralMarketBuilding(x: number, y: number, hp = 50): Building {
  const bld = makeNeutralBuilding(x, y, hp);
  return { ...bld, type: BuildingType.MARKET, combatStats: null };
}

// ── 1A (21): BLOODLUST corrupted-advance grant ────────────────────────────────

describe('1A (21) – BLOODLUST corrupted-advance', () => {
  /**
   * RIDER (BLOODLUST) stands on a CORRUPTED tile and melee-kills an enemy on
   * a clean tile. The attacker will melee-advance onto the clean destination —
   * so the grant should be gated on the destination tile status (clean), not
   * the attacker's current (corrupted) tile.
   * Expected: bloodlust charge IS granted.
   */
  it('grants bloodlust charge when kill advances onto a clean tile (even if attacker tile is corrupted)', () => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    // Enemy with 1 HP — guaranteed kill; stands on a clean tile at (4,5)
    const enemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    // Second enemy at (5,5): ensures the dangle check finds a valid target after the kill+advance,
    // so the charge is not cleared by fix 19. This isolates fix 21 (corrupted-advance).
    const otherEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5);

    const initialState = makeState([rider, enemy, otherEnemy]);
    // Corrupt the attacker's current tile
    initialState.grid[5][3].status = TileStatus.CORRUPTED;

    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, rider.id, enemy.id, true);
    });

    const attacker = nextState.units[rider.id]!;
    // Charge must be granted because the destination tile (4,5) is clean
    expect(attacker.bloodlustAttackAvailable).toBe(true);
    expect(attacker.hasAttackedThisTurn).toBe(false);
  });

  /**
   * Non-advancing case: RANGED + BLOODLUST attacker on corrupted tile.
   * No melee advance → use attacker's current tile → corrupted → charge suppressed.
   */
  it('suppresses bloodlust charge for a RANGED attacker on a corrupted tile (non-advancing)', () => {
    // ARCHER is RANGED (no advance), attackRange=2; enemy is 2 tiles away
    const archer = makePlayerUnit(UnitType.ARCHER, 2, 5, [UnitTag.BLOODLUST]);
    const enemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });

    const initialState = makeState([archer, enemy]);
    // Corrupt the archer's tile
    initialState.grid[5][2].status = TileStatus.CORRUPTED;

    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, archer.id, enemy.id, true);
    });

    const attacker = nextState.units[archer.id]!;
    // No advance for RANGED → attackerOnCorrupted=true → suppressed
    expect(attacker.bloodlustAttackAvailable).toBe(false);
    expect(attacker.hasAttackedThisTurn).toBe(true);
  });
});

// ── 1A (19): BLOODLUST no-dangle ─────────────────────────────────────────────

describe('1A (19) – BLOODLUST no-target dangle', () => {
  /**
   * RIDER (BLOODLUST) kills the last enemy on the grid.
   * After the kill+advance there are no reachable targets → charge must be
   * cleared immediately so the unit tones down.
   */
  it('clears the charge when no enemy is reachable after the kill', () => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    const enemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    // Only one enemy — no target remaining after the kill

    const initialState = makeState([rider, enemy]);
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, rider.id, enemy.id, true);
    });

    const attacker = nextState.units[rider.id]!;
    expect(attacker.bloodlustAttackAvailable).toBe(false);
    expect(attacker.hasAttackedThisTurn).toBe(true);
    // Action locks cleared so the unit is genuinely spent
    expect(attacker.hasCapturedThisTurn).toBe(false);
    expect(attacker.hasConstructedThisTurn).toBe(false);
    expect(attacker.hasDestroyedThisTurn).toBe(false);
  });

  /**
   * Same setup but another enemy exists within attack range after the kill.
   * The charge must be kept.
   */
  it('keeps the charge when another enemy is reachable after the kill', () => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    const enemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    // Another enemy at (5,5) — within range 1 of the post-advance position (4,5)
    const otherEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5);

    const initialState = makeState([rider, enemy, otherEnemy]);
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, rider.id, enemy.id, true);
    });

    const attacker = nextState.units[rider.id]!;
    expect(attacker.bloodlustAttackAvailable).toBe(true);
    expect(attacker.hasAttackedThisTurn).toBe(false);
  });

  it.each([
    ['neutral Market', makeNeutralMarketBuilding],
    ['neutral Watchtower', makeNeutralBuilding],
  ])('clears the charge when only a %s is reachable after the kill', (_label, makeBuilding) => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    const enemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    const neutralBuilding = makeBuilding(5, 5, 80);

    const initialState = makeState([rider, enemy], [neutralBuilding]);
    initialState.grid[5][5].buildingId = neutralBuilding.id;

    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, rider.id, enemy.id, true);
    });

    const attacker = nextState.units[rider.id]!;
    expect(attacker.bloodlustAttackAvailable).toBe(false);
    expect(attacker.hasAttackedThisTurn).toBe(true);
  });
});

describe('1A (19) – BLOODLUST no-target dangle on building kill', () => {
  it.each([
    ['neutral Market', makeNeutralMarketBuilding],
    ['neutral Watchtower', makeNeutralBuilding],
  ])('clears the charge when only a %s is reachable after a building kill', (_label, makeBuilding) => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    const enemyBuilding = makeEnemyBuilding(4, 5, 1);
    const neutralBuilding = makeBuilding(5, 5, 80);

    const initialState = makeState([rider], [enemyBuilding, neutralBuilding]);
    initialState.grid[5][4].buildingId = enemyBuilding.id;
    initialState.grid[5][5].buildingId = neutralBuilding.id;

    const nextState = produce(initialState, (draft) => {
      resolveAttackOnBuilding(draft, rider.id, enemyBuilding.id, true);
    });

    const attacker = nextState.units[rider.id]!;
    expect(attacker.bloodlustAttackAvailable).toBe(false);
    expect(attacker.hasAttackedThisTurn).toBe(true);
  });
});

// ── 1A (1): BLOODLUST charge survives level-up ────────────────────────────────

describe('1A (1) – BLOODLUST charge survives level-up', () => {
  /**
   * A RIDER with a pending bloodlust charge levels up.
   * applyLevelUps must preserve bloodlustAttackAvailable and hasAttackedThisTurn.
   */
  it('preserves bloodlust charge through applyLevelUps', () => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    // Pre-set a pending bloodlust charge (as if the unit just killed an enemy)
    rider.bloodlustAttackAvailable = true;
    rider.hasAttackedThisTurn = false;
    // Give enough XP to trigger level 2
    rider.xp = 3; // XP_TO_LEVEL_2 = 3

    const initialState = makeState([rider]);

    const nextState = produce(initialState, (draft) => {
      applyLevelUps(draft, rider.id, 2, true); // suppressEffects=true
    });

    const levelled = nextState.units[rider.id]!;
    expect(levelled.level).toBe(2);
    // Bloodlust charge must be preserved
    expect(levelled.bloodlustAttackAvailable).toBe(true);
    expect(levelled.hasAttackedThisTurn).toBe(false);
  });

  /**
   * A unit without a pending charge — hasAttackedThisTurn=true (has acted).
   * Level-up must not grant a spurious charge.
   */
  it('does not grant a spurious bloodlust charge when none was pending', () => {
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5, [UnitTag.BLOODLUST]);
    rider.bloodlustAttackAvailable = false;
    rider.hasAttackedThisTurn = true; // has already acted normally
    rider.xp = 3;

    const initialState = makeState([rider]);
    const nextState = produce(initialState, (draft) => {
      applyLevelUps(draft, rider.id, 2, true);
    });

    const levelled = nextState.units[rider.id]!;
    expect(levelled.bloodlustAttackAvailable).toBe(false);
    // hasAttackedThisTurn is not restored (it was true before = no pending charge)
  });
});

// ── 1B (12): PIERCE friendly fire ────────────────────────────────────────────

describe('1B (12) – PIERCE friendly fire', () => {
  /**
   * Enemy LANCER (PIERCE) kills a front enemy, leaving a player unit directly
   * behind. The player (friendly-to-enemy) rear unit must take NO damage.
   * A PIERCE_DAMAGE event with amount=0 must still be emitted for VFX.
   *
   * Note: attacker is ENEMY, rear unit is PLAYER — same faction check applies.
   */
  it('deals no damage to a friendly rear unit but still emits a PIERCE_DAMAGE event (amount 0)', () => {
    // Use enemy LANCER as attacker: PIERCE tag, melee
    // Front target is also enemy (LANCER attacks its own front unit? No — attacker is enemy,
    // defender must be hostile. Let's make a player front unit instead.)
    // Actually: attacker=ENEMY, so hostile targets are PLAYER units.
    // Make attacker player and defender enemy for a cleaner test.
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    // Friendly (player) rear unit at (5,5) — behind the defender relative to attacker
    const friendlyRear = makePlayerUnit(UnitType.RIDER, 5, 5);
    const rearInitialHp = friendlyRear.stats.currentHp;

    const initialState = makeState([playerLancer, frontEnemy, friendlyRear]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, playerLancer.id, frontEnemy.id, true, outEvents);
    });

    // Friendly rear unit must survive with unchanged HP
    const rear = nextState.units[friendlyRear.id]!;
    expect(rear).toBeDefined();
    expect(rear.stats.currentHp).toBe(rearInitialHp);

    // A PIERCE_DAMAGE event must still be emitted for VFX (amount 0)
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { unitId: string | null }).unitId === friendlyRear.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });

  /**
   * Verify the enemy rear unit case is unchanged: it still takes full pierce damage.
   */
  it('still damages a hostile rear unit for fullPrimaryDamage × PIERCE_SECONDARY_DAMAGE_MULTIPLIER', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    // Hostile rear unit at (5,5)
    const hostileRear = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5, { currentHp: 100, maxHp: 100 });
    const rearInitialHp = hostileRear.stats.currentHp;
    const fullPrimaryDamage = calculateCombatFromStats(
      unitToCombatant(playerLancer),
      unitToCombatant(frontEnemy),
    ).defenderHpLost;
    const expectedRearDamage = Math.max(1, Math.round(fullPrimaryDamage * PIERCE_SECONDARY_DAMAGE_MULTIPLIER));

    const initialState = makeState([playerLancer, frontEnemy, hostileRear]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, playerLancer.id, frontEnemy.id, true, outEvents);
    });

    const rear = nextState.units[hostileRear.id];
    // HP must have decreased (or unit killed)
    const rearHp = rear ? rear.stats.currentHp : 0;
    expect(rearInitialHp - rearHp).toBe(expectedRearDamage);

    // PIERCE_DAMAGE event must have a positive amount
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { unitId: string | null }).unitId === hostileRear.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(expectedRearDamage);
  });

  /**
   * Friendly rear BUILDING takes no damage; VFX-only event is still emitted.
   */
  it('deals no damage to a friendly rear building but still emits a PIERCE_DAMAGE event (amount 0)', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    const friendlyBuilding = makePlayerBuilding(5, 5, 80);
    const bldInitialHp = friendlyBuilding.hp;

    const initialState = makeState([playerLancer, frontEnemy], [friendlyBuilding]);
    // Place building on grid tile
    initialState.grid[5][5].buildingId = friendlyBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, playerLancer.id, frontEnemy.id, true, outEvents);
    });

    // Friendly building must not lose HP
    expect(nextState.buildings[friendlyBuilding.id]!.hp).toBe(bldInitialHp);

    // VFX-only event emitted with amount=0
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { buildingId: string | null }).buildingId === friendlyBuilding.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });

  it('enemy pierce attacker does not damage an enemy rear unit behind a player defender', () => {
    const enemyLancer = makeEnemyUnit(UnitType.LANCER, 3, 5);
    const playerFront = makePlayerUnit(UnitType.RIDER, 4, 5, [], { currentHp: 1, maxHp: 100 });
    const enemyRear = makeEnemyUnit(UnitType.RIDER, 5, 5);
    const rearInitialHp = enemyRear.stats.currentHp;

    const initialState = makeState([enemyLancer, playerFront, enemyRear]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, enemyLancer.id, playerFront.id, true, outEvents);
    });

    expect(nextState.units[enemyRear.id]!.stats.currentHp).toBe(rearInitialHp);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { unitId: string | null }).unitId === enemyRear.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });

  it('does not damage a neutral rear building and still emits VFX-only PIERCE_DAMAGE (amount 0)', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 1, maxHp: 100 });
    const neutralBuilding = makeNeutralBuilding(5, 5, 80);
    const initialHp = neutralBuilding.hp;

    const initialState = makeState([playerLancer, frontEnemy], [neutralBuilding]);
    initialState.grid[5][5].buildingId = neutralBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, playerLancer.id, frontEnemy.id, true, outEvents);
    });

    expect(nextState.buildings[neutralBuilding.id]!.hp).toBe(initialHp);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { buildingId: string | null }).buildingId === neutralBuilding.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });
});

describe('1B (12) – PIERCE friendly fire in resolveAttackOnBuilding', () => {
  it('deals no damage to a friendly rear unit but still emits a PIERCE_DAMAGE event (amount 0)', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemyBuilding = makeEnemyBuilding(4, 5, 80);
    const friendlyRear = makePlayerUnit(UnitType.RIDER, 5, 5);
    const rearInitialHp = friendlyRear.stats.currentHp;

    const initialState = makeState([playerLancer, friendlyRear], [frontEnemyBuilding]);
    initialState.grid[5][4].buildingId = frontEnemyBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttackOnBuilding(draft, playerLancer.id, frontEnemyBuilding.id, true, outEvents);
    });

    expect(nextState.units[friendlyRear.id]!.stats.currentHp).toBe(rearInitialHp);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { unitId: string | null }).unitId === friendlyRear.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });

  it('deals no damage to a friendly rear building but still emits a PIERCE_DAMAGE event (amount 0)', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemyBuilding = makeEnemyBuilding(4, 5, 80);
    const friendlyRearBuilding = makePlayerBuilding(5, 5, 80);
    const initialHp = friendlyRearBuilding.hp;

    const initialState = makeState([playerLancer], [frontEnemyBuilding, friendlyRearBuilding]);
    initialState.grid[5][4].buildingId = frontEnemyBuilding.id;
    initialState.grid[5][5].buildingId = friendlyRearBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttackOnBuilding(draft, playerLancer.id, frontEnemyBuilding.id, true, outEvents);
    });

    expect(nextState.buildings[friendlyRearBuilding.id]!.hp).toBe(initialHp);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { buildingId: string | null }).buildingId === friendlyRearBuilding.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });

  it('still damages a hostile rear unit for fullPrimaryDamage × PIERCE_SECONDARY_DAMAGE_MULTIPLIER', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemyBuilding = makeEnemyBuilding(4, 5, 80);
    const hostileRear = makeEnemyUnit(UnitType.LAVA_GRUNT, 5, 5, { currentHp: 100, maxHp: 100 });
    const rearInitialHp = hostileRear.stats.currentHp;
    const fullPrimaryDamage = calculateCombatFromStats(
      unitToCombatant(playerLancer),
      buildingToCombatant(frontEnemyBuilding)!,
    ).defenderHpLost;
    const expectedRearDamage = Math.max(1, Math.round(fullPrimaryDamage * PIERCE_SECONDARY_DAMAGE_MULTIPLIER));

    const initialState = makeState([playerLancer, hostileRear], [frontEnemyBuilding]);
    initialState.grid[5][4].buildingId = frontEnemyBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttackOnBuilding(draft, playerLancer.id, frontEnemyBuilding.id, true, outEvents);
    });

    const rear = nextState.units[hostileRear.id];
    const rearHp = rear ? rear.stats.currentHp : 0;
    expect(rearInitialHp - rearHp).toBe(expectedRearDamage);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { unitId: string | null }).unitId === hostileRear.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(expectedRearDamage);
  });

  it('enemy pierce attacker does not damage an enemy rear unit behind a player building defender', () => {
    const enemyLancer = makeEnemyUnit(UnitType.LANCER, 3, 5);
    const playerBuilding = makePlayerBuilding(4, 5, 80);
    const enemyRear = makeEnemyUnit(UnitType.RIDER, 5, 5);
    const rearInitialHp = enemyRear.stats.currentHp;

    const initialState = makeState([enemyLancer, enemyRear], [playerBuilding]);
    initialState.grid[5][4].buildingId = playerBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttackOnBuilding(draft, enemyLancer.id, playerBuilding.id, true, outEvents);
    });

    expect(nextState.units[enemyRear.id]!.stats.currentHp).toBe(rearInitialHp);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { unitId: string | null }).unitId === enemyRear.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });

  it('does not damage a neutral rear building and still emits VFX-only PIERCE_DAMAGE (amount 0)', () => {
    const playerLancer = makePlayerUnit(UnitType.LANCER, 3, 5);
    const frontEnemyBuilding = makeEnemyBuilding(4, 5, 80);
    const neutralRearBuilding = makeNeutralBuilding(5, 5, 80);
    const initialHp = neutralRearBuilding.hp;

    const initialState = makeState([playerLancer], [frontEnemyBuilding, neutralRearBuilding]);
    initialState.grid[5][4].buildingId = frontEnemyBuilding.id;
    initialState.grid[5][5].buildingId = neutralRearBuilding.id;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttackOnBuilding(draft, playerLancer.id, frontEnemyBuilding.id, true, outEvents);
    });

    expect(nextState.buildings[neutralRearBuilding.id]!.hp).toBe(initialHp);
    const pierceEvt = outEvents.find(
      (e) => e.type === 'PIERCE_DAMAGE' && (e as { buildingId: string | null }).buildingId === neutralRearBuilding.id,
    );
    expect(pierceEvt).toBeDefined();
    expect((pierceEvt as { amount: number }).amount).toBe(0);
  });
});

// ── 1C (10): FLYING ranged vulnerability ─────────────────────────────────────

describe('1C (10) – FLYING ranged vulnerability', () => {
  function computeBaseDamage(attackerAttack: number, defenderDefense: number): number {
    return Math.round(attackerAttack * (attackerAttack / (attackerAttack + defenderDefense)));
  }

  it('non-flying RANGED attacker deals +25% damage to a FLYING defender', () => {
    const archer = makePlayerUnit(UnitType.ARCHER, 2, 5); // RANGED, no FLYING
    // LAVA_GRUNT: def=50, hp=100; add FLYING tag; no counter (range 1 < distance 2)
    const flyingEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 100, maxHp: 100 });
    flyingEnemy.tags.push(UnitTag.FLYING);

    const initialState = makeState([archer, flyingEnemy]);
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, archer.id, flyingEnemy.id, true);
    });

    const hpLost = 100 - nextState.units[flyingEnemy.id]!.stats.currentHp;
    const baseDamage = computeBaseDamage(archer.stats.attack, flyingEnemy.stats.defense);
    const flyingDamage = Math.round(baseDamage * FLYING_RANGED_DAMAGE_TAKEN_MULTIPLIER);
    expect(hpLost).toBe(flyingDamage);
  });

  it('melee attacker does NOT get the FLYING bonus against a FLYING defender', () => {
    // RIDER: att=70, def=35, attackRange=1 (melee, no RANGED tag)
    const rider = makePlayerUnit(UnitType.RIDER, 3, 5);
    const flyingEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 100, maxHp: 100 });
    flyingEnemy.tags.push(UnitTag.FLYING);

    const initialState = makeState([rider, flyingEnemy]);
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, rider.id, flyingEnemy.id, true);
    });

    const hpLost = 100 - nextState.units[flyingEnemy.id]!.stats.currentHp;
    const baseDamage = computeBaseDamage(rider.stats.attack, flyingEnemy.stats.defense);
    expect(hpLost).not.toBe(Math.round(baseDamage * FLYING_RANGED_DAMAGE_TAKEN_MULTIPLIER));
    expect(hpLost).toBe(baseDamage);
  });

  it('flying RANGED attacker does NOT get the FLYING bonus (attacker also has FLYING)', () => {
    // Add FLYING to the ARCHER — attacker.tags includes FLYING → no modifier
    const archer = makePlayerUnit(UnitType.ARCHER, 2, 5, [UnitTag.FLYING]);
    const flyingEnemy = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5, { currentHp: 100, maxHp: 100 });
    flyingEnemy.tags.push(UnitTag.FLYING);

    const initialState = makeState([archer, flyingEnemy]);
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, archer.id, flyingEnemy.id, true);
    });

    const hpLost = 100 - nextState.units[flyingEnemy.id]!.stats.currentHp;
    const baseDamage = computeBaseDamage(archer.stats.attack, flyingEnemy.stats.defense);
    expect(hpLost).toBe(baseDamage);
  });
});

// ── 1D (5): SPLASH fog-of-war floater ────────────────────────────────────────

describe('1D (5) – SPLASH fog-of-war floater', () => {
  /**
   * Verify that a splash target on an UNREVEALED tile still receives damage and
   * the SPLASH_DAMAGE event is emitted. The floater is suppressed in tests via
   * suppressFloaters=true (3rd arg to resolveAttack), so we cannot assert on it
   * directly — but we confirm the damage path is intact.
   */
  it('applies damage to a splash target on an unrevealed tile and emits the SPLASH_DAMAGE event', () => {
    const siege = makePlayerUnit(UnitType.SIEGE, 1, 5, [UnitTag.SPLASH]);
    // Primary defender (4,5) has full HP (survives so SPLASH still fires on combatResult.defenderHpLost > 0)
    const primary = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5);
    // Splash target on an unrevealed tile at (4,6)
    const splashTarget = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 6);
    const initialHp = splashTarget.stats.currentHp;

    const initialState = makeState([siege, primary, splashTarget]);
    // Mark the splash target's tile as NOT revealed
    initialState.grid[6][4].isRevealed = false;

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, siege.id, primary.id, true, outEvents);
    });

    // Damage must still be applied even though tile is not revealed
    const splashHp = nextState.units[splashTarget.id]?.stats.currentHp;
    expect(splashHp).toBeDefined();
    expect(splashHp!).toBeLessThan(initialHp);

    // SPLASH_DAMAGE event must be emitted
    const splashEvt = outEvents.find(
      (e) => e.type === 'SPLASH_DAMAGE' && (e as { unitId: string }).unitId === splashTarget.id,
    );
    expect(splashEvt).toBeDefined();
    expect((splashEvt as { amount: number }).amount).toBeGreaterThan(0);
  });

  /**
   * Revealed tile: same assertions confirm no regression in the normal path.
   */
  it('applies damage and emits the SPLASH_DAMAGE event for a revealed splash tile', () => {
    const siege = makePlayerUnit(UnitType.SIEGE, 1, 5, [UnitTag.SPLASH]);
    const primary = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 5);
    const splashTarget = makeEnemyUnit(UnitType.LAVA_GRUNT, 4, 6);
    const initialHp = splashTarget.stats.currentHp;

    const initialState = makeState([siege, primary, splashTarget]);
    // isRevealed = true by default

    const outEvents: GameEvent[] = [];
    const nextState = produce(initialState, (draft) => {
      resolveAttack(draft, siege.id, primary.id, true, outEvents);
    });

    const splashHp = nextState.units[splashTarget.id]?.stats.currentHp;
    expect(splashHp).toBeDefined();
    expect(splashHp!).toBeLessThan(initialHp);

    const splashEvt = outEvents.find(
      (e) => e.type === 'SPLASH_DAMAGE' && (e as { unitId: string }).unitId === splashTarget.id,
    );
    expect(splashEvt).toBeDefined();
    expect((splashEvt as { amount: number }).amount).toBeGreaterThan(0);
  });
});
