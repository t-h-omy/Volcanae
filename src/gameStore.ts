/**
 * Zustand game state store for Volcanae.
 * Manages the complete GameState with immer for immutable updates.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current, produce } from 'immer';
import { generateInitialGameState, generateId } from './mapGenerator';
import { resolveAttack, resolveBuildingAttack, resolveAttackOnBuilding, resolveBuildingAttackOnBuilding, handleBrandmarkedUnitDeath, shouldLeaveGravestone, createGravestoneAt, findEmberDemonSpawnPos, spawnEnemyEmberDemon } from './combatSystem';
import { moveUnit as moveUnitLogic } from './movementSystem';
import {
  initiateCapture as initiateCaptureLogic,
  resolveCaptures,
} from './captureSystem';
import { updateDiscovery } from './discoverySystem';
import { advanceLava, advanceLavaWithEvents, shouldLavaAdvance } from './lavaSystem';
import { processTileStatusEndOfTurn, isUnitOnCorruptedTile, applyTileStatus, clearTileStatus } from './tileStatusSystem';
import {
  collectResources,
  recruitUnit as recruitUnitLogic,
  growHousePopulations,
} from './resourceSystem';
import {
  constructBuilding as constructBuildingLogic,
  convertBuilding as convertBuildingLogic,
  placeMineOnTile,
} from './constructionSystem';
import { runEnemyTurn } from './enemySystem';
import {
  deductSpecialistUpkeep,
  applySpecialistEffects,
  applyEffectsForSpecialist,
  revokeEffectsForSpecialist,
} from './specialistSystem';
import { checkGameConditions } from './gameConditions';
import { useFloaterStore } from './floaterStore';
import { useAnimationStore } from './animationStore';
import { useCombatAnimationStore } from './combatAnimationStore';
import { useCaveScreamsStore } from './caveScreamsStore';
import { triggerSpellSfx } from './soundOptionsStore';
import { Faction, GamePhase, BuildingType, TileType, TileStatus, Difficulty, DestroyBehavior, UnitType, UnitTag, TechFlag } from './types';
import type { GameState, Position, TechId, SpellId } from './types';
import type { GameEvent } from './gameEvents';
import { MAP, TERRAIN, POPULATION, BUILDING_DEFINITIONS, ENEMY, XP, ABILITIES, CRYSTAL_CHAMBER_CONFIG, SANCTUM_COLLAPSE, getLavaAdvanceInterval, UNIT_DEFINITIONS, MAGE, TUNNEL_EMERGE_DAMAGE } from './gameConfig';
import { RENDER } from './renderConfig';
import { ANIMATION } from './animationConfig';
import { saveGameState, loadGameState, clearSavedGame, hasSavedGame } from './saveSystem';
import { computeLevelFromXp, applyLevelUps } from './levelSystem';
import { unlockTech as unlockTechLogic, getAvailableTechs as getAvailableTechsLogic, getGrantedTags, getRemovedTags, getStatMods } from './techSystem';
import { canUnitHeal, getHealTargets, canUnitFieldwork } from './unitActions';
import { createFieldworkOutpost } from './constructionSystem';
import { getTagsFromActiveSpecialists } from './specialistSystem';
import { castSpell as castSpellLogic } from './spellSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { useShockwaveStore } from './shockwaveStore';
import { processPendingPortalTeleports } from './portalSystem';

// ============================================================================
// STORE ACTIONS INTERFACE
// ============================================================================

interface GameActions {
  /** Initialize a new game by generating initial state */
  initGame: () => void;
  /** Start a fresh new game with the given difficulty, clearing any existing save */
  initNewGame: (difficulty: Difficulty) => void;
  /** Select a unit by ID */
  selectUnit: (unitId: string) => void;
  /** Select a building by ID */
  selectBuilding: (buildingId: string) => void;
  /** Select a terrain tile by position (shown when no building/unit on tile) */
  selectTile: (pos: Position) => void;
  /** Clear both unit and building selection */
  clearSelection: () => void;
  /** Move a unit to a target position (stub) */
  moveUnit: (unitId: string, targetPosition: Position) => void;
  /** Attack a target unit (stub) */
  attackUnit: (attackerId: string, targetId: string) => void;
  /** Attack a target building with a unit */
  attackBuilding: (attackerId: string, buildingId: string) => void;
  /** Attack a target unit with a building (e.g. watchtower) */
  buildingAttackUnit: (buildingId: string, targetId: string) => void;
  /** Attack a target building with a player building (e.g. watchtower vs enemy watchtower) */
  buildingAttackBuilding: (attackingBuildingId: string, targetBuildingId: string) => void;
  /** Capture a building with a unit (stub) */
  captureBuilding: (unitId: string, buildingId: string) => void;
  /** Recruit a unit from a building (stub) */
  recruitUnit: (buildingId: string, unitType: UnitType) => void;
  /** Construct a building on a tile using a unit */
  constructBuilding: (unitId: string, tilePos: Position, buildingType: BuildingType) => void;
  /** Convert a player-owned Ruin building to a different Ruin-buildable building */
  convertBuilding: (unitId: string, newBuildingType: BuildingType) => void;
  /** Heal an adjacent friendly unit using a PATCHUP unit */
  healUnit: (healerId: string, targetId: string) => void;
  /** Enter heal-target-selection mode */
  startHealMode: (healerId: string) => void;
  /** Cancel heal-target-selection mode */
  cancelHealMode: () => void;
  /** Enter spell-cast target-selection mode */
  startSpellCast: (mageId: string, spellId: SpellId) => void;
  /** Cancel spell-cast target-selection mode */
  cancelSpellCast: () => void;
  /** Apply a spell cast at the given target position */
  castSpell: (targetPosition: Position) => void;
  /** Sacrifice a FIELDWORK unit to build a Watchtower at its position */
  fieldworkUnit: (unitId: string) => void;
  /** Add a specialist to globalSpecialistStorage (called after cave monster hire) */
  hireSpecialist: (specialistId: string) => void;
  /** Replace an existing specialist with a new one (called after cave monster swap) */
  swapSpecialist: (outgoingId: string, incomingId: string) => void;
  /** End the player turn - triggers enemy turn, lava phase, then next player turn */
  endPlayerTurn: () => void;
  /** Apply a single game event from the animation queue */
  applyEvent: (event: GameEvent) => void;
  /** Apply a melee advance after the die animation (deferred from attack event) */
  applyMeleeAdvance: (attackerId: string, toPosition: Position) => void;
  /** Activate a single Crystal Chamber by setting its resonanceTurnsRemaining (used by animation engine) */
  activateCrystalChamber: (chamberId: string) => void;
  /** Replace the entire game state (used by animation engine to apply resolved state) */
  setGameState: (newState: GameState) => void;
  /** Manually save the current game state to localStorage */
  saveGame: () => void;
  /** Load the saved game state from localStorage (no-op if none exists) */
  loadGame: () => void;
  /** Delete the saved game from localStorage */
  clearSavedGame: () => void;
  /** Return true when a save is present in localStorage */
  hasSavedGame: () => boolean;

  // ── Debug actions (development only) ──
  /** Debug: add spec_01 to globalSpecialistStorage */
  debugGiveSpecialist: () => void;
  /** Debug: manually trigger lava advance */
  debugAdvanceLava: () => void;
  /** Debug: add 10 iron and 10 wood */
  debugAddResources: () => void;
  /** Debug: reveal all tiles */
  debugRevealAll: () => void;
  /** Debug: add a test FARM building with full population in zone 1 */
  debugAddFarmers: () => void;
  /** Debug: set a nearby tile to isRuin = true */
  debugAddRuin: () => void;
  /** Debug: add 5 arcane crystals */
  debugAddCrystals: () => void;
  /** Debug: apply a tile status to the currently selected tile */
  debugApplyTileStatus: (status: string) => void;
  /** Debug: clear tile status from the currently selected tile */
  debugClearTileStatus: () => void;
  /** Level up a player unit if they have enough XP */
  levelUpUnit: (unitId: string) => void;
  /** Unlock a tech node and spend one pending pick */
  unlockTech: (techId: TechId) => void;
  /** Return the list of tech IDs available for the player to pick */
  getAvailableTechs: () => TechId[];
  /** Seal a cave mountain tile and construct a Mine on it */
  sealAndBuildMine: (tilePos: Position) => void;
  /** Explore a cave mountain tile: spawns a cave monster near it */
  exploreCave: (tilePos: Position) => void;
  /** Permanently dismiss a cave tile without spawning a monster, building a mine, or exhausting the unit */
  ignoreCave: (tilePos: Position) => void;
  /** Revive a fallen infantry unit from a Gravestone building (costs 1 arcane crystal) */
  reviveUnit: (buildingId: string) => void;
  /** Permanently dismiss a recruited specialist, removing them from globalSpecialistStorage */
  dismissSpecialist: (specialistId: string) => void;
  /** Finalize pending Brandmark transforms: remove queued units and spawn hostile Ember Demons */
  finalizeBrandmarkTransforms: () => void;
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
// HELPERS
// ============================================================================

/** Sync the camera to the player's starting STRONGHOLD in the given state. */
function syncCameraToPlayerStronghold(state: GameState): void {
  const stronghold = Object.values(state.buildings).find(
    (b) => b.type === BuildingType.STRONGHOLD && b.faction === Faction.PLAYER
  );
  if (stronghold) {
    useAnimationStore.getState().setCameraTarget(stronghold.position);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function assertNever(x: never): never {
  throw new Error(`Unhandled event type: ${(x as { type: string }).type}`);
}

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
      // Attempt to restore a previously autosaved game; fall back to a fresh game.
      const saved = loadGameState();
      const stateToLoad = saved ?? generateInitialGameState();

      set((state) => {
        Object.assign(state, stateToLoad);
        if (!saved) {
          // Update tile discovery only for a fresh game (saved games already have it)
          updateDiscovery(state);
        }
        // Re-apply specialist effects so that any assigned, non-dormant specialists
        // have their effects active on existing units (handles saves where effects
        // were missing or stale before the migration re-synced them).
        applySpecialistEffects(state);
      });

      syncCameraToPlayerStronghold(stateToLoad);
    },

    initNewGame: (difficulty: Difficulty) => {
      clearSavedGame();
      const initialState = generateInitialGameState(difficulty);
      set((state) => {
        Object.assign(state, initialState);
        updateDiscovery(state);
      });

      syncCameraToPlayerStronghold(initialState);
    },

    selectUnit: (unitId: string) => {
      set((state) => {
        state.selectedUnitId = unitId;
        state.selectedBuildingId = null;
        state.selectedTilePos = null;
        state.pendingHealerId = null;
      });
      // After selection, check if this player unit is standing on an unresolved
      // cave mountain tile — if so, open the screams popup (unless they arrived
      // this turn or an encounter for this tile is already active).
      // Only open the popup when the unit has the BUILDANDCAPTURE tag and can
      // actually execute at least one cave action; otherwise leave the cave
      // unresolved so a valid unit can act on it later.
      const s = useGameStore.getState();
      const unit = s.units[unitId];
      if (unit && unit.faction === Faction.PLAYER && unit.tags.includes(UnitTag.BUILDANDCAPTURE)) {
        const tile = s.grid[unit.position.y]?.[unit.position.x];
        if (tile?.hasCaveMonster) {
          const tileKey = `${unit.position.x},${unit.position.y}`;
          const alreadyActive = s.activeCaveEncounters.some((e) => e.mountainTileId === tileKey);
          const arrivedThisTurn = unit.lastMovedTurn === s.turn;
          if (!alreadyActive && !arrivedThisTurn) {
            useCaveScreamsStore.getState().open({ x: unit.position.x, y: unit.position.y });
          }
        }
      }
    },

    selectBuilding: (buildingId: string) => {
      set((state) => {
        state.selectedBuildingId = buildingId;
        state.selectedUnitId = null;
        state.selectedTilePos = null;
        state.pendingHealerId = null;
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selectedUnitId = null;
        state.selectedBuildingId = null;
        state.selectedTilePos = null;
        state.pendingHealerId = null;
      });
    },

    selectTile: (pos: Position) => {
      set((state) => {
        state.selectedTilePos = pos;
        state.selectedUnitId = null;
        state.selectedBuildingId = null;
        state.pendingHealerId = null;
      });
    },

    moveUnit: (unitId: string, targetPosition: Position) => {
      // Capture unit info before the mutation in case the unit is slide-killed
      let slideKillGhostData: {
        unitType: UnitType;
        faction: Faction;
        deathTileX: number;
        deathTileY: number;
        slideDx: number;
        slideDy: number;
      } | null = null;

      set((state) => {
        // Snapshot the unit before moveUnitLogic so we can detect a slide-kill
        const unitBefore = state.units[unitId];
        const posBeforeX = unitBefore?.position.x ?? 0;
        const posBeforeY = unitBefore?.position.y ?? 0;
        const unitTypeBefore = unitBefore?.type;
        const factionBefore = unitBefore?.faction;

        moveUnitLogic(state, unitId, targetPosition);
        // Player movement may have freed a portal exit tile; resolve waiting teleports.
        processPendingPortalTeleports(state);
        // Update tile discovery after player action
        updateDiscovery(state);

        // ── Ice-slide animation ──────────────────────────────────────────────
        // If the unit ended up at a different tile than the player clicked, a
        // slide was triggered. Animate the unit sliding from the frozen tile
        // (where the player tapped) to its actual final position.
        const unitAfterMove = state.units[unitId];
        if (
          unitAfterMove &&
          (unitAfterMove.position.x !== targetPosition.x ||
            unitAfterMove.position.y !== targetPosition.y)
        ) {
          // Pixel offset: from slide destination → frozen tile (unit appears here first)
          const tileSize =
            typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
              ? RENDER.TILE_SIZE_MOBILE
              : RENDER.TILE_SIZE_DESKTOP;
          const slideDx = (targetPosition.x - unitAfterMove.position.x) * tileSize;
          const slideDy = (targetPosition.y - unitAfterMove.position.y) * tileSize;
          const { setUnitAnimation } = useCombatAnimationStore.getState();
          setUnitAnimation(unitId, { type: 'SLIDE', dx: slideDx, dy: slideDy });
          const totalMs = ANIMATION.SLIDE_PAUSE_MS + ANIMATION.SLIDE_DURATION_MS + 60;
          setTimeout(() => {
            useCombatAnimationStore.getState().setUnitAnimation(unitId, null);
          }, totalMs);
        }

        // ── Slide-kill detection ─────────────────────────────────────────────
        // If the unit existed before the move but is now gone, it was killed
        // while sliding off a FROZEN tile into a lethal tile.
        if (!unitAfterMove && unitTypeBefore !== undefined && factionBefore !== undefined) {
          // The slide direction is always ±1 regardless of how far the unit moved.
          // Use Math.sign() so a 2-tile move doesn't produce a 2-tile slide visual.
          const slideDirX = Math.sign(targetPosition.x - posBeforeX);
          const slideDirY = Math.sign(targetPosition.y - posBeforeY);
          // The death tile = frozen tile (targetPosition) + slide direction
          const deathTileX = targetPosition.x + slideDirX;
          const deathTileY = targetPosition.y + slideDirY;
          const tileSize =
            typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
              ? RENDER.TILE_SIZE_MOBILE
              : RENDER.TILE_SIZE_DESKTOP;
          // Pixel offset: from death tile back to frozen tile (same semantics as SLIDE)
          slideKillGhostData = {
            unitType: unitTypeBefore,
            faction: factionBefore,
            deathTileX,
            deathTileY,
            slideDx: -slideDirX * tileSize,
            slideDy: -slideDirY * tileSize,
          };
        }
        // ── End ice-slide animation ──────────────────────────────────────────

        // NOTE: Leash-loss defection is now checked only at the end of the player
        // turn (in endPlayerTurn) rather than immediately after each move.  This
        // gives the player the whole turn to reposition before the demon defects.

        // Check win/loss conditions after player action
        checkGameConditions(state);
      });

      // ── Slide-kill ghost animation ───────────────────────────────────────
      // Fire AFTER the immer set() completes so the game state is already updated.
      // The unit was deleted synchronously; a ghost overlay handles the visuals.
      if (slideKillGhostData !== null) {
        // Cast away the incorrect `never` narrowing TypeScript applies after a
        // `let` variable is mutated inside an immer set() callback.
        const d = slideKillGhostData as {
          unitType: UnitType; faction: Faction;
          deathTileX: number; deathTileY: number;
          slideDx: number; slideDy: number;
        };
        const ghostId = `slide-kill-${unitId}-${Date.now()}`;
        const ghost = {
          id: ghostId,
          unitType: d.unitType,
          faction: d.faction,
          deathTileX: d.deathTileX,
          deathTileY: d.deathTileY,
          slideDx: d.slideDx,
          slideDy: d.slideDy,
          phase: 'slide' as const,
        };
        const store = useCombatAnimationStore.getState();
        store.addSlideKillGhost(ghost);

        // Phase 1 — slide in
        const slideTotalMs = ANIMATION.SLIDE_PAUSE_MS + ANIMATION.SLIDE_DURATION_MS;
        setTimeout(() => {
          useCombatAnimationStore.getState().setSlideKillGhostPhase(ghostId, 'dying');

          // Phase 2 — skull flash (same timing as normal combat DYING)
          const dyingTotalMs = ANIMATION.DIE_FLASH_DURATION_MS + ANIMATION.DIE_FADE_DURATION_MS;
          setTimeout(() => {
            useCombatAnimationStore.getState().setSlideKillGhostPhase(ghostId, 'falling');

            // Phase 3 — shrink and disappear
            setTimeout(() => {
              useCombatAnimationStore.getState().removeSlideKillGhost(ghostId);
            }, ANIMATION.SLIDE_KILL_FALL_DURATION_MS);
          }, dyingTotalMs);
        }, slideTotalMs);
      }
      // ── End slide-kill ghost animation ───────────────────────────────────
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

        // Collect IDs of any cave monsters killed by SPLASH (not the primary target).
        // Populated inside the produce callback and used to push CAVE_MONSTER_KILLED events.
        const splashKilledCaveMonsterIds: string[] = [];

        // Collect secondary events (SPLASH/CLEAVE/PIERCE damage and kills) emitted by resolveAttack
        const secondaryEvents: GameEvent[] = [];

        // Compute the resolved state (post-attack) on the snapshot
        const resolvedState = produce(snapshot, (draft) => {
          resolveAttack(draft, attackerId, targetId, true, secondaryEvents);
          // If the primary target is a cave monster that was killed, remove its encounter entry
          if (
            snapshot.units[targetId]?.type === UnitType.CAVE_MONSTER &&
            !draft.units[targetId]
          ) {
            draft.activeCaveEncounters = draft.activeCaveEncounters.filter(
              (e) => e.monsterId !== targetId,
            );
          }
          // Any other CAVE_MONSTER unit that died during this attack (e.g. SPLASH AoE) also
          // needs its encounter entry removed and a CAVE_MONSTER_KILLED reward event.
          for (const unitId of Object.keys(snapshot.units)) {
            if (unitId === targetId) continue; // primary target handled above
            if (
              snapshot.units[unitId].type === UnitType.CAVE_MONSTER &&
              !draft.units[unitId]
            ) {
              splashKilledCaveMonsterIds.push(unitId);
              draft.activeCaveEncounters = draft.activeCaveEncounters.filter(
                (e) => e.monsterId !== unitId,
              );
            }
          }
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
        // Attacker earns XP for killing the defender; defender earns XP for a counter-kill.
        const attackerXpGained = !defenderAfter && attackerAfter ? XP.KILL_UNIT : null;
        const defenderXpGained = !attackerAfter ? XP.KILL_UNIT : null;

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
          attackerXpGained,
          defenderXpGained,
        };

        const events: GameEvent[] = [attackEvent];

        // Add UNIT_DEATH events for killed units (consumed after the attack animation)
        if (!defenderAfter) {
          events.push({ type: 'UNIT_DEATH', unitId: targetId, position: defenderPosition, faction: defenderFaction });
          // If the killed unit was a cave monster, push the specialist-draw event
          if (snapshot.units[targetId]?.type === UnitType.CAVE_MONSTER) {
            events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: targetId });
          }
        }
        if (!attackerAfter) {
          events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPosition, faction: attackerFaction });
        }
        // Push secondary damage/death events (SPLASH/CLEAVE/PIERCE)
        events.push(...secondaryEvents);
        // Push CAVE_MONSTER_KILLED events for any cave monsters killed by SPLASH AoE
        for (const monsterId of splashKilledCaveMonsterIds) {
          events.push({ type: 'CAVE_MONSTER_KILLED', monsterId });
        }

        pendingEvents = events;
        pendingResolvedState = resolvedState;

        // Lock UI while animation plays (same mechanism as enemy turn)
        state.phase = GamePhase.ENEMY_TURN;
        // Clear selection so movement range / action indicators don't show
        // during the combat animation.
        state.selectedUnitId = null;
        state.selectedBuildingId = null;
      });

      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    attackBuilding: (attackerId: string, buildingId: string) => {
      let pendingEvents: GameEvent[] | null = null;
      let pendingResolvedState: GameState | null = null;

      set((state) => {
        const attacker = state.units[attackerId];
        const building = state.buildings[buildingId];
        if (!attacker || !building) return;

        const attackerPosition = { x: attacker.position.x, y: attacker.position.y };
        const buildingPosition = { x: building.position.x, y: building.position.y };
        const attackerHpBefore = attacker.stats.currentHp;
        const buildingHpBefore = building.hp;
        const attackerFaction = attacker.faction;

        const snapshot: GameState = current(state);

        // Collect secondary events (SPLASH/CLEAVE/PIERCE damage and kills) emitted by resolveAttackOnBuilding
        const secondaryEvents: GameEvent[] = [];

        const resolvedState = produce(snapshot, (draft) => {
          resolveAttackOnBuilding(draft, attackerId, buildingId, true, secondaryEvents);
          updateDiscovery(draft);
          checkGameConditions(draft);
        });

        const attackerAfter = resolvedState.units[attackerId];
        const buildingAfter = resolvedState.buildings[buildingId];
        const buildingFactionBefore = building.faction;
        // Building was killed if destroyed or went neutral (e.g. watchtower).
        const buildingDied = !buildingAfter || buildingAfter.faction !== buildingFactionBefore;
        // Player attacker earns XP for destroying an enemy building.
        const attackerXpGained = buildingDied && attackerAfter ? XP.DESTROY_BUILDING : null;

        const attackBuildingEvent: GameEvent = {
          type: 'UNIT_ATTACK_BUILDING',
          attackerId,
          buildingId,
          attackerPosition,
          buildingPosition,
          attackerHpLost: attackerAfter
            ? attackerHpBefore - attackerAfter.stats.currentHp
            : attackerHpBefore,
          buildingHpLost: buildingAfter
            ? buildingHpBefore - buildingAfter.hp
            : buildingHpBefore,
          attackerXpGained,
        };

        const events: GameEvent[] = [attackBuildingEvent];

        if (!attackerAfter) {
          events.push({ type: 'UNIT_DEATH', unitId: attackerId, position: attackerPosition, faction: attackerFaction });
        }
        // Push secondary damage/death events (SPLASH/CLEAVE/PIERCE)
        events.push(...secondaryEvents);

        pendingEvents = events;
        pendingResolvedState = resolvedState;

        state.phase = GamePhase.ENEMY_TURN;
      });

      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    buildingAttackUnit: (buildingId: string, targetId: string) => {
      let pendingEvents: GameEvent[] | null = null;
      let pendingResolvedState: GameState | null = null;

      set((state) => {
        const building = state.buildings[buildingId];
        const defender = state.units[targetId];
        if (!building || !building.combatStats || !building.faction || !defender) return;

        const buildingPosition = { x: building.position.x, y: building.position.y };
        const defenderPosition = { x: defender.position.x, y: defender.position.y };
        const buildingHpBefore = building.hp;
        const defenderHpBefore = defender.stats.currentHp;
        const defenderFaction = defender.faction;

        // Take a plain snapshot of the current state
        const snapshot: GameState = current(state);

        // Compute the resolved state
        const resolvedState = produce(snapshot, (draft) => {
          resolveBuildingAttack(draft, buildingId, targetId, true);
          updateDiscovery(draft);
          checkGameConditions(draft);
        });

        const buildingAfter = resolvedState.buildings[buildingId];
        const defenderAfter = resolvedState.units[targetId];
        const buildingFactionBefore = building.faction;
        // Building was killed if destroyed or went neutral.
        const buildingDied = !buildingAfter || buildingAfter.faction !== buildingFactionBefore;
        // Enemy defender earns XP for counter-killing the player building.
        const defenderXpGained = buildingDied && defenderAfter && defenderFaction === Faction.ENEMY
          ? XP.DESTROY_BUILDING
          : null;

        const buildingAttackEvent: GameEvent = {
          type: 'BUILDING_ATTACK',
          buildingId,
          defenderId: targetId,
          buildingPosition,
          defenderPosition,
          buildingHpLost: buildingAfter
            ? buildingHpBefore - buildingAfter.hp
            : buildingHpBefore,
          defenderHpLost: defenderAfter
            ? defenderHpBefore - defenderAfter.stats.currentHp
            : defenderHpBefore,
          defenderXpGained,
        };

        const events: GameEvent[] = [buildingAttackEvent];

        // Add UNIT_DEATH event if defender dies
        if (!defenderAfter) {
          events.push({ type: 'UNIT_DEATH', unitId: targetId, position: defenderPosition, faction: defenderFaction });
        }

        pendingEvents = events;
        pendingResolvedState = resolvedState;

        // Lock UI while animation plays
        state.phase = GamePhase.ENEMY_TURN;
      });

      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    buildingAttackBuilding: (attackingBuildingId: string, targetBuildingId: string) => {
      let pendingEvents: GameEvent[] | null = null;
      let pendingResolvedState: GameState | null = null;

      set((state) => {
        const attackingBuilding = state.buildings[attackingBuildingId];
        const targetBuilding = state.buildings[targetBuildingId];
        if (!attackingBuilding || !attackingBuilding.combatStats || !attackingBuilding.faction) return;
        if (!targetBuilding) return;

        const attackingBuildingPosition = { x: attackingBuilding.position.x, y: attackingBuilding.position.y };
        const targetBuildingPosition = { x: targetBuilding.position.x, y: targetBuilding.position.y };
        const attackingHpBefore = attackingBuilding.hp;
        const targetHpBefore = targetBuilding.hp;

        const snapshot: GameState = current(state);

        const resolvedState = produce(snapshot, (draft) => {
          resolveBuildingAttackOnBuilding(draft, attackingBuildingId, targetBuildingId, true);
          updateDiscovery(draft);
          checkGameConditions(draft);
        });

        const attackingAfter = resolvedState.buildings[attackingBuildingId];
        const targetAfter = resolvedState.buildings[targetBuildingId];

        const buildingAttackBuildingEvent: GameEvent = {
          type: 'BUILDING_ATTACK_BUILDING',
          attackingBuildingId,
          targetBuildingId,
          attackingBuildingPosition,
          targetBuildingPosition,
          attackingBuildingHpLost: attackingAfter
            ? attackingHpBefore - attackingAfter.hp
            : attackingHpBefore,
          targetBuildingHpLost: targetAfter
            ? targetHpBefore - targetAfter.hp
            : targetHpBefore,
        };

        pendingEvents = [buildingAttackBuildingEvent];
        pendingResolvedState = resolvedState;

        // Lock UI while animation plays
        state.phase = GamePhase.ENEMY_TURN;
      });

      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    captureBuilding: (unitId: string, buildingId: string) => {
      let pendingEvents: GameEvent[] | null = null;
      let pendingResolvedState: GameState | null = null;

      set((state) => {
        const unit = state.units[unitId];
        const building = state.buildings[buildingId];
        if (!unit || !building) return;

        // Sanctum captures trigger zone-clearing VFX and need the animation queue.
        const isSanctumCapture =
          building.type === BuildingType.INFERNALSANCTUM &&
          unit.faction === Faction.PLAYER;

        if (isSanctumCapture) {
          // Use snapshot → produce pattern so the animation engine can replay events
          const snapshot: GameState = current(state);
          const collapseEvents: GameEvent[] = [];

          const resolvedState = produce(snapshot, (draft) => {
            initiateCaptureLogic(draft, unitId, buildingId, undefined, collapseEvents);
            updateDiscovery(draft);
            checkGameConditions(draft);
          });

          pendingEvents = collapseEvents;
          pendingResolvedState = resolvedState;

          // Lock UI while animation plays
          state.phase = GamePhase.ENEMY_TURN;
          state.selectedUnitId = null;
          state.selectedBuildingId = null;
        } else {
          // Non-sanctum captures: apply directly (no animation needed)
          initiateCaptureLogic(state, unitId, buildingId);
          updateDiscovery(state);
          checkGameConditions(state);
        }
      });

      if (pendingEvents !== null && pendingResolvedState !== null) {
        useAnimationStore.getState().enqueue(pendingEvents, pendingResolvedState);
      }
    },

    recruitUnit: (buildingId: string, unitType: UnitType) => {
      set((state) => {
        recruitUnitLogic(state, buildingId, unitType);
      });
    },

    constructBuilding: (unitId: string, tilePos: Position, buildingType: BuildingType) => {
      set((state) => {
        constructBuildingLogic(state, unitId, tilePos, buildingType);
        updateDiscovery(state);
        checkGameConditions(state);
      });
    },

    convertBuilding: (unitId: string, newBuildingType: BuildingType) => {
      set((state) => {
        convertBuildingLogic(state, unitId, newBuildingType);
        updateDiscovery(state);
        checkGameConditions(state);
      });
    },

    sealAndBuildMine: (tilePos: Position) => {
      set((state) => {
        const tile = state.grid[tilePos.y]?.[tilePos.x];
        if (!tile) return;

        // Sealing & building a mine is a construction action — exhaust the
        // BUILDANDCAPTURE unit on the tile so it cannot act again this turn.
        const unitOnTile = tile.unitId ? state.units[tile.unitId] : null;
        if (!unitOnTile || unitOnTile.faction !== Faction.PLAYER) return;
        if (!unitOnTile.tags.includes(UnitTag.BUILDANDCAPTURE)) return;
        unitOnTile.hasMovedThisTurn = true;
        unitOnTile.hasAttackedThisTurn = true;
        unitOnTile.hasConstructedThisTurn = true;
        unitOnTile.hasDestroyedThisTurn = true;
        unitOnTile.hasCapturedThisTurn = true;

        // Also clear the activeCaveEncounters entry for this tile if one exists
        const mountainTileId = `${tilePos.x},${tilePos.y}`;
        const encounterIdx = state.activeCaveEncounters.findIndex(
          (e) => e.mountainTileId === mountainTileId,
        );
        if (encounterIdx !== -1) {
          state.activeCaveEncounters.splice(encounterIdx, 1);
        }

        placeMineOnTile(state, tilePos);
        tile.hasCaveMonster = false;
        updateDiscovery(state);
        checkGameConditions(state);
      });
      useCaveScreamsStore.getState().close();
    },

    exploreCave: (tilePos: Position) => {
      useCaveScreamsStore.getState().close();

      // Capture the spawn position from the immer callback via a closure variable.
      // This avoids mutating state with temp fields.
      let vfxPos: { x: number; y: number } | null = null;

      set((state) => {
        const tile = state.grid[tilePos.y]?.[tilePos.x];
        if (!tile) return;

        // Mark cave as resolved regardless of whether spawn succeeds
        tile.hasCaveMonster = false;

        // Exhaust the BUILDANDCAPTURE unit standing on this tile — exploration
        // consumes its entire turn (no further movement, attacks, or construction).
        const unitOnTile = tile.unitId ? state.units[tile.unitId] : null;
        if (!unitOnTile || unitOnTile.faction !== Faction.PLAYER) return;
        if (!unitOnTile.tags.includes(UnitTag.BUILDANDCAPTURE)) return;
        unitOnTile.hasMovedThisTurn = true;
        unitOnTile.hasAttackedThisTurn = true;
        unitOnTile.hasConstructedThisTurn = true;
        unitOnTile.hasDestroyedThisTurn = true;
        unitOnTile.hasCapturedThisTurn = true;

        // ── Compute zone for stat scaling ────────────────────────────────
        const zoneIndex = Math.min(
          Math.max(0, Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - tilePos.y) / MAP.ZONE_HEIGHT)),
          MAP.ZONE_COUNT - 1,
        );
        const scale = TERRAIN.CAVE_MONSTER_ZONE_SCALE[zoneIndex] ?? 1.0;

        const base = UNIT_DEFINITIONS[UnitType.CAVE_MONSTER];
        const maxHp = Math.round(base.maxHp * scale);
        const attack = Math.round(base.attack * scale);
        const defense = Math.round(base.defense * scale);

        // ── BFS to find a free spawn tile outward from the mountain ─────
        const visited = new Set<string>();
        visited.add(`${tilePos.x},${tilePos.y}`);
        const queue: Array<{ x: number; y: number }> = [];

        // Seed with all 8 neighbors
        for (const [dx, dy] of [
          [0,-1],[0,1],[-1,0],[1,0],
          [-1,-1],[-1,1],[1,-1],[1,1],
        ] as const) {
          const nx = tilePos.x + dx;
          const ny = tilePos.y + dy;
          if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
          const key = `${nx},${ny}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: nx, y: ny });
          }
        }

        /**
         * Returns true when a tile is suitable for the monster to spawn on.
         * Mirrors the impassability rules used for enemy movement.
         */
        const isFree = (x: number, y: number): boolean => {
          const t = state.grid[y]?.[x];
          if (!t) return false;
          if (t.terrainType === TileType.CANYON || t.terrainType === TileType.WATER) return false;
          if (t.isLava) return false;
          if (t.unitId !== null) return false;
          if (t.buildingId !== null) {
            const b = state.buildings[t.buildingId];
            // Tiles with combat buildings are impassable (skip neutral watchtowers too
            // — we don't want the monster to accidentally destroy them by occupying)
            if (b && b.combatStats !== null) return false;
          }
          return true;
        };

        let spawnPos: { x: number; y: number } | null = null;
        let head = 0;

        while (head < queue.length) {
          const { x, y } = queue[head++];
          if (isFree(x, y)) {
            spawnPos = { x, y };
            break;
          }
          // Expand BFS frontier — push unvisited neighbours of this tile
          for (const [dx, dy] of [
            [0,-1],[0,1],[-1,0],[1,0],
            [-1,-1],[-1,1],[1,-1],[1,1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
            const key = `${nx},${ny}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({ x: nx, y: ny });
            }
          }
        }

        if (!spawnPos) return; // No reachable free tile — abort

        // ── Create the cave monster unit ─────────────────────────────────
        const newUnit = {
          id: generateId('unit'),
          type: UnitType.CAVE_MONSTER,
          faction: Faction.ENEMY,
          position: { x: spawnPos.x, y: spawnPos.y },
          stats: {
            maxHp,
            currentHp: maxHp,
            attack,
            defense,
            moveRange: base.moveRange,
            discoverRadius: base.discoverRadius,
            triggerRange: base.triggerRange,
            movementActions: base.movementActions,
            attackRange: base.attackRange,
          },
          tags: [...base.tags],
          // All action flags true — monster does not move or attack on spawn turn
          hasMovedThisTurn: true,
          hasAttackedThisTurn: true,
          hasConstructedThisTurn: true,
          hasDestroyedThisTurn: true,
          hasCapturedThisTurn: true,
          hasUsedPostAttackMoveThisTurn: false,
          bloodlustAttackAvailable: false,
          xp: 0,
          level: 1,
          pinnedUntilTurn: 0,
          distractionDefPenalty: 0,
          lastMovedTurn: 0,
        };

        state.units[newUnit.id] = newUnit;
        state.grid[spawnPos.y][spawnPos.x].unitId = newUnit.id;

        // Register the active cave encounter
        const mountainTileId = `${tilePos.x},${tilePos.y}`;
        state.activeCaveEncounters.push({ monsterId: newUnit.id, mountainTileId });

        updateDiscovery(state);

        // Capture spawn position for VFX trigger outside the immer callback
        vfxPos = { x: spawnPos.x, y: spawnPos.y };
      });

      // Trigger a brief tile-flash on the spawn tile to make the appearance legible
      if (vfxPos) {
        const pos = vfxPos as { x: number; y: number };
        useCombatAnimationStore.getState().addTileFlash(pos.x, pos.y, 600);
      }
    },

    ignoreCave: (tilePos: Position) => {
      set((state) => {
        const tile = state.grid[tilePos.y]?.[tilePos.x];
        if (!tile) return;

        // Permanently dismiss this cave: clear the monster marker and any
        // active encounter entry. The mountain becomes a normal mountain.
        // The unit is NOT exhausted — it can still move and act this turn.
        tile.hasCaveMonster = false;

        const mountainTileId = `${tilePos.x},${tilePos.y}`;
        const encounterIdx = state.activeCaveEncounters.findIndex(
          (e) => e.mountainTileId === mountainTileId,
        );
        if (encounterIdx !== -1) {
          state.activeCaveEncounters.splice(encounterIdx, 1);
        }
      });
      useCaveScreamsStore.getState().close();
    },

    reviveUnit: (buildingId: string) => {
      set((state) => {
        const building = state.buildings[buildingId];
        if (!building || building.type !== BuildingType.GRAVESTONE) return;
        if (building.faction !== Faction.PLAYER) return;
        if (!building.gravesUnitType) return;
        // Must have at least 1 arcane crystal
        if (state.arcaneCrystals < ABILITIES.REVIVE_CRYSTAL_COST) return;
        // Revive is only available when the Deathmender specialist (or another
        // source) grants the REVIVABLE tag to this unit type. LEAVES_GRAVESTONE
        // from the tech tree allows gravestones to spawn but NOT to be revived.
        const specialistTags = getTagsFromActiveSpecialists(state, building.gravesUnitType);
        if (!specialistTags.includes(UnitTag.REVIVABLE)) return;
        // Cannot revive if a unit is standing on the tile
        const tile = state.grid[building.position.y][building.position.x];
        if (tile.unitId !== null) return;

        const unitType: UnitType = building.gravesUnitType;

        // Collect tags from tech and active specialists
        const baseTags = [...(UNIT_DEFINITIONS[unitType]?.tags ?? [])];
        for (const tag of getGrantedTags(state, unitType)) {
          if (!baseTags.includes(tag)) baseTags.push(tag);
        }
        for (const tag of getTagsFromActiveSpecialists(state, unitType)) {
          if (!baseTags.includes(tag)) baseTags.push(tag);
        }
        const removedTags = getRemovedTags(state, unitType);
        const spawnTags = baseTags.filter((t) => !removedTags.includes(t));
        // Revived units must not leave a second gravestone on death.
        if (!spawnTags.includes(UnitTag.NO_GRAVESTONE)) {
          spawnTags.push(UnitTag.NO_GRAVESTONE);
        }

        const unitId = generateId('unit');
        state.units[unitId] = {
          id: unitId,
          type: unitType,
          faction: Faction.PLAYER,
          position: { x: building.position.x, y: building.position.y },
          stats: {
            maxHp: UNIT_DEFINITIONS[unitType].maxHp,
            currentHp: UNIT_DEFINITIONS[unitType].maxHp,
            attack: UNIT_DEFINITIONS[unitType].attack,
            defense: UNIT_DEFINITIONS[unitType].defense,
            moveRange: UNIT_DEFINITIONS[unitType].moveRange,
            discoverRadius: UNIT_DEFINITIONS[unitType].discoverRadius,
            triggerRange: UNIT_DEFINITIONS[unitType].triggerRange,
            movementActions: UNIT_DEFINITIONS[unitType].movementActions,
            attackRange: UNIT_DEFINITIONS[unitType].attackRange,
          },
          tags: spawnTags,
          hasMovedThisTurn: true,
          hasAttackedThisTurn: true,
          hasCapturedThisTurn: true,
          hasConstructedThisTurn: true,
          hasDestroyedThisTurn: true,
          hasUsedPostAttackMoveThisTurn: false,
          bloodlustAttackAvailable: false,
          xp: 0,
          level: 1,
          lastMovedTurn: 0,
          pinnedUntilTurn: 0,
          distractionDefPenalty: 0,
        };

        // Apply stat mods from unlocked tech nodes (same as recruitUnit)
        const revivedUnit = state.units[unitId];
        for (const mod of getStatMods(state, unitType)) {
          if (mod.mode === 'add') {
            (revivedUnit.stats[mod.stat] as number) += mod.value;
          } else {
            (revivedUnit.stats[mod.stat] as number) = Math.round(
              (revivedUnit.stats[mod.stat] as number) * (1 + mod.value / 100),
            );
          }
        }
        revivedUnit.stats.currentHp = revivedUnit.stats.maxHp;

        // Place the unit on the tile and remove the gravestone
        tile.unitId = unitId;
        tile.buildingId = null;
        delete state.buildings[buildingId];

        // Deduct the crystal cost
        state.arcaneCrystals -= ABILITIES.REVIVE_CRYSTAL_COST;

        // Deselect the building
        if (state.selectedBuildingId === buildingId) {
          state.selectedBuildingId = null;
        }

        // Trigger purple revive VFX
        const { addFloater } = useFloaterStore.getState();
        addFloater({
          value: 0,
          label: '✨ Revived!',
          x: building.position.x,
          y: building.position.y,
          isEnemy: false,
          floaterType: 'revive',
        });

        updateDiscovery(state);
      });
    },

    dismissSpecialist: (specialistId: string) => {
      set((state) => {
        const idx = state.globalSpecialistStorage.indexOf(specialistId);
        if (idx === -1) return; // Not in storage — safe no-op
        const specialist = state.specialists[specialistId];
        if (!specialist) return;
        // Remove from storage first so revoke sees it as no longer active
        state.globalSpecialistStorage.splice(idx, 1);
        // Revoke all effects
        revokeEffectsForSpecialist(state, specialist);
        // Clear dormant flag so it doesn't carry stale state if somehow reused
        specialist.dormant = false;
      });
    },

    finalizeBrandmarkTransforms: () => {
      set((state) => {
        const pending = state.pendingBrandmarkTransforms;
        if (pending.length === 0) return;
        for (const { unitId, position } of pending) {
          const original = state.units[unitId];
          if (!original) continue;
          // Remove the original unit from its tile and from the units map
          const tile = state.grid[position.y]?.[position.x];
          if (tile && tile.unitId === unitId) tile.unitId = null;
          delete state.units[unitId];
          state.gameStats.unitsLost += 1;

          // Show "Risen" floater for the player-turn tick brandmark death path
          useFloaterStore.getState().addFloater({
            value: 0,
            label: '😈 Risen',
            x: position.x,
            y: position.y,
            isEnemy: true,
            floaterType: 'damage',
          });

          // Spawn a hostile Ember Demon at the tile if free, or an adjacent tile
          const spawnPos = findEmberDemonSpawnPos(state, position);
          if (spawnPos) spawnEnemyEmberDemon(state, spawnPos);
        }
        state.pendingBrandmarkTransforms = [];
      });
    },

    healUnit: (healerId: string, targetId: string) => {
      set((state) => {
        const healer = state.units[healerId];
        if (!healer || !canUnitHeal(healer)) return;
        // CORRUPTED tile: PATCHUP heal is suppressed.
        if (isUnitOnCorruptedTile(state, healerId)) return;
        const targets = getHealTargets(state, healerId);
        if (!targets.includes(targetId)) return;
        const target = state.units[targetId];
        if (!target) return;
        target.stats.currentHp = Math.min(
          target.stats.currentHp + ABILITIES.PATCHUP_HEAL_AMOUNT,
          target.stats.maxHp,
        );
        healer.hasAttackedThisTurn = true;
        state.pendingHealerId = null;
      });
    },

    startHealMode: (healerId: string) => {
      set((state) => {
        state.pendingHealerId = healerId;
      });
    },

    cancelHealMode: () => {
      set((state) => {
        state.pendingHealerId = null;
      });
    },

    startSpellCast: (mageId: string, spellId: SpellId) => {
      set((state) => {
        state.pendingHealerId = null; // mutually exclusive with heal mode
        state.pendingSpellCast = { mageId, spellId };
      });
    },

    cancelSpellCast: () => {
      set((state) => {
        state.pendingSpellCast = null;
        state.pendingTransposeFirstUnitId = null;
      });
    },

    castSpell: (targetPosition: Position) => {
      let castSpellId: import('./types').SpellId | null = null;
      let magePosition: Position | null = null;
      set((state) => {
        if (!state.pendingSpellCast) return;
        const { mageId, spellId } = state.pendingSpellCast;
        const ok = castSpellLogic(state, mageId, spellId, targetPosition);
        if (!ok) return;
        castSpellId = spellId;
        const mageAfter = state.units[mageId];
        if (mageAfter) {
          magePosition = { x: mageAfter.position.x, y: mageAfter.position.y };
          // Casting is symmetric with attacking: set hasCastThisTurn only.
          // - canUnitMove and canUnitAttack are updated to treat
          //   hasCastThisTurn the same way they already treat
          //   hasAttackedThisTurn — so a mage cannot move OR attack after
          //   casting.
          // - The reverse direction (move-then-cast) is blocked by the PREP
          //   tag inside canUnitCast. A non-PREP mage would be free to move
          //   and then cast, which is the correct behavior if PREP is ever
          //   stripped via a future tech.
          // Do NOT set hasMovedThisTurn or hasAttackedThisTurn here — that
          // would over-constrain the rules and break the symmetry.
          mageAfter.hasCastThisTurn = true;
        }
        state.pendingSpellCast = null;
        state.pendingTransposeFirstUnitId = null;
        updateDiscovery(state);
        checkGameConditions(state);
      });
      // Fire SFX triggers outside the immer mutation (side-effect).
      // triggerSpellSfx is a no-op until real audio assets are wired.
      if (castSpellId !== null) {
        if (castSpellId === 'EMBERBIND' || castSpellId === 'RAISE_SKELETON') {
          triggerSpellSfx('summon');
        } else if (castSpellId === 'FROSTCRAFT') {
          triggerSpellSfx('freeze');
        } else {
          triggerSpellSfx('spell_cast');
        }
        // EXPLODE: add shockwave ring to match emberling explosion VFX
        if (castSpellId === 'EXPLODE') {
          const tileSize = typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
            ? RENDER.TILE_SIZE_MOBILE
            : RENDER.TILE_SIZE_DESKTOP;
          const explosionFinalScale = Math.round((1.5 * tileSize) / 3);
          useShockwaveStore.getState().addShockwave({
            id: crypto.randomUUID(),
            cx: targetPosition.x * tileSize + tileSize / 2,
            cy: targetPosition.y * tileSize + tileSize / 2,
            durationMs: ANIMATION.EXPLOSION_SHOCKWAVE_MS,
            finalScale: explosionFinalScale,
          });
        }
        // SPELL_CAST line from mage to target tile + SPELL_IMPACT ring on target.
        // Mirrors the EXPLODE shockwave pattern above: tile-size lookup, then dispatch.
        // magePosition is captured from inside the immer callback — cast to silence
        // TypeScript's closure-assignment narrowing.
        const capturedMagePosition = magePosition as Position | null;
        if (capturedMagePosition !== null) {
          const tileSize = typeof window !== 'undefined' && window.innerWidth <= RENDER.MOBILE_BREAKPOINT
            ? RENDER.TILE_SIZE_MOBILE
            : RENDER.TILE_SIZE_DESKTOP;
          const fromPx = {
            x: capturedMagePosition.x * tileSize + tileSize / 2,
            y: capturedMagePosition.y * tileSize + tileSize / 2,
          };
          const toPx = {
            x: targetPosition.x * tileSize + tileSize / 2,
            y: targetPosition.y * tileSize + tileSize / 2,
          };
          const store = useCombatAnimationStore.getState();
          store.addLineVfx({
            id: crypto.randomUUID(),
            fromPx,
            toPx,
            variant: 'SPELL_CAST',
            durationMs: ANIMATION.SPELL_CAST_MS,
          });
          store.addTileVfx({
            id: crypto.randomUUID(),
            x: targetPosition.x,
            y: targetPosition.y,
            variant: 'SPELL_IMPACT',
            durationMs: ANIMATION.SPELL_IMPACT_MS,
          });
        }
      }
    },

    fieldworkUnit: (unitId: string) => {
      set((state) => {
        const unit = state.units[unitId];
        if (!unit || !canUnitFieldwork(unit)) return;
        const { x, y } = unit.position;
        const tile = state.grid[y][x];
        // Cannot build on a tile that already has a building
        if (tile.buildingId !== null) return;
        // Cannot build on ruins
        if (tile.isRuin || tile.isStrongholdRuin) return;
        // Cannot build on resource terrain (forest or mountain)
        if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) return;
        // Create an Outpost at the unit's position with HP based on the unit's current HP
        const newBuilding = createFieldworkOutpost({ x, y }, unit.stats.currentHp);
        // Apply FORTIFIED_GARRISON bonus to the newly created Outpost if the
        // specialist is currently active
        if (state.fortifiedGarrisonActive && newBuilding.combatStats) {
          newBuilding.combatStats.attack += ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS;
          newBuilding.combatStats.attackRange += ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS;
        }
        state.buildings[newBuilding.id] = newBuilding;
        tile.buildingId = newBuilding.id;
        // Delete the unit
        tile.unitId = null;
        delete state.units[unitId];
        if (state.selectedUnitId === unitId) {
          state.selectedUnitId = null;
        }
        updateDiscovery(state);
        checkGameConditions(state);
        state.gameStats.buildingsConstructed += 1;
      });
    },

    hireSpecialist: (specialistId: string) => {
      set((state) => {
        if (state.specialists[specialistId] && !state.globalSpecialistStorage.includes(specialistId)) {
          state.globalSpecialistStorage.push(specialistId);
          // Apply the specialist's effects immediately on hire
          applyEffectsForSpecialist(state, state.specialists[specialistId]);
        }
      });
    },

    swapSpecialist: (outgoingId: string, incomingId: string) => {
      set((state) => {
        const idx = state.globalSpecialistStorage.indexOf(outgoingId);
        if (idx !== -1 && state.specialists[incomingId] && !state.globalSpecialistStorage.includes(incomingId)) {
          // Revoke effects of the outgoing specialist before removing it
          const outgoing = state.specialists[outgoingId];
          if (outgoing) {
            // Temporarily remove from storage so revoke checks see it as no longer active
            state.globalSpecialistStorage.splice(idx, 1);
            revokeEffectsForSpecialist(state, outgoing);
            // Insert incoming at the same index so HUD slot position is stable
            state.globalSpecialistStorage.splice(idx, 0, incomingId);
            // Apply effects of the incoming specialist immediately
            applyEffectsForSpecialist(state, state.specialists[incomingId]);
          }
        }
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
        // Auto-deselect when the player ends their turn — no unit, building,
        // or tile remains highlighted across the enemy turn boundary.
        state.selectedUnitId = null;
        state.selectedBuildingId = null;
        state.selectedTilePos = null;
        // Cancel any pending action modes.
        state.pendingHealerId = null;
        state.pendingSpellCast = null;
        state.pendingTransposeFirstUnitId = null;

        // Phase 1: Resolve all pending captures (instant, no animation)
        resolveCaptures(state);

        // Get a plain (non-Proxy) snapshot of the current state so runEnemyTurn
        // can use produce() internally without nesting immer producers.
        const snapshot: GameState = current(state);

        // Phase 2: Compute enemy turn on snapshot
        const { finalState: afterEnemy, events: enemyEvents } = runEnemyTurn(snapshot);

        // Phase 3: Check game conditions after enemy turn
        let computedState = produce(afterEnemy, (draft) => {
          checkGameConditions(draft, 'ENEMY');
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

        // Phase 3.5: Tile status end-of-turn processing (before lava tick)
        const tileStatusEvents: GameEvent[] = [];
        computedState = produce(computedState, (draft) => {
          processTileStatusEndOfTurn(draft, tileStatusEvents);
        });

        // Phase 4: Lava phase
        const allEvents: GameEvent[] = [...enemyEvents, ...tileStatusEvents];
        computedState = produce(computedState, (draft) => {
          draft.turnsUntilLavaAdvance -= 1;
        });

        if (shouldLavaAdvance(computedState)) {
          const { newState: afterLava, events: lavaEvents } = advanceLavaWithEvents(computedState);
          allEvents.push(...lavaEvents);
          computedState = produce(afterLava, (draft) => {
            draft.turnsUntilLavaAdvance = getLavaAdvanceInterval(draft.difficulty);
          });
        }

        // Phase 5: Check game conditions after lava
        computedState = produce(computedState, (draft) => {
          checkGameConditions(draft, 'LAVA');
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
        const leashDefectEvents: GameEvent[] = [];
        computedState = produce(computedState, (draft) => {
          // Collect resources
          collectResources(draft);

          // Deduct specialist upkeep and update dormant status
          deductSpecialistUpkeep(draft);

          // Apply (or revoke) specialist effects based on updated dormancy state
          applySpecialistEffects(draft);

          // Grow house populations
          growHousePopulations(draft);

          // Recalculate tile discovery
          updateDiscovery(draft);

          // Brandmark tick: every BRANDMARKED player unit loses HP at end of turn.
          // Collect dying unit IDs first so we don't mutate the collection mid-loop.
          const brandmarkDying: string[] = [];
          for (const unit of Object.values(draft.units)) {
            if (unit.faction !== Faction.PLAYER) continue;
            if (!unit.tags.includes(UnitTag.BRANDMARKED)) continue;
            unit.stats.currentHp -= MAGE.BRANDMARK_HP_LOSS_PER_TURN;
            useFloaterStore.getState().addFloater({
              value: MAGE.BRANDMARK_HP_LOSS_PER_TURN,
              x: unit.position.x,
              y: unit.position.y,
              isEnemy: false,
            });
            if (unit.stats.currentHp <= 0) {
              brandmarkDying.push(unit.id);
            }
          }
          for (const unitId of brandmarkDying) {
            const unit = draft.units[unitId];
            if (unit) handleBrandmarkedUnitDeath(draft, unit);
          }

          // Leash defection: any player-faction LEASHED unit defects if its
          // controlling Mage is dead or out of leash range.
          // The demon's mage/position is captured for the burst VFX BEFORE mutating.
          for (const unit of Object.values(draft.units)) {
            if (!unit.tags.includes(UnitTag.LEASHED)) continue;
            if (unit.faction !== Faction.PLAYER) continue;

            const mage = unit.controllerMageId ? draft.units[unit.controllerMageId] : null;
            let defects = false;
            if (!mage || mage.faction !== Faction.PLAYER) {
              defects = true;
            } else {
              const inRange = isTileWithinEdgeCircleRange(
                mage.position.x, mage.position.y,
                unit.position.x, unit.position.y,
                MAGE.EMBER_DEMON_LEASH_RANGE,
              );
              if (!inRange) defects = true;
            }

            if (defects) {
              // Capture positions and IDs before mutating state.
              const demonId = unit.id;
              const demonPos = { x: unit.position.x, y: unit.position.y };
              const mageId = unit.controllerMageId ?? '';
              const magePos = mage ? { x: mage.position.x, y: mage.position.y } : demonPos;

              unit.faction = Faction.ENEMY;
              unit.controllerMageId = null;
              unit.tags = unit.tags.filter((t) =>
                t !== UnitTag.LEASHED && t !== UnitTag.SUMMONED
              );

              // Enqueue a LEASH_DEFECT event so the animation engine handles
              // the burst VFX in the correct order within the enemy-turn queue.
              leashDefectEvents.push({
                type: 'LEASH_DEFECT',
                demonId,
                mageId,
                demonPos,
                magePos,
              });
            }
          }

          // Reset all player units for new turn
          for (const unit of Object.values(draft.units)) {
            if (unit.faction === Faction.PLAYER) {
              unit.hasMovedThisTurn = false;
              unit.hasAttackedThisTurn = false;
              unit.hasCastThisTurn = false;
              unit.hasCapturedThisTurn = false;
              unit.hasConstructedThisTurn = false;
              unit.hasDestroyedThisTurn = false;
              unit.hasUsedPostAttackMoveThisTurn = false;
              unit.bloodlustAttackAvailable = false;
              // Only clear multi-turn stuns that have already expired so that
              // Grave Trap's 2-turn stun persists across the turn boundary.
              if (unit.pinnedUntilTurn !== 0 && unit.pinnedUntilTurn <= draft.turn) {
                unit.pinnedUntilTurn = 0;
              }
            }
          }

          // GRAVE_HARVEST: each player-owned Gravestone has a per-turn chance to yield 1 crystal
          if (draft.techFlags.includes(TechFlag.GRAVE_HARVEST)) {
            for (const b of Object.values(draft.buildings)) {
              if (b.type === BuildingType.GRAVESTONE && b.faction === Faction.PLAYER) {
                if (Math.random() * 100 < MAGE.GRAVE_HARVEST_CRYSTAL_CHANCE) {
                  draft.arcaneCrystals += 1;
                }
              }
            }
          }

          // Decrement building disable timers, reset attack flags
          for (const building of Object.values(draft.buildings)) {
            if (building.isDisabledForTurns > 0) {
              building.isDisabledForTurns -= 1;
            }
            building.wasAttackedLastEnemyTurn = false;
            // Reset attacking building action flags for new turn
            if (building.combatStats && building.faction === Faction.PLAYER) {
              building.hasAttackedThisTurn = false;
            }
          }
          // Check ember level
          if (draft.turn > 0 && draft.turn % ENEMY.THREAT_LEVEL_INCREASE_INTERVAL === 0) {
            draft.ember += 1;
            draft.emberLevelSources.turns += 1;
          }

          // Expire elapsed zone lockouts
          if (SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS > 0) {
            for (const zoneKey of Object.keys(draft.zoneLockoutUntilTurn)) {
              const zone = Number(zoneKey);
              if ((draft.zoneLockoutUntilTurn[zone] ?? 0) <= draft.turn) {
                delete draft.zoneLockoutUntilTurn[zone];
              }
            }
          }

          // Increment turn counter
          draft.turn += 1;

          // Set phase to player turn
          draft.phase = GamePhase.PLAYER_TURN;
        });

        // Phase 7: Stage events for animation (enqueued after this set commits)
        // Leash defect events play at the START of the queue so the demon visually
        // defects before the enemy-turn action events that follow them.
        if (leashDefectEvents.length > 0) {
          allEvents.unshift(...leashDefectEvents);
        }
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
      } else if (pendingResolvedState === null) {
        // No events queued — the final state was applied directly inside the set().
        // Autosave when the new player turn has started, or when the game ends
        // so that on reload the game-over/victory overlay is shown rather than
        // rewinding to the last living turn.
        const currentState = useGameStore.getState();
        if (
          currentState.phase === GamePhase.PLAYER_TURN ||
          currentState.phase === GamePhase.GAME_OVER ||
          currentState.phase === GamePhase.VICTORY
        ) {
          saveGameState(currentState);
        }
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

            // Apply melee advance in display state so that subsequent ENEMY_MOVE events
            // for other units don't visually overlap with the advancing attacker's old tile.
            if (event.advancedToPosition && attacker) {
              const fromTile = state.grid[attacker.position.y][attacker.position.x];
              if (fromTile.unitId === event.attackerId) {
                fromTile.unitId = null;
              }
              const toTile = state.grid[event.advancedToPosition.y][event.advancedToPosition.x];
              toTile.unitId = event.attackerId;
              attacker.position.x = event.advancedToPosition.x;
              attacker.position.y = event.advancedToPosition.y;
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
            // XP floaters — shown here (after the kill animation) rather than during computation.
            if (event.attackerXpGained) {
              addFloater({
                value: event.attackerXpGained,
                label: `⭐ +${event.attackerXpGained}`,
                x: event.attackerPosition.x,
                y: event.attackerPosition.y,
                isEnemy: true,
                floaterType: 'xp',
              });
            }
            if (event.defenderXpGained) {
              addFloater({
                value: event.defenderXpGained,
                label: `⭐ +${event.defenderXpGained}`,
                x: event.defenderPosition.x,
                y: event.defenderPosition.y,
                isEnemy: false,
                floaterType: 'xp',
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

            // Mark attacker as having attacked so the UI shows it as exhausted
            // immediately rather than showing actions remaining during animation.
            if (attacker) {
              attacker.hasAttackedThisTurn = true;
            }

            // Apply melee advance for display consistency.
            if (event.advancedToPosition && attacker) {
              const fromTile = state.grid[attacker.position.y][attacker.position.x];
              if (fromTile.unitId === event.attackerId) {
                fromTile.unitId = null;
              }
              const toTile = state.grid[event.advancedToPosition.y][event.advancedToPosition.x];
              toTile.unitId = event.attackerId;
              attacker.position.x = event.advancedToPosition.x;
              attacker.position.y = event.advancedToPosition.y;
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
            // XP floaters — shown here rather than during computation.
            if (event.attackerXpGained) {
              addFloater({
                value: event.attackerXpGained,
                label: `⭐ +${event.attackerXpGained}`,
                x: event.attackerPosition.x,
                y: event.attackerPosition.y,
                isEnemy: attacker?.faction === Faction.ENEMY,
                floaterType: 'xp',
              });
            }
            if (event.defenderXpGained) {
              addFloater({
                value: event.defenderXpGained,
                label: `⭐ +${event.defenderXpGained}`,
                x: event.defenderPosition.x,
                y: event.defenderPosition.y,
                isEnemy: defender?.faction === Faction.ENEMY,
                floaterType: 'xp',
              });
            }
            break;
          }

          case 'UNIT_DEATH': {
            const unit = state.units[event.unitId];
            if (unit) {
              // Show "Risen" floater for BRANDMARKED units — the deferred animation
              // was removed from handleBrandmarkedUnitDeath, so we show it here at
              // the correct point in the animation timeline.
              if (unit.tags.includes(UnitTag.BRANDMARKED)) {
                useFloaterStore.getState().addFloater({
                  value: 0,
                  label: '😈 Risen',
                  x: unit.position.x,
                  y: unit.position.y,
                  isEnemy: true,
                  floaterType: 'damage',
                });
              }
              const tile = state.grid[unit.position.y][unit.position.x];
              if (tile.unitId === event.unitId) {
                tile.unitId = null;
              }
              // Create a gravestone immediately when a qualifying player unit dies.
              // This keeps the gravestone in sync with the animation (unit disappears,
              // gravestone appears right away) rather than waiting for setGameState.
              const unitFaction = unit.faction;
              const unitType = unit.type;
              const unitTags = [...unit.tags];
              const deathPos = { x: unit.position.x, y: unit.position.y };
              delete state.units[event.unitId];
              if (!unitTags.includes(UnitTag.BRANDMARKED) && shouldLeaveGravestone(
                { faction: unitFaction, tags: unitTags },
                { defaultOn: false },
              )) {
                createGravestoneAt(state, deathPos, unitType);
              }
            }
            break;
          }

          case 'CAVE_MONSTER_KILLED': {
            // Remove the encounter entry from the live state. The encounter is
            // also removed from the resolvedState in attackUnit's produce call,
            // so both the incremental and final states stay consistent.
            state.activeCaveEncounters = state.activeCaveEncounters.filter(
              (e) => e.monsterId !== event.monsterId,
            );
            break;
          }

          case 'CAVE_MONSTER_RETREAT': {
            // Remove the retreating cave monster from the live state.
            // Unlike UNIT_DEATH, no gravestone is created — the monster burrows
            // back into its mountain and simply disappears.
            const retreatingUnit = state.units[event.unitId];
            if (retreatingUnit) {
              const tile = state.grid[retreatingUnit.position.y][retreatingUnit.position.x];
              if (tile.unitId === event.unitId) {
                tile.unitId = null;
              }
              delete state.units[event.unitId];
            }
            break;
          }

          case 'BUILDING_ATTACK': {
            // Apply damage to building and defender
            const building = state.buildings[event.buildingId];
            const defender = state.units[event.defenderId];

            if (defender && event.defenderHpLost > 0) {
              defender.stats.currentHp -= event.defenderHpLost;
            }
            if (building && event.buildingHpLost > 0) {
              building.hp -= event.buildingHpLost;
              if (building.hp <= 0) {
                if (building.type === BuildingType.OUTPOST) {
                  // Outposts are removed completely when destroyed
                  const { x, y } = building.position;
                  delete state.buildings[event.buildingId];
                  state.grid[y][x].buildingId = null;
                } else if (building.type === BuildingType.WATCHTOWER || building.faction === Faction.PLAYER) {
                  // Watchtowers and player buildings go neutral
                  building.hp = building.maxHp;
                  building.faction = null;
                  building.hasAttackedThisTurn = false;
                  building.specialistSlot = null;
                } else {
                  // Enemy buildings (e.g. MAGMASPYR) are destroyed and leave a ruin
                  const { x, y } = building.position;
                  const buildingType = building.type;
                  delete state.buildings[event.buildingId];
                  const tile = state.grid[y][x];
                  tile.buildingId = null;
                  if (buildingType === BuildingType.STRONGHOLD || buildingType === BuildingType.INFERNALSANCTUM) {
                    tile.isStrongholdRuin = true;
                  } else {
                    tile.isRuin = true;
                  }
                }
              }
            }

            // Trigger floaters
            const { addFloater } = useFloaterStore.getState();
            if (event.defenderHpLost > 0) {
              addFloater({
                value: event.defenderHpLost,
                x: event.defenderPosition.x,
                y: event.defenderPosition.y,
                isEnemy: defender?.faction === Faction.ENEMY,
              });
            }
            if (event.buildingHpLost > 0) {
              addFloater({
                value: event.buildingHpLost,
                x: event.buildingPosition.x,
                y: event.buildingPosition.y,
                isEnemy: building?.faction === Faction.ENEMY,
              });
            }
            // XP floater for enemy unit that counter-killed the player building.
            if (event.defenderXpGained) {
              addFloater({
                value: event.defenderXpGained,
                label: `⭐ +${event.defenderXpGained}`,
                x: event.defenderPosition.x,
                y: event.defenderPosition.y,
                isEnemy: defender?.faction === Faction.ENEMY,
                floaterType: 'xp',
              });
            }
            // Instantly reflect CORRUPTED tile status so the overlay appears
            // during the animation rather than at turn-end setGameState.
            if (event.tileCorruptedPosition) {
              const { x, y } = event.tileCorruptedPosition;
              const corruptedTile = state.grid[y]?.[x];
              if (corruptedTile) corruptedTile.status = TileStatus.CORRUPTED;
            }
            break;
          }

          case 'UNIT_ATTACK_BUILDING': {
            // Apply damage to attacker (from counter-attack) and building
            const attacker = state.units[event.attackerId];
            const building = state.buildings[event.buildingId];

            if (attacker && event.attackerHpLost > 0) {
              attacker.stats.currentHp -= event.attackerHpLost;
            }
            if (building && event.buildingHpLost > 0) {
              const newHp = building.hp - event.buildingHpLost;
              if (newHp <= 0) {
                if (building.type === BuildingType.OUTPOST) {
                  // Outposts are removed completely when destroyed
                  const { x, y } = building.position;
                  delete state.buildings[event.buildingId];
                  state.grid[y][x].buildingId = null;
                } else if (building.type === BuildingType.WATCHTOWER) {
                  // Watchtower goes neutral
                  building.hp = building.maxHp;
                  building.faction = null;
                  building.hasAttackedThisTurn = false;
                  building.specialistSlot = null;
                  building.turnCapturedByPlayer = null;
                  building.wasEnemyOwnedBeforeCapture = false;
                } else if (attacker?.faction === Faction.PLAYER && building.faction === Faction.ENEMY) {
                  // Enemy building destroyed by player: remove from state and leave a ruin
                  const { x, y } = building.position;
                  const buildingType = building.type;
                  delete state.buildings[event.buildingId];
                  const tile = state.grid[y][x];
                  tile.buildingId = null;
                  if (buildingType === BuildingType.STRONGHOLD || buildingType === BuildingType.INFERNALSANCTUM) {
                    tile.isStrongholdRuin = true;
                  } else {
                    tile.isRuin = true;
                  }
                }
              } else {
                building.hp = newHp;
              }
            }

            // Apply melee advance in display state so subsequent ENEMY_MOVE events
            // don't visually overlap with the advancing attacker's old tile.
            if (event.advancedToPosition && attacker) {
              const fromTile = state.grid[attacker.position.y][attacker.position.x];
              if (fromTile.unitId === event.attackerId) {
                fromTile.unitId = null;
              }
              const toTile = state.grid[event.advancedToPosition.y][event.advancedToPosition.x];
              toTile.unitId = event.attackerId;
              attacker.position.x = event.advancedToPosition.x;
              attacker.position.y = event.advancedToPosition.y;
              // Mark as moved this turn so cave-popup eligibility treats this as
              // "just arrived" and does not trigger the popup immediately.
              attacker.lastMovedTurn = state.turn;
            }

            // Trigger floaters
            const { addFloater } = useFloaterStore.getState();
            if (event.buildingHpLost > 0) {
              addFloater({
                value: event.buildingHpLost,
                x: event.buildingPosition.x,
                y: event.buildingPosition.y,
                isEnemy: building?.faction === Faction.ENEMY,
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
            // XP floater for attacker killing a building.
            if (event.attackerXpGained) {
              addFloater({
                value: event.attackerXpGained,
                label: `⭐ +${event.attackerXpGained}`,
                x: event.attackerPosition.x,
                y: event.attackerPosition.y,
                isEnemy: attacker?.faction === Faction.ENEMY,
                floaterType: 'xp',
              });
            }
            break;
          }

          case 'BUILDING_ATTACK_BUILDING': {
            // Apply damage to attacking building (from counter-attack) and target building
            const attackingBuilding = state.buildings[event.attackingBuildingId];
            const targetBuilding = state.buildings[event.targetBuildingId];

            if (attackingBuilding && event.attackingBuildingHpLost > 0) {
              const newHp = attackingBuilding.hp - event.attackingBuildingHpLost;
              if (newHp <= 0) {
                if (attackingBuilding.type === BuildingType.OUTPOST) {
                  // Outposts are removed completely when destroyed
                  const { x, y } = attackingBuilding.position;
                  delete state.buildings[event.attackingBuildingId];
                  state.grid[y][x].buildingId = null;
                } else {
                  // Attacking building goes neutral when destroyed by counter-attack
                  attackingBuilding.hp = attackingBuilding.maxHp;
                  attackingBuilding.faction = null;
                  attackingBuilding.hasAttackedThisTurn = false;
                  attackingBuilding.specialistSlot = null;
                  attackingBuilding.turnCapturedByPlayer = null;
                  attackingBuilding.wasEnemyOwnedBeforeCapture = false;
                }
              } else {
                attackingBuilding.hp = newHp;
              }
            }
            if (targetBuilding && event.targetBuildingHpLost > 0) {
              const newHp = targetBuilding.hp - event.targetBuildingHpLost;
              if (newHp <= 0) {
                if (targetBuilding.type === BuildingType.OUTPOST) {
                  // Outposts are removed completely when destroyed
                  const { x, y } = targetBuilding.position;
                  delete state.buildings[event.targetBuildingId];
                  state.grid[y][x].buildingId = null;
                } else {
                  // Target building goes neutral at 0 HP
                  targetBuilding.hp = targetBuilding.maxHp;
                  targetBuilding.faction = null;
                  targetBuilding.hasAttackedThisTurn = false;
                  targetBuilding.specialistSlot = null;
                  targetBuilding.turnCapturedByPlayer = null;
                  targetBuilding.wasEnemyOwnedBeforeCapture = false;
                }
              } else {
                targetBuilding.hp = newHp;
              }
            }

            // Trigger floaters
            const { addFloater: addBldFloater } = useFloaterStore.getState();
            if (event.targetBuildingHpLost > 0) {
              addBldFloater({
                value: event.targetBuildingHpLost,
                x: event.targetBuildingPosition.x,
                y: event.targetBuildingPosition.y,
                isEnemy: targetBuilding?.faction === Faction.ENEMY,
              });
            }
            if (event.attackingBuildingHpLost > 0) {
              addBldFloater({
                value: event.attackingBuildingHpLost,
                x: event.attackingBuildingPosition.x,
                y: event.attackingBuildingPosition.y,
                isEnemy: attackingBuilding?.faction === Faction.ENEMY,
              });
            }
            break;
          }

          case 'BUILDING_CAPTURE': {
            const building = state.buildings[event.buildingId];
            if (building) {
              // Enemy captures always destroy the building (non-STRONGHOLD/WATCHTOWER captures
              // by the player are applied directly without events). Delete it and apply the
              // destroy behavior immediately so the ruin sprite appears during animation
              // rather than waiting for setGameState at the end of the enemy turn.
              const { x, y } = building.position;
              const destroyBehavior = building.destroyBehavior;
              delete state.buildings[event.buildingId];
              const captureTile = state.grid[y][x];
              captureTile.buildingId = null;
              if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
                captureTile.isStrongholdRuin = true;
              } else if (destroyBehavior === DestroyBehavior.RUIN) {
                captureTile.isRuin = true;
              }
              // DestroyBehavior.NONE / RESOURCE: no ruin — terrain is restored naturally
            }
            // XP floater for the capturing unit.
            if (event.xpGained) {
              useFloaterStore.getState().addFloater({
                value: event.xpGained,
                label: `⭐ +${event.xpGained}`,
                x: event.position.x,
                y: event.position.y,
                isEnemy: event.newFaction === Faction.ENEMY,
                floaterType: 'xp',
              });
            }
            break;
          }

          case 'EXPLOSION': {
            // Apply flat damage to each affected player unit
            for (const targetId of event.damagedUnitIds) {
              const target = state.units[targetId];
              if (target) {
                target.stats.currentHp -= event.damagePerUnit;
                // If unit dies, it will be handled by the subsequent UNIT_DEATH event
              }
            }
            // Note: the exploding unit is NOT removed here. resolveExplosion emits a
            // UNIT_DEATH event for the emberling AFTER the EXPLOSION event so the
            // explosion VFX plays before the dying animation. That UNIT_DEATH handler
            // will remove the unit from the live state.

            // Trigger floaters for explosion damage
            const { addFloater } = useFloaterStore.getState();
            for (const targetId of event.damagedUnitIds) {
              const target = state.units[targetId];
              if (target) {
                addFloater({
                  value: event.damagePerUnit,
                  x: target.position.x,
                  y: target.position.y,
                  isEnemy: false, // player units take damage
                });
              }
            }
            break;
          }

          case 'LAVA_ADVANCE': {
            advanceLava(state);
            break;
          }

          case 'SANCTUM_COLLAPSE': {
            // Purge units
            for (const unitId of event.purgedUnitIds) {
              const unit = state.units[unitId];
              if (unit) {
                const tile = state.grid[unit.position.y][unit.position.x];
                if (tile.unitId === unitId) tile.unitId = null;
                delete state.units[unitId];
                state.gameStats.unitsKilled += 1;
              }
            }
            // Destroy enemy buildings
            for (const buildingId of event.destroyedBuildingIds) {
              const building = state.buildings[buildingId];
              if (building) {
                const tile = state.grid[building.position.y][building.position.x];
                tile.buildingId = null;
                const destroyBehavior = building.destroyBehavior;
                if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
                  tile.isStrongholdRuin = true;
                } else if (destroyBehavior === DestroyBehavior.RUIN) {
                  tile.isRuin = true;
                }
                delete state.buildings[buildingId];
                state.gameStats.enemyBuildingsDestroyed += 1;
              }
            }
            // Apply lockout
            state.zoneLockoutUntilTurn[event.zone] = event.lockoutUntilTurn;
            // Apply freeze fields
            if (event.spawnFreezeUntilTurn > 0) {
              state.spawnFreezeUntilTurn = Math.max(state.spawnFreezeUntilTurn, event.spawnFreezeUntilTurn);
            }
            if (event.lavaAdvanceBonus > 0) {
              state.turnsUntilLavaAdvance += event.lavaAdvanceBonus;
            }
            // Notification floater on the sanctum tile
            let label: string;
            if (event.lavaAdvanceBonus > 0) {
              label = `Infernal Sanctum destroyed! Lava advance delayed by +${event.lavaAdvanceBonus}`;
            } else {
              label = `🌋 Zone ${event.zone} purged!`;
              if (event.spawnFreezeUntilTurn > state.turn) {
                label += ` · Spawns frozen (${event.spawnFreezeUntilTurn - state.turn}t)`;
              }
            }
            useFloaterStore.getState().addFloater({
              label,
              value: 0,
              x: event.sanctumPosition.x,
              y: event.sanctumPosition.y,
              isEnemy: false,
              floaterType: 'xp',
            });
            break;
          }

          case 'ZONE_CLEARED':
            // All state mutations already applied during cascade — event is presentation-only.
            break;

          case 'TILE_DAMAGE': {
            // Emit a damage floater at the affected tile.
            useFloaterStore.getState().addFloater({
              value: event.amount,
              x: event.position.x,
              y: event.position.y,
              isEnemy: false,
              floaterType: 'damage',
            });
            break;
          }

          case 'EMBER_LEVEL_UP': {
            // State was already mutated in enemySystem — this is presentation-only.
            const sacrificeLabel = event.isEmberlingSacrifice
              ? `Emberling sacrificed to lava · 🔥 Ember Level +${event.amount}`
              : `Enemy consumed by lava · 🔥 Ember Level +${event.amount}`;
            useFloaterStore.getState().addFloater({
              label: sacrificeLabel,
              value: 0,
              x: event.position.x,
              y: event.position.y,
              isEnemy: true,
              floaterType: 'xp',
            });
            break;
          }

          case 'TILE_CORRUPTED': {
            // Replay the building placement so the building sprite appears during animation
            // rather than waiting for setGameState at turn end.
            state.buildings[event.building.id] = { ...event.building };
            const corruptTile = state.grid[event.position.y]?.[event.position.x];
            if (corruptTile) corruptTile.buildingId = event.building.id;
            break;
          }

          case 'SPLASH_DAMAGE': {
            const splashTarget = state.units[event.unitId];
            if (splashTarget) {
              splashTarget.stats.currentHp = Math.max(0, splashTarget.stats.currentHp - event.amount);
            }
            useFloaterStore.getState().addFloater({
              value: event.amount,
              x: event.position.x,
              y: event.position.y,
              isEnemy: event.isEnemy,
            });
            break;
          }

          case 'CLEAVE_DAMAGE': {
            const cleaveTarget = state.units[event.unitId];
            if (cleaveTarget) {
              cleaveTarget.stats.currentHp = Math.max(0, cleaveTarget.stats.currentHp - event.amount);
            }
            useFloaterStore.getState().addFloater({
              value: event.amount,
              x: event.position.x,
              y: event.position.y,
              isEnemy: event.isEnemy,
            });
            break;
          }

          case 'PIERCE_DAMAGE': {
            if (event.unitId) {
              const pierceTarget = state.units[event.unitId];
              if (pierceTarget) {
                pierceTarget.stats.currentHp = Math.max(0, pierceTarget.stats.currentHp - event.amount);
              }
            } else if (event.buildingId) {
              const pierceBuilding = state.buildings[event.buildingId];
              if (pierceBuilding) {
                pierceBuilding.hp = Math.max(0, pierceBuilding.hp - event.amount);
              }
            }
            useFloaterStore.getState().addFloater({
              value: event.amount,
              x: event.position.x,
              y: event.position.y,
              isEnemy: event.isEnemy,
            });
            break;
          }

          case 'TUNNEL_DIG_IN': {
            const unit = state.units[event.unitId];
            if (unit) {
              unit.tunnelState = 'DIGGING_IN';
              unit.tunnelStartPosition = { x: event.position.x, y: event.position.y };
              const tile = state.grid[event.position.y]?.[event.position.x];
              if (tile && tile.unitId === event.unitId) {
                tile.unitId = null;
              }
            }
            break;
          }

          case 'TUNNEL_EMERGE_WARNING': {
            const unit = state.units[event.unitId];
            if (unit) {
              // Visual hint: the engine reads this state to show the earthquake overlay
              // on the planned emergence tile. tunnelState transitions to EMERGING
              // inside the enemy-turn snapshot computation, mirrored here for live state.
              unit.tunnelState = 'EMERGING';
              unit.tunnelPlannedEmergence = { x: event.position.x, y: event.position.y };
            }
            break;
          }

          case 'TUNNEL_EMERGE': {
            const unit = state.units[event.unitId];
            if (unit) {
              unit.position = { x: event.position.x, y: event.position.y };
              unit.tunnelState = 'IDLE';
              unit.tunnelStartPosition = null;
              unit.tunnelPlannedEmergence = null;
              unit.tunnelTurnsUnderground = 0;
              const tile = state.grid[event.position.y]?.[event.position.x];
              if (tile) {
                tile.unitId = event.unitId;
              }
            }
            // Apply emergence AoE damage to adjacent player units that are still alive
            // in the live display state (killed units were already removed by their own
            // UNIT_DEATH events which precede this TUNNEL_EMERGE event in the queue).
            if (event.affectedPositions && event.affectedPositions.length > 0) {
              const { addFloater } = useFloaterStore.getState();
              for (const pos of event.affectedPositions) {
                const aoeTargetTile = state.grid[pos.y]?.[pos.x];
                if (!aoeTargetTile?.unitId) continue;
                const aoeTarget = state.units[aoeTargetTile.unitId];
                if (aoeTarget && aoeTarget.faction === Faction.PLAYER) {
                  aoeTarget.stats.currentHp = Math.max(0, aoeTarget.stats.currentHp - TUNNEL_EMERGE_DAMAGE);
                  addFloater({
                    value: TUNNEL_EMERGE_DAMAGE,
                    x: pos.x,
                    y: pos.y,
                    isEnemy: false,
                  });
                }
              }
            }
            // Note: tile corruption status flip is intentionally NOT mirrored here.
            // It happens at queue-end via setGameState(resolvedState). The dust hides
            // the sprite swap; the corruption colour change can settle a beat later.
            break;
          }

          case 'LEASH_DEFECT':
            // sweepLeashes already applied the faction flip in the immer snapshot.
            // The live display state reflects this at queue-end via setGameState.
            // No incremental mutation needed here.
            break;

          case 'STUN_APPLIED':
            // Presentation-only: defender.pinnedUntilTurn is set by the combat resolver.
            break;

          case 'PORTAL_CREATED':
            // Presentation-only: state mutation happens in the action producer (portalSystem.ts).
            break;

          case 'PORTAL_USED': {
            // Move the teleported unit from entrance to exit in the live display state,
            // mirroring what portalSystem.tryTeleportThroughPortal already applied in
            // the immer draft. Without this the unit sprite stays on the entrance tile
            // until setGameState(resolvedState) fires at queue end.
            const teleportUnit = state.units[event.unitId];
            if (teleportUnit) {
              const fromTile = state.grid[event.fromPos.y]?.[event.fromPos.x];
              if (fromTile && fromTile.unitId === event.unitId) {
                fromTile.unitId = null;
              }
              const toTile = state.grid[event.toPos.y]?.[event.toPos.x];
              if (toTile) {
                toTile.unitId = event.unitId;
              }
              teleportUnit.position = { x: event.toPos.x, y: event.toPos.y };
            }
            break;
          }

          case 'PORTAL_CLOSED':
            // Presentation-only: state mutation happens in the action producer (portalSystem.ts).
            break;

          case 'RESONANCE_TRIGGERED':
            // Presentation-only: mutation applied via resolvedState.
            break;

          case 'STUN_BLOCKED':
          case 'DEFENSE_BONUS_IGNORED':
          case 'CORRUPTION_APPLIED':
            // Presentation-only: no state mutation required.
            break;

          default:
            assertNever(event);
        }
      });
    },

    applyMeleeAdvance: (attackerId: string, toPosition: Position) => {
      set((state) => {
        const attacker = state.units[attackerId];
        if (!attacker) return;
        const fromTile = state.grid[attacker.position.y][attacker.position.x];
        if (fromTile.unitId === attackerId) {
          fromTile.unitId = null;
        }
        const toTile = state.grid[toPosition.y][toPosition.x];
        toTile.unitId = attackerId;
        attacker.position.x = toPosition.x;
        attacker.position.y = toPosition.y;
        // Mark as moved this turn so that cave-popup eligibility checks
        // treat this as "just arrived" and do not show the popup immediately.
        if (attacker.faction === Faction.PLAYER) {
          attacker.lastMovedTurn = state.turn;
          attacker.hasMovedThisTurn = true;
        }
      });
    },

    activateCrystalChamber: (chamberId: string) => {
      set((state) => {
        const chamber = state.buildings[chamberId];
        if (chamber && chamber.type === BuildingType.CRYSTAL_CHAMBER) {
          chamber.resonanceTurnsRemaining = Math.max(
            chamber.resonanceTurnsRemaining,
            CRYSTAL_CHAMBER_CONFIG.RESONANCE_DURATION,
          );
        }
      });
    },

    setGameState: (newState: GameState) => {
      set((state) => {
        Object.assign(state, newState);
      });
      // Autosave when transitioning to the player's turn, or when the game ends
      // so that the overlay is shown on reload rather than rewinding to the last turn.
      if (
        newState.phase === GamePhase.PLAYER_TURN ||
        newState.phase === GamePhase.GAME_OVER ||
        newState.phase === GamePhase.VICTORY
      ) {
        saveGameState(newState);
      }
    },

    saveGame: () => {
      saveGameState(useGameStore.getState());
    },

    loadGame: () => {
      const saved = loadGameState();
      if (!saved) return;
      set((state) => {
        Object.assign(state, saved);
      });
      syncCameraToPlayerStronghold(saved);
    },

    clearSavedGame: () => {
      clearSavedGame();
    },

    hasSavedGame: () => {
      return hasSavedGame();
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
          state.specialists[specId].assignedBuildingId === null &&
          state.globalSpecialistStorage.length < state.specialistSlotCap
        ) {
          state.globalSpecialistStorage.push(specId);
        }
      });
    },

    debugAdvanceLava: () => {
      set((state) => {
        advanceLava(state);
        updateDiscovery(state);
        checkGameConditions(state, 'LAVA');
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

    debugAddFarmers: () => {
      set((state) => {
        // Find a free tile in zone 1 (high Y, south — near lava)
        const endRow = MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1;
        const startRow = endRow - MAP.ZONE_HEIGHT + 1;
        for (let y = startRow; y <= endRow; y++) {
          for (let x = 0; x < MAP.GRID_WIDTH; x++) {
            const tile = state.grid[y][x];
            if (tile.buildingId === null && !tile.isLava && tile.unitId === null && tile.isRevealed) {
              const building = {
                id: generateId('building'),
                type: BuildingType.FARM,
                faction: Faction.PLAYER as Faction | null,
                position: { x, y },
                hp: 100,
                maxHp: 100,
                specialistSlot: null,
                isDisabledForTurns: 0,
                wasAttackedLastEnemyTurn: false,
                captureProgress: 0,
                isBeingCapturedBy: null,
                lavaBoostEnabled: false,
                discoverRadius: BUILDING_DEFINITIONS[BuildingType.FARM].discoverRadius,
                turnCapturedByPlayer: null,
                wasEnemyOwnedBeforeCapture: false,
                combatStats: null,
                hasAttackedThisTurn: false,
                tags: [] as import('./types').UnitTag[],
                consumesUnitOnCapture: false,
                populationCount: POPULATION.FARM_POPULATION_CAP,
                populationCap: POPULATION.FARM_POPULATION_CAP,
                populationGrowthCounter: 0,
                strongholdNobles: 0,
                emberSpawnCounter: 0,
                recruitmentQueue: null,
                destroyBehavior: BUILDING_DEFINITIONS[BuildingType.FARM].destroyBehavior,
                resonanceTurnsRemaining: 0,
                spawnCooldownRemaining: 0,
                lastRecruitmentTurn: 0,
              };
              state.buildings[building.id] = building;
              tile.buildingId = building.id;
              updateDiscovery(state);
              return;
            }
          }
        }
      });
    },

    debugAddRuin: () => {
      set((state) => {
        // Find a tile near a player unit that is empty (no building, no lava)
        const playerUnits = Object.values(state.units).filter(u => u.faction === Faction.PLAYER);
        if (playerUnits.length === 0) return;
        const unit = playerUnits[0];
        // Check adjacent tiles
        const offsets = [
          { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
          { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
        ];
        for (const { dx, dy } of offsets) {
          const nx = unit.position.x + dx;
          const ny = unit.position.y + dy;
          if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
          const tile = state.grid[ny][nx];
          if (tile.buildingId === null && !tile.isLava && !tile.isRuin && !tile.isStrongholdRuin) {
            tile.isRuin = true;
            return;
          }
        }
      });
    },

    debugAddCrystals: () => {
      set((state) => {
        state.arcaneCrystals += 5;
      });
    },

    debugApplyTileStatus: (status: string) => {
      set((state) => {
        if (!state.selectedTilePos) return;
        const newStatus = status as TileStatus;
        applyTileStatus(state, state.selectedTilePos, newStatus);
      });
    },

    debugClearTileStatus: () => {
      set((state) => {
        if (!state.selectedTilePos) return;
        clearTileStatus(state, state.selectedTilePos);
      });
    },

    levelUpUnit: (unitId: string) => {
      set((state) => {
        const unit = state.units[unitId];
        if (!unit || unit.faction !== Faction.PLAYER) return;
        const targetLevel = computeLevelFromXp(unit.type, unit.xp);
        if (targetLevel <= unit.level) return;
        applyLevelUps(state, unitId, targetLevel);
      });
    },

    unlockTech: (techId: TechId) => {
      set((state) => {
        unlockTechLogic(state, techId);
      });
    },

    getAvailableTechs: (): TechId[] => {
      return getAvailableTechsLogic(useGameStore.getState());
    },
  }))
);
