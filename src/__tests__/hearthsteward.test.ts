import { describe, expect, it } from 'vitest';
import { POPULATION } from '../gameConfig';
import { growHousePopulations, getEffectiveHousingPopulationCap } from '../resourceSystem';
import { createInitialSpecialists } from '../specialistSystem';
import { BuildingType, DestroyBehavior, Faction } from '../types';
import type { Building, GameState } from '../types';

function makeBuilding(
  id: string,
  type: BuildingType,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    faction: Faction.PLAYER,
    position: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 2,
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
    destroyBehavior: DestroyBehavior.RUIN,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
    ...overrides,
  };
}

function makeState(buildings: Record<string, Building>, specialistIds: string[] = []): GameState {
  return {
    buildings,
    specialists: createInitialSpecialists(),
    globalSpecialistStorage: specialistIds,
  } as unknown as GameState;
}

describe('housing cap specialists', () => {
  it('Hearthsteward adds bonus cap to Farm only', () => {
    const farm = makeBuilding('farm', BuildingType.FARM, { populationCap: POPULATION.FARM_POPULATION_CAP });
    const house = makeBuilding('house', BuildingType.PATRICIANHOUSE, { populationCap: POPULATION.PATRICIAN_HOUSE_POPULATION_CAP });
    const stronghold = makeBuilding('stronghold', BuildingType.STRONGHOLD, {
      populationCap: POPULATION.STRONGHOLD_FARMER_CAP + POPULATION.STRONGHOLD_NOBLE_CAP,
    });
    const state = makeState({ [farm.id]: farm, [house.id]: house, [stronghold.id]: stronghold }, ['spec_14']);

    expect(getEffectiveHousingPopulationCap(state, farm)).toBe(POPULATION.FARM_POPULATION_CAP + 1);
    expect(getEffectiveHousingPopulationCap(state, house)).toBe(POPULATION.PATRICIAN_HOUSE_POPULATION_CAP);
    expect(getEffectiveHousingPopulationCap(state, stronghold)).toBe(stronghold.populationCap);
  });

  it('Estate Warden adds bonus cap to Patrician House only', () => {
    const farm = makeBuilding('farm', BuildingType.FARM, { populationCap: POPULATION.FARM_POPULATION_CAP });
    const house = makeBuilding('house', BuildingType.PATRICIANHOUSE, { populationCap: POPULATION.PATRICIAN_HOUSE_POPULATION_CAP });
    const state = makeState({ [farm.id]: farm, [house.id]: house }, ['spec_25']);

    expect(getEffectiveHousingPopulationCap(state, farm)).toBe(POPULATION.FARM_POPULATION_CAP);
    expect(getEffectiveHousingPopulationCap(state, house)).toBe(POPULATION.PATRICIAN_HOUSE_POPULATION_CAP + 1);
  });

  it('applies Hearthsteward and Estate Warden independently', () => {
    const farm = makeBuilding('farm', BuildingType.FARM, { populationCap: POPULATION.FARM_POPULATION_CAP });
    const house = makeBuilding('house', BuildingType.PATRICIANHOUSE, { populationCap: POPULATION.PATRICIAN_HOUSE_POPULATION_CAP });
    const state = makeState({ [farm.id]: farm, [house.id]: house }, ['spec_14', 'spec_25']);

    expect(getEffectiveHousingPopulationCap(state, farm)).toBe(POPULATION.FARM_POPULATION_CAP + 1);
    expect(getEffectiveHousingPopulationCap(state, house)).toBe(POPULATION.PATRICIAN_HOUSE_POPULATION_CAP + 1);
  });

  it('allows Farm growth to base cap + 1 when Hearthsteward is active', () => {
    const farm = makeBuilding('farm', BuildingType.FARM, {
      populationCap: POPULATION.FARM_POPULATION_CAP,
      populationCount: POPULATION.FARM_POPULATION_CAP,
      populationGrowthCounter: POPULATION.HOUSE_GROWTH_INTERVAL - 1,
    });
    const state = makeState({ [farm.id]: farm }, ['spec_14']);

    growHousePopulations(state);

    expect(farm.populationCount).toBe(POPULATION.FARM_POPULATION_CAP + 1);
    expect(farm.populationGrowthCounter).toBe(0);
  });
});
