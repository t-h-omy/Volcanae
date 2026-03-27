/**
 * Map generation module for Volcanae.
 * Generates the initial GameState grid with buildings, units, and zones.
 */

import { MAP, LAVA, UNITS, BUILDINGS } from './gameConfig';
import {
  Faction,
  UnitType,
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a unique ID for entities.
 */
let idCounter = 0;
function generateId(prefix: string): string {
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
 */
function getZoneRowRange(zone: number): [number, number] {
  const startRow = MAP.LAVA_BUFFER_ROWS + (zone - 1) * MAP.ZONE_HEIGHT;
  const endRow = startRow + MAP.ZONE_HEIGHT - 1;
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
  const maxHp = 100; // Default building HP
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
    recruitmentQueue: null,
    discoverRadius: BUILDINGS.DISCOVER_RADIUS[type],
  };
}

/**
 * Gets the recruitment building type for a zone.
 * Varies per zone: BARRACKS, ARCHER_CAMP, RIDER_CAMP, SIEGE_CAMP
 */
function getRecruitmentBuildingForZone(zone: number): BuildingType {
  const buildingTypes: BuildingType[] = [
    BuildingType.BARRACKS,
    BuildingType.ARCHER_CAMP,
    BuildingType.RIDER_CAMP,
    BuildingType.SIEGE_CAMP,
    BuildingType.BARRACKS, // Zone 5 repeats BARRACKS
  ];
  return buildingTypes[(zone - 1) % buildingTypes.length];
}

/**
 * Generates the resource buildings for a zone (2 total).
 * Either 1 MINE and 1 WOODCUTTER, or 2 MINES, or 2 WOODCUTTERS
 */
function getResourceBuildingsForZone(): BuildingType[] {
  const options: BuildingType[][] = [
    [BuildingType.MINE, BuildingType.WOODCUTTER],
    [BuildingType.MINE, BuildingType.MINE],
    [BuildingType.WOODCUTTER, BuildingType.WOODCUTTER],
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generates all buildings for a zone.
 */
function generateBuildingsForZone(
  zone: number,
  occupiedPositions: Set<string>
): Building[] {
  const buildings: Building[] = [];

  // Determine faction based on zone:
  // - Zone 1 STRONGHOLD: PLAYER faction (already captured)
  // - Zone 1 other buildings and Zone 2: null (neutral/uncaptured)
  // - Zones 3-5: ENEMY faction
  const getFaction = (isStronghold: boolean): Faction | null => {
    if (zone === 1 && isStronghold) {
      return Faction.PLAYER;
    }
    if (zone >= 3) {
      return Faction.ENEMY;
    }
    return null;
  };

  // 1. STRONGHOLD (anchor building)
  const strongholdPos = getRandomPositionInZone(zone, occupiedPositions);
  markPositionOccupied(strongholdPos, occupiedPositions);
  buildings.push(
    createBuilding(BuildingType.STRONGHOLD, strongholdPos, getFaction(true))
  );

  // 2. Resource buildings (2 total)
  const resourceTypes = getResourceBuildingsForZone();
  for (const resourceType of resourceTypes) {
    const pos = getRandomPositionInZone(zone, occupiedPositions);
    markPositionOccupied(pos, occupiedPositions);
    buildings.push(createBuilding(resourceType, pos, getFaction(false)));
  }

  // 3. Recruitment building
  const recruitmentType = getRecruitmentBuildingForZone(zone);
  const recruitmentPos = getRandomPositionInZone(zone, occupiedPositions);
  markPositionOccupied(recruitmentPos, occupiedPositions);
  buildings.push(
    createBuilding(recruitmentType, recruitmentPos, getFaction(false))
  );

  // 4. Optional WATCHTOWER (based on configured spawn chance)
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
  return {
    id: generateId('unit'),
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: UNITS.UNIT_MAX_HP,
      currentHp: UNITS.UNIT_MAX_HP,
      attack: UNITS.UNIT_ATTACK,
      defense: UNITS.UNIT_DEFENSE,
      moveRange: UNITS.UNIT_MOVE_RANGE,
      visionRange: UNITS.UNIT_VISION_RANGE,
      triggerRange: UNITS.UNIT_TRIGGER_RANGE,
      movementActions: UNITS.UNIT_MOVEMENT_ACTIONS,
      attackRange: UNITS.UNIT_ATTACK_RANGE,
    },
    tags: [],
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasCapturedThisTurn: false,
  };
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

  // Track occupied positions for building placement
  const occupiedPositions = new Set<string>();

  // Generate buildings for all zones
  const allBuildings: Building[] = [];
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const zoneBuildings = generateBuildingsForZone(zone, occupiedPositions);
    allBuildings.push(...zoneBuildings);
  }

  // Convert buildings array to record
  const buildings: Record<string, Building> = {};
  for (const building of allBuildings) {
    buildings[building.id] = building;
  }

  // Find zone 1 stronghold for player infantry placement
  const zone1Stronghold = allBuildings.find(
    (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER
  );
  if (!zone1Stronghold) {
    throw new Error('Zone 1 stronghold not found');
  }

  // Create player infantry unit on zone 1 stronghold
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

  // Create the grid
  const grid = createGrid();

  // Place buildings on the grid
  for (const building of allBuildings) {
    const { x, y } = building.position;
    grid[y][x].buildingId = building.id;
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
      iron: 1,
      wood: 1,
    },
    lavaFrontRow: -1,
    turnsUntilLavaAdvance: LAVA.LAVA_ADVANCE_INTERVAL,
    selectedUnitId: null,
    selectedBuildingId: null,
    cameraY: 0,
    threatLevel: 0,
    zonesUnlocked: [1, 2],
  };

  return gameState;
}
