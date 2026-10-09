import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { MAP, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { SPELL_DEFINITIONS } from '../../config/magic';
import { canConstructAt } from '../constructionSystem';
import { computeUnitAiScores } from '../enemySystem';
import { moveUnit, getReachableTiles } from '../movementSystem';
import {
  castMagePortalPair,
  cleanupPortals,
  cleanupExpiredPortalsEndOfTurn,
  explainBlockedMagePortalEntry,
  isMagePortalExitAvailable,
  removePortalsOnLava,
  resolvePortalEntry,
} from '../portalSystem';
import { explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { resolveAttack } from '../combatSystem';
import { loadSlot, saveSlot } from '../saveSystem';
import { useGameStore } from '../gameStore';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  GamePhase,
  SpellId,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
import type { GameEvent } from '../gameEvents';
import { t } from '../i18n/i18n';

const A = { x: 4, y: 11 };
const B = { x: 6, y: 11 };

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

function makeUnit(
  id: string,
  type: UnitType,
  faction: Faction,
  position: Position,
  tags: UnitTag[] = [],
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id,
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      attackRange: def.attackRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
    },
    tags: [...def.tags, ...tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    spellsCastThisTurn: 0,
  } as Unit;
}

function makeBuilding(id: string, type: BuildingType, position: Position): Building {
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { ...position },
    hp: 10,
    maxHp: 10,
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
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(units: Unit[] = [], buildings: Building[] = []): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  const buildingMap = Object.fromEntries(buildings.map((building) => [building.id, building]));
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) grid[building.position.y][building.position.x].buildingId = building.id;
  return {
    turn: 3,
    phase: GamePhase.PLAYER_TURN,
    grid,
    units: unitMap,
    buildings: buildingMap,
    specialists: {},
    globalSpecialistStorage: [],
    resources: { iron: 20, wood: 20 },
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    techNodes: {},
    techFlags: [],
    arcaneCrystals: 5,
    unlockedBuildings: [BuildingType.WOODCUTTER],
    unlockedUnits: [UnitType.MAGE],
    unlockedSpells: [SpellId.PORTAL],
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
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'STANDARD',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    spawnAccumulator: 0,
    lastSpawnBudget: null,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingMagePortalFirstPos: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
  } as unknown as GameState;
}

function mageState(position: Position = { x: 5, y: 10 }): GameState {
  return makeState([makeUnit('mage', UnitType.MAGE, Faction.PLAYER, position)]);
}

function addPair(state: GameState, id: string, a: Position, b: Position, casterId = 'mage'): GameState {
  return produce(state, (draft) => {
    draft.portals[id] = {
      id,
      kind: 'MAGE',
      casterId,
      entrancePos: { ...a },
      exitPos: { ...b },
      createdTurn: state.turn,
      lastUsableTurn: state.turn,
      pendingTeleportUnitId: null,
    };
  });
}

function standUnit(state: GameState, unit: Unit, position: Position): GameState {
  return produce(state, (draft) => {
    const old = draft.units[unit.id].position;
    draft.grid[old.y][old.x].unitId = null;
    draft.units[unit.id].position = { ...position };
    draft.grid[position.y][position.x].unitId = unit.id;
  });
}

describe('Mage Portal tech and spell', () => {
  it('is a 7-crystal child of Crystal Cave that unlocks Portal', () => {
    const node = TECH_TREE.find((tech) => tech.id === 'PORTAL');
    expect(node?.requires).toEqual(['CRYSTAL_CAVE']);
    expect(node?.cost).toBe(7);
    expect(node?.effects).toContainEqual({ type: 'UNLOCK_SPELL', spellId: SpellId.PORTAL });
    expect(SPELL_DEFINITIONS[SpellId.PORTAL].emoji).toBeTruthy();
  });

  it('does not spend a cast or crystal on the first endpoint and only commits a valid same-row pair', () => {
    const state = mageState();
    useGameStore.setState(state);
    useGameStore.getState().startSpellCast('mage', SpellId.PORTAL);
    useGameStore.getState().castSpell(A);
    let current = useGameStore.getState();
    expect(current.pendingMagePortalFirstPos).toEqual(A);
    expect(current.arcaneCrystals).toBe(5);
    expect(current.units.mage.spellsCastThisTurn).toBe(0);
    expect(Object.keys(current.portals)).toHaveLength(0);

    expect(explainInvalidSpellTarget(current, 'mage', SpellId.PORTAL, { x: 7, y: 10 }))
      .toEqual({ key: 'reason.spell.portalWrongRow' });
    useGameStore.getState().castSpell(B);
    current = useGameStore.getState();
    expect(Object.keys(current.portals)).toHaveLength(1);
    expect(current.arcaneCrystals).toBe(4);
    expect(current.units.mage.spellsCastThisTurn).toBe(1);
    expect(current.portals[Object.keys(current.portals)[0]].kind).toBe('MAGE');
  });

  it('requires each endpoint to be in range and empty of units, buildings, ruins, and portals', () => {
    const state = mageState();
    const mage = state.units.mage;
    const candidate = { x: 7, y: 11 };
    expect(getValidSpellTargets(state, mage.id, SpellId.PORTAL)).toContainEqual(candidate);

    const occupied = makeUnit('occupant', UnitType.GUARD, Faction.PLAYER, candidate);
    expect(getValidSpellTargets(makeState([mage, occupied]), mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);

    const building = makeBuilding('resource', BuildingType.MINE, candidate);
    expect(getValidSpellTargets(makeState([mage], [building]), mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);

    const ruined = produce(state, (draft) => { draft.grid[candidate.y][candidate.x].isRuin = true; });
    expect(getValidSpellTargets(ruined, mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);
    const strongholdRuin = produce(state, (draft) => { draft.grid[candidate.y][candidate.x].isStrongholdRuin = true; });
    expect(getValidSpellTargets(strongholdRuin, mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);

    const endpointOccupied = addPair(state, 'existing', candidate, { x: 8, y: 11 });
    expect(getValidSpellTargets(endpointOccupied, mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);

    const blocked = produce(state, (draft) => { draft.grid[candidate.y][candidate.x].isLava = true; });
    expect(getValidSpellTargets(blocked, mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);
    const water = produce(state, (draft) => { draft.grid[candidate.y][candidate.x].terrainType = TileType.WATER; });
    expect(getValidSpellTargets(water, mage.id, SpellId.PORTAL)).not.toContainEqual(candidate);
    const frozenWater = produce(state, (draft) => {
      draft.grid[candidate.y][candidate.x].terrainType = TileType.WATER;
      draft.grid[candidate.y][candidate.x].status = TileStatus.FROZEN;
    });
    expect(getValidSpellTargets(frozenWater, mage.id, SpellId.PORTAL)).toContainEqual(candidate);
    expect(getValidSpellTargets(state, mage.id, SpellId.PORTAL)).not.toContainEqual({ x: 0, y: 10 });
  });

  it('constrains the second endpoint to the first row, excludes the first tile, and reports blocked targets', () => {
    const state = produce(mageState(), (draft) => { draft.pendingMagePortalFirstPos = A; });
    const targets = getValidSpellTargets(state, 'mage', SpellId.PORTAL);
    expect(targets.every((target) => target.y === A.y)).toBe(true);
    expect(targets).not.toContainEqual(A);
    expect(targets).toContainEqual(B);

    const occupied = produce(state, (draft) => {
      draft.grid[B.y][B.x].unitId = 'other';
    });
    expect(explainInvalidSpellTarget(occupied, 'mage', SpellId.PORTAL, B))
      .toEqual({ key: 'reason.spell.portalBlocked' });
  });

  it('does not replace an existing pair until a replacement completes successfully', () => {
    const state = addPair(mageState(), 'old', A, B);
    useGameStore.setState(state);
    useGameStore.getState().startSpellCast('mage', SpellId.PORTAL);
    useGameStore.getState().castSpell({ x: 4, y: 12 });
    expect(useGameStore.getState().portals.old).toBeDefined();
    useGameStore.getState().castSpell({ x: 7, y: 10 });
    expect(useGameStore.getState().portals.old).toBeDefined();
    expect(Object.keys(useGameStore.getState().portals)).toEqual(['old']);

    useGameStore.getState().castSpell({ x: 6, y: 12 });
    expect(useGameStore.getState().portals.old).toBeUndefined();
    expect(Object.keys(useGameStore.getState().portals)).toHaveLength(1);
  });

  it('preserves the current pair when endpoint selection is cancelled', () => {
    useGameStore.setState(addPair(mageState(), 'old', A, B));
    useGameStore.getState().startSpellCast('mage', SpellId.PORTAL);
    useGameStore.getState().castSpell({ x: 4, y: 12 });
    useGameStore.getState().cancelSpellCast();
    expect(useGameStore.getState().portals.old).toBeDefined();
    expect(useGameStore.getState().pendingMagePortalFirstPos).toBeNull();
    expect(t('reason.movement.portalExitBlocked')).toBe('Exit portal blocked');
  });
});

describe('Mage portal movement and lifetime', () => {
  it('supports travel in both directions without bouncing on arrival', () => {
    const player = makeUnit('player', UnitType.GUARD, Faction.PLAYER, A);
    const enemy = makeUnit('enemy', UnitType.LAVA_GRUNT, Faction.ENEMY, { x: 8, y: 11 });
    const base = addPair(makeState([player, enemy]), 'pair', A, B, 'missing-mage');
    const events: GameEvent[] = [];
    const afterPlayer = produce(base, (draft) => {
      expect(resolvePortalEntry(draft, player.id, A, events)).toBe(true);
    });
    expect(afterPlayer.units.player.position).toEqual(B);
    expect(afterPlayer.grid[A.y][A.x].unitId).toBeNull();
    expect(afterPlayer.grid[B.y][B.x].unitId).toBe(player.id);
    expect(events.filter((event) => event.type === 'PORTAL_USED')).toHaveLength(1);

    const afterClear = standUnit(afterPlayer, player, { x: 7, y: 11 });
    const enemyAtB = standUnit(afterClear, enemy, B);
    const afterEnemy = produce(enemyAtB, (draft) => {
      expect(resolvePortalEntry(draft, enemy.id, B, events)).toBe(true);
    });
    expect(afterEnemy.units.enemy.position).toEqual(A);
    expect(afterEnemy.grid[B.y][B.x].unitId).toBeNull();
  });

  it('consumes movement but leaves attack available, for player and enemy units', () => {
    const player = makeUnit('player', UnitType.GUARD, Faction.PLAYER, { x: 3, y: 11 });
    const base = addPair(makeState([player]), 'pair', A, B, 'missing-mage');
    expect(getReachableTiles(base, player.id)).toContainEqual(A);
    const moved = produce(base, (draft) => moveUnit(draft, player.id, A, []));
    expect(moved.units.player.position).toEqual(B);
    expect(moved.units.player.hasMovedThisTurn).toBe(true);
    expect(moved.units.player.hasAttackedThisTurn).toBe(false);

    const enemy = makeUnit('enemy', UnitType.LAVA_GRUNT, Faction.ENEMY, A);
    const enemyState = addPair(makeState([enemy]), 'enemyPair', A, B, 'missing-mage');
    const enemyMoved = produce(enemyState, (draft) => {
      resolvePortalEntry(draft, enemy.id, A, []);
    });
    expect(enemyMoved.units.enemy.position).toEqual(B);
    expect(enemyMoved.units.enemy.hasMovedThisTurn).toBe(true);
    expect(enemyMoved.units.enemy.hasAttackedThisTurn).toBe(false);
  });

  it('allows a later entry through another pair without a persistent teleport lock', () => {
    const unit = makeUnit('unit', UnitType.GUARD, Faction.PLAYER, A);
    let state = addPair(makeState([unit]), 'first', A, B, 'missing');
    state = addPair(state, 'second', { x: 7, y: 11 }, { x: 8, y: 11 }, 'missing');
    state = produce(state, (draft) => { resolvePortalEntry(draft, unit.id, A, []); });
    expect(state.units.unit.position).toEqual(B);
    state = standUnit(state, unit, { x: 7, y: 11 });
    state = produce(state, (draft) => {
      expect(resolvePortalEntry(draft, unit.id, { x: 7, y: 11 }, [])).toBe(true);
    });
    expect(state.units.unit.position).toEqual({ x: 8, y: 11 });
  });

  it('excludes a blocked exit from voluntary movement and keeps forced entry at the source', () => {
    const mover = makeUnit('mover', UnitType.GUARD, Faction.PLAYER, { x: 3, y: 11 });
    const blocker = makeUnit('blocker', UnitType.GUARD, Faction.PLAYER, B);
    const state = addPair(makeState([mover, blocker]), 'pair', A, B, 'missing');
    expect(isMagePortalExitAvailable(state, A, mover)).toBe(false);
    expect(getReachableTiles(state, mover.id)).not.toContainEqual(A);

    const movedToEntry = standUnit(state, mover, A);
    const events: GameEvent[] = [];
    const forced = produce(movedToEntry, (draft) => {
      expect(resolvePortalEntry(draft, mover.id, A, events)).toBe(false);
    });
    expect(forced.units.mover.position).toEqual(A);
    expect(forced.portals.pair.pendingTeleportUnitId).toBeNull();
    expect(events).toContainEqual({ type: 'PORTAL_BLOCKED', unitId: mover.id, position: A });
    expect(explainBlockedMagePortalEntry(state, A, mover)).toEqual({ key: 'reason.movement.portalExitBlocked' });
  });

  it('resolves portal entry after knockback and preserves the defender attack', () => {
    const attacker = makeUnit('attacker', UnitType.GUARD, Faction.PLAYER, { x: 5, y: 9 }, [UnitTag.KNOCKBACK]);
    const defender = makeUnit('defender', UnitType.LAVA_GRUNT, Faction.ENEMY, { x: 5, y: 10 });
    attacker.stats.attack = 1;
    defender.stats.currentHp = 1000;
    defender.stats.maxHp = 1000;
    let state = addPair(makeState([attacker, defender]), 'pair', { x: 5, y: 11 }, { x: 7, y: 11 }, 'missing');
    state = produce(state, (draft) => { resolveAttack(draft, attacker.id, defender.id, true, []); });
    expect(state.units.defender.position).toEqual({ x: 7, y: 11 });
    expect(state.units.defender.hasMovedThisTurn).toBe(true);
    expect(state.units.defender.hasAttackedThisTurn).toBe(false);
  });

  it('keeps one pair per Mage, permits pairs from separate Mages, and cleans up death or lava', () => {
    const mage2 = makeUnit('mage2', UnitType.MAGE, Faction.PLAYER, { x: 7, y: 10 });
    let state = produce(mageState(), (draft) => {
      draft.units.mage.spellsCastThisTurn = 0;
    });
    let created = false;
    state = produce(state, (draft) => { created = castMagePortalPair(draft, 'mage', A, B); });
    expect(created).toBe(true);
    state = produce(state, (draft) => {
      castMagePortalPair(draft, 'mage', { x: 4, y: 12 }, { x: 6, y: 12 });
      draft.units[mage2.id] = mage2;
      castMagePortalPair(draft, mage2.id, { x: 7, y: 12 }, { x: 8, y: 12 });
    });
    expect(Object.values(state.portals).filter((portal) => portal.casterId === 'mage')).toHaveLength(1);
    expect(Object.values(state.portals)).toHaveLength(2);
    const distantTurn = produce(state, (draft) => { draft.turn += 50; });
    const afterExpiryCleanup = produce(distantTurn, (draft) => cleanupExpiredPortalsEndOfTurn(draft, []));
    expect(Object.keys(afterExpiryCleanup.portals)).toHaveLength(2);

    const dead = produce(state, (draft) => {
      delete draft.units.mage;
      cleanupPortals(draft, []);
    });
    expect(Object.values(dead.portals).some((portal) => portal.casterId === 'mage')).toBe(false);

    for (const endpoint of [A, B]) {
      const lavaState = addPair(mageState(), 'lavaPair', A, B);
      const removed = produce(lavaState, (draft) => {
        draft.grid[endpoint.y][endpoint.x].isLava = true;
        removePortalsOnLava(draft, []);
      });
      expect(removed.portals.lavaPair).toBeUndefined();
    }
  });

  it('lets enemy AI plan through a Mage portal when the paired endpoint advances toward a player', () => {
    const enemy = makeUnit('enemy', UnitType.LAVA_GRUNT, Faction.ENEMY, { x: 2, y: 11 });
    const player = makeUnit('player', UnitType.GUARD, Faction.PLAYER, { x: 8, y: 11 });
    const state = addPair(makeState([enemy, player]), 'pair', { x: 4, y: 11 }, { x: 6, y: 11 }, 'mage');
    const candidates = computeUnitAiScores(state, enemy.id);
    expect(candidates.some((candidate) =>
      candidate.type === 'MOVE_TO_PORTAL' && candidate.targetPosition?.x === 4)).toBe(true);
  });

  it('blocks construction at either portal endpoint', () => {
    const builder = makeUnit('builder', UnitType.SCOUT, Faction.PLAYER, { x: 4, y: 11 }, [UnitTag.BUILDANDCAPTURE]);
    const state = produce(addPair(makeState([builder]), 'pair', A, B, 'missing'), (draft) => {
      draft.grid[A.y][A.x].terrainType = TileType.FOREST;
    });
    expect(canConstructAt(state, builder.id, A, BuildingType.WOODCUTTER)).toBe(false);
  });
});

describe('Mage Portal save compatibility', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('round-trips Mage pairs and migrates a kind-less saved portal as a Rift Lord portal', async () => {
    const mage = makeUnit('mage', UnitType.MAGE, Faction.PLAYER, { x: 5, y: 10 });
    const state = makeState([mage]);
    state.portals = {
      legacy: {
        id: 'legacy',
        casterId: 'old-rift',
        entrancePos: { x: 1, y: 1 },
        exitPos: { x: 2, y: 2 },
        createdTurn: 1,
        lastUsableTurn: 3,
        pendingTeleportUnitId: null,
      },
      magePair: {
        id: 'magePair',
        kind: 'MAGE',
        casterId: mage.id,
        entrancePos: A,
        exitPos: B,
        createdTurn: 3,
        lastUsableTurn: 3,
        pendingTeleportUnitId: null,
      },
    } as GameState['portals'];
    await saveSlot({ id: 'portal_roundtrip', name: 'Portal Test', state });
    const loaded = await loadSlot('portal_roundtrip');
    expect(loaded?.portals.legacy.kind).toBe('RIFT_LORD');
    expect(loaded?.portals.magePair.kind).toBe('MAGE');
  });
});
