/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { useDevOptionsStore } from '../devOptionsStore';
import { useSoundOptionsStore } from '../soundOptionsStore';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, RESOURCES, POPULATION, XP, TECH_TREE, ABILITIES, DIFFICULTY_MULTIPLIER, getLavaAdvanceInterval, TAG_INFO, TAG_STAT_EFFECTS, computeResearchCost, SPELL_DEFINITIONS, TERRAIN_TAG_INFO, RAGE_ATK_PER_ADJACENT, RAGE_MAX_ADJACENT_COUNT } from '../gameConfig';
import { UI } from '../uiConfig';
import type { UnitPopulationCost, TechId } from '../types';
import {
  hasSpawnSpaceAt,
  computePopulationUsage,
  computePopulationCapacity,
  canAffordPopulation,
  computeResourceIncome,
  computeSpecialistUpkeep,
  computeRecruitmentBuildingUsage,
  computeResourceIncomeBreakdown,
  computeCrystalIncomePerTurn,
} from '../resourceSystem';
import {
  getConstructionOptionsForTile,
  getConversionTargetsForTile,
  canUnitConvertBuilding,
} from '../constructionSystem';
import { computeLevelFromXp } from '../levelSystem';
import { computeUnitAiScores, computeRecruitmentScores, type ScoredAction } from '../enemySystem';
import { renderEffect, getStrongholdEffectiveCap, getAvailableTechs as getAvailableTechsLogic, getCostMods } from '../techSystem';
import {
  Faction,
  GamePhase,
  UnitType,
  UnitTag,
  BuildingType,
  TileType,
  TileStatus,
  TerrainTag,
  TechEffectType,
  TechFlag,
  Difficulty,
  SpellId,
  type Building,
  type Unit,
  type Specialist,
  type Position,
  type Tile,
  type GameStats,
} from '../types';
import { canUnitMove, canUnitAttack, canUnitCapture, canUnitConstruct, canUnitHeal, getHealTargets, canUnitFieldwork, getNorthermostPlayerY, canUnitCast } from '../unitActions';
import { getPhalanxAttackBonus, getPhalanxDefenseBonus } from '../combatSystem';
import { isTileWithinEdgeCircleRange } from '../rangeUtils';
import { getTagsFromActiveSpecialists } from '../specialistSystem';
import { useZoneClearedStore } from '../zoneClearedStore';
import { useCaveScreamsStore } from '../caveScreamsStore';
import { useSpecialistHireStore } from '../specialistHireStore';
import './HUD.css';

// ============================================================================
// EMOJI LOOKUP TABLES
// ============================================================================

const UNIT_EMOJI: Record<string, string> = {
  [UnitType.SPEARMAN]: '⚔️',
  [UnitType.SWORDSMAN]: '🗡️',
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
  [UnitType.CAVE_MONSTER]: '🐉',
  [UnitType.MAGE]: '🧙',
  [UnitType.EMBER_DEMON]: '😈',
  [UnitType.SKELETON]: '💀',
};

const UNIT_NAME: Record<string, string> = {
  [UnitType.SPEARMAN]: 'Spearman',
  [UnitType.SWORDSMAN]: 'Swordsman',
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
  [UnitType.CAVE_MONSTER]: 'Cave Monster',
  [UnitType.MAGE]: 'Mage',
  [UnitType.EMBER_DEMON]: 'Ember Demon',
  [UnitType.SKELETON]: 'Skeleton',
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
  [BuildingType.CRYSTAL_TOWER]: '🔮',
  [BuildingType.GRAVESTONE]: '🪦',
  [BuildingType.GRAVE_TRAP]: '☠️',
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
  [BuildingType.CRYSTAL_TOWER]: 'Crystal Tower',
  [BuildingType.GRAVESTONE]: 'Gravestone',
  [BuildingType.GRAVE_TRAP]: 'Grave Trap',
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
  [UnitTag.PASSIVE]:         '🕊️',
  [UnitTag.BLOODLUST]:       '🩸',
  [UnitTag.SPLASH]:          '💦',
  [UnitTag.READY]:           '⚡',
  [UnitTag.REVIVABLE]:       '🔮',
  [UnitTag.LEAVES_GRAVESTONE]: '🪦',
};

/** Maps recruitment buildings to their recruitable unit types */
const BUILDING_RECRUITS: Partial<Record<string, UnitType[]>> = {
  [BuildingType.BARRACKS]: [UnitType.SPEARMAN, UnitType.SWORDSMAN],
  [BuildingType.ARCHER_CAMP]: [UnitType.ARCHER],
  [BuildingType.RIDER_CAMP]: [UnitType.RIDER],
  [BuildingType.SIEGE_CAMP]: [UnitType.SIEGE],
  [BuildingType.STRONGHOLD]: [UnitType.SCOUT, UnitType.GUARD],
  [BuildingType.CRYSTAL_CHAMBER]: [UnitType.MAGE],
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
  const debugApplyTileStatus = useGameStore((s) => s.debugApplyTileStatus);
  const debugClearTileStatus = useGameStore((s) => s.debugClearTileStatus);
  const selectedTilePos = useGameStore((s) => s.selectedTilePos);
  const [devStatsOpen, setDevStatsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
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
            <div className="hud-dev-overlay-section-title">Tile Status (selected tile)</div>
            <div style={{ fontSize: '0.8em', opacity: 0.7, marginBottom: 4 }}>
              {selectedTilePos ? `Selected: (${selectedTilePos.x}, ${selectedTilePos.y})` : 'No tile selected'}
            </div>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={() => debugApplyTileStatus(TileStatus.CORRUPTED)}>☠️ Apply CORRUPTED</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={() => debugApplyTileStatus(TileStatus.FROZEN)}>❄️ Apply FROZEN</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={() => debugApplyTileStatus(TileStatus.BURNING)}>🔥 Apply BURNING</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={debugClearTileStatus}>🧹 Clear Status</button>
          </div>
        </div>
      </div>
      {devStatsOpen && <DevStatsOverlay onClose={() => setDevStatsOpen(false)} />}
    </>,
    document.body,
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

// ============================================================================
// OPTIONS OVERLAY
// ============================================================================

function OptionsOverlay({ onClose }: { onClose: () => void }) {
  const volume = useSoundOptionsStore((s) => s.volume);
  const muted = useSoundOptionsStore((s) => s.muted);
  const setVolume = useSoundOptionsStore((s) => s.setVolume);
  const setMuted = useSoundOptionsStore((s) => s.setMuted);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="hud-dev-overlay-backdrop" onClick={onClose}>
      <div className="hud-dev-overlay hud-options-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="hud-dev-overlay-header">
          <span>⚙️ Options</span>
          <button className="hud-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="hud-dev-overlay-body">
          <div className="hud-dev-overlay-section-title">Sound</div>
          <div className="hud-options-volume-row">
            <span className="hud-options-volume-label">🔊 Volume</span>
            <input
              type="range"
              className={`hud-options-volume-slider${muted ? ' hud-options-volume-slider--muted' : ''}`}
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
              className={`hud-options-mute-btn${muted ? ' hud-options-mute-btn--muted' : ''}`}
              onClick={() => setMuted(!muted)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GameMenu() {
  const [open, setOpen] = useState(false);
  const [devOptionsOverlayOpen, setDevOptionsOverlayOpen] = useState(false);
  const [difficultyOverlayOpen, setDifficultyOverlayOpen] = useState(false);
  const [optionsOverlayOpen, setOptionsOverlayOpen] = useState(false);
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
              onClick={() => { setOpen(false); setOptionsOverlayOpen(true); }}
            >
              ⚙️ Options
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
      {optionsOverlayOpen && (
        <OptionsOverlay onClose={() => setOptionsOverlayOpen(false)} />
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
  const resources = useGameStore((s) => s.resources);
  const ember = useGameStore((s) => s.ember);
  const turnsUntilLavaAdvance = useGameStore((s) => s.turnsUntilLavaAdvance);

  // Population usage and capacity (both live) — select primitives to avoid infinite re-render
  const farmersUsed = useGameStore((s) => computePopulationUsage(s).farmersUsed);
  const noblesUsed = useGameStore((s) => computePopulationUsage(s).noblesUsed);
  const farmerCapacity = useGameStore((s) => computePopulationCapacity(s).farmerCapacity);
  const nobleCapacity = useGameStore((s) => computePopulationCapacity(s).nobleCapacity);

  // Resource income per turn (gross) and specialist upkeep; net shown in HUD
  const ironPerTurn = useGameStore((s) => computeResourceIncome(s).ironPerTurn);
  const woodPerTurn = useGameStore((s) => computeResourceIncome(s).woodPerTurn);
  const ironUpkeep = useGameStore((s) => computeSpecialistUpkeep(s).ironUpkeep);
  const woodUpkeep = useGameStore((s) => computeSpecialistUpkeep(s).woodUpkeep);

  // Specialist slots
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const specialistSlotCap = useGameStore((s) => s.specialistSlotCap);
  const dismissSpecialist = useGameStore((s) => s.dismissSpecialist);

  // Which specialist slot's info popup is currently open (index into slots)
  const [openSpecialistInfo, setOpenSpecialistInfo] = useState<string | null>(null);
  const openSpec = openSpecialistInfo ? specialists[openSpecialistInfo] : null;

  // Resource info popup state: 'iron' | 'wood' | 'crystal' | null
  const [resourcePopup, setResourcePopup] = useState<'iron' | 'wood' | 'crystal' | null>(null);

  // Ember info popup
  const [emberPopupOpen, setEmberPopupOpen] = useState(false);

  // Crystal income per turn
  const crystalsPerTurn = useGameStore((s) => computeCrystalIncomePerTurn(s).crystalsPerTurn);

  /** Renders a net-income badge (green for positive, red for negative, hidden for zero). */
  const NetIncomeBadge = ({ gross, upkeep }: { gross: number; upkeep: number }) => {
    const net = gross - upkeep;
    if (net === 0) return null;
    const formatted = Number.isInteger(net) ? String(net) : net.toFixed(1);
    return (
      <span className={net > 0 ? 'hud-income' : 'hud-income-negative'}>
        ({net > 0 ? '+' : ''}{formatted})
      </span>
    );
  };

  return (
    <div className="hud-top-bar">
      <button className="hud-stat hud-stat--clickable" onClick={() => setResourcePopup('iron')}>⛓️ {resources.iron}<NetIncomeBadge gross={ironPerTurn} upkeep={ironUpkeep} /></button>
      <button className="hud-stat hud-stat--clickable" onClick={() => setResourcePopup('wood')}>🪵 {resources.wood}<NetIncomeBadge gross={woodPerTurn} upkeep={woodUpkeep} /></button>
      <span className="hud-stat">🌾 {farmersUsed}/{farmerCapacity}</span>
      <span className="hud-stat">🎖️ {noblesUsed}/{nobleCapacity}</span>
      <button className="hud-stat hud-stat--clickable" onClick={() => setEmberPopupOpen(true)}>🔥 Ember {ember}</button>
      <span className="hud-stat">🌋 Lava in {turnsUntilLavaAdvance}</span>
      <button className="hud-stat hud-stat--clickable" onClick={() => setResourcePopup('crystal')}>
        💎 {arcaneCrystals}{crystalsPerTurn > 0 && <span className="hud-income">(+{crystalsPerTurn})</span>}
      </button>
      {showTechButton && (
        <button className={`hud-tech-tree-btn${showTechBadge ? ' hud-tech-tree-btn--notify' : ''}`} onClick={onOpenTechTree}>
          🔬 Tech Tree
          {showTechBadge && <span className="hud-tech-tree-badge">!</span>}
        </button>
      )}
      <div className="hud-specialist-slots">
        {Array.from({ length: specialistSlotCap }, (_, i) => {
          const specId = globalSpecialistStorage[i];
          const spec = specId ? specialists[specId] : null;
          if (spec) {
            return (
              <button
                key={i}
                className={`hud-specialist-slot hud-specialist-slot--filled${spec.dormant ? ' hud-specialist-slot--dormant' : ''}`}
                onClick={() => setOpenSpecialistInfo(spec.id)}
                title={`${spec.name} — click for info`}
              >
                <span className="hud-specialist-slot-name">🧙 {spec.name}</span>
              </button>
            );
          }
          return (
            <div key={i} className="hud-specialist-slot hud-specialist-slot--empty">
              <span className="hud-specialist-slot-placeholder">—</span>
            </div>
          );
        })}
      </div>
      {openSpec && (
        <SpecialistInfoPopup
          specialist={openSpec}
          onClose={() => setOpenSpecialistInfo(null)}
          onDismiss={() => { dismissSpecialist(openSpec.id); setOpenSpecialistInfo(null); }}
        />
      )}
      {resourcePopup && (
        <ResourceInfoPopup
          resourceType={resourcePopup}
          current={resourcePopup === 'iron' ? resources.iron : resourcePopup === 'wood' ? resources.wood : arcaneCrystals}
          onClose={() => setResourcePopup(null)}
        />
      )}
      {emberPopupOpen && (
        <EmberInfoPopup onClose={() => setEmberPopupOpen(false)} />
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
  return createPortal(
    <div className="info-popup-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="info-popup-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
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

/** Spell info popup — shown when clicking a spell tile in the tech tree */
function SpellInfoPopup({ spellId, onClose }: { spellId: SpellId; onClose: () => void }) {
  const def = SPELL_DEFINITIONS[spellId];
  if (!def) return null;
  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{def.emoji}</span>
        <div>
          <div className="info-popup-header-name">{def.name}</div>
        </div>
      </div>
      <p className="info-popup-desc" style={{ marginBottom: 16 }}>{def.description}</p>
      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>OK</button>
    </Popup>
  );
}

/** Resource info popup — shows current amount, income breakdown, and net income */
function ResourceInfoPopup({
  resourceType,
  current,
  onClose,
}: {
  resourceType: 'iron' | 'wood' | 'crystal';
  current: number;
  onClose: () => void;
}) {
  // Crystal popup uses a dedicated layout
  const crystalIncome = useGameStore((s) => computeCrystalIncomePerTurn(s));
  // Iron/wood breakdown (only computed when needed)
  const entries = useGameStore((s) => computeResourceIncomeBreakdown(s));

  if (resourceType === 'crystal') {
    const { crystalsPerTurn, resonatingChambers } = crystalIncome;
    return (
      <Popup onClose={onClose}>
        <div className="info-popup-header">
          <span className="info-popup-header-emoji">💎</span>
          <div className="info-popup-header-name">Arcane Crystals</div>
        </div>
        <div className="resource-popup-current">Current: {current}</div>
        <div className="resource-popup-section-title">Income this turn</div>
        {resonatingChambers === 0 ? (
          <div className="resource-popup-row resource-popup-row--none">
            No active Crystal Chambers
          </div>
        ) : (
          <div className="resource-popup-row">
            <span className="resource-popup-row-label">Crystal Chamber ×{resonatingChambers} (resonating)</span>
            <span className="resource-popup-row-value">+{crystalsPerTurn}</span>
          </div>
        )}
        <div className="resource-popup-total">
          <span>Per turn</span>
          <span className="resource-popup-total-positive">
            +{crystalsPerTurn}
          </span>
        </div>
        <p className="info-popup-desc" style={{ marginTop: 10, marginBottom: 8, fontSize: '0.82em', opacity: 0.8 }}>
          Crystals are used to research technologies. Crystal Chambers generate crystals while resonating — resonance activates when a chamber is consumed by lava.
        </p>
        <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 6 }} onClick={onClose}>Close</button>
      </Popup>
    );
  }

  const isIron = resourceType === 'iron';
  const emoji = isIron ? '⛓️' : '🪵';
  const label = isIron ? 'Iron' : 'Wood';

  const totalIncome = entries.reduce((sum, e) => sum + (isIron ? e.iron : e.wood), 0);

  /** Format a numeric amount as a signed string with one decimal only if needed */
  const fmt = (n: number): string => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${Number.isInteger(n) ? n : n.toFixed(1)}`;
  };

  // Filter entries that have a non-zero contribution for this resource type
  const relevantEntries = entries.filter((e) => (isIron ? e.iron : e.wood) !== 0);

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{emoji}</span>
        <div className="info-popup-header-name">{label}</div>
      </div>
      <div className="resource-popup-current">Current: {current}</div>
      <div className="resource-popup-section-title">Income this turn</div>
      {relevantEntries.length === 0 ? (
        <div className="resource-popup-row resource-popup-row--none">No income sources</div>
      ) : (
        relevantEntries.map((e, i) => {
          const amount = isIron ? e.iron : e.wood;
          return (
            <div key={i} className={`resource-popup-row${amount < 0 ? ' resource-popup-row--negative' : ''}`}>
              <span className="resource-popup-row-label">{e.label}</span>
              <span className="resource-popup-row-value">{fmt(amount)}</span>
            </div>
          );
        })
      )}
      <div className="resource-popup-total">
        <span>Net income</span>
        <span className={totalIncome >= 0 ? 'resource-popup-total-positive' : 'resource-popup-total-negative'}>
          {fmt(totalIncome)}
        </span>
      </div>
      <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
    </Popup>
  );
}

/** Shared base for tappable tag pills — renders a labelled button with an "i" badge */
function TagPillBase({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="info-popup-tag-pill" onClick={onClick}>
      {label}
      <span className="info-popup-tag-pill-i">i</span>
    </button>
  );
}

/** Tappable tag pill used in panels and popups */
function InfoTagPill({ tag, onClick }: { tag: UnitTag; onClick: () => void }) {
  const info = TAG_INFO[tag];
  return <TagPillBase label={info?.label ?? tag} onClick={onClick} />;
}

/** Tag info popup for terrain tags (tile status) */
function TerrainTagPopup({ tag, onClose }: { tag: TerrainTag; onClose: () => void }) {
  const info = TERRAIN_TAG_INFO[tag];
  if (!info) return null;
  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header-name" style={{ marginBottom: 10 }}>{info.label}</div>
      <p className="info-popup-desc" style={{ marginBottom: 16 }}>{info.desc}</p>
      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>OK</button>
    </Popup>
  );
}

/** Tappable terrain-tag pill for terrain status (used in SelectedTilePanel) */
function TerrainTagPill({ tag, onClick }: { tag: TerrainTag; onClick: () => void }) {
  const info = TERRAIN_TAG_INFO[tag];
  return <TagPillBase label={info?.label ?? tag} onClick={onClick} />;
}

/** Ember Level info popup — explains what Ember Level does and shows source breakdown */
function EmberInfoPopup({ onClose }: { onClose: () => void }) {
  const ember = useGameStore((s) => s.ember);
  const sources = useGameStore((s) => s.emberLevelSources);
  const { turns, emberlingSacrifices, other } = sources;

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">🔥</span>
        <div className="info-popup-header-name">Ember Level</div>
      </div>
      <div className="resource-popup-current">Current Ember Level: {ember}</div>
      <p className="info-popup-desc" style={{ margin: '8px 0', fontSize: '0.85em' }}>
        Higher Ember Level increases enemy pressure. It raises the probability that enemy
        spawners recruit new units each turn and unlocks stronger enemy unit types over time.
      </p>
      <div className="resource-popup-section-title">Source breakdown</div>
      <div className="resource-popup-row">
        <span className="resource-popup-row-label">Turn progression</span>
        <span className="resource-popup-row-value">+{turns}</span>
      </div>
      <div className="resource-popup-row">
        <span className="resource-popup-row-label">Emberling sacrifices</span>
        <span className="resource-popup-row-value">+{emberlingSacrifices}</span>
      </div>
      {other > 0 && (
        <div className="resource-popup-row">
          <span className="resource-popup-row-label">Other sources</span>
          <span className="resource-popup-row-value">+{other}</span>
        </div>
      )}
      <div className="resource-popup-total">
        <span>Total</span>
        <span>{ember}</span>
      </div>
      <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
    </Popup>
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
  const desc = UNIT_DEFINITIONS[unitType]?.description;
  const baseTags = UNIT_DEFINITIONS[unitType]?.tags ?? [];
  const emoji = UNIT_EMOJI[unitType] ?? '?';
  const name = UNIT_NAME[unitType] ?? unitType;

  // Always show base stats from UNIT_DEFINITIONS so info is consistent regardless of call site
  const baseConfig = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS] as
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
              ['RNG', stats.attackRange] as const,
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
  const desc = BUILDING_DEFINITIONS[buildingType]?.description;
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
// STAT HELPERS (used by UnitCombinedInfoPopup and BuildingStatDetailModal)
// ============================================================================

/** Human-readable label for UnitStats keys */
function statKeyToLabel(key: string): string {
  const labels: Record<string, string> = {
    maxHp: 'HP', currentHp: 'HP',
    attack: 'ATK', defense: 'DEF',
    moveRange: 'MOV', attackRange: 'RNG',
    discoverRadius: 'VIS', triggerRange: 'TRG',
    movementActions: 'ACT',
  };
  return labels[key] ?? key.toUpperCase();
}

type StatModEntry = {
  stat: string;
  value: number;
  /** 'active' = contextual (not baked into unit.stats); 'applied' = baked into unit.stats */
  kind: 'active' | 'applied';
  source: string;
};

// ============================================================================
// BUILDING STAT DETAIL MODAL
// ============================================================================

/**
 * Modal overlay showing combat stat modifiers for an attack building
 * (Watchtower, Outpost, etc.).
 */
function BuildingStatDetailModal({ building, onClose }: { building: Building; onClose: () => void }) {
  const fortifiedGarrisonActive = useGameStore((s) => s.fortifiedGarrisonActive);

  if (!building.combatStats) return null;

  const isGarrisonBuilding =
    building.faction === Faction.PLAYER &&
    (building.type === BuildingType.WATCHTOWER || building.type === BuildingType.OUTPOST ||
     building.type === BuildingType.CRYSTAL_TOWER);

  type BuildingModEntry = { stat: string; value: number; source: string };
  const mods: BuildingModEntry[] = [];

  if (isGarrisonBuilding && fortifiedGarrisonActive) {
    mods.push({
      stat: 'ATK',
      value: ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS,
      source: 'Fortified Garrison (specialist)',
    });
    mods.push({
      stat: 'RNG',
      value: ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS,
      source: 'Fortified Garrison (specialist)',
    });
  }

  const bonuses = mods.filter((m) => m.value > 0);
  const penalties = mods.filter((m) => m.value < 0);

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">📊</span>
        <div className="info-popup-header-name">
          {BUILDING_NAME[building.type] ?? building.type} — Stat Details
        </div>
      </div>

      {bonuses.length === 0 && penalties.length === 0 ? (
        <p className="info-popup-desc">No active modifiers.</p>
      ) : (
        <div className="hud-stat-detail-list">
          {bonuses.length > 0 && (
            <div className="hud-stat-detail-section">
              <div className="hud-stat-detail-section-title">📈 Bonuses</div>
              {bonuses.map((m, i) => (
                <div key={i} className="hud-stat-detail-row">
                  <span className="hud-stat-detail-stat">{m.stat}</span>
                  <span className="hud-stat-detail-value hud-stat-bonus">+{m.value}</span>
                  <span className="hud-stat-detail-source">{m.source} ✓</span>
                </div>
              ))}
            </div>
          )}
          {penalties.length > 0 && (
            <div className="hud-stat-detail-section">
              <div className="hud-stat-detail-section-title">📉 Penalties</div>
              {penalties.map((m, i) => (
                <div key={i} className="hud-stat-detail-row">
                  <span className="hud-stat-detail-stat">{m.stat}</span>
                  <span className="hud-stat-detail-value hud-stat-penalty">{m.value}</span>
                  <span className="hud-stat-detail-source">{m.source} ✓</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>OK</button>
    </Popup>
  );
}

// ============================================================================
// UNIT COMBINED INFO POPUP
// ============================================================================

/**
 * Single merged popup for a selected unit — combines what was previously
 * UnitInfoPopup (description, base stats, tags) and StatDetailModal
 * (live stats with buff/debuff badges, modifier breakdown with sources).
 *
 * Opened from SelectedUnitPanel via both the header (i) button and the
 * stats bar button so that there is exactly ONE popup for unit info.
 */
function UnitCombinedInfoPopup({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const [tagPopup, setTagPopup] = useState<UnitTag | null>(null);
  const gameState = useGameStore((s) => s);

  const desc = UNIT_DEFINITIONS[unit.type]?.description;
  const visibleTags = unit.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t));
  const emoji = UNIT_EMOJI[unit.type] ?? '?';
  const name = UNIT_NAME[unit.type] ?? unit.type;

  // ── Contextual runtime bonuses (not baked into unit.stats) ───────────────
  const phalanxAttack = getPhalanxAttackBonus(gameState, unit);
  const phalanxDefense = getPhalanxDefenseBonus(gameState, unit);

  const contextualDef = useMemo(() => {
    let def = 0;
    if (unit.faction === Faction.PLAYER && gameState.techFlags.includes(TechFlag.HOLD_GROUND)) {
      const tile = gameState.grid[unit.position.y]?.[unit.position.x];
      if (tile?.buildingId) {
        const building = gameState.buildings[tile.buildingId];
        if (building?.faction === Faction.PLAYER) def += ABILITIES.HOLD_GROUND_DEFENSE_BONUS;
      }
    }
    return def;
  }, [unit, gameState]);

  const contextualMov = useMemo(() => {
    let techBonus = 0;
    let tagBonus = 0;
    if (unit.faction === Faction.PLAYER && gameState.techFlags.includes(TechFlag.TO_THE_FRONT)) {
      const minPlayerY = getNorthermostPlayerY(gameState);
      if (minPlayerY !== undefined && unit.position.y - minPlayerY > ABILITIES.TO_THE_FRONT_MIN_DISTANCE) {
        techBonus += ABILITIES.TO_THE_FRONT_MOVE_BONUS;
      }
    }
    if (unit.tags.includes(UnitTag.SKIRMISHER)) tagBonus += ABILITIES.SKIRMISHER_MOVE_BONUS;
    if (unit.tags.includes(UnitTag.OUTRIDER)) tagBonus += ABILITIES.OUTRIDER_MOVE_BONUS;
    return { total: techBonus + tagBonus, techBonus, tagBonus };
  }, [unit, gameState]);

  // ── RAGE bonus (shared between stat display and mods breakdown) ────────────
  const { rageBonus, rageAdjacentCount } = useMemo(() => {
    if (!unit.tags.includes(UnitTag.RAGE)) return { rageBonus: 0, rageAdjacentCount: 0 };
    let count = 0;
    for (const otherId of Object.keys(gameState.units)) {
      const other = gameState.units[otherId];
      if (!other || other.faction === unit.faction) continue;
      if (!isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, other.position.x, other.position.y, 1)) continue;
      count++;
    }
    return { rageBonus: Math.min(count, RAGE_MAX_ADJACENT_COUNT) * RAGE_ATK_PER_ADJACENT, rageAdjacentCount: count };
  }, [unit, gameState]);

  // ── Modifier maps for inline stat display ─────────────────────────────────
  // applied = baked into unit.stats; contextual = runtime-only
  const { applied, net, hasAny } = useMemo(() => {
    const appliedMap: Partial<Record<string, number>> = {};
    const contextualMap: Partial<Record<string, number>> = {};

    const addA = (stat: string, v: number) => { appliedMap[stat] = (appliedMap[stat] ?? 0) + v; };
    const addC = (stat: string, v: number) => { contextualMap[stat] = (contextualMap[stat] ?? 0) + v; };

    for (const tag of unit.tags) {
      for (const mod of TAG_STAT_EFFECTS[tag] ?? []) {
        if (mod.mode === 'add') addA(mod.stat as string, mod.value);
      }
    }
    if (unit.faction === Faction.PLAYER) {
      for (const def of TECH_TREE) {
        if (!gameState.techNodes[def.id]?.unlocked) continue;
        for (const effect of def.effects) {
          if (effect.type === 'UNIT_STAT_MOD' && effect.unitType === unit.type && effect.mode === 'add') {
            addA(effect.stat as string, effect.value);
          }
        }
      }
    }
    if (unit.distractionDefPenalty > 0) addA('defense', -unit.distractionDefPenalty);
    if (phalanxAttack !== 0) addC('attack', phalanxAttack);
    if (phalanxDefense !== 0) addC('defense', phalanxDefense);
    if (contextualDef !== 0) addC('defense', contextualDef);
    if (contextualMov.total !== 0) addC('moveRange', contextualMov.total);

    // RAGE: dynamic +ATK per adjacent enemy (works for both factions)
    if (rageBonus > 0) addC('attack', rageBonus);

    const hasAnyMap: Record<string, boolean> = {};
    const netMap: Record<string, number> = {};
    for (const k of new Set([...Object.keys(appliedMap), ...Object.keys(contextualMap)])) {
      hasAnyMap[k] = true;
      netMap[k] = (appliedMap[k] ?? 0) + (contextualMap[k] ?? 0);
    }
    return { applied: appliedMap, net: netMap, hasAny: hasAnyMap };
  }, [unit, gameState, phalanxAttack, phalanxDefense, contextualDef, contextualMov, rageBonus]);

  const showNetMod = (statKey: string) => {
    if (!hasAny[statKey]) return null;
    const n = net[statKey] ?? 0;
    if (n > 0) return <span className="hud-stat-mod hud-stat-bonus">+{n}</span>;
    if (n < 0) return <span className="hud-stat-mod hud-stat-penalty">{n}</span>;
    return <span className="hud-stat-mod hud-stat-neutral">±0</span>;
  };

  // ── Full modifier list for breakdown section ───────────────────────────────
  const mods: StatModEntry[] = [];

  if (phalanxAttack > 0) mods.push({ stat: 'ATK', value: phalanxAttack, kind: 'active', source: 'Phalanx Formation (adjacent guard)' });
  if (phalanxDefense > 0) mods.push({ stat: 'DEF', value: phalanxDefense, kind: 'active', source: 'Phalanx Formation (adjacent guard)' });
  // RAGE: dynamic +ATK per adjacent enemy (works for both factions)
  if (rageBonus > 0) mods.push({ stat: 'ATK', value: rageBonus, kind: 'active', source: `Rage (+${RAGE_ATK_PER_ADJACENT} ATK per adjacent enemy, ${rageAdjacentCount} nearby)` });
  if (contextualDef > 0) mods.push({ stat: 'DEF', value: contextualDef, kind: 'active', source: 'Hold Ground (standing on own building)' });
  if (unit.tags.includes(UnitTag.SKIRMISHER)) mods.push({ stat: 'MOV', value: ABILITIES.SKIRMISHER_MOVE_BONUS, kind: 'active', source: 'Skirmisher (tag ability)' });
  if (unit.tags.includes(UnitTag.OUTRIDER)) mods.push({ stat: 'MOV', value: ABILITIES.OUTRIDER_MOVE_BONUS, kind: 'active', source: 'Outrider (tag ability)' });
  if (contextualMov.techBonus > 0) mods.push({ stat: 'MOV', value: contextualMov.techBonus, kind: 'active', source: 'To the Front (far behind frontline)' });
  for (const tag of unit.tags) {
    for (const mod of TAG_STAT_EFFECTS[tag] ?? []) {
      if (mod.mode === 'add') mods.push({ stat: statKeyToLabel(mod.stat), value: mod.value, kind: 'applied', source: `${TAG_INFO[tag]?.label ?? tag} (tag)` });
    }
  }
  if (unit.faction === Faction.PLAYER) {
    for (const def of TECH_TREE) {
      if (!gameState.techNodes[def.id]?.unlocked) continue;
      for (const effect of def.effects) {
        if (effect.type === 'UNIT_STAT_MOD' && effect.unitType === unit.type && effect.mode === 'add') {
          mods.push({ stat: statKeyToLabel(effect.stat), value: effect.value, kind: 'applied', source: `${def.name} (tech)` });
        }
      }
    }
  }
  if (unit.distractionDefPenalty > 0) mods.push({ stat: 'DEF', value: -unit.distractionDefPenalty, kind: 'applied', source: 'Distraction arrows (permanent, from archer hits)' });

  mods.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'active' ? -1 : 1;
    return b.value - a.value;
  });
  const bonuses = mods.filter((m) => m.value > 0);
  const penalties = mods.filter((m) => m.value < 0);

  return (
    <>
      <Popup onClose={onClose}>
        {/* Header */}
        <div className="info-popup-header">
          <span className="info-popup-header-emoji">{emoji}</span>
          <div className="info-popup-header-name">{name}</div>
        </div>

        {/* Description */}
        {desc && <p className="info-popup-desc">{desc}</p>}

        {/* Live stats with buff/debuff badges */}
        <div className="info-popup-stats">
          {([
            ['ATK', 'attack', unit.stats.attack] as const,
            ['DEF', 'defense', unit.stats.defense] as const,
            ['MOV', 'moveRange', unit.stats.moveRange] as const,
            ['RNG', 'attackRange', unit.stats.attackRange] as const,
            ['VIS', 'discoverRadius', unit.stats.discoverRadius] as const,
          ]).map(([label, key, rawVal]) => (
            <div key={label} className="info-popup-stat-cell">
              <div className="info-popup-stat-label">{label}</div>
              <div className="info-popup-stat-value">
                {rawVal - (applied[key] ?? 0)}
                {showNetMod(key)}
              </div>
            </div>
          ))}
        </div>

        {/* Modifier breakdown — only shown when there are active modifiers */}
        {(bonuses.length > 0 || penalties.length > 0) && (
          <div className="hud-stat-detail-list">
            {bonuses.length > 0 && (
              <div className="hud-stat-detail-section">
                <div className="hud-stat-detail-section-title">📈 Bonuses</div>
                {bonuses.map((m, i) => (
                  <div key={i} className="hud-stat-detail-row">
                    <span className="hud-stat-detail-stat">{m.stat}</span>
                    <span className="hud-stat-detail-value hud-stat-bonus">+{m.value}</span>
                    <span className="hud-stat-detail-source">{m.source}{m.kind === 'applied' ? ' ✓' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {penalties.length > 0 && (
              <div className="hud-stat-detail-section">
                <div className="hud-stat-detail-section-title">📉 Penalties</div>
                {penalties.map((m, i) => (
                  <div key={i} className="hud-stat-detail-row">
                    <span className="hud-stat-detail-stat">{m.stat}</span>
                    <span className="hud-stat-detail-value hud-stat-penalty">{m.value}</span>
                    <span className="hud-stat-detail-source">{m.source}{m.kind === 'applied' ? ' ✓' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tag pills */}
        {visibleTags.length > 0 && (
          <div className="info-popup-tags">
            {visibleTags.map((tag) => (
              <InfoTagPill key={tag} tag={tag} onClick={() => setTagPopup(tag)} />
            ))}
          </div>
        )}

        <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>OK</button>
      </Popup>

      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </>
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
  const castSpell = useGameStore((s) => s.castSpell);

  // Spell casting (Mage only)
  const isMage = unit.type === UnitType.MAGE;
  const unlockedSpells = useGameStore((s) => s.unlockedSpells);
  const startSpellCast = useGameStore((s) => s.startSpellCast);
  const cancelSpellCast = useGameStore((s) => s.cancelSpellCast);
  const pendingSpellCast = useGameStore((s) => s.pendingSpellCast);
  const pendingTransposeFirstUnitId = useGameStore((s) => s.pendingTransposeFirstUnitId);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const canCast = isMage && isPlayer && canUnitCast(unit) && arcaneCrystals >= 1;
  const isInSpellCastMode = pendingSpellCast?.mageId === unit.id;
  const [confirmCrystalTower, setConfirmCrystalTower] = useState(false);
  const [spellsCollapsed, setSpellsCollapsed] = useState(false);
  const [castModeInfoSpellId, setCastModeInfoSpellId] = useState<SpellId | null>(null);

  // Crystal Tower can only be placed on the mage's own empty tile (no ruin, no forest/mountain)
  const crystalTowerBlocked = isMage && (() => {
    const tile = gameState.grid[unit.position.y]?.[unit.position.x];
    if (!tile) return true;
    if (tile.buildingId !== null) return true;
    if (tile.isRuin || tile.isStrongholdRuin) return true;
    if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) return true;
    return false;
  })();

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
  const nextLevelDef = !isMaxLevel ? UNIT_DEFINITIONS[unit.type]?.levelUp?.[unit.level - 1] : null;
  const nextLevelXpRequired = nextLevelDef?.xpRequired ?? null;

  // Compute contextual stat bonuses from tech flags and unit tags
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

    // SKIRMISHER / OUTRIDER: +1 movement range (applied at runtime in movementSystem)
    if (unit.tags.includes(UnitTag.SKIRMISHER) || unit.tags.includes(UnitTag.OUTRIDER)) {
      bonuses.mov += 1;
    }

    return bonuses;
  }, [unit, gameState]);

  // Compute PHALANX formation bonuses (works for both factions)
  const phalanxAttack = useMemo(() => getPhalanxAttackBonus(gameState, unit), [gameState, unit]);
  const phalanxDefense = useMemo(() => getPhalanxDefenseBonus(gameState, unit), [gameState, unit]);
  // Unified modifier map: applied = baked into unit.stats; contextual = runtime-only.
  // Used to show white base value + one green/red/neutral net modifier badge per stat.
  const inlineStatMods = useMemo(() => {
    const applied: Partial<Record<string, number>> = {};
    const contextual: Partial<Record<string, number>> = {};

    const addApplied = (stat: string, value: number) => {
      applied[stat] = (applied[stat] ?? 0) + value;
    };
    const addContextual = (stat: string, value: number) => {
      contextual[stat] = (contextual[stat] ?? 0) + value;
    };

    // TAG_STAT_EFFECTS — positive and negative — baked into unit.stats at grant time
    for (const tag of unit.tags) {
      for (const mod of TAG_STAT_EFFECTS[tag] ?? []) {
        if (mod.mode === 'add') addApplied(mod.stat as string, mod.value);
      }
    }

    // Tech UNIT_STAT_MOD effects — baked into unit.stats at unlock time (player only)
    if (unit.faction === Faction.PLAYER) {
      for (const def of TECH_TREE) {
        if (!gameState.techNodes[def.id]?.unlocked) continue;
        for (const effect of def.effects) {
          if (effect.type === 'UNIT_STAT_MOD' && effect.unitType === unit.type && effect.mode === 'add') {
            addApplied(effect.stat as string, effect.value);
          }
        }
      }
    }

    // Accumulated DISTRACTION DEF penalty — baked into unit.stats.defense via combat hits
    if (unit.distractionDefPenalty > 0) addApplied('defense', -unit.distractionDefPenalty);

    // Contextual bonuses — applied at runtime, not reflected in unit.stats
    if (phalanxAttack !== 0) addContextual('attack', phalanxAttack);
    if (phalanxDefense !== 0) addContextual('defense', phalanxDefense);
    if (statBonuses.def !== 0) addContextual('defense', statBonuses.def);
    if (statBonuses.mov !== 0) addContextual('moveRange', statBonuses.mov);

    // RAGE: dynamic +ATK per adjacent enemy (works for both factions)
    if (unit.tags.includes(UnitTag.RAGE)) {
      let adjacentEnemyCount = 0;
      for (const otherId of Object.keys(gameState.units)) {
        const other = gameState.units[otherId];
        if (!other || other.faction === unit.faction) continue;
        if (!isTileWithinEdgeCircleRange(unit.position.x, unit.position.y, other.position.x, other.position.y, 1)) continue;
        adjacentEnemyCount++;
      }
      const rageBonus = Math.min(adjacentEnemyCount, RAGE_MAX_ADJACENT_COUNT) * RAGE_ATK_PER_ADJACENT;
      if (rageBonus > 0) addContextual('attack', rageBonus);
    }

    const hasAny: Record<string, boolean> = {};
    const net: Record<string, number> = {};
    for (const k of new Set([...Object.keys(applied), ...Object.keys(contextual)])) {
      hasAny[k] = true;
      net[k] = (applied[k] ?? 0) + (contextual[k] ?? 0);
    }

    return { applied, net, hasAny };
  }, [unit, gameState, phalanxAttack, phalanxDefense, statBonuses]);

  // Renders one green/red/neutral badge for the net modifier of a stat key.
  // Returns null when there are no modifiers at all for that stat.
  const showNetMod = (statKey: string) => {
    if (!inlineStatMods.hasAny[statKey]) return null;
    const n = inlineStatMods.net[statKey] ?? 0;
    if (n > 0) return <span className="hud-stat-mod hud-stat-bonus">+{n}</span>;
    if (n < 0) return <span className="hud-stat-mod hud-stat-penalty">{n}</span>;
    return <span className="hud-stat-mod hud-stat-neutral">±0</span>;
  };

  // Cast-mode focused view: replaces the unit panel while the mage is casting a spell
  if (isInSpellCastMode && pendingSpellCast) {
    const spellDef = SPELL_DEFINITIONS[pendingSpellCast.spellId];
    const hintText =
      spellDef?.targetHintSecondPick && pendingTransposeFirstUnitId
        ? spellDef.targetHintSecondPick
        : spellDef?.targetHint ?? 'Select a target.';
    return (
      <div className="hud-info-panel hud-spell-cast-panel">
        <div className="hud-panel-header">
          <span className="hud-panel-emoji">{spellDef?.emoji ?? '✨'}</span>
          <button
            className="hud-spell-cast-name-btn"
            onClick={() => setCastModeInfoSpellId(pendingSpellCast.spellId)}
            title="View spell info"
          >
            Casting {spellDef?.name ?? 'spell'}
            <span className="info-badge" aria-hidden="true">i</span>
          </button>
        </div>
        <p className="hud-spell-cast-hint">{hintText}</p>
        <button
          className="hud-capture-btn hud-spell-cast-cancel"
          onClick={() => cancelSpellCast()}
        >
          ❌ Cancel cast
        </button>
        {castModeInfoSpellId && (
          <SpellInfoPopup
            spellId={castModeInfoSpellId}
            onClose={() => setCastModeInfoSpellId(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`hud-info-panel${!isPlayer ? ' hud-panel-enemy' : ''}`}>
      {/* Header — entire row is tappable to open UnitCombinedInfoPopup */}
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
      <button className="hud-unit-stats-btn" onClick={() => setUnitInfoOpen(true)} aria-label="View stat details and modifiers">
        <div className="hud-unit-stats">
          <span className="hud-stat-label">ATK</span>
          <span className="hud-stat-value">
            {unit.stats.attack - (inlineStatMods.applied.attack ?? 0)}
            {showNetMod('attack')}
          </span>
          <span className="hud-stat-label">DEF</span>
          <span className="hud-stat-value">
            {unit.stats.defense - (inlineStatMods.applied.defense ?? 0)}
            {showNetMod('defense')}
          </span>
          <span className="hud-stat-label">MOV</span>
          <span className="hud-stat-value">
            {unit.stats.moveRange - (inlineStatMods.applied.moveRange ?? 0)}
            {showNetMod('moveRange')}
          </span>
          <span className="hud-stat-label">RNG</span>
          <span className="hud-stat-value">
            {unit.stats.attackRange - (inlineStatMods.applied.attackRange ?? 0)}
            {showNetMod('attackRange')}
          </span>
          <span className="hud-stat-label">VIS</span>
          <span className="hud-stat-value">
            {unit.stats.discoverRadius - (inlineStatMods.applied.discoverRadius ?? 0)}
            {showNetMod('discoverRadius')}
          </span>
        </div>
        <span className="hud-unit-stats-hint" aria-hidden="true">📊</span>
      </button>
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
              className={`hud-spell-btn${isInHealMode ? ' hud-heal-active' : ''}`}
              disabled={healTargets.length === 0}
              onClick={handleHealClick}
            >
              <span className="hud-spell-btn-label">{isInHealMode ? '💊 Choose target…' : '💊 Heal'}</span>
            </button>
          )}
          {isMage && isPlayer && unlockedSpells.length > 0 && (
            <div className="hud-info-panel hud-spell-panel">
              <div className="hud-panel-header">
                <span className="hud-panel-emoji">✨</span>
                <span className="hud-panel-name">Spells</span>
                <button
                  className="hud-construct-toggle"
                  onClick={() => setSpellsCollapsed((c) => !c)}
                  title={spellsCollapsed ? 'Expand' : 'Collapse'}
                >
                  {spellsCollapsed ? '▲' : '▼'}
                </button>
              </div>
              {!spellsCollapsed && (
                <div className="hud-spell-options">
                  {unlockedSpells.filter((id) => id !== SpellId.CRYSTAL_TOWER).map((spellId) => {
                    const def = SPELL_DEFINITIONS[spellId];
                    return (
                      <button
                        key={spellId}
                        className="hud-spell-btn"
                        disabled={!canCast}
                        onClick={() => startSpellCast(unit.id, spellId)}
                        title={`${def?.description ?? ''} (costs 💎1)`}
                      >
                        <span className="hud-spell-btn-label">{def ? `${def.emoji} ${def.name}` : spellId}</span>
                        <span className="hud-spell-btn-cost">💎1</span>
                      </button>
                    );
                  })}
                  {unlockedSpells.includes(SpellId.CRYSTAL_TOWER) && (
                    <>
                      {!confirmCrystalTower ? (
                        <button
                          className="hud-spell-btn"
                          disabled={!canCast || crystalTowerBlocked}
                          onClick={() => setConfirmCrystalTower(true)}
                          title={`${SPELL_DEFINITIONS[SpellId.CRYSTAL_TOWER]?.description ?? ''} (costs 💎1)`}
                        >
                          <span className="hud-spell-btn-label">{SPELL_DEFINITIONS[SpellId.CRYSTAL_TOWER] ? `${SPELL_DEFINITIONS[SpellId.CRYSTAL_TOWER].emoji} ${SPELL_DEFINITIONS[SpellId.CRYSTAL_TOWER].name}` : SpellId.CRYSTAL_TOWER}</span>
                          <span className="hud-spell-btn-cost">💎1</span>
                        </button>
                      ) : (
                        <div className="hud-fieldwork-confirm">
                          <div className="hud-warning hud-capture-warning">
                            ⚠️ This Mage will be consumed to build the tower!
                          </div>
                          <button
                            className="hud-capture-btn"
                            onClick={() => {
                              startSpellCast(unit.id, SpellId.CRYSTAL_TOWER);
                              castSpell(unit.position);
                              cancelSpellCast();
                              setConfirmCrystalTower(false);
                            }}
                          >
                            ✅ Build Crystal Tower
                          </button>
                          <button
                            className="hud-capture-btn"
                            onClick={() => setConfirmCrystalTower(false)}
                          >
                            ❌ Cancel
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
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
        <UnitCombinedInfoPopup unit={unit} onClose={() => setUnitInfoOpen(false)} />
      )}
      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </div>
  );
}

// ============================================================================
// SPECIALIST PICKER MODAL
// ============================================================================

// ============================================================================
// CONSTRUCTION PANEL (shown when a BUILDANDCAPTURE unit is on a constructable tile)
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
  const [collapsed, setCollapsed] = useState(true);

  const options = useMemo(
    () => getConstructionOptionsForTile(useGameStore.getState(), tilePos),
    [tilePos, grid],
  );

  if (options.length === 0) return null;

  return (
    <div className="hud-info-panel hud-construction-panel">
      <div className="hud-panel-header hud-panel-header--clickable" onClick={() => setCollapsed((c) => !c)}>
        <span className="hud-panel-emoji">🔨</span>
        <span className="hud-panel-name">Construct Building</span>
        <span
          className="hud-construct-toggle"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </span>
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
// CONVERSION PANEL (shown when a BUILDANDCAPTURE unit is on a convertible Player building)
// ============================================================================

function ConversionPanel({
  unit,
}: {
  unit: Unit;
}) {
  const resources = useGameStore((s) => s.resources);
  const buildings = useGameStore((s) => s.buildings);
  const convertBuilding = useGameStore((s) => s.convertBuilding);
  const [confirmBuilding, setConfirmBuilding] = useState<ReturnType<typeof getConversionTargetsForTile>[number] | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const currentBuilding = useMemo(() => {
    const tile = useGameStore.getState().grid[unit.position.y]?.[unit.position.x];
    return tile?.buildingId ? buildings[tile.buildingId] : undefined;
  }, [unit.position.x, unit.position.y, buildings]);

  const options = useMemo(
    () => {
      if (!currentBuilding) return [];
      return getConversionTargetsForTile(useGameStore.getState(), currentBuilding.type);
    },
    [currentBuilding],
  );

  if (options.length === 0) return null;

  const currentBuildingName = currentBuilding
    ? (BUILDING_NAME[currentBuilding.type] ?? currentBuilding.type)
    : 'Building';

  return (
    <div className="hud-info-panel hud-construction-panel">
      <div className="hud-panel-header hud-panel-header--clickable" onClick={() => setCollapsed((c) => !c)}>
        <span className="hud-panel-emoji">🔄</span>
        <span className="hud-panel-name">Convert {currentBuildingName}</span>
        <span
          className="hud-construct-toggle"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </span>
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
          actionLabel="Convert"
          onAction={() => {
            convertBuilding(unit.id, confirmBuilding.buildingType);
            setConfirmBuilding(null);
          }}
          onClose={() => setConfirmBuilding(null)}
        />
      )}
    </div>
  );
}



/** Mapping from TileStatus to TerrainTag (same values, conceptually distinct). */
const TILE_STATUS_TO_TERRAIN_TAG: Record<TileStatus, TerrainTag> = {
  [TileStatus.CORRUPTED]: TerrainTag.CORRUPTED,
  [TileStatus.FROZEN]: TerrainTag.FROZEN,
  [TileStatus.BURNING]: TerrainTag.BURNING,
};

function SelectedTilePanel({ tile }: { tile: Tile }) {
  const [infoTerrainTag, setInfoTerrainTag] = useState<TerrainTag | null>(null);

  const terrainEmoji =
    tile.terrainType === TileType.FOREST
      ? '🌲'
      : tile.terrainType === TileType.MOUNTAIN
        ? '⛰️'
        : tile.terrainType === TileType.PLAINS
          ? '🌾'
          : tile.terrainType === TileType.CANYON
            ? '🏜️'
            : tile.terrainType === TileType.WATER
              ? '🌊'
              : '🟫';

  const terrainName =
    tile.terrainType === TileType.FOREST
      ? 'Forest'
      : tile.terrainType === TileType.MOUNTAIN
        ? 'Mountain'
        : tile.terrainType === TileType.PLAINS
          ? 'Plains'
          : tile.terrainType === TileType.CANYON
            ? 'Canyon'
            : tile.terrainType === TileType.WATER
              ? 'Water'
              : 'Empty';

  const terrainTag = tile.status != null ? TILE_STATUS_TO_TERRAIN_TAG[tile.status] : null;

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
      {terrainTag && (
        <div className="hud-unit-tags" style={{ marginTop: 6 }}>
          <TerrainTagPill tag={terrainTag} onClick={() => setInfoTerrainTag(terrainTag)} />
        </div>
      )}
      {infoTerrainTag && (
        <TerrainTagPopup tag={infoTerrainTag} onClose={() => setInfoTerrainTag(null)} />
      )}
    </div>
  );
}

// ============================================================================
// SELECTED BUILDING PANEL
// ============================================================================

function SelectedBuildingPanel({ building }: { building: Building }) {
  const resources = useGameStore((s) => s.resources);
  const grid = useGameStore((s) => s.grid);
  const gameState = useGameStore((s) => s);
  const recruitUnit = useGameStore((s) => s.recruitUnit);
  const unlockedUnits = useGameStore((s) => s.unlockedUnits);
  const showRecruitingScores = useDevOptionsStore((s) => s.showRecruitingScores);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const reviveUnit = useGameStore((s) => s.reviveUnit);

  const [confirmRecruitUnit, setConfirmRecruitUnit] = useState<UnitType | null>(null);
  const [recruitScoreModal, setRecruitScoreModal] = useState(false);
  const [recruitScores, setRecruitScores] = useState<{ type: UnitType; score: number }[]>([]);
  const [buildingInfoOpen, setBuildingInfoOpen] = useState(false);
  const [buildingStatDetailOpen, setBuildingStatDetailOpen] = useState(false);

  const factionLabel =
    building.faction === Faction.PLAYER
      ? '🔵 Player'
      : building.faction === Faction.ENEMY
        ? '🔴 Enemy'
        : '⚪ Neutral';

  const isPlayerOwned = building.faction === Faction.PLAYER;
  const isDisabled = building.isDisabledForTurns > 0;
  const isUnderAttack = building.wasAttackedLastEnemyTurn;
  const hasCombatStats = building.combatStats !== null;
  const canAttack = hasCombatStats && !building.hasAttackedThisTurn && building.faction !== null;

  // Combat stat modifier display (FORTIFIED_GARRISON applied to player Watchtowers/Outposts)
  const fortifiedGarrisonActive = gameState.fortifiedGarrisonActive;
  const isGarrisonBuilding =
    isPlayerOwned &&
    (building.type === BuildingType.WATCHTOWER || building.type === BuildingType.OUTPOST ||
     building.type === BuildingType.CRYSTAL_TOWER);
  const garrisonAtkMod = isGarrisonBuilding && fortifiedGarrisonActive ? ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS : 0;
  const garrisonRngMod = isGarrisonBuilding && fortifiedGarrisonActive ? ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS : 0;

  const showBuildingStatMod = (mod: number) => {
    if (mod > 0) return <span className="hud-stat-mod hud-stat-bonus">+{mod}</span>;
    if (mod < 0) return <span className="hud-stat-mod hud-stat-penalty">{mod}</span>;
    return null;
  };

  // Gravestone: revive logic
  const isGravestone = building.type === BuildingType.GRAVESTONE && isPlayerOwned;
  const isGraveTrap = building.type === BuildingType.GRAVE_TRAP && isPlayerOwned;
  const tile = grid[building.position.y]?.[building.position.x];
  const graveOccupied = isGravestone && tile?.unitId !== null;
  // Revive is only available when the Deathmender specialist (or another source) grants
  // the REVIVABLE tag to the buried unit type. LEAVES_GRAVESTONE from the tech tree
  // lets gravestones spawn but does NOT unlock the revive action.
  const graveRevivable =
    isGravestone &&
    building.gravesUnitType != null &&
    getTagsFromActiveSpecialists(gameState, building.gravesUnitType).includes(UnitTag.REVIVABLE);
  const canRevive = graveRevivable && !graveOccupied && arcaneCrystals >= ABILITIES.REVIVE_CRYSTAL_COST;
  const handleRevive = useCallback(() => {
    reviveUnit(building.id);
  }, [reviveUnit, building.id]);

  // Recruitment info — filter by tech-unlocked units
  const allRecruitableTypes = BUILDING_RECRUITS[building.type] ?? [];
  const recruitableTypes = allRecruitableTypes.filter((ut) => unlockedUnits.includes(ut));

  // Unit limit info for recruitment buildings
  const isRecruitmentBuilding =
    isPlayerOwned && BUILDING_DEFINITIONS[building.type]?.unitLimit !== undefined;
  const { current: recruitedUnits, limit: unitLimit } = isRecruitmentBuilding
    ? computeRecruitmentBuildingUsage(gameState, building.type)
    : { current: 0, limit: Infinity };
  const atUnitLimit = isFinite(unitLimit) && recruitedUnits >= unitLimit;
  // Per-building recruitment limit: only 1 unit per turn per building
  const alreadyRecruitedThisTurn = isPlayerOwned && building.lastRecruitmentTurn === gameState.turn;

  // Check whether there is a free tile to spawn a unit (building tile or adjacent)
  const hasSpawnSpace = useMemo(
    () => (recruitableTypes.length > 0 ? hasSpawnSpaceAt(grid, building.position) : false),
    [recruitableTypes.length, building.position, grid]
  );

  // Crystal Chamber mage recruitment: chamber must be resonating
  const chamberNotResonating =
    building.type === BuildingType.CRYSTAL_CHAMBER && building.resonanceTurnsRemaining <= 0;

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
  const turnsUntilNextPop = (() => {
    if (!isHousingBuilding) return null;
    if (building.type === BuildingType.STRONGHOLD) {
      const { farmerCap, nobleCap } = getStrongholdEffectiveCap(gameState);
      const canGrow = building.populationCount < farmerCap || building.strongholdNobles < nobleCap;
      return canGrow ? POPULATION.HOUSE_GROWTH_INTERVAL - building.populationGrowthCounter : null;
    }
    return building.populationCount < building.populationCap
      ? POPULATION.HOUSE_GROWTH_INTERVAL - building.populationGrowthCounter
      : null;
  })();

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

      {/* Combat stats for attacking buildings — clickable to show modifier details */}
      {hasCombatStats && building.combatStats && (
        <button className="hud-unit-stats-btn" onClick={() => setBuildingStatDetailOpen(true)} aria-label="View stat modifiers">
          <div className="hud-unit-stats">
            <span className="hud-stat-label">ATK</span>
            <span className="hud-stat-value">
              {building.combatStats.attack - garrisonAtkMod}
              {showBuildingStatMod(garrisonAtkMod)}
            </span>
            <span className="hud-stat-label">DEF</span>
            <span className="hud-stat-value">{building.combatStats.defense}</span>
            <span className="hud-stat-label">RNG</span>
            <span className="hud-stat-value">
              {building.combatStats.attackRange - garrisonRngMod}
              {showBuildingStatMod(garrisonRngMod)}
            </span>
            <span className="hud-stat-label">VIS</span>
            <span className="hud-stat-value">{building.discoverRadius}</span>
          </div>
          <span className="hud-unit-stats-hint" aria-hidden="true">📊</span>
        </button>
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
                const { farmerCap, nobleCap } = getStrongholdEffectiveCap(gameState);
                return <>👥 {building.populationCount}/{farmerCap} farmers, {building.strongholdNobles}/{nobleCap} nobles</>;
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

      {/* Unit limit for recruitment buildings */}
      {isRecruitmentBuilding && isFinite(unitLimit) && recruitableTypes.length > 0 && (
        <div className="hud-production-row">
          🗡️ {recruitedUnits}/{unitLimit} units
          {atUnitLimit && (
            <span className="hud-dim"> — Build more to raise the limit</span>
          )}
        </div>
      )}
      {/* Per-building recruitment turn limit indicator */}
      {alreadyRecruitedThisTurn && (
        <div className="hud-production-row hud-dim">
          ⏳ Already recruited this turn
        </div>
      )}

      {/* Gravestone revive button — only shown when the Deathmender specialist grants REVIVABLE */}
      {graveRevivable && (
        <div className="hud-revive-row">
          {graveOccupied ? (
            <span className="hud-dim">A unit is standing here — move it to revive.</span>
          ) : (
            <button
              className="hud-recruit-btn"
              disabled={!canRevive}
              onClick={handleRevive}
              title={!canRevive ? `Need ${ABILITIES.REVIVE_CRYSTAL_COST} crystal (have ${arcaneCrystals})` : undefined}
            >
              🔮 Revive (💎{ABILITIES.REVIVE_CRYSTAL_COST})
            </button>
          )}
        </div>
      )}

      {/* Grave Trap description */}
      {isGraveTrap && (
        <div className="hud-revive-row">
          <span className="hud-dim">Will stun the next unit to enter — any faction.</span>
        </div>
      )}

      {/* Recruitment */}
      {recruitableTypes.length > 0 && isPlayerOwned && (
        <div className="hud-recruit-row">
          <span className="hud-label">Recruit:</span>
          {chamberNotResonating ? (
            <span className="hud-dim">Chamber must be resonating to recruit</span>
          ) : !hasSpawnSpace ? (
            <span className="hud-dim">No space</span>
          ) : (
            <div className="hud-recruit-options">
              {recruitableTypes.map((unitType) => {
                const baseCost = UNIT_DEFINITIONS[unitType]?.cost;
                const costMod = getCostMods(gameState, unitType);
                const cost = baseCost
                  ? { iron: baseCost.iron + costMod.iron, wood: baseCost.wood + costMod.wood }
                  : baseCost;
                const canAffordUnit = cost
                  ? resources.iron >= cost.iron && resources.wood >= cost.wood
                  : false;
                const popCost = UNIT_DEFINITIONS[unitType]?.populationCost as UnitPopulationCost | undefined;
                const hasPopulation = canAffordPopulation(useGameStore.getState(), unitType);
                const canRecruitThisUnit = !isDisabled && hasSpawnSpace && canAffordUnit && hasPopulation && !atUnitLimit && !alreadyRecruitedThisTurn;
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
        const baseCost = UNIT_DEFINITIONS[confirmRecruitUnit]?.cost;
        const costMod = getCostMods(gameState, confirmRecruitUnit);
        const cost = baseCost
          ? { iron: baseCost.iron + costMod.iron, wood: baseCost.wood + costMod.wood }
          : baseCost;
        const costLabel = cost ? `⛓️${cost.iron} 🪵${cost.wood}` : undefined;
        return (
          <UnitInfoPopup
            unitType={confirmRecruitUnit}
            costLabel={costLabel}
            actionLabel="Recruit"
            onAction={() => {
              // TODO: player spawn VFX once recruitment emits an event
              recruitUnit(building.id, confirmRecruitUnit);
              setConfirmRecruitUnit(null);
            }}
            onClose={() => setConfirmRecruitUnit(null)}
          />
        );
      })()}

      {buildingInfoOpen && (
        <BuildingInfoPopup
          buildingType={building.type}
          isReadOnly
          onClose={() => setBuildingInfoOpen(false)}
        />
      )}
      {buildingStatDetailOpen && (
        <BuildingStatDetailModal building={building} onClose={() => setBuildingStatDetailOpen(false)} />
      )}
    </div>
  );
}

// ============================================================================
// BOTTOM BAR
// ============================================================================

function BottomBar() {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedTilePos = useGameStore((s) => s.selectedTilePos);
  const units = useGameStore((s) => s.units);
  const buildings = useGameStore((s) => s.buildings);
  const grid = useGameStore((s) => s.grid);
  const activeCaveEncounters = useGameStore((s) => s.activeCaveEncounters);
  const endPlayerTurn = useGameStore((s) => s.endPlayerTurn);
  const captureBuilding = useGameStore((s) => s.captureBuilding);
  const isAnimating = useAnimationStore((s) => s.isAnimating);
  const cavePopupActive = useCaveScreamsStore((s) => s.tilePos !== null);
  const openCavePopup = useCaveScreamsStore((s) => s.open);

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

  // Construction panel: show when a player BUILDANDCAPTURE unit is selected
  // and its tile has construction options
  const showConstruction = useGameStore((s) => {
    if (!selectedUnit || selectedUnit.faction !== Faction.PLAYER) return false;
    if (!selectedUnit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
    if (!canUnitConstruct(selectedUnit)) return false;
    const options = getConstructionOptionsForTile(s, selectedUnit.position);
    return options.length > 0;
  });

  // Conversion panel: show when a player BUILD_AND_CAPTURE unit is on a convertible building
  const showConversion = useGameStore((s) => {
    if (!selectedUnit) return false;
    return canUnitConvertBuilding(s, selectedUnit.id);
  });

  const isPlayerTurn = phase === GamePhase.PLAYER_TURN;

  // Auto-open cave screams popup at start of player's turn if a previously
  // selected unit is still standing on an unresolved cave mountain tile.
  useEffect(() => {
    if (phase !== GamePhase.PLAYER_TURN || isAnimating || !selectedUnitId) return;
    const unit = units[selectedUnitId];
    if (!unit || unit.faction !== Faction.PLAYER) return;
    if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return;
    const tile = grid[unit.position.y]?.[unit.position.x];
    if (!tile?.hasCaveMonster) return;
    const tileKey = `${unit.position.x},${unit.position.y}`;
    const alreadyActive = activeCaveEncounters.some((e) => e.mountainTileId === tileKey);
    const arrivedThisTurn = unit.lastMovedTurn === turn;
    if (!alreadyActive && !arrivedThisTurn) {
      useAnimationStore.getState().setCameraTarget(unit.position);
      openCavePopup({ x: unit.position.x, y: unit.position.y });
    }
  // Re-run when the turn number or phase changes (new player turn starts).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase]);

  return (
    <div className="hud-bottom-bar">
      {/* Info panels — hidden while cave screams popup is active */}
      {selectedUnit && !cavePopupActive && (
        <SelectedUnitPanel
          unit={selectedUnit}
          captureTarget={captureTarget}
          onCapture={handleCapture}
        />
      )}
      {/* Construction panel for BUILDANDCAPTURE units on constructable tiles */}
      {selectedUnit && showConstruction && !cavePopupActive && (
        <ConstructionPanel
          unit={selectedUnit}
          tilePos={selectedUnit.position}
        />
      )}
      {/* Conversion panel for BUILDANDCAPTURE units on own Ruin buildings */}
      {selectedUnit && showConversion && !cavePopupActive && (
        <ConversionPanel unit={selectedUnit} />
      )}
      {selectedBuilding && !selectedUnit && !cavePopupActive && (
        <SelectedBuildingPanel building={selectedBuilding} />
      )}
      {selectedTile && !selectedUnit && !selectedBuilding && !cavePopupActive && (
        <SelectedTilePanel tile={selectedTile} />
      )}

      {/* End Turn / Enemy Turn feedback */}
      {isPlayerTurn && !isAnimating && (
        <button className="hud-end-turn-btn" onClick={endPlayerTurn}>
          End Turn ⏭️
        </button>
      )}
      {(!isPlayerTurn || isAnimating) && (
        <span className="hud-end-turn-btn hud-end-turn-btn--enemy-turn">⚔️ Enemy Turn…</span>
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
        <span className="hud-endgame-stat-label">🔄 Buildings converted</span>
        <span className="hud-endgame-stat-value">{stats.buildingsConverted}</span>
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
          March North!
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
// CAVE SCREAMS POPUP
// ============================================================================

function CaveScreamsPopup() {
  const tilePos = useCaveScreamsStore((s) => s.tilePos);
  const sealAndBuildMine = useGameStore((s) => s.sealAndBuildMine);
  const exploreCave = useGameStore((s) => s.exploreCave);
  const ignoreCave = useGameStore((s) => s.ignoreCave);

  if (!tilePos) return null;

  const handleExplore = () => {
    exploreCave(tilePos);
    // exploreCave calls close() on the caveScreamsStore internally
  };

  const handleSeal = () => {
    sealAndBuildMine(tilePos);
    // close() is called inside sealAndBuildMine after state update
  };

  const handleIgnore = () => {
    ignoreCave(tilePos);
    // ignoreCave calls close() on the caveScreamsStore internally
  };

  return (
    <div className="cave-screams-overlay">
      <div className="cave-screams-card">
        <p className="cave-screams-flavor">
          Screams echo from deep within the entrance. Venture inside and help, or seal it and build a mine?
        </p>
        <div className="cave-screams-actions">
          <button className="cave-screams-btn" onClick={handleExplore}>
            🗡️ Explore
          </button>
          <button className="cave-screams-btn" onClick={handleSeal}>
            ⛏️ Seal &amp; Build Mine
          </button>
          <button className="cave-screams-btn cave-screams-btn--leave" onClick={handleIgnore}>
            🚪 Leave Cave — Lose Specialist
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CAVE MONSTER KILL MODAL (hire flow + no-survivor flow + swap flow)
// ============================================================================

/** Small inline upkeep display used inside specialist cards across hire/swap/info popups. */
function SpecialistUpkeepLine({ iron, wood, isDormant }: { iron: number; wood: number; isDormant?: boolean }) {
  const hasUpkeep = iron > 0 || wood > 0;
  return (
    <div className="specialist-info-upkeep">
      {hasUpkeep ? (
        <>Upkeep: {iron > 0 && <span>⛓️{iron}</span>}{iron > 0 && wood > 0 && ' '}{wood > 0 && <span>🪵{wood}</span>}
          {isDormant && <span className="specialist-info-dormant-note"> — cannot pay upkeep</span>}
        </>
      ) : (
        <span className="specialist-info-no-upkeep">No upkeep</span>
      )}
    </div>
  );
}

/** Specialist info popup — shown when clicking a filled specialist slot in the top bar, or in swap view */
function SpecialistInfoPopup({ specialist, onClose, onDismiss }: { specialist: Specialist; onClose: () => void; onDismiss?: () => void }) {
  const iron = specialist.upkeepIron ?? 0;
  const wood = specialist.upkeepWood ?? 0;
  const isDormant = !!specialist.dormant;
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);

  return (
    <Popup onClose={onClose}>
      <div className="specialist-info-header">
        <span className="specialist-info-name">🧙 {specialist.name}</span>
        {isDormant && <span className="specialist-info-dormant"> ⚠️ Inactive</span>}
      </div>
      <p className="info-popup-desc">{specialist.description}</p>
      <SpecialistUpkeepLine iron={iron} wood={wood} isDormant={isDormant} />
      {confirmingDismiss && onDismiss ? (
        <div className="specialist-dismiss-confirm">
          <p className="specialist-dismiss-confirm-text">
            Dismiss <strong>{specialist.name}</strong> permanently? Their effects will stop immediately, their slot becomes free, and they cannot be recovered.
          </p>
          <div className="specialist-dismiss-confirm-actions">
            <button className="info-popup-btn info-popup-btn--danger" onClick={onDismiss}>Confirm Dismiss</button>
            <button className="info-popup-btn info-popup-btn--secondary" onClick={() => setConfirmingDismiss(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="specialist-info-actions">
          <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>Close</button>
          {onDismiss && (
            <button className="info-popup-btn info-popup-btn--dismiss" onClick={() => setConfirmingDismiss(true)}>Dismiss Specialist</button>
          )}
        </div>
      )}
    </Popup>
  );
}

function CaveMonsterKillModal() {
  const mode = useSpecialistHireStore((s) => s.mode);
  const specialistId = useSpecialistHireStore((s) => s.specialistId);
  const dismiss = useSpecialistHireStore((s) => s.dismiss);
  const dismissSwap = useSpecialistHireStore((s) => s.dismissSwap);
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);

  // ID of the current specialist whose info popup is open (swap view only)
  const [infoSpecId, setInfoSpecId] = useState<string | null>(null);

  if (!mode) return null;

  if (mode === 'exhausted') {
    return (
      <div className="cave-kill-overlay">
        <div className="cave-kill-card">
          <p className="cave-kill-flavor">
            <em>
              "The creature falls. You search the darkness — but find only silence.
              Whatever was in there is gone."
            </em>
          </p>
          <div className="cave-kill-actions">
            <button className="cave-kill-btn cave-kill-btn--close" onClick={() => dismiss(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const incomingSpecialist = specialistId ? specialists[specialistId] : null;
  if (!incomingSpecialist) return null;

  if (mode === 'hire') {
    return (
      <div className="cave-kill-overlay">
        <div className="cave-kill-card">
          <p className="cave-kill-flavor">
            <em>
              "The creature falls. From the darkness stumbles a survivor — battered,
              grateful, and with nowhere else to go. They offer their skills to your cause."
            </em>
          </p>
          <div className="cave-kill-specialist-card">
            <span className="cave-kill-specialist-name">🧙 {incomingSpecialist.name}</span>
            <p className="cave-kill-specialist-desc">{incomingSpecialist.description}</p>
            <SpecialistUpkeepLine iron={incomingSpecialist.upkeepIron ?? 0} wood={incomingSpecialist.upkeepWood ?? 0} />
          </div>
          <div className="cave-kill-actions">
            <button className="cave-kill-btn cave-kill-btn--hire" onClick={() => dismiss(true)}>
              Hire
            </button>
            <button className="cave-kill-btn cave-kill-btn--sendaway" onClick={() => dismiss(false)}>
              Send Away
            </button>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'swap'
  const infoSpec = infoSpecId ? specialists[infoSpecId] : null;

  return (
    <>
      {infoSpec && (
        <SpecialistInfoPopup
          specialist={infoSpec}
          onClose={() => setInfoSpecId(null)}
        />
      )}
      <div className="cave-kill-overlay">
        <div className="cave-kill-card cave-kill-card--swap">
          <div className="cave-kill-swap-incoming-label">Incoming Survivor</div>
          <div className="cave-kill-specialist-card cave-kill-specialist-card--incoming">
            <span className="cave-kill-specialist-name">🧙 {incomingSpecialist.name}</span>
            <p className="cave-kill-specialist-desc">{incomingSpecialist.description}</p>
            <SpecialistUpkeepLine iron={incomingSpecialist.upkeepIron ?? 0} wood={incomingSpecialist.upkeepWood ?? 0} />
          </div>
          <div className="cave-kill-swap-divider">
            <span className="cave-kill-swap-divider-label">Replace one of your specialists</span>
          </div>
          <div className="cave-kill-swap-current-row">
            {globalSpecialistStorage.map((specId) => {
              const spec = specialists[specId];
              if (!spec) return null;
              return (
                <div key={specId} className="cave-kill-swap-current-card">
                  <button
                    className="cave-kill-swap-current-info"
                    onClick={() => setInfoSpecId(specId)}
                    title="View details"
                  >
                    <span className="cave-kill-specialist-name">🧙 {spec.name}</span>
                    <p className="cave-kill-specialist-desc">{spec.description}</p>
                    <span className="cave-kill-swap-info-hint">ℹ Details</span>
                  </button>
                  <button
                    className="cave-kill-btn cave-kill-btn--replace"
                    onClick={() => { setInfoSpecId(null); dismissSwap(specId); }}
                  >
                    Replace
                  </button>
                </div>
              );
            })}
          </div>
          <div className="cave-kill-actions">
            <button className="cave-kill-btn cave-kill-btn--sendaway" onClick={() => { setInfoSpecId(null); dismissSwap(null); }}>
              Send Away
            </button>
          </div>
        </div>
      </div>
    </>
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

const NODE_W = 130;
const NODE_H = 52;
const H_GAP = 24;
const V_GAP = 80;

/**
 * Compute tech-tree node positions dynamically from the TECH_TREE definition.
 *
 * Layout rules:
 *  - The root node (requires=[]) sits at the left-center.
 *  - Each dependency level is placed in a vertical column to the right of the previous.
 *  - X position: depth × (nodeW + V_GAP)
 *  - Y position: each parent is centered over its children; siblings are
 *    spread vertically with H_GAP between them.
 */
function computeTechTreeLayout(
  tree: readonly { id: string; requires: string[] }[],
  nodeW: number,
  nodeH: number,
): { positions: Record<string, { x: number; y: number }>; canvasW: number; canvasH: number } {
  // ── Build adjacency ──────────────────────────────────────────────────────
  const childrenOf = new Map<string, string[]>();
  let rootId = '';
  for (const node of tree) {
    if (node.requires.length === 0) rootId = node.id;
    else {
      const parent = node.requires[0];
      const list = childrenOf.get(parent);
      if (list) list.push(node.id);
      else childrenOf.set(parent, [node.id]);
    }
  }
  if (!rootId) return { positions: {}, canvasW: 0, canvasH: 0 };

  // ── BFS for depth ────────────────────────────────────────────────────────
  const depthOf = new Map<string, number>();
  depthOf.set(rootId, 0);
  const queue = [rootId];
  let queueIdx = 0;
  while (queueIdx < queue.length) {
    const id = queue[queueIdx++];
    const d = depthOf.get(id)!;
    for (const child of (childrenOf.get(id) ?? [])) {
      depthOf.set(child, d + 1);
      queue.push(child);
    }
  }

  // ── Post-order: subtree height (vertical extent) ─────────────────────────
  const subtreeHeight = new Map<string, number>();
  function calcHeight(id: string): number {
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) {
      subtreeHeight.set(id, nodeH);
      return nodeH;
    }
    const total = children.reduce((sum, c) => sum + calcHeight(c), 0)
      + H_GAP * (children.length - 1);
    const h = Math.max(nodeH, total);
    subtreeHeight.set(id, h);
    return h;
  }
  calcHeight(rootId);

  // ── Pre-order: assign X (depth-based), Y (centered within subtree) ───────
  const rawPos: Record<string, { x: number; y: number }> = {};
  function assignPos(id: string, centerY: number): void {
    const depth = depthOf.get(id)!;
    rawPos[id] = {
      x: depth * (nodeW + V_GAP),
      y: centerY,
    };
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) return;
    const totalChildH = children.reduce((s, c) => s + subtreeHeight.get(c)!, 0)
      + H_GAP * (children.length - 1);
    let cursor = centerY - totalChildH / 2;
    for (const child of children) {
      const ch = subtreeHeight.get(child)!;
      assignPos(child, cursor + ch / 2);
      cursor += ch + H_GAP;
    }
  }
  assignPos(rootId, subtreeHeight.get(rootId)! / 2);

  // ── Bounding box + padding ───────────────────────────────────────────────
  const padding = 40;
  // Extra bottom padding so nodes aren't hidden behind the detail sheet.
  const bottomPad = 300;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of Object.values(rawPos)) {
    if (p.x - nodeW / 2 < minX) minX = p.x - nodeW / 2;
    if (p.y - nodeH / 2 < minY) minY = p.y - nodeH / 2;
    if (p.x + nodeW / 2 > maxX) maxX = p.x + nodeW / 2;
    if (p.y + nodeH / 2 > maxY) maxY = p.y + nodeH / 2;
  }
  const offX = -minX + padding;
  const offY = -minY + padding;

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of Object.entries(rawPos)) {
    positions[id] = {
      x: Math.round(p.x + offX - nodeW / 2),
      y: Math.round(p.y + offY - nodeH / 2),
    };
  }

  return {
    positions,
    canvasW: Math.ceil(maxX - minX + 2 * padding),
    canvasH: Math.ceil(maxY - minY + padding + bottomPad),
  };
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
  const ember = useGameStore((s) => s.ember);
  const unlockTech = useGameStore((s) => s.unlockTech);
  const getAvailableTechs = useGameStore((s) => s.getAvailableTechs);

  const [selectedId, setSelectedId] = useState<TechId | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [infoUnitType, setInfoUnitType] = useState<UnitType | null>(null);
  const [infoBuildingType, setInfoBuildingType] = useState<BuildingType | null>(null);
  const [infoUnitTag, setInfoUnitTag] = useState<UnitTag | null>(null);
  const [infoSpellId, setInfoSpellId] = useState<SpellId | null>(null);

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
    if (selectedId && selectedDef && arcaneCrystals >= computeResearchCost(selectedDef.cost ?? 1, ember) && availableSet.has(selectedId)) {
      unlockTech(selectedId);
    }
  }, [selectedId, selectedDef, arcaneCrystals, ember, availableSet, unlockTech]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // On open, scroll the canvas so the root node is near the left-center of the viewport
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rootCenter = nodeCentre(TECH_TREE.find((d) => d.requires.length === 0)?.id ?? '');
    el.scrollLeft = rootCenter.x - NODE_W;
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
          <span className="tech-overlay-picks">💎 {arcaneCrystals} crystal{arcaneCrystals > 1 ? 's' : ''} available{ember > 0 ? ` · 🔥 Ember ${ember}` : ''}</span>
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
                {isAvailable && <span className="tech-node-cost">💎 {computeResearchCost(def.cost ?? 1, ember)}</span>}
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
            <p className="tech-detail-text">{selectedDef.description}</p>

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
                if (e.type === TechEffectType.UNLOCK_SPELL) {
                  const def = SPELL_DEFINITIONS[e.spellId];
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoSpellId(e.spellId)}>
                      <span className="tech-effect-tile-emoji">{def?.emoji ?? '✨'}</span>
                      <span className="tech-effect-tile-name">{def?.name ?? e.spellId}</span>
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
                const techCost = computeResearchCost(selectedDef?.cost ?? 1, ember);
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
      {/* Footer caption */}
      <div className="tech-overlay-footer">
        🔥 Costs increase with Ember level
      </div>

      {infoUnitType && (
        <UnitInfoPopup
          unitType={infoUnitType}
          onClose={() => setInfoUnitType(null)}
          isReadOnly
          costLabel={(() => {
            const baseCost = UNIT_DEFINITIONS[infoUnitType]?.cost;
            if (!baseCost) return undefined;
            const costMod = getCostMods(useGameStore.getState(), infoUnitType);
            const iron = baseCost.iron + costMod.iron;
            const wood = baseCost.wood + costMod.wood;
            return `⛓️${iron} 🪵${wood}`;
          })()}
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
      {infoSpellId && (
        <SpellInfoPopup
          spellId={infoSpellId}
          onClose={() => setInfoSpellId(null)}
        />
      )}
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
      return s.arcaneCrystals >= computeResearchCost(def?.cost ?? 1, s.ember);
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
      <CaveScreamsPopup />
      <CaveMonsterKillModal />
      <TopBar
        onOpenTechTree={() => setShowTechTree(true)}
        showTechButton={isPlayerTurn}
        arcaneCrystals={arcaneCrystals}
        showTechBadge={showTechBadge}
      />
      <BottomBar />
      {showTechTree && <TechTreeOverlay onClose={handleCloseTechTree} />}
      {phase === GamePhase.GAME_OVER && <GameOverOverlay />}
      {phase === GamePhase.VICTORY && <VictoryOverlay />}
      {showTurnPopup && <TurnAnnouncementPopup turn={turn} />}
    </>
  );
}
