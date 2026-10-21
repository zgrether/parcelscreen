# Step 10: Cost to enjoy

Written 2026-10-21 under mission mode (`CLAUDE.md`). Zach pre-approved the brief and this plan's recommended answers
(§9). The step runs straight through on `step/10-cost-to-enjoy`: this plan is PR 0 into the step branch, and Zach
reviews it with the hand-back. The stop conditions are in §10.

Sources:
- PLAN.md row 10 and its standing decision (line 26: "cost to camp and cost to build, driven by the parcel's state;
  phasing isn't asked");
- `docs/plans/value-ranking.md` §4 (VR4);
- `docs/plans/parcel-workflow.md` §3.1 (markers) and §3.3 (WF7, a line's cost by its condition);
- phase-0.md §9.25, §9.29, §9.44 and follow-up 47;
- Zach's brief of 2026-10-21. There will be no builder quote: every rate is a published range.

**The goal:** two numbers on every graded parcel, each a range from published sources, and each graded against the
budgets the person gave in the interview:
- **Ready to camp, all in:** the land, a legal way in, a 4x4 track to a clearing, and a small campsite.
- **Ready to build, all in, everything but the house:** camp, plus a finished driveway, well, septic, power, the house
  site's clearing and the pad.

Done when:
- **Settings → Costs** holds every rate, low and high, each with its source and date checked, editable, with Reset to
  defaults.
- The two costs show in Grade after the answer, and a tap opens the breakdown. They also show on One page, in Full,
  in Compare, and as Favorites' "Cost to build" sort and column.
- Things you've drawn or marked lower them: an existing track or drive by its condition, a Clearing, a Well or a
  Spring, a Septic permit's class, and a Power mark.
- With budgets from the interview, they're graded: two Musts when "Over budget" is a walk-away, else one graded row,
  "Within budget".
- **No engine, `expected.json` or ScreenResult schema change.** Everything is computed at display time from the
  stored screen, the drawn lines and marks, and the listing price.

## 0. What's there today (found while planning)

- **The card's "Cost to enjoy" row** is a pending placeholder ("Not priced yet."), and Compare's cost rows read "not
  yet". The report export left slots for both (step 9).
- **The engine prices the driveway** with Settings' point rates (`UserConfig.dw`: earthwork, stone, culverts, clearing,
  entrance, erosion, mobilize), shown ±30% in the Driveway section. Its pioneer-track estimate is `Route.track`. Both
  are engine output, and stay as they are.
- **The interview** keeps `land.campBudget` and `land.buildBudget` (question 13) and an "Over budget" walk-away chip
  (14a). It only notes them: they never reach the rubric.
- **Septic class** is derived per site (`lib/report/derived.ts` `septicClass`: Conventional, Modified, Alternative). A
  Septic permit mark carries a typed class (`septicClass`).
- **Lines** have a condition (uncleared, pioneer, improved, paved; defaults: easement uncleared, track pioneer, drive
  improved). The screen doesn't read it. **Marks:** spring, well, septic, building, power, campsite, gate and note
  points; septic and clearing areas.
- **There's no canopy or power data** in the screen. `dw.woodedPct` (100%) is the only wooded assumption.

## 1. The rates (PR 1: research first)

`lib/config/costs.ts` holds every rate as `{ low, high, unit, source, url, sourceDate, checked, regional, note }`.
Every number the costs show comes from these.

The research was done in this session on 2026-10-21; each source was opened.
- **No builder quotes.** Nor did any extension service or health department publish current dollar figures for septic,
  driveways or clearing.
- **The regional figures** come from:
  - NRCS Tennessee's FY2026 EQIP payment schedule. These are payment rates at 75% of typical cost, so the cost is the
    rate ÷ 0.75 (our derivation, labelled).
  - Appalachian Power's Virginia tariff.
  - Two western-NC contractors' published price guides.
  - A Virginia builder's guide.
  - Co-op fee schedules.
- **National guides** fill the gaps, labelled "national".

| Key | Rate | Unit | Low | High | Source (date) | Regional? | Note |
|---|---|---|---|---|---|---|---|
| `driveway.new` | Gravel driveway, new | $/ft | 24 | 84 | gradinglands.com, "Driveway Grading & Gravel in WNC" (2026) | NC mountains | $2–4/sq ft gentle, $4–7 steep, × 12 ft wide (×12 ours). Cross-checks: HomeGuide $48–120/ft (national); Black Rabbit Construction (WNC, Apr 2026) $71–150/ft per job |
| `driveway.upgrade.improved` | Bring an improved (graveled) drive to standard | $/ft | 5 | 12 | NRCS TN FY2026 EQIP 560 (gravel) + 655 (shaping), ÷ 0.75 (2026-03) | TN | Regrade and 2–4 in of gravel, 12 ft. Our derivation |
| `driveway.upgrade.pioneer` | Bring a pioneer track to standard | $/ft | 14 | 25 | same | TN | 6–8 in of base and surface, and shaping. Our derivation |
| `driveway.upgrade.uncleared` | Bring an uncleared line to standard | $/ft | 21 | 84 | same, up to gradinglands' new rate | TN, NC | About a new build. Our derivation |
| `driveway.paving` | Paving where the grade passes 12% | $/ft | 30 | 84 | Fixr, "Concrete Driveway Cost" (Jan 2025; two 2.5 ft strips at $6–12/sq ft); McMahon Custom Homes, VA (Oct 2025; asphalt $3–7/sq ft × 12 ft) | national; VA | Strips at the low end, full-width asphalt at the high |
| `track.pioneer` | Pioneer track (cleared, graded, 4x4) | $/ft | 5 | 18 | NRCS TN FY2026 EQIP 655 Forest Trails and Landings, ÷ 0.75 | TN | $5.27 gentle to $17.84 steep (rounded) |
| `culvert` | Driveway culvert, installed | each | 1,200 | 6,000 | gradinglands.com, "Culvert Installation Cost in NC" (2026) | NC | 12–24 in pipe. NRCS 578 cross-check $2.2k–4.6k |
| `well.depthFt` | Typical Blue Ridge well depth | ft | 150 | 400 | USGS WRI 00-4270, New River basin (2001); VCE Household Water Quality, Carroll Co. 2011–17 | VA, NC | "Sometimes past 500 ft". We price 150–400 ft |
| `well.perFt` | Drilled well, complete (drilling, casing, pump) | $/ft | 30 | 80 | HomeGuide, "Well Drilling Cost" (2026) | national | So $4.5k–32k at 150–400 ft. Cross-checks: Black Rabbit (WNC) $8k–20k+; This Old House $25–65/ft drilling |
| `well.pump` | Pump and line for an existing well or a spring | $ | 400 | 2,500 | HomeGuide, pump (2026) | national | No published spring-development figure, so a spring is priced the same (labelled) |
| `septic.conventional` | Septic, conventional | $ | 3,500 | 15,000 | HomeGuide (2026); McMahon (VA, Oct 2025) | national; VA | Black Rabbit (WNC) says $15k–40k |
| `septic.modified` | Septic, modified (low-pressure, shallow) | $ | 7,000 | 20,000 | NC State Extension, "Investigate Before You Invest" (Apr 2025: low-pressure pipe "may cost twice as much"); HomeGuide drip $6.5k–15k | NC ratio; national | Our derivation |
| `septic.alternative` | Septic, alternative (mound, ATU, drip) | $ | 15,000 | 55,000 | HomeGuide (2026); McMahon (VA, Oct 2025) | national; VA | Black Rabbit (WNC) $40k–80k+ |
| `power.perFt` | Overhead line from the road or a pole | $/ft | 0 | 15 | Appalachian Power, VA SCC Tariff No. 28 (eff. Jan 2025: first 1,000 ft free for a year-round home); HomeGuide, "Cost to Run Power" ($5–15/ft, 2026) | VA; national | Neither Blue Ridge Energy nor Mountain Electric publishes a per-foot charge |
| `power.hookup` | Service: meter base and co-op fees | $ | 575 | 2,500 | Blue Ridge Energy, New Service Checklist ($75 meter set); Mountain Electric, Deposits & Fees ($25 + $5 + $350); HomeGuide meter box ($500–2,100) | NC, TN; national | Sum ours |
| `clearing` | Land clearing, wooded, steep | $/ac | 2,500 | 8,500 | gradinglands.com, "Land Clearing Cost per Acre" (2026) | NC | NRCS 500 cross-check ≈ $2.5k/ac |
| `pad.flat` / `pad.sloped` / `pad.steep` | House pad and site prep | $ per site | 6,500–11,000 · 11,000–18,000 · 18,000–35,000 | | gradinglands.com, "Building Pad Cost in NC" (2026) | NC | By the site's slope: under 4°, 4–10°, over 10° |
| `easement.legal` | Recorded access easement: attorney, survey and plat, recording | $ | 3,200 | 11,000 | LegalClarity (Apr 2026); VA Code §17.1-275, NC GS 161-10, Cocke Co. TN register of deeds (recording fees) | national; statutory | Excludes any payment to the neighbour |

**The two assumed areas (ours, labelled):**
- a small campsite: 0.1 ac cleared;
- the house site: 0.5 ac (house, yard and septic field).

**The existing driveway rates** (`UserConfig.dw`) move into Settings → Costs as their own group, "The screen's
driveway estimate". They're unchanged point values: changing them would change `expected.json`. They still feed the
Driveway section's engineering estimate (±30%), which stays as it is. The cost to enjoy uses the published per-foot
ranges above. The breakdown says how the two relate (§8).

**Editable** in Settings → Costs (low and high each, low ≤ high), kept in a new profile document `ps.costs` (overrides
only, synced with the profile like `ps.cfg`). `ps.costs` isn't part of a run's inputs, so changing a rate never asks
for a re-grade. **Reset to defaults** clears the overrides.

## 2. The two costs (PR 2)

`lib/report/cost.ts` is pure: from the stored result, the viewer's best site, the parcel's lines and marks, its asking
price and the rates, it returns each cost's items.

| Field | What it holds |
|---|---|
| item | the label (§8) |
| quantity | with its unit |
| rate range | low–high |
| source | name and date |
| total | low–high |
| lower it | what would lower it (§8) |

**The route:** the scored route to the best site (`scoredRoute`, or the household's chosen line, WF5). It's split by
what lies along it: within 15 m of a drawn line, the line's condition counts, and the rest is new ground. That's
computed at display from the route's and the lines' geometry.

**Ready to camp, all in:**
1. **The land:** the asking price. With none, the cost says "plus the land", and its grade is unknown.
2. **A legal way in:** `easement.legal`, only when the scored route needs an easement and no drawn easement has
   "recorded in" filled.
3. **A pioneer track,** from the entrance to the camp:
   - the camp is a Campsite mark if there is one, else the best site;
   - for a Campsite, the route's length to its nearest point, plus the straight distance from there to the mark, × 1.2
     for a track's turns (ours, labelled);
   - new ground and uncleared lines cost `track.pioneer` per ft;
   - pioneer, improved and paved lines are access in place: $0.
4. **Clearing a small campsite:** 0.1 ac × `clearing`. It's $0 when the camp sits in a Clearing mark.

**Ready to build, all in, everything but the house:** the camp's items, plus:
1. **A finished driveway on the scored route,** crediting the pioneer track already built:
   - new ground, uncleared and pioneer lengths at `driveway.upgrade.pioneer` (the camp's track is in place);
   - improved lengths at `driveway.upgrade.improved`;
   - paved lengths at $0.
   - Plus paving where the 30 m grade passes 12% (`paveAbovePct`; the Driveway section's own "~N ft to pave"), at
     `driveway.paving`, less any paved line there.
   - Plus the route's culverts × `culvert`.
2. **Well:** `well.depthFt` × `well.perFt`; or `well.pump` when a Well or Spring mark lies within 500 ft of the site.
3. **Septic:** at the best site's class (its soil's), or the class typed on a Septic permit mark within 500 ft.
4. **Power:** from a Power mark if there is one, else from the nearest road with the note "assumes power along the
   road".
   - The distance is from the mark, or the route's entrance, to the site, straight.
   - It's priced at `power.perFt` + `power.hookup`.
5. **Clearing the house site:** 0.5 ac × `clearing`, or $0 when the site sits in a Clearing mark.
6. **The pad:** by the best site's slope (`pad.flat`, `pad.sloped` or `pad.steep`).

**Totals:**
- **low = Σ lows, high = Σ highs,** never a single figure. Rounded to $1k under $100k and $5k above.
- A marked house (the build site the person chose) is used in place of the best site.
- A parcel with no route (no practical drive) says so, and its costs are unknown.

## 3. Grading against the interview's budgets (PR 3)

The budgets join the rubric. `Rubric.budgets: { camp: number | null; build: number | null }` is optional and defaults
to none, so saved rubrics read as before. The interview sets them from question 13 when it makes the list. A new
factor, **`budget`**, is a row key.
- **"Over budget" marked in 14a, and a budget given:** a Must, "Within budget". It's computed as the worse of the two
  budgets' statuses:
  - pass: the cost's high end ≤ the budget;
  - warn ("check first"): the range straddles it;
  - fail: the low end > the budget;
  - unknown: no asking price.

  A fail makes the parcel Not for us, as any Must does. A warn counts as a warning.
- **Otherwise, with a budget given:** a ranked card, "Within budget", added at the end of Really want. Its letter is the
  worse of the two budgets' letters, by the high end as a share of the budget:
  - A ≤ 80%;
  - B ≤ 100%;
  - C ≤ 115%;
  - D ≤ 130%;
  - F above.

  The cutoffs live in `config.ts` `card.budgetBands` (rule 4). With no asking price, the row is ungraded (null) and
  left out of the parcel grade, as any ungraded row is.
- **No budget:** no row. The costs still show.
- **What matters** shows the card ("Within budget: ready to camp under $250k, ready to build under $300k") with "Change
  them in the questions" (the budgets are question 13's answers). It moves between tiers like any card.
- **Existing rubrics:** no converter (clean breaks, CLAUDE.md). A rubric gets the card when the interview makes the list
  again ("Reset to my answers" or answering again).
- **The declared grade change:** in the hand-back, a before/after table for the fixtures under a test rubric with both
  budgets set ($250k camp, $300k build). Mud Creek is at its listing price, $185k; the others have no price, so the row
  is unknown and their grades don't move.

**ENGINE_VERSION isn't bumped** (§9 Q7). §9.44 counts the card's rows as engine code, and a change to one needs a bump.
Here no existing row or gate changes: the new row appears only in rubrics that carry budgets. The default rubric's
cards, the `cards-v7.json` guard, are unchanged, and a test checks it.

## 4. Where it shows (PR 4)

- **Grade:** a "Cost to enjoy" section after the answer, two lines:
  - "Ready to camp: $210–245k ✓ under your $250k";
  - "Ready to build: $290–340k ! straddles your $300k".

  The mark and words come from the budget's status. Without a budget, just the range. Without a price, "$25–60k plus the
  land". The card's pending "Cost to enjoy" row goes: the section replaces it.
- **The breakdown** (a tap on either line opens the card panel, `cost`):
  - each item with its quantity, its rate range, and its source and date;
  - each line's "what would lower it" (§8);
  - it ends with "Published ranges, not a quote."
  - The panel's "How it's scored" states the bands, or the Must's rule.
- **Favorites:** a "Cost to build" column (shown when a row has a cost, polish #12's rule) and sort, cheapest first.
- **Compare:** Compare's stage rows are replaced by the two costs ("Ready to camp", "Ready to build"), each marked best
  and worst. The Budget row becomes the viewer's two budgets.
- **The report export:** both lines on One page (after the grades), and the breakdown in Full, a new "Cost to enjoy"
  section after "Access and driveway". Step 9's "nothing for step 10" comment goes.
- **Settings → Costs:**
  - every rate, low and high, with its source (name, date, a link) and unit;
  - grouped: Driveway and track, Water and septic, Power, Clearing and pad, Legal;
  - "The screen's driveway estimate" group holds `dw` as before;
  - Reset to defaults.

## 5. Text and numbers

- New strings only, listed in §8. The rows' and blocks' existing text is unchanged (rule 7).
- Every dollar figure is a range. The breakdown ends with "Published ranges, not a quote."
- **Numbers change only through the new budget row** (declared, §3). `expected.json` and the goldens don't change, and
  the expected-guard stays green.

## 6. UX

- **The main task:**
  - Open a parcel, and the two lines sit under the answer, with their marks.
  - Tap one for the breakdown.
  - To lower a cost, draw or mark (Details' + Mark). The lines update at once.
- **What you see first:** the two ranges and how they sit against your budgets. The items come on demand.
- **States:**
  - no price: "plus the land", grade unknown;
  - no budget: the range alone;
  - no route: "No practical drive: the costs need a way in";
  - the screen still running: the section waits, like the rest of the card.
- **Plain labels:** Ready to camp, Ready to build, Within budget, Published ranges, not a quote.
- **The phone at 375 px:**
  - the two lines wrap under each other, with 44 px tap targets;
  - the breakdown is the card panel's sheet, each item a two-line row (label and range; quantity × rate, source);
  - Settings → Costs is one rate per row, with low and high side by side.
- **Contrast and consistency:** the marks (✓ ! ✗ ?) and words as the Must rows use them, and nothing on colour alone.
  Settings reuses its grid and validation messages.

## 7. Settings validation

Each low and high is ≥ 0, and low ≤ high (`MIN_MAX_PAIRS`). A bad field is named and nothing is saved, as Settings
already does.

## 8. New strings

- Cost to enjoy · Ready to camp · Ready to build · all in · everything but the house · plus the land · Within budget ·
  under your {$} · straddles your {$} · over your {$} · No practical drive: the costs need a way in
- The items:
  - The land
  - A legal way in (easement)
  - Pioneer track, entrance to camp
  - Clearing a campsite (0.1 ac)
  - Finished driveway (the track upgraded)
  - Paving over 12%
  - Culverts
  - Well (150–400 ft)
  - Pump and line (your well or spring)
  - Septic, {class}
  - Power, {ft} ft from {the road | your power mark}
  - Service hookup
  - Clearing the house site (0.5 ac)
  - House pad, {flat | sloped | steep}
- The notes:
  - assumes power along the road
  - priced as a pump and line (no published spring figure)
  - our derivation from {source}
  - national guide
- What would lower it:
  - Draw an existing track or drive along the route.
  - Mark a clearing at the camp or the house site.
  - Mark a well or a spring near the site.
  - Mark a septic permit with its class.
  - Mark a power pole near the site.
  - Record the easement (its "recorded in").
- The breakdown's note: "The Driveway section's estimate prices earthwork and stone at Settings' driveway rates; these
  costs use published per-foot ranges." · Published ranges, not a quote.
- Settings: Costs · Low · High · Source · Checked {date} · The screen's driveway estimate · Reset to defaults (existing)
- Favorites and Compare: Cost to build · Ready to camp · Ready to build
- What matters: Within budget · ready to camp under {$} · ready to build under {$} · Change them in the questions

## 9. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **The cost to enjoy's driveway:** published per-foot ranges, not the engine's point-rate estimate (recommended: it's
   what the brief researched, and every number gets a source). The Driveway section keeps its own estimate (engine
   output), and the breakdown says how the two differ.
2. **`UserConfig.dw` stays** as the engine's input, with unchanged values, shown in Settings → Costs as its own group
   (recommended: changing it changes `expected.json`).
3. **The rates' overrides:** a new synced profile document `ps.costs`, not part of a run's inputs (recommended: editing
   a rate never asks to re-grade).
4. **Lines along the route:** within 15 m of a drawn line counts as on it (recommended).
5. **Assumed areas:** a 0.1 ac campsite and a 0.5 ac house site, labelled as ours (recommended).
6. **Power's distance:** straight from the Power mark, or from the route's entrance on the road, to the site
   (recommended).
7. **No ENGINE_VERSION bump** (recommended, §3: no existing derivation changes, and a test proves it).
8. **One row or two:** one "Within budget" row, or Must, from the worse of the two budgets, with the two lines showing
   each (recommended).
9. **The row's tier:** the end of Really want when the interview adds it (recommended: Zach's brief makes budget a
   real factor, not an afterthought).
10. **Existing rubrics:** no backfill, just the interview again (recommended: clean breaks).
11. **Rounding:** to $1k under $100k and $5k above (recommended: a range of $210–245k reads; $211,345 doesn't).
12. **The budgets' edit:** in the questions, not on the card (recommended: one place for them).

## 10. Stop conditions (push what's there, say why, wait)

- `expected.json`, the goldens or ScreenResult's schema would change.
- An existing row's, gate's or verdict's text would change beyond §8.
- The default rubric's cards would change (the `cards-v7.json` guard).
- A rate has no published source at all.
- A product decision outside this brief and §9.
- The same CI failure surviving three attempts.
- The plan turning out wrong.

## 11. Setup

None from Zach.

## 12. The PRs, into `step/10-cost-to-enjoy`

| PR | What | Checks |
| --- | --- | --- |
| 0 | This plan. | docs |
| 1 | **The rates:** `lib/config/costs.ts` (§1's table, each with source, URL and dates); `ps.costs` overrides; Settings → Costs (groups, low and high, sources, Reset); `dw` shown as its group. | unit: every rate has low ≤ high, a source and dates; overrides merge; validation |
| 2 | **The costs:** `lib/report/cost.ts`: the route split by drawn lines, the camp and build items, the marks' effects, totals and rounding. | unit: each fixture's two costs; each mark and line lowering them; no price; no route |
| 3 | **The grade:** `Rubric.budgets`, the `budget` factor (Must or row), the cutoffs in config, the interview making it, What matters' card, and the before/after table. | unit: pass/warn/fail/unknown, the bands, the default rubric unchanged (`cards-v7.json`), the interview's rubric |
| 4 | **The surfaces, the screenshots, the fresh-eyes review, the docs and the hand-back:** Grade's section and breakdown panel; Favorites' column and sort; Compare's rows; One page and Full; screenshots at 1280 and 375; REQUIREMENTS; phase-0.md §9.63; PLAN.md row 10. | e2e: the lines, the breakdown, a Power mark and a track lowering costs, no price, a rate change flowing through, One page; full CI |

## 13. Test plan outline

**CI:**
- unit tests for the rates, the costs and the grade;
- e2e on Mud Creek with its price: the two lines, the breakdown, a drawn pioneer track lowering the camp cost, a Power
  mark changing the build cost, no price → "plus the land", a Settings rate flowing through, One page showing both.

**Manual, on the preview:**
- Mud Creek with its listing price ($185k) and Zach-style budgets;
- draw the red-gate line as a pioneer track, and watch the camp cost drop;
- add a Power mark near the road, and watch the build cost change;
- remove the price, and see "plus the land";
- change a rate in Settings, and see it flow through;
- check that One page shows both lines.

## 14. Decision to record

**§9.63 Cost to enjoy:**
- the two costs at display time from published ranges (`lib/config/costs.ts`, sources and dates; `ps.costs`
  overrides);
- the items and the marks' and lines' effects;
- the budgets in the rubric, as a Must ("Over budget" walk-away) or the "Within budget" row with its bands;
- where it shows;
- `dw` unchanged as the engine's input;
- no ENGINE_VERSION bump;
- §9's answers.
