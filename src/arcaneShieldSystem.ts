/**
 * Arcane Shield: a separate damage-absorbing pool for player Mages, unlocked by Arcane Studies.
 * Absorption itself lives in unitDamage.ts; these helpers only grant and regenerate the pool.
 */

import type { Draft } from 'immer';
import type { GameState, Unit } from './types';
import { Faction, TechFlag } from './types';
import { MAGE } from './gameConfig';
import { isMageUnit } from './unitTraits';

type ShieldState = GameState | Draft<GameState>;

export interface ArcaneShieldGain {
  unitId: string;
  amount: number;
}

export function hasArcaneShieldTech(state: ShieldState): boolean {
  return (state.techFlags ?? []).includes(TechFlag.ARCANE_SHIELD);
}

function isShieldHolder(state: ShieldState, unit: Unit): boolean {
  return hasArcaneShieldTech(state) && unit.faction === Faction.PLAYER && isMageUnit(unit);
}

/** Sets a full pool when the unit is an eligible holder. Returns true when granted. */
export function grantArcaneShield(state: ShieldState, unit: Unit): boolean {
  if (!isShieldHolder(state, unit)) return false;
  unit.arcaneShieldHp = MAGE.ARCANE_SHIELD_MAX_HP;
  return true;
}

export function grantArcaneShieldToAllMages(state: ShieldState): void {
  for (const unit of Object.values(state.units)) grantArcaneShield(state, unit);
}

/** Regenerates every holder's pool and returns the gains that actually happened. */
export function regenerateArcaneShields(state: ShieldState): ArcaneShieldGain[] {
  const gains: ArcaneShieldGain[] = [];
  for (const unit of Object.values(state.units)) {
    if (!isShieldHolder(state, unit)) continue;
    const current = Math.max(0, unit.arcaneShieldHp ?? 0);
    const next = Math.min(MAGE.ARCANE_SHIELD_MAX_HP, current + MAGE.ARCANE_SHIELD_REGEN);
    if (next === current) continue;
    unit.arcaneShieldHp = next;
    gains.push({ unitId: unit.id, amount: next - current });
  }
  return gains;
}
