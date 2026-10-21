# Step 9: Report card export

Written 2026-10-21 under mission mode (`CLAUDE.md`). Zach pre-approved the brief and this plan's recommended answers
(§9). The step runs straight through on `step/9-report-export`: this plan is PR 0 into the step branch, and Zach reviews
it with the hand-back. The stop conditions are in §10.

Sources:
- `docs/design/workflow-review.md`, "The report card export";
- PLAN.md row 9;
- Zach's brief of 2026-10-21. It leaves out ways to raise the grade (step 12) and cost to enjoy (step 10), with no
  placeholder sections for them.

**The goal:** a print-ready report card for any graded parcel. The browser's Print → Save as PDF turns it into a file.
It works from Chrome on Android, desktop Chrome and Safari.

Done when:
- **Report card** opens from the parcel panel's header ⋯ and from a Favorites row's ⋯, on any graded parcel.
- **`/parcel/<key>/report`** renders from the saved screen alone. Nothing is fetched but the map's tiles (and the screen
  itself, the way the panel fetches a synced screen not yet on the device).
- **One page and Full** sit on a switch at the top. The switch, Back and the print button don't print.
- **One page fits one US Letter page,** shortening rows rather than spilling onto a second.
- **The map** prints in the saved PDF on Android Chrome: aerial imagery, the boundary, the best site and the
  alternatives, your lines, and the attribution line under it.
- **Black and white:** letters, marks (✓ ! ✗ ?) and words carry every meaning, never colour alone.

## 0. What's there today (found while planning)

- **No `/parcel` route, and no print CSS.** Pages are thin server files around a client component
  (`CompareClient` is `ssr: false`). `app/layout.tsx` wraps every page in `ProfileGate` > `AppFrame`.
  `showsNav(pathname)` (`lib/client/places.ts`) is how a page drops the tab bar.
- **The saved screen:** a parcel's `screenIds.at(-1)` read with `readScreen` (`lib/client/screenStore.ts`). It reads
  IndexedDB first, and then the synced space's copy, as the panel does. `useKeptScreens` gives `ok | rescreen | none`.
- **The card:**
  - `reportCard(result, rubric, drawnOf(markup, drivewayLine))` (`lib/report/card.ts`), with `mustLines` and
    `rankedRows` (`lib/report/cardLines.ts`) in the rubric's order;
  - `answerLine` and `answerReason` (`lib/report/answer.ts`);
  - `agentQuestions(card)` (`lib/report/agent.ts`).
  - Other members' grades come from `otherMembers()` with their own rubric (`components/Household/Others.tsx`). Takes
    come from `useHousehold()` and `takeOf` (`lib/client/takes.ts`).
- **The report's blocks** (`components/Results/report.ts` `REPORT`):
  - Verdict, Terrain, December sun (with the SVG horizon chart), Dark skies, Existing house, Where to build,
    Driveway, Where to garden, Soils, Floodplain, Public land, Getting there (drive times), Still unknown.
  - They render from the result. A missing map or session degrades quietly: `useOpenGround` is null, and `useHelp`
    is a no-op.
  - Best homesite (`BestHomesite`) needs the map's callbacks.
  - Lines and marks live only in Details (tied to the explorer).
- **The map:**
  - MapLibre with DOM markers for the pins. No `preserveDrawingBuffer`, and no static-map code.
  - The basemaps' tile URLs and attribution are in `components/Map/style.ts`: USGS imagery, Esri, and the VA, NC and TN
    orthos.
  - Web-mercator helpers exist privately in `lib/geo/parcelTiles.ts`.
  - The polygon comes from `deriveParcel(recipeOf(p))` (`lib/geo/recipe.ts`).
- **Dates:**
  - The result records `runAt`, `engine`, `demSource` and `demResM`, `sky.year` (the atlas's year), `failed` and
    `noResponse`.
  - `ENGINE_VERSION` is 22.
  - There are no per-service dates beyond the run's own.
- **Menus:** the panel header has the star and × only. A row's ⋯ (`OrderMenu`) shows only in My order.
- **Offline:** the service worker precaches fixed pages only. Any other navigation falls back to `/explore`.

## 1. The page

`app/parcel/[key]/report/page.tsx` is a thin server file. `components/Report/ReportPage.tsx` does the rest
(`ssr: false`).

- **Loads:** the parcel by key from `ps.parcels`, its saved screen, the viewer's rubric (`viewedRubric`), the other
  members with their rubrics, and the household's takes.
  - The card and every block are computed in the page from those. Nothing runs the engine.
- **States:**
  - Loading: "Loading the report card…".
  - Not found: "This parcel isn't on this device." with Back.
  - Not graded: "This parcel hasn't been graded yet." with Back.
  - Older version: the app's own line, "Saved with an older version; screen it again." with Back.
  - Map failed: "The map couldn't load. The rest of the report card is complete." where the map would be. It prints.
- **No app chrome:** `showsNav` excludes `/parcel/`, and the page has its own top bar: **← Back**, the switch, and
  **Print or save as PDF** (`window.print()`). Print CSS hides the bar.
  - Back returns to where you came from (`router.back()`), or to Your list when there's no history.
- **The switch:** **One page | Full**, a two-segment control like Your list's, remembered per device (`ps.reportPreset`).
  The URL takes `?preset=full` too, so a link opens the same view.
- **The page itself** is laid out at print size on screen too: a white sheet 8.5 in wide with 0.5 in margins, over the
  app's paper colour. What you see is what prints.
- **Offline:** the service worker serves a precached shell for `/parcel/*/report` (one fallback entry, matched by path).
  The page reads the key from the URL, so a parcel already on the device prints offline, except for the map's tiles.

## 2. One page

In order:
1. **The head:** the parcel's name, its acres, its asking price with its date if known, and "Graded Oct 20, 2026" (the
   screen's `runAt`). A stale screen (the boundary changed since) adds "Graded on an earlier boundary."
2. **The map** (§4), about 3.3 in tall across the page.
3. **The grades:** one line per household member who has priorities, the viewer first.
   - For example: "**B** Contender · Zach — Strong elevation and winter sun; the nearest trailhead is 47 minutes away,
     past your 20-minute limit; check first: legal road access."
   - Each line is that member's own answer line, with "Held at Maybe by: …" when it applies.
4. **The report card:** the viewer's rubric. Must have, then Really want and Nice to have in rank order, each row with
   its label, its letter or mark (✓ ! ✗ ?) and its detail. Don't care rows are left out, as on the card.
5. **Takes,** if any: "Julie says Maybe: “Steep drive, lovely spring.”" One line each, the whole comment.
6. **Questions for the agent:** `agentQuestions(card)`, numbered. With none: "Nothing for the agent: every must was
   checked."

**The fit:** the page measures its sheet against the Letter print area (7.5 × 10 in at 96 px per inch) once the map is
laid out. If it spills, it steps through these until it fits, each step kept while the next is tried:
1. each row's short value (`row.short`) instead of its detail;
2. the takes' comments to one line each, with "…";
3. the map down to 2.4 in;
4. the answer lines to one line each, with "…".

It never drops a section. A unit test checks the steps' order. An e2e prints each fixture with `page.pdf` and checks
it's one page.

## 3. Full

The one-page summary (§2, not shortened) starts on page 1. Then, each section starting on a new page only where it
wouldn't fit (`break-inside: avoid` on blocks, `break-before` on the big ones):
1. **The priorities it was graded against:**
   - Must have: the dealbreakers and limits, in the interview result's words (`plainLine`, `minimumLine`).
   - Really want and Nice to have, in order with each one's weight as a percent (`weightsOf`).
   - Don't care in one line.
2. **Best site and alternatives:** the best site and the person's alternatives, each with its place in the order, its
   pin number and its numbers (`topNumbers`). Then Where to build, Terrain and the existing house's blocks.
3. **Access and driveway:** Legal road access and Driveway on your land with their full reasons, then the Driveway
   block.
4. **Winter sun and the horizon:** the December sun block with its horizon chart.
5. **Night sky:** Dark skies.
6. **Soils, septic and flood:** Soils, Floodplain, then Where to garden.
7. **Drive times:** Getting there and getting out, then Public land within a mile.
8. **Listing facts and notes:** listing link, asking price with its date, listing acres (with the boundary's note),
   agent, status (Archived and why, Walked, Offered), and the notes in full.
9. **Lines and marks:** the house site if marked, then each line (name, kind, condition, length, width, recorded in,
   note) and mark (name, kind, area or point, note), as Details lists them.
10. **Data sources** (§8): each source with what it gave. Its date is the screen's `runAt`, except the light-pollution
    atlas, which is its year. Any that didn't load are listed with "didn't load". The engine version closes the list.
11. **The closing line:** "This is a desk screen, not a survey, perc test or appraisal."

Full's summary keeps all of the summary's sections, including the questions for the agent. Still unknown's checklist
follows them there ("More to check that no dataset covers").

The data-source caveats stay where the blocks already state them:
- bare-earth DEM (Driveway);
- the soil map unit's scale (Soils);
- the atlas being zenith-only (Dark skies);
- OSM undercounting trailheads (Getting there).

## 4. The map (the technical choice)

**A static render, not a capture of the live canvas** (§9 Q1).
- It's DOM only: the aerial imagery's tiles as `<img>` elements in a clipped box, and one `<svg>` over them for the
  boundary, the sites and your lines.
- Printing an `<img>` and inline SVG is the most reliable thing a browser prints, Android Chrome's Save as PDF
  included.
- A WebGL canvas, the live map, prints blank unless it's re-created with `preserveDrawingBuffer`. It's also only
  mounted after `/explore`, and capturing it would need CORS on every tile server.
- **Tiles:** the national USGS imagery (public domain, every state), at the zoom that fits the parcel's bounding box
  with a margin. Each tile is drawn at half size, so it's 2× resolution on paper (about 190 dpi at Letter width). A
  tile that fails is retried once from Esri World Imagery; the attribution names whichever drew.
- **Overlay**, in black and white as well as colour:
  - the boundary: a white line with a dark edge;
  - the best site: a filled numbered disc;
  - the alternatives: ringed numbered discs;
  - your lines: dashed, by kind, the dash saying what a colour would;
  - a marked house: the bulls-eye.
  - A north arrow and a scale bar (feet or miles) sit in the corner.
- **Under it,** one line: "Imagery: USGS (public domain) · Boundary: {source} · Sites and lines: Parcel Screen".
- **Print waits for it:** Print or save as PDF is enabled once every tile has loaded or failed. A tile still loading
  when the browser's own Print is used prints as the grey it sits on, with no broken image.
- **The pure part,** `lib/print/staticMap.ts`, is unit-tested: lat/lon to web-mercator pixels, the zoom and tile range
  for a box, the scale bar's length.

## 5. Where the button is

- **The panel's header:** a ⋯ button beside the star (44 px) with a menu: **Report card**. It's enabled when the
  parcel is graded. Otherwise it's disabled with the title "Grade it first".
- **A Favorites row's ⋯:** the menu shows in every sort. Move up and Move down still appear in My order only, and
  **Report card** and Remove from favorites in all sorts. Report card is in the menu only for a graded row.
- Both open the page in the same tab (§9 Q3).

## 6. Print styling

- `@page { size: letter; margin: 0.5in; }` with no app chrome: the top bar, the tab bar, toasts and the sync indicator
  are hidden in print.
- Type is the app's, at print sizes (10.5 pt body, 9 pt rows).
- Rows keep together (`break-inside: avoid`). Full's sections start a new page only when they'd otherwise split badly:
  Best site, Winter sun, Soils, Listing and Data sources take `break-before: page` when they wouldn't fit in what's
  left (decided by CSS, not measured).
- Grades print as the letter in a box outlined in ink, with no fill colour needed. Marks are the symbols. Verdicts are
  the words.
- `print-color-adjust: exact` keeps the map and the grade boxes' fills where colour prints. Nothing depends on them.

## 7. UX

- **The main task, in the fewest steps:** ⋯ → Report card → (One page or Full) → Print or save as PDF. That's three
  taps on a phone to the system's print sheet.
- **What you see first:** the report itself, as it will print, with the switch and the print button above it.
- **Empty, loading, error and slow states:** §1's states. The map shows "Map loading…" in its box while tiles come.
  Print waits for the map (§4). With no network the map says it couldn't load, and the rest prints.
- **Plain labels:** Report card, One page, Full, Print or save as PDF, Back.
- **The phone at 375 px:** the top bar wraps to two rows (Back and Print; then the switch, full width, two 44 px
  segments). The sheet scales to the screen's width on screen. Print still lays it out at Letter size.
- **Contrast and consistency:** the switch and buttons reuse the app's (`list-switch`, `btn`). The sheet is black on
  white, and passes AA.

## 8. New strings (rule 7: new only; the rows, blocks, answer lines and questions reuse their text)

- Report card · One page · Full · Print or save as PDF · ← Back · Grade it first
- Loading the report card… · This parcel isn't on this device. · This parcel hasn't been graded yet.
- Map loading… · The map couldn't load. The rest of the report card is complete.
- Graded {date} · Graded on an earlier boundary. · Asking {price} as of {date} (the listing's existing words where they
  exist)
- Takes · Questions for the agent · Nothing for the agent: every must was checked.
- The priorities it was graded against · Best site and alternatives · Access and driveway · Winter sun and the horizon ·
  Night sky · Soils, septic and flood · Drive times · Listing facts and notes · Lines and marks · Data sources
- The sources' lines, one per source:
  - USGS 3DEP lidar ({demSource}, {demResM} m);
  - NRCS soils (Soil Data Access);
  - FEMA flood map (NFHL);
  - USGS PAD-US (public land);
  - Light pollution atlas (D. Lorenz, {year});
  - Census TIGER roads;
  - OpenStreetMap places and trailheads;
  - OSRM drive times.
  - Each line ends with "as of {date}", or "didn't load".
- Graded by engine version {n}.
- Imagery: USGS (public domain) · Imagery: Esri, Maxar, Earthstar Geographics (when it fell back)
- This is a desk screen, not a survey, perc test or appraisal. (the brief's own words)

No report text, verdict text or `expected.json` changes.

## 9. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **The map:** a static DOM render (tiles and SVG), not a capture of the live canvas (recommended, §4).
2. **Imagery:** USGS national imagery, with Esri per failed tile (recommended: public domain and nationwide). The state
   orthos are sharper in places, but one source keeps the print the same everywhere.
3. **Same tab or new:** same tab, with Back (recommended: an installed app on Android has no tabs to come back from).
4. **A print button** besides the browser's menu: yes, "Print or save as PDF" (recommended: Android hides Print in a
   menu).
5. **Whose rubric orders the rows:** the viewer's, the one their card shows (recommended).
6. **The grades shown:** the viewer's first, then each other member who has priorities. Members without priorities are
   left out (recommended).
7. **The blocks the brief doesn't name** go in the nearest named section, and nothing's dropped (recommended, §3):
   - terrain, where to build and the existing house with Best site;
   - where to garden with Soils;
   - public land with Drive times;
   - Still unknown with the questions.

   The Verdict block's content is the summary's grades.
8. **A stale screen** (boundary changed) still prints its saved screen, saying "Graded on an earlier boundary."
   (recommended: the page shows what was saved). An ungraded parcel has no button.
9. **Offline:** a precached shell (recommended: one fallback entry). Without it, offline goes to the map.
10. **Takes:** every member's take with its comment. Asks aren't printed (recommended).
11. **The date:** the screen's own ("Graded …"), not today's (recommended). The browser's header and footer, which
    carry today's date, are the browser's setting.
12. **The fit's steps:** §2's order (recommended: the map shrinks before the answers do).
13. **Page numbers:** none of our own (recommended: CSS page counters don't work in every browser). The browser's footer
    can add them.

## 10. Stop conditions (push what's there, say why, wait)

- Any report, verdict or row text, or `expected.json`, would change.
- One page can't fit a fixture's report on one page after §2's steps without dropping content.
- The map can't be made to print on Android Chrome (this is checked on the preview; if it fails, stop with what's
  known).
- A product decision outside this brief and §9.
- The same CI failure surviving three attempts.
- The plan turning out wrong.

## 11. Setup

None from Zach.

## 12. The PRs, into `step/9-report-export`

| PR | What | Checks |
| --- | --- | --- |
| 0 | This plan. | docs |
| 1 | **The page and One page:** the route without app chrome, loading and its states, the switch, print CSS (`@page`, hidden chrome), One page's sections and the fit, `ps.reportPreset`, the precached shell. | unit: the fit's steps, the page's data (`lib/print/report.ts`); e2e: open a seeded parcel's report, both states, `page.pdf` One page = 1 page for Mud Creek, Ferney, Macks and Roan |
| 2 | **The map:** `lib/print/staticMap.ts` and the map component (tiles, overlay, scale, north, attribution, the fallback, Print waiting). | unit: projection, zoom and tiles, scale bar; e2e: tiles requested for the box, the overlay's boundary and sites, Print enabled once loaded or failed |
| 3 | **Full:** §3's sections, with the rubric, best site, listing, lines and marks, and data sources as new small components; the blocks reused; page breaks. | components: each section renders from a fixture; e2e: Full for Roan and Mud Creek, the closing line, no step-10 or step-12 section |
| 4 | **The buttons, the screenshots, the PDFs, the fresh-eyes review, the docs and the hand-back:** the header ⋯ and the row ⋯ in every sort; screenshots (One page and Full as rendered and as print previews, the button at 1280 and 375); PDFs for Mud Creek and Roan; REQUIREMENTS; `phase-0.md` §9.62; PLAN.md's row 9. | e2e: ⋯ → Report card from the panel and from a row; full CI on the step branch's head |

## 13. Test plan outline

**CI:**
- unit tests for the pure parts;
- e2e on the fixtures: the page from both entry points, both presets, `page.pdf` page counts, the closing line, the
  map's overlay.

**Manual, on the preview,** with Mud Creek and Roan, One page and Full:
- on desktop Chrome (and Safari if at hand): Print → Save as PDF;
- on Zach's Android phone: Print or save as PDF → Save as PDF.

Open each PDF: the map shows, nothing is cut off, One page is one page, and it reads in black and white (print or view
it in greyscale).

## 14. Decision to record

**§9.62 The report card export:**
- `/parcel/<key>/report`, from the saved screen alone, without app chrome;
- One page (fit to one Letter page by shortening, never dropping) and Full (the brief's sections, the unnamed blocks
  placed by §9 Q7);
- a static print map (USGS imagery tiles and an SVG overlay);
- Report card in the panel header's ⋯ and a Favorites row's ⋯;
- the precached shell;
- §9's answers.
