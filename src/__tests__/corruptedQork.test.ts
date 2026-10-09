import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { CORRUPTED_QORK, LEVEL_UP_VALUES, MAP, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { SPELL_DEFINITIONS } from '../../config/magic';
import { computeResearchCost } from '../../config/tech';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets, checkAndDefectLeash, sweepLeashes } from '../spellSystem';
import { shouldLeaveGravestone } from '../combatSystem';
import { resolveInfestedDeath } from '../infestedSystem';
import { applyLevelUps, canGrantXp, computeLevelFromXp, grantXp } from '../levelSystem';
import { generateInitialGameState } from '../mapGenerator';
import { loadSlot, saveSlotStrict } from '../saveSystem';
import { useGameStore } from '../gameStore';
import { ENEMY_UNIT_SPRITE, UNIT_SPRITE } from '../assetRegistry';
import { Faction, SpellId, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Position, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

let idCounter = 0;

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
    hasCaveMonster: false,
  } as Tile;
}

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
  overrides: Partial<Unit> = {},
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `qork-test-${++idCounter}`,
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: definition.maxHp,
      currentHp: definition.maxHp,
      attack: definition.attack,
      defense: definition.defense,
      moveRange: definition.moveRange,
      attackRange: definition.attackRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange,
      movementActions: definition.movementActions,
    },
    tags: [...definition.tags, ...tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasConsumedGravestoneThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    ...overrides,
  };
}

function makeState(units: Unit[] = []): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;

  return {
    turn: 1,
    phase: 'PLAYER_TURN',
    grid,
    units: unitMap,
    buildings: {},
    specialists: {},
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 5,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    techNodes: {},
    techFlags: [],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [SpellId.CORRUPTED_QORK],
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
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingMagePortalFirstPos: null,
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'STANDARD',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
  } as unknown as GameState;
}

function setCorrupted(state: GameState, pos: Position, terrainType: TileType = TileType.PLAINS): void {
  state.grid[pos.y][pos.x].status = TileStatus.CORRUPTED;
  state.grid[pos.y][pos.x].terrainType = terrainType;
}

beforeEach(() => {
  idCounter = 0;
  globalThis.indexedDB = new IDBFactory();
});

describe('Corrupted Qork registration and targeting', () => {
  it('unlocks the spell through a 7-crystal Emberbind child tech', () => {
    const tech = TECH_TREE.find((entry) => entry.id === 'CORRUPTED_QORK');
    expect(tech).toMatchObject({
      requires: ['EMBERBIND'],
      cost: 7,
      effects: [{ type: 'UNLOCK_SPELL', spellId: SpellId.CORRUPTED_QORK }],
    });
    expect(computeResearchCost(tech!.cost!, 0)).toBe(7);
  });

  it('uses Skeleton-like movement and progression with range 2 and lower defense', () => {
    const qork = UNIT_DEFINITIONS.CORRUPTED_QORK;
    const skeleton = UNIT_DEFINITIONS.SKELETON;
    expect(qork.attackRange).toBe(2);
    expect(qork.moveRange).toBe(skeleton.moveRange);
    expect(qork.maxHp).toBe(CORRUPTED_QORK.BASE_MAX_HP);
    expect(qork.attack).toBe(CORRUPTED_QORK.BASE_ATTACK);
    expect(qork.defense).toBeLessThan(skeleton.defense);
    expect(qork.levelUp).toHaveLength(2);
    expect(SPELL_DEFINITIONS[SpellId.CORRUPTED_QORK].emoji).toBe('🐗');
    expect(UNIT_SPRITE[UnitType.CORRUPTED_QORK]).toContain('corrupted_qork_100px.png');
    expect(ENEMY_UNIT_SPRITE[UnitType.CORRUPTED_QORK]).toBeUndefined();
  });

  it('targets only corrupted, in-range, empty tiles the Qork can legally occupy', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 10 });
    const blocker = makeUnit(UnitType.GUARD, { x: 5, y: 11 });
    const state = makeState([mage, blocker]);
    const plains = { x: 6, y: 10 };
    const forest = { x: 6, y: 11 };
    const occupied = { x: 5, y: 11 };
    const building = { x: 4, y: 10 };
    const canyon = { x: 5, y: 9 };
    const water = { x: 4, y: 11 };
    const noCorruption = { x: 5, y: 12 };
    const outOfRange = { x: 8, y: 10 };
    for (const pos of [plains, forest, occupied, building, canyon, water, outOfRange]) {
      setCorrupted(state, pos);
    }
    setCorrupted(state, forest, TileType.FOREST);
    setCorrupted(state, canyon, TileType.CANYON);
    setCorrupted(state, water, TileType.WATER);
    state.grid[building.y][building.x].buildingId = 'resource-building';
    state.grid[outOfRange.y][outOfRange.x].isLava = false;

    const targets = getValidSpellTargets(state, mage.id, SpellId.CORRUPTED_QORK);
    expect(targets).toContainEqual(plains);
    expect(targets).toContainEqual(forest);
    expect(targets).not.toContainEqual(occupied);
    expect(targets).not.toContainEqual(building);
    expect(targets).not.toContainEqual(canyon);
    expect(targets).not.toContainEqual(water);
    expect(targets).not.toContainEqual(noCorruption);
    expect(targets).not.toContainEqual(outOfRange);
  });

  it('rejects a failed cast without cleansing corruption or spending crystals', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 10 });
    const blocker = makeUnit(UnitType.GUARD, { x: 6, y: 10 });
    const state = makeState([mage, blocker]);
    const target = { x: 6, y: 10 };
    setCorrupted(state, target);

    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.CORRUPTED_QORK, target)).toBe(false);
    });

    expect(after.grid[target.y][target.x].status).toBe(TileStatus.CORRUPTED);
    expect(after.arcaneCrystals).toBe(state.arcaneCrystals);
    expect(Object.values(after.units).some((unit) => unit.type === UnitType.CORRUPTED_QORK)).toBe(false);
  });

  it('provides a localized reason for corrupted tiles that cannot host a Qork', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 10 });
    const blocker = makeUnit(UnitType.GUARD, { x: 6, y: 10 });
    const state = makeState([mage, blocker]);
    const target = { x: 6, y: 10 };
    setCorrupted(state, target);

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.CORRUPTED_QORK, target))
      .toEqual({ key: 'reason.spell.corruptedQorkSpawn' });
  });
});

describe('Corrupted Qork summoning and leash', () => {
  it('cleanses the exact tile, spends one crystal and cast, and creates a bound summoned Qork', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 10 });
    const state = makeState([mage]);
    const target = { x: 6, y: 10 };
    setCorrupted(state, target);
    useGameStore.setState(state);
    useGameStore.getState().startSpellCast(mage.id, SpellId.CORRUPTED_QORK);
    useGameStore.getState().castSpell(target);

    const result = useGameStore.getState();
    const qork = Object.values(result.units).find((unit) => unit.type === UnitType.CORRUPTED_QORK)!;
    expect(result.grid[target.y][target.x].status).toBeNull();
    expect(result.grid[target.y][target.x].unitId).toBe(qork.id);
    expect(qork.position).toEqual(target);
    expect(qork.faction).toBe(Faction.PLAYER);
    expect(qork.tags).toEqual(expect.arrayContaining([UnitTag.SUMMONED, UnitTag.LEASHED, UnitTag.RANGED]));
    expect(qork.controllerMageId).toBe(mage.id);
    expect(qork.hasMovedThisTurn).toBe(true);
    expect(qork.hasAttackedThisTurn).toBe(true);
    expect(qork.hasCapturedThisTurn).toBe(true);
    expect(qork.hasConstructedThisTurn).toBe(true);
    expect(qork.hasDestroyedThisTurn).toBe(true);
    expect(qork.hasTradedThisTurn).toBe(false);
    expect(result.arcaneCrystals).toBe(state.arcaneCrystals - 1);
    expect(result.units[mage.id].spellsCastThisTurn).toBe(1);
  });

  it('allows a Mage to summon multiple Qorks over multiple casts', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 10 });
    const state = makeState([mage]);
    const first = { x: 6, y: 10 };
    const second = { x: 4, y: 10 };
    setCorrupted(state, first);
    setCorrupted(state, second);

    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.CORRUPTED_QORK, first)).toBe(true);
      draft.units[mage.id].spellsCastThisTurn = 0;
      expect(castSpell(draft, mage.id, SpellId.CORRUPTED_QORK, second)).toBe(true);
    });
    expect(Object.values(after.units).filter((unit) => unit.type === UnitType.CORRUPTED_QORK)).toHaveLength(2);
    expect(after.arcaneCrystals).toBe(state.arcaneCrystals - 2);
  });

  it('defects Qorks at the same range boundary and with the same changes as Ember Demons', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 3, y: 10 });
    const qork = makeUnit(UnitType.CORRUPTED_QORK, { x: 5, y: 10 }, Faction.PLAYER, [
      UnitTag.SUMMONED,
      UnitTag.LEASHED,
    ], { controllerMageId: mage.id, xp: 5, level: 2 });
    const demon = makeUnit(UnitType.EMBER_DEMON, { x: 5, y: 11 }, Faction.PLAYER, [
      UnitTag.SUMMONED,
      UnitTag.LEASHED,
    ], { controllerMageId: mage.id });
    let state = makeState([mage, qork, demon]);

    state = produce(state, (draft) => {
      expect(checkAndDefectLeash(draft, qork.id)).toBe(false);
      expect(checkAndDefectLeash(draft, demon.id)).toBe(false);
      draft.units[qork.id].position.x = 6;
      draft.units[qork.id].position.y = 10;
      draft.units[demon.id].position.x = 6;
      draft.units[demon.id].position.y = 10;
      expect(checkAndDefectLeash(draft, qork.id)).toBe(true);
      expect(checkAndDefectLeash(draft, demon.id)).toBe(true);
    });
    expect(state.units[qork.id].faction).toBe(Faction.ENEMY);
    expect(state.units[qork.id].controllerMageId).toBeNull();
    expect(state.units[qork.id].tags).not.toContain(UnitTag.LEASHED);
    expect(state.units[qork.id].tags).not.toContain(UnitTag.SUMMONED);
    expect(state.units[qork.id].stats).toEqual(qork.stats);
    expect(state.units[qork.id].xp).toBe(5);
    expect(state.units[qork.id].level).toBe(2);
  });

  it('defects all bound Qorks when the controlling Mage dies', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 3, y: 10 });
    const qork = makeUnit(UnitType.CORRUPTED_QORK, { x: 4, y: 10 }, Faction.PLAYER, [
      UnitTag.SUMMONED,
      UnitTag.LEASHED,
    ], { controllerMageId: mage.id });
    const demon = makeUnit(UnitType.EMBER_DEMON, { x: 4, y: 11 }, Faction.PLAYER, [
      UnitTag.SUMMONED,
      UnitTag.LEASHED,
    ], { controllerMageId: mage.id });
    const state = makeState([mage, qork, demon]);

    let defected: string[] = [];
    produce(state, (draft) => {
      delete draft.units[mage.id];
      defected = sweepLeashes(draft);
    });
    expect(defected).toContain(qork.id);
    expect(defected).toContain(demon.id);
    expect(state.units[qork.id].faction).toBe(Faction.PLAYER);
  });
});

describe('Corrupted Qork progression, death, and saves', () => {
  it('uses ordinary XP and level 1 to 3 progression', () => {
    const qork = makeUnit(UnitType.CORRUPTED_QORK, { x: 5, y: 10 });
    const state = makeState([qork]);
    expect(canGrantXp(qork.type, qork.xp)).toBe(true);

    const after = produce(state, (draft) => {
      grantXp(draft, qork.id, LEVEL_UP_VALUES.XP_TO_LEVEL_2, true);
      expect(computeLevelFromXp(qork.type, draft.units[qork.id].xp)).toBe(2);
      applyLevelUps(draft, qork.id, 2, true);
      grantXp(draft, qork.id, LEVEL_UP_VALUES.XP_TO_LEVEL_3 - LEVEL_UP_VALUES.XP_TO_LEVEL_2, true);
      expect(computeLevelFromXp(qork.type, draft.units[qork.id].xp)).toBe(3);
      applyLevelUps(draft, qork.id, 3, true);
    });
    expect(after.units[qork.id].level).toBe(3);
    expect(after.units[qork.id].stats.maxHp).toBeGreaterThan(qork.stats.maxHp);
    expect(canGrantXp(qork.type, after.units[qork.id].xp)).toBe(false);
  });

  it.each([Faction.PLAYER, Faction.ENEMY])('applies corruption on true death for faction %s', (faction) => {
    const qork = makeUnit(UnitType.CORRUPTED_QORK, { x: 5, y: 10 }, faction);
    const state = makeState([qork]);
    state.grid[10][5].status = TileStatus.FROZEN;
    const events: GameEvent[] = [];

    const after = produce(state, (draft) => {
      const deceased = draft.units[qork.id];
      draft.grid[10][5].unitId = null;
      delete draft.units[qork.id];
      resolveInfestedDeath(draft, deceased, events);
    });
    expect(after.grid[10][5].status).toBe(TileStatus.CORRUPTED);
    expect(events).toContainEqual({ type: 'CORRUPTION_APPLIED', position: qork.position });
  });

  it('leaves illegal terrain status intact and emits a no-text fizzle event', () => {
    const qork = makeUnit(UnitType.CORRUPTED_QORK, { x: 5, y: 10 }, Faction.ENEMY);
    const state = makeState([qork]);
    state.grid[10][5].terrainType = TileType.CANYON;
    state.grid[10][5].status = TileStatus.FROZEN;
    const events: GameEvent[] = [];

    produce(state, (draft) => {
      const deceased = draft.units[qork.id];
      draft.grid[10][5].unitId = null;
      delete draft.units[qork.id];
      resolveInfestedDeath(draft, deceased, events);
    });
    expect(state.grid[10][5].status).toBe(TileStatus.FROZEN);
    expect(events).toContainEqual({ type: 'CORRUPTION_FIZZLE', position: qork.position });
    expect(events.some((event) => event.type === 'CORRUPTION_APPLIED')).toBe(false);
  });

  it('does not create a Gravestone and does not corrupt on non-death removal', () => {
    const qork = makeUnit(UnitType.CORRUPTED_QORK, { x: 5, y: 10 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const state = makeState([qork]);
    expect(shouldLeaveGravestone(qork, { defaultOn: true })).toBe(false);

    const removed = produce(state, (draft) => {
      draft.grid[10][5].unitId = null;
      delete draft.units[qork.id];
    });
    expect(removed.grid[10][5].status).toBeNull();
  });

  it('round-trips controller, leash, XP, and level state', async () => {
    const base = generateInitialGameState();
    let magePosition: Position | null = null;
    let qorkPosition: Position | null = null;
    for (let y = MAP.GRID_HEIGHT - 1; y >= 0 && !qorkPosition; y--) {
      for (let x = 0; x < MAP.GRID_WIDTH - 1; x++) {
        const first = base.grid[y][x];
        const second = base.grid[y][x + 1];
        if (!first || !second || first.unitId || first.buildingId || first.isLava
          || second.unitId || second.buildingId || second.isLava) continue;
        magePosition = { x, y };
        qorkPosition = { x: x + 1, y };
        break;
      }
    }
    expect(magePosition).not.toBeNull();
    expect(qorkPosition).not.toBeNull();
    const mage = makeUnit(UnitType.MAGE, magePosition!);
    const qork = makeUnit(UnitType.CORRUPTED_QORK, qorkPosition!, Faction.PLAYER, [
      UnitTag.SUMMONED,
      UnitTag.LEASHED,
    ], { controllerMageId: mage.id, xp: 5, level: 2 });
    base.units[mage.id] = mage;
    base.units[qork.id] = qork;
    base.grid[mage.position.y][mage.position.x].unitId = mage.id;
    base.grid[qork.position.y][qork.position.x].unitId = qork.id;

    await saveSlotStrict({ id: 'qork-save', name: 'Qork', state: base });
    const loaded = await loadSlot('qork-save');
    expect(loaded?.units[qork.id]).toMatchObject({
      controllerMageId: mage.id,
      tags: expect.arrayContaining([UnitTag.SUMMONED, UnitTag.LEASHED]),
      xp: 5,
      level: 2,
    });
  });
});
