/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useAnimationStore } from '../animationStore';
import { UNIT_COSTS, RESOURCES } from '../gameConfig';
import {
  Faction,
  GamePhase,
  UnitType,
  UnitTag,
  BuildingType,
  type Building,
  type Unit,
  type Specialist,
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
  [UnitType.LAVA_GRUNT]: '👹',
  [UnitType.LAVA_ARCHER]: '👺',
  [UnitType.LAVA_RIDER]: '👾',
  [UnitType.LAVA_SIEGE]: '🐦‍🔥',
};

const UNIT_NAME: Record<string, string> = {
  [UnitType.INFANTRY]: 'Infantry',
  [UnitType.ARCHER]: 'Archer',
  [UnitType.RIDER]: 'Rider',
  [UnitType.SIEGE]: 'Siege',
  [UnitType.LAVA_GRUNT]: 'Lava Grunt',
  [UnitType.LAVA_ARCHER]: 'Lava Archer',
  [UnitType.LAVA_RIDER]: 'Lava Rider',
  [UnitType.LAVA_SIEGE]: 'Lava Siege',
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
};

/** Maps recruitment buildings to their recruitable unit type */
const BUILDING_RECRUITS: Partial<Record<string, string>> = {
  [BuildingType.BARRACKS]: UnitType.INFANTRY,
  [BuildingType.ARCHER_CAMP]: UnitType.ARCHER,
  [BuildingType.RIDER_CAMP]: UnitType.RIDER,
  [BuildingType.SIEGE_CAMP]: UnitType.SIEGE,
};

// ============================================================================
// GAME MENU
// ============================================================================

function getDisplayVersion(full: string): string {
  const parts = full.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : full;
}

const displayVersion = getDisplayVersion(__APP_VERSION__);

function GameMenu() {
  const [open, setOpen] = useState(false);
  const initGame = useGameStore((s) => s.initGame);

  const handleRestartGame = useCallback(() => {
    initGame();
    setOpen(false);
  }, [initGame]);

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
            <button className="hud-menu-item" role="menuitem" onClick={handleRestartGame}>
              🔄 Restart Game
            </button>
            <button className="hud-menu-item" role="menuitem" onClick={handleResetCache}>
              🗑️ Reset Cache &amp; Reload
            </button>
            <div className="hud-menu-version">v{displayVersion}</div>
          </div>
        </>
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

  return (
    <div className="hud-top-bar">
      <span className="hud-stat">🔄 Turn {turn}</span>
      {isAnimating && <span className="hud-stat hud-enemy-turn-label">⚔️ Enemy Turn...</span>}
      <span className="hud-stat">⛓️ {resources.iron}</span>
      <span className="hud-stat">🪵 {resources.wood}</span>
      <span className="hud-stat">⚠️ Threat {threatLevel}</span>
      <span className="hud-stat">🌋 Lava in {turnsUntilLavaAdvance}</span>
      <GameMenu />
    </div>
  );
}

/** Tags that are internal implementation details and should not be shown to the player */
const HIDDEN_UNIT_TAGS = new Set<string>([UnitTag.NO_CAPTURE]);

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
  const canAttack = !unit.hasActedThisTurn;
  const canCapture =
    !unit.hasCapturedThisTurn &&
    !unit.hasActedThisTurn &&
    !unit.tags.includes(UnitTag.NO_CAPTURE);

  const visibleTags = unit.tags.filter((t) => !HIDDEN_UNIT_TAGS.has(t));

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
                : tag === UnitTag.LAVA_BOOST
                  ? '🔥 Lava-Boosted'
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
            <button
              className="hud-capture-btn"
              disabled={!canCapture}
              onClick={onCapture}
            >
              🏳️ Capture {BUILDING_NAME[captureTarget.type] ?? captureTarget.type}
            </button>
          )}
        </>
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
// SELECTED BUILDING PANEL
// ============================================================================

function SelectedBuildingPanel({ building }: { building: Building }) {
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const resources = useGameStore((s) => s.resources);
  const recruitUnit = useGameStore((s) => s.recruitUnit);
  const unassignSpecialist = useGameStore((s) => s.unassignSpecialist);

  const [showPicker, setShowPicker] = useState(false);

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

  // Specialist slot info
  const assignedSpecialist: Specialist | null =
    building.specialistSlot ? specialists[building.specialistSlot] ?? null : null;

  // Recruitment info
  const recruitableType = BUILDING_RECRUITS[building.type] as string | undefined;
  const hasQueue = building.recruitmentQueue !== null;
  const cost = recruitableType ? UNIT_COSTS[recruitableType] : null;
  const canAfford = cost
    ? resources.iron >= cost.iron && resources.wood >= cost.wood
    : false;
  const canRecruit =
    isPlayerOwned && recruitableType && !isDisabled && !hasQueue && canAfford;

  const handleRecruit = useCallback(() => {
    if (canRecruit && recruitableType) {
      recruitUnit(building.id, recruitableType as UnitType);
    }
  }, [canRecruit, recruitableType, recruitUnit, building.id]);

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

  return (
    <div className="hud-info-panel hud-building-panel">
      {/* Header */}
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{BUILDING_EMOJI[building.type] ?? '?'}</span>
        <span className="hud-panel-name">{BUILDING_NAME[building.type] ?? building.type}</span>
        <span className="hud-faction-label">{factionLabel}</span>
      </div>

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
      {recruitableType && isPlayerOwned && (
        <div className="hud-recruit-row">
          <span className="hud-label">Recruit:</span>
          {hasQueue ? (
            <span className="hud-dim">
              🔨 Training {UNIT_EMOJI[building.recruitmentQueue!] ?? '?'}{' '}
              {UNIT_NAME[building.recruitmentQueue!] ?? ''} …
            </span>
          ) : (
            <button
              className="hud-recruit-btn"
              disabled={!canRecruit}
              onClick={handleRecruit}
            >
              {UNIT_EMOJI[recruitableType] ?? ''}{' '}
              {UNIT_NAME[recruitableType] ?? recruitableType}
              {cost && (
                <span className="hud-cost">
                  {' '}(⛓️{cost.iron} 🪵{cost.wood})
                </span>
              )}
            </button>
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
  const initGame = useGameStore((s) => s.initGame);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-defeat">💀 DEFEATED</h1>
        <p className="hud-overlay-sub">You survived {turn} turns</p>
        <button className="hud-play-again-btn" onClick={initGame}>
          🔄 Play Again
        </button>
      </div>
    </div>
  );
}

function VictoryOverlay() {
  const turn = useGameStore((s) => s.turn);
  const initGame = useGameStore((s) => s.initGame);

  return (
    <div className="hud-overlay">
      <div className="hud-overlay-box">
        <h1 className="hud-overlay-title hud-victory">🏆 VICTORY</h1>
        <p className="hud-overlay-sub">Completed in {turn} turns</p>
        <button className="hud-play-again-btn" onClick={initGame}>
          🔄 Play Again
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// DEBUG PANEL (development only)
// ============================================================================

function DebugPanel() {
  const debugGiveSpecialist = useGameStore((s) => s.debugGiveSpecialist);
  const debugAdvanceLava = useGameStore((s) => s.debugAdvanceLava);
  const debugAddResources = useGameStore((s) => s.debugAddResources);
  const debugRevealAll = useGameStore((s) => s.debugRevealAll);

  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="hud-debug-panel">
      <button
        className="hud-debug-toggle"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? '🐛' : '🐛 Debug'}
      </button>
      {!collapsed && (
        <div className="hud-debug-btns">
          <button onClick={debugGiveSpecialist}>🧙 Give Specialist</button>
          <button onClick={debugAdvanceLava}>🌋 Advance Lava</button>
          <button onClick={debugAddResources}>💰 +10 Resources</button>
          <button onClick={debugRevealAll}>👁️ Reveal All</button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN HUD COMPONENT
// ============================================================================

const isDev = import.meta.env.DEV;

export default function HUD() {
  const phase = useGameStore((s) => s.phase);

  return (
    <>
      <TopBar />
      <BottomBar />
      {isDev && <DebugPanel />}
      {phase === GamePhase.GAME_OVER && <GameOverOverlay />}
      {phase === GamePhase.VICTORY && <VictoryOverlay />}
    </>
  );
}
