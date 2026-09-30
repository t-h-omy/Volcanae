/**
 * AI decision trace configuration (diagnostics tool).
 */
export const AI_TRACE = {
  /** Hard cap on recorded decision rows per run. Recording stops when reached. */
  MAX_ROWS: 15000,
  /** Score gap below which the top two candidates count as a near tie. */
  CLOSE_CALL_DELTA: 3,
  /** Consecutive turns without position change before STUCK is derived at export. */
  STUCK_TURNS: 3,
  /** Lookback window in turns for OSCILLATION detection at export. */
  OSCILLATION_WINDOW: 3,
  /** Radius used for the "enemy units near a threatened own building" count. */
  THREAT_RADIUS: 5,
  /** Radius used for the allied-units-near context field. */
  ALLY_RADIUS: 3,
  /** Maximum score terms stored per candidate (run C). */
  MAX_TERMS: 6,
  /** Sealed runs kept in IndexedDB. The oldest is pruned when a new run is sealed. */
  MAX_ARCHIVED_RUNS: 5,
  /** Schema version of the trace format, bumped when columns change. */
  SCHEMA_VERSION: 1,
} as const;
