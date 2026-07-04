# Changelog

## Unreleased

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
