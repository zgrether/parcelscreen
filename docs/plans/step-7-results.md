# Step 7: Screening results

Written 2026-10-20 under mission mode (`CLAUDE.md`) from Zach's brief, which he pre-approved along with this plan's
recommended answers (§11). It runs straight through on `step/7-results`: this plan is PR 0 into the step branch, and
Zach reviews it together with the hand-back. The stop conditions are §12's. The spec is
`docs/design/workflow-review.md` "Screening results" and PLAN.md row 7.

**The goal:** a screen answers one question first: what is the best this parcel can be for you? Then it shows where,
a couple of real alternatives, and the detail in your own order.

Done when the results panel (the desktop panel and the phone sheet) reads, top to bottom:
1. **The answer:** grade and verdict for the current person, with one line of reason built from their priorities:
   "B, Contender. Strong winter sun and trails; 38 minutes to an ER is past your 30." On a phone, the line fits the peek.
   Other members' grades stay one tap away, in step 6's section.
2. **Best homesite:** the site the grade is taken at, inked on the map, with the four or five numbers that matter
   most to this person among the factors that differ from site to site.
3. **Up to two alternatives:** each within 10 points of the best and at least 100 m from it and from each other. The
   rest sit behind **N more spots**. Tapping one evaluates it, as a pin does today.
4. **The report card in priority order:** Must have (pass, check first, fail or unknown), then Really want, then Nice
   to have. Don't care rows are hidden. Each row still opens its slide-in panel.
5. **Still unknown:** each unknown factor as a plain question for the listing agent, with **Copy** on each and
   **Copy all**. Data that didn't load isn't an agent question: it stays with **Try again**.
6. **Full report ▸:** the report's existing sections, in the order they have today, behind one control.

And the grade itself changes in two declared ways (§2, §3): each person's grade is taken at **their best homesite**,
and a **Driveway** row joins the card, graded from the router's stored measurements, with question 10 setting its
cutoffs. Both are display-time: no re-screen, no engine change, no `expected.json` change.

## 0. What's there today (found while planning)

- **The card is display-time** (`lib/report/card.ts`, `reportCard(result, rubric, drawn)`). Every caller goes through
  it: the panel, Your list (`lib/client/library.ts`), the parcel's detail, Compare, the rulebook, the editor's
  preview and step 6's How Julie would rate it. A change there reaches all of them.
- **The card grades one build site:** the marked house when there is one, else the engine's site #1, which is ranked
  by quality against build cost (`lib/screen/score.ts`). Elevation reads that site; Best homesite reads site #1's
  quality letter; Room to build reads site #1's fit and gentle ground; Night sky reads the parcel's reading at the
  evaluation point; Garden ground is the parcel's best garden, wherever it is.
- **Every ranked site stores what a site-by-site grade needs** (schema v8–v9, `lib/screen/types.ts` `SiteSchema`):
  elevation, December sun and daylight, facing and slope (its quality letter derives from them, `derive.ts`), its own
  sky reading (mag, the brightest dome, the core's clearance), its fit and gentle ground, whether a flood zone covers
  or touches it, and its chosen driveway's facts (length, steepest grade, design grade, the limit it was judged
  against, the existing drive's grade, easement need, no practical drive). Only site #1's routes are stored in full
  (`driveway.routes`, with their profiles, flood length and drawn lines).
- **Garden patches aren't tied to sites:** `gardens` is the parcel's list, with no distance to any site.
- **No Driveway row:** the router measures the driveway, but the card only uses it in the Easement and Floodplain
  gates. Question 10's answer goes to the interview's quiet list (step 4 plan §9 Q5: "the Driveway row comes with
  screening results").
- **The panel today:** the header (name, acres, grade), the report card (the grade and verdict with its reason,
  Dealbreakers as four chips, seven rows in a fixed order, Cost to enjoy pending), step 6's section, and Copy
  summary. The report's sections live only in the rows' slide-in panels. The Still unknown section is a fixed
  nine-item checklist (`lib/report/unknown.ts`), in the Grade and verdict panel.
- **Pins:** each ranked site is a numbered pin (the engine's rank); site #1 is inked. With the parcel's live session,
  a tap re-evaluates there (sun, sky and the driveway re-routed, with the "not saved" note); without one, it doesn't.
- **The phone's peek** is 92 px (the header), or 148 px while the grade button shows under it.

## 1. The panel, top to bottom

### 1.1 The answer

- **Grade and verdict:** today's chip and word, for the current person (the rubric switch stays where it is).
- **The reason line,** built from their rubric:
  - **Strengths:** up to two rows graded A or B, the ones this person weighs most: "Strong winter sun and trails".
    Each row has one short noun (§8).
  - **The biggest miss:** the row that costs the grade most, by weight × (B's points − its points), among rows at C
    or worse; ties go to the heavier row. It reads with the measured value and the person's own B/C edge: "38 minutes
    to an ER is past your 30", "2,310 ft is below your 2,500 ft" (§8 has one sentence per row).
  - **A Must comes first:** a failed Must replaces the miss with "fails your must: …"; a Must to check (a warning, a
    build that doesn't fit, a limit with no measurement) with "check first: …". Both quote the card's existing gate or
    row wording.
  - "B, Contender. Strong winter sun and trails; 38 minutes to an ER is past your 30." With no strength: "C, Maybe. 38
    minutes to an ER is past your 30." With no miss: "A, Contender. Strong elevation and winter sun." With neither:
    "B, Contender."
- **Data that didn't load:** under the line, "Incomplete: the FEMA flood map didn't load." with **Try again** (the grade
  button's action). It's the same list the card's reason names today.
- **Tapping the answer** opens the Grade and verdict panel, which keeps today's reason line word for word.
- **On a phone,** the peek holds the header and the answer's line on up to two lines (cut with "…"; the whole line is
  on the sheet). The peek grows by those two lines while a graded parcel is open; the height is measured in PR 3.

### 1.2 Best homesite

- **Which site:** the person's best site (§2), named as its pin is: "Site #3". It's inked and ringed on the map
  (§1.3). With a marked house, the section is **Your marked house** instead (§11 Q6).
- **Its numbers:** the site-varying rows this person ranks, heaviest first, up to five, each with its letter:
  elevation, December sun and facing, the sky, room to build, and the driveway (length and steepest grade). Fewer
  than four ranked: the others fill in, in the card's order, without a letter.
- **Tap a number** to open its row's panel.

### 1.3 Alternatives and N more spots

- **Up to two alternatives:** the next sites by the person's ranking (§2) whose site score is within 10 points of the
  best's (on the 0–100 scale in §2) and which are at least 100 m from the best and from each other. Each is one row:
  "Site #5 · 8 points behind", with its two or three numbers that differ most from the best's.
- **N more spots:** the remaining ranked sites, behind "N more spots" (shown only when N > 0), each a row like the
  alternatives', in the person's order.
- **Tapping a site** evaluates it as its pin does (`evaluateAt`, with the live session), and the map moves to it. The
  section then says "Showing site #5" with **Back to the best site**. The answer and the card stay at the best site
  (§11 Q13). Without a live session, the tap moves the map to the site, and the existing "Grade again to restore the
  map overlays" note says why it can't evaluate.
- **The map:** the pins keep the engine's numbers. The person's best site is the inked pin (today, site #1); the
  alternatives get a light ring.

### 1.4 The report card, in priority order

- **Must have:** each gate the rubric keeps as a Must, then each limit (threshold Must). A row each: its label, its
  mark (✓ pass, ! check first, ✗ fail, ? unknown) and one line (the gate's reason, or the limit with its measure:
  "Elevation: at least 2,500 ft · 3,120 ft at site #3"). A gate the person doesn't care about is hidden. The four
  chips go.
- **Really want,** then **Nice to have:** the ranked rows in rank order, as today's rows (label, letter, one line).
- **Don't care** rows are hidden; Cost to enjoy (pending) stays last.
- Every row opens its slide-in panel, as today. The panels don't change, except the new Driveway row's (§3.4).

### 1.5 Still unknown

- **What becomes a question:** a Must whose status is "check first" or "unknown" for a reason other than a failed data
  load. One fixed question per gate (§8), with the gate's own reason under it in small type ("Why we ask: …").
- **Copy** on each question; **Copy all** copies them as a numbered list under the parcel's name. "Copied" shows for
  1.5 s, as Copy summary does.
- **Failed loads:** listed here too, as "Didn't load: the FEMA flood map." with **Try again**, never as a question.
- **None:** "Nothing to ask the agent: the screen answered every must." and a link, "What no dataset answers", that
  opens Full report at its Still unknown checklist.

### 1.6 Full report ▸

- One disclosure, closed by default, under Still unknown and step 6's section. Open, it renders every report section
  in `components/Results/report.ts` order, each under its existing heading, with today's text and controls (the Still
  unknown checklist included).
- Copy summary and the results notes stay below it, as today.

## 2. Highest capability: grading at each person's best site

- **The site-varying rows** (a pure module, `lib/report/sites.ts`): Elevation, Best homesite (the site's quality
  letter), Night sky (the site's own reading, its zone from its mag), Room to build (the site's fit and gentle ground)
  and Driveway (the site's chosen driveway, §3). Each reads one site, with today's rules and wording, and the site's
  label where today's says "site #1".
- **Not site-varying here:** Garden ground stays the parcel's (§11 Q1); Trails and Town and hospital are timed from
  the parcel's entrance, as today. View and privacy aren't measured yet (steps 10–11).
- **A site's score:** the weighted mean of the points of the site-varying rows the person ranks, on 0–100 (A 100,
  B 75, C 50, D 25, F 0). No ranked site-varying row: every site scores the same, and the engine's order decides.
- **The ranking,** best first:
  1. sites that pass the site checks: the build fits; not in a flood zone, when Floodplain is a Must; a driveway
     reaches it with a practical route and no easement, when Easement needed is a Must; and every limit on a
     site-varying row (elevation, December sun, sky, room);
  2. then by score, highest first;
  3. then by the engine's rank (its build-cost ranking breaks ties).

  When no site passes every check, the one with the fewest failures leads, and the card says what fails, as today.
- **The parcel's grade is taken at the best site:** the five site-varying rows read it, and so does the Floodplain
  gate's build-site part (in a flood zone fails; touching warns). The Access and Easement gates and the Floodplain
  gate's driveway part read the router's scored route (to site #1, or your chosen line), the one route the screen
  stores in full; the site checks keep the best site from being worse than site #1 on them (§11 Q5).
- **A marked house** is where the house goes: the card grades there as today, plus the new Driveway row at the house
  (§11 Q6).
- **Each member** gets their own best site: Your list's grades, Compare, the editor's preview and How Julie would rate
  it all call `reportCard` with that member's rubric.
- **The guard:** `reportCard` takes an optional site to grade at. A test grades every fixture at site #1 with the
  Driveway row as Don't care and checks every card against today's stored oracle, byte for byte. So any grade or
  verdict change must come from the best site or the Driveway row.

## 3. The Driveway row

### 3.1 What it grades

- **The measure:** the steepest grade on the site's chosen driveway (steepest over 30 m, as the router measures it;
  the design grade where the router designed an alternative), or the existing drive's raw grade when that's steeper,
  as the over-limit term reads them (`score.ts` `overLimitPointsFrom`).
- **The letter:** at most the band's edges, `card.rows.drivewayPct` = [10, 15, 20, 25]: A ≤ 10%, B ≤ 15% (Settings'
  default grade limit), C ≤ 20%, D ≤ 25% (Settings' default veto), F beyond. No route reaches the site, or no practical
  drive: F.
- **The line:** "640 ft, 13% at its steepest", with "; needs an easement across neighbouring land" when it does.
  Short: "13% steepest". Not graded until the driveway step has run ("the driveway wasn't routed"), or when the roads
  didn't load (a failed load, as Easement's).
- **Length** isn't graded: it's in the line, and its cost is Cost to enjoy's (§11 Q7).

### 3.2 Question 10 sets its cutoffs

- **Edges:** Short and steep → 20% (B/C edge), Long and gentle → 15%, Whatever it takes → 12%; the band shifts with
  the edge (`setBandEdge`): [15, 20, 25, 30], [10, 15, 20, 25], [7, 12, 17, 22].
- **Points:** Short and steep 1, Long and gentle 2, Whatever it takes 1; skipped 2 (the design's default tier,
  Should). Driveway joins the tie order after Best homesite.
- Question 10 leaves the quiet list: its answer is now measured.

### 3.3 In the rubric

- **A new row key,** `driveway`, labelled "Driveway", with the band `drivewayPct` (an "at most" band in %), an editor
  slider (8–25%, step 1), its card line ("A driveway no steeper than 15% at its steepest") and plain line ("A
  driveway no steeper than 15%"). No limit (Must) on it in this step (§11 Q9).
- **The starting list** keeps today's card: Driveway weighs 0 and is Don't care (`card.weights.default.driveway = 0`;
  a zero weight becomes Don't care), as step 4 kept "skip everything" unchanged.
- **Saved priorities:** the band is an optional field, and a rubric that doesn't rank Driveway has it in Don't care.
  No saved rubric is rewritten (§11 Q8). **Reset to my answers** (or a drag) brings it in.

### 3.4 Its panel

The row opens a Driveway panel holding today's Driveway section, with a line on how it's graded ("Graded on the
steepest grade of the driveway to site #3: A ≤ 10% · B ≤ 15% · C ≤ 20% · D ≤ 25%"). The Easement panel is unchanged.

## 4. Data, storage and sync

- **No engine, `ScreenResult` or `expected.json` change.** Schema v9 stays frozen; `ENGINE_VERSION` doesn't move.
- **Rubrics:** `driveway` is accepted in the ranked and Don't care lists and the explicit weights (a weight missing
  from a saved rubric reads 0), and `bands.drivewayPct` is optional (missing reads the config's). Additive optional
  fields: the stored rubric keeps `version: 1`, the export file stays version 6 (REQUIREMENTS §3a's rule).
- **Interview answers** don't change shape (question 10 is already stored).
- **Sync:** nothing new; the rubric syncs inside the profile as today.

## 5. Copying

The agent questions use the Clipboard API as Copy summary does, with the same "the browser didn't allow copying"
fallback line.

## 6. What's not in this step

Ways to raise the grade (step 12), favourites (step 8), new data factors (step 11), a per-site garden (§11 Q1), a limit
on the driveway, questions from the interview's quiet list (HOA, creek, internet: steps 9–10), and the print report
card.

## 7. Tests

- **Unit:**
  - each site-varying row at a site (elevation, quality, the site's sky and zone, fit, the driveway);
  - the Driveway row: bands, design grade, existing drive, no route, no practical drive, not routed, easement;
  - question 10's edges and points, and skipping it; the starting list unchanged; an old saved rubric parses with
    Driveway in Don't care;
  - the ranking: the site checks, the score, ties to the engine's rank, a rubric with no site-varying row;
  - the alternatives: 10 points, 100 m from the best and from each other, at most two, N more spots;
  - **the guard** (§2): every fixture at site #1 with Driveway as Don't care equals today's card oracle;
  - the reason line: strengths, the biggest miss, a failed Must, check first, each row's miss sentence;
  - the agent questions: which gates, failed loads excluded, Copy all's text.
- **Components:** the panel's order; Must rows' marks; Don't care hidden; Full report renders every section.
- **e2e** (fixtures):
  - Ferney: the answer line, Best homesite's numbers, the card's group order;
  - an alternative tap evaluates it ("Showing site #N", Back to the best site);
  - Still unknown: Copy all puts the numbered list on the clipboard;
  - Full report opens with every heading;
  - at 375 px, the peek shows the answer's line.
- **The hand-back table** (a test tool, `test/tools/step7-table.test.ts`): for every fixture, grade, verdict and best
  site before (main) and after, under the starting list and under Zach's interview-generated rubric (§11 Q15).

## 8. Numbers and text that may change (the declaration)

- **Grades and verdicts** may change from exactly two sources: the best site (§2) and the Driveway row (§3). Every
  change shows in the hand-back table with its cause. Anything else is a stop.
- **New numbers in `lib/screen/config.ts`:**
  - `card.rows.drivewayPct: [10, 15, 20, 25]`;
  - `card.weights.default.driveway: 0`;
  - `card.editor.drivewayPct: { min: 8, max: 25, step: 1 }`;
  - `card.interview.defaultPoints.driveway: 2`;
  - `card.interview.choices.driveway`: steep 1 point and a 20% edge, gentle 2 and 15%, build 1 and 12%;
  - `card.sites: { withinPoints: 10, apartM: 100, alternatives: 2, numbers: 5 }`.
- **Existing report text that changes:**
  - the site label in the rows' and panels' existing sentences ("at site #1" reads "at site #3" when the best site
    is #3), including Room to build's panel line "where the house goes on site #1";
  - the card's group order and the "Dealbreakers" label (now "Must have", the priorities page's own word);
  - the reason line moves from the card's top into the Grade and verdict panel, word for word;
  - the report's sections, and the Still unknown checklist, move behind Full report, word for word;
  - the help text "otherwise site #1" becomes "otherwise your best site" (a superseded sentence, §9.43).
- **New text** (pre-approved in the brief; the exact strings land in PR 3's description):
  - **The reason line:** the nouns elevation, winter sun, the driveway, a dark sky, room to build, trails, town and
    the ER, garden ground; "Strong {a} and {b}"; the misses, one per row:
    - "{ft} ft is below your {edge}";
    - "the best homesite grades {L} ({h} h of December sun)";
    - "the night sky ({mag}) is brighter than your {edge}";
    - "gentle ground is {x}× the build footprint, under your {edge}";
    - "the nearest trailhead is {min} minutes away, past your {edge}";
    - "{min} minutes to an ER is past your {edge}" (or "to groceries");
    - "{ac} ac of garden ground, under your {edge}";
    - "the driveway is {g}% at its steepest, past your {edge}";
    - "fails your must: …"; "check first: …";
    - "Incomplete: … didn't load." and Try again.
  - **Best homesite:** "Best homesite", "Site #3", "Your marked house", "Showing site #5", "Back to the best site", "No
    homesite found on this parcel."
  - **Alternatives:** "Other spots", "{n} points behind", "{n} more spots".
  - **The card:** "Must have", "Check first", "Unknown", the limit row "{factor}: {limit} · {measure}".
  - **The Driveway row:** "Driveway", "{len} ft, {g}% at its steepest", "; needs an easement across neighbouring land",
    "{g}% steepest", "the driveway wasn't routed", "no driveway route reaches {site}", "no practical driveway to
    {site}", its card and plain lines, and its panel's grading line.
  - **Still unknown:** "Still unknown", "Ask the listing agent", one question per gate (Floodplain unmapped; Legal
    road access; Easement needed; Septic), "Why we ask:", "Copy", "Copy all", "Copied", "Didn't load:", "Nothing to ask
    the agent: the screen answered every must.", "What no dataset answers".
  - **Full report:** "Full report".
- **Storage:** additive optional rubric fields (§4). No clean break: nothing saved is dropped.

## 9. UX

- **The main flow, in the fewest steps:** open a parcel (or Grade it) → the answer, the best site and its numbers,
  without a scroll on desktop, and in the peek on a phone. One more glance: the alternatives. One tap: a row's panel,
  a site's evaluation, or a question copied.
- **What you see first:** the answer, then where, then the detail on demand (the card's rows, their panels, Full
  report).
- **States:**
  - **running:** "Screening…" in the answer, as today; Best homesite reads "Finding homesites…" until the sites are
    ranked; the card's pending rows read "…"; Still unknown waits for the run's end;
  - **loading a kept screen:** as today (nothing until it's read);
  - **no homesite:** "No homesite found on this parcel.", no alternatives, and Room to build's F as today;
  - **one site, or none within 10 points:** no alternatives; N more spots if there are other sites;
  - **failed loads:** the answer's Incomplete line with Try again, and the same in Still unknown;
  - **stale results:** today's banner and dimmed report;
  - **slow evaluation:** today's hint ("Evaluating site #5 — routing the driveway…") until it's back.
- **Plain labels:** Best homesite, Other spots, N more spots, Must have, Really want, Nice to have, Check first,
  Unknown, Still unknown, Ask the listing agent, Copy, Copy all, Try again, Full report, Back to the best site.
- **Phone at 375 px:** the sections stack in the order above; the answer's line fits the peek; site rows, Must rows,
  Copy, Copy all and Full report are at least 44 px tall; numbers wrap two to a line; Full report's sections keep their
  own phone layout.
- **Contrast and consistency:** letters use the card's grade chips; marks keep the gate colours; the best site's ring
  and the alternatives' light ring pass 3:1 against the map; text passes AA in light and dark.

## 10. Screenshots and the fresh-eyes review

At 1280 and 375 px, for Mud Creek, Ferney and Roan: the answer; Best homesite; the alternatives and N more spots; the
card's order; Still unknown; Full report open; and the phone's peek. On the `pr-assets` branch (step-7 folder),
linked in the hand-back. Then a subagent that hasn't seen the code gets only those and "You've never used this app.
What is this page for, and what's confusing?"; every finding goes in the hand-back with what was done.

## 11. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Garden ground:** stays the parcel's best garden for every site (recommended). The stored gardens aren't tied to
   sites, and "near the house" would need a new distance rule, a new number. It doesn't move the ranking.
2. **Room to build** counts as site-varying (it's measured per site), and a site where the build doesn't fit can't
   lead while one where it fits exists (recommended; the engine has the same rule).
3. **The ranking:** the site checks first, then the score, then the engine's rank (recommended): a site that fails your
   must can't be your best while one that passes exists.
4. **"10 points":** on the site score's 0–100 scale (A 100 … F 0), weighted by the person's site-varying rows
   (recommended). A one-letter drop on a row worth 40% of those weights is 10 points.
5. **The gates at another site:** the site parts read the best site; the route parts read the router's scored route,
   the only one stored in full (recommended). The site checks keep the best site's own driveway no worse.
6. **A marked house:** the card grades at the house, as today, with the Driveway row read at the house (recommended:
   you said the house is there). The section is Your marked house; the alternatives are measured against it.
7. **Driveway length:** in the line, not graded (recommended); its cost is Cost to enjoy's.
8. **Saved priorities:** not rewritten; Driveway starts in Don't care, and Reset to my answers or a drag brings it in
   (recommended: no migrations).
9. **A driveway limit (Must):** none in this step (recommended): question 14 has no chip for it.
10. **The starting list:** Driveway weighs 0 (Don't care) (recommended), so the starting list grades as today. The
    interview ranks it (question 10, or Should when skipped, the design's default tier).
11. **Pins:** keep the engine's numbers; the person's best is the inked one (recommended: renumbering would change
    every report sentence that names a site).
12. **Still unknown:** questions only for Musts to check or unknown, one per gate (recommended); the nine-item
    checklist stays, in Full report. The quiet list's HOA, creek and internet wait for their factors (steps 9–10).
13. **Evaluating an alternative** moves the map and the sun, sky and driveway panels (with the "not saved" note), not
    the grade (recommended: the grade is the parcel's best).
14. **A warning on a Must** shows as "Check first" (recommended), beside pass, fail and unknown, as the gates have it
    today.
15. **Zach's rubric for the table:** generated from his own answers, read once from the synced space through the
    connector (read-only), and kept out of the repo (recommended); the worked example's Person A if they can't be read.
16. **N more spots** lists ranked sites only (recommended); shelves and excluded benches stay pins.

## 12. Stop conditions (push what's there, say why, wait)

- A grade or verdict change in the hand-back table that neither the best site nor the Driveway row explains, or the
  guard test failing.
- Any `expected.json`, engine or `ScreenResult` change.
- Report or verdict text beyond §8.
- A product decision outside this brief and §11.
- The same CI failure surviving three attempts.
- The plan turning out wrong.

## 13. Setup

None from Zach.

## 14. The PRs, into `step/7-results`

| PR | What | Checks |
| --- | --- | --- |
| 0 | This plan. | docs |
| 1 | **The Driveway row:** the row key, band, card row and panel, words, editor slider, question 10's points and edges, the starting list's 0 weight, optional fields in the rubric schema. | unit: the row, question 10, old rubrics parse, starting list unchanged |
| 2 | **Highest capability:** `lib/report/sites.ts` (rows at a site, score, ranking, alternatives), `reportCard` at the best site (and at a given site), the guard test, the site labels in rows and panels, the help line, the hand-back table tool. | unit: ranking, alternatives, the guard; the table |
| 3 | **The panel:** the answer and its reason line, the peek, Best homesite, alternatives and N more spots, pins inked by person, the card in priority order, Still unknown's questions with Copy and Copy all, Full report. | unit: reason line, questions; components; e2e |
| 4 | **The screenshots, the fresh-eyes review, the docs and the hand-back:** each screen at 1280 and 375; REQUIREMENTS §3g; `phase-0.md` §9.59; PLAN.md's step 7 row. | full CI on the step branch's head |

## 15. Test plan outline

**CI:** §7.

**Manual, on the preview** (desktop, then a phone), with `preview-parcels.json`:
- Mud Creek, Ferney and Roan: the answer line reads like the brief's example and names your strengths and miss;
- Best homesite names a site whose pin is inked, with numbers in your order;
- the alternatives are real choices (10 points, 100 m); N more spots lists the rest; tapping one evaluates it, and Back
  returns;
- the card reads Must have, Really want, Nice to have; a Don't care row is gone;
- Still unknown: Copy all pastes a numbered list; a failed load shows Try again, not a question;
- Full report opens with every section;
- the editor: drag Driveway into Really want, and the card and Best homesite change;
- Reset to my answers puts Driveway where question 10 says;
- as Julie: her best site can differ from Zach's, and How Julie would rate it uses it;
- the phone's peek shows the answer's line.

## 16. Decision to record

**§9.59 Screening results:**
- the answer first, with a reason line from the person's rubric;
- the best homesite, up to two alternatives (10 points, 100 m) and N more spots;
- the card in priority order (Must have, Really want, Nice to have; Don't care hidden);
- Still unknown as agent questions, with failed loads kept apart;
- Full report holding the old sections;
- each person's grade at their best site (site-varying rows, the site checks, ties to the engine's rank);
- the Driveway row, on the steepest grade, with question 10's edges;
- §11's answers.
