import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRYSTAL_KHYRON, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { tryTriggerHint } from '../hintSystem';
import HUD from '../components/HUD';
import HUD_TSX from '../components/HUD.tsx?raw';
import { Faction, GamePhase, TileType, UnitTag, UnitType } from '../types';
import type { Unit } from '../types';

const effects = vi.hoisted(() => ({
  callbacks: [] as Array<{ run: () => unknown; deps: unknown[] }>,
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (run: () => unknown, deps: unknown[] = []) => {
    effects.callbacks.push({ run, deps });
  },
}));
vi.mock('../useMusicPlayer', () => ({ stopGameMusic: vi.fn() }));
vi.mock('../hintSystem', () => ({
  tryTriggerHint: vi.fn(() => false),
  flushDeferredHints: vi.fn(),
}));
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

function selectedUnit(overrides: Partial<Unit> = {}): Unit {
  const definition = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON];
  return {
    id: 'selected', type: UnitType.CRYSTAL_KHYRON, faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
    stats: {
      maxHp: definition.maxHp, currentHp: definition.maxHp,
      attack: definition.attack, defense: definition.defense,
      moveRange: definition.moveRange, attackRange: definition.attackRange,
      discoverRadius: definition.discoverRadius, triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
    },
    tags: [], hasMovedThisTurn: false, hasAttackedThisTurn: false,
    hasCapturedThisTurn: false, hasTradedThisTurn: false,
    hasConstructedThisTurn: false, hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    xp: 0, level: 1, pinnedUntilTurn: 0, distractionDefPenalty: 0, lastMovedTurn: 0,
    ...overrides,
  };
}

function renderEffects(unit: Unit, selected = true) {
  effects.callbacks = [];
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    turn: 5, phase: GamePhase.PLAYER_TURN,
    buildings: {}, units: { [unit.id]: unit },
    selectedUnitId: selected ? unit.id : null,
    selectedBuildingId: null, selectedTilePos: null,
    lavaFrontRow: MAP.GRID_HEIGHT,
    grid: Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
      Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
        position: { x, y }, isRevealed: true,
        unitId: x === unit.position.x && y === unit.position.y ? unit.id : null,
        buildingId: null, isLava: false, isLavaPreview: false,
        isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS,
        status: null, hasCaveMonster: false,
      })),
    ),
  });
  renderToStaticMarkup(createElement(HUD));
  return effects.callbacks.filter(({ run }) =>
    run.toString().includes('H25_KHYRON_LEVEL_UP')
    || run.toString().includes('H27_STONE_SKIN_ROOTED'));
}

describe('QKP6 selected-unit hint callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnimationStore.getState().clear();
  });

  it.each([
    ['banked assimilation', { earnedAssimilationTags: [], earnedAssimilationLevels: 1 }, true],
    ['legacy banked assimilation', { earnedAssimilationTags: [] }, true],
    ['no banked assimilation', {}, false],
    ['zero banked levels', { earnedAssimilationTags: [], earnedAssimilationLevels: 0 }, false],
    ['at maximum level', { earnedAssimilationTags: [], earnedAssimilationLevels: 1, level: CRYSTAL_KHYRON.MAX_LEVEL }, false],
    ['enemy Khyron', { earnedAssimilationTags: [], earnedAssimilationLevels: 1, faction: Faction.ENEMY }, false],
    ['other player unit with XP', { type: UnitType.SWORDSMAN, xp: 999 }, false],
  ] satisfies Array<[string, Partial<Unit>, boolean]>)('H25: %s', (_name, overrides, expected) => {
    const callbacks = renderEffects(selectedUnit(overrides));
    expect(callbacks).toHaveLength(2);
    for (const { run } of callbacks) run();
    if (expected) {
      expect(tryTriggerHint).toHaveBeenCalledExactlyOnceWith('H25_KHYRON_LEVEL_UP');
    } else {
      expect(tryTriggerHint).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['positive shield with tag', { tags: [UnitTag.STONE_SKIN], stoneSkinHp: 1 }, true],
    ['other player unit with shield', { type: UnitType.SWORDSMAN, tags: [UnitTag.STONE_SKIN], stoneSkinHp: 1 }, true],
    ['enemy shield', { faction: Faction.ENEMY, tags: [UnitTag.STONE_SKIN], stoneSkinHp: 1 }, false],
    ['shield without tag', { stoneSkinHp: 1 }, false],
    ['empty shield', { tags: [UnitTag.STONE_SKIN], stoneSkinHp: 0 }, false],
    ['missing shield', { tags: [UnitTag.STONE_SKIN] }, false],
    ['negative shield', { tags: [UnitTag.STONE_SKIN], stoneSkinHp: -1 }, false],
  ] satisfies Array<[string, Partial<Unit>, boolean]>)('H27: %s', (_name, overrides, expected) => {
    const callbacks = renderEffects(selectedUnit(overrides));
    expect(callbacks).toHaveLength(2);
    for (const { run } of callbacks) run();
    if (expected) {
      expect(tryTriggerHint).toHaveBeenCalledExactlyOnceWith('H27_STONE_SKIN_ROOTED');
    } else {
      expect(tryTriggerHint).not.toHaveBeenCalled();
    }
  });

  it('does not register either unit hint when there is no selected unit', () => {
    expect(renderEffects(selectedUnit({
      earnedAssimilationTags: [], earnedAssimilationLevels: 1,
      tags: [UnitTag.STONE_SKIN], stoneSkinHp: 1,
    }), false)).toEqual([]);
    expect(tryTriggerHint).not.toHaveBeenCalled();
  });

  it('keeps primitive dependencies stable across identical selected-unit snapshots', () => {
    const unit = selectedUnit({
      earnedAssimilationTags: [], earnedAssimilationLevels: 1,
      tags: [UnitTag.STONE_SKIN], stoneSkinHp: 1,
    });
    const first = renderEffects(unit);
    const second = renderEffects({ ...unit, tags: [...unit.tags] });
    expect(second.map(({ deps }) => deps)).toEqual(first.map(({ deps }) => deps));
    for (const { deps } of second) {
      expect(deps.every((value) => value === null || typeof value !== 'object')).toBe(true);
    }
  });
});

const selectedPanel = HUD_TSX.slice(
  HUD_TSX.indexOf('function SelectedUnitPanel('),
  HUD_TSX.indexOf('function SelectedBuildingPanel('),
);

describe('QKP6 selected-unit hint effect contracts', () => {
  it('requires a player Crystal Khyron with an actually banked level for H25', () => {
    expect(selectedPanel).toContain('const isPlayer = unit.faction === Faction.PLAYER;');
    expect(selectedPanel).toContain('const targetLevel = getUnitTargetLevel(unit);');
    expect(selectedPanel).toContain('const canLevelUp = isPlayer && targetLevel > unit.level;');
    expect(selectedPanel).toContain('const isKhyron = unit.type === UnitType.CRYSTAL_KHYRON;');
    expect(selectedPanel).toMatch(/useEffect\(\(\) => \{\s*if \(isPlayer && isKhyron && canLevelUp\) \{\s*tryTriggerHint\('H25_KHYRON_LEVEL_UP'\);\s*\}\s*\}, \[unit.id, isPlayer, isKhyron, canLevelUp\]\);/);
  });

  it('requires both the player Stone Skin tag and a positive remaining shield for H27', () => {
    expect(selectedPanel).toContain('const hasStoneSkin = unit.tags.includes(UnitTag.STONE_SKIN);');
    expect(selectedPanel).toContain('const stoneSkinHp = unit.stoneSkinHp ?? 0;');
    expect(selectedPanel).toMatch(/useEffect\(\(\) => \{\s*if \(isPlayer && hasStoneSkin && stoneSkinHp > 0\) \{\s*tryTriggerHint\('H27_STONE_SKIN_ROOTED'\);\s*\}\s*\}, \[unit.id, isPlayer, hasStoneSkin, stoneSkinHp\]\);/);
  });

  it('registers both effects before panel early returns and avoids object dependencies', () => {
    const firstPanelReturn = selectedPanel.indexOf('\n  return ');
    for (const hint of ['H25_KHYRON_LEVEL_UP', 'H27_STONE_SKIN_ROOTED']) {
      expect(selectedPanel.indexOf(hint)).toBeGreaterThan(0);
      expect(selectedPanel.indexOf(hint)).toBeLessThan(firstPanelReturn);
    }
  });
});
