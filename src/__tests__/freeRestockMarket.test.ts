/**
 * Tests for the free market restock feature (VG-09).
 *
 * Covers:
 *  - free restock works on a fresh market (lastFreeRestockTurn undefined)
 *  - sets lastFreeRestockTurn after use
 *  - refused while on cooldown (turn delta < FREE_RESTOCK_INTERVAL_TURNS)
 *  - works again after FREE_RESTOCK_INTERVAL_TURNS have elapsed
 *  - save round-trip preserves lastFreeRestockTurn
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { useGameStore } from '../gameStore';
import { setMarketRandomSource } from '../marketSystem';
import { MARKET } from '../gameConfig';
import { BuildingType, DestroyBehavior, TileType } from '../types';
import type { Building, Tile } from '../types';
import { MAP } from '../gameConfig';
import { saveSlotStrict, loadSlot } from '../saveSystem';
import type { GameState } from '../types';

// ============================================================================
// Helpers
// ============================================================================

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
    hasCaveMonster: false,
    status: null,
  } as unknown as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

let idSeq = 0;
function nextId(prefix = 'x'): string {
  return `${prefix}${++idSeq}`;
}

function makeMarketBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: nextId('m'),
    type: BuildingType.MARKET,
    faction: null,
    position: { x: 0, y: 0 },
    hp: MARKET.MAX_HP,
    maxHp: MARKET.MAX_HP,
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
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    marketResourceSlots: [null, null, null],
    marketSpecialistSlots: [null],
    marketRefillCountdown: MARKET.AUTO_REFILL_INTERVAL,
    ...overrides,
  } as unknown as Building;
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  idSeq = 0;
  setMarketRandomSource(() => 0.5);
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  setMarketRandomSource(undefined);
});

describe('freeRestockMarket', () => {
  it('works on a fresh market (lastFreeRestockTurn undefined)', () => {
    const market = makeMarketBuilding({ marketResourceSlots: [null, null, null] });
    const grid = makeGrid();
    grid[0][0].buildingId = market.id;

    useGameStore.setState({ turn: 1, buildings: { [market.id]: market }, grid, units: {} });

    useGameStore.getState().freeRestockMarket(market.id);

    const updated = useGameStore.getState().buildings[market.id];
    expect(updated.lastFreeRestockTurn).toBe(1);
    // Slots should have been restocked (all non-null after restock)
    const filled = (updated.marketResourceSlots ?? []).filter((s) => s !== null);
    expect(filled.length).toBeGreaterThan(0);
  });

  it('sets lastFreeRestockTurn to the current turn after use', () => {
    const market = makeMarketBuilding();
    const grid = makeGrid();
    grid[0][0].buildingId = market.id;

    useGameStore.setState({ turn: 5, buildings: { [market.id]: market }, grid, units: {} });
    useGameStore.getState().freeRestockMarket(market.id);

    expect(useGameStore.getState().buildings[market.id].lastFreeRestockTurn).toBe(5);
  });

  it('is refused while on cooldown (turn delta < FREE_RESTOCK_INTERVAL_TURNS)', () => {
    const market = makeMarketBuilding({ lastFreeRestockTurn: 3 });
    const grid = makeGrid();
    grid[0][0].buildingId = market.id;

    // Turn 3 + interval - 1 = still on cooldown
    const cooldownTurn = 3 + MARKET.FREE_RESTOCK_INTERVAL_TURNS - 1;
    useGameStore.setState({ turn: cooldownTurn, buildings: { [market.id]: market }, grid, units: {} });

    // Wipe slots so we can detect if restock happened
    useGameStore.setState((s) => ({
      buildings: {
        ...s.buildings,
        [market.id]: { ...s.buildings[market.id], marketResourceSlots: [null, null, null] },
      },
    }));

    useGameStore.getState().freeRestockMarket(market.id);

    const updated = useGameStore.getState().buildings[market.id];
    // lastFreeRestockTurn unchanged (still 3) — no restock occurred
    expect(updated.lastFreeRestockTurn).toBe(3);
    const filled = (updated.marketResourceSlots ?? []).filter((s) => s !== null);
    expect(filled.length).toBe(0);
  });

  it('works again after FREE_RESTOCK_INTERVAL_TURNS turns have elapsed', () => {
    const usedOnTurn = 2;
    const market = makeMarketBuilding({
      lastFreeRestockTurn: usedOnTurn,
      marketResourceSlots: [null, null, null],
    });
    const grid = makeGrid();
    grid[0][0].buildingId = market.id;

    const readyTurn = usedOnTurn + MARKET.FREE_RESTOCK_INTERVAL_TURNS;
    useGameStore.setState({ turn: readyTurn, buildings: { [market.id]: market }, grid, units: {} });

    useGameStore.getState().freeRestockMarket(market.id);

    const updated = useGameStore.getState().buildings[market.id];
    expect(updated.lastFreeRestockTurn).toBe(readyTurn);
    const filled = (updated.marketResourceSlots ?? []).filter((s) => s !== null);
    expect(filled.length).toBeGreaterThan(0);
  });

  it('is rejected for non-MARKET buildings', () => {
    const fakeBuilding = makeMarketBuilding({ type: BuildingType.STRONGHOLD });
    const grid = makeGrid();
    grid[0][0].buildingId = fakeBuilding.id;

    useGameStore.setState({ turn: 1, buildings: { [fakeBuilding.id]: fakeBuilding }, grid, units: {} });
    useGameStore.getState().freeRestockMarket(fakeBuilding.id);

    // No changes — especially no lastFreeRestockTurn
    expect(useGameStore.getState().buildings[fakeBuilding.id].lastFreeRestockTurn).toBeUndefined();
  });
});

describe('freeRestockMarket — save round-trip', () => {
  it('preserves lastFreeRestockTurn across save/load', async () => {
    const market = makeMarketBuilding({ marketResourceSlots: [null, null, null] });
    const grid = makeGrid();
    grid[0][0].buildingId = market.id;

    useGameStore.setState({ turn: 4, buildings: { [market.id]: market }, grid, units: {} });
    useGameStore.getState().freeRestockMarket(market.id);

    const state = useGameStore.getState() as unknown as GameState;
    await saveSlotStrict({ id: 'slot_free_restock', name: 'Test', state });

    const loaded = await loadSlot('slot_free_restock');
    expect(loaded).not.toBeNull();
    const loadedMarket = loaded!.buildings[market.id];
    expect(loadedMarket).toBeDefined();
    expect(loadedMarket.lastFreeRestockTurn).toBe(4);
  });
});
