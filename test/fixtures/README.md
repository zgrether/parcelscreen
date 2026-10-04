# Reference-parcel fixtures

These are the Phase 0 parity baseline (docs/plans/phase-0.md §5). Each directory holds the prototype's
own network traffic and results for one reference parcel. The port is tested against them **offline**.

| Directory | Parcel | Reference point |
|---|---|---|
| `ferney-creek-52-47A/` | Ferney Creek, Floyd County VA, parcel 52-47A (43.88 ac) | `36.88740, -80.45455` |
| `macks-mountain-35-3/` | Macks Mountain, Floyd County VA, parcel 35-3 (292.01 ac) | `36.93492, -80.63139` |

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
| `evaluateSite2` | Macks Mountain | Same result after tapping site #2 (prototype `setFocus`) | `evaluateAt()` |
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

## Terrarium tile (DEM fallback)

`terrarium/14/4530/6383.png` (103,098 bytes) is the one AWS terrain tile covering Ferney Creek's fine-DEM
bbox at the fallback's zoom 14. The prototype never needed it, because 3DEP answered, so it isn't in the
HAR. It was fetched once, separately, on 2026-10-04T22:05:35Z from
`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/4530/6383.png`, to test the fallback against
real data (`lib/screen/dem.test.ts`: the decoded fallback DEM agrees with the lidar DEM to a median 3 m).

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
