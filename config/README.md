# config/

Game configuration for Volcanae (gameplay and presentation), split into domain modules.

## Modules

| File | Domain |
|---|---|
| `map.ts` | Map grid dimensions, lava advance interval, difficulty multipliers, and terrain generation parameters. |
| `tileStatus.ts` | Tile status whitelist per terrain type, burning-tile damage, corruption-suppressed tags, and terrain-tag tooltip definitions. |
| `economy.ts` | Resource production rates, building limits, market offer pool, population caps, and training penalties. |
| `progression.ts` | Unit XP reward values and level-up stat boosts. |
| `magic.ts` | Mage cast budget, rupture costs, and spell definitions. |
| `abilities.ts` | Balance-tunable constants for all tag/flag-based unit abilities, upgrade tradeoff tags, conditional active tags, and tag stat effects. The DESCRIPTION AUTHORING RULE (all description strings must reference named constants, never raw numbers) lives here. |
| `units.ts` | Unit type interface, unit cost interface, and all unit definitions (including post-declaration description-mutation blocks). |
| `buildings.ts` | Building type interface, crystal building configs, and all building definitions. |
| `tagInfo.ts` | Label and tooltip description for each UnitTag. Kept separate from `abilities.ts` because it references `BUILDING_DEFINITIONS` at declaration time, which would create a cycle if merged. |
| `tech.ts` | Tech crystal income, research cost computation, and the full tech tree. |
| `specialists.ts` | Specialist definitions (single source of truth per specialist). |
| `enemyAi.ts` | Enemy spawn parameters, wave theme settings, AI action and recruitment scoring, and Sanctum Collapse configuration. |
| `save.ts` | Save slot caps, page size, storage keys, and export file extension. |
| `ui.ts` | HUD floater sizes, font sizes, popup timings. |
| `render.ts` | Tile sizes, breakpoints, render color palette, camera constants. |
| `animation.ts` | Animation timings, durations, keyframe constants. |
| `input.ts` | Touch and pointer interaction constants. |
| `hints.ts` | Hint IDs, hint texts, hint system constants. |

## Rules

1. **Every gameplay tunable belongs in the module matching its domain.** Mirror the no-raw-literals convention: add the constant to the relevant config module, then reference it in description strings.
2. **Config modules may only import from `../src/types.ts` and from sibling `./` modules.** No other `src/` imports.
3. **Imports must be acyclic.** If a new export requires importing a module that already imports from your module, create a new module or restructure per the table above.
4. **`src/gameConfig.ts` is the compatibility barrel for gameplay modules only.** All existing consumers of the gameplay modules continue to import from it. The presentation and hint modules (`ui.ts`, `render.ts`, `animation.ts`, `input.ts`, `hints.ts`) are imported directly from `config/`.
