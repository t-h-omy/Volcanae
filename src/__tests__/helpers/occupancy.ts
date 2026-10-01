/**
 * Shared test assertion for the unit/grid occupancy invariant.
 *
 * After any simulation step the following must hold:
 *  - every live unit has exactly one position,
 *  - grid[unit.position.y][unit.position.x].unitId === unit.id,
 *  - no two live units share the same (x, y) position,
 *  - no grid tile points at a unit that does not exist or stands elsewhere.
 */

import { expect } from 'vitest';
import type { GameState } from '../../types';

export function expectUnitGridOccupancyConsistent(state: GameState): void {
  const seenPositions = new Map<string, string>();

  for (const unit of Object.values(state.units)) {
    const { x, y } = unit.position;
    const tile = state.grid[y]?.[x];
    expect(tile, `unit ${unit.id} stands outside the grid at (${x}, ${y})`).toBeTruthy();
    expect(
      tile!.unitId,
      `grid tile (${x}, ${y}) should be owned by unit ${unit.id}`,
    ).toBe(unit.id);

    const key = `${x},${y}`;
    const other = seenPositions.get(key);
    expect(other, `units ${other} and ${unit.id} share position (${x}, ${y})`).toBeUndefined();
    seenPositions.set(key, unit.id);
  }

  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.unitId === null) continue;
      const occupant = state.units[tile.unitId];
      expect(
        occupant,
        `grid tile (${tile.position.x}, ${tile.position.y}) references missing unit ${tile.unitId}`,
      ).toBeTruthy();
      expect(
        { x: occupant!.position.x, y: occupant!.position.y },
        `unit ${tile.unitId} position disagrees with its grid tile`,
      ).toEqual({ x: tile.position.x, y: tile.position.y });
    }
  }
}
