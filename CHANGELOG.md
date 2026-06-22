# Changelog

## Unreleased

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
