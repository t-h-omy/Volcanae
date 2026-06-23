# Changelog

## Unreleased

### Ember Unlock Lookahead (`gameConfig.ts`, `waveThemeSystem.ts`, `waveThemeSystem.test.ts`)

- `ENEMY_WAVE_THEME.UNLOCK_LOOKAHEAD` (default 1): a wave theme may now include enemy types whose
  `enemyUnlockEmber` is up to one tier above the current ember at roll time.
- `eligiblePool` and `scoreCountersForPlayer` widened to `enemyUnlockEmber <= state.ember + UNLOCK_LOOKAHEAD`.
- New `unlockedEntries(theme, state)` helper (exported): filters theme entries to those whose
  `enemyUnlockEmber <= state.ember`. Used as the dynamic spawn/launder gate.
- `pickUnitFromTheme` and `applyThemeToFoggedUnits` now pick from `unlockedEntries(...)` so locked
  types are never spawned or laundered until ember meets their requirement.
- `generateRandomTheme` and `generateReadPlayerTheme` apply `guaranteeUnlockedEntry`: if no picked
  type is currently unlocked, the highest-unlock entry is replaced with a currently-unlocked type,
  ensuring every theme always has ≥1 spawnable entry at roll time.
- New tests: lookahead bound enforcement, ≥1 unlocked invariant, and locked/unlocked spawn gate
  (including ember-raise re-activation).
- Bumped package version from `0.89.2` to `0.89.3`.

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
