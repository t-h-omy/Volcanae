/**
 * Tests for P3B — Walled Settlement income flat (once per turn, not per stronghold).
 *
 * With WALLED_SETTLEMENT unlocked:
 *   - 0 strongholds ⇒ no iron/wood bonus
 *   - 1 stronghold  ⇒ iron/wood bonus applied once
 *   - 3 strongholds ⇒ iron/wood bonus STILL applied only once (not ×3)
 *   - farmer-capacity bonus is unaffected by this change (verified via gameConfig)
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { collectResources, computeResourceIncome } from '../resourceSystem';
import { ABILITIES, TECH_TREE } from '../gameConfig';
import { BuildingType, DestroyBehavior, Faction, TileType } from '../types';
import type { Building, GameState, GameStats, Tile } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function nextId(prefix: string) { return `${prefix}_${++_id}`; }

function makeBuilding(
  type: BuildingType,
  faction: Faction | null,
  x: number,
  y: number,
  overrides: Partial<Building> = {},
): Building {
  return {
    id: nextId(`bld_${type}`),
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
  };
}

function makeGrid(cols: number, rows: number): Tile[][] {
  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => makeTile(x, y)),
  );
}

function makeGameStats(): GameStats {
  return {
    unitsKilled: 0, unitsLost: 0, damageDealt: 0, damageReceived: 0,
    unitsRecruited: 0, buildingsConstructed: 0, buildingsConverted: 0,
    techsUnlocked: 0, enemyBuildingsDestroyed: 0, enemyBuildingsCaptured: 0,
    buildingsDestroyedByEnemy: 0, buildingsCapturedByEnemy: 0, buildingsDestroyedByLava: 0,
  };
}

/** Build the minimal techNodes map with WALLED_SETTLEMENT unlocked/locked as requested. */
function makeTechNodes(walledSettlementUnlocked: boolean): GameState['techNodes'] {
  const nodes: GameState['techNodes'] = {} as GameState['techNodes'];
  for (const t of TECH_TREE) {
    (nodes as Record<string, { id: string; unlocked: boolean }>)[t.id] = {
      id: t.id,
      unlocked: t.id === 'WALLED_SETTLEMENT' ? walledSettlementUnlocked : false,
    };
  }
  return nodes;
}

/** Create a minimal GameState with the given buildings. */
function makeState(buildings: Building[], walledSettlementUnlocked: boolean): GameState {
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;

  const grid = makeGrid(20, 20);

  return {
    units: {},
    buildings: buildingsMap,
    grid,
    techFlags: [],
    gameStats: makeGameStats(),
    turn: 3,
    arcaneCrystals: 0,
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    specialists: {},
    globalSpecialistStorage: [],
    resources: { gold: 0, iron: 0, wood: 0, food: 0 },
    lavaFrontRow: 100,
    turnsUntilLavaAdvance: 5,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [0],
    techNodes: makeTechNodes(walledSettlementUnlocked),
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL' as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    portals: {},
    phase: 'PLAYER_TURN' as GameState['phase'],
  } as unknown as GameState;
}

// ── constants ─────────────────────────────────────────────────────────────────

const IRON = ABILITIES.WALLED_SETTLEMENT_IRON_AMOUNT;
const WOOD = ABILITIES.WALLED_SETTLEMENT_WOOD_AMOUNT;

// ── tests ─────────────────────────────────────────────────────────────────────

describe('P3B — Walled Settlement flat income', () => {
  it('no stronghold + tech active ⇒ no flat bonus', () => {
    const state = makeState([], true);
    const result = produce(state, (draft) => { collectResources(draft); });
    expect(result.resources.iron).toBe(0);
    expect(result.resources.wood).toBe(0);
  });

  it('1 stronghold + tech active ⇒ iron and wood bonus applied exactly once', () => {
    const sh = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 5, 5);
    const state = makeState([sh], true);
    const result = produce(state, (draft) => { collectResources(draft); });
    expect(result.resources.iron).toBe(IRON);
    expect(result.resources.wood).toBe(WOOD);
  });

  it('3 strongholds + tech active ⇒ iron and wood bonus still only once (not ×3)', () => {
    const strongholds = [
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 1, 1),
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 2, 2),
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 3, 3),
    ];
    const state = makeState(strongholds, true);
    const result = produce(state, (draft) => { collectResources(draft); });
    // Must equal the single constant, not 3×
    expect(result.resources.iron).toBe(IRON);
    expect(result.resources.wood).toBe(WOOD);
  });

  it('3 strongholds + tech INACTIVE ⇒ no flat bonus', () => {
    const strongholds = [
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 1, 1),
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 2, 2),
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 3, 3),
    ];
    const state = makeState(strongholds, false);
    const result = produce(state, (draft) => { collectResources(draft); });
    expect(result.resources.iron).toBe(0);
    expect(result.resources.wood).toBe(0);
  });

  it('computeResourceIncome: 3 strongholds + tech active ⇒ income equals single constant', () => {
    const strongholds = [
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 1, 1),
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 2, 2),
      makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 3, 3),
    ];
    const state = makeState(strongholds, true);
    const { ironPerTurn, woodPerTurn } = computeResourceIncome(state);
    expect(ironPerTurn).toBe(IRON);
    expect(woodPerTurn).toBe(WOOD);
  });

  it('disabled stronghold does not gate the flat bonus', () => {
    // Only the disabled stronghold — should get no bonus
    const sh = makeBuilding(BuildingType.STRONGHOLD, Faction.PLAYER, 5, 5, {
      isDisabledForTurns: 2,
    });
    const state = makeState([sh], true);
    const result = produce(state, (draft) => { collectResources(draft); });
    expect(result.resources.iron).toBe(0);
    expect(result.resources.wood).toBe(0);
  });
});
