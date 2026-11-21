import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  CORRUPTED_SUPPRESSED_TAGS,
  CRYSTALLINE_SUPPRESSED_TAGS,
  TILE_STATUS_WHITELIST,
} from '../gameConfig';
import { applyTileStatus, getSuppressedTagsForUnit, isStatusAllowedOnTerrain, isUnitTagSuppressed } from '../tileStatusSystem';
import { Faction, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Tile, Unit } from '../types';

function makeTile(status: TileStatus | null = null): Tile {
  return {
    position: { x: 0, y: 0 },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status,
  };
}

function makeUnit(faction: Faction, tags: UnitTag[] = []): Unit {
  return {
    id: faction,
    type: UnitType.LAVA_GRUNT,
    faction,
    position: { x: 0, y: 0 },
    stats: {
      maxHp: 1,
      currentHp: 1,
      attack: 1,
      defense: 0,
      moveRange: 1,
      discoverRadius: 1,
      triggerRange: 0,
      movementActions: 1,
      attackRange: 1,
    },
    tags,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  } as Unit;
}

function makeState(tile: Tile): GameState {
  return {
    grid: [[tile]],
    units: {},
  } as unknown as GameState;
}

describe('Crystalline tile status', () => {
  it('allows Crystalline only on Plains, Forest and Mountain', () => {
    expect(TILE_STATUS_WHITELIST[TileType.PLAINS]).toContain(TileStatus.CRYSTALLINE);
    expect(TILE_STATUS_WHITELIST[TileType.FOREST]).toContain(TileStatus.CRYSTALLINE);
    expect(TILE_STATUS_WHITELIST[TileType.MOUNTAIN]).toContain(TileStatus.CRYSTALLINE);
    expect(isStatusAllowedOnTerrain(TileType.WATER, TileStatus.CRYSTALLINE)).toBe(false);
    expect(isStatusAllowedOnTerrain(TileType.CANYON, TileStatus.CRYSTALLINE)).toBe(false);
  });

  it('keeps statuses mutually exclusive when Crystalline overwrites and is overwritten', () => {
    const state = makeState(makeTile());
    const corrupted = produce(state, (draft) => {
      expect(applyTileStatus(draft, { x: 0, y: 0 }, TileStatus.CORRUPTED)).toBe(true);
    });
    const crystalline = produce(corrupted, (draft) => {
      expect(applyTileStatus(draft, { x: 0, y: 0 }, TileStatus.CRYSTALLINE)).toBe(true);
    });
    expect(crystalline.grid[0][0].status).toBe(TileStatus.CRYSTALLINE);

    for (const status of [TileStatus.CORRUPTED, TileStatus.BURNING, TileStatus.FROZEN]) {
      const overwritten = produce(crystalline, (draft) => {
        expect(applyTileStatus(draft, { x: 0, y: 0 }, status)).toBe(true);
      });
      expect(overwritten.grid[0][0].status).toBe(status);
    }
  });

  it('selects only the suppression set matching the unit faction and tile status', () => {
    const tile = makeTile(TileStatus.CRYSTALLINE);
    const state = makeState(tile);
    const enemy = makeUnit(Faction.ENEMY, [UnitTag.CLEAVE]);
    const player = makeUnit(Faction.PLAYER, [UnitTag.CLEAVE]);

    expect(getSuppressedTagsForUnit(state, enemy)).toBe(CRYSTALLINE_SUPPRESSED_TAGS);
    expect(isUnitTagSuppressed(state, enemy, UnitTag.CLEAVE)).toBe(true);
    expect(isUnitTagSuppressed(state, enemy, UnitTag.ASSASSIN)).toBe(false);
    expect(getSuppressedTagsForUnit(state, player)).toBeNull();

    tile.status = TileStatus.CORRUPTED;
    expect(getSuppressedTagsForUnit(state, enemy)).toBeNull();
    expect(getSuppressedTagsForUnit(state, player)).toBe(CORRUPTED_SUPPRESSED_TAGS);
    expect(isUnitTagSuppressed(state, player, UnitTag.CLEAVE)).toBe(true);
    expect(isUnitTagSuppressed(state, player, UnitTag.ALERT)).toBe(false);

    tile.status = null;
    expect(getSuppressedTagsForUnit(state, enemy)).toBeNull();
    expect(getSuppressedTagsForUnit(state, player)).toBeNull();
  });
});
