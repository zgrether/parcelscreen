# Boulder potential

Zach pre-approved the brief on 2026-11-04: he's looking for parcels with boulder fields, for bouldering on his own
land. The answer is an estimate from two readings the screen already has. It sits outside the grade: no letter and no
grade moves.

**How it runs:** a small mission on `step/boulders`, branched from main after the Tennessee counties hand-back (#395).
I merge each PR into it when CI is green on its head; the hand-back to main is Zach's.

## 0. What's there (found while planning)

- **Soils:** the result already keeps each major component's map-unit name and component name (`soils[]`:
  `muname`, `compname`), and each map unit's acres and pieces inside the parcel (`soilUnits[]`). So the soil reading
  needs no new request.
- **Elevation:** the fine grid (`dFine`) is fetched at 3 m, with its slope and the parcel's inside mask, during the
  terrain step. It's never stored (CLAUDE.md), so the lidar reading has to run in the engine and store its result.
- **The template for an additive measurement** is Climbing (§9.77): an optional field on the result under §9.65's
  exception, `ENGINE_VERSION` + 1, and `ENGINE_CURRENT_FROM` unchanged, so older grades stay current and simply have
  no Boulders line until graded again.
- **Uses** (`lib/uses/`, `components/Parcel/Uses.tsx`): every row is a use with a Yes / Maybe / No chip that the Grade
  tab tallies. "How it could pay" is a separate block below the rows; it's the template for a line with no chip.
- **Map layers:** Power lines (`components/Map/results/PowerLayer.tsx`) is the template: drawn from the open
  parcel's result, off by default, a toggle under On the map, and a key row.
- **The Favorites grid** (`lib/client/gridColumns.ts`, `components/Library/`): columns are shown unless the stored
  view hides them (`columns.hidden`). Nothing is off by default today, so the column needs an opt-in.
- **The area catalog** (`lib/areas/`): about 200 rural points per area, a median per measure, `/areas/v3`. The
  profiler doesn't read soils today. Where to look ranks by the rubric's fit only; it has no sort.

## 1. The measurement (`lib/screen/boulders.ts`, the result's `boulders`)

- **Soils:** a map unit is flagged when its name, or one of its major components' names, says *bouldery* (very and
  extremely bouldery among them), *rubbly*, *rubble land* or *rock outcrop*. *Stony*, *very stony* and *extremely
  stony* don't count (owner, 2026-11-05: stones of 10–24 in, not boulders); those units are kept apart and shown as
  "Stony ground: rocks, not climbing boulders". Each flagged unit is kept with its acres on the parcel and the words
  found.
- **Lidar texture:** on the 3 m bare-earth grid:
  - **roughness** is the spread (standard deviation over 3 × 3 cells) of the ground's height above its local trend,
    the trend being the mean over 9 × 9 cells (27 m). A plane of any slope passes through its own mean, so a smooth
    hillside reads about zero, and boulders a few feet high read high;
  - a cell is **rough** at a spread of 0.3 m or more, unless it's:
    - **on or beside a cliff:** a connected band of cells steeper than 45°, at least 30 m end to end, and the 27 m
      around it. A boulder's sides are steep at 3 m too, but they make a short blob, not a band;
    - **in or beside a drainage:** more than 1.5 m below the mean of the 63 m around it, and the 9 m around that;
  - rough cells are kept where at least 40% of the 5 × 5 cells around are rough (scattered rough cells are noise),
    in **patches of at least 0.25 ac**. Each patch keeps its centre, acres and outline (the hull of its cells).
- **The acres:** the parcel's cells inside a flagged map unit or a rough patch, each counted once; **likely** where a
  cell is in both, **possible** where it's in one (owner, 2026-11-05).
- **The thresholds** are in `SCREEN_CONSTANTS.boulders` (config.ts).
- **The result's `boulders`:** `{ acres, likelyAcres, soilAcres, soils: [{ mukey, name, acres, terms }], stony: [...],
  rough: { acres, patches: [{ ll, acres, outline }] } | null }`; `rough` is null when there was no fine grid.
- **Calibration so far** (the recorded fixtures):
  - Ferney: nothing;
  - Macks: two rough patches, 0.6 ac (its 237 ac of extremely or very stony soils listed apart since 2026-11-05);
  - Mud Creek: nothing (its 16 ac of very stony soil listed apart; its rough cells are scattered on steep, gullied
    ground).
- **The sanity test: Grayson Highlands' boulder field**, north of Massie Gap, read live on CI's runners (they reach
  3DEP and NRCS; this session can't). Its 3DEP and SDA answers are recorded into `test/fixtures/boulders-grayson/`, and
  a unit test reads patches there from the recording. If the field doesn't read, the threshold moves (and the
  fixtures are run again) before anything else ships.

## 2. Where it shows

- **Uses, outside the grade:** a "Boulders" block below What limits you, one line:
  - "Possible boulder ground: 3.2 ac (bouldery soils, rough lidar texture)", naming only the readings that found
    something; "No sign of boulder ground" when neither did.
  - Tapping it shows the flagged soils by name with their acres and the rough patches' acres, then the honesty line:
    "An estimate from soil maps and 3 m lidar, which smooths small boulders and can't see under trees. Walk it in
    winter, when the leaves are down."
  - No chip and no tally: the Grade tab's "What you can do here" count doesn't change.
  - An older grade (no `boulders`) shows no Boulders block.
- **Map layers › On the map › Boulder ground** (off by default): the flagged soils' pieces as a light fill, and the
  rough patches as a stronger fill and outline; a key row; a tap tip naming the soil or "Rough lidar texture".
- **Favorites grid:** a "Boulder ground" column (acres), sortable, **off by default**: the stored view gains an
  opt-in list (`columns.shown`) for columns that start hidden; the column picker adds or removes it.
- **The area catalog:** each area's share of its sampled rural points that fall in a bouldery or rubbly map unit
  (§1's words), from one SDA query per area (the points' map units) and one for their components. A new field, so
  `/areas/v4` (a clean break: the runners profile every area again). Each area's card says "Bouldery soils: 18% of
  rural land", and Where to look gains a sort: **Best fit** (today's order) or **Most boulder ground**.

## 3. Numbers and text

- **Grades:** none move. The measurement is additive.
- **`expected.json`:** each fixture gains `boulders`, nothing else. `ENGINE_VERSION` 35 → 36; `ENGINE_CURRENT_FROM`
  stays 29; schema v9 stays (§9.65's exception, as Climbing's §9.77).
- **Report text:** none changes. The Boulders block is in Uses only; the Full report doesn't add it in this mission.

## 4. The work, by PR

| # | PR | What |
|---|---|---|
| 0 | This plan | |
| 1 | The measurement | `boulders.ts` and its tests (soil words; smooth, bouldery, cliff and drainage surfaces), the engine field, `expected.json`; the Grayson Highlands check and recording on the runners |
| 2 | The display | Uses' Boulders block, Map layers' Boulder ground, the Favorites column |
| 3 | The area catalog | The per-area share, `/areas/v4` from the runners, the card line and Where to look's sort |
| 4 | Hand-back | Screenshots at 1280 and 375, the fresh-eyes review, the decision record, the hand-back |

## 5. Stop conditions

- A grade, or a fixture's `expected.json` beyond the new `boulders`, would change.
- Grayson Highlands' boulder field doesn't read as rough ground at any threshold that leaves the smooth fixtures
  clean.
- SDA can't answer an area's points in a query or two (then the catalog share is parked, and the rest ships).

## 6. Tests

- **Unit:** the soil words on synthetic names; the texture on synthetic 3 m surfaces (smooth slope, a boulder field on
  it, a cliff, a rough-bedded drainage); one fixture's `boulders` in `expected.json`; Grayson's recording.
- **e2e:** the Boulders block on a fixture; the map toggle draws its features and its key; the grid column, off then
  on.
- **Screenshots** at 1280 and 375, through the owner-field guard.
