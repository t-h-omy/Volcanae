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
import { Faction, UnitTag, BuildingType, TileType, TileStatus, UnitType } from './types';
import { MAGE, BUILDING_DEFINITIONS, ABILITIES, MAP, UNIT_DEFINITIONS } from './gameConfig';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { generateId } from './mapGenerator';
import { useFloaterStore } from './floaterStore';
import { useCombatAnimationStore } from './combatAnimationStore';
import { isStatusAllowedOnTerrain, applyTileStatus } from './tileStatusSystem';
import { shouldLeaveGravestone, createGravestoneAt } from './combatSystem';
import { applyTagStatEffects } from './techSystem';
import { cleanupRoostedUnits } from './buildingRemoval';
import { getTagsFromActiveSpecialistsForSourceTag } from './specialistSystem';

/** Returns the effective spell range for a mage (its attack range). */
export function getMageSpellRange(
  mage: Unit | Draft<Unit>,
): number {
  return mage.stats.attackRange;
}

/** True iff `spellId` has been unlocked by tech. */
export function isSpellUnlocked(
  state: GameState | Draft<GameState>,
  spellId: SpellId,
): boolean {
  return state.unlockedSpells.includes(spellId);
}

/** Returns the effective per-turn spell budget for Mages. */
export function getMageCastBudget(
  state: GameState | Draft<GameState>,
): number {
  let budget = MAGE.SPELLS_PER_TURN;
  const activeSpecialists = Array.isArray(state.globalSpecialistStorage)
    ? state.globalSpecialistStorage
    : [];
  for (const specId of activeSpecialists) {
    const specialist = state.specialists?.[specId];
    if (!specialist || specialist.dormant) continue;
    for (const effect of specialist.effects) {
      if (effect.type === 'MAGE_CAST_BUDGET_MOD') {
        budget += Number(effect.params.amount ?? 0);
      }
    }
  }
  return budget;
}

/**
 * True iff the unit is a Mage that can currently cast.
 * Mirrors canUnitAttack exactly, with one additional tag rule (PREP).
 *
 * Blocking rules:
 *   - spent spell budget / hasAttackedThisTurn / hasCapturedThisTurn /
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
 * each treat an exhausted spell budget as a turn-ending flag the same way they
 * already treat hasAttackedThisTurn.
 */
export function canUnitCast(
  unit: Unit,
  state: GameState | Draft<GameState>,
): boolean {
  if (unit.type !== UnitType.MAGE) return false;
  if ((unit.spellsCastThisTurn ?? 0) >= getMageCastBudget(state)) return false;
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
  const range = getMageSpellRange(mage);

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
        // within mage spell range (no constraint on proximity to first unit).
        const first = state.units[firstId];
        if (!first) return [];
        const targets: Position[] = [];
        for (const unit of Object.values(state.units)) {
          if (unit.id === firstId || unit.id === mageId) continue;
          if (unit.faction !== first.faction) continue;
          if (!isTileInSpellRange(mage, unit.position, range)) continue;
          targets.push({ ...unit.position });
        }
        return targets;
      }
    }

    case 'EMBERBIND': {
      const targets: Position[] = [];
      for (const building of Object.values(state.buildings)) {
        if (building.type !== BuildingType.EMBERNEST) continue;
        if (!isTileInSpellRange(mage, building.position, range)) continue;
        const tile = state.grid[building.position.y]?.[building.position.x];
        if (tile?.unitId) continue; // occupied — not a valid target
        targets.push({ ...building.position });
      }
      return targets;
    }

    case 'BRANDMARK_HEAL': {
      const targets: Position[] = [];
      for (const unit of Object.values(state.units)) {
        if (unit.faction !== Faction.PLAYER) continue;
        if (unit.id === mageId) continue;
        if (unit.tags.includes(UnitTag.SUMMONED)) continue;
        if (unit.tags.includes(UnitTag.BRANDMARKED)) continue; // already brandmarked
        if (!isTileInSpellRange(mage, unit.position, range)) continue;
        targets.push({ ...unit.position });
      }
      return targets;
    }

    case 'CRYSTAL_TOWER': {
      // Single valid tile: the mage's own tile, no existing building, no ruin, no forest/mountain
      const tile = state.grid[mage.position.y]?.[mage.position.x];
      if (!tile) return [];
      if (tile.buildingId !== null) return [];
      if (tile.isRuin || tile.isStrongholdRuin) return [];
      if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) return [];
      return [{ ...mage.position }];
    }

    case 'CRYSTAL_CAVE': {
      // Crystal Cave is the INVERSE of Crystal Tower's terrain rule and is
      // cast AT RANGE rather than on the mage's own tile: every mountain tile
      // in spell range that is currently free (no building, no unit, not a
      // ruin) is a valid target.
      const targets: Position[] = [];
      for (let y = 0; y < state.grid.length; y++) {
        for (let x = 0; x < state.grid[y].length; x++) {
          const tile = state.grid[y][x];
          if (tile.terrainType !== TileType.MOUNTAIN) continue;
          if (tile.buildingId !== null) continue;
          if (tile.unitId !== null) continue;
          if (tile.isRuin || tile.isStrongholdRuin) continue;
          if (!isTileInSpellRange(mage, { x, y }, range)) continue;
          targets.push({ x, y });
        }
      }
      return targets;
    }

    case 'RAISE_SKELETON': {
      const targets: Position[] = [];
      for (const building of Object.values(state.buildings)) {
        if (building.type !== BuildingType.GRAVESTONE) continue;
        if (!isTileInSpellRange(mage, building.position, range)) continue;
        const tile = state.grid[building.position.y]?.[building.position.x];
        if (!tile || tile.unitId !== null) continue;
        targets.push({ ...building.position });
      }
      return targets;
    }

    case 'GRAVE_TRAP': {
      const targets: Position[] = [];
      for (const building of Object.values(state.buildings)) {
        if (building.type !== BuildingType.GRAVESTONE) continue;
        if (!isTileInSpellRange(mage, building.position, range)) continue;
        targets.push({ ...building.position });
      }
      return targets;
    }

    case 'FROSTCRAFT': {
      const targets: Position[] = [];
      for (let y = 0; y < state.grid.length; y++) {
        for (let x = 0; x < state.grid[y].length; x++) {
          const tile = state.grid[y][x];
          if (!tile.isRevealed) continue;
          if (!isStatusAllowedOnTerrain(tile.terrainType, TileStatus.FROZEN)) continue;
          if (tile.status === TileStatus.FROZEN) continue;
          if (tile.isLava) continue;
          if (!isTileInSpellRange(mage, { x, y }, range)) continue;
          targets.push({ x, y });
        }
      }
      return targets;
    }

    case 'EXPLODE': {
      const targets: Position[] = [];
      for (const unit of Object.values(state.units)) {
        if (unit.faction !== Faction.PLAYER) continue;
        if (unit.id === mageId) continue;
        if (unit.type === UnitType.MAGE) continue;
        if (!isTileInSpellRange(mage, unit.position, range)) continue;
        targets.push({ ...unit.position });
      }
      return targets;
    }

    case 'RUPTURE': {
      const targets: Position[] = [];
      for (const unit of Object.values(state.units)) {
        if (unit.faction !== Faction.ENEMY) continue;
        if (!isTileInSpellRange(mage, unit.position, range)) continue;
        targets.push({ ...unit.position });
      }
      return targets;
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
  const range = getMageSpellRange(mage);

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
  cleanupRoostedUnits(state, buildingId);
  delete state.buildings[buildingId];
  tile.buildingId = null;
  tile.terrainType = TileType.FOREST;

  // Spawn EMBER_DEMON
  const demonId = generateId('unit_demon');
  const demonTags: UnitTag[] = [UnitTag.SUMMONED, UnitTag.LEASHED, UnitTag.LAVA];
  for (const t of getTagsFromActiveSpecialistsForSourceTag(state, UnitTag.SUMMONED)) {
    if (!demonTags.includes(t)) demonTags.push(t);
  }
  state.units[demonId] = {
    id: demonId,
    type: UnitType.EMBER_DEMON,
    faction: Faction.PLAYER,
    position: { ...spawnPos },
    stats: {
      maxHp: UNIT_DEFINITIONS.EMBER_DEMON.maxHp,
      currentHp: UNIT_DEFINITIONS.EMBER_DEMON.maxHp,
      attack: UNIT_DEFINITIONS.EMBER_DEMON.attack,
      defense: UNIT_DEFINITIONS.EMBER_DEMON.defense,
      moveRange: UNIT_DEFINITIONS.EMBER_DEMON.moveRange,
      attackRange: UNIT_DEFINITIONS.EMBER_DEMON.attackRange,
      discoverRadius: UNIT_DEFINITIONS.EMBER_DEMON.discoverRadius,
      triggerRange: UNIT_DEFINITIONS.EMBER_DEMON.triggerRange,
      movementActions: 1,
    },
    tags: demonTags,
    controllerMageId: mage.id,
    hasMovedThisTurn: true,
    hasAttackedThisTurn: true,
    hasCapturedThisTurn: true,
    hasTradedThisTurn: false,
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
  if (target.tags.includes(UnitTag.BRANDMARKED)) return false; // only unbrandmarked units

  target.stats.maxHp *= MAGE.BRANDMARK_HP_MULTIPLIER;
  target.stats.currentHp = target.stats.maxHp;
  target.tags.push(UnitTag.BRANDMARKED);
  // Apply TAG_STAT_EFFECTS for BRANDMARKED (e.g. +ATK bonus) via the single source of truth
  applyTagStatEffects(target, UnitTag.BRANDMARKED);

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
  if (tile.terrainType === TileType.FOREST || tile.terrainType === TileType.MOUNTAIN) return false;

  const towerHp = BUILDING_DEFINITIONS.CRYSTAL_TOWER.combatStats!.maxHp;
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
    discoverRadius: BUILDING_DEFINITIONS.CRYSTAL_TOWER.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: {
      attack: BUILDING_DEFINITIONS.CRYSTAL_TOWER.combatStats!.attack,
      defense: BUILDING_DEFINITIONS.CRYSTAL_TOWER.combatStats!.defense,
      attackRange: BUILDING_DEFINITIONS.CRYSTAL_TOWER.combatStats!.attackRange,
      maxHp: towerHp,
      maxAttacksPerTurn: BUILDING_DEFINITIONS.CRYSTAL_TOWER.combatStats!.maxAttacksPerTurn,
    },
    hasAttackedThisTurn: false,
    tags: [UnitTag.RANGED] as UnitTag[],
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

/**
 * Conjures a Crystal Cave on a free mountain tile within spell range.
 *
 * Targeting is validated in `getValidSpellTargets` (mountain, no building/unit,
 * not a ruin, in range). If the mountain tile carried a hidden CAVE_MONSTER
 * (`tile.hasCaveMonster`) or an awakened monster unit, both are removed
 * SILENTLY — no event, no floater, no kill credit, no reward — mirroring the
 * silent removal pattern used by `lavaSystem.advanceLava` when lava consumes
 * a cave monster's tile.
 */
function handleCrystalCave(
  state: Draft<GameState>,
  _mage: Unit,
  targetPosition: Position,
): boolean {
  const { x, y } = targetPosition;
  const tile = state.grid[y]?.[x];
  if (!tile) return false;
  // Defensive re-checks (target enumeration should have already validated):
  if (tile.terrainType !== TileType.MOUNTAIN) return false;
  if (tile.buildingId !== null) return false;
  if (tile.unitId !== null) return false;
  if (tile.isRuin || tile.isStrongholdRuin) return false;

  // ── Cave-monster handling ──────────────────────────────────────────────────
  // If there is an active encounter (the monster has been awakened and is
  // roaming the map), preserve it — the monster should be able to return to its
  // home mountain and destroy the Crystal Cave, matching the same behaviour as
  // when a Mine is built on the mountain.  Only the dormant flag is cleared
  // (no active encounter = no roaming monster; the mountain "seals up").
  const tileId = `${x},${y}`;
  const encounterIdx = state.activeCaveEncounters.findIndex(
    (e) => e.mountainTileId === tileId,
  );
  if (encounterIdx === -1) {
    // Dormant cave monster — the crystal cave seals the mountain hollow.
    if (tile.hasCaveMonster) {
      tile.hasCaveMonster = false;
    }
  }
  // If an active encounter exists, the monster is already out on the map and
  // will return home on its own.  hasCaveMonster and the encounter entry are
  // left untouched so the returning monster can destroy the cave.

  // ── Construct the Crystal Cave building ────────────────────────────────────
  const caveMaxHp = BUILDING_DEFINITIONS.CRYSTAL_CAVE.maxHp ?? 0;
  const caveId = generateId('building');
  const newBuilding = {
    id: caveId,
    type: BuildingType.CRYSTAL_CAVE,
    faction: Faction.PLAYER,
    position: { x, y },
    hp: caveMaxHp,
    maxHp: caveMaxHp,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDING_DEFINITIONS.CRYSTAL_CAVE.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [] as UnitTag[],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: BUILDING_DEFINITIONS.CRYSTAL_CAVE.destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
  state.buildings[caveId] = newBuilding;
  tile.buildingId = caveId;
  state.gameStats.buildingsConstructed += 1;

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '🕳️ Crystal Cave',
    x,
    y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Destroys a gravestone and raises a Skeleton (Raise Skeleton). */
function handleRaiseSkeleton(
  state: Draft<GameState>,
  targetPosition: Position,
): boolean {
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  const graveId = tile.buildingId;
  if (!graveId) return false;
  const grave = state.buildings[graveId];
  if (!grave || grave.type !== BuildingType.GRAVESTONE) return false;
  if (tile.unitId !== null) return false;

  // Consume gravestone
  cleanupRoostedUnits(state, graveId);
  delete state.buildings[graveId];
  tile.buildingId = null;

  // Spawn Skeleton
  const skeletonId = generateId('unit_skeleton');
  const skeletonTags: UnitTag[] = [UnitTag.SUMMONED, UnitTag.READY];
  for (const t of getTagsFromActiveSpecialistsForSourceTag(state, UnitTag.SUMMONED)) {
    if (!skeletonTags.includes(t)) skeletonTags.push(t);
  }
  state.units[skeletonId] = {
    id: skeletonId,
    type: UnitType.SKELETON,
    faction: Faction.PLAYER,
    position: { x: targetPosition.x, y: targetPosition.y },
    stats: {
      maxHp: UNIT_DEFINITIONS.SKELETON.maxHp,
      currentHp: UNIT_DEFINITIONS.SKELETON.maxHp,
      attack: UNIT_DEFINITIONS.SKELETON.attack,
      defense: UNIT_DEFINITIONS.SKELETON.defense,
      moveRange: UNIT_DEFINITIONS.SKELETON.moveRange,
      attackRange: UNIT_DEFINITIONS.SKELETON.attackRange,
      discoverRadius: UNIT_DEFINITIONS.SKELETON.discoverRadius,
      triggerRange: 0,
      movementActions: 1,
    },
    tags: skeletonTags,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasCapturedThisTurn: false,
    hasTradedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    lastMovedTurn: 0,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
  };
  tile.unitId = skeletonId;

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '💀 Raised',
    x: targetPosition.x,
    y: targetPosition.y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Converts a gravestone into a Grave Trap (Grave Trap). */
function handleGraveTrap(
  state: Draft<GameState>,
  targetPosition: Position,
): boolean {
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  const graveId = tile.buildingId;
  if (!graveId) return false;
  const grave = state.buildings[graveId];
  if (!grave || grave.type !== BuildingType.GRAVESTONE) return false;

  // Replace with a GRAVE_TRAP building
  const trapId = generateId('building');
  const trap = {
    id: trapId,
    type: BuildingType.GRAVE_TRAP,
    faction: Faction.PLAYER as typeof Faction.PLAYER,
    position: { x: targetPosition.x, y: targetPosition.y },
    hp: 1,
    maxHp: 1,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: BUILDING_DEFINITIONS.GRAVE_TRAP.discoverRadius,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: null,
    hasAttackedThisTurn: false,
    tags: [] as UnitTag[],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: BUILDING_DEFINITIONS.GRAVE_TRAP.destroyBehavior,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    trapStunTurns: MAGE.GRAVE_TRAP_STUN_TURNS,
  };

  // Remove old gravestone
  cleanupRoostedUnits(state, graveId);
  delete state.buildings[graveId];
  state.buildings[trapId] = trap;
  tile.buildingId = trapId;

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '☠️ Trapped',
    x: targetPosition.x,
    y: targetPosition.y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Freezes a tile (Frostcraft). Works on any terrain where FROZEN is whitelisted (currently PLAINS and WATER). */
function handleFrostcraft(
  state: Draft<GameState>,
  targetPosition: Position,
): boolean {
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  if (!isStatusAllowedOnTerrain(tile.terrainType, TileStatus.FROZEN)) return false;
  if (tile.status === TileStatus.FROZEN) return false;
  if (tile.isLava) return false;

  applyTileStatus(state, targetPosition, TileStatus.FROZEN);

  useFloaterStore.getState().addFloater({
    value: 0,
    label: '❄️ Frozen',
    x: targetPosition.x,
    y: targetPosition.y,
    isEnemy: false,
    floaterType: 'revive',
  });

  return true;
}

/** Sacrifices a player unit and deals splash damage to adjacent enemies (Explode). */
function handleExplode(
  state: Draft<GameState>,
  mage: Unit,
  targetPosition: Position,
): boolean {
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  const targetUnitId = tile.unitId;
  if (!targetUnitId) return false;
  const target = state.units[targetUnitId];
  if (!target) return false;
  if (target.faction !== Faction.PLAYER) return false;
  if (target.id === mage.id) return false;
  if (target.type === UnitType.MAGE) return false;

  const dmg = Math.ceil(target.stats.currentHp * MAGE.EXPLODE_DAMAGE_PERCENT / 100);

  // Deal dmg to each adjacent enemy unit (bypass defense — flat damage)
  const DIRS: [number, number][] = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ];
  for (const [dx, dy] of DIRS) {
    const nx = targetPosition.x + dx;
    const ny = targetPosition.y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP.GRID_WIDTH || ny >= MAP.GRID_HEIGHT) continue;
    const adjTile = state.grid[ny][nx];
    if (!adjTile.unitId) continue;
    const adjUnit = state.units[adjTile.unitId];
    if (!adjUnit || adjUnit.faction !== Faction.ENEMY) continue;

    adjUnit.stats.currentHp -= dmg;
    // Damage floater for each hit enemy
    useFloaterStore.getState().addFloater({
      value: dmg,
      x: nx,
      y: ny,
      isEnemy: true,
    });
    if (adjUnit.stats.currentHp <= 0) {
      adjTile.unitId = null;
      delete state.units[adjUnit.id];
      state.gameStats.unitsKilled += 1;
    }
  }

  // Handle sacrificed unit's death
  const targetFaction = target.faction;
  const targetType = target.type;
  const targetTags = [...target.tags];
  tile.unitId = null;
  delete state.units[targetUnitId];
  state.gameStats.unitsLost += 1;

  // If the sacrificed unit qualifies, leave a Gravestone on their tile.
  if (shouldLeaveGravestone(
    { faction: targetFaction, tags: targetTags },
    { defaultOn: false },
  )) {
    createGravestoneAt(state, targetPosition, targetType);
  }

  // Tile flash (same duration as emberling explosion VFX)
  const flashKey = `${targetPosition.x},${targetPosition.y}`;
  useCombatAnimationStore.getState().addTileFlash(targetPosition.x, targetPosition.y, 600);
  setTimeout(() => useCombatAnimationStore.getState().removeTileFlash(flashKey), 600);

  return true;
}

/** Deals a percentage of the target's current HP as damage (Rupture). Cannot kill. */
function handleRupture(
  state: Draft<GameState>,
  targetPosition: Position,
): boolean {
  const tile = state.grid[targetPosition.y]?.[targetPosition.x];
  if (!tile) return false;
  const targetUnitId = tile.unitId;
  if (!targetUnitId) return false;
  const target = state.units[targetUnitId];
  if (!target) return false;
  if (target.faction !== Faction.ENEMY) return false;

  const dmg = Math.floor(target.stats.currentHp * MAGE.RUPTURE_PERCENT);
  target.stats.currentHp = Math.max(1, target.stats.currentHp - dmg);

  useFloaterStore.getState().addFloater({
    value: dmg,
    x: targetPosition.x,
    y: targetPosition.y,
    isEnemy: true,
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
  if (mage.type !== UnitType.MAGE) return false;
  if (!canUnitCast(mage, state)) return false;
  if (!isSpellUnlocked(state, spellId)) return false;

  // All spells cost 1 arcane crystal
  if (state.arcaneCrystals < 1) return false;

  // TRANSPOSE is special: first click selects the first unit (no cast yet),
  // second click performs the swap. Deduct crystal only on the actual swap.
  if (spellId === 'TRANSPOSE') {
    const result = handleTranspose(state, mage, targetPosition);
    if (result) state.arcaneCrystals -= 1;
    return result;
  }

  // For all other spells, validate target is in getValidSpellTargets
  const validTargets = getValidSpellTargets(state, mageId, spellId);
  const isValidTarget = validTargets.some(
    (p) => p.x === targetPosition.x && p.y === targetPosition.y,
  );
  if (!isValidTarget) return false;

  let success = false;
  switch (spellId) {
    case 'EMBERBIND':
      success = handleEmberbind(state, mage, targetPosition); break;
    case 'BRANDMARK_HEAL':
      success = handleBrandmarkHeal(state, mage, targetPosition); break;
    case 'CRYSTAL_TOWER':
      success = handleCrystalTower(state, mage); break;
    case 'CRYSTAL_CAVE':
      success = handleCrystalCave(state, mage, targetPosition); break;
    case 'RAISE_SKELETON':
      success = handleRaiseSkeleton(state, targetPosition); break;
    case 'GRAVE_TRAP':
      success = handleGraveTrap(state, targetPosition); break;
    case 'FROSTCRAFT':
      success = handleFrostcraft(state, targetPosition); break;
    case 'EXPLODE':
      success = handleExplode(state, mage, targetPosition); break;
    case 'RUPTURE':
      success = handleRupture(state, targetPosition); break;
    default:
      return false;
  }
  if (success) state.arcaneCrystals -= 1;
  return success;
}

// ============================================================================
// LEASH HELPERS (MS-21)
// ============================================================================

/**
 * Defects a player-faction unit that has lost its leash. Mutates state.
 * Returns true if the unit defected.
 */
export function checkAndDefectLeash(
  state: Draft<GameState>,
  unitId: string,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (unit.faction !== Faction.PLAYER) return false;
  if (!unit.tags.includes(UnitTag.LEASHED)) return false;

  const mage = unit.controllerMageId ? state.units[unit.controllerMageId] : null;
  let defects = false;
  if (!mage || mage.faction !== Faction.PLAYER) {
    defects = true;
  } else {
    const inRange = isTileWithinEdgeCircleRange(
      mage.position.x, mage.position.y,
      unit.position.x, unit.position.y,
      // The demon remains leashed while within the Mage's current attack range.
      mage.stats.attackRange,
    );
    if (!inRange) defects = true;
  }
  if (!defects) return false;

  unit.faction = Faction.ENEMY;
  unit.controllerMageId = null;
  unit.tags = unit.tags.filter((t) => t !== UnitTag.LEASHED && t !== UnitTag.SUMMONED);
  return true;
}

/** Scans every leashed unit and defects those out of range / orphaned. */
export function sweepLeashes(state: Draft<GameState>): string[] {
  const defectedIds: string[] = [];
  for (const u of Object.values(state.units)) {
    if (u.tags.includes(UnitTag.LEASHED) && checkAndDefectLeash(state, u.id)) {
      defectedIds.push(u.id);
    }
  }
  return defectedIds;
}
