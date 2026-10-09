import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MAGE, MAP, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { computeResearchCost } from '../../config/tech';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import {
  clearInfestedOnCreditedKill,
  processInfestedFactionTurn,
  resolveInfestedDeath,
} from '../infestedSystem';
import { t } from '../i18n/i18n';
import { Faction, SpellId, TileType, UnitTag, UnitType } from '../types';
import type { GameEvent } from '../gameEvents';
import type { GameState, Position, Tile, Unit } from '../types';

let idCounter = 0;

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `infested-unit-${++idCounter}`,
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

function makeState(units: Unit[]): GameState {
  const grid = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => makeTile(x, y)),
  );
  const unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  for (const unit of units) grid[unit.position.y][unit.position.x].unitId = unit.id;

  return {
    turn: 1,
    phase: 'PLAYER_TURN',
    grid,
    units: unitMap,
    buildings: {},
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
    unlockedSpells: [SpellId.LAVA_MOLD],
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
    lavaFrontRow: MAP.GRID_HEIGHT,
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

function removeUnit(state: GameState, unit: Unit): void {
  state.grid[unit.position.y][unit.position.x].unitId = null;
  delete state.units[unit.id];
}

describe('Lava Mold', () => {
  it('unlocks Lava Mold from Explode for seven Arcane Crystals', () => {
    const node = TECH_TREE.find((tech) => tech.id === 'LAVA_MOLD');
    expect(node).toMatchObject({
      requires: ['EXPLODE'],
      cost: 7,
      effects: [{ type: 'UNLOCK_SPELL', spellId: SpellId.LAVA_MOLD }],
    });
    expect(computeResearchCost(node!.cost!, 0)).toBe(7);
  });

  it('infects an enemy and persists its original Mage source', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const victim = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.ENEMY);
    const state = makeState([mage, victim]);

    expect(getValidSpellTargets(state, mage.id, SpellId.LAVA_MOLD)).toContainEqual(victim.position);
    const infectedState = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.LAVA_MOLD, victim.position)).toBe(true);
    });

    expect(infectedState.units[victim.id].tags).toContain(UnitTag.INFESTED);
    expect(infectedState.units[victim.id].infestedByMageId).toBe(mage.id);
    expect(JSON.parse(JSON.stringify(infectedState.units[victim.id])).infestedByMageId).toBe(mage.id);
  });

  it('rejects recasting on an Infested unit with localized feedback', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const victim = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.ENEMY, [UnitTag.INFESTED]);
    const state = makeState([mage, victim]);
    expect(getValidSpellTargets(state, mage.id, SpellId.LAVA_MOLD)).not.toContainEqual(victim.position);
    const reason = explainInvalidSpellTarget(state, mage.id, SpellId.LAVA_MOLD, victim.position);
    expect(reason).toEqual({ key: 'reason.spell.infestedAlready' });
    expect(t(reason!)).toBe('Already Infested');
  });

  it.each([Faction.PLAYER, Faction.ENEMY])('ticks Infested %s units at faction turn end', (faction) => {
    const victim = makeUnit(UnitType.GUARD, { x: 5, y: 5 }, faction, [UnitTag.INFESTED]);
    victim.stats.currentHp = 40;
    const state = makeState([victim]);
    const events: GameEvent[] = [];
    const result = produce(state, (draft) => processInfestedFactionTurn(draft, faction, events));

    expect(result.units[victim.id].stats.currentHp).toBe(30);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'TILE_DAMAGE',
      unitId: victim.id,
      amount: 10,
      damageSource: 'INFESTED',
    }));
  });

  it('kills from DoT and credits the original Mage', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const victim = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.ENEMY, [UnitTag.INFESTED]);
    victim.infestedByMageId = mage.id;
    victim.stats.currentHp = 10;
    const state = makeState([mage, victim]);
    const events: GameEvent[] = [];

    const result = produce(state, (draft) => processInfestedFactionTurn(draft, Faction.ENEMY, events));
    expect(result.units[victim.id]).toBeUndefined();
    expect(result.gameStats.unitsKilled).toBe(1);
    expect(result.units[mage.id].xp).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'UNIT_DEATH' && event.unitId === victim.id)).toBe(true);
  });

  it('bursts once, spreads across factions to all eight neighbors, and preserves source', () => {
    const source = makeUnit(UnitType.MAGE, { x: 2, y: 2 });
    const deceased = makeUnit(UnitType.GUARD, { x: 6, y: 6 }, Faction.ENEMY, [UnitTag.INFESTED]);
    deceased.infestedByMageId = source.id;
    const neighbors = [
      makeUnit(UnitType.GUARD, { x: 5, y: 5 }),
      makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.ENEMY),
      makeUnit(UnitType.GUARD, { x: 7, y: 5 }),
      makeUnit(UnitType.GUARD, { x: 5, y: 6 }, Faction.ENEMY),
      makeUnit(UnitType.GUARD, { x: 7, y: 6 }),
      makeUnit(UnitType.GUARD, { x: 5, y: 7 }, Faction.ENEMY),
      makeUnit(UnitType.GUARD, { x: 6, y: 7 }),
      makeUnit(UnitType.GUARD, { x: 7, y: 7 }, Faction.ENEMY),
      makeUnit(UnitType.GUARD, { x: 8, y: 8 }),
    ];
    const state = makeState([source, deceased, ...neighbors]);
    removeUnit(state, deceased);
    const events: GameEvent[] = [];

    const result = produce(state, (draft) => resolveInfestedDeath(draft, deceased, events));
    for (const neighbor of neighbors.slice(0, 8)) {
      expect(result.units[neighbor.id].tags).toContain(UnitTag.INFESTED);
      expect(result.units[neighbor.id].infestedByMageId).toBe(source.id);
    }
    expect(result.units[neighbors[8].id].tags).not.toContain(UnitTag.INFESTED);
    expect(MAGE.INFESTED_DEATH_BURST_DAMAGE).toBe(0);
  });

  it('ignores Defense for burst damage and resolves an already-infected chain death once', () => {
    const source = makeUnit(UnitType.MAGE, { x: 4, y: 4 });
    const first = makeUnit(UnitType.GUARD, { x: 5, y: 5 }, Faction.ENEMY, [UnitTag.INFESTED]);
    const second = makeUnit(UnitType.GUARD, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.INFESTED]);
    first.infestedByMageId = source.id;
    second.infestedByMageId = source.id;
    first.stats.currentHp = 1;
    second.stats.currentHp = 1;
    const state = makeState([source, first, second]);
    removeUnit(state, first);
    const damage = MAGE.INFESTED_DEATH_BURST_DAMAGE;
    const configurableMage = MAGE as unknown as { INFESTED_DEATH_BURST_DAMAGE: number };
    configurableMage.INFESTED_DEATH_BURST_DAMAGE = 2;
    const events: GameEvent[] = [];

    try {
      const result = produce(state, (draft) => resolveInfestedDeath(draft, first, events));
      expect(result.units[second.id]).toBeUndefined();
      expect(events.filter((event) => event.type === 'UNIT_DEATH' && event.unitId === second.id)).toHaveLength(1);
      expect(events.some((event) => event.type === 'TILE_DAMAGE' && event.unitId === second.id)).toBe(true);
    } finally {
      configurableMage.INFESTED_DEATH_BURST_DAMAGE = damage;
    }
  });

  it('clears infection and source when the Infested unit itself gets a credited kill', () => {
    const victim = makeUnit(UnitType.GUARD, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.INFESTED]);
    victim.infestedByMageId = 'original-mage';
    const state = makeState([victim]);

    const afterKill = produce(state, (draft) => {
      clearInfestedOnCreditedKill(draft, victim.id);
    });

    expect(afterKill.units[victim.id].tags).not.toContain(UnitTag.INFESTED);
    expect(afterKill.units[victim.id].infestedByMageId).toBeNull();
  });
});
