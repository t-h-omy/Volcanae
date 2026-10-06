/**
 * Save system configuration (slot caps, page size, storage keys).
 */


export const SAVE = {
  /** Maximum number of manual save slots; New Game is blocked when this cap is reached. */
  SLOT_CAP: 100,
  /** Number of save slots displayed per page in the Load list. */
  SLOTS_PER_PAGE: 10,
  /** Maximum characters allowed in a slot name. */
  NAME_MAX_LENGTH: 32,
  /** localStorage key for the legacy single-slot save, imported once on first menu mount. */
  LEGACY_KEY: 'volcanae-save',
  /** IndexedDB database name. */
  IDB_NAME: 'volcanae',
  /** IndexedDB database version. */
  IDB_VERSION: 2,
  /** IndexedDB object store name for lightweight save metadata. */
  STORE_META: 'saveMeta',
  /** IndexedDB object store name for full serialized game state. */
  STORE_DATA: 'saveData',
  /** IndexedDB object store name for AI decision traces. */
  STORE_TRACE: 'aiTrace',
  /** File extension appended to exported save filenames. */
  EXPORT_FILE_EXT: '.volcanae.json',
  /** File extension appended to exported AI trace filenames. */
  TRACE_EXPORT_FILE_EXT: '.aitrace.json',
} as const;
