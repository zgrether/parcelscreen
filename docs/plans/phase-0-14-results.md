# Step 14: the results panel (plan)

Status: **approved (owner, 2026-10-06), with all six recommendations; see §9.** It covers step 14 of `phase-0.md` §6: the step
list, the section components, the help dialog, Copy summary, the still-unknown checklist, and collapsible
sections. Line numbers (L…) refer to `legacy/parcelscreen.html`.

## 1. The rule this plan is built around

The owner's direction (2026-10-06):

- **Pure inputs.** The section components render purely from a `ScreenResult` and the evaluation point. They
  don't depend on the explorer's panel or the map's state.
- **Reuse.** They'll be reused as the computed blocks of the Phase 1 parcel page (REQUIREMENTS §4, blocks 2
  and 4–7 and 11) and of its PDF export.

So step 14 builds two things, kept apart:

1. **Blocks** (`components/Results/blocks/*`): one per section, a plain function of its props. No hooks, no
   context, no browser APIs, no `localStorage`, no MapLibre, no explorer state. They render on the server
   (React Server Components, headless Chromium for the PDF) as well as in the explorer.
2. **Panel chrome** (`components/Results/panel/*`): the explorer's wrapping, all client-side:
   - **Screen it** (Run, Cancel, the step list);
   - collapsible sections and their saved open state;
   - the help dialog;
   - Copy summary;
   - the still-unknown ticks.

   The Phase 1 parcel page brings its own chrome and reuses only the blocks.

The text the blocks show is computed by **pure view functions in `lib/report/*`**. They're TypeScript with
no React, like `lib/screen/summary.ts`. The blocks are thin JSX over them. That gives three things:

- the wording is unit-testable without rendering;
- a print block or the Phase 5 email digest reuses the same sentences;
- a block's JSX is mostly layout.

## 2. The block contract

```ts
// components/Results/blocks/types.ts
export interface EvaluationPoint {
  ll: LatLon;
  label: string;            // "the largest house site", "site #2", "the house", …
  elevFt: number | null;
  aboveFloorFt: number | null;
  slopeDeg: number | null;
  aspectDeg: number | null;
}
/** The point a result's sun, sky and driveway were computed at (result.focus + result.point). */
export function evaluationPoint(r: ScreenResult): EvaluationPoint | null;

export type Variant = "panel";          // "page" and "print" come later (§6)

export interface BlockProps {
  result: ScreenResult | PartialScreenResult;   // partial while a run is in progress
  point: EvaluationPoint | null;
  variant: Variant;
  /** Panel-only callbacks. Absent on the parcel page and in print, and then no control renders. */
  actions?: BlockActions;
}
export interface BlockActions {
  evaluateAt?(ll: LatLon, label: string): void;   // step 15's pins use it; step 14 doesn't call it
}
```

- **The evaluation point is passed in, not looked up.** In Phase 0 it's always `evaluationPoint(result)`,
  because `evaluateAt` returns a new result with its own `focus`. The Phase 1 page passes the point stored
  with the screen. A block never reads where the user last tapped.
- **Callbacks are optional, so they're only panel affordances.** A block renders the same content without
  them. Step 14 has nearly none: the pins that move the evaluation point are step 15.
- **Enforced, not just agreed:**
  - An ESLint `no-restricted-imports` rule on `components/Results/blocks/**` and `lib/report/**` blocks:
    - React's hooks (`useState`, `useEffect`, `useContext`, …);
    - `maplibre-gl`;
    - `@/components/Explore/*` and `@/components/Map/*`;
    - `@/lib/client/*`.
  - The block tests render every block with `react-dom/server` `renderToStaticMarkup` in Vitest's **node**
    environment. A block that touches `window`, `document` or a hook fails there, which also proves it will
    render on the server for the PDF.

### Inputs the prototype read from outside the result

The agent inventory of `renderResults` (L1453–1567) found these. Each needs a home that isn't the explorer:

| The prototype read | Where | Proposal |
| --- | --- | --- |
| `CFG.houseMin` (the "(relaxed)" mark), `CFG.shelfMin` (shelf note), `CFG.canopyDeg` (Sun facts), `CFG.gardenMin` (diagnostics) | Terrain, Sun, Where to build | **Q1:** record the settings a run used in the result (below) |
| `R._ctx.dFine.res`, the DEM cell size | Terrain diagnostics | Already in the result as `demResM` |
| `localStorage ps.open` | every section | Panel chrome (`Section`), not the blocks |
| The global `house`, `#save-*` inputs, the `#unknowns` checkboxes | Save, Still unknown | Panel chrome |
| `window.innerWidth` / `.mapmode` (raise the sheet after a run) | after render | Panel chrome (§4) |
| Sentences that point at the map: "Tap any numbered pin…", "Cycle the overlay button…", "(green dots on map)", "dashed outlines on the map, hover for names", "Numbered pins on the map", "toggle the light-pollution overlay on the map" | Sun, Terrain, Getting there, Soils, Where to build, Dark skies | Kept **verbatim** in the panel. Each is marked in the view functions as a map pointer, so a later variant can leave it out or point at the map snapshot (§6) |

## 3. The blocks

Order, titles and the open/closed defaults follow the prototype. Every caveat string is ported verbatim and
covered by a test (CLAUDE.md: they're part of the product's honesty).

| Block | Reads from the result | Notes |
| --- | --- | --- |
| `Verdict` | `verdict`, `flags`, `failed`, `cancelled` | While partial: "Screening…" and an interim class from the flags so far. Shows "(run cancelled)" and "Incomplete: … didn't run, so this verdict is missing that evidence." |
| `Terrain` | `terrain`, `benches`, `shelves`, `gardens`, `houseMinUsed`, `road`, `roadNote`, `demSource`, `demResM` | Includes the legend, the diagnostics line, and the DEM fallback note |
| `DecemberSun` + `HorizonChart` | `sun`, point | The chart is an SVG from `sun.profile` and the Dec-21 arc (viewBox 360×100), **B11** below. Caveat: "Grey is bare-earth terrain from lidar; trees add to it…" |
| `DarkSkies` | `sky`, point | Caveat: "Zenith brightness from the Light Pollution Atlas {year}… The atlas is zenith-only…" |
| `ExistingHouse` | `house`, `sites` | "As sited"; the bottomland and SFHA items; the four comparison sentences (L1505) |
| `WhereToBuild` + `CompareTable` | `sites`, `shelves`, `excluded`, `house` | The top 3 cards, the side-by-side table, shelves, excluded benches, and the footer "Ranked by overall = 70%…" |
| `Driveway` + `ProfileChart` | `driveway` | Entrances, routes, the pioneer track, the profile SVG. Caveat: "Least-cost route over the 3 m lidar…" (uses `demResM`, not a hard-coded 3, **B12**) |
| `WhereToGarden` | `gardens` | G1–G3 and the frost-position note |
| `Soils` | `soils`, `soilUnits` | Map units with their swatches; per component, `soilRead` (already pure in `lib/screen/soils.ts`, tested against the prototype) |
| `Floodplain` | `flood` | The three variants, including "Unmapped is not the same as safe…" |
| `PublicLand` | `protected` | Caveat: "Conservation easements on private land are not in this layer…" |
| `GettingThere` | `drives`, `near`, `nearNote`, `roadNote` | Caveat: "Drive times from OSRM's public router — fine for comparing parcels, not for catching a flight… trailhead counts undercount national forest access…" |
| `StillUnknown` | — (a static list of 9, L1557) | The block renders the list with an optional `checked` map. The ticking is chrome. |

**Dropped: "Save this parcel"** (name, notes, Save, Copy summary; L1559). 13e replaced saving with built parcels
in History, and notes with the Info panel's Notes tab. **Copy summary** moves to the Screen it header (**Q3**).

### Bugs found in the inventory (proposed fixes, listed like B1–B10)

- **B11.** The horizon chart labels E at x=4, S at x=176, W at x=350, but x is azimuth, so x=0 is **north**.
  Proposed: label N at 0, E at 90, S at 180, W at 270. The plotted data is unchanged.
- **B12.** The driveway caveat hard-codes "3 m lidar". Proposed: show the run's `demResM`. It reads "3 m" on
  both reference parcels, so nothing visible changes there.

## 4. The explorer: "Screen it" (panel chrome)

Per plan 13e §5, the report sections stay in the side panel, and the step list sits under **Screen it**:

- **Run** screens the open parcel's derived boundary, with its house, using the user's config.
  - It's disabled with no parcel, or when the parts don't make one boundary.
  - Running marks the parcel built: `screenIds` is one of the built rules.
- **Cancel** while running. **Run again** afterwards.
- **The step list:** 11 steps with dots for pending, run (pulsing), done, fail and skip. It shows each
  step's message and the near step's "test the query" link (L991).
- **Stale results.** If the parcel's boundary or house has changed since the run, a line reads "These
  results are for an earlier boundary. Run again." It's based on a hash of the screened polygon plus the
  house, stored with the result.
- **Moving the house** after a run re-assesses through the worker's `setHouse`, with no re-run, as the
  prototype did. After a reload the session is gone, so the stale line asks for a run instead.
- **Phones:** when a run finishes with the sheet in map mode, the sheet rises once to its middle snap (the
  prototype's L1566 behaviour).
- **Collapsible sections:** `Section` wraps each block in `<details>`, keyed by the prototype's slugs
  (`verdict`, `december-sun`, …). Open state is saved in `ps.open` with `OPEN_DEFAULT` (L1194).
- **Help dialog:** "How to read this" in the panel header, plus a "?" link per section that jumps to its
  anchor. The copy is verbatim, with C4 already fixed.
- **Copy summary:** `summaryText(result)` (already ported) is copied to the clipboard, and the hint says
  "Summary copied".
- **The `/dev/screen` page is removed**, as its header promised.

**Where results live in Phase 0 (Q2).** Proposed: each run is kept in **IndexedDB**, keyed by a new screen
id appended to the parcel's `screenIds`.
- **Reopening:** a parcel from History shows its last results without re-running.
- **Phase 1 import:** these become `screens` rows. Results are immutable: a re-run is a new id, matching
  CLAUDE.md's rule.
- **Why not localStorage:** a result with soil-unit geometry runs to hundreds of KB, too big to share
  localStorage's ~5 MB across many parcels.
- **The alternative** is memory only, with results lost on reload: simpler, but History would show
  parcels with no results.
- **Implementation:** about 60 lines of plain IndexedDB in `lib/client/screenStore.ts`; no dependency.

## 5. Recording a run's settings in the result (Q1)

The blocks need four thresholds the prototype read from `CFG` at render time. A stored result must also say
which settings produced it: a parcel page rendered after the user changes Settings must not relabel an old
run.

- **Done in 14a:** `params: { houseMin, shelfMin, gardenMin, canopyDeg }` on `ScreenResult`, set by
  `screen()` from the input config. These are the four settings the report reads. `roadMaxGradePct` was
  dropped from the proposal: no section reads it, because a route carries its own `maxGrade`.
- **Version:** bump `SCREEN_SCHEMA_VERSION` to 2.
- **Goldens:** add the field to the golden mapping in `test/support/fromPrototype.ts`, read from the
  recorded input config. No computed number changes.
- **Alternative:** pass the config into the blocks. Rejected: it breaks "pure from the result" and lets a
  page relabel old runs.

## 6. How a print variant plugs in (not built now)

- **The variant switch.** `Variant` widens to `"panel" | "page" | "print"`. Every place a block branches on
  `variant` is a `switch` the compiler checks, so adding a member flags each spot.
  - In `print`, the map pointers (§2) are left out, or replaced by "see the map above" where a snapshot
    block precedes them.
  - In `print`, no `actions` are passed, so no controls render.
- **Everything shows.** Collapsing is chrome, not part of a block, so a print page simply renders every
  block open. `StillUnknown` takes the user's ticks as `checked` from the parcel record.
- **Layout.** A print stylesheet (`@media print`, or a `.print` root class for the headless-Chromium route)
  sets:
  - `break-inside: avoid` per block;
  - fixed physical sizes for the two SVG charts (they're `viewBox`-based, so they scale cleanly);
  - print-safe colours for the badges and grade chips;
  - URLs printed after their links.
- **The route.** The Phase 1 PDF route renders `/parcels/[id]/print` as a Server Component page. It composes
  the header, the map snapshot image, the same blocks with `variant="print"`, and the user-authored
  blocks, then prints it with headless Chromium. The renderToStaticMarkup tests in step 14 already prove the
  blocks render on the server.
- **Caveats.** Because the PDF won't carry the help dialog, any caveat that lives only in help must also be
  in its block. Today that's one: the soil map-unit-scale sentence (L322). **Q4** proposes adding it to the
  `Soils` block now.

## 7. PRs (each small, with its own preview and "what to click")

1. **14a: blocks I.** `lib/report` view functions, the `blocks/types.ts` contract, `Verdict`, `Terrain`,
   `DecemberSun` + `HorizonChart`, `DarkSkies`, the lint rule, and the node render tests. Shown on a temporary
   `/dev/results` page that renders the golden results, so it can be clicked before the panel exists.
2. **14b: blocks II.** `ExistingHouse`, `WhereToBuild` + `CompareTable`, `Driveway` + `ProfileChart`,
   `WhereToGarden`.
3. **14c: blocks III.** `Soils`, `Floodplain`, `PublicLand`, `GettingThere`, `StillUnknown`. (`params` moved
   to 14a: the Terrain and sun blocks need it.)
4. **14d: Screen it.** Run, Cancel, the step list, stale results, house re-assessment, the sections in the
   panel with `Section` and `ps.open`, the phone sheet raise, and IndexedDB results (Q2). Removes
   `/dev/screen` and `/dev/results`.
5. **14e: help and summary.** The help dialog with its anchors, and Copy summary.

## 8. Tests and acceptance

- **Render tests, per block:** `renderToStaticMarkup` in node, for each golden result (Ferney Creek, Macks
  Mountain, the house run, the `evaluateAt` re-evaluation), each partial snapshot, and a cancelled run.
  Every block renders without error. Each caveat string is present where its data is, and absent otherwise.
- **Text parity with the prototype, where practical:** the prototype's own `renderResults` (extracted, as
  the soils tests already do with `soilRead`) runs on the same golden `R`. Each section's visible text,
  whitespace-normalised, is compared with the block's. It's the same oracle pattern as `soils.test.ts`.
  Differences allowed: B11, B12, Q4, and the dropped Save section.
- **View functions** (`lib/report/*`) are unit-tested directly.
- **The chrome** (Section open state, Run and Cancel, stale results, Copy summary, help anchors) gets a
  headless run against `next start` on the live reference parcels, as for 13e.
- **Deviation from `phase-0.md` step 14** ("jsdom: every section renders"): the blocks are tested with
  node rendering, which is stricter (it proves server rendering), and no jsdom dependency is needed.
- **§7b items covered:**
  - the panel text matches the prototype;
  - the "?" links jump to the right anchor;
  - Copy summary equals the prototype's;
  - open state persists;
  - the caveats are present;
  - partial sections appear as steps finish;
  - Cancel shows "(run cancelled)";
  - a failure shows "Incomplete: …".

## 9. Decisions (owner, 2026-10-06)

All six recommendations are approved, with these details:

- **Q2:** IndexedDB results are keyed by the same screen ids as the parcel's `screenIds`.
  - A parcel reopened from History with no live session shows its results, plus a note that running again
    restores the map overlays, the horizon fan and the 3D view.
- **Q5:** the horizon chart is labelled N, E, S, W at x = 0, 90, 180, 270.

The questions, as asked:

1. **Q1 Settings in the result:** add `params` to `ScreenResult` (schema v2), so blocks stay pure and stored
   runs keep their own thresholds? *Recommended: yes.*
2. **Q2 Phase 0 results:** keep each run in IndexedDB keyed by screen id, so History reopens with results?
   Or memory only? *Recommended: IndexedDB.*
3. **Q3 Save and Copy summary:** drop "Save this parcel", since History and Notes replace it, and move Copy
   summary to the Screen it header? *Recommended: yes.*
4. **Q4 Soils caveat:** add the map-unit-scale sentence (now only in help, L322) to the `Soils` block, so the
   parcel page and the PDF carry it? *Recommended: yes, listed as a deviation.*
5. **Q5 Bug fixes B11 and B12:** horizon chart compass labels, and the driveway caveat's resolution.
   *Recommended: fix both, listed as deviations.*
6. **Q6 Still-unknown ticks:** in Phase 0 they aren't saved (the prototype never restored them). Phase 1
   stores them with the parcel. *Recommended: don't save them in Phase 0.*
