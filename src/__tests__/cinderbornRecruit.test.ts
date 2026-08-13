import { describe, expect, it } from 'vitest';
import { ABILITIES, BURNING_TILE_DAMAGE, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { recruitUnit } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { processTileStatusEndOfTurn } from '../tileStatusSystem';
import type { GameEvent } from '../gameEvents';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Tile, Unit } from '../types';
import type { Draft } from 'immer';

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
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeBuilding(
  id: string,
  type: BuildingType,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction: Faction.PLAYER,
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
  };
}

function makeRecruitState(params: { lavaFrontRow: number; recruitY: number; withForgemaster: boolean }): GameState {
  const barracks = makeBuilding('barracks', BuildingType.BARRACKS, 4, params.recruitY);
  const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, 0, 0, {
    populationCount: 5,
    strongholdNobles: 5,
  });
  const grid = makeGrid();
  grid[barracks.position.y][barracks.position.x].buildingId = barracks.id;
  grid[stronghold.position.y][stronghold.position.x].buildingId = stronghold.id;

  return {
    turn: 1,
    phase: undefined as unknown as GameState['phase'],
    units: {},
    buildings: {
      [barracks.id]: barracks,
      [stronghold.id]: stronghold,
    },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: params.withForgemaster ? ['spec_15'] : [],
    resources: { iron: 999, wood: 999 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: params.lavaFrontRow,
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

function makeUnit(id: string, type: UnitType, x: number, y: number, tags: UnitTag[] = []): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { x, y },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
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

describe('SP-15s Forgemaster (spec_15) — CINDERBORN_RECRUIT', () => {
  it('adds CINDERBORN and +attack when recruiting near the lava front while Forgemaster is active', () => {
    const state = makeRecruitState({ lavaFrontRow: 8, recruitY: 6, withForgemaster: true });

    recruitUnit(state as Draft<GameState>, 'barracks', UnitType.SWORDSMAN);

    const recruited = Object.values(state.units)[0];
    expect(recruited).toBeDefined();
    expect(recruited.tags).toContain(UnitTag.CINDERBORN);
    expect(recruited.stats.attack).toBe(
      UNIT_DEFINITIONS[UnitType.SWORDSMAN].attack + ABILITIES.CINDERBORN_ATTACK_BONUS,
    );
  });

  it('does not add CINDERBORN when recruited outside the lava-front row threshold', () => {
    const state = makeRecruitState({ lavaFrontRow: 8, recruitY: 1, withForgemaster: true });

    recruitUnit(state as Draft<GameState>, 'barracks', UnitType.SWORDSMAN);

    const recruited = Object.values(state.units)[0];
    expect(recruited).toBeDefined();
    expect(recruited.tags).not.toContain(UnitTag.CINDERBORN);
    expect(recruited.stats.attack).toBe(UNIT_DEFINITIONS[UnitType.SWORDSMAN].attack);
  });

  it('treats CINDERBORN like LAVA for BURNING tile damage immunity', () => {
    const cinderborn = makeUnit('u_cinder', UnitType.SWORDSMAN, 2, 2, [UnitTag.CINDERBORN]);
    const normal = makeUnit('u_normal', UnitType.SWORDSMAN, 3, 2);
    const grid = makeGrid();
    grid[2][2].unitId = cinderborn.id;
    grid[2][2].status = TileStatus.BURNING;
    grid[2][3].unitId = normal.id;
    grid[2][3].status = TileStatus.BURNING;
    const state = {
      units: { [cinderborn.id]: cinderborn, [normal.id]: normal },
      grid,
      gameStats: {
        unitsLost: 0,
      },
    } as unknown as GameState;
    const events: GameEvent[] = [];

    processTileStatusEndOfTurn(state as Draft<GameState>, events);

    expect(state.units[cinderborn.id].stats.currentHp).toBe(UNIT_DEFINITIONS[UnitType.SWORDSMAN].maxHp);
    expect(state.units[normal.id].stats.currentHp).toBe(
      UNIT_DEFINITIONS[UnitType.SWORDSMAN].maxHp - BURNING_TILE_DAMAGE,
    );
    expect(events.some((e) => 'unitId' in e && e.unitId === cinderborn.id)).toBe(false);
    expect(events.some((e) => 'unitId' in e && e.unitId === normal.id)).toBe(true);
  });
});
