import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { CRYSTAL_CHAMBER_CONFIG, UNIT_DEFINITIONS } from '../gameConfig';
import { collectResources } from '../resourceSystem';
import { generateInitialGameState } from '../mapGenerator';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  TechFlag,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Unit } from '../types';

let id = 0;

function makeUnit(
  type: UnitType,
  position: Position,
  overrides: Partial<Unit> = {},
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `chamber-heal-unit-${++id}`,
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
    tags: [...definition.tags],
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
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
    ...overrides,
  };
}

function makeBuilding(
  type: BuildingType,
  position: Position,
  resonanceTurnsRemaining: number,
  faction: Faction = Faction.PLAYER,
): Building {
  return {
    id: `chamber-heal-building-${++id}`,
    type,
    faction,
    position: { ...position },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 2,
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
    resonanceTurnsRemaining,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    resonanceCrystalBonus: false,
  };
}

function makeState(
  units: Unit[],
  buildings: Building[],
  withTech = true,
): GameState {
  const state = generateInitialGameState();
  return produce(state, (draft) => {
    draft.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
    draft.buildings = Object.fromEntries(buildings.map((building) => [building.id, building]));
    draft.techFlags = withTech ? [TechFlag.CHAMBER_HEALING] : [];
  });
}

function collect(state: GameState) {
  const events: import('../gameEvents').GameEvent[] = [];
  const collected = produce(state, (draft) => collectResources(draft, events));
  return { collected, events };
}

describe('Chamber Healing', () => {
  it('heals at range one including diagonals and the Chamber tile, but not range two', () => {
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 10, y: 10 }, 1);
    const sameTile = makeUnit(UnitType.SWORDSMAN, { x: 10, y: 10 });
    const diagonal = makeUnit(UnitType.ARCHER, { x: 11, y: 11 });
    const rangeTwo = makeUnit(UnitType.SPEARMAN, { x: 12, y: 10 });
    for (const unit of [sameTile, diagonal, rangeTwo]) {
      unit.stats.currentHp -= CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT;
    }

    const { collected, events } = collect(makeState([sameTile, diagonal, rangeTwo], [chamber]));

    expect(collected.units[sameTile.id].stats.currentHp).toBe(
      sameTile.stats.currentHp + CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT,
    );
    expect(collected.units[diagonal.id].stats.currentHp).toBe(
      diagonal.stats.currentHp + CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT,
    );
    expect(collected.units[rangeTwo.id].stats.currentHp).toBe(rangeTwo.stats.currentHp);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'CHAMBER_HEALING',
      chambers: [{ buildingId: chamber.id, position: chamber.position }],
      heals: expect.arrayContaining([
        { unitId: sameTile.id, position: sameTile.position, amount: CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT },
        { unitId: diagonal.id, position: diagonal.position, amount: CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT },
      ]),
    });
  });

  it('skips Summoned, Mech, enemy, and full-health units, and caps healing', () => {
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 10, y: 10 }, 1);
    const summoned = makeUnit(UnitType.SKELETON, { x: 10, y: 11 }, { tags: [UnitTag.SUMMONED] });
    const mech = makeUnit(UnitType.CRYSTAL_KHYRON, { x: 11, y: 10 });
    const enemy = makeUnit(UnitType.SWORDSMAN, { x: 9, y: 10 }, { faction: Faction.ENEMY });
    const full = makeUnit(UnitType.ARCHER, { x: 10, y: 9 });
    const almostFull = makeUnit(UnitType.SPEARMAN, { x: 11, y: 11 });
    for (const unit of [summoned, mech, enemy]) unit.stats.currentHp -= 20;
    almostFull.stats.currentHp -= 3;

    const { collected, events } = collect(
      makeState([summoned, mech, enemy, full, almostFull], [chamber]),
    );

    for (const unit of [summoned, mech, enemy, full]) {
      expect(collected.units[unit.id].stats.currentHp).toBe(unit.stats.currentHp);
    }
    expect(collected.units[almostFull.id].stats.currentHp).toBe(almostFull.stats.maxHp);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'CHAMBER_HEALING',
      heals: [{ unitId: almostFull.id, amount: 3 }],
    });
  });

  it('heals once when a unit is in range of multiple resonating Chambers', () => {
    const first = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 9, y: 10 }, 2);
    const second = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 11, y: 10 }, 2);
    const unit = makeUnit(UnitType.SWORDSMAN, { x: 10, y: 10 });
    unit.stats.currentHp -= 20;

    const { collected, events } = collect(makeState([unit], [first, second]));

    expect(collected.units[unit.id].stats.currentHp).toBe(
      unit.stats.currentHp + CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'CHAMBER_HEALING',
      chambers: expect.arrayContaining([
        { buildingId: first.id, position: first.position },
        { buildingId: second.id, position: second.position },
      ]),
      heals: [{ unitId: unit.id, amount: CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT }],
    });
  });

  it('does not heal from a Crystal Cave or without the tech', () => {
    const cave = makeBuilding(BuildingType.CRYSTAL_CAVE, { x: 10, y: 10 }, 2);
    const unit = makeUnit(UnitType.SWORDSMAN, { x: 10, y: 11 });
    unit.stats.currentHp -= 20;
    const withCave = collect(makeState([unit], [cave]));
    expect(withCave.collected.units[unit.id].stats.currentHp).toBe(unit.stats.currentHp);
    expect(withCave.events).toEqual([]);

    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 10, y: 10 }, 2);
    const withoutTech = collect(makeState([unit], [chamber], false));
    expect(withoutTech.collected.units[unit.id].stats.currentHp).toBe(unit.stats.currentHp);
    expect(withoutTech.events).toEqual([]);
  });

  it('heals once per resonating turn, including the final tick, then stops', () => {
    const chamber = makeBuilding(
      BuildingType.CRYSTAL_CHAMBER,
      { x: 10, y: 10 },
      CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
    );
    const unit = makeUnit(UnitType.SWORDSMAN, { x: 10, y: 10 });
    unit.stats.currentHp -= CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT
      * CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION;
    let state = makeState([unit], [chamber]);
    const events: import('../gameEvents').GameEvent[] = [];

    for (let tick = 0; tick < CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION; tick += 1) {
      const collected = produce(state, (draft) => collectResources(draft, events));
      state = collected;
      expect(state.units[unit.id].stats.currentHp).toBe(
        unit.stats.currentHp
        + CRYSTAL_CHAMBER_CONFIG.CHAMBER_HEALING_AMOUNT * (tick + 1),
      );
    }
    const afterResonance = collect(state);

    expect(events).toHaveLength(CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION);
    expect(state.buildings[chamber.id].resonanceTurnsRemaining).toBe(0);
    expect(afterResonance.events).toEqual([]);
    expect(afterResonance.collected.units[unit.id].stats.currentHp).toBe(unit.stats.maxHp);
  });

  it('emits no event when every eligible unit is already at full health', () => {
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 10, y: 10 }, 1);
    const unit = makeUnit(UnitType.SWORDSMAN, { x: 10, y: 11 });
    const { events } = collect(makeState([unit], [chamber]));

    expect(events).toEqual([]);
  });
});
