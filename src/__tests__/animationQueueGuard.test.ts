import { beforeEach, describe, expect, it } from 'vitest';
import { generateInitialGameState } from '../mapGenerator';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { Faction } from '../types';
import type { GameEvent } from '../gameEvents';

function firstEnemySpawnEvent(): Extract<GameEvent, { type: 'ENEMY_SPAWN' }> {
  const state = useGameStore.getState();
  const template = Object.values(state.units).find((u) => u.faction === Faction.ENEMY);
  if (!template) throw new Error('expected initial enemy unit');
  let spawnPos = template.position;
  for (let y = 0; y < state.grid.length; y += 1) {
    for (let x = 0; x < state.grid[y].length; x += 1) {
      const tile = state.grid[y][x];
      if (!tile.isLava && !tile.buildingId && !tile.unitId) {
        spawnPos = { x, y };
        y = state.grid.length;
        break;
      }
    }
  }
  return {
    type: 'ENEMY_SPAWN',
    unit: { ...template, id: 'enemy_spawn_guard_test' },
    position: spawnPos,
    buildingId: 'enemy_spawn_building_guard_test',
  };
}

describe('animation queue revision guard', () => {
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

  it('ignores stale animation events from a superseded queue revision', () => {
    const event = firstEnemySpawnEvent();
    useAnimationStore.setState({ queueRevision: 2, processingRevision: 1 });
    const before = useGameStore.getState().grid[event.position.y][event.position.x].unitId;

    useGameStore.getState().applyEvent(event);

    expect(useGameStore.getState().units[event.unit.id]).toBeUndefined();
    expect(useGameStore.getState().grid[event.position.y][event.position.x].unitId).toBe(before);
  });

  it('applies animation events when processing the latest queue revision', () => {
    const event = firstEnemySpawnEvent();
    useAnimationStore.setState({ queueRevision: 3, processingRevision: 3 });

    useGameStore.getState().applyEvent(event);

    expect(useGameStore.getState().units[event.unit.id]).toBeDefined();
    expect(useGameStore.getState().grid[event.position.y][event.position.x].unitId).toBe(event.unit.id);
  });

  it('keeps stale processing revision after clear so late stale events stay ignored', () => {
    const event = firstEnemySpawnEvent();
    useAnimationStore.setState({ queueRevision: 10, processingRevision: 10 });

    useAnimationStore.getState().clear();
    useAnimationStore.getState().finishProcessing();
    useGameStore.getState().applyEvent(event);

    const { queueRevision, processingRevision } = useAnimationStore.getState();
    expect(queueRevision).toBe(11);
    expect(processingRevision).toBe(10);
    expect(useGameStore.getState().units[event.unit.id]).toBeUndefined();
  });
});
