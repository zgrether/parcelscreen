# Parcel Screen — requirements

Companion to `CLAUDE.md` (how to work) and `PLAN.md` (when). This file is *what*.

## 1. Domains

**Explorer** — stateless. `screen(polygon, config) → ScreenResult`. Renders a map, a results
panel and a 3D walkthrough from the result. Never writes to the database.

**Library** — persistence. A `Parcel` (contender) with versioned screens, attachments, price
history, comments, status, the owner's verdict. The parcel page *is* the export.

**Watch** — scheduled search over listing sources with per-source cadence; produces `Listings`
that can be promoted to parcels. Never screens on its own until Phase 5.

## 2. The pipeline contract (`lib/screen`)

The authoritative definitions are the Zod schemas in `lib/screen/types.ts`. This section summarizes them.
The additions over the original contract were approved in docs/plans/phase-0.md §9.7.

```ts
export async function screen(
  input: ScreenInput,
  onProgress?: (e: ProgressEvent) => void,
  deps?: { http?: HttpClient; signal?: AbortSignal; demCache?: DemCache },
): Promise<ScreenOutput>

interface ScreenOutput {
  result: ScreenResult;      // JSON-safe, versioned: what screens.result stores
  session: ScreenSession;    // rasters and raw features; in memory only, never persisted
}

// Re-evaluate on an existing run (the prototype's tap-a-pin and mark-a-house). Return a new output:
// the result plus the session (the new skyline is session data the map and 3D fans draw from).
export function evaluateAt(out: ScreenOutput, ll: [lat, lon], label: string): Promise<ScreenOutput>
export function setHouse(out: ScreenOutput, ll: [lat, lon] | null): Promise<ScreenOutput>
// input.evaluateAt is applied after the run, as evaluateAt(out, ll, "the evaluation point").

interface ScreenInput {
  polygon: GeoJSON.Polygon;           // WGS84
  config: UserConfig;                 // thresholds, driveway unit costs, anchors, endpoints, timeZone
  house?: [lat, lon];                 // optional existing house
  evaluateAt?: [lat, lon];            // optional explicit evaluation point
}

type Step = 'dem' | 'terrain' | 'soils' | 'sun' | 'sky' | 'flood' | 'padus' | 'near' | 'drive' | 'rank' | 'driveway';
interface ProgressEvent {
  step: Step; status: 'run' | 'done' | 'fail' | 'skip'; message?: string;
  link?: string;                       // "test the query" when the places lookup fails
  partial?: PartialScreenResult;       // snapshot after the step (no verdict yet)
}
```

`ScreenResult` (store as JSON in `screens.result`; stable, versioned by `schemaVersion`, currently 2).
It is the prototype's result object without the session-only parts, and every object is strict.
Sections whose step failed or was skipped are absent. Values the prototype can leave as NaN are `null`.

```
schemaVersion, runAt, acres, demSource, demResM
params       { houseMin, shelfMin, gardenMin, canopyDeg, shallowBedrockCm }: the settings the report shows
             with this run (v2; open until step 18 freezes it)
terrain      { elevMinFt, elevMaxFt, elevMeanFt, reliefFt, valleyFloorFt, heightAboveValleyFt,
               slopeMedDeg, slopeP90Deg, acresUnder15, acresOver25, diag:{houseAc, shelfAc, gardenAc, totalAc} }
houseMinUsed the house-site threshold actually used (relaxed when nothing qualified)
benches[]    { ll, acres, elevFt, slopeDeg, aspectDeg, score, veto? }       (house sites before ranking)
sites[]      { rank, ll, acres, elevFt, aspectDeg, slopeDeg, compact?, cell:{score,slope,aspect,thermal},
               quality, qGrade, q:{sun,aspect,frost,slope,sky}, costIdx, costTier, c:{septic,foundation,rock,pad,driveway},
               score (overall), grade, sunH, daylightH, driveFt?, roadGrade?, roadRunFt?, roadName?, soil, flood?, why[] }
excluded[]   { ll, acres, why }
shelves[]    { ll, acres, elevFt, aspectDeg, slopeDeg, score, distFt?, dropFt? }
gardens[]    { ll, acres, elevFt, aboveFt, aspectDeg, slopeDeg, score, finalScore?, adj?, soil?, soilNote? }
focus        { ll, label }
point        { ll, elevFt, aboveFloorFt, slopeDeg, aspectDeg }
sun          { decDirectH, decDaylightH, noonAlt, noonClearance, worstAz, worstAngle, junDirectH, junDaylightH, profile[[az,deg]] }
sky          { mag, ratio, zone, zoneWord, year, coreAlt, ridgeS, coreClear, dome, domes[{az,w,km,ratio}], score, notes[] }
soils[]      NRCS component rows (mukey, muname, farmlndcl, cokey, compname, comppct_r, drainagecl, hydricrating, slope_l, slope_h,
               brockdepmin, drclassdcd, hydgrpdcd, wtdepannmin, flodfreqdcd, engdwbdcd, engdwobdcd, engstafdcd, englrsdcd, septic)
soilUnits[]  { mukey, muname, acres, color, geometries[] (clipped pieces) }   or null if the polygon query failed
flood        { zones[], sfha, sfhaAcres, mapped }
protected[]  { name, manager, type, access, gap, adjoins, distFt }
near         { hospitals[], grocers[], trailheads[], trailheadCount }   nearNote? (Overpass fallback used)
drives[]     { label, name, min, mi }
road?        { name, riseFt, runFt, gradePct }                          roadNote? (no road within 1,500 m)
house?       same shape as a site (minus rank/acres/compact) plus inside, onBench, benchAcres, veto, inSFHA;
             or { ll, outside: true } when the bulls-eye is off the DEM
driveway?    { toLabel, entrances[], routes[] (line, profile, metrics, cost, culverts, needsEasement, maxGrade, label,
               entranceIndex, track?), direct?, note, roadsNearestFt }     (the prototype's router; §2a in Phase 2.5)
flags[]      { lvl: 'fatal'|'warn'|'good', t }
verdict      'fatal' | 'marginal' | 'ok'
failed[]     step ids that failed
cancelled    whether the run was cancelled
raster refs  NOT stored. DEMs, slope/aspect, suitability surfaces and the horizon's ridge cells live in ScreenSession.
```

Scoring (do not change without updating fixtures):

- Cell suitability: slope score `lerp(slope°, [[6,100],[10,75],[14,50],[18,25],[22,0]])`;
  aspect score 100 if slope<3°, else by distance from 165°: `[[0,100],[30,100],[60,85],[90,65],[135,45],[180,40]]`;
  frost score by height above local valley floor (ft): `[[0,40],[thermalMinFt,100],[400,100],[900,75]]`.
  `house = slope × (0.55 + 0.45·aspect/100) × (0.75 + 0.25·frost/100)`.
  Garden: slope `[[3,100],[6,70],[10,40],[15,0]]`, frost `[[0,0],[thermalMinFt,100],[350,100],[800,60]]`,
  `garden = slope × (0.30 + 0.70·aspect/100) × (0.20 + 0.80·frost/100)`.
- House site = connected cells ≥ `houseMin` (60) and ≥ `benchMinAcres` (0.3); relax to `houseMin−15` (floor 40) if none.
  Shelf = ≥ `shelfMin` (45), ≥ 0.1 ac, not in a house site. Compact site = shelf ≥ 0.15 ac, ranked with pad cost.
  Garden patch = garden ≥ 60, ≥ 0.05 ac; soil adjustment ×0.4 poorly drained, ×0.8 somewhat poorly, ×1.1 prime farmland.
- Bottomland veto (site excluded): NRCS flood frequency frequent/occasional, drainage poorly/very poorly, or hydric = Yes.
- Site quality = 0.40·sunShare·100 + 0.15·aspect + 0.15·frost + 0.15·slope + 0.15·sky; ×0.25 if inside FEMA SFHA.
- Build cost (0–100) = septic {fine 0, workable 20, poor 40, unrated 25} + foundation {0,10,25,12} + rock (15 if bedrock < 100 cm)
  + pad (compact 15, else `lerp(slope°, [[6,0],[14,10],[22,20]])`) + driveway (min(30, neededFt/100) + 10 if grade > max).
  Tiers: <20 $, <40 $$, <65 $$$, else $$$$. Overall = 0.7·quality + 0.3·(100−cost). Grades A≥80 B≥65 C≥50 D≥35.
- Sky score: `clamp((mag−19)/3)·100 − min(25, 25·min(1, dome/3)) − 30 if core blocked (−10 if <8° clearance)`.

Data sources (endpoints in `config.endpoints`, editable, versioned):
3DEP ImageServer (UTM 17N, 3 m default; terrarium fallback at ≥8 m), NRCS SDA (`post.rest`, form-encoded),
FEMA NFHL layer 28, PAD-US `Fee_Managers_PADUS/FeatureServer/0`, TIGERweb Transportation layers 8/6/2,
Photon (komoot) with Overpass mirrors as fallback (from the browser through `GET /api/places/overpass?lat&lon`,
which runs the three place queries server-side with an identifying User-Agent: no mirror answers a browser),
OSRM public router (replace before any commercial use),
Lorenz atlas binary tiles (GitHub Pages), trailheads: USFS INFRA recreation sites, the state parks' points (VGIN, NC
DPR, TN TDEC) and Tennessee's TREC trails (`Tennessee_Statewide_Trails_Lines_Public`, step 2; phase-0.md §9.47); the
state aerial: VGIN VBMP, NC OneMap and TNMap's TDOT orthophoto (step 2); parcel services: NC OneMap `NC1Map_Parcels/FeatureServer/1`,
VGIN `VA_Parcels/FeatureServer/0`, TN Comptroller "Tennessee Property Boundaries (Public Use)"
`Tennessee_Property_Boundaries_Public_Use/FeatureServer/0` (below).

**Tennessee's parcel layer** (step 2; checked live 2026-10-17; phase-0.md §9.46). Published on ArcGIS Online by the
state's GIS office (account `tnmap_oir`, item `e356f1a241844d6f9025f2fa4e977df3`) for the Comptroller of the
Treasury, Division of Property Assessments, which the layer credits. Polygons in Web Mercator, asked in 4326;
`maxRecordCount` 2,000 with pagination; JSON, GeoJSON and PBF. Updated monthly. 86 of 95 counties: Chester,
Davidson, Hamilton, Hickman, Knox, Montgomery, Rutherford, Shelby and Williamson keep their own assessment systems
and have no lines (the map says so over them). Fields read: `OBJECTID`, `GISLINK` (the parcel: county, control map,
group, parcel), `COUNTY_NAME`, `CMAP`, `GP`, `PARCEL` (the tax card's number), `OWNER` and `ADDRESS` (shown live),
`DEEDAC` (deeded acres), `LINK_TPAD` (the state's assessment record), and `PARCEL_TYPE` in queries: 4 (railroad
right-of-way) and 5 (parcel conflict) are never lines or taps. `PARCELID` isn't read: it ends in the tax year.

Its terms, as published:
- The item (public): "This dataset is intended for public use" and "This service is not intended for commercial
  use", with the download from the Comptroller's site recommended for commercial purposes. Its license text is an
  as-is disclaimer: the maps are "for graphical reference only", are not legal descriptions and don't establish
  boundary lines, and carry no warranty.
- The layer's own description: "This data is intended for use by state agencies with approved access." It also says
  "all 95 counties", which the layer doesn't hold (86): it's carried over from the state's restricted statewide
  dataset.
- **The item's text governs** (owner, 2026-10-17): a free, non-commercial public app is its intended use. If the app
  ever charges, it switches to the Comptroller's downloadable data per their commercial-use note.

## 2a. Driveway router (`lib/screen/driveway.ts`)

Least-cost path over the fine DEM from a road entrance to a site, with a hard grade constraint.

- **Entrance candidates:** sample Census road lines every 10 m; keep points within 15 m of the
  parcel boundary (frontage). Score = road grade at the point + bearing change over ±100 m
  (sight-distance proxy) + bank height (road elevation vs. the cell 15 m inside, perpendicular).
  Expose the top three; the user may drop one.
- **Graph:** 16-connected grid on the fine DEM. Edge forbidden if `|Δz|/d > maxGrade`
  (default 10%; 8% "gentle", 12% "I'll live with it"). Edge cost
  `d × (1 + wGrade·(grade/maxGrade)²) × crossSlope(b) × soil(b) × inside(b) + crossing(b)`, where
  `crossSlope = 1 + 3·tan(slope)`, `soil` = 20 for bottomland cells, 1.5 for shallow-rock cells,
  `inside` = 4 outside the boundary (route needs an easement — flag it), and `crossing` adds a
  fixed cost when entering a drainage cell (D8 flow accumulation ≥ 2 ha contributing area).
- **Two runs:** `shortest` (wGrade 1) and `gentlest` (wGrade 4, maxGrade 8%). Draw both; recommend
  the lower total cost.
- **Smoothing:** one Chaikin pass, then re-sample at 3 m against the DEM; report the re-sampled
  profile, not the grid one.
- **Quantities:** length, rise, max/avg grade, switchbacks (turns > 100° in 15 m), earthwork
  `Σ W²·s/2 · ds` with W = 12 ft bench and s = local cross-slope (rock share from soils), stone
  `W × 8 in × length × 1.8 t/m³`, clearing corridor 24 ft × length (wooded share from NLCD when
  available; 100% assumed and stated until then), culverts = drainage crossings + 1 at the entrance.
- **Cost:** quantities × editable unit-cost table (`config.driveway`), shown as ±30% range.
  Replaces the straight-line driveway term in the site's build-cost index.
- **Outputs on the result:** `sites[i].driveway = { entrance, path (lineString), profile, metrics,
  cost:{low,high}, needsEasement, culverts[] }`. The route drapes on the 3D block.
- **Stated limits:** bare-earth DEM; rock from county soils, not borings; VDOT decides sight
  distance; easements only if drawn.

## 3. Data model (Supabase; RLS on every table)

```sql
households      id, name, created_at
memberships     household_id, user_id, role ('owner'|'member'), primary key (household_id, user_id)
regions         id, name, state, counties text[], scores jsonb   -- from the Mountain Town Assessment
parcels         id, household_id, region_id?, name, recipe jsonb, geometry geography(Polygon,4326), source ('county'|'drawn'|'split'|'combined'|'listing'),
                parent_parcel_id?, state, county, parcel_number?, acres, status ('watching'|'contender'|'walked'|'offered'|'passed'|'ignored'),
                my_verdict text, notes text, dedupe_key text, created_by, created_at, updated_at
screens         id, parcel_id, version int, schema_version int, run_at, config jsonb, result jsonb,
                verdict, quality int?, cost_idx int?, sky_mag numeric?, created_by
attachments     id, parcel_id, kind ('pdf'|'image'|'link'|'note'), title, storage_path?, url?, added_by, added_at
price_events    id, parcel_id, date, amount numeric, kind ('listed'|'reduced'|'auction_open'|'reserve_est'|'offer'|'sold'|'assessed'|'my_estimate'),
                source ('redfin'|'hibid'|'county'|'me'|'other'), note
comments        id, parcel_id, user_id, body, attachment_id?, pinned bool, resolved bool, created_at
parcel_shares   parcel_id, household_id, version_id?, shared_by, shared_at, note_to_reader
share_links     id, parcel_id, token (opaque), preset ('full'|'legal'), expires_at?
rules           id, household_id, name, rules jsonb, active bool
sources         id, household_id, kind, name, config jsonb, cadence_minutes int, last_run, last_ok, enabled, tos_note
searches        id, household_id, criteria jsonb, notify bool
listings        id, source_id, external_id, url, title, description, address, parcel_numbers text[], acres, opening_bid,
                ends_at, raw jsonb, first_seen, last_seen, dismissed bool, parcel_id?
```

RLS pattern: a row is visible if its `household_id` (directly or via `parcels`) is in the
caller's memberships. `share_links` are read by token via a server route using the service role.

**`parcels.recipe` is the source of truth for a parcel's boundary.** It's the recipe from §3a: `pieces`
(county records and drawn shapes), `split`, `house`, `hidden` and `excluded`. `geometry`, `acres`, `source`,
`dedupe_key`, and `state`, `county` and `parcel_number` are **cached values derived from it**
(`lib/geo/recipe.ts` `deriveParcel`, `recipeDedupeKey`). Every edit to the recipe recomputes them in the same
write. They're kept as columns for indexing, spatial queries and listing matches, and are never edited on
their own. A `listing` parcel with no county match has a recipe of one drawn piece. `parent_parcel_id` is
set when a parcel was made from another by splitting it off.

Dedupe key for parcels/listings: `state:county:parcel_number` when present; else
`state:county:round(centroid, 4 decimals):round(acres)`. A parcel built from several recorded parcels takes
their keys sorted and joined with ` & `. Drawn pieces never contribute; a parcel of drawn pieces only has
no key (`lib/geo/recipe.ts` `pieceDedupeKey` / `recipeDedupeKey`).

`county` in the key is the record's **5-digit county FIPS code** where the service provides one (VA `FIPS`,
e.g. `51063`; NC `stcntyfips`), else the county name in lower case (TN `COUNTY_NAME`; `countyKey`). Parcel
numbers repeat across counties: VA's `52-44` exists in Dinwiddie, Floyd, Wythe and King William, and before
this rule VA records, which carry no county name field the key read, all keyed as `VA::52-44`. Examples:
`VA:51063:52-47A`, `NC:37005:1234`, `TN:carter:010066    03700`. Tennessee's parcel number in the key is its
`GISLINK`, stable across tax years (`PARCELID` ends in the tax year); a parcel drawn as several polygons shares it.

### 3a. The local parcel store (Phase 0) and its Phase 1 import

Before accounts exist, the explorer keeps the open parcel and History in the browser, as the `ps.parcels`
document of the current local profile (`lib/client/parcelStore.ts`, `lib/client/profileStore.ts`; roadmap step 1,
phase-0.md §9.45): IndexedDB `parcelscreen`, store `docs`, keyed by [profile, key], holds each profile's parcels,
settings (`ps.cfg`), rubrics (`ps.rubrics`, `{ mine, others }` as `lib/rubric/schema.ts` validates them) and views, each
as the JSON string the prefs module writes; the kept screens carry their profile's id. Until step 1 the store was
localStorage `ps.parcels`; step 1's first boot moved those keys into "Profile 1" and renamed them `ps.legacy.*`. Step 2
dropped both under the clean-break rule: the boot deletes them and moves nothing, and a browser that still held
pre-profile keys says once "Saved with an older version; screen it again." (`lib/client/oldData.ts`). Accounts
(not scheduled since 10/19; step 5 syncs devices by a code instead) start empty; parcels come over with an export file (owner, 10/17). It's versioned
by `v`: any change takes a new `v` and a converter (the store already converts 13d's `ps.current`, which had no `v`
field at the parcel level).

```jsonc
{
  "v": 2,
  "open": { /* the parcel on screen: a built parcel (a copy of its History entry), a plain one, or null */ },
  "built": [                         // History, oldest first: every built parcel, each with a key
    {
      "key": "6f1c…",                // stable id (crypto.randomUUID); never reused
      "pieces": [                    // county records and drawn shapes, combined by the 13b rules
        { "geo": { /* GeoJSON Feature<Polygon> */ }, "props": { /* the county service's attributes */ },
          "source": "https://vginmaps…/FeatureServer/0", "multiPart": false },
        { "geo": { … }, "props": {}, "source": "drawn", "multiPart": false }
      ],
      "split": { "a": [36.63, -81.35], "b": [36.62, -81.34], "keep": -1 },   // or null
      "house": [36.629, -81.354],    // [lat, lon] or null
      "notes": "Ask whether the spring is shared.",
      "notesAt": "2026-10-05T15:47:00.000Z",                                  // or null
      "askingPrice": 185000,         // dollars, as typed (B2a), or null; "askingPriceAt": when it was entered, or null
      "askingPriceAt": "2026-10-11T12:00:00.000Z",
      "name": "Ferney Creek 43 ac",  // WF1: the household's name for it; "" shows the derived one (the parcel ID)
      "listingUrl": "https://www.redfin.com/VA/Floyd/0-Ferney-Creek-Rd-24091/home/12345678",  // as typed; never fetched
      "listingAcres": 52,            // what the listing claims, or null
      "agent": "A. Agent, 540-555-0100",                                      // free text; a third party's contact
      "status": "archived",          // WF2: "inProgress" (the default) | "saved" | "archived"
      "archived": { "reason": "Sold", "at": "2026-10-14T12:00:00.000Z", "from": "saved" },  // or null; Restore → from
      "milestones": { "walked": "2026-10-01", "offered": null },               // calendar dates, or null
      "rank": "V",                   // WF3: its place in My order, a fractional index (lib/client/myOrder.ts)
      "drivewayLine": null,          // WF5: the line chosen as the driveway (by id), or null for the app's pick
      "markup": [ /* drawn lines (follow-up 34, #127): { id, name, shape: "line", kind, condition, line, widthFt, note, recordedIn, at };
                    WF4's point markers { id, name, shape: "point", kind, ll, septicClass, note, at } and area markers
                    { id, name, shape: "area", kind, ring, septicClass, note, at } */ ],
      "hidden": ["an:horizon"],      // layer ids hidden on the map
      "excluded": ["an:site2"],      // results removed from the analysis
      "screenIds": [],               // screens run on it (step 14 fills this in; `screens.id` in Phase 1)
      "updatedAt": "2026-10-05T15:47:00.000Z"
    }
  ]
}
```

- **Built** means changed: more than one piece, a drawn or derived piece, a split, a house, notes, or a
  screen. Built parcels are saved as they change, and stay in History until the user removes them. **Nothing
  expires and nothing is trimmed:** Remove is the only way out.
- **Derived, never stored:** the boundary, the facts and the acres (`lib/geo/recipe.ts` `deriveParcel`).
  The boundary is the pieces combined, then the split. The acres are the pieces' own, leaving any bridged
  road strip out.
- **Drawn pieces** carry no facts and no identity: owners, IDs and counties come from the county records
  only.
- **My order** (WF3, `docs/plans/parcel-workflow.md` §5): `rank` is a string that sorts between its neighbours, so
  a move writes one parcel. A parcel gets one when it's built, at the bottom. A parcel stored before WF3 has none
  (or a malformed one) and gets one the first time the store is read, at the bottom, in History's order.
- **The driveway choice** (WF5, `docs/plans/parcel-workflow.md` §3.4): `drivewayLine` is a drawn line's id; the card
  scores the route the screen found from that line's end instead of the app's pick (no screen data changes). Deleting the
  line clears it. A line's `recordedIn` is where an easement is recorded, as typed ("Ashe Co. Plat Bk 574 Pg 1132"), or
  "": filled, the card stops asking that the easement be verified and says where it's recorded. A parcel or line kept
  before WF5 gets null and "", with no new `v`.
- **Markers** (WF4, `docs/plans/parcel-workflow.md` §3.1–3.2): a point (`ll`, [lat, lon]) marks a spring, a well, a
  septic permit, a building, power, a campsite, a gate or a note; an area (`ring`, three corners or more, not closed)
  marks a septic permit's field or a clearing. Each has a name numbered per kind ("Spring 1"), a note, and a septic
  permit's class as typed (`septicClass`: conventional, modified, alternative, or null). Only lines reach the screen;
  the card reads the markers when it's drawn. A line kept before WF4 has no `shape`, and loads as a line; a marker
  needs no new `v`.
- **Import (Phase 1), one `parcels` row per built parcel:**
  - `recipe` = `{ pieces, split, house, hidden, excluded }`, as stored;
  - `notes` = `notes`;
  - `name` = `name` when it isn't blank (else the derived name, or the prototype's "Name:" line, below);
    `listing_url`, `listing_acres` and `agent` as stored (WF1, `docs/plans/parcel-workflow.md` §2); the asking
    price becomes a `price_events` row (`listed`, source `me`, dated `askingPriceAt`); each drawn line, and each
    point or area marker (WF4), a `markers` row with its geometry;
  - `status` as stored, `archived_reason` from `archived.reason`, the milestones as `walked_at` and `offered_at`
    (WF2, `docs/plans/parcel-workflow.md` §4); the archive, and each milestone set, also become `status_events`;
  - `list_rank` = `rank` (WF3: My order, one per household);
  - the cached columns (`geometry`, `acres`, `source`, `dedupe_key`, `state`, `county`, `parcel_number`)
    derived from the recipe, as for any edit (§3). The dedupe key uses the county FIPS rule in §3; it's
    computed from the stored pieces' attributes at import, never stored locally, so that rule needed no
    new `v`.

  `screenIds` link to `screens` rows once results are stored there.

**The export file (Phase 0 step 16), Phase 1's other import source.** The explorer's ☰ → Export file writes
`parcelscreen-YYYY-MM-DD.json`, so a household's History can move between browsers before accounts exist, and
Phase 1 imports it into Supabase the same way as the `ps.parcels` store. It's versioned by `format` and
`version`: any change to its shape takes a new `version` and a converter.

```jsonc
{
  "format": "parcelscreen-export",
  "version": 6,
  "exportedAt": "2026-10-07T15:00:00.000Z",
  "cfg": { /* UserConfig (lib/screen/types.ts), as stored in ps.cfg */ },
  "parcels": { "v": 2, "open": null, "built": [ /* the ps.parcels store above, written in My order */ ] },
  "screens": [ /* the kept screen records named in built[].screenIds: { id, keys: { boundary, house, settings }, result } */ ],
  "profile": { "name": "Profile 1" },   // version 6: the profile it was exported from
  "rubrics": { "mine": { /* Rubric */ }, "others": [ { "id": "…", "name": "Julie", "rubric": { /* Rubric */ } } ] }
}
```

- **Version 6** (roadmap step 1): the profile the file came from (`profile: { name }`) and its rubrics (`rubrics`,
  `{ mine, others }`). A version 5 file still imports: `fromV5` (`lib/client/exportFile.ts`) gives it null for both.
  An import goes into the current profile; the file's rubrics replace the profile's only when the user ticks
  "Replace my rubric too" in the import summary (off by default). This app reads versions 1 to 6; an older app can't
  read version 6.
- **Version 5** (owner, WF5): each parcel's `drivewayLine` and each line's `recordedIn` (below). A version 4 file
  still imports: `fromV4` gives every parcel the app's pick (`drivewayLine: null`) and every line no record
  (`recordedIn: ""`). This app reads versions 1 to 5; an older app can't read version 5.
- **Version 4** (owner, WF4): a parcel's `markup` holds point and area markers besides its lines (below), each entry
  with its `shape`. A version 3 file still imports: `fromV3` (`lib/client/exportFile.ts`) gives each of its lines
  `shape: "line"` (version 2 and 1 files go through their converters first). This app reads versions 1 to 4; an older
  app can't read version 4.
- **Version 3** (owner, #135): each parcel's `rank` (My order, WF3) is written, and `built` is written in My order,
  so a backup restored into an empty browser keeps the ranking. A version 2 file still imports: `fromV2`
  (`lib/client/exportFile.ts`) keeps each rank it has, and appends every parcel without one at the bottom, in the
  file's order (a version 1 file goes through `fromV1`, then `fromV2`). On import, the file's parcels go to the bottom
  of this browser's My order, in the file's own My order. This app reads versions 1, 2 and 3; an older app can't
  read version 3.
- **Version 2** (owner, after #131): every parcel field above is written. A version 1 file (before the asking
  price, the drawn lines, the listing's facts and the status) still imports: `fromV1` (`lib/client/exportFile.ts`) gives
  each parcel the defaults for what it lacks (`V1_DEFAULTS`: no price, no lines, no listing facts, in progress, no
  milestones), and the lines inside `markup` get their kind's name, condition and width as the store's loader gives
  them. This app reads versions 1 and 2; an older app can't read version 2.
- **Phase 1 import:**
  - `parcels.built[]` become `parcels` rows as above;
  - `screens` become `screens` rows (version 1 each, immutable), linked through `screenIds`;
  - `cfg` becomes the user's settings;
  - `profile` names the local profile the account adopts (if accounts come), and `rubrics.mine` becomes the user's
    rubric, `rubrics.others` the household members' (step 6);
  - `open` is ignored.
- **Duplicates:** the Phase 0 import matches every parcel on its `key`:
  - an identical key is skipped, never overwritten;
  - so is an identical recipe under another key: the same pieces, by source and geometry, and the same split;
  - a distinct recipe of the same county record is added as its own entry.

  So History, and a file, can hold several recipes of one record, and duplicates made before 16b stay.
  Deduplicating them, with the §3 dedupe key, is Phase 1's job.
- **Names from the prototype:** History has no name field. A parcel imported from a prototype export keeps
  its saved name as the first line of `notes`, exactly `Name: {name}`, then a blank line, then any notes.
  Phase 1's import lifts that line into the parcel's name and keeps the rest as `notes`.
- **All or nothing:** the whole file is validated before anything is written.

### 3b. The rubric editor: "What matters to you" (roadmap step 3)

"What matters to you" (`/priorities`; "My priorities" in the menu, the rulebook and each card panel; phase-0.md §9.50
and §9.52) edits the current profile's `ps.rubrics.mine` in place. "Rubric" stays the code's name for it. The rubric's
stored shape is step 1's (`lib/rubric/schema.ts`); the editor adds nothing to it.

- **The intro** says what the list is ("Every parcel you screen is graded against this list."), each column in a line,
  and how to use it.
- **Four columns:** Must have, Really want, Nice to have, Don't care (Must, Should, Could and Won't in the code).
  Dealbreakers go only to Must have or Don't care. A row dropped on Must have becomes a limit at its B/C edge and keeps
  its ranked card, marked "limit". Homesite is never a limit.
- **Cards** show a title and one plain line; the exact number is in the card's sheet. No rank or weight on the cards:
  the weights are in the notice's "See what changed" and the rulebook.
- **Moves:** by drag (mouse, touch after a 250 ms hold, keyboard) or a card's Move to…. A card's sheet sets its band's
  B/C edge with a slider, which shifts the band (`card.editor` holds the ranges).
- **Weights** stay explicit until the first reorder. After that the order sets them (rank-sum, Could ×0.75), applied
  at once with an inline notice: the before/after table, and an Undo.
- **Saving:** every change saves at once. Undo covers the last ten changes; "Reset to the starting list" asks first,
  in a dialog.
- **Try it,** a strip under the intro (the bottom bar on a phone), grades one parcel before → now ("B → A ·
  Contender") with up to two plain reasons, and follows a held card before it drops. No points. The parcel is the open
  one, else the latest screened saved one, else the Mud Creek sample (`lib/rubric/sample`).
- **No re-screen:** a change re-grades every parcel at once, because the rubric isn't part of a screen's run keys.
- **The verdict lines are letter edges** (§9.51): A or B is a Contender, C a Maybe, D or F a Pass.
- **Others' rubrics** stay read-only until step 6.

### 3c. The interview (roadmap step 4)

A few questions, about four minutes, that make a person's priorities (`/interview`; phase-0.md §9.53–§9.54; the plan's
§3 holds every choice's effect).

- **The screens:** 14 forced-choice scenes, one per screen, with Back, Skip and the progress ("4 of 14"). A first
  answer moves on by itself; a screen that already holds one shows it, with Next in Skip's place. Question 7 is two
  rows (flying, and internet for video calls); 7, 13 and both halves of 14 have Continue. Question 14 asks what would make the
  person walk away (limits, with their numbers) and what doesn't matter. Nothing asks about health, income, age or
  family.
- **The generator,** `rubricFromAnswers` (`lib/rubric/interview/`): a row takes its highest answer's points (0–3);
  Really want is the rows with 2+ points, kept to 3–6; rank-sum weights; each answer marks its row's B/C edge; 14a's
  chips add limits (elevation, the ER, December sun on Best homesite), 14b's drop dealbreakers or rows. Skipping
  everything keeps the starting list. The numbers are `card.interview` in `config.ts`.
- **Stored raw,** in the profile's `ps.interview` (not in the export file until step 6), saved as each answer is
  picked so a half-done interview resumes where it was left. Answers about factors the app doesn't measure yet are
  kept but not shown (owner, 10/18); a later step adds such a factor to the person's list without touching their
  changes, and says so once (the plan's §5).
- **Onboarding:** a new profile (a first visit, or "Add a profile") starts with its name, then the interview, with
  "Not now" on every screen; the app sends it there until it's finished or put off. The ☰ menu offers "Answer a few
  questions (about 4 min)" while the profile has no answers; after that the priorities page alone offers "Finish your
  questions (6 of 14)" or "Answer the questions again".
- **The result,** headed "What matters to you" as the priorities page is, with Try it: saved, unless the list was changed since, when it asks "Replace the
  priorities you changed?" ("Replace with the new list", "Keep my changes").
- **On the priorities page:** "Reset to my answers", and each card's why in the person's own terms ("You'd want an ER within 30 minutes"; else "You moved this here." or "On the starting list.").

## 4. The parcel page (the export)

Blocks, in order; each is computed, placeholder, or user-authored:

1. Header — name, county, acres, status, badges (verdict, best site "A site · $$"), price line
   (latest ask · assessed · my estimate), hero image (first image attachment or map snapshot).
2. Verdict and flags (computed).
3. Map snapshot with pins and the house-suitability overlay (computed; stored as an image on save).
4. Where to build — ranked sites with quality/cost badges, factor chips, side-by-side table (computed).
5. December sun and Dark skies at the evaluation point (computed).
6. Soils by map unit with plain-language readings (computed).
7. Floodplain, public land, getting there (computed).
8. Listing — photos, MLS/HiBid facts, agent, link (placeholder until filled).
9. Documents — plat, restrictions, bidder pack, perk letter (attachment slots).
10. Price history (user-entered + Watch-appended).
11. Still unknown checklist (computed list, user-ticked).
12. Notes and my verdict (user).
13. Comments thread (shared).

Export presets: `full` (all blocks), `legal` (header, map, soils, flood, public land, documents,
restrictions-related flags). PDF via headless Chromium in a Route Handler or Vercel's `@sparticuz/chromium`;
3D walkthrough replaced by three captured frames (block, 3 pm December, porch view) saved at contender time.

## 5. Rule DSL (Phase 3)

Rules evaluate in order over `{ ...screen.result flattened, listing.*, parcel.*, region.* }`.

```json
[
  { "name": "high country first", "when": { "elev_mean_ft": { "gte": 3000 } }, "then": { "tier": 1 } },
  { "name": "forest-adjacent mid", "when": { "elev_mean_ft": { "gte": 1500 }, "adjoins_open_public_land": true }, "then": { "tier": 2 } },
  { "name": "too low", "when": { "elev_mean_ft": { "lt": 2000 } }, "then": { "ignore": true, "unless": "forest-adjacent mid" } },
  { "name": "sky floor", "when": { "sky_mag": { "lt": 21.0 } }, "then": { "tier_max": 3 } },
  { "name": "read the instrument", "when": { "listing.text": { "matches": "restrict|covenant|HOA|right.of.way" } }, "then": { "flag": "read the recorded instrument" } }
]
```

Operators: `eq, neq, gt, gte, lt, lte, in, matches` (regex, case-insensitive), boolean fields by value.
Effects: `tier` (set), `tier_max` (cap), `ignore` (hide), `flag` (annotate), `unless` (name of an
earlier rule that overrides). Exposed fields include at least: `elev_mean_ft, elev_max_ft, acres,
acres_under_15pct, best_site.quality, best_site.cost_idx, sky_mag, sky_score, core_clear_deg,
adjoins_open_public_land, nearest_open_public_land_ft, sfha_acres, drive_min.<anchor>, dec_sun_h,
listing.acres, listing.county, listing.opening_bid, listing.ends_at, listing.text, region.<category>`.

## 6. Connectors (Phase 4+)

```ts
interface SourceConnector {
  kind: string;
  minCadenceMinutes: number;                      // TOS floor; UI cannot go below
  tos: { url: string; note: string; allowsAutomation: boolean | 'unknown' };
  fetch(config: unknown, since: Date): Promise<RawListing[]>;   // network only, via lib/http
  parse(raw: RawListing): Listing;                              // pure
}
```

Parsing extracts acreage (`\b(\d+(?:\.\d+)?)\s*(?:\+/-|±)?\s*acres?\b`), parcel IDs
(`parcel\s*(?:id|#|no\.?)\s*#?\s*([0-9A-Z-]{3,20})`, plus state-specific patterns), county from
address, and auction end dates. Misses are logged, not guessed.

Scheduler: Vercel cron → `/api/watch/tick` (header `Authorization: Bearer $CRON_SECRET`) runs every
source whose `last_run + cadence_minutes` is due and whose cadence ≥ its connector floor.

First connector: Gmail (owner's own mail from auction firms). Second: HiBid GraphQL (nightly floor,
`allowsAutomation: 'unknown'`). Land.com: `allowsAutomation: false` until the ToS is read.

## 7. Neighbors fan-out (Phase 5)

Buffer the seed parcel (default 0.25 mi), query the state parcel service, score each neighbor:
recent estate/gift transfer (sale ≤3 y at ≤$1 or instrument type will/gift), owner-name pattern
(`ESTATE|HEIRS|ET AL|TRUSTEE|C/O`), absentee (mail ≠ site, out of county/state), long tenure with no
structure (≥25 y, structure value 0), land-use enrolled, adjoins public land or the seed. Attribute
availability by state: NC OneMap rich; TN moderate; VA via per-county CAMA adapters (Floyd: Concise
Systems). Output a ranked table and a letter draft per selected neighbor; sending is manual.

## 8. Non-goals (for now)
Cesium; a mobile native app; multi-tenant SaaS billing; replacing OSRM (until commercial use);
automated letter sending; any scraping of a source whose ToS forbids it.
