/**
 * Regression tests: Market offers never refresh automatically.
 *
 * After first discovery, offers only change when the player uses a paid
 * restock (restockMarket) or a free restock (freeRestockMarket, cooldown
 * permitting). Bought slots stay empty (null) across player turns.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAP, MARKET, SPECIALIST_DEFINITIONS, UNIT_DEFINITIONS } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';
import { useMarketPanelStore } from '../marketPanelStore';
import { createMarket, setMarketRandomSource } from '../marketSystem';
import { updateDiscovery } from '../discoverySystem';
import {
  BuildingType,
  DestroyBehavior,
  Difficulty,
  Faction,
  GamePhase,
  TileType,
  UnitType,
} from '../types';
import type { Building, GameState, MarketResourceOffer, Position, Tile, Unit } from '../types';

// ============================================================================
// Helpers
// ============================================================================

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
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
    hasCaveMonster: false,
  } as Tile;
}

function makeGrid(): Tile[][] {
  return Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
}

function makeUnit(id: string, position: Position): Unit {
  const def = UNIT_DEFINITIONS[UnitType.SPEARMAN];
  return {
    id,
    type: UnitType.SPEARMAN,
    faction: Faction.PLAYER,
    position: { ...position },
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
    tags: [...def.tags],
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
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeBuilding(id: string, type: BuildingType, faction: Faction | null, position: Position): Building {
  return {
    id,
    type,
    faction,
    position: { ...position },
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

const OFFER_A: MarketResourceOffer = { give: { currency: 'WOOD', amount: 2 }, gain: { currency: 'IRON', amount: 1 } };
const OFFER_B: MarketResourceOffer = { give: { currency: 'IRON', amount: 2 }, gain: { currency: 'WOOD', amount: 1 } };
const OFFER_C: MarketResourceOffer = { give: { currency: 'WOOD', amount: 3 }, gain: { currency: 'CRYSTAL', amount: 1 } };

const SPEC_IDS = Object.keys(SPECIALIST_DEFINITIONS);
const MARKET_ID = 'market';
const MARKET_POS: Position = { x: 3, y: 10 };

function makeMarket(overrides: Partial<Building> = {}): Building {
  return {
    ...createMarket(null, MARKET_POS),
    id: MARKET_ID,
    marketResourceSlots: [{ ...OFFER_A }, { ...OFFER_B }, { ...OFFER_C }],
    marketSpecialistSlots: [SPEC_IDS[0], SPEC_IDS[1]],
    marketOffersInitialized: true,
    ...overrides,
  };
}

function makeState(market: Building, units: Unit[], storage: string[] = [], cap = 3): GameState {
  const grid = makeGrid();
  const stronghold = {
    ...makeBuilding('stronghold', BuildingType.STRONGHOLD, Faction.PLAYER, { x: 0, y: 11 }),
    strongholdNobles: 1,
  };
  const farm = {
    ...makeBuilding('farm', BuildingType.FARM, Faction.PLAYER, { x: 1, y: 11 }),
    populationCount: 10,
    populationCap: 10,
  };
  for (const b of [stronghold, farm, market]) {
    grid[b.position.y][b.position.x].buildingId = b.id;
  }
  for (const u of units) {
    grid[u.position.y][u.position.x].unitId = u.id;
  }

  return {
    turn: 1,
    phase: GamePhase.PLAYER_TURN,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    buildings: { [stronghold.id]: stronghold, [farm.id]: farm, [market.id]: market },
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [...storage],
    resources: { iron: 999, wood: 999 },
    arcaneCrystals: 999,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 999,
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
    difficulty: Difficulty.STANDARD,
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 9999,
    spawnAccumulator: 0,
    lastSpawnBudget: null,
    lavaFreezeUntilTurn: 9999,
    gameOverCause: null,
    specialistSlotCap: cap,
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

/** Run one full player end-turn, applying any animation-deferred resolved state. */
function endTurn(): void {
  useGameStore.getState().endPlayerTurn();
  const resolved = useAnimationStore.getState().resolvedState;
  if (resolved) {
    useGameStore.setState(resolved);
  }
  useAnimationStore.getState().clear();
  expect(useGameStore.getState().phase).toBe(GamePhase.PLAYER_TURN);
}

function getMarket(): Building {
  return useGameStore.getState().buildings[MARKET_ID];
}

const TURNS_TO_WAIT = MARKET.FREE_RESTOCK_INTERVAL_TURNS + 1;

beforeEach(() => {
  setMarketRandomSource(lcg(7));
  useAnimationStore.getState().clear();
  useMarketPanelStore.getState().closePanel();
});

afterEach(() => {
  setMarketRandomSource(undefined);
  useMarketPanelStore.getState().closePanel();
});

// ============================================================================
// Tests
// ============================================================================

describe('Market — no automatic refill', () => {
  it('bought resource and specialist slots stay empty across turns; unbought offers are unchanged', () => {
    const trader1 = makeUnit('trader1', MARKET_POS);
    const trader2 = makeUnit('trader2', { x: MARKET_POS.x + 1, y: MARKET_POS.y });
    useGameStore.setState(makeState(makeMarket(), [trader1, trader2]));
    const startTurn = useGameStore.getState().turn;

    useMarketPanelStore.getState().openPanel(MARKET_ID, trader1.id);
    useGameStore.getState().buyMarketOffer(MARKET_ID, 0);
    useMarketPanelStore.getState().openPanel(MARKET_ID, trader2.id);
    useGameStore.getState().buyMarketSpecialist(MARKET_ID, 0);
    useMarketPanelStore.getState().closePanel();

    expect(getMarket().marketResourceSlots?.[0]).toBeNull();
    expect(getMarket().marketSpecialistSlots?.[0]).toBeNull();
    expect(useGameStore.getState().globalSpecialistStorage).toContain(SPEC_IDS[0]);

    for (let i = 0; i < TURNS_TO_WAIT; i++) {
      endTurn();
      const m = getMarket();
      expect(m.marketResourceSlots).toEqual([null, OFFER_B, OFFER_C]);
      expect(m.marketSpecialistSlots).toEqual([null, SPEC_IDS[1]]);
    }
    expect(useGameStore.getState().turn).toBe(startTurn + TURNS_TO_WAIT);
  });

  it('a swapped specialist slot stays empty across turns', () => {
    const trader = makeUnit('trader', MARKET_POS);
    const owned = SPEC_IDS[5];
    useGameStore.setState(makeState(makeMarket(), [trader], [owned], 1));

    useMarketPanelStore.getState().openPanel(MARKET_ID, trader.id);
    useGameStore.getState().buyMarketSpecialist(MARKET_ID, 1, owned);
    useMarketPanelStore.getState().closePanel();

    expect(useGameStore.getState().globalSpecialistStorage).toEqual([SPEC_IDS[1]]);
    expect(getMarket().marketSpecialistSlots).toEqual([SPEC_IDS[0], null]);

    for (let i = 0; i < TURNS_TO_WAIT; i++) {
      endTurn();
      expect(getMarket().marketSpecialistSlots).toEqual([SPEC_IDS[0], null]);
      expect(getMarket().marketResourceSlots).toEqual([OFFER_A, OFFER_B, OFFER_C]);
    }
  });

  it('paid restock rerolls all slots without consuming the trade action', () => {
    const trader = makeUnit('trader', MARKET_POS);
    useGameStore.setState(
      makeState(makeMarket({ marketResourceSlots: [null, null, null], marketSpecialistSlots: [null, null] }), [trader]),
    );
    for (let i = 0; i < TURNS_TO_WAIT; i++) endTurn();
    expect(getMarket().marketResourceSlots).toEqual([null, null, null]);
    expect(getMarket().marketSpecialistSlots).toEqual([null, null]);

    const crystalsBefore = useGameStore.getState().arcaneCrystals;
    useMarketPanelStore.getState().openPanel(MARKET_ID, trader.id);
    useGameStore.getState().restockMarket(MARKET_ID);

    const m = getMarket();
    expect(m.marketResourceSlots).toHaveLength(3);
    expect(m.marketResourceSlots?.every((s) => s !== null)).toBe(true);
    expect(m.marketSpecialistSlots).toHaveLength(2);
    expect(m.marketSpecialistSlots?.every((s) => s !== null)).toBe(true);
    expect(useGameStore.getState().arcaneCrystals).toBe(crystalsBefore - MARKET.RESTOCK_COST.crystal);
    expect(useGameStore.getState().units[trader.id].hasTradedThisTurn).toBe(false);
  });

  it('free restock rerolls all slots only once its cooldown is ready', () => {
    const trader = makeUnit('trader', MARKET_POS);
    useGameStore.setState(
      makeState(
        makeMarket({ marketResourceSlots: [null, null, null], marketSpecialistSlots: [null, null], lastFreeRestockTurn: 1 }),
        [trader],
      ),
    );

    // On cooldown: refused, and slots stay empty through the whole cooldown.
    for (let i = 0; i < MARKET.FREE_RESTOCK_INTERVAL_TURNS; i++) {
      useGameStore.getState().freeRestockMarket(MARKET_ID);
      expect(getMarket().lastFreeRestockTurn).toBe(1);
      expect(getMarket().marketResourceSlots).toEqual([null, null, null]);
      expect(getMarket().marketSpecialistSlots).toEqual([null, null]);
      endTurn();
    }

    // Cooldown ready — slots are still empty until the player acts.
    expect(getMarket().marketResourceSlots).toEqual([null, null, null]);
    const readyTurn = useGameStore.getState().turn;
    useGameStore.getState().freeRestockMarket(MARKET_ID);

    const m = getMarket();
    expect(m.lastFreeRestockTurn).toBe(readyTurn);
    expect(m.marketResourceSlots?.every((s) => s !== null)).toBe(true);
    expect(m.marketSpecialistSlots?.every((s) => s !== null)).toBe(true);
    expect(useGameStore.getState().units[trader.id].hasTradedThisTurn).toBe(false);
  });

  it('initial discovery fills the market exactly once', () => {
    const scout = makeUnit('scout', { x: 1, y: 1 });
    const market = createMarket(null, { x: 2, y: 1 });
    const state = makeState(market, [scout]);
    state.grid[1][2].isRevealed = false;

    expect(market.marketOffersInitialized).toBe(false);
    expect(market.marketResourceSlots?.every((s) => s === null)).toBe(true);

    updateDiscovery(state as unknown as Parameters<typeof updateDiscovery>[0]);
    const discovered = state.buildings[market.id];
    expect(discovered.marketOffersInitialized).toBe(true);
    expect(discovered.marketResourceSlots?.every((s) => s !== null)).toBe(true);

    // Empty a slot, then re-run discovery: it must not refill.
    discovered.marketResourceSlots![0] = null;
    const snapshot = JSON.parse(JSON.stringify(discovered.marketResourceSlots));
    updateDiscovery(state as unknown as Parameters<typeof updateDiscovery>[0]);
    expect(state.buildings[market.id].marketResourceSlots).toEqual(snapshot);
  });
});
