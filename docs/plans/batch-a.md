# Batch A: the third fixture, data sources, scoring, sun (plan)

Status: **approved (owner, 2026-10-08), with the answers in §8.** A1 starts when this merges.

**Re-scope (owner, 2026-10-09, after #87):** "before Phase 1" is no longer a requirement. Mixed engine versions in
History aren't a concern: saved screens are simply re-screened when the engine changes (§6). The rest of the batch
runs in this order: A4 (the driveway, §5), A5 (soil properties, §5b), calibration against the household's grades
(§5c), and the sun follow-ups 37 and 35, deprioritized to any time later (§5d).

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
- **A2c:** hospitals by tag, and every other name-text search in `places.ts` (owner, #81 review);
- **A3:** 19, 27 and the scoring changes (#86);
- **A3b:** follow-up 44 (the router's cost precision), 20, and the routed-driveway wording (#87);
- **A4, the driveway (§5):** the "gentlest" style's cap becomes min(style cap, user limit), the scaled over-limit
  penalty, and the scoring route chosen by minimum total points (on the parcel vs. via an easement); a declared
  numbers change;
- **A5, soil properties (§5b):** follow-up 45, in place of NRCS's septic and foundation ratings: a report-only
  simulation on the 27-parcel study first, then implemented on the owner's go;
- **Calibration (§5c):** when the owner sends 8–10 parcels the household knows;
- **Sun, 37 and 35 (§5d):** deprioritized; any time later.

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
- **The parking-lot routing (#76): dropped from the report** (owner, #81 review). No drive time goes to a
  trailhead today, and none is added. The plan moved to follow-up 39 (tap-to-drive-time, display only).

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
38 min. The hospital search (`q=hospital`) has the same flaw: A2c.

**The closer grocery (owner, #81 review).** The chain rule stays for the existing line. When a non-chain grocery
is at least `grocery.closerMinMin` (10) minutes nearer by road, "Closer: {name}, {N} min." is appended to that
row. The drive step routes the three nearest non-chain stores of **every** one the search found within
`near.groceryKm`, not only the six the report lists, and keeps the quickest. It's stored as the last `drives` entry,
labelled "Closer grocery" with the store's name (anchors are stored with name ""), so v2's shape is unchanged and
every earlier entry keeps its place; every consumer reads the list through `splitDrives` (`lib/screen/driveList.ts`),
and the copied summary lists destinations only. **Grayson: Closer: Lansing Foods, 21 min** (Food Lion 38). **Macks:
Closer: Slaughters' Supermarket, 42 min** (Walmart Supercenter 61): main's 42-min store, still `shop=supermarket`
and still found by the tag search, tenth nearest at 15.7 mi, so outside the six listed. Ferney's nearest non-chain
is 2 min nearer, so no line.

### A2c: hospitals from a snapshot, by tag (owner, #81 review and 2026-10-09)

**The problem:** hospitals were the last name search: Photon's `q=hospital` finds only places with "hospital" in
the name. Photon also never returns the `emergency` tag, so it can't say which hospitals have an emergency
department.

**The decision (owner, 2026-10-09, option C):**
- A committed OSM snapshot, `lib/screen/data/hospitals.json`, made by `pnpm data:hospitals`
  (`scripts/data-hospitals.mts`).
  - It's one Overpass query for `amenity=hospital` or `healthcare=hospital` in the VA ∪ NC ∪ TN bounding box
    widened by `near.hospitalKm` (owner, #82 review): 33.30–40.01 N, 90.96–74.59 W.
  - It keeps the OSM id, name, position, the `emergency`, `healthcare`, `amenity` and `healthcare:speciality`
    tags (the older `health_specialty:psychiatry` / `:rehabilitation` keys folded in), and a `generatedAt` date.
  - 2026-10-09: 1,485 hospitals (998 `emergency=yes`), 255 KB, one hospital per line.
  - It's regenerated quarterly (`phase-0.md` §9.21); CI warns past 120 days. There's no runtime endpoint;
    endpoints `_v` stays 12.
- **De-duplication:** one entry per OSM id. Same-named copies within 300 m merge, keeping the `emergency=yes`
  one. Position alone isn't enough: Carilion Saint Albans (psychiatric, `emergency=no`) is 49 m from Carilion New
  River Valley Medical Center (`emergency=yes`).
- **At screen time:**
  - Candidates are the snapshot's hospitals within `near.hospitalKm`, nearest first, with the
    `excludeHospital` name filter kept, and psychiatric or rehabilitation hospitals left out by their
    `healthcare:speciality` tag (`near.excludeHospitalSpeciality`, owner, #82 review). That catches Carilion
    Saint Albans and Mountain Youth Academy, which the names don't.
  - The three nearest are routed by OSRM as before. If any candidate is `emergency=yes`, only those are routed,
    like the grocery chain rule.
  - When the chosen hospital isn't `emergency=yes`, its row appends "— emergency department not listed in
    OpenStreetMap" (rule 7). v2 has no field for it, so it's stored in `name`; v3 gets one (`phase-0.md`
    §9.20 (e)).
- **If the snapshot can't be loaded:** hospitals come from Photon by tag (`amenity:hospital` and
  `healthcare:hospital`, de-duplicated by OSM id), are chosen by distance, and nothing is appended.
- **The sweep:** the forward search `photon()` is gone; every Photon request is now a reverse lookup by tag.
  The places-failure "test the query" link went to that hospital search. No clean OSM map view of hospitals
  near a point exists (`openstreetmap.org/search` ignores the map position and finds places named "Hospital"
  worldwide; overpass-turbo depends on Overpass), so the link is dropped.
- **Radius (measured):** routed by OSRM from each fixture to every snapshot hospital 40–100 km away (90 routes).
  None beyond 60 km is under 60 min; the quickest is 78 min (Ferney to Carilion Roanoke Community, 62 km). So
  `near.hospitalKm` 60 covers a 60-min drive here; proposed: keep it.

**Result:** Ferney and Macks were routed to Carilion Clinic Saint Albans, a psychiatric hospital the name filter
misses (`emergency=no`). Both now go to Carilion New River Valley Medical Center (`emergency=yes`), 48 min (was
47). Grayson keeps Ashe Memorial (`emergency=yes`), 38 min. No fixture shows the note.

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

**Before it: the grade-distribution study** (owner, 2026-10-09; report only, no scoring change): 27 parcels in Floyd,
Carroll, Grayson, Ashe, Watauga and Alleghany, per-factor distributions, correlations, near-constant factors and
proposed replacements, absolute vs. relative cutoffs, and the owner's gut grades on nine of them.
`docs/studies/grade-distribution.md`; reproduce with `pnpm study:grades`. (The gut grades were skipped, §8.)

**A3's scope (owner, 2026-10-09, after the study; supersedes the candidates below where they differ):**
- **In:** 19 (aspect 165°); septic and foundation without the map unit's slope (it's already in quality's slope
  and cost's pad); rock scored by depth; the sky's dome penalty de-saturated; how driveway length and grade enter
  cost, as a cost estimate.
- **Out: the 70/30 quality/cost split stays as is.** Weights are a preference, not a fact: they become per-person
  rubric settings in follow-up 41. With no gut-grade calibration, the grade cutoffs (80/65/50/35) stay too.
- **Stage 1:** the three fixtures ranked before and after each in-scope change separately, so the owner can see
  which change moves what: `docs/studies/a3-scoring-analysis.md`, from `pnpm a3:analysis`.

**Done in A3 (#86, 2026-10-09).** The owner adopted all five; the driveway with a log curve instead of a linear rate.
- **19:** site aspect scored from 165°, the cells' target.
- **Septic and foundation without the map unit's slope:** the soils step also fetches each component's limiting
  features (cointerp, rule depth 1) and rebuilds NRCS's class from the features other than slope (`fetchSoilLimits`;
  session only). Without that answer every site keeps NRCS's own class, so a ranking never mixes the two.
- **Rock by depth:** 15 points at ≤ 50 cm of bedrock, none at ≥ 150 cm, linear between (`score.rockDepthCm`); the
  wording still follows the user's shallow-bedrock setting.
- **The sky's dome penalty:** full at w = 8 (was 3).
- **The driveway as a cost estimate:** every ranked site is routed (`siteDriveways`: one search per entrance and
  style, the least-steep binary search shared across sites; each site's route is exactly the one `buildDriveway`
  finds for it alone). Points = min(40, 9 · ln(1 + cost / $20k) + 10 with no route within the limit + 10 for an
  easement); no fixture site reaches 40 (highest 37.7). The house is re-costed from the route to it the same way.
  Curve: `docs/studies/a3-driveway-curve.md`.
- **Routing time** (Node, desktop): 1.5 s (Ferney, 5 sites), 4.5 s (Macks, 8), 3.3 s (Grayson, 4) for the whole
  pass, within the owner's 5 s budget; per site separately it was 7–30 s.
- **Found on the way:** the router skips about half its cells (float32 costs): follow-up 44.
- **Text:** no sentence changes. Values and which existing phrase shows move (rule 4). Site #1 keeps its routed
  driveway line; no new line was added for the other sites, and the help text still describes the straight line
  (a text proposal for the owner).
- **20** (garden soil without house sites) wasn't in the owner's A3 list; it's still open.

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

### A3b: the router's cost precision (follow-up 44), 20, and two wording additions (owner, 2026-10-09)

- **Follow-up 44, moved into Batch A** (it feeds rankings through A3's routed driveway cost and the no-route
  penalty). The router kept path costs in a Float32Array but popped full-precision keys, so every cell whose
  stored cost rounded down was skipped: about half of them. Costs are now a Float64Array. Measured per fixture in
  `docs/studies/a3b-router-precision.md` (`pnpm a3b:router`).
  - **Every ranked site on the three fixtures now has a route within the 10% limit.** Before, 11 of 17 needed a
    least-steep route (Macks 11–20%, Grayson 22%). Kept to the parcel, Grayson's sites need **11%** (the 10.8% path),
    not 22%; their legal routes cross neighbouring land (+10 easement points).
  - Rankings move little: Ferney #4/#5 and Macks #3/#4 and #6/#7 swap; every #1 stays.
- **Routing time, with the fix:** the correct search explores more, so three changes that keep results identical
  (each checked on all three fixtures, site by site): a typed-array heap, entrance candidates computed once per
  screen and shared with site #1's driveway, and the route profile walked once instead of Turf's along() from the
  start every 3 m (quadratic in the route's length). One pass over every ranked site: Ferney 0.17 s, Macks 0.44 s,
  Grayson 0.06 s (was 1.5, 4.6, 3.3 s); whole screens are faster than before A3.
- **20:** gardens get their soil adjustment whether or not there's a house site (moved out of the bench block),
  with a synthetic test (Ferney with an impossible house-site minimum).
- **Wording (rule 7, approved):** the routed-driveway line is appended to every ranked site below #1 with a route
  within the limit; the help text says driveways are routed (the one approved replacement, `help.test.tsx`).
- **Which route Grayson's #1 is scored on** (owner's question, #87): the one within the 10% limit that crosses
  neighbouring land (5,176 ft, about $454k, +10 for the easement); scoring takes the cheapest route within the limit.
  Kept to the parcel the same site needs 11%; that route isn't scored.
- **Routes out of the parcel say so** (owner, #87): the driveway card's title, the map's tooltip and the site's
  routed-driveway line append "needs an easement" (`routeLabel`, `lib/screen/routeLabel.ts`); never "legal" or
  "within the limit" without it. Test: `lib/report/easement.test.ts`.
- **The curve at engine 6:** `docs/studies/a3b-driveway-curve.md` (Ferney's and Macks's sites on the within-limit
  line; Grayson's on the +10 line, as diamonds, for the easement). A3's engine-5 chart is kept, labelled "before the
  router fix".
- **The grade study at engine 6** (`grade-distribution-engine6.md`). Owner's note for the record: randomly drawn
  parcels come out 78% A/B and 0% F, so the scale looks lenient at the bottom; the cutoffs stay until calibrated
  against the owner's gut grades.
- **Found, not changed:** buildDriveway's "gentlest" style keeps its own 8% cap, so under a grade limit below 8% it
  can still return an 8% route as legal (the prototype's). Fixed in A4 (§5). The tests that need the least-steep path use 5% on
  Grayson's terrain for that reason.

## 5. A4: the driveway

Sun moved out of A4 (re-scope, owner, 2026-10-09): it is §5d, any time later.

**A4 (owner, #87 review and re-scope, 2026-10-09):**
- **The driveway style's own grade cap:** buildDriveway's "gentlest" style keeps its own 8% cap (the prototype's),
  so under a user grade limit below 8% it can still return an 8% route as legal. It becomes min(style cap, user
  grade limit). Test: a 6% limit returns no route steeper than 6%.
- **A no-route penalty scaled by how far over the limit:** in place of A3's flat +10 when no route fits the grade
  limit, either 10 × min(1, overLimitFt / 1000) or one scaled by the excess grade needed (needed% − limit%),
  whichever separates a route needing 10.5% from one needing 22%. Both shown on the curve chart with a synthetic
  over-limit site. A declared numbers change; no fixture should move (since A3b none needs a least-steep route).
- **The scoring route: the one with the fewest total driveway points** (depends on the scaled penalty), not "the
  cheapest within the limit". Each ranked site has two candidates:
  - the best route kept to the parcel, whatever grade it needs, with the scaled over-limit penalty;
  - the best route within the limit, with the easement penalty when it leaves the parcel.

  The site is scored on whichever totals fewer points. Its card shows the chosen route, and the other candidate
  when it differs, appended (rule 7), in the owner's wording: "Best on your land: N%, X ft" and "Within N% only via
  neighbouring land (needs an easement): X ft". The PR reports Grayson's #1 before and after (route, points, rank)
  and checks the routing pass still fits the 5 s budget with the on-parcel candidate computed for every site.

**The engine version** is bumped to 7. **Acceptance:** a 6% limit returns no route steeper than 6%; the curve chart
shows both penalty forms with the synthetic over-limit site; Grayson's #1 before/after table is in the PR;
`expected.json` is regenerated with the numbers change declared and the leaf diff.

**Done in A4 (2026-10-09; measured in `docs/studies/a4-driveway.md`, `pnpm a4:driveway`):**
- **The over-limit term is scaled by grade** (owner, #88 review): +1 a percent over the limit up to 15% needed
  (`driveway.practicalMaxPct`; +5 under a 10% limit), then straight up to +20 (`overLimitMaxPts`) at 20%
  (`overLimitMaxAtPct`) and above, past the easement's +10, so a grade that is in practice unpermittable loses to an
  easement route at a similar cost. Scaled by the length over the limit, it can't separate 11% from 22%: that length
  is measured on the route's 3 m profile, and Grayson's #1 kept to the parcel needs 11% but has 3,179 ft "over 10%",
  more than the 1,959 ft of its engine-5 route that needed 22%. Per-county limits: follow-up 46.
- **Two candidates per site** (`siteDriveways` → `SiteRoutes`; `chooseDriveway` in `score.ts`): the cheapest route
  within the limit, and the cheapest kept to the parcel, within the limit when one is, else the least-steep one. When
  the route within the limit needs no easement it is both. A tie goes to the route within the limit. The house is
  scored the same way.
- **Only Grayson moves:** its four sites' routes within 10% need an easement, and each is now scored on its route kept
  to the parcel (needs 11%). Grayson's #1: 38.5 → 28.0 driveway points, 5,176 → 4,228 ft, C 61 → C 64, still #1. Ranks
  and grades are unchanged; Ferney and Macks are unchanged.
- **The site's card** appends both candidates when they differ, the scored one first (rule 7; the owner's wording). The
  driveway section still recommends the route within the limit, labelled "needs an easement". Showing the scored route
  there as the primary drawing is planned in #88, for the owner's approval before code.
- **Help text** (owner, #88 review; appended): "Where that route needs an easement, or there is none, the site is
  scored on whichever costs fewer points: …; the site shows both."
- **Routing time,** both candidates for every site: 0.20, 0.48 and 0.23 s (Ferney, Macks, Grayson).
 in place of NRCS's septic and foundation ratings (follow-up 45)

Owner, 2026-10-09. First a **report-only simulation on the 27-parcel study** (`docs/studies/`): each candidate
property (depth to bedrock or another restrictive layer, the slowest layer's Ksat, slope within the unit) and the
grades it would give against today's. Implemented only on the owner's go, as a declared numbers change with the
engine version bumped.

## 5c. Calibration against the household's grades

Owner, 2026-10-09. When the owner sends 8–10 parcels the household knows:
1. screen them;
2. build a **blind sheet**: the land only, and a one-line reason with each grade, filled separately by each
   member of the household;
3. fit per-factor and overall grade cutoffs to those grades, and report the disagreements and their causes.

No grade is filled in for the household, and nothing is calibrated on parcels the household doesn't know.

## 5d. Sun (37, 35): deprioritized, any time later

Owner, 2026-10-09. Unchanged in scope; its own PR whenever it's picked up.

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

**Re-scope (owner, 2026-10-09):** mixed-engine History isn't a concern. Saved screens are simply re-screened when
the engine changes. `ENGINE_VERSION` stays: it's how a saved screen is known to be older. **In Phase 1, a screen
whose engine is below the current one is re-run automatically**, as a new `screens` row (version = max + 1; screens
stay immutable). Recorded in PLAN.md's Phase 1 and `phase-0.md` §9.20 (a). What A1 built below stays as it is.

History keeps v2 results in IndexedDB, and screens are immutable. A kept result shows the numbers it was computed
with, so History has to say when those came from earlier rules.

- **`ENGINE_VERSION`:**
  - in `lib/screen/engine.ts`, a plain integer, so `lib/screen` stays DOM-free;
  - **1 is Phase 0's rules;**
  - **A2a, A2b, A2c, A3, A3b and A4 each bump it,** to 2, 3, 4, 5, 6 and 7 (A2c and A3b added by the owner);
    A5 and the sun follow-ups bump it again when they change numbers.
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
the wider public-land search didn't respond, so the section can say so (owner, #80 review, 2026-10-08); and an
explicit closer-grocery field, moved out of `drives` by the migration (owner, #81 review). The full list is
`phase-0.md` §9.20.

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
8. **#81 review:** the closer non-chain grocery line (§3, 25); trailhead parking-lot routing moves to follow-up 39;
   hospitals by tag, with a sweep of `places.ts` for name-text searches, are a new PR, A2c, before A3.
9. **A2c (2026-10-09):** hospitals from a committed OSM snapshot, regenerated quarterly, not a runtime endpoint
   (option C); emergency=yes preferred, the note appended otherwise; follow-up 42 for CMS's emergency status.

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
