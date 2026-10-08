# Batch A: the third fixture, data sources, scoring, sun (plan)

Status: **proposed (2026-10-08), for the owner's approval.** No code until it's approved.

The owner's direction (2026-10-08, after #73): before Phase 1, a short batch of the follow-ups that change what a
screen finds or how it scores. In this order:

1. record the Grayson Mud Creek fixture;
2. data sources: follow-ups 23, 24, 25, 29;
3. scoring, as one reviewed change: 19, 27, 20;
4. sun: 37, 35.

Each group is its own PR, with a before/after table across all three fixtures. Batch B (30, 21, 32, 33, 38) is UI
only and can interleave. 28 and 36 go to Phase 1; 26, 31 and 34 go to Phase 2.5. The FEMA network-failure retry
(#75) lands before Batch A and changes no number on the success path.

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
  the prototype stays visible in one place, and each group's PR quotes it.

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
- **`expected.json`** for all three fixtures (§1), and the scripts.
- **Grayson joins the Vitest pipeline tests** (`FIXTURE_SLUGS`). The e2e stays at two parcels, for its run time.
- **Acceptance:**
  - the Grayson parity check passes, or each difference is listed;
  - `expected.json` equals the prototype golden for all three;
  - the before/after table shows no change.

## 3. A2: data sources (23, 24, 25, 29)

Each item is its own commit, with its own before/after rows. Ferney's and Macks's numbers may move here too, if
the fixes reach them; the table says which and why.

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
  up to `padus.nearestOpenKm` (proposed 16 km, about 10 mi);
- keep the 1,600 m query for adjacency, unchanged.

**Number changes:** `padus.nearestOpenKm` is a new constant; `searchM` is unchanged. The config snapshot is
updated, and the PR says so.

**Text:** no new sentence. The existing "nearest public land" line gets a different value.

**Acceptance:** Grayson reports Jefferson NF / Mount Rogers NRA at about 4.5 mi. Ferney and Macks are unchanged,
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

- They are merged with the OSM trailheads, de-duplicated by distance (proposed 300 m, keeping the named source).
- A state park point is the park's address point, not necessarily a trailhead. It is listed as the park, e.g.
  "Grayson Highlands State Park".
- The endpoints go in `DEFAULT_ENDPOINTS`, so **endpoints `_v` 11 → 12**. Saved endpoint JSON at version 11 is
  replaced by the defaults on load, as today, with its message.

**Schema:** a trailhead keeps today's shape (no source field), so schema v2 is untouched. If the source is wanted
in the UI, that is v3: **Q4**.

**Text (rule 7, this plan's paragraph):**

- The caveat "trailhead counts undercount national forest access" stays word for word.
- Proposed appended sentence: "Forest Service trailheads and state parks are included too."
- No other sentence changes.

**Acceptance:** Grayson lists Elk Garden and Grayson Highlands within 7 mi. Ferney's and Macks's counts move only
by trailheads the new sources add, and the table lists them.

### 25: groceries reported as none

**First the cause, on the Grayson replay.** Photon is asked for `shop:supermarket` in a 40 km bbox, limit 40, with
Overpass as the fallback. Lansing and West Jefferson have groceries. Candidates:

- Photon's ranking or limit;
- the tag (a store tagged `shop=grocery`, or a general store);
- the bbox.

**The fix** follows the cause. Any number change (`near.groceryKm`, `photonLimit`) is said in the PR.

**"No data" vs "none" (rule 7):**

- Today an empty answer renders "none in OSM".
- **Proposed:** keep it, and append " — no data, which isn't proof there's none."
- The alternative, replacing it with "no data", is a replacement, so it needs the owner's explicit exception:
  **Q3**.

**Acceptance:** Grayson finds a grocer in Lansing or West Jefferson, and an empty answer renders the appended
sentence.

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
- **Direct-sun hours:** **Q6.** Recommended: unchanged. They compare the sun's geometric altitude with the
  skyline plus the 3° canopy. Refraction (about 0.5° at the horizon) is small next to the canopy allowance, and
  changing it would move every direct-sun number for little gain.

### 35: horizon every 1°

- `sun.horizonStepDeg` 5 → 1, so the horizon has 360 samples.
- `sun.profile` is stored as [azimuth, angle] pairs, so its shape is unchanged and schema v2 still holds.
- Every reader must use the pairs' azimuths, not an index × 5°. The PR checks each reader (the fan, the chart,
  the ground viewer, `evaluateAt`), so a kept 5° result still renders.
- **Cost:** the horizon is 5× the rays. The PR measures the sun step on Macks (the largest), and the run's longest
  synchronous block against #74's 60 s silence rule. If it is too slow, it proposes 2°.

**Acceptance:**
- the report's daylight equals the viewer's sunset − sunrise within a minute on all three fixtures;
- `expected.json` is regenerated, with the table and the leaf diff;
- the viewer's ridges and the report's line agree at 1°.

## 6. Kept results from before Batch A

- History keeps v2 results in IndexedDB, and screens are immutable.
- A kept result from before Batch A shows the numbers it was computed with. A re-run shows the new ones.
- v2 has no engine version, and it is frozen. **Q2.** Recommended: no change in Batch A. Add an engine version
  in **v3 at the start of Phase 1**, alongside the Supabase migration that stores screens anyway, so two screens
  of the same parcel can say why they differ.

## 7. Batch B (interleaved, UI only)

- **30:** the fan tooltip shows the canopy term. Proposed, appended so rule 7 holds even if tooltips count as
  report text: "120° (ESE): skyline 1.2° up, sun 2.9° — blocked (with the 3° canopy allowance)".
- **21:** snapping a new custom parcel to county outlines (full-detail geometry).
- **32:** time-of-day hillshade.
- **33:** the moon.
- **38:** the PMTiles fallback.

Each is its own PR, with no golden or `expected.json` change.

## 8. Open questions

1. **Goldens (§1):** freeze the prototype's `golden.json` and test against a new `expected.json`, with
   `diff:prototype` keeping the drift visible? *Recommended: yes.*
2. **Kept results (§6):** no engine version in Batch A; add one in v3 at Phase 1's start? *Recommended: yes.*
3. **25's wording:** append " — no data, which isn't proof there's none." after "none in OSM", or replace it
   with "no data" (a rule 7 exception)? *Recommended: append.*
4. **24's source in the UI:** keep the trailhead shape (no source field) for now? *Recommended: yes.* A source
   label would be v3.
5. **A2's size:** four items in one PR, as directed, or two PRs, 2a (23, 29: PAD-US and parts) and 2b (24, 25:
   places)? *Recommended: two, to keep each reviewable in ten minutes.* One PR if you prefer.
6. **37's direct-sun hours:** unchanged (geometric altitude)? *Recommended: yes.*
7. **24's de-duplication distance** 300 m, and **23's wider open-access search** 16 km? *Recommended: yes.* Both
   are new constants in `config.ts`.

## 9. Checks for every Batch A PR

- typecheck, lint, format, Vitest and e2e: green;
- `expected.json` equals a fresh `scripts/expected.mts` run;
- the before/after table and the leaf diff are in the PR, with every moved number explained;
- the config snapshot is updated where a constant changed, and the PR names it;
- `pnpm diff:prototype` is quoted;
- report text is append-only (rule 7), and the new sentences are listed;
- `phase-0.md` §6 rows are marked "done in Batch A (#n)" as each lands.
