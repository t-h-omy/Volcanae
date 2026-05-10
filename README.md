# Volcanae

A top down push forward strategy game built with React + TypeScript + Vite.

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
| 🩸 Brandmark | Mark an enemy; heals the Mage when that enemy is killed |
| 💀 Raise Skeleton | Animate a Gravestone as a Skeleton unit |
| ❄️ Frostcraft | Freeze a water tile, making it passable |
| ☠️ Grave Trap | Place a trap that stuns the next unit to enter |
| 💥 Explode | Deal area damage around a target tile |
| 💎 Crystal Tower | Spend gold to construct a defensive Crystal Tower |

A summoned Ember Demon is **leashed** to its controller Mage — if the Mage moves more than `MAGE.EMBER_DEMON_LEASH_RANGE` tiles away (see `src/gameConfig.ts` for all balance numbers), the demon defects to the enemy at end of turn. The UI highlights both tiles with a purple glow and switches to a red warning glow when the leash is about to break.
