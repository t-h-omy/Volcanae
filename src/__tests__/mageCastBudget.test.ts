import { beforeEach, describe, expect, it, vi } from 'vitest';
import { produce } from 'immer';
import { createInitialSpecialists } from '../specialistSystem';
import { canUnitCast } from '../unitActions';
import { castSpell } from '../spellSystem';
import { loadGameState, saveGameState } from '../saveSystem';
import { Faction, GamePhase, SpellId, TileType, UnitType } from '../types';
import type { GameState, Tile, Unit } from '../types';
import { UNIT_DEFINITIONS } from '../gameConfig';

function makeTile(x: number, y: number, terrainType: TileType = TileType.PLAINS): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType,
    status: null,
  };
}

function makeMage(): Unit {
  const def = UNIT_DEFINITIONS[UnitType.MAGE];
  return {
    id: 'mage_1',
    type: UnitType.MAGE,
    faction: Faction.PLAYER,
    position: { x: 2, y: 2 },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    spellsCastThisTurn: 0,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    controllerMageId: null,
  };
}

function makeState(activeSpecialists: string[] = []): GameState {
  const grid = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => makeTile(x, y)),
  );
  grid[1][2].terrainType = TileType.WATER;
  grid[2][3].terrainType = TileType.WATER;

  const mage = makeMage();
  grid[mage.position.y][mage.position.x].unitId = mage.id;

  return {
    phase: GamePhase.PLAYER_TURN,
    turn: 3,
    grid,
    units: { [mage.id]: mage },
    buildings: {},
    portals: {},
    activeCaveEncounters: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 10,
    ember: 0,
    techFlags: [],
    unlockedSpells: [SpellId.FROSTCRAFT],
    unlockedUnits: [UnitType.MAGE],
    techNodes: {},
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: activeSpecialists,
    gameStats: {
      unitsKilled: 0,
      unitsLost: 0,
      damageDealt: 0,
      damageReceived: 0,
      unitsRecruited: 0,
      buildingsConstructed: 0,
      buildingsConverted: 0,
      techsUnlocked: 0,
      enemyBuildingsDestroyed: 0,
      enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0,
      buildingsCapturedByEnemy: 0,
    },
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTile: null,
  } as unknown as GameState;
}

function recordSuccessfulCast(state: GameState, target: { x: number; y: number }): GameState {
  return produce(state, (draft) => {
    const mage = draft.units.mage_1;
    expect(castSpell(draft, mage.id, SpellId.FROSTCRAFT, target)).toBe(true);
    mage.spellsCastThisTurn = (mage.spellsCastThisTurn ?? 0) + 1;
  });
}

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

describe('mage cast budget', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('blocks a Mage after one cast without the specialist', () => {
    const afterFirstCast = recordSuccessfulCast(makeState(), { x: 2, y: 1 });
    const mage = afterFirstCast.units.mage_1;

    expect(mage.spellsCastThisTurn).toBe(1);
    expect(canUnitCast(mage, afterFirstCast)).toBe(false);
  });

  it('lets a Mage cast twice while Archmage is active', () => {
    const afterFirstCast = recordSuccessfulCast(makeState(['spec_06']), { x: 2, y: 1 });
    expect(canUnitCast(afterFirstCast.units.mage_1, afterFirstCast)).toBe(true);

    const afterSecondCast = recordSuccessfulCast(afterFirstCast, { x: 3, y: 2 });
    const mage = afterSecondCast.units.mage_1;

    expect(mage.spellsCastThisTurn).toBe(2);
    expect(canUnitCast(mage, afterSecondCast)).toBe(false);
  });

  it('preserves spellsCastThisTurn across save round-trips', () => {
    const state = makeState(['spec_06']);
    state.units.mage_1.spellsCastThisTurn = 2;

    saveGameState(state);
    const loaded = loadGameState();

    expect(loaded).not.toBeNull();
    expect(loaded?.units.mage_1.spellsCastThisTurn).toBe(2);
  });
});
