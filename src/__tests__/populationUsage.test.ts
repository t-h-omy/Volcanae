/**
 * Regression test: computePopulationUsage always reflects live state.
 *
 * Repro scenario: 5 Guards + 3 Mages + 1 Siege + 1 Rider should show
 * noblesUsed=10 immediately — no end-turn tick required.
 *
 * Guards  (nobles:1, farmers:0) × 5 → 5 nobles
 * Mages   (nobles:1, farmers:0) × 3 → 3 nobles
 * Siege   (nobles:1, farmers:1) × 1 → 1 noble,  1 farmer
 * Rider   (nobles:1, farmers:0) × 1 → 1 noble
 * ─────────────────────────────────────────────
 * Total                              → 10 nobles, 1 farmer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computePopulationUsage } from '../resourceSystem';
import { UnitType, Faction, UnitTag } from '../types';
import type { GameState, Unit } from '../types';
import { UNIT_DEFINITIONS } from '../gameConfig';

let _idCounter = 0;
beforeEach(() => { _idCounter = 0; });
function nextId(): string {
  return `unit_${++_idCounter}`;
}

function makePlayerUnit(type: UnitType): Unit {
  const def = UNIT_DEFINITIONS[type];
  return {
    id: nextId(),
    type,
    faction: Faction.PLAYER,
    position: { x: 4, y: 30 },
    stats: {
      maxHp: def.maxHp,
      currentHp: def.maxHp,
      attack: def.attack,
      defense: def.defense,
      moveRange: def.moveRange,
      discoverRadius: def.discoverRadius,
      triggerRange: def.triggerRange,
      movementActions: def.movementActions,
      attackRange: def.attackRange,
    },
    tags: [...def.tags],
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
    recruitedOnTurn: 1,
  };
}

function makeState(units: Unit[]): GameState {
  const unitsMap: Record<string, Unit> = {};
  for (const u of units) unitsMap[u.id] = u;
  const partial = { units: unitsMap } satisfies Pick<GameState, 'units'>;
  return partial as GameState;
}

describe('computePopulationUsage — live counting', () => {
  it('counts nobles correctly for 5 Guards + 3 Mages + 1 Siege + 1 Rider without an end-turn tick', () => {
    const units: Unit[] = [
      ...Array.from({ length: 5 }, () => makePlayerUnit(UnitType.GUARD)),
      ...Array.from({ length: 3 }, () => makePlayerUnit(UnitType.MAGE)),
      makePlayerUnit(UnitType.SIEGE),
      makePlayerUnit(UnitType.RIDER),
    ];
    const state = makeState(units);

    const { noblesUsed, farmersUsed } = computePopulationUsage(state);
    expect(noblesUsed).toBe(10);
    expect(farmersUsed).toBe(1);
  });

  it('does not count SUMMONED units toward population', () => {
    const summoned = makePlayerUnit(UnitType.CRYSTAL_DRAKE);
    // CRYSTAL_DRAKE already has SUMMONED in its tags; verify the fixture is correct
    expect(summoned.tags).toContain(UnitTag.SUMMONED);

    const state = makeState([summoned]);
    const { noblesUsed, farmersUsed } = computePopulationUsage(state);
    expect(noblesUsed).toBe(0);
    expect(farmersUsed).toBe(0);
  });
});
