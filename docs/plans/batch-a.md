# Batch A: the third fixture, data sources, scoring, sun (plan)

Status: **approved (owner, 2026-10-08), with the answers in §8.** A1 starts when this merges.

The owner's direction (2026-10-08, after #73): before Phase 1, a short batch of the follow-ups that change what a
screen finds or how it scores. In this order:

1. record the Grayson Mud Creek fixture;
2. data sources: follow-ups 23, 24, 25, 29;
3. scoring, as one reviewed change: 19, 27, 20;
4. sun: 37, 35.

Each group is its own PR, with a before/after table across all three fixtures. The data sources are two PRs
(owner, Q5). So the PRs are:

- **A1:** the Grayson fixture, `expected.json`, the CI guard and the engine stamp;
- **A2a:** 23 and 29;
- **A2b:** 24 and 25;
- **A3:** 19, 27 and 20;
- **A4:** 37 and 35.

Batch B (30, 21, 32, 33, 38) is UI only and can interleave. 28 and 36 go to Phase 1; 26, 31 and 34 go to Phase
2.5. The FEMA network-failure retry (#75, merged 2026-10-08) came first and changed no number on the success path.

Batch A is the first deliberate departure from the prototype's numbers. Until now every golden was the
prototype's own output; from group 2 on, the port's expected output and the prototype's differ on purpose, and
each difference has to be visible and explained. §1 is how.

## 1. Goldens after Phase 0: the prototype's stay frozen, the port's become `expected.json`

- **`golden.json` (the prototype's recording) is never edited again.** It stays the Phase 0 parity record.
- **New: `test/fixtures/<slug>/expected.json`**, the port's own output for every golden scenario, in the
  `ScreenResult` shape (no `fromPrototype` conversion). In A1 it is generated from the port and must equal the
  prototype golden under today's comparator, so it starts as a faithful copy.
- **Tests compare against `expected.json`:** the Vitest pipeline tests and the e2e comparator.
- **`scripts/expected.mts`** regenerates `expected.json` from the replayed fixtures, in Node. A PR that changes a
  number regenerates it, and CI fails if the committed file differs from a fresh run.
- **`scripts/before-after.mts`** runs every scenario on two checkouts (`main` and the branch, as `git worktree`s
  under `tmp/`). It prints:
  - the before/after table (below);
  - the full leaf diff: removed, added and changed paths, as in the memory's five-golden check.
- **`pnpm diff:prototype`** prints every difference between `expected.json` and the prototype golden. Drift from
  the prototype stays visible in one place, and each group's PR quotes it. Its last line is a summary with a
  hash of the whole output: `diff:prototype <hash>: <n> differences (ferney <a>, macks <b>, grayson <c>)`.

**The CI guard (owner, Q1):**

- `expected.json` may change only in a PR that declares a numbers change in its description and includes the
  `pnpm diff:prototype` output. Otherwise CI fails.
- **The rule.** A new `expected-guard` job runs on pull requests (`opened`, `synchronize`, `reopened` and
  `edited`, so fixing the description re-runs it). If any `test/fixtures/*/expected.json` was added or changed
  against the base, the description must contain both:
  - a line starting `Numbers change:`;
  - the exact summary line that `pnpm diff:prototype` prints on the PR's head.

  The hash makes a stale paste fail.
- **How it reads the description.** The body comes in through an environment variable, never interpolated into
  the script. The check is a small Node script (`scripts/expected-guard.mts`) with its own unit test.
- **A1 creates the files,** so its description carries the declaration too: "Numbers change: none —
  `expected.json` created, equal to the prototype goldens".

**The before/after table**, one column pair per fixture (Ferney, Macks, Grayson), one row per headline:

- acres;
- the verdict;
- sites: count, then #1's grade and score, then the top-3 order;
- Dec 21 direct sun, daylight, and Jun 21;
- sky mag;
- nearest public land: name, distance, adjoins;
- trailheads: count and nearest;
- the nearest grocer;
- the #1 driveway: length and cost;
- the flag count.

Below it, the leaf-diff counts per scenario.

## 2. A1: the Grayson fixture (no number changes)

- **The parcel:** Grayson Co. VA parcel 6273 (PTM 63-A-62, VGIN OBJECTID 1577504), off Mud Creek Rd near
  36.586, −81.560. It is the live screen of 2026-10-07 behind follow-ups 23–29.
- **Recording:** add it to `scripts/record-fixtures.mts` with a point inside its first part. Record it like the
  other two, by driving the **unmodified prototype** against the live services: a HAR plus `golden.json`. The
  scenarios are `run` and `evaluateSite2` (no house run; the other two parcels already cover it).
- **The prototype screens only the first part** (29.31 ac of 30.15). That is B7, with its note. The fixture
  keeps that; follow-up 29 changes it in A2.
- **The parity check:** the port's run on the Grayson replay against the prototype's golden, with today's
  comparator. Every difference is either a port bug (fixed in A1) or a proposed row in the intended-differences
  table (`phase-0-18-acceptance.md` §5), for the owner to approve. That makes this the port's first parity test on
  a parcel it wasn't built against.
- **`expected.json`** for all three fixtures (§1), the scripts and the CI guard.
- **The engine stamp** (§6), at version 1.
- **Grayson joins the Vitest pipeline tests** (`FIXTURE_SLUGS`). The e2e stays at two parcels, for its run time.
- **The port's own requests (A2a):** a request the prototype never made (the 16 km PAD-US query; everything for
  Grayson's two-part boundary) is recorded live once by `pnpm record:port` into `network-port.har`, beside the
  prototype's `network.har`, and replayed with it. The fixtures enter the screen as the app makes them: the
  county record from the HAR, through the recipe.
- **Acceptance:**
  - the Grayson parity check passes, or each difference is listed;
  - `expected.json` equals the prototype golden for all three;
  - the before/after table shows no change;
  - the guard fails a PR that changes `expected.json` without the declaration, and passes it with one. Shown by
    its unit test, and once on a throwaway branch, quoted in the PR.

## 3. A2: data sources, in two PRs: A2a (23, 29) and A2b (24, 25)

Each item is its own commit, with its own before/after rows. Ferney's and Macks's numbers may move here too, if
the fixes reach them; the table says which and why. Each PR bumps the engine version (§6).

### 23: PAD-US misses the Forest Service land

**Two causes are visible in the code; the PR confirms them on the Grayson replay before fixing either.**

- **The search radius.** `padusStep` asks `Fee_Managers_PADUS` for features within `padus.searchM` = 1,600 m of
  the parcel (proto L1101). Jefferson NF / Mount Rogers NRA at about 4.5 mi (7.2 km) can never come back. The
  NC Land and Water Fund agreement that was reported "112,947 ft away" must be a feature that *does* come within
  1.6 km somewhere.
- **The distance.** The distance is measured to the first ring of the first polygon (`firstLine(edge)`). For a
  multi-part feature, that gives a part far from the parcel.

**Proposed fix:**

- measure the distance to the nearest part of each feature;
- add a second, wider query for **open-access** land only (`Pub_Access` = OA). It reports "nearest public land"
  up to `padus.nearestOpenKm` = 16 km, about 10 mi (owner, Q7);
- keep the 1,600 m query for adjacency, unchanged.

**Number changes:** `padus.nearestOpenKm` is a new constant; `searchM` is unchanged. The config snapshot is
updated, and the PR says so.

**Text:** no new sentence. The existing "nearest public land" line gets a different value.

**Done in A2a (#80), with the owner's constraints (2026-10-08):**

- The 1,600 m query keeps full geometry. The "adjoins" flags and the within-a-mile list come only from it; the
  list filters by distance ≤ 1,600 m at render, and a test proves a beyond-a-mile unit never appears under that
  heading.
- The 16 km query (`padus.openSimplifyDeg` 0.0002°) feeds only one new line, appended after the section's
  caveat, exactly: "Nearest public land open to visitors beyond a mile: {name} ({manager}), {d} mi
  straight-line." It shows only when no open unit is within the mile and a wider one exists; older results show
  nothing. A unit found by both keeps the full-geometry copy. Where PAD-US lists one unit twice at the same
  distance, the line names the copy whose manager is known rather than "UNK".
- The wider query failing never fails the step: the mile's units and flags stand, and there's no line.
- Distance to the nearest part (all parts and rings): a value change under rule 4, declared in the PR.
- **Owner, #80 review (2026-10-08):** the line names the manager by PAD-US's local manager name (`Loc_Mang`) when it
  has one, else by the agency its code stands for (the service's own domain; USFS reads "U.S. Forest Service"),
  never a bare code. Then (same review): a federal unit by its agency; a state or local one by `Loc_Mang` when present,
  else its agency; and the within-a-mile list names its codes too (an approved exception to rule 7, phase-0.md §9.18).
- **When the wider query fails** (owner, #80 review): an info-level flag "The wider public-land search didn't
  respond." if v2 had an info level, with no schema change. **It doesn't** (`fatal`, `warn`, `good`), so by the
  owner's fallback this folds into **Phase 1's v3** (with the engine version and a trailhead source); until then a
  failed wider query shows nothing.
- **The acceptance's "about 4.5 mi" was an estimate:** Jefferson NF's nearest boundary is **2.26 mi** from the
  parcel, measured on its full, unsimplified geometry. The report says 2.3 mi.

**Acceptance (as written before A2a):** Grayson reports Jefferson NF / Mount Rogers NRA at about 4.5 mi. Ferney and Macks are unchanged,
unless the table explains why.

### 24: trailheads from the Forest Service and state parks

**Sources, checked 2026-10-08:**

| Source | Endpoint | CORS from production | Near Grayson | Terms |
|---|---|---|---|---|
| USFS recreation sites (INFRA) | `apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0`, `site_subtype = 'TRAILHEAD'` | yes (origin echoed) | Elk Garden A.T., Fox Creek A.T., Scales, Creek Junction, Green Cove | US federal data (public domain); the PR links the EDW terms page |
| VA state parks | VGIN `VA_Base_Layers/VA_Landmarks/FeatureServer/1`, `PlaceType = 'State Park Points'` | yes (origin echoed) | Grayson Highlands State Park | VGIN open data; the PR links its terms |
| NC state parks | NC DPR `NC_State_Parks_Points/FeatureServer/0` (ArcGIS Online) | yes (`*`) | New River State Park | a public AGOL item; the PR confirms its licence |
| TN state parks | not found yet | — | — | **the PR finds one, or TN stays OSM-only and says so** |

**How they combine:**

- They are merged with the OSM trailheads. **De-duplication (owner, Q7):** two points are the same trailhead only
  if they are within `near.trailheadDedupeM` = 300 m **and** their names match after normalisation. Otherwise
  both are kept.
  - **Normalisation:** lower case; punctuation removed; the words "trailhead", "TH" and "parking" stripped;
    spaces collapsed. For example, "Elk Garden A.T." and "ELK GARDEN A.T. Trailhead" both become "elk garden at".
  - **Of a matched pair,** the official source's point is kept (USFS, then the state's, then OSM's).
  - A unit test covers the pairs: same name near, same name far, different names near, and an unnamed OSM point.
- A state park point is the park's address point, not necessarily a trailhead. It is listed as the park, e.g.
  "Grayson Highlands State Park".
- The endpoints go in `DEFAULT_ENDPOINTS`, so **endpoints `_v` 11 → 12**. Saved endpoint JSON at version 11 is
  replaced by the defaults on load, as today, with its message.

**Schema:** a trailhead keeps today's shape (no source field), so schema v2 is untouched. **A trailhead source
goes in v3** (owner, Q4; §6).

**Text (rule 7, this plan's paragraph):**

- The caveat "trailhead counts undercount national forest access" stays word for word.
- Proposed appended sentence: "Forest Service trailheads and state parks are included too."
- No other sentence changes.

**Acceptance:** Grayson lists Elk Garden and Grayson Highlands within 7 mi. Ferney's and Macks's counts move only
by trailheads the new sources add, and the table lists them.

**Done in A2b (#81, 2026-10-08):**
- Sources as planned, and Tennessee found: TDEC's "TN State Parks Points" (69 parks; only `PARK_NAME` is asked for,
  never the layer's staff contact fields). Endpoints `_v` 12 (`usfsRecSites`, `stateParks`).
- De-duplication by the owner's rule (within 300 m AND names match after normalisation; else both kept); of a
  matched pair the official point (USFS, state, OSM).
- **Grayson: 9 trailheads**, Grayson Highlands State Park at 4.9 mi and Elk Garden A.T. at 5.3 mi (acceptance met).
- **Not only the new sources moved the counts:** OSM's trailheads came from Photon's text search for "trailhead",
  which finds only places named so. Asked by tag instead (the same fix as 25), Macks gains three OSM trailheads
  (Heritage Park, Cool Springs, Dora Highway Park) besides Claytor Lake State Park: 1 → 4.
- **The parking-lot routing (#76):** no drive time goes to a trailhead today (only hospitals, groceries and the
  airports), so there's nothing to route yet. A "nearest trailhead" drive time would be new report text, which
  needs the owner's approval first (rule 7): proposed in the PR, not built.

### 25: groceries reported as none

**First the cause, on the Grayson replay.** Photon is asked for `shop:supermarket` in a 40 km bbox, limit 40, with
Overpass as the fallback. Lansing and West Jefferson have groceries. Candidates:

- Photon's ranking or limit;
- the tag (a store tagged `shop=grocery`, or a general store);
- the bbox.

**The fix** follows the cause. Any number change (`near.groceryKm`, `photonLimit`) is said in the PR.

**"No data" vs "none" (rule 7):**

- Today an empty answer renders "none in OSM".
- **Owner, Q3:** keep it word for word, and append, as its own line in the same cell: "OpenStreetMap is
  incomplete in rural areas, so this isn't proof there are none."

**Acceptance:** Grayson finds a grocer in Lansing or West Jefferson, and an empty answer renders "none in OSM",
then that sentence.

**Done in A2b (#81, 2026-10-08). The cause:** Photon's forward search matches its query text against names, so
`q=supermarket` found "Slaughters' Supermarket" and never a Food Lion or Ingles; on Grayson it found none.
Photon's reverse geocoder, filtered by the tag within `near.groceryKm`, returns every supermarket nearest first.
**Grayson: Lansing Foods, 6.7 mi** (acceptance met), and five more in Jefferson and West Jefferson. Because the
prototype's "nearest real grocery" drive time prefers the chains it now finds, that drive time moves too: Ferney
Food Lion 16 min (was Slaughters' 14), Macks Walmart Supercenter 61 min (was Slaughters' 42), Grayson Food Lion
38 min. The hospital search (`q=hospital`) has the same flaw; left for a follow-up the owner can number.

### 29: every part of a multi-part parcel

- A county record that is a MultiPolygon becomes a **recipe** of its parts, combined by 13b's rules:
  - parts within `combine.maxGapM` (30 m) are bridged;
  - the strip between them is left out of the acres.
- **Grayson 6273:** 29.31 ac + 0.84 ac, 12.1 m apart, screens as **30.15 ac** with the strip bridged.
- **Parts farther apart** keep today's note (in the parcel facts, `ParcelFacts.tsx`), with the acreage appended:
  "Multi-part parcel: only the first part screened. 0.84 ac in 1 other part not screened."
  The existing sentence is kept word for word.
- When every part is screened, the note no longer applies and isn't shown. That's a condition, not a text
  change.

**Acceptance:** Grayson screens as 30.15 ac; a synthetic far-apart MultiPolygon shows the appended acreage.

**Done in A2a (#80), with the owner's addition (2026-10-08):** besides the own-land acres, the bridged strip is
left out of the parcel's inside mask for site finding, gardens, shelves and the suitability surface (and the
terrain stats and the house check, so "of N acres" agrees). Only the driveway router keeps the whole outline, for
connectivity. A synthetic test with a flat strip between two steep parts finds a house site in the strip on the
outline, and nothing on the own land. The screen gets the own land as `ScreenInput.ownLand`; a county record
keeps its parts (`ParcelRecord.parts`), and records saved before keep the first-part note.

**Found in A2a:** Grayson's second part (0.84 ac, along Mud Creek) is frequently flooded bottomland with 0.47 ac
of FEMA zone A; screening it adds those two flags. None of it is on the strip.

**Owner, #80 review (2026-10-08):** the flood, soils and public-land steps measure the own land too (the queries
send the parts; SDA gets a MULTIPOLYGON). Only the driveway router and the outline keep the whole shape.

## 4. A3: scoring, one reviewed change (19, 27, 20)

**This group changes rankings, so it goes in two stages within one PR.**

1. **The analysis first,** as a draft PR with no code: the three fixtures ranked under today's weights and under
   two or three candidates. For each:
   - site order, grades, scores;
   - each #1's driveway length and cost;
   - the Grayson case behind 27: a 0.24 ac shelf with 1,155 ft of switchbacks ranked above a 1.3 ac bench with a
     617 ft driveway.

   The candidates:
   - **19:** aspect 160° → 165° (as written).
   - **27:** the quality/cost split (70/30) and how driveway length and grade enter cost. For example: cost from
     the routed length and the over-limit stretches rather than straight-line grade; or a floor on a site's area
     before it can rank first.

   The owner picks.
2. **Then the code:**
   - the chosen weights in `config.ts`;
   - the engine version bumped (§6);
   - **20:** the garden soil adjustment moved out of the bench-vetting block, with a synthetic test (a parcel with
     gardens and no house site). Neither recorded parcel lacks a house site, so likely no golden moves;
   - `expected.json` regenerated;
   - the config snapshot updated;
   - the before/after table and the full leaf diff.

**Text:** no sentence changes. Grades and values move inside unchanged sentences. That is rule 4 (numbers), not
rule 7. 20 adds soil notes to gardens where none showed before; that is additive.

## 5. A4: sun (37, 35)

### 37: daylight by the standard sunrise and sunset

- The report's daylight hours (`decDaylightH`, `junDaylightH`, and "of N daylight hours") switch to the viewer's
  definition: −0.833° with the equation of time (`lib/render/sunclock.ts`, which moves to `lib/screen` since the
  engine now needs it; it is DOM-free).
- Ferney's Dec 21 goes from 9.5 h (569 min) to about 9.6 h (9 h 37 min).
- **Direct-sun hours stay unchanged** (owner, Q6). They compare the sun's geometric altitude with the skyline
  plus the 3° canopy.
- **The PR reports the measured delta on all three fixtures:** Dec 21 and Jun 21 direct-sun hours, as computed
  and with the sun's apparent (refracted) altitude. That shows what the choice leaves out.

### 35: horizon every 1°

- `sun.horizonStepDeg` 5 → 1, so the horizon has 360 samples.
- `sun.profile` is stored as [azimuth, angle] pairs, so its shape is unchanged and schema v2 still holds.
- Every reader must use the pairs' azimuths, not an index × 5°. The PR checks each reader (the fan, the chart,
  the ground viewer, `evaluateAt`), so a kept 5° result still renders.
- **Cost:** the horizon is 5× the rays. The PR measures the sun step on Macks (the largest), and the run's longest
  synchronous block against #74's 60 s silence rule. If it is too slow, it proposes 2°.

**The engine version** is bumped (§6).

**Acceptance:**
- the report's daylight equals the viewer's sunset − sunrise within a minute on all three fixtures;
- the direct-sun delta table is in the PR;
- `expected.json` is regenerated, with the table and the leaf diff;
- the viewer's ridges and the report's line agree at 1°.

## 6. The engine version on kept results (owner, Q2)

History keeps v2 results in IndexedDB, and screens are immutable. A kept result shows the numbers it was computed
with, so History has to say when those came from earlier rules.

- **`ENGINE_VERSION`:**
  - in `lib/screen/engine.ts`, a plain integer, so `lib/screen` stays DOM-free;
  - **1 is Phase 0's rules;**
  - **A2a, A2b, A3 and A4 each bump it,** to 2, 3, 4 and 5.
  - A1 introduces it at 1 and doesn't bump it: it changes no number, so nothing kept from Phase 0 is marked. If
    you want A1 to bump it too, it's one line.
- **On the record envelope, not in `ScreenResult`:**
  - `ScreenRecord` (`lib/client/screenStore.ts`) gains `engine: number`, so schema v2 stays frozen;
  - a record without it counts as 1;
  - new screens are stamped with the current version;
  - export and import (16b) carry it, since they use the same record schema; an older file without it imports as 1.
- **History:** an entry whose `engine` is below the current version shows "Screened with earlier rules — run again
  for current results". *Proposed:* the same line shows on that result when it's reopened, beside the existing
  "earlier settings" note. Say if you want it in History only.
- **Phase 1:** the import into Supabase carries `engine` into a field of v3's `ScreenResult`.

**Carried to v3 (Phase 1):** the engine version (from the envelope) and a trailhead source (Q4); and a record that
the wider public-land search didn't respond, so the section can say so (owner, #80 review, 2026-10-08).

## 7. Batch B (interleaved, UI only)

- **30:** the fan tooltip shows the canopy term. Proposed, appended so rule 7 holds even if tooltips count as
  report text: "120° (ESE): skyline 1.2° up, sun 2.9° — blocked (with the 3° canopy allowance)".
- **21:** snapping a new custom parcel to county outlines (full-detail geometry).
- **32:** time-of-day hillshade.
- **33:** the moon.
- **38:** the PMTiles fallback.

Each is its own PR, with no golden or `expected.json` change.

## 8. Decisions (owner, 2026-10-08)

1. **Goldens:** `golden.json` is frozen, and tests compare against `expected.json`. Add a CI guard:
   `expected.json` may change only in a PR whose description declares a numbers change and includes the
   `pnpm diff:prototype` output; otherwise CI fails (§1).
2. **Kept results:** not deferred. Stamp an engine version now on the IndexedDB record envelope (not inside
   `ScreenResult`, so v2 stays frozen). History shows "Screened with earlier rules — run again for current
   results" for older entries. Phase 1's import carries it into the v3 field. Every Batch A PR that changes rules
   bumps it (§6).
3. **25's wording:** append "OpenStreetMap is incomplete in rural areas, so this isn't proof there are none."
4. **24's source:** agreed, no source field in v2; a trailhead source is added in v3.
5. **A2:** two PRs, A2a (23, 29) and A2b (24, 25).
6. **37's direct-sun hours:** unchanged, and A4 reports the measured direct-sun delta on all three fixtures.
7. **23's open-access search:** 16 km. **24's de-duplication:** within 300 m **and** names match after
   normalisation (case, punctuation, "trailhead" / "TH" / "parking" stripped); otherwise both are kept.

## 9. Checks for every Batch A PR

- typecheck, lint, format, Vitest and e2e: green;
- `expected.json` equals a fresh `scripts/expected.mts` run, and the guard passes: the description declares the
  numbers change and carries the `diff:prototype` summary line;
- the engine version is bumped (from A2a on);
- the before/after table and the leaf diff are in the PR, with every moved number explained;
- the config snapshot is updated where a constant changed, and the PR names it;
- `pnpm diff:prototype` is quoted;
- report text is append-only (rule 7), and the new sentences are listed;
- `phase-0.md` §6 rows are marked "done in Batch A (#n)" as each lands.
