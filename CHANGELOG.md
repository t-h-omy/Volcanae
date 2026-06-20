# Changelog

## Unreleased

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
