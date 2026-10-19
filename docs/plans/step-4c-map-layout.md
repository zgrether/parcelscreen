# Step 4c: Map layout, desktop and phone

A short step after 4b (owner, 10/19). Written 2026-10-19 under mission mode (`CLAUDE.md`). **Waiting for approval: no
code until then.** The mission runs on `step/4c-map-layout`, branched from main once this plan is approved **and**
step 4b's hand-back (#191) is on main: this step reworks 4b's frame.

**The problem (Zach):** on a desktop the map's left side feels unbalanced. The search button floats alone above a card
of a different width, while the right side is a tidy column. The parcel's run button sits in the panel's header as a
permanent "Run again", and a finished run's step log stays long.

Done when:
- **Desktop:** one docked left panel, full height under the top bar, about 380 px wide, with no floating gap. Its first
  row is the search box, so search and the parcel's results are one object with one left edge. With no parcel open it's
  only that row. It collapses to a slim tab and back.
- **The main action is in the bottom toolbar,** named "Grade this parcel". After a run it shows only when there's a reason
  to run again, and says the reason. The finished step log is one line that opens the list.
- **Phone:** the same button rules and the same one-line log, in the bottom sheet.
- **Nothing in the report's content changes,** and nor do the right-hand column, the tab bar or the menu.

## 0. What's there today (4b, found while planning)

- **Desktop** (`components/Explore/ExploreShell.tsx`):
  - The results **float** at the map's top left, 10 px in, below the Search button (`.search-btn`, top 10 px). With no
    parcel open: a 340 px card reading "Tap a parcel to begin". With a run: a 420 px full-height panel (`--float-w`), or
    the card again when folded (the chevron, `sh-fold`).
  - The **toolbar** and the hint are centred along the map's bottom, offset only by the expanded panel (`--float-l`), not
    by the right-hand column.
- **The attribution** is MapLibre's compact control at the top right: open on a desktop (the long pill across the top),
  folded to ⓘ on a phone (`startFolded`, `components/Map/MapView.tsx`).
- **The header** (`ScreenHeader`, `components/Results/panel/ScreenIt.tsx`):
  - the name truncated to one line, then "· 29.31 ac", the grade badge and verdict;
  - a button reading "Screen it", "Running…" or "Run again", always present;
  - Cancel while running, the fold chevron (desktop) and ×.
- **The step log** (`StepList`):
  - The full list while a run is in progress, and after a run with a failed step.
  - A run with every step done folds to one button, "Screened ✓".
  - The per-step times are in debug mode only. The page doesn't keep the run's total time.
- **Why a run is out of date** (`lib/client/screenKeys.ts` `freshness`): boundary, house, settings or lines changed since
  the kept run. A house change with a live session is re-assessed on its own, with no run. A kept result lists the steps
  that failed (`result.failed`), so "N sources didn't load" needs no new field.
- **Phone:** the sheet's header is the same `ScreenHeader` (its peek, 92 px). Search is a floating button at the map's top
  left. The toolbar (Boundary ▾, + Mark, 🗑, acres) floats 18 px above the sheet and is about 266 px wide at 375 px.

## 1. Desktop: one docked panel

- **Docked, full height, one width.** The panel sits flush at the left edge from the top bar's bottom edge to the window's
  bottom: 380 px wide (48% of the window on a phone on its side, as today), with a right border and no gap or rounding.
  It replaces both the floating card and the floating panel.
- **Search is its first row:** the search field across the panel's width (the same `Search` component, no longer a
  separate floating button). Its results drop below it inside the panel, at the panel's width. Search and the parcel's
  results share one left edge.
- **Empty state:** with no parcel open, the panel is only the search row (52 px). There's no "Tap a parcel to begin"
  card: the bottom hint already says "Tap a parcel to select it, or Draw a custom parcel".
- **Collapse:** a chevron tab on the panel's right edge (‹) collapses it to a **slim tab** at the top left, under the top
  bar: the grade badge (when there's one) and the parcel's name, truncated, then ›. A click on the tab reopens it. The
  state is remembered for the session (`sessionStorage`, §11 Q6); a new parcel doesn't reopen a collapsed panel. With no
  parcel open there's nothing to collapse, and the tab doesn't show. The old fold (panel ↔ card) goes.
- **The map's padding** follows the panel's width, collapsed or not, so fits and fly-tos land in the visible part. As
  today, the view doesn't jump when the panel opens or collapses.
- **The toolbar and the hint centre on the visible map:** between the panel's right edge (or the slim tab's) and the
  right-hand column's left edge, not the window.
- **The attribution** is MapLibre's compact ⓘ in the **bottom-right** corner on every screen, folded until it's tapped
  (as the phone does today), instead of the open pill at the top.

## 2. The header and the main action (desktop and phone)

- **The name wraps** to two lines instead of truncating (`LongName` stays for longer names: three lines and more are
  clipped with the full name on hover and long-press, as on Your list). Acres and the grade badge sit on the second line.
- **"Grade this parcel"** is the run button. It moves out of the header into the bottom toolbar on a desktop:
  Boundary ▾ · + Mark · **Grade this parcel** · 🗑 · acres. On a phone it sits under the sheet's header (§3).
- **After a run it shows only with a reason,** which it names:
  - "Grade again: boundary changed"
  - "Grade again: house moved" (only with no live session to re-assess it; with one, nothing shows)
  - "Grade again: lines changed"
  - "Grade again: settings changed"
  - "Try again: 3 sources didn't load" ("1 source" for one; the count is the kept run's failed steps)
  - With several reasons, the first in that order. With none, there's no button.
- **While it runs:** "Grading…" (disabled), with Cancel beside it.
- **The header's permanent "Run again" goes.** So does the error line's "Run again", which becomes the toolbar's
  "Try again" (the re-screen-on-open failure keeps its message in the header).
- **The step log collapses after a run** into one line that opens the list:
  - "Graded in 66 s ▸", or "Graded in 66 s · 3 sources didn't load ▸".
  - The time is the run's, measured by the page; a kept run opened later shows no line, as today.
  - While a run is in progress the live list shows as it does today, and so does a run's list once opened.
- **The notes that say "Run again"** say "Grade again" (§10's list).

## 3. Phone

- **The same button and rules** (§2), under the sheet's header: one full-width button, shown only before the first run, with
  a reason after one, or while running (with Cancel). The phone's toolbar has no room for it at 375 px.
- **The same one-line log** below it. The header's "Run again" goes from the peek too, so the peek holds the name (two
  lines) and the acres and grade.
- **Search:** two options, both mocked up (§5). **Recommended: B, Search stays** where it is, at the map's top left.
  - **A, Search in the sheet's top row:** it frees the map's corner. But the row gets tight beside a two-line name, and
    Search goes away whenever the sheet does (no parcel open).
  - **B, Search stays:** the corner it has today, with no parcel open too. The sheet's row keeps its width for the name.

## 4. Out of scope

The right-hand column's controls, the tab bar and the menu, and anything in the report's content. That includes the
card's own "(…didn't load, run again)" reasons, the card panels' "run again to see…" lines, and the map panel's "run
again to show". Those keep "run again" (§11 Q8).

## 5. Mockups (before → after)

The befores are the app at 4b; the afters are drawn over the same map, with Mud Creek graded (its recording lacks FEMA,
PAD-US and OSRM, so 3 sources didn't load).

**Desktop, 1280 × 800**

| Before | After |
| --- | --- |
| ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/before-d-empty.png?raw=true) | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/after-d-empty.png?raw=true) |
| ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/before-d-screened.png?raw=true) | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/after-d-screened.png?raw=true) |
| | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/after-d-collapsed.png?raw=true) |

The toolbar's button by state:

![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/after-d-states.png?raw=true)

**Phone, 375 × 667**

| Before | After, A (Search in the sheet) | After, B (Search stays; recommended) |
| --- | --- | --- |
| ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/before-p-screened.png?raw=true) | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/after-p-a.png?raw=true) | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step-4c/after-p-b.png?raw=true) |

## 6. UX

- **The main flow, in the fewest steps:**
  - find a parcel: the search row is where the eye starts;
  - grade it: one button where the parcel's tools are;
  - read it: the grade and its reason come first;
  - grade again: only when the app says why.
- **What you see first:** the parcel's name, its grade and verdict, then the card. The log is one line, with detail on
  demand.
- **States:**
  - **Empty:** the search row alone on a desktop; the phone's sheet stays hidden, as today.
  - **Loading:** "Grading…" and the live log.
  - **Slow:** the live log names the step that's running, as today.
  - **Error:** "Try again: N sources didn't load", or the error line for a stopped run.
  - **Offline:** the re-screen note, as today; the button waits.
- **Plain labels:** "Grade this parcel", "Grade again: <what changed>", "Try again: N sources didn't load", "Graded in
  66 s". The app grades; "screen" stays in the code.
- **Phone at 375 px:** the button is full width and at least 44 px tall. The two-line name fits the 92 px peek (handle
  16 px, two lines of 22 px, one of 20 px). Nothing scrolls sideways. The no-overlap check (4b's `places.spec.ts`) still
  passes at the peek and at 46%.
- **Keyboard and screen readers:**
  - the panel's chevron and the slim tab are buttons with `aria-expanded`, and the panel keeps its landmark;
  - the toolbar's button names its reason in its accessible name too;
  - Esc on a desktop still closes the open parcel.
- **Contrast and consistency:** the button is the toolbar's amber "go" style, the panel is the paper surface with the
  rule line, and the one-line log is the report's muted note style.

## 7. Numbers

No change: no `config.ts`, expected.json, engine or schema change.

## 8. Text that may change (the declaration)

UI text only: no report or card text (rule 7 doesn't apply).

| Where | Before | After |
| --- | --- | --- |
| Run button, first run | Screen it | Grade this parcel |
| Run button, running | Running… | Grading… |
| Run button, after a run | Run again (always) | none, or one of: Grade again: boundary changed · Grade again: house moved · Grade again: lines changed · Grade again: settings changed · Try again: N sources didn't load (1 source) |
| Desktop card, no parcel | Tap a parcel to begin | (gone) |
| Folded step log | Screened ✓ | Graded in 66 s ▸ · Graded in 66 s · N sources didn't load ▸ |
| Folded card's line, stale | These results are for an earlier boundary. Run again. | These results are for an earlier boundary. Grade again. |
| Notice, stale | These results are for an earlier boundary. Run again. | These results are for an earlier boundary. Grade again. |
| Notice, house | The house changed since this run — run again to assess it. | The house changed since this run — grade again to assess it. |
| Notice, overlays | Run again to restore the map overlays and horizon fan. | Grade again to restore the map overlays and horizon fan. |
| Error line's button | Run again | (gone: the toolbar's Try again) |
| Folded card, running | Screening… | Grading… |
| Map hint below z14 (owner, 10/19, with the zoom slider's removal) | "Zoom in to see parcel lines" from z12.5 to z14 only | the same words at every zoom below 14, unless another hint holds the bar |

**Unchanged:** Cancel, Copy summary, "Let the app consider it" (the lines banner's action), the re-screen notes, and
everything in §4.

## 9. Stop conditions (push what's there, say why, wait)

- A change would alter expected.json, a grade, a verdict or report text.
- 4b's no-overlap check at 375 × 667 can't pass with the two-line name in the 92 px peek without changing the snaps (a
  product decision).
- The same CI failure survives three attempts.
- The plan turns out wrong.

## 10. The PRs, into `step/4c-map-layout`

| PR | What | Checks |
| --- | --- | --- |
| 1 | **The desktop panel:** docked and full height, the search row first, the empty state, the collapse tab (remembered for the session), the map's padding, the toolbar and hint centred on the visible map, and the attribution's ⓘ at the bottom right on every screen. | e2e at 1280: the panel's box (left 0, top 44 px, 380 px wide, to the bottom); no parcel: only the search row; collapse and reopen, kept across a reload in the same tab; the toolbar's centre within 2 px of the visible map's; the ⓘ in the bottom-right corner, folded. |
| 2 | **The main action:** the two-line header, "Grade this parcel" in the toolbar (under the sheet's header on a phone), its reasons, no "Run again" in the header, the one-line log, and §8's notices. | unit: the button's reason from freshness, the failed count and running (pure, `lib/client/gradeButton.ts`). e2e: each reason (move the boundary, the house without a session, a line, a setting), Mud Creek's "Try again: 3 sources didn't load", the log line and its ▸, and the phone's peek with the two-line name. The e2e helpers (`screenIt`) follow the new labels. |
| 3 | **The screenshots, the fresh-eyes review and the hand-back:** each changed screen at 1280 and 375; the review's two questions (CLAUDE.md); §9.56. | Full CI on the step branch's head. |

## 11. Questions for Zach

1. **The phone's button:** under the sheet's header, full width (recommended: the toolbar has no room at 375 px)? Or in
   the toolbar, with the acres moved out?
2. **The phone's Search:** B, it stays at the map's top left (recommended)? Or A, in the sheet's top row?
3. **While it runs:** "Grading…" with Cancel beside it (recommended), or keep "Running…"?
4. **"N sources didn't load":** count the steps that failed (`result.failed`: flood, PAD-US, routing), and not the
   sources that didn't answer without failing their step, such as the wider public-land search (recommended: those are
   noted in the report already)?
5. **Overlays after a reload:** a kept run opened later has its grade but not its map overlays until it's graded again.
   Show no button for that (recommended: the note "Grade again to restore the map overlays and horizon fan" stays in
   the panel), or a sixth reason, "Grade again: restore the overlays"?
6. **The collapsed state:** remembered for the tab's session (`sessionStorage`, recommended, as you said), so a new
   window starts open?
7. **The slim tab:** at the top left under the top bar, the grade badge and the name (recommended, mocked up)? Or a narrow
   vertical strip down the window's left edge?
8. **"run again" in the report's own lines** (the card's "didn't load, run again", the card panels' and map panel's
   notes): left as they are here (recommended: report text is out of scope), and reworded in a later plan?

## 12. Test plan outline

**e2e (CI):** PR 1's and PR 2's checks; 4b's tabs, places and map-kept specs still pass.

**Screenshots (the hand-back), at 1280 and 375:**
- the map with no parcel;
- Mud Creek graded;
- the panel collapsed;
- the toolbar's button with a reason;
- a run in progress;
- the log opened;
- the phone's sheet at its peek and at 46%.

**Fresh-eyes review (CLAUDE.md):** the screenshots only, with "You've never used this app. What is this page for, and
what's confusing?".

**Manual, on the preview (about 15 minutes, desktop then phone), with Mud Creek and Ferney:**
1. Open the map → the search row alone at the left, docked under the top bar; the hint centred between it and the
   right column; ⓘ at the bottom right.
2. Search "Mud Creek" → its results under the search row; open it → its name on two lines, acres and no grade yet;
   "Grade this parcel" in the toolbar.
3. Grade it → "Grading…" with Cancel, the live log; when it's done: "Graded in … · 3 sources didn't load ▸", and the
   toolbar reads "Try again: 3 sources didn't load".
4. ▸ → the full log; collapse the panel (‹) → the slim tab with B and the name; reload → still collapsed; click the tab →
   open.
5. Draw a line → "Grade again: lines changed"; change a setting → "Grade again: settings changed".
6. Open **Ferney**, grade it → no button after a clean run.
7. Phone: steps 2–6 at 375 px; the button under the sheet's header; the peek holds the two-line name; nothing overlaps.

## 13. Decision to record in `phase-0.md` §9 (in PR 3)

**§9.56 The map's layout:**
- the docked left panel with search first, collapsing to a tab;
- the toolbar centred on the visible map;
- the attribution's ⓘ at the bottom right;
- "Grade this parcel" and its reasons in place of "Run again";
- the one-line log.
