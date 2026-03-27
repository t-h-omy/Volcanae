/**
 * HUD component for Volcanae.
 * Overlays the game grid with top bar (stats), bottom bar (actions/info),
 * and game-over/victory overlay screens.
 */

import { useCallback } from 'react';
import { useGameStore } from '../gameStore';
import { UNIT_COSTS } from '../gameConfig';
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
// SELECTED BUILDING PANEL
// ============================================================================

function SelectedBuildingPanel({ building }: { building: Building }) {
  const specialists = useGameStore((s) => s.specialists);
  const globalSpecialistStorage = useGameStore((s) => s.globalSpecialistStorage);
  const resources = useGameStore((s) => s.resources);
  const recruitUnit = useGameStore((s) => s.recruitUnit);

  const factionLabel =
    building.faction === Faction.PLAYER
      ? '🔵 Player'
      : building.faction === Faction.ENEMY
        ? '🔴 Enemy'
        : '⚪ Neutral';

  // Specialist slot info
  const assignedSpecialist: Specialist | null =
    building.specialistSlot ? specialists[building.specialistSlot] ?? null : null;

  // Recruitment info
  const recruitableType = BUILDING_RECRUITS[building.type] as string | undefined;
  const isPlayerOwned = building.faction === Faction.PLAYER;
  const isDisabled = building.isDisabledForTurns > 0;
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

  // Global specialist storage (shown on any player stronghold)
  const showGlobalStorage =
    building.type === BuildingType.STRONGHOLD && isPlayerOwned;
  const globalSpecialists: Specialist[] = globalSpecialistStorage
    .map((id) => specialists[id])
    .filter(Boolean) as Specialist[];

  return (
    <div className="hud-info-panel">
      <div className="hud-panel-header">
        <span className="hud-panel-emoji">{BUILDING_EMOJI[building.type] ?? '?'}</span>
        <span className="hud-panel-name">{BUILDING_NAME[building.type] ?? building.type}</span>
        <span className="hud-faction-label">{factionLabel}</span>
      </div>

      {/* Specialist slot */}
      <div className="hud-specialist-row">
        <span className="hud-label">Specialist:</span>
        {assignedSpecialist ? (
          <span className="hud-value">{assignedSpecialist.name}</span>
        ) : (
          <span className="hud-value hud-dim">Empty</span>
        )}
      </div>

      {/* Recruitment */}
      {recruitableType && isPlayerOwned && (
        <div className="hud-recruit-row">
          {hasQueue ? (
            <span className="hud-dim">
              Training {UNIT_EMOJI[building.recruitmentQueue!]} …
            </span>
          ) : (
            <button
              className="hud-recruit-btn"
              disabled={!canRecruit}
              onClick={handleRecruit}
            >
              Recruit {UNIT_EMOJI[recruitableType] ?? ''}{' '}
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

      {isDisabled && (
        <div className="hud-dim hud-disabled-note">
          Disabled for {building.isDisabledForTurns} turn(s)
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
                <li key={sp.id}>{sp.name}</li>
              ))}
            </ul>
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
