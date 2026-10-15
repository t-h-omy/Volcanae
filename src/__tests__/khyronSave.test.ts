import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { produce } from 'immer';
import { generateInitialGameState } from '../mapGenerator';
import { loadSlot, openSaveDb, saveSlotStrict, SAVE_VERSION } from '../saveSystem';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { SAVE, UNIT_DEFINITIONS } from '../gameConfig';
import { LEVEL_UP_VALUES } from '../../config/progression';
import { Faction, GamePhase, UnitTag, UnitType } from '../types';
import type { GameState, Unit } from '../types';
import { applyPendingAssimilations, expireKhyronResonance, grantKhyronResonance, recordKhyronKill } from '../khyronSystem';
import { shouldLeaveGravestone } from '../combatSystem';
import { getHealTargets } from '../unitActions';
import { revokeEffectsForSpecialist } from '../specialistSystem';

const khyronId = 'saved-khyron';

function makeState(): GameState {
  const state = generateInitialGameState();
  const template = Object.values(state.units).find((unit) => unit.faction === Faction.PLAYER)!;
  const def = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON];
  const unit: Unit = {
    ...template,
    id: khyronId,
    type: UnitType.CRYSTAL_KHYRON,
    faction: Faction.PLAYER,
    position: { x: 4, y: 4 },
    level: 1,
    xp: 0,
    tags: [UnitTag.MECH, UnitTag.RESONANCE],
    resonanceActive: true,
    stats: {
      ...template.stats,
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
    },
  };
  state.units = { [khyronId]: unit };
  state.buildings = {};
  state.phase = GamePhase.PLAYER_TURN;
  for (const row of state.grid) {
    for (const tile of row) {
      tile.unitId = null;
      tile.buildingId = null;
    }
  }
  state.grid[4][4].unitId = khyronId;
  return state;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  useAnimationStore.getState().clear();
});

async function writeRawSave(id: string, version: number, state: GameState): Promise<void> {
  const db = await openSaveDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE.STORE_DATA, 'readwrite');
    tx.objectStore(SAVE.STORE_DATA).put({ id, version, state });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('Khyron persistent assimilation saves', () => {
  it('preserves an earned upgrade through resonance expiry, later turns, confirmation, and repeated reloads', async () => {
    const earned = produce(makeState(), (draft) => {
      recordKhyronKill(draft, khyronId, Faction.ENEMY, [UnitTag.BUILDANDCAPTURE, UnitTag.CLEAVE, UnitTag.FLYING], 1);
      applyPendingAssimilations(draft);
      expireKhyronResonance(draft);
      draft.turn += 3;
      draft.units[khyronId].hasAttackedThisTurn = false;
    });
    await saveSlotStrict({ id: 'khyron', name: 'Khyron', state: earned });
    const loaded = (await loadSlot('khyron'))!;
    expect(loaded.units[khyronId].level).toBe(1);
    expect(loaded.units[khyronId].stats.maxHp).toBe(UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].maxHp);
    expect(loaded.units[khyronId].earnedAssimilationTags).toEqual([UnitTag.CLEAVE, UnitTag.BUILDANDCAPTURE]);
    expect(loaded.units[khyronId].pendingAssimilationTags).toBeUndefined();
    expect(loaded.units[khyronId].tags).not.toContain(UnitTag.BUILDANDCAPTURE);
    useGameStore.setState(loaded);
    useGameStore.getState().levelUpUnit(khyronId);
    const upgraded = useGameStore.getState();
    const maxHp = UNIT_DEFINITIONS[UnitType.CRYSTAL_KHYRON].maxHp + LEVEL_UP_VALUES.HP_BOOST_DEFAULT;
    expect(upgraded.units[khyronId].level).toBe(2);
    expect(upgraded.units[khyronId].stats.maxHp).toBe(maxHp);
    expect(upgraded.units[khyronId].stats.currentHp).toBe(maxHp);
    expect(upgraded.units[khyronId].tags).toContain(UnitTag.MECH);
    expect(upgraded.units[khyronId].tags.filter((tag) => tag === UnitTag.BUILDANDCAPTURE)).toHaveLength(1);
    expect(upgraded.units[khyronId].earnedAssimilationTags).toBeUndefined();
    expect(upgraded.units[khyronId].assimilatedTags).toEqual([UnitTag.CLEAVE, UnitTag.BUILDANDCAPTURE]);
    await saveSlotStrict({ id: 'khyron', name: 'Khyron', state: upgraded });
    const reloaded = (await loadSlot('khyron'))!;
    useGameStore.setState(reloaded);
    useGameStore.getState().levelUpUnit(khyronId);
    expect(useGameStore.getState().units[khyronId].level).toBe(2);
    expect(useGameStore.getState().units[khyronId].stats.maxHp).toBe(maxHp);
    expect(useGameStore.getState().units[khyronId].stats.currentHp).toBe(maxHp);
    expect(useGameStore.getState().units[khyronId].xp).toBe(0);
    expect(useGameStore.getState().units[khyronId].assimilatedTags).toEqual([UnitTag.CLEAVE, UnitTag.BUILDANDCAPTURE]);
  });

  it('retains earned snapshots and banks again after renewed resonance', async () => {
    const state = produce(makeState(), (draft) => {
      recordKhyronKill(draft, khyronId, Faction.ENEMY, [], 1);
      applyPendingAssimilations(draft);
      grantKhyronResonance(draft);
    });
    await saveSlotStrict({ id: 'empty', name: 'Empty', state });
    const loaded = (await loadSlot('empty'))!;
    expect(loaded.units[khyronId].earnedAssimilationTags).toEqual([]);
    expect(loaded.units[khyronId].resonanceActive).toBe(true);
    const next = produce(loaded, (draft) => {
      recordKhyronKill(draft, khyronId, Faction.ENEMY, [UnitTag.BURN], 1);
      applyPendingAssimilations(draft);
    });
    expect(next.units[khyronId].earnedAssimilationTags).toEqual([UnitTag.BURN]);
    expect(next.units[khyronId].earnedAssimilationLevels).toBe(2);
    expect(next.units[khyronId].pendingAssimilationTags).toBeUndefined();
  });

  it('persists multi-level banked tags and the maximum captured Ranged value', async () => {
    const state = makeState();
    state.units[khyronId].earnedAssimilationTags = [UnitTag.BLOCK, UnitTag.RANGED];
    state.units[khyronId].earnedAssimilationLevels = 2;
    state.units[khyronId].earnedAssimilationAttackRange = 5;
    await saveSlotStrict({ id: 'stacked', name: 'Stacked', state });
    const loaded = (await loadSlot('stacked'))!;
    expect(loaded.units[khyronId].earnedAssimilationTags).toEqual([UnitTag.BLOCK, UnitTag.RANGED]);
    expect(loaded.units[khyronId].earnedAssimilationLevels).toBe(2);
    expect(loaded.units[khyronId].earnedAssimilationAttackRange).toBe(5);
  });

  it('clamps restored banked levels so the target never exceeds level 3', async () => {
    const state = makeState();
    state.units[khyronId].level = 2;
    state.units[khyronId].earnedAssimilationTags = [UnitTag.BURN];
    state.units[khyronId].earnedAssimilationLevels = 9;
    await saveSlotStrict({ id: 'overbanked', name: 'Overbanked', state });
    const loaded = (await loadSlot('overbanked'))!;
    expect(loaded.units[khyronId].earnedAssimilationLevels).toBe(1);
  });

  it('normalizes v21 base tags and recovers legacy transient earned kills', async () => {
    const state = makeState();
    state.units[khyronId].tags = [UnitTag.RESONANCE];
    state.units[khyronId].pendingAssimilationTags = [UnitTag.BUILDANDCAPTURE, UnitTag.FLYING, UnitTag.BUILDANDCAPTURE];
    await writeRawSave('legacy-khyron', 21, state);
    const loaded = (await loadSlot('legacy-khyron'))!;
    expect(SAVE_VERSION).toBe(22);
    expect(loaded.units[khyronId].tags).toContain(UnitTag.MECH);
    expect(loaded.units[khyronId].tags).not.toContain(UnitTag.SUMMONED);
    expect(loaded.units[khyronId].earnedAssimilationTags).toEqual([UnitTag.BUILDANDCAPTURE]);
    expect(loaded.units[khyronId].earnedAssimilationLevels).toBe(1);
    expect(loaded.units[khyronId].pendingAssimilationTags).toBeUndefined();
    expect(loaded.units[khyronId].resonanceActive).toBe(false);
    expect(shouldLeaveGravestone(loaded.units[khyronId], { defaultOn: true })).toBe(false);
    const healer = { ...loaded.units[khyronId], id: 'healer', type: UnitType.SCOUT, tags: [UnitTag.PATCHUP], position: { x: 4, y: 5 } };
    loaded.units[healer.id] = healer;
    loaded.grid[5][4].unitId = healer.id;
    loaded.units[khyronId].stats.currentHp -= 1;
    expect(getHealTargets(loaded, healer.id)).not.toContain(khyronId);
  });

  it('migrates v21 Hellbinder tags and normalizes banked range and levels', async () => {
    const state = makeState();
    const unit = state.units[khyronId];
    unit.level = 2;
    unit.tags = [UnitTag.SUMMONED, UnitTag.RESONANCE, UnitTag.CLEAVE, UnitTag.RAGE];
    unit.assimilatedTags = [UnitTag.CLEAVE];
    unit.earnedAssimilationTags = [UnitTag.RANGED];
    unit.earnedAssimilationAttackRange = 4;
    state.globalSpecialistStorage = ['spec_13'];
    await writeRawSave('legacy-tags', 21, state);
    const loaded = (await loadSlot('legacy-tags'))!;
    const migrated = loaded.units[khyronId];
    expect(migrated.tags).toContain(UnitTag.MECH);
    expect(migrated.tags).not.toContain(UnitTag.SUMMONED);
    expect(migrated.tags).toContain(UnitTag.CLEAVE);
    expect(migrated.tags).not.toContain(UnitTag.RAGE);
    expect(migrated.earnedAssimilationLevels).toBe(1);
    expect(migrated.earnedAssimilationAttackRange).toBe(4);
    expect(migrated.earnedAssimilationTags).toEqual([UnitTag.RANGED]);
  });

  it('never restores earned readiness above the normal level cap', async () => {
    const state = makeState();
    state.units[khyronId].level = 3;
    state.units[khyronId].earnedAssimilationTags = [UnitTag.BURN];
    state.units[khyronId].pendingAssimilationTags = [UnitTag.BLOCK];
    await saveSlotStrict({ id: 'capped', name: 'Capped', state });
    const loaded = (await loadSlot('capped'))!;
    expect(loaded.units[khyronId].earnedAssimilationTags).toBeUndefined();
    expect(loaded.units[khyronId].pendingAssimilationTags).toBeUndefined();
  });

  it('preserves legacy assimilated traits when a summoned-tag specialist is removed after loading', async () => {
    const state = makeState();
    state.units[khyronId].level = 2;
    state.units[khyronId].tags = [UnitTag.RESONANCE, UnitTag.CLEAVE, UnitTag.RAGE];
    await saveSlotStrict({ id: 'inherited', name: 'Inherited', state });
    const loaded = (await loadSlot('inherited'))!;
    expect(loaded.units[khyronId].assimilatedTags).toEqual([UnitTag.CLEAVE, UnitTag.RAGE]);
    const revoked = produce(loaded, (draft) => {
      revokeEffectsForSpecialist(draft, draft.specialists.spec_13);
    });
    expect(revoked.units[khyronId].tags).toEqual(expect.arrayContaining([UnitTag.MECH, UnitTag.CLEAVE, UnitTag.RAGE]));
  });
});
