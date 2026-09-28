import { create } from 'zustand';
import { AI_TRACE, MAP, SAVE } from './gameConfig';
import { getSlotMeta, idbAvailable, openSaveDb } from './saveSystem';
import {
  createEmptyTraceMeta,
  getTraceMetaKey,
  type AiTraceChunk,
  type AiTraceMeta,
  type AiTraceIndexSeed,
} from './aiTrace';

export type AiTraceStatus = 'OK' | 'STOPPED_QUOTA' | 'CAPPED';

interface AiTraceStatusState {
  status: AiTraceStatus;
}

export const useAiTraceStatusStore = create<AiTraceStatusState>()(() => ({
  status: 'OK',
}));

const metaCache = new Map<string, AiTraceMeta>();

function setStatus(status: AiTraceStatus): void {
  useAiTraceStatusStore.setState({ status });
}

function estimateChunkBytes(chunk: AiTraceChunk): number {
  try {
    return JSON.stringify(chunk).length;
  } catch {
    return 0;
  }
}

function cloneMeta(meta: AiTraceMeta): AiTraceMeta {
  return {
    ...meta,
    unitIds: { ...meta.unitIds },
    buildingIds: { ...meta.buildingIds },
    buildingTypes: { ...meta.buildingTypes },
  };
}

function applyChunkToMeta(base: AiTraceMeta, chunk: AiTraceChunk): AiTraceMeta {
  const next = cloneMeta(base);
  next.firstTurn = next.firstTurn === -1 ? chunk.turn : Math.min(next.firstTurn, chunk.turn);
  next.lastTurn = Math.max(next.lastTurn, chunk.turn);
  next.rowCount += chunk.rows.length;
  next.byteEstimate += estimateChunkBytes(chunk);

  for (const row of chunk.units) {
    next.unitIds[row[1]] = row[0];
    if (row[0] >= next.nextUnitIndex) {
      next.nextUnitIndex = row[0] + 1;
    }
  }

  for (const [index, id, type] of chunk.buildings) {
    next.buildingIds[id] = index;
    next.buildingTypes[id] = type;
    if (index >= next.nextBuildingIndex) {
      next.nextBuildingIndex = index + 1;
    }
  }

  next.capped = next.rowCount >= AI_TRACE.MAX_ROWS;
  return next;
}

function rebuildMeta(slotId: string, priorMeta: AiTraceMeta | null, chunks: AiTraceChunk[]): AiTraceMeta | null {
  if (chunks.length === 0) return null;
  const base = priorMeta ? cloneMeta(priorMeta) : createEmptyTraceMeta(slotId);
  base.slotId = slotId;
  base.key = getTraceMetaKey(slotId);
  base.rowCount = 0;
  base.byteEstimate = 0;
  base.firstTurn = -1;
  base.lastTurn = -1;
  base.capped = false;
  base.nextUnitIndex = 0;
  base.nextBuildingIndex = 0;
  base.unitIds = {};
  base.buildingIds = {};
  base.buildingTypes = {};

  for (const chunk of chunks) {
    const merged = applyChunkToMeta(base, chunk);
    base.firstTurn = merged.firstTurn;
    base.lastTurn = merged.lastTurn;
    base.rowCount = merged.rowCount;
    base.byteEstimate = merged.byteEstimate;
    base.capped = merged.capped;
    base.nextUnitIndex = merged.nextUnitIndex;
    base.nextBuildingIndex = merged.nextBuildingIndex;
    base.unitIds = merged.unitIds;
    base.buildingIds = merged.buildingIds;
    base.buildingTypes = merged.buildingTypes;
  }

  return base;
}

async function loadMetaRecord(slotId: string): Promise<AiTraceMeta | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openSaveDb();
    return await new Promise<AiTraceMeta | null>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readonly');
      const req = tx.objectStore(SAVE.STORE_TRACE).get(getTraceMetaKey(slotId));
      req.onsuccess = () => resolve((req.result as AiTraceMeta | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export function getTraceStatus(): AiTraceStatus {
  return useAiTraceStatusStore.getState().status;
}

export function getTraceIndexSeed(slotId: string): (AiTraceIndexSeed & { buildingTypes: Record<string, string> }) | null {
  const meta = metaCache.get(slotId);
  if (!meta) return null;
  return {
    nextUnitIndex: meta.nextUnitIndex,
    nextBuildingIndex: meta.nextBuildingIndex,
    unitIds: { ...meta.unitIds },
    buildingIds: { ...meta.buildingIds },
    buildingTypes: { ...meta.buildingTypes },
  };
}

export async function appendChunk(slotId: string, chunk: AiTraceChunk): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const cachedMeta = metaCache.get(slotId);
    const existingMeta = cachedMeta ?? await loadMetaRecord(slotId);
    if (existingMeta?.capped || existingMeta?.rowCount === AI_TRACE.MAX_ROWS) {
      metaCache.set(slotId, cloneMeta(existingMeta));
      setStatus('CAPPED');
      return;
    }
    if ((existingMeta?.rowCount ?? 0) + chunk.rows.length > AI_TRACE.MAX_ROWS) {
      const cappedMeta = existingMeta ? { ...cloneMeta(existingMeta), capped: true } : null;
      if (cappedMeta) {
        metaCache.set(slotId, cappedMeta);
      }
      setStatus('CAPPED');
      return;
    }

    const slotMeta = await getSlotMeta(slotId);
    const db = await openSaveDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      const getReq = store.get(getTraceMetaKey(slotId));
      getReq.onsuccess = () => {
        const base = (getReq.result as AiTraceMeta | undefined) ?? existingMeta ?? createEmptyTraceMeta(slotId);
        base.difficulty = base.difficulty || slotMeta?.difficulty || '';
        base.gridWidth = base.gridWidth || MAP.GRID_WIDTH;
        base.gridHeight = base.gridHeight || MAP.GRID_HEIGHT;
        base.schemaVersion = AI_TRACE.SCHEMA_VERSION;
        base.gameVersion = __APP_VERSION__;
        const nextMeta = applyChunkToMeta(base, chunk);
        store.put(chunk);
        store.put(nextMeta);
        metaCache.set(slotId, cloneMeta(nextMeta));
        setStatus(nextMeta.capped ? 'CAPPED' : 'OK');
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    setStatus('STOPPED_QUOTA');
  }
}

export async function readRun(slotId: string): Promise<{ meta: AiTraceMeta | null; chunks: AiTraceChunk[] }> {
  if (!idbAvailable()) return { meta: null, chunks: [] };
  try {
    const db = await openSaveDb();
    return await new Promise<{ meta: AiTraceMeta | null; chunks: AiTraceChunk[] }>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readonly');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      const range = IDBKeyRange.bound(`${slotId}:`, `${slotId}:\uffff`);
      const chunks: AiTraceChunk[] = [];
      let meta: AiTraceMeta | null = null;
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (cursor.key === getTraceMetaKey(slotId)) {
          meta = (cursor.value as AiTraceMeta) ?? null;
        } else {
          chunks.push(cursor.value as AiTraceChunk);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => {
        chunks.sort((a, b) => a.turn - b.turn);
        if (meta) {
          metaCache.set(slotId, cloneMeta(meta));
          setStatus(meta.capped ? 'CAPPED' : 'OK');
        } else {
          metaCache.delete(slotId);
          setStatus('OK');
        }
        resolve({ meta, chunks });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { meta: null, chunks: [] };
  }
}

export async function readMeta(slotId: string): Promise<AiTraceMeta | null> {
  const meta = await loadMetaRecord(slotId);
  if (meta) {
    metaCache.set(slotId, cloneMeta(meta));
    setStatus(meta.capped ? 'CAPPED' : 'OK');
  } else {
    metaCache.delete(slotId);
    setStatus('OK');
  }
  return meta;
}

export async function deleteRun(slotId: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openSaveDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      const range = IDBKeyRange.bound(`${slotId}:`, `${slotId}:\uffff`);
      const req = store.openKeyCursor(range);
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
    metaCache.delete(slotId);
    setStatus('OK');
  } catch {
    // ignore
  }
}

export async function deleteTurnsAfter(slotId: string, turn: number): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const { meta, chunks } = await readRun(slotId);
    if (!meta && chunks.length === 0) return;
    const keptChunks = chunks.filter((chunk) => chunk.turn <= turn);
    const rebuiltMeta = rebuildMeta(slotId, meta, keptChunks);
    const db = await openSaveDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE.STORE_TRACE, 'readwrite');
      const store = tx.objectStore(SAVE.STORE_TRACE);
      const range = IDBKeyRange.bound(`${slotId}:`, `${slotId}:\uffff`);
      const req = store.openKeyCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          if (rebuiltMeta) {
            store.put(rebuiltMeta);
          }
          return;
        }
        const key = String(cursor.primaryKey);
        if (key === getTraceMetaKey(slotId)) {
          store.delete(cursor.primaryKey);
        } else {
          const turnText = key.slice(slotId.length + 1);
          if (parseInt(turnText, 10) > turn) {
            store.delete(cursor.primaryKey);
          }
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (rebuiltMeta) {
      metaCache.set(slotId, cloneMeta(rebuiltMeta));
      setStatus(rebuiltMeta.capped ? 'CAPPED' : 'OK');
    } else {
      metaCache.delete(slotId);
      setStatus('OK');
    }
  } catch {
    // ignore
  }
}
