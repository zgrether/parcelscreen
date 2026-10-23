# Step 13: The area catalog

The owner pre-approved the brief and this plan's recommended answers (2026-10-22).

**Sources:**
- PLAN.md row 13;
- `docs/design/workflow-review.md`, "Area catalog" (the 30 areas, how an area is profiled and scored, the suggestion
  box, sample parcels);
- Zach's brief of 2026-10-22.

**Decision:** §9.68, written in the docs PR.

**Mission mode:**
- The work runs on `step/13-area-catalog`. Each row of §11 is one PR into it, which I merge when CI is green on its
  head.
- The step ends with the hand-back to main, which Zach merges.

## 0. What's there today (found while planning)

- **The engine is regional.**
  - The DEM grid is UTM 17N (`lib/geo/utm.ts`): it covers all 30 areas (83.6° W to 78.9° W).
  - The climate grid and the NOAA stations cover only 35.8–37.4 N, 82.7–79.9 W (`scripts/data-climate.mts` REGION).
    Thirteen areas are partly or wholly outside it: Highland, Bath, Nelson, and everything from Madison County south.
  - The building tiles (Privacy) have the same region. Privacy isn't an area factor, so the catalog doesn't need them
    (§12 Q4).
- **What the profiler can call per point:**
  - Elevation: `fetchDEM` + `bilinear` (`lib/screen/dem.ts`). There's no single-point helper, and a grid holds at
    most 2.4M cells.
  - Climate: `climateAt(data, ll, elevFt)`, with no requests.
  - Sky: `lpRatioAt` + `lpMag` (`lib/screen/sky.ts`). The atlas tiles are memoized; the region falls in about two of
    them.
  - Long view: `horizonProfile` + `viewOf`, on a 30 m DEM covering the point ±6 km, with no requests.
  - Drive times: `driveTable` (`lib/screen/drive.ts`), one source to many destinations, at most 1 request a second
    to the demo server (`lib/http.ts` VOLUNTEER).
- **What's missing:**
  - There's no ER list from CMS. The Hospital row uses an OSM snapshot (`lib/screen/data/hospitals.json`, with
    `emergency=yes` tags).
  - There's no airport list. Airports are the user's anchors (AVL, ROA, TRI, GSP, CLT); GSO and CHO, which the
    catalog cites, aren't among them.
  - There's no land cover anywhere in the code.
  - `arcQuery` doesn't paginate, so a PAD-US query over a whole area could come back truncated without saying so.
- **CMS from here:**
  - `data.cms.gov` refuses curl and Node fetch (Akamai answers "Access Denied" even with a browser user agent), but
    a real browser reads it.
  - The CSV has addresses but no coordinates.
- **Engine tools run under vitest** (`test/tools/*.test.ts`, gated by `--mode`), which supplies the `@/` alias and
  JSON imports. Plain `node` can't load `lib/screen/**`.
- **Grading a single factor from a raw number:**
  - No exported function does it.
  - The pieces exist: `atLeast`/`atMost`, `ROW_BANDS`, `BAND_RUNS`, `parcelGrade`, `thresholdStatus`, and
    `cardFor`, which takes plain `CardFacts`.
- **Placement and parcels:**
  - With no parcel open, nothing shows under the search box. On a phone there is no sheet at all then.
  - Nothing opens a `ScreenResult` without a saved parcel, except the rubric preview's Mud Creek sample.
  - No workflow opens a PR today.
  - A PR opened with `GITHUB_TOKEN` doesn't trigger other workflows, so CI wouldn't run on it unless it is dispatched.

## 1. The rules

- **The catalog stores no hand-entered numbers.**
  - Each area is a name, an outline and a two-line description of the place (§2.2), which makes no claim about
    distances, care or height.
  - Everything else is computed by the profiler and refreshed monthly.
- **The same pipeline code as a screen.**
  - The profiler calls `lib/screen/**`'s own functions per point: DEM, sky, climate, drive tables, Long view. It
    runs headless in Node, under vitest like the other engine tools.
  - New pure code (sampling, aggregation, scoring) lives in `lib/areas/**`, DOM-free like `lib/screen`.
- **Area-scale factors only:**
  - Elevation, Night sky, Climate, Hospital (ER), Town (groceries), Airport, Trails and public land, Long trail and
    Long view.
  - Left out because they vary parcel by parcel: winter sun, room, driveway, garden, septic, flood, access and
    easement, privacy, satellite internet and budget.
- **Grades at display time** under each person's rubric, as for parcels. Nothing about a person is stored with an
  area.
- **Versioned files, clean breaks.**
  - Each area file carries its format version, and lives under `public/areas/v1/`.
  - A format change starts `v2/` and drops `v1/`; nothing converts.
- **Schema v9 stays frozen.** The catalog doesn't touch `ScreenResult`. Sample parcels are ordinary v9 results (§5).

## 2. The areas

### 2.1 Outlines

**Method:** unions of Census county subdivisions (TIGERweb `County Subdivisions`), so each is clipped to its county.
They're trimmed by hand where an area is smaller than its subdivision, either with a meridian or parallel cut or a
circle, and towns are removed where the area is the outskirts. Each recipe lives in `scripts/areas-outlines.mts`. Its
output is simplified to about 50 m and committed. Outlines are built once and rebuilt by hand; they aren't part of
the monthly refresh.

| # | Area | Recipe (county: subdivisions; trim) | mi² |
| --- | --- | --- | --- |
| 1 | Grayson Highlands (Volney, Troutdale) | Grayson VA: Wilson Creek district, east of 81.58° W (Mud Creek's fixture falls inside) | 181 |
| 2 | Whitetop and Konnarock | Grayson: Wilson Creek; Smyth: Rye Valley; west of 81.58° W | 40 |
| 3 | Independence and Fries | Grayson: Elk Creek, Providence, Old Town districts | 253 |
| 4 | Floyd | Floyd VA, whole county | 382 |
| 5 | Hillsville and Fancy Gap | Carroll VA: Sulphur Springs, Piper Gap, Fancy Gap | 268 |
| 6 | Meadows of Dan | Patrick VA: Blue Ridge district, north of 36.69° N (above the escarpment; Stuart left out) | 47 |
| 7 | Sugar Grove and Marion | Smyth VA: Rye Valley, Park, Royal Oak; east of 81.58° W | 138 |
| 8 | Damascus | Washington VA: Taylor district | 131 |
| 9 | Burkes Garden | Tazewell VA: Southern district, within 3.4 mi of the bowl's centre | 28 |
| 10 | Highland County (Monterey) | Highland VA, whole county | 416 |
| 11 | Bath County | Bath VA, whole county | 534 |
| 12 | Nelson highlands (Montebello) | Nelson VA: West, Central | 222 |
| 13 | Blacksburg outskirts | Montgomery VA: districts A, C, E, F, G, less the towns of Blacksburg and Christiansburg | 221 |
| 14 | Sparta | Alleghany NC, whole county | 236 |
| 15 | Ashe County (West Jefferson, Lansing) | Ashe NC, whole county | 429 |
| 16 | Boone and Blowing Rock | Watauga NC, less Laurel Creek township | 287 |
| 17 | Banner Elk and Beech Mountain | Avery NC: Banner Elk, Beech Mountain, Elk Park, Heaton, Cranberry, Linville; Watauga: Laurel Creek | 108 |
| 18 | Spruce Pine and Little Switzerland | Mitchell NC: Grassy Creek, Snow Creek, Cane Creek (Little Switzerland's McDowell side left out: one county) | 97 |
| 19 | Burnsville and Celo | Yancey NC, whole county | 313 |
| 20 | Madison County (Mars Hill, Hot Springs) | Madison NC, whole county | 451 |
| 21 | North Buncombe (Weaverville, Barnardsville) | Buncombe NC: Reems Creek, Ivy, Flat Creek | 126 |
| 22 | Haywood highlands (Waynesville) | Haywood NC: Waynesville, Ivy Hill, Jonathan Creek, Pigeon, East Fork, Cecil | 260 |
| 23 | Brevard and Pisgah | Transylvania NC, whole county | 380 |
| 24 | Highlands and Cashiers | Macon NC: Highlands; Jackson NC: Cashiers, Hamburg | 166 |
| 25 | Franklin and Otto | Macon NC: Franklin, Smithbridge, Cartoogechaye, Millshoal, Cowee, Ellijay, Sugarfork | 329 |
| 26 | Roan Mountain | Carter TN: District 2 | 109 |
| 27 | Shady Valley and Mountain City | Johnson TN: Districts 1, 2, 3, 5, 6, 7 | 239 |
| 28 | Butler and Watauga Lake | Johnson TN: District 4; Carter TN: District 6 | 156 |
| 29 | Unicoi and Erwin | Unicoi TN, whole county | 186 |
| 30 | Cosby | Cocke TN: Districts 5, 1 | 235 |

National forest and park land inside an outline is excluded by the sampling (§3.1), not by the outline.

**The 30 outlines:**
- [All thirty, numbered](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-all.png?raw=true)
- [Virginia](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-va.png?raw=true)
- [North Carolina](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-nc.png?raw=true)
- [Tennessee](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-tn.png?raw=true)

![The thirty outlines](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-all.png?raw=true)

![Virginia](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-va.png?raw=true)

![North Carolina](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-nc.png?raw=true)

![Tennessee](https://github.com/zgrether/parcelscreen/blob/pr-assets/step13/plan/outlines-tn.png?raw=true)

### 2.2 Descriptions

Each description is two short lines about the place: its landmarks and character, never a number that can go stale.
The why and trade-off lines are computed (§4.3). For example:
- Grayson Highlands: "High pastures under Mount Rogers and Grayson Highlands State Park. Troutdale and Volney, at the
  New River's headwaters."
- Highland County: "Virginia's least-populated county, all ridges and valleys along the West Virginia line. Monterey
  and the Bullpasture and Cowpasture valleys."

The design doc's "fits people who want" column is the source. Its "trade-off" column isn't used, since that's
computed now. All 30 are in PR 2 for review.

## 3. Profiling

### 3.1 Sampling

- **Candidates:** about 200 points per area, drawn by a seeded generator. The seed is the area's id, so the same
  points come back month to month and a diff shows the data's changes, not the sampling's.
- **Rural land only.** A candidate is rejected if it falls on:
  - **NLCD 2021 Land Cover** (MRLC's WCS, one GeoTIFF per area at 30 m) open water (11), or developed land of low,
    medium or high intensity (22, 23, 24). Developed open space (21) stays in, because rural homesites and road
    margins are class 21 (§12 Q2).
  - **Any PAD-US fee land**, whatever its access, because public land can't be bought (§12 Q3). The query is
    paginated over the area's box.
- **Stopping:** draw until 200 are accepted, or 5,000 candidates. An area with fewer than 100 accepted says so in its
  file (`thin: true`), and its shares carry the note.

### 3.2 What's measured at each point

| Measure | How | Requests per area |
| --- | --- | --- |
| Elevation (ft) | `fetchDEM` at 30 m in tiles of at most 2.4M cells (the area plus 6 km, overlapping by 6 km), then `bilinear` | 1–4 |
| Long view | `horizonProfile` (72 rays, 6 km) + `viewOf` on the same tiles: open share past 3 mi (§12 Q8) | 0 |
| Night sky (mag/arcsec²) | `lpRatioAt` + `lpMag`, the zenith reading the Night sky row grades | 0–3 (atlas tiles, memoized) |
| Climate (Jan low, Jul high) | `climateAt` at the point's elevation, on the grid extended to the catalog's extent (§3.4) | 0 |
| ER (min) | OSRM table to the CMS hospitals with an ER (§3.4), the 3 nearest per point | in the tables |
| Groceries (min) | OSRM table to supermarkets from one Overpass query per area: the nearer of the nearest chain and of any store, as the Town row reads them | 1 Overpass, then tables |
| Commercial airport (min) | OSRM table to FAA primary airports (§3.4), the 3 nearest per point | in the tables |
| Trails and public land | Straight-line distance to open (`Pub_Access = OA`) PAD-US land; OSRM table to the 3 nearest trailheads (OSM `highway=trailhead`, in the same Overpass query) | in the tables |
| Long trail (min) | OSRM table to the step 11 access points (`LONG_TRAILS`), the 6 nearest per point | in the tables |

**OSRM:**
- Destinations are the union of each point's nearest candidates, about 30–45 an area.
- Points go in batches, so each table has at most 100 coordinates: about 4 requests an area, 120 a month.
- That's within the demo server's 1 request a second.

`docs/commercial-review.md` gains the bulk use: OSRM tables, Overpass, MRLC WCS, 3DEP, PAD-US, CMS and FAA, each with
its monthly count.

### 3.3 The file

**`public/areas/v1/<id>.json`** holds:
- `version: 1`;
- `id`, `name`, `description` and `outline`;
- `profiledAt`, and `sources` (each with its date);
- `points`: per-point values as columns of numbers, `null` where a measure failed;
- `medians` and `thin`.

**`public/areas/v1/index.json`** holds:
- the ids, names and `profiledAt`;
- each outline's box, so the map can show outlines before any area file loads.

Files are fetched on demand. The suggestion box fetches all thirty, about 15 KB each gzipped, the first time it shows,
then keeps them for the session. A zod schema checks every file; a file that fails it is left out with a line (§6
States).

### 3.4 Data the profiler needs

- **The climate grid, extended** to the catalog's extent (34.9–38.6 N, 83.8–78.6 W):
  - Same PRISM 1991–2020 normals and NOAA stations, regenerated by `pnpm data:climate` with the wider REGION.
  - Cells inside today's region are byte-identical, and a test checks it. The file grows from 537 KB to about 2.2 MB
    and stays a lazy chunk.
  - Parcels in all thirty areas gain Climate (§12 Q5).
  - **The risk:** a fixture near the old edge could pick a newly included NOAA station for snow and frost.
    `pnpm expected` shows it; any fixture change is a stop (§9).
- **The CMS ER list:**
  - `pnpm data:er` reads CMS Hospital General Information through a Playwright browser, because Akamai refuses Node.
  - It keeps Emergency Services = Yes in VA, NC, TN, KY, WV, SC and GA, and geocodes the addresses with the Census
    Geocoder's batch API (public domain).
  - It writes `lib/areas/data/er.json` with the CMS release date and checks it with zod.
  - Addresses the geocoder can't match are listed in the PR and placed by hand from the OSM snapshot, by name and
    town.
  - Parcel screens keep the OSM snapshot; moving them to CMS is follow-up 42.
- **Commercial airports:** `lib/areas/data/airports.json`.
  - These are the FAA's primary commercial service airports (CY2024 enplanements), with their FAA coordinates, within
    150 mi of the catalog.
  - They are TRI, AVL, ROA, GSO, CHO, CLT, GSP, TYS, LYH, SHD, LWB and CRW, written by `pnpm data:airports`.
  - The parcel's Airport row is unchanged: it still reads the user's anchors.

### 3.5 Where it runs

- **The engine part:** `test/tools/area-profile.test.ts` (`pnpm areas:profile`, vitest `--mode areas`). It uses
  `createHttpClient({env: "node"})` with `SERVER_USER_AGENT` and the VOLUNTEER throttle.
- **The pure part:** `lib/areas/profile.ts` (sampling, aggregation, the file), with its I/O injected.
- **A full run:** 30 areas take about 30–40 minutes, almost all of it waiting on OSRM's throttle.

### 3.6 The monthly refresh

`.github/workflows/areas-refresh.yml` runs on `schedule: "23 7 3 * *"` (the 3rd, 07:23 UTC) and on `workflow_dispatch`.
It:
1. installs, runs `pnpm data:er`, then `pnpm areas:profile`;
2. writes `tmp/areas-summary.md` (`lib/areas/summary.ts`);
3. if anything changed, pushes `areas/refresh-YYYY-MM` and opens a PR titled "Area catalog refresh" whose body is the
   summary. Its permissions are `contents: write` and `pull-requests: write`.

**The summary:**
- One line per change worth reading. A median moves by at least 1 minute, 50 ft, 0.1 mag, 1 °F or 2 points of Long
  view share, or the thin flag changes. For example: "Meadows of Dan: ER 41 → 18 min".
- Then a line for each source's new date, and the count of areas unchanged.
- Nothing changed means no PR.

**CI on the refresh PR:** a PR opened with `GITHUB_TOKEN` doesn't start other workflows, so the job runs
`gh workflow run ci.yml --ref <branch>`, and `ci.yml` gains `workflow_dispatch` (§12 Q12). The checks attach to the
commit, so the PR shows them.

Zach merges the refresh PR; nothing merges itself.

## 4. Scoring

### 4.1 The fit letter

- The person's rubric grades each area-scale factor at the area's **median**, with the same bands, the same letter
  edges and the same rules as a parcel's row. For example, Trails is an A when the median point adjoins open land
  (20 m); otherwise it's graded on the trailhead drive, raised to at most B when open land is within the band's
  distance.
- Then `parcelGrade` over those rows, with the person's weights and Don't care, gives the **fit letter**.
- A factor with no reading in an area is left out of its letter, as a parcel's ungraded row is.
- **The pure function:** `areaCard(area, namedRubric)` in `lib/areas/score.ts`. It builds `Row`s from the medians, so
  every rule is the card's own, and it shares `ROW_BANDS` and the row grading (exported from `card.ts` where needed,
  without changing their output).

### 4.2 Musts as a share

- **The share:** of the area's points, the share where every Must on an area-scale factor passes (`thresholdStatus`
  per point). For example: "41% of rural land here is above 3,000 ft and within 30 minutes of an ER."
- **Parcel-scale Musts** (Floodplain, access, easement, septic) are parcel matters. The card says once that they're
  checked parcel by parcel.
- **No area-scale Musts:** the share reads "Your must-haves are checked parcel by parcel."
- **Under 10%** (`SCREEN_CONSTANTS.areas.minMustShare`, a new config value) and the area isn't suggested. Show more
  lists it last, with its share.

### 4.3 The why and trade-off lines

- **Why:** the two heaviest factors in the person's rubric that earn an A or B here, in the interview's words, with
  their median. For example: "Dark skies (zone 2b) and 3,400 ft land."
- **Trade-off:** the factor that costs the most points (weight × points below a B), with its median. For example:
  "48 minutes to an ER." With none, it reads "Nothing below a B for you."

### 4.4 The ranking

- **Order:** suggestable areas first, by fit points, then Must share, then name.
- **The top five** are the suggestions; Show more ranks the rest the same way.
- **Each household member** gets their own ranking under their rubric. A rubric switch (`RubricSwitch`, as on the
  card and in Compare) shows another member's, one tap away.
- A member with no priorities yet gets "Answer as {name}", as in the household section.

## 5. Sample parcels

- **Two per area**, 10–30 ac, no house.
- **Picking them:** `test/tools/area-samples.test.ts` (`pnpm areas:samples`, live, run by hand):
  1. It walks the area's sample points nearest the area's median elevation.
  2. At each, it asks the state's parcel service for the parcel there (VGIN, NC OneMap, TN).
  3. It keeps parcels of 10–30 ac that touch no PAD-US land and no Microsoft building footprint. The footprints are
     fetched for the parcel's tile into `tmp/` and not committed (§12 Q4).
  4. It screens the two it keeps with the full engine, as `pnpm expected` does.
- **What ships** (`public/areas/v1/samples/<id>-<n>.json`): the boundary, the acres and the v9 `ScreenResult`.
  - No owner name, site address, parcel number or other attribute (§9.23).
  - The name is the app's: "Sample parcel 1 · Grayson Highlands".
- **Refreshed by hand,** not monthly: each is a full screen, too heavy for the volunteer services monthly.
  - A unit test fails when a sample's `schemaVersion` isn't `SCREEN_SCHEMA_VERSION` or its engine is older than
    `ENGINE_CURRENT_FROM`, so a clean break can't leave stale samples behind; the fix is `pnpm areas:samples`.
- **Opening one:** "Show me a parcel here" on an area's card opens its first sample on the map, read-only.
  - Its boundary is shown, and its card is graded under the viewer's rubric, the household's one tap away.
  - It's labelled "Sample parcel" and has "Add to list". Another button shows the area's other sample.
  - Read-only means no Mark, no boundary edit, no Grade again and no notes. The action bar shows only Add to list.
- **Add to list** makes it a parcel like any other: the boundary as a piece, and the shipped result as its first
  screen (`addScreen`). The viewer can then mark, edit and grade it as usual.

## 5a. The map

- **Map layers › On the map** gains "Area outlines" (`ps.areas`, per device, default off). It shows all thirty, with
  their names on hover or tap.
- **Starred areas** (★ on a card) show their outline whatever the toggle says, labelled with the name.
  - Stars are per profile (`ps.areaStars`, a profile key, synced with the profile like its other keys).
  - Tapping an outline opens its card.

## 6. UX

**The main flows:**
- **After the interview** (3 taps to a parcel): the result screen shows "Areas that fit you", with five cards above
  the buttons. Show me a parcel here opens the map on the sample.
- **On the map with nothing open** (2 taps): "Where to look" sits under the search box when it's empty. It's docked
  on a desktop; on a phone, opening search shows it. The cards are the same, compact.
- **Pin an area** (1 tap): ★ on a card. Its outline stays on the map.

**What's seen first:** each card leads with the fit letter and the area's name, then the Must share. The why and
trade-off lines come under them, then "Show me a parcel here". Show more lists the rest ranked, one line each: the
letter, the name and the share.

**States:**
- Loading: five card skeletons; the box keeps its height.
- One or more files failed: "N areas didn't load", with Try again; the others still rank.
- No rubric yet: "Answer the questions first", with a link to the interview.
- Every area under 10%: "No area passes your must-haves on 10% of its land", with Show all ranked.
- A thin area (under 100 points): its share says "from N points".
- A sample that won't load: "This sample didn't load", with Try again.

**Plain words:**
- "Fit" for the letter; "of rural land here passes your must-haves" for the share.
- "Sample parcel" on the sample.
- "Area outlines" for the layer.
- No "median" on the card. The detail panel says "on a typical piece of rural land here (the median of N points)".

**At 375 px:**
- Cards stack full width.
- Show me a parcel here and ★ are each at least 44 px.
- The rubric switch chips wrap.
- Where to look scrolls inside the search panel, under the box.

**Contrast and consistency:**
- The letter chip is the card's `card-grade` with its colours.
- Outlines use the saved-parcel outline style, dashed, so they read as areas, not parcels.
- Starred outlines are solid.

## 7. Settings and storage

| Key | Scope | Default |
| --- | --- | --- |
| `ps.areas` (outlines layer) | device | off |
| `ps.areaStars` | profile, synced | none |

No Supabase table or migration. No settings screen changes.

## 8. Strings (declared; rule 7, additive)

**New strings only.** Existing card, answer and report text is unchanged.
- **The box:** "Areas that fit you" (the interview) · "Where to look" (the map) · "Show more" · "Show fewer".
- **A card:** "Fit {A–F}" · "{n}% of rural land here passes your must-haves" · "Your must-haves are checked parcel by
  parcel." · "Show me a parcel here" · "Star this area" / "Starred".
- **The why and trade-off:** "{factor phrase} and {factor phrase}" · "Nothing below a B for you." The phrases are
  `lib/areas/words.ts`'s, one per factor: "Dark skies (zone {z})", "{ft} ft land", "An ER in {min} min", and so on.
- **The detail:** "On a typical piece of rural land here (the median of {n} points)" · "Parcel-scale must-haves
  (floodplain, road access, easement, septic) are checked parcel by parcel."
- **States:** "{n} areas didn't load" · "Try again" · "Answer the questions first" · "No area passes your must-haves
  on 10% of its land" · "Show all ranked" · "from {n} points".
- **Sample:** "Sample parcel" · "Sample parcel {n} · {area}" · "Add to list" (existing) · "Show the other sample" ·
  "This sample didn't load".
- **Map:** "Area outlines".
- **The refresh PR:** "Area catalog refresh" · "{area}: {measure} {old} → {new} {unit}" · "{n} areas unchanged" ·
  "{source}: {date}".

**Numbers:**
- A new config value: `areas.minMustShare` = 0.10 (the brief's 10%).
- No threshold, weight or unit cost changes.
- `expected.json` doesn't change; §3.4's climate risk is the one watched.

## 9. Stop conditions

- `expected.json` or verdict/flag text changing; the climate extension is the watched case;
- a source's terms forbidding the monthly bulk use or the shipped samples ("Stop and say which.");
- the same CI failure surviving 3 attempts;
- a product question this plan doesn't answer;
- the plan turning out wrong. For example: OSRM's demo server refusing tables of 100, or the CMS file unreachable from
  GitHub's runners with no browser route.

## 10. Test plan outline

**Unit:**
- **A synthetic area** (a square, an injected land-cover raster and PAD-US polygons):
  - sampling never accepts water, developed or public-land points;
  - the seed repeats;
  - `thin` appears under 100 points.
- **Must shares:** one Must, two Musts, none, and a parcel-scale Must ignored.
- **The 10% rule** and the ranking order.
- **`areaCard`** matches `cardFor` on the same medians, row for row: the same letters as a parcel with those numbers.
- **Why and trade-off:** the heaviest two A/B factors, and the costliest.
- **The summary:**
  - renders the brief's example line from a constructed pair;
  - skips changes under the thresholds;
  - "no changes" gives no PR body.
- **Files:**
  - every `public/areas/v1/*.json` passes the schema;
  - outlines are valid and inside their counties;
  - samples are v9, of a current engine, and carry no owner fields (a key scan).
- **The climate extension:** today's region's cells are byte-identical.

**Grayson Highlands profiled in CI from a recording** (`test/fixtures/areas/grayson-highlands/network.har`):
- 40 points at a 90 m DEM keep the recording small.
- Where the requests match Mud Creek's recording (the atlas tile, the hospitals), its bytes are reused.
- The test checks the file, the medians and that two runs are identical.

**e2e:**
- After the interview, Areas that fit you shows five cards. Show me a parcel here opens a sample read-only, and Add to
  list puts it on the list with its grade.
- On the map with nothing open, Where to look shows; the rubric switch changes the order.
- Star an area: its outline shows with the layer off, and the star outlasts a reload.
- Area outlines toggle.

**Screenshots, at 1280 and 375:**
- the suggestion box after the interview and on the map;
- Show more;
- outlines on the map, starred and all;
- an area's detail;
- a sample parcel, before and after Add to list.

**The fresh-eyes review** before the hand-back. Its unfixed findings go to `polish.md`.

**Hand-back test plan:** about 25 minutes on the preview, desktop then phone, with the fixture parcels and the
Grayson Highlands area.

## 11. PRs, into `step/13-area-catalog`

| PR | What |
| --- | --- |
| 0 | This plan, with the outline maps |
| 1 | The catalog's data: the climate grid extended (§3.4), `pnpm data:er` (CMS, geocoded), `pnpm data:airports` (FAA), and `docs/commercial-review.md` |
| 2 | The areas: `scripts/areas-outlines.mts`, the 30 outlines and descriptions, `lib/areas/` types and schema, and `index.json` |
| 3 | The profiler: sampling (NLCD, PAD-US paginated), the measures, OSRM batching, the file; the synthetic-area tests and the Grayson Highlands recording; the first full run's 30 files |
| 4 | The monthly refresh: the workflow, the summary and its test, `ci.yml`'s `workflow_dispatch` |
| 5 | Scoring: `areaCard`, Must shares, the 10% rule, why and trade-off, the ranking |
| 6 | The suggestion box: Areas that fit you, Where to look, Show more, the rubric switch, stars; the outline layer |
| 7 | Sample parcels: `pnpm areas:samples`, the 60 samples, read-only opening, Add to list |
| 8 | The fresh-eyes fixes and the docs: §9.68, PLAN row 13, REQUIREMENTS §3n, CLAUDE.md if needed, `polish.md` |

Then the hand-back from `step/13-area-catalog` to main.

If #286, #287 or #288 merge to main while the step runs, main is merged into the step branch.

## 12. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Outline method:** county subdivisions, clipped to the county, trimmed by hand (§2.1), as the brief recommends.
   The maps are above; Zach can redraw any of them in review.
2. **Developed land:** NLCD 2021's classes 22–24 and open water (11) are out. Developed open space (21) stays in,
   because it holds rural homes and road verges. Annual NLCD isn't on MRLC's WCS.
3. **Public land:** all PAD-US fee land is excluded from sampling. Distance to public land counts only open-access
   land, as the Trails row does.
4. **Building footprints:** not extended. Privacy isn't an area factor, and the sample tool fetches footprints for
   its candidates only, without committing them (about 20 MB saved).
5. **Climate beyond today's region:** extend the shipped grid to the catalog's extent, so parcels in every area get
   Climate too. The alternative was a profiler-only grid; that would leave parcels in thirteen areas without the
   Climate row the catalog shows.
6. **ERs:** from CMS, geocoded by the Census Geocoder, for the catalog only. The parcel screen stays on OSM for now
   (follow-up 42).
7. **Airports:** the FAA's primary commercial service airports. The parcel's Airport row keeps the user's anchors.
8. **Long view:** included, since it costs nothing once the DEM tiles are there.
9. **Trails at area scale:** graded as on a parcel: adjoining open land, then trailhead drives, with open land within
   the band raising to B.
10. **Sample parcels:** refreshed by hand. A test catches a clean break that would strand them.
11. **Show me a parcel here:** opens the first sample. "Show the other sample" opens the second.
12. **The refresh PR's CI:** dispatched by the refresh job (`ci.yml` gains `workflow_dispatch`).
13. **Where to look on a phone:** in the search panel, under an empty box, because the sheet is hidden with no parcel
    open.
14. **Stars:** per profile and synced. The outlines layer is per device and off by default.
15. **Files:** one per area under `public/areas/v1/`, plus `index.json`, as the brief says. The box fetches all thirty
    on first show (about 450 KB gzipped in all).

## 13. Decision

phase-0.md §9.68, written in PR 8.
