/**
 * Crystal Khyron: Resonance tag lifecycle and Resonant Assimilation.
 *
 * - RESONANCE is granted while a Crystal Chamber resonates (never by caves alone).
 * - The first enemy kill credited to a resonating Khyron queues an assimilation
 *   (snapshot of the victim's transferable tags). The queue is applied once the
 *   current attack/action has fully resolved, so newly inherited tags never
 *   affect the attack that earned them.
 */

import type { Draft } from 'immer';
import type { GameState, Unit } from './types';
import { BuildingType, Faction, UnitTag, UnitType } from './types';
import { CRYSTAL_KHYRON } from './gameConfig';

type KhyronState = GameState | Draft<GameState>;

/** True when the unit type progresses through Resonant Assimilation instead of XP. */
export function usesAssimilationProgression(unitType: string): boolean {
  return unitType === UnitType.CRYSTAL_KHYRON;
}

export function isCrystalKhyron(unit: Pick<Unit, 'type'> | undefined | null): boolean {
  return !!unit && unit.type === UnitType.CRYSTAL_KHYRON;
}

/** Whether the Khyron may hold RESONANCE (below max level). */
export function canKhyronResonate(unit: Pick<Unit, 'type' | 'faction' | 'level'>): boolean {
  return (
    unit.type === UnitType.CRYSTAL_KHYRON &&
    unit.faction === Faction.PLAYER &&
    unit.level < CRYSTAL_KHYRON.MAX_LEVEL
  );
}

/** Returns the whitelisted tags from the given tag list (order of the whitelist). */
export function filterTransferableTags(tags: readonly UnitTag[]): UnitTag[] {
  return CRYSTAL_KHYRON.TRANSFERABLE_TAGS.filter((tag) => tags.includes(tag));
}

/** True when any player Crystal Chamber is currently resonating. */
export function isAnyChamberResonating(state: KhyronState): boolean {
  return Object.values(state.buildings).some(
    (b) =>
      b.faction === Faction.PLAYER &&
      b.type === BuildingType.CRYSTAL_CHAMBER &&
      b.resonanceTurnsRemaining > 0,
  );
}

/** Grants RESONANCE to every eligible player Khyron (Lv.1 and Lv.2). */
export function grantKhyronResonance(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    if (canKhyronResonate(unit) && !unit.tags.includes(UnitTag.RESONANCE)) {
      unit.tags.push(UnitTag.RESONANCE);
    }
  }
}

/** Removes RESONANCE from Khyrons when no player Crystal Chamber is resonating. */
export function expireKhyronResonance(state: Draft<GameState>): void {
  if (isAnyChamberResonating(state)) return;
  for (const unit of Object.values(state.units)) {
    if (unit.type !== UnitType.CRYSTAL_KHYRON) continue;
    if (unit.tags.includes(UnitTag.RESONANCE)) {
      unit.tags = unit.tags.filter((tag) => tag !== UnitTag.RESONANCE);
    }
    delete unit.pendingAssimilationTags;
  }
}

/**
 * Queues a Resonant Assimilation for a resonating Khyron that has just killed an
 * enemy unit. Only the first credited kill of an action is recorded.
 * Call BEFORE the victim is deleted (or pass the victim's tag snapshot).
 */
export function recordKhyronKill(
  state: Draft<GameState>,
  killerId: string,
  victimFaction: Faction,
  victimTags: readonly UnitTag[],
): void {
  const killer = state.units[killerId];
  if (!killer || !canKhyronResonate(killer)) return;
  if (victimFaction !== Faction.ENEMY) return;
  if (!killer.tags.includes(UnitTag.RESONANCE)) return;
  if (killer.pendingAssimilationTags) return;
  killer.pendingAssimilationTags = filterTransferableTags(victimTags);
}

/** Applies and clears every queued assimilation. Call after an attack fully resolves. */
export function applyPendingAssimilations(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    const pending = unit.pendingAssimilationTags;
    if (!pending) continue;
    delete unit.pendingAssimilationTags;
    if (unit.type !== UnitType.CRYSTAL_KHYRON || unit.level >= CRYSTAL_KHYRON.MAX_LEVEL) continue;
    unit.level += 1;
    for (const tag of pending) {
      if (!unit.tags.includes(tag)) unit.tags.push(tag);
    }
    unit.tags = unit.tags.filter((tag) => tag !== UnitTag.RESONANCE);
  }
}
