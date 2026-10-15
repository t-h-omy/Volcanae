import type { Draft } from 'immer';
import type { GameEvent } from './gameEvents';
import type { GameState } from './types';
import { GHOUL } from './gameConfig';
import { Faction, UnitType } from './types';

export function applyGhoulKillHeal(
  state: Draft<GameState>,
  killerId: string,
  victimHpBeforeHit: number,
  events?: GameEvent[],
): number {
  const killer = state.units[killerId];
  if (
    !killer
    || killer.type !== UnitType.GHOUL
    || killer.faction !== Faction.PLAYER
    || killer.stats.currentHp <= 0
  ) return 0;

  const missingHp = killer.stats.maxHp - killer.stats.currentHp;
  const healedAmount = Math.min(
    Math.floor((victimHpBeforeHit * GHOUL.KILL_HEAL_PERCENT) / 100),
    missingHp,
  );
  if (healedAmount <= 0) return 0;

  killer.stats.currentHp += healedAmount;
  events?.push({
    type: 'UNIT_HEAL',
    unitId: killerId,
    position: { ...killer.position },
    amount: healedAmount,
  });
  return healedAmount;
}
