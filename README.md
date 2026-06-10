# Volcanae

A top down push forward strategy game built with React + TypeScript + Vite.

Grid orientation: see `src/GRID_ORIENTATION.md`.

## Features

- ⚡ Vite for lightning-fast development
- ⚛️ React 19 with TypeScript
- 📱 PWA support (installable, offline capable)
- 🎨 Dark theme (black background, dark red accents)
- 📏 Fullscreen responsive design

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

## Magic System

The game includes a Mage unit unlocked through the tech tree. Once the **Mage** tech is researched, Mages can be recruited from an active **Crystal Chamber** building. Each Mage can cast one spell per turn (before or after moving, but not after attacking).

Spells are unlocked individually through the tech tree. The eight available spells are:

| Spell | Effect |
|-------|--------|
| 🔄 Transpose | Swap the Mage with a friendly unit |
| 🔥 Emberbind | Destroy a nearby Ember Nest, summoning a leashed Ember Demon |
| 🩸 Brandmark | Fully heal a friendly unit; the healed unit gains the BRANDMARKED tag and loses HP each turn, spawning a hostile Ember Demon on death |
| 💀 Raise Skeleton | Animate a Gravestone as a Skeleton unit |
| ❄️ Frostcraft | Freeze a water tile, making it passable |
| ☠️ Grave Trap | Place a trap that stuns the next unit to enter |
| 💥 Explode | Deal area damage around a target tile |
| 💎 Crystal Tower | Sacrifice the Mage to erect a permanent Crystal Tower on its tile |

A summoned Ember Demon is **leashed** to its controller Mage — if the Mage moves more than `MAGE.EMBER_DEMON_LEASH_RANGE` tiles away (see `src/gameConfig.ts` for all balance numbers), the demon defects to the enemy at the end of the player turn. The UI highlights both tiles with a purple glow and switches to a red warning glow when the leash is about to break.

## Changelog

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
