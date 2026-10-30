# Step 17: Climbing

Zach pre-approved the brief on 2026-10-30. Zach and Julie climb, mostly on rope (sport and trad), and are open to
bouldering. The mission runs on this plan's recommended answers (§11), and the hand-back flags each one.

**Sources:**
- Zach's brief of 2026-10-30;
- `docs/plans/step-14d-places.md`, the template: the baked places, Paddling as a factor, the interview's two-row
  question, the area catalog's `paddleMin`, and the Places layer;
- `docs/plans/step-11-new-data.md`, which covers how a factor is added.

**Decision:** §9.77, written in the hand-back's docs PR.

**Mission mode:**
- The work runs on `step/17-climbing`, branched from main after step 16's hand-back (#382) merged.
- Each row of §10 is one PR into it, which I merge when CI is green on its head.
- The step ends with the hand-back to main, which Zach merges.

## 0. What's there, and what the brief needs (found while planning)

- **The baked places** (`lib/screen/placeData.ts`, `public/places/v1/`) are 1° cells in one folder per licence:
  - `osm/` holds OpenStreetMap's places, under the ODbL;
  - `official/` holds USFS's, Recreation.gov's and the states'.
  - A cell is `{ version, folder, cell, baked, places }`. `index.json` lists the sources and each folder's cells.
  - **Offline:** Save offline already keeps the index and every listed cell within 0.6° of the parcel
    (`lib/offline/plan.ts`), folder by folder. A new folder listed in the index is kept offline with no change there.
- **Paddling is the pattern.** It has:
  - an optional `paddling` on the result (§9.73, extending §9.65's exception);
  - one OSRM table of its own to the nearest launches (`lib/screen/paddling.ts`);
  - the row's bands `paddleMin` [15, 30, 45, 60];
  - an interview question with two rows (`paddle`, `paddleDrive`), where the second row's answer sets the B edge and
    `setBandEdge` keeps the bands' spacing;
  - a place in `NEW_FACTORS` and `NEW_QUESTION`, which gives older profiles the "New factors to place" notice;
  - musts as `atMost` in minutes;
  - the area catalog's `paddleMin` in the same batched OSRM tables;
  - a Places sub-toggle.
- **Versions now:**
  - `ENGINE_VERSION` 34, `ENGINE_CURRENT_FROM` 29;
  - `SCREEN_SCHEMA_VERSION` 9;
  - `AREA_FILE_VERSION` 2, so `/areas/v2` holds the thirty area files;
  - `PLACES_VERSION` 1.
- **The network:** this session reaches none of OSRM, Overpass or OpenBeta. As in 14d, the network work runs on
  GitHub's runners through `.github/workflows/places.yml`, requested in `.github/places-run.json`. That covers the
  re-recordings, the area profile and the parking check (§2.3).
- **OpenBeta** (the brief asks):
  - **Licence:** its climbing data is published under CC0 (public domain), and its code under the AGPL.
  - **Provenance:** much of its data was copied from Mountain Project.
    - onX (Mountain Project's owner) sent OpenBeta a cease-and-desist and a DMCA notice in 2021. GitHub reinstated the
      repository, and the EFF argued that names and locations are facts.
    - In 2024 onX asked OpenBeta to remove all Mountain Project content. I found no public outcome.
  - **Its positions:** an area's point in OpenBeta is a crag's or a sector's, not where to park.
  - **Its bulk files:** the repository says they're "temporarily unavailable"; the GraphQL API is live.
  - **Recommended:** don't import OpenBeta (§11, Q1). The curated list is enough for a drive-time factor and is what
    the brief asks for. Its positions come from the sources in §2.3, not from OpenBeta or Mountain Project.

## 1. The rules

- **Climbing is additive, as Paddling was:**
  - an optional `climbing` field on `ScreenResult`, with `SCREEN_SCHEMA_VERSION` staying 9 (§9.77 extends §9.65's
    exception, as §9.73 did);
  - the shape snapshot (`schema-v9.test.ts`) gains the optional field;
  - `ENGINE_VERSION` 34 → 35, with `ENGINE_CURRENT_FROM` staying 29: an older grade has no Climbing row until it's
    graded again;
  - `expected.json` changes are additive only (rule 7: new text after existing text), with the `pnpm diff:prototype`
    line in the PR.
- **Rubric:**
  - Climbing is a new factor at weight 0 until the interview places it.
  - Existing profiles get the "New factors to place" notice and the new question.
- **The data is ours, hand-curated, in `lib/screen/data/crags.json`.**
  - It's baked into the places' cell format in a third folder, `curated/`, so it loads, caches and goes offline as the
    other places do.
  - It's baked locally (`pnpm data:crags`). No network is needed.
- **The area catalog changes shape:**
  - a new measure, so `AREA_FILE_VERSION` 2 → 3 and `/areas/v3`, a clean break;
  - the thirty files regenerated on the runners, and `/areas/v2`'s area files removed.
  - The sample parcels keep their version.
- **What doesn't change:**
  - no other factor's numbers move;
  - Paddling, Trails and every other row are untouched.

## 2. The data: `lib/screen/data/crags.json`

### 2.1 An entry
```jsonc
{
  "id": "foster-falls",                  // stable, kebab-case
  "name": "Foster Falls",
  "parking": [35.1817, -85.6738],        // [lat, lon], the climbers' lot, 5 decimals
  "types": ["sport"],                    // any of "sport", "trad", "bouldering", "top-rope"
  "access": "South Cumberland State Park; open dawn to dusk; climbing-area parking fills on fair weekends.",
  "source": "https://tnstateparks.com/parks/south-cumberland",   // where the access note was read
  "parkingFrom": "osm:way/123456789",    // where the parking point came from (§2.3)
  "checked": "2026-10-31"
}
```
- **The checks.** A Zod schema checks each entry: ids are unique, at least one type, a note of at most 160 characters,
  a source URL, and parking inside the bake's bounds.
- **A rope area** is one whose types include `sport` or `trad`, as the brief defines it.
  - A top-rope-only area is listed, drawn and timed, but isn't counted as a rope area (§11, Q4).
- **The access note** is one line in our own words: permits, seasonal raptor closures, fees, waivers, hunting
  seasons, "access-sensitive: park only in the lot".
- **One entry per parking area.** A big area with separate lots gets one entry per lot, named "<Area>: <part>" (for
  example "New River Gorge: Endless Wall" and "New River Gorge: Bridge Buttress"), since the drive is to a lot (§11,
  Q5).

### 2.2 What's in it
The region is VA, NC and TN plus about 100 miles. It starts with the brief's list, each a land manager's or a climbing
coalition's documented area:

- **Tennessee:**
  - the Chattanooga areas: Tennessee Wall, Sunset Rock, Foster Falls, Stone Fort (Little Rock City), Denny Cove and
    Castle Rock;
  - the Obed: Lilly Bluff and the Lilly Boulders, and North Clear Creek.
- **Georgia and Alabama:**
  - Rocktown, on Pigeon Mountain;
  - Horse Pens 40;
  - Little River Canyon.
- **North Carolina:**
  - in the mountains: Looking Glass Rock, Linville Gorge (Table Rock, and Shortoff), Rumbling Bald, Whiteside Mountain,
    Cedar Rock and Laurel Knob;
  - in the Piedmont: Stone Mountain State Park, Moore's Wall (Hanging Rock State Park), Pilot Mountain, Crowders
    Mountain, Rocky Face and Sauratown.
- **Virginia:** Grayson Highlands bouldering, Hidden Valley (Washington County), the Breaks, Great Falls Park, Old Rag,
  Little Stony Man and Dragon's Tooth.
- **West Virginia:** the New River Gorge (Endless Wall, Bridge Buttress, Kaymoor), Summersville Lake, Seneca Rocks and
  Coopers Rock.
- **Kentucky:** the Red River Gorge (the Gorge itself, Muir Valley and the PMRP), about 75 miles from Virginia's line.
- **South Carolina:** Table Rock State Park.

**Left out:**
- areas closed to the public, Hound Ears among them;
- areas whose only access is by private arrangement.

PR 1 lists every entry and every exclusion with its reason. About 45 entries are expected.

### 2.3 Where each field comes from (into `docs/commercial-review.md`)
- **Names, types and access notes:** read from the land manager's page (NPS, USFS, a state park or WMA) or the local
  climbing coalition's area page:
  - the Carolina Climbers Coalition;
  - the Southeastern Climbers Coalition;
  - the Access Fund;
  - the New River Alliance of Climbers;
  - the Red River Gorge Climbers' Coalition.
  - Each note is written in our own words, and the entry keeps the page as its `source`. These are facts, not copied
    text.
- **Parking points:** a one-off check on the runners (`scripts/data-crags-check.mts`, `places.yml`'s new `crags` job).
  - For each entry's position, it lists the OSM parking lots within 1.5 km and any OSM `climbing=*` or `sport=climbing`
    feature within 3 km, with names and distances.
  - I pick the climbers' lot by hand and record it as `parkingFrom: "osm:way/…"`.
  - Where OSM has no lot, the entry takes the manager's published trailhead, and says so in `parkingFrom`.
  - About 45 points taken once is an insubstantial extract under OSM's Substantial guideline (fewer than 100 features),
    so it needs attribution only. commercial-review.md says so, and the curated folder's index entry credits OSM.
- **Not used:**
  - **Mountain Project:** its terms forbid copying its content.
  - **OpenBeta:** its provenance is contested (§0).
  - **Guidebook text.**

### 2.4 The bake: the `curated/` folder
- **A new place kind,** `crag`: `{ kind: "crag", id: "crag:<id>", name, ll: parking, src: "crags", types, access,
  checked, url }`.
- **`PLACE_FOLDERS`** gets `curated`, and **`PLACE_SOURCES`** gets `crags`.
- **The index:**
  - `cells.curated` is optional, so an index saved offline before this step still parses;
  - `crags` is listed among the sources, credited "Parcel Screen, from the land managers and climbing coalitions;
    parking © OpenStreetMap contributors", under its own licence.
- **`pnpm data:crags`** (`scripts/data-crags.mts`) writes `public/places/v1/curated/<cell>.json` and updates the index's
  `curated` cells and its source entry. It's deterministic, and the same file writes the same cells.
- **The monthly refresh** (`pnpm data:places`) keeps the curated folder and its index entry as they are; only
  `data:crags` writes them.
- **The fixtures' frozen places** (`pnpm places:freeze`) take the curated cells they use too.

## 3. The measurement (`climbing`, optional)

- **Which crags:** from the drive start (`driveStart`), the crags within `climbing.maxKm` (150 km) in a straight line,
  read from the curated cells. Then:
  - the nearest `climbing.ropePoints` (12) rope areas;
  - the nearest `climbing.boulderPoints` (3) bouldering areas;
  - one OSRM table of its own to all of them, at most 15 destinations (as `paddling.ts` does).
- **Stored:**
  ```
  climbing: {
    rope: { id, name, types, min, mi } | null,   // the nearest rope area by road
    boulder: { id, name, min, mi } | null,       // the nearest bouldering area by road
    ropeWithin: number,                          // rope areas within climbing.countWithinMin (60) minutes
    timed: { id, min }[],                        // every crag the table answered, for the Places tap card
  }
  ```
  - `rope` is null when no rope area is within reach or OSRM routes to none, and likewise `boulder`.
  - The field is left out, with "Climbing area drive times" in `noResponse`, when the cells or the table don't answer.
- **The 60 minutes is a constant,** not the person's edge, as the brief says (§11, Q3).

## 4. The factor

- **Its row:** "Climbing", key `climbing`, in `ROW_KEYS`, at weight 0 by default.
  - Bands `climbMin` [30, 60, 90, 120]: an A at 30 minutes or less, then B, C and D at 60, 90 and 120, and F beyond.
    It's graded on the rope area's minutes only.
  - The editor's slider runs 10–180 in steps of 5.
- **The row's line:** "38 min to Hidden Valley (sport, trad)".
  - With no rope area within 150 km: "No sport or trad area within 150 km".
  - Not measured (an older grade), or not answered: the row's existing wording.
- **The second line:** "Bouldering: Grayson Highlands, 22 min. 3 rope areas within an hour."
  - With no bouldering area within reach: "No bouldering area within 150 km. 3 rope areas within an hour."
  - "1 rope area within an hour" when there's one, and "No rope area within an hour" when there's none.
- **The detail, on tap:** the rope area's access note, "Access: <note>", then its source as a link.
- **Musts:** `atMost` in minutes, as Paddling.
- **Everywhere a factor is named:**
  - card panels, words, answers, the rulebook and the area words, as Paddling was added;
  - the Help page's "Where the data comes from" section gets the curated list.

### 4.1 The interview
- **One question, question 4's third screen, after the paddle question (§11, Q6).** It has two rows, as `paddle` does.
  - Scene: "A cool, dry Saturday with nothing planned. A day on the rock?" (first "Rope and a rack, or a crash pad?",
    changed after the fresh-eyes review: it offered a choice the answers don't make).
  - First row, "How often do you climb outside?":
    - "Rarely or never" → Won't;
    - "A few times a season" → Could;
    - "Most weekends we can" → Should.
  - Second row, "The longest you'd drive for a day of climbing?": "45 min", "An hour", "90 min", "2 hours".
    - It sets the B edge of `climbMin` (60 by default), and `setBandEdge` keeps the 30-minute spacing.
    - "Rarely or never" skips the second row.
- **Points:** Could 1, Should 3, after `paddling` in `TIE_ORDER`.
- **Existing profiles:**
  - Climbing joins `NEW_FACTORS`, with `NEW_QUESTION` set to `climb`.
  - The profile gets "New factors to place", and Climbing lands in Don't care until it's answered.

## 5. The area catalog

- **A new measure, `climbMin`:** each sample point's drive to the nearest of its 3 nearest rope areas by straight line,
  from the curated cells. It goes in the same batched OSRM tables, as one more destination set (`lib/areas/drives.ts`).
- **The factor:** Climbing at area scale, on the card's `climbMin` bands, with its area words:
  - "a rope area <n> min away";
  - "<n> minutes to a rope area";
  - "within <n> minutes of a rope area";
  - "<n>-minute rope-area limit".
- **The files:** `AREA_FILE_VERSION` 3 and `/areas/v3`, regenerated by `places.yml`'s areas job. The v2 area files are
  removed, and the sample parcels stay where they are.
- **The re-rank report for the hand-back** (`scripts/areas-climbing-rank.mts`, run locally on the committed files):
  - the top 10 under a test rubric, then the top 10 with Climbing added last in Really want at the 60-minute default;
  - each area's rank, its letter, and its `climbMin` median;
  - the test rubric is the one the interview generates from a fixed set of answers (§11, Q7).

## 6. The Places layer

- **A "Climbing" sub-toggle,** seventh, after Paddle launches. Like the others, it's on when Places is turned on.
- **Icons, on the same white ring as the other kinds:**
  - a rope area: a carabiner on an orange disc;
  - a bouldering-only area: a boulder on a brown disc;
  - an area with both shows the rope icon, and its card lists every type.
- **The key line:** "Climbing: orange for rope (sport, trad), brown for bouldering."
- **A tap's card:**
  - the name;
  - "Climbing: sport, trad, bouldering" (its types);
  - the access note;
  - the source, as a link;
  - "Checked <date>";
  - "<n> min from this parcel" when the open parcel's grade timed it (`climbing.timed`). Nothing is fetched for a
    tap.
- **Drawn as the other kinds are:** from the cells in view, at zoom 8 and up, and clustered below zoom 12.
- **The layer's attribution** adds "climbing areas: Parcel Screen".

## 7. UX

- **The main flow:**
  - Climbing is one more row, in the tier the interview put it in.
  - Its line answers first ("38 min to Hidden Valley (sport, trad)"), the second line gives bouldering and the
    within-an-hour count, and the access note is on tap.
- **States:**
  - **empty:** no rope area within 150 km, and the row says so;
  - **loading:** the drive-times step as today;
  - **error:** "Climbing area drive times" didn't answer, and the row is unknown, not "none";
  - **slow:** one more small OSRM table, at most 15 destinations.
- **Plain labels:**
  - "rope area" is explained once in the row's detail: "sport or trad";
  - "bouldering" stays as it is, since climbers know it.
- **Phone at 375 px:**
  - the row and its second line wrap;
  - the sub-toggle is a 44 px row;
  - the tap card fits the width.
- **Contrast:** icons on a white ring, as the other kinds.
- **Consistency:** Paddling's row, the interview's two-row screen, and the Places card.

## 8. Strings (declared; rule 7, additive)

- **Card:**
  - "Climbing";
  - "<n> min to <area> (<types>)";
  - "No sport or trad area within 150 km";
  - "Bouldering: <area>, <n> min.";
  - "No bouldering area within 150 km.";
  - "<n> rope areas within an hour", "1 rope area within an hour", "No rope area within an hour";
  - "Access: <note>";
  - "Rope area: sport or trad".
  - In the row's panel, read after its line and a semicolon (the fresh-eyes review): "bouldering at <area>, <n> min",
    "no bouldering area within 150 km", and the access note bare, without "Access:".
- **Interview:**
  - the scene and the two rows' questions;
  - the seven choice labels and their "why" lines.
- **Area catalog:** §5's four phrases, and the refresh summary's "Rope area".
- **Map:**
  - "Climbing", the key line, and "Climbing: <types>";
  - the attribution addition.
- **Help:** the curated list's line under "Where the data comes from".

## 9. Test plan outline

- **Unit:**
  - **The factor's cutoffs on synthetic cases:**
    - each band's edges (30, 31, 60, 61, 120, 121);
    - each of the interview's four drives moving the B edge;
    - "Rarely or never" placing it in Won't;
    - a top-rope-only area not counted as rope;
    - bouldering never moving the band;
    - the count at 60 and 61 minutes;
    - no rope area within 150 km.
  - **The data:**
    - `crags.json` parses;
    - every id is unique;
    - every parking point is inside the bounds;
    - `data:crags` writes the committed cells (the bake is deterministic).
  - **A fixture's nearest crag:** Mud Creek's (Grayson) `climbing` in `expected.json`, its nearest bouldering being
    Grayson Highlands; and Roan's.
  - **The area catalog:**
    - `climbMin` measured on the recorded area;
    - the factor's area letter;
    - re-ranking under the test rubric, with Climbing added as Really want, moves the areas with the shortest
      `climbMin` up.
  - **`factorsAdd`:** Climbing as a new factor on an older profile.
- **e2e:**
  - the Climbing row on Mud Creek;
  - the interview's question with its two rows;
  - the Places layer's Climbing sub-toggle, with a crag's tap card showing its minutes.
- **Screenshots** at 1280 and 375:
  - the Climbing row;
  - the interview question;
  - Places with Climbing over the Chattanooga areas and over Mud Creek;
  - a crag's tap card.
- **The hand-back's manual test plan** walks Mud Creek, Macks, Ferney and Roan.

## 10. PRs, into `step/17-climbing`

| # | PR | Numbers |
|---|---|---|
| 0 | This plan | None |
| 1 | `crags.json`; the `crag` kind, the `curated/` folder and `pnpm data:crags`; the cells committed; `data-crags-check.mts` and `places.yml`'s `crags` job; commercial-review.md | None (nothing reads it yet) |
| 2 | `climbing` measured; the factor, its row and its lines; the interview question; `NEW_FACTORS`; the fixtures' curated cells frozen and their OSRM re-recorded on the runners | Additive: ENGINE_VERSION 35, `climbing` added to expected.json, the `diff:prototype` line |
| 3 | The area catalog's `climbMin` and `/areas/v3`; the re-rank test and the top-10 report | Area files only |
| 4 | The Places layer's Climbing sub-toggle, its icons and its card | None |
| 5 | Screenshots, the fresh-eyes review, §9.77, PLAN row 17; the hand-back to main | None |

## 11. Questions, each with the recommendation (the mission proceeds on these; each flagged in the hand-back)

1. **OpenBeta.**
   - **Recommended:** don't import it. The CC0 licence would allow it, but its data was largely copied from Mountain
     Project, whose owner demanded its removal in 2024 with no public outcome. Its points are crags, not parking.
   - The curated list covers what a drive-time factor needs.
2. **The bands.**
   - **Recommended:** [30, 60, 90, 120] by default. The interview's drives are 45 min, an hour, 90 min and 2 hours, each
     setting the B edge.
3. **"Within 60 minutes."**
   - **Recommended:** a fixed 60, as the brief says, not the person's own edge.
4. **Top-rope-only areas.**
   - **Recommended:** listed, drawn and timed, but not rope areas. The brief says "rope area (sport or trad)".
   - If Zach wants top-rope to count, it's one line in the classifier.
5. **Big areas with several lots.**
   - **Recommended:** one entry per climbers' lot, named "<Area>: <part>". The drive is to a lot.
6. **Where the question sits.**
   - **Recommended:** question 4's third screen, after paddling. The weekend-fun questions stay together, and the
     numbering doesn't change.
7. **The test rubric for the top-10 report.**
   - **Recommended:** the interview's rubric for answers that place every factor at its default, then the same with
     Climbing as the last Really want at 60 minutes.
   - The hand-back shows the before and after tables, and names each area that moves into or out of the top 10.
8. **The tap card's minutes.**
   - **Recommended:** only for the crags the open parcel's grade timed (`timed`, up to 15). Others show no minutes line,
     and nothing is fetched on a tap, as with 14d's places.

## 12. Stop conditions

- expected.json or verdict/flag text changes beyond §1 and §8 (PR 2's additive Climbing).
- A product decision §11 doesn't cover.
- The same CI failure surviving 3 attempts.
- The plan turning out wrong, for example:
  - fewer than 30 entries can be sourced to a manager's or coalition's page;
  - the parking check finds a lot for fewer than half of them.
