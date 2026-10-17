import { describe, expect, it, vi } from 'vitest';
import { produce } from 'immer';
import { resolveAttack, type UnitAttackResult } from '../combatSystem';
import { CORRUPTED_QORK, MAGE, MAP, UNIT_DEFINITIONS } from '../gameConfig';
import type { GameEvent } from '../gameEvents';
import { Faction, TileStatus, TileType, UnitTag, UnitType } from '../types';
import type { GameState, Position, Tile, Unit } from '../types';
import * as infestedSystem from '../infestedSystem';

let nextId = 0;

function unit(
  position: Position,
  faction: Faction = Faction.ENEMY,
  tags: UnitTag[] = [],
  type: UnitType = UnitType.SWORDSMAN,
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `resolution-${++nextId}`,
    type,
    faction,
    position,
    stats: {
      currentHp: definition.maxHp,
      maxHp: definition.maxHp,
      attack: definition.attack,
      defense: 0,
      attackRange: definition.attackRange,
      moveRange: definition.moveRange,
      discoverRadius: definition.discoverRadius,
      triggerRange: definition.triggerRange ?? 0,
      movementActions: definition.movementActions ?? 1,
    },
    tags,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasTradedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

function stateWith(units: Unit[]): GameState {
  const grid: Tile[][] = Array.from({ length: MAP.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MAP.GRID_WIDTH }, (_, x) => ({
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
    })),
  );
  for (const entry of units) grid[entry.position.y][entry.position.x].unitId = entry.id;
  return {
    units: Object.fromEntries(units.map((entry) => [entry.id, entry])),
    grid,
    buildings: {},
    portals: {},
    turn: 1,
    ember: 0,
    arcaneCrystals: 0,
    techFlags: [],
    pendingBrandmarkTransforms: [],
    activeCaveEncounters: [],
    gameStats: {
      unitsKilled: 0,
      unitsLost: 0,
      damageDealt: 0,
      damageReceived: 0,
      enemyBuildingsDestroyed: 0,
    },
  } as unknown as GameState;
}

function attack(initial: GameState, attacker: Unit, defender: Unit) {
  const events: GameEvent[] = [];
  let result: UnitAttackResult | undefined;
  const state = produce(initial, (draft) => {
    result = resolveAttack(draft, attacker.id, defender.id, true, events);
  });
  return { state, events, result };
}

function attackerWith(tags: UnitTag[] = []): Unit {
  const attacker = unit({ x: 3, y: 5 }, Faction.PLAYER, tags);
  attacker.stats.attack = 200;
  return attacker;
}

function qorkAt(x: number, y: number, hp = 1): Unit {
  const qork = unit({ x, y }, Faction.ENEMY, [], UnitType.CORRUPTED_QORK);
  qork.stats.currentHp = hp;
  return qork;
}

describe('combat resolution order', () => {
  it('resolves a real three-HP player Qork attacking a real Lancer at every defender HP without the safety net', () => {
    const qorkDefinition = UNIT_DEFINITIONS.CORRUPTED_QORK;
    const lancerDefinition = UNIT_DEFINITIONS.LANCER;
    const deathEffects = vi.spyOn(infestedSystem, 'resolveInfestedDeath');
    try {
      for (let defenderHp = 1; defenderHp <= lancerDefinition.maxHp; defenderHp++) {
        const attacker = unit(
          { x: 3, y: 5 }, Faction.PLAYER, [...qorkDefinition.tags], UnitType.CORRUPTED_QORK,
        );
        attacker.stats.currentHp = 3;
        attacker.stats.defense = qorkDefinition.defense;
        const defender = unit(
          { x: 4, y: 5 }, Faction.ENEMY, [...lancerDefinition.tags], UnitType.LANCER,
        );
        defender.stats.currentHp = defenderHp;
        defender.stats.defense = lancerDefinition.defense;
        const { state, events, result } = attack(stateWith([attacker, defender]), attacker, defender);

        expect(result, `Lancer HP ${defenderHp}`).toBeDefined();
        const deaths = events.filter((event) => event.type === 'UNIT_DEATH');
        if (result!.attackerDied) {
          expect(deaths.map((event) => event.unitId)).not.toContain(attacker.id);
          deaths.push({
            type: 'UNIT_DEATH', unitId: attacker.id, position: attacker.position, faction: attacker.faction,
          });
        }
        if (result!.defenderDied) {
          expect(deaths.map((event) => event.unitId)).not.toContain(defender.id);
          deaths.push({
            type: 'UNIT_DEATH', unitId: defender.id, position: defender.position, faction: defender.faction,
          });
        }
        const removedIds = [attacker.id, defender.id].filter((id) => !state.units[id]).sort();
        expect(deaths.map((event) => event.unitId).sort(), `Lancer HP ${defenderHp}`)
          .toEqual(removedIds);
        for (const survivor of Object.values(state.units)) {
          if (state.pendingBrandmarkTransforms.some((pending) => pending.unitId === survivor.id)) continue;
          expect(survivor.stats.currentHp, `Lancer HP ${defenderHp}`).toBeGreaterThan(0);
        }
        // Normal combat resolves only its primary death through this entry point.
        // A residual sweep would invoke it again and duplicate caller-owned deaths.
        expect(deathEffects, `Lancer HP ${defenderHp}`).toHaveBeenCalledTimes(1);
        deathEffects.mockClear();
      }
    } finally {
      deathEffects.mockRestore();
    }
  });

  it('keeps primary impact deaths caller-owned and does not sweep them twice', () => {
    const attacker = attackerWith();
    const defender = qorkAt(4, 5);
    const { state, result, events } = attack(stateWith([attacker, defender]), attacker, defender);

    expect(result).toMatchObject({ attackerDied: false, defenderDied: true });
    expect(state.gameStats.unitsKilled).toBe(1);
    expect(events.filter((event) => event.type === 'UNIT_DEATH')).toEqual([]);
    expect(events.filter((event) => event.type === 'QORK_DEATH_BURST')).toHaveLength(1);
  });

  it('advances before a chain burst and damages the attacker at its destination', () => {
    const attacker = attackerWith();
    const defender = qorkAt(4, 5);
    const chained = qorkAt(5, 5, CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE);
    const { state, result, events } = attack(stateWith([attacker, defender, chained]), attacker, defender);

    expect(result).toMatchObject({
      attackerDied: false, defenderDied: true, advancedTo: defender.position,
    });
    expect(state.units[attacker.id].position).toEqual(defender.position);
    expect(state.units[attacker.id].stats.currentHp)
      .toBe(attacker.stats.currentHp - CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE * 2);
    expect(state.units[chained.id]).toBeUndefined();
    expect(events.filter((event) => event.type === 'QORK_DEATH_BURST')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'UNIT_DEATH').map((event) => event.unitId))
      .toEqual([chained.id]);
  });

  it('reports a completed fatal advance without turning death-effect damage into an impact death', () => {
    const attacker = attackerWith([UnitTag.BLOODLUST]);
    attacker.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;
    const defender = qorkAt(4, 5);
    const chained = qorkAt(5, 5, CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE);
    const { state, result, events } = attack(stateWith([attacker, defender, chained]), attacker, defender);

    expect(result).toMatchObject({
      attackerDied: false,
      defenderDied: true,
      advancedTo: defender.position,
    });
    expect(state.units[attacker.id]).toBeUndefined();
    expect(state.grid[5][4].unitId).toBeNull();
    expect(events).toContainEqual({
      type: 'UNIT_DEATH', unitId: attacker.id, position: defender.position, faction: Faction.PLAYER,
    });
    expect(events.filter((event) => event.type === 'UNIT_DEATH').map((event) => event.unitId))
      .toEqual([attacker.id, chained.id]);
  });

  it('bookkeeps primary, pierce, and grid-ordered cleave impact deaths before any bursts', () => {
    const attacker = attackerWith([UnitTag.PIERCE, UnitTag.CLEAVE]);
    const defender = qorkAt(4, 5);
    const rear = qorkAt(5, 5);
    const north = qorkAt(4, 4);
    const south = qorkAt(3, 6);
    const { state, events, result } = attack(stateWith([attacker, defender, rear, south, north]), attacker, defender);

    expect(result).toMatchObject({ attackerDied: false, defenderDied: true, advancedTo: defender.position });
    expect(state.gameStats.unitsKilled).toBe(4);
    const deaths = events.filter((event) => event.type === 'UNIT_DEATH');
    expect(deaths.map((event) => event.unitId)).toEqual([rear.id, north.id, south.id]);
    const secondaryImpactEvents = events.filter((event) =>
      event.type === 'PIERCE_DAMAGE' || event.type === 'CLEAVE_DAMAGE' || event.type === 'UNIT_DEATH',
    );
    expect(secondaryImpactEvents.map((event) => [event.type, event.unitId])).toEqual([
      ['PIERCE_DAMAGE', rear.id],
      ['UNIT_DEATH', rear.id],
      ['CLEAVE_DAMAGE', north.id],
      ['UNIT_DEATH', north.id],
      ['CLEAVE_DAMAGE', south.id],
      ['UNIT_DEATH', south.id],
    ]);
    const bursts = events.filter((event) => event.type === 'QORK_DEATH_BURST');
    expect(bursts.map((event) => event.position))
      .toEqual([defender.position, rear.position, north.position, south.position]);
    expect(events.indexOf(deaths[deaths.length - 1])).toBeLessThan(events.indexOf(bursts[0]));
    expect(events.filter((event) => event.type === 'TILE_DAMAGE' && event.unitId === rear.id))
      .toEqual([]);
  });

  it('applies nonfatal pierce and cleave impacts before primary death effects', () => {
    const attacker = attackerWith([UnitTag.PIERCE, UnitTag.CLEAVE]);
    const defender = qorkAt(4, 5);
    const rear = unit({ x: 5, y: 5 });
    rear.stats.currentHp = rear.stats.maxHp = 300;
    const cleaved = unit({ x: 4, y: 4 });
    cleaved.stats.currentHp = cleaved.stats.maxHp = 300;
    const { events } = attack(stateWith([attacker, defender, rear, cleaved]), attacker, defender);

    const firstBurst = events.findIndex((event) => event.type === 'QORK_DEATH_BURST');
    expect(events.findIndex((event) => event.type === 'PIERCE_DAMAGE')).toBeLessThan(firstBurst);
    expect(events.findIndex((event) => event.type === 'CLEAVE_DAMAGE')).toBeLessThan(firstBurst);
    const burstDamage = events.filter((event) => event.type === 'TILE_DAMAGE');
    expect(burstDamage.map((event) => event.unitId)).toEqual([cleaved.id, attacker.id, rear.id]);
  });

  it('removes pierce impact deaths before knockback and resolves their bursts after displacement', () => {
    const attacker = attackerWith([UnitTag.PIERCE, UnitTag.KNOCKBACK]);
    const defender = unit({ x: 4, y: 5 });
    defender.stats.currentHp = defender.stats.maxHp = 1000;
    const rear = qorkAt(5, 5);
    const { state, events, result } = attack(stateWith([attacker, defender, rear]), attacker, defender);

    expect(result).toMatchObject({ attackerDied: false, defenderDied: false, advancedTo: null });
    expect(state.units[defender.id].position).toEqual(rear.position);
    expect(state.units[defender.id].stats.currentHp)
      .toBe(defender.stats.currentHp - result!.defenderDamage - CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE);
    expect(events.findIndex((event) => event.type === 'UNIT_KNOCKBACK'))
      .toBeLessThan(events.findIndex((event) => event.type === 'QORK_DEATH_BURST'));
  });

  it('clears a counter-kill defender infection only after the attacker death effect', () => {
    const attacker = attackerWith([UnitTag.INFESTED]);
    attacker.stats.currentHp = 1;
    attacker.stats.attack = 1;
    const defender = unit({ x: 4, y: 5 });
    defender.stats.defense = 200;
    const { state, result } = attack(stateWith([attacker, defender]), attacker, defender);

    expect(result).toMatchObject({ attackerDied: true, defenderDied: false, advancedTo: null });
    expect(state.units[defender.id].tags).not.toContain(UnitTag.INFESTED);
    expect(state.units[defender.id].infestedByMageId).toBeNull();
  });

  it('clears kill-credit infection after both primary and cleave death effects', () => {
    const attacker = attackerWith([UnitTag.CLEAVE, UnitTag.INFESTED]);
    const defender = unit({ x: 4, y: 5 }, Faction.ENEMY, [UnitTag.INFESTED]);
    defender.stats.currentHp = 1;
    const cleaved = unit({ x: 4, y: 4 }, Faction.ENEMY, [UnitTag.INFESTED]);
    cleaved.stats.currentHp = 1;
    const { state } = attack(stateWith([attacker, defender, cleaved]), attacker, defender);

    expect(state.gameStats.unitsKilled).toBe(2);
    expect(state.units[attacker.id].tags).not.toContain(UnitTag.INFESTED);
    expect(state.units[attacker.id].infestedByMageId).toBeNull();
  });

  it('flushes primary and splash kill credit only after splash death effects', () => {
    const attacker = attackerWith([UnitTag.SPLASH, UnitTag.RANGED]);
    const defender = unit({ x: 4, y: 5 }, Faction.ENEMY, [UnitTag.INFESTED]);
    defender.stats.currentHp = 1;
    const splashed = unit({ x: 4, y: 4 }, Faction.ENEMY, [UnitTag.INFESTED]);
    splashed.stats.currentHp = 1;
    const clearCredit = vi.spyOn(infestedSystem, 'clearInfestedOnCreditedKill');
    try {
      const { state } = attack(stateWith([attacker, defender, splashed]), attacker, defender);

      expect(state.gameStats.unitsKilled).toBe(2);
      expect(state.units[attacker.id].tags).not.toContain(UnitTag.INFESTED);
      expect(state.units[attacker.id].infestedByMageId).toBeNull();
      expect(clearCredit).toHaveBeenCalledTimes(1);
    } finally {
      clearCredit.mockRestore();
    }
  });

  it('checks Bloodlust suppression after a death burst corrupts the advance tile', () => {
    const attacker = attackerWith([UnitTag.BLOODLUST]);
    const defender = qorkAt(4, 5);
    const remainingTarget = unit({ x: 5, y: 5 });
    const { state } = attack(stateWith([attacker, defender, remainingTarget]), attacker, defender);

    expect(state.grid[5][4].status).toBe(TileStatus.CORRUPTED);
    expect(state.units[attacker.id].bloodlustAttackAvailable).toBe(false);
    expect(state.units[attacker.id].hasAttackedThisTurn).toBe(true);
  });

  it('does not grant a dangling Bloodlust charge when the last target dies in the chain', () => {
    const attacker = attackerWith([UnitTag.BLOODLUST, UnitTag.RANGED]);
    const defender = qorkAt(4, 5);
    const lastTarget = unit({ x: 5, y: 5 });
    lastTarget.stats.currentHp = CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE;
    const { state, result } = attack(stateWith([attacker, defender, lastTarget]), attacker, defender);

    expect(result?.advancedTo).toBeNull();
    expect(state.units[lastTarget.id]).toBeUndefined();
    expect(state.grid[5][3].status).toBeNull();
    expect(state.units[attacker.id].bloodlustAttackAvailable).toBe(false);
    expect(state.units[attacker.id].hasAttackedThisTurn).toBe(true);
  });

  it('advances after a primary brandmark death while excluding the destination from demon spawning', () => {
    const attacker = attackerWith();
    attacker.faction = Faction.ENEMY;
    const defender = unit({ x: 4, y: 5 }, Faction.PLAYER, [UnitTag.BRANDMARKED]);
    defender.stats.currentHp = 1;
    const { state, result } = attack(stateWith([attacker, defender]), attacker, defender);

    expect(result).toMatchObject({ defenderDied: true, advancedTo: defender.position });
    expect(state.units[attacker.id].position).toEqual(defender.position);
    expect(state.grid[5][4].unitId).toBe(attacker.id);
    const transformed = Object.values(state.units).find((entry) => entry.type === UnitType.EMBER_DEMON);
    expect(transformed?.faction).toBe(Faction.ENEMY);
    expect(transformed?.position).toEqual({ x: 5, y: 5 });
  });

  it('reserves the advance destination when a pierce death transforms off its lava tile', () => {
    const attacker = attackerWith([UnitTag.PIERCE]);
    attacker.faction = Faction.ENEMY;
    const defender = unit({ x: 4, y: 5 }, Faction.PLAYER);
    defender.stats.currentHp = 1;
    const rear = unit({ x: 5, y: 5 }, Faction.PLAYER, [UnitTag.BRANDMARKED]);
    rear.stats.currentHp = 1;
    const initial = stateWith([attacker, defender, rear]);
    initial.grid[5][5].isLava = true;
    const { state, result } = attack(initial, attacker, defender);

    expect(result?.advancedTo).toEqual(defender.position);
    expect(state.grid[5][4].unitId).toBe(attacker.id);
    expect(state.units[rear.id]).toBeUndefined();
    const transformed = Object.values(state.units).find((entry) => entry.type === UnitType.EMBER_DEMON);
    expect(transformed?.position).toEqual({ x: 6, y: 5 });
    expect(state.gameStats.unitsLost).toBe(2);
  });

  it('does not spawn a cleave brandmark demon onto the reserved advance destination', () => {
    const attacker = attackerWith([UnitTag.CLEAVE]);
    attacker.faction = Faction.ENEMY;
    const defender = unit({ x: 4, y: 5 }, Faction.PLAYER);
    defender.stats.currentHp = 1;
    const cleaved = unit({ x: 4, y: 4 }, Faction.PLAYER, [UnitTag.BRANDMARKED]);
    cleaved.stats.currentHp = 1;
    const blockers = [
      unit({ x: 3, y: 4 }), unit({ x: 5, y: 4 }), unit({ x: 4, y: 3 }),
    ];
    const initial = stateWith([attacker, defender, cleaved, ...blockers]);
    initial.grid[4][4].isLava = true;
    const { state, result } = attack(initial, attacker, defender);

    expect(result?.advancedTo).toEqual(defender.position);
    expect(state.grid[5][4].unitId).toBe(attacker.id);
    expect(state.units[cleaved.id]).toBeUndefined();
    expect(Object.values(state.units).filter((entry) => entry.type === UnitType.EMBER_DEMON)).toEqual([]);
    expect(state.gameStats.unitsLost).toBe(2);
  });

  it('leaves eligible gravestones for both pierce and cleave impact deaths', () => {
    const attacker = attackerWith([UnitTag.PIERCE, UnitTag.CLEAVE]);
    attacker.faction = Faction.ENEMY;
    const defender = unit({ x: 4, y: 5 }, Faction.PLAYER);
    defender.stats.currentHp = defender.stats.maxHp = 1000;
    const rear = unit({ x: 5, y: 5 }, Faction.PLAYER, [UnitTag.REVIVABLE]);
    rear.stats.currentHp = 1;
    const cleaved = unit({ x: 4, y: 4 }, Faction.PLAYER, [UnitTag.REVIVABLE]);
    cleaved.stats.currentHp = 1;
    const { state } = attack(stateWith([attacker, defender, rear, cleaved]), attacker, defender);

    expect(state.gameStats.unitsLost).toBe(2);
    expect(state.units[rear.id]).toBeUndefined();
    expect(state.units[cleaved.id]).toBeUndefined();
    expect(state.grid[5][5].buildingId).not.toBeNull();
    expect(state.grid[4][4].buildingId).not.toBeNull();
    expect(Object.values(state.buildings).map((building) => building.gravesUnitType))
      .toEqual([rear.type, cleaved.type]);
  });

  it.each([Faction.PLAYER, Faction.ENEMY])(
    'applies faction-gated Ember Demon crystal rewards to pierce and cleave kills by a %s source',
    (sourceFaction) => {
      const attacker = attackerWith([UnitTag.PIERCE, UnitTag.CLEAVE]);
      attacker.faction = sourceFaction;
      const victimFaction = sourceFaction === Faction.PLAYER ? Faction.ENEMY : Faction.PLAYER;
      const defender = unit({ x: 4, y: 5 }, victimFaction);
      defender.stats.currentHp = defender.stats.maxHp = 1000;
      const rear = unit(
        { x: 5, y: 5 }, victimFaction, [...UNIT_DEFINITIONS.EMBER_DEMON.tags], UnitType.EMBER_DEMON,
      );
      rear.stats.currentHp = 1;
      const cleaved = unit(
        { x: 4, y: 4 }, victimFaction, [...UNIT_DEFINITIONS.EMBER_DEMON.tags], UnitType.EMBER_DEMON,
      );
      cleaved.stats.currentHp = 1;
      const { state } = attack(stateWith([attacker, defender, rear, cleaved]), attacker, defender);

      expect(state.units[defender.id]).toBeDefined();
      expect(state.units[rear.id]).toBeUndefined();
      expect(state.units[cleaved.id]).toBeUndefined();
      expect(state.arcaneCrystals).toBe(
        sourceFaction === Faction.PLAYER ? MAGE.EMBER_DEMON_KILL_CRYSTAL_REWARD * 2 : 0,
      );
    },
  );

  it('sweeps unresolved zero-HP units with graves, cave cleanup, and death effects but keeps pending brandmarks', () => {
    const attacker = attackerWith();
    const defender = unit({ x: 4, y: 5 });
    defender.stats.currentHp = defender.stats.maxHp = 1000;
    const deadPlayer = unit({ x: 1, y: 1 }, Faction.PLAYER, [UnitTag.REVIVABLE]);
    deadPlayer.stats.currentHp = 0;
    const deadQork = qorkAt(7, 8, 0);
    const neighbor = unit({ x: 7, y: 9 });
    const monster = unit({ x: 6, y: 8 }, Faction.ENEMY, [], UnitType.CAVE_MONSTER);
    monster.stats.currentHp = 0;
    const pending = unit({ x: 0, y: 0 }, Faction.PLAYER, [UnitTag.BRANDMARKED]);
    pending.stats.currentHp = 0;
    const initial = stateWith([attacker, defender, deadPlayer, deadQork, neighbor, monster, pending]);
    initial.pendingBrandmarkTransforms.push({ unitId: pending.id, position: pending.position });
    initial.activeCaveEncounters = [{ monsterId: monster.id }] as GameState['activeCaveEncounters'];
    const { state, events } = attack(initial, attacker, defender);

    expect(state.units[deadPlayer.id]).toBeUndefined();
    expect(state.grid[1][1].buildingId).not.toBeNull();
    expect(state.gameStats.unitsLost).toBe(1);
    expect(state.units[deadQork.id]).toBeUndefined();
    expect(state.grid[8][7].status).toBe(TileStatus.CORRUPTED);
    expect(state.units[neighbor.id].stats.currentHp)
      .toBe(neighbor.stats.currentHp - CORRUPTED_QORK.DEATH_EXPLOSION_DAMAGE);
    expect(state.activeCaveEncounters).toEqual([]);
    expect(events).toContainEqual({ type: 'CAVE_MONSTER_KILLED', monsterId: monster.id });
    expect(state.units[pending.id]).toBeDefined();
    expect(events.filter((event) => event.type === 'UNIT_DEATH').map((event) => event.unitId))
      .toEqual([deadPlayer.id, deadQork.id, monster.id]);
  });

  it.each([Faction.PLAYER, Faction.ENEMY])(
    'attributes new residual hostile deaths to a %s source without crediting stale deaths',
    (sourceFaction) => {
      const attacker = attackerWith();
      attacker.faction = sourceFaction;
      const defender = qorkAt(4, 5);
      defender.faction = sourceFaction === Faction.PLAYER ? Faction.ENEMY : Faction.PLAYER;
      const residual = unit({ x: 7, y: 8 });
      const stale = unit({ x: 0, y: 1 });
      stale.stats.currentHp = 0;
      const resolveDeath = infestedSystem.resolveInfestedDeath;
      const deathEffect = vi.spyOn(infestedSystem, 'resolveInfestedDeath').mockImplementation(
        (draft, deceased, events) => {
          // Inject a missed removal to exercise the wrapper fallback, not normal combat.
          if (deceased.id === defender.id) draft.units[residual.id].stats.currentHp = 0;
          resolveDeath(draft, deceased, events);
        },
      );
      try {
        const { state, events } = attack(
          stateWith([attacker, defender, residual, stale]), attacker, defender,
        );

        expect(state.units[residual.id]).toBeUndefined();
        expect(state.units[stale.id]).toBeUndefined();
        expect(state.gameStats.unitsKilled).toBe(sourceFaction === Faction.PLAYER ? 2 : 0);
        expect(events.filter((event) => event.type === 'UNIT_DEATH').map((event) => event.unitId))
          .toEqual([residual.id, stale.id]);
      } finally {
        deathEffect.mockRestore();
      }
    },
  );
});
