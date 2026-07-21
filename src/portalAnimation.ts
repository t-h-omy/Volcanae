import type { Position } from './types';

export function selectPortalUsedCameraEndpoint(
  fromPos: Position,
  toPos: Position,
  isFromRevealed: boolean,
): Position {
  return isFromRevealed ? fromPos : toPos;
}
