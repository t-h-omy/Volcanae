# Copilot instructions for Volcanae

1. **Anchor discipline.** Verify every file, symbol and line referenced in a prompt against the current source before editing. Line numbers are hints from v0.114.8; symbol names are authoritative. If a symbol is missing or behaves differently than described, stop that task and report it in the PR description instead of guessing.
2. **No raw numeric literals for tunables.** Every gameplay tunable lives as a named constant in the matching `config/` module. Gameplay modules are consumed through `src/gameConfig.ts`; presentation modules (`ui.ts`, `render.ts`, `animation.ts`, `input.ts`, `hints.ts`, `i18n.ts`) are imported directly from `config/`.
3. **No em dashes (U+2014)** in any new or edited text: player-facing text, all locale catalogs, comments, docs, CHANGELOG.
4. **Grid orientation** per `src/GRID_ORIENTATION.md`: row 0 = north = enemy side, high y = south = player side, lava advances north.
5. **Distances** use the edge-circle metrics from `src/rangeUtils.ts`, never Manhattan.
6. **State:** Zustand with Immer. Never call store-external side effects (`tryTriggerHint` and similar) inside `produce` callbacks; mirror the existing event-collection pattern.
7. **Tests:** every logic change gets Vitest coverage. `npm test`, `npm run lint` and `npm run build` must pass.
8. **Localization:**
   - All player-facing text resolves through the i18n layer. Components use `useText()` from `src/i18n/useText.ts`. Non-component code uses `t()` and entity helpers from `src/i18n/i18n.ts` and `src/i18n/entityText.ts`. No player-visible string literals in components or logic modules.
   - Exempt (English only): DevOptionsOverlay, DevStatsOverlay, DevSpecPickerOverlay, AiScoreModal, RecruitScoreModal, AI trace export, AiTraceBadge, AiTraceExportControls.
   - English source text lives in `src/i18n/locales/en.json` as ICU MessageFormat. Keys follow `domain.ID.field`. One key per complete sentence or label, one key per context. Never concatenate translated fragments into sentences; entity names inserted into sentences sit in label position ("Build another: {building}").
   - Numbers in text appear only as ICU parameters whose values come from named constants (`textParams` on config definitions). This restates the DESCRIPTION AUTHORING RULE.
   - Logic modules return `TextRef` (`{ key, params? }`), never display strings. Floater and popup labels in ephemeral stores may resolve with `t()` at emission.
   - Leading emoji stay in code (`` `💫 ${t('floater.stunned')}` ``), not in catalog values.
   - **Always implement all supported languages.** Supported locales are `SUPPORTED_LOCALES` in `config/i18n.ts`. Every PR that adds, edits or removes a key in `en.json` applies the same change to every other locale catalog in `src/i18n/locales/` and sets `src/i18n/locales/sources/{code}.json[key]` to the new English text. Translate following `src/i18n/styleguide.md`, `src/i18n/glossary.csv` and the existing entity name translations in each catalog. A target value may equal the English value only if `src/i18n/context.json[key].sameAsSource` lists that locale. The catalog tests enforce all of this.
9. **Closeout** (every prompt): version bump in `package.json` only, as stated at the top of the prompt; new CHANGELOG entry at the top in the existing format (`### vX.Y.Z - Title` plus one paragraph); README only when player-facing behavior changes; in-game text changes in all locale catalogs (plus `textParams` in config when numbers change); SAVE_VERSION only when the prompt says so.
