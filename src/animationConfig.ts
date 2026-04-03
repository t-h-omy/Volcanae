/**
 * Animation configuration for Volcanae.
 * Timing, duration, and keyframe constants for all animated effects.
 * Pure presentation values — no gameplay logic depends on these.
 */

export const ANIMATION = {
  /** Time for viewport to pan to a new target position */
  CAMERA_MOVE_DURATION_MS: 350,
  /** Pause after camera arrives, before action executes */
  PRE_ACTION_IDLE_MS: 150,
  /** Pause after action resolves, before moving to next event */
  POST_ACTION_IDLE_MS: 250,
  /** Longer pause for lava advance — more dramatic weight */
  LAVA_ADVANCE_PAUSE_MS: 700,
  /** Pause after a unit spawns before moving to next event */
  SPAWN_PAUSE_MS: 300,
  /** Melee lunge out + snap back total duration (ms) */
  MELEE_LUNGE_DURATION_MS: 260,
  /** Ranged projectile travel time per tile (ms) */
  RANGED_PROJECTILE_MS_PER_TILE: 80,
  /** Minimum ranged projectile travel time (ms) */
  RANGED_PROJECTILE_MIN_MS: 200,
  /** Maximum ranged projectile travel time (ms) */
  RANGED_PROJECTILE_MAX_MS: 700,
  /** Ranged attacker recoil duration (ms) */
  RANGED_RECOIL_DURATION_MS: 180,
  /** Hit shake duration (ms) */
  HIT_SHAKE_DURATION_MS: 280,
  /** Die skull-flash duration (ms) */
  DIE_FLASH_DURATION_MS: 450,
  /** Die fade-out duration (ms) */
  DIE_FADE_DURATION_MS: 200,
  /** Level-up golden pulse animation duration (ms) */
  LEVEL_UP_ANIM_DURATION_MS: 1000,
  /** Level-up pulse: peak scale at 20% keyframe */
  LEVEL_UP_SCALE_PEAK: 1.35,
  /** Level-up pulse: mid scale at 50% keyframe */
  LEVEL_UP_SCALE_MID1: 1.1,
  /** Level-up pulse: mid scale at 80% keyframe */
  LEVEL_UP_SCALE_MID2: 1.2,
  /** Level-up pulse: peak brightness at 20% keyframe */
  LEVEL_UP_BRIGHTNESS_PEAK: 1.8,
  /** Level-up pulse: mid brightness at 50% keyframe */
  LEVEL_UP_BRIGHTNESS_MID1: 1.4,
  /** Level-up pulse: mid brightness at 80% keyframe */
  LEVEL_UP_BRIGHTNESS_MID2: 1.6,
  /** Level-up pulse: peak drop-shadow blur (px) at 20% keyframe */
  LEVEL_UP_GLOW_PEAK_PX: 8,
  /** Level-up pulse: mid drop-shadow blur (px) at 50% keyframe */
  LEVEL_UP_GLOW_MID1_PX: 5,
  /** Level-up pulse: mid drop-shadow blur (px) at 80% keyframe */
  LEVEL_UP_GLOW_MID2_PX: 6,
} as const;
