# Step 14e: Offline and map caching

The owner pre-approved the brief (Zach, 2026-10-25, package C). Zach reviews this plan and the hand-back together; the
mission runs on this plan's recommended answers (§12), each flagged in the hand-back, except Q1, which waits for his yes
(it touches a hard rule).

**Sources:**
- PLAN.md row 14e;
- Zach's brief of 2026-10-25 (C);
- `docs/plans/phase-0-17c-pwa.md` (the service worker and its precache) and `docs/plans/step-5-sync.md` (sync, and its
  "no offline queue");
- `docs/commercial-review.md` (each provider's terms).

**Decision:** §9.74, written in the last PR.

**Mission mode:**
- The work runs on `step/14e-offline`, branched from main after the 14d hand-back (#348) merged.
- Each row of §11 is one PR into it, which I merge when CI is green on its head.
- The step ends with the hand-back to main, which Zach merges.

## 0. What's there today (found while planning)

**The service worker** (`app/sw.ts`, Serwist):
- It precaches the app shell (`/explore`, `/`, `/library`, `/priorities`, `/help`, the report shell), Next's static
  chunks and `public/**` except `places/` and the ER list.
- It routes nothing else (`runtimeCaching: []`): every tile goes to the network.
- It's registered in production only. Every e2e blocks it except `e2e/pwa-screen.spec.ts`.

**No storage calls:** nothing calls `navigator.storage.persist()` or `estimate()`.

**The map's sources** (`components/Map/style.ts`, `lidarStyle.ts`, `terrainStyle.ts`, `roadsStyle.ts`):
- XYZ tiles: USGS Imagery and Topo, Esri Imagery and Streets, TN's and NC's orthos, the Lorenz atlas, Mapterhorn
  and AWS Terrarium.
- Per-tile `bbox` exports: VA's VGIN ortho and USGS 3DEP Slope.
- Vector: OpenFreeMap's TileJSON and tiles.
- Parcel lines: one ArcGIS `query` per zoom-14 tile (`lib/geo/parcelTiles.ts`).
- Glyphs and icons are same-origin and already precached.
- MapLibre's worker and the contour worker (`maplibre-contour`, a custom protocol) fetch from the page's origin, so
  the service worker sees their requests.

**Device data** lives in IndexedDB `parcelscreen`:
- `screens`, `profiles` and `docs`;
- `ps.parcels` holds each parcel's notes, markup (lines and marks), screen ids and scenarios.

A parcel opens on `/explore` (`openOnMap`); there's no `/parcel/<key>` page.

**Sync** (`lib/sync/engine.ts`) saves whole parcel records:
- A failed save shows Not saved and Try again, and is written to `ps.sync`.
- Nothing retries by itself: the `online` event only re-arms the poll.

**Grading offline** already stops at the button: `ScreenIt.run()` checks `navigator.onLine` and shows "You're
offline — screening needs the network." A re-grade on open waits for `online`.

**The e2e** replays recordings (`e2e/replay.ts`):
- Map tiles are aborted and listed.
- `e2e/lidar.spec.ts` answers tiles with grey PNGs, which is the pattern this step's tests reuse.

## 1. The rules

- **Device only.** The tile cache, the saved-offline list and their sizes are this device's: not synced, not in
  Export, not in any profile.
- **Never a provider whose terms forbid it** (§2). Esri's terms do, so Esri's tiles are never cached or saved.
- **No numbers change.** No engine, grade, schema or `expected.json` change. No report text changes (rule 7). The UI
  strings are in §9.
- **No new dependency.** Serwist's routing and the Cache API cover the caching. A small IndexedDB store holds the
  metadata, opened with the same helper as `lib/client/db.ts`.
- **Downloads are polite.**
  - Save offline fetches through `lib/http.ts`, with at most 4 requests at a time per host.
  - The automatic cache sends only the requests the map already makes. A background refresh is one request per
    stale tile viewed, never a sweep.
- **The grade's own requests are never cached** (the 3DEP elevation export, soils, flood and the rest). The service
  worker matches only the map's tile URL patterns (§3.1). See Q1 for terrain tiles a grade may also read.
- **Clean break:** new stores in a new database, with nothing to migrate.

## 2. Each layer's decision

"Viewed" means the automatic cache keeps the tiles you looked at. "Saved" means Save offline downloads the ¼-mi box.

| Layer | Host | Viewed | Saved (zooms) | Why |
|---|---|---|---|---|
| USGS Imagery, USGS Topo | basemap.nationalmap.gov | Yes | 12–16 (the source stops at 16; MapLibre overzooms) | Public domain |
| Esri Imagery, Esri Streets | server.arcgisonline.com | **No** | **No** | Esri's terms bar storing or harvesting basemap tiles outside its Content Packages and SDKs (#338's research; commercial-review.md) |
| State aerial: TN (TNMap), NC (NC OneMap), VA (VGIN export) | tnmap.tn.gov, services.nconemap.gov, vginmaps.vdem.virginia.gov | Yes | 12–18, the parcel's state only | No term forbids it. NC asks for *bulk* data from the county downloads, and VGIN is "for cartographic use": a ¼-mi box for display is neither bulk nor analysis (Q2) |
| Lidar terrain: Shaded relief | tiles.mapterhorn.com | Yes | 13–16 | Open use; commercial-review.md already notes 14e may keep its tiles. Elevation tiles (Q1) |
| Lidar terrain: Slope | elevation.nationalmap.gov (exportImage, slope rendering) | Yes | 13–18 | Public domain; "no limit on … caching" |
| 3D terrain, Hillshade, Contours | s3.amazonaws.com/elevation-tiles-prod (Terrarium) | Yes | 12–15 | AWS Open Data, public. Elevation tiles (Q1) |
| Roads and labels | tiles.openfreemap.org (TileJSON and tiles) | Yes | 12–14 (the planet's max) | ODbL, free; they serve tiles with a 10-year max-age |
| Light pollution (atlas) | djlorenz.github.io | Yes | the one zoom-8 tile over the parcel | CLAUDE.md already allows caching the atlas tiles |
| Parcel lines | NC OneMap, VGIN, TN Comptroller (ArcGIS `query` per zoom-14 tile) | Yes | the box's zoom-14 tiles (1–4 queries) | Display of a few tiles. TN's "no recurring or automated downloads" is about its shapefiles; one person's tap isn't recurring (Q2) |
| Places (the baked cells) | same origin, `/places/v1/` | Yes | `index.json` plus the cells within 0.6° (about 60 km) of the parcel, both folders | Our own files (OSM's under the ODbL) |
| Report card's static map | USGS, Esri fallback | — | — | Out of scope. A report opened offline shows whatever USGS tiles are cached |

**Which basemaps Save offline downloads:** all three that allow it (USGS Imagery, USGS Topo and the state aerial),
whichever you're using. Switching basemaps offline then still works, and the size prompt counts them all.

**Esri offline:**
- Map layers marks the two Esri choices "not kept offline".
- If you're offline with an Esri basemap, one line over the map says so (§9). Your choice isn't changed.

## 3. The automatic cache (the service worker)

### 3.1 Matching

- **One table of layers** (`lib/offline/layers.ts`, pure). Each layer has an id, a URL matcher, whether it's cached
  when viewed, whether Save offline downloads it, its zooms, and a typical tile size (§4.2). The service worker and
  Save offline both read it, so they can't disagree.
- **Matchers** are hosts plus path patterns:
  - The Slope matcher requires the lidar style's slope `renderingRule`, so the grade's 3DEP elevation export (a
    different rule and format) never matches.
  - ArcGIS parcel queries match only `parcelTiles.ts`'s exact parameters.
- **Cache keys for `bbox` tiles:**
  - VGIN's ortho and USGS Slope are keyed by their tile (z/x/y), worked out from the `bbox` in the URL, not by the
    URL itself. So a download that formats the numbers differently from MapLibre still hits.
  - Parcel-line tiles are POST queries (`fetchTile`), which the Cache API can't store as requests. They're keyed by
    the service URL and the form body, as one GET-shaped key.
  - Other tiles are keyed by URL.

### 3.2 Strategy

- **Cache first.** A tile in the cache is answered from it at once.
- **Background refresh:** if a tile was stored more than 7 days ago (`REFRESH_AFTER_DAYS`, `lib/offline/config.ts`),
  it's fetched again after answering, and replaced if the fetch succeeds.
- **What's stored:**
  - Only OK responses that can be read: CORS, not opaque, and with a size.
  - An error, a 404 or an ArcGIS error JSON (answered 200 with `{"error":…}`) is passed through and never stored.
- **OpenFreeMap's TileJSON** names a dated tile set that changes weekly.
  - It's network-first with the cache as a fallback, so offline the map uses the TileJSON whose tiles are cached.
  - Its tiles are cache-first like any others.

### 3.3 Size, least recently used, and the cap

- **A new database, `parcelscreen-offline`** (the service worker and the page both open it):
  - `tiles`: cache key → `{ layer, bytes, storedAt, usedAt, pins: string[] }`;
  - `saved`: parcel key → `{ name, bytes, tiles, savedAt, complete }`;
  - `meta`: the cap.
- **`usedAt` is batched:** hits are collected and written every few seconds, not one transaction per tile.
- **Eviction** (`lib/offline/evict.ts`, pure, unit-tested):
  - After a store, if the automatic cache (tiles with no pins) is over the cap, the least recently used unpinned tiles
    are deleted until it's under 90% of the cap.
  - Pinned tiles are never chosen.
- **The cap:**
  - It applies to the automatic cache only. Saved parcels are listed separately and never evicted (Q5).
  - Default 1 GB. Settings offers 250 MB, 500 MB, 1 GB, 2 GB and 5 GB; debug mode adds 5 MB for the eviction e2e.
- **Clear map cache** deletes every unpinned tile. Saved parcels stay.

### 3.4 Persistent storage

- **Asked for automatically, never with a prompt at launch** (Q6):
  - `navigator.storage.persist()` is called once the app is installed (`display-mode: standalone`) and at the first
    Save offline.
  - Chrome grants it without asking. Firefox asks, which is why it waits for a deliberate act.
- **Settings › Offline:**
  - shows whether it's granted;
  - if not, offers Keep offline data, which asks again.
- **Usage against the quota** comes from `navigator.storage.estimate()`, alongside our own totals: the map cache and
  saved parcels.

## 4. Save offline

### 4.1 The flow

- **Where:** the parcel panel's ⋯ menu (`PanelMenu.tsx`), after Make a report.
  - It reads "Save offline", or "Update offline copy" once saved.
  - It shows on a parcel with a boundary.
- **The prompt** (a dialog, a sheet on a phone):
  - "Save offline?" and "About <size>";
  - what's included (§9);
  - Save and Cancel.
- **Progress:**
  - The prompt becomes a progress bar ("Saving offline… <n>%") with Cancel.
  - At the end: "Saved offline (<size>)".
  - The panel stays usable meanwhile; closing the prompt keeps the download going, with progress in the ⋯ item.
- **A failure:**
  - What downloaded is kept and pinned, and the entry is marked incomplete.
  - The prompt says "<k> map tiles didn't download", with Try again.
  - Settings lists it as "Incomplete", with Try again.

### 4.2 What's downloaded (`lib/offline/plan.ts`, pure)

- **The box:** the parcel's bounds (with its pieces and split, as drawn) grown by ¼ mi (402 m) on each side.
- **Tiles:** for each layer that allows saving (§2), every tile in the box at its zooms.
  - A 100-ac parcel is about 1.5 km across with the margin, which comes to roughly 150–250 tiles a layer at zooms
    12–18 and about 600–900 in all.
- **The estimate:** tiles × each layer's typical size.
  - It starts from the table's defaults (for example aerial JPEG 25 KB, Mapterhorn 80 KB, Terrarium 100 KB, vector
    40 KB).
  - Once the device has cached tiles of a layer, it uses that layer's average instead.
  - The prompt says "About", rounded to 5 MB.
- **The records:** the parcel record and its scenarios are already on the device.
  - Its last screen, and each scenario piece's screen, are fetched into `screens` if this device hasn't got them
    (`getScreen`; a synced device may not).
  - They're counted in the size.
- **Places:** `index.json` and the cells within 0.6° of the parcel's centre, from both folders.
- **Pinning:** every tile downloaded or already cached gets the parcel's key in its `pins`.
  - Delete removes the key, and a tile with no pins left joins the automatic cache (LRU from now).
  - "Update offline copy" downloads again and replaces the tiles.

### 4.3 Settings › Offline

- A new section after Your data (`SettingsDialog.tsx`).
- **Storage:** "This device: <used> of about <quota>", and the persistence line.
- **Map cache:** "<x> of <cap>", the cap select, and Clear map cache.
- **Saved offline:** one row per parcel: name, size, the date saved (or "Incomplete") and Delete. A tap on the name
  opens it on the map.
  - Empty: "No parcels saved offline. Use Save offline in a parcel's ⋯ menu."
- **The iPhone hint:** one line, on iOS Safari when not installed (Q7).

## 5. Opening a saved parcel with no connection

- **What works:**
  - `/library` and `/explore` are precached, and Your list, the parcel record and its screen are on the device.
  - Opening a saved parcel shows its map (the box's tiles), boundary, grade card, lines, marks and places.
- **The grade card** reads from the stored screen, as it does online.
  - Its surface overlays are drawn from the result's arrays, so they show offline too.
- **What says it needs a connection:**
  - **Grade** (and Grade again): "You're offline — grading needs a connection." This rewords the existing
    `OFFLINE_SCREEN_TEXT`; "screening" became "grading" in UX part 2.
  - Re-grade on open keeps its existing "Will grade again when you're back online".
  - Try it on a drawn line is already hidden offline.
  - Region search and Areas' live parts keep their existing errors.
- **Outside the box:** the map shows what the automatic cache has, else the basemap's blank, with the existing
  offline banner ("You're offline — saved parcels still open from Your list").
- **Esri basemap offline:** one line, "Esri's maps aren't kept offline: pick USGS or State aerial in Map layers."

## 6. Lines and notes made offline (extending step 5)

Step 5 has "no offline queue": a failed save says Not saved and waits for Try again. This step adds a queue for a
parcel's **notes** and **lines and marks** only, as the brief says.

- **Held, not failed:** a save that fails while offline (`navigator.onLine` false, or the fetch throws a network
  error) is held if each unsaved record:
  - is a parcel record;
  - differs from its baseline only in `notes`, `notesAt` and `markup`.

  Held means:
  - the indicator reads "Saved on this device — syncs when you're back online";
  - it's written to `ps.sync` as now, plus a `held` flag;
  - there's no Not saved and no Try again.
- **Anything else** unsaved (a status, a listing, priorities, a household take) keeps step 5's behaviour: Not saved
  and Try again. A parcel record with both kinds of change is "anything else", whole.
- **Back online:** on the `online` event, and at the next open, a held state runs fetch, then save, by itself.
- **The merge on return** (`lib/sync/records.ts`, pure, unit-tested):
  - If the space's copy of a held parcel changed since our baseline, we take the space's record and lay our changes
    over it.
  - **Lines and marks:** three-way by id. Added here: added. Changed here: ours. Deleted here: deleted, unless it
    changed there, in which case theirs is kept.
  - **Notes:** if theirs didn't change, ours. If both changed, theirs, a blank line, then ours. Both are kept, and
    nothing is lost (Q4).
  - Every other field is theirs.
- **Not joined:** on a device that isn't syncing, nothing changes. Everything is local already.

## 7. Workflows

None. The session can't reach the tile hosts, but nothing here needs live data: the e2e answers tiles with fixed
PNGs, and the size defaults are estimates the device refines (§4.2).

## 8. UX

- **The main flow, in the fewest steps:**
  - ⋯ › Save offline › Save (two taps).
  - Offline: Your list › the parcel (one tap).
  - Settings › Offline is where to look, and is never needed for the flow.
- **The answer first:**
  - the prompt leads with the size;
  - Settings leads with the device's usage;
  - the saved list leads with the name.
- **Empty states:** no saved parcels (the line in §4.3); an empty map cache reads "0 MB of 1 GB".
- **Loading:** the progress bar, with the percentage by tiles.
- **Error:** an incomplete save (§4.1); storage full (`QuotaExceededError`): "Not enough space on this device: free
  some up, or lower the map cache."
- **Slow:** a slow host only slows its share of the progress; Cancel always works.
- **Plain labels:** "Save offline", "Saved offline", "Map cache", "Keep up to", "Clear map cache", "not kept
  offline"; no "tiles" or "quota" in the main lines ("map" and "space").
- **Phone at 375 px:**
  - the prompt is a bottom sheet;
  - the Settings rows are at least 44 px;
  - Delete and Clear map cache are 44 px buttons;
  - the cap select is full width.
- **Contrast and consistency:** the existing dialog, menu, Settings section and progress-bar components (step 4b's
  grade progress).

## 9. Strings (declared; UI only, no report text)

- **⋯:** "Save offline", "Update offline copy", "Saving offline… <n>%".
- **The prompt:**
  - "Save offline?" and "About <size>";
  - "The map ¼ mile around the parcel, in every layer that allows it, with its grade, lines, marks and nearby places.";
  - "Esri's maps aren't included: their terms don't allow it.";
  - "Saved offline (<size>)", "<k> map tiles didn't download.", "Try again", "Cancel";
  - "Not enough space on this device: free some up, or lower the map cache."
- **Settings › Offline:**
  - "Offline", "This device: <used> of about <quota>";
  - "Kept until you delete it" / "The browser may clear this when space runs low." and "Keep offline data";
  - "Map cache: <x> of <cap>", "Keep up to", "Clear map cache";
  - "Saved offline", "Incomplete", "Delete";
  - "No parcels saved offline. Use Save offline in a parcel's ⋯ menu.";
  - "On an iPhone, add Parcel Screen to your Home Screen (Share › Add to Home Screen), or Safari may clear offline
    data after a week without use."
- **Map:** "not kept offline" (Map layers, beside Esri); "Esri's maps aren't kept offline: pick USGS or State aerial
  in Map layers."
- **Sync:** "Saved on this device — syncs when you're back online".
- **Changed:** `OFFLINE_SCREEN_TEXT` "You're offline — screening needs the network." becomes "You're offline — grading
  needs a connection."

## 10. Test plan outline

- **Unit (pure modules):**
  - `layers.ts`: each matcher against real URLs from `style.ts` (and the grade's 3DEP export, Esri and soils, which
    must not match); bbox → tile keys.
  - `plan.ts`: tile counts for a box at each layer's zooms; the estimate; places cells.
  - `evict.ts`: LRU under the cap, to 90%, pins never chosen, Clear keeps pins.
  - The sync merge: lines and marks by id; notes both kept; other fields theirs; held vs failed.
- **e2e** (service worker allowed, production build, tiles answered by `context.route` with PNGs of known size):
  1. **A viewed area offline:** view Mud Creek, go offline, reload → the map's tiles come from the cache (no tile
     request fails; the canvas isn't blank).
  2. **Save offline:** the prompt shows a size, progress reaches 100%, and Settings › Offline lists Mud Creek.
  3. **A saved parcel offline:** with the network cut, Your list › Mud Creek opens with its map, boundary and grade;
     Grade says it needs a connection.
  4. **Eviction:** with the debug cap of 5 MB, panning far enough evicts the oldest viewed tiles while Mud Creek's
     saved tiles stay (counted in the metadata store).
  5. **Lines offline:** joined to a memory-store space, draw a line offline → "Saved on this device…" → back online →
     a second device sees it.
- **Screenshots** at 1280 and 375: Settings › Offline (with one saved parcel), Save offline's prompt with its size,
  and the progress.

## 11. PRs, into `step/14e-offline`

| # | PR | Numbers |
|---|---|---|
| 0 | This plan | None |
| 1 | `lib/offline/` (layers, the metadata store, eviction); the service worker's tile route (cache first, refresh, cap) for every layer of §2 except the elevation tiles (Q1); persistent storage; Settings › Offline (usage, cap, Clear, iPhone hint); Esri marked "not kept offline"; e2e 1 and 4 | None |
| 2 | Save offline: ⋯ item, prompt with the estimate, download through `lib/http.ts`, progress, pins, screens fetched, places cells; the saved list in Settings with Delete; `OFFLINE_SCREEN_TEXT` reworded; e2e 2 and 3 | None |
| 3 | Lines and notes offline: held saves, sync on return, the three-way merge; e2e 5 | None |
| 4 | Elevation tiles (Mapterhorn, Terrarium) cached and saved, once Zach says yes to Q1; the CLAUDE.md line | None |
| 5 | Screenshots, the fresh-eyes review, §9.74, commercial-review.md's offline column; the hand-back to main | None |

## 12. Questions, each with the recommendation (the mission proceeds on these; each flagged in the hand-back)

1. **Elevation tiles and the hard rule "DEM rasters are never persisted".** The brief asks for the 3D terrain,
   contours, hillshade and lidar relief offline. Their tiles (Terrarium, Mapterhorn) are elevation rasters.
   - **Recommended:** read the rule as being about the app's own storage of a grade's elevation (Supabase, Storage, a
     screen result), not the device's map cache, which holds what the browser's HTTP cache would hold anyway.
     Reword it in CLAUDE.md: "DEM rasters are never persisted by the app (Supabase, Storage, a screen result); the
     device's map-tile cache (step 14e) may keep elevation tiles." A grade that falls back to Terrarium tiles may
     then read a cached one: the same bytes, refreshed weekly.
   - **This one waits for Zach's yes.** PR 4 holds it, and PRs 1–3 don't depend on it. Without it, the 3D terrain,
     contours, hillshade and Shaded relief are blank offline, and Slope still works.
2. **State aerials and parcel lines in Save offline.** No term forbids it; NC's "bulk" and TN's "automated
   downloads" concern whole-county data.
   - **Recommended:** save the ¼-mi box. It's what one person viewing the parcel loads anyway.
   - If Zach prefers caution, they become viewed-only, and the saved parcel's aerial is USGS's (overzoomed past 16).
3. **How often a cached tile refreshes.**
   - **Recommended:** in the background when it's over 7 days old, and only when viewed.
4. **Notes changed on both sides.**
   - **Recommended:** keep both, theirs then ours with a blank line between. Nothing lost; the household tidies it.
5. **What the cap counts.**
   - **Recommended:** the automatic cache only. Saved parcels show their own total and are never evicted.
6. **When to ask for persistent storage.**
   - **Recommended:** once installed, and at the first Save offline; never as a prompt at first launch.
7. **The iPhone hint.**
   - **Recommended:** only on iOS Safari when not installed, in Settings › Offline (the brief's one line), not as a
     banner.
8. **A saved parcel's tiles aren't refreshed by themselves.**
   - **Recommended:** Update offline copy re-downloads. The automatic cache's 7-day refresh also covers a saved tile
     you view online.

## 13. Stop conditions

- Any change to expected.json, grade or report text (none is planned).
- Q1 without an answer by the time PRs 1–3 are merged: PR 4 waits; the hand-back says so.
- A product decision §12 doesn't cover.
- The same CI failure surviving 3 attempts.
- The plan turning out wrong, for example:
  - MapLibre's worker or the contour worker isn't controlled by the service worker, so viewed tiles can't be cached
    without moving the fetches;
  - a provider answers without CORS, so its tiles can't be measured or stored (then it's viewed-only through the HTTP
    cache, and the hand-back says which).
