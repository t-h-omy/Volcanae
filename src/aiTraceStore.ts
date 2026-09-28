import { create } from 'zustand';
import { AI_TRACE, MAP, SAVE } from './gameConfig';
import type { GameState } from './types';
import type { AiTraceChunk, AiTraceMeta, AiTraceSeed } from './aiTrace';
import { openSaveDb, idbAvailable, SAVE_VERSION } from './saveSystem';

type TraceStatus = 'OK' | 'STOPPED_QUOTA' | 'CAPPED';

interface TraceStatusState {
  status: TraceStatus;
  setStatus: (status: TraceStatus) => void;
}

const META_SUFFIX = ':meta';
const traceMetaCache = new Map<string, AiTraceMeta | null>();

export const useAiTraceStatusStore = create<TraceStatusState>()((set) => ({
  status: 'OK',
  setStatus: (status) => set({ status }),
}));

function setStatus(status: TraceStatus) {
  useAiTraceStatusStore.getState().setStatus(status);
}

function metaKey(slotId: string): string {
  return `${slotId}${META_SUFFIX}`;
}

function traceRange(slotId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${slotId}:`, `${slotId}:\uffff`);
}

function estimateChunkBytes(chunk: AiTraceChunk): number {
  try {
    return JSON.stringify(chunk).length;
  } catch {
    return 0;
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

function makeMeta(slotId: string, chunk: AiTraceChunk, state?: GameState): AiTraceMeta {
  const width = state?.grid[0]?.length ?? MAP.GRID_WIDTH;
  const height = state?.grid.length ?? MAP.GRID_HEIGHT;
  return {
    key: metaKey(slotId),
    slotId,
    runId: `${slotId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    gameVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
    schemaVersion: AI_TRACE.SCHEMA_VERSION,
    difficulty: state?.difficulty ?? 'STANDARD',
    gridSize: [width, height],
    firstTurn: chunk.turn,
    lastTurn: chunk.turn,
    rowCount: chunk.rows.length,
    byteEstimate: estimateChunkBytes(chunk),
    capped: chunk.rows.length >= AI_TRACE.MAX_ROWS,
    nextUnitIndex: chunk.units.reduce((max, row) => Math.max(max, row[0] + 1), 0),
    nextBuildingIndex: chunk.buildings.reduce((max, row) => Math.max(max, row[0] + 1), 0),
    unitRowsById: Object.fromEntries(chunk.units.map((row) => [row[1], row])),
    buildingRowsById: Object.fromEntries(chunk.buildings.map((row) => [row[1], row])),
  };
}

function updateMeta(meta: AiTraceMeta, chunk: AiTraceChunk): AiTraceMeta {
  const nextUnitIndex = chunk.units.reduce((max, row) => Math.max(max, row[0] + 1), meta.nextUnitIndex);
  const nextBuildingIndex = chunk.buildings.reduce((max, row) => Math.max(max, row[0] + 1), meta.nextBuildingIndex);
  return {
    ...meta,
    lastTurn: chunk.turn,
    rowCount: meta.rowCount + chunk.rows.length,
    byteEstimate: meta.byteEstimate + estimateChunkBytes(chunk),
    capped: meta.rowCount + chunk.rows.length >= AI_TRACE.MAX_ROWS,
    nextUnitIndex,
    nextBuildingIndex,
    unitRowsById: {
      ...meta.unitRowsById,
      ...Object.fromEntries(chunk.units.map((row) => [row[1], row])),
    },
    buildingRowsById: {
      ...meta.buildingRowsById,
      ...Object.fromEntries(chunk.buildings.map((row) => [row[1], row])),
    },
  };
}

async function scanChunks(slotId: string): Promise<AiTraceChunk[]> {
  const db = await openSaveDb();
  return new Promise<AiTraceChunk[]>((resolve, reject) => {
    const tx = db.transaction(SAVE.STORE_TRACE, 'readonly');
    const store = tx.objectStore(SAVE.STORE_TRACE);
    const req = store.openCursor(traceRange(slotId));
    const items: AiTraceChunk[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(items);
        return;
      }
      const value = cursor.value as AiTraceChunk | AiTraceMeta;
      if ((value as AiTraceChunk).turn !== undefined && cursor.key !== metaKey(slotId)) {
        items.push(value as AiTraceChunk);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function rebuildMeta(slotId: string): Promise<AiTraceMeta | null> {
  const chunks = await scanChunks(slotId);
  if (chunks.length === 0) {
    traceMetaCache.set(slotId, null);
    return null;
  }
  let rebuilt = makeMeta(slotId, chunks[0]);
  for (let index = 1; index < chunks.length; index++) rebuilt = updateMeta(rebuilt, chunks[index]);
  rebuilt.firstTurn = chunks[0].turn;
  rebuilt.lastTurn = chunks[chunks.length - 1].turn;
  traceMetaCache.set(slotId, rebuilt);
  const db = await openSaveDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
    tx.objectStore(SAVE.STORE_TRACE).put(rebuilt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return rebuilt;
}

export function getTraceSeed(slotId: string): AiTraceSeed {
  const meta = traceMetaCache.get(slotId) ?? null;
  if (meta?.capped || (meta?.rowCount ?? 0) >= AI_TRACE.MAX_ROWS) {
    setStatus('CAPPED');
  }
  return {
    meta,
    remainingRows: Math.max(0, AI_TRACE.MAX_ROWS - (meta?.rowCount ?? 0)),
  };
}

export async function appendChunk(slotId: string, chunk: AiTraceChunk, state?: GameState): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const cachedMeta = traceMetaCache.get(slotId) ?? null;
    if (cachedMeta?.capped || (cachedMeta?.rowCount ?? 0) >= AI_TRACE.MAX_ROWS) {
      setStatus('CAPPED');
      return;
    }
    const db = await openSaveDb();
    const meta = cachedMeta ?? await readMeta(slotId);
    if (meta?.capped || (meta?.rowCount ?? 0) >= AI_TRACE.MAX_ROWS) {
      setStatus('CAPPED');
      return;
    }
    const nextMeta = meta ? updateMeta(meta, chunk) : makeMeta(slotId, chunk, state);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      store.put(chunk);
      store.put(nextMeta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    traceMetaCache.set(slotId, nextMeta);
    setStatus(nextMeta.capped ? 'CAPPED' : 'OK');
  } catch (error) {
    if (isQuotaError(error)) setStatus('STOPPED_QUOTA');
  }
}

export async function readRun(slotId: string): Promise<{ meta: AiTraceMeta | null; chunks: AiTraceChunk[] }> {
  if (!idbAvailable()) return { meta: null, chunks: [] };
  try {
    const [meta, chunks] = await Promise.all([readMeta(slotId), scanChunks(slotId)]);
    return { meta, chunks };
  } catch {
    return { meta: null, chunks: [] };
  }
}

export async function readMeta(slotId: string): Promise<AiTraceMeta | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openSaveDb();
    const meta = await new Promise<AiTraceMeta | null>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readonly');
      const req = tx.objectStore(SAVE.STORE_TRACE).get(metaKey(slotId));
      req.onsuccess = () => resolve((req.result as AiTraceMeta | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    traceMetaCache.set(slotId, meta);
    if (meta?.capped || (meta?.rowCount ?? 0) >= AI_TRACE.MAX_ROWS) setStatus('CAPPED');
    return meta;
  } catch {
    return null;
  }
}

export async function deleteRun(slotId: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openSaveDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      const req = store.openKeyCursor(traceRange(slotId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    traceMetaCache.delete(slotId);
    setStatus('OK');
  } catch {
    // ignore
  }
}

export async function deleteTurnsAfter(slotId: string, turn: number): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openSaveDb();
    const lower = `${slotId}:${String(turn + 1).padStart(6, '0')}`;
    const upper = `${slotId}:\uffff`;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      const req = store.openKeyCursor(IDBKeyRange.bound(lower, upper));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const meta = await rebuildMeta(slotId);
    if (meta?.capped || (meta?.rowCount ?? 0) >= AI_TRACE.MAX_ROWS) setStatus('CAPPED');
    else setStatus('OK');
  } catch {
    // ignore
  }
}

export function getTraceStatus(): TraceStatus {
  return useAiTraceStatusStore.getState().status;
}

export { SAVE_VERSION };
