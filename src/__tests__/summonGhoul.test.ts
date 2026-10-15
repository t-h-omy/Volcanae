import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { GHOUL, MAGE, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { useGameStore } from '../gameStore';
import { canGrantXp, grantXp, usesGravestoneProgression, usesNonXpProgression } from '../levelSystem';
import { canUnitAttack, canUnitConsumeGravestone, canUnitMove, explainInvalidHealTarget, getHealTargets, isUnitDisplayExhausted } from '../unitActions';
import { resolveAttack, shouldLeaveGravestone } from '../combatSystem';
import { castSpell, getValidSpellTargets } from '../spellSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { moveUnit } from '../movementSystem';
import { runEnemyTurn } from '../enemySystem';
import { applyGhoulKillHeal } from '../ghoulSystem';
import { loadSlot, saveSlotStrict } from '../saveSystem';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  GamePhase,
  SpellId,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Unit } from '../types';

let nextId = 0;

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
  overrides: Partial<Unit> = {},
): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: `ghoul-unit-${++nextId}`,
    type,
    faction,
    position: { ...position },
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
    tags: [...def.tags, ...tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasConsumedGravestoneThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    ...overrides,
  };
}

function makeGravestone(position: Position, faction: Faction = Faction.PLAYER): Building {
  return {
    id: `ghoul-grave-${++nextId}`,
    type: BuildingType.GRAVESTONE,
    faction,
    position: { ...position },
    hp: 1,
    maxHp: 1,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 0,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(units: Unit[] = [], buildings: Building[] = []): GameState {
  const state = generateInitialGameState();
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
      tile.terrainType = TileType.PLAINS;
      tile.isRevealed = true;
    }
  }
  state.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  state.buildings = Object.fromEntries(buildings.map((building) => [building.id, building]));
  for (const unit of units) state.grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) state.grid[building.position.y][building.position.x].buildingId = building.id;
  state.phase = GamePhase.PLAYER_TURN;
  state.unlockedSpells = [SpellId.SUMMON_GHOUL];
  state.arcaneCrystals = 20;
  return state;
}

function gravestoneState(level = 1, hp?: number): { state: GameState; ghoul: Unit; grave: Building } {
  const position = { x: 5, y: 5 };
  const stats = [
    { maxHp: 70, attack: 30, defense: 30, moveRange: 1 },
    { maxHp: 140, attack: 55, defense: 45, moveRange: 2 },
    { maxHp: 200, attack: 75, defense: 55, moveRange: 3 },
  ][level - 1];
  const ghoul = makeUnit(UnitType.GHOUL, position, Faction.PLAYER, [UnitTag.SUMMONED], {
    level,
    stats: {
      ...UNIT_DEFINITIONS.GHOUL,
      currentHp: hp ?? stats.maxHp,
      ...stats,
      moveRange: stats.moveRange,
      attackRange: 1,
      discoverRadius: 1,
      triggerRange: 0,
      movementActions: 1,
    },
  });
  const grave = makeGravestone(position);
  return { state: makeState([ghoul], [grave]), ghoul, grave };
}

describe('Summon Ghoul', () => {
  beforeEach(() => {
    nextId = 0;
    globalThis.indexedDB = new IDBFactory();
  });

  it('registers the seven-crystal tech as a child of Raise Skeleton and unlocks the spell', () => {
    const raise = TECH_TREE.findIndex((node) => node.id === 'RAISE_SKELETON');
    const node = TECH_TREE.find((candidate) => candidate.id === 'SUMMON_GHOUL');
    expect(node?.requires).toEqual(['RAISE_SKELETON']);
    expect(node?.cost).toBe(7);
    expect(node?.effects).toEqual([{ type: 'UNLOCK_SPELL', spellId: SpellId.SUMMON_GHOUL }]);
    expect(TECH_TREE[raise + 1].id).toBe('SUMMON_GHOUL');
  });

  it('targets only empty player Gravestones in normal Mage range and summons a ready Ghoul', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const grave = makeGravestone({ x: 5, y: 5 });
    const enemyGrave = makeGravestone({ x: 6, y: 5 }, Faction.ENEMY);
    const occupiedGrave = makeGravestone({ x: 5, y: 6 });
    const occupant = makeUnit(UnitType.GUARD, { x: 5, y: 6 });
    const farGrave = makeGravestone({ x: 8, y: 5 });
    const state = makeState([mage, occupant], [grave, enemyGrave, occupiedGrave, farGrave]);

    expect(getValidSpellTargets(state, mage.id, SpellId.SUMMON_GHOUL)).toEqual([{ x: 5, y: 5 }]);
    let castSucceeded = false;
    const after = produce(state, (draft) => {
      castSucceeded = castSpell(draft, mage.id, SpellId.SUMMON_GHOUL, grave.position);
    });

    const ghoul = Object.values(after.units).find((unit) => unit.type === UnitType.GHOUL);
    expect(castSucceeded).toBe(true);
    expect(after.buildings[grave.id]).toBeUndefined();
    expect(after.grid[5][5].buildingId).toBeNull();
    expect(after.arcaneCrystals).toBe(20 - MAGE.SPELL_CAST_CRYSTAL_COST);
    expect(ghoul).toBeDefined();
    expect(ghoul?.position).toEqual(grave.position);
    expect(ghoul?.level).toBe(1);
    expect(ghoul?.stats).toMatchObject({
      maxHp: 70, currentHp: 70, attack: 30, defense: 30,
      moveRange: 1, attackRange: 1,
    });
    expect(ghoul?.tags).toContain(UnitTag.SUMMONED);
    expect(ghoul?.tags).toContain(UnitTag.READY);
    expect(ghoul?.hasMovedThisTurn).toBe(false);
    expect(ghoul?.hasAttackedThisTurn).toBe(false);
    expect(canUnitMove(ghoul!, after)).toBe(true);
    expect(canUnitAttack(ghoul!, after)).toBe(true);
  });

  it('applies active SUMMONED-source specialist tags to the new Ghoul', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const grave = makeGravestone({ x: 5, y: 5 });
    const state = makeState([mage], [grave]);
    state.specialists = createInitialSpecialists();
    state.globalSpecialistStorage = ['spec_13'];
    let castSucceeded = false;
    const after = produce(state, (draft) => {
      castSucceeded = castSpell(draft, mage.id, SpellId.SUMMON_GHOUL, grave.position);
    });
    const ghoul = Object.values(after.units).find((unit) => unit.type === UnitType.GHOUL);
    expect(castSucceeded).toBe(true);
    expect(ghoul?.tags).toContain(UnitTag.RAGE);
    expect(ghoul?.tags).toContain(UnitTag.CLEAVE);
  });

  it('prevents recasting on an occupied Gravestone and excludes non-player Gravestones', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const grave = makeGravestone({ x: 5, y: 5 }, Faction.ENEMY);
    const occupant = makeUnit(UnitType.GHOUL, grave.position);
    const state = makeState([mage, occupant], [grave]);
    expect(getValidSpellTargets(state, mage.id, SpellId.SUMMON_GHOUL)).toEqual([]);
    let castSucceeded = true;
    const after = produce(state, (draft) => {
      castSucceeded = castSpell(draft, mage.id, SpellId.SUMMON_GHOUL, grave.position);
    });
    expect(castSucceeded).toBe(false);
    expect(after.buildings[grave.id]).toBeDefined();
    expect(Object.values(after.units).filter((unit) => unit.type === UnitType.GHOUL)).toHaveLength(1);
  });

  it('does not bank generic XP or expose manual XP progression for Ghoul or Khyron', () => {
    const ghoul = makeUnit(UnitType.GHOUL, { x: 3, y: 4 });
    const state = makeState([ghoul]);
    expect(usesGravestoneProgression(UnitType.GHOUL)).toBe(true);
    expect(usesNonXpProgression(UnitType.GHOUL)).toBe(true);
    expect(usesNonXpProgression(UnitType.CRYSTAL_KHYRON)).toBe(true);
    expect(canGrantXp(UnitType.GHOUL, 0)).toBe(false);

    const after = produce(state, (draft) => grantXp(draft, ghoul.id, 50));
    expect(after.units[ghoul.id].xp).toBe(0);
    expect(after.units[ghoul.id].level).toBe(1);

    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 4, y: 4 }, Faction.ENEMY);
    useGameStore.setState(makeState([ghoul, enemy]));
    useGameStore.getState().applyEvent({
      type: 'PLAYER_ATTACK',
      attackerId: ghoul.id,
      defenderId: enemy.id,
      attackerPosition: ghoul.position,
      defenderPosition: enemy.position,
      attackerHpLost: 0,
      defenderHpLost: 0,
      advancedToPosition: null,
      attackerXpGained: 1,
    });
    expect(useGameStore.getState().units[ghoul.id].xp).toBe(0);

    useGameStore.setState({ units: { ...useGameStore.getState().units, [ghoul.id]: { ...ghoul, xp: 99 } } });
    useGameStore.getState().levelUpUnit(ghoul.id);
    expect(useGameStore.getState().units[ghoul.id].level).toBe(1);
    expect(UNIT_DEFINITIONS.GHOUL.levelUp).toHaveLength(GHOUL.MAX_LEVEL - 1);
  });

  it('offers Gravestone consumption to a player Ghoul that has moved but not otherwise acted', () => {
    const { state, ghoul } = gravestoneState();
    expect(canUnitConsumeGravestone(ghoul, state)).toBe(true);
    expect(canUnitConsumeGravestone({ ...ghoul, hasMovedThisTurn: true }, state)).toBe(true);
    expect(isUnitDisplayExhausted({ ...ghoul, hasMovedThisTurn: true }, state)).toBe(false);
    expect(canUnitConsumeGravestone({ ...ghoul, hasAttackedThisTurn: true }, state)).toBe(false);
    expect(canUnitConsumeGravestone({ ...ghoul, faction: Faction.ENEMY }, state)).toBe(false);
    expect(canUnitConsumeGravestone({ ...ghoul, type: UnitType.SKELETON }, state)).toBe(false);

    const enemyGraveState = makeState([ghoul], [makeGravestone(ghoul.position, Faction.ENEMY)]);
    expect(canUnitConsumeGravestone(ghoul, enemyGraveState)).toBe(false);
    expect(canUnitConsumeGravestone(ghoul, makeState([ghoul]))).toBe(false);
  });

  it('consumes a Gravestone to reach level 2 with exact stats, a full heal, and an ended action', () => {
    const { state, ghoul, grave } = gravestoneState(1, 5);
    useGameStore.setState(state);
    useGameStore.getState().consumeGravestone(ghoul.id);
    const next = useGameStore.getState();
    const updated = next.units[ghoul.id];

    expect(next.buildings[grave.id]).toBeUndefined();
    expect(next.grid[ghoul.position.y][ghoul.position.x].buildingId).toBeNull();
    expect(updated).toMatchObject({
      level: 2,
      hasConsumedGravestoneThisTurn: true,
      stats: { maxHp: 140, currentHp: 140, attack: 55, defense: 45, moveRange: 2 },
    });
    expect(canUnitConsumeGravestone(updated, next)).toBe(false);
    expect(canUnitMove(updated, next)).toBe(false);
    expect(canUnitAttack(updated, next)).toBe(false);
  });

  it('consumes a Gravestone to reach level 3 with exact stats and a full heal', () => {
    const { state, ghoul } = gravestoneState(2, 20);
    useGameStore.setState(state);
    useGameStore.getState().consumeGravestone(ghoul.id);
    expect(useGameStore.getState().units[ghoul.id]).toMatchObject({
      level: 3,
      stats: { maxHp: 200, currentHp: 200, attack: 75, defense: 55, moveRange: 3 },
    });
  });

  it('allows a Ghoul to move onto a Gravestone and consume it afterward', () => {
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const grave = makeGravestone({ x: 6, y: 5 });
    const state = makeState([ghoul], [grave]);
    const moved = produce(state, (draft) => moveUnit(draft, ghoul.id, grave.position));

    expect(moved.units[ghoul.id].hasMovedThisTurn).toBe(true);
    expect(moved.units[ghoul.id].position).toEqual(grave.position);
    expect(canUnitConsumeGravestone(moved.units[ghoul.id], moved)).toBe(true);

    useGameStore.setState(moved);
    useGameStore.getState().consumeGravestone(ghoul.id);
    const consumed = useGameStore.getState();
    expect(consumed.buildings[grave.id]).toBeUndefined();
    expect(consumed.units[ghoul.id]).toMatchObject({
      level: 2,
      hasMovedThisTurn: true,
      hasConsumedGravestoneThisTurn: true,
      stats: { moveRange: 2 },
    });
    expect(canUnitMove(consumed.units[ghoul.id], consumed)).toBe(false);
    expect(canUnitAttack(consumed.units[ghoul.id], consumed)).toBe(false);
  });

  it('heals a living Ghoul for half the victim HP before its lethal hit, rounded down and capped', () => {
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 5 }, Faction.PLAYER, [], {
      stats: { ...UNIT_DEFINITIONS.GHOUL, currentHp: 66 },
    });
    const state = makeState([ghoul]);
    const events: import('../gameEvents').GameEvent[] = [];

    const result = produce(state, (draft) => {
      expect(applyGhoulKillHeal(draft, ghoul.id, 11, events)).toBe(4);
    });
    expect(result.units[ghoul.id].stats.currentHp).toBe(70);
    expect(events).toEqual([{
      type: 'UNIT_HEAL',
      unitId: ghoul.id,
      position: ghoul.position,
      amount: 4,
    }]);
    expect(produce(result, (draft) => {
      expect(applyGhoulKillHeal(draft, ghoul.id, 1, events)).toBe(0);
    }).units[ghoul.id].stats.currentHp).toBe(70);

    const deadGhoul = { ...ghoul, stats: { ...ghoul.stats, currentHp: 0 } };
    const deadState = makeState([deadGhoul]);
    const stillDead = produce(deadState, (draft) => {
      applyGhoulKillHeal(draft, ghoul.id, 100, events);
    });
    expect(stillDead.units[ghoul.id].stats.currentHp).toBe(0);

    const nonGhoul = makeUnit(UnitType.GUARD, { x: 4, y: 5 }, Faction.PLAYER, [], {
      stats: { ...UNIT_DEFINITIONS.GUARD, currentHp: 20 },
    });
    const nonGhoulState = makeState([nonGhoul]);
    const unchanged = produce(nonGhoulState, (draft) => {
      expect(applyGhoulKillHeal(draft, nonGhoul.id, 100, events)).toBe(0);
    });
    expect(unchanged.units[nonGhoul.id].stats.currentHp).toBe(20);
  });

  it('heals for a primary attack kill using the victim HP before the hit', () => {
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 5 }, Faction.PLAYER, [], {
      stats: { ...UNIT_DEFINITIONS.GHOUL, currentHp: 50 },
    });
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY, [], {
      stats: { ...UNIT_DEFINITIONS.LAVA_GRUNT, currentHp: 11, defense: 0 },
    });
    const events: import('../gameEvents').GameEvent[] = [];
    const result = produce(makeState([ghoul, enemy]), (draft) => {
      resolveAttack(draft, ghoul.id, enemy.id, true, events);
    });

    expect(result.units[enemy.id]).toBeUndefined();
    expect(result.units[ghoul.id].stats.currentHp).toBe(55);
    expect(result.units[ghoul.id].position).toEqual(enemy.position);
    expect(events).toContainEqual({
      type: 'UNIT_HEAL',
      unitId: ghoul.id,
      position: enemy.position,
      amount: 5,
    });
  });

  it('heals for each Cleave secondary kill using that victim HP before the hit', () => {
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.CLEAVE], {
      stats: { ...UNIT_DEFINITIONS.GHOUL, currentHp: 30 },
    });
    const primary = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY, [], {
      stats: { ...UNIT_DEFINITIONS.LAVA_GRUNT, currentHp: 1, defense: 0 },
    });
    const secondary = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 6 }, Faction.ENEMY, [], {
      stats: { ...UNIT_DEFINITIONS.LAVA_GRUNT, currentHp: 9, defense: 0 },
    });
    const state = makeState([ghoul, primary, secondary]);
    const events: import('../gameEvents').GameEvent[] = [];

    const result = produce(state, (draft) => {
      resolveAttack(draft, ghoul.id, primary.id, true, events);
    });

    expect(result.units[ghoul.id].stats.currentHp).toBe(34);
    expect(result.units[primary.id]).toBeUndefined();
    expect(result.units[secondary.id]).toBeUndefined();
    const deathIndex = events.findIndex((event) => event.type === 'UNIT_DEATH' && event.unitId === secondary.id);
    const healIndex = events.findIndex((event) => event.type === 'UNIT_HEAL' && event.unitId === ghoul.id);
    expect(healIndex).toBeGreaterThan(deathIndex);
    expect(events[healIndex]).toMatchObject({ amount: 4 });
  });

  it('does not heal a Ghoul for enemy kills caused by Explode', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 4, y: 5 });
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.SUMMONED], {
      stats: { ...UNIT_DEFINITIONS.GHOUL, currentHp: 30 },
    });
    const sacrifice = makeUnit(UnitType.GUARD, { x: 5, y: 5 });
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY, [], {
      stats: { ...UNIT_DEFINITIONS.LAVA_GRUNT, currentHp: 1 },
    });
    const state = makeState([mage, ghoul, sacrifice, enemy]);
    state.unlockedSpells.push(SpellId.EXPLODE);

    const exploded = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.EXPLODE, sacrifice.position);
    });
    expect(exploded.units[enemy.id]).toBeUndefined();
    expect(exploded.units[ghoul.id].stats.currentHp).toBe(30);
  });

  it('heals after a Ghoul counter-kills an attacker during enemy-turn replay', () => {
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED], {
      stats: { ...UNIT_DEFINITIONS.GHOUL, currentHp: 40 },
    });
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY, [], {
      stats: { ...UNIT_DEFINITIONS.LAVA_GRUNT, currentHp: 10, attack: 1, defense: 0 },
      hasMovedThisTurn: true,
    });
    const { finalState, events } = runEnemyTurn(makeState([ghoul, enemy]));

    expect(finalState.units[enemy.id]).toBeUndefined();
    expect(finalState.units[ghoul.id].stats.currentHp).toBeGreaterThan(40);
    const deathIndex = events.findIndex((event) => event.type === 'UNIT_DEATH' && event.unitId === enemy.id);
    const healIndex = events.findIndex((event) => event.type === 'UNIT_HEAL' && event.unitId === ghoul.id);
    expect(healIndex).toBeGreaterThan(deathIndex);
    expect(events[healIndex]).toMatchObject({ amount: 5 });
  });

  it('consumes a Gravestone at level 3 for a full heal without changing stats or level', () => {
    const { state, ghoul } = gravestoneState(3, 10);
    const before = { ...ghoul.stats };
    useGameStore.setState(state);
    useGameStore.getState().consumeGravestone(ghoul.id);
    expect(useGameStore.getState().units[ghoul.id]).toMatchObject({
      level: 3,
      stats: { ...before, currentHp: before.maxHp },
      hasConsumedGravestoneThisTurn: true,
    });
  });

  it('keeps generic healing restrictions and prevents summoned Ghouls from leaving Gravestones', () => {
    const healer = makeUnit(UnitType.SCOUT, { x: 4, y: 5 }, Faction.PLAYER, [UnitTag.PATCHUP]);
    const ghoul = makeUnit(UnitType.GHOUL, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED], {
      stats: { ...UNIT_DEFINITIONS.GHOUL, currentHp: 20 },
    });
    const state = makeState([healer, ghoul]);
    expect(getHealTargets(state, healer.id)).not.toContain(ghoul.id);
    expect(explainInvalidHealTarget(state, healer.id, ghoul.position)).toEqual({ key: 'reason.heal.summoned' });
    expect(shouldLeaveGravestone(ghoul, { defaultOn: true })).toBe(false);

    const { state: actionState, ghoul: actionGhoul } = gravestoneState(1, 20);
    useGameStore.setState(actionState);
    useGameStore.getState().consumeGravestone(actionGhoul.id);
    expect(useGameStore.getState().units[actionGhoul.id].stats.currentHp).toBe(140);
  });

  it('preserves Ghoul level, stats, and action state through a save round-trip', async () => {
    const { state, ghoul } = gravestoneState(2, 80);
    ghoul.stats = { ...ghoul.stats, maxHp: 140, currentHp: 80, attack: 60, defense: 45 };
    ghoul.hasConsumedGravestoneThisTurn = true;
    await saveSlotStrict({ id: 'ghoul-save', name: 'Ghoul save', state });
    const loaded = await loadSlot('ghoul-save');
    expect(loaded?.units[ghoul.id]).toMatchObject({
      level: 2,
      hasConsumedGravestoneThisTurn: true,
      stats: { maxHp: 140, currentHp: 80, attack: 60, defense: 45 },
    });
  });
});
