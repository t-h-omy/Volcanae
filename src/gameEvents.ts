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
    };
