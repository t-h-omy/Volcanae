/**
 * Rendering configuration for Volcanae.
 * Tile sizes, breakpoints, filter values, color palette, and camera constants.
 * Pure presentation values - no gameplay logic depends on these.
 */

export const RENDER = {
  /** Tile size on desktop in pixels */
  TILE_SIZE_DESKTOP: 80,
  /** Tile size on mobile in pixels */
  TILE_SIZE_MOBILE: 64,
  /** Mobile breakpoint in pixels */
  MOBILE_BREAKPOINT: 768,
  /** CSS filter applied to a unit graphic when it has no actions remaining */
  UNIT_EXHAUSTED_FILTER: 'saturate(0.55) brightness(0.75)',
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
    HEALABLE_OVERLAY: 'rgba(46, 204, 113, 0.35)',
    /** Secondary highlight for FROZEN-tile slide destinations when previewing a move */
    SLIDE_PREVIEW_OVERLAY: 'rgba(130, 220, 255, 0.45)',
    /** Background colour for CANYON terrain tiles */
    CANYON: '#5C3D1E',
    /** Background colour for WATER terrain tiles */
    WATER: '#4AABDB',
    HP_GREEN: '#2ecc71',
    HP_RED: '#e74c3c',
    LAVA_BOOST_BAR: '#e67e22',
    /** Colour of the heal floater text */
    HEAL_FLOATER: '#2ecc71',
    /** Colour of the level-up floater text */
    LEVEL_UP_FLOATER: '#f1c40f',
    /** Colour of the XP-gain floater text */
    XP_FLOATER: '#e8c94f',
    /** Colour of the revive floater text */
    REVIVE_FLOATER: '#c77dff',
    /** Colour of the ember-level floater text */
    EMBER_LEVEL_FLOATER: '#ffbf66',
    /** Drop-shadow colour used in the level-up pulse animation */
    LEVEL_UP_GLOW: 'gold',
    /** HP bar outline colour when the selected player unit has an active debuff */
    DEBUFF_BORDER: '#B04CFF',
  },
  /** Camera smooth animation duration in ms */
  CAMERA_ANIMATION_MS: 400,
  /** Zoom limits and defaults */
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 1.25,
  ZOOM_DEFAULT: 1.0,
  ZOOM_STEP: 0.05,
} as const;
