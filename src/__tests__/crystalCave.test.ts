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
 *       * CRYSTAL_CAVE tech node requires ARCANE_AWAKENING and unlocks the
 *         Crystal Cave spell.
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
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, MAGE, TECH_TREE, SPELL_DEFINITIONS, CRYSTAL_CAVE_CONFIG, MAP } from '../gameConfig';
import { cleanupRoostedUnits } from '../buildingRemoval';
import { getReachableTiles, resolveSlide } from '../movementSystem';
import { getValidSpellTargets, castSpell } from '../spellSystem';
import {
  isRecruitmentBuildingType,
  getRecruitableUnitTypes,
  computeRecruitmentBuildingUsage,
} from '../resourceSystem';
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

  it('Crystal Drake costs arcane crystals (named constant, not iron/wood)', () => {
    expect(MAGE.CRYSTAL_CAVE_DRAKE_CRYSTAL_COST).toBeGreaterThan(0);
    expect(UNIT_DEFINITIONS.CRYSTAL_DRAKE.cost).toEqual({ iron: 0, wood: 0 });
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

describe('Crystal Cave spell — silent cave-monster removal on construction', () => {
  it('clears hasCaveMonster and removes the encounter monster without emitting feedback', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 4 });
    // The target mountain tile (5,4) is unoccupied (target validation requires it),
    // but `hasCaveMonster` is set on it and an active encounter is linked to the
    // tile via mountainTileId. The encounter's monster unit lives off-tile.
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

    // Monster is gone; cave is up; flags cleared.
    expect(next.units[monster.id]).toBeUndefined();
    expect(next.grid[4][5].hasCaveMonster).toBe(false);
    expect(next.activeCaveEncounters.length).toBe(0);
    // No kill credit, no stats bump.
    expect(next.gameStats.unitsKilled).toBe(startKills);
    // A building of type CRYSTAL_CAVE now sits on the target tile.
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
  it('exists with a description that references the crystal-cost constant (no raw numbers)', () => {
    const def = SPELL_DEFINITIONS[SpellId.CRYSTAL_CAVE];
    expect(def).toBeDefined();
    // The description should mention the crystal cost via the named constant —
    // i.e., the rendered string contains the constant's value.
    expect(def.description).toContain(String(MAGE.CRYSTAL_CAVE_DRAKE_CRYSTAL_COST));
  });
});
