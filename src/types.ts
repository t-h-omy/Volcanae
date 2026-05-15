/**
 * Core TypeScript types and interfaces for Volcanae.
 * No logic, only type definitions.
 */

// ============================================================================
// ENUMS (using const objects + union types for erasableSyntaxOnly compatibility)
// ============================================================================

/** Faction representing player or enemy ownership */
export const Faction = {
  PLAYER: 'PLAYER',
  ENEMY: 'ENEMY',
} as const;
export type Faction = (typeof Faction)[keyof typeof Faction];

/** Unit types for both player and enemy factions */
export const UnitType = {
  // Player units
  SPEARMAN: 'SPEARMAN',
  SWORDSMAN: 'SWORDSMAN',
  ARCHER: 'ARCHER',
  RIDER: 'RIDER',
  SIEGE: 'SIEGE',
  SCOUT: 'SCOUT',
  GUARD: 'GUARD',
  /** Player magical caster, recruited from active Crystal Chambers */
  MAGE: 'MAGE',
  /** Strong demonic unit; can be summoned by player or spawned hostile */
  EMBER_DEMON: 'EMBER_DEMON',
  /** Undead unit raised from a gravestone */
  SKELETON: 'SKELETON',
  // Enemy units
  LAVA_GRUNT: 'LAVA_GRUNT',
  LAVA_ARCHER: 'LAVA_ARCHER',
  LAVA_RIDER: 'LAVA_RIDER',
  LAVA_SIEGE: 'LAVA_SIEGE',
  EMBERLING: 'EMBERLING',
  CAVE_MONSTER: 'CAVE_MONSTER',
} as const;
export type UnitType = (typeof UnitType)[keyof typeof UnitType];

/** Building types available in the game */
export const BuildingType = {
  STRONGHOLD: 'STRONGHOLD',
  MINE: 'MINE',
  WOODCUTTER: 'WOODCUTTER',
  BARRACKS: 'BARRACKS',
  ARCHER_CAMP: 'ARCHER_CAMP',
  RIDER_CAMP: 'RIDER_CAMP',
  SIEGE_CAMP: 'SIEGE_CAMP',
  WATCHTOWER: 'WATCHTOWER',
  OUTPOST: 'OUTPOST',
  LAVALAIR: 'LAVALAIR',
  INFERNALSANCTUM: 'INFERNALSANCTUM',
  FARM: 'FARM',
  PATRICIANHOUSE: 'PATRICIANHOUSE',
  MAGMASPYR: 'MAGMASPYR',
  EMBERNEST: 'EMBERNEST',
  CRYSTAL_CHAMBER: 'CRYSTAL_CHAMBER',
  /** Grave left behind by a fallen REVIVABLE infantry unit */
  GRAVESTONE: 'GRAVESTONE',
  /** A stun trap created from a gravestone via the Grave Trap spell */
  GRAVE_TRAP: 'GRAVE_TRAP',
  /** Combat building created by sacrificing a Mage via the Crystal Tower spell */
  CRYSTAL_TOWER: 'CRYSTAL_TOWER',
} as const;
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

/** Tile types for the game grid */
export const TileType = {
  EMPTY: 'EMPTY',
  PLAINS: 'PLAINS',
  FOREST: 'FOREST',
  MOUNTAIN: 'MOUNTAIN',
  CANYON: 'CANYON',
  WATER: 'WATER',
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

/** Difficulty levels that scale enemy strength and lava speed */
export const Difficulty = {
  EASY: 'EASY',
  STANDARD: 'STANDARD',
  HARD: 'HARD',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Game phases representing different states of the game loop */
export const GamePhase = {
  PLAYER_TURN: 'PLAYER_TURN',
  ENEMY_TURN: 'ENEMY_TURN',
  LAVA_PHASE: 'LAVA_PHASE',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY',
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

/** Resource types available in the game */
export const ResourceType = {
  IRON: 'IRON',
  WOOD: 'WOOD',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

/** Determines what happens to the tile when a building is destroyed */
export const DestroyBehavior = {
  /** Building is destroyed without leaving any replacement — tile reverts to plain terrain */
  NONE: 'NONE',
  /** Building sits on a resource tile — destroying it restores the terrain (no ruin) */
  RESOURCE: 'RESOURCE',
  /** Building sits on a ruin — destroying it leaves a regular ruin */
  RUIN: 'RUIN',
  /** Building sits on a stronghold ruin — destroying it leaves a stronghold ruin */
  STRONGHOLD_RUIN: 'STRONGHOLD_RUIN',
} as const;
export type DestroyBehavior = (typeof DestroyBehavior)[keyof typeof DestroyBehavior];

/** Tech node identifier — deliberately open so nodes are defined in config, not hardcoded */
export type TechId = string;

/** Spell identifiers for the Mage spell system */
export const SpellId = {
  TRANSPOSE:      'TRANSPOSE',
  EMBERBIND:      'EMBERBIND',
  BRANDMARK_HEAL: 'BRANDMARK_HEAL',
  RAISE_SKELETON: 'RAISE_SKELETON',
  FROSTCRAFT:     'FROSTCRAFT',
  GRAVE_TRAP:     'GRAVE_TRAP',
  EXPLODE:        'EXPLODE',
  CRYSTAL_TOWER:  'CRYSTAL_TOWER',
} as const;
export type SpellId = (typeof SpellId)[keyof typeof SpellId];

/** Discriminator for tech-tree effect payloads */
export const TechEffectType = {
  UNLOCK_BUILDING:          'UNLOCK_BUILDING',
  UNLOCK_UNIT:              'UNLOCK_UNIT',
  GRANT_UNIT_TAG:           'GRANT_UNIT_TAG',
  REMOVE_UNIT_TAG:          'REMOVE_UNIT_TAG',
  UNIT_STAT_MOD:            'UNIT_STAT_MOD',
  UNIT_COST_MOD:            'UNIT_COST_MOD',
  BUILDING_PRODUCTION_MOD:  'BUILDING_PRODUCTION_MOD',
  FLAG:                     'FLAG',
  STRONGHOLD_CAP_MOD:       'STRONGHOLD_CAP_MOD',
  SPECIALIST_SLOT_MOD:      'SPECIALIST_SLOT_MOD',
  UNLOCK_SPELL:             'UNLOCK_SPELL',
} as const;
export type TechEffectType = (typeof TechEffectType)[keyof typeof TechEffectType];

/** Typed tech flags granted by the tech tree */
export const TechFlag = {
  TO_THE_FRONT:  'TO_THE_FRONT',
  HOLD_GROUND:   'HOLD_GROUND',
  GRAVE_HARVEST: 'GRAVE_HARVEST',
} as const;
export type TechFlag = (typeof TechFlag)[keyof typeof TechFlag];

/** Tags that can be applied to units */
export const UnitTag = {
  /** Unit has ranged attack capability */
  RANGED: 'RANGED',
  /** Unit stats are boosted at spawn based on spawning building proximity to lava */
  LAVABOOST: 'LAVABOOST',
  /** Unit cannot attack after moving (preparation required) */
  PREP: 'PREP',
  /** Unit can construct buildings AND initiate captures */
  BUILDANDCAPTURE: 'BUILDANDCAPTURE',
  /** Enemy unit can corrupt FOREST and MOUNTAIN terrain tiles */
  CORRUPT: 'CORRUPT',
  /** Unit prioritizes moving toward lava to be destroyed */
  SACRIFICIAL: 'SACRIFICIAL',
  /** Unit explodes when adjacent to enemy-faction units, dealing area damage */
  EXPLOSIVE: 'EXPLOSIVE',
  /** Guard-like unit can sacrifice itself to construct a Watchtower */
  FIELDWORK: 'FIELDWORK',
  /** Scout deals bonus damage when attacking full-HP enemies */
  ASSASSIN: 'ASSASSIN',
  /** Scout can heal adjacent friendly units */
  PATCHUP: 'PATCHUP',
  /** Unit grants defense to adjacent allies and gains attack per adjacent ally */
  PHALANX: 'PHALANX',
  /** Unit cannot initiate attacks but defends normally when attacked */
  PASSIVE: 'PASSIVE',
  // ── Deep tech tree tags ──────────────────────────────────────────────────────
  /** Rider gains attack bonus when attacking without having moved this turn */
  LANCE_CHARGE: 'LANCE_CHARGE',
  /** Upgraded knight rider with boosted HP and DEF */
  KNIGHT: 'KNIGHT',
  /** Rider may move before and after attacking */
  HIT_AND_RUN: 'HIT_AND_RUN',
  /** Rider with +1 MOV; loses BUILDANDCAPTURE */
  OUTRIDER: 'OUTRIDER',
  /** Archer does not suffer ranged counter-attacks */
  COVER: 'COVER',
  /** Archer with +1 MOV */
  SKIRMISHER: 'SKIRMISHER',
  /** Archer attacks inflict pinned status on the target */
  PIN_DOWN: 'PIN_DOWN',
  /** Archer hits permanently reduce target DEF */
  DISTRACTION: 'DISTRACTION',
  /** Siege unit fires instantly at enemy units that move into its attack range */
  PREVENTIVE_STRIKE: 'PREVENTIVE_STRIKE',
  /** Elite unit with increased max HP */
  ELITE: 'ELITE',
  // ── Specialist-granted tags ──────────────────────────────────────────────────
  /** Attack buildings (Watchtowers, Outposts) owned by the player gain +15 ATK and +1 range */
  FORTIFIED_GARRISON: 'FORTIFIED_GARRISON',
  /** Rider that kills an enemy can attack once more this turn at half attack with no retaliation */
  BLOODLUST: 'BLOODLUST',
  /** Siege unit deals 25% of dealt damage to all enemy units surrounding the target */
  SPLASH: 'SPLASH',
  /** Spearman unit can move and attack immediately after being recruited */
  READY: 'READY',
  /** Spearman unit leaves a Gravestone building on death that can be revived */
  REVIVABLE: 'REVIVABLE',
  // ── Mage system tags ────────────────────────────────────────────────────────
  /** Unit was summoned, not recruited; modifies several systems */
  SUMMONED: 'SUMMONED',
  /** Unit carries the Brandmark Heal mark; loses HP each turn; on death becomes a hostile Ember Demon */
  BRANDMARKED: 'BRANDMARKED',
  /** Summoned unit that defects to the enemy faction if its controller mage is out of leash range or dead */
  LEASHED: 'LEASHED',
  /** Leaves no body on death. Cannot become a Gravestone. */
  NO_GRAVESTONE: 'NO_GRAVESTONE',
  /** Unit leaves a Gravestone on death (granted by Necromancer tech tree). */
  LEAVES_GRAVESTONE: 'LEAVES_GRAVESTONE',
} as const;
export type UnitTag = (typeof UnitTag)[keyof typeof UnitTag];

// ============================================================================
// TECH TREE TYPES
// ============================================================================

/** A single stat modifier entry (used in TechEffect and TAG_STAT_EFFECTS) */
export interface StatModifier {
  stat: keyof UnitStats;
  mode: 'add' | 'percent';
  value: number;
}

/** A single effect granted when a tech node is unlocked */
export type TechEffect =
  | { type: 'UNLOCK_BUILDING';         buildingType: BuildingType }
  | { type: 'UNLOCK_UNIT';             unitType: UnitType }
  | { type: 'GRANT_UNIT_TAG';          unitType: UnitType; tag: UnitTag }
  | { type: 'REMOVE_UNIT_TAG';         unitType: UnitType; tag: UnitTag }
  | { type: 'UNIT_STAT_MOD';           unitType: UnitType; stat: keyof UnitStats; mode: 'add' | 'percent'; value: number }
  | { type: 'UNIT_COST_MOD';           unitType: UnitType; resource: 'iron' | 'wood'; amount: number }
  | { type: 'BUILDING_PRODUCTION_MOD'; buildingType: BuildingType; resource: ResourceType; chancePercent: number; amount: number }
  | { type: 'FLAG';                    flag: TechFlag }
  | { type: 'STRONGHOLD_CAP_MOD';      capType: 'farmer' | 'noble'; amount: number }
  | { type: 'SPECIALIST_SLOT_MOD';     value: number }
  | { type: 'UNLOCK_SPELL';            spellId: SpellId };

/** Static definition of a tech-tree node (lives in gameConfig) */
export interface TechNodeDefinition {
  id: TechId;
  name: string;
  description: string;
  requires: TechId[];
  /** Crystal cost to unlock this node. Defaults to 1 if omitted. */
  cost?: number;
  effects: TechEffect[];
}

/** Runtime state for a single tech node */
export interface TechNodeState {
  id: TechId;
  unlocked: boolean;
}

// ============================================================================
// INTERFACES
// ============================================================================

/** Position on the game grid */
export interface Position {
  x: number;
  y: number;
}

/** Stats for a unit */
export interface UnitStats {
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  moveRange: number;
  discoverRadius: number;
  triggerRange: number;
  movementActions: number;
  attackRange: number;
}

/** A unit in the game */
export interface Unit {
  id: string;
  type: UnitType;
  faction: Faction;
  position: Position;
  stats: UnitStats;
  tags: UnitTag[];
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  hasConstructedThisTurn: boolean;
  hasDestroyedThisTurn: boolean;
  hasCapturedThisTurn: boolean;
  /** True after a HIT_AND_RUN unit has used its post-attack move this turn. */
  hasUsedPostAttackMoveThisTurn: boolean;
  /** True when a BLOODLUST rider has killed an enemy this turn and can attack once more at half power. */
  bloodlustAttackAvailable: boolean;
  xp: number;
  level: number;
  /** Turn number during which the unit is stunned (cannot move or attack). 0 = not stunned. */
  pinnedUntilTurn: number;
  /**
   * Accumulated DEF reduction from DISTRACTION archer hits.
   * Stored for display purposes only — the reduction is already applied to stats.defense.
   */
  distractionDefPenalty: number;
  /** Turn number during which this unit last moved. 0 = never moved (or pre-dates this field). */
  lastMovedTurn: number;
  /**
   * Set on player-summoned EMBER_DEMON; the id of the Mage that controls it via leash.
   * `null` or `undefined` means no controller. Cleared on defection.
   */
  controllerMageId?: string | null;
  /** Set on Mage units; true after the unit has cast a spell this turn. Reset each player turn. */
  hasCastThisTurn?: boolean;
}

/** Defines a single stat boost applied when a unit reaches a new level */
export interface UnitLevelStatBoost {
  stat: keyof UnitStats;
  mode: 'add' | 'percent';
  value: number;
}

/** Defines the XP threshold and stat boosts for a specific level */
export interface UnitLevelDefinition {
  xpRequired: number;
  boosts: UnitLevelStatBoost[];
}

/** Effect that a specialist can apply */
export interface SpecialistEffect {
  type: string;
  params: Record<string, number | string>;
}

/** A specialist that can be assigned to buildings */
export interface Specialist {
  id: string;
  name: string;
  description: string;
  effects: SpecialistEffect[];
  assignedBuildingId: string | null;
  /** Iron cost per turn; default 0 */
  upkeepIron?: number;
  /** Wood cost per turn; default 0 */
  upkeepWood?: number;
  /** true when upkeep could not be paid; effects inactive while true */
  dormant?: boolean;
}

/** Combat stats for buildings that can attack (e.g. Watchtower, Magma Spyr) */
export interface BuildingCombatStats {
  attack: number;
  defense: number;
  attackRange: number;
  /** Maximum number of different targets the building can attack per turn (default: 1) */
  maxAttacksPerTurn?: number;
}

/** A building on the map */
export interface Building {
  id: string;
  type: BuildingType;
  faction: Faction | null;
  position: Position;
  hp: number;
  maxHp: number;
  specialistSlot: string | null;
  isDisabledForTurns: number;
  wasAttackedLastEnemyTurn: boolean;
  captureProgress: number;
  isBeingCapturedBy: string | null;
  lavaBoostEnabled: boolean;
  discoverRadius: number;
  turnCapturedByPlayer: number | null;
  wasEnemyOwnedBeforeCapture: boolean;
  /** Combat stats for attacking buildings (null if building cannot attack) */
  combatStats: BuildingCombatStats | null;
  /** Whether this building has attacked this turn */
  hasAttackedThisTurn: boolean;
  /** Tags for attacking buildings (e.g. RANGED) */
  tags: UnitTag[];
  /** Whether capturing this building consumes the capturing unit */
  consumesUnitOnCapture: boolean;
  /** Current number of people in this house — only relevant for FARM, PATRICIANHOUSE, and STRONGHOLD (farmers) */
  populationCount: number;
  /** Maximum population for this house — only relevant for FARM and PATRICIANHOUSE */
  populationCap: number;
  /** Turns elapsed since last population growth — only for FARM, PATRICIANHOUSE, and STRONGHOLD */
  populationGrowthCounter: number;
  /** Number of nobles housed in this stronghold — only relevant for STRONGHOLD */
  strongholdNobles: number;
  /** Turns since last Emberling spawn — only for EMBERNEST */
  emberSpawnCounter: number;
  /** Queued unit type for next spawn — used by LAVALAIR/INFERNALSANCTUM dynamic recruitment */
  recruitmentQueue: UnitType | null;
  /** What happens to the tile when this building is destroyed */
  destroyBehavior: DestroyBehavior;
  /** Turns of resonance remaining on this chamber (0 = not resonating). Only relevant for CRYSTAL_CHAMBER. */
  resonanceTurnsRemaining: number;
  /** Remaining cooldown turns before this building can spawn again. */
  spawnCooldownRemaining: number;
  /**
   * The turn number on which this building last recruited a unit.
   * 0 means it has never recruited. Used to enforce the 1-recruit-per-turn limit.
   */
  lastRecruitmentTurn: number;
  /**
   * Unit type stored in this Gravestone building.
   * Only set for GRAVESTONE buildings; undefined for all others.
   */
  gravesUnitType?: UnitType | null;
  /**
   * For GRAVE_TRAP buildings: number of turns a triggering unit is stunned.
   * Defaults to ABILITIES.GRAVE_TRAP_STUN_TURNS at creation time.
   */
  trapStunTurns?: number;
}

/** A tile on the game grid */
export interface Tile {
  position: Position;
  type: TileType;
  isRevealed: boolean;
  buildingId: string | null;
  unitId: string | null;
  isLava: boolean;
  isLavaPreview: boolean;
  isRuin: boolean;
  isStrongholdRuin: boolean;
  terrainType: TileType;
  /** true on ~33% of Mountain tiles; set during map gen; cleared permanently on seal, explore, or despawn */
  hasCaveMonster?: boolean;
  /**
   * true for tiles frozen by Frostcraft. Tile remains `terrainType === TileType.WATER` underneath;
   * the boolean overlays passability rules. Cleared when consumed by lava or otherwise destroyed.
   */
  isIce?: boolean;
}

/** Resources available to the player */
export interface Resources {
  iron: number;
  wood: number;
  farmers: number;
  nobles: number;
}

/** Population cost a unit occupies while alive */
export interface UnitPopulationCost {
  farmers: number;
  nobles: number;
}

/** Statistics accumulated over the course of a game session */
export interface GameStats {
  /** Enemy units killed by the player */
  unitsKilled: number;
  /** Player units lost to enemies or lava */
  unitsLost: number;
  /** Total damage dealt by player units to enemies */
  damageDealt: number;
  /** Total damage received by player units from enemies */
  damageReceived: number;
  /** Player units recruited */
  unitsRecruited: number;
  /** Player buildings constructed */
  buildingsConstructed: number;
  /** Tech nodes unlocked */
  techsUnlocked: number;
  /** Enemy buildings destroyed by the player */
  enemyBuildingsDestroyed: number;
  /** Enemy buildings captured by the player */
  enemyBuildingsCaptured: number;
  /** Player buildings destroyed or neutralised by the enemy */
  buildingsDestroyedByEnemy: number;
  /** Player buildings captured by the enemy */
  buildingsCapturedByEnemy: number;
  /** Player buildings (or ruins) consumed by lava */
  buildingsDestroyedByLava: number;
}

/** A live cave-monster encounter tied to a specific mountain tile */
export interface CaveEncounter {
  /** Unit id of the cave monster */
  monsterId: string;
  /** Tile id of the originating mountain */
  mountainTileId: string;
}

/** Complete game state */
export interface GameState {
  turn: number;
  phase: GamePhase;
  grid: Tile[][];
  units: Record<string, Unit>;
  buildings: Record<string, Building>;
  specialists: Record<string, Specialist>;
  globalSpecialistStorage: string[];
  resources: Resources;
  lavaFrontRow: number;
  turnsUntilLavaAdvance: number;
  selectedUnitId: string | null;
  selectedBuildingId: string | null;
  selectedTilePos: Position | null;
  /** When non-null, the player is choosing a heal target on the map */
  pendingHealerId: string | null;
  ember: number;
  /**
   * Cumulative breakdown of where Ember Level increases have come from.
   * Used by the Ember Level info popup to show a source attribution.
   */
  emberLevelSources: {
    /** Total gained from turn-based natural progression */
    turns: number;
    /** Total gained from Emberling sacrifices to lava */
    emberlingSacrifices: number;
    /** Total gained from all other sources (stronghold captures, lava advance, etc.) */
    other: number;
  };
  zonesUnlocked: number[];
  techNodes: Record<TechId, TechNodeState>;
  techFlags: TechFlag[];
  arcaneCrystals: number;
  unlockedBuildings: BuildingType[];
  unlockedUnits: UnitType[];
  /** Spell ids unlocked via the tech tree (mutated by applyTechEffect on UNLOCK_SPELL). */
  unlockedSpells: SpellId[];
  /** Accumulated game statistics for the end-game screen */
  gameStats: GameStats;
  /** Number of enemy units that were spawned during the most recent enemy turn */
  enemyUnitsSpawnedLastTurn: number;
  /** Selected difficulty level that scales enemy stats and lava speed */
  difficulty: Difficulty;
  /**
   * Zone lockout state for the Sanctum Collapse feature.
   * Maps zone number (1–5) to the turn number on which the lockout expires.
   * An entry zoneLockoutUntilTurn[z] = T means: enemy units may not cross the
   * lower border of zone z until turn T (exclusive). Missing key = no lockout.
   * Only written when SANCTUM_COLLAPSE.ZONE_LOCKOUT_TURNS > 0.
   */
  zoneLockoutUntilTurn: Partial<Record<number, number>>;
  /**
   * Turn number on which the spawn freeze from Sanctum Collapse expires.
   * When state.turn < spawnFreezeUntilTurn, spawnEnemyUnits() is a no-op.
   * Value of 0 means no active freeze.
   */
  spawnFreezeUntilTurn: number;
  /**
   * Legacy field retained for save-file compatibility. No longer written by
   * Sanctum Collapse (which now increments turnsUntilLavaAdvance directly).
   * Value is always 0 in new saves.
   */
  lavaFreezeUntilTurn: number;
  /**
   * Indicates what caused the game-over loss condition.
   * 'LAVA' — the last stronghold was consumed by lava.
   * 'ENEMY' — the last stronghold was destroyed by Volcael forces.
   * null — cause not yet determined or game not over.
   */
  gameOverCause: 'LAVA' | 'ENEMY' | null;
  /** Maximum number of hired specialists allowed; starts at 2 */
  specialistSlotCap: number;
  /** One entry per live cave monster on the map */
  activeCaveEncounters: CaveEncounter[];
  /**
   * Whether the FORTIFIED_GARRISON specialist effect is currently active.
   * When true, all player-owned Watchtowers and Outposts have their attack and
   * attack range boosted by the FORTIFIED_GARRISON constants.
   */
  fortifiedGarrisonActive: boolean;
  /**
   * When non-null, the player is choosing a spell target on the map
   * (analogous to `pendingHealerId`). Mutually exclusive with `pendingHealerId`.
   */
  pendingSpellCast: { mageId: string; spellId: SpellId } | null;
  /**
   * Transpose is a two-step spell: first click records the first unit here;
   * second click completes the swap. Cleared when the spell is confirmed or cancelled.
   */
  pendingTransposeFirstUnitId: string | null;
  /**
   * Units pending the two-stage Brandmark transform. Each entry is a player
   * unit whose HP has reached 0 but has not yet been replaced by an Ember Demon.
   * Entries are processed (unit removed, demon spawned) by finalizeBrandmarkTransforms
   * after the TRANSFORM_TO_DEMON animation completes.
   */
  pendingBrandmarkTransforms: Array<{ unitId: string; position: Position }>;
}
