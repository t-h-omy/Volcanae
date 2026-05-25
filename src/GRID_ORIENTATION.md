# GRID ORIENTATION (canonical reference)

```
  Row 0 = NORTH (top of screen) = ENEMY territory
  Row 40 = SOUTH (bottom of screen, just above lava buffer) = PLAYER territory
  Rows 35-40 = LAVA BUFFER (initial lava position, off-screen south of player base)
  Lava advances NORTHWARD (decreasing Y) — from row 41 → 40 → 39 → ...
```

## Zones

```
  Zone 1 = Player stronghold side (south, rows 28-34, high Y)
  Zone 2, 3 = Mid map
  Zone 4, 5 = Enemy stronghold side (north, rows 0-13, low Y)
```

Player advances **NORTHWARD** (decreasing Y, increasing zone number) to capture enemy strongholds.
Enemies advance **SOUTHWARD** (increasing Y, decreasing zone number) toward the player.

## Reading the codebase

| Phrase | Direction | Y coordinate | Zone direction |
|--------|-----------|-------------|----------------|
| "moving toward player" | southward | increasing Y | decreasing zone number |
| "moving toward lava" | southward | increasing Y | decreasing zone number (lava is south of player) |
| "moving toward enemy" / "advancing" (player POV) | northward | decreasing Y | increasing zone number |
| "behind the frontline" (player POV) | south of the northernmost player unit | higher Y | lower zone number |
| "frontline" (player POV) | the northernmost (most-advanced) player unit's row | lowest Y among player units | highest zone number reached |
