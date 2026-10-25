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
   acceptance checks you will run. Stop and wait for approval before writing application code. In
   mission mode (below), each roadmap step starts with `docs/plans/step-<n>-<name>.md` instead, approved once.
2. **One PR per plan step.** Keep PRs small enough to review in ten minutes. The PR description
   lists any behavior that differs from the prototype and why. Fold trivial follow-ups (wording, one-line
   fixes) into the next substantive PR instead of opening their own.
3. **Check locally, then let CI gate** (owner, 2026-10-11). Before pushing: `pnpm typecheck`, `pnpm lint`
   and the unit tests related to the change (`pnpm test:changed`). Run `pnpm expected` once when engine
   output may change (CI checks it's deterministic). Run the full e2e locally only when the PR changes UI
   behaviour the e2e covers. Then push, open the PR with Auto-fix on, report, and pause: don't wait on CI.
   CI (typecheck, lint, the full unit suite, e2e, determinism, expected-guard) is the full gate, and
   Auto-fix handles its failures. The report is ten lines or fewer; the details go in the PR description.
   **Zach merges every PR.** Never merge one yourself or enable auto-merge, whatever the wording: "merge
   when…" or "merge on green" means "ready for Zach to merge". Say it's ready, and pause. In mission mode
   (below), the PRs into a step branch are the one exception: merge each yourself when CI is green on its
   head; the step's single PR into main is still Zach's.
4. **Don't change the numbers silently.** Thresholds, weights and unit costs live in
   `lib/screen/config.ts`. If you change one, update the fixture test and say so in the PR.
5. **Ask when the spec is silent;** don't invent product behavior. Ask in the PR or the plan.
6. Prefer boring, well-known libraries. No new dependency without a one-line justification.
7. **Report text changes are additive.** Any scope that adds or changes report text gets a one-paragraph plan
   first. Golden diffs must be purely additive: new text goes after existing text, never in place of it.

## Mission mode (standing rule; owner, 2026-10-16)

The roadmap in PLAN.md (the fifteen steps of `docs/design/workflow-review.md`) runs as missions, one per
step. Mission mode changes rules 1 and 3 above as written here; everything else in this file still holds.

- **Move from PR to PR without asking** (owner, 2026-10-17). Only the stop conditions in the plan and in this file
  pause the work.
- **One plan per roadmap step** at `docs/plans/step-<n>-<name>.md`. Each plan states the scope, which
  numbers or verdict text may change, the stop conditions, the outline of the test plan, and a UX section
  (below). Zach approves the plan once; no application code before that.
- **A step branch.** Work on `step/<n>-<name>`, branched from main. Open each PR into the step branch and
  merge it yourself when CI is green on its head. Never merge to main. The step ends with one PR from the
  step branch to main, which Zach merges after running the test plan on its preview.
- **The hand-back closes the step** (owner, 2026-10-20). The last action of a step is opening its hand-back PR from
  the step branch to main; the step isn't done until that PR is open (4c's and 8b's weren't, at first).
- **Stop and wait** (push what you have, say why) if:
  - a change would alter expected.json or verdict/flag text beyond what the plan declared;
  - a product decision is needed;
  - the same CI failure survives 3 attempts;
  - the plan turns out wrong.
- **The hand-back**, in the final PR's description:
  - what shipped and the PR list;
  - any numbers change with its `pnpm diff:prototype` summary line;
  - deviations from the plan, and questions you parked;
  - a manual test plan on the preview URL: numbered "do → expect" steps with pass/fail boxes, desktop then
    phone, using fixture parcels by name (Mud Creek, Macks, Ferney, and a Roan Mountain one once it exists),
    about 15–30 minutes;
  - screenshots (below);
  - the fresh-eyes review's findings (below), each with what you fixed, what you didn't, and why.
- **A fresh-eyes review before each hand-back** (owner, 2026-10-18). A subagent that hasn't seen the code or the plan
  gets only the hand-back's screenshots and the question "You've never used this app. What is this page for, and
  what's confusing?" Fix what it finds where the fix is in scope, and list every finding in the hand-back.
- **Clean breaks, no migrations** (owner, 2026-10-17). Zach will redo every parcel from scratch.
  - A schema, storage or export-format change drops the old data and shows one plain line in its place:
    "Saved with an older version; grade it again." (worded "screen it again" until UX part 2, Zach on #316) The frozen-schema hard rule below follows it.
  - Don't write converters, migration code, re-screen-all machinery or legacy fallbacks.
  - Recorded fixtures and oracles stay: they are regression tests for the engine's numbers, not data to
    preserve.
  - Existing converters may stay until a step touches them; then remove them instead of extending them.
- **Usability and presentation first** (owner, 2026-10-17). Every step's plan has a UX section covering:
  - the main task flow, in the fewest steps;
  - what the user sees first: the answer, then detail on demand;
  - empty, loading, error and slow states;
  - plain-language labels;
  - the phone layout at 375 px, with tap targets of at least 44 px;
  - contrast, and consistency with the existing components.
- **Screenshots in every hand-back** (owner, 2026-10-17). Capture each new or changed screen with
  Playwright at desktop width and at 375 px, and attach them to the final PR's description.
- **CI on step branches.** Check first that the full CI (typecheck, lint, test, e2e, determinism, expected
  guard) runs on PRs into `step/*` branches, and fix the workflow triggers if not. (Checked 2026-10-16:
  `ci.yml` and `expected-guard.yml` run on every pull request whatever its base branch, so it does, and
  `deployed-check.yml` runs on every Vercel deployment.)

## Proportionate verification (standing rule; owner, 2026-10-25)

This is a personal tool for one household. Verification should be proportionate:
- Decide on the evidence in hand. Run extra measurements, comparisons or recordings only when the result could change
  the decision or a grade.
- Prefer one confirming screenshot over a matrix of them.
- If unsure, ask Zach rather than spending CI hours.
- The safety rules are unchanged: no secrets on the client, additive migrations, and declared grade and report-text
  changes.

## Hard rules

- `lib/screen/**` has **no DOM dependencies**: no `window`, `document`, `canvas`, Leaflet,
  MapLibre or Three. It takes a GeoJSON polygon and a config and returns a result object. It must
  run in a Web Worker and in Node. Rendering (overlays, charts, 3D) is done by components from
  the result.
- Every Supabase table has **row-level security enabled** in the same migration that creates it. No
  table is created without RLS. Step 5's sync tables (and step 12's `sync_adjustments`) have **no policies**: the public key reads and
  writes nothing, and the Next.js routes, with the secret key on the server, are the only way in
  (`docs/plans/step-5-sync.md` §4). Policies scoped to a household come with accounts, if they come.
- Migrations go through the Supabase connector to the `parcelscreen` project only, and are
  **additive only** (create or add). One that drops, renames, retypes or deletes data is a stop condition.
- Secrets never reach the client. `SUPABASE_SECRET_KEY` and `CRON_SECRET` are server-only, never
  `NEXT_PUBLIC_`.
- Screen results are **immutable**: `screens` rows are inserted, never updated. A re-run inserts a
  new row with `version = max+1`.
- **Schema v9 is frozen** (roadmap step 2: the TREC trails a trailhead serves; v8 at step 1, v7 at follow-up 55, v6 at follow-up 54, v5 at follow-up 34, v4 at VR3a, v3 at B2a, v2 at step 18b):
  `SCREEN_SCHEMA_VERSION` is 9, and `lib/screen/schema-v9.test.ts` snapshots the stored `ScreenResult` shape. Any change to that shape (a field added,
  removed or retyped) requires **a new version and a clean break** (older results are dropped, never migrated: Mission
  mode's clean-break rule, 2026-10-17), in the same PR, recorded in `docs/plans/phase-0.md` §9 (owner, #109 review; v3's to v9's clean breaks are §9.26, §9.31, §9.32, §9.34, §9.37, §9.44 and §9.49). One owner exception, §9.65 (10/21): the existing drive's optional `profile`, added without a version or a clean break; step 11 extends it to its new factors' optional fields (§9.66), with `ENGINE_CURRENT_FROM` keeping older screens current.
- External fetches go through `lib/http.ts`: one throttled client with a per-host queue,
  identifying User-Agent, conditional requests, and 429 backoff. Connectors declare a minimum
  cadence and the scheduler cannot run them faster.
- DEM rasters are never persisted. The light-pollution atlas tiles may be cached in Storage.
- Keep the prototype's data-source caveats in the UI (bare-earth DEM, soil map-unit scale,
  zenith-only atlas, OSM undercounting trailheads). They are part of the product's honesty.

## Stack (fixed — see PLAN.md "Decisions already made")
Next.js App Router, TypeScript strict, React, Tailwind, MapLibre GL JS,
@turf/turf, geotiff, Supabase (Postgres, Auth, Storage) via `@supabase/ssr`, Zod for all
external JSON, Vitest for tests, pnpm.

## Repository layout (target)
```
app/                      routes: /explore, /library, /library/[id], /watch, /settings, /share/[token]
app/api/                  proxies (soils, places, sky), watch/tick, attachments, export
components/               Map/, Results/ (one component per section), Ground/, Library/, Watch/
lib/screen/               the pipeline (pure TS): dem.ts terrain.ts sites.ts sun.ts sky.ts soils.ts
                          flood.ts padus.ts places.ts roads.ts score.ts config.ts types.ts index.ts
lib/screen/worker.ts      Web Worker entry: runs screen() and posts step progress
lib/areas/                the area catalog (step 13): the areas, the headless profiler, scoring by rubric (pure TS)
lib/geo/                  utm.ts parcels.ts (NC/VA/TN services) split.ts wkt.ts
lib/connectors/           types.ts registry.ts gmail.ts hibid.ts firm-page.ts
lib/http.ts               throttled fetch
lib/db/                   Supabase clients (browser, server, service) and typed queries
supabase/migrations/      SQL migrations; apply with the Supabase CLI
test/fixtures/            recorded service responses for two real parcels (offline tests)
docs/plans/               one file per phase or roadmap step (step-<n>-<name>.md), approved before code
docs/design/              the workflow review: the roadmap's spec
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
  light domes by maximum blend, compass, zoom/tilt, time slider with hour labels. *(Superseded by step
  17, owner 2026-10-07: a ground viewer on a 2D canvas; the aerial scenes are the 3D map, soil walls are
  follow-up 31. See `docs/plans/phase-0-17-ground.md`.)*

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

## The roadmap
Follow PLAN.md's roadmap in mission mode, one step at a time; the spec for every step is
`docs/design/workflow-review.md`. The long-range Supabase data model (accounts and households,
not scheduled) and the rest of the long-range requirements are in docs/REQUIREMENTS.md; step 5's synced space is
smaller, and is in `docs/plans/step-5-sync.md`. Do not start step N+1 until step N is merged to main.
