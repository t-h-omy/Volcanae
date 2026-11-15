import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import MAIN_MENU_TSX from '../components/MainMenu.tsx?raw';
import {
  __resetBackNavigationForTests,
  getBackNavigationState,
  registerBackEntry,
  unregisterBackEntry,
  type BackHandler,
  type BackHistoryAdapter,
} from '../backNavigation';

function createFakeAdapter() {
  const tasks: Array<() => void> = [];
  let onPop: (() => void) | null = null;
  const calls = { pushGuard: 0, back: 0 };

  const adapter: BackHistoryAdapter = {
    pushGuard: () => { calls.pushGuard += 1; },
    back: () => { calls.back += 1; },
    listen: (listener) => {
      onPop = listener;
      return () => { onPop = null; };
    },
    schedule: (task) => { tasks.push(task); },
  };

  return {
    adapter,
    calls,
    flush() {
      while (tasks.length > 0) tasks.shift()?.();
    },
    pop() {
      if (!onPop) throw new Error('Back pop listener is not registered');
      onPop();
    },
  };
}

describe('back navigation history guard', () => {
  let fake: ReturnType<typeof createFakeAdapter>;

  beforeEach(() => {
    fake = createFakeAdapter();
    __resetBackNavigationForTests(fake.adapter);
  });

  afterEach(() => {
    __resetBackNavigationForTests(null);
  });

  it('pushes a guard after an entry is registered', () => {
    registerBackEntry({ current: () => {} });

    fake.flush();

    expect(fake.calls.pushGuard).toBe(1);
    expect(getBackNavigationState()).toMatchObject({ depth: 1, guardActive: true });
  });

  it('dispatches a pop to only the topmost entry', () => {
    const calls: string[] = [];
    registerBackEntry({ current: () => calls.push('bottom') });
    registerBackEntry({ current: () => calls.push('top') });
    fake.flush();

    fake.pop();
    fake.flush();

    expect(calls).toEqual(['top']);
  });

  it('does not touch history when registration is canceled before syncing', () => {
    const id = registerBackEntry({ current: () => {} });
    unregisterBackEntry(id);

    fake.flush();

    expect(fake.calls).toEqual({ pushGuard: 0, back: 0 });
  });

  it('releases the guard and consumes its own release pop', () => {
    const calls: string[] = [];
    const id = registerBackEntry({ current: () => calls.push('handler') });
    fake.flush();

    unregisterBackEntry(id);
    fake.flush();
    expect(fake.calls.back).toBe(1);
    expect(getBackNavigationState().pendingReleasePops).toBe(1);

    fake.pop();

    expect(calls).toEqual([]);
    expect(getBackNavigationState().pendingReleasePops).toBe(0);
    fake.flush();
    expect(fake.calls.pushGuard).toBe(1);
  });

  it('consumes a pop from a blocking entry and restores the guard', () => {
    registerBackEntry({ current: null });
    fake.flush();

    fake.pop();
    fake.flush();

    expect(fake.calls.pushGuard).toBe(2);
    expect(getBackNavigationState().guardActive).toBe(true);
  });

  it('restores the guard when the top handler unregisters itself', () => {
    let topId = 0;
    const bottomHandler: { current: BackHandler } = { current: () => {} };
    registerBackEntry(bottomHandler);
    topId = registerBackEntry({ current: () => unregisterBackEntry(topId) });
    fake.flush();

    fake.pop();
    fake.flush();

    expect(getBackNavigationState()).toMatchObject({ depth: 1, guardActive: true });
    expect(fake.calls.pushGuard).toBe(2);
  });

  it('waits for a release pop before restoring a newly needed guard', () => {
    const id = registerBackEntry({ current: () => {} });
    fake.flush();
    unregisterBackEntry(id);
    fake.flush();

    registerBackEntry({ current: () => {} });
    fake.flush();
    expect(fake.calls.pushGuard).toBe(1);

    fake.pop();
    fake.flush();

    expect(fake.calls.pushGuard).toBe(2);
    expect(getBackNavigationState().pendingReleasePops).toBe(0);
  });

  it('ignores a pop when no guard is active', () => {
    const calls: string[] = [];
    registerBackEntry({ current: () => calls.push('handler') });

    fake.pop();

    expect(calls).toEqual([]);
    expect(getBackNavigationState().guardActive).toBe(false);
    fake.flush();
  });

  it('wires all requested overlays and confines history events to the module', () => {
    const components = [
      'Popup',
      'DevOptionsOverlay',
      'DevStatsOverlay',
      'DevSpecPickerOverlay',
      'DifficultyOverlay',
      'OptionsOverlay',
      'AiScoreModal',
      'RecruitScoreModal',
      'GameMenu',
      'HintBanner',
      'GameIntroPopup',
      'ZoneClearedPopup',
      'CaveScreamsPopup',
      'CaveMonsterKillModal',
      'MarketPanel',
      'GameOverOverlay',
      'VictoryOverlay',
      'TechTreeOverlay',
    ];

    for (const name of components) {
      const start = HUD_TSX.indexOf(`function ${name}(`);
      expect(start, `${name} declaration`).toBeGreaterThanOrEqual(0);
      const nextFunction = HUD_TSX.indexOf('\nfunction ', start + 1);
      const component = HUD_TSX.slice(start, nextFunction === -1 ? undefined : nextFunction);
      expect(component, name).toContain('useBackDismiss(');
    }

    expect(MAIN_MENU_TSX).toContain("goPanel('ROOT', 'back')");
    expect(HUD_TSX).not.toMatch(/pushState|popstate/i);
    expect(MAIN_MENU_TSX).not.toMatch(/pushState|popstate/i);
  });
});
