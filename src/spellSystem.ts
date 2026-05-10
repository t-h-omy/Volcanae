/**
 * spellSystem.ts — Spell casting infrastructure for the Mage unit.
 *
 * Owns:
 *   - Range computation   (getMageSpellRange)
 *   - Unlock query        (isSpellUnlocked)
 *   - Cast eligibility    (canUnitCast)
 *   - Target enumeration  (getValidSpellTargets)
 *   - Cast dispatch       (castSpell)
 *
 * Spell handlers for individual spells are filled in by MS-05 through MS-07.
 */

import type { Draft } from 'immer';
import type { GameState, Position, Unit } from './types';
import type { SpellId } from './types';
import { Faction, UnitTag, BuildingType, TileType, UnitType } from './types';
import { MAGE, TECH_TREE, BUILDING_DEFINITIONS, ABILITIES } from './gameConfig';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { generateId } from './mapGenerator';
import { useFloaterStore } from './floaterStore';

/** Returns the effective spell range for a mage in the current state. */
export function getMageSpellRange(
  state: GameState | Draft<GameState>,
): number {
  let range = MAGE.SPELL_RANGE_BASE;
  for (const def of TECH_TREE) {
    if (!state.techNodes[def.id]?.unlocked) continue;
    for (const eff of def.effects) {
      if (eff.type === 'SPELL_RANGE_MOD') range += eff.amount;
    }
  }
  return range;
}

/** True iff `spellId` has been unlocked by tech. */
export function isSpellUnlocked(
  state: GameState | Draft<GameState>,
  spellId: SpellId,
): boolean {
  return state.unlockedSpells.includes(spellId);
}

/**
 * True iff the unit is a Mage that can currently cast.
 * Mirrors canUnitAttack exactly, with one additional tag rule (PREP).
 *
 * Blocking rules:
 *   - hasCastThisTurn / hasAttackedThisTurn / hasCapturedThisTurn /
 *     hasConstructedThisTurn / hasDestroyedThisTurn: unit is spent on
 *     non-move actions
 *   - hasMovedThisTurn AND PREP tag: cannot cast after moving
 *
 * Note the deliberate asymmetry with the move flag: a unit that has only
 * MOVED (no other action) can still cast UNLESS it carries PREP. This is
 * exactly the same shape as canUnitAttack's PREP rule.
 *
 * Note that canUnitCast does NOT, on its own, prevent moving after casting.
 * That symmetry is enforced inside canUnitMove and canUnitAttack, which
 * each treat hasCastThisTurn as a turn-ending flag the same way they
 * already treat hasAttackedThisTurn.
 */
export function canUnitCast(unit: Unit): boolean {
  if (!unit.tags.includes(UnitTag.MAGE)) return false;
  if (unit.hasCastThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  // PREP semantics extended to spell-casting: cannot cast after moving.
  // Mages carry PREP by default (UNIT_DEFINITIONS.MAGE.tags), so for a
  // standard mage the move-then-cast path is closed. A non-PREP mage
  // (e.g. via a future tech) would be allowed to move and then cast.
  if (unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP)) return false;
  return true;
}

/**
 * Returns true if `tile` is within `range` of `mage`'s position.
 * Delegates to isTileWithinEdgeCircleRange — never write distance math inline.
 */
export function isTileInSpellRange(
  mage: Unit,
  tile: Position,
  range: number,
): boolean {
  return isTileWithinEdgeCircleRange(
    mage.position.x, mage.position.y,
    tile.x, tile.y,
    range,
  );
}

/** Returns the legal target tiles for a spell. */
export function getValidSpellTargets(
  state: GameState | Draft<GameState>,
  mageId: string,
  spellId: SpellId,
): Position[] {
  const mage = state.units[mageId];
  if (!mage) return [];
  const range = getMageSpellRange(state);

  switch (spellId) {
    case 'TRANSPOSE': {
      const firstId = state.pendingTransposeFirstUnitId;
      if (!firstId) {
        // First pick: any tile with a unit (player or enemy) within mage range
        const targets: Position[] = [];
        for (const unit of Object.values(state.units)) {
          if (unit.id === mageId) continue;
          if (isTileInSpellRange(mage, unit.position, range)) {
            targets.push({ ...unit.position });
          }
        }
        return targets;
      } else {
        // Second pick: a different unit of the same faction as the first pick,
        // within mage range AND within mage range of the first unit's position.
        const first = state.units[firstId];
        if (!first) return [];
        const targets: Position[] = [];
        for (const unit of Object.values(state.units)) {
          if (unit.id === firstId || unit.id === mageId) continue;
          if (unit.faction !== first.faction) continue;
          if (!isTileInSpellRange(mage, unit.position, range)) continue;
          if (!isTileWithinEdgeCircleRange(
            first.position.x, first.position.y,
            unit.position.x, unit.position.y,
            range,
          )) continue;
          targets.push({ ...unit.position });
        }
        return targets;
      }
    }

    case 'EMBERBIND': {
      const targets: Position[] = [];
      for (const building of Object.values(state.buildings)) {
        if (building.type !== BuildingType.EMBERNEST) continue;
        if (isTileInSpellRange(mage, building.position, range)) {
          targets.push({ ...building.position });
        }
      }
      return targets;
    }

    case 'BRANDMARK_HEAL': {
      const targets: Position[] = [];
      for (const unit of Object.values(state.units)) {
        if (unit.faction !== Faction.PLAYER) continue;
        if (unit.id === mageId) continue;
        if (unit.tags.includes(UnitTag.SUMMONED)) continue;
        if (unit.tags.includes(UnitTag.MAGE)) continue;
        if (!isTileInSpellRange(mage, unit.position, range)) continue;
        targets.push({ ...unit.position });
      }
      return targets;
    }

    case 'CRYSTAL_TOWER': {
      // Single valid tile: the mage's own tile, no existing building, no ruin
      const tile = state.grid[mage.position.y]?.[mage.position.x];
      if (!tile) return [];
      if (tile.buildingId !== null) return [];
      if (tile.isRuin || tile.isStrongholdRuin) return [];
      return [{ ...mage.position }];
    }

    default:
      return [];
  }
}

// ── Per-spell cast handlers ───────────────────────────────────────────────────

/** Swaps two units' positions (Transpose). */
function handleTranspose(
  state: Draft<GameState>,
  mage: Unit,
  targetPosition: Position,
): boolean {
  const firstId = state.pendingTransposeFirstUnitId;
  const range = getMageSpellRange(state);

  if (!firstId) {
    // First pick: record it and return false so the mage is NOT spent yet.
    const targetTile = state.grid[targetPosition.y]?.[targetPosition.x];
    const targetUnitId = targetTile?.unitId;
    if (!targetUnitId || targetUnitId === mage.id) return false;
    const targetUnit = state.units[targetUnitId];
    if (!targetUnit) return false;
    if (!isTileInSpellRange(mage, targetUnit.position, range)) return false;
    state.pendingTransposeFirstUnitId = targetUnitId;
    return false; // Don't consume the spell yet
  }

  // Second pick: complete the swap
  const firstUnit = state.units[firstId];
  if (!firstUnit) {
    state.pendingTransposeFirstUnitId = null;
    return false;
  }

  const targetTile = state.grid[targetPosition.y]?.[targetPosition.x];
  const secondId = targetTile?.unitId;
  if (!secondId || secondId === firstId || secondId === mage.id) return false;
  const secondUnit = state.units[secondId];
  if (!secondUnit) return false;
  if (secondUnit.faction !== firstUnit.faction) return false;
  if (!isTileInSpellRange(mage, secondUnit.position, range)) return false;
  if (!isTileWithinEdgeCircleRange(
    firstUnit.position.x, firstUnit.position.y,
    secondUnit.position.x, secondUnit.position.y,
    range,
  )) return false;

  // Perform the swap
  const posA = { ...firstUnit.position };
  const posB = { ...secondUnit.position };

  firstUnit.position = posB;
  secondUnit.position = posA;
  firstUnit.lastMovedTurn = state.turn;
  secondUnit.lastMovedTurn = state.turn;

  state.grid[posA.y][posA.x].unitId = secondId;
  state.grid[posB.y][posB.x].unitId = firstId;

  state.pendingTransposeFirstUnitId = null;

  const { addFloater } = useFloaterStore.getState();
  addFloater({ value: 0, label: '🔄 Transpose', x: posA.x, y: posA.y, isEnemy: false, floaterType: 'revive' });
  addFloater({ value: 0, label: '🔄 Transpose', x: posB.x, y: posB.y, isEnemy: false, floaterType: 'revive' });

  return true;
}

/** Destroys an EMBERNEST and summons an EMBER_DEMON (Emberbind). */
function handleEmberbind(
  state: Draft<GameState>,
  mage: Unit,
  targetPosition: Position,
): boolean {
  // Find the EMBERNEST at the target position
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  const buildingId = tile.buildingId;
  if (!buildingId) return false;
  const building = state.buildings[buildingId];
  if (!building || building.type !== BuildingType.EMBERNEST) return false;

  // Find spawn position: prefer the nest tile itself if free of units
  let spawnPos: Position | null = null;
  if (!tile.unitId) {
    spawnPos = { x: targetPosition.x, y: targetPosition.y };
  } else {
    // BFS for adjacent free tile
    const queue: Position[] = [
      { x: targetPosition.x - 1, y: targetPosition.y },
      { x: targetPosition.x + 1, y: targetPosition.y },
      { x: targetPosition.x, y: targetPosition.y - 1 },
      { x: targetPosition.x, y: targetPosition.y + 1 },
    ];
    for (const pos of queue) {
      if (pos.x < 0 || pos.y < 0) continue;
      const t = state.grid[pos.y]?.[pos.x];
      if (t && !t.unitId && !t.isLava) {
        spawnPos = pos;
        break;
      }
    }
  }
  if (!spawnPos) return false;

  // Destroy the EMBERNEST and restore forest
  delete state.buildings[buildingId];
  tile.buildingId = null;
  tile.terrainType = TileType.FOREST;

  // Spawn EMBER_DEMON
  const demonId = generateId('unit_demon');
  state.units[demonId] = {
    id: demonId,
    type: UnitType.EMBER_DEMON,
    faction: Faction.PLAYER,
    position: { ...spawnPos },
    stats: {
      maxHp: MAGE.EMBER_DEMON_MAX_HP,
      currentHp: MAGE.EMBER_DEMON_MAX_HP,
      attack: MAGE.EMBER_DEMON_ATTACK,
      defense: MAGE.EMBER_DEMON_DEFENSE,
      moveRange: MAGE.EMBER_DEMON_MOVE_RANGE,
      attackRange: MAGE.EMBER_DEMON_ATTACK_RANGE,
      discoverRadius: MAGE.EMBER_DEMON_DISCOVER_RADIUS,
      triggerRange: MAGE.EMBER_DEMON_TRIGGER_RANGE,
      movementActions: 1,
    },
    tags: [UnitTag.SUMMONED, UnitTag.LEASHED],
    controllerMageId: mage.id,
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
  state.grid[spawnPos.y][spawnPos.x].unitId = demonId;

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '🔥 Bound!',
    x: spawnPos.x,
    y: spawnPos.y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Fully heals a player unit and adds the BRANDMARKED tag (Brandmark Heal). */
function handleBrandmarkHeal(
  state: Draft<GameState>,
  mage: Unit,
  targetPosition: Position,
): boolean {
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  const targetId = tile.unitId;
  if (!targetId) return false;
  const target = state.units[targetId];
  if (!target) return false;
  if (target.faction !== Faction.PLAYER) return false;
  if (target.id === mage.id) return false;
  if (target.tags.includes(UnitTag.SUMMONED)) return false;
  if (target.tags.includes(UnitTag.MAGE)) return false;

  target.stats.currentHp = target.stats.maxHp;
  if (!target.tags.includes(UnitTag.BRANDMARKED)) {
    target.tags.push(UnitTag.BRANDMARKED);
  }

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '🩸 Brandmarked',
    x: targetPosition.x,
    y: targetPosition.y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Sacrifices the mage and erects a Crystal Tower (Crystal Tower). */
function handleCrystalTower(
  state: Draft<GameState>,
  mage: Unit,
): boolean {
  const { x, y } = mage.position;
  const tile = state.grid[y]?.[x];
  if (!tile) return false;
  if (tile.buildingId !== null) return false;
  if (tile.isRuin || tile.isStrongholdRuin) return false;

  const towerHp = MAGE.CRYSTAL_TOWER_MAX_HP;
  const towerId = generateId('building');
  const newBuilding = {
    id: towerId,
    type: BuildingType.CRYSTAL_TOWER,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: towerHp,
    maxHp: towerHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: MAGE.CRYSTAL_TOWER_DISCOVER_RADIUS,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: {
      attack: MAGE.CRYSTAL_TOWER_ATTACK,
      defense: MAGE.CRYSTAL_TOWER_DEFENSE,
      attackRange: MAGE.CRYSTAL_TOWER_ATTACK_RANGE,
      maxHp: towerHp,
      maxAttacksPerTurn: MAGE.CRYSTAL_TOWER_MAX_ATTACKS_PER_TURN,
    },
    hasAttackedThisTurn: false,
    tags: [UnitTag.RANGED] as import('./types').UnitTag[],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: BUILDING_DEFINITIONS.CRYSTAL_TOWER.destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };

  // Apply FORTIFIED_GARRISON bonus if active
  if (state.fortifiedGarrisonActive && newBuilding.combatStats) {
    newBuilding.combatStats.attack += ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS;
    newBuilding.combatStats.attackRange += ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS;
  }

  state.buildings[towerId] = newBuilding;
  tile.buildingId = towerId;

  // Remove the mage
  tile.unitId = null;
  delete state.units[mage.id];
  if (state.selectedUnitId === mage.id) {
    state.selectedUnitId = null;
  }

  state.gameStats.buildingsConstructed += 1;

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '💎 Crystal Tower',
    x,
    y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Validates and applies a spell. Returns true on success. */
export function castSpell(
  state: Draft<GameState>,
  mageId: string,
  spellId: SpellId,
  targetPosition: Position,
): boolean {
  const mage = state.units[mageId];
  if (!mage) return false;
  if (mage.faction !== Faction.PLAYER) return false;
  if (!mage.tags.includes(UnitTag.MAGE)) return false;
  if (!canUnitCast(mage)) return false;
  if (!isSpellUnlocked(state, spellId)) return false;

  // TRANSPOSE is special: first click does NOT count as a cast
  if (spellId === 'TRANSPOSE') {
    return handleTranspose(state, mage, targetPosition);
  }

  // For all other spells, validate target is in getValidSpellTargets
  const validTargets = getValidSpellTargets(state, mageId, spellId);
  const isValidTarget = validTargets.some(
    (p) => p.x === targetPosition.x && p.y === targetPosition.y,
  );
  if (!isValidTarget) return false;

  switch (spellId) {
    case 'EMBERBIND':
      return handleEmberbind(state, mage, targetPosition);
    case 'BRANDMARK_HEAL':
      return handleBrandmarkHeal(state, mage, targetPosition);
    case 'CRYSTAL_TOWER':
      return handleCrystalTower(state, mage);
    default:
      return false;
  }
}
