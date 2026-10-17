/**
 * Crystal Khyron: Resonance tag lifecycle and Resonant Assimilation.
 *
 * - RESONANCE is granted while a Crystal Chamber resonates (never by caves alone).
 * - The first eligible enemy unit kill or building destruction in each active
 *   Resonance queues a snapshot of the defeated source's transferable tags. The queue is
 *   applied once the current action resolves, earning a manual level-up. Tags
 *   are inherited only when the player confirms the banked level-ups.
 */

import type { Draft } from 'immer';
import type { Building, GameState, Unit } from './types';
import type { GameEvent } from './gameEvents';
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

/** Whether the Khyron may hold RESONANCE at any level. */
export function canKhyronResonate(unit: Pick<Unit, 'type' | 'faction'>): boolean {
  return unit.type === UnitType.CRYSTAL_KHYRON && unit.faction === Faction.PLAYER;
}

/** Number of additional Resonance levels this Khyron can bank before leveling up. */
export function getKhyronBankableLevels(
  unit: Pick<Unit, 'level' | 'earnedAssimilationLevels'>,
): number {
  return Math.max(0, CRYSTAL_KHYRON.MAX_LEVEL - unit.level - (unit.earnedAssimilationLevels ?? 0));
}

/** Whether the Khyron holds RESONANCE and it is currently active (a trigger occurred since it was recruited or last spent it). */
export function isKhyronResonanceActive(unit: Pick<Unit, 'tags' | 'resonanceActive'>): boolean {
  return unit.tags.includes(UnitTag.RESONANCE) && !!unit.resonanceActive;
}

/** Heals every resonating player Khyron at the start of the turn (capped at max HP). */
export function healResonatingKhyrons(state: Draft<GameState>, events?: GameEvent[]): void {
  for (const unit of Object.values(state.units)) {
    if (!canKhyronResonate(unit) || !isKhyronResonanceActive(unit)) continue;
    const previousHp = unit.stats.currentHp;
    unit.stats.currentHp = Math.min(unit.stats.maxHp, unit.stats.currentHp + ABILITIES.RESONANCE_HEAL_AMOUNT);
    const amount = unit.stats.currentHp - previousHp;
    if (amount > 0) {
      events?.push({ type: 'UNIT_HEAL', unitId: unit.id, position: { ...unit.position }, amount });
    }
  }
}

/** Returns the whitelisted tags from the given tag list (order of the whitelist). */
export function filterTransferableTags(tags: readonly UnitTag[]): UnitTag[] {
  return CRYSTAL_KHYRON.TRANSFERABLE_TAGS.filter((tag) => tags.includes(tag));
}

/** True when any player Crystal Chamber is currently resonating. */
export function isAnyChamberResonating(state: KhyronState): boolean {
  return getKhyronResonanceTurnsRemaining(state) > 0;
}

/** Highest remaining countdown among player Crystal Chambers. */
export function getKhyronResonanceTurnsRemaining(state: KhyronState): number {
  let remaining = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.faction === Faction.PLAYER && building.type === BuildingType.CRYSTAL_CHAMBER) {
      remaining = Math.max(remaining, building.resonanceTurnsRemaining);
    }
  }
  return remaining;
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
    delete unit.pendingAssimilationAttackRange;
  }
}

export interface KhyronAssimilationSource {
  faction: Faction | null;
  tags: readonly UnitTag[];
  attackRange: number;
}

/** Snapshot a building before destruction or neutralization changes its ownership. */
export function snapshotKhyronBuildingSource(
  building: Pick<Building, 'faction' | 'tags' | 'combatStats'>,
): KhyronAssimilationSource {
  return {
    faction: building.faction,
    tags: [...building.tags],
    attackRange: building.combatStats?.attackRange ?? 0,
  };
}

/** Queues only the first credited enemy source in an active Resonance action. */
export function recordKhyronAssimilationSource(
  state: Draft<GameState>,
  killerId: string,
  source: KhyronAssimilationSource,
): void {
  const killer = state.units[killerId];
  if (!killer || !canKhyronResonate(killer) || getKhyronBankableLevels(killer) <= 0) return;
  if (source.faction !== Faction.ENEMY) return;
  if (!isKhyronResonanceActive(killer)) return;
  if (killer.pendingAssimilationTags !== undefined) return;
  const transferableTags = filterTransferableTags(source.tags);
  killer.pendingAssimilationTags = transferableTags;
  if (transferableTags.includes(UnitTag.RANGED)) {
    killer.pendingAssimilationAttackRange = source.attackRange;
  }
}

/** Compatibility adapter for existing unit-kill credit callers. */
export function recordKhyronKill(
  state: Draft<GameState>,
  killerId: string,
  victimFaction: Faction,
  victimTags: readonly UnitTag[],
  victimAttackRange: number,
): void {
  recordKhyronAssimilationSource(state, killerId, {
    faction: victimFaction,
    tags: victimTags,
    attackRange: victimAttackRange,
  });
}

/** Converts queued assimilations to earned readiness after an attack fully resolves. */
export function applyPendingAssimilations(state: Draft<GameState>): void {
  for (const unit of Object.values(state.units)) {
    const pending = unit.pendingAssimilationTags;
    if (pending === undefined) continue;
    delete unit.pendingAssimilationTags;
    const pendingRange = unit.pendingAssimilationAttackRange;
    delete unit.pendingAssimilationAttackRange;
    if (!canKhyronResonate(unit) || getKhyronBankableLevels(unit) <= 0) continue;
    unit.earnedAssimilationTags = filterTransferableTags([
      ...(unit.earnedAssimilationTags ?? []),
      ...pending,
    ]);
    unit.earnedAssimilationLevels = (unit.earnedAssimilationLevels ?? 0) + 1;
    if (pending.includes(UnitTag.RANGED) && pendingRange !== undefined) {
      unit.earnedAssimilationAttackRange = Math.max(
        unit.earnedAssimilationAttackRange ?? 0,
        pendingRange,
      );
    }
    unit.resonanceActive = false;
  }
}
