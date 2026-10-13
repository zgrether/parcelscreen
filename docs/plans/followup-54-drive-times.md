# Follow-up 54: drive times that fit the mountains (plan)

Status: **approved** (owner, #123, 2026-10-13), with the answers in §8. Owner's scope (#119 review, 2026-10-12): drives start at the driveway's road entrance; Trails
is graded by drive minutes to the nearest trailheads' parking; an OSRM vs Google Maps table for the three fixtures,
with a mountain factor only once Zach has filled it in; the public OSRM server's limits and the alternatives. No code
until this is approved.

## 1. Where drives start

**Today:** every drive (hospital, groceries, saved places) starts at the parcel's centroid. OSRM snaps that point to
the nearest road it knows, which isn't always the one the land is reached from.

**Proposed:** every drive starts where the **scored driveway route meets the road**: its entrance
(`driveway.entrances[routes[0].entranceIndex]`). That covers the hospital, the groceries, the saved places, and the
trailheads (§2).

| The scored route's entrance | Drives start at | The row says |
|---|---|---|
| A Census road (`tiger`) | the entrance | "from the entrance on {road}" |
| An OSM track or service road (`osm`) | the entrance | the same |
| A drawn line (`drawn`, follow-up 34) | the line's road end, not the entrance at its other end | "from where your drawn {track/easement} meets {road}" |
| No frontage (`fallback`) | the nearest road point | "from the nearest road point ({gap} ft off the parcel)" |
| No driveway routed at all | the centroid, as today | "from the parcel's centre (no driveway was routed)" |

- **A marked house:** a full run with a house uses the house route's entrance, as the driveway section does.
- **The step order changes.** The entrance is only known after `driveway`, so `drive` moves from before `rank` to
  last: `… near, rank, driveway, drive`. The step list shows the new order.
- **Where it's said:** the start point is stored with the drives, and Getting There appends a sentence after its
  existing note: "Drive times start {where}." (rule 7: appended).
- **OSRM snapping:** OSRM snaps a start point to its nearest way, and says how far (`waypoints[0].distance`). When
  that's over 100 m, the sentence adds "(OSRM's nearest road is {n} ft away)". The three fixtures' entrances snap at
  0, 0 and 159 m (§4).

## 2. Trails graded by drive minutes

**The candidates:**
- The **5 nearest trailheads by straight line** from the start point, from the merged official and OSM list the near
  step already builds.
- Each is driven to **its parking** by follow-up 39's rule: an OSM `amenity=parking` within 300 m that's tagged for
  that trailhead (its name matching after follow-up 24's normalisation, or a `trailhead` / `hiking` tag), else the
  trailhead point.
- The parking comes from **one Overpass query** per screen (`around:300` for the 5 points), through the existing
  mirrors.

**The grade:** the **quickest** of the 5, by OSRM car.
- **Proposed cutoffs (Q1):** A ≤ 10 min, B ≤ 20, C ≤ 35, D ≤ 50, F beyond, or no trailhead found.
- **Kept:** adjoining open public land is an A, before anything else (#122). Open public land within a mile is a B,
  unless a trailhead does better.

**The row:** "a trailhead 14 min (6.2 mi) by road, 3.1 mi straight (Name)". This replaces today's straight-line
sentence, which rule 7 needs Zach to approve (Q2).

**When OSRM fails:**
- The grade falls back to today's straight-line cutoffs (3 / 6 / 12 / 22 mi).
- The row is marked incomplete: "…; incomplete: the drive times didn't load". That holds the verdict at Maybe, as in
  follow-up 53.
- If the Overpass parking query fails, the drives go to the trailhead points, with no flag. The minutes are close
  enough, and the route still runs.

**The search radius stays 36 km straight.** A trailhead past 22 mi straight could only be within 50 minutes on an
interstate.

**Follow-up 39** (drive times on tap) reuses these routes: they're stored, not recomputed.

## 3. What's stored: schema v6, a clean break

Schema v6 is a clean break, as v3, v4 and v5 were: kept v5 results are cleared and re-screen when opened. It's
recorded in phase-0.md §9.

**New fields:**
- `driveFrom`: `{ ll, kind: "entrance" | "drawn" | "nearestRoad" | "centre", road: string | null, snapM: number }`;
- `near.trailheads[]` gain
  `drive: { min, mi, to: "parking" | "point", parkingLl: LatLon | null } | null`, set for the 5 candidates and null
  for the rest;
- `noResponse` may name "OSRM (trailheads)" and "Overpass (trailhead parking)".

**The rules:**
- ENGINE_VERSION 17.
- `pnpm record:port` re-records the new requests: the table query (§5) and the parking query.
- `expected.json` changes, with a "Numbers change:" line and the `diff:prototype` summary.

**Report text (rule 7):**
- Trails' "How it's scored" gains a sentence after its existing text. Its straight-line cutoffs stay, as the fallback.
- The rulebook shows the drive-minute bands.
- The Trails row's sentence is Q2.

## 4. OSRM vs Google Maps (for Zach to fill in)

All OSRM times are live, 2026-10-12, by the public demo server, car profile:
- "Centre" is today's start point, the centroid.
- "Entrance" is §1's.
- Trailheads are the 5 nearest by straight line from the entrance, driven to the tagged parking where there is one.

Please fill in the Google columns from the entrance point, for a weekday midday with no traffic. The entrance points:
- **Ferney:** 36.88702, −80.45611 ("road", Census, unnamed)
- **Grayson:** 36.58541, −81.56397 (Mud Creek Ln)
- **Macks:** 36.93697, −80.62860 ("road", Census, unnamed)

### Ferney Creek 52-47A (Floyd Co. VA)

| To | Straight | OSRM from centre | OSRM from entrance | Google from entrance (min / mi) |
|---|---|---|---|---|
| Carilion New River Valley (ER; today's pick) | 14.2 mi | 48 min, 22.0 mi | 47 min, 21.6 mi | |
| Food Lion, Floyd (today's grocery) | 7.4 mi | 16 min, 9.7 mi | 15 min, 9.6 mi | |
| Slaughters' Supermarket | 6.4 mi | 14 min, 8.7 mi | 13 min, 8.6 mi | |
| Buffalo Mountain Trailhead (its parking, 12 m) | 6.4 mi | | 47 min, 11.5 mi | |
| Fairystone State Park (no tagged parking) | 19.9 mi | | 51 min, 32.2 mi | |
| Claytor Lake State Park | 14.8 mi | | 63 min, 32.8 mi | |

### Grayson Mud Creek 6273

| To | Straight | OSRM from centre | OSRM from entrance | Google from entrance (min / mi) |
|---|---|---|---|---|
| Ashe Memorial (ER; today's pick) | 12.6 mi | 38 min, 19.0 mi | 38 min, 19.0 mi | |
| Food Lion, West Jefferson (today's grocery) | 12.7 mi | 38 min, 19.0 mi | 38 min, 19.0 mi | |
| Lansing Foods (today's closer grocery) | 6.7 mi | 21 min, 9.0 mi | 21 min, 9.0 mi | |
| Grayson Highlands State Park | 5.0 mi | | 17 min, 6.7 mi | |
| Green Cove | 5.5 mi | | 19 min, 7.2 mi | |
| Elk Garden A.T. | 5.3 mi | | 25 min, 9.0 mi | |
| Creek Junction Trailhead | 7.6 mi | | 27 min, 12.8 mi | |
| Scales Trailhead | 7.2 mi | | 118 min, 27.3 mi (FS 613 at 3 mph) | |

### Macks Mountain 35-3 (Floyd Co. VA)

| To | Straight | OSRM from centre | OSRM from entrance | Google from entrance (min / mi) |
|---|---|---|---|---|
| Carilion New River Valley (ER; today's pick) | 12.9 mi | 48 min, 20.4 mi | 82 min, 25.0 mi | |
| LewisGale Pulaski (ER) | 12.2 mi | 68 min, 33.3 mi | 96 min, 19.1 mi | |
| Walmart, Dublin (today's grocery) | 11.5 mi | 61 min, 31.6 mi | 94 min, 19.1 mi | |
| Food City, Pulaski | 10.9 mi | 63 min, 31.3 mi | 91 min, 17.0 mi | |
| Heritage Park | 10.4 mi | | 92 min, 17.4 mi | |
| Claytor Lake State Park | 8.3 mi | | 99 min, 36.3 mi | |

### What the table already shows

- **Macks: the entrance is on a mountain track.** The scored route's entrance is an unnamed Census road. From it, OSRM
  drives **5.7 mi of unnamed ways and "Big Macks" at about 6 mph** (55 min) before reaching Max Creek Rd. From the
  centroid it snapped to a different road and went round, 33 mi in 68 min. Either may be right: it depends whether
  that track is drivable, which Zach's Google times and his knowledge of the road will tell (Q3).
- **Grayson's Scales Trailhead:** OSRM reaches it by Forest Road 613 at 3 mph (76 min for its last 3.9 mi).
- **No direction assumed** (owner, #123): OSRM's car profile is slow on unpaved and track ways (3–6 mph here), but it
  may also be too fast on paved mountain curves. The Google column decides, possibly with separate factors by road
  type.
- **Ferney:** the entrance and the centroid agree within a minute.
- **Parking:** only Buffalo Mountain's lot is tagged for its trailhead. The state parks' lots near their points are
  untagged, so those drives go to the point.

**A mountain factor waits for the Google column.** No factor is proposed until it's filled in.

### What the grades would be (preliminary: today's live data, the proposed cutoffs)

| Fixture | Trails now → by drive | Town now → from the entrance |
|---|---|---|
| Ferney | C (6.5 mi straight) → **D** (47 min to Buffalo Mountain's parking) | D → D (ER 47, grocery 15) |
| Grayson | B (4.9 mi) → **B** (17 min to Grayson Highlands) | C → C (ER 38, closer grocery 21) |
| Macks | C (9.0 mi) → **F** (92 min, the track) | D → **F** (ER 82, grocery 91) |

## 5. Load and the public OSRM server

**Today:** the drive step sends its OSRM route requests one at a time, spaced a second apart (`lib/http.ts`'s volunteer
policy for router.project-osrm.org):
- up to 3 hospitals, 3 chain groceries and 3 other groceries;
- one request per saved place (5 airports by default);
- so up to **14 requests, about 14 s**.

Adding 5 trailheads would make it 19.

**Proposed (Q4): OSRM's table service.**
- One `/table/v1/driving` request, with `sources=0&annotations=duration,distance`, times every destination at once:
  hospitals, groceries, saved places, trailheads. That's **1 request instead of 14–19**.
- Checked on Ferney's entrance: the table gives **the same minutes and miles** as the route requests (47, 50, 55, 15
  and 47 min; 21.6, 31.3, 27.1, 9.6 and 11.5 mi).
- Plus one Overpass query for the parking.
- The PR reports the screen time before and after.

**The demo server's terms** (router.project-osrm.org, run by FOSSGIS):
- at most one request a second;
- "reasonable, non-commercial use";
- no guarantees on uptime, latency or data updates.

FOSSGIS's own routing.openstreetmap.de adds: a valid User-Agent, attribution, and no heavy use. We meet these. A
public app with many users wouldn't.

**The alternatives, for Phase 1 or later (no change now):**

| Option | For | Against |
|---|---|---|
| Self-hosted OSRM | No limits; our own profile (slower or faster unpaved roads: the mountain factor done properly); the same API | A server to run: a VA+NC+TN extract needs a small VM with a few GB of RAM, rebuilt for map updates |
| Valhalla (FOSSGIS's public instance, or self-hosted) | Grades unpaved and steep roads more realistically; matrix API | Public instance also about 1 request/user/second and not for production; a different API |
| OpenRouteService | Hosted, with a key; matrix API | Daily quotas on the free plan (to confirm); a key to keep server-side |

## 6. Files

- `lib/screen/drive.ts`: the start point; the table request; the trailhead candidates.
- `lib/screen/trailheadParking.ts` (new): the Overpass query and follow-up 39's match.
- `lib/screen/index.ts`, `config.ts` (STEPS order, the cutoffs).
- `types.ts`: v6, with a `schema-v6.test.ts` snapshot.
- `lib/report/card.ts` (`trails()`), `cardPanels.ts`, `rulebook.ts`, `surroundings.ts` / `GettingThere.tsx` (the start
  sentence).
- Tests:
  - the start point for each entrance kind;
  - the table request against recorded answers;
  - the parking match;
  - the drive cutoffs at each edge;
  - OSRM failing → straight line and incomplete;
  - adjoining still A.
- Recordings and `expected.json` re-recorded.

## 7. Questions

1. **The cutoffs:** A ≤ 10, B ≤ 20, C ≤ 35, D ≤ 50 min. Approve, or adjust after the Google column?
2. **The Trails row's sentence (rule 7):** replace "a trailhead 6.5 mi away in a straight line (Name)" with "a trailhead
   14 min (6.2 mi) by road, 3.1 mi straight (Name)", recorded in §9 as an approved replacement? Or keep it and append
   "; 14 min (6.2 mi) by road"?
3. **An entrance on a track (Macks):** start there, as the spec says, even when OSRM's first miles are unnamed tracks at
   6 mph? Or start at the first named public road the driveway reaches, and say so? My lean: the entrance as
   specified, and the row adds "(the first 5.7 mi on unnamed tracks)" when OSRM's route starts on unnamed ways, so the
   reader sees why. Zach's Google times decide whether OSRM is right about that road.
4. **The table service** in place of one route request per destination: same numbers, far fewer requests. Go?
5. **A pin's re-evaluation** (unsaved, step 15) and moving the house: re-route the drives from that target's entrance,
   or keep the run's drives and say so? My lean: keep the run's, with a note. A re-evaluation shouldn't send network
   requests, and a re-run does it properly.
6. **Order:** this plan's PR first (docs only); then one implementation PR (schema v6 and engine together, since the
   shape and the numbers change at once). A mountain factor, if any, is its own PR after the Google column.

## 8. The owner's answers (#123, 2026-10-13)

1. **Cutoffs:** A ≤ 10 / B ≤ 20 / C ≤ 35 / D ≤ 50 min, as provisional config. The final values come after Zach's
   Google column; changing them then is a config change plus a "Numbers change:" line.
2. **The Trails sentence:** replaced with "a trailhead 14 min (6.2 mi) by road, 3.1 mi straight (Name)". It's recorded
   in phase-0.md §9 as an approved replacement.
3. **An entrance on a track:** start at the entrance, as specified. When OSRM's route starts on unnamed or track ways,
   the row adds "(the first 5.7 mi on unnamed tracks)".
4. **The table service:** yes. The per-route request is kept only for when the table call fails. The PR reports the
   screen time before and after.
5. **A moved pin or house:** the run's drives are kept, with "Drive times are from the last full screen; run again to
   update."
6. **Order:** agreed. This plan PR merges; then one implementation PR (schema v6 plus the engine); then a mountain
   factor, if needed, as its own PR after the Google column.

**Framing (corrected in §4):** OSRM may be too slow on unpaved and track ways and too fast on paved curves. No
direction is assumed.

**Follow-up 55** (after 54; phase-0.md's table): the entrance road's class. It's stored as Census MTFCC (S1400 local
road, S1500 4WD vehicular trail, S1740 private road) or the OSM `highway` / `tracktype` tag. Legal road access warns
"the road in is a 4WD trail / private road; check that it's public and drivable year-round" when the scored route's
entrance is on one. Macks is the test case. Its PR carries a brief plan; it rides on 54's schema v6 if ready in time,
else v7.
