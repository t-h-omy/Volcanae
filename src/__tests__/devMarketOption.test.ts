import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { setMarketRandomSource } from '../marketSystem';
import { BuildingType, DestroyBehavior, Faction, TileType } from '../types';
import type { Building, Tile } from '../types';
import { MAP } from '../gameConfig';

function makeTile(x: number, y: number, terrainType: TileType = TileType.WATER): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType,
    hasCaveMonster: false,
    status: null,
  };
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeBuilding(
  id: string,
  type: BuildingType,
  faction: Faction,
  x: number,
  y: number,
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
  };
}

describe('debugAddMarketNearNorthStronghold', () => {
  beforeEach(() => {
    setMarketRandomSource(() => 0.5);
  });

  afterEach(() => {
    setMarketRandomSource(undefined);
  });

  it('places a market by the north-most stronghold-like building', () => {
    const grid = makeGrid();
    const southStronghold = makeBuilding('south-stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, 2, 30);
    const northSanctum = makeBuilding('north-sanctum', BuildingType.INFERNALSANCTUM, Faction.ENEMY, 4, 10);

    grid[southStronghold.position.y][southStronghold.position.x] = makeTile(
      southStronghold.position.x,
      southStronghold.position.y,
      TileType.PLAINS,
    );
    grid[southStronghold.position.y][southStronghold.position.x + 1] = makeTile(
      southStronghold.position.x + 1,
      southStronghold.position.y,
      TileType.PLAINS,
    );
    grid[northSanctum.position.y][northSanctum.position.x] = makeTile(
      northSanctum.position.x,
      northSanctum.position.y,
      TileType.PLAINS,
    );
    grid[northSanctum.position.y][northSanctum.position.x + 2] = makeTile(
      northSanctum.position.x + 2,
      northSanctum.position.y,
      TileType.PLAINS,
    );
    grid[southStronghold.position.y][southStronghold.position.x].buildingId = southStronghold.id;
    grid[northSanctum.position.y][northSanctum.position.x].buildingId = northSanctum.id;

    useGameStore.setState({
      grid,
      units: {},
      buildings: {
        [southStronghold.id]: southStronghold,
        [northSanctum.id]: northSanctum,
      },
      globalSpecialistStorage: [],
    });

    useGameStore.getState().debugAddMarketNearNorthStronghold();

    const markets = Object.values(useGameStore.getState().buildings).filter((b) => b.type === BuildingType.MARKET);
    expect(markets).toHaveLength(1);
    expect(markets[0].position).toEqual({ x: 6, y: 10 });
    expect(useGameStore.getState().grid[10][6].buildingId).toBe(markets[0].id);
  });

  it('does nothing when no valid nearby market tile exists', () => {
    const grid = makeGrid();
    const northSanctum = makeBuilding('north-sanctum', BuildingType.INFERNALSANCTUM, Faction.ENEMY, 4, 10);

    grid[northSanctum.position.y][northSanctum.position.x] = makeTile(
      northSanctum.position.x,
      northSanctum.position.y,
      TileType.PLAINS,
    );
    grid[northSanctum.position.y][northSanctum.position.x].buildingId = northSanctum.id;

    useGameStore.setState({
      grid,
      units: {},
      buildings: {
        [northSanctum.id]: northSanctum,
      },
      globalSpecialistStorage: [],
    });

    useGameStore.getState().debugAddMarketNearNorthStronghold();

    const markets = Object.values(useGameStore.getState().buildings).filter((b) => b.type === BuildingType.MARKET);
    expect(markets).toHaveLength(0);
  });
});
