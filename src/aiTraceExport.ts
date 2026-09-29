import { AI_RECRUITMENT, AI_SCORING, AI_TRACE, SAVE, SPAWN_BUDGET, UNIT_DEFINITIONS } from './gameConfig';
import { getSlotMeta } from './saveSystem';
import { readRun } from './aiTraceStore';
import { ACTION_TABLE, AI_ROW_COLUMNS, OUTCOME_BITS, STOP_TABLE, TERM_TABLE, getOutcomeBitMask, getStopCode, type AiRow, type AiTraceChunk, type AiUnitRow } from './aiTrace';
import { edgeCircleDistance } from './rangeUtils';

export type TraceExportMode = 'full' | 'noTerms' | 'flaggedOnly';

type ExportRow = [...AiRow, string[]];

type FoldedUnitRow = AiUnitRow;

type SummaryRow = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  [number, number],
  number,
  AiTraceChunk['summary']['budget'],
  Record<number, number>,
  Record<number, number>,
  number,
  number,
  number,
  number,
  number,
  number[],
  AiTraceChunk['summary']['threats'],
];

type ActionStatsRow = [string, number, number, number | null, number | null, number | null, boolean, string | null];

const ANALYSIS_GUIDE = [
  'import json, pandas as pd',
  'd = json.load(open(PATH))',
  'rows = pd.DataFrame(d["rows"], columns=d["columns"])',
  'turns = pd.DataFrame(d["summaries"]["rows"], columns=d["summaries"]["columns"])',
  'units = pd.DataFrame(d["units"]["rows"], columns=d["units"]["columns"])',
  'acts = {i: a for i, a in enumerate(d["legend"]["actions"])}',
].join('\n');

const SUMMARY_COLUMNS = [
  't', 'eu', 'pu', 'pHp', 'pAtk', 'pB', 'eHp', 'eAtk', 'eB', 'em', 'lf', 'front', 'sp', 'budget',
  'acts', 'stops', 'blocked', 'static', 'slot2', 'kills', 'losses', 'lockouts', 'threats',
] as const;

const UNIT_COLUMNS = ['uIdx', 'id', 'type', 'spawnTurn', 'spawnBuildingId', 'sx', 'sy', 'deathTurn', 'deathCause', 'maxLevel'] as const;
const ACTION_STATS_COLUMNS = ['action', 'candidate', 'won', 'winRate', 'avgScore', 'avgMargin', 'neverWins', 'dominantTerm'] as const;
const FLAG_COLUMN = 'flagNames';
const TERM_COLUMNS = new Set(['domTerm', 'terms', 'terms2']);
const DEFENSIVE_ACTIONS = new Set(['DEFEND_ENEMY_BUILDING', 'CONTEST_BUILDING', 'RETAKE_BUILDING', 'PROTECT_SPAWNER', 'INTERCEPT_CAPTOR']);
const MOVEMENT_ACTIONS = new Set([
  'INTERCEPT_CAPTOR', 'CONTEST_BUILDING', 'RETAKE_BUILDING', 'DEFEND_ENEMY_BUILDING', 'PROTECT_SPAWNER', 'PUSH_TO_STRONGHOLD',
  'PUSH_TO_ZONE_EDGE', 'SPREAD_TO_FLANK', 'MOVE_TO_PLAYER_BUILDING', 'MOVE_TO_NEUTRAL_BUILDING', 'MOVE_TO_UNIT',
  'ADVANCE_TOWARD_LAVA', 'FLANK_UNIT', 'SACRIFICE_TO_LAVA', 'BUILD_LAVA_LAIR', 'BUILD_INFERNAL_SANCTUM',
  'MOVE_TO_SAFE_RANGED_POSITION', 'MOVE_TO_PORTAL', 'CM_MOVE_AND_ATTACK', 'CM_RETURN_HOME', 'CM_PATROL',
]);
const EXPLODE_INDEX = ACTION_TABLE.indexOf('EXPLODE');
const SLID_MASK = getOutcomeBitMask(['SLID']);
const BRIDGE_USED_MASK = getOutcomeBitMask(['BRIDGE_USED']);
const DIED_MASK = getOutcomeBitMask(['DIED']);
const CLOSE_CALL_DELTA = AI_TRACE.CLOSE_CALL_DELTA;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sanitizeSlotName(name: string): string {
  return name.replace(/[^\w\s\-().]/g, '_').trim() || 'save';
}

function formatTimestamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}`;
}

function cloneRowWithFlags(row: AiRow, flagNames: string[]): ExportRow {
  return [
    row[0], row[1], row[2], row[3], row[4], row[5], [...row[6]], row[7], row[8], row[9], row[10], row[11],
    row[12], row[13], row[14], row[15], row[16], row[17], row[18], row[19], row[20], row[21], row[22], row[23],
    [...row[24]], row[25], row[26] ? row[26].map((entry) => [...entry] as [number, number]) : null,
    row[27] ? row[27].map((entry) => [...entry] as [number, number]) : null,
    [...flagNames],
  ];
}

function stripTermColumns(row: ExportRow): unknown[] {
  return row.filter((_, index) => ![25, 26, 27].includes(index));
}

function straightLineHasBridgeOpportunity(row: AiRow): boolean {
  if (row[12] === 0 || row[14] < 0 || row[15] < 0) return false;
  const dx = row[14] - row[7];
  const dy = row[15] - row[8];
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

function computeActionStats(rows: readonly AiRow[]): ActionStatsRow[] {
  const stats = ACTION_TABLE.map((actionName, actionIndex): ActionStatsRow => {
    let candidate = 0;
    let won = 0;
    const scores: number[] = [];
    const margins: number[] = [];
    const dominantTerms = new Map<number, number>();
    for (const row of rows) {
      if (row[6].includes(actionIndex)) candidate += 1;
      if (row[3] !== actionIndex) continue;
      won += 1;
      if (typeof row[4] === 'number') scores.push(row[4]);
      if (typeof row[4] === 'number' && typeof row[5] === 'number') margins.push(row[4] - row[5]);
      if (row[25] >= 0) {
        dominantTerms.set(row[25], (dominantTerms.get(row[25]) ?? 0) + 1);
      }
    }
    const dominantTerm = [...dominantTerms.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
    return [
      actionName,
      candidate,
      won,
      candidate > 0 ? won / candidate : null,
      mean(scores),
      mean(margins),
      candidate >= 20 && won === 0,
      dominantTerm === null ? null : TERM_TABLE[dominantTerm] ?? null,
    ];
  });
  return stats.sort((a, b) => b[1] - a[1]);
}

function foldUnits(chunks: readonly AiTraceChunk[]): FoldedUnitRow[] {
  const byIndex = new Map<number, FoldedUnitRow>();
  for (const chunk of chunks) {
    for (const row of chunk.units) {
      byIndex.set(row[0], [...row] as FoldedUnitRow);
    }
  }
  return [...byIndex.values()].sort((a, b) => a[0] - b[0]);
}

function foldBuildings(chunks: readonly AiTraceChunk[]): Array<[number, string, string]> {
  const byIndex = new Map<number, [number, string, string]>();
  for (const chunk of chunks) {
    for (const row of chunk.buildings) {
      byIndex.set(row[0], [...row] as [number, string, string]);
    }
  }
  return [...byIndex.values()].sort((a, b) => a[0] - b[0]);
}

function buildSummaries(chunks: readonly AiTraceChunk[]): SummaryRow[] {
  return [...chunks]
    .sort((a, b) => a.turn - b.turn)
    .map((chunk) => [
      chunk.summary.t,
      chunk.summary.eu,
      chunk.summary.pu,
      chunk.summary.pHp,
      chunk.summary.pAtk,
      chunk.summary.pB,
      chunk.summary.eHp,
      chunk.summary.eAtk,
      chunk.summary.eB,
      chunk.summary.em,
      chunk.summary.lf,
      [...chunk.summary.front] as [number, number],
      chunk.summary.sp,
      chunk.summary.budget ? JSON.parse(JSON.stringify(chunk.summary.budget)) as SummaryRow[13] : null,
      { ...chunk.summary.acts },
      { ...chunk.summary.stops },
      chunk.summary.blocked,
      chunk.summary.static,
      chunk.summary.slot2,
      chunk.summary.kills,
      chunk.summary.losses,
      [...chunk.summary.lockouts],
      chunk.summary.threats.map((entry) => ({ ...entry, p: [entry.p[0], entry.p[1]] as [number, number] })),
    ]);
}

function buildUnitDefs(units: readonly FoldedUnitRow[]) {
  const seenTypes = new Set<string>();
  for (const row of units) {
    if (row[2]) seenTypes.add(row[2]);
  }
  return [...seenTypes]
    .sort()
    .map((type) => {
      const def = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS];
      return {
        type,
        maxHp: def.maxHp,
        attack: def.attack,
        defense: def.defense,
        moveRange: def.moveRange,
        attackRange: def.attackRange,
        movementActions: def.movementActions,
        tags: [...def.tags],
      };
    });
}

function deriveFlagNames(rows: readonly AiRow[], summaries: readonly SummaryRow[]): string[][] {
  const flagsPerRow = rows.map(() => new Set<string>());
  const rowsByUnit = new Map<number, Array<{ index: number; row: AiRow }>>();
  const rowsByTurnAndUnit = new Map<string, number[]>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const unitRows = rowsByUnit.get(row[2]) ?? [];
    unitRows.push({ index, row });
    rowsByUnit.set(row[2], unitRows);
    const key = `${row[0]}:${row[2]}`;
    const turnUnitRows = rowsByTurnAndUnit.get(key) ?? [];
    turnUnitRows.push(index);
    rowsByTurnAndUnit.set(key, turnUnitRows);
  }

  const summaryByTurn = new Map(summaries.map((summary) => [summary[0], summary]));

  rows.forEach((row, index) => {
    const flags = flagsPerRow[index];
    const actionName = ACTION_TABLE[row[3]];
    const isMovementAction = MOVEMENT_ACTIONS.has(actionName) || row[18] >= 0;
    const targetDistance = row[14] >= 0 && row[15] >= 0 ? edgeCircleDistance(row[7], row[8], row[14], row[15]) : -1;

    if (isMovementAction && row[17] === 0) flags.add('BLOCKED_MOVE');
    if (row[18] === getStopCode('NO_PATH')) flags.add('NO_PATH');
    if (row[18] === getStopCode('BLOCKED_UNIT') && row[19] > 0) flags.add('CONGESTED');
    if (row[17] === 0 && row[6].includes(EXPLODE_INDEX) && row[3] !== EXPLODE_INDEX) flags.add('EXPLODE_AVAILABLE_UNUSED');
    if ((row[23] & SLID_MASK) !== 0) flags.add('SLID');
    if (straightLineHasBridgeOpportunity(row) && (row[23] & BRIDGE_USED_MASK) === 0 && row[20].includes('B') === false && row[12] !== 0) flags.add('BRIDGE_AVAILABLE_UNUSED');
    if (row[17] > 0 && targetDistance > 0 && row[19] > 1.5 * targetDistance) flags.add('TERRAIN_DETOUR');
    if (typeof row[4] === 'number' && typeof row[5] === 'number' && row[4] - row[5] < CLOSE_CALL_DELTA) flags.add('CLOSE_CALL');
    if (row[25] === 0 && row[6].length >= 4) flags.add('DOMINATED_BY_BASE');
    if (row[24][6] === 1 && row[17] === 0 && row[21] === 0 && row[24][2] >= 0 && row[24][2] <= 4) flags.add('IDLE_ON_OWN_BUILDING');
    if (row[24][7] >= 0 && row[24][7] <= AI_TRACE.THREAT_RADIUS && !DEFENSIVE_ACTIONS.has(actionName)) flags.add('THREAT_IGNORED');
    if ((row[23] & DIED_MASK) !== 0 && row[21] < row[22]) flags.add('SUICIDE_ATTACK');

    const turnSummary = summaryByTurn.get(row[0]);
    const turnUnitKey = `${row[0]}:${row[2]}`;
    const turnUnitRows = rowsByTurnAndUnit.get(turnUnitKey) ?? [];
    if (turnSummary && turnUnitRows.length === 1 && row[1] === 1 && (row[23] & DIED_MASK) === 0) {
      flags.add('SLOT2_UNUSED');
    }
  });

  for (const unitRows of rowsByUnit.values()) {
    unitRows.sort((a, b) => a.row[0] - b.row[0] || a.row[1] - b.row[1]);
    const byTurnStart = new Map<number, { index: number; row: AiRow }>();
    for (const entry of unitRows) {
      if (entry.row[1] === 1 && !byTurnStart.has(entry.row[0])) {
        byTurnStart.set(entry.row[0], entry);
      }
    }
    const starts = [...byTurnStart.values()].sort((a, b) => a.row[0] - b.row[0]);
    for (let i = AI_TRACE.STUCK_TURNS - 1; i < starts.length; i += 1) {
      const window = starts.slice(i - AI_TRACE.STUCK_TURNS + 1, i + 1);
      const positionsMatch = window.every((entry) => entry.row[7] === window[0].row[7] && entry.row[8] === window[0].row[8]);
      const consecutive = window.every((entry, offset) => entry.row[0] === window[0].row[0] + offset);
      if (positionsMatch && consecutive) {
        flagsPerRow[window[window.length - 1].index].add('STUCK');
      }
    }

    const visited = new Map<string, number>();
    for (const entry of starts) {
      const destinationKey = `${entry.row[9]},${entry.row[10]}`;
      const previousTurn = visited.get(destinationKey);
      if (previousTurn !== undefined && entry.row[0] - previousTurn <= AI_TRACE.OSCILLATION_WINDOW) {
        flagsPerRow[entry.index].add('OSCILLATION');
      }
      visited.set(destinationKey, entry.row[0]);
    }
  }

  return flagsPerRow.map((flagSet) => [...flagSet].sort());
}

function buildLegend(modeColumns: readonly string[]) {
  return {
    columns: [...modeColumns],
    actions: [...ACTION_TABLE],
    stopReasons: [...STOP_TABLE],
    outcomeBits: [...OUTCOME_BITS],
    terrainCodes: [
      'P plains',
      'F forest',
      'M mountain',
      'C canyon',
      'W water',
      'E empty',
      'B bridge-crossed tile',
      'suffix f frozen, b burning, c corrupted',
    ],
    ctxFields: [
      'zone',
      'rowsToLavaFront',
      'distNearestPlayerUnit',
      'distNearestPlayerBuilding',
      'alliesWithinAllyRadius',
      'standingBuildingIndex',
      'standingBuildingFaction',
      'distNearestThreatenedOwnBuilding',
    ],
    flags: [
      { name: 'BLOCKED_MOVE', definition: 'Movement action that produced zero tiles.' },
      { name: 'NO_PATH', definition: 'Movement stopped because no path or fallback move existed.' },
      { name: 'CONGESTED', definition: 'Movement stopped on a blocked path tile after a path was found.' },
      { name: 'EXPLODE_AVAILABLE_UNUSED', definition: 'A zero-move row where EXPLODE was a scored candidate but was not chosen.' },
      { name: 'SLID', definition: 'Outcome bits show frozen-slide displacement occurred.' },
      { name: 'BRIDGE_AVAILABLE_UNUSED', definition: 'Best-effort straight-line bridge opportunity without a BRIDGE_USED outcome bit.' },
      { name: 'TERRAIN_DETOUR', definition: 'Recorded path length is more than 1.5x the edge-circle distance to target.' },
      { name: 'CLOSE_CALL', definition: 'Winner score beat the runner-up by less than AI_TRACE.CLOSE_CALL_DELTA.' },
      { name: 'DOMINATED_BY_BASE', definition: 'Winner was dominated by BASE while at least three other positive-score candidates existed.' },
      { name: 'IDLE_ON_OWN_BUILDING', definition: 'Unit stayed idle on an enemy-owned building while a player threat was nearby.' },
      { name: 'THREAT_IGNORED', definition: 'Threatened own building was nearby and the action was not a defensive response.' },
      { name: 'STUCK', definition: 'Same start tile repeated for AI_TRACE.STUCK_TURNS consecutive turns.' },
      { name: 'OSCILLATION', definition: 'Destination position repeats within AI_TRACE.OSCILLATION_WINDOW turns for the same unit index.' },
      { name: 'BAD_TARGET', definition: 'Reserved best-effort flag for riskier-than-available target choices when enough data exists.' },
      { name: 'SUICIDE_ATTACK', definition: 'Unit died while dealing less damage than it received.' },
      { name: 'SLOT2_UNUSED', definition: 'Unit only recorded a first-slot action on that turn.' },
    ],
    terms: [...TERM_TABLE],
  };
}

function buildModeColumns(mode: TraceExportMode): string[] {
  const base = mode === 'noTerms'
    ? AI_ROW_COLUMNS.filter((column) => !TERM_COLUMNS.has(column))
    : AI_ROW_COLUMNS;
  return [...base, FLAG_COLUMN];
}

export async function buildTraceExport(slotId: string, mode: TraceExportMode): Promise<{ blob: Blob; filename: string } | null> {
  const { meta, chunks } = await readRun(slotId);
  if (!meta || chunks.length === 0) return null;

  const rows = chunks.flatMap((chunk) => chunk.rows);
  const units = foldUnits(chunks);
  const buildings = foldBuildings(chunks);
  const summaries = buildSummaries(chunks);
  const actionStats = computeActionStats(rows);
  const unitDefs = buildUnitDefs(units);
  const flagNames = deriveFlagNames(rows, summaries);
  const fullRows = rows.map((row, index) => cloneRowWithFlags(row, flagNames[index]));
  const flaggedRows = fullRows.filter((row) => {
    const flagNames = row[row.length - 1] as string[];
    return flagNames.length > 0;
  });
  const modeColumns = buildModeColumns(mode);
  const outputRows = (mode === 'flaggedOnly' ? flaggedRows : fullRows).map((row) =>
    mode === 'noTerms' ? stripTermColumns(row) : row,
  );
  const slotMeta = await getSlotMeta(slotId);
  const safeSlotName = sanitizeSlotName(slotMeta?.name ?? meta.slotName ?? 'save');
  const timestamp = formatTimestamp(new Date());
  const lastTurn = meta.lastTurn >= 0 ? meta.lastTurn : chunks[chunks.length - 1]?.turn ?? 0;

  const payload = {
    meta: {
      runId: meta.runId,
      game: __APP_VERSION__,
      schemaVersion: meta.schemaVersion,
      difficulty: meta.difficulty,
      turns: [meta.firstTurn, meta.lastTurn] as [number, number],
      rows: rows.length,
      capped: meta.capped,
      mode,
      grid: { w: meta.gridWidth, h: meta.gridHeight },
      orientation: 'row 0 = north = enemy origin, higher y = south = player, lava advances toward lower y',
      distanceMetric: 'edge-circle, 8-directional, not Manhattan',
    },
    analysisGuide: ANALYSIS_GUIDE,
    legend: buildLegend(modeColumns),
    config: {
      AI_SCORING: JSON.parse(JSON.stringify(AI_SCORING)),
      AI_RECRUITMENT: JSON.parse(JSON.stringify(AI_RECRUITMENT)),
      SPAWN_BUDGET: JSON.parse(JSON.stringify(SPAWN_BUDGET)),
      AI_TRACE: JSON.parse(JSON.stringify(AI_TRACE)),
    },
    unitDefs,
    units: {
      columns: [...UNIT_COLUMNS],
      rows: units.map((row) => [...row]),
    },
    buildings: {
      columns: ['idx', 'id', 'type'],
      rows: buildings.map((row) => [...row]),
    },
    summaries: {
      columns: [...SUMMARY_COLUMNS],
      rows: summaries.map((row) => [...row]),
    },
    actionStats: {
      columns: [...ACTION_STATS_COLUMNS],
      rows: actionStats.map((row) => [...row]),
    },
    columns: modeColumns,
    rows: outputRows,
  };

  return {
    blob: new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    filename: `volcanae-aitrace-${safeSlotName}-t${lastTurn}-${timestamp}${SAVE.TRACE_EXPORT_FILE_EXT}`,
  };
}
