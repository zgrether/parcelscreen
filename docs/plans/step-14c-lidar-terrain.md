# Step 14c: Lidar terrain (plan)

Zach's brief, 2026-10-25, pre-approved: one PR straight into main, touching only the map and Map layers. He reviews
this plan and the PR together. Any conflict with the UX redesign (`step/ux2`) is resolved when either lands.

## 1. Scope

**Map layers › Lidar terrain.** USGS 3DEP's elevation image service (The National Map, `3DEPElevation/ImageServer`),
drawn server-side by USGS's own `exportImage` in one of two styles:
- **Shaded relief:** the service's multidirectional hillshade. It shows old roadbeds, benches, house sites and
  drainages that the 10 m terrain preview smooths away.
- **Slope:** the service's slope in degrees, classed and coloured by the app's own slope bands. These are
  `SLOPE_BANDS` (`lib/render/surface.ts`): up to 15%, 25% and 40% grade, then steeper, in green, yellow, orange and
  red. The surface legend draws the same bands, and Map layers shows them under the switch.

Its controls:
- **Off by default.** The style switch defaults to Shaded relief.
- **An opacity slider,** 20–100%, starting at 60%.
- **Shown from zoom 13 up.** Below that, the map's hint reads "Zoom in to see lidar terrain", as parcel lines do.
- **Remembered per device** (`ps.lidar`, a device key like Power lines), never part of a run's settings.
- **In 3D:** the layer drapes over the 3D terrain, as every raster layer does.
- **The info line under the switch:** "1 m lidar where available. Terrain: USGS 3D Elevation Program (lidar)". The
  map's attribution carries the second half while the layer is on.

**How the tiles are made.**
- MapLibre asks `exportImage` for each tile's own box: a raster source with a `{bbox-epsg-3857}` template, 256 px,
  `imageSR` 3857, PNG.
- The style is the request's `renderingRule`:
  - **Shaded relief:** `{"rasterFunction":"Hillshade Multidirectional"}`, a function the service publishes.
  - **Slope:** the published `Slope Degrees`, then `Remap` into the four bands (8.53°, 14.04°, 21.80°: the bands'
    grades as degrees), then `Colormap` in their colours.
- **No proxy route and no new dependency.** The browser loads the tiles as it loads the aerials, so `lib/http.ts`
  isn't involved: it's the engine's client, and MapLibre fetches map tiles itself, as for every basemap.
- **A failed tile** shows one hint per visit, "Lidar terrain tiles didn't load", as the terrain preview does.

**Stacking:** above the basemap and the 10 m hillshade, below the light-pollution overlay, the scrim and everything
drawn over the parcel. The aerial, then lidar terrain, then the app's lines.

## 2. Numbers

None change. No engine, grade, schema or `expected.json` change.

## 3. The speed measurement, and the fallback

`scripts/lidar-tiles.mts` requests the tiles one phone screen needs (375 × 812, about 2 × 4 tiles plus the edge) at
zooms 13–17, over Mud Creek, Macks, Ferney and Roan, in both styles. For each zoom it reports:
- the median and slowest tile time;
- whether every answer is a PNG (not an ArcGIS error JSON);
- the bytes a screen of tiles weighs.

The script runs from CI on this PR, since this cloud session's network policy doesn't reach USGS's hosts. Its
results go in the PR description.

**If tiles regularly take more than about 1.5 s,** the PR compares pre-rendered lidar hillshade tile services for VA,
NC and TN (VGIN, NC OneMap, USGS's cached tiles) by resolution, coverage, terms and speed, and recommends one.
Switching to it is then a one-line source change, for Zach to approve.

## 4. UX

- **The main flow, in the fewest steps:** Map layers › Lidar terrain (one tap). Shaded relief shows at once at zoom
  13 and up; the style switch and the opacity sit right under the toggle.
- **What's seen first:** the ground itself. The info line says what it is and where it's from.
- **States:**
  - **Below zoom 13:** the hint "Zoom in to see lidar terrain".
  - **Loading:** tiles fade in, as the aerials do.
  - **A failed tile:** one hint per visit.
  - **No lidar coverage:** the service answers with transparent tiles, so the aerial shows through. The info line
    says "where available".
- **Labels:** "Lidar terrain", "Shaded relief" and "Slope". The slope bands show with their grades (15%, 25%, 40%),
  as the surface legend has them.
- **Phone at 375 px:**
  - the toggle, the two-way switch and the slider in Map layers' list, each 44 px tall;
  - the slider is a native range input.
- **Contrast and consistency:**
  - the same toggle row style as Power lines and Light pollution;
  - the switch as the Exaggeration control's segmented buttons;
  - the slope colours are `SLOPE_BANDS`' own.

## 5. Terms

USGS 3DEP data is public domain, a work of the U.S. Government, with no restriction on use, display or caching. USGS
asks for credit: "Terrain: USGS 3D Elevation Program (lidar)". It's added to `docs/commercial-review.md`'s sources.

The image service is a shared public endpoint with no stated rate limit, so the layer asks only for tiles in view.

## 6. Tests

- **Unit:**
  - the tile URL for each style;
  - the slope rule's breaks, from `SLOPE_BANDS` (8.53°, 14.04°, 21.80°) and its colours;
  - the prefs' defaults and saving.
- **e2e (`e2e/lidar.spec.ts`):**
  - Map layers › Lidar terrain at zoom 12: the hint shows, and no tile is asked for;
  - zoomed to 14: tiles are asked for with the relief rule and the zoom's box;
  - Slope: the slope rule;
  - the opacity slider sets the layer's opacity;
  - off: no more requests;
  - after a reload: still on, with its style and opacity.

  The service is answered by a recorded PNG, since the session can't reach USGS.
- **Screenshots** at 1280 and 375: Mud Creek in both styles, flat and in 3D, with the red-gate line drawn. These
  need the live service, so they're taken where it can be reached (CI or a session that allows the host).

## 7. Stop conditions

- The service refuses the slope chain (a published-function-only server). Then the slope style uses the published
  `Slope Map` with its own colours, and the legend says so: a product decision for Zach.
- Tiles are too slow and no pre-rendered service covers all three states.

## 8. Follow-up 57

`docs/plans/phase-0.md` §6 notes that this layer makes follow-up 57 (snap drawn lines to lidar roadbeds) practical:
a drawn line can be checked against the roadbed by eye, and the snap's result drawn over it.
