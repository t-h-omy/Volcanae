/**
 * Save system for Volcanae.
 * Persists GameState to localStorage and restores it on startup.
 *
 * Format: { version: number, state: GameState }
 * On version mismatch or parse error the load returns null so the caller
 * falls back to generating a fresh game.
 */

import type { GameState } from './types';
import { UnitType, UnitTag, BuildingType } from './types';
import { TECH_TREE, POPULATION } from './gameConfig';

// ============================================================================
// CONSTANTS
// ============================================================================

const SAVE_KEY = 'volcanae-save';

/** Increment this whenever the serialized shape changes incompatibly. */
const SAVE_VERSION = 7;

// ============================================================================
// PUBLIC API
// ============================================================================

/** Serialize game state to localStorage. */
export function saveGameState(state: GameState): void {
  try {
    const payload = JSON.stringify({ version: SAVE_VERSION, state });
    localStorage.setItem(SAVE_KEY, payload);
  } catch {
    // Storage may be unavailable (private-browsing quota, etc.) — fail silently.
  }
}

/**
 * Deserialize game state from localStorage.
 * Returns `null` when no save exists, the data is corrupt, or the version is
 * incompatible, so the caller can fall back to a fresh game.
 */
export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { version: number; state: GameState };

    if (parsed.version !== SAVE_VERSION) return null;
    if (!parsed.state || typeof parsed.state !== 'object') return null;

    const s = parsed.state;
    // Validate the minimum required top-level fields to guard against
    // partially-written or structurally incompatible saves.
    if (
      typeof s.turn !== 'number' ||
      typeof s.phase !== 'string' ||
      !Array.isArray(s.grid) ||
      typeof s.units !== 'object' ||
      typeof s.buildings !== 'object' ||
      typeof s.resources !== 'object'
    ) {
      return null;
    }

    // Migration: PASSIVE tag was added to Emberlings in v0.36.0 without a
    // SAVE_VERSION bump, so saved Emberling units from before that version
    // are missing it. Add it retroactively to all loaded Emberling units.
    for (const unit of Object.values(s.units)) {
      if (unit && unit.type === UnitType.EMBERLING && Array.isArray(unit.tags) && !unit.tags.includes(UnitTag.PASSIVE)) {
        unit.tags.push(UnitTag.PASSIVE);
      }
    }

    // Migration: new tech nodes added to TECH_TREE without a SAVE_VERSION bump
    // will be absent from older saves, causing them to appear permanently locked.
    // Backfill any missing entries as unlocked=false so availability is computed correctly.
    if (s.techNodes && typeof s.techNodes === 'object') {
      for (const def of TECH_TREE) {
        if (!(def.id in s.techNodes)) {
          (s.techNodes as Record<string, { id: string; unlocked: boolean }>)[def.id] = { id: def.id, unlocked: false };
        }
      }
    }

    // Migration: strongholds now track farmers (populationCount) and nobles
    // (strongholdNobles) separately. Older saves used a single populationCount
    // for both. Split it using the base caps so nobles are preserved correctly.
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && b.type === BuildingType.STRONGHOLD && b.strongholdNobles === undefined) {
          const count = typeof b.populationCount === 'number' ? b.populationCount : 0;
          b.populationCount = Math.min(count, POPULATION.STRONGHOLD_FARMER_CAP);
          b.strongholdNobles = Math.max(0, count - POPULATION.STRONGHOLD_FARMER_CAP);
        }
      }
    }

    // Migration: backfill distractionDefPenalty for units from older saves
    // that predate the field being added to the Unit interface.
    if (s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && typeof u.id === 'string' && typeof u.distractionDefPenalty !== 'number') {
          u.distractionDefPenalty = 0;
        }
      }
    }

    return s as GameState;
  } catch {
    return null;
  }
}

/** Remove the saved game from localStorage. */
export function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Fail silently.
  }
}

/** Return true when a saved game is present in localStorage. */
export function hasSavedGame(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

