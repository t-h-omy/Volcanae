/**
 * Menu store for Volcanae.
 * Tracks which screen (MENU / GAME) and which menu panel is active.
 * Not persisted into save state.
 */

import { create } from 'zustand';

export type MenuScreen = 'MENU' | 'GAME';
export type MenuPanel = 'ROOT' | 'NEW' | 'LOAD' | 'OPTIONS';
export type NavDir = 'forward' | 'back';

interface MenuState {
  screen: MenuScreen;
  panel: MenuPanel;
  navDir: NavDir;
  /** The IDB slot id that the currently running game autosaves into. */
  activeSaveId: string | null;
}

interface MenuActions {
  /** Navigate to a panel with an animation direction. */
  goPanel: (panel: MenuPanel, dir: NavDir) => void;
  /** Enter the game screen and set the active save slot id. */
  enterGame: (activeSaveId: string) => void;
  /** Return to the main menu. */
  toMenu: () => void;
}

type MenuStore = MenuState & MenuActions;

export const useMenuStore = create<MenuStore>()((set) => ({
  screen: 'MENU',
  panel: 'ROOT',
  navDir: 'forward',
  activeSaveId: null,

  goPanel: (panel, dir) => set({ panel, navDir: dir }),

  enterGame: (activeSaveId) =>
    set({ activeSaveId, screen: 'GAME', panel: 'ROOT', navDir: 'forward' }),

  toMenu: () =>
    set({ screen: 'MENU', panel: 'ROOT', navDir: 'back' }),
}));
