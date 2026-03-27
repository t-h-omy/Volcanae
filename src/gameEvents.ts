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
    }
  | {
      type: 'UNIT_DEATH';
      unitId: string;
      position: Position;
      faction: Faction;
    }
  | {
      type: 'BUILDING_CAPTURE';
      buildingId: string;
      position: Position;
      newFaction: Faction;
      buildingType: BuildingType;
    }
  | {
      type: 'LAVA_ADVANCE';
      newLavaRow: number;
      destroyedUnitIds: string[];
      destroyedBuildingIds: string[];
    };
