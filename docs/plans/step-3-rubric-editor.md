# Step 3: Rubric editor

Roadmap step 3 (`PLAN.md`, Roadmap). The spec is `docs/design/workflow-review.md`, Rubric algorithm §6, with step 1's
plan §3.2 (the default rubric, and the promise that the first reorder shows the points before and after). Written
2026-10-17 under mission mode (`CLAUDE.md`). **Awaiting the owner's approval. No application code until then.** The
mission runs on `step/3-rubric-editor`, branched from main after this plan is merged. Step 2 (#166) is on main.

Done when:
- A person can see and change their own rubric in four columns (Must, Should, Could, Won't): by dragging between
  and within columns, or by tapping a card and choosing "Move to…".
- Tapping a card shows what it measures and why it's there, and adjusts its threshold.
- A preview shows the grade, the verdict and the two factors that moved most, on the open parcel when it's screened,
  else on another screened parcel or a sample, and updates as the cards move.
- The first reorder of the default rubric shows the points before and after, and switches it to rank-sum weights.
- "Reset to default" puts today's card back.
- A rubric change never asks for a re-screen.
- §9 records that warn gates stay, and the verdict lines' decision (§5).

## 0. What's already there (found while planning)

- **The model needs no change.** `lib/rubric/types.ts` already holds everything the editor writes:
  - `musts` (gates, and threshold minimums on rows);
  - `ranked` (Should and Could, in order);
  - `wonts`;
  - `bands`;
  - `weights` (`explicit` or `rankSum`).

  `lib/rubric/weights.ts` has rank-sum, and `lib/rubric/musts.ts` has threshold Musts and their words. `cardFor`
  already ignores a gate that isn't a Must. **No rubric version bump, no export or storage change, no schema change.**
- **The default rubric** (`defaultRubric()`) is today's card: the four gates as Musts, and the seven rows ranked
  Should by weight (elevation > homesite > room > sky > trails > garden > town). Its weights are explicit:
  25 / 25 / 15 / 10 / 10 / 5 / 10.
- **Storage:** the profile's own rubric is `ps.rubrics.mine` (`lib/client/rubrics.ts`); others are read-only here
  (step 5).
- **Re-screens:** the rubric isn't part of `RunKeys` (`lib/client/screenKeys.ts`), so no rubric change asks for a
  re-screen. A test keeps it that way (§10).
- **dnd-kit is already a dependency** (`@dnd-kit/core` 6.3.1, `sortable` 10.0.0, `utilities` 3.2.2: My order, WF3).
  Its sensors and constants (a 250 ms long press, 6 px tolerance) are reused. **No new dependency.**
- **Where it lives:** the rulebook ("What the grade means", `/rulebook`) explains the rules and shows the breakdown
  bar. The editor is a new page, `/rubric` ("My rubric"), linked from the ☰ menu, from the rulebook's header, and
  from the card's weight line (§8 Q8).

## 1. The columns and the cards

| Column | What can be there | What it does |
|---|---|---|
| **Must** | The four dealbreakers (flood, access, easement, septic), and **minimums** on rows ("Town and hospital: ER within 30 min") | A gate: fail → Pass; warn → at most one for a Contender; unknown → at most Maybe. Never adds points. |
| **Should** | Rows, ranked | Counts in the grade at full rank weight. |
| **Could** | Rows, ranked | Counts at 75% of its rank weight. |
| **Won't** | Rows and dealbreakers | Left out of the grade, and the card hides them. |

**The rules of the moves:**
- **A dealbreaker** can be Must or Won't only. It has no letter, so it can't rank. Dropping one on Should or Could
  is refused with "A dealbreaker is a Must or a Won't."
- **A row dropped on Must becomes a minimum, and keeps its ranked place too** (the design doc: "Elevation at least
  3,000 ft" gates, "higher is better" ranks). The drop says so: "Elevation is now a minimum too (at least 2,500 ft).
  It still counts at #1." The minimum starts at the row's B/C edge (§2), the edge of "acceptable".
  A Must card's ⋯ → "Remove the minimum" deletes it, and so does dropping it on Won't. (§8 Q2.)
- **A row moved to Won't** leaves the ranked list; its minimum, if any, goes too. Moved back, it lands at the end of
  the column it's dropped on.
- **Homesite** has no measure (its letter is the site's quality), so it can't be a minimum. "Move to… Must" is
  disabled on it, with a note.
- **Within Should and Could, order is rank.** Dragging up and down reorders. The Should/Could boundary is just
  the column, so moving a card from Should to Could keeps the order of the rest.

## 2. A card, and its threshold

Each card says in plain words what it measures and where its line is: the **B/C edge**, the design doc's "edge of
acceptable". Its rank and weight sit on the right ("#1 · 25%").

| Card | Words (today's default bands) |
|---|---|
| Flood (Must) | No FEMA flood zone at the build site or on the driveway |
| Access (Must) | Legal road access: frontage, or a recorded right-of-way |
| Easement (Must) | The driveway stays on your land, or its easement is recorded |
| Septic (Must) | A septic field fits: a soil rates better than "very limited" |
| Elevation | Build site at 2,500 ft or higher |
| Homesite | A good house site: winter sun, facing and slope |
| Night sky | Sky at least 21.2 mag/arcsec² (rural dark) |
| Room to build | Gentle ground of at least 2× the build footprint |
| Trails and public land | A trailhead within a 20-minute drive (or public land within a mile) |
| Town and hospital | An ER within 30 min and groceries within 20 |
| Garden ground | At least ¼ acre of garden ground |
| A minimum (Must) | "Town and hospital: ER within 30 min" (`thresholdWords`, in plain units) |

**Tap a card** to open its sheet (a popover on desktop, a bottom sheet on a phone):
- **What it measures**, one sentence, from the rulebook's text for that row (`lib/report/rulebook.ts`), so the two
  can't drift apart.
- **Why it's there:** "From the default card", or "You moved it here". Step 4's interview adds "Question 6:
  30 minutes". This needs no stored provenance: it compares with the default rubric.
- **Its threshold, as a slider with the value in words:**
  - **A ranked row:** the slider moves the B/C edge, and the other three edges move with it by the same amount.
    Today's spacing stays, as the design doc's "bands then step by a factor-specific amount" describes (§8 Q5). The
    band shows under it: "A 3,000+ · B 2,500 · C 2,000 · D 1,500". Each row's slider runs over a sensible range
    (elevation 1,000–4,500 ft by 100; ER 10–90 min by 5; and so on), set in `config.ts` as `card.editor` (rule 4).
  - **A minimum:** the slider sets the minimum itself, in the row's unit.
  - **A dealbreaker:** no slider. Its rule is fixed ("verify the easement" is its warn state, §5).
- **"Move to…":** Must · Should · Could · Won't, then "Up" and "Down" within the column. This is the full set of
  moves without dragging: for a keyboard, a screen reader, and anyone who can't drag.
- **For a minimum:** "Remove the minimum".

**Town and hospital** carries two bands (ER and grocery). Its sheet has two sliders. Its minimum is the ER drive,
since its `measure` is the ER minutes, as step 1 set it.

## 3. Weights: explicit until the first reorder, then rank-sum

- **The default keeps today's explicit weights.** Moving cards to Won't, adding minimums and moving thresholds don't
  change the weight mode.
- **The first change to the ranked order or a tier while the weights are explicit** opens a confirm sheet before it
  applies: "Ordering your cards switches to rank weights."
  - **A table, row by row:** today's weight → the rank-sum weight after this move. For the default order:
    elevation 25 → 25.0, homesite 25 → 21.4, room 15 → 17.9, sky 10 → 14.3, trails 10 → 10.7, garden 10 → 7.1,
    town 5 → 3.6.
  - **The preview parcel's points, letter and verdict, before → after.**
  - **"Switch and move"** applies both; **"Cancel"** puts the card back.
  - Once on rank-sum, moves apply without asking.
- **Measured on the fixtures** (default rubric, run scenario), the switch alone:

| Fixture | Explicit | Rank-sum (default order) | Verdict |
|---|---|---|---|
| Ferney Creek | 3.200 B | 3.179 B | Contender, unchanged |
| Macks Mountain | 3.050 B | 3.036 B | Maybe, unchanged (two warns) |
| Mud Creek | 3.450 B | **3.500 A** | Contender, unchanged |
| Roan Mountain | 2.900 B | 2.786 B | Maybe, unchanged (two warns) |

- **"Reset to default"** (with a confirm) restores `defaultRubric()`: explicit weights, today's bands, no minimums.
  The interview's "Reset to my answers" comes in step 4.

## 4. The live preview

- **What it shows:** the grade and verdict on one parcel, **before → now** ("B · Contender → A · Contender"). Under
  them, **the two factors that moved most**: the rows whose contribution to the points changed most since the editor
  opened, with the direction and the reason. For example: "Elevation +0.21 (weight 25% → 30%)", "Night sky −0.12
  (now a C: band raised to 21.4)", "Septic: now a Won't". It updates on every drop and slider move, and while a card
  is held over a column (the hover's result, before the drop).
- **The parcel, in order:**
  1. the open parcel, if it has a current screen;
  2. else the most recently screened saved parcel;
  3. else a sample.

  "Preview on: [name ▾]" switches between the open parcel, every saved parcel with a current screen, and the sample.
- **The sample** is Mud Creek's `run` result from `expected.json`, copied by a script (`pnpm data:sample`) into
  `lib/rubric/sample/mud-creek.json` and loaded only when it's needed (dynamic import; 69 KB raw, 21 KB gzipped).
  It's a `ScreenResult`, which holds no owner fields. It's labelled "Sample: Mud Creek, Grayson Co., VA". Mud Creek
  is near the A/B edge (3.450), so a drag visibly moves its letter.
- **Pure arithmetic:** `reportCard(result, draft)` per change, no network and no worker, so a drag can't wait on
  anything.

## 5. Decisions for §9: warn gates, and the verdict lines

**Warn gates stay** (owner, step 1 §8 Q2). A dealbreaker has three outcomes, not two:
- pass;
- **warn**: "verify the easement", "the road in is a track", "septic soils very limited";
- fail.

A Contender allows at most one warn (`contenderMaxWarns`). The editor shows the warn rule on each dealbreaker's sheet
and doesn't make it editable. Recorded as §9.50.

**The verdict lines: points today, letter edges proposed.** Today a Contender needs 2.75 points and a Pass is under
1.75. So a B between 2.50 and 2.75 is a Maybe, and a C between 1.50 and 1.75 is a Pass. The card then shows a
letter whose verdict reads against it. The design doc's rule is letter edges: A or B → Contender, C → Maybe, D or
F → Pass (with the same gates, warns and caps).

**The effect on the four fixtures,** every scenario, both weight sets (18 cards), measured 2026-10-17:

| Fixture | Points (default / second) | Verdict at points | At letter edges |
|---|---|---|---|
| Ferney Creek (run, setHouse, houseRun) | 3.200 B / 2.750 B | Contender / Contender | same |
| Macks Mountain (run, evaluateSite2) | 3.050 B / 2.200 C | Maybe / Maybe (two warns) | same |
| Mud Creek (run, evaluateSite2) | 3.450 B / 3.050 B | Contender / Contender | same |
| Roan Mountain (run, evaluateSite2) | 2.900 B / 3.000 B | Maybe / Maybe (two warns) | same |

**No fixture's verdict changes.** Ferney's second card sits exactly on today's 2.75 line, and is a Contender either
way. A saved parcel changes only if it scores 2.50–2.75 (Maybe → Contender) or 1.50–1.75 (Pass → Maybe).

**Recommended: move to letter edges** (§8 Q1):
- the editor can explain the verdict in one line: "A or B is a Contender";
- the letter and the verdict never disagree;
- nothing on the fixtures moves.

The change is `card.verdict` 2.75 / 1.75 → 2.5 / 1.5 in `config.ts`, with the config snapshot updated. The Grade
and verdict panel's sentence quotes those numbers, so its text changes. That's a replacement, not an addition, so it
needs rule 7's approval, given here: "Contender at 2.5 and up …" in place of "2.75". Recorded as §9.51. If you'd rather
keep points, nothing changes and §9.51 records that.

## 6. UX

### 6.1 Desktop (1280 px)
- **Layout:** four columns side by side on the left, two-thirds of the width; the preview on the right, sticky.
- **Columns:** each column header gives the tier, a count and its rule in a few words ("Must: a fail is a Pass").
- **Cards:** one line of words, the rank and weight on the right, a drag handle on the left. The whole card is the
  tap target for its sheet.
- **Dragging:** the card lifts and the drop targets show. A refused drop (a dealbreaker onto Should) shows the
  reason in place.
- **The header:** "My rubric", the profile picker, "Reset to default", and a link to the rulebook.

### 6.2 Phone (375 px): stacked tiers, tap to move first
- **Four columns don't fit, so the tiers stack:** Must, then Should, Could and Won't, one list with a sticky header
  for each tier. Everything is visible with one scroll, with no hidden tab to forget about (§8 Q6: a tier switcher
  is the alternative).
- **Tap to move is the primary interaction:** tap a card → its bottom sheet → "Move to…" (four tier buttons, then
  Up / Down), the threshold slider, and the words.
- **Dragging is the shortcut, by the handle only:** a 250 ms long press on the handle (dnd-kit `TouchSensor`,
  `delay: 250, tolerance: 6`), so a swipe over a card scrolls the page and never starts a drag. While dragging near
  the top or bottom edge, the list auto-scrolls.
- **The preview is a sticky bar** at the bottom: "B · Contender → A · Contender ▴". Tapping it opens the two
  factors and the parcel picker.
- **Tap targets:** at least 44 × 44 px. Nothing scrolls sideways (the e2e checks both).

### 6.3 Empty columns
Each empty column keeps a dashed drop target with one line:
- **Must:** "No dealbreakers: any parcel can be a Contender. Move a card here to make it one."
- **Should:** "Nothing ranked first. Your grade comes from Could alone." When Should and Could are both empty: "Nothing
  counts toward a grade: move a card to Should."
- **Could:** "Nothing here. Drag a card here, or tap one and choose Move to… Could."
- **Won't:** "Everything counts. Move a card here to leave it out of your grade."

### 6.4 Saving, undo, never a re-screen
- **Every change saves at once** to the profile's rubric (`ps.rubrics.mine`, through the profile store), as notes and
  lines do. An **Undo** toast follows each change (the last ten can be undone), and "Reset to default" sits behind a
  confirm (§8 Q4).
- **A rubric change never asks for a re-screen:**
  - the Library's grades and the card's switch re-grade at once from the stored measurements;
  - "Needs a re-screen" never appears because of a rubric;
  - a line under the preview says so: "Your grades update everywhere at once. Nothing needs screening again."

### 6.5 Keyboard and screen readers
- **Keyboard:** dnd-kit's `KeyboardSensor` (space to lift, arrows to move, space to drop) plus "Move to…".
- **Screen readers:** live-region announcements: "Elevation moved to Should, rank 2 of 6".
- Focus returns to the card after a move.

## 7. Numbers and text that may change (the declaration)

- **`expected.json`:** no change on any fixture. The engine, schema and results are untouched, and `ENGINE_VERSION`
  stays 22.
- **`card.verdict`:** 2.75 / 1.75 → 2.5 / 1.5, **only if Q1 is approved.** No fixture's verdict changes (§5);
  `cards-v7.json` and `cards-v8.json` stay as they are.
- **`card.editor`** (new): each row's slider range and step.
- **Text:**
  - new: the editor's own text (cards, sheets, empty states, the confirm, the preview);
  - changed: the Grade and verdict panel's verdict sentence (Q1);
  - added: a "My rubric" link in the menu and the rulebook.
- **No export, storage or rubric-version change.**

## 8. Questions for the owner

1. **The verdict lines:** move to letter edges (recommended, §5), or keep points?
2. **A row dropped on Must** becomes a minimum and keeps its ranked place (recommended, the doc's model). Or should it
   move out of Should and Could?
3. **Dealbreakers** can be Must or Won't only (they have no letter to rank). Agreed?
4. **Saving:** every change saves at once, with Undo and "Reset to default" (recommended). Or a draft with Save and
   Cancel?
5. **A ranked row's slider** moves its B/C edge and shifts the other edges by the same amount (recommended). Or a
   slider for each edge?
6. **Phone:** stacked tiers (recommended) or a tier switcher?
7. **The preview's fallback sample** is Mud Creek's result, bundled (21 KB gzipped, loaded on demand). OK, or Roan?
8. **The editor on its own page** `/rubric` ("My rubric": the menu, the rulebook, the card's weight line), or inside
   the rulebook?
9. **Other people's rubrics** (the "Julie" one, a household's) stay read-only until step 5. Agreed?

## 9. Stop conditions (push what's there, say why, wait)

1. Any change to a fixture's `expected.json`, or to `cards-v7.json` / `cards-v8.json` beyond what §7 declares.
2. A verdict or reason line changing on a fixture (even with Q1 approved, none should).
3. The rubric shape needing a change (a version bump, or an export or storage change).
4. The general ones (CLAUDE.md): a product decision, the same CI failure three times, or the plan turning out wrong.

## 10. The PRs, into `step/3-rubric-editor`

| # | PR | Checks |
|---|---|---|
| 1 | **Rubric edits, pure** (`lib/rubric/edit.ts`): `moveCard` (the rules of §1), `setBandEdge` (shift), `setMinimum`, `removeMinimum`, `switchToRankSum` (with the before/after table), `resetToDefault`, `movedMost(before, after, result)`; `cardWords` (§2, from bands); `card.editor` ranges; the verdict lines (if Q1). | Unit tests for every rule, including refused moves; rank-sum before/after on the fixtures (the §3 table); `movedMost` on Mud Creek; the oracles unchanged; the config snapshot. |
| 2 | **The editor, desktop:** `/rubric`, columns with dnd-kit (sortable within, droppable between), cards, the sheet (words, why, slider, Move to…), saving, Undo, Reset, the weights confirm; menu, rulebook and card links. | Component tests (render, Move to…, the confirm); e2e: drag between and within columns, Move to…, slider, Reset, the switch's confirm (Cancel reverts), and Library grades updating with no "Needs a re-screen". |
| 3 | **The preview:** the parcel order and picker, the sample (`pnpm data:sample`, lazy), before → now, the two factors, live while dragging. | Unit: the parcel choice; e2e: the preview follows a drag on the sample and on an open parcel. |
| 4 | **The phone layout:** stacked tiers, sticky headers, the bottom sheet as the primary move, handle-only long-press drag, the sticky preview bar, empty states, keyboard and announcements. | e2e at 375 × 812: tap → Move to…, no sideways scroll, 44 px targets, a swipe scrolls and doesn't drag; keyboard moves. |
| 5 | **Screenshots and docs:** `pnpm screenshots` gains the editor at 1280 and 375, with a drag in progress (the lifted card over another column; on the phone, the handle's drag mid-move) and the weights confirm; REQUIREMENTS (rubric editing), phase-0.md §9.50–§9.51; the hand-back PR to main. | Full CI on the step branch's head. |

## 11. Test plan outline

**Unit (CI):**
- the move rules;
- thresholds and band shifts;
- rank-sum on the first reorder, with the before/after table;
- `movedMost`;
- the card words;
- the verdict lines (Q1);
- the oracles (`cards-v7`, `cards-v8`, `grades-*`) unchanged;
- the rubric never in `RunKeys`.

**e2e (CI):**
- desktop: drag, Move to…, slider, confirm, Reset, Undo;
- phone: stacked, tap to move, scroll vs drag;
- keyboard moves;
- the Library re-grading with no re-screen.

**Screenshots (the hand-back), each at 1280 px and 375 px:**
- the editor at rest;
- a drag in progress;
- a card's sheet with its slider;
- the weights confirm;
- the preview after a move;
- an empty column.

**Manual, on the preview (about 20 minutes, desktop then phone), using the fixture parcels by name:**
1. Open **Mud Creek** (screen it) → ☰ → My rubric → the preview shows Mud Creek: B · Contender.
2. Drag Night sky above Homesite → the weights confirm shows today's and the rank-sum weights, and Mud Creek's points
   3.450 → after. Cancel puts the card back; do it again and Switch → the preview updates.
3. Move Septic to Won't → the preview's two factors name it; the card hides the septic gate.
4. Drag Town and hospital onto Must → "now a minimum too (ER within 30 min)". Set the minimum to 20 min → open **Macks
   Mountain** → its verdict reads against the minimum.
5. Tap Elevation → slide its edge to 3,000 ft → the band words update; the preview moves.
6. Your list → every grade has updated, and nothing reads "Needs a re-screen".
7. Reset to default → today's card is back; **Ferney**, **Macks**, **Mud Creek** and **Roan** show their grades as before.
8. Phone: stacked tiers; tap a card → Move to… Could; long-press the handle and drag; a swipe over the cards scrolls.

## 12. Decisions to record in `phase-0.md` §9 (in the PRs)

- **§9.50 The rubric editor.** The columns' rules (dealbreakers Must or Won't, a row on Must as a minimum too,
  homesite never a minimum); the threshold as the B/C edge shifting the band; explicit weights until the first
  reorder, then rank-sum, with the confirm; saving and Undo; the preview's parcel order and the sample. Warn gates
  stay, a real third state.
- **§9.51 The verdict lines:** letter edges or points, as Q1 answers, with the fixture table of §5.
