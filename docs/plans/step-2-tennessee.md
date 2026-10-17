# Step 2: Tennessee

Roadmap step 2 (`PLAN.md`, Roadmap). The spec is `docs/design/workflow-review.md`. Written 2026-10-17 under mission
mode (`CLAUDE.md`), including the 10/17 rules: clean breaks, a UX section, and screenshots. **Awaiting the owner's
approval. No application code until then.** The mission runs on `step/2-tennessee`, branched from main after this
plan is merged. Step 1 (#154) is on main.

Done when:
- Tennessee parcels behave like Virginia's and North Carolina's, from the state's own public parcel layer: lines at
  z14, the density guard, tap for the full record, parcel-number search, and owner fields live only.
- The state aerial basemap covers Tennessee, falling back to USGS.
- Tennessee trailheads come from the state's sources and the Cherokee National Forest's, merged and gated as Virginia's
  and North Carolina's are.
- A recorded Roan Mountain fixture runs in CI next to Ferney, Macks and Mud Creek.
- The `ps.legacy.*` keys and the code that made them are gone.

## 0. What's already there (found while planning)

**Tennessee isn't new code.** The prototype queried all three states, and the port kept that. Tennessee is already
wired up in these places:

| Piece | Where |
|---|---|
| Parcel service `geoviewer.cot.tn.gov/…/GeoViewer/Parcels_View/MapServer/0` | `lib/screen/config.ts` `DEFAULT_ENDPOINTS.parcels` |
| Its fields (`OBJECTID`, `PARCELID`, `COUNTY`; record adds `OWNER`, `ADDRESS`) | `lib/geo/parcelFields.ts` |
| State by host; the dedupe key `TN:<county>:<parcel id>` | `lib/geo/recipe.ts`; REQUIREMENTS §3 |
| Service-down wording "Tennessee parcel service isn't responding…" | `lib/geo/serviceStatus.ts` |
| Owner scrubbing in recordings | `test/support/scrubHar.ts` |
| TN state outline | `lib/screen/data/state-outlines.json` |
| TN state parks (TDEC park points, `PARK_NAME`) | `lib/screen/trailheads.ts`, under follow-up 53's outline check |
| The Library's State filter | `lib/client/library.ts`, `LibraryControls.tsx` |

**What's missing:**
- a Tennessee orthophoto (Tennessee falls back to USGS, and the basemap reads "VA 1 ft / NC 6 in");
- a Tennessee fixture: all three fixtures are Virginia, so no Tennessee path is tested end to end;
- unit cases for TN in `parcelFields.test.ts` and `parcelTiles.test.ts`;
- and, most likely, **the service itself**. The design doc says Tennessee lines "arrive in step 2". The search
  engine's copy of the GeoViewer folder doesn't list `Parcels_View` any more. GeoViewer is the back end of the
  Comptroller's own viewer, not a published dataset. §1 replaces it.

**What couldn't be checked from here.** This session's network policy refuses every outside host (tnmap.tn.gov,
\*.arcgis.com, geoviewer.cot.tn.gov, apps.fs.usda.gov, and also the hosts the app already uses). Each fact in §1–§3
says where it comes from:
- **[doc]**: the publisher's own page, read through search snippets;
- **[others]**: what other projects recorded from the live service in 2026;
- **[repo]**: this code.

PR 2 re-reads every one live before it codes against it (§5, stop condition 1). **The mission needs network access to
these hosts** to make those checks and to record the fixture (§8, Q1).

## 1. Parcel source

### 1.1 The service

**Recommended: the Comptroller's public-use layer**, "Tennessee Property Boundaries (Public Use)":

`https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Property_Boundaries_Public_Use/FeatureServer/0`

| | |
|---|---|
| Publisher | Tennessee Comptroller of the Treasury, Division of Property Assessments, Geographic Services, from the Tennessee Base Mapping Program; published by STS-GIS (account `tnmap_oir`, item `e356f1a241844d6f9025f2fa4e977df3`) [doc] |
| Coverage | 86 of 95 counties. Not covered (they keep their own assessment systems): Chester, Davidson, Hamilton, Hickman, Knox, Montgomery, Rutherford, Shelby, Williamson [doc]. **Carter, Johnson, Unicoi, Cocke and every catalog county are covered.** |
| Fields | `OBJECTID, COUNTY_ID, PARCEL_TYPE, GISLINK, PARCELID, CMAP, GP, PARCEL, ADDRESS, DEEDAC, OWNER, OWNER2, SUBDIV, LOT, LINK_TPAD, LINK_TPV, COUNTY_NAME` [others, compared with the live `?f=json`]. No calculated acres, sale, land use or appraisal: those live in TPAD. |
| Query limits | Polygon layer, `capabilities: Query`, `maxRecordCount` 2000 (VA's is the same), advanced queries, GeoJSON output; about 2.14 million parcels [others]. Not yet confirmed: `supportsPagination`, PBF, spatial reference. |
| Update cadence | "This layer is updated monthly" [doc]; the county shapefiles on the Comptroller's site are updated weekly [doc]. |
| Terms | "This service is not intended for commercial use. For commercial purposes, we recommend that you download the data at the Tennessee Comptroller of the Treasury's webpage." [doc] The item's license text is an as-is disclaimer: "presented for graphical reference only … makes no warranty, expressed or implied" [others, quoting the item]. The Comptroller's disclaimer adds that the maps "do not represent legal descriptions of property nor … establish boundary lines" [doc]. Nothing on attribution, public web apps or owner names. |

**Do the terms allow this app?** Yes, as read here. This is a free, non-commercial app, so it is the use the public
service is for. Nothing prohibits showing the layer in a public web app. Not a stop. PR 2 quotes the live item's
`licenseInfo` and description into REQUIREMENTS. **If the live text restricts public web use or showing owner names,
the mission stops there and reports (§5, condition 2).** An email to GIS.Data@cot.tn.gov could confirm it in writing
(§8, Q2).

**Alternatives, and why not:**
- **Keep the GeoViewer `Parcels_View` service.** It's the back end of the Comptroller's viewer, with no published
  terms, and probably no longer exists. If PR 2's live check finds it alive, it still moves to the public-use layer,
  which is the published one.
- **`maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0`** [others]: the Comptroller's own server,
  with no terms found. Kept as the fallback to name if the public-use layer turns out unusable (a stop, not a silent
  swap).
- **The vector-tile service** "TN Property Boundaries" [doc] has linework only, with no object ids or attributes. A
  line can't be tapped for its record, so it can't behave like VA and NC.

### 1.2 Behaviour: as VA and NC

| Behaviour | Tennessee | Code |
|---|---|---|
| Fields asked | Outlines: `OBJECTID` (oid), `PARCELID` (id), `COUNTY_NAME` (county). Full record: `OBJECTID, PARCELID, GISLINK, COUNTY_NAME, OWNER, ADDRESS, DEEDAC`, and nothing else (no `OWNER2`, no TPAD links, no subdivision) | `parcelFields.ts` `FIELDS_BY_HOST` |
| Owner fields live only (decision 23) | `OWNER` and `ADDRESS` show in the facts table and are never stored, exported or recorded. The `services1.arcgis.com` layer joins `PARCEL_HOSTS` in `scrubHar.ts`, and `OWNER_FIELD` already matches `OWNER`/`OWNER2` | `scrubHar.ts` and its test (the hosts equal `DEFAULT_ENDPOINTS.parcels`) |
| Lines at z14, paging | The same `fetchTile` envelope query, `resultOffset` paging up to `MAX_PAGES` | `parcelTiles.ts`, `useParcelLines.ts` |
| Density guard | The same `returnCountOnly` count below z15 and `drawsAt` | unchanged |
| Tap for the full record | `fullRecord` by `objectIds` with the record fields | unchanged |
| Parcel-number search in counties in view | `COUNTY_NAME='Carter' AND UPPER(PARCELID) LIKE …`, the same starts-with pattern. `PARCELID` is the spaced, zero-padded map/group/parcel form ("063D A 015.00"), so "063D A 015" finds it as typed from a tax card. People drop the padding ("63D A 15"), so Tennessee's pattern also accepts one leading zero on the map number (`LIKE '6%3%D%…' OR LIKE '0%6%3%D%…'`) | `lib/search/query.ts`; Carter cases in `search.test.ts` |
| Dedupe key | `TN:<county name, lower case>:<PARCELID>`, the format REQUIREMENTS §3 already documents | `recipe.ts` |
| Facts table | Parcel ID, county, owner, site address as for NC; **deeded acres** (`DEEDAC`) on its own row, labelled "Deeded acres (county record)" next to the computed acres | `parcelFacts`; the facts component |
| Settings | `endpoints._v` 12 → 13, so stored endpoints take the new URL. This is the prototype's wholesale-replace rule, not a converter | `config.ts`, its snapshot test |

**Clean break for saved Tennessee parcels.** A saved parcel keeps its boundary, so it still opens and screens. Its
dedupe key holds if the new `PARCELID` matches the old one. If it doesn't, nothing is converted: an import of an old
file may list that parcel once more, and the owner deletes the copy. There's no export-format, storage or schema
change in this step.

## 2. Imagery

**Recommended: TNMap's orthoimagery in Web Mercator.**

`https://tnmap.tn.gov/arcgis/rest/services/BASEMAPS/IMAGERY_WEB_MERCATOR/MapServer/tile/{z}/{y}/{x}` [doc, others]

- **What it is:** the Tennessee Imagery Program's latest statewide leaf-off orthophoto, from TDOT Aerial Surveys and
  refreshed region by region. It's 6 in from 2022 and 1 ft before. Its copyright text is "TDOT Aerial Surveys".
- **Tiles:** cached JPEG, 256 px, z6–19 (OSM's editor-layer index lists it as "TNMap Orthoimagery Latest").
- **Not usable:** the 2025 Vexcel statewide flight (15 cm) is restricted to government users [doc].
- **In the "state" stack:** USGS (fallback) at the bottom, then **TN**, then NC, then VA, with TN's bounds being
  TIGER's state extent rounded outward. VA's and NC's layers are transparent outside their states, so they cover TN's
  tiles only on their own side of the line.
- **TN's tiles are JPEG**, so they can't be transparent. Where TN's bounds take in Kentucky, Georgia, Alabama,
  Mississippi, Arkansas or Missouri, a tile with no TN imagery must not paint over USGS. PR 3 checks live what the
  cache returns there. If it's a 404 or a blank tile, nothing more is needed. If it's opaque, PR 3 uses the
  MapServer's `export` with `format=png32&transparent=true`, as VA's source does.
- **The basemap label** becomes "Aerial (state ortho: VA, NC, TN)". The resolutions differ by county and year, so the
  label stops quoting them; each source's attribution names it.
- **Terms:** no license stated. TNMap serves the cache publicly, and STS-GIS sells the imagery to private and
  commercial buyers [doc]. Viewing the public cache in a free app is the use it's published for, but that isn't said
  in writing (§8, Q3). If the owner says no, Tennessee keeps the USGS fallback and only the label changes.
- **The fallback is USGS ImageryOnly** (NAIP, 1 m, leaf-on): already the stack's bottom layer, with no use
  constraints.

## 3. Trailheads

**Today** (follow-up 24, follow-up 53):
- USFS INFRA recreation sites (`EDW_InfraRecreationSites_01`, `site_subtype='TRAILHEAD'`) are asked everywhere. They
  already cover the Cherokee National Forest, as every national forest.
- Each state's park points are asked only when that state's outline is within reach: Tennessee's are TDEC's 69 park
  centroids. Those are parks, not trailheads.
- OSM trailheads come from Photon and Overpass.
- Matches are merged when within 300 m **and** with the same normalised name, keeping USFS over state over OSM.

**Added: Tennessee's statewide trails layer**, "Tennessee Statewide Trails Points Public":

`https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Statewide_Trails_Points_Public/FeatureServer/<id>`
[doc, others]

- **What it is:** a TDEC Recreation Resources (TREC) compilation of trails from the agencies that manage them, state
  parks and the Cherokee NF among them. Each trail has a trail name, a managing entity, and primary and secondary
  trailhead coordinates (some secondary ones are 0, 0 and are dropped).
- **It's a state source** (`state: "TN"`), so follow-up 53's outline check gates it like the park points. When it
  doesn't answer, the Trails row reads "…; incomplete: TN trails (TDEC) didn't load".
- **Cherokee NF's trailheads arrive two ways:** by USFS INFRA, and by TREC when the managing entity is the Forest
  Service. The 300 m plus same-name rule merges them, keeping the USFS point.
- **The state-park sources become keyed by URL, not host,** because two layers can share an ArcGIS host. The TDEC
  park points stay as they are.
- PR 4 confirms the layer id, the field names and the terms live (§5, condition 1).
- **No Cherokee-only USFS query is added:** INFRA's distance query already returns Cherokee trailheads near Roan,
  which the Roan fixture's recording shows (PR 5). If it doesn't, the mission stops and reports.

**Which fixtures it reaches.** Ferney and Macks don't reach Tennessee, so they never ask it. Mud Creek reaches all
three states, so it asks it (§4).

## 4. Numbers and text that may change (the declaration)

- **Ferney Creek and Macks Mountain:** no change. Their `expected.json` stays byte-identical.
- **Mud Creek (Grayson):** its near step asks the TREC layer, so the recording gains that answer (`pnpm record:port`).
  `near.trailheads` may gain Tennessee entries, and through them the Trails row's minutes, letter and detail may
  change. Nothing else may move. The PR declares it with the `pnpm diff:prototype` summary line.
- **The Roan Mountain fixture:** new. Its `expected.json` is declared as a new fixture ("Numbers change: new fixture
  roan-…"). The `diff:prototype` summary line gains a fifth count ("…, roan N").
- **`ENGINE_VERSION`** 21 → 22, because a new trailhead source changes what the engine returns. As with every bump,
  saved screens re-screen when opened.
- **Unchanged:** `SCREEN_SCHEMA_VERSION` (8), the export version (6) and the IndexedDB version (2). No config
  threshold, weight or unit cost changes. No verdict or flag text changes.
- **UI text:**
  - new: "Deeded acres (county record)", the TN imagery attribution, the parcel lines' attribution, the hints in §6.4;
  - changed: the basemap label;
  - unchanged: the service-down line.

## 5. Stop conditions (push what's there, say why, wait)

1. **A live check that disagrees with §1–§3** in a way that changes behaviour. For example:
   - the public-use layer is missing or lacks `PARCELID`, `COUNTY_NAME` or `OBJECTID`;
   - it doesn't page and a z14 tile can exceed 2,000 parcels;
   - Carter returns no features;
   - the imagery cache paints over neighbouring states with no `export` option;
   - the TREC layer has no trailhead points.

   A field renamed to an obvious twin is noted, not a stop.
2. **Terms,** live or emailed, that don't allow a free public web app, or showing owner names live.
3. **The prototype can't record the Roan parcel** (§7.2), even with the parcel set directly.
4. **An `expected.json` change beyond §4:** any change to Ferney or Macks, or a Mud Creek change outside its trailheads
   and Trails row.
5. **No suitable Roan parcel** (§7.1) within 8 km of Roan Mountain's town.
6. **No network access to the hosts** in §8 Q1.
7. **The general ones** (CLAUDE.md): a product decision, the same CI failure three times, or the plan turning out
   wrong.

## 6. UX

### 6.1 The main flow, in the fewest steps

**At Roan Mountain:**
1. Search "Roan Mountain, TN", or pan there.
2. At z14 the Tennessee lines draw like Virginia's.
3. Tap a parcel and the outline and its facts show.
4. Press Screen it.

That's the same four steps as in Virginia, with no state picker, because the map asks each state's service for the
tiles in view.

**By parcel number:** with Carter County in view, type "063D A 015" (or "63D A 15") in Search and the parcel comes up
under "Parcel numbers".

### 6.2 What the user sees first

The parcel's outline and its facts card, as for VA and NC:
- acres;
- county, as "Carter Co., TN";
- parcel ID;
- owner and site address, fetched live;
- deeded acres, in the record's own words.

The Screen it button is under them. The detail (the record's other values, the report) stays a tap away. Nothing new
appears on a Virginia or North Carolina parcel.

### 6.3 Next to VA and NC

- **Lines:** the same colour, weight and labels in every state. A line along the state border can show twice (each
  state's survey of the line), as it does today on the VA/NC line near Mud Creek.
- **Aerial:** each state's own photo up to the state line. The seasons and colours can differ across it, because each
  state flies its own photo. The attribution names each source.
- **The Library:** Tennessee parcels carry "TN" in the State filter, as today.

### 6.4 Empty, loading, error and slow states

| State | What shows |
|---|---|
| Loading lines | The existing behaviour: tiles fill in as they arrive. No spinner per state. |
| Slow (over 30 s, then the retry at 45 s) | The existing hint under the map's top bar. |
| **The Tennessee service is down** | "Tennessee parcel service isn't responding — try again shortly, or draw the boundary" (unchanged), only while the view touches Tennessee. VA and NC lines keep drawing. Tapping in Tennessee says the same and offers Draw. |
| **A county with no state lines** (the nine above) | When the count query returns 0 for a view at z15+ that lies inside Tennessee's outline: "No Tennessee parcel lines here; this county keeps its own records. Draw the boundary instead." The Draw button is next to it. New, Tennessee only, because VA and NC have no gaps. |
| Dense area | The existing "Dense area — zoom in to see all parcel lines". |
| No result for a parcel number | The existing "No parcel numbers start with “…” in the counties in view." |

### 6.5 A parcel that crosses a state line

Roan Mountain sits on the NC/TN line, and Mud Creek's neighbours on the VA/NC line, so this is a real case.

- Each state holds its own part as its own record. Tapping one side selects that state's record.
- **Combine** adds the other side, as two Virginia records are combined today. The facts card then lists both
  counties ("Carter Co., TN & Mitchell Co., NC").
- **The Library** shows "TN · NC" on the row, and the State filter finds it under either state. Today it takes the
  first piece's state only; `parcelState` becomes `parcelStates`.
- The screen itself doesn't care about states. Trailheads and hospitals already search across them by distance.

### 6.6 Labels

Plain words:
- "Deeded acres (county record)", not `DEEDAC`;
- the hints above;
- the attributions "Tennessee Comptroller of the Treasury" (parcel lines) and "TDOT Aerial Surveys" (aerial).

No field names, GISLINKs or service names reach the screen.

### 6.7 Phone at 375 px

No new screen. These change:
- **The basemap menu's label:** it fits on one line at 375 px. The new label is shorter than today's.
- **The facts card's new row:** wraps under its label.
- **The no-lines hint:** two lines at most, with its Draw button at least 44 × 44 px.
- **The Library row's "TN · NC":** fits in the existing state cell.

Nothing scrolls sideways. The e2e checks the hint's button size and no horizontal scroll at 375 px.

### 6.8 Contrast and consistency

- The hint reuses the existing hint component and colours (the dense-area one).
- The facts row reuses the facts table.
- Parcel lines use the existing style.
- The attribution uses MapLibre's existing control.

## 7. The Roan Mountain fixture

### 7.1 Choosing it

A rural, wooded parcel of 10–30 acres in Carter County with no house, within 8 km of the town of Roan Mountain
(about 36.196, −82.072). How it's picked:
1. Query the public-use layer for parcels with 10 ≤ `DEEDAC` ≤ 30.
2. Keep those with no building in the Microsoft or OSM footprints and with tree cover on the TN orthophoto.
3. Keep those with a public road within 400 m, so the driveway step has something to route.
4. Pick one on a south- or east-facing slope, so the sun and sky sections have something to say.

The PR names it by its road and parcel number, as the others are named, e.g. `roan-<road>-<parcel>`. Its owner
fields are scrubbed (decision 23). If the owner has a Roan parcel in mind, that one is used instead (§8, Q7).

### 7.2 Recording

**Recommended: from the prototype, as the other three were.** That gives it `golden.json`, so every test that
iterates the fixtures runs unchanged, and `diff:prototype` covers it.
- The prototype's own Tennessee service is the old GeoViewer one, so the recorder sets the parcel directly with the
  harness's `setParcel(boundary)` from the public-use layer, instead of `pickParcel`.
- The recorder gets the desktop Chrome User-Agent the port's recorder already uses, because Tennessee's servers refuse
  `HeadlessChrome` (phase-0.md, step 12 note).
- `pnpm record:port` then adds the port's own requests (`network-port.har`).
- `prototype-recordings.sha256.json` gains its pins.
- Scenarios: `run` and `evaluateSite2`, as Mud Creek and Macks have.

**If the prototype fails on it** (stop condition 3), the alternative is a port-only fixture: `FIXTURE_SLUGS` would
split into the prototype-backed set and all fixtures, with no golden for Roan. That's a plan change, so it waits for
approval.

### 7.3 Expected output and the step 1 oracles

- `pnpm expected` writes `expected.json`.
- **The oracles:** the step 1 oracles (`cards-v7.json`, `grades-v7.json`) were recorded from the v7 code, which no
  longer exists. Roan's equivalents are recorded from this step's derivations once, as `cards-v8.json` and
  `grades-v8.json`, with the same shapes. `lib/rubric/default.test.ts` and `lib/screen/derive.test.ts` read whichever
  oracle a fixture has.
- **What Roan's oracle proves:** for Roan it's a regression snapshot (any later change to a derivation shows), not a
  v7 parity proof. That's said in a comment where the files are read.
- **The `Record<FixtureSlug, …>` maps** gain Roan's entry: `reroute.test.ts`, `a4b-router.test.ts`,
  `record-port.test.ts`, and `states.test.ts` (Roan reaches TN and NC).
- **`test/fixtures.test.ts`'s VGIN-specific check** becomes a per-state check.
- **e2e:** a `ROAN` constant, and a `tennessee.spec.ts` that:
  - taps the Roan parcel's line at z15 and sees the facts card with Carter County and the deeded-acres row;
  - finds it by its parcel number;
  - screens it;
  - sees the "no lines here" hint over a Knox County view (served empty by the replay);
  - sees the Tennessee-down line when the TN host fails.

## 8. Questions for the owner

1. **Network access for the mission.** This environment refuses every outside host, so neither the live checks nor
   the recording can run in it. Before the mission, add these under the cloud environment's Network access → Allowed
   domains (or pick a broader level):
   - the new ones: `services1.arcgis.com`, `www.arcgis.com`, `tnmap.tn.gov`, `geoviewer.cot.tn.gov`,
     `maps.cot.tn.gov`;
   - the ones the recorders already use: `apps.fs.usda.gov`, `services5.arcgis.com`, `services6.arcgis.com`,
     `elevation.nationalmap.gov`, `s3.amazonaws.com`, `sdmdataaccess.sc.egov.usda.gov`, `hazards.fema.gov`,
     `tigerweb.geo.census.gov`, `photon.komoot.io`, `overpass-api.de`, `router.project-osrm.org`,
     `djlorenz.github.io`, `vginmaps.vdem.virginia.gov`, `services.nconemap.gov`, `basemap.nationalmap.gov`.

   Or run the recording PR from a machine that can reach them.
2. **The parcel terms.** "Not intended for commercial use" is read as allowing this free public app (§1.1). Agreed?
   Should the mission also email GIS.Data@cot.tn.gov to confirm in writing? (The answer wouldn't block the step.)
3. **The TN imagery.** TNMap's public cache, which has no stated license (§2): use it, or keep Tennessee on USGS until
   it's confirmed?
4. **The TREC trails layer** as a Tennessee trailhead source (§3). It changes Mud Creek's trailheads, and possibly its
   Trails row. Or keep only TDEC's park points, and rely on USFS INFRA for the Cherokee NF?
5. **Record Roan from the prototype** (§7.2, recommended), or as a port-only fixture with no golden?
6. **Old data under the clean-break rule** (§9):
   - A browser that never opened the app since step 1 still holds its pre-profile data in localStorage. After this
     step it's dropped, and the menu says once "Saved with an older version; screen it again." OK?
   - The manual plan asks you to open the app once on every device you use before merging, so nothing of yours is in
     that state.
7. **A Roan parcel you have in mind?** Otherwise the mission picks one by §7.1 and names it in PR 5.
8. **The localStorage journal** that step 1 parked for this step (phase-0.md §9.45: a page closed within milliseconds
   of a write can lose it). Recommended: not in this step. The clean-break rule makes lost local data cheap, and the
   e2e already flushes before reloads. Agreed?
9. **The TPAD link** (the state's assessment record, `LINK_TPAD`) as a "County record" link on the facts card, like a
   listing link. It isn't asked for here and is left out (§1.2). Add it?

## 9. Cleanup: the `ps.legacy.*` keys

Step 1 renamed the pre-profile localStorage keys to `ps.legacy.*` and said step 2's first PR deletes them. Under the
clean-break rule, the code that made them goes too:

- **Boot (`lib/client/profiles.ts`):** deletes every `ps.legacy.*` key, and any pre-profile key still present
  (`LEGACY_KEYS`: a browser that never opened step 1). It no longer moves anything into a profile. In the second case
  the menu shows "Saved with an older version; screen it again." once (§8, Q6).
- **Deleted:** `migrateLegacy`, `legacyDocs`, `legacyEntries`, `LEGACY_PREFIX` and the migration's tests in
  `profiles.test.ts`. The `legacy` seeding option in `e2e/flow.ts` and the `ps.legacy.ps.person` assertion in
  `e2e/profiles.spec.ts` go too.
- **`LEGACY_SECOND_WEIGHTS`** moves to `test/support/rubrics.ts`, because the step 1 card oracle still needs it. Its
  name and the profile's "Julie" rubric already stored stay until step 5.
- **REQUIREMENTS §3a and phase-0.md §9.45** say the keys are gone.

**Out of scope, kept as the rule allows:** the export's `fromV1…fromV5` converters, and the Library's "Re-screen all
saved parcels". This step doesn't touch them; the step that next touches them removes them.

## 10. The PRs, into `step/2-tennessee`

| # | PR | Checks |
|---|---|---|
| 1 | **Cleanup** (§9): the `ps.legacy.*` keys and the move code deleted; the one-line notice. | `profiles.test.ts` (a browser with `ps.legacy.*` keys ends with none; one with pre-profile keys ends with none and the notice; a fresh one shows no notice); e2e `profiles.spec.ts`. |
| 2 | **The Tennessee parcel service** (§1): the live check written into REQUIREMENTS (URL, fields, limits, cadence, terms, quoted); the endpoint and `_v` 13; fields; scrubbing; facts row; the no-lines hint; the service-down path; `parcelStates` and the Library's "TN · NC"; the parcel lines' attribution. Unit fixtures: a small recorded TN tile, count, record and search answer, owner scrubbed. | `parcelFields`, `parcelTiles`, `parcels`, `search`, `serviceStatus`, `recipe`, `library` tests with TN cases; `scrubHar.test.ts`; config snapshot. |
| 3 | **Tennessee imagery** (§2): the source in the state stack, its bounds and attribution, the label; the recorder's `BLOCKED` list. | `style.test.ts`; a live check of a Kentucky-side tile noted in the PR. |
| 4 | **Tennessee trailheads** (§3): TREC as a state source keyed by URL; follow-up 53's gate; Mud Creek's re-recorded port HAR and `expected.json`, declared; `ENGINE_VERSION` 22. | `trailheads.test.ts` (merge with a USFS point at 120 m with the same name; no merge at 120 m with another name; out of reach not asked; not answering → incomplete); the expected guard. |
| 5 | **The Roan Mountain fixture** (§7): chosen, recorded, pinned; `expected.json`; `cards-v8.json`, `grades-v8.json`; the fixture maps; `tennessee.spec.ts`. | Every fixture-iterating test with Roan; determinism; the expected guard; the diff line. |
| 6 | **Screenshots and docs:** `pnpm screenshots` (a Playwright script over the HAR replay at 1280 × 800 and 375 × 812, writing `test-results/screenshots/`); REQUIREMENTS' service list; phase-0.md §9.46; README; the hand-back PR to main. | Full CI on the step branch's head. |

## 11. Test plan outline

**Unit (CI):**
- TN cases in each parcel module;
- the Roan fixture through every fixture-iterating test;
- TREC's merge and its outline gate;
- the cleanup;
- Ferney and Macks byte-identical.

**e2e (CI):** `tennessee.spec.ts` as in §7.3; `profiles.spec.ts` after the cleanup; the existing specs unchanged.

**Screenshots (the hand-back):** each at 1280 px and 375 px, attached to the final PR:
- the Roan view at z15 with its lines on the TN aerial;
- the Roan parcel tapped, with its facts card;
- the parcel-number search result;
- the no-lines hint over a Knox County view;
- the Tennessee-down hint;
- a combined TN/NC parcel's card and its Library row;
- the Roan report's Trails row and trailhead list;
- the basemap menu.

**Manual, on the preview (about 25 minutes, desktop then phone):**
1. **Before merging,** open production once on each device you use (§8, Q6).
2. Search "Roan Mountain, TN" → at z14 the TN lines draw over the TN aerial; the attribution names TDOT and the
   Comptroller.
3. Tap the **Roan Mountain fixture** parcel → its facts card: Carter Co., TN, parcel ID, owner and address, and deeded
   acres.
4. Search its parcel number → found under "Parcel numbers".
5. Screen it → a grade and verdict; the Trails row lists Cherokee NF and Tennessee trailheads with drive minutes.
6. Pan across the NC line on the Roan Highlands → both states' lines and aerials meet at the border.
7. Combine a TN and an NC record → the card names both counties; in Your list the row reads "TN · NC" and shows under
   either State filter.
8. Pan to Knoxville at z15 → the no-lines hint with Draw.
9. **Mud Creek, Ferney and Macks** → their grades and verdicts as before (Mud Creek's Trails row as declared).
10. Settings → the Tennessee parcel endpoint is the new one.
11. **Phone:** steps 2–5 and 8 at 375 px → nothing scrolls sideways, and the hint's Draw button is easy to tap.

The full numbered list, with pass/fail boxes and the preview URL, lands in the final PR, with the screenshots.

## 12. Decisions to record in `phase-0.md` §9 (in the PRs)

- **§9.46 Tennessee parcels from the Comptroller's public-use layer.**
  - The service, its fields, its limits and its terms as checked live.
  - The nine counties it doesn't cover, and their hint.
  - Owner fields live only (decision 23).
  - The GeoViewer endpoint retired.
- **§9.47 State imagery and trailheads for Tennessee.**
  - The TNMap cache in the state stack.
  - TREC as a state trailhead source, keyed by URL.
  - `ENGINE_VERSION` 22.
- **§9.48 The pre-profile data is dropped (the clean-break rule).** The `ps.legacy.*` keys and the move code are gone.
