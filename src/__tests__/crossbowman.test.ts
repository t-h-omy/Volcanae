/**
 * Tests for the Crossbowman unit (v0.92.0).
 *
 * Covers:
 *   1. Stats and tags — definition correctness
 *   2. PUNCTURE — ignores defensive bonuses; stuns high-DEF defenders; ALERT immune
 *   3. RELOAD — crossbowman that fired takes more damage (DEF −50%); no penalty before firing;
 *              penalty gone after turn-start reset
 *   4. Recruitment / unlock — ARCHER_CAMP lists CROSSBOWMAN; requires CROSSBOWMEN tech;
 *              shares the camp's unitLimit with archers
 *   5. COVER share — researching COVER grants COVER to crossbowmen too
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { resolveAttack } from '../combatSystem';
import { getRecruitableUnitTypes, computeRecruitmentBuildingUsage } from '../resourceSystem';
import {
  UNIT_DEFINITIONS,
  ABILITIES,
  TECH_TREE,
} from '../gameConfig';
import { unlockTech } from '../techSystem';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, GameStats, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

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
  overrides: Partial<Unit> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS] as {
    maxHp: number; attack: number; defense: number; moveRange: number;
    discoverRadius: number; triggerRange: number; movementActions: number;
    attackRange: number; tags: UnitTag[];
  };
  const id = nextId(type);
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
    hasTradedThisTurn: false,
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

function makeState(units: Unit[]): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;

  const grid = makeGrid(units.map((u) => ({ id: u.id, x: u.position.x, y: u.position.y })));

  return {
    units: unitsMap,
    buildings: {},
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 1,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
  } as unknown as GameState;
}

function makeBuilding(
  id: string,
  type: BuildingType,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction: Faction.PLAYER,
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

// ── 1. Stats and tags ─────────────────────────────────────────────────────────

describe('Crossbowman — stats and tags', () => {
  const def = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN];

  it('has the correct base stats', () => {
    expect(def.maxHp).toBe(100);
    expect(def.attack).toBe(65);
    expect(def.defense).toBe(35);
    expect(def.moveRange).toBe(1);
    expect(def.attackRange).toBe(2);
    expect(def.movementActions).toBe(1);
  });

  it('has the correct tags', () => {
    expect(def.tags).toContain(UnitTag.RANGED);
    expect(def.tags).toContain(UnitTag.RELOAD);
    expect(def.tags).toContain(UnitTag.PUNCTURE);
    expect(def.tags).toContain(UnitTag.BUILDANDCAPTURE);
  });

  it('has a non-empty description', () => {
    expect(def.description.length).toBeGreaterThan(0);
  });

  it('has the correct cost', () => {
    expect(def.cost.iron).toBe(4);
    expect(def.cost.wood).toBe(12);
  });

  it('has the correct population cost', () => {
    expect(def.populationCost.farmers).toBe(1);
    expect(def.populationCost.nobles).toBe(0);
  });

  it('has default HP level-up entries', () => {
    expect(def.levelUp).toHaveLength(2);
  });
});

// ── 2. PUNCTURE mechanic ──────────────────────────────────────────────────────

describe('Crossbowman — PUNCTURE', () => {
  /**
   * A PHALANX ally adjacent to the defender boosts its defense.
   * A PUNCTURE attacker should reset that back to raw stats.defense.
   */
  it('ignores PHALANX defense bonus on the defender', () => {
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 1, 5);
    const defender = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 5);
    // Give the defender a PHALANX ally so it would get a bonus
    const phalanxAlly = makeUnit(UnitType.BULLWARK, Faction.ENEMY, 3, 4, {
      tags: [UnitTag.PHALANX],
    });

    const state = makeState([crossbow, defender, phalanxAlly]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(state, (draft) => {
      resolveAttack(draft, crossbow.id, defender.id, true, outEvents);
    });

    // With PUNCTURE, the DEFENSE_BONUS_IGNORED event should fire if the bonus existed
    // (PHALANX adds a bonus, PUNCTURE strips it — event emitted).
    const defBonusIgnored = outEvents.some((e) => e.type === 'DEFENSE_BONUS_IGNORED');
    expect(defBonusIgnored).toBe(true);

    // Defender must have taken damage
    const defenderAfter = nextState.units[defender.id];
    if (defenderAfter) {
      expect(defenderAfter.stats.currentHp).toBeLessThan(defender.stats.currentHp);
    }
    // (defender could be dead — either way damage was dealt)
  });

  it('stuns a defender whose base DEF exceeds the threshold', () => {
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 1, 5);
    // Give the defender high base defense (above ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD)
    const highDefDef = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 5, {
      stats: {
        maxHp: 200, currentHp: 200, attack: 20,
        defense: ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD + 10,
        moveRange: 1, discoverRadius: 1, triggerRange: 0,
        movementActions: 1, attackRange: 1,
      },
    });

    const state = makeState([crossbow, highDefDef]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(state, (draft) => {
      resolveAttack(draft, crossbow.id, highDefDef.id, true, outEvents);
    });

    const defenderAfter = nextState.units[highDefDef.id];
    // Defender should be pinned (not dead — it has 200 HP)
    expect(defenderAfter).toBeDefined();
    expect(defenderAfter!.pinnedUntilTurn).toBeGreaterThanOrEqual(
      state.turn + ABILITIES.PUNCTURE_STUN_DURATION - 1,
    );
  });

  it('does NOT stun an ALERT defender', () => {
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 1, 5);
    const alertDef = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 5, {
      tags: [UnitTag.ALERT],
      stats: {
        maxHp: 200, currentHp: 200, attack: 20,
        defense: ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD + 10,
        moveRange: 1, discoverRadius: 1, triggerRange: 0,
        movementActions: 1, attackRange: 1,
      },
    });

    const state = makeState([crossbow, alertDef]);
    const outEvents: GameEvent[] = [];
    const nextState = produce(state, (draft) => {
      resolveAttack(draft, crossbow.id, alertDef.id, true, outEvents);
    });

    // ALERT immune: STUN_BLOCKED event emitted, pinnedUntilTurn stays 0
    const defenderAfter = nextState.units[alertDef.id];
    expect(defenderAfter).toBeDefined();
    expect(defenderAfter!.pinnedUntilTurn).toBe(0);

    const stunBlocked = outEvents.find((e) => e.type === 'STUN_BLOCKED');
    expect(stunBlocked).toBeDefined();
  });
});

// ── 3. RELOAD mechanic ────────────────────────────────────────────────────────

describe('Crossbowman — RELOAD', () => {
  /**
   * Helper: compute expected damage taken by a RELOAD unit.
   * Uses the Polytopia formula: damage = ATK * (ATK / (ATK + DEF)).
   */
  function expectedDamage(atkValue: number, defValue: number): number {
    return Math.round(atkValue * (atkValue / (atkValue + defValue)));
  }

  it('crossbowman that has attacked takes MORE damage (DEF penalty applied)', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 1, 5);
    // Crossbowman has already fired this turn
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 3, 5, {
      hasAttackedThisTurn: true,
    });

    const state = makeState([attacker, crossbow]);
    const nextState = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, crossbow.id, true);
    });

    const cbAfter = nextState.units[crossbow.id];
    if (!cbAfter) return; // might be dead — that's still more damage

    const baseDef = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].defense;
    const penalisedDef = Math.floor(baseDef * (1 - ABILITIES.RELOAD_DEF_PENALTY_PCT / 100));
    const atkValue = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].attack;

    const dmgWithPenalty = expectedDamage(atkValue, penalisedDef);
    const hpLost = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].maxHp - cbAfter.stats.currentHp;
    expect(hpLost).toBe(dmgWithPenalty);
  });

  it('crossbowman that has NOT attacked takes NORMAL damage (no penalty)', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 1, 5);
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 3, 5, {
      hasAttackedThisTurn: false,
    });

    const state = makeState([attacker, crossbow]);
    const nextState = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, crossbow.id, true);
    });

    const cbAfter = nextState.units[crossbow.id];
    if (!cbAfter) return;

    const baseDef = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].defense;
    const atkValue = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].attack;
    const dmgNormal = expectedDamage(atkValue, baseDef);

    const hpLost = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].maxHp - cbAfter.stats.currentHp;
    expect(hpLost).toBe(dmgNormal);
  });

  it('RELOAD penalty damage is strictly greater than normal damage', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 1, 5);
    const cbFired   = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 3, 5, { hasAttackedThisTurn: true });
    const cbRested  = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 5, 5, { hasAttackedThisTurn: false });

    const stateFired  = makeState([attacker, cbFired]);
    const stateRested = makeState([attacker, cbRested]);

    const nextFired  = produce(stateFired,  (draft) => { resolveAttack(draft, attacker.id, cbFired.id,  true); });
    const nextRested = produce(stateRested, (draft) => { resolveAttack(draft, attacker.id, cbRested.id, true); });

    const cbFiredAfter  = nextFired.units[cbFired.id];
    const cbRestedAfter = nextRested.units[cbRested.id];

    const hpLostFired  = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].maxHp - (cbFiredAfter?.stats.currentHp ?? 0);
    const hpLostRested = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].maxHp - (cbRestedAfter?.stats.currentHp ?? 0);

    expect(hpLostFired).toBeGreaterThan(hpLostRested);
  });

  it('penalty is absent after turn-start reset (hasAttackedThisTurn = false)', () => {
    // Simulate turn-start: hasAttackedThisTurn has been reset to false
    const attacker = makeUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, 1, 5);
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 3, 5, {
      hasAttackedThisTurn: false,
    });

    const state = makeState([attacker, crossbow]);
    const nextState = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, crossbow.id, true);
    });

    const cbAfter = nextState.units[crossbow.id];
    if (!cbAfter) return;

    const baseDef = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].defense;
    const atkValue = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].attack;
    const dmgNormal = Math.round(atkValue * (atkValue / (atkValue + baseDef)));

    const hpLost = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].maxHp - cbAfter.stats.currentHp;
    expect(hpLost).toBe(dmgNormal);
  });
});

// ── 4. Recruitment and unlock ─────────────────────────────────────────────────

describe('Crossbowman — recruitment and unlock', () => {
  it('ARCHER_CAMP getRecruitableUnitTypes includes CROSSBOWMAN', () => {
    const types = getRecruitableUnitTypes(BuildingType.ARCHER_CAMP);
    expect(types).toContain(UnitType.CROSSBOWMAN);
  });

  it('ARCHER_CAMP getRecruitableUnitTypes also still includes ARCHER', () => {
    const types = getRecruitableUnitTypes(BuildingType.ARCHER_CAMP);
    expect(types).toContain(UnitType.ARCHER);
  });

  it('CROSSBOWMAN requires the CROSSBOWMEN tech to be unlocked', () => {
    const crossbowmenNode = TECH_TREE.find((n) => n.id === 'CROSSBOWMEN');
    expect(crossbowmenNode).toBeDefined();
    const hasUnlockEffect = crossbowmenNode!.effects.some(
      (e) => e.type === 'UNLOCK_UNIT' && e.unitType === UnitType.CROSSBOWMAN,
    );
    expect(hasUnlockEffect).toBe(true);
  });

  it('CROSSBOWMEN tech requires FAR_REACH', () => {
    const node = TECH_TREE.find((n) => n.id === 'CROSSBOWMEN');
    expect(node).toBeDefined();
    expect(node!.requires).toContain('FAR_REACH');
  });

  it('CROSSBOWMAN shares the ARCHER_CAMP unitLimit with archers', () => {
    // Place 1 archer and 1 crossbowman at the camp; limit should reflect both
    const camp = makeBuilding('camp1', BuildingType.ARCHER_CAMP, 0, 0);
    const archer = makeUnit(UnitType.ARCHER, Faction.PLAYER, 2, 0);
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 3, 0);

    const state = {
      units: {
        [archer.id]: archer,
        [crossbow.id]: crossbow,
      },
      buildings: { [camp.id]: camp },
    } as unknown as GameState;

    const { current } = computeRecruitmentBuildingUsage(state, BuildingType.ARCHER_CAMP);
    // Both archer and crossbowman count toward the shared limit
    expect(current).toBe(2);
  });
});

// ── 5. COVER sharing ──────────────────────────────────────────────────────────

describe('Crossbowman — COVER tech sharing', () => {
  it('COVER tech node grants COVER tag to CROSSBOWMAN', () => {
    const coverNode = TECH_TREE.find((n) => n.id === 'COVER');
    expect(coverNode).toBeDefined();
    const grantsCover = coverNode!.effects.some(
      (e) =>
        e.type === 'GRANT_UNIT_TAG' &&
        e.unitType === UnitType.CROSSBOWMAN &&
        e.tag === UnitTag.COVER,
    );
    expect(grantsCover).toBe(true);
  });

  it('COVER tech still grants COVER tag to ARCHER', () => {
    const coverNode = TECH_TREE.find((n) => n.id === 'COVER');
    expect(coverNode).toBeDefined();
    const grantsArcherCover = coverNode!.effects.some(
      (e) =>
        e.type === 'GRANT_UNIT_TAG' &&
        e.unitType === UnitType.ARCHER &&
        e.tag === UnitTag.COVER,
    );
    expect(grantsArcherCover).toBe(true);
  });

  it('researching COVER grants COVER to existing crossbowmen in the state', () => {
    const crossbow = makeUnit(UnitType.CROSSBOWMAN, Faction.PLAYER, 2, 0);
    // Build a minimal state with the tech tree and required pre-researched nodes
    const techNodes: Record<string, { unlocked: boolean }> = {};
    for (const node of TECH_TREE) {
      techNodes[node.id] = { unlocked: false };
    }
    // Pre-unlock prerequisites
    techNodes['CONSCRIPTION'] = { unlocked: true };
    techNodes['FAR_REACH'] = { unlocked: true };

    const state = {
      units: { [crossbow.id]: crossbow },
      buildings: {},
      unlockedUnits: [UnitType.CROSSBOWMAN],
      unlockedBuildings: [],
      techFlags: [],
      techNodes,
      gameStats: makeGameStats(),
      arcaneCrystals: 99,
      ember: 0,
      resources: { iron: 99, wood: 99 },
    } as unknown as GameState;

    const nextState = produce(state, (draft) => {
      unlockTech(draft, 'COVER');
    });

    const cb = nextState.units[crossbow.id];
    expect(cb).toBeDefined();
    expect(cb.tags).toContain(UnitTag.COVER);
  });
});

// ── 6. RELOAD DEF penalty display logic ───────────────────────────────────────

/**
 * Exported helper that mirrors the penalty calculation used in HUD.tsx so it
 * can be unit-tested without rendering.
 *
 * Parameters match the HUD memo:
 *   effDef = unit.stats.defense + phalanxDefense + contextualDef - distractionDefPenalty
 *
 * Returns the penalty that should be shown in red (0 when the crossbowman has
 * not yet fired, or when the effective DEF before reload is ≤ 0).
 */
export function computeReloadDefPenalty(
  hasAttackedThisTurn: boolean,
  effDefBeforeReload: number,
): number {
  if (!hasAttackedThisTurn) return 0;
  return Math.floor(Math.max(0, effDefBeforeReload) * ABILITIES.RELOAD_DEF_PENALTY_PCT / 100);
}

describe('Crossbowman — RELOAD DEF penalty display logic', () => {
  const BASE_DEF = UNIT_DEFINITIONS[UnitType.CROSSBOWMAN].defense; // 35

  it('computes the correct penalty when hasAttackedThisTurn is true', () => {
    // Math.floor(35 * 50 / 100) = 17
    const expected = Math.floor(BASE_DEF * ABILITIES.RELOAD_DEF_PENALTY_PCT / 100);
    expect(expected).toBe(17);
    expect(computeReloadDefPenalty(true, BASE_DEF)).toBe(17);
  });

  it('returns 0 when hasAttackedThisTurn is false (no penalty before firing)', () => {
    expect(computeReloadDefPenalty(false, BASE_DEF)).toBe(0);
  });

  it('returns 0 when effective DEF is 0 or negative', () => {
    expect(computeReloadDefPenalty(true, 0)).toBe(0);
    expect(computeReloadDefPenalty(true, -5)).toBe(0);
  });

  it('penalty clears at turn start (hasAttackedThisTurn resets to false)', () => {
    // Simulates the state after turn-start reset
    const penaltyAfterReset = computeReloadDefPenalty(false, BASE_DEF);
    expect(penaltyAfterReset).toBe(0);
  });
});
