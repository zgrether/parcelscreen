# Step 16: Public land and motor-vehicle routes (plan)

Zach's brief, 2026-10-28, pre-approved: two new Map layers, Public land (PAD-US) and Motor-vehicle routes (the Forest
Service's MVUM), both off by default. A small mission into `step/16-public-lands` (three PRs after this one), with the
hand-back to main as the last action. Proportionate verification (CLAUDE.md, 2026-10-25). **No grade, engine, schema or
report change.** Public land's grading (adjoins, distance) stays as it is; the layer only draws it.

## 0. What the probe found (found while planning)

This session can't reach `services.arcgis.com`, `tiles.arcgis.com` or `apps.fs.usda.gov`, so PR 0 adds a probe
(`scripts/probe-public-lands.mjs`, run by `.github/workflows/public-lands.yml` on CI's runners, as step 14c's lidar
screenshot does) and the plan rests on what it recorded over four rounds (each round replaced the last in `pr-assets/step-16/probe/`). The findings:

- **PAD-US.** USGS's own ArcGIS Online organisation (`services.arcgis.com/v01gqwM5QqNysAAi`, owner `mcroft@usgs.gov_USGS`)
  serves PAD-US 4.1:
  - **`Fee_Managers_PADUS`** is the layer the engine already asks (fee land only);
  - **`Manager_Name_PADUS`** has the same fields and holds every feature class: Fee, Easement, Designation (wilderness,
    roadless areas, the NRA, overlapping the fee land), Proclamation and Marine;
  - **the fields the layer needs:**
    - `Unit_Nm`, the name;
    - `Mang_Type`, `Mang_Name` and `Loc_Mang`, the manager;
    - `Des_Tp` and `Loc_Ds`, the designation;
    - `Pub_Access`, the public access (OA open, RA restricted, XA closed, UK unknown);
    - `Src_Date`, the source date;
    - `FeatClass`, `EsmtHldr` and `GIS_Acres`;
  - **both allow browser requests** (`Access-Control-Allow-Origin: *`) and answer JSON, GeoJSON and PBF;
  - **the data has gaps:**
    - many records carry an unknown manager (`UNK`);
    - **Pond Mountain Game Land** is one of them: `UNK`, designation "State Other", open access;
    - some units appear twice, once with the manager and once without: Grayson Highlands State Park, Old Flat State
      Forest;
    - a tap on Pond Mountain finds six overlapping records:
      - the Cherokee National Forest's edge;
      - the game land;
      - two NC Land and Water Fund records;
      - a Conservation Fund preserve;
      - a state easement.
- **USGS's PAD-US vector tile services** (`PADUS_Management_Areas_Manager_Type`, `…_Designation_Type`, and 40 more)
  are fast and small: 19–47 KB at zoom 9, about 10 KB at zoom 12. But their tiles carry only a style index (`_symbol`):
  no name, no access and no ID. They can't style by access, can't tell a game land from other state land, and can't
  tie a tap to a unit.
- **The feature service never clips to the tile.** Asked as ArcGIS's own map viewers ask (quantized, `resultType=tile`),
  it still returns whole features. So one tile's answer holds every unit touching it, whole:
  - the Jefferson National Forest (711,977 ac, multipart), simplified to about 20 m, is about 290 KB;
  - a zoom-11 tile over Pond Mountain is 614 KB (43 units);
  - a zoom-9 tile is 535–874 KB (469–485 units);
  - each answers in 0.3–2.6 s.
- **The tap's own question is cheap.** A point query, attributes only, takes about 0.2 s and returns every unit under
  the point.
- **MVUM.** `apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer`, layer 1 (roads) and layer 2 (trails),
  allows browser requests and answers GeoJSON. A zoom-11 tile is 0–2 KB. Its classes:
  - **roads:** `symbol` 1/2 all vehicles; 3/4 highway-legal vehicles only; 11/12 special designation (yearlong, then
    seasonal);
  - **trails:** 5/6 all vehicles; 7/8 vehicles 50" or less in width; 9/10 motorcycles; 16/17 wheeled vehicles 50" or
    less; 11/12 special designation;
  - **each route's fields:**
    - `seasonal` ("yearlong" or "seasonal");
    - per vehicle class, open or not, with its dates ("04/01-01/10");
    - `id`, the route number, and `name`;
    - `forestname` and `districtname`.
  - **There's no date field.** The layer carries no MVUM publication date, and no editing date either.
  - **No dispersed camping anywhere.** No field in either layer marks dispersed-camping corridors, and none of the
    Forest Service's 150 enterprise services (`EDW`) has one: the paper MVUMs draw them, the data doesn't.
- **Spearhead Trails** (SW Virginia) publishes no trail data of its own:
  - only third-party copies exist on ArcGIS Online, a Virginia Tech account's and The Nature Conservancy's edit, each
    with no licence;
  - the Southwest Regional Recreation Authority's own item is a hazard-report form.
  - So it's **not available**, and it's listed in `docs/commercial-review.md` as such.

## 1. Scope

### 1.1 Map layers › Public land (off by default)

- **The source** (§2): PAD-US 4.1's `Manager_Name_PADUS`, the same database and version as the engine's
  `Fee_Managers_PADUS`, Fee and Easement records only (Designation records overlap the fee land and would double it).
- **Colour by manager**, five colours (§3.1). The manager comes from PAD-US's agency, then its designation, then the
  unit's name, so Pond Mountain Game Land reads as a game land though its manager is unknown:
  - national forest;
  - national park, including the Blue Ridge Parkway;
  - state parks and forests;
  - state game lands and WMAs;
  - other public land.
- **Public access drives the style:**
  - open: a solid fill;
  - restricted or unknown: hatched;
  - closed: an outline only.
- **Conservation easements** (usually private land) get their own outline: a dashed magenta line with no fill. Their
  card says "Private land under a conservation easement; no public access unless stated."
- **A tap** (§4) opens a card: each unit's name, manager, access, designation and source date, plus "Adjoins this
  parcel" when a parcel is open and the unit is within 20 m of it (the engine's own rule, `adjoinsBufferKm`).
- **A legend** in Map layers under the toggle (§6), and one info line.
- **Shown from zoom 9.** Below that, the hint reads "Zoom in to see public land". Zooms 9 to 11 are drawn from a coarser,
  simplified copy (§2).

### 1.2 Map layers › Motor-vehicle routes (off by default)

- **The source:** the MVUM's roads and trails (`EDW_MVUM_01` layers 1 and 2), Forest Service system routes only (the
  `symbol` values above), from zoom 11 up ("Zoom in to see motor-vehicle routes" below).
- **Style by what's allowed**, five line colours (§3.2):
  - highway-legal vehicles only;
  - all vehicles;
  - ATVs and side-by-sides (50" or narrower, as MVUM classes them);
  - motorcycles only;
  - special designation (see the MVUM).
- **Seasonal routes are dashed.**
- **Dispersed-camping corridors:** none are drawn. The data has none (§0); the legend's note says the paper MVUM marks
  them.
- **A tap** on a route opens its card:
  - its name and number;
  - what's allowed, with each class's dates;
  - its season;
  - its forest;
  - the MVUM date (§9 Q2).
- **The layer's info line:** "On national forests, motor vehicles may use only designated routes. Check the current
  Motor Vehicle Use Map before driving."
- **Spearhead Trails:** not available (§0).

### 1.3 Both

- **Offline:** both layers work with the offline tile cache and Save offline (§5).
- **Terms** go in `docs/commercial-review.md` (§7).
- **Remembered per device** (`ps.publicLand`, `ps.mvum`), like Power lines; never part of UserConfig or a run's settings.
- **Stacking:** above the basemap, lidar terrain and light pollution, below parcel lines, the scrim, the app's own lines
  and the places. Routes draw above public land.
- **Attribution** while on: "Public land: USGS PAD-US 4.1" and "Routes: U.S. Forest Service MVUM".

## 2. How the layers get their data (the recommendation)

**Recommended: the feature services, asked by fixed map tiles at two detail levels, drawn by MapLibre as GeoJSON.**

- **Public land, two levels:**
  - **coarse:** zoom-9 tiles, simplified to one zoom-9 pixel (`maxAllowableOffset` 0.00275°, about 250 m), drawn at
    zooms 9 to 11;
  - **fine:** zoom-11 tiles, simplified to about 5 m (0.00005°), drawn from zoom 11 up.
- **Every request is a GET with a `{bbox-epsg-3857}` template.** It's the tile's own box, like Slope's, so its URL is
  fixed for the tile. The offline cache and Save offline key it exactly as they key Slope (`lib/offline/tiles.ts`), with
  no new matching.
- **A unit that crosses tiles comes back whole in each.** The layer keeps each unit once, by `OBJECTID` and level, and
  draws whole units, so there are no seams at tile edges.
- **Each tile is fetched once a session,** through `lib/http.ts`'s browser client, as parcel lines are, and only for
  the tiles in view.
- **A view's weight:**
  - zoom 12 over Mount Rogers: one to four zoom-11 tiles, about 0.6–3 MB of GeoJSON before compression (the services
    compress with Brotli);
  - zoom 9: four to six zoom-9 tiles, about 3–5 MB;
  - each tile 0.3–2.6 s.
  - Heavy for a phone at zoom 9, but bounded, once a session, and kept by the offline cache. The probe's numbers are
    the evidence.
- **The tap reads the drawn features' own attributes:** no extra request, and it works offline.
- **MVUM:** one level, zoom-11 tiles, simplified to one zoom-11 pixel; each tile is a few KB.

**Not recommended:**
- **USGS's vector tiles.** Fast, but they can't style by access, can't tell game lands apart, and can't tie a tap to
  a unit (§0). They would mean a second request for every tap and a style that ignores access.
- **A hybrid** (vector tiles to zoom 11, the feature service above): two looks for the same land, with game lands
  changing colour at zoom 11.
- **Baking PAD-US** into static tiles, as the places are: tens of MB in the repo for three states, and a yearly
  re-bake. If the live layer proves too slow on Zach's phone, baking is the follow-up.

## 3. Styles

### 3.1 Public land

The category is pure (`lib/publicLand/classify.ts`), tested on the probe's real records:

| Category | Rule, first match wins | Fill |
|---|---|---|
| Conservation easement | `FeatClass` Easement | none; dashed magenta outline `#b0307a` |
| State game lands and WMAs | `Mang_Name` SFW, or the name says Game Land, Wildlife Management Area or WMA | `#b07d12` (amber) |
| National forest | `Mang_Name` USFS, or `Des_Tp` NF or NG | `#2f6b3a` (dark green) |
| National park | `Mang_Name` NPS, or `Des_Tp` NP, NM, NLS or NT | `#8a5a2b` (brown) |
| State parks and forests | `Des_Tp` SP, SREC, SRMA or SW; `Mang_Name` SPR, SDC or SDNR with a state designation; or the name says State Park or State Forest | `#1f7f86` (teal) |
| Other public land | everything else: other federal, local, regional, NGO, private, unknown | `#5d6f8c` (slate) |

- **Access:**
  - OA: the colour at 35% fill, with a 1.5 px outline;
  - RA and UK: a diagonal hatch in the colour (an image made at runtime per colour), with the same outline;
  - XA: the outline only, dashed.
- **Duplicate records:** drawn as they come; the card merges them (§4).

### 3.2 Motor-vehicle routes

Each route is a coloured line over a dark casing (#1b1f1c at 60%), so it reads on aerials and topo. Its width is
3 px from zoom 14, 2 px below.

| Class | MVUM `symbol` | Colour |
|---|---|---|
| All vehicles | roads 1, 2; trails 5, 6 | `#d7263d` (red) |
| Highway-legal vehicles only | roads 3, 4 | `#ffffff` (white) |
| ATVs and side-by-sides, 50" or narrower | trails 7, 8, 16, 17 | `#f28c28` (orange) |
| Motorcycles only | trails 9, 10 | `#7b4fb0` (purple) |
| Special designation | roads and trails 11, 12 | `#2a8bd8` (blue) |

Seasonal routes (`seasonal` = seasonal) are dashed (2, 1.5).

## 4. Taps

- **The order a tap is read in:**
  1. a place;
  2. a drawn line;
  3. a result's tip;
  4. a route;
  5. public land;
  6. the parcel tap as today.
- **A route:** within 10 px of a drawn route, its card opens, and the tap doesn't select a parcel. Routes are thin
  targets, like places.
- **Public land:** the card opens on a tap over *fee* public land (not an easement), and a county outline under it isn't
  selected. The reasoning:
  - a county outline under a national forest is the forest's own tract, which is rarely the parcel you mean;
  - with the layer on, the tap means "what is this land";
  - private inholdings aren't fee public land, so they still select as before;
  - an easement lies over private land you may want to open, so the parcel wins there, and an easement's card opens on a
    tap inside the open parcel or where no outline is drawn.
  - To select the tract anyway, turn the layer off. This is §9 Q1, flagged in the hand-back.
- **The public land card** (a MapLibre popup, the places card's style, 280 px wide):
  - every unit under the tap, the largest first, with duplicates of the same name merged (the record with a known manager
    wins);
  - up to three, then "and n more";
  - each one:
    - **its name**, bold;
    - **its manager:** "Jefferson National Forest — U.S. Forest Service", or the local manager's name when PAD-US has one
      ("NC Wildlife Resources Commission"), or "Manager not recorded";
    - **its access:** "Open to the public", "Restricted access (permit or season)", "Closed to the public" or "Public
      access not recorded";
    - **its designation:** "National Forest", "State Park", "State Other or Unknown" (PAD-US's own words);
    - **the source date:** "PAD-US source date: 2024-10-06";
    - **"Adjoins this parcel"**, when a parcel is open and the unit is within 20 m of it;
  - **for an easement,** instead of the access line, its holder ("Held by Blue Ridge Conservancy") and "Private land
    under a conservation easement; no public access unless stated";
  - **its last line, muted:** "USGS PAD-US 4.1. Boundaries and access can lag; check with the manager."
- **The route card:**
  - "Bald Knob (FS 60061)";
  - "Highway-legal vehicles only";
  - "Seasonal: open Sep 12 – Jan 18" (or "Open all year");
  - "Cherokee National Forest, Watauga Ranger District";
  - the MVUM line (§9 Q2).

## 5. Offline

- **The table** (`components/Map/offlineLayers.ts`) gains four kept layers, each matched by host, path and its
  `maxAllowableOffset`, and keyed by tile:
  - `public-land-coarse`;
  - `public-land-fine`;
  - `mvum-roads`;
  - `mvum-trails`.
- **Kept:** PAD-US and MVUM are U.S. Government works, in the public domain, and no term limits a viewer's cache (§7).
- **Save offline** downloads, for the parcel's box plus a quarter mile:
  - the zoom-9 tile of public land (one or two);
  - the zoom-11 tiles (one to four);
  - the zoom-11 MVUM tiles.
  - The planner already handles `{bbox-epsg-3857}` templates. Its estimate uses 600 KB a public-land tile and 2 KB a
    route tile until the device has its own averages.
- **A saved parcel opened offline:**
  - both layers draw from the cache;
  - a tile outside the saved box shows nothing, with no error;
  - "Some public land didn't load" shows only when online.

## 6. UX

- **The main flow, three taps from a parcel:** Map layers › Public land, then Map layers › Motor-vehicle routes, then
  tap the land or a route.
- **What you see first is the answer:** public land coloured by who manages it, open land solid. The detail is a tap
  away.
- **Map layers:**
  - each layer is one toggle row, as Power lines and Places are;
  - while it's on, the legend shows under it:
    - for Public land, five swatches and the easement swatch, then three access swatches ("Open", "Restricted or not
      recorded", "Closed");
    - for routes, five line swatches, then a dashed swatch, "Seasonal";
  - then the layer's info line. The note on dispersed camping sits under the routes' legend.
- **The data-source caveats stay in the UI** (CLAUDE.md):
  - the public land card's last line;
  - the routes' info line;
  - "Dispersed-camping corridors aren't in the Forest Service's data; the paper MVUM marks them."
- **States:**
  - **empty:** no hint (an empty map is the answer);
  - **loading:** tiles draw as they arrive, and nothing blocks;
  - **error:** a tile that fails is tried again on the next move, with one hint a visit ("Some public land didn't load",
    "Some routes didn't load");
  - **slow:** the zoom-9 tiles can take 2–3 s. There's no spinner; the map stays usable.
  - **below the layer's zoom:** the zoom hint, as Places and Lidar terrain do.
- **Plain labels:** "Public land", "Motor-vehicle routes", "Open to the public", "Restricted access", "Closed to the
  public", "ATVs and side-by-sides".
- **Phone at 375 px:**
  - the toggles and legend rows are 44 px;
  - the card fits with 16 px gutters and scrolls past three units;
  - a route's tap target is 20 px across, the line's own width plus its 10 px slop.
- **Contrast:**
  - fills at 35% keep the aerial readable;
  - every outline is 1.5 px, at full colour;
  - route lines sit on a dark casing;
  - the white highway-legal line is cased.
  - The swatches are checked against the panel's background at 3:1.
- **Consistency:** the panel's toggle rows, Lidar terrain's info line, the places card's popup.

## 7. Terms (`docs/commercial-review.md`)

- **PAD-US 4.1:**
  - USGS GAP;
  - a U.S. Government work, in the public domain;
  - the item's licence is USGS's no-warranty statement, with the PAD-US Data Overview's terms (public domain, cite the
    data release, doi:10.5066/P96WBCHS);
  - no limit on commercial use, display or caching;
  - credited "USGS PAD-US 4.1".
- **MVUM:**
  - the U.S. Forest Service's Enterprise Data Warehouse;
  - a U.S. Government work, in the public domain;
  - the item's licence is the Forest Service's no-warranty statement ("not legal documents");
  - no limit on commercial use or caching;
  - credited "U.S. Forest Service MVUM".
- **Spearhead Trails:** not used. Only third-party copies with no licence exist, and the authority publishes PDF maps
  and an app.
- **Both services are shared public endpoints with no stated rate limit.** The layers ask only for the tiles in view,
  once a session, through `lib/http.ts`.

## 8. Strings (all new; rule 7 doesn't apply: no report text changes)

- **Map layers:**
  - "Public land", "Motor-vehicle routes";
  - the legend's labels in §3;
  - "Open", "Restricted or not recorded", "Closed", "Seasonal";
  - the hints: "Zoom in to see public land", "Zoom in to see motor-vehicle routes", "Some public land didn't load",
    "Some routes didn't load".
- **Info lines:**
  - "Who manages the land and whether it's open, from USGS PAD-US 4.1: the same data the grade's public land uses.
    Access can lag; check with the manager.";
  - the routes' line in §1.2;
  - "Dispersed-camping corridors aren't in the Forest Service's data; the paper MVUM marks them."
- **The cards:** the lines in §4, including "Adjoins this parcel", "Manager not recorded", "Held by <holder>",
  "Private land under a conservation easement; no public access unless stated", "Open all year", "Seasonal: open
  <dates>", "and <n> more".

## 9. Questions, each with the recommendation (the mission proceeds on these; each flagged in the hand-back)

1. **A tap on public land over a county outline.**
   - **Recommended:** with Public land on, a tap on fee public land opens its card instead of selecting the county
     tract under it. Easements and private land select as before (§4).
2. **The MVUM date.** The data carries none (§0).
   - **Recommended:** the route card's last line reads "Forest Service MVUM data, read <date it was fetched>. Check
     the forest's current MVUM." It says what the date is, never that it's the map's.
   - The alternative is a per-forest table of MVUM publication dates in config, kept by hand: a follow-up if wanted.
3. **Dispersed camping.** The brief asks to mark corridors where MVUM shows them; the published data shows none.
   - **Recommended:** none drawn, and the legend's note says so. If Zach knows of a source, it's a follow-up.
4. **Spearhead Trails.**
   - **Recommended:** not available (§0, §7). Zach could ask the Southwest Regional Recreation Authority for its
     trail data and terms.
5. **The weight at zoom 9** (3–5 MB a view before compression, §2).
   - **Recommended:** ship it, and measure on the preview. If a phone struggles, start the layer at zoom 10, or bake.

## 10. Test plan outline

- **Unit** (vitest, pure):
  - `classify`: the category and access style on the probe's real records:
    - the Jefferson and Cherokee National Forests;
    - Grayson Highlands State Park, both of its records;
    - Old Flat State Forest (SRMA);
    - Pond Mountain Game Land (UNK, by its name);
    - a Blue Ridge Conservancy easement;
    - an NC Land and Water Fund record;
    - a Blue Ridge Parkway record;
  - the card's lines: the merged duplicates, "and n more", the easement's lines, "Adjoins this parcel" at 15 m and not
    at 30 m;
  - MVUM: each `symbol` to its class; seasonal dashes; "04/01-01/10" read as "Apr 1 – Jan 10"; several date ranges;
  - the offline table: each new layer matches its own URLs and nobody else's; tile keys round-trip; Save offline's plan
    holds the zoom-9 and zoom-11 tiles for Mud Creek's box.
- **e2e** (the services answered from small synthetic GeoJSON near Mud Creek: a national forest, a game land with an
  unknown manager, an easement, two routes):
  - both layers off by default;
  - each toggle on, with its legend; remembered after a reload;
  - a tap on the forest opens its card with "Adjoins this parcel" for Mud Creek;
  - a tap on a route opens its card;
  - **offline:** Save offline on Mud Creek with both layers on; offline, a fresh page draws both layers' features
    with no request leaving the device.
- **Screenshots, live** (from `public-lands.yml` on CI, as lidar's), at 1280 and 375:
  - Mud Creek with Public land, with the Jefferson National Forest nearby, and Motor-vehicle routes over Mount Rogers;
  - Pond Mountain Game Land (Ashe, NC) with its card open.

## 11. PRs, into `step/16-public-lands`

| # | PR | Numbers |
|---|---|---|
| 0 | This plan, and the probe | None |
| 1 | Public land: `lib/publicLand/*` (pure: tiles, classify, card), the layer, the toggle and legend, the tap, the offline table and Save offline, unit tests and e2e | None |
| 2 | Motor-vehicle routes: `lib/mvum/*`, the layer, the toggle and legend, the tap, offline, tests; the offline e2e with both layers | None |
| 3 | `public-lands.yml` turned from the probe into the live screenshots; the fresh-eyes review; commercial-review.md, PLAN row 16, REQUIREMENTS, §9.76; the hand-back to main | None |

## 12. Stop conditions

- Any change to `expected.json`, a grade, a verdict or report text: none is planned.
- A product decision §9 doesn't cover.
- The same CI failure surviving 3 attempts.
- The plan turning out wrong, for example:
  - the feature services refuse the browser's requests;
  - a zoom-11 view regularly takes over 5 s;
  - the offline cache can't key the queries by tile.
