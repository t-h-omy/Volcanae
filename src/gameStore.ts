/**
 * Zustand game state store for Volcanae.
 * Manages the complete GameState with immer for immutable updates.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current, produce } from 'immer';
import { generateInitialGameState } from './mapGenerator';
import { resolveAttack } from './combatSystem';
import { moveUnit as moveUnitLogic } from './movementSystem';
import {
  initiateCapture as initiateCaptureLogic,
  resolveCaptures,
} from './captureSystem';
import { updateDiscovery } from './discoverySystem';
import { advanceLava, advanceLavaWithEvents, shouldLavaAdvance } from './lavaSystem';
import {
  collectResources,
  recruitUnit as recruitUnitLogic,
} from './resourceSystem';
import { runEnemyTurn } from './enemySystem';
import {
  assignSpecialist as assignSpecialistLogic,
  unassignSpecialist as unassignSpecialistLogic,
} from './specialistSystem';
import { checkGameConditions } from './gameConditions';
import { useFloaterStore } from './floaterStore';
import { useAnimationStore } from './animationStore';
import { Faction, GamePhase, BuildingType } from './types';
import type { GameState, UnitType, Position } from './types';
import type { GameEvent } from './gameEvents';
import { MAP, LAVA } from './gameConfig';

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
  /** End the player turn - triggers enemy turn, lava phase, then next player turn */
  endPlayerTurn: () => void;
  /** Apply a single game event from the animation queue */
  applyEvent: (event: GameEvent) => void;
  /** Replace the entire game state (used by animation engine to apply resolved state) */
  setGameState: (newState: GameState) => void;

  // ── Debug actions (development only) ──
  /** Debug: add spec_01 to globalSpecialistStorage */
  debugGiveSpecialist: () => void;
  /** Debug: manually trigger lava advance */
  debugAdvanceLava: () => void;
  /** Debug: add 10 iron and 10 wood */
  debugAddResources: () => void;
  /** Debug: reveal all tiles */
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
      const initialState = generateInitialGameState();
      set((state) => {
        Object.assign(state, initialState);
        // Update tile discovery based on initial unit positions
        updateDiscovery(state);
      });

      // Sync camera to the player's starting stronghold
      const stronghold = Object.values(initialState.buildings).find(
        (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER
      );
      if (stronghold) {
        useAnimationStore.getState().setCameraTarget(stronghold.position);
      }
    },

    selectUnit: (unitId: string) => {
      set((state) => {
        state.selectedUnitId = unitId;
        state.selectedBuildingId = null;
      });
    },

    selectBuilding: (buildingId: string) => {
      set((state) => {
        state.selectedBuildingId = buildingId;
        state.selectedUnitId = null;
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
        // Update tile discovery after player action
        updateDiscovery(state);
        // Check win/loss conditions after player action
        checkGameConditions(state);
      });
    },

    attackUnit: (attackerId: string, targetId: string) => {
      let pendingEvents: GameEvent[] | null = null;
      let pendingResolvedState: GameState | null = null;

      set((state) => {
        const attacker = state.units[attackerId];
        const defender = state.units[targetId];
        if (!attacker || !defender) return;

        const attackerPosition = { x: attacker.position.x, y: attacker.position.y };
        const defenderPosition = { x: defender.position.x, y: defender.position.y };
        const attackerHpBefore = attacker.stats.currentHp;
        const defenderHpBefore = defender.stats.currentHp;
        const defenderFaction = defender.faction;
        const attackerFaction = attacker.faction;

        // Take a plain snapshot of the current state so produce() can be called
        // without nesting immer producers (same pattern as endPlayerTurn).
        const snapshot: GameState = current(state);

        // Compute the resolved state (post-attack) on the snapshot
        const resolvedState = produce(snapshot, (draft) => {
          resolveAttack(draft, attackerId, targetId, true);
          updateDiscovery(draft);
          checkGameConditions(draft);
        });

        // Compute event fields from the resolved state
        const attackerAfter = resolvedState.units[attackerId];
        const defenderAfter = resolvedState.units[targetId];
        const advancedToPosition = (
          !defenderAfter &&
          attackerAfter &&
          (attackerAfter.position.x !== attackerPosition.x || attackerAfter.position.y !== attackerPosition.y)
        ) ? { x: attackerAfter.position.x, y: attackerAfter.position.y } : null;

        const attackEvent: GameEvent = {
          type: 'PLAYER_ATTACK',
          attackerId,
          defenderId: targetId,
          attackerPosition,
          defenderPosition,
          attackerHpLost: attackerAfter
            ? attackerHpBefore - attackerAfter.stats.currentHp
            : attackerHpBefore,
          defenderHpLost: defenderAfter
            ? defenderHpBefore - defenderAfter.stats.currentHp
            : defenderHpBefore,
          advancedToPosition,
        };

        const events: GameEvent[] = [attackEvent];

        // Add UNIT_DEATH events for killed units (consumed after the attack animation)
        if (!defenderAfter) {
          events.push({ type: 'UNIT_DEATH', unitId: targetId, position: defenderPosition, faction: defenderFaction });
        }
        if (!attackerAfter) {
          events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPosition, faction: attackerFaction });
        }

        pendingEvents = events;
        pendingResolvedState = resolvedState;

        // Lock UI while animation plays (same mechanism as enemy turn)
        state.phase = GamePhase.ENEMY_TURN;
      });

      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    captureBuilding: (unitId: string, buildingId: string) => {
      set((state) => {
        initiateCaptureLogic(state, unitId, buildingId);
        // Update tile discovery after player action
        updateDiscovery(state);
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
      // Capture enqueue data outside the immer set so that enqueue() is called
      // after the immer draft commits. Calling enqueue() inside the set callback
      // triggers the animation engine's subscribe handler synchronously; when all
      // events are on undiscovered tiles processQueue() runs to completion before
      // the callback returns, its setGameState(phase=PLAYER_TURN) is then
      // overwritten by the outer draft committing phase=ENEMY_TURN.
      let pendingEvents: GameEvent[] | null = null;
      let pendingResolvedState: GameState | null = null;

      set((state) => {
        // Phase 1: Resolve all pending captures (instant, no animation)
        resolveCaptures(state);

        // Get a plain (non-Proxy) snapshot of the current state so runEnemyTurn
        // can use produce() internally without nesting immer producers.
        const snapshot: GameState = current(state);

        // Phase 2: Compute enemy turn on snapshot
        const { finalState: afterEnemy, events: enemyEvents } = runEnemyTurn(snapshot);

        // Phase 3: Check game conditions after enemy turn
        let computedState = produce(afterEnemy, (draft) => {
          checkGameConditions(draft);
        });

        // If game ended during enemy turn, enqueue events with that final state
        if (computedState.phase === GamePhase.GAME_OVER || computedState.phase === GamePhase.VICTORY) {
          if (enemyEvents.length > 0) {
            pendingEvents = enemyEvents;
            pendingResolvedState = computedState;
            state.phase = GamePhase.ENEMY_TURN;
          } else {
            Object.assign(state, computedState);
          }
          return;
        }

        // Phase 4: Lava phase
        const allEvents: GameEvent[] = [...enemyEvents];
        computedState = produce(computedState, (draft) => {
          draft.turnsUntilLavaAdvance -= 1;
        });

        if (shouldLavaAdvance(computedState)) {
          const { newState: afterLava, event: lavaEvent } = advanceLavaWithEvents(computedState);
          allEvents.push(lavaEvent);
          computedState = produce(afterLava, (draft) => {
            draft.turnsUntilLavaAdvance = LAVA.LAVA_ADVANCE_INTERVAL;
          });
        }

        // Phase 5: Check game conditions after lava
        computedState = produce(computedState, (draft) => {
          checkGameConditions(draft);
        });

        if (computedState.phase === GamePhase.GAME_OVER || computedState.phase === GamePhase.VICTORY) {
          if (allEvents.length > 0) {
            pendingEvents = allEvents;
            pendingResolvedState = computedState;
            state.phase = GamePhase.ENEMY_TURN;
          } else {
            Object.assign(state, computedState);
          }
          return;
        }

        // Phase 6: New turn bookkeeping on computedState
        computedState = produce(computedState, (draft) => {
          // Collect resources
          collectResources(draft);

          // Recalculate tile discovery
          updateDiscovery(draft);

          // Reset all player units for new turn
          for (const unit of Object.values(draft.units)) {
            if (unit.faction === Faction.PLAYER) {
              unit.hasMovedThisTurn = false;
              unit.hasActedThisTurn = false;
              unit.hasCapturedThisTurn = false;
            }
          }

          // Decrement building disable timers, reset attack flags
          for (const building of Object.values(draft.buildings)) {
            if (building.isDisabledForTurns > 0) {
              building.isDisabledForTurns -= 1;
            }
            building.wasAttackedLastEnemyTurn = false;
          }

          // Check threat level
          if (draft.turn > 0 && draft.turn % 10 === 0) {
            draft.threatLevel += 1;
          }

          // Increment turn counter
          draft.turn += 1;

          // Set phase to player turn
          draft.phase = GamePhase.PLAYER_TURN;
        });

        // Phase 7: Stage events for animation (enqueued after this set commits)
        if (allEvents.length > 0) {
          pendingEvents = allEvents;
          pendingResolvedState = computedState;
          state.phase = GamePhase.ENEMY_TURN;
        } else {
          // No events to animate — apply final state directly
          Object.assign(state, computedState);
        }
      });

      // Enqueue outside the immer set so the draft has already committed before
      // the animation engine's subscribe handler fires.
      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    applyEvent: (event: GameEvent) => {
      set((state) => {
        switch (event.type) {
          case 'ENEMY_SPAWN': {
            // Add unit to state
            const unit = event.unit;
            state.units[unit.id] = { ...unit };
            const tile = state.grid[event.position.y][event.position.x];
            tile.unitId = unit.id;
            break;
          }

          case 'ENEMY_MOVE': {
            const unit = state.units[event.unitId];
            if (unit) {
              // Clear old tile
              const oldTile = state.grid[event.from.y][event.from.x];
              if (oldTile.unitId === event.unitId) {
                oldTile.unitId = null;
              }
              // Place on new tile
              const newTile = state.grid[event.to.y][event.to.x];
              newTile.unitId = event.unitId;
              unit.position.x = event.to.x;
              unit.position.y = event.to.y;
            }
            break;
          }

          case 'ENEMY_ATTACK': {
            // Apply damage to both units
            const attacker = state.units[event.attackerId];
            const defender = state.units[event.defenderId];

            if (defender && event.defenderHpLost > 0) {
              defender.stats.currentHp -= event.defenderHpLost;
            }
            if (attacker && event.attackerHpLost > 0) {
              attacker.stats.currentHp -= event.attackerHpLost;
            }

            // Trigger floaters for visual feedback
            const { addFloater } = useFloaterStore.getState();
            if (event.defenderHpLost > 0) {
              addFloater({
                value: event.defenderHpLost,
                x: event.defenderPosition.x,
                y: event.defenderPosition.y,
                isEnemy: false, // defender is being attacked by enemy, so player unit shows red
              });
            }
            if (event.attackerHpLost > 0) {
              addFloater({
                value: event.attackerHpLost,
                x: event.attackerPosition.x,
                y: event.attackerPosition.y,
                isEnemy: true, // attacker is enemy
              });
            }
            break;
          }

          case 'PLAYER_ATTACK': {
            // Apply damage to both units
            const attacker = state.units[event.attackerId];
            const defender = state.units[event.defenderId];

            if (defender && event.defenderHpLost > 0) {
              defender.stats.currentHp -= event.defenderHpLost;
            }
            if (attacker && event.attackerHpLost > 0) {
              attacker.stats.currentHp -= event.attackerHpLost;
            }

            // Trigger floaters for visual feedback (isEnemy derived from faction)
            const { addFloater } = useFloaterStore.getState();
            if (event.defenderHpLost > 0) {
              addFloater({
                value: event.defenderHpLost,
                x: event.defenderPosition.x,
                y: event.defenderPosition.y,
                isEnemy: defender?.faction === Faction.ENEMY,
              });
            }
            if (event.attackerHpLost > 0) {
              addFloater({
                value: event.attackerHpLost,
                x: event.attackerPosition.x,
                y: event.attackerPosition.y,
                isEnemy: attacker?.faction === Faction.ENEMY,
              });
            }
            break;
          }

          case 'UNIT_DEATH': {
            const unit = state.units[event.unitId];
            if (unit) {
              const tile = state.grid[unit.position.y][unit.position.x];
              if (tile.unitId === event.unitId) {
                tile.unitId = null;
              }
              delete state.units[event.unitId];
            }
            break;
          }

          case 'BUILDING_CAPTURE': {
            const building = state.buildings[event.buildingId];
            if (building) {
              building.faction = event.newFaction;
            }
            break;
          }

          case 'LAVA_ADVANCE': {
            advanceLava(state);
            break;
          }
        }
      });
    },

    setGameState: (newState: GameState) => {
      set((state) => {
        Object.assign(state, newState);
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
        updateDiscovery(state);
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
