# Reference-parcel fixtures

These are the Phase 0 parity baseline (docs/plans/phase-0.md §5). Each directory holds the prototype's
own network traffic and results for one reference parcel. The port is tested against them **offline**.

| Directory | Parcel | Reference point |
|---|---|---|
| `ferney-creek-52-47A/` | Ferney Creek, Floyd County VA, parcel 52-47A (43.88 ac) | `36.88740, -80.45455` |
| `macks-mountain-35-3/` | Macks Mountain, Floyd County VA, parcel 35-3 (292.01 ac) | `36.93492, -80.63139` |
| `grayson-mud-creek-6273/` | Mud Creek, Grayson County VA, parcel 6273, PTM 63-A-62 (29.31 ac screened of 30.15; Batch A) | `36.585425, -81.561989` |

Grayson Mud Creek was added in Batch A (A1, 2026-10-08; `docs/plans/batch-a.md` §2). It is the live screen
behind follow-ups 23–29, recorded the same way from the same unmodified prototype. Its county record has two
parts (29.31 ac and 0.84 ac, 12.1 m apart); the prototype screens the first only (B7), and so does the recording.

## Provenance

- **Prototype:** `legacy/parcelscreen.html`, build **2026-10-04 20:36 UTC**, unmodified. The recorder serves a
  copy with one injected line before `} // main` that exposes the closure functions on `window.__ps`.
- **Config:** prototype `DEFAULTS` (empty localStorage). Parcel lines were turned off so pan/zoom queries
  stayed out of the HAR, and basemap/imagery tiles were blocked. Neither affects the screen.
- **Browser:** Playwright 1.63.0, Chromium 153 (headless), on 2026-10-04.

| Fixture | Recording started | Screen run | Finished |
|---|---|---|---|
| Ferney Creek | 2026-10-04T21:21:26.496Z | 2026-10-04T21:21:27.602Z | 2026-10-04T21:21:38.950Z |
| Macks Mountain | 2026-10-04T21:21:39.247Z | 2026-10-04T21:21:40.231Z | 2026-10-04T21:21:47.492Z |
| Grayson Mud Creek | 2026-10-08T16:28:57.399Z | 2026-10-08T16:28:58.557Z | 2026-10-08T16:29:12.908Z |

Grayson was recorded with Playwright 1.63.0's headless Chromium on 2026-10-08, first try, every step done and
all 22 data requests in the HAR.

### Recording history

1. **2026-10-04T21:10:39Z, Ferney Creek, discarded.** It got a transient error from FEMA NFHL on an
   otherwise identical request ("The provided output spatial reference is not supported with geoJSON
   format", returned with HTTP 200), which failed the floodplain step. The same request succeeded six
   seconds later.
2. **2026-10-04T21:11Z (Macks Mountain) and 21:12Z (Ferney Creek), merged in #3, superseded.** The goldens
   were complete, but the HARs had **no NRCS SDA traffic**. The recorder's URL filter matched
   `SDMDataAccess` case-sensitively, while Playwright records the host lowercased. Soils could not have
   been replayed offline.
3. **2026-10-04T21:21Z, both parcels, current** (table above). The filter is now case-insensitive, the
   recorder fails if any data request the page made is missing from the HAR, and `fixtures.test.ts`
   requires every service's traffic once per screen run. The goldens are field-for-field identical to
   recording 2 apart from the run timestamp (`when`), so live data did not drift between them.

## Files

| File | Contents |
|---|---|
| `input.json` | Parcel polygon and attributes as the county service returned them, reference point, the synthetic house (Ferney Creek) or re-evaluation point (Macks Mountain), prototype build, recording timestamps, and the rendered step list after each run. |
| `network.har` | Every request and response to the data services (3DEP, NRCS SDA, FEMA, PAD-US, TIGERweb, Photon, OSRM, Lorenz atlas, NC/VA parcel services), bodies embedded. Committed as binary (`.gitattributes`). |
| `golden.json` | The prototype's result object(s), keyed by scenario. |

### Scenarios in `golden.json`

| Key | Fixture | What it is | Port API it checks |
|---|---|---|---|
| `run` | both | Plain screen at the parcel, no house | `screen()` |
| `evaluateSite2` | Macks Mountain, Grayson | Same result after tapping site #2 (prototype `setFocus`) | `evaluateAt()` |
| `setHouse` | Ferney Creek | Same result after marking a house (prototype `setHouse` → `assessHouse` + `setFocus`) | `setHouse()` |
| `houseRun` | Ferney Creek | Full re-run with the house marked | `screen({ house })` |

The synthetic house is the point **60 m from Ferney Creek site #2 at a bearing of 225°** (`36.888925, -80.452895`),
inside the polygon. No real house is needed, because `assessHouse` is deterministic.

### Paths these goldens exercise

- Ferney Creek `run`: two routed driveways (gentlest and shortest legal), with the site #1 cost rewrite and the re-sort.
- Ferney Creek `setHouse` / `houseRun`: the house assessment; the "no route reaches the existing house at 10%" note; dark-sky core clearance under 8° (the −10 branch); the sky score at the house changing every site's quality.
- Macks Mountain `run`: eight ranked sites (five benches and three compact shelves), five flags, verdict `marginal`, and no legal driveway route to site #1.
- Macks Mountain `evaluateSite2`: a single legal route to site #2.
- Both: every step `done`, places from Photon (the Overpass fallback was not needed), FEMA zone X only.
- Grayson Mud Creek `run`: a 0.24 ac compact shelf ranked first over a 1.30 ac bench (follow-up 27); public land
  reported as an NC Land and Water Fund agreement 112,947 ft away (23); no trailheads (24) and no grocers (25);
  no legal driveway route to site #1, so the least-steep route; the first of two parts only (29).

### Known limitation, not a permanent parity target

The Ferney Creek **"no route reaches the existing house at 10% or less"** outcome (`setHouse`, `houseRun`) is
a known limitation of the prototype's driveway router. It will be addressed in **Phase 2.5**, when the router
is brought to REQUIREMENTS §2a. Phase 0 reproduces it exactly, because Phase 0 is a faithful port. When
Phase 2.5 changes the router, these goldens are expected to change: update them in that PR and say so. Don't
add special cases to keep this outcome.

### Serialization notes

- `_ctx` (DEM rasters, slope/aspect/surfaces as typed arrays) is dropped. DEM rasters are never persisted;
  the port recomputes them from the HAR. `_horizon`, `_roads` and `_sfha` are kept.
- `NaN` and `Infinity` became `null` (plain `JSON.stringify`). Comparators treat `null` as non-finite.
- `driveway.entrances.roadsNearestFt` is a property on an array, which JSON drops. It is copied to
  `driveway._entrancesRoadsNearestFt`.
- `parcel`, `when` and `soilUnits[].geos` are kept as the prototype holds them. `when` is ignored when comparing.

## `network-port.har`: the requests only the port makes (Batch A)

From A2a on, the port asks for things the prototype never did: the 16 km PAD-US query (follow-up 23), and for
Grayson Mud Creek every request built from its two-part boundary (follow-up 29). `pnpm record:port` runs every
scenario against the recordings and sends each request they can't answer to the live service once (with a browser
User-Agent), keeping it in `network-port.har`. The replay answers from `network.har` first, then
`network-port.har` (`loadFixture(slug).replayHar`, in Node and in the e2e); `network.har` is never edited.

| Fixture | Recorded 2026-10-08 |
|---|---|
| Ferney Creek | 18 requests: FEMA's zones; PAD-US (both queries); Photon's reverse lookups for groceries and trailheads; USFS and the three state-park layers; OSRM to the grocers it finds (chain and non-chain) |
| Macks Mountain | 18 requests: the same |
| Grayson Mud Creek | 32 requests: everything for its two-part boundary (DEMs, soils, FEMA, PAD-US, TIGER, Photon, OSRM), and the A2b sources |

A2b (2026-10-08) added Photon's reverse lookups (groceries and trailheads by tag, follow-ups 24 and 25) and the
official trailhead sources, and dropped the forward searches they replace.
A2c (2026-10-09) reads hospitals from `lib/screen/data/hospitals.json`, not Photon, so the prototype's `q=hospital`
requests in `network.har` go unused; the port HARs gain the OSRM routes to the emergency hospitals it prefers.
A3 (2026-10-09) adds one SDA request: each component's limiting features (septic and dwellings), for the
slope-free ratings.

Re-recorded after the #80 review: FEMA asks for zone names without geometry, then geometry for the SFHA features
only (Grayson's FEMA answer went from 8 MB to 3 KB), and the flood, soils and PAD-US queries send the parcel's own
land. Ferney and Macks now record 2 requests each (FEMA's zones; the 16 km PAD-US query).

The scenarios screen each fixture's parcel as the app does (`fixtureParcel` in `test/support/scenarios.ts`): the
county record at the fixture's point, answered from the HAR, through the recipe. For Ferney and Macks that's the
recorded polygon; for Grayson it's both parts with the strip between them, and the parts as own land.

## `expected.json`: the port's own output (Batch A)

From Batch A on (owner, 2026-10-08; `docs/plans/batch-a.md` §1), `golden.json` is **frozen** as the Phase 0
parity record, and the engine's tests compare against `expected.json` instead: one `ScreenResult` per scenario,
in the port's shape, written by the port. `runAt` is written as a fixed string and never compared.

| Command | What it does |
|---|---|
| `pnpm test` | includes `test/tools/expected.test.ts`: every scenario, run on the replay, equals `expected.json` |
| `pnpm expected` | regenerates every `expected.json` (for a PR that changes numbers) |
| `pnpm diff:prototype` | every difference between `expected.json` and the prototype's goldens, with Phase 0's comparator (`PARITY`, `asPrototype`); writes `test-results/diff-prototype.txt`, ending in a hashed summary line |
| `pnpm before-after` | the base branch's `expected.json` against this checkout's: the headline table and the leaf diff a Batch A PR carries (`BASE=<ref>` for another base); writes `test-results/before-after.md` |

**The CI guard** (`.github/workflows/expected-guard.yml`): a PR that adds or changes an `expected.json` must
have a `Numbers change:` line in its description and the exact summary line of `pnpm diff:prototype` on its
head; otherwise the `expected-guard` check fails. Editing the description re-runs it.

When A1 created the files, `diff:prototype` showed **no difference** for Ferney Creek and Macks Mountain, and one
for Grayson, in both scenarios: `driveway.roadsNearestFt` 18.26 ft against the prototype's 18.43 ft. That is
the Turf version, not the port: the prototype loads Turf 7.1.0 from a CDN, while npm's `@turf/turf` 7.1.0
resolves its parts at 7.4.0, whose `pointToLineDistance` agrees with a brute-force distance (18.262 ft). It's
approved as row 17 of `docs/plans/phase-0-18-acceptance.md` §5 (owner, 2026-10-08).

## Terrarium tile (DEM fallback)

`terrarium/14/4530/6383.png` (103,098 bytes) is the one AWS terrain tile covering Ferney Creek's fine-DEM
bbox at the fallback's zoom 14. The prototype never needed it, because 3DEP answered, so it isn't in the
HAR. It was fetched once, separately, on 2026-10-04T22:05:35Z from
`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/4530/6383.png`, to test the fallback against
real data (`lib/screen/dem.test.ts`).

Measured on 2026-10-04 over the 11,811 fallback cells (7.99 m) that fall inside the 3 m lidar DEM, comparing
the terrarium elevation with the lidar sampled bilinearly at each cell centre:

| |Δz| median | 90th percentile | worst | signed median (terrarium − lidar) |
|---:|---:|---:|---:|
| 1.22 m | 2.86 m | 7.94 m | +0.74 m |

The test asserts a median under 2 m.

## Size

| File | Bytes |
|---|---:|
| `ferney-creek-52-47A/network.har` | 7,029,147 |
| `ferney-creek-52-47A/golden.json` | 557,571 |
| `ferney-creek-52-47A/input.json` | 4,139 |
| `macks-mountain-35-3/network.har` | 6,511,343 |
| `macks-mountain-35-3/golden.json` | 361,412 |
| `macks-mountain-35-3/input.json` | 11,621 |
| **Total** | **14,475,233 (13.8 MiB)** |

## Using them

```ts
import { loadFixture } from "@/test/support/fixtures";
const fx = loadFixture("macks-mountain-35-3");
const fetch = fx.replayFetch(); // offline; throws ReplayMissError on any request the prototype never made
```

`test/setup.ts` makes the real `fetch` throw in every test, so nothing reaches the network by accident.

## Re-recording

Only re-record deliberately: when the prototype build changes, or when a golden is wrong. It hits the live
public services (about 27–46 requests per parcel) and replaces the goldens every parity test compares against.

```bash
corepack pnpm exec playwright install chromium
corepack pnpm record:fixtures              # both parcels
corepack pnpm record:fixtures macks        # one parcel, by slug prefix
```

The script exits non-zero if any prototype step failed. Don't commit a recording with failed steps.
Live data drifts (OSM places, OSRM routes, atlas year), so a re-recording also needs this README's
provenance updated, and a PR that says which goldens moved and why.
