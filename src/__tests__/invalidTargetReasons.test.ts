import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  SpellId,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { explainInvalidBridgeTarget, explainInvalidHealTarget } from '../unitActions';

let nextIdValue = 0;

function nextId(prefix: string): string {
  nextIdValue += 1;
  return `${prefix}_${nextIdValue}`;
}

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

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId('unit'),
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
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
  } as Unit;
}

function makeBuilding(type: BuildingType, position: Position): Building {
  return {
    id: nextId('building'),
    type,
    faction: Faction.PLAYER,
    position: { ...position },
    hp: 1,
    maxHp: 1,
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
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState({
  units = [],
  buildings = [],
  pendingTransposeFirstUnitId = null,
}: {
  units?: Unit[];
  buildings?: Building[];
  pendingTransposeFirstUnitId?: string | null;
} = {}): GameState {
  const grid = makeGrid();
  const unitMap: Record<string, Unit> = {};
  const buildingMap: Record<string, Building> = {};

  for (const unit of units) {
    unitMap[unit.id] = unit;
    grid[unit.position.y][unit.position.x].unitId = unit.id;
  }

  for (const building of buildings) {
    buildingMap[building.id] = building;
    grid[building.position.y][building.position.x].buildingId = building.id;
  }

  return {
    turn: 1,
    phase: 'PLAYER',
    grid,
    units: unitMap,
    buildings: buildingMap,
    specialists: {},
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 0,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    techNodes: {},
    techFlags: [],
    arcaneCrystals: 0,
    unlockedBuildings: [BuildingType.BRIDGE],
    unlockedUnits: [],
    unlockedSpells: [],
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
    difficulty: 'normal',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
  } as unknown as GameState;
}

describe('explainInvalidSpellTarget', () => {
  it('returns the transpose second-pick faction mismatch reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const first = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const enemy = makeUnit(UnitType.ARCHER, { x: 7, y: 5 }, Faction.ENEMY);
    const state = makeState({
      units: [mage, first, enemy],
      pendingTransposeFirstUnitId: first.id,
    });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.TRANSPOSE, enemy.position))
      .toBe('Faction must match first unit');
  });

  it('returns the already-brandmarked reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const target = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.BRANDMARKED]);
    const state = makeState({ units: [mage, target] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.BRANDMARK_HEAL, target.position))
      .toBe('Already brandmarked');
  });

  it('returns the summoned-brandmark exclusion reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const target = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const state = makeState({ units: [mage, target] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.BRANDMARK_HEAL, target.position))
      .toBe('Summoned units cannot be brandmarked');
  });

  it('returns the self-brandmark exclusion reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const state = makeState({ units: [mage] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.BRANDMARK_HEAL, mage.position))
      .toBe('Cannot cast on itself');
  });

  it('returns the explode-mage exclusion reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const otherMage = makeUnit(UnitType.MAGE, { x: 6, y: 5 });
    const state = makeState({ units: [mage, otherMage] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.EXPLODE, otherMage.position))
      .toBe('This unit type cannot explode');
  });

  it('returns the frostcraft terrain reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const state = makeState({ units: [mage] });
    state.grid[5][6].terrainType = TileType.CANYON;

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.FROSTCRAFT, { x: 6, y: 5 }))
      .toBe('Cannot freeze this terrain');
  });

  it('returns Occupied for an occupied embernest', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const occupant = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const embernest = makeBuilding(BuildingType.EMBERNEST, { x: 6, y: 5 });
    const state = makeState({ units: [mage, occupant], buildings: [embernest] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.EMBERBIND, embernest.position))
      .toBe('Occupied');
  });

  it('returns Occupied for an occupied gravestone', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const occupant = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const gravestone = makeBuilding(BuildingType.GRAVESTONE, { x: 6, y: 5 });
    const state = makeState({ units: [mage, occupant], buildings: [gravestone] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.RAISE_SKELETON, gravestone.position))
      .toBe('Occupied');
  });

  it('returns Occupied for Grave Trap on an occupied gravestone', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const occupant = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const gravestone = makeBuilding(BuildingType.GRAVESTONE, { x: 6, y: 5 });
    const state = makeState({ units: [mage, occupant], buildings: [gravestone] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.GRAVE_TRAP, gravestone.position))
      .toBe('Occupied');
  });

  it('excludes occupied gravestones from Grave Trap targets and rejects the cast', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const occupant = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const occupiedGravestone = makeBuilding(BuildingType.GRAVESTONE, { x: 6, y: 5 });
    const emptyGravestone = makeBuilding(BuildingType.GRAVESTONE, { x: 5, y: 6 });
    const state = makeState({
      units: [mage, occupant],
      buildings: [occupiedGravestone, emptyGravestone],
    });
    state.unlockedSpells = [SpellId.GRAVE_TRAP];
    state.arcaneCrystals = 1;

    const targets = getValidSpellTargets(state, mage.id, SpellId.GRAVE_TRAP);
    expect(targets).toContainEqual(emptyGravestone.position);
    expect(targets).not.toContainEqual(occupiedGravestone.position);

    const next = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.GRAVE_TRAP, occupiedGravestone.position)).toBe(false);
      expect(castSpell(draft, mage.id, SpellId.GRAVE_TRAP, emptyGravestone.position)).toBe(true);
    });

    expect(next.grid[occupiedGravestone.position.y][occupiedGravestone.position.x].buildingId)
      .toBe(occupiedGravestone.id);
    expect(next.grid[occupiedGravestone.position.y][occupiedGravestone.position.x].unitId)
      .toBe(occupant.id);
    const placedTrap = Object.values(next.buildings).find((building) =>
      building.type === BuildingType.GRAVE_TRAP
      && building.position.x === emptyGravestone.position.x
      && building.position.y === emptyGravestone.position.y);
    expect(placedTrap).toBeDefined();
  });

  it('returns null for Frostcraft on an already-frozen tile', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const state = makeState({ units: [mage] });
    state.grid[5][6].terrainType = TileType.WATER;
    state.grid[5][6].status = TileStatus.FROZEN;

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.FROSTCRAFT, { x: 6, y: 5 }))
      .toBeNull();
  });

  it('returns null for an out-of-range Brandmark tap', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const target = makeUnit(UnitType.GUARD, { x: 5, y: 12 });
    const state = makeState({ units: [mage, target] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.BRANDMARK_HEAL, target.position))
      .toBeNull();
  });

  it('returns null for an occupied Crystal Cave mountain tile', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const occupant = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const state = makeState({ units: [mage, occupant] });
    state.grid[5][6].terrainType = TileType.MOUNTAIN;

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.CRYSTAL_CAVE, { x: 6, y: 5 }))
      .toBeNull();
  });

  it('returns null for a transpose first-pick empty tile', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const state = makeState({ units: [mage] });

    expect(explainInvalidSpellTarget(state, mage.id, SpellId.TRANSPOSE, { x: 6, y: 5 }))
      .toBeNull();
  });
});

describe('explainInvalidHealTarget', () => {
  it('returns the brandmarked-heal exclusion reason', () => {
    const healer = makeUnit(UnitType.GUARD, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.PATCHUP]);
    const target = makeUnit(UnitType.ARCHER, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.BRANDMARKED]);
    target.stats.currentHp -= 1;
    const state = makeState({ units: [healer, target] });

    expect(explainInvalidHealTarget(state, healer.id, target.position))
      .toBe('Brandmarked units cannot be healed');
  });

  it('returns the summoned-heal exclusion reason', () => {
    const healer = makeUnit(UnitType.GUARD, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.PATCHUP]);
    const target = makeUnit(UnitType.ARCHER, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    target.stats.currentHp -= 1;
    const state = makeState({ units: [healer, target] });

    expect(explainInvalidHealTarget(state, healer.id, target.position))
      .toBe('Summoned units cannot be healed');
  });

  it('returns null for a full-HP adjacent ally', () => {
    const healer = makeUnit(UnitType.GUARD, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.PATCHUP]);
    const target = makeUnit(UnitType.ARCHER, { x: 6, y: 5 });
    const state = makeState({ units: [healer, target] });

    expect(explainInvalidHealTarget(state, healer.id, target.position)).toBeNull();
  });
});

describe('explainInvalidBridgeTarget', () => {
  it('returns the bridge endpoint reason for water', () => {
    const builder = makeUnit(UnitType.SCOUT, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.BRIDGE_BUILDER]);
    const state = makeState({ units: [builder] });
    state.grid[5][6].terrainType = TileType.WATER;

    expect(explainInvalidBridgeTarget(state, builder.id, { x: 6, y: 5 }))
      .toBe('Bridge needs accessible entry and exit tile');
  });

  it('returns null for a plains tile', () => {
    const builder = makeUnit(UnitType.SCOUT, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.BRIDGE_BUILDER]);
    const state = makeState({ units: [builder] });

    expect(explainInvalidBridgeTarget(state, builder.id, { x: 6, y: 5 })).toBeNull();
  });
});
