import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { BUILDING_DEFINITIONS, MAP, POPULATION, TRAINING, UNIT_DEFINITIONS } from '../gameConfig';
import {
  areOvercapacityTagsInSync,
  computeHomelessUnitIds,
  computeUntrainedUnitIds,
  syncOvercapacityTags,
} from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { applyTagStatEffects } from '../techSystem';
import { BuildingType, DestroyBehavior, Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Unit } from '../types';

function makeUnit(id: string, position: Position, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SWORDSMAN];
  return {
    id, type: UnitType.SWORDSMAN, faction: Faction.PLAYER, position: { ...position },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0, movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags], hasMovedThisTurn: false, hasAttackedThisTurn: false,
    hasCapturedThisTurn: false, hasTradedThisTurn: false, hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false, hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false, xp: 0, level: 1, pinnedUntilTurn: 0,
    distractionDefPenalty: 0, lastMovedTurn: 0,
    ...overrides,
  };
}

function makeBuilding(id: string, type: BuildingType, position: Position): Building {
  const def = BUILDING_DEFINITIONS[type];
  return {
    id, type, faction: Faction.PLAYER, position: { ...position }, hp: def.maxHp!, maxHp: def.maxHp!,
    specialistSlot: null, isDisabledForTurns: 0, wasAttackedLastEnemyTurn: false,
    captureProgress: 0, isBeingCapturedBy: null, discoverRadius: def.discoverRadius,
    turnCapturedByPlayer: null, wasEnemyOwnedBeforeCapture: false, combatStats: null,
    hasAttackedThisTurn: false, tags: [], consumesUnitOnCapture: false,
    populationCount: type === BuildingType.STRONGHOLD ? POPULATION.STRONGHOLD_FARMER_CAP : 0,
    populationCap: type === BuildingType.STRONGHOLD ? POPULATION.STRONGHOLD_FARMER_CAP : 0,
    populationGrowthCounter: 0,
    strongholdNobles: type === BuildingType.STRONGHOLD ? POPULATION.STRONGHOLD_NOBLE_CAP : 0,
    emberSpawnCounter: 0, recruitmentQueue: null, destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0, spawnCooldownRemaining: 0, lastRecruitmentTurn: 0,
  };
}

const barracksCount = 2;
const trainingLimit = BUILDING_DEFINITIONS.BARRACKS.unitLimit! * barracksCount;

function makeState(count = trainingLimit + 1): GameState {
  const units = Array.from({ length: count }, (_, index) =>
    makeUnit(`swordsman-${index}`, {
      x: index % MAP.GRID_WIDTH,
      y: MAP.GRID_HEIGHT - 3 - Math.floor(index / MAP.GRID_WIDTH),
    }),
  );
  const farmerCost = UNIT_DEFINITIONS.SWORDSMAN.populationCost.farmers;
  const strongholds = Array.from({
    length: Math.max(1, Math.ceil(count * farmerCost / POPULATION.STRONGHOLD_FARMER_CAP)),
  }, (_, index) => makeBuilding(`stronghold-${index}`, BuildingType.STRONGHOLD, {
    x: index, y: MAP.GRID_HEIGHT - 2,
  }));
  const buildings = [
    ...strongholds,
    ...Array.from({ length: barracksCount }, (_, index) =>
      makeBuilding(`barracks-${index}`, BuildingType.BARRACKS, {
        x: index, y: MAP.GRID_HEIGHT - 1,
      }),
    ),
  ];
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y }, isRevealed: true, buildingId: null as string | null,
      unitId: null as string | null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    })),
  );
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) grid[building.position.y][building.position.x].buildingId = building.id;
  return {
    ...useGameStore.getInitialState(), turn: 1, phase: GamePhase.PLAYER_TURN,
    grid, units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    buildings: Object.fromEntries(buildings.map((building) => [building.id, building])),
    specialists: createInitialSpecialists(), globalSpecialistStorage: [],
    techFlags: [], resources: { ...BUILDING_DEFINITIONS.OUTPOST.constructionCost },
    lavaFrontRow: MAP.GRID_HEIGHT,
    selectedUnitId: null, selectedBuildingId: null, selectedTilePos: null,
  };
}

function synced(state: GameState): GameState {
  return produce(state, syncOvercapacityTags);
}

function expectTrained(state: GameState, ids: string[]) {
  for (const id of ids) {
    expect(state.units[id].tags).not.toContain(UnitTag.UNTRAINED);
    expect(state.units[id].stats.attack).toBe(UNIT_DEFINITIONS.SWORDSMAN.attack);
  }
  expect(areOvercapacityTagsInSync(state)).toBe(true);
}

describe('overcapacity tag synchronization at store boundaries', () => {
  beforeEach(() => {
    useAnimationStore.getState().clear();
    useHintStore.getState().reset();
    useHintOptionsStore.setState({ hintsEnabled: false, globalShowCounts: {} });
  });

  it('removes untrained penalties after an animated counter-kill and resolved-state commit', () => {
    const live = makeState();
    const attacker = live.units['swordsman-0'];
    attacker.stats.currentHp = 1;
    const enemy = makeUnit('enemy', {
      x: attacker.position.x, y: attacker.position.y - 1,
    }, { faction: Faction.ENEMY, tags: [] });
    enemy.stats.attack = attacker.stats.maxHp * 2;
    enemy.stats.maxHp = attacker.stats.maxHp * 2;
    enemy.stats.currentHp = enemy.stats.maxHp;
    live.units[enemy.id] = enemy;
    live.grid[enemy.position.y][enemy.position.x].unitId = enemy.id;
    useGameStore.setState(synced(live));
    const survivors = Object.keys(live.units).filter((id) => id !== attacker.id && id !== enemy.id);
    for (const id of survivors) {
      expect(useGameStore.getState().units[id].tags).toContain(UnitTag.UNTRAINED);
      expect(useGameStore.getState().units[id].stats.attack)
        .toBe(UNIT_DEFINITIONS.SWORDSMAN.attack - TRAINING.UNTRAINED_ATK_PENALTY);
    }

    useGameStore.getState().attackUnit(attacker.id, enemy.id);
    const animation = useAnimationStore.getState();
    expect(useGameStore.getState().phase).toBe(GamePhase.ENEMY_TURN);
    expect(animation.eventQueue.some((event) => event.type === 'PLAYER_ATTACK')).toBe(true);
    expect(animation.resolvedState).not.toBeNull();
    expect(animation.resolvedState!.units[attacker.id]).toBeUndefined();
    expect(animation.resolvedState!.units[enemy.id]).toBeDefined();
    expect(useGameStore.getState().units[attacker.id]).toBeDefined();
    useGameStore.getState().setGameState(animation.resolvedState!);

    expect(useGameStore.getState().units[attacker.id]).toBeUndefined();
    expectTrained(useGameStore.getState(), survivors);
  });

  it('repairs stale loaded tags and stats in both directions without applying effects twice', () => {
    const missingTags = makeState();
    useGameStore.getState().setGameState(missingTags);
    for (const unit of Object.values(useGameStore.getState().units)) {
      expect(unit.tags).toContain(UnitTag.UNTRAINED);
      expect(unit.stats.attack).toBe(UNIT_DEFINITIONS.SWORDSMAN.attack - TRAINING.UNTRAINED_ATK_PENALTY);
    }
    expect(areOvercapacityTagsInSync(useGameStore.getState())).toBe(true);
    useGameStore.getState().setGameState(useGameStore.getState());
    expect(useGameStore.getState().units['swordsman-0'].stats.attack)
      .toBe(UNIT_DEFINITIONS.SWORDSMAN.attack - TRAINING.UNTRAINED_ATK_PENALTY);

    const extraTags = makeState(trainingLimit);
    for (const unit of Object.values(extraTags.units)) {
      for (const tag of [UnitTag.UNTRAINED, UnitTag.HOMELESS]) {
        unit.tags.push(tag);
        applyTagStatEffects(unit, tag);
      }
    }
    useGameStore.getState().setGameState(extraTags);
    expectTrained(useGameStore.getState(), Object.keys(extraTags.units));
    for (const unit of Object.values(useGameStore.getState().units)) {
      expect(unit.tags).not.toContain(UnitTag.HOMELESS);
      expect(unit.stats.defense).toBe(UNIT_DEFINITIONS.SWORDSMAN.defense);
    }
  });

  it('immediately restores trained stats when fieldwork consumes a counted unit', () => {
    const live = makeState();
    const worker = live.units['swordsman-0'];
    worker.tags.push(UnitTag.FIELDWORK);
    useGameStore.setState(synced(live));
    const survivors = Object.keys(live.units).filter((id) => id !== worker.id);
    useGameStore.getState().fieldworkUnit(worker.id);
    const after = useGameStore.getState();
    expect(after.units[worker.id]).toBeUndefined();
    expect(after.grid[worker.position.y][worker.position.x].unitId).toBeNull();
    expect(Object.values(after.buildings).some((building) =>
      building.type === BuildingType.OUTPOST &&
      building.position.x === worker.position.x && building.position.y === worker.position.y,
    )).toBe(true);
    expectTrained(after, survivors);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('preserves units, unit and stats identity when selecting an already synchronized state', () => {
    useGameStore.setState(synced(makeState()));
    const before = useGameStore.getState();
    const unit = before.units['swordsman-0'];
    expect(areOvercapacityTagsInSync(before)).toBe(true);
    useGameStore.getState().selectUnit(unit.id);
    const after = useGameStore.getState();
    expect(after.selectedUnitId).toBe(unit.id);
    expect(after.units).toBe(before.units);
    expect(after.units[unit.id]).toBe(unit);
    expect(after.units[unit.id].stats).toBe(unit.stats);
  });

  it('detects stale homeless and untrained tags without mutating synchronized or stale states', () => {
    const valid = synced(makeState());
    expect(computeHomelessUnitIds(valid).size).toBe(0);
    expect(computeUntrainedUnitIds(valid).size).toBe(Object.keys(valid.units).length);
    expect(areOvercapacityTagsInSync(valid)).toBe(true);
    for (const tag of [UnitTag.HOMELESS, UnitTag.UNTRAINED]) {
      const stale = produce(valid, (draft) => {
        const unit = draft.units['swordsman-0'];
        if (unit.tags.includes(tag)) unit.tags = unit.tags.filter((entry) => entry !== tag);
        else unit.tags.push(tag);
      });
      const before = JSON.stringify(stale);
      expect(areOvercapacityTagsInSync(stale)).toBe(false);
      expect(JSON.stringify(stale)).toBe(before);
    }
    const missingHomeless = makeState(1);
    missingHomeless.buildings = {};
    expect(computeHomelessUnitIds(missingHomeless).has('swordsman-0')).toBe(true);
    expect(areOvercapacityTagsInSync(missingHomeless)).toBe(false);
    expect(areOvercapacityTagsInSync(synced(missingHomeless))).toBe(true);
  });
});
