import { AI_TRACE } from './gameConfig';
import { Faction } from './types';
import type { Building, Position, SpawnBudgetSnapshot, Unit } from './types';

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

export type ActionCode = typeof ACTION_TABLE[number];
export type MoveStopReason = typeof STOP_TABLE[number];
export type OutcomeBit = typeof OUTCOME_BITS[number];

const ACTION_CODE_BY_NAME = new Map<ActionCode, number>(ACTION_TABLE.map((name, index) => [name, index]));
const STOP_CODE_BY_NAME = new Map<MoveStopReason, number>(STOP_TABLE.map((name, index) => [name, index]));
const OUTCOME_BIT_BY_NAME = new Map<OutcomeBit, number>(OUTCOME_BITS.map((name, index) => [name, index]));

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
  /** Enemy building id. */
  b: string;
  /** Building type. */
  ty: string;
  p: [number, number];
  /** Player units adjacent to it. */
  adj: number;
  /** A player capture is in progress on it. */
  cap: boolean;
  /** Enemy units within AI_TRACE.THREAT_RADIUS. */
  near: number;
  /**
   * How many of those chose DEFEND_ENEMY_BUILDING, CONTEST_BUILDING,
   * RETAKE_BUILDING, PROTECT_SPAWNER or INTERCEPT_CAPTOR targeting this
   * building this turn. Filled in at the end of the turn, from the rows.
   */
  def: number;
}

export interface AiTurnSummary {
  t: number;
  /** Unit counts at the start of the enemy turn. */
  eu: number;
  pu: number;
  /** Player strength: summed current hp, summed attack, building count. */
  pHp: number;
  pAtk: number;
  pB: number;
  /** Same for the enemy. */
  eHp: number;
  eAtk: number;
  eB: number;
  /** Ember level. */
  em: number;
  /** Lava front row. */
  lf: number;
  /** [northernmost player unit row, southernmost enemy unit row], -1 when none. */
  front: [number, number];
  /** Units spawned this turn. */
  sp: number;
  /** Verbatim copy of state.lastSpawnBudget, or null. */
  budget: SpawnBudgetSnapshot | null;
  /** Action index to count. */
  acts: Record<number, number>;
  /** Stop reason index to count. */
  stops: Record<number, number>;
  /** Movement actions that produced 0 tiles. */
  blocked: number;
  /** Units whose position was unchanged across the whole turn. */
  static: number;
  /** Units that executed a second action. */
  slot2: number;
  /** Player units killed by the enemy this turn. */
  kills: number;
  /** Enemy units lost this turn. */
  losses: number;
  /** Zones under lockout this turn. */
  lockouts: number[];
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

export interface AiTraceIndexSeed {
  nextUnitIndex: number;
  nextBuildingIndex: number;
  unitIds: Record<string, number>;
  buildingIds: Record<string, number>;
}

export interface AiTraceMeta extends AiTraceIndexSeed {
  key: string;
  slotId: string;
  runId: string;
  gameVersion: string;
  schemaVersion: number;
  difficulty: string;
  gridWidth: number;
  gridHeight: number;
  firstTurn: number;
  lastTurn: number;
  rowCount: number;
  byteEstimate: number;
  capped: boolean;
  buildingTypes: Record<string, string>;
}

export interface AiDecisionArgs {
  slot: number;
  unit: Unit;
  action: ActionCode;
  score: number | null;
  secondScore: number | null;
  candidates: number[];
  from: Position;
  to: Position;
  hp: number;
  targetKind: 0 | 1 | 2 | 3;
  targetIndex: number;
  targetPosition: Position | null;
  targetDistance: number;
  moveTiles: number;
  stopReason: number;
  pathLength: number;
  terrain: string;
  damage: number;
  received: number;
  flags: number;
  context: number[];
}

function cloneUnitRow(row: AiUnitRow): AiUnitRow {
  return [...row] as AiUnitRow;
}

function createUnitRow(turn: number, index: number, unit: Unit): AiUnitRow {
  return [
    index,
    unit.id,
    unit.type,
    turn,
    unit.roostBuildingId ?? null,
    unit.position.x,
    unit.position.y,
    -1,
    '',
    unit.level,
  ];
}

function paddedTurn(turn: number): string {
  return String(turn).padStart(6, '0');
}

export function getActionCode(name: ActionCode): number {
  return ACTION_CODE_BY_NAME.get(name) ?? -1;
}

export function getStopCode(name: MoveStopReason): number {
  return STOP_CODE_BY_NAME.get(name) ?? -1;
}

export function getOutcomeBitMask(bits: OutcomeBit[]): number {
  let mask = 0;
  for (const bit of bits) {
    const index = OUTCOME_BIT_BY_NAME.get(bit);
    if (index !== undefined) {
      mask |= 1 << index;
    }
  }
  return mask;
}

export function getTraceKey(slotId: string, turn: number): string {
  return `${slotId}:${paddedTurn(turn)}`;
}

export function getTraceMetaKey(slotId: string): string {
  return `${slotId}:meta`;
}

export function getBuildingFactionCode(building: Building | null | undefined): number {
  if (!building) return 0;
  if (building.faction === Faction.ENEMY) return 1;
  if (building.faction === Faction.PLAYER) return 2;
  if (building.faction === null) return 3;
  return 0;
}

export class AiTraceCollector {
  private readonly rows: AiRow[] = [];
  private readonly pendingUnits = new Map<number, AiUnitRow>();
  private readonly pendingBuildings = new Map<number, [number, string, string]>();
  private readonly unitIds = new Map<string, number>();
  private readonly buildingIds = new Map<string, number>();
  private readonly knownUnitRows = new Map<number, AiUnitRow>();
  private readonly knownBuildingTypes = new Map<string, string>();
  private nextUnitIndex: number;
  private nextBuildingIndex: number;
  private threats: AiThreatEntry[] = [];

  constructor(
    private readonly turn: number,
    private readonly slotId: string,
    seed?: Partial<AiTraceIndexSeed> & { buildingTypes?: Record<string, string> },
  ) {
    for (const [id, index] of Object.entries(seed?.unitIds ?? {})) {
      this.unitIds.set(id, index);
    }
    for (const [id, index] of Object.entries(seed?.buildingIds ?? {})) {
      this.buildingIds.set(id, index);
    }
    for (const [id, type] of Object.entries(seed?.buildingTypes ?? {})) {
      this.knownBuildingTypes.set(id, type);
    }
    this.nextUnitIndex = seed?.nextUnitIndex ?? 0;
    this.nextBuildingIndex = seed?.nextBuildingIndex ?? 0;
  }

  unitIndex(unit: Unit): number {
    let index = this.unitIds.get(unit.id);
    if (index === undefined) {
      index = this.nextUnitIndex;
      this.nextUnitIndex += 1;
      this.unitIds.set(unit.id, index);
      const row = createUnitRow(this.turn, index, unit);
      this.knownUnitRows.set(index, row);
      this.pendingUnits.set(index, cloneUnitRow(row));
      return index;
    }

    const existing = this.knownUnitRows.get(index) ?? createUnitRow(this.turn, index, unit);
    if (unit.level > existing[9]) {
      existing[9] = unit.level;
      this.knownUnitRows.set(index, existing);
      this.pendingUnits.set(index, cloneUnitRow(existing));
    }
    return index;
  }

  buildingIndex(buildingId: string, buildingType = ''): number {
    let index = this.buildingIds.get(buildingId);
    if (index === undefined) {
      index = this.nextBuildingIndex;
      this.nextBuildingIndex += 1;
      this.buildingIds.set(buildingId, index);
      this.knownBuildingTypes.set(buildingId, buildingType);
      this.pendingBuildings.set(index, [index, buildingId, buildingType]);
      return index;
    }

    if (buildingType && !this.knownBuildingTypes.get(buildingId)) {
      this.knownBuildingTypes.set(buildingId, buildingType);
      this.pendingBuildings.set(index, [index, buildingId, buildingType]);
    }
    return index;
  }

  setThreats(threats: AiThreatEntry[]): void {
    this.threats = threats.map((entry) => ({
      ...entry,
      p: [entry.p[0], entry.p[1]],
    }));
  }

  pushDecision(args: AiDecisionArgs): void {
    const targetPosition = args.targetPosition ?? { x: -1, y: -1 };
    this.rows.push([
      this.turn,
      args.slot,
      this.unitIndex(args.unit),
      getActionCode(args.action),
      args.score,
      args.secondScore,
      [...args.candidates],
      args.from.x,
      args.from.y,
      args.to.x,
      args.to.y,
      args.hp,
      args.targetKind,
      args.targetIndex,
      targetPosition.x,
      targetPosition.y,
      args.targetDistance,
      args.moveTiles,
      args.stopReason,
      args.pathLength,
      args.terrain,
      args.damage,
      args.received,
      args.flags,
      [...args.context],
      -1,
      null,
      null,
    ]);
  }

  markDeath(unitId: string, cause: string): void {
    const index = this.unitIds.get(unitId);
    if (index === undefined) return;
    const row = cloneUnitRow(this.knownUnitRows.get(index) ?? [index, unitId, '', this.turn, null, -1, -1, -1, '', 0]);
    row[7] = this.turn;
    row[8] = cause;
    this.knownUnitRows.set(index, row);
    this.pendingUnits.set(index, cloneUnitRow(row));
  }

  finish(summary: AiTurnSummary): AiTraceChunk {
    return {
      key: getTraceKey(this.slotId, this.turn),
      slotId: this.slotId,
      turn: this.turn,
      rows: [...this.rows],
      units: [...this.pendingUnits.values()].sort((a, b) => a[0] - b[0]).map(cloneUnitRow),
      buildings: [...this.pendingBuildings.values()].sort((a, b) => a[0] - b[0]),
      summary: {
        ...summary,
        budget: summary.budget ? JSON.parse(JSON.stringify(summary.budget)) as SpawnBudgetSnapshot : null,
        acts: { ...summary.acts },
        stops: { ...summary.stops },
        lockouts: [...summary.lockouts],
        threats: this.threats.length > 0 ? this.threats.map((entry) => ({ ...entry, p: [entry.p[0], entry.p[1]] })) : summary.threats.map((entry) => ({ ...entry, p: [entry.p[0], entry.p[1]] })),
      },
    };
  }

  getIndexSeed(): AiTraceIndexSeed & { buildingTypes: Record<string, string> } {
    return {
      nextUnitIndex: this.nextUnitIndex,
      nextBuildingIndex: this.nextBuildingIndex,
      unitIds: Object.fromEntries(this.unitIds.entries()),
      buildingIds: Object.fromEntries(this.buildingIds.entries()),
      buildingTypes: Object.fromEntries(this.knownBuildingTypes.entries()),
    };
  }
}

export function createEmptyTraceMeta(slotId: string): AiTraceMeta {
  return {
    key: getTraceMetaKey(slotId),
    slotId,
    runId: crypto.randomUUID(),
    gameVersion: __APP_VERSION__,
    schemaVersion: AI_TRACE.SCHEMA_VERSION,
    difficulty: '',
    gridWidth: 0,
    gridHeight: 0,
    firstTurn: -1,
    lastTurn: -1,
    rowCount: 0,
    byteEstimate: 0,
    capped: false,
    nextUnitIndex: 0,
    nextBuildingIndex: 0,
    unitIds: {},
    buildingIds: {},
    buildingTypes: {},
  };
}
