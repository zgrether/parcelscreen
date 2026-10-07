# Phase 0 — Port the Explorer

Status: **approved 2026-10-04** with the answers recorded in §9.

Goal (from PLAN.md): the prototype as a Next.js app, with the screening pipeline isolated from the
DOM, running in a Web Worker, producing the same verdicts, site rankings, sun hours (±0.1 h) and sky
numbers as `legacy/parcelscreen.html` on the two reference parcels. Fixtures are recorded, and the
pipeline tests run offline.

References to the prototype are given as `proto L<n>`, meaning line numbers in `legacy/parcelscreen.html`
build `2026-10-01 20:46 UTC`, which this plan was written against. The port and the fixtures target
build **`2026-10-04 20:36 UTC`**. That build fixes B1, B8, B10 and C4 in the prototype itself. It also
moves the shelf distances and map pins out of the `rank` step into a new `finalizeRanking(R)`, so
line numbers after about L1166 differ from the references here.

---

## 1. What reading the prototype turned up

These either conflict with PLAN/REQUIREMENTS or are bugs. Each one has an open question in §9,
unless the fix doesn't change any number.

### 1a. Conflicts with the docs

| # | Finding | Where |
|---|---|---|
| C1 | **The prototype already has a driveway router.** That covers entrance candidates, a 16-connected Dijkstra with a grade limit, the shortest-legal and gentlest routes, quantities, cost ±30%, a pioneer 4×4 track estimate and a direct 15% track. It runs as an 11th step, `driveway`, which rewrites site #1's driveway cost, overall score and grade. PLAN puts the router in Phase 2.5, and the REQUIREMENTS `Step` type has no `driveway`. The prototype also differs from REQUIREMENTS §2a in places: entrances within 40 m (not 15 m), bend over ±60 m (not ±100 m), no D8 crossing threshold by area beyond 2 ha, a 100 ft easement threshold, and the extra pioneer/direct-track estimates. | proto L1172–1178, L1322–1402 |
| C2 | Aspect scoring uses two different targets: **165°** for the cell suitability surface and **160°** for site quality in `scoreSite`. REQUIREMENTS only states 165. | proto L913, L1284 |
| C3 | The Settings fields `aspectFrom` / `aspectTo` (90/225) aren't read anywhere. | proto L415, L352–353 |
| C4 | The help text said a compact site "takes a 10-point penalty". The code adds **15** pad-cost points, as REQUIREMENTS says. **Fixed in the 2026-10-04 prototype; the port matches it.** | proto L304 vs L1296 |
| C5 | The prototype renders partial results after every step, and the 'near' step can attach a "test the query" link. The REQUIREMENTS `ProgressEvent` carries neither. | proto L1000–1005, L1121 |
| C6 | The REQUIREMENTS `ScreenResult` leaves out fields the UI needs: `benches[]` (Terrain section), overall `score`/`grade` per site (ranking), `cancelled`, `houseMinUsed`, `nearNote`, `roadNote`, `cell{}` factor parts, `daylightH`, `roadRunFt`, and `flood` per site. | proto L1462–1464, L1164 |

### 1b. Prototype bugs

| # | Bug | Proposed handling |
|---|---|---|
| B1 | `drawDriveway` called `dwLayer.addTo(dwLayer)`, so **the routed driveway, entrances and culverts never appeared on the map.** Only the panel showed them. | **Fixed in the 2026-10-04 prototype.** The port draws them. |
| B2 | The "state ortho" basemap draws the *parent* tile in the child's slot beyond native zoom (VA z20, USGS z17+), which smears the imagery. | Fixed for free: MapLibre overzooms correctly when each source declares `maxzoom`. |
| B3 | `CFG.lpAtlasYear` is read from the wrong object (it lives inside `endpoints`), so it is always 2025. | Read `endpoints.lpAtlasYear`. The default is 2025, so no number changes. |
| B4 | The 3D horizon fan hard-codes a 3° canopy and compares each ridge with the *noon* altitude. The 2D map fan compares with the sun's altitude *at that azimuth*, plus the configured canopy. The 3D hour ticks also hard-code 3°. | §9.5 |
| B5 | The 3D night sky builds its date in the **viewer's browser time zone** but computes sidereal time from UTC. Anyone outside Eastern time sees the Milky Way in the wrong place. | Interpret the month/hour selects in `UserConfig.timeZone` (default `America/New_York`). See §9.5. |
| B6 | 3D sun-path latitude comes from the parcel's first vertex, not the selected site. | Use the selected site's latitude. The difference is under 0.01°, invisible. |
| B7 | MultiPolygon parcels keep only the first polygon. Soil WKT ignores holes. | Port as-is, and show a "multi-part parcel: only the first part screened" note. §9.8. |
| B8 | After the driveway step changed site #1's score, the sites were **not re-sorted**, so #1 could end up scoring below #2. | **Fixed in the 2026-10-04 prototype** (re-sort and re-rank after routing). Ported verbatim. |
| B10 | A side effect of the B8 fix in the 20:24 build: shelf `distFt`/`dropFt` and the map pins came from the *pre-routing* ranking. | **Fixed in the 2026-10-04 20:36 prototype** (`finalizeRanking` after rank and again after the driveway re-sort, which also re-grades every site). Ported verbatim, with no deviation. |
| B9 | `routeDriveway` multiplies row offsets by `res` (x) and column offsets by `resY`. That's harmless because the two are equal on 3DEP output. | Port verbatim, with a comment. |

### 1c. "Things the prototype got wrong" (CLAUDE.md), and how each is handled

- Hour-tick labels and pins are DOM, not canvas sprites. Map pins become `maplibregl.Marker` elements. 3D pins and hour labels become `@react-three/drei` `<Html>` overlays.
- The 'near' step runs Photon and TIGER in parallel, and the three TIGER layers (8/6/2) also go out in parallel.
- Wide DEM cache: the worker keeps an in-memory LRU of DEMs keyed by `(bbox rounded to 1e-5°, resM)`, holding at most 4 entries. "Run again" and re-evaluation never refetch. Nothing is persisted.
- Atlas tile decoding is memoized per worker lifetime. The prototype already memoizes per page, and the worker keeps that.

---

## 2. Architecture and module boundaries

```
 ┌──────────── main thread (React, DOM) ─────────────┐        ┌──────── Web Worker (no DOM) ────────┐
 │ app/explore  ── ExploreShell (state reducer)      │  run   │ lib/screen/worker.ts                │
 │   ├ components/Map/*        MapLibre + DOM pins   │ ─────► │   screen(input, onProgress, deps)   │
 │   ├ components/Results/*    one per section       │ ◄───── │   evaluateAt / setHouse (session)   │
 │   ├ components/Walkthrough3D/*  r3f               │progress│   holds ScreenSession + DEM LRU     │
 │   └ lib/client/useScreen.ts (worker hook)         │partial │                                     │
 │ lib/render/overlays.ts  (pure: arrays → RGBA)     │ done   │ lib/screen/*  lib/geo/*  lib/http.ts│
 └───────────────────────────────────────────────────┘        └─────────────────────────────────────┘
                        lib/screen, lib/geo and lib/http also run unchanged in Node (Vitest, later cron)
```

### 2a. The pipeline contract

This is the REQUIREMENTS §2 contract plus the additions marked ★. Approved in §9.7.

```ts
export async function screen(
  input: ScreenInput,
  onProgress?: (e: ProgressEvent) => void,
  deps?: { http?: HttpClient; signal?: AbortSignal; demCache?: DemCache },   // ★ injectable for tests/Node
): Promise<ScreenOutput>;

interface ScreenOutput {                    // ★
  result: ScreenResult;                     // JSON-safe, versioned, what Phase 1 stores
  session: ScreenSession;                   // typed arrays + raw features; in-memory only, never persisted
}

type Step = 'dem'|'terrain'|'soils'|'sun'|'sky'|'flood'|'padus'|'near'|'drive'|'rank'|'driveway';  // ★ driveway (§9.1)
interface ProgressEvent {
  step: Step; status: 'run'|'done'|'fail'|'skip'; message?: string;
  link?: string;                            // ★ "test the query" (proto L1121)
  partial?: ScreenResult;                   // ★ snapshot after the step, for progressive rendering
}

export function evaluateAt(out: ScreenOutput, ll: LatLon, label: string, deps?): Promise<ScreenResult>;  // proto setFocus
export function setHouse(out: ScreenOutput, ll: LatLon | null, deps?): Promise<ScreenResult>;           // proto setHouse→assessHouse
```

- `ScreenResult` is a Zod schema in `lib/screen/types.ts` with `schemaVersion` (1 until step 14a added `params`, now 2). It has the REQUIREMENTS fields plus the C6 additions. `evaluateAt` and `setHouse` return a **new** result object and never mutate. This matches the immutability rule Phase 1 will enforce in the DB.
- `ScreenSession` holds: `dFine`, `dWide` (z as `Float32Array`), `slope`, `aspect`, `inside`, `surfaces {house, garden, parts}`, `labels {house, shelf, garden}`, `bestId`, `horizon` (with ridge row/col for the fans), `roads`, `sfha` features, and lazily built `soilMask` / `flowAcc`. The worker keeps the authoritative session. A read-only **copy** of what rendering needs goes to the main thread with `done`.
- Flag and "why" strings are product copy. They stay in `lib/screen` verbatim, so a Node run (Phase 5 digests) produces the same text.

### 2b. Rules enforced by tooling, not just convention

- `tsconfig.pure.json` typechecks `lib/screen/**`, `lib/geo/**`, `lib/http.ts` and `lib/format.ts` with `lib: ["ES2023", "WebWorker"]` and **no `DOM` lib**. Any use of `window`, `document`, `HTMLCanvasElement` or `Image` fails CI. The WebWorker lib still provides `fetch`, `DecompressionStream` and `AbortController`.
- ESLint `no-restricted-imports` for those paths blocks `react`, `maplibre-gl`, `three`, `@react-three/*` and `leaflet`.
- Every pipeline test runs in Vitest's **node** environment, which proves Node compatibility.

### 2c. `lib/http.ts`

`createHttpClient({ fetchImpl, env: 'browser'|'node', userAgent?, hostPolicies })` exposes `get`/`post` with per-call `timeoutMs`, an `AbortSignal`, and `as: 'json'|'text'|'arrayBuffer'`.

- **Per-host queue:** `{ maxConcurrent, minIntervalMs }`. Defaults: 4 concurrent / 0 ms for the federal and state ArcGIS services. 1 concurrent / 1000 ms for the volunteer services (OSRM demo, Photon, Overpass mirrors). See §9.6 for the OSRM slowdown this causes.
- **429/503 backoff:** honours `Retry-After`, otherwise exponential (2 s, 5 s), at most 2 retries. Connector-specific retries stay in the connector, mirroring the prototype: DEM 3 tries at 1.5 s × n, then terrarium, and Overpass mirror rotation.
- **Environment caveat:** browsers don't let a page set `User-Agent`. Custom headers would also trigger CORS preflights that some ArcGIS servers reject. So in `env: 'browser'` the client sends **no custom headers** and relies on the browser HTTP cache for conditional requests. In `env: 'node'` it sends `User-Agent: ParcelScreen/<version> (+contact)` and does ETag/Last-Modified conditional requests from an in-memory store.
- **Typed errors:** `CancelledError`, `TimeoutError` and `HttpError(status, host)`. The prototype's string matching on `"cancelled"` becomes `instanceof`.

### 2d. Proxies

The prototype calls every service straight from the browser, and that works, so Phase 0 adds **no API routes** (§9.6). DEM responses can reach about 9 MB, over Vercel's 4.5 MB function response limit, so they must stay direct in any case. Step 13 includes a CORS check from the deployed Vercel origin. If any service fails it, a thin pass-through route is added for that service only. The route takes a polygon, never SQL (this matters for SDA).

**Result (step 13, 2026-10-05, from the Vercel preview origin):** every endpoint passes except the four Overpass mirrors. overpass-api.de answers browser User-Agents with 406 and openstreetmap.fr with 403 ("white-listed usages only"); kumi.systems and private.coffee time out. Hence one route, `GET /api/places/overpass?lat&lon`: it takes a point, never Overpass QL, runs the prototype's three queries on the default mirrors with an identifying User-Agent, and returns `{ elements }` or a 502 with the usual "Overpass unreachable (…)" text. TN parcels pass (any Origin is echoed); the failures seen in step 12 were TN's firewall rejecting the `HeadlessChrome` User-Agent of the test harness, not a CORS policy. The full table is in the step 13 PR.

---

## 3. Files, and where each piece of the prototype goes

**V** = ported verbatim (same arithmetic, same order of operations, types added). **R** = restructured.

### 3a. Pure modules (no DOM; run in the Worker and in Node)

| File | Contents | From | V/R |
|---|---|---|---|
| `lib/geo/utm.ts` | UTM 17N `fwd`/`inv` | L474–494 | V |
| `lib/geo/wkt.ts` | `wktToGeo` (POLYGON / MULTIPOLYGON / GEOMETRYCOLLECTION) | L790–797 | V |
| `lib/geo/split.ts` | `halfPlane`, `biggest`, `splitPieces`, `sideName`, `fitSplit` (bisection, ±2 km, 40 iterations) | L602–633 | V (logic) / R (no map state) |
| `lib/geo/parcels.ts` | `pickParcelAt` (sequential NC→VA→TN with a per-service report), `parcelsInBounds` (parallel, 600 cap), `parcelFacts` (owner/pid/address/county key matching), `squareAround(ll, acres)` | L549–558, L657–705 | V (queries) / R |
| `lib/http.ts` | §2c; replaces `xfetch` | L711–717 | R |
| `lib/format.ts` | `fmt`, `compass` | L1445–1446 | V |
| `lib/screen/config.ts` | `DEFAULT_USER_CONFIG` (same values as `DEFAULTS`, plus `timeZone: 'America/New_York'` for the 3D night sky; `aspectFrom`/`aspectTo` kept in the schema but hidden from Settings), `DEFAULT_ENDPOINTS` (`_v: 10`), `migrateEndpoints` (the `_v` rule), and **`SCREEN_CONSTANTS`**: every hard-coded curve, weight, cost table, tier, grade cut-off, sky constant, radius, top-N limit and search radius in the pipeline, named and frozen | L407–467 + inline constants | R (values V) |
| `lib/screen/types.ts` | Zod: `UserConfig`, `Endpoints`, `ScreenInput`, `ScreenResult` + sub-schemas; TS: `Dem`, `Step`, `ProgressEvent`. `ScreenSession` is added with the orchestrator in step 10, once its contents are known. | — | R |
| `lib/screen/util.ts` | `lerp`, `clamp`, `quantile`, `M2FT`, `M2_PER_ACRE` | L469, L912, L1025 | V |
| `lib/screen/arcgis.ts` | `arcQuery` (POST, geojson, error text extraction) | L855–860 | V |
| `lib/screen/dem.ts` | `fetchDEM` (3DEP `exportImage`, 3 tries, 2.4 M-cell cap), `fetchTerrarium` (**PNG decoded with `fast-png`, not canvas**), DEM helpers `at/rcToUTM/utmToRC/rcToLL/llToRC/bounds/bilinear`, `DemCache` LRU | L718–770, L1657 | V (math) / R (decode, cache) |
| `lib/screen/terrain.ts` | `slopeAspect`, `insideMask`, `valleyFloor` (1.5 km on the wide DEM, keeping the asymmetric window), `terrainStats`, the slope-p90 flag | L894–910, L1016–1027, L1039 | V |
| `lib/screen/sites.ts` | `aspectScore`, `suitability`, `components`, `summarize`, `findSites` (relaxation to `max(40, houseMin−15)`), the "no house site / compact / relaxed" flags | L913–958, L1028–1038 | V |
| `lib/screen/soils.ts` | SDA component query and map-unit polygon query (WKT built only from numeric coordinates), `soilAt`, `bottomland`, `soilRead`, the bench re-pick by veto, garden soil adjustment (×0.4/0.8/1.1), soil flags (acre-weighted), `SOIL_COLORS` assignment | L772–811, L1041–1074, L1196–1201, L1403–1444 | V |
| `lib/screen/astro.ts` | `sunPos`, `dayLimits`, `lstDeg`, `eqToHor` (shared with the 3D view) | L1662, L1755, L1771–1772 | V |
| `lib/screen/sun.ts` | `horizonProfile` (5°, 6 km, +2 m eye), `sunHours` (¼° hour-angle steps = 1 min), `computeSun` (point, Dec/Jun, worst southern ridge, noon clearance), sun flags, evaluation-point choice (house > best non-vetoed site > S1 > excluded > centroid) | L959–985, L1075–1085, L1243–1255 | V |
| `lib/screen/sky.ts` | atlas tile fetch with year fallback (`y, y−1, 2022`), gunzip via `DecompressionStream`, differential decode, `lpRatioAt`, `lpZone`, `lpMag`, `computeSky` (24 azimuths × 6 distances, southern samples, core altitude, ridge clearance, score, notes), sky flags | L812–840, L1086–1091, L1256–1271 | V |
| `lib/screen/flood.ts` | NFHL query, SFHA acres by intersection, `inSfha(ll)`, flag | L1092–1098 | V |
| `lib/screen/padus.ts` | PAD-US with the URL-list fallback, 1600 m distance, adjoins (20 m buffer) vs. distance, flags | L1099–1110 | V |
| `lib/screen/places.ts` | Photon (×3 in parallel), Overpass fallback with per-run mirror rotation and a 429 wait, the hospital/grocer/trailhead classification regexes, the top-N cuts | L861–882, L1111–1128 | V |
| `lib/screen/roads.ts` | TIGER layers 8/6/2 (**parallel**), `nearestRoad`, straight-line grade to the bench, road flag and note | L841–854, L1130–1136 | V (math) / R (parallel) |
| `lib/screen/drive.ts` | OSRM `drive`, nearest hospital/grocery (top 3), anchors | L883–889, L1138–1144 | V |
| `lib/screen/score.ts` | `scoreSite` (quality vs. cost), `assessHouse`, `grade`, `costTier`, the rank step (top 5 non-vetoed benches + up to 3 compact shelves, sort, shelf distance and drop), the verdict and the house fatal→warn downgrade | L1147–1171, L1179–1181, L1187, L1278–1321 | V |
| `lib/screen/driveway.ts` | `MinHeap`, `flowAccum`, `soilMask`, `entranceCandidates`, `routeDriveway`, `trackCost`, `buildDriveway`, the site #1 rewrite | L1322–1395, L1172–1178 | V |
| `lib/screen/summary.ts` | `summaryText`, `defaultName` | L1570–1580 | V |
| `lib/screen/index.ts` | `screen()` orchestrator: step runner (run/done/fail/skip, cancellation, `failed[]`, partial snapshots), `evaluateAt`, `setHouse` | L990–1005, L1272–1277, L635–643 | R |
| `lib/screen/worker.ts` | message protocol (§3b); owns the session, `AbortController` and DEM cache | — | R |
| `lib/render/overlays.ts` | `heat`, the house/garden/slope RGBA builders → `Uint8ClampedArray`, and the four UTM corner coordinates for the image source | L1203–1217 | V (colors) / R |

### 3b. Worker protocol (`lib/screen/worker-protocol.ts`, discriminated unions)

- Main → worker: `run {id, input}`, `cancel {id}`, `evaluateAt {id, ll, label}`, `setHouse {id, ll|null}`.
- Worker → main: `progress {id, event}`, `done {id, result, view}`, `updated {id, result}`, `error {id, message}`.
- `view` is a structured-clone copy of the session subset that rendering needs: both DEMs, `inside`, `slope`, surfaces, labels, `bestId` and the horizon with ridge cells.
- No Comlink. The protocol is about 60 lines of typed `postMessage`.

### 3c. Application and UI

The prototype's HTML string builders become React components that read `ScreenResult`. The copy, the order and the caveat text are kept verbatim.

| Path | Contents | From |
|---|---|---|
| `app/layout.tsx`, `app/page.tsx` (→ `/explore`), `app/explore/page.tsx` | Barlow / Barlow Condensed via `next/font`; design tokens (`paper`, `ink`, `rule`, `bench`, `steep`, `water`, `warn`) in the Tailwind theme | L9–196 |
| `components/Explore/ExploreShell.tsx`, `exploreReducer.ts` | grid layout (440 px panel), app state: parcel, house, mode, split, run, result, focus | L26–33 |
| `components/Explore/BottomSheet.tsx` | ≤860 px sheet with snap points 92 px / 46% / 88%, Map/Panel toggle, mobile layers menu | L129–148, L1622–1642 |
| `components/Panel/FindParcel.tsx`, `ParcelInfo.tsx`, `SplitPanel.tsx`, `RunPanel.tsx` | coordinates Go, mode buttons, the "no parcel here" report + square fallback, parcel facts, split acres / fit / use-piece, step list with Cancel and 3D | L208–233, L568–705 |
| `components/Map/MapView.tsx` | MapLibre (client-only via `next/dynamic`), persisted view, double-click zoom off in draw mode | L500–531 |
| `components/Map/basemaps.ts` | state ortho as **three raster sources with `bounds` + `maxzoom`** (USGS, then NC 6 in on top, then VA 1 ft via `{bbox-epsg-3857}`), plus USGS imagery, Esri imagery, USGS topo and Esri streets | L502–524 |
| `components/Map/MapTools.tsx` | basemap select, My location, Dim, Parcel lines, Light pollution, Overlay cycle (house → garden → slope → off) | L250–265 |
| `components/Map/layers/*.ts` | `scrim`, `lightPollution` (1024 px tiles), `parcelLines` (z≥15, 350 ms debounce, newest request wins), `parcel`, `drawDraft`, `split`, `terrainOverlay` (image source), `horizonFan`, `soilUnits`, `trailheads`, `driveway` | L533–560, L583–634, L1196–1237, L1396–1402 |
| `components/Map/markers.tsx` | DOM markers: site pins (#n, top), shelves S#, gardens G#, excluded ✕, entrances E#, house bulls-eye (draggable); click → `evaluateAt` | L108–124, L1167–1170 |
| `components/Results/*` | `Section` (collapsible; open state persisted under the prototype's slug keys and defaults), `Verdict`, `Terrain`, `DecemberSun` + `HorizonChart` (SVG), `DarkSkies`, `ExistingHouse`, `WhereToBuild` + `CompareTable`, `Driveway` + `ProfileChart`, `WhereToGarden`, `Soils`, `Floodplain`, `PublicLand`, `GettingThere`, `StillUnknown`, `SaveParcel` (name, notes, Copy summary) | L1447–1569 |
| `components/Help/HelpDialog.tsx` | "How to read this", copy verbatim (C4 fixed), anchor links from each section's "?" | L286–339, L1611–1616 |
| `components/Settings/SettingsDialog.tsx` | thresholds (without the unused `aspectFrom`/`aspectTo`), time zone, driveway unit costs, anchors (one per line, same text format), endpoints JSON, Reset / Save | L340–386, L1617–1621 |
| `components/Saved/SavedParcels.tsx` | list / open / delete / export / import, same JSON shape | L1585–1606 |
| `components/Walkthrough3D/*` | see §3d | L1646–1893 |
| `lib/client/useScreen.ts` | worker lifecycle, run / cancel / evaluateAt / setHouse, progress state | — |
| `lib/client/prefs.ts` | typed `localStorage` with try/catch: `ps.cfg`, `ps.base`, `ps.view`, `ps.dim`, `ps.lines`, `ps.omode`, `ps.open` (and `ps.saved` if §9.3); `ps.sheet` was dropped after 14d (the sheet opens at its peek) | scattered |
| `lib/client/userConfig.ts` | load/save `UserConfig` through Zod with defaults; endpoint `_v` migration. The prototype's one-time `demResM 10→3` migration is dropped, since a new origin has no old storage. | L458–467 |

### 3d. 3D walkthrough (react-three-fiber)

**Superseded (owner, 2026-10-07, §9.12):** step 17 is now the ground viewer in `phase-0-17-ground.md`, which maps each part below to the 3D map, the viewer, or a follow-up. The table is kept as the inventory of the prototype's 3D.

| File | Contents | From |
|---|---|---|
| `Walkthrough.tsx` | modal card, title, count, Close, prev/next, dots, caption, keyboard (←/→/Esc), drag (orbit vs. look), zoom ±, tilt slider, compass rose | L1866–1892, L270–284 |
| `slides.ts` | the six scenes (The land · Where you could build · December sun · From the house site · Night sky · Under the surface): `vis` flags, `enter`, `tick`, caption functions verbatim | L1850–1864 |
| `geometry.ts` | `local`/`toLocal` (zRef = mean inside elevation), `gridMesh`, ghost meshes (fine outside the polygon, wide outside the fine bbox) | L1665–1675, L1718–1728 |
| `Walls.tsx` | soil-depth walls, 10× depth, topsoil / subsoil / water-table band / bedrock colors | L1676–1700 |
| `textures.ts` | aerial texture from the state ortho (zoom-up rules, 4096 px cap), overlay textures from `lib/render/overlays.ts` | L1701–1713, L1747–1754 |
| `Pins.tsx` | posts + **`<Html>` labels** | L1715–1716, L1733–1737 |
| `SunAndSky.tsx` | directional sun (4096 shadow map, ±4500 m frustum), Dec 21 arc, sun disc, **`<Html>` hour labels** 7 am–5 pm with ridge→sun ticks (depthTest off when blocked), day-sky dome | L1758–1770, L1774–1779, L1811–1818 |
| `NightSky.tsx` | stars (count and brightness from the atlas ratio), zenith haze + horizon light domes **blended by maximum**, galactic band placed from the core and the galactic north pole for the chosen month/hour (taken as civil time in `config.timeZone`, B5), Milky Way fade `((mag−19.6)/2.2)^1.6`, core label | L1780–1810 |
| `cameraRigs.ts` | `turntable` (manual drag pauses auto-orbit 4 s), `eyeLook`, `subject`, `eyePoint` | L1821–1832 |
| `TimeBar.tsx` | sunrise→sunset over 24 s loop, scrub to override, play/pause, hour tick labels, solar clock | L1838–1846 |

The prototype's `Math.random()` star field stays random. It is cosmetic, not tested.

---

## 4. Dependencies

The stack is fixed by PLAN. Additions get a one-line justification each.

| Package | Why |
|---|---|
| `next`, `react`, `react-dom`, `typescript`, `tailwindcss` | Fixed stack. Pinned at scaffold: Next 16.3.8, React 19.3.0, Tailwind 4.3.3. TypeScript is **6.0.3**, not 7.x (latest): typescript-eslint, which eslint-config-next uses, supports only `<6.1`. |
| `maplibre-gl` | Fixed stack (map). |
| `three`, `@react-three/fiber` | Fixed stack (3D). |
| `@react-three/drei` | Its `<Html>` component is the standard way to put DOM labels in an r3f scene, which CLAUDE.md asks for. |
| `@turf/turf` **pinned `7.1.0` exact** | Fixed stack. The exact pin matches the prototype's CDN build, so `area`/`buffer`/`intersect` give bit-identical numbers. |
| `geotiff` **pinned `2.1.3` exact** | Fixed stack. Same exact-pin reason. |
| `zod` | Fixed stack (all external JSON, config, results). |
| `fast-png` | Pure-TS PNG decoder, so the terrarium fallback decodes in the Worker *and* Node without a canvas. |
| `@types/geojson` | GeoJSON types for the pipeline contract. |
| dev: `vitest` | Fixed stack. |
| dev: `eslint` + `eslint-config-next`, `eslint-config-prettier`, `prettier` | Standard lint/format. ESLint is **9.x**, not 10: eslint-plugin-react (pulled in by eslint-config-next) breaks on ESLint 10. |
| dev: `@playwright/test` | Records fixtures and golden results by driving the unmodified prototype, and replays them in the e2e test (`routeFromHAR`). |
| dev: `@testing-library/react`, `jsdom` | Render each results section from the golden result in a smoke test. |

Not added: `pako` (`DecompressionStream` is native in Node 18+ and workers), Comlink, any state library (`useReducer` is enough), `@supabase/*` (no accounts until Phase 1).

Node: `.nvmrc` = **22** (LTS). Node 20, which PLAN mentions, reached end of life in April 2026. Vercel is set to 22 to match. pnpm is pinned through the `packageManager` field to **11.28.2**. pnpm 12 does not run through the corepack that ships with current Node.

---

## 5. Fixtures and the golden standard

The acceptance test compares against **the prototype's own output on the same inputs**, so the prototype has to be run. The plan is to capture the inputs and the expected outputs together, in one pass, by driving the unmodified prototype:

1. `scripts/record-fixtures.mts` (Playwright, run locally by me or the owner, never in CI):
   - Copies `legacy/parcelscreen.html` to a gitignored temp dir. It injects one line before `} // main` that exposes `window.__ps = { pickParcel, setParcel, setHouse, runScreen, setFocus, get last(){ return lastResult } }`. The legacy file itself is not touched.
   - Opens it with **empty localStorage** (default config) and HAR recording on (`content: embed`). Basemap and imagery tile hosts are excluded to keep size down.
   - For each reference parcel it calls `pickParcel(point)`, then `runScreen()`, then serializes `__ps.last`. Typed arrays and `_ctx` are dropped; `_horizon`, `_roads` and `_sfha` are kept. For Macks Mountain it also calls `setFocus` on site #2 and captures that result. For Ferney Creek it then makes a **house-marked run**: the bulls-eye goes at a point inside the polygon about 60 m southwest of site #2 (bearing 225°, chosen by the script and written to `input.json`), followed by `setHouse` → `runScreen()`. No real house is needed, because `assessHouse` is deterministic.
   - Reference points (Floyd County, VA): **Ferney Creek 52-47A** `36.88740, -80.45455`; **Macks Mountain 35-3** `36.93492, -80.63139`.
2. Output, committed:
   ```
   test/fixtures/<slug>/input.json         polygon, props, source, point, house?, recordedAt, prototype build stamp
   test/fixtures/<slug>/network.har        every request/response the prototype made
   test/fixtures/<slug>/golden.json        prototype result(s), normalized
   test/fixtures/README.md                 how and when recorded; how to re-record
   ```
   Estimate: 3–8 MB per parcel (two DEM TIFFs, 1–4 atlas tiles, JSON). That goes in plain git unless the total passes 20 MB (§9.9).
3. `test/support/replayFetch.ts` builds a `fetch` from the HAR, matching on method + URL + body. For ArcGIS form posts the parameters are compared order-insensitively. An unmatched request **throws** with the full URL. That makes the tests provably offline and shows any drift in the requests the port makes. `test/setup.ts` also replaces global `fetch` with a function that throws.
4. `test/support/fromPrototype.ts` maps the prototype's `R` onto `ScreenResult` so the comparison is field-by-field. Field renames happen in this one reviewed file. It lands in **step 4**, together with the `ScreenResult` schema it maps onto. Step 2 ships a loosely typed `loadFixture()` instead.

The same HAR drives the browser e2e test via Playwright `routeFromHAR`. One recording therefore covers the Node parity test, the Worker parity test, and the UI.

**Engine rounding (found in step 3).** The prototype was recorded in Chromium 153's V8, and the tests run in Node's V8 (13.6 locally on Node 24, and an older version on CI's Node 22). ECMAScript doesn't require `Math.sin`, `cos`, `tan`, `atan2`, `log` or `exp` to be correctly rounded, and the engines differ in the last bit on about 1 in 5 inputs. The prototype's own UTM `fwd` therefore differs in the last digit on about 1.7% of points, and `turf.buffer` differs too. Bit-identical parity between a Node run and the Chromium recording is impossible in general. Consequences:
- **Replay:** `replayFetch` compares long decimals (6+ fraction digits) in request keys at 12 significant digits. Example: the Macks Mountain 3DEP bbox computed in Node ends `…4088137.5436460427`, while the recorded one ends `…4088137.543646043`.
- **Parity:** computed floats are compared with a relative tolerance (§7a); discrete outputs (verdicts, ranks, counts, grades, flag and "why" text) must match exactly. A last-bit difference could in principle push a cell across a threshold. If a parity test shows that, it gets investigated and explained in the PR, not loosened away.
- **The browser e2e test (step 18)** runs the port in the same Chromium family as the recording, so it is the closest to bit-exact.
- **Amplification (found in step 9).** Some turf algorithms magnify the last-bit differences. `nearestPointOnLine` turned them into ~1.3e-6 relative on Macks Mountain's nearest-road distance: the prototype's own `nearestRoad` on identical inputs gives 69.79016070998650 m in Chromium and 69.79025171847941 m in Node. Where a test widens a tolerance for this, it cites the measurement in a comment. Downstream rounding (site cost index, `Math.round`) is where a flip could appear, and step 10 checks for it.

---

## 6. Steps (one PR each)

Branches are named `phase-0/NN-slug`. Each PR lists its deviations from the prototype and must pass CI before review. PR sizes are estimates. Step 0 is this plan.

| # | PR | Contents | Checks in the PR |
|---|---|---|---|
| 1 | **Scaffold + CI** | Next.js App Router, TS strict, Tailwind, ESLint (+ restricted imports/globals for pure paths), Prettier, Vitest (node + jsdom projects), `tsconfig.pure.json`, `.env.example` (the four variables, unused until Phase 1), `.nvmrc`, GitHub Actions `ci.yml` with jobs `typecheck`, `lint`, `test` (and `e2e` from step 17), placeholder `/explore`. | CI green; Vercel preview deploys; a deliberate `document` in `lib/screen` fails `typecheck:pure` (shown in the PR, then removed). |
| 2 | **Fixtures + golden** | Commits the 2026-10-04 20:36 UTC `legacy/parcelscreen.html` (the build the goldens come from), `scripts/record-fixtures.mts`, `test/fixtures/*` for both parcels plus the Ferney Creek house run, `replayFetch`, `loadFixture`, and a fixtures README recording the date and the prototype build stamp. | Fixtures load; replay throws on an unknown URL (test). |
| 3 | **Geo + http + format** | `lib/geo/{utm,wkt,split,parcels}.ts`, `lib/http.ts`, `lib/format.ts` | UTM round-trip < 1 mm inside zone 17 (< 5 cm at the eastern edge of VA, ~6° off the central meridian), central-meridian control point, the recorded 3DEP bboxes rebuilt to 1 µm; WKT cases (multi, collection, holes); split bisection hits target ±0.01 ac on a synthetic parcel; http: per-host concurrency, minInterval, 429 with `Retry-After`, timeout, cancel. |
| 4 | **Config + types** | `config.ts`, `types.ts`, `util.ts`, `test/support/fromPrototype.ts` | `config.test.ts` inline snapshot of `DEFAULT_USER_CONFIG` + `SCREEN_CONSTANTS`, so any number change shows in a diff; Zod round-trip of the golden result. |
| 5 | **DEM + terrain** | `dem.ts`, `terrain.ts`, `arcgis.ts` | Synthetic planes: a south-facing 10% plane gives slope 5.71°, aspect 180°; an east-facing plane gives 90°. Fixture: DEM grid size/origin and `terrain.*` equal golden. Terrarium decode on one recorded tile. |
| 6 | **Sites** | `sites.ts` | Synthetic labeling (4-connectivity, min cells, exclusion); fixture: `benchDiag`, benches/shelves/gardens (acres, centroid row/col, scores) equal golden. |
| 7 | **Soils, flood, PAD-US** | `soils.ts`, `flood.ts`, `padus.ts` | `bottomland`/`soilRead` table tests over every distinct row in both fixtures; SQL builder emits only numeric coordinates; fixture: soils, soilUnits (acres, colors), vetoes, garden adjustments, flood, protected, related flags equal golden. |
| 8 | **Sun + sky** | `astro.ts`, `sun.ts`, `sky.ts` | Horizon on a synthetic wall; Dec 21 daylight at 36.6°N vs. the prototype formula; atlas decode equals golden ratio at the sampled points; fixture: `sun.*` (direct hours ±0.1 h; floats otherwise to the §7a tolerance, see §5 "Engine rounding") and `sky.*` equal golden. |
| 9 | **Near + drive** | `places.ts`, `roads.ts`, `drive.ts` | Photon→Overpass fallback (forced Photon failure); TIGER layers requested concurrently (asserted from replay timing); fixture: `near`, `road`, `drives` equal golden. |
| 10 | **Score + driveway + orchestrator** | `score.ts`, `driveway.ts`, `summary.ts`, `index.ts` | **Full parity test** (§7) on both parcels; cancellation mid-run gives skipped steps and `cancelled`; `evaluateAt` and `setHouse` match the golden re-evaluations; second run makes zero DEM requests (cache). |
| 11 | **Worker + hook** | `worker.ts`, `worker-protocol.ts`, `lib/client/useScreen.ts` | Protocol unit tests; the worker builds under Next. |
| 12 | **Map shell** | `ExploreShell`, `BottomSheet`, `MapView`, basemaps, tools, scrim, light pollution, parcel lines, prefs | Manual: the basemap/tool items in §7b. |
| 13 | **Map tools + panel top** | Find parcel (Go, tap, square fallback), draw, split, house bulls-eye, parcel info; CORS check of every endpoint from the Vercel preview (§2d) | Manual §7b; the CORS table goes in the PR. |
| 13b | **Combine parcels** (new, owner request 2026-10-05: listings often sell several parcels together) | A "Combine parcels" tool beside Split: tap outlines (or lookups) to add/remove, live total acres, "Use combined". Touching parcels are unioned unchanged; gaps up to `combine.maxGapM` (30 m, a road right-of-way) are bridged by closing the union, with the strip left out of the acres shown and named in the facts; farther apart is refused with the distance. Source `combined`; the engine still screens one polygon. | Unit tests on synthetic gaps; manual on real neighbouring parcels. |
| 13g | **3D terrain, hillshade and contours** (new, owner request 2026-10-07; before 15) | See `phase-0-13g-terrain.md`: AWS Terrarium terrain with 1× / 1.5× / 2× exaggeration, hillshade, contours in feet via `maplibre-contour`, rotate and pitch with a compass reset, tools flatten the camera. UI prefs only; no `lib/screen` changes. | Headless flat and pitched checks of markers, taps and tools; phone frame times; see the plan §8. |
| 14 | **Results panel** | step list, all section components, help dialog, Copy summary, still-unknown checklist, collapsible persistence | jsdom: every section renders from each golden result without error and shows the caveat strings. |
| 15 | **Result overlays on the map** (plan: `phase-0-15-overlays.md`; drapes on 13g's terrain) | terrain image source + overlay cycle, DOM pins with click-to-evaluate, horizon fan with hover text, soil units, trailheads, driveway (B1 fixed) | Manual §7b. |
| 16 | **Settings + saved parcels** | Settings dialog over `UserConfig`; saved parcels | Changing a threshold and re-running changes the result; reset restores defaults; export/import round-trip. |
| 17 | **Ground viewer** (scope changed 2026-10-07, §9.12; plan: `phase-0-17-ground.md`) | Stand at the evaluation point and see the sky: the screen's own skyline (`sun.profile`) with the canopy band, the sun's path for Dec 21 / Mar 20 / Jun 21 with a time bar and each hour blocked or clear, and the night sky (sidereal Milky Way, atlas light domes). Opened by "Stand here" on the map. 17a (the day), 17b (the night). The aerial scenes are covered by the 3D map (13g, 15); the soil walls move to follow-up 31. | Viewer numbers equal the result's (Dec/Jun direct hours, the core's altitude); manual §7b. |
| 18 | **e2e + acceptance** | Playwright e2e on `next build && next start` with `routeFromHAR`: load /explore → select the fixture parcel → Run → the posted result passes the same comparator → each section visible → 3D opens. README. Production deploy. | §7 in full; the acceptance checklist filled in the PR description. |
| 19 | **Follow-up: unify aspect targets** (immediately after Phase 0) | Changes site-quality aspect from 160° to 165°, updates the `config.test.ts` snapshot and the goldens, and the PR explains the change and which numbers moved. | Parity test updated deliberately; the diff shows only aspect-driven changes. |
| 20 | **Follow-up: garden soil adjustments without house sites** (after Phase 0, with 19) | The prototype only applies the soil adjustment and re-sort to garden patches inside its bench-vetting block, so a parcel with no house site gets unadjusted gardens. Gardens should be adjusted regardless (owner, step 10 review). The PR moves the garden step out of that block and says which goldens move (neither recorded parcel lacks a house site, so likely none; a synthetic test covers it). | Synthetic parcel with gardens and no house site gets soil notes and adjusted scores. |
| 21 | **Follow-up: snap a new custom parcel to the county outlines** (owner, 13e-3 review) | With nothing selected, "Draw a custom parcel" snaps each corner to the visible county parcel outlines (their corners first, then their edges), with the same 14 px rule as drawing onto a selected parcel (`lib/geo/snap.ts`). It's for tracing a plat where the GIS boundary is wrong: the new parcel can share the neighbours' true lines. Snapping must use **full-detail geometry**, not the simplified display outlines (13f): fetch the full records of the outlines near the tap (`fullRecord`) and snap to those. | A unit test on the outline rings fed to `snapCorner`; manual: trace along a neighbour's line and the drawn corners land on it. |
| 22 | **Follow-up: retry the FEMA flood query once on a timeout** (owner, after 14e: NFHL timed out in two of the live runs so far) | The flood step (`lib/screen/flood.ts`) uses the http client's default 30 s per attempt and doesn't retry a timeout. On a timeout, retry once with a longer limit (45 s); if that also fails, keep today's behaviour (the flood step fails, the verdict says it's missing that evidence). Both limits go in `config.ts` (`flood.timeoutMs`, `flood.retryTimeoutMs`), with the `config.test.ts` snapshot updated. Other errors (HTTP 4xx/5xx, bad JSON) aren't retried here; 429/503 keep the client's own backoff. | Replay tests: a first attempt that times out and a second that answers gives the golden flood result; two timeouts give the failed step; the retry uses 45 s. |
| 23 | **Follow-up: PAD-US misses Forest Service fee land** (after Phase 0; **highest priority** of 23–28) | From a live Grayson Co. VA screen (Mud Creek Rd, about 36.586, −81.560; owner, 2026-10-07). Record it as a third fixture when starting these. The nearest public land came back as an NC Land and Water Fund agreement 112,947 ft away, while Mount Rogers NRA / Jefferson NF is about 4.5 mi off. Find whether it's the layer (`Fee_Managers_PADUS`), the query extent (`padus.searchM` 1,600 m), a state filter, or the GAP/`Pub_Access` filtering, and fix it. | The Grayson fixture reports Jefferson NF / Mount Rogers NRA at about 4.5 mi; both existing goldens unchanged unless the fix explains why. |
| 24 | **Follow-up: trailheads from USFS and state parks** (after Phase 0) | From a live Grayson Co. VA screen (Mud Creek Rd, about 36.586, −81.560; owner, 2026-10-07). Record it as a third fixture when starting these. "0 trailheads within 12 mi" was reported, but Elk Garden (Appalachian Trail) and Grayson Highlands State Park are within 7 mi. Add the USFS trailhead layer and state park entrances alongside OSM, de-duplicated by distance. | The Grayson fixture lists Elk Garden and Grayson Highlands within 7 mi. |
| 25 | **Follow-up: groceries "none within 28 mi" is wrong** (after Phase 0) | From a live Grayson Co. VA screen (Mud Creek Rd, about 36.586, −81.560; owner, 2026-10-07). Record it as a third fixture when starting these. Lansing and West Jefferson have groceries. Fix the query, and show "no data" instead of "none" when the query returns nothing, since an empty answer isn't proof of absence. | The Grayson fixture finds a grocer in Lansing or West Jefferson; an empty response renders "no data". |
| 26 | **Follow-up: unnamed or private TIGER segments aren't proof of legal access** (with the Phase 2.5 router) | From a live Grayson Co. VA screen (Mud Creek Rd, about 36.586, −81.560; owner, 2026-10-07). Record it as a third fixture when starting these. The driveway entrance here is likely on a neighbour's farm lane. Mark entrances on unnamed or private TIGER segments as **unverified**. The primary route goes to the nearest **named public road**, and a route from an unverified segment is shown second, as "if access is deeded". | Grayson: the primary route starts on a named public road; the farm-lane route is labelled "if access is deeded". |
| 27 | **Follow-up: ranking lets aspect outweigh driveway cost** (review together with 19) | From a live Grayson Co. VA screen (Mud Creek Rd, about 36.586, −81.560; owner, 2026-10-07). Record it as a third fixture when starting these. A 0.24-ac shelf with 1,155 ft of switchbacks ranked above a 1.3-ac bench with a 617 ft driveway. Review the quality/cost weights (70/30) and how driveway length and grade enter the cost, alongside the aspect unification in 19. | A written before/after ranking for the three fixtures, with the reason for any weight change; config snapshot updated. |
| 28 | **Follow-up: GIS acres vs. deed or listing acres** (Phase 1 parcel page) | From a live Grayson Co. VA screen (Mud Creek Rd, about 36.586, −81.560; owner, 2026-10-07). Record it as a third fixture when starting these. The GIS polygon is 29.31 ac against 24.70 ac on the deed or listing. (29.31 ac is only the first of the county record's two parts, see 29; the record's total is 30.15 ac.) Show both on the parcel page, and flag a gap over 10% as "boundary uncertain — get the survey". | Parcel page shows both; the Grayson example shows the flag. |
| 29 | **Follow-up: screen every part of a multi-part parcel** (after Phase 0; owner, 2026-10-07) | A county record that is a MultiPolygon keeps only its first part, as the prototype does (L545, L669; plan B7), with the note "Multi-part parcel: only the first part screened". Grayson Co. VA parcel 6273 (PTM 63-A-62, VGIN OBJECTID 1577504) has **two parts: 29.31 ac and 0.84 ac (30.15 ac total), 12.1 m apart** (a road right-of-way). The 29.31 ac shown is the first part only. Screen all parts as one recipe, using 13b's combine rules (parts within `combine.maxGapM` bridged, the strip left out of the acres). Farther-apart parts, or as a minimum, warn with the unscreened acreage: "Multi-part parcel: 0.84 ac in 1 other part not screened". | Grayson 6273 screens as 30.15 ac with the 12 m strip bridged; a synthetic far-apart MultiPolygon shows the unscreened-acreage warning. |
| 30 | **Follow-up: the fan tooltip shows the canopy term** (after Phase 0; owner, after 15b) | A ray is blocked when skyline + canopy allowance ≥ the sun's altitude (proto L1237: `hp.angle + CFG.canopyDeg >= sunAlt`; canopy 3° by default), but the tooltip, verbatim from the prototype (L1240), shows only the skyline: "120° (ESE): skyline 1.2° up, sun 2.9° — blocked" reads as a contradiction. Show the canopy term, e.g. "skyline 1.2° + 3° canopy, sun 2.9° — blocked" (`lib/render/fan.ts`; the run's own `params.canopyDeg`). | The fan test's expected strings carry the canopy term; a ray blocked only by the canopy reads consistently. |
| 31 | **Follow-up: soil walls in 3D** (Phase 2.5, with the cost estimator; owner, 2026-10-07) | The prototype's scene 6 "Under the surface" (L1689–1720, L1867): the parcel's cut faces showing what NRCS recorded beneath each soil, depths drawn 10× — topsoil, subsoil, a blue band for the seasonal water table, grey bedrock. Deferred from step 17, not deleted. In Phase 2.5 it sits beside the build-cost estimator, which uses the same soil depths. | Scene-6 parity with the prototype's walls on both reference parcels (side-by-side screenshots). |
| 32 | **Follow-up: time-of-day shading on the 3D map** (after Phase 0, optional) | The prototype's scene 3 showed the terrain's shadows moving through December 21. On the 13g map, light the hillshade from the sun's position at a chosen date and hour (MapLibre's `hillshade-illumination-direction` and altitude), with the ground viewer's time bar or a map control. | Shadows fall away from the sun at three hours; flat when off. |
| 33 | **Follow-up: the moon in the ground viewer's night sky** (after Phase 0; owner, 2026-10-07) | The night view (step 17b), like the prototype's scene 5, has no moon. Add its **phase**, its **rise and set** times, and its **position** for the chosen date and hour (the same civil time in `UserConfig.timeZone`), drawn at its altitude and azimuth, and its light: a bright moon washes out the Milky Way and lifts the sky's brightness, so the view and its caption should say so. | The moon's position, phase and rise/set times against a published ephemeris at a few dates; the Milky Way fades under a full moon. |

---

## 7. Acceptance checks

### 7a. Automated (CI)

1. `typecheck`: `tsc --noEmit` for the app **and** `tsc -p tsconfig.pure.json` (no DOM lib) for the pure paths.
2. `lint`: ESLint with the restricted imports and globals.
3. `test` (Vitest, node), fully offline (replay fetch, global fetch throws). For **Ferney Creek 52-47A** and **Macks Mountain 35-3**, `screen()` compared with `golden.json`:
   - `verdict` equal; `flags` equal in order, level and text; `failed` equal.
   - Site rankings: same count and order. Per site: `ll` within 1e-7°, `compact`, `acres`, `quality`, `qGrade`, `costIdx`, `costTier`, the `c.*` and `q.*` points, `score`, `grade`, and `why[]`. `excluded`, `shelves` and `gardens` equal.
   - Sun: `decDirectH`, `junDirectH` and daylight within **±0.1 h** (the PLAN tolerance; the test also reports the actual difference). `noonAlt`, `noonClearance`, `worstAz`, `worstAngle` and `profile` within 1e-6.
   - Sky: `mag` within 1e-4; `ratio`, `zone`, `zoneWord`, `year`, `score`, `coreAlt`, `ridgeS`, `coreClear`, `dome`, `domes` and `notes` equal.
   - `terrain`, `soils`, `soilUnits`, `flood`, `protected`, `near`, `road`, `drives`, `house` (Ferney Creek house run) and `driveway` equal. Computed floats are compared with a 1e-9 relative tolerance unless stated above (never bit-exact: see §5 "Engine rounding"); strings, integers, enums and orderings exactly.
   - Re-evaluation (`evaluateAt` at site #2, and the Ferney Creek house run) match the golden re-evaluation.
   - `config.test.ts` snapshot unchanged, or changed deliberately in a PR that says so.
4. `e2e` (Playwright, Chromium, HAR replay): the same comparator on the result the **Web Worker** posts in a production build. This proves the in-browser path, not just Node.

### 7b. Manual (checked in step 18's PR, with screenshots, on the Vercel production URL against live services)

- Both reference parcels: the verdict, site pins (positions and numbers), Dec sun hours and sky mag agree with the prototype run live the same day, viewed side by side.
- Map: all five basemaps; the state ortho switches VA↔NC at 36.54° and no longer smears beyond native zoom; dim; light-pollution overlay; parcel lines appear at z≥15 and disappear below; tap-select; the no-parcel report + square fallback; draw (close on the first corner, Enter, Esc, double-click); split (drag the ends, live acres, fit to acres, use either piece, "verify against plat" note); house bulls-eye drag reassesses; tapping a pin, ✕ or shelf re-evaluates the sun, sky and driveway; overlay cycle; horizon fan red/white with hover text; soil units with hover; trailheads; driveway visible (B1).
- Terrain (13g): 3D terrain toggles on and off; exaggeration 1× / 1.5× / 2×; hillshade under the parcel lines; contours in feet at the right zooms with labels; the "≈10 m preview" label; rotate and pitch by mouse and touch; the compass resets to north and flat; the tools flatten and restore; the bulls-eye and site pins sit on the ground when pitched, and a pin taps to its own site; toggling terrain never marks a screen out of date; the phone frame rate is acceptable with everything on.
- Run: step dots animate; partial sections appear as steps finish; Cancel leaves skipped steps and "(run cancelled)"; a forced service failure shows "Incomplete: … didn't run"; Run again makes **no** new `exportImage` requests (Network panel).
- Panel: every section's text matches the prototype; the help "?" links jump to the right anchor; Copy summary text equals the prototype's; open/closed state persists across reloads.
- Caveats present: bare-earth DEM, soil map-unit scale, zenith-only atlas, OSM undercounts trailheads, OSRM not for flights, DEM source note when the terrarium fallback is used.
- Ground viewer (step 17, replacing the 3D walkthrough): Stand here from the evaluation ring, after a pin tap and from the bulls-eye, and See it from here in December sun; it opens from a kept result after a reload; the skyline matches the December sun horizon chart, with the canopy band; Dec 21 and Jun 21 direct-sun hours equal the report's, any other date labelled as computed from the screen's skyline; a date picker for any date, day and night; hour marks red where blocked; the time bar plays and scrubs; at night the Milky Way moves with the hour, fades under a bright sky, and the light domes sit at the atlas's bright azimuths; phone full screen and desktop modal.
- Mobile at 375 × 812: bottom-sheet snaps, Map/Panel toggle, layers menu, 3D full-screen.
- Settings: edits persist and change the next run; Reset; endpoints JSON with `_v` migration.

---

## 8. Out of scope for Phase 0

Supabase (auth, tables, Storage, atlas tile caching), API proxies (unless the CORS check forces one), the `/library`, `/watch`, `/settings` and `/share` routes (Settings stays a dialog, as in the prototype), PDF export, and bringing the driveway router to the REQUIREMENTS §2a spec (Phase 2.5 either way).

---

## 9. Decisions (owner, 2026-10-04)

1. **Driveway router:** port it in Phase 0, verbatim. The 2026-10-04 prototype fixes B1 (drawing) and B8 (re-sort after routing), and the golden reflects both. Phase 2.5 remains "bring it to REQUIREMENTS §2a and drape it in 3D".
2. **Reference parcels** (Floyd County, VA): Ferney Creek 52-47A at `36.88740, -80.45455`; Macks Mountain 35-3 at `36.93492, -80.63139`. Neither has a house that can be placed precisely. The house-marked golden uses Ferney Creek with the bulls-eye about 60 m southwest of site #2, inside the polygon, and its coordinates go in `input.json`. Claude runs the recorder once against the live services. The fixtures README records the date and the prototype build stamp.
3. **Saved parcels:** yes, in localStorage, with the prototype's exact JSON export shape.
4. **Aspect:** keep 165° (cells) and 160° (site quality) verbatim for Phase 0 parity, and hide `aspectFrom`/`aspectTo` from Settings. A follow-up PR right after Phase 0 (§6 step 19) unifies both to 165°, updates `config.test.ts` and the goldens, and explains the change.
5. **3D fixes:** draw the 3D fan with the 2D rule and use the configured canopy for the fan and the hour ticks. The night-sky month/hour are civil time in `UserConfig.timeZone`, which defaults to `America/New_York` rather than being hard-coded.
6. **Network:** no proxies in Phase 0. Volunteer services (OSRM demo, Photon, Overpass) are throttled to 1 request/second. The slower drive step is accepted.
7. **Contract additions:** approved (`ScreenOutput {result, session}`, `deps`, the `driveway` step, `ProgressEvent.link`/`.partial`, the extra `ScreenResult` fields). REQUIREMENTS §2 is updated in the step-4 PR.
8. **MultiPolygon parcels:** keep "first polygon only", with a visible note.
9. **Fixtures:** plain git.
10. **C4:** already fixed in the 2026-10-04 prototype; the port matches it.
11. **Places outage (step 9 review, 2026-10-05):** when Photon and every Overpass mirror fail, keep the roads, the road grade and its flag, and fail only the 'near' step. The prototype lost all three, and with them the site driveway term and the driveway router's entrances. Done in PR 09b; step 10 asserts the driveway still routes during an outage.
12. **Step 17 scope (owner, 2026-10-07):** with 13g and step 15, the map covers the aerial side of the prototype's 3D walkthrough (tilted terrain, draped surfaces, pins, horizon fan, soils, driveway). Step 17 becomes a ground-level viewer only: stand at the evaluation point and see the sky — the screen's own skyline and canopy allowance, the sun's path for a chosen date with a time bar and each hour's blocked/clear state, and the night sky with the sidereal Milky Way and the atlas light domes. Any number it shows comes from the ScreenResult or the session, not recomputed differently. Soil walls (the 10× cutaway) are deferred to Phase 2.5 (follow-up 31), not deleted. Plan: `phase-0-17-ground.md`. Approved as written (2026-10-07): a 2D canvas, both entry points (Stand here, See it from here), the stored 30 m horizon profile drawn with straight segments between its 5° points and no added detail; dates by the presets Dec 21 / Mar 20 / Jun 21 / today and a date picker for any date, day and night, with any non-stored date's hours from the engine's sunHours on the stored profile; react-three-fiber leaves the stack when 17 lands; the moon (phase, rise and set, position) is follow-up 33.

**Process:** one PR per §6 step, with a pause for review at each. The next step's branch isn't started until the previous PR is merged.
