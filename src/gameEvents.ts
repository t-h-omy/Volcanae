/**
 * Game event types for Volcanae animated event queue.
 * Each event describes a discrete observable action that happens outside the player turn.
 */

import type { Faction, Position, BuildingType, Unit } from './types';

export type GameEvent =
  | {
      type: 'ENEMY_SPAWN';
      position: Position;
      unit: Unit;
      buildingId: string;
    }
  | {
      type: 'ENEMY_MOVE';
      unitId: string;
      from: Position;
      to: Position;
    }
  | {
      type: 'ENEMY_ATTACK';
      attackerId: string;
      defenderId: string;
      attackerPosition: Position;
      defenderPosition: Position;
      attackerHpLost: number;
      defenderHpLost: number;
      advancedToPosition: Position | null;
      attackerXpGained?: number | null;
      defenderXpGained?: number | null;
    }
  | {
      type: 'PLAYER_ATTACK';
      attackerId: string;
      defenderId: string;
      attackerPosition: Position;
      defenderPosition: Position;
      attackerHpLost: number;
      defenderHpLost: number;
      advancedToPosition: Position | null;
      attackerXpGained?: number | null;
      defenderXpGained?: number | null;
    }
  | {
      type: 'UNIT_DEATH';
      unitId: string;
      position: Position;
      faction: Faction;
    }
  | {
      type: 'BUILDING_ATTACK';
      buildingId: string;
      defenderId: string;
      buildingPosition: Position;
      defenderPosition: Position;
      buildingHpLost: number;
      defenderHpLost: number;
      defenderXpGained?: number | null;
    }
  | {
      type: 'UNIT_ATTACK_BUILDING';
      attackerId: string;
      buildingId: string;
      attackerPosition: Position;
      buildingPosition: Position;
      attackerHpLost: number;
      buildingHpLost: number;
      advancedToPosition?: Position | null;
      attackerXpGained?: number | null;
    }
  | {
      type: 'BUILDING_CAPTURE';
      buildingId: string;
      position: Position;
      newFaction: Faction;
      buildingType: BuildingType;
      xpGained?: number | null;
    }
  | {
      type: 'EXPLOSION';
      unitId: string;
      position: Position;
      damagedUnitIds: string[];
      damagePerUnit: number;
    }
  | {
      type: 'LAVA_ADVANCE';
      newLavaRow: number;
      destroyedUnitIds: string[];
      destroyedBuildingIds: string[];
    }
  | {
      type: 'BUILDING_ATTACK_BUILDING';
      attackingBuildingId: string;
      targetBuildingId: string;
      attackingBuildingPosition: Position;
      targetBuildingPosition: Position;
      attackingBuildingHpLost: number;
      targetBuildingHpLost: number;
    }
  | {
      type: 'RESONANCE_TRIGGERED';
      destroyedChamberPosition: Position;
      survivingChamberIds: string[];
      resonanceDuration: number;
    }
  | {
      type: 'SANCTUM_COLLAPSE';
      /** Position of the captured INFERNALSANCTUM building */
      sanctumPosition: Position;
      /** Zone number (1–5) in which the collapse occurred */
      zone: number;
      /** IDs of enemy units purged from the zone */
      purgedUnitIds: string[];
      /** IDs of enemy buildings destroyed in the zone */
      destroyedBuildingIds: string[];
      /** Turn number on which the zone lockout expires (state.turn + ZONE_LOCKOUT_TURNS) */
      lockoutUntilTurn: number;
      /** Turn on which spawn freeze expires (0 if SPAWN_FREEZE_TURNS === 0) */
      spawnFreezeUntilTurn: number;
      /** Turn on which lava freeze expires (0 if LAVA_FREEZE_TURNS === 0) */
      lavaFreezeUntilTurn: number;
    }
  | {
      type: 'ZONE_CLEARED';
      /** Zone number (1–5) that was cleared */
      zone: number;
      /** Tile the Infernum Sanctum was on */
      sanctumPosition: Position;
      /** Positions of all wiped enemy units */
      clearedUnitPositions: Position[];
      /** Positions of all wiped enemy buildings */
      clearedBuildingPositions: Position[];
    };
