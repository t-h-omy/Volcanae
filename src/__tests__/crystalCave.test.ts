/**
 * Tests for the Crystal Cave / Crystal Drake / FLYING tag feature.
 *
 * Coverage:
 *   - PART 1 (FLYING tag):
 *       * BFS passability — flying units traverse canyon and (unfrozen) water
 *         but NOT lava.
 *       * Slide/knockback — flying units survive canyon and water knockback
 *         but still die when slid onto lava.
 *       * No ice-slide chain when knocked onto a frozen tile (handled at the
 *         moveUnit trigger; here we verify resolveSlide does not chain on its
 *         own and that the FLYING-on-water survival path lands cleanly).
 *   - PART 2 (Crystal Drake life-binding):
 *       * cleanupRoostedUnits removes the roosted drake (player faction → bumps
 *         unitsLost stat; tile.unitId cleared) and is a no-op when no unit
 *         is roosted to the supplied id.
 *   - PART 3 (Crystal Cave recruitment plumbing):
 *       * Crystal Cave is a recruitment-building type.
 *       * It recruits CRYSTAL_DRAKE.
 *       * computeRecruitmentBuildingUsage counts drakes per cave via
 *         `roostBuildingId`.
 *   - PART 4 (Spell targeting + silent cave-monster removal):
 *       * Only free mountain tiles in range are valid targets.
 *       * Non-mountain / built / occupied / ruin tiles are rejected.
 *       * Cave construction silently removes a CAVE_MONSTER on the target.
 *   - PART 5 (Tech node):
 *       * CRYSTAL_CAVE tech node requires ARCANE_AWAKENING, unlocks the
 *         Crystal Cave spell, and unlocks the Crystal Drake unit.
 */

import { describe, it, expect } from 'vitest';
import {
  UnitType,
  BuildingType,
  Faction,
  UnitTag,
  TileType,
  TileStatus,
  DestroyBehavior,
  SpellId,
} from '../types';
import type { GameState, Unit, Building, Tile, Position } from '../types';
import type { GameEvent } from '../gameEvents';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECH_TREE, SPELL_DEFINITIONS, CRYSTAL_CAVE_CONFIG, MAP } from '../gameConfig';
import { cleanupRoostedUnits } from '../buildingRemoval';
import { getReachableTiles, resolveSlide } from '../movementSystem';
import { getValidSpellTargets, castSpell } from '../spellSystem';
import {
  isRecruitmentBuildingType,
  getRecruitableUnitTypes,
  computeRecruitmentBuildingUsage,
} from '../resourceSystem';
import { runEnemyTurn } from '../enemySystem';
import { produce } from 'immer';

// ── Tiny helpers ────────────────────────────────────────────────────────────

let _id = 0;
const nextId = (p: string) => `${p}_${++_id}`;

function makeTile(x: number, y: number, terrainType: TileType = TileType.PLAINS): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType,
  };
}

/** Build a minimal grid filled with PLAIN tiles. */
function makeGrid(w: number, h: number): Tile[][] {
  const g: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push(makeTile(x, y));
    g.push(row);
  }
  return g;
}

function makeUnit(type: UnitType, pos: Position, faction: Faction = Faction.PLAYER, extraTags: UnitTag[] = []): Unit {
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

function makeCave(pos: Position, resonance = 0): Building {
  return {
    id: nextId('cave'),
    type: BuildingType.CRYSTAL_CAVE,
    faction: Faction.PLAYER,
    position: { ...pos },
    hp: CRYSTAL_CAVE_CONFIG.MAX_HP,
    maxHp: CRYSTAL_CAVE_CONFIG.MAX_HP,
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
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: resonance,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}

function makeState(opts: {
  units?: Unit[];
  buildings?: Building[];
  grid?: Tile[][];
  activeCaveEncounters?: { mountainTileId: string; monsterId: string }[];
}): GameState {
  const units: Record<string, Unit> = {};
  for (const u of opts.units ?? []) {
    units[u.id] = u;
  }
  const buildings: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) {
    buildings[b.id] = b;
  }
  const grid = opts.grid ?? makeGrid(MAP.GRID_WIDTH, MAP.GRID_HEIGHT);
  // Sync tile.unitId/buildingId from given objects so BFS sees them.
  for (const u of Object.values(units)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of Object.values(buildings)) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }

  return {
    units,
    buildings,
    grid,
    portals: {},
    activeCaveEncounters: opts.activeCaveEncounters ?? [],
    ember: 0,
    turn: 1,
    gameStats: {
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
    },
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 99,
    techFlags: [],
    unlockedSpells: [SpellId.CRYSTAL_CAVE],
    unlockedUnits: [UnitType.MAGE, UnitType.CRYSTAL_DRAKE],
    techNodes: {},
  } as unknown as GameState;
}

// ───────────────────────────────────────────────────────────────────────────
// PART 1 — FLYING tag passability + knockback rules
// ───────────────────────────────────────────────────────────────────────────

describe('FLYING tag — passability (BFS)', () => {
  it('a flying unit may traverse CANYON and (unfrozen) WATER tiles', () => {
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 4, y: 4 });
    const state = makeState({ units: [drake] });
    // Place a canyon and a water tile within 1 step.
    state.grid[4][5].terrainType = TileType.CANYON;
    state.grid[3][4].terrainType = TileType.WATER;

    const reachable = getReachableTiles(state, drake.id);
    const reachableSet = new Set(reachable.map((p) => `${p.x},${p.y}`));
    expect(reachableSet.has('5,4')).toBe(true); // canyon
    expect(reachableSet.has('4,3')).toBe(true); // water
  });

  it('a non-flying unit is blocked by CANYON and unfrozen WATER', () => {
    const grunt = makeUnit(UnitType.SPEARMAN, { x: 4, y: 4 });
    const state = makeState({ units: [grunt] });
    state.grid[4][5].terrainType = TileType.CANYON;
    state.grid[3][4].terrainType = TileType.WATER;

    const reachable = getReachableTiles(state, grunt.id);
    const reachableSet = new Set(reachable.map((p) => `${p.x},${p.y}`));
    expect(reachableSet.has('5,4')).toBe(false);
    expect(reachableSet.has('4,3')).toBe(false);
  });

  it('LAVA is still impassable for a FLYING player unit (too hot)', () => {
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 4, y: 4 });
    const state = makeState({ units: [drake] });
    state.grid[4][5].isLava = true;

    const reachable = getReachableTiles(state, drake.id);
    const reachableSet = new Set(reachable.map((p) => `${p.x},${p.y}`));
    expect(reachableSet.has('5,4')).toBe(false);
  });
});

describe('FLYING tag — slide / knockback outcomes', () => {
  it('FLYING survives knockback onto a CANYON tile', () => {
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 4, y: 4 });
    const state = makeState({ units: [drake] });
    state.grid[4][5].terrainType = TileType.CANYON;

    const next = produce(state, (draft) => {
      resolveSlide(draft, drake.id, 1, 0);
    });
    expect(next.units[drake.id]).toBeDefined();
    expect(next.units[drake.id]!.position).toEqual({ x: 5, y: 4 });
  });

  it('FLYING survives knockback onto an unfrozen WATER tile', () => {
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 4, y: 4 });
    const state = makeState({ units: [drake] });
    state.grid[4][5].terrainType = TileType.WATER;

    const next = produce(state, (draft) => {
      resolveSlide(draft, drake.id, 1, 0);
    });
    expect(next.units[drake.id]).toBeDefined();
    expect(next.units[drake.id]!.position).toEqual({ x: 5, y: 4 });
  });

  it('FLYING still dies when slid onto LAVA', () => {
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 4, y: 4 });
    const state = makeState({ units: [drake] });
    state.grid[4][5].isLava = true;

    const next = produce(state, (draft) => {
      resolveSlide(draft, drake.id, 1, 0);
    });
    expect(next.units[drake.id]).toBeUndefined();
  });

  it('non-flying unit dies when slid onto CANYON or WATER (control)', () => {
    const grunt = makeUnit(UnitType.SPEARMAN, { x: 4, y: 4 });
    const state = makeState({ units: [grunt] });
    state.grid[4][5].terrainType = TileType.CANYON;

    const next = produce(state, (draft) => {
      resolveSlide(draft, grunt.id, 1, 0);
    });
    expect(next.units[grunt.id]).toBeUndefined();
  });

  it('resolveSlide does not chain even when landing on a FROZEN tile', () => {
    // resolveSlide is intentionally non-chaining; chain-slides are triggered
    // in moveUnit, which skips FLYING units. Verify here that even a
    // non-flying unit lands and stops on a FROZEN tile.
    const grunt = makeUnit(UnitType.SPEARMAN, { x: 4, y: 4 });
    const state = makeState({ units: [grunt] });
    state.grid[4][5].terrainType = TileType.WATER;
    state.grid[4][5].status = TileStatus.FROZEN;

    const next = produce(state, (draft) => {
      resolveSlide(draft, grunt.id, 1, 0);
    });
    expect(next.units[grunt.id]).toBeDefined();
    expect(next.units[grunt.id]!.position).toEqual({ x: 5, y: 4 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 2 — Crystal Drake life-binding via cleanupRoostedUnits
// ───────────────────────────────────────────────────────────────────────────

describe('cleanupRoostedUnits — life-bound Crystal Drake', () => {
  it('removes the drake when its roost cave is removed', () => {
    const cave = makeCave({ x: 3, y: 3 });
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 3, y: 4 });
    drake.roostBuildingId = cave.id;
    const state = makeState({ units: [drake], buildings: [cave] });

    cleanupRoostedUnits(state, cave.id);
    expect(state.units[drake.id]).toBeUndefined();
    expect(state.grid[4][3].unitId).toBeNull();
    expect(state.gameStats.unitsLost).toBe(1);
  });

  it('leaves drakes bound to OTHER caves alone', () => {
    const caveA = makeCave({ x: 1, y: 1 });
    const caveB = makeCave({ x: 5, y: 5 });
    const drakeA = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 2, y: 1 });
    drakeA.roostBuildingId = caveA.id;
    const drakeB = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 6, y: 5 });
    drakeB.roostBuildingId = caveB.id;
    const state = makeState({ units: [drakeA, drakeB], buildings: [caveA, caveB] });

    cleanupRoostedUnits(state, caveA.id);
    expect(state.units[drakeA.id]).toBeUndefined();
    expect(state.units[drakeB.id]).toBeDefined();
    expect(state.gameStats.unitsLost).toBe(1);
  });

  it('is a safe no-op when no unit is roosted to the supplied id', () => {
    const cave = makeCave({ x: 3, y: 3 });
    const state = makeState({ buildings: [cave] });
    expect(() => cleanupRoostedUnits(state, cave.id)).not.toThrow();
    expect(state.gameStats.unitsLost).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 3 — Crystal Cave recruitment plumbing
// ───────────────────────────────────────────────────────────────────────────

describe('Crystal Cave — recruitment plumbing', () => {
  it('CRYSTAL_CAVE is a recruitment-building type that recruits CRYSTAL_DRAKE', () => {
    expect(isRecruitmentBuildingType(BuildingType.CRYSTAL_CAVE)).toBe(true);
    expect(getRecruitableUnitTypes(BuildingType.CRYSTAL_CAVE)).toEqual([UnitType.CRYSTAL_DRAKE]);
  });

  it('CRYSTAL_CAVE has unitLimit = configured cap', () => {
    expect(BUILDING_DEFINITIONS.CRYSTAL_CAVE.unitLimit).toBe(CRYSTAL_CAVE_CONFIG.CAVE_UNIT_LIMIT);
  });

  it('computeRecruitmentBuildingUsage counts drakes by roostBuildingId', () => {
    const cave = makeCave({ x: 3, y: 3 }, /* resonance */ 5);
    const drake = makeUnit(UnitType.CRYSTAL_DRAKE, { x: 3, y: 4 });
    drake.roostBuildingId = cave.id;
    const state = makeState({ units: [drake], buildings: [cave] });

    const { current, limit } = computeRecruitmentBuildingUsage(state, BuildingType.CRYSTAL_CAVE);
    expect(current).toBe(1);
    expect(limit).toBe(CRYSTAL_CAVE_CONFIG.CAVE_UNIT_LIMIT);
  });

  it('Crystal Drake crystal cost is in the unit cost definition', () => {
    const cost = UNIT_DEFINITIONS.CRYSTAL_DRAKE.cost;
    expect(cost.crystals).toBeGreaterThan(0);
    expect(cost.iron).toBe(0);
    expect(cost.wood).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 4 — Crystal Cave spell targeting + silent cave-monster removal
// ───────────────────────────────────────────────────────────────────────────

describe('Crystal Cave spell — targeting', () => {
  it('only free in-range MOUNTAIN tiles are valid targets', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 4 });
    const state = makeState({ units: [mage] });
    // Sprinkle terrain near the mage:
    state.grid[4][5].terrainType = TileType.MOUNTAIN;       // valid
    state.grid[5][4].terrainType = TileType.MOUNTAIN;       // valid
    state.grid[3][4].terrainType = TileType.PLAINS;          // wrong terrain
    state.grid[4][3].terrainType = TileType.MOUNTAIN;
    state.grid[4][3].isRuin = true;                          // ruin → invalid
    // Out of range mountain
    if (state.grid[34]) {
      state.grid[34][4].terrainType = TileType.MOUNTAIN;
    }

    const targets = getValidSpellTargets(state, mage.id, SpellId.CRYSTAL_CAVE);
    const set = new Set(targets.map((p) => `${p.x},${p.y}`));
    expect(set.has('5,4')).toBe(true);
    expect(set.has('4,5')).toBe(true);
    expect(set.has('4,3')).toBe(false); // ruin
    expect(set.has('3,4')).toBe(false); // not mountain
    expect(set.has('4,34')).toBe(false); // out of range
  });

  it('excludes mountain tiles occupied by a unit or a building', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 4 });
    const other = makeUnit(UnitType.SPEARMAN, { x: 5, y: 4 });
    const state = makeState({ units: [mage, other] });
    state.grid[4][5].terrainType = TileType.MOUNTAIN;
    state.grid[5][4].terrainType = TileType.MOUNTAIN;
    // Spawn a building on (4,5)
    const fakeBuilding = makeCave({ x: 4, y: 5 });
    state.buildings[fakeBuilding.id] = fakeBuilding;
    state.grid[5][4].buildingId = fakeBuilding.id;

    const targets = getValidSpellTargets(state, mage.id, SpellId.CRYSTAL_CAVE);
    const set = new Set(targets.map((p) => `${p.x},${p.y}`));
    expect(set.has('5,4')).toBe(false); // occupied by unit
    expect(set.has('4,5')).toBe(false); // has building
  });
});

describe('Crystal Cave spell — cave-monster handling on construction', () => {
  it('clears hasCaveMonster for a dormant cave (no active encounter) when a crystal cave is built', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 4 });
    const state = makeState({ units: [mage] });
    state.grid[4][5].terrainType = TileType.MOUNTAIN;
    state.grid[4][5].hasCaveMonster = true;
    // No active encounter — the monster is dormant

    const next = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.CRYSTAL_CAVE, { x: 5, y: 4 });
    });

    // Dormant cave is sealed: hasCaveMonster cleared; cave is built
    expect(next.grid[4][5].hasCaveMonster).toBe(false);
    const placed = Object.values(next.buildings).find((b) => b.type === BuildingType.CRYSTAL_CAVE);
    expect(placed).toBeDefined();
    expect(placed!.position).toEqual({ x: 5, y: 4 });
  });

  it('preserves an active cave-monster encounter when a crystal cave is built on its mountain', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 4 });
    // The monster is out on the map (active encounter), not on the target tile
    const monster = makeUnit(UnitType.CAVE_MONSTER, { x: 7, y: 7 }, Faction.ENEMY);
    const state = makeState({
      units: [mage, monster],
      activeCaveEncounters: [{ mountainTileId: '5,4', monsterId: monster.id }] as Array<{ mountainTileId: string; monsterId: string }>,
    });
    state.grid[4][5].terrainType = TileType.MOUNTAIN;
    state.grid[4][5].hasCaveMonster = true;
    const startKills = state.gameStats.unitsKilled;

    const next = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.CRYSTAL_CAVE, { x: 5, y: 4 });
    });

    // Monster stays alive — it will return home and destroy the cave
    expect(next.units[monster.id]).toBeDefined();
    // Active encounter is preserved so the monster can still find its way home
    expect(next.activeCaveEncounters.length).toBe(1);
    expect(next.activeCaveEncounters[0].monsterId).toBe(monster.id);
    // No kill credit
    expect(next.gameStats.unitsKilled).toBe(startKills);
    // Crystal cave is still built on the mountain
    const placed = Object.values(next.buildings).find((b) => b.type === BuildingType.CRYSTAL_CAVE);
    expect(placed).toBeDefined();
    expect(placed!.position).toEqual({ x: 5, y: 4 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 5 — Tech node
// ───────────────────────────────────────────────────────────────────────────

describe('Tech tree — CRYSTAL_CAVE node', () => {
  it('exists, requires ARCANE_AWAKENING, and unlocks the Crystal Cave spell', () => {
    const node = TECH_TREE.find((n) => n.id === 'CRYSTAL_CAVE');
    expect(node).toBeDefined();
    expect(node!.requires).toContain('ARCANE_AWAKENING');
    const unlocks = node!.effects.some(
      (e) => e.type === 'UNLOCK_SPELL' && e.spellId === SpellId.CRYSTAL_CAVE,
    );
    expect(unlocks).toBe(true);
  });

  it('also unlocks the CRYSTAL_DRAKE unit', () => {
    const node = TECH_TREE.find((n) => n.id === 'CRYSTAL_CAVE');
    expect(node).toBeDefined();
    const unlocksUnit = node!.effects.some(
      (e) => e.type === 'UNLOCK_UNIT' && e.unitType === UnitType.CRYSTAL_DRAKE,
    );
    expect(unlocksUnit).toBe(true);
  });

  it('does not collide with the existing CRYSTAL_TOWER tech node', () => {
    const ids = TECH_TREE.map((n) => n.id);
    expect(ids.filter((id) => id === 'CRYSTAL_CAVE').length).toBe(1);
    expect(ids).toContain('CRYSTAL_TOWER');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPELL definition wiring
// ───────────────────────────────────────────────────────────────────────────

describe('SPELL_DEFINITIONS[CRYSTAL_CAVE]', () => {
  it('exists with a description mentioning the Crystal Cave and Crystal Drake', () => {
    const def = SPELL_DEFINITIONS[SpellId.CRYSTAL_CAVE];
    expect(def).toBeDefined();
    expect(def.description).toContain('Crystal Cave');
    expect(def.description).toContain('Crystal Drake');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 6 — Cave monster return: correct behavior with Crystal Cave present
// ───────────────────────────────────────────────────────────────────────────

/** Minimal GameState suitable for runEnemyTurn (all required fields present). */
function makeEnemyTurnState(opts: {
  units?: Unit[];
  buildings?: Building[];
  activeCaveEncounters?: { mountainTileId: string; monsterId: string }[];
}): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of opts.units ?? []) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of opts.buildings ?? []) buildingsMap[b.id] = b;
  const grid = makeGrid(MAP.GRID_WIDTH, MAP.GRID_HEIGHT);
  for (const u of Object.values(unitsMap)) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) { t.unitId = u.id; t.isRevealed = true; }
  }
  for (const b of Object.values(buildingsMap)) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }
  return {
    units: unitsMap,
    buildings: buildingsMap,
    grid,
    portals: {},
    activeCaveEncounters: opts.activeCaveEncounters ?? [],
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    turn: 1,
    phase: 'PLAYER_TURN',
    gameStats: {
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
    },
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 0,
    techFlags: [],
    techNodes: {} as GameState['techNodes'],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    specialists: {},
    globalSpecialistStorage: [],
    lavaFrontRow: 999,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    zonesUnlocked: [0],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    gameOverCause: null,
  } as unknown as GameState;
}

describe('Cave monster return — Crystal Cave interaction', () => {
  it(
    'A) monster despawns via Priority 3 under the same trigger conditions regardless of whether a Crystal Cave occupies the mountain',
    () => {
      // Place monster already on its home tile with a Crystal Cave there.
      // No player units in aggro radius → Priority 1 & 2 skip, Priority 3 fires.
      const homePos = { x: 5, y: 4 };
      const monster = makeUnit(UnitType.CAVE_MONSTER, homePos, Faction.ENEMY);
      monster.hasMovedThisTurn = false;
      monster.hasAttackedThisTurn = false;
      const cave = makeCave(homePos);
      const state = makeEnemyTurnState({
        units: [monster],
        buildings: [cave],
        activeCaveEncounters: [{ mountainTileId: '5,4', monsterId: monster.id }],
      });
      state.grid[homePos.y][homePos.x].terrainType = TileType.MOUNTAIN;

      const { finalState } = runEnemyTurn(state);

      // Monster has despawned — same as if no cave were present
      expect(finalState.units[monster.id]).toBeUndefined();
      expect(finalState.activeCaveEncounters.length).toBe(0);
      // Cave was destroyed by the return
      expect(finalState.buildings[cave.id]).toBeUndefined();
      expect(finalState.grid[homePos.y][homePos.x].buildingId).toBeNull();
    },
  );

  it(
    'B) crystal cave is destroyed by the returning monster; the bound drake dies through the building destruction chain, not directly',
    () => {
      // Drake is placed far from the monster (outside patrol radius of 3) so
      // the monster doesn't aggro on it and falls through to Priority 3.
      const homePos = { x: 5, y: 4 };
      const drakePos = { x: 5, y: 15 }; // >3 tiles away in Chebyshev distance
      const monster = makeUnit(UnitType.CAVE_MONSTER, homePos, Faction.ENEMY);
      monster.hasMovedThisTurn = false;
      monster.hasAttackedThisTurn = false;
      const cave = makeCave(homePos);
      const drake = makeUnit(UnitType.CRYSTAL_DRAKE, drakePos);
      drake.roostBuildingId = cave.id;

      const state = makeEnemyTurnState({
        units: [monster, drake],
        buildings: [cave],
        activeCaveEncounters: [{ mountainTileId: '5,4', monsterId: monster.id }],
      });
      state.grid[homePos.y][homePos.x].terrainType = TileType.MOUNTAIN;
      const startLost = state.gameStats.unitsLost;

      const { finalState } = runEnemyTurn(state);

      // Crystal Cave must be destroyed
      expect(finalState.buildings[cave.id]).toBeUndefined();
      // Drake must be gone — removed by cleanupRoostedUnits as part of cave destruction
      expect(finalState.units[drake.id]).toBeUndefined();
      // Player unit loss is counted (drake is a player faction unit)
      expect(finalState.gameStats.unitsLost).toBe(startLost + 1);
      // Monster also despawned after destroying the cave
      expect(finalState.units[monster.id]).toBeUndefined();
      // Encounter cleaned up
      expect(finalState.activeCaveEncounters.length).toBe(0);
    },
  );
});

// ───────────────────────────────────────────────────────────────────────────
// PART 7 — autocam: UNIT_DEATH events emitted on every cave-loss path
// ───────────────────────────────────────────────────────────────────────────

describe('Autocam UNIT_DEATH events — cave-loss paths', () => {
  it(
    'C) enemy unit destroys a player Crystal Cave hosting a drake → events contain UNIT_DEATH for the drake',
    () => {
      // Set up an enemy LAVA_GRUNT adjacent to a Crystal Cave.
      // Give the cave minimal combatStats so the AI targeting logic can select it
      // as an ATTACK_BUILDING target, and set hp=1 so a single attack destroys it.
      const cavePos = { x: 5, y: 4 };
      const drakePos = { x: 6, y: 4 };
      const gruntPos = { x: 4, y: 4 };

      const grunt = makeUnit(UnitType.LAVA_GRUNT, gruntPos, Faction.ENEMY);

      const cave = makeCave(cavePos);
      cave.combatStats = { attack: 0, defense: 0, attackRange: 1 };
      cave.hp = 1;
      cave.maxHp = 1;

      const drake = makeUnit(UnitType.CRYSTAL_DRAKE, drakePos);
      drake.roostBuildingId = cave.id;

      const state = makeEnemyTurnState({
        units: [grunt, drake],
        buildings: [cave],
      });

      const { events } = runEnemyTurn(state);

      // The enemy should have attacked the cave and destroyed it.
      const attackEvt = events.find(
        (e): e is Extract<GameEvent, { type: 'UNIT_ATTACK_BUILDING' }> =>
          e.type === 'UNIT_ATTACK_BUILDING' &&
          (e as Extract<GameEvent, { type: 'UNIT_ATTACK_BUILDING' }>).buildingId === cave.id,
      );
      expect(attackEvt).toBeDefined();

      // A UNIT_DEATH event for the drake must be present so the auto-cam can track it.
      const drakeDeathEvt = events.find(
        (e): e is Extract<GameEvent, { type: 'UNIT_DEATH' }> =>
          e.type === 'UNIT_DEATH' &&
          (e as Extract<GameEvent, { type: 'UNIT_DEATH' }>).unitId === drake.id,
      );
      expect(drakeDeathEvt).toBeDefined();
      expect(drakeDeathEvt!.position).toEqual(drakePos);
      expect(drakeDeathEvt!.faction).toBe(Faction.PLAYER);

      // The drake death must appear after the cave attack event in the queue.
      const attackIdx = events.indexOf(attackEvt!);
      const deathIdx = events.indexOf(drakeDeathEvt!);
      expect(deathIdx).toBeGreaterThan(attackIdx);
    },
  );

  it(
    'D) cave monster returning home over a Crystal Cave → events contain UNIT_DEATH for the drake before CAVE_MONSTER_RETREAT',
    () => {
      // Drake placed far from the monster (outside patrol radius) so the monster
      // falls through to Priority 3 (return-home / despawn).
      const homePos = { x: 5, y: 4 };
      const drakePos = { x: 5, y: 15 }; // Chebyshev distance > PATROL_RADIUS (3)

      const monster = makeUnit(UnitType.CAVE_MONSTER, homePos, Faction.ENEMY);
      monster.hasMovedThisTurn = false;
      monster.hasAttackedThisTurn = false;

      const cave = makeCave(homePos);
      const drake = makeUnit(UnitType.CRYSTAL_DRAKE, drakePos);
      drake.roostBuildingId = cave.id;

      const state = makeEnemyTurnState({
        units: [monster, drake],
        buildings: [cave],
        activeCaveEncounters: [{ mountainTileId: '5,4', monsterId: monster.id }],
      });
      state.grid[homePos.y][homePos.x].terrainType = TileType.MOUNTAIN;

      const { events } = runEnemyTurn(state);

      // A UNIT_DEATH event for the drake must be present.
      const drakeDeathEvt = events.find(
        (e): e is Extract<GameEvent, { type: 'UNIT_DEATH' }> =>
          e.type === 'UNIT_DEATH' &&
          (e as Extract<GameEvent, { type: 'UNIT_DEATH' }>).unitId === drake.id,
      );
      expect(drakeDeathEvt).toBeDefined();
      expect(drakeDeathEvt!.position).toEqual(drakePos);
      expect(drakeDeathEvt!.faction).toBe(Faction.PLAYER);

      // The CAVE_MONSTER_RETREAT event must also be present.
      const retreatEvt = events.find(
        (e): e is Extract<GameEvent, { type: 'CAVE_MONSTER_RETREAT' }> =>
          e.type === 'CAVE_MONSTER_RETREAT' &&
          (e as Extract<GameEvent, { type: 'CAVE_MONSTER_RETREAT' }>).unitId === monster.id,
      );
      expect(retreatEvt).toBeDefined();

      // Drake death must appear BEFORE the retreat so the auto-cam shows the
      // drake dying first, then the monster retreating.
      const deathIdx = events.indexOf(drakeDeathEvt!);
      const retreatIdx = events.indexOf(retreatEvt!);
      expect(deathIdx).toBeLessThan(retreatIdx);
    },
  );
});
