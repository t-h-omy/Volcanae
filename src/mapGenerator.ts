/**
 * Map generation module for Volcanae.
 * Generates the initial GameState grid with buildings, units, and zones.
 */

import { MAP, LAVA, UNITS, BUILDINGS, TERRAIN, POPULATION, RESOURCES } from './gameConfig';
import {
  Faction,
  UnitType,
  UnitTag,
  BuildingType,
  TileType,
  GamePhase,
} from './types';
import type {
  Position,
  Unit,
  Building,
  Tile,
  GameState,
} from './types';
import { createInitialSpecialists } from './specialistSystem';
import {
  isTileWithinEdgeCircleRange,
  getTilesWithinEdgeCircleRange,
} from './rangeUtils';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a unique ID for entities.
 */
let idCounter = 0;
export function generateId(prefix: string): string {
  return `${prefix}_${++idCounter}`;
}

/**
 * Resets the ID counter (useful for testing).
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Gets the row range [startRow, endRow] for a zone (inclusive).
 * Zone 1 is at high Y (south, near lava), zone 5 is at low Y (north, enemy territory).
 * Lava buffer occupies the highest rows (GRID_HEIGHT - LAVA_BUFFER_ROWS .. GRID_HEIGHT - 1).
 */
function getZoneRowRange(zone: number): [number, number] {
  const endRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - (zone - 1) * MAP.ZONE_HEIGHT;
  const startRow = endRow - MAP.ZONE_HEIGHT + 1;
  return [startRow, endRow];
}

/**
 * Checks if a position is already occupied by a building.
 */
function isPositionOccupied(
  position: Position,
  occupiedPositions: Set<string>
): boolean {
  return occupiedPositions.has(`${position.x},${position.y}`);
}

/**
 * Marks a position as occupied.
 */
function markPositionOccupied(
  position: Position,
  occupiedPositions: Set<string>
): void {
  occupiedPositions.add(`${position.x},${position.y}`);
}

/**
 * Generates a random position within a zone that is not occupied.
 */
function getRandomPositionInZone(
  zone: number,
  occupiedPositions: Set<string>
): Position {
  const [startRow, endRow] = getZoneRowRange(zone);
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const x = Math.floor(Math.random() * MAP.GRID_WIDTH);
    const y = startRow + Math.floor(Math.random() * (endRow - startRow + 1));
    const position = { x, y };

    if (!isPositionOccupied(position, occupiedPositions)) {
      return position;
    }
    attempts++;
  }

  // Fallback: find first available position
  for (let y = startRow; y <= endRow; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const position = { x, y };
      if (!isPositionOccupied(position, occupiedPositions)) {
        return position;
      }
    }
  }

  // Should never reach here in normal gameplay
  throw new Error(`No available position in zone ${zone}`);
}

// ============================================================================
// BUILDING GENERATION
// ============================================================================

/**
 * Creates a building at the specified position.
 */
function createBuilding(
  type: BuildingType,
  position: Position,
  faction: Faction | null
): Building {
  const isWatchtower = type === BuildingType.WATCHTOWER;
  const maxHp = isWatchtower ? BUILDINGS.WATCHTOWER_STATS.maxHp : 100;
  const combatStats = isWatchtower
    ? {
        attack: BUILDINGS.WATCHTOWER_STATS.attack,
        defense: BUILDINGS.WATCHTOWER_STATS.defense,
        attackRange: BUILDINGS.WATCHTOWER_STATS.attackRange,
      }
    : null;
  const tags: import('./types').UnitTag[] = isWatchtower ? [UnitTag.RANGED] : [];

  // Population initialization for housing buildings
  let populationCount = 0;
  let populationCap = 0;
  if (type === BuildingType.FARM) {
    populationCap = POPULATION.FARM_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.PATRICIANHOUSE) {
    populationCap = POPULATION.PATRICIAN_HOUSE_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.STRONGHOLD) {
    populationCap = POPULATION.STRONGHOLD_FARMER_CAP + POPULATION.STRONGHOLD_NOBLE_CAP;
    // Starting strongholds begin fully populated
    populationCount = populationCap;
  }

  return {
    id: generateId('building'),
    type,
    faction,
    position,
    hp: maxHp,
    maxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDINGS.DISCOVER_RADIUS[type],
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats,
    hasActedThisTurn: false,
    tags,
    consumesUnitOnCapture: isWatchtower,
    populationCount,
    populationCap,
    populationGrowthCounter: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
  };
}

/**
 * Generates all buildings for a zone.
 * Only generates 1 STRONGHOLD (at the pre-selected position) and an optional WATCHTOWER.
 */
function generateBuildingsForZone(
  zone: number,
  strongholdPos: Position,
  occupiedPositions: Set<string>
): Building[] {
  const buildings: Building[] = [];

  // Determine faction based on zone:
  // - Zone 1 STRONGHOLD: PLAYER faction (already captured)
  // - Zones 2-3: null (neutral/uncaptured)
  // - Zones 4-5: ENEMY faction
  const getFaction = (isStronghold: boolean): Faction | null => {
    if (zone === 1 && isStronghold) {
      return Faction.PLAYER;
    }
    if (zone >= 4) {
      return Faction.ENEMY;
    }
    return null;
  };

  // 1. STRONGHOLD (at pre-selected position)
  buildings.push(
    createBuilding(BuildingType.STRONGHOLD, strongholdPos, getFaction(true))
  );

  // 2. Optional WATCHTOWER (based on configured spawn chance)
  if (Math.random() < BUILDINGS.WATCHTOWER_SPAWN_CHANCE) {
    const watchtowerPos = getRandomPositionInZone(zone, occupiedPositions);
    markPositionOccupied(watchtowerPos, occupiedPositions);
    buildings.push(
      createBuilding(BuildingType.WATCHTOWER, watchtowerPos, getFaction(false))
    );
  }

  return buildings;
}

// ============================================================================
// UNIT GENERATION
// ============================================================================

/**
 * Creates a unit at the specified position.
 */
function createUnit(
  type: UnitType,
  faction: Faction,
  position: Position
): Unit {
  /** Unit types that receive the BUILDANDCAPTURE tag */
  const buildAndCaptureTypes: ReadonlySet<UnitType> = new Set([
    UnitType.INFANTRY,
    UnitType.ARCHER,
    UnitType.RIDER,
    UnitType.GUARD,
    UnitType.LAVA_GRUNT,
  ]);

  return {
    id: generateId('unit'),
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: UNITS[type].maxHp,
      currentHp: UNITS[type].maxHp,
      attack: UNITS[type].attack,
      defense: UNITS[type].defense,
      moveRange: UNITS[type].moveRange,
      discoverRadius: UNITS[type].discoverRadius,
      triggerRange: UNITS[type].triggerRange,
      movementActions: UNITS[type].movementActions,
      attackRange: UNITS[type].attackRange,
    },
    tags: [
      ...(UNITS[type].attackRange > 1 ? [UnitTag.RANGED] : []),
      ...(type === UnitType.SIEGE || type === UnitType.LAVA_SIEGE ? [UnitTag.PREP] : []),
      ...(buildAndCaptureTypes.has(type) ? [UnitTag.BUILDANDCAPTURE] : []),
      ...(type === UnitType.LAVA_GRUNT ? [UnitTag.CORRUPT] : []),
      ...(type === UnitType.EMBERLING ? [UnitTag.SACRIFICIAL, UnitTag.EXPLOSIVE] : []),
    ],
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasCapturedThisTurn: false,
  };
}

// ============================================================================
// TERRAIN GENERATION
// ============================================================================

/**
 * Places FOREST and MOUNTAIN tiles in a zone by setting tile.terrainType.
 * Terrain tiles must not overlap with buildings or each other.
 * Returns the positions of placed forests and mountains for zone-balance tracking.
 */
function placeTerrainForZone(
  zone: number,
  grid: Tile[][],
  occupiedPositions: Set<string>,
  config: { forests: number; mountains: number }
): { forestPositions: Position[]; mountainPositions: Position[] } {
  const forestPositions: Position[] = [];
  const mountainPositions: Position[] = [];

  // Place forest tiles
  for (let i = 0; i < config.forests; i++) {
    const pos = getRandomPositionInZone(zone, occupiedPositions);
    markPositionOccupied(pos, occupiedPositions);
    grid[pos.y][pos.x].terrainType = TileType.FOREST;
    forestPositions.push(pos);
  }

  // Place mountain tiles
  for (let i = 0; i < config.mountains; i++) {
    const pos = getRandomPositionInZone(zone, occupiedPositions);
    markPositionOccupied(pos, occupiedPositions);
    grid[pos.y][pos.x].terrainType = TileType.MOUNTAIN;
    mountainPositions.push(pos);
  }

  return { forestPositions, mountainPositions };
}

/**
 * Ensures at least one FOREST tile exists within edge-circle range
 * [ZONE1_FOREST_MIN_DISTANCE, ZONE1_FOREST_MAX_DISTANCE] of the zone 1 stronghold.
 * If no forest was placed in that range during placeTerrainForZone, places one additional FOREST tile.
 */
function guaranteeForestNearStronghold(
  zone1StrongholdPos: Position,
  grid: Tile[][],
  occupiedPositions: Set<string>
): void {
  const { x: sx, y: sy } = zone1StrongholdPos;
  const minDist = TERRAIN.ZONE1_FOREST_MIN_DISTANCE;
  const maxDist = TERRAIN.ZONE1_FOREST_MAX_DISTANCE;

  // Get all tiles within the max edge-circle range
  const tilesInMaxRange = getTilesWithinEdgeCircleRange(
    sx, sy, maxDist, MAP.GRID_WIDTH, MAP.GRID_HEIGHT
  );

  // Filter to the ring [minDist, maxDist]: within maxDist but NOT within (minDist - 1)
  const tilesInRing = tilesInMaxRange.filter(({ x, y }) =>
    !isTileWithinEdgeCircleRange(sx, sy, x, y, minDist - 1)
  );

  // Check if any forest already exists in the ring
  const forestExists = tilesInRing.some(({ x, y }) =>
    grid[y][x].terrainType === TileType.FOREST
  );

  if (forestExists) return;

  // No forest in range — find valid positions for one
  const candidates = tilesInRing.filter(({ x, y }) => {
    if (isPositionOccupied({ x, y }, occupiedPositions)) return false;
    if (grid[y][x].terrainType !== TileType.PLAINS) return false;
    if (grid[y][x].isLava) return false;
    return true;
  });

  if (candidates.length > 0) {
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    grid[chosen.y][chosen.x].terrainType = TileType.FOREST;
    markPositionOccupied({ x: chosen.x, y: chosen.y }, occupiedPositions);
  }
}

/**
 * Places TERRAIN.RUINS_PER_ZONE ruins in the zone.
 * Ruins are placed by setting tile.isRuin = true on PLAINS tiles
 * (not on FOREST or MOUNTAIN tiles).
 */
function placeRuinsForZone(
  zone: number,
  grid: Tile[][],
  occupiedPositions: Set<string>
): void {
  const [startRow, endRow] = getZoneRowRange(zone);
  let placed = 0;
  const target = TERRAIN.RUINS_PER_ZONE;
  let attempts = 0;
  const maxAttempts = 200;

  while (placed < target && attempts < maxAttempts) {
    const x = Math.floor(Math.random() * MAP.GRID_WIDTH);
    const y = startRow + Math.floor(Math.random() * (endRow - startRow + 1));
    const pos = { x, y };

    if (
      !isPositionOccupied(pos, occupiedPositions) &&
      grid[y][x].terrainType === TileType.PLAINS &&
      !grid[y][x].isRuin
    ) {
      grid[y][x].isRuin = true;
      markPositionOccupied(pos, occupiedPositions);
      placed++;
    }
    attempts++;
  }

  // Fallback: linear scan for remaining ruins
  if (placed < target) {
    for (let y = startRow; y <= endRow && placed < target; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH && placed < target; x++) {
        const pos = { x, y };
        if (
          !isPositionOccupied(pos, occupiedPositions) &&
          grid[y][x].terrainType === TileType.PLAINS &&
          !grid[y][x].isRuin
        ) {
          grid[y][x].isRuin = true;
          markPositionOccupied(pos, occupiedPositions);
          placed++;
        }
      }
    }
  }
}

// ============================================================================
// GRID GENERATION
// ============================================================================

/**
 * Creates the initial tile grid.
 */
function createGrid(): Tile[][] {
  const grid: Tile[][] = [];

  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    const row: Tile[] = [];

    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      row.push({
        position: { x, y },
        type: TileType.PLAINS,
        isRevealed: false,
        buildingId: null,
        unitId: null,
        isLava: false,
        isLavaPreview: false,
        isRuin: false,
        isStrongholdRuin: false,
        terrainType: TileType.PLAINS,
      });
    }
    grid.push(row);
  }

  return grid;
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generates the initial game state for Volcanae.
 */
export function generateInitialGameState(): GameState {
  // Reset ID counter for consistent generation
  resetIdCounter();

  // Track occupied positions for placement
  const occupiedPositions = new Set<string>();

  // Create the grid
  const grid = createGrid();

  // Pre-select stronghold positions for all zones (mark as occupied so terrain avoids them)
  const strongholdPositions: Position[] = [];
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const pos = getRandomPositionInZone(zone, occupiedPositions);
    markPositionOccupied(pos, occupiedPositions);
    strongholdPositions.push(pos);
  }

  // Place terrain for each zone with zone-balance carry-forward
  let extraForests = 0;
  let extraMountains = 0;

  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const config = {
      forests: TERRAIN.FORESTS_PER_ZONE + extraForests,
      mountains: TERRAIN.MOUNTAINS_PER_ZONE + extraMountains,
    };

    const { forestPositions, mountainPositions } = placeTerrainForZone(
      zone, grid, occupiedPositions, config
    );

    // After zone 1 terrain: guarantee forest near stronghold
    if (zone === 1) {
      guaranteeForestNearStronghold(strongholdPositions[0], grid, occupiedPositions);
    }

    // Zone-balance check: if zone got 0 of a type, next zone gets at least 1 extra
    extraForests = forestPositions.length === 0 ? 1 : 0;
    extraMountains = mountainPositions.length === 0 ? 1 : 0;
  }

  // Place ruins for each zone after terrain is placed
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    placeRuinsForZone(zone, grid, occupiedPositions);
  }

  // Generate buildings for all zones
  const allBuildings: Building[] = [];
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const zoneBuildings = generateBuildingsForZone(
      zone, strongholdPositions[zone - 1], occupiedPositions
    );
    allBuildings.push(...zoneBuildings);
  }

  // Convert buildings array to record
  const buildings: Record<string, Building> = {};
  for (const building of allBuildings) {
    buildings[building.id] = building;
  }

  // Place buildings on the grid
  for (const building of allBuildings) {
    const { x, y } = building.position;
    grid[y][x].buildingId = building.id;
  }

  // Find zone 1 stronghold for player infantry placement
  const zone1Stronghold = allBuildings.find(
    (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER
  );
  if (!zone1Stronghold) {
    throw new Error('Zone 1 stronghold not found');
  }

  // Create player unit on zone 1 stronghold
  const playerInfantry = createUnit(
    UnitType.INFANTRY,
    Faction.PLAYER,
    zone1Stronghold.position
  );

  // Create 2 enemy LAVA_GRUNT units in zone 5
  const enemyUnits: Unit[] = [];
  for (let i = 0; i < 2; i++) {
    const position = getRandomPositionInZone(5, occupiedPositions);
    markPositionOccupied(position, occupiedPositions);
    enemyUnits.push(createUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, position));
  }

  // Convert units array to record
  const units: Record<string, Unit> = {};
  units[playerInfantry.id] = playerInfantry;
  for (const unit of enemyUnits) {
    units[unit.id] = unit;
  }

  // Place units on the grid
  for (const unit of Object.values(units)) {
    const { x, y } = unit.position;
    grid[y][x].unitId = unit.id;
  }

  // Create initial game state
  const gameState: GameState = {
    turn: 1,
    phase: GamePhase.PLAYER_TURN,
    grid,
    units,
    buildings,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: {
      iron: RESOURCES.START_IRON,
      wood: RESOURCES.START_WOOD,
      farmers: (() => {
        let f = 0;
        for (const b of Object.values(buildings)) {
          if (b.faction !== Faction.PLAYER) continue;
          if (b.type === BuildingType.FARM) {
            f += b.populationCount;
          } else if (b.type === BuildingType.STRONGHOLD) {
            f += Math.min(b.populationCount, POPULATION.STRONGHOLD_FARMER_CAP);
          }
        }
        return f;
      })(),
      nobles: (() => {
        let n = 0;
        for (const b of Object.values(buildings)) {
          if (b.faction !== Faction.PLAYER) continue;
          if (b.type === BuildingType.PATRICIANHOUSE) {
            n += b.populationCount;
          } else if (b.type === BuildingType.STRONGHOLD) {
            n += Math.max(0, b.populationCount - POPULATION.STRONGHOLD_FARMER_CAP);
          }
        }
        return n;
      })(),
    },
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: LAVA.LAVA_ADVANCE_INTERVAL,
    selectedUnitId: null,
    selectedBuildingId: null,
    threatLevel: 0,
    zonesUnlocked: [1, 2],
  };

  return gameState;
}
