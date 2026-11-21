import { describe, expect, it, vi, beforeEach } from 'vitest';
import { produce } from 'immer';
import { MAGE, UNIT_DEFINITIONS, TAG_INFO } from '../gameConfig';
import { RENDER, UNIT_BACKGROUND_EFFECT_PRIORITY } from '../../config/render';
import { castSpell, getValidSpellTargets, explainInvalidSpellTarget } from '../spellSystem';
import { getBerserkAttackMultiplier, isBerserkActive } from '../combatSystem';
import { generateInitialGameState } from '../mapGenerator';
import { useFloaterStore } from '../floaterStore';
import { Faction, SpellId, UnitTag, UnitType } from '../types';
import type { GameState, Position, Unit } from '../types';

function makeUnit(id: string, type: UnitType, position: Position, faction: Faction = Faction.PLAYER, tags: UnitTag[] = []): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id,
    type,
    faction,
    position: { ...position },
    stats: {
      maxHp: definition.maxHp,
      currentHp: definition.maxHp,
      attack: definition.attack,
      defense: definition.defense,
      moveRange: definition.moveRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
      attackRange: definition.attackRange,
    },
    tags: [...tags],
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
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
}

function makeState(units: Unit[]): GameState {
  const state = generateInitialGameState();
  state.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  state.grid = state.grid.map((row) => row.map((tile) => ({
    ...tile,
    isRevealed: true,
    unitId: null,
    buildingId: null,
  })));
  for (const unit of units) state.grid[unit.position.y][unit.position.x].unitId = unit.id;
  state.unlockedSpells = [SpellId.BLOOD_FRENZY, SpellId.BRANDMARK_HEAL];
  state.arcaneCrystals = 10;
  return state;
}

beforeEach(() => {
  useFloaterStore.setState({ floaters: [] });
});

describe('Blood Frenzy', () => {
  it('rounds an odd maximum HP up, caps current HP, and emits the lost amount', () => {
    const mage = makeUnit('mage', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const target = makeUnit('target', UnitType.SWORDSMAN, { x: 5, y: 4 });
    target.stats.maxHp = 9;
    target.stats.currentHp = 9;
    const state = makeState([mage, target]);
    const floaterSpy = vi.spyOn(useFloaterStore.getState(), 'addFloater');

    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.BLOOD_FRENZY, target.position)).toBe(true);
    });
    const changed = after.units[target.id];
    expect(changed.stats.maxHp).toBe(Math.ceil(9 * MAGE.BLOOD_FRENZY_MAX_HP_MULTIPLIER));
    expect(changed.stats.currentHp).toBe(changed.stats.maxHp);
    expect(changed.tags).toContain(UnitTag.BERSERK);
    expect(changed.berserkActivated).toBe(true);
    expect(floaterSpy).toHaveBeenCalledWith(expect.objectContaining({
      value: 9 - changed.stats.maxHp,
      x: target.position.x,
      y: target.position.y,
    }));
  });

  it('activates the attack multiplier immediately at full HP and preserves shields', () => {
    const mage = makeUnit('mage', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const target = makeUnit('target', UnitType.SWORDSMAN, { x: 5, y: 4 });
    target.arcaneShieldHp = 20;
    target.stoneSkinHp = 50;
    const state = makeState([mage, target]);
    const after = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.BLOOD_FRENZY, target.position);
    });
    const changed = after.units[target.id];
    expect(changed.stats.currentHp).toBe(changed.stats.maxHp);
    expect(isBerserkActive(changed)).toBe(true);
    expect(getBerserkAttackMultiplier(changed)).toBeGreaterThan(1);
    expect(changed.arcaneShieldHp).toBe(20);
    expect(changed.stoneSkinHp).toBe(50);
  });

  it('keeps Berserk and doubles the reduced maximum through Brandmark Heal', () => {
    const mage = makeUnit('mage', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const target = makeUnit('target', UnitType.SWORDSMAN, { x: 5, y: 4 });
    target.stats.maxHp = 9;
    target.stats.currentHp = 9;
    const state = makeState([mage, target]);
    const afterFrenzy = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.BLOOD_FRENZY, target.position);
    });
    const reducedMax = afterFrenzy.units[target.id].stats.maxHp;
    const afterBrandmark = produce(afterFrenzy, (draft) => {
      castSpell(draft, mage.id, SpellId.BRANDMARK_HEAL, target.position);
    });
    const changed = afterBrandmark.units[target.id];
    expect(changed.stats.maxHp).toBe(reducedMax * MAGE.BRANDMARK_HP_MULTIPLIER);
    expect(changed.tags).toContain(UnitTag.BERSERK);
  });

  it('rejects Mages and existing Berserk units while allowing Summoned and Mech targets', () => {
    const mage = makeUnit('mage', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const mageTarget = makeUnit('mage2', UnitType.CRYSTAL_MAGE, { x: 5, y: 4 });
    const berserk = makeUnit('berserk', UnitType.SWORDSMAN, { x: 6, y: 4 }, Faction.PLAYER, [UnitTag.BERSERK]);
    const summoned = makeUnit('summoned', UnitType.EMBER_DEMON, { x: 4, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const mech = makeUnit('mech', UnitType.CRYSTAL_KHYRON, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.MECH]);
    const state = makeState([mage, mageTarget, berserk, summoned, mech]);
    const targets = getValidSpellTargets(state, mage.id, SpellId.BLOOD_FRENZY);
    expect(targets).not.toContainEqual(mageTarget.position);
    expect(targets).not.toContainEqual(berserk.position);
    expect(targets).toContainEqual(summoned.position);
    expect(targets).toContainEqual(mech.position);
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.BLOOD_FRENZY, mageTarget.position)?.key)
      .toBe('reason.spell.bloodFrenzyMage');
  });

  it('adds the Berserk icon and crimson priority marker only for active player Berserk', () => {
    expect(TAG_INFO[UnitTag.BERSERK].icon).toBe('💢');
    expect(RENDER.COLORS.BERSERK).toBe('#C8102E');
    expect(UNIT_BACKGROUND_EFFECT_PRIORITY.indexOf('BERSERK')).toBeGreaterThan(UNIT_BACKGROUND_EFFECT_PRIORITY.indexOf('DEATHLESS'));
    expect(UNIT_BACKGROUND_EFFECT_PRIORITY.indexOf('BERSERK')).toBeLessThan(UNIT_BACKGROUND_EFFECT_PRIORITY.indexOf('MAGE_AURA'));

    const inactive = makeUnit('inactive', UnitType.ARCHER, { x: 1, y: 1 }, Faction.PLAYER, [UnitTag.BERSERK]);
    expect(isBerserkActive(inactive)).toBe(false);
    const enemy = makeUnit('enemy', UnitType.ARCHER, { x: 2, y: 1 }, Faction.ENEMY, [UnitTag.BERSERK]);
    enemy.berserkActivated = true;
    expect(isBerserkActive(enemy)).toBe(true);
  });
});
