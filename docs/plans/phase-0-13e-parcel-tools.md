# Step 13e: parcel tools on the map (plan)

Status: **proposal v3.3, for the owner's approval before any code.** Revised after the owner's review of
mockups v2–v6 on 2026-10-05. Clickable mockup (v7): https://claude.ai/artifact/LB3hFM9oJVPaCzK17GS23u (source:
`phase-0-13e-mockup.html`, beside this file). It uses made-up parcels and made-up results with simplified
geometry, so it shows the interaction, not the real data.

## 1. Why

Steps 13–13d ported the prototype's tools and added Combine. Each works, but together they don't hang
together (owner's review, 2026-10-05):

- **The tools live in the panel, the work happens on the map.**
- **Modes are invisible.** Only the hint says what a tap will do.
- **Each tool's controls appear in a different place.**
- **A finished parcel can't be revised.** You can't take one parcel back out of a combination.
- **Work disappears.** A tap elsewhere, or a refresh before 13d, starts you over.
- **Nothing on the map can be picked, hidden or removed one at a time:** parts, the house, and later the
  results.

## 2. The idea

- **Select by tapping.** Tap a parcel to select it, and tap it again (or empty map) to unselect it.
- **A one-line toolbar** on the map: **Add: Select · Draw │ Split · House │ 🗑**, then the total acres as a
  quiet link with a caret. "Add:" is a label over the two ways of adding: **Select** county parcels, or
  **Draw** a custom shape (a corner the county has no record of; with nothing selected, a new parcel). The
  trash appears only on a built parcel.
- **Notes** get their own see-through panel on the map, which looks and behaves like Layers.
- **The acres link opens a Layers + Info panel,** like Figma's or Photoshop's. Everything on the parcel is a
  layer you can select, hide or delete: the parts, the road strip, the split, the house, and the screen's
  results. Info shows what you selected and holds the things that had nowhere else to go, such as the facts.
  The panel is a dark, see-through scrim over the map.
- **Built parcels are kept.** A parcel you change becomes a built parcel. It's saved automatically, stays
  on the map, and is listed in History.

## 3. Model

```ts
interface ParcelRecipe {
  /** County parcels and/or drawn areas, combined (13b rules; drawn areas join wherever they touch). */
  parts: ParcelPart[];               // { record: ParcelRecord } | { drawn: Polygon }
  /** A cut through the whole combined boundary, bridged strip included, and the side kept. */
  split?: { a: LatLon; b: LatLon; keep: 1 | -1 };
}
interface BuiltParcel {
  key: string;
  recipe: ParcelRecipe;
  house: LatLon | null;
  notes: string;            // shown in the Notes panel (§4)
  notesAt: string | null;
  /** Layers the user hid (by layer id); results the user removed from the analysis. */
  hidden: string[];
  excluded: string[];
  updatedAt: string;
}
```

- **When a parcel counts as built:** it has more than one part, a drawn part, a split, a house, notes, or
  results. Built parcels are saved automatically to **History**, which absorbs step 16's "Saved parcels".
  Built parcels stay on the map (amber) **forever**, until removed from History.
- **Derived, never stored:** the boundary, the facts and the acres. Editing a part re-derives everything
  after it. A split that no longer cuts the new boundary is dropped, with a note.
- **No undo or redo** (owner): Delete in Layers, Remove in History, and the saved built parcels cover it.
- **Persistence:** localStorage keeps `{ v: 2, open, built[] }`. 13d's v1 record converts. It moves to
  Supabase in Phase 1.
- **The screen** still receives one polygon. *Removed from analysis* (§4) is applied when results are
  ranked and shown. The engine itself doesn't change in 13e.

## 4. Interaction

### Selecting and unselecting

- **Nothing selected, parcel lines visible:** tap an outline to select it. The toolbar appears.
- **Tap the selected parcel again, or empty map,** to unselect it. If a layer is selected, the first tap
  clears that layer and the next one unselects the parcel. A built parcel stays on the map, saved; tap it to
  reopen it.
- **A plain parcel is selected** (straight from a tap, unchanged): tapping another parcel swaps to it.
- **A built parcel is selected:** tapping another parcel doesn't swap. A small, brief note above the
  toolbar says "Tap it again to close it" (owner: "show something but don't be intrusive").
- **Tapping a saved built parcel** (amber) opens it. So does Open in History.

### The toolbar: one line, always

```
Add: [Select] [Draw] │ [Split] [House] │ 🗑   167.18 ac ▾
```

- **Nothing selected:** "Tap a parcel to select it · Draw a parcel".
- **A tool in use:** one line of status plus its controls (Done, Cancel, Fit and so on). Esc cancels; Enter
  finishes.
  - **Add: Select** adds or removes county parcels, so it also uncombines. Parts show amber, and a road gap shows as
    bridged. Parcels too far apart turn the status red, with the distance.
  - **Split:** tap two points, drag the ends while each piece's acres update on the map, then tap the piece
    to keep. The toolbar only says what to do, plus Cancel. The prototype's fit-to-acres controls are dropped
    (owner: dragging is enough). The cut goes across everything.
  - **Add: Draw:** with nothing selected it makes a new parcel. With one selected it **adds** the drawn shape
    as another part, for example a corner that's being sold but has no county parcel. Corners **snap** to the
    parcel's corners and edges (within 14 px), so the shapes join with no sliver. An overlap is counted once
    (the union). The prompt reads "Tap each corner of the shape to add · corners snap to the parcel".
  - **House:** tap to place it.
- **🗑 Delete** (built parcels only) turns the toolbar into an inline confirm: "Delete this parcel? It leaves
  History and the map. [Delete] [Keep]". No modal, and no need to open Layers. A plain parcel has nothing
  to delete; you tap to unselect it.

### Layers + Info (opened by the acres link)

```
LAYERS                                        ×
▾ 👁 52-47A + 52-61                   34.97 ac
   ▾ MADE FROM
        52-47A                        36.77 ac  ×
        52-61                         43.00 ac  ×
        Road strip (not in acres)      0.79 ac
   ▾ Split into 2 pieces                         ×
      ● W piece · kept                34.97 ac
      ○ E piece                       44.80 ac
   👁 Existing house                             ×
▾ 👁 Analysis                                    ×
  ▾ 👁 House sites                           2
       👁 Site #1                                 ×
       👁 Site #2 (removed)                       ×
     …  Shop shelves, Garden patches, Driveway, Horizon, Soil units
───────────────────────────────────────────────
INFO  (the selected layer)
  52-61 · Owner R. & J. Hale · 43.00 ac · county record
  [Take out of this parcel]  [Edit parcels]
```

- **Look:** a dark, slightly see-through scrim, like the toolbar, with blur where the browser supports it.
  Light text, and selected rows tinted amber.
- **Where it sits:** docked on the map's right edge on desktop, and above the toolbar on phones, where the
  sheet drops to its peek height. The basemap button becomes **Map ▾** so it doesn't clash with Layers.
- **Rows:** a disclosure arrow, an eye (hide or show on the map), the name and size, and **×** (delete).
  Clicking a row selects it, highlights it on the map and shows its Info. Delete and Backspace delete the
  selected layer; Esc clears the selection.
- **Selecting on the map:** tapping the house, a site pin, the shelf, the garden or the driveway selects
  its layer and opens the panel. Soil units and the horizon cover the whole parcel, so they're picked from
  the list only.
- **What delete means:**

  | Layer | Delete |
  | --- | --- |
  | a part | takes it out of the parcel (uncombine) |
  | the split group | removes the cut |
  | the house | removes it (owner's request) |
  | an analysis item | **Remove from analysis**: it's struck through, the other sites re-rank without it, and Restore brings it back |
  | the Analysis group | clears the results |

- **A split parcel turns into its result.** Before a split, the parcel's parts are listed directly under
  it. After one, the parcel shows **Made from** (its parts and the road strip) and **Split into 2 pieces**,
  with each piece's acres. The kept piece is marked ●; tapping ○ keeps the other. Selecting the group or a
  piece shows the left-out piece faint and dashed on the map. Info offers **Adjust the line** (back into
  the split tool, with the line where it was) and **Remove split**.
- **Info for the parcel itself:** the facts, then Close and Remove (with an inline confirm). *No notes here*
  (owner); see §7.
- **Info for an analysis item:** its numbers (score, slope, sun, cost, soil), plus Hide and Remove from
  analysis.

### Notes (its own panel)

- **Look and behavior:** the same dark, see-through scrim and header as Layers, with × to close.
- **Where it sits:** on desktop, the map's left, under the search box (Layers is on the right, so both can
  be open). On phones, the same slot above the toolbar as Layers; opening one closes the other, and the
  sheet drops to peek.
- **Opening it:** a small **Notes** button on the map (top left), with an amber dot once the parcel has
  notes.
- **Contents:** the parcel's name, a free-text box, and "Saved …" with the time. Notes save as you type
  (debounced) and belong to the parcel. Typing a note makes a plain parcel built, so it's kept in History.

### Side panel

**Screen it** (step 14) and **History**: every built parcel, newest first, with its acres and when it was
last changed, plus Open and Remove (with a "Remove it? Yes · No" confirm).

## 5. What changes from the prototype (and from 13–13d)

- **Gone:**
  - the "Tap a parcel" mode and button;
  - the no-parcel report and square fallback (replaced by Draw);
  - the panel's tool row, split block and combine block;
  - hover-only split tooltips;
  - the split's fit-to-acres controls (`fitSplit` stays in `lib/geo`, tested, but unused).
- **New:**
  - the one-line toolbar;
  - the Layers + Info panel (select, hide, delete; the split shown as its pieces);
  - the Notes panel;
  - snapping when drawing onto a parcel;
  - built parcels kept forever in History and on the map;
  - Draw adding to a parcel;
  - tap to unselect;
  - Remove from analysis.
- **Unchanged:**
  - the geometry in `lib/geo` (split, combine, draw);
  - the facts strings;
  - parcel lines, basemaps and layers.
- **Later steps this touches:**
  - **Step 14 (results panel):** the report sections stay in the side panel; the step list moves under
    Screen it.
  - **Step 15 (result overlays):** these become analysis layers, so the plan's "click-to-evaluate pins"
    gain Hide and Remove from analysis.
  - **Step 16:** Saved parcels folds into History; Settings is unchanged.
  - **§7b:** the acceptance checklist is rewritten for this flow.
  - **Step 18:** the e2e drives the toolbar and the Layers panel.

## 6. PRs (each one small, with its own preview and "what to click")

1. **13e-1 Model:** `lib/geo/recipe.ts` (derive the boundary and facts from a recipe; drawn parts in
   `combineParcels`), the built-parcel rules, the History store, and the v1 → v2 migration. Pure and fully
   unit-tested.
2. **13e-2 Toolbar and selection:** the one-line toolbar, the tap, swap, lock and unselect rules, the nudge,
   saved parcels on the map, the History list and the search field. Remove the panel's tool row and the
   pick mode.
3. **13e-3 Tools:** + Parcels, Split (on-map labels, tap a piece to keep it), Draw (new or added), House.
4. **13e-4 Layers + Info:** the scrim panel component, the tree, hide and delete, map ↔ list selection,
   Info per layer type, and the split shown as its pieces. Analysis layers arrive with steps 14–15; this PR
   builds the slots for them.
5. **13e-5 Notes:** the Notes panel on the same scrim component, its button and dot, and saving with the
   parcel. It comes right after Layers because it reuses that component (owner: "whenever it makes
   sense").
6. **13e-6 Phone polish:** the sheet dropping to peek while a tool or panel is open, one panel at a time
   above the toolbar, and the one-line toolbar at 390 px (measured 364 px with every button).

## 7. Decisions (owner, 2026-10-05)

1. **With nothing selected,** tapping a visible outline selects it and brings up the toolbar.
2. **A split** cuts across the whole combined boundary.
3. **A changed parcel isn't replaced by a tap on another parcel;** a plain one is. Built parcels are kept.
4. **No undo or redo.** The toolbar is one line; the acres link opens the details.
5. **Draw** is a full tool, new or added.
6. **Marking the house** makes a parcel built.
7. **A tap on another parcel while a built one is open** gives a small, brief note. Not intrusive.
8. **Built parcels stay on the map forever,** removable from History.
9. **A Layers + Info panel** for selecting, hiding and deleting what's on the parcel, and for other info.
10. **Tap to unselect** a selected parcel.
11. **Toolbar grouping:** Add · Draw │ Split · House. "+ Parcels" is renamed **Add**.
12. **Delete a built parcel from the toolbar** without opening Layers.
13. **The Layers panel** is a dark scrim the map shows through.
14. **A split shows as its result** in Layers: Made from, plus the two pieces, kept ● or other ○.
15. **No fit-to-acres** in the split tool. Drag the line, then tap the piece to keep.
16. **Notes don't belong in the Layers panel.**
17. **A separate Notes panel** on the map, looking and behaving like Layers, scheduled where it fits
    (13e-5).
18. **Add: Select · Draw.** "Add:" is a label over Select (county parcels) and Draw (a custom shape, such
    as an unrecorded corner). *Used "Select" for the owner's "selection"; confirm.*
19. **Drawn corners snap** to the selected parcel's corners and edges.

Still to confirm:
- **Should unselecting a built parcel** also close the Layers panel (as in the mockup), or keep it open,
  empty, until you select another?
