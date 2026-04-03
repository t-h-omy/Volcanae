/**
 * Input configuration for Volcanae.
 * Touch/pointer interaction constants (swipe inertia, velocity thresholds).
 * Pure presentation values — no gameplay logic depends on these.
 */

export const INPUT = {
  /** Inertia friction multiplier applied per animation frame (0–1, closer to 1 = longer glide) */
  SWIPE_FRICTION: 0.95,
  /** Minimum velocity (px/ms) below which inertia stops */
  SWIPE_MIN_VELOCITY: 0.01,
} as const;
