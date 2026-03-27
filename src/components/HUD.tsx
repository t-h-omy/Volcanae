/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback, useState } from 'react';
import { useGameStore } from '../gameStore';
import { UNIT_COSTS, RESOURCES } from '../gameConfig';
import {
  Faction,
  GamePhase,
  UnitType,
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
  [BuildingType.MINE]: '⛏️',
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
// TOP BAR
// ============================================================================

function TopBar() {
  const turn = useGameStore((s) => s.turn);
  const resources = useGameStore((s) => s.resources);
  const threatLevel = useGameStore((s) => s.threatLevel);
  const turnsUntilLavaAdvance = useGameStore((s) => s.turnsUntilLavaAdvance);

  return (
    <div className="hud-top-bar">
      <span className="hud-stat">🔄 Turn {turn}</span>
      <span className="hud-stat">⛏️ {resources.iron}</span>
      <span className="hud-stat">🪵 {resources.wood}</span>
      <span className="hud-stat">⚠️ Threat {threatLevel}</span>
      <span className="hud-stat">🌋 Lava in {turnsUntilLavaAdvance}</span>
    </div>
  );
}

// ============================================================================
// SELECTED UNIT PANEL
// ============================================================================

function SelectedUnitPanel({ unit }: { unit: Unit }) {
  const hpPct = (unit.stats.currentHp / unit.stats.maxHp) * 100;
  const canMove = !unit.hasMovedThisTurn;
  const canAttack = !unit.hasActedThisTurn;
  const canCapture = !unit.hasCapturedThisTurn && !unit.hasActedThisTurn;

  return (
    <div className="hud-info-panel">
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{UNIT_EMOJI[unit.type] ?? '?'}</span>
        <span className="hud-panel-name">{UNIT_NAME[unit.type] ?? unit.type}</span>
      </div>
      <div className="hud-hp-row">
        <div className="hud-hp-bar">
          <div className="hud-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <span className="hud-hp-text">
          {unit.stats.currentHp}/{unit.stats.maxHp}
        </span>
      </div>
      <div className="hud-action-tags">
        <span className={`hud-action-tag ${canMove ? '' : 'hud-action-used'}`}>Move</span>
        <span className={`hud-action-tag ${canAttack ? '' : 'hud-action-used'}`}>Attack</span>
        <span className={`hud-action-tag ${canCapture ? '' : 'hud-action-used'}`}>Capture</span>
      </div>
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
          ⛏️ +{RESOURCES.MINE_IRON_PER_TURN} iron per turn
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
                  {' '}(⛏️{cost.iron} 🪵{cost.wood})
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

  const selectedUnit: Unit | undefined = selectedUnitId
    ? units[selectedUnitId]
    : undefined;
  const selectedBuilding: Building | undefined = selectedBuildingId
    ? buildings[selectedBuildingId]
    : undefined;

  const isPlayerTurn = phase === GamePhase.PLAYER_TURN;

  return (
    <div className="hud-bottom-bar">
      {/* Info panels */}
      {selectedUnit && <SelectedUnitPanel unit={selectedUnit} />}
      {selectedBuilding && !selectedUnit && (
        <SelectedBuildingPanel building={selectedBuilding} />
      )}

      {/* End Turn button */}
      {isPlayerTurn && (
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
// MAIN HUD COMPONENT
// ============================================================================

export default function HUD() {
  const phase = useGameStore((s) => s.phase);

  return (
    <>
      <TopBar />
      <BottomBar />
      {phase === GamePhase.GAME_OVER && <GameOverOverlay />}
      {phase === GamePhase.VICTORY && <VictoryOverlay />}
    </>
  );
}
