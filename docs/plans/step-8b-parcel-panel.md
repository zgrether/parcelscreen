# Step 8b: the parcel panel holds the parcel

Owner's brief (2026-10-20, pre-approved with this plan's recommended answers): parcel management sits in the Layers/Info
panel next to the map's display settings, which doesn't make sense. **The rule: Map layers = how the map looks; the
parcel panel = everything about this parcel.** UI moves and labels only: nothing changes in what lines, marks or listing
facts do, the grade, or report text. Decision 61 (phase-0.md §9; follow-up 61 in the follow-ups table is unrelated).

Mockups: `step-8b-mockup.html` beside this file (#A, #B, #layers), shot at 1280 and 375 on `pr-assets/step-8b`
(`mock-*`), with today's Info panel as `before-*`.

## 0. Inventory: today's Info panel, item by item

The Info panel opens from the toolbar's acres (▾). It has two tabs and a details area with a footer.

| Where today | Item | Goes to | Why |
|---|---|---|---|
| Layers tree | The parcel's row (name, acres, eye) | **Parcel** (header already has it) | It's the parcel itself. |
| Parcel row's details | Added by; Archive… / Restore; Walked, Offered | **Parcel** (Details, top line) | The parcel's standing. |
| Parcel row's details | County facts (owner, parcel ID, County record link); "these parts don't make one boundary" notes | **Parcel** (Boundary) | Facts of this boundary. |
| Parcel row's footer | Close; Remove (with its confirm) | **Parcel** (Remove at Details' end; Close is the header's ×) | Acts on this parcel. |
| Layers tree | Parts (each county record or drawn shape): Take out of this parcel, Edit parcels | **Parcel** (Boundary) | The parcel's pieces. |
| Layers tree | Made from, Road strip (not in acres) and its note | **Parcel** (Boundary) | How the boundary is made. |
| Layers tree | Split into 2 pieces; ● kept / ○ other piece; Adjust the line; Remove split; Keep this piece | **Parcel** (Boundary) | The parcel's split. |
| Layers tree | Existing house (house site): Move it, Remove house | **Parcel** (Lines & marks) | A mark the + Mark picker makes ("House site"). |
| Layers tree | Your lines: name (rename in place), eye, ×; details: length and grades, Use as my driveway, kind, condition, width, Recorded in, note; Edit, Delete (+ Undo) | **Parcel** (Lines & marks) | Things drawn on this parcel. |
| Layers tree | Point and area marks: name, eye, ×; kind, septic class, note; Move it / Redraw, Delete | **Parcel** (Lines & marks) | Things marked on this parcel. |
| Layers tree | Analysis: Surface (House / Garden / Slope / Off); Pins, Horizon fan, Soil units, Trailheads, Driveway (shown/hidden) | **Map** | How the screen's results are drawn. |
| Layers tree | Roads & labels | **Map** (already in the map panel: one copy) | Map display. |
| Layers tree | Terrain preview: 3D terrain and exaggeration, Hillshade, Contours | **Map** (already in the map panel: one copy) | Map display. |
| Notes tab | Listing facts: name, link, listing acres, agent, asking price | **Parcel** (Listing) | The parcel's listing. |
| Notes tab | Notes | **Parcel** (Notes) | The household's notes on it. |
| Keys | Delete / Backspace deletes the selected layer; Esc clears the selection, then closes | **Parcel** (the open row) | They act on parcel items. |
| (new) | One show/hide for your lines and marks | **Map** | How the map looks. |

The map button's panel today holds Basemap; Map layers (Dim map, Parcel lines, Roads & labels, Light pollution); and
Terrain preview. All of it stays.

## 1. The rule, applied

- **Map layers** (the right column's map button): Basemap; On the map (Dim map, Parcel lines, Roads & labels, Light
  pollution, **Your lines and marks**); **Results on the map** (today's Analysis); Terrain preview.
- **The parcel panel** (the docked panel on a desktop, the sheet on a phone): the header (name, star, acres, grade:
  fixed), then the parcel's content.

## 2. The parcel panel's structure: A or B

- **A: two segments under the header, Grade | Details.** Grade is step 7's panel as it is (answer, Best homesite, the
  card, Still unknown, Full report, How Julie would rate it). Details holds a top line (Added by, Archive…, Walked,
  Offered), then **Listing**, **Notes**, **Lines & marks**, **Boundary**, and Remove this parcel at the end.
- **B: one scroll.** The grade content first, then folding sections: Listing ▸, Notes ▸, Lines & marks ▸, Boundary ▸.

**Recommended: A.**
- Step 7's grade content is long (one to five screens on a phone), so under B the parcel's own content sits far below.
  A tap on a line on the map would have to scroll there.
- A keeps both one tap away, and each short.
- An unscreened parcel simply opens on Details.
- It matches step 8's Favorites | History switch: same control, same 44 px segments.
- The cost: reading the grade and the notes together takes one tap. The switch is under the header, so it's always in
  reach.

**Under A:**
- **Which segment opens:** Grade for a graded parcel, Details for one not graded yet.
- **Switching to Details:** selecting a line or mark on the map, Draw a line, + Mark and the toolbar's acres all do.
- **Switching back to Grade:** a finished run does.
- **Not remembered:** the segment isn't kept between parcels; each opens by the rule above.

## 3. Details, section by section

- **The top line:** Added by {name} · Archive… (a favorite's; the archived state shows Restore) · + Walked · + Offered.
  Today's ParcelStanding, unchanged.
- **Listing:** today's listing facts (ListingFacts: name, link, acres, agent, asking price), unchanged, folded to its
  summary as today.
- **Notes:** today's notes box, saved as typed.
- **Lines & marks:**
  - **Section buttons:** **Draw a line** (starts the line tool, as the picker's Track does; its kind is chosen while
    drawing, as today) and **+ Mark** (opens the same Mark picker as the toolbar).
  - **Rows:** one per item: the house site, then lines, then marks, each with its icon, name, a short meta (Easement ·
    1,004 ft; Point; 0.42 ac), an eye (show/hide that one), and ×.
  - **Opening a row:** a tap opens it in place with today's details and actions: rename, kind, condition, width,
    Recorded in, note, Use as my driveway; Edit on the map, Move it or Redraw; Delete with Undo.
  - **Empty:** "Nothing drawn yet. Draw a line or add a mark, here or from the toolbar."
- **Boundary:**
  - **Facts:** the county facts (owner, parcel ID, County record), and each part when there are several (Take out of
    this parcel).
  - **Road strip and split:** the road strip's note; the split's pieces (● kept / ○ the other, Keep this piece), Adjust
    the line, Remove split.
  - **Buttons:** **Edit parcels** and **Split**, the same tools as the toolbar's Boundary ▾.
  - **Notes:** the "don't make one boundary" and "split no longer crosses" notes.
- **Remove this parcel…** at the end, with today's inline confirm (the toolbar's trash stays).

**Selection:**
- **On the map:** a line or mark tapped on the map (or a row selected) opens Details at that row, open, scrolled into
  view.
  - On a desktop, a collapsed panel opens.
  - On a phone, a sheet at its peek rises to half.
- **Keys:** Delete or Backspace deletes the open row's item. Esc closes the row; a second Esc is the map's own (it
  closes the parcel, as today).

## 4. Map layers: the Info panel merges into the map button's panel (recommended)

- **The two options:** keep the Info panel as "Map layers" beside the map button's panel, or merge the two.
- **Recommended: merge.** Two panels about the map would duplicate Roads & labels and Terrain, as today, and the Info
  panel's only reason to exist (the parcel's tree) is gone.
- **The merged panel:** titled **Map layers**, its groups as §1. It gains Results on the map (shown once a run is on
  screen, as today's Analysis) and Your lines and marks.
- **The toolbar's acres** (`29.31 ac ▾`) opens the parcel panel on Details at Boundary instead of the Info panel; its
  label becomes "{acres} acres: parcel details".
- **Your lines and marks** is a new map setting, on by default, stored with the other map layers. It hides every line,
  mark and the house site on the map; the per-row eyes still work within it. The panel says "{n} hidden on the map"
  in Lines & marks when it's off.

## 5. On a phone

- **The sheet:** the same content: the header, the Grade | Details switch (full width, 44 px), then the segment's
  content. Selecting a line or mark raises the sheet to half and opens its row.
- **Map layers:** opens from the same map button, as today.
- **The toolbar:** unchanged; its acres opens the sheet on Details.

## 6. What doesn't change

- Lines, marks, the house, listing facts, notes, archive and milestones work and save as today; so do the split,
  combine and draw tools and their toolbar.
- The grade, the card and the report text don't change. No `expected.json`, schema or stored-shape change. The one new
  stored value is the map setting "Your lines and marks" (a map pref with a default: older prefs read as on).
- Step 6's household section stays at the end of Grade. Step 8's star stays in the header.

## 7. Process

- **PR 0:** this plan.
- **PRs 1–3:** §14.
- **Screenshots:** before and after.
- **Then:** the fresh-eyes review, its leftovers in `docs/plans/polish.md`, and the hand-back.

## 8. Text (new or moved UI strings only)

- **The switch:** "Grade", "Details".
- **Sections:** "Listing", "Notes", "Lines & marks", "Boundary"; "Draw a line", "+ Mark", "Edit parcels", "Split",
  "Edit on the map", "Remove this parcel…".
- **Empty Lines & marks:** "Nothing drawn yet. Draw a line or add a mark, here or from the toolbar."
- **When Your lines and marks is off:** "{n} hidden on the map. Show them in Map layers."
- **Map layers:** the title "Map layers" (was "Map"); the groups "On the map" (was "Map layers"), "Results on the map"
  (was "Analysis"); the toggle "Your lines and marks".
- **The toolbar's acres:** "{acres} acres: parcel details" (was "… parcel info").
- **Gone:** the Info panel's "Layers" and "Notes" tabs, "Close the Info panel", "Parcel info".

## 9. UX

- **The main flows, in the fewest steps:**
  - **Edit a line:** tap it on the map → its row is open in Details → change the name or condition.
  - **Add a mark:** Details → + Mark → pick → place.
  - **Listing and notes:** Details → type.
  - **Change the map:** the map button → toggle.
- **What you see first:** the answer (Grade) for a graded parcel, Details for one not graded; within Details, the
  sections in the order people use them (listing, notes, lines, boundary).
- **States:**
  - **empty:** Lines & marks' line;
  - **not graded:** opens on Details; the Grade segment shows today's ungraded state (the grade button above it);
  - **loading:** as today;
  - **errors:** a refused delete or combine shows its message in the row or section, as today's details area did.
- **Plain labels:** Details, Lines & marks, Boundary, Map layers, Results on the map, Your lines and marks.
- **Phone at 375 px:**
  - the switch is full width with 44 px segments;
  - rows are at least 44 px, with 44 px eye and × targets;
  - an open row's fields are full width.
- **Contrast and consistency:**
  - the parcel panel's light style, not the Info panel's dark scrim;
  - the switch reuses step 8's;
  - rows reuse the list's row and chip styles;
  - AA contrast throughout.

## 10. Screenshots and the fresh-eyes review

At 1280 and 375:
- before: today's Info panel (Layers, a line's details, Notes);
- after: the parcel panel's Details with lines and marks, a line open and being edited from the panel, Map layers, the
  phone sheet.

They go on `pr-assets/step-8b`. Then the fresh-eyes subagent gets only the after shots and the question. Every finding
goes in the hand-back, and the leftovers go in polish.md.

## 11. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **A or B?** A (§2).
2. **The Info panel: "Map layers" alone, or merged?** Merged into the map button's panel (§4).
3. **Per-item eyes:** kept on each row, inside the one map-wide toggle.
4. **Archive and milestones:** Details' top line, not a section of their own.
5. **The existing house:** in Lines & marks (the picker makes it as "House site").
6. **Which segment opens:** Grade if graded, else Details; selection and tools switch to Details; a finished run to
   Grade. Not remembered.
7. **The toolbar's acres:** opens Details at Boundary.
8. **Draw a line:** starts the line tool as Track (its kind is picked while drawing, as today).
9. **Remove:** at Details' end, and the toolbar's trash, both as today.
10. **Rename in place** (double-click, long press) gives way to the open row's Name box, which is always shown.
11. **The list's parcel detail** (Your list → a favorite) is unchanged: it already shows listing and notes, and has no
    map.

## 12. Stop conditions

Push what's there, say why, and wait if:
- a change would alter report or verdict text, or `expected.json`;
- a product decision beyond §11 is needed;
- the same CI failure survives 3 attempts;
- the plan turns out wrong.

## 13. The test plan (outline; the hand-back has the full one)

On the preview, with Mud Creek and its red-gate line:
- edit the line's name and condition from Details;
- add a mark from Details' + Mark;
- edit listing facts and notes;
- tap the line on the map: Details opens at its row;
- confirm Map layers holds only map settings, and Your lines and marks hides them all;
- the same on the phone.

## 14. PRs (into `step/8b-parcel-panel`)

1. **The parcel panel's Details:**
   - **New:** the Grade | Details switch; the Listing, Notes, Lines & marks and Boundary sections. They are
     components moved out of InfoPanel (LineDetails, MarkDetails, the boundary rows) into `components/Parcel/`.
   - **Selection:** opening a row from the map, with the keys.
   - **The Info panel:** loses what moved, keeping only map settings.
2. **Map layers:**
   - The Info panel merged into the map button's panel, with Results on the map and the Your lines and marks setting.
   - The toolbar's acres opens Details.
   - Info's code and prefs (`ps.infoTab`) go; e2e that used the Info panel move to Details.
3. **Screenshots, the fresh-eyes review, docs** (phase-0.md decision 61, REQUIREMENTS, PLAN row 8b, polish.md), and
   the hand-back.

## 15. Decision 61 (phase-0.md §9; to record in PR 3)

The parcel panel holds the parcel, and Map layers holds how the map looks. The Info panel goes:
- its parcel content moves to Details (a Grade | Details switch under the panel's header);
- its map content merges into the map button's Map layers.

One new map setting: Your lines and marks.
