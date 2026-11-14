import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MAGE_UNIT_TYPES, SPELL_DEFINITIONS, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { getStatMods, unlockTech } from '../techSystem';
import { canUnitCastSpell, castSpell, getCastableSpellIds } from '../spellSystem';
import { generateInitialGameState } from '../mapGenerator';
import { useGameStore } from '../gameStore';
import { getMagePath, isMageUnit } from '../unitTraits';
import { Faction, MagicPath, SpellId, TileStatus, TileType, UnitType } from '../types';
import type { GameState, Position, Unit } from '../types';

const MAGE_TYPES = [
  UnitType.CRYSTAL_MAGE,
  UnitType.NECROMANCER,
  UnitType.EMBER_CULTIST,
] as const;

const OWNED_SPELLS: Record<(typeof MAGE_TYPES)[number], SpellId[]> = {
  [UnitType.CRYSTAL_MAGE]: [
    SpellId.TRANSPOSE,
    SpellId.FROSTCRAFT,
    SpellId.RUPTURE,
    SpellId.TAUNT,
    SpellId.STONE_SKIN,
    SpellId.CRYSTAL_LIGHTNING,
    SpellId.CRYSTAL_CAVE,
    SpellId.PORTAL,
    SpellId.CRYSTAL_TOWER,
  ],
  [UnitType.NECROMANCER]: [
    SpellId.TRANSPOSE,
    SpellId.FROSTCRAFT,
    SpellId.RUPTURE,
    SpellId.RAISE_SKELETON,
    SpellId.SUMMON_GHOUL,
    SpellId.GRAVE_TRAP,
  ],
  [UnitType.EMBER_CULTIST]: [
    SpellId.TRANSPOSE,
    SpellId.FROSTCRAFT,
    SpellId.RUPTURE,
    SpellId.BRANDMARK_HEAL,
    SpellId.EMBERBIND,
    SpellId.CORRUPTED_QORK,
    SpellId.EXPLODE,
    SpellId.LAVA_MOLD,
  ],
};

function makeUnit(type: UnitType, position: Position, faction: Faction = Faction.PLAYER): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `${type}-${position.x}-${position.y}`,
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
    tags: [...definition.tags],
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

function makeState(
  casterType: UnitType,
  spells: SpellId[],
  additionalUnits: Unit[] = [],
): GameState {
  const state = generateInitialGameState();
  const caster = makeUnit(casterType, { x: 4, y: 4 });
  state.units = Object.fromEntries([caster, ...additionalUnits].map((unit) => [unit.id, unit]));
  state.grid = state.grid.map((row) => row.map((tile) => ({
    ...tile,
    isRevealed: true,
    unitId: null,
    buildingId: null,
    isLava: false,
    terrainType: TileType.PLAINS,
    status: null,
  })));
  for (const unit of Object.values(state.units)) {
    state.grid[unit.position.y][unit.position.x].unitId = unit.id;
  }
  state.unlockedSpells = spells;
  state.arcaneCrystals = 10;
  state.pendingTransposeFirstUnitId = null;
  state.pendingSpellCast = null;
  return state;
}

describe('Mage path spell ownership', () => {
  it('gives each path its defined spells and common spells to all three', () => {
    const state = makeState(UnitType.CRYSTAL_MAGE, Object.values(SpellId));
    for (const type of MAGE_TYPES) {
      const caster = makeUnit(type, { x: 4, y: 4 });
      expect(isMageUnit(caster)).toBe(true);
      expect(canUnitCastSpell(state, caster, SpellId.TRANSPOSE)).toBe(true);
      expect(canUnitCastSpell(state, caster, SpellId.FROSTCRAFT)).toBe(true);
      expect(canUnitCastSpell(state, caster, SpellId.RUPTURE)).toBe(true);
      for (const spellId of Object.values(SpellId)) {
        expect(canUnitCastSpell(state, caster, spellId)).toBe(OWNED_SPELLS[type].includes(spellId));
      }

      const orderedUnlocks = [
        SpellId.RUPTURE,
        SpellId.TAUNT,
        SpellId.FROSTCRAFT,
        SpellId.RAISE_SKELETON,
        SpellId.TRANSPOSE,
      ];
      const orderedState = makeState(type, orderedUnlocks);
      expect(getCastableSpellIds(orderedState, caster)).toEqual(
        orderedUnlocks.filter((spellId) => OWNED_SPELLS[type].includes(spellId)),
      );
    }

    expect(MAGE_UNIT_TYPES).toEqual(MAGE_TYPES);
    expect(getMagePath(makeUnit(UnitType.CRYSTAL_MAGE, { x: 1, y: 1 }))).toBe(MagicPath.CRYSTAL);
    expect(getMagePath(makeUnit(UnitType.NECROMANCER, { x: 1, y: 1 }))).toBe(MagicPath.NECRO);
    expect(getMagePath(makeUnit(UnitType.EMBER_CULTIST, { x: 1, y: 1 }))).toBe(MagicPath.EMBER);
  });

  it('requires a Mage-owned, unlocked spell before entering spell-target mode', () => {
    const necromancer = makeUnit(UnitType.NECROMANCER, { x: 4, y: 4 });
    useGameStore.setState({
      units: { [necromancer.id]: necromancer },
      unlockedSpells: [SpellId.TAUNT],
      pendingSpellCast: null,
    });

    useGameStore.getState().startSpellCast(necromancer.id, SpellId.TAUNT);
    expect(useGameStore.getState().pendingSpellCast).toBeNull();
  });

  it('rejects off-path casts without consuming crystals', () => {
    const state = makeState(UnitType.CRYSTAL_MAGE, [SpellId.EMBERBIND]);
    const crystalsBeforeCast = state.arcaneCrystals;
    const next = produce(state, (draft) => {
      expect(castSpell(draft, 'CRYSTAL_MAGE-4-4', SpellId.EMBERBIND, { x: 4, y: 3 })).toBe(false);
    });
    expect(next.arcaneCrystals).toBe(crystalsBeforeCast);
  });

  it('lets every Mage path cast Transpose, Frostcraft, and Rupture', () => {
    for (const type of MAGE_TYPES) {
      const firstFriend = makeUnit(UnitType.SPEARMAN, { x: 3, y: 4 });
      const secondFriend = makeUnit(UnitType.SPEARMAN, { x: 5, y: 4 });
      const transposeState = makeState(type, [SpellId.TRANSPOSE], [firstFriend, secondFriend]);
      const transposed = produce(transposeState, (draft) => {
        expect(castSpell(draft, `${type}-4-4`, SpellId.TRANSPOSE, firstFriend.position)).toBe(false);
        expect(castSpell(draft, `${type}-4-4`, SpellId.TRANSPOSE, secondFriend.position)).toBe(true);
      });
      expect(transposed.units[firstFriend.id].position).toEqual(secondFriend.position);

      const frostState = makeState(type, [SpellId.FROSTCRAFT]);
      const frostTarget = { x: 4, y: 3 };
      frostState.grid[frostTarget.y][frostTarget.x].terrainType = TileType.WATER;
      const frozen = produce(frostState, (draft) => {
        expect(castSpell(draft, `${type}-4-4`, SpellId.FROSTCRAFT, frostTarget)).toBe(true);
      });
      expect(frozen.grid[frostTarget.y][frostTarget.x].status).toBe(TileStatus.FROZEN);

      const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 4, y: 3 }, Faction.ENEMY);
      enemy.stats.currentHp = 40;
      const ruptureState = makeState(type, [SpellId.RUPTURE], [enemy]);
      const ruptured = produce(ruptureState, (draft) => {
        expect(castSpell(draft, `${type}-4-4`, SpellId.RUPTURE, enemy.position)).toBe(true);
      });
      expect(ruptured.units[enemy.id].stats.currentHp).toBeLessThan(40);
    }
  });
});

describe('Mage path definitions and Spell Reach', () => {
  it('keeps Mage spell definitions non-empty and restricted to Mage types', () => {
    for (const definition of Object.values(SPELL_DEFINITIONS)) {
      expect(definition.casters.length).toBeGreaterThan(0);
      expect(definition.casters.every((type) => MAGE_UNIT_TYPES.includes(type))).toBe(true);
    }
  });

  it('uses independent Mage definitions with the same initial values', () => {
    for (const [index, type] of MAGE_TYPES.entries()) {
      for (const otherType of MAGE_TYPES.slice(index + 1)) {
        expect(UNIT_DEFINITIONS[type]).not.toBe(UNIT_DEFINITIONS[otherType]);
        expect(UNIT_DEFINITIONS[type]).toEqual(UNIT_DEFINITIONS[otherType]);
      }
    }
  });

  it('extends Spell Reach to all Mage types for existing and future recruits', () => {
    const reach = TECH_TREE.find((node) => node.id === 'SPELL_REACH')!;
    const rangeBonus = reach.textParams?.rangeBonus ?? 0;
    expect(reach.effects).toEqual(MAGE_TYPES.map((unitType) => ({
      type: 'UNIT_STAT_MOD',
      unitType,
      stat: 'attackRange',
      mode: 'add',
      value: rangeBonus,
    })));

    const state = generateInitialGameState();
    state.arcaneCrystals = 100;
    state.units = Object.fromEntries(MAGE_TYPES.map((type, index) => {
      const unit = makeUnit(type, { x: index + 1, y: 1 });
      state.grid[1][index + 1].unitId = unit.id;
      return [unit.id, unit];
    }));
    const researched = produce(state, (draft) => {
      unlockTech(draft, 'ARCANE_STUDIES');
      unlockTech(draft, 'SPELL_REACH');
    });

    for (const type of MAGE_TYPES) {
      const unit = Object.values(researched.units).find((candidate) => candidate.type === type)!;
      expect(unit.stats.attackRange).toBe(UNIT_DEFINITIONS[type].attackRange + rangeBonus);
      expect(getStatMods(researched, type)).toContainEqual({
        stat: 'attackRange',
        mode: 'add',
        value: rangeBonus,
      });
    }
    expect(MAGE_TYPES.every((type) => UNIT_DEFINITIONS[type].attackRange === UNIT_DEFINITIONS.CRYSTAL_MAGE.attackRange)).toBe(true);
    expect(reach.textParams?.totalRange).toBe(
      UNIT_DEFINITIONS.CRYSTAL_MAGE.attackRange + rangeBonus,
    );
  });
});
