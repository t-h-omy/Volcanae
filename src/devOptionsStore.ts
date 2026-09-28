/**
 * Dev options store for Volcanae.
 * Holds toggleable developer/debug options that are available via the burger menu.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'volcanae_dev_options';

interface DevOptionsState {
  showAiScores: boolean;
  setShowAiScores: (value: boolean) => void;
  showRecruitingScores: boolean;
  setShowRecruitingScores: (value: boolean) => void;
  recordAiTrace: boolean;
  setRecordAiTrace: (value: boolean) => void;
}

function loadFromStorage(): Pick<DevOptionsState, 'showAiScores' | 'showRecruitingScores' | 'recordAiTrace'> {
  if (typeof localStorage === 'undefined') {
    return {
      showAiScores: false,
      showRecruitingScores: false,
      recordAiTrace: false,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Pick<DevOptionsState, 'showAiScores' | 'showRecruitingScores' | 'recordAiTrace'>>;
      return {
        showAiScores: typeof parsed.showAiScores === 'boolean' ? parsed.showAiScores : false,
        showRecruitingScores: typeof parsed.showRecruitingScores === 'boolean' ? parsed.showRecruitingScores : false,
        recordAiTrace: typeof parsed.recordAiTrace === 'boolean' ? parsed.recordAiTrace : false,
      };
    }
  } catch {
    // ignore
  }
  return {
    showAiScores: false,
    showRecruitingScores: false,
    recordAiTrace: false,
  };
}

function saveToStorage(showAiScores: boolean, showRecruitingScores: boolean, recordAiTrace: boolean) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showAiScores, showRecruitingScores, recordAiTrace }));
  } catch {
    // ignore
  }
}

const initial = loadFromStorage();

export const useDevOptionsStore = create<DevOptionsState>()((set) => ({
  showAiScores: initial.showAiScores,
  setShowAiScores: (value) => set((state) => {
    saveToStorage(value, state.showRecruitingScores, state.recordAiTrace);
    return { showAiScores: value };
  }),
  showRecruitingScores: initial.showRecruitingScores,
  setShowRecruitingScores: (value) => set((state) => {
    saveToStorage(state.showAiScores, value, state.recordAiTrace);
    return { showRecruitingScores: value };
  }),
  recordAiTrace: initial.recordAiTrace,
  setRecordAiTrace: (value) => set((state) => {
    saveToStorage(state.showAiScores, state.showRecruitingScores, value);
    return { recordAiTrace: value };
  }),
}));
