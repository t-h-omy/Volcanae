import type { ActiveWaveTheme, GameState, Unit, WaveThemeEntry } from './types';
import { BuildingType, Faction, UnitTag, UnitType } from './types';
import { AI_RECRUITMENT, COUNTER_UNIT_SCORING, ENEMY_WAVE_THEME, MAP, PUNCTURE_STUN_BASE_DEF_THRESHOLD, UNIT_DEFINITIONS } from './gameConfig';

type RandomSource = () => number;

const RANDOM_CLAMP_UPPER_BOUND = 0.999999999;
const EPSILON = 0.000001;

let randomSource: RandomSource = Math.random;
let waveThemeUnitIdCounter = 0;

export function setWaveThemeRandomSource(source?: RandomSource): void {
  randomSource = source ?? Math.random;
}

function rand01(): number {
  const value = randomSource();
  if (!Number.isFinite(value)) return Math.random();
  if (value <= 0) return 0;
  if (value >= 1) return RANDOM_CLAMP_UPPER_BOUND;
  return value;
}

function randInt(minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return minInclusive;
  return Math.floor(rand01() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function getMaxThemePercent(type: UnitType): number {
  const maxThemePercent = UNIT_DEFINITIONS[type].maxThemePercent;
  return maxThemePercent === undefined ? 100 : maxThemePercent;
}

function getEnemyUnlockEmber(type: UnitType): number | null {
  const unlock = UNIT_DEFINITIONS[type].enemyUnlockEmber;
  return unlock === undefined ? null : unlock;
}

function isCounterUnitType(type: UnitType): boolean {
  return (
    type === UnitType.REAPER ||
    type === UnitType.LANCER ||
    type === UnitType.BULLWARK ||
    type === UnitType.KINDLER ||
    type === UnitType.RIFTWORM ||
    type === UnitType.GRIMBEAK ||
    type === UnitType.RIFT_LORD
  );
}

interface ArmyProfile {
  totalCount: number;
  offensiveCount: number;
  defensiveCount: number;
  offensiveAvg: number;
  defensiveAvg: number;
  slowMeleeCount: number;
  meleeCount: number;
  fastCount: number;
  siegeCount: number;
  rangedCount: number;
  slowMeleeRatio: number;
  meleeRatio: number;
  fastRatio: number;
  siegeRatio: number;
  rangedRatio: number;
  mageCount: number;
  guardCount: number;
  highDefCount: number;
  summonedCount: number;
  brandmarkActive: boolean;
  staticRatio: number;
}

function calcUnitScores(unitType: UnitType): { off: number; def: number } {
  const u = UNIT_DEFINITIONS[unitType];
  const off = (u.attack / 100) + ((u.moveRange - 1) * 0.5);
  const def = (u.defense / 100) + (u.maxHp / 100) - 1;
  return { off, def };
}

function buildArmyProfile(units: Unit[]): ArmyProfile {
  const R = AI_RECRUITMENT;
  const total = units.length;

  if (total === 0) {
    return {
      totalCount: 0,
      offensiveCount: 0, defensiveCount: 0,
      offensiveAvg: 0, defensiveAvg: 0,
      slowMeleeCount: 0, meleeCount: 0, fastCount: 0,
      siegeCount: 0, rangedCount: 0,
      slowMeleeRatio: 0, meleeRatio: 0, fastRatio: 0,
      siegeRatio: 0, rangedRatio: 0,
      mageCount: 0, guardCount: 0, highDefCount: 0,
      summonedCount: 0, brandmarkActive: false, staticRatio: 0,
    };
  }

  let offensiveCount = 0;
  let defensiveCount = 0;
  let offensiveSum = 0;
  let defensiveSum = 0;
  let slowMeleeCount = 0;
  let meleeCount = 0;
  let fastCount = 0;
  let siegeCount = 0;
  let rangedCount = 0;
  let mageCount = 0;
  let guardCount = 0;
  let highDefCount = 0;
  let summonedCount = 0;
  let brandmarkActive = false;
  let staticCount = 0;

  for (const unit of units) {
    const { off, def } = calcUnitScores(unit.type);
    const u = UNIT_DEFINITIONS[unit.type];

    offensiveSum += off;
    defensiveSum += def;
    if (off >= R.OFFENSIVE_THRESHOLD) offensiveCount++;
    if (def >= R.DEFENSIVE_THRESHOLD) defensiveCount++;

    const isMelee = u.attackRange < R.RANGED_THRESHOLD;
    const isFast = u.moveRange >= R.FAST_THRESHOLD;
    const isRanged = unit.tags.includes(UnitTag.RANGED) && u.attackRange >= R.RANGED_THRESHOLD;
    const isSiege = unit.tags.includes(UnitTag.RANGED) && u.attackRange >= R.SIEGE_THRESHOLD;

    if (isMelee) meleeCount++;
    if (isMelee && !isFast) slowMeleeCount++;
    if (isFast) fastCount++;
    if (isRanged) rangedCount++;
    if (isSiege) siegeCount++;

    if (unit.type === UnitType.MAGE) mageCount++;
    if (unit.type === UnitType.GUARD) guardCount++;
    if (u.defense > PUNCTURE_STUN_BASE_DEF_THRESHOLD) highDefCount++;
    if (unit.tags.includes(UnitTag.SUMMONED)) summonedCount++;
    if (unit.tags.includes(UnitTag.BRANDMARKED)) brandmarkActive = true;
    if (u.moveRange === 1) staticCount++;
  }

  return {
    totalCount: total,
    offensiveCount,
    defensiveCount,
    offensiveAvg: offensiveSum / total,
    defensiveAvg: defensiveSum / total,
    slowMeleeCount,
    meleeCount,
    fastCount,
    siegeCount,
    rangedCount,
    slowMeleeRatio: slowMeleeCount / total,
    meleeRatio: meleeCount / total,
    fastRatio: fastCount / total,
    siegeRatio: siegeCount / total,
    rangedRatio: rangedCount / total,
    mageCount,
    guardCount,
    highDefCount,
    summonedCount,
    brandmarkActive,
    staticRatio: staticCount / total,
  };
}

function getZoneForRow(row: number): number {
  if (row >= MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS) return 0;
  const zoneIndex = Math.floor((MAP.GRID_HEIGHT - MAP.LAVA_BUFFER_ROWS - 1 - row) / MAP.ZONE_HEIGHT);
  return Math.min(zoneIndex + 1, MAP.ZONE_COUNT);
}

function isEnemyFrontlineStagnant(state: GameState): boolean {
  const STAGNATION_WINDOW_TURNS = 3;
  const enemyUnits = Object.values(state.units).filter((u) => u.faction === Faction.ENEMY);
  if (enemyUnits.length === 0) return false;

  const southernmostEnemyRow = enemyUnits.reduce((max, u) => Math.max(max, u.position.y), -1);
  const stagnantSinceTurn = state.turn - STAGNATION_WINDOW_TURNS;
  const frontlineMovedRecently = enemyUnits.some(
    (u) => u.position.y === southernmostEnemyRow && u.lastMovedTurn >= stagnantSinceTurn,
  );

  return !frontlineMovedRecently;
}

function countPlayerControlledZones(state: GameState): number {
  const controlledZones = new Set<number>();
  for (const building of Object.values(state.buildings)) {
    if (building.faction !== Faction.PLAYER) continue;
    if (building.type !== BuildingType.INFERNALSANCTUM) continue;
    controlledZones.add(getZoneForRow(building.position.y));
  }
  return controlledZones.size;
}

function computePlayerBacklineValue(state: GameState): number {
  const playerUnits = Object.values(state.units).filter((u) => u.faction === Faction.PLAYER);
  const mageCount = playerUnits.filter((u) => u.type === UnitType.MAGE).length;
  const archerCount = playerUnits.filter((u) => u.type === UnitType.ARCHER).length;
  const crystalChamberCount = Object.values(state.buildings).filter(
    (b) => b.faction === Faction.PLAYER && b.type === BuildingType.CRYSTAL_CHAMBER,
  ).length;
  return mageCount * 30 + archerCount * 10 + crystalChamberCount * 20;
}

function countEnemyUnitTypeInZone(state: GameState, zoneId: number, type: UnitType): number {
  return Object.values(state.units).filter(
    (u) => u.faction === Faction.ENEMY && u.type === type && getZoneForRow(u.position.y) === zoneId,
  ).length;
}

function pickDistinctRandom<T>(items: readonly T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function hasFeasiblePercentAllocation(types: readonly UnitType[]): boolean {
  return hasFeasiblePercentAllocationForTotal(types, 100);
}

function hasFeasiblePercentAllocationForTotal(types: readonly UnitType[], totalPercent: number): boolean {
  const floor = ENEMY_WAVE_THEME.MIN_UNIT_PERCENT;
  if (types.length * floor > totalPercent) return false;
  const capSum = types.reduce((sum, type) => sum + getMaxThemePercent(type), 0);
  return capSum >= totalPercent;
}

function pickWeightedType(entries: readonly WaveThemeEntry[]): UnitType | null {
  const positiveEntries = entries.filter((entry) => entry.percent > 0);
  if (positiveEntries.length === 0) return null;
  const total = positiveEntries.reduce((sum, entry) => sum + entry.percent, 0);
  let roll = rand01() * total;
  for (const entry of positiveEntries) {
    roll -= entry.percent;
    if (roll < 0) return entry.type;
  }
  return positiveEntries[positiveEntries.length - 1].type;
}

function pickThemeTypeWithZoneCap(
  state: GameState,
  entries: readonly WaveThemeEntry[],
  zoneId: number,
): UnitType | null {
  const pool = entries
    .map((entry) => ({ ...entry }))
    .filter((entry) => entry.percent > 0);

  while (pool.length > 0) {
    const picked = pickWeightedType(pool);
    if (!picked) return null;
    const maxAlivePerZone = UNIT_DEFINITIONS[picked].maxAlivePerZone;
    if (maxAlivePerZone === undefined) return picked;

    const aliveCount = Object.values(state.units).filter(
      (u) => u.faction === Faction.ENEMY && u.type === picked && getZoneForRow(u.position.y) === zoneId,
    ).length;
    if (aliveCount < maxAlivePerZone) return picked;

    const idx = pool.findIndex((entry) => entry.type === picked);
    if (idx >= 0) pool.splice(idx, 1);
  }

  return null;
}

export function eligiblePool(state: GameState): UnitType[] {
  return (Object.entries(UNIT_DEFINITIONS) as [UnitType, typeof UNIT_DEFINITIONS[UnitType]][])
    .filter(([, def]) => def.themeEligible !== false)
    .filter(([, def]) => def.enemyUnlockEmber !== undefined && def.enemyUnlockEmber <= state.ember + ENEMY_WAVE_THEME.UNLOCK_LOOKAHEAD)
    .map(([type]) => type);
}

export function assignPercents(types: UnitType[], _state: GameState): WaveThemeEntry[] {
  return assignPercentsForTotal(types, 100);
}

function assignPercentsForTotal(types: UnitType[], totalPercent: number): WaveThemeEntry[] {
  if (types.length === 0) return [];

  const floor = ENEMY_WAVE_THEME.MIN_UNIT_PERCENT;
  const caps = types.map((type) => getMaxThemePercent(type));

  const baseTotal = floor * types.length;
  const remaining = Math.max(0, totalPercent - baseTotal);

  const weights = types.map(() => rand01() + EPSILON);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const values = types.map((_, idx) => floor + (remaining * weights[idx]) / weightSum);

  let deficit = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > caps[i]) {
      deficit += values[i] - caps[i];
      values[i] = caps[i];
    }
  }

  for (let pass = 0; pass < 6 && deficit > EPSILON; pass++) {
    const uncapped = values
      .map((value, idx) => ({ idx, room: Math.max(0, caps[idx] - value) }))
      .filter(({ room }) => room > 0);
    if (uncapped.length === 0) break;
    const roomSum = uncapped.reduce((sum, item) => sum + item.room, 0);
    if (roomSum <= 0) break;

    let overflow = 0;
    for (const { idx, room } of uncapped) {
      const share = (deficit * room) / roomSum;
      values[idx] += share;
      if (values[idx] > caps[idx]) {
        overflow += values[idx] - caps[idx];
        values[idx] = caps[idx];
      }
    }
    deficit = overflow;
  }

  const ints = values.map((value) => Math.round(value));
  let sumInts = ints.reduce((sum, value) => sum + value, 0);
  let diff = totalPercent - sumInts;

  while (diff !== 0) {
    if (diff > 0) {
      const target = ints
        .map((value, idx) => ({ idx, room: caps[idx] - value }))
        .filter((item) => item.room > 0)
        .sort((a, b) => b.room - a.room)[0];
      if (!target) break;
      ints[target.idx] += 1;
      diff -= 1;
    } else {
      const target = ints
        .map((value, idx) => ({ idx, room: value - floor }))
        .filter((item) => item.room > 0)
        .sort((a, b) => b.room - a.room)[0];
      if (!target) break;
      ints[target.idx] -= 1;
      diff += 1;
    }
  }

  sumInts = ints.reduce((sum, value) => sum + value, 0);
  if (sumInts !== totalPercent) {
    ints[0] += totalPercent - sumInts;
  }

  return types.map((type, idx) => ({ type, percent: ints[idx] }));
}

function getFillerPercentRange(themeTypeCount: number): { min: number; max: number } {
  const clampedCount = Math.max(1, Math.min(3, themeTypeCount)) as 1 | 2 | 3;
  return ENEMY_WAVE_THEME.FILLER_PERCENT_RANGE_BY_THEME_SIZE[clampedCount];
}

function buildRandomThemeEntries(
  baseTypes: UnitType[],
  pool: UnitType[],
  state: GameState,
): WaveThemeEntry[] | null {
  const fillerRange = getFillerPercentRange(baseTypes.length);
  const fillerCandidates = pool.filter((type) => !baseTypes.includes(type));
  const canUseFiller = fillerRange.max > 0 && fillerCandidates.length > 0;

  if (!canUseFiller) {
    if (fillerRange.min > 0) return null;
    if (!hasFeasiblePercentAllocation(baseTypes)) return null;
    return assignPercents(baseTypes, state);
  }

  const floor = ENEMY_WAVE_THEME.MIN_UNIT_PERCENT;
  const fillerPool = [...fillerCandidates];
  while (fillerPool.length > 0) {
    const fillerIdx = randInt(0, fillerPool.length - 1);
    const [fillerType] = fillerPool.splice(fillerIdx, 1);
    const maxFillerFromCoreFloor = 100 - (baseTypes.length * floor);
    const minFiller = Math.max(floor, fillerRange.min);
    const maxFiller = Math.min(fillerRange.max, getMaxThemePercent(fillerType), maxFillerFromCoreFloor);
    if (maxFiller < minFiller) continue;

    const feasibleFillerPercents: number[] = [];
    for (let fillerPercent = minFiller; fillerPercent <= maxFiller; fillerPercent++) {
      const coreTotal = 100 - fillerPercent;
      if (hasFeasiblePercentAllocationForTotal(baseTypes, coreTotal)) {
        feasibleFillerPercents.push(fillerPercent);
      }
    }
    if (feasibleFillerPercents.length === 0) continue;

    const chosenFillerPercent = feasibleFillerPercents[randInt(0, feasibleFillerPercents.length - 1)];
    const coreEntries = assignPercentsForTotal(baseTypes, 100 - chosenFillerPercent);
    return [...coreEntries, { type: fillerType, percent: chosenFillerPercent }];
  }

  return null;
}

export function unlockedEntries(theme: ActiveWaveTheme, state: GameState): WaveThemeEntry[] {
  return theme.entries.filter(
    (entry) => (UNIT_DEFINITIONS[entry.type].enemyUnlockEmber ?? 0) <= state.ember,
  );
}

function guaranteeUnlockedEntry(entries: WaveThemeEntry[], state: GameState): WaveThemeEntry[] {
  const hasUnlocked = entries.some(
    (entry) => (UNIT_DEFINITIONS[entry.type].enemyUnlockEmber ?? 0) <= state.ember,
  );
  if (hasUnlocked) return entries;

  const currentPool = (Object.entries(UNIT_DEFINITIONS) as [UnitType, typeof UNIT_DEFINITIONS[UnitType]][])
    .filter(([, def]) => def.themeEligible !== false && def.enemyUnlockEmber !== undefined && def.enemyUnlockEmber <= state.ember)
    .map(([type]) => type);
  if (currentPool.length === 0) return entries;

  const entryTypes = new Set(entries.map((e) => e.type));
  const candidate = currentPool.find((t) => !entryTypes.has(t)) ?? currentPool[0];

  const result = [...entries];
  let highestIdx = 0;
  let highestUnlock = -1;
  for (let i = 0; i < result.length; i++) {
    const unlock = UNIT_DEFINITIONS[result[i].type].enemyUnlockEmber ?? 0;
    if (unlock > highestUnlock) {
      highestUnlock = unlock;
      highestIdx = i;
    }
  }
  result[highestIdx] = { ...result[highestIdx], type: candidate };
  return result;
}

export function generateRandomTheme(state: GameState): ActiveWaveTheme {
  const pool = eligiblePool(state);
  if (pool.length === 0) {
    return { entries: [{ type: UnitType.LAVA_GRUNT, percent: 100 }], isReadPlayer: false };
  }

  const minTypes = Math.min(ENEMY_WAVE_THEME.MIN_UNIT_TYPES, pool.length);
  const maxTypes = Math.min(ENEMY_WAVE_THEME.MAX_UNIT_TYPES, pool.length);
  const selectedCount = randInt(minTypes, maxTypes);
  const rerollLimit = ENEMY_WAVE_THEME.ANTI_REPEAT_MAX_REROLLS;

  for (let attempt = 0; attempt < rerollLimit; attempt++) {
    const picked = pickDistinctRandom(pool, selectedCount);
    const entries = buildRandomThemeEntries(picked, pool, state);
    if (entries === null) continue;
    return { entries: guaranteeUnlockedEntry(entries, state), isReadPlayer: false };
  }

  const sorted = [...pool].sort((a, b) => getMaxThemePercent(b) - getMaxThemePercent(a));
  for (let count = selectedCount; count <= Math.min(pool.length, ENEMY_WAVE_THEME.MAX_UNIT_TYPES); count++) {
    const fallback = sorted.slice(0, count);
    const entries = buildRandomThemeEntries(fallback, pool, state);
    if (entries !== null) {
      return { entries: guaranteeUnlockedEntry(entries, state), isReadPlayer: false };
    }
  }

  return { entries: assignPercents([UnitType.LAVA_GRUNT], state), isReadPlayer: false };
}

export function scoreCountersForPlayer(
  state: GameState,
  options?: { zoneId?: number },
): { type: UnitType; score: number }[] {
  const C = COUNTER_UNIT_SCORING;
  const counterTypes: UnitType[] = [
    UnitType.REAPER,
    UnitType.LANCER,
    UnitType.BULLWARK,
    UnitType.KINDLER,
    UnitType.RIFTWORM,
    UnitType.GRIMBEAK,
    UnitType.RIFT_LORD,
  ];
  const zoneId = options?.zoneId;

  const eligibleTypes = counterTypes.filter((type) => {
    const unlock = getEnemyUnlockEmber(type);
    return unlock !== null && unlock <= state.ember + ENEMY_WAVE_THEME.UNLOCK_LOOKAHEAD;
  });

  const allUnits = Object.values(state.units);
  const playerProfile = buildArmyProfile(allUnits.filter((u) => u.faction === Faction.PLAYER));
  const enemyUnits = allUnits.filter((u) => u.faction === Faction.ENEMY);
  const enemyProfile = zoneId === undefined
    ? buildArmyProfile(enemyUnits)
    : buildArmyProfile(enemyUnits.filter((u) => getZoneForRow(u.position.y) === zoneId));

  const results: { type: UnitType; score: number }[] = [];
  for (const unitType of eligibleTypes) {
    let score = 0;
    if (unitType === UnitType.REAPER) {
      score = C.BASE_SCORE_REAPER;
      if (playerProfile.meleeRatio >= 0.5 && playerProfile.totalCount >= 6) {
        score += C.REAPER_BONUS_CLUSTER_TARGET;
      }
      if (playerProfile.slowMeleeRatio >= 0.4) {
        score += C.REAPER_BONUS_SLOW_MELEE_HEAVY;
      }
      if (playerProfile.fastRatio >= 0.3) {
        score += C.REAPER_PENALTY_FAST_PLAYER;
      }
    }

    if (unitType === UnitType.LANCER) {
      score = C.BASE_SCORE_LANCER;
      if (playerProfile.rangedCount >= 2 && playerProfile.meleeCount >= 2) {
        score += C.LANCER_BONUS_BACKLINE_FORMATION;
      }
      if (playerProfile.mageCount > 0) {
        score += C.LANCER_BONUS_MAGE_PRESENT * playerProfile.mageCount;
      }
      if (zoneId !== undefined) {
        if (countEnemyUnitTypeInZone(state, zoneId, UnitType.LANCER) >= 2) {
          score += C.LANCER_PENALTY_OVERREPRESENTED;
        }
      } else if (enemyUnits.filter((u) => u.type === UnitType.LANCER).length >= 2) {
        score += C.LANCER_PENALTY_OVERREPRESENTED;
      }
    }

    if (unitType === UnitType.BULLWARK) {
      score = C.BASE_SCORE_BULLWARK;
      if (playerProfile.guardCount >= 2) {
        score += C.BULLWARK_BONUS_GUARDS_PRESENT * playerProfile.guardCount;
      }
      if (enemyProfile.meleeCount >= 3) {
        score += C.BULLWARK_BONUS_MELEE_PROTECTION_NEEDED;
      }
      if (playerProfile.rangedRatio >= 0.4) {
        score += C.BULLWARK_PENALTY_PLAYER_RANGED;
      }
    }

    if (unitType === UnitType.KINDLER) {
      score = C.BASE_SCORE_KINDLER;
      if (playerProfile.slowMeleeRatio >= 0.4 && playerProfile.rangedRatio >= 0.3) {
        score += C.KINDLER_BONUS_STATIC_FORMATION;
      }
      if (enemyProfile.rangedCount < 2) {
        score += C.KINDLER_BONUS_RANGED_GAP;
      }
      if (playerProfile.fastRatio >= 0.4) {
        score += C.KINDLER_PENALTY_MOBILE_PLAYER;
      }
    }

    if (unitType === UnitType.RIFTWORM) {
      score = C.BASE_SCORE_RIFTWORM;
      if (playerProfile.totalCount >= 6 && playerProfile.meleeRatio >= 0.4) {
        score += C.RIFTWORM_BONUS_DENSE_FORMATION;
      }
      if (playerProfile.mageCount > 0 || playerProfile.rangedCount >= 3) {
        score += C.RIFTWORM_BONUS_BACKLINE_TARGETS;
      }
      if (isEnemyFrontlineStagnant(state)) {
        score += C.RIFTWORM_BONUS_FRONTLINE_BYPASS;
      }
      if (playerProfile.fastRatio >= 0.3) {
        score += C.RIFTWORM_PENALTY_SPREAD_PLAYER;
      }
    }

    if (unitType === UnitType.GRIMBEAK) {
      score = C.BASE_SCORE_GRIMBEAK;
      if (playerProfile.summonedCount > 0) {
        score += C.GRIMBEAK_BONUS_SUMMONED_PRESENT * playerProfile.summonedCount;
      }
      if (playerProfile.brandmarkActive) {
        score += C.GRIMBEAK_BONUS_BRANDMARK_ACTIVE;
      }
      if (playerProfile.meleeRatio >= 0.5 && playerProfile.totalCount >= 6) {
        score += C.GRIMBEAK_BONUS_CLUSTER_TARGET;
      }
    }

    if (unitType === UnitType.RIFT_LORD) {
      score = C.BASE_SCORE_RIFT_LORD;
      const existingCount = zoneId !== undefined
        ? countEnemyUnitTypeInZone(state, zoneId, UnitType.RIFT_LORD)
        : enemyUnits.filter((u) => u.type === UnitType.RIFT_LORD).length;
      if (existingCount >= 1) {
        score = -Infinity;
      } else {
        const backlineValue = computePlayerBacklineValue(state);
        if (backlineValue >= C.RIFT_LORD_BACKLINE_THRESHOLD) {
          score += C.RIFT_LORD_BONUS_HIGH_BACKLINE_VALUE;
        }
        if (countPlayerControlledZones(state) >= 2) {
          score += C.RIFT_LORD_BONUS_PLAYER_DOMINATING;
        }
        if (enemyProfile.totalCount < 2) {
          score += C.RIFT_LORD_PENALTY_NO_PORTAL_USERS;
        }
      }
    }

    results.push({ type: unitType, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

export function rankCountersForPlayer(state: GameState): UnitType[] {
  return scoreCountersForPlayer(state).map((entry) => entry.type);
}

export function generateReadPlayerTheme(state: GameState): ActiveWaveTheme {
  const ranked = rankCountersForPlayer(state);
  const selected: UnitType[] = [];
  const desired = Math.max(ENEMY_WAVE_THEME.READ_PLAYER_COUNTER_PICK, ENEMY_WAVE_THEME.MIN_UNIT_TYPES);

  for (const type of ranked) {
    if (selected.length >= desired) break;
    selected.push(type);
  }

  if (selected.length < ENEMY_WAVE_THEME.MIN_UNIT_TYPES) {
    for (const type of eligiblePool(state)) {
      if (selected.includes(type)) continue;
      selected.push(type);
      if (selected.length >= ENEMY_WAVE_THEME.MIN_UNIT_TYPES) break;
    }
  }

  if (selected.length === 0) {
    selected.push(UnitType.LAVA_GRUNT);
  }

  return { entries: guaranteeUnlockedEntry(assignPercents(selected, state), state), isReadPlayer: true };
}

export function signature(theme: ActiveWaveTheme): string {
  if (theme.isReadPlayer) return 'READ_PLAYER';
  return theme.entries.map((entry) => entry.type).sort().join(',');
}

function countEnemyInfernalSanctums(state: GameState): number {
  return Object.values(state.buildings).filter(
    (building) => building.faction === Faction.ENEMY && building.type === BuildingType.INFERNALSANCTUM,
  ).length;
}

export function rollNextWaveTheme(
  state: GameState,
  options?: { suppressReadPlayer?: boolean },
): ActiveWaveTheme {
  const suppressReadPlayer = options?.suppressReadPlayer === true;
  const minRead = ENEMY_WAVE_THEME.READ_PLAYER_MIN_PER_GAME;
  const maxRead = ENEMY_WAVE_THEME.READ_PLAYER_MAX_PER_GAME;
  const readPlayerThemeCount = state.readPlayerThemeCount ?? 0;
  const remainingSanctums = countEnemyInfernalSanctums(state);

  let forcedReadPlayer = false;
  let mustRandom = false;
  if (readPlayerThemeCount >= maxRead) {
    mustRandom = true;
  } else if (suppressReadPlayer) {
    mustRandom = true;
  } else if ((minRead - readPlayerThemeCount) >= remainingSanctums) {
    forcedReadPlayer = true;
  }

  let prefersReadPlayer = forcedReadPlayer;
  if (!mustRandom && !forcedReadPlayer) {
    prefersReadPlayer = rand01() < ENEMY_WAVE_THEME.READ_PLAYER_CHANCE;
    if (prefersReadPlayer && state.lastThemeSignature === 'READ_PLAYER') {
      prefersReadPlayer = false;
    }
  }

  const buildTheme = (): ActiveWaveTheme => {
    if (!mustRandom && prefersReadPlayer) {
      return generateReadPlayerTheme(state);
    }
    return generateRandomTheme(state);
  };

  let theme = buildTheme();
  let sig = signature(theme);
  if (!forcedReadPlayer && state.lastThemeSignature !== null && sig === state.lastThemeSignature) {
    for (let i = 0; i < ENEMY_WAVE_THEME.ANTI_REPEAT_MAX_REROLLS; i++) {
      theme = buildTheme();
      sig = signature(theme);
      if (sig !== state.lastThemeSignature) break;
    }
  }

  if (theme.isReadPlayer) {
    state.readPlayerThemeCount = readPlayerThemeCount + 1;
  }
  state.activeWaveTheme = theme;
  state.lastThemeSignature = sig;
  return theme;
}

const BUILDING_SPAWN_UNIT_TYPE: Partial<Record<BuildingType, UnitType>> = {
  [BuildingType.LAVALAIR]: UnitType.LAVA_GRUNT,
  [BuildingType.INFERNALSANCTUM]: UnitType.LAVA_RIDER,
};

export function pickUnitFromTheme(state: GameState, building: { type: BuildingType; position: { x: number; y: number } }): UnitType {
  const zoneId = getZoneForRow(building.position.y);
  const entries = unlockedEntries(state.activeWaveTheme ?? { entries: [], isReadPlayer: false }, state);
  const picked = pickThemeTypeWithZoneCap(state, entries, zoneId);
  if (picked) return picked;
  return BUILDING_SPAWN_UNIT_TYPE[building.type] ?? UnitType.LAVA_GRUNT;
}

function createFreshEnemyUnit(type: UnitType, x: number, y: number): Unit {
  const def = UNIT_DEFINITIONS[type];
  waveThemeUnitIdCounter += 1;
  const id = `wave_theme_enemy_${waveThemeUnitIdCounter}`;
  return {
    id,
    type,
    faction: Faction.ENEMY,
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
    },
    tags: [...def.tags],
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasConstructedThisTurn: false,
    hasDestroyedThisTurn: false,
    hasCapturedThisTurn: false,
    hasUsedPostAttackMoveThisTurn: false,
    bloodlustAttackAvailable: false,
    xp: 0,
    level: 1,
    pinnedUntilTurn: 0,
    distractionDefPenalty: 0,
    lastMovedTurn: 0,
  };
}

export function applyThemeToFoggedUnits(state: GameState, theme: ActiveWaveTheme): void {
  for (const unit of Object.values(state.units)) {
    if (unit.faction !== Faction.ENEMY) continue;
    const tile = state.grid[unit.position.y]?.[unit.position.x];
    if (!tile || tile.isRevealed) continue;
    const def = UNIT_DEFINITIONS[unit.type];
    if (def.themeEligible === false) continue;

    const zoneId = getZoneForRow(unit.position.y);
    const replacementType = pickThemeTypeWithZoneCap(state, unlockedEntries(theme, state), zoneId);
    if (!replacementType) continue;

    const replacement = createFreshEnemyUnit(replacementType, unit.position.x, unit.position.y);
    delete state.units[unit.id];
    state.units[replacement.id] = replacement;
    tile.unitId = replacement.id;
  }
}

export function isCounterThemeUnitType(type: UnitType): boolean {
  return isCounterUnitType(type);
}
