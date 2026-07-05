# Changelog

## Unreleased

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
