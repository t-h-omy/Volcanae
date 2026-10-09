import { afterEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BUILDING_DEFINITIONS, MAP, MAGE, SPELL_DEFINITIONS, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { CRYSTAL_LIGHTNING_RESEARCH_COST, computeResearchCost } from '../../config/tech';
import { calculateCrystalLightningDamage } from '../combatSystem';
import type { GameEvent } from '../gameEvents';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';
import { generateInitialGameState } from '../mapGenerator';
import { castSpell, getValidSpellTargets } from '../spellSystem';
import { isTileWithinEdgeCircleRange } from '../rangeUtils';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  SpellId,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';

let idCounter = 0;

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  overrides: Partial<Unit> = {},
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `crystal-lightning-unit-${++idCounter}`,
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: definition.maxHp,
      currentHp: definition.maxHp,
      attack: definition.attack,
      defense: definition.defense,
      moveRange: definition.moveRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
      attackRange: definition.attackRange,
    },
    tags: [...definition.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    ...overrides,
  };
}

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

function makeBuilding(
  type: BuildingType,
  position: Position,
  faction: Faction | null = Faction.PLAYER,
  resonanceTurnsRemaining = 0,
): Building {
  const definition = BUILDING_DEFINITIONS[type];
  return {
    id: `crystal-lightning-building-${++idCounter}`,
    type,
    faction,
    position: { ...position },
    hp: definition.maxHp ?? 100,
    maxHp: definition.maxHp ?? 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: definition.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: definition.combatStats ? { ...definition.combatStats } : null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: definition.destroyBehavior ?? DestroyBehavior.NONE,
    resonanceTurnsRemaining,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(units: Unit[], buildings: Building[] = []): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  const buildingMap = Object.fromEntries(buildings.map((building) => [building.id, building]));
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) grid[building.position.y][building.position.x].buildingId = building.id;
  return {
    turn: 1,
    phase: 'PLAYER_TURN',
    grid,
    units: unitMap,
    buildings: buildingMap,
    specialists: {},
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 10,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    techNodes: {},
    techFlags: [],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [SpellId.CRYSTAL_LIGHTNING],
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
    lavaFrontRow: 80,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'STANDARD',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
  } as unknown as GameState;
}

function castWithEvents(
  state: GameState,
  mageId: string,
  target: Position,
): { state: GameState; events: GameEvent[]; success: boolean } {
  const events: GameEvent[] = [];
  let success = false;
  const nextState = produce(state, (draft) => {
    success = castSpell(draft, mageId, SpellId.CRYSTAL_LIGHTNING, target, events);
  });
  return { state: nextState, events, success };
}

function createStoreScenario(chamber: Building, mage: Unit, enemy?: Unit): GameState {
  const state = generateInitialGameState();
  state.units = { [mage.id]: mage, ...(enemy ? { [enemy.id]: enemy } : {}) };
  state.buildings = { [chamber.id]: chamber };
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
    }
  }
  state.grid[mage.position.y][mage.position.x].unitId = mage.id;
  if (enemy) state.grid[enemy.position.y][enemy.position.x].unitId = enemy.id;
  state.grid[chamber.position.y][chamber.position.x].buildingId = chamber.id;
  state.unlockedSpells = [SpellId.CRYSTAL_LIGHTNING];
  state.arcaneCrystals = 5;
  state.pendingSpellCast = { mageId: mage.id, spellId: SpellId.CRYSTAL_LIGHTNING };
  return state;
}

afterEach(() => {
  useAnimationStore.getState().clear();
});

describe('Crystal Lightning tech and target validation', () => {
  it('is a 7-crystal child of Crystal Khyron that unlocks the spell', () => {
    const node = TECH_TREE.find((tech) => tech.id === 'CRYSTAL_LIGHTNING');
    expect(node?.requires).toEqual(['CRYSTAL_KHYRON']);
    expect(node?.cost).toBe(CRYSTAL_LIGHTNING_RESEARCH_COST);
    expect(computeResearchCost(node!.cost!, 0)).toBe(7);
    expect(node?.effects).toEqual([{ type: 'UNLOCK_SPELL', spellId: SpellId.CRYSTAL_LIGHTNING }]);
    expect(MAGE.CRYSTAL_LIGHTNING_ATTACK_POWER).toBe(20);
    expect(SPELL_DEFINITIONS[SpellId.CRYSTAL_LIGHTNING].textParams).toEqual({ attackPower: 20 });
  });

  it('accepts only player-owned Crystal Chambers in Mage range', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const playerChamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 6, y: 5 });
    const enemyChamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 6 }, Faction.ENEMY, 2);
    const otherBuilding = makeBuilding(BuildingType.WATCHTOWER, { x: 5, y: 4 });
    const distantChamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 8, y: 5 });
    const state = makeState([mage], [playerChamber, enemyChamber, otherBuilding, distantChamber]);

    expect(getValidSpellTargets(state, mage.id, SpellId.CRYSTAL_LIGHTNING)).toEqual([playerChamber.position]);
    expect(isTileWithinEdgeCircleRange(5, 5, playerChamber.position.x, playerChamber.position.y, mage.stats.attackRange)).toBe(true);
  });

  it('does not spend crystals or Mage action for an invalid target', () => {
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 6, y: 5 });
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    useGameStore.setState(createStoreScenario(chamber, mage));

    useGameStore.getState().castSpell({ x: 7, y: 5 });
    const state = useGameStore.getState();

    expect(state.arcaneCrystals).toBe(5);
    expect(state.units[mage.id].spellsCastThisTurn).toBe(0);
    expect(state.pendingSpellCast).toEqual({ mageId: mage.id, spellId: SpellId.CRYSTAL_LIGHTNING });
    expect(useAnimationStore.getState().eventQueue).toEqual([]);
  });

  it('commits a valid cast to the queue without showing damage before the volley', () => {
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 6, y: 5 });
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 4 }, Faction.ENEMY);
    useGameStore.setState(createStoreScenario(chamber, mage, enemy));

    useGameStore.getState().castSpell(chamber.position);
    const live = useGameStore.getState();
    const animation = useAnimationStore.getState();

    expect(live.arcaneCrystals).toBe(5 - MAGE.SPELL_CAST_CRYSTAL_COST);
    expect(live.units[mage.id].spellsCastThisTurn).toBe(1);
    expect(live.units[enemy.id].stats.currentHp).toBe(enemy.stats.currentHp);
    expect(animation.eventQueue[0]?.type).toBe('CRYSTAL_LIGHTNING_ENEMY_VOLLEY');
    expect(animation.resolvedState?.units[enemy.id].stats.currentHp).toBeLessThan(enemy.stats.currentHp);
  });
});

describe('Crystal Lightning volleys and chaining', () => {
  it('fires an inactive initial Chamber volley without chaining', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 6 });
    const first = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 }, Faction.PLAYER, 0);
    const next = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 7, y: 5 }, Faction.PLAYER, 2);
    const firstEnemy = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 4 }, Faction.ENEMY);
    const nextOnlyEnemy = makeUnit(UnitType.LAVA_GRUNT, { x: 8, y: 6 }, Faction.ENEMY);
    const state = makeState([mage, firstEnemy, nextOnlyEnemy], [first, next]);
    const result = castWithEvents(state, mage.id, first.position);

    expect(result.success).toBe(true);
    expect(result.state.units[firstEnemy.id].stats.currentHp).toBeLessThan(firstEnemy.stats.currentHp);
    expect(result.state.units[nextOnlyEnemy.id].stats.currentHp).toBe(nextOnlyEnemy.stats.currentHp);
    expect(result.events.filter((event) => event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY')).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY')).toBe(false);
  });

  it('chains only through resonating player Chambers in visibility radius', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const first = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 }, Faction.PLAYER, 2);
    const second = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 7, y: 5 }, Faction.PLAYER, 1);
    const inactive = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 7 }, Faction.PLAYER, 0);
    const enemy = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 3 }, Faction.ENEMY, 3);
    const remote = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 0, y: 5 }, Faction.PLAYER, 3);
    const state = makeState([mage], [first, second, inactive, enemy, remote]);
    const result = castWithEvents(state, mage.id, first.position);
    const volleys = result.events.filter((event) => event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY');
    const links = result.events.filter((event) => event.type === 'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY');

    expect(volleys.map((event) => event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' && event.chamberId))
      .toEqual([first.id, second.id]);
    expect(links).toHaveLength(1);
    expect(links[0]?.type === 'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY' && links[0].links.map((link) => link.toChamberId))
      .toEqual([second.id]);
  });

  it('recursively traverses a cyclic network and activates each Chamber only once', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const chambers = [
      makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 }, Faction.PLAYER, 2),
      makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 7, y: 5 }, Faction.PLAYER, 2),
      makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 7, y: 7 }, Faction.PLAYER, 2),
      makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 7 }, Faction.PLAYER, 2),
    ];
    const result = castWithEvents(makeState([mage], chambers), mage.id, chambers[0].position);
    const volleys = result.events.filter((event) => event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY');
    const links = result.events.flatMap((event) =>
      event.type === 'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY' ? event.links : []);

    expect(volleys).toHaveLength(4);
    expect(new Set(volleys.flatMap((event) =>
      event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' ? [event.chamberId] : []),
    ).size).toBe(4);
    expect(links).toHaveLength(3);
    expect(new Set(links.map((link) => link.toChamberId)).size).toBe(3);
  });

  it('allows one enemy to be hit once by each participating Chamber', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 6 });
    const first = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 }, Faction.PLAYER, 2);
    const second = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 7, y: 5 }, Faction.PLAYER, 1);
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 4 }, Faction.ENEMY);
    const result = castWithEvents(makeState([mage, enemy], [first, second]), mage.id, first.position);
    const hits = result.events.flatMap((event) =>
      event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' ? event.hits.filter((hit) => hit.unitId === enemy.id) : []);

    expect(hits).toHaveLength(2);
    expect(result.state.units[enemy.id].stats.currentHp).toBe(enemy.stats.currentHp - hits[0].damage - hits[1].damage);
  });

  it('ignores enemy buildings and groups all targets of a Chamber into one parallel volley', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 6 });
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 });
    const enemyA = makeUnit(UnitType.LAVA_GRUNT, { x: 4, y: 4 }, Faction.ENEMY);
    const enemyB = makeUnit(UnitType.LAVA_ARCHER, { x: 6, y: 4 }, Faction.ENEMY);
    const enemyBuilding = makeBuilding(BuildingType.LAVALAIR, { x: 5, y: 4 }, Faction.ENEMY);
    const result = castWithEvents(makeState([mage, enemyA, enemyB], [chamber, enemyBuilding]), mage.id, chamber.position);
    const volleys = result.events.filter((event) => event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY');

    expect(volleys).toHaveLength(1);
    expect(volleys[0]?.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' && volleys[0].hits.map((hit) => hit.unitId))
      .toEqual([enemyA.id, enemyB.id]);
    expect(result.state.gameStats.enemyBuildingsDestroyed).toBe(0);
    expect(result.state.buildings[enemyBuilding.id]).toBeDefined();
  });

  it('uses the normal combat formula with 20 attack power and no second counterattack', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 6 });
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 });
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 4 }, Faction.ENEMY);
    enemy.stats.defense = 20;
    const state = makeState([mage, enemy], [chamber]);
    const damage = calculateCrystalLightningDamage(state, enemy, MAGE.CRYSTAL_LIGHTNING_ATTACK_POWER);
    const result = castWithEvents(state, mage.id, chamber.position);
    const hit = result.events.find((event) => event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY');

    expect(damage).toBe(10);
    expect(hit?.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' && hit.hits[0].damage).toBe(10);
    expect(result.state.units[mage.id].stats.currentHp).toBe(mage.stats.currentHp);
  });

  it('credits kills and XP to the casting Mage and preserves Cave Monster rewards', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 6 });
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 });
    const grunt = makeUnit(UnitType.LAVA_GRUNT, { x: 4, y: 4 }, Faction.ENEMY);
    grunt.stats.currentHp = 1;
    const caveMonster = makeUnit(UnitType.CAVE_MONSTER, { x: 6, y: 4 }, Faction.ENEMY);
    caveMonster.stats.currentHp = 1;
    const initial = makeState([mage, grunt, caveMonster], [chamber]);
    initial.activeCaveEncounters = [{ monsterId: caveMonster.id }] as GameState['activeCaveEncounters'];
    const result = castWithEvents(initial, mage.id, chamber.position);

    expect(result.state.units[grunt.id]).toBeUndefined();
    expect(result.state.units[caveMonster.id]).toBeUndefined();
    expect(result.state.units[mage.id].xp).toBe(2);
    expect(result.state.gameStats.unitsKilled).toBe(2);
    expect(result.events.findIndex((event) => event.type === 'UNIT_DEATH' && event.unitId === caveMonster.id))
      .toBeLessThan(result.events.findIndex((event) => event.type === 'CAVE_MONSTER_KILLED' && event.monsterId === caveMonster.id));
    expect(result.state.activeCaveEncounters).toEqual([]);
  });

  it('orders each parallel enemy volley before its Chamber links and the next wave', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const first = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 5, y: 5 }, Faction.PLAYER, 2);
    const second = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 7, y: 5 }, Faction.PLAYER, 2);
    const third = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 8, y: 5 }, Faction.PLAYER, 1);
    const enemies = [
      makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 4 }, Faction.ENEMY),
      makeUnit(UnitType.LAVA_ARCHER, { x: 4, y: 4 }, Faction.ENEMY),
    ];
    const result = castWithEvents(makeState([mage, ...enemies], [first, second, third]), mage.id, first.position);
    const volleyEvents = result.events.filter((event) =>
      event.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' || event.type === 'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY');

    expect(volleyEvents.map((event) => event.type)).toEqual([
      'CRYSTAL_LIGHTNING_ENEMY_VOLLEY',
      'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY',
      'CRYSTAL_LIGHTNING_ENEMY_VOLLEY',
      'CRYSTAL_LIGHTNING_CHAMBER_VOLLEY',
      'CRYSTAL_LIGHTNING_ENEMY_VOLLEY',
    ]);
    const firstEnemyVolley = volleyEvents[0];
    expect(firstEnemyVolley?.type === 'CRYSTAL_LIGHTNING_ENEMY_VOLLEY' ? firstEnemyVolley.hits : undefined)
      .toHaveLength(2);
  });
});
