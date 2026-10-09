# Volcanae

A top down push forward strategy game built with React + TypeScript + Vite.

Grid orientation: see `src/GRID_ORIENTATION.md`.

## Languages

Available languages are English and German. Choose a language in Options; on first launch, the game automatically detects German browsers and uses English for other languages.

## Hint System

Volcanae includes a situational hint system for new players. Hints appear as a dismissable banner overlaying the resource bar on your first encounter with key game mechanics: economy basics, lava advance, combat rules, crystal chambers, and more. Each hint can be expanded to read a detailed explanation.

To toggle hints on or off, use the "Show hints" option in the New Campaign panel before starting a game, or in the in-game Options overlay (gear icon). The Options overlay also provides a "Reset hint counters" button so hints can reappear in new saves even after reaching the global show limit.

## Features

- ⚡ Vite for lightning-fast development
- ⚛️ React 19 with TypeScript
- 📱 PWA support (installable, offline capable)
- 🎨 Dark theme (black background, dark red accents)
- 📏 Fullscreen responsive design

## Mobile Construction

At widths up to 768 px, expanding **Construct Building** temporarily hides the selected-unit panel and **End Turn** while keeping the map visible. Tap the construction header again to restore the normal HUD. Changing units or tiles, losing construction eligibility, or opening a blocking hint or cave popup resets the menu.

Lists of one to three buildings use only their natural height. Longer lists show three full rows and half of the next row; swipe vertically within the list to see more while the header stays visible. Costs, resource warnings, locked-entry research navigation, and building confirmation are unchanged. Desktop and conversion menus retain their existing behavior.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## PWA Configuration

The app is configured as a Progressive Web App with:
- Name: "Volcanae"
- Theme color: #1a0000 (dark red)
- Background color: #000000 (black)
- Service worker with generateSW strategy for offline support

## Scout Traps

Scouts granted **Set Trap** by the Trapsmith specialist may move and then place a trap in the same turn. Setting a trap spends their action and prevents further movement. Trap selection highlights legal placement tiles in gold, including the Scout's own tile when valid, instead of showing movement previews. Triggering enemies take damage immediately on arrival; surviving non-Alert ground units are stunned and the trap is consumed.

## Magic System

The game includes a Mage unit unlocked through the tech tree. Once the **Mage** tech is researched, Mages can be recruited from an active **Crystal Chamber** building. Each Mage can cast one spell per turn (before or after moving, but not after attacking), and the **Archmage** specialist raises that per-turn budget to two casts.

Spells are unlocked individually through the tech tree. Available spells include:

| Spell | Effect |
|-------|--------|
| 🔄 Transpose | Swap the Mage with a friendly unit |
| 🔥 Emberbind | Destroy a nearby Ember Nest, summoning a leashed Ember Demon |
| 🐗 Corrupted Qork | Summon a ranged, leashed creature on an empty corrupted tile; it corrupts its tile when it dies |
| 🩸 Brandmark | Fully heal a friendly unit; the healed unit gains the BRANDMARKED tag, cannot be healed by Patch Up, and loses HP each turn, spawning a hostile Ember Demon on death |
| 💀 Raise Skeleton | Animate a Gravestone as a Skeleton unit |
| 🧟 Summon Ghoul | Summon a Ghoul from an empty player Gravestone |
| 🦠 Lava Mold | Infect an enemy unit; Infested units take damage at faction-turn end and spread infection when they die |
| ❄️ Frostcraft | Freeze a water tile, making it passable |
| ☠️ Grave Trap | Place a trap that stuns the next unit to enter |
| 💥 Explode | Deal area damage around a target tile |
| 💎 Crystal Tower | Sacrifice the Mage to erect a permanent Crystal Tower on its tile |
| 🌀 Portal | Create a permanent bidirectional portal pair on the same row; units of any faction can enter either endpoint |
| 🎯 Taunt | Mark a friendly unit so hostile units must attack it whenever it is a legal target in range |
| 🪨 Stone Skin | Grant a friendly unit a separate 50 HP pool that absorbs damage before normal HP and prevents voluntary movement while it remains |
| ⚡ Crystal Lightning | Fire a 20-power lightning volley from a Crystal Chamber; resonating Chambers chain the spell to nearby active Chambers |

The **Crystal Khyron** tech (child of Arcane Awakening) unlocks a Khyron recruitable from a resonating Crystal Chamber for 2 Arcane Crystals, sharing the Chamber's recruitment limit with Mages. While a Chamber resonates it carries the **Resonance** tag; its first enemy kill transforms it one level (max Lv.3) and permanently inherits that enemy's Cleave, Pierce, Rage, Alert, Ironblood, Block, Puncture and Burn tags. Khyrons never gain XP.

The **Summon Ghoul** tech unlocks a Ghoul spell after Raise Skeleton. A Ghoul gains levels and heals by consuming the Gravestone beneath it, up to level 3, and never gains XP.

The **Lava Mold** tech unlocks a spell after Explode. Infested units take damage at the end of their faction's turn; when they die, nearby surviving units of either faction become Infested.

The **Crystal Lightning** tech is a child of Crystal Khyron. It unlocks the spell, which strikes every enemy unit within a player-owned Crystal Chamber's visibility radius. A resonating Chamber can chain to other active player Chambers, each of which fires its own volley.

A summoned Ember Demon or Corrupted Qork is **leashed** to its controller Mage. If the Mage moves more than `MAGE.EMBER_DEMON_LEASH_RANGE` tiles away (see `src/gameConfig.ts` for all balance numbers), the unit defects to the enemy at the end of the player turn. The UI highlights both tiles with a purple glow and switches to a red warning glow when the leash is about to break.

A Corrupted Qork follows the same leash and defection rules as an Ember Demon. It gains XP and levels normally, and its death corrupts the tile when the underlying terrain permits it.

## Changelog

### v0.93.1 — Recruitment affordability warning
Recruitment panel now shows 'Not enough resources' when a unit is unaffordable.

### v0.88.6 — Enemy frozen slide animations
Enemy units now play the correct slide and death animation when slipping on frozen tiles.

### v0.88.1 — Mage movement fix
Mage: casting once blocks movement even with multi-cast specialist

### v0.88.0 — Archmage specialist
New Archmage specialist allows Mages to cast 2 spells per turn.

### v0.87.4 — Crystal Tower + Drill Sergeant text
Crystal Tower tech now clearly calls out both the spell and its building unlock, and tech effect chips render friendly building names instead of raw enum values. Drill Sergeant now also grants READY to newly recruited Swordsmen.

### v0.87.3 — Info popup cost lines
Charcoal Kiln and Crystal Cave info popups now show their cost. `BuildingInfoPopup` falls back to `BUILDING_DEFINITIONS[…].constructionCost` when no explicit iron/wood cost is supplied, so the Charcoal Kiln (⛓️0 🪵8) build cost appears in all contexts. A new `crystalCost` prop adds a "Cast: 💎n" line for spell-placed buildings; Crystal Cave is wired to `CRYSTAL_CAVE_CONFIG.CAVE_SPELL_CRYSTAL_COST`.

### v0.63.3 — Orientation pass
Codebase comments and docs now consistently reflect the player-south / enemy-north / lava-advances-northward orientation. See `src/GRID_ORIENTATION.md` for the canonical reference.

### v0.63.2 — AI movement metric (DECISION-L)
AI now uses edge-circle distance for target scoring (was Manhattan). Enemies score diagonal moves equally with axial moves; this matches the player's movement system.

### v0.63.1 (2026-05-12) — Bundle 3 cleanup
Fixed a build-time scope error where `unlockedUnits` was read in the `GridRenderer` component but consumed inside the memoised `TileCellInner` sub-component; the selector is now declared in the correct scope.

### v0.63.0 (2026-05-12) — Bundle 3: Map-layer reactions (MS-21 + MS-22)
Leash-loss defection is checked at the end of the player turn. The player has the full turn to reposition the Mage before the demon defects. The `checkAndDefectLeash` / `sweepLeashes` helpers were extracted from the inline Phase-6 sweep in `spellSystem.ts` and wired into both `gameStore.ts → endPlayerTurn` (Phase-6 sweep) and `enemySystem.ts` (after each enemy unit's action, so demons whose Mage is killed mid-enemy-turn also defect promptly). Crystal Chambers now show a 🔮 recruitment badge on the map identical to other recruitment buildings, gated on Arcane Awakening being researched; inactive chambers display the badge while still blocking actual recruitment. The Crystal Chamber building description was updated to reference the recruit cap constant (`MAGE.CHAMBER_UNIT_LIMIT`) instead of a raw number.
