import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDER } from '../../config/render';
import GridRenderer from '../components/GridRenderer';
import { useGameStore } from '../gameStore';
import { BUILDING_DEFINITIONS, MAP, MAGE, TAG_INFO, UNIT_DEFINITIONS } from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { getValidSpellTargets } from '../spellSystem';
import { BuildingType, Faction, SpellId, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { Unit } from '../types';

// Read the live Zustand snapshot during server rendering, as in gridTrapPlacement.test.ts.
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

const selectedId = 'grid-selected';
const mageId = 'grid-mage';
const origin = { x: 5, y: 5 };

function renderTiles() {
  return renderToStaticMarkup(createElement(GridRenderer))
    .split(/<div class="grid-tile[^"]*"[^>]*>/).slice(1);
}

function tileMarkup(x = origin.x, y = origin.y) {
  return renderTiles()[y * MAP.GRID_WIDTH + x];
}

function spellTargetKeys(tiles: string[]) {
  return tiles.flatMap((markup, index) => markup.includes('tile--spell-target')
    ? [`${index % MAP.GRID_WIDTH},${Math.floor(index / MAP.GRID_WIDTH)}`]
    : []);
}

function expectOrdinaryOverlays(markup: string, visible: boolean) {
  for (const marker of [
    `background-color:${RENDER.COLORS.REACHABLE_OVERLAY}`,
    `background-color:${RENDER.COLORS.ATTACKABLE_OVERLAY}`,
    'tile--attack-taunt-blocked',
  ]) {
    expect(markup.includes(marker), marker).toBe(visible);
  }
}

beforeEach(() => {
  const initial = generateInitialGameState();
  const base = Object.values(initial.units).find((unit) => unit.faction === Faction.PLAYER)!;
  const makeUnit = (
    id: string, type: UnitType, x: number, y: number,
    faction: Faction = Faction.PLAYER, tags: UnitTag[] = [],
  ): Unit => {
    const definition = UNIT_DEFINITIONS[type];
    return {
      ...base, id, type, position: { x, y }, faction, tags,
      pinnedUntilTurn: 0,
      stats: {
        ...base.stats,
        maxHp: definition.maxHp,
        currentHp: definition.maxHp,
        attack: definition.attack,
        defense: definition.defense,
        moveRange: definition.moveRange,
        attackRange: definition.attackRange,
      },
    };
  };
  const units = {
    [selectedId]: makeUnit(selectedId, UnitType.SWORDSMAN, origin.x, origin.y),
    [mageId]: makeUnit(mageId, UnitType.MAGE, origin.x - 1, origin.y),
    taunter: makeUnit('taunter', UnitType.SWORDSMAN, origin.x + 1, origin.y, Faction.ENEMY, [UnitTag.TAUNT]),
    blocked: makeUnit('blocked', UnitType.SWORDSMAN, origin.x, origin.y + 1, Faction.ENEMY),
  };
  const grid = initial.grid.map((row, y) => row.map((tile, x) => ({
    ...tile,
    isRevealed: true,
    unitId: Object.values(units).find((unit) => unit.position.x === x && unit.position.y === y)?.id ?? null,
    buildingId: null,
    terrainType: TileType.PLAINS,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    status: null,
  })));
  useGameStore.setState({
    ...initial, turn: 1, grid, units, buildings: {},
    selectedUnitId: selectedId, selectedBuildingId: null,
    pendingSpellCast: null, pendingTrapSetterId: null,
    unlockedSpells: [SpellId.TAUNT], arcaneCrystals: 10,
  });
});

describe('GridRenderer spell targeting overlays', () => {
  it('shows only spell targets during casting and restores ordinary overlays on cancel', () => {
    const selected = useGameStore.getState().units[selectedId];
    expectOrdinaryOverlays(renderTiles().join(''), true);
    useGameStore.getState().startSpellCast(mageId, SpellId.TAUNT);
    const state = useGameStore.getState();
    const targets = getValidSpellTargets(state, mageId, SpellId.TAUNT)
      .map(({ x, y }) => `${x},${y}`).sort();
    expect(targets.length).toBeGreaterThan(0);
    const activeTiles = renderTiles();
    expectOrdinaryOverlays(activeTiles.join(''), false);
    expect(spellTargetKeys(activeTiles).sort()).toEqual(targets);

    useGameStore.getState().cancelSpellCast();
    expect(useGameStore.getState().units[selectedId]).toBe(selected);
    const cancelledTiles = renderTiles();
    expectOrdinaryOverlays(cancelledTiles.join(''), true);
    expect(spellTargetKeys(cancelledTiles)).toEqual([]);
  });

  it('restores ordinary overlays after a successful spell cast', () => {
    useGameStore.getState().startSpellCast(mageId, SpellId.TAUNT);
    expectOrdinaryOverlays(renderTiles().join(''), false);
    useGameStore.getState().castSpell(origin);
    expect(useGameStore.getState().pendingSpellCast).toBeNull();
    expect(useGameStore.getState().units[selectedId].tags).toContain(UnitTag.TAUNT);
    expect(useGameStore.getState().units[mageId].spellsCastThisTurn).toBe(1);
    const tiles = renderTiles();
    expectOrdinaryOverlays(tiles.join(''), true);
    expect(spellTargetKeys(tiles)).toEqual([]);
  });

  it('also suppresses and restores a selected building attack overlay', () => {
    const base = Object.values(generateInitialGameState().buildings)[0];
    const definition = BUILDING_DEFINITIONS[BuildingType.WATCHTOWER];
    const building = {
      ...base, id: 'grid-tower', type: BuildingType.WATCHTOWER,
      position: origin, faction: Faction.PLAYER,
      combatStats: { ...definition.combatStats! }, hasAttackedThisTurn: false,
    };
    useGameStore.setState({
      buildings: { [building.id]: building }, selectedUnitId: null,
      selectedBuildingId: building.id,
    });
    const attackOverlay = `background-color:${RENDER.COLORS.ATTACKABLE_OVERLAY}`;
    expect(renderTiles().join('')).toContain(attackOverlay);
    useGameStore.getState().startSpellCast(mageId, SpellId.TAUNT);
    expect(renderTiles().join('')).not.toContain(attackOverlay);
    useGameStore.getState().cancelSpellCast();
    expect(renderTiles().join('')).toContain(attackOverlay);
  });
});

describe('GridRenderer unit tag presentation', () => {
  it.each([Faction.PLAYER, Faction.ENEMY])(
    'renders Taunt and Infested once each in the tag list without forcing full-health HP bars (%s)',
    (faction) => {
      useGameStore.setState((draft) => {
        draft.units[selectedId].faction = faction;
        draft.units[selectedId].tags = [UnitTag.TAUNT, UnitTag.INFESTED];
      });
      const markup = tileMarkup();
      for (const tag of [UnitTag.TAUNT, UnitTag.INFESTED]) {
        const icon = TAG_INFO[tag]!.icon!;
        expect(markup.split(icon)).toHaveLength(2);
        expect(markup).toContain(`<span class="unit-tag-icon">${icon}</span>`);
      }
      expect(markup).not.toContain('unit-taunt-badge');
      expect(markup).not.toContain('unit-infested-badge');
      expect(markup).not.toContain('hp-bar-wrapper');
      expect(markup).not.toContain('class="unit-hp-text"');
    },
  );

  it.each(['damage', 'debuff', 'stone-skin'])('retains HP visibility for %s', (reason) => {
    useGameStore.setState((draft) => {
      const unit = draft.units[selectedId];
      unit.tags = [UnitTag.TAUNT, UnitTag.INFESTED];
      if (reason === 'damage') unit.stats.currentHp -= 1;
      if (reason === 'debuff') unit.pinnedUntilTurn = draft.turn;
      if (reason === 'stone-skin') {
        unit.tags.push(UnitTag.STONE_SKIN);
        unit.stoneSkinHp = MAGE.STONE_SKIN_HP;
      }
    });
    const markup = tileMarkup();
    expect(markup).toContain('class="hp-bar-wrapper"');
    expect(markup.includes('class="unit-hp-text"')).toBe(reason === 'damage');
    expect(markup.includes('class="stone-skin-hp-bar-wrapper"')).toBe(reason === 'stone-skin');
  });

  it('preserves the conditional player Corruption-Bound rose and debuff HP visibility', () => {
    useGameStore.setState((draft) => {
      draft.units[selectedId].tags = [UnitTag.CORRUPTION_BOUND];
    });
    expect(tileMarkup()).toContain('<span class="unit-tag-icon">🥀</span>');
    expect(tileMarkup()).toContain('class="hp-bar-wrapper"');
    useGameStore.setState((draft) => {
      draft.grid[origin.y][origin.x].status = TileStatus.CORRUPTED;
    });
    expect(tileMarkup()).not.toContain('🥀');
    expect(tileMarkup()).not.toContain('class="hp-bar-wrapper"');
    useGameStore.setState((draft) => {
      draft.grid[origin.y][origin.x].status = null;
      draft.units[selectedId].faction = Faction.ENEMY;
    });
    expect(tileMarkup()).not.toContain('🥀');
  });
});
