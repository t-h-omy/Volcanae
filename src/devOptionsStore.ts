/**
 * Dev options store for Volcanae.
 * Holds toggleable developer/debug options that are available via the burger menu.
 */

import { create } from 'zustand';

interface DevOptionsState {
  showAiScores: boolean;
  setShowAiScores: (value: boolean) => void;
  showRecruitingScores: boolean;
  setShowRecruitingScores: (value: boolean) => void;
}

export const useDevOptionsStore = create<DevOptionsState>()((set) => ({
  showAiScores: false,
  setShowAiScores: (value) => set({ showAiScores: value }),
  showRecruitingScores: false,
  setShowRecruitingScores: (value) => set({ showRecruitingScores: value }),
}));
