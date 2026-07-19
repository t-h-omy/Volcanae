import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  ABILITIES,
  CORRUPTED_SUPPRESSED_TAGS,
  MAP,
  UNIT_DEFINITIONS,
} from '../gameConfig';
import {
  calculateCombatFromStats,
  getBatteryAttackBonus,
  resolveAttack,
  resolveAttackOnBuilding,
  unitToCombatant,
} from '../combatSystem';
import { recruitUnit } from '../resourceSystem';
import { applySpecialistEffects, createInitialSpecialists } from '../specialistSystem';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, GameStats, Tile, Unit } from '../types';

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

function makeGameStats(): GameStats {
  return {
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
  };
}

function makeUnit(
  id: string,
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  tags: UnitTag[] = [],
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id,
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
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags, ...tags],
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
  id: string,
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction,
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
  } as Building;
}

function makeState(units: Unit[], buildings: Building[] = []): GameState {
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
    phase: undefined as unknown as GameState['phase'],
    units: unitMap,
    buildings: buildingMap,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 99, wood: 99 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 3,
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
    gameStats: makeGameStats(),
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: undefined as unknown as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    activeCaveEncounters: [],
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    pendingBridgeBuilderId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
    seenHints: [],
  };
}

describe('SP-17s Bombardier (spec_17) — BATTERY', () => {
  it('grants BATTERY to existing and newly recruited player Siege units', () => {
    const existingSiege = makeUnit('siege_existing', UnitType.SIEGE, Faction.PLAYER, 1, 1);
    const state = produce(makeState([existingSiege]), (draft) => {
      draft.globalSpecialistStorage.push('spec_17');
      applySpecialistEffects(draft);
    });

    expect(state.units[existingSiege.id].tags).toContain(UnitTag.BATTERY);

    const siegeCamp = makeBuilding('siege_camp', BuildingType.SIEGE_CAMP, Faction.PLAYER, 4, 4);
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, 0, 0, {
      populationCount: 1,
      strongholdNobles: 1,
    });
    const recruitState = makeState([], [siegeCamp, stronghold]);
    recruitState.globalSpecialistStorage = ['spec_17'];
    recruitState.unlockedUnits = [UnitType.SIEGE];

    recruitUnit(recruitState, siegeCamp.id, UnitType.SIEGE);

    const recruited = Object.values(recruitState.units)[0];
    expect(recruited).toBeDefined();
    expect(recruited.type).toBe(UnitType.SIEGE);
    expect(recruited.tags).toContain(UnitTag.BATTERY);
  });

  it('counts adjacent friendly units in the 8-neighbourhood, caps the bonus, and is suppressed by corruption', () => {
    const attacker = makeUnit('attacker', UnitType.SIEGE, Faction.PLAYER, 4, 4, [UnitTag.BATTERY]);
    const allyA = makeUnit('ally_a', UnitType.SWORDSMAN, Faction.PLAYER, 3, 3);
    const allyB = makeUnit('ally_b', UnitType.GUARD, Faction.PLAYER, 4, 3);
    const allyC = makeUnit('ally_c', UnitType.SCOUT, Faction.PLAYER, 5, 4);
    const allyD = makeUnit('ally_d', UnitType.ARCHER, Faction.PLAYER, 5, 5);
    const state = makeState([attacker, allyA, allyB, allyC, allyD]);

    expect(getBatteryAttackBonus(state, attacker)).toBe(
      ABILITIES.SIEGE_BATTERY_CAP * ABILITIES.SIEGE_BATTERY_ATK_PER_ADJACENT,
    );
    expect(CORRUPTED_SUPPRESSED_TAGS.has(UnitTag.BATTERY)).toBe(true);

    state.grid[attacker.position.y][attacker.position.x].status = TileStatus.CORRUPTED;

    expect(getBatteryAttackBonus(state, attacker)).toBe(0);
  });

  it('applies the derived BATTERY bonus during unit attacks without storing it in attack stats', () => {
    const attacker = makeUnit('attacker', UnitType.SIEGE, Faction.PLAYER, 1, 5, [UnitTag.BATTERY]);
    const allyA = makeUnit('ally_a', UnitType.SWORDSMAN, Faction.PLAYER, 1, 4);
    const allyB = makeUnit('ally_b', UnitType.GUARD, Faction.PLAYER, 2, 4);
    const allyC = makeUnit('ally_c', UnitType.SCOUT, Faction.PLAYER, 2, 5);
    const defender = makeUnit('defender', UnitType.LAVA_GRUNT, Faction.ENEMY, 4, 5);
    const state = makeState([attacker, allyA, allyB, allyC, defender]);

    const batteryBonus = getBatteryAttackBonus(state, attacker);
    const attackerCombatant = unitToCombatant(attacker);
    attackerCombatant.attack += batteryBonus;
    const expectedDamage = calculateCombatFromStats(attackerCombatant, unitToCombatant(defender)).defenderHpLost;
    const initialAttack = attacker.stats.attack;

    resolveAttack(state, attacker.id, defender.id, true);

    expect(state.units[defender.id].stats.currentHp).toBe(defender.stats.maxHp - expectedDamage);
    expect(state.units[attacker.id].stats.attack).toBe(initialAttack);
  });

  it('applies the derived BATTERY bonus during attacks on buildings without storing it in attack stats', () => {
    const attacker = makeUnit('attacker', UnitType.SIEGE, Faction.PLAYER, 1, 5, [UnitTag.BATTERY]);
    const allyA = makeUnit('ally_a', UnitType.SWORDSMAN, Faction.PLAYER, 1, 4);
    const allyB = makeUnit('ally_b', UnitType.GUARD, Faction.PLAYER, 2, 4);
    const allyC = makeUnit('ally_c', UnitType.SCOUT, Faction.PLAYER, 2, 5);
    const target = makeBuilding('target', BuildingType.BARRACKS, Faction.ENEMY, 4, 5, {
      hp: 500,
      maxHp: 500,
    });
    const state = makeState([attacker, allyA, allyB, allyC], [target]);

    const batteryBonus = getBatteryAttackBonus(state, attacker);
    const attackerCombatant = unitToCombatant(attacker);
    attackerCombatant.attack += batteryBonus;
    const expectedDamage = calculateCombatFromStats(attackerCombatant, {
      currentHp: target.hp,
      maxHp: target.maxHp,
      baseMaxHp: target.maxHp,
      attack: 0,
      defense: 0,
      attackRange: 0,
      positionX: target.position.x,
      positionY: target.position.y,
      faction: Faction.ENEMY,
      tags: target.tags,
    }).defenderHpLost;
    const initialAttack = attacker.stats.attack;

    resolveAttackOnBuilding(state, attacker.id, target.id, true);

    expect(state.buildings[target.id].hp).toBe(target.maxHp - expectedDamage);
    expect(state.units[attacker.id].stats.attack).toBe(initialAttack);
  });
});
