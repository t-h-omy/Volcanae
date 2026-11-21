import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BUILDING_DEFINITIONS, MAGE, UNIT_DEFINITIONS } from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { applyUnitDamage, getUnitDamageOutcome } from '../unitDamage';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { resolveAttack, resolveBuildingAttack, tryLeaveGravestone } from '../combatSystem';
import { processTileStatusEndOfTurn } from '../tileStatusSystem';
import { processDeathlessExpiry } from '../gameStore';
import {
  BuildingType,
  Faction,
  GamePhase,
  SpellId,
  TileStatus,
  TileType,
  UnitTag,
  UnitType,
} from '../types';
import type { Building, GameState, Position, Unit } from '../types';

let id = 0;

function makeUnit(type: UnitType, position: Position, faction: Faction, tags: UnitTag[] = []): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `deaths-door-${++id}`,
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
  };
}

function makeBuilding(type: BuildingType, position: Position): Building {
  const definition = BUILDING_DEFINITIONS[type];
  return {
    id: `deaths-door-building-${++id}`,
    type,
    faction: Faction.PLAYER,
    position: { ...position },
    hp: definition.maxHp ?? 100,
    maxHp: definition.maxHp ?? 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    discoverRadius: definition.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: definition.combatStats ? { ...definition.combatStats } : null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: definition.destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  } as Building;
}

function makeState(units: Unit[], buildings: Building[] = []): GameState {
  const state = generateInitialGameState();
  state.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  state.buildings = Object.fromEntries(buildings.map((building) => [building.id, building]));
  for (const row of state.grid) {
    for (const tile of row) {
      tile.isRevealed = true;
      tile.unitId = null;
      tile.buildingId = null;
      tile.isLava = false;
      tile.isRuin = false;
      tile.isStrongholdRuin = false;
      tile.terrainType = TileType.PLAINS;
      tile.status = null;
    }
  }
  for (const unit of units) state.grid[unit.position.y][unit.position.x].unitId = unit.id;
  for (const building of buildings) state.grid[building.position.y][building.position.x].buildingId = building.id;
  state.unlockedSpells = [];
  state.arcaneCrystals = 10;
  state.phase = GamePhase.PLAYER_TURN;
  return state;
}

function graveAt(state: GameState, position: Position): Building | undefined {
  const buildingId = state.grid[position.y][position.x].buildingId;
  return buildingId ? state.buildings[buildingId] : undefined;
}

describe("Death's Door", () => {
  it('casts only on a valid own non-Mage unit and marks it through the expiry turn', () => {
    const mage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 }, Faction.PLAYER);
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER);
    const state = makeState([mage, target]);
    state.turn = 3;
    state.unlockedSpells = [SpellId.DEATHS_DOOR];

    expect(getValidSpellTargets(state, mage.id, SpellId.DEATHS_DOOR)).toContainEqual(target.position);
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.DEATHS_DOOR, mage.position)?.key)
      .toBe('reason.spell.deathsDoorMage');
    const marked = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.DEATHS_DOOR, target.position)).toBe(true);
    });
    expect(marked.units[target.id].tags).toContain(UnitTag.DEATHLESS);
    expect(marked.units[target.id].deathlessUntilTurn).toBe(
      state.turn + MAGE.DEATHS_DOOR_DURATION_TURNS,
    );
  });

  it('rejects mages, Summoned units, Mechs, and already Deathless units', () => {
    const mage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 }, Faction.PLAYER);
    const summoned = makeUnit(UnitType.EMBER_DEMON, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const mech = makeUnit(UnitType.CRYSTAL_KHYRON, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.MECH]);
    const deathless = makeUnit(UnitType.SWORDSMAN, { x: 7, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    const state = makeState([mage, summoned, mech, deathless]);
    state.unlockedSpells = [SpellId.DEATHS_DOOR];

    expect(getValidSpellTargets(state, mage.id, SpellId.DEATHS_DOOR)).not.toContainEqual(summoned.position);
    expect(getValidSpellTargets(state, mage.id, SpellId.DEATHS_DOOR)).not.toContainEqual(mech.position);
    expect(getValidSpellTargets(state, mage.id, SpellId.DEATHS_DOOR)).not.toContainEqual(deathless.position);
  });

  it('clamps lethal damage to the minimum and reports prevented death', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    target.stats.currentHp = MAGE.DEATHLESS_MINIMUM_HP + 1;
    const outcome = getUnitDamageOutcome(target, target.stats.currentHp + MAGE.DEATHLESS_MINIMUM_HP);
    expect(outcome.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);
    expect(outcome.died).toBe(false);
    expect(outcome.deathPrevented).toBe(true);

    const applied = applyUnitDamage(target, target.stats.currentHp);
    expect(applied.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);
  });

  it('applies Arcane Shield and Stone Skin before the Deathless clamp', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS, UnitTag.STONE_SKIN]);
    target.arcaneShieldHp = 2;
    target.stoneSkinHp = 2;
    target.stats.currentHp = MAGE.DEATHLESS_MINIMUM_HP + 3;
    const outcome = getUnitDamageOutcome(target, target.stats.currentHp + 10);
    expect(outcome.absorbedByArcaneShield).toBe(target.arcaneShieldHp);
    expect(outcome.stoneSkinHp).toBe(0);
    expect(outcome.hasStoneSkin).toBe(false);
    expect(outcome.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);
    expect(outcome.deathPrevented).toBe(true);
  });

  it('prevents lethal attack, tower, Burning, and Brandmark damage', () => {
    const player = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    player.stats.currentHp = MAGE.DEATHLESS_MINIMUM_HP + 1;
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY);
    const state = makeState([player, enemy]);
    const attackResult = produce(state, (draft) => {
      resolveAttack(draft, enemy.id, player.id, true);
    });
    expect(attackResult.units[player.id].stats.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);

    const tower = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    tower.stats.currentHp = MAGE.DEATHLESS_MINIMUM_HP + 1;
    const towerBuilding = makeBuilding(BuildingType.CRYSTAL_TOWER, { x: 3, y: 5 });
    const towerState = makeState([tower], [towerBuilding]);
    const towerResult = produce(towerState, (draft) => {
      resolveBuildingAttack(draft, towerBuilding.id, tower.id, true);
    });
    expect(towerResult.units[tower.id].stats.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);

    const burning = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    burning.stats.currentHp = MAGE.DEATHLESS_MINIMUM_HP + 1;
    const burningState = makeState([burning]);
    burningState.grid[5][5].status = TileStatus.BURNING;
    const burningResult = produce(burningState, (draft) => processTileStatusEndOfTurn(draft));
    expect(burningResult.units[burning.id].stats.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);

    const branded = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS, UnitTag.BRANDMARKED]);
    branded.stats.currentHp = MAGE.DEATHLESS_MINIMUM_HP + 1;
    const brandmarkOutcome = applyUnitDamage(branded, MAGE.BRANDMARK_HP_LOSS_PER_TURN);
    expect(branded.stats.currentHp).toBe(MAGE.DEATHLESS_MINIMUM_HP);
    expect(brandmarkOutcome.died).toBe(false);
  });

  it('expires after the cast turn and following full player turn', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    target.deathlessUntilTurn = 2;
    const state = makeState([target]);
    state.turn = 1;
    const afterCastTurn = produce(state, (draft) => processDeathlessExpiry(draft, []));
    expect(afterCastTurn.units[target.id]).toBeDefined();
    const afterExpiry = produce(afterCastTurn, (draft) => {
      draft.turn = 2;
      processDeathlessExpiry(draft, []);
    });
    expect(afterExpiry.units[target.id]).toBeUndefined();
    expect(graveAt(afterExpiry, target.position)?.gravesUnitType).toBe(target.type);
  });

  it('does not leave a Gravestone on invalid tiles or for Brandmarked expiry', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    target.deathlessUntilTurn = 1;
    const invalid = makeState([target]);
    invalid.turn = 1;
    invalid.grid[5][5].terrainType = TileType.FOREST;
    const expired = produce(invalid, (draft) => processDeathlessExpiry(draft, []));
    expect(graveAt(expired, target.position)).toBeUndefined();

    const branded = makeUnit(UnitType.SWORDSMAN, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS, UnitTag.BRANDMARKED]);
    branded.deathlessUntilTurn = 1;
    const brandedState = makeState([branded]);
    brandedState.turn = 1;
    const brandedExpired = produce(brandedState, (draft) => processDeathlessExpiry(draft, []));
    expect(graveAt(brandedExpired, branded.position)).toBeUndefined();
    expect(brandedExpired.pendingBrandmarkTransforms.some((pending) => pending.unitId === branded.id)).toBe(true);
  });

  it('lets lava and Explode bypass Deathless, and Explode leaves a Gravestone', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    target.deathlessUntilTurn = 10;
    const lavaState = makeState([target]);
    lavaState.grid[5][5].isLava = true;
    let lavaGrave: string | null = null;
    produce(lavaState, (draft) => {
      lavaGrave = tryLeaveGravestone(draft, target, target.position);
    });
    expect(lavaGrave).toBeNull();

    const mage = makeUnit(UnitType.EMBER_CULTIST, { x: 4, y: 5 }, Faction.PLAYER);
    const sacrifice = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [UnitTag.DEATHLESS]);
    sacrifice.deathlessUntilTurn = 10;
    const explodeState = makeState([mage, sacrifice]);
    explodeState.unlockedSpells = [SpellId.EXPLODE];
    const exploded = produce(explodeState, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.EXPLODE, sacrifice.position)).toBe(true);
    });
    expect(graveAt(exploded, sacrifice.position)?.gravesUnitType).toBe(UnitType.SWORDSMAN);
  });
});
