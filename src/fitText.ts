import { UI } from '../config/ui';

export function resolveMinFontSize(
  basePx: number,
  minPx = UI.FIT_TEXT_MIN_FONT_SIZE_PX,
  minScale = UI.FIT_TEXT_MIN_SCALE,
): number {
  return Math.min(basePx, Math.max(minPx, basePx * minScale));
}

export function computeFitFontSize(opts: {
  basePx: number;
  minPx: number;
  stepPx: number;
  fits: (sizePx: number) => boolean;
}): { sizePx: number; fitted: boolean } {
  const { basePx, minPx, stepPx, fits } = opts;
  if (
    !Number.isFinite(basePx) ||
    !Number.isFinite(minPx) ||
    !Number.isFinite(stepPx) ||
    stepPx <= 0
  ) {
    return { sizePx: basePx, fitted: fits(basePx) };
  }

  if (fits(basePx)) return { sizePx: basePx, fitted: true };

  const floorPx = Math.min(basePx, minPx);
  for (let candidatePx = basePx - stepPx; candidatePx > floorPx; candidatePx -= stepPx) {
    if (fits(candidatePx)) return { sizePx: candidatePx, fitted: true };
  }
  if (fits(floorPx)) return { sizePx: floorPx, fitted: true };
  return { sizePx: floorPx, fitted: false };
}
