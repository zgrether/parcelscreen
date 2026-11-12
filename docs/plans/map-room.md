# Room for the map (phone first)

Zach's brief (2026-11-12): on a phone with a graded parcel open, the map is mostly covered. His screenshot of 010-A-10
at about 390 × 844 shows these stacked over it:
- the top toolbar;
- a soil tooltip that stays open;
- the house-score legend;
- the full overlay key;
- the drawing toolbar;
- the grade sheet's peek;
- the bottom nav.

The only way to see the map is ×, which also clears the parcel and its layers.

**How it runs:** a mission on `step/map-room`, branched from main after the existing-house hand-back (#425). I merge
each PR into it when CI is green on its head. The step ends with one PR from `step/map-room` to main, which Zach merges.
Verification is proportionate: one Playwright measurement at 390 × 844, before and after, and the screenshots.

## 0. What's there (found while planning)

**The sheet** (`components/Explore/useBottomSheet.ts`):
- It has three snaps: the peek (92 px; 148 with the grade button; 152 with the answer's reason), 46% and 88%.
- Below 110 px it is in "map mode", its content hidden.
- A tap on the handle or the header cycles upward (peek → 46% → 88% → peek).
- It opens at the peek on every load (owner, after 14d). After a grade it rises to 46% (`raise`).
- **That rise is most of the problem:** after grading, the map keeps about half the screen.

**The key line** (`components/Map/MapKeyLine.tsx`):
- It shows under the map while a graded parcel is open. It names every mark and overlay that's on, then "All map marks".
- On a phone it wraps to two or three lines over the sheet.

**The house-score legend** (`components/Map/results/SurfaceLegend.tsx`) is a vertical ramp in the right-hand column. On
a phone it sits at the left edge above the key line. It shows while a surface (House, Garden, Slope, Wetness) is on.

**The parcel toolbar** (`components/Map/Toolbar.tsx`):
- With a parcel open: Boundary ▾ · + Mark · 🗑 · acres ▾.
- On a desktop it also holds the grade button.
- With nothing open it is the hint ("Tap a parcel… or Draw").

**Tapped tips** (`components/Map/results/ResultTips.tsx`): on a touch screen, a tapped tip (a soil unit, a line, a dot)
"stays until the next tap". Nothing else closes it.

**A tap on the map** (`exploreState.decideTap`): another parcel switches. The open parcel itself, or empty map, does
nothing; the ×, Esc or another parcel closes it.

**The tab bar** already steps aside while a map tool is open (`html.map-tool`).

**Zach's screenshot** (010-A-10, posted with the brief; the page is about 390 × 784 CSS px below the status bar). It is
**about 51% covered**, so the map shows on half the screen:

| What | Share of the page |
|---|---|
| The sheet, at its answered peek (name, acres, "Maybe", "B, held by…", the reason) | 18% |
| The key line (four lines: marks, overlays, Places, All map marks) | 13% |
| The tab bar | 7% |
| The soil tip ("Lily loam, 25 to 65 percent slopes…"), pinned at the top | 3.5% |
| The six top buttons (search, map, compass, 3D, House, locate) | 3.4% |
| The parcel toolbar | 3.3% |
| The House legend | 2% |

The plan's default state would leave the sheet's line (about 7%), the tab bar (7%), the top buttons (3.4%), the Key chip
and ✎ Edit (about 1.5%): **about 81% map**. Full-map mode would leave the line and the restore button: **about 93%**.
These are estimates from the screenshot. PR 1 measures the real figures.

## 1. The sheet: collapse is not close

**A fourth snap, the line:** one slim row, about 52 px including the handle:
- the parcel's ID (its tax map or name, ellipsised);
- the verdict chip and the letter;
- the acres.

Ungraded, it holds the ID, the acres and a small **Grade** button. While a grade runs, it holds the ID and the progress
bar's step text.

**Collapsing:**
- **Swipe down** from the peek, or from any height past the peek's threshold, settles on the line.
- **A tap on the handle** collapses the sheet to the line from any height.
- **A tap on the line** (anywhere but its × or Grade) opens it to the height it last had above the line, the peek if none.
- Dragging still moves between all four snaps.
- Header taps no longer cycle: the handle and drags do the resizing, which is plainer.

**Collapsing clears nothing:** the selection, the grade, the layers, the marks and the map's camera all stay. **×** still
closes the parcel and clears it, as today.

**Remembered for the session** (`sessionStorage`, `ps.sheet`: `line`, `peek`, `mid` or `top`):
- The sheet opens a parcel, and comes back after a reload, at the state the person last chose.
- A fresh session starts at the line.
- Only the person's own drags and taps set it. The app's raises (a line or mark selected opens its row, the acres open
  Details, Steps ▸) move the sheet but don't overwrite it.
- Landscape and desktop keep the docked panel as it is.

**After a grade:** the sheet no longer rises to 46%. It goes to the remembered state, which in a fresh session is the
line. The verdict and letter are on it, and one tap opens the card. This is what makes the 75% target possible: the
answered peek alone (152 px), with the tab bar and the top buttons, leaves under 75%. **Q1** below asks Zach to confirm
this.

## 2. The overlay key: a "Key" chip

- **Collapsed by default to a small "Key" chip** at the map's bottom left, just above the sheet. On a phone it is 44 px
  tall for the tap target; on a desktop it is smaller.
- **Expanded:** a tap opens the panel as today: the marks, the overlays and All map marks, plus a "Hide" control.
- **It collapses again by itself** when the map is panned, zoomed, rotated or tilted by the person (MapLibre's
  `movestart` with an `originalEvent`; the app's own camera moves don't count), and when a tool starts.
- **Phone:** the house-score legend folds into the Key. The column no longer shows the ramp; the expanded Key shows it
  under the overlays as a short horizontal bar (low → high, with its swatches), the same colours from
  `lib/render/surface.ts`.
- **Desktop:** the key is collapsed by default too, and the legend stays in the right-hand column as it is.
- **What the Key remembers:** expanded or collapsed is not remembered. Each parcel opens with it collapsed.

## 3. The drawing toolbar only while editing

- **A parcel open and no tool in use:** the toolbar is one **✎ Edit** button. On a phone it is 44 × 44 at the bottom
  right, above the sheet. On a desktop it is a small button where the toolbar was, beside the grade button, which stays
  in the desktop toolbar.
- **Edit opens the toolbar as today** (Boundary ▾ · + Mark · 🗑 · acres ▾) with a **Done** at its end. It stays open
  while the person edits (tools run and finish as now), until Done, the ×, or another parcel.
- **The acres move to the sheet's line on a phone.** The toolbar's acres button (Details at Boundary) stays inside the
  editing toolbar. The desktop header already shows the acres.
- **Unchanged:** with nothing open, the toolbar is the hint and Draw as today. Long-press (or right-click) to open the
  Mark picker still works without Edit.

## 4. Tips close themselves

A tapped tip (the soil unit, a line, a dot) now closes on any of these:
- a tap elsewhere on the map (as now);
- the map being panned or zoomed;
- after **5 s**;
- a tool starting.

Hover tips on a desktop already follow the pointer; they now close on pan or zoom too. No tip is left pinned.

## 5. Full-map mode

- **A tap that does nothing today**, inside the open parcel off any feature or on empty map (`decideTap` → none, no
  layer selected, no tip, mark or line under it), **hides the floating controls**: Search, the top buttons, the Key
  chip, Edit, toasts and the tab bar (`html.map-tool`'s rule, reused).
- **What stays:** the sheet's line, and one small **restore** button (⤢, 44 × 44, top right).
- **Unchanged:** the parcel, its layers and the selection.
- **It ends** with a tap on restore, another such empty tap, a tool starting, or the parcel closing.
- **Double-tap zoom:** the hide waits for the double-tap window (`doubleTap.ts`) so a double-tap zooms without
  flickering the controls.
- **Desktop:** off. The docked panel and the column are the desktop's layout, which this step doesn't redesign.

## 6. Desktop: the same principles where they apply

The key is a chip by default, tips close on pan or zoom, and the drawing toolbar is ✎ Edit until editing. No full-map
mode, no sheet changes, no layout redesign.

## 7. Measurement and acceptance

**The measure** (`screenshots/map-room.spec.ts`, through `screenshots/fixtures.ts`, so owner fields are hidden):
- A phone viewport of 390 × 844, `isMobile`.
- A graded fixture parcel opened from its saved grade (Macks Mountain 35-3, offline from its recording; it has the
  driveway, rays, soils, trailheads and boulders on).
- The share of a 10 px grid of points where `document.elementFromPoint` is the map: its canvas, or a marker the map
  draws (pins, Stand here, hour labels). A tooltip, a button, the sheet or the tab bar counts as covering.
- Reported to the job log and written into the hand-back, with before and after screenshots.

| State | Target |
|---|---|
| Default after grading (the line; the Key collapsed; ✎ Edit) | **≥ 75% map** |
| Full-map mode | **≥ 90% map** |

**Also checked by the spec:**
- Collapse → pan → expand keeps the selection, the grade (the card's letter) and the layers (the key's entries).
- × clears the parcel.

**"Before"** is the same spec run on the step branch's base (main) in PR 1, before any change.

## 8. Text

New UI words only. No grade, verdict, flag or report text changes, and no fixture's numbers.
- "Key", "Hide".
- "Edit", "Done".
- The restore button's name: "Show the map's controls".
- The line's Grade button reuses the grade button's words.

**Numbers change:** none. No `expected.json` moves, and `pnpm diff:prototype` is unchanged.

## 9. The work, by PR

| PR | What |
|---|---|
| 0 | This plan |
| 1 | The measurement spec, and the "before" figures and screenshots on main's layout |
| 2 | The sheet: the line, collapse not close, the session memory, and no rise after a grade (§1) |
| 3 | The Key chip, with the legend folded on a phone, and tips that close themselves (§2, §4) |
| 4 | ✎ Edit: the toolbar only while editing; the acres on the line (§3) |
| 5 | Full-map mode (§5) |
| 6 | The hand-back: "after" measurements and screenshots, the fresh-eyes review, phase-0 §9.82, `ux-audit.md` and polish.md |

Existing e2e flows that tap the toolbar's Boundary or + Mark, or that expect the sheet's rise after a grade, change
with PRs 2 and 4. That includes the existing-house deployed spec, and the shared helpers in `e2e/flow.ts` take an "open
Edit" step.

## 10. Stop conditions

- A change would alter `expected.json` or any grade, verdict or flag text (none is planned).
- A product decision the plan doesn't cover comes up (for example, if hiding the tab bar in full-map mode breaks
  navigation in a way §5 doesn't answer).
- The same CI failure survives 3 attempts.
- The measurement can't reach 75% in the default state without something this plan doesn't list. I'd stop and report
  the figures with the options.

## 11. Tests

- **Unit:**
  - the sheet's state machine (snaps, collapse, the memory, app raises not saved), pulled out of `useBottomSheet` as a
    pure reducer;
  - the Key's collapse on a person's camera move and not the app's;
  - the tip's timer and its closes;
  - full-map's trigger (only `decideTap`'s none, after the double-tap window).
- **e2e:** the flows updated for Edit and the line. One new flow: collapse → pan → expand keeps the parcel; × clears it.
- **Screenshots:** the measurement spec (PR 1 before, PR 6 after) at 390 × 844 and 375 × 812, plus the desktop at
  1280 × 800 for the Key chip and Edit.

## 12. UX

- **The main task flow:** grade a parcel → see the verdict on the line over a mostly open map → tap the line for the
  card → swipe down to look at the map again, nothing lost.
- **What the user sees first:** the answer on the line (verdict, letter), then the card on a tap. The key, the legend
  and the edit tools are one tap away, not on top of the map.
- **States:**
  - **Empty:** no parcel; the toolbar's hint as today.
  - **Loading:** the line shows the progress text.
  - **Error:** the line shows "Try again" in the grade button's place.
  - **Slow:** as loading.
- **Plain labels:** "Key", "Edit", "Done", and the restore button named in words for screen readers.
- **The phone at 375 px:** the line fits ID, chip, letter and acres. A long ID ellipsises first; the chip and the letter
  never wrap. Every new control is at least 44 × 44.
- **Contrast and consistency:**
  - The chip and buttons use the map controls' existing style (`.map-ctl-btn`).
  - The line uses the header's verdict chip and letter components, so the colours and contrast are the ones the card
    already passes.

## 13. Resolves (to check against `docs/design/ux-audit.md` and polish.md in PR 6)

- **The audit's B-7**, the phone overlaps: the toolbar over the map buttons, and Stand here cut off. The toolbar is
  gone until Edit, and the column is clear.
- **Z-9's "the sheet's header is cluttered", in part:** the line is the slim state.
- **polish.md:**
  - "The phone's tall sheet: the map's floating buttons sit over the Stand here pin";
  - the existing-house fresh-eyes items 9 and 10: the "Zoom in…" toast over the pin, and the House colour key cut off
    at the edge, which now folds into the Key;
  - step 15's "the map labels under the phone's buttons".

## 14. Questions for Zach

1. **After a grade, the sheet goes to the line** (fresh session), with the verdict and letter on it and the card one tap
   up. The answered peek (152 px) can't meet 75% with the tab bar and the top buttons. The alternative is a slimmer peek
   of about 110 px (the line plus one line of the reason), which measures near 75% and could miss it. *Recommended: the
   line.*
2. **Full-map's trigger is a tap that today does nothing** (inside the open parcel off any feature, or empty map). A tap
   on another parcel still switches to it. The tab bar hides in full-map too, needed for 90%. *Recommended: as
   written.*
3. **Header taps stop cycling the sheet's heights;** the handle collapses, the line expands, and drags resize.
   *Recommended: as written.*

## 15. Zach's answers (#427, 2026-11-12)

1. **After a grade the sheet drops to the line:** yes. The line's verdict and grade are what matters at a glance, and
   the full grade is one tap up.
2. **Full-map mode on a tap that does nothing today:** yes, with three rules.
   - A tap that closes something (a tooltip, the expanded Key, a popup) only closes it. It doesn't also enter
     full-map mode.
   - Another tap on empty map restores the controls (a toggle), as well as the restore button.
   - Never while Edit or any tool is active.
3. **Header taps stop cycling heights:** yes.
   - The handle's touch target is at least 44 px.
   - The sheet gets collapse and expand actions that work with the keyboard and screen readers, with labels:
     buttons named "Collapse the sheet" and "Expand the sheet". The handle becomes a real, focusable button, no longer
     `aria-hidden`.
4. **The acres on the line** (Zach's addition):
   - With a recorded survey (the listing fact; 010-A-10's is 93.97 ac), show the surveyed acres.
   - Otherwise show the GIS acres, labelled as the report labels them.

   The line reuses the report's own acreage words, so the two can't drift.
