import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BUILDING_DEFINITIONS, UNIT_DEFINITIONS } from '../gameConfig';
import { processInfestedFactionTurn } from '../infestedSystem';
import { generateInitialGameState } from '../mapGenerator';
import { processTileStatusEndOfTurn } from '../tileStatusSystem';
import { castSpell, explainInvalidSpellTarget, getValidSpellTargets } from '../spellSystem';
import { resolveAttack, resolveBuildingAttack, tryLeaveGravestone } from '../combatSystem';
import { useGameStore } from '../gameStore';
import {
  BuildingType,
  DestroyBehavior,
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
    id: `grave-mark-unit-${++id}`,
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
    id: `grave-mark-building-${++id}`,
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
    destroyBehavior: definition.destroyBehavior ?? DestroyBehavior.NONE,
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
  return state;
}

function gravestoneAt(state: GameState, position: Position): Building | undefined {
  const buildingId = state.grid[position.y][position.x].buildingId;
  return buildingId ? state.buildings[buildingId] : undefined;
}

function makeMarkedGraveState(position: Position, units: Unit[] = []): {
  state: GameState;
  graveId: string;
} {
  const enemy = makeUnit(
    UnitType.SWORDSMAN,
    position,
    Faction.ENEMY,
    [UnitTag.GRAVE_MARKED],
  );
  const state = makeState([...units, enemy]);
  let graveId: string | null = null;
  const result = produce(state, (draft) => {
    draft.grid[position.y][position.x].unitId = null;
    delete draft.units[enemy.id];
    graveId = tryLeaveGravestone(draft, enemy, position);
  });
  if (!graveId) throw new Error('Expected marked enemy to leave a Gravestone');
  return { state: result, graveId };
}

describe('Grave Mark', () => {
  it('marks an unmarked enemy in range and rejects a second mark', () => {
    const mage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 4 }, Faction.PLAYER);
    const enemy = makeUnit(UnitType.LAVA_GRUNT, { x: 5, y: 4 }, Faction.ENEMY);
    const state = makeState([mage, enemy]);
    state.unlockedSpells = [SpellId.GRAVE_MARK];

    expect(getValidSpellTargets(state, mage.id, SpellId.GRAVE_MARK)).toContainEqual(enemy.position);
    expect(explainInvalidSpellTarget(state, mage.id, SpellId.GRAVE_MARK, enemy.position)).toBeNull();
    const marked = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.GRAVE_MARK, enemy.position)).toBe(true);
    });
    expect(marked.units[enemy.id].tags).toContain(UnitTag.GRAVE_MARKED);
    expect(explainInvalidSpellTarget(marked, mage.id, SpellId.GRAVE_MARK, enemy.position)?.key)
      .toBe('reason.spell.graveMarkAlreadyMarked');
    expect(getValidSpellTargets(marked, mage.id, SpellId.GRAVE_MARK)).not.toContainEqual(enemy.position);
  });

  it('creates a player Gravestone with no buried unit type only for a marked unit', () => {
    const markedEnemy = makeUnit(
      UnitType.LAVA_GRUNT,
      { x: 5, y: 5 },
      Faction.ENEMY,
      [UnitTag.GRAVE_MARKED],
    );
    const player = makeUnit(
      UnitType.SWORDSMAN,
      { x: 3, y: 5 },
      Faction.PLAYER,
      [UnitTag.LEAVES_GRAVESTONE],
    );
    const state = makeState([markedEnemy, player]);
    let markedGraveId: string | null = null;
    let unmarkedGraveId: string | null = null;
    let playerGraveId: string | null = null;
    const result = produce(state, (draft) => {
      draft.grid[5][5].unitId = null;
      draft.grid[5][3].unitId = null;
      markedGraveId = tryLeaveGravestone(draft, markedEnemy, { x: 5, y: 5 });
      unmarkedGraveId = tryLeaveGravestone(draft, { ...markedEnemy, tags: [] }, { x: 6, y: 5 });
      playerGraveId = tryLeaveGravestone(draft, player, { x: 3, y: 5 });
    });

    expect(markedGraveId).not.toBeNull();
    expect(result.buildings[markedGraveId!]).toMatchObject({
      type: BuildingType.GRAVESTONE,
      faction: Faction.PLAYER,
      gravesUnitType: null,
    });
    expect(unmarkedGraveId).toBeNull();
    expect(playerGraveId).not.toBeNull();
    expect(result.buildings[playerGraveId!].gravesUnitType).toBe(UnitType.SWORDSMAN);
  });

  it.each([
    ['forest', (state: GameState, pos: Position) => { state.grid[pos.y][pos.x].terrainType = TileType.FOREST; }],
    ['building', (state: GameState, pos: Position) => { state.grid[pos.y][pos.x].buildingId = 'occupied'; }],
    ['ruin', (state: GameState, pos: Position) => { state.grid[pos.y][pos.x].isRuin = true; }],
    ['lava', (state: GameState, pos: Position) => { state.grid[pos.y][pos.x].isLava = true; }],
  ])('does not create a Gravestone on a %s tile', (_name, setInvalidTile) => {
    const enemy = makeUnit(
      UnitType.LAVA_GRUNT,
      { x: 5, y: 5 },
      Faction.ENEMY,
      [UnitTag.GRAVE_MARKED],
    );
    const state = makeState([enemy]);
    const position = enemy.position;
    setInvalidTile(state, position);
    let graveId: string | null = null;
    produce(state, (draft) => {
      draft.grid[position.y][position.x].unitId = null;
      graveId = tryLeaveGravestone(draft, enemy, position);
    });
    expect(graveId).toBeNull();
  });

  it.each([
    ['melee', UnitType.SWORDSMAN, { x: 3, y: 5 }],
    ['ranged', UnitType.ARCHER, { x: 2, y: 5 }],
  ])('leaves a Gravestone after a %s kill', (_name, attackerType, attackerPosition) => {
    const attacker = makeUnit(attackerType, attackerPosition, Faction.PLAYER);
    const enemy = makeUnit(
      UnitType.LAVA_GRUNT,
      { x: 4, y: 5 },
      Faction.ENEMY,
      [UnitTag.GRAVE_MARKED],
    );
    enemy.stats.currentHp = 1;
    const state = makeState([attacker, enemy]);
    const result = produce(state, (draft) => {
      resolveAttack(draft, attacker.id, enemy.id, true);
    });

    expect(gravestoneAt(result, enemy.position)).toMatchObject({
      type: BuildingType.GRAVESTONE,
      faction: Faction.PLAYER,
      gravesUnitType: null,
    });
    if (_name === 'melee') expect(result.units[attacker.id].position).toEqual(enemy.position);
  });

  it('leaves a Gravestone when a Crystal Tower kills a marked enemy', () => {
    const tower = makeBuilding(BuildingType.CRYSTAL_TOWER, { x: 3, y: 5 });
    const enemy = makeUnit(
      UnitType.SWORDSMAN,
      { x: 4, y: 5 },
      Faction.ENEMY,
      [UnitTag.GRAVE_MARKED],
    );
    enemy.stats.currentHp = 1;
    const state = makeState([enemy], [tower]);
    const result = produce(state, (draft) => {
      resolveBuildingAttack(draft, tower.id, enemy.id, true);
    });
    expect(gravestoneAt(result, enemy.position)?.gravesUnitType).toBeNull();
  });

  it('leaves a Gravestone when a marked enemy dies from Burning or an Infested tick', () => {
    for (const cause of ['burning', 'infested'] as const) {
      const tags = [UnitTag.GRAVE_MARKED, ...(cause === 'infested' ? [UnitTag.INFESTED] : [])];
      const enemy = makeUnit(UnitType.SWORDSMAN, { x: 5, y: 5 }, Faction.ENEMY, tags);
      enemy.stats.currentHp = 1;
      const state = makeState([enemy]);
      if (cause === 'burning') state.grid[5][5].status = TileStatus.BURNING;
      const result = produce(state, (draft) => {
        if (cause === 'burning') processTileStatusEndOfTurn(draft);
        else processInfestedFactionTurn(draft, Faction.ENEMY, []);
      });
      expect(gravestoneAt(result, enemy.position)?.gravesUnitType).toBeNull();
    }
  });

  it('leaves a Gravestone when Crystal Lightning kills a marked enemy', () => {
    const mage = makeUnit(UnitType.CRYSTAL_MAGE, { x: 4, y: 4 }, Faction.PLAYER);
    const enemy = makeUnit(
      UnitType.LAVA_GRUNT,
      { x: 5, y: 5 },
      Faction.ENEMY,
      [UnitTag.GRAVE_MARKED],
    );
    enemy.stats.currentHp = 1;
    const chamber = makeBuilding(BuildingType.CRYSTAL_CHAMBER, { x: 4, y: 5 });
    const state = makeState([mage, enemy], [chamber]);
    state.unlockedSpells = [SpellId.CRYSTAL_LIGHTNING];
    const result = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.CRYSTAL_LIGHTNING, chamber.position)).toBe(true);
    });
    expect(gravestoneAt(result, enemy.position)?.gravesUnitType).toBeNull();
  });

  it('leaves Gravestones for marked enemies killed by Explode', () => {
    const mage = makeUnit(UnitType.EMBER_CULTIST, { x: 2, y: 4 }, Faction.PLAYER);
    const sacrifice = makeUnit(UnitType.SWORDSMAN, { x: 4, y: 4 }, Faction.PLAYER);
    const enemy = makeUnit(
      UnitType.LAVA_GRUNT,
      { x: 5, y: 4 },
      Faction.ENEMY,
      [UnitTag.GRAVE_MARKED],
    );
    enemy.stats.currentHp = 1;
    const state = makeState([mage, sacrifice, enemy]);
    state.unlockedSpells = [SpellId.EXPLODE];
    const result = produce(state, (draft) => {
      expect(castSpell(draft, mage.id, SpellId.EXPLODE, sacrifice.position)).toBe(true);
    });
    expect(gravestoneAt(result, enemy.position)?.gravesUnitType).toBeNull();
  });

  it('lets marked-enemy Gravestones raise a Skeleton or summon a Ghoul, but not revive', () => {
    const position = { x: 5, y: 5 };
    const skeletonMage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 }, Faction.PLAYER);
    const skeletonState = makeMarkedGraveState(position, [skeletonMage]);
    const skeletonReady = produce(skeletonState.state, (draft) => {
      draft.unlockedSpells = [SpellId.RAISE_SKELETON];
    });
    const raised = produce(skeletonReady, (draft) => {
      expect(castSpell(draft, skeletonMage.id, SpellId.RAISE_SKELETON, position)).toBe(true);
    });
    expect(raised.buildings[skeletonState.graveId]).toBeUndefined();
    expect(Object.values(raised.units).some((unit) => unit.type === UnitType.SKELETON)).toBe(true);

    const ghoulMage = makeUnit(UnitType.NECROMANCER, { x: 4, y: 5 }, Faction.PLAYER);
    const ghoulState = makeMarkedGraveState(position, [ghoulMage]);
    const ghoulReady = produce(ghoulState.state, (draft) => {
      draft.unlockedSpells = [SpellId.SUMMON_GHOUL];
    });
    const summoned = produce(ghoulReady, (draft) => {
      expect(castSpell(draft, ghoulMage.id, SpellId.SUMMON_GHOUL, position)).toBe(true);
    });
    expect(summoned.buildings[ghoulState.graveId]).toBeUndefined();
    expect(Object.values(summoned.units).some((unit) => unit.type === UnitType.GHOUL)).toBe(true);

    const reviver = makeUnit(UnitType.SWORDSMAN, { x: 4, y: 5 }, Faction.PLAYER);
    const reviveState = makeMarkedGraveState(position, [reviver]);
    useGameStore.setState(reviveState.state);
    useGameStore.getState().reviveUnit(reviveState.graveId);
    expect(useGameStore.getState().buildings[reviveState.graveId]?.gravesUnitType).toBeNull();
    expect(useGameStore.getState().buildings[reviveState.graveId]).toBeDefined();
  });

  it('lets a Ghoul consume a marked-enemy Gravestone', () => {
    const position = { x: 5, y: 5 };
    const ghoul = makeUnit(UnitType.GHOUL, position, Faction.PLAYER);
    const { state, graveId } = makeMarkedGraveState(position);
    const occupied = produce(state, (draft) => {
      draft.units[ghoul.id] = ghoul;
      draft.grid[position.y][position.x].unitId = ghoul.id;
      draft.phase = GamePhase.PLAYER_TURN;
    });
    useGameStore.setState(occupied);
    useGameStore.getState().consumeGravestone(ghoul.id);
    expect(useGameStore.getState().buildings[graveId]).toBeUndefined();
    expect(useGameStore.getState().units[ghoul.id]?.level).toBe(2);
  });
});
