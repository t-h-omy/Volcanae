import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANIMATION } from '../../config/animation';
import { useAnimationStore } from '../animationStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { createGravestoneAt } from '../combatSystem';
import { UNIT_DEFINITIONS } from '../gameConfig';
import { useGameStore } from '../gameStore';
import { generateInitialGameState } from '../mapGenerator';
import { BuildingType, Faction, SpellId, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Unit } from '../types';

const position = { x: 5, y: 5 };
const unitId = 'rise-test-unit';

beforeEach(() => {
  vi.useFakeTimers();
  const initial = generateInitialGameState();
  const base = Object.values(initial.units).find((unit) => unit.faction === Faction.PLAYER)!;
  const unit: Unit = {
    ...base,
    id: unitId,
    type: UnitType.SWORDSMAN,
    faction: Faction.PLAYER,
    position,
    tags: [UnitTag.LEAVES_GRAVESTONE],
  };
  useGameStore.setState({
    ...initial,
    units: { [unitId]: unit },
    buildings: {},
    portals: {},
    grid: initial.grid.map((row, y) => row.map((tile, x) => ({
      ...tile,
      isRevealed: true,
      unitId: x === position.x && y === position.y ? unitId : null,
      buildingId: null,
      terrainType: TileType.PLAINS,
      isLava: false,
      isLavaPreview: false,
      isRuin: false,
      isStrongholdRuin: false,
      status: null,
    }))),
  });
  useAnimationStore.setState({ eventQueue: [], resolvedState: null, processingRevision: null });
  useCombatAnimationStore.setState({ buildingAnimations: new Map() });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Gravestone appearance', () => {
  it('returns the new ID for a valid tile and null for invalid tiles', () => {
    const state = useGameStore.getState();
    let id: string | null = null;
    let invalid: string | null = null;
    const result = produce(state, (draft) => {
      draft.grid[position.y][position.x].unitId = null;
      id = createGravestoneAt(draft, position, UnitType.SWORDSMAN);
      invalid = createGravestoneAt(draft, position, UnitType.SWORDSMAN);
    });
    expect(id).not.toBeNull();
    expect(result.grid[position.y][position.x].buildingId).toBe(id);
    expect(result.buildings[id!].type).toBe(BuildingType.GRAVESTONE);
    expect(invalid).toBeNull();
  });

  it.each([false, true])('handles death presentation with silent set to %s', (silent) => {
    useGameStore.getState().applyEvent({ type: 'UNIT_DEATH', unitId, position, faction: Faction.PLAYER }, { silent });
    const id = useGameStore.getState().grid[position.y][position.x].buildingId!;
    expect(useGameStore.getState().buildings[id].type).toBe(BuildingType.GRAVESTONE);
    expect(useCombatAnimationStore.getState().buildingAnimations.get(id))
      .toBe(silent ? undefined : 'GRAVESTONE_RISE');
    vi.advanceTimersByTime(ANIMATION.GRAVESTONE_RISE_MS);
    expect(useCombatAnimationStore.getState().buildingAnimations.has(id)).toBe(false);
  });

  it('does not animate a grave on a hidden tile', () => {
    useGameStore.setState((draft) => {
      draft.grid[position.y][position.x].isRevealed = false;
    });
    useGameStore.getState().applyEvent({ type: 'UNIT_DEATH', unitId, position, faction: Faction.PLAYER });
    const id = useGameStore.getState().grid[position.y][position.x].buildingId!;
    expect(useGameStore.getState().buildings[id]?.type).toBe(BuildingType.GRAVESTONE);
    expect(useCombatAnimationStore.getState().buildingAnimations.has(id)).toBe(false);
  });

  it('does not clear a replacement animation when the rise timer expires', () => {
    useGameStore.getState().applyEvent({ type: 'UNIT_DEATH', unitId, position, faction: Faction.PLAYER });
    const id = useGameStore.getState().grid[position.y][position.x].buildingId!;
    useCombatAnimationStore.getState().setBuildingAnimation(id, 'SANCTUM_SHATTER');
    vi.advanceTimersByTime(ANIMATION.GRAVESTONE_RISE_MS);
    expect(useCombatAnimationStore.getState().buildingAnimations.get(id)).toBe('SANCTUM_SHATTER');
  });

  it('keeps the effect on the resolved grave when its ID differs', () => {
    const before = useGameStore.getState();
    const resolved = produce(before, (draft) => {
      draft.grid[position.y][position.x].unitId = null;
      delete draft.units[unitId];
      createGravestoneAt(draft, position, UnitType.SWORDSMAN);
    }) as GameState;
    const resolvedId = resolved.grid[position.y][position.x].buildingId!;
    useAnimationStore.setState({ resolvedState: resolved });
    useGameStore.getState().applyEvent({ type: 'UNIT_DEATH', unitId, position, faction: Faction.PLAYER });
    expect(useCombatAnimationStore.getState().buildingAnimations.get(resolvedId)).toBe('GRAVESTONE_RISE');
    useGameStore.getState().setGameState(resolved);
    expect(useCombatAnimationStore.getState().buildingAnimations.get(resolvedId)).toBe('GRAVESTONE_RISE');
    vi.advanceTimersByTime(ANIMATION.GRAVESTONE_RISE_MS);
    expect(useCombatAnimationStore.getState().buildingAnimations.has(resolvedId)).toBe(false);
  });

  it('animates the Gravestone created by a successful Explode', () => {
    const state = useGameStore.getState();
    const def = UNIT_DEFINITIONS[UnitType.EMBER_CULTIST];
    const mage: Unit = {
      ...state.units[unitId],
      id: 'rise-test-mage',
      type: UnitType.EMBER_CULTIST,
      position: { x: position.x - 1, y: position.y },
      tags: [...def.tags],
      spellsCastThisTurn: 0,
    };
    useGameStore.setState((draft) => {
      draft.units[mage.id] = mage;
      draft.grid[mage.position.y][mage.position.x].unitId = mage.id;
      draft.pendingSpellCast = { mageId: mage.id, spellId: SpellId.EXPLODE };
      draft.unlockedSpells = [SpellId.EXPLODE];
      draft.arcaneCrystals = 100;
    });
    useGameStore.getState().castSpell(position);
    const id = useGameStore.getState().grid[position.y][position.x].buildingId!;
    expect(useGameStore.getState().buildings[id]?.type).toBe(BuildingType.GRAVESTONE);
    expect(useGameStore.getState().units[unitId]).toBeUndefined();
    expect(useCombatAnimationStore.getState().unitAnimations.has(unitId)).toBe(false);
    expect(useCombatAnimationStore.getState().slideKillGhosts.has(unitId)).toBe(false);
    expect(useCombatAnimationStore.getState().buildingAnimations.get(id)).toBe('GRAVESTONE_RISE');
  });

  it('animates other Gravestones created by an Explode death chain', () => {
    const state = useGameStore.getState();
    const def = UNIT_DEFINITIONS[UnitType.EMBER_CULTIST];
    const mage: Unit = {
      ...state.units[unitId],
      id: 'rise-test-mage',
      type: UnitType.EMBER_CULTIST,
      position: { x: position.x - 1, y: position.y },
      tags: [...def.tags],
      spellsCastThisTurn: 0,
    };
    const victim: Unit = {
      ...state.units[unitId],
      id: 'rise-test-victim',
      position: { x: position.x + 1, y: position.y },
      stats: { ...state.units[unitId].stats, currentHp: 1 },
    };
    useGameStore.setState((draft) => {
      draft.units[unitId].type = UnitType.CORRUPTED_QORK;
      draft.units[mage.id] = mage;
      draft.units[victim.id] = victim;
      draft.grid[mage.position.y][mage.position.x].unitId = mage.id;
      draft.grid[victim.position.y][victim.position.x].unitId = victim.id;
      draft.pendingSpellCast = { mageId: mage.id, spellId: SpellId.EXPLODE };
      draft.unlockedSpells = [SpellId.EXPLODE];
      draft.arcaneCrystals = 100;
    });
    useGameStore.getState().castSpell(position);
    for (const pos of [position, victim.position]) {
      const id = useGameStore.getState().grid[pos.y][pos.x].buildingId!;
      expect(useGameStore.getState().buildings[id]?.type).toBe(BuildingType.GRAVESTONE);
      expect(useCombatAnimationStore.getState().buildingAnimations.get(id)).toBe('GRAVESTONE_RISE');
    }
  });
});
