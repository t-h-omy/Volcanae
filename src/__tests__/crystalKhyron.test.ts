/**
 * Crystal Khyron: tech, unit definition, Crystal Chamber recruitment,
 * XP exclusion, Resonance lifecycle and Resonant Assimilation.
 */

import { describe, it, expect } from 'vitest';
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
import { UNIT_DEFINITIONS, TECH_TREE, MAP, CRYSTAL_KHYRON, CRYSTAL_CHAMBER_CONFIG, XP } from '../gameConfig';
import {
  recruitUnit,
  getRecruitableUnitTypes,
  computeRecruitmentBuildingUsage,
  canBuildingEverRecruit,
  collectResources,
} from '../resourceSystem';
import { resolveAttack, resolveAttackOnBuilding } from '../combatSystem';
import { grantXp, canGrantXp, applyLevelUps } from '../levelSystem';
import { grantKhyronResonance } from '../khyronSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { calculateCombat } from '../combatSystem';
import { t } from '../i18n/i18n';

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
  it('costs 2 crystals and no iron/wood or population', () => {
    expect(def.cost).toEqual({ iron: 0, wood: 0, crystals: 2 });
    expect(def.populationCost).toEqual({ farmers: 0, nobles: 0 });
  });
  it('is not SUMMONED or READY and has no base tags or level-ups', () => {
    expect(def.tags).not.toContain(UnitTag.SUMMONED);
    expect(def.tags).not.toContain(UnitTag.READY);
    expect(def.tags).toEqual([]);
    expect(def.levelUp).toEqual([]);
  });
  it('whitelist is exactly the eight transferable tags', () => {
    expect([...CRYSTAL_KHYRON.TRANSFERABLE_TAGS].sort()).toEqual(
      ['ALERT', 'BLOCK', 'BURN', 'CLEAVE', 'IRONBLOOD', 'PIERCE', 'PUNCTURE', 'RAGE'],
    );
  });
  it('has English text without em dashes', () => {
    expect(t('unit.CRYSTAL_KHYRON.name')).toBe('Crystal Khyron');
    expect(t('tag.RESONANCE.label')).toBe('Resonance');
    expect(t('unit.CRYSTAL_KHYRON.desc')).toContain('Transferable tags: Cleave, Pierce, Rage, Alert, Ironblood, Block, Puncture, Burn.');
    expect(t('tag.RESONANCE.desc')).toContain('Transferable tags: Cleave, Pierce, Rage, Alert, Ironblood, Block, Puncture, Burn.');
    expect(t('tech.CRYSTAL_KHYRON.desc', { crystalCost: 2 })).toContain('2 Arcane Crystals');
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

  it('recruits during resonance, deducting exactly 2 crystals and no iron/wood', () => {
    const c = chamber(2, 2);
    const state = makeState([], [c]);
    state.resources = { iron: 7, wood: 9 };
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    const units = Object.values(state.units);
    expect(units).toHaveLength(1);
    expect(units[0].type).toBe(UnitType.CRYSTAL_KHYRON);
    expect(state.arcaneCrystals).toBe(8);
    expect(state.resources).toEqual({ iron: 7, wood: 9 });
    expect(units[0].level).toBe(1);
    expect(units[0].xp).toBe(0);
    expect(units[0].tags).not.toContain(UnitTag.SUMMONED);
    expect(units[0].roostBuildingId).toBeUndefined();
    // Normal recruited-unit exhaustion
    expect(units[0].hasMovedThisTurn).toBe(true);
    expect(units[0].hasAttackedThisTurn).toBe(true);
    // Recruited during active resonance: starts with RESONANCE; resonance not shortened
    expect(units[0].tags).toContain(UnitTag.RESONANCE);
    expect(c.resonanceTurnsRemaining).toBe(3);
  });

  it('is not recruitable when the chamber is not resonating', () => {
    const c = chamber(2, 2, 0);
    const state = makeState([], [c]);
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(0);
    expect(state.arcaneCrystals).toBe(10);
  });

  it('requires 2 crystals', () => {
    const c = chamber(2, 2);
    const state = makeState([], [c]);
    state.arcaneCrystals = 1;
    recruitUnit(state, c.id, UnitType.CRYSTAL_KHYRON);
    expect(Object.values(state.units)).toHaveLength(0);
    expect(state.arcaneCrystals).toBe(1);
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

describe('Crystal Khyron XP and levels', () => {
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
});

describe('Crystal Khyron Resonance lifecycle', () => {
  it('grants RESONANCE to Lv1 and Lv2 but not Lv3', () => {
    const a = khyron(1, 1, [], 1);
    const b = khyron(2, 1, [], 2);
    const c = khyron(3, 1, [], 3);
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 1 });
    const state = makeState([a, b, c, mage]);
    grantKhyronResonance(state);
    expect(state.units[a.id].tags).toContain(UnitTag.RESONANCE);
    expect(state.units[b.id].tags).toContain(UnitTag.RESONANCE);
    expect(state.units[c.id].tags).not.toContain(UnitTag.RESONANCE);
    expect(state.units[mage.id].tags).not.toContain(UnitTag.RESONANCE);
  });

  it('removes RESONANCE without transforming when the window ends, and can be granted again', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE]);
    const ch = chamber(2, 2, 1);
    const state = makeState([k], [ch]);
    collectResources(state);
    expect(ch.resonanceTurnsRemaining).toBe(0);
    expect(state.units[k.id].tags).not.toContain(UnitTag.RESONANCE);
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].tags).toEqual([]);
    ch.resonanceTurnsRemaining = CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION;
    grantKhyronResonance(state);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
  });

  it('expiry clears any stale pending assimilation', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE]);
    k.pendingAssimilationTags = [UnitTag.CLEAVE];
    const state = makeState([k], [chamber(2, 2, 1)]);
    collectResources(state);
    expect(state.units[k.id].pendingAssimilationTags).toBeUndefined();
    expect(state.units[k.id].tags).toEqual([]);
  });

  it('keeps RESONANCE while another chamber still resonates', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE]);
    const state = makeState([k], [chamber(2, 2, 1), chamber(8, 2, 3)]);
    collectResources(state);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
  });
});

describe('Resonant Assimilation', () => {
  it('Lv1 kills Reaper: Lv2, inherits CLEAVE and RAGE only, loses RESONANCE, stats unchanged', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    const state = makeState([k, enemy]);
    const before = JSON.stringify(state.units[k.id].stats);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(state.units[enemy.id]).toBeUndefined();
    expect(u.level).toBe(2);
    expect(u.tags).toContain(UnitTag.CLEAVE);
    expect(u.tags).toContain(UnitTag.RAGE);
    expect(u.tags).not.toContain(UnitTag.CORRUPT);
    expect(u.tags).not.toContain(UnitTag.LAVA);
    expect(u.tags).not.toContain(UnitTag.RESONANCE);
    expect(JSON.stringify(u.stats)).toBe(before);
    expect(u.pendingAssimilationTags).toBeUndefined();
  });

  it('later resonance: kills Bullwark to reach Lv3, keeping earlier tags', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE, UnitTag.CLEAVE, UnitTag.RAGE], 2);
    const enemy = weakEnemy(UnitType.BULLWARK, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(u.level).toBe(3);
    expect(u.tags).toEqual(expect.arrayContaining([UnitTag.CLEAVE, UnitTag.RAGE, UnitTag.PUNCTURE, UnitTag.BLOCK]));
    expect(u.tags).not.toContain(UnitTag.LAVA);
    expect(u.tags).not.toContain(UnitTag.RESONANCE);
  });

  it('a kill with no transferable tags still transforms and consumes Resonance', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.SKELETON, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(u.level).toBe(2);
    expect(u.tags).toEqual([]);
  });

  it('a kill with only already-owned tags still transforms without duplicating tags', () => {
    const k = khyron(4, 4, [UnitTag.RESONANCE, UnitTag.CLEAVE, UnitTag.RAGE]);
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    const state = makeState([k, enemy]);
    resolveAttack(state, k.id, enemy.id, true);
    const u = state.units[k.id];
    expect(u.level).toBe(2);
    expect(u.tags.filter((x) => x === UnitTag.CLEAVE)).toHaveLength(1);
    expect(u.tags.filter((x) => x === UnitTag.RAGE)).toHaveLength(1);
    expect(u.tags).not.toContain(UnitTag.RESONANCE);
  });

  it('does not transform without RESONANCE or at Lv3', () => {
    const plain = khyron(4, 4, []);
    const e1 = weakEnemy(UnitType.REAPER, 5, 4);
    const s1 = makeState([plain, e1]);
    resolveAttack(s1, plain.id, e1.id, true);
    expect(s1.units[plain.id].level).toBe(1);
    expect(s1.units[plain.id].tags).toEqual([]);

    const max = khyron(4, 4, [UnitTag.RESONANCE], 3);
    const e2 = weakEnemy(UnitType.REAPER, 5, 4);
    const s2 = makeState([max, e2]);
    resolveAttack(s2, max.id, e2.id, true);
    expect(s2.units[max.id].level).toBe(3);
    expect(s2.units[max.id].tags).not.toContain(UnitTag.CLEAVE);
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

  it('a counterattack kill transforms the defending Khyron', () => {
    const k = khyron();
    const enemy = weakEnemy(UnitType.REAPER, 5, 4);
    enemy.stats.attack = 1;
    const state = makeState([k, enemy]);
    resolveAttack(state, enemy.id, k.id, true);
    expect(state.units[enemy.id]).toBeUndefined();
    expect(state.units[k.id]).toBeDefined();
    expect(state.units[k.id].level).toBe(2);
    expect(state.units[k.id].tags).toEqual(expect.arrayContaining([UnitTag.CLEAVE, UnitTag.RAGE]));
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
    expect(u.level).toBe(2);
    // Only the primary victim's tags (Reaper) are inherited, never the cleave victim's.
    expect(u.tags).toContain(UnitTag.RAGE);
    expect(u.tags).not.toContain(UnitTag.PUNCTURE);
    expect(u.tags).not.toContain(UnitTag.BLOCK);
  });

  it('newly inherited tags do not affect the attack that earned them', () => {
    const k = khyron();
    const primary = weakEnemy(UnitType.REAPER, 5, 4);
    const side = weakEnemy(UnitType.SKELETON, 5, 3);
    const state = makeState([k, primary, side]);
    resolveAttack(state, k.id, primary.id, true);
    expect(state.units[k.id].tags).toContain(UnitTag.CLEAVE);
    // Cleave was inherited by this attack but did not retroactively kill the neighbour.
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

  it('building destruction does not transform the Khyron', () => {
    const k = khyron();
    const target = makeBuilding(BuildingType.BARRACKS, { x: 5, y: 4 }, { faction: Faction.ENEMY, hp: 1 });
    const state = makeState([k], [target]);
    resolveAttackOnBuilding(state, k.id, target.id, true);
    expect(state.units[k.id].level).toBe(1);
    expect(state.units[k.id].tags).toContain(UnitTag.RESONANCE);
  });

  it('does not alter normal combat math', () => {
    const k = khyron();
    const enemy = makeUnit(UnitType.SKELETON, { x: 5, y: 4 }, Faction.ENEMY);
    expect(calculateCombat(k, enemy).defenderHpLost).toBeGreaterThan(0);
  });
});
