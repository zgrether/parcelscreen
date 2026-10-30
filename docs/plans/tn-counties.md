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

**From the research** (web search; the hosts can't be reached from this session):
- **Hamilton:** a `Live_Parcels` MapServer on the county's GIS host (`mapsdev.hamiltontn.gov/hcwa03`), and a Parcels
  layer in its OpenGov service.
  - The county GIS site's disclaimer is about accuracy (no survey-grade use, no legal determinations), and says the
    parcels come from the Assessor of Property.
  - The Assessor's site terms are use at your own risk, with an indemnity clause. I found no ban on this use.
- **Knox:** KGIS, the Knoxville–Knox County–KUB GIS.
  - Its disclaimer says the information "was prepared for the internal purposes" of its partners.
  - Its maps are "copyrighted by KGIS".
  - Its digital data is released only under a signed Data License Agreement, for a fee (KGIS, Purchase Information).
  - **Unless the probe finds a public service whose own terms allow reuse, this is the brief's stop: the terms forbid
    this use without a licence.**

**The probe:** `test/tools/tn-counties-probe.test.ts`, run on CI's runners by `.github/workflows/tn-counties.yml`.
It reports, for each county:
- the service directories and parcel layers;
- each layer's fields, record limit, query formats, description and copyright;
- the CORS header a browser sees;
- the parcels around Worley Road, Soddy-Daisy;
- the terms pages' lines on use.

## 1. The work, by PR

| # | PR | What |
|---|---|---|
| 0 | This plan, and the probe | The probe's findings go into §0 |
| 1 | Hamilton | The county's service in `parcelFields.ts`, asked only for tiles over Hamilton; tap, search and the record fields; a Three Gorges lot near Worley Road selects and grades (a recording); the hint names the county and suggests Draw a custom parcel where there's no source; `commercial-review.md` |
| 2 | Knox, or its stop | If allowed, as Hamilton, with one Knox parcel selecting (a recording); otherwise "not covered", with why |
| 3 | The others; hand-back | The other seven listed as not covered, with their links; screenshots at 1280 and 375; the fresh-eyes review; the hand-back to main |

## 2. Stop conditions

- A county's service needs a key, or its terms forbid this use: stop for that county, and say so.
- A change would move a grade or report text in the existing fixtures.
