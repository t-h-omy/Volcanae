/**
 * Rendering configuration for Volcanae.
 * Tile sizes, breakpoints, opacity values, color palette, and camera constants.
 * Pure presentation values — no gameplay logic depends on these.
 */

export const RENDER = {
  /** Tile size on desktop in pixels */
  TILE_SIZE_DESKTOP: 80,
  /** Tile size on mobile in pixels */
  TILE_SIZE_MOBILE: 64,
  /** Mobile breakpoint in pixels */
  MOBILE_BREAKPOINT: 768,
  /** Opacity of a unit graphic when it has no actions remaining (0.0–1.0) */
  UNIT_EXHAUSTED_OPACITY: 0.5,
  /** Colors for tile rendering */
  COLORS: {
    UNREVEALED: '#d8d8d8',
    GRASS: '#4a8c3f',
    LAVA: '#e25822',
    LAVA_PREVIEW_OVERLAY: 'rgba(226, 88, 34, 0.35)',
    BUILDING_PLAYER: '#3a7bd5',
    BUILDING_ENEMY: '#c0392b',
    BUILDING_NEUTRAL: '#4a8c3f',
    REACHABLE_OVERLAY: 'rgba(58, 123, 213, 0.35)',
    ATTACKABLE_OVERLAY: 'rgba(192, 57, 43, 0.35)',
    HP_GREEN: '#2ecc71',
    HP_RED: '#e74c3c',
    LAVA_BOOST_BAR: '#e67e22',
    /** Colour of the heal floater text */
    HEAL_FLOATER: '#2ecc71',
    /** Colour of the level-up floater text */
    LEVEL_UP_FLOATER: '#f1c40f',
    /** Colour of the XP-gain floater text */
    XP_FLOATER: '#e8c94f',
    /** Drop-shadow colour used in the level-up pulse animation */
    LEVEL_UP_GLOW: 'gold',
  },
  /** Camera smooth animation duration in ms */
  CAMERA_ANIMATION_MS: 400,
  /** Zoom limits and defaults */
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 1.25,
  ZOOM_DEFAULT: 1.0,
  ZOOM_STEP: 0.05,
} as const;
