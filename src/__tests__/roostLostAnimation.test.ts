import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMATION } from '../../config/animation';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { useFloaterStore } from '../floaterStore';
import { useGameStore } from '../gameStore';
import { useAnimationEngine } from '../useAnimationEngine';
import { advanceLavaWithEvents } from '../lavaSystem';
import { buildingName } from '../i18n/entityText';
import { t } from '../i18n/i18n';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitType } from '../types';
import type { Building, GameState, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

const effects = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void)) => { effects.cleanup = effect(); },
}));

function Harness() {
  useAnimationEngine();
  return null;
}

function state(revealed = true, faction: Faction = Faction.PLAYER): GameState {
  const def = UNIT_DEFINITIONS[UnitType.CRYSTAL_DRAKE];
  const unit: Unit = {
    id: 'drake', type: UnitType.CRYSTAL_DRAKE, faction, position: { x: 2, y: 1 },
    roostBuildingId: 'cave',
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0, movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasCapturedThisTurn: false,
    hasTradedThisTurn: false, hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0, lastMovedTurn: 0,
  };
  const cave: Building = {
    id: 'cave', type: BuildingType.CRYSTAL_CAVE, faction, position: { x: 1, y: 3 },
    hp: 100, maxHp: 100, specialistSlot: null, isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false, captureProgress: 0, isBeingCapturedBy: null,
    discoverRadius: 1, turnCapturedByPlayer: null, wasEnemyOwnedBeforeCapture: false,
    combatStats: null, hasAttackedThisTurn: false, tags: [], consumesUnitOnCapture: false,
    populationCount: 0, populationCap: 0, populationGrowthCounter: 0, strongholdNobles: 0,
    emberSpawnCounter: 0, recruitmentQueue: null, destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0, spawnCooldownRemaining: 0, lastRecruitmentTurn: 0,
  };
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y }, isRevealed: revealed, buildingId: null as string | null,
      unitId: null as string | null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    })),
  );
  grid[unit.position.y][unit.position.x].unitId = unit.id;
  grid[cave.position.y][cave.position.x].buildingId = cave.id;
  return {
    ...useGameStore.getInitialState(), grid, units: { drake: unit }, buildings: { cave },
    lavaFrontRow: 4,
  };
}

function death(annotated = true): Extract<GameEvent, { type: 'UNIT_DEATH' }> {
  const unit = useGameStore.getState().units.drake;
  return {
    type: 'UNIT_DEATH', unitId: unit.id, position: { ...unit.position }, faction: unit.faction,
    ...(annotated ? { lostRoostBuildingType: BuildingType.CRYSTAL_CAVE } : {}),
  };
}

function replay(events: GameEvent[]) {
  const camera = vi.spyOn(useAnimationStore.getState(), 'setCameraTarget');
  const animation = vi.spyOn(useCombatAnimationStore.getState(), 'setUnitAnimation');
  const floater = vi.spyOn(useFloaterStore.getState(), 'addFloater');
  renderToStaticMarkup(createElement(Harness));
  useAnimationStore.getState().enqueue(events, useGameStore.getState());
  useAnimationStore.setState({ resolvedState: null });
  return { camera, animation, floater };
}

const arrival = ANIMATION.CAMERA_MOVE_DURATION_MS + ANIMATION.PRE_ACTION_IDLE_MS;
const dying = ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS;
const hold = Math.max(dying, ANIMATION.ROOST_LOST_FLOATER_HOLD_MS);

describe('lost-roost death presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnimationStore.setState(useAnimationStore.getInitialState());
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
    useFloaterStore.setState(useFloaterStore.getInitialState());
    useGameStore.setState(state());
  });
  afterEach(() => {
    effects.cleanup?.();
    effects.cleanup = undefined;
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    useAnimationStore.getState().clear();
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
    useFloaterStore.setState(useFloaterStore.getInitialState());
  });

  it.each([Faction.PLAYER, Faction.ENEMY])(
    'starts the %s label and DYING on the same frame and holds the camera', async (faction) => {
      useGameStore.setState(state(true, faction));
      const times: number[] = [];
      const next: GameEvent = { type: 'UNIT_DEATH', unitId: 'missing', position: { x: 5, y: 1 }, faction };
      const animate = useCombatAnimationStore.getState().setUnitAnimation;
      const addFloater = useFloaterStore.getState().addFloater;
      const { camera, animation, floater } = replay([death(), next]);
      animation.mockImplementation((...args) => { times.push(Date.now()); animate(...args); });
      floater.mockImplementation((...args) => { times.push(Date.now()); addFloater(...args); });
      await vi.advanceTimersByTimeAsync(arrival - 1);
      expect(animation).not.toHaveBeenCalled();
      expect(floater).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(animation).toHaveBeenCalledWith('drake', { type: 'DYING' });
      expect(floater).toHaveBeenCalledExactlyOnceWith({
        value: 0,
        label: `🏔️ ${t('floater.roostLost', { building: buildingName(BuildingType.CRYSTAL_CAVE) })}`,
        x: 2, y: 1, isEnemy: faction === Faction.ENEMY, floaterType: 'damage',
      });
      expect(times).toHaveLength(2);
      expect(times[0]).toBe(times[1]);
      await vi.advanceTimersByTimeAsync(hold - 1);
      expect(useGameStore.getState().units.drake).toBeDefined();
      expect(camera).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(useGameStore.getState().units.drake).toBeUndefined();
      expect(animation).toHaveBeenLastCalledWith('drake', null);
      await vi.advanceTimersByTimeAsync(ANIMATION.POST_ACTION_IDLE_MS);
      expect(camera).toHaveBeenLastCalledWith(next.position);
      await vi.runAllTimersAsync();
    },
  );

  it('keeps unannotated deaths at the ordinary DYING duration without a label', async () => {
    const { floater, animation } = replay([death(false)]);
    await vi.advanceTimersByTimeAsync(arrival + dying - 1);
    expect(animation).toHaveBeenCalledWith('drake', { type: 'DYING' });
    expect(useGameStore.getState().units.drake).toBeDefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(useGameStore.getState().units.drake).toBeUndefined();
    expect(floater).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ANIMATION.POST_ACTION_IDLE_MS);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('applies hidden annotated deaths without a floater, DYING, camera or hold', async () => {
    useGameStore.setState(state(false));
    const { floater, animation, camera } = replay([death()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(useGameStore.getState().units.drake).toBeUndefined();
    expect(floater).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
    expect(camera).not.toHaveBeenCalled();
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('does not label or hold an already absent unit', async () => {
    const event = death();
    useGameStore.setState({ units: {} });
    const { floater, animation } = replay([event]);
    await vi.advanceTimersByTimeAsync(arrival + ANIMATION.POST_ACTION_IDLE_MS);
    expect(floater).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('keeps direct lava-tile deaths silent without DYING or the roost hold', async () => {
    const live = state();
    live.grid[1][2].isLava = true;
    useGameStore.setState(live);
    const { floater, animation } = replay([death()]);
    await vi.advanceTimersByTimeAsync(arrival);
    expect(useGameStore.getState().units.drake).toBeUndefined();
    expect(floater).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ANIMATION.POST_ACTION_IDLE_MS);
    expect(useAnimationStore.getState().isAnimating).toBe(false);
  });

  it('snapshots the lava-consumed roost type and presents the surviving-tile drake after lava', async () => {
    const { events, newState } = advanceLavaWithEvents(useGameStore.getState());
    expect(events[0].type).toBe('LAVA_ADVANCE');
    expect(events).toContainEqual(death());
    expect(newState.buildings.cave).toBeUndefined();
    expect(newState.units.drake).toBeUndefined();
    const { floater, animation, camera } = replay(events);
    await vi.advanceTimersByTimeAsync(arrival + ANIMATION.LAVA_ADVANCE_PAUSE_MS);
    expect(useGameStore.getState().buildings.cave).toBeUndefined();
    expect(useGameStore.getState().units.drake).toBeDefined();
    expect(floater).not.toHaveBeenCalled();
    expect(camera).toHaveBeenLastCalledWith({ x: 2, y: 1 });
    await vi.advanceTimersByTimeAsync(arrival);
    expect(animation).toHaveBeenCalledWith('drake', { type: 'DYING' });
    expect(floater).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(hold);
    expect(useGameStore.getState().units.drake).toBeUndefined();
    await vi.runAllTimersAsync();
  });
});
