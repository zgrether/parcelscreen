# Step 14d: Places as data, a Places layer, and paddling

The owner pre-approved the brief (Zach, 2026-10-25, package B). Zach reviews this plan and the hand-back together; the
mission runs on this plan's recommended answers (§12), each flagged in the hand-back.

**Sources:**
- PLAN.md row 14d (added with #338);
- Zach's brief of 2026-10-25 (B);
- `docs/plans/step-11-new-data.md` (how a factor is added) and `docs/plans/step-13-area-catalog.md` (the catalog and its
  monthly refresh);
- phase-0.md §9.65, §9.66, §9.69 and §9.71: optional result fields, the ER list, and ponds.

**Decision:** §9.73, written in the docs PR.

**Mission mode:**
- The work runs on `step/14d-places`, branched from main after the UX part 2 hand-back (#337) merged.
- Each row of §11 is one PR into it, which I merge when CI is green on its head.
- The step ends with the hand-back to main, which Zach merges.

## 0. What's there today (found while planning)

**What a grade fetches for places:**
- **Groceries and OSM trailheads.** Photon's reverse geocoder runs twice per grade (`shop:supermarket` within 40 km and
  `highway:trailhead` within 36 km; `lib/screen/places.ts:62`). When Photon fails, Overpass runs instead, from the
  browser through `/api/places/overpass`.
- **Official trailheads.** Five ArcGIS sources per grade (`officialTrailheads`, `trailheads.ts:325`):
  - USFS INFRA trailheads;
  - VGIN, NC DPR and TN TDEC state-park points;
  - TDEC's TREC trails.
  Each failure goes to `noResponse`.
- **Trailhead parking.** Overpass finds the parking for the five nearest trailheads in the drive step
  (`trailheadParking.ts`).
- **ERs are already baked.** They come from CMS with the overrides (`lib/screen/data/er.json`, `er-overrides.json`;
  §9.69), loaded by dynamic `import()`. Photon and OSM no longer supply hospitals.
- **Airports aren't places.** The ones a grade times are Settings' anchors (`DEFAULT_USER_CONFIG.anchors`: AVL, ROA,
  TRI, GSP, CLT), and the Airport row picks them by name (`card.ts:868`). `lib/areas/data/airports.json` (NTAD) is the
  catalog's only.
- **Long-trail access points are a hand-kept list** (`lib/screen/data/longTrails.ts`), timed in their own OSRM table.

**Other facts:**
- **The near step's other Overpass calls aren't places.** They are VR3a's tracks and service roads (possible frontage)
  and the power-line fallback when HIFLD doesn't answer. They're out of this brief (§12, Q1).
- **No step timing is stored.** `useScreen` keeps `steps[id].ms`, shown only in debug mode. No recording or note holds
  "the places step took 48 s"; the UX walkthrough's 48 s is a whole Mud Creek grade
  (`docs/design/ux-audit/walk-desktop.md:19`). The before/after times come from §6's live measurement.
- **Ponds are measured on the parcel only.** `ponds` holds the count, acres and names: NHD waterbodies (layer 12,
  FTYPE 390 or 436) reaching inside (§9.71). Ferney has one of 0.94 ac, under the brief's 1 ac.
- **The map has no point layer for places** beyond the result's trailheads (circles and flags in `style.ts`), and no
  clustering anywhere.
- **This cloud session reaches none of the sources.** Photon, Overpass, OSRM, NHD, USFS and the ArcGIS hosts all answer
  403 at the proxy. So the bake, the re-recordings, the area profile and the timing run on GitHub's runners, from
  workflows (§7), as the lidar timing did (#338).

## 1. The rules

- **The near step reads baked files.**
  - It makes no Photon or Overpass call for places: groceries, trailheads, trailhead parking and launches come from
    `public/places/v1/`.
  - OSRM drive times stay live. The official trailhead services are no longer called during a grade either: they're
    baked too (§2).
- **One declared numbers change:**
  - ENGINE_VERSION 32 → 33, and the PR lists every fixture's changed nearest place and minutes, with the
    `pnpm diff:prototype` summary line.
  - `ENGINE_CURRENT_FROM` stays 29, as in §9.71: an older grade keeps its places until graded again.
  - The recordings shrink: the Photon, Overpass-places, USFS, state-park, TREC and parking entries go. Mud Creek's
    pinned first 28 entries stay; the guard's allow-list drops the place URLs.
- **The fixtures read a frozen copy of the cells they use** (`test/fixtures/<slug>/places/`), so a monthly refresh moves
  no fixture number. The app reads `public/places/v1/`.
- **Paddling is additive:**
  - an optional `paddling` field on `ScreenResult`, with SCREEN_SCHEMA_VERSION staying 9 (§9.73 extends §9.65's
    exception, as §9.66, §9.70 and §9.71 did);
  - ENGINE_VERSION 33 → 34;
  - `expected.json` changes are additive only (rule 7: new text after existing text).
- **Rubric:**
  - Paddling is a new factor at weight 0 until the interview places it.
  - Existing profiles get the "New factors to place" notice (`lib/rubric/factorsAdd.ts`) and the new question.
- **River put-ins never count toward the grade.** They're listed with "check the river's class before paddling".
- **Terms decide what's baked.**
  - A source is baked only where its terms allow redistribution. OSM data goes in its own files under the ODbL (§2.3).
  - A source that needs permission isn't baked; the plan names who to ask (§12, Q3).

## 2. The baked places (`public/places/v1/`)

### 2.1 Layout
- **`index.json`:** the version, the bake date, each source (name, licence, attribution, date checked), the cells with
  their counts, and the bake's bounds: VA, NC and TN plus 60 km (`lib/screen/data/state-outlines.json`, buffered).
- **Cell files,** 1° × 1° and named by their south-west corner (`36_-82.json`), one folder per licence:
  - `osm/<cell>.json`: groceries, trailheads, their parking, and launches, all from OpenStreetMap (ODbL);
  - `official/<cell>.json`: USFS trailheads and boating sites, the three states' park points, and TREC's trail
    trailheads (public domain or their own terms, §2.3).
- **A cell file:** `{ version, cell, bake, places: Place[] }`, Zod-checked. A `Place` is `{ id, kind, name, ll, source,
  ...kind fields }`:
  - grocer: `big`;
  - trailhead: `serves`, `trec`, and `parking` (`ll` of the nearest parking within `drive.parkingWithinM`);
  - launch: `water` (`"flat"` | `"river"`), `waterName`, `waterAc`, `trail` (a named paddle trail).
- **Loaded on demand.**
  - The near step asks for the cells its radii cover (at most four).
  - In the worker, `PlacesSource` fetches them through `lib/http.ts` from the app's own origin. In Node it reads the
    files.
  - The service worker precaches nothing here (step 14e decides offline).
- **Size, estimated:** about 100 cells per folder, about 30 KB each before gzip, about 3 MB in all. The real figure
  goes in the bake PR.

### 2.2 What's baked
| Kind | Sources | Kept as today |
|---|---|---|
| Groceries | OSM `shop=supermarket` (nodes and ways, `out center`) | `bigGrocer`; non-chains feed the closer grocery |
| Trailheads | OSM `highway=trailhead` or `information=trailhead`; USFS INFRA `TRAILHEAD`; VGIN, NC DPR, TN TDEC parks; TREC | `mergeTrailheads` at grade time, unchanged |
| Trailhead parking | OSM `amenity=parking` within 300 m of each trailhead (the drive step's query) | The drive step reads `parking` instead of asking Overpass |
| Paddle launches | §2.4 | New |
| ERs | Unchanged: `lib/screen/data/er.json` with the overrides | The layer reads it |
| Airports | Unchanged: Settings' anchors | The layer reads them |
| Long-trail access | Unchanged: `lib/screen/data/longTrails.ts` | The layer reads it |

**Merging stays at grade time.** The two folders stay separate files, and `mergeTrailheads` dedupes official and OSM
points per grade, as now. So no published file mixes OSM data with another source's (§2.3).

### 2.3 Terms (each source goes into `docs/commercial-review.md`)
- **OpenStreetMap (ODbL 1.0).** A baked file of OSM points is a Derivative Database, not a Produced Work: the OSMF's
  Produced Work guideline says a result "intended for the extraction of the original data" is a database. And three
  states' launches are "substantial" under that guideline.
  - The `osm/` files are published under the ODbL, with "© OpenStreetMap contributors" in `index.json`, in the Places
    layer's attribution, and on the Help page (`app/help`) under a new "Where the data comes from" section.
  - Serving them publicly satisfies ODbL 4.6's offer of the database.
  - The Horizontal Layers guideline puts a mix of OSM and non-OSM data of the same feature type under share-alike. So
    the official folder never takes OSM points: the merge happens per grade, and the result is a Produced Work
    (attribution only, as today).
- **USFS INFRA:** a federal work, public domain ("intended for public use and distribution").
- **VGIN landmarks, NC DPR parks, TN TDEC parks and TREC:** used live today. Baking redistributes them, and their terms
  aren't recorded yet.
  - **Recommended:** bake them, marked "to confirm" in commercial-review.md. They're public facility locations the
    states publish for the public.
  - Any of them whose terms turn out to forbid it goes back to a live call (§12, Q2).
- **The three state wildlife agencies' boating access sites:** VA DWR "available by permission", with a citation
  required; NC WRC "no licence provided, request permission"; TWRA "custom licence", redistribution not stated.
  - The brief says "where the terms allow", and none clearly does. So none is baked in this step.
  - Each goes into commercial-review.md with whom to ask, and §12 Q3 asks Zach whether to write to them. A permission
    later is a data-only PR.
- **Named paddle trails:** the New River Blueway, the French Broad River Paddle Trail (MountainTrue), TN's blueways and
  American Whitewater publish maps and PDFs, not data, and no licence.
  - Their access points come in only through OSM's canoe routes (`type=route` + `route=canoe` relations, the relation's
    name as `trail`), where mappers have added them.
- **NHD (USGS):** public domain. It's retired (no longer maintained since 2023-10-01) and still served; 3DHP replaces
  it. The classification uses NHD's layer 12, which the ponds measure already reads (§12, Q6).
- **OSRM:** unchanged.

### 2.4 Paddle launches, and flatwater or river
- **OSM launch tags:**
  - `leisure=slipway`;
  - `canoe=put_in`, `canoe=put_in;egress`, `canoe=egress`;
  - `whitewater=put_in`, `whitewater=put_in;egress`, `whitewater=egress`;
  - `waterway=access_point`.
  - Left out: a slipway tagged `canoe=no`, and anything tagged `access=private` or `access=no`.
  - The `whitewater=*` launches are river launches whatever water they're near.
- **Plus OSM canoe-route access points:** the put-in, egress and access-point members of `route=canoe` relations, named
  by the relation.
- **Plus USFS INFRA recreation sites of subtype `BOATING SITE`** (the value as found at bake time; the bake PR records
  it).
- **Classified at bake time:**
  - **Flatwater:** within `paddling.flatwaterWithinM` (60 m) of an NHD waterbody of FTYPE 390 (LakePond) or 436
    (Reservoir) of at least `paddling.flatwaterMinAc` (5 ac). Stored: `water: "flat"`, the waterbody's GNIS name and
    its acres.
  - **River:** every other launch. Its river is the GNIS name of the nearest NHD flowline (layer 6) within 100 m, else
    OSM's `waterway` name.
- **One request per cell:** the launches as a multipoint, `distance` = 60 m (100 m for flowlines), answered by the
  layer. NHD is slow (33 s for one parcel's box, §0), so the bake runs in a workflow (§7), not during a grade.
- **The launch's name:** its own, else "<water> access", else "Boat launch".
- **The test fixture** for classification is synthetic (§10).

## 3. The near step and the drive step

- **`PlacesSource`** (`lib/screen/placeData.ts`): `(cells: string[]) => Promise<Place[]>`, injected like `HospitalSource`.
  - The worker passes the fetcher. Tests pass the fixture's frozen cells.
  - If the files don't load: the same failure as both place services failing today (`PlacesError`: the places half is
    lost, the step still reports failure).
- **`findPlaces`** keeps its outputs (`near`, `otherGrocers`, `osmTrailheads`, `hospitalPool`) and fills them from the
  cells instead of from Photon. The `nearNote` "Places came from Overpass" goes; nothing replaces it.
- **`officialTrailheads`** reads the official cells. Its sources no longer go to `noResponse`: a source missing from
  the bake shows in `index.json`, and the refresh PR says so (§7).
- **The drive step** reads each candidate trailhead's baked `parking`, and stops asking Overpass. `TRAILHEAD_PARKING`'s
  `noResponse` entry goes with the call.
- **Removed:** `photonNear`, `overpassPlaces`, `overpassViaRoute`, the `/api/places/overpass` route,
  `parkingFromMirrors`, and the Photon and Overpass-places endpoints in `Endpoints` (with a `_v` bump).
  - The search box's own Photon use stays (it isn't a grade).
- **Also unchanged:** VR3a's OSM roads and the OSM power fallback keep their Overpass mirrors (Q1).

## 4. Paddling

### 4.1 The measurement (`paddling`, optional)
- **The drive:** minutes and miles, from the drive start (`driveStart`) to the nearest flatwater launch by road.
  - One OSRM table of its own (like `longTrail.ts`), to the `paddling.points` (6) nearest flatwater launches within
    `paddling.maxKm` (100 km) in a straight line.
- **Stored:**
  - `paddling: { flat: { name, water, min, mi } | null, rivers: [{ name, river, km }] (the 3 nearest put-ins within
    paddling.riverKm, 40 km), pond: { acres, name } | null }`;
  - `null` when no flatwater launch is within reach;
  - left out, with "Paddle launch drive times" in `noResponse`, when the table doesn't answer.
- **`pond`:** the largest of `ponds` reaching inside the parcel, when at least `paddling.pondMinAc` (1 ac). It's from
  the existing measurement; no new request.

### 4.2 The factor
- **Its row:** "Paddling", key `paddling`, in `ROW_KEYS`, at weight 0 by default.
  - Bands `paddleMin` [15, 30, 45, 60]: an A at 15 minutes or less, B at 30, C at 45, D at 60, F beyond.
  - The editor's slider runs 5–90 in steps of 5.
- **The row's line:** "18 min to Watauga Lake, Rat Branch" (minutes, the water, the launch).
  - With no flatwater launch within 100 km: "No lake or reservoir launch within 100 km".
  - Not measured, or not answered: the row's existing wording.
- **The detail, below the line (additive):**
  - each river put-in: "<river>: <launch>, <km> km — check the river's class before paddling";
  - with a pond of at least 1 ac on the parcel: "And a pond on the land you could paddle (<acres> ac)".
  - River put-ins and the pond never change the minutes, the band or the grade.
- **Everywhere a factor is named:** card panels, words, musts (no must: paddling is never a dealbreaker), answers, the
  rulebook, and the area words, as step 11 added its factors (`docs/plans/step-11-new-data.md` §4).

### 4.3 The interview
- **One question, after Saturday morning (trails), with two rows (as question 7 has):**
  - Scene: "A warm Saturday with nothing planned. A lake and a paddle board, or a kayak?"
  - First row, "How often would you paddle?":
    - "Rarely" → Won't;
    - "Some weekends" → Could;
    - "It's a big part of our fun" → Should.
  - Second row, "The longest you'd drive to a launch?": "15 min", "30 min", "45 min", "An hour". It sets the B/C edge
    of `paddleMin`; the other edges step by 15 minutes (the rule in `workflow-review.md`, "Each factor scores 0–100").
  - "Rarely" skips the second row.
- **Points:** Could 1, Should 3 (`card.interview.choices`), after `trails` in `TIE_ORDER`.
- **Existing profiles:** Paddling joins `NEW_FACTORS`, so they get "New factors to place" (it lands in Won't until
  placed) and the question as `NEW_QUESTION`, as step 11's factors did.

### 4.4 The area catalog
- **A new measure, `paddleMin`:** each sample point's drive to the nearest flatwater launch, from the baked launches.
  It goes in the same batched OSRM tables, one more destination set.
- **An area factor** with the same bands.
- **The area files change shape,** so `AREA_FILE_VERSION` 1 → 2 and `/areas/v2`, a clean break (Mission mode). The
  monthly workflow regenerates all thirty, and `/areas/v1` is deleted.

## 5. The Places layer

- **Where:** Map layers › "Places", off by default, under Lidar terrain.
- **Sub-toggles, all on when Places is turned on:**
  - ER hospitals;
  - Airports;
  - Trailheads;
  - Groceries;
  - Long-trail access;
  - Paddle launches.
  - Each is a 44 px toggle row (the panel's style). Remembered per device (`ps.places` in `lib/client/prefs.ts`).
- **Drawn:**
  - One GeoJSON source per kind, from the cells in view (plus ERs, airports and long trails from their lists), loaded
    as the map moves, at zoom 8 and up.
  - Clustered below zoom 12 (MapLibre's `cluster`, radius 40), with the count in the cluster.
  - Each kind has an icon: a cross, a plane, a boot, a cart, a bike. Flatwater and river launches differ: a paddle on a
    blue disc for flatwater, a paddle on a green disc for river.
  - The icons are drawn once into the map's images (`map.addImage`), on a white outline for contrast on aerial and on
    dark.
- **A tap shows a small card** (the map's existing popup style):
  - the name;
  - the type ("Paddle launch: flatwater, Watauga Lake");
  - the source ("OpenStreetMap", "US Forest Service", "CMS");
  - "Checked <bake date>";
  - when the open parcel's grade already timed it: "18 min from this parcel". Nothing is fetched for a tap.
  - A river launch adds "Check the river's class before paddling".
- **Attribution:** "Places: © OpenStreetMap contributors, USFS, CMS, the states' parks" while the layer is on.
- **Below zoom 8:** the hint "Zoom in to see places", the lidar hint's style.

## 6. The grade's time, before and after

- **The tool:** `test/tools/grade-timing.test.ts` (`pnpm grade:timing`, mode `grade-timing`) grades Mud Creek, Macks,
  Ferney and Roan live in Node, three times each.
  - It reports each step's median milliseconds and the total.
  - It runs from the workflow (§7) on main before the switch, and on the branch after it.
- **Reported:** both tables go in the switch PR and in the hand-back, Grayson's near step called out. The brief's 48 s
  is checked against the "before" run, not assumed.

## 7. Workflows (the runners do the network work)

- **`.github/workflows/places.yml`, `workflow_dispatch` with a `ref` input. Its jobs:**
  - **bake** (`pnpm data:places`): writes `public/places/v1/` and pushes it to the ref as a commit. GITHUB_TOKEN's push
    starts no workflow, so the job dispatches `ci.yml` on the ref, as `areas-refresh.yml` does.
  - **record:** `pnpm record:port` with `PORT_APPEND` per fixture, and `pnpm expected`; the same push.
  - **timing** (`pnpm grade:timing`): writes the job summary.
  - **areas** (`pnpm areas:profile`): `/areas/v2`; the same push.
- **The monthly refresh** (`areas-refresh.yml`):
  - adds `pnpm data:places` before the profile;
  - `scripts/places-summary.mts` writes the plain diff per kind and nearest town, e.g. "+3 trailheads near Damascus",
    "−1 grocery near Sparta (Food Lion, closed)", "1 launch moved to river (…)". Towns come from OSM `place=town|city`,
    baked into `index.json` for this only.
  - It opens one PR, "Area catalog and places refresh", and never auto-merges.
  - Fixture numbers don't move (§1), so its PR doesn't ask for re-recording unless er.json changed (as now).
- **The scripts:**
  - **`scripts/data-places.mts`:** Overpass (one instance, one query per cell, 1 a second), USFS and the state services
    paged, NHD per cell. Each source that fails keeps last month's cells for that source and says so in the summary.
  - **`scripts/places-summary.mts`.**

## 8. UX

- **The main flow is unchanged.** A grade reads the same, sooner.
- **Paddling is one more row,** in the tier the interview put it in. Its line answers first ("18 min to Watauga Lake,
  Rat Branch"); river put-ins and the pond are the detail on tap.
- **Empty states:**
  - Places on but nothing in view: no hint (an empty map is the answer).
  - No flatwater launch within 100 km: the row says so.
- **Loading:** cells load as the map moves. Nothing blocks, and points appear as each cell arrives.
- **Error:** a cell that fails to load is skipped and tried again on the next move. One hint per visit: "Some places
  didn't load".
- **Slow:** none expected; the files are static and small.
- **Plain labels:** "Places", "ER hospitals", "Paddle launches", "flatwater" (with "lake or reservoir" in the tap card
  the first time), "river".
- **Phone at 375 px:**
  - the six sub-toggles stack as 44 px rows;
  - the tap card fits the width with 16 px gutters;
  - cluster circles are at least 44 px to tap.
- **Contrast:** icons on a white ring (3:1 against aerial and dark); cluster counts are dark text on light discs, 4.5:1.
- **Consistency:** the panel's toggle rows, the lidar hint's style, the map's popup.

## 9. Strings (declared; rule 7, additive)

- **Card:**
  - "Paddling";
  - "<n> min to <water>, <launch>";
  - "No lake or reservoir launch within 100 km";
  - "<river>: <launch>, <km> km — check the river's class before paddling";
  - "And a pond on the land you could paddle (<acres> ac)".
- **Interview:**
  - the scene and the two rows' questions;
  - the seven choice labels and their "why" lines: "You'd rarely paddle", "You'd paddle some weekends", "Paddling is a
    big part of your fun", "You'd drive up to <n> minutes to a launch".
- **Map:**
  - "Places", the six sub-toggle labels, "Zoom in to see places", "Some places didn't load";
  - the tap card's "Paddle launch: flatwater, <water>", "Paddle launch: river, <river>", "Checked <date>",
    "<n> min from this parcel", "Check the river's class before paddling";
  - the attribution line.
- **Help:** a "Where the data comes from" section listing each places source with its licence ("© OpenStreetMap
  contributors, ODbL").
- **Gone** (removed with their code):
  - the nearNote "Places came from Overpass (Photon was unavailable).";
  - the `noResponse` labels for the official trailhead sources and for trailhead parking.
  - Removing a string whose condition can no longer happen isn't a golden change. The fixtures' goldens never carried
    them.

## 10. Test plan outline

- **Unit:**
  - **The near step with no network but OSRM:** every fixture graded with `fetch` blocked except
    `router.project-osrm.org` (replayed), its places from the frozen cells.
  - **Launch classification** on synthetic cases:
    - on a 40 ac reservoir;
    - 50 m from a lake, and 70 m from it;
    - on a 3 ac pond;
    - a `whitewater=put_in` on a lake;
    - unnamed water.
  - **The Paddling factor's cutoffs:** each band's edges, the interview's four drives moving the B/C edge, rarely as
    Won't, river put-ins never moving the band, the pond line at 0.94 ac (absent) and at 1 ac (shown).
  - **Cells:** the cells a radius covers, at the edges and at a corner.
  - **The refresh summary:** a fixture before and after; the rendered markdown ("+3 trailheads near Damascus").
  - **`factorsAdd`:** Paddling as a new factor on an older profile.
- **e2e:**
  - **The Places layer:** off by default; each sub-toggle; a cluster at zoom 10 that splits at 13; a tap card with its
    drive minutes on Mud Creek; remembered after a reload.
  - **Paddling:** its row on Mud Creek; the interview's question with its two rows.
- **Screenshots** at 1280 and 375:
  - Places on over Mud Creek, clustered and close;
  - a launch's tap card;
  - the Paddling row;
  - the interview question;
  - Map layers with Places open.
- **The hand-back's manual test plan** walks Mud Creek, Macks, Ferney and Roan.

## 11. PRs, into `step/14d-places`

| # | PR | Numbers |
|---|---|---|
| 0 | This plan | None |
| 1 | `data-places.mts`, the cell format and `PlacesSource`, `places.yml`'s bake job; the first bake committed; commercial-review.md lines | None (nothing reads it yet) |
| 2 | The near and drive steps read the cells; Photon, Overpass-places, the official services and parking removed from a grade; recordings re-recorded smaller; fixture cells frozen; `grade-timing` before and after | **Declared:** ENGINE_VERSION 33, every fixture's changed nearest place and minutes, the summary line |
| 3 | Launch classification in the bake; `paddling` measured; the factor, its row and detail; the interview question; `NEW_FACTORS` | Additive: ENGINE_VERSION 34, `paddling` added to expected.json |
| 4 | The area catalog's `paddleMin`, `/areas/v2` | Area files only |
| 5 | The Places layer | None |
| 6 | The monthly refresh: places re-baked, the plain diff, one PR | None |
| 7 | Screenshots, the fresh-eyes review, §9.73; the hand-back to main | None |

## 12. Questions, each with the recommendation (the mission proceeds on these; each flagged in the hand-back)

1. **VR3a's tracks and the power-line fallback still call Overpass.** The brief says "no Photon or Overpass calls during
   a grade" under places.
   - **Recommended:** keep those two live. They're roads and lines, not places, and baking three states' tracks is its
     own project.
   - If Zach wants them gone too, that's a follow-up.
2. **The state park and TREC layers' terms aren't recorded.**
   - **Recommended:** bake them marked "to confirm", and move any that forbids redistribution back to a live call.
3. **VA DWR, NC WRC and TWRA boating access sites need permission.**
   - **Recommended:** Zach writes to the three agencies' GIS contacts (named in commercial-review.md). This step ships
     OSM and USFS launches. A permission later is a data-only PR, merged under the agency's own source tag.
4. **What counts as flatwater.**
   - **Recommended:** a launch within 60 m of an NHD lake, pond or reservoir of at least 5 ac. A slow river pool above a
     dam is NHD's reservoir; a wide slow river isn't flatwater.
5. **Should the pond count toward the grade?** The brief says it "adds" a line.
   - **Recommended:** the line only.
6. **NHD or 3DHP for the classification.**
   - **Recommended:** NHD layer 12, as the ponds measure already uses it, with a follow-up to move both to 3DHP when
     NHD stops answering.
7. **Airports in the Places layer.**
   - **Recommended:** Settings' airports, the ones the grade times ("from Settings" in the brief). NTAD's full list
     stays the catalog's.

## 13. Stop conditions

- expected.json or verdict/flag text changes beyond §1 and §9: PR 2's declared numbers change, PR 3's additive Paddling.
- A product decision §12 doesn't cover.
- The same CI failure surviving 3 attempts.
- The plan turning out wrong, for example:
  - the OSM launch counts are too thin to time against (fewer than one flatwater launch within 60 minutes of half the
    fixtures and catalog areas);
  - the bake can't finish inside a runner's 6 hours.
