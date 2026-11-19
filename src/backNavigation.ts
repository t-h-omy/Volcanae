import { INPUT } from '../config/input';

export type BackHandler = (() => void) | null;

export interface BackHistoryAdapter {
  pushGuard(): void;
  back(): void;
  isGuardActive(): boolean;
  listen(onPop: () => void): () => void;
  schedule(task: () => void): void;
}

export const BACK_PRIORITY = {
  MAIN_MENU: 200,
  END_GAME: 200,
  GAME_MENU: 150,
  ZONE_POPUP: 260,
  CAVE_POPUP: 260,
  CAVE_MONSTER_MODAL: 261,
  GAME_INTRO: 300,
  HUD_MODAL: 300,
  MARKET_PANEL: 300,
  TECH_TREE: 400,
  HINT_BANNER: 551,
  INFO_POPUP: 9999,
  DEV_OVERLAY: 10000,
  SPECIALIST_PICKER: 10001,
} as const;

type BackEntry = {
  id: number;
  handlerRef: { current: BackHandler };
  priority: number;
};

const entries: BackEntry[] = [];
let guardActive = false;
let pendingReleasePops = 0;
let syncScheduled = false;
let unlisten: (() => void) | null = null;
let nextId = 1;
let adapter: BackHistoryAdapter | null = null;

function handlePop(): void {
  const historyAdapter = ensureAdapter();
  if (!historyAdapter) return;
  const wasGuardActive = guardActive;
  guardActive = historyAdapter.isGuardActive();

  if (pendingReleasePops > 0) {
    pendingReleasePops -= 1;
    scheduleSync();
    return;
  }
  if (guardActive || !wasGuardActive) return;

  const topEntry = entries.reduce<BackEntry | undefined>(
    (top, entry) => !top || entry.priority >= top.priority ? entry : top,
    undefined,
  );
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
      isGuardActive() {
        const state = window.history.state;
        return typeof state === 'object' && state !== null &&
          state[INPUT.BACK_GUARD_STATE_KEY] === true;
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

  guardActive = historyAdapter.isGuardActive();
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

export function registerBackEntry(handlerRef: { current: BackHandler }, priority: number): number {
  const id = nextId++;
  entries.push({ id, handlerRef, priority });
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
