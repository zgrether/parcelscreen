# Water on the land

Zach pre-approved the brief on 2026-11-04. It was inspired by 5th World's land inspection ("drainage basins and the
influential watershed"). The feature shows where water comes from, where it goes on the parcel, and what the soils hold.
It sits outside the grade: no letter and no grade moves.

**How it runs:** a small mission on `step/water`.
- The branch stacks on `step/boulders`, because both bump `ENGINE_VERSION` and touch the same files.
- Once Zach merges the boulders hand-back, main is merged into `step/water`, and the water hand-back's diff is water only.
- I merge each PR into `step/water` when CI is green on its head. The hand-back to main is Zach's.

## 0. What's there (found while planning)

- **Flow accumulation:** `flowAccum` (`lib/screen/driveway.ts:44`) is plain D8 in cells, on the 3 m grid, with no pit
  filling. Three things read it: the trails (cells over `streamCells` are left out), the router's crossing cost, and the
  driveway's culverts. There is no flow-direction, catchment or watershed code yet.
- **Driveway crossings already come from flow accumulation:** the 3 m profile walk counts a culvert each time it
  crosses into ≥ 2 ha of contributing area (`driveway.ts:863`). NHD isn't used for them. So the brief's "count the
  driveway's drainage crossings from flow accumulation" is **already done**; this mission leaves that code and its
  threshold alone, so no culvert count or grade moves.
- **Elevation:**
  - `fetchDEM` fetches any box at any resolution, up to 2.4 M cells. A 10 m grid over a 10 km square is 1 M cells.
  - `DemCache` holds 4 grids.
  - The fine grid (3 m, parcel + 150 m) is never stored (CLAUDE.md).
- **Land cover** (`landcover.ts` `fetchLandCover`, NLCD 2021 by WCS) is fetched over the parcel's box only. There is
  no class-name table yet.
- **Roads** (`roads.ts` `fetchRoads`) is a point-and-radius query to TIGER. A box query is new.
- **Soils:**
  - The component rows already carry drainage class (`drainagecl`, `drclassdcd`), depth to water table
    (`wtdepannmin`) and hydrologic group (`hydgrpdcd`, fetched but never read).
  - Available water (`aws0100wta`) and organic matter (`om_r`) aren't read.
  - `SoilRow` is a strict, stored shape, and the recordings key on the query text. So the new values come from **a
    new, separate SDA query**, recorded append-only on the runners (`places-run.json` `record` with `append`). The
    existing query is not edited.
- **Garden:** the best garden patch has its soil (`vetGardens`). "Garden ground" is a fact on Uses' Garden row, with
  its detail in place.
- **Septic:**
  - No drainfield site is chosen. Build reads `septicClass` at the best house site, and Room to build checks gentle
    ground within `drainfieldWithinFt`.
  - The Septic detail is the card's `septic` panel (Soils, Bottomland here), which the Full report also renders.
- **Map:**
  - Kept results draw vectors (Boulder ground, Power lines).
  - The one raster, Surface (house, garden, slope), draws from the live grade's session, so it's gone after a reload.
  - A wet-to-dry gradient has to work the same way. The stored result keeps vectors only.
- **The template for an additive measurement** is Boulders: an optional field under §9.65's exception, and
  `ENGINE_VERSION` + 1 (36 → 37), with `ENGINE_CURRENT_FROM` unchanged.

## 1. The measurement (`lib/screen/water.ts`, the result's `water`)

### 1a. The upslope watershed (10 m)

- **The box:**
  - 3DEP at 10 m over the parcel plus 1 km. If the catchment touches the box's edge, the box grows to + 2.5 km, then
    + 5 km.
  - At + 5 km it stops and says so: "The watershed reaches past 5 km; shown to there".
  - That cap is in `SCREEN_CONSTANTS.water`.
- **The delineation:**
  - Depressions are filled (priority-flood), so water crosses pits and flats instead of stopping.
  - D8 flow directions.
  - Every cell whose path enters the parcel is upslope; the watershed is those cells outside the parcel.
  - Kept: its acres and its outline (the cells' boundary, simplified, as GeoJSON).
- **What it's made of:**
  - **Land cover:** NLCD shares over the watershed (forest, open and pasture, crops, developed, water and wetland), from
    one land-cover request over its box.
  - **Roads:** road miles inside it, by TIGER class, from one box query to the layers the screen already reads.
- **The largest inflow point:** where the most upslope area crosses the boundary. It's kept with that area: "Most of
  it enters at the north corner, from 31 ac".

### 1b. Flow and wetness on the parcel (3 m)

- **Accumulation:**
  - Its own D8 on the fine grid, after a depression fill.
  - It's seeded at the grid's edge with the 10 m catchment that enters there (apportioned by width), so a drainage that
    starts off the parcel isn't read as starting at the line.
  - The driveway's `flowAccum` is not touched.
- **Flow lines:**
  - Kept: cells over a contributing area of 0.5 ac (`SCREEN_CONSTANTS.water.flowLineAc`; NHD maps nothing this small),
    traced downhill into polylines, each with its contributing acres.
  - Kept inside the parcel and its 150 m margin; the 30 longest at most.
- **Topographic wetness index:**
  - TWI = ln(a / tan β): a is the specific catchment area, β the 3 m slope with a floor of 0.5°.
  - It's computed in the grade's session for the wet-to-dry overlay, and never stored.
- **Likely wet ground or seeps:**
  - Cells in the TWI's wettest band (`twiWet`) and, where the soils say so, poorly drained or with a water table within
    1 ft.
  - Kept in patches of at least 0.1 ac, each with its outline and acres, flagged "Likely wet ground or seeps".
- **Possible pond sites:**
  - On a flow line, contributing 5 to 150 ac, on ground under 5%, inside the parcel and out of the flood zone.
  - The best three, ranked by contributing area per unit of slope, at least 100 m apart, each with its point and
    contributing acres: "Possible pond site (check with a site visit)".

### 1c. Soil water (NRCS)

- **Per map unit**, from the new query (`muaggatt.aws0100wta`, and the top horizon's `om_r` on the major components,
  weighted by their share) plus the rows already read (drainage class, water table, hydrologic group):
  - available water in the top 40 in (inches);
  - drainage class;
  - depth to water table;
  - hydrologic soil group with its meaning (A drains fast … D sheds water);
  - organic matter (%).
- **For the best garden patch:** its unit's available water.

### 1d. On the result

`water: { watershed: { acres, outline, capped, cover: {…shares}, roadMi, inflow: { ll, acres } | null } | null,
flow: { lines: [{ coords, acres }], wet: [{ ll, acres, outline }], ponds: [{ ll, acres }] } | null, soils: [{ mukey,
name, awcIn, drainage, waterTableIn, hydGroup, omPct }], garden: { awcIn } | null }`.

- Each part is null when its data didn't come: no 10 m grid, no fine grid, or SDA didn't answer.
- There's no new progress step: the fetches start with the run, and the work is done in the soils step, failing soft
  (the stored step list is part of the frozen shape).

## 2. Where it shows

- **Uses › Water on the land** (under Boulders), outside the grade:
  - **The summary line:** "46 ac drains onto it, mostly forest; 2 likely wet spots, 1 possible pond site". The pieces
    are named only when found.
  - **A tap opens:**
    - the watershed (acres, land-cover shares, road miles, the largest inflow);
    - the flow lines' count and longest;
    - the wet spots and pond sites;
    - the soils table (one row per unit, plain words).
  - **The honesty line:** "An estimate from 10 m and 3 m elevation and NRCS soil maps. Water follows the bare ground
    here, not pipes or culverts. Walk it after a heavy rain."
  - No chip and no tally. An older grade shows no section.
- **Map layers › On the map › Water on the land** (off by default):
  - the watershed outline;
  - the flow lines, thicker as they gather;
  - the wet patches;
  - pond-site pins;
  - each with a tip, and key rows.
- **Map layers › Surface › Wetness:** a fourth surface beside house, garden and slope, wet (blue) to dry, from the live
  grade as the other surfaces are. After a reload it says to grade again, as they do.
- **Garden ground's detail** (Uses, Garden row): "Holds 6.2 in of water in the top 40 in". That's a new fact, last.
- **Septic's detail (the card's panel):**
  - A new line, after its existing text: "The best house site is on likely wet ground; a drainfield needs drier soil"
    when the best house site falls in a wet patch or on a water table within 2 ft.
  - It's report text the Full report also shows, so it's declared here and is purely additive (CLAUDE.md rule 7). The
    golden gains a line only for a fixture where it fires.

## 3. Numbers and text

- **Grades:** none move. Driveway culverts, routes and costs are untouched.
- **`expected.json`:** each fixture gains `water`, nothing else. `ENGINE_VERSION` 36 → 37; `ENGINE_CURRENT_FROM`
  stays 29; schema v9 stays (§9.65's exception).
- **Report text:**
  - The Septic panel's added line, where it fires.
  - The Water section is in Uses only; the Full report doesn't add it in this mission.

## 4. The work, by PR

| # | PR | What |
|---|---|---|
| 0 | This plan | |
| 1 | The hydrology | `lib/screen/hydro.ts`, pure: fill, D8, catchment, seeded accumulation, TWI, flow-line tracing, wet patches, pond sites. Tests on synthetic surfaces |
| 2 | The measurement | The fetches (10 m growing box, land cover and roads over the watershed, the SDA water query), the result's `water`, `expected.json`; the recordings appended on the runners; Mud Creek's watershed checked |
| 3 | The display | Uses' section, Map layers' Water on the land, Surface › Wetness, Garden's fact, Septic's line, e2e |
| 4 | Hand-back | Screenshots at 1280 and 375, the fresh-eyes review, the decision record, the hand-back |

## 5. Stop conditions

- A grade, a culvert count, or a fixture's `expected.json` beyond the new `water` would change.
- The Septic line would replace or move existing report text.
- The runners can't record the new requests (3DEP, NLCD, TIGER or SDA) for the fixtures.
- Mud Creek's watershed disagrees with the topo map by more than about a third, and the cause isn't found.

## 6. Tests

- **Unit:**
  - **delineation on a synthetic valley:** a V-shaped valley draining through a square "parcel" gives the upslope
    acres within a cell's width of the analytic answer; a ridge-top parcel gets none; a pit is filled and passed
    through;
  - **TWI on synthetic terrain:** a plane gives a uniform index rising downslope; a valley floor reads wetter than its
    sides; a flat gets the floor slope, not infinity;
  - flow lines and pond sites on the valley;
  - the soil-water query's rows to per-unit values;
  - Mud Creek's `water` in `expected.json`.
- **The sanity check:** Mud Creek's watershed acres and outline against the USGS topo map (its contours and NHD lines),
  in the PR and the hand-back's screenshots.
- **e2e:** the Water section on a fixture; the map toggle draws the outline, lines and its key; Surface › Wetness draws;
  Garden's fact; Septic's line where it fires.
- **Screenshots** at 1280 and 375, through the owner-field guard.

## 7. UX

- **The flow:** open Uses; the summary line answers "does water come onto this land, and where does it sit?"; a tap
  for the detail; Map layers to see it.
- **Empty:** "No land drains onto it" (a ridge-top parcel).
- **Missing data:** "Water: the elevation (or soils) didn't load; grade again".
- **Capped:** the 5 km line.
- **Older grade:** nothing.
- **Phone:** the section's rows are 44 px tap targets; the soils table becomes one card per unit at 375.
- **Colours:** blue lines and fills, apart from the boulders' amber and the power lines' cyan; the wetness surface runs
  pale (dry) to deep blue (wet), with a key.
