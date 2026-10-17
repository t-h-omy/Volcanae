/**
 * Crystal Khyron: tech, unit definition, Crystal Chamber recruitment,
 * XP exclusion, Resonance lifecycle and Resonant Assimilation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  UnitType,
  BuildingType,
  Faction,
  UnitTag,
  TileType,
  DestroyBehavior,
  SpellId,
} from '../types';
import type { GameState, Unit, Building, Tile, Position } from '../types';
import { UNIT_DEFINITIONS, TECH_TREE, MAP, CRYSTAL_KHYRON, CRYSTAL_CHAMBER_CONFIG, XP, ABILITIES } from '../gameConfig';
import {
  recruitUnit,
  getRecruitableUnitTypes,
  computeRecruitmentBuildingUsage,
  computeUntrainedUnitIds,
  canBuildingEverRecruit,
  collectResources,
  computePopulationUsage,
} from '../resourceSystem';
import { resolveAttack, resolveAttackOnBuilding, shouldLeaveGravestone } from '../combatSystem';
import { grantXp, canGrantXp, applyLevelUps, computeLevelFromXp, getUnitTargetLevel } from '../levelSystem';
import {
  grantKhyronResonance, applyPendingAssimilations, getKhyronBankableLevels,
  recordKhyronKill, filterTransferableTags, healResonatingKhyrons,
  getKhyronResonanceTurnsRemaining, snapshotKhyronBuildingSource,
  recordKhyronAssimilationSource,
} from '../khyronSystem';
import type { GameEvent } from '../gameEvents';
import { initiateCapture } from '../captureSystem';
import { TAG_INFO } from '../../config/tagInfo';
import { LEVEL_UP_VALUES } from '../../config/progression';
import { useGameStore } from '../gameStore';
import { useFloaterStore } from '../floaterStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import HUD_SOURCE from '../components/HUD.tsx?raw';
import GRID_SOURCE from '../components/GridRenderer.tsx?raw';
import { canUnitHeal, canUnitTrade, explainInvalidHealTarget, getHealTargets } from '../unitActions';
import { createInitialSpecialists, applyEffectsForSpecialist, revokeEffectsForSpecialist } from '../specialistSystem';
import { calculateCombat } from '../combatSystem';
import { t } from '../i18n/i18n';
import { explainInvalidSpellTarget } from '../spellSystem';

let _id = 0;
const nextId = (p: string) => `${p}_${++_id}`;

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
  } as Tile;
}

function makeUnit(type: UnitType, pos: Position, faction: Faction = Faction.PLAYER, tags: UnitTag[] = []): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId('u'),
    type,
    faction,
    position: { ...pos },
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
    tags: [...def.tags, ...tags],
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

function makeBuilding(type: BuildingType, pos: Position, opts: Partial<Building> = {}): Building {
  return {
    id: nextId('b'),
    type,
    faction: Faction.PLAYER,
    position: { ...pos },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
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
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    ...opts,
  } as Building;
}

function makeState(units: Unit[] = [], buildings: Building[] = []): GameState {
  const grid: Tile[][] = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const state = {
    turn: 5,
    units: {} as Record<string, Unit>,
    buildings: {} as Record<string, Building>,
    grid,
    portals: {},
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 10,
    techNodes: {},
    techFlags: [],
    lavaFrontRow: 0,
    ember: 0,
    gameStats: {
      unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0, unitsRecruited: 0,
      buildingsConstructed: 0, buildingsConverted: 0, techsUnlocked: 0,
      enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    },
    unlockedUnits: [UnitType.MAGE, UnitType.CRYSTAL_KHYRON, UnitType.CRYSTAL_DRAKE],
    unlockedSpells: [SpellId.CRYSTAL_CAVE],
    activeCaveEncounters: [],
  } as unknown as GameState;
  for (const u of units) {
    state.units[u.id] = u;
    state.grid[u.position.y][u.position.x].unitId = u.id;
  }
  for (const b of buildings) {
    state.buildings[b.id] = b;
    state.grid[b.position.y][b.position.x].buildingId = b.id;
  }
  return state;
}

const khyron = (x = 4, y = 4, tags: UnitTag[] = [UnitTag.RESONANCE], level = 1) => {
  const u = makeUnit(UnitType.CRYSTAL_KHYRON, { x, y }, Faction.PLAYER, tags);
  u.level = level;
  u.resonanceActive = tags.includes(UnitTag.RESONANCE);
  return u;
};
const weakEnemy = (type: UnitType, x: number, y: number, extra: UnitTag[] = []) => {
  const u = makeUnit(type, { x, y }, Faction.ENEMY, extra);
  u.stats.currentHp = 1;
  return u;
};
const chamber = (x: number, y: number, resonance = 3) =>
  makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x, y }, { resonanceTurnsRemaining: resonance });

describe('Crystal Khyron tech', () => {
  const node = TECH_TREE.find((n) => n.id === 'CRYSTAL_KHYRON');
  it('is a direct child of ARCANE_AWAKENING costing 4 that unlocks the unit', () => {
    expect(node).toBeDefined();
    expect(node!.requires).toEqual(['ARCANE_AWAKENING']);
    expect(node!.cost).toBe(4);
    expect(node!.effects).toEqual([{ type: 'UNLOCK_UNIT', unitType: UnitType.CRYSTAL_KHYRON }]);
  });
  it('is placed directly after ARCANE_AWAKENING', () => {
    const i = TECH_TREE.findIndex((n) => n.id === 'ARCANE_AWAKENING');
    expect(TECH_TREE[i + 1].id).toBe('CRYSTAL_KHYRON');
  });
});

describe('Crystal Khyron unit definition', () => {
  const def = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON];
  it('has the exact base stats', () => {
    expect(def).toMatchObject({
      maxHp: 100, attack: 45, defense: 45, movementActions: 1, moveRange: 1,
      attackRange: 1, discoverRadius: 1, triggerRange: 0,
    });
  });
  it('costs 3 crystals and no iron/wood or population', () => {
    expect(def.cost).toEqual({ iron: 0, wood: 0, crystals: 3 });
    expect(def.populationCost).toEqual({ farmers: 0, nobles: 0 });
  });
  it('exposes healing and maximum level as localized text parameters', () => {
    const params = { healAmount: ABILITIES.RESONANCE_HEAL_AMOUNT, maxLevel: CRYSTAL_KHYRON.MAX_LEVEL };
    expect(def.textParams).toEqual(params);
    expect(TAG_INFO[UnitTag.RESONANCE].textParams).toEqual(params);
  });
  it('is a MECH without READY and has HP-only level-ups', () => {
    expect(def.tags).toContain(UnitTag.MECH);
    expect(def.tags).not.toContain(UnitTag.READY);
    expect(def.tags).not.toContain(UnitTag.SUMMONED);
    expect(def.tags).toEqual([UnitTag.MECH]);
    expect(def.levelUp.map((level) => level.boosts)).toEqual([
      [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT }],
      [{ stat: 'maxHp', mode: 'add', value: LEVEL_UP_VALUES.HP_BOOST_DEFAULT2 }],
    ]);
  });
  it('whitelist includes all ten transferable tags in configured order', () => {
    expect([...CRYSTAL_KHYRON.TRANSFERABLE_TAGS].sort()).toEqual(
      ['ALERT', 'BLOCK', 'BUILDANDCAPTURE', 'BURN', 'CLEAVE', 'IRONBLOOD', 'PIERCE', 'PUNCTURE', 'RAGE', 'RANGED'],
    );
  });
  it('has English text without em dashes', () => {
    expect(t('unit.CRYSTAL_KHYRON.name')).toBe('Crystal Khyron');
    expect(t('tag.RESONANCE.label')).toBe('Resonance');
    for (const description of [
      t('unit.CRYSTAL_KHYRON.desc', def.textParams),
      t('tag.RESONANCE.desc', TAG_INFO[UnitTag.RESONANCE].textParams),
    ]) {
      expect(description).toContain(`${ABILITIES.RESONANCE_HEAL_AMOUNT} HP`);
      expect(description).toContain(`level ${CRYSTAL_KHYRON.MAX_LEVEL}`);
      expect(description).not.toContain('\u2014');
    }
    const crystalCost = def.cost.crystals!;
    expect(t('tech.CRYSTAL_KHYRON.desc', { crystalCost })).toContain(`${crystalCost} Arcane Crystals`);
  });
});

describe('Crystal Khyron recruitment', () => {
  it('Crystal Chamber recruits Mage and Khyron; others do not', () => {
    expect(getRecruitableUnitTypes(BuildingType.CRYSTAL_CHAMBER)).toEqual([UnitType.MAGE, UnitType.CRYSTAL_KHYRON]);
    expect(getRecruitableUnitTypes(BuildingType.CRYSTAL_CAVE)).not.toContain(UnitType.CRYSTAL_KHYRON);
    expect(getRecruitableUnitTypes(BuildingType.BARRACKS)).not.toContain(UnitType.CRYSTAL_KHYRON);
  });

  it('chamber badge requires an unlocked recruit', () => {
    const c = chamber(2, 2);
    expect(canBuildingEverRecruit({ unlockedUnits: [] }, c)).toBe(false);
    expect(canBuildingEverRecruit({ unlockedUnits: [UnitType.CRYSTAL_KHYRON] }, c)).toBe(true);
  });

  it('recruits during resonance, deducting configured crystals and no iron/wood', () => {
    const c = chamber(2, 2);
    const state = makeState([], [c]);
    state.resources = { iron: 7, wood: 9 };
    const initialCrystals = state.arcaneCrystals;
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    const units = Object.values(state.units);
    expect(units).toHaveLength(1);
    expect(units[0].type).toBe(UnitType.CRYSTAL_KHYRON);
    expect(state.arcaneCrystals).toBe(initialCrystals - UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].cost.crystals!);
    expect(state.resources).toEqual({ iron: 7, wood: 9 });
    expect(units[0].level).toBe(1);
    expect(units[0].xp).toBe(0);
    expect(units[0].tags).toContain(UnitTag.MECH);
    expect(units[0].roostBuildingId).toBeUndefined();
    // Normal recruited-unit exhaustion
    expect(units[0].hasMovedThisTurn).toBe(true);
    expect(units[0].hasAttackedThisTurn).toBe(true);
    // Recruited during active resonance: has RESONANCE but inactive (missed the trigger); resonance not shortened
    expect(units[0].tags).toContain(UnitTag.RESONANCE);
    expect(units[0].resonanceActive).toBe(false);
    expect(c.resonanceTurnsRemaining).toBe(3);
  });

  it('is not recruitable when the chamber is not resonating', () => {
    const c = chamber(2, 2, 0);
    const state = makeState([], [c]);
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(0);
    expect(state.arcaneCrystals).toBe(10);
  });

  it('requires the configured crystal cost', () => {
    const c = chamber(2, 2);
    const state = makeState([], [c]);
    const insufficientCrystals = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].cost.crystals! - 1;
    state.arcaneCrystals = insufficientCrystals;
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(0);
    expect(state.arcaneCrystals).toBe(insufficientCrystals);
  });

  it('is rejected from a Crystal Cave', () => {
    const cave = makeBuilding(BuildingType.CRYSTAL_CAVE, { x: 2, y: 2 }, { resonanceTurnsRemaining: 3 });
    const state = makeState([], [cave]);
    recruitUnit(state, cave.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(0);
  });

  it('shares the Chamber recruitment limit with Mage', () => {
    const c = chamber(2, 2);
    const state = makeState([makeUnit(UnitType.MAGE, { x: 0, y: 0 })], [c]);
    expect(Object.values(state.units)).toHaveLength(1);
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(1);
    expect(computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER)).toEqual({
      current: 1,
      limit: CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT,
    });
  });

  it('counts a Khyron toward the shared Mage pool and untrains surplus recruits', () => {
    const c = chamber(2, 2);
    const mage = makeUnit(UnitType.MAGE, { x: 0, y: 0 });
    const k = khyron(1, 0, []);
    const state = makeState([mage, k], [c]);
    expect(computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER)).toEqual({
      current: 2,
      limit: CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT,
    });
    expect(computeUntrainedUnitIds(state)).toEqual(new Set([mage.id, k.id]));
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(2);
  });

  it('scales the shared limit with the number of chambers', () => {
    const c1 = chamber(2, 2);
    const c2 = chamber(8, 2);
    const state = makeState([makeUnit(UnitType.MAGE, { x: 0, y: 0 })], [c1, c2]);
    recruitUnit(state, c1.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(2);
    c1.lastRecruitmentTurn = 0;
    recruitUnit(state, c1.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(2);
    expect(computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CHAMBER).limit).toBe(
      2 * CRYSTAL_CHAMBER_CONFIG.CHAMBER_UNIT_LIMIT,
    );
  });

  it('keeps the one-recruit-per-building-per-turn rule', () => {
    const c = chamber(2, 2);
    c.lastRecruitmentTurn = 5;
    const state = makeState([], [c]);
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(0);
  });

  it('Crystal Drake still pays its configured crystals and binds to its cave', () => {
    const cave = makeBuilding(BuildingType.CRYSTAL_CAVE, { x: 2, y: 2 }, { resonanceTurnsRemaining: 3 });
    const state = makeState([], [cave]);
    recruitUnit(state, cave.id, UnitType.CRYSTAL_DRAKE);
    const drake = Object.values(state.units)[0];
    expect(drake.type).toBe(UnitType.CRYSTAL_DRAKE);
    expect(drake.roostBuildingId).toBe(cave.id);
    expect(state.arcaneCrystals).toBe(10 - (UNIT_DEFINITIONS[UnitType.CRYSTAL_DRAKE].cost.crystals ?? 0));
  });
});

describe('Crystal Khyron MECH behavior', () => {
  it('cannot receive regular healing or leave a gravestone before or after confirmation', () => {
    const k = khyron();
    const healer = makeUnit(UnitType.SPEARMAN, { x: 3, y: 4 }, Faction.PLAYER, [UnitTag.PATCHUP]);
    const state = makeState([k, healer]);
    for (const targetLevel of [2, 3]) {
      k.stats.currentHp = 10;
      expect(canUnitHeal(k)).toBe(false);
      expect(getHealTargets(state, healer.id)).not.toContain(k.id);
      expect(explainInvalidHealTarget(state, healer.id, k.position)?.key).toBe('reason.heal.mech');
      expect(canUnitTrade(k)).toBe(false);
      expect(shouldLeaveGravestone(k, { defaultOn: true })).toBe(false);
      k.earnedAssimilationTags = [];
      applyLevelUps(state, k.id, targetLevel, true);
      expect(k.tags).toContain(UnitTag.MECH);
    }
    k.stats.currentHp = 10;
    expect(getHealTargets(state, healer.id)).not.toContain(k.id);
    expect(shouldLeaveGravestone(k, { defaultOn: true })).toBe(false);
  });

  it('returns the specific Brandmark Heal refusal for a Mech target', () => {
    const k = khyron(4, 4, []);
    const mage = makeUnit(UnitType.MAGE, { x: 3, y: 4 });
    const state = makeState([k, mage]);
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.BRANDMARK_HEAL, k.position)?.key)
      .toBe('reason.spell.brandmarkMech');
  });

  it('remains population-free and excludes MECH from Gravestone creation rules', () => {
    const k = khyron();
    const state = makeState([k]);
    expect(k.tags).toContain(UnitTag.MECH);
    expect(computePopulationUsage(state)).toEqual({ farmersUsed: 0, noblesUsed: 0 });
    expect(shouldLeaveGravestone(k, { defaultOn: true })).toBe(false);
  });

  it('does not leave a Gravestone when a Mech dies in combat', () => {
    const k = khyron();
    k.stats.currentHp = 1;
    const enemy = makeUnit(UnitType.REAPER, { x: 5, y: 4 }, Faction.ENEMY);
    enemy.stats.attack = 100;
    const state = makeState([k, enemy]);
    resolveAttack(state, enemy.id, k.id, true);
    expect(state.units[k.id]).toBeUndefined();
    expect(Object.values(state.buildings).some((building) => building.type === BuildingType.GRAVESTONE)).toBe(false);
  });

  it('does not deal summoned bonus damage against IRONBLOOD', () => {
    const k = khyron(4, 4, []);
    const enemy = makeUnit(UnitType.SKELETON, { x: 5, y: 4 }, Faction.ENEMY, [UnitTag.IRONBLOOD]);
    const expectedDamage = calculateCombat(k, enemy).defenderHpLost;
    const initialHp = enemy.stats.currentHp;
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    expect(state.units[enemy.id].stats.currentHp).toBe(initialHp - expectedDamage);
  });

  it('does not receive Grimbeak bonus damage as a summoned defender', () => {
    const k = khyron(4, 4, []);
    const grimbeak = makeUnit(UnitType.GRIMBEAK, { x: 5, y: 4 }, Faction.ENEMY);
    grimbeak.tags = grimbeak.tags.filter((tag) => tag !== UnitTag.RAGE);
    const expectedDamage = calculateCombat(grimbeak, k).defenderHpLost;
    const initialHp = k.stats.currentHp;
    const state = makeState([k, grimbeak]);
    resolveAttack(state, grimbeak.id, k.id, true);
    expect(state.units[k.id].stats.currentHp).toBe(initialHp - expectedDamage);
  });
});

describe('Crystal Khyron XP and levels', () => {
  it('does not receive Hellbinder tags, but keeps assimilated tags when Hellbinder ends', () => {
    const k = khyron();
    const other = makeUnit(UnitType.SKELETON, { x: 3, y: 4 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const state = makeState([k, other]);
    const hellbinder = state.specialists.spec_13;
    state.globalSpecialistStorage = [hellbinder.id];
    applyEffectsForSpecialist(state, hellbinder);
    expect(k.tags).not.toContain(UnitTag.CLEAVE);
    expect(k.tags).not.toContain(UnitTag.RAGE);
    k.earnedAssimilationTags = [UnitTag.CLEAVE, UnitTag.RAGE, UnitTag.CLEAVE];
    applyLevelUps(state, k.id, 2, true);
    expect(k.assimilatedTags).toEqual([UnitTag.CLEAVE, UnitTag.RAGE]);
    expect(k.earnedAssimilationTags).toBeUndefined();
    k.earnedAssimilationTags = [UnitTag.RAGE];
    applyLevelUps(state, k.id, 3, true);
    expect(k.assimilatedTags).toEqual([UnitTag.CLEAVE, UnitTag.RAGE]);
    state.globalSpecialistStorage = [];
    revokeEffectsForSpecialist(state, hellbinder);
    expect(k.tags).toEqual(expect.arrayContaining([UnitTag.MECH, UnitTag.CLEAVE, UnitTag.RAGE]));
    expect(k.tags.filter((tag) => tag === UnitTag.CLEAVE)).toHaveLength(1);
    expect(k.tags.filter((tag) => tag === UnitTag.RAGE)).toHaveLength(1);
    expect(other.tags).not.toContain(UnitTag.CLEAVE);
    expect(other.tags).not.toContain(UnitTag.RAGE);
  });

  it('never gains XP and cannot normally level up', () => {
    const k = khyron(4, 4, []);
    const state = makeState([k]);
    grantXp(state, k.id, XP.KILL_UNIT, true);
    grantXp(state, k.id, 9999, false);
    expect(state.units[k.id].xp).toBe(0);
    expect(canGrantXp(UnitType.CRYSTAL_KHYRON, 0)).toBe(false);
    const hp = state.units[k.id].stats.maxHp;
    applyLevelUps(state, k.id, 3);
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].stats.maxHp).toBe(hp);
  });

  it('does not gain XP from kills', () => {
    const k = khyron(4, 4, []);
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    expect(state.units[k.id].xp).toBe(0);
  });

  it('ignores banked XP for both non-XP progression types', () => {
    expect(computeLevelFromXp(UnitType.CRYSTAL_KHYRON, 9999)).toBe(1);
    expect(computeLevelFromXp(UnitType.GHOUL, 9999)).toBe(1);
    const k = khyron();
    k.xp = 9999;
    expect(getUnitTargetLevel(k)).toBe(1);
  });

  it('allows only one earned increment within the cap and filters the snapshot on confirmation', () => {
    const k = khyron();
    k.stats.currentHp = 10;
    k.earnedAssimilationTags = [UnitTag.CLEAVE, UnitTag.READY, UnitTag.LAVA, UnitTag.MECH];
    const state = makeState([k]);
    applyLevelUps(state, k.id, 3, true);
    expect(k.level).toBe(1);
    applyLevelUps(state, k.id, 2, true);
    expect(k.level).toBe(2);
    expect(k.tags).toEqual([UnitTag.MECH, UnitTag.RESONANCE, UnitTag.CLEAVE]);
    expect(k.stats.currentHp).toBe(k.stats.maxHp);
    expect(k.stats.attack).toBe(UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].attack);
    expect(k.stats.defense).toBe(UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].defense);
    applyLevelUps(state, k.id, 3, true);
    expect(k.level).toBe(2);
    k.earnedAssimilationTags = [];
    applyLevelUps(state, k.id, 3, true);
    expect(k.stats.maxHp).toBe(
      UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].maxHp
      + LEVEL_UP_VALUES.HP_BOOST_DEFAULT + LEVEL_UP_VALUES.HP_BOOST_DEFAULT2,
    );
    k.earnedAssimilationTags = [UnitTag.BLOCK];
    applyLevelUps(state, k.id, 4, true);
    expect(k.level).toBe(CRYSTAL_KHYRON.MAX_LEVEL);
    expect(getUnitTargetLevel(k)).toBe(CRYSTAL_KHYRON.MAX_LEVEL);
    expect(k.tags).not.toContain(UnitTag.BLOCK);
  });
});

describe('Crystal Khyron manual level-up store and UI', () => {
  it('uses shared readiness in the HUD button and existing map indicator', () => {
    expect(HUD_SOURCE).toContain('const targetLevel = getUnitTargetLevel(unit)');
    expect(HUD_SOURCE).toContain('const canLevelUp = isPlayer && targetLevel > unit.level');
    expect(HUD_SOURCE).toContain('onClick={() => levelUpUnit(unit.id)}');
    expect(GRID_SOURCE).toContain('if (getUnitTargetLevel(unit) > unit.level)');
  });

  it('confirms earned readiness once and emits effects only after committed HP and tags', () => {
    vi.useFakeTimers();
    const original = useGameStore.getState();
    const k = khyron();
    k.earnedAssimilationTags = [];
    k.stats.currentHp = 10;
    k.pendingAssimilationTags = [UnitTag.BLOCK];
    const observed: Unit[] = [];
    const animation = vi.spyOn(useCombatAnimationStore.getState(), 'setUnitAnimation')
      .mockImplementation(() => { observed.push(useGameStore.getState().units[k.id]); });
    const floater = vi.spyOn(useFloaterStore.getState(), 'addFloater').mockImplementation(() => {});
    try {
      useGameStore.setState({ units: { [k.id]: k } });
      useGameStore.getState().levelUpUnit(k.id);
      const updated = useGameStore.getState().units[k.id];
      expect(updated.level).toBe(2);
      expect(updated.stats.currentHp).toBe(updated.stats.maxHp);
      expect(updated.earnedAssimilationTags).toBeUndefined();
      expect(updated.pendingAssimilationTags).toBeUndefined();
      expect(updated.tags).toContain(UnitTag.MECH);
      expect(observed).toEqual([updated]);
      expect(floater).toHaveBeenCalledTimes(2);
      useGameStore.getState().levelUpUnit(k.id);
      expect(useGameStore.getState().units[k.id].level).toBe(2);
      expect(floater).toHaveBeenCalledTimes(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      animation.mockRestore();
      floater.mockRestore();
      useGameStore.setState(original);
    }
  });

  it('preserves ordinary multi-level XP progression and bloodlust through the store action', () => {
    vi.useFakeTimers();
    const original = useGameStore.getState();
    const unit = makeUnit(UnitType.SPEARMAN, { x: 4, y: 4 });
    unit.xp = LEVEL_UP_VALUES.XP_TO_LEVEL_3;
    unit.stats.currentHp = 10;
    unit.bloodlustAttackAvailable = true;
    unit.hasAttackedThisTurn = true;
    const animation = vi.spyOn(useCombatAnimationStore.getState(), 'setUnitAnimation').mockImplementation(() => {});
    const floater = vi.spyOn(useFloaterStore.getState(), 'addFloater').mockImplementation(() => {});
    try {
      useGameStore.setState({ units: { [unit.id]: unit } });
      useGameStore.getState().levelUpUnit(unit.id);
      const updated = useGameStore.getState().units[unit.id];
      expect(updated.level).toBe(3);
      expect(updated.stats.currentHp).toBe(updated.stats.maxHp);
      expect(updated.bloodlustAttackAvailable).toBe(true);
      expect(updated.hasAttackedThisTurn).toBe(true);
      expect(floater).toHaveBeenCalledTimes(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      animation.mockRestore();
      floater.mockRestore();
      useGameStore.setState(original);
    }
  });
});

describe('Crystal Khyron Resonance lifecycle', () => {
  it('grants RESONANCE to Khyrons of every level (including Lv3) but not other units', () => {
    const a = khyron(1, 1, [], 1);
    const b = khyron(2, 1, [], 2);
    const c = khyron(3, 1, [], 3);
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 1 });
    const state = makeState([a, b, c, mage]);
    grantKhyronResonance(state);
    expect(state.units[a.id].tags).toContain(UnitTag.RESONANCE);
    expect(state.units[b.id].tags).toContain(UnitTag.RESONANCE);
    expect(state.units[c.id].tags).toContain(UnitTag.RESONANCE);
    expect(state.units[mage.id].tags).not.toContain(UnitTag.RESONANCE);
  });

  it('removes RESONANCE without transforming when the window ends, and can be granted again', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE]);
    const ch = chamber(2, 2, 1);
    const state = makeState([k], [ch]);
    collectResources(state);
    expect(ch.resonanceTurnsRemaining).toBe(0);
    expect(state.units[k.id].resonanceActive).toBe(false);
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].tags).toEqual([UnitTag.MECH, UnitTag.RESONANCE]);
    ch.resonanceTurnsRemaining = CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION;
    grantKhyronResonance(state);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
  });

  it('expiry clears any stale pending assimilation', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE]);
    k.pendingAssimilationTags = [UnitTag.CLEAVE];
    k.pendingAssimilationAttackRange = 5;
    const state = makeState([k], [chamber(2, 2, 1)]);
    collectResources(state);
    expect(state.units[k.id].pendingAssimilationTags).toBeUndefined();
    expect(state.units[k.id].pendingAssimilationAttackRange).toBeUndefined();
    expect(state.units[k.id].tags).toEqual([UnitTag.MECH, UnitTag.RESONANCE]);
  });

  it('keeps RESONANCE while another chamber still resonates', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE]);
    const state = makeState([k], [chamber(2, 2, 1), chamber(8, 2, 3)]);
    collectResources(state);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
  });
});

describe('Resonance healing', () => {
  it('emits actual positive healing only and snapshots event positions', () => {
    const injured = khyron(4, 4);
    injured.stats.currentHp -= 5;
    const full = khyron(5, 4);
    const inactive = khyron(6, 4);
    inactive.resonanceActive = false;
    inactive.stats.currentHp = 1;
    const enemy = khyron(1, 4);
    enemy.faction = Faction.ENEMY;
    enemy.stats.currentHp = 1;
    const untagged = khyron(2, 4, []);
    untagged.resonanceActive = true;
    untagged.stats.currentHp = 1;
    const mage = makeUnit(UnitType.MAGE, { x: 3, y: 4 }, Faction.PLAYER, [UnitTag.RESONANCE]);
    mage.resonanceActive = true;
    mage.stats.currentHp = 1;
    const state = makeState([injured, full, inactive, enemy, untagged, mage]);
    const events: GameEvent[] = [];
    healResonatingKhyrons(state, events);
    expect(events).toEqual([{
      type: 'UNIT_HEAL', unitId: injured.id, position: { x: 4, y: 4 }, amount: 5,
    }]);
    expect(injured.stats.currentHp).toBe(injured.stats.maxHp);
    for (const unit of [inactive, enemy, untagged, mage]) {
      expect(unit.stats.currentHp).toBe(1);
    }
    injured.position.x += 1;
    expect(events[0]).toMatchObject({ position: { x: 4, y: 4 } });
  });

  it('heals 20 HP at the start of the turn while resonating, capped at max HP', () => {
    const a = khyron(4, 4, [UnitTag.RESONANCE]);
    a.stats.currentHp = 50;
    const b = khyron(5, 4, [UnitTag.RESONANCE], 3);
    b.stats.currentHp = 95;
    const c = khyron(6, 4, []);
    c.stats.currentHp = 50;
    const state = makeState([a, b, c], [chamber(2, 2, 3)]);
    collectResources(state);
    expect(state.units[a.id].stats.currentHp).toBe(50 + ABILITIES.RESONANCE_HEAL_AMOUNT);
    expect(state.units[b.id].stats.currentHp).toBe(100);
    expect(state.units[c.id].stats.currentHp).toBe(50);
  });

  it('Lv3 Khyron keeps RESONANCE and does not level past 3', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE], 3);
    const state = makeState([k]);
    applyPendingAssimilations(state);
    expect(state.units[k.id].level).toBe(3);
  });
});

describe('Khyron Resonance countdown', () => {
  it('uses the highest player Chamber countdown, excluding caves and enemy Chambers', () => {
    const short = chamber(1, 1, 1);
    const long = chamber(2, 1, 3);
    const enemy = chamber(3, 1, 8);
    enemy.faction = Faction.ENEMY;
    const cave = makeBuilding(BuildingType.CRYSTAL_CAVE, { x: 4, y: 1 }, { resonanceTurnsRemaining: 9 });
    const state = makeState([], [short, long, enemy, cave]);
    expect(getKhyronResonanceTurnsRemaining(state)).toBe(3);
    long.resonanceTurnsRemaining = 0;
    expect(getKhyronResonanceTurnsRemaining(state)).toBe(1);
    short.resonanceTurnsRemaining = 0;
    expect(getKhyronResonanceTurnsRemaining(state)).toBe(0);
    expect(getKhyronResonanceTurnsRemaining(makeState())).toBe(0);
  });
});

describe('Resonant building assimilation', () => {
  const enemyBuilding = (type = BuildingType.BARRACKS, tags = [UnitTag.BLOCK, UnitTag.READY]) =>
    makeBuilding(type, { x: 5, y: 4 }, {
      faction: Faction.ENEMY, hp: 1, tags,
      combatStats: { attack: 1, defense: 0, attackRange: 4 },
    });

  it.each([BuildingType.BARRACKS, BuildingType.WATCHTOWER])(
    'banks filtered %s tags and range only on manual confirmation',
    (type) => {
      const k = khyron();
      const target = enemyBuilding(type, [UnitTag.RANGED, UnitTag.BLOCK, UnitTag.READY]);
      const state = makeState([k], [target]);
      const initialRange = k.stats.attackRange;
      resolveAttackOnBuilding(state, k.id, target.id, true);
      if (type === BuildingType.WATCHTOWER) {
        expect(target.faction).toBeNull();
        expect(target.hp).toBe(target.maxHp);
      } else {
        expect(state.buildings[target.id]).toBeUndefined();
      }
      expect(k.earnedAssimilationLevels).toBe(1);
      expect(k.earnedAssimilationTags).toEqual([UnitTag.BLOCK, UnitTag.RANGED]);
      expect(k.earnedAssimilationAttackRange).toBe(4);
      expect(k.pendingAssimilationTags).toBeUndefined();
      expect(k.resonanceActive).toBe(false);
      expect(k.level).toBe(1);
      expect(k.tags).not.toContain(UnitTag.RANGED);
      expect(k.stats.attackRange).toBe(initialRange);
      applyLevelUps(state, k.id, getUnitTargetLevel(k), true);
      expect(k.tags).toContain(UnitTag.RANGED);
      expect(k.tags).toContain(UnitTag.BLOCK);
      expect(k.tags).not.toContain(UnitTag.READY);
      expect(k.stats.attackRange).toBe(4);
    },
  );

  it.each([BuildingType.BARRACKS, BuildingType.WATCHTOWER])(
    'keeps the defender kill as the first credited source when conquering %s',
    (type) => {
      const k = khyron();
      const defender = weakEnemy(UnitType.SKELETON, 5, 4, [UnitTag.CLEAVE]);
      const target = enemyBuilding(type, [UnitTag.RANGED, UnitTag.BLOCK]);
      const state = makeState([k, defender], [target]);
      resolveAttack(state, k.id, defender.id, true);
      expect(state.units[defender.id]).toBeUndefined();
      expect(k.position).toEqual(target.position);
      if (type === BuildingType.WATCHTOWER) expect(target.faction).toBeNull();
      else expect(state.buildings[target.id]).toBeUndefined();
      expect(k.earnedAssimilationLevels).toBe(1);
      expect(k.earnedAssimilationTags).toEqual([UnitTag.CLEAVE]);
      expect(k.earnedAssimilationAttackRange).toBeUndefined();
    },
  );

  it('keeps a tagless defender snapshot instead of inheriting the conquered building tags', () => {
    const k = khyron();
    const defender = weakEnemy(UnitType.SKELETON, 5, 4);
    const target = enemyBuilding();
    const state = makeState([k, defender], [target]);
    resolveAttack(state, k.id, defender.id, true);
    expect(state.buildings[target.id]).toBeUndefined();
    expect(k.earnedAssimilationLevels).toBe(1);
    expect(k.earnedAssimilationTags).toEqual([]);
  });

  it('shares a single Resonance slot between buildings and units', () => {
    const k = khyron();
    const target = enemyBuilding();
    const defender = weakEnemy(UnitType.REAPER, 6, 4);
    const state = makeState([k, defender], [target]);
    resolveAttackOnBuilding(state, k.id, target.id, true);
    resolveAttack(state, k.id, defender.id, true);
    expect(k.earnedAssimilationLevels).toBe(1);
    expect(k.earnedAssimilationTags).toEqual([UnitTag.BLOCK]);
    grantKhyronResonance(state);
    const second = enemyBuilding(BuildingType.WATCHTOWER, [UnitTag.RANGED]);
    state.buildings[second.id] = second;
    state.grid[second.position.y][second.position.x].buildingId = second.id;
    resolveAttackOnBuilding(state, k.id, second.id, true);
    expect(k.earnedAssimilationLevels).toBe(CRYSTAL_KHYRON.MAX_LEVEL - k.level);
    grantKhyronResonance(state);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.CLEAVE], 1);
    applyPendingAssimilations(state);
    expect(k.earnedAssimilationLevels).toBe(CRYSTAL_KHYRON.MAX_LEVEL - k.level);
    expect(k.earnedAssimilationTags).not.toContain(UnitTag.CLEAVE);
  });

  it('keeps the building source ahead of secondary unit kills in the same action', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE, UnitTag.CLEAVE]);
    const target = enemyBuilding();
    const side = weakEnemy(UnitType.REAPER, 5, 3);
    const state = makeState([k, side], [target]);
    resolveAttackOnBuilding(state, k.id, target.id, true);
    expect(state.buildings[target.id]).toBeUndefined();
    expect(state.units[side.id]).toBeUndefined();
    expect(k.earnedAssimilationLevels).toBe(1);
    expect(k.earnedAssimilationTags).toEqual([UnitTag.BLOCK]);
  });

  it('takes an immutable building snapshot and accepts only its first source', () => {
    const k = khyron();
    const target = enemyBuilding(BuildingType.WATCHTOWER, [UnitTag.RANGED, UnitTag.BLOCK]);
    const state = makeState([k], [target]);
    const source = snapshotKhyronBuildingSource(target);
    target.faction = null;
    target.tags.length = 0;
    target.combatStats!.attackRange = 1;
    recordKhyronAssimilationSource(state, k.id, source);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.CLEAVE], 1);
    applyPendingAssimilations(state);
    expect(k.earnedAssimilationTags).toEqual([UnitTag.BLOCK, UnitTag.RANGED]);
    expect(k.earnedAssimilationAttackRange).toBe(4);
  });

  it.each(['inactive', 'untagged', 'enemy', 'max-level', 'banked-cap', 'non-khyron'] as const)(
    'does not credit building destruction for an ineligible %s attacker',
    (condition) => {
      const k = khyron();
      if (condition === 'inactive') k.resonanceActive = false;
      if (condition === 'untagged') k.tags = [UnitTag.MECH];
      if (condition === 'enemy') k.faction = Faction.ENEMY;
      if (condition === 'max-level') k.level = CRYSTAL_KHYRON.MAX_LEVEL;
      if (condition === 'banked-cap') k.earnedAssimilationLevels = CRYSTAL_KHYRON.MAX_LEVEL - k.level;
      if (condition === 'non-khyron') k.type = UnitType.SPEARMAN;
      const target = enemyBuilding();
      const state = makeState([k], [target]);
      const banked = k.earnedAssimilationLevels;
      resolveAttackOnBuilding(state, k.id, target.id, true);
      expect(k.earnedAssimilationLevels).toBe(banked);
      expect(k.earnedAssimilationTags).toBeUndefined();
      expect(k.pendingAssimilationTags).toBeUndefined();
    },
  );

  it.each([Faction.PLAYER, null])('does not credit a %s building', (faction) => {
    const k = khyron();
    const target = enemyBuilding(BuildingType.WATCHTOWER);
    target.faction = faction;
    const state = makeState([k], [target]);
    resolveAttackOnBuilding(state, k.id, target.id, true);
    expect(k.earnedAssimilationLevels).toBeUndefined();
    expect(k.resonanceActive).toBe(true);
  });

  it('does not credit an enemy building that survives the attack', () => {
    const k = khyron();
    const target = enemyBuilding();
    target.hp = target.maxHp;
    const state = makeState([k], [target]);
    resolveAttackOnBuilding(state, k.id, target.id, true);
    expect(state.buildings[target.id].hp).toBeGreaterThan(0);
    expect(k.earnedAssimilationLevels).toBeUndefined();
    expect(k.resonanceActive).toBe(true);
  });

  it.each([BuildingType.BARRACKS, BuildingType.WATCHTOWER])(
    'does not credit capture even when capturing %s destroys it',
    (type) => {
      const k = khyron(5, 4, [UnitTag.RESONANCE, UnitTag.BUILDANDCAPTURE]);
      const target = enemyBuilding(type);
      const state = makeState([k], [target]);
      initiateCapture(state, k.id, target.id, true);
      if (type === BuildingType.WATCHTOWER) expect(target.faction).toBe(Faction.PLAYER);
      else expect(state.buildings[target.id]).toBeUndefined();
      expect(k.earnedAssimilationLevels).toBeUndefined();
      expect(k.earnedAssimilationTags).toBeUndefined();
      expect(k.resonanceActive).toBe(true);
    },
  );
});

describe('Resonant Assimilation', () => {
  it('keeps the first kill snapshot per action and banks once on each Resonance', () => {
    const k = khyron();
    const state = makeState([k]);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.CLEAVE], 1);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.BLOCK], 1);
    expect(k.pendingAssimilationTags).toEqual([UnitTag.CLEAVE]);
    expect(k.earnedAssimilationTags).toBeUndefined();
    expect(k.resonanceActive).toBe(true);
    applyPendingAssimilations(state);
    grantKhyronResonance(state);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.BLOCK], 1);
    applyPendingAssimilations(state);
    expect(k.earnedAssimilationTags).toEqual([UnitTag.CLEAVE, UnitTag.BLOCK]);
    expect(k.pendingAssimilationTags).toBeUndefined();
    expect(k.level).toBe(1);
    expect(k.tags).not.toContain(UnitTag.BLOCK);
    expect(k.earnedAssimilationLevels).toBe(2);
  });

  it('merges banked tags and uses the maximum Ranged victim range across two Resonances', () => {
    const k = khyron();
    const state = makeState([k]);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.RANGED, UnitTag.CLEAVE], 4);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.BLOCK], 1);
    applyPendingAssimilations(state);
    expect(k.earnedAssimilationLevels).toBe(1);
    expect(k.earnedAssimilationAttackRange).toBe(4);
    grantKhyronResonance(state);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.RANGED, UnitTag.BLOCK], 2);
    applyPendingAssimilations(state);
    expect(k.earnedAssimilationLevels).toBe(2);
    expect(k.earnedAssimilationTags).toEqual([UnitTag.CLEAVE, UnitTag.BLOCK, UnitTag.RANGED]);
    expect(k.earnedAssimilationAttackRange).toBe(4);
    expect(getUnitTargetLevel(k)).toBe(3);
    applyLevelUps(state, k.id, getUnitTargetLevel(k), true);
    expect(k.level).toBe(3);
    expect(k.tags).toEqual(expect.arrayContaining([UnitTag.CLEAVE, UnitTag.BLOCK, UnitTag.RANGED]));
    expect(k.stats.attackRange).toBe(4);
    expect(k.stats.currentHp).toBe(k.stats.maxHp);
    expect(k.stats.maxHp).toBe(
      UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].maxHp
      + LEVEL_UP_VALUES.HP_BOOST_DEFAULT + LEVEL_UP_VALUES.HP_BOOST_DEFAULT2,
    );
  });

  it('raises attack range again when a later Ranged victim has longer reach', () => {
    const k = khyron();
    const state = makeState([k]);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.RANGED], 2);
    applyPendingAssimilations(state);
    applyLevelUps(state, k.id, 2, true);
    expect(k.stats.attackRange).toBe(2);
    grantKhyronResonance(state);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.RANGED], 5);
    applyPendingAssimilations(state);
    applyLevelUps(state, k.id, 3, true);
    expect(k.stats.attackRange).toBe(5);
  });

  it('captures the Ranged victim attack range during combat before death removal', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.REAPER, 5, 4, [UnitTag.RANGED]);
    enemy.stats.attackRange = 6;
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    expect(state.units[k.id].earnedAssimilationTags).toContain(UnitTag.RANGED);
    expect(state.units[k.id].earnedAssimilationAttackRange).toBe(6);
  });

  it('does not bank beyond the remaining level capacity', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE], 2);
    k.earnedAssimilationTags = [UnitTag.CLEAVE];
    k.earnedAssimilationLevels = 1;
    const state = makeState([k]);
    expect(getKhyronBankableLevels(k)).toBe(0);
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.BLOCK], 1);
    expect(k.pendingAssimilationTags).toBeUndefined();
  });

  it('does not queue friendly kills or bank again before a new Resonance', () => {
    const k = khyron();
    const state = makeState([k]);
    recordKhyronKill(state, k.id, Faction.PLAYER, [UnitTag.CLEAVE], 1);
    expect(k.pendingAssimilationTags).toBeUndefined();
    k.earnedAssimilationTags = [];
    k.earnedAssimilationLevels = 1;
    k.resonanceActive = false;
    recordKhyronKill(state, k.id, Faction.ENEMY, [UnitTag.CLEAVE], 1);
    expect(k.pendingAssimilationTags).toBeUndefined();
    expect(k.earnedAssimilationTags).toEqual([]);
    expect(filterTransferableTags([UnitTag.SUMMONED, UnitTag.READY, UnitTag.LAVA])).toEqual([]);
  });

  it('keeps earned readiness after the resonance window expires', () => {
    const k = khyron();
    k.earnedAssimilationTags = [];
    const state = makeState([k], [chamber(2, 2, 1)]);
    collectResources(state);
    expect(k.resonanceActive).toBe(false);
    expect(k.earnedAssimilationTags).toEqual([]);
    expect(getUnitTargetLevel(k)).toBe(2);
  });
  it('Lv1 kills Reaper: earns readiness without leveling, healing or inheriting tags', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    const state = makeState([k, enemy]);
    const before = JSON.stringify(state.units[k.id].stats);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(state.units[enemy.id]).toBeUndefined();
    expect(u.level).toBe(1);
    expect(u.tags).not.toContain(UnitTag.CLEAVE);
    expect(u.tags).not.toContain(UnitTag.RAGE);
    expect(u.earnedAssimilationTags).toEqual([UnitTag.CLEAVE, UnitTag.RAGE]);
    expect(u.earnedAssimilationLevels).toBe(1);
    expect(u.tags).not.toContain(UnitTag.CORRUPT);
    expect(u.tags).not.toContain(UnitTag.LAVA);
    expect(u.resonanceActive).toBe(false);
    expect(JSON.stringify(u.stats)).toBe(before);
    expect(u.pendingAssimilationTags).toBeUndefined();
    applyLevelUps(state, k.id, getUnitTargetLevel(u), true);
    expect(u.level).toBe(2);
    expect(u.tags).toEqual(expect.arrayContaining([UnitTag.MECH, UnitTag.CLEAVE, UnitTag.RAGE]));
    expect(u.stats.maxHp).toBe(UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].maxHp + LEVEL_UP_VALUES.HP_BOOST_DEFAULT);
    expect(u.stats.currentHp).toBe(u.stats.maxHp);
    expect(u.earnedAssimilationTags).toBeUndefined();
  });

  it('later resonance: kills Bullwark to reach Lv3, keeping earlier tags', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE, UnitTag.CLEAVE, UnitTag.RAGE], 2);
    const enemy = weakEnemy(UnitType.BULLWARK, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(u.level).toBe(2);
    applyLevelUps(state, k.id, getUnitTargetLevel(u), true);
    expect(u.level).toBe(3);
    expect(u.tags).toEqual(expect.arrayContaining([UnitTag.CLEAVE, UnitTag.RAGE, UnitTag.PUNCTURE, UnitTag.BLOCK]));
    expect(u.tags).not.toContain(UnitTag.LAVA);
    expect(u.resonanceActive).toBe(false);
  });

  it('a kill with no transferable tags earns readiness and consumes Resonance', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.SKELETON, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(u.level).toBe(1);
    expect(u.earnedAssimilationTags).toEqual([]);
    expect(u.resonanceActive).toBe(false);
    expect(getUnitTargetLevel(u)).toBe(2);
    applyLevelUps(state, k.id, 2, true);
    expect(u.level).toBe(2);
    expect(u.tags).toEqual([UnitTag.MECH, UnitTag.RESONANCE]);
  });

  it('a kill with only already-owned tags still transforms without duplicating tags', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE, UnitTag.CLEAVE, UnitTag.RAGE]);
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    applyLevelUps(state, k.id, getUnitTargetLevel(u), true);
    expect(u.level).toBe(2);
    expect(u.tags.filter((x) => x === UnitTag.CLEAVE)).toHaveLength(1);
    expect(u.tags.filter((x) => x === UnitTag.RAGE)).toHaveLength(1);
    expect(u.resonanceActive).toBe(false);
  });

  it('does not transform without RESONANCE or at Lv3', () => {
    const plain = khyron(4, 4, []);
    const e1 = weakEnemy(UnitType.REAPER, 5, 4);
    const s1 = makeState([plain, e1]);
    resolveAttack(s1, plain.id, e1.id, true);
    expect(s1.units[plain.id].level).toBe(1);
    expect(s1.units[plain.id].tags).toEqual([UnitTag.MECH]);

    const max = khyron(4, 4, [UnitTag.RESONANCE], 3);
    const e2 = weakEnemy(UnitType.REAPER, 5, 4);
    const s2 = makeState([max, e2]);
    resolveAttack(s2, max.id, e2.id, true);
    expect(s2.units[max.id].level).toBe(3);
    expect(s2.units[max.id].tags).not.toContain(UnitTag.CLEAVE);
    expect(s2.units[max.id].tags).toContain(UnitTag.RESONANCE);
  });

  it('survived attacks do not transform', () => {
    const k = khyron();
    const enemy = makeUnit(UnitType.BULLWARK, { x: 5, y: 4 }, Faction.ENEMY);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    expect(state.units[enemy.id]).toBeDefined();
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
  });

  it('a counterattack kill earns readiness for the defending Khyron', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    enemy.stats.attack = 1;
    const state = makeState([k, enemy]);
    resolveAttack(state, enemy.id, k.id, true);
    expect(state.units[enemy.id]).toBeUndefined();
    expect(state.units[k.id]).toBeDefined();
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].earnedAssimilationTags).toEqual([UnitTag.CLEAVE, UnitTag.RAGE]);
  });

  it('multi-kill uses only the first credited death and the pre-transformation tags', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE, UnitTag.CLEAVE]);
    const primary = weakEnemy(UnitType.REAPER, 5, 4);
    const side = weakEnemy(UnitType.BULLWARK, 5, 3);
    const state = makeState([k, primary, side]);
    resolveAttack(state, k.id, primary.id, true);
    expect(state.units[primary.id]).toBeUndefined();
    expect(state.units[side.id]).toBeUndefined();
    const u = state.units[k.id];
    expect(u.level).toBe(1);
    expect(u.earnedAssimilationLevels).toBe(1);
    expect(u.earnedAssimilationTags).toEqual([UnitTag.CLEAVE, UnitTag.RAGE]);
    // Only the primary victim's tags (Reaper) are inherited, never the cleave victim's.
    expect(u.tags).not.toContain(UnitTag.RAGE);
    expect(u.tags).not.toContain(UnitTag.PUNCTURE);
    expect(u.tags).not.toContain(UnitTag.BLOCK);
  });

  it('newly inherited tags do not affect the attack that earned them', () => {
    const k = khyron();
    const primary = weakEnemy(UnitType.REAPER, 5, 4);
    const side = weakEnemy(UnitType.SKELETON, 5, 3);
    const state = makeState([k, primary, side]);
    resolveAttack(state, k.id, primary.id, true);
    expect(state.units[k.id].tags).not.toContain(UnitTag.CLEAVE);
    applyLevelUps(state, k.id, 2, true);
    expect(state.units[k.id].tags).toContain(UnitTag.CLEAVE);
    // Confirming Cleave does not retroactively kill the neighbour.
    expect(state.units[side.id]).toBeDefined();
  });

  it('inherited tags work through the generic tag implementation later', () => {
    const k = khyron(4, 4, [UnitTag.CLEAVE]);
    const primary = weakEnemy(UnitType.SKELETON, 5, 4);
    const side = weakEnemy(UnitType.SKELETON, 5, 3);
    const state = makeState([k, primary, side]);
    resolveAttack(state, k.id, primary.id, true);
    expect(state.units[side.id]).toBeUndefined();
  });

  it('building destruction banks readiness without immediately transforming the Khyron', () => {
    const k = khyron();
    const target = makeBuilding(BuildingType.BARRACKS, { x: 5, y: 4 }, { faction: Faction.ENEMY, hp: 1 });
    const state = makeState([k], [target]);
    resolveAttackOnBuilding(state, k.id, target.id, true);
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
    expect(state.units[k.id].earnedAssimilationLevels).toBe(1);
    expect(state.units[k.id].earnedAssimilationTags).toEqual([]);
    expect(state.units[k.id].resonanceActive).toBe(false);
  });

  it('does not alter normal combat math', () => {
    const k = khyron();
    const enemy = makeUnit(UnitType.SKELETON, { x: 5, y: 4 }, Faction.ENEMY);
    expect(calculateCombat(k, enemy).defenderHpLost).toBeGreaterThan(0);
  });
});
