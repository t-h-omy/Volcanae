/**
 * useMusicPlayer – plays background music while the game is active.
 *
 * - Starts playback when the game phase is PLAYER_TURN, ENEMY_TURN, or
 *   LAVA_PHASE (i.e. any actively-running-or-paused game state).
 * - Stops playback on GAME_OVER or VICTORY.
 * - Picks tracks via MusicQueue (shuffled, every song once before repeating).
 */

import { useEffect } from 'react';
import { useGameStore } from './gameStore';
import { useSoundOptionsStore } from './soundOptionsStore';
import { GamePhase } from './types';
import { MusicQueue } from './musicSystem';

const ACTIVE_PHASES = new Set<string>([
  GamePhase.PLAYER_TURN,
  GamePhase.ENEMY_TURN,
  GamePhase.LAVA_PHASE,
]);

// Module-level singletons – one Audio element for the lifetime of the app.
const audio = new Audio();

// Apply persisted sound options immediately on module load.
{
  const { volume, muted } = useSoundOptionsStore.getState();
  audio.volume = muted ? 0 : volume;
}
const musicQueue = new MusicQueue();

// Tracks the pending resume handler so it can be deregistered when no longer
// needed (e.g. phase goes inactive, or a new track is loaded).
let pendingResumeHandler: (() => void) | null = null;

function clearPendingResumeHandler() {
  if (pendingResumeHandler) {
    window.removeEventListener('pointerdown', pendingResumeHandler);
    window.removeEventListener('keydown', pendingResumeHandler);
    pendingResumeHandler = null;
  }
}

function loadNextTrack() {
  clearPendingResumeHandler();
  const track = musicQueue.next();
  audio.src = `${import.meta.env.BASE_URL}music/${encodeURIComponent(track)}`;
  audio.load();
  audio.play().catch(() => {
    // Autoplay may be blocked until the user first interacts with the page.
    // Register interaction handlers to kick off playback then.  Both are
    // removed when either fires to avoid orphaned listeners.
    const resume = () => {
      pendingResumeHandler = null;
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      audio.play().catch(() => undefined);
    };
    pendingResumeHandler = resume;
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  });
}

export function useMusicPlayer(): void {
  const phase = useGameStore((s) => s.phase);
  const volume = useSoundOptionsStore((s) => s.volume);
  const muted = useSoundOptionsStore((s) => s.muted);

  // Sync volume/muted changes to the audio element immediately.
  useEffect(() => {
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const isActive = phase !== null && ACTIVE_PHASES.has(phase);

    if (!isActive) {
      // Stop playback on game-over / victory / not started yet.
      audio.pause();
      audio.src = '';
      clearPendingResumeHandler();
      return;
    }

    // Always (re-)register the ended handler so it survives phase transitions
    // between active states (React cleans up the previous handler on re-run).
    const handleEnded = () => loadNextTrack();
    audio.addEventListener('ended', handleEnded);

    // Only start a new track if nothing is currently playing and there is no
    // pending autoplay-blocked play waiting for user interaction.  Without
    // this guard, each active-phase transition (PLAYER_TURN → ENEMY_TURN →
    // LAVA_PHASE …) would call loadNextTrack() again while audio.paused is
    // still true, accumulating stale resume handlers and skipping queue tracks.
    if (!pendingResumeHandler && (audio.paused || audio.src === '')) {
      loadNextTrack();
    }

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [phase]);
}
