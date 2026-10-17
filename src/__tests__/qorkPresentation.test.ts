import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { RENDER } from '../../config/render';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import type { SlideKillGhost } from '../combatAnimationStore';
import GridRenderer from '../components/GridRenderer';
import { useFloaterStore } from '../floaterStore';
import { UNIT_DEFINITIONS } from '../gameConfig';
import type { GameEvent } from '../gameEvents';
import { addDirectQorkDeathVfx, hasQueuedQorkBurst, useGameStore } from '../gameStore';
import { generateInitialGameState } from '../mapGenerator';
import { Faction, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { Unit } from '../types';

// Read live test snapshots while server rendering the grid.
vi.mock('../gameStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../gameStore')>();
  return {
    ...actual,
    useGameStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useGameStore.getState>) => unknown) =>
        selector(actual.useGameStore.getState()),
      actual.useGameStore,
    ),
  };
});

vi.mock('../combatAnimationStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../combatAnimationStore')>();
  return {
    ...actual,
    useCombatAnimationStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useCombatAnimationStore.getState>) => unknown) =>
        selector(actual.useCombatAnimationStore.getState()),
      actual.useCombatAnimationStore,
    ),
  };
});

const qorkId = 'presentation-qork';
const origin = { x: 4, y: 40 };
const death: Extract<GameEvent, { type: 'UNIT_DEATH' }> = {
  type: 'UNIT_DEATH',
  unitId: qorkId,
  position: origin,
  faction: Faction.ENEMY,
};

function burst(unitId = qorkId, position = origin): Extract<GameEvent, { type: 'QORK_DEATH_BURST' }> {
  return { type: 'QORK_DEATH_BURST', unitId, position, faction: Faction.ENEMY, damagedUnitIds: [] };
}

beforeEach(() => {
  const initial = generateInitialGameState();
  const base = Object.values(initial.units)[0];
  const definition = UNIT_DEFINITIONS[UnitType.CORRUPTED_QORK];
  const qork: Unit = {
    ...base,
    id: qorkId,
    type: UnitType.CORRUPTED_QORK,
    faction: Faction.ENEMY,
    position: { ...origin },
    tags: [...definition.tags],
    stats: { ...base.stats, currentHp: definition.maxHp, maxHp: definition.maxHp },
    infestedDeathEffectResolved: false,
  };
  useGameStore.setState({
    ...initial,
    units: { [qorkId]: qork },
    buildings: {},
    selectedUnitId: null,
    selectedBuildingId: null,
    grid: initial.grid.map((row, y) => row.map((tile, x) => ({
      ...tile,
      isRevealed: true,
      unitId: x === origin.x && y === origin.y ? qorkId : null,
      buildingId: null,
      status: null,
      terrainType: TileType.PLAINS,
      isLava: false,
      isLavaPreview: false,
    }))),
  });
  useAnimationStore.setState({
    eventQueue: [],
    resolvedState: null,
    queueRevision: 1,
    processingRevision: null,
    isAnimating: false,
  });
  useCombatAnimationStore.setState({
    unitAnimations: new Map(),
    slideKillGhosts: new Map(),
    tileVfx: [],
  });
  useFloaterStore.setState({ floaters: [] });
});

describe('Qork presentation identity and direct fallback', () => {
  it('matches queued bursts by unit ID even when positions differ', () => {
    useAnimationStore.setState({ eventQueue: [burst(qorkId, { x: origin.x + 1, y: origin.y })] });
    expect(hasQueuedQorkBurst(qorkId)).toBe(true);
    expect(hasQueuedQorkBurst('other-qork')).toBe(false);
    useGameStore.getState().applyEvent(death);
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
  });

  it('does not let another Qork burst on the same tile suppress the fallback', () => {
    useAnimationStore.setState({ eventQueue: [burst('other-qork')] });
    useGameStore.getState().applyEvent(death);
    expect(useCombatAnimationStore.getState().tileVfx.map((vfx) => vfx.variant))
      .toEqual(['QORK_DEATH_BURST', 'CORRUPTION_FIZZLE']);
  });

  it('marks the emitting Qork, not the advanced tile occupant, after shifting a burst', () => {
    const occupantId = 'advanced-qork';
    useGameStore.setState((state) => {
      state.units[occupantId] = { ...state.units[qorkId], id: occupantId };
      state.grid[origin.y][origin.x].unitId = occupantId;
    });
    useAnimationStore.setState({ eventQueue: [burst()] });
    const event = useAnimationStore.getState().shiftEvent()!;
    useGameStore.getState().applyEvent(event);
    expect(useGameStore.getState().units[qorkId].infestedDeathEffectResolved).toBe(true);
    expect(useGameStore.getState().units[occupantId].infestedDeathEffectResolved).toBe(false);
    useGameStore.getState().applyEvent(death);
    expect(useGameStore.getState().grid[origin.y][origin.x].unitId).toBe(occupantId);
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
  });

  it('starts direct visuals without damage and does not replay them on managed removal', () => {
    const beforeHp = useGameStore.getState().units[qorkId].stats.currentHp;
    useCombatAnimationStore.getState().setUnitAnimation(qorkId, { type: 'DYING' });
    addDirectQorkDeathVfx(useGameStore.getState(), origin);
    expect(useGameStore.getState().units[qorkId].stats.currentHp).toBe(beforeHp);
    expect(useCombatAnimationStore.getState().unitAnimations.get(qorkId)).toEqual({ type: 'DYING' });
    expect(useCombatAnimationStore.getState().tileVfx[0].durationMs).toBe(ANIMATION.QORK_DEATH_BURST_MS);
    useCombatAnimationStore.setState({ tileVfx: [] });
    useGameStore.getState().applyEvent(death, { suppressQorkDeathVfx: true });
    expect(useGameStore.getState().units[qorkId]).toBeUndefined();
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
  });

  it('uses resolved corruption presentation without mutating the display tile', () => {
    const resolved = structuredClone(useGameStore.getState().grid);
    resolved[origin.y][origin.x].status = TileStatus.CORRUPTED;
    useAnimationStore.setState({ resolvedState: { ...useGameStore.getState(), grid: resolved } });
    addDirectQorkDeathVfx(useGameStore.getState(), origin, true);
    expect(useCombatAnimationStore.getState().tileVfx.map((vfx) => vfx.variant))
      .toEqual(['QORK_DEATH_BURST', 'CORRUPTION_APPLIED']);
    expect(useGameStore.getState().grid[origin.y][origin.x].status).toBeNull();
  });

  it('does not duplicate an active direct burst', () => {
    addDirectQorkDeathVfx(useGameStore.getState(), origin);
    addDirectQorkDeathVfx(useGameStore.getState(), origin);
    expect(useCombatAnimationStore.getState().tileVfx).toHaveLength(2);
  });

  it('applies invisible death without Qork, infested, or brandmark visuals', () => {
    useGameStore.setState((state) => {
      state.units[qorkId].tags.push(UnitTag.INFESTED, UnitTag.BRANDMARKED);
    });
    useGameStore.getState().applyEvent(death, { silent: true });
    expect(useGameStore.getState().units[qorkId]).toBeUndefined();
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
    expect(useFloaterStore.getState().floaters).toEqual([]);
  });

  it('silently applies lava cleanup without Qork or infested visuals', () => {
    useGameStore.setState((state) => {
      state.lavaFrontRow = origin.y + 1;
      state.units[qorkId].tags.push(UnitTag.INFESTED);
    });
    useGameStore.getState().applyEvent({
      type: 'LAVA_ADVANCE',
      newLavaRow: origin.y,
      destroyedUnitIds: [qorkId],
      destroyedBuildingIds: [],
    }, { silent: true });
    expect(useGameStore.getState().units[qorkId]).toBeUndefined();
    expect(useGameStore.getState().grid[origin.y][origin.x].isLava).toBe(true);
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
    expect(useFloaterStore.getState().floaters).toEqual([]);
  });

  it('silently applies collapse cleanup without death bursts or notification floaters', () => {
    useGameStore.setState((state) => {
      state.units[qorkId].tags.push(UnitTag.INFESTED);
    });
    useGameStore.getState().applyEvent({
      type: 'SANCTUM_COLLAPSE',
      sanctumPosition: origin,
      zone: 1,
      purgedUnitIds: [qorkId],
      destroyedBuildingIds: [],
      lockoutUntilTurn: 2,
      spawnFreezeUntilTurn: 0,
      lavaAdvanceBonus: 0,
    }, { silent: true });
    expect(useGameStore.getState().units[qorkId]).toBeUndefined();
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
    expect(useFloaterStore.getState().floaters).toEqual([]);
  });

  it.each(['ENEMY_ATTACK', 'PLAYER_ATTACK'] as const)(
    'silently applies hidden %s and its queued Qork burst without floaters',
    (type) => {
      const attackerId = 'hidden-attacker';
      const attackerPosition = { x: origin.x - 1, y: origin.y };
      useGameStore.setState((state) => {
        state.units[attackerId] = {
          ...state.units[qorkId],
          id: attackerId,
          type: UnitType.SCOUT,
          position: attackerPosition,
          xp: 0,
        };
        state.grid[attackerPosition.y][attackerPosition.x].unitId = attackerId;
        for (const row of state.grid) for (const tile of row) tile.isRevealed = false;
      });
      const beforeHp = useGameStore.getState().units[attackerId].stats.currentHp;
      useAnimationStore.setState({ eventQueue: [burst()] });
      useGameStore.getState().applyEvent({
        type,
        attackerId,
        defenderId: qorkId,
        attackerPosition,
        defenderPosition: origin,
        attackerHpLost: 1,
        defenderHpLost: 1,
        advancedToPosition: null,
        attackerXpGained: 1,
      }, { silent: true });
      useGameStore.getState().applyEvent(useAnimationStore.getState().shiftEvent()!, { silent: true });
      useGameStore.getState().applyEvent({
        type: 'TILE_DAMAGE',
        unitId: attackerId,
        position: attackerPosition,
        amount: 1,
        damageSource: 'QORK_EXPLOSION',
      }, { silent: true });
      useGameStore.getState().applyEvent(death, { silent: true });
      expect(useGameStore.getState().units[attackerId].stats.currentHp).toBe(beforeHp - 2);
      expect(useGameStore.getState().units[attackerId].xp).toBe(1);
      expect(useGameStore.getState().units[qorkId]).toBeUndefined();
      expect(useFloaterStore.getState().floaters).toEqual([]);
      expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
      expect(useCombatAnimationStore.getState().unitAnimations.size).toBe(0);
    },
  );

  const hiddenDamageEvents: GameEvent[] = [
    {
      type: 'SPLASH_DAMAGE',
      unitId: qorkId,
      position: origin,
      amount: 1,
      isEnemy: true,
    },
    {
      type: 'BUILDING_ATTACK',
      buildingId: 'hidden-building',
      buildingPosition: origin,
      defenderId: qorkId,
      defenderPosition: origin,
      buildingHpLost: 1,
      defenderHpLost: 1,
      defenderXpGained: 1,
    },
    {
      type: 'UNIT_ATTACK_BUILDING',
      attackerId: qorkId,
      attackerPosition: origin,
      buildingId: 'hidden-building',
      buildingPosition: origin,
      attackerHpLost: 1,
      buildingHpLost: 1,
      attackerXpGained: 1,
    },
    {
      type: 'CLEAVE_DAMAGE',
      unitId: qorkId,
      position: origin,
      attackerPosition: origin,
      amount: 1,
      isEnemy: true,
    },
    {
      type: 'PIERCE_DAMAGE',
      unitId: qorkId,
      buildingId: null,
      position: origin,
      attackerPosition: origin,
      primaryDefenderPosition: origin,
      amount: 1,
      isEnemy: true,
    },
  ];

  it.each(hiddenDamageEvents)('silently applies $type damage without floaters', (event) => {
    const beforeHp = useGameStore.getState().units[qorkId].stats.currentHp;
    useGameStore.getState().applyEvent(event, { silent: true });
    expect(useGameStore.getState().units[qorkId].stats.currentHp).toBe(beforeHp - 1);
    expect(useFloaterStore.getState().floaters).toEqual([]);
    expect(useCombatAnimationStore.getState().tileVfx).toEqual([]);
  });
});

describe('Qork dying-in-place ghost', () => {
  const ghost: SlideKillGhost = {
    id: qorkId,
    unitType: UnitType.CORRUPTED_QORK,
    faction: Faction.ENEMY,
    deathTileX: origin.x,
    deathTileY: origin.y,
    variant: 'dying-in-place',
    phase: 'dying',
  };

  it('renders a flashing ghost on an occupied tile without slide displacement', () => {
    useCombatAnimationStore.getState().addSlideKillGhost(ghost);
    useGameStore.setState((state) => {
      const attacker = { ...state.units[qorkId], id: 'advanced-attacker', type: UnitType.LAVA_GRUNT };
      delete state.units[qorkId];
      state.units[attacker.id] = attacker;
      state.grid[origin.y][origin.x].unitId = attacker.id;
    });
    const markup = renderToStaticMarkup(createElement(GridRenderer));
    expect(markup).toContain('slide-kill-ghost slide-kill-ghost--dying');
    expect(markup.includes(`translate(${origin.x * RENDER.TILE_SIZE_DESKTOP}px, ${origin.y * RENDER.TILE_SIZE_DESKTOP}px)`)).toBe(true);
    expect(markup).toContain('--slide-start-x:0px;--slide-start-y:0px');
    expect(markup).toContain(`--die-flash-duration:${ANIMATION.DIE_FLASH_DURATION_MS}ms`);
    expect(markup).toContain(`--die-fade-duration:${ANIMATION.DIE_FADE_DURATION_MS}ms`);
    expect(markup).toContain('slide-kill-ghost__skull');
    expect(useGameStore.getState().grid[origin.y][origin.x].unitId).toBe('advanced-attacker');
  });

  it('keeps in-place ghosts dying until explicit cleanup', () => {
    const store = useCombatAnimationStore.getState();
    store.addSlideKillGhost(ghost);
    store.setSlideKillGhostPhase(ghost.id, 'falling');
    expect(useCombatAnimationStore.getState().slideKillGhosts.get(ghost.id)).toEqual(ghost);
    store.removeSlideKillGhost(ghost.id);
    expect(useCombatAnimationStore.getState().slideKillGhosts.size).toBe(0);
  });

  it('hides a retained body while its in-place ghost owns the death animation', () => {
    const store = useCombatAnimationStore.getState();
    expect(renderToStaticMarkup(createElement(GridRenderer)).includes('class="unit-main-img"')).toBe(true);
    store.addSlideKillGhost(ghost);
    expect(useCombatAnimationStore.getState().slideKillGhosts.get(qorkId)).toEqual(ghost);
    const markup = renderToStaticMarkup(createElement(GridRenderer));
    expect(markup.includes('class="unit-main-img"')).toBe(false);
    expect(markup.includes('slide-kill-ghost slide-kill-ghost--dying')).toBe(true);
    expect(useGameStore.getState().units[qorkId]).toBeDefined();
    store.removeSlideKillGhost(qorkId);
    expect(renderToStaticMarkup(createElement(GridRenderer)).includes('class="unit-main-img"')).toBe(true);
  });

  it('preserves frozen slide displacement and slide/dying/fall phase transitions', () => {
    const sliding: SlideKillGhost = {
      id: 'frozen-slide-ghost',
      unitType: UnitType.CORRUPTED_QORK,
      faction: Faction.ENEMY,
      deathTileX: origin.x,
      deathTileY: origin.y,
      slideDx: RENDER.TILE_SIZE_DESKTOP,
      slideDy: -RENDER.TILE_SIZE_DESKTOP,
      phase: 'slide',
    };
    const store = useCombatAnimationStore.getState();
    store.addSlideKillGhost(sliding);
    const markup = renderToStaticMarkup(createElement(GridRenderer));
    expect(markup).toContain('slide-kill-ghost slide-kill-ghost--slide');
    expect(markup).toContain(`--slide-start-x:${sliding.slideDx}px;--slide-start-y:${sliding.slideDy}px`);
    store.setSlideKillGhostPhase(sliding.id, 'dying');
    expect(useCombatAnimationStore.getState().slideKillGhosts.get(sliding.id)?.phase).toBe('dying');
    store.setSlideKillGhostPhase(sliding.id, 'falling');
    expect(useCombatAnimationStore.getState().slideKillGhosts.get(sliding.id)?.phase).toBe('falling');
  });
});
