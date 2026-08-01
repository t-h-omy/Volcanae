/**
 * Map generation module for Volcanae.
 * Generates the initial GameState grid with buildings, units, and zones.
 */

import { MAP, UNIT_DEFINITIONS, BUILDING_DEFINITIONS, BUILDINGS, TERRAIN, POPULATION, RESOURCES, TECH_TREE, TECH, DIFFICULTY_MULTIPLIER, getLavaAdvanceInterval, MARKET } from './gameConfig';
import {
  Faction,
  UnitType,
  UnitTag,
  BuildingType,
  TileType,
  GamePhase,
  Difficulty,
} from './types';
import type {
  Position,
  Unit,
  Building,
  Tile,
  GameState,
  TechNodeState,
} from './types';
import { createInitialSpecialists } from './specialistSystem';
import {
  isTileWithinEdgeCircleRange,
  getTilesWithinEdgeCircleRange,
} from './rangeUtils';
import { rollNextWaveTheme } from './waveThemeSystem';
import { createMarket, setMarketRandomSource } from './marketSystem';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a unique ID for entities.
 */
let idCounter = 0;
// Per-session random salt prevents collisions when new IDs are generated after loading a saved
// game: without the salt, the counter restarts from 0 and can produce IDs that already exist in
// the loaded state, silently overwriting existing entities.
// Old saves (IDs like "building_1") remain forward-compatible because the new format
// ("building_<uuid_prefix>_1") is a different string and will never collide with old-format IDs.
const sessionSalt = crypto.randomUUID().slice(0, 8);
export function generateId(prefix: string): string {
  return `${prefix}_${sessionSalt}_${++idCounter}`;
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
 * Generates a random position within a zone that is not occupied
 * and (when grid is provided) not on an impassable tile (CANYON/WATER).
 * @param skipFirstRows - number of rows at the low-Y (start) end of the zone to exclude
 * @param skipLastRows  - number of rows at the high-Y (end) end of the zone to exclude
 * @param grid          - optional grid to additionally reject CANYON/WATER tiles
 */
function getRandomPositionInZone(
  zone: number,
  occupiedPositions: Set<string>,
  skipFirstRows = 0,
  skipLastRows = 0,
  grid?: Tile[][],
  skipLeftCols = 0,
  skipRightCols = 0,
): Position {
  const [zoneStart, zoneEnd] = getZoneRowRange(zone);
  const startRow = zoneStart + skipFirstRows;
  const endRow = zoneEnd - skipLastRows;
  const startCol = skipLeftCols;
  const endCol = MAP.GRID_WIDTH - 1 - skipRightCols;

  if (startRow > endRow) {
    throw new Error(
      `Invalid row skip configuration for zone ${zone}: skipFirstRows (${skipFirstRows}) + skipLastRows (${skipLastRows}) exceeds zone height`,
    );
  }

  if (startCol > endCol) {
    throw new Error(
      `Invalid column skip configuration for zone ${zone}: skipLeftCols (${skipLeftCols}) + skipRightCols (${skipRightCols}) exceeds grid width`,
    );
  }

  const isPassable = (x: number, y: number) => {
    if (!grid) return true;
    const tile = grid[y][x];
    return tile.terrainType !== TileType.CANYON && tile.terrainType !== TileType.WATER;
  };

  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const x = startCol + Math.floor(Math.random() * (endCol - startCol + 1));
    const y = startRow + Math.floor(Math.random() * (endRow - startRow + 1));
    const position = { x, y };

    if (!isPositionOccupied(position, occupiedPositions) && isPassable(x, y)) {
      return position;
    }
    attempts++;
  }

  // Fallback: find first available position
  for (let y = startRow; y <= endRow; y++) {
    for (let x = startCol; x <= endCol; x++) {
      const position = { x, y };
      if (!isPositionOccupied(position, occupiedPositions) && isPassable(x, y)) {
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
  const maxHp = isWatchtower ? BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.maxHp : 100;
  const combatStats = isWatchtower
    ? {
        attack: BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.attack,
        defense: BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.defense,
        attackRange: BUILDING_DEFINITIONS.WATCHTOWER.combatStats!.attackRange,
      }
    : null;
  const tags: import('./types').UnitTag[] = isWatchtower ? [UnitTag.RANGED] : [];

  // Population initialization for housing buildings
  let populationCount = 0;
  let populationCap = 0;
  let strongholdNobles = 0;
  if (type === BuildingType.FARM) {
    populationCap = POPULATION.FARM_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.PATRICIANHOUSE) {
    populationCap = POPULATION.PATRICIAN_HOUSE_POPULATION_CAP;
    populationCount = POPULATION.HOUSE_INITIAL_POPULATION;
  } else if (type === BuildingType.STRONGHOLD) {
    populationCap = POPULATION.STRONGHOLD_FARMER_CAP + POPULATION.STRONGHOLD_NOBLE_CAP;
    // Starting strongholds begin fully populated — farmers and nobles tracked separately
    populationCount = POPULATION.STRONGHOLD_FARMER_CAP;
    strongholdNobles = POPULATION.STRONGHOLD_NOBLE_CAP;
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
    discoverRadius: BUILDING_DEFINITIONS[type].discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats,
    hasAttackedThisTurn: false,
    tags,
    consumesUnitOnCapture: isWatchtower,
    populationCount,
    populationCap,
    populationGrowthCounter: 0,
    strongholdNobles,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: BUILDING_DEFINITIONS[type].destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}/**
 * Generates all buildings for a zone.
 * - Zone 1: PLAYER STRONGHOLD building + optional WATCHTOWER.
 * - Zones 2-3: marks the stronghold position as a stronghold ruin on the grid (no building created) + optional WATCHTOWER.
 * - Zones 4-5: ENEMY INFERNALSANCTUM building + optional WATCHTOWER.
 */
function generateBuildingsForZone(
  zone: number,
  strongholdPos: Position,
  occupiedPositions: Set<string>,
  grid: Tile[][]
): Building[] {
  const buildings: Building[] = [];

  // Determine faction based on zone:
  // - Zone 1 STRONGHOLD: PLAYER faction (already captured)
  // - Zones 2-3: null (neutral) → stronghold ruin, no building
  // - Zones 4-5: ENEMY faction
  const getFaction = (isStronghold: boolean): Faction | null => {
    if (zone === 1 && isStronghold) {
      return Faction.PLAYER;
    }
    if (zone >= MAP.FIRST_ENEMY_ZONE) {
      return Faction.ENEMY;
    }
    return null;
  };

  // 1. STRONGHOLD or INFERNALSANCTUM (at pre-selected position)
  const strongholdFaction = getFaction(true);
  if (strongholdFaction === null) {
    // Neutral zones 2-3: place a stronghold ruin tile instead of a building
    grid[strongholdPos.y][strongholdPos.x].isStrongholdRuin = true;
  } else {
    const buildingType = strongholdFaction === Faction.ENEMY
      ? BuildingType.INFERNALSANCTUM
      : BuildingType.STRONGHOLD;
    buildings.push(
      createBuilding(buildingType, strongholdPos, strongholdFaction)
    );
  }

  // 2. Optional WATCHTOWER (based on configured spawn chance)
  if (Math.random() < BUILDINGS.WATCHTOWER_SPAWN_CHANCE) {
    const watchtowerPos = getRandomPositionInZone(zone, occupiedPositions, 0, 0, grid);
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
      maxHp: UNIT_DEFINITIONS[type].maxHp,
      currentHp: UNIT_DEFINITIONS[type].maxHp,
      attack: UNIT_DEFINITIONS[type].attack,
      defense: UNIT_DEFINITIONS[type].defense,
      moveRange: UNIT_DEFINITIONS[type].moveRange,
      discoverRadius: UNIT_DEFINITIONS[type].discoverRadius,
      triggerRange: UNIT_DEFINITIONS[type].triggerRange,
      movementActions: UNIT_DEFINITIONS[type].movementActions,
      attackRange: UNIT_DEFINITIONS[type].attackRange,
    },
    tags: [...UNIT_DEFINITIONS[type].tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

// ============================================================================

/** Returns a random integer in the inclusive range [min, max]. */
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Places FOREST and MOUNTAIN tiles in a zone by setting tile.terrainType.
 * Terrain tiles must not overlap with buildings or each other.
 * The counts in config are determined by the caller using TERRAIN min/max ranges.
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
    // Zone 1 is the player's starting zone — no cave monsters there
    if (zone !== 1 && Math.random() < TERRAIN.CAVE_MONSTER_SPAWN_CHANCE) {
      grid[pos.y][pos.x].hasCaveMonster = true;
    }
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
 * Ensures at least one MOUNTAIN tile exists within edge-circle range
 * [ZONE1_MOUNTAIN_MIN_DISTANCE, ZONE1_MOUNTAIN_MAX_DISTANCE] of the zone 1 stronghold.
 * If no mountain was placed in that range during placeTerrainForZone, places one additional MOUNTAIN tile.
 * This guarantees the player has access to iron strategy via Mine construction.
 * Uses separate balancing values from forest generation (ZONE1_MOUNTAIN_MIN/MAX_DISTANCE).
 */
function guaranteeMountainNearStronghold(
  zone1StrongholdPos: Position,
  grid: Tile[][],
  occupiedPositions: Set<string>
): void {
  const { x: sx, y: sy } = zone1StrongholdPos;
  const minDist = TERRAIN.ZONE1_MOUNTAIN_MIN_DISTANCE;
  const maxDist = TERRAIN.ZONE1_MOUNTAIN_MAX_DISTANCE;

  // Get all tiles within the max edge-circle range
  const tilesInMaxRange = getTilesWithinEdgeCircleRange(
    sx, sy, maxDist, MAP.GRID_WIDTH, MAP.GRID_HEIGHT
  );

  // Filter to the ring [minDist, maxDist]: within maxDist but NOT within (minDist - 1)
  const tilesInRing = tilesInMaxRange.filter(({ x, y }) =>
    !isTileWithinEdgeCircleRange(sx, sy, x, y, minDist - 1)
  );

  // Check if any mountain already exists in the ring
  const mountainExists = tilesInRing.some(({ x, y }) =>
    grid[y][x].terrainType === TileType.MOUNTAIN
  );

  if (mountainExists) return;

  // No mountain in range — find valid positions for one
  const candidates = tilesInRing.filter(({ x, y }) => {
    if (isPositionOccupied({ x, y }, occupiedPositions)) return false;
    if (grid[y][x].terrainType !== TileType.PLAINS) return false;
    if (grid[y][x].isLava) return false;
    return true;
  });

  if (candidates.length > 0) {
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    grid[chosen.y][chosen.x].terrainType = TileType.MOUNTAIN;
    // Zone 1 is the player's starting zone — no cave monsters there
    markPositionOccupied({ x: chosen.x, y: chosen.y }, occupiedPositions);
  }
}

/**
 * Places a random number of ruins in the zone.
 * Uses zone-specific min/max from TERRAIN.RUINS_PER_ZONE_OVERRIDES when available,
 * falling back to TERRAIN.RUINS_PER_ZONE_MIN / TERRAIN.RUINS_PER_ZONE_MAX.
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
  const zoneOverride = TERRAIN.RUINS_PER_ZONE_OVERRIDES[zone];
  const ruinMin = zoneOverride !== undefined ? zoneOverride.min : TERRAIN.RUINS_PER_ZONE_MIN;
  const ruinMax = zoneOverride !== undefined ? zoneOverride.max : TERRAIN.RUINS_PER_ZONE_MAX;
  const target = randomInRange(ruinMin, ruinMax);
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

/**
 * Places a random number of ruins (between TERRAIN.RUINS_IN_LAVA_BUFFER_MIN and
 * TERRAIN.RUINS_IN_LAVA_BUFFER_MAX) in the lava buffer rows.
 * Ruins are placed by setting tile.isRuin = true on PLAINS tiles.
 */
function placeRuinsInLavaBuffer(
  grid: Tile[][],
  occupiedPositions: Set<string>
): void {
  const startRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS;
  const endRow = MAP.GRID_HEIGHT - 1;
  let placed = 0;
  const target = randomInRange(TERRAIN.RUINS_IN_LAVA_BUFFER_MIN, TERRAIN.RUINS_IN_LAVA_BUFFER_MAX);
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
// CANYON & LAKE GENERATION
// ============================================================================

/**
 * Checks if a position is too close to any stronghold position.
 * Uses Manhattan distance with TERRAIN.IMPASSABLE_MIN_DISTANCE_FROM_STRONGHOLD.
 */
function isTooCloseToStronghold(
  pos: Position,
  strongholdPositions: Position[],
): boolean {
  const minDist = TERRAIN.IMPASSABLE_MIN_DISTANCE_FROM_STRONGHOLD;
  for (const sp of strongholdPositions) {
    if (Math.abs(pos.x - sp.x) + Math.abs(pos.y - sp.y) <= minDist) {
      return true;
    }
  }
  return false;
}

/**
 * Generates the shape of a canyon (vertical, with drift and width variance).
 * Returns the list of positions making up the canyon.
 */
function generateCanyonShape(startX: number, startY: number): Position[] {
  const length = randomInRange(TERRAIN.CANYON_LENGTH_MIN, TERRAIN.CANYON_LENGTH_MAX);
  const positions: Position[] = [];
  const seen = new Set<string>();

  let x = startX;
  let y = startY;

  for (let i = 0; i < length; i++) {
    // Clamp to grid bounds
    x = Math.max(0, Math.min(MAP.GRID_WIDTH - 1, x));
    if (y < 0 || y >= MAP.GRID_HEIGHT) break;

    const key = `${x},${y}`;
    if (!seen.has(key)) {
      positions.push({ x, y });
      seen.add(key);
    }

    // Width variance: optionally include an adjacent tile horizontally
    if (Math.random() < TERRAIN.CANYON_WIDTH_VARIANCE_CHANCE) {
      const dx = Math.random() < 0.5 ? -1 : 1;
      const nx = x + dx;
      if (nx >= 0 && nx < MAP.GRID_WIDTH) {
        const nkey = `${nx},${y}`;
        if (!seen.has(nkey)) {
          positions.push({ x: nx, y });
          seen.add(nkey);
        }
      }
    }

    // Move north (decreasing Y) with horizontal drift
    y -= 1;
    if (Math.random() < TERRAIN.CANYON_DRIFT_CHANCE) {
      x += Math.random() < 0.5 ? -1 : 1;
    }
  }

  return positions;
}

/**
 * Generates the shape of a water lake using erosion of a filled rectangle.
 * Returns the list of positions making up the lake.
 */
function generateLakeShape(
  originX: number,
  originY: number,
  width: number,
  height: number,
): Position[] {
  // Start with a fully filled grid
  const filled: boolean[][] = [];
  for (let dy = 0; dy < height; dy++) {
    const row: boolean[] = [];
    for (let dx = 0; dx < width; dx++) {
      row.push(true);
    }
    filled.push(row);
  }

  // Erosion pass: remove border tiles with probability
  const erosionPasses = randomInRange(1, 2);
  for (let pass = 0; pass < erosionPasses; pass++) {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        if (!filled[dy][dx]) continue;
        // Only erode border/edge tiles
        const isBorder =
          dy === 0 || dy === height - 1 || dx === 0 || dx === width - 1;
        if (isBorder && Math.random() < TERRAIN.LAKE_EROSION_CHANCE) {
          filled[dy][dx] = false;
        }
      }
    }
  }

  // Find the largest connected component using BFS
  const visited: boolean[][] = Array.from({ length: height }, () =>
    Array(width).fill(false),
  );
  let largestComponent: Position[] = [];

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (!filled[dy][dx] || visited[dy][dx]) continue;
      // BFS
      const component: Position[] = [];
      const queue: [number, number][] = [[dx, dy]];
      let qi = 0;
      visited[dy][dx] = true;
      while (queue.length > qi) {
        const [cx, cy] = queue[qi++];
        component.push({ x: originX + cx, y: originY + cy });
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (
            nx >= 0 && nx < width && ny >= 0 && ny < height &&
            filled[ny][nx] && !visited[ny][nx]
          ) {
            visited[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }
      if (component.length > largestComponent.length) {
        largestComponent = component;
      }
    }
  }

  return largestComponent;
}

/**
 * Checks that placing a set of impassable positions would not reduce
 * any affected row below the minimum passable tile threshold.
 */
function wouldViolateRowMinimum(
  positions: Position[],
  grid: Tile[][],
  occupiedImpassable: Set<string>,
): boolean {
  // Count current impassable (CANYON/WATER) tiles per affected row
  const rowsAffected = new Set(positions.map((p) => p.y));
  for (const row of rowsAffected) {
    if (row < 0 || row >= MAP.GRID_HEIGHT) continue;
    let passable = 0;
    const newImpassableInRow = new Set(
      positions.filter((p) => p.y === row).map((p) => `${p.x},${p.y}`),
    );
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const key = `${x},${row}`;
      const tile = grid[row][x];
      if (
        !tile.isLava &&
        tile.terrainType !== TileType.CANYON &&
        tile.terrainType !== TileType.WATER &&
        !occupiedImpassable.has(key) &&
        !newImpassableInRow.has(key)
      ) {
        passable++;
      }
    }
    if (passable < TERRAIN.MIN_PASSABLE_TILES_PER_ROW) {
      return true;
    }
  }
  return false;
}

/**
 * BFS from a set of starting positions, returning a map of tile-key → distance.
 * Traversal is constrained to passable tiles within [zoneStartRow, zoneEndRow].
 */
function bfsDistancesInZone(
  grid: Tile[][],
  startPositions: Position[],
  zoneStartRow: number,
  zoneEndRow: number,
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: Array<[number, number, number]> = []; // [x, y, d]

  for (const p of startPositions) {
    if (p.y < zoneStartRow || p.y > zoneEndRow) continue;
    const tile = grid[p.y]?.[p.x];
    if (!tile || isImpassableTile(tile)) continue;
    const key = `${p.x},${p.y}`;
    if (!dist.has(key)) {
      dist.set(key, 0);
      queue.push([p.x, p.y, 0]);
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const [cx, cy, d] = queue[qi++];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < zoneStartRow || ny > zoneEndRow) continue;
      const key = `${nx},${ny}`;
      if (dist.has(key)) continue;
      if (isImpassableTile(grid[ny][nx])) continue;
      dist.set(key, d + 1);
      queue.push([nx, ny, d + 1]);
    }
  }

  return dist;
}

/**
 * Returns true if any walkable tile in the zone is farther than
 * TERRAIN.WORLDGEN_MAX_DEADEND_DEPTH from the "forward core" —
 * the set of tiles that lie on or near a shortest south-to-north path.
 *
 * Algorithm:
 * 1. BFS distances from the south band (high-Y rows).
 * 2. BFS distances from the north band (low-Y rows).
 * 3. Shortest south-to-north path length.
 * 4. Forward core = tiles where distSouth + distNorth <= shortest + SLACK.
 * 5. BFS from core; flag any reachable tile farther than MAX_DEADEND_DEPTH.
 */
function hasOversizedDeadend(grid: Tile[][], zone: number): boolean {
  const [zoneStartRow, zoneEndRow] = getZoneRowRange(zone);
  const bandRows = TERRAIN.WORLDGEN_DEADEND_BAND_ROWS;

  // South band: high-Y rows (bottom of zone, near lava)
  const southBand: Position[] = [];
  const southBandStart = Math.max(zoneStartRow, zoneEndRow - bandRows + 1);
  for (let y = southBandStart; y <= zoneEndRow; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      if (!isImpassableTile(grid[y][x])) southBand.push({ x, y });
    }
  }

  // North band: low-Y rows (top of zone, toward enemy)
  const northBand: Position[] = [];
  const northBandEnd = Math.min(zoneEndRow, zoneStartRow + bandRows - 1);
  for (let y = zoneStartRow; y <= northBandEnd; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      if (!isImpassableTile(grid[y][x])) northBand.push({ x, y });
    }
  }

  if (southBand.length === 0 || northBand.length === 0) return false;

  const distFromSouth = bfsDistancesInZone(grid, southBand, zoneStartRow, zoneEndRow);
  const distFromNorth = bfsDistancesInZone(grid, northBand, zoneStartRow, zoneEndRow);

  // Shortest south-to-north path: min over all tiles of (dSouth + dNorth)
  let shortestPath = Infinity;
  for (const [key, ds] of distFromSouth) {
    const dn = distFromNorth.get(key);
    if (dn !== undefined && ds + dn < shortestPath) {
      shortestPath = ds + dn;
    }
  }

  // No passable path between bands — traversability handles this separately
  if (shortestPath === Infinity) return false;

  // Build forward core: tiles within slack of the shortest path
  const slack = TERRAIN.WORLDGEN_MAIN_PATH_SLACK;
  const coreStarts: Position[] = [];
  for (let y = zoneStartRow; y <= zoneEndRow; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      if (isImpassableTile(grid[y][x])) continue;
      const key = `${x},${y}`;
      const ds = distFromSouth.get(key) ?? Infinity;
      const dn = distFromNorth.get(key) ?? Infinity;
      if (ds + dn <= shortestPath + slack) {
        coreStarts.push({ x, y });
      }
    }
  }

  if (coreStarts.length === 0) return false;

  // BFS from core; measure distance to every reachable zone tile
  const distFromCore = bfsDistancesInZone(grid, coreStarts, zoneStartRow, zoneEndRow);
  const maxDepth = TERRAIN.WORLDGEN_MAX_DEADEND_DEPTH;

  for (let y = zoneStartRow; y <= zoneEndRow; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      if (isImpassableTile(grid[y][x])) continue;
      const key = `${x},${y}`;
      // Skip isolated pockets: tiles unreachable from both bands cannot form a
      // meaningful deadend relative to the forward-flow path, and checking them
      // would produce false positives (Infinity distance) for terrain disconnected
      // from the main traversal corridor within this zone.
      if (!distFromSouth.has(key) && !distFromNorth.has(key)) continue;
      const d = distFromCore.get(key) ?? Infinity;
      if (d > maxDepth) return true;
    }
  }

  return false;
}

/**
 * Temporarily marks the candidate positions as impassable on the grid,
 * checks for oversized deadends in the origin zone and any neighbouring
 * zones the shape overlaps, then reverts the grid to its original state.
 * Returns true if the candidate would create an oversized deadend.
 */
function wouldCreateOversizedDeadend(
  shape: Position[],
  grid: Tile[][],
  originZone: number,
): boolean {
  // Temporarily apply the shape as impassable terrain
  const reverts: Array<{ pos: Position; terrainType: TileType }> = [];
  for (const p of shape) {
    if (p.y < 0 || p.y >= MAP.GRID_HEIGHT || p.x < 0 || p.x >= MAP.GRID_WIDTH) continue;
    if (!isImpassableTile(grid[p.y][p.x])) {
      reverts.push({ pos: p, terrainType: grid[p.y][p.x].terrainType });
      // Mark as CANYON regardless of whether this is a canyon or lake candidate —
      // the specific impassable type does not matter for deadend BFS; only
      // passability (isImpassableTile) is checked during validation.
      grid[p.y][p.x].terrainType = TileType.CANYON;
    }
  }

  // Determine all zones touched by the shape
  const affectedZones = new Set<number>([originZone]);
  for (const p of shape) {
    for (let z = 1; z <= MAP.ZONE_COUNT; z++) {
      if (z === originZone) continue;
      const [zs, ze] = getZoneRowRange(z);
      if (p.y >= zs && p.y <= ze) affectedZones.add(z);
    }
  }

  let oversized = false;
  for (const zone of affectedZones) {
    if (hasOversizedDeadend(grid, zone)) {
      oversized = true;
      break;
    }
  }

  // Revert temporary changes
  for (const { pos, terrainType } of reverts) {
    grid[pos.y][pos.x].terrainType = terrainType;
  }

  return oversized;
}

/**
 * Places canyons across the map (starting in a zone but allowed to span into
 * neighbouring zones). Validates row minimum and stronghold distance.
 */
function placeCanyonsForZone(
  zone: number,
  grid: Tile[][],
  occupiedPositions: Set<string>,
  strongholdPositions: Position[],
): void {
  const [startRow, endRow] = getZoneRowRange(zone);
  const count = randomInRange(TERRAIN.CANYONS_PER_ZONE_MIN, TERRAIN.CANYONS_PER_ZONE_MAX);
  const lavaBufferStart = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS;

  for (let i = 0; i < count; i++) {
    let placed = false;
    let attempts = 0;
    const maxAttempts = 20;

    while (!placed && attempts < maxAttempts) {
      attempts++;
      // Pick a random start position within the zone, not within 1 tile of map edges
      const sx = randomInRange(1, MAP.GRID_WIDTH - 2);
      const sy = randomInRange(startRow, endRow);

      const shape = generateCanyonShape(sx, sy);

      // Filter: in grid bounds, not in lava buffer (no zone restriction — canyons may span zones)
      const validShape = shape.filter(
        (p) =>
          p.y >= 0 &&
          p.y < lavaBufferStart &&
          p.x >= 0 &&
          p.x < MAP.GRID_WIDTH,
      );

      if (validShape.length === 0) continue;

      // Check stronghold proximity
      const tooClose = validShape.some((p) =>
        isTooCloseToStronghold(p, strongholdPositions),
      );
      if (tooClose) continue;

      // Reject candidate if any tile would overwrite a building, ruin, forest, or mountain.
      // Positions that are already CANYON/WATER in occupiedPositions are fine — they
      // will simply be re-marked as CANYON (no-op for existing canyon tiles).
      const overlapsOccupied = validShape.some((p) =>
        isPositionOccupied(p, occupiedPositions) &&
        grid[p.y][p.x].terrainType !== TileType.CANYON &&
        grid[p.y][p.x].terrainType !== TileType.WATER
      );
      if (overlapsOccupied) continue;

      // Canyons must not touch each other
      if (wouldTouchExistingCanyon(validShape, grid)) continue;

      // Check row minimum
      const impassableSet = new Set<string>();
      // Collect existing impassable tiles
      for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
        for (let x = 0; x < MAP.GRID_WIDTH; x++) {
          if (
            grid[y][x].terrainType === TileType.CANYON ||
            grid[y][x].terrainType === TileType.WATER
          ) {
            impassableSet.add(`${x},${y}`);
          }
        }
      }

      if (wouldViolateRowMinimum(validShape, grid, impassableSet)) continue;

      // Reject candidate if it would create an oversized side deadend
      if (wouldCreateOversizedDeadend(validShape, grid, zone)) continue;

      // Place the canyon
      for (const p of validShape) {
        grid[p.y][p.x].terrainType = TileType.CANYON;
        markPositionOccupied(p, occupiedPositions);
      }
      placed = true;
    }
  }
}

/**
 * Checks whether any position in a candidate canyon shape is adjacent
 * (orthogonally or diagonally) to an existing CANYON tile on the grid.
 * This prevents canyons from touching each other.
 */
function wouldTouchExistingCanyon(
  shape: Position[],
  grid: Tile[][],
): boolean {
  const shapeSet = new Set(shape.map((p) => `${p.x},${p.y}`));
  for (const p of shape) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
        if (shapeSet.has(`${nx},${ny}`)) continue;
        if (grid[ny][nx].terrainType === TileType.CANYON) return true;
      }
    }
  }
  return false;
}

/**
 * Checks whether any position in a candidate lake shape is adjacent
 * (orthogonally or diagonally) to an existing WATER tile on the grid.
 * This prevents lakes from touching each other.
 */
function wouldTouchExistingLake(
  shape: Position[],
  grid: Tile[][],
): boolean {
  const shapeSet = new Set(shape.map((p) => `${p.x},${p.y}`));
  for (const p of shape) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
        if (shapeSet.has(`${nx},${ny}`)) continue;
        if (grid[ny][nx].terrainType === TileType.WATER) return true;
      }
    }
  }
  return false;
}

/**
 * Places lakes across the map (starting in a zone but allowed to span into
 * neighbouring zones). Validates row minimum, stronghold distance, and
 * ensures lakes do not touch each other.
 */
function placeLakesForZone(
  zone: number,
  grid: Tile[][],
  occupiedPositions: Set<string>,
  strongholdPositions: Position[],
): void {
  const [startRow, endRow] = getZoneRowRange(zone);
  const count = randomInRange(TERRAIN.LAKES_PER_ZONE_MIN, TERRAIN.LAKES_PER_ZONE_MAX);
  const lavaBufferStart = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS;

  for (let i = 0; i < count; i++) {
    let placed = false;
    let attempts = 0;
    const maxAttempts = 20;

    while (!placed && attempts < maxAttempts) {
      attempts++;
      const w = randomInRange(TERRAIN.LAKE_WIDTH_MIN, TERRAIN.LAKE_WIDTH_MAX);
      const h = randomInRange(TERRAIN.LAKE_HEIGHT_MIN, TERRAIN.LAKE_HEIGHT_MAX);

      // Pick an origin so bounding box starts within the zone; lake may extend beyond zone rows
      const maxOriginX = MAP.GRID_WIDTH - w;
      const maxOriginY = Math.min(endRow, lavaBufferStart - h);
      if (maxOriginX < 0 || maxOriginY < startRow) continue;

      const ox = randomInRange(Math.max(0, 1), Math.min(maxOriginX, MAP.GRID_WIDTH - 2));
      const oy = randomInRange(startRow, maxOriginY);

      const shape = generateLakeShape(ox, oy, w, h);

      // Filter: in grid bounds, not in lava buffer (no zone restriction)
      const validShape = shape.filter(
        (p) =>
          p.y >= 0 &&
          p.y < lavaBufferStart &&
          p.x >= 0 &&
          p.x < MAP.GRID_WIDTH,
      );

      if (validShape.length === 0) continue;

      // Check stronghold proximity
      const tooClose = validShape.some((p) =>
        isTooCloseToStronghold(p, strongholdPositions),
      );
      if (tooClose) continue;

      // Reject candidate if any tile would overwrite a building, ruin, forest, or mountain.
      // Positions that are already CANYON/WATER in occupiedPositions are fine — the
      // placement loop below skips those tiles rather than overwriting them.
      const overlapsOccupied = validShape.some((p) =>
        isPositionOccupied(p, occupiedPositions) &&
        grid[p.y][p.x].terrainType !== TileType.CANYON &&
        grid[p.y][p.x].terrainType !== TileType.WATER
      );
      if (overlapsOccupied) continue;

      // Lakes must not touch each other
      if (wouldTouchExistingLake(validShape, grid)) continue;

      // Check row minimum
      const impassableSet = new Set<string>();
      for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
        for (let x = 0; x < MAP.GRID_WIDTH; x++) {
          if (
            grid[y][x].terrainType === TileType.CANYON ||
            grid[y][x].terrainType === TileType.WATER
          ) {
            impassableSet.add(`${x},${y}`);
          }
        }
      }

      if (wouldViolateRowMinimum(validShape, grid, impassableSet)) continue;

      // Reject candidate if it would create an oversized side deadend
      if (wouldCreateOversizedDeadend(validShape, grid, zone)) continue;

      // Place the lake — skip tiles already occupied by another impassable type
      for (const p of validShape) {
        if (
          grid[p.y][p.x].terrainType !== TileType.CANYON &&
          grid[p.y][p.x].terrainType !== TileType.WATER
        ) {
          grid[p.y][p.x].terrainType = TileType.WATER;
          markPositionOccupied(p, occupiedPositions);
        }
      }
      placed = true;
    }
  }
}

// ============================================================================
// TRAVERSABILITY CHECKS
// ============================================================================

/**
 * Checks if a tile is impassable (CANYON, WATER, or lava).
 */
function isImpassableTile(tile: Tile): boolean {
  return (
    tile.isLava ||
    tile.terrainType === TileType.CANYON ||
    tile.terrainType === TileType.WATER
  );
}

/**
 * BFS flood fill from a set of starting positions, returning all reachable passable tiles.
 */
function bfsFloodFill(grid: Tile[][], startPositions: Position[]): Set<string> {
  const visited = new Set<string>();
  const queue: Position[] = [];

  for (const p of startPositions) {
    const tile = grid[p.y]?.[p.x];
    if (tile && !isImpassableTile(tile)) {
      const key = `${p.x},${p.y}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(p);
      }
    }
  }

  let qi = 0;
  while (queue.length > qi) {
    const current = queue[qi++];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const tile = grid[ny][nx];
      if (isImpassableTile(tile)) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return visited;
}

/**
 * Checks if the map is fully traversable south-to-north and north-to-south (no cul-de-sacs).
 * Returns true if the map passes, false otherwise.
 */
function isMapFullyTraversable(grid: Tile[][]): boolean {
  const southRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1;
  const northRow = 0;

  // Collect passable tiles in south and north rows
  const southStarts: Position[] = [];
  const northStarts: Position[] = [];
  for (let x = 0; x < MAP.GRID_WIDTH; x++) {
    if (!isImpassableTile(grid[southRow][x])) {
      southStarts.push({ x, y: southRow });
    }
    if (!isImpassableTile(grid[northRow][x])) {
      northStarts.push({ x, y: northRow });
    }
  }

  if (southStarts.length === 0 || northStarts.length === 0) return false;

  // BFS from south
  const reachableFromSouth = bfsFloodFill(grid, southStarts);

  // Check that at least one north tile is reachable
  const northReached = northStarts.some((p) => reachableFromSouth.has(`${p.x},${p.y}`));
  if (!northReached) return false;

  // BFS from north
  const reachableFromNorth = bfsFloodFill(grid, northStarts);

  // Check that at least one south tile is reachable from north
  const southReached = southStarts.some((p) => reachableFromNorth.has(`${p.x},${p.y}`));
  if (!southReached) return false;

  return true;
}

/**
 * Removes cul-de-sac pockets by clearing impassable terrain tiles that block
 * bidirectional traversability. Tiles reachable from south but not from north
 * (or vice versa) are considered adjacent to a blockage — the adjacent impassable
 * tiles are reverted to PLAINS.
 */
function removeCulDeSacs(grid: Tile[][]): void {
  const southRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1;
  const northRow = 0;

  const southStarts: Position[] = [];
  const northStarts: Position[] = [];
  for (let x = 0; x < MAP.GRID_WIDTH; x++) {
    if (!isImpassableTile(grid[southRow][x])) southStarts.push({ x, y: southRow });
    if (!isImpassableTile(grid[northRow][x])) northStarts.push({ x, y: northRow });
  }

  const reachableFromSouth = bfsFloodFill(grid, southStarts);
  const reachableFromNorth = bfsFloodFill(grid, northStarts);

  // Find cul-de-sac pockets: tiles reachable from one direction but not the other
  const pockets: Position[] = [];
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      const key = `${x},${y}`;
      if (isImpassableTile(grid[y][x])) continue;
      const fromSouth = reachableFromSouth.has(key);
      const fromNorth = reachableFromNorth.has(key);
      if (fromSouth !== fromNorth) {
        pockets.push({ x, y });
      }
    }
  }

  if (pockets.length === 0) return;

  // Remove impassable terrain tiles adjacent to pocket tiles
  const toRemove = new Set<string>();
  for (const p of pockets) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const tile = grid[ny][nx];
      if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) {
        toRemove.add(`${nx},${ny}`);
      }
    }
  }

  for (const key of toRemove) {
    const [xStr, yStr] = key.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    grid[y][x].terrainType = TileType.PLAINS;
  }
}

/**
 * Ensures the map is fully traversable south-to-north with no cul-de-sacs.
 * If BFS fails, removes problematic terrain. Falls back to clearing all
 * canyon/water tiles if needed.
 */
function ensureTraversability(grid: Tile[][]): void {
  // First pass: remove cul-de-sacs
  for (let attempt = 0; attempt < TERRAIN.MAX_TRAVERSABILITY_RETRIES; attempt++) {
    if (isMapFullyTraversable(grid)) {
      // Check for cul-de-sacs
      removeCulDeSacs(grid);
      if (isMapFullyTraversable(grid)) {
        return; // Map is clean
      }
    } else {
      // Remove cul-de-sacs which may also fix traversability
      removeCulDeSacs(grid);
      if (isMapFullyTraversable(grid)) {
        return;
      }
    }
  }

  // Fallback: clear all canyon and water tiles
  console.warn('Map traversability could not be ensured — clearing all canyon/water terrain.');
  for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
    for (let x = 0; x < MAP.GRID_WIDTH; x++) {
      if (
        grid[y][x].terrainType === TileType.CANYON ||
        grid[y][x].terrainType === TileType.WATER
      ) {
        grid[y][x].terrainType = TileType.PLAINS;
      }
    }
  }
}

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
        isRevealed: false,
        buildingId: null,
        unitId: null,
        isLava: false,
        isLavaPreview: false,
        isRuin: false,
        isStrongholdRuin: false,
        terrainType: TileType.PLAINS,
        status: null,
      });
    }
    grid.push(row);
  }

  return grid;
}

// ============================================================================
// MARKET PLACEMENT
// ============================================================================

/**
 * Place Market buildings in eligible middle zones after all other buildings
 * have been generated (so occupancy is correctly known).
 *
 * Eligible zones = all zones EXCEPT the first EXCLUDED_ZONES_HEAD and the last
 * EXCLUDED_ZONES_TAIL. At ZONE_COUNT=10 and HEAD=3, TAIL=3 → eligible {4,5,6,7}.
 * Max 1 market per zone. Total count in [MIN_PER_GAME, MAX_PER_GAME].
 *
 * Each market lands on a free PLAINS tile (no building, no unit, no impassable
 * terrain). Tiles occupied by resources, ruins, forests, mountains, water, or
 * canyons are skipped.
 */
function placeMarkets(
  grid: Tile[][],
  occupiedPositions: Set<string>,
  state: null,
): Building[] {
  const eligibleZones: number[] = [];
  for (let z = MARKET.EXCLUDED_ZONES_HEAD + 1; z <= MAP.ZONE_COUNT - MARKET.EXCLUDED_ZONES_TAIL; z++) {
    eligibleZones.push(z);
  }
  if (eligibleZones.length === 0) return [];

  const targetCount = Math.min(
    Math.floor(Math.random() * (MARKET.MAX_PER_GAME - MARKET.MIN_PER_GAME + 1)) + MARKET.MIN_PER_GAME,
    eligibleZones.length,
  );

  // Shuffle eligible zones to avoid always picking the first
  const shuffled = [...eligibleZones];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const placed: Building[] = [];
  for (let i = 0; i < targetCount && i < shuffled.length; i++) {
    const zone = shuffled[i];
    const [startRow, endRow] = getZoneRowRange(zone);

    // Collect all free PLAINS tiles in this zone
    const candidates: Position[] = [];
    for (let y = startRow; y <= endRow; y++) {
      for (let x = 0; x < MAP.GRID_WIDTH; x++) {
        const tile = grid[y]?.[x];
        if (!tile) continue;
        if (tile.terrainType !== TileType.PLAINS) continue;
        if (tile.isRuin || tile.isStrongholdRuin || tile.isLava) continue;
        if (tile.buildingId !== null) continue;
        if (isPositionOccupied({ x, y }, occupiedPositions)) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) continue;

    const chosenPos = candidates[Math.floor(Math.random() * candidates.length)];
    const market = createMarket(state, chosenPos);
    markPositionOccupied(chosenPos, occupiedPositions);
    placed.push(market);
  }

  return placed;
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generates the initial game state for Volcanae.
 */
export function generateInitialGameState(difficulty: Difficulty = Difficulty.STANDARD): GameState {
  // Reset ID counter for consistent generation
  resetIdCounter();

  // Seed the market RNG using Math.random (same as the map generator itself).
  setMarketRandomSource(Math.random);

  // Track occupied positions for placement
  const occupiedPositions = new Set<string>();

  // Create the grid
  const grid = createGrid();

  // Pre-select stronghold positions for all zones (mark as occupied so terrain avoids them)
  const strongholdPositions: Position[] = [];
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const pos = getRandomPositionInZone(
      zone,
      occupiedPositions,
      BUILDINGS.STRONGHOLD_SPAWN_SKIP_FIRST_ROWS,
      BUILDINGS.STRONGHOLD_SPAWN_SKIP_LAST_ROWS,
      undefined,
      BUILDINGS.STRONGHOLD_SPAWN_BORDER_MARGIN,
      BUILDINGS.STRONGHOLD_SPAWN_BORDER_MARGIN,
    );
    markPositionOccupied(pos, occupiedPositions);
    strongholdPositions.push(pos);
  }

  // Place canyons and lakes immediately after stronghold positions are locked in.
  // This ensures every subsequent feature (terrain, ruins, buildings) is placed only
  // on tiles that are not already occupied by impassable water or canyon terrain.
  // Canyon and lake are rolled independently for every zone — no shared roll and no
  // if/else that makes them mutually exclusive; a zone may contain either, both, or neither.
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    placeCanyonsForZone(zone, grid, occupiedPositions, strongholdPositions);
    placeLakesForZone(zone, grid, occupiedPositions, strongholdPositions);
  }

  // Verify and fix traversability immediately after all impassable terrain is placed,
  // before any other features are added on top of the final terrain layout.
  ensureTraversability(grid);

  // Place terrain for each zone with zone-balance carry-forward.
  // Canyon/lake positions are already in occupiedPositions, so forests and mountains
  // are automatically placed only on valid (non-water, non-canyon) tiles.
  let extraForests = 0;
  let extraMountains = 0;

  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const forestOverride = TERRAIN.FORESTS_PER_ZONE_OVERRIDES[zone];
    const forestMin = forestOverride !== undefined ? forestOverride.min : TERRAIN.FORESTS_PER_ZONE_MIN;
    const forestMax = forestOverride !== undefined ? forestOverride.max : TERRAIN.FORESTS_PER_ZONE_MAX;

    const mountainOverride = TERRAIN.MOUNTAINS_PER_ZONE_OVERRIDES[zone];
    const mountainMin = mountainOverride !== undefined ? mountainOverride.min : TERRAIN.MOUNTAINS_PER_ZONE_MIN;
    const mountainMax = mountainOverride !== undefined ? mountainOverride.max : TERRAIN.MOUNTAINS_PER_ZONE_MAX;

    const config = {
      forests: randomInRange(forestMin, forestMax) + extraForests,
      mountains: randomInRange(mountainMin, mountainMax) + extraMountains,
    };

    const { forestPositions, mountainPositions } = placeTerrainForZone(
      zone, grid, occupiedPositions, config
    );

    // After zone 1 terrain: guarantee forest and mountain near stronghold
    if (zone === 1) {
      guaranteeForestNearStronghold(strongholdPositions[0], grid, occupiedPositions);
      guaranteeMountainNearStronghold(strongholdPositions[0], grid, occupiedPositions);
    }

    // Zone-balance check: if zone got 0 of a type, next zone gets at least 1 extra
    extraForests = forestPositions.length === 0 ? 1 : 0;
    extraMountains = mountainPositions.length === 0 ? 1 : 0;
  }

  // Place ruins after canyons and lakes so ruins only land on genuinely valid
  // PLAINS tiles. placeRuinsForZone checks terrainType === PLAINS and skips
  // occupied positions, so it naturally avoids all canyon and water tiles.
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    placeRuinsForZone(zone, grid, occupiedPositions);
  }

  // Place ruins in the lava buffer rows (south of zone 1).
  placeRuinsInLavaBuffer(grid, occupiedPositions);

  // Generate buildings for all zones
  const allBuildings: Building[] = [];
  for (let zone = 1; zone <= MAP.ZONE_COUNT; zone++) {
    const zoneBuildings = generateBuildingsForZone(
      zone, strongholdPositions[zone - 1], occupiedPositions, grid
    );
    allBuildings.push(...zoneBuildings);
  }

  // Place markets after all zone buildings are known (occupancy is complete).
  const marketBuildings = placeMarkets(grid, occupiedPositions, null);
  allBuildings.push(...marketBuildings);

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
  const playerSpearman = createUnit(
    UnitType.SPEARMAN,
    Faction.PLAYER,
    zone1Stronghold.position
  );

  // Create 2 enemy LAVA_GRUNT units in zone 5
  const enemyUnits: Unit[] = [];
  const difficultyMult = DIFFICULTY_MULTIPLIER[difficulty];
  for (let i = 0; i < 2; i++) {
    const position = getRandomPositionInZone(5, occupiedPositions, 0, 0, grid);
    markPositionOccupied(position, occupiedPositions);
    const unit = createUnit(UnitType.LAVA_GRUNT, Faction.ENEMY, position);
    const scaledHp = Math.round(unit.stats.maxHp * difficultyMult);
    unit.stats.maxHp = scaledHp;
    unit.stats.currentHp = scaledHp;
    unit.stats.attack = Math.round(unit.stats.attack * difficultyMult);
    unit.stats.defense = Math.round(unit.stats.defense * difficultyMult);
    enemyUnits.push(unit);
  }

  // Convert units array to record
  const units: Record<string, Unit> = {};
  units[playerSpearman.id] = playerSpearman;
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
    },
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: getLavaAdvanceInterval(difficulty),
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [1, 2],
    techNodes: TECH_TREE.reduce<Record<string, TechNodeState>>((acc, def) => {
      acc[def.id] = { id: def.id, unlocked: def.id === 'CONSCRIPTION' };
      return acc;
    }, {}),
    techFlags: [],
    arcaneCrystals: TECH.CRYSTALS_ON_GAME_START,
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
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty,
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
    pendingTrapSetterId: null,
    portals: {},
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
  };

  // Auto-apply CONSCRIPTION effects (unlocked at game start, not a pick)
  const conscription = TECH_TREE.find((d) => d.id === 'CONSCRIPTION');
  if (conscription) {
    for (const effect of conscription.effects) {
      if (effect.type === 'UNLOCK_BUILDING' && !gameState.unlockedBuildings.includes(effect.buildingType)) {
        gameState.unlockedBuildings.push(effect.buildingType);
      }
      if (effect.type === 'UNLOCK_UNIT' && !gameState.unlockedUnits.includes(effect.unitType)) {
        gameState.unlockedUnits.push(effect.unitType);
      }
    }
  }

  rollNextWaveTheme(gameState, { suppressReadPlayer: true });

  return gameState;
}
