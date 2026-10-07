# Translation style guide

## General

- Use a concise UI register.
- Use the imperative for instructions.
- Keep ICU syntax and parameter names untouched.
- Numbers appear only through parameters.
- Never use an em dash.
- When an entity appears in prose, use the exact entity name translation from the catalog.
- Never translate Volcanae or Volcael.
- Entity names (units, buildings, tags, terrain tags, resources, population, techs, spells, specialists, difficulty) are defined by their catalog keys, not in the glossary.
- Translate coined names such as Ashwright, Grimbeak, Riftworm, and Bullwark as coined names that keep their imagery, and fix each translation once by its key.

## Localization review loop

- Review translations in-game with the language picker in Dev Options.
- Export a locale review sheet with `npm run i18n:export -- <code>`.
- Edit only the `reviewed_<code>` column in `i18n-review/<code>.csv`.
- Import the reviewed values with `npm run i18n:import -- <code> i18n-review/<code>.csv`.
- Run `npm test` to validate the catalogs and review changes.

## de

- Address the player as "du".
- Use German quotation marks „…“.
- Capitalize nouns according to German rules.
- Game turn is „Runde“ (pro Runde, Rundenende, Spielerrunde, gegnerische Runde). Use „Zug“ only for one unit's own action („Ein Angriff beendet den Zug einer Einheit“).
- In prose, stat abbreviations match the UI labels: LP, ATK, DEF, BEW, RW, SIC, AUS, AKT. Level and XP are „St.“ and „EP“.
- Unit tags are „Merkmal“ / „Merkmale“, never „Tag“. Name a tag with its exact label in „…“ (das Merkmal „Elite“).
- Siege units are „Katapult“ / „Katapulte“.
- „Infernal Sanctum“ is a proper name and stays English.
- Units raised from a Gravestone are „erweckt“ (Skelett erwecken, Gargoyle erwecken). „Gargoyle“ is masculine.
- Patch Up is „Heilen“ (tag, tech and every reference). Retaliation is „Gegenschlag“.

## fr

- Address the player as "vous".
- Use a no-break space (U+00A0) before `: ; ! ? %` and inside « … ».

## es

- Address the player as "tú".
- Use opening ¿ and ¡ where required.

## it

- Address the player as "tu".

## pt-BR

- Address the player as "você".
