# Handoff: Volcanae — Main Menu Redesign (Visual Layer)

## Overview
This package contains the **visual redesign** of the Volcanae pre-game Main Menu
(Continue / New Game / Load Game / Options). It replaces the old "black base +
harsh red accent + emoji icons" look with a **modern mobile-game aesthetic**: the
key art as a full-bleed background, cool cyan/ice-blue chrome, glassmorphic panels,
and custom stroked SVG icons.

The **functional architecture** (IndexedDB multi-slot saves, menu store, panel
navigation, storage persistence, export/import, in-game return-to-menu) is unchanged
and already fully specified in `original_implementation_prompt.md` (prompts MM-01…MM-09).
**This document overrides only the *visual contract* in prompt MM-05** — everything
else in that prompt chain still applies as written.

## About the Design Files
`Volcanae Main Menu.dc.html` is a **design reference created in HTML** — a prototype
showing the intended look and behavior. It is **not production code to copy directly**.
Your task is to **recreate this design in the existing Volcanae codebase** (React +
TypeScript + Zustand) using its established patterns:

- Build it in `src/components/MainMenu.tsx` + `src/components/MainMenu.css`.
- Keep the "no raw literals in TSX" rule from the original prompt: all colors, sizes,
  timings live as CSS custom properties in `MainMenu.css`.
- Wire it to the stores/actions defined in MM-03 / MM-04 exactly as the original prompt
  describes. The redesign changes pixels, not data flow.

The `.dc.html` is a self-contained component: open it in a browser to see the live design,
interactions, and panel transitions. Ignore the `<x-dc>` / `support.js` wrapper — that is
just the prototyping runtime, not part of your app.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and
interactions. Recreate pixel-for-pixel using the codebase's libraries. Exact values
are in **Design Tokens** below.

---

## Layout — Portrait, phone-locked

The menu is a **portrait-locked mobile layout**. In the prototype it is framed inside a
centered device frame so it always renders 9:19.5 regardless of viewport width; **in the
real app the device frame is NOT needed** — the menu simply fills the app viewport
(`100dvh`, safe-area insets). Recreate only the *inner* stage (everything inside the phone
bezel), not the bezel/desk-background.

### Inner stage structure (z-index order)
1. **Background art** (`z:0`) — `menu_bg.png`, `background-size:cover`, `background-position:52% center`.
2. **Legibility scrims** (`z:1`, `pointer-events:none`) — three stacked gradients (see tokens).
3. **Magic motes** (`z:2`, `pointer-events:none`) — 4 small cyan dots drifting upward (ambient only; safe to omit on low-end).
4. **ROOT content** (`z:3`) — column, `padding: calc(env(safe-area-inset-top) + 38px) 22px calc(env(safe-area-inset-bottom) + 28px)`:
   - Top: **logo image** (centered).
   - `margin-top:auto` pushes the button rail to the bottom.
5. **Panels** (`z:5`) — NEW / LOAD / OPTIONS overlays, `position:absolute; inset:0`, full-cover frosted glass, one visible at a time keyed by `panel`.

---

## Screens / Views

### 1. ROOT (main menu)
**Purpose:** landing screen; launch or resume a game, or open sub-panels.

**Logo block (top):**
- A single **logo image** (`/assets/logo.png`, from `Volcanae/public/assets/logo.png` — the stone/lava "VolcaNae" mark with a transparent background), centered.
- Sizing: `width: min(92%, 360px); height: auto;` inside a `display:flex; justify-content:center` wrapper, `margin-top:8px`.
- Glow: `filter: drop-shadow(0 8px 26px rgba(255,90,30,.28)) drop-shadow(0 4px 18px rgba(40,120,220,.3))`.
- **No text wordmark, no eyebrow label, no tagline** — these were removed. The logo art carries the brand entirely.
- The logo PNG is already transparent; use it 1:1, do not re-key or alter its alpha.

**Button rail (bottom, `max-width:360px`, `gap:11px`):**

- **Continue** (primary): height 66px, radius 18px, padding `0 20px`, `gap:14px`.
  - Background: `linear-gradient(135deg, rgba(46,160,255,.34), rgba(20,60,110,.30))` + `backdrop-filter:blur(14px)`.
  - Border `1px solid rgba(120,220,255,.55)`; shadow `0 14px 34px rgba(20,90,160,.42), inset 0 1px 0 rgba(255,255,255,.28)`.
  - Leading icon tile: 44×44, radius 13px, `linear-gradient(150deg,#5ee7ff,#2b8cff)`, shadow `0 6px 16px rgba(43,140,255,.55)`, containing a **play** glyph (`#06121f`).
  - Label: "Continue" Sora 800 19px (`white-space:nowrap`) + subtitle "TURN 42 · NORTHERN PUSH" Space Grotesk 600 11px, `rgba(200,236,255,.82)`, `white-space:nowrap; text-overflow:ellipsis`.
  - Trailing chevron-right, `opacity:.7`, stroke `#cfeaff`.
  - Only shown when ≥1 save slot exists (MM-05). Click → `continueGame()`.

- **New Game / Load Game / Options** (secondary, identical shell): height 56px, radius 16px, padding `0 18px`, `gap:14px`.
  - Background `rgba(11,18,26,.5)` + `backdrop-filter:blur(12px)`; border `1px solid rgba(150,200,230,.16)`.
  - Leading icon tile: 36×36, radius 11px, `background:rgba(80,180,255,.12)`, border `1px solid rgba(120,200,255,.20)`, stroke color `#7fd4ff`.
  - Label Sora 700 16px (`white-space:nowrap`), flex:1; trailing chevron-right stroke `#9fb2bd` `opacity:.5`.
  - Icons: New = feather/quill (pencil-write), Load = folder, Options = gear.
  - Clicks → `goPanel('NEW'|'LOAD'|'OPTIONS', 'forward')`.

- **Version tag:** "v0.x", Space Grotesk 500 10px, `#6f8291`, margin-top 8px. (No "PUSH FORWARD" suffix.)

- **All buttons:** `:active { transform: scale(.978) }` (0.94 for the small 44px back button).

### 2. NEW (New Campaign panel)
Frosted full-cover panel (see panel style token). Header: 44×44 back button (chevron-left) + title "New Campaign" Sora 700 25px.
- **Campaign name** field: label (Space Grotesk 600 11px, letter-spacing `.14em`, uppercase, `#8fa6b4`) + text input, height 54px, radius 15px, bg `rgba(10,16,24,.7)`, border `1px solid rgba(150,200,230,.2)`, `:focus { border-color:rgba(80,200,255,.6); box-shadow:0 0 0 3px rgba(67,214,255,.16) }`. Behavior per MM-05 (default name, clear-on-focus, restore-on-empty-blur, maxLength 32).
- **Difficulty**: 3-segment selector (Easy / Standard / Hard), each `flex:1`, height 50px, radius 13px, Sora 700 15px.
  - Inactive: bg `rgba(11,18,26,.5)`, border `1px solid rgba(150,200,230,.14)`, color `#a7bccb`.
  - Active: bg `rgba(80,180,255,.16)`, border `1px solid rgba(120,210,255,.6)`, color `#bfeaff`, shadow `0 0 18px rgba(60,160,255,.28)`.
  - Below: description card (bg `rgba(10,16,24,.6)`, border `rgba(150,200,230,.12)`, radius 15px) with difficulty name (Sora 700 14px `#9fe0ff`) + description (Manrope 500 13px `#9fb2bd`). Copy below.
- **World generation** stub: disabled dashed button with a globe icon, "World generation — coming soon", `#7c8f9c`, `cursor:not-allowed`.
- **Start Campaign** (primary CTA, same gradient/glass as Continue), height 58px, play icon `#eaf9ff`.

Difficulty copy (exact):
- Easy — "Gentler heat. Reduced enemy pressure and generous yields — good for learning the front."
- Standard — "Balanced heat. Enemy pressure and resource yields as designed — the intended way to play."
- Hard — "Relentless. Aggressive enemies and lean resources — every push has to count."

### 3. LOAD (Load Game panel)
Header: back button + "Load Game". Scrollable list (`gap:11px`) of save rows. Each row: 15px padding, radius 17px, `gap:14px`, a 46×46 radius-13 icon tile, name (Sora 800 16px) + meta line (Space Grotesk 600 11px, letter-spacing `.05em`, uppercase), and a right-side action cluster.
- **Active/newest slot** (highlighted): bg `linear-gradient(100deg, rgba(46,140,255,.18), rgba(11,18,26,.82))`, border `1px solid rgba(120,210,255,.42)`, shadow `0 0 26px rgba(60,160,255,.16)`, meta color `#6fd0ff`, volcano icon `#7fd4ff`.
- **Normal slot**: bg `rgba(11,18,26,.62)`, border `rgba(150,200,230,.14)`, meta `#7c8f9c`.
- **Incompatible slot**: `opacity:.55`, X-circle icon `#7c8f9c`, meta "INCOMPATIBLE (v7)"; Load disabled, Delete allowed.
- Row actions: **Load** pill (Sora 700 13px; active variant bg `rgba(80,180,255,.18)` border `rgba(120,210,255,.4)`), **Export** icon button (down-into-tray, 38×38, stroke `#a7bccb`), **Delete** icon button (trash, stroke `#ff9a86`, border `rgba(255,140,120,.28)`).
- Footer: "Import save" dashed pill (upload-out icon, `#a7bccb`) on the left; pager `‹ 1 / 3 ›` on the right (36×36 chevron buttons). Pager shown only when total > `SLOTS_PER_PAGE`.

### 4. OPTIONS panel
Header: back + "Options". Sections `gap:24px`:
- **Music** + **Sound FX** sliders: label row (uppercase Space Grotesk 600 11px `#8fa6b4`) with a live percent value in `#6fd0ff`. Range track `rgba(150,200,230,.18)`, thumb 18px white with `box-shadow:0 0 12px rgba(67,214,255,.8)`, `accent-color:#43d6ff`.
- Divider: 1px `rgba(150,200,230,.12)`.
- **Storage**: status card (green dot `#4fe3a3` w/ glow, "Durable storage active", usage "4.2 / 60 MB used") + "Request durable storage" button (shield icon) + note "Installing the app to your home screen improves save durability." Wire to MM-05 storage APIs.

---

## Custom SVG Icons (replace ALL emoji)
All icons are 24×24 viewBox, stroke-based (except the solid play triangle), rounded joins/caps, stroke-width ~1.6–1.7. Copy the exact `<path>` data from the corresponding button in `Volcanae Main Menu.dc.html`. Inventory:
- **play** — solid triangle `M8 5.5v13l11-6.5-11-6.5Z` (fill, not stroke). Used on Continue & Start.
- **chevron-right** `M9 6l6 6-6 6` / **chevron-left** `M15 6l-6 6 6 6`.
- **new (feather/quill)** — the pencil-write path on the New button.
- **folder** `M4 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7…`.
- **gear** — the settings cog path on Options.
- **globe** — coming-soon stub.
- **volcano** `M4 20l6-15 3 7 2-3 5 11H4Z` (Load active-slot icon).
- **sparkle/star** — normal-slot icon.
- **x-circle** — incompatible slot.
- **download/export** `M12 4v11m0 0l-4-4m4 4l4-4M5 19h14` and **upload/import** `M12 20V9m0 0l-4 4m4-4l4 4M5 5h14`.
- **trash** `M5 7h14M9 7V5h6v2m-8 0l1 12h8l1-12`.
- **shield** `M12 3l7 3v6c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V6l7-3Z`.

In-codebase: prefer your existing icon library (e.g. lucide/heroicons equivalents — Play, ChevronRight/Left, PenLine, Folder, Settings, Globe, Sparkles, XCircle, Download, Upload, Trash2, ShieldCheck). Match stroke weight and the `#7fd4ff` accent tint. Do **not** reintroduce emoji.

---

## Interactions & Behavior
- **Panel navigation:** single visible panel keyed by `panel`, re-mounted via `key={panel}`. Incoming panel plays a CSS enter animation by `navDir`:
  - `forward` → `mm-in-right` (`from{opacity:0;translateX(26px)} to{opacity:1;translateX(0)}`)
  - `back` → `mm-in-left` (`translateX(-26px) → 0`)
  - Duration `.24s`, easing `cubic-bezier(.2,.8,.2,1)`, `both`.
- **Press feedback:** `transform: scale(.978)` on active for large buttons; `.94` for the 44×44 back button.
- **Ambient:** `mm-sheen` (opacity pulse, 4s) on the eyebrow tick; `mm-mote` (rise + fade, 7–10s staggered) on the 4 motes.
- **Reduced motion:** `@media (prefers-reduced-motion:reduce){ *{animation:none!important} }`.
- Touch targets ≥44px; safe-area insets on all edges.
- All navigation/data wiring (Continue, New, Load, Delete, Export, Import, storage) follows MM-03…MM-08 unchanged.

## State Management
Unchanged from the original prompt chain:
- `menuStore`: `panel` (`ROOT|NEW|LOAD|OPTIONS`), `navDir` (`forward|back`), `screen`, `activeSaveId` (MM-03).
- Local NEW-panel state: campaign `name`, `difficulty` (`EASY|STANDARD|HARD`).
- Data via `saveSystem` async API (MM-02): `listSlots`, `slotCount`, `loadSlot`, `saveSlot`, `deleteSlot`, `exportSlot`, `importSlotFromFile`, `requestPersist`, `isPersisted`, `estimateUsage`.

## Design Tokens (define in `MainMenu.css` as custom properties)

**Colors**
- Base bg `#070b10`
- (Wordmark text gradient removed — brand is now the logo image; keep the gradient only if you ever need a text fallback.)
- Text primary `#eaf2f7` / secondary `#e6eff5` / muted `#a7bccb` / faint `#7c8f9c` / dim `#6f8291`
- Accent cyan `#43d6ff`; accent light `#7fd4ff` / `#9fdcff` / `#bfeaff`; meta cyan `#6fd0ff`
- Gradient stops: `#5ee7ff`, `#2b8cff`, `#46a0ff`, `#2ea0ff`; deep blue `rgba(20,60,110,…)`
- Success green `#4fe3a3`; destructive salmon `#ff9a86`
- Wordmark gradient: `#ffffff → #d5ecff → #5bb8ff`
- Glass fills: `rgba(11,18,26,.5)` (secondary btn), `rgba(10,16,24,.6/.7)` (fields/cards)
- Borders: `rgba(150,200,230,.12–.20)` (neutral), `rgba(120,210,255,.4–.6)` (accent), `rgba(255,140,120,.24–.28)` (destructive)

**Scrims (stage background, stacked)**
1. `linear-gradient(180deg, rgba(7,11,16,.30) 0%, rgba(7,11,16,0) 24%, rgba(7,11,16,.30) 52%, rgba(7,11,16,.86) 82%, rgba(7,11,16,.98) 100%)`
2. `radial-gradient(120% 70% at 12% 108%, rgba(11,20,30,.82), rgba(7,11,16,0) 60%)`
3. `linear-gradient(180deg, rgba(9,16,26,.42), rgba(9,16,26,0) 30%)`

**Panel style:** `background: linear-gradient(180deg, rgba(8,13,20,.92), rgba(6,10,16,.98)); backdrop-filter: blur(14px);` full-cover, same padding as ROOT.

**Typography**
- Display: **Sora** 600/700/800 (wordmark, titles, button labels)
- Body: **Manrope** 400–800 (descriptions, input text)
- Mono/labels: **Space Grotesk** 500/600/700 (eyebrows, meta, percentages, uppercase labels w/ wide tracking)
- Use the codebase's existing font loading; add these three families if absent.

**Radii:** buttons 16–18px, primary CTA 17–18px, icon tiles 11–13px, cards/fields 15px, small chips/action buttons 10–12px, phone-frame 42px (prototype only).

**Shadows:** primary CTA `0 14px 34px rgba(20,90,160,.42), inset 0 1px 0 rgba(255,255,255,.28)`; primary icon tile `0 6px 16px rgba(43,140,255,.55)`; active load-slot glow `0 0 26px rgba(60,160,255,.16)`.

**Spacing:** rail gap 11px; stage padding `38px 22px 28px` (+ safe-area); button padding `0 18–20px`; inner gaps 14px.

## Assets
Both assets already live in the repo at **`Volcanae/public/assets/`** — reference them from there (served at `/assets/...`); do not re-add or relocate them.
- `Volcanae/public/assets/logo.png` — the game logo (stone/lava "VolcaNae" mark, **transparent background**). Rendered centered at the top of the ROOT screen. Use as-is; do not modify transparency.
- `Volcanae/public/assets/menu_bg.png` — the key art (heroes vs. lava titan, waterfalls left / volcano + fire monsters right). Reference via `--mm-bg: url('/assets/menu_bg.png')` (served from `Volcanae/public/assets/`) with a dark radial gradient fallback (per MM-05). `background-position:52% center` frames the composition in portrait.
- No emoji assets. No custom raster icons — icons are inline SVG / your icon library.

## Files in this bundle
- `Volcanae Main Menu.dc.html` — the hifi design prototype (open in a browser). Source of truth for exact SVG paths, gradients, and layout.
- `assets/menu_bg.png` / `assets/logo.png` — bundled copies of the two art assets (the live versions live at `Volcanae/public/assets/`).
- `original_implementation_prompt.md` — the full functional spec (MM-01…MM-09). Still authoritative for architecture, saves, stores, and behavior. This README supersedes only the *visual contract* in MM-05.
