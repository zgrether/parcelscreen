# Step 14: What the land can do

The owner pre-approved the brief and this plan's recommended answers (2026-10-23).

**Sources:**
- PLAN.md row 14;
- `docs/design/workflow-review.md`, "What the land can do, and what it can pay" (Panel 1 and the rules for both
  panels);
- Zach's brief of 2026-10-23.

Step 15 (Panel 2, how it could pay) is out of scope. This step leaves a clear place for its break-even (§5.3), with no
placeholder text.

**Decision:** §9.70, written in the docs PR.

**Mission mode:**
- The work runs on `step/14-land-uses`. Each row of §12 is one PR into it, which I merge when CI is green on its head.
- The step ends with the hand-back to main, which Zach merges.

## 0. What's there today (found while planning)

The brief assumes four pieces of data the app doesn't have yet. Each is filled here as an additive measurement or an
optional field (§2, §3), and declared.

- **Road frontage has no length.**
  - `frontageCandidates()` (`lib/screen/driveway.ts:446`) samples the boundary every 10 m and keeps the points within
    40 m of a road, but only to pick at most three entrances.
  - Each entrance keeps its road's class (`roadClass.mtfcc`, `osm.highway`; follow-up 55), but no frontage length is
    stored.
  - Divide needs feet of public-road frontage, so this step adds that measurement (§2.3).
- **Lines have no easement subtype.**
  - `LineKind` is track, easement or drive (`lib/client/parcelStore.ts:37`), with a condition, a width and "recorded
    in". There's no ROW, utility or scenic.
  - What limits you needs the subtype, so lines gain an optional one (§3.2).
- **No forest or open-ground share in a parcel screen.**
  - NLCD land cover is fetched only by the area profiler (`lib/areas/sources.ts`, the MRLC WCS).
  - Hunt needs a forest share. Camp and pasture need open gentle ground. So the screen measures land cover (§2.4).
- **No water features.**
  - There's no NHD and no Stream mark. Marks are spring, well, septic, building, power, campsite, gate and note
    points, and septic and clearing areas (`lib/report/marks.ts:17`).
  - The screen has the lidar's flow accumulation (`flowAcc`, in the session only).
  - This step adds mapped streams (§2.5) and a Stream mark (§3.2).
- **Other gaps:**
  - No HOA field in Listing: HOA exists only as an interview answer.
  - No deed-restrictions field.
  - No county identity in the result. Parcel records carry their state service's fields, and the TN counties file
    is TN only.
  - No county rules anywhere.
- **The Split tool today:**
  - `keepPiece` saves `{a, b, keep}` into the same parcel's `split` (`components/Explore/exploreState.ts:402`), and
    the boundary becomes the kept piece. The other piece is drawn dashed and never screened.
  - `fitSplit` (bisection to a target acreage) is tested but unused.
  - No e2e test does a full split.
- **Screening a geometry that isn't the open parcel:**
  - `RescreenAll` runs its own `useScreen()` sequentially. Step 12's Try it holds a result unsaved.
  - Combine makes a new list parcel. Nothing screens a piece without making it a parcel. The worker keeps up to 3
    sessions.
- **Optional result fields:**
  - Step 11 added measurements as `.optional()` fields with no schema version bump (§9.65, §9.66: an owner exception
    to the frozen-v9 rule). It bumped ENGINE_VERSION per PR, and ENGINE_CURRENT_FROM stayed put for a
    measurement-only bump.
  - CLAUDE.md names only those two sections, so §9.70 extends the exception to this step's fields.
- **Power lines:**
  - HIFLD Open's "Electric Power Transmission Lines" still answers
    (`services1.arcgis.com/Hp6G80Pky0om7QvQ/.../Electric_Power_Transmission_Lines/FeatureServer/0`). It has VOLTAGE,
    OWNER, STATUS and SOURCEDATE; the item was last modified 2023-09-05. It holds 81 lines in Grayson–Carroll's box.
  - A second, newer copy (`services2.arcgis.com/FiaPA4ga0iQKduv3/...`, edited 2026-05) has 173 lines there, but its
    owner doesn't show in a public search, so its provenance is unknown.
  - OSM `power=line` is the fallback (`lib/screen/osmRoads.ts` is the pattern to copy).
- **NHD:** the National Map's NHD flowlines (`hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6`) answer, but
  slowly: 33 s for Mud Creek's box, 24 flowlines, FCODE 46006 perennial / 46003 intermittent.
- **Where the UI goes:**
  - The Grade | Details switch is two hard-coded tabs driven by a boolean, `info` (`ParcelSwitch.tsx`;
    `exploreState.ts:84`, set true in nine reducer paths). Desktop and phone share one render path
    (`ExploreShell.tsx:287–298`).
  - The Grade view's order is ReportCard (answer, Cost to enjoy, Best homesite, tiers) → Ways to raise this grade →
    How Julie would rate it → Still unknown → the full report.
  - `e2e/results.spec.ts:45` pins the card's own groups; a section outside `.card` doesn't count.
  - The Full report's headings are pinned in `e2e/report.spec.ts:104` and `Full.test.tsx`. One page must fit one
    Letter page for every fixture (`report.spec.ts:65`).

## 1. The rules

- **Outside the grade.** Nothing here changes a letter, points or a verdict.
  - The panel reads the result and the parcel; the card never reads the panel.
  - On every fixture, every grade and verdict is byte-identical before and after this step.
- **Every graded parcel gets the panel.** An ungraded one shows "Grade this parcel to see what you can do here".
- **Each use reads Yes, Maybe: [reason] or No: [reason].**
  - "What decides it" is one tap away: the facts, each with its source and date where data drives it.
- **Plain facts, no advice.** One line at the bottom: "Not advice: check with the county, a surveyor or a land-use
  attorney before acting."
  - Power lines are distances and voltages only, with no health claims.
  - Hunting states the law's basics, with its source.
- **County rules are config.** They're dated, sourced, and carry a confidence word.
  - Anything not read from the ordinance itself is marked "to confirm".
  - Outside the ten counties: "not covered here yet" on Divide and on Hunt's county parts.
- **A split never makes a parcel unless the person says so.** A scenario lives on its parcel and syncs with it.
- **New measurements are additive.**
  - Optional result fields (§9.70 extends §9.65/§9.66), ENGINE_VERSION bumped per PR, ENGINE_CURRENT_FROM unchanged.
  - Recordings appended (`PORT_APPEND`, Mud Creek append-only).
  - `expected.json` changes are additive only.

## 2. New screen measurements (additive)

The brief names two: the power-line distance and the trail-network length. §0's gaps add four more, all needed by a
use and none graded:
- frontage length;
- land cover;
- mapped streams;
- the parcel's county and zoning district.

Each is an optional field on `ScreenResult`. Its failure goes to `noResponse`, never to `failed`.

### 2.1 Power lines (`power`)
- **Source:**
  - HIFLD Open transmission lines, within 3 km of the parcel. One ArcGIS query, fields VOLTAGE, OWNER, STATUS and
    SOURCEDATE; geometry kept for the distance.
  - **Recommended:** HIFLD Open first, for its official provenance, and OSM `power=line` and `minor_line` within 3 km as the
    fallback when HIFLD doesn't answer or has nothing near. The unknown-owner newer copy isn't used.
- **Measured:**
  - The distance from each site (its footprint point) and from the house mark to the nearest line.
  - Whether any line crosses the parcel, and its length inside.
  - The nearest line's voltage (when known), owner and source with its date.
- **Stored as** `power: { lines: [{ kV|null, owner|null, source: "hifld"|"osm", date }], nearestFt (per site:
  sites[].powerFt), crosses: boolean, insideFt }`.
- The map shows the lines within 1 km as a layer. Map layers › "Power lines" is off by default.

### 2.2 Trail network (`trails`)
- **What it estimates:** how much walking trail the parcel's gentle ground could hold. "Gentle" means ≤ 15% slope,
  worded "gentle ground", never "under mature trees": canopy isn't confirmed.
- **How, said in the panel:**
  - Take the fine-DEM cells (3 m) inside the boundary at ≤ 15% slope.
  - Leave out the lidar's drainages (flow accumulation ≥ `streamContributingM2`) and the flood zone.
  - Keep the patches of at least 0.25 ac that touch each other.
  - The estimate is their area divided by one path every 100 ft (`uses.trailSpacingFt`), so "about 1.4 mi of trail
    on 8 ac of gentle ground, at a path every 100 ft".
- **Stored as** `trails: { gentleAc, miles }`. It's computed in the terrain step from rasters it already has, with no
  request.

### 2.3 Road frontage (`frontage`)
- **What it measures:** the length of the boundary within `entranceMaxDistM` (40 m) of a road, by road. It counts the
  same 10 m samples `frontageCandidates()` already takes.
- **Public or not:**
  - A road is public when TIGER's MTFCC is S1100–S1400 (primary, secondary, local roads). Private, service and
    vehicular-trail classes don't count.
  - OSM roads count only when not `access=private` / `no` and not `highway=service` / `track`.
- **Stored as** `frontage: { publicFt, roads: [{ name, ft, public }] }`. No request: it's measured from the roads the
  screen already has.

### 2.4 Land cover (`cover`)
- **Source:** NLCD 2021 (MRLC WCS, as `lib/areas/sources.ts` reads it): one 30 m grid over the parcel.
- **Measured inside the boundary:**
  - forest % (classes 41–43);
  - open % (grass, pasture, shrub, barren: 31, 52, 71, 81, 82);
  - open gentle ground in acres (open cells at ≤ 15%), and the open gentle acres within 300 ft of the drive route or
    entrance.
- **Stored as** `cover: { forestPct, openPct, openGentleAc, openNearAccessAc, year: 2021 }`.

### 2.5 Mapped streams (`streams`)
- **Source:** NHD flowlines (the National Map, layer 6), within the parcel's box plus 300 ft. A 60 s timeout, run
  alongside the other near-step requests.
- **Measured:** the length inside the parcel, perennial vs intermittent (FCODE), the names, and the nearest's distance
  from the best site.
- **When NHD doesn't answer:** `streams` is absent and its name goes to noResponse. The Water line then falls back to
  the lidar's drainages, worded "a drainage the lidar shows (it may run only after rain)".
- **Stored as** `streams: { perennialFt, intermittentFt, names, nearestFt }`.

### 2.6 County and zoning (`county`)
- **County:** the parcel centroid's county from TIGERweb's counties layer (FIPS and name): one request.
- **Zoning:** where the county publishes a zoning GIS layer (§4, PR 1 finds which), the district at the centroid and
  any other district the parcel touches.
- **Stored as** `county: { fips, name, state, zoning: { districts: [code], layer, date } | null }`.
- **Without a layer:** `zoning` is null, and Divide assumes the rural default, saying so.

## 3. What the panel says (computed at display time)

Each use is one module in `lib/uses/` (pure TS, no DOM). It takes the result, the parcel's marks, lines and listing,
the county rules and the person's rubric where the card's answers are restated. It returns
`{ answer: "yes"|"maybe"|"no", reason, decides: Fact[] }`, where a Fact is `{ label, value, source?, date? }`.

### 3.1 The uses

| Use | Yes | Maybe | No |
| --- | --- | --- | --- |
| **Camp now** | A Campsite mark or Clearing area, or ≥ 0.25 ac of open gentle ground within 300 ft of the access (`cover.openNearAccessAc`), reachable by the 4x4, plus step 10's Ready to camp | Reachable only after a pioneer track; or open ground only, farther than 300 ft from the access; or the camp cost needs an easement | No way in (`costToEnjoy` noWay), or no open or marked spot and the card's best site is "too small" |
| **Build** | The card's best site fits, septic isn't poor, and access passes: restated plainly ("A 2.1 ac site at 3,640 ft, conventional septic likely") | A gate warns (septic modified/alternative, an easement needed, a site in the flood zone): the reason is the card's | A gate fails, or no site |
| **Trails and walking woods** | ≥ 0.5 mi of trail (§2.2) | 0.2–0.5 mi | < 0.2 mi: "Mostly steeper than 15%" |
| **Garden, orchard, animals** | A garden patch, its frost position not a pocket, and water (a Spring/Stream mark, a perennial stream inside, or a Well mark). Animals: open gentle ground ≥ 2 ac (`uses.pastureAc`) | A garden but frost pocket or no water; or 0.5–2 ac of open gentle ground: "room for small stock" | No garden ground and < 0.5 ac open |
| **Hunt** | ≥ 10 ac (`uses.huntMinAc`) and ≥ 50% forest, or adjoining open-access public land; the county's discharge rule allows it at the parcel's distances | Under 10 ac, or houses within ¼ mi (step 11's Privacy `near` > 0), or the county's discharge setback leaves little room, or the county isn't covered | The county bans discharge here (a mapped district or a setback the whole parcel falls inside) |
| **Ride, ski, snowshoe from home** | Adjoining open-access public land, or a long trail ≤ 3 mi by bike (step 11) | A long trail 3–10 mi, or gentle ground for your own loop (§2.2 ≥ 0.5 mi) | Neither; neighbours' corridors are private unless they agree (said every time) |
| **Divide** | Up to N lots (N ≥ 2), with the binding limit named, plus "Try a split" | 2 lots only by an exception (family division, private road), or the district isn't known ("assumed rural default") | 1 lot: "Limited by …", or the county isn't covered: "not covered here yet" |
| **What limits you** | (a list, not an answer) Easements drawn, by subtype; deed restrictions text; HOA; flood zone acres; power lines (distance from the house site, crosses or not, voltage) | | |

- "Ski" makes no snow claim: "snow cover isn't measured".
- Hunt's state basics (license, Sunday hunting, blaze orange) and any county discharge ordinance are config (§4),
  dated and sourced.

### 3.2 New parcel fields (optional, synced with the parcel)
- **Listing:**
  - "Deed restrictions" (free text) and "HOA" (Yes / No / Not known) in Listing, beside Agent.
  - Both `.default("")` / `"unknown"` in the parcel schema, so the store stays `v: 2` and older parcels read fine
    (the `addedBy` precedent).
- **Lines:** an easement gains an optional subtype: Road right-of-way / Utility / Scenic / Other.
- **Marks:** a "Stream" point mark joins Spring and Well (`markChoices.ts`).
- **No numbers change:** none of these feed the engine or the card.

### 3.3 Divide's arithmetic (`lib/uses/divide.ts`)
- **The base count:** `lots = min(floor(acres / minLotAc), floor(publicFt / frontagePerLotFt))` under the district's
  rules.
- **The binding limit is named,** for example "Up to 3 lots: limited by 600 ft of road frontage at 200 ft per lot".
- **Exceptions** (family division, private-road lots) are shown as "could allow more: …" with their rule, never
  added to N.
- **Subdivision review thresholds:** "From N lots the county reviews it as a subdivision".
- **Without county-wide zoning:** the subdivision ordinance's and health department's minimums apply, said as such.
- **Pure:** unit-tested on synthetic parcels (frontage-limited, size-limited, no zoning).

## 4. County rules (`lib/config/counties.ts`)

**Counties:**
- Floyd, Grayson, Carroll and Patrick (VA);
- Ashe, Alleghany, Avery and Mitchell (NC);
- Carter and Johnson (TN).

**Per county:**
- county-wide zoning (yes/no);
- the rural district(s) that apply by default;
- minimum lot size;
- public-road frontage per lot;
- private-road and family-division exceptions;
- the subdivision review threshold;
- any firearm-discharge ordinance near dwellings;
- the zoning GIS layer's URL, where there is one.

Each item carries its source URL (the ordinance section), the date checked and a confidence word ("from the
ordinance", "from the county's summary", "to confirm").

**Per state:** hunting basics (license, Sunday hunting on private land, hunter orange), each with its source.

**PR 1 researched it (2026-10-23).** It's in `lib/config/counties.ts`, each fact with its source and confidence word.
Only Grayson and Carter have county zoning, and only Grayson publishes a zoning map we can read.

| County | Zoning | Rural default | Min lot | Frontage per lot | Exceptions (shown, never counted) | Review | Exempt over | Shooting rule | Map |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Floyd VA | none | — | 2 ac | 100 ft | 25 ac large lots on a 50 ft ROW; family 1 ac; private division road ≤ 10 parcels | agent; ≤ 10 lots per plat | — | 100 yd from highways (to confirm) | — |
| Grayson VA | yes | RF (assumed off-map) | 0.69 ac | 100 ft, or a 40 ft ROW | farm division 4 × 10 ac; family; Class II private street | staff for single, farm, family; else Planning Commission | — | none found | zoning layer |
| Carroll VA | none | — | 0.75 ac | not in the ordinance (to confirm) | flag lots ≥ 1.5 ac (3); family on a 20 ft ROW | agent ≤ 4 lots | — | none found | — |
| Patrick VA | none | — | 1 ac | 50 ft | family on a 20 ft ROW | staff for single lots | 2 ac | 25 ft from highways | — |
| Ashe NC | none | — | 1 ac | 45 ft | family; county-standard private road | staff ≤ 7 lots | 10 ac | not from a state road | — |
| Alleghany NC | Open District | Open District | 0.75 ac | not found (to confirm) | private driveway ≤ 5 lots; family | planner ≤ 5 lots | 10 ac | none found | — |
| Avery NC | none | — | 0.75 ac | 70 ft | panhandle lot; private street; family | administrator ≤ 10 lots | 10 ac | none found | — |
| Mitchell NC | none found (to confirm) | — | 1 / 1.5 / 2 ac by slope | not found (to confirm) | family; private road | Review Board from 6 lots | 3 ac | none found | — |
| Carter TN | yes | A-1 (to confirm) | 0.34 ac (to confirm) | 40 ft (to confirm) | 5 ac lots aren't a subdivision (state law) | planning commission | 5 ac | none found | none found |
| Johnson TN | none | — | not online (to confirm) | not online (to confirm) | 5 ac lots; private-road subdivisions ≤ 5 lots | planning commission; proven water per lot | 5 ac | none found | — |

**What it means for Divide:**
- Carter's figures come from a copy of the zoning resolution, not the county's own, so they're "to confirm".
- Johnson has no minimum lot size online, so Divide says "ask the county" there.
- Floyd and Patrick each had a hearing on changes this fall (2026-09-22, 2026-09-28). Re-check both.

**State hunting basics:**
- VA, NC and TN: the landowner license exemptions, Sunday rules, hunter orange, and road distances.
- They're `STATE_HUNTING` in the same file, each with its statute.

## 5. Split: "Keep this, sell that"

### 5.1 The flow
- **Starting it:**
  - From Divide's "Try a split", or from the toolbar's Boundary › Split.
  - Draw the line with the existing tool. The status reads "Draw where you'd split it".
- **When the line is placed,** "Grade both pieces" runs two screens one after the other in their own worker, as
  RescreenAll does. Progress shows "Grading piece 1 of 2…".
- **The scenario view:** the two pieces side by side (stacked on a phone), each showing:
  - its acres and side name ("North piece, 14.2 ac");
  - its grade under the current person's rubric (`reportCard`);
  - its cost to camp and to build (`costToEnjoy`, no land price);
  - its county check: lot size and frontage pass / fail, each failing piece flagged;
  - its "What you can do here", folded.
- **Actions:**
  - "Rename", "Remove scenario", "Adjust the line" (re-grades).
  - "Add this piece to the list", which makes a new parcel from the same parts with the split kept on that side, as
    combine's "as new" does.
- **The old in-place keep-a-piece:**
  - It's replaced by the scenario (the Split tool becomes the scenario, per the brief).
  - A parcel saved with a `split` keeps showing its kept boundary, read as before.
  - Recommended: no converter. The clean-break rule allows dropping it, and keeping the reader costs nothing.

### 5.2 Storage
- `WorkingParcel.scenarios: { id, name, a, b, screens: { left: id|null, right: id|null }, at }[]`, `.default([])`.
  - It syncs with the parcel, as lines do.
  - The pieces' screens are kept with `addScreen` and synced, but not in `screenIds`. The parcel's own history is
    unchanged.
- **What each piece is graded with:**
  - lines as drawn (the engine measures the part inside);
  - marks filtered to those inside the piece;
  - the house mark only if inside.

### 5.3 Room for step 15
- The scenario view has one row per piece-level figure. Step 15's break-even becomes another row there.
- Nothing is shown for it now: no placeholder text.

## 6. The panel: where it goes (two options, mocked up)

Both options were mocked up on Mud Creek at 1280 and 375, with illustrative values:

| | Desktop (1280) | Phone (375) |
| --- | --- | --- |
| A. A section in Grade | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step14/plan/desktop-plan-a-section.png?raw=true) | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step14/plan/phone-plan-a-section.png?raw=true) |
| B. A third segment, Uses | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step14/plan/desktop-plan-b-segment.png?raw=true) | ![](https://github.com/zgrether/parcelscreen/blob/pr-assets/step14/plan/phone-plan-b-segment.png?raw=true) |


- **A. A section in Grade, after "Ways to raise this grade".** It's one scroll with the card. But Grade is already
  long, and on a phone the panel sits five sections down.
- **B. A third segment: Grade | Details | Uses.**
  - Its own place, one tap from anywhere on the parcel. "Outside the grade" is literal: the Grade tab stays the
    grade.
  - Three segments fit 343 px at about 114 px each, above the 44 px rule.
  - It costs a refactor of the switch from a boolean to a view (`grade | details | uses`) across the nine
    `info: true` paths.

**Recommended: B.** The panel answers a different question from the grade, and Zach's own phrase for it is "next to
the report card but outside the grade". The Grade tab doesn't grow, and Uses is findable on a phone without
scrolling. A shortcut line in Grade, under Ways to raise ("What you can do here: Camp, Build, Trails… › Uses"), links
to it.

## 7. Report export
- **Full:** a "What you can do here" section after "Ways to raise this grade", with each use's answer and reason, the
  limits list, and the not-advice line.
- **One page:** one line under the cost lines, for example "Can divide into up to 3 lots", or "Can't divide: 1 lot
  under Floyd's 5 ac minimum". It shows only when the county is covered.
  - It's one line, so the one-Letter-page check (`report.spec.ts:65`) is watched. If a fixture overflows, the line
    replaces nothing; it goes after the Raise line.

## 8. UX

**The main flows:**
- **See what the land can do** (1 tap from a graded parcel): Uses. Each use shows its answer word and reason, and a
  tap opens "What decides it".
- **Try a split** (3 taps and a drag): Uses › Divide › Try a split, draw the line, Grade both pieces. The pieces show
  side by side.
- **Keep a piece** (1 tap from the scenario): Add this piece to the list.

**What's seen first:**
- The eight answers as a list: the use's name, then Yes / Maybe / No as a chip, then the reason on one line.
- What limits you comes last, as facts.
- The not-advice line sits at the bottom.

**States:**
- Not graded: "Grade this parcel to see what you can do here", with the Grade button.
- Grading: the list's rows as skeletons.
- A measurement didn't load (power, cover, streams): that use says what's missing ("Land cover didn't load: forest
  share not known"). Its answer falls back, with the reason saying so.
- County not covered: "Not covered here yet" on Divide and Hunt's county line.
- No zoning layer: "Assumes the rural default (no zoning map online)".
- Scenario grading: "Grading piece 1 of 2…" and Cancel. A piece that fails to grade shows "This piece didn't grade",
  with Try again.

**Plain words:**
- "Gentle ground" (not "slope class"), "a path every 100 ft", "road frontage".
- "Power line" (not "transmission corridor"). Its voltage is shown as "a 138 kV line".
- "Discharge" only inside the county's own rule quote. Otherwise "where you can shoot".

**At 375 px:**
- Three segments, each ≥ 44 px tall.
- The answer chips sit inline, at a fixed width so the use names line up (the mock-ups show why). "What decides it"
  opens in place, not in a sheet over the sheet.
- The scenario's pieces stack; each piece's grade and cost lead.

**Contrast and consistency:**
- The chips reuse the gate colours (pass / warn / fail): Yes as pass, Maybe as warn, No as fail.
- The text says the word, so colour is never the only signal.
- Sources show as `tiny muted` lines, as on Climate.

## 9. Strings (declared; rule 7, additive)

All new. No existing card, answer or report text changes.
- **Panel:**
  - "What you can do here", "Uses", "What decides it", "Yes", "Maybe", "No";
  - "Not advice: check with the county, a surveyor or a land-use attorney before acting.";
  - "Grade this parcel to see what you can do here".
- **Uses:** "Camp now", "Build", "Trails and walking woods", "Garden, orchard, animals", "Hunt", "Ride, ski, snowshoe
  from home", "Divide", "What limits you". Each answer's reason templates are listed in `lib/uses/words.ts` and in
  the PR that adds them.
- **Divide:**
  - "Up to {n} lots: limited by {what}";
  - "Could allow more: {exception}";
  - "From {n} lots the county reviews it as a subdivision";
  - "Not covered here yet";
  - "Assumes the rural default (no zoning map online)";
  - "Try a split".
- **Split:**
  - "Keep this, sell that", "Draw where you'd split it", "Grade both pieces", "Grading piece {i} of 2…";
  - "{side} piece, {ac} ac", "Passes the county's lot size and frontage", "Under the county's {rule}";
  - "Rename", "Remove scenario", "Adjust the line", "Add this piece to the list", "This piece didn't grade".
- **Limits:** "Road right-of-way", "Utility", "Scenic", "Deed restrictions", "HOA", "Not known", "A {kV} kV power line
  {ft} ft from the house site", "A power line crosses the parcel", "{ac} ac in the flood zone".
- **Report:** "Can divide into up to {n} lots" and "Can't divide: {reason}" (One page), and the Full section's heading.
- **Map:** "Power lines".

**Numbers (new config, `SCREEN_CONSTANTS.uses`):**
- trailSpacingFt 100, trailMaxGradePct 15, trailMinPatchAc 0.25;
- pastureAc 2, smallStockAc 0.5;
- huntMinAc 10, huntForestPct 50;
- campNearAccessFt 300, campMinOpenAc 0.25;
- rideNearMi 3 / rideFarMi 10;
- powerSearchKm 3.

No existing threshold, weight or cost changes.

## 10. Stop conditions
- Any fixture's grade, points or verdict changing, or `expected.json` changing other than additively (new optional
  fields only).
- A source's terms forbidding the use: HIFLD, NHD, NLCD, county GIS.
- A county's ordinance unreadable online for most of its fields. It ships "to confirm" and is said.
- The same CI failure surviving 3 attempts.
- A product question this plan doesn't answer.
- The plan turning out wrong. For example: NLCD's WCS refusing a parcel-sized request from the browser, or NHD too
  slow to finish a screen within its budget.

## 11. Test plan outline

**Unit:**
- **Divide (synthetic parcels):** frontage-limited, size-limited, no county zoning, an exception shown but not added,
  a county not covered.
- **Power:** the distance from a synthetic site to a synthetic line; crossing and length inside; voltage carried; OSM
  fallback when HIFLD is empty.
- **Trails:** on a synthetic DEM (a plane at 10% beside one at 25%), only the gentle half counts. The miles equal the
  area over the spacing, and a drainage cell is excluded.
- **Frontage:** a square beside a synthetic public road and a private one; only the public counts.
- **Each use's yes / maybe / no:** a table of synthetic inputs per use, including each "didn't load" fallback.
- **Rules:**
  - every fixture's grade and verdict unchanged (the card oracle);
  - `expected.json` additive only;
  - every county entry has a source, a date and a confidence word.

**e2e:**
- Uses on Mud Creek: eight answers and the not-advice line; What decides it opens.
- Split Mud Creek: draw the line, grade both pieces, see both graded side by side, each with a county check.
- Add a piece to the list.
- One page has the Divide line; Full has the section.

**Screenshots (1280 and 375):**
- Mud Creek, Ferney and Roan's Uses;
- a split scenario on Mud Creek;
- a parcel crossed by a power line (a fixture, or a synthetic one if none of the four is).

**The fresh-eyes review**, then the hand-back with its 15–30 minute manual test plan.

## 12. PRs, into `step/14-land-uses`

| # | PR | What |
| --- | --- | --- |
| 0 | The plan | This file, and the two mock-ups |
| 1 | County rules | The research, `lib/config/counties.ts` (and state hunting basics), §4's table filled, `lib/uses/divide.ts` and its tests |
| 2 | Power lines and frontage | §2.1 and §2.3: fetch, measure, the Power lines map layer, recordings appended, ENGINE_VERSION 30 |
| 3 | Cover, streams, trails and county | §2.2, §2.4–§2.6, recordings appended, ENGINE_VERSION 31 |
| 4 | The uses | `lib/uses/*`, with Listing's deed restrictions and HOA, the easement subtype and the Stream mark |
| 5 | The panel | The third segment (or the section), What decides it, the not-advice line, the report export |
| 6 | Split as a scenario | §5: grade both pieces, the side-by-side, county checks, saved scenarios, Add this piece |
| 7 | Screenshots, fresh-eyes and docs | §9.70, PLAN row 14, REQUIREMENTS, polish.md; then the hand-back |

## 13. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Where the panel goes:** B, a third segment, Uses (§6), with a shortcut line in Grade.
2. **The four extra measurements** (frontage, land cover, streams, county/zoning): added (§2), because the uses need
   them and the app doesn't have them. Without them Divide, Hunt, Camp and Water would be guesses.
3. **Power-line source:** HIFLD Open first, OSM as the fallback. The newer unknown-owner copy isn't used.
4. **Trail estimate:** area of gentle ground over one path every 100 ft (§2.2), said in the panel.
5. **Pasture size:** 2 ac of open gentle ground for animals, 0.5 ac for small stock.
6. **The old keep-a-piece split:** replaced by the scenario. Saved split boundaries still read; no converter.
7. **A piece's grade:** under the current person's rubric. Lines as drawn, marks inside the piece only, no land price.
8. **HOA:** a Listing field (Yes / No / Not known), since the interview's HOA answer is a preference, not a fact
   about this parcel.

## 14. Decision

§9.70, in PR 7.
