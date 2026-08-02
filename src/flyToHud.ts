export interface ScreenPoint {
  x: number;
  y: number;
}

export function computeFlyToHudControlPoint(
  from: ScreenPoint,
  to: ScreenPoint,
  curveOffsetRatio: number,
): ScreenPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: from.x, y: from.y };

  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const nx = -dy / distance;
  const ny = dx / distance;
  const offset = distance * curveOffsetRatio;

  return { x: mx + nx * offset, y: my + ny * offset };
}

export function quadraticBezierPoint(
  from: ScreenPoint,
  control: ScreenPoint,
  to: ScreenPoint,
  t: number,
): ScreenPoint {
  const oneMinusT = 1 - t;
  const x = oneMinusT * oneMinusT * from.x + 2 * oneMinusT * t * control.x + t * t * to.x;
  const y = oneMinusT * oneMinusT * from.y + 2 * oneMinusT * t * control.y + t * t * to.y;
  return { x, y };
}
