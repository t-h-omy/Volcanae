import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { ANIMATION } from '../config/animation';
import { GraphicsQuality, GridLineMode, type GraphicsQuality as GraphicsQualityType, type GridLineMode as GridLineModeType } from './types';

const STORAGE_KEY = 'volcanae_graphics_options';

interface GraphicsOptionsState {
  quality: GraphicsQualityType;
  reduceMotion: boolean | null;
  gridLines: GridLineModeType;
  setQuality: (value: GraphicsQualityType) => void;
  setReduceMotion: (value: boolean | null) => void;
  setGridLines: (value: GridLineModeType) => void;
}

interface StoredGraphicsOptions {
  quality: GraphicsQualityType;
  reduceMotion: boolean | null;
  gridLines: GridLineModeType;
}

const DEFAULT_OPTIONS: StoredGraphicsOptions = {
  quality: GraphicsQuality.HIGH,
  reduceMotion: null,
  gridLines: GridLineMode.FINE,
};

function isGraphicsQuality(value: unknown): value is GraphicsQualityType {
  return value === GraphicsQuality.HIGH || value === GraphicsQuality.SAVER || value === GraphicsQuality.BASIC;
}

function isGridLineMode(value: unknown): value is GridLineModeType {
  return value === GridLineMode.OFF || value === GridLineMode.FINE || value === GridLineMode.BOLD;
}

function loadFromStorage(): StoredGraphicsOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<keyof StoredGraphicsOptions, unknown>>;
      return {
        quality: isGraphicsQuality(parsed.quality) ? parsed.quality : DEFAULT_OPTIONS.quality,
        reduceMotion: typeof parsed.reduceMotion === 'boolean' || parsed.reduceMotion === null
          ? parsed.reduceMotion
          : DEFAULT_OPTIONS.reduceMotion,
        gridLines: isGridLineMode(parsed.gridLines) ? parsed.gridLines : DEFAULT_OPTIONS.gridLines,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_OPTIONS };
}

function saveToStorage(options: StoredGraphicsOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // ignore
  }
}

const initial = loadFromStorage();

export const useGraphicsOptionsStore = create<GraphicsOptionsState>()((set) => ({
  ...initial,
  setQuality: (quality) => set((state) => {
    const options = { quality, reduceMotion: state.reduceMotion, gridLines: state.gridLines };
    saveToStorage(options);
    return { quality };
  }),
  setReduceMotion: (reduceMotion) => set((state) => {
    const options = { quality: state.quality, reduceMotion, gridLines: state.gridLines };
    saveToStorage(options);
    return { reduceMotion };
  }),
  setGridLines: (gridLines) => set((state) => {
    const options = { quality: state.quality, reduceMotion: state.reduceMotion, gridLines };
    saveToStorage(options);
    return { gridLines };
  }),
}));

export function getSystemReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(ANIMATION.REDUCED_MOTION_MEDIA_QUERY).matches;
}

export function isReducedMotion(): boolean {
  return useGraphicsOptionsStore.getState().reduceMotion ?? getSystemReducedMotion();
}

export function useReducedMotion(): boolean {
  const reduceMotion = useGraphicsOptionsStore((state) => state.reduceMotion);
  const [systemReducedMotion, setSystemReducedMotion] = useState(getSystemReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(ANIMATION.REDUCED_MOTION_MEDIA_QUERY);
    const update = () => setSystemReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return reduceMotion ?? systemReducedMotion;
}

export function useReduceMotionClass(): void {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);
}
