/**
 * P3A regression test: destroyed MAGMASPYR (DestroyBehavior.RESOURCE) must
 * NOT leave a ruin, and its CORRUPTED tile status must be cleared immediately.
 *
 * Tests exercise the `applyEvent` path in gameStore.ts for both event types
 * that can kill a building:
 *   • BUILDING_ATTACK  — enemy building attacks a player unit and dies from counter
 *   • UNIT_ATTACK_BUILDING — player unit attacks and kills an enemy building
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { BuildingType, DestroyBehavior, Faction, TileStatus, TileType, UnitTag } from '../types';
import type { Building, Tile } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal MAGMASPYR enemy building at the given position. */
function makeMagmaspyr(id: string, x: number, y: number): Building {
  return {
    id,
    type: BuildingType.MAGMASPYR,
    faction: Faction.ENEMY,
    position: { x, y },
    hp: 1,   // will drop to 0 with buildingHpLost: 1
    maxHp: 120,
    specialistSlot: null,
    isDisabledForTurns: 0,
    wasAttackedLastEnemyTurn: false,
    captureProgress: 0,
    isBeingCapturedBy: null,
    lavaBoostEnabled: false,
    discoverRadius: 2,
    turnCapturedByPlayer: null,
    wasEnemyOwnedBeforeCapture: false,
    combatStats: { attack: 30, defense: 50, attackRange: 2, maxAttacksPerTurn: 2 },
    hasAttackedThisTurn: false,
    tags: [],
    consumesUnitOnCapture: false,
    populationCount: 0,
    populationCap: 0,
    populationGrowthCounter: 0,
    strongholdNobles: 0,
    emberSpawnCounter: 0,
    recruitmentQueue: null,
    destroyBehavior: DestroyBehavior.RESOURCE,
    resonanceTurnsRemaining: 0,
    spawnCooldownRemaining: 0,
    lastRecruitmentTurn: 0,
  };
}

/** Build a minimal attacker unit (player, no special tags). */
function makeAttacker(id: string, x: number, y: number) {
  return {
    id,
    type: 'SOLDIER' as const,
    faction: Faction.PLAYER,
    position: { x, y },
    stats: {
      currentHp: 100,
      maxHp: 100,
      attack: 40,
      defense: 20,
      movementRange: 3,
      attackRange: 1,
      maxAttacksPerTurn: 1,
    },
    tags: [] as UnitTag[],
    hasMoved: false,
    hasAttacked: false,
    hasUsedAbility: false,
    lastMovedTurn: 0,
    xp: 0,
    level: 1,
    isSummoned: false,
    stunRemainingTurns: 0,
    roostBuildingId: null,
    tunnelState: null,
    tunnelStartPosition: null,
    tunnelPlannedEmergence: null,
    tunnelTurnsUnderground: 0,
    tunnelCooldownUntil: 0,
    portalCastCooldownUntil: 0,
    brandmarkTurnsRemaining: 0,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const BX = 5;
const BY = 5;
const BUILDING_ID = 'test-magmaspyr';
const ATTACKER_ID = 'test-attacker';

/** Inject a MAGMASPYR on a CORRUPTED tile into the live game store. */
function injectMagmaspyrState() {
  const current = useGameStore.getState();

  // Override the specific tile to place the building and mark CORRUPTED.
  const newGrid = current.grid.map((row, y) =>
    row.map((tile: Tile, x) => {
      if (x === BX && y === BY) {
        return {
          ...tile,
          buildingId: BUILDING_ID,
          status: TileStatus.CORRUPTED,
          terrainType: TileType.MOUNTAIN,
          isRuin: false,
          isStrongholdRuin: false,
        };
      }
      // Place attacker unit one tile to the left
      if (x === BX - 1 && y === BY) {
        return { ...tile, unitId: ATTACKER_ID };
      }
      return tile;
    }),
  );

  const building = makeMagmaspyr(BUILDING_ID, BX, BY);
  const attacker = makeAttacker(ATTACKER_ID, BX - 1, BY);

  useGameStore.setState({
    grid: newGrid,
    buildings: { ...current.buildings, [BUILDING_ID]: building },
    units: { ...current.units, [ATTACKER_ID]: attacker as never },
  });
}

beforeEach(() => {
  injectMagmaspyrState();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P3A — DestroyBehavior.RESOURCE via event path', () => {
  it('BUILDING_ATTACK: destroyed MAGMASPYR leaves no ruin and clears CORRUPTED status', () => {
    useGameStore.getState().applyEvent({
      type: 'BUILDING_ATTACK',
      buildingId: BUILDING_ID,
      defenderId: ATTACKER_ID,
      buildingPosition: { x: BX, y: BY },
      defenderPosition: { x: BX - 1, y: BY },
      buildingHpLost: 1,  // HP was 1, drops to 0 → destroyed
      defenderHpLost: 0,
    });

    const tile = useGameStore.getState().grid[BY][BX];
    expect(tile.isRuin).toBe(false);
    expect(tile.status).not.toBe(TileStatus.CORRUPTED);
    expect(useGameStore.getState().buildings[BUILDING_ID]).toBeUndefined();
  });

  it('UNIT_ATTACK_BUILDING: destroyed MAGMASPYR leaves no ruin and clears CORRUPTED status', () => {
    injectMagmaspyrState(); // re-inject so the building is alive again

    useGameStore.getState().applyEvent({
      type: 'UNIT_ATTACK_BUILDING',
      attackerId: ATTACKER_ID,
      buildingId: BUILDING_ID,
      attackerPosition: { x: BX - 1, y: BY },
      buildingPosition: { x: BX, y: BY },
      attackerHpLost: 0,
      buildingHpLost: 1,  // HP was 1, drops to 0 → destroyed
    });

    const tile = useGameStore.getState().grid[BY][BX];
    expect(tile.isRuin).toBe(false);
    expect(tile.status).not.toBe(TileStatus.CORRUPTED);
    expect(useGameStore.getState().buildings[BUILDING_ID]).toBeUndefined();
  });
});
