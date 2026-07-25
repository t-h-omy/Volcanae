/**
 * unitActions.ts — Single source of truth for player unit action availability.
 *
 * This file exposes two layers per action type:
 *   1. Capability check — Can this unit perform this action at all this turn?
 *      Based on turn-state flags, unit tags, and optional state-derived budgets.
 *   2. Target check — Is there a valid target for this action right now?
 *      Requires full game state. Returns the target(s) or an empty result.
 *
 * ── ADDING A NEW UNIT TAG THAT AFFECTS ACTION AVAILABILITY ──────────────────
 * Add the rule ONLY inside the relevant canUnit* function(s) below.
 * Do NOT add tag checks anywhere else in the codebase for this purpose.
 * Example: PREP prevents attacking after moving → rule is only in canUnitAttack.
 *
 * ── ADDING A NEW ACTION TYPE ────────────────────────────────────────────────
 * 1. Add a flag to the Unit interface in types.ts (e.g. hasHealedThisTurn).
 * 2. Add a canUnit* function here with the blocking rules.
 * 3. Add a target function here if applicable.
 * 4. Update hasUnitActed() to include the new flag.
 * 5. Update all OTHER canUnit* functions to block on the new flag if appropriate.
 * 6. Set the flag only in the action's own system file.
 * 7. Reset it in end-of-turn resets in gameStore.ts and enemySystem.ts.
 * 8. Initialize the new field on all unit creation sites.
 *
 * Current action flags: hasMovedThisTurn, hasAttackedThisTurn,
 *   hasCapturedThisTurn, hasConstructedThisTurn, hasDestroyedThisTurn,
 *   spellsCastThisTurn.
 *
 * ── CROSS-BLOCKING RULES ────────────────────────────────────────────────────
 * Move does not block attack (move → attack is the normal sequence).
 * Any non-move action blocks everything, including further movement.
 * Attack additionally blocks if PREP tag + already moved (must attack before moving).
 */

import type { GameState } from './types';
import type { Draft } from 'immer';
import { Faction, UnitTag, BuildingType, UnitType, TileType, TileStatus } from './types';
import type { Unit, Building, Tile } from './types';
import { getReachableTiles } from './movementSystem';
import { getConstructionOptionsForTile } from './constructionSystem';
import type { ConstructionOption } from './constructionSystem';
import { canCapture } from './captureSystem';
import { isTileWithinEdgeCircleRange } from './rangeUtils';
import { MAP, MAGE } from './gameConfig';
import { getMageCastBudget } from './spellSystem';
import { isUnitOnCorruptedTile } from './tileStatusSystem';
import { getBridgeAt } from './bridgeSystem';
import { getActiveEffectParams, isSpecialistEffectActive } from './specialistSystem';
export { canUnitCast, getMageCastBudget } from './spellSystem';

// ── HELPER ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit has performed any non-movement action this turn.
 * Use this wherever code previously checked hasActedThisTurn on a unit.
 * For the enemy system's "is this unit done?" check, prefer this over
 * reading individual flags directly.
 */
function hasSpentMageCastBudget(
  unit: Unit,
  state?: GameState | Draft<GameState>,
): boolean {
  if (unit.type !== UnitType.MAGE) return false;
  const budget = state ? getMageCastBudget(state) : MAGE.SPELLS_PER_TURN;
  return (unit.spellsCastThisTurn ?? 0) >= budget;
}

export function hasUnitActed(
  unit: Unit,
  state?: GameState | Draft<GameState>,
): boolean {
  // A pending bloodlust charge means the unit can still attack — it has not
  // fully spent its turn, even though hasCapturedThisTurn (and similar flags)
  // are set to block non-attack actions.
  if (unit.bloodlustAttackAvailable) return false;
  return (
    unit.hasAttackedThisTurn ||
    unit.hasCapturedThisTurn ||
    unit.hasTradedThisTurn ||
    unit.hasConstructedThisTurn ||
    unit.hasDestroyedThisTurn ||
    hasSpentMageCastBudget(unit, state)
  );
}

/**
 * Returns the Y coordinate of the northernmost (lowest Y) player unit.
 * Returns undefined if there are no player units.
 */
export function getNorthermostPlayerY(
  state: GameState | Draft<GameState>,
): number | undefined {
  let minY: number | undefined;
  for (const u of Object.values(state.units)) {
    if (u.faction === Faction.PLAYER) {
      if (minY === undefined || u.position.y < minY) {
        minY = u.position.y;
      }
    }
  }
  return minY;
}

// ── MOVE ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to move this turn.
 * Does NOT check whether any reachable tiles exist.
 *
 * Blocking rules:
 *   - hasMovedThisTurn: already moved
 *   - any non-move action flag: non-move actions end the unit's turn entirely
 *     EXCEPTION: HIT_AND_RUN — a unit with HIT_AND_RUN may move before AND after attacking
 *
 * Tag rules: none currently.
 * To add a tag that restricts movement, add it here and only here.
 */
export function canUnitMove(
  unit: Unit,
  _state?: GameState | Draft<GameState>,
): boolean {
  if (unit.pinnedUntilTurn > 0) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  // HIT_AND_RUN: can move before attacking (if not yet moved) OR after attacking (post-attack move, once per turn)
  if (unit.tags.includes(UnitTag.HIT_AND_RUN)) {
    if ((unit.spellsCastThisTurn ?? 0) >= 1) return false;
    if (unit.hasUsedPostAttackMoveThisTurn) return false;
    if (unit.hasAttackedThisTurn) return true; // post-attack move available
    if (unit.hasMovedThisTurn) return false;   // pre-attack move already used
    return true;
  }
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if ((unit.spellsCastThisTurn ?? 0) >= 1) return false;
  return true;
}

/**
 * Returns the set of tile keys ("x,y") the unit can legally move to.
 * Returns an empty set if canUnitMove is false.
 */
export function getMovableTiles(
  unit: Unit,
  state: GameState | Draft<GameState>,
): Set<string> {
  if (!canUnitMove(unit, state)) return new Set();
  const positions = getReachableTiles(state, unit.id);
  const keys = new Set<string>();
  for (const pos of positions) {
    keys.add(`${pos.x},${pos.y}`);
  }
  return keys;
}

// ── ATTACK ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to attack this turn.
 * Does NOT check whether any attack targets are in range.
 *
 * Blocking rules:
 *   - hasAttackedThisTurn: already attacked
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   PREP — cannot attack after moving (attack must come before or instead of move)
 *
 * To add a tag that restricts attack, add it here and only here.
 */
export function canUnitAttack(
  unit: Unit,
  state?: GameState | Draft<GameState>,
): boolean {
  if (unit.pinnedUntilTurn > 0) return false;
  // A pending bloodlust second-attack bypasses the "spent" flags that were
  // intentionally set by the bloodlust logic to block all non-attack actions
  // after the kill. hasAttackedThisTurn was already reset to false.
  if (unit.bloodlustAttackAvailable) return true;
  if (unit.hasAttackedThisTurn) return false;
  if (hasSpentMageCastBudget(unit, state)) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (unit.hasMovedThisTurn && unit.tags.includes(UnitTag.PREP)) return false;
  if (unit.tags.includes(UnitTag.PASSIVE)) return false;
  return true;
}

/** Returns the unit's effective attack range, including derived specialist bonuses. */
export function getUnitAttackRange(
  unit: Unit,
  state?: GameState | Draft<GameState>,
): number {
  let attackRange = unit.stats.attackRange;
  if (state && unit.faction === Faction.PLAYER && unit.type === UnitType.SCOUT) {
    const params = getActiveEffectParams(state, 'SCOUT_RANGE_BONUS');
    attackRange += Number(params?.bonus ?? 0);
  }
  return attackRange;
}

export function isAttackableEnemyUnit(
  target: Unit,
  attackerFaction: Faction,
  grid: Tile[][],
): boolean {
  if (target.faction === attackerFaction) return false;
  const ts = target.tunnelState;
  if (ts === 'DIGGING_IN' || ts === 'UNDERGROUND' || ts === 'EMERGING') return false;
  if (!grid[target.position.y]?.[target.position.x]?.isRevealed) return false;
  return true;
}

export function isAttackableEnemyBuilding(
  target: Building,
  attackerFaction: Faction,
  grid: Tile[][],
): boolean {
  if (target.faction === null || target.faction === attackerFaction) return false;
  if (target.maxHp <= 0 || target.combatStats === null) return false;
  if (target.type === BuildingType.INFERNALSANCTUM) return false;
  if (!grid[target.position.y]?.[target.position.x]?.isRevealed) return false;
  return true;
}

export function anyAttackableEnemyTargetInRange(
  units: Record<string, Unit>,
  buildings: Record<string, Building>,
  grid: Tile[][],
  fromX: number,
  fromY: number,
  range: number,
  attackerFaction: Faction,
): boolean {
  for (const unit of Object.values(units)) {
    if (!unit) continue;
    if (!isAttackableEnemyUnit(unit, attackerFaction, grid)) continue;
    if (isTileWithinEdgeCircleRange(fromX, fromY, unit.position.x, unit.position.y, range)) {
      return true;
    }
  }
  for (const building of Object.values(buildings)) {
    if (!building) continue;
    if (!isAttackableEnemyBuilding(building, attackerFaction, grid)) continue;
    if (isTileWithinEdgeCircleRange(fromX, fromY, building.position.x, building.position.y, range)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the set of tile keys ("x,y") containing valid attack targets.
 * Includes revealed enemy units and revealed enemy buildings with combat stats.
 * Returns an empty set if canUnitAttack is false.
 */
export function getAttackTargets(
  unit: Unit,
  units: Record<string, Unit>,
  buildings: Record<string, Building>,
  grid: Tile[][],
  state?: GameState | Draft<GameState>,
): Set<string> {
  const keys = new Set<string>();
  if (!canUnitAttack(unit, state)) return keys;
  const attackRange = getUnitAttackRange(unit, state);

  // Enemy units
  for (const other of Object.values(units)) {
    if (!isAttackableEnemyUnit(other, unit.faction, grid)) continue;
    const inRange = isTileWithinEdgeCircleRange(
      unit.position.x, unit.position.y,
      other.position.x, other.position.y,
      attackRange,
    );
    if (inRange) {
      keys.add(`${other.position.x},${other.position.y}`);
    }
  }

  // Enemy buildings with combat stats on revealed tiles (skip tiles already
  // covered by an enemy unit — the unit takes priority as the attack target).
  // INFERNALSANCTUM is capture-only and cannot be directly attacked.
  for (const b of Object.values(buildings)) {
    if (!isAttackableEnemyBuilding(b, unit.faction, grid)) continue;
    const key = `${b.position.x},${b.position.y}`;
    if (keys.has(key)) continue;
    const inRange = isTileWithinEdgeCircleRange(
      unit.position.x, unit.position.y,
      b.position.x, b.position.y,
      attackRange,
    );
    if (inRange) {
      keys.add(key);
    }
  }

  return keys;
}

// ── CAPTURE ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to capture a building this turn.
 * Does NOT check whether a capturable building is on the unit's tile.
 *
 * Blocking rules:
 *   - hasCapturedThisTurn: already captured
 *   - hasMovedThisTurn: move blocks capture
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   BUILDANDCAPTURE — only units with this tag can capture.
 *
 * To add a tag that restricts capture, add it here and only here.
 */
export function canUnitCapture(unit: Unit): boolean {
  if (unit.pinnedUntilTurn > 0) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

/**
 * Returns the capturable building on the unit's tile, or null if none.
 * Uses captureSystem.canCapture for the full precondition check (same tile,
 * faction mismatch, etc.).
 */
export function getCaptureTarget(
  unit: Unit,
  state: GameState | Draft<GameState>,
): Building | null {
  if (!canUnitCapture(unit)) return null;
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile?.buildingId) return null;
  const building = state.buildings[tile.buildingId];
  if (!building) return null;
  if (!canCapture(state, unit.id, building.id)) return null;
  return building;
}

// ── TRADE ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit may open the Market Trade panel this turn.
 *
 * Blocking rules (mirror capture):
 *   - ENEMY faction: only player units may trade
 *   - SUMMONED tag: summoned units may not trade
 *   - hasMovedThisTurn: must not have moved this turn
 *   - hasTradedThisTurn: already completed a trade this turn
 *
 * Does NOT check whether the unit is standing on a Market tile.
 * Use getTradeMarket for that.
 */
export function canUnitTrade(unit: Unit): boolean {
  if (unit.faction !== Faction.PLAYER) return false;
  if (unit.tags.includes(UnitTag.SUMMONED)) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasTradedThisTurn) return false;
  return true;
}

/**
 * Returns the Market building on the unit's tile, or null if none is present.
 * Does NOT check canUnitTrade — callers may call this independently.
 */
export function getTradeMarket(
  unit: Unit,
  state: GameState | Draft<GameState>,
): Building | null {
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile?.buildingId) return null;
  const building = state.buildings[tile.buildingId];
  if (!building) return null;
  if (building.type !== BuildingType.MARKET) return null;
  return building;
}

// ── CONSTRUCT ────────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to construct a building this turn.
 * Does NOT check whether the unit's tile supports construction.
 *
 * Blocking rules:
 *   - hasConstructedThisTurn: already constructed
 *   - hasMovedThisTurn: move blocks construct
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   BUILDANDCAPTURE — only units with this tag can construct.
 *
 * To add a tag that restricts construction, add it here and only here.
 */
export function canUnitConstruct(unit: Unit): boolean {
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  if (!unit.tags.includes(UnitTag.BUILDANDCAPTURE)) return false;
  return true;
}

/**
 * Returns the list of buildings the unit can construct on its current tile.
 * Returns an empty array if canUnitConstruct is false or the tile has no options.
 */
export function getConstructionTargets(
  unit: Unit,
  state: GameState | Draft<GameState>,
): ConstructionOption[] {
  if (!canUnitConstruct(unit)) return [];
  return getConstructionOptionsForTile(state, unit.position);
}

// ── HEAL (PATCHUP) ─────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to heal an adjacent unit this turn.
 *
 * Blocking rules:
 *   - hasMovedThisTurn: must not have moved
 *   - hasAttackedThisTurn: must not have attacked (heal uses the attack slot)
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   PATCHUP — only units with this tag can heal.
 */
export function canUnitHeal(unit: Unit): boolean {
  if (!unit.tags.includes(UnitTag.PATCHUP)) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  return true;
}

export function isHealSuppressedByCorruption(
  state: GameState | Draft<GameState>,
  unitId: string,
): boolean {
  const unit = state.units[unitId];
  if (!unit || !canUnitHeal(unit)) return false;
  return isUnitOnCorruptedTile(state, unitId) && unit.tags.includes(UnitTag.PATCHUP);
}

const ABILITY_TARGET_REASONS = {
  HEAL_BRANDMARKED: 'Brandmarked units cannot be healed',
  HEAL_SUMMONED: 'Summoned units cannot be healed',
  BRIDGE_ENDPOINTS: 'Bridge needs accessible entry and exit tile',
} as const;

/**
 * Returns the IDs of adjacent (distance = 1, orthogonal + diagonal) friendly
 * units whose currentHp < maxHp.
 * Keep this rule set aligned with explainInvalidHealTarget.
 */
export function getHealTargets(
  state: GameState | Draft<GameState>,
  unitId: string,
): string[] {
  const unit = state.units[unitId];
  if (!unit) return [];
  const targets: string[] = [];
  const { x, y } = unit.position;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP.GRID_WIDTH || ny < 0 || ny >= MAP.GRID_HEIGHT) continue;
      const tile = state.grid[ny][nx];
      if (!tile.unitId) continue;
      const other = state.units[tile.unitId];
      if (!other) continue;
      if (other.faction !== unit.faction) continue;
      if (other.tags.includes(UnitTag.SUMMONED)) continue;
      if (other.tags.includes(UnitTag.BRANDMARKED)) continue;
      if (other.stats.currentHp >= other.stats.maxHp) continue;
      targets.push(other.id);
    }
  }
  return targets;
}

/** Returns a curated invalid-target reason for heal mode. Keep this rule set aligned with getHealTargets. */
export function explainInvalidHealTarget(
  state: GameState | Draft<GameState>,
  healerId: string,
  pos: { x: number; y: number },
): string | null {
  const healer = state.units[healerId];
  if (!healer) return null;
  if (!isTileWithinEdgeCircleRange(healer.position.x, healer.position.y, pos.x, pos.y, 1)) {
    return null;
  }
  const tile = state.grid[pos.y]?.[pos.x];
  if (!tile?.unitId) return null;
  const target = state.units[tile.unitId];
  if (!target) return null;
  if (target.faction !== healer.faction) return null;
  if (target.tags.includes(UnitTag.BRANDMARKED)) {
    return ABILITY_TARGET_REASONS.HEAL_BRANDMARKED;
  }
  if (target.tags.includes(UnitTag.SUMMONED)) {
    return ABILITY_TARGET_REASONS.HEAL_SUMMONED;
  }
  return null;
}

// ── FIELDWORK ───────────────────────────────────────────────────────────────

/**
 * Returns true if the unit is allowed to perform the fieldwork action this turn.
 * Fieldwork sacrifices the unit to build a Watchtower at its position.
 *
 * Blocking rules:
 *   - hasMovedThisTurn: must not have moved
 *   - hasAttackedThisTurn: must not have attacked
 *   - hasConstructedThisTurn: must not have constructed
 *   - any other non-move action flag: unit is spent
 *
 * Tag rules:
 *   FIELDWORK — only units with this tag can fieldwork.
 */
export function canUnitFieldwork(unit: Unit): boolean {
  if (!unit.tags.includes(UnitTag.FIELDWORK)) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  return true;
}

// ── BRIDGE BUILD ─────────────────────────────────────────────────────────────

/** A valid target for the Build Bridge action. */
export interface BridgeBuildTarget {
  pos: { x: number; y: number };
  orientation: 'EW' | 'NS';
}

/**
 * Returns true if the unit is allowed to build a bridge this turn.
 * Does NOT check whether any valid bridge targets exist.
 *
 * Blocking rules (mirrors canUnitConstruct, but keyed on BRIDGE_BUILDER):
 *   - PLAYER faction required
 *   - BRIDGE_BUILDER tag required
 *   - BRIDGE must be unlocked
 *   - hasMovedThisTurn, hasAttackedThisTurn, hasConstructedThisTurn,
 *     hasCapturedThisTurn, hasDestroyedThisTurn — all block the action
 */
export function canUnitBuildBridge(
  unit: Unit,
  state: GameState | Draft<GameState>,
): boolean {
  if (unit.faction !== Faction.PLAYER) return false;
  if (!unit.tags.includes(UnitTag.BRIDGE_BUILDER)) return false;
  if (!state.unlockedBuildings.includes(BuildingType.BRIDGE)) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  return true;
}

/**
 * Returns all valid bridge-build targets for the given unit.
 *
 * For each orthogonal direction D from the unit's position:
 *   - C = unit.pos + D (the canyon tile to bridge)
 *   - Valid iff:
 *     1. C is in bounds
 *     2. C.terrainType === CANYON
 *     3. C is not lava
 *     4. No bridge already on C
 *     5. No bridge on any of C's 8 neighbours (no adjacent bridges)
 *     6. The far tile (C + D) is in bounds and is not CANYON; WATER is allowed
 *        only while frozen
 * - orientation: (D is horizontal) → 'EW', else 'NS'
 * Keep this rule set aligned with explainInvalidBridgeTarget.
 */
export function getBridgeBuildTargets(
  unit: Unit,
  state: GameState | Draft<GameState>,
): BridgeBuildTarget[] {
  const { x, y } = unit.position;
  const targets: BridgeBuildTarget[] = [];
  // Orthogonal directions only
  const orthogonals: [number, number, 'EW' | 'NS'][] = [
    [1, 0, 'EW'],
    [-1, 0, 'EW'],
    [0, 1, 'NS'],
    [0, -1, 'NS'],
  ];
  for (const [dx, dy, orientation] of orthogonals) {
    const cx = x + dx;
    const cy = y + dy;
    // C must be in bounds
    if (cx < 0 || cx >= MAP.GRID_WIDTH || cy < 0 || cy >= MAP.GRID_HEIGHT) continue;
    const cTile = state.grid[cy][cx];
    // C must be a CANYON tile
    if (cTile.terrainType !== TileType.CANYON) continue;
    // C must not be lava
    if (cTile.isLava) continue;
    // No bridge already on C
    if (getBridgeAt(state, cx, cy)) continue;
    // No bridge on any of C's 8 neighbours
    let hasAdjacentBridge = false;
    for (let ndx = -1; ndx <= 1; ndx++) {
      for (let ndy = -1; ndy <= 1 && !hasAdjacentBridge; ndy++) {
        if (ndx === 0 && ndy === 0) continue;
        const nx2 = cx + ndx;
        const ny2 = cy + ndy;
        if (nx2 < 0 || nx2 >= MAP.GRID_WIDTH || ny2 < 0 || ny2 >= MAP.GRID_HEIGHT) continue;
        if (getBridgeAt(state, nx2, ny2)) hasAdjacentBridge = true;
      }
      if (hasAdjacentBridge) break;
    }
    if (hasAdjacentBridge) continue;
    // Far tile (C + D) must be in bounds and walkable for player units
    const fx = cx + dx;
    const fy = cy + dy;
    if (fx < 0 || fx >= MAP.GRID_WIDTH || fy < 0 || fy >= MAP.GRID_HEIGHT) continue;
    const farTile = state.grid[fy][fx];
    if (farTile.terrainType === TileType.CANYON) continue;
    if (farTile.terrainType === TileType.WATER && farTile.status !== TileStatus.FROZEN) continue;
    targets.push({ pos: { x: cx, y: cy }, orientation });
  }
  return targets;
}

/** Returns a curated invalid-target reason for bridge mode. Keep this rule set aligned with getBridgeBuildTargets. */
export function explainInvalidBridgeTarget(
  state: GameState | Draft<GameState>,
  builderId: string,
  pos: { x: number; y: number },
): string | null {
  if (!state.units[builderId]) return null;
  const tile = state.grid[pos.y]?.[pos.x];
  if (!tile) return null;
  if (tile.terrainType === TileType.CANYON || tile.terrainType === TileType.WATER) {
    return ABILITY_TARGET_REASONS.BRIDGE_ENDPOINTS;
  }
  return null;
}

// ── SCOUT SET TRAP ────────────────────────────────────────────────────────────

/**
 * Returns true if the scout unit is allowed to set a trap this turn.
 *
 * Blocking rules:
 *   - PLAYER faction required
 *   - SCOUT unit type required
 *   - SCOUT_SET_TRAP specialist effect must be active
 *   - hasMovedThisTurn, hasAttackedThisTurn, hasConstructedThisTurn,
 *     hasCapturedThisTurn, hasDestroyedThisTurn — all block the action
 *
 * Note: tile eligibility (no building, no ruin) is enforced in the action
 * handler and HUD, NOT here — consistent with how fieldworkBlocked works.
 */
export function canUnitSetTrap(
  unit: Unit,
  state: GameState | Draft<GameState>,
): boolean {
  if (unit.faction !== Faction.PLAYER) return false;
  if (unit.type !== UnitType.SCOUT) return false;
  if (!isSpecialistEffectActive(state, 'SCOUT_SET_TRAP')) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  return true;
}

// ── SCOUT EXTINGUISH ──────────────────────────────────────────────────────────

/**
 * Returns true if the scout unit is allowed to use the Extinguish action this turn.
 *
 * Blocking rules:
 *   - PLAYER faction required
 *   - SCOUT unit type required
 *   - SCOUT_EXTINGUISH specialist effect must be active
 *   - hasMovedThisTurn, hasAttackedThisTurn, hasConstructedThisTurn,
 *     hasCapturedThisTurn, hasDestroyedThisTurn — all block the action
 */
export function canUnitExtinguish(
  unit: Unit,
  state: GameState | Draft<GameState>,
): boolean {
  if (unit.faction !== Faction.PLAYER) return false;
  if (unit.type !== UnitType.SCOUT) return false;
  if (!isSpecialistEffectActive(state, 'SCOUT_EXTINGUISH')) return false;
  if (unit.hasMovedThisTurn) return false;
  if (unit.hasAttackedThisTurn) return false;
  if (unit.hasConstructedThisTurn) return false;
  if (unit.hasCapturedThisTurn) return false;
  if (unit.hasDestroyedThisTurn) return false;
  return true;
}

/**
 * Returns true if the scout's current tile is eligible for trap placement.
 * Requires no building and no ruin on the tile.
 */
export function isTrapTileClear(
  unit: Unit,
  state: GameState | Draft<GameState>,
): boolean {
  const tile = state.grid[unit.position.y]?.[unit.position.x];
  if (!tile) return false;
  if (tile.buildingId !== null) return false;
  if (tile.isRuin || tile.isStrongholdRuin) return false;
  return true;
}
