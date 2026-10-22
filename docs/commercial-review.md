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
| OSRM demo server, `router.project-osrm.org` | Every drive time (town, ER, trailheads, airports, long trails) | A shared demo with a usage policy: light use, no SLA; not for production or commercial load. REQUIREMENTS already says "replace before any commercial use". To confirm. | Self-hosted OSRM (or Valhalla, GraphHopper) on OpenStreetMap data, or a paid routing API |
| Esri World Imagery and World Street Map, `server.arcgisonline.com` | The "Aerial (Esri)" and "Streets (Esri)" basemaps; the report card's static map | Esri's basemap terms allow non-commercial use with attribution; commercial apps need an ArcGIS licence. To confirm. | USGS National Map imagery (public domain, already a basemap) and the state orthophotos; or a paid Esri or MapTiler plan |
| Photon, `photon.komoot.io` | Place lookups: groceries, trailheads, the search box | komoot's public instance is free for fair use and may be throttled; not meant for commercial load. To confirm. | Self-hosted Photon on OpenStreetMap data |
| Overpass public instances (`overpass-api.de`, `overpass.kumi.systems`, `overpass.openstreetmap.fr`) | The places fallback (`/api/places/overpass`) | Each instance's usage policy caps daily queries and asks for fair use; not meant for commercial load. To confirm. | A self-hosted Overpass, or drop the fallback for self-hosted Photon |
| Light-pollution atlas (David Lorenz), `djlorenz.github.io` | Night sky: sky brightness and the light domes | Published for the public on a personal site; commercial use isn't addressed. To confirm with the author. | Brightness computed from the VIIRS night-lights data (Earth Observation Group, CC BY 4.0) |
| Tennessee Property Boundaries (Public Use), the Comptroller | Tennessee parcel lines | "This service is not intended for commercial use" (checked 2026-10-17, REQUIREMENTS §1, phase-0.md §9.46) | The Comptroller's downloadable parcel data, per their commercial-use note |
| TDOT orthophoto through TNMap | The state aerial in Tennessee | No licence stated; used with its attribution by the owner's choice (phase-0.md §9.47) | USGS imagery, or ask TDOT |

OpenStreetMap data (roads, the vector tiles from OpenFreeMap, trail access points) is ODbL: commercial use is allowed
with attribution, and a derived database is shared alike. The federal sources (USGS 3DEP and imagery, NRCS, FEMA,
PAD-US, Census TIGER, NOAA) are public domain, and Microsoft's building footprints are CDLA Permissive 2.0. None of
them limits commercial use.

## Hosting

Vercel's Hobby plan prohibits commercial use (PLAN.md, free tiers): move the project to a Pro team first.
