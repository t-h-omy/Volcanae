import { ENEMY } from './gameConfig';

export function shouldShowTurnPopupEmberRose(turn: number): boolean {
  return turn > 1 && (turn - 1) % ENEMY.THREAT_LEVEL_INCREASE_INTERVAL === 0;
}
