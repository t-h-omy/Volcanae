# Changelog

### v0.106.14 - Specialist names and text cleanup

Renamed specialist display names: spec_15 to "Forgemaster", spec_20 to "Deathsworn", and spec_23 to "The Matriarch". Updated related test strings and references.

Removed em dashes from `src/gameConfig.ts` text and reworded the SWORDSMAN_CLEAVE description to follow project text rules. Added a config text-lint test to prevent em dashes in key gameConfig text fields, and a uniqueness/count assertion for specialist names.

### v0.106.13 - Defecting demons swap sides visibly

Leashed Ember Demons now swap to their enemy sprite immediately when they defect instead of waiting for the end-of-turn state commit. The live display-state `LEASH_DEFECT` replay now mirrors the resolved mutation by flipping faction, clearing `controllerMageId`, and removing the `LEASHED` / `SUMMONED` tags as soon as the event is applied.

The defect sequence timing was also adjusted so the camera focus lands first, then the faction swap fires on the same beat as the leash burst pair and the `DEFECT_TO_ENEMY` animation. Hidden replays still apply the state mutation even when their waits and VFX are skipped, keeping the display state coherent.

The `.unit--defecting` VFX now uses a lava-colored flash and glow on the swapped enemy sprite instead of the old hue-rotate fakeout.

### v0.106.12 - Ember counter counts up on flame arrival

The ember counter in the HUD now visually ticks up exactly when the flying flame arrives at the ember element rather than silently at end-of-turn. A new `emberDisplayStore` holds a transient `pendingEmberOffset`; the HUD shows `Math.max(0, ember - pendingEmberOffset)`. Before each VFX flight is launched the offset is incremented by the event amount, and the `onArrival` callback (new optional field on `FlyToHudFlight`) releases it when the flight completes. All fallback paths in `emberLevelVfx.ts` (unresolvable start position, no DOM element found) call `onArrival` immediately so the counter never sticks. A safety-net `clear()` fires after `FLY_TO_HUD_DURATION_MS + EMBER_HUD_OFFSET_GRACE_MS` when the animation queue concludes.

On arrival, the ember HUD button now also receives a strong `hud-target--ember-flash` class (bright orange glow plus scale pop; CSS in `HUD.css`) in addition to the existing lighter `hud-target--pulse`. Duration is controlled by the new `ANIMATION.EMBER_HUD_FLASH_MS` constant (500 ms).

The floater for non-TURN_INTERVAL ember rises is now simply `+${amount} Ember Level` — source prefix removed. The `floater-emberlevel` pulse animation in `GridRenderer.css` now uses the `--emberlevel-floater-pulse-ms` custom property (fed from `UI.EMBER_LEVEL_FLOATER_PULSE_MS = 600`) and includes a scale component for extra pop. The raw `#ffbf66` hex in `GridRenderer.tsx` is replaced with `RENDER.COLORS.EMBER_LEVEL_FLOATER`. A new grace constant `ANIMATION.EMBER_HUD_OFFSET_GRACE_MS` (400 ms) is added to `animationConfig.ts`.

### v0.106.11 - Cave monster acts right after spawning

The cave monster now spawns with all action flags set to false, so it acts in the enemy turn immediately following the player turn in which it was spawned. Previously the flags were set to true at spawn, causing the monster to idle through the first enemy turn and only attack on the second one. The `runCaveMonsterAi` skip guard (`hasUnitActed`) remains in place to prevent double-acting within the same enemy turn loop. The spawn-timing test has been updated to assert an attack event in the first enemy turn.

### v0.106.10 - Charcoal Kiln buffs Deep Mines

The Charcoal Kiln iron bonus now applies to Deep Mine buildings in addition to standard Mines. All three resource-system sites (collection, income preview, and breakdown) have been updated to include the per-kiln bonus for Deep Mines, using the same `CHARCOAL_KILN_IRON_BONUS` value and radius rules. The KILN_BONUS specialist modifier (Ashwright) extends radius and iron bonus to Deep Mines identically. The GridRenderer kiln-mine connection lines now draw for selected Deep Mines, and the HUD building panel shows the kiln buff row for Deep Mines when applicable. Ingame descriptions for the Charcoal Kiln building, the Charcoal Kiln tech node, the Ashwright specialist, and the `CHARCOAL_KILN_IRON_BONUS` and `CHARCOAL_KILN_RADIUS` doc comments have all been updated to say "mines and deep mines". New Vitest tests cover all four required scenarios: collection in-range, collection out-of-range, mixed income preview, breakdown increment count, and KILN_BONUS specialist applied to Deep Mines.

### v0.106.9 - Cinderborn and Berserk stat visibility, active tag pills

CINDERBORN's recruit-time baked ATK bonus is now surfaced in the HUD as a green ATK modifier and its own breakdown row without being re-applied dynamically. BERSERK now contributes a matching green ATK modifier and breakdown row whenever its live/latched condition is active, using the same pre-berserk standing attack basis the HUD already shows for PHALANX, RAGE, and BATTERY. Conditional tag pills now gain an active glow state for live BERSERK and RAGE tags, while corruption suppression still wins and keeps suppressed pills inactive. Added focused regression coverage for the extracted ATK display math and conditional-tag activity helper.

### v0.106.8 - Berserk stays active once triggered

BERSERK now latches permanently per unit after first activation: once a BERSERK unit drops below the HP threshold, the bonus remains active even if the unit later heals above the threshold. Added a persisted `berserkActivated` unit field with v19 save migration backfill, updated combat and damage paths to set the latch when HP is reduced, and added end-of-turn safety sweeps plus regression coverage for combat-triggered latch, heal-after-trigger persistence, and v18 migration behavior.

### v0.106.7 - READY recruits render as actionable

READY-tagged same-turn recruits now use unified exhausted-display logic and no longer render with the toned-down exhausted filter when they can still act (including Drill Sergeant Spearmen and Swordsmen). The exhausted visual decision is now centralized in `isUnitDisplayExhausted` and consumed reactively by the grid unit renderer, with focused regression coverage for READY/non-READY recruit paths, moved-no-targets and attacked exhaustion, and fresh READY gargoyle spawns.

### v0.106.6 - Grave Trap requires an empty gravestone tile

Grave Trap now follows the same empty-tile rule as Raise Skeleton: occupied Gravestones are excluded from valid spell targets, casts on them are rejected, and invalid taps show the "Occupied" reason. Empty Gravestones in range remain valid targets. The Grave Trap spell description now explicitly says the Gravestone tile must be empty.

### v0.106.5 - Trap triggers animate in sequence

When an enemy walks into a Grave Trap or Scout Trap during the enemy turn, the stun/damage floaters now appear after the unit's move animation instead of before it. `checkGraveTrapTrigger` and `checkScoutTrapTrigger` in `movementSystem.ts` accept an optional `events?: GameEvent[]` parameter. On the enemy path (events provided), presentation is emitted as discrete events — `STUN_APPLIED` per stunned unit, `TILE_DAMAGE` (damageSource: `'TRAP'`) for Scout Trap damage, and a new `TRAP_TRIGGERED` event (buildingId + position) that removes the consumed building from the live display state during animation replay. The `STUN_APPLIED` applyEvent handler in `gameStore.ts` now emits the "💫 Stunned" floater so both paths render identically. The `TILE_DAMAGE` applyEvent handler uses the unit's faction for the floater colour so enemy trap victims get the correct orange tint. `TRAP_TRIGGERED` is treated as a fast, non-blocking event in the animation engine. The player path (no events array) is unchanged.

### v0.106.4 - Enemy frozen slide animation

When an enemy unit moves onto a FROZEN tile the slide now animates as part of the event-queue replay, immediately after the move animation, instead of jumping to the slid position at turn end. The out-of-band `setUnitAnimation`/`setTimeout` block and the ghost-VFX block in `moveEnemyUnit` are replaced by a `UNIT_KNOCKBACK` event pushed into the event array. For a slide that kills the unit (lava, canyon, water), a `UNIT_KNOCKBACK` event is pushed followed by `UNIT_DEATH`; the animation engine already handles a `UNIT_KNOCKBACK → UNIT_DEATH` pair with the correct slide-then-die sequence. The player-path slide (direct `setUnitAnimation` in `gameStore.ts`) is unchanged.

### v0.106.3 - Ember level feedback for all sources

Every ember-level increment source now emits `EMBER_LEVEL_UP` (emberling sacrifice, enemy lava death, lava-advance consumption, turn-interval tick, and stronghold capture), so hint H18 and unified feedback trigger consistently. `EMBER_LEVEL_UP` now carries a typed `source` and optional `position` (for turn-interval events). Turn-interval rises are enqueued into the enemy-turn playback queue and the turn announcement popup now shows an additional line, “Ember Level increased,” on the immediately following player turn. Ember gain feedback adds a reusable screen-space fly-to-HUD system: a 🔥 icon now flies along a curved accelerating path from the source (or turn popup) to the ember HUD stat and pulses the target on arrival; source-based ember floaters now use a dedicated pulsating style.

### v0.106.2 - Seal cave without mine

The cave popup "Seal & Build Mine" option is replaced by "Seal": sealing the entrance now dismisses the cave monster (clears hasCaveMonster, removes the activeCaveEncounters entry) without constructing a Mine and without consuming any of the unit's action flags. The BUILDANDCAPTURE player unit on the tile can still move, attack, and build on the same turn after sealing. The Explore option and gating logic (a player BUILDANDCAPTURE unit must stand on the cave tile) are unchanged. The dead `placeMineOnTile` helper in `constructionSystem.ts` is removed as it had no remaining callers.

### v0.106.1 - Rage bonus display respects corruption

The HUD now uses the same RAGE bonus helper as combat, so units on CORRUPTED tiles show no RAGE attack bonus when corruption suppresses that tag. Regression tests cover the shared helper on normal tiles, corrupted player tiles, and the current enemy-unit corruption semantics exposed by `isUnitOnCorruptedTile`.

### v0.106.0 - Crystal income display: Echo Warden and Grave Harvest

Crystal HUD income and the crystal resource popup now include all crystal sources that can apply this turn: base resonating Crystal Chamber income, Echo Warden specialist bonus crystals, and Grave Harvest expected-value crystal income from player-owned Gravestones (shown as fractional expected value, matching other probabilistic displays). The popup now shows source-attributed crystal rows and only shows "No income sources" when no crystal source contributes at all. Gameplay parity is also fixed: Echo Warden bonus crystals no longer apply to disabled Crystal Chambers.

### v0.105.0 - Trapsmith ranged trap placement

Scouts with the Trapsmith specialist now enter a target-selection mode when the "Set Trap" button is pressed, allowing the trap to be placed on any valid tile within `SCOUT_TRAP_PLACE_RANGE` (1) tiles (edge-circle range, own tile included). Valid tiles must have no other unit, no building, no ruin or stronghold ruin, terrain not CANYON, WATER, FOREST or MOUNTAIN, and not lava. The HUD button toggles into "🪤 Choose tile…" mode (matching the bridge-builder pattern) and can be cancelled. The pending mode is cleared on unit deselection, selection change, end turn, spell cast, and all other cancel paths. `isTrapTileClear` in `unitActions.ts` was reworked to accept `(state, x, y, placingUnitId)` and encode the full validity rules; new helpers `getTrapPlacementTargets` and `explainInvalidTrapTarget` support target highlighting and invalid-reason floaters in GridRenderer. Save migration v18 is extended with a `pendingTrapSetterId` backfill (no version bump).

### v0.104.0 - Hearthsteward split and Estate Warden

Hearthsteward now grants +1 farmer capacity per Farm only, while the new Estate Warden specialist grants +1 noble capacity per Patrician House. Housing-cap calculation now applies those specialist bonuses independently per building type, so doctrine doubling still uses the correct per-building flat bonus. Regression tests cover the split housing-cap behavior and confirm Estate Warden enters the specialist offer pool.

### v0.103.1 - Spawn sickness for enemy spawns

Enemy units spawned during the enemy turn now receive shared spawn action-flag initialization that enforces spawn sickness by default and only grants immediate action when the unit has the READY tag. Ember Nest Emberlings now spawn fully exhausted on their spawn turn, preventing same-turn EXPLODE actions, then correctly become available on the following enemy turn after the normal end-of-turn reset. Enemy recruitment and Ember Demon enemy-spawn paths were routed through the same helper so READY-tag behavior stays consistent across enemy spawn sites.

### v0.103.0 - Market discovery offers and cave loot exclusion

Markets now keep their rolled slot counts but start with empty offer slots until the market tile is discovered; on first reveal, offers are initialized from live state so already-owned specialists are excluded. Automatic refill and manual restock now operate only on initialized discovered markets. Cave-monster specialist rewards now exclude any specialist currently offered in market specialist slots. Save migration v18 backfills MARKET offer initialization state so unrevealed markets load with hidden offers while revealed markets keep their offers.

### v0.102.0 - Riftworm dig-in restrictions

Riftworms can no longer start a tunnel from a tile occupied by a building, a ruin, a stronghold ruin, FOREST terrain or MOUNTAIN terrain. Movement onto those tiles is unaffected: only the dig-in action is blocked. The implementation splits `isTileValidForTunnel` in `tunnelSystem.ts` into a lax restore helper (`isTileValidForRestore`, used when placing an aborted worm back on the map) and the strict dig-in check (`isTileValidForTunnel`, which adds ruin, FOREST and MOUNTAIN blocks on top of the restore check). `isTileFreeForUnit` (used by `_abortTunnel`) now delegates to the lax helper, so abort-restore correctly places worms back on FOREST, MOUNTAIN and ruin tiles. The redundant FOREST and MOUNTAIN checks inside `isTileValidForEmergence` are removed since they are already covered by the updated `isTileValidForTunnel`. New tests in `src/__tests__/tunnelDigIn.test.ts` cover: dig-in rejected on FOREST, MOUNTAIN, ruin and building tiles; abort restore onto a FOREST start tile; and regression guards confirming emergence still refuses FOREST and MOUNTAIN targets.

### v0.99.0 - Fieldwork Outposts cost wood and say so

Fieldwork now requires 4 wood to place an Outpost. `fieldworkUnit` in `gameStore.ts` checks `state.resources.wood >= 4` (reading `BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood`) before proceeding and deducts the cost on success. The HUD "Build Outpost" button now shows a 🪵4 cost badge using the same `hud-spell-btn-cost` pattern as Build Bridge; it is disabled and shows a "Not enough wood" warning when the player cannot afford the action. The confirm step also displays the wood cost. The FIELDWORK tech node description, the FIELDWORK unit tag tooltip, and the Outpost building description all now state the 4-wood cost. The `canUnitFieldwork` doc comment that incorrectly said "Watchtower" has been corrected to "Outpost". Regression tests in `src/__tests__/fieldworkCost.test.ts` cover: insufficient wood (unit survives, no building, resources unchanged), sufficient wood (unit consumed, Outpost placed, wood deducted), and the exact-cost boundary case.

### v0.98.10 - Drill Sergeant recruits render as ready to act

Units spawned with the READY tag (granted by the Drill Sergeant specialist to Spearmen and Swordsmen) no longer render with the exhausted/toned-down visual filter on the turn they are recruited. The `isExhausted` check in `GridRenderer.tsx` now gates the recruit-turn dimming on `!unit.tags.includes(UnitTag.READY)`, matching the existing spawn logic that clears `hasMovedThisTurn`/`hasAttackedThisTurn` for READY units.

### v0.98.9 - XP display matches granted XP; level-up healing verified

Attack events now carry `attackerXpGained` and `defenderXpGained` that reflect the amount `grantXp` actually granted, not merely whether the kill condition was satisfied. A new `canGrantXp` helper in `levelSystem.ts` replicates `grantXp`'s MAX_LEVEL early-return check; all six emit sites in `gameStore.ts` and `enemySystem.ts` (PLAYER_ATTACK, UNIT_ATTACK_BUILDING, ENEMY_ATTACK melee, ENEMY_ATTACK ranged, cave-monster attack, and preventive-strike overwatch) now gate XP-gain fields on this check. This removes the visible XP flicker where `applyEvent` would optimistically add XP to the display unit that the resolved state never granted, before snapping back at turn-end sync. Repro tests in `src/__tests__/xpGranted.test.ts` verify: (a) a level-1 unit with 7 banked XP shows `canLevelUp` semantics and `applyLevelUps` restores HP to the new `maxHp` on every level gained, ruling out the "level 3 without heal" hypothesis via `applyLevelUps`; (b) `grantXp` refuses additional XP when the unit already qualifies for MAX_LEVEL, with `canGrantXp` returning the correct boolean on either side of the threshold; (c) applying level-up boosts while UNTRAINED and HOMELESS tags are active heals to the new `maxHp`, and revoking both tags afterwards round-trips ATK and DEF without corrupting HP.

### v0.98.8 - Riftworm exits avoid resources and other worms' exits

Riftworm emergence targeting now uses an emergence-specific tile validator in `tunnelSystem.ts`. Planned exits still require the existing dig-in safety checks, and now additionally reject `FOREST`/`MOUNTAIN` tiles plus any tile already reserved as `tunnelPlannedEmergence` by another tunneling worm (`DIGGING_IN`, `UNDERGROUND`, or `EMERGING`). This validator is now used for initial exit planning, fallback exit search, and all emergence revalidation steps. Regression tests in `src/__tests__/tunnelSystem.test.ts` cover resource-terrain skipping, cross-worm exit de-duplication, and the self-plan allowance case (a worm is not blocked by its own planned exit record).

### v0.98.7 - Reload debuff covered by regression tests

Regression tests confirm the Crossbowman RELOAD debuff is fully implemented. All three test axes pass on v0.98.0+: (a) an enemy attacking a fired Crossbowman (`hasAttackedThisTurn: true`) deals damage matching the `calculateCombatFromStats` formula with halved DEF; (b) an unfired Crossbowman takes full-DEF damage; (c) the display-penalty helper (`computeReloadDefPenalty`) returns `floor(effDef × 50%)` when fired and 0 otherwise. Two stale stat/cost assertions in the test file (ATK 70 → 65, iron cost 6 → 4) were corrected to match the current `gameConfig.ts`. The feature could not be reproduced as broken; this patch hardens it with the tests described in VG-10.

### v0.98.6 - Trading consumes the unit's whole turn

After trading at a Market the unit can no longer move or attack during the same turn. `hasTradedThisTurn` is now checked in `canUnitMove`, `canUnitAttack`, and every sibling action gate (`canUnitCapture`, `canUnitConstruct`, `canUnitHeal`, `canUnitFieldwork`, `canUnitBuildBridge`, `canUnitSetTrap`, `canUnitExtinguish`) in `unitActions.ts`. The Market building description in `gameConfig.ts` has been updated to reflect this rule. `canUnitTrade` already required `!hasMovedThisTurn`, so the move-then-trade path was already blocked; this patch closes the trade-then-act direction.

### v0.98.5 - Gargoyle uses missing-sprite placeholder

Gargoyle no longer reuses the Skeleton unit art. `GARGOYLE` in `assetRegistry.ts` now uses the intentional missing-sprite convention (`''`), so the pink placeholder is shown until dedicated Gargoyle art lands at `/sprites/units/Gargoyle_100px.png`.

### v0.98.4 - Bridges can end on frozen water

Bridge builders may now target a canyon even when the far-side endpoint is water, as long as that water tile is currently frozen. The shared bridge-target validation in `unitActions.ts` now treats frozen water as a valid player-walkable far side, so both the UI target list and `buildBridge` accept the placement. If that frozen endpoint later thaws, the bridge can legitimately end at unwalkable water; that is accepted behavior.

### v0.98.3 - Unit sprite fallback no longer leaks to the next unit on a tile

When a unit sprite fails to load, that fallback state now resets when the tile's occupant changes. `UnitBadge` in `GridRenderer.tsx` now mirrors the existing building-sprite pattern by tracking the previous sprite path and clearing `unitSpriteError` whenever a different unit sprite path is rendered, so a melee attacker that advances onto a dead placeholder-sprite unit's tile keeps its own sprite instead of inheriting the pink fallback.

### v0.98.2 - Buildings that slay cave monsters now grant the specialist reward

Killing a cave monster with an Outpost, Watchtower, or Crystal Tower now opens the specialist hire modal. Three paths were missing the `CAVE_MONSTER_KILLED` event and encounter cleanup: (a) `buildingAttackUnit` in `gameStore.ts` (player-turn building attack), (b) `triggerPreventiveStrike` in `enemySystem.ts` (player siege unit reaction shot during the enemy turn), and (c) `triggerGarrisonOverwatch` in `enemySystem.ts` (Watch Captain building overwatch during the enemy turn). Each path now mirrors the unit-attack pattern: if the killed defender is a `CAVE_MONSTER`, its `activeCaveEncounters` entry is removed from the resolved state draft and a `CAVE_MONSTER_KILLED` event is pushed after `UNIT_DEATH`.

### v0.98.1 - Game music stops when returning to the main menu

Returning to the main menu from a running game no longer leaves the game track playing in parallel with the menu theme. A new `stopGameMusic` function is called synchronously at the start of every exit path (the HUD return button, and the Main Menu buttons on the GameOver and Victory overlays), guaranteeing the audio element is paused and its source cleared before any async save work or screen transition begins. The existing pointerdown/keydown resume-handler race is also closed: the handler now checks that the current screen is still `GAME` before resuming playback, so a tap that simultaneously triggers the exit and an autoplay-unblock can no longer restart the audio mid-transition.

### v0.98.0 - Invalid spell and ability targets explain why

Curated invalid-target floaters now explain a small whitelist of easy-to-forget exclusions while leaving every other invalid tap silent. Transpose second-pick faction mismatches, Brandmark exclusions, Explode's mage exclusion, Frostcraft terrain failures, heal exclusions, and blocked bridge endpoints now show targeted reasons. The existing Occupied floaters for Emberbind and Raise Skeleton are unchanged in behavior and now come from the same shared helper path.

### v0.97.16 - Population stats in the top bar open info popups

Population stats in the top bar open info popups. The farmer (🌾) and noble (🎖️) stats are now tappable buttons that open a `PopulationInfoPopup` showing: current used/capacity, a capacity-source breakdown (Farms, Patrician Houses, Stronghold with doctrine-adjusted max caps), and a unit-usage breakdown grouped by unit type. The breakdown logic lives in a new `computePopulationBreakdown` helper in `resourceSystem.ts`; the popup follows the memoization pattern of `ResourceInfoPopup`. Unit tests for the helper verify that capacity entries sum to `computePopulationCapacity` and usage entries sum to `computePopulationUsage`.

### v0.97.15 - Bloodlust charges clear correctly and survive melee advances off corrupted ground

Bloodlust charges now clear correctly when a kill leaves only neutral structures in follow-up range, and they still survive melee advances off corrupted ground when the destination tile is clean. Shared target-eligibility logic now keeps Bloodlust follow-up checks aligned with normal attack targeting for both unit kills and building kills. Regression coverage verifies neutral Market/Watchtower no-dangle cases plus corrupted-tile grant/suppression behavior.

### v0.97.14 - Autocam tracks Crystal Drake deaths on every cave-loss path

Autocam tracks Crystal Drake deaths on every cave-loss path. The enemy `ATTACK_BUILDING` turn path now captures `getRoostedUnits` before calling `resolveAttackOnBuilding`, and emits `UNIT_DEATH` events for any bound drakes after `UNIT_ATTACK_BUILDING` if the building was destroyed. The cave-monster return-home path likewise captures roosted units before `cleanupRoostedUnits` and emits `UNIT_DEATH` before `CAVE_MONSTER_RETREAT` so the camera pans to the drake death before the retreat. The `applyEvent(UNIT_DEATH)` handler already tolerates missing units with an `if (unit)` guard, preventing any double-death. Two new Vitest cases (C and D in `crystalCave.test.ts`) verify both paths.

**Remaining silent paths** (no `GameEvent[]` reachable without signature refactoring, deferred):
- `captureSystem.ts` destroy contexts (~261, ~369, ~497): called from player-action paths where the caller holds no event array; the drake is still removed from state via `cleanupRoostedUnits`, just without a camera event.
- `combatSystem.ts` building-dead branches (~1696, ~2039): inner helpers with no outEvents param; the ATTACK_BUILDING caller (enemySystem.ts) now covers the enemy-turn case.

### v0.97.13 - Spell popups show cast cost; cast cost is a named constant

Spell popups show cast cost; cast cost is a named constant. `SpellInfoPopup` now renders a "Cast: 💎n" header line (using `MAGE.SPELL_CAST_CRYSTAL_COST`) for every spell, matching the style already used in `BuildingInfoPopup`. A new `MAGE.SPELL_CAST_CRYSTAL_COST: 1` constant replaces the raw `1` literals in `spellSystem.ts` (both the guard check and the deduction paths for TRANSPOSE and all other spells) and in the HUD spell-button cost badges. Both `BuildingInfoPopup` crystal-cave paths already reference `CRYSTAL_CAVE_CONFIG.CAVE_SPELL_CRYSTAL_COST` and are unchanged.

### v0.97.12 - Pierce never harms friendly or neutral structures

Pierce now consistently damages only opposing-faction targets behind the primary defender in both pierce paths (`resolveAttack` and `resolveAttackOnBuilding`). Added regression coverage for friendly rear units/buildings (VFX-only `PIERCE_DAMAGE` with amount 0), hostile rear-unit secondary damage scaling, enemy-attacker same-faction rear safety, and neutral rear-structure immunity.

### v0.97.11 - Recruitment panel explains exactly what blocks a recruit

Recruitment panel explains exactly what blocks a recruit. Each blocked recruit option now shows a specific warning: missing resources name the exact shortfall with current/required amounts (e.g. "Not enough iron (need 12, have 7)"); crystal-cost units report the crystal gap analogously; population shortage already showed specific messages and is unchanged; and when the recruitment cap is the blocker, the option itself shows "Unit limit reached (X/Y), build another <building name>" (or "This cave already hosts a Crystal Drake" for Crystal Caves). Only the blocking condition is shown per option (priority: resources → population → cap).

### v0.97.10 - Blocked emberlings shuffle forward instead of freezing

Blocked emberlings shuffle forward instead of freezing. When `findBfsPath` returns an empty path (all direct routes occupied), `moveEnemyUnitToward` now attempts one greedy step: it picks the free neighbour with the smallest Chebyshev distance to the target, breaking ties randomly. Lava tiles are never entered via this path — `SACRIFICE_TO_LAVA` remains the only intentional lava entry.

### v0.97.9 - Consistent autocam pacing for tick damage and heals

Consistent autocam pacing for tick damage and heals. TILE_DAMAGE, UNIT_HEAL, and CORRUPTION_APPLIED animation blocks now wait `POST_ACTION_IDLE_MS` after applying the event (when the tile is visible), matching the dwell time every other event type receives and preventing the camera from rushing past floaters and VFX.

### v0.97.8 - Kindler fire beam now advances toward its target

Kindler fire beam now advances toward its target. The FIRE_SPIT line VFX uses a draw-on stroke-dashoffset animation so the beam visibly grows from the attacker to the target over the first 60% of its duration, then holds and fades. The beam is recoloured to the lava palette: bright orange core (`#FF7A3A`) with gold inner glow and deep-red outer shadow.

### v0.97.7 - Cave monster spawn-turn follow-up regression coverage

Cave monsters attack reliably the round after spawning. Added a regression test that exercises the full `exploreCave` spawn path, verifies the monster skips its spawn-turn enemy phase, confirms its action flags are reset afterward, and then confirms it attacks on the following enemy turn.

### v0.97.6 - Burning-tile visual timing fix

Burning tiles ignite visually at the attack beat. Enemy attack event emission now captures the defender tile status directly before attack resolution and uses that value for `tileBurningPosition` diffing, closing a Kindler enemy-attack path where the instant burn visual update could be skipped until resolved-state commit at enemy-turn end.

### v0.97.5 - Terrain panel reachable by tapping through unit and building

Tapping the same tile now cycles through all occupants before returning to the first. A tile with a unit and a building cycles unit → building → terrain → unit. A building-only tile cycles building → terrain → building. A unit-only tile cycles unit → terrain → unit. The terrain step was previously skipped.

### v0.97.4 - Stronger corrupted-tag feedback flash

The CORRUPTED tag pill now flashes three times with strong red contrast (saturated background, bright text, wide glow, slight scale pulse) over 1.6 s when the player closes a corruption-disabled tag popup, making the feedback significantly more noticeable.

### v0.97.3 - Fog-aware autocam for enemy portal teleports

Enemy portal teleports now respect fog-of-war endpoint visibility. The portal autocam selects the entrance only when that tile is revealed, otherwise it focuses the revealed exit. PORTAL_USED animation playback is now a fog-aware two-beat sequence: entrance VFX is shown only on revealed entrance tiles, and exit camera/VFX playback is shown only on revealed exit tiles. Unrevealed endpoints no longer receive camera pans or portal VFX.

### v0.97.2 - Flying units no longer ice-slide

Enemy FLYING units (such as Gargoyles raised by the enemy) were incorrectly ice-sliding when the AI moved them onto a FROZEN tile. The enemy movement path in `enemySystem.ts` now mirrors the guard already present in `movementSystem.ts` and `combatSystem.ts`: a FLYING tag check skips the `resolveSlide` call entirely. The slide-destination preview in `GridRenderer.tsx` also gains a FLYING guard so that a selected FLYING player unit never shows a phantom slide highlight. The FROZEN terrain tag description now notes that flying units do not slide.

### v0.96.0 - Situational Hint System

Volcanae now includes a first-time-encounter hint system to help new players learn the game. Twenty contextual hints (H01 to H20) fire automatically on their first relevant encounter: building placement guidance, economy warnings (homeless/untrained units), lava advance, ember level ups, combat rules, tech tree prompts, crystal chamber resonance, and Emberbind leash mechanics. Each hint appears as a dismissable banner overlaying the resource top bar, with a "More" toggle to expand a detailed explanation.

Hints are shown at most once per savegame and at most twice globally across all savegames. A global "Show hints" toggle is available in both the New Campaign panel (before starting a game) and the in-game Options overlay. The Options overlay also provides a "Reset hint counters" action that restores global availability without affecting per-save seen history. Save data is upgraded to version 16; saves from version 15 and earlier are automatically marked as having seen all hints and will never show any hint.

## Unreleased

### Fix: Continue / autosave silently discarded in-game progress

- Autosave paths pass a snapshot of the live Zustand store, which mixes the
  store's action *functions* into the same object as the serializable
  `GameState`. IndexedDB's structured clone threw a `DataCloneError` on the
  heavy `saveData` write, while the `saveMeta` write (queued first in the same
  transaction) still committed. The result: a slot's metadata advanced every
  turn (so the Continue button showed the latest turn), but the full state
  record stayed frozen at the last cloneable save (turn 1). Pressing Continue —
  or Load — then resurfaced that stale turn-1 state, appearing to start a brand
  new game.
- Fix: `saveSlotStrict` now strips function-valued properties from the state
  before writing, so every save path (autosave, manual save, return-to-menu)
  persists a clean `GameState`. Added `fake-indexeddb`-backed round-trip
  regression tests in `saveRoundTrip.test.ts`.

### Specialist system complete — 18 new specialists + migration (v0.95.0)

Completed the full specialist roster (spec_07 – spec_24). All 24 specialists are
eligible in both the cave-monster reward pool and the Market specialist slot.
Idle-heal only triggers for wholly-inactive units; the auto-cam visits each healed
unit. Every specialist applies its effect on acquire and reverts it on loss (except
documented birth-time effects: CINDERBORN, and POP maxHp/cost for existing units).
No specialist stacks with itself.

**New specialists (SP-07 → SP-24):**
- **Ashwright** (spec_07): Charcoal Kilns gain radius + iron bonus.
- **Trapsmith** (spec_08): Scouts can place a Scout Trap. Non-flying enemies that enter take damage + stun, then it is consumed. Flyers pass safely.
- **Watch Captain** (spec_09): Garrisoned towers fire a preventive shot when an enemy enters range.
- **Cinder Warden** (spec_10): Scouts can extinguish BURNING / CORRUPTED tiles within radius.
- **Farsight Marshal** (spec_11): Scouts gain RANGED tag and bonus attack range.
- **Tramplelord** (spec_12): Riders gain KNOCKBACK — on hit, target is pushed one tile. Lava kills any pushed unit; non-flying units die on canyon/water; frozen tiles trigger an ice-slide; units and occupied buildings block the push.
- **Hellbinder** (spec_13): Summoned units gain RAGE and CLEAVE tags.
- **Hearthsteward** (spec_14): Farms and Patrician Houses house extra residents.
- **Emberforged** (spec_15): Units recruited near the lava front gain CINDERBORN (+ATK, immune to BURNING). Birth-time only.
- **The Martyr** (spec_16): When one of your units is consumed by lava, surviving Crystal Chambers begin resonating.
- **Bombardier** (spec_17): Siege units gain BATTERY — each adjacent friendly unit grants stacking ATK bonus.
- **Echo Warden** (spec_18): While resonating, Crystal Chambers near the lava front produce bonus crystals.
- **Wallbreaker** (spec_19): Archers deal bonus damage to buildings.
- **Last Stand** (spec_20): Archers gain BERSERK — ATK surges when HP falls below threshold.
- **Pathfinder** (spec_21): Capturing an enemy Stronghold immediately reveals its full zone.
- **The Sundered** (spec_22): Mages unlock **Rupture** — halves target's current HP, never kills, costs 1 crystal.
- **The Multitude** (spec_23): POP_DOUBLING_DOCTRINE — doubles housing/unit caps after flat bonuses; halves recruit cost and spawn HP (ceil) for new units only.
- **Field Chirurgeon** (spec_24): Player units that took no action this turn are healed before the enemy turn. Auto-cam visits each healed unit.

**Save migration v14 → v15:** backfills `trapDamage` (undefined) and
`resonanceCrystalBonus` (false) on all existing building records.

### Deathmender rework + Gargoyle unit (v0.94.0)
- Deathmender specialist reworked: Spearmen, Scouts, and Guards now leave Gravestones on death, and the player can raise a flying Gargoyle (FLYING melee, 90 HP / medium ATK/DEF) from any player Gravestone for 1 crystal. Replaces the old REVIVABLE/revive behavior, which is now covered by the Mage's Raise Skeleton spell.
- New GARGOYLE unit (placeholder sprite reuses Skeleton art). Raise Gargoyle (gravestone-panel button) and Raise Skeleton (Mage spell) coexist when both are unlocked.

### Crossbowman iterations (v0.93.4)

- Crossbowman Reload debuff now applies in both unit stat panels: DEF penalty is reflected in live stat modifiers and shown in red like other debuffs.

### Main menu iterations (v0.93.3)

- Main menu options volume sliders now clear mute state when adjusted, so menu music responds immediately after returning from a muted in-game session.
- Options no longer expose a manual durable-storage request; the install-app button is always shown in the storage note and is disabled once the PWA is already installed.
- Difficulty descriptions now describe lava pace instead of resource yields.

### Main Menu + Multi-Slot Save System (v0.93.0)

- **Main Menu**: cold start now lands on a pre-game main menu (black/red theme) instead of
  auto-resuming a game. Panels: `ROOT` (Continue / New Game / Load Game / Options), `NEW`,
  `LOAD`, `OPTIONS`. Panels animate on navigate (forward: slide-in from right + fade; back: from
  left + fade, ~220 ms ease-out). All visual constants live in `MainMenu.css` CSS custom
  properties.
- **IndexedDB multi-slot saves**: `saveSystem.ts` rewritten with a lightweight metadata store
  (`saveMeta`) and a full state store (`saveData`). Listing 100 saves never deserializes 100
  game states. Up to `SAVE.SLOT_CAP` (100) manual slots. Slot names default to
  `Campaign N` (lowest unused integer).
- **New Game**: named slot flow with difficulty selector and a "World generation (coming soon)"
  stub. Slot cap reached → inline notice + link to Load/Delete panel. `requestPersist()` called
  after first successful start.
- **Load Game**: scrollable slot list, `SAVE.SLOTS_PER_PAGE` (10) per page; pagination hidden
  at ≤10 saves. Each row: name, turn, difficulty, relative timestamp, Load / Delete (confirm
  step) / Export actions. Incompatible-version slots shown greyed with disabled Load. Import
  from file (`.volcanae.json`).
- **Best-effort persistent storage**: Options panel shows storage status from
  `navigator.storage.persisted()`, "Request durable storage" button when not persisted, A2HS
  install note when available, usage readout from `navigator.storage.estimate()`.
- **Export / import**: `exportSlot(id)` → JSON Blob download; `importSlotFromFile(file)` →
  new slot. Round-trip guaranteed. Exported save filename: `<name>.volcanae.json`.
- **Legacy migration**: `migrateLegacyIfPresent()` imports any existing `volcanae-save`
  localStorage save once as "Imported save" on first menu mount; legacy key left intact.
- **Autosave**: each game owns one IDB slot for its lifetime (`activeSaveId` in `menuStore`).
  Autosave fires on `PLAYER_TURN`, `GAME_OVER`, and `VICTORY` phase transitions (fire-and-
  forget, slot name preserved).
- **In-game return to menu**: `🏠 Main Menu` button in the in-game Options overlay. For active
  games: autosaves then returns. For terminal (GAME_OVER/VICTORY) games: deletes the slot then
  returns.
- **Finished-game deletion**: reaching GAME_OVER or VICTORY still autosaves (so a force-quit
  shows the end overlay on Continue). The slot is deleted only when the player explicitly leaves
  via "New Game" or "Main Menu" in the end overlay. Finished games never linger in the Load list.
- **End overlays reworked**: GameOverOverlay and VictoryOverlay now have `🔄 New Game` (→ NEW
  panel), `🏠 Main Menu`, and `📤 Export Run` buttons instead of the old single Play-Again.
- **Menu music**: dedicated `MENU_TRACK` constant added to `musicSystem.ts`
  (`Menu Theme - Dreams of Tomorrow.mp3`). Plays on loop while the menu is visible; respects
  volume/mute; stops on game start. Game music (`useMusicPlayer`) only runs inside the `<Game/>`
  component, not on the menu.
- **App refactor**: `App.tsx` no longer calls `initGame()` on mount. Subscribes to
  `useMenuStore(s => s.screen)` to render `<MainMenu/>` or `<Game/>`. Game music, animation
  engine, and turn popup live inside the new `<Game/>` component.
- **New config section**: `SAVE` constants added to `gameConfig.ts`
  (`SLOT_CAP`, `SLOTS_PER_PAGE`, `NAME_MAX_LENGTH`, `DEFAULT_NAME_PREFIX`, `LEGACY_KEY`,
  `IDB_NAME`, `IDB_VERSION`, `STORE_META`, `STORE_DATA`, `EXPORT_FILE_EXT`).
- **Graceful degradation**: if IndexedDB is unavailable (e.g. private mode), the menu still
  renders and shows a non-blocking notice; New Game may still start an unsaved session.

### Crossbowman fixes (v0.92.1)

- Crossbowman: fixed all-caps name label; Reload DEF penalty now shown in red in the unit
  stat panel like other debuffs.

### Crossbowman unit (v0.92.0)

- New player ranged unit: **Crossbowman** — armor-piercing precision shooter recruited from the
  Archer Camp.
- **Stats:** 100 HP, 70 ATK, 35 DEF, 1 move range, 2 attack range. Cost: 6 iron + 12 wood.
  Population: 1 farmer. Shares the Archer Camp's `unitLimit` with archers.
- **Tags:** `RANGED`, `RELOAD`, `PUNCTURE`, `BUILDANDCAPTURE`.
- **PUNCTURE** (existing tag): ignores the target's defensive bonuses; stuns heavily-armored
  targets (base DEF > 60) for 1 turn.
- **RELOAD** (new tag): after the crossbowman fires, its effective DEF is reduced by 50% until
  the start of its next turn. Implemented by reading the existing `hasAttackedThisTurn` flag —
  no new saved state.
- **Unlock:** new tech node `CROSSBOWMEN` (requires `FAR_REACH`, cost 2) in the ranged branch.
- **Cover sharing:** the existing `COVER` tech now also grants the `COVER` tag to crossbowmen
  (ranged counter-attack immunity).
- Added `RELOAD_DEF_PENALTY_PCT = 50` tunable constant in `gameConfig.ts`.
- Sprite placeholder: `Crossbowman_100px.png`.

### Bridgebuilder scout tech + Bridge building (v0.91.0)

- Added **Bridgebuilder** tech node (scout branch, requires `BIG_EYES`, 3 crystals): grants
  `UnitTag.BRIDGE_BUILDER` to all scouts and unlocks `BuildingType.BRIDGE`.
- Scout with `BRIDGE_BUILDER` can instantly build a **Bridge** (8 wood) on a single canyon tile
  that lies directly between two land tiles (scout→canyon→land colinear, orthogonal only).
  Reuses `hasConstructedThisTurn`; one bridge per scout per turn.
- **Direction-locked passability**: bridges have an orientation (`EW` or `NS`). Voluntary
  movement across an EW bridge is allowed E↔W and via all four diagonals; entry/exit N↔S is
  blocked. NS bridge mirrors this (N↔S allowed, E↔W blocked).
- **Forced movement** (slide/knockback/melee-advance) catches the unit on the bridge regardless
  of direction — the directional rule does not apply to forced moves.
- Everyone (player and enemy) may cross a bridge under the same directional rules.
- **No adjacent bridges**: a canyon tile and all 8 of its neighbours must be bridge-free for a
  new bridge to be placed there.
- Bridge is a neutral building (`faction: null`, `combatStats: null`, `destroyBehavior: NONE`);
  tile terrain stays `CANYON`. The bridge makes the tile standable/crossable.
- **Lava** destroys the bridge when the lava front reaches its row (generic building removal,
  no special case).
- No save-version bump — bridges are buildings (already serialized); the new optional
  `bridgeOrientation` field rides along silently on old saves.

### Market building (v0.90.0, save v14)

- Added neutral **Market** building generated at map-gen on free PLAINS tiles in the middle zones
  (first `EXCLUDED_ZONES_HEAD` and last `EXCLUDED_ZONES_TAIL` zones excluded; eligible middle
  zones default to {4,5,6,7} for a 10-zone map). Count per game configurable via
  `MARKET.MIN_PER_GAME` / `MAX_PER_GAME` (default 1/1); max 1 per eligible zone.
- **Trade action**: player units (all except `SUMMONED`) standing on a Market may Trade once per
  turn, gated like Capture — unit must not have moved this turn. Opening or closing the panel
  without buying never exhausts the unit; only a completed purchase sets `hasTradedThisTurn`.
- **Resource slots** (default 3): each is a one-shot give→gain resource swap (iron/wood/crystal).
  Distinct offers drawn from `MARKET.RESOURCE_OFFER_POOL` when the pool allows. Empty slots
  auto-refill every `AUTO_REFILL_INTERVAL` player turns (free, empties only).
- **Specialist slot** (default 1): one-shot offer drawn from the global pool excluding owned
  specialists; `null` when pool exhausted. Purchase uses a dedicated hire/swap flow — hire when
  storage has room, else an in-panel swap sub-view (no "send away"). Cost: flat
  `SPECIALIST_PRICE_CRYSTAL` crystals (default 3), charged only on completion.
- **Restock**: player-paid action (`RESTOCK_COST`, default 1 crystal) that rerolls all slots
  (including full ones), repeatable, does not count as a trade.
- **Lava-only destruction**: Market is removed permanently when overrun by lava; standard
  building-removal path handles it (no ruin, no rebuild). Enemy AI never targets the Market.
- **Seeded RNG**: offer rolling uses injectable `setMarketRandomSource` (mirrors `waveThemeSystem`).
- Save migration **v13 → v14**: adds `hasTradedThisTurn: false` to all existing units.

### P7 — Ember unlock lookahead (`gameConfig.ts`, `waveThemeSystem.ts`, `waveThemeSystem.test.ts`)

- Added `ENEMY_WAVE_THEME.UNLOCK_LOOKAHEAD` (default `1`) to permit theme composition to include
  enemy types up to one ember tier above current ember.
- Widened theme eligibility and read-player counter eligibility to include lookahead-eligible unit
  types while preserving dynamic ember gating at spawn/launder time.
- Ensured random/read-player theme generation always includes at least one currently unlocked
  (spawnable) unit type by replacing the highest-unlock pick when needed.
- Added shared unlocked-entry filtering for spawn selection and fogged-unit laundering so locked
  lookahead entries are never chosen until ember reaches their unlock requirement.
- Extended wave-theme tests to cover lookahead bounds, guaranteed unlocked entries at roll time,
  and locked-entry behavior before/after ember increases.

### P6 — Tests + version (`waveThemeSystem.test.ts`, `package.json`)

- Replaced obsolete argmax-style wave assertions with deterministic (seeded RNG) wave-theme
  tests in `src/__tests__/waveThemeSystem.test.ts`.
- Added coverage for:
  - Theme type-count bounds, per-type percent bounds, and exact 100% sum.
  - Exclusion of `EMBERLING` / `CAVE_MONSTER` from generated themes and laundering outcomes.
  - Ember unlock gating (`enemyUnlockEmber > ember` cannot be selected).
  - `RIFT_LORD` constraints (`maxThemePercent` share and `maxAlivePerZone` spawn cap behavior).
  - Consecutive-signature anti-repeat behavior (allowing repeats only in forced read-player cases),
    plus read-player total count staying within configured min/max over a simulated game.
  - Laundering scope: only fogged (`!isRevealed`) enemy units are converted.
- Bumped package version from `0.88.9` to `0.89.0`.

### P4 — Recruitment (`enemySystem.ts`)

- `spawnEnemyUnits` now selects the unit type to spawn via `pickUnitFromTheme(state, building)`
  instead of the previous `scoreRecruitmentForBuilding` argmax (`scored[0]`).
  LAVALAIR and INFERNALSANCTUM both route through the active wave theme.
- `AI_RECRUITMENT.BASE_SCORE_GRUNT`, `BASE_SCORE_ARCHER`, `BASE_SCORE_RIDER`, and
  `BASE_SCORE_SIEGE` are now **dead for selection** in the spawn path (they remain in
  `gameConfig.ts` and are still used by `scoreRecruitmentForBuilding` /
  `computeRecruitmentScores` for dev/debug inspection only).
- EMBERNEST / EMBERLING spawn path in `corruptionSystem.ts` is unchanged.
- `SPAWNER_TYPES` constant (`:173`) is unchanged.
