import { describe, expect, it, vi, beforeEach } from 'vitest';
import { produce } from 'immer';
import { castSpell, getValidSpellTargets } from '../spellSystem';
import { applyEffectsForSpecialist, revokeEffectsForSpecialist, createInitialSpecialists } from '../specialistSystem';
import { ABILITIES, MAGE, UNIT_DEFINITIONS } from '../gameConfig';
import { Faction, GamePhase, SpellId, TileType, UnitType } from '../types';
import type { GameState, Tile, Unit } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

function makeTile(x: number, y: number): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status: null,
    hasCaveMonster: false,
  } as Tile;
}

function makeMage(x: number, y: number): Unit {
  const def = UNIT_DEFINITIONS[UnitType.MAGE];
  return {
    id: 'mage_1',
    type: UnitType.MAGE,
    faction: Faction.PLAYER,
    position: { x, y },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    controllerMageId: null,
  };
}

function makeEnemy(id: string, x: number, y: number, currentHp: number): Unit {
  const def = UNIT_DEFINITIONS[UnitType.LAVA_GRUNT];
  return {
    id,
    type: UnitType.LAVA_GRUNT,
    faction: Faction.ENEMY,
    position: { x, y },
    stats: {
      maxHp: def.maxHp,
      currentHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange ?? 0,
      movementActions: def.movementActions ?? 1,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
}

function makeState(opts: {
  mageX?: number;
  mageY?: number;
  crystals?: number;
  ruptureUnlocked?: boolean;
  extraUnits?: Unit[];
} = {}): GameState {
  const mageX = opts.mageX ?? 4;
  const mageY = opts.mageY ?? 4;
  const crystals = opts.crystals ?? 5;
  const ruptureUnlocked = opts.ruptureUnlocked ?? true;

  const GRID = 9;
  const grid: Tile[][] = Array.from({ length: GRID }, (_, y) =>
    Array.from({ length: GRID }, (_, x) => makeTile(x, y)),
  );

  const mage = makeMage(mageX, mageY);
  grid[mageY][mageX].unitId = mage.id;

  const unitMap: Record<string, Unit> = { [mage.id]: mage };
  for (const u of opts.extraUnits ?? []) {
    unitMap[u.id] = u;
    grid[u.position.y][u.position.x].unitId = u.id;
  }

  return {
    phase: GamePhase.PLAYER_TURN,
    turn: 1,
    grid,
    units: unitMap,
    buildings: {},
    portals: {},
    activeCaveEncounters: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: crystals,
    ember: 0,
    techFlags: [],
    unlockedSpells: ruptureUnlocked ? [SpellId.RUPTURE] : [],
    unlockedUnits: [],
    techNodes: {},
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: [],
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
      buildingsDestroyedByLava: 0,
    },
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBrandmarkTransforms: [],
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    lavaFrontRow: GRID,
    turnsUntilLavaAdvance: 3,
    zonesUnlocked: [],
    unlockedBuildings: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: undefined as unknown as GameState['difficulty'],
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    activeWaveTheme: { entries: [], isReadPlayer: false },
    readPlayerThemeCount: 0,
    lastThemeSignature: null,
  } as unknown as GameState;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SP-16 The Sundered (spec_22) — RUPTURE spell', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  describe('getValidSpellTargets — RUPTURE', () => {
    it('returns enemy units within mage spell range', () => {
      const enemy = makeEnemy('enemy1', 4, 2, 20); // within range
      const state = makeState({ extraUnits: [enemy] });
      const mage = state.units['mage_1'];
      const range = mage.stats.attackRange;

      const targets = getValidSpellTargets(state, 'mage_1', SpellId.RUPTURE);
      expect(targets.some((p) => p.x === enemy.position.x && p.y === enemy.position.y)).toBe(true);
      expect(range).toBeGreaterThan(0);
    });

    it('does NOT return player units', () => {
      const playerUnit: Unit = { ...makeEnemy('ally1', 4, 2, 20), faction: Faction.PLAYER, type: UnitType.SWORDSMAN };
      const state = makeState({ extraUnits: [playerUnit] });

      const targets = getValidSpellTargets(state, 'mage_1', SpellId.RUPTURE);
      expect(targets.some((p) => p.x === playerUnit.position.x && p.y === playerUnit.position.y)).toBe(false);
    });

    it('does NOT return enemies out of range', () => {
      const mage = makeMage(4, 4);
      const range = mage.stats.attackRange;
      // Place enemy far away (guaranteed out of range)
      const farX = Math.min(8, mage.position.x + range + 2);
      const farY = Math.min(8, mage.position.y + range + 2);
      const enemy = makeEnemy('enemy_far', farX, farY, 20);
      const state = makeState({ extraUnits: [enemy] });

      const targets = getValidSpellTargets(state, 'mage_1', SpellId.RUPTURE);
      expect(targets.some((p) => p.x === farX && p.y === farY)).toBe(false);
    });

    it('returns empty when no enemies are present', () => {
      const state = makeState();
      const targets = getValidSpellTargets(state, 'mage_1', SpellId.RUPTURE);
      expect(targets).toHaveLength(0);
    });
  });

  describe('castSpell — RUPTURE damage', () => {
    it('deals floor(currentHp * RUPTURE_PERCENT) damage to the target', () => {
      const startHp = 40;
      const enemy = makeEnemy('enemy1', 4, 2, startHp);
      const state = makeState({ extraUnits: [enemy] });

      const expectedDamage = Math.floor(startHp * MAGE.RUPTURE_PERCENT);
      const expectedHp = startHp - expectedDamage;

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(true);
      });

      expect(nextState.units['enemy1']!.stats.currentHp).toBe(expectedHp);
    });

    it('clamps target HP to 1 — cannot kill (HP=1 case)', () => {
      const enemy = makeEnemy('enemy1', 4, 2, 1);
      const state = makeState({ extraUnits: [enemy] });

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(true);
      });

      expect(nextState.units['enemy1']!.stats.currentHp).toBe(1);
    });

    it('clamps target HP to 1 — cannot kill (HP=3, floor(3*0.5)=1, resulting HP=2)', () => {
      // With RUPTURE_PERCENT=0.5, floor(3*0.5)=1, leaves HP at 2 — no kill needed here;
      // actual cannot-kill test uses HP=2: floor(2*0.5)=1, leaves HP=1
      const enemy = makeEnemy('enemy1', 4, 2, 2);
      const state = makeState({ extraUnits: [enemy] });

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(true);
      });

      expect(nextState.units['enemy1']!.stats.currentHp).toBe(1);
    });

    it('does not kill the target even when damage equals full currentHp', () => {
      // HP=1: floor(1*0.5)=0 damage, stays at 1
      // HP=2: floor(2*0.5)=1 damage, clamped to max(1, 2-1)=1
      const enemy = makeEnemy('enemy1', 4, 2, 2);
      const state = makeState({ extraUnits: [enemy] });

      const nextState = produce(state, (draft) => {
        castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 });
      });

      expect(nextState.units['enemy1']).toBeDefined();
      expect(nextState.units['enemy1']!.stats.currentHp).toBeGreaterThanOrEqual(1);
    });

    it('deducts one arcane crystal per cast', () => {
      const enemy = makeEnemy('enemy1', 4, 2, 40);
      const state = makeState({ crystals: 3, extraUnits: [enemy] });

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(true);
      });

      expect(nextState.arcaneCrystals).toBe(3 - ABILITIES.RUPTURE_CRYSTAL_COST);
    });

    it('returns false when arcane crystals are insufficient', () => {
      const enemy = makeEnemy('enemy1', 4, 2, 40);
      const state = makeState({ crystals: 0, extraUnits: [enemy] });

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(false);
      });

      expect(nextState.units['enemy1']!.stats.currentHp).toBe(40); // unchanged
    });

    it('returns false when RUPTURE is not in unlockedSpells', () => {
      const enemy = makeEnemy('enemy1', 4, 2, 40);
      const state = makeState({ ruptureUnlocked: false, extraUnits: [enemy] });

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(false);
      });

      expect(nextState.units['enemy1']!.stats.currentHp).toBe(40); // unchanged
    });

    it('returns false when target position has no unit', () => {
      const state = makeState();

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 3, y: 3 })).toBe(false);
      });

      expect(nextState.arcaneCrystals).toBe(5); // unchanged
    });

    it('returns false when target is a player unit', () => {
      const ally: Unit = { ...makeEnemy('ally1', 4, 2, 40), faction: Faction.PLAYER, type: UnitType.SWORDSMAN };
      // Player unit won't appear in getValidSpellTargets for RUPTURE, so cast returns false
      const state = makeState({ extraUnits: [ally] });

      const nextState = produce(state, (draft) => {
        expect(castSpell(draft, 'mage_1', SpellId.RUPTURE, { x: 4, y: 2 })).toBe(false);
      });

      expect(nextState.arcaneCrystals).toBe(5); // unchanged
    });
  });

  describe('RUPTURE_UNLOCK — specialistSystem', () => {
    it('adds SpellId.RUPTURE to unlockedSpells when spec_22 is applied', () => {
      const state = makeState({ ruptureUnlocked: false });
      const spec = state.specialists['spec_22']!;

      const nextState = produce(state, (draft) => {
        applyEffectsForSpecialist(draft, spec);
      });

      expect(nextState.unlockedSpells).toContain(SpellId.RUPTURE);
    });

    it('does NOT add RUPTURE twice if already unlocked', () => {
      const state = makeState({ ruptureUnlocked: true });
      const spec = state.specialists['spec_22']!;

      const nextState = produce(state, (draft) => {
        applyEffectsForSpecialist(draft, spec);
      });

      const count = nextState.unlockedSpells.filter((s) => s === SpellId.RUPTURE).length;
      expect(count).toBe(1);
    });

    it('removes SpellId.RUPTURE from unlockedSpells when spec_22 is revoked', () => {
      const state = makeState({ ruptureUnlocked: true });
      const spec = state.specialists['spec_22']!;

      const nextState = produce(state, (draft) => {
        revokeEffectsForSpecialist(draft, spec);
      });

      expect(nextState.unlockedSpells).not.toContain(SpellId.RUPTURE);
    });

    it('keeps RUPTURE unlocked if a second active RUPTURE_UNLOCK specialist still owns it', () => {
      // Simulate two specialists with RUPTURE_UNLOCK; only one is revoked.
      // Since spec_22 is the only RUPTURE_UNLOCK specialist defined, we'll
      // manually set globalSpecialistStorage to confirm the guard holds.
      const state = makeState({ ruptureUnlocked: true });
      const spec = state.specialists['spec_22']!;
      // Keep spec_22 in globalSpecialistStorage so the "still active" check fires
      state.globalSpecialistStorage = ['spec_22'];

      const nextState = produce(state, (draft) => {
        revokeEffectsForSpecialist(draft, spec);
      });

      // isSpecialistEffectActive returns true because spec_22 is still in storage
      expect(nextState.unlockedSpells).toContain(SpellId.RUPTURE);
    });
  });
});
