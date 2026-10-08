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
