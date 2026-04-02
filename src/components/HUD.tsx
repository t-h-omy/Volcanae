/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { useDevOptionsStore } from '../devOptionsStore';
import { UNIT_COSTS, RESOURCES, UI, UNIT_POPULATION_COSTS, POPULATION } from '../gameConfig';
import type { UnitPopulationCost } from '../types';
import {
  hasSpawnSpaceAt,
  computePopulationUsage,
  canAffordPopulation,
} from '../resourceSystem';
import {
  getConstructionOptionsForTile,
} from '../constructionSystem';
import { computeUnitAiScores, computeRecruitmentScores, type ScoredAction } from '../enemySystem';
import {
  Faction,
  GamePhase,
  UnitType,
  UnitTag,
  BuildingType,
  type Building,
  type Unit,
  type Specialist,
  type Position,
} from '../types';
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
  [BuildingType.LAVALAIR]: '🕳️',
  [BuildingType.INFERNALSANCTUM]: '🌋',
  [BuildingType.FARM]: '🌾',
  [BuildingType.PATRICIANHOUSE]: '🏯',
  [BuildingType.MAGMASPYR]: '⛰️',
  [BuildingType.EMBERNEST]: '🌲',
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
  [BuildingType.LAVALAIR]: 'Lava Lair',
  [BuildingType.INFERNALSANCTUM]: 'Infernal Sanctum',
  [BuildingType.FARM]: 'Farm',
  [BuildingType.PATRICIANHOUSE]: 'Patrician House',
  [BuildingType.MAGMASPYR]: 'Magma Spyr',
  [BuildingType.EMBERNEST]: 'Ember Nest',
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
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
          <div className="hud-dev-overlay-section-title">Actions</div>
          <button className="hud-dev-action-btn" onClick={debugAdvanceLava}>🌋 Advance Lava</button>
          <button className="hud-dev-action-btn" onClick={debugAddResources}>💰 +10 Resources</button>
          <button className="hud-dev-action-btn" onClick={debugGiveSpecialist}>🧙 Give Specialist</button>
          <button className="hud-dev-action-btn" onClick={debugRevealAll}>👁️ Reveal All</button>
          <button className="hud-dev-action-btn" onClick={debugAddFarmers}>🌾 Add Farm (zone 1)</button>
          <button className="hud-dev-action-btn" onClick={debugAddRuin}>🗿 Add Ruin (near unit)</button>
        </div>
      </div>
    </div>
  );
}

function GameMenu() {
  const [open, setOpen] = useState(false);
  const [devOptionsOverlayOpen, setDevOptionsOverlayOpen] = useState(false);
  const initNewGame = useGameStore((s) => s.initNewGame);
  const saveGame = useGameStore((s) => s.saveGame);
  const clearSavedGameAction = useGameStore((s) => s.clearSavedGame);
  const hasSavedGameCheck = useGameStore((s) => s.hasSavedGame);

  const handleNewGame = useCallback(() => {
    initNewGame();
    setOpen(false);
  }, [initNewGame]);

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
    </div>
  );
}

// ============================================================================
// TOP BAR
// ============================================================================

function TopBar() {
  const turn = useGameStore((s) => s.turn);
  const resources = useGameStore((s) => s.resources);
  const threatLevel = useGameStore((s) => s.threatLevel);
  const turnsUntilLavaAdvance = useGameStore((s) => s.turnsUntilLavaAdvance);
  const isAnimating = useAnimationStore((s) => s.isAnimating);

  // Population usage (live) — select primitives to avoid infinite re-render
  const farmersUsed = useGameStore((s) => computePopulationUsage(s).farmersUsed);
  const noblesUsed = useGameStore((s) => computePopulationUsage(s).noblesUsed);

  return (
    <div className="hud-top-bar">
      <span className="hud-stat">🔄 Turn {turn}</span>
      {isAnimating && <span className="hud-stat hud-enemy-turn-label">⚔️ Enemy Turn...</span>}
      <span className="hud-stat">⛓️ {resources.iron}</span>
      <span className="hud-stat">🪵 {resources.wood}</span>
      <span className="hud-stat">🌾 {farmersUsed}/{resources.farmers}</span>
      <span className="hud-stat">🎖️ {noblesUsed}/{resources.nobles}</span>
      <span className="hud-stat">⚠️ Threat {threatLevel}</span>
      <span className="hud-stat">🌋 Lava in {turnsUntilLavaAdvance}</span>
      <GameMenu />
    </div>
  );
}

/** Tags that are internal implementation details and should not be shown to the player */
const HIDDEN_UNIT_TAGS = new Set<string>([]);

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
  const canMove = !unit.hasMovedThisTurn;
  const canAttack = !unit.hasActedThisTurn && !(unit.tags.includes(UnitTag.PREP) && unit.hasMovedThisTurn);
  const canCapture =
    !unit.hasCapturedThisTurn &&
    !unit.hasActedThisTurn &&
    !unit.hasMovedThisTurn &&
    unit.tags.includes(UnitTag.BUILDANDCAPTURE);

  const visibleTags = unit.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t));

  const showAiScores = useDevOptionsStore((s) => s.showAiScores);
  const gameState = useGameStore((s) => s);
  const [aiScoreModal, setAiScoreModal] = useState(false);
  const [aiScores, setAiScores] = useState<ScoredAction[]>([]);

  return (
    <div className={`hud-info-panel${!isPlayer ? ' hud-panel-enemy' : ''}`}>
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{UNIT_EMOJI[unit.type] ?? '?'}</span>
        <span className="hud-panel-name">{UNIT_NAME[unit.type] ?? unit.type}</span>
        {!isPlayer && <span className="hud-faction-label hud-faction-enemy">🔴 Enemy</span>}
      </div>
      <div className="hud-hp-row">
        <div className="hud-hp-bar">
          <div className="hud-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <span className="hud-hp-text">
          {unit.stats.currentHp}/{unit.stats.maxHp}
        </span>
      </div>
      <div className="hud-unit-stats">
        <span className="hud-stat-label">ATK</span>
        <span className="hud-stat-value">{unit.stats.attack}</span>
        <span className="hud-stat-label">DEF</span>
        <span className="hud-stat-value">{unit.stats.defense}</span>
        <span className="hud-stat-label">MOV</span>
        <span className="hud-stat-value">{unit.stats.moveRange}</span>
        <span className="hud-stat-label">RNG</span>
        <span className="hud-stat-value">{unit.stats.attackRange}</span>
        <span className="hud-stat-label">VIS</span>
        <span className="hud-stat-value">{unit.stats.discoverRadius}</span>
      </div>
      {visibleTags.length > 0 && (
        <div className="hud-tag-pills">
          {visibleTags.map((tag) => (
            <span key={tag} className="hud-tag-pill">
              {tag === UnitTag.RANGED
                ? '◎ Ranged'
                : tag === UnitTag.LAVABOOST
                  ? '🔥 Lava-Boosted'
                  : tag === UnitTag.PREP
                    ? '⏸ Prep'
                    : tag}
            </span>
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
      </div>
      <div className="hud-construct-options">
        {options.map((opt) => {
          const canAffordThis =
            resources.iron >= opt.cost.iron && resources.wood >= opt.cost.wood;
          return (
            <button
              key={opt.buildingType}
              className="hud-construct-btn"
              disabled={!canAffordThis}
              onClick={() =>
                constructBuilding(unit.id, tilePos, opt.buildingType)
              }
            >
              {opt.emoji} {opt.label}
              <span className="hud-cost">
                {' '}(⛓️{opt.cost.iron} 🪵{opt.cost.wood})
              </span>
            </button>
          );
        })}
      </div>
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
  const units = useGameStore((s) => s.units);
  const gameState = useGameStore((s) => s);
  const recruitUnit = useGameStore((s) => s.recruitUnit);
  const unassignSpecialist = useGameStore((s) => s.unassignSpecialist);
  const destroyOwnBuilding = useGameStore((s) => s.destroyOwnBuilding);
  const showRecruitingScores = useDevOptionsStore((s) => s.showRecruitingScores);

  const [showPicker, setShowPicker] = useState(false);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [recruitScoreModal, setRecruitScoreModal] = useState(false);
  const [recruitScores, setRecruitScores] = useState<{ type: UnitType; score: number }[]>([]);

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
  const canAttack = hasCombatStats && !building.hasActedThisTurn && building.faction !== null;

  // Specialist slot info
  const assignedSpecialist: Specialist | null =
    building.specialistSlot ? specialists[building.specialistSlot] ?? null : null;

  // Recruitment info
  const recruitableTypes = BUILDING_RECRUITS[building.type] ?? [];

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

  // Demolish: a player unit with BUILD_AND_CAPTURE must be on the same tile
  const builderOnTile = useMemo(() => {
    if (!isPlayerOwned) return null;
    return Object.values(units).find(
      (u) =>
        u.faction === Faction.PLAYER &&
        u.tags.includes(UnitTag.BUILDANDCAPTURE) &&
        u.position.x === building.position.x &&
        u.position.y === building.position.y,
    ) ?? null;
  }, [isPlayerOwned, units, building.position]);

  const handleDemolish = useCallback(() => {
    if (builderOnTile) {
      destroyOwnBuilding(builderOnTile.id, building.id);
      setConfirmDemolish(false);
    }
  }, [builderOnTile, destroyOwnBuilding, building.id]);

  // Dev: recruiting scores for enemy LAVA_LAIR / INFERNAL_SANCTUM
  const isEnemyRecruitingBuilding =
    building.faction === Faction.ENEMY &&
    (building.type === BuildingType.LAVALAIR || building.type === BuildingType.INFERNALSANCTUM);

  return (
    <div className="hud-info-panel hud-building-panel">
      {/* Header */}
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{BUILDING_EMOJI[building.type] ?? '?'}</span>
        <span className="hud-panel-name">{BUILDING_NAME[building.type] ?? building.type}</span>
        <span className="hud-faction-label">{factionLabel}</span>
      </div>

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
              👥 {Math.min(building.populationCount, POPULATION.STRONGHOLD_FARMER_CAP)}/{POPULATION.STRONGHOLD_FARMER_CAP} farmers, {Math.max(0, building.populationCount - POPULATION.STRONGHOLD_FARMER_CAP)}/{POPULATION.STRONGHOLD_NOBLE_CAP} nobles
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
                return (
                  <div key={unitType} className="hud-recruit-option-wrapper">
                    <button
                      className="hud-recruit-btn"
                      disabled={!canRecruitThisUnit}
                      onClick={() => recruitUnit(building.id, unitType)}
                    >
                      {UNIT_EMOJI[unitType] ?? ''}{' '}
                      {UNIT_NAME[unitType] ?? unitType}
                      {cost && (
                        <span className="hud-cost">
                          {' '}(⛓️{cost.iron} 🪵{cost.wood})
                        </span>
                      )}
                    </button>
                    {popCost && (popCost.farmers > 0 || popCost.nobles > 0) && (
                      <span className="hud-pop-req">
                        Requires:{' '}
                        {popCost.farmers > 0 && `🌾 ${popCost.farmers} farmer${popCost.farmers > 1 ? 's' : ''}`}
                        {popCost.farmers > 0 && popCost.nobles > 0 && ', '}
                        {popCost.nobles > 0 && `🎖️ ${popCost.nobles} noble${popCost.nobles > 1 ? 's' : ''}`}
                      </span>
                    )}
                    {!hasPopulation && canAffordUnit && (
                      <span className="hud-pop-warning">
                        Not enough {popCost && popCost.farmers > 0 ? 'farmers — build more Farms' : 'nobles — build more Patrician Houses'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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

      {/* Demolish button for player-owned buildings */}
      {isPlayerOwned && (
        <div className="hud-demolish-row">
          {!confirmDemolish ? (
            <button
              className="hud-demolish-btn"
              disabled={!builderOnTile}
              title={!builderOnTile ? 'A builder unit must be on this building to demolish' : undefined}
              onClick={() => setConfirmDemolish(true)}
            >
              🔨 Demolish
            </button>
          ) : (
            <div className="hud-demolish-confirm">
              <span>Are you sure?</span>
              <button className="hud-demolish-yes" onClick={handleDemolish}>Yes</button>
              <button className="hud-demolish-no" onClick={() => setConfirmDemolish(false)}>No</button>
            </div>
          )}
          {!builderOnTile && (
            <span className="hud-dim" style={{ fontSize: 11 }}>
              A builder unit must be on this building to demolish
            </span>
          )}
        </div>
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
  const units = useGameStore((s) => s.units);
  const buildings = useGameStore((s) => s.buildings);
  const endPlayerTurn = useGameStore((s) => s.endPlayerTurn);
  const captureBuilding = useGameStore((s) => s.captureBuilding);
  const isAnimating = useAnimationStore((s) => s.isAnimating);

  const selectedUnit: Unit | undefined = selectedUnitId
    ? units[selectedUnitId]
    : undefined;
  const selectedBuilding: Building | undefined = selectedBuildingId
    ? buildings[selectedBuildingId]
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
    if (selectedUnit.hasMovedThisTurn || selectedUnit.hasActedThisTurn || selectedUnit.hasCapturedThisTurn) return false;
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

function GameOverOverlay() {
  const turn = useGameStore((s) => s.turn);
  const initNewGame = useGameStore((s) => s.initNewGame);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-defeat">💀 DEFEATED</h1>
        <p className="hud-overlay-sub">You survived {turn} turns</p>
        <button className="hud-play-again-btn" onClick={initNewGame}>
          🔄 Play Again
        </button>
      </div>
    </div>
  );
}

function VictoryOverlay() {
  const turn = useGameStore((s) => s.turn);
  const initNewGame = useGameStore((s) => s.initNewGame);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-victory">🏆 VICTORY</h1>
        <p className="hud-overlay-sub">Completed in {turn} turns</p>
        <button className="hud-play-again-btn" onClick={initNewGame}>
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
          Lava rises. The horde follows.<br />
          Capture all five strongholds before the mountain swallows you whole.
        </p>
        <button className="hud-intro-cta" onClick={onDismiss}>
          To the Walls!
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
// MAIN HUD COMPONENT
// ============================================================================

export default function HUD({ showTurnPopup }: { showTurnPopup?: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);

  return (
    <>
      {!hasSeenIntro && <GameIntroPopup onDismiss={() => setHasSeenIntro(true)} />}
      <TopBar />
      <BottomBar />
      {phase === GamePhase.GAME_OVER && <GameOverOverlay />}
      {phase === GamePhase.VICTORY && <VictoryOverlay />}
      {showTurnPopup && <TurnAnnouncementPopup turn={turn} />}
    </>
  );
}
