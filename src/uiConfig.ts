/**
 * UI configuration for Volcanae.
 * Floater sizes, font sizes, popup timings, and other HUD constants.
 * Pure presentation values — no gameplay logic depends on these.
 */

export const UI = {
  /** Total lifetime of a damage number before removal */
  DAMAGE_FLOAT_DURATION_MS: 2500,
  /** How far upward the number floats (half a tile height) */
  DAMAGE_FLOAT_RISE_PX: 20,
  /** Font size for damage/general floaters (px) */
  DAMAGE_FLOATER_FONT_SIZE_PX: 14,
  /** Font size for level-up floaters (px) — larger for emphasis */
  LEVEL_UP_FLOATER_FONT_SIZE_PX: 16,
  /** Font size for XP-gain floaters (px) — smaller/subtler */
  XP_FLOATER_FONT_SIZE_PX: 12,
  /** Font size for the HP number shown above a unit (px) */
  UNIT_HP_TEXT_FONT_SIZE_PX: 8,
  /** Duration of the bounce animation on the capture-ready indicator */
  CAPTURE_INDICATOR_BOUNCE_DURATION_MS: 700,
  /** How long the turn label is fully visible before fading out */
  TURN_POPUP_DISPLAY_MS: 2000,
  /** Duration of the turn popup fade-out */
  TURN_POPUP_FADE_MS: 400,
} as const;
