# Step 17c: installable as a PWA (plan)

Status: **draft, for approval.** A small step before 18 (owner, 2026-10-07): it slots after 17a/17b and before 18, so 18's acceptance run covers it.

## 1. What changes

- **Web app manifest** (`app/manifest.ts`, Next's typed manifest route):
  - name "Parcel Screen", short_name "Parcel Screen";
  - start_url `/explore`, display `standalone`;
  - theme_color `#1c2620` (the ink of the toolbar and menu), background_color `#e7eae3` (`--color-paper`);
  - icons: 192 and 512 PNG, each also as `purpose: "maskable"` (a padded variant), plus a 180 px Apple touch icon via `app/apple-icon.png`.
- **Icons:** a simple mark, a ridge line under a low sun on the ink colour. It's drawn as an SVG in the repo and rasterised to the PNG sizes once by a small script, using Playwright, which is already a dev dependency. No new dependency for icons.
- **Service worker with Serwist** (not next-pwa). It **precaches the app shell and static assets only:**
  - the `/explore` page;
  - Next's `_next/static` chunks, including the screen worker's chunk;
  - fonts, the MapLibre worker copy, and the icons.
- **No runtime caching** in this step:
  - API routes, parcel services, DEM, soils, ortho and basemap tiles all go straight to the network, as now.
  - A request with no route in the service worker isn't touched. Cross-origin requests and the Web Worker's fetches pass through unchanged.

## 2. Offline

- **Opening the app offline** serves the precached shell instead of a blank page.
- **A banner** says "You're offline — saved parcels still open from History", shown while `navigator.onLine` is false (and on fetch failures that say so).
- **History** is in localStorage, so it lists and opens.
- **A saved parcel's kept results** come from IndexedDB, so they may show offline too. That's a bonus if it falls out naturally; nothing is built for it.
- **Map tiles and running a screen need the network.** The banner covers that, and Screen it says so offline instead of starting.

## 3. Updates

- **A new deploy installs its service worker in the background and waits** (no `skipWaiting`). It activates on the next launch, when no window of the old version is open.
- **While a new version waits,** a small toast reads "Updated — reload". Tapping it activates the new version and reloads.
  - The toast doesn't show while a screen is running, or while the ground viewer or Settings is open.
  - So nothing reloads mid-screen.

## 4. Must not interfere

- **The screen's Web Worker:** its fetches are untouched (no runtime routes), and its chunk is precached like any static asset. Checked: a screen runs live with the service worker active, and its requests reach the network.
- **The HAR-replay e2e (step 18):** Playwright doesn't route requests a service worker handles. The e2e contexts set `serviceWorkers: "block"`, and the service worker registers only in production builds (`next start`), not in `next dev`.
- **Vitest:** unaffected; there's no service worker in Node.

## 5. Open point to settle in the PR

**Serwist's Next integration with Turbopack.** Next 16 builds with Turbopack, and `@serwist/next` has historically been a webpack plugin. I'll use whichever Serwist path supports Next 16 builds: its Turbopack integration if available, else injecting the precache manifest after `next build` with Serwist's build tool. I'll name the one used in the PR. One new dependency family (Serwist), justified by the owner's choice.

## 6. Checks

- **Unit:**
  - the manifest's fields;
  - the update toast's rule: shown only with a waiting worker, never during a run or with the viewer or Settings open.
- **Live** (`next build && next start`, headless Chrome):
  - the manifest and service worker register;
  - Lighthouse-style installability: the manifest is valid, the icons load, and the service worker controls `/explore`;
  - offline (`context.setOffline(true)`): a reload shows the shell with the offline banner, and History opens a saved parcel;
  - a second build serves "Updated — reload", and tapping it loads the new version;
  - a screen runs with the service worker active, and the screen worker's requests aren't served from the service worker.
- **§7b additions (manual, on the production URL):**
  - Chrome on Android offers Install, and it launches standalone;
  - an update arrives on relaunch;
  - an offline launch shows the offline state.

## 7. Follow-up

**Follow-up 36: field offline mode** (Phase 1, designed with Supabase sync):
- saved parcels and their results available offline;
- pre-cached map tiles for saved parcels, subject to each tile source's terms and the browser's storage limits.
