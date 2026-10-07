# Step 15: result overlays on the map (plan)

Status: **approved (owner, 2026-10-07), with the changes in §9.** It covers step 15 of `phase-0.md` §6:

- the terrain image and the overlay cycle;
- DOM pins with tap-to-evaluate;
- the horizon fan with hover text;
- soil units, trailheads, and the driveway (B1 fixed).

It assumes step 13g has landed, so **3D terrain may be on and the map may be pitched**. Line numbers (L…) refer to `legacy/parcelscreen.html`, the 2026-10-04 build.

## 1. What the prototype draws

| Overlay | From | Look | Interaction | Proto |
| --- | --- | --- | --- | --- |
| **Terrain image** | session: `surfaces`, `labels`, `inside`, `slope`, the fine-DEM grid | one pixel per 3 m cell, layer opacity 0.9. **House map:** best bench `(20,80,45,220)`, other benches `(31,110,60,190)`, shelves `(70,120,150,170)`, else `heat(house)`. **Garden map:** patches `(10,120,110,220)`, else `heat(garden)`. **Slope map:** four bands of tan(slope) | the cycle button: house → garden → slope → off, saved in `ps.omode` | L1208–1231, L540 |
| **Site pins** | `R.sites`, `R.shelves`, `R.gardens[0..2]`, `R.excluded` | 26 px DOM circles: `1…` (#1 inked), `S1…` blue, `G1…` teal, `✕` red | tap a site, a shelf or ✕ → `setFocus` (sun, sky, driveway re-evaluated). Gardens: tooltip only | L1185–1193, L109–113 |
| **Evaluation point** | `R.focus` | ring r 9, white 2 px, dark fill 0.35 | — | L1240 |
| **Horizon fan** | session: `horizon[].rc` (ridge cell on the wide DEM), `decAltByAz`, `canopyDeg` | rays at 90–270° every 10°: red `#e0553f` 2.5 px where the ridge blocks the sun, white 1 px where it clears; dark halo | hover: "`az`° (`SSE`): skyline `a`° up, sun `s`° — blocked/clear" | L1232–1243 |
| **Soil units** | `R.soilUnits[].geometries`, colour by index | white halo 4 px; coloured dashed 2.5 px (`6 4`); fill 0.14 | hover: "`muname` — `acres` ac" | L1202–1207 |
| **Trailheads** | `R.near.trailheads` | green dots r 5 | hover: name | L1129 |
| **Driveway** | `R.driveway`: entrances, ≤2 routes, culverts, direct track | **E1… pins** yellow. **Recommended route:** yellow 3 px on a 5 px halo. **Second route:** grey dashed. **Culverts:** blue dots. **Direct 4×4 track:** red dotted | hover text per item | L1402–1408 |

- **Not drawn by the prototype:** hospitals, groceries, any 2D sun path.
- **The bulls-eye** (house) already exists in the port (13e).

## 2. What can be drawn from where

| | From a **live run** (worker session) | From a **kept result** (IndexedDB, after a reload or from History) |
| --- | --- | --- |
| Pins, evaluation point, soils, trailheads, driveway | ✓ | ✓ (all in `ScreenResult`) |
| Terrain image | ✓ (`view`: surfaces, labels, grid) | ✗: session-only, never persisted |
| Horizon fan | ✓ (`view.horizon[].rc`, `decAltByAz`) | ✗: `sun.profile` has no ridge distances |
| Tap a pin to re-evaluate | ✓ (`evaluateAt` on the session) | ✗: pins are drawn but inert, with a tooltip ending "Run again to evaluate here." |

This matches the 14d note, now "Run again to restore the map overlays and horizon fan." (17a dropped "and 3D view": the ground viewer needs no session.) Kept results get every overlay they can.

## 3. Structure

- **`lib/render/` (new, pure, no DOM):** these run in Node tests.
  - `terrainImage.ts`: the RGBA for each mode from `SessionView`, plus the image's four corners;
  - `fan.ts`: GeoJSON rays with their tooltip text;
  - `resultGeo.ts`: GeoJSON for soils, trailheads and the driveway, with their tooltip text.
- **`components/Map/results/`:**
  - `useResultLayers.ts`: adds and updates the sources and layers from the shown result and the live view;
  - `ResultPins.tsx`: the DOM pins;
  - `SurfaceButton.tsx`: the right-hand column cycle button;
  - `tooltip.ts`: one MapLibre popup used for hover and for tap.
- **The terrain image** is an `image` source placed by the grid's **four UTM corners**, converted to lon/lat. The prototype stretched the UTM raster into a north-up lat/lon box, a few metres off across a parcel (§6, deviation D1).
  - The canvas is turned into a blob URL in the component, since `lib/render` stays DOM-free.
  - Three modes are cached per run.
- **`useScreenIt` exposes `view` and `evaluateAt`.**
  - **Bug to fix first:** today the keep-effect would store an `evaluateAt` update as a new screen and raise the phone sheet. Re-evaluations are told apart from runs and house moves, and **are not kept** (Q1).
- **An unsaved evaluation is labelled** (Q1). While the shown evaluation point differs from the kept screen's:
  - the **December sun**, **Dark skies** and **Driveway** sections carry "Evaluated at `label` — not saved. Run again or move the house to keep it." This is panel chrome above those sections; the blocks stay pure;
  - **Copy summary** includes the same line.

  A reload goes back to the run's own evaluation point, with no label.
- **Clearing:**
  - Overlays belong to the open parcel's shown result.
  - Opening another parcel shows that parcel's kept overlays (or none). The prototype kept the old run's overlays on a new parcel, and its overlay button could bring back a stale image (a latent bug, not ported).
  - A new run clears and redraws them step by step: soils after the soils step, trailheads after near, pins after rank, the driveway after the driveway step. The terrain image and the fan arrive with the run's `view` at the end (the worker posts `view` only on done; deviation D2).

### Stacking order (with 13g)

Owner, 2026-10-07:

basemap < hillshade < light pollution < scrim < **terrain image** < **soil fills** < contours < parcel lines < **soil outlines** < the parcel outline < **horizon fan** < **driveway** (direct track, second route, recommended route) < **circles** (culverts, trailheads, the evaluation ring) < DOM markers (**pins, E#, bulls-eye**).

- **Contours sit above the terrain image and the soil fills,** so they stay readable with every surface mode on.
- **The soil outlines and the parcel outline sit above the parcel lines,** so the boundary always reads.
- The prototype's terrain image likely drew over its vector paths; ours doesn't.

### Controls

**An "Analysis" group in Info › Layers,** under the parcel (`layers.ts` already reserves it; L7–8):

| Row | Control |
| --- | --- |
| **Surface** | segmented House / Garden / Slope / Off (`ps.omode`, default House) |
| **Pins** | eye toggle |
| **Horizon fan** | eye toggle |
| **Soil units** | eye toggle |
| **Trailheads** | eye toggle |
| **Driveway** | eye toggle |

- **What's saved:** the toggles are UI prefs (`ps.overlays`), like 13g's, and never touch a screen's keys.
- **Rows without a session:** a row with nothing to draw from a kept result (Surface, Horizon fan) shows "run again to show".
- **A one-tap surface button in the right-hand column** (Q2), styled like the GPS button. It cycles House → Garden → Slope → Off (`ps.omode`), the prototype's `#btn-omode`.
  - It's shown **only when a live result has a surface to draw** (a session `view`). After a reload or from History it's hidden.
  - Its icon shows the current mode, with an `aria-label` like the prototype's label: "Overlay: house suitability".
  - The Layers row and the button share `ps.omode`.
- **The help keeps the prototype's sentences:** "The overlay button on the map cycles…", and the Terrain section's "Cycle the overlay button on the map…". They're still true, since the button is on the map. They'd be reworded only as far as the button's new position requires, and it needs none.

## 4. Interaction

- **Hover (desktop):**
  - the fan rays, soil units, trailheads, the driveway, culverts and the E# pins show the prototype's text in a tooltip that follows the pointer;
  - the pins use their own `title` and a tooltip.
- **Tap (touch), D4:** there is no hover, so:
  - **lines and dots** (fan rays, the driveway, culverts, trailheads): a tap within 12 px shows the tooltip;
  - **a soil unit** shows its tooltip only on a tap inside the parcel when no line or dot is within 12 px;
  - a tap on the map still selects parcels when it lands on none of these.

  Today a tap inside the open parcel does nothing new (it's already selected), so nothing is lost.
- **Tap a pin (live session):**
  - **What it calls:** `evaluateAt(pin.ll, label)` with the prototype's labels: "site #2", "shelf S3", "the excluded bench".
  - **While it runs:** the hint says "Evaluating `label` — routing the driveway…" (L1280).
  - **When it lands:** the fan, the evaluation ring, the driveway and the report's sun, sky and driveway sections update.
- **The bulls-eye** keeps 13e's behaviour (a tap selects the house layer; dragging re-assesses the house).
  - *As built (15b):* a bulls-eye tap still selects the house layer, and when an unsaved evaluation at a pin is showing it also takes the evaluation back to the house, as the prototype's tap did (L641). There's no separate "Evaluate here" action (D5).

## 5. On a tilted map (agrees with 13g §5)

### Draped

The terrain image, soil fills and outlines, fan rays, driveway lines and the evaluation ring are MapLibre `raster`, `fill`, `line` and `circle` layers.

- **With terrain on:** the image, fill and line layers are rendered into the terrain texture, so they **lie on the ground**. A fan ray runs over the land to its ridge, as it physically does.
- **Circles** (culverts, trailheads, the ring): `circle-pitch-alignment: map`, so they lie flat on the slope rather than facing the camera.

### Pins

The pins (site, shelf, garden, ✕, E#) are DOM `maplibregl.Marker`s, like the bulls-eye: **the same mechanism 13g verifies**.

- **Placement:** they sit at the terrain's elevation at their `ll` and fade when a ridge hides them.
- **A tap evaluates at the pin's stored `ll`, never at an unprojected screen point.** That holds wherever the pin is drawn, and however tilted or exaggerated the view is.
- **Hidden pins stay tappable:** a pin behind a ridge (faded) still evaluates its own site, which is the right answer for that site.

### Tooltips on draped features

These use MapLibre's `queryRenderedFeatures` at the pointer, which is terrain-aware. The hover on a pitched ray is the ray under the pointer.

### Tools

Draw, Combine and Split flatten the camera (13g §4). No overlay interaction happens while a tool is open; the pins hide during tools, as the prototype's draft would have them.

## 6. Deviations from the prototype

- **D1:** the terrain image is placed by its UTM corners, not stretched into a lat/lon box.
- **D2:** the image and the fan appear when the run finishes, not mid-run. The worker posts `view` only on done; posting the large rasters at each step would cost more than it's worth.
- **D3:** the surface also has a row in Info › Layers, beside the map button.
- **D4:** tooltips also open on tap, for touch.
- **D5:** a bulls-eye tap evaluates at the house only when an unsaved evaluation is showing (otherwise the house is already the evaluation point, or the run was made without it); it also selects the house layer, as since 13e.
- **D6:** overlays follow the open parcel; the prototype kept the last run's overlays on a new parcel.
- **D7 (owner, after 15a; widened after 15c):** once the parcel has a screen result (a run under way, or a kept or evaluated result), its amber fill goes clear and its outline stays, so the fill doesn't tint the surface, soils or anything else drawn over it. It comes back when the result is stale (the boundary changed) or there's none.
- **D8 (15b):** a fan ray's text shows on a tap within 12 px on touch screens, picking the ray nearest the finger; such a tap doesn't close the parcel. Pins don't say "Run again to evaluate here." while a run is under way.
- **D9 (15c):** a tap inside the open parcel used to close it (13e, `decideTap`; §4 above assumed it did nothing). With the soil units shown, that tap now shows the unit's name instead, and the parcel stays open; a tap outside still closes it. With Soil units hidden, the 13e behaviour is back.
- **D10 (15c):** the driveway's direct 4×4 track is drawn under the routes, the recommended route on top (§3's order). The prototype drew the direct track last, over them.
- **D11 (15c):** pins and entrance pins listen for hover only on devices that hover. On touch screens the emulated mouse events after a tap hid the tip the tap had just shown.

## 7. Tests: each overlay flat and pitched

### Pure (`lib/render`, Node, against the goldens and recorded sessions)

- **Terrain image:** the RGBA for each mode equals the prototype's own pixel functions (`heat`, the house/garden/slope rules, extracted from L1209–1221 as an oracle) on the replayed run's session arrays. The four corners round-trip through UTM to 1 cm.
- **Fan:** the ray set (90–270° every 10°, skipping the rays without a ridge or sun) and each tooltip string equal the prototype's for the golden session.
- **Soils, trailheads, driveway:** the features and tooltip strings equal the prototype's templates on both goldens and the house run. B1: the driveway, entrances and culverts are present.

### Live (headless against `next start`, a real run on Ferney Creek, desktop and 390×844)

Each overlay is checked in **two cameras**:

- **(a) flat:** pitch 0, terrain off;
- **(b) pitched:** pitch 60°, bearing 30°, terrain on at 1.5×.

| Overlay | How it's checked in both cameras |
| --- | --- |
| Terrain image | For three cells (the best-bench centroid, a shelf cell, a low-score cell), the screenshot pixel at `map.project(cell centre)` matches the cell's colour composited at 0.9 over the basemap pixel there with the layer hidden (within ΔE 6). Each mode switches. |
| Soil units | For each unit, `map.project` of an interior point, then `queryRenderedFeatures(point, {layers: soil})`, returns that unit. Hover or tap shows "`muname` — `acres` ac". |
| Horizon fan | For 3 rays (one blocked, two clear), the projected midpoint queries back to that ray. Its tooltip text and its red or white colour are right. |
| Driveway | The projected midpoint of each route and of the direct track, and each culvert, query back to their feature. B1: present. Tooltips match. |
| Trailheads | Each projected trailhead queries back to its dot (those in view). |
| Pins | Each pin element's centre is within 2 px of `map.project(ll)`. A tap on pin #2 re-evaluates, and the result's `focus.ll` equals site #2's `ll` exactly, in both cameras. The fan and driveway redraw from the new point. |
| Map tap vs. drape | At the pins' `ll`s, `unproject(project(ll))` lands on the same screen pixel (13g measured 0 px; metres mislead where a ridge hides the point). That is, what's drawn at a spot and what a tap there reads agree, pitched or not. |
| Contours over each surface | With House, Garden, Slope and Off in turn, a contour line's projected midpoint queries back to the contour layer, and the screenshot pixel there differs from the surface's colour (the line is visible on top). |
| Surface button | Hidden with no live result. It cycles House → Garden → Slope → Off and matches the Layers row. |

- **Kept result after a reload:** the pins, soils, trailheads and driveway are drawn, and the Surface and Fan rows say "run again to show". A pin tap shows its tooltip with "Run again to evaluate here." and nothing else.
- **Unsaved evaluation:**
  - after a tap on pin #2, the sun, sky and driveway sections show "Evaluated at site #2 — not saved. Run again or move the house to keep it.", and Copy summary includes it;
  - **no new screen is kept** (`screenIds` unchanged);
  - **after a reload** the report is back at the run's own point, with no label.
- **Screenshots** of every overlay, flat and pitched, desktop and phone.

## 8. PRs

1. **15a:** `lib/render` + the terrain image + the surface button + the Analysis group + `useScreenIt` exposing `view`/`evaluateAt`, with the keep-effect fix.
2. **15b:** pins + tap-to-evaluate (not kept, with the "Evaluated at … — not saved" label and Copy summary line) + the evaluation ring + the horizon fan + the tooltip helper.
3. **15c:** soil units, trailheads, the driveway (B1), and the touch tooltips for them.

## 9. Decisions (owner, 2026-10-07)

1. **Stacking:** contours go above the terrain image and soil fills, and below the parcel outline (the order in §3). The checks include contours visible with each surface mode on, flat and pitched (§7).
2. **Q1 Re-evaluations:** pin re-evaluations are **not kept**.
   - While the shown evaluation differs from the kept screen's, the sun, sky and driveway sections carry "Evaluated at `label` — not saved. Run again or move the house to keep it.", and Copy summary includes it.
   - A test checks that a reload goes back to the run's own point with no label.
3. **Q2 Surface control:** a one-tap cycle button in the right-hand column (House → Garden → Slope → Off), shown only when a live result has a surface to draw, **plus** the Layers row.
   - D3 covers only the added Layers row.
   - The prototype's "overlay button on the map" help sentences are kept.
4. **Q3 Hospitals and groceries:** not drawn in Phase 0.
