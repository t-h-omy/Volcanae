import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { MAGE, MAP, TECH_TREE, UNIT_DEFINITIONS } from '../gameConfig';
import { computeResearchCost } from '../../config/tech';
import { SPELL_DEFINITIONS } from '../../config/magic';
import { applyUnitDamage } from '../unitDamage';
import { resolveAttack, resolveBuildingAttack, calculateCombat } from '../combatSystem';
import { canUnitMove, getMovableTiles, canUnitAttack, canUnitCapture } from '../unitActions';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { processTileStatusEndOfTurn } from '../tileStatusSystem';
import { generateInitialGameState } from '../mapGenerator';
import { loadSlot, saveSlotStrict } from '../saveSystem';
import { t } from '../i18n/i18n';
import {
  BuildingType,
  DestroyBehavior,
  Faction,
  SpellId,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Tile, Unit } from '../types';

let idCounter = 0;

function makeUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [],
  overrides: Partial<Unit> = {},
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `stone-skin-unit-${++idCounter}`,
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
    ...overrides,
  };
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
  } as Tile;
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
    unlockedSpells: [SpellId.STONE_SKIN, SpellId.TRANSPOSE],
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
    difficulty: 'STANDARD',
    zoneLockoutUntilTurn: {},
    spawnFreezeUntilTurn: 0,
    lavaFreezeUntilTurn: 0,
  } as unknown as GameState;
}

function stoneSkinUnit(
  type: UnitType,
  position: Position,
  faction: Faction = Faction.PLAYER,
  extraTags: UnitTag[] = [],
): Unit {
  return makeUnit(type, position, faction, [UnitTag.STONE_SKIN, ...extraTags], {
    stoneSkinHp: MAGE.STONE_SKIN_HP,
  });
}

function makeBuilding(position: Position, faction: Faction): Building {
  return {
    id: `stone-skin-building-${++idCounter}`,
    type: BuildingType.WATCHTOWER,
    faction,
    position: { ...position },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: 0,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: { attack: 30, defense: 20, attackRange: 2 },
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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('Stone Skin tech and spell', () => {
  it('is a 7-crystal child of Taunt that unlocks the spell', () => {
    const node = TECH_TREE.find((tech) => tech.id === 'STONE_SKIN');

    expect(node?.requires).toEqual(['TAUNT']);
    expect(node?.cost).toBe(7);
    expect(computeResearchCost(node!.cost!, 0)).toBe(7);
    expect(node?.effects).toEqual([{ type: 'UNLOCK_SPELL', spellId: SpellId.STONE_SKIN }]);
    expect(SPELL_DEFINITIONS[SpellId.STONE_SKIN].textParams).toEqual({ stoneHp: MAGE.STONE_SKIN_HP });
    expect(MAGE.STONE_SKIN_HP).toBe(50);
  });

  it('allows self, summoned, flying, Khyron, and other player units, then grants 50 Stone HP', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const summoned = makeUnit(UnitType.EMBER_DEMON, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const flyer = makeUnit(UnitType.GARGOYLE, { x: 5, y: 6 });
    const khyron = makeUnit(UnitType.CRYSTAL_KHYRON, { x: 6, y: 6 });
    const state = makeState([mage, summoned, flyer, khyron]);
    const targets = getValidSpellTargets(state, mage.id, SpellId.STONE_SKIN);

    expect(targets).toEqual(expect.arrayContaining([mage.position, summoned.position, flyer.position, khyron.position]));
    const afterCast = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.STONE_SKIN, summoned.position)).toBe(true);
    });
    expect(afterCast.units[summoned.id].tags).toContain(UnitTag.STONE_SKIN);
    expect(afterCast.units[summoned.id].stoneSkinHp).toBe(50);
  });

  it('rejects recasting on a unit with Stone Skin and returns localized feedback', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const target = stoneSkinUnit(UnitType.SPEARMAN, { x: 6, y: 5 });
    const state = makeState([mage, target]);
    const reason = explainInvalidSpellTarget(state, mage.id, SpellId.STONE_SKIN, target.position);

    expect(getValidSpellTargets(state, mage.id, SpellId.STONE_SKIN)).not.toContainEqual(target.position);
    expect(reason?.key).toBe('reason.spell.stoneSkinAlreadyActive');
    expect(t(reason!)).toBe('Already has Stone Skin');
    const afterRecast = produce(state, (draft) => {
      castSpell(draft, mage.id, SpellId.STONE_SKIN, target.position);
    });
    expect(afterRecast.units[target.id].stoneSkinHp).toBe(50);
  });
});

describe('Stone Skin damage', () => {
  it('absorbs post-defense combat damage before normal HP, with no second defense calculation', () => {
    const attacker = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 5 }, Faction.ENEMY);
    const defender = stoneSkinUnit(UnitType.SPEARMAN, { x: 6, y: 5 });
    const expectedDamage = calculateCombat(attacker, defender).defenderHpLost;
    const state = makeState([attacker, defender]);
    const afterAttack = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, defender.id, true);
    });

    expect(afterAttack.units[defender.id].stoneSkinHp).toBe(MAGE.STONE_SKIN_HP - expectedDamage);
    expect(afterAttack.units[defender.id].stats.currentHp).toBe(defender.stats.maxHp);
  });

  it('carries overflow to normal HP and removes the tag and pool at zero', () => {
    const unit = stoneSkinUnit(UnitType.SPEARMAN, { x: 5, y: 5 });
    unit.stats.currentHp = 40;
    const remaining = applyUnitDamage(unit, 65);

    expect(remaining.died).toBe(false);
    expect(unit.stats.currentHp).toBe(25);
    expect(unit.tags).not.toContain(UnitTag.STONE_SKIN);
    expect(unit.stoneSkinHp).toBeUndefined();
  });

  it('keeps Stone HP unchanged when normal HP is healed', () => {
    const unit = stoneSkinUnit(UnitType.SPEARMAN, { x: 5, y: 5 });
    unit.stats.currentHp = 20;
    unit.stoneSkinHp = 17;

    unit.stats.currentHp = Math.min(unit.stats.maxHp, unit.stats.currentHp + 20);

    expect(unit.stats.currentHp).toBe(40);
    expect(unit.stoneSkinHp).toBe(17);
  });

  it('absorbs damage from building attacks and burning tiles', () => {
    const tower = makeBuilding({ x: 5, y: 5 }, Faction.ENEMY);
    const target = stoneSkinUnit(UnitType.SPEARMAN, { x: 6, y: 5 });
    const buildingState = makeState([target], [tower]);
    let buildingDamage = 0;
    const afterBuildingAttack = produce(buildingState, (draft) => {
      buildingDamage = resolveBuildingAttack(draft, tower.id, target.id, true)?.defenderDamage ?? 0;
    });
    expect(buildingDamage).toBeGreaterThan(0);
    expect(afterBuildingAttack.units[target.id].stoneSkinHp).toBeLessThan(MAGE.STONE_SKIN_HP);
    expect(afterBuildingAttack.units[target.id].stats.currentHp).toBe(target.stats.maxHp);

    const burningTarget = stoneSkinUnit(UnitType.SPEARMAN, { x: 7, y: 7 });
    const burningState = makeState([burningTarget]);
    burningState.grid[7][7].status = TileStatus.BURNING;
    const events: import('../gameEvents').GameEvent[] = [];
    const afterBurn = produce(burningState, (draft) => processTileStatusEndOfTurn(draft, events));

    expect(afterBurn.units[burningTarget.id].stoneSkinHp).toBeLessThan(MAGE.STONE_SKIN_HP);
    expect(afterBurn.units[burningTarget.id].stats.currentHp).toBe(burningTarget.stats.maxHp);
    expect(events.some((event) => event.type === 'TILE_DAMAGE')).toBe(true);
  });
});

describe('Stone Skin movement and saves', () => {
  it('blocks voluntary movement but preserves attack and capture actions', () => {
    const unit = stoneSkinUnit(UnitType.SPEARMAN, { x: 5, y: 5 });
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY);
    const state = makeState([unit, enemy]);

    expect(canUnitMove(unit, state)).toBe(false);
    expect(getMovableTiles(unit, state)).toEqual(new Set());
    expect(canUnitAttack(unit, state)).toBe(true);
    expect(canUnitCapture(unit)).toBe(true);
  });

  it('does not melee-advance a Stone Skin attacker after killing a defender', () => {
    const attacker = stoneSkinUnit(UnitType.SPEARMAN, { x: 5, y: 5 });
    const defender = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY);
    defender.stats.currentHp = 1;
    const state = makeState([attacker, defender]);
    const afterAttack = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, defender.id, true);
    });

    expect(afterAttack.units[attacker.id].position).toEqual(attacker.position);
    expect(afterAttack.grid[5][5].unitId).toBe(attacker.id);
  });

  it('allows Transpose and KNOCKBACK to reposition a Stone Skin unit', () => {
    const mage = makeUnit(UnitType.MAGE, { x: 5, y: 5 });
    const stoneUnit = stoneSkinUnit(UnitType.SPEARMAN, { x: 6, y: 5 });
    const ally = makeUnit(UnitType.GUARD, { x: 5, y: 6 });
    let state = makeState([mage, stoneUnit, ally]);
    state = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.TRANSPOSE, stoneUnit.position)).toBe(false);
      expect(castSpell(draft, mage.id, SpellId.TRANSPOSE, ally.position)).toBe(true);
    });
    expect(state.units[stoneUnit.id].position).toEqual(ally.position);

    const knockbackSource = makeUnit(UnitType.LAVA_GRUNT, { x: 4, y: 5 }, Faction.ENEMY, [UnitTag.KNOCKBACK]);
    const knockbackTarget = stoneSkinUnit(UnitType.SPEARMAN, { x: 5, y: 5 });
    const knockbackState = makeState([knockbackSource, knockbackTarget]);
    const afterKnockback = produce(knockbackState, (draft) => {
      resolveAttack(draft, knockbackSource.id, knockbackTarget.id, true);
    });
    expect(afterKnockback.units[knockbackTarget.id].position).toEqual({ x: 6, y: 5 });
  });

  it('preserves active Stone Skin HP through a save round-trip', async () => {
    const initial = generateInitialGameState();
    const unit = stoneSkinUnit(UnitType.SPEARMAN, { x: 5, y: 5 });
    unit.stoneSkinHp = 23;
    initial.units[unit.id] = unit;
    initial.grid[5][5].unitId = unit.id;

    await saveSlotStrict({ id: 'stone-skin-save', name: 'Stone Skin', state: initial });
    const loaded = await loadSlot('stone-skin-save');

    expect(loaded?.units[unit.id].tags).toContain(UnitTag.STONE_SKIN);
    expect(loaded?.units[unit.id].stoneSkinHp).toBe(23);
  });
});
