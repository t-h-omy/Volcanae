# Volcanae — Main Menu + Multi-Slot Save System — Implementation Prompt Chain

Implements: pre-game Main Menu (Continue / New Game / Load Game / Options), IndexedDB multi-slot saves, best-effort persistent storage, export/import save files, in-game return-to-menu.

Execute prompts in order; each depends on all previous. Reference the existing Volcanae file structure. Rules:
- Only ADD new sections to `gameConfig.ts`; never edit existing constants.
- No raw literals in logic or UI — all save tunables live in the new `SAVE` config section; menu *visual* constants live in `MainMenu.css`; the menu track filename lives beside `MUSIC_TRACKS` in `musicSystem.ts`.
- All range checks (none expected here) via `rangeUtils.ts`.
- Bump the **minor** `version` in `package.json` and add a matching `CHANGELOG.md` entry at the end (do not hardcode a specific number — use current minor + 1).
- Do **not** bump `SAVE_VERSION`: the persisted `state` shape is unchanged. The existing `loadGameState` migration chain is reused verbatim as the per-slot state migrator.

---

## PROMPT MM-01 — SAVE config (`src/gameConfig.ts`)

ADD a new `SAVE` section (new exported const block, new `// ===` header):
- `SLOT_CAP: 100` — max manual slots; New Game blocked at cap.
- `SLOTS_PER_PAGE: 10` — Load list page size; pagination hidden at ≤ this.
- `NAME_MAX_LENGTH: 32`
- `DEFAULT_NAME_PREFIX: 'Campaign'` — default slot name is `${PREFIX} ${n}` where n = lowest unused integer ≥ 1.
- `LEGACY_KEY: 'volcanae-save'` — old single-slot localStorage key, imported once.
- `IDB_NAME: 'volcanae'`, `IDB_VERSION: 1`
- `STORE_META: 'saveMeta'`, `STORE_DATA: 'saveData'`
- `EXPORT_FILE_EXT: '.volcanae.json'`

Do not import or reference menu visual values here.

---

## PROMPT MM-02 — Save storage rewrite to IndexedDB multi-slot (`src/saveSystem.ts`)

Goal: N named slots in IndexedDB, with a **light metadata store** read by the Load list and a **heavy state store** read only on load (so listing 100 saves never deserializes 100 game states).

KEEP the entire existing version-migration body of `loadGameState` — extract it into a private `migrateState(parsed: { version; state }): GameState | null` that does the same validation + migrations and returns the migrated `GameState` or `null`. Both IDB load and legacy import route through it.

DEFINE and export:
- `type SaveSlotMeta = { id: string; name: string; version: number; savedAt: number; turn: number; difficulty: Difficulty }`
- IDB schema (in an `openDb()` helper): object store `STORE_META` keyed by `id` (holds `SaveSlotMeta`); object store `STORE_DATA` keyed by `id` (holds `{ version: number; state: GameState }`). Create both in `onupgradeneeded`.

EXPORT this async API (all wrapped in try/catch, resolving to safe fallbacks — never throw to callers):
- `idbAvailable(): boolean` — feature-detect `indexedDB`.
- `listSlots(): Promise<SaveSlotMeta[]>` — read `STORE_META` only, sorted by `savedAt` desc.
- `loadSlot(id): Promise<GameState | null>` — read `STORE_DATA`, run `migrateState`; null on miss/incompatible.
- `saveSlot(args: { id: string; name: string; state: GameState }): Promise<void>` — writes both stores in one transaction; `SaveSlotMeta` derived from `state` (`turn`, `difficulty`) + `SAVE_VERSION` + `Date.now()`.
- `deleteSlot(id): Promise<void>` — delete from both stores.
- `slotCount(): Promise<number>` — count of `STORE_META`.
- `isSlotCompatible(meta): boolean` — mirror the existing guard (`version <= SAVE_VERSION && version >= 8`).
- `exportSlot(id): Promise<Blob | null>` — JSON Blob of `{ version, name, state }`; caller triggers download (filename `${name}${SAVE.EXPORT_FILE_EXT}`).
- `importSlotFromFile(file: File): Promise<SaveSlotMeta | null>` — parse, validate via `migrateState`, write to a **new** slot id, return its meta; null on invalid.
- `migrateLegacyIfPresent(): Promise<void>` — if `localStorage[SAVE.LEGACY_KEY]` exists and no slot was previously imported from it, parse + `migrateState`, write as a slot named `Imported save`, then leave the legacy key intact (do not delete).
- `requestPersist(): Promise<boolean>` — `navigator.storage?.persist?.()`; safe-false if absent. Caller invokes inside a user gesture.
- `isPersisted(): Promise<boolean>` — `navigator.storage?.persisted?.()`.
- `estimateUsage(): Promise<{ usage: number; quota: number } | null>` — `navigator.storage?.estimate?.()`.

KEEP the old `saveGameState/loadGameState/clearSavedGame/hasSavedGame` exports as thin localStorage helpers ONLY if still referenced after MM-04; otherwise remove them and update callers. Prefer removal.

---

## PROMPT MM-03 — Menu store (`src/menuStore.ts`, new file)

Zustand store, mirror existing store style (see `soundOptionsStore.ts`). NOT persisted into save state.

State:
- `screen: 'MENU' | 'GAME'` — default `'MENU'`.
- `panel: 'ROOT' | 'NEW' | 'LOAD' | 'OPTIONS'` — default `'ROOT'`.
- `navDir: 'forward' | 'back'` — drives panel slide animation.
- `activeSaveId: string | null` — the slot the running game autosaves into.

Actions:
- `goPanel(panel, dir)` — set panel + navDir.
- `enterGame(activeSaveId)` — set `activeSaveId`, `screen = 'GAME'`, reset `panel='ROOT'`.
- `toMenu()` — `screen = 'MENU'`, `panel='ROOT'`, `navDir='back'`.

`activeSaveId` is the single source of truth for the autosave target (no dedicated autosave slot — each game owns exactly one slot for its lifetime).

---

## PROMPT MM-04 — Game store wiring (`src/gameStore.ts`, `src/App.tsx`)

In `gameStore.ts`:
- ADD actions:
  - `newGameInSlot(name: string, difficulty: Difficulty)`: generate `id` (use `generateId()`), `generateInitialGameState(difficulty)`, `updateDiscovery`, `applySpecialistEffects`, `syncCameraToPlayerStronghold`; `await saveSlot({id,name,state})`; then `useMenuStore.getState().enterGame(id)`.
  - `continueGame()`: pick newest slot via `listSlots()[0]`; `loadIntoGame(meta.id)`.
  - `loadIntoGame(id)`: `loadSlot(id)`; if null, no-op; else `Object.assign(state, loaded)`, `applySpecialistEffects`, `syncCameraToPlayerStronghold`, `enterGame(id)`.
- REPLACE the autosave calls (`gameStore.ts:~1859` and `~2788`) so that, on the same phase conditions, they call `saveSlot({ id: activeSaveId, name: <existing slot name>, state })` where `activeSaveId = useMenuStore.getState().activeSaveId`. If `activeSaveId` is null (defensive), skip. Preserve the slot's existing `name` (read current meta; fall back to default name if missing). Autosave is fire-and-forget (do not await inside the reducer).
- Keep/repurpose `initGame` ONLY for legacy/no-op; it must NOT auto-resume. Remove its use as a mount initializer.

In `App.tsx`:
- REMOVE the unconditional `useEffect(() => initGame(), …)`.
- Subscribe to `useMenuStore(s => s.screen)`. Render `<MainMenu/>` when `'MENU'`, `<Game/>` when `'GAME'`.
- MOVE `useAnimationEngine()`, `useMusicPlayer()`, asset preload, and the turn-popup logic into a new `<Game/>` component (extract current game JSX). The menu must not mount game music or the animation engine. Keep the A2HS hook available to both (lift to App or duplicate minimally).

On cold start: `screen` defaults to `'MENU'`; call `migrateLegacyIfPresent()` once when the menu first mounts.

---

## PROMPT MM-05 — Main menu component (`src/components/MainMenu.tsx` + `MainMenu.css`, new files)

Visual contract: black base, red accent (`#ff4444`), `hud-*`-consistent panels/buttons, emoji-led labels, ≥44px touch targets, safe-area insets (`env(safe-area-inset-*)`), large stacked centered buttons over a darkened background image. No title/logo. All colors/sizes/timings in `MainMenu.css` (CSS custom properties), no literals in TSX.

Background: CSS `background-image` on the menu stage pointing at a documented swap path (e.g. `--mm-bg: url('/assets/menu_bg.png')`); the asset does not exist yet, so define a **gradient fallback** (dark red→black radial) as the default and leave a single commented line marking where the image URL is enabled later.

Animation (no static screen change): single visible panel keyed by `panel`. On navigate, the incoming panel plays a CSS enter animation chosen by `navDir`: `forward` → slide in from right + fade; `back` → slide in from left + fade. Implement via a `data-dir` attribute + `@keyframes` (`mm-enter-right`, `mm-enter-left`) on `.mm-panel`, re-triggered by a React `key={panel}`. Duration ~220ms, ease-out. (Optional: keep a brief leaving-copy for a true cross-slide; the enter animation alone is the required baseline.)

Panels:
- **ROOT:** `▶️ Continue` (only if ≥1 slot exists — query `slotCount()` on mount), `🆕 New Game`, `📂 Load Game`, `⚙️ Options`. Continue → `continueGame()`. New/Load/Options → `goPanel(x, 'forward')`.
- **NEW:**
  - Name `<input>` pre-filled with the computed default (`${DEFAULT_NAME_PREFIX} ${n}`). Behavior: focus/click clears the field for free input; on blur with empty value, restore the default; on Start with empty value, use the default. Enforce `NAME_MAX_LENGTH` (trim).
  - Difficulty selector reusing the existing EASY/STANDARD/HARD presentation (extract the difficulty button list/labels/descs from `HUD.tsx` into a shared piece, or replicate the markup/classes).
  - A disabled "World generation (coming soon)" control — visible, non-interactive stub. (Seed/world-gen deferred entirely; do not wire.)
  - `Start`: if `slotCount() >= SAVE.SLOT_CAP`, block and show inline notice "Save limit reached (100). Delete a save to start a new game." with a button switching to the LOAD panel. Otherwise `newGameInSlot(name, difficulty)`. After the first successful Start, call `requestPersist()` (best-effort, no UI nag).
  - `Back` → `goPanel('ROOT','back')`.
- **LOAD:**
  - `listSlots()` on mount/refresh. Scrollable list, `SLOTS_PER_PAGE` per page; page nav controls shown only when total > one page. Each row: name, `Turn {turn}`, difficulty label, relative `savedAt`. Sorted newest-first.
  - Row actions: `Load` (→ `loadIntoGame(id)`), `Delete` (confirm step, then `deleteSlot` + refresh), `Export` (→ `exportSlot` → trigger Blob download).
  - Incompatible slots (`!isSlotCompatible(meta)`): rendered greyed, labelled `Incompatible (v{version})`, Load disabled, Delete + Export allowed.
  - An `Import save` button → hidden file input → `importSlotFromFile` → refresh (show error toast on null).
  - `Back` → ROOT.
- **OPTIONS:** existing sound controls (reuse the in-game Options markup), PLUS: persistent-storage status line from `isPersisted()` with a `Request durable storage` button (→ `requestPersist()`, gesture-bound) when not yet persisted; an "Installing the app improves save durability" note tied to the A2HS availability; storage usage readout from `estimateUsage()` (`used / quota` MB). `Back` → ROOT.

When IndexedDB is unavailable (`!idbAvailable()`): menu still renders; Continue/Load/New show a non-blocking notice that saving is unavailable in this context (e.g. private mode); New Game may still start an unsaved session.

---

## PROMPT MM-06 — Menu music (`src/musicSystem.ts`, `src/components/MainMenu.tsx`)

In `musicSystem.ts`: ADD `export const MENU_TRACK = 'Menu Theme - Dreams of Tomorrow.mp3';` adjacent to `MUSIC_TRACKS` (served from `public/music/`). Do not add it to the shuffled `MUSIC_TRACKS` pool.

In `MainMenu.tsx`: play `MENU_TRACK` on a dedicated `Audio` element while `screen === 'MENU'`. Loop it. Respect `useSoundOptionsStore` (volume/mute) exactly like `useMusicPlayer`. Reuse the autoplay-blocked pattern (start on first `pointerdown`/`keydown` if `play()` rejects). Stop and release the audio on Start / leaving the menu. Fail silently if the file is absent.

---

## PROMPT MM-07 — In-game return to menu (`src/components/HUD.tsx`)

In the in-game Options overlay (`OptionsOverlay`): ADD a `🏠 Main Menu` button. On click: if `phase ∈ {GAME_OVER, VICTORY}` → `deleteSlot(activeSaveId)` (terminal game, see MM-08); else autosave the current state into `activeSaveId` (reuse the `saveSlot` path; await best-effort). Then clear `activeSaveId` and `useMenuStore.getState().toMenu()`. Place it visually separated (destructive-adjacent) with the existing button classes.

---

## PROMPT MM-08 — Finished-game deletion + end-overlay rework (`src/gameStore.ts`, `src/components/HUD.tsx`)

Policy: a game that reaches `GAME_OVER` or `VICTORY` is terminal and is removed from saves when the player **leaves** it (not the instant the phase flips). The terminal state is still autosaved (MM-04 conditions unchanged), so death sticks across a force-quit; the slot is deleted only on acknowledge.

In `gameStore.ts`:
- ADD `discardFinishedGame()`: if `activeSaveId` is set and `phase ∈ {GAME_OVER, VICTORY}`, `await deleteSlot(activeSaveId)`, clear `activeSaveId`. No-op otherwise. Idempotent.

Rework the end overlays (`GameOverOverlay`, `VictoryOverlay` in `HUD.tsx`) — the existing single buttons call the legacy `initNewGame(difficulty)` and must change:
- `🔄 New Game`: `discardFinishedGame()` → route to the menu NEW panel (`screen='MENU'`, `panel='NEW'`). Starting a brand-new game always goes through the named-slot flow now; do not silently reuse the dead slot.
- `🏠 Main Menu`: `discardFinishedGame()` → `toMenu()`.
- Keep the stats display (`EndGameStats`) and add a `📤 Export` button that calls `exportSlot(activeSaveId)` **before** deletion, so a finished run can be saved off-device.
- Buttons use existing overlay button classes.

Continue/Load of a slot whose stored `phase` is terminal: loads normally and shows the end overlay (review path after a force-quit). Leaving via the overlay then deletes it as above.

Result: the Load list only ever contains resumable (non-terminal) games; finished runs are reviewable/exportable once, then cleared on exit.

---

## PROMPT MM-09 — Version, changelog, descriptions

- Bump the `version` minor in `package.json` (current minor + 1; patch reset to 0).
- ADD a `CHANGELOG.md` entry summarizing: Main Menu (Continue/New/Load/Options), IndexedDB multi-slot saves with metadata-light listing, best-effort persistent storage, export/import save files, in-game return-to-menu, finished (won/lost) games auto-removed from saves on exit, dedicated menu theme.
- No unit/building description changes apply to this feature.

---

## Acceptance checks
- Cold start lands on the Main Menu; no game auto-resumes.
- New Game with blank name uses the pre-filled default; the field clears on focus and restores on empty blur.
- A started game autosaves into its own single slot for its lifetime; reopening → Continue resumes it; it also appears in Load.
- Load list with >10 saves paginates; ≤10 hides pagination; 100-save cap blocks New Game Start with a delete prompt.
- Exporting a slot downloads a file that re-imports as a new, loadable slot (round-trip).
- Legacy `volcanae-save` (if present) appears once as `Imported save`.
- Incompatible-version slots are listed, greyed, non-loadable, deletable.
- A won/lost game shows its end screen (review + export), and its slot is deleted only when the player leaves via New Game / Main Menu; a force-quit during the end screen re-shows it via Continue, then deletes on exit. Finished games never linger in the Load list.
- Menu plays the dedicated theme (volume/mute honored); game music does not run on the menu.
- Panel navigation animates (forward/back slide+fade), never a static cut.
- Private-mode / no-IDB: menu works, saving degrades gracefully with a notice.
