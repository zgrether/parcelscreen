# Step 13e: parcel tools on the map (plan)

Status: **proposal v2, for the owner's approval before any code.** Revised after the owner's answers and
mockup comment on 2026-10-05. Clickable mockup: https://claude.ai/artifact/LB3hFM9oJVPaCzK17GS23u (source:
`phase-0-13e-mockup.html`, beside this file). It uses made-up parcels with simplified geometry, so it shows
the interaction, not the real data.

## 1. Why

Steps 13–13d ported the prototype's tools and added Combine. Each works, but together they don't hang
together (owner's review, 2026-10-05):

- **The tools live in the panel, the work happens on the map.** On a phone the buttons sit in the bottom
  sheet, away from what you're editing.
- **Modes are invisible.** "Tap a parcel" and "Mark existing house" change what a map tap does, and only the
  hint says so. There's no Done or Cancel where you're looking.
- **Each tool's controls appear in a different place.**
- **A finished parcel can't be revised.** Once you use a split piece or a combination, the steps are gone,
  so you can't take one parcel back out of a combination.
- **Work disappears.** A tap elsewhere, or a refresh before 13d, starts you over.

## 2. The idea in one paragraph

**A parcel you change becomes a *built parcel*: a short recipe that is saved and stays on the map.** Tap a
visible parcel to select it. A toolbar on the map shows its name, its tools (**+ Parcels · Split · Draw ·
House**) and its total acres. The acres button expands the specifics right under the toolbar: each part
with Edit or Remove, and Close. A plain parcel straight from a tap swaps freely when you tap another. Once
you've changed it, it's saved and stays open until you Close it. After that it stays on the map, outlined
in amber, and under Saved parcels, and you tap it to reopen.

## 3. Model

```ts
interface ParcelRecipe {
  /** County parcels and/or drawn areas, combined (13b rules; drawn areas join wherever they touch). */
  parts: ParcelPart[];               // { record: ParcelRecord } | { drawn: Polygon }
  /** A cut through the whole combined boundary, bridged strip included, and the side kept. */
  split?: { a: LatLon; b: LatLon; keep: 1 | -1 };
}
interface BuiltParcel { key: string; recipe: ParcelRecipe; house: LatLon | null; updatedAt: string }
```

- **When a parcel counts as built:** it has more than one part, a drawn part, a split, or a house. Built
  parcels are saved automatically. That is **the "Saved parcels" list of step 16, filled as you work**
  rather than after a screen run, and saving after a run still works.
- **Derived, never stored:** the boundary, the facts and the acres. Editing a part re-derives everything
  after it. If a split no longer cuts the new boundary, it's dropped, with a note.
- **Persistence:** localStorage keeps `{ v: 2, open, built[] }`. 13d's v1 record converts to a single open
  parcel (built, if it was changed). It moves to Supabase in Phase 1.
- **No undo or redo.** Edit and Remove on each part, the lock on built parcels and Delete cover it (the owner
  asked why undo would be needed).
- **The screen** still receives one polygon. Nothing in `lib/screen` changes.

## 4. Interaction

### Selecting

- **Nothing open, parcel lines visible:** tapping an outline selects it and brings up the toolbar.
- **Tapping empty map does nothing.** There's no service lookup and no popover. For land with no record,
  use **Draw a parcel** on the bar. *(Tap-a-parcel mode, its button and the no-record report all go away.)*
- **A plain parcel is open** (straight from a tap, unchanged): tapping another parcel swaps to it.
- **A built parcel is open:** tapping elsewhere does nothing to it. A short note says "Close it first; it
  stays saved".
- **Tapping a saved built parcel** (amber on the map) opens it, as does Open in the panel's Saved parcels
  list.

### The toolbar (bottom centre of the map)

```
 52-47A + 52-61 · saved   [+ Parcels] [Split] [Draw] [House]        [167.18 ac ▾]
 ── expanded ─────────────────────────────────────────────────────────────────────
  Parcels   52-47A + 52-61 · bridged 10 m                     Edit
  Drawn     1.23 ac, 4 corners                                Remove
  Split     kept the W piece                                  Edit · Remove
  House     marked                                            Remove
  Owner     R. & J. Hale
  The boundary also spans 1.14 ac of road right-of-way; the acres leave it out.
                                                       [Close]  Delete
```

- **Nothing open:** "Tap a parcel to select it · **Draw a parcel**".
- **Each tool swaps the toolbar for its own controls,** with Done or Cancel. Esc cancels; Enter finishes.

| Tool | Map | Toolbar |
| --- | --- | --- |
| **+ Parcels** (add or remove; uncombine) | Parts amber; tap a parcel to add or remove it | "3 parcels · 92.95 ac · bridges a 10 m road gap" · **Done** · Cancel. Too far apart: the status turns red with the distance, and Done is disabled |
| **Split** | Tap two points; drag the ends; each piece labelled *on the map* with its acres and side; the cut goes across everything, bridged strip included | "Tap the piece to keep" · target acres + side + **Fit** · Cancel |
| **Draw** | Corners as you tap; the first corner closes it | "4 corners · 3.10 ac" · Undo corner · **Finish** · Cancel. With nothing open, it makes a new parcel; with a parcel open, it **adds** the area (an unrecorded strip, a missing piece) |
| **House** | Tap to place; drag any time after | "Tap where the house stands" · Cancel; Remove is in the expanded toolbar |

### The panel

**Parcel** shows the facts (owners, IDs, county, source; unchanged strings). **Saved parcels** lists the
built parcels with Open. **Screen it** comes in step 14. The coordinates box moves onto the map as a search
field.

### Phones

- **The toolbar sits above the sheet.** The title and acres share the first row, and the tools go on the
  second.
- **The sheet drops to its peek height while a tool is active.**
- **Touch targets are at least 36–44 px.**

## 5. What changes from the prototype (and from 13–13d)

- **Gone:**
  - the "Tap a parcel" mode and button;
  - the no-parcel report and square fallback (replaced by Draw);
  - the tool button row and the split and combine blocks in the panel;
  - hover-only split tooltips.
- **New:**
  - the map toolbar with its expanding details;
  - built parcels (auto-saved, locked while open, kept on the map);
  - Draw adding to a parcel;
  - on-map piece labels, and keeping a piece by tapping it;
  - Edit and Remove per part.
- **Unchanged:**
  - the geometry in `lib/geo` (split, combine, draw rules);
  - the facts strings;
  - parcel lines, basemaps and layers.
- **Acceptance (§7b):** the map checklist is rewritten for this flow. Step 18's e2e drives the toolbar.
- **Step 16** keeps the Settings dialog, and its Saved parcels part shrinks to after-run saves, export and
  import.

## 6. PRs (each one small, with its own preview and "what to click")

1. **13e-1 Model:** `lib/geo/recipe.ts` (derive a boundary and facts from a recipe; drawn parts in
   `combineParcels`), built-parcel rules, and the storage format with the v1 → v2 migration. Pure and fully
   unit-tested.
2. **13e-2 Toolbar:** the idle and open toolbars, tap-to-select, swap and lock rules, the expanding
   details, saved built parcels drawn on the map and listed in the panel, and the search field. Remove the
   panel's tool row and the pick mode.
3. **13e-3 Tools in the toolbar:** + Parcels, Split (on-map labels, tap a piece to keep it), Draw (new or
   added), House, and Edit or Remove per part.
4. **13e-4 Phone polish:** the sheet dropping to peek during a tool, the two-row toolbar, and touch targets.

## 7. Decisions (owner, 2026-10-05) and what's left

Decided:
1. **Tapping with nothing open** selects a visible outline and brings up the toolbar. Empty map does
   nothing.
2. **A split** cuts across the whole combined boundary.
3. **A changed parcel stays put** until you close it. A plain tapped parcel swaps freely.
4. **No undo or redo.** The toolbar's right end is the total acres, which expands the specifics. Built work
   is saved and stays on the map.
5. **Draw a parcel** is a full tool, new or added.

Still to confirm:
- **Does marking the house** on a plain parcel make it "built" (saved and locked)? Proposed: yes, since it's
  work you'd lose.
- **Should a tap on another parcel** while a built one is open show the short "Close it first" note, or stay
  completely silent?
- **Should built parcels you've Closed** stay drawn on the map (amber) indefinitely, or only those touched in
  this session? Proposed: all, with a layer toggle later if it gets busy.
