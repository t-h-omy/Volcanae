import { beforeAll, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  canConstructAt, constructBuilding, getConstructionMenuOptionsForTile,
  getConstructionOptionsForTile, getConversionTargetsForTile, getRuinBuildingOptions,
  RUIN_BUILDABLE_TYPES,
} from '../constructionSystem';
import {
  canUnitConstruct, canUnitPreviewConstruction, getConstructionMenuUnlockTechId,
  getConstructionTargets, sortConstructionMenuOptions,
} from '../unitActions';
import {
  getBuildingUnlockTechId, getUnitConstructionUnlockTechId, unlockTech,
} from '../techSystem';
import { BUILDING_DEFINITIONS, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { BuildingType, Faction, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Tile, Unit } from '../types';
import { buildingName } from '../i18n/entityText';
import { useLocaleStore } from '../i18n/localeStore';

beforeAll(async () => {
  await useLocaleStore.getState().setLocale('en');
});

const position = { x: 0, y: 0 };

function makeUnit(type: UnitType = UnitType.SPEARMAN, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: 'unit', type, faction: Faction.PLAYER, position: { ...position },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange, movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false, hasCapturedThisTurn: false, hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0, lastMovedTurn: 0,
    ...overrides,
  };
}

function makeState(tileOverrides: Partial<Tile> = {}, unit = makeUnit()): GameState {
  const tile: Tile = {
    position: { ...position }, isRevealed: true, buildingId: null, unitId: unit.id,
    isLava: false, isLavaPreview: false, isRuin: true, isStrongholdRuin: false,
    terrainType: TileType.PLAINS, status: null, ...tileOverrides,
  };
  return {
    grid: [[tile]], units: { [unit.id]: unit }, buildings: {},
    resources: { iron: 999, wood: 999 },
    techNodes: Object.fromEntries(TECH_TREE.map((def) => [
      def.id, { id: def.id, unlocked: false },
    ])),
    unlockedBuildings: [], unlockedUnits: [], unlockedSpells: [], techFlags: [],
    arcaneCrystals: 999, ember: 0, specialists: {}, globalSpecialistStorage: [],
    gameStats: {
      unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0, unitsRecruited: 0,
      buildingsConstructed: 0, buildingsConverted: 0, techsUnlocked: 0,
      enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
    },
  } as unknown as GameState;
}

const tileCases: [string, Partial<Tile>, BuildingType[]][] = [
  ['ruin', {}, RUIN_BUILDABLE_TYPES],
  ['forest', { isRuin: false, terrainType: TileType.FOREST },
    [BuildingType.WOODCUTTER, BuildingType.CHARCOAL_KILN]],
  ['mountain', { isRuin: false, terrainType: TileType.MOUNTAIN },
    [BuildingType.MINE, BuildingType.DEEP_MINE]],
  ['mountain ruin', { terrainType: TileType.MOUNTAIN }, RUIN_BUILDABLE_TYPES],
  ['forest ruin', { terrainType: TileType.FOREST },
    [BuildingType.WOODCUTTER, BuildingType.CHARCOAL_KILN, ...RUIN_BUILDABLE_TYPES]],
  ['stronghold ruin', { isStrongholdRuin: true }, [BuildingType.STRONGHOLD]],
  ['stronghold precedence', { isStrongholdRuin: true, terrainType: TileType.FOREST },
    [BuildingType.STRONGHOLD]],
  ['occupied forest', { isRuin: false, terrainType: TileType.FOREST, buildingId: 'existing' }, []],
  ['occupied mountain', { isRuin: false, terrainType: TileType.MOUNTAIN, buildingId: 'existing' }, []],
  ['occupied forest ruin', { terrainType: TileType.FOREST, buildingId: 'existing' },
    RUIN_BUILDABLE_TYPES],
  ['occupied ruin', { buildingId: 'existing' }, RUIN_BUILDABLE_TYPES],
  ['plain', { isRuin: false }, []],
  ['canyon', { isRuin: false, terrainType: TileType.CANYON }, []],
  ['hidden ruin', { isRevealed: false }, RUIN_BUILDABLE_TYPES],
  ['lava ruin', { isLava: true }, RUIN_BUILDABLE_TYPES],
];

describe('construction preview tile rules', () => {
  it.each(tileCases)('mirrors existing rules for %s without changing legal targets', (_, tile, types) => {
    const state = makeState(tile);
    const before = structuredClone(state);
    const legalOptions = getConstructionOptionsForTile(state, position);
    const targets = getConstructionTargets(state.units.unit, state);
    const conversions = getConversionTargetsForTile(state, position, BuildingType.BARRACKS);
    const options = getConstructionMenuOptionsForTile(state, position);
    expect(options.map((option) => option.buildingType)).toEqual(types);
    expect(options.map(({ buildingUnlocked: _unlocked, buildingUnlockTechId: _tech, ...option }) => option))
      .toEqual(getConstructionOptionsForTile({
        ...state, unlockedBuildings: [...RUIN_BUILDABLE_TYPES, BuildingType.CHARCOAL_KILN, BuildingType.DEEP_MINE],
      }, position));
    for (const option of options) {
      expect(option.cost).toEqual(BUILDING_DEFINITIONS[option.buildingType].constructionCost);
      expect(buildingName(option.buildingType).length).toBeGreaterThan(0);
      expect(option.emoji.length).toBeGreaterThan(0);
      expect(option.buildingUnlockTechId).toBe(getBuildingUnlockTechId(option.buildingType));
      expect(option.buildingUnlocked).toBe(option.buildingUnlockTechId === null);
    }
    expect(getConstructionOptionsForTile(state, position)).toEqual(legalOptions);
    expect(getConstructionTargets(state.units.unit, state)).toEqual(targets);
    expect(getConversionTargetsForTile(state, position, BuildingType.BARRACKS)).toEqual(conversions);
    expect(state).toEqual(before);
  });

  it.each([{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])(
    'returns no options outside the grid at %j', (pos) => {
      const state = makeState();
      expect(getConstructionMenuOptionsForTile(state, pos)).toEqual([]);
      expect(canUnitPreviewConstruction({ ...state.units.unit, position: pos }, state)).toBe(false);
    },
  );

  it('never includes bridge or crystal tower even when unlocked', () => {
    const state = makeState();
    state.unlockedBuildings = Object.values(BuildingType);
    for (const [, tile] of tileCases) {
      Object.assign(state.grid[0][0], tile);
      const types = getConstructionMenuOptionsForTile(state, position).map((o) => o.buildingType);
      expect(types).not.toContain(BuildingType.BRIDGE);
      expect(types).not.toContain(BuildingType.CRYSTAL_TOWER);
    }
  });

  it('returns independent option costs', () => {
    const state = makeState();
    const first = getConstructionMenuOptionsForTile(state, position);
    first[0].cost.wood = -999;
    expect(getConstructionMenuOptionsForTile(state, position)[0].cost)
      .toEqual(BUILDING_DEFINITIONS.BARRACKS.constructionCost);
  });
});

describe('construction menu ordering', () => {
  function orderedTypes(state: GameState) {
    return sortConstructionMenuOptions(
      state, state.units.unit, getConstructionMenuOptionsForTile(state, position),
    ).map((option) => option.buildingType);
  }

  it('puts affordable, unlocked buildings first in fixed tile order without mutation', () => {
    const state = makeState();
    state.unlockedBuildings = [BuildingType.FARM, BuildingType.ARCHER_CAMP];
    const options = getConstructionMenuOptionsForTile(state, position);
    const before = structuredClone(options);
    const expected = [
      BuildingType.ARCHER_CAMP, BuildingType.FARM,
      ...RUIN_BUILDABLE_TYPES.filter((type) => !state.unlockedBuildings.includes(type)),
    ];
    expect(orderedTypes(state)).toEqual(expected);
    expect(sortConstructionMenuOptions(state, state.units.unit, options).map((o) => o.buildingType))
      .toEqual(expected);
    expect(options).toEqual(before);
    state.unlockedBuildings.reverse();
    expect(orderedTypes(state)).toEqual(expected);
  });

  it('updates both groups as resources or research change, including exact costs', () => {
    const state = makeState({ terrainType: TileType.FOREST });
    state.unlockedBuildings = [BuildingType.FARM];
    const options = getConstructionMenuOptionsForTile(state, position);
    const woodcutter = options.find((o) => o.buildingType === BuildingType.WOODCUTTER)!;
    const farm = options.find((o) => o.buildingType === BuildingType.FARM)!;
    woodcutter.cost = { iron: 10, wood: 5 };
    farm.cost = { iron: 0, wood: 10 };
    const types = () => sortConstructionMenuOptions(state, state.units.unit, options).map((o) => o.buildingType);
    const originalTypes = options.map((o) => o.buildingType);
    state.resources = { iron: 0, wood: 10 };
    expect(types()).toEqual([BuildingType.FARM, ...originalTypes.filter((t) => t !== BuildingType.FARM)]);
    state.resources = { iron: 10, wood: 5 };
    expect(types()).toEqual(originalTypes);
    state.resources = { iron: 10, wood: 10 };
    expect(types()).toEqual([
      BuildingType.WOODCUTTER, BuildingType.FARM,
      ...originalTypes.filter((t) => t !== BuildingType.WOODCUTTER && t !== BuildingType.FARM),
    ]);
    state.resources = { iron: 0, wood: 0 };
    expect(types()).toEqual(originalTypes);
    state.resources = { iron: 999, wood: 999 };
    state.unlockedBuildings.push(BuildingType.CHARCOAL_KILN);
    expect(orderedTypes(state).slice(0, 3))
      .toEqual([BuildingType.WOODCUTTER, BuildingType.CHARCOAL_KILN, BuildingType.FARM]);
  });

  it('preserves fixed order when all choices are buildable or none are buildable', () => {
    const state = makeState();
    expect(orderedTypes(state)).toEqual(RUIN_BUILDABLE_TYPES);
    state.unlockedBuildings = [...RUIN_BUILDABLE_TYPES];
    expect(orderedTypes(state)).toEqual(RUIN_BUILDABLE_TYPES);
    state.units.unit.hasMovedThisTurn = true;
    expect(orderedTypes(state)).toEqual(RUIN_BUILDABLE_TYPES);
    expect(sortConstructionMenuOptions(state, state.units.unit, [])).toEqual([]);
  });

  it('keeps Guard previews unavailable until Field Duties is researched', () => {
    const guard = makeUnit(UnitType.GUARD);
    const state = makeState({}, guard);
    state.unlockedBuildings = [BuildingType.FARM];
    expect(orderedTypes(state)).toEqual(RUIN_BUILDABLE_TYPES);
    state.techNodes.CONSCRIPTION.unlocked = true;
    unlockTech(state, 'FIELD_DUTIES');
    expect(orderedTypes(state)).toEqual([
      BuildingType.FARM, ...RUIN_BUILDABLE_TYPES.filter((t) => t !== BuildingType.FARM),
    ]);
  });
});

describe('effect-derived construction unlocks', () => {
  it.each([
    [BuildingType.BARRACKS, 'CONSCRIPTION'],
    [BuildingType.FARM, 'CONSCRIPTION'],
    [BuildingType.CRYSTAL_CHAMBER, 'CONSCRIPTION'],
    [BuildingType.ARCHER_CAMP, 'FAR_REACH'],
    [BuildingType.RIDER_CAMP, 'A_NOBLE_STEAD'],
    [BuildingType.PATRICIANHOUSE, 'A_NOBLE_STEAD'],
    [BuildingType.SIEGE_CAMP, 'SIEGE_WORKS'],
    [BuildingType.CHARCOAL_KILN, 'CHARCOAL_KILN'],
    [BuildingType.DEEP_MINE, 'DEEP_MINING'],
    [BuildingType.BRIDGE, 'BRIDGEBUILDER'],
    [BuildingType.WOODCUTTER, null],
    [BuildingType.MINE, null],
    [BuildingType.STRONGHOLD, null],
  ])('finds the building gate for %s', (type, tech) => {
    expect(getBuildingUnlockTechId(type as BuildingType)).toBe(tech);
  });

  it('only returns an unresearched BUILDANDCAPTURE grant for the requested type', () => {
    const state = makeState();
    expect(getUnitConstructionUnlockTechId(state, UnitType.GUARD)).toBe('FIELD_DUTIES');
    for (const type of Object.values(UnitType).filter((type) => type !== UnitType.GUARD)) {
      expect(getUnitConstructionUnlockTechId(state, type)).toBeNull();
    }
    state.techNodes.FIELD_DUTIES.unlocked = true;
    expect(getUnitConstructionUnlockTechId(state, UnitType.GUARD)).toBeNull();
  });
});

describe('display-only unit eligibility', () => {
  it.each([UnitType.SPEARMAN, UnitType.GUARD])('previews locked ruins with %s without mutating tags', (type) => {
    const unit = makeUnit(type);
    const state = makeState({}, unit);
    state.resources = { iron: 0, wood: 0 };
    const before = structuredClone(state);
    expect(canUnitPreviewConstruction(unit, state)).toBe(true);
    expect(getConstructionTargets(unit, state)).toEqual([]);
    expect(canUnitConstruct(unit)).toBe(type === UnitType.SPEARMAN);
    expect(state).toEqual(before);
  });

  const blockers = [
    'hasMovedThisTurn', 'hasAttackedThisTurn', 'hasConstructedThisTurn',
    'hasCapturedThisTurn', 'hasDestroyedThisTurn', 'hasTradedThisTurn',
  ] as const;
  it.each([UnitType.SPEARMAN, UnitType.GUARD].flatMap((type) => blockers.map((flag) => [type, flag] as const)))(
    'blocks %s after %s exactly like construction', (type, flag) => {
      const unit = makeUnit(type, { [flag]: true });
      const state = makeState({}, unit);
      expect(canUnitPreviewConstruction(unit, state)).toBe(false);
      expect(canUnitConstruct({ ...unit, tags: [...unit.tags, UnitTag.BUILDANDCAPTURE] })).toBe(false);
    },
  );

  it.each([
    { hasUsedPostAttackMoveThisTurn: true }, { preventiveStrikeFiredThisTurn: true },
    { bloodlustAttackAvailable: true }, { spellsCastThisTurn: 99 }, { pinnedUntilTurn: 99 },
  ])('preserves existing non-blocking flags %j', (flags) => {
    const unit = makeUnit(UnitType.SPEARMAN, flags);
    const state = makeState({}, unit);
    expect(canUnitConstruct(unit)).toBe(true);
    expect(canUnitPreviewConstruction(unit, state)).toBe(true);
  });

  it.each([UnitType.SCOUT, UnitType.SIEGE, UnitType.MAGE, UnitType.RIDER])(
    'does not preview %s without a current tag or future grant', (type) => {
      const unit = makeUnit(type, { tags: [] });
      expect(canUnitPreviewConstruction(unit, makeState({}, unit))).toBe(false);
    },
  );

  it('rejects enemy units without changing canUnitConstruct faction semantics', () => {
    const unit = makeUnit(UnitType.SPEARMAN, { faction: Faction.ENEMY });
    expect(canUnitConstruct(unit)).toBe(true);
    expect(canUnitPreviewConstruction(unit, makeState({}, unit))).toBe(false);
  });

  it('requires nonempty tile options even for capable or future-capable units', () => {
    for (const type of [UnitType.SPEARMAN, UnitType.GUARD]) {
      const unit = makeUnit(type);
      expect(canUnitPreviewConstruction(unit, makeState({ isRuin: false }, unit))).toBe(false);
    }
  });

  it('does not offer a researched grant to an untagged unit', () => {
    const unit = makeUnit(UnitType.GUARD);
    const state = makeState({}, unit);
    state.techNodes.FIELD_DUTIES.unlocked = true;
    expect(canUnitPreviewConstruction(unit, state)).toBe(false);
  });
});

describe('lock precedence and live research state', () => {
  it('keeps a researched Guard resource-blocked until it can afford construction', () => {
    let state = makeState({}, makeUnit(UnitType.GUARD));
    state.resources = { iron: 2, wood: 6 };
    state = produce(state, (draft) => {
      unlockTech(draft, 'CONSCRIPTION');
      unlockTech(draft, 'FIELD_DUTIES');
    });
    expect(canUnitConstruct(state.units.unit)).toBe(true);
    expect(canUnitPreviewConstruction(state.units.unit, state)).toBe(true);
    const unlockedOptions = getConstructionMenuOptionsForTile(state, position)
      .filter((option) => option.buildingUnlocked);
    expect(unlockedOptions.map((option) => option.buildingType))
      .toEqual([BuildingType.BARRACKS, BuildingType.FARM, BuildingType.CRYSTAL_CHAMBER]);
    for (const option of unlockedOptions) {
      expect(getConstructionMenuUnlockTechId(state, state.units.unit, option)).toBeNull();
      expect(canConstructAt(state, 'unit', position, option.buildingType)).toBe(false);
    }
    state = produce(state, (draft) => {
      draft.resources.iron += 2;
      constructBuilding(draft, 'unit', position, BuildingType.BARRACKS);
    });
    expect(Object.values(state.buildings).map((building) => building.type)).toEqual([BuildingType.BARRACKS]);
    expect(state.resources).toEqual({ iron: 0, wood: 2 });
    expect(state.units.unit.hasConstructedThisTurn).toBe(true);
  });

  it('uses FIELD_DUTIES before all building locks, then updates after research', () => {
    let state = makeState({}, makeUnit(UnitType.GUARD));
    const oldOptions = getConstructionMenuOptionsForTile(state, position);
    for (const option of oldOptions) {
      expect(getConstructionMenuUnlockTechId(state, state.units.unit, option)).toBe('FIELD_DUTIES');
      expect(canConstructAt(state, 'unit', position, option.buildingType)).toBe(false);
    }
    state = produce(state, (draft) => { unlockTech(draft, 'CONSCRIPTION'); });
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, oldOptions[0])).toBe('FIELD_DUTIES');
    expect(getConstructionTargets(state.units.unit, state)).toEqual([]);
    state = produce(state, (draft) => { unlockTech(draft, 'FIELD_DUTIES'); });
    expect(state.units.unit.tags).toContain(UnitTag.BUILDANDCAPTURE);
    expect(getUnitConstructionUnlockTechId(state, UnitType.GUARD)).toBeNull();
    expect(canUnitConstruct(state.units.unit)).toBe(true);
    expect(canUnitPreviewConstruction(state.units.unit, state)).toBe(true);
    const liveOptions = getConstructionMenuOptionsForTile(state, position);
    expect(liveOptions.filter((option) => option.buildingUnlocked).map((option) => option.buildingType))
      .toEqual([BuildingType.BARRACKS, BuildingType.FARM, BuildingType.CRYSTAL_CHAMBER]);
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, liveOptions[0])).toBeNull();
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, liveOptions[1])).toBe('FAR_REACH');
    expect(canConstructAt(state, 'unit', position, BuildingType.BARRACKS)).toBe(true);
    expect(canConstructAt(state, 'unit', position, BuildingType.ARCHER_CAMP)).toBe(false);
    expect(getConstructionTargets(state.units.unit, state)).toEqual(getRuinBuildingOptions(state));
  });

  it.each([
    [TileType.FOREST, BuildingType.CHARCOAL_KILN, 'A_NOBLE_STEAD', 'CHARCOAL_KILN'],
    [TileType.MOUNTAIN, BuildingType.DEEP_MINE, 'WALLED_SETTLEMENT', 'DEEP_MINING'],
  ])('updates %s alternatives only after research', (terrainType, buildingType, prerequisite, tech) => {
    let state = makeState({ isRuin: false, terrainType });
    const option = getConstructionMenuOptionsForTile(state, position)[1];
    expect(option.buildingUnlocked).toBe(false);
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, option)).toBe(tech);
    expect(canConstructAt(state, 'unit', position, buildingType)).toBe(false);
    state = produce(state, (draft) => {
      unlockTech(draft, 'CONSCRIPTION');
      unlockTech(draft, prerequisite);
      unlockTech(draft, tech);
    });
    const liveOption = getConstructionMenuOptionsForTile(state, position)[1];
    expect(liveOption.buildingUnlocked).toBe(true);
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, liveOption)).toBeNull();
    expect(getConstructionTargets(state.units.unit, state).map((target) => target.buildingType))
      .toContain(buildingType);
    expect(canConstructAt(state, 'unit', position, buildingType)).toBe(true);
  });

  it('keeps basic buildings unlocked while a Guard still requires FIELD_DUTIES', () => {
    const state = makeState({ isStrongholdRuin: true }, makeUnit(UnitType.GUARD));
    const option = getConstructionMenuOptionsForTile(state, position)[0];
    expect(option.buildingUnlocked).toBe(true);
    expect(option.buildingUnlockTechId).toBeNull();
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, option)).toBe('FIELD_DUTIES');
    expect(getConstructionMenuUnlockTechId(state, makeUnit(), option)).toBeNull();
  });

  it('uses actual building unlock state rather than a researched-node-only shortcut', () => {
    const state = makeState();
    state.techNodes.CONSCRIPTION.unlocked = true;
    const option = getConstructionMenuOptionsForTile(state, position)[0];
    expect(option.buildingUnlocked).toBe(false);
    expect(getConstructionMenuUnlockTechId(state, state.units.unit, option)).toBe('CONSCRIPTION');
  });
});

describe('preview legality safety', () => {
  it.each([UnitType.SPEARMAN, UnitType.GUARD])(
    'does not permit %s to construct any locked ruin preview', (type) => {
      const state = makeState({}, makeUnit(type));
      const before = structuredClone(state);
      for (const option of getConstructionMenuOptionsForTile(state, position)) {
        expect(canConstructAt(state, 'unit', position, option.buildingType)).toBe(false);
        expect(() => produce(state, (draft) => {
          constructBuilding(draft, 'unit', position, option.buildingType);
        })).toThrow();
      }
      expect(state).toEqual(before);
      expect(getConstructionTargets(state.units.unit, state)).toEqual([]);
    },
  );

  it('does not legalize unlocked buildings for an unresearched Guard', () => {
    const state = makeState({}, makeUnit(UnitType.GUARD));
    state.unlockedBuildings = [...RUIN_BUILDABLE_TYPES];
    expect(canUnitPreviewConstruction(state.units.unit, state)).toBe(true);
    expect(getConstructionTargets(state.units.unit, state)).toEqual([]);
    for (const option of getConstructionMenuOptionsForTile(state, position)) {
      expect(option.buildingUnlocked).toBe(true);
      expect(canConstructAt(state, 'unit', position, option.buildingType)).toBe(false);
    }
  });

  it('retains resource and same-tile validation for an otherwise legal building', () => {
    const state = makeState();
    state.unlockedBuildings = [BuildingType.BARRACKS];
    expect(canConstructAt(state, 'unit', position, BuildingType.BARRACKS)).toBe(true);
    expect(canConstructAt(state, 'unit', { x: 1, y: 0 }, BuildingType.BARRACKS)).toBe(false);
    state.resources = { iron: 0, wood: 0 };
    expect(canUnitPreviewConstruction(state.units.unit, state)).toBe(true);
    expect(canConstructAt(state, 'unit', position, BuildingType.BARRACKS)).toBe(false);
  });
});
