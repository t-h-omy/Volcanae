import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  ARCANE_RESEARCH_COST_BY_DEPTH,
  getTechDepth,
  getTechMagicPath,
  getTechRootId,
  getTechTreeId,
  TECH_TREE,
} from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { computeTechTreeLayout } from '../techTreeLayout';
import { getAvailableTechs, unlockTech } from '../techSystem';
import { BuildingType, MagicPath, SpellId, TechTreeId, UnitType } from '../types';

const byId = (id: string) => TECH_TREE.find((node) => node.id === id)!;

describe('separate technology trees', () => {
  it('defines two roots and assigns trees only to roots', () => {
    const roots = TECH_TREE.filter((node) => node.requires.length === 0);
    expect(roots).toHaveLength(2);
    expect(new Set(roots.map((node) => node.tree))).toEqual(new Set([TechTreeId.SECULAR, TechTreeId.ARCANE]));
    expect(TECH_TREE.filter((node) => node.requires.length > 0 && node.tree !== undefined)).toEqual([]);
    expect(TECH_TREE.every((node) => node.requires.length <= 1)).toBe(true);
    for (const node of TECH_TREE) expect(TECH_TREE.some((candidate) => candidate.id === getTechRootId(node.id))).toBe(true);
    expect(byId('CONSCRIPTION').effects).not.toContainEqual({
      type: 'UNLOCK_BUILDING',
      buildingType: BuildingType.CRYSTAL_CHAMBER,
    });
    expect(byId('ARCANE_AWAKENING').effects).toEqual([{
      type: 'UNLOCK_BUILDING',
      buildingType: BuildingType.CRYSTAL_CHAMBER,
    }]);
  });

  it('uses the requested four path parents and depth costs', () => {
    const parents: Record<string, string> = {
      CRYSTAL_KHYRON: 'CRYSTAL_MAGE',
      TAUNT: 'CRYSTAL_MAGE',
      CRYSTAL_CAVE: 'CRYSTAL_MAGE',
      CRYSTAL_TOWER: 'CRYSTAL_KHYRON',
      CRYSTAL_LIGHTNING: 'CRYSTAL_KHYRON',
      STONE_SKIN: 'TAUNT',
      PORTAL: 'CRYSTAL_CAVE',
      RAISE_SKELETON: 'NECROMANCER',
      SUMMON_GHOUL: 'RAISE_SKELETON',
      GRAVE_TRAP: 'RAISE_SKELETON',
      GRAVE_WARRIORS: 'RAISE_SKELETON',
      BRANDMARK_HEAL: 'EMBER_CULTIST',
      EMBERBIND: 'BRANDMARK_HEAL',
      CORRUPTED_QORK: 'EMBERBIND',
      EXPLODE: 'EMBER_CULTIST',
      LAVA_MOLD: 'EXPLODE',
      SPELL_REACH: 'ARCANE_STUDIES',
    };
    for (const [id, parent] of Object.entries(parents)) expect(byId(id).requires).toEqual([parent]);

    expect(getTechMagicPath('CRYSTAL_LIGHTNING')).toBe(MagicPath.CRYSTAL);
    expect(getTechMagicPath('RAISE_SKELETON')).toBe(MagicPath.NECRO);
    expect(getTechMagicPath('CORRUPTED_QORK')).toBe(MagicPath.EMBER);
    expect(getTechMagicPath('SPELL_REACH')).toBe(MagicPath.ARCANE);
    expect(getTechMagicPath('CONSCRIPTION')).toBeNull();
    expect(getTechMagicPath('ARCANE_AWAKENING')).toBeNull();
    expect(getTechTreeId('SPELL_REACH')).toBe(TechTreeId.ARCANE);

    for (const node of TECH_TREE) {
      if (node.requires.length === 0 || getTechTreeId(node.id) !== TechTreeId.ARCANE) continue;
      expect(node.cost).toBe(ARCANE_RESEARCH_COST_BY_DEPTH[getTechDepth(node.id) - 1]);
    }
  });

  it('starts with both roots and the Crystal Chamber, but no recruitable Mage', () => {
    const state = generateInitialGameState();
    expect(state.techNodes.CONSCRIPTION.unlocked).toBe(true);
    expect(state.techNodes.ARCANE_AWAKENING.unlocked).toBe(true);
    expect(state.unlockedBuildings).toContain(BuildingType.CRYSTAL_CHAMBER);
    expect(state.unlockedUnits).not.toContain(UnitType.MAGE);
  });

  it('unlocks shared Mage spells once and gates Spell Reach behind Arcane Studies', () => {
    const initial = generateInitialGameState();
    const withCrystals = { ...initial, arcaneCrystals: 10 };
    const first = produce(withCrystals, (draft) => unlockTech(draft, 'CRYSTAL_MAGE'));
    expect(first.unlockedUnits).toContain(UnitType.MAGE);
    expect(first.unlockedSpells).toEqual(expect.arrayContaining([SpellId.TRANSPOSE, SpellId.FROSTCRAFT]));

    const second = produce(first, (draft) => unlockTech(draft, 'NECROMANCER'));
    expect(second.unlockedUnits.filter((unit) => unit === UnitType.MAGE)).toHaveLength(1);
    expect(second.unlockedSpells.filter((spell) => spell === SpellId.TRANSPOSE)).toHaveLength(1);
    expect(second.unlockedSpells.filter((spell) => spell === SpellId.FROSTCRAFT)).toHaveLength(1);

    const beforeStudies = getAvailableTechs(second);
    expect(beforeStudies).not.toContain('SPELL_REACH');
    const studies = produce(second, (draft) => unlockTech(draft, 'ARCANE_STUDIES'));
    expect(getAvailableTechs(studies)).toContain('SPELL_REACH');
  });
});

describe('per-tree tech layouts', () => {
  it('places every node in its own tree with positive canvas dimensions', () => {
    for (const tree of [TechTreeId.SECULAR, TechTreeId.ARCANE]) {
      const nodes = TECH_TREE.filter((node) => getTechTreeId(node.id) === tree);
      const layout = computeTechTreeLayout(nodes);
      expect(Object.keys(layout.positions).sort()).toEqual(nodes.map((node) => node.id).sort());
      expect(layout.canvasW).toBeGreaterThan(0);
      expect(layout.canvasH).toBeGreaterThan(0);
      expect(Object.keys(layout.positions).some((id) => getTechTreeId(id) !== tree)).toBe(false);
    }
  });
});
