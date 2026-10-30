# Tennessee's own-records counties: parcels from the county

Zach pre-approved the brief on 2026-10-30. The Comptroller's public-use parcel layer leaves out nine counties:
Chester, Davidson, Hamilton, Hickman, Knox, Montgomery, Rutherford, Shelby and Williamson
([Parcel Data](https://comptroller.tn.gov/office-functions/pa/gisredistricting/redistricting-and-land-use-maps/parcel-data.html)).
Each keeps its own records. The goals:
- Hamilton first, then Knox: each county's own public parcel service as another parcel source beside the state's,
  with the same tap-to-select, parcel-number search and record fields.
- The other seven only if they're trivially similar; otherwise they're listed as not covered.
- Where there's no source, the map's message names the county and suggests Draw a custom parcel.

**How it runs:** a small mission on `step/tn-counties`, branched from main. It runs alongside step 17 (owner). I merge
each PR into the step branch when CI is green; the hand-back to main is Zach's.

## 0. What's there, and what was found (filled in from the probe)

**In the app:**
- **Parcel sources** are ArcGIS layers listed in `endpoints.parcels` (`lib/screen/config.ts`). Their field names live in
  `lib/geo/parcelFields.ts`: the outlines' three fields, the full record's fields, and the search method.
- **Every source is asked for every map tile.** A county source should only be asked where its county is; the nine
  counties' outlines are already in `lib/geo/data/tn-own-records.json`.
- **The hint:** over one of the nine, the map now says "No Tennessee parcel lines here; this county keeps its own
  records. Draw the boundary instead." (`lib/geo/ownRecords.ts`), with a Draw button.

**What the probe found** (round 1, CI's runners, 2026-10-30; `test/tools/tn-counties-probe.test.ts`):
- **Hamilton:**
  - **The service:** `https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer`, with two layers both
    named "Parcels" (0 and 1). It also lists `Live_RealProperty` (a 2015 snapshot) and `Live_Assessor`.
  - **The layer:** answers JSON and GeoJSON, `maxRecordCount` 1000, capabilities Map, Query, Data.
  - **CORS:** it sends `Access-Control-Allow-Origin` for the app's origin, so the browser can ask it directly, as it
    asks the states'.
  - **Fields, in the state layer's shape:**
    - the parcel's identity: `GISLINK`, `MAP`, `GROUP_`, `PARCEL`, `TAX_MAP_NO`;
    - the record: `OWNERNAME1`, `ADDRESS`, `CALCACRES`, `LEGALDESC1`, `PARCEL_TYP`;
    - `RecordsOnl` ("RecordsOnlineLink"), the assessor's own record.
    - The layer also holds mailing addresses, sales and values, which the app never asks for.
  - **Terms:**
    - The Assessor of Property's site is "a service to the public for informational purposes only", use at your own
      risk, with an indemnity for "any violation of these terms".
    - The county GIS site's disclaimer is about accuracy.
    - Neither forbids this use, and neither asks for a key.
- **Knox (KGIS): stop.**
  - Its ArcGIS server (`www.kgis.org`, `kgis.org`, `maps.kgis.org`) answers 401: it needs a login.
  - Its disclaimer says the data was prepared "for their internal purposes only, and was not designed or intended for
    general use by members of the public".
  - It also says "no portion of the products or databases on this Web Site may be reproduced in any form or by any
    means without the express written authorization of the KGIS Policy Board". Digital data is licensed for a fee.
  - Under the brief, Knox stops here, and is listed as not covered.
- **Round 2** compares the two Parcels layers and finds the Worley Road and Three Gorges lots in the county's own data:
  Nominatim found no "Worley Road, Soddy-Daisy".

## 1. The work, by PR

| # | PR | What |
|---|---|---|
| 0 | This plan, and the probe | The probe's findings go into §0 |
| 1 | Hamilton | The county's service in `parcelFields.ts`, asked only for tiles over Hamilton; tap, search and the record fields; a Three Gorges lot near Worley Road selects and grades (a recording); the hint names the county and suggests Draw a custom parcel where there's no source; `commercial-review.md` |
| 2 | Knox: stopped (§0) | Not covered: KGIS needs a login, and its terms forbid reuse without written authorization |
| 3 | The others; hand-back | The other seven listed as not covered, with their links; screenshots at 1280 and 375; the fresh-eyes review; the hand-back to main |

## 2. Stop conditions

- A county's service needs a key, or its terms forbid this use: stop for that county, and say so.
- A change would move a grade or report text in the existing fixtures.
