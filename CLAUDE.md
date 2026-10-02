# CLAUDE.md — Parcel Screen

You are porting a working single-file prototype (`legacy/parcelscreen.html`, ~2,000 lines of
vanilla JS + Three.js) into a Next.js application, then extending it. Read this file, `PLAN.md`
and `docs/REQUIREMENTS.md` before doing anything. The prototype is the behavioral specification
for Phase 0: when in doubt about what a feature should do, it does what the prototype does.

## What this app is
A desk-screening tool for rural mountain land. Given a parcel boundary it pulls public data
(USGS 3DEP lidar, NRCS soils, FEMA flood, USGS PAD-US, the Lorenz light-pollution atlas, Census
roads, OSM places, OSRM routing) and answers: is there a good place to live on this land, where,
what will it cost to build there, and how dark is the sky. It then becomes a library of saved
parcels ("contenders") shared with a household, and later a scheduled search over listing sources.

The owner is a developer (C#/Java/Android background, now Next.js + Supabase on another product).
Write code he can read and maintain: explicit types, small modules, comments only where the *why*
isn't obvious.

## How to work in this repo

1. **Plan first.** Each phase starts with `docs/plans/phase-N.md`: the files you will create or
   change, module boundaries, what is ported verbatim vs. restructured, open questions, and the
   acceptance checks you will run. Stop and wait for approval before writing application code.
2. **One PR per plan step.** Keep PRs small enough to review in ten minutes. The PR description
   lists any behavior that differs from the prototype and why.
3. **CI must be green** (typecheck, lint, tests) before you ask for a merge.
4. **Don't change the numbers silently.** Thresholds, weights and unit costs live in
   `lib/screen/config.ts`. If you change one, update the fixture test and say so in the PR.
5. **Ask when the spec is silent;** don't invent product behavior. Ask in the PR or the plan.
6. Prefer boring, well-known libraries. No new dependency without a one-line justification.

## Hard rules

- `lib/screen/**` has **no DOM dependencies**: no `window`, `document`, `canvas`, Leaflet,
  MapLibre or Three. It takes a GeoJSON polygon and a config and returns a result object. It must
  run in a Web Worker and in Node. Rendering (overlays, charts, 3D) is done by components from
  the result.
- Every Supabase table has **row-level security enabled** in the same migration that creates it,
  with policies scoped to the user's household. No table is created without RLS.
- Secrets never reach the client. `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only.
- Screen results are **immutable**: `screens` rows are inserted, never updated. A re-run inserts a
  new row with `version = max+1`.
- External fetches go through `lib/http.ts`: one throttled client with a per-host queue,
  identifying User-Agent, conditional requests, and 429 backoff. Connectors declare a minimum
  cadence and the scheduler cannot run them faster.
- DEM rasters are never persisted. The light-pollution atlas tiles may be cached in Storage.
- Keep the prototype's data-source caveats in the UI (bare-earth DEM, soil map-unit scale,
  zenith-only atlas, OSM undercounting trailheads). They are part of the product's honesty.

## Stack (fixed — see PLAN.md "Decisions already made")
Next.js App Router, TypeScript strict, React, Tailwind, MapLibre GL JS, react-three-fiber,
@turf/turf, geotiff, Supabase (Postgres, Auth, Storage) via `@supabase/ssr`, Zod for all
external JSON, Vitest for tests, pnpm.

## Repository layout (target)
```
app/                      routes: /explore, /library, /library/[id], /watch, /settings, /share/[token]
app/api/                  proxies (soils, places, sky), watch/tick, attachments, export
components/               Map/, Results/ (one component per section), Walkthrough3D/, Library/, Watch/
lib/screen/               the pipeline (pure TS): dem.ts terrain.ts sites.ts sun.ts sky.ts soils.ts
                          flood.ts padus.ts places.ts roads.ts score.ts config.ts types.ts index.ts
lib/screen/worker.ts      Web Worker entry: runs screen() and posts step progress
lib/geo/                  utm.ts parcels.ts (NC/VA/TN services) split.ts wkt.ts
lib/connectors/           types.ts registry.ts gmail.ts hibid.ts firm-page.ts
lib/http.ts               throttled fetch
lib/db/                   Supabase clients (browser, server, service) and typed queries
supabase/migrations/      SQL migrations; apply with the Supabase CLI
test/fixtures/            recorded service responses for two real parcels (offline tests)
docs/plans/               one file per phase, approved before code
legacy/parcelscreen.html  the prototype — read-only reference
```

## Phase 0 specifics (the port)

Port these from the prototype, preserving the math exactly:
- UTM 17N forward/inverse; 3DEP `exportImage` fetch with retry and the terrarium-tile fallback;
  slope/aspect (central differences, aspect = atan2(-dzdx, dzdy) with rows increasing southward).
- Suitability surfaces (house and garden), component labeling, house sites / shelves / compact
  sites / garden patches, the bottomland veto from NRCS flood frequency, drainage and hydric.
- Horizon profile (5°, 6 km), solstice sun path, direct-sun hours, hour ticks.
- Light-pollution atlas tile decoding (5°×5°, 1/120°, gzip, differential), zone table,
  mag/arcsec² conversion, 360° dome sampling, galactic-core altitude/azimuth by date and sidereal
  time, Milky Way visibility fade with sky brightness.
- NRCS SDA queries (component + muaggatt + mapunit farmland class; map-unit polygons clipped to
  the parcel via SQL Server spatial), plain-language soil readings.
- FEMA NFHL, PAD-US (Fee_Managers_PADUS, Pub_Access filter, adjoins vs. distance), Census TIGER
  roads (layers 8/6/2), Photon places with Overpass fallback, OSRM drive times, driveway grade.
- Scoring: site quality vs. build cost, grades, side-by-side table, existing-house assessment.
- Split tool (half-plane intersection, fit-to-acres bisection), draw tool, house bulls-eye.
- The six-scene 3D walkthrough, including depth-correct sun/sky, soil-depth walls (10×), day sky,
  light domes by maximum blend, compass, zoom/tilt, time slider with hour labels.

Restructure, don't port, these:
- The results HTML string builders → React components reading the result type.
- localStorage settings → a typed `UserConfig` with the same defaults.
- The ad-hoc step runner → a `screen()` function emitting typed progress events.
- Canvas overlays → MapLibre image sources generated from result arrays in a small render module.

Acceptance for Phase 0 is in PLAN.md. Build the fixtures first (record the real service responses
for the two reference parcels with a small script), then port module by module with tests
against them, then the UI.

## Things the prototype got wrong that you should fix while porting
- Hour-tick labels and site pins should be DOM/HTML overlays in MapLibre, not canvas sprites.
- The "near" step should run Photon and the TIGER road query in parallel.
- Horizon computation at 6 km uses the 30 m DEM; cache the wide DEM per parcel centroid so
  re-evaluating a different site doesn't refetch it.
- The sky step samples the atlas 24×6 times; memoize tile decoding per session.

## Later phases
Follow PLAN.md. Data model and rule DSL are in docs/REQUIREMENTS.md. Do not start Phase N+1
until Phase N is merged and deployed.
