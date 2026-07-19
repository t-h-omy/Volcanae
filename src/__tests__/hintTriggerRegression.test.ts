import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { tryTriggerHint } from '../hintSystem';
import { Difficulty, Faction, UnitType } from '../types';
import { useAnimationStore } from '../animationStore';
import type { GameState } from '../types';
import { UNIT_DEFINITIONS } from '../gameConfig';

function resetHintStores() {
  useHintStore.setState({ queue: [], activeHintId: null, expanded: false });
  useHintOptionsStore.setState({ hintsEnabled: true, globalShowCounts: {} });
  useAnimationStore.getState().clear();
}

function snapshotGameState(): GameState {
  const full = useGameStore.getState();
  return Object.fromEntries(
    Object.entries(full).filter(([, v]) => typeof v !== 'function'),
  ) as GameState;
}

describe('hint trigger regressions', () => {
  beforeEach(() => {
    resetHintStores();
    useGameStore.getState().initNewGame(Difficulty.STANDARD);
    useGameStore.setState({ turn: 2 });
  });

  it('triggers H14 when selecting a Guard', () => {
    const state = useGameStore.getState();
    const playerUnit = Object.values(state.units).find(
      (u) => u.faction === Faction.PLAYER,
    );
    expect(playerUnit).toBeDefined();

    const guardDef = UNIT_DEFINITIONS[UnitType.GUARD];
    const guard = {
      ...playerUnit!,
      type: UnitType.GUARD,
      stats: {
        ...playerUnit!.stats,
        maxHp: guardDef.maxHp,
        currentHp: guardDef.maxHp,
        attack: guardDef.attack,
        defense: guardDef.defense,
        moveRange: guardDef.moveRange,
        discoverRadius: guardDef.discoverRadius,
        triggerRange: guardDef.triggerRange ?? 0,
        movementActions: guardDef.movementActions ?? 1,
        attackRange: guardDef.attackRange,
      },
      tags: [...guardDef.tags],
    };
    useGameStore.setState({ units: { ...state.units, [guard.id]: guard } });

    useGameStore.getState().selectUnit(guard.id);

    const { activeHintId, queue } = useHintStore.getState();
    const hintFired = activeHintId === 'H14_FIRST_TECH_FIELD_DUTIES' || queue.includes('H14_FIRST_TECH_FIELD_DUTIES');
    expect(hintFired).toBe(true);
  });

  it('keeps seenHints across setGameState so H06 does not retrigger in the same save', () => {
    expect(tryTriggerHint('H06_LAVA_ADVANCE')).toBe(true);
    expect(useGameStore.getState().seenHints).toContain('H06_LAVA_ADVANCE');

    const staleResolved = {
      ...snapshotGameState(),
      seenHints: [],
    };
    useGameStore.getState().setGameState(staleResolved);

    expect(useGameStore.getState().seenHints).toContain('H06_LAVA_ADVANCE');

    useHintStore.setState({ queue: [], activeHintId: null, expanded: false });
    expect(tryTriggerHint('H06_LAVA_ADVANCE')).toBe(false);
  });
});
