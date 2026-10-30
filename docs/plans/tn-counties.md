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
- **Rounds 2 and 3:**
  - **The two "Parcels" layers** hold the same 169,662 records; they differ only in the scales they draw at, which a
    query ignores. The app asks layer 0.
  - **`PARCEL_TYP`:**
    - 1 is a plain parcel (162,758 records).
    - 6 and 10 are condominium units, 11 a leased site (a cell tower, a dock), 12 mineral rights and 13 improvements
      only. Each repeats a parcel's polygon (a mineral-rights record shares its parcel's `GISLINK`).
    - 5 has 4 records.
    - **So the app asks `PARCEL_TYP=1` only.**
  - **The identity:** `TAX_MAP_NO` is `MAP`, `GROUP_` and `PARCEL` ("048 045.24"; "110H D 042" in town), as Tennessee's
    tax cards read. `GISLINK` is "033048    04524", four spaces in the middle as the state's are (the probe's equality
    query, with one space, matched nothing). A plain parcel is one feature, so a record is fetched by its object id,
    not grouped by `GISLINK`.
  - **The county record:** `RecordsOnl` is the assessor's card, e.g. `https://assessor.hamiltontn.gov/card/048_045.24`.
  - **Three Gorges Farms** is a 2026 subdivision (plat book 135, pages 54–58) of about 5-acre tracts on Three Gorges
    Road, Big Soddy Drive and Deep Down Road, just east of Worley Road. The test lot is tract 1: 048 045.24, 2385
    Three Gorges Rd, 5.09 ac. (Nominatim found no "Worley Road, Soddy-Daisy"; the county's own records did.)
- **Round 4: the other seven** (web search, 2026-10-30; nothing here was queried). None is trivially similar to
  Hamilton's: each would mean its own fields, its own terms read and its own recording, and some are closed or
  restricted. So all seven are **not covered**. Over each, the map names the county and offers Draw.

  | County | What there is | Why not covered |
  |---|---|---|
  | Chester | No county GIS service found; the state's Property Viewer and commercial vendors only | No public source |
  | Davidson (Nashville) | Metro's [Parcel Viewer](https://maps.nashville.gov/ParcelViewer/); its REST service wasn't found | Not found; its own fields and terms to read |
  | Hickman | A CAMA vendor's portal, `hickman.capturecama.com` (from a directory; not verified) | No ArcGIS service; a vendor's terms |
  | Montgomery (Clarksville) | Austin Peay's GIS Center: [MontViewer](https://apnsgis4.apsu.edu/arcgis/rest/services/CMCGIS/MontViewer/MapServer), last updated 2022-10-18 | A university's service, three years old |
  | Rutherford | The county's [ParcelOwners service](https://maps.rutherfordcountytn.gov/ags03/rest/services/Assessor/ParcelOwners/MapServer), which offers a token login, and its [GIS hub](https://rutherfordcountygis-rcgis.hub.arcgis.com) | May need a token; terms to read |
  | Shelby (Memphis) | ReGIS's [CERT_Parcel](https://gis.shelbycountytn.gov/arcgis/rest/services/Parcel/CERT_Parcel/MapServer), "for the sole use of ReGIS, its participants, and their authorized agents"; Memphis's [TaxParcel_Basemap](https://maps.memphistn.gov/mapping/rest/services/Basemaps/TaxParcel_Basemap/MapServer/0) | The county's terms restrict it; the city's is a basemap with its own terms |
  | Williamson | The county's HTML5 viewer at `williamson-tn.org` (from a directory; not verified) | No service found |

  Davidson, Montgomery, Rutherford and Memphis's layer might be added the way Hamilton's was, each a PR the size of this
  mission's PR 1. All four are far from the household's region, so they're left until they're asked for.

## 1. The work, by PR

| # | PR | What |
|---|---|---|
| 0 | This plan, and the probe | The probe's findings go into §0 |
| 1 | Hamilton | The county's service in `parcelFields.ts`, asked only for tiles over Hamilton; tap, search and the record fields; a Three Gorges lot near Worley Road selects and grades (a recording); the hint names the county and suggests Draw a custom parcel where there's no source; `commercial-review.md` |
| 2–3 | Knox and the others; hand-back | Knox stopped (§0: KGIS needs a login, and its terms forbid reuse without written authorization); the other seven listed as not covered, with their links (§0, round 4); screenshots at 1280 and 375; the fresh-eyes review; the hand-back to main. Knox's stop is a few lines of docs, so it rides with the others (CLAUDE.md: fold trivial follow-ups) |

## 2. Stop conditions

- A county's service needs a key, or its terms forbid this use: stop for that county, and say so.
- A change would move a grade or report text in the existing fixtures.
