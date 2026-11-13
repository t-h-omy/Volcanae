/**
 * Regression tests for multi-slot save serialization and current-version state.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { generateInitialGameState } from '../mapGenerator';
import { saveSlot, saveSlotStrict, loadSlot, listSlots, saveSeenHintsForSlot } from '../saveSystem';
import { BuildingType, DestroyBehavior } from '../types';
import { MARKET, SAVE } from '../gameConfig';
import type { GameState } from '../types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('saveSlot round-trip', () => {
  it('persists the full state even when the object carries action functions', async () => {
    const base = generateInitialGameState();
    const laterTurn = { ...base, turn: 50 } as GameState & Record<string, unknown>;
    laterTurn.moveUnit = () => {};
    laterTurn.endPlayerTurn = () => {};
    laterTurn.newGameInSlot = async () => {};

    await saveSlotStrict({ id: 'slot_a', name: 'Campaign 1', state: laterTurn as GameState });

    const slots = await listSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0].turn).toBe(50);

    const loaded = await loadSlot('slot_a');
    expect(loaded?.turn).toBe(50);
    expect(typeof (loaded as unknown as Record<string, unknown>).moveUnit).not.toBe('function');
  });

  it('overwrites the previous state record when saving the same slot again', async () => {
    const s1 = { ...generateInitialGameState(), turn: 1 } as GameState;
    const s2 = { ...generateInitialGameState(), turn: 7 } as GameState & Record<string, unknown>;
    s2.selectUnit = () => {};

    await saveSlot({ id: 'slot_b', name: 'Campaign 1', state: s1 });
    await saveSlot({ id: 'slot_b', name: 'Campaign 1', state: s2 as GameState });

    expect((await loadSlot('slot_b'))?.turn).toBe(7);
  });

  it('round-trips seenHints and patches them without overwriting other state', async () => {
    const state: GameState = {
      ...generateInitialGameState(),
      turn: 9,
      seenHints: ['H01_BUILD_WOODCUTTER', 'H05_ATTACK_ENDS_TURN'],
    };
    await saveSlot({ id: 'slot_seen', name: 'Hints', state });
    await saveSeenHintsForSlot('slot_seen', ['H10_HOMELESS']);

    const loaded = await loadSlot('slot_seen');
    expect(loaded?.turn).toBe(9);
    expect(loaded?.seenHints).toEqual(['H10_HOMELESS']);
  });

  it('round-trips a non-zero spawnAccumulator intact', async () => {
    const state: GameState = { ...generateInitialGameState(), spawnAccumulator: 2.75 };
    await saveSlot({ id: 'slot_accumulator', name: 'Accumulator Test', state });
    expect((await loadSlot('slot_accumulator'))?.spawnAccumulator).toBe(2.75);
  });

  it('loads current saves with the obsolete marketRefillCountdown field intact', async () => {
    const state = generateInitialGameState() as GameState;
    const marketId = 'm_legacy_refill_countdown';
    const offer = { give: { currency: 'WOOD' as const, amount: 2 }, gain: { currency: 'IRON' as const, amount: 1 } };
    state.buildings[marketId] = {
      id: marketId,
      type: BuildingType.MARKET,
      faction: null,
      position: { x: 2, y: 0 },
      hp: MARKET.MAX_HP,
      maxHp: MARKET.MAX_HP,
      specialistSlot: null,
      isDisabledForTurns: 0,
      wasAttackedLastEnemyTurn: false,
      captureProgress: 0,
      isBeingCapturedBy: null,
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
      marketResourceSlots: [offer, null],
      marketSpecialistSlots: [null],
      marketOffersInitialized: true,
      ...({ marketRefillCountdown: 2 } as Record<string, unknown>),
    };
    state.grid[0][2].buildingId = marketId;

    await saveSlotStrict({ id: 'slot_legacy_refill', name: 'Legacy', state });
    const market = (await loadSlot('slot_legacy_refill'))!.buildings[marketId];
    expect(market.marketOffersInitialized).toBe(true);
    expect(market.marketResourceSlots).toEqual([offer, null]);
    expect(market.marketSpecialistSlots).toEqual([null]);
    expect(SAVE.MIN_LOADABLE_VERSION).toBe(24);
  });
});
