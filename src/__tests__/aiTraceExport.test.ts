import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { buildTraceExport } from '../aiTraceExport';
import { appendChunk } from '../aiTraceStore';
import { ACTION_TABLE, AI_ROW_COLUMNS, getOutcomeBitMask, getStopCode, type AiRow, type AiTraceChunk } from '../aiTrace';
import { AI_SCORING, AI_TRACE } from '../gameConfig';

const FLAG_COLUMN_INDEX = AI_ROW_COLUMNS.length;
const ACT = Object.fromEntries(ACTION_TABLE.map((name, index) => [name, index] as const));
type RowOverrides = Partial<Record<number, unknown>> & { ctx?: number[]; cand?: number[] };

function row(overrides: RowOverrides = {}): AiRow {
  const base: AiRow = [
    1, 2, 1, ACT.ATTACK_UNIT,
    10, 4, [ACT.ATTACK_UNIT],
    0, 0, 2, 3, 20,
    1, 2, 2, 3, 3,
    1, -1, 1, 'P',
    5, 0, 0, [1, 10, 5, 5, 0, -1, 0, -1],
    -1,
    null,
    null,
  ];
  if (overrides.ctx) base[24] = [...overrides.ctx];
  if (overrides.cand) base[6] = [...overrides.cand];
  const entries = Object.entries(overrides) as Array<[string, unknown]>;
  for (const [key, value] of entries) {
    if (key === 'ctx' || key === 'cand') continue;
    const index = Number(key);
    if (!Number.isNaN(index)) {
      (base as unknown as unknown[])[index] = value;
    }
  }
  return base;
}

function summaryForTurn(turn: number): AiTraceChunk['summary'] {
  return {
    t: turn,
    eu: 4,
    pu: 2,
    pHp: 120,
    pAtk: 40,
    pB: 1,
    eHp: 100,
    eAtk: 30,
    eB: 1,
    em: 0,
    lf: 59,
    front: [10, 5],
    sp: 0,
    budget: null,
    acts: {},
    stops: {},
    blocked: 0,
    static: 0,
    slot2: 0,
    kills: 0,
    losses: 0,
    lockouts: [],
    threats: [],
  };
}

function buildChunks(slotId: string, rows: AiRow[]): AiTraceChunk[] {
  const rowsByTurn = new Map<number, AiRow[]>();
  const unitFirstTurn = new Map<number, number>();
  for (const entry of rows) {
    const group = rowsByTurn.get(entry[0]) ?? [];
    group.push(entry);
    rowsByTurn.set(entry[0], group);
    if (!unitFirstTurn.has(entry[2])) unitFirstTurn.set(entry[2], entry[0]);
  }
  return [...rowsByTurn.entries()].sort((a, b) => a[0] - b[0]).map(([turn, turnRows]) => ({
    key: `${slotId}:${String(turn).padStart(6, '0')}`,
    slotId,
    turn,
    rows: turnRows,
    units: turnRows
      .filter((entry) => unitFirstTurn.get(entry[2]) === turn)
      .map((entry) => [entry[2], `u${entry[2]}`, entry[2] % 2 === 0 ? 'LAVA_ARCHER' : 'LAVA_GRUNT', turn, null, entry[7], entry[8], -1, '', 1]),
    buildings: turn === 1 ? [[0, 'b0', 'WATCHTOWER']] : [],
    summary: summaryForTurn(turn),
  }));
}

async function exportJson(slotId: string, rows: AiRow[], mode: 'full' | 'noTerms' | 'flaggedOnly' = 'full') {
  for (const chunk of buildChunks(slotId, rows)) {
   await appendChunk(slotId, chunk);
  }
  const result = await buildTraceExport(slotId, mode);
  expect(result).not.toBeNull();
  return JSON.parse(await result!.blob.text()) as {
    columns: string[];
    rows: unknown[][];
    config: { AI_SCORING: unknown };
    legend: { actions: string[]; flags: Array<{ name: string; definition: string }> };
    actionStats: { columns: string[]; rows: Array<[string, number, number, number | null, number | null, number | null, boolean]> };
    units: { columns: string[]; rows: unknown[][] };
    summaries: { columns: string[]; rows: unknown[][] };
    unitDefs: Array<{ type: string }>;
  };
}

function flagsFor(json: Awaited<ReturnType<typeof exportJson>>, turn: number, uIdx: number, slot?: number): string[] {
  const found = json.rows.find((entry) => entry[0] === turn && entry[2] === uIdx && (slot === undefined || entry[1] === slot));
  expect(found).toBeTruthy();
  return found![FLAG_COLUMN_INDEX] as string[];
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('aiTrace export', () => {
  it('uses AI_ROW_COLUMNS plus flagNames and preserves row width', async () => {
    const json = await exportJson('slot_columns', [row()]);
    expect(json.columns).toEqual([...AI_ROW_COLUMNS, 'flagNames']);
    for (const exported of json.rows) {
      expect(exported).toHaveLength(json.columns.length);
    }
  });

  it('computes actionStats counts and null winRate correctly', async () => {
    const rows = [
      row({ 1: 1, 3: ACT.ATTACK_UNIT, 6: [ACT.ATTACK_UNIT, ACT.EXPLODE] }),
      row({ 0: 2, 1: 1, 2: 2, 3: ACT.ATTACK_UNIT, 6: [ACT.ATTACK_UNIT] }),
      row({ 0: 3, 1: 1, 2: 3, 3: ACT.HOLD_POSITION, 4: 0, 5: null, 6: [ACT.EXPLODE] }),
    ];
    const json = await exportJson('slot_stats', rows);
    const attack = json.actionStats.rows.find((entry) => entry[0] === 'ATTACK_UNIT');
    const portalCast = json.actionStats.rows.find((entry) => entry[0] === 'PORTAL_CAST');
    expect(attack).toEqual(['ATTACK_UNIT', 2, 2, 1, 10, 6, false]);
    expect(portalCast?.[3]).toBeNull();
  });

  it('marks neverWins when an action appears as a candidate 20 times and never wins', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => row({ 0: index + 1, 1: 1, 2: 100 + index, 3: ACT.ATTACK_UNIT, 6: [ACT.ATTACK_UNIT, ACT.PORTAL_CAST] }));
    const json = await exportJson('slot_never_wins', rows);
    const portalCast = json.actionStats.rows.find((entry) => entry[0] === 'PORTAL_CAST');
    expect(portalCast?.[1]).toBe(20);
    expect(portalCast?.[2]).toBe(0);
    expect(portalCast?.[6]).toBe(true);
  });

  it('derives row flags on matching rows and omits them on neighbouring controls', async () => {
    const slid = getOutcomeBitMask(['SLID']);
    const died = getOutcomeBitMask(['DIED']);
    const rows = [
      row({ 1: 1, 2: 10, 3: ACT.MOVE_TO_UNIT, 17: 0, 18: getStopCode('RANGE') }),
      row({ 0: 2, 2: 11 }),
      row({ 0: 3, 1: 1, 2: 12, 3: ACT.MOVE_TO_UNIT, 17: 0, 18: getStopCode('NO_PATH') }),
      row({ 0: 4, 2: 13 }),
      row({ 0: 5, 1: 1, 2: 14, 3: ACT.MOVE_TO_UNIT, 17: 0, 18: getStopCode('BLOCKED_UNIT'), 19: 3 }),
      row({ 0: 6, 2: 15 }),
      row({ 0: 7, 1: 1, 2: 16, 3: ACT.MOVE_TO_UNIT, 17: 0, 18: getStopCode('RANGE'), 6: [ACT.MOVE_TO_UNIT, ACT.EXPLODE] }),
      row({ 0: 8, 2: 17 }),
      row({ 0: 9, 1: 1, 2: 18, 3: ACT.MOVE_TO_UNIT, 23: slid }),
      row({ 0: 10, 2: 19 }),
      row({ 0: 11, 1: 1, 2: 20, 3: ACT.MOVE_TO_UNIT, 14: 3, 15: 3, 23: 0 }),
      row({ 0: 12, 2: 21, 12: 0, 14: -1, 15: -1 }),
      row({ 0: 13, 1: 1, 2: 22, 3: ACT.MOVE_TO_UNIT, 17: 3, 19: 10, 14: 3, 15: 0 }),
      row({ 0: 14, 2: 23 }),
      row({ 0: 15, 1: 1, 2: 24, 4: 10, 5: 8.5 }),
      row({ 0: 16, 2: 25, 5: 3 }),
      row({ 0: 17, 1: 1, 2: 26, 3: ACT.HOLD_POSITION, 17: 0, 21: 0, 24: [1, 10, 4, 5, 0, 0, 1, -1] }),
      row({ 0: 18, 2: 27, 24: [1, 10, 5, 5, 0, -1, 0, -1] }),
      row({ 0: 19, 1: 1, 2: 28, 3: ACT.MOVE_TO_UNIT, 24: [1, 10, 5, 5, 0, -1, 0, AI_TRACE.THREAT_RADIUS] }),
      row({ 0: 20, 2: 29, 24: [1, 10, 5, 5, 0, -1, 0, -1] }),
      row({ 0: 21, 1: 1, 2: 30, 7: 9, 8: 9 }),
      row({ 0: 22, 1: 1, 2: 30, 7: 9, 8: 9 }),
      row({ 0: 23, 1: 1, 2: 30, 7: 9, 8: 9 }),
      row({ 0: 24, 1: 1, 2: 31, 7: 9, 8: 9 }),
      row({ 0: 21, 1: 1, 2: 40, 9: 2, 10: 2 }),
      row({ 0: 22, 1: 1, 2: 40, 9: 3, 10: 3 }),
      row({ 0: 23, 1: 1, 2: 40, 9: 2, 10: 2 }),
      row({ 0: 21, 1: 1, 2: 41, 9: 2, 10: 2 }),
      row({ 0: 25, 1: 1, 2: 41, 9: 2, 10: 2 }),
      row({ 0: 26, 1: 1, 2: 50, 3: ACT.ATTACK_UNIT, 21: 2, 22: 5, 23: died }),
      row({ 0: 27, 1: 1, 2: 60 }),
      row({ 0: 27, 1: 1, 2: 61 }),
      row({ 0: 27, 1: 2, 2: 61 }),
    ];
    const json = await exportJson('slot_flags', rows);
    expect(flagsFor(json, 1, 10, 1)).toContain('BLOCKED_MOVE');
    expect(flagsFor(json, 2, 11)).not.toContain('BLOCKED_MOVE');
    expect(flagsFor(json, 3, 12, 1)).toContain('NO_PATH');
    expect(flagsFor(json, 4, 13)).not.toContain('NO_PATH');
    expect(flagsFor(json, 5, 14, 1)).toContain('CONGESTED');
    expect(flagsFor(json, 6, 15)).not.toContain('CONGESTED');
    expect(flagsFor(json, 7, 16, 1)).toContain('EXPLODE_AVAILABLE_UNUSED');
    expect(flagsFor(json, 8, 17)).not.toContain('EXPLODE_AVAILABLE_UNUSED');
    expect(flagsFor(json, 9, 18, 1)).toContain('SLID');
    expect(flagsFor(json, 10, 19)).not.toContain('SLID');
    expect(flagsFor(json, 11, 20, 1)).toContain('BRIDGE_AVAILABLE_UNUSED');
    expect(flagsFor(json, 12, 21)).not.toContain('BRIDGE_AVAILABLE_UNUSED');
    expect(flagsFor(json, 13, 22, 1)).toContain('TERRAIN_DETOUR');
    expect(flagsFor(json, 14, 23)).not.toContain('TERRAIN_DETOUR');
    expect(flagsFor(json, 15, 24, 1)).toContain('CLOSE_CALL');
    expect(flagsFor(json, 16, 25)).not.toContain('CLOSE_CALL');
    expect(flagsFor(json, 17, 26, 1)).toContain('IDLE_ON_OWN_BUILDING');
    expect(flagsFor(json, 18, 27)).not.toContain('IDLE_ON_OWN_BUILDING');
    expect(flagsFor(json, 19, 28, 1)).toContain('THREAT_IGNORED');
    expect(flagsFor(json, 20, 29)).not.toContain('THREAT_IGNORED');
    expect(flagsFor(json, 23, 30, 1)).toContain('STUCK');
    expect(flagsFor(json, 24, 31, 1)).not.toContain('STUCK');
    expect(flagsFor(json, 23, 40, 1)).toContain('OSCILLATION');
    expect(flagsFor(json, 25, 41, 1)).not.toContain('OSCILLATION');
    expect(flagsFor(json, 26, 50, 1)).toContain('SUICIDE_ATTACK');
    expect(flagsFor(json, 27, 60, 1)).toContain('SLOT2_UNUSED');
    expect(flagsFor(json, 27, 61, 1)).not.toContain('SLOT2_UNUSED');
  });

  it('requires consecutive turns for STUCK and ignores gaps', async () => {
    const rows = [
      row({ 0: 1, 1: 1, 2: 70, 7: 4, 8: 4 }),
      row({ 0: 2, 1: 1, 2: 70, 7: 4, 8: 4 }),
      row({ 0: 4, 1: 1, 2: 70, 7: 4, 8: 4 }),
      row({ 0: 5, 1: 1, 2: 70, 7: 4, 8: 4 }),
      row({ 0: 6, 1: 1, 2: 70, 7: 4, 8: 4 }),
    ];
    const json = await exportJson('slot_stuck', rows);
    expect(flagsFor(json, 4, 70, 1)).not.toContain('STUCK');
    expect(flagsFor(json, 6, 70, 1)).toContain('STUCK');
  });

  it('detects OSCILLATION only within the configured window', async () => {
    const rows = [
      row({ 0: 1, 1: 1, 2: 80, 9: 1, 10: 1 }),
      row({ 0: 2, 1: 1, 2: 80, 9: 2, 10: 2 }),
      row({ 0: 4, 1: 1, 2: 80, 9: 1, 10: 1 }),
      row({ 0: 1, 1: 1, 2: 81, 9: 1, 10: 1 }),
      row({ 0: 5, 1: 1, 2: 81, 9: 1, 10: 1 }),
    ];
    const json = await exportJson('slot_osc', rows);
    expect(flagsFor(json, 4, 80, 1)).toContain('OSCILLATION');
    expect(flagsFor(json, 5, 81, 1)).not.toContain('OSCILLATION');
  });

  it('flaggedOnly keeps only flagged rows while preserving summaries, units, and actionStats', async () => {
    const rows = [
      row({ 0: 1, 1: 1, 2: 90, 3: ACT.MOVE_TO_UNIT, 17: 0, 18: getStopCode('NO_PATH') }),
      row({ 0: 1, 1: 2, 2: 90 }),
    ];
    const full = await exportJson('slot_flagged_full', rows, 'full');
    const flagged = await exportJson('slot_flagged_only', rows, 'flaggedOnly');
    expect(flagsFor(full, 1, 90, 2)).toEqual([]);
    expect(flagged.rows.length).toBeLessThan(full.rows.length);
    expect(flagged.rows.length).toBeGreaterThan(0);
    expect(flagged.summaries.rows.length).toBeGreaterThan(0);
    expect(flagged.units.rows.length).toBeGreaterThan(0);
    expect(flagged.actionStats.rows.length).toBe(full.actionStats.rows.length);
  });

  it('noTerms removes exactly the three term columns from columns and rows', async () => {
    const full = await exportJson('slot_full_terms', [row()], 'full');
    const noTerms = await exportJson('slot_no_terms', [row()], 'noTerms');
    expect(noTerms.columns).toEqual(full.columns.filter((column) => !['domTerm', 'terms', 'terms2'].includes(column)));
    expect(noTerms.rows[0]).toHaveLength(noTerms.columns.length);
    expect(full.rows[0]).toHaveLength(full.columns.length);
    expect(full.rows[0].length - noTerms.rows[0].length).toBe(3);
  });

  it('embeds AI_SCORING verbatim in config', async () => {
    const json = await exportJson('slot_config', [row()]);
    expect(json.config.AI_SCORING).toEqual(JSON.parse(JSON.stringify(AI_SCORING)));
  });

  it('collects unitDefs for exactly the unit types present in the run', async () => {
    const rows = [row({ 2: 1 }), row({ 0: 2, 2: 2 })];
    const json = await exportJson('slot_unit_defs', rows);
    expect(json.unitDefs.map((entry) => entry.type).sort()).toEqual(['LAVA_ARCHER', 'LAVA_GRUNT']);
  });

  it('returns null for an empty trace', async () => {
    await expect(buildTraceExport('missing_slot', 'full')).resolves.toBeNull();
  });

  it('serializes cleanly in all modes when terms are null throughout', async () => {
    const rows = [row({ 0: 1 }), row({ 0: 2, 2: 2, 3: ACT.MOVE_TO_UNIT, 18: getStopCode('NO_PATH'), 17: 0 })];
    for (const mode of ['full', 'noTerms', 'flaggedOnly'] as const) {
      const json = await exportJson(`slot_modes_${mode}`, rows, mode);
      expect(json.rows.length).toBeGreaterThanOrEqual(mode === 'flaggedOnly' ? 1 : 2);
    }
  });
});
