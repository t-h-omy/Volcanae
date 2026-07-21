/**
 * Save system for Volcanae.
 *
 * Provides a multi-slot IndexedDB save system with a lightweight metadata store
 * (for listing saves) and a separate heavy state store (for loading).
 *
 * Legacy single-slot localStorage saves are imported once via migrateLegacyIfPresent().
 */

import type { GameState } from './types';
import { UnitType, UnitTag, BuildingType, TileStatus } from './types';
import { TECH_TREE, POPULATION, SPECIALIST_DEFINITIONS, SAVE } from './gameConfig';
import { ALL_HINT_IDS } from './hintConfig';
import type { Difficulty } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Increment this whenever the serialized shape changes incompatibly. */
export const SAVE_VERSION = 16;

// ============================================================================
// TYPES
// ============================================================================

export type SaveSlotMeta = {
  id: string;
  name: string;
  version: number;
  savedAt: number;
  turn: number;
  difficulty: Difficulty;
};

/** Compute the next default campaign name using the lowest unused integer suffix. */
export function getNextDefaultSlotName(slots: Array<Pick<SaveSlotMeta, 'name'>>): string {
  const prefixRe = new RegExp(`^${SAVE.DEFAULT_NAME_PREFIX} (\\d+)$`);
  const usedNumbers = new Set<number>();
  for (const slot of slots) {
    const match = slot.name.match(prefixRe);
    if (match) usedNumbers.add(parseInt(match[1], 10));
  }
  let next = 1;
  while (usedNumbers.has(next)) next++;
  return `${SAVE.DEFAULT_NAME_PREFIX} ${next}`;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/** Feature-detect IndexedDB availability. */
export function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Open (or create) the Volcanae IndexedDB database. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAVE.IDB_NAME, SAVE.IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAVE.STORE_META)) {
        db.createObjectStore(SAVE.STORE_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAVE.STORE_DATA)) {
        db.createObjectStore(SAVE.STORE_DATA, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Migrate and validate a raw parsed save payload.
 * Extracted from the former loadGameState body; both IDB load and legacy
 * import route through this function.
 * Returns the migrated GameState or null if incompatible/corrupt.
 */
function migrateState(parsed: { version: number; state: GameState }): GameState | null {
  try {
    if (parsed.version > SAVE_VERSION || parsed.version < 8) return null;
    if (!parsed.state || typeof parsed.state !== 'object') return null;

    const s = parsed.state;
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
    if (parsed.version < 9 && s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && u.type === 'INFANTRY') u.type = 'SPEARMAN';
      }
    }

    // Migration v10 → v11: enemy UnitType renames.
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

    // Migration: add PASSIVE tag to Emberlings if missing.
    for (const unit of Object.values(s.units)) {
      if (unit && unit.type === UnitType.EMBERLING && Array.isArray(unit.tags) && !unit.tags.includes(UnitTag.PASSIVE)) {
        unit.tags.push(UnitTag.PASSIVE);
      }
    }

    // Migration: backfill missing tech nodes.
    if (s.techNodes && typeof s.techNodes === 'object') {
      for (const def of TECH_TREE) {
        if (!(def.id in s.techNodes)) {
          (s.techNodes as Record<string, { id: string; unlocked: boolean }>)[def.id] = { id: def.id, unlocked: false };
        }
      }
    }

    // Migration: Frostcraft backfill.
    {
      const tn = s.techNodes as Record<string, { id: string; unlocked: boolean }> | undefined;
      const us = s.unlockedSpells as string[] | undefined;
      if (tn?.['ARCANE_AWAKENING']?.unlocked && Array.isArray(us) && !us.includes('FROSTCRAFT')) {
        us.push('FROSTCRAFT');
      }
    }

    // Migration: CRYSTAL_DRAKE backfill.
    {
      const tn = s.techNodes as Record<string, { id: string; unlocked: boolean }> | undefined;
      const uu = s.unlockedUnits as string[] | undefined;
      if (Array.isArray(uu) && !uu.includes(UnitType.CRYSTAL_DRAKE)) {
        const techUnlocked = tn?.['CRYSTAL_CAVE']?.unlocked === true;
        const hasCaveBuilding =
          s.buildings && typeof s.buildings === 'object' &&
          Object.values(s.buildings).some((b) => b?.type === BuildingType.CRYSTAL_CAVE);
        if (techUnlocked || hasCaveBuilding) uu.push(UnitType.CRYSTAL_DRAKE);
      }
    }

    // Migration: stronghold farmers/nobles split.
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

    // Migration: backfill unit fields.
    if (s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && typeof u.id === 'string') {
          if (typeof u.distractionDefPenalty !== 'number') u.distractionDefPenalty = 0;
          if (typeof u.lastMovedTurn !== 'number') u.lastMovedTurn = 0;
          if (typeof u.recruitedOnTurn !== 'number') u.recruitedOnTurn = 0;
        }
      }
    }

    // Migration: backfill lastRecruitmentTurn on buildings.
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && typeof b.id === 'string' && typeof b.lastRecruitmentTurn !== 'number') {
          b.lastRecruitmentTurn = 0;
        }
      }
    }

    // Migration: backfill top-level fields.
    const gs = (s as unknown) as Record<string, unknown>;
    if (typeof gs.specialistSlotCap !== 'number') gs.specialistSlotCap = 2;
    if (!Array.isArray(gs.activeCaveEncounters)) gs.activeCaveEncounters = [];
    if (!Array.isArray(gs.unlockedSpells)) gs.unlockedSpells = [];
    if (!('pendingSpellCast' in gs)) gs.pendingSpellCast = null;
    if (!('pendingTransposeFirstUnitId' in gs)) gs.pendingTransposeFirstUnitId = null;
    if (!Array.isArray(gs.pendingBrandmarkTransforms)) gs.pendingBrandmarkTransforms = [];
    if (!('pendingBridgeBuilderId' in gs)) gs.pendingBridgeBuilderId = null;

    // Migration: remove legacy MAGE tag.
    if (s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && Array.isArray(u.tags)) {
          u.tags = (u.tags as string[]).filter((t) => t !== 'MAGE');
        }
      }
    }

    // Migration: Mage-system per-unit fields.
    if (s.units && typeof s.units === 'object') {
      for (const unit of Object.values(s.units) as Array<unknown>) {
        const u = unit as Record<string, unknown>;
        if (u && typeof u.id === 'string') {
          if (typeof u.spellsCastThisTurn !== 'number') {
            u.spellsCastThisTurn = u.hasCastThisTurn === true ? 1 : 0;
          }
          delete u.hasCastThisTurn;
          if (!('controllerMageId' in u)) u.controllerMageId = null;
        }
      }
    }

    // Migration: isIce → TileStatus.FROZEN.
    if (s.grid && Array.isArray(s.grid)) {
      for (const row of s.grid as Array<unknown>) {
        if (!Array.isArray(row)) continue;
        for (const tile of row as Array<unknown>) {
          const t = tile as Record<string, unknown>;
          if (!t || typeof t.terrainType !== 'string') continue;
          if (t.isIce === true) t.status = TileStatus.FROZEN;
          delete t.isIce;
        }
      }
    }

    // Migration: backfill trapStunTurns, trapDamage, and resonanceCrystalBonus on buildings.
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && typeof b.id === 'string') {
          if (!('trapStunTurns' in b))        b.trapStunTurns         = undefined;
          if (!('trapDamage' in b))            b.trapDamage            = undefined;
          if (!('resonanceCrystalBonus' in b)) b.resonanceCrystalBonus = false;
        }
      }
    }

    // Migration: backfill buildingsConverted in gameStats.
    if (s.gameStats && typeof s.gameStats === 'object') {
      const gstats = s.gameStats as unknown as Record<string, unknown>;
      if (typeof gstats.buildingsConverted !== 'number') gstats.buildingsConverted = 0;
    }

    // Migration: backfill emberLevelSources.
    if (typeof gs.emberLevelSources !== 'object' || gs.emberLevelSources === null) {
      const currentEmber = typeof gs.ember === 'number' ? gs.ember : 0;
      gs.emberLevelSources = { turns: 0, emberlingSacrifices: 0, other: currentEmber };
    } else {
      const els = gs.emberLevelSources as Record<string, unknown>;
      if (typeof els.turns !== 'number') els.turns = 0;
      if (typeof els.emberlingSacrifices !== 'number') els.emberlingSacrifices = 0;
      if (typeof els.other !== 'number') els.other = 0;
    }

    // Migration: backfill specialist fields and re-sync effects.
    if (s.specialists && typeof s.specialists === 'object') {
      for (const [specId, spec] of Object.entries(s.specialists) as Array<[string, unknown]>) {
        const sp = spec as Record<string, unknown>;
        if (sp && typeof sp.id === 'string') {
          if (typeof sp.upkeepIron !== 'number') sp.upkeepIron = 0;
          if (typeof sp.upkeepWood !== 'number') sp.upkeepWood = 0;
          if (typeof sp.dormant !== 'boolean') sp.dormant = false;
          const def = SPECIALIST_DEFINITIONS[specId];
          if (def) sp.effects = def.effects;
        }
      }
    }

    // Migration: specialists → globalSpecialistStorage.
    if (s.specialists && typeof s.specialists === 'object') {
      const gss = gs.globalSpecialistStorage as string[];
      const slotCap = typeof gs.specialistSlotCap === 'number' ? gs.specialistSlotCap : 2;
      for (const [specId, spec] of Object.entries(s.specialists) as Array<[string, unknown]>) {
        const sp = spec as Record<string, unknown>;
        if (sp && typeof sp.id === 'string' && sp.assignedBuildingId != null) {
          if (!gss.includes(specId) && gss.length < slotCap) gss.push(specId);
          sp.assignedBuildingId = null;
        }
      }
    }
    if (s.buildings && typeof s.buildings === 'object') {
      for (const building of Object.values(s.buildings) as Array<unknown>) {
        const b = building as Record<string, unknown>;
        if (b && b.specialistSlot != null) b.specialistSlot = null;
      }
    }

    // Migration: GRAVESTONE flags → LEAVES_GRAVESTONE tag.
    {
      const techFlags = gs.techFlags as string[] | undefined;
      if (Array.isArray(techFlags)) {
        const basicActive    = techFlags.includes('GRAVESTONE_BASIC');
        const warriorsActive = techFlags.includes('GRAVESTONE_WARRIORS');
        const enginesActive  = techFlags.includes('GRAVESTONE_ENGINES');
        if (basicActive || warriorsActive || enginesActive) {
          const basicTypes   = new Set(['SPEARMAN', 'SCOUT', 'GUARD']);
          const warriorTypes = new Set(['RIDER', 'SWORDSMAN', 'ARCHER']);
          const engineTypes  = new Set(['SIEGE', 'MAGE']);
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
          gs.techFlags = techFlags.filter(
            (f) => f !== 'GRAVESTONE_BASIC' && f !== 'GRAVESTONE_WARRIORS' && f !== 'GRAVESTONE_ENGINES',
          );
        }
      }
    }

    // Migration v11 → v12: remove unused farmers/nobles from resources and type from tiles.
    if (parsed.version < 12) {
      const res = s.resources as unknown as Record<string, unknown>;
      delete res.farmers;
      delete res.nobles;
      if (s.grid && Array.isArray(s.grid)) {
        for (const row of s.grid as Array<unknown>) {
          if (!Array.isArray(row)) continue;
          for (const tile of row as Array<unknown>) delete (tile as Record<string, unknown>).type;
        }
      }
    }

    // Migration v12 → v13: EMBER_PORTAL rework.
    if (parsed.version < 13) {
      if (s.portals && typeof s.portals === 'object') {
        for (const portal of Object.values(s.portals) as Array<unknown>) {
          const p = portal as Record<string, unknown>;
          if (p && typeof p.id === 'string') {
            if (typeof p.expiresTurn === 'number') p.lastUsableTurn = p.expiresTurn - 1;
            if (!('pendingTeleportUnitId' in p)) p.pendingTeleportUnitId = null;
            delete p.expiresTurn;
            delete p.usableFromTurn;
          }
        }
      }
      if (s.units && typeof s.units === 'object') {
        for (const unit of Object.values(s.units) as Array<unknown>) {
          const u = unit as Record<string, unknown>;
          if (u && typeof u.id === 'string') delete u.portalCastCooldownUntil;
        }
      }
    }

    // Migration v13 → v14: hasTradedThisTurn.
    if (parsed.version < 14) {
      if (s.units && typeof s.units === 'object') {
        for (const unit of Object.values(s.units) as Array<unknown>) {
          const u = unit as Record<string, unknown>;
          if (u && typeof u.id === 'string' && !('hasTradedThisTurn' in u)) {
            u.hasTradedThisTurn = false;
          }
        }
      }
    }

    // Migration v15 → v16: seenHints field.
    // Saves created before the hint system was added mark all hints as seen so
    // they never show hints regardless of the global toggle.
    if (parsed.version < 16) {
      gs.seenHints = [...ALL_HINT_IDS];
    }
    // Safety net: backfill seenHints for any v16+ state where the field is missing.
    if (!Array.isArray(gs.seenHints)) {
      gs.seenHints = [];
    }

    return s as GameState;
  } catch {
    return null;
  }
}

// ============================================================================
// PUBLIC API — FEATURE DETECTION
// ============================================================================

/** Return true if a saved game is compatible with the current save version. */
export function isSlotCompatible(meta: SaveSlotMeta): boolean {
  return meta.version <= SAVE_VERSION && meta.version >= 8;
}

// ============================================================================
// PUBLIC API — IDB SLOT OPERATIONS
// ============================================================================

/** List all save slot metadata, sorted newest-first. */
export async function listSlots(): Promise<SaveSlotMeta[]> {
  if (!idbAvailable()) return [];
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_META, 'readonly');
      const store = tx.objectStore(SAVE.STORE_META);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as SaveSlotMeta[]) ?? [];
        all.sort((a, b) => b.savedAt - a.savedAt);
        resolve(all);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Return the total number of save slots. */
export async function slotCount(): Promise<number> {
  if (!idbAvailable()) return 0;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_META, 'readonly');
      const store = tx.objectStore(SAVE.STORE_META);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/** Retrieve metadata for a single slot without loading its full state. Returns null on miss. */
export async function getSlotMeta(id: string): Promise<SaveSlotMeta | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_META, 'readonly');
      const store = tx.objectStore(SAVE.STORE_META);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as SaveSlotMeta | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Load the full game state from a slot, running migration. Returns null on miss or incompatible version. */
export async function loadSlot(id: string): Promise<GameState | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openDb();
    const raw = await new Promise<{ id: string; version: number; state: GameState } | undefined>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_DATA, 'readonly');
      const store = tx.objectStore(SAVE.STORE_DATA);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as { id: string; version: number; state: GameState } | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return null;
    return migrateState({ version: raw.version, state: raw.state });
  } catch {
    return null;
  }
}

/**
 * Strip function-valued top-level properties from a game state before saving.
 *
 * The Zustand game store mixes its action methods into the same object as the
 * serializable GameState fields.  Autosave paths pass a snapshot taken from the
 * live store (via immer's `current()` / `produce()`), which therefore carries
 * those action functions.  IndexedDB's structured-clone algorithm throws a
 * DataCloneError on functions when writing the heavy `saveData` record, while
 * the `saveMeta` write (queued first in the same transaction) still commits —
 * leaving the slot's metadata updated but its full state stuck at the last
 * successfully-cloned save.  Removing the functions here guarantees every save
 * path (autosave, manual save, return-to-menu) persists a clean GameState.
 */
function toSerializableState(state: GameState): GameState {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function'),
  ) as GameState;
}

/** Save both metadata and full state for a slot in one transaction. */
export async function saveSlotStrict(args: { id: string; name: string; state: GameState }): Promise<void> {
  if (!idbAvailable()) throw new Error('Save storage is unavailable.');
  const { id, name } = args;
  const state = toSerializableState(args.state);
  const meta: SaveSlotMeta = {
    id,
    name,
    version: SAVE_VERSION,
    savedAt: Date.now(),
    turn: state.turn,
    difficulty: state.difficulty,
  };
  const dataRecord = { id, version: SAVE_VERSION, state };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVE.STORE_META, SAVE.STORE_DATA], 'readwrite');
    tx.objectStore(SAVE.STORE_META).put(meta);
    tx.objectStore(SAVE.STORE_DATA).put(dataRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Save both metadata and full state for a slot in one transaction. */
export async function saveSlot(args: { id: string; name: string; state: GameState }): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await saveSlotStrict(args);
  } catch {
    // fail silently — autosave failures must not crash the game
  }
}

/** Patch only the seenHints field of an existing slot's saved state. */
export async function saveSeenHintsForSlot(id: string, seenHints: string[]): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_DATA, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_DATA);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as { id: string; version: number; state: GameState } | undefined;
        if (!record) {
          resolve();
          return;
        }
        store.put({
          ...record,
          state: {
            ...record.state,
            seenHints: [...seenHints],
          },
        });
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fail silently — hint persistence failures must not crash the game
  }
}

/** Delete both metadata and state records for a slot. */
export async function deleteSlot(id: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SAVE.STORE_META, SAVE.STORE_DATA], 'readwrite');
      tx.objectStore(SAVE.STORE_META).delete(id);
      tx.objectStore(SAVE.STORE_DATA).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fail silently
  }
}

/** Export a slot as a Blob. Caller triggers the download. Returns null on miss. */
export async function exportSlot(id: string): Promise<Blob | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openDb();
    const metaRaw = await new Promise<SaveSlotMeta | undefined>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_META, 'readonly');
      const req = tx.objectStore(SAVE.STORE_META).get(id);
      req.onsuccess = () => resolve(req.result as SaveSlotMeta | undefined);
      req.onerror = () => reject(req.error);
    });
    const dataRaw = await new Promise<{ id: string; version: number; state: GameState } | undefined>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_DATA, 'readonly');
      const req = tx.objectStore(SAVE.STORE_DATA).get(id);
      req.onsuccess = () => resolve(req.result as { id: string; version: number; state: GameState } | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!metaRaw || !dataRaw) return null;
    const payload = JSON.stringify({ version: dataRaw.version, name: metaRaw.name, state: dataRaw.state });
    return new Blob([payload], { type: 'application/json' });
  } catch {
    return null;
  }
}

/** Parse an exported file, validate + migrate, write as a new slot. Returns the new slot's meta, or null on error. */
export async function importSlotFromFile(file: File): Promise<SaveSlotMeta | null> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as { version: number; name?: string; state: GameState };
    const migrated = migrateState({ version: parsed.version, state: parsed.state });
    if (!migrated) return null;
    const id = `import-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Imported save';
    await saveSlot({ id, name, state: migrated });
    const meta: SaveSlotMeta = {
      id,
      name,
      version: SAVE_VERSION,
      savedAt: Date.now(),
      turn: migrated.turn,
      difficulty: migrated.difficulty,
    };
    return meta;
  } catch {
    return null;
  }
}

// localStorage key used to track whether the legacy save was already imported.
const LEGACY_IMPORTED_KEY = 'volcanae-legacy-imported';

/**
 * If a legacy localStorage save exists and has not been imported yet,
 * parse + migrate it and write it as a slot named "Imported save".
 * Leaves the legacy key intact (does not delete it).
 */
export async function migrateLegacyIfPresent(): Promise<void> {
  try {
    const raw = localStorage.getItem(SAVE.LEGACY_KEY);
    if (!raw) return;
    if (localStorage.getItem(LEGACY_IMPORTED_KEY)) return;
    const parsed = JSON.parse(raw) as { version: number; state: GameState };
    const migrated = migrateState(parsed);
    if (!migrated) return;
    const id = `legacy-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    await saveSlot({ id, name: 'Imported save', state: migrated });
    localStorage.setItem(LEGACY_IMPORTED_KEY, '1');
  } catch {
    // fail silently
  }
}

// ============================================================================
// PUBLIC API — PERSISTENT STORAGE
// ============================================================================

/** Request durable (persistent) storage. Returns false if unavailable or denied. */
export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Return true if storage is already persisted. */
export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** Return storage usage estimate, or null if the API is unavailable. */
export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}
