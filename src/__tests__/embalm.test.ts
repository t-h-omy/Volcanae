import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BUILDING_DEFINITIONS, UNIT_DEFINITIONS } from '../gameConfig';
import { generateInitialGameState } from '../mapGenerator';
import { castSpell, getValidSpellTargets } from '../spellSystem';
import { canUnitCapture, canUnitConstruct, canUnitHeal, canUnitTrade } from '../unitActions';
import { hasBuildAndCapture, getInactiveTagReason } from '../unitTraits';
import { shouldLeaveGravestone } from '../combatSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { getSuppressedTagsForUnit } from '../tileStatusSystem';
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
import type { Building, GameState, Position, Unit } from '../types';

let id = 0;

function makeUnit(type: UnitType, position: Position, faction: Faction = Faction.PLAYER, tags: UnitTag[] = []): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `embalm-${++id}`,
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
    hasConsumedGravestoneThisTurn: false,
    bloodlustAttackAvailable: false,
    spellsCastThisTurn: 0,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function makeGrave(position: Position): Building {
  const definition = BUILDING_DEFINITIONS.GRAVESTONE;
  return {
    id: `embalm-grave-${++id}`,
    type: BuildingType.GRAVESTONE,
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
    destroyBehavior: definition.destroyBehavior ?? DestroyBehavior.NONE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}

function makeState(units: Unit[], buildings: Building[] = []): GameState {
  const state = generateInitialGameState();
  state.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  state.buildings = Object.fromEntries(buildings.map((building) => [building.id, building]));
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
      tile.isRevealed = true;
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
  return state;
}

describe('Embalm', () => {
  it('targets only a healable own unit on a player Gravestone', () => {
    const mage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 });
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 });
    const grave = makeGrave(target.position);
    const summoned = makeUnit(UnitType.SKELETON, { x: 6, y: 5 }, Faction.PLAYER, [UnitTag.SUMMONED]);
    const summonedGrave = makeGrave(summoned.position);
    const mech = makeUnit(UnitType.CRYSTAL_KHYRON, { x: 7, y: 5 }, Faction.PLAYER, [UnitTag.MECH]);
    const mechGrave = makeGrave(mech.position);
    const state = makeState([mage, target, summoned, mech], [grave, summonedGrave, mechGrave]);
    state.unlockedSpells = [SpellId.EMBALM];

    expect(getValidSpellTargets(state, mage.id, SpellId.EMBALM)).toContainEqual(target.position);
    expect(getValidSpellTargets(state, mage.id, SpellId.EMBALM)).not.toContainEqual(summoned.position);
    expect(getValidSpellTargets(state, mage.id, SpellId.EMBALM)).not.toContainEqual(mech.position);
  });

  it('rejects a Grave Trap and a mage target', () => {
    const mage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 });
    const otherMage = makeUnit(UnitType.NECROMANCER, { x: 5, y: 5 });
    const trap = makeGrave(otherMage.position);
    trap.type = BuildingType.GRAVE_TRAP;
    const state = makeState([mage, otherMage], [trap]);
    state.unlockedSpells = [SpellId.EMBALM];
    expect(getValidSpellTargets(state, mage.id, SpellId.EMBALM)).not.toContainEqual(otherMage.position);
  });

  it('consumes the Gravestone and adds permanent Summoned and Embalmed tags', () => {
    const mage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 });
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 });
    const grave = makeGrave(target.position);
    const state = makeState([mage, target], [grave]);
    state.unlockedSpells = [SpellId.EMBALM];
    state.specialists = createInitialSpecialists();
    state.globalSpecialistStorage = ['spec_13'];
    const after = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.EMBALM, target.position)).toBe(true);
    });
    expect(after.buildings[grave.id]).toBeUndefined();
    expect(after.grid[target.position.y][target.position.x].buildingId).toBeNull();
    expect(after.units[target.id].tags).toContain(UnitTag.SUMMONED);
    expect(after.units[target.id].tags).toContain(UnitTag.EMBALMED);
    expect(after.units[target.id].tags).toContain(UnitTag.RAGE);
    expect(after.units[target.id].tags).toContain(UnitTag.CLEAVE);
  });

  it('loses Build and Capture capability and no longer leaves a Gravestone', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [
      UnitTag.BUILDANDCAPTURE,
      UnitTag.EMBALMED,
      UnitTag.SUMMONED,
    ]);
    expect(hasBuildAndCapture(target)).toBe(false);
    expect(canUnitCapture(target)).toBe(false);
    expect(canUnitConstruct(target)).toBe(false);
    expect(canUnitHeal(target)).toBe(false);
    expect(canUnitTrade(target)).toBe(false);
    expect(shouldLeaveGravestone(target, { defaultOn: true })).toBe(false);

    target.tags.push(UnitTag.BUILDANDCAPTURE);
    expect(hasBuildAndCapture(target)).toBe(false);
  });

  it('returns EMBALMED only for the inactive Build and Capture pill', () => {
    const target = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.PLAYER, [
      UnitTag.BUILDANDCAPTURE,
      UnitTag.EMBALMED,
    ]);
    expect(getInactiveTagReason(target, UnitTag.BUILDANDCAPTURE)).toBe('EMBALMED');
    expect(getInactiveTagReason(target, UnitTag.RANGED)).toBeNull();

    const corrupted = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 });
    const corruptedState = makeState([corrupted]);
    corruptedState.grid[5][5].status = TileStatus.CORRUPTED;
    const corruptedSuppression = getSuppressedTagsForUnit(corruptedState, corrupted);
    expect(getInactiveTagReason(corrupted, UnitTag.CLEAVE, corruptedSuppression)).toBe('CORRUPTED');

    const crystalline = makeUnit(UnitType.LAVA_GRUNT, { x: 6, y: 5 }, Faction.ENEMY);
    const crystallineState = makeState([crystalline]);
    crystallineState.grid[5][6].status = TileStatus.CRYSTALLINE;
    const crystallineSuppression = getSuppressedTagsForUnit(crystallineState, crystalline);
    expect(getInactiveTagReason(crystalline, UnitTag.CLEAVE, crystallineSuppression)).toBe('CRYSTALLINE');
  });
});
