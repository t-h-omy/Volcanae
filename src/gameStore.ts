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
import { tickLava } from './lavaSystem';
import type { GameState, UnitType, Position } from './types';

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
      });
    },

    attackUnit: (attackerId: string, targetId: string) => {
      set((state) => {
        resolveAttack(state, attackerId, targetId);
        // Update fog of war after player action
        updateFogOfWar(state);
      });
    },

    captureBuilding: (unitId: string, buildingId: string) => {
      set((state) => {
        initiateCaptureLogic(state, unitId, buildingId);
        // Update fog of war after player action
        updateFogOfWar(state);
      });
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    recruitUnit: (_buildingId: string, _unitType: UnitType) => {
      // Stub - logic to be implemented in later prompts
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    assignSpecialist: (_specialistId: string, _buildingId: string) => {
      // Stub - logic to be implemented in later prompts
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    unassignSpecialist: (_buildingId: string) => {
      // Stub - logic to be implemented in later prompts
    },

    endPlayerTurn: () => {
      set((state) => {
        // Resolve all pending captures at end of player turn
        resolveCaptures(state);
        // Note: Enemy turn will be implemented in later prompts
        // Tick lava system (lava phase happens between turns, before the next player turn starts)
        tickLava(state);
        // Update fog of war after turn resolution
        updateFogOfWar(state);
      });
    },

    setCameraY: (y: number) => {
      set((state) => {
        state.cameraY = y;
      });
    },
  }))
);
