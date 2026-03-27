/**
 * Edge-circle range utility for Volcanae.
 *
 * Replaces Manhattan/Chebyshev/Euclidean distance for all tile range checks.
 *
 * System overview:
 * - Each tile (x, y) is an axis-aligned unit square covering [x, x+1] × [y, y+1].
 * - For a source tile, four "edge circles" are defined: one centred at each
 *   edge midpoint (top, bottom, left, right).
 * - A target tile is considered within range R if at least one of these circles
 *   with radius R *strictly* overlaps the interior of the target tile.
 * - Border-only (tangential) contact does NOT count as in-range.
 */

// ============================================================================
// TYPES
// ============================================================================

export type Point = { x: number; y: number };
export type TileCoord = { x: number; y: number };

// ============================================================================
// CONSTANTS
// ============================================================================

/** Epsilon used to shrink the tile rectangle so that tangential touches are excluded. */
const EPS = 1e-9;

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

/**
 * Returns the four edge-midpoint circle centres for a source tile.
 *
 * Tile (tileX, tileY) covers [tileX, tileX+1] × [tileY, tileY+1].
 * Edge centres:
 *   top    = (tileX + 0.5, tileY + 1.0)
 *   bottom = (tileX + 0.5, tileY + 0.0)
 *   left   = (tileX + 0.0, tileY + 0.5)
 *   right  = (tileX + 1.0, tileY + 0.5)
 *
 * @param tileX - X coordinate of the source tile
 * @param tileY - Y coordinate of the source tile
 * @returns Array of four edge-midpoint positions
 */
export function getEdgeCircleCenters(tileX: number, tileY: number): Point[] {
  return [
    { x: tileX + 0.5, y: tileY + 1.0 }, // top
    { x: tileX + 0.5, y: tileY + 0.0 }, // bottom
    { x: tileX + 0.0, y: tileY + 0.5 }, // left
    { x: tileX + 1.0, y: tileY + 0.5 }, // right
  ];
}

/**
 * Tests whether a circle strictly overlaps the interior of a tile.
 *
 * Uses a shrunken inner rectangle (inset by EPS on all sides) so that circles
 * that only touch the tile boundary are correctly rejected.
 *
 * @param cx - Circle centre X
 * @param cy - Circle centre Y
 * @param radius - Circle radius
 * @param tileX - X coordinate of the target tile
 * @param tileY - Y coordinate of the target tile
 * @returns true if the circle has non-zero-area overlap with the tile interior
 */
export function circleStrictlyOverlapsTileInterior(
  cx: number,
  cy: number,
  radius: number,
  tileX: number,
  tileY: number,
): boolean {
  // Shrunken rectangle representing the tile interior
  const innerMinX = tileX + EPS;
  const innerMaxX = tileX + 1 - EPS;
  const innerMinY = tileY + EPS;
  const innerMaxY = tileY + 1 - EPS;

  // Closest point on the shrunken rectangle to the circle centre
  const closestX = Math.max(innerMinX, Math.min(cx, innerMaxX));
  const closestY = Math.max(innerMinY, Math.min(cy, innerMaxY));

  // Squared distance from circle centre to that closest point
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  // Strict overlap: distance must be strictly less than the radius
  return distSq < radius * radius;
}

// ============================================================================
// MAIN RANGE FUNCTIONS
// ============================================================================

/**
 * Returns whether the target tile is within the edge-circle range of the source tile.
 *
 * @param sourceX - X coordinate of the source tile
 * @param sourceY - Y coordinate of the source tile
 * @param targetX - X coordinate of the target tile
 * @param targetY - Y coordinate of the target tile
 * @param radius - Range radius
 * @returns true if at least one edge circle of the source strictly overlaps the target tile
 */
export function isTileWithinEdgeCircleRange(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  radius: number,
): boolean {
  const centers = getEdgeCircleCenters(sourceX, sourceY);
  for (const { x: cx, y: cy } of centers) {
    if (circleStrictlyOverlapsTileInterior(cx, cy, radius, targetX, targetY)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns all tile coordinates within the edge-circle range of a source tile,
 * clamped to the map bounds.
 *
 * @param sourceX - X coordinate of the source tile
 * @param sourceY - Y coordinate of the source tile
 * @param radius - Range radius
 * @param mapWidth - Width of the map in tiles
 * @param mapHeight - Height of the map in tiles
 * @returns Array of tile coordinates within range (excluding the source tile itself)
 */
export function getTilesWithinEdgeCircleRange(
  sourceX: number,
  sourceY: number,
  radius: number,
  mapWidth: number,
  mapHeight: number,
): TileCoord[] {
  // Bounding box: circle centres sit at tile edges, and tiles have area,
  // so extend by 2 in each direction for safety, then clamp to map bounds.
  const minX = Math.max(0, Math.floor(sourceX - radius - 2));
  const maxX = Math.min(mapWidth - 1, Math.ceil(sourceX + radius + 2));
  const minY = Math.max(0, Math.floor(sourceY - radius - 2));
  const maxY = Math.min(mapHeight - 1, Math.ceil(sourceY + radius + 2));

  const result: TileCoord[] = [];

  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      if (isTileWithinEdgeCircleRange(sourceX, sourceY, tx, ty, radius)) {
        result.push({ x: tx, y: ty });
      }
    }
  }

  return result;
}
