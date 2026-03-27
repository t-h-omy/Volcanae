/**
 * Zustand game state store for Volcanae.
 * Manages the complete GameState with immer for immutable updates.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateInitialGameState } from './mapGenerator';
import { resolveAttack } from './combatSystem';
import { moveUnit as moveUnitLogic } from './movementSystem';
import {
  initiateCapture as initiateCaptureLogic,
  resolveCaptures,
} from './captureSystem';
import { updateFogOfWar } from './fogOfWarSystem';
import { tickLava, advanceLava } from './lavaSystem';
import {
  collectResources,
  recruitUnit as recruitUnitLogic,
  spawnQueuedUnits,
} from './resourceSystem';
import { runEnemyTurn } from './enemySystem';
import {
  assignSpecialist as assignSpecialistLogic,
  unassignSpecialist as unassignSpecialistLogic,
} from './specialistSystem';
import { checkGameConditions } from './gameConditions';
import { Faction, GamePhase } from './types';
import type { GameState, UnitType, Position } from './types';
import { MAP } from './gameConfig';

// ============================================================================
// STORE ACTIONS INTERFACE
// ============================================================================

interface GameActions {
  /** Initialize a new game by generating initial state */
  initGame: () => void;
  /** Select a unit by ID */
  selectUnit: (unitId: string) => void;
  /** Select a building by ID */
  selectBuilding: (buildingId: string) => void;
  /** Clear both unit and building selection */
  clearSelection: () => void;
  /** Move a unit to a target position (stub) */
  moveUnit: (unitId: string, targetPosition: Position) => void;
  /** Attack a target unit (stub) */
  attackUnit: (attackerId: string, targetId: string) => void;
  /** Capture a building with a unit (stub) */
  captureBuilding: (unitId: string, buildingId: string) => void;
  /** Recruit a unit from a building (stub) */
  recruitUnit: (buildingId: string, unitType: UnitType) => void;
  /** Assign a specialist to a building (stub) */
  assignSpecialist: (specialistId: string, buildingId: string) => void;
  /** Unassign a specialist from a building (stub) */
  unassignSpecialist: (buildingId: string) => void;
  /** End the player turn - triggers enemy turn, lava phase, then next player turn (stub) */
  endPlayerTurn: () => void;
  /** Set the camera Y position */
  setCameraY: (y: number) => void;

  // ── Debug actions (development only) ──
  /** Debug: add spec_01 to globalSpecialistStorage */
  debugGiveSpecialist: () => void;
  /** Debug: manually trigger lava advance */
  debugAdvanceLava: () => void;
  /** Debug: add 10 iron and 10 wood */
  debugAddResources: () => void;
  /** Debug: reveal all tiles and clear fog */
  debugRevealAll: () => void;
}

// ============================================================================
// STORE TYPE
// ============================================================================

type GameStore = GameState & GameActions;

// ============================================================================
// INITIAL STATE
// ============================================================================

const createInitialState = (): GameState => generateInitialGameState();

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useGameStore = create<GameStore>()(
  immer((set) => ({
    // Initial state - will be overwritten by initGame()
    ...createInitialState(),

    // ========================================================================
    // ACTIONS
    // ========================================================================

    initGame: () => {
      set((state) => {
        const newState = generateInitialGameState();
        Object.assign(state, newState);
        // Update fog of war based on initial unit/building positions
        updateFogOfWar(state);
      });
    },

    selectUnit: (unitId: string) => {
      set((state) => {
        state.selectedUnitId = unitId;
      });
    },

    selectBuilding: (buildingId: string) => {
      set((state) => {
        state.selectedBuildingId = buildingId;
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selectedUnitId = null;
        state.selectedBuildingId = null;
      });
    },

    moveUnit: (unitId: string, targetPosition: Position) => {
      set((state) => {
        moveUnitLogic(state, unitId, targetPosition);
        // Update fog of war after player action
        updateFogOfWar(state);
        // Check win/loss conditions after player action
        checkGameConditions(state);
      });
    },

    attackUnit: (attackerId: string, targetId: string) => {
      set((state) => {
        resolveAttack(state, attackerId, targetId);
        // Update fog of war after player action
        updateFogOfWar(state);
        // Check win/loss conditions after player action
        checkGameConditions(state);
      });
    },

    captureBuilding: (unitId: string, buildingId: string) => {
      set((state) => {
        initiateCaptureLogic(state, unitId, buildingId);
        // Update fog of war after player action
        updateFogOfWar(state);
        // Check win/loss conditions after player action
        checkGameConditions(state);
      });
    },

    recruitUnit: (buildingId: string, unitType: UnitType) => {
      set((state) => {
        recruitUnitLogic(state, buildingId, unitType);
      });
    },

    assignSpecialist: (specialistId: string, buildingId: string) => {
      set((state) => {
        assignSpecialistLogic(state, specialistId, buildingId);
      });
    },

    unassignSpecialist: (buildingId: string) => {
      set((state) => {
        unassignSpecialistLogic(state, buildingId);
      });
    },

    endPlayerTurn: () => {
      set((state) => {
        // Step 2: Resolve all pending captures at end of player turn
        resolveCaptures(state);

        // Step 3: Run enemy turn (spawning and AI)
        runEnemyTurn(state);

        // Step 4: Mark wasAttackedLastEnemyTurn on buildings attacked during enemy turn
        // Currently enemy AI only attacks units, not buildings directly.
        // This infrastructure supports future building attack mechanics.

        // Step 5: Check win/loss conditions after enemy turn
        if (checkGameConditions(state)) {
          return;
        }

        // Step 6: Lava phase (only if game is not over)
        // 6a: Advance lava if due, destroy affected tiles/units/buildings
        const lavaAdvanced = tickLava(state);

        // 6b: If lava advanced, update cameraY for camera auto-pan
        if (lavaAdvanced) {
          state.cameraY = Math.max(0, state.lavaFrontRow);
        }

        // 6c: Check game conditions again (lava may have destroyed last stronghold)
        if (checkGameConditions(state)) {
          return;
        }

        // Step 7: New turn setup (only if game is still not over)
        // 7a: Collect resources from player-owned resource buildings
        collectResources(state);

        // 7b: Spawn queued units from recruitment buildings
        spawnQueuedUnits(state);

        // 7c: Recalculate visibility
        updateFogOfWar(state);

        // 7d: Reset all player units for new turn
        for (const unit of Object.values(state.units)) {
          if (unit.faction === Faction.PLAYER) {
            unit.hasMovedThisTurn = false;
            unit.hasActedThisTurn = false;
            unit.hasCapturedThisTurn = false;
          }
        }

        // 7e: Decrement isDisabledForTurns on all buildings (minimum 0)
        // 7f: Reset wasAttackedLastEnemyTurn to false on all buildings
        for (const building of Object.values(state.buildings)) {
          if (building.isDisabledForTurns > 0) {
            building.isDisabledForTurns -= 1;
          }
          building.wasAttackedLastEnemyTurn = false;
        }

        // 7g: Check threat level: increment by 1 if turn is a multiple of 10
        if (state.turn > 0 && state.turn % 10 === 0) {
          state.threatLevel += 1;
        }

        // 7h: Increment turn counter
        state.turn += 1;

        // 7i: Set phase to player turn
        state.phase = GamePhase.PLAYER_TURN;
      });
    },

    setCameraY: (y: number) => {
      set((state) => {
        state.cameraY = y;
      });
    },

    // ========================================================================
    // DEBUG ACTIONS (development only)
    // ========================================================================

    debugGiveSpecialist: () => {
      set((state) => {
        const specId = 'spec_01';
        if (
          state.specialists[specId] &&
          !state.globalSpecialistStorage.includes(specId) &&
          state.specialists[specId].assignedBuildingId === null
        ) {
          state.globalSpecialistStorage.push(specId);
        }
      });
    },

    debugAdvanceLava: () => {
      set((state) => {
        advanceLava(state);
        state.cameraY = Math.max(0, state.lavaFrontRow);
        updateFogOfWar(state);
        checkGameConditions(state);
      });
    },

    debugAddResources: () => {
      set((state) => {
        state.resources.iron += 10;
        state.resources.wood += 10;
      });
    },

    debugRevealAll: () => {
      set((state) => {
        for (let y = 0; y < MAP.GRID_HEIGHT; y++) {
          for (let x = 0; x < MAP.GRID_WIDTH; x++) {
            state.grid[y][x].isRevealed = true;
          }
        }
      });
    },
  }))
);
