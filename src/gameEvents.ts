/**
 * Game event types for Volcanae animated event queue.
 * Each event describes a discrete observable action that happens outside the player turn.
 */

import type { Faction, Position, BuildingType, Unit, Building } from './types';

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
      /** If the attack also applied CORRUPTED status to the defender's tile, the position is stored here for instant visual update. */
      tileCorruptedPosition?: Position;
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
      /** Position of the Crystal Chamber destroyed by this lava advance, if any */
      destroyedChamberPosition?: Position;
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
      /** Amount added to turnsUntilLavaAdvance on Sanctum Collapse (0 if LAVA_ADVANCE_BONUS_TURNS === 0) */
      lavaAdvanceBonus: number;
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
    }
  | {
      /**
       * Emitted when a CAVE_MONSTER is killed in combat (not despawn).
       * Triggers the specialist draw / hire-modal flow.
       */
      type: 'CAVE_MONSTER_KILLED';
      /** ID of the cave monster unit that was killed */
      monsterId: string;
    }
  | {
      /**
       * Emitted when Ember Level increases due to an Emberling sacrifice.
       * Used to show player-facing feedback (floater + log).
       */
      type: 'EMBER_LEVEL_UP';
      /** Position of the unit that caused the ember increase (sacrifice tile) */
      position: Position;
      /** Amount by which Ember Level increased */
      amount: number;
      /** Whether the source was an Emberling sacrifice (true) or another cause (false) */
      isEmberlingSacrifice: boolean;
    }
  | {
      /**
       * Emitted when a unit takes damage from a tile status (e.g. BURNING).
       * Causes a damage floater to appear at the unit's position.
       */
      type: 'TILE_DAMAGE';
      /** ID of the unit that took damage */
      unitId: string;
      /** Position where the floater should appear */
      position: Position;
      /** Amount of damage dealt */
      amount: number;
    }
  | {
      /**
       * Emitted when a CORRUPT_TERRAIN action places a new enemy corruption
       * building (EMBERNEST or MAGMASPYR) on a tile. Allows the animation engine
       * to add the building to the live state instantly so it appears during the
       * animation rather than only after setGameState at turn end.
       */
      type: 'TILE_CORRUPTED';
      /** Tile where the building was placed */
      position: Position;
      /** Snapshot of the newly created building */
      building: Building;
    }
  | {
      /**
       * Emitted when a SPLASH attacker deals AoE damage to a unit surrounding
       * the primary defender.
       */
      type: 'SPLASH_DAMAGE';
      /** ID of the unit that took splash damage */
      unitId: string;
      /** Position where the floater should appear */
      position: Position;
      /** Amount of splash damage dealt */
      amount: number;
      /** Whether the target is an enemy unit */
      isEnemy: boolean;
    }
  | {
      /**
       * Emitted when a CLEAVE attacker deals AoE damage to a unit in the
       * intersection of tiles adjacent to both attacker and defender.
       */
      type: 'CLEAVE_DAMAGE';
      /** ID of the unit that took cleave damage */
      unitId: string;
      /** Position where the floater should appear */
      position: Position;
      /** Amount of cleave damage dealt */
      amount: number;
      /** Whether the target is an enemy unit */
      isEnemy: boolean;
      /** Position of the attacking unit — used to place the slash arc VFX */
      attackerPosition: Position;
    }
  | {
      /**
       * Emitted when a PIERCE attacker deals full damage to the unit or
       * building directly behind the primary defender.
       */
      type: 'PIERCE_DAMAGE';
      /** ID of the unit that took pierce damage (null for buildings) */
      unitId: string | null;
      /** ID of the building that took pierce damage (null for units) */
      buildingId: string | null;
      /** Position where the floater should appear */
      position: Position;
      /** Amount of pierce damage dealt */
      amount: number;
      /** Whether the target is an enemy */
      isEnemy: boolean;
      /** Position of the attacking unit */
      attackerPosition: Position;
      /** Position of the primary defender — the projectile VFX starts here */
      primaryDefenderPosition: Position;
    }
  | {
      /**
       * Emitted when a PUNCTURE attacker stuns a high-DEF defender.
       */
      type: 'STUN_APPLIED';
      /** ID of the unit that was stunned */
      unitId: string;
      /** Position of the stunned unit */
      position: Position;
    }
  | {
      /**
       * Emitted when a TUNNEL unit digs in. The unit is removed from the tile.
       * Renderers should place a hole sprite at `position` while tunnelState is
       * DIGGING_IN or UNDERGROUND.
       */
      type: 'TUNNEL_DIG_IN';
      unitId: string;
      /** Tile where the unit dug in (hole origin). */
      position: Position;
    }
  | {
      /**
       * Emitted one turn before emergence to warn the player.
       * Renderers should place an earthquake indicator on `position`.
       */
      type: 'TUNNEL_EMERGE_WARNING';
      unitId: string;
      /** Tile where the unit will emerge next turn. */
      position: Position;
    }
  | {
      /**
       * Emitted when a TUNNEL unit emerges on the surface.
       * Renderers should trigger the emergence animation on `position`.
       */
      type: 'TUNNEL_EMERGE';
      unitId: string;
      /** Tile where the unit emerged. */
      position: Position;
      /**
       * Tiles within Chebyshev distance 1 of `position` that took AoE damage
       * during emergence (both survivors and the tiles of any units that died).
       * Used purely for visual feedback — the existing UNIT_DEATH events still
       * drive death animations. Optional for backward-compatibility with any
       * persisted/legacy event streams.
       */
      affectedPositions?: Position[];
    }
  | {
      /**
       * Emitted when a RIFT_LORD creates a portal pair.
       * Renderers should display entrance and exit sprites.
       */
      type: 'PORTAL_CREATED';
      casterId: string;
      portalId: string;
      /** Tile where allied units enter the portal. */
      entrancePos: Position;
      /** Tile where allied units exit the portal. */
      exitPos: Position;
    }
  | {
      /**
       * Emitted when an enemy unit teleports through a portal.
       */
      type: 'PORTAL_USED';
      unitId: string;
      /** Portal entrance tile. */
      fromPos: Position;
      /** Portal exit tile. */
      toPos: Position;
    }
  | {
      /**
       * Emitted when a portal is removed (expired, caster died, or consumed by lava).
       * Carries both endpoint positions so the close animation plays at both tiles.
       */
      type: 'PORTAL_CLOSED';
      portalId: string;
      /** Portal entrance tile (for renderer clean-up). */
      entrancePos: Position;
      /** Portal exit tile (for renderer clean-up). */
      exitPos: Position;
    }
  | {
      /**
       * Emitted when an attacker would have applied a stun (PUNCTURE on a
       * high-DEF defender, or PIN_DOWN proc) but the stun was prevented by
       * the defender's ALERT immunity. Purely a feedback event — does not
       * change game state.
       */
      type: 'STUN_BLOCKED';
      unitId: string;
      position: Position;
      source: 'PUNCTURE' | 'PIN_DOWN';
      reason: 'ALERT';
    }
  | {
      /**
       * Emitted when an attacker's PUNCTURE tag bypassed a defender's defense
       * bonus AND a defense bonus was actually present to bypass. Not emitted
       * when the defender had no bonus to ignore.
       * Purely a feedback event — does not change game state.
       */
      type: 'DEFENSE_BONUS_IGNORED';
      attackerId: string;
      defenderId: string;
      defenderPosition: Position;
    }
  | {
      /**
       * Emitted when a tile's status flips to CORRUPTED via applyTileStatus
       * (e.g. Riftworm emergence, lava unit corruption ability). Purely a
       * feedback event; the tile's status has already been set by the call
       * that triggered it.
       */
      type: 'CORRUPTION_APPLIED';
      position: Position;
    }
  | {
      /**
       * Emitted when a cave monster returns to its home mountain tile and
       * burrows back in. The unit is removed from the game — it does not die
       * in combat, so no death animation should play.
       */
      type: 'CAVE_MONSTER_RETREAT';
      unitId: string;
      position: Position;
    }
  | {
      /**
       * Emitted during the enemy turn when a leashed Ember Demon defects because
       * its controlling Mage was killed or moved out of range. The faction flip
       * has already been applied in the immer draft by sweepLeashes; this event
       * drives the leash-burst VFX, DEFECT_TO_ENEMY animation, and floater in
       * the animation queue.
       */
      type: 'LEASH_DEFECT';
      /** ID of the demon that defected */
      demonId: string;
      /** ID of the Mage that lost control (empty string if mage was already dead) */
      mageId: string;
      /** Position of the demon at the time of defection */
      demonPos: Position;
      /** Position of the controlling Mage at the time of defection (equals demonPos if mage was dead) */
      magePos: Position;
    };
