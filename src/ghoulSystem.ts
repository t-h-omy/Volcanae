import type { Draft } from 'immer';
import { GHOUL } from './gameConfig';
import type { GameEvent } from './gameEvents';
import type { GameState } from './types';
import { UnitType } from './types';
import { ANIMATION } from '../config/animation';
import { useCombatAnimationStore } from './combatAnimationStore';
import { useFloaterStore } from './floaterStore';

export function applyGhoulKillHeal(
  state: Draft<GameState>,
  killerId: string,
  victimHpBeforeHit: number,
  events?: GameEvent[],
): number {
  const killer = state.units[killerId];
  if (!killer || killer.type !== UnitType.GHOUL || killer.stats.currentHp <= 0) return 0;

  const heal = Math.min(
    killer.stats.maxHp - killer.stats.currentHp,
    Math.floor(victimHpBeforeHit * GHOUL.KILL_HEAL_PERCENT / 100),
  );
  if (heal <= 0) return 0;

  killer.stats.currentHp += heal;
  const position = { ...killer.position };
  if (events) {
    events.push({ type: 'UNIT_HEAL', unitId: killerId, position, amount: heal });
  } else {
    useFloaterStore.getState().addFloater({
      value: heal,
      x: position.x,
      y: position.y,
      isEnemy: killer.faction !== 'PLAYER',
      floaterType: 'heal',
    });
    useCombatAnimationStore.getState().addTileVfx({
      id: crypto.randomUUID(),
      x: position.x,
      y: position.y,
      variant: 'HEAL',
      durationMs: ANIMATION.HEAL_VFX_MS,
    });
  }
  return heal;
}
