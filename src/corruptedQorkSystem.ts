import type { Draft } from 'immer';
import type { GameState, Position, Unit } from './types';
import { CORRUPTED_QORK } from './gameConfig';
import { Faction, TileStatus, UnitTag, UnitType } from './types';
import type { GameEvent } from './gameEvents';
import { applyUnitDamage } from './unitDamage';
import { createGravestoneAt, shouldLeaveGravestone } from './combatSystem';
import { resolveInfestedDeath } from './infestedSystem';

function snapshotUnit(unit: Unit | Draft<Unit>): Unit {
  return {
    ...unit,
    position: { ...unit.position },
    stats: { ...unit.stats },
    tags: [...unit.tags],
  } as Unit;
}

export function processCorruptedQorkDrain(
  state: Draft<GameState>,
  faction: Faction,
  events: GameEvent[],
): void {
  const qorkIds = Object.values(state.units)
    .filter((unit) => unit.type === UnitType.CORRUPTED_QORK && unit.faction === faction)
    .map((unit) => unit.id)
    .sort();

  for (const unitId of qorkIds) {
    const unit = state.units[unitId];
    if (!unit || state.grid[unit.position.y]?.[unit.position.x]?.status === TileStatus.CORRUPTED) continue;

    const position: Position = { ...unit.position };
    const damage = CORRUPTED_QORK.OFF_CORRUPTION_HP_LOSS;
    const amount = Math.min(damage, unit.stats.currentHp);
    const outcome = applyUnitDamage(unit, damage);
    events.push({
      type: 'TILE_DAMAGE',
      unitId,
      position,
      amount,
      damageAmount: damage,
      damageSource: 'QORK_DRAIN',
    });
    if (!outcome.died) continue;

    const deceased = snapshotUnit(unit);
    const tile = state.grid[position.y]?.[position.x];
    if (unit.tags.includes(UnitTag.BRANDMARKED)) {
      unit.stats.currentHp = 0;
      unit.infestedDeathEffectResolved = true;
      if (!state.pendingBrandmarkTransforms.some((pending) => pending.unitId === unitId)) {
        state.pendingBrandmarkTransforms.push({ unitId, position });
      }
    } else {
      if (tile?.unitId === unitId) tile.unitId = null;
      delete state.units[unitId];
      if (unit.faction === Faction.PLAYER) {
        if (shouldLeaveGravestone(unit, { defaultOn: false })) {
          createGravestoneAt(state, position, unit.type);
        }
        state.gameStats.unitsLost += 1;
      }
    }
    events.push({
      type: 'UNIT_DEATH',
      unitId,
      position,
      faction: deceased.faction,
    });
    resolveInfestedDeath(state, deceased, events);
  }
}
