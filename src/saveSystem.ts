/**
 * Save system for Volcanae.
 * Persists GameState to localStorage and restores it on startup.
 *
 * Format: { version: number, state: GameState }
 * On version mismatch or parse error the load returns null so the caller
 * falls back to generating a fresh game.
 */

import type { GameState } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

const SAVE_KEY = 'volcanae-save';

/** Increment this whenever the serialized shape changes incompatibly. */
const SAVE_VERSION = 1;

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
