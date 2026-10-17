import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ABILITIES, CRYSTAL_CHAMBER_CONFIG, CRYSTAL_KHYRON, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useAnimationStore } from '../animationStore';
import { useGameStore } from '../gameStore';
import GridRenderer from '../components/GridRenderer';
import HUD from '../components/HUD';
import GRID_SOURCE from '../components/GridRenderer.tsx?raw';
import { collectResources } from '../resourceSystem';
import { advanceLavaWithEvents } from '../lavaSystem';
import { getKhyronResonanceTurnsRemaining, isKhyronResonanceActive } from '../khyronSystem';
import { canUnitCapture } from '../unitActions';
import { canCapture } from '../captureSystem';
import { t } from '../i18n/i18n';
import { BuildingType, DestroyBehavior, Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Unit } from '../types';
import type { GameEvent } from '../gameEvents';

vi.mock('../useMusicPlayer', () => ({ stopGameMusic: vi.fn() }));

// Render the live test snapshot rather than Zustand's server-side initial snapshot.
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

const safeRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1;
const doomedRow = MAP.GRID_HEIGHT - 1;

function unit(id: string, type: UnitType = UnitType.CRYSTAL_KHYRON, overrides: Partial<Unit> = {}): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id, type, faction: Faction.PLAYER, position: { x: 2, y: safeRow },
    stats: {
      maxHp: definition.maxHp, currentHp: definition.maxHp,
      attack: definition.attack, defense: definition.defense,
      moveRange: definition.moveRange, attackRange: definition.attackRange,
      discoverRadius: definition.discoverRadius, triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
    },
    tags: [...definition.tags], resonanceActive: false,
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasCapturedThisTurn: false,
    hasTradedThisTurn: false, hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0, lastMovedTurn: 0,
    ...overrides,
  };
}

function building(id: string, type: BuildingType, position: Position, overrides: Partial<Building> = {}): Building {
  return {
    id, type, position, faction: Faction.PLAYER, hp: 100, maxHp: 100,
    specialistSlot: null, isDisabledForTurns: 0, wasAttackedLastEnemyTurn: false,
    captureProgress: 0, isBeingCapturedBy: null, discoverRadius: 1,
    turnCapturedByPlayer: null, wasEnemyOwnedBeforeCapture: false, combatStats: null,
    hasAttackedThisTurn: false, tags: [], consumesUnitOnCapture: false,
    populationCount: 0, populationCap: 0, populationGrowthCounter: 0, strongholdNobles: 0,
    emberSpawnCounter: 0, recruitmentQueue: null, destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0, spawnCooldownRemaining: 0, lastRecruitmentTurn: 0,
    ...overrides,
  };
}

function state(units: Unit[] = [unit('khyron')], buildings: Building[] = []): GameState {
  const stronghold = building('stronghold', BuildingType.STRONGHOLD, { x: 0, y: safeRow });
  const allBuildings = [stronghold, ...buildings];
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
      position: { x, y }, isRevealed: true, unitId: null as string | null,
      buildingId: null as string | null, isLava: false, isLavaPreview: false,
      isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
      status: null, hasCaveMonster: false,
    })),
  );
  for (const u of units) grid[u.position.y][u.position.x].unitId = u.id;
  for (const b of allBuildings) grid[b.position.y][b.position.x].buildingId = b.id;
  return {
    ...useGameStore.getInitialState(), grid,
    turn: 5, phase: GamePhase.PLAYER_TURN,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    buildings: Object.fromEntries(allBuildings.map((b) => [b.id, b])),
    resources: { iron: 999, wood: 999 }, globalSpecialistStorage: [],
    selectedUnitId: units[0]?.id ?? null, selectedBuildingId: null, selectedTilePos: null,
    lavaFrontRow: MAP.GRID_HEIGHT, turnsUntilLavaAdvance: 99,
    spawnFreezeUntilTurn: 99, activeWaveTheme: { entries: [], isReadPlayer: false },
  };
}

const chamber = (id = 'chamber', turns: number = CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION) =>
  building(id, BuildingType.CRYSTAL_CHAMBER, { x: 1, y: safeRow }, { resonanceTurnsRemaining: turns });

function resonating(id: string, overrides: Partial<Unit> = {}) {
  return unit(id, UnitType.CRYSTAL_KHYRON, {
    tags: [UnitTag.MECH, UnitTag.RESONANCE], resonanceActive: true, ...overrides,
  });
}

describe('Khyron ancillary resonance and capture presentation', () => {
  beforeEach(() => {
    useAnimationStore.getState().clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useAnimationStore.getState().clear();
  });

  it.each([UnitType.CRYSTAL_KHYRON, UnitType.GHOUL])('renders capture readiness for %s with Build & Capture', (type) => {
    const capturer = unit('capturer', type, { tags: [UnitTag.BUILDANDCAPTURE] });
    const target = building('target', BuildingType.WATCHTOWER, capturer.position, { faction: Faction.ENEMY });
    const live = state([capturer], [target]);
    expect(canUnitCapture(capturer) && canCapture(live, capturer.id, target.id)).toBe(true);
    useGameStore.setState(live);
    expect(renderToStaticMarkup(createElement(GridRenderer))).toContain('class="capture-indicator"');
  });

  it.each([
    ['missing tag', { tags: [] }, BuildingType.WATCHTOWER, Faction.ENEMY],
    ['spent action', { hasAttackedThisTurn: true }, BuildingType.WATCHTOWER, Faction.ENEMY],
    ['already moved', { hasMovedThisTurn: true }, BuildingType.WATCHTOWER, Faction.ENEMY],
    ['already captured', { hasCapturedThisTurn: true }, BuildingType.WATCHTOWER, Faction.ENEMY],
    ['pinned', { pinnedUntilTurn: 1 }, BuildingType.WATCHTOWER, Faction.ENEMY],
    ['enemy unit', { faction: Faction.ENEMY }, BuildingType.WATCHTOWER, Faction.PLAYER],
    ['owned building', {}, BuildingType.WATCHTOWER, Faction.PLAYER],
    ['uncapturable market', {}, BuildingType.MARKET, null],
  ] satisfies Array<[string, Partial<Unit>, BuildingType, Faction | null]>)('preserves capture gates: %s', (_name, overrides, type, faction) => {
    const capturer = unit('capturer', UnitType.CRYSTAL_KHYRON, { tags: [UnitTag.BUILDANDCAPTURE], ...overrides });
    const target = building('target', type, capturer.position, { faction });
    useGameStore.setState(state([capturer], [target]));
    expect(renderToStaticMarkup(createElement(GridRenderer))).not.toContain('class="capture-indicator"');
  });

  it('uses the maximum player Chamber timer, excluding Caves and other factions', () => {
    const live = state([], [
      chamber('short', 1), chamber('long', 4),
      building('cave', BuildingType.CRYSTAL_CAVE, { x: 3, y: safeRow }, { resonanceTurnsRemaining: 9 }),
      building('enemy', BuildingType.CRYSTAL_CHAMBER, { x: 4, y: safeRow }, { faction: Faction.ENEMY, resonanceTurnsRemaining: 10 }),
      building('neutral', BuildingType.CRYSTAL_CHAMBER, { x: 5, y: safeRow }, { faction: null, resonanceTurnsRemaining: 11 }),
    ]);
    expect(getKhyronResonanceTurnsRemaining(live)).toBe(4);
    expect(getKhyronResonanceTurnsRemaining(state([], [chamber('expired', 0)]))).toBe(0);
    expect(getKhyronResonanceTurnsRemaining(state([]))).toBe(0);
  });

  it.each([
    ['active player Khyron', resonating('selected'), true],
    ['inactive player Khyron', resonating('selected', { resonanceActive: false }), false],
    ['missing Resonance tag', resonating('selected', { tags: [UnitTag.MECH] }), false],
    ['enemy Khyron', resonating('selected', { faction: Faction.ENEMY }), false],
    ['other unit', resonating('selected', { type: UnitType.GHOUL }), false],
  ] as const)('scopes the selected-panel countdown to %s', (_name, selected, shown) => {
    useGameStore.setState(state([selected], [chamber('short', 1), chamber('long', 4)]));
    const markup = renderToStaticMarkup(createElement(HUD));
    const row = `<div class="hud-production-row">✨ ${t('hud.unitPanel.resonating', { turns: 4 })}</div>`;
    expect(markup.includes(row)).toBe(shown);
    expect(GRID_SOURCE).not.toContain('hud.unitPanel.resonating');
  });

  it('emits only positive actual heals and keeps the optional event argument compatible', () => {
    const injured = resonating('injured');
    injured.stats.currentHp -= 3;
    const full = resonating('full', { position: { x: 3, y: safeRow } });
    const inactive = resonating('inactive', { resonanceActive: false, position: { x: 4, y: safeRow } });
    inactive.stats.currentHp -= 10;
    const enemy = resonating('enemy', { faction: Faction.ENEMY, position: { x: 5, y: safeRow } });
    enemy.stats.currentHp -= 10;
    const initial = state([injured, full, inactive, enemy], [chamber()]);
    const events: GameEvent[] = [];
    const healed = produce(initial, (draft) => collectResources(draft, events));
    expect(events).toEqual([{ type: 'UNIT_HEAL', unitId: injured.id, position: injured.position, amount: 3 }]);
    expect(healed.units.injured.stats.currentHp).toBe(injured.stats.maxHp);
    expect(healed.units.inactive.stats.currentHp).toBe(inactive.stats.currentHp);
    expect(healed.units.enemy.stats.currentHp).toBe(enemy.stats.currentHp);
    const withoutEvents = produce(initial, (draft) => collectResources(draft));
    expect(withoutEvents.units.injured.stats.currentHp).toBe(healed.units.injured.stats.currentHp);
  });

  it.each(['chamber', 'martyr'] as const)('banked and level-three Khyrons still resonate and heal after real %s lava triggers', (trigger) => {
    const banked = unit('banked', UnitType.CRYSTAL_KHYRON, {
      earnedAssimilationLevels: CRYSTAL_KHYRON.MAX_LEVEL - 1,
      earnedAssimilationTags: [UnitTag.BUILDANDCAPTURE],
    });
    const maxLevel = unit('max-level', UnitType.CRYSTAL_KHYRON, {
      level: CRYSTAL_KHYRON.MAX_LEVEL, position: { x: 3, y: safeRow },
    });
    for (const u of [banked, maxLevel]) u.stats.currentHp -= ABILITIES.RESONANCE_HEAL_AMOUNT;
    const buildings = [chamber('survivor', 0)];
    const units = [banked, maxLevel];
    if (trigger === 'chamber') {
      buildings.push(building('doomed', BuildingType.CRYSTAL_CHAMBER, { x: 0, y: doomedRow }));
    } else {
      units.push(unit('sacrifice', UnitType.SWORDSMAN, { position: { x: 0, y: doomedRow } }));
    }
    const initial = state(units, buildings);
    initial.globalSpecialistStorage = trigger === 'martyr' ? ['spec_16'] : [];
    const advanced = advanceLavaWithEvents(initial);
    const resonance = advanced.events.find((event) => event.type === 'RESONANCE_TRIGGERED');
    expect(resonance).toMatchObject({ survivingKhyronIds: ['banked', 'max-level'] });
    for (const id of ['banked', 'max-level']) {
      expect(isKhyronResonanceActive(advanced.newState.units[id])).toBe(true);
    }
    const heals: GameEvent[] = [];
    const collected = produce(advanced.newState, (draft) => collectResources(draft, heals));
    expect(heals).toEqual([banked, maxLevel].map((u) => ({
      type: 'UNIT_HEAL', unitId: u.id, position: u.position, amount: ABILITIES.RESONANCE_HEAL_AMOUNT,
    })));
    expect(collected.units.banked.earnedAssimilationLevels).toBe(banked.earnedAssimilationLevels);
    expect(collected.units.banked.earnedAssimilationTags).toEqual([UnitTag.BUILDANDCAPTURE]);
    expect(collected.units['max-level'].level).toBe(CRYSTAL_KHYRON.MAX_LEVEL);
    for (const id of ['banked', 'max-level']) {
      expect(collected.units[id].stats.currentHp).toBe(collected.units[id].stats.maxHp);
    }
  });

  it('queues Phase 6 healing after lava resonance presentation and before tag damage', () => {
    const khyron = unit('khyron');
    khyron.stats.currentHp -= ABILITIES.RESONANCE_HEAL_AMOUNT;
    const branded = unit('branded', UnitType.GHOUL, {
      tags: [UnitTag.BRANDMARKED], position: { x: 4, y: safeRow },
    });
    const initial = state([khyron, branded], [
      chamber('survivor', 0),
      building('doomed', BuildingType.CRYSTAL_CHAMBER, { x: 0, y: doomedRow }),
    ]);
    initial.turnsUntilLavaAdvance = 1;
    useGameStore.setState(initial);
    useGameStore.getState().endPlayerTurn();
    const { eventQueue, resolvedState } = useAnimationStore.getState();
    const resonanceIndex = eventQueue.findIndex((event) => event.type === 'RESONANCE_TRIGGERED');
    const healIndex = eventQueue.findIndex((event) => event.type === 'UNIT_HEAL' && event.unitId === khyron.id);
    const damageIndex = eventQueue.findIndex((event) => event.type === 'TILE_DAMAGE' && event.damageSource === 'TAG');
    expect(resonanceIndex).toBeGreaterThanOrEqual(0);
    expect(healIndex).toBeGreaterThan(resonanceIndex);
    expect(damageIndex).toBeGreaterThan(healIndex);
    expect(eventQueue[healIndex]).toMatchObject({ amount: ABILITIES.RESONANCE_HEAL_AMOUNT });
    expect(resolvedState?.units.khyron.stats.currentHp).toBe(khyron.stats.maxHp);
  });
});
