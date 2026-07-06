/**
 * SP-13 — Hellbinder (spec_13): SUMMONED units gain RAGE + CLEAVE [S7]
 *
 * Coverage:
 *   1. Hiring Hellbinder grants RAGE and CLEAVE to all existing SUMMONED player units.
 *   2. Dismissing Hellbinder reverts RAGE and CLEAVE from SUMMONED units.
 *   3. Non-SUMMONED player units are unaffected by hire or dismiss.
 *   4. Crystal Drake recruited while Hellbinder is active spawns with RAGE and CLEAVE.
 *   5. Skeleton raised (RAISE_SKELETON spell) while Hellbinder is active spawns with RAGE and CLEAVE.
 *   6. Player-controlled Ember Demon bound (EMBERBIND spell) while Hellbinder is active
 *      spawns with RAGE and CLEAVE — verifying converted Ember Demons are covered.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  Faction,
  UnitTag,
  UnitType,
  BuildingType,
  TileType,
  DestroyBehavior,
  SpellId,
} from '../types';
import type { GameState, Unit, Building, Tile } from '../types';
import { UNIT_DEFINITIONS, MAP } from '../gameConfig';
import { createInitialSpecialists, applyEffectsForSpecialist, revokeEffectsForSpecialist } from '../specialistSystem';
import { recruitUnit } from '../resourceSystem';
import { castSpell } from '../spellSystem';

// ── Tiny helpers ─────────────────────────────────────────────────────────────

let _id = 0;
const nextId = (prefix: string) => `${prefix}_${++_id}`;

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

function makeGrid(w = MAP.GRID_WIDTH, h = MAP.GRID_HEIGHT): Tile[][] {
  const grid: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push(makeTile(x, y));
    grid.push(row);
  }
  return grid;
}

function makeUnit(
  type: UnitType,
  x: number,
  y: number,
  extraTags: UnitTag[] = [],
  faction: Faction = Faction.PLAYER,
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId('u'),
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
    tags: [...def.tags, ...extraTags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
}

function makeBuilding(
  type: BuildingType,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id: nextId('b'),
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

function makeBaseState(
  units: Unit[] = [],
  buildings: Building[] = [],
  opts: { withHellbinder?: boolean; unlockedSpells?: SpellId[]; unlockedUnits?: UnitType[] } = {},
): GameState {
  const unitMap: Record<string, Unit> = {};
  for (const u of units) unitMap[u.id] = u;

  const buildingMap: Record<string, Building> = {};
  for (const b of buildings) buildingMap[b.id] = b;

  const grid = makeGrid();
  for (const u of units) {
    const t = grid[u.position.y]?.[u.position.x];
    if (t) t.unitId = u.id;
  }
  for (const b of buildings) {
    const t = grid[b.position.y]?.[b.position.x];
    if (t) t.buildingId = b.id;
  }

  const specialists = createInitialSpecialists();
  const globalSpecialistStorage = opts.withHellbinder ? ['spec_13'] : [];

  return {
    units: unitMap,
    buildings: buildingMap,
    grid,
    turn: 1,
    resources: { iron: 99, wood: 99 },
    arcaneCrystals: 99,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    specialists,
    globalSpecialistStorage,
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
    unlockedSpells: opts.unlockedSpells ?? [],
    unlockedUnits: opts.unlockedUnits ?? [],
  } as unknown as GameState;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SP-13 Hellbinder — hire/dismiss effect on existing units', () => {
  it('grants RAGE and CLEAVE to existing SUMMONED player units on hire', () => {
    const summoned = makeUnit(UnitType.SKELETON, 1, 1, [UnitTag.SUMMONED]);
    const state = makeBaseState([summoned]);
    const hellbinder = state.specialists['spec_13'];

    applyEffectsForSpecialist(state as unknown as import('immer').Draft<GameState>, hellbinder);

    expect(state.units[summoned.id].tags).toContain(UnitTag.RAGE);
    expect(state.units[summoned.id].tags).toContain(UnitTag.CLEAVE);
  });

  it('reverts RAGE and CLEAVE from SUMMONED units on dismiss', () => {
    const summoned = makeUnit(UnitType.SKELETON, 1, 1, [UnitTag.SUMMONED, UnitTag.RAGE, UnitTag.CLEAVE]);
    const state = makeBaseState([summoned], [], { withHellbinder: true });
    const hellbinder = state.specialists['spec_13'];

    // Mirror dismissSpecialist: remove from storage first so revoke doesn't
    // see spec_13 as "still active" when checking stillGranted.
    const idx = state.globalSpecialistStorage.indexOf('spec_13');
    state.globalSpecialistStorage.splice(idx, 1);
    revokeEffectsForSpecialist(state as unknown as import('immer').Draft<GameState>, hellbinder);

    expect(state.units[summoned.id].tags).not.toContain(UnitTag.RAGE);
    expect(state.units[summoned.id].tags).not.toContain(UnitTag.CLEAVE);
  });

  it('does not grant RAGE or CLEAVE to non-SUMMONED player units', () => {
    const swordsman = makeUnit(UnitType.SWORDSMAN, 2, 2);
    const state = makeBaseState([swordsman]);
    const hellbinder = state.specialists['spec_13'];

    applyEffectsForSpecialist(state as unknown as import('immer').Draft<GameState>, hellbinder);

    expect(state.units[swordsman.id].tags).not.toContain(UnitTag.RAGE);
    expect(state.units[swordsman.id].tags).not.toContain(UnitTag.CLEAVE);
  });

  it('does not grant RAGE or CLEAVE to enemy SUMMONED units', () => {
    const enemySummoned = makeUnit(UnitType.SKELETON, 3, 3, [UnitTag.SUMMONED], Faction.ENEMY);
    const state = makeBaseState([enemySummoned]);
    const hellbinder = state.specialists['spec_13'];

    applyEffectsForSpecialist(state as unknown as import('immer').Draft<GameState>, hellbinder);

    expect(state.units[enemySummoned.id].tags).not.toContain(UnitTag.RAGE);
    expect(state.units[enemySummoned.id].tags).not.toContain(UnitTag.CLEAVE);
  });
});

describe('SP-13 Hellbinder — newly recruited Crystal Drake', () => {
  it('Crystal Drake recruited while Hellbinder is active gets RAGE and CLEAVE', () => {
    // Crystal Cave requires resonanceTurnsRemaining > 0 to allow recruitment
    const cave = makeBuilding(BuildingType.CRYSTAL_CAVE, 0, 0, { resonanceTurnsRemaining: 1 });
    // Place the cave building on a non-blocking tile; spawn will use adjacent tile
    const stronghold = makeBuilding(BuildingType.STRONGHOLD, 5, 0, {
      populationCount: 0, populationCap: 5,
    });
    const state = makeBaseState(
      [],
      [cave, stronghold],
      { withHellbinder: true, unlockedUnits: [UnitType.CRYSTAL_DRAKE] },
    );
    // Free up spawn tile next to cave
    state.grid[0][0].buildingId = cave.id;

    const next = produce(state, (draft) => {
      recruitUnit(draft, cave.id, UnitType.CRYSTAL_DRAKE);
    });

    const drake = Object.values(next.units).find((u) => u.type === UnitType.CRYSTAL_DRAKE);
    expect(drake).toBeDefined();
    expect(drake!.tags).toContain(UnitTag.SUMMONED);
    expect(drake!.tags).toContain(UnitTag.RAGE);
    expect(drake!.tags).toContain(UnitTag.CLEAVE);
  });

  it('Crystal Drake recruited without Hellbinder does NOT get RAGE or CLEAVE', () => {
    const cave = makeBuilding(BuildingType.CRYSTAL_CAVE, 0, 0, { resonanceTurnsRemaining: 1 });
    const state = makeBaseState(
      [],
      [cave],
      { withHellbinder: false, unlockedUnits: [UnitType.CRYSTAL_DRAKE] },
    );
    state.grid[0][0].buildingId = cave.id;

    const next = produce(state, (draft) => {
      recruitUnit(draft, cave.id, UnitType.CRYSTAL_DRAKE);
    });

    const drake = Object.values(next.units).find((u) => u.type === UnitType.CRYSTAL_DRAKE);
    expect(drake).toBeDefined();
    expect(drake!.tags).toContain(UnitTag.SUMMONED);
    expect(drake!.tags).not.toContain(UnitTag.RAGE);
    expect(drake!.tags).not.toContain(UnitTag.CLEAVE);
  });
});

describe('SP-13 Hellbinder — RAISE_SKELETON spell', () => {
  it('Skeleton raised while Hellbinder is active gets RAGE and CLEAVE', () => {
    // Place a Mage at (4,4) and a Gravestone at (5,4) within attack range 2
    const mage = makeUnit(UnitType.MAGE, 4, 4);
    // MAGE needs no action flags spent so it can cast
    mage.spellsCastThisTurn = 0;
    const grave = makeBuilding(BuildingType.GRAVESTONE, 5, 4, {
      faction: Faction.PLAYER,
      gravesUnitType: UnitType.SWORDSMAN,
    } as Partial<Building>);

    const state = makeBaseState(
      [mage],
      [grave],
      {
        withHellbinder: true,
        unlockedSpells: [SpellId.RAISE_SKELETON],
      },
    );

    const next = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.RAISE_SKELETON, { x: 5, y: 4 });
    });

    const skeleton = Object.values(next.units).find((u) => u.type === UnitType.SKELETON);
    expect(skeleton).toBeDefined();
    expect(skeleton!.tags).toContain(UnitTag.SUMMONED);
    expect(skeleton!.tags).toContain(UnitTag.RAGE);
    expect(skeleton!.tags).toContain(UnitTag.CLEAVE);
  });

  it('Skeleton raised WITHOUT Hellbinder does not get RAGE or CLEAVE', () => {
    const mage = makeUnit(UnitType.MAGE, 4, 4);
    mage.spellsCastThisTurn = 0;
    const grave = makeBuilding(BuildingType.GRAVESTONE, 5, 4, {
      faction: Faction.PLAYER,
    });

    const state = makeBaseState(
      [mage],
      [grave],
      {
        withHellbinder: false,
        unlockedSpells: [SpellId.RAISE_SKELETON],
      },
    );

    const next = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.RAISE_SKELETON, { x: 5, y: 4 });
    });

    const skeleton = Object.values(next.units).find((u) => u.type === UnitType.SKELETON);
    expect(skeleton).toBeDefined();
    expect(skeleton!.tags).toContain(UnitTag.SUMMONED);
    expect(skeleton!.tags).not.toContain(UnitTag.RAGE);
    expect(skeleton!.tags).not.toContain(UnitTag.CLEAVE);
  });
});

describe('SP-13 Hellbinder — EMBERBIND spell (converted Ember Demon)', () => {
  it('player-controlled Ember Demon bound while Hellbinder active gets RAGE and CLEAVE', () => {
    // Place a Mage at (4,4) and an EMBERNEST at (5,4) within attack range 2
    const mage = makeUnit(UnitType.MAGE, 4, 4);
    mage.spellsCastThisTurn = 0;
    const nest = makeBuilding(BuildingType.EMBERNEST, 5, 4, { faction: null } as Partial<Building>);

    const state = makeBaseState(
      [mage],
      [nest],
      {
        withHellbinder: true,
        unlockedSpells: [SpellId.EMBERBIND],
      },
    );

    const next = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.EMBERBIND, { x: 5, y: 4 });
    });

    const demon = Object.values(next.units).find((u) => u.type === UnitType.EMBER_DEMON && u.faction === Faction.PLAYER);
    expect(demon).toBeDefined();
    expect(demon!.tags).toContain(UnitTag.SUMMONED);
    expect(demon!.tags).toContain(UnitTag.LEASHED);
    expect(demon!.tags).toContain(UnitTag.RAGE);
    expect(demon!.tags).toContain(UnitTag.CLEAVE);
  });

  it('player-controlled Ember Demon bound WITHOUT Hellbinder does not get RAGE or CLEAVE', () => {
    const mage = makeUnit(UnitType.MAGE, 4, 4);
    mage.spellsCastThisTurn = 0;
    const nest = makeBuilding(BuildingType.EMBERNEST, 5, 4, { faction: null } as Partial<Building>);

    const state = makeBaseState(
      [mage],
      [nest],
      {
        withHellbinder: false,
        unlockedSpells: [SpellId.EMBERBIND],
      },
    );

    const next = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.EMBERBIND, { x: 5, y: 4 });
    });

    const demon = Object.values(next.units).find((u) => u.type === UnitType.EMBER_DEMON && u.faction === Faction.PLAYER);
    expect(demon).toBeDefined();
    expect(demon!.tags).toContain(UnitTag.SUMMONED);
    expect(demon!.tags).not.toContain(UnitTag.RAGE);
    expect(demon!.tags).not.toContain(UnitTag.CLEAVE);
  });
});
