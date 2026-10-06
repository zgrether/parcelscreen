# Step 13f: map controls (plan)

Status: **approved (owner, 2026-10-06)**, with the answers in §7. It runs after 14b and before 14c–e.

## 1. Parcel lines from zoom 13.5, fetched by tile

**Today:** one request per service for the whole view, from zoom 14.5. It asks for `outFields=*`, full
geometry and up to 600 records.

**Proposed:**

- **Threshold:** `LINES_MIN_ZOOM` drops to **13.5**.
- **Tiles:** the view is covered by **zoom-14 XYZ tiles** (Web Mercator, about 1.95 km × 1.55 km at 37°N),
  and each service is queried once per tile.
- **Cache:** results go into a **per-tile session cache** keyed by `service | detail | z14/x/y`.
  - Memory only, nothing persisted.
  - Capped at 400 tiles, least-recently-used first.
  - Panning back, or zooming within the band, makes no new requests. Every request still goes through
    `lib/http`, so the per-host queue throttles it.
- **Overlaps:** a parcel crossing tiles is drawn once, deduplicated by `service | OBJECTID`.
- **Lighter requests:**
  - `outFields`: only the object id, the parcel number and the county code. That's VA
    `OBJECTID,PARCELID,FIPS`, NC `objectid,parno,stcntyfips`, TN `OBJECTID,PARCELID,COUNTY`.
  - `geometryPrecision=5`.
  - `maxAllowableOffset`, which is in degrees because `outSR` is 4326, set by detail level:

    | Zoom | Detail | `maxAllowableOffset` | Ground equivalent |
    | --- | --- | --- | --- |
    | 13.5–15 | coarse | 0.000025° | about 2.2 m east–west, 2.8 m north–south |
    | 15 and up | fine | 0.000005° | about 0.5 m |

    The two detail levels are cached separately.
- **Too many features in a tile** (`exceededTransferLimit`): page with `resultOffset`, up to 3 pages, at
  each service's own `maxRecordCount` (VA 2,000, NC 5,000, TN 2,000; all three support paging). Beyond
  that, the tile is marked incomplete. Its lines still draw, and the hint says "Some parcel lines didn't
  load here — zoom in."

**What a tap selects.** The outlines become display-only: they're simplified and carry almost no fields.
- **The full record:** a tap still picks the outline with `pickOutline`, the smallest one containing the
  point. Then one request fetches that parcel's **full record by `OBJECTID`** (all fields, full geometry)
  before it opens. Screening, acres, facts and the dedupe key always use the full record.
- **Add: Parcel** does the same.
- **Cost:** about one extra request per selection, a few KB.

### Measured (Floyd test area, centre 36.8895, −80.45455, zoom 13.5, VA service, 2026-10-06)

| Map width | z14 tiles | Today: one request for the view | Per tile, today's request | Per tile, proposed request |
| --- | --- | --- | --- | --- |
| Desktop (840 × 800 map) | 9 | 358 features, 425 KB | 707 features (609 unique, max 115 per tile), 962 KB | the same 707, **264 KB** |
| Phone (390 × 752 map) | 6 | 186 features, 212 KB | 546 features (483 unique), 673 KB | the same 546, **193 KB** |

- **Tiles cover more than the view:** whole tiles reach past its edges, so they bring in more features
  than today's single request. That's the price of the cache, and it pays off on the first pan.
- **Payload:** the lighter request cuts it by about 3.6×. The sizes are uncompressed JSON; the services
  gzip, so actual transfer is smaller.
- **No tile hit a limit** in this rural area. The PR re-measures with the implementation, at both widths,
  and reports counts, bytes and time to draw.

### Revised after 13f shipped (owner, 2026-10-06)

Zoom 13.5 pulled in up to about 11,400 outlines in a town view (Christiansburg), and the map redrew them
every frame as tiles arrived. Four changes:

- **Threshold:** parcel lines start at **zoom 14**.
- **Density guard:** below zoom 15, a tile with more than **1,500** parcels waits for zoom 15. Its count
  comes from a cached count-only request. The hint reads "Dense area — zoom in to see all parcel lines".
- **Redraws:** at most every **250 ms** while tiles arrive, plus one when the last tile lands. Each tile's
  outlines are prepared once.
- **Slider:** a rotated horizontal range, with the column 24 px in from the edge. The track is light amber
  from 14 to 15 and amber from 15.

## 2. Zoom slider instead of + / −

- **The +/− buttons go.** Pinch, scroll and keyboard zoom stay.
- **The slider:** a minimal **vertical slider** on the right edge, 180 px tall on desktop and 140 px on
  phones.
  - It's a real `<input type="range">` with `min=5 max=20 step=0.1`, `aria-label="Zoom"` and
    `aria-valuetext="Zoom 14.2"`. Keyboard arrows step by 1.
  - The thumb follows the map's zoom (updated on MapLibre's `zoom` event), however the map was zoomed.
- **Moving it:** dragging the thumb zooms live, and tapping the track jumps there; both are native range
  behaviour. Zooming keeps the view's centre.
- **Amber band:** the track is shaded amber from 13.5 up, where parcel lines show. The band comes from
  `LINES_MIN_ZOOM`, so it follows the constant.
- **Below zoom 5,** reached by pinching out, the thumb sits at the bottom.

## 3. The right-hand column, and Locate

- **Layout:** the right edge holds, top to bottom:
  - **Map ▾**, with the attribution in line, left of it, as now;
  - the **GPS button**;
  - the **zoom slider**.
- **The GPS button** is styled like the toolbar buttons: dark, a 36 px target, the crosshair icon.
  - MapLibre's `GeolocateControl` still does the work and draws the location dot. Its own button is
    hidden, and ours calls `trigger()`.
  - A failure still shows "Couldn't get your location".
- **Docked panel:** while the Info panel is docked on desktop, the column sits left of it at
  `right: panelInset + 10px`. The column moves; the map doesn't.
- **Phones:** the column sits mid-right, clear of the toolbar. The Info panel covers it while open.

## 4. Search

- **Collapsed:** the lat/lon field becomes a **search icon** at the top left, in the space the +/− buttons
  leave.
- **Expanded:** tapping it opens one input, 300 px wide on desktop, the full width less 16 px margins on
  phones, with grouped results below.
  1. **Coordinates:** parsed locally (`parseLatLon`), showing "Go to 36.8874, −80.45455".
  2. **Saved parcels:** History names that contain the text, case-insensitively. Choosing one opens it.
  3. **Parcel numbers:** from 3 characters, a **prefix match** within the counties in view.
     - The counties in view are the county codes in the loaded tiles for the current view.
     - One query per county per service, for example VA `FIPS='51063' AND PARCELID LIKE '52-4%'`, up to 8
       results, simplified geometry.
     - Choosing one fetches the full record by `OBJECTID`, opens it, and fits the map to it.
  4. **Places:** Photon, from 3 characters, biased to the map centre (`lat`, `lon`), up to 5 results.
     Choosing one flies there.
- **Requests:** debounced 300 ms, and a newer keystroke cancels the older requests. Everything goes
  through `lib/http`. Photon's fair use asks for exactly this restraint.
- **Accessibility:** the combobox pattern (`role="combobox"`, a `listbox` with group labels,
  `aria-activedescendant`); arrows move through the results and Enter picks one.
- **Closing:** Esc, or a tap outside, collapses it. Picking a result also collapses it.

## 5. Map menu toggles

Dim map, Parcel lines and Light pollution become **toggle buttons**:
- `aria-pressed`, with a filled background when on and an outline when off;
- labels without "on/off" text.

The basemap stays a select.

## 6. PRs (each with phone and desktop screenshots)

1. **13f-1, parcel lines:** tiles, the cache, the lighter requests, paging and the incomplete hint, the
   full record by `OBJECTID` on select, and zoom 13.5. Comes with the measurements.
2. **13f-2, controls:** the zoom slider, the right-hand column, the GPS button, and the menu toggles.
3. **13f-3, search.**

## 7. Decisions (owner, 2026-10-06)

1. **Order:** 14b, then 13f-1…3, then 14c–e.
2. **Slider range:** zoom 5–20.
3. **Parcel numbers:** a prefix match after normalizing separators, so "52-47A", "52 47A" and "5247A" are
   the same query.
4. **Fine detail:** 0.5 m display geometry from zoom 15.

The questions, as asked:

1. **Order:** 14b is approved to start now that 14a has merged. Proposed: **14b, then 13f-1…3, then
   14c–e**, so the map work lands before the results panel moves into the explorer (14d). Or 13f first?
2. **Zoom range** for the slider: 5–20? *Recommended.*
3. **Parcel-number match:** a prefix (`LIKE '52-4%'`, which can use the services' indexes) or anywhere in
   the number (`LIKE '%52-4%'`, slower)? *Recommended: prefix.*
4. **Fine detail at zoom 15 and up:** 0.5 m, or the services' full geometry? *Recommended: 0.5 m.* It's
   invisible on screen, and a selection fetches full geometry anyway.
