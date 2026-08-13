import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { ABILITIES, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import {
  calculateCombatFromStats,
  getBerserkAttackMultiplier,
  isBerserkActive,
  resolveAttack,
  resolveAttackOnBuilding,
  unitToCombatant,
} from '../combatSystem';
import { runEnemyTurn } from '../enemySystem';
import { recruitUnit } from '../resourceSystem';
import { applySpecialistEffects, createInitialSpecialists } from '../specialistSystem';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, GameStats, Tile, Unit } from '../types';

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
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction,
    position: { x, y },
    hp: 500,
    maxHp: 500,
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

describe('SP-20 Deathsworn (spec_20) — Archer BERSERK', () => {
  it('grants BERSERK to existing and newly recruited player Archers', () => {
    const existingArcher = makeUnit('archer_existing', UnitType.ARCHER, Faction.PLAYER, 1, 1);
    const state = produce(makeState([existingArcher]), (draft) => {
      draft.globalSpecialistStorage.push('spec_20');
      applySpecialistEffects(draft);
    });

    expect(state.units[existingArcher.id].tags).toContain(UnitTag.BERSERK);

    const archerCamp = makeBuilding('archer_camp', BuildingType.ARCHER_CAMP, Faction.PLAYER, 4, 4);
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, 0, 0, {
      populationCount: 5,
      strongholdNobles: 5,
    });
    const recruitState = makeState([], [archerCamp, stronghold]);
    recruitState.globalSpecialistStorage = ['spec_20'];
    recruitState.unlockedUnits = [UnitType.ARCHER];
    recruitState.resources = { iron: 999, wood: 999 };

    recruitUnit(recruitState, archerCamp.id, UnitType.ARCHER);

    const recruited = Object.values(recruitState.units)[0];
    expect(recruited).toBeDefined();
    expect(recruited.type).toBe(UnitType.ARCHER);
    expect(recruited.tags).toContain(UnitTag.BERSERK);
  });

  it('uses a strictly-below threshold for BERSERK activation', () => {
    const archer = makeUnit('archer', UnitType.ARCHER, Faction.PLAYER, 2, 2, [UnitTag.BERSERK]);
    const thresholdHp = archer.stats.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100;
    archer.stats.currentHp = thresholdHp;
    expect(archer.berserkActivated).toBeUndefined();
    expect(isBerserkActive(archer)).toBe(false);
    expect(getBerserkAttackMultiplier(archer)).toBe(1);

    archer.stats.currentHp = thresholdHp - 1;
    expect(isBerserkActive(archer)).toBe(true);
    expect(getBerserkAttackMultiplier(archer)).toBe(1 + ABILITIES.BERSERK_ATTACK_PCT / 100);
  });

  it('latches BERSERK after combat damage and keeps it active after healing', () => {
    const attacker = makeUnit('enemy_attacker', UnitType.SCOUT, Faction.ENEMY, 3, 5);
    const berserkDefender = makeUnit('berserk_defender', UnitType.ARCHER, Faction.PLAYER, 4, 5, [UnitTag.BERSERK]);
    const state = makeState([attacker, berserkDefender]);
    const thresholdHp = berserkDefender.stats.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100;
    state.units[berserkDefender.id].stats.currentHp = Math.floor(thresholdHp) + 5;

    resolveAttack(state, attacker.id, berserkDefender.id, true);

    const defenderAfter = state.units[berserkDefender.id];
    expect(defenderAfter).toBeDefined();
    if (!defenderAfter) throw new Error('Berserk defender should survive test attack');
    expect(defenderAfter.berserkActivated).toBe(true);
    expect(isBerserkActive(defenderAfter)).toBe(true);

    defenderAfter.stats.currentHp = defenderAfter.stats.maxHp;
    expect(isBerserkActive(defenderAfter)).toBe(true);
    expect(getBerserkAttackMultiplier(defenderAfter)).toBe(1 + ABILITIES.BERSERK_ATTACK_PCT / 100);
  });

  it('does not set berserkActivated when HP never goes below threshold', () => {
    const archer = makeUnit('archer_high_hp', UnitType.ARCHER, Faction.PLAYER, 2, 2, [UnitTag.BERSERK]);
    const thresholdHp = archer.stats.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100;
    archer.stats.currentHp = thresholdHp;

    expect(archer.berserkActivated).toBeUndefined();
    expect(isBerserkActive(archer)).toBe(false);
    expect(getBerserkAttackMultiplier(archer)).toBe(1);
  });

  it('backfills the latch during end-of-turn unit sweep', () => {
    const archer = makeUnit('archer_sweep', UnitType.ARCHER, Faction.PLAYER, 2, 2, [UnitTag.BERSERK]);
    const thresholdHp = archer.stats.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100;
    archer.stats.currentHp = thresholdHp - 1;
    archer.berserkActivated = undefined;
    const state = makeState([archer]);

    const { finalState } = runEnemyTurn(state);
    expect(finalState.units[archer.id].berserkActivated).toBe(true);
    expect(isBerserkActive(finalState.units[archer.id])).toBe(true);
  });

  it('applies the derived BERSERK multiplier during attacks on buildings', () => {
    const attacker = makeUnit('attacker', UnitType.ARCHER, Faction.PLAYER, 1, 5, [UnitTag.BERSERK]);
    const target = makeBuilding('target', BuildingType.BARRACKS, Faction.ENEMY, 4, 5, { hp: 500, maxHp: 500 });
    const state = makeState([attacker], [target]);
    const thresholdHp = attacker.stats.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100;
    state.units[attacker.id].stats.currentHp = thresholdHp - 1;
    const initialAttack = state.units[attacker.id].stats.attack;

    const attackerCombatant = unitToCombatant(state.units[attacker.id]);
    attackerCombatant.attack *= getBerserkAttackMultiplier(state.units[attacker.id]);
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

    resolveAttackOnBuilding(state, attacker.id, target.id, true);

    expect(state.buildings[target.id].hp).toBe(target.maxHp - expectedDamage);
    expect(state.units[attacker.id].stats.attack).toBe(initialAttack);
  });
});
