import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { ABILITIES, MARKET, UNIT_DEFINITIONS } from '../gameConfig';
import { useGameStore } from '../gameStore';
import { useMarketPanelStore } from '../marketPanelStore';
import {
  applyEffectsForSpecialist,
  applySpecialistEffects,
  createInitialSpecialists,
  revokeEffectsForSpecialist,
} from '../specialistSystem';
import { applyTagStatEffects } from '../techSystem';
import { BuildingType, Faction, SpellId, UnitTag, UnitType } from '../types';
import type { Building, GameState, Specialist, SpecialistEffect, Unit } from '../types';

const initialStore = useGameStore.getState();

function makeUnit(type: UnitType = UnitType.SCOUT, extraTags: UnitTag[] = []): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: 'unit',
    type,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
    tags: [...new Set([...def.tags, ...extraTags])],
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
    hasTradedThisTurn: false,
  } as Unit;
}

function makeState(): GameState {
  return {
    ...initialStore,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
    specialistSlotCap: 1,
    units: { unit: makeUnit() },
    buildings: {},
    techNodes: {},
    techFlags: [],
    unlockedSpells: [],
    fortifiedGarrisonActive: false,
    arcaneCrystals: MARKET.SPECIALIST_PRICE_CRYSTAL,
  };
}

function addSpecialist(state: GameState, id: string, effects: SpecialistEffect[], dormant = false): Specialist {
  const specialist: Specialist = { id, effects, assignedBuildingId: null, dormant };
  state.specialists[id] = specialist;
  state.globalSpecialistStorage.push(id);
  return specialist;
}

function tagEffect(unitType: UnitType, tag: UnitTag, bySource: boolean): SpecialistEffect {
  return bySource
    ? { type: 'GRANT_TAG_TO_UNITS_WITH_TAG', params: { sourceTag: UnitTag.SUMMONED, tags: tag } }
    : { type: 'GRANT_UNIT_TAG_ALL', params: { unitType, tag } };
}

beforeEach(() => {
  useGameStore.setState(makeState());
  useMarketPanelStore.getState().closePanel();
});

afterEach(() => {
  useGameStore.setState(initialStore, true);
  useMarketPanelStore.getState().closePanel();
});

describe.each([false, true])('tag revocation (source-tag effect: %s)', (bySource) => {
  it.each([false, true])('ignores outgoing specialist when removed from storage: %s', (removeFirst) => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.SCOUT, [UnitTag.SUMMONED]);
    addSpecialist(state, 'outgoing', [tagEffect(UnitType.SCOUT, UnitTag.RANGED, bySource)]);
    const active = produce(state, (draft) => applyEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(active.units.unit.tags).toContain(UnitTag.RANGED);

    const revoked = produce(active, (draft) => {
      if (removeFirst) draft.globalSpecialistStorage = [];
      revokeEffectsForSpecialist(draft, draft.specialists.outgoing);
    });
    expect(revoked.units.unit.tags).not.toContain(UnitTag.RANGED);
  });

  it('retains tags supplied by the unit definition', () => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.ARCHER, [UnitTag.SUMMONED]);
    expect(UNIT_DEFINITIONS[UnitType.ARCHER].tags).toContain(UnitTag.RANGED);
    addSpecialist(state, 'outgoing', [tagEffect(UnitType.ARCHER, UnitTag.RANGED, bySource)]);
    const revoked = produce(state, (draft) => revokeEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(revoked.units.unit.tags).toContain(UnitTag.RANGED);
  });

  it('retains tags supplied by unlocked tech', () => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.SWORDSMAN, [UnitTag.SUMMONED, UnitTag.CLEAVE]);
    state.techNodes.SWORDSMAN_CLEAVE = { id: 'SWORDSMAN_CLEAVE', unlocked: true };
    addSpecialist(state, 'outgoing', [tagEffect(UnitType.SWORDSMAN, UnitTag.CLEAVE, bySource)]);
    const revoked = produce(state, (draft) => revokeEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(revoked.units.unit.tags).toContain(UnitTag.CLEAVE);
  });

  it.each([false, true])('retains another active specialist grant across effect types: %s', (otherBySource) => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.SCOUT, [UnitTag.SUMMONED, UnitTag.RANGED]);
    addSpecialist(state, 'outgoing', [tagEffect(UnitType.SCOUT, UnitTag.RANGED, bySource)]);
    addSpecialist(state, 'other', [tagEffect(UnitType.SCOUT, UnitTag.RANGED, otherBySource)]);
    const revoked = produce(state, (draft) => revokeEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(revoked.units.unit.tags).toContain(UnitTag.RANGED);
  });

  it('does not retain grants from dormant or unowned specialists', () => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.SCOUT, [UnitTag.SUMMONED, UnitTag.RANGED]);
    const effect = tagEffect(UnitType.SCOUT, UnitTag.RANGED, bySource);
    addSpecialist(state, 'outgoing', [effect]);
    addSpecialist(state, 'dormant', [effect], true);
    addSpecialist(state, 'unowned', [effect]);
    state.globalSpecialistStorage = ['outgoing', 'dormant'];
    const revoked = produce(state, (draft) => revokeEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(revoked.units.unit.tags).not.toContain(UnitTag.RANGED);
  });

  it('retains Khyron assimilated tags and their stat effects', () => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.CRYSTAL_KHYRON, [UnitTag.SUMMONED, UnitTag.ELITE]);
    state.units.unit.assimilatedTags = [UnitTag.ELITE];
    applyTagStatEffects(state.units.unit, UnitTag.ELITE);
    const stats = { ...state.units.unit.stats };
    addSpecialist(state, 'outgoing', [tagEffect(UnitType.CRYSTAL_KHYRON, UnitTag.ELITE, bySource)]);
    const revoked = produce(state, (draft) => revokeEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(revoked.units.unit.tags).toContain(UnitTag.ELITE);
    expect(revoked.units.unit.stats).toEqual(stats);
  });

  it('revokes tag stat effects exactly once and leaves enemy units untouched', () => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.SCOUT, [UnitTag.SUMMONED]);
    state.units.enemy = { ...makeUnit(UnitType.SCOUT, [UnitTag.SUMMONED, UnitTag.ELITE]), id: 'enemy', faction: Faction.ENEMY };
    const stats = { ...state.units.unit.stats };
    addSpecialist(state, 'outgoing', [tagEffect(UnitType.SCOUT, UnitTag.ELITE, bySource)]);
    const active = produce(state, (draft) => applyEffectsForSpecialist(draft, draft.specialists.outgoing));
    expect(active.units.unit.stats).not.toEqual(stats);
    const revoked = produce(active, (draft) => {
      revokeEffectsForSpecialist(draft, draft.specialists.outgoing);
      revokeEffectsForSpecialist(draft, draft.specialists.outgoing);
    });
    expect(revoked.units.unit.tags).not.toContain(UnitTag.ELITE);
    expect(revoked.units.unit.stats).toEqual(stats);
    expect(revoked.units.enemy).toEqual(active.units.enemy);
  });

  it.each([false, true])('preserves dormancy behavior with another active grant: %s', (otherActive) => {
    const state = makeState();
    state.units.unit = makeUnit(UnitType.SCOUT, [UnitTag.SUMMONED, UnitTag.RANGED]);
    const effect = tagEffect(UnitType.SCOUT, UnitTag.RANGED, bySource);
    addSpecialist(state, 'dormant', [effect], true);
    if (otherActive) addSpecialist(state, 'active', [effect]);
    const updated = produce(state, (draft) => applySpecialistEffects(draft));
    expect(updated.units.unit.tags.includes(UnitTag.RANGED)).toBe(otherActive);
  });
});

describe('Market specialist replacement', () => {
  function prepareSwap(outgoingId: string, incomingId = 'spec_02') {
    const state = makeState();
    state.buildings.market = {
      id: 'market', type: BuildingType.MARKET, marketSpecialistSlots: [incomingId],
    } as Building;
    state.buildings.tower = {
      id: 'tower', type: BuildingType.WATCHTOWER, faction: Faction.PLAYER,
      combatStats: { attack: 10, attackRange: 2 },
    } as Building;
    useGameStore.setState(state);
    useGameStore.getState().hireSpecialist(outgoingId);
    useMarketPanelStore.getState().openPanel('market', 'unit');
    useMarketPanelStore.getState().beginSpecialistSwap(0);
  }

  it('replaces Farsight Marshal, removes Scout Ranged, pays once and consumes the offer', () => {
    prepareSwap('spec_11');
    expect(useGameStore.getState().units.unit.tags).toContain(UnitTag.RANGED);
    useGameStore.getState().buyMarketSpecialist('market', 0, 'spec_11');
    const state = useGameStore.getState();
    expect(state.units.unit.tags).not.toContain(UnitTag.RANGED);
    expect(state.globalSpecialistStorage).toEqual(['spec_02']);
    expect(state.arcaneCrystals).toBe(0);
    expect(state.buildings.market.marketSpecialistSlots).toEqual([null]);
    expect(state.units.unit.hasTradedThisTurn).toBe(true);
    expect(useMarketPanelStore.getState().pendingSpecialistSlot).toBeNull();
  });

  it.each(['spec_01', 'spec_22'])('revokes Market outgoing persistent effect: %s', (outgoingId) => {
    prepareSwap(outgoingId);
    useGameStore.getState().buyMarketSpecialist('market', 0, outgoingId);
    const state = useGameStore.getState();
    expect(state.fortifiedGarrisonActive).toBe(false);
    expect(state.unlockedSpells).not.toContain(SpellId.RUPTURE);
    expect(state.buildings.tower.combatStats).toEqual({ attack: 10, attackRange: 2 });
  });

  it('applies incoming effects after revoking outgoing and preserves slot order', () => {
    prepareSwap('spec_11', 'spec_01');
    useGameStore.setState({ globalSpecialistStorage: ['spec_02', 'spec_11', 'spec_03'], specialistSlotCap: 3 });
    useGameStore.getState().buyMarketSpecialist('market', 0, 'spec_11');
    const state = useGameStore.getState();
    expect(state.globalSpecialistStorage).toEqual(['spec_02', 'spec_01', 'spec_03']);
    expect(state.units.unit.tags).not.toContain(UnitTag.RANGED);
    expect(state.fortifiedGarrisonActive).toBe(true);
    expect(state.buildings.tower.combatStats).toEqual({
      attack: 10 + ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS,
      attackRange: 2 + ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS,
    });
  });

  it('keeps a shared outgoing and incoming tag without duplicating its stat bonus', () => {
    prepareSwap('spec_11');
    const state = produce(useGameStore.getState(), (draft) => {
      draft.specialists.spec_11.effects.push(tagEffect(UnitType.SCOUT, UnitTag.ELITE, false));
      applyEffectsForSpecialist(draft, draft.specialists.spec_11);
      draft.specialists.spec_02.effects = [...draft.specialists.spec_11.effects];
    });
    useGameStore.setState(state);
    const stats = { ...state.units.unit.stats };
    useGameStore.getState().buyMarketSpecialist('market', 0, 'spec_11');
    expect(useGameStore.getState().units.unit.tags.filter((tag) => tag === UnitTag.RANGED)).toHaveLength(1);
    expect(useGameStore.getState().units.unit.tags.filter((tag) => tag === UnitTag.ELITE)).toHaveLength(1);
    expect(useGameStore.getState().units.unit.stats).toEqual(stats);
  });

  it.each(['dismiss', 'cave'])('keeps %s removal behavior unchanged', (path) => {
    prepareSwap('spec_11');
    if (path === 'dismiss') useGameStore.getState().dismissSpecialist('spec_11');
    else useGameStore.getState().swapSpecialist('spec_11', 'spec_02');
    const state = useGameStore.getState();
    expect(state.units.unit.tags).not.toContain(UnitTag.RANGED);
    expect(state.globalSpecialistStorage).toEqual(path === 'dismiss' ? [] : ['spec_02']);
    expect(state.arcaneCrystals).toBe(MARKET.SPECIALIST_PRICE_CRYSTAL);
  });
});

describe.each(['spec_01', 'spec_22'])('persistent effect direct revoke: %s', (specialistId) => {
  describe.each([false, true])('outgoing removed first: %s', (removeFirst) => {
    it.each([false, true])('retains only another active source: %s', (otherActive) => {
      const state = makeState();
      state.globalSpecialistStorage.push(specialistId);
      if (otherActive) addSpecialist(state, 'other', state.specialists[specialistId].effects);
      const active = produce(state, (draft) => applyEffectsForSpecialist(draft, draft.specialists[specialistId]));
      const revoked = produce(active, (draft) => {
        if (removeFirst) draft.globalSpecialistStorage = draft.globalSpecialistStorage.filter((id) => id !== specialistId);
        revokeEffectsForSpecialist(draft, draft.specialists[specialistId]);
      });
      if (specialistId === 'spec_01') expect(revoked.fortifiedGarrisonActive).toBe(otherActive);
      else expect(revoked.unlockedSpells.includes(SpellId.RUPTURE)).toBe(otherActive);
    });
  });
});
