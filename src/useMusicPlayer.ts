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
import { GamePhase } from './types';
import { MusicQueue } from './musicSystem';

const ACTIVE_PHASES = new Set<string>([
  GamePhase.PLAYER_TURN,
  GamePhase.ENEMY_TURN,
  GamePhase.LAVA_PHASE,
]);

// Module-level singletons – one Audio element for the lifetime of the app.
const audio = new Audio();
audio.volume = 0.5;
const musicQueue = new MusicQueue();

function loadNextTrack() {
  const track = musicQueue.next();
  audio.src = `/music/${encodeURIComponent(track)}`;
  audio.load();
  audio.play().catch(() => {
    // Autoplay may be blocked until the user first interacts with the page.
    // Register one-time interaction handlers to kick off playback then.
    const resume = () => {
      audio.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  });
}

export function useMusicPlayer(): void {
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    const isActive = phase !== null && ACTIVE_PHASES.has(phase);

    if (!isActive) {
      // Stop playback on game-over / victory / not started yet.
      audio.pause();
      audio.src = '';
      return;
    }

    // Always (re-)register the ended handler so it survives phase transitions
    // between active states (React cleans up the previous handler on re-run).
    const handleEnded = () => loadNextTrack();
    audio.addEventListener('ended', handleEnded);

    // Only start a new track if nothing is currently playing.
    if (audio.paused || audio.src === '') {
      loadNextTrack();
    }

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [phase]);
}
