/**
 * Music system for Volcanae.
 *
 * Tracks a shuffled playlist so every track is heard once before any track
 * repeats.  When the current queue is exhausted a new shuffled queue is built
 * (re-shuffle on empty, never immediately repeating the last song).
 */

/** All music tracks served from public/music/.  Add new filenames here. */
export const MUSIC_TRACKS: readonly string[] = [
  'Game Track 1 - The Rising Front.mp3',
  'Game Track 2 - The Road Reveals.mp3',
  'Game Track 3 - Parchment Accord.mp3',
  'Game Track 4 - Defiant Frontier.mp3',
] as const;

/** Dedicated menu theme. Served from public/music/. Not shuffled into the game playlist. */
export const MENU_TRACK = 'Menu Theme - Dreams of Tomorrow.mp3';

/**
 * Produce a Fisher-Yates shuffle of the given array.
 * If `avoidFirst` is supplied the resulting shuffle will not start with that
 * value (when there are ≥2 items).
 */
function shuffle<T>(arr: readonly T[], avoidFirst?: T): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (avoidFirst !== undefined && result.length > 1 && result[0] === avoidFirst) {
    // Swap the first element with a random element that is not the first
    const swapIdx = Math.floor(Math.random() * (result.length - 1)) + 1;
    [result[0], result[swapIdx]] = [result[swapIdx], result[0]];
  }
  return result;
}

export class MusicQueue {
  private queue: string[] = [];
  private lastPlayed: string | undefined = undefined;

  /** Return the next track to play, refilling and reshuffling as needed. */
  next(): string {
    if (this.queue.length === 0) {
      this.queue = shuffle(MUSIC_TRACKS, this.lastPlayed);
    }
    const track = this.queue.shift();
    if (!track) throw new Error('Music queue unexpectedly empty after refill');
    this.lastPlayed = track;
    return track;
  }
}
