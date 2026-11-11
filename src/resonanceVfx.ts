import { ANIMATION } from '../config/animation';
import { MAP } from '../config/map';

export function getResonanceOverviewZoom(viewportWidth: number, tileSize: number, zoom: number): number {
  return Math.min(zoom, viewportWidth / (MAP.GRID_WIDTH * tileSize));
}

interface Point {
  x: number;
  y: number;
}

export interface ResonanceLightningPaths {
  mainPath: string;
  branchPaths: string[];
}

function pathThrough(points: Point[]): string {
  return points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

export function createResonanceLightningPaths(
  from: Point,
  to: Point,
  tileSize: number,
): ResonanceLightningPaths {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { mainPath: '', branchPaths: [] };

  const perpendicular = { x: -dy / length, y: dx / length };
  const direction = { x: dx / length, y: dy / length };
  const jagAmplitude = tileSize * ANIMATION.RESONANCE_BOLT_JAGGEDNESS_TILES;
  const offsets = ANIMATION.RESONANCE_BOLT_JAG_PATTERN;
  const points = offsets.map((offset, index) => {
    const progress = index / (offsets.length - 1);
    return {
      x: from.x + dx * progress + perpendicular.x * jagAmplitude * offset,
      y: from.y + dy * progress + perpendicular.y * jagAmplitude * offset,
    };
  });
  const branchLength = tileSize * ANIMATION.RESONANCE_BOLT_BRANCH_LENGTH_TILES;
  const branchPaths = ANIMATION.RESONANCE_BOLT_BRANCH_POSITION_RATIOS.map((ratio, index) => {
    const pointIndex = Math.round((points.length - 1) * ratio);
    const anchor = points[pointIndex];
    const side = index === 0 ? -1 : 1;
    const bend = {
      x: anchor.x + perpendicular.x * branchLength * side,
      y: anchor.y + perpendicular.y * branchLength * side,
    };
    const tip = {
      x: bend.x + direction.x * branchLength * ANIMATION.RESONANCE_BOLT_BRANCH_FORWARD_RATIO,
      y: bend.y + direction.y * branchLength * ANIMATION.RESONANCE_BOLT_BRANCH_FORWARD_RATIO,
    };
    return pathThrough([anchor, bend, tip]);
  });

  return { mainPath: pathThrough(points), branchPaths };
}
