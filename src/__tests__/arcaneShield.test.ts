import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MAGE, UNIT_DEFINITIONS } from '../gameConfig';
import { applyUnitDamage, getUnitDamageOutcome } from '../unitDamage';
import {
  grantArcaneShield,
  grantArcaneShieldToAllMages,
  hasArcaneShieldTech,
  regenerateArcaneShields,
} from '../arcaneShieldSystem';
import { collectResources, recruitUnit } from '../resourceSystem';
import { unlockTech } from '../techSystem';
import { advanceLava } from '../lavaSystem';
import { migrateState, SAVE_VERSION } from '../saveSystem';
import { generateInitialGameState } from '../mapGenerator';
import { BuildingType, Faction, TechFlag, UnitTag, UnitType } from '../types';
import type { Building, GameState, Unit } from '../types';

let counter = 0;

function makeUnit(type: UnitType, faction: Faction = Faction.PLAYER, overrides: Partial<Unit> = {}): Unit {
  const d = UNIT_DEFINITIONS[type];
  return {
    id: `shield-unit-${++counter}`,
    type,
    faction,
    position: { x: 0, y: 0 },
    stats: {
      maxHp: d.maxHp,
      currentHp: d.maxHp,
      attack: d.attack,
      defense: d.defense,
      moveRange: d.moveRange,
      discoverRadius: d.discoverRadius,
      triggerRange: d.triggerRange ?? 0,
      movementActions: d.movementActions ?? 1,
      attackRange: d.attackRange,
    },
    tags: [...d.tags],
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
    ...overrides,
  } as Unit;
}

function baseState(withTech = true): GameState {
  const state = generateInitialGameState();
  return produce(state, (draft) => {
    draft.units = {};
    draft.techFlags = withTech ? [TechFlag.ARCANE_SHIELD] : [];
  });
}

function withUnits(state: GameState, ...units: Unit[]): GameState {
  return produce(state, (draft) => {
    for (const u of units) draft.units[u.id] = u;
  });
}

function chamber(turns: number): Building {
  return {
    id: `chamber-${++counter}`,
    type: BuildingType.CRYSTAL_CHAMBER,
    faction: Faction.PLAYER,
    position: { x: 1, y: 1 },
    resonanceTurnsRemaining: turns,
    isDisabledForTurns: 0,
    resonanceCrystalBonus: false,
  } as unknown as Building;
}

describe('Arcane Shield damage', () => {
  it('absorbs shield only', () => {
    const unit = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 20 });
    const out = applyUnitDamage(unit, 5);
    expect(unit.arcaneShieldHp).toBe(15);
    expect(unit.stats.currentHp).toBe(unit.stats.maxHp);
    expect(out.absorbedByArcaneShield).toBe(5);
  });

  it('overflows into Stone Skin, then HP', () => {
    const unit = makeUnit(UnitType.NECROMANCER, Faction.PLAYER, {
      arcaneShieldHp: 20,
      stoneSkinHp: 10,
      tags: [UnitTag.STONE_SKIN],
    });
    const hp = unit.stats.currentHp;
    applyUnitDamage(unit, 35);
    expect(unit.arcaneShieldHp).toBeUndefined();
    expect(unit.stoneSkinHp).toBeUndefined();
    expect(unit.tags).not.toContain(UnitTag.STONE_SKIN);
    expect(unit.stats.currentHp).toBe(hp - 5);
  });

  it('overflows into HP and can still be lethal', () => {
    const unit = makeUnit(UnitType.EMBER_CULTIST, Faction.PLAYER, { arcaneShieldHp: 20 });
    applyUnitDamage(unit, 20 + unit.stats.maxHp - 1);
    expect(unit.stats.currentHp).toBe(1);
    const lethal = makeUnit(UnitType.EMBER_CULTIST, Faction.PLAYER, { arcaneShieldHp: 20 });
    const out = applyUnitDamage(lethal, 20 + lethal.stats.maxHp);
    expect(out.died).toBe(true);
  });

  it('previews include the shield without mutating', () => {
    const unit = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 20 });
    const out = getUnitDamageOutcome(unit, 12);
    expect(out.arcaneShieldHp).toBe(8);
    expect(out.currentHp).toBe(unit.stats.maxHp);
    expect(unit.arcaneShieldHp).toBe(20);
  });
});

describe('Arcane Shield granting', () => {
  it('requires the tech, a player faction and a Mage', () => {
    const mage = makeUnit(UnitType.CRYSTAL_MAGE);
    const enemyMage = makeUnit(UnitType.CRYSTAL_MAGE, Faction.ENEMY);
    const soldier = makeUnit(UnitType.SPEARMAN);
    const noTech = baseState(false);
    expect(hasArcaneShieldTech(noTech)).toBe(false);
    expect(grantArcaneShield(noTech, mage)).toBe(false);
    const state = baseState();
    expect(grantArcaneShield(state, enemyMage)).toBe(false);
    expect(grantArcaneShield(state, soldier)).toBe(false);
    expect(grantArcaneShield(state, mage)).toBe(true);
    expect(mage.arcaneShieldHp).toBe(MAGE.ARCANE_SHIELD_MAX_HP);
  });

  it('researching Arcane Studies shields existing Mages', () => {
    const mage = makeUnit(UnitType.CRYSTAL_MAGE);
    const soldier = makeUnit(UnitType.SPEARMAN);
    const state = produce(withUnits(baseState(false), mage, soldier), (draft) => {
      draft.arcaneCrystals = 99;
      draft.techNodes.ARCANE_AWAKENING = { unlocked: true } as never;
      draft.techNodes.ARCANE_STUDIES = { unlocked: false } as never;
      unlockTech(draft, 'ARCANE_STUDIES');
    });
    expect(state.techFlags).toContain(TechFlag.ARCANE_SHIELD);
    expect(state.units[mage.id].arcaneShieldHp).toBe(MAGE.ARCANE_SHIELD_MAX_HP);
    expect(state.units[soldier.id].arcaneShieldHp).toBeUndefined();
  });

  it('grantArcaneShieldToAllMages fills every holder', () => {
    const a = makeUnit(UnitType.CRYSTAL_MAGE);
    const b = makeUnit(UnitType.NECROMANCER);
    const state = produce(withUnits(baseState(), a, b), (draft) => grantArcaneShieldToAllMages(draft));
    expect(state.units[a.id].arcaneShieldHp).toBe(20);
    expect(state.units[b.id].arcaneShieldHp).toBe(20);
  });

  it('recruited Mages start with a full shield', () => {
    const ch = chamber(1);
    ch.position = { x: 2, y: 2 };
    const state = produce(baseState(), (draft) => {
      draft.buildings[ch.id] = ch;
      draft.grid[2][2].buildingId = ch.id;
      draft.arcaneCrystals = 99;
      draft.resources.iron = 999;
      draft.resources.wood = 999;
      draft.unlockedUnits.push(UnitType.CRYSTAL_MAGE);
      recruitUnit(draft, ch.id, UnitType.CRYSTAL_MAGE);
    });
    const mage = Object.values(state.units).find((u) => u.type === UnitType.CRYSTAL_MAGE);
    expect(mage?.arcaneShieldHp).toBe(MAGE.ARCANE_SHIELD_MAX_HP);
  });
});

describe('Arcane Shield regeneration', () => {
  it('regenerates capped and reports gains', () => {
    const a = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 5 });
    const b = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 15 });
    const c = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 20 });
    const state = withUnits(baseState(), a, b, c);
    let gains: ReturnType<typeof regenerateArcaneShields> = [];
    const next = produce(state, (draft) => { gains = regenerateArcaneShields(draft); });
    expect(next.units[a.id].arcaneShieldHp).toBe(15);
    expect(next.units[b.id].arcaneShieldHp).toBe(20);
    expect(gains).toEqual([{ unitId: a.id, amount: 10 }, { unitId: b.id, amount: 5 }]);
  });

  it('a 3-turn Resonance yields exactly 3 ticks, none afterwards', () => {
    const mage = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 1 });
    const ch = chamber(3);
    let state = produce(withUnits(baseState(), mage), (draft) => { draft.buildings[ch.id] = ch; });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = produce(state, (draft) => {
        draft.units[mage.id].arcaneShieldHp = 0 + 1;
        collectResources(draft);
      });
      seen.push(state.units[mage.id].arcaneShieldHp ?? 0);
    }
    expect(seen).toEqual([11, 11, 11, 1]);
  });

  it('does not regenerate without a resonating Chamber', () => {
    const mage = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 3 });
    const state = produce(withUnits(baseState(), mage), (draft) => { collectResources(draft); });
    expect(state.units[mage.id].arcaneShieldHp).toBe(3);
  });
});

describe('Arcane Shield bypass and heals', () => {
  it('lava kills a shielded Mage', () => {
    const base = baseState();
    const row = base.lavaFrontRow - 1;
    const mage = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 20, position: { x: 0, y: row } });
    const state = produce(withUnits(base, mage), (draft) => {
      draft.grid[row][0].unitId = mage.id;
      advanceLava(draft);
    });
    expect(state.units[mage.id]).toBeUndefined();
  });
});

describe('Arcane Shield save', () => {
  it('migrates version 24 with Arcane Studies unlocked', () => {
    const mage = makeUnit(UnitType.CRYSTAL_MAGE);
    const raw = produce(withUnits(baseState(false), mage), (draft) => {
      draft.techNodes.ARCANE_STUDIES = { unlocked: true } as never;
    });
    const migrated = migrateState({ version: 24, state: JSON.parse(JSON.stringify(raw)) });
    expect(migrated?.techFlags).toContain(TechFlag.ARCANE_SHIELD);
    expect(migrated?.units[mage.id].arcaneShieldHp).toBe(MAGE.ARCANE_SHIELD_MAX_HP);
  });

  it('version 25 round-trips arcaneShieldHp', () => {
    expect(SAVE_VERSION).toBe(25);
    const mage = makeUnit(UnitType.CRYSTAL_MAGE, Faction.PLAYER, { arcaneShieldHp: 7 });
    const raw = withUnits(baseState(), mage);
    const migrated = migrateState({ version: 25, state: JSON.parse(JSON.stringify(raw)) });
    expect(migrated?.units[mage.id].arcaneShieldHp).toBe(7);
  });
});
