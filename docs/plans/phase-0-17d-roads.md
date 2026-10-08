# Step 17d: roads and labels over the imagery (plan)

Status: **draft, for approval.** A small step before 18b (owner, 2026-10-08): road lines and road names over the imagery, plus place names at low zoom, from OpenFreeMap's vector tiles. It's map display only: there are no changes to `lib/screen`, the goldens are untouched, and the toggle is a UI pref.

## 1. The source, verified (2026-10-08)

- **The endpoint:** `https://tiles.openfreemap.org/planet` (TileJSON).
  - It names the current versioned tile set: `…/planet/20261004_113936_pt/{z}/{x}/{y}.pbf`.
  - Zooms 0–14; MapLibre overzooms past 14.
  - It uses the OpenMapTiles schema; the layers needed here are `transportation`, `transportation_name` and `place`.
  - The style points at the TileJSON URL rather than a pinned tile URL, so a new planet build is picked up without a change here. That costs one small request per page load, cached for a day.
- **CORS:** `access-control-allow-origin: *` on both the TileJSON and the tiles. The tiles are `Cache-Control: max-age=315360000`, a 10-year immutable cache.
- **Terms** (openfreemap.org and /tos):
  - free;
  - no limits on map views or requests;
  - no registration, no API keys, no cookies;
  - attribution required;
  - "as-is", no warranty;
  - may be discontinued without notice;
  - the integrator must be 18 or older.

  I found nothing against this use. The discontinuation clause shapes §6: an outage must leave the app working, just without the overlay.
- **Attribution:** "© OpenMapTiles © OpenStreetMap contributors", as you specified, linked to openmaptiles.org and openstreetmap.org/copyright. The terms say crediting OpenFreeMap itself is optional ("nice if you do"); I'd add it, see §7 Q3.
- **Size:** tiles at the Ferney Creek point were about **5.0 KB at z12, 7.6 KB at z13 and 5.0 KB at z14**, as fetched. Each tile carries every OpenMapTiles layer, including buildings, landuse and water, and a client can't ask for roads only. So the data cost is whole tiles; §5 measures it.

## 2. What's drawn (new module `components/Map/roadsStyle.ts`, like `terrainStyle.ts`)

**One vector source, `roads`, and four layers:**
1. **`roads-casing`:** a light casing (white at about 0.5 opacity), a little wider than the line. It's what makes roads read over dark ortho.
2. **`roads-line`:** the road itself.
   - It shows OpenMapTiles' `transportation` classes `motorway` and `trunk` (your "highway"), `primary`, `secondary`, `tertiary`, `minor`, `service` and `track`.
   - Paths, rail, ferries and the rest are left out.
   - Width grows with class and zoom. The colour is warm for highway and primary and pale for the rest, to be set by eye on the state ortho and checked against the other aerials.
   - **Tracks are dashed** (their own layer, `roads-track`, since a dash can't vary per feature).
   - Tunnels are drawn faint.
3. **`roads-names`:** names along the line (`symbol-placement: line`) from `transportation_name`.
   - The text is `name:latin`, falling back to `name`.
   - White text with a dark halo, in Noto Sans Regular, from z13.
4. **`places`:** `place` names (`city`, `town`, `village`, `hamlet`) at low zoom.
   - Cities and towns from z7, villages from z10, hamlets from z12.
   - All of them end at z15, where the parcel work is: "at low zoom", by my reading, which is §7 Q4.

**What isn't drawn:** no background, water, landuse, building or POI layers.

**With terrain on,** the line layers drape on the terrain, which MapLibre does for any line layer, and the labels sit on it.

## 3. Stacking

From the bottom, with the new layers in **bold**:

```
basemap imagery
hillshade (terrain on)
light-pollution overlay, dim scrim
the step-15a surface image (the run's house/garden/slope image)
**roads-casing, roads-track, roads-line**
soil fills (15c)
contours (13g)
county parcel lines
soil outlines, saved and selected parcels, the horizon fan, the driveway, the circles (15b–c)
split, combine and draw tools
**roads-names, places**   (the top of the map's own stack)
DOM markers: site pins, house bulls-eye, Stand here (always above the map's layers)
```

- **The roads sit above the dim scrim and the light-pollution overlay,** so they stay readable when the imagery is dimmed. They sit below the soil fills, as one of the step-15 overlays you listed.
- **`SurfaceLayer` changes one line:** its `beforeId` becomes `roads-casing`, so the surface image added at run time stays under the roads. Today it inserts just below the soil fills, which would put it above them.
- **The labels go at the top of the map's own stack,** above the parcel lines and the step-15 overlays, and below the DOM markers. §7 Q1 confirms that's what you meant.

## 4. Labels, glyphs and the toggle

- **Glyphs.** The style declares `glyphs: "/fonts/{fontstack}/{range}.pbf"` always, not only when terrain is on.
  - Only `Noto Sans Regular/0-255.pbf` is hosted; Basic Latin and Latin-1 cover US street and place names.
  - **The check:** record which glyph ranges MapLibre asks for while panning Floyd, Ashe and a TN parcel. Add a range, from the same source and licence (`public/fonts/README.md`), only if street names need it.
  - A missing range just skips that character.
- **The toggle:** **"Roads & labels"** in the Map ▾ menu, beside Dim map, Parcel lines and Light pollution, and the same row in Info › Layers.
  - It's on by default, a UI pref **`ps.roads`** in `lib/client/prefs.ts`. It's not `UserConfig` and not a run param.
  - It switches the four layers' visibility, so tiles already fetched stay cached.
- **The basemaps:** see §7 Q2. I propose drawing over the three aerials only. Topo (USGS) and Streets (Esri) already draw roads and names, so there the toggle shows as unavailable ("in the basemap").

## 5. Phone check: frame rate and data

**Emulated** at 390 × 844 with Chromium's CPU throttled 4×, on the production preview. Terrain, contours and roads are all on, and the map is pitched. The same scripted pan and rotate runs with roads off and on. I'll report:
- frame rate, from `requestAnimationFrame` (median and 5th percentile);
- tile bytes per host over the path (`tiles.openfreemap.org` against the ortho, terrain and contour hosts);
- tile requests per view.

**Real-phone numbers** need your phone. I'll add them to the §7b line for your Android pass.

## 6. Failure, attribution, tests

- **When OpenFreeMap doesn't answer,** the roads just don't draw. MapLibre logs the failed tiles, but there's no page error, no hint, and nothing else is affected. Tested by aborting the host in Playwright.
- **The attribution** comes from the source's `attribution`, so MapLibre shows it with the others.
- **Unit test (`roadsStyle.test.ts`):**
  - the classes drawn and left out;
  - tracks on the dashed layer;
  - the labels' zoom ranges;
  - the layer order (roads between the surface image's slot and the soil fills, labels last).
- **The e2e:** unchanged. Its replay aborts non-data hosts, and `tiles.openfreemap.org` joins the aborted-hosts list it reports.
- **The §7b line** (in `phase-0.md`): "Roads & labels over the aerials:
  - roads read over the dark ortho;
  - tracks dashed;
  - road names and low-zoom place names;
  - the toggle in Map ▾ and Info › Layers persists;
  - roads drape with terrain on;
  - the phone's frame rate is acceptable with terrain, contours and roads on."

## 7. Open questions

1. **Label stacking:** "above parcel lines but below DOM markers". I read it as the top of the map's own stack: above the parcel lines, the soil outlines, the fan and the driveway. Or do you want labels just above the county parcel lines and **under** the selected parcel, the fan and the driveway?
2. **Basemaps:** roads over the three aerials only, with the toggle shown as unavailable on Topo and Streets, which already have roads? Or over all five?
3. **Credit OpenFreeMap too?** "OpenFreeMap © OpenMapTiles © OpenStreetMap contributors". It's optional by their terms.
4. **Place names:** visible from z7 (cities and towns) and hidden from z15 up. Or keep them at every zoom?
5. **Road label zoom:** from z13. Or from z12?

## 8. Files

- **New:** `components/Map/roadsStyle.ts` and its test.
- **Changed:**
  - `components/Map/style.ts`: the source, the four layers, `glyphs` always;
  - `components/Map/results/SurfaceLayer.tsx`: `beforeId`;
  - `components/Map/MapTools.tsx` and `components/Map/InfoPanel.tsx`: the toggle;
  - `lib/client/prefs.ts`: `ps.roads`;
  - `docs/plans/phase-0.md`: the §7b line and the step row;
  - possibly `public/fonts/` (§4).
- **Not changed:** `lib/screen/**`, the goldens and `UserConfig`.
