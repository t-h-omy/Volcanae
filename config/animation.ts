/**
 * Animation configuration for Volcanae.
 * Timing, duration, and keyframe constants for all animated effects.
 * Pure presentation values - no gameplay logic depends on these.
 */

export const ANIMATION = {
  /** Time for viewport to pan to a new target position */
  CAMERA_MOVE_DURATION_MS: 220,
  /** Pause after camera arrives, before action executes */
  PRE_ACTION_IDLE_MS: 80,
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
  /** Ice-slide animation: how long the unit pauses visually on the frozen tile (ms) */
  SLIDE_PAUSE_MS: 100,
  /** Ice-slide animation: travel duration from frozen tile to slide destination (ms) */
  SLIDE_DURATION_MS: 300,
  /** Hit shake duration (ms) */
  HIT_SHAKE_DURATION_MS: 280,
  /** Die skull-flash duration (ms) */
  DIE_FLASH_DURATION_MS: 450,
  /** Die fade-out duration (ms) */
  DIE_FADE_DURATION_MS: 200,
  /** Level-up golden pulse animation duration (ms) */
  LEVEL_UP_ANIM_DURATION_MS: 1000,
  /** XP-gain sparkle animation duration (ms) — shorter/subtler than level-up */
  XP_GAIN_ANIM_DURATION_MS: 600,
  /** Crystal Chamber activation VFX duration (ms) */
  CRYSTAL_ACTIVATE_VFX_DURATION_MS: 1200,
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
  /** Duration of the sanctum radial burst VFX on the building tile (ms) */
  ZONE_CLEARED_SANCTUM_SHATTER_MS: 800,
  /** Duration of each individual expanding shockwave ring (ms) */
  ZONE_CLEARED_SHOCKWAVE_MS: 700,
  /** Stagger delay between per-tile cleared-entity flash bursts (ms) */
  ZONE_CLEARED_TILE_FLASH_STAGGER_MS: 60,
  /** Duration of each per-tile flash burst (ms) */
  ZONE_CLEARED_TILE_FLASH_MS: 500,
  /** How long to wait after all VFX settle before showing the popup (ms) */
  ZONE_CLEARED_SETTLE_MS: 200,
  /** Duration of the expanding shockwave ring for an Emberling explosion (ms) */
  EXPLOSION_SHOCKWAVE_MS: 500,
  /** Duration of the tile flash burst at the Emberling explosion center (ms) */
  EXPLOSION_TILE_FLASH_MS: 600,
  /** Duration of the lava-flash VFX played when a leashed unit defects to the enemy (ms) */
  DEFECT_VFX_DURATION_MS: 600,
  /** Duration of the leash burst VFX shown before a demon defects — leash line is visible during this window (ms) */
  LEASH_BURST_VFX_DURATION_MS: 900,
  /** Duration of the fall/sink animation played after the skull phase of a slide-kill (ms) */
  SLIDE_KILL_FALL_DURATION_MS: 400,
  /** Duration of the expanding cleave slash ring VFX (ms) */
  CLEAVE_VFX_DURATION_MS: 350,
  /**
   * Radius of the cleave ring VFX in tile-widths, measured from the attacker centre.
   * Used by CleaveVfxLayer in GridRenderer.tsx to scale the ring element.
   * Increase to make the ring reach further; 1.25 covers the immediate 8 neighbours.
   */
  CLEAVE_VFX_RADIUS_TILES: 1.25,
  /** Time for the pierce projectile to travel one tile width (ms) */
  PIERCE_VFX_MS_PER_TILE: 160,
  /** Duration of the BURROW_DUST tile VFX shown for tunnel dig-in / emerge (ms) */
  BURROW_DUST_MS: 500,
  /** Delay before applying TUNNEL_DIG_IN state so dust covers the sprite swap (ms) */
  BURROW_DIG_IN_COVER_DELAY_MS: 120,
  /** Delay before applying TUNNEL_EMERGE state so dust covers the sprite swap (ms) */
  BURROW_EMERGE_COVER_DELAY_MS: 120,
  /** Delay after TUNNEL_EMERGE state is applied before firing the cleave rings on damaged adjacent tiles (ms) */
  BURROW_EMERGE_AOE_DELAY_MS: 120,
  /** Duration of the fire-spit line VFX min/max. Distance-scaled like a projectile. */
  FIRE_SPIT_MIN_MS: 300,
  FIRE_SPIT_MAX_MS: 450,
  /** Duration of the lava shield burst shown when a stun is blocked (ms) */
  STUN_BLOCKED_SHIELD_MS: 600,
  /** Duration of the cracked-shield VFX shown when PUNCTURE bypasses defense (ms) */
  DEFENSE_IGNORED_MS: 500,
  /** Duration of the mage spell-cast line from caster to target tile (ms) */
  SPELL_CAST_MS: 650,
  /** Duration of the mage spell impact ring on the target tile (ms) */
  SPELL_IMPACT_MS: 650,
  /** Duration of the stun-applied burst (ms) — reuses SPELL_IMPACT plumbing */
  STUN_APPLIED_BURST_MS: 500,
  /** Duration of the burning-terrain damage flame cue (ms) */
  BURNING_DAMAGE_VFX_MS: 400,
  /** Duration of the idle-heal pulse VFX (ms) */
  HEAL_VFX_MS: 450,
  /** Duration of the corruption-applied dark-purple pulse (ms) */
  CORRUPTION_APPLIED_VFX_MS: 500,
  /** Duration of the portal entrance/exit pop (ms) */
  PORTAL_VFX_MS: 500,
  /** Duration of the unit-spawn pop (ms) */
  SPAWN_VFX_MS: 450,
  /** Duration of the building-capture wash (ms) */
  CAPTURE_VFX_MS: 500,
  /** Duration of flame fly-to-HUD travel (ms) */
  FLY_TO_HUD_DURATION_MS: 700,
  /** Perpendicular control-point offset as a fraction of source-target distance */
  FLY_TO_HUD_CURVE_OFFSET_RATIO: 0.25,
  /** Duration of ember-HUD pulse on flight arrival (ms) */
  FLY_TO_HUD_TARGET_PULSE_MS: 350,
  /** Duration of the strong ember-HUD flash on flight arrival (ms) */
  EMBER_HUD_FLASH_MS: 500,
  /** Grace period added to FLY_TO_HUD_DURATION_MS before the safety-net offset clear fires (ms) */
  EMBER_HUD_OFFSET_GRACE_MS: 400,
  /** Duration of the invalid-action red edge pulse (ms) — kept very short */
  INVALID_ACTION_VFX_MS: 250,
  /** Duration of the pierce connection line (ms) */
  PIERCE_LINE_MS: 320,
} as const;
