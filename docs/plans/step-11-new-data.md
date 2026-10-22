# Step 11: New data points

Zach's brief (10/21), pre-approved with this plan's recommended answers (§12). Sources: PLAN.md row 11, and
`docs/design/workflow-review.md`'s "The interview" and "Factors". Seven factors, one PR each, in this order:
1. Hospital;
2. Climate;
3. Privacy;
4. Long view;
5. Airport;
6. Bike to a long trail;
7. Internet.

Decision: phase-0.md §9.66.

## 1. The rules every factor follows

- **New measurements are new fields only,** and optional. That's a declared, purely additive `expected.json` change per
  fixture: no existing value changes. The stored ScreenResult stays v9. This is the owner's §9.65 exception (an
  optional field, no clean break) extended to step 11's fields, recorded in §9.66 with CLAUDE.md's pointer updated.
  `schema-v9.test.ts`'s snapshot gains each optional field in its PR.
- **ENGINE_VERSION goes up once per PR that changes the engine:** Climate, Privacy, Long view, Bike to a long trail and
  Internet. Hospital and Airport read what the screen already stores, so they're display-time only and don't bump it.
- **Old screens aren't dropped (needs a change, §12 Q1).** Today a bump marks every kept screen "from earlier rules":
  the list hides its grade until it's opened and re-screened. So this step adds `ENGINE_CURRENT_FROM = 22` beside
  ENGINE_VERSION: a screen from engine 22 or later stays current. A factor it lacks reads **"not measured: grade
  again"** and counts as **unknown**. An unknown never fails a Must. It holds the verdict at Maybe only when the factor
  is a Must, as a threshold Must's unknown does today.
- **New network requests are appended to the fixtures' recordings,** and existing entries stay byte-identical
  (`PORT_APPEND`, as TREC in step 2). Only Bike to a long trail and Privacy (a fallback) make requests.
- **Static regional data is baked in at build time** where the terms allow. Each set has a `pnpm data:<name>`
  script and an age check, as `state-outlines.json` and `hospitals.json` do. Bake-in covers the study region (§3),
  and a parcel outside it reads "not measured: outside the data's area".
- **Existing priorities:** each new factor is added once, to Don't care, except where an existing answer clearly
  implies a place (§5).
  - What matters shows one notice: "New factors to place: Climate, Privacy, …". It links to just the new or changed
    interview questions, and has Undo.
  - It generalises step 7's `drivewayAdded` into `factorsAdded: Partial<Record<RowKey, "new" | "seen" | "undone">>` in
    `ps.rubrics` (optional; a saved list reads as before).
- **Starting list:** each new factor weighs 0 (Don't care), so the default card stays the cards-v7/v8 oracle's. The one
  declared exception is Hospital's split (§2.1).
- **The interview gains questions only where a factor needs a person's limit.** It already asks about most of them:
  - Q3 sun or view → Long view;
  - Q4 bike to a long trail → Bike to a long trail;
  - Q7 video calls and flying → Internet and Airport;
  - Q8 neighbours → Privacy.

  Today those answers only reach the "later" quiet list; now they grade. Climate is the one that needs more: two
  follow-ups on Q1's screen (§2.2). Every factor gets a "why" line in the person's words.

## 2. The factors

### 2.1 Hospital (PR 1): split from Town and hospital

- **What:** the drive minutes to the nearest ER. It's already in `result.drives` ("Nearest hospital"), so there are no
  new fields and no bump.
  - Town becomes **Town and groceries**: the grocery drive (the nearer of the real and the closer one).
  - Hospital takes the `erMin` band ([20, 30, 45, 60]).
- **The interview:** Q6's answer sets Hospital's points and its B/C edge, as it set Town's. "ER over ___ min" becomes
  Hospital's limit. Its "doesn't matter" puts Hospital in Don't care (no more 90-minute edge on Town).
- **Existing lists (implied placement):**
  - Hospital takes Town's place and tier, just after it, since Town graded the ER until now.
  - A saved "ER over ___ min" limit on Town moves to Hospital. Left on Town, it would be tested against grocery minutes.
- **Starting list (declared):** Hospital takes Town's weight, 5. Town (groceries) weighs 0, so it's Don't care. The
  design's default tiers put Town at Could, but a weight there would change every default card twice over.
  - The cards-v7/v8 oracle changes only in the town row's key, label and detail: its letter is the ER's where the ER was
    the worse. PR 1 gives the before/after table for the fixtures, and the guard compares with that mapping.
  - **Stop if any fixture's grade or verdict moves.**
- **Text (rule 7):** the Town row's label and detail change ("Town and hospital" → "Town and groceries"). It's a declared
  split. The old row's ER words move to Hospital's row unchanged.

### 2.2 Climate (PR 2)

- **What:** at the best site's elevation, the January mean low and the July mean high.
  - The source is PRISM 800 m 1991–2020 normals at the site's cell, adjusted from the cell's elevation to the site's by
    a lapse rate (config: 3.6 °F per 1,000 ft, the standard atmosphere's; PRISM's 800 m DEM baked in beside it).
  - Plus snowfall and frost-free days from the most similar nearby NOAA normals station, named with its elevation.
    They aren't adjusted: cold air pools in valleys (Elk Creek, 1,048 m, has 193 frost-free days; Jefferson, 841 m, has
    154).
- **Fields:** `climate: { station: { id, name, elevFt, mi }, snowIn, frostFreeDays, lastFreeze, firstFreeze }` on the
  result, and `climate: { janLowF, julHighF }` on each site (ScoreFields).
- **Graded** on the person's answers, by how far the site's January low and July high fall outside their preferred
  range, in °F: A within it, B within 3, C within 6, D within 10, F beyond. The worse of the two counts. The ranges
  are in config (rule 4):

  | Winters | January low at least |
  |---|---|
  | Mild | 24 °F |
  | Some snow | 18 °F |
  | Real winter welcome | none |

  | Summers | July high at most |
  |---|---|
  | Keep it cool | 80 °F |
  | Warm is fine | 86 °F |
  | Hot is fine | none |

- **The interview:** Q1 ("Cool and snowy · In between · Warm and mild · Either") stays and still sets the elevation band.
  Two follow-ups join its screen, as Q2's town-glow follow-up does:
  - "Winters: Mild · Some snow · Real winter welcome";
  - "Summer heat: Keep it cool · Warm is fine · Hot is fine".

  They're preset from Q1's answer: cool and snowy gives real winter welcome and keep it cool; in between gives some snow
  and warm is fine; warm and mild gives mild and hot is fine. That preset is the implied placement for existing
  answers: Climate goes to Really want where Q1 was answered (not "Either"), and to Don't care otherwise.
- **Snowfall and frost-free days** show beside it (Garden ground's frost line already reads frost position).
- **Best-site ranking:** yes, by each site's elevation.

### 2.3 Privacy (PR 3)

- **What**, at the best site:
  - the houses within ¼ mi;
  - the houses in sight within 1 mi: line of sight from 1.7 m eye height over the terrain DEM to each house's roof
    (its stored height, or 5 m), trees ignored, so the line reads "in winter, with leaves down";
  - the nearest neighbour's house and its distance.
- **The houses:** buildings of at least 60 m² (smaller ones are sheds and barns), not on the parcel itself.
- **Source:** Microsoft Global ML Building Footprints. At build time the region's 15 tiles are reduced to centroid, area
  and height, and split into 0.1° tiles of a few hundred KB each, which the worker loads for the parcel. If a parcel's
  tile is missing, a live Overpass query on OSM buildings is the fallback; its request is appended to the recordings.
- **Fields:** `privacy: { within400m, inSight, nearest: { ll, ft } | null, source }` on the result and on each site.
- **Graded** on Q8 (Wave · See their lights · Never know they're there), as the B/C edge of the nearest house's distance:

  | Q8 answer | B/C edge |
  |---|---|
  | Wave | 330 ft |
  | See their lights | 660 ft |
  | Never know they're there | 1,320 ft |

  For "Never know", a house in sight caps the letter at C. The bands are [2,640, 1,320, 660, 330] ft, shifted by the edge
  (rule 4).
- **The interview:** Q8 already asks, and is used as is. Placement is implied: Privacy goes to Nice to have for "See
  their lights" and to Really want for "Never know".
- **Best-site ranking:** yes.

### 2.4 Long view (PR 4)

- **The stored horizon profile holds angles only** (`sun.profile`, [azimuth, skyline°] every 5°). The distance to each
  skyline cell exists only during the run. So this PR stores it, with no new requests:
  - `sun.profileKm`: the distance to the skyline every 5°, capped at the profile's 6 km;
  - each site's own `view`, from the per-spot horizon the scoring already traces.
- **What:**
  - the longest view ("6+ km" where the skyline is past the profile's reach);
  - the share of the horizon that opens past 5 km;
  - its direction (the middle of the widest open sector, as a compass point).
- **Graded** on the open share past 5 km: A from 25%, B from 15%, C from 8%, D from 3% (rule 4).
- **The interview:** Q3 (Sun · View · Both · Neither) now grades: "View" and "Both" give Long view points. The implied
  placement: View → Really want, Both → Nice to have, otherwise Don't care.
- **Best-site ranking:** yes.

### 2.5 Airport (PR 5)

- **What:** the drive minutes to the nearest airport on Settings' list ("Places to time drives to", the default five:
  AVL, ROA, TRI, GSP, CLT). They're already timed into `result.drives`, so it's display-time: no new fields and no bump.
- **Graded:** A within 45 min, B 60, C 90, D 120.
- **The interview:** Q7's "Fly a few times a year" sets the B/C edge at 90 min, and "Fly monthly or more" at 60. Either
  places Airport in Nice to have; "Neither" leaves it in Don't care.
- **GSO and LYH** have scheduled service too. Adding them to Settings' defaults would change every run's input, so
  they're offered in Settings' help line instead (§12 Q6).

### 2.6 Bike to a long trail (PR 6)

- **What:** the drive minutes to the nearest access point of a curated list of long rail-trails and greenways, baked in
  with each point's coordinates. The minutes come from one **separate** OSRM table request, appended to the recordings,
  so the existing drive request stays byte-identical.

  | Trail | Length | Access points (source) |
  |---|---|---|
  | New River Trail State Park, VA | 57 mi | Pulaski 37.04537, -80.74924 (OSM); Draper 36.99926, -80.74224; Foster Falls 36.88416, -80.85649; Austinville 36.85088, -80.91995; Ivanhoe 36.83914, -80.95375; Fries 36.71511, -80.97736; Cliffview 36.68091, -80.91821; Galax 36.66819, -80.92494 (DCR's directions PDF, degree-minutes converted) |
  | Virginia Creeper Trail, VA | 34 mi | Abingdon 36.70901, -81.97131; Watauga 36.67798, -81.93500; Damascus 36.63453, -81.79192; Whitetop Station 36.59800, -81.62405 (OSM). The upper section reopens Mar 31, 2027 (vacreepertrail.org): Whitetop is marked "closed until 2027" |
  | Tweetsie Trail, TN | 9.6 mi | Johnson City 36.31525, -82.33688; Elizabethton 36.32363, -82.20522 (OSM) |
  | Huckleberry Trail, VA | 15 mi | Blacksburg 37.22639, -80.41240; Christiansburg 37.15208, -80.41550; Gateway Park 37.24264, -80.46459 (OSM) |
  | Mendota Trail, VA | 12.7 mi | Mendota 36.70401, -82.30850; Bristol 36.62035, -82.19033 (OSM) |
  | Roanoke River Greenway, VA | 19.8 mi | Green Hill Park 37.27741, -80.10573; Woodbridge 37.28502, -80.08256 (OSM) |

  The Blue Ridge Parkway is left out: it isn't a designated bike route (NPS).
- **Fields:** `bikeTrail: { trail, point, min, mi } | null`.
- **Graded:** A within 10 min, B 20, C 35, D 50.
- **The interview:** Q4's "Bike from home to a long trail" sets the B/C edge at 10 min and places it in Really want.
  Otherwise it stays in Don't care.

### 2.7 Internet (PR 7)

- **The dish spot,** parcel-wide: the best open-sky spot for a satellite dish.
  - For a grid of candidate cells across the parcel (every 30 m on the fine DEM), the share of the dish's view cone
    that's clear of terrain. The cone is 25° and up, a full circle, weighted 2:1 toward the northern half, as Starlink
    in the northern hemisphere looks north.
  - Trees aren't in the bare-earth DEM, so the line says "trees not counted".
  - Its distance from the house site comes with it.
- **Fixed broadband and cell coverage,** as information lines, not graded. From the FCC National Broadband Map's bulk
  data, baked in for the region:
  - fiber and cable availability, aggregated to H3 resolution-8 cells (the finest the FCC allows for placing a
    provider's record);
  - 4G/5G outdoor mobile coverage, by H3 cell.
  - This needs **one new dependency, `h3-js`** (Uber, Apache-2.0): the FCC data is keyed by H3 cell.
- **Fields:** `internet: { dish: { ll, clearShare, ft }, fixed: { fiber, cable, bestDown } | null, mobile: { g4, g5 } | null }`.
- **Graded** on the dish spot's clear share: A from 95%, B 85, C 70, D 50.
- **Default tier:** Nice to have. On 20+ acres there's nearly always a spot (owner). The implied placement: Q7's
  "Video calls from home" → Really want.

## 3. Sources, terms and attribution (checked 2026-10-21)

| Factor | Source | Terms | Commercial use | Attribution in "How it's scored" |
|---|---|---|---|---|
| Climate | PRISM 1991–2020 normals, 800 m (tmin Jan, tmax Jul, the 800 m DEM) | Free to reproduce and distribute, with attribution, "as is" (prism.oregonstate.edu/terms) | **Not addressed: ask PRISM** before a commercial version | "PRISM Group, Oregon State University, https://prism.oregonstate.edu, accessed Oct 21, 2026" |
| Climate | NOAA NCEI U.S. Climate Normals 1991–2020, annual/seasonal (snowfall, 32 °F freeze dates, season length) | U.S. government work; cite it | Yes | "NOAA NCEI U.S. Climate Normals 1991–2020 (doi:10.25921/4ek7-fk11)" |
| Privacy | Microsoft Global ML Building Footprints | CDLA Permissive 2.0 | Yes | "Building footprints: Microsoft (CDLA Permissive 2.0)" |
| Privacy (fallback) | OpenStreetMap buildings via Overpass | ODbL | Yes, with share-alike on the derived database | "© OpenStreetMap contributors" |
| Long view | The screen's own 30 m DEM (USGS 3DEP) | Public domain | Yes | (the DEM's existing line) |
| Airport | Settings' list; OSRM (existing) | as today | as today | as today |
| Bike to a long trail | Curated list (VA DCR, vacreepertrail.org, OSM); OSRM | DCR: public; OSM: ODbL | Yes (OSM share-alike on coordinates) | "Trail access points: Virginia DCR, OpenStreetMap contributors" |
| Internet | FCC Broadband Data Collection, fixed and mobile bulk data | "Free and not subject to copyright"; locations are placed at H3-8 only (CostQuest's Fabric) | Yes | "Source data: FCC Broadband Data Collection" |

**The study region** is 35.8–37.4°N by 79.9–82.7°W: the fixtures' counties and their neighbours. Baked sizes:
- PRISM: a few KB per variable;
- the NOAA stations: about 25 records;
- footprints: about 15 tiles reduced to a few MB, split into 0.1° tiles;
- trails: a few KB;
- FCC: tens of KB per state once aggregated to H3-8.

## 4. Where they show

- **The card:** the new rows in the person's tiers, each with its panel ("How it's scored" with the source's
  attribution and date).
- **The grid's columns and the phone strip:** factorCells picks up a new row. The short labels are Hosp, Climate,
  Privacy, View, Airport, Bike and Net.
- **Compare:** "What money can't add" picks up a new row.
- **The export:** One page's tiers pick it up. Full gets a section per factor (Climate, Privacy, Long view, Internet;
  Hospital, Airport and Bike join Drive times). The data sources list names the new sources.
- **Best-site ranking (step 7):** Climate, Privacy and Long view join SITE_ROWS, measured per site.

## 5. Implied placements for existing lists (the only auto-placements)

| Factor | From | Placement |
|---|---|---|
| Hospital | Town's card (it graded the ER) | Town's tier, just after it; a Town ER limit moves to Hospital |
| Climate | Q1 answered (not Either) | Really want |
| Privacy | Q8: See their lights / Never know | Nice to have / Really want |
| Long view | Q3: View / Both | Really want / Nice to have |
| Airport | Q7: fly a few times a year or monthly | Nice to have |
| Bike to a long trail | Q4: Bike from home | Really want |
| Internet | Q7: Video calls from home | Really want; otherwise Nice to have (the brief's default) |

Everything else goes to Don't care. The notice lists every added factor, and Undo puts them all back.

## 6. UX

- **The main task:** open a parcel, and the new rows read in the person's order with a letter and a short value
  ("Jan low 21 °F, Jul high 83 °F"; "nearest house 1,100 ft, none in sight"; "view 6+ km to the NW, 22% open"; "ROA 58
  min"; "New River Trail, Fries, 24 min"; "dish spot 95% clear, 180 ft from the house"). Tap for the panel.
- **What you see first:** the letter and its short value; detail in the panel.
- **States:**
  - **Not measured:** "not measured: grade again", with the Grade again button the card already has.
  - **Outside the data's area:** "not measured: outside the data's area".
  - **Loading:** the section's existing wait.
  - **A source down:** that factor alone is unknown, and the rest grade.
- **Plain labels:** "in winter, with leaves down" (Privacy), "trees not counted" (the dish), "6+ km" (the profile's
  reach), and the station's name and elevation (Climate).
- **The phone at 375 px:** rows and panels as today, with 44 px targets. The strip gains short labels.
- **Contrast and consistency:** the card's letter chips and the marks. A new factor's notice uses What matters' existing
  notice style.

## 7. Settings and storage

- `ps.rubrics` gains `factorsAdded` (optional).
- The interview answers gain `winter` and `summer` (optional; Q1's follow-ups).
- No other storage changes. The baked data ships with the app.

## 8. New strings (each PR adds its own; listed in its description)

- **Rows:** Hospital · Town and groceries · Climate · Privacy · Long view · Airport · Bike to a long trail · Internet.
- **The notice:** "New factors to place: {list}" · Place them · Undo.
- **The questions:** "Winters: Mild · Some snow · Real winter welcome" · "Summer heat: Keep it cool · Warm is fine · Hot is
  fine".
- **The why lines:** "You'd rather mild winters" … (one per choice).
- **States:** not measured: grade again · not measured: outside the data's area · in winter, with leaves down · trees not
  counted · 6+ km.

## 9. Stop conditions

- A change to an existing `expected.json` value, or to a fixture's grade or verdict, beyond §2.1's declared mapping.
- A source's terms turn out to forbid the bake-in. Stop and say which.
- A fixture's new request can't be appended without changing an existing entry.
- The same CI failure survives 3 attempts.

## 10. Test plan outline

- **Unit, per factor, with synthetic cases:**
  - Climate: a hollow vs a ridge, the lapse rate, the station pick;
  - Privacy: a neighbour in sight, a house behind a ridge, the parcel's own barn excluded, a shed under 60 m²;
  - Long view: a ridge-top vs a hollow, the 6+ km cap, the direction;
  - Bike to a long trail: the nearest access point, a closed one;
  - Internet: an open bench vs a north-facing hollow, the north weighting;
  - Hospital and Airport: the split, the limits moved, the bands.
- **Not measured:** an old screen's unknown never fails a Must, and holds at Maybe only when it's a Must.
- **The add-once notice** and the implied placements (§5), with Undo.
- **Each PR's `expected.json`:** purely additive, with the leaf diff in the PR.
- **e2e:** a new row on the card, the notice, and Grade again filling a "not measured".
- **Screenshots** at 1280 and 375 per factor on Mud Creek, Ferney and Roan.
- **The fresh-eyes review** before the hand-back.

## 11. PRs

| PR | What | Engine bump |
|---|---|---|
| 0 | This plan | – |
| 1 | Hospital, split from Town; ENGINE_CURRENT_FROM; `factorsAdded` and the notice | no |
| 2 | Climate: PRISM and NOAA bake-ins, the Q1 follow-ups | yes |
| 3 | Privacy: the footprint tiles, line of sight | yes |
| 4 | Long view: `sun.profileKm` and per-site view | yes |
| 5 | Airport | no |
| 6 | Bike to a long trail: the trail list, the appended OSRM request | yes |
| 7 | Internet: the dish spot, the FCC bake-ins, `h3-js` | yes |
| 8 | The fresh-eyes review's fixes, docs (REQUIREMENTS, phase-0 §9.66, PLAN row 11, polish.md) | – |

Then the hand-back from `step/11-new-data` to main.

## 12. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Old screens and the engine bump:** ENGINE_CURRENT_FROM = 22, so a kept screen stays current and its new factors
   read "not measured" (recommended: the brief's "old screens aren't dropped", which a bump alone would break).
2. **New fields:** optional on v9, the §9.65 exception extended (recommended: the brief's "new fields only", no clean
   break).
3. **Climate's source:** PRISM 800 m temperatures plus NOAA stations' snowfall and frost dates, the stations not
   adjusted for elevation (recommended: PRISM has no snowfall or freeze dates; the stations do).
4. **Footprints:** Microsoft Global ML (CDLA Permissive 2.0), baked as 0.1° tiles, with Overpass as the fallback
   (recommended: the most permissive license, the newest imagery, and better Tennessee coverage than OSM).
5. **The interview:** Q1's two follow-ups; Q3, Q4, Q7 and Q8 used as they are (recommended: they already ask).
6. **Airports:** Settings' list as it is; GSO and LYH offered in its help line, not added to the defaults (recommended:
   adding them changes every run's input).
7. **Bike to a long trail's minutes:** a separate OSRM request (recommended: keeps the existing drive request's
   recording byte-identical).
8. **Internet's FCC data:** baked per state at H3-8, with `h3-js` as the one new dependency (recommended: no token, and
   no API terms).
9. **The starting list:** new factors weigh 0, and Hospital takes Town's weight (recommended: keeps the default card the
   oracle's, except the declared split).
10. **Houses:** buildings of 60 m² and up, not on the parcel (recommended: drops sheds and the parcel's own barn).

## 13. Decision

phase-0.md §9.66, written in PR 8.
