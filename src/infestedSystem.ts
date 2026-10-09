import type { Draft } from 'immer';
import type { GameState, Position, Unit } from './types';
import { Faction, TileStatus, UnitTag, UnitType } from './types';
import { MAGE, XP } from './gameConfig';
import type { GameEvent } from './gameEvents';
import { applyUnitDamage, getUnitDamageOutcome } from './unitDamage';
import { canGrantXp, grantXp } from './levelSystem';
import { recordKhyronKill } from './khyronSystem';
import { applyTileStatus, isStatusAllowedOnTerrain } from './tileStatusSystem';

type InfestedDeathSnapshot = Pick<Unit, 'id' | 'faction' | 'type' | 'position' | 'tags' | 'infestedByMageId' | 'infestedDeathEffectResolved'>;

function snapshotUnit(unit: Unit | Draft<Unit>): InfestedDeathSnapshot {
  return {
    id: unit.id,
    faction: unit.faction,
    type: unit.type,
    position: { ...unit.position },
    tags: [...unit.tags],
    infestedByMageId: unit.infestedByMageId,
    infestedDeathEffectResolved: unit.infestedDeathEffectResolved,
  };
}

function creditBurstKill(
  state: Draft<GameState>,
  victim: InfestedDeathSnapshot,
  sourceMageId: string | null,
  countPlayerLoss = true,
): void {
  if (victim.faction === Faction.PLAYER) {
    if (countPlayerLoss) state.gameStats.unitsLost += 1;
  } else if (sourceMageId && state.units[sourceMageId]?.faction === Faction.PLAYER) {
    state.gameStats.unitsKilled += 1;
  }

  if (victim.type === UnitType.CAVE_MONSTER) {
    state.activeCaveEncounters = state.activeCaveEncounters.filter(
      (encounter) => encounter.monsterId !== victim.id,
    );
  }

  const mage = sourceMageId ? state.units[sourceMageId] : null;
  if (mage) recordKhyronKill(state, mage.id, victim.faction, victim.tags);
  if (mage && canGrantXp(mage.type, mage.xp)) {
    grantXp(state, mage.id, XP.KILL_UNIT, true);
  }
  if (
    mage?.faction === Faction.PLAYER
    && victim.faction === Faction.ENEMY
    && victim.type === UnitType.EMBER_DEMON
  ) {
    state.arcaneCrystals += MAGE.EMBER_DEMON_KILL_CRYSTAL_REWARD;
  }
}

function queueBrandmarkTransform(
  state: Draft<GameState>,
  unit: Draft<Unit>,
  position: Position,
): void {
  unit.stats.currentHp = 0;
  unit.infestedDeathEffectResolved = true;
  if (!state.pendingBrandmarkTransforms.some((pending) => pending.unitId === unit.id)) {
    state.pendingBrandmarkTransforms.push({ unitId: unit.id, position: { ...position } });
  }
}

function resolveDeath(
  state: Draft<GameState>,
  deceased: InfestedDeathSnapshot,
  events: GameEvent[] | undefined,
  resolvedIds: Set<string>,
): void {
  if (
    !deceased.tags.includes(UnitTag.INFESTED)
    || deceased.infestedDeathEffectResolved
    || resolvedIds.has(deceased.id)
  ) return;
  resolvedIds.add(deceased.id);
  deceased.infestedDeathEffectResolved = true;

  const sourceMageId = deceased.infestedByMageId ?? null;
  const deathsFromBurst: InfestedDeathSnapshot[] = [];

  for (let y = deceased.position.y - 1; y <= deceased.position.y + 1; y++) {
    for (let x = deceased.position.x - 1; x <= deceased.position.x + 1; x++) {
      if (x === deceased.position.x && y === deceased.position.y) continue;
      const tile = state.grid[y]?.[x];
      const target = tile?.unitId ? state.units[tile.unitId] : null;
      if (!tile || !target) continue;

      const damage = MAGE.INFESTED_DEATH_BURST_DAMAGE;
      const outcome = getUnitDamageOutcome(target, damage);
      if (events && damage > 0) {
        events.push({
          type: 'TILE_DAMAGE',
          unitId: target.id,
          position: { x, y },
          amount: Math.min(damage, target.stats.currentHp),
          damageAmount: damage,
          damageSource: 'INFESTED',
        });
      }
      if (damage > 0) applyUnitDamage(target, damage);
      if (outcome.died) {
        const snapshot = snapshotUnit(target);
        target.infestedDeathEffectResolved = true;
        if (target.tags.includes(UnitTag.BRANDMARKED)) {
          queueBrandmarkTransform(state, target, { x, y });
          creditBurstKill(state, snapshot, sourceMageId, false);
        } else {
          tile.unitId = null;
          delete state.units[target.id];
          creditBurstKill(state, snapshot, sourceMageId);
        }
        deathsFromBurst.push(snapshot);
      }
    }
  }

  for (let y = deceased.position.y - 1; y <= deceased.position.y + 1; y++) {
    for (let x = deceased.position.x - 1; x <= deceased.position.x + 1; x++) {
      if (x === deceased.position.x && y === deceased.position.y) continue;
      const tile = state.grid[y]?.[x];
      const target = tile?.unitId ? state.units[tile.unitId] : null;
      if (!target || target.stats.currentHp <= 0) continue;
      if (!target.tags.includes(UnitTag.INFESTED)) {
        target.tags.push(UnitTag.INFESTED);
        target.infestedByMageId = sourceMageId;
        target.infestedDeathEffectResolved = false;
      }
    }
  }

  for (const burstDeath of deathsFromBurst) {
    if (events) {
      events.push({
        type: 'UNIT_DEATH',
        unitId: burstDeath.id,
        position: { ...burstDeath.position },
        faction: burstDeath.faction,
      });
      if (burstDeath.type === UnitType.CAVE_MONSTER) {
        events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: burstDeath.id });
      }
    }
    resolveDeath(state, burstDeath, events, resolvedIds);
  }
}

/** Resolves a true Infested death after the caller has removed it and emitted UNIT_DEATH. */
export function resolveInfestedDeath(
  state: Draft<GameState>,
  deceased: Unit | Draft<Unit>,
  events?: GameEvent[],
): void {
  const snapshot = snapshotUnit(deceased);
  if (snapshot.type === UnitType.CORRUPTED_QORK) {
    const tile = state.grid[snapshot.position.y]?.[snapshot.position.x];
    if (tile && isStatusAllowedOnTerrain(tile.terrainType, TileStatus.CORRUPTED)) {
      applyTileStatus(state, snapshot.position, TileStatus.CORRUPTED, events);
    } else if (tile) {
      events?.push({
        type: 'CORRUPTION_FIZZLE',
        position: { ...snapshot.position },
      });
    }
  }
  deceased.infestedDeathEffectResolved = true;
  resolveDeath(state, snapshot, events, new Set());
}

/** Clears infection only when this unit itself receives kill credit. */
export function clearInfestedOnCreditedKill(
  state: Draft<GameState>,
  killerId: string,
): void {
  const killer = state.units[killerId];
  if (!killer?.tags.includes(UnitTag.INFESTED)) return;
  killer.tags = killer.tags.filter((tag) => tag !== UnitTag.INFESTED);
  killer.infestedByMageId = null;
  killer.infestedDeathEffectResolved = false;
}

export function processInfestedFactionTurn(
  state: Draft<GameState>,
  faction: Faction,
  events: GameEvent[],
): void {
  const unitIds = Object.values(state.units)
    .filter((unit) => unit.faction === faction && unit.tags.includes(UnitTag.INFESTED))
    .map((unit) => unit.id)
    .sort();

  for (const unitId of unitIds) {
    const unit = state.units[unitId];
    if (!unit) continue;
    const position: Position = { ...unit.position };
    const damage = Math.min(MAGE.INFESTED_HP_LOSS_PER_TURN, unit.stats.currentHp);
    const outcome = applyUnitDamage(unit, MAGE.INFESTED_HP_LOSS_PER_TURN);
    events.push({
      type: 'TILE_DAMAGE',
      unitId,
      position,
      amount: damage,
      damageAmount: MAGE.INFESTED_HP_LOSS_PER_TURN,
      damageSource: 'INFESTED',
    });
    if (!outcome.died) continue;

    const deceased = snapshotUnit(unit);
    unit.infestedDeathEffectResolved = true;
    if (unit.tags.includes(UnitTag.BRANDMARKED)) {
      queueBrandmarkTransform(state, unit, position);
      creditBurstKill(state, deceased, deceased.infestedByMageId ?? null, false);
      events.push({
        type: 'UNIT_DEATH',
        unitId,
        position,
        faction: deceased.faction,
      });
      if (deceased.type === UnitType.CAVE_MONSTER) {
        events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: unitId });
      }
      resolveDeath(state, deceased, events, new Set());
      continue;
    }
    const tile = state.grid[position.y]?.[position.x];
    if (tile?.unitId === unitId) tile.unitId = null;
    delete state.units[unitId];
    creditBurstKill(state, deceased, deceased.infestedByMageId ?? null);
    events.push({
      type: 'UNIT_DEATH',
      unitId,
      position,
      faction: deceased.faction,
    });
    if (deceased.type === UnitType.CAVE_MONSTER) {
      events.push({ type: 'CAVE_MONSTER_KILLED', monsterId: unitId });
    }
    resolveDeath(state, deceased, events, new Set());
  }
}
