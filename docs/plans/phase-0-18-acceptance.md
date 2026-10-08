# Step 18: e2e and acceptance (plan)

Status: **approved with additions (owner, 2026-10-07)**; the additions are folded in below, and §3 records the answers. The last Phase 0 step (`phase-0.md` §6 row 18 and §7). Two PRs: 18a adds the browser e2e and its CI job; 18b freezes schema v2 and covers the README, the production deploy and the §7b manual acceptance run.

## 1. PR 18a: the e2e

**What it proves (§7a.4):** the result the screen's **Web Worker** posts in a production build (`next build && next start`) passes the same comparator as the Node goldens, with the same tolerances (§7a.3). The Node tests prove the pipeline. This proves the in-browser path: the worker bundle, the Turbopack worker bootstrap, the http client in a worker, and the UI around it.

**Files:**
- `playwright.config.ts`
  - Chromium only, one worker.
  - `webServer` runs `pnpm build && pnpm start` on port 3000.
  - `serviceWorkers: "block"`, as the 17c plan requires. Playwright doesn't route requests a service worker answers, and the e2e is about the screen, not the PWA.
- `e2e/replay.ts`: replays the fixture HAR through `context.route`, reusing `test/support/replayFetch.ts`'s matching.
  - **Not `routeFromHAR`:** it matches query strings and form bodies in their recorded order. The port sends ArcGIS and SDA parameters in a different order from the prototype, which is why the Node replay compares them order-insensitively.
  - **Network policy:**
    - localhost passes through.
    - A request found in the HAR is answered from it.
    - A **data** request missing from the HAR fails the test with its normalized key, as `ReplayMissError` does in Node.
    - Everything else is aborted and listed in the test's output, not failed: basemap, ortho and parcel-line tiles, and the terrain tiles. The map then draws without imagery, which the screen doesn't need.
- `e2e/screen.spec.ts`: one test per reference parcel (Ferney Creek 52-47A, Macks Mountain 35-3):
  1. Open `/explore` with an empty profile and `ps.debug` set, so `window.__psScreen` is exposed.
  2. **Bring the parcel in through History import** (16b), a real UI path. The test writes a prototype-format export (`{ saved: [...] }`, no `cfg`, so the default settings stand, as in the goldens) from the fixture's `input.json` polygon, then imports it. This needs no recording of the live parcel services. The house run uses the bulls-eye position from `input.json`.
  3. Open it from History, then Screen it, and wait for the run to finish.
  4. Compare `__psScreen.result` with `golden.json` using `test/support/compare.ts`.
  5. Check each report section's heading is visible, and that the step dots all ended "done".
  6. Tap site #2's pin; the re-evaluation passes the golden re-evaluation (§7a.3's `evaluateAt` item).
  7. **The ground viewer opens** (Stand here), day and then night, with no page errors. This replaces the row's "3D opens", since step 17 replaced the walkthrough. The 13g terrain toggle stays in the manual run (§3.1).
- `e2e/pwa-screen.spec.ts`: **one e2e with the service worker allowed to install** (`serviceWorkers: "allow"`). It guards against 17c's startup bug, where a cached worker entry lost Turbopack's `#params=` bootstrap and the screen never started. Steps:
  1. Load `/explore` and wait for the service worker to activate.
  2. Relaunch in a new tab until the page is controlled.
  3. Run a full Ferney Creek screen, with the same HAR replay and the same comparator.
  4. Also assert that the worker entry (`turbopack-worker-*.js`) was not served by the service worker, and that no data request was.

  Routing requests from a controlled page may need Playwright's service-worker network events (`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`). Our service worker answers nothing outside the precache, but Chromium can still send those requests from the service worker's context. The spike below settles which.
- `package.json`: an `e2e` script.
- `.github/workflows/ci.yml`: a fourth job, `e2e`, on every PR and on `main`. It installs pnpm and Chromium (`playwright install --with-deps chromium`), builds and runs, adding about 5 minutes in parallel with the other three jobs. A path filter skips it for docs-only changes (`docs/**`, `**/*.md`), with a stub that reports success so a required check isn't left pending (§3.2).

**A spike first, inside 18a:** confirm that `context.route` intercepts the dedicated worker's fetches in Chromium, with the service worker blocked and with it allowed.

**If it doesn't, I ask before taking the fallback** (owner): a test-only replay switch the worker reads at start, a same-origin route under `/api/e2e/*`. It must be **excluded from production builds**, gated by an environment variable at build time, not at run time. A test must prove it's absent from `next build` output: the route isn't in the build's route manifest, and its code isn't in any emitted chunk.

**A one-time negative check, recorded in the 18a PR:** change one golden value, confirm the e2e fails with a readable diff naming the field, expected and actual, then revert. The PR quotes the failure output.

## 2. PR 18b: README, production and acceptance

- **Freeze schema v2** (owner; it was left open through Phase 0 for added `params` fields):
  - `SCREEN_SCHEMA_VERSION` stays `2`, and a test pins it.
  - A snapshot test of the stored `ScreenResult` shape: the Zod schema as JSON Schema (`z.toJSONSchema`), committed as a snapshot. Any added, removed or retyped field fails it.
  - A note in CLAUDE.md: any change to the stored shape requires **v3 plus a migration** of stored results.
- **README:**
  - what the app is;
  - running it locally;
  - the three test layers (Vitest, fixtures, e2e) and how to re-record the fixtures (`scripts/record-fixtures.mts`);
  - the deploy (Vercel, `main` is production) and the PWA notes (the service worker only in production; e2e blocks it);
  - the data-source caveats, as the UI states them.
- **Production deploy:** `main` deploys to `parcelscreen.vercel.app`. The PR records that production runs `main`'s HEAD (the revision in `/serwist/sw.js`).
- **§7b on the production URL, against live services.** The checklist is filled in the PR description, with screenshots on `pr-assets/18b/`:
  - I run the desktop items, and the 375 × 812 items in emulation, with Playwright.
  - The prototype (`legacy/parcelscreen.html` served locally) runs live the same day, side by side, on both reference parcels. Verdict, pins, December sun hours and sky mag are compared.
  - **Owner's pass:** the items that need a real phone (Android Install, standalone launch, an update on relaunch, touch rotate and pitch, the phone frame rate).
- **One table of intended differences from the prototype**, each with its reason and its PR: B1/B8, the places outage (decision 11), the multi-part note, the ground viewer replacing scenes 1–6, 17b's clock time, and 17c's offline state. A live mismatch that's not in the table is investigated in 18b. It's fixed there only if it's a port bug; otherwise it becomes a follow-up.

## 3. Open questions

Answered (owner, 2026-10-07):

1. **The e2e opens the ground viewer, day and night.** The 3D terrain toggle stays in the manual run.
2. **The e2e runs on every PR,** with a path filter skipping docs-only changes.
3. **The prototype and the port run live at the same moment, and are judged against the intended-differences table.** A difference not in the table is either a bug or a new row the owner approves. **A row is never added just to pass.**

## 4. Checks

- **18a:** CI green with the new `e2e` job. The e2e passes locally twice in a row, with no network beyond localhost (shown by the aborted-request list). The service-worker e2e passes. The one-time negative check (a mutated golden value fails with a readable diff, then is reverted) is quoted in the PR. If the fallback route was used, a test shows it's absent from the production build.
- **18b:**
  - the schema-v2 pin and shape snapshot pass, and the CLAUDE.md note is in;
  - the §7b checklist is complete in the PR, with the owner's phone items marked for the owner;
  - every live difference either matches a row of the table or is listed as a bug or a proposed row;
  - production serves `main`.

## 5. Intended differences from the prototype (18b, live run 2026-10-08)

The prototype (`legacy/parcelscreen.html`, served locally) and production (`main` at `2ed4369`) ran both reference parcels
within four seconds of each other. Every section's text was read from both and compared line by line. Each row below is a
decision the owner already approved; the last column says what the live run showed. No row was added in 18b.

| # | Difference | Reason | Approved in | Live, 2026-10-08 |
|---|---|---|---|---|
| 1 | The routed driveway, entrances and culverts are drawn on the map (B1). | A prototype bug; the 2026-10-04 prototype fixes it too. | §1b, §9.1; #51 | Both draw it. |
| 2 | Sites are re-sorted and re-ranked after the driveway step (B8, B10). | A prototype bug; fixed in the 2026-10-04 20:36 prototype, ported verbatim. | §1b; #3 goldens | Identical pins on both parcels. |
| 3 | A places outage fails only the "near" step; the roads, road grade and its flag stay. | The prototype lost all three. | §9.11; #11 | Not live (the services were up); the forced-failure check shows "Incomplete: … didn't run". |
| 4 | A multi-part parcel says "only the first part screened". | B7: the prototype screened the first part silently. | §9.8; #5 | Not on the reference parcels; unit-tested. Follow-up 29. |
| 5 | The ground viewer replaces the six-scene 3D walkthrough; the aerial scenes are the 3D map. | Owner, 2026-10-07. | §9.12; #62, #64 | Dec 21 and Jun 21 hours equal the report's. |
| 6 | The ground viewer's labels are clock time in `UserConfig.timeZone`, with solar noon, sunrise/sunset and twilight marks. | Display only; numbers unchanged. | `phase-0-17-ground.md` "Clock time"; #64 | As planned. |
| 7 | Offline: the shell opens, with "You're offline — saved parcels still open from History". | The prototype has no offline state. | `phase-0-17c-pwa.md` §2; #65 | Owner's phone pass. |
| 8 | The horizon chart is labelled N, E, S, W at 0°, 90°, 180°, 270° (the prototype labelled E, S, W at 0°, 180°, 360°). | B11: x is azimuth from north. The plotted data is unchanged. | `phase-0-14-results.md` Q5; #34 | +1 line, "N", in December sun. |
| 9 | Soils carries "Map-unit lines are drawn at county scale, so a boundary can be 100 ft off on the ground." | The prototype had it in help only. | `phase-0-14-results.md` Q4; #41 | +1 line in Soils. |
| 10 | No "Save this parcel" or "Saved" sections; History and Notes replace them; Copy summary is in the Screen it header. | Q3. | `phase-0-14-results.md` Q3; #34 | Both sections absent; Copy summary text identical. |
| 11 | "See it from here — the skyline and the sun's path, standing at this point." under the horizon chart. | The ground viewer's entry from the report. | `phase-0-17-ground.md`; #62 | +1 line in December sun. |
| 12 | When no route meets the grade limit, the least-steep route is shown as suspect, appended after the prototype's sentence, which is kept. It may use outside land only within `leastSteep.entranceM` = 10 m of its entrance. | Rule 7: additive. | #52, #57 (§9 decision 15) | Macks: the prototype sentence, then the over-limit table. |
| 13 | Find a parcel: no "no parcel here" report and no square fallback; Draw replaces them. | 13e. | `phase-0-13e-parcel-tools.md`; #22, #27 | Draw 4/4 on production. |
| 14 | Split: no fit-to-acres; drag the line, tap the piece to keep. | 13e decision 15. | `phase-0-13e-parcel-tools.md`; #22, #27 | Split 1/1 on production. |
| 15 | Roads and labels over the aerials. | 17d. | `phase-0-17d-roads.md`; #70, #71 | Checked on production. |
| 16 | Parcel switching, the map panel, the phone sheet, kept live sessions. | 17e. | `phase-0-17e-switching.md`; #72, #73 | Checked; one bug found and fixed in 18b (Back after an unchanged run). |
| 17 | Point-to-line road distances use Turf 7.4.0 (the npm parts), not the prototype's 7.1.0 bundle. **Approved (owner, 2026-10-08, #78).** | 7.4.0's `pointToLineDistance` agrees with a brute-force distance; 7.1.0's overstates it. On Grayson Mud Creek, `driveway.roadsNearestFt` is 18.26 ft against the prototype's 18.43 ft (brute force: 18.262 ft). Ferney and Macks stay within the existing 0.05 ft tolerance. | A1 (#78) | Found on the Grayson fixture, the only difference in its two scenarios. |

**Not a difference:** the Groceries row read as one line in the prototype and two in the port. Same cells, same words:
the prototype separates grocers with `<br>`, and the port wraps each in a `<div>`, which `innerText` breaks onto its own line.
On screen both show the name in the value cell.
