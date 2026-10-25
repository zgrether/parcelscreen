# Commercial review: data sources whose terms limit commercial use

ParcelScreen is a free, personal, non-commercial app. This list is for the day that changes: if it ever charges a
fee or runs for clients, each source below has to be swapped (or licensed) first. Started 2026-10-22 (owner, step 11
hand-back #272); add a line whenever a new source comes in.

"Checked" means the terms were read and recorded in this repo; "to confirm" means they weren't, and the line is what's
known of them, to be read again before any commercial launch.

## Data sources

| Source | Used for | What limits commercial use | Swap |
|---|---|---|---|
| PRISM 1991–2020 normals, 800 m (Oregon State University) | Climate: January lows, July highs at the site (`lib/screen/data/climate.json`) | Free to reproduce and distribute with attribution; the terms don't address commercial use (checked 2026-10-21, step 11 plan §3). Ask PRISM first. | NOAA NCEI U.S. Climate Normals 1991–2020 (public domain), which the app already uses for snow and frost |
| OSRM demo server, `router.project-osrm.org` | Every drive time (town, ER, trailheads, airports, long trails); the area catalog's monthly profile (below) | A shared demo with a usage policy: light use, no SLA; not for production or commercial load. REQUIREMENTS already says "replace before any commercial use". To confirm. | Self-hosted OSRM (or Valhalla, GraphHopper) on OpenStreetMap data, or a paid routing API |
| Esri World Imagery and World Street Map, `server.arcgisonline.com` | The "Aerial (Esri)" and "Streets (Esri)" basemaps; the report card's static map | Esri's basemap terms allow non-commercial use with attribution; commercial apps need an ArcGIS licence. To confirm. | USGS National Map imagery (public domain, already a basemap) and the state orthophotos; or a paid Esri or MapTiler plan |
| Photon, `photon.komoot.io` | Place lookups: groceries, trailheads, the search box | komoot's public instance is free for fair use and may be throttled; not meant for commercial load. To confirm. | Self-hosted Photon on OpenStreetMap data |
| Overpass public instances (`overpass-api.de`, `overpass.kumi.systems`, `overpass.openstreetmap.fr`) | The places fallback (`/api/places/overpass`); the area catalog's groceries and trailheads, one query per area a month | Each instance's usage policy caps daily queries and asks for fair use; not meant for commercial load. To confirm. | A self-hosted Overpass, or drop the fallback for self-hosted Photon |
| Light-pollution atlas (David Lorenz), `djlorenz.github.io` | Night sky: sky brightness and the light domes | Published for the public on a personal site; commercial use isn't addressed. To confirm with the author. | Brightness computed from the VIIRS night-lights data (Earth Observation Group, CC BY 4.0) |
| Tennessee Property Boundaries (Public Use), the Comptroller | Tennessee parcel lines | "This service is not intended for commercial use" (checked 2026-10-17, REQUIREMENTS §1, phase-0.md §9.46) | The Comptroller's downloadable parcel data, per their commercial-use note |
| TDOT orthophoto through TNMap | The state aerial in Tennessee | No licence stated; used with its attribution by the owner's choice (phase-0.md §9.47) | USGS imagery, or ask TDOT |

OpenStreetMap data (roads, the vector tiles from OpenFreeMap, trail access points) is ODbL: commercial use is allowed
with attribution, and a derived database is shared alike. The federal sources (USGS 3DEP and imagery, NRCS, FEMA,
PAD-US, Census TIGER and its Geocoder, NOAA, NLCD from MRLC, CMS Hospital General Information, the FAA's airport
records through BTS NTAD) are public domain, and Microsoft's building footprints are CDLA Permissive 2.0. None of
them limits commercial use.

## The area catalog's monthly profile (step 13)

The catalog re-profiles its 30 areas once a month (`.github/workflows/areas-refresh.yml`,
`docs/plans/step-13-area-catalog.md` §3), from one runner, one request at a time to each volunteer host. A month's
requests, all told:

| Host | Requests a month | What |
|---|---|---|
| OSRM demo server | about 120 (4 an area) | Drive tables: about 65 points to 35 destinations each, at most 100 coordinates a table, 1 a second |
| Overpass (one instance, the others on failure) | 30 | Supermarkets and trailheads in each area's box |
| MRLC (NLCD) WCS | 30 | One land-cover GeoTIFF per area |
| USGS 3DEP ImageServer | 30–120 | The 30 m DEM in tiles |
| PAD-US (Esri-hosted) | about 60 | Fee land in each area's box, paginated |
| Light-pollution atlas | 2–6 | Its tiles, once a run |
| data.cms.gov | 2 | The dataset record and the CSV, through a browser |
| Census Geocoder | 1 batch, about 25 ZIP lookups | Placing the ERs |
| BTS NTAD | 1 | The airports |

The OSRM count is the one to watch: it's light, but it's regular, scheduled use of a demo server. The sample parcels
(two per area) are screened by hand, not monthly.

## Hosting

Vercel's Hobby plan prohibits commercial use (PLAN.md, free tiers): move the project to a Pro team first.

## Market value references (UX audit Z-5; investigate only, 2026-10-24)

Zach asked which public sources could give a defensible market reference for a parcel in the ten covered counties
(`docs/plans/ux-part-2.md` §10). Nothing uses them yet; he decides later. Read 2026-10-24: web pages and service
metadata only, no bulk queries. "Not verified" means the page wasn't opened past a disclaimer or didn't answer.

**The parcel layers the app already reads:**
- **Virginia (VGIN):** no value or sale fields; "for cartographic use and spatial analysis only".
- **North Carolina (NC OneMap):** `landval`, `improvval`, `parval`, `presentval` (present-use value), `saledate` and
  `reviseyear`, as each county submits them, but **no sale price**. Its terms ask for bulk data from the by-county
  download, not the map service.
- **Tennessee (the Comptroller's public-use boundaries):** no value fields. Its description says it is "intended for use
  by state agencies with approved access", which is **to confirm against the app's own use of it** (step 2, §9.46; the
  question to send is below). The
  Comptroller's per-county shapefiles carry assessment data and "can be used in a commercial application", with no
  recurring or automated downloads.
- **Tennessee (TPAD):** the strongest single source. It has the market appraisal, the greenbelt value, and sales with
  price, deed book and page, and a qualification code: "A" or "Q" marks a sale fit for analysing values, the arm's-length
  filter comparables need. It has a sale-date range search and per-search export. No terms of use on automated access
  were found.

**How assessments relate to market:**
- **Virginia** assesses at 100% of fair market value, on cycles of up to 6 years. Virginia Tax's 2025 sales-ratio study
  shows how far behind they run, county by county; it gives locality medians only, no individual sales:

  | County | All classes (median ratio, sales) | Agricultural and undeveloped land, 20–100 ac (median ratio, sales) |
  |---|---|---|
  | Floyd | 85.7% (201) | 94.9% (26) |
  | Carroll | 82.3% (564) | 78.1% (42) |
  | Grayson | 63.3% (269) | 78.1% (33) |
  | Patrick | 57.7% (106) | 57.4% (15) |

- **North Carolina** revalues at 100% as of the revaluation date, at least every 8 years. NCDOR's 2024 study (2023
  sales), as median ratio and COD: Ashe 83.3% / 30.2, Mitchell 74.9% / 29.0, Alleghany 71.4% / 47.2, Avery 66.3% / 48.3.
- **Tennessee** appraises at market value and assesses farm and residential property at 25% of it.
- **Use-value programs pull farm and forest land far below market:** Virginia's land-use taxation, North Carolina's
  present-use value, Tennessee's greenbelt. A use-value figure is never a market reference.

| County | Online search | Land value shown | Sales shown | Last reassessment | Terms |
| --- | --- | --- | --- | --- | --- |
| Floyd VA | floyd.cama.concisesystems.com (Concise) | not verified | not verified | 2025 | click-through disclaimer; nothing on scraping |
| Grayson VA | gis.vgsi.com/graysoncountyva (Vision) | yes | yes: price, book/page, date | 2022 (next 2028) | "informational use only" |
| Carroll VA | InteractiveGIS map; 2025 reassessment books (PDF) | in the books | not found | 2025 | "mapping purposes only" |
| Patrick VA | patcova.interactivegis.com | not verified | not verified | 2021 (next 2027) | not found |
| Ashe NC | ashecountytax.com | OneMap's `landval` | sale date (OneMap) | 2023 (next 2027) | reCAPTCHA on the search |
| Alleghany NC | bttaxpayerportal.com/ITSPublicAL (a Sales Search tab); webgis.net | OneMap's `landval` | yes (Sales Search) | 2021 (next 2027) | "created for internal use", no warranty |
| Avery NC | webtax.averycountync.gov/itsnet (didn't answer) | OneMap's `landval` | sale date (OneMap) | 2022 (next 2027) | not found |
| Mitchell NC | nc-mitchell.publicaccessnow.com (Aumentum) | OneMap's `landval` | sale date (OneMap) | 2022 (next 2027) | not found |
| Carter TN | TPAD | yes (market, greenbelt) | yes, with qualification codes | 2026 (next 2030) | no TPAD terms found |
| Johnson TN | TPAD | yes | yes | 2026 (next 2030) | no TPAD terms found |

Deeds record the price in all three states (Virginia's recordation tax, North Carolina's excise stamps, Tennessee's
consideration oath), but the registers of deeds aren't machine-friendly.

**Commercial sources** (named only; their terms weren't checked):
- Land.com and LandWatch have sold data, but their terms likely forbid automated reuse.
- Acres.com sells comparables by subscription.
- An MLS is members only, under IDX/VOW rules.
- Regrid, ATTOM, CoreLogic, LandRecords.us and ReportAll USA carry assessed values and last sales, all under license.

**In short, what's defensible today:**
- **Tennessee:** TPAD's qualified sales.
- **North Carolina:** OneMap's land value with its revaluation year, beside the county's ratio.
- **Virginia:** the county assessment beside Virginia Tax's Class 5 ratio.
- **Per-acre comparables for Virginia and North Carolina** need the counties' sales searches or a licensed vendor.

### Tennessee's parcel service: the question to send (Zach, #314)

**Who to ask:** the Comptroller of the Treasury's Division of Property Assessments, Geographic Services. That's the
Office of Local Government's property assessment and GIS work. It runs the Tennessee Base Mapping Program and the
statewide parcel data.
- **Email:** GIS.Data@cot.tn.gov. The parcel data page gives it "for questions concerning the parcel data".
- **Main line:** 615-741-2775.
- **Address:** Comptroller of the Treasury, State Capitol, Nashville, TN 37243-9034.

Sources: the [parcel data page](https://comptroller.tn.gov/office-functions/pa/gisredistricting/redistricting-and-land-use-maps/parcel-data.html)
and [Geographic Services](https://comptroller.tn.gov/office-functions/pa/gisredistricting.html), both read 2026-10-24. No
named staff contact is listed.

**The question, for Zach to email:**

> Subject: Personal use of the Tennessee Property Boundaries public-use parcel service
>
> Hello. I've built a small personal web app that helps my household evaluate rural land we're considering buying in
> Carter and Johnson counties. When we look at a parcel, the app asks your public ArcGIS service
> (Tennessee_Property_Boundaries_Public_Use, FeatureServer layer 0) for that one parcel's boundary and identifiers, and it
> shows the TPAD link for the county record. It makes a few requests per parcel viewed, never bulk downloads, and it
> doesn't store or redistribute the data beyond our own saved parcels. The service's description says it's "intended for
> use by state agencies with approved access". Is personal, non-commercial use like this permitted? If not, is there a
> way to request access, or would you prefer we use the monthly county shapefile downloads instead? Thank you.
