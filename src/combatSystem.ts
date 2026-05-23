/**
 * Combat system module for Volcanae.
 * Implements Polytopia-style combat formulas and resolution logic.
 * Supports both unit-vs-unit and building-vs-unit combat.
 */

import type { Unit, Building, GameState, Tile } from './types';
import type { Draft } from 'immer';
import { BuildingType, Faction, UnitTag, UnitType, TechFlag, TileType, TileStatus, DestroyBehavior } from './types';
import { useFloaterStore } from './floaterStore';
import type { GameEvent } from './gameEvents';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { UNIT_DEFINITIONS, XP, ABILITIES, MAP, BUILDING_DEFINITIONS, MAGE, CLEAVE_DAMAGE_MULTIPLIER, PIERCE_PRIMARY_DAMAGE_MULTIPLIER, RAGE_ATK_PER_ADJACENT, RAGE_MAX_ADJACENT_COUNT, BLOCK_MELEE_DAMAGE_MULTIPLIER, IRONBLOOD_SUMMONED_DAMAGE_MULTIPLIER, PUNCTURE_STUN_BASE_DEF_THRESHOLD, PUNCTURE_STUN_DURATION } from './gameConfig';
import { grantXp } from './levelSystem';
import { generateId } from './mapGenerator';
import { isUnitOnCorruptedTile, applyTileStatus } from './tileStatusSystem';

// Counter for generating unique gravestone building IDs within this module
let combatSystemIdCounter = 0;
function generateCombatBuildingId(): string {
  return `building_grave_${Date.now()}_${++combatSystemIdCounter}`;
}

/**
 * Returns true if the given tile is a valid spawn location for a Gravestone.
 * The tile must be free of buildings, units, ruin flags, impassable terrain,
 * and lava. Forests, water, and canyons are explicitly excluded.
 */
function isValidGravestoneTile(tile: Tile): boolean {
  return (
    !tile.buildingId &&
    !tile.unitId &&
    !tile.isRuin &&
    !tile.isStrongholdRuin &&
    !tile.isLava &&
    tile.terrainType !== TileType.FOREST &&
    tile.terrainType !== TileType.MOUNTAIN &&
    (tile.terrainType !== TileType.WATER || tile.status === TileStatus.FROZEN) &&
    tile.terrainType !== TileType.CANYON
  );
}

/**
 * Returns true iff a Gravestone should be created on a unit's tile when
 * that unit dies.
 *
 * A unit qualifies when it is a player unit (not SUMMONED, not NO_GRAVESTONE)
 * and carries either the LEAVES_GRAVESTONE tag (granted by the Necromancer
 * tech tree) or the REVIVABLE tag (granted by the Deathmender specialist).
 *
 * @param unit     - Faction and tags of the dying unit.
 * @param options  - `defaultOn`: if true, any otherwise-eligible unit qualifies.
 */
export function shouldLeaveGravestone(
  unit: Pick<Unit, 'faction' | 'tags'>,
  options: { defaultOn: boolean },
): boolean {
  if (unit.faction !== Faction.PLAYER) return false;
  if (unit.tags.includes(UnitTag.SUMMONED)) return false;
  if (unit.tags.includes(UnitTag.NO_GRAVESTONE)) return false;
  if (options.defaultOn) return true;
  return unit.tags.includes(UnitTag.LEAVES_GRAVESTONE) || unit.tags.includes(UnitTag.REVIVABLE);
}

/**
 * Creates a Gravestone at a position if the tile is valid.
 */
export function createGravestoneAt(
  state: Draft<GameState>,
  position: { x: number; y: number },
  gravesUnitType: UnitType | null,
): void {
  const tile = state.grid[position.y]?.[position.x];
  if (!tile || !isValidGravestoneTile(tile)) return;
  const graveId = generateCombatBuildingId();
  state.buildings[graveId] = {
    id: graveId,
    type: BuildingType.GRAVESTONE,
    faction: Faction.PLAYER,
    position: { x: position.x, y: position.y },
    hp: ABILITIES.GRAVESTONE_MAX_HP,
    maxHp: ABILITIES.GRAVESTONE_MAX_HP,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDING_DEFINITIONS.GRAVESTONE.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: BUILDING_DEFINITIONS.GRAVESTONE.destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    gravesUnitType,
  };
  tile.buildingId = graveId;
}

/**
 * Handles the death of a BRANDMARKED player unit.
 * Stage 1: sets HP to 0 (un-targetable) and queues the unit for a
 * deferred demon-spawn in `pendingBrandmarkTransforms`. The actual unit
 * removal and Ember Demon spawn happen via `finalizeBrandmarkTransforms`
 * once the TRANSFORM_TO_DEMON animation completes.
 *
 * Called both from the per-turn brandmark tick (gameStore.ts) and from
 * combat kill paths when a BRANDMARKED unit is killed by an enemy.
 */
export function handleBrandmarkedUnitDeath(
  state: Draft<GameState>,
  unit: Unit,
): void {
  const pos = { x: unit.position.x, y: unit.position.y };
  const unitId = unit.id;

  // Stage 1: set HP to 0 so the unit is un-targetable, but keep it in state
  // for the transform animation. The caller must NOT delete the unit.
  unit.stats.currentHp = 0;

  // Push to deferred transform queue (guard against duplicates)
  const alreadyQueued = state.pendingBrandmarkTransforms.some(
    (t) => t.unitId === unitId,
  );
  if (!alreadyQueued) {
    state.pendingBrandmarkTransforms.push({ unitId, position: { ...pos } });
  }
}

/**
 * Finds the best available spawn position for an Ember Demon near `origin`.
 * Tries the origin tile first, then the four cardinal adjacent tiles.
 * Returns `null` if no free tile is found.
 */
export function findEmberDemonSpawnPos(
  state: Draft<GameState>,
  origin: { x: number; y: number },
): { x: number; y: number } | null {
  const originTile = state.grid[origin.y]?.[origin.x];
  if (originTile && !originTile.unitId && !originTile.isLava) {
    return { ...origin };
  }
  const adjacents = [
    { x: origin.x - 1, y: origin.y },
    { x: origin.x + 1, y: origin.y },
    { x: origin.x, y: origin.y - 1 },
    { x: origin.x, y: origin.y + 1 },
  ];
  for (const adj of adjacents) {
    if (adj.x < 0 || adj.y < 0 || adj.x >= (state.grid[0]?.length ?? 0) || adj.y >= state.grid.length) continue;
    const t = state.grid[adj.y]?.[adj.x];
    if (t && !t.unitId && !t.isLava) return adj;
  }
  return null;
}

/**
 * Spawns a hostile (enemy-faction) Ember Demon at `spawnPos`.
 * The demon starts with all actions spent (exhausted for this turn).
 */
export function spawnEnemyEmberDemon(
  state: Draft<GameState>,
  spawnPos: { x: number; y: number },
): void {
  const newId = generateId('unit_demon');
  state.units[newId] = {
    id: newId,
    type: UnitType.EMBER_DEMON,
    faction: Faction.ENEMY,
    position: { x: spawnPos.x, y: spawnPos.y },
    stats: {
      currentHp: UNIT_DEFINITIONS.EMBER_DEMON.maxHp,
      maxHp: UNIT_DEFINITIONS.EMBER_DEMON.maxHp,
      attack: UNIT_DEFINITIONS.EMBER_DEMON.attack,
      defense: UNIT_DEFINITIONS.EMBER_DEMON.defense,
      moveRange: UNIT_DEFINITIONS.EMBER_DEMON.moveRange,
      attackRange: UNIT_DEFINITIONS.EMBER_DEMON.attackRange,
      discoverRadius: UNIT_DEFINITIONS.EMBER_DEMON.discoverRadius,
      triggerRange: UNIT_DEFINITIONS.EMBER_DEMON.triggerRange,
      movementActions: 1,
    },
    tags: [UnitTag.LAVA],
    controllerMageId: null,
    hasMovedThisTurn: true,
    hasAttackedThisTurn: true,
    hasCapturedThisTurn: true,
    hasConstructedThisTurn: true,
    hasDestroyedThisTurn: true,
    hasUsedPostAttackMoveThisTurn: false,
    hasCastThisTurn: false,
    bloodlustAttackAvailable: false,
    pinnedUntilTurn: 0,
    xp: 0,
    level: 1,
    lastMovedTurn: state.turn,
    distractionDefPenalty: 0,
  };
  state.grid[spawnPos.y][spawnPos.x].unitId = newId;
}

/**
 * Immediately removes a dead BRANDMARKED player unit and spawns a hostile Ember Demon.
 * Used during combat resolution (enemy attacks, building attacks) so that the fully
 * resolved state has the demon already placed — avoiding 0-HP zombie units surviving
 * in the resolved state and an incorrectly-timed transform animation.
 *
 * The demon is placed on the original tile if free, otherwise tries the four cardinal
 * adjacent tiles. If no free tile can be found, the demon is not spawned.
 */
export function completeBrandmarkTransformInPlace(
  state: Draft<GameState>,
  unitId: string,
  position: { x: number; y: number },
): void {
  const tile = state.grid[position.y]?.[position.x];
  if (tile && tile.unitId === unitId) tile.unitId = null;
  delete state.units[unitId];
  state.gameStats.unitsLost += 1;

  const spawnPos = findEmberDemonSpawnPos(state, position);
  if (spawnPos) spawnEnemyEmberDemon(state, spawnPos);
}

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
  // CORRUPTED tile: this unit receives no PHALANX defense bonus from any ally.
  if (isUnitOnCorruptedTile(state, unit.id)) return 0;
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
      // CORRUPTED: an ally on a corrupted tile contributes no PHALANX defense bonus.
      if (isUnitOnCorruptedTile(state, other.id)) continue;
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
  // CORRUPTED tile: this unit receives no PHALANX attack bonus.
  if (isUnitOnCorruptedTile(state, unit.id)) return 0;
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
      // CORRUPTED: an ally on a corrupted tile contributes no PHALANX attack bonus.
      if (isUnitOnCorruptedTile(state, other.id)) continue;
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
  suppressFloaters?: boolean,
  outEvents?: GameEvent[],
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

  // Capture positions before they are potentially mutated by melee-advance or unit removal
  const attackerPosition = { x: attacker.position.x, y: attacker.position.y };
  const defenderPosition = { x: defender.position.x, y: defender.position.y };

  // Calculate combat result (with HOLD_GROUND defense bonus if applicable)
  const attackerCombatant = unitToCombatant(attacker);
  const defenderCombatant = unitToCombatant(defender);

  // Compute once: whether the attacker is standing on a CORRUPTED tile.
  // Used to suppress specific tag effects below (see §5.1).
  const attackerOnCorrupted = isUnitOnCorruptedTile(state, attackerId);

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

  // LANCE_CHARGE: attacker gains attack bonus when it has not yet moved this turn.
  // Suppressed on CORRUPTED tile.
  if (attacker.tags.includes(UnitTag.LANCE_CHARGE) && !attacker.hasMovedThisTurn && !attackerOnCorrupted) {
    attackerCombatant.attack += ABILITIES.LANCE_CHARGE_ATTACK_BONUS;
  }

  // ASSASSIN: bonus damage vs. full-HP targets is suppressed on CORRUPTED tile.
  // Strip the tag from the combatant so `calculateCombatFromStats` does not apply the multiplier.
  if (attackerOnCorrupted) {
    attackerCombatant.tags = attackerCombatant.tags.filter(t => t !== UnitTag.ASSASSIN);
  }

  // BLOODLUST: second attack uses half the normal attack value and deals no retaliation.
  // Applied before PHALANX bonuses intentionally — PHALANX bonus is added to the
  // already-halved value, keeping the second attack weaker than full PHALANX output.
  const isBloodlustAttack = !!attacker.bloodlustAttackAvailable;
  if (isBloodlustAttack) {
    attackerCombatant.attack = Math.floor(attackerCombatant.attack / 2);
  }

  // PHALANX: attacker gains attack bonus, defender gains defense bonus
  attackerCombatant.attack += getPhalanxAttackBonus(state, attacker);
  defenderCombatant.defense += getPhalanxDefenseBonus(state, defender);

  // RAGE: attacker gains +ATK per adjacent enemy unit, capped at RAGE_MAX_ADJACENT_COUNT.
  // Suppressed on CORRUPTED tile.
  if (attacker.tags.includes(UnitTag.RAGE) && !attackerOnCorrupted) {
    let adjacentEnemyCount = 0;
    for (const otherId of Object.keys(state.units)) {
      const other = state.units[otherId];
      if (!other || other.faction === attacker.faction) continue;
      if (!isTileWithinEdgeCircleRange(attacker.position.x, attacker.position.y, other.position.x, other.position.y, 1)) continue;
      adjacentEnemyCount++;
    }
    attackerCombatant.attack += Math.min(adjacentEnemyCount, RAGE_MAX_ADJACENT_COUNT) * RAGE_ATK_PER_ADJACENT;
  }

  // PUNCTURE: bypass all defensive bonuses — reset defender's effective defense to
  // the raw base stat, ignoring PHALANX, HOLD_GROUND, and any other bonuses added above.
  // Suppressed on CORRUPTED tile.
  if (attacker.tags.includes(UnitTag.PUNCTURE) && !attackerOnCorrupted) {
    const bonusPresent = defenderCombatant.defense > defender.stats.defense;
    defenderCombatant.defense = defender.stats.defense;
    if (bonusPresent) {
      outEvents?.push({
        type: 'DEFENSE_BONUS_IGNORED',
        attackerId: attacker.id,
        defenderId: defender.id,
        defenderPosition: { x: defender.position.x, y: defender.position.y },
      });
    }
  }

  const combatResult = calculateCombatFromStats(attackerCombatant, defenderCombatant);

  // ASSASSIN: no retaliation damage when ability is activated (defender at full HP).
  // The ability is already suppressed on CORRUPTED tile (tag stripped from combatant above).
  if (attacker.tags.includes(UnitTag.ASSASSIN) && !attackerOnCorrupted && defender.stats.currentHp === defender.stats.maxHp) {
    combatResult.attackerHpLost = 0;
  }

  // COVER: attacker never suffers counter-damage
  if (attacker.tags.includes(UnitTag.COVER)) {
    combatResult.attackerHpLost = 0;
  }

  // BLOODLUST second attack: never triggers retaliation
  if (isBloodlustAttack) {
    combatResult.attackerHpLost = 0;
  }

  // PIERCE: store full (pre-multiplier) primary damage for the rear-unit hit, then
  // reduce damage to the primary defender by PIERCE_PRIMARY_DAMAGE_MULTIPLIER.
  // Suppressed on CORRUPTED tile.
  const fullPrimaryDamage = combatResult.defenderHpLost;
  if (attacker.tags.includes(UnitTag.PIERCE) && !attackerOnCorrupted) {
    combatResult.defenderHpLost = Math.floor(combatResult.defenderHpLost * PIERCE_PRIMARY_DAMAGE_MULTIPLIER);
  }

  // BLOCK: defender takes halved damage from melee attackers (attackRange === 1).
  // NOT suppressed on corrupted tiles — defensive self-property.
  if (defender.tags.includes(UnitTag.BLOCK) && attacker.stats.attackRange === 1) {
    combatResult.defenderHpLost = Math.floor(combatResult.defenderHpLost * BLOCK_MELEE_DAMAGE_MULTIPLIER);
  }

  // IRONBLOOD: defender takes reduced damage from SUMMONED attackers.
  // NOT suppressed on corrupted tiles — defensive self-property.
  if (defender.tags.includes(UnitTag.IRONBLOOD) && attacker.tags.includes(UnitTag.SUMMONED)) {
    combatResult.defenderHpLost = Math.floor(combatResult.defenderHpLost * IRONBLOOD_SUMMONED_DAMAGE_MULTIPLIER);
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
    // Capture tags and position before removal (for BRANDMARKED and GRAVESTONE checks)
    const attackerTags = [...attacker.tags];
    const attackerType = attacker.type;
    const attackerPos = { x: attacker.position.x, y: attacker.position.y };
    if (attackerTags.includes(UnitTag.BRANDMARKED)) {
      // BRANDMARKED: immediately complete the transform so the resolved state is clean.
      completeBrandmarkTransformInPlace(state, attackerId, attackerPos);
    } else {
      // Remove attacker from grid
      const attackerTile = state.grid[attackerPos.y][attackerPos.x];
      if (attackerTile.unitId === attackerId) {
        attackerTile.unitId = null;
      }
      // Remove attacker from units
      delete state.units[attackerId];
      // Update kill/loss stats
      if (attackerFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
      else if (defenderFaction === Faction.PLAYER) state.gameStats.unitsKilled += 1;
      // When a player unit with the right conditions dies from a counter-attack,
      // leave a Gravestone on their tile.
      if (shouldLeaveGravestone(
        { faction: attackerFaction, tags: attackerTags },
        { defaultOn: false },
      )) {
        createGravestoneAt(state, attackerPos, attackerType);
      }
    }
    // Grant XP to defender for killing the attacker (regardless of BRANDMARKED)
    grantXp(state, defenderId, XP.KILL_UNIT, suppressFloaters);
  } else {
    // Update attacker HP and mark as acted
    attacker.stats.currentHp = newAttackerHp;
    attacker.hasAttackedThisTurn = true;

    // BLOODLUST: clear the pending second-attack flag after it is used
    if (isBloodlustAttack) {
      attacker.bloodlustAttackAvailable = false;
    }
  }

  // Update defender
  if (defenderDead) {
    // Capture the defender's type and tags before removal for BLOODLUST, REVIVABLE, and BRANDMARKED checks
    const defenderType = defender.type;
    const defenderTags = [...defender.tags];

    if (defenderTags.includes(UnitTag.BRANDMARKED)) {
      // BRANDMARKED: immediately complete the transform so the resolved state is clean.
      completeBrandmarkTransformInPlace(state, defenderId, { x: defender.position.x, y: defender.position.y });
    } else {
      // Remove defender from grid
      const defenderTile = state.grid[defender.position.y][defender.position.x];
      if (defenderTile.unitId === defenderId) {
        defenderTile.unitId = null;
      }
      // Remove defender from units
      delete state.units[defenderId];
      // Update kill/loss stats
      if (defenderFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
      else if (attackerFaction === Faction.PLAYER) state.gameStats.unitsKilled += 1;
    }

    // Grant XP to attacker for killing the defender (regardless of BRANDMARKED)
    if (!attackerDead) {
      grantXp(state, attackerId, XP.KILL_UNIT, suppressFloaters);
    }

    // EMBER_DEMON kill: grant crystal reward when player kills a hostile Ember Demon
    if (attackerFaction === Faction.PLAYER && defenderFaction === Faction.ENEMY && defenderType === UnitType.EMBER_DEMON) {
      state.arcaneCrystals += MAGE.EMBER_DEMON_KILL_CRYSTAL_REWARD;
    }

    // BLOODLUST: when a (non-bloodlust) attack kills an enemy, grant a second
    // attack at half power. Only one bloodlust charge per turn.
    // Suppressed on CORRUPTED tile.
    if (
      !attackerDead &&
      !isBloodlustAttack &&
      attacker.tags.includes(UnitTag.BLOODLUST) &&
      !attackerOnCorrupted &&
      defenderFaction === Faction.ENEMY &&
      attackerFaction === Faction.PLAYER
    ) {
      const attackerUnit = state.units[attackerId];
      if (attackerUnit) {
        attackerUnit.hasAttackedThisTurn = false;
        attackerUnit.bloodlustAttackAvailable = true;
        // Block all non-attack actions so the bloodlust charge only grants
        // a second attack, not the ability to capture or construct.
        attackerUnit.hasCapturedThisTurn = true;
        attackerUnit.hasConstructedThisTurn = true;
        attackerUnit.hasDestroyedThisTurn = true;
      }
    }

    // When a player unit with the right conditions dies, leave a Gravestone on their tile.
    // Summoned and NO_GRAVESTONE units never leave gravestones.
    // BRANDMARKED units are handled separately above (deferred via pendingBrandmarkTransforms).
    if (!defenderTags.includes(UnitTag.BRANDMARKED)) {
      if (shouldLeaveGravestone(
        { faction: defenderFaction, tags: defenderTags },
        { defaultOn: false },
      )) {
        createGravestoneAt(state, defenderPosition, defenderType);
      }
    }

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
            bld.type !== BuildingType.INFERNALSANCTUM &&
            bld.type !== BuildingType.EMBERNEST
          ) {
            // Other enemy buildings (but NOT spawners or corrupted terrain) are destroyed
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
          // LAVALAIR / INFERNALSANCTUM / EMBERNEST: remain as enemy buildings.
          // Set a spawn cooldown so the building skips one spawn cycle,
          // giving the player a turn to move onto the tile and capture.
          if (bld.type === BuildingType.LAVALAIR || bld.type === BuildingType.INFERNALSANCTUM || bld.type === BuildingType.EMBERNEST) {
            bld.spawnCooldownRemaining = 1;
          }
        }
      }
    }
  } else {
    // Update defender HP
    defender.stats.currentHp = newDefenderHp;

    // DISTRACTION: permanently reduce defender's DEF on each hit.
    // Suppressed on CORRUPTED tile.
    if (attacker.tags.includes(UnitTag.DISTRACTION) && !attackerOnCorrupted) {
      const reduction = Math.min(ABILITIES.DISTRACTION_DEF_REDUCTION, defender.stats.defense);
      defender.stats.defense -= reduction;
      defender.distractionDefPenalty += reduction;
    }

    // PIN_DOWN: stun the defender with a configurable chance (prevents move + attack).
    // Suppressed on CORRUPTED tile. ALERT-tagged units are immune to stun.
    if (attacker.tags.includes(UnitTag.PIN_DOWN) && !attackerOnCorrupted && Math.random() < ABILITIES.PIN_DOWN_STUN_CHANCE) {
      if (!defender.tags.includes(UnitTag.ALERT)) {
        defender.pinnedUntilTurn = state.turn;
      } else {
        outEvents?.push({
          type: 'STUN_BLOCKED',
          unitId: defender.id,
          position: { x: defender.position.x, y: defender.position.y },
          source: 'PIN_DOWN',
          reason: 'ALERT',
        });
      }
    }

    // PUNCTURE: stun the defender for PUNCTURE_STUN_DURATION turns when its base DEF
    // exceeds PUNCTURE_STUN_BASE_DEF_THRESHOLD. Uses raw stats.defense (base value),
    // consistent with the DEF-bypass above. ALERT defenders are immune to the stun
    // but still receive the DEF-bypass damage reduction.
    // Suppressed on CORRUPTED tile.
    if (
      attacker.tags.includes(UnitTag.PUNCTURE) &&
      !attackerOnCorrupted &&
      defender.stats.defense > PUNCTURE_STUN_BASE_DEF_THRESHOLD
    ) {
      if (!defender.tags.includes(UnitTag.ALERT)) {
        defender.pinnedUntilTurn = state.turn + PUNCTURE_STUN_DURATION;
      } else {
        outEvents?.push({
          type: 'STUN_BLOCKED',
          unitId: defender.id,
          position: { x: defender.position.x, y: defender.position.y },
          source: 'PUNCTURE',
          reason: 'ALERT',
        });
      }
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
      // Mark the attacker as having moved this turn so the cave-popup eligibility
      // check in selectUnit / the HUD useEffect treats this as "just arrived" and
      // does not open the popup on the same turn as the melee advance.
      if (attackerFaction === Faction.PLAYER) {
        attackerUnit.lastMovedTurn = state.turn;
      }
    }
  }

  // SPLASH: player siege unit deals 25% of dealt damage to all surrounding enemy units.
  // Suppressed on CORRUPTED tile.
  if (
    !attackerDead &&
    !attackerOnCorrupted &&
    attackerFaction === Faction.PLAYER &&
    attacker.tags.includes(UnitTag.SPLASH) &&
    combatResult.defenderHpLost > 0
  ) {
    const splashDamage = Math.max(1, Math.round(combatResult.defenderHpLost * ABILITIES.SPLASH_DAMAGE_RATIO));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue; // skip the primary target tile
        const nx = defenderPosition.x + dx;
        const ny = defenderPosition.y + dy;
        if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
        const splashTile = state.grid[ny]?.[nx];
        if (!splashTile?.unitId) continue;
        const splashTarget = state.units[splashTile.unitId];
        if (!splashTarget || splashTarget.faction !== Faction.ENEMY) continue;
        const splashTargetId = splashTile.unitId;
        const newSplashHp = splashTarget.stats.currentHp - splashDamage;
        if (!suppressFloaters) {
          const { addFloater } = useFloaterStore.getState();
          addFloater({ value: splashDamage, x: nx, y: ny, isEnemy: true });
        }
        outEvents?.push({
          type: 'SPLASH_DAMAGE',
          unitId: splashTargetId,
          position: { x: nx, y: ny },
          amount: splashDamage,
          isEnemy: true,
        });
        if (newSplashHp <= 0) {
          splashTile.unitId = null;
          delete state.units[splashTargetId];
          grantXp(state, attackerId, XP.KILL_UNIT, suppressFloaters);
          state.gameStats.unitsKilled += 1;
          outEvents?.push({
            type: 'UNIT_DEATH',
            unitId: splashTargetId,
            position: { x: nx, y: ny },
            faction: splashTarget.faction,
          });
        } else {
          splashTarget.stats.currentHp = newSplashHp;
        }
      }
    }
  }

  // CLEAVE: deal AoE damage (CLEAVE_DAMAGE_MULTIPLIER × primary damage) to all enemy units
  // on tiles adjacent to BOTH attacker AND defender. Ignores PHALANX bonus (uses raw defense).
  // Suppressed on CORRUPTED tile.
  if (
    !attackerDead &&
    !attackerOnCorrupted &&
    attacker.tags.includes(UnitTag.CLEAVE) &&
    combatResult.defenderHpLost > 0
  ) {
    const cleaveDamage = Math.floor(combatResult.defenderHpLost * CLEAVE_DAMAGE_MULTIPLIER);
    if (cleaveDamage > 0) {
      for (let cy = 0; cy < state.grid.length; cy++) {
        for (let cx = 0; cx < state.grid[cy].length; cx++) {
          if (cx === attackerPosition.x && cy === attackerPosition.y) continue;
          if (cx === defenderPosition.x && cy === defenderPosition.y) continue;
          if (!isTileWithinEdgeCircleRange(attackerPosition.x, attackerPosition.y, cx, cy, 1)) continue;
          if (!isTileWithinEdgeCircleRange(defenderPosition.x, defenderPosition.y, cx, cy, 1)) continue;
          const cleaveTile = state.grid[cy]?.[cx];
          if (!cleaveTile?.unitId) continue;
          const cleaveTargetId = cleaveTile.unitId;
          const cleaveTarget = state.units[cleaveTargetId];
          if (!cleaveTarget || cleaveTarget.faction === attacker.faction) continue;
          // CLEAVE ignores PHALANX — use stats.defense (raw runtime defense) which does NOT
          // include the PHALANX bonus; that bonus is only added to defenderCombatant during
          // the primary combat calculation via getPhalanxDefenseBonus.
          // Minimum 1 ensures the tag is always meaningful even against high-defense targets.
          const finalCleaveDamage = Math.max(1, cleaveDamage - cleaveTarget.stats.defense);
          const newCleaveHp = cleaveTarget.stats.currentHp - finalCleaveDamage;
          if (!suppressFloaters) {
            const { addFloater } = useFloaterStore.getState();
            addFloater({ value: finalCleaveDamage, x: cx, y: cy, isEnemy: cleaveTarget.faction === Faction.ENEMY });
          }
          outEvents?.push({
            type: 'CLEAVE_DAMAGE',
            unitId: cleaveTargetId,
            position: { x: cx, y: cy },
            amount: finalCleaveDamage,
            isEnemy: cleaveTarget.faction === Faction.ENEMY,
            attackerPosition: { ...attackerPosition },
          });
          if (newCleaveHp <= 0) {
            cleaveTile.unitId = null;
            delete state.units[cleaveTargetId];
            if (cleaveTarget.faction === Faction.PLAYER) state.gameStats.unitsLost += 1;
            else if (attacker.faction === Faction.PLAYER) state.gameStats.unitsKilled += 1;
            grantXp(state, attackerId, XP.KILL_UNIT, suppressFloaters);
            outEvents?.push({
              type: 'UNIT_DEATH',
              unitId: cleaveTargetId,
              position: { x: cx, y: cy },
              faction: cleaveTarget.faction,
            });
          } else {
            cleaveTarget.stats.currentHp = newCleaveHp;
          }
        }
      }
    }
  }

  // PIERCE secondary: deal the full (pre-multiplier) primary damage to the unit or building
  // on the tile directly behind the defender (relative to the attacker).
  // Applies regardless of faction — PIERCE is geometric, not faction-aware.
  // WARNING: this includes intentional friendly-fire. A PIERCE attacker can harm its own
  // allies if they stand directly behind the primary defender.
  // Suppressed on CORRUPTED tile.
  if (
    !attackerDead &&
    !attackerOnCorrupted &&
    attacker.tags.includes(UnitTag.PIERCE)
  ) {
    const dx = defenderPosition.x - attackerPosition.x;
    const dy = defenderPosition.y - attackerPosition.y;
    const behindPos = { x: defenderPosition.x + dx, y: defenderPosition.y + dy };
    if (
      behindPos.y >= 0 && behindPos.y < state.grid.length &&
      behindPos.x >= 0 && behindPos.x < state.grid[behindPos.y].length
    ) {
      const behindTile = state.grid[behindPos.y][behindPos.x];
      if (behindTile.unitId) {
        const rearUnit = state.units[behindTile.unitId];
        if (rearUnit) {
          const rearUnitId = behindTile.unitId;
          const finalPierceDamage = Math.max(1, fullPrimaryDamage - rearUnit.stats.defense);
          const newRearHp = rearUnit.stats.currentHp - finalPierceDamage;
          if (!suppressFloaters) {
            const { addFloater } = useFloaterStore.getState();
            addFloater({ value: finalPierceDamage, x: behindPos.x, y: behindPos.y, isEnemy: rearUnit.faction === Faction.ENEMY });
          }
          outEvents?.push({
            type: 'PIERCE_DAMAGE',
            unitId: rearUnitId,
            buildingId: null,
            position: { ...behindPos },
            amount: finalPierceDamage,
            isEnemy: rearUnit.faction === Faction.ENEMY,
            attackerPosition: { ...attackerPosition },
            primaryDefenderPosition: { ...defenderPosition },
          });
          if (newRearHp <= 0) {
            behindTile.unitId = null;
            delete state.units[rearUnitId];
            if (rearUnit.faction === Faction.PLAYER) state.gameStats.unitsLost += 1;
            else if (attacker.faction === Faction.PLAYER) state.gameStats.unitsKilled += 1;
            grantXp(state, attackerId, XP.KILL_UNIT, suppressFloaters);
            outEvents?.push({
              type: 'UNIT_DEATH',
              unitId: rearUnitId,
              position: { ...behindPos },
              faction: rearUnit.faction,
            });
          } else {
            rearUnit.stats.currentHp = newRearHp;
          }
        }
      } else if (behindTile.buildingId) {
        const rearBuilding = state.buildings[behindTile.buildingId];
        if (rearBuilding) {
          // Apply same defense-subtraction pattern as unit hits; use combatStats.defense if present.
          // Minimum 1 ensures the tag always registers a hit. HP is reduced to 0 (not deleted
          // inline) — building removal triggers normally on the next attack that targets it.
          const buildingDefense = rearBuilding.combatStats?.defense ?? 0;
          const finalPierceBuildingDamage = Math.max(1, fullPrimaryDamage - buildingDefense);
          if (!suppressFloaters) {
            const { addFloater } = useFloaterStore.getState();
            addFloater({ value: finalPierceBuildingDamage, x: behindPos.x, y: behindPos.y, isEnemy: rearBuilding.faction === Faction.ENEMY });
          }
          outEvents?.push({
            type: 'PIERCE_DAMAGE',
            unitId: null,
            buildingId: rearBuilding.id,
            position: { ...behindPos },
            amount: finalPierceBuildingDamage,
            isEnemy: rearBuilding.faction === Faction.ENEMY,
            attackerPosition: { ...attackerPosition },
            primaryDefenderPosition: { ...defenderPosition },
          });
          rearBuilding.hp = Math.max(0, rearBuilding.hp - finalPierceBuildingDamage);
        }
      }
    }
  }

  // BURN: apply BURNING status to the tile the defender occupied.
  // applyTileStatus enforces the whitelist, so non-combustible terrain (WATER, CANYON, etc.)
  // will not receive BURNING. It also clears any existing status first (e.g. FROZEN).
  // Suppressed on CORRUPTED tile.
  if (!attackerDead && attacker.tags.includes(UnitTag.BURN) && !attackerOnCorrupted) {
    applyTileStatus(state, defenderPosition, TileStatus.BURNING);
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

  // CRYSTAL_TOWER synergy: each player-owned Crystal Chamber within attack range
  // grants a flat attack bonus to the tower.
  if (building.type === BuildingType.CRYSTAL_TOWER && buildingFaction === Faction.PLAYER && building.combatStats) {
    const attackRange = building.combatStats.attackRange;
    for (const b of Object.values(state.buildings)) {
      if (b.type === BuildingType.CRYSTAL_CHAMBER && b.faction === Faction.PLAYER) {
        if (isTileWithinEdgeCircleRange(
          building.position.x, building.position.y,
          b.position.x, b.position.y,
          attackRange,
        )) {
          buildingCombatant.attack += MAGE.CRYSTAL_TOWER_CHAMBER_ATTACK_BONUS;
        }
      }
    }
  }

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
    // Capture the defender's type and tags before removal (for REVIVABLE and BRANDMARKED checks)
    const defenderType = defender.type;
    const defenderTags = [...defender.tags];
    const defenderPos = { x: defender.position.x, y: defender.position.y };

    if (defenderTags.includes(UnitTag.BRANDMARKED)) {
      // BRANDMARKED: immediately complete the transform so the resolved state is clean.
      completeBrandmarkTransformInPlace(state, defenderId, defenderPos);
    } else {
      const defenderTile = state.grid[defender.position.y][defender.position.x];
      if (defenderTile.unitId === defenderId) {
        defenderTile.unitId = null;
      }
      delete state.units[defenderId];
      if (defenderFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
      else if (buildingFaction === Faction.PLAYER) state.gameStats.unitsKilled += 1;
    }

    // CRYSTAL_TOWER: grant crystals when a Crystal Tower kills an enemy unit
    if (
      buildingFaction === Faction.PLAYER &&
      defenderFaction === Faction.ENEMY &&
      building.type === BuildingType.CRYSTAL_TOWER
    ) {
      state.arcaneCrystals += MAGE.CRYSTAL_TOWER_KILL_CRYSTAL_REWARD;
      // Crystal floater is emitted by the animation engine AFTER the death animation.
    }

    // EMBER_DEMON kill: grant crystal reward when player building kills a hostile Ember Demon
    if (buildingFaction === Faction.PLAYER && defenderFaction === Faction.ENEMY && defenderType === UnitType.EMBER_DEMON) {
      state.arcaneCrystals += MAGE.EMBER_DEMON_KILL_CRYSTAL_REWARD;
    }

    // If the dead defender was standing on an enemy spawner building, set a spawn
    // cooldown so the player has a window to move onto the tile and capture.
    // (defenderTile may have a new unitId if BRANDMARKED spawned a demon — use the original position)
    const defenderTileAfter = state.grid[defenderPos.y][defenderPos.x];
    if (buildingFaction === Faction.PLAYER && defenderFaction === Faction.ENEMY && defenderTileAfter.buildingId) {
      const spawner = state.buildings[defenderTileAfter.buildingId];
      if (spawner && spawner.faction === Faction.ENEMY &&
          (spawner.type === BuildingType.LAVALAIR || spawner.type === BuildingType.INFERNALSANCTUM)) {
        spawner.spawnCooldownRemaining = 1;
      }
    }

    // When a player unit with the right conditions dies, leave a Gravestone on their tile.
    // BRANDMARKED units are handled separately above (deferred via pendingBrandmarkTransforms).
    if (!defenderTags.includes(UnitTag.BRANDMARKED)) {
      if (shouldLeaveGravestone(
        { faction: defenderFaction, tags: defenderTags },
        { defaultOn: false },
      )) {
        createGravestoneAt(state, defenderPos, defenderType);
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

  // ASSASSIN: bonus damage vs. full-HP buildings is suppressed on CORRUPTED tile.
  const attackerOnCorrupted = isUnitOnCorruptedTile(state, attackerId);
  if (attackerOnCorrupted) {
    attackerCombatant.tags = attackerCombatant.tags.filter(t => t !== UnitTag.ASSASSIN);
  }

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

  // ASSASSIN: no retaliation damage when ability is activated (building at full HP).
  // Suppressed on CORRUPTED tile (tag already stripped from combatant above).
  if (attacker.tags.includes(UnitTag.ASSASSIN) && !attackerOnCorrupted && building.hp === building.maxHp) {
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
    const attackerTags = [...attacker.tags];
    const attackerType = attacker.type;
    const attackerPos = { x: attacker.position.x, y: attacker.position.y };
    if (attackerTags.includes(UnitTag.BRANDMARKED)) {
      // BRANDMARKED: defer unit removal and Ember Demon spawn to finalizeBrandmarkTransforms;
      // unitsLost is counted in finalizeBrandmarkTransforms after the animation completes.
      handleBrandmarkedUnitDeath(state, attacker);
    } else {
      const attackerTile = state.grid[attacker.position.y][attacker.position.x];
      if (attackerTile.unitId === attackerId) {
        attackerTile.unitId = null;
      }
      delete state.units[attackerId];
      if (attackerFaction === Faction.PLAYER) state.gameStats.unitsLost += 1;
      // When a player unit with the right conditions dies from a building counter-attack,
      // leave a Gravestone on their tile. `defaultOn: false` means a gravestone is only
      // created when the unit carries an explicit tag (REVIVABLE from Deathmender, or
      // LEAVES_GRAVESTONE from the Necromancer tech tree) — ordinary units do not leave
      // gravestones just because they died.
      if (shouldLeaveGravestone(
        { faction: attackerFaction, tags: attackerTags },
        { defaultOn: false },
      )) {
        createGravestoneAt(state, attackerPos, attackerType);
      }
    }
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
