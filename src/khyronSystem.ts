/**
 * Crystal Khyron: Resonance tag lifecycle and Resonant Assimilation.
 *
 * - RESONANCE is granted while a Crystal Chamber resonates (never by caves alone).
 * - The first enemy kill credited to a resonating Khyron queues an assimilation
 *   (snapshot of the victim's transferable tags). The queue is applied once the
 *   current attack/action has fully resolved, earning a manual level-up. Tags
 *   are inherited only when the player confirms that level-up.
 */

import type { Draft } from 'immer';
import type { GameState, Unit } from './types';
import { BuildingType, Faction, UnitTag, UnitType } from './types';
import { ABILITIES, CRYSTAL_KHYRON } from './gameConfig';

type KhyronState = GameState | Draft<GameState>;

/** True when the unit type progresses through Resonant Assimilation instead of XP. */
export function usesAssimilationProgression(unitType: string): boolean {
  return unitType === UnitType.CRYSTAL_KHYRON;
}

export function isCrystalKhyron(unit: Pick<Unit, 'type'> | undefined | null): boolean {
  return !!unit && unit.type === UnitType.CRYSTAL_KHYRON;
}

/** Whether the Khyron may hold RESONANCE (any level; Lv.3 only gains the heal). */
export function canKhyronResonate(unit: Pick<Unit, 'type' | 'faction'>): boolean {
  return unit.type === UnitType.CRYSTAL_KHYRON && unit.faction === Faction.PLAYER;
}

/** Whether the Khyron can still transform (below max level). */
export function canKhyronTransform(unit: Pick<Unit, 'type' | 'faction' | 'level'>): boolean {
  return canKhyronResonate(unit) && unit.level < CRYSTAL_KHYRON.MAX_LEVEL;
}

/** Whether the Khyron holds RESONANCE and it is currently active (a trigger occurred since it was recruited or last spent it). */
export function isKhyronResonanceActive(unit: Pick<Unit, 'tags' | 'resonanceActive'>): boolean {
  return unit.tags.includes(UnitTag.RESONANCE) && !!unit.resonanceActive;
}

/** Heals every resonating player Khyron at the start of the turn (capped at max HP). */
export function healResonatingKhyrons(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    if (!canKhyronResonate(unit) || !isKhyronResonanceActive(unit)) continue;
    unit.stats.currentHp = Math.min(unit.stats.maxHp, unit.stats.currentHp + ABILITIES.RESONANCE_HEAL_AMOUNT);
  }
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

/** Activates RESONANCE on every player Khyron (all levels) when a new resonance triggers. */
export function grantKhyronResonance(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    if (!canKhyronResonate(unit)) continue;
    if (!unit.tags.includes(UnitTag.RESONANCE)) unit.tags.push(UnitTag.RESONANCE);
    unit.resonanceActive = true;
  }
}

/** Deactivates RESONANCE on Khyrons when no player Crystal Chamber is resonating. */
export function expireKhyronResonance(state: Draft<GameState>): void {
  if (isAnyChamberResonating(state)) return;
  for (const unit of Object.values(state.units)) {
    if (unit.type !== UnitType.CRYSTAL_KHYRON) continue;
    unit.resonanceActive = false;
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
  if (!killer || !canKhyronTransform(killer)) return;
  if (victimFaction !== Faction.ENEMY) return;
  if (!isKhyronResonanceActive(killer)) return;
  if (killer.pendingAssimilationTags !== undefined || killer.earnedAssimilationTags !== undefined) return;
  killer.pendingAssimilationTags = filterTransferableTags(victimTags);
}

/** Converts queued assimilations to earned readiness after an attack fully resolves. */
export function applyPendingAssimilations(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    const pending = unit.pendingAssimilationTags;
    if (pending === undefined) continue;
    delete unit.pendingAssimilationTags;
    if (!canKhyronTransform(unit) || unit.earnedAssimilationTags !== undefined) continue;
    unit.earnedAssimilationTags = filterTransferableTags(pending);
    unit.resonanceActive = false;
  }
}
