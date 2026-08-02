import { describe, expect, it } from 'vitest';
import { ABILITIES, UNIT_DEFINITIONS } from '../gameConfig';
import { getBerserkDisplayBonus, isTagConditionActive } from '../combatSystem';
import { getAttackDisplayModifiers } from '../unitStatDisplay';
import { Faction, TileType, TileStatus, UnitTag, UnitType } from '../types';
import type { GameState, Tile, Unit } from '../types';

function makeTile(x: number, y: number, overrides: Partial<Tile> = {}): Tile {
  return {
    position: { x, y },
    isRevealed: true,
    buildingId: null,
    unitId: null,
    isLava: false,
    isLavaPreview: false,
    isRuin: false,
    isStrongholdRuin: false,
    terrainType: TileType.PLAINS,
    status: null,
    ...overrides,
  };
}

function makeGrid(unitPlacements: { id: string; x: number; y: number }[], corrupted: { x: number; y: number }[] = []): Tile[][] {
  const grid = Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 6 }, (_, x) => makeTile(x, y)),
  );
  for (const { id, x, y } of unitPlacements) grid[y][x].unitId = id;
  for (const { x, y } of corrupted) grid[y][x].status = TileStatus.CORRUPTED;
  return grid;
}

function makeUnit(
  id: string,
  type: UnitType,
  faction: Faction,
  x: number,
  y: number,
  extraTags: UnitTag[] = [],
  overrides: (Omit<Partial<Unit>, 'stats'> & { stats?: Partial<Unit['stats']> }) = {},
): Unit {
  const def = UNIT_DEFINITIONS[type];
  const { stats: statOverrides, ...unitOverrides } = overrides;
  return {
    id,
    type,
    faction,
    position: { x, y },
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
      ...(statOverrides ?? {}),
    },
    tags: [...def.tags, ...extraTags],
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
    ...unitOverrides,
  };
}

function makeState(units: Unit[], corrupted: { x: number; y: number }[] = []): GameState {
  return {
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    buildings: {},
    grid: makeGrid(units.map((unit) => ({ id: unit.id, x: unit.position.x, y: unit.position.y })), corrupted),
  } as unknown as GameState;
}

describe('unit stat display helpers', () => {
  it('includes a Cinderborn attack row and keeps the attack net equal to the summed rows', () => {
    const def = UNIT_DEFINITIONS[UnitType.SWORDSMAN];
    const thresholdHp = Math.max(1, Math.floor(def.maxHp * ABILITIES.BERSERK_HP_THRESHOLD_PCT / 100) - 1);
    const unit = makeUnit(
      'u1',
      UnitType.SWORDSMAN,
      Faction.PLAYER,
      2,
      2,
      [UnitTag.CINDERBORN, UnitTag.BERSERK],
      {
        stats: {
          currentHp: thresholdHp,
          attack: def.attack + ABILITIES.CINDERBORN_ATTACK_BONUS,
        },
      },
    );

    const mods = getAttackDisplayModifiers(unit, {
      phalanxAttack: 3,
      rageBonus: 0,
      rageAdjacentCount: 0,
      batteryBonus: 4,
    });

    expect(mods.rows).toContainEqual({
      stat: 'ATK',
      value: ABILITIES.CINDERBORN_ATTACK_BONUS,
      kind: 'applied',
      source: 'Cinderborn (tag)',
    });
    expect(mods.netAttackModifier).toBe(mods.rows.reduce((sum, row) => sum + row.value, 0));
    expect(mods.berserkDisplayBonus).toBe(
      Math.round(mods.effectiveAttackBeforeBerserk * ABILITIES.BERSERK_ATTACK_PCT / 100),
    );
  });

  it('shows berserk display bonus only when active, including latched-at-full-HP units', () => {
    const def = UNIT_DEFINITIONS[UnitType.ARCHER];
    const inactiveUnit = makeUnit('u_inactive', UnitType.ARCHER, Faction.PLAYER, 1, 1, [UnitTag.BERSERK]);
    const latchedUnit = makeUnit('u_latched', UnitType.ARCHER, Faction.PLAYER, 1, 2, [UnitTag.BERSERK], {
      berserkActivated: true,
      stats: { currentHp: def.maxHp },
    });

    expect(getBerserkDisplayBonus(inactiveUnit, 40)).toBe(0);
    expect(getBerserkDisplayBonus(latchedUnit, 40)).toBe(
      Math.round(40 * ABILITIES.BERSERK_ATTACK_PCT / 100),
    );
  });

  it('reports conditional tag activity for berserk and rage, including corrupted-tile rage suppression', () => {
    const berserkUnit = makeUnit('u_berserk', UnitType.ARCHER, Faction.PLAYER, 1, 1, [UnitTag.BERSERK], {
      berserkActivated: true,
    });
    const rageUnit = makeUnit('u_rage', UnitType.SWORDSMAN, Faction.PLAYER, 2, 2, [UnitTag.RAGE]);
    const enemy = makeUnit('u_enemy', UnitType.LAVA_GRUNT, Faction.ENEMY, 3, 2);

    const activeRageState = makeState([rageUnit, enemy]);
    const corruptedRageState = makeState([rageUnit, enemy], [{ x: 2, y: 2 }]);

    expect(isTagConditionActive(activeRageState, berserkUnit, UnitTag.BERSERK)).toBe(true);
    expect(isTagConditionActive(activeRageState, rageUnit, UnitTag.RAGE)).toBe(true);
    expect(isTagConditionActive(corruptedRageState, rageUnit, UnitTag.RAGE)).toBe(false);
  });
});
