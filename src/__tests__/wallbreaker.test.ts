import { describe, expect, it } from 'vitest';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { calculateCombatFromStats, resolveAttack, resolveAttackOnBuilding, unitToCombatant } from '../combatSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, GameStats, Tile, Unit } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

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
  hp: number,
  maxHp: number,
  combatStats: Building['combatStats'] = null,
): Building {
  return {
    id,
    type,
    faction,
    position: { x, y },
    hp,
    maxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats,
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

// ── MAGMASPYR-like enemy combat building stats (mirrors gameConfig) ────────
const ENEMY_BUILDING_COMBAT_STATS = {
  maxHp: 120,
  attack: 30,
  defense: 50,
  attackRange: 2,
  maxAttacksPerTurn: 2,
} as const;

// ─────────────────────────────────────────────────────────────────────────────

describe('SP-19 Wallbreaker (spec_19) — ARCHER_VS_STRUCTURE', () => {
  it('multiplies ARCHER damage against an attackable enemy building when active', () => {
    const archer = makeUnit('archer', UnitType.ARCHER, Faction.PLAYER, 1, 5);
    const building = makeBuilding(
      'magmaspyr',
      BuildingType.MAGMASPYR,
      Faction.ENEMY,
      3,
      5,
      ENEMY_BUILDING_COMBAT_STATS.maxHp,
      ENEMY_BUILDING_COMBAT_STATS.maxHp,
      { ...ENEMY_BUILDING_COMBAT_STATS },
    );
    const state = makeState([archer], [building]);
    state.globalSpecialistStorage = ['spec_19'];

    const baseDamage = calculateCombatFromStats(unitToCombatant(archer), {
      currentHp: building.hp,
      maxHp: building.maxHp,
      baseMaxHp: building.maxHp,
      attack: ENEMY_BUILDING_COMBAT_STATS.attack,
      defense: ENEMY_BUILDING_COMBAT_STATS.defense,
      attackRange: ENEMY_BUILDING_COMBAT_STATS.attackRange,
      positionX: building.position.x,
      positionY: building.position.y,
      faction: Faction.ENEMY,
      tags: [],
    }).defenderHpLost;
    const expectedDamage = Math.round(baseDamage * (1 + ABILITIES.ARCHER_STRUCTURE_DMG_PCT / 100));

    resolveAttackOnBuilding(state, archer.id, building.id, true);

    expect(state.buildings[building.id]!.hp).toBe(building.maxHp - expectedDamage);
  });

  it('does NOT apply the bonus when ARCHER_VS_STRUCTURE is not active', () => {
    const archer = makeUnit('archer', UnitType.ARCHER, Faction.PLAYER, 1, 5);
    const building = makeBuilding(
      'magmaspyr',
      BuildingType.MAGMASPYR,
      Faction.ENEMY,
      3,
      5,
      ENEMY_BUILDING_COMBAT_STATS.maxHp,
      ENEMY_BUILDING_COMBAT_STATS.maxHp,
      { ...ENEMY_BUILDING_COMBAT_STATS },
    );
    const state = makeState([archer], [building]);
    // No specialist in globalSpecialistStorage

    const baseDamage = calculateCombatFromStats(unitToCombatant(archer), {
      currentHp: building.hp,
      maxHp: building.maxHp,
      baseMaxHp: building.maxHp,
      attack: ENEMY_BUILDING_COMBAT_STATS.attack,
      defense: ENEMY_BUILDING_COMBAT_STATS.defense,
      attackRange: ENEMY_BUILDING_COMBAT_STATS.attackRange,
      positionX: building.position.x,
      positionY: building.position.y,
      faction: Faction.ENEMY,
      tags: [],
    }).defenderHpLost;

    resolveAttackOnBuilding(state, archer.id, building.id, true);

    expect(state.buildings[building.id]!.hp).toBe(building.maxHp - baseDamage);
  });

  it('does NOT apply the bonus when a non-ARCHER unit attacks', () => {
    const swordsman = makeUnit('sword', UnitType.SWORDSMAN, Faction.PLAYER, 1, 5);
    const building = makeBuilding(
      'magmaspyr',
      BuildingType.MAGMASPYR,
      Faction.ENEMY,
      3,
      5,
      ENEMY_BUILDING_COMBAT_STATS.maxHp,
      ENEMY_BUILDING_COMBAT_STATS.maxHp,
      { ...ENEMY_BUILDING_COMBAT_STATS },
    );
    const state = makeState([swordsman], [building]);
    state.globalSpecialistStorage = ['spec_19'];

    const baseDamage = calculateCombatFromStats(unitToCombatant(swordsman), {
      currentHp: building.hp,
      maxHp: building.maxHp,
      baseMaxHp: building.maxHp,
      attack: ENEMY_BUILDING_COMBAT_STATS.attack,
      defense: ENEMY_BUILDING_COMBAT_STATS.defense,
      attackRange: ENEMY_BUILDING_COMBAT_STATS.attackRange,
      positionX: building.position.x,
      positionY: building.position.y,
      faction: Faction.ENEMY,
      tags: [],
    }).defenderHpLost;

    resolveAttackOnBuilding(state, swordsman.id, building.id, true);

    expect(state.buildings[building.id]!.hp).toBe(building.maxHp - baseDamage);
  });

  it('does NOT apply the bonus when the building has no combatStats (non-attackable, e.g. Embernest)', () => {
    const archer = makeUnit('archer', UnitType.ARCHER, Faction.PLAYER, 1, 5);
    // Simulate a building without combatStats — like EMBERNEST
    const building = makeBuilding(
      'embernest_like',
      BuildingType.EMBERNEST,
      Faction.ENEMY,
      3,
      5,
      100,
      100,
      null, // no combatStats → not attackable
    );
    const state = makeState([archer], [building]);
    state.globalSpecialistStorage = ['spec_19'];

    const baseDamage = calculateCombatFromStats(unitToCombatant(archer), {
      currentHp: building.hp,
      maxHp: building.maxHp,
      baseMaxHp: building.maxHp,
      attack: 0,
      defense: 0,
      attackRange: 0,
      positionX: building.position.x,
      positionY: building.position.y,
      faction: Faction.ENEMY,
      tags: [],
    }).defenderHpLost;

    resolveAttackOnBuilding(state, archer.id, building.id, true);

    expect(state.buildings[building.id]!.hp).toBe(building.maxHp - baseDamage);
  });

  it('does NOT apply the bonus when an ARCHER attacks an enemy unit', () => {
    const archer = makeUnit('archer', UnitType.ARCHER, Faction.PLAYER, 1, 5);
    const enemy = makeUnit('enemy', UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 5);
    const state = makeState([archer, enemy]);
    state.globalSpecialistStorage = ['spec_19'];

    const baseDamage = calculateCombatFromStats(
      unitToCombatant(archer),
      unitToCombatant(enemy),
    ).defenderHpLost;

    resolveAttack(state, archer.id, enemy.id, true);

    expect(state.units[enemy.id]!.stats.currentHp).toBe(enemy.stats.maxHp - baseDamage);
  });
});
