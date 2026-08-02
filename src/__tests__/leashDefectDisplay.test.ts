import { beforeEach, describe, expect, it } from 'vitest';
import { generateInitialGameState } from '../mapGenerator';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { Faction, UnitTag } from '../types';
import type { GameEvent } from '../gameEvents';

function buildLeashDefectEvent(demonId: string): Extract<GameEvent, { type: 'LEASH_DEFECT' }> {
  return {
    type: 'LEASH_DEFECT',
    demonId,
    mageId: 'mage_test',
    demonPos: { x: 0, y: 0 },
    magePos: { x: 1, y: 0 },
  };
}

describe('LEASH_DEFECT live display replay', () => {
  beforeEach(() => {
    useGameStore.setState(generateInitialGameState());
    useAnimationStore.setState({
      eventQueue: [],
      resolvedState: null,
      isAnimating: false,
      queueRevision: 1,
      processingRevision: 1,
    });
  });

  it('mirrors the resolved leash-defection mutation into the live display state', () => {
    const state = useGameStore.getState();
    const demon = Object.values(state.units).find((unit) => unit.faction === Faction.PLAYER);
    expect(demon).toBeDefined();
    if (!demon) return;

    useGameStore.setState((draft) => {
      const liveUnit = draft.units[demon.id];
      liveUnit.faction = Faction.PLAYER;
      liveUnit.controllerMageId = 'mage_test';
      liveUnit.tags = [UnitTag.LAVA, UnitTag.SUMMONED, UnitTag.LEASHED];
    });

    useGameStore.getState().applyEvent(buildLeashDefectEvent(demon.id));

    const defected = useGameStore.getState().units[demon.id];
    expect(defected?.faction).toBe(Faction.ENEMY);
    expect(defected?.controllerMageId).toBeNull();
    expect(defected?.tags).toEqual([UnitTag.LAVA]);
  });

  it('is idempotent when the demon has already defected', () => {
    const state = useGameStore.getState();
    const demon = Object.values(state.units).find((unit) => unit.faction === Faction.PLAYER);
    expect(demon).toBeDefined();
    if (!demon) return;

    useGameStore.setState((draft) => {
      const liveUnit = draft.units[demon.id];
      liveUnit.faction = Faction.ENEMY;
      liveUnit.controllerMageId = null;
      liveUnit.tags = [UnitTag.LAVA];
    });

    const event = buildLeashDefectEvent(demon.id);
    useGameStore.getState().applyEvent(event);
    const afterFirst = useGameStore.getState().units[demon.id];
    useGameStore.getState().applyEvent(event);
    const afterSecond = useGameStore.getState().units[demon.id];

    expect(afterFirst).toEqual(afterSecond);
    expect(afterSecond?.faction).toBe(Faction.ENEMY);
    expect(afterSecond?.controllerMageId).toBeNull();
    expect(afterSecond?.tags).toEqual([UnitTag.LAVA]);
  });

  it('does nothing when the demon is missing from the live display state', () => {
    const beforeUnits = useGameStore.getState().units;

    expect(() => {
      useGameStore.getState().applyEvent(buildLeashDefectEvent('missing_demon'));
    }).not.toThrow();

    expect(useGameStore.getState().units).toEqual(beforeUnits);
  });
});
