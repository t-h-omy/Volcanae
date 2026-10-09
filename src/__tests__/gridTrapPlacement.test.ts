import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDER } from '../../config/render';
import GridRenderer from '../components/GridRenderer';
import { useGameStore } from '../gameStore';
import { MAP, UNIT_DEFINITIONS } from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { Faction, TileStatus, TileType, UnitType } from '../types';
import type { Tile, Unit } from '../types';
import { getTrapPlacementTargets } from '../unitActions';

// Server rendering normally reads Zustand's initial snapshot instead of the test's live state.
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

const scoutId = 'trap-preview-scout';
const origin = { x: 5, y: 5 };

function renderTiles() {
  return renderToStaticMarkup(createElement(GridRenderer)).split(/<div class="grid-tile[^"]*"[^>]*>/).slice(1);
}

function highlightedTrapKeys(tiles = renderTiles()) {
  return tiles.flatMap((markup, index) =>
    markup.includes(`background-color:${RENDER.COLORS.TRAP_PLACEMENT_OVERLAY}`)
      ? [`${index % MAP.GRID_WIDTH},${Math.floor(index / MAP.GRID_WIDTH)}`]
      : [],
  );
}

describe('GridRenderer trap placement highlighting', () => {
  beforeEach(() => {
    const initial = generateInitialGameState();
    const base = Object.values(initial.units).find((unit) => unit.faction === Faction.PLAYER)!;
    const definition = UNIT_DEFINITIONS[UnitType.SCOUT];
    const scout: Unit = {
      ...base,
      id: scoutId,
      type: UnitType.SCOUT,
      position: origin,
      tags: [],
      stats: {
        ...base.stats,
        maxHp: definition.maxHp,
        currentHp: definition.maxHp,
        moveRange: definition.moveRange,
        attackRange: definition.attackRange,
      },
    };
    const grid: Tile[][] = initial.grid.map((row, y) => row.map((tile, x) => ({
      ...tile,
      isRevealed: true,
      unitId: x === origin.x && y === origin.y ? scoutId : null,
      buildingId: null,
      terrainType: TileType.PLAINS,
      isLava: false,
      isLavaPreview: false,
      isRuin: false,
      isStrongholdRuin: false,
      status: null,
    })));
    useGameStore.setState({
      ...initial,
      grid,
      units: { [scoutId]: scout },
      buildings: {},
      selectedUnitId: scoutId,
      selectedBuildingId: null,
      pendingTrapSetterId: scoutId,
      globalSpecialistStorage: ['spec_08'],
    });
  });

  it('renders exactly the legal targets with a distinct overlay, including the Scout tile', () => {
    useGameStore.setState((draft) => {
      draft.grid[4][4].unitId = 'occupied';
      draft.grid[4][5].buildingId = 'building';
      draft.grid[4][6].terrainType = TileType.FOREST;
      draft.grid[5][4].isRuin = true;
      draft.grid[5][6].isLava = true;
      draft.grid[6][4].terrainType = TileType.WATER;
      draft.grid[6][5].terrainType = TileType.CANYON;
      draft.grid[6][6].terrainType = TileType.MOUNTAIN;
    });
    const state = useGameStore.getState();
    const expected = getTrapPlacementTargets(state.units[scoutId], state)
      .map(({ x, y }) => `${x},${y}`);
    expect(highlightedTrapKeys()).toEqual(expected);
    expect(expected).toContain(`${origin.x},${origin.y}`);
    expect(RENDER.COLORS.TRAP_PLACEMENT_OVERLAY).not.toBe(RENDER.COLORS.REACHABLE_OVERLAY);
    expect(RENDER.COLORS.TRAP_PLACEMENT_OVERLAY).not.toBe(RENDER.COLORS.ATTACKABLE_OVERLAY);
  });

  it('suppresses movement and frozen-slide previews until trap mode is cancelled', () => {
    useGameStore.setState((draft) => {
      draft.grid[origin.y][origin.x + 1].status = TileStatus.FROZEN;
    });
    const trapMarkup = renderTiles().join('');
    expect(trapMarkup).not.toContain(`background-color:${RENDER.COLORS.REACHABLE_OVERLAY}`);
    expect(trapMarkup).not.toContain('tile--slide-preview');

    useGameStore.setState({ pendingTrapSetterId: null });
    const moveMarkup = renderTiles().join('');
    expect(highlightedTrapKeys()).toEqual([]);
    expect(moveMarkup).toContain(`background-color:${RENDER.COLORS.REACHABLE_OVERLAY}`);
    expect(moveMarkup).toContain('tile--slide-preview');
  });

  it('reflects occupancy and terrain changes while the same setter remains pending', () => {
    const target = `${origin.x + 1},${origin.y}`;
    expect(highlightedTrapKeys()).toContain(target);
    const setter = useGameStore.getState().units[scoutId];
    useGameStore.setState((draft) => {
      draft.grid[origin.y][origin.x + 1].buildingId = 'new-building';
    });
    expect(useGameStore.getState().units[scoutId]).toBe(setter);
    expect(highlightedTrapKeys()).not.toContain(target);
    useGameStore.setState((draft) => {
      draft.grid[origin.y][origin.x + 1].buildingId = null;
      draft.grid[origin.y][origin.x + 1].terrainType = TileType.WATER;
    });
    expect(highlightedTrapKeys()).not.toContain(target);
    useGameStore.setState((draft) => {
      draft.grid[origin.y][origin.x + 1].terrainType = TileType.PLAINS;
    });
    expect(highlightedTrapKeys()).toContain(target);
  });

  it('removes targets when the pending Scout has spent a non-movement action', () => {
    expect(highlightedTrapKeys().length).toBeGreaterThan(0);
    useGameStore.setState((draft) => {
      draft.units[scoutId].hasAttackedThisTurn = true;
    });
    expect(highlightedTrapKeys()).toEqual([]);
  });

  it('removes targets when Trapsmith is no longer active', () => {
    expect(highlightedTrapKeys().length).toBeGreaterThan(0);
    useGameStore.setState((draft) => {
      draft.specialists.spec_08.dormant = true;
    });
    expect(highlightedTrapKeys()).toEqual([]);
  });
});
