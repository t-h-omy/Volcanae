import { beforeEach, describe, expect, it } from 'vitest';
import { MAP } from '../gameConfig';
import { createInitialSpecialists } from '../specialistSystem';
import { Difficulty, GamePhase, TileType } from '../types';
import type { GameState, Tile } from '../types';
import { useEmberDisplayStore } from '../emberDisplayStore';
import { useFloaterStore } from '../floaterStore';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';

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

function makeBaseState(): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );

  return {
    turn: 1,
    phase: GamePhase.PLAYER_TURN,
    units: {},
    buildings: {},
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    resources: { iron: 20, wood: 20 },
    arcaneCrystals: 0,
    techNodes: {} as GameState['techNodes'],
    techFlags: [],
    grid,
    lavaFrontRow: MAP.GRID_HEIGHT,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [1],
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
  } as GameState;
}

// ── Ember display store ──────────────────────────────────────────────────────

describe('emberDisplayStore', () => {
  beforeEach(() => {
    useEmberDisplayStore.getState().clear();
  });

  it('starts at zero', () => {
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });

  it('increment adds to offset', () => {
    useEmberDisplayStore.getState().increment(2);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(2);
  });

  it('multiple increments are additive', () => {
    useEmberDisplayStore.getState().increment(1);
    useEmberDisplayStore.getState().increment(3);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(4);
  });

  it('release reduces the offset', () => {
    useEmberDisplayStore.getState().increment(3);
    useEmberDisplayStore.getState().release(1);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(2);
  });

  it('release never goes below zero', () => {
    useEmberDisplayStore.getState().increment(1);
    useEmberDisplayStore.getState().release(5);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });

  it('release on an empty offset stays at zero', () => {
    useEmberDisplayStore.getState().release(2);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });

  it('clear resets any offset to zero', () => {
    useEmberDisplayStore.getState().increment(10);
    useEmberDisplayStore.getState().clear();
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });

  it('partial release followed by another release lands at correct value', () => {
    useEmberDisplayStore.getState().increment(1);
    useEmberDisplayStore.getState().increment(1);
    useEmberDisplayStore.getState().release(1);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(1);
    useEmberDisplayStore.getState().release(1);
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });
});

// ── EMBER_LEVEL_UP floater label ─────────────────────────────────────────────


describe('EMBER_LEVEL_UP applyEvent floater label', () => {
  beforeEach(() => {
    useAnimationStore.getState().clear();
    useEmberDisplayStore.getState().clear();
    useFloaterStore.setState({ floaters: [] });
  });

  it('emits a prefix-free floater label and releases the offset via the no-DOM fallback', () => {
    useGameStore.setState(makeBaseState());

    useGameStore.getState().applyEvent({
      type: 'EMBER_LEVEL_UP',
      amount: 1,
      source: 'LAVA_ADVANCE',
      position: { x: 5, y: 5 },
    });

    const emberFloater = useFloaterStore
      .getState()
      .floaters.find((f) => f.floaterType === 'emberlevel');
    expect(emberFloater?.label).toBe('+1 Ember Level');
    expect(emberFloater?.label).not.toMatch(/Emberling|Enemy|Stronghold/);
    expect(emberFloater?.label).not.toContain('·');

    // Node test environment has no `document`, so no flight can start and the
    // fallback must release the pending offset immediately (counter never sticks).
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });

  it('uses the amount in the label for multi-level rises', () => {
    useGameStore.setState(makeBaseState());

    useGameStore.getState().applyEvent({
      type: 'EMBER_LEVEL_UP',
      amount: 3,
      source: 'LAVA_ADVANCE',
      position: { x: 5, y: 5 },
    });

    const emberFloater = useFloaterStore
      .getState()
      .floaters.find((f) => f.floaterType === 'emberlevel');
    expect(emberFloater?.label).toBe('+3 Ember Level');
    expect(useEmberDisplayStore.getState().pendingEmberOffset).toBe(0);
  });
});

// ── Fallback path: onArrival called when start position is unresolvable ──────

describe('triggerEmberLevelUpVfx fallback paths', () => {
  it('calls onArrival immediately when event has no position', async () => {
    // Import dynamically to get the real module after mocks are set up.
    const { triggerEmberLevelUpVfx } = await import('../emberLevelVfx');
    let called = false;
    const onArrival = () => { called = true; };

    triggerEmberLevelUpVfx(
      { type: 'EMBER_LEVEL_UP', amount: 1, source: 'EMBERLING_SACRIFICE' },
      onArrival,
    );

    expect(called).toBe(true);
  });

  it('calls onArrival immediately when grid element is absent (no DOM)', async () => {
    const { triggerEmberLevelUpVfx } = await import('../emberLevelVfx');
    let called = false;
    const onArrival = () => { called = true; };

    // Polyfill document.querySelector so tileToScreenCenter returns null
    // (no .grid-container element present).
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      value: { querySelector: () => null },
      configurable: true,
      writable: true,
    });

    try {
      triggerEmberLevelUpVfx(
        { type: 'EMBER_LEVEL_UP', amount: 1, source: 'LAVA_ADVANCE', position: { x: 5, y: 5 } },
        onArrival,
      );
    } finally {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
    }

    expect(called).toBe(true);
  });
});
