import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { CORRUPTED_QORK, SAVE, TAG_INFO, UNIT_DEFINITIONS } from '../gameConfig';
import { isCorruptionBoundDrainActive, processCorruptedQorkDrain } from '../corruptedQorkSystem';
import type { GameEvent } from '../gameEvents';
import { generateInitialGameState } from '../mapGenerator';
import { loadSlot, openSaveDb, saveSlotStrict, SAVE_VERSION } from '../saveSystem';
import { Faction, TileStatus, UnitTag, UnitType } from '../types';
import type { GameState, Unit } from '../types';

let state: GameState;
let template: Unit;

function addUnit(
  id: string,
  type: UnitType = UnitType.SPEARMAN,
  faction: Faction = Faction.PLAYER,
  tags: UnitTag[] = [UnitTag.CORRUPTION_BOUND],
): Unit {
  const definition = UNIT_DEFINITIONS[type];
  const unit: Unit = {
    ...template,
    id,
    type,
    faction,
    controllerMageId: null,
    recruitedOnTurn: 0,
    spellsCastThisTurn: 0,
    position: { x: Object.keys(state.units).length + 1, y: 4 },
    tags: [...tags],
    stats: {
      ...template.stats,
      maxHp: definition.maxHp,
      currentHp: definition.maxHp,
      attack: definition.attack,
      defense: definition.defense,
    },
  };
  state.units[id] = unit;
  state.grid[unit.position.y][unit.position.x].unitId = id;
  return unit;
}

async function writeRawSave(id: string, version: number, savedState: GameState): Promise<void> {
  const db = await openSaveDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SAVE.STORE_DATA, 'readwrite');
    transaction.objectStore(SAVE.STORE_DATA).put({ id, version, state: savedState });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  state = generateInitialGameState();
  template = Object.values(state.units).find((unit) => unit.faction === Faction.PLAYER)!;
  state.units = {};
  state.buildings = {};
  state.pendingBrandmarkTransforms = [];
  state.gameStats.unitsLost = 0;
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
      tile.status = null;
    }
  }
});

describe('Corruption-Bound', () => {
  it('defines the Qork tag and its configured presentation parameters', () => {
    expect(UNIT_DEFINITIONS.CORRUPTED_QORK.tags).toContain(UnitTag.CORRUPTION_BOUND);
    expect(UNIT_DEFINITIONS.CORRUPTED_QORK.textParams).not.toHaveProperty('hpLoss');
    expect(TAG_INFO[UnitTag.CORRUPTION_BOUND]).toEqual({
      icon: '🥀',
      textParams: { hpLoss: CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS },
    });
  });

  it('uses the same tag, living-unit, and tile-status truth table for any unit type', () => {
    for (const type of [UnitType.SPEARMAN, UnitType.CORRUPTED_QORK]) {
      const unit = addUnit(type, type);
      for (const tagged of [false, true]) {
        unit.tags = tagged ? [UnitTag.CORRUPTION_BOUND] : [];
        for (const currentHp of [0, 1]) {
          unit.stats.currentHp = currentHp;
          for (const status of [null, TileStatus.CORRUPTED, TileStatus.FROZEN, TileStatus.BURNING]) {
            state.grid[unit.position.y][unit.position.x].status = status;
            expect(isCorruptionBoundDrainActive(state, unit)).toBe(
              tagged && currentHp > 0 && status !== TileStatus.CORRUPTED,
            );
          }
        }
      }
    }
  });

  it.each([Faction.PLAYER, Faction.ENEMY])('drains only the requested faction %s and preserves the damage source', (faction) => {
    const otherFaction = faction === Faction.PLAYER ? Faction.ENEMY : Faction.PLAYER;
    const bound = addUnit('bound', UnitType.SPEARMAN, faction);
    const other = addUnit('other', UnitType.SPEARMAN, otherFaction);
    const stripped = addUnit('stripped-qork', UnitType.CORRUPTED_QORK, faction, [UnitTag.RANGED]);
    const safe = addUnit('corrupted-tile', UnitType.CORRUPTED_QORK, faction);
    state.grid[safe.position.y][safe.position.x].status = TileStatus.CORRUPTED;
    const dead = addUnit('dead', UnitType.CORRUPTED_QORK, faction);
    dead.stats.currentHp = 0;
    const events: GameEvent[] = [];
    const after = produce(state, (draft) => processCorruptedQorkDrain(draft, faction, events));

    expect(after.units[bound.id].stats.currentHp).toBe(bound.stats.currentHp - CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS);
    for (const untouched of [other, stripped, safe, dead]) {
      expect(after.units[untouched.id]).toEqual(untouched);
    }
    expect(events).toEqual([{
      type: 'TILE_DAMAGE',
      unitId: bound.id,
      position: bound.position,
      amount: CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS,
      damageAmount: CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS,
      damageSource: 'QORK_DRAIN',
    }]);
  });

  it.each([Faction.PLAYER, Faction.ENEMY])('caps lethal damage and removes a bound non-Qork of faction %s', (faction) => {
    const bound = addUnit('lethal', UnitType.SPEARMAN, faction);
    bound.stats.currentHp = CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS - 1;
    const events: GameEvent[] = [];
    const after = produce(state, (draft) => processCorruptedQorkDrain(draft, faction, events));

    expect(after.units[bound.id]).toBeUndefined();
    expect(after.grid[bound.position.y][bound.position.x].unitId).toBeNull();
    expect(after.gameStats.unitsLost).toBe(faction === Faction.PLAYER ? 1 : 0);
    expect(events).toEqual([
      {
        type: 'TILE_DAMAGE',
        unitId: bound.id,
        position: bound.position,
        amount: bound.stats.currentHp,
        damageAmount: CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS,
        damageSource: 'QORK_DRAIN',
      },
      { type: 'UNIT_DEATH', unitId: bound.id, position: bound.position, faction },
    ]);
  });

  it('retains the existing Stone Skin damage absorption for a bound non-Qork', () => {
    const bound = addUnit('stone', UnitType.SPEARMAN, Faction.PLAYER, [
      UnitTag.CORRUPTION_BOUND, UnitTag.STONE_SKIN,
    ]);
    bound.stoneSkinHp = CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS;
    const after = produce(state, (draft) => processCorruptedQorkDrain(draft, Faction.PLAYER, []));
    expect(after.units[bound.id].stats.currentHp).toBe(bound.stats.currentHp);
    expect(after.units[bound.id].tags).not.toContain(UnitTag.STONE_SKIN);
  });

  it('preserves deferred Brandmarked removal for a bound non-Qork', () => {
    const bound = addUnit('brandmarked', UnitType.SPEARMAN, Faction.PLAYER, [
      UnitTag.CORRUPTION_BOUND, UnitTag.BRANDMARKED,
    ]);
    bound.stats.currentHp = CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS;
    const events: GameEvent[] = [];
    const after = produce(state, (draft) => {
      processCorruptedQorkDrain(draft, Faction.PLAYER, events);
      processCorruptedQorkDrain(draft, Faction.PLAYER, events);
    });
    expect(after.units[bound.id].stats.currentHp).toBe(0);
    expect(after.grid[bound.position.y][bound.position.x].unitId).toBe(bound.id);
    expect(after.pendingBrandmarkTransforms).toEqual([{ unitId: bound.id, position: bound.position }]);
    expect(events.filter((event) => event.type === 'UNIT_DEATH')).toHaveLength(1);
  });
});

describe('Corruption-Bound save migration', () => {
  it('loads v22 saves through the public API and backfills every Qork exactly once', async () => {
    expect(SAVE_VERSION).toBe(23);
    const playerQork = addUnit('player-qork', UnitType.CORRUPTED_QORK, Faction.PLAYER, [UnitTag.RANGED]);
    const enemyQork = addUnit('enemy-qork', UnitType.CORRUPTED_QORK, Faction.ENEMY, []);
    enemyQork.stats.currentHp = 0;
    const alreadyBound = addUnit('bound-qork', UnitType.CORRUPTED_QORK);
    const other = addUnit('other', UnitType.SPEARMAN, Faction.PLAYER, [UnitTag.BUILDANDCAPTURE]);
    const taggedOther = addUnit('tagged-other');
    await writeRawSave('v22', 22, state);

    const loaded = await loadSlot('v22');
    expect(loaded).not.toBeNull();
    for (const qork of [playerQork, enemyQork, alreadyBound]) {
      expect(loaded!.units[qork.id].tags).toEqual(
        qork.tags.includes(UnitTag.CORRUPTION_BOUND) ? qork.tags : [...qork.tags, UnitTag.CORRUPTION_BOUND],
      );
      expect(loaded!.units[qork.id].tags.filter((tag) => tag === UnitTag.CORRUPTION_BOUND)).toHaveLength(1);
    }
    expect(loaded!.units[other.id]).toEqual(other);
    expect(loaded!.units[taggedOther.id]).toEqual(taggedOther);

    await writeRawSave('v22-again', 22, loaded!);
    const remigrated = await loadSlot('v22-again');
    expect(remigrated!.units).toEqual(loaded!.units);
    await saveSlotStrict({ id: 'v23-roundtrip', name: 'Bound', state: loaded! });
    expect((await loadSlot('v23-roundtrip'))!.units).toEqual(loaded!.units);
  });

  it('does not re-add a deliberately stripped tag in current-version saves', async () => {
    const stripped = addUnit('stripped', UnitType.CORRUPTED_QORK, Faction.PLAYER, [UnitTag.RANGED]);
    await saveSlotStrict({ id: 'v23-stripped', name: 'Stripped', state });
    const loaded = await loadSlot('v23-stripped');
    expect(loaded!.units[stripped.id].tags).toEqual([UnitTag.RANGED]);
  });
});
