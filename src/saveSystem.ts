/**
 * Save system for Volcanae.
 * Persists GameState to localStorage and restores it on startup.
 *
 * Format: { version: number, state: GameState }
 * On version mismatch or parse error the load returns null so the caller
 * falls back to generating a fresh game.
 */

import type { GameState } from './types';
import { UnitType, UnitTag, BuildingType, TileStatus } from './types';
import { TECH_TREE, POPULATION, SPECIALIST_DEFINITIONS } from './gameConfig';

// ============================================================================
// CONSTANTS
// ============================================================================

const SAVE_KEY = 'volcanae-save';

/** Increment this whenever the serialized shape changes incompatibly. */
const SAVE_VERSION = 11;

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

    if (parsed.version > SAVE_VERSION || parsed.version < 8) return null;
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

    // Migration v8 → v9: UnitType INFANTRY renamed to SPEARMAN.
    // Only unit records need migration here — specialist effects are re-synced
    // from SPECIALIST_DEFINITIONS below, and tech effects are never persisted.
    if (parsed.version < 9 && s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && u.type === 'INFANTRY') {
          u.type = 'SPEARMAN';
        }
      }
    }

    // Migration v10 → v11: 7 enemy UnitType string values were renamed.
    //   LAVA_REAPER → REAPER, LAVA_LANCER → LANCER, LAVA_BREAKER → BULLWARK,
    //   LAVA_PYROCLAST → KINDLER, LAVA_BEAST → GRIMBEAK,
    //   LAVA_BURROWER → RIFTWORM, LAVA_HEXCASTER → RIFT_LORD
    if (parsed.version < 11 && s.units && typeof s.units === 'object') {
      const unitTypeRenames: Record<string, string> = {
        LAVA_REAPER:    'REAPER',
        LAVA_LANCER:    'LANCER',
        LAVA_BREAKER:   'BULLWARK',
        LAVA_PYROCLAST: 'KINDLER',
        LAVA_BEAST:     'GRIMBEAK',
        LAVA_BURROWER:  'RIFTWORM',
        LAVA_HEXCASTER: 'RIFT_LORD',
      };
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && typeof u.type === 'string' && u.type in unitTypeRenames) {
          u.type = unitTypeRenames[u.type];
        }
      }
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

    // Migration: Frostcraft was previously a standalone tech node; it is now
    // included in Arcane Awakening. If ARCANE_AWAKENING is already unlocked
    // but FROSTCRAFT is not yet in unlockedSpells, backfill it.
    {
      const tn = s.techNodes as Record<string, { id: string; unlocked: boolean }> | undefined;
      const us = s.unlockedSpells as string[] | undefined;
      if (tn?.['ARCANE_AWAKENING']?.unlocked && Array.isArray(us) && !us.includes('FROSTCRAFT')) {
        us.push('FROSTCRAFT');
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
        if (u && typeof u.id === 'string' && typeof u.lastMovedTurn !== 'number') {
          u.lastMovedTurn = 0;
        }
        if (u && typeof u.id === 'string' && typeof u.recruitedOnTurn !== 'number') {
          u.recruitedOnTurn = 0;
        }
      }
    }

    // Migration: backfill lastRecruitmentTurn on building records from saves
    // that predate the per-building recruitment-per-turn limit.
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && typeof b.id === 'string' && typeof b.lastRecruitmentTurn !== 'number') {
          b.lastRecruitmentTurn = 0;
        }
      }
    }

    // Migration: backfill specialistSlotCap and activeCaveEncounters for saves
    // that predate these fields being added to GameState.
    const gs = (s as unknown) as Record<string, unknown>;
    if (typeof gs.specialistSlotCap !== 'number') {
      gs.specialistSlotCap = 2;
    }
    if (!Array.isArray(gs.activeCaveEncounters)) {
      gs.activeCaveEncounters = [];
    }
    if (!Array.isArray(gs.unlockedSpells)) {
      gs.unlockedSpells = [];
    }
    if (!('pendingSpellCast' in gs)) {
      gs.pendingSpellCast = null;
    }
    if (!('pendingTransposeFirstUnitId' in gs)) {
      gs.pendingTransposeFirstUnitId = null;
    }
    if (!Array.isArray(gs.pendingBrandmarkTransforms)) {
      gs.pendingBrandmarkTransforms = [];
    }

    // Migration: remove the legacy MAGE tag from all saved units (tag was removed in Bundle 2).
    if (s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && Array.isArray(u.tags)) {
          u.tags = (u.tags as string[]).filter((t) => t !== 'MAGE');
        }
      }
    }

    // Migration: backfill Mage-system per-unit fields added in MS-01–MS-09.
    if (s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && typeof u.id === 'string') {
          if (typeof u.hasCastThisTurn !== 'boolean') {
            u.hasCastThisTurn = false;
          }
          if (!('controllerMageId' in u)) {
            u.controllerMageId = null;
          }
        }
      }
    }

    // Migration: isIce field replaced by tile.status === TileStatus.FROZEN.
    // Upgrade saved tiles that have isIce=true to status:FROZEN, then remove the field.
    if (s.grid && Array.isArray(s.grid)) {
      for (const row of s.grid as Array<unknown>) {
        if (!Array.isArray(row)) continue;
        for (const tile of row as Array<unknown>) {
          const t = tile as Record<string, unknown>;
          if (!t || typeof t.terrainType !== 'string') continue;
          if (t.isIce === true) {
            t.status = TileStatus.FROZEN;
          }
          delete t.isIce;
        }
      }
    }

    // Migration: backfill trapStunTurns on building records from saves that predate GRAVE_TRAP.
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && typeof b.id === 'string' && !('trapStunTurns' in b)) {
          b.trapStunTurns = undefined;
        }
      }
    }

    // Migration: backfill buildingsConverted in gameStats for saves that predate
    // the building conversion mechanic.
    if (s.gameStats && typeof s.gameStats === 'object') {
      const gstats = s.gameStats as unknown as Record<string, unknown>;
      if (typeof gstats.buildingsConverted !== 'number') {
        gstats.buildingsConverted = 0;
      }
    }

    // Migration: backfill emberLevelSources for saves that predate source tracking.
    // Because historical data is unavailable, fall back conservatively: attribute the
    // full current ember level to "other" so old saves do not show inflated source rows.
    if (typeof gs.emberLevelSources !== 'object' || gs.emberLevelSources === null) {
      const currentEmber = typeof gs.ember === 'number' ? gs.ember : 0;
      gs.emberLevelSources = { turns: 0, emberlingSacrifices: 0, other: currentEmber };
    } else {
      const els = gs.emberLevelSources as Record<string, unknown>;
      if (typeof els.turns !== 'number') els.turns = 0;
      if (typeof els.emberlingSacrifices !== 'number') els.emberlingSacrifices = 0;
      if (typeof els.other !== 'number') els.other = 0;
    }

    // Migration: backfill upkeepIron, upkeepWood, and dormant on specialist
    // records from saves that predate these fields being added.
    // Also re-sync the effects array from SPECIALIST_DEFINITIONS so that
    // saves created before effects were stored (or with empty effects []) get
    // the correct effect definitions.
    if (s.specialists && typeof s.specialists === 'object') {
      for (const [specId, spec] of Object.entries(s.specialists) as Array<[string, unknown]>) {
        const sp = spec as Record<string, unknown>;
        if (sp && typeof sp.id === 'string') {
          if (typeof sp.upkeepIron !== 'number') sp.upkeepIron = 0;
          if (typeof sp.upkeepWood !== 'number') sp.upkeepWood = 0;
          if (typeof sp.dormant !== 'boolean') sp.dormant = false;
          // Always re-sync effects from the authoritative SPECIALIST_DEFINITIONS
          // so that saves with missing, empty, or stale effects are corrected.
          const def = SPECIALIST_DEFINITIONS[specId];
          if (def) {
            sp.effects = def.effects;
          }
        }
      }
    }

    // Migration: specialists are now global (active as soon as they are in
    // globalSpecialistStorage). If old saves have specialists with
    // assignedBuildingId set, migrate them into globalSpecialistStorage and
    // clear the assignment. Also clear any building.specialistSlot references.
    if (s.specialists && typeof s.specialists === 'object') {
      const gss = gs.globalSpecialistStorage as string[];
      const slotCap = typeof gs.specialistSlotCap === 'number' ? gs.specialistSlotCap : 2;
      for (const [specId, spec] of Object.entries(s.specialists) as Array<[string, unknown]>) {
        const sp = spec as Record<string, unknown>;
        if (sp && typeof sp.id === 'string' && sp.assignedBuildingId != null) {
          // Move to globalSpecialistStorage if room is available and not already there
          if (!gss.includes(specId) && gss.length < slotCap) {
            gss.push(specId);
          }
          sp.assignedBuildingId = null;
        }
      }
    }
    // Clear building.specialistSlot so that buildings no longer carry specialists
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && b.specialistSlot != null) {
          b.specialistSlot = null;
        }
      }
    }

    // Migration: GRAVESTONE_BASIC/WARRIORS/ENGINES TechFlags were replaced by
    // the LEAVES_GRAVESTONE unit tag. Backfill the new tag on units that would
    // have been covered by the old flags, then strip the old flags.
    {
      const techFlags = gs.techFlags as string[] | undefined;
      if (Array.isArray(techFlags)) {
        const basicActive    = techFlags.includes('GRAVESTONE_BASIC');
        const warriorsActive = techFlags.includes('GRAVESTONE_WARRIORS');
        const enginesActive  = techFlags.includes('GRAVESTONE_ENGINES');

        if (basicActive || warriorsActive || enginesActive) {
          const basicTypes    = new Set(['SPEARMAN', 'SCOUT', 'GUARD']);
          const warriorTypes  = new Set(['RIDER', 'SWORDSMAN', 'ARCHER']);
          const engineTypes   = new Set(['SIEGE', 'MAGE']);

          if (s.units && typeof s.units === 'object') {
            for (const unit of Object.values(s.units) as Array<unknown>) {
              const u = unit as Record<string, unknown>;
              if (!u || u.faction !== 'PLAYER' || !Array.isArray(u.tags)) continue;
              const t = u.type as string;
              if (
                (basicActive    && basicTypes.has(t))   ||
                (warriorsActive && warriorTypes.has(t)) ||
                (enginesActive  && engineTypes.has(t))
              ) {
                if (!(u.tags as string[]).includes('LEAVES_GRAVESTONE')) {
                  (u.tags as string[]).push('LEAVES_GRAVESTONE');
                }
              }
            }
          }

          // Remove the now-obsolete flags from the saved state
          gs.techFlags = techFlags.filter(
            (f) => f !== 'GRAVESTONE_BASIC' && f !== 'GRAVESTONE_WARRIORS' && f !== 'GRAVESTONE_ENGINES',
          );
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

