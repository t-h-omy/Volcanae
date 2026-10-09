/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../gameStore';
import { useMenuStore } from '../menuStore';
import { useAnimationStore } from '../animationStore';
import { useDevOptionsStore } from '../devOptionsStore';
import { useSoundOptionsStore } from '../soundOptionsStore';
import { usesNonXpProgression } from '../levelSystem';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, RESOURCES, POPULATION, XP, TECH_TREE, ABILITIES, DIFFICULTY_MULTIPLIER, getLavaAdvanceInterval, TAG_STAT_EFFECTS, UPGRADE_TRADEOFF_TAGS, computeResearchCost, SPELL_DEFINITIONS, MAGE, CORRUPTED_SUPPRESSED_TAGS, CRYSTAL_CAVE_CONFIG, CRYSTAL_CHAMBER_CONFIG, MARKET, SPECIALIST_DEFINITIONS, CONDITIONAL_ACTIVE_TAGS } from '../gameConfig';
import type { SpecialistDefinition } from '../gameConfig';
import { UI } from '../../config/ui';
import { CAVE_SPECIALIST_ROB_REWARD_CRYSTALS } from '../../config/specialists';
import { FitText } from './FitText';
import type { UnitPopulationCost, TechId } from '../types';
import { useHintStore } from '../hintStore';
import { useHintOptionsStore } from '../hintOptionsStore';
import { tryTriggerHint } from '../hintSystem';
import { isUnitOnCorruptedTile } from '../tileStatusSystem';
import {
  hasSpawnSpaceAt,
  computePopulationUsage,
  computePopulationCapacity,
  canAffordPopulation,
  computeResourceIncome,
  computeSpecialistUpkeep,
  computeBuildingUpkeep,
  computeRecruitmentBuildingUsage,
  computeResourceIncomeBreakdown,
  computeCrystalIncomePerTurn,
  computePopulationBreakdown,
  getMineKilnBonusCount,
  getEffectiveHousingPopulationCap,
  getStrongholdEffectiveCapWithDoctrines,
  getEffectiveRecruitCost,
  isCrystalCostUnit,
} from '../resourceSystem';
import {
  getConstructionMenuOptionsForTile,
  getConversionTargetsForTile,
  canUnitConvertBuilding,
} from '../constructionSystem';
import { getUnitTargetLevel } from '../levelSystem';
import { computeUnitAiScores, computeRecruitmentScores, type ScoredAction } from '../enemySystem';
import { getAvailableTechs as getAvailableTechsLogic } from '../techSystem';
import { buildRecruitBlockMessages } from '../recruitMessages';
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
  type GameState,
} from '../types';
import { canUnitMove, canUnitAttack, canUnitCapture, canUnitPreviewConstruction, getConstructionMenuUnlockTechId, sortConstructionMenuOptions, canUnitHeal, getHealTargets, canUnitFieldwork, getNorthermostPlayerY, canUnitCast, getMageCastBudget, getUnitAttackRange, isHealSuppressedByCorruption, canUnitTrade, getTradeMarket, getCaptureTarget, canUnitBuildBridge, getBridgeBuildTargets, canUnitSetTrap, getTrapPlacementTargets, canUnitExtinguish, canUnitConsumeGravestone } from '../unitActions';
import { getBatteryAttackBonus, getLanceChargeAttackBonus, getPhalanxAttackBonus, getPhalanxDefenseBonus, getCrystalTowerChamberBonus, getRageAttackContext, hasAssassinDamageBonusTarget, isTagConditionActive } from '../combatSystem';
import { isSpecialistEffectActive } from '../specialistSystem';
import { RENDER } from '../../config/render';
import { useZoneClearedStore } from '../zoneClearedStore';
import { useCaveScreamsStore } from '../caveScreamsStore';
import { useSpecialistHireStore } from '../specialistHireStore';
import { useMarketPanelStore } from '../marketPanelStore';
import { saveSlot, saveSlotStrict, deleteSlot, exportSlot, getSlotMeta, listSlots, getNextDefaultSlotName, idbAvailable } from '../saveSystem';
import { SAVE } from '../gameConfig';
import { generateId } from '../mapGenerator';
import { stopGameMusic } from '../useMusicPlayer';
import { shouldShowTurnPopupEmberRose } from '../turnPopup';
import { getAttackDisplayModifiers } from '../unitStatDisplay';
import { useEmberDisplayStore } from '../emberDisplayStore';
import { LOCALE_ENDONYMS, PSEUDO_LOCALE, RELEASE_LOCALES, SUPPORTED_LOCALES } from '../../config/i18n';
import { useLocaleStore, type ActiveLocale } from '../i18n/localeStore';
import { deleteRun, listSealedRuns, readMeta as readAiTraceMeta } from '../aiTraceStore';
import { exportAiTrace, formatAiTraceBytes } from '../aiTraceExportClient';
import type { AiTraceMeta } from '../aiTrace';
import { AiTraceBadge } from './AiTraceBadge';
import { AiTraceExportControls } from './AiTraceExportControls';
import { useText } from '../i18n/useText';
import './HUD.css';

// ============================================================================
// EMOJI LOOKUP TABLES
// ============================================================================

const UNIT_EMOJI: Record<string, string> = {
  [UnitType.SPEARMAN]: '⚔️',
  [UnitType.SWORDSMAN]: '🗡️',
  [UnitType.ARCHER]: '🏹',
  [UnitType.CROSSBOWMAN]: '🎯',
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
  [UnitType.CORRUPTED_QORK]: '🐗',
  [UnitType.GHOUL]: '🧟',
  [UnitType.GARGOYLE]: '🗿',
  [UnitType.CRYSTAL_DRAKE]: '🐲',
  [UnitType.CRYSTAL_KHYRON]: '💠',
};

const DIFFICULTY_EMOJI: Record<Difficulty, string> = {
  [Difficulty.EASY]: '🟢',
  [Difficulty.STANDARD]: '🟡',
  [Difficulty.HARD]: '🔴',
};

const BUILDING_EMOJI: Record<string, string> = {
  [BuildingType.STRONGHOLD]: '🏰',
  [BuildingType.MINE]: '🏔️',
  [BuildingType.DEEP_MINE]: '⛏️',
  [BuildingType.WOODCUTTER]: '🛖',
  [BuildingType.CHARCOAL_KILN]: '🔥',
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
  [BuildingType.CRYSTAL_CAVE]: '🕳️',
  [BuildingType.GRAVESTONE]: '🪦',
  [BuildingType.GRAVE_TRAP]: '☠️',
  [BuildingType.BRIDGE]: '🌉',
  [BuildingType.SCOUT_TRAP]: '🪤',
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
  [BuildingType.ARCHER_CAMP]: [UnitType.ARCHER, UnitType.CROSSBOWMAN],
  [BuildingType.RIDER_CAMP]: [UnitType.RIDER],
  [BuildingType.SIEGE_CAMP]: [UnitType.SIEGE],
  [BuildingType.STRONGHOLD]: [UnitType.SCOUT, UnitType.GUARD],
  [BuildingType.CRYSTAL_CHAMBER]: [UnitType.MAGE, UnitType.CRYSTAL_KHYRON],
  [BuildingType.CRYSTAL_CAVE]: [UnitType.CRYSTAL_DRAKE],
};

// ============================================================================
// GAME MENU
// ============================================================================

function getDisplayVersion(full: string): string {
  const parts = full.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : full;
}

const displayVersion = getDisplayVersion(__APP_VERSION__);

async function downloadSaveExport(slotId: string): Promise<void> {
  const blob = await exportSlot(slotId);
  if (!blob) return;
  const meta = await getSlotMeta(slotId);
  const safeName = (meta?.name ?? 'save').replace(/[^\w\s\-().]/g, '_').trim() || 'save';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName}${SAVE.EXPORT_FILE_EXT}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// DEV OPTIONS OVERLAY
// ============================================================================

/* eslint-disable no-restricted-syntax */
function DevOptionsOverlay({ onClose }: { onClose: () => void }) {
  const showAiScores = useDevOptionsStore((s) => s.showAiScores);
  const setShowAiScores = useDevOptionsStore((s) => s.setShowAiScores);
  const showRecruitingScores = useDevOptionsStore((s) => s.showRecruitingScores);
  const setShowRecruitingScores = useDevOptionsStore((s) => s.setShowRecruitingScores);
  const recordAiTrace = useDevOptionsStore((s) => s.recordAiTrace);
  const setRecordAiTrace = useDevOptionsStore((s) => s.setRecordAiTrace);
  const activeSaveId = useMenuStore((s) => s.activeSaveId);
  const turn = useGameStore((s) => s.turn);
  const debugAdvanceLava = useGameStore((s) => s.debugAdvanceLava);
  const debugAddResources = useGameStore((s) => s.debugAddResources);
  const debugGiveSpecialist = useGameStore((s) => s.debugGiveSpecialist);
  const swapSpecialist = useGameStore((s) => s.swapSpecialist);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const specialistSlotCap = useGameStore((s) => s.specialistSlotCap);
  const debugRevealAll = useGameStore((s) => s.debugRevealAll);
  const debugAddFarmers = useGameStore((s) => s.debugAddFarmers);
  const debugAddRuin = useGameStore((s) => s.debugAddRuin);
  const debugAddCrystals = useGameStore((s) => s.debugAddCrystals);
  const debugAddMarketNearNorthStronghold = useGameStore((s) => s.debugAddMarketNearNorthStronghold);
  const debugPlaceMarketAtSelectedTile = useGameStore((s) => s.debugPlaceMarketAtSelectedTile);
  const debugApplyTileStatus = useGameStore((s) => s.debugApplyTileStatus);
  const debugClearTileStatus = useGameStore((s) => s.debugClearTileStatus);
  const selectedTilePos = useGameStore((s) => s.selectedTilePos);
  const showSwap = useSpecialistHireStore((s) => s.showSwap);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [devStatsOpen, setDevStatsOpen] = useState(false);
  const [specPickerOpen, setSpecPickerOpen] = useState(false);
  const [currentTraceMeta, setCurrentTraceMeta] = useState<AiTraceMeta | null>(null);
  const [sealedTraceRuns, setSealedTraceRuns] = useState<AiTraceMeta[]>([]);
  const [traceBusyId, setTraceBusyId] = useState<string | null>(null);

  // Specialists not yet in the player's roster
  const availableSpecialists = useMemo(
    () => Object.entries(SPECIALIST_DEFINITIONS).filter(([id]) => !globalSpecialistStorage.includes(id)),
    [globalSpecialistStorage],
  );

  const handleGrantSpecialist = useCallback((specId: string) => {
    if (globalSpecialistStorage.length < specialistSlotCap) {
      debugGiveSpecialist(specId);
    } else {
      // All slots full — close the dev overlay and trigger the substitute popup
      onClose();
      showSwap(specId, (outcome) => {
        if (outcome.type === 'swap') {
          swapSpecialist(outcome.outgoingId, specId);
        } else if (outcome.type === 'rob') {
          useGameStore.getState().grantCaveSpecialistRobReward();
        }
      });
    }
  }, [globalSpecialistStorage, specialistSlotCap, debugGiveSpecialist, swapSpecialist, showSwap, onClose]);

  const refreshTraceState = useCallback(async () => {
    const [meta, sealedRuns] = await Promise.all([
      activeSaveId && recordAiTrace ? readAiTraceMeta(activeSaveId) : Promise.resolve(null),
      listSealedRuns(),
    ]);
    setCurrentTraceMeta(meta);
    setSealedTraceRuns(sealedRuns);
  }, [activeSaveId, recordAiTrace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    void refreshTraceState();
  }, [refreshTraceState, turn]);

  const handleClearCurrentTrace = useCallback(async () => {
    if (!activeSaveId) return;
    if (!window.confirm('Clear the AI trace for this save?')) return;
    setTraceBusyId(activeSaveId);
    try {
      await deleteRun(activeSaveId);
      await refreshTraceState();
    } finally {
      setTraceBusyId(null);
    }
  }, [activeSaveId, refreshTraceState]);

  const handleDeleteSealedTrace = useCallback(async (slotId: string) => {
    if (!window.confirm('Delete this finished AI trace?')) return;
    setTraceBusyId(slotId);
    try {
      await deleteRun(slotId);
      await refreshTraceState();
    } finally {
      setTraceBusyId(null);
    }
  }, [refreshTraceState]);

  const handleExportSealedTrace = useCallback(async (slotId: string) => {
    setTraceBusyId(slotId);
    try {
      await exportAiTrace(slotId, 'full');
    } finally {
      setTraceBusyId(null);
    }
  }, []);

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
              <span className="hud-dev-option-label">Language (dev)</span>
              <select
                value={locale}
                onChange={(event) => void setLocale(event.target.value as ActiveLocale)}
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>{LOCALE_ENDONYMS[code]}</option>
                ))}
                <option value={PSEUDO_LOCALE}>Pseudo (en-XA)</option>
              </select>
            </label>
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
            <label className="hud-dev-option-row">
              <span className="hud-dev-option-label">Record AI decisions (diagnostics)</span>
              <input
                type="checkbox"
                className="hud-dev-option-toggle"
                checked={recordAiTrace}
                onChange={(e) => setRecordAiTrace(e.target.checked)}
              />
            </label>
            <div className="hud-dev-overlay-section-title">AI Trace</div>
            {activeSaveId && recordAiTrace && currentTraceMeta && currentTraceMeta.rowCount > 0 ? (
              <>
                <AiTraceExportControls slotId={activeSaveId} />
                <button className="hud-dev-action-btn ai-trace-panel-clear" onClick={() => void handleClearCurrentTrace()} disabled={traceBusyId !== null}>
                  {traceBusyId === activeSaveId ? 'Working...' : 'Clear trace for this save'}
                </button>
              </>
            ) : (
              <div className="hud-dev-trace-empty">
                {!activeSaveId
                  ? 'No active run.'
                  : !recordAiTrace
                  ? 'AI trace recording is off for this run.'
                  : 'This run has no AI trace rows yet.'}
              </div>
            )}
            <div className="hud-dev-overlay-section-title">Finished runs</div>
            {sealedTraceRuns.length === 0 ? (
              <div className="hud-dev-trace-empty">No finished AI traces saved.</div>
            ) : (
              <div className="hud-dev-trace-archive-list">
                {sealedTraceRuns.map((meta) => (
                  <div key={meta.slotId} className="hud-dev-trace-archive-row">
                    <div className="hud-dev-trace-archive-main">
                      <div className="hud-dev-trace-archive-title">{meta.slotName || meta.slotId}</div>
                      <div className="hud-dev-trace-archive-meta">
                        {meta.outcome === 'VICTORY' ? 'Victory' : 'Defeat'} · turn {meta.endTurn} · {meta.rowCount} rows · {formatAiTraceBytes(meta.byteEstimate)}
                      </div>
                    </div>
                    <div className="hud-dev-trace-archive-actions">
                      <button className="hud-dev-action-btn" onClick={() => void handleExportSealedTrace(meta.slotId)} disabled={traceBusyId !== null}>
                        {traceBusyId === meta.slotId ? 'Working...' : 'Export'}
                      </button>
                      <button className="hud-dev-action-btn ai-trace-panel-clear" onClick={() => void handleDeleteSealedTrace(meta.slotId)} disabled={traceBusyId !== null}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="hud-dev-overlay-section-title">Stats</div>
            <button className="hud-dev-action-btn" onClick={() => setDevStatsOpen(true)}>📊 Dev Stats</button>
            <div className="hud-dev-overlay-section-title">Actions</div>
            <button className="hud-dev-action-btn" onClick={debugAdvanceLava}>🌋 Advance Lava</button>
            <button className="hud-dev-action-btn" onClick={debugAddResources}>💰 +10 Resources</button>
            <button
              className="hud-dev-action-btn"
              onClick={() => setSpecPickerOpen(true)}
              disabled={availableSpecialists.length === 0}
            >
              🧙 Give Specialist
            </button>
            <button className="hud-dev-action-btn" onClick={debugRevealAll}>👁️ Reveal All</button>
            <button className="hud-dev-action-btn" onClick={debugAddFarmers}>🌾 Add Farm (zone 1)</button>
            <button className="hud-dev-action-btn" onClick={debugAddRuin}>🗿 Add Ruin (near unit)</button>
            <button className="hud-dev-action-btn" onClick={debugAddCrystals}>💎 +5 Crystals</button>
            <button className="hud-dev-action-btn" onClick={debugAddMarketNearNorthStronghold}>🛒 Add Market (north-most stronghold)</button>
            <div className="hud-dev-overlay-section-title">Tile Status (selected tile)</div>
            <div style={{ fontSize: '0.8em', opacity: 0.7, marginBottom: 4 }}>
              {selectedTilePos ? `Selected: (${selectedTilePos.x}, ${selectedTilePos.y})` : 'No tile selected'}
            </div>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={debugPlaceMarketAtSelectedTile}>🛒 Place Market (selected tile)</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={() => debugApplyTileStatus(TileStatus.CORRUPTED)}>☠️ Apply CORRUPTED</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={() => debugApplyTileStatus(TileStatus.FROZEN)}>❄️ Apply FROZEN</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={() => debugApplyTileStatus(TileStatus.BURNING)}>🔥 Apply BURNING</button>
            <button className="hud-dev-action-btn" disabled={!selectedTilePos} onClick={debugClearTileStatus}>🧹 Clear Status</button>
          </div>
        </div>
      </div>
      {devStatsOpen && <DevStatsOverlay onClose={() => setDevStatsOpen(false)} />}
      {specPickerOpen && (
        <DevSpecPickerOverlay
          availableSpecialists={availableSpecialists}
          onSelect={handleGrantSpecialist}
          onClose={() => setSpecPickerOpen(false)}
        />
      )}
    </>,
    document.body,
  );
}
/* eslint-enable no-restricted-syntax */

/** Enemy recruitment building types — buildings that spawn enemy units each turn. */
const ENEMY_RECRUITMENT_TYPES = new Set<BuildingType>([
  BuildingType.LAVALAIR,
  BuildingType.INFERNALSANCTUM,
]);

/* eslint-disable no-restricted-syntax */
function DevStatsOverlay({ onClose }: { onClose: () => void }) {
  const { unitName } = useText();
  const buildings = useGameStore((s) => s.buildings);
  const enemyUnitsSpawnedLastTurn = useGameStore((s) => s.enemyUnitsSpawnedLastTurn);
  const activeWaveTheme = useGameStore((s) => s.activeWaveTheme);
  const lastSpawnBudget = useGameStore((s) => s.lastSpawnBudget);

  const enemyRecruitingBuildingCount = useMemo(
    () => Object.values(buildings).filter(
      (b) => b.faction === Faction.ENEMY && ENEMY_RECRUITMENT_TYPES.has(b.type),
    ).length,
    [buildings],
  );
  const currentThemeLabel = activeWaveTheme.isReadPlayer ? 'Current theme (read player)' : 'Current theme';
  const currentThemeValue = activeWaveTheme.entries.length > 0
    ? activeWaveTheme.entries
      .map((entry) => `${unitName(entry.type)} ${entry.percent}%`)
      .join(', ')
    : 'None';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const spawnBudgetRows: Array<{ label: string; value: number | string; wrapValue?: boolean }> = lastSpawnBudget === null
    ? [{ label: 'Spawn budget', value: 'n/a' }]
    : [
        {
          label: 'Spawn budget',
          value: `${lastSpawnBudget.budget.toFixed(2)} (base ${lastSpawnBudget.base.toFixed(2)} + ember ${lastSpawnBudget.emberTerm.toFixed(2)} + dda ${lastSpawnBudget.ddaRelief.toFixed(2)})`,
        },
        {
          label: 'Lava-stronghold margin / contact',
          value: `${lastSpawnBudget.margin} rows, ${lastSpawnBudget.contactActive ? 'contact' : 'no contact'}`,
        },
        {
          label: 'Spawn accumulator',
          value: `${lastSpawnBudget.accumulatorBefore.toFixed(2)} -> ${lastSpawnBudget.accumulatorAfter.toFixed(2)}`,
        },
        { label: 'Spawns this turn', value: lastSpawnBudget.spawnsNow },
        {
          label: 'Spawner weights',
          value: lastSpawnBudget.spawnerWeights
            .map((sw) => `d=${sw.distance === Infinity ? 'inf' : sw.distance.toFixed(2)} w=${sw.weight.toFixed(2)}${sw.picked ? '*' : ''}`)
            .join(' '),
          wrapValue: true,
        },
      ];

  const stats: Array<{ label: string; value: number | string; wrapValue?: boolean }> = [
    { label: 'Enemy recruiting buildings', value: enemyRecruitingBuildingCount },
    { label: 'Enemy units spawned last turn', value: enemyUnitsSpawnedLastTurn },
    { label: currentThemeLabel, value: currentThemeValue, wrapValue: true },
    ...spawnBudgetRows,
  ];

  return (
    <div className="hud-dev-overlay-backdrop" onClick={onClose}>
      <div className="hud-dev-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="hud-dev-overlay-header">
          <span>📊 Dev Stats</span>
          <button className="hud-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="hud-dev-overlay-body">
          {stats.map(({ label, value, wrapValue }) => (
            <div key={label} className="hud-dev-stat-row">
              <span className="hud-dev-stat-label">{label}</span>
              <span className={`hud-dev-stat-value${wrapValue ? ' hud-dev-stat-value--wrap' : ''}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
/* eslint-enable no-restricted-syntax */

/* eslint-disable no-restricted-syntax */
function DevSpecPickerOverlay({
  availableSpecialists,
  onSelect,
  onClose,
}: {
  availableSpecialists: Array<[string, SpecialistDefinition]>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { specialistName, specialistDesc } = useText();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="hud-dev-overlay-backdrop" onClick={onClose}>
      <div className="hud-modal" style={{ zIndex: 10001 }} onClick={(e) => e.stopPropagation()}>
        <div className="hud-modal-header">
          <span>🧙 Choose Specialist</span>
          <button className="hud-modal-close" onClick={onClose}>✕</button>
        </div>
        <ul className="hud-modal-list">
          {availableSpecialists.map(([id]) => (
            <li key={id} className="hud-modal-item">
              <div className="hud-modal-item-info">
                <span className="hud-modal-item-name">🧙 {specialistName(id)}</span>
                <span className="hud-modal-item-desc">{specialistDesc(id)}</span>
              </div>
              <button
                className="hud-modal-assign-btn"
                onClick={() => { onSelect(id); onClose(); }}
              >
                <FitText text="Give" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
/* eslint-enable no-restricted-syntax */

// ============================================================================
// DIFFICULTY OVERLAY
// ============================================================================

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'hud.difficulty.easyDescription',
  [Difficulty.STANDARD]: 'hud.difficulty.standardDescription',
  [Difficulty.HARD]: 'hud.difficulty.hardDescription',
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
  const { difficultyLabel, t } = useText();
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
          <span>⚔️ {t('hud.difficulty.title')}</span>
          <button className="hud-close-btn" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div className="hud-difficulty-overlay-body">
          {([Difficulty.EASY, Difficulty.STANDARD, Difficulty.HARD] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`hud-difficulty-btn${currentDifficulty === d ? ' hud-difficulty-btn--active' : ''}`}
              onClick={() => onSelect(d)}
            >
              <FitText className="hud-difficulty-btn-label" text={`${DIFFICULTY_EMOJI[d]} ${difficultyLabel(d)}`} />
              <span className="hud-difficulty-btn-desc">
                {t(DIFFICULTY_DESC[d] as 'hud.difficulty.easyDescription' | 'hud.difficulty.standardDescription' | 'hud.difficulty.hardDescription', {
                  multiplier: DIFFICULTY_MULTIPLIER[d],
                  turns: getLavaAdvanceInterval(d),
                })}
              </span>
            </button>
          ))}
          <p className="hud-difficulty-note">{t('hud.difficulty.startingNote')}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// OPTIONS OVERLAY
// ============================================================================

function OptionsOverlay({ onClose }: { onClose: () => void }) {
  const locale = useLocaleStore((s) => s.locale);
  const { t } = useText();
  const volume = useSoundOptionsStore((s) => s.volume);
  const muted = useSoundOptionsStore((s) => s.muted);
  const setVolume = useSoundOptionsStore((s) => s.setVolume);
  const setMuted = useSoundOptionsStore((s) => s.setMuted);
  const phase = useGameStore((s) => s.phase);
  const hintsEnabled = useHintOptionsStore((s) => s.hintsEnabled);
  const setHintsEnabled = useHintOptionsStore((s) => s.setHintsEnabled);
  const resetShowCounts = useHintOptionsStore((s) => s.resetShowCounts);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleReturnToMenu = useCallback(async () => {
    stopGameMusic();
    onClose();
    const activeSaveId = useMenuStore.getState().activeSaveId;
    if (activeSaveId) {
      if (phase === GamePhase.GAME_OVER || phase === GamePhase.VICTORY) {
        await deleteSlot(activeSaveId);
      } else {
        // Autosave the current state before leaving.
        // Strip Zustand action methods — IDB's structured-clone algorithm throws
        // DataCloneError on functions, silently failing the save.
        const fullStore = useGameStore.getState();
        const currentState = Object.fromEntries(
          Object.entries(fullStore).filter(([, v]) => typeof v !== 'function'),
        ) as GameState;
        const meta = await getSlotMeta(activeSaveId);
        const slotName = meta?.name ?? String(currentState.turn);
        await saveSlot({ id: activeSaveId, name: slotName, state: currentState });
      }
      useMenuStore.setState({ activeSaveId: null });
    }
    useMenuStore.getState().toMenu();
  }, [onClose, phase]);

  const handleResetHints = useCallback(() => {
    resetShowCounts();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 1500);
  }, [resetShowCounts]);

  return createPortal(
    <div className="hud-dev-overlay-backdrop" onClick={onClose}>
      <div className="hud-dev-overlay hud-options-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="hud-dev-overlay-header">
          <span>⚙️ {t('hud.options.title')}</span>
          <button className="hud-modal-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div className="hud-dev-overlay-body">
          <div className="hud-dev-overlay-section-title">{t('hud.options.soundSection')}</div>
          <div className="hud-options-volume-row">
            <span className="hud-options-volume-label">🔊 {t('hud.options.volume')}</span>
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
              aria-label={t('hud.options.soundVolume')}
            />
            <button
              className={`hud-options-mute-btn${muted ? ' hud-options-mute-btn--muted' : ''}`}
              onClick={() => setMuted(!muted)}
              aria-label={t(muted ? 'hud.options.unmute' : 'hud.options.mute')}
              title={t(muted ? 'hud.options.unmute' : 'hud.options.mute')}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
          <hr className="hud-options-separator" />
          {RELEASE_LOCALES.length > 1 && (
            <>
              <div className="hud-options-language-row">
                <span className="hud-options-hints-label">{t('options.language')}</span>
                <div className="hud-options-language-buttons">
                  {RELEASE_LOCALES.map((code) => (
                    <button
                      key={code}
                      className={`hud-options-language-btn${locale === code ? ' hud-options-language-btn--active' : ''}`}
                      aria-pressed={locale === code}
                      onClick={() => void useLocaleStore.getState().setLocale(code)}
                    >
                      <FitText text={LOCALE_ENDONYMS[code]} />
                    </button>
                  ))}
                </div>
              </div>
              <hr className="hud-options-separator" />
            </>
          )}
          <div className="hud-dev-overlay-section-title">{t('hud.options.hintsSection')}</div>
          <div className="hud-options-hints-row">
            <span className="hud-options-hints-label">💡 {t('hud.options.showHints')}</span>
            <button
              className={`hud-options-hints-toggle${hintsEnabled ? ' hud-options-hints-toggle--on' : ''}`}
              onClick={() => setHintsEnabled(!hintsEnabled)}
              aria-pressed={hintsEnabled}
              aria-label={t(hintsEnabled ? 'hud.options.disableHints' : 'hud.options.enableHints')}
            >
              {t(hintsEnabled ? 'common.on' : 'common.off')}
            </button>
          </div>
          <div className="hud-options-hints-row">
            <span className="hud-options-hints-label">🔄 {t('hud.options.resetHintCounters')}</span>
            <button
              className="hud-options-hints-reset"
              onClick={handleResetHints}
              aria-label={t('hud.options.resetHintCounters')}
            >
              <FitText text={t(resetDone ? 'common.done' : 'common.reset')} />
            </button>
          </div>
          <hr className="hud-options-separator" />
          <button
            className="hud-menu-item hud-menu-item--danger"
            onClick={handleReturnToMenu}
            title={t('hud.options.saveReturnToMenu')}
          >
            <FitText text={`🏠 ${t('hud.options.mainMenu')}`} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GameMenu() {
  const { difficultyLabel, t } = useText();
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

  const persistCurrentGameForReload = useCallback(async () => {
    if (!idbAvailable()) return;
    const fullStore = useGameStore.getState();
    const stateSnapshot = Object.fromEntries(
      Object.entries(fullStore).filter(([, value]) => typeof value !== 'function'),
    ) as GameState;

    let activeSaveId = useMenuStore.getState().activeSaveId;
    let slotName: string | null = null;

    if (activeSaveId) {
      const meta = await getSlotMeta(activeSaveId);
      slotName = meta?.name ?? null;
    } else {
      const slots = await listSlots();
      activeSaveId = generateId('slot');
      slotName = getNextDefaultSlotName(slots);
      useMenuStore.setState({ activeSaveId });
    }

    if (!slotName) {
      slotName = getNextDefaultSlotName(await listSlots());
    }

    await saveSlotStrict({ id: activeSaveId, name: slotName, state: stateSnapshot });
  }, []);

  const handleResetCache = useCallback(async () => {
    try {
      await persistCurrentGameForReload();
    } catch (error) {
      console.error('Failed to save before cache reset reload.', error);
      window.alert(t('hud.gameMenu.reloadSaveFailed'));
      return;
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    window.location.reload();
  }, [persistCurrentGameForReload, t]);

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
        aria-label={t('hud.gameMenu.menu')}
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
              <FitText text={`💾 ${t('hud.gameMenu.saveGame')}`} />
            </button>
            {saveExists && (
              <button className="hud-menu-item" role="menuitem" onClick={handleClearSave}>
                <FitText text={`🗑️ ${t('hud.gameMenu.clearSave')}`} />
              </button>
            )}
            <button className="hud-menu-item" role="menuitem" onClick={handleNewGame}>
              <FitText text={`🔄 ${t('hud.gameMenu.newGame')}`} />
            </button>
            <button
              className="hud-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); setDifficultyOverlayOpen(true); }}
            >
              <FitText text={`⚔️ ${t('hud.gameMenu.difficulty', { difficulty: `${DIFFICULTY_EMOJI[currentDifficulty]} ${difficultyLabel(currentDifficulty)}` })}`} />
            </button>
            <button className="hud-menu-item" role="menuitem" onClick={handleResetCache}>
              <FitText text={`🗑️ ${t('hud.gameMenu.resetCacheReload')}`} />
            </button>
            <button
              className="hud-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); setOptionsOverlayOpen(true); }}
            >
              <FitText text={`⚙️ ${t('hud.options.title')}`} />
            </button>
            <button
              className="hud-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); setDevOptionsOverlayOpen(true); }}
            >
              <FitText text={`🛠️ ${t('hud.gameMenu.devOptions')}`} />
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

/** Renders a net-income badge (green for positive, red for negative, hidden for zero). */
function NetIncomeBadge({ gross, upkeep }: { gross: number; upkeep: number }) {
  const { formatSigned } = useText();
  const net = gross - upkeep;
  if (net === 0) return null;
  return (
    <span className={net > 0 ? 'hud-income' : 'hud-income-negative'}>
      ({formatSigned(net)})
    </span>
  );
}

// ============================================================================
// HINT BANNER
// ============================================================================

function HintBanner() {
  const { hintShort, hintDetail, t } = useText();
  const activeHintId = useHintStore((s) => s.activeHintId);
  const expanded = useHintStore((s) => s.expanded);
  const dismissActive = useHintStore((s) => s.dismissActive);
  const toggleExpanded = useHintStore((s) => s.toggleExpanded);

  if (!activeHintId) return null;

  return (
    <>
      <div className="hud-hint-backdrop" aria-hidden="true" />
      <div className="hud-hint-banner">
        <div className="hud-hint-banner-row">
          <span className="hud-hint-banner-text">{hintShort(activeHintId)}</span>
          <button
            className="hud-hint-banner-more"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'hud.hintBanner.collapse' : 'hud.hintBanner.expand')}
          >
            {t(expanded ? 'common.less' : 'common.more')}
          </button>
          <button
            className="hud-hint-banner-dismiss"
            onClick={dismissActive}
            aria-label={t('hud.hintBanner.dismiss')}
          >
            ✕
          </button>
        </div>
        {expanded && (
          <div className="hud-hint-banner-detail">{hintDetail(activeHintId)}</div>
        )}
      </div>
    </>
  );
}

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
  const { specialistName, formatSigned, t } = useText();
  const resources = useGameStore((s) => s.resources);
  const emberRaw = useGameStore((s) => s.ember);
  const pendingEmberOffset = useEmberDisplayStore((s) => s.pendingEmberOffset);
  const ember = Math.max(0, emberRaw - pendingEmberOffset);
  const turnsUntilLavaAdvance = useGameStore((s) => s.turnsUntilLavaAdvance);

  // Population usage and capacity (both live) — select primitives to avoid infinite re-render
  const farmersUsed = useGameStore((s) => computePopulationUsage(s).farmersUsed);
  const noblesUsed = useGameStore((s) => computePopulationUsage(s).noblesUsed);
  const farmerCapacity = useGameStore((s) => computePopulationCapacity(s).farmerCapacity);
  const nobleCapacity = useGameStore((s) => computePopulationCapacity(s).nobleCapacity);

  // Resource income per turn (gross) and specialist upkeep; net shown in HUD
  const ironPerTurn = useGameStore((s) => computeResourceIncome(s).ironPerTurn);
  const woodPerTurn = useGameStore((s) => computeResourceIncome(s).woodPerTurn);
  const ironUpkeep = useGameStore((s) => computeSpecialistUpkeep(s).ironUpkeep + computeBuildingUpkeep(s).ironUpkeep);
  const woodUpkeep = useGameStore((s) => computeSpecialistUpkeep(s).woodUpkeep + computeBuildingUpkeep(s).woodUpkeep);

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

  // Population info popup state: 'farmers' | 'nobles' | null
  const [populationPopup, setPopulationPopup] = useState<'farmers' | 'nobles' | null>(null);

  // Ember info popup
  const [emberPopupOpen, setEmberPopupOpen] = useState(false);

  // Crystal income per turn
  const crystalsPerTurn = useGameStore((s) => computeCrystalIncomePerTurn(s).crystalsPerTurn);
  const formattedCrystalIncome = formatSigned(crystalsPerTurn);

  return (
    <>
      <div className="hud-top-bar">
        <button className="hud-stat hud-stat--clickable" onClick={() => setResourcePopup('iron')}>⛓️ {resources.iron}<NetIncomeBadge gross={ironPerTurn} upkeep={ironUpkeep} /></button>
        <button className="hud-stat hud-stat--clickable" onClick={() => setResourcePopup('wood')}>🪵 {resources.wood}<NetIncomeBadge gross={woodPerTurn} upkeep={woodUpkeep} /></button>
        <button className="hud-stat hud-stat--clickable" onClick={() => setPopulationPopup('farmers')}>🌾 {farmersUsed}/{farmerCapacity}</button>
        <button className="hud-stat hud-stat--clickable" onClick={() => setPopulationPopup('nobles')}>🎖️ {noblesUsed}/{nobleCapacity}</button>
        <button className="hud-stat hud-stat--clickable" data-hud-target="ember" onClick={() => setEmberPopupOpen(true)} aria-label={t('hud.topBar.emberCounter', { amount: ember })}>🔥 {t('hud.topBar.ember')} {ember}</button>
      <span className="hud-stat">🌋 {t('hud.topBar.lavaCounter', { turns: turnsUntilLavaAdvance })}</span>
      <button className="hud-stat hud-stat--clickable" onClick={() => setResourcePopup('crystal')}>
        💎 {arcaneCrystals}{crystalsPerTurn > 0 && <span className="hud-income">({formattedCrystalIncome})</span>}
      </button>
      {showTechButton && (
        <button className={`hud-tech-tree-btn${showTechBadge ? ' hud-tech-tree-btn--notify' : ''}`} onClick={onOpenTechTree}>
          <FitText text={`🔬 ${t('hud.topBar.techTree')}`} />
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
                title={t('hud.specialistSlot.title', { name: specialistName(spec.id) })}
              >
                <FitText className="hud-specialist-slot-name" text={`🧙 ${specialistName(spec.id)}`} title={specialistName(spec.id)} />
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
      {populationPopup && (
        <PopulationInfoPopup
          populationType={populationPopup}
          onClose={() => setPopulationPopup(null)}
        />
      )}
      {emberPopupOpen && (
        <EmberInfoPopup onClose={() => setEmberPopupOpen(false)} />
      )}
      <GameMenu />
    </div>
    <HintBanner />
    </>
  );
}

/** Tags that are internal implementation details and should not be shown to the player */
const HIDDEN_UNIT_TAGS = new Set<string>([]);

// ============================================================================
// SHARED INFO POPUP COMPONENTS
// ============================================================================

/** Guard period (ms) after popup mount before backdrop click can close it.
 *  Prevents the synthetic touch event from the opening tap immediately closing the portal. */
const POPUP_CLICK_GUARD_MS = 200;

/** Reusable popup shell — backdrop + centered card, dismisses on outside tap */
function Popup({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // Capture mount time so we can ignore phantom clicks fired by the opening tap.
  // Popup is always unmounted/remounted when its parent conditionally renders it,
  // so useRef(Date.now()) reliably records the actual mount timestamp.
  const openTimeRef = useRef<number>(0);
  useEffect(() => { openTimeRef.current = Date.now(); }, []);
  return createPortal(
    <div
      className="info-popup-backdrop"
      onClick={() => { if (Date.now() - openTimeRef.current >= POPUP_CLICK_GUARD_MS) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="info-popup-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Tag info popup — shows label + description with an OK button */
function TagPopup({ tag, disabledByCorruption, onClose }: { tag: UnitTag; disabledByCorruption?: boolean; onClose: () => void }) {
  const { tagLabel, tagDesc, t } = useText();
  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header-name" style={{ marginBottom: 10 }}>{tagLabel(tag)}</div>
      {disabledByCorruption && (
        <p className="info-popup-corruption-notice">{t('hud.tagPopup.disabledByCorruption')}</p>
      )}
      <p className="info-popup-desc" style={{ marginBottom: 16 }}>{tagDesc(tag)}</p>
      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.ok')} /></button>
    </Popup>
  );
}

/** Spell info popup — shown when clicking a spell tile in the tech tree */
function SpellInfoPopup({ spellId, onClose }: { spellId: SpellId; onClose: () => void }) {
  const { spellName, spellDesc, t } = useText();
  const def = SPELL_DEFINITIONS[spellId];
  if (!def) return null;
  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{def.emoji}</span>
        <div>
          <div className="info-popup-header-name">{spellName(spellId)}</div>
          <div className="info-popup-header-cost">{t('common.castCost', { amount: MAGE.SPELL_CAST_CRYSTAL_COST })}</div>
        </div>
      </div>
      <p className="info-popup-desc" style={{ marginBottom: 16 }}>{spellDesc(spellId)}</p>
      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.ok')} /></button>
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
  const { resourceName, buildingName, specialistName, techName, formatNumber, formatSigned, t } = useText();
  // Use stable Immer references as memo dependencies so that the selectors
  // passed to useSyncExternalStore (Zustand v5) always return the same
  // reference between consecutive snapshot calls, preventing the
  // "getSnapshot should be cached" invariant violation that caused a crash.
  const buildings = useGameStore((s) => s.buildings);
  const techFlags = useGameStore((s) => s.techFlags);
  const techNodes = useGameStore((s) => s.techNodes);
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);

  // Crystal income — recomputes when crystal-income-related state changes
  const {
    crystalsPerTurn,
    resonatingChambers,
    echoWardenBonus,
    echoWardenChambers,
    graveHarvestExpected,
    gravestoneCount,
  } = useMemo(
    () => computeCrystalIncomePerTurn(useGameStore.getState()),
    [buildings, techFlags, specialists, globalSpecialistStorage],
  );

  // Iron/wood breakdown — recomputes when any relevant state changes
  const entries = useMemo(
    () => computeResourceIncomeBreakdown(useGameStore.getState()),
    [buildings, techNodes, specialists, globalSpecialistStorage],
  );

  const fmtPositive = (n: number): string => formatSigned(n);

  if (resourceType === 'crystal') {
    return (
      <Popup onClose={onClose}>
        <div className="info-popup-header">
          <span className="info-popup-header-emoji">💎</span>
          <div className="info-popup-header-name">{resourceName('CRYSTAL')}</div>
        </div>
        <div className="resource-popup-current">{t('hud.resourceInfo.current', { amount: formatNumber(current) })}</div>
        <div className="resource-popup-section-title">{t('hud.resourceInfo.incomeThisTurn')}</div>
        {resonatingChambers === 0 && echoWardenBonus === 0 && graveHarvestExpected === 0 ? (
          <div className="resource-popup-row resource-popup-row--none">
            {t('hud.resourceInfo.noIncomeSources')}
          </div>
        ) : (
          <>
            {resonatingChambers > 0 && (
              <div className="resource-popup-row">
                <span className="resource-popup-row-label">{t('hud.resourceInfo.resonatingChambers', { building: buildingName(BuildingType.CRYSTAL_CHAMBER), count: resonatingChambers })}</span>
                <span className="resource-popup-row-value">
                  {fmtPositive(resonatingChambers * CRYSTAL_CHAMBER_CONFIG.CRYSTALS_PER_CHAMBER_PER_TURN)}
                </span>
              </div>
            )}
            {echoWardenBonus > 0 && (
              <div className="resource-popup-row">
                <span className="resource-popup-row-label">{t('hud.resourceInfo.echoWarden', { specialist: specialistName('spec_18'), count: echoWardenChambers })}</span>
                <span className="resource-popup-row-value">{fmtPositive(echoWardenBonus)}</span>
              </div>
            )}
            {techFlags.includes(TechFlag.GRAVE_HARVEST) && gravestoneCount > 0 && (
              <div className="resource-popup-row">
                <span className="resource-popup-row-label">{t('hud.resourceInfo.graveHarvest', { tech: techName('GRAVE_HARVEST'), count: gravestoneCount, chance: MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE })}</span>
                <span className="resource-popup-row-value">~{fmtPositive(graveHarvestExpected)}</span>
              </div>
            )}
          </>
        )}
        <div className="resource-popup-total">
          <span>{t('hud.resourceInfo.perTurn')}</span>
          <span className="resource-popup-total-positive">
            {fmtPositive(crystalsPerTurn)}
          </span>
        </div>
        <p className="info-popup-desc" style={{ marginTop: 10, marginBottom: 8, fontSize: '0.82em', opacity: 0.8 }}>
          {t('hud.resourceInfo.crystalDescription')}
        </p>
        <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 6 }} onClick={onClose}><FitText text={t('common.close')} /></button>
      </Popup>
    );
  }

  const isIron = resourceType === 'iron';
  const emoji = isIron ? '⛓️' : '🪵';
  const label = resourceName(isIron ? 'IRON' : 'WOOD');

  const totalIncome = entries.reduce((sum, e) => sum + (isIron ? e.iron : e.wood), 0);

  const fmt = (n: number): string => formatSigned(n);

  // Filter entries that have a non-zero contribution for this resource type
  const relevantEntries = entries.filter((e) => (isIron ? e.iron : e.wood) !== 0);

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{emoji}</span>
        <div className="info-popup-header-name">{label}</div>
      </div>
      <div className="resource-popup-current">{t('hud.resourceInfo.current', { amount: formatNumber(current) })}</div>
      <div className="resource-popup-section-title">{t('hud.resourceInfo.incomeThisTurn')}</div>
      {relevantEntries.length === 0 ? (
        <div className="resource-popup-row resource-popup-row--none">{t('hud.resourceInfo.noIncomeSources')}</div>
      ) : (
        relevantEntries.map((e, i) => {
          const amount = isIron ? e.iron : e.wood;
          return (
            <div key={i} className={`resource-popup-row${amount < 0 ? ' resource-popup-row--negative' : ''}`}>
              <span className="resource-popup-row-label">{t(e.label)}</span>
              <span className="resource-popup-row-value">{fmt(amount)}</span>
            </div>
          );
        })
      )}
      <div className="resource-popup-total">
        <span>{t('hud.resourceInfo.netIncome')}</span>
        <span className={totalIncome >= 0 ? 'resource-popup-total-positive' : 'resource-popup-total-negative'}>
          {fmt(totalIncome)}
        </span>
      </div>
      <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 14 }} onClick={onClose}><FitText text={t('common.close')} /></button>
    </Popup>
  );
}

/** Population info popup — shows capacity sources and unit usage breakdown */
function PopulationInfoPopup({
  populationType,
  onClose,
}: {
  populationType: 'farmers' | 'nobles';
  onClose: () => void;
}) {
  const { populationName, unitName, formatNumber, t } = useText();
  // Use stable Immer references as memo dependencies to avoid invariant violation
  const buildings = useGameStore((s) => s.buildings);
  const units = useGameStore((s) => s.units);
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);

  const breakdown = useMemo(
    () => computePopulationBreakdown(useGameStore.getState()),
    [buildings, units, specialists, globalSpecialistStorage],
  );

  const isFarmers = populationType === 'farmers';
  const emoji = isFarmers ? '🌾' : '🎖️';
  const label = populationName(isFarmers ? 'farmer' : 'noble');
  const capacity = isFarmers ? breakdown.farmerCapacity : breakdown.nobleCapacity;
  const used = isFarmers ? breakdown.farmersUsed : breakdown.noblesUsed;

  const capacityRows = breakdown.capacityEntries.filter((e) =>
    isFarmers ? e.farmers > 0 : e.nobles > 0,
  );
  const usageRows = breakdown.usageEntries.filter((e) =>
    isFarmers ? e.farmers > 0 : e.nobles > 0,
  );

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{emoji}</span>
        <div className="info-popup-header-name">{label}</div>
      </div>
      <div className="resource-popup-current">{t('hud.populationInfo.usedOfCapacity', { used: formatNumber(used), capacity: formatNumber(capacity) })}</div>
      <div className="resource-popup-section-title">{t('hud.populationInfo.capacitySources')}</div>
      {capacityRows.length === 0 ? (
        <div className="resource-popup-row resource-popup-row--none">{t('hud.populationInfo.noCapacitySources')}</div>
      ) : (
        capacityRows.map((e, i) => (
          <div key={i} className="resource-popup-row">
            <span className="resource-popup-row-label">{t(e.label)}</span>
            <span className="resource-popup-row-value">{isFarmers ? e.farmers : e.nobles}</span>
          </div>
        ))
      )}
      <div className="resource-popup-total">
        <span>{t('hud.populationInfo.totalCapacity')}</span>
        <span className="resource-popup-total-positive">{capacity}</span>
      </div>
      <div className="resource-popup-section-title">{t('hud.populationInfo.unitUsage')}</div>
      {usageRows.length === 0 ? (
        <div className="resource-popup-row resource-popup-row--none">
          {t('hud.populationInfo.noUnitsUsingPopulation', { population: label })}
        </div>
      ) : (
        usageRows.map((e, i) => (
          <div key={i} className="resource-popup-row">
            <span className="resource-popup-row-label">
              {UNIT_EMOJI[e.unitType] ?? ''} {t('hud.populationInfo.unitCount', { unit: unitName(e.unitType), count: e.count })}
            </span>
            <span className="resource-popup-row-value">{isFarmers ? e.farmers : e.nobles}</span>
          </div>
        ))
      )}
      <div className="resource-popup-total">
        <span>{t('hud.populationInfo.totalUsed')}</span>
        <span className={used > capacity ? 'resource-popup-total-negative' : 'resource-popup-total-positive'}>
          {used}
        </span>
      </div>
      <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 14 }} onClick={onClose}><FitText text={t('common.close')} /></button>
    </Popup>
  );
}

/** Shared base for tappable tag pills — renders a labelled button with an "i" badge */
function TagPillBase({ label, onClick, inactive, active, highlight, onHighlightEnd }: { label: string; onClick: () => void; inactive?: boolean; active?: boolean; highlight?: boolean; onHighlightEnd?: () => void }) {
  return (
    <button
      className={`info-popup-tag-pill${inactive ? ' info-popup-tag-pill--inactive' : ''}${active ? ' info-popup-tag-pill--active' : ''}${highlight ? ' info-popup-tag-pill--highlight' : ''}`}
      onClick={onClick}
      onAnimationEnd={highlight ? onHighlightEnd : undefined}
    >
      {label}
      <span className="info-popup-tag-pill-i">i</span>
    </button>
  );
}

/** Tappable tag pill used in panels and popups */
function InfoTagPill({ tag, onClick, inactive, active, highlight, onHighlightEnd }: { tag: UnitTag; onClick: () => void; inactive?: boolean; active?: boolean; highlight?: boolean; onHighlightEnd?: () => void }) {
  const { tagLabel } = useText();
  return <TagPillBase label={tagLabel(tag)} onClick={onClick} inactive={inactive} active={active} highlight={highlight} onHighlightEnd={onHighlightEnd} />;
}

/** Tag info popup for terrain tags (tile status) */
function TerrainTagPopup({ tag, onClose }: { tag: TerrainTag; onClose: () => void }) {
  const { terrainTagLabel, terrainTagDesc, t } = useText();
  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header-name" style={{ marginBottom: 10 }}>{terrainTagLabel(tag)}</div>
      <p className="info-popup-desc" style={{ marginBottom: 16 }}>{terrainTagDesc(tag)}</p>
      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.ok')} /></button>
    </Popup>
  );
}

/** Tappable terrain-tag pill for terrain status (used in SelectedTilePanel) */
function TerrainTagPill({ tag, onClick }: { tag: TerrainTag; onClick: () => void }) {
  const { terrainTagLabel } = useText();
  return <TagPillBase label={terrainTagLabel(tag)} onClick={onClick} />;
}

/** Ember Level info popup — explains what Ember Level does and shows source breakdown */
function EmberInfoPopup({ onClose }: { onClose: () => void }) {
  const ember = useGameStore((s) => s.ember);
  const sources = useGameStore((s) => s.emberLevelSources);
  const { formatNumber, t } = useText();
  const { turns, emberlingSacrifices, other } = sources;

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">🔥</span>
        <div className="info-popup-header-name">{t('hud.emberInfo.title')}</div>
      </div>
      <div className="resource-popup-current">{t('hud.emberInfo.currentLevel', { amount: formatNumber(ember) })}</div>
      <p className="info-popup-desc" style={{ margin: '8px 0', fontSize: '0.85em' }}>
        {t('hud.emberInfo.description')}
      </p>
      <div className="resource-popup-section-title">{t('hud.emberInfo.sourceBreakdown')}</div>
      <div className="resource-popup-row">
        <span className="resource-popup-row-label">{t('hud.emberInfo.turnProgression')}</span>
        <span className="resource-popup-row-value">+{turns}</span>
      </div>
      <div className="resource-popup-row">
        <span className="resource-popup-row-label">{t('hud.emberInfo.emberlingSacrifices')}</span>
        <span className="resource-popup-row-value">+{emberlingSacrifices}</span>
      </div>
      {other > 0 && (
        <div className="resource-popup-row">
          <span className="resource-popup-row-label">{t('hud.emberInfo.otherSources')}</span>
          <span className="resource-popup-row-value">+{other}</span>
        </div>
      )}
      <div className="resource-popup-total">
        <span>{t('hud.emberInfo.total')}</span>
        <span>{ember}</span>
      </div>
      <button className="info-popup-btn info-popup-btn--secondary" style={{ marginTop: 14 }} onClick={onClose}><FitText text={t('common.close')} /></button>
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
  const { unitName, unitDesc, statAbbr, formatNumber, t } = useText();
  const [tagPopup, setTagPopup] = useState<UnitTag | null>(null);
  const desc = unitDesc(unitType);
  const baseTags = UNIT_DEFINITIONS[unitType]?.tags ?? [];
  const emoji = UNIT_EMOJI[unitType] ?? '?';
  const name = unitName(unitType);

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
              [statAbbr('attack'), stats.attack],
              [statAbbr('defense'), stats.defense],
              [statAbbr('moveRange'), stats.moveRange],
              [statAbbr('attackRange'), stats.attackRange] as const,
              [statAbbr('discoverRadius'), stats.discoverRadius],
            ] as const).map(([l, v]) => (
              <div key={l} className="info-popup-stat-cell">
                <div className="info-popup-stat-label">{l}</div>
                <div className="info-popup-stat-value">{formatNumber(v)}</div>
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
            <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.back')} /></button>
            <button className="info-popup-btn info-popup-btn--primary" onClick={onAction}><FitText text={actionLabel ?? t('common.ok')} /></button>
          </div>
        ) : (
          <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>
            <FitText text={t(isReadOnly ? 'common.ok' : 'common.back')} />
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
  crystalCost,
  onAction,
  actionLabel,
  onClose,
  isReadOnly,
}: {
  buildingType: BuildingType;
  cost?: { iron: number; wood: number };
  crystalCost?: number;
  onAction?: () => void;
  actionLabel?: string;
  onClose: () => void;
  isReadOnly?: boolean;
}) {
  const { buildingName, buildingDesc, t } = useText();
  const def = BUILDING_DEFINITIONS[buildingType];
  const desc = buildingDesc(buildingType);
  const emoji = BUILDING_EMOJI[buildingType] ?? '?';
  const name = buildingName(buildingType);
  const upkeepIron = def?.upkeepIron ?? 0;
  const upkeepWood = def?.upkeepWood ?? 0;
  const hasUpkeep = upkeepIron > 0 || upkeepWood > 0;
  const derivedCost = cost ?? (
    (def?.constructionCost?.iron || def?.constructionCost?.wood)
      ? def.constructionCost
      : undefined
  );

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">{emoji}</span>
        <div>
          <div className="info-popup-header-name">{name}</div>
          {derivedCost && <div className="info-popup-header-cost">{t('hud.buildingInfo.buildCost', { iron: derivedCost.iron, wood: derivedCost.wood })}</div>}
          {crystalCost !== undefined && <div className="info-popup-header-cost">{t('common.castCost', { amount: crystalCost })}</div>}
          {hasUpkeep && <div className="info-popup-header-cost">{t('hud.buildingInfo.upkeep', { iron: upkeepIron, wood: upkeepWood })}</div>}
        </div>
      </div>

      {desc && <p className="info-popup-desc" style={{ marginBottom: 18 }}>{desc}</p>}

      {!isReadOnly && onAction ? (
        <div className="info-popup-actions">
          <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.back')} /></button>
          <button className="info-popup-btn info-popup-btn--primary" onClick={onAction}><FitText text={actionLabel ?? t('common.construct')} /></button>
        </div>
      ) : (
        <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}>
          <FitText text={t(isReadOnly ? 'common.ok' : 'common.back')} />
        </button>
      )}
    </Popup>
  );
}

// ============================================================================
// AI SCORE MODAL (dev option)
// ============================================================================

/* eslint-disable no-restricted-syntax */
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
/* eslint-enable no-restricted-syntax */

/* eslint-disable no-restricted-syntax */
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
/* eslint-enable no-restricted-syntax */

// ============================================================================
// STAT HELPERS (used by UnitCombinedInfoPopup and BuildingStatDetailModal)
// ============================================================================

type StatModEntry = {
  stat: string;
  value: number;
  displayValue?: string;
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
  const { buildingName, statAbbr, formatSigned, t } = useText();
  const fortifiedGarrisonActive = useGameStore((s) => s.fortifiedGarrisonActive);
  const gameState = useGameStore((s) => s);

  if (!building.combatStats) return null;

  const isGarrisonBuilding =
    building.faction === Faction.PLAYER &&
    (building.type === BuildingType.WATCHTOWER || building.type === BuildingType.OUTPOST ||
     building.type === BuildingType.CRYSTAL_TOWER);

  type BuildingModEntry = { stat: string; value: number; source: string };
  const mods: BuildingModEntry[] = [];

  if (isGarrisonBuilding && fortifiedGarrisonActive) {
    mods.push({
      stat: statAbbr('attack'),
      value: ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS,
      source: t('hud.statSource.fortifiedGarrison'),
    });
    mods.push({
      stat: statAbbr('attackRange'),
      value: ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS,
      source: t('hud.statSource.fortifiedGarrison'),
    });
  }

  // Crystal Tower: show chamber link bonus if any chambers are connected
  const chamberBonus = getCrystalTowerChamberBonus(gameState, building);
  if (chamberBonus > 0) {
    const connectedCount = chamberBonus / MAGE.CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS;
    mods.push({
      stat: statAbbr('attack'),
      value: chamberBonus,
      source: t('hud.statSource.crystalChamberLink', {
        building: buildingName(BuildingType.CRYSTAL_CHAMBER),
        count: connectedCount,
      }),
    });
  }

  const bonuses = mods.filter((m) => m.value > 0);
  const penalties = mods.filter((m) => m.value < 0);

  return (
    <Popup onClose={onClose}>
      <div className="info-popup-header">
        <span className="info-popup-header-emoji">📊</span>
        <div className="info-popup-header-name">
          {t('hud.buildingStatDetail.title', { building: buildingName(building.type) })}
        </div>
      </div>

      {bonuses.length === 0 && penalties.length === 0 ? (
        <p className="info-popup-desc">{t('hud.buildingStatDetail.noActiveModifiers')}</p>
      ) : (
        <div className="hud-stat-detail-list">
          {bonuses.length > 0 && (
            <div className="hud-stat-detail-section">
              <div className="hud-stat-detail-section-title">📈 {t('hud.statDetails.bonuses')}</div>
              {bonuses.map((m, i) => (
                <div key={i} className="hud-stat-detail-row">
                  <span className="hud-stat-detail-stat">{m.stat}</span>
                  <span className="hud-stat-detail-value hud-stat-bonus">{formatSigned(m.value)}</span>
                  <span className="hud-stat-detail-source">{m.source} ✓</span>
                </div>
              ))}
            </div>
          )}
          {penalties.length > 0 && (
            <div className="hud-stat-detail-section">
              <div className="hud-stat-detail-section-title">📉 {t('hud.statDetails.penalties')}</div>
              {penalties.map((m, i) => (
                <div key={i} className="hud-stat-detail-row">
                  <span className="hud-stat-detail-stat">{m.stat}</span>
                  <span className="hud-stat-detail-value hud-stat-penalty">{formatSigned(m.value)}</span>
                  <span className="hud-stat-detail-source">{m.source} ✓</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.ok')} /></button>
    </Popup>
  );
}

function getReloadDefensePenalty(unit: Unit, effectiveDefenseBeforeReload: number): number {
  if (!unit.tags.includes(UnitTag.RELOAD) || !unit.hasAttackedThisTurn) return 0;
  return Math.floor(
    Math.max(0, effectiveDefenseBeforeReload) * ABILITIES.RELOAD_DEF_PENALTY_PCT / 100,
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
  const { unitName, unitDesc, statAbbr, tagLabel, techName, formatNumber, t } = useText();
  const [tagPopup, setTagPopup] = useState<UnitTag | null>(null);
  const gameState = useGameStore((s) => s);

  const desc = unitDesc(unit.type);
  const visibleTags = unit.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t));
  const emoji = UNIT_EMOJI[unit.type] ?? '?';
  const name = unitName(unit.type);

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

  const contextualRange = useMemo(() => {
    return getUnitAttackRange(unit, gameState) - unit.stats.attackRange;
  }, [unit, gameState]);

  // ── RAGE bonus (shared between stat display and mods breakdown) ────────────
  const { rageBonus, rageAdjacentCount } = useMemo(() => {
    return getRageAttackContext(gameState, unit);
  }, [unit, gameState]);

  const batteryBonus = useMemo(() => getBatteryAttackBonus(gameState, unit), [gameState, unit]);
  const attackDisplayMods = useMemo(() => getAttackDisplayModifiers(unit, {
    phalanxAttack,
    rageBonus,
    rageAdjacentCount,
    batteryBonus,
    lanceChargeBonus: getLanceChargeAttackBonus(gameState, unit),
    assassinBonusActive: hasAssassinDamageBonusTarget(gameState, unit),
  }), [unit, gameState, phalanxAttack, rageBonus, rageAdjacentCount, batteryBonus]);
  const isConditionalTagActive = useCallback((tag: UnitTag) => {
    return CONDITIONAL_ACTIVE_TAGS.has(tag) && isTagConditionActive(gameState, unit, tag);
  }, [gameState, unit]);

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
    // RELOAD: after firing, DEF is reduced by ABILITIES.RELOAD_DEF_PENALTY_PCT% until next turn.
    // Runtime penalty (matches combat's applyReloadPenalty); surfaced so it shows in red.
    const reloadPenalty = getReloadDefensePenalty(
      unit,
      unit.stats.defense + phalanxDefense + contextualDef - unit.distractionDefPenalty,
    );
    if (reloadPenalty > 0) addC('defense', -reloadPenalty);
    if (attackDisplayMods.appliedAttackBonus !== 0) addA('attack', attackDisplayMods.appliedAttackBonus);
    if (attackDisplayMods.contextualAttackBonus !== 0) addC('attack', attackDisplayMods.contextualAttackBonus);
    if (phalanxDefense !== 0) addC('defense', phalanxDefense);
    if (contextualDef !== 0) addC('defense', contextualDef);
    if (contextualMov.total !== 0) addC('moveRange', contextualMov.total);
    if (contextualRange !== 0) addC('attackRange', contextualRange);

    const hasAnyMap: Record<string, boolean> = {};
    const netMap: Record<string, number> = {};
    for (const k of new Set([...Object.keys(appliedMap), ...Object.keys(contextualMap)])) {
      hasAnyMap[k] = true;
      netMap[k] = (appliedMap[k] ?? 0) + (contextualMap[k] ?? 0);
    }
    return { applied: appliedMap, net: netMap, hasAny: hasAnyMap };
  }, [unit, gameState, attackDisplayMods, phalanxDefense, contextualDef, contextualMov, contextualRange]);

  const showNetMod = (statKey: string) => {
    if (!hasAny[statKey]) return null;
    const n = net[statKey] ?? 0;
    if (n > 0) return <span className="hud-stat-mod hud-stat-bonus">+{n}</span>;
    if (n < 0) return <span className="hud-stat-mod hud-stat-penalty">{n}</span>;
    return <span className="hud-stat-mod hud-stat-neutral">±0</span>;
  };

  // ── Full modifier list for breakdown section ───────────────────────────────
  const mods: StatModEntry[] = [];

  const conditionalEffects = attackDisplayMods.effects.filter((effect) => effect.condition);
  mods.push(
    ...attackDisplayMods.rows.map((row) => ({ ...row, source: t(row.source) })),
    ...attackDisplayMods.effects
      .filter((effect) => !effect.condition)
      .map((effect) => ({ ...effect, source: t(effect.source) })),
  );
  if (phalanxDefense > 0) mods.push({ stat: statAbbr('defense'), value: phalanxDefense, kind: 'active', source: t('hud.statSource.phalanxDefense') });
  if (contextualDef > 0) mods.push({ stat: statAbbr('defense'), value: contextualDef, kind: 'active', source: t('hud.statSource.holdGround') });
  if (unit.tags.includes(UnitTag.SKIRMISHER)) mods.push({ stat: statAbbr('moveRange'), value: ABILITIES.SKIRMISHER_MOVE_BONUS, kind: 'active', source: t('hud.statSource.skirmisher') });
  if (unit.tags.includes(UnitTag.OUTRIDER)) mods.push({ stat: statAbbr('moveRange'), value: ABILITIES.OUTRIDER_MOVE_BONUS, kind: 'active', source: t('hud.statSource.outrider') });
  if (contextualMov.techBonus > 0) mods.push({ stat: statAbbr('moveRange'), value: contextualMov.techBonus, kind: 'active', source: t('hud.statSource.toTheFront') });
  if (contextualRange > 0) mods.push({ stat: statAbbr('attackRange'), value: contextualRange, kind: 'active', source: t('hud.statSource.farsightMarshal') });
  for (const tag of unit.tags) {
    for (const mod of TAG_STAT_EFFECTS[tag] ?? []) {
      if (mod.mode === 'add') mods.push({ stat: statAbbr(mod.stat), value: mod.value, kind: 'applied', source: t('hud.statSource.tag', { name: tagLabel(tag) }) });
    }
  }
  if (unit.faction === Faction.PLAYER) {
    for (const def of TECH_TREE) {
      if (!gameState.techNodes[def.id]?.unlocked) continue;
      for (const effect of def.effects) {
        if (effect.type === 'UNIT_STAT_MOD' && effect.unitType === unit.type && effect.mode === 'add') {
          mods.push({ stat: statAbbr(effect.stat), value: effect.value, kind: 'applied', source: t('hud.statSource.tech', { name: techName(def.id) }) });
        }
      }
    }
  }
  if (unit.distractionDefPenalty > 0) mods.push({ stat: statAbbr('defense'), value: -unit.distractionDefPenalty, kind: 'applied', source: t('hud.statSource.distractionArrows') });
  const reloadPenalty = getReloadDefensePenalty(
    unit,
    unit.stats.defense + phalanxDefense + contextualDef - unit.distractionDefPenalty,
  );
  if (reloadPenalty > 0) mods.push({ stat: statAbbr('defense'), value: -reloadPenalty, kind: 'active', source: t('hud.statSource.reload', { penalty: ABILITIES.RELOAD_DEF_PENALTY_PCT }) });

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
            [statAbbr('attack'), 'attack', unit.stats.attack] as const,
            [statAbbr('defense'), 'defense', unit.stats.defense] as const,
            [statAbbr('moveRange'), 'moveRange', unit.stats.moveRange] as const,
            [statAbbr('attackRange'), 'attackRange', unit.stats.attackRange] as const,
            [statAbbr('discoverRadius'), 'discoverRadius', unit.stats.discoverRadius] as const,
          ]).map(([label, key, rawVal]) => (
            <div key={label} className="info-popup-stat-cell">
              <div className="info-popup-stat-label">{label}</div>
              <div className="info-popup-stat-value">
                {formatNumber(rawVal - (applied[key] ?? 0))}
                {showNetMod(key)}
              </div>
            </div>
          ))}
        </div>

        {/* Modifier breakdown — only shown when there are active modifiers */}
        {(bonuses.length > 0 || penalties.length > 0 || conditionalEffects.length > 0) && (
          <div className="hud-stat-detail-list">
            {bonuses.length > 0 && (
              <div className="hud-stat-detail-section">
                <div className="hud-stat-detail-section-title">📈 {t('hud.statDetails.bonuses')}</div>
                {bonuses.map((m, i) => (
                  <div key={i} className="hud-stat-detail-row">
                    <span className="hud-stat-detail-stat">{m.stat}</span>
                    <span className="hud-stat-detail-value hud-stat-bonus">{m.displayValue ?? `+${m.value}`}</span>
                    <span className="hud-stat-detail-source">{m.source}{m.kind === 'applied' ? ' ✓' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {penalties.length > 0 && (
              <div className="hud-stat-detail-section">
                <div className="hud-stat-detail-section-title">📉 {t('hud.statDetails.penalties')}</div>
                {penalties.map((m, i) => (
                  <div key={i} className="hud-stat-detail-row">
                    <span className="hud-stat-detail-stat">{m.stat}</span>
                    <span className="hud-stat-detail-value hud-stat-penalty">{m.displayValue ?? m.value}</span>
                    <span className="hud-stat-detail-source">{m.source}{m.kind === 'applied' ? ' ✓' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {conditionalEffects.length > 0 && (
              <div className="hud-stat-detail-section">
                <div className="hud-stat-detail-section-title">🎯 {t('hud.statDetails.targetDependent')}</div>
                {conditionalEffects.map((effect, i) => (
                  <div key={`conditional-${i}`} className="hud-stat-detail-row">
                    <span className="hud-stat-detail-stat">{effect.stat}</span>
                    <span className="hud-stat-detail-value hud-stat-bonus">{effect.displayValue}</span>
                    <span className="hud-stat-detail-source">
                      {t(effect.source)} <span className="hud-stat-detail-condition">({effect.condition ? t(effect.condition) : ''})</span>
                    </span>
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
              <InfoTagPill key={tag} tag={tag} onClick={() => setTagPopup(tag)} active={isConditionalTagActive(tag)} />
            ))}
          </div>
        )}

        <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.ok')} /></button>
      </Popup>

      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </>
  );
}

// ============================================================================
// SELECTED UNIT PANEL
// ============================================================================

/** Returns true if the unit currently has any active debuff worth flagging. */
function unitHasDebuff(unit: Unit, isOnCorruptedTile: boolean): boolean {
  // Active RELOAD is a temporary DEF debuff after attacking.
  if (unit.tags.includes(UnitTag.RELOAD) && unit.hasAttackedThisTurn) return true;

  // 1. Stat debuffs from tags (exclude upgrade tradeoffs — e.g. DISTRACTION / HIT_AND_RUN)
  for (const tag of unit.tags) {
    if (UPGRADE_TRADEOFF_TAGS.has(tag)) continue;
    const effects = TAG_STAT_EFFECTS[tag];
    if (effects) {
      for (const effect of effects) {
        if (
          (effect.mode === 'add' && effect.value < 0) ||
          (effect.mode === 'percent' && effect.value < 0)
        ) {
          return true;
        }
      }
    }
  }
  // 2. Stun (behavioral debuff)
  if (unit.pinnedUntilTurn > 0) return true;
  // 3. Corruption suppresses active tags — only a debuff if the unit actually has affected tags
  if (isOnCorruptedTile && unit.tags.some((tag) => CORRUPTED_SUPPRESSED_TAGS.has(tag))) return true;
  return false;
}

function SelectedUnitPanel({
  unit,
  captureTarget,
  onCapture,
}: {
  unit: Unit;
  captureTarget?: Building;
  onCapture?: () => void;
}) {
  const { unitName, buildingName, statAbbr, spellName, spellDesc, spellTargetHint, t } = useText();
  const isPlayer = unit.faction === Faction.PLAYER;
  const gameState = useGameStore((s) => s);
  const hpPct = (unit.stats.currentHp / unit.stats.maxHp) * 100;
  const canMove = canUnitMove(unit, gameState);
  const canAttack = canUnitAttack(unit, gameState);
  const canCapture = canUnitCapture(unit);
  const canHeal = isPlayer && canUnitHeal(unit);
  const canFieldwork = isPlayer && canUnitFieldwork(unit);
  const canBuildBridge = isPlayer && canUnitBuildBridge(unit, gameState);
  const canSetTrap = isPlayer && canUnitSetTrap(unit, gameState);
  const canExtinguish = isPlayer && canUnitExtinguish(unit, gameState);
  const canConsumeGravestone = isPlayer && canUnitConsumeGravestone(unit, gameState);

  const visibleTags = unit.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t));

  const showAiScores = useDevOptionsStore((s) => s.showAiScores);
  const isOnCorruptedTile = isPlayer && (() => {
    const tile = gameState.grid[unit.position.y]?.[unit.position.x];
    return tile?.status === TileStatus.CORRUPTED;
  })();
  const showCorruptedTag = isOnCorruptedTile && unit.tags.some((t) => CORRUPTED_SUPPRESSED_TAGS.has(t));
  const displayedTags: UnitTag[] = showCorruptedTag ? [UnitTag.CORRUPTED, ...visibleTags] : visibleTags;
  const healSuppressedByCorruption = isHealSuppressedByCorruption(gameState, unit.id);
  const hasDebuff = isPlayer && unitHasDebuff(unit, isOnCorruptedTile);
  const fieldworkBlocked = canFieldwork && (() => {
    const tile = gameState.grid[unit.position.y]?.[unit.position.x];
    if (!tile) return true;
    if (tile.buildingId !== null) return true;
    if (tile.isRuin || tile.isStrongholdRuin) return true;
    if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) return true;
    return false;
  })();
  const fieldworkResources = useGameStore((s) => s.resources);
  const fieldworkAffordable = canFieldwork
    ? fieldworkResources.wood >= BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood &&
      fieldworkResources.iron >= BUILDING_DEFINITIONS.OUTPOST.constructionCost.iron
    : true;
  const trapBlocked = canSetTrap && getTrapPlacementTargets(unit, gameState).length === 0;
  const [aiScoreModal, setAiScoreModal] = useState(false);
  const [aiScores, setAiScores] = useState<ScoredAction[]>([]);
  const [unitInfoOpen, setUnitInfoOpen] = useState(false);
  const [tagPopup, setTagPopup] = useState<UnitTag | null>(null);
  const [highlightCorrupted, setHighlightCorrupted] = useState(false);
  const levelUpUnit = useGameStore((s) => s.levelUpUnit);
  const consumeGravestone = useGameStore((s) => s.consumeGravestone);
  const startHealMode = useGameStore((s) => s.startHealMode);
  const cancelHealMode = useGameStore((s) => s.cancelHealMode);
  const pendingHealerId = useGameStore((s) => s.pendingHealerId);
  const fieldworkUnit = useGameStore((s) => s.fieldworkUnit);
  const [confirmFieldwork, setConfirmFieldwork] = useState(false);
  const castSpell = useGameStore((s) => s.castSpell);
  const openMarket = useGameStore((s) => s.openMarket);

  // Bridge build mode
  const buildBridge = useGameStore((s) => s.buildBridge);
  const startBridgeBuildMode = useGameStore((s) => s.startBridgeBuildMode);
  const cancelBridgeBuildMode = useGameStore((s) => s.cancelBridgeBuildMode);
  const pendingBridgeBuilderId = useGameStore((s) => s.pendingBridgeBuilderId);
  const isInBridgeBuildMode = pendingBridgeBuilderId === unit.id;
  const bridgeTargets = useMemo(
    () => (canBuildBridge ? getBridgeBuildTargets(unit, gameState) : []),
    [canBuildBridge, gameState, unit],
  );
  const [confirmBridgeTarget, setConfirmBridgeTarget] = useState<{ x: number; y: number; orientation: 'EW' | 'NS' } | null>(null);

  // Scout trap
  const startTrapSetMode = useGameStore((s) => s.startTrapSetMode);
  const cancelTrapSetMode = useGameStore((s) => s.cancelTrapSetMode);
  const pendingTrapSetterId = useGameStore((s) => s.pendingTrapSetterId);
  const isInTrapSetMode = pendingTrapSetterId === unit.id;

  // Scout extinguish
  const scoutExtinguish = useGameStore((s) => s.scoutExtinguish);

  // H12: fire when player unit is on corrupted ground with a suppressed tag.
  useEffect(() => {
    if (!isPlayer) return;
    if (!isUnitOnCorruptedTile(gameState, unit.id)) return;
    if (unit.tags.some((t) => CORRUPTED_SUPPRESSED_TAGS.has(t))) {
      tryTriggerHint('H12_CORRUPTION');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id, isPlayer, unit.position.x, unit.position.y, unit.tags.length]);

  // Trade (Market)
  const canTrade = isPlayer && canUnitTrade(unit);
  const tradeMarket = isPlayer ? getTradeMarket(unit, gameState) : null;

  // Spell casting (Mage only)
  const isMage = unit.type === UnitType.MAGE;
  const unlockedSpells = useGameStore((s) => s.unlockedSpells);
  const startSpellCast = useGameStore((s) => s.startSpellCast);
  const cancelSpellCast = useGameStore((s) => s.cancelSpellCast);
  const pendingSpellCast = useGameStore((s) => s.pendingSpellCast);
  const pendingTransposeFirstUnitId = useGameStore((s) => s.pendingTransposeFirstUnitId);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const mageCastBudget = isMage ? getMageCastBudget(gameState) : 0;
  const mageCastsUsed = unit.spellsCastThisTurn ?? 0;
  const canCast = isMage && isPlayer && canUnitCast(unit, gameState) && arcaneCrystals >= 1;
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
    } else if (healSuppressedByCorruption) {
      setHighlightCorrupted(true);
    } else if (healTargets.length > 0) {
      startHealMode(unit.id);
    }
  };

  const targetLevel = getUnitTargetLevel(unit);
  const canLevelUp = isPlayer && targetLevel > unit.level;
  const isMaxLevel = unit.level >= XP.MAX_LEVEL;
  const nextLevelDef = !isMaxLevel ? UNIT_DEFINITIONS[unit.type]?.levelUp?.[unit.level - 1] : null;
  const nextLevelXpRequired = nextLevelDef?.xpRequired ?? null;

  // Compute contextual stat bonuses from tech flags and unit tags
  const statBonuses = useMemo(() => {
    const bonuses: { def: number; mov: number; rng: number } = { def: 0, mov: 0, rng: 0 };
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

    bonuses.rng = getUnitAttackRange(unit, gameState) - unit.stats.attackRange;

    return bonuses;
  }, [unit, gameState]);

  // Compute PHALANX formation bonuses (works for both factions)
  const phalanxAttack = useMemo(() => getPhalanxAttackBonus(gameState, unit), [gameState, unit]);
  const phalanxDefense = useMemo(() => getPhalanxDefenseBonus(gameState, unit), [gameState, unit]);
  const { rageBonus, rageAdjacentCount } = useMemo(() => getRageAttackContext(gameState, unit), [gameState, unit]);
  const batteryBonus = useMemo(() => getBatteryAttackBonus(gameState, unit), [gameState, unit]);
  const attackDisplayMods = useMemo(() => getAttackDisplayModifiers(unit, {
    phalanxAttack,
    rageBonus,
    rageAdjacentCount,
    batteryBonus,
    lanceChargeBonus: getLanceChargeAttackBonus(gameState, unit),
    assassinBonusActive: hasAssassinDamageBonusTarget(gameState, unit),
  }), [unit, gameState, phalanxAttack, rageBonus, rageAdjacentCount, batteryBonus]);
  const isConditionalTagActive = useCallback((tag: UnitTag) => {
    return CONDITIONAL_ACTIVE_TAGS.has(tag) && isTagConditionActive(gameState, unit, tag);
  }, [gameState, unit]);
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
    if (attackDisplayMods.appliedAttackBonus !== 0) addApplied('attack', attackDisplayMods.appliedAttackBonus);
    if (attackDisplayMods.contextualAttackBonus !== 0) addContextual('attack', attackDisplayMods.contextualAttackBonus);
    if (phalanxDefense !== 0) addContextual('defense', phalanxDefense);
    if (statBonuses.def !== 0) addContextual('defense', statBonuses.def);
    if (statBonuses.mov !== 0) addContextual('moveRange', statBonuses.mov);
    if (statBonuses.rng !== 0) addContextual('attackRange', statBonuses.rng);
    const reloadPenalty = getReloadDefensePenalty(
      unit,
      unit.stats.defense + phalanxDefense + statBonuses.def - unit.distractionDefPenalty,
    );
    if (reloadPenalty > 0) addContextual('defense', -reloadPenalty);

    const hasAny: Record<string, boolean> = {};
    const net: Record<string, number> = {};
    for (const k of new Set([...Object.keys(applied), ...Object.keys(contextual)])) {
      hasAny[k] = true;
      net[k] = (applied[k] ?? 0) + (contextual[k] ?? 0);
    }

    return { applied, net, hasAny };
  }, [unit, gameState, attackDisplayMods, phalanxDefense, statBonuses]);

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
    const hintText = spellTargetHint(
      pendingSpellCast.spellId,
      Boolean(pendingTransposeFirstUnitId),
    );
    return (
      <div className="hud-info-panel hud-spell-cast-panel">
        <div className="hud-panel-header">
          <span className="hud-panel-emoji">{spellDef?.emoji ?? '✨'}</span>
          <button
            className="hud-spell-cast-name-btn"
            onClick={() => setCastModeInfoSpellId(pendingSpellCast.spellId)}
            title={t('hud.unitPanel.viewSpellInfo')}
          >
            {t('hud.unitPanel.castingSpell', { spell: spellName(pendingSpellCast.spellId) })}
            <span className="info-badge" aria-hidden="true">i</span>
          </button>
        </div>
        <p className="hud-spell-cast-hint">{hintText}</p>
        <button
          className="hud-capture-btn hud-spell-cast-cancel"
          onClick={() => cancelSpellCast()}
        >
          ❌ {t('hud.unitPanel.cancelCast')}
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
      <button className="hud-panel-header-btn" onClick={() => setUnitInfoOpen(true)} aria-label={t('hud.unitPanel.viewUnitInfo', { unit: unitName(unit.type) })}>
        <span className="hud-panel-emoji">{UNIT_EMOJI[unit.type] ?? '?'}</span>
        <span className="hud-panel-name">
          {unitName(unit.type)}
          <span className="info-badge" aria-hidden="true">i</span>
        </span>
        {!isPlayer && <span className="hud-faction-label hud-faction-enemy">🔴 {t('hud.unitPanel.enemy')}</span>}
      </button>
      <div className="hud-hp-row">
        <div
          className="hud-hp-bar"
          style={hasDebuff ? { outline: `2px solid ${RENDER.COLORS.DEBUFF_BORDER}` } : undefined}
        >
          <div className="hud-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <span className="hud-hp-text">
          {unit.stats.currentHp}/{unit.stats.maxHp}
        </span>
      </div>
      {isPlayer && usesNonXpProgression(unit.type) && (
        <div className="hud-xp-row">
          <span className="hud-xp-label">{t('hud.unitPanel.level', { level: unit.level })}</span>
        </div>
      )}
      {isPlayer && !usesNonXpProgression(unit.type) && (
        <div className="hud-xp-row">
          <span className="hud-xp-label">
            {isMaxLevel
              ? t('hud.unitPanel.xpMax', { xp: unit.xp, level: unit.level })
              : t('hud.unitPanel.xpProgress', { xp: unit.xp, required: nextLevelXpRequired ?? 0, level: unit.level })}
          </span>
        </div>
      )}
      {!isPlayer && (
        <div className="hud-xp-row">
          <span className="hud-xp-label">{t('hud.unitPanel.level', { level: unit.level })}</span>
        </div>
      )}
      {canLevelUp && (
        <button
          className="hud-levelup-btn"
          onClick={() => levelUpUnit(unit.id)}
        >
          ⬆️ {t('hud.unitPanel.levelUp', { level: targetLevel })}
        </button>
      )}
      <button className="hud-unit-stats-btn" onClick={() => setUnitInfoOpen(true)} aria-label={t('hud.unitPanel.viewStatDetails')}>
        <div className="hud-unit-stats">
          <span className="hud-stat-label">{statAbbr('attack')}</span>
          <span className="hud-stat-value">
            {unit.stats.attack - (inlineStatMods.applied.attack ?? 0)}
            {showNetMod('attack')}
          </span>
          <span className="hud-stat-label">{statAbbr('defense')}</span>
          <span className="hud-stat-value">
            {unit.stats.defense - (inlineStatMods.applied.defense ?? 0)}
            {showNetMod('defense')}
          </span>
          <span className="hud-stat-label">{statAbbr('moveRange')}</span>
          <span className="hud-stat-value">
            {unit.stats.moveRange - (inlineStatMods.applied.moveRange ?? 0)}
            {showNetMod('moveRange')}
          </span>
          <span className="hud-stat-label">{statAbbr('attackRange')}</span>
          <span className="hud-stat-value">
            {unit.stats.attackRange - (inlineStatMods.applied.attackRange ?? 0)}
            {showNetMod('attackRange')}
          </span>
          <span className="hud-stat-label">{statAbbr('discoverRadius')}</span>
          <span className="hud-stat-value">
            {unit.stats.discoverRadius - (inlineStatMods.applied.discoverRadius ?? 0)}
            {showNetMod('discoverRadius')}
          </span>
        </div>
        <span className="hud-unit-stats-hint" aria-hidden="true">📊</span>
      </button>
      {displayedTags.length > 0 && (
        <div className="hud-tag-pills">
          {displayedTags.map((tag) => {
            const inactive = isOnCorruptedTile && CORRUPTED_SUPPRESSED_TAGS.has(tag);
            return (
            <InfoTagPill
              key={tag}
              tag={tag}
              onClick={() => setTagPopup(tag)}
              inactive={inactive}
              active={!inactive && isConditionalTagActive(tag)}
              highlight={tag === UnitTag.CORRUPTED && highlightCorrupted}
              onHighlightEnd={tag === UnitTag.CORRUPTED ? () => setHighlightCorrupted(false) : undefined}
            />
            );
          })}
        </div>
      )}
      {isPlayer && (
        <>
          <div className="hud-action-tags">
            <span className={`hud-action-tag ${canMove ? '' : 'hud-action-used'}`}>{t('hud.unitPanel.move')}</span>
            <span className={`hud-action-tag ${canAttack ? '' : 'hud-action-used'}`}>{t('hud.unitPanel.attack')}</span>
            <span className={`hud-action-tag ${canCapture ? '' : 'hud-action-used'}`}>{t('hud.unitPanel.captureAction')}</span>
            {tradeMarket && (
              <span className={`hud-action-tag ${canTrade ? '' : 'hud-action-used'}`}>{t('hud.unitPanel.trade')}</span>
            )}
          </div>
          {canConsumeGravestone && (
            <button className="hud-capture-btn" onClick={() => consumeGravestone(unit.id)}>
              🪦 {t('hud.unitPanel.consumeGravestone')}
            </button>
          )}
          {captureTarget && (
            <>
              {captureTarget.consumesUnitOnCapture && canCapture && (
                <div className="hud-warning hud-capture-warning">
                  ⚠️ {t('hud.unitPanel.captureConsumesUnit')}
                </div>
              )}
              <button
                className="hud-capture-btn"
                disabled={!canCapture}
                onClick={onCapture}
              >
                {unit.hasMovedThisTurn
                  ? `🏳️ ${t('hud.unitPanel.captureMoveFirst')}`
                  : `🏳️ ${t('hud.unitPanel.capture', { building: buildingName(captureTarget.type) })}`}
              </button>
            </>
          )}
          {tradeMarket && (
            <button
              className="hud-capture-btn"
              disabled={!canTrade}
              onClick={() => openMarket(unit.id, tradeMarket.id)}
            >
              {unit.hasMovedThisTurn
                ? `🪙 ${t('hud.unitPanel.tradeMoveFirst')}`
                : unit.hasTradedThisTurn
                  ? `🪙 ${t('hud.unitPanel.tradeAlreadyUsed')}`
                  : `🪙 ${t('hud.unitPanel.trade')}`}
            </button>
          )}
          {canHeal && (
            <button
              className={`hud-spell-btn${isInHealMode ? ' hud-heal-active' : ''}${healSuppressedByCorruption ? ' hud-spell-btn--inactive' : ''}`}
              disabled={!healSuppressedByCorruption && healTargets.length === 0}
              aria-disabled={healSuppressedByCorruption}
              onClick={handleHealClick}
              title={healSuppressedByCorruption ? t('hud.unitPanel.healInactiveCorruption') : undefined}
            >
              <FitText className="hud-spell-btn-label" text={isInHealMode ? `💊 ${t('hud.unitPanel.chooseHealTarget')}` : `💊 ${t('hud.unitPanel.heal')}`} />
            </button>
          )}
          {isMage && isPlayer && unlockedSpells.length > 0 && (
            <div className="hud-info-panel hud-spell-panel">
              <div className="hud-panel-header">
                <span className="hud-panel-emoji">✨</span>
                <span className="hud-panel-name">{t('hud.unitPanel.spells')}</span>
                {mageCastBudget > 1 && (
                  <span className="hud-panel-cost">{t('hud.unitPanel.casts', { used: Math.max(mageCastBudget - mageCastsUsed, 0), total: mageCastBudget })}</span>
                )}
                <button
                  className="hud-construct-toggle"
                  onClick={() => setSpellsCollapsed((c) => !c)}
                  title={t(spellsCollapsed ? 'common.expand' : 'common.collapse')}
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
                        title={t('hud.unitPanel.spellCostTitle', { description: spellDesc(spellId), cost: MAGE.SPELL_CAST_CRYSTAL_COST })}
                      >
                        <FitText className="hud-spell-btn-label" text={def ? `${def.emoji} ${spellName(spellId)}` : spellId} />
                        <span className="hud-spell-btn-cost">💎{MAGE.SPELL_CAST_CRYSTAL_COST}</span>
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
                          title={t('hud.unitPanel.spellCostTitle', { description: spellDesc(SpellId.CRYSTAL_TOWER), cost: MAGE.SPELL_CAST_CRYSTAL_COST })}
                        >
                          <FitText className="hud-spell-btn-label" text={SPELL_DEFINITIONS[SpellId.CRYSTAL_TOWER] ? `${SPELL_DEFINITIONS[SpellId.CRYSTAL_TOWER].emoji} ${spellName(SpellId.CRYSTAL_TOWER)}` : SpellId.CRYSTAL_TOWER} />
                          <span className="hud-spell-btn-cost">💎{MAGE.SPELL_CAST_CRYSTAL_COST}</span>
                        </button>
                      ) : (
                        <div className="hud-fieldwork-confirm">
                          <div className="hud-warning hud-capture-warning">
                            ⚠️ {t('hud.unitPanel.mageConsumedForTower')}
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
                            ✅ {t('hud.unitPanel.buildCrystalTower')}
                          </button>
                          <button
                            className="hud-capture-btn"
                            onClick={() => setConfirmCrystalTower(false)}
                          >
                            ❌ {t('common.cancel')}
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
                <>
                  <button
                    className="hud-spell-btn"
                    disabled={fieldworkBlocked || !fieldworkAffordable}
                    onClick={() => setConfirmFieldwork(true)}
                  >
                    <FitText className="hud-spell-btn-label" text={`🏗️ ${t('hud.unitPanel.buildOutpost')}`} />
                    <span className="hud-spell-btn-cost">🪵{BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood}</span>
                  </button>
                  {!fieldworkAffordable && (
                    <span className="hud-pop-warning">{t('hud.unitPanel.notEnoughWood')}</span>
                  )}
                </>
              ) : (
                <div className="hud-fieldwork-confirm">
                  <div className="hud-warning hud-capture-warning">
                    ⚠️ {t('hud.unitPanel.fieldworkConsumesUnit', { cost: BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood })}
                  </div>
                  <button
                    className="hud-capture-btn"
                    onClick={() => {
                      fieldworkUnit(unit.id);
                      setConfirmFieldwork(false);
                    }}
                  >
                    ✅ {t('hud.unitPanel.confirmBuild')}
                  </button>
                  <button
                    className="hud-capture-btn"
                    onClick={() => setConfirmFieldwork(false)}
                  >
                    ❌ {t('common.cancel')}
                  </button>
                </div>
              )}
            </>
          )}
          {canBuildBridge && (
            <>
              <button
                className={`hud-spell-btn${isInBridgeBuildMode ? ' hud-heal-active' : ''}`}
                disabled={bridgeTargets.length === 0}
                onClick={() => {
                  if (isInBridgeBuildMode) {
                    cancelBridgeBuildMode();
                  } else {
                    startBridgeBuildMode(unit.id);
                  }
                }}
              >
                <FitText className="hud-spell-btn-label" text={isInBridgeBuildMode ? `🌉 ${t('hud.unitPanel.chooseCanyon')}` : `🌉 ${t('hud.unitPanel.buildBridge')}`} />
                <span className="hud-spell-btn-cost">🪵{BUILDING_DEFINITIONS.BRIDGE.constructionCost.wood}</span>
              </button>
              {confirmBridgeTarget && (
                <BuildingInfoPopup
                  buildingType={BuildingType.BRIDGE}
                  cost={BUILDING_DEFINITIONS.BRIDGE.constructionCost}
                  actionLabel={t('hud.unitPanel.buildBridge')}
                  onAction={() => {
                    buildBridge(unit.id, confirmBridgeTarget);
                    setConfirmBridgeTarget(null);
                    cancelBridgeBuildMode();
                  }}
                  onClose={() => {
                    setConfirmBridgeTarget(null);
                  }}
                />
              )}
            </>
          )}
          {canSetTrap && (
            <button
              className={`hud-spell-btn${isInTrapSetMode ? ' hud-heal-active' : ''}`}
              disabled={!!trapBlocked}
              onClick={() => {
                if (isInTrapSetMode) {
                  cancelTrapSetMode();
                } else {
                  startTrapSetMode(unit.id);
                }
              }}
            >
              <FitText className="hud-spell-btn-label" text={isInTrapSetMode ? `🪤 ${t('hud.unitPanel.chooseTrapTile')}` : `🪤 ${t('hud.unitPanel.setTrap')}`} />
              {ABILITIES.SCOUT_TRAP_WOOD_COST > 0 && (
                <span className="hud-spell-btn-cost">🪵{ABILITIES.SCOUT_TRAP_WOOD_COST}</span>
              )}
              {ABILITIES.SCOUT_TRAP_IRON_COST > 0 && (
                <span className="hud-spell-btn-cost">⚙️{ABILITIES.SCOUT_TRAP_IRON_COST}</span>
              )}
            </button>
          )}
          {canExtinguish && (
            <button
              className="hud-spell-btn"
              onClick={() => scoutExtinguish(unit.id)}
            >
              <FitText className="hud-spell-btn-label" text={`🔥 ${t('hud.unitPanel.extinguish')}`} />
            </button>
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
          🤖 {t('hud.unitPanel.aiScore')}
        </button>
      )}
      {aiScoreModal && (
        <AiScoreModal scores={aiScores} onClose={() => setAiScoreModal(false)} />
      )}
      {unitInfoOpen && (
        <UnitCombinedInfoPopup unit={unit} onClose={() => setUnitInfoOpen(false)} />
      )}
      {tagPopup && (
        <TagPopup
          tag={tagPopup}
          disabledByCorruption={isOnCorruptedTile && CORRUPTED_SUPPRESSED_TAGS.has(tagPopup)}
          onClose={() => {
            if (isOnCorruptedTile && CORRUPTED_SUPPRESSED_TAGS.has(tagPopup)) setHighlightCorrupted(true);
            setTagPopup(null);
          }}
        />
      )}
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
  onOpenTechTreeAt,
  isExpanded,
  onExpandedChange,
}: {
  unit: Unit;
  tilePos: Position;
  onOpenTechTreeAt: (techId: TechId) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { buildingName, t } = useText();
  const resources = useGameStore((s) => s.resources);
  const constructBuilding = useGameStore((s) => s.constructBuilding);
  const grid = useGameStore((s) => s.grid);
  const unlockedBuildings = useGameStore((s) => s.unlockedBuildings);
  const techNodes = useGameStore((s) => s.techNodes);
  const [confirmBuilding, setConfirmBuilding] = useState<typeof options[number] | null>(null);

  useLayoutEffect(() => {
    return () => onExpandedChange(false);
  }, [onExpandedChange]);

  const options = useMemo(
    () => sortConstructionMenuOptions(
      { techNodes, resources },
      unit,
      getConstructionMenuOptionsForTile({ grid, unlockedBuildings }, tilePos),
    ),
    [tilePos, grid, unlockedBuildings, techNodes, resources, unit],
  );

  // H04: fire when the construction panel is open on a regular ruin tile.
  useEffect(() => {
    if (options.length === 0) return;
    const tile = useGameStore.getState().grid[tilePos.y]?.[tilePos.x];
    if (tile?.isRuin && !tile.isStrongholdRuin) {
      tryTriggerHint('H04_RUIN_MENU_FIRST');
    }
  }, [tilePos, options.length]);

  if (options.length === 0) return null;

  return (
    <div className="hud-info-panel hud-construction-panel">
      <div className="hud-panel-header hud-panel-header--clickable" onClick={() => onExpandedChange(!isExpanded)}>
        <span className="hud-panel-emoji">🔨</span>
        <span className="hud-panel-name">{t('hud.constructionPanel.title')}</span>
        <span
          className="hud-construct-toggle"
          title={t(isExpanded ? 'common.collapse' : 'common.expand')}
        >
          {isExpanded ? '▼' : '▲'}
        </span>
      </div>
      {isExpanded && (
        <div className="hud-construct-options hud-construction-options">
          {options.map((opt) => {
            const unlockTechId = getConstructionMenuUnlockTechId({ techNodes }, unit, opt);
            const techLocked = !opt.buildingUnlocked || unlockTechId !== null;
            const canAffordThis =
              resources.iron >= opt.cost.iron && resources.wood >= opt.cost.wood;
            const missingResources = [
              resources.iron < opt.cost.iron ? t('hud.constructionPanel.moreIron', { amount: opt.cost.iron - resources.iron }) : null,
              resources.wood < opt.cost.wood ? t('hud.constructionPanel.moreWood', { amount: opt.cost.wood - resources.wood }) : null,
            ].filter(Boolean).join(` ${t('common.and')} `);
            const handleSelectConstruction = () => {
              if (techLocked) {
                if (unlockTechId) onOpenTechTreeAt(unlockTechId);
                return;
              }
              if (!canAffordThis) {
                tryTriggerHint('H20_BUILD_NO_RESOURCES');
                return;
              }
              setConfirmBuilding(opt);
            };
            return (
              <button
                key={opt.buildingType}
                className={`info-row-btn hud-construction-option${techLocked ? ' info-row-btn--tech-locked' : canAffordThis ? '' : ' info-row-btn--disabled'}`}
                aria-disabled={!techLocked && !canAffordThis}
                aria-label={techLocked ? t('hud.constructionPanel.lockedRowLabel', { building: buildingName(opt.buildingType) }) : undefined}
                title={techLocked ? t('hud.constructionPanel.unlockInTechTree') : undefined}
                onClick={handleSelectConstruction}
              >
                <span className="info-row-emoji">{opt.emoji}</span>
                <div className="info-row-body">
                  <div className="info-row-name">
                    {buildingName(opt.buildingType)}
                    {!techLocked && <span className="info-badge info-badge--small">i</span>}
                  </div>
                  <div className="info-row-cost">⛓️{opt.cost.iron} 🪵{opt.cost.wood}</div>
                  {!canAffordThis && (
                    <div className="hud-pop-warning">{t('hud.constructionPanel.needResources', { resources: missingResources })}</div>
                  )}
                </div>
                {techLocked && <span className="hud-construction-tech-lock-badge" aria-hidden="true">💎</span>}
              </button>
            );
          })}
        </div>
      )}
      {confirmBuilding && (
        <BuildingInfoPopup
          buildingType={confirmBuilding.buildingType}
          cost={confirmBuilding.cost}
          actionLabel={t('common.construct')}
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
  const { buildingName, t } = useText();
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
      return getConversionTargetsForTile(useGameStore.getState(), unit.position, currentBuilding.type);
    },
    [currentBuilding],
  );

  if (options.length === 0) return null;

  const currentBuildingName = currentBuilding
    ? buildingName(currentBuilding.type)
    : t('common.building');

  return (
    <div className="hud-info-panel hud-construction-panel">
      <div className="hud-panel-header hud-panel-header--clickable" onClick={() => setCollapsed((c) => !c)}>
        <span className="hud-panel-emoji">🔄</span>
        <span className="hud-panel-name">{t('hud.conversionPanel.title', { building: currentBuildingName })}</span>
        <span
          className="hud-construct-toggle"
          title={t(collapsed ? 'common.expand' : 'common.collapse')}
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
                    {buildingName(opt.buildingType)}
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
          actionLabel={t('hud.conversionPanel.convert')}
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
  const { t } = useText();
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
      ? t('hud.tilePanel.forest')
      : tile.terrainType === TileType.MOUNTAIN
        ? t('hud.tilePanel.mountain')
        : tile.terrainType === TileType.PLAINS
          ? t('hud.tilePanel.plains')
          : tile.terrainType === TileType.CANYON
            ? t('hud.tilePanel.canyon')
            : tile.terrainType === TileType.WATER
              ? t('hud.tilePanel.water')
              : t('hud.tilePanel.empty');

  const terrainTag = tile.status != null ? TILE_STATUS_TO_TERRAIN_TAG[tile.status] : null;

  return (
    <div className="hud-info-panel">
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{terrainEmoji}</span>
        <span className="hud-panel-name">{terrainName}</span>
      </div>
      {tile.isStrongholdRuin && (
        <div className="hud-tile-feature">🏚️ {t('hud.tilePanel.strongholdRuin')}</div>
      )}
      {tile.isRuin && !tile.isStrongholdRuin && (
        <div className="hud-tile-feature">🪨 {t('hud.tilePanel.ruin')}</div>
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
  const { buildingName, unitName, populationName, tagLabel, statAbbr, formatList, t } = useText();
  const resources = useGameStore((s) => s.resources);
  const grid = useGameStore((s) => s.grid);
  const gameState = useGameStore((s) => s);
  const recruitUnit = useGameStore((s) => s.recruitUnit);
  const unlockedUnits = useGameStore((s) => s.unlockedUnits);
  const showRecruitingScores = useDevOptionsStore((s) => s.showRecruitingScores);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const raiseGargoyle = useGameStore((s) => s.raiseGargoyle);

  const [confirmRecruitUnit, setConfirmRecruitUnit] = useState<UnitType | null>(null);
  const [recruitScoreModal, setRecruitScoreModal] = useState(false);
  const [recruitScores, setRecruitScores] = useState<{ type: UnitType; score: number }[]>([]);
  const [buildingInfoOpen, setBuildingInfoOpen] = useState(false);
  const [buildingStatDetailOpen, setBuildingStatDetailOpen] = useState(false);

  const factionLabel =
    building.faction === Faction.PLAYER
      ? `🔵 ${t('hud.buildingPanel.player')}`
      : building.faction === Faction.ENEMY
        ? `🔴 ${t('hud.buildingPanel.enemy')}`
        : `⚪ ${t('hud.buildingPanel.neutral')}`;

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
  // Crystal Tower ↔ Crystal Chamber synergy: derived live from current chamber adjacency
  const chamberAtkMod = getCrystalTowerChamberBonus(gameState, building);
  const totalAtkMod = garrisonAtkMod + chamberAtkMod;

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
  // The Deathmender specialist lets the player raise a flying Gargoyle from ANY player
  // Gravestone, not just ones it created. Gated by the RAISE_GARGOYLE specialist effect
  // being active, independent of the buried unit type and of the Mage's Raise Skeleton spell.
  const canRaiseGargoyleHere = isGravestone && isSpecialistEffectActive(gameState, 'RAISE_GARGOYLE');
  const canRaiseGargoyle =
    canRaiseGargoyleHere && !graveOccupied && arcaneCrystals >= ABILITIES.GARGOYLE_CRYSTAL_COST;
  const handleRaiseGargoyle = useCallback(() => {
    raiseGargoyle(building.id);
  }, [raiseGargoyle, building.id]);

  // Recruitment info — filter by tech-unlocked units
  const allRecruitableTypes = BUILDING_RECRUITS[building.type] ?? [];
  const recruitableTypes = allRecruitableTypes.filter((ut) => unlockedUnits.includes(ut));

  // Unit limit info for recruitment buildings.
  // For CRYSTAL_CAVE: check per-cave limit so that having 2 caves doesn't allow
  // recruiting 2 drakes into the same cave.
  const isRecruitmentBuilding =
    isPlayerOwned && BUILDING_DEFINITIONS[building.type]?.unitLimit !== undefined;
  const { current: recruitedUnits, limit: unitLimit } = isRecruitmentBuilding
    ? computeRecruitmentBuildingUsage(
        gameState,
        building.type,
        building.type === BuildingType.CRYSTAL_CAVE ? building.id : undefined,
      )
    : { current: 0, limit: Infinity };
  const atUnitLimit = isFinite(unitLimit) && recruitedUnits >= unitLimit;
  // Per-building recruitment limit: only 1 unit per turn per building
  const alreadyRecruitedThisTurn = isPlayerOwned && building.lastRecruitmentTurn === gameState.turn;

  // Check whether there is a free tile to spawn a unit (building tile or adjacent)
  const hasSpawnSpace = useMemo(
    () => (recruitableTypes.length > 0 ? hasSpawnSpaceAt(grid, building.position) : false),
    [recruitableTypes.length, building.position, grid]
  );

  // Crystal Chamber mage recruitment: chamber must be resonating.
  // Crystal Cave drake recruitment: cave must likewise be resonating.
  const chamberNotResonating =
    (building.type === BuildingType.CRYSTAL_CHAMBER || building.type === BuildingType.CRYSTAL_CAVE) &&
    building.resonanceTurnsRemaining <= 0;

  // H16/H17: dormant chamber/cave.
  useEffect(() => {
    if (!isPlayerOwned) return;
    if (chamberNotResonating) {
      if (building.type === BuildingType.CRYSTAL_CHAMBER) {
        tryTriggerHint('H16_CHAMBER_NOT_RESONATING');
      } else if (building.type === BuildingType.CRYSTAL_CAVE) {
        tryTriggerHint('H17_CAVE_NOT_RESONATING');
      }
    }
  }, [building.id, isPlayerOwned, chamberNotResonating, building.type]);

  // Production info for resource buildings
  const isMine = building.type === BuildingType.MINE && isPlayerOwned;
  const isDeepMine = building.type === BuildingType.DEEP_MINE && isPlayerOwned;
  const isWoodcutter = building.type === BuildingType.WOODCUTTER && isPlayerOwned;
  const isCharcoalKiln = building.type === BuildingType.CHARCOAL_KILN && isPlayerOwned;
  // Additive kiln bonus increments currently applied to this mine or deep mine.
  const isKilnEligibleMine = (isMine || isDeepMine) && !isDisabled;
  const mineKilnBonusCount = isKilnEligibleMine ? getMineKilnBonusCount(gameState, building) : 0;
  const mineHasKilnBuff = mineKilnBonusCount > 0;

  // Population info for FARM, PATRICIANHOUSE, and STRONGHOLD
  const isHousingBuilding =
    isPlayerOwned &&
    (building.type === BuildingType.FARM || building.type === BuildingType.PATRICIANHOUSE || building.type === BuildingType.STRONGHOLD);
  const housingLabel = building.type === BuildingType.FARM ? populationName('farmer')
    : building.type === BuildingType.PATRICIANHOUSE ? populationName('noble')
    : `${populationName('farmer')} + ${populationName('noble')}`;
  const turnsUntilNextPop = (() => {
    if (!isHousingBuilding) return null;
    if (building.type === BuildingType.STRONGHOLD) {
      const { farmerCap, nobleCap } = getStrongholdEffectiveCapWithDoctrines(gameState);
      const canGrow = building.populationCount < farmerCap || building.strongholdNobles < nobleCap;
      return canGrow ? POPULATION.HOUSE_GROWTH_INTERVAL - building.populationGrowthCounter : null;
    }
    const effectiveCap = getEffectiveHousingPopulationCap(gameState, building);
    return building.populationCount < effectiveCap
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
      <button className="hud-panel-header hud-panel-header-btn" onClick={() => setBuildingInfoOpen(true)} aria-label={t('hud.buildingPanel.viewBuildingInfo', { building: buildingName(building.type) })}>
        <span className="hud-panel-emoji">{BUILDING_EMOJI[building.type] ?? '?'}</span>
        <span className="hud-panel-name">
          {buildingName(building.type)}
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
        <button className="hud-unit-stats-btn" onClick={() => setBuildingStatDetailOpen(true)} aria-label={t('hud.buildingPanel.viewStatModifiers')}>
          <div className="hud-unit-stats">
            <span className="hud-stat-label">{statAbbr('attack')}</span>
            <span className="hud-stat-value">
              {building.combatStats.attack - garrisonAtkMod}
              {showBuildingStatMod(totalAtkMod)}
            </span>
            <span className="hud-stat-label">{statAbbr('defense')}</span>
            <span className="hud-stat-value">{building.combatStats.defense}</span>
            <span className="hud-stat-label">{statAbbr('attackRange')}</span>
            <span className="hud-stat-value">
              {building.combatStats.attackRange - garrisonRngMod}
              {showBuildingStatMod(garrisonRngMod)}
            </span>
            <span className="hud-stat-label">{statAbbr('discoverRadius')}</span>
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
              {tag === UnitTag.RANGED ? `◎ ${t('hud.buildingPanel.ranged')}` : tagLabel(tag)}
            </span>
          ))}
        </div>
      )}

      {/* Action tags for player-owned attacking buildings */}
      {isPlayerOwned && hasCombatStats && (
        <div className="hud-action-tags">
          <span className={`hud-action-tag ${canAttack ? '' : 'hud-action-used'}`}>{t('hud.unitPanel.attack')}</span>
        </div>
      )}

      {/* Capture warning: unit is consumed when capturing this building */}
      {building.consumesUnitOnCapture && (
        <div className="hud-warning hud-capture-warning">
          ⚠️ {t('hud.buildingPanel.captureConsumesUnit')}
        </div>
      )}

      {/* Warnings */}
      {isDisabled && (
        <div className="hud-warning hud-disabled-note">
          🚫 {t('hud.buildingPanel.disabledFor', { turns: building.isDisabledForTurns })}
        </div>
      )}
      {isUnderAttack && (
        <div className="hud-warning hud-attack-warning">
          ⚔️ {t('hud.buildingPanel.underAttack')}
        </div>
      )}

      {/* Crystal Chamber / Crystal Cave resonance status */}
      {(building.type === BuildingType.CRYSTAL_CHAMBER || building.type === BuildingType.CRYSTAL_CAVE) && building.resonanceTurnsRemaining > 0 && (
        <div className="hud-production-row">
          ✨ {t('hud.buildingPanel.resonating', { turns: building.resonanceTurnsRemaining })}
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
          🛠️ {t('hud.buildingPanel.recruitScores')}
        </button>
      )}
      {recruitScoreModal && (
        <RecruitScoreModal scores={recruitScores} onClose={() => setRecruitScoreModal(false)} />
      )}

      {/* Production rate for resource buildings */}
      {isMine && (
        <div className="hud-production-row">
          {t('hud.buildingPanel.ironPerTurn', { amount: RESOURCES.MINE_IRON_PER_TURN })}
          {isDisabled && <span className="hud-dim"> ({t('hud.buildingPanel.paused')})</span>}
        </div>
      )}
      {isDeepMine && (
        <div className="hud-production-row">
          {t('hud.buildingPanel.ironPerTurn', { amount: RESOURCES.DEEP_MINE_IRON_PER_TURN })}
          {isDisabled && <span className="hud-dim"> ({t('hud.buildingPanel.paused')})</span>}
        </div>
      )}
      {/* Charcoal Kiln buff indicator on a selected mine */}
      {mineHasKilnBuff && (
        <div className="hud-production-row hud-buff-note">
          {t('hud.buildingPanel.kilnMineBonus', { amount: RESOURCES.CHARCOAL_KILN_IRON_BONUS * mineKilnBonusCount, count: mineKilnBonusCount })}
        </div>
      )}
      {isWoodcutter && (
        <div className="hud-production-row">
          {t('hud.buildingPanel.woodPerTurn', { amount: RESOURCES.WOODCUTTER_WOOD_PER_TURN })}
          {isDisabled && <span className="hud-dim"> ({t('hud.buildingPanel.paused')})</span>}
        </div>
      )}
      {/* Charcoal Kiln panel: radius and current coverage */}
      {isCharcoalKiln && (
        <div className="hud-production-row">
          {t('hud.buildingPanel.kilnDescription', { radius: RESOURCES.CHARCOAL_KILN_RADIUS, amount: RESOURCES.CHARCOAL_KILN_IRON_BONUS })}
          {isDisabled && <span className="hud-dim"> ({t('hud.buildingPanel.paused')})</span>}
        </div>
      )}

      {/* Population info for FARM, PATRICIANHOUSE, and STRONGHOLD */}
      {isHousingBuilding && (
        <div className="hud-production-row">
          {building.type === BuildingType.STRONGHOLD ? (
            <>
              {(() => {
                const { farmerCap, nobleCap } = getStrongholdEffectiveCapWithDoctrines(gameState);
                return t('hud.buildingPanel.strongholdPopulation', {
                  farmers: building.populationCount,
                  farmerCap,
                  nobles: building.strongholdNobles,
                  nobleCap,
                  farmerName: populationName('farmer'),
                  nobleName: populationName('noble'),
                });
              })()}
            </>
          ) : (
            <>
              {(() => {
                const effectiveCap = getEffectiveHousingPopulationCap(gameState, building);
                return t('hud.buildingPanel.housingPopulation', {
                  count: building.populationCount,
                  capacity: effectiveCap,
                  population: housingLabel,
                });
              })()}
            </>
          )}
          {turnsUntilNextPop !== null && (
            <span className="hud-dim"> · {t('hud.buildingPanel.nextPopulation', { turns: turnsUntilNextPop })}</span>
          )}
        </div>
      )}

      {/* Unit limit for recruitment buildings */}
      {isRecruitmentBuilding && isFinite(unitLimit) && recruitableTypes.length > 0 && (
        <div className="hud-production-row">
          🗡️ {t('hud.buildingPanel.recruitmentLimit', { current: recruitedUnits, limit: unitLimit })}
          {atUnitLimit && (
            <span className="hud-dim"> · {t('hud.buildingPanel.buildMoreForLimit')}</span>
          )}
        </div>
      )}
      {/* Per-building recruitment turn limit indicator */}
      {alreadyRecruitedThisTurn && (
        <div className="hud-production-row hud-dim">
          ⏳ {t('hud.buildingPanel.alreadyRecruited')}
        </div>
      )}

      {/* Gravestone Gargoyle button: shown on any player Gravestone when the Deathmender specialist is active */}
      {canRaiseGargoyleHere && (
        <div className="hud-revive-row">
          {graveOccupied ? (
            <span className="hud-dim">{t('hud.buildingPanel.moveUnitToRaiseGargoyle')}</span>
          ) : (
            <button
              className="hud-recruit-btn"
              disabled={!canRaiseGargoyle}
              onClick={handleRaiseGargoyle}
              title={!canRaiseGargoyle ? t('hud.buildingPanel.needCrystals', { needed: ABILITIES.GARGOYLE_CRYSTAL_COST, have: arcaneCrystals }) : undefined}
            >
              🗿 {t('hud.buildingPanel.raiseGargoyle', { cost: ABILITIES.GARGOYLE_CRYSTAL_COST })}
            </button>
          )}
        </div>
      )}

      {/* Grave Trap description */}
      {isGraveTrap && (
        <div className="hud-revive-row">
          <span className="hud-dim">{t('hud.buildingPanel.graveTrapDescription')}</span>
        </div>
      )}

      {/* Recruitment */}
      {recruitableTypes.length > 0 && isPlayerOwned && (
        <div className="hud-recruit-row">
          <span className="hud-label">{t('hud.buildingPanel.recruit')}</span>
          {chamberNotResonating ? (
            <span className="hud-dim">
              {building.type === BuildingType.CRYSTAL_CAVE
                ? t('hud.buildingPanel.caveMustResonate')
                : t('hud.buildingPanel.chamberMustResonate')}
            </span>
          ) : !hasSpawnSpace ? (
            <span className="hud-dim">{t('hud.buildingPanel.noSpace')}</span>
          ) : (
            <div className="hud-recruit-options">
              {recruitableTypes.map((unitType) => {
                // Units with a configured crystal cost are paid in arcane crystals, not iron/wood.
                const isCrystalCost = isCrystalCostUnit(unitType);
                const baseCost = UNIT_DEFINITIONS[unitType]?.cost;
                const cost = isCrystalCost
                  ? undefined
                  : getEffectiveRecruitCost(gameState, unitType);
                const crystalCost = isCrystalCost ? (baseCost?.crystals ?? 0) : 0;
                const canAffordUnit = isCrystalCost
                  ? arcaneCrystals >= crystalCost
                  : cost
                    ? resources.iron >= cost.iron && resources.wood >= cost.wood
                    : false;
                const popCost = UNIT_DEFINITIONS[unitType]?.populationCost as UnitPopulationCost | undefined;
                const hasPopulation = canAffordPopulation(useGameStore.getState(), unitType);
                const canRecruitThisUnit = !isDisabled && hasSpawnSpace && canAffordUnit && hasPopulation && !atUnitLimit && !alreadyRecruitedThisTurn;
                const handleRecruitSelection = () => {
                  if (!canAffordUnit) {
                    tryTriggerHint('H07_RECRUIT_NO_RESOURCES');
                    return;
                  }
                  if (!hasPopulation) {
                    tryTriggerHint('H08_RECRUIT_NO_POPULATION');
                    return;
                  }
                  if (atUnitLimit) {
                    tryTriggerHint('H09_RECRUIT_NO_CAPACITY');
                    return;
                  }
                  if (!canRecruitThisUnit) return;
                  setConfirmRecruitUnit(unitType);
                };
                // Compute per-factor block messages using a pure helper
                const { resourceWarningMsg, popWarningMsg, capWarningMsg } = (() => {
                  const state = useGameStore.getState();
                  const usage = computePopulationUsage(state);
                  const capacity = computePopulationCapacity(state);
                  return buildRecruitBlockMessages(
                    isCrystalCost,
                    cost ?? undefined,
                    crystalCost,
                    resources,
                    arcaneCrystals,
                    canAffordUnit,
                    hasPopulation,
                    popCost,
                    usage,
                    capacity,
                    atUnitLimit,
                    building.type === BuildingType.CRYSTAL_CAVE,
                    recruitedUnits,
                    unitLimit,
                    building.type,
                  );
                })();
                return (
                  <div key={unitType} className="hud-recruit-option-wrapper">
                    <button
                      className={`info-row-btn${canRecruitThisUnit ? '' : ' info-row-btn--disabled'}`}
                      aria-disabled={!canRecruitThisUnit}
                      onClick={handleRecruitSelection}
                    >
                      <span className="info-row-emoji">{UNIT_EMOJI[unitType] ?? ''}</span>
                      <div className="info-row-body">
                        <div className="info-row-name">
                          {unitName(unitType)}
                          <span className="info-badge info-badge--small">i</span>
                        </div>
                        {isCrystalCost && <div className="info-row-cost">💎{crystalCost}</div>}
                        {cost && <div className="info-row-cost">⛓️{cost.iron} 🪵{cost.wood}</div>}
                      </div>
                    </button>
                    {popCost && (popCost.farmers > 0 || popCost.nobles > 0) && (
                      <span className="hud-pop-req">
                        {t('hud.buildingPanel.requiresPopulation', {
                          population: formatList([
                            ...(popCost.farmers > 0 ? [t('hud.buildingPanel.farmerCost', { count: popCost.farmers })] : []),
                            ...(popCost.nobles > 0 ? [t('hud.buildingPanel.nobleCost', { count: popCost.nobles })] : []),
                          ]),
                        })}
                      </span>
                    )}
                    {resourceWarningMsg && (
                      <span className="hud-pop-warning">{t(resourceWarningMsg)}</span>
                    )}
                    {popWarningMsg && (
                      <span className="hud-pop-warning">{t(popWarningMsg)}</span>
                    )}
                    {capWarningMsg && (
                      <span className="hud-pop-warning">{t(capWarningMsg)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {confirmRecruitUnit && (() => {
        const isCrystalCost = isCrystalCostUnit(confirmRecruitUnit);
        const baseCost = UNIT_DEFINITIONS[confirmRecruitUnit]?.cost;
        const cost = isCrystalCost
          ? undefined
          : getEffectiveRecruitCost(gameState, confirmRecruitUnit);
        const costLabel = isCrystalCost
          ? `💎${baseCost?.crystals ?? 0}`
          : cost ? `⛓️${cost.iron} 🪵${cost.wood}` : undefined;
        return (
          <UnitInfoPopup
            unitType={confirmRecruitUnit}
            costLabel={costLabel}
            actionLabel={t('hud.buildingPanel.recruitAction')}
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
          crystalCost={building.type === BuildingType.CRYSTAL_CAVE ? CRYSTAL_CAVE_CONFIG.CAVE_SPELL_CRYSTAL_COST : undefined}
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

function BottomBar({ onOpenTechTreeAt }: { onOpenTechTreeAt: (techId: TechId) => void }) {
  const { t } = useText();
  const [isConstructionExpanded, setIsConstructionExpanded] = useState(false);
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
  const activeHintId = useHintStore((s) => s.activeHintId);

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
      ? getCaptureTarget(selectedUnit, useGameStore.getState()) ?? undefined
      : undefined;

  const captureTargetId = captureTarget?.id;

  const handleCapture = useCallback(() => {
    if (selectedUnitId && captureTargetId) {
      captureBuilding(selectedUnitId, captureTargetId);
    }
  }, [selectedUnitId, captureTargetId, captureBuilding]);

  // Preview eligibility is separate from authoritative construction legality.
  const showConstruction = useGameStore((s) => {
    const unit = s.selectedUnitId ? s.units[s.selectedUnitId] : undefined;
    return !!unit && canUnitPreviewConstruction(unit, s);
  });

  // Conversion panel: show when a player BUILD_AND_CAPTURE unit is on a convertible building
  const showConversion = useGameStore((s) => {
    if (!selectedUnit) return false;
    return canUnitConvertBuilding(s, selectedUnit.id);
  });

  const isPlayerTurn = phase === GamePhase.PLAYER_TURN;
  const isHintBlocking = activeHintId !== null;
  const constructionFocusActive =
    isConstructionExpanded && !!selectedUnit && showConstruction && !cavePopupActive && !isHintBlocking;

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
    <div className={`hud-bottom-bar${constructionFocusActive ? ' hud-bottom-bar--construction-focus' : ''}`}>
      {/* Info panels — hidden while cave screams popup is active */}
      {selectedUnit && !cavePopupActive && (
        <div className="hud-selected-unit-slot">
          <SelectedUnitPanel
            unit={selectedUnit}
            captureTarget={captureTarget}
            onCapture={handleCapture}
          />
        </div>
      )}
      {/* Construction panel for BUILDANDCAPTURE units on constructable tiles */}
      {selectedUnit && showConstruction && !cavePopupActive && !isHintBlocking && (
        <ConstructionPanel
          key={`${selectedUnit.id}:${selectedUnit.position.x},${selectedUnit.position.y}`}
          unit={selectedUnit}
          tilePos={selectedUnit.position}
          onOpenTechTreeAt={onOpenTechTreeAt}
          isExpanded={isConstructionExpanded}
          onExpandedChange={setIsConstructionExpanded}
        />
      )}
      {/* Conversion panel for BUILDANDCAPTURE units on own Ruin buildings */}
      {selectedUnit && showConversion && !cavePopupActive && !isHintBlocking && (
        <ConversionPanel unit={selectedUnit} />
      )}
      {selectedBuilding && !selectedUnit && !cavePopupActive && (
        <SelectedBuildingPanel building={selectedBuilding} />
      )}
      {selectedTile && !selectedUnit && !selectedBuilding && !cavePopupActive && (
        <SelectedTilePanel tile={selectedTile} />
      )}

      {/* End Turn / Enemy Turn feedback */}
      {isPlayerTurn && !isAnimating && !isHintBlocking && (
        <button className="hud-end-turn-btn" onClick={endPlayerTurn}>
          {t('hud.bottomBar.endTurn')} ⏭️
        </button>
      )}
      {(!isPlayerTurn || isAnimating || isHintBlocking) && (
        <span className={`hud-end-turn-btn hud-end-turn-btn--enemy-turn${isHintBlocking ? ' hud-end-turn-btn--hint-blocked' : ''}`}>
          {isHintBlocking ? `💡 ${t('hud.bottomBar.dismissHint')}` : `⚔️ ${t('hud.bottomBar.enemyTurn')}`}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// GAME OVER / VICTORY OVERLAYS
// ============================================================================

function EndGameStats({ stats }: { stats: GameStats }) {
  const { t } = useText();
  return (
    <div className="hud-endgame-stats">
      <div className="hud-endgame-stats-grid">
        <span className="hud-endgame-stat-label">⚔️ {t('hud.endGameStats.unitsKilled')}</span>
        <span className="hud-endgame-stat-value">{stats.unitsKilled}</span>
        <span className="hud-endgame-stat-label">💀 {t('hud.endGameStats.unitsLost')}</span>
        <span className="hud-endgame-stat-value">{stats.unitsLost}</span>
        <span className="hud-endgame-stat-label">🗡️ {t('hud.endGameStats.damageDealt')}</span>
        <span className="hud-endgame-stat-value">{stats.damageDealt}</span>
        <span className="hud-endgame-stat-label">🛡️ {t('hud.endGameStats.damageReceived')}</span>
        <span className="hud-endgame-stat-value">{stats.damageReceived}</span>
        <span className="hud-endgame-stat-label">🪖 {t('hud.endGameStats.unitsRecruited')}</span>
        <span className="hud-endgame-stat-value">{stats.unitsRecruited}</span>
        <span className="hud-endgame-stat-label">🏗️ {t('hud.endGameStats.buildingsConstructed')}</span>
        <span className="hud-endgame-stat-value">{stats.buildingsConstructed}</span>
        <span className="hud-endgame-stat-label">🔄 {t('hud.endGameStats.buildingsConverted')}</span>
        <span className="hud-endgame-stat-value">{stats.buildingsConverted}</span>
        <span className="hud-endgame-stat-label">🔬 {t('hud.endGameStats.techsUnlocked')}</span>
        <span className="hud-endgame-stat-value">{stats.techsUnlocked}</span>
        <span className="hud-endgame-stat-label">💥 {t('hud.endGameStats.enemyBuildingsDestroyed')}</span>
        <span className="hud-endgame-stat-value">{stats.enemyBuildingsDestroyed}</span>
        <span className="hud-endgame-stat-label">🚩 {t('hud.endGameStats.enemyBuildingsCaptured')}</span>
        <span className="hud-endgame-stat-value">{stats.enemyBuildingsCaptured}</span>
        <span className="hud-endgame-stat-label">🏚️ {t('hud.endGameStats.buildingsDestroyedByEnemy')}</span>
        <span className="hud-endgame-stat-value">{stats.buildingsDestroyedByEnemy}</span>
        <span className="hud-endgame-stat-label">🔴 {t('hud.endGameStats.buildingsCapturedByEnemy')}</span>
        <span className="hud-endgame-stat-value">{stats.buildingsCapturedByEnemy}</span>
        <span className="hud-endgame-stat-label">🌋 {t('hud.endGameStats.buildingsDestroyedByLava')}</span>
        <span className="hud-endgame-stat-value">{stats.buildingsDestroyedByLava}</span>
      </div>
    </div>
  );
}

function EndScreenAiTraceExport({ slotId }: { slotId: string }) {
  const [traceRows, setTraceRows] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    readAiTraceMeta(slotId).then((meta) => {
      if (!cancelled) setTraceRows(meta?.rowCount ?? 0);
    }).catch(() => {
      if (!cancelled) setTraceRows(0);
    });
    return () => {
      cancelled = true;
    };
  }, [slotId]);

  if (traceRows <= 0) return null;
  return <AiTraceExportControls slotId={slotId} compact />;
}

function GameOverOverlay() {
  const { t, buildingName } = useText();
  const turn = useGameStore((s) => s.turn);
  const gameStats = useGameStore((s) => s.gameStats);
  const discardFinishedGame = useGameStore((s) => s.discardFinishedGame);
  const gameOverCause = useGameStore((s) => s.gameOverCause ?? null);
  const activeSaveId = useMenuStore((s) => s.activeSaveId);

  const causeText =
    gameOverCause === 'LAVA'
      ? t('hud.gameOver.lavaCause', { stronghold: buildingName(BuildingType.STRONGHOLD) })
      : gameOverCause === 'ENEMY'
      ? t('hud.gameOver.enemyCause', { stronghold: buildingName(BuildingType.STRONGHOLD) })
      : null;

  const handleNewGame = useCallback(async () => {
    await discardFinishedGame();
    useMenuStore.setState({ panel: 'NEW', screen: 'MENU', navDir: 'forward', activeSaveId: null });
  }, [discardFinishedGame]);

  const handleMainMenu = useCallback(async () => {
    stopGameMusic();
    await discardFinishedGame();
    useMenuStore.getState().toMenu();
  }, [discardFinishedGame]);

  const handleExport = useCallback(async () => {
    if (!activeSaveId) return;
    await downloadSaveExport(activeSaveId);
  }, [activeSaveId]);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-defeat">💀 {t('hud.gameOver.defeated')}</h1>
        <p className="hud-overlay-sub">{t('hud.gameOver.survived', { turns: turn })}</p>
        {causeText && <p className="hud-overlay-cause">{causeText}</p>}
        <EndGameStats stats={gameStats} />
        {activeSaveId && (
          <>
            <button className="hud-play-again-btn" onClick={() => void handleExport()}>
              📤 {t('hud.gameOver.exportRun')}
            </button>
            <EndScreenAiTraceExport slotId={activeSaveId} />
          </>
        )}
        <button className="hud-play-again-btn" onClick={handleNewGame}>
          <FitText text={`🔄 ${t('hud.gameMenu.newGame')}`} />
        </button>
        <button className="hud-play-again-btn" onClick={handleMainMenu}>
          <FitText text={`🏠 ${t('hud.options.mainMenu')}`} />
        </button>
      </div>
    </div>
  );
}

function VictoryOverlay() {
  const { t } = useText();
  const turn = useGameStore((s) => s.turn);
  const gameStats = useGameStore((s) => s.gameStats);
  const discardFinishedGame = useGameStore((s) => s.discardFinishedGame);
  const activeSaveId = useMenuStore((s) => s.activeSaveId);

  const handleNewGame = useCallback(async () => {
    await discardFinishedGame();
    useMenuStore.setState({ panel: 'NEW', screen: 'MENU', navDir: 'forward', activeSaveId: null });
  }, [discardFinishedGame]);

  const handleMainMenu = useCallback(async () => {
    stopGameMusic();
    await discardFinishedGame();
    useMenuStore.getState().toMenu();
  }, [discardFinishedGame]);

  const handleExport = useCallback(async () => {
    if (!activeSaveId) return;
    await downloadSaveExport(activeSaveId);
  }, [activeSaveId]);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-victory">🏆 {t('hud.victory.title')}</h1>
        <p className="hud-overlay-sub">{t('hud.victory.completedIn', { turns: turn })}</p>
        <EndGameStats stats={gameStats} />
        {activeSaveId && (
          <>
            <button className="hud-play-again-btn" onClick={() => void handleExport()}>
              📤 {t('hud.gameOver.exportRun')}
            </button>
            <EndScreenAiTraceExport slotId={activeSaveId} />
          </>
        )}
        <button className="hud-play-again-btn" onClick={handleNewGame}>
          <FitText text={`🔄 ${t('hud.gameMenu.newGame')}`} />
        </button>
        <button className="hud-play-again-btn" onClick={handleMainMenu}>
          <FitText text={`🏠 ${t('hud.options.mainMenu')}`} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// GAME INTRO POPUP
// ============================================================================

function GameIntroPopup({ onDismiss }: { onDismiss: () => void }) {
  const { t, buildingName } = useText();
  return (
    <div className="hud-intro-overlay">
      <div className="hud-intro-card">
        <div className="hud-intro-icon">🌋</div>
        <p className="hud-intro-text">
          {t('hud.gameIntro.firstSentence')} {t('hud.gameIntro.secondSentence')}<br />
          {t('hud.gameIntro.thirdSentence', { sanctum: buildingName(BuildingType.INFERNALSANCTUM) })}{' '}
          {t('hud.gameIntro.fourthSentence', { stronghold: buildingName(BuildingType.STRONGHOLD) })}
        </p>
        <button className="hud-intro-cta" onClick={onDismiss}>
          {t('hud.gameIntro.continue')}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ZONE CLEARED POPUP
// ============================================================================

function ZoneClearedPopup() {
  const { t } = useText();
  const active = useZoneClearedStore((s) => s.active);
  const zone = useZoneClearedStore((s) => s.zone);
  const dismiss = useZoneClearedStore((s) => s.dismiss);

  if (!active) return null;

  return (
    <div className="hud-zone-cleared-overlay">
      <div className="hud-zone-cleared-card">
        <span className="hud-zone-cleared-label">{t('hud.zoneCleared.zone', { zone })}</span>
        <span className="hud-zone-cleared-title">{t('hud.zoneCleared.title')}</span>
        <button className="hud-zone-cleared-btn" onClick={dismiss}>
          {t('hud.zoneCleared.continue')}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CAVE SCREAMS POPUP
// ============================================================================

function CaveScreamsPopup() {
  const { t } = useText();
  const tilePos = useCaveScreamsStore((s) => s.tilePos);
  const sealCave = useGameStore((s) => s.sealCave);
  const exploreCave = useGameStore((s) => s.exploreCave);

  if (!tilePos) return null;

  const handleExplore = () => {
    exploreCave(tilePos);
    // exploreCave calls close() on the caveScreamsStore internally
  };

  const handleSeal = () => {
    sealCave(tilePos);
    // close() is called inside sealCave after state update
  };

  return (
    <div className="cave-screams-overlay">
      <div className="cave-screams-card">
        <p className="cave-screams-flavor">
          {t('hud.caveScreams.description')}
        </p>
        <div className="cave-screams-actions">
          <button className="cave-screams-btn" onClick={handleExplore}>
            🗡️ {t('hud.caveScreams.explore')}
          </button>
          <button className="cave-screams-btn" onClick={handleSeal}>
            🪨 {t('hud.caveScreams.seal')}
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
  const { t } = useText();
  const hasUpkeep = iron > 0 || wood > 0;
  return (
    <div className="specialist-info-upkeep">
      {hasUpkeep ? (
        <>{t('hud.specialistInfo.upkeep')} {iron > 0 && <span>⛓️{iron}</span>}{iron > 0 && wood > 0 && ' '}{wood > 0 && <span>🪵{wood}</span>}
          {isDormant && <span className="specialist-info-dormant-note"> · {t('hud.specialistInfo.cannotPayUpkeep')}</span>}
        </>
      ) : (
        <span className="specialist-info-no-upkeep">{t('hud.specialistInfo.noUpkeep')}</span>
      )}
    </div>
  );
}

/** Specialist info popup — shown when clicking a filled specialist slot in the top bar, or in swap view */
function SpecialistInfoPopup({ specialist, onClose, onDismiss }: { specialist: Specialist; onClose: () => void; onDismiss?: () => void }) {
  const { specialistName, specialistDesc, t } = useText();
  const name = specialistName(specialist.id);
  const iron = specialist.upkeepIron ?? 0;
  const wood = specialist.upkeepWood ?? 0;
  const isDormant = !!specialist.dormant;
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);

  return (
    <Popup onClose={onClose}>
      <div className="specialist-info-header">
        <span className="specialist-info-name">🧙 {name}</span>
        {isDormant && <span className="specialist-info-dormant"> ⚠️ {t('hud.specialistInfo.inactive')}</span>}
      </div>
      <p className="info-popup-desc">{specialistDesc(specialist.id)}</p>
      <SpecialistUpkeepLine iron={iron} wood={wood} isDormant={isDormant} />
      {confirmingDismiss && onDismiss ? (
        <div className="specialist-dismiss-confirm">
          <p className="specialist-dismiss-confirm-text">
            {t('hud.specialistInfo.dismissConfirm', { name })}
          </p>
          <div className="specialist-dismiss-confirm-actions">
            <button className="info-popup-btn info-popup-btn--danger" onClick={onDismiss}><FitText text={t('hud.specialistInfo.confirmDismiss')} /></button>
            <button className="info-popup-btn info-popup-btn--secondary" onClick={() => setConfirmingDismiss(false)}><FitText text={t('common.cancel')} /></button>
          </div>
        </div>
      ) : (
        <div className="specialist-info-actions">
          <button className="info-popup-btn info-popup-btn--secondary" onClick={onClose}><FitText text={t('common.close')} /></button>
          {onDismiss && (
            <button className="info-popup-btn info-popup-btn--dismiss" onClick={() => setConfirmingDismiss(true)}><FitText text={t('hud.specialistInfo.dismiss')} /></button>
          )}
        </div>
      )}
    </Popup>
  );
}

function MarketPanel() {
  const { specialistName, specialistDesc, t } = useText();
  const open = useMarketPanelStore((s) => s.open);
  const marketId = useMarketPanelStore((s) => s.marketId);
  const unitId = useMarketPanelStore((s) => s.unitId);
  const pendingSpecialistSlot = useMarketPanelStore((s) => s.pendingSpecialistSlot);
  const beginSpecialistSwap = useMarketPanelStore((s) => s.beginSpecialistSwap);
  const cancelSpecialistSwap = useMarketPanelStore((s) => s.cancelSpecialistSwap);

  const closeMarket = useGameStore((s) => s.closeMarket);
  const buyMarketOffer = useGameStore((s) => s.buyMarketOffer);
  const buyMarketSpecialist = useGameStore((s) => s.buyMarketSpecialist);
  const restockMarket = useGameStore((s) => s.restockMarket);
  const freeRestockMarket = useGameStore((s) => s.freeRestockMarket);
  const turn = useGameStore((s) => s.turn);

  const resources = useGameStore((s) => s.resources);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const specialistSlotCap = useGameStore((s) => s.specialistSlotCap);
  const specialists = useGameStore((s) => s.specialists);
  const buildings = useGameStore((s) => s.buildings);
  const units = useGameStore((s) => s.units);

  if (!open || !marketId || !unitId) return null;
  const market = buildings[marketId];
  const unit = units[unitId];
  if (!market || !unit) return null;

  const hasTradedThisTurn = unit.hasTradedThisTurn;
  const resourceSlots = market.marketResourceSlots ?? [];
  const specialistSlots = market.marketSpecialistSlots ?? [];
  const hasRoom = globalSpecialistStorage.length < specialistSlotCap;

  const canAffordRestock =
    resources.wood >= MARKET.RESTOCK_COST.wood &&
    resources.iron >= MARKET.RESTOCK_COST.iron &&
    arcaneCrystals >= MARKET.RESTOCK_COST.crystal;

  const lastFreeRestockTurn = market.lastFreeRestockTurn;
  const freeRestockOnCooldown =
    lastFreeRestockTurn !== undefined &&
    turn - lastFreeRestockTurn < MARKET.FREE_RESTOCK_INTERVAL_TURNS;
  const freeRestockTurnsRemaining = freeRestockOnCooldown
    ? MARKET.FREE_RESTOCK_INTERVAL_TURNS - (turn - lastFreeRestockTurn!)
    : 0;
  const freeRestockLabel = freeRestockOnCooldown
    ? t('hud.market.freeRestockCooldown', { turns: freeRestockTurnsRemaining })
    : t('hud.market.freeRestock');

  const currencyLabel = (cur: string, amount: number) => {
    if (cur === 'WOOD') return `🪵${amount}`;
    if (cur === 'IRON') return `⛓️${amount}`;
    return `💎${amount}`;
  };

  const canAffordOffer = (give: { currency: string; amount: number }) => {
    if (give.currency === 'WOOD') return resources.wood >= give.amount;
    if (give.currency === 'IRON') return resources.iron >= give.amount;
    return arcaneCrystals >= give.amount;
  };

  // Specialist swap sub-view
  if (pendingSpecialistSlot !== null) {
    const incomingSpecId = specialistSlots[pendingSpecialistSlot];
    const incomingSpec = incomingSpecId ? (specialists[incomingSpecId] ?? SPECIALIST_DEFINITIONS[incomingSpecId] ?? null) : null;
    return (
      <div className="market-panel-overlay">
        <div className="market-panel-card market-panel-card--swap">
          <div className="market-panel-swap-head">
            <div className="market-panel-header">
              <span className="market-panel-title">🔄 {t('hud.market.replaceSpecialist')}</span>
              <button className="market-panel-close" onClick={cancelSpecialistSwap} aria-label={t('hud.market.cancelSpecialistReplacement')}>✕</button>
            </div>
            {incomingSpec && (
              <div className="market-panel-specialist-incoming">
                <span className="market-panel-specialist-name">🧙 {specialistName(incomingSpec.id)}</span>
                <p className="market-panel-specialist-desc">{specialistDesc(incomingSpec.id)}</p>
                <span className="market-panel-specialist-cost">{t('hud.market.specialistCost', { cost: MARKET.SPECIALIST_PRICE_CRYSTAL })}</span>
              </div>
            )}
            <div className="market-panel-swap-divider">{t('hud.market.replaceOneSpecialist')}</div>
          </div>
          <div className="market-panel-swap-list">
            {globalSpecialistStorage.map((specId) => {
              const spec = specialists[specId] ?? SPECIALIST_DEFINITIONS[specId];
              if (!spec) return null;
              return (
                <div key={specId} className="market-panel-swap-row">
                  <span className="market-panel-specialist-name">🧙 {specialistName(spec.id)}</span>
                  <button
                    className="market-panel-btn market-panel-btn--buy"
                    disabled={arcaneCrystals < MARKET.SPECIALIST_PRICE_CRYSTAL}
                    onClick={() => {
                      buyMarketSpecialist(marketId, pendingSpecialistSlot, specId);
                    }}
                  >
                    <FitText text={t('hud.market.replaceForCrystals', { cost: MARKET.SPECIALIST_PRICE_CRYSTAL })} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="market-panel-swap-footer">
            <button className="market-panel-btn market-panel-btn--close" onClick={cancelSpecialistSwap}>
              <FitText text={t('common.cancel')} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="market-panel-overlay">
      <div className="market-panel-card">
        <div className="market-panel-header">
          <span className="market-panel-title">🪙 {t('hud.market.title')}</span>
          <button className="market-panel-close" onClick={closeMarket} aria-label={t('hud.market.closeMarket')}>✕</button>
        </div>

        {/* Resource slots */}
        <div className="market-panel-section-label">{t('hud.market.resourceTrades')}</div>
        {resourceSlots.map((slot, i) =>
          slot ? (
            <div key={i} className="market-panel-offer-row">
              <span className="market-panel-offer-trade">
                {currencyLabel(slot.give.currency, slot.give.amount)} → {currencyLabel(slot.gain.currency, slot.gain.amount)}
              </span>
              <button
                className="market-panel-btn market-panel-btn--buy"
                disabled={hasTradedThisTurn || !canAffordOffer(slot.give)}
                onClick={() => buyMarketOffer(marketId, i)}
              >
                <FitText text={t('hud.market.buy')} />
              </button>
            </div>
          ) : (
            <div key={i} className="market-panel-offer-row market-panel-offer-empty">
              <span className="market-panel-offer-trade">{t('hud.market.empty')}</span>
            </div>
          )
        )}

        {/* Specialist slots */}
        <div className="market-panel-section-label">{t('hud.market.specialistOffers')}</div>
        {specialistSlots.map((specId, i) => {
          const specDef = specId ? (specialists[specId] ?? SPECIALIST_DEFINITIONS[specId] ?? null) : null;
          return specDef ? (
            <div key={i} className="market-panel-offer-row">
              <div className="market-panel-specialist-info">
                <span className="market-panel-specialist-name">🧙 {specialistName(specDef.id)}</span>
                <p className="market-panel-specialist-desc">{specialistDesc(specDef.id)}</p>
              </div>
              <button
                className="market-panel-btn market-panel-btn--buy"
                disabled={hasTradedThisTurn || arcaneCrystals < MARKET.SPECIALIST_PRICE_CRYSTAL}
                onClick={() => {
                  if (hasRoom) {
                    buyMarketSpecialist(marketId, i);
                  } else {
                    beginSpecialistSwap(i);
                  }
                }}
              >
                <FitText text={t('hud.market.buyForCrystals', { cost: MARKET.SPECIALIST_PRICE_CRYSTAL })} />
              </button>
            </div>
          ) : (
            <div key={i} className="market-panel-offer-row market-panel-offer-empty">
              <span className="market-panel-offer-trade">{t('hud.market.noneAvailable')}</span>
            </div>
          );
        })}

        {/* Restock button */}
        <div className="market-panel-restock-row">
          <span className="market-panel-restock-cost">
            {t('hud.market.restockAll', { cost: [
              ...(MARKET.RESTOCK_COST.wood > 0 ? [`🪵${MARKET.RESTOCK_COST.wood}`] : []),
              ...(MARKET.RESTOCK_COST.iron > 0 ? [`⛓️${MARKET.RESTOCK_COST.iron}`] : []),
              ...(MARKET.RESTOCK_COST.crystal > 0 ? [`💎${MARKET.RESTOCK_COST.crystal}`] : []),
            ].join(' ') })}
          </span>
          <button
            className="market-panel-btn market-panel-btn--restock"
            disabled={hasTradedThisTurn || !canAffordRestock}
            onClick={() => restockMarket(marketId)}
          >
            <FitText text={t('hud.market.restock')} />
          </button>
          <button
            className="market-panel-btn market-panel-btn--restock"
            disabled={hasTradedThisTurn || freeRestockOnCooldown}
            onClick={() => freeRestockMarket(marketId)}
          >
            <FitText text={freeRestockLabel} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CaveMonsterKillModal() {
  const { specialistName, specialistDesc, t } = useText();
  const mode = useSpecialistHireStore((s) => s.mode);
  const specialistId = useSpecialistHireStore((s) => s.specialistId);
  const resolveReward = useSpecialistHireStore((s) => s.resolveReward);
  const closeExhausted = useSpecialistHireStore((s) => s.closeExhausted);
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);

  // ID of the current specialist whose info popup is open (swap view only)
  const [infoSpecId, setInfoSpecId] = useState<string | null>(null);

  if (!mode) return null;

  if (mode === 'exhausted') {
    return (
      <div className="cave-kill-overlay">
        <div className="cave-kill-card">
          <div className="cave-kill-body">
            <p className="cave-kill-flavor">
              <em>
                {t('hud.caveKill.exhaustedFlavor')}
              </em>
            </p>
          </div>
          <div className="cave-kill-actions">
            <button className="cave-kill-btn cave-kill-btn--close" onClick={closeExhausted}>
              {t('common.close')}
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
          <div className="cave-kill-body">
            <p className="cave-kill-flavor">
              <em>
                {t('hud.caveKill.hireFlavor')}
              </em>
            </p>
            <div className="cave-kill-specialist-card">
              <span className="cave-kill-specialist-name">🧙 {specialistName(incomingSpecialist.id)}</span>
              <p className="cave-kill-specialist-desc">{specialistDesc(incomingSpecialist.id)}</p>
              <SpecialistUpkeepLine iron={incomingSpecialist.upkeepIron ?? 0} wood={incomingSpecialist.upkeepWood ?? 0} />
            </div>
          </div>
          <div className="cave-kill-actions">
            <button className="cave-kill-btn cave-kill-btn--hire" onClick={() => resolveReward({ type: 'hire' })}>
              {t('hud.caveKill.hire')}
            </button>
            <button className="cave-kill-btn cave-kill-btn--rob" onClick={() => resolveReward({ type: 'rob' })}>
              {t('hud.caveKill.rob', { crystals: CAVE_SPECIALIST_ROB_REWARD_CRYSTALS })}
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
          <div className="cave-kill-body">
            <div className="cave-kill-swap-incoming-label">{t('hud.caveKill.incomingSurvivor')}</div>
            <div className="cave-kill-specialist-card cave-kill-specialist-card--incoming">
              <span className="cave-kill-specialist-name">🧙 {specialistName(incomingSpecialist.id)}</span>
              <p className="cave-kill-specialist-desc">{specialistDesc(incomingSpecialist.id)}</p>
              <SpecialistUpkeepLine iron={incomingSpecialist.upkeepIron ?? 0} wood={incomingSpecialist.upkeepWood ?? 0} />
            </div>
            <div className="cave-kill-swap-divider">
              <span className="cave-kill-swap-divider-label">{t('hud.market.replaceOneSpecialist')}</span>
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
                    title={t('hud.specialistInfo.viewDetails')}
                  >
                    <span className="cave-kill-specialist-name">🧙 {specialistName(spec.id)}</span>
                    <p className="cave-kill-specialist-desc">{specialistDesc(spec.id)}</p>
                    <span className="cave-kill-swap-info-hint">ℹ {t('hud.specialistInfo.details')}</span>
                  </button>
                  <button
                    className="cave-kill-btn cave-kill-btn--replace"
                    onClick={() => { setInfoSpecId(null); resolveReward({ type: 'swap', outgoingId: specId }); }}
                  >
                    {t('hud.caveKill.replace')}
                  </button>
                </div>
              );
            })}
            </div>
          </div>
          <div className="cave-kill-actions">
            <button className="cave-kill-btn cave-kill-btn--rob" onClick={() => { setInfoSpecId(null); resolveReward({ type: 'rob' }); }}>
              {t('hud.caveKill.rob', { crystals: CAVE_SPECIALIST_ROB_REWARD_CRYSTALS })}
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

function TurnAnnouncementPopup({ turn, emberRose }: { turn: number; emberRose: boolean }) {
  const { t } = useText();
  const totalMs = UI.TURN_POPUP_DISPLAY_MS + UI.TURN_POPUP_FADE_MS;
  return (
    <div
      className={`hud-turn-popup${emberRose ? ' hud-turn-popup--ember' : ''}`}
      style={{ animationDuration: `${totalMs}ms` }}
    >
      <div className="hud-turn-popup-main">{t('hud.turnAnnouncement.turn', { turn })}</div>
      {emberRose && <div className="hud-turn-popup-sub">{t('hud.turnAnnouncement.emberIncreased')}</div>}
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

function TechTreeOverlay({ onClose, focusId }: { onClose: () => void; focusId: TechId | null }) {
  const { unitName, buildingName, techName, techDesc, techEffectText, spellName, formatList, toLocaleUpper, t } = useText();
  const techNodes = useGameStore((s) => s.techNodes);
  const arcaneCrystals = useGameStore((s) => s.arcaneCrystals);
  const ember = useGameStore((s) => s.ember);
  const unlockTech = useGameStore((s) => s.unlockTech);
  const getAvailableTechs = useGameStore((s) => s.getAvailableTechs);

  const [selectedId, setSelectedId] = useState<TechId | null>(focusId);
  const [highlightId, setHighlightId] = useState<TechId | null>(focusId);
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
      .map((reqId) => techName(reqId));
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

  useEffect(() => {
    if (!focusId) return;
    const timeout = window.setTimeout(() => setHighlightId(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [focusId]);

  // Position before paint; focused opens reserve space for the detail sheet.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (focusId) {
      const centre = nodeCentre(focusId);
      const centreFocus = () => {
        const canvas = el.firstElementChild as HTMLElement;
        const viewportRect = el.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const x = centre.x + canvasRect.left - viewportRect.left + el.scrollLeft;
        const y = centre.y + canvasRect.top - viewportRect.top + el.scrollTop;
        el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, x - el.clientWidth / 2));
        el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, y - el.clientHeight / 2));
      };
      centreFocus();
      const observer = new ResizeObserver(centreFocus);
      observer.observe(el);
      return () => observer.disconnect();
    }
    const rootCenter = nodeCentre(TECH_TREE.find((d) => d.requires.length === 0)?.id ?? '');
    el.scrollLeft = rootCenter.x - NODE_W;
    el.scrollTop = rootCenter.y - el.clientHeight / 2;
  }, [focusId]);

  // Canvas dimensions computed from the dynamic layout
  const canvasW = TECH_CANVAS_W;
  const canvasH = TECH_CANVAS_H;

  return (
    <div className={`tech-overlay${focusId ? ' tech-overlay--focused' : ''}`}>
      {/* Header */}
      <div className="tech-overlay-header">
        <span>🔬 {t('hud.techTree.title')}</span>
        {arcaneCrystals > 0 && (
          <span className="tech-overlay-picks">💎 {t('hud.techTree.crystalsAvailable', { count: arcaneCrystals })}{ember > 0 ? ` · 🔥 ${t('hud.techTree.emberLevel', { ember })}` : ''}</span>
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
                className={`tech-node ${stateClass} ${selectedId === def.id ? 'tech-node--selected' : ''} ${highlightId === def.id ? 'tech-node--focus-highlight' : ''}`}
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
                <FitText className="tech-node-name" text={techName(def.id)} maxLines={UI.TECH_NODE_NAME_MAX_LINES} />
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
              {techName(selectedDef.id)}
              {selectedState === 'unlocked' && <span className="tech-detail-label"> ({t('hud.techTree.completed')})</span>}
              {selectedState === 'locked' && <span className="tech-detail-label"> ({t('hud.techTree.locked')})</span>}
            </div>

            {selectedState === 'unlocked' && (
              <p className="tech-detail-text">{t('hud.techTree.alreadyResearched')}</p>
            )}
            {selectedState === 'locked' && unmetPrereqs.length > 0 && (
              <p className="tech-detail-text">{t('hud.techTree.requires', { list: formatList(unmetPrereqs) })}</p>
            )}
            <p className="tech-detail-text">{techDesc(selectedDef.id)}</p>

            <div className="tech-detail-effects">
              {selectedDef.effects.map((e, i) => {
                if (e.type === TechEffectType.UNLOCK_UNIT) {
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoUnitType(e.unitType)}>
                      <span className="tech-effect-tile-emoji">{UNIT_EMOJI[e.unitType] ?? '?'}</span>
                      <span className="tech-effect-tile-name">{unitName(e.unitType)}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                if (e.type === TechEffectType.UNLOCK_BUILDING) {
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoBuildingType(e.buildingType)}>
                      <span className="tech-effect-tile-emoji">{BUILDING_EMOJI[e.buildingType] ?? '?'}</span>
                      <span className="tech-effect-tile-name">{buildingName(e.buildingType)}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                if (e.type === TechEffectType.GRANT_UNIT_TAG) {
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoUnitTag(e.tag)}>
                      <span className="tech-effect-tile-emoji">{TAG_EMOJI[e.tag] ?? '✦'}</span>
                      <span className="tech-effect-tile-name">{techEffectText(e)}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                if (e.type === TechEffectType.UNLOCK_SPELL) {
                  const def = SPELL_DEFINITIONS[e.spellId];
                  return (
                    <button key={i} className="tech-effect-tile" onClick={() => setInfoSpellId(e.spellId)}>
                      <span className="tech-effect-tile-emoji">{def?.emoji ?? '✨'}</span>
                      <span className="tech-effect-tile-name">{spellName(e.spellId)}</span>
                      <span className="info-badge">i</span>
                    </button>
                  );
                }
                return (
                  <span key={i} className="tech-detail-effect-chip">{techEffectText(e)}</span>
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
                    title={!canAfford ? t('hud.techTree.needCrystals', { needed: techCost, have: arcaneCrystals }) : undefined}
                  >
                    <FitText text={canAfford
                      ? t('hud.techTree.research', { cost: techCost })
                      : t('hud.techTree.researchNeed', { cost: techCost })} />
                  </button>
                );
              })()}
              <button
                className="tech-detail-btn tech-detail-btn--secondary"
                onClick={() => setSelectedId(null)}
              >
                <FitText text={toLocaleUpper(t('common.back'))} />
              </button>
            </div>
          </>
        )}
      </div>
      {/* Footer caption */}
      <div className="tech-overlay-footer">
        🔥 {t('hud.techTree.costsIncrease')}
      </div>

      {infoUnitType && (
        <UnitInfoPopup
          unitType={infoUnitType}
          onClose={() => setInfoUnitType(null)}
          isReadOnly
          costLabel={(() => {
            const baseCost = UNIT_DEFINITIONS[infoUnitType]?.cost;
            if (!baseCost) return undefined;
            const cost = getEffectiveRecruitCost(useGameStore.getState(), infoUnitType);
            if (!cost) return baseCost.crystals !== undefined ? `💎${baseCost.crystals}` : undefined;
            return `⛓️${cost.iron} 🪵${cost.wood}`;
          })()}
        />
      )}
      {infoBuildingType && (
        <BuildingInfoPopup
          buildingType={infoBuildingType}
          crystalCost={infoBuildingType === BuildingType.CRYSTAL_CAVE ? CRYSTAL_CAVE_CONFIG.CAVE_SPELL_CRYSTAL_COST : undefined}
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
  const [techTreeFocusId, setTechTreeFocusId] = useState<TechId | null>(null);
  const openTechTreeAt = useCallback((techId: TechId) => {
    setTechTreeFocusId(techId);
    setShowTechTree(true);
  }, []);
  const h01SeenTurnRef = useRef<number | null>(null);
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
  const hasSeenH01WoodcutterHint = useGameStore((s) => s.seenHints?.includes('H01_BUILD_WOODCUTTER') ?? false);

  // Narrow building types for starter-chain hint evaluation (H01/H02/H03).
  // Use stable Immer reference as memo dependency so the selector passed to
  // useSyncExternalStore (Zustand v5) always returns the same reference between
  // consecutive snapshot calls, preventing the "getSnapshot should be cached"
  // invariant violation that causes an infinite render loop and crashes the app.
  const hudBuildings = useGameStore((s) => s.buildings);
  const playerBuildingTypes = useMemo(() => {
    const types = new Set<string>();
    for (const b of Object.values(hudBuildings)) {
      if (b.faction === Faction.PLAYER) types.add(b.type);
    }
    return types;
  }, [hudBuildings]);

  // H01/H02/H03: starter chain, evaluated each player turn.
  useEffect(() => {
    if (phase !== GamePhase.PLAYER_TURN) return;
    const seenHints = useGameStore.getState().seenHints;
    if (
      seenHints.includes('H01_BUILD_WOODCUTTER') &&
      seenHints.includes('H02_BUILD_MINE') &&
      seenHints.includes('H03_BUILD_ON_RUIN')
    ) return;
    if (!playerBuildingTypes.has(BuildingType.WOODCUTTER)) {
      tryTriggerHint('H01_BUILD_WOODCUTTER');
    } else if (!playerBuildingTypes.has(BuildingType.MINE)) {
      tryTriggerHint('H02_BUILD_MINE');
    } else {
      const hasNonBasic = [...playerBuildingTypes].some(
        (t) => t !== BuildingType.WOODCUTTER && t !== BuildingType.MINE && t !== BuildingType.STRONGHOLD,
      );
      if (!hasNonBasic) {
        tryTriggerHint('H03_BUILD_ON_RUIN');
      }
    }
  }, [turn, phase, playerBuildingTypes]);

  // Track the turn when H01 was first seen in this session.
  useEffect(() => {
    if (!hasSeenH01WoodcutterHint) return;
    if (phase !== GamePhase.PLAYER_TURN) return;
    if (h01SeenTurnRef.current !== null) return;
    h01SeenTurnRef.current = turn;
  }, [hasSeenH01WoodcutterHint, phase, turn]);

  // Follow-up hint: on the turn after H01, suggest recruiting a Guard if none exists yet.
  useEffect(() => {
    const h01SeenTurn = h01SeenTurnRef.current;
    if (phase !== GamePhase.PLAYER_TURN) return;
    if (!hasSeenH01WoodcutterHint) return;
    if (h01SeenTurn === null) return;
    if (turn !== h01SeenTurn + 1) return;
    const hasPlayerGuard = Object.values(useGameStore.getState().units)
      .some((u) => u.faction === Faction.PLAYER && u.type === UnitType.GUARD);
    if (hasPlayerGuard) return;
    tryTriggerHint('H01B_RECRUIT_GUARD');
  }, [hasSeenH01WoodcutterHint, phase, turn]);

  const handleIntroDismiss = useCallback(() => {
    setHasSeenIntro(true);
  }, []);

  const handleCloseTechTree = useCallback(() => {
    setShowTechTree(false);
    setTechTreeFocusId(null);
    setCrystalsAtLastTechTreeClose(arcaneCrystals);
  }, [arcaneCrystals]);

  const isPlayerTurn = phase === GamePhase.PLAYER_TURN;
  const emberRose = shouldShowTurnPopupEmberRose(turn);
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
      <MarketPanel />
      <TopBar
        onOpenTechTree={() => {
          setTechTreeFocusId(null);
          setShowTechTree(true);
        }}
        showTechButton={isPlayerTurn}
        arcaneCrystals={arcaneCrystals}
        showTechBadge={showTechBadge}
      />
      <AiTraceBadge />
      <BottomBar onOpenTechTreeAt={openTechTreeAt} />
      {showTechTree && <TechTreeOverlay onClose={handleCloseTechTree} focusId={techTreeFocusId} />}
      {phase === GamePhase.GAME_OVER && <GameOverOverlay />}
      {phase === GamePhase.VICTORY && <VictoryOverlay />}
      {showTurnPopup && <TurnAnnouncementPopup turn={turn} emberRose={emberRose} />}
    </>
  );
}
