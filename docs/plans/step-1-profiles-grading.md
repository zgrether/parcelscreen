# Step 1 — Profiles and the grading split

Roadmap step 1 (`PLAN.md`, Roadmap; the spec is `docs/design/workflow-review.md`). Written 2026-10-16 under
mission mode (`CLAUDE.md`). **Approved by the owner on 2026-10-16 with the changes listed in §8, folded in.**
The mission runs on `step/1-profiles-grading`, branched from main, with the PRs in §6, once this plan and the
mission-mode docs (#144) are on main.

Done when: anyone opening the link gets a local profile; profiles can be added, switched, renamed and deleted;
every piece of the household's data is scoped to a profile; today's data has moved into a first profile; a saved
screen stores measurements and no grades; every grade, verdict and reason on screen is computed when it's shown,
from the stored measurements and the profile's rubric; and the default rubric reproduces today's output
exactly, so the only visible changes are the profile picker, the switch's wording ("My grade" for "Zach's
grade") and, after the update, the Library's "Needs a re-screen" rows until "Re-screen all saved parcels" has
run (the clean break, §3.3).

## 1. Scope

In:

1. **The inventory** (§2): what is stored in a saved screen and what is computed on display today, item by item.
2. **The rubric model** (§3.1) as a pure, display-time module: Must gates with thresholds, ranked Should and
   Could, Won't, per-factor bands, rank-sum weights with Could at ×0.75, the score and verdict rules.
3. **The default rubric** (§3.2) that reproduces today's grades, verdicts and Check-first reasons exactly, with
   the proof on every fixture and scenario.
4. **Measurements, not grades** (§3.3): schema v8 removes every stored grade and verdict from `ScreenResult`
   and adds the raw values that weren't stored; the display derives what it used to read.
5. **Local profiles** (§3.4): created on first visit; add, switch, rename, delete; History, Library, lines,
   markers, settings, notes, the rubric and the per-profile views all scoped by profile id in IndexedDB.
6. **Migration** (§3.5): today's browser data into a first profile; today's two weight sets; export v6 with a
   v5→v6 converter.

Out (later steps): the rubric editor (3), the interview (4), household members, predictions and "send to
confirm" (5), re-ranking sites by rubric and "the answer first" (6), Favorites (7), new factors (10), accounts
adopting profiles (13). Nothing in this step changes what the engine measures or which site it ranks first.

## 2. Inventory: stored in the saved screen, or computed on display?

The saved screen is `ScreenResult` (`lib/screen/types.ts`, schema v7), one record per screen in IndexedDB
(`lib/client/screenStore.ts`, DB `parcelscreen`, store `screens`). The parcel report card (value-ranking.md §3.2)
is **already derived on display**: `lib/report/card.ts` computes it from a result, the card's config
(`SCREEN_CONSTANTS.card`, `lib/screen/config.ts`) and the parcel's drawn markup, whenever it's shown
(phase-0.md §9.29). What the card reads is mostly raw. Three things are stored as grades: the homesite score,
the sky score, and the prototype's verdict with its flags.

### 2.1 The dealbreakers (the card's four gates)

| Gate | Computed on display by | Reads from the saved screen (all raw) |
|---|---|---|
| Floodplain | `lib/report/card.ts` `floodplain()` | `flood.{mapped, sfha, sfhaAcres}`; the build site's `inSfha` / `sfhaOnSite` (`buildSite()`: the house or `sites[0]`); the scored route's `metrics.sfhaFt` |
| Legal road access | `access()`, `accessByFrontage()`, `roadInWords()`, `markedPrivateOutside()` | `driveway.entrances[].{fallback, source, name, reaches, gapFt, roadClass}`; the scored route's `metrics.privateFt` and `existing.{maxGradePct, vetoPct}`; the parcel's lines (names, `recordedIn`) from the parcel store, not the screen |
| Easement needed | `easement()` | `driveway.note` (its "No practical route found" sentence is a stored text flag), `driveway.practical`, `driveway.steepLanding`, the scored route's `needsEasement`, `existing.*`; drawn easements the route uses (`lines`) |
| Septic | `septic()`, `septicBySoils()` | `soils[].{septic, engstafdcd, compname}` (NRCS classes); a septic-permit marker (parcel store) |

Gate statuses are pass / warn / fail / unknown; `missing` marks data that didn't load (`lib/report/card.ts`,
`Gate`).

### 2.2 The graded rows

| Row | Computed on display by | Reads from the saved screen | Grade or measurement? |
|---|---|---|---|
| Elevation at the build site | `elevation()` | `sites[0].elevFt` or `house.elevFt` | measurement (ft); bands `card.rows.elevationFt` |
| Best homesite | `homesite()` | **`sites[0].qGrade` and `quality`: a stored grade and score** (§2.4); `aspectDeg`, `sunH`, `slopeDeg` for the line | the letter is stored |
| Night sky | `sky()` | `sky.mag`, `sky.zone`, `sky.zoneWord` | measurement (mag/arcsec²); bands `card.rows.skyMag` |
| Room to build | `room()`, `footprintFt2()` | `sites[0].fit` (a class the engine sets from the build footprint: `lib/screen/footprint.ts` `siteFit()`), `sites[0].gentleNearAc`; the footprint from `SCREEN_CONSTANTS.build` at display | measurement (acres, a class); bands `card.rows.roomX`; its F sets `checkFirst` |
| Trails and public land | `trails()` | `protected[].{access, adjoins, distFt, name}`, `near.trailheads[].{km, name, drive.{min, km, mi}}`, `noResponse`, `failed` | measurement (minutes, miles, booleans); bands `trailheadMin`, `trailheadKm`, `openLandWithinFt` |
| Town and hospital | `town()` | `drives[].{label, min, er}`, `closerGrocery`, `driveFrom.trackMi` | measurement (minutes); bands `erMin`, `groceryMin` |
| Garden ground | `garden()`, `gardenRow()` | `gardens[].{acres, ll}`, `soilUnits` + `soils[].farmlndcl` (farmland class) | measurement (acres, a class); bands `gardenAc` |

### 2.3 The parcel grade, verdict and reason

| Item | Where | Reads |
|---|---|---|
| Points, letter, verdict, reason line, `incomplete` | display: `lib/report/card.ts` `cardFor()`, `maybeCaps()` | the gates and rows above; `card.weights[person]`, `card.points`, `card.gradeCutoffs`, `card.verdict.{contender, pass, contenderMaxWarns}` |
| Whose weights | `ps.person` in localStorage (`lib/client/prefs.ts`), defaulting to `zach`; switches in `components/Results/card/ReportCard.tsx`, `components/Results/panel/ScreenIt.tsx`, `components/Compare/Compare.tsx`, `components/Rulebook/Rulebook.tsx` | the two names and keys are hard-coded there and in `config.ts` (`card.weights.zach`, `card.weights.julie`) |
| The household verdict (lower of the two) and both grades on the list | display: `lib/client/library.ts` `householdVerdict()`, `libraryRow()`; `components/Library/Library.tsx`, `LibraryControls.tsx` | both cards |
| The breakdown bar | display: `lib/report/breakdown.ts` `breakdown()` | a card and the weights |
| The comparison table | display: `lib/report/compare.ts` `compareTable()`, `defaultColumns()` | cards for one person |
| The rulebook | display: `lib/report/rulebook.ts` `rulebook()`, `lib/report/cardPanels.ts` `panelText()` (the "Grade and verdict" panel quotes the cutoffs) | config only |

### 2.4 Stored grades and scores in the saved screen

| Item | Stored as | Set by | Read on display by |
|---|---|---|---|
| Homesite score, per site and for the house | `score` (0.7·quality + 0.3·(100 − cost)), `grade`, `quality`, `qGrade`, `q.{sun, aspect, frost, slope, sky}`, `c.{septic, foundation, rock, pad, driveway}`, `costIdx`, `costTier` (`ScoreFields`, `types.ts`) | `lib/screen/score.ts` `scoreSiteDetailed()` (quality: `qualityParts()`; cost from the soil's NRCS ratings, A3's `limits` by cokey, bedrock depth, slope, the straight-line road), `withDrivewayCost()` (the routed cost, A3), `rankSites()`, `rerank()`, `assessHouse()`; `grade()` turns quality into the letter (A ≥ 80, B ≥ 65, C ≥ 50, D ≥ 35) | `card.ts` `homesite()`; `lib/report/build.ts` (site cards: "A site", "$$ to build", "overall 83"); `lib/report/house.ts`; `lib/screen/summary.ts` `summaryText()` (Copy summary) |
| The site's sky part | `q.sky`, a 0–100 score; the raw sky read at the site (follow-up 58) is **not** stored | `index.ts` `skyAtOf()` → `computeSky()` at the site | through `quality` |
| The sky score at the focus | `sky.score` (0–100) | `lib/screen/sky.ts` `computeSky()` from `mag`, the brightest dome's weight (`dome.w`), `coreClear`, `coreAlt` | `lib/report/sky.ts` ("score 67/100"), `summaryText()` |
| The prototype's verdict | `verdict`: fatal / marginal / ok | `index.ts` `verdictOf(flags)` | `lib/report/verdict.ts` `verdictView()` → `components/Results/blocks/Verdict.tsx`; `summaryText()`; `card.ts` `trails()` reads `verdict === undefined` as "still running" |
| The flags | `flags[]`: `{ lvl: fatal / warn / good, t, step }` | `lib/screen/sites.ts` `siteFlags()`, `terrain.ts` `terrainFlags()`, `soils.ts` `vetBenches()` (bottomland) and `soilFlags()`, `sun.ts` `sunFlags()`, `sky.ts` `skyFlags()`, `flood.ts` `floodStep()`, `padus.ts` `padusStep()`, `index.ts` `drivewayStep()` (no practical drive, a steep existing drive), and the house downgrade in `index.ts` (a fatal "No house site" becomes a warn when a house is marked); `evaluateAt()` / `setHouse()` replace the sun and sky flags | `verdictView()`; each panel's flags in `components/Results/card/CardPanel.tsx` (`panelOfFlag`); `summaryText()` |
| The existing house's assessment | `house.{score, grade, qGrade, …}` as a site; `house.veto` (the bottomland reason, a text class) | `score.ts` `assessHouse()` | `lib/report/house.ts` ("The builder left N points on the table"), `summaryText()` |
| Site-finding scores | `benches[] / shelves[] / gardens[].score`, `gardens[].{adj, finalScore}`, `cell.score` on sites and the house | `sites.ts` `findSites()`, `siteResults()`; `soils.ts` `vetGardens()` | `lib/report/terrain.ts`, `garden.ts`, `build.ts` ("cell score 71") |
| The run's thresholds | `params.{houseMin, shelfMin, gardenMin, canopyDeg, shallowBedrockCm}`, `houseMinUsed` | `index.ts` | the Soils and site sections |

Everything else the report shows (terrain, soils, sun, sky, flood, protected land, places, drives, the driveway's
routes and quantities, drawn lines) is a measurement or a text note, stored as the step recorded it. The VR3
derived outputs (foundation type, dig cost in rock, the septic class: `lib/report/derived.ts`) are computed on
display from soils and the site.

**Answer to the design doc's question** (Gap review): the card's grades aren't fixed at screen time; each
ENGINE_VERSION bump so far changed what the engine measures (trailhead lists, drive starts, the entrance road's
class), not the card's cutoffs, and those did change on display without a re-screen (`card.test.ts` edits the
config and sees the letters move). What is fixed at screen time is the homesite letter, the sky score and the
prototype's verdict with its flags. That's what §3.3 moves.

## 3. What changes

### 3.1 The rubric model: `lib/rubric/` (pure; runs in Node, the worker and the page)

A rubric is one ranked list of preferences plus a short list of minimums (workflow-review.md, Rubric algorithm).

```ts
// lib/rubric/types.ts
type Factor = "flood" | "access" | "easement" | "septic"               // today's gates
            | "elevation" | "homesite" | "sky" | "room" | "trails" | "town" | "garden"; // today's rows
interface MustCard { factor: Factor; threshold?: number }  // a gate, or a ranked factor's minimum
interface RankedCard { factor: Factor; tier: "should" | "could" }      // in rank order
interface Band { direction: "atLeast" | "atMost"; edges: [number, number, number, number] } // A, B, C, D edges
interface Rubric {
  version: 1;
  musts: MustCard[];
  ranked: RankedCard[];            // first is rank 1
  wonts: Factor[];
  bands: Partial<Record<Factor, Band>>;   // today's card.rows cutoffs, per factor
  weights: { mode: "explicit"; of: Partial<Record<Factor, number>> } | { mode: "rankSum" };
  points: { A: number; B: number; C: number; D: number; F: number };   // 100, 75, 50, 25, 0
  gradeCutoffs: [number, number, number, number];                       // the score's A, B, C, D edges
  verdict: { contender: number; pass: number; contenderMaxWarns: number };
}
```

- `lib/rubric/weights.ts`: `rankSumWeights(ranked)`: with n ranked cards, rank 1 counts n, down to 1; Could
  cards count 0.75 of their rank value; scaled to total 100. The doc's table (5 Should, 5 Could → 19.5 % … 1.5 %)
  is the unit test. `weightsOf(rubric)` returns the explicit weights or the rank-sum ones.
- `lib/rubric/grade.ts`: `factorScore(letter, points)`; `parcelScore(rows, weights)` = Σ w·s / Σ w over the
  graded (known) factors; `letterOf(score, gradeCutoffs)`; `verdictOf(...)` with today's rules (§3.2). Each
  factor scores 0–100 by its band's letter, so a weighted mean of 100 / 75 / 50 / 25 / 0 is today's points × 25
  and today's cutoffs 3.5 / 2.5 / 1.5 / 0.5 become 87.5 / 62.5 / 37.5 / 12.5; `verdict.contender` 2.75 → 68.75,
  `pass` 1.75 → 43.75.
- `lib/rubric/musts.ts`: a Must on a ranked factor with a threshold is a gate: fail when the measurement is on
  the wrong side of it, unknown when the factor has no measurement. Implemented and tested now (step 3's editor
  and step 4's interview write these); the default rubric has none.
- Won't factors are left out of the score and hidden from the card's rows (none in the default).
- `lib/rubric/default.ts`: `defaultRubric()` built from `SCREEN_CONSTANTS.card` (rule 4: the numbers stay in
  `config.ts`), and `rubricFromWeights(weights)` for the migration (§3.5).
- `lib/report/card.ts`: `cardFacts(r, K, build, drawn)` keeps computing the gates and rows, taking the bands from
  the rubric (`rubric.bands` replaces `K.rows`; `K.marks` and `K.listingAcresPct` stay app constants).
  `cardFor(facts, person, K)` becomes `cardFor(facts, rubric)`; `Card.person` becomes `Card.rubric: { id, name }`.
  `breakdown.ts`, `compare.ts`, `rulebook.ts`, `cardPanels.ts` (the "Grade and verdict" text quotes the rubric's
  numbers) and `lib/client/library.ts` take rubrics instead of a `Person`. The `Person` type goes.
- The rubric is never part of a run: `RunKeys` (`lib/client/screenKeys.ts`) keeps hashing the boundary, house,
  settings and lines only, so a rubric change never asks for a re-screen.

### 3.2 The default rubric, and the proof that it reproduces today

The default rubric is today's card: the four gates as Musts (pass / warn / fail / unknown exactly as
`card.ts` computes them), the seven rows ranked with no Won't, today's bands, today's points, grade cutoffs and
verdict thresholds, and **explicit weights equal to today's `card.weights`**.

Why explicit weights, not rank-sum: today's weights (25 / 25 / 15 / 10 / 10 / 10 / 5) aren't a rank-sum series.
Measured on 2026-10-16 with a scratch test over every fixture and scenario (7 scenarios × 2 persons):

| Weights | Letters and verdicts | Points |
|---|---|---|
| today's explicit | — | Ferney Zach 3.200, Julie 2.750; Macks 3.050, 2.200; Mud Creek 3.450, 3.050 |
| rank-sum, all 7 rows Should, in today's order | **same on all 14** | shift by up to 0.14 (Ferney Zach 3.107, Julie 2.893; Mud Creek Zach 3.464) |
| rank-sum, 5 Should + 2 Could ×0.75 | Mud Creek Zach **B → A** (3.505 vs 3.450) | — |
| rank-sum, 3 Should + 4 Could ×0.75 | Mud Creek Zach **B → A** (3.510) | — |

So rank-sum weights happen to keep every letter on the fixtures, but the points (the breakdown bar, the
rulebook's weights table) would change, equal-grade rows could pick a different "Weakest part", and a saved
parcel near a cutoff could flip. The default therefore carries explicit weights; rank-sum is what the editor
(step 3) and the interview (step 4) write when a person first orders their cards. **Agreed (§8 Q1). When step
3's editor first switches a rubric from explicit weights to rank-sum, it shows the points before and after.**

Three places where today's rules differ from the design doc's Rubric algorithm, kept as today so nothing
changes (§8 Q2: warn gates will probably stay for good, since "verify the easement" is a real third state; the
rest is decided in step 3 or 6):

- a Must can **warn** (the doc has pass / fail / unknown), and a Contender allows one warn;
- the verdict lines are points (2.75 and 1.75), not letter edges ("A or B → Contender", 2.5; "D or F → Pass", 1.5);
- an **unknown** gate caps the verdict at Maybe only when its data didn't load (`missing`), not when FEMA has no
  mapping; "Room to build" is a graded row whose F caps the verdict (`checkFirst`), not a Must; and the
  "provisional when unknown factors carry over 30 % of the weight" rule isn't shown yet.

**The proof.** A test over `ALL_SCENARIOS` (`test/support/scenarios.ts`: Ferney Creek run, setHouse, houseRun;
Macks Mountain run, evaluateSite2; Mud Creek run, evaluateSite2) compares, for each of today's two weight sets,
the card from the rubric (`cardFor(facts, rubric)`) with the card from today's code at the commit before the
change (gate statuses and reasons, row letters and details, `checkFirst`, points, letter, verdict, the reason
line, `incomplete`): zero differences, as a deep equality. Today's cards are recorded once into
`test/fixtures/<slug>/cards-v7.json` by a one-off script before `card.ts` changes, and the file stays as the
regression oracle of the default rubric. The same test runs the rubric's verdict against today's on the edited
copies `card.test.ts` already uses (a fail, a warn, a Room to build F, something that didn't load). If any case
can't match exactly, the mission stops and lists them (§5).

### 3.3 Measurements, not grades: schema v8

**Removed from the stored `ScreenResult`** (every grade, score and verdict):

- `verdict`;
- `flags`;
- in each `sites[]` entry and in `house`: `score`, `grade`, `quality`, `qGrade`, `q`, `c`, `costIdx`, `costTier`;
- `sky.score`.

**Added (raw values the derivations need, not stored today):**

- per site and for the house: `sky: { mag, coreClear, coreAlt, domeW } | null`, the sky read at that spot with
  its own skyline (follow-up 58; today only its score survives as `q.sky`); null when the sky step didn't run;
- per site and for the house: `soilKey` (the NRCS `cokey` under the spot, or null), so the display can find the
  component row and its ratings;
- `soilLimits: { cokey, septic, foundation }[] | null`: NRCS's septic and foundation ratings without the map
  unit's slope (A3's `fetchSoilLimits`), today session-only; null when they didn't load;
- `params` gains the run's `benchMinAcres`, `compactMinAcres`, `sunHoursWanted`, `thermalMinFt`,
  `roadMaxGradePct`, `roadVetoGradePct`: the thresholds the derived flags and scores read, kept with the run so a
  stored screen reads as it was screened after Settings change (as `shallowBedrockCm` already is).

**Kept, and why:** `rank` (the engine's order is a fact of the run: the driveway and the drives went to site
#1); `why` (the site's reason lines: report text, rule 7); `driveway.note` and `nearNote` / `roadNote` (text
notes); `fit` and `gentleNearAc` (a class and acres); bench, shelf, garden and `cell` scores (the suitability
surface that located the sites, an engine intermediate, not a grade of the parcel); `benches[].veto` and
`house.veto` (the NRCS flood-frequency reason, a class); every measurement.

**Derived on display, by the same pure functions the engine ranks with:**

- `lib/screen/score.ts` `storedQuality()` already recomputes a site's quality from stored fields; it extends to
  `storedScore(site, result)` giving `quality, qGrade, cost, costIdx, costTier, score, grade, q, c` from the
  site's measurements, `terrain.valleyFloorFt`, `params`, the soil row and `soilLimits`, the site's `sky` (the
  score by `skyScore()` factored out of `computeSky()`), `flood`, and the routed driveway's cost
  (`withDrivewayCost`). The engine calls the same function while ranking, so display and ranking can't drift.
- `lib/screen/flags.ts` `flagsOf(result)`: the nine flag sources above, in the run's order, from the stored
  result and `params` (every input is stored: the relaxed threshold is `houseMinUsed < params.houseMin`, the
  diagnostics are `terrain.diag`, the worst ridge is `sun.worstAz`, the brightest dome is `sky.dome`, the
  bottomland reasons are on the benches and the veto flags run whenever there are benches, the "no practical
  route" condition is the sentence already in `driveway.note` with its text recomputed by `noPracticalLine()`
  from the shown route's grade over 30 m and `params.roadVetoGradePct`, the steep existing drive is
  `routes[0].existing`, the house downgrade is `house` being present); `verdictOf(flags)` moves there.
- `lib/report/verdict.ts`, `build.ts`, `house.ts`, `sky.ts`, `CardPanel.tsx` and `summaryText()` read the derived
  values; the Verdict block, the panel flags and Copy summary read exactly as before.
- A result is partial (its run still going) when `cancelled` is undefined, which the run sets only at its end;
  `isPartial()` (`lib/report/verdict.ts`) and `card.ts` `trails()` read that instead of `verdict === undefined`.

**Derivations are engine code (owner, 2026-10-16).** Every display-time derivation (`storedScore`, `flagsOf`,
`verdictOf`, `skyScore`, the card's gates and rows) counts as engine code: changing one is a numbers change,
declared in its PR with the `pnpm diff:prototype` summary line and an `ENGINE_VERSION` bump. `grades-v7.json`
(below) and `cards-v7.json` (§3.2) stay as the guard. An invariant test over every scenario applies `rerank()`
to the derived scores and checks that it reproduces the stored `rank` order exactly, so a scoring change that
breaks it fails CI instead of showing site #2 scoring above site #1.

**The proof.** Before the cut, a one-off script records every removed field from today's `expected.json` into
`test/fixtures/<slug>/grades-v7.json` (verdict, flags, each site's and the house's score fields, `sky.score`).
A test derives them from the v8 expected result for every scenario and compares: zero differences (flags as
whole arrays, `lvl`, `t` and `step`; scores as numbers). That file stays as the regression oracle. The same
derivations run inside the engine's parity test (`lib/screen/screen.test.ts`) so a live run checks them too.

**Versioning.** `SCREEN_SCHEMA_VERSION` 8; `lib/screen/schema-v8.test.ts` with its JSON Schema snapshot;
`ENGINE_VERSION` 21 (the convention since v3: a schema change re-screens kept screens). A **clean break**, as v3
to v7 were: v7 results aren't read or migrated; their parcels re-screen when opened (`screenStore.ts`
`readScreen` already treats another schema as gone). So after the update every Library row's grade is gone until
its parcel is re-screened: a row whose screen is from an earlier schema reads "Needs a re-screen" rather than a
blank grade, and the Library's "Re-screen all saved parcels" action (PR 5, §6) re-screens them one after another
in the background, with a progress line and Cancel; after it, the grades and household verdicts are what they
were (§7, manual step 4). Recorded as phase-0.md §9.44 in the PR (§9). `CLAUDE.md`'s
"Schema v7 is frozen" rule moves to v8. `expected.json` is regenerated (`pnpm expected`): fields leave and
arrive, **no recorded number moves**; the PR declares it under the expected guard with the `pnpm
diff:prototype` summary line, which must read zero differences once the prototype diff derives the removed
fields before comparing (`test/tools/diff-prototype.test.ts` and `before-after.test.ts` gain that step, since
the prototype's goldens still carry verdict, flags and site scores).

### 3.4 Local profiles

**Storage.** IndexedDB `parcelscreen` goes to version 2 (`lib/client/profileStore.ts`):

| Store | Key | Holds |
|---|---|---|
| `profiles` | `id` (a UUID) | `{ id, name, createdAt, openedAt }` |
| `docs` | `[profile, key]` | one document per profile and key: `parcels` (the `ParcelStore`: History, the open parcel, lines, markers, notes, statuses, My order, listing facts, prices), `cfg` (`UserConfig`: Settings), `rubrics` (§3.5), `rubricView` (which rubric the card shows), `library` (the list's filters and sort), `compare`, `recentMarks`, `namesFromNotes` |
| `screens` | `id` (as today) | each record gains `profile`, with an index on it, so a profile's screens can be exported and deleted with it |

localStorage keeps what belongs to the device, not the person: `ps.profile` (the current profile's id, read
synchronously at startup), the map view and basemap, dim, lines, roads, the overlay mode, terrain, hillshade,
contours, overlays, the tilt hint, the Info tab, and `ps.debug`.

**Hydration.** The prefs module (`lib/client/prefs.ts`) stays synchronous: `getPref` / `setPref` for a
profile-scoped key read and write an in-memory document map that `ProfileGate` (`components/Profile/ProfileGate.tsx`,
mounted in `app/layout.tsx`) fills from IndexedDB before the app renders; a write goes to memory and then to
IndexedDB (one `put` per write, the same best-effort as today's localStorage writes). The screen store keeps its
API; `addScreen` stamps the current profile. On a device without IndexedDB (storage refused), the app runs with
an in-memory profile and says in the menu that nothing is kept, as it already says for screens.

**The picker.** In the ☰ menu's header (`components/Explore/Menu.tsx`, above History): the current profile's
name; "Switch profile" lists the profiles with "Add a profile" (a name), and each profile has Rename and Delete
(a confirm naming what goes: its History, screens and settings). Switching writes `ps.profile` and reloads the
page, so no state from the previous profile survives. The same control sits in the Library, Compare and
Rulebook headers' menus. The picker is the one visible addition.

**First visit.** `ProfileGate` finds no profile → creates one named "Profile 1" (renamed from the picker; step
4's onboarding asks the name with the interview), sets `ps.profile`, and runs the migration (§3.5) if the browser
holds pre-profile data. Nothing in code names Zach or Julie.

### 3.5 Migration

**Today's data moves into the first profile**, once, on the first open after the update: `ps.parcels` (converting
`ps.current` first if it's still there, as `readParcelStore` does), `ps.cfg`, `ps.compare`, `ps.library`,
`ps.recentMarks`, `ps.namesFromNotes` become that profile's docs; every record in `screens` gets its id as
`profile`; after the IndexedDB transaction completes, the localStorage keys are **renamed** to `ps.legacy.*`,
never deleted here (step 2's first PR deletes them), so a failure part-way leaves the original keys untouched
and the migration retries next open, and a second run finds the profile's docs and the `ps.legacy.*` keys and
does nothing. Tested on a recorded copy of a real `ps.parcels` (the e2e fixtures' import gives one) in
`lib/client/migrateProfiles.test.ts`: the move; running it twice duplicates nothing; a failure part-way (a
rejected transaction) leaves the original keys untouched.

**Today's two weight sets.** The first profile's `rubrics` document is `{ mine, others }`: `mine` is the default
rubric (today's `card.weights.zach` numbers, which become `card.weights.default` in `config.ts`, the same
numbers under a name that isn't a person's), and `others` holds one entry, `{ id, name: "Julie", rubric }` built
from today's `card.weights.julie`, which leaves `config.ts` for the migration module (`lib/client/migrateProfiles.ts`,
`LEGACY_SECOND_WEIGHTS`, with a comment saying why it exists; step 5 deletes it and its name once rubric import
exists). A new profile starts with `mine` and an empty `others`. **Julie's weights are not a profile**: in step 5 the `others` entries become the household's members
(rubric import by code or file, predictions, "send to confirm"); until then they only keep today's screen the
same: the card's switch reads "My grade" and, when `others` isn't empty, each other's name ("Julie's grade"); the
Library's columns, its household verdict (the lowest across `mine` and `others`, today's lower of two), Compare's
switch and the Rulebook's weights table follow the same list. A fresh profile shows no switch and no second
column. **Agreed (§8 Q3).**

**Export v6.** The file gains `profile: { name }` and `rubrics`; the parcels and screens are the current
profile's. `fromV5()` converts a version 5 file (`profile: null`, `rubrics: null`), and the import goes into the
current profile with today's merge rules; the file's profile name is shown in the import summary. A v6 file's
`rubrics` replace the current profile's only when the user ticks "Replace my rubric too" in the import summary
(off by default, so a backup never overwrites a rubric by accident). `READS_VERSIONS` becomes 1–6. Screens in a
file older than schema v8 are skipped and re-screen when opened, as today's import does for older results.

### 3.6 What the screen says

Unchanged: every report section, the card's gates, rows, reasons and `checkFirst`, the flags, the Verdict block,
Copy summary, the rulebook's rules and bands, the comparison table's cells.

Changed wording, not hard-coded to anyone: "Zach's grade" → "My grade"; "Julie's grade" → "{name}'s grade" from
the profile's `others` (so "Julie's grade" after the migration, nothing on a fresh profile); the Library's
"Household / Zach's grade / Julie's grade" columns and filters follow. New: the profile picker and its dialogs;
the Library's "Needs a re-screen" row state and its "Re-screen all saved parcels" action with its progress line
and Cancel. No report text changes (rule 7).

## 4. Numbers and text that may change (the declaration)

- **No recorded number changes.** `expected.json` changes shape only (§3.3): the removed fields leave, the added
  measurements arrive. `pnpm diff:prototype` must still report zero differences, with the derivations applied.
- **No verdict or flag text changes.** Grades, verdicts, reasons, Check-first lines, flags and Copy summary are
  byte-identical on every fixture and scenario (the two proofs in §3.2 and §3.3 are CI tests).
- **UI text:** the switch and column names above; the picker's labels; the menu's "nothing is kept" line on a
  device without IndexedDB; "Needs a re-screen" and the re-screen action's lines.
- `ENGINE_VERSION` 20 → 21, `SCREEN_SCHEMA_VERSION` 7 → 8, export version 5 → 6, IndexedDB version 1 → 2.

## 5. Stop conditions (push, say why, wait)

1. Any fixture or scenario where a derived verdict, flag, site or house score, sky score, or the card from the
   default rubric differs from the v7 record, in any field.
2. A flag or score input that turns out not to be derivable from the stored result and the additions in §3.3.
   The list of additions doesn't grow without approval.
3. A recorded number that moves in `expected.json`, or `pnpm diff:prototype` showing a new difference.
4. A migration case that can't be made safe (today's data at risk of loss or duplication).
5. An e2e flow that can't run under profiles with only its seeding and selectors updated.
6. The general ones (CLAUDE.md, Mission mode): a product decision, the same CI failure three times, the plan
   turning out wrong.

## 6. The PRs, into `step/1-profiles-grading`

| # | PR | Checks |
|---|---|---|
| 1 | **The rubric module and the card on a rubric.** `lib/rubric/*`, `cards-v7.json` recorded, `card.ts` / `breakdown.ts` / `compare.ts` / `rulebook.ts` / `cardPanels.ts` / `library.ts` on rubrics; the two persons become two rubrics from config; no UI change. | The §3.2 proof; the rank-sum table; `card.test.ts` green unchanged in its expectations. |
| 2 | **Derivations.** `flags.ts`, `storedScore()`, `skyScore()`; `grades-v7.json` recorded; the readers switched to the derived values, with the stored fields still present. | The §3.3 proof passes against the stored fields (both exist, so the test runs before the cut); the `rerank()` invariant over every scenario. |
| 3 | **The v8 cut.** Schema v8 and its snapshot test; the added measurements; the removed fields; ENGINE 21; the clean break in `screenStore.ts`; `pnpm expected`; the prototype diff derives; §9.44; CLAUDE.md's frozen-schema rule. | Expected guard declaration; `diff:prototype` zero; schema snapshot; determinism. |
| 4 | **Profile storage.** `profileStore.ts`, the DB upgrade, `ProfileGate`, the prefs cache, the screen store's `profile`, the migration from localStorage (its keys renamed to `ps.legacy.*`) with its tests (the move; twice duplicates nothing; a failure part-way leaves the keys). No picker yet: one profile, created on first visit. | Unit tests over an in-memory `ProfileStorage` implementation (no new dependency: the store is written behind an interface, IndexedDB and memory both implement it); the e2e seeding (`e2e/flow.ts`) moved to IndexedDB. |
| 5 | **The picker and the names.** Menu, Library, Compare, Rulebook; "My grade"; `rubrics` with `others` from the migration; `rubricView` per profile. The Library's "Needs a re-screen" rows and its "Re-screen all saved parcels" action: sequential, in the background, a progress line, Cancel. | e2e: add, switch, rename, delete; a parcel saved in one profile isn't in another; the Library's columns; a seeded earlier-schema screen's row reads "Needs a re-screen", and Re-screen all gives it its grade. |
| 6 | **Export v6** with `fromV5()`, the import summary's profile line and the rubric tick. | Round trip; a v5 file imports; `exportFile.test.ts`. |
| 7 | **Docs and the hand-back**: REQUIREMENTS §3a (the local store lives in IndexedDB per profile), `docs/plans/README.md`, the final PR from the step branch to main with the test plan. | Full CI on the step branch's head. |

PR 2 and 3 may merge as one if 2 alone would leave the stored fields and their derivations side by side for
only hours; otherwise they stay apart for review size.

## 7. Test plan outline

**Unit (CI).** The rank-sum table from the design doc; the default rubric's proof over `ALL_SCENARIOS` and the
edited copies; the derivation proof over `ALL_SCENARIOS`; Musts with thresholds on edited results; the
migration from a recorded `ps.parcels` and `ps.cfg` (plus `ps.current`); profile add / switch / rename / delete
on the in-memory storage, with a delete removing the profile's screens and nothing else; export v6 round trip
and `fromV5()`; the schema v8 snapshot; the `rerank()` invariant over every scenario; the engine's parity tests
unchanged.

**e2e (CI).** The existing specs with their seeding on IndexedDB (`flow.ts`); a new `profiles.spec.ts`: first
visit creates "Profile 1"; add "Visitor" and switch (empty History, default Settings); import Ferney into
Visitor, screen it, switch back (Ferney isn't there), switch again (it is); rename; delete with its screens;
the card reads "My grade"; after a seeded pre-profile store, the migration shows the parcels under Profile 1
and the switch offers "Julie's grade"; a seeded earlier-schema screen's row reads "Needs a re-screen", and
"Re-screen all saved parcels" (over the HAR replay) gives it its grade and can be cancelled part-way.

**Manual, on the preview (the hand-back; about 20 minutes, desktop then phone).** It opens with "Before merging,
screenshot your Library." Then numbered "do → expect" steps with pass/fail boxes, using the fixture parcels by
name: (1) open the preview in a fresh browser profile →
Profile 1 exists, the menu shows it; (2) import Macks Mountain and screen it → the card reads B, Maybe, "Check
first: no soil on the parcel rates better than very limited…", the Verdict block's flags as before; (3) open
"Julie's grade" → not offered (fresh profile); (4) in your own browser, after the update → your History, Settings
and lines are under Profile 1, the switch offers "My grade" and "Julie's grade", and the Library's rows read
"Needs a re-screen"; run "Re-screen all saved parcels" → a progress line, Cancel available, and when it's done
the grades and household verdicts match the screenshot taken before merging; (5) add a profile "Visitor", switch → an empty History,
default Settings, no second grade; (6) screen Ferney Creek there → Contender for "My grade"; (7) switch back →
Ferney isn't in Profile 1's History; (8) rename Visitor, delete it → gone, with its screen; (9) export from
Profile 1 → a version 6 file; import a version 5 file from before the update → its parcels appear, your rubric
untouched; (10) the rulebook and Compare show "My grade"; then the same on the phone, with the picker in the
sheet's menu. The full list lands in the final PR.

## 8. Questions for the owner, answered (2026-10-16)

The owner approved the plan with four changes, folded in above: **A** the Library after the clean break ("Needs
a re-screen" rows, "Re-screen all saved parcels", the screenshot before merging: §1, §3.3, §3.6, §6 PR 5, §7);
**B** derivations are engine code, with the `rerank()` invariant (§3.3, §6 PR 2, §7, §9.44); **C** migration
safety (`ps.legacy.*`, the two extra tests: §3.5, §6 PR 4); **D** the answers below.

1. **Explicit default weights** (§3.2): the default rubric keeps today's weights explicitly, and rank-sum applies
   when the editor or the interview first orders the cards. Agreed? (The alternative, rank-sum from the start,
   keeps every letter on the fixtures but moves the points and the rulebook's numbers.)
   **Answer:** agreed. When step 3's editor first switches a rubric to rank-sum, it shows the before and after
   points (noted on step 3 in PLAN.md).
2. **The three deviations from the doc's Rubric algorithm** (§3.2: warn gates and one warn allowed; verdict lines
   at 2.75 / 1.75; unknown and Room to build as today): kept as today in this step; decided in step 3 (editor)
   or 6 (results). Agreed?
   **Answer:** keep them as today. Warn gates will probably stay permanently, since "verify the easement" is a
   real third state; the rest is decided in steps 3 and 6.
3. **The second grade until step 5** (§3.5): today's Julie weights ride along as an "other" rubric of the first
   profile, so the switch and the Library's second column keep working from data; a fresh profile has none.
   Or drop the second grade until step 5 (a visible change)?
   **Answer:** agreed. `LEGACY_SECOND_WEIGHTS` and its name are deleted in step 5, once rubric import exists (a
   step 5 item in PLAN.md).
4. **The first profile's name**: "Profile 1", renamed from the picker (step 4 asks the name with the interview).
   Or ask for a name on first visit now?
   **Answer:** "Profile 1", agreed.
5. **Devices without IndexedDB**: today History persists in localStorage even where IndexedDB is refused and
   screens aren't kept; after this step nothing persists there, said in the menu. Acceptable?
   **Answer:** acceptable, with the menu line.
6. **Switching reloads the page** (§3.4). Acceptable, or should it re-hydrate in place?
   **Answer:** acceptable.
7. **`why` stays stored** (the site's reason lines, text with "— good" / "— acceptable" from `score.sunGoodShare`).
   Agreed, or derive those too (then rule 7's wording tests cover them)?
   **Answer:** agreed; revisited in step 6.
8. **The cost-label PR**: which branch is it (`dw-cost`?), so phase-0.md §6's paused line can point to it.
   **Answer:** no branch exists; it was proposed in a block that was never sent. phase-0.md §6 marks it "proposed
   10/16, not started, paused" (in #144).

## 9. Decisions to record in `phase-0.md` §9 (in the PRs)

- **§9.44 Schema v8: a clean break.** Every stored grade, score and verdict leaves `ScreenResult`; the raw sky at
  each site and the house, the soil key and NRCS's slope-free ratings, and the run's thresholds arrive; v7
  results aren't read, their parcels re-screen when opened (ENGINE 21); the Library offers "Re-screen all saved
  parcels". Grades are display-time arithmetic over measurements and the viewer's rubric (workflow-review.md).
  Every display-time derivation (`storedScore`, `flagsOf`, `verdictOf`, `skyScore`, the card's gates and rows) is
  engine code: changing one is a numbers change, declared, with an ENGINE_VERSION bump; `grades-v7.json` and
  `cards-v7.json` are the guard, and the `rerank()` invariant holds the stored site order.
- **§9.45 Profiles.** All per-person data is scoped by profile id in IndexedDB; the device keeps the map and
  layer prefs; nothing in code names a person; today's two weight sets became the first profile's own rubric and
  one "other" rubric (§8 Q3); the pre-profile localStorage keys stay as `ps.legacy.*` until step 2's first PR.
