/**
 * Combat system module for Volcanae.
 * Implements Polytopia-style combat formulas and resolution logic.
 * Supports both unit-vs-unit and building-vs-unit combat.
 */

import type { Unit, Building, GameState } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, UnitTag, TechFlag, TileType, DestroyBehavior } from './types';
import { useFloaterStore } from './floaterStore';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { UNIT_DEFINITIONS, XP, ABILITIES, MAP } from './gameConfig';
import { grantXp } from './levelSystem';

// ============================================================================
// COMBAT RESULT INTERFACE
// ============================================================================

export interface CombatResult {
  /** HP lost by the attacker (from counterattack) */
  attackerHpLost: number;
  /** HP lost by the defender */
  defenderHpLost: number;
}

// ============================================================================
// COMBATANT ABSTRACTION
// ============================================================================

/**
 * A combatant represents a unit or a building that can participate in combat.
 * This unifies the combat interface so both units and attacking buildings
 * can use the same combat formula.
 */
export interface Combatant {
  currentHp: number;
  maxHp: number;
  baseMaxHp: number;
  attack: number;
  defense: number;
  attackRange: number;
  positionX: number;
  positionY: number;
  faction: Faction;
  tags: UnitTag[];
}

/** Extracts combatant stats from a Unit. */
export function unitToCombatant(unit: Unit): Combatant {
  const baseMaxHp = (UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS] as { maxHp: number } | undefined)?.maxHp ?? unit.stats.maxHp;
  return {
    currentHp: unit.stats.currentHp,
    maxHp: unit.stats.maxHp,
    baseMaxHp,
    attack: unit.stats.attack,
    defense: unit.stats.defense,
    attackRange: unit.stats.attackRange,
    positionX: unit.position.x,
    positionY: unit.position.y,
    faction: unit.faction,
    tags: unit.tags,
  };
}

/** Extracts combatant stats from a Building with combat stats. */
export function buildingToCombatant(building: Building): Combatant | null {
  if (!building.combatStats || !building.faction) return null;
  return {
    currentHp: building.hp,
    maxHp: building.maxHp,
    baseMaxHp: building.maxHp,
    attack: building.combatStats.attack,
    defense: building.combatStats.defense,
    attackRange: building.combatStats.attackRange,
    positionX: building.position.x,
    positionY: building.position.y,
    faction: building.faction,
    tags: building.tags,
  };
}

// ============================================================================
// PHALANX BONUS HELPERS
// ============================================================================

/**
 * Returns the total PHALANX defense bonus for a unit.
 * Counts all adjacent friendly units (Chebyshev distance 1) that carry the PHALANX tag
 * and sums ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER for each.
 */
export function getPhalanxDefenseBonus(state: GameState | Draft<GameState>, unit: Unit): number {
  let bonus = 0;
  const { x, y } = unit.position;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const tile = state.grid[ny]?.[nx];
      if (!tile?.unitId) continue;
      const other = state.units[tile.unitId];
      if (!other) continue;
      if (other.faction !== unit.faction) continue;
      if (other.tags.includes(UnitTag.PHALANX)) {
        bonus += ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER;
      }
    }
  }
  return bonus;
}

/**
 * Returns the total PHALANX attack bonus for a unit that carries the PHALANX tag.
 * Counts all adjacent friendly units (Chebyshev distance 1) regardless of their tags
 * and returns count × the respective bonus per ally.
 * Returns 0 if the unit does not have PHALANX.
 */
export function getPhalanxAttackBonus(state: GameState | Draft<GameState>, unit: Unit): number {
  const hasPhalanx = unit.tags.includes(UnitTag.PHALANX);
  if (!hasPhalanx) return 0;
  let count = 0;
  const { x, y } = unit.position;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const tile = state.grid[ny]?.[nx];
      if (!tile?.unitId) continue;
      const other = state.units[tile.unitId];
      if (!other) continue;
      if (other.faction !== unit.faction) continue;
      count++;
    }
  }
  return count * ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY;
}

// ============================================================================
// COMBAT CALCULATIONS
// ============================================================================

/**
 * Calculates the combat result between an attacker and defender.
 * Uses Polytopia-style combat formula:
 * - Effective attack = attack × (0.5 + 0.5 × (currentHp / maxHp))
 * - Effective defense = defense × (0.5 + 0.5 × (currentHp / maxHp))
 * - Damage to defender = effectiveAttack × (effectiveAttack / (effectiveAttack + effectiveDefense))
 * - Counter-damage to attacker = effectiveDefense × (effectiveDefense / (effectiveDefense + effectiveAttack))
 *
 * @param attacker - The attacking unit
 * @param defender - The defending unit
 * @returns Combat result with HP lost by both units
 */
export function calculateCombat(attacker: Unit, defender: Unit): CombatResult {
  return calculateCombatFromStats(unitToCombatant(attacker), unitToCombatant(defender));
}

/**
 * General combat calculation using Combatant stats (works for both units and buildings).
 */
export function calculateCombatFromStats(attacker: Combatant, defender: Combatant): CombatResult {
  // Calculate effective attack based on attacker's current HP ratio (vs base level-1 maxHp)
  const attackerBaseHp = attacker.baseMaxHp > 0 ? attacker.baseMaxHp : attacker.maxHp;
  const attackerHpRatio = attacker.currentHp / attackerBaseHp;
  const effectiveAttack = attacker.attack * (0.5 + 0.5 * attackerHpRatio);

  // Calculate effective defense based on defender's current HP ratio (vs base level-1 maxHp)
  const defenderBaseHp = defender.baseMaxHp > 0 ? defender.baseMaxHp : defender.maxHp;
  const defenderHpRatio = defender.currentHp / defenderBaseHp;
  const effectiveDefense =
    defender.defense * (0.5 + 0.5 * defenderHpRatio);

  // Calculate damage dealt to defender
  const totalPower = effectiveAttack + effectiveDefense;
  let damageToDefender =
    attacker.attack * (effectiveAttack / totalPower);

  // ASSASSIN: multiply final damage when attacking a full-HP target.
  // The multiplier is applied to the finished damage value so it reliably
  // delivers ASSASSIN_DAMAGE_MULTIPLIER × the normal output, regardless of
  // the ratio-based combat formula.
  if (attacker.tags.includes(UnitTag.ASSASSIN) && defender.currentHp === defender.maxHp) {
    damageToDefender *= ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER;
  }

  // Calculate counter-damage dealt to attacker
  const counterDamageToAttacker =
    defender.defense * (effectiveDefense / totalPower);

  return {
    attackerHpLost: Math.round(counterDamageToAttacker),
    defenderHpLost: Math.round(damageToDefender),
  };
}

// ============================================================================
// ATTACK RESOLUTION
// ============================================================================

/**
 * Resolves an attack between two units by mutating the draft state.
 * - Applies damage to defender
 * - If defender survives AND the attacker is within the defender's attack range,
 *   applies counter-damage to attacker
 * - Removes dead units from state
 * - Marks attacker as having acted and moved this turn
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param attackerId - ID of the attacking unit
 * @param defenderId - ID of the defending unit
 */
// Action availability rules (which flags or tags block attacking) live in
// unitActions.ts → canUnitAttack. Do not add tag checks or flag logic here.
export function resolveAttack(
  state: Draft<GameState>,
  attackerId: string,
  defenderId: string,
  suppressFloaters?: boolean
): void {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];

  // Validate units exist
  if (!attacker || !defender) {
    return;
  }

  // Capture factions before mutations
  const attackerFaction = attacker.faction;
  const defenderFaction = defender.faction;

  // Capture defender's position before it is potentially removed from state
  const defenderPosition = { x: defender.position.x, y: defender.position.y };

  // Calculate combat result (with HOLD_GROUND defense bonus if applicable)
  const attackerCombatant = unitToCombatant(attacker);
  const defenderCombatant = unitToCombatant(defender);
  if (state.techFlags.includes(TechFlag.HOLD_GROUND) && defender.faction === Faction.PLAYER) {
    const tile = state.grid[defender.position.y]?.[defender.position.x];
    const buildingId = tile?.buildingId;
    if (buildingId) {
      const building = state.buildings[buildingId];
      if (building?.faction === Faction.PLAYER) {
        defenderCombatant.defense += ABILITIES.HOLD_GROUND_DEFENSE_BONUS;
      }
    }
  }

  // LANCE_CHARGE: attacker gains attack bonus when it has not yet moved this turn
  if (attacker.tags.includes(UnitTag.LANCE_CHARGE) && !attacker.hasMovedThisTurn) {
    attackerCombatant.attack += ABILITIES.LANCE_CHARGE_ATTACK_BONUS;
  }

  // PHALANX: attacker gains attack bonus, defender gains defense bonus
  attackerCombatant.attack += getPhalanxAttackBonus(state, attacker);
  defenderCombatant.defense += getPhalanxDefenseBonus(state, defender);

  const combatResult = calculateCombatFromStats(attackerCombatant, defenderCombatant);

  // ASSASSIN: no retaliation damage when ability is activated (defender at full HP)
  if (attacker.tags.includes(UnitTag.ASSASSIN) && defender.stats.currentHp === defender.stats.maxHp) {
    combatResult.attackerHpLost = 0;
  }

  // COVER: attacker never suffers counter-damage
  if (attacker.tags.includes(UnitTag.COVER)) {
    combatResult.attackerHpLost = 0;
  }

  // Apply damage to defender
  const newDefenderHp = defender.stats.currentHp - combatResult.defenderHpLost;
  const defenderDead = newDefenderHp <= 0;

  // If defender survives AND attacker is within defender's attack range, apply counter-damage
  const defenderCanCounterAttack = isTileWithinEdgeCircleRange(
    defender.position.x, defender.position.y,
    attacker.position.x, attacker.position.y,
    defender.stats.attackRange,
  );
  const attackerTakesCounterDamage = !defenderDead && defenderCanCounterAttack;
  const newAttackerHp = attackerTakesCounterDamage
    ? attacker.stats.currentHp - combatResult.attackerHpLost
    : attacker.stats.currentHp;
  const attackerDead = newAttackerHp <= 0;

  // Update game stats
  if (attackerFaction === Faction.PLAYER) {
    state.gameStats.damageDealt += combatResult.defenderHpLost;
  } else if (defenderFaction === Faction.PLAYER) {
    state.gameStats.damageReceived += combatResult.defenderHpLost;
  }
  if (attackerTakesCounterDamage) {
    if (defenderFaction === Faction.PLAYER) {
      state.gameStats.damageDealt += combatResult.attackerHpLost;
    } else if (attackerFaction === Faction.PLAYER) {
      state.gameStats.damageReceived += combatResult.attackerHpLost;
    }
  }

  // Trigger damage floaters (visual only)
  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: defender.position.x,
        y: defender.position.y,
        isEnemy: defender.faction === Faction.ENEMY,
      });
    }
    if (attackerTakesCounterDamage && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: attacker.position.x,
        y: attacker.position.y,
        isEnemy: attacker.faction === Faction.ENEMY,
      });
    }
  }

  // Update attacker
  if (attackerDead) {
    // Remove attacker from grid
    const attackerTile = state.grid[attacker.position.y][attacker.position.x];
    if (attackerTile.unitId === attackerId) {
      attackerTile.unitId = null;
    }
    // Remove attacker from units
    delete state.units[attackerId];
    // Grant XP to defender for killing the attacker
    grantXp(state, defenderId, XP.KILL_UNIT, suppressFloaters);
    // Update kill/loss stats
    if (attackerFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
    else if (defenderFaction === Faction.PLAYER) state.gameStats.unitsKilled += 1;
  } else {
    // Update attacker HP and mark as acted
    attacker.stats.currentHp = newAttackerHp;
    attacker.hasAttackedThisTurn = true;
  }

  // Update defender
  if (defenderDead) {
    // Remove defender from grid
    const defenderTile = state.grid[defender.position.y][defender.position.x];
    if (defenderTile.unitId === defenderId) {
      defenderTile.unitId = null;
    }
    // Remove defender from units
    delete state.units[defenderId];
    // Grant XP to attacker for killing the defender
    if (!attackerDead) {
      grantXp(state, attackerId, XP.KILL_UNIT, suppressFloaters);
    }
    // Update kill/loss stats
    if (defenderFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
    else if (attackerFaction === Faction.PLAYER) state.gameStats.unitsKilled += 1;

    // If the defender was standing on an enemy building that the player attacker
    // just conquered (melee advance), destroy/neutralize the building only for
    // applicable building types. Spawner buildings (LAVALAIR, INFERNALSANCTUM)
    // remain untouched — they can only be taken through the capture mechanic.
    if (!attackerDead && attackerFaction === Faction.PLAYER) {
      const tileOfDead = state.grid[defenderPosition.y][defenderPosition.x];
      if (tileOfDead.buildingId) {
        const bld = state.buildings[tileOfDead.buildingId];
        if (bld && bld.faction === Faction.ENEMY) {
          if (bld.type === BuildingType.WATCHTOWER) {
            // Watchtower goes neutral so it can be captured
            bld.hp = bld.maxHp;
            bld.faction = null;
            bld.hasAttackedThisTurn = false;
            bld.specialistSlot = null;
            bld.turnCapturedByPlayer = null;
            bld.wasEnemyOwnedBeforeCapture = false;
            grantXp(state, attackerId, XP.DESTROY_BUILDING, suppressFloaters);
          } else if (
            bld.type !== BuildingType.LAVALAIR &&
            bld.type !== BuildingType.INFERNALSANCTUM
          ) {
            // Other enemy buildings (but NOT spawners) are destroyed
            const destroyBehavior = bld.destroyBehavior;
            const bldId = tileOfDead.buildingId!;
            delete state.buildings[bldId];
            tileOfDead.buildingId = null;
            if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
              tileOfDead.isStrongholdRuin = true;
            } else if (destroyBehavior === DestroyBehavior.RUIN) {
              tileOfDead.isRuin = true;
            }
            // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally
            state.gameStats.enemyBuildingsDestroyed += 1;
            grantXp(state, attackerId, XP.DESTROY_BUILDING, suppressFloaters);
          }
          // LAVALAIR / INFERNALSANCTUM: remain as enemy buildings.
          // Set a spawn cooldown so the building skips one spawn cycle,
          // giving the player a turn to move onto the tile and capture.
          if (bld.type === BuildingType.LAVALAIR || bld.type === BuildingType.INFERNALSANCTUM) {
            bld.spawnCooldownRemaining = 1;
          }
        }
      }
    }
  } else {
    // Update defender HP
    defender.stats.currentHp = newDefenderHp;

    // DISTRACTION: permanently reduce defender's DEF on each hit
    if (attacker.tags.includes(UnitTag.DISTRACTION)) {
      const reduction = Math.min(ABILITIES.DISTRACTION_DEF_REDUCTION, defender.stats.defense);
      defender.stats.defense -= reduction;
      defender.distractionDefPenalty += reduction;
    }

    // PIN_DOWN: stun the defender with a configurable chance (prevents move + attack)
    if (attacker.tags.includes(UnitTag.PIN_DOWN) && Math.random() < ABILITIES.PIN_DOWN_STUN_CHANCE) {
      defender.pinnedUntilTurn = state.turn;
    }
  }

  // Melee attacker advances onto the tile the defeated defender occupied
  // (unless the tile is impassable — canyon / water)
  if (defenderDead && !attackerDead) {
    const attackerUnit = state.units[attackerId];
    const targetTerrain = state.grid[defenderPosition.y][defenderPosition.x].terrainType;
    if (
      attackerUnit &&
      !attackerUnit.tags.includes(UnitTag.RANGED) &&
      targetTerrain !== TileType.CANYON &&
      targetTerrain !== TileType.WATER
    ) {
      const fromTile = state.grid[attackerUnit.position.y][attackerUnit.position.x];
      if (fromTile.unitId === attackerId) {
        fromTile.unitId = null;
      }
      const toTile = state.grid[defenderPosition.y][defenderPosition.x];
      toTile.unitId = attackerId;
      attackerUnit.position.x = defenderPosition.x;
      attackerUnit.position.y = defenderPosition.y;
    }
  }
}

// ============================================================================
// BUILDING ATTACK RESOLUTION
// ============================================================================

/**
 * Resolves an attack by a building (e.g. watchtower) against a unit.
 * Buildings always attack at range so there is no melee advance.
 * The defending unit may counter-attack if within its own range.
 * If the building's HP reaches 0, it becomes neutral instead of being destroyed.
 *
 * @param state - Immer draft of the game state (will be mutated)
 * @param buildingId - ID of the attacking building
 * @param defenderId - ID of the defending unit
 * @param suppressFloaters - Whether to suppress visual damage floaters
 */
export function resolveBuildingAttack(
  state: Draft<GameState>,
  buildingId: string,
  defenderId: string,
  suppressFloaters?: boolean,
): void {
  const building = state.buildings[buildingId];
  const defender = state.units[defenderId];

  if (!building || !building.combatStats || !building.faction || !defender) return;

  const buildingFaction = building.faction;
  const defenderFaction = defender.faction;

  const buildingCombatant = buildingToCombatant(building)!;
  const defenderCombatant = unitToCombatant(defender);

  // HOLD_GROUND: if the flag is active and the defender is a player unit
  // standing on a player-owned building, add a flat defense bonus.
  if (state.techFlags.includes(TechFlag.HOLD_GROUND) && defender.faction === Faction.PLAYER) {
    const defTile = state.grid[defender.position.y]?.[defender.position.x];
    const defBuildingId = defTile?.buildingId;
    if (defBuildingId) {
      const defBuilding = state.buildings[defBuildingId];
      if (defBuilding?.faction === Faction.PLAYER) {
        defenderCombatant.defense += ABILITIES.HOLD_GROUND_DEFENSE_BONUS;
      }
    }
  }

  // PHALANX: defender gains defense bonus from adjacent PHALANX allies
  defenderCombatant.defense += getPhalanxDefenseBonus(state, defender);

  const combatResult = calculateCombatFromStats(buildingCombatant, defenderCombatant);

  const newDefenderHp = defender.stats.currentHp - combatResult.defenderHpLost;
  const defenderDead = newDefenderHp <= 0;

  // Defender can counter-attack if it survives and building is within its attack range
  const defenderCanCounter = isTileWithinEdgeCircleRange(
    defender.position.x, defender.position.y,
    building.position.x, building.position.y,
    defender.stats.attackRange,
  );
  const buildingTakesCounterDamage = !defenderDead && defenderCanCounter;
  const newBuildingHp = buildingTakesCounterDamage
    ? building.hp - combatResult.attackerHpLost
    : building.hp;
  const buildingDead = newBuildingHp <= 0;

  // Update game stats
  if (buildingFaction === Faction.ENEMY && defenderFaction === Faction.PLAYER) {
    // Enemy building attacks player unit
    state.gameStats.damageReceived += combatResult.defenderHpLost;
    if (buildingTakesCounterDamage) state.gameStats.damageDealt += combatResult.attackerHpLost;
  } else if (buildingFaction === Faction.PLAYER && defenderFaction === Faction.ENEMY) {
    // Player building attacks enemy unit
    state.gameStats.damageDealt += combatResult.defenderHpLost;
    if (buildingTakesCounterDamage) state.gameStats.damageReceived += combatResult.attackerHpLost;
  }

  // Trigger damage floaters
  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: defender.position.x,
        y: defender.position.y,
        isEnemy: defender.faction === Faction.ENEMY,
      });
    }
    if (buildingTakesCounterDamage && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: building.position.x,
        y: building.position.y,
        isEnemy: building.faction === Faction.ENEMY,
      });
    }
  }

  // Update building
  if (buildingDead) {
    if (building.type === BuildingType.WATCHTOWER || buildingFaction === Faction.PLAYER) {
      // Watchtowers and player-owned buildings go neutral when destroyed so they can be
      // recaptured (same behaviour as resolveAttackOnBuilding for watchtowers).
      building.hp = building.maxHp;
      building.faction = null;
      building.hasAttackedThisTurn = false;
      building.specialistSlot = null;
      building.turnCapturedByPlayer = null;
      building.wasEnemyOwnedBeforeCapture = false;
      // Grant XP to the enemy unit that counter-killed the player building
      if (defenderFaction === Faction.ENEMY && !defenderDead) {
        grantXp(state, defenderId, XP.DESTROY_BUILDING, suppressFloaters);
      }
      if (buildingFaction === Faction.PLAYER) state.gameStats.buildingsDestroyedByEnemy += 1;
    } else {
      // Enemy buildings are fully destroyed; apply destroy behavior.
      const { x, y } = building.position;
      const destroyBehavior = building.destroyBehavior;
      delete state.buildings[buildingId];
      const tile = state.grid[y][x];
      tile.buildingId = null;
      if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
        tile.isStrongholdRuin = true;
      } else if (destroyBehavior === DestroyBehavior.RUIN) {
        tile.isRuin = true;
      }
      // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally
      if (defenderFaction === Faction.PLAYER) state.gameStats.enemyBuildingsDestroyed += 1;
    }
  } else {
    building.hp = newBuildingHp;
    building.hasAttackedThisTurn = true;
  }

  // Update defender
  if (defenderDead) {
    const defenderTile = state.grid[defender.position.y][defender.position.x];
    if (defenderTile.unitId === defenderId) {
      defenderTile.unitId = null;
    }
    delete state.units[defenderId];
    if (defenderFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
    else if (buildingFaction === Faction.PLAYER) state.gameStats.unitsKilled += 1;

    // If the dead defender was standing on an enemy spawner building, set a spawn
    // cooldown so the player has a window to move onto the tile and capture.
    if (buildingFaction === Faction.PLAYER && defenderFaction === Faction.ENEMY && defenderTile.buildingId) {
      const spawner = state.buildings[defenderTile.buildingId];
      if (spawner && spawner.faction === Faction.ENEMY &&
          (spawner.type === BuildingType.LAVALAIR || spawner.type === BuildingType.INFERNALSANCTUM)) {
        spawner.spawnCooldownRemaining = 1;
      }
    }
  } else {
    defender.stats.currentHp = newDefenderHp;
  }
}

/**
 * Resolves an attack by a unit against a building (e.g. attacking a watchtower).
 * If the building's HP reaches 0, it becomes neutral instead of being destroyed.
 * The building may counter-attack if it has combat stats and the unit is in range.
 */
export function resolveAttackOnBuilding(
  state: Draft<GameState>,
  attackerId: string,
  buildingId: string,
  suppressFloaters?: boolean,
): void {
  const attacker = state.units[attackerId];
  const building = state.buildings[buildingId];

  if (!attacker || !building) return;

  // Capture factions before any mutations
  const attackerFaction = attacker.faction;
  const buildingFaction = building.faction;

  // Capture building position before any mutations (needed for melee advance)
  const buildingPosition = { x: building.position.x, y: building.position.y };

  // Only buildings with combat stats can be attacked / counter-attack
  const buildingCombatant = building.combatStats ? buildingToCombatant(building) : null;

  const attackerCombatant = unitToCombatant(attacker);

  // PHALANX: attacker gains attack bonus from adjacent friendly units
  attackerCombatant.attack += getPhalanxAttackBonus(state, attacker);

  // Calculate combat - if building has combat stats use them for defense, otherwise use 0
  const defenderStats: Combatant = buildingCombatant ?? {
    currentHp: building.hp,
    maxHp: building.maxHp,
    baseMaxHp: building.maxHp,
    attack: 0,
    defense: 0,
    attackRange: 0,
    positionX: building.position.x,
    positionY: building.position.y,
    faction: building.faction ?? Faction.ENEMY,
    tags: building.tags,
  };

  const combatResult = calculateCombatFromStats(attackerCombatant, defenderStats);

  // ASSASSIN: no retaliation damage when ability is activated (building at full HP)
  if (attacker.tags.includes(UnitTag.ASSASSIN) && building.hp === building.maxHp) {
    combatResult.attackerHpLost = 0;
  }

  const newBuildingHp = building.hp - combatResult.defenderHpLost;
  const buildingDead = newBuildingHp <= 0;

  // Building can counter if it has combat stats, survives, and attacker is in its range
  const canCounter = buildingCombatant && !buildingDead && isTileWithinEdgeCircleRange(
    building.position.x, building.position.y,
    attacker.position.x, attacker.position.y,
    buildingCombatant.attackRange,
  );
  const newAttackerHp = canCounter
    ? attacker.stats.currentHp - combatResult.attackerHpLost
    : attacker.stats.currentHp;
  const attackerDead = newAttackerHp <= 0;

  // Update game stats
  if (attackerFaction === Faction.PLAYER) {
    state.gameStats.damageDealt += combatResult.defenderHpLost;
    if (canCounter) state.gameStats.damageReceived += combatResult.attackerHpLost;
  } else if (buildingFaction === Faction.PLAYER) {
    state.gameStats.damageReceived += combatResult.defenderHpLost;
    if (canCounter) state.gameStats.damageDealt += combatResult.attackerHpLost;
  }

  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: building.position.x,
        y: building.position.y,
        isEnemy: building.faction === Faction.ENEMY,
      });
    }
    if (canCounter && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: attacker.position.x,
        y: attacker.position.y,
        isEnemy: attacker.faction === Faction.ENEMY,
      });
    }
  }

  // Update attacker
  if (attackerDead) {
    const attackerTile = state.grid[attacker.position.y][attacker.position.x];
    if (attackerTile.unitId === attackerId) {
      attackerTile.unitId = null;
    }
    delete state.units[attackerId];
    if (attackerFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
  } else {
    attacker.stats.currentHp = newAttackerHp;
    attacker.hasAttackedThisTurn = true;
  }

  // Update building
  if (buildingDead) {
    // Capture building faction before any mutations
    const previousBuildingFaction = buildingFaction;
    if (building.type === BuildingType.WATCHTOWER) {
      // Watchtower goes neutral at 0 HP
      building.hp = building.maxHp;
      building.faction = null;
      building.hasAttackedThisTurn = false;
      building.specialistSlot = null;
      building.turnCapturedByPlayer = null;
      building.wasEnemyOwnedBeforeCapture = false;
      // Grant XP to player attacker when enemy watchtower goes neutral
      if (!attackerDead && attackerFaction === Faction.PLAYER && previousBuildingFaction === Faction.ENEMY) {
        grantXp(state, attackerId, XP.DESTROY_BUILDING, suppressFloaters);
        state.gameStats.enemyBuildingsDestroyed += 1;
      }
    } else if (attackerFaction === Faction.PLAYER && previousBuildingFaction === Faction.ENEMY) {
      // Enemy building destroyed by player unit: remove from state; apply destroy behavior
      const { x, y } = building.position;
      const destroyBehavior = building.destroyBehavior;
      delete state.buildings[buildingId];
      const tile = state.grid[y][x];
      tile.buildingId = null;
      if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
        tile.isStrongholdRuin = true;
      } else if (destroyBehavior === DestroyBehavior.RUIN) {
        tile.isRuin = true;
      }
      // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally
      // Grant XP to player attacker for destroying enemy building
      if (!attackerDead) {
        grantXp(state, attackerId, XP.DESTROY_BUILDING, suppressFloaters);
      }
      state.gameStats.enemyBuildingsDestroyed += 1;
    } else if (attackerFaction === Faction.ENEMY && previousBuildingFaction === Faction.PLAYER) {
      // Player building (e.g. outpost) destroyed by enemy unit: remove from state; apply destroy behavior.
      // Player buildings with combatStats (outposts) may be attacked and must be properly removed so that
      // the melee advance below does not place the enemy unit onto an occupied building tile.
      const { x, y } = building.position;
      const destroyBehavior = building.destroyBehavior;
      delete state.buildings[buildingId];
      const tile = state.grid[y][x];
      tile.buildingId = null;
      if (destroyBehavior === DestroyBehavior.STRONGHOLD_RUIN) {
        tile.isStrongholdRuin = true;
      } else if (destroyBehavior === DestroyBehavior.RUIN) {
        tile.isRuin = true;
      }
      // DestroyBehavior.NONE / DestroyBehavior.RESOURCE: no ruin — terrain is restored naturally
    }
  } else {
    building.hp = newBuildingHp;
  }

  // Melee attacker advances onto the tile the destroyed building occupied
  // (unless the tile is impassable — canyon / water)
  if (buildingDead && !attackerDead) {
    const attackerUnit = state.units[attackerId];
    const targetTerrain = state.grid[buildingPosition.y][buildingPosition.x].terrainType;
    if (
      attackerUnit &&
      !attackerUnit.tags.includes(UnitTag.RANGED) &&
      targetTerrain !== TileType.CANYON &&
      targetTerrain !== TileType.WATER
    ) {
      const fromTile = state.grid[attackerUnit.position.y][attackerUnit.position.x];
      if (fromTile.unitId === attackerId) {
        fromTile.unitId = null;
      }
      const toTile = state.grid[buildingPosition.y][buildingPosition.x];
      toTile.unitId = attackerId;
      attackerUnit.position.x = buildingPosition.x;
      attackerUnit.position.y = buildingPosition.y;
    }
  }
}

/**
 * Resolves an attack by a player building (e.g. watchtower) against an enemy building.
 * The target building may counter-attack if it has combat stats and the attacker is in range.
 * If the target building's HP reaches 0, it becomes neutral (same behaviour as watchtower).
 */
export function resolveBuildingAttackOnBuilding(
  state: Draft<GameState>,
  attackingBuildingId: string,
  targetBuildingId: string,
  suppressFloaters?: boolean,
): void {
  const attackingBuilding = state.buildings[attackingBuildingId];
  const targetBuilding = state.buildings[targetBuildingId];

  if (!attackingBuilding || !attackingBuilding.combatStats || !attackingBuilding.faction) return;
  if (!targetBuilding) return;

  const attackingFaction = attackingBuilding.faction;
  const targetFaction = targetBuilding.faction;

  const attackingCombatant = buildingToCombatant(attackingBuilding)!;
  const targetCombatant: Combatant = targetBuilding.combatStats
    ? buildingToCombatant(targetBuilding)!
    : {
        currentHp: targetBuilding.hp,
        maxHp: targetBuilding.maxHp,
        baseMaxHp: targetBuilding.maxHp,
        attack: 0,
        defense: 0,
        attackRange: 0,
        positionX: targetBuilding.position.x,
        positionY: targetBuilding.position.y,
        faction: targetBuilding.faction ?? Faction.ENEMY,
        tags: targetBuilding.tags,
      };

  const combatResult = calculateCombatFromStats(attackingCombatant, targetCombatant);

  const newTargetHp = targetBuilding.hp - combatResult.defenderHpLost;
  const targetDead = newTargetHp <= 0;

  // Target building can counter-attack if it has combat stats, survives, and attacker is in range
  const canCounter = targetBuilding.combatStats && !targetDead && isTileWithinEdgeCircleRange(
    targetBuilding.position.x, targetBuilding.position.y,
    attackingBuilding.position.x, attackingBuilding.position.y,
    targetBuilding.combatStats.attackRange,
  );
  const newAttackingHp = canCounter
    ? attackingBuilding.hp - combatResult.attackerHpLost
    : attackingBuilding.hp;
  const attackingDead = newAttackingHp <= 0;

  // Update game stats
  if (attackingFaction === Faction.PLAYER && targetFaction === Faction.ENEMY) {
    state.gameStats.damageDealt += combatResult.defenderHpLost;
    if (canCounter) state.gameStats.damageReceived += combatResult.attackerHpLost;
  } else if (attackingFaction === Faction.ENEMY && targetFaction === Faction.PLAYER) {
    state.gameStats.damageReceived += combatResult.defenderHpLost;
    if (canCounter) state.gameStats.damageDealt += combatResult.attackerHpLost;
  }

  if (!suppressFloaters) {
    const { addFloater } = useFloaterStore.getState();
    if (combatResult.defenderHpLost > 0) {
      addFloater({
        value: combatResult.defenderHpLost,
        x: targetBuilding.position.x,
        y: targetBuilding.position.y,
        isEnemy: targetBuilding.faction === Faction.ENEMY,
      });
    }
    if (canCounter && combatResult.attackerHpLost > 0) {
      addFloater({
        value: combatResult.attackerHpLost,
        x: attackingBuilding.position.x,
        y: attackingBuilding.position.y,
        isEnemy: attackingBuilding.faction === Faction.ENEMY,
      });
    }
  }

  // Update attacking building
  if (attackingDead) {
    // Attacking building goes neutral when HP reaches 0
    attackingBuilding.hp = attackingBuilding.maxHp;
    attackingBuilding.faction = null;
    attackingBuilding.hasAttackedThisTurn = false;
    attackingBuilding.specialistSlot = null;
    attackingBuilding.turnCapturedByPlayer = null;
    attackingBuilding.wasEnemyOwnedBeforeCapture = false;
    if (attackingFaction === Faction.PLAYER) state.gameStats.buildingsDestroyedByEnemy += 1;
  } else {
    attackingBuilding.hp = newAttackingHp;
    attackingBuilding.hasAttackedThisTurn = true;
  }

  // Update target building
  if (targetDead) {
    // Target building goes neutral at 0 HP (so it can be captured)
    targetBuilding.hp = targetBuilding.maxHp;
    targetBuilding.faction = null;
    targetBuilding.hasAttackedThisTurn = false;
    targetBuilding.specialistSlot = null;
    targetBuilding.turnCapturedByPlayer = null;
    targetBuilding.wasEnemyOwnedBeforeCapture = false;
    if (!attackingDead && attackingFaction === Faction.PLAYER && targetFaction === Faction.ENEMY) {
      state.gameStats.enemyBuildingsDestroyed += 1;
    }
  } else {
    targetBuilding.hp = newTargetHp;
  }
}
