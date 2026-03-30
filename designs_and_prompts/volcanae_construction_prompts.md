# Volcanae — Construction System Prompt Chain

These prompts implement the following new systems on top of the existing codebase:
Construction system, Terrain tiles, Ruins, Lava Lairs, Capture refactor,
Population/House system, Corruption system, Emberling unit, Win condition update.

Execute prompts in order. Each prompt depends on all previous ones being complete.
All prompts reference the existing file structure of the Volcanae project.
Never modify gameConfig.ts for anything other than adding new constant sections.
Always use isTileWithinEdgeCircleRange from rangeUtils.ts for all range checks.

---

## PROMPT CS-01 — Type System Overhaul (types.ts)

Modify src/types.ts. Do not change any existing type or enum value — only ADD to them.

ADD to the TileType const object:
- FOREST: 'FOREST'
- MOUNTAIN: 'MOUNTAIN'

ADD to the BuildingType const object:
- LAVA_LAIR: 'LAVA_LAIR' (enemy recruitment building, constructed on ruins)
- INFERNAL_SANCTUM: 'INFERNAL_SANCTUM' (enemy building, constructed on stronghold ruins)
- FARM: 'FARM' (player building, constructed on ruins, produces farmer population)
- PATRICIAN_HOUSE: 'PATRICIAN_HOUSE' (player building, constructed on ruins, produces noble population)
- MAGMA_SPYR: 'MAGMA_SPYR' (corrupted mountain — auto-attacks player units)
- EMBER_NEST: 'EMBER_NEST' (corrupted forest — spawns Emberling units)

ADD to the UnitType const object:
- EMBERLING: 'EMBERLING' (weak enemy unit that sacrifices itself to lava)

REPLACE the UnitTag const object entirely with these values (do not keep NO_CAPTURE):
- RANGED: 'RANGED' (existing — unit has ranged attack)
- LAVA_BOOST: 'LAVA_BOOST' (existing — unit stats boosted at spawn based on lava proximity)
- PREP: 'PREP' (existing — unit cannot move and attack in same turn)
- BUILD_AND_CAPTURE: 'BUILD_AND_CAPTURE' (new unified tag — unit can construct buildings AND initiate captures)
- CORRUPT: 'CORRUPT' (new — enemy unit can corrupt FOREST and MOUNTAIN terrain tiles)
- SACRIFICIAL: 'SACRIFICIAL' (new — unit prioritizes moving toward lava to be destroyed)
- EXPLOSIVE: 'EXPLOSIVE' (new — unit explodes when adjacent to enemy-faction units, dealing area damage)

ADD to the Tile interface (after isLavaPreview):
- isRuin: boolean (tile contains a ruin — can be constructed on)
- isStrongholdRuin: boolean (tile contains a stronghold ruin — only STRONGHOLD or INFERNAL_SANCTUM can be built here)
- terrainType: TileType (the base terrain: PLAINS, FOREST, or MOUNTAIN — persists even when a building is on it)

ADD to the Building interface (after hasActedThisTurn):
- populationCount: number (current number of people in this house — only relevant for FARM and PATRICIAN_HOUSE)
- populationCap: number (maximum population for this house — only relevant for FARM and PATRICIAN_HOUSE)
- populationGrowthCounter: number (turns elapsed since last population growth — only for FARM and PATRICIAN_HOUSE)
- emberSpawnCounter: number (turns since last Emberling spawn — only for EMBER_NEST)

ADD to the Resources interface:
- farmers: number (NOT a consumed resource — tracked for UI display only; actual cap is computed from farm populationCount)
- nobles: number (NOT a consumed resource — tracked for UI display only; actual cap is computed from patrician house populationCount)

Note: farmers and nobles in Resources are updated each turn by summing all farm/patrician house populations.
They are display values, not transaction values. The actual recruitment gate-check uses live building data.

ADD new interface UnitPopulationCost:
- farmers: number (farmer slots this unit occupies while alive)
- nobles: number (noble slots this unit occupies while alive)

---

## PROMPT CS-02 — gameConfig Extensions (gameConfig.ts)

Modify src/gameConfig.ts. Only ADD new sections — do not change any existing constant.

ADD a new TERRAIN section:
- FORESTS_PER_ZONE: 2
- MOUNTAINS_PER_ZONE: 2
- RUINS_PER_ZONE: 3
- ZONE1_FOREST_MIN_DISTANCE: 2 (min edge-circle range from zone 1 stronghold, guaranteed forest)
- ZONE1_FOREST_MAX_DISTANCE: 4 (max edge-circle range from zone 1 stronghold, guaranteed forest)
Note: terrain tiles must be distributed so that every zone has at least 1 of each type.
If a zone receives 0 of one type due to carry-forward logic, the next zone must receive at least 1 of that type.

ADD a new CONSTRUCTION section:
Building construction costs (iron, wood) paid from global resource pool:
- WOODCUTTER_COST: { iron: 0, wood: 0 }
- MINE_COST: { iron: 0, wood: 1 }
- BARRACKS_COST: { iron: 0, wood: 1 }
- ARCHER_CAMP_COST: { iron: 0, wood: 1 }
- RIDER_CAMP_COST: { iron: 1, wood: 1 }
- SIEGE_CAMP_COST: { iron: 1, wood: 1 }
- FARM_COST: { iron: 0, wood: 1 }
- PATRICIAN_HOUSE_COST: { iron: 2, wood: 2 }
- STRONGHOLD_COST: { iron: 2, wood: 2 }
Enemy construction (used by AI, not player):
- LAVA_LAIR_COST: { iron: 0, wood: 0 }
- INFERNAL_SANCTUM_COST: { iron: 0, wood: 0 }

ADD a new POPULATION section:
- FARM_POPULATION_CAP: 3
- PATRICIAN_HOUSE_POPULATION_CAP: 3
- HOUSE_INITIAL_POPULATION: 1
- HOUSE_GROWTH_INTERVAL: 2 (turns between population increases, same for both house types)

ADD a new UNIT_POPULATION_COSTS section as Record<string, UnitPopulationCost> (import from types.ts):
- INFANTRY: { farmers: 1, nobles: 0 }
- ARCHER: { farmers: 1, nobles: 0 }
- RIDER: { farmers: 1, nobles: 0 }
- GUARD: { farmers: 1, nobles: 0 }
- SCOUT: { farmers: 0, nobles: 1 }
- SIEGE: { farmers: 0, nobles: 1 }
(Enemy units and Emberling have no population cost — they are not player units)

ADD to the BUILDINGS section (do not remove existing fields):
- DISCOVER_RADIUS for new building types: LAVA_LAIR: 2, INFERNAL_SANCTUM: 2, FARM: 2, PATRICIAN_HOUSE: 2, MAGMA_SPYR: 3, EMBER_NEST: 2

ADD a new LAVA_LAIR section:
- MAGMA_SPYR_STATS: { maxHp: 120, attack: 40, defense: 60, attackRange: 2, maxAttacksPerTurn: 2 }
- EMBER_NEST_SPAWN_INTERVAL: 3 (turns between Emberling spawns)
- EMBER_NEST_MAX_EMBERLINGS: 3 (max active Emberlings spawned by one Ember Nest)

ADD to the UNITS section (new unit entries):
EMBERLING:
- maxHp: 30
- attack: 0
- defense: 10
- movementActions: 1
- moveRange: 2
- attackRange: 1
- discoverRadius: 1
- triggerRange: 0
- explosionDamage: 25 (damage dealt to each player unit in range 1 on explosion)

ADD a new ENEMY_UNIT_UNLOCK section as Record<string, number> mapping UnitType to minimum threatLevel required:
- LAVA_GRUNT: 0
- LAVA_ARCHER: 2
- LAVA_RIDER: 3
- LAVA_SIEGE: 5
- EMBERLING: 1

ADD to the UNIT_COSTS section (these are the iron/wood costs to build the building that spawns them — enemy has no resource costs, so this section is unchanged; player unit costs unchanged).

ADD new AI_SCORING fields (do not remove existing):
- BASE_BUILD_LAVA_LAIR: 75 (enemy score for constructing a lava lair on a ruin)
- BASE_CORRUPT_TERRAIN: 60 (enemy score for corrupting a forest or mountain)
- BASE_EMBERLING_SACRIFICE: 80 (Emberling AI score for moving toward lava)
- BASE_EMBERLING_EXPLODE: 95 (Emberling AI score for exploding near player unit)
- BASE_EMBERLING_ADVANCE: 20

---

## PROMPT CS-03 — Map Generator Overhaul (mapGenerator.ts)

Rewrite src/mapGenerator.ts. The existing functions generateId, resetIdCounter, getZoneRowRange,
isPositionOccupied, markPositionOccupied, getRandomPositionInZone, createBuilding, createUnit,
createGrid, and generateInitialGameState must all be preserved but heavily modified.

CHANGES to createGrid:
- All tiles must initialize with the new fields from CS-01:
  isRuin: false, isStrongholdRuin: false, terrainType: TileType.PLAINS
- The Tile.type field is now always PLAINS by default (terrain is stored in terrainType instead)
- Do not remove any existing Tile fields

CHANGES to createBuilding:
- Add initialization for new Building fields from CS-01:
  populationCount: 0, populationCap: 0, populationGrowthCounter: 0, emberSpawnCounter: 0
- For FARM: populationCap = POPULATION.FARM_POPULATION_CAP, populationCount = POPULATION.HOUSE_INITIAL_POPULATION
- For PATRICIAN_HOUSE: populationCap = POPULATION.PATRICIAN_HOUSE_POPULATION_CAP, populationCount = POPULATION.HOUSE_INITIAL_POPULATION
- Add DISCOVER_RADIUS entries for all new BuildingTypes

CHANGES to unit creation (createUnit):
- INFANTRY, ARCHER, RIDER, GUARD: add BUILD_AND_CAPTURE to tags array
- SIEGE: keep PREP tag, do NOT add BUILD_AND_CAPTURE
- SCOUT: keep NO_CAPTURE behavior via absence of BUILD_AND_CAPTURE (remove UnitTag.NO_CAPTURE since it no longer exists)
- LAVA_GRUNT: add BUILD_AND_CAPTURE and CORRUPT tags
- All other enemy unit types (LAVA_ARCHER, LAVA_RIDER, LAVA_SIEGE): no BUILD_AND_CAPTURE, no CORRUPT
- EMBERLING: add SACRIFICIAL and EXPLOSIVE tags; do not add RANGED

NEW function placeTerrainForZone(zone, grid, occupiedPositions, config):
Places FOREST and MOUNTAIN tiles in a zone by setting tile.terrainType.
- Place TERRAIN.FORESTS_PER_ZONE forest tiles per zone
- Place TERRAIN.MOUNTAINS_PER_ZONE mountain tiles per zone
- Terrain tiles must not overlap with buildings or each other
- Mark terrain tile positions as occupied to prevent building placement on them
- Store terrain positions for later use in guaranteed-forest logic

NEW function guaranteeForestNearStronghold(zone1StrongholdPos, grid, occupiedPositions):
Ensures at least one FOREST tile exists within edge-circle range
TERRAIN.ZONE1_FOREST_MIN_DISTANCE to TERRAIN.ZONE1_FOREST_MAX_DISTANCE of the zone 1 stronghold.
Use isTileWithinEdgeCircleRange from rangeUtils.ts for the range check.
If no forest was placed in that range during placeTerrainForZone, place one additional FOREST tile
in a valid position within that range.

NEW function placeRuinsForZone(zone, grid, occupiedPositions):
Places TERRAIN.RUINS_PER_ZONE ruins in the zone.
Ruins are placed by setting tile.isRuin = true on PLAINS tiles (not on FOREST or MOUNTAIN tiles).
Mark ruin positions as occupied so buildings cannot be placed on top.

CHANGES to generateBuildingsForZone:
- REMOVE generation of MINE, WOODCUTTER, BARRACKS, ARCHER_CAMP, RIDER_CAMP, SIEGE_CAMP
- Only generate: 1 STRONGHOLD per zone
- WATCHTOWER generation logic is unchanged

CHANGES to generateInitialGameState:
- Call placeTerrainForZone for each zone before placing buildings
- Call guaranteeForestNearStronghold after zone 1 terrain is placed
- Call placeRuinsForZone for each zone after terrain is placed
- Zone-balance check: if any zone has 0 FOREST or 0 MOUNTAIN tiles, give 1 of the missing type to the next zone
- Zone 1 STRONGHOLD faction = PLAYER (unchanged)
- Zones 2-3 STRONGHOLD faction = null (neutral)
- Zones 4-5 STRONGHOLD faction = ENEMY (unchanged)
- Player starts with 1 INFANTRY unit on the zone 1 stronghold (unchanged)
- Player starts with resources: { iron: 1, wood: 1, farmers: 0, nobles: 0 }
- After placing enemy units, also assign BUILD_AND_CAPTURE and CORRUPT tags to LAVA_GRUNT units (handled via createUnit)
- No enemy LAVA_LAIR buildings are placed at game start — enemy must build them

---

## PROMPT CS-04 — Construction System (new file: constructionSystem.ts)

Create a new file src/constructionSystem.ts.

This module handles all building construction actions:
1. Player units constructing buildings on terrain and ruins
2. Player destroying their own buildings (UI action, not unit action)
3. Enemy units constructing LAVA_LAIR and INFERNAL_SANCTUM on ruins

Import from: types.ts (all relevant types), gameConfig.ts (CONSTRUCTION, TERRAIN, POPULATION, BUILDINGS),
rangeUtils.ts (isTileWithinEdgeCircleRange), and immer (produce, Draft).

SECTION: Type definitions (local to this module)

Define type ConstructableBuilding as a union of BuildingType values the player can build:
WOODCUTTER, MINE, BARRACKS, ARCHER_CAMP, RIDER_CAMP, SIEGE_CAMP, FARM, PATRICIAN_HOUSE, STRONGHOLD.

Define type EnemyConstructableBuilding: LAVA_LAIR, INFERNAL_SANCTUM.

Define interface ConstructionOption:
- buildingType: BuildingType
- cost: { iron: number; wood: number }
- label: string
- emoji: string

SECTION: Helper functions

getConstructionOptionsForTile(state, tilePos): ConstructionOption[]
Returns the list of buildings the player can construct on a given tile.
Rules:
- If tile.isStrongholdRuin: return [STRONGHOLD] only
- If tile.isRuin: return all non-terrain player buildings (BARRACKS, ARCHER_CAMP, RIDER_CAMP, SIEGE_CAMP, FARM, PATRICIAN_HOUSE)
- If tile.terrainType === FOREST and tile.buildingId === null: return [WOODCUTTER]
- If tile.terrainType === MOUNTAIN and tile.buildingId === null: return [MINE]
- Otherwise: return []
Note: a tile can be both FOREST and isRuin (e.g., a woodcutter was built on forest, then captured).
In that case return both the forest option AND the ruin options.

canConstructAt(state, unitId, tilePos, buildingType): boolean
Returns true if the unit can construct the given building at tilePos.
Checks:
- Unit exists and has BUILD_AND_CAPTURE tag
- Unit is on the exact same tile as tilePos (unit.position.x === tilePos.x && unit.position.y === tilePos.y)
- Unit has not moved, acted, or captured this turn
- The tile supports the requested buildingType (use getConstructionOptionsForTile)
- Player has enough iron and wood (from global resource pool)
- The tile does not already have a building (buildingId === null), unless it is FOREST/MOUNTAIN terrain

canEnemyConstructAt(state, unitId, tilePos, buildingType): boolean
Same logic for enemy units:
- Unit has BUILD_AND_CAPTURE tag
- Unit is on the tile
- Unit has not acted this turn
- If tile.isStrongholdRuin: only INFERNAL_SANCTUM allowed
- If tile.isRuin (and not stronghold ruin): only LAVA_LAIR allowed
- No resource cost check (enemy has no resources)

SECTION: Player construction

constructBuilding(state: Draft<GameState>, unitId, tilePos, buildingType): void
(This function mutates the immer Draft directly — no produce() wrapper)
Steps:
1. Validate with canConstructAt — throw if invalid
2. Deduct iron and wood cost from state.resources
3. Create a new Building object using the same pattern as createBuilding in mapGenerator.ts
   - For FARM: set populationCount = HOUSE_INITIAL_POPULATION, populationCap = FARM_POPULATION_CAP
   - For PATRICIAN_HOUSE: set populationCount = HOUSE_INITIAL_POPULATION, populationCap = PATRICIAN_HOUSE_POPULATION_CAP
   - For all others: populationCount = 0, populationCap = 0
   - Use generateId from mapGenerator.ts (export that function so it can be imported here)
4. Add building to state.buildings
5. Set state.grid[tilePos.y][tilePos.x].buildingId = newBuilding.id
6. If tile.isRuin: set tile.isRuin = false
7. If tile.isStrongholdRuin: set tile.isStrongholdRuin = false
8. Mark unit: hasMovedThisTurn = true, hasActedThisTurn = true, hasCapturedThisTurn = true

SECTION: Player destroy own building (UI action — no unit action cost)

destroyOwnBuilding(state: Draft<GameState>, unitId, buildingId): void
This is triggered from the building UI panel (not a unit turn action).
The unit must be on the same tile as the building AND have BUILD_AND_CAPTURE tag.
Steps:
1. Validate: unit exists, has BUILD_AND_CAPTURE tag, unit is on the building's tile
2. If building has a specialist assigned: move specialist to globalSpecialistStorage
3. Remove building from state.buildings
4. Set state.grid[y][x].buildingId = null
5. Determine ruin type:
   - If building.type === STRONGHOLD: set tile.isStrongholdRuin = true
   - Otherwise: set tile.isRuin = true
6. Do NOT consume any unit actions (this is a UI action, not a unit turn action)

Note: the unit is on the tile, but the building UI must still be accessible.
This requires a UI change (see CS-13): when a player unit with BUILD_AND_CAPTURE is on a player-owned building,
the building UI panel shows a "Demolish" button that calls destroyOwnBuilding.

SECTION: Enemy construction

enemyConstructBuilding(state: Draft<GameState>, unitId, tilePos, buildingType): void
Steps:
1. Validate with canEnemyConstructAt
2. Create a new Building of the given type with faction = ENEMY
3. For LAVA_LAIR: lavaBoostEnabled = true (enemy spawn units get lava boost)
4. Add building to state.buildings
5. Set grid tile buildingId
6. Set tile.isRuin = false (or isStrongholdRuin = false if applicable)
7. Mark unit: hasMovedThisTurn = true, hasActedThisTurn = true

Export all public functions.

---

## PROMPT CS-05 — Capture System Refactor (captureSystem.ts)

Rewrite the capture behavior in src/captureSystem.ts. The existing functions canCapture,
initiateCapture, resolveCaptures, and updateZonesUnlocked must be modified as described.
The internal helper isUnitOnBuilding is unchanged.

FUNDAMENTAL BEHAVIOR CHANGE:
Capturing a building now DESTROYS it and turns the tile into a ruin, instead of transferring ownership.
This applies to all building types captured by either faction.

CHANGES to canCapture(state, unitId, buildingId):
- Replace check for UnitTag.NO_CAPTURE (no longer exists) with:
  unit must have UnitTag.BUILD_AND_CAPTURE to be able to capture
- A unit cannot capture a building it already owns (same faction)
- A unit cannot capture its own faction's buildings
- Zone lock check is unchanged for player units
- Enemy units are NOT zone-locked
- All other existing checks remain

CHANGES to resolveCaptures(state):
When a capture completes (captureProgress === 1):
1. Get the building and the capturing unit
2. If building has an assigned specialist:
   - If capturing unit is PLAYER faction: move specialist to globalSpecialistStorage
   - If capturing unit is ENEMY faction: specialist is LOST (remove from state.specialists)
3. Store building.type and building.position before removing
4. Remove the building from state.buildings
5. Set state.grid[y][x].buildingId = null
6. Determine ruin type:
   - If building.type === STRONGHOLD: set tile.isStrongholdRuin = true
   - Otherwise: set tile.isRuin = true
7. Call updateZonesUnlocked(state) (unchanged logic)
8. Set capturing unit: hasCapturedThisTurn = true, hasMovedThisTurn = true, hasActedThisTurn = true
9. Clear captureProgress and isBeingCapturedBy on the (now removed) building reference is not needed — building is gone

CHANGES to updateZonesUnlocked(state):
No change needed — it still checks for STRONGHOLD buildings with PLAYER faction.
After capturing changes strongholds to ruins, the zone lock will naturally re-evaluate.

---

## PROMPT CS-06 — Population and House System (resourceSystem.ts)

Modify src/resourceSystem.ts. Add population tracking and recruitment gating.
Do not change existing resource production or recruitment logic — only extend it.

ADD function computePopulationCapacity(state):
Returns { farmerCapacity: number; nobleCapacity: number }
- farmerCapacity = sum of populationCount for all player-owned FARM buildings
- nobleCapacity = sum of populationCount for all player-owned PATRICIAN_HOUSE buildings

ADD function computePopulationUsage(state):
Returns { farmersUsed: number; noblesUsed: number }
- Iterate over all player-owned units (faction === PLAYER)
- For each unit, look up UNIT_POPULATION_COSTS[unit.type]
- Sum all farmer costs and noble costs

ADD function canAffordPopulation(state, unitType: UnitType): boolean
- capacity = computePopulationCapacity(state)
- usage = computePopulationUsage(state)
- cost = UNIT_POPULATION_COSTS[unitType] ?? { farmers: 0, nobles: 0 }
- Return: (usage.farmersUsed + cost.farmers <= capacity.farmerCapacity) AND
          (usage.noblesUsed + cost.nobles <= capacity.nobleCapacity)

MODIFY the existing recruitUnit(state, buildingId, unitType) function:
Add a population check before deducting resources:
- If !canAffordPopulation(state, unitType): do not recruit (return unchanged state or log a warning)

ADD function growHousePopulations(state: Draft<GameState>): void
(mutates the immer Draft directly)
- For each player-owned FARM and PATRICIAN_HOUSE building:
  - If populationCount < populationCap:
    - Increment populationGrowthCounter by 1
    - If populationGrowthCounter >= POPULATION.HOUSE_GROWTH_INTERVAL:
      - Increment populationCount by 1
      - Reset populationGrowthCounter to 0
- After updating all buildings, recompute and update state.resources.farmers and state.resources.nobles:
  - state.resources.farmers = computePopulationCapacity(state).farmerCapacity
  - state.resources.nobles = computePopulationCapacity(state).nobleCapacity

Call growHousePopulations at the start of the player turn, inside the endPlayerTurn orchestration
(alongside collectResources and spawnQueuedUnits — see CS-11 for wiring).

MODIFY canAfford(state, cost) (already exists):
No change needed — iron/wood check is unchanged.

Export: computePopulationCapacity, computePopulationUsage, canAffordPopulation, growHousePopulations.

---

## PROMPT CS-07 — Enemy Build AI and Lava Lair Recruitment Scoring (enemySystem.ts)

Modify src/enemySystem.ts. Do not rewrite the file — make targeted additions and changes.

SECTION: Lava Lair construction AI

ADD to EnemyActionType union: 'BUILD_LAVA_LAIR' | 'BUILD_INFERNAL_SANCTUM' | 'CORRUPT_TERRAIN'

ADD function scoreConstructionActions(state, unit, scoredActions):
Scores possible construction actions for a BUILD_AND_CAPTURE enemy unit.
- If unit does not have BUILD_AND_CAPTURE tag: return early
- Find all ruin tiles (isRuin: true) within unit.stats.moveRange using isTileWithinEdgeCircleRange
- Find all stronghold ruin tiles (isStrongholdRuin: true) within moveRange
- Find all uncorrupted FOREST and MOUNTAIN terrain tiles within moveRange (for CORRUPT tag)

For each ruin tile in range:
- Score = AI_SCORING.BASE_BUILD_LAVA_LAIR
- Apply distance penalty: - AI_SCORING.DISTANCE_PENALTY_PER_TILE * distanceToRuin
- Bonus: +15 if no other LAVA_LAIR buildings exist within 4 tiles (encourages spread)
- Add scored action: { type: 'BUILD_LAVA_LAIR', score, targetPosition: ruinPos }

For each stronghold ruin tile in range:
- Score = AI_SCORING.BASE_BUILD_LAVA_LAIR + 20 (higher priority than normal ruin)
- Add scored action: { type: 'BUILD_INFERNAL_SANCTUM', score, targetPosition: strongholdRuinPos }

For CORRUPT tag units on FOREST/MOUNTAIN tiles:
- Score = AI_SCORING.BASE_CORRUPT_TERRAIN
- Apply distance penalty
- Add scored action: { type: 'CORRUPT_TERRAIN', score, targetPosition: terrainPos }

ADD to the unit AI resolution (where the highest-scored action is executed):
Handle BUILD_LAVA_LAIR:
- If unit is on the ruin tile: call enemyConstructBuilding(state, unit.id, ruinPos, BuildingType.LAVA_LAIR)
- If unit is not yet on the tile: move 1 step toward the ruin

Handle BUILD_INFERNAL_SANCTUM:
- Same pattern, call enemyConstructBuilding with BuildingType.INFERNAL_SANCTUM

Handle CORRUPT_TERRAIN:
- If unit is on the terrain tile: call corruptTerrain(state, unit.id, tilePos) from corruptionSystem.ts
- If unit is not yet on the tile: move 1 step toward it

SECTION: LAVA_LAIR recruitment scoring

Add a new function scoreRecruitmentForLavaLairs(state: Draft<GameState>): void
Called during runEnemyTurn to decide which unit to recruit from each LAVA_LAIR.

Logic per LAVA_LAIR building:
1. Filter UnitTypes to only those unlocked at the current threat level:
   Use ENEMY_UNIT_UNLOCK record from gameConfig — only recruit if state.threatLevel >= minThreatLevel
2. Score each eligible unit type based on tactical factors:
   - Base score from unit type priority:
     LAVA_GRUNT: 50, LAVA_ARCHER: 60, LAVA_RIDER: 65, LAVA_SIEGE: 55, EMBERLING: 45
   - Bonus if the zone ahead (north) has player units: +20 for LAVA_GRUNT, +30 for LAVA_ARCHER/RIDER
   - Bonus if the player has many buildings in range: +25 for LAVA_SIEGE (area denial value)
   - Bonus if threat >= 5 and no Emberling exists within 6 tiles: +20 for EMBERLING
   - Penalty if unit type is already over-represented (more than 3 of that type in same zone): -20
3. Select the highest-scoring eligible unit type
4. Queue recruitment (set building recruitmentQueue to that UnitType)
5. Existing spawn logic (spawnEnemyUnits function) already handles the actual spawning

SECTION: INFERNAL_SANCTUM behavior

INFERNAL_SANCTUM behaves like a LAVA_LAIR but with a higher lavaBoostEnabled multiplier.
The existing BUILDING_SPAWN_UNIT_TYPE map must be updated to include:
- LAVA_LAIR: UnitType.LAVA_GRUNT (default spawn)
- INFERNAL_SANCTUM: UnitType.LAVA_RIDER (default spawn — stronger building, stronger unit)

Update isRecruitmentBuilding helper to also return true for LAVA_LAIR and INFERNAL_SANCTUM.

---

## PROMPT CS-08 — Corruption System (new file: corruptionSystem.ts)

Create a new file src/corruptionSystem.ts.

This module handles terrain corruption by enemy units and player de-corruption (capture-like mechanic).

Import from: types.ts, gameConfig.ts (LAVA_LAIR, BUILDINGS), rangeUtils.ts, immer.

FUNCTION: corruptTerrain(state: Draft<GameState>, unitId, tilePos): void
Called when an enemy unit with CORRUPT tag acts on a FOREST or MOUNTAIN tile.
Steps:
1. Validate: unit exists, has CORRUPT tag, is on tilePos, has not acted this turn
2. Validate: tilePos tile is either FOREST or MOUNTAIN (tile.terrainType), with no existing building
3. Determine building type:
   - FOREST tile: create EMBER_NEST
   - MOUNTAIN tile: create MAGMA_SPYR
4. Create the new Building with faction = ENEMY:
   - MAGMA_SPYR: use LAVA_LAIR.MAGMA_SPYR_STATS for hp, combatStats (attack, defense, attackRange)
     Set combatStats.maxAttacksPerTurn = LAVA_LAIR.MAGMA_SPYR_STATS.maxAttacksPerTurn
     Set tags = [UnitTag.RANGED]
     Set hasActedThisTurn = false
   - EMBER_NEST: use standard building hp (100), no combatStats (it does not attack directly)
     Set emberSpawnCounter = 0
5. Add building to state.buildings
6. Set grid tile buildingId
7. Mark unit: hasMovedThisTurn = true, hasActedThisTurn = true
Note: the terrain type (FOREST/MOUNTAIN) remains on the tile — corruption does NOT change terrainType.

FUNCTION: canDecorrupt(state, unitId, buildingId): boolean
Player units "de-corrupt" a corrupted terrain building using the existing capture mechanic.
Returns true if:
- Unit has BUILD_AND_CAPTURE tag
- Building type is MAGMA_SPYR or EMBER_NEST
- Building faction is ENEMY
- Unit is on the building's tile
- This reuses canCapture logic — it is treated as a standard enemy building capture

Note: De-corruption is handled entirely by the existing capture system (captureSystem.ts).
When a MAGMA_SPYR or EMBER_NEST capture completes:
- The building is removed (standard capture destroy behavior from CS-05)
- The tile becomes isRuin: true (standard ruin creation from CS-05)
- The terrainType on the tile is UNCHANGED (still FOREST or MOUNTAIN)
- The player can then rebuild on the ruin (or even reconstruct the resource building on the terrain)

FUNCTION: processMagmaSpyrAttacks(state: Draft<GameState>, events: GameEvent[]): void
Called during the enemy turn, after unit movement.
For each MAGMA_SPYR building (faction = ENEMY):
- Find all player units within attackRange (use isTileWithinEdgeCircleRange)
- Sort by targeting priority: closest first, then lowest HP (like enemy unit targeting)
- Attack up to MAGMA_SPYR_STATS.maxAttacksPerTurn different player units
- Use resolveBuildingAttack from combatSystem.ts (already handles building-as-attacker)
- Set building.hasActedThisTurn = true after acting
- Emit a GameEvent for each attack (use existing event patterns from gameEvents.ts)

FUNCTION: processEmberNestSpawns(state: Draft<GameState>, events: GameEvent[]): void
Called at the start of the enemy turn.
For each EMBER_NEST building (faction = ENEMY):
- Increment building.emberSpawnCounter by 1
- If emberSpawnCounter >= LAVA_LAIR.EMBER_NEST_SPAWN_INTERVAL:
  - Count active EMBERLING units within 8 tiles of this Ember Nest
  - If count < LAVA_LAIR.EMBER_NEST_MAX_EMBERLINGS:
    - Spawn 1 EMBERLING at the nearest free adjacent tile to the Ember Nest
    - Reset emberSpawnCounter to 0
    - Emit a spawn GameEvent

Export all public functions.

---

## PROMPT CS-09 — Emberling Unit AI (enemySystem.ts additions)

Modify src/enemySystem.ts to add Emberling-specific AI behavior.

ADD to EnemyActionType union: 'EMBERLING_EXPLODE' | 'EMBERLING_MOVE_TO_LAVA' | 'EMBERLING_ADVANCE'

ADD function scoreEmberlingActions(state, unit): ScoredAction[]
Only called for units of type EMBERLING.
Scoring:
1. EMBERLING_EXPLODE (highest priority):
   - Check all player units in adjacency range 1 (including diagonals — use Chebyshev distance: max(|dx|, |dy|) <= 1)
   - If any player unit is adjacent: score = AI_SCORING.BASE_EMBERLING_EXPLODE
   - Add action with no movement needed (explosion triggers on current tile)

2. EMBERLING_MOVE_TO_LAVA:
   - Calculate path toward lavaFrontRow (move to tile that minimizes y distance to lavaFrontRow)
   - Score = AI_SCORING.BASE_EMBERLING_SACRIFICE
   - Check if any tile within moveRange (2) reduces distance to lava
   - Add best tile as targetPosition

3. EMBERLING_ADVANCE:
   - If no direct lava path exists (blocked), move toward nearest player unit instead
   - Score = AI_SCORING.BASE_EMBERLING_ADVANCE
   - Add as fallback

INTEGRATE Emberling AI into the main unit AI loop in runEnemyTurn:
- If unit.type === EMBERLING: use scoreEmberlingActions instead of the standard scoring
- Execute the highest-scored action

ADD function resolveEmberlinkExplosion(state: Draft<GameState>, emberlingId, events: GameEvent[]): void
Triggered when EMBERLING_EXPLODE action is chosen.
Steps:
1. Find all player units with Chebyshev distance <= 1 from Emberling position (including diagonals)
2. For each such player unit: apply UNITS.EMBERLING.explosionDamage as direct HP reduction (no counter-attack, no defense formula — flat damage)
3. If player unit HP <= 0: remove unit, update grid
4. Remove the Emberling from state.units and clear its grid tile
5. Emit a GameEvent for the explosion and for each player unit damaged
6. Emit death event for the Emberling

Lava death threat increase:
When an EMBERLING is destroyed by lava (in lavaSystem.ts advanceLava), its death must increase
state.threatLevel by 1. Add a check in advanceLava: if the destroyed unit.type === EMBERLING,
increment threatLevel. This is a one-line addition to the existing lava advance loop.

---

## PROMPT CS-10 — Win/Loss Condition Update (gameConditions.ts)

Modify src/gameConditions.ts.

CHANGE checkWinCondition:
Old logic: player wins when ALL strongholds are player-owned.
New logic: player wins when they own a STRONGHOLD in zone 5 (rows 85-104).

Implementation:
1. Find all player-owned STRONGHOLD buildings
2. For each, compute its zone using the same getZoneForPosition logic as captureSystem.ts
3. If any player-owned STRONGHOLD is in zone 5: set state.phase = VICTORY

The zone 5 row range is: rows (LAVA_BUFFER_ROWS + 4 * ZONE_HEIGHT) to (LAVA_BUFFER_ROWS + 5 * ZONE_HEIGHT - 1)
= rows 33 to 39 for the current config. Use MAP constants, not hardcoded values.

Note: since strongholds can now be destroyed (captured creates ruin), it is possible for zone 5 to have
no STRONGHOLD at all. The player must first reconstruct one by using a unit with BUILD_AND_CAPTURE tag
on a stronghold ruin tile in zone 5.

LOSS CONDITION unchanged:
Player loses if they have zero player-owned strongholds at any point.
Since strongholds can now be destroyed, this condition becomes more common.
The existing checkLossCondition is correct — no change needed.

---

## PROMPT CS-11 — gameStore Wiring (gameStore.ts)

Modify src/gameStore.ts to wire all new systems into the store actions and turn sequence.

ADD new imports:
- constructBuilding, destroyOwnBuilding, canConstructAt, getConstructionOptionsForTile from constructionSystem.ts
- corruptTerrain, processMagmaSpyrAttacks, processEmberNestSpawns from corruptionSystem.ts
- growHousePopulations, canAffordPopulation from resourceSystem.ts

ADD to GameActions interface:
- constructBuilding(unitId: string, tilePos: Position, buildingType: BuildingType): void
  Calls constructBuilding from constructionSystem.ts inside an immer set block.
  After construction, call updateDiscovery(state).

- destroyOwnBuilding(unitId: string, buildingId: string): void
  Calls destroyOwnBuilding from constructionSystem.ts.
  After demolition, call updateDiscovery(state).

ADD to store implementation (in the create block):
Implement constructBuilding action: validate, call constructBuilding, call updateDiscovery.
Implement destroyOwnBuilding action: validate, call destroyOwnBuilding, call checkGameConditions.

MODIFY endPlayerTurn (turn sequence):
Add the following calls in order within the existing turn sequence:

After collectResources (step 7a), add:
- growHousePopulations(state) — grows farm/patrician house populations, updates resources.farmers/nobles

At the start of the enemy turn (inside runEnemyTurn), ensure these are called:
- processEmberNestSpawns(state, events) — spawn Emberlings from Ember Nests (called inside enemySystem.ts)
- processMagmaSpyrAttacks(state, events) — Magma Spyr auto-attacks (called inside enemySystem.ts)

These two calls are added to runEnemyTurn in CS-08/CS-09, so no additional wiring is needed in gameStore
unless runEnemyTurn does not call them. Verify that runEnemyTurn calls both before finalizing.

ADD debug actions:
- debugAddFarmers: adds a test FARM building with full population in zone 1 (for testing population caps)
- debugAddRuin: sets a nearby tile to isRuin = true (for testing construction)

---

## PROMPT CS-12 — GridRenderer Updates (GridRenderer.tsx)

Modify src/components/GridRenderer.tsx. These are pure rendering changes — no logic changes.

ADD to emoji/color lookup tables:

New BuildingType emojis (add to BUILDING_EMOJI):
- LAVA_LAIR: '🕳️'
- INFERNAL_SANCTUM: '🌋'
- FARM: '🌾'
- PATRICIAN_HOUSE: '🏯'
- MAGMA_SPYR: '⛰️' (with red tint overlay)
- EMBER_NEST: '🌲' (with orange tint overlay)

New UnitType emoji (add to UNIT_EMOJI):
- EMBERLING: '🔥'

TERRAIN rendering (modify tile background render logic):
Currently tiles render a solid green for revealed+visible PLAINS tiles.
Extend this:
- TileType.FOREST (terrainType): render with darker green background (#2d6e1e), add 🌲 as a faint background icon
- TileType.MOUNTAIN (terrainType): render with gray-brown background (#6b5b45), add ⛰️ as a faint background icon
- Terrain emojis should render at reduced opacity (0.4) behind buildings/units so the building emoji takes visual priority

RUIN rendering:
- isRuin tiles: show '🪨' emoji on the tile background (faint, behind any selected unit)
- isStrongholdRuin tiles: show '🏚️' emoji on the tile background

CORRUPTION visual overlay:
- MAGMA_SPYR building tiles: add a pulsing red glow overlay (CSS animation, rgba(226, 88, 34, 0.3))
- EMBER_NEST building tiles: add a gentle orange glow overlay (rgba(255, 140, 0, 0.25))

EMBERLING visual:
- Show HP bar (red when low — same as other units)
- Show a small explosion icon '💥' on hover (to hint at explosion behavior) — CSS hover state only, not game logic

POPULATION display on FARM and PATRICIAN_HOUSE:
When a FARM or PATRICIAN_HOUSE is revealed and visible, show a small population badge below the building emoji:
- Format: current population / cap (e.g., "2/3")
- Use a tiny font, white text on dark background
- Only show if building is player-owned

---

## PROMPT CS-13 — HUD and Building Panel Updates (HUD.tsx)

Modify src/components/HUD.tsx. These changes add population display, construction UI,
and the demolish button to the building panel.

SECTION: Top bar additions

Add population display to the top bar (alongside iron and wood):
- Farmers: show '🌾 X/Y' where X = resources.farmers (current capacity) and Y = total potential capacity
  Actually: show '🌾 [used]/[available]' where used = computePopulationUsage().farmersUsed and available = resources.farmers
- Nobles: show '🎖️ [used]/[available]'
- Import computePopulationUsage from resourceSystem.ts for live usage display

SECTION: Construction panel (new — shown when player unit with BUILD_AND_CAPTURE is selected and clicks a tile)

When a unit with BUILD_AND_CAPTURE is selected and the player clicks a tile that has construction options
(getConstructionOptionsForTile returns non-empty), show a construction panel:
- Title: "Construct Building"
- For each ConstructionOption: show emoji + name + cost (iron/wood)
- Grey out options the player cannot afford (canAfford check)
- Click to call gameStore.constructBuilding(unitId, tilePos, buildingType)
- Show "Population required" note below options that have population costs

This panel replaces the normal tile click behavior (move/attack) when the unit is on the same tile
as the terrain/ruin. If the unit is not on the tile, normal move behavior applies.

SECTION: Building panel modifications

FOR ALL PLAYER BUILDINGS — add Demolish button:
- Show a "Demolish" button (🔨 Demolish) at the bottom of the building panel
- Only enabled when: a player unit with BUILD_AND_CAPTURE tag is on the same tile as the building
- Disabled with tooltip "A builder unit must be on this building to demolish" when not enabled
- On click: call gameStore.destroyOwnBuilding(unitId, buildingId)
- Confirmation: show a "Are you sure?" inline confirmation before executing

FOR FARM and PATRICIAN_HOUSE — add population display:
- Show current population and cap: e.g., "👥 2 / 3 farmers"
- Show growth progress: "Next farmer in X turns" based on building.populationGrowthCounter

FOR RECRUITMENT BUILDINGS — modify recruit button:
- After existing resource cost check, also show population requirement:
  e.g., "Requires: 🌾 1 farmer" below the unit option
- Grey out if canAffordPopulation returns false even if resources are sufficient
- Show reason: "Not enough farmers — build more Farms"

ADD to BUILDING_EMOJI lookup for all new BuildingTypes:
- LAVA_LAIR: '🕳️'
- INFERNAL_SANCTUM: '🌋'
- FARM: '🌾'
- PATRICIAN_HOUSE: '🏯'
- MAGMA_SPYR: '⛰️'
- EMBER_NEST: '🌲'

ADD to BUILDING_NAME lookup for all new BuildingTypes with readable names.

---

## Prompt Order Summary

- CS-01: Type system additions (types.ts) — no dependencies
- CS-02: gameConfig extensions — depends on CS-01
- CS-03: Map generator overhaul — depends on CS-01, CS-02
- CS-04: Construction system (new file) — depends on CS-01, CS-02, CS-03
- CS-05: Capture system refactor — depends on CS-01, CS-04
- CS-06: Population and house system — depends on CS-01, CS-02
- CS-07: Enemy build AI and recruitment scoring — depends on CS-01, CS-02, CS-04
- CS-08: Corruption system (new file) — depends on CS-01, CS-02, CS-07
- CS-09: Emberling unit AI — depends on CS-01, CS-02, CS-08
- CS-10: Win/loss condition update — depends on CS-01
- CS-11: gameStore wiring — depends on CS-04 through CS-10
- CS-12: GridRenderer updates — depends on CS-01, CS-11
- CS-13: HUD updates — depends on CS-01, CS-06, CS-11

---

## Critical Notes for Agent

- Never use manhattan distance — always use isTileWithinEdgeCircleRange from rangeUtils.ts
- BUILD_AND_CAPTURE tag replaces NO_CAPTURE entirely — the old tag is gone
- Terrain tiles (FOREST, MOUNTAIN) are stored in tile.terrainType — not in tile.type
- tile.type remains PLAINS for all non-lava tiles; only tile.terrainType changes
- A tile can simultaneously have: terrainType = FOREST, isRuin = true, buildingId = null
  This means the forest's woodcutter was destroyed and left a ruin on forest terrain
- Capturing (enemy building) → building destroyed → tile becomes isRuin or isStrongholdRuin
- Destroying own building (demolish) → same outcome
- Only units with BUILD_AND_CAPTURE can: initiate capture, construct buildings, demolish buildings
- Population is a CAP system — farmers/nobles in Resources are display values, not spendable amounts
- Win condition is now: player owns a STRONGHOLD in zone 5 (not all 5 strongholds)
- Loss condition is unchanged: no player-owned STRONGHOLD buildings
- Emberling explosion uses Chebyshev distance (diagonals count), all other range checks use isTileWithinEdgeCircleRange
- Emberling death by lava increments threatLevel (add this check to lavaSystem.ts advanceLava)
