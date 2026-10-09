import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MAGE, BUILDING_DEFINITIONS, MAP, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { computeResearchCost } from '../../config/tech';
import { resolveAttack } from '../combatSystem';
import { computeUnitAiScores } from '../enemySystem';
import type { GameEvent } from '../gameEvents';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import {
  explainInvalidAttackTarget,
  getAttackTargets,
} from '../unitActions';
import { t } from '../i18n/i18n';
import { BuildingType, DestroyBehavior, Faction, SpellId, TileType, UnitTag, UnitType } from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';

let idCounter = 0;

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `taunt-unit-${++idCounter}`,
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
    tags: [...definition.tags, ...tags],
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
  } as Unit;
}

function makeTile(x: number, y: number): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status: null,
    hasCaveMonster: false,
  } as Tile;
}

function makeBuilding(position: Position): Building {
  const definition = BUILDING_DEFINITIONS[BuildingType.WATCHTOWER];
  return {
    id: `taunt-building-${++idCounter}`,
    type: BuildingType.WATCHTOWER,
    faction: Faction.PLAYER,
    position: { ...position },
    hp: definition.combatStats!.maxHp,
    maxHp: definition.combatStats!.maxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 0,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: { ...definition.combatStats! },
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

function makeState(units: Unit[], buildings: Building[] = []): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  const buildingMap = Object.fromEntries(buildings.map((building) => [building.id, building]));
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) grid[building.position.y][building.position.x].buildingId = building.id;

  return {
    turn: 1,
    phase: 'PLAYER_TURN',
    grid,
    units: unitMap,
    buildings: buildingMap,
    specialists: {},
    globalSpecialistStorage: [],
    resources: { iron: 0, wood: 0 },
    arcaneCrystals: 10,
    ember: 0,
    emberLevelSources: { turns: 0, emberlingSacrifices: 0, other: 0 },
    zonesUnlocked: [],
    techNodes: {},
    techFlags: [],
    unlockedBuildings: [],
    unlockedUnits: [],
    unlockedSpells: [SpellId.TAUNT],
    gameStats: {
      unitsKilled: 0,
      unitsLost: 0,
      damageDealt: 0,
      damageReceived: 0,
      unitsRecruited: 0,
      buildingsConstructed: 0,
      buildingsConverted: 0,
      techsUnlocked: 0,
      enemyBuildingsDestroyed: 0,
      enemyBuildingsCaptured: 0,
      buildingsDestroyedByEnemy: 0,
      buildingsCapturedByEnemy: 0,
      buildingsDestroyedByLava: 0,
    },
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    lavaFrontRow: 80,
    turnsUntilLavaAdvance: 99,
    selectedUnitId: null,
    selectedBuildingId: null,
    selectedTilePos: null,
    pendingHealerId: null,
    pendingSpellCast: null,
    pendingTransposeFirstUnitId: null,
    pendingBridgeBuilderId: null,
    pendingTrapSetterId: null,
    portals: {},
    seenHints: [],
    enemyUnitsSpawnedLastTurn: 0,
    difficulty: 'NORMAL',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
    gameOverCause: null,
    specialistSlotCap: 2,
    fortifiedGarrisonActive: false,
  } as unknown as GameState;
}

describe('Taunt registration and spell', () => {
  it('is a direct Arcane Awakening child costing four crystals and unlocks Taunt', () => {
    const node = TECH_TREE.find((tech) => tech.id === 'TAUNT');

    expect(node).toMatchObject({
      requires: ['ARCANE_AWAKENING'],
      cost: 4,
      effects: [{ type: 'UNLOCK_SPELL', spellId: SpellId.TAUNT }],
    });
    expect(computeResearchCost(node!.cost!, 0)).toBe(4);
  });

  it('targets any untaunted player unit in Mage range, including the Mage and special units', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const summon = makeUnit(UnitType.EMBER_DEMON, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const flying = makeUnit(UnitType.GARGOYLE, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.FLYING]);
    const khyron = makeUnit(UnitType.CRYSTAL_KHYRON, { x: 4, y: 5 });
    const alreadyTaunted = makeUnit(UnitType.GUARD, { x: 5, y: 4 }, Faction.PLAYER, [UnitTag.TAUNT]);
    const state = makeState([mage, summon, flying, khyron, alreadyTaunted]);

    expect(getValidSpellTargets(state, mage.id, SpellId.TAUNT)).toEqual(
      expect.arrayContaining([mage.position, summon.position, flying.position, khyron.position]),
    );
    expect(getValidSpellTargets(state, mage.id, SpellId.TAUNT)).not.toContainEqual(alreadyTaunted.position);
    expect(MAGE.SPELL_CAST_CRYSTAL_COST).toBe(1);
  });

  it('applies Taunt permanently and rejects a recast on the same unit with a curated reason', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const target = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const state = makeState([mage, target]);

    const afterCast = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.TAUNT, target.position)).toBe(true);
    });
    expect(afterCast.units[target.id].tags).toContain(UnitTag.TAUNT);
    expect(afterCast.units[target.id]).not.toHaveProperty('tauntDuration');

    expect(getValidSpellTargets(afterCast, mage.id, SpellId.TAUNT)).not.toContainEqual(target.position);
    expect(explainInvalidSpellTarget(afterCast, mage.id, SpellId.TAUNT, target.position))
      .toEqual({ key: 'reason.spell.tauntAlreadyTaunted' });
    expect(t(explainInvalidSpellTarget(afterCast, mage.id, SpellId.TAUNT, target.position)!))
      .toBe('Already taunted');
    const rejectedRecast = produce(afterCast, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.TAUNT, target.position)).toBe(false);
    });
    expect(rejectedRecast.units[target.id].tags).toContain(UnitTag.TAUNT);
  });
});

describe('Taunt attack targeting', () => {
  it('keeps hostile unit targets unrestricted when no legal Taunt target exists', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const hiddenTaunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.TAUNT]);
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, ordinary, hiddenTaunt]);
    state.grid[hiddenTaunt.position.y][hiddenTaunt.position.x].isRevealed = false;

    expect(getAttackTargets(attacker, state.units, state.buildings, state.grid, state))
      .toContain(`${ordinary.position.x},${ordinary.position.y}`);
  });

  it('excludes non-Taunt units while one legally attackable Taunt target is present', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const taunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.TAUNT]);
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, ordinary, taunt]);
    const targets = getAttackTargets(attacker, state.units, state.buildings, state.grid, state);

    expect(targets).toContain(`${taunt.position.x},${taunt.position.y}`);
    expect(targets).not.toContain(`${ordinary.position.x},${ordinary.position.y}`);
  });

  it('allows every legal Taunt target when several are in range', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const first = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.TAUNT]);
    const second = makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.TAUNT]);
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, first, second]);
    const targets = getAttackTargets(attacker, state.units, state.buildings, state.grid, state);

    expect(targets).toEqual(new Set([
      `${first.position.x},${first.position.y}`,
      `${second.position.x},${second.position.y}`,
    ]));
  });

  it('does not let an otherwise illegal in-range Taunt target constrain attacks', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const undergroundTaunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.TAUNT]);
    undergroundTaunt.tunnelState = 'UNDERGROUND';
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, ordinary, undergroundTaunt]);

    expect(getAttackTargets(attacker, state.units, state.buildings, state.grid, state))
      .toContain(`${ordinary.position.x},${ordinary.position.y}`);
  });

  it('keeps otherwise legal building attacks available in the presence of Taunt', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const taunt = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.TAUNT]);
    const building = makeBuilding({ x: 7, y: 5 });
    building.faction = Faction.PLAYER;
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, taunt], [building]);

    expect(getAttackTargets(attacker, state.units, state.buildings, state.grid, state))
      .toContain(`${building.position.x},${building.position.y}`);
  });

  it('makes enemy AI choose a legal Taunt unit instead of another player unit in range', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const taunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.TAUNT]);
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, ordinary, taunt]);
    state.specialists = {};

    const attackActions = computeUnitAiScores(state, attacker.id)
      .filter((action) => action.type === 'ATTACK_UNIT' || action.type === 'RANGED_ATTACK_UNIT');
    expect(attackActions.length).toBeGreaterThan(0);
    expect(attackActions.every((action) => action.targetUnitId === taunt.id)).toBe(true);
  });

  it('allows secondary Cleave damage when the primary target is taunted', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY, [UnitTag.CLEAVE]);
    const taunt = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.TAUNT]);
    const secondary = makeUnit(UnitType.GUARD, { x: 6, y: 6 });
    const state = makeState([attacker, taunt, secondary]);
    const startingHp = secondary.stats.currentHp;
    const events: GameEvent[] = [];

    const afterAttack = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, taunt.id, true, events);
    });

    expect(afterAttack.units[secondary.id].stats.currentHp).toBeLessThan(startingHp);
    expect(events.some((event) => event.type === 'CLEAVE_DAMAGE')).toBe(true);
  });

  it('returns the localized Taunt restriction reason for an otherwise legal invalid target', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const ordinary = makeUnit(UnitType.GUARD, { x: 6, y: 5 });
    const taunt = makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.PLAYER, [UnitTag.TAUNT]);
    attacker.stats.attackRange = 3;
    const state = makeState([attacker, ordinary, taunt]);

    expect(t(explainInvalidAttackTarget(
      attacker, state.units, state.grid, state, ordinary.position,
    )!)).toBe('Must attack Taunt');
  });
});
