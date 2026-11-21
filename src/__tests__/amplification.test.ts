import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MAGE, UNIT_DEFINITIONS } from '../gameConfig';
import {
  castSpell,
  getValidSpellTargets,
  isLeashAnchored,
  isTileInSpellRange,
  sweepAmplifications,
  sweepLeashes,
} from '../spellSystem';
import { generateInitialGameState } from '../mapGenerator';
import { migrateState, SAVE_VERSION } from '../saveSystem';
import { Faction, GamePhase, SpellId, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Position, Unit } from '../types';

function makeUnit(id: string, type: UnitType, position: Position, tags: UnitTag[] = []): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id,
    type,
    faction: Faction.PLAYER,
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
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeState(units: Unit[]): GameState {
  const state = generateInitialGameState();
  state.phase = GamePhase.PLAYER_TURN;
  state.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  state.grid = state.grid.map((row) => row.map((tile) => ({
    ...tile,
    isRevealed: true,
    unitId: null,
    buildingId: null,
  })));
  for (const unit of units) state.grid[unit.position.y][unit.position.x].unitId = unit.id;
  state.unlockedSpells = [SpellId.AMPLIFICATION];
  state.arcaneCrystals = MAGE.SPELL_CAST_CRYSTAL_COST;
  return state;
}

describe('Amplification', () => {
  it('targets own in-range units, excludes caster and Summoned, and replaces links', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 4, y: 4 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 5, y: 4 });
    const summoned = makeUnit('summoned', UnitType.EMBER_DEMON, { x: 6, y: 4 }, [UnitTag.SUMMONED]);
    const secondMage = makeUnit('second', UnitType.NECROMANCER, { x: 4, y: 5 });
    const state = makeState([mage, carrier, summoned, secondMage]);

    expect(getValidSpellTargets(state, mage.id, SpellId.AMPLIFICATION))
      .toEqual(expect.arrayContaining([carrier.position, secondMage.position]));
    expect(getValidSpellTargets(state, mage.id, SpellId.AMPLIFICATION))
      .not.toContainEqual(summoned.position);

    const linked = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.AMPLIFICATION, carrier.position)).toBe(true);
    });
    expect(linked.units[carrier.id].amplifierMageId).toBe(mage.id);
    expect(linked.units[carrier.id].tags).toContain(UnitTag.AMPLIFIED);

    const charged = produce(linked, (draft) => {
      draft.arcaneCrystals = MAGE.SPELL_CAST_CRYSTAL_COST;
    });
    const recast = produce(charged, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.AMPLIFICATION, secondMage.position)).toBe(true);
    });
    expect(recast.units[carrier.id].tags).not.toContain(UnitTag.AMPLIFIED);
    expect(recast.units[carrier.id].amplifierMageId).toBeUndefined();
    expect(recast.units[secondMage.id].amplifierMageId).toBe(mage.id);

    const chargedAgain = produce(recast, (draft) => {
      draft.arcaneCrystals = MAGE.SPELL_CAST_CRYSTAL_COST;
    });
    const takenOver = produce(chargedAgain, (draft) => {
      expect(castSpell(draft, secondMage.id, SpellId.AMPLIFICATION, carrier.position)).toBe(true);
    });
    expect(takenOver.units[carrier.id].amplifierMageId).toBe(secondMage.id);
    expect(takenOver.units[carrier.id].tags).toContain(UnitTag.AMPLIFIED);
  });

  it('extends spell range through the carrier and persists after the carrier moves', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 1, y: 1 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 3, y: 1 });
    const target = makeUnit('target', UnitType.LAVA_GRUNT, { x: 6, y: 1 });
    const state = makeState([mage, carrier, target]);
    const linked = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.AMPLIFICATION, carrier.position)).toBe(true);
    });
    const range = MAGE.SPELL_RANGE_BONUS + mage.stats.attackRange;
    expect(isTileInSpellRange(linked, linked.units[mage.id], { x: 6, y: 1 }, range)).toBe(true);
    expect(isTileInSpellRange(linked, linked.units[mage.id], { x: 8, y: 8 }, range)).toBe(false);

    const moved = produce(linked, (draft) => {
      draft.units[carrier.id].position = { x: 2, y: 6 };
    });
    expect(isTileInSpellRange(moved, moved.units[mage.id], { x: 5, y: 6 }, range)).toBe(true);
  });

  it('breaks links at checkpoints and captures positions in the broken-link event', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 1, y: 1 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 8, y: 8 });
    carrier.amplifierMageId = mage.id;
    carrier.tags.push(UnitTag.AMPLIFIED);
    const state = makeState([mage, carrier]);

    produce(state, (draft) => {
      const result = sweepAmplifications(draft);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        unitId: carrier.id,
        mageId: mage.id,
        unitPos: carrier.position,
        magePos: mage.position,
      });
    });
  });

  it('keeps leashed creatures anchored through a linked carrier and defects in the same leash sweep', () => {
    const mage = makeUnit('mage', UnitType.NECROMANCER, { x: 1, y: 1 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 5, y: 5 }, [UnitTag.AMPLIFIED]);
    carrier.amplifierMageId = mage.id;
    const demon = makeUnit('demon', UnitType.EMBER_DEMON, { x: 6, y: 5 }, [UnitTag.LEASHED, UnitTag.SUMMONED]);
    demon.controllerMageId = mage.id;
    const state = makeState([mage, carrier, demon]);

    expect(isLeashAnchored(state, demon)).toBe(true);
    expect(sweepLeashes(state).length).toBe(0);

    const broken = produce(state, (draft) => {
      draft.units[carrier.id].position = { x: 8, y: 8 };
      expect(sweepAmplifications(draft)).toHaveLength(1);
      expect(sweepLeashes(draft)).toContain(demon.id);
    });
    expect(broken.units[demon.id].faction).toBe(Faction.ENEMY);
  });

  it('does not use the linked radius for Amplification targeting or alter Crystal Tower targeting', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 1, y: 1 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 4, y: 1 }, [UnitTag.AMPLIFIED]);
    carrier.amplifierMageId = mage.id;
    const farTarget = makeUnit('far', UnitType.GUARD, { x: 7, y: 1 });
    const state = makeState([mage, carrier, farTarget]);
    state.grid[mage.position.y][mage.position.x] = {
      ...state.grid[mage.position.y][mage.position.x],
      terrainType: TileType.PLAINS,
      isRuin: false,
      isStrongholdRuin: false,
      isLava: false,
      buildingId: null,
    };

    expect(getValidSpellTargets(state, mage.id, SpellId.AMPLIFICATION))
      .not.toContainEqual(farTarget.position);
    expect(getValidSpellTargets(state, mage.id, SpellId.CRYSTAL_TOWER))
      .toEqual([mage.position]);
  });

  it('round-trips the optional amplifierMageId field', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 1, y: 1 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 2, y: 1 });
    carrier.amplifierMageId = mage.id;
    carrier.tags.push(UnitTag.AMPLIFIED);
    const restored = JSON.parse(JSON.stringify(makeState([mage, carrier]))) as GameState;
    expect(restored.units[carrier.id].amplifierMageId).toBe(mage.id);
    expect(restored.units[carrier.id].tags).toContain(UnitTag.AMPLIFIED);
  });

  it('migrates version 26 saves without changing the link', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 1, y: 1 });
    const carrier = makeUnit('carrier', UnitType.GUARD, { x: 2, y: 1 });
    carrier.amplifierMageId = mage.id;
    carrier.tags.push(UnitTag.AMPLIFIED);
    const state = makeState([mage, carrier]);
    expect(SAVE_VERSION).toBe(27);
    const migrated = migrateState({ version: 26, state });
    expect(migrated?.units[carrier.id].amplifierMageId).toBe(mage.id);
  });
});
