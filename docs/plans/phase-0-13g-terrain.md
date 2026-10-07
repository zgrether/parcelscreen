# Step 13g: 3D terrain, hillshade and contours (plan)

Status: **approved (owner, 2026-10-07), with the changes in §10.** A new map step that comes **before step 15**:

- the map tilts and rotates over real terrain;
- a hillshade and contour lines in feet help read the land;
- all of it is a preview layer: nothing in `lib/screen` changes, and no screen goes out of date because of it.

Step 15's overlays are planned to drape on this terrain (`phase-0-15-overlays.md` §5). Line numbers (L…) refer to `legacy/parcelscreen.html`. The prototype has no 3D map, so this is new behaviour; its 3D walkthrough is step 17 and is separate.

## 1. The elevation tiles

**Source:** AWS Terrain Tiles, Terrarium encoding:

```
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
```

- tileSize 256, maxzoom 15, overzoomed above;
- `raster-dem` with `encoding: "terrarium"`.

The engine already decodes the same tiles as its DEM fallback (`config.ts` `endpoints.terrarium`, `dem.ts`), so the host is known.

**Checked 2026-10-07 from this machine:**

- **Responses:** z12 and z15 tiles over Floyd answer 200 `image/png`, about 90–120 kB at z15.
- **Caching:** they carry an `ETag`.
- **CORS:** `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET`, with `Origin: https://parcelscreen.vercel.app`.
- **What the data is:** in the US the tiles come mostly from USGS 3DEP at 1/3″ (about 10 m). That's why the group is labelled "≈10 m". The screen itself keeps using 3 m lidar from 3DEP `exportImage`.

**Attribution:** "Terrain: AWS Terrain Tiles (USGS 3DEP, SRTM, et al.)", on the `raster-dem` source. MapLibre shows a source's attribution only while one of its layers is visible.

**CSP:** the app has **no Content-Security-Policy today** (`next.config.ts` sets no headers), so there is nothing to update in 13g. A CSP comes in step 18 (**Q1**).

**Fallback if the endpoint fails** (it's a public bucket with no SLA): use MapTiler's terrain-rgb tiles, which need a key; that's a Phase 1 env var, so it would wait. Mapbox Terrain-DEM is not an option, since it's tied to Mapbox GL. 3DEP is not proxied, per your instruction.

If the tiles fail at runtime, the terrain toggles stay on, and a hint says "Terrain tiles didn't load". MapLibre keeps drawing flat.

## 2. One DEM fetch for terrain, hillshade and contours

**Library: `maplibre-contour` 0.1.1** (BSD-3, no dependencies, by onthegomap). It's the plugin behind MapLibre's own contour examples. Justification: computing isolines from Terrarium tiles in a worker is exactly what it does, and writing our own would be a few hundred lines to maintain.

- **One fetch per tile:** a single `DemSource` (`worker: true`, Terrarium, maxzoom 15) serves the contours, and its `sharedDemProtocolUrl` serves the `raster-dem` sources. Each tile is fetched once for all three uses.
- **Two `raster-dem` sources on the same URL:** one for `setTerrain`, one for the `hillshade` layer. MapLibre warns when a single source is used for both. Thanks to the shared protocol, this costs no second fetch.
- **Compatibility risk:** 0.1.x registers through the promise-based `addProtocol` (MapLibre 4+). We're on **6.12**. The first commit of 13g is a spike that proves it works. If it doesn't, terrain and hillshade ship on MapLibre's own `raster-dem`, and contours become a follow-up (**Q4**).

## 3. Layers and their order

**Stacking order** (owner, with step 15): basemap < **hillshade** < light pollution < scrim < (15: terrain image < soil fills) < **contours** < parcel lines < (15: soil outlines < parcel outline < fan < driveway < circles) < DOM markers.

Contours sit **above** step 15's terrain image and soil fills, so they stay readable with any surface on. 13g builds the order with empty slots for 15's layers.

- **Hillshade above the ortho and below the parcel lines,** as asked:
  - `hillshade-exaggeration` 0.35;
  - shadows `#000` at 0.35, highlights `#fff` at 0.15;
  - multiply-like, so the ortho shows through.
- **Contours** (`maplibre-contour`, `multiplier: 3.28084` for feet):

  | Zoom | Minor | Major (labelled) |
  | --- | --- | --- |
  | 15+ | 20 ft | 100 ft |
  | 13–14 | 40 ft | 200 ft |
  | below 13 | hidden | hidden |

  - Lines: `#f1f3ee` at 0.45, minor 0.6 px, major 1.1 px, with a thin dark halo for the ortho.
  - Labels on major lines: "2,600 ft" (`symbol-placement: line`, 11 px).
- **Glyphs for contour labels:** the style has none today. We add a self-hosted `glyphs` URL with **one font's 0–255 range** (Noto Sans Regular, about 70 kB) in `public/fonts/`. That covers digits, "ft" and the comma, with no new external host. The style's `glyphs` points there.
- **Terrain:** `map.setTerrain({ source, exaggeration })`, with exaggeration 1× / 1.5× / 2× (default 1.5×). `maxPitch: 80` (MapLibre 6 allows up to 85).
- **Sky** when pitched: a plain `setSky` with the basemap's horizon colour, so the space above the ridges isn't black.

## 4. Controls

### Info › Layers: a "Terrain preview ≈10 m — screen uses 3 m lidar" group

| Control | Values | Default |
| --- | --- | --- |
| **3D terrain** | on/off | **off** (Q2) |
| **Exaggeration** | 1× / 1.5× / 2× segmented; shown while 3D terrain is on | 1.5× |
| **Hillshade** | on/off | **on on desktop, off on phones** (Q2) |
| **Contours** | on/off | **on on desktop, off on phones** (Q2) |

- **Phones** are the sheet's media query. The defaults there are off **regardless of the frame rate**, because hillshade and contours fetch z15 DEM tiles, which is a lot of data on cellular (Q2).
- **Where the group goes:** Info › Layers **and** the **Map ▾** menu, under "Terrain preview" (Q3). The Info panel exists only while a parcel is open (`InfoPanel.tsx` L27), and the terrain is about the map, not the parcel; the Map ▾ menu works with nothing selected. Both show the same prefs.
- **Saved per device** (localStorage), as UI prefs only: `ps.terrain` (`{ on, exaggeration }`), `ps.hillshade`, `ps.contours` in `lib/client/prefs.ts`. They are **not** in `UserConfig`, run `params`, schema v2 or the screen keys (`screenKeys.ts`). So they can never mark a screen out of date. A unit test asserts that `runKeys` ignores them.

### Rotate and pitch

- **Already on today:** MapLibre's defaults allow this on desktop (right-drag or Ctrl-drag; Shift-arrows on the keyboard) and on touch (two-finger twist to rotate, two-finger vertical drag to pitch). 13g raises `maxPitch` to 80.
- **Pitching without terrain:** pitching stays allowed. A flat tilted map is legitimate, and the compass resets it.
- **`ps.view` saves bearing and pitch** (`b`, `p`, optional, so old saved views still load). A reload comes back at the same angle.

### Compass / reset button

- **Placement:** in the right-hand column, above the GPS button, styled like it.
- **The needle** shows the bearing and leans with the pitch.
- **Tap:** eases to north, flat (bearing 0, pitch 0) over 300 ms.
- **Visibility:** shown only while the map is rotated or pitched (|bearing| > 0.5° or pitch > 0.5°), like the native compass.
- **Accessibility:** `aria-label` "Reset to north and flat".

### Tools flatten the camera

- **On entry:** Draw, Combine and Split ease the pitch to 0 (300 ms), keeping the bearing. Pitch is locked while the tool is open: `touchPitch` off, and right-drag rotates only.
- **On exit (Done, Cancel or Esc):** they ease back to the pitch they started from.
  - **Exception:** if the user pitched during the tool by another route (the compass, the keyboard), that is kept.
- **Why flat:** corners, snapping (14 px) and the split handles are placed in screen space, and a tilted view distorts their spacing. The map stays rotated, because rotation doesn't.

## 5. Markers and taps on a tilted map (shared with step 15)

This is the contract step 15's pins follow (§5 of the 15 plan).

### DOM markers sit on the terrain

The **house bulls-eye**, the **search marker** and step 15's **site pins** are `maplibregl.Marker` DOM elements.

- **Placement:** in MapLibre 6, a marker's screen position comes from its `lngLat` and **the terrain's elevation there** when terrain is on. It sits on the ground, not at sea level under it.
- **Behind a ridge:** a marker hidden by terrain fades to `opacityWhenCovered` (MapLibre default 0.2). It stays tappable; see the next point.
- **13g verifies this rather than assuming it** (§7):
  - the marker element's centre lands within 2 px of `map.project(lngLat)`, flat and pitched with terrain;
  - when the view drops behind a ridge, the marker fades.

### A tap on a marker acts on the marker's own `lngLat`

- **Never an unprojected screen point.** For the bulls-eye, a tap selects the house layer. For step 15's pins, it re-evaluates at that site's stored `ll`. So tilt and exaggeration can never move where a pin evaluates.
- **Dragging the bulls-eye:** MapLibre sets the new position with its terrain-aware `unproject`, so the drop point is the ground under the finger. 13g checks a drag on a pitched map: the drop point's `lngLat` re-projects to within 2 px of the release point.

### A tap on the map (select a parcel, place a draw corner, the house, a split end)

- **Ground point:** this uses MapLibre's `e.lngLat`, which with terrain is the 3D-picked ground point (depth buffer), not the sea-level plane.
- **13g checks the round trip** for points across the parcel and a ridge, pitched 60° at 1.5×: `unproject(project(ll))` lands within 1 m of `ll`.

### The tools are flat anyway (§4)

Precise placement never happens on a tilted map, but the rule above holds either way.

## 6. Phones and frame rate

- **Measure first:** with everything on (terrain 1.5×, hillshade, contours, parcel lines), measure frame times during a scripted pan, rotate and pitch.
  - **Headless:** Chromium at 390×844 with 4× CPU throttling (CDP `Emulation.setCPUThrottlingRate`), using `requestAnimationFrame` deltas.
  - **Real device:** you check on the Vercel preview on your Android phone.
- **Report, don't decide:** the PR reports the median and 95th-percentile frame times, as 13f did. The phone defaults are already off (§4, Q2), so the numbers inform you rather than choose a default.

## 7. Files

| File | What |
| --- | --- |
| `components/Map/terrain.ts` | DemSource setup (once per page), the sources and layers for terrain, hillshade and contours, and `applyTerrainPrefs(map, prefs)`. Pure style functions, unit-tested like `style.ts`. |
| `components/Map/style.ts` | `glyphs`, the hillshade and contour layers in the order above, attribution |
| `components/Map/MapView.tsx` | `maxPitch: 80`, terrain prefs applied on load and on change, bearing and pitch in `ps.view` |
| `components/Map/MapControls.tsx` | the compass / reset button |
| `components/Map/InfoPanel.tsx` (+ `MapTools.tsx` if Q3) | the Terrain preview group |
| `components/Explore/useExploreController.ts` (or a small `useFlatForTools` hook) | ease flat on tool entry, restore on exit |
| `lib/client/prefs.ts` | `ps.terrain`, `ps.hillshade`, `ps.contours`; `ps.view` gains `b` and `p` |
| `public/fonts/Noto Sans Regular/0-255.pbf` | contour label glyphs |
| `app/globals.css` | compass, group styling |

**Untouched:** `lib/screen/**`, the goldens, `UserConfig`, schema v2.

**New dependency:** `maplibre-contour` (contours in a worker from the same Terrarium tiles; see §2).

## 8. Checks in the PR

- **Unit:**
  - the style functions: order, zoom thresholds, feet multiplier, labels only on majors;
  - the prefs codecs, including old `ps.view` without `b` and `p`;
  - `runKeys` ignores the terrain prefs.
- **Headless against `next start`, desktop and 390×844**, on Ferney Creek, flat and at pitch 60° / bearing 30°, terrain 1.5×:
  - **Tiles:** Terrarium tiles load (network); no CORS errors.
  - **Contours:** labelled majors at z15 (20/100 ft), 40/200 ft at z14, none at z12.
  - **Markers:** the bulls-eye's and search marker's element centres are within 2 px of `map.project(lngLat)`. Dragging the bulls-eye on the pitched map drops it at the release point (within 2 px).
  - **Taps:** the `unproject`/`project` round trip is within 1 m at 9 points across the parcel.
  - **Tools:** Draw, Combine and Split flatten on entry and restore on exit.
  - **Compass:** resets to north and flat, and hides when flat.
  - **Prefs:** toggles persist across reload. A kept screen shows **no** "earlier settings" note after toggling any of them.
  - **Frame times:** phone and desktop, all on (§6).
- **Screenshots:** flat and pitched, desktop and phone, with hillshade and contours.

## 9. §7b acceptance additions (phase-0.md)

- **Terrain:**
  - 3D terrain toggles on and off;
  - exaggeration 1× / 1.5× / 2×;
  - hillshade sits under the parcel lines;
  - contours in feet at the right zooms, with labels;
  - the "≈10 m preview" label is shown;
  - rotate and pitch by mouse and touch;
  - the compass resets to north and flat;
  - the tools flatten and restore;
  - the bulls-eye, search marker and site pins sit on the ground when pitched, and a pin taps to its own site;
  - toggling terrain never marks a screen out of date;
  - the phone frame rate is acceptable with everything on.

## 10. Decisions (owner, 2026-10-07)

1. **Q1 CSP:** not in 13g. Step 18 adds one with the full host list, checked by the e2e run.
2. **Q2 Defaults:**
   - 3D terrain off;
   - hillshade and contours **on on desktop, off on phones** (the sheet media query), regardless of the frame-rate result, because of z15 DEM tile data on cellular;
   - the toggles persist per device;
   - the PR still reports the frame-time numbers.
3. **Q3 Where the controls live:** Info › Layers **plus** the Map ▾ menu.
4. **Q4 If the contour plugin can't run on MapLibre 6:** terrain and hillshade ship in 13g, and contours become a follow-up.
