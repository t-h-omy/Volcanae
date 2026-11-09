import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMATION } from '../../config/animation';
import { CRYSTAL_CHAMBER_CONFIG, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { useGameStore } from '../gameStore';
import { useAnimationEngine } from '../useAnimationEngine';
import { advanceLavaWithEvents } from '../lavaSystem';
import { BuildingType, DestroyBehavior, Faction, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Unit } from '../types';
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

function unit(id: string, x: number, overrides: Partial<Unit> = {}): Unit {
  const def = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON];
  return {
    id, type: UnitType.CRYSTAL_KHYRON, faction: Faction.PLAYER,
    position: { x, y: 1 },
    stats: {
      maxHp: def.maxHp, currentHp: def.maxHp, attack: def.attack, defense: def.defense,
      moveRange: def.moveRange, discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0, movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [], resonanceActive: false,
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasCapturedThisTurn: false,
    hasTradedThisTurn: false, hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0, lastMovedTurn: 0,
    ...overrides,
  };
}

function building(id: string, type: BuildingType, position: Position): Building {
  return {
    id, type, position, faction: Faction.PLAYER, hp: 100, maxHp: 100,
    specialistSlot: null, isDisabledForTurns: 0, wasAttackedLastEnemyTurn: false,
    captureProgress: 0, isBeingCapturedBy: null, discoverRadius: 1,
    turnCapturedByPlayer: null, wasEnemyOwnedBeforeCapture: false, combatStats: null,
    hasAttackedThisTurn: false, tags: [], consumesUnitOnCapture: false,
    populationCount: 0, populationCap: 0, populationGrowthCounter: 0, strongholdNobles: 0,
    emberSpawnCounter: 0, recruitmentQueue: null, destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0, spawnCooldownRemaining: 0, lastRecruitmentTurn: 0,
  };
}

function state(revealed = true): GameState {
  const units = [unit('first', 2), unit('second', 3)];
  const buildings = [
    building('chamber', BuildingType.CRYSTAL_CHAMBER, { x: 0, y: 0 }),
    building('cave', BuildingType.CRYSTAL_CAVE, { x: 1, y: 0 }),
  ];
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y }, isRevealed: revealed, buildingId: null as string | null,
      unitId: null as string | null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    })),
  );
  for (const u of units) grid[u.position.y][u.position.x].unitId = u.id;
  for (const b of buildings) grid[b.position.y][b.position.x].buildingId = b.id;
  return {
    ...useGameStore.getInitialState(), grid,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    buildings: Object.fromEntries(buildings.map((b) => [b.id, b])),
  };
}

function resonance(overrides: Partial<Extract<GameEvent, { type: 'RESONANCE_TRIGGERED' }>> = {}):
  Extract<GameEvent, { type: 'RESONANCE_TRIGGERED' }> {
  return {
    type: 'RESONANCE_TRIGGERED',
    sources: [{ sourceId: 'lava-source', position: { x: 0, y: 3 } }],
    reachedNodes: [
      {
        buildingId: 'chamber',
        buildingType: BuildingType.CRYSTAL_CHAMBER,
        position: { x: 0, y: 0 },
        sourceId: 'lava-source',
        parentBuildingId: null,
        parentPosition: { x: 0, y: 3 },
        hopDepth: 1,
        wasResonating: false,
      },
      {
        buildingId: 'cave',
        buildingType: BuildingType.CRYSTAL_CAVE,
        position: { x: 1, y: 0 },
        sourceId: 'lava-source',
        parentBuildingId: 'chamber',
        parentPosition: { x: 0, y: 0 },
        hopDepth: 2,
        wasResonating: false,
      },
    ],
    survivingKhyronIds: ['first', 'second'],
    resonanceDuration: CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION, ...overrides,
  };
}

function replay(events: GameEvent[]) {
  const activate = vi.spyOn(useGameStore.getState(), 'activateCrystalKhyron');
  const camera = vi.spyOn(useAnimationStore.getState(), 'setCameraTarget');
  const animation = vi.spyOn(useCombatAnimationStore.getState(), 'setUnitAnimation');
  useAnimationStore.getState().enqueue(events, useGameStore.getState());
  renderToStaticMarkup(createElement(Harness));
  // Exercise live event application without a final snapshot masking missing mutations.
  useAnimationStore.setState({ resolvedState: null });
  return { activate, camera, animation };
}

describe('Khyron resonance event presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnimationStore.setState(useAnimationStore.getInitialState());
    useCombatAnimationStore.setState(useCombatAnimationStore.getInitialState());
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
  });

  it('presents the source and each graph hop before activating Khyrons', async () => {
    const { activate, camera, animation } = replay([resonance()]);
    await vi.runAllTimersAsync();
    expect(camera.mock.calls).toEqual([
      [{ x: 0, y: 3 }, ANIMATION.RESONANCE_CAMERA_MOVE_DURATION_MS],
      [{ x: 0, y: 0 }, ANIMATION.RESONANCE_CAMERA_MOVE_DURATION_MS],
    ]);
    expect(useGameStore.getState().buildings.chamber.resonanceTurnsRemaining).toBeGreaterThan(0);
    expect(useGameStore.getState().buildings.cave.resonanceTurnsRemaining).toBeGreaterThan(0);
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    expect(useGameStore.getState().units.first.tags).toContain(UnitTag.RESONANCE);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(true);
    expect(animation).toHaveBeenLastCalledWith('second', null);
    expect(useCombatAnimationStore.getState().unitAnimations.size).toBe(0);
  });

  it('deduplicates IDs and repeated sources, skipping missing, dead and ineligible units', async () => {
    const live = state();
    live.units.dead = unit('dead', 4);
    live.units.dead.stats.currentHp = 0;
    live.units.enemy = unit('enemy', 5, { faction: Faction.ENEMY });
    live.units.other = unit('other', 6, { type: UnitType.SWORDSMAN });
    useGameStore.setState(live);
    const event = resonance({ survivingKhyronIds: ['missing', 'dead', 'enemy', 'other', 'first', 'first', 'second'] });
    const { activate, camera } = replay([event, event]);
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    expect(camera.mock.calls.filter(([pos]) => pos.y === 1)).toEqual([]);
  });

  it('rechecks the live unit after camera arrival instead of activating a removed unit', async () => {
    const { activate } = replay([resonance({
      reachedNodes: [{
        buildingId: 'missing-chamber',
        buildingType: BuildingType.CRYSTAL_CHAMBER,
        position: { x: 0, y: 0 },
        sourceId: 'lava-source',
        parentBuildingId: null,
        parentPosition: { x: 0, y: 3 },
        hopDepth: 1,
        wasResonating: false,
      }],
    })]);
    useGameStore.setState((live) => ({
      units: Object.fromEntries(Object.entries(live.units).filter(([id]) => id !== 'first')),
    }));
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['second']]);
  });

  it('activates hidden-event live Khyrons without camera, VFX or final snapshot', async () => {
    useGameStore.setState(state(false));
    const { activate, camera, animation } = replay([resonance(), resonance()]);
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(true);
    expect(camera).not.toHaveBeenCalled();
    expect(animation).not.toHaveBeenCalled();
  });

  it('presents a revealed Khyron even when the trigger source is fogged', async () => {
    const live = state(false);
    live.grid[1][2].isRevealed = true;
    useGameStore.setState(live);
    const { activate, camera, animation } = replay([resonance()]);
    await vi.runAllTimersAsync();
    expect(activate.mock.calls).toEqual([['first'], ['second']]);
    expect(camera.mock.calls).toEqual([[
      { x: 2, y: 1 },
      ANIMATION.RESONANCE_CAMERA_MOVE_DURATION_MS,
    ]]);
    expect(animation).toHaveBeenCalled();
    expect(useGameStore.getState().units.second.resonanceActive).toBe(true);
  });

  it('deduplicates overlapping hidden sources and refreshes only reached nodes', async () => {
    const live = state(false);
    live.grid[0][0].isRevealed = true;
    live.grid[0][1].isRevealed = true;
    live.buildings.chamber.resonanceTurnsRemaining = 1;
    live.buildings.cave.resonanceTurnsRemaining = 0;
    const isolated = building('isolated', BuildingType.CRYSTAL_CAVE, { x: 5, y: 0 });
    isolated.resonanceTurnsRemaining = 2;
    live.buildings.isolated = isolated;
    live.grid[0][5].buildingId = isolated.id;
    useGameStore.setState(live);
    const activateChamber = vi.spyOn(useGameStore.getState(), 'activateCrystalChamber');
    const activateCave = vi.spyOn(useGameStore.getState(), 'activateCrystalCave');
    const event = resonance({
      sources: [
        { sourceId: 'origin-left', position: { x: 0, y: 3 } },
        { sourceId: 'origin-right', position: { x: 4, y: 3 } },
      ],
      reachedNodes: [
        {
          ...resonance().reachedNodes[0]!,
          sourceId: 'origin-left',
          wasResonating: true,
        },
        {
          ...resonance().reachedNodes[1]!,
          sourceId: 'origin-left',
        },
      ],
    });
    const { animation } = replay([event]);
    await vi.runAllTimersAsync();

    expect(activateChamber).toHaveBeenCalledTimes(1);
    expect(activateCave).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().buildings.chamber.resonanceTurnsRemaining)
      .toBe(CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION);
    expect(useGameStore.getState().buildings.cave.resonanceTurnsRemaining)
      .toBe(CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION);
    expect(useGameStore.getState().buildings.isolated.resonanceTurnsRemaining).toBe(2);
    expect(animation).not.toHaveBeenCalled();
    expect(useCombatAnimationStore.getState().lineVfx.map(({ fromPx, toPx }) => [fromPx, toPx])).toEqual([
      [{ x: 40, y: 280 }, { x: 40, y: 40 }],
      [{ x: 40, y: 40 }, { x: 120, y: 40 }],
    ]);
    expect(useCombatAnimationStore.getState().lineVfx.map(({ durationMs }) => durationMs)).toEqual([330, 320]);
  });

  it('does not activate Khyrons for a cave-only event even with supplied IDs', async () => {
    const { activate } = replay([resonance({
      reachedNodes: [{
        buildingId: 'cave',
        buildingType: BuildingType.CRYSTAL_CAVE,
        position: { x: 1, y: 0 },
        sourceId: 'lava-source',
        parentBuildingId: null,
        parentPosition: { x: 0, y: 3 },
        hopDepth: 1,
        wasResonating: false,
      }],
    })]);
    await vi.runAllTimersAsync();
    expect(activate).not.toHaveBeenCalled();
    expect(useGameStore.getState().units.first.resonanceActive).toBe(false);
    expect(useGameStore.getState().buildings.cave.resonanceTurnsRemaining).toBeGreaterThan(0);
  });

  it('the store activates one eligible unit only and Chamber activation never grants globally', () => {
    const live = state();
    live.units.dead = unit('dead', 4);
    live.units.dead.stats.currentHp = 0;
    live.units.enemy = unit('enemy', 5, { faction: Faction.ENEMY });
    live.units.other = unit('other', 6, { type: UnitType.SWORDSMAN });
    useGameStore.setState(live);
    useGameStore.getState().activateCrystalChamber('chamber');
    expect(Object.values(useGameStore.getState().units).every((u) => !u.resonanceActive)).toBe(true);
    for (const id of ['missing', 'dead', 'enemy', 'other', 'first', 'first']) {
      useGameStore.getState().activateCrystalKhyron(id);
    }
    expect(useGameStore.getState().units.first.tags).toEqual([UnitTag.RESONANCE]);
    expect(useGameStore.getState().units.first.resonanceActive).toBe(true);
    expect(useGameStore.getState().units.second.resonanceActive).toBe(false);
  });

  it.each([true, false])('emits surviving Khyron IDs only with a surviving Chamber: %s', (hasChamber) => {
    const live = state();
    live.buildings.chamber.position = { x: 0, y: 1 };
    live.grid[0][0].buildingId = null;
    live.grid[1][0].buildingId = 'chamber';
    const doomed = building('doomed', BuildingType.CRYSTAL_CHAMBER, { x: 0, y: 4 });
    live.buildings.doomed = doomed;
    live.grid[4][0].buildingId = doomed.id;
    live.lavaFrontRow = 5;
    live.units['doomed-unit'] = unit('doomed-unit', 1, { position: { x: 1, y: 4 } });
    live.grid[4][1].unitId = 'doomed-unit';
    live.units.enemy = unit('enemy', 5, { faction: Faction.ENEMY });
    if (!hasChamber) {
      delete live.buildings.chamber;
      live.grid[0][0].buildingId = null;
    }
    const { events, newState } = advanceLavaWithEvents(live);
    const event = events.find((e) => e.type === 'RESONANCE_TRIGGERED');
    expect(event?.type).toBe('RESONANCE_TRIGGERED');
    if (event?.type !== 'RESONANCE_TRIGGERED') return;
    if (hasChamber) expect(event.survivingKhyronIds).toEqual(['first', 'second']);
    else expect(event).not.toHaveProperty('survivingKhyronIds');
    expect(newState.units.first.resonanceActive).toBe(hasChamber);
    expect(live.units.first.resonanceActive).toBe(false);
  });
});
