# Parcel Screen

A desk-screening tool for rural mountain land. Give it a parcel boundary, from a tap on the county parcel lines in NC, VA or TN, a parcel number, or one you draw. It pulls public data and answers four questions:
- Is there a good place to live on this land, and where?
- What will it cost to build there?
- How much sun does it get?
- How dark is the sky?

**The data sources:** USGS 3DEP lidar elevation, NRCS soils, FEMA flood maps, USGS PAD-US public land, the Lorenz light-pollution atlas, Census TIGER roads, OpenStreetMap places and OSRM drive times.

Phase 0 is a port of the single-file prototype (`legacy/parcelscreen.html`) to Next.js. The prototype is the behavioural reference. The plans are in `PLAN.md` and `docs/plans/`; how to work in this repo is in `CLAUDE.md`.

## Run it locally

You need Node 22 and pnpm 11 (`corepack enable` provides the version pinned in `package.json`).

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:3000/explore. A production build is the only place the service worker runs:

```bash
pnpm build && pnpm start
```

There are no environment variables to set for Phase 0. Every service is public and called from the browser, except the Overpass fallback, which goes through `app/api/places/overpass`.

## Tests

| Command | What it checks |
|---|---|
| `pnpm typecheck` | The app with the DOM types, then the pipeline (`lib/screen`, `lib/geo`, …) **without** them, so the screen can run in a Web Worker and in Node. |
| `pnpm lint` | ESLint, including the pipeline's import rules and the rule against async predicates in Playwright's `waitForFunction`. |
| `pnpm format:check` | Prettier. |
| `pnpm test` | Vitest, fully offline. The pipeline is held against **golden results** recorded from the prototype for two Floyd County, VA parcels (`test/fixtures/`): each one's network traffic as a HAR, plus the prototype's results. |
| `pnpm e2e` | Playwright on a production build (port 3100). The same fixtures are replayed in the browser, and the result the **Web Worker** posts must match the goldens. One test runs with the service worker installed. First run on a machine: `pnpm exec playwright install chromium`. |

CI runs all of these on every PR. The e2e job skips its work for docs-only changes.

**Re-recording the fixtures** (`pnpm record:fixtures`) runs the prototype against the live services and rewrites the goldens. Read `test/fixtures/README.md` first: the goldens are the parity baseline, and a re-recording has to be explained in its PR.

## Deploys

- **Vercel deploys `main` to production** at https://parcelscreen.vercel.app/explore. To check which build it serves, look at the `/explore` revision in `/serwist/sw.js`.
- **Every pushed branch gets a preview** at `https://parcelscreen-git-<branch, with / as ->-zgrether-1030s-projects.vercel.app/explore`. Keep branch names short: a long one gets a hashed host name.
- Zach merges every PR.

## The installable app (PWA)

**A production build registers a service worker** (`app/sw.ts`, served at `/serwist/sw.js` by Serwist's Turbopack integration).
- It precaches the app shell and static assets only. API, parcel, elevation, soils and tile requests always go to the network.
- One file stays out of the precache on purpose: Turbopack's Web Worker entry, `turbopack-worker-*.js`, which reads its startup config from its own URL.

**When offline,** the app shows "You're offline — saved parcels still open from History".

**A new deploy** waits until the next launch, with an "Updated — reload" toast, never shown during a screen.

The e2e blocks the service worker, except in `e2e/pwa-screen.spec.ts`.

## Debug mode

Debug mode is off by default. To turn it on in a browser, set it in the DevTools console, then reload:

```js
localStorage.setItem("ps.debug", "1");
```

It adds three test handles:
- `window.__psMap`: the map;
- `window.__psScreen`: the screen's state;
- `window.__psDebug.posted`: a frozen copy of the worker's latest result.

The app only writes these handles; no app code reads `__psDebug`.

## What the data can't tell you

These limits are stated in the app as well; they're part of what it reports.
- **Elevation is bare earth.** Trees add to every ridge, and the canopy allowance in Settings is a guess.
- **Soil lines are coarse:** an NRCS map unit, not a soil test.
- **The sky is zenith brightness from the Light Pollution Atlas.** The atlas is zenith-only, so the light domes toward the horizon are sampled from the ground map as a proxy.
- **Places come from OpenStreetMap** (via Photon), and trailhead counts undercount national-forest access.
- **Drive times come from OSRM's public router:** fine for comparing parcels, not for catching a flight.
- **When 3DEP doesn't answer,** a coarser terrain-tile fallback is used, and the report says so.

## Repository layout

```
app/                 routes (/explore) and the Overpass proxy; the service worker (sw.ts, serwist/)
components/          the explorer: Map/, Results/, Ground/ (the ground viewer), Pwa/, Settings/, Help/
lib/screen/          the screening pipeline: pure TypeScript, no DOM; worker.ts is its Web Worker entry
lib/geo/             parcel services, splitting, combining, coordinates
lib/render/, lib/report/   what the map overlays and the report sections draw from a result
lib/client/          browser-only code: storage, export/import, the screen hook, the PWA rules
test/                fixtures, goldens and the comparator; e2e/ is the Playwright suite
legacy/              the prototype (read-only reference)
```
