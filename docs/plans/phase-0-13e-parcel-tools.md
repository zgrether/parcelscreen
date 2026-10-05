# Step 13e: parcel tools on the map (plan)

Status: **proposal, for the owner's approval before any code.** Clickable mockup:
https://claude.ai/artifact/LB3hFM9oJVPaCzK17GS23u (source: `phase-0-13e-mockup.html`, beside this file).
It uses made-up parcels with simplified geometry, so it shows the interaction, not the real data.

## 1. Why

Steps 13–13d ported the prototype's tools and added Combine. Each works, but together they don't hang
together (owner's review, 2026-10-05):

- **The tools live in the panel, the work happens on the map.** You press a button in the sidebar, then
  look across at the map; on a phone the buttons sit in the bottom sheet, under your thumb but away from
  what you're editing.
- **Modes are invisible.** "Tap a parcel" and "Mark existing house" change what a map tap does, and only the
  hint says so. There's no Done or Cancel where you're looking.
- **Each tool's controls appear in a different place:** split acres and Fit in the panel, combine's list
  in the panel, draw's Finish in the button row, the house's drag on the map.
- **A finished parcel can't be revised.** Once you use a split piece or a combination, the steps are gone.
  You can't take one parcel back out of a combination, or move a split line after keeping a piece.

## 2. The idea in one paragraph

**The parcel becomes a short recipe that you edit on the map.** Tap the map to load a parcel. A bar on the
map then shows the parcel and what you can do to it. Each tool swaps that bar for its own controls, with
Done and Cancel, while you work right there. The panel shows what the boundary is made of (the recipe), with
an Edit link on each part. So "uncombine" is just Edit parcels → tap one out → Done.

## 3. The recipe (data model)

```ts
interface ParcelRecipe {
  /** Where the boundary starts: one or more county parcels, or a drawn or square boundary. */
  parts: ParcelRecord[];              // ≥ 1; county records, or one drawn/square boundary
  /** A cut through the combined parts, and which side was kept. */
  split?: { a: LatLon; b: LatLon; keep: 1 | -1 };
}
// house stays separate (it's a point, not part of the boundary)
```

- **Derived, never stored:** the boundary (combine the parts per 13b, then apply the split), the facts,
  the acres. Editing any part re-derives everything after it. If a re-derived split no longer cuts the
  boundary, the split is dropped, with a note.
- **Undo and redo** keep the last 50 recipes (plus the house) in memory. ⌘/Ctrl-Z and ⇧⌘/Ctrl-Z, plus
  buttons on the bar.
- **Persistence:** `ps.current` (13d) moves to `{ v: 2, recipe, house }`. A v1 record converts on load: a
  combination becomes its members; a split piece becomes one part with no split (the line wasn't kept
  before 13e).
- **The screen** still receives one polygon. Nothing in `lib/screen` changes.

## 4. Interaction

### Nothing loaded

- **Tapping the map loads a parcel.** On an outline, that outline. Anywhere else, the services are asked, as
  "Tap a parcel" did. *The "Tap a parcel" button and mode go away.*
- **No record there:** a small popover at the tap: "No parcel record here. **Draw the boundary** ·
  **Use a 5 ac square**" (acres editable). This replaces the report-plus-square block in the panel. What
  each service said stays one tap away ("Why?").
- **A bar on the map, bottom centre:** "Tap a parcel to load it · **Draw boundary**". The coordinates box
  moves to a search field at the top left of the map.

### A parcel loaded: the parcel bar

```
┌──────────────────────────────────────────────────────────────────────┐
│ 52-47A + 52-61 · 167.18 ac   [+ Parcels] [Split] [House]  ↶ ↷  [✕] │
└──────────────────────────────────────────────────────────────────────┘
```

- **Tapping another parcel** while one is loaded replaces it, with an Undo toast: "Loaded 52-42A · Undo".
- **✕** clears the parcel. It can be undone.
- **More** (⋯ on narrow screens) holds the less common actions: Redraw by hand, Copy coordinates.

### Each tool takes over the bar

| Tool | Map | Bar |
| --- | --- | --- |
| **Parcels** (add or remove; uncombine) | Members amber; tap one to add or remove it; combined outline dashed | "3 parcels · 167.18 ac · bridges a 9 m road gap" · **Done** · Cancel. Too far apart: the status turns red with the distance, and Done is disabled |
| **Split** | Tap two points for the line; drag its ends; each piece labelled *on the map* with its acres and compass side | "Tap the piece to keep" · target acres + side + **Fit** · Cancel. Tapping a piece keeps it |
| **Draw** | Corners as you tap; tapping the first corner closes it | "4 corners · 3.10 ac" · Undo corner · **Finish** · Cancel |
| **House** | Tap to place the bulls-eye (draggable any time after) | "Tap where the house stands" · Cancel; once placed: Remove |

- **Keys:** Esc = Cancel, Enter = Done or Finish, everywhere.
- **The map cursor** is a crosshair while a tool waits for taps.
- **Hints become the bar's text.** The floating hint stays only for status like "Zoom in to 15+ to see
  parcel lines".

### The panel

Find (coordinates) moves onto the map. The panel's first card becomes **Boundary**:

```
Boundary                                         167.18 ac
  Parcels   52-47A + 52-42A + 52-61 · bridged 9 m   Edit
  Split     kept the north piece · 31.20 ac         Edit · Remove
  House     marked                                  Remove
```

Below it: the parcel facts (owners, IDs, county, source; unchanged), then **Screen it** (step 14).

### Phones

- **The bars sit just above the sheet** (they already ride `--sheet-h`).
- **While a tool is active,** the sheet drops to its peek height and comes back on Done or Cancel, so the map
  gets the room.
- **The bars wrap to two rows when they have to.** The status is on top and the buttons below, at least 44 px
  tall.
- **The search field** collapses to a 🔍 button.

## 5. What changes from the prototype (and from 13–13d)

- **Gone:** the "Tap a parcel" mode and button; the tool button row in the panel; the panel's split and
  combine blocks; hover-only split tooltips (labels sit on the pieces instead).
- **New:** the map bars; the recipe with Edit and Remove; undo and redo; the no-record popover; on-map
  piece labels; keeping a piece by tapping it.
- **Unchanged:** all geometry (`lib/geo` split, combine, square, draw rules); every string the prototype
  showed in the facts table; parcel lines; basemaps and layers.
- **Acceptance (§7b):** the map checklist is rewritten for the new flow. Step 18's e2e drives the bars
  instead of panel buttons.

## 6. PRs (each one small, with its own preview and "what to click")

1. **13e-1 Recipe:** `lib/geo/recipe.ts` (derive the boundary and facts from a recipe), undo and redo, and
   the `ps.current` v1 → v2 migration. Pure, fully unit-tested; the current UI keeps working on top of it.
2. **13e-2 Map bars:** the idle and parcel bars, tap-to-load, the no-record popover, the search field, the
   Undo toast. Remove the panel's tool row and the pick mode.
3. **13e-3 Tools in the bar:** Parcels, Split (on-map labels, tap a piece to keep it), Draw and House, plus
   the panel's Boundary card with Edit and Remove.
4. **13e-4 Phone polish:** the sheet dropping to peek during a tool, bar wrapping, touch targets, the
   search button.

## 7. Open questions for the owner

1. **Tap-to-load in idle** asks the services wherever you tap, even with no outline there. That's one
   request per tap on empty land, which is fine for these services. Or should tapping empty map do nothing
   unless you press Find?
2. **Splitting a combination** cuts across all its parts, including the bridged strip. Keep that, or only
   allow splitting single parcels?
3. **Replacing on tap:** with a parcel loaded, should tapping another parcel replace it (with Undo, as
   proposed), or do nothing until you press ✕?
4. **Undo depth** of 50, in memory only (not kept across a refresh). OK?
