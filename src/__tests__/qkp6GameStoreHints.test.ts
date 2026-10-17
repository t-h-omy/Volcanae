import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDraft, produce } from 'immer';
import { HINTS } from '../../config/hints';
import type { HintId } from '../../config/hints';
import { generateInitialGameState } from '../mapGenerator';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { useMenuStore } from '../menuStore';
import * as enemySystem from '../enemySystem';
import * as spellSystem from '../spellSystem';
import * as hintSystem from '../hintSystem';
import {
  BuildingType, Faction, GamePhase, SpellId, TileStatus, TileType, UnitTag, UnitType,
} from '../types';
import type { Building, GameState, Position, Unit } from '../types';

const MAGE_POSITION = { x: 5, y: 65 };
const TARGET = { x: 6, y: 65 };
const H23 = 'H23_INFESTED_SPREAD';

function makeUnit(id: string, type: UnitType, position: Position, faction: Faction = Faction.PLAYER): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id, type, faction, position: { ...position },
    stats: {
      maxHp: definition.maxHp, currentHp: definition.maxHp,
      attack: definition.attack, defense: definition.defense,
      moveRange: definition.moveRange, attackRange: definition.attackRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
    },
    tags: [...definition.tags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false,
    hasCapturedThisTurn: false, hasTradedThisTurn: false,
    hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0,
    lastMovedTurn: 0, spellsCastThisTurn: 0,
  };
}

function makeState(spellId: SpellId = SpellId.EMBERBIND): GameState {
  const state = generateInitialGameState();
  const stronghold = Object.values(state.buildings).find(
    (building) => building.type === BuildingType.STRONGHOLD && building.faction === Faction.PLAYER,
  )!;
  stronghold.position = { x: 4, y: 65 };
  state.buildings = { [stronghold.id]: stronghold };
  const mage = makeUnit('mage', UnitType.MAGE, MAGE_POSITION);
  state.units = { mage };
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
      tile.terrainType = TileType.PLAINS;
      tile.isLava = false;
      tile.isLavaPreview = false;
      tile.isRuin = false;
      tile.isStrongholdRuin = false;
      tile.isRevealed = true;
      tile.status = null;
    }
  }
  state.grid[65][4].buildingId = stronghold.id;
  state.grid[MAGE_POSITION.y][MAGE_POSITION.x].unitId = mage.id;
  state.turn = HINTS.START_TURN;
  state.phase = GamePhase.PLAYER_TURN;
  state.seenHints = ['H10_HOMELESS', 'H11_UNTRAINED'];
  state.arcaneCrystals = 20;
  state.unlockedSpells = [spellId];
  state.portals = {};
  state.pendingSpellCast = { mageId: mage.id, spellId };
  state.pendingMagePortalFirstPos = null;
  state.turnsUntilLavaAdvance = 5;
  state.lavaFrontRow = state.grid.length;
  state.ember = 0;
  state.activeCaveEncounters = [];
  return state;
}

function addTargetBuilding(state: GameState, type: BuildingType): void {
  const template = Object.values(state.buildings)[0];
  const building: Building = {
    ...template, id: 'target-building', type, position: { ...TARGET },
    faction: type === BuildingType.EMBERNEST ? Faction.ENEMY : Faction.PLAYER,
    combatStats: null, tags: [], populationCount: 0, populationCap: 0,
  };
  state.buildings[building.id] = building;
  state.grid[TARGET.y][TARGET.x].buildingId = building.id;
}

function spellState(spellId: SpellId): GameState {
  const state = makeState(spellId);
  if (spellId === SpellId.EMBERBIND) addTargetBuilding(state, BuildingType.EMBERNEST);
  if (spellId === SpellId.RAISE_SKELETON || spellId === SpellId.SUMMON_GHOUL) {
    addTargetBuilding(state, BuildingType.GRAVESTONE);
  }
  if (spellId === SpellId.CORRUPTED_QORK) state.grid[TARGET.y][TARGET.x].status = TileStatus.CORRUPTED;
  return state;
}

function fired(hintId: HintId): boolean {
  const { activeHintId, queue } = useHintStore.getState();
  return activeHintId === hintId || queue.includes(hintId);
}

beforeEach(() => {
  useHintStore.getState().reset();
  useHintOptionsStore.setState({ hintsEnabled: true, globalShowCounts: {} });
  useAnimationStore.getState().clear();
  useMenuStore.setState({ activeSaveId: null });
});

afterEach(() => vi.restoreAllMocks());

describe('QKP6 committed spell hints', () => {
  it.each([SpellId.EMBERBIND, SpellId.CORRUPTED_QORK])(
    'triggers H19 for a newly summoned leashed unit from %s after commit',
    (spellId) => {
      useGameStore.setState(spellState(spellId));
      const originalTrigger = hintSystem.tryTriggerHint;
      const trigger = vi.spyOn(hintSystem, 'tryTriggerHint').mockImplementation((id) => {
        expect(useGameStore.getState().pendingSpellCast).toBeNull();
        expect(Object.values(useGameStore.getState().units).some(
          (unit) => unit.id !== 'mage' && unit.tags.includes(UnitTag.LEASHED),
        )).toBe(true);
        return originalTrigger(id);
      });

      useGameStore.getState().castSpell(TARGET);

      expect(trigger).toHaveBeenCalledWith('H19_EMBERBIND_LEASH');
      expect(fired('H19_EMBERBIND_LEASH')).toBe(true);
      expect(useGameStore.getState().seenHints).toContain('H19_EMBERBIND_LEASH');
    },
  );

  it.each([SpellId.RAISE_SKELETON, SpellId.SUMMON_GHOUL])(
    '%s does not trigger H19 for an unleashed summon',
    (spellId) => {
      useGameStore.setState(spellState(spellId));
      useGameStore.getState().castSpell(TARGET);
      expect(useGameStore.getState().pendingSpellCast).toBeNull();
      expect(fired('H19_EMBERBIND_LEASH')).toBe(false);
      expect(fired('H26_GHOUL_GRAVESTONES')).toBe(spellId === SpellId.SUMMON_GHOUL);
    },
  );

  it('does not trigger H19 when an existing unit gains LEASHED', () => {
    useGameStore.setState(makeState());
    vi.spyOn(spellSystem, 'castSpell').mockImplementation((state) => {
      state.units.mage.tags.push(UnitTag.LEASHED);
      return true;
    });
    useGameStore.getState().castSpell(TARGET);
    expect(useGameStore.getState().units.mage.tags).toContain(UnitTag.LEASHED);
    expect(fired('H19_EMBERBIND_LEASH')).toBe(false);
  });

  it.each([
    SpellId.EMBERBIND, SpellId.CORRUPTED_QORK, SpellId.RAISE_SKELETON,
    SpellId.SUMMON_GHOUL, SpellId.PORTAL,
  ])('does not trigger cast hints after failed %s', (spellId) => {
    const state = spellState(spellId);
    state.arcaneCrystals = 0;
    useGameStore.setState(state);
    const trigger = vi.spyOn(hintSystem, 'tryTriggerHint');
    useGameStore.getState().castSpell(TARGET);
    expect(trigger).not.toHaveBeenCalled();
    expect(useGameStore.getState().pendingSpellCast).not.toBeNull();
  });

  it.each([
    SpellId.EMBERBIND, SpellId.CORRUPTED_QORK, SpellId.RAISE_SKELETON,
    SpellId.SUMMON_GHOUL, SpellId.PORTAL,
  ])('does not trigger cast hints for an invalid %s target', (spellId) => {
    useGameStore.setState(spellState(spellId));
    const trigger = vi.spyOn(hintSystem, 'tryTriggerHint');
    useGameStore.getState().castSpell({ x: 0, y: 0 });
    expect(trigger).not.toHaveBeenCalled();
    expect(useGameStore.getState().pendingSpellCast).not.toBeNull();
  });

  it('triggers H26 only after the Ghoul is committed', () => {
    useGameStore.setState(spellState(SpellId.SUMMON_GHOUL));
    const originalTrigger = hintSystem.tryTriggerHint;
    vi.spyOn(hintSystem, 'tryTriggerHint').mockImplementation((id) => {
      expect(Object.values(useGameStore.getState().units).some(
        (unit) => unit.type === UnitType.GHOUL,
      )).toBe(true);
      expect(useGameStore.getState().buildings['target-building']).toBeUndefined();
      return originalTrigger(id);
    });
    useGameStore.getState().castSpell(TARGET);
    expect(fired('H26_GHOUL_GRAVESTONES')).toBe(true);
    expect(useGameStore.getState().seenHints).toContain('H26_GHOUL_GRAVESTONES');
  });

  it('waits for a completed two-step Mage portal and ignores invalid second endpoints', () => {
    useGameStore.setState(makeState(SpellId.PORTAL));
    const trigger = vi.spyOn(hintSystem, 'tryTriggerHint');
    const first = { x: 4, y: 64 };
    const second = { x: 6, y: 64 };
    useGameStore.getState().castSpell(first);
    expect(useGameStore.getState().pendingMagePortalFirstPos).toEqual(first);
    expect(trigger).not.toHaveBeenCalled();
    useGameStore.getState().castSpell({ x: 6, y: 63 });
    expect(trigger).not.toHaveBeenCalled();
    expect(Object.keys(useGameStore.getState().portals)).toHaveLength(0);
    useGameStore.getState().castSpell(second);
    expect(Object.values(useGameStore.getState().portals)).toEqual([
      expect.objectContaining({ kind: 'MAGE' }),
    ]);
    expect(trigger).toHaveBeenCalledExactlyOnceWith('H24_MAGE_PORTAL');
    expect(useGameStore.getState().seenHints).toContain('H24_MAGE_PORTAL');
  });

  it('does not re-trigger H24 merely because a Mage portal already exists', () => {
    const state = spellState(SpellId.SUMMON_GHOUL);
    state.portals.old = {
      id: 'old', kind: 'MAGE', entrancePos: { x: 1, y: 64 }, exitPos: { x: 2, y: 64 },
      casterId: 'mage', createdTurn: state.turn, lastUsableTurn: state.turn + 1,
      pendingTeleportUnitId: null,
    };
    useGameStore.setState(state);
    useGameStore.getState().castSpell(TARGET);
    expect(fired('H24_MAGE_PORTAL')).toBe(false);
    expect(fired('H26_GHOUL_GRAVESTONES')).toBe(true);
  });

  it('does not trigger H19 merely because a leashed unit already exists', () => {
    const state = spellState(SpellId.SUMMON_GHOUL);
    const existing = makeUnit('existing-leashed', UnitType.EMBER_DEMON, { x: 7, y: 65 });
    existing.tags.push(UnitTag.LEASHED);
    state.units[existing.id] = existing;
    state.grid[65][7].unitId = existing.id;
    useGameStore.setState(state);
    useGameStore.getState().castSpell(TARGET);
    expect(fired('H19_EMBERBIND_LEASH')).toBe(false);
    expect(fired('H26_GHOUL_GRAVESTONES')).toBe(true);
  });
});

function stageInfestedTurn(faction: Faction = Faction.PLAYER, includeInfested = true): void {
  const state = makeState();
  state.pendingSpellCast = null;
  useGameStore.setState(state);
  vi.spyOn(enemySystem, 'runEnemyTurn').mockImplementation((snapshot) => ({
    finalState: produce(snapshot, (draft) => {
      for (const [id, position] of [
        ['z-last', { x: 7, y: 65 }],
        ['a-first', { x: 6, y: 65 }],
      ] as const) {
        const unit = makeUnit(id, UnitType.GUARD, position, faction);
        if (includeInfested) unit.tags.push(UnitTag.INFESTED);
        draft.units[id] = unit;
        draft.grid[position.y][position.x].unitId = id;
      }
    }),
    events: [{ type: 'UNIT_HEAL', unitId: 'mage', position: { ...MAGE_POSITION }, amount: 1 }],
    trace: null,
  }));
}

describe('QKP6 deferred Infested hint', () => {
  it('uses the new computed state, sorted unit ID and copied camera position after commit', () => {
    stageInfestedTurn();
    const originalDefer = useHintStore.getState().defer;
    const defer = vi.spyOn(useHintStore.getState(), 'defer').mockImplementation((hint) => {
      expect(useGameStore.getState().phase).toBe(GamePhase.ENEMY_TURN);
      expect(isDraft(hint.cameraTarget)).toBe(false);
      originalDefer(hint);
    });
    useGameStore.getState().endPlayerTurn();
    const resolved = useAnimationStore.getState().resolvedState!;
    expect(useGameStore.getState().units['a-first']).toBeUndefined();
    expect(defer).toHaveBeenCalledWith({
      hintId: H23, cameraTarget: { x: 6, y: 65 },
    });
    const deferred = useHintStore.getState().deferredHints.find((hint) => hint.hintId === H23)!;
    expect(deferred.cameraTarget).not.toBe(resolved.units['a-first'].position);
    expect(fired(H23)).toBe(false);
    expect(useGameStore.getState().seenHints).not.toContain(H23);
    useGameStore.getState().setGameState(resolved);
    expect(fired(H23)).toBe(true);
    expect(useAnimationStore.getState().cameraTarget).toEqual({ x: 6, y: 65 });
  });

  it.each([
    [Faction.ENEMY, true], [Faction.PLAYER, false],
  ])('does not defer H23 for faction %s with Infested=%s', (faction, infested) => {
    stageInfestedTurn(faction, infested);
    useGameStore.getState().endPlayerTurn();
    expect(useHintStore.getState().deferredHints.some((hint) => hint.hintId === H23)).toBe(false);
  });

  it.each(['disabled', 'seen', 'global', 'early'] as const)(
    'preserves the %s gate and does not move the camera when deferred H23 is rejected',
    (gate) => {
      stageInfestedTurn();
      if (gate === 'disabled') useHintOptionsStore.setState({ hintsEnabled: false });
      if (gate === 'seen') {
        useGameStore.setState({ seenHints: [...useGameStore.getState().seenHints, H23] });
      }
      if (gate === 'global') {
        useHintOptionsStore.setState({ globalShowCounts: { [H23]: HINTS.GLOBAL_MAX_SHOWS } });
      }
      if (gate === 'early') useGameStore.setState({ turn: HINTS.START_TURN - 2 });
      useGameStore.getState().endPlayerTurn();
      const resolved = useAnimationStore.getState().resolvedState!;
      useAnimationStore.getState().setCameraTarget({ x: 1, y: 1 });
      useGameStore.getState().setGameState(resolved);
      expect(fired(H23)).toBe(false);
      expect(useAnimationStore.getState().cameraTarget).toEqual({ x: 1, y: 1 });
      expect(useHintStore.getState().deferredHints).toEqual([]);
    },
  );
});
