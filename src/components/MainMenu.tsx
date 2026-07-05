/**
 * MainMenu component for Volcanae.
 * Pre-game screen with Continue / New Game / Load Game / Options panels.
 * Plays a dedicated menu music track.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMenuStore } from '../menuStore';
import { useGameStore } from '../gameStore';
import { useSoundOptionsStore } from '../soundOptionsStore';
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
} from '../saveSystem';
import type { SaveSlotMeta } from '../saveSystem';
import { SAVE } from '../gameConfig';
import { DIFFICULTY_MULTIPLIER, getLavaAdvanceInterval } from '../gameConfig';
import { Difficulty } from '../types';
import { MENU_TRACK } from '../musicSystem';
import './MainMenu.css';

// ============================================================================
// DIFFICULTY LABELS (mirrored from HUD.tsx)
// ============================================================================

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [Difficulty.EASY]: '🟢 Easy',
  [Difficulty.STANDARD]: '🟡 Standard',
  [Difficulty.HARD]: '🔴 Hard',
};

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  [Difficulty.EASY]: `Enemies are weaker (×${DIFFICULTY_MULTIPLIER[Difficulty.EASY]}). Lava advances every ${getLavaAdvanceInterval(Difficulty.EASY)} turns.`,
  [Difficulty.STANDARD]: `Enemies are at full strength. Lava advances every ${getLavaAdvanceInterval(Difficulty.STANDARD)} turns.`,
  [Difficulty.HARD]: `Enemies are stronger (×${DIFFICULTY_MULTIPLIER[Difficulty.HARD]}). Lava advances every ${getLavaAdvanceInterval(Difficulty.HARD)} turns.`,
};

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
// MENU MUSIC HOOK
// ============================================================================

function useMenuMusic(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const screen = useMenuStore((s) => s.screen);
  const volume = useSoundOptionsStore((s) => s.volume);
  const muted = useSoundOptionsStore((s) => s.muted);
  const pendingRef = useRef<(() => void) | null>(null);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
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

    if (screen !== 'MENU') {
      audio.pause();
      audio.src = '';
      if (pendingRef.current) {
        window.removeEventListener('pointerdown', pendingRef.current);
        window.removeEventListener('keydown', pendingRef.current);
        pendingRef.current = null;
      }
      return;
    }

    audio.src = `${import.meta.env.BASE_URL}music/${encodeURIComponent(MENU_TRACK)}`;
    audio.volume = muted ? 0 : volume;
    audio.load();
    audio.play().catch(() => {
      // Autoplay blocked — wait for user interaction.
      const resume = () => {
        pendingRef.current = null;
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
        audio.play().catch(() => undefined);
      };
      pendingRef.current = resume;
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    });

    return () => {
      if (pendingRef.current) {
        window.removeEventListener('pointerdown', pendingRef.current);
        window.removeEventListener('keydown', pendingRef.current);
        pendingRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volume/muted are applied via audio.volume inline; we intentionally re-run only when screen changes to start/stop the track
  }, [screen]);
}

// ============================================================================
// ROOT PANEL
// ============================================================================

function RootPanel({ hasSave }: { hasSave: boolean }) {
  const goPanel = useMenuStore((s) => s.goPanel);
  const continueGame = useGameStore((s) => s.continueGame);
  const noIdb = !idbAvailable();

  return (
    <div className="mm-panel" data-dir="forward" key="ROOT">
      {noIdb && (
        <div className="mm-notice mm-notice--error">
          ⚠️ Saving is unavailable in this context (e.g. private mode). You can still play, but progress will not be saved.
        </div>
      )}
      {hasSave && (
        <button className="mm-btn" onClick={() => continueGame()}>
          ▶️ Continue
        </button>
      )}
      <button className="mm-btn" onClick={() => goPanel('NEW', 'forward')}>
        🆕 New Game
      </button>
      <button className="mm-btn" onClick={() => goPanel('LOAD', 'forward')}>
        📂 Load Game
      </button>
      <button className="mm-btn" onClick={() => goPanel('OPTIONS', 'forward')}>
        ⚙️ Options
      </button>
    </div>
  );
}

// ============================================================================
// NEW GAME PANEL
// ============================================================================

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
    const prefixRe = new RegExp(`^${SAVE.DEFAULT_NAME_PREFIX} (\\d+)$`);
    async function computeDefault() {
      const slots = await listSlots();
      const usedNumbers = new Set<number>();
      for (const s of slots) {
        const m = s.name.match(prefixRe);
        if (m) usedNumbers.add(parseInt(m[1], 10));
      }
      let n = 1;
      while (usedNumbers.has(n)) n++;
      const d = `${SAVE.DEFAULT_NAME_PREFIX} ${n}`;
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
    <div className="mm-panel" data-dir={navDir} key="NEW">
      <div className="mm-panel-title">🆕 New Game</div>

      <div>
        <div className="mm-field-label">Campaign Name</div>
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
        <div className="mm-difficulty-grid">
          {([Difficulty.EASY, Difficulty.STANDARD, Difficulty.HARD] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`mm-difficulty-btn${selectedDifficulty === d ? ' mm-difficulty-btn--active' : ''}`}
              onClick={() => setSelectedDifficulty(d)}
            >
              <span className="mm-difficulty-btn-label">{DIFFICULTY_LABEL[d]}</span>
              <span className="mm-difficulty-btn-desc">{DIFFICULTY_DESC[d]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mm-coming-soon-row">
        🌍 World generation — coming soon
      </div>

      {capReached && (
        <div className="mm-notice mm-notice--error">
          Save limit reached ({SAVE.SLOT_CAP}). Delete a save to start a new game.
          <br />
          <button className="mm-btn mm-btn--back" style={{ marginTop: '0.5rem' }} onClick={() => goPanel('LOAD', 'forward')}>
            Go to Load / Delete saves
          </button>
        </div>
      )}

      <button
        className="mm-btn"
        onClick={handleStart}
        disabled={capReached || starting || !idbAvailable()}
      >
        {starting ? '⏳ Starting…' : '🚀 Start'}
      </button>
      <button className="mm-btn mm-btn--back" onClick={() => goPanel('ROOT', 'back')}>
        ← Back
      </button>
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
    <div className="mm-panel" data-dir={navDir} key="LOAD">
      <div className="mm-panel-title">📂 Load Game</div>

      {!idbAvailable() && (
        <div className="mm-notice mm-notice--error">
          ⚠️ Save storage is unavailable in this context.
        </div>
      )}

      {loading ? (
        <div className="mm-load-empty">Loading saves…</div>
      ) : slots.length === 0 ? (
        <div className="mm-load-empty">No saves found.</div>
      ) : (
        <div className="mm-slot-list">
          {pageSlots.map((meta) => {
            const compatible = isSlotCompatible(meta);
            return (
              <div
                key={meta.id}
                className={`mm-slot-row${!compatible ? ' mm-slot-row--incompatible' : ''}`}
              >
                <div className="mm-slot-name">
                  {meta.name}
                  {!compatible && (
                    <span className="mm-slot-badge">Incompatible (v{meta.version})</span>
                  )}
                </div>
                <div className="mm-slot-meta">
                  Turn {meta.turn} · {DIFFICULTY_LABEL[meta.difficulty]} · {formatRelativeTime(meta.savedAt)}
                </div>
                <div className="mm-slot-actions">
                  <button
                    className="mm-slot-btn"
                    disabled={!compatible}
                    onClick={() => loadIntoGame(meta.id)}
                  >
                    ▶ Load
                  </button>
                  <button
                    className={`mm-slot-btn mm-slot-btn--danger`}
                    onClick={() => handleDelete(meta.id)}
                  >
                    {confirmDeleteId === meta.id ? '⚠️ Confirm' : '🗑️ Delete'}
                  </button>
                  {confirmDeleteId === meta.id && (
                    <button
                      className="mm-slot-btn"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    className="mm-slot-btn"
                    onClick={() => handleExport(meta)}
                  >
                    📤 Export
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showPagination && (
        <div className="mm-pagination">
          <button className="mm-page-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>←</button>
          <span>Page {page + 1} / {totalPages}</span>
          <button className="mm-page-btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      )}

      <hr className="mm-separator" />

      <div className="mm-import-row">
        <button
          className="mm-btn"
          style={{ flex: 1 }}
          onClick={() => fileInputRef.current?.click()}
        >
          📥 Import save
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
      </div>

      {importError && (
        <div className="mm-notice mm-notice--error">{importError}</div>
      )}

      <button className="mm-btn mm-btn--back" onClick={() => goPanel('ROOT', 'back')}>
        ← Back
      </button>
    </div>
  );
}

// ============================================================================
// OPTIONS PANEL
// ============================================================================

function OptionsPanel({ canInstall, promptInstall }: { canInstall: boolean; promptInstall: () => void }) {
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

  const handleRequestPersist = useCallback(async () => {
    const result = await requestPersist();
    setPersisted(result);
  }, []);

  return (
    <div className="mm-panel" data-dir={navDir} key="OPTIONS">
      <div className="mm-panel-title">⚙️ Options</div>

      <div className="mm-options-section-title">Sound</div>
      <div className="mm-options-volume-row">
        <span className="mm-options-volume-label">🔊 Volume</span>
        <input
          type="range"
          className="mm-options-volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setVolume(val);
            if (muted) setMuted(false);
          }}
          aria-label="Sound volume"
        />
        <button
          className={`mm-options-mute-btn${muted ? ' mm-options-mute-btn--muted' : ''}`}
          onClick={() => setMuted(!muted)}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <hr className="mm-separator" />
      <div className="mm-options-section-title">Storage</div>

      <div className="mm-options-storage-row">
        <span className="mm-options-storage-label">
          {persisted === null ? '⏳ Checking…' : persisted ? '✅ Durable storage active' : '⚠️ Storage not persisted'}
        </span>
        {persisted === false && (
          <button className="mm-options-persist-btn" onClick={handleRequestPersist}>
            Request durable storage
          </button>
        )}
      </div>

      {canInstall && (
        <p className="mm-options-a2hs-note">
          📲 Installing the app improves save durability.{' '}
          <button className="mm-options-persist-btn" onClick={promptInstall}>Install App</button>
        </p>
      )}

      {usage && (
        <div className="mm-options-usage">
          💾 Storage: {formatBytes(usage.usage)} used / {formatBytes(usage.quota)} quota
        </div>
      )}

      <button className="mm-btn mm-btn--back" onClick={() => goPanel('ROOT', 'back')}>
        ← Back
      </button>
    </div>
  );
}

// ============================================================================
// MAIN MENU
// ============================================================================

export default function MainMenu({ canInstall, promptInstall }: { canInstall: boolean; promptInstall: () => void }) {
  const panel = useMenuStore((s) => s.panel);
  const navDir = useMenuStore((s) => s.navDir);
  const [hasSave, setHasSave] = useState(false);

  // Play menu music.
  useMenuMusic();

  // Migrate legacy localStorage save on first mount.
  useEffect(() => {
    migrateLegacyIfPresent().catch(() => undefined);
  }, []);

  // Check if any slots exist (for Continue button).
  useEffect(() => {
    slotCount().then((count) => setHasSave(count > 0));
  }, [panel]);

  return (
    <div className="mm-stage">
      <div className="mm-panel-wrapper">
        {panel === 'ROOT' && <RootPanel key="ROOT" hasSave={hasSave} />}
        {panel === 'NEW' && <NewPanel key={`NEW-${navDir}`} />}
        {panel === 'LOAD' && <LoadPanel key={`LOAD-${navDir}`} />}
        {panel === 'OPTIONS' && <OptionsPanel key={`OPTIONS-${navDir}`} canInstall={canInstall} promptInstall={promptInstall} />}
      </div>
    </div>
  );
}
