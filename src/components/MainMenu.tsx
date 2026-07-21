/**
 * MainMenu component for Volcanae.
 * Pre-game screen with Continue / New Game / Load Game / Options panels.
 * Plays a dedicated menu music track.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMenuStore } from '../menuStore';
import { useGameStore } from '../gameStore';
import { useSoundOptionsStore } from '../soundOptionsStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import {
  listSlots,
  slotCount,
  deleteSlot,
  exportSlot,
  importSlotFromFile,
  migrateLegacyIfPresent,
  requestPersist,
  isPersisted,
  estimateUsage,
  idbAvailable,
  isSlotCompatible,
  getNextDefaultSlotName,
} from '../saveSystem';
import type { SaveSlotMeta } from '../saveSystem';
import { SAVE } from '../gameConfig';
import { Difficulty } from '../types';
import { MENU_TRACK } from '../musicSystem';
import './MainMenu.css';

// ============================================================================
// DIFFICULTY LABELS & DESCRIPTIONS
// ============================================================================

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Easy',
  [Difficulty.STANDARD]: 'Standard',
  [Difficulty.HARD]: 'Hard',
};

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Gentler heat. Reduced enemy pressure and slower lava advancement — good for learning the front.',
  [Difficulty.STANDARD]: 'Balanced heat. Enemy pressure and lava advancement as designed — the intended way to play.',
  [Difficulty.HARD]: 'Relentless heat. Aggressive enemies and quicker lava advancement — every push has to count.',
};

function getBaseAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\/+/, '')}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// SVG ICONS
// All 24×24 viewBox, stroke-based (except play which is fill).
// Use currentColor so CSS controls the tint.
// ============================================================================

function IconPlay() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
    </svg>
  );
}

function IconChevronRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNew() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.5 3.5l6 6M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.9-1.2l-.05.05A2 2 0 1 1 4.19 16.9l.05-.05a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.2-2.9l-.05-.05A2 2 0 1 1 7.1 4.19l.05.05a1.7 1.7 0 0 0 1.9.35H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.35l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.35 1.9V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.5Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"
        stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconVolcano() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20l6-15 3 7 2-3 5 11H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.5 4l1 6 4-2-2 5 3 2-5 1 1 4-4-3-4 3 1-4-5-1 3-2-2-5 4 2 1-6 3 0Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function IconXCircle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 6l12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconImport() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20V9m0 0l-4 4m4-4l4 4M5 5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2m-8 0l1 12h8l1-12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// MENU MUSIC HOOK
// ============================================================================

const MENU_MUSIC_BREAK_MS = 10_000;

function useMenuMusic(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const screen = useMenuStore((s) => s.screen);
  const volume = useSoundOptionsStore((s) => s.volume);
  const muted = useSoundOptionsStore((s) => s.muted);
  const pendingRef = useRef<(() => void) | null>(null);
  const breakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // Sync volume/muted.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Start/stop based on screen.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function clearBreakTimer() {
      if (breakTimerRef.current !== null) {
        clearTimeout(breakTimerRef.current);
        breakTimerRef.current = null;
      }
    }

    function clearPending() {
      if (pendingRef.current) {
        window.removeEventListener('pointerdown', pendingRef.current);
        window.removeEventListener('keydown', pendingRef.current);
        pendingRef.current = null;
      }
    }

    function playTrack(el: HTMLAudioElement) {
      el.currentTime = 0;
      el.play().catch(() => {
        // Autoplay blocked — wait for user interaction.
        const resume = () => {
          pendingRef.current = null;
          window.removeEventListener('pointerdown', resume);
          window.removeEventListener('keydown', resume);
          el.play().catch(() => undefined);
        };
        pendingRef.current = resume;
        window.addEventListener('pointerdown', resume);
        window.addEventListener('keydown', resume);
      });
    }

    if (screen !== 'MENU') {
      audio.pause();
      audio.src = '';
      clearBreakTimer();
      clearPending();
      return;
    }

    // After each play-through, wait 10 s then replay.
    const handleEnded = () => {
      clearBreakTimer();
      breakTimerRef.current = setTimeout(() => {
        breakTimerRef.current = null;
        playTrack(audio);
      }, MENU_MUSIC_BREAK_MS);
    };
    audio.addEventListener('ended', handleEnded);

    audio.src = `${import.meta.env.BASE_URL}music/${encodeURIComponent(MENU_TRACK)}`;
    audio.volume = muted ? 0 : volume;
    audio.load();
    playTrack(audio);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      clearBreakTimer();
      clearPending();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volume/muted are applied via audio.volume inline; we intentionally re-run only when screen changes to start/stop the track
  }, [screen]);
}

// ============================================================================
// ROOT PANEL
// ============================================================================

function RootPanel({ hasSave, newestSlot }: { hasSave: boolean; newestSlot: SaveSlotMeta | null }) {
  const goPanel = useMenuStore((s) => s.goPanel);
  const continueGame = useGameStore((s) => s.continueGame);
  const logoSrc = getBaseAssetUrl('assets/game_logo_transparent_1024px.png');

  const continueSubtitle = newestSlot
    ? `TURN ${newestSlot.turn} · ${newestSlot.name.toUpperCase()}`
    : 'RESUME GAME';

  return (
    <>
      <div className="mm-logo-wrap">
        <img
          className="mm-logo"
          src={logoSrc}
          alt="Volcanae"
        />
      </div>

      <div className="mm-rail">
        {hasSave && (
          <button className="mm-btn-continue" onClick={() => continueGame()}>
            <span className="mm-icon-tile-primary">
              <IconPlay />
            </span>
            <span className="mm-continue-labels">
              <span className="mm-continue-title">Continue</span>
              <span className="mm-continue-subtitle">{continueSubtitle}</span>
            </span>
            <span className="mm-chevron-continue">
              <IconChevronRight size={18} />
            </span>
          </button>
        )}

        <button className="mm-btn-secondary" onClick={() => goPanel('NEW', 'forward')}>
          <span className="mm-icon-tile-secondary">
            <IconNew />
          </span>
          <span className="mm-btn-secondary-label">New Game</span>
          <span className="mm-chevron-secondary">
            <IconChevronRight size={17} />
          </span>
        </button>

        <button className="mm-btn-secondary" onClick={() => goPanel('LOAD', 'forward')}>
          <span className="mm-icon-tile-secondary">
            <IconFolder />
          </span>
          <span className="mm-btn-secondary-label">Load Game</span>
          <span className="mm-chevron-secondary">
            <IconChevronRight size={17} />
          </span>
        </button>

        <button className="mm-btn-secondary" onClick={() => goPanel('OPTIONS', 'forward')}>
          <span className="mm-icon-tile-secondary">
            <IconGear />
          </span>
          <span className="mm-btn-secondary-label">Options</span>
          <span className="mm-chevron-secondary">
            <IconChevronRight size={17} />
          </span>
        </button>

        <div className="mm-version">v{__APP_VERSION__}</div>
      </div>
    </>
  );
}

// ============================================================================
// NEW GAME PANEL
// ============================================================================

function HintsControls({ showReset = false }: { showReset?: boolean }) {
  const hintsEnabled = useHintOptionsStore((s) => s.hintsEnabled);
  const setHintsEnabled = useHintOptionsStore((s) => s.setHintsEnabled);
  const resetShowCounts = useHintOptionsStore((s) => s.resetShowCounts);
  const [resetDone, setResetDone] = useState(false);

  const handleResetHints = useCallback(() => {
    resetShowCounts();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 1500);
  }, [resetShowCounts]);

  return (
    <>
      <div className="mm-hints-row">
        <span className="mm-hints-label">💡 Show hints</span>
        <button
          className={`mm-hints-toggle${hintsEnabled ? ' mm-hints-toggle--on' : ''}`}
          onClick={() => setHintsEnabled(!hintsEnabled)}
          aria-pressed={hintsEnabled}
          aria-label={hintsEnabled ? 'Disable hints' : 'Enable hints'}
        >
          {hintsEnabled ? 'On' : 'Off'}
        </button>
      </div>
      {showReset && (
        <div className="mm-hints-row">
          <span className="mm-hints-label">🔄 Reset hint counters</span>
          <button
            className="mm-hints-reset"
            onClick={handleResetHints}
            aria-label="Reset hint counters"
          >
            {resetDone ? 'Done' : 'Reset'}
          </button>
        </div>
      )}
    </>
  );
}

function NewPanel() {
  const goPanel = useMenuStore((s) => s.goPanel);
  const newGameInSlot = useGameStore((s) => s.newGameInSlot);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.STANDARD);
  const [name, setName] = useState('');
  const [defaultName, setDefaultName] = useState('');
  const [capReached, setCapReached] = useState(false);
  const [starting, setStarting] = useState(false);
  const navDir = useMenuStore((s) => s.navDir);

  // Compute default name on mount.
  useEffect(() => {
    async function computeDefault() {
      const slots = await listSlots();
      const d = getNextDefaultSlotName(slots);
      setDefaultName(d);
      setName(d);
    }
    computeDefault();
  }, []);

  // Check slot cap.
  useEffect(() => {
    slotCount().then((count) => setCapReached(count >= SAVE.SLOT_CAP));
  }, []);

  const handleStart = useCallback(async () => {
    if (starting) return;
    const count = await slotCount();
    if (count >= SAVE.SLOT_CAP) {
      setCapReached(true);
      return;
    }
    const finalName = (name.trim() || defaultName).slice(0, SAVE.NAME_MAX_LENGTH);
    setStarting(true);
    await newGameInSlot(finalName, selectedDifficulty);
    // Best-effort persistent storage after first game start (gesture-bound).
    requestPersist().catch(() => undefined);
  }, [starting, name, defaultName, selectedDifficulty, newGameInSlot]);

  return (
    <div className="mm-panel" data-dir={navDir}>
      <div className="mm-panel-inner">
        <div className="mm-panel-header">
          <button className="mm-back-btn" onClick={() => goPanel('ROOT', 'back')} aria-label="Back">
            <IconChevronLeft size={20} />
          </button>
          <span className="mm-panel-title">New Campaign</span>
        </div>

        <div className="mm-panel-scroll">
          <div>
            <div className="mm-field-label">Campaign name</div>
            <input
              className="mm-name-input"
              type="text"
              value={name}
              maxLength={SAVE.NAME_MAX_LENGTH}
              placeholder={defaultName}
              onFocus={(e) => e.target.select()}
              onBlur={() => { if (!name.trim()) setName(defaultName); }}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <div className="mm-field-label">Difficulty</div>
            <div className="mm-difficulty-segs">
              {([Difficulty.EASY, Difficulty.STANDARD, Difficulty.HARD] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`mm-seg-btn${selectedDifficulty === d ? ' mm-seg-btn--active' : ''}`}
                  onClick={() => setSelectedDifficulty(d)}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
            <div className="mm-diff-card">
              <div className="mm-diff-card-name">{DIFFICULTY_LABEL[selectedDifficulty]}</div>
              <div className="mm-diff-card-desc">{DIFFICULTY_DESC[selectedDifficulty]}</div>
            </div>
          </div>

          <HintsControls />

          <button className="mm-world-gen-stub" disabled>
            <IconGlobe />
            World generation — coming soon
          </button>

          {capReached && (
            <div className="mm-cap-notice">
              Save limit reached ({SAVE.SLOT_CAP}). Delete a save to start a new game.
              <br />
              <button className="mm-cap-notice-go" onClick={() => goPanel('LOAD', 'forward')}>
                <IconFolder /> Go to Load / Delete saves
              </button>
            </div>
          )}
        </div>

        <button
          className="mm-btn-cta"
          onClick={handleStart}
          disabled={capReached || starting || !idbAvailable()}
        >
          <IconPlay />
          {starting ? 'Starting…' : 'Start Campaign'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// LOAD PANEL
// ============================================================================

function LoadPanel() {
  const goPanel = useMenuStore((s) => s.goPanel);
  const loadIntoGame = useGameStore((s) => s.loadIntoGame);
  const navDir = useMenuStore((s) => s.navDir);
  const [slots, setSlots] = useState<SaveSlotMeta[]>([]);
  const [page, setPage] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const all = await listSlots();
    setSlots(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { refresh(); }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const totalPages = Math.ceil(slots.length / SAVE.SLOTS_PER_PAGE);
  const pageSlots = slots.slice(page * SAVE.SLOTS_PER_PAGE, (page + 1) * SAVE.SLOTS_PER_PAGE);
  const showPagination = slots.length > SAVE.SLOTS_PER_PAGE;

  const handleDelete = useCallback(async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    await deleteSlot(id);
    setConfirmDeleteId(null);
    setPage(0);
    refresh();
  }, [confirmDeleteId, refresh]);

  const handleExport = useCallback(async (meta: SaveSlotMeta) => {
    const blob = await exportSlot(meta.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.name}${SAVE.EXPORT_FILE_EXT}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setImportError(null);
    const newMeta = await importSlotFromFile(file);
    if (!newMeta) {
      setImportError('Failed to import: file is invalid or incompatible.');
      return;
    }
    setPage(0);
    refresh();
  }, [refresh]);

  return (
    <div className="mm-panel" data-dir={navDir}>
      <div className="mm-panel-inner">
        <div className="mm-panel-header">
          <button className="mm-back-btn" onClick={() => goPanel('ROOT', 'back')} aria-label="Back">
            <IconChevronLeft size={20} />
          </button>
          <span className="mm-panel-title">Load Game</span>
        </div>

        {!idbAvailable() && (
          <div className="mm-cap-notice" style={{ marginBottom: '12px' }}>
            Save storage is unavailable in this context.
          </div>
        )}

        <div className="mm-load-scroll">
          {loading ? (
            <div className="mm-load-empty">Loading saves…</div>
          ) : slots.length === 0 ? (
            <div className="mm-load-empty">No saves found.</div>
          ) : (
            pageSlots.map((meta, idx) => {
              const compatible = isSlotCompatible(meta);
              const isFirst = page === 0 && idx === 0;
              const rowVariant = !compatible ? 'incompatible' : isFirst ? 'active' : 'normal';
              const iconColorClass = `mm-slot-icon--${rowVariant}`;
              const metaColorClass = `mm-slot-meta--${rowVariant}`;
              const metaLine = `TURN ${meta.turn} · ${DIFFICULTY_LABEL[meta.difficulty].toUpperCase()} · ${formatRelativeTime(meta.savedAt).toUpperCase()}`;

              return (
                <div key={meta.id} className={`mm-slot-row mm-slot-row--${rowVariant}`}>
                  <div className={`mm-slot-icon ${iconColorClass}`}>
                    {!compatible ? <IconXCircle /> : isFirst ? <IconVolcano /> : <IconSparkle />}
                  </div>
                  <div className="mm-slot-info">
                    <div className="mm-slot-name">{meta.name}</div>
                    <div className={`mm-slot-meta ${metaColorClass}`}>
                      {!compatible ? `INCOMPATIBLE (v${meta.version})` : metaLine}
                    </div>
                  </div>
                  <div className="mm-slot-actions">
                    <button
                      className={`mm-load-pill ${!compatible ? 'mm-load-pill--disabled' : isFirst ? 'mm-load-pill--active' : 'mm-load-pill--normal'}`}
                      disabled={!compatible}
                      onClick={() => loadIntoGame(meta.id)}
                    >
                      Load
                    </button>
                    <button
                      className="mm-action-btn mm-action-btn--export"
                      title="Export save"
                      onClick={() => handleExport(meta)}
                    >
                      <IconExport />
                    </button>
                    <button
                      className={confirmDeleteId === meta.id ? 'mm-action-btn mm-action-btn--delete-confirm' : 'mm-action-btn mm-action-btn--delete'}
                      title="Delete save"
                      onClick={() => handleDelete(meta.id)}
                    >
                      {confirmDeleteId === meta.id ? 'Sure?' : <IconTrash />}
                    </button>
                    {confirmDeleteId === meta.id && (
                      <button
                        className="mm-action-btn mm-action-btn--export"
                        title="Cancel delete"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        <IconClose />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {importError && (
          <div className="mm-import-error">{importError}</div>
        )}

        <div className="mm-load-footer">
          <button className="mm-import-pill" onClick={() => fileInputRef.current?.click()}>
            <IconImport /> Import save
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.volcanae.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = '';
            }}
          />
          {showPagination && (
            <div className="mm-pager">
              <button className="mm-pager-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <IconChevronLeft size={15} />
              </button>
              {page + 1} / {totalPages}
              <button className="mm-pager-btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <IconChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// OPTIONS PANEL
// ============================================================================

function OptionsPanel({
  canInstall,
  isInstalled,
  promptInstall,
}: {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => void;
}) {
  const goPanel = useMenuStore((s) => s.goPanel);
  const navDir = useMenuStore((s) => s.navDir);
  const volume = useSoundOptionsStore((s) => s.volume);
  const muted = useSoundOptionsStore((s) => s.muted);
  const setVolume = useSoundOptionsStore((s) => s.setVolume);
  const setMuted = useSoundOptionsStore((s) => s.setMuted);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    isPersisted().then(setPersisted);
    estimateUsage().then(setUsage);
  }, []);

  const pct = Math.round(volume * 100);
  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    if (muted) setMuted(false);
  }, [muted, setMuted, setVolume]);

  return (
    <div className="mm-panel" data-dir={navDir}>
      <div className="mm-panel-inner">
        <div className="mm-panel-header">
          <button className="mm-back-btn" onClick={() => goPanel('ROOT', 'back')} aria-label="Back">
            <IconChevronLeft size={20} />
          </button>
          <span className="mm-panel-title">Options</span>
        </div>

        <div className="mm-options-scroll">
          <div>
            <div className="mm-slider-row-label">
              <span>Music</span>
              <span className="mm-slider-row-pct">{pct}%</span>
            </div>
            <input
              type="range"
              className="mm-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Music volume"
            />
          </div>

          {/* Sound FX shares the same master volume — separate SFX volume can be wired
              once soundOptionsStore exposes a dedicated sfxVolume field. */}
          <div>
            <div className="mm-slider-row-label">
              <span>Sound FX</span>
              <span className="mm-slider-row-pct">{pct}%</span>
            </div>
            <input
              type="range"
              className="mm-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Sound FX volume"
            />
          </div>

          <div className="mm-options-divider" />

          <div>
            <div className="mm-field-label">Hints</div>
            <HintsControls showReset />
          </div>

          <div className="mm-options-divider" />

          <div>
            <div className="mm-field-label">Storage</div>
            <div className="mm-storage-card">
              <span className={`mm-storage-dot ${persisted ? 'mm-storage-dot--active' : 'mm-storage-dot--inactive'}`} />
              <div className="mm-storage-info">
                <div className="mm-storage-status">
                  {persisted === null
                    ? 'Checking…'
                    : persisted
                    ? 'Durable storage active'
                    : 'Storage not persisted'}
                </div>
                {usage && (
                  <div className="mm-storage-usage">
                    {formatBytes(usage.usage)} / {formatBytes(usage.quota)} used
                  </div>
                )}
              </div>
            </div>

            <div className="mm-a2hs-note">
              Installing the app to your home screen improves save durability.
              <br />
              <button
                className="mm-btn-install"
                onClick={promptInstall}
                disabled={isInstalled || !canInstall}
              >
                Install App
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN MENU
// ============================================================================

export default function MainMenu({
  canInstall,
  isInstalled,
  promptInstall,
}: {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => void;
}) {
  const panel = useMenuStore((s) => s.panel);
  const navDir = useMenuStore((s) => s.navDir);
  const [hasSave, setHasSave] = useState(false);
  const [newestSlot, setNewestSlot] = useState<SaveSlotMeta | null>(null);
  const noIdb = !idbAvailable();
  const menuBgSrc = getBaseAssetUrl('assets/menu_bg.png');

  // Play menu music.
  useMenuMusic();

  // Migrate legacy localStorage save on first mount.
  useEffect(() => {
    migrateLegacyIfPresent().catch(() => undefined);
  }, []);

  // Refresh save info whenever we return to ROOT.
  useEffect(() => {
    listSlots().then((slots) => {
      setHasSave(slots.length > 0);
      setNewestSlot(slots[0] ?? null);
    });
  }, [panel]);

  return (
    <div className="mm-stage">
      {/* Background art */}
      <div className="mm-bg" style={{ backgroundImage: `url("${menuBgSrc}")` }} />

      {/* Legibility scrims */}
      <div className="mm-scrim mm-scrim-1" />
      <div className="mm-scrim mm-scrim-2" />
      <div className="mm-scrim mm-scrim-3" />

      {/* Ambient magic motes */}
      <div className="mm-motes" aria-hidden="true">
        <div className="mm-mote mm-mote-a" />
        <div className="mm-mote mm-mote-b" />
        <div className="mm-mote mm-mote-c" />
        <div className="mm-mote mm-mote-d" />
        <div className="mm-mote mm-mote-e" />
        <div className="mm-mote mm-mote-f" />
        <div className="mm-mote mm-mote-g" />
        <div className="mm-mote mm-mote-h" />
      </div>

      {/* ROOT content (always visible behind panels) */}
      <div className="mm-root-content">
        {noIdb && (
          <div className="mm-root-notice">
            Saving is unavailable in this context (e.g. private mode). You can still play, but progress will not be saved.
          </div>
        )}
        <RootPanel hasSave={hasSave} newestSlot={newestSlot} />
      </div>

      {/* Sub-panel overlays */}
      {panel === 'NEW' && <NewPanel key={`NEW-${navDir}`} />}
      {panel === 'LOAD' && <LoadPanel key={`LOAD-${navDir}`} />}
      {panel === 'OPTIONS' && (
        <OptionsPanel
          key={`OPTIONS-${navDir}`}
          canInstall={canInstall}
          isInstalled={isInstalled}
          promptInstall={promptInstall}
        />
      )}
    </div>
  );
}
