# Step 18: e2e and acceptance (plan)

Status: **draft, for approval.** The last Phase 0 step (`phase-0.md` §6 row 18 and §7). Two PRs: 18a adds the browser e2e and its CI job; 18b covers the README, the production deploy and the §7b manual acceptance run.

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
  7. **The ground viewer opens** (Stand here), day and then night, with no page errors. This replaces the row's "3D opens", since step 17 replaced the walkthrough.
- `package.json`: an `e2e` script.
- `.github/workflows/ci.yml`: a fourth job, `e2e`. It installs pnpm and Chromium (`playwright install --with-deps chromium`), builds and runs. I estimate it adds about 5 minutes per run, in parallel with the other three jobs.

**A spike first, inside 18a:** confirm that `context.route` intercepts the dedicated worker's fetches in Chromium. If it doesn't, the fallback is a test-only replay switch the worker reads at start (`?replay=` with a same-origin route under `/api/e2e/*` that exists only when `E2E=1`). I'd ask before taking that path, because it adds a route to the app.

## 2. PR 18b: README, production and acceptance

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

1. **"3D opens" → "the ground viewer opens, day and night".** Should the e2e also toggle the 13g terrain on? Its tiles aren't in the fixtures, so it would only check that the toggle doesn't error. I propose leaving terrain to the §7b manual run.
2. **The e2e on every PR** (about 5 more minutes), or only on `main`? I propose every PR: it's the only test of the worker bundle.
3. **Live drift in the side-by-side:** the prototype and the port both run against live services the same day, so they see the same data. Differences are reported against the intended-differences table, not against the October 4 goldens.

## 4. Checks

- **18a:** CI green with the new `e2e` job. The e2e passes locally twice in a row, with no network beyond localhost (shown by the aborted-request list). A deliberately broken comparator field, tried locally only, makes it fail.
- **18b:** the §7b checklist complete in the PR, with the owner's phone items marked for the owner, and production serving `main`.
