export interface CameraPose {
  x: number;
  y: number;
  zoom: number;
}

export function cubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const coordinate = (a1: number, a2: number, t: number) => (
    ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t
  );
  const derivative = (a1: number, a2: number, t: number) => (
    3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1
  );

  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;

    let parameter = progress;
    let converged = false;
    for (let iteration = 0; iteration < 8; iteration++) {
      const error = coordinate(x1, x2, parameter) - progress;
      if (Math.abs(error) < 1e-7) {
        converged = true;
        break;
      }
      const slope = derivative(x1, x2, parameter);
      if (Math.abs(slope) < 1e-7) break;
      const next = parameter - error / slope;
      if (next < 0 || next > 1) break;
      parameter = next;
    }

    if (!converged) {
      let lower = 0;
      let upper = 1;
      for (let iteration = 0; iteration < 24; iteration++) {
        parameter = (lower + upper) / 2;
        const x = coordinate(x1, x2, parameter);
        if (Math.abs(x - progress) < 1e-7) break;
        if (x < progress) lower = parameter;
        else upper = parameter;
      }
    }

    return coordinate(y1, y2, parameter);
  };
}

export function interpolatePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}

export interface CameraTween {
  from: CameraPose;
  to: CameraPose;
  startMs: number;
  durationMs: number;
}

export function sampleTween(
  tween: CameraTween,
  nowMs: number,
  ease: (t: number) => number,
): { pose: CameraPose; done: boolean } {
  if (tween.durationMs <= 0) return { pose: tween.to, done: true };
  const progress = Math.min(1, Math.max(0, (nowMs - tween.startMs) / tween.durationMs));
  if (progress >= 1) return { pose: tween.to, done: true };
  return { pose: interpolatePose(tween.from, tween.to, ease(progress)), done: false };
}
