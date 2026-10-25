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

**Lidar terrain** (Map layers, roadmap step 14c): USGS 3DEP's elevation image service
(`elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer`), drawn by USGS's own `exportImage` as
shaded relief or slope, one map tile at a time. Public domain, with no limit on commercial use, display or caching;
credited on the map and in Map layers as "Terrain: USGS 3D Elevation Program (lidar)". The service is a shared public
endpoint with no stated rate limit, so the layer asks only for the tiles in view, from zoom 13 up.

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
