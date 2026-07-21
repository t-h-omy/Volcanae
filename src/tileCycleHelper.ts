/**
 * Pure helper for the tap-cycle selection logic on a single tile.
 *
 * The tap cycle (per tile) is:
 *   unit + building  → U → B → T → U → …
 *   unit only        → U → T → U → …
 *   building only    → B → T → B → …
 *
 * This module has no React or Zustand dependencies and can be unit-tested
 * directly.
 */

export type TileCycleTarget = 'unit' | 'building' | 'terrain';

/**
 * Given the current selection state for a tile and its occupants, returns what
 * should be selected next when the player taps the tile.
 *
 * @param selectedOnThisTile  What is currently selected from this tile:
 *   'unit'     – the tile's unit is the active selection,
 *   'building' – the tile's building is the active selection,
 *   'terrain'  – this tile's terrain is the active selection,
 *   null       – nothing from this tile is currently selected (first tap).
 * @param hasUnit          The tile has a unit.
 * @param hasBuilding      The tile has a building.
 * @param canSelectTerrain tile.isRevealed && !tile.isLava
 */
export function nextTileCycleTarget(
  selectedOnThisTile: 'unit' | 'building' | 'terrain' | null,
  hasUnit: boolean,
  hasBuilding: boolean,
  canSelectTerrain: boolean,
): TileCycleTarget {
  if (selectedOnThisTile === 'unit') {
    if (hasBuilding) return 'building';
    if (canSelectTerrain) return 'terrain';
    return 'unit';
  }
  if (selectedOnThisTile === 'building') {
    if (canSelectTerrain) return 'terrain';
    return 'building';
  }
  // 'terrain' or null (first tap / wrap-around): advance to the first occupant
  if (hasUnit) return 'unit';
  if (hasBuilding) return 'building';
  if (canSelectTerrain) return 'terrain';
  return 'terrain';
}
