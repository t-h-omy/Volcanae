/**
 * Corruption system module for Volcanae.
 * Implements terrain corruption by enemy units with the CORRUPT tag.
 * Corruption creates EMBER_NEST (on FOREST) or MAGMA_SPYR (on MOUNTAIN) buildings.
 * The terrain type is preserved — only a building is added.
 */

import type { GameState, Position, Unit, Building } from './types';
import type { Draft } from 'immer';
import { Faction, TileType, UnitTag, UnitType, BuildingType } from './types';
import { LAVA_LAIR, UNITS, MAP, BUILDINGS } from './gameConfig';
import { generateId } from './mapGenerator';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { resolveBuildingAttack, buildingToCombatant } from './combatSystem';
import type { GameEvent } from './gameEvents';

/**
 * Corrupts the terrain at the given tile position by creating an enemy building.
 * - FOREST tile → creates EMBER_NEST
 * - MOUNTAIN tile → creates MAGMA_SPYR (with combat stats)
 * The terrain type on the tile is unchanged.
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param unitId - ID of the unit performing the corruption
 * @param tilePos - Position of the tile to corrupt
 */
export function corruptTerrain(
  state: Draft<GameState>,
  unitId: string,
  tilePos: Position,
): void {
  const unit = state.units[unitId];
  if (!unit) return;

  // Unit must have the CORRUPT tag
  if (!unit.tags.includes(UnitTag.CORRUPT)) return;

  // Unit must be on the tile
  if (unit.position.x !== tilePos.x || unit.position.y !== tilePos.y) return;

  // Unit must not have acted this turn
  if (unit.hasActedThisTurn) return;

  const tile = state.grid[tilePos.y]?.[tilePos.x];
  if (!tile) return;

  // Must be FOREST or MOUNTAIN terrain
  if (tile.terrainType !== TileType.FOREST && tile.terrainType !== TileType.MOUNTAIN) return;

  // Must not already have a building
  if (tile.buildingId) return;

  // Determine building type based on terrain
  const buildingType = tile.terrainType === TileType.FOREST
    ? BuildingType.EMBERNEST
    : BuildingType.MAGMASPYR;

  // Create the building
  const isMagmaSpyr = buildingType === BuildingType.MAGMASPYR;
  const maxHp = isMagmaSpyr ? LAVA_LAIR.MAGMA_SPYR_STATS.maxHp : 100;

  const combatStats = isMagmaSpyr
    ? {
        attack: LAVA_LAIR.MAGMA_SPYR_STATS.attack,
        defense: LAVA_LAIR.MAGMA_SPYR_STATS.defense,
        attackRange: LAVA_LAIR.MAGMA_SPYR_STATS.attackRange,
        maxAttacksPerTurn: LAVA_LAIR.MAGMA_SPYR_STATS.maxAttacksPerTurn,
      }
    : null;

  const tags: UnitTag[] = isMagmaSpyr ? [UnitTag.RANGED] : [];

  const newBuilding: Building = {
    id: generateId('building'),
    type: buildingType,
    faction: Faction.ENEMY,
    position: { ...tilePos },
    hp: maxHp,
    maxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDINGS.DISCOVER_RADIUS[buildingType],
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats,
    hasActedThisTurn: false,
    tags,
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
  };

  // Add building to state
  state.buildings[newBuilding.id] = newBuilding;

  // Set grid tile buildingId
  tile.buildingId = newBuilding.id;

  // Mark unit as having acted
  unit.hasMovedThisTurn = true;
  unit.hasActedThisTurn = true;
}

/**
 * Checks if a player unit can de-corrupt a corrupted terrain building.
 * De-corruption uses the existing capture mechanic — this is a convenience check.
 *
 * @returns true if the unit can capture (de-corrupt) the building
 */
export function canDecorrupt(
  state: Draft<GameState>,
  unitId: string,
  buildingId: string,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;

  // Must have BUILD_AND_CAPTURE tag
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;

  const building = state.buildings[buildingId];
  if (!building) return false;

  // Must be a corruption building
  if (building.type !== BuildingType.MAGMASPYR && building.type !== BuildingType.EMBERNEST) return false;

  // Must be enemy-owned
  if (building.faction !== Faction.ENEMY) return false;

  // Unit must be on the building's tile
  if (unit.position.x !== building.position.x || unit.position.y !== building.position.y) return false;

  return true;
}

/**
 * Processes attacks from all MAGMA_SPYR buildings during the enemy turn.
 * Each MAGMA_SPYR can attack up to maxAttacksPerTurn different player units in range.
 * Called after enemy unit movement.
 */
export function processMagmaSpyrAttacks(
  state: Draft<GameState>,
  events: GameEvent[],
): void {
  const suppressFloaters = true; // Always suppress when emitting events

  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (building.type !== BuildingType.MAGMASPYR) continue;
    if (!building.combatStats) continue;
    if (building.hasActedThisTurn) continue;

    const attackRange = building.combatStats.attackRange;
    const maxAttacks = building.combatStats.maxAttacksPerTurn ?? 1;
    const bCombatant = buildingToCombatant(building);
    if (!bCombatant) continue;

    // Find all player units in attack range
    const targets: { unit: Unit; score: number; distance: number }[] = [];
    for (const unit of Object.values(state.units)) {
      if (unit.faction !== Faction.PLAYER) continue;
      if (!isTileWithinEdgeCircleRange(
        building.position.x, building.position.y,
        unit.position.x, unit.position.y,
        attackRange,
      )) continue;

      const distance = Math.abs(unit.position.x - building.position.x) +
        Math.abs(unit.position.y - building.position.y);
      // Priority: closest first, then lowest HP
      targets.push({ unit, score: 0, distance });
    }

    // Sort by distance (closest first), then by HP (lowest first)
    targets.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.unit.stats.currentHp - b.unit.stats.currentHp;
    });

    // Attack up to maxAttacks different player units
    let attacksPerformed = 0;
    for (const target of targets) {
      if (attacksPerformed >= maxAttacks) break;

      const targetUnit = state.units[target.unit.id];
      if (!targetUnit) continue;

      const buildingPos = { x: building.position.x, y: building.position.y };
      const defenderPos = { x: targetUnit.position.x, y: targetUnit.position.y };
      const buildingHpBefore = building.hp;
      const defenderHpBefore = targetUnit.stats.currentHp;
      const defenderId = target.unit.id;

      resolveBuildingAttack(state, building.id, defenderId, suppressFloaters);

      const buildingAfter = state.buildings[building.id];
      const defenderAfter = state.units[defenderId];

      events.push({
        type: 'BUILDING_ATTACK',
        buildingId: building.id,
        defenderId,
        buildingPosition: buildingPos,
        defenderPosition: defenderPos,
        buildingHpLost: buildingAfter ? buildingHpBefore - buildingAfter.hp : buildingHpBefore,
        defenderHpLost: defenderAfter ? defenderHpBefore - defenderAfter.stats.currentHp : defenderHpBefore,
      });

      if (!defenderAfter) {
        events.push({
          type: 'UNIT_DEATH',
          unitId: defenderId,
          position: defenderPos,
          faction: targetUnit.faction,
        });
      }

      attacksPerformed++;

      // If the building was destroyed by counter-attack, stop
      if (!buildingAfter || buildingAfter.hp <= 0) break;
    }

    // Mark building as having acted
    const bAfter = state.buildings[building.id];
    if (bAfter) {
      bAfter.hasActedThisTurn = true;
    }
  }
}

/**
 * Processes Emberling spawns from EMBER_NEST buildings at the start of the enemy turn.
 * Each EMBER_NEST increments its spawn counter; when the counter reaches the spawn interval,
 * it spawns an EMBERLING at a free adjacent tile (if under the max nearby limit).
 */
export function processEmberNestSpawns(
  state: Draft<GameState>,
  events: GameEvent[],
): void {
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.ENEMY) continue;
    if (building.type !== BuildingType.EMBERNEST) continue;

    // Increment spawn counter
    building.emberSpawnCounter += 1;

    if (building.emberSpawnCounter < LAVA_LAIR.EMBER_NEST_SPAWN_INTERVAL) continue;

    // Count active EMBERLINGs within 8 tiles
    let nearbyEmberlings = 0;
    for (const unit of Object.values(state.units)) {
      if (unit.type !== UnitType.EMBERLING) continue;
      const dist = Math.abs(unit.position.x - building.position.x) +
        Math.abs(unit.position.y - building.position.y);
      if (dist <= 8) {
        nearbyEmberlings++;
      }
    }

    if (nearbyEmberlings >= LAVA_LAIR.EMBER_NEST_MAX_EMBERLINGS) continue;

    // Find nearest free adjacent tile to spawn on
    const spawnPos = findFreeAdjacentTile(state, building.position);
    if (!spawnPos) continue;

    // Create EMBERLING unit
    const unitConfig = UNITS[UnitType.EMBERLING];
    const newUnit: Unit = {
      id: generateId('unit'),
      type: UnitType.EMBERLING,
      faction: Faction.ENEMY,
      position: { ...spawnPos },
      stats: {
        maxHp: unitConfig.maxHp,
        currentHp: unitConfig.maxHp,
        attack: unitConfig.attack,
        defense: unitConfig.defense,
        moveRange: unitConfig.moveRange,
        discoverRadius: unitConfig.discoverRadius,
        triggerRange: unitConfig.triggerRange,
        movementActions: unitConfig.movementActions,
        attackRange: unitConfig.attackRange,
      },
      tags: [UnitTag.SACRIFICIAL, UnitTag.EXPLOSIVE],
      hasMovedThisTurn: false,
      hasActedThisTurn: false,
      hasCapturedThisTurn: false,
    };

    // Snapshot BEFORE assigning to draft
    const unitSnapshot: Unit = {
      ...newUnit,
      position: { ...newUnit.position },
      stats: { ...newUnit.stats },
      tags: [...newUnit.tags],
    };

    state.units[newUnit.id] = newUnit;
    state.grid[spawnPos.y][spawnPos.x].unitId = newUnit.id;

    // Reset spawn counter
    building.emberSpawnCounter = 0;

    // Emit spawn event
    events.push({
      type: 'ENEMY_SPAWN',
      position: { ...spawnPos },
      unit: unitSnapshot,
      buildingId: building.id,
    });
  }
}

/**
 * Finds the nearest free adjacent tile (4 cardinal directions) to the given position.
 * A tile is free if it has no unit, no building, is not lava, and is within bounds.
 */
function findFreeAdjacentTile(state: Draft<GameState>, pos: Position): Position | null {
  const directions = [
    { x: 0, y: -1 }, // north (south on screen since y=0 is top)
    { x: 1, y: 0 },  // east
    { x: 0, y: 1 },  // south
    { x: -1, y: 0 }, // west
  ];

  for (const dir of directions) {
    const nx = pos.x + dir.x;
    const ny = pos.y + dir.y;
    if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
    const tile = state.grid[ny][nx];
    if (tile.unitId !== null) continue;
    if (tile.isLava) continue;
    // Allow spawn even if there's a building (the unit can occupy the tile)
    return { x: nx, y: ny };
  }

  return null;
}
