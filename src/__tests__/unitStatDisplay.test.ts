import { describe, expect, it } from 'vitest';
import { ABILITIES, UNIT_DEFINITIONS } from '../gameConfig';
import { getBerserkDisplayBonus, getLanceChargeAttackBonus, hasAssassinDamageBonusTarget, isTagConditionActive } from '../combatSystem';
import { getAttackDisplayModifiers } from '../unitStatDisplay';
import { Faction, TileType, TileStatus, UnitTag, UnitType } from '../types';
import type { GameState, Tile, Unit } from '../types';
import { t } from '../i18n/i18n';

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
      lanceChargeBonus: 0,
      assassinBonusActive: false,
    });

    const cinderbornRow = mods.rows.find((row) => row.source.key === 'statDisplay.cinderborn');
    expect(cinderbornRow?.value).toBe(ABILITIES.CINDERBORN_ATTACK_BONUS);
    expect(t(cinderbornRow!.source)).toBe('Cinderborn (tag)');
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

  it('shows Lance Charge only while unmoved and not suppressed by corruption', () => {
    const lanceUnit = makeUnit('u_lance', UnitType.RIDER, Faction.PLAYER, 1, 1, [UnitTag.LANCE_CHARGE]);
    const movedLanceUnit = { ...lanceUnit, hasMovedThisTurn: true };
    const activeState = makeState([lanceUnit]);
    const movedState = makeState([movedLanceUnit]);
    const corruptedState = makeState([lanceUnit], [{ x: 1, y: 1 }]);

    expect(getLanceChargeAttackBonus(activeState, lanceUnit)).toBe(ABILITIES.LANCE_CHARGE_ATTACK_BONUS);
    expect(isTagConditionActive(activeState, lanceUnit, UnitTag.LANCE_CHARGE)).toBe(true);
    expect(getLanceChargeAttackBonus(movedState, movedLanceUnit)).toBe(0);
    expect(isTagConditionActive(movedState, movedLanceUnit, UnitTag.LANCE_CHARGE)).toBe(false);
    expect(getLanceChargeAttackBonus(corruptedState, lanceUnit)).toBe(0);
    expect(isTagConditionActive(corruptedState, lanceUnit, UnitTag.LANCE_CHARGE)).toBe(false);

    const mods = getAttackDisplayModifiers(lanceUnit, {
      phalanxAttack: 0,
      rageBonus: 0,
      rageAdjacentCount: 0,
      batteryBonus: 0,
      lanceChargeBonus: getLanceChargeAttackBonus(activeState, lanceUnit),
      assassinBonusActive: false,
    });
    const lanceChargeRow = mods.rows.find((row) => row.source.key === 'statDisplay.lanceCharge');
    expect(lanceChargeRow?.value).toBe(ABILITIES.LANCE_CHARGE_ATTACK_BONUS);
    expect(t(lanceChargeRow!.source)).toBe('Lance Charge (has not moved this turn)');
    expect(mods.netAttackModifier).toBe(ABILITIES.LANCE_CHARGE_ATTACK_BONUS);
  });

  it('shows Assassin and Bloodlust effects only while their combat conditions are active', () => {
    const assassin = makeUnit('u_assassin', UnitType.RIDER, Faction.PLAYER, 1, 1, [UnitTag.ASSASSIN]);
    const fullHealthEnemy = makeUnit('u_full', UnitType.LAVA_GRUNT, Faction.ENEMY, 2, 1);
    const damagedEnemy = makeUnit('u_damaged', UnitType.LAVA_GRUNT, Faction.ENEMY, 2, 1, [], {
      stats: { currentHp: UNIT_DEFINITIONS[UnitType.LAVA_GRUNT].maxHp - 1 },
    });
    const activeAssassinState = makeState([assassin, fullHealthEnemy]);
    const damagedTargetState = makeState([assassin, damagedEnemy]);
    const corruptedAssassinState = makeState([assassin, fullHealthEnemy], [{ x: 1, y: 1 }]);

    expect(hasAssassinDamageBonusTarget(activeAssassinState, assassin)).toBe(true);
    expect(isTagConditionActive(activeAssassinState, assassin, UnitTag.ASSASSIN)).toBe(true);
    expect(hasAssassinDamageBonusTarget(damagedTargetState, assassin)).toBe(false);
    expect(hasAssassinDamageBonusTarget(corruptedAssassinState, assassin)).toBe(false);

    const bloodlustUnit = makeUnit('u_bloodlust', UnitType.RIDER, Faction.PLAYER, 1, 1, [UnitTag.ASSASSIN, UnitTag.BLOODLUST], {
      bloodlustAttackAvailable: true,
    });
    const bloodlustState = makeState([bloodlustUnit, fullHealthEnemy]);
    expect(isTagConditionActive(bloodlustState, bloodlustUnit, UnitTag.BLOODLUST)).toBe(true);
    expect(hasAssassinDamageBonusTarget(bloodlustState, bloodlustUnit)).toBe(true);

    const mods = getAttackDisplayModifiers(bloodlustUnit, {
      phalanxAttack: 0,
      rageBonus: 0,
      rageAdjacentCount: 0,
      batteryBonus: 0,
      lanceChargeBonus: 0,
      assassinBonusActive: hasAssassinDamageBonusTarget(bloodlustState, bloodlustUnit),
    });

    const assassinEffect = mods.effects.find((effect) => effect.source.key === 'statDisplay.assassin');
    expect(assassinEffect?.displayValue).toBe(`×${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}`);
    expect(t(assassinEffect!.source)).toBe('Assassin');
    expect(t(assassinEffect!.condition!)).toBe('Only against full-health targets');
    const bloodlustEffect = mods.effects.find((effect) => effect.source.key === 'statDisplay.bloodlust');
    expect(bloodlustEffect?.displayValue).toBe('×0.5');
    expect(t(bloodlustEffect!.source)).toBe('Bloodlust second strike (base attack halved)');
    expect(mods.netAttackModifier).toBe(0);
  });
});
