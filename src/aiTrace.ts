import type { Difficulty, SpawnBudgetSnapshot, Unit } from './types';

export const ACTION_TABLE = [
  'ATTACK_UNIT', 'RANGED_ATTACK_UNIT', 'ATTACK_BUILDING', 'RANGED_ATTACK_BUILDING',
  'INTERCEPT_CAPTOR', 'CAPTURE_BUILDING', 'CONTEST_BUILDING', 'RETAKE_BUILDING',
  'DEFEND_ENEMY_BUILDING', 'PROTECT_SPAWNER', 'PUSH_TO_STRONGHOLD', 'PUSH_TO_ZONE_EDGE',
  'SPREAD_TO_FLANK', 'MOVE_TO_PLAYER_BUILDING', 'MOVE_TO_NEUTRAL_BUILDING', 'MOVE_TO_UNIT',
  'ADVANCE_TOWARD_LAVA', 'FLANK_UNIT', 'SACRIFICE_TO_LAVA', 'CORRUPT_TERRAIN',
  'BUILD_LAVA_LAIR', 'BUILD_INFERNAL_SANCTUM', 'MOVE_TO_SAFE_RANGED_POSITION', 'EXPLODE',
  'MOVE_TO_PORTAL', 'HOLD_POSITION',
  'CM_ATTACK_IN_RANGE', 'CM_MOVE_AND_ATTACK', 'CM_RETURN_HOME', 'CM_PATROL', 'CM_DESPAWN', 'CM_IDLE',
  'PORTAL_CAST', 'TUNNEL_BEGIN', 'TUNNEL_TICK',
] as const;

export const STOP_TABLE = [
  'REACHED', 'RANGE', 'NO_PATH', 'FALLBACK', 'BLOCKED_UNIT', 'ZONE_LOCKOUT', 'SLID', 'DIED', 'ALREADY_THERE',
] as const;

export const OUTCOME_BITS = [
  'KILL', 'DIED', 'CAPTURED', 'BUILT', 'CORRUPTED', 'EXPLODED', 'TELEPORTED', 'SLID',
  'TRAPPED', 'COUNTERED', 'OVERWATCH_HIT', 'PREVENTIVE_HIT', 'BRIDGE_USED',
] as const;

export type ActionCode = (typeof ACTION_TABLE)[number];
export type MoveStopReason = (typeof STOP_TABLE)[number];
export type OutcomeBit = (typeof OUTCOME_BITS)[number];

export type AiRow = [
  t: number, s: number, uIdx: number, act: number,
  sc: number | null, d2: number | null, cand: number[],
  fx: number, fy: number, tx: number, ty: number, hp: number,
  tgtK: number, tgtIdx: number, tgtX: number, tgtY: number, tgtD: number,
  mv: number, stop: number, pathLen: number, terr: string,
  dmg: number, rcv: number, flags: number, ctx: number[],
  domTerm: number,
  terms: Array<[number, number]> | null,
  terms2: Array<[number, number]> | null,
];

export const AI_ROW_COLUMNS = [
  't', 's', 'uIdx', 'act', 'sc', 'd2', 'cand', 'fx', 'fy', 'tx', 'ty', 'hp',
  'tgtK', 'tgtIdx', 'tgtX', 'tgtY', 'tgtD', 'mv', 'stop', 'pathLen', 'terr',
  'dmg', 'rcv', 'flags', 'ctx', 'domTerm', 'terms', 'terms2',
] as const;

export type AiUnitRow = [
  uIdx: number, id: string, type: string, spawnTurn: number,
  spawnBuildingId: string | null, sx: number, sy: number,
  deathTurn: number, deathCause: string, maxLevel: number,
];

export interface AiThreatEntry {
  b: number;
  ty: string;
  p: [number, number];
  adj: number;
  cap: number;
  near: number;
  def: number;
}

export interface AiTurnSummary {
  turn: number;
  enemyUnits: number;
  playerUnits: number;
  pHp: number;
  pAtk: number;
  pB: number;
  eHp: number;
  eAtk: number;
  eB: number;
  ember: number;
  lavaFrontRow: number;
  front: [number, number];
  spawns: number;
  lastSpawnBudget: SpawnBudgetSnapshot | null;
  actions: number[];
  stops: number[];
  blocked: number;
  static: number;
  slot2: number;
  kills: number;
  losses: number;
  activeLockoutZones: number[];
  threats: AiThreatEntry[];
}

export interface AiTraceChunk {
  key: string;
  slotId: string;
  turn: number;
  rows: AiRow[];
  units: AiUnitRow[];
  buildings: Array<[number, string, string]>;
  summary: AiTurnSummary;
}

export interface AiTraceMeta {
  key: string;
  slotId: string;
  runId: string;
  gameVersion: string;
  schemaVersion: number;
  difficulty: Difficulty;
  gridSize: [number, number];
  firstTurn: number;
  lastTurn: number;
  rowCount: number;
  byteEstimate: number;
  capped: boolean;
  nextUnitIndex: number;
  nextBuildingIndex: number;
  unitRowsById: Record<string, AiUnitRow>;
  buildingRowsById: Record<string, [number, string, string]>;
}

export interface AiTraceSeed {
  meta: AiTraceMeta | null;
  remainingRows: number;
}

export interface MoveOutcome {
  steps: number;
  pathLen: number;
  stop: MoveStopReason;
  terr: string;
  bridgeSteps: number;
  slid: boolean;
}

export interface AiDecisionArgs {
  slot: number;
  unitIndex: number;
  action: number;
  score: number | null;
  secondScore: number | null;
  candidates: number[];
  from: { x: number; y: number };
  to: { x: number; y: number };
  hp: number;
  targetKind: number;
  targetIndex: number;
  targetPos: { x: number; y: number };
  targetDistance: number;
  moveSteps: number;
  stop: number;
  pathLen: number;
  terrain: string;
  damage: number;
  received: number;
  flags: number;
  ctx: number[];
}

export const ACTION_CODE_INDEX: Record<ActionCode, number> = ACTION_TABLE.reduce((acc, action, index) => {
  acc[action] = index;
  return acc;
}, {} as Record<ActionCode, number>);

export const STOP_CODE_INDEX: Record<MoveStopReason, number> = STOP_TABLE.reduce((acc, stop, index) => {
  acc[stop] = index;
  return acc;
}, {} as Record<MoveStopReason, number>);

export const OUTCOME_BIT_INDEX: Record<OutcomeBit, number> = OUTCOME_BITS.reduce((acc, bit, index) => {
  acc[bit] = index;
  return acc;
}, {} as Record<OutcomeBit, number>);

export function encodeOutcomeBits(bits: OutcomeBit[]): number {
  let value = 0;
  for (const bit of bits) value |= (1 << OUTCOME_BIT_INDEX[bit]);
  return value;
}

export function encodeTerrainTile(terrain: string, status: string | null, bridged: boolean): string {
  const base = bridged ? 'B' : terrain;
  let suffix = '';
  if (status === 'FROZEN') suffix = 'f';
  else if (status === 'BURNING') suffix = 'b';
  else if (status === 'CORRUPTED') suffix = 'c';
  return `${base}${suffix}`;
}

function padTurn(turn: number): string {
  return String(turn).padStart(6, '0');
}

interface CollectorSeedState {
  nextUnitIndex: number;
  nextBuildingIndex: number;
  unitRowsById: Record<string, AiUnitRow>;
  buildingRowsById: Record<string, [number, string, string]>;
  remainingRows: number;
}

export class AiTraceCollector {
  private readonly turn: number;
  private readonly slotId: string;
  private readonly rows: AiRow[] = [];
  private readonly unitRowsById: Map<string, AiUnitRow>;
  private readonly buildingRowsById: Map<string, [number, string, string]>;
  private readonly pendingUnitRows = new Map<number, AiUnitRow>();
  private readonly pendingBuildingRows = new Map<number, [number, string, string]>();
  private readonly maxRows: number;
  private nextUnitIndex: number;
  private nextBuildingIndex: number;
  private threats: AiThreatEntry[] = [];

  constructor(turn: number, slotId: string, seed?: CollectorSeedState) {
    this.turn = turn;
    this.slotId = slotId;
    this.nextUnitIndex = seed?.nextUnitIndex ?? 0;
    this.nextBuildingIndex = seed?.nextBuildingIndex ?? 0;
    this.unitRowsById = new Map(Object.entries(seed?.unitRowsById ?? {}));
    this.buildingRowsById = new Map(Object.entries(seed?.buildingRowsById ?? {}));
    this.maxRows = Math.max(0, seed?.remainingRows ?? Number.POSITIVE_INFINITY);
  }

  unitIndex(unit: Unit): number {
    const existing = this.unitRowsById.get(unit.id);
    if (existing) {
      if (unit.level > existing[9]) {
        const updated: AiUnitRow = [...existing];
        updated[9] = unit.level;
        this.unitRowsById.set(unit.id, updated);
        this.pendingUnitRows.set(updated[0], updated);
      }
      return existing[0];
    }
    const row: AiUnitRow = [
      this.nextUnitIndex++,
      unit.id,
      unit.type,
      this.turn,
      unit.roostBuildingId ?? null,
      unit.position.x,
      unit.position.y,
      -1,
      '',
      unit.level,
    ];
    this.unitRowsById.set(unit.id, row);
    this.pendingUnitRows.set(row[0], row);
    return row[0];
  }

  buildingIndex(buildingId: string, type = ''): number {
    const existing = this.buildingRowsById.get(buildingId);
    if (existing) return existing[0];
    const row: [number, string, string] = [this.nextBuildingIndex++, buildingId, type];
    this.buildingRowsById.set(buildingId, row);
    this.pendingBuildingRows.set(row[0], row);
    return row[0];
  }

  setThreats(threats: AiThreatEntry[]): void {
    this.threats = threats;
  }

  pushDecision(args: AiDecisionArgs): void {
    if (this.rows.length >= this.maxRows) return;
    this.rows.push([
      this.turn, args.slot, args.unitIndex, args.action,
      args.score, args.secondScore, args.candidates,
      args.from.x, args.from.y, args.to.x, args.to.y, args.hp,
      args.targetKind, args.targetIndex, args.targetPos.x, args.targetPos.y, args.targetDistance,
      args.moveSteps, args.stop, args.pathLen, args.terrain,
      args.damage, args.received, args.flags, args.ctx,
      -1,
      null,
      null,
    ]);
  }

  markDeath(unitId: string, cause: string): void {
    const existing = this.unitRowsById.get(unitId);
    if (!existing) return;
    const updated: AiUnitRow = [...existing];
    updated[7] = this.turn;
    updated[8] = cause;
    this.unitRowsById.set(unitId, updated);
    this.pendingUnitRows.set(updated[0], updated);
  }

  finish(summary: AiTurnSummary): AiTraceChunk {
    summary.threats = this.threats;
    return {
      key: `${this.slotId}:${padTurn(this.turn)}`,
      slotId: this.slotId,
      turn: this.turn,
      rows: this.rows,
      units: Array.from(this.pendingUnitRows.values()).sort((a, b) => a[0] - b[0]),
      buildings: Array.from(this.pendingBuildingRows.values()).sort((a, b) => a[0] - b[0]),
      summary,
    };
  }
}
