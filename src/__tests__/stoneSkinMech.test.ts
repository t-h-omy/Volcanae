import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { MAGE, UNIT_DEFINITIONS } from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { applyUnitDamage } from '../unitDamage';
import { Faction, SpellId, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Unit } from '../types';

function unit(id: string, type: UnitType, x: number, extraTags: UnitTag[] = []): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id, type, faction: Faction.PLAYER, position: { x, y: 5 },
    stats: {
      maxHp: definition.maxHp, currentHp: definition.maxHp,
      attack: definition.attack, defense: definition.defense,
      moveRange: definition.moveRange, attackRange: definition.attackRange,
      discoverRadius: definition.discoverRadius, triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
    },
    tags: [...definition.tags, ...extraTags],
    hasMovedThisTurn: false, hasAttackedThisTurn: false, hasCapturedThisTurn: false,
    hasConstructedThisTurn: false, hasDestroyedThisTurn: false, hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false, bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0, xp: 0, level: 1, pinnedUntilTurn: 0,
    distractionDefPenalty: 0, lastMovedTurn: 0,
  };
}

function fixture(type: UnitType, tags: UnitTag[] = []): { state: GameState; mage: Unit; target: Unit } {
  const state = generateInitialGameState();
  const mage = unit('mage', UnitType.MAGE, 5);
  const target = unit('target', type, 6, tags);
  state.units = { [mage.id]: mage, [target.id]: target };
  state.buildings = {};
  state.unlockedSpells = [SpellId.STONE_SKIN];
  state.arcaneCrystals = MAGE.SPELL_CAST_CRYSTAL_COST;
  state.globalSpecialistStorage = [];
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
    }
  }
  for (const candidate of [mage, target]) {
    const tile = state.grid[candidate.position.y][candidate.position.x];
    tile.unitId = candidate.id;
    tile.isRevealed = true;
    tile.isLava = false;
    tile.terrainType = TileType.PLAINS;
  }
  return { state, mage, target };
}

describe('Stone Skin Mech restriction', () => {
  it.each([
    [UnitType.CRYSTAL_KHYRON, []],
    [UnitType.SPEARMAN, [UnitTag.MECH]],
  ] as const)('excludes %s with Mech from targets and refuses casting without spending resources', (type, tags) => {
    const { state, mage, target } = fixture(type, [...tags]);
    expect(target.tags).toContain(UnitTag.MECH);
    expect(getValidSpellTargets(state, mage.id, SpellId.STONE_SKIN)).not.toContainEqual(target.position);
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.STONE_SKIN, target.position)).toEqual({
      key: 'reason.spell.stoneSkinMech',
    });

    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.STONE_SKIN, target.position)).toBe(false);
    });
    expect(after).toEqual(state);
    expect(after.units[target.id].tags).not.toContain(UnitTag.STONE_SKIN);
    expect(after.units[target.id].stoneSkinHp).toBeUndefined();
    expect(after.arcaneCrystals).toBe(state.arcaneCrystals);
    expect(after.units[mage.id].spellsCastThisTurn).toBe(0);
  });

  it.each([
    [UnitType.SPEARMAN, []],
    [UnitType.GARGOYLE, []],
    [UnitType.EMBER_DEMON, [UnitTag.SUMMONED]],
  ] as const)('still targets and protects non-Mech %s', (type, tags) => {
    const { state, mage, target } = fixture(type, [...tags]);
    expect(getValidSpellTargets(state, mage.id, SpellId.STONE_SKIN)).toEqual(
      expect.arrayContaining([mage.position, target.position]),
    );
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.STONE_SKIN, target.position)).toBeNull();
    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.STONE_SKIN, target.position)).toBe(true);
    });
    expect(after.units[target.id].stoneSkinHp).toBe(MAGE.STONE_SKIN_HP);
    expect(after.units[target.id].tags).toContain(UnitTag.STONE_SKIN);
    expect(after.arcaneCrystals).toBe(0);
  });

  it('keeps existing Mech Stone Skin and its absorption unchanged', () => {
    const { state, mage, target } = fixture(UnitType.CRYSTAL_KHYRON, [UnitTag.STONE_SKIN]);
    target.stoneSkinHp = MAGE.STONE_SKIN_HP;
    const hpBefore = target.stats.currentHp;
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.STONE_SKIN, target.position)).toEqual({
      key: 'reason.spell.stoneSkinAlreadyActive',
    });
    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.STONE_SKIN, target.position)).toBe(false);
      applyUnitDamage(draft.units[target.id], MAGE.STONE_SKIN_HP);
    });
    expect(after.units[target.id].stats.currentHp).toBe(hpBefore);
    expect(after.units[target.id].stoneSkinHp ?? 0).toBe(0);
    expect(after.units[target.id].tags).not.toContain(UnitTag.STONE_SKIN);
    expect(after.arcaneCrystals).toBe(state.arcaneCrystals);
  });
});
