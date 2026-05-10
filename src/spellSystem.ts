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
import { Faction, UnitTag, BuildingType, TileType } from './types';
import { MAGE, TECH_TREE } from './gameConfig';
import { isTileWithinEdgeCircleRange } from './rangeUtils';

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
  // Implementation populated in MS-05 through MS-07
  void state; void mageId; void spellId;
  // Suppress unused-import warnings for BuildingType / TileType / Faction
  // (they will be used by MS-05+ cases in this switch)
  void BuildingType; void TileType; void Faction;
  return [];
}

/** Validates and applies a spell. Returns true on success. */
export function castSpell(
  state: Draft<GameState>,
  mageId: string,
  spellId: SpellId,
  targetPosition: Position,
): boolean {
  // Implementation populated in MS-05 through MS-07
  void state; void mageId; void spellId; void targetPosition;
  return false;
}
