import type { Position } from './types';

export function selectPortalUsedCameraEndpoint(
  fromPos: Position,
  toPos: Position,
  isFromRevealed: boolean,
  isToRevealed: boolean,
): Position {
  if (!isFromRevealed && !isToRevealed) return toPos;
  return isFromRevealed ? fromPos : toPos;
}
