/**
 * Unit tests for computePopulationBreakdown.
 *
 * Verifies that:
 * - The sum of capacity entries equals computePopulationCapacity results.
 * - The sum of usage entries equals computePopulationUsage results.
 * - Building-type grouping is correct (farms → farmers, patrician houses → nobles,
 *   stronghold → both).
 * - SUMMONED units are excluded from usage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computePopulationBreakdown,
  computePopulationCapacity,
  computePopulationUsage,
} from '../resourceSystem';
import { UnitType, BuildingType, Faction, UnitTag, DestroyBehavior } from '../types';
import type { GameState, Unit, Building } from '../types';
import { UNIT_DEFINITIONS, POPULATION } from '../gameConfig';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let _unitId = 0;
let _buildingId = 0;
beforeEach(() => {
  _unitId = 0;
  _buildingId = 0;
});

function nextUnitId(): string { return `u_${++_unitId}`; }
function nextBuildingId(): string { return `b_${++_buildingId}`; }

function makeBuilding(type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id: nextBuildingId(),
    type,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
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

function makeFarm(populationCount: number): Building {
  return makeBuilding(BuildingType.FARM, {
    populationCount,
    populationCap: POPULATION.FARM_POPULATION_CAP,
  });
}

function makePatricianHouse(populationCount: number): Building {
  return makeBuilding(BuildingType.PATRICIANHOUSE, {
    populationCount,
    populationCap: POPULATION.PATRICIAN_HOUSE_POPULATION_CAP,
  });
}

function makeStronghold(farmers: number, nobles: number): Building {
  return makeBuilding(BuildingType.STRONGHOLD, {
    populationCount: farmers,
    populationCap: POPULATION.STRONGHOLD_FARMER_CAP,
    strongholdNobles: nobles,
  });
}

function makePlayerUnit(type: UnitType, extraTags: UnitTag[] = []): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextUnitId(),
    type,
    faction: Faction.PLAYER,
    position: { x: 1, y: 1 },
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
    tags: [...def.tags, ...extraTags],
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
    recruitedOnTurn: 1,
  };
}

function makeState(units: Unit[], buildings: Building[]): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const buildingsMap: Record<string, Building> = {};
  for (const b of buildings) buildingsMap[b.id] = b;
  return {
    units: unitsMap,
    buildings: buildingsMap,
    specialists: {},
    globalSpecialistStorage: [],
    techNodes: {},
  } as unknown as GameState;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computePopulationBreakdown — capacity sums match computePopulationCapacity', () => {
  it('farms only', () => {
    const state = makeState([], [makeFarm(2), makeFarm(1)]);
    const breakdown = computePopulationBreakdown(state);
    const { farmerCapacity, nobleCapacity } = computePopulationCapacity(state);

    expect(breakdown.farmerCapacity).toBe(farmerCapacity);
    expect(breakdown.nobleCapacity).toBe(nobleCapacity);

    const capFarmers = breakdown.capacityEntries.reduce((s, e) => s + e.farmers, 0);
    const capNobles = breakdown.capacityEntries.reduce((s, e) => s + e.nobles, 0);
    expect(capFarmers).toBe(farmerCapacity);
    expect(capNobles).toBe(nobleCapacity);

    // Should have one entry for farms
    expect(breakdown.capacityEntries).toHaveLength(1);
    expect(breakdown.capacityEntries[0].label).toMatch(/Farm ×2/);
    expect(breakdown.capacityEntries[0].farmers).toBe(3);
  });

  it('patrician houses only', () => {
    const state = makeState([], [makePatricianHouse(2), makePatricianHouse(2)]);
    const breakdown = computePopulationBreakdown(state);
    const { farmerCapacity, nobleCapacity } = computePopulationCapacity(state);

    expect(breakdown.nobleCapacity).toBe(nobleCapacity);
    expect(breakdown.farmerCapacity).toBe(farmerCapacity);

    const capNobles = breakdown.capacityEntries.reduce((s, e) => s + e.nobles, 0);
    expect(capNobles).toBe(nobleCapacity);
    expect(breakdown.capacityEntries[0].label).toMatch(/Patrician House ×2/);
  });

  it('stronghold contributes to both farmers and nobles', () => {
    const state = makeState([], [makeStronghold(2, 2)]);
    const breakdown = computePopulationBreakdown(state);
    const { farmerCapacity, nobleCapacity } = computePopulationCapacity(state);

    expect(breakdown.farmerCapacity).toBe(farmerCapacity);
    expect(breakdown.nobleCapacity).toBe(nobleCapacity);

    const sh = breakdown.capacityEntries.find((e) => e.label.includes('Stronghold'));
    expect(sh).toBeDefined();
    expect(sh!.farmers).toBe(2);
    expect(sh!.nobles).toBe(2);
    // Label references config caps
    expect(sh!.label).toMatch(/max/);
    expect(sh!.label).toMatch(new RegExp(String(POPULATION.STRONGHOLD_FARMER_CAP)));
  });

  it('mixed buildings', () => {
    const buildings = [makeFarm(2), makeFarm(1), makePatricianHouse(2), makeStronghold(1, 2)];
    const state = makeState([], buildings);
    const breakdown = computePopulationBreakdown(state);
    const { farmerCapacity, nobleCapacity } = computePopulationCapacity(state);

    expect(breakdown.farmerCapacity).toBe(farmerCapacity); // 2+1+1 = 4
    expect(breakdown.nobleCapacity).toBe(nobleCapacity);   // 2+2 = 4

    const capFarmers = breakdown.capacityEntries.reduce((s, e) => s + e.farmers, 0);
    const capNobles = breakdown.capacityEntries.reduce((s, e) => s + e.nobles, 0);
    expect(capFarmers).toBe(farmerCapacity);
    expect(capNobles).toBe(nobleCapacity);
  });
});

describe('computePopulationBreakdown — usage sums match computePopulationUsage', () => {
  it('spearmen only (farmers cost)', () => {
    const units = Array.from({ length: 3 }, () => makePlayerUnit(UnitType.SPEARMAN));
    const state = makeState(units, []);
    const breakdown = computePopulationBreakdown(state);
    const { farmersUsed, noblesUsed } = computePopulationUsage(state);

    expect(breakdown.farmersUsed).toBe(farmersUsed); // 3
    expect(breakdown.noblesUsed).toBe(noblesUsed);   // 0

    const usageFarmers = breakdown.usageEntries.reduce((s, e) => s + e.farmers, 0);
    const usageNobles = breakdown.usageEntries.reduce((s, e) => s + e.nobles, 0);
    expect(usageFarmers).toBe(farmersUsed);
    expect(usageNobles).toBe(noblesUsed);

    expect(breakdown.usageEntries).toHaveLength(1);
    expect(breakdown.usageEntries[0].unitType).toBe(UnitType.SPEARMAN);
    expect(breakdown.usageEntries[0].count).toBe(3);
  });

  it('guards only (nobles cost)', () => {
    const units = Array.from({ length: 4 }, () => makePlayerUnit(UnitType.GUARD));
    const state = makeState(units, []);
    const breakdown = computePopulationBreakdown(state);
    const { farmersUsed, noblesUsed } = computePopulationUsage(state);

    expect(breakdown.noblesUsed).toBe(noblesUsed); // 4
    expect(breakdown.farmersUsed).toBe(farmersUsed); // 0

    const usageNobles = breakdown.usageEntries.reduce((s, e) => s + e.nobles, 0);
    expect(usageNobles).toBe(noblesUsed);
  });

  it('siege costs both farmers and nobles', () => {
    const units = [makePlayerUnit(UnitType.SIEGE), makePlayerUnit(UnitType.SIEGE)];
    const state = makeState(units, []);
    const breakdown = computePopulationBreakdown(state);
    const { farmersUsed, noblesUsed } = computePopulationUsage(state);

    expect(breakdown.farmersUsed).toBe(farmersUsed); // 2
    expect(breakdown.noblesUsed).toBe(noblesUsed);   // 2

    const entry = breakdown.usageEntries.find((e) => e.unitType === UnitType.SIEGE);
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(2);
    expect(entry!.farmers).toBe(2);
    expect(entry!.nobles).toBe(2);
  });

  it('mixed unit types', () => {
    const units = [
      ...Array.from({ length: 5 }, () => makePlayerUnit(UnitType.GUARD)),
      ...Array.from({ length: 3 }, () => makePlayerUnit(UnitType.MAGE)),
      makePlayerUnit(UnitType.SIEGE),
      makePlayerUnit(UnitType.RIDER),
    ];
    const state = makeState(units, []);
    const breakdown = computePopulationBreakdown(state);
    const { farmersUsed, noblesUsed } = computePopulationUsage(state);

    expect(breakdown.farmersUsed).toBe(farmersUsed); // 1 (siege)
    expect(breakdown.noblesUsed).toBe(noblesUsed);   // 10 (5+3+1+1)

    const usageFarmers = breakdown.usageEntries.reduce((s, e) => s + e.farmers, 0);
    const usageNobles = breakdown.usageEntries.reduce((s, e) => s + e.nobles, 0);
    expect(usageFarmers).toBe(farmersUsed);
    expect(usageNobles).toBe(noblesUsed);
  });

  it('SUMMONED units are excluded from usage', () => {
    const summoned = makePlayerUnit(UnitType.CRYSTAL_DRAKE);
    expect(summoned.tags).toContain(UnitTag.SUMMONED);

    const state = makeState([summoned], []);
    const breakdown = computePopulationBreakdown(state);
    expect(breakdown.farmersUsed).toBe(0);
    expect(breakdown.noblesUsed).toBe(0);
    expect(breakdown.usageEntries).toHaveLength(0);
  });

  it('units with zero population cost are excluded from usage entries', () => {
    // SKELETON has populationCost { farmers: 0, nobles: 0 }
    const skeletons = Array.from({ length: 3 }, () => makePlayerUnit(UnitType.SKELETON));
    const state = makeState(skeletons, []);
    const breakdown = computePopulationBreakdown(state);
    expect(breakdown.farmersUsed).toBe(0);
    expect(breakdown.noblesUsed).toBe(0);
    expect(breakdown.usageEntries).toHaveLength(0);
  });
});
