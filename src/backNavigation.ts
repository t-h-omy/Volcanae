import { INPUT } from '../config/input';

export type BackHandler = (() => void) | null;

export interface BackHistoryAdapter {
  pushGuard(): void;
  back(): void;
  listen(onPop: () => void): () => void;
  schedule(task: () => void): void;
}

type BackEntry = {
  id: number;
  handlerRef: { current: BackHandler };
};

const entries: BackEntry[] = [];
let guardActive = false;
let pendingReleasePops = 0;
let syncScheduled = false;
let unlisten: (() => void) | null = null;
let nextId = 1;
let adapter: BackHistoryAdapter | null = null;

function handlePop(): void {
  if (pendingReleasePops > 0) {
    pendingReleasePops -= 1;
    scheduleSync();
    return;
  }
  if (!guardActive) return;

  guardActive = false;
  const topEntry = entries[entries.length - 1];
  if (topEntry?.handlerRef.current) topEntry.handlerRef.current();
  scheduleSync();
}

function ensureAdapter(): BackHistoryAdapter | null {
  if (!adapter) {
    if (typeof window === 'undefined') return null;
    adapter = {
      pushGuard() {
        window.history.pushState({ [INPUT.BACK_GUARD_STATE_KEY]: true }, '');
      },
      back() {
        window.history.back();
      },
      listen(onPop) {
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
      },
      schedule(task) {
        window.setTimeout(task, INPUT.BACK_GUARD_SYNC_DELAY_MS);
      },
    };
  }
  if (!unlisten) unlisten = adapter.listen(handlePop);
  return adapter;
}

function sync(): void {
  syncScheduled = false;
  if (pendingReleasePops > 0) return;

  const historyAdapter = ensureAdapter();
  if (!historyAdapter) return;

  if (entries.length > 0 && !guardActive) {
    historyAdapter.pushGuard();
    guardActive = true;
  } else if (entries.length === 0 && guardActive) {
    guardActive = false;
    pendingReleasePops += 1;
    historyAdapter.back();
  }
}

function scheduleSync(): void {
  if (syncScheduled) return;
  const historyAdapter = ensureAdapter();
  if (!historyAdapter) return;
  syncScheduled = true;
  historyAdapter.schedule(sync);
}

export function registerBackEntry(handlerRef: { current: BackHandler }): number {
  const id = nextId++;
  entries.push({ id, handlerRef });
  scheduleSync();
  return id;
}

export function unregisterBackEntry(id: number): void {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  entries.splice(index, 1);
  scheduleSync();
}

export function getBackNavigationState(): {
  depth: number;
  guardActive: boolean;
  pendingReleasePops: number;
} {
  return { depth: entries.length, guardActive, pendingReleasePops };
}

export function __resetBackNavigationForTests(testAdapter: BackHistoryAdapter | null): void {
  unlisten?.();
  entries.length = 0;
  guardActive = false;
  pendingReleasePops = 0;
  syncScheduled = false;
  unlisten = null;
  nextId = 1;
  adapter = testAdapter;
}
