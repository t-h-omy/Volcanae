import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { ABILITIES, CRYSTAL_CHAMBER_CONFIG, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { advanceLavaWithEvents } from '../lavaSystem';
import { collectResources, recruitUnit } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { useGameStore } from '../gameStore';
import {
  BuildingType,
  Difficulty,
  DestroyBehavior,
  Faction,
  GamePhase,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';

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
    hasCaveMonster: false,
    ...overrides,
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(id: string, faction: Faction, type: UnitType, position: Position): Unit {
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
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
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
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeBuilding(
  id: string,
  type: BuildingType,
  faction: Faction | null,
  position: Position,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction,
    position: { ...position },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
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

function makeState(opts: {
  withMartyr: boolean;
  doomedPlayerUnitPositions: Position[];
  doomedEnemyUnitPositions?: Position[];
  doomedChamberPosition?: Position;
}): GameState {
  const doomedRow = 4;
  const grid = makeGrid();

  const units: Record<string, Unit> = {};
  for (const [i, pos] of opts.doomedPlayerUnitPositions.entries()) {
    const id = `player_${i}`;
    const unit = makeUnit(id, Faction.PLAYER, UnitType.SWORDSMAN, pos);
    units[id] = unit;
    grid[pos.y][pos.x].unitId = id;
  }
  for (const [i, pos] of (opts.doomedEnemyUnitPositions ?? []).entries()) {
    const id = `enemy_${i}`;
    const unit = makeUnit(id, Faction.ENEMY, UnitType.SWORDSMAN, pos);
    units[id] = unit;
    grid[pos.y][pos.x].unitId = id;
  }

  const survivingChamber = makeBuilding('surviving_chamber', BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, { x: 0, y: 0 });
  const survivingCave = makeBuilding('surviving_cave', BuildingType.CRYSTAL_CAVE, Faction.PLAYER, { x: 1, y: 0 });
  const buildings: Record<string, Building> = {
    [survivingChamber.id]: survivingChamber,
    [survivingCave.id]: survivingCave,
  };
  grid[survivingChamber.position.y][survivingChamber.position.x].buildingId = survivingChamber.id;
  grid[survivingCave.position.y][survivingCave.position.x].buildingId = survivingCave.id;

  if (opts.doomedChamberPosition) {
    const doomedChamber = makeBuilding('doomed_chamber', BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, opts.doomedChamberPosition);
    buildings[doomedChamber.id] = doomedChamber;
    grid[doomedChamber.position.y][doomedChamber.position.x].buildingId = doomedChamber.id;
  }

  return {
    turn: 1,
    phase: undefined as unknown as GameState['phase'],
    units,
    buildings,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: opts.withMartyr ? ['spec_16'] : [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: doomedRow + 1,
    turnsUntilLavaAdvance: 0,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    unlockedBuildings: [],
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
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: undefined as unknown as GameState['difficulty'],
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
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    seenHints: [],
  };
}

describe('SP-16m The Martyr (spec_16) — RESONANCE_ON_UNIT_LAVA_DEATH', () => {
  it('keeps distant structures dormant and preserves their previous timers', () => {
    const state = makeState({
      withMartyr: true,
      doomedPlayerUnitPositions: [{ x: 2, y: 4 }, { x: 5, y: 4 }],
      doomedEnemyUnitPositions: [{ x: 7, y: 4 }],
    });
    state.buildings.surviving_chamber.resonanceTurnsRemaining = 2;
    state.buildings.surviving_cave.resonanceTurnsRemaining = 1;

    const { newState, events } = advanceLavaWithEvents(state);
    const resonanceEvents = events.filter((e) => e.type === 'RESONANCE_TRIGGERED');

    expect(resonanceEvents).toHaveLength(1);
    const [event] = resonanceEvents;
    expect(event?.type).toBe('RESONANCE_TRIGGERED');
    if (event?.type !== 'RESONANCE_TRIGGERED') return;
    expect(event.sources.map(({ position }) => position)).toEqual([{ x: 2, y: 4 }, { x: 5, y: 4 }]);
    expect(event.reachedNodes).toEqual([]);
    expect(newState.buildings.surviving_chamber.resonanceTurnsRemaining).toBe(2);
    expect(newState.buildings.surviving_cave.resonanceTurnsRemaining).toBe(1);
  });

  it('does not trigger unit-death resonance when The Martyr is inactive', () => {
    const state = makeState({
      withMartyr: false,
      doomedPlayerUnitPositions: [{ x: 3, y: 4 }],
    });

    const { newState, events } = advanceLavaWithEvents(state);
    const resonanceEvents = events.filter((e) => e.type === 'RESONANCE_TRIGGERED');

    expect(resonanceEvents).toHaveLength(0);
    expect(newState.buildings.surviving_chamber.resonanceTurnsRemaining).toBe(0);
    expect(newState.buildings.surviving_cave.resonanceTurnsRemaining).toBe(0);
  });

  it('keeps chamber-destruction resonance and adds unit-death resonance when both occur', () => {
    const state = makeState({
      withMartyr: true,
      doomedPlayerUnitPositions: [{ x: 2, y: 4 }],
      doomedChamberPosition: { x: 6, y: 4 },
    });

    const { events } = advanceLavaWithEvents(state);
    const resonanceEvents = events.filter((e) => e.type === 'RESONANCE_TRIGGERED');

    expect(resonanceEvents).toHaveLength(1);
    const resonance = resonanceEvents[0];
    expect(resonance?.type).toBe('RESONANCE_TRIGGERED');
    if (resonance?.type !== 'RESONANCE_TRIGGERED') return;
    expect(resonance.sources.map(({ position }) => position)).toEqual([{ x: 2, y: 4 }, { x: 6, y: 4 }]);
  });

  it('flags only surviving chambers within the configured north-row bonus window', () => {
    const state = makeState({
      withMartyr: false,
      doomedPlayerUnitPositions: [],
      doomedChamberPosition: { x: 6, y: 4 },
    });
    state.globalSpecialistStorage = ['spec_18'];

    const nearChamber = makeBuilding(
      'near_chamber',
      BuildingType.CRYSTAL_CHAMBER,
      Faction.PLAYER,
      { x: 3, y: 2 },
    );
    state.buildings[nearChamber.id] = nearChamber;
    state.grid[nearChamber.position.y][nearChamber.position.x].buildingId = nearChamber.id;

    const { newState } = advanceLavaWithEvents(state);

    expect(newState.buildings.near_chamber.resonanceCrystalBonus).toBe(true);
    expect(newState.buildings.surviving_chamber.resonanceCrystalBonus ?? false).toBe(false);
  });

  it('clears resonanceCrystalBonus when a chamber resonance expires', () => {
    const state = makeState({
      withMartyr: false,
      doomedPlayerUnitPositions: [],
    });
    state.buildings.surviving_chamber.resonanceTurnsRemaining = 1;
    state.buildings.surviving_chamber.resonanceCrystalBonus = true;

    const newState = produce(state, (draft) => {
      collectResources(draft);
    });

    expect(newState.buildings.surviving_chamber.resonanceTurnsRemaining).toBe(0);
    expect(newState.buildings.surviving_chamber.resonanceCrystalBonus).toBe(false);
  });

  it('grants Echo Warden bonus crystals in the per-turn production pass', () => {
    const state = makeState({
      withMartyr: false,
      doomedPlayerUnitPositions: [],
    });
    state.globalSpecialistStorage = ['spec_18'];
    state.arcaneCrystals = 0;
    state.buildings.surviving_chamber.resonanceTurnsRemaining = 2;
    state.buildings.surviving_chamber.resonanceCrystalBonus = true;
    const stronghold = makeBuilding(
      'player_stronghold',
      BuildingType.STRONGHOLD,
      Faction.PLAYER,
      { x: 3, y: 11 },
    );
    state.buildings[stronghold.id] = stronghold;
    state.grid[stronghold.position.y][stronghold.position.x].buildingId = stronghold.id;
    state.phase = GamePhase.PLAYER_TURN;
    state.difficulty = Difficulty.STANDARD;
    state.turnsUntilLavaAdvance = 5;

    useGameStore.setState(state);
    useGameStore.getState().endPlayerTurn();
    const next = useGameStore.getState();

    expect(next.arcaneCrystals).toBe(
      CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN + ABILITIES.RESONANCE_BONUS_CRYSTALS,
    );
  });

  it('does not grant Echo Warden bonus crystals from disabled Crystal Chambers', () => {
    const state = makeState({
      withMartyr: false,
      doomedPlayerUnitPositions: [],
    });
    state.globalSpecialistStorage = ['spec_18'];
    state.arcaneCrystals = 0;
    state.buildings.surviving_chamber.resonanceTurnsRemaining = 2;
    state.buildings.surviving_chamber.resonanceCrystalBonus = true;
    state.buildings.surviving_chamber.isDisabledForTurns = 1;
    const stronghold = makeBuilding(
      'player_stronghold_disabled_bonus',
      BuildingType.STRONGHOLD,
      Faction.PLAYER,
      { x: 3, y: 11 },
    );
    state.buildings[stronghold.id] = stronghold;
    state.grid[stronghold.position.y][stronghold.position.x].buildingId = stronghold.id;
    state.phase = GamePhase.PLAYER_TURN;
    state.difficulty = Difficulty.STANDARD;
    state.turnsUntilLavaAdvance = 5;

    useGameStore.setState(state);
    useGameStore.getState().endPlayerTurn();
    const next = useGameStore.getState();

    expect(next.arcaneCrystals).toBe(0);
  });

  it('activates only reached structures and relays through the reached Chamber to a Cave', () => {
    const state = makeState({
      withMartyr: false,
      doomedPlayerUnitPositions: [],
      doomedChamberPosition: { x: 0, y: 4 },
    });
    state.grid[0][0].buildingId = null;
    state.grid[0][1].buildingId = null;
    state.buildings.surviving_chamber.position = { x: 8, y: 20 };
    state.buildings.surviving_cave.position = { x: 8, y: 24 };
    state.grid[20][8].buildingId = 'surviving_chamber';
    state.grid[24][8].buildingId = 'surviving_cave';
    const relay = makeBuilding(
      'relay_chamber',
      BuildingType.CRYSTAL_CHAMBER,
      Faction.PLAYER,
      { x: 1, y: 1 },
      { resonanceTurnsRemaining: 1 },
    );
    const linkedCave = makeBuilding(
      'linked_cave',
      BuildingType.CRYSTAL_CAVE,
      Faction.PLAYER,
      { x: 4, y: 1 },
    );
    const isolatedCave = makeBuilding(
      'isolated_cave',
      BuildingType.CRYSTAL_CAVE,
      Faction.PLAYER,
      { x: 8, y: 1 },
      { resonanceTurnsRemaining: 2 },
    );
    for (const building of [relay, linkedCave, isolatedCave]) {
      state.buildings[building.id] = building;
      state.grid[building.position.y][building.position.x].buildingId = building.id;
    }

    const { newState, events } = advanceLavaWithEvents(state);
    const resonanceEvent = events.find((event) => event.type === 'RESONANCE_TRIGGERED');

    expect(resonanceEvent?.type).toBe('RESONANCE_TRIGGERED');
    if (resonanceEvent?.type !== 'RESONANCE_TRIGGERED') return;
    expect(resonanceEvent.reachedNodes.map(({ buildingId, hopDepth }) => [buildingId, hopDepth])).toEqual([
      ['relay_chamber', 1],
      ['linked_cave', 2],
    ]);
    expect(resonanceEvent.reachedNodes[0]?.wasResonating).toBe(true);
    expect(newState.buildings.relay_chamber.resonanceTurnsRemaining).toBe(CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION);
    expect(newState.buildings.linked_cave.resonanceTurnsRemaining).toBe(CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION);
    expect(newState.buildings.isolated_cave.resonanceTurnsRemaining).toBe(2);
    expect(newState.buildings.surviving_chamber.resonanceTurnsRemaining).toBe(0);
    expect(newState.buildings.surviving_cave.resonanceTurnsRemaining).toBe(0);
    expect(newState.buildings.doomed_chamber).toBeUndefined();
    expect(resonanceEvent.reachedNodes.some(({ buildingId }) => buildingId === 'doomed_chamber')).toBe(false);
  });

  it('unions simultaneous Martyr deaths, deduplicating shared recipients with stable parents', () => {
    const state = makeState({
      withMartyr: true,
      doomedPlayerUnitPositions: [{ x: 2, y: 4 }, { x: 8, y: 4 }],
    });
    delete state.buildings.surviving_chamber;
    delete state.buildings.surviving_cave;
    state.grid[0][0].buildingId = null;
    state.grid[0][1].buildingId = null;
    for (const building of [
      makeBuilding('left_chamber', BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, { x: 2, y: 1 }),
      makeBuilding('shared_cave', BuildingType.CRYSTAL_CAVE, Faction.PLAYER, { x: 5, y: 1 }),
      makeBuilding('right_chamber', BuildingType.CRYSTAL_CHAMBER, Faction.PLAYER, { x: 8, y: 1 }),
    ]) {
      state.buildings[building.id] = building;
      state.grid[building.position.y][building.position.x].buildingId = building.id;
    }

    const { newState, events } = advanceLavaWithEvents(state);
    const resonanceEvent = events.find((event) => event.type === 'RESONANCE_TRIGGERED');

    expect(resonanceEvent?.type).toBe('RESONANCE_TRIGGERED');
    if (resonanceEvent?.type !== 'RESONANCE_TRIGGERED') return;
    expect(resonanceEvent.sources.map(({ position }) => position)).toEqual([{ x: 2, y: 4 }, { x: 8, y: 4 }]);
    expect(resonanceEvent.reachedNodes.map(({ buildingId }) => buildingId)).toEqual([
      'left_chamber', 'shared_cave', 'right_chamber',
    ]);
    expect(resonanceEvent.reachedNodes.filter(({ buildingId }) => buildingId === 'shared_cave')).toHaveLength(1);
    expect(resonanceEvent.reachedNodes.find(({ buildingId }) => buildingId === 'shared_cave')).toMatchObject({
      sourceId: 'martyr:player_0',
      parentBuildingId: null,
      hopDepth: 1,
    });
    expect(newState.buildings.shared_cave.resonanceTurnsRemaining).toBe(CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION);
  });

  it('requires each individual Crystal Cave to be resonating before Drake recruitment', () => {
    const state = makeState({ withMartyr: false, doomedPlayerUnitPositions: [] });
    state.arcaneCrystals = 10;
    state.buildings.surviving_chamber.resonanceTurnsRemaining = CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION;

    const isolated = produce(state, (draft) => {
      recruitUnit(draft, 'surviving_cave', UnitType.CRYSTAL_DRAKE);
    });
    expect(Object.values(isolated.units)).toHaveLength(0);
    expect(isolated.arcaneCrystals).toBe(10);

    const resonatingCave = produce(state, (draft) => {
      draft.buildings.surviving_cave.resonanceTurnsRemaining = 1;
    });
    const active = produce(resonatingCave, (draft) => {
      recruitUnit(draft, 'surviving_cave', UnitType.CRYSTAL_DRAKE);
    });
    expect(Object.values(active.units).some((unit) => unit.type === UnitType.CRYSTAL_DRAKE)).toBe(true);
    expect(active.arcaneCrystals).toBeLessThan(10);
  });
});
