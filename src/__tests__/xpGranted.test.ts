/**
 * VG-12 repro tests: XP banked at 7, max-level display, and level-up healing.
 *
 * Tests:
 *   (a) A level-1 unit with 7 banked XP satisfies canLevelUp semantics and
 *       levelUpUnit heals it to full HP on each level gained.
 *   (b) A unit that already qualifies for MAX_LEVEL receives no further XP from
 *       grantXp (verifying the early-return guard and canGrantXp helper).
 *   (c) Level-up while the unit has UNTRAINED / HOMELESS tags applies boosts,
 *       heals to maxHp, and a subsequent tag revoke restores stats correctly
 *       without corrupting HP.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { UnitType, Faction, UnitTag, TileType } from '../types';
import type { GameState, Unit, Tile, GameStats } from '../types';
import { UNIT_DEFINITIONS, XP, LEVEL_UP_VALUES, POPULATION, TRAINING } from '../gameConfig';
import { computeLevelFromXp, canGrantXp, applyLevelUps, grantXp } from '../levelSystem';
import { applyTagStatEffects, revokeTagStatEffects } from '../techSystem';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makePlayerUnit(
  type: UnitType,
  x: number,
  y: number,
  extraTags: UnitTag[] = [],
  xpOverride = 0,
  levelOverride = 1,
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
    xp: xpOverride,
    level: levelOverride,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeState(units: Unit[]): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const grid: Tile[][] = Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 6 }, (_, x) => makeTile(x, y)),
  );
  for (const u of units) {
    grid[u.position.y][u.position.x].unitId = u.id;
  }
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

// ── (a) XP banked at 7: canLevelUp and heal-to-full ──────────────────────────

describe('(a) XP=7 banked at level 1 shows canLevelUp and heals on level-up', () => {
  it('computeLevelFromXp returns MAX_LEVEL (3) for XP=7 regardless of unit.level', () => {
    expect(computeLevelFromXp(UnitType.GUARD, LEVEL_UP_VALUES.XP_TO_LEVEL_3)).toBe(XP.MAX_LEVEL);
    expect(computeLevelFromXp(UnitType.GUARD, LEVEL_UP_VALUES.XP_TO_LEVEL_3)).toBeGreaterThan(1);
  });

  it('canLevelUp semantics: targetLevel 3 > unit.level 1 → button should be available', () => {
    const unit = makePlayerUnit(UnitType.GUARD, 0, 0, [], LEVEL_UP_VALUES.XP_TO_LEVEL_3, 1);
    const targetLevel = computeLevelFromXp(unit.type, unit.xp);
    expect(targetLevel).toBe(XP.MAX_LEVEL);
    expect(targetLevel).toBeGreaterThan(unit.level); // canLevelUp === true
  });

  it('applyLevelUps from level 1 to 3 heals unit to maxHp on each step', () => {
    const guardDef = UNIT_DEFINITIONS[UnitType.GUARD];
    const baseMaxHp = guardDef.maxHp;
    // Level-2 boost: +HP_BOOST_DEFAULT, level-3 boost: +HP_BOOST_DEFAULT2
    const expectedMaxHp = baseMaxHp + LEVEL_UP_VALUES.HP_BOOST_DEFAULT + LEVEL_UP_VALUES.HP_BOOST_DEFAULT2;

    // Damage the unit before leveling up
    const unit = makePlayerUnit(UnitType.GUARD, 0, 0, [], LEVEL_UP_VALUES.XP_TO_LEVEL_3, 1);
    const damagedHp = Math.floor(baseMaxHp / 2);
    const state = makeState([unit]);
    const resolved = produce(state, (draft) => {
      draft.units[unit.id].stats.currentHp = damagedHp;
      applyLevelUps(draft, unit.id, XP.MAX_LEVEL, true);
    });

    const after = resolved.units[unit.id];
    expect(after.level).toBe(XP.MAX_LEVEL);
    expect(after.stats.maxHp).toBe(expectedMaxHp);
    // HP must be fully restored to new maxHp (the reported "never healed" bug)
    expect(after.stats.currentHp).toBe(expectedMaxHp);
  });
});

// ── (b) Unit at MAX_LEVEL XP receives no further XP ──────────────────────────

describe('(b) grantXp refuses XP when unit already qualifies for MAX_LEVEL', () => {
  it('canGrantXp returns false at XP=7 (qualifies for level 3)', () => {
    expect(canGrantXp(UnitType.GUARD, LEVEL_UP_VALUES.XP_TO_LEVEL_3)).toBe(false);
  });

  it('canGrantXp returns true at XP=6 (below level-3 threshold)', () => {
    expect(canGrantXp(UnitType.GUARD, LEVEL_UP_VALUES.XP_TO_LEVEL_3 - 1)).toBe(true);
  });

  it('grantXp does not increase xp when unit is already MAX_LEVEL qualified', () => {
    const unit = makePlayerUnit(UnitType.GUARD, 0, 0, [], LEVEL_UP_VALUES.XP_TO_LEVEL_3, 1);
    const state = makeState([unit]);
    const resolved = produce(state, (draft) => {
      grantXp(draft, unit.id, XP.KILL_UNIT, true);
    });
    // XP must remain at 7 -- grantXp early-returned
    expect(resolved.units[unit.id].xp).toBe(LEVEL_UP_VALUES.XP_TO_LEVEL_3);
  });

  it('grantXp does increase xp when unit is below MAX_LEVEL threshold', () => {
    const unit = makePlayerUnit(UnitType.GUARD, 0, 0, [], LEVEL_UP_VALUES.XP_TO_LEVEL_3 - 1, 1);
    const state = makeState([unit]);
    const resolved = produce(state, (draft) => {
      grantXp(draft, unit.id, XP.KILL_UNIT, true);
    });
    expect(resolved.units[unit.id].xp).toBe(LEVEL_UP_VALUES.XP_TO_LEVEL_3);
  });
});

// ── (c) Level-up with UNTRAINED / HOMELESS tags and stat round-trip ───────────

describe('(c) Level-up with overcapacity tags and tag-revoke stat integrity', () => {
  /**
   * Scenario: GUARD unit with UNTRAINED (-ATK) and HOMELESS (-DEF) tags levels
   * up from 1 to 3. After the level-up:
   *   - maxHp and currentHp must equal the fully-healed post-boost value.
   *   - Revoking UNTRAINED restores ATK to base.
   *   - Revoking HOMELESS restores DEF to base.
   *   - currentHp is NOT raised by the revoke (it was already at max from level-up).
   */
  it('applies boosts and heals during level-up; tag revoke restores stats without HP corruption', () => {
    const guardDef = UNIT_DEFINITIONS[UnitType.GUARD];
    const baseAtk = guardDef.attack;
    const baseDef = guardDef.defense;
    const baseMaxHp = guardDef.maxHp;
    const expectedMaxHp = baseMaxHp + LEVEL_UP_VALUES.HP_BOOST_DEFAULT + LEVEL_UP_VALUES.HP_BOOST_DEFAULT2;

    const unit = makePlayerUnit(UnitType.GUARD, 0, 0, [], LEVEL_UP_VALUES.XP_TO_LEVEL_3, 1);
    const state = makeState([unit]);

    const resolved = produce(state, (draft) => {
      const u = draft.units[unit.id];
      // Apply overcapacity tags (simulates syncOvercapacityTags)
      u.tags.push(UnitTag.UNTRAINED);
      applyTagStatEffects(u, UnitTag.UNTRAINED);
      u.tags.push(UnitTag.HOMELESS);
      applyTagStatEffects(u, UnitTag.HOMELESS);

      // Damage the unit before leveling up to verify HP is restored
      u.stats.currentHp = Math.floor(baseMaxHp / 2);

      // Player clicks Level Up
      applyLevelUps(draft, unit.id, XP.MAX_LEVEL, true);

      // Verify level-up healed to new maxHp (UNTRAINED/HOMELESS affect ATK/DEF,
      // not maxHp, so maxHp should equal the post-boost value)
      expect(u.level).toBe(XP.MAX_LEVEL);
      expect(u.stats.maxHp).toBe(expectedMaxHp);
      expect(u.stats.currentHp).toBe(expectedMaxHp);

      // ATK should still reflect the UNTRAINED penalty
      expect(u.stats.attack).toBe(baseAtk - TRAINING.UNTRAINED_ATK_PENALTY);
      // DEF should still reflect the HOMELESS penalty
      expect(u.stats.defense).toBe(baseDef - POPULATION.HOMELESS_DEF_PENALTY);

      // Now revoke the overcapacity tags (unit gets housed / trained)
      u.tags = u.tags.filter((t) => t !== UnitTag.UNTRAINED);
      revokeTagStatEffects(u, UnitTag.UNTRAINED);
      u.tags = u.tags.filter((t) => t !== UnitTag.HOMELESS);
      revokeTagStatEffects(u, UnitTag.HOMELESS);

      // Stats must round-trip cleanly
      expect(u.stats.attack).toBe(baseAtk);
      expect(u.stats.defense).toBe(baseDef);

      // HP must not be inflated by the revoke (currentHp was already at maxHp)
      expect(u.stats.currentHp).toBe(expectedMaxHp);
      expect(u.stats.currentHp).toBe(u.stats.maxHp);
    });

    // Confirm final state outside produce
    const finalUnit = resolved.units[unit.id];
    expect(finalUnit.stats.attack).toBe(baseAtk);
    expect(finalUnit.stats.defense).toBe(baseDef);
    expect(finalUnit.stats.currentHp).toBe(finalUnit.stats.maxHp);
  });

  it('UNTRAINED tag revoke after level-up does not corrupt HP below maxHp', () => {
    const guardDef = UNIT_DEFINITIONS[UnitType.GUARD];
    const unit = makePlayerUnit(UnitType.GUARD, 0, 0, [], LEVEL_UP_VALUES.XP_TO_LEVEL_3, 1);
    const state = makeState([unit]);

    const resolved = produce(state, (draft) => {
      const u = draft.units[unit.id];
      u.tags.push(UnitTag.UNTRAINED);
      applyTagStatEffects(u, UnitTag.UNTRAINED);
      applyLevelUps(draft, unit.id, XP.MAX_LEVEL, true);
      // Revoke tag — should not reduce currentHp (UNTRAINED only touches ATK, not maxHp)
      u.tags = u.tags.filter((t) => t !== UnitTag.UNTRAINED);
      revokeTagStatEffects(u, UnitTag.UNTRAINED);
    });

    const finalUnit = resolved.units[unit.id];
    expect(finalUnit.stats.currentHp).toBe(finalUnit.stats.maxHp);
    expect(finalUnit.stats.currentHp).toBeGreaterThan(guardDef.maxHp);
  });
});
