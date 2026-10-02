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

```ts
export async function screen(input: ScreenInput, onProgress?: (e: ProgressEvent) => void): Promise<ScreenResult>

interface ScreenInput {
  polygon: GeoJSON.Polygon;           // WGS84
  config: UserConfig;                 // thresholds, weights, anchors, endpoints
  house?: [lat, lon];                 // optional existing house
  evaluateAt?: [lat, lon];            // optional explicit evaluation point
}

type Step = 'dem' | 'terrain' | 'soils' | 'sun' | 'sky' | 'flood' | 'padus' | 'near' | 'drive' | 'rank';
interface ProgressEvent { step: Step; status: 'run' | 'done' | 'fail' | 'skip'; message?: string }
```

`ScreenResult` (store as JSON in `screens.result`; stable, versioned by `schemaVersion`):

```
schemaVersion, runAt, acres, demSource, demResM
terrain      { elevMinFt, elevMaxFt, elevMeanFt, reliefFt, valleyFloorFt, heightAboveValleyFt,
               slopeMedDeg, slopeP90Deg, acresUnder15, acresOver25, diag:{houseAc, shelfAc, gardenAc, totalAc} }
sites[]      { rank, ll, acres, elevFt, aspectDeg, slopeDeg, compact?, quality, qGrade, q:{sun,aspect,frost,slope,sky},
               costIdx, costTier, c:{septic,foundation,rock,pad,driveway}, sunH, driveFt?, roadGrade?, roadName?, soil?, why[] }
excluded[]   { ll, acres, why }
shelves[]    { ll, acres, elevFt, aspectDeg, slopeDeg, score, distFt?, dropFt? }
gardens[]    { ll, acres, elevFt, aboveFt, aspectDeg, slopeDeg, score, finalScore, soil?, soilNote? }
focus        { ll, label }
point        { ll, elevFt, aboveFloorFt, slopeDeg, aspectDeg }
sun          { decDirectH, decDaylightH, noonAlt, noonClearance, worstAz, worstAngle, junDirectH, junDaylightH, profile[[az,deg]] }
sky          { mag, ratio, zone, zoneWord, year, coreAlt, ridgeS, coreClear, dome?, domes[{az,w,km,ratio}], score, notes[] }
soils[]      NRCS component rows (mukey, muname, farmlndcl, compname, comppct_r, drainagecl, hydricrating, slope_h,
               brockdepmin, drclassdcd, hydgrpdcd, wtdepannmin, flodfreqdcd, engdwbdcd, engdwobdcd, engstafdcd, englrsdcd, septic)
soilUnits[]  { mukey, muname, acres, geometry (clipped), color }
flood        { zones[], sfha, sfhaAcres, mapped }
protected[]  { name, manager, type, access, gap, adjoins, distFt }
near         { hospitals[], grocers[], trailheads[], trailheadCount }
drives[]     { label, name, min, mi }
road?        { name, riseFt, runFt, gradePct }
house?       (same shape as a site, plus inside, onBench, veto, inSFHA)
flags[]      { lvl: 'fatal'|'warn'|'good', t }
verdict      'fatal' | 'marginal' | 'ok'
failed[]     step labels that failed
raster refs  NOT stored. Overlays are regenerated from `surfaces` only in-session.
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
Photon (komoot) with Overpass mirrors as fallback, OSRM public router (replace before any commercial use),
Lorenz atlas binary tiles (GitHub Pages), parcel services: NC OneMap `NC1Map_Parcels/FeatureServer/1`,
VGIN `VA_Parcels/FeatureServer/0`, TN Comptroller `GeoViewer/Parcels_View/MapServer/0`.

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
parcels         id, household_id, region_id?, name, geometry geography(Polygon,4326), source ('county'|'drawn'|'split'|'listing'),
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

Dedupe key for parcels/listings: `state:county:parcel_number` when present; else
`state:county:round(centroid, 4 decimals):round(acres)`.

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
