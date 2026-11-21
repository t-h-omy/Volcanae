import { beforeEach, describe, expect, it, vi } from 'vitest';
import { produce } from 'immer';
import { ANIMATION } from '../../config/animation';
import { MAGE, UNIT_DEFINITIONS } from '../gameConfig';
import { canUnitCast, castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { getRemainingActions } from '../unitActions';
import { generateInitialGameState } from '../mapGenerator';
import { useGameStore } from '../gameStore';
import { useCombatAnimationStore } from '../combatAnimationStore';
import { useShockwaveStore } from '../shockwaveStore';
import { BuildingType, Faction, GamePhase, SpellId, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Position, Unit } from '../types';

function makeUnit(
  id: string,
  type: UnitType,
  position: Position,
  tags: UnitTag[] = [],
  faction: Faction = Faction.PLAYER,
): Unit {
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
    isLava: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
  })));
  for (const unit of units) state.grid[unit.position.y][unit.position.x].unitId = unit.id;
  state.unlockedSpells = [SpellId.BLOOD_RUSH];
  state.arcaneCrystals = MAGE.SPELL_CAST_CRYSTAL_COST;
  return state;
}

function cast(state: GameState, target: Unit, recipients?: Position[]) {
  const mage = Object.values(state.units).find((unit) => unit.type === UnitType.EMBER_CULTIST)!;
  return produce(state, (draft) => {
    expect(castSpell(draft, mage.id, SpellId.BLOOD_RUSH, target.position, undefined, recipients)).toBe(true);
  });
}

beforeEach(() => {
  useCombatAnimationStore.setState({
    lineVfx: [],
    tileFlashes: new Map(),
    unitAnimations: new Map(),
    buildingAnimations: new Map(),
    projectiles: [],
    slideKillGhosts: new Map(),
    leashBurstPairs: [],
    cleaveVfxList: [],
    tileVfx: [],
  });
  useShockwaveStore.setState({ shockwaves: [] });
});

describe('getRemainingActions', () => {
  it('reports the five remaining action types from their action flags and capabilities', () => {
    const mage = makeUnit('mage', UnitType.CRYSTAL_MAGE, { x: 2, y: 2 });
    const built = makeUnit('built', UnitType.GUARD, { x: 3, y: 2 }, [UnitTag.BUILDANDCAPTURE]);
    const state = makeState([mage, built]);

    expect(getRemainingActions(state, built)).toEqual({
      move: true,
      attack: true,
      capture: true,
      construct: true,
      cast: false,
    });

    built.hasMovedThisTurn = true;
    expect(getRemainingActions(state, built)).toMatchObject({ move: false, attack: true });

    built.hasAttackedThisTurn = true;
    expect(getRemainingActions(state, built)).toMatchObject({
      move: false,
      attack: false,
      capture: true,
      construct: true,
    });

    const passive = makeUnit('passive', UnitType.GUARD, { x: 4, y: 2 }, [UnitTag.PASSIVE]);
    expect(getRemainingActions(state, passive).attack).toBe(false);

    const unskilled = makeUnit('unskilled', UnitType.GUARD, { x: 5, y: 2 });
    expect(getRemainingActions(state, unskilled)).toMatchObject({ capture: false, construct: false });

    const embalmed = makeUnit(
      'embalmed',
      UnitType.GUARD,
      { x: 6, y: 2 },
      [UnitTag.BUILDANDCAPTURE, UnitTag.EMBALMED],
    );
    expect(getRemainingActions(state, embalmed)).toMatchObject({ capture: false, construct: false });

    expect(getRemainingActions(state, mage).cast).toBe(true);
    mage.spellsCastThisTurn = MAGE.SPELLS_PER_TURN;
    expect(getRemainingActions(state, mage).cast).toBe(false);
  });
});

describe('Blood Rush', () => {
  it('restores only the sacrifice move that remains and affects all own neighboring units', () => {
    const caster = makeUnit('caster', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const sacrifice = makeUnit('sacrifice', UnitType.GUARD, { x: 5, y: 5 });
    sacrifice.hasAttackedThisTurn = true;
    const neighborPositions = [
      { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
      { x: 4, y: 5 }, { x: 6, y: 5 },
      { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 },
    ];
    const neighbors = neighborPositions.slice(1).map((position, index) =>
      makeUnit(`neighbor-${index}`, UnitType.GUARD, position),
    );
    const summoned = makeUnit('summoned', UnitType.EMBER_DEMON, { x: 6, y: 4 }, [UnitTag.SUMMONED]);
    const mech = makeUnit('mech', UnitType.CRYSTAL_KHYRON, { x: 4, y: 6 }, [UnitTag.MECH]);
    const enemy = makeUnit('enemy', UnitType.GUARD, { x: 4, y: 5 }, [], Faction.ENEMY);
    const outside = makeUnit('outside', UnitType.GUARD, { x: 7, y: 5 });
    const state = makeState([caster, sacrifice, ...neighbors, summoned, mech, enemy, outside]);
    caster.hasMovedThisTurn = true;
    for (const unit of [...neighbors, summoned, mech, outside]) {
      unit.hasMovedThisTurn = true;
      unit.hasAttackedThisTurn = true;
      unit.hasCapturedThisTurn = true;
      unit.hasConstructedThisTurn = true;
    }
    enemy.hasMovedThisTurn = true;

    const recipientPositions: Position[] = [];
    const after = cast(state, sacrifice, recipientPositions);

    expect(after.units[sacrifice.id]).toBeUndefined();
    expect(after.gameStats.unitsLost).toBe(state.gameStats.unitsLost + 1);
    expect(after.units[caster.id]).toMatchObject({
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
      hasCapturedThisTurn: false,
      hasConstructedThisTurn: false,
    });
    expect(after.units[neighbors[0].id]).toMatchObject({
      hasMovedThisTurn: false,
      hasAttackedThisTurn: true,
      hasCapturedThisTurn: true,
      hasConstructedThisTurn: true,
    });
    expect(after.units[summoned.id].hasMovedThisTurn).toBe(false);
    expect(after.units[mech.id].hasMovedThisTurn).toBe(false);
    expect(after.units[enemy.id].hasMovedThisTurn).toBe(true);
    expect(after.units[outside.id].hasMovedThisTurn).toBe(true);
    expect(recipientPositions).toHaveLength(7);
  });

  it('rejects the caster, Summoned and Mech units, and sacrifices with no actions', () => {
    const caster = makeUnit('caster', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const summoned = makeUnit('summoned', UnitType.GUARD, { x: 5, y: 4 }, [UnitTag.SUMMONED]);
    const mech = makeUnit('mech', UnitType.GUARD, { x: 5, y: 5 }, [UnitTag.MECH]);
    const spent = makeUnit('spent', UnitType.GUARD, { x: 4, y: 5 });
    spent.hasMovedThisTurn = true;
    spent.hasAttackedThisTurn = true;
    const state = makeState([caster, summoned, mech, spent]);

    expect(getValidSpellTargets(state, caster.id, SpellId.BLOOD_RUSH)).toEqual([]);
    expect(explainInvalidSpellTarget(state, caster.id, SpellId.BLOOD_RUSH, caster.position)?.key)
      .toBe('reason.spell.bloodRushSelf');
    expect(explainInvalidSpellTarget(state, caster.id, SpellId.BLOOD_RUSH, summoned.position)?.key)
      .toBe('reason.spell.bloodRushSummoned');
    expect(explainInvalidSpellTarget(state, caster.id, SpellId.BLOOD_RUSH, mech.position)?.key)
      .toBe('reason.spell.bloodRushMech');
    expect(explainInvalidSpellTarget(state, caster.id, SpellId.BLOOD_RUSH, spent.position)?.key)
      .toBe('reason.spell.bloodRushNoAction');
  });

  it('restores Mage casts, including after movement, and lets the caster receive the cast', () => {
    const caster = makeUnit('caster', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const sacrifice = makeUnit('sacrifice', UnitType.NECROMANCER, { x: 5, y: 5 });
    sacrifice.hasMovedThisTurn = true;
    sacrifice.hasAttackedThisTurn = true;
    const movedMage = makeUnit('moved-mage', UnitType.CRYSTAL_MAGE, { x: 6, y: 5 }, [UnitTag.PREP]);
    movedMage.hasMovedThisTurn = true;
    movedMage.spellsCastThisTurn = MAGE.SPELLS_PER_TURN;
    const otherMage = makeUnit('other-mage', UnitType.NECROMANCER, { x: 5, y: 4 });
    otherMage.spellsCastThisTurn = MAGE.SPELLS_PER_TURN;
    const state = makeState([caster, sacrifice, movedMage, otherMage]);
    const after = cast(state, sacrifice);

    expect(after.units[movedMage.id].spellsCastThisTurn).toBe(0);
    expect(after.units[movedMage.id].bloodRushCastReadyTurn).toBe(state.turn);
    expect(canUnitCast(after.units[movedMage.id], after)).toBe(true);
    expect(after.units[otherMage.id].spellsCastThisTurn).toBe(0);
    expect(after.units[caster.id].spellsCastThisTurn).toBe(0);
  });

  it('leaves a qualifying Gravestone without triggering a Brandmark Demon', () => {
    const caster = makeUnit('caster', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const sacrifice = makeUnit('sacrifice', UnitType.GUARD, { x: 5, y: 5 }, [
      UnitTag.LEAVES_GRAVESTONE,
      UnitTag.BRANDMARKED,
    ]);
    const state = makeState([caster, sacrifice]);
    state.grid[5][5].terrainType = TileType.PLAINS;
    const after = cast(state, sacrifice);
    const graveId = after.grid[5][5].buildingId;
    expect(graveId).toBeTruthy();
    expect(after.buildings[graveId!].type).toBe(BuildingType.GRAVESTONE);
    expect(after.buildings[graveId!].gravesUnitType).toBe(sacrifice.type);
    expect(Object.values(after.units).some((unit) => unit.type === UnitType.EMBER_DEMON)).toBe(false);
  });

  it('plays the Ember shockwave and staggered transfer lines with arrival flashes', () => {
    vi.useFakeTimers();
    const caster = makeUnit('caster', UnitType.EMBER_CULTIST, { x: 4, y: 4 });
    const sacrifice = makeUnit('sacrifice', UnitType.GUARD, { x: 5, y: 5 }, [UnitTag.LEAVES_GRAVESTONE]);
    sacrifice.hasAttackedThisTurn = true;
    const first = makeUnit('first', UnitType.GUARD, { x: 5, y: 4 });
    const second = makeUnit('second', UnitType.GUARD, { x: 6, y: 5 });
    const state = makeState([caster, sacrifice, first, second]);
    first.hasMovedThisTurn = true;
    second.hasMovedThisTurn = true;
    useGameStore.setState({
      ...state,
      pendingSpellCast: { mageId: caster.id, spellId: SpellId.BLOOD_RUSH },
    });

    useGameStore.getState().castSpell(sacrifice.position);

    const graveId = useGameStore.getState().grid[5][5].buildingId!;
    expect(useCombatAnimationStore.getState().buildingAnimations.get(graveId)).toBe('GRAVESTONE_RISE');
    expect(useShockwaveStore.getState().shockwaves).toEqual([
      expect.objectContaining({ variant: 'ember' }),
    ]);
    const lines = useCombatAnimationStore.getState().lineVfx
      .filter((line) => line.variant === 'BLOOD_RUSH');
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.variant)).toEqual(['BLOOD_RUSH', 'BLOOD_RUSH', 'BLOOD_RUSH']);
    expect(lines.map((line) => line.delayMs)).toEqual([
      0,
      ANIMATION.BLOOD_RUSH_LINE_STAGGER_MS,
      ANIMATION.BLOOD_RUSH_LINE_STAGGER_MS * 2,
    ]);
    expect(lines[0].fromPx).not.toEqual(lines[0].toPx);

    vi.advanceTimersByTime(ANIMATION.BLOOD_RUSH_LINE_MS + ANIMATION.BLOOD_RUSH_LINE_STAGGER_MS);
    expect(useCombatAnimationStore.getState().tileFlashes.get('5,4')).toMatchObject({
      durationMs: ANIMATION.BLOOD_RUSH_RECIPIENT_FLASH_MS,
      variant: 'ember',
    });
    vi.useRealTimers();
  });
});
