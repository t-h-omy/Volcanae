/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { useDevOptionsStore } from '../devOptionsStore';
import { UNITS, UNIT_COSTS, RESOURCES, UNIT_POPULATION_COSTS, POPULATION, UNIT_LEVEL_UP, XP, TECH_TREE, ABILITIES, DIFFICULTY_MULTIPLIER, getLavaAdvanceInterval } from '../gameConfig';
import { UI } from '../uiConfig';
import type { UnitPopulationCost, TechId } from '../types';
import {
  hasSpawnSpaceAt,
  computePopulationUsage,
  computePopulationCapacity,
  canAffordPopulation,
  computeResourceIncome,
} from '../resourceSystem';
import {
  getConstructionOptionsForTile,
} from '../constructionSystem';
import { computeLevelFromXp } from '../levelSystem';
import { computeUnitAiScores, computeRecruitmentScores, type ScoredAction } from '../enemySystem';
import { renderEffect, getStrongholdCapMods, getAvailableTechs as getAvailableTechsLogic } from '../techSystem';
import {
  Faction,
  GamePhase,
  UnitType,
  UnitTag,
  BuildingType,
  TileType,
  TechEffectType,
  TechFlag,
  Difficulty,
  type Building,
  type Unit,
  type Specialist,
  type Position,
  type Tile,
  type GameStats,
} from '../types';
import { canUnitMove, canUnitAttack, canUnitCapture, canUnitConstruct, canUnitHeal, getHealTargets, canUnitFieldwork, getNorthermostPlayerY } from '../unitActions';
import { getPhalanxAttackBonus, getPhalanxDefenseBonus } from '../combatSystem';
import { useZoneClearedStore } from '../zoneClearedStore';
import { UNIT_DESCRIPTIONS, UNIT_TAGS, TAG_INFO, BUILDING_DESCRIPTIONS } from '../descriptions';
import './HUD.css';

// ============================================================================
// EMOJI LOOKUP TABLES
// ============================================================================

const UNIT_EMOJI: Record<string, string> = {
  [UnitType.INFANTRY]: '⚔️',
  [UnitType.ARCHER]: '🏹',
  [UnitType.RIDER]: '🐴',
  [UnitType.SIEGE]: '💣',
  [UnitType.SCOUT]: '🔭',
  [UnitType.GUARD]: '🛡️',
  [UnitType.LAVA_GRUNT]: '👹',
  [UnitType.LAVA_ARCHER]: '👺',
  [UnitType.LAVA_RIDER]: '👾',
  [UnitType.LAVA_SIEGE]: '🐦‍🔥',
  [UnitType.EMBERLING]: '🔥',
};

const UNIT_NAME: Record<string, string> = {
  [UnitType.INFANTRY]: 'Infantry',
  [UnitType.ARCHER]: 'Archer',
  [UnitType.RIDER]: 'Rider',
  [UnitType.SIEGE]: 'Siege',
  [UnitType.SCOUT]: 'Scout',
  [UnitType.GUARD]: 'Guard',
  [UnitType.LAVA_GRUNT]: 'Lava Grunt',
  [UnitType.LAVA_ARCHER]: 'Lava Archer',
  [UnitType.LAVA_RIDER]: 'Lava Rider',
  [UnitType.LAVA_SIEGE]: 'Lava Siege',
  [UnitType.EMBERLING]: 'Emberling',
};

const BUILDING_EMOJI: Record<string, string> = {
  [BuildingType.STRONGHOLD]: '🏰',
  [BuildingType.MINE]: '🏔️',
  [BuildingType.WOODCUTTER]: '🛖',
  [BuildingType.BARRACKS]: '🏚️',
  [BuildingType.ARCHER_CAMP]: '🏕️',
  [BuildingType.RIDER_CAMP]: '🏘️',
  [BuildingType.SIEGE_CAMP]: '🏛️',
  [BuildingType.WATCHTOWER]: '👁️',
  [BuildingType.OUTPOST]: '🗼',
  [BuildingType.LAVALAIR]: '🕳️',
  [BuildingType.INFERNALSANCTUM]: '🌋',
  [BuildingType.FARM]: '🌾',
  [BuildingType.PATRICIANHOUSE]: '🏯',
  [BuildingType.MAGMASPYR]: '⛰️',
  [BuildingType.EMBERNEST]: '🌲',
  [BuildingType.CRYSTAL_CHAMBER]: '💎',
};

const BUILDING_NAME: Record<string, string> = {
  [BuildingType.STRONGHOLD]: 'Stronghold',
  [BuildingType.MINE]: 'Mine',
  [BuildingType.WOODCUTTER]: 'Woodcutter',
  [BuildingType.BARRACKS]: 'Barracks',
  [BuildingType.ARCHER_CAMP]: 'Archer Camp',
  [BuildingType.RIDER_CAMP]: 'Rider Camp',
  [BuildingType.SIEGE_CAMP]: 'Siege Camp',
  [BuildingType.WATCHTOWER]: 'Watchtower',
  [BuildingType.OUTPOST]: 'Outpost',
  [BuildingType.LAVALAIR]: 'Lava Lair',
  [BuildingType.INFERNALSANCTUM]: 'Infernal Sanctum',
  [BuildingType.FARM]: 'Farm',
  [BuildingType.PATRICIANHOUSE]: 'Patrician House',
  [BuildingType.MAGMASPYR]: 'Magma Spyr',
  [BuildingType.EMBERNEST]: 'Ember Nest',
  [BuildingType.CRYSTAL_CHAMBER]: 'Crystal Chamber',
};

const TAG_EMOJI: Partial<Record<UnitTag, string>> = {
  [UnitTag.RANGED]:          '🎯',
  [UnitTag.PREP]:            '⏸️',
  [UnitTag.BUILDANDCAPTURE]: '🏗️',
  [UnitTag.SACRIFICIAL]:     '💀',
  [UnitTag.EXPLOSIVE]:       '💥',
  [UnitTag.FIELDWORK]:       '⛺',
  [UnitTag.ASSASSIN]:        '🗡️',
  [UnitTag.PATCHUP]:         '🩹',
  [UnitTag.PHALANX]:         '🔰',
  [UnitTag.LAVABOOST]:       '🌋',
  [UnitTag.CORRUPT]:         '☠️',
};

/** Maps recruitment buildings to their recruitable unit types */
const BUILDING_RECRUITS: Partial<Record<string, UnitType[]>> = {
  [BuildingType.BARRACKS]: [UnitType.INFANTRY],
  [BuildingType.ARCHER_CAMP]: [UnitType.ARCHER],
  [BuildingType.RIDER_CAMP]: [UnitType.RIDER],
  [BuildingType.SIEGE_CAMP]: [UnitType.SIEGE],
  [BuildingType.STRONGHOLD]: [UnitType.SCOUT, UnitType.GUARD],
};

// ============================================================================
// GAME MENU
// ============================================================================

function getDisplayVersion(full: string): string {
  const parts = full.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : full;
}

const displayVersion = getDisplayVersion(__APP_VERSION__);

// ============================================================================
// DEV OPTIONS OVERLAY
// ============================================================================

function DevOptionsOverlay({ onClose }: { onClose: () => void }) {
  const showAiScores = useDevOptionsStore((s) => s.showAiScores);
  const setShowAiScores = useDevOptionsStore((s) => s.setShowAiScores);
  const showRecruitingScores = useDevOptionsStore((s) => s.showRecruitingScores);
  const setShowRecruitingScores = useDevOptionsStore((s) => s.setShowRecruitingScores);
  const debugAdvanceLava = useGameStore((s) => s.debugAdvanceLava);
  const debugAddResources = useGameStore((s) => s.debugAddResources);
  const debugGiveSpecialist = useGameStore((s) => s.debugGiveSpecialist);
  const debugRevealAll = useGameStore((s) => s.debugRevealAll);
  const debugAddFarmers = useGameStore((s) => s.debugAddFarmers);
  const debugAddRuin = useGameStore((s) => s.debugAddRuin);
  const debugAddCrystals = useGameStore((s) => s.debugAddCrystals);
  const [devStatsOpen, setDevStatsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="hud-dev-overlay-backdrop" onClick={onClose}>
        <div className="hud-dev-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="hud-dev-overlay-header">
            <span>🛠️ Dev Options</span>
            <button className="hud-modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="hud-dev-overlay-body">
            <div className="hud-dev-overlay-section-title">Toggles</div>
            <label className="hud-dev-option-row">
              <span className="hud-dev-option-label">Show AI Scores for Enemy Units</span>
              <input
                type="checkbox"
                className="hud-dev-option-toggle"
                checked={showAiScores}
                onChange={(e) => setShowAiScores(e.target.checked)}
              />
            </label>
            <label className="hud-dev-option-row">
              <span className="hud-dev-option-label">Show Recruiting Scores for Enemy Buildings</span>
              <input
                type="checkbox"
                className="hud-dev-option-toggle"
                checked={showRecruitingScores}
                onChange={(e) => setShowRecruitingScores(e.target.checked)}
              />
            </label>
            <div className="hud-dev-overlay-section-title">Stats</div>
            <button className="hud-dev-action-btn" onClick={() => setDevStatsOpen(true)}>📊 Dev Stats</button>
            <div className="hud-dev-overlay-section-title">Actions</div>
            <button className="hud-dev-action-btn" onClick={debugAdvanceLava}>🌋 Advance Lava</button>
            <button className="hud-dev-action-btn" onClick={debugAddResources}>💰 +10 Resources</button>
            <button className="hud-dev-action-btn" onClick={debugGiveSpecialist}>🧙 Give Specialist</button>
            <button className="hud-dev-action-btn" onClick={debugRevealAll}>👁️ Reveal All</button>
            <button className="hud-dev-action-btn" onClick={debugAddFarmers}>🌾 Add Farm (zone 1)</button>
            <button className="hud-dev-action-btn" onClick={debugAddRuin}>🗿 Add Ruin (near unit)</button>
            <button className="hud-dev-action-btn" onClick={debugAddCrystals}>💎 +5 Crystals</button>
          </div>
        </div>
      </div>
      {devStatsOpen && <DevStatsOverlay onClose={() => setDevStatsOpen(false)} />}
    </>
  );
}

/** Enemy recruitment building types — buildings that spawn enemy units each turn. */
const ENEMY_RECRUITMENT_TYPES = new Set<BuildingType>([
  BuildingType.LAVALAIR,
  BuildingType.INFERNALSANCTUM,
]);

function DevStatsOverlay({ onClose }: { onClose: () => void }) {
  const buildings = useGameStore((s) => s.buildings);
  const enemyUnitsSpawnedLastTurn = useGameStore((s) => s.enemyUnitsSpawnedLastTurn);

  const enemyRecruitingBuildingCount = useMemo(
    () => Object.values(buildings).filter(
      (b) => b.faction === Faction.ENEMY && ENEMY_RECRUITMENT_TYPES.has(b.type),
    ).length,
    [buildings],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stats: Array<{ label: string; value: number | string }> = [
    { label: 'Enemy recruiting buildings', value: enemyRecruitingBuildingCount },
    { label: 'Enemy units spawned last turn', value: enemyUnitsSpawnedLastTurn },
  ];

  return (
    <div className="hud-dev-overlay-backdrop" onClick={onClose}>
      <div className="hud-dev-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="hud-dev-overlay-header">
          <span>📊 Dev Stats</span>
          <button className="hud-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="hud-dev-overlay-body">
          {stats.map(({ label, value }) => (
            <div key={label} className="hud-dev-stat-row">
              <span className="hud-dev-stat-label">{label}</span>
              <span className="hud-dev-stat-value">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DIFFICULTY OVERLAY
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

function DifficultyOverlay({
  currentDifficulty,
  onSelect,
  onClose,
}: {
  currentDifficulty: Difficulty;
  onSelect: (d: Difficulty) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="hud-dev-overlay-backdrop" onClick={onClose}>
      <div className="hud-difficulty-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="hud-dev-overlay-header">
          <span>⚔️ Choose Difficulty</span>
          <button className="hud-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="hud-difficulty-overlay-body">
          {([Difficulty.EASY, Difficulty.STANDARD, Difficulty.HARD] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`hud-difficulty-btn${currentDifficulty === d ? ' hud-difficulty-btn--active' : ''}`}
              onClick={() => onSelect(d)}
            >
              <span className="hud-difficulty-btn-label">{DIFFICULTY_LABEL[d]}</span>
              <span className="hud-difficulty-btn-desc">{DIFFICULTY_DESC[d]}</span>
            </button>
          ))}
          <p className="hud-difficulty-note">Starting a new game will apply the selected difficulty.</p>
        </div>
      </div>
    </div>
  );
}

function GameMenu() {
  const [open, setOpen] = useState(false);
  const [devOptionsOverlayOpen, setDevOptionsOverlayOpen] = useState(false);
  const [difficultyOverlayOpen, setDifficultyOverlayOpen] = useState(false);
  const initNewGame = useGameStore((s) => s.initNewGame);
  const currentDifficulty = useGameStore((s) => s.difficulty);
  const saveGame = useGameStore((s) => s.saveGame);
  const clearSavedGameAction = useGameStore((s) => s.clearSavedGame);
  const hasSavedGameCheck = useGameStore((s) => s.hasSavedGame);

  const handleNewGame = useCallback(() => {
    initNewGame(currentDifficulty);
    setOpen(false);
  }, [initNewGame, currentDifficulty]);

  const handleSaveGame = useCallback(() => {
    saveGame();
  }, [saveGame]);

  const handleClearSave = useCallback(() => {
    clearSavedGameAction();
  }, [clearSavedGameAction]);

  const handleResetCache = useCallback(async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    window.location.reload();
  }, []);

  const handleDifficultySelect = useCallback((d: Difficulty) => {
    initNewGame(d);
    setDifficultyOverlayOpen(false);
  }, [initNewGame]);

  // Close menu on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Read current save status directly from localStorage each render so the
  // menu always reflects the latest state without needing a separate effect.
  const saveExists = hasSavedGameCheck();

  return (
    <div className="hud-game-menu">
      <button
        className="hud-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Game menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ☰
      </button>
      {open && (
        <>
          <div
            className="hud-menu-backdrop"
            role="presentation"
            onClick={() => setOpen(false)}
          />
          <div className="hud-menu-dropdown" role="menu">
            <button className="hud-menu-item" role="menuitem" onClick={handleSaveGame}>
              💾 Save Game
            </button>
            {saveExists && (
              <button className="hud-menu-item" role="menuitem" onClick={handleClearSave}>
                🗑️ Clear Save
              </button>
            )}
            <button className="hud-menu-item" role="menuitem" onClick={handleNewGame}>
              🔄 New Game
            </button>
            <button
              className="hud-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); setDifficultyOverlayOpen(true); }}
            >
              ⚔️ Difficulty ({DIFFICULTY_LABEL[currentDifficulty]})
            </button>
            <button className="hud-menu-item" role="menuitem" onClick={handleResetCache}>
              🗑️ Reset Cache &amp; Reload
            </button>
            <button
              className="hud-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); setDevOptionsOverlayOpen(true); }}
            >
              🛠️ Dev Options
            </button>
            <div className="hud-menu-version">v{displayVersion}</div>
          </div>
        </>
      )}
      {devOptionsOverlayOpen && (
        <DevOptionsOverlay onClose={() => setDevOptionsOverlayOpen(false)} />
      )}
      {difficultyOverlayOpen && (
        <DifficultyOverlay
          currentDifficulty={currentDifficulty}
          onSelect={handleDifficultySelect}
          onClose={() => setDifficultyOverlayOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// TOP BAR
// ============================================================================

function TopBar({
  onOpenTechTree,
  showTechButton,
  arcaneCrystals,
  showTechBadge,
}: {
  onOpenTechTree: () => void;
  showTechButton: boolean;
  arcaneCrystals: number;
  showTechBadge: boolean;
}) {
  const turn = useGameStore((s) => s.turn);
  const resources = useGameStore((s) => s.resources);
  const threatLevel = useGameStore((s) => s.threatLevel);
  const turnsUntilLavaAdvance = useGameStore((s) => s.turnsUntilLavaAdvance);
  const isAnimating = useAnimationStore((s) => s.isAnimating);

  // Population usage and capacity (both live) — select primitives to avoid infinite re-render
  const farmersUsed = useGameStore((s) => computePopulationUsage(s).farmersUsed);
  const noblesUsed = useGameStore((s) => computePopulationUsage(s).noblesUsed);
  const farmerCapacity = useGameStore((s) => computePopulationCapacity(s).farmerCapacity);
  const nobleCapacity = useGameStore((s) => computePopulationCapacity(s).nobleCapacity);

  // Resource income per turn
  const ironPerTurn = useGameStore((s) => computeResourceIncome(s).ironPerTurn);
  const woodPerTurn = useGameStore((s) => computeResourceIncome(s).woodPerTurn);

  return (
    <div className="hud-top-bar">
      <span className="hud-stat">🔄 Turn {turn}</span>
      {isAnimating && <span className="hud-stat hud-enemy-turn-label">⚔️ Enemy Turn...</span>}
      <span className="hud-stat">⛓️ {resources.iron}{ironPerTurn > 0 && <span className="hud-income">(+{Number.isInteger(ironPerTurn) ? ironPerTurn : ironPerTurn.toFixed(1)})</span>}</span>
      <span className="hud-stat">🪵 {resources.wood}{woodPerTurn > 0 && <span className="hud-income">(+{Number.isInteger(woodPerTurn) ? woodPerTurn : woodPerTurn.toFixed(1)})</span>}</span>
      <span className="hud-stat">🌾 {farmersUsed}/{farmerCapacity}</span>
      <span className="hud-stat">🎖️ {noblesUsed}/{nobleCapacity}</span>
      <span className="hud-stat">⚠️ Threat {threatLevel}</span>
      <span className="hud-stat">🌋 Lava in {turnsUntilLavaAdvance}</span>
      <span className="hud-stat">💎 {arcaneCrystals}</span>
      {showTechButton && (
        <button className={`hud-tech-tree-btn${showTechBadge ? ' hud-tech-tree-btn--notify' : ''}`} onClick={onOpenTechTree}>
          🔬 Tech Tree
          {showTechBadge && <span className="hud-tech-tree-badge">!</span>}
        </button>
      )}
      <GameMenu />
    </div>
  );
}

/** Tags that are internal implementation details and should not be shown to the player */
const HIDDEN_UNIT_TAGS = new Set<string>([]);

// ============================================================================
// SHARED INFO POPUP COMPONENTS
// ============================================================================

/** Reusable popup shell — backdrop + centered card, dismisses on outside tap */
function Popup({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="info-popup-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="info-popup-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Tag info popup — shows label + description with an OK button */
function TagPopup({ tag, onClose }: { tag: UnitTag; onClose: () => void }) {
  const info = TAG_INFO[tag];
  if (!info) return null;
  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header-name" style={{ marginBottom: 10 }}>{info.label}</div>
      <p className="info-popup-desc" style={{ marginBottom: 16 }}>{info.desc}</p>
      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>OK</button>
    </Popup>
  );
}

/** Tappable tag pill used in panels and popups */
function InfoTagPill({ tag, onClick }: { tag: UnitTag; onClick: () => void }) {
  const info = TAG_INFO[tag];
  return (
    <button className="info-popup-tag-pill" onClick={onClick}>
      {info?.label ?? tag}
      <span className="info-popup-tag-pill-i">i</span>
    </button>
  );
}

/**
 * Unit info popup — shows description, stat grid, and tappable tag pills.
 * When isReadOnly is false (default), shows action buttons (Back + Recruit).
 */
function UnitInfoPopup({
  unitType,
  costLabel,
  onAction,
  actionLabel,
  onClose,
  isReadOnly,
}: {
  unitType: UnitType;
  costLabel?: string;
  onAction?: () => void;
  actionLabel?: string;
  onClose: () => void;
  isReadOnly?: boolean;
}) {
  const [tagPopup, setTagPopup] = useState<UnitTag | null>(null);
  const desc = UNIT_DESCRIPTIONS[unitType];
  const baseTags = UNIT_TAGS[unitType] ?? [];
  const emoji = UNIT_EMOJI[unitType] ?? '?';
  const name = UNIT_NAME[unitType] ?? unitType;

  // Always show base stats from UNITS config so info is consistent regardless of call site
  const baseConfig = UNITS[unitType as keyof typeof UNITS] as
    | { attack: number; defense: number; moveRange: number; attackRange: number; discoverRadius: number }
    | undefined;
  const stats = baseConfig
    ? {
        attack: baseConfig.attack,
        defense: baseConfig.defense,
        moveRange: baseConfig.moveRange,
        attackRange: baseConfig.attackRange,
        discoverRadius: baseConfig.discoverRadius,
      }
    : undefined;

  return (
    <>
      <Popup onClose={onClose}>
        {/* Header */}
        <div className="info-popup-header">
          <span className="info-popup-header-emoji">{emoji}</span>
          <div>
            <div className="info-popup-header-name">{name}</div>
            {costLabel && <div className="info-popup-header-cost">{costLabel}</div>}
          </div>
        </div>

        {/* Description */}
        {desc && <p className="info-popup-desc">{desc}</p>}

        {/* Stats */}
        {stats && (
          <div className="info-popup-stats">
            {([
              ['ATK', stats.attack],
              ['DEF', stats.defense],
              ['MOV', stats.moveRange],
              ['RNG', stats.attackRange],
              ['VIS', stats.discoverRadius],
            ] as const).map(([l, v]) => (
              <div key={l} className="info-popup-stat-cell">
                <div className="info-popup-stat-label">{l}</div>
                <div className="info-popup-stat-value">{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tag pills */}
        {baseTags.length > 0 && (
          <div className="info-popup-tags">
            {baseTags.map((tag) => (
              <InfoTagPill key={tag} tag={tag} onClick={() => setTagPopup(tag)} />
            ))}
          </div>
        )}

        {/* Action buttons */}
        {!isReadOnly && onAction ? (
          <div className="info-popup-actions">
            <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>Back</button>
            <button className="info-popup-btn info-popup-btn--primary" onClick={onAction}>{actionLabel ?? 'OK'}</button>
          </div>
        ) : (
          <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>
            {isReadOnly ? 'OK' : 'Back'}
          </button>
        )}
      </Popup>

      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </>
  );
}

/**
 * Building info popup — shows description and cost.
 * When isReadOnly is false (default), shows Back + Construct buttons.
 */
function BuildingInfoPopup({
  buildingType,
  cost,
  onAction,
  actionLabel,
  onClose,
  isReadOnly,
}: {
  buildingType: BuildingType;
  cost?: { iron: number; wood: number };
  onAction?: () => void;
  actionLabel?: string;
  onClose: () => void;
  isReadOnly?: boolean;
}) {
  const desc = BUILDING_DESCRIPTIONS[buildingType];
  const emoji = BUILDING_EMOJI[buildingType] ?? '?';
  const name = BUILDING_NAME[buildingType] ?? buildingType;

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{emoji}</span>
        <div>
          <div className="info-popup-header-name">{name}</div>
          {cost && <div className="info-popup-header-cost">⛓️{cost.iron} 🪵{cost.wood}</div>}
        </div>
      </div>

      {desc && <p className="info-popup-desc" style={{ marginBottom: 18 }}>{desc}</p>}

      {!isReadOnly && onAction ? (
        <div className="info-popup-actions">
          <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>Back</button>
          <button className="info-popup-btn info-popup-btn--primary" onClick={onAction}>{actionLabel ?? 'Construct'}</button>
        </div>
      ) : (
        <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>
          {isReadOnly ? 'OK' : 'Back'}
        </button>
      )}
    </Popup>
  );
}

// ============================================================================
// AI SCORE MODAL (dev option)
// ============================================================================

function AiScoreModal({ scores, onClose }: { scores: ScoredAction[]; onClose: () => void }) {
  return (
    <div className="hud-modal-backdrop" onClick={onClose}>
      <div className="hud-modal hud-ai-score-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hud-modal-header">
          <span>🤖 AI Scores</span>
          <button className="hud-modal-close" onClick={onClose}>✕</button>
        </div>
        {scores.length === 0 ? (
          <p className="hud-dim" style={{ padding: '12px' }}>No scores available.</p>
        ) : (
          <ul className="hud-modal-list">
            {scores.map((s, i) => (
              <li key={`${s.type}-${i}`} className="hud-ai-score-item">
                <span className="hud-ai-score-rank">#{i + 1}</span>
                <span className="hud-ai-score-type">{s.type}</span>
                <span className="hud-ai-score-value">{s.score.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecruitScoreModal({
  scores,
  onClose,
}: {
  scores: { type: UnitType; score: number }[];
  onClose: () => void;
}) {
  return (
    <div className="hud-modal-backdrop" onClick={onClose}>
      <div className="hud-modal hud-ai-score-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hud-modal-header">
          <span>🛠️ Recruit Scores</span>
          <button className="hud-modal-close" onClick={onClose}>✕</button>
        </div>
        {scores.length === 0 ? (
          <p className="hud-dim" style={{ padding: '12px' }}>No scores available.</p>
        ) : (
          <ul className="hud-modal-list">
            {scores.map((s, i) => (
              <li key={`${s.type}-${i}`} className="hud-ai-score-item">
                <span className="hud-ai-score-rank">#{i + 1}</span>
                <span className="hud-ai-score-type">{s.type}</span>
                <span className="hud-ai-score-value">{s.score.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SELECTED UNIT PANEL
// ============================================================================

function SelectedUnitPanel({
  unit,
  captureTarget,
  onCapture,
}: {
  unit: Unit;
  captureTarget?: Building;
  onCapture?: () => void;
}) {
  const isPlayer = unit.faction === Faction.PLAYER;
  const hpPct = (unit.stats.currentHp / unit.stats.maxHp) * 100;
  const canMove = canUnitMove(unit);
  const canAttack = canUnitAttack(unit);
  const canCapture = canUnitCapture(unit);
  const canHeal = isPlayer && canUnitHeal(unit);
  const canFieldwork = isPlayer && canUnitFieldwork(unit);

  const visibleTags = unit.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t));

  const showAiScores = useDevOptionsStore((s) => s.showAiScores);
  const gameState = useGameStore((s) => s);
  const fieldworkBlocked = canFieldwork && (() => {
    const tile = gameState.grid[unit.position.y]?.[unit.position.x];
    if (!tile) return true;
    if (tile.buildingId !== null) return true;
    if (tile.isRuin || tile.isStrongholdRuin) return true;
    if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) return true;
    return false;
  })();
  const [aiScoreModal, setAiScoreModal] = useState(false);
  const [aiScores, setAiScores] = useState<ScoredAction[]>([]);
  const [unitInfoOpen, setUnitInfoOpen] = useState(false);
  const [tagPopup, setTagPopup] = useState<UnitTag | null>(null);
  const levelUpUnit = useGameStore((s) => s.levelUpUnit);
  const startHealMode = useGameStore((s) => s.startHealMode);
  const cancelHealMode = useGameStore((s) => s.cancelHealMode);
  const pendingHealerId = useGameStore((s) => s.pendingHealerId);
  const fieldworkUnit = useGameStore((s) => s.fieldworkUnit);
  const [confirmFieldwork, setConfirmFieldwork] = useState(false);

  const healTargets = useMemo(
    () => (canHeal ? getHealTargets(gameState, unit.id) : []),
    [canHeal, gameState, unit.id],
  );

  const isInHealMode = pendingHealerId === unit.id;

  const handleHealClick = () => {
    if (isInHealMode) {
      cancelHealMode();
    } else if (healTargets.length > 0) {
      startHealMode(unit.id);
    }
  };

  const targetLevel = computeLevelFromXp(unit.type, unit.xp);
  const canLevelUp = isPlayer && targetLevel > unit.level;
  const isMaxLevel = unit.level >= XP.MAX_LEVEL;
  const nextLevelDef = !isMaxLevel ? UNIT_LEVEL_UP[unit.type]?.[unit.level - 1] : null;
  const nextLevelXpRequired = nextLevelDef?.xpRequired ?? null;

  // Compute contextual stat bonuses from tech flags
  const statBonuses = useMemo(() => {
    const bonuses: { def: number; mov: number } = { def: 0, mov: 0 };
    if (unit.faction !== Faction.PLAYER) return bonuses;

    // HOLD_GROUND: defense bonus when standing on own building
    if (gameState.techFlags.includes(TechFlag.HOLD_GROUND)) {
      const tile = gameState.grid[unit.position.y]?.[unit.position.x];
      if (tile?.buildingId) {
        const building = gameState.buildings[tile.buildingId];
        if (building?.faction === Faction.PLAYER) {
          bonuses.def = ABILITIES.HOLD_GROUND_DEFENSE_BONUS;
        }
      }
    }

    // TO_THE_FRONT: movement bonus when far south of northernmost player unit
    if (gameState.techFlags.includes(TechFlag.TO_THE_FRONT)) {
      const minPlayerY = getNorthermostPlayerY(gameState);
      if (minPlayerY !== undefined && unit.position.y - minPlayerY > ABILITIES.TO_THE_FRONT_MIN_DISTANCE) {
        bonuses.mov = ABILITIES.TO_THE_FRONT_MOVE_BONUS;
      }
    }

    return bonuses;
  }, [unit, gameState]);

  // Compute PHALANX formation bonuses (works for both factions)
  const phalanxAttack = useMemo(() => getPhalanxAttackBonus(gameState, unit), [gameState, unit]);
  const phalanxDefense = useMemo(() => getPhalanxDefenseBonus(gameState, unit), [gameState, unit]);
  const totalDefBonus = statBonuses.def + phalanxDefense;

  return (
    <div className={`hud-info-panel${!isPlayer ? ' hud-panel-enemy' : ''}`}>
      {/* Header — entire row is tappable to open UnitInfoPopup */}
      <button className="hud-panel-header-btn" onClick={() => setUnitInfoOpen(true)} aria-label={`View ${UNIT_NAME[unit.type] ?? unit.type} info`}>
        <span className="hud-panel-emoji">{UNIT_EMOJI[unit.type] ?? '?'}</span>
        <span className="hud-panel-name">
          {UNIT_NAME[unit.type] ?? unit.type}
          <span className="info-badge" aria-hidden="true">i</span>
        </span>
        {!isPlayer && <span className="hud-faction-label hud-faction-enemy">🔴 Enemy</span>}
      </button>
      <div className="hud-hp-row">
        <div className="hud-hp-bar">
          <div className="hud-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <span className="hud-hp-text">
          {unit.stats.currentHp}/{unit.stats.maxHp}
        </span>
      </div>
      {isPlayer && (
        <div className="hud-xp-row">
          <span className="hud-xp-label">
            {isMaxLevel
              ? `⭐ XP: ${unit.xp}   Lv.${unit.level} (MAX)`
              : `⭐ XP: ${unit.xp} / ${nextLevelXpRequired}   Lv.${unit.level}`}
          </span>
        </div>
      )}
      {!isPlayer && (
        <div className="hud-xp-row">
          <span className="hud-xp-label">⭐ Lv.{unit.level}</span>
        </div>
      )}
      {canLevelUp && (
        <button
          className="hud-levelup-btn"
          onClick={() => levelUpUnit(unit.id)}
        >
          ⬆️ Level Up to Lv.{targetLevel}
        </button>
      )}
      <div className="hud-unit-stats">
        <span className="hud-stat-label">ATK</span>
        <span className={`hud-stat-value${phalanxAttack > 0 ? ' hud-stat-boosted' : ''}`}>
          {unit.stats.attack}{phalanxAttack > 0 ? `+${phalanxAttack}` : ''}
        </span>
        <span className="hud-stat-label">DEF</span>
        <span className={`hud-stat-value${totalDefBonus > 0 ? ' hud-stat-boosted' : ''}`}>
          {unit.stats.defense}{totalDefBonus > 0 ? `+${totalDefBonus}` : ''}
        </span>
        <span className="hud-stat-label">MOV</span>
        <span className={`hud-stat-value${statBonuses.mov > 0 ? ' hud-stat-boosted' : ''}`}>
          {unit.stats.moveRange}{statBonuses.mov > 0 ? `+${statBonuses.mov}` : ''}
        </span>
        <span className="hud-stat-label">RNG</span>
        <span className="hud-stat-value">{unit.stats.attackRange}</span>
        <span className="hud-stat-label">VIS</span>
        <span className="hud-stat-value">{unit.stats.discoverRadius}</span>
      </div>
      {visibleTags.length > 0 && (
        <div className="hud-tag-pills">
          {visibleTags.map((tag) => (
            <InfoTagPill key={tag} tag={tag} onClick={() => setTagPopup(tag)} />
          ))}
        </div>
      )}
      {isPlayer && (
        <>
          <div className="hud-action-tags">
            <span className={`hud-action-tag ${canMove ? '' : 'hud-action-used'}`}>Move</span>
            <span className={`hud-action-tag ${canAttack ? '' : 'hud-action-used'}`}>Attack</span>
            <span className={`hud-action-tag ${canCapture ? '' : 'hud-action-used'}`}>Capture</span>
          </div>
          {captureTarget && (
            <>
              {captureTarget.consumesUnitOnCapture && canCapture && (
                <div className="hud-warning hud-capture-warning">
                  ⚠️ This unit will be consumed!
                </div>
              )}
              <button
                className="hud-capture-btn"
                disabled={!canCapture}
                onClick={onCapture}
              >
                {unit.hasMovedThisTurn
                  ? '🏳️ Capture — move here first'
                  : `🏳️ Capture ${BUILDING_NAME[captureTarget.type] ?? captureTarget.type}`}
              </button>
            </>
          )}
          {canHeal && (
            <button
              className={`hud-capture-btn${isInHealMode ? ' hud-heal-active' : ''}`}
              disabled={healTargets.length === 0}
              onClick={handleHealClick}
            >
              {isInHealMode ? '💊 Choose target…' : '💊 Heal'}
            </button>
          )}
          {canFieldwork && (
            <>
              {!confirmFieldwork ? (
                <button
                  className="hud-capture-btn"
                  disabled={fieldworkBlocked}
                  onClick={() => setConfirmFieldwork(true)}
                >
                  🏗️ Build Outpost
                </button>
              ) : (
                <div className="hud-fieldwork-confirm">
                  <div className="hud-warning hud-capture-warning">
                    ⚠️ This unit will be consumed!
                  </div>
                  <button
                    className="hud-capture-btn"
                    onClick={() => {
                      fieldworkUnit(unit.id);
                      setConfirmFieldwork(false);
                    }}
                  >
                    ✅ Confirm Build
                  </button>
                  <button
                    className="hud-capture-btn"
                    onClick={() => setConfirmFieldwork(false)}
                  >
                    ❌ Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {!isPlayer && showAiScores && (
        <button
          className="hud-ai-score-btn"
          onClick={() => {
            setAiScores(computeUnitAiScores(gameState, unit.id));
            setAiScoreModal(true);
          }}
        >
          🤖 AI Score
        </button>
      )}
      {aiScoreModal && (
        <AiScoreModal scores={aiScores} onClose={() => setAiScoreModal(false)} />
      )}
      {unitInfoOpen && (
        <UnitInfoPopup
          unitType={unit.type}
          onClose={() => setUnitInfoOpen(false)}
          isReadOnly
        />
      )}
      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </div>
  );
}

// ============================================================================
// SPECIALIST PICKER MODAL
// ============================================================================

function SpecialistPickerModal({
  buildingId,
  onClose,
}: {
  buildingId: string;
  onClose: () => void;
}) {
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const assignSpecialist = useGameStore((s) => s.assignSpecialist);

  const available: Specialist[] = globalSpecialistStorage
    .map((id) => specialists[id])
    .filter(Boolean) as Specialist[];

  const handleAssign = useCallback(
    (specialistId: string) => {
      assignSpecialist(specialistId, buildingId);
      onClose();
    },
    [assignSpecialist, buildingId, onClose]
  );

  return (
    <div className="hud-modal-backdrop" onClick={onClose}>
      <div className="hud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hud-modal-header">
          <span>🧙 Assign Specialist</span>
          <button className="hud-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {available.length === 0 ? (
          <p className="hud-dim" style={{ padding: '12px' }}>
            No specialists available.
          </p>
        ) : (
          <ul className="hud-modal-list">
            {available.map((sp) => (
              <li key={sp.id} className="hud-modal-item">
                <div className="hud-modal-item-info">
                  <span className="hud-modal-item-name">{sp.name}</span>
                  <span className="hud-modal-item-desc">{sp.description}</span>
                  <span className="hud-modal-item-effects">
                    {sp.effects.map((e) => e.type).join(', ')}
                  </span>
                </div>
                <button
                  className="hud-modal-assign-btn"
                  onClick={() => handleAssign(sp.id)}
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CONSTRUCTION PANEL (shown when a BUILD_AND_CAPTURE unit is on a constructable tile)
// ============================================================================

function ConstructionPanel({
  unit,
  tilePos,
}: {
  unit: Unit;
  tilePos: Position;
}) {
  const resources = useGameStore((s) => s.resources);
  const constructBuilding = useGameStore((s) => s.constructBuilding);
  const grid = useGameStore((s) => s.grid);
  const [confirmBuilding, setConfirmBuilding] = useState<typeof options[number] | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const options = useMemo(
    () => getConstructionOptionsForTile(useGameStore.getState(), tilePos),
    [tilePos, grid],
  );

  if (options.length === 0) return null;

  return (
    <div className="hud-info-panel hud-construction-panel">
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">🔨</span>
        <span className="hud-panel-name">Construct Building</span>
        <button
          className="hud-construct-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>
      {!collapsed && (
        <div className="hud-construct-options">
          {options.map((opt) => {
            const canAffordThis =
              resources.iron >= opt.cost.iron && resources.wood >= opt.cost.wood;
            return (
              <button
                key={opt.buildingType}
                className="info-row-btn"
                disabled={!canAffordThis}
                onClick={() => setConfirmBuilding(opt)}
              >
                <span className="info-row-emoji">{opt.emoji}</span>
                <div className="info-row-body">
                  <div className="info-row-name">
                    {opt.label}
                    <span className="info-badge info-badge--small">i</span>
                  </div>
                  <div className="info-row-cost">⛓️{opt.cost.iron} 🪵{opt.cost.wood}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {confirmBuilding && (
        <BuildingInfoPopup
          buildingType={confirmBuilding.buildingType}
          cost={confirmBuilding.cost}
          actionLabel="Construct"
          onAction={() => {
            constructBuilding(unit.id, tilePos, confirmBuilding.buildingType);
            setConfirmBuilding(null);
          }}
          onClose={() => setConfirmBuilding(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// SELECTED TILE PANEL
// ============================================================================

function SelectedTilePanel({ tile }: { tile: Tile }) {
  const terrainEmoji =
    tile.terrainType === TileType.FOREST
      ? '🌲'
      : tile.terrainType === TileType.MOUNTAIN
        ? '⛰️'
        : tile.terrainType === TileType.PLAINS
          ? '🌾'
          : '🟫';

  const terrainName =
    tile.terrainType === TileType.FOREST
      ? 'Forest'
      : tile.terrainType === TileType.MOUNTAIN
        ? 'Mountain'
        : tile.terrainType === TileType.PLAINS
          ? 'Plains'
          : 'Empty';

  return (
    <div className="hud-info-panel">
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{terrainEmoji}</span>
        <span className="hud-panel-name">{terrainName}</span>
      </div>
      {tile.isStrongholdRuin && (
        <div className="hud-tile-feature">🏚️ Stronghold Ruin</div>
      )}
      {tile.isRuin && !tile.isStrongholdRuin && (
        <div className="hud-tile-feature">🪨 Ruin</div>
      )}
    </div>
  );
}

// ============================================================================
// SELECTED BUILDING PANEL
// ============================================================================

function SelectedBuildingPanel({ building }: { building: Building }) {
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const resources = useGameStore((s) => s.resources);
  const grid = useGameStore((s) => s.grid);
  const gameState = useGameStore((s) => s);
  const recruitUnit = useGameStore((s) => s.recruitUnit);
  const unassignSpecialist = useGameStore((s) => s.unassignSpecialist);
  const unlockedUnits = useGameStore((s) => s.unlockedUnits);
  const showRecruitingScores = useDevOptionsStore((s) => s.showRecruitingScores);

  const [showPicker, setShowPicker] = useState(false);
  const [confirmRecruitUnit, setConfirmRecruitUnit] = useState<UnitType | null>(null);
  const [recruitScoreModal, setRecruitScoreModal] = useState(false);
  const [recruitScores, setRecruitScores] = useState<{ type: UnitType; score: number }[]>([]);
  const [buildingInfoOpen, setBuildingInfoOpen] = useState(false);

  const factionLabel =
    building.faction === Faction.PLAYER
      ? '🔵 Player'
      : building.faction === Faction.ENEMY
        ? '🔴 Enemy'
        : '⚪ Neutral';

  const isPlayerOwned = building.faction === Faction.PLAYER;
  const isDisabled = building.isDisabledForTurns > 0;
  const isUnderAttack = building.wasAttackedLastEnemyTurn;
  const isInteractionBlocked = isDisabled || isUnderAttack;
  const hasCombatStats = building.combatStats !== null;
  const canAttack = hasCombatStats && !building.hasAttackedThisTurn && building.faction !== null;

  // Specialist slot info
  const assignedSpecialist: Specialist | null =
    building.specialistSlot ? specialists[building.specialistSlot] ?? null : null;

  // Recruitment info — filter by tech-unlocked units
  const allRecruitableTypes = BUILDING_RECRUITS[building.type] ?? [];
  const recruitableTypes = allRecruitableTypes.filter((ut) => unlockedUnits.includes(ut));

  // Check whether there is a free tile to spawn a unit (building tile or adjacent)
  const hasSpawnSpace = useMemo(
    () => (recruitableTypes.length > 0 ? hasSpawnSpaceAt(grid, building.position) : false),
    [recruitableTypes.length, building.position, grid]
  );

  const handleUnassign = useCallback(() => {
    unassignSpecialist(building.id);
  }, [unassignSpecialist, building.id]);

  // Global specialist storage (shown on any player stronghold)
  const showGlobalStorage =
    building.type === BuildingType.STRONGHOLD && isPlayerOwned;
  const globalSpecialists: Specialist[] = globalSpecialistStorage
    .map((id) => specialists[id])
    .filter(Boolean) as Specialist[];

  // Production info for resource buildings
  const isMine = building.type === BuildingType.MINE && isPlayerOwned;
  const isWoodcutter = building.type === BuildingType.WOODCUTTER && isPlayerOwned;

  // Population info for FARM, PATRICIANHOUSE, and STRONGHOLD
  const isHousingBuilding =
    isPlayerOwned &&
    (building.type === BuildingType.FARM || building.type === BuildingType.PATRICIANHOUSE || building.type === BuildingType.STRONGHOLD);
  const housingLabel = building.type === BuildingType.FARM ? 'farmers'
    : building.type === BuildingType.PATRICIANHOUSE ? 'nobles'
    : 'farmers + nobles';
  const turnsUntilNextPop =
    isHousingBuilding && building.populationCount < building.populationCap
      ? POPULATION.HOUSE_GROWTH_INTERVAL - building.populationGrowthCounter
      : null;

  // Dev: recruiting scores for enemy LAVA_LAIR / INFERNAL_SANCTUM
  const isEnemyRecruitingBuilding =
    building.faction === Faction.ENEMY &&
    (building.type === BuildingType.LAVALAIR || building.type === BuildingType.INFERNALSANCTUM);

  return (
    <div className="hud-info-panel hud-building-panel">
      {/* Header */}
      <button className="hud-panel-header hud-panel-header-btn" onClick={() => setBuildingInfoOpen(true)} aria-label={`View ${BUILDING_NAME[building.type] ?? building.type} info`}>
        <span className="hud-panel-emoji">{BUILDING_EMOJI[building.type] ?? '?'}</span>
        <span className="hud-panel-name">
          {BUILDING_NAME[building.type] ?? building.type}
          <span className="info-badge" aria-hidden="true">i</span>
        </span>
        <span className="hud-faction-label">{factionLabel}</span>
      </button>

      {/* HP bar for attacking buildings */}
      {hasCombatStats && (
        <div className="hud-hp-row">
          <div className="hud-hp-bar">
            <div className="hud-hp-fill" style={{ width: `${(building.hp / building.maxHp) * 100}%` }} />
          </div>
          <span className="hud-hp-text">
            {building.hp}/{building.maxHp}
          </span>
        </div>
      )}

      {/* Combat stats for attacking buildings */}
      {hasCombatStats && building.combatStats && (
        <div className="hud-unit-stats">
          <span className="hud-stat-label">ATK</span>
          <span className="hud-stat-value">{building.combatStats.attack}</span>
          <span className="hud-stat-label">DEF</span>
          <span className="hud-stat-value">{building.combatStats.defense}</span>
          <span className="hud-stat-label">RNG</span>
          <span className="hud-stat-value">{building.combatStats.attackRange}</span>
          <span className="hud-stat-label">VIS</span>
          <span className="hud-stat-value">{building.discoverRadius}</span>
        </div>
      )}

      {/* Tag pills for attacking buildings */}
      {building.tags.length > 0 && (
        <div className="hud-tag-pills">
          {building.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t)).map((tag) => (
            <span key={tag} className="hud-tag-pill">
              {tag === UnitTag.RANGED ? '◎ Ranged' : tag}
            </span>
          ))}
        </div>
      )}

      {/* Action tags for player-owned attacking buildings */}
      {isPlayerOwned && hasCombatStats && (
        <div className="hud-action-tags">
          <span className={`hud-action-tag ${canAttack ? '' : 'hud-action-used'}`}>Attack</span>
        </div>
      )}

      {/* Capture warning: unit is consumed when capturing this building */}
      {building.consumesUnitOnCapture && (
        <div className="hud-warning hud-capture-warning">
          ⚠️ Capturing consumes the unit!
        </div>
      )}

      {/* Warnings */}
      {isDisabled && (
        <div className="hud-warning hud-disabled-note">
          🚫 Disabled for {building.isDisabledForTurns} turn(s)
        </div>
      )}
      {isUnderAttack && (
        <div className="hud-warning hud-attack-warning">
          ⚔️ Under Attack!
        </div>
      )}

      {/* Crystal Chamber resonance status */}
      {building.type === BuildingType.CRYSTAL_CHAMBER && building.resonanceTurnsRemaining > 0 && (
        <div className="hud-production-row">
          ✨ Resonating — {building.resonanceTurnsRemaining} turn{building.resonanceTurnsRemaining !== 1 ? 's' : ''} remaining
        </div>
      )}

      {/* Dev: Recruiting scores button for enemy LAVA_LAIR / INFERNAL_SANCTUM */}
      {isEnemyRecruitingBuilding && showRecruitingScores && (
        <button
          className="hud-ai-score-btn"
          onClick={() => {
            setRecruitScores(computeRecruitmentScores(gameState, building.id) ?? []);
            setRecruitScoreModal(true);
          }}
        >
          🛠️ Recruit Scores
        </button>
      )}
      {recruitScoreModal && (
        <RecruitScoreModal scores={recruitScores} onClose={() => setRecruitScoreModal(false)} />
      )}

      {/* Production rate for resource buildings */}
      {isMine && (
        <div className="hud-production-row">
          ⛓️ +{RESOURCES.MINE_IRON_PER_TURN} iron per turn
          {isDisabled && <span className="hud-dim"> (paused)</span>}
        </div>
      )}
      {isWoodcutter && (
        <div className="hud-production-row">
          🪵 +{RESOURCES.WOODCUTTER_WOOD_PER_TURN} wood per turn
          {isDisabled && <span className="hud-dim"> (paused)</span>}
        </div>
      )}

      {/* Population info for FARM, PATRICIANHOUSE, and STRONGHOLD */}
      {isHousingBuilding && (
        <div className="hud-production-row">
          {building.type === BuildingType.STRONGHOLD ? (
            <>
              {(() => {
                const { farmerMod, nobleMod } = getStrongholdCapMods(gameState);
                const effectiveFarmerCap = POPULATION.STRONGHOLD_FARMER_CAP + farmerMod;
                const effectiveNobleCap = POPULATION.STRONGHOLD_NOBLE_CAP + nobleMod;
                const farmers = Math.min(building.populationCount, effectiveFarmerCap);
                const nobles = Math.max(0, building.populationCount - effectiveFarmerCap);
                return <>👥 {farmers}/{effectiveFarmerCap} farmers, {nobles}/{effectiveNobleCap} nobles</>;
              })()}
            </>
          ) : (
            <>
              👥 {building.populationCount} / {building.populationCap} {housingLabel}
            </>
          )}
          {turnsUntilNextPop !== null && (
            <span className="hud-dim"> — Next pop in {turnsUntilNextPop} turn(s)</span>
          )}
        </div>
      )}

      {/* Specialist slot */}
      {isPlayerOwned && (
        <div className="hud-specialist-row">
          <span className="hud-label">Specialist:</span>
          {assignedSpecialist ? (
            <div className="hud-specialist-assigned">
              <span className="hud-value">{assignedSpecialist.name}</span>
              <span className="hud-specialist-desc">{assignedSpecialist.description}</span>
              <button
                className="hud-specialist-btn hud-unassign-btn"
                disabled={isInteractionBlocked}
                onClick={handleUnassign}
              >
                Unassign
              </button>
            </div>
          ) : (
            <div className="hud-specialist-empty">
              <span className="hud-dim">Empty</span>
              <button
                className="hud-specialist-btn hud-assign-btn"
                disabled={isInteractionBlocked || globalSpecialistStorage.length === 0}
                onClick={() => setShowPicker(true)}
              >
                Assign Specialist
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recruitment */}
      {recruitableTypes.length > 0 && isPlayerOwned && (
        <div className="hud-recruit-row">
          <span className="hud-label">Recruit:</span>
          {!hasSpawnSpace ? (
            <span className="hud-dim">No space</span>
          ) : (
            <div className="hud-recruit-options">
              {recruitableTypes.map((unitType) => {
                const cost = UNIT_COSTS[unitType];
                const canAffordUnit = cost
                  ? resources.iron >= cost.iron && resources.wood >= cost.wood
                  : false;
                const popCost = (UNIT_POPULATION_COSTS[unitType] as UnitPopulationCost | undefined);
                const hasPopulation = canAffordPopulation(useGameStore.getState(), unitType);
                const canRecruitThisUnit = !isDisabled && hasSpawnSpace && canAffordUnit && hasPopulation;
                // Compute which population resource is actually insufficient for the error message
                let popWarningMsg: string | null = null;
                if (!hasPopulation && canAffordUnit && popCost) {
                  const state = useGameStore.getState();
                  const usage = computePopulationUsage(state);
                  const capacity = computePopulationCapacity(state);
                  const needFarmers = popCost.farmers > 0 && usage.farmersUsed + popCost.farmers > capacity.farmerCapacity;
                  const needNobles = popCost.nobles > 0 && usage.noblesUsed + popCost.nobles > capacity.nobleCapacity;
                  const parts: string[] = [];
                  if (needFarmers) parts.push('farmers — build more Farms');
                  if (needNobles) parts.push('nobles — build more Patrician Houses');
                  if (parts.length > 0) popWarningMsg = `Not enough ${parts.join(' and ')}`;
                }
                return (
                  <div key={unitType} className="hud-recruit-option-wrapper">
                    <button
                      className="info-row-btn"
                      disabled={!canRecruitThisUnit}
                      onClick={() => setConfirmRecruitUnit(unitType)}
                    >
                      <span className="info-row-emoji">{UNIT_EMOJI[unitType] ?? ''}</span>
                      <div className="info-row-body">
                        <div className="info-row-name">
                          {UNIT_NAME[unitType] ?? unitType}
                          <span className="info-badge info-badge--small">i</span>
                        </div>
                        {cost && <div className="info-row-cost">⛓️{cost.iron} 🪵{cost.wood}</div>}
                      </div>
                    </button>
                    {popCost && (popCost.farmers > 0 || popCost.nobles > 0) && (
                      <span className="hud-pop-req">
                        Requires:{' '}
                        {popCost.farmers > 0 && `🌾 ${popCost.farmers} farmer${popCost.farmers > 1 ? 's' : ''}`}
                        {popCost.farmers > 0 && popCost.nobles > 0 && ', '}
                        {popCost.nobles > 0 && `🎖️ ${popCost.nobles} noble${popCost.nobles > 1 ? 's' : ''}`}
                      </span>
                    )}
                    {popWarningMsg && (
                      <span className="hud-pop-warning">{popWarningMsg}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {confirmRecruitUnit && (() => {
        const cost = UNIT_COSTS[confirmRecruitUnit];
        const costLabel = cost ? `⛓️${cost.iron} 🪵${cost.wood}` : undefined;
        return (
          <UnitInfoPopup
            unitType={confirmRecruitUnit}
            costLabel={costLabel}
            actionLabel="Recruit"
            onAction={() => {
              recruitUnit(building.id, confirmRecruitUnit);
              setConfirmRecruitUnit(null);
            }}
            onClose={() => setConfirmRecruitUnit(null)}
          />
        );
      })()}

      {/* Global specialist storage (stronghold only) */}
      {showGlobalStorage && (
        <div className="hud-global-specialists">
          <span className="hud-label">Specialist Storage:</span>
          {globalSpecialists.length === 0 ? (
            <span className="hud-dim"> None</span>
          ) : (
            <ul className="hud-specialist-list">
              {globalSpecialists.map((sp) => (
                <li key={sp.id}>
                  <span className="hud-specialist-storage-name">{sp.name}</span>
                  <span className="hud-specialist-storage-desc"> — {sp.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Specialist picker modal */}
      {showPicker && (
        <SpecialistPickerModal
          buildingId={building.id}
          onClose={() => setShowPicker(false)}
        />
      )}

      {buildingInfoOpen && (
        <BuildingInfoPopup
          buildingType={building.type}
          isReadOnly
          onClose={() => setBuildingInfoOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// BOTTOM BAR
// ============================================================================

function BottomBar() {
  const phase = useGameStore((s) => s.phase);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedTilePos = useGameStore((s) => s.selectedTilePos);
  const units = useGameStore((s) => s.units);
  const buildings = useGameStore((s) => s.buildings);
  const grid = useGameStore((s) => s.grid);
  const endPlayerTurn = useGameStore((s) => s.endPlayerTurn);
  const captureBuilding = useGameStore((s) => s.captureBuilding);
  const isAnimating = useAnimationStore((s) => s.isAnimating);

  const selectedUnit: Unit | undefined = selectedUnitId
    ? units[selectedUnitId]
    : undefined;
  const selectedBuilding: Building | undefined = selectedBuildingId
    ? buildings[selectedBuildingId]
    : undefined;
  const selectedTile: Tile | undefined = selectedTilePos
    ? grid[selectedTilePos.y]?.[selectedTilePos.x]
    : undefined;

  // Find a building co-located with the selected unit that it can attempt to capture
  // Only relevant for player units
  const captureTarget: Building | undefined =
    selectedUnit && selectedUnit.faction === Faction.PLAYER
      ? Object.values(buildings).find(
          (b) =>
            b.position.x === selectedUnit.position.x &&
            b.position.y === selectedUnit.position.y &&
            b.faction !== selectedUnit.faction
        )
      : undefined;

  const captureTargetId = captureTarget?.id;

  const handleCapture = useCallback(() => {
    if (selectedUnitId && captureTargetId) {
      captureBuilding(selectedUnitId, captureTargetId);
    }
  }, [selectedUnitId, captureTargetId, captureBuilding]);

  // Construction panel: show when a player BUILD_AND_CAPTURE unit is selected
  // and its tile has construction options
  const showConstruction = useGameStore((s) => {
    if (!selectedUnit || selectedUnit.faction !== Faction.PLAYER) return false;
    if (!selectedUnit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
    if (!canUnitConstruct(selectedUnit)) return false;
    const options = getConstructionOptionsForTile(s, selectedUnit.position);
    return options.length > 0;
  });

  const isPlayerTurn = phase === GamePhase.PLAYER_TURN;

  return (
    <div className="hud-bottom-bar">
      {/* Info panels */}
      {selectedUnit && (
        <SelectedUnitPanel
          unit={selectedUnit}
          captureTarget={captureTarget}
          onCapture={handleCapture}
        />
      )}
      {/* Construction panel for BUILD_AND_CAPTURE units on constructable tiles */}
      {selectedUnit && showConstruction && (
        <ConstructionPanel
          unit={selectedUnit}
          tilePos={selectedUnit.position}
        />
      )}
      {selectedBuilding && !selectedUnit && (
        <SelectedBuildingPanel building={selectedBuilding} />
      )}
      {selectedTile && !selectedUnit && !selectedBuilding && (
        <SelectedTilePanel tile={selectedTile} />
      )}

      {/* End Turn button */}
      {isPlayerTurn && !isAnimating && (
        <button className="hud-end-turn-btn" onClick={endPlayerTurn}>
          End Turn ⏭️
        </button>
      )}
    </div>
  );
}

// ============================================================================
// GAME OVER / VICTORY OVERLAYS
// ============================================================================

function EndGameStats({ stats }: { stats: GameStats }) {
  return (
    <div className="hud-endgame-stats">
      <div className="hud-endgame-stats-grid">
        <span className="hud-endgame-stat-label">⚔️ Units killed</span>
        <span className="hud-endgame-stat-value">{stats.unitsKilled}</span>
        <span className="hud-endgame-stat-label">💀 Units lost</span>
        <span className="hud-endgame-stat-value">{stats.unitsLost}</span>
        <span className="hud-endgame-stat-label">🗡️ Damage dealt</span>
        <span className="hud-endgame-stat-value">{stats.damageDealt}</span>
        <span className="hud-endgame-stat-label">🛡️ Damage received</span>
        <span className="hud-endgame-stat-value">{stats.damageReceived}</span>
        <span className="hud-endgame-stat-label">🪖 Units recruited</span>
        <span className="hud-endgame-stat-value">{stats.unitsRecruited}</span>
        <span className="hud-endgame-stat-label">🏗️ Buildings constructed</span>
        <span className="hud-endgame-stat-value">{stats.buildingsConstructed}</span>
        <span className="hud-endgame-stat-label">🔬 Techs unlocked</span>
        <span className="hud-endgame-stat-value">{stats.techsUnlocked}</span>
        <span className="hud-endgame-stat-label">💥 Enemy buildings destroyed</span>
        <span className="hud-endgame-stat-value">{stats.enemyBuildingsDestroyed}</span>
        <span className="hud-endgame-stat-label">🚩 Enemy buildings captured</span>
        <span className="hud-endgame-stat-value">{stats.enemyBuildingsCaptured}</span>
        <span className="hud-endgame-stat-label">🏚️ Buildings destroyed by enemy</span>
        <span className="hud-endgame-stat-value">{stats.buildingsDestroyedByEnemy}</span>
        <span className="hud-endgame-stat-label">🔴 Buildings captured by enemy</span>
        <span className="hud-endgame-stat-value">{stats.buildingsCapturedByEnemy}</span>
        <span className="hud-endgame-stat-label">🌋 Buildings destroyed by lava</span>
        <span className="hud-endgame-stat-value">{stats.buildingsDestroyedByLava}</span>
      </div>
    </div>
  );
}

function GameOverOverlay() {
  const turn = useGameStore((s) => s.turn);
  const gameStats = useGameStore((s) => s.gameStats);
  const initNewGame = useGameStore((s) => s.initNewGame);
  const difficulty = useGameStore((s) => s.difficulty);
  const gameOverCause = useGameStore((s) => s.gameOverCause ?? null);

  const causeText =
    gameOverCause === 'LAVA'
      ? 'The last Stronghold was consumed by the rising lava.'
      : gameOverCause === 'ENEMY'
      ? 'The last Stronghold fell to the Volcael.'
      : null;

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-defeat">💀 DEFEATED</h1>
        <p className="hud-overlay-sub">You survived {turn} turns</p>
        {causeText && <p className="hud-overlay-cause">{causeText}</p>}
        <EndGameStats stats={gameStats} />
        <button className="hud-play-again-btn" onClick={() => initNewGame(difficulty)}>
          🔄 Play Again
        </button>
      </div>
    </div>
  );
}

function VictoryOverlay() {
  const turn = useGameStore((s) => s.turn);
  const gameStats = useGameStore((s) => s.gameStats);
  const initNewGame = useGameStore((s) => s.initNewGame);
  const difficulty = useGameStore((s) => s.difficulty);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-victory">🏆 VICTORY</h1>
        <p className="hud-overlay-sub">Completed in {turn} turns</p>
        <EndGameStats stats={gameStats} />
        <button className="hud-play-again-btn" onClick={() => initNewGame(difficulty)}>
          🔄 Play Again
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// GAME INTRO POPUP
// ============================================================================

function GameIntroPopup({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="hud-intro-overlay">
      <div className="hud-intro-card">
        <div className="hud-intro-icon">🌋</div>
        <p className="hud-intro-text">
          Lava devours the land at your back. The Volcael advance from the north, racing it.<br />
          Push forward — raze every Infernal Sanctum. If your last Stronghold falls, the war is lost.
        </p>
        <button className="hud-intro-cta" onClick={onDismiss}>
          To the Walls!
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ZONE CLEARED POPUP
// ============================================================================

function ZoneClearedPopup() {
  const active = useZoneClearedStore((s) => s.active);
  const zone = useZoneClearedStore((s) => s.zone);
  const dismiss = useZoneClearedStore((s) => s.dismiss);

  if (!active) return null;

  return (
    <div className="hud-zone-cleared-overlay">
      <div className="hud-zone-cleared-card">
        <span className="hud-zone-cleared-label">ZONE {zone}</span>
        <span className="hud-zone-cleared-title">CLEARED</span>
        <button className="hud-zone-cleared-btn" onClick={dismiss}>
          Press On
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// TURN ANNOUNCEMENT POPUP
// ============================================================================

function TurnAnnouncementPopup({ turn }: { turn: number }) {
  const totalMs = UI.TURN_POPUP_DISPLAY_MS + UI.TURN_POPUP_FADE_MS;
  return (
    <div
      className="hud-turn-popup"
      style={{ animationDuration: `${totalMs}ms` }}
    >
      Turn {turn}
    </div>
  );
}

// ============================================================================
// TECH TREE DYNAMIC LAYOUT
// ============================================================================

const NODE_W = 120;
const NODE_H = 52;

/**
 * Compute tech-tree node positions dynamically from the TECH_TREE definition.
 *
 * Layout rules:
 *  - The root node (requires=[]) sits at the centre.
 *  - Each dependency level forms a ring at increasing radius.
 *  - Children of a node are placed at equal angular intervals centred on the
 *    parent's angle, each receiving an equal share of the parent's arc.
 *  - Radii are sized so that the minimum angular gap at every level is wide
 *    enough to prevent node overlap.
 */
function computeTechTreeLayout(
  tree: readonly { id: string; requires: string[] }[],
  nodeW: number,
  nodeH: number,
): { positions: Record<string, { x: number; y: number }>; canvasW: number; canvasH: number } {
  // ── Build tree structure ──────────────────────────────
  // Each node uses its first `requires` entry as its single parent.
  // The TECH_TREE is a strict tree (no multi-parent DAG nodes).
  const childrenOf = new Map<string, string[]>();
  let rootId = '';
  for (const node of tree) {
    if (node.requires.length === 0) {
      rootId = node.id;
    } else {
      const parent = node.requires[0];
      const list = childrenOf.get(parent);
      if (list) list.push(node.id);
      else childrenOf.set(parent, [node.id]);
    }
  }
  if (!rootId) return { positions: {}, canvasW: 0, canvasH: 0 };

  // ── BFS for depth ─────────────────────────────────────
  const depthOf = new Map<string, number>();
  depthOf.set(rootId, 0);
  const queue = [rootId];
  let maxDepth = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depthOf.get(id)!;
    if (d > maxDepth) maxDepth = d;
    for (const child of (childrenOf.get(id) ?? [])) {
      depthOf.set(child, d + 1);
      queue.push(child);
    }
  }

  // ── Assign angular arcs ───────────────────────────────
  // Each node owns an arc of the circle. Children split their parent's arc
  // into equal portions so siblings are equally distributed from the parent.
  const nodeArc = new Map<string, { start: number; size: number }>();

  // Centre the first tier-1 child at −π/2 (top of screen).
  const tier1 = childrenOf.get(rootId) ?? [];
  const childArc0 = tier1.length > 0 ? (2 * Math.PI) / tier1.length : 0;
  const rootStart = -Math.PI / 2 - childArc0 / 2;
  nodeArc.set(rootId, { start: rootStart, size: 2 * Math.PI });

  function assignArcs(parentId: string): void {
    const children = childrenOf.get(parentId) ?? [];
    if (children.length === 0) return;
    const pArc = nodeArc.get(parentId)!;
    const slice = pArc.size / children.length;
    for (let i = 0; i < children.length; i++) {
      nodeArc.set(children[i], { start: pArc.start + i * slice, size: slice });
      assignArcs(children[i]);
    }
  }
  assignArcs(rootId);

  // Each node's angle = centre of its arc
  const angleOf = new Map<string, number>();
  for (const [id, arc] of nodeArc) {
    angleOf.set(id, arc.start + arc.size / 2);
  }

  // ── Compute radii per depth level ─────────────────────
  // Ensure adjacent nodes at each level don't overlap.
  const nodeDiag = Math.sqrt(nodeW * nodeW + nodeH * nodeH);
  const minSpacing = nodeDiag + 24;
  const baseRadius = 200;
  const radiusStep = 180;

  const radii: number[] = [0]; // depth 0 = centre
  for (let d = 1; d <= maxDepth; d++) {
    // Sort angles of all nodes at this depth to find the tightest gap.
    const angles = tree
      .filter((n) => depthOf.get(n.id) === d)
      .map((n) => angleOf.get(n.id)!)
      .sort((a, b) => a - b);

    let minGap = 2 * Math.PI;
    for (let i = 0; i < angles.length; i++) {
      const next = (i + 1) % angles.length;
      let gap = angles[next] - angles[i];
      if (gap <= 0) gap += 2 * Math.PI;
      if (gap < minGap) minGap = gap;
    }

    // chord ≈ r·gap for small gaps; exact: 2r·sin(gap/2)
    const rFromGap = minGap > 0 ? minSpacing / (2 * Math.sin(minGap / 2)) : baseRadius;
    const rFromStep = baseRadius + radiusStep * (d - 1);
    radii.push(Math.max(rFromGap, rFromStep));
  }

  // ── Convert to pixel positions ────────────────────────
  const rawPositions: Record<string, { x: number; y: number }> = {};
  for (const node of tree) {
    const d = depthOf.get(node.id)!;
    const r = radii[d];
    const a = angleOf.get(node.id)!;
    rawPositions[node.id] = { x: r * Math.cos(a), y: r * Math.sin(a) };
  }

  // Shift so every top-left corner is positive, plus padding.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of Object.values(rawPositions)) {
    if (p.x - nodeW / 2 < minX) minX = p.x - nodeW / 2;
    if (p.y - nodeH / 2 < minY) minY = p.y - nodeH / 2;
    if (p.x + nodeW / 2 > maxX) maxX = p.x + nodeW / 2;
    if (p.y + nodeH / 2 > maxY) maxY = p.y + nodeH / 2;
  }

  const padding = 40;
  // Extra bottom padding so nodes aren't hidden behind the detail sheet.
  const bottomPad = 300;
  const offX = -minX + padding;
  const offY = -minY + padding;

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of Object.entries(rawPositions)) {
    positions[id] = {
      x: Math.round(p.x + offX - nodeW / 2),
      y: Math.round(p.y + offY - nodeH / 2),
    };
  }

  const canvasW = Math.ceil(maxX - minX + 2 * padding);
  const canvasH = Math.ceil(maxY - minY + padding + bottomPad);

  return { positions, canvasW, canvasH };
}

// Compute layout once (TECH_TREE is a module-level constant).
const TECH_LAYOUT = computeTechTreeLayout(TECH_TREE, NODE_W, NODE_H);
const TECH_NODE_POS = TECH_LAYOUT.positions;
const TECH_CANVAS_W = TECH_LAYOUT.canvasW;
const TECH_CANVAS_H = TECH_LAYOUT.canvasH;

function nodeCentre(id: string): { x: number; y: number } {
  const pos = TECH_NODE_POS[id];
  if (!pos) return { x: 0, y: 0 };
  return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 };
}

// ============================================================================
// TECH TREE OVERLAY
// ============================================================================

function TechTreeOverlay({ onClose }: { onClose: () => void }) {
  const techNodes = useGameStore((s) => s.techNodes);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const unlockTech = useGameStore((s) => s.unlockTech);
  const getAvailableTechs = useGameStore((s) => s.getAvailableTechs);

  const [selectedId, setSelectedId] = useState<TechId | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [infoUnitType, setInfoUnitType] = useState<UnitType | null>(null);
  const [infoBuildingType, setInfoBuildingType] = useState<BuildingType | null>(null);
  const [infoUnitTag, setInfoUnitTag] = useState<UnitTag | null>(null);

  const availableIds: TechId[] = useMemo(() => {
    // Depend on techNodes + arcaneCrystals to re-derive when state changes
    return getAvailableTechs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techNodes, arcaneCrystals, getAvailableTechs]);

  const availableSet = useMemo(() => new Set(availableIds), [availableIds]);

  const selectedDef = useMemo(
    () => (selectedId ? TECH_TREE.find((d) => d.id === selectedId) ?? null : null),
    [selectedId],
  );

  const selectedState: 'unlocked' | 'available' | 'locked' = useMemo(() => {
    if (!selectedId) return 'locked';
    if (techNodes[selectedId]?.unlocked) return 'unlocked';
    if (availableSet.has(selectedId)) return 'available';
    return 'locked';
  }, [selectedId, techNodes, availableSet]);

  // Unmet prerequisites for the selected node
  const unmetPrereqs = useMemo(() => {
    if (!selectedDef) return [];
    return selectedDef.requires
      .filter((reqId) => !techNodes[reqId]?.unlocked)
      .map((reqId) => {
        const def = TECH_TREE.find((d) => d.id === reqId);
        return def?.name ?? reqId;
      });
  }, [selectedDef, techNodes]);

  const handleResearch = useCallback(() => {
    if (selectedId && selectedDef && arcaneCrystals >= (selectedDef.cost ?? 1) && availableSet.has(selectedId)) {
      unlockTech(selectedId);
    }
  }, [selectedId, selectedDef, arcaneCrystals, availableSet, unlockTech]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // On open, scroll the canvas so the root node is centered in the viewport
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rootCenter = nodeCentre(TECH_TREE.find((d) => d.requires.length === 0)?.id ?? '');
    el.scrollLeft = rootCenter.x - el.clientWidth / 2;
    el.scrollTop = rootCenter.y - el.clientHeight / 2;
  }, []);

  // Canvas dimensions computed from the dynamic layout
  const canvasW = TECH_CANVAS_W;
  const canvasH = TECH_CANVAS_H;

  return (
    <div className="tech-overlay">
      {/* Header */}
      <div className="tech-overlay-header">
        <span>🔬 Tech Tree</span>
        {arcaneCrystals > 0 && (
          <span className="tech-overlay-picks">💎 {arcaneCrystals} crystal{arcaneCrystals > 1 ? 's' : ''} available</span>
        )}
        <button className="tech-overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Canvas area */}
      <div className="tech-canvas-scroll" ref={scrollRef} onClick={() => setSelectedId(null)}>
        <div className="tech-canvas" style={{ width: canvasW, height: canvasH }}>
          {/* Edges (SVG behind nodes) */}
          <svg className="tech-edges" width={canvasW} height={canvasH}>
            {TECH_TREE.flatMap((def) =>
              def.requires.map((reqId) => {
                const from = nodeCentre(reqId);
                const to = nodeCentre(def.id);
                return (
                  <line
                    key={`${reqId}-${def.id}`}
                    x1={from.x} y1={from.y}
                    x2={to.x}   y2={to.y}
                    className="tech-edge"
                  />
                );
              })
            )}
          </svg>

          {/* Nodes */}
          {TECH_TREE.map((def) => {
            const pos = TECH_NODE_POS[def.id];
            if (!pos) return null;
            const isUnlocked = techNodes[def.id]?.unlocked ?? false;
            const isAvailable = availableSet.has(def.id);
            const stateClass = isUnlocked
              ? 'tech-node--unlocked'
              : isAvailable
                ? 'tech-node--available'
                : 'tech-node--locked';

            return (
              <div
                key={def.id}
                className={`tech-node ${stateClass} ${selectedId === def.id ? 'tech-node--selected' : ''}`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: NODE_W,
                  height: NODE_H,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(def.id);
                }}
              >
                <span className="tech-node-name">{def.name}</span>
                {isAvailable && <span className="tech-node-cost">💎 {def.cost ?? 1}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail sheet */}
      <div className={`tech-detail-sheet ${selectedDef ? 'tech-detail-sheet--open' : ''}`}>
        {selectedDef && (
          <>
            <div className="tech-detail-title">
              {selectedDef.name}
              {selectedState === 'unlocked' && <span className="tech-detail-label"> (completed)</span>}
              {selectedState === 'locked' && <span className="tech-detail-label"> (locked)</span>}
            </div>

            {selectedState === 'unlocked' && (
              <p className="tech-detail-text">You have already researched this technology.</p>
            )}
            {selectedState === 'locked' && unmetPrereqs.length > 0 && (
              <p className="tech-detail-text">Requires: {unmetPrereqs.join(', ')}</p>
            )}
            {selectedState !== 'unlocked' && (
              <p className="tech-detail-text">This tech will enable the following:</p>
            )}

            <div className="tech-detail-effects">
              {selectedDef.effects.map((e, i) => {
                if (e.type === TechEffectType.UNLOCK_UNIT) {
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoUnitType(e.unitType)}>
                      <span className="tech-effect-tile-emoji">{UNIT_EMOJI[e.unitType] ?? '?'}</span>
                      <span className="tech-effect-tile-name">{UNIT_NAME[e.unitType] ?? e.unitType}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                if (e.type === TechEffectType.UNLOCK_BUILDING) {
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoBuildingType(e.buildingType)}>
                      <span className="tech-effect-tile-emoji">{BUILDING_EMOJI[e.buildingType] ?? '?'}</span>
                      <span className="tech-effect-tile-name">{BUILDING_NAME[e.buildingType] ?? e.buildingType}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                if (e.type === TechEffectType.GRANT_UNIT_TAG) {
                  const tagLabel = TAG_INFO[e.tag]?.label ?? e.tag;
                  const unitLabel = UNIT_NAME[e.unitType] ?? e.unitType;
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoUnitTag(e.tag)}>
                      <span className="tech-effect-tile-emoji">{TAG_EMOJI[e.tag] ?? '✦'}</span>
                      <span className="tech-effect-tile-name">{unitLabel} gains {tagLabel}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                return (
                  <span key={i} className="tech-detail-effect-chip">{renderEffect(e)}</span>
                );
              })}
            </div>

            <div className="tech-detail-actions">
              {selectedState === 'available' && (() => {
                const techCost = selectedDef?.cost ?? 1;
                const canAfford = arcaneCrystals >= techCost;
                return (
                  <button
                    className={`tech-detail-btn tech-detail-btn--primary ${!canAfford ? 'tech-detail-btn--disabled' : ''}`}
                    onClick={handleResearch}
                    disabled={!canAfford}
                    title={!canAfford ? `Need ${techCost} crystals (have ${arcaneCrystals})` : undefined}
                  >
                    {canAfford ? `RESEARCH (💎 ${techCost})` : `RESEARCH (need 💎 ${techCost})`}
                  </button>
                );
              })()}
              <button
                className="tech-detail-btn tech-detail-btn--secondary"
                onClick={() => setSelectedId(null)}
              >
                BACK
              </button>
            </div>
          </>
        )}
      </div>
      {infoUnitType && (
        <UnitInfoPopup
          unitType={infoUnitType}
          onClose={() => setInfoUnitType(null)}
          isReadOnly
        />
      )}
      {infoBuildingType && (
        <BuildingInfoPopup
          buildingType={infoBuildingType}
          onClose={() => setInfoBuildingType(null)}
          isReadOnly
        />
      )}
      {infoUnitTag && (
        <TagPopup
          tag={infoUnitTag}
          onClose={() => setInfoUnitTag(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// ARCANE CRYSTAL TOAST
// ============================================================================

function ArcaneCrystalToast() {
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const prevCrystalsRef = useRef(arcaneCrystals);
  const toastRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (arcaneCrystals > prevCrystalsRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      const el = toastRef.current;
      if (el) el.style.display = 'block';
      timerRef.current = setTimeout(() => {
        if (el) el.style.display = 'none';
      }, 3000);
    }
    prevCrystalsRef.current = arcaneCrystals;
  }, [arcaneCrystals]);

  return (
    <div ref={toastRef} className="tech-toast" style={{ display: 'none' }}>
      💎 New arcane crystal available!
    </div>
  );
}

// ============================================================================
// MAIN HUD COMPONENT
// ============================================================================

export default function HUD({ showTurnPopup }: { showTurnPopup?: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [showTechTree, setShowTechTree] = useState(false);
  // Track crystals at the moment the player last closed the tech tree.
  // Initialised to -1 so the badge shows from game start if there is an affordable tech.
  const [crystalsAtLastTechTreeClose, setCrystalsAtLastTechTreeClose] = useState(-1);
  // Used to detect when a new game starts (turn resets to 1) so badge tracking resets.
  const [prevTurn, setPrevTurn] = useState(turn);

  // Derived-state update: when turn resets to 1 from a higher value, a new game has
  // started. Reset crystalsAtLastTechTreeClose so the badge shows on the fresh game.
  // Setting state during render (not in an effect) is the React-recommended pattern
  // for adjusting state when a prop/upstream value changes.
  if (prevTurn !== turn) {
    setPrevTurn(turn);
    if (turn === 1 && prevTurn > 1) {
      setCrystalsAtLastTechTreeClose(-1);
    }
  }

  const hasAffordableTech = useGameStore((s) => {
    const available = getAvailableTechsLogic(s);
    return available.some((techId) => {
      const def = TECH_TREE.find((d) => d.id === techId);
      return s.arcaneCrystals >= (def?.cost ?? 1);
    });
  });

  const handleIntroDismiss = useCallback(() => {
    setHasSeenIntro(true);
  }, []);

  const handleCloseTechTree = useCallback(() => {
    setShowTechTree(false);
    setCrystalsAtLastTechTreeClose(arcaneCrystals);
  }, [arcaneCrystals]);

  const isPlayerTurn = phase === GamePhase.PLAYER_TURN;
  // Badge shows when crystals have been gained since the player last closed the tech tree
  // AND there is at least one affordable unlocked tech available.
  // crystalsAtLastTechTreeClose of -1 means the tech tree has never been closed this
  // session, so any positive crystal count triggers the badge.
  const showTechBadge = isPlayerTurn && hasAffordableTech && arcaneCrystals > crystalsAtLastTechTreeClose;

  return (
    <>
      {!hasSeenIntro && <GameIntroPopup onDismiss={handleIntroDismiss} />}
      <ZoneClearedPopup />
      <TopBar
        onOpenTechTree={() => setShowTechTree(true)}
        showTechButton={isPlayerTurn}
        arcaneCrystals={arcaneCrystals}
        showTechBadge={showTechBadge}
      />
      <BottomBar />
      <ArcaneCrystalToast />
      {showTechTree && <TechTreeOverlay onClose={handleCloseTechTree} />}
      {phase === GamePhase.GAME_OVER && <GameOverOverlay />}
      {phase === GamePhase.VICTORY && <VictoryOverlay />}
      {showTurnPopup && <TurnAnnouncementPopup turn={turn} />}
    </>
  );
}
