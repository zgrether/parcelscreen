# Step 17e: parcel switching, the map panel, and the phone sheet (plan)

Status: **approved (owner, 2026-10-08)**; §7 records the answers. The `lib/screen/worker-protocol.ts` change is approved: the PR shows the goldens unchanged and the protocol tests. A small UX step before 18b (owner, 2026-10-08). It's UI only: no report text, the goldens untouched, no screen numbers. It builds on 17d (#71), whose "Roads & labels" toggle moves into the new map panel (§2).

## 1. Parcel switching (replaces the built-parcel guard)

Today (`decideTap`, `components/Explore/exploreState.ts`):
- a plain parcel swaps when you tap another;
- a parcel with results or notes stays put and shows "Tap it again to close it";
- tapping the open parcel, or empty map, closes it.

**New rules:**

| Situation | What happens |
|---|---|
| Tap another parcel (a county outline or a saved one), no screen running | **Switches immediately.** If the parcel left behind **has a screen**, a toast: **"{parcel} kept in History — Back"**, for about 5 s. **Back** reopens it. |
| Tap another parcel **while a screen is running** | **No switch and no cancel.** The hint says **"Screening — finish or Cancel first."** |
| The **×** in the results header (desktop card and phone sheet), or **Esc** on desktop | **Deselects** the parcel. Esc is ignored while a dialog, the ground viewer, a map tool or a text field has focus; those keep their own Esc. |
| An unsaved re-evaluation (a pin tapped) when you switch | **Dropped**, as before: re-evaluations stay unsaved. **Back** restores the run's own point, not the evaluation. |

"Tap it again to close it" and its `nudge` state are removed. **Tapping empty map or the open parcel:** see §7 Q1.

**The toast:**
- `{parcel}` is the name History shows (`parcelName`).
- It sits where the hint sits. A newer toast replaces it, as does any map tool starting.
- Back is an ordinary button, reachable by keyboard and screen readers (`role="status"` text plus the button).

### Live sessions for the 3 most recently screened parcels (LRU)

A "session" is what makes a result *live*:
- the map overlays (the surface rasters, pins, the horizon fan, the soil units, the driveway);
- the ground viewer;
- `evaluateAt` and `setHouse`.

Today only the latest run is live. Reopening any other parcel shows its kept result with **"Run again to restore the map overlays and horizon fan."**

**Page side** (`lib/client/useScreen.ts`, `components/Results/panel/ScreenIt.tsx`):
- **What's kept:** a small LRU map from each parcel's History key to `{ runId, view }`, holding at most 3.
- **What counts as use:** a finished run, a reopened parcel, a re-evaluation or a house re-assessment. The least recently used is evicted first.
- **Reopening a parcel still in the LRU** restores `view`, so its overlays, the ground viewer and pin re-evaluation work at once, with **no re-run and no network**.
- **An evicted parcel** shows the existing note, unchanged.
- **The boundary moved since its run** (split or edit): the session doesn't apply, as today (`stale`).

**Worker side** (`lib/screen/worker-protocol.ts`):
- **Today:** `outputs` is cleared on every run, which keeps one.
- **Change:** it keeps the runs the page holds. The page sends a new **`{ type: "release", id }`** when it evicts a session, and the worker drops that output. The worker also caps itself at 3, oldest first, as a safety net, so a missed release can't grow memory.
- `evaluateAt` and `setHouse` take the run's `id`, as they do now. Only the run they name changes.
- **Not touched:** the pipeline, the results, `lib/screen`'s math and the goldens.

This is the step's only change under `lib/screen/`. It's tested in Node (`worker-protocol.test.ts`):
- three runs, then `evaluateAt` on the first: answered;
- a release, then `evaluateAt`: "no longer available";
- a fourth run without a release: the oldest is dropped.

**Memory per session.** I'll measure the bytes of every typed array a session holds, on both reference parcels, in Node from the fixtures:
- **in the worker:** the fine and wide DEMs, slope, aspect, suitability surfaces, the horizon and the soil rasters;
- **on the page:** the `SessionView` copy.

The PR reports both per parcel, plus the total for 3. §7 Q3 asks what to do if the total is large.

## 2. The map panel (replaces "Map ▾")

- **A square icon button at the top of the right column,** styled like the column's others: the overlay legend button, My location, the zoom track.
  - It gets a distinct map icon (a folded map), not the stacked-layers icon the surface button uses.
  - `aria-label="Map layers"`, `aria-expanded`.
- **It opens a slide-over panel like Info:** the same frame, docked on the right on desktop and full height on phones, with a close × and Esc. From the top:
  1. **Basemap:** five **radio rows** (`role="radiogroup"`), labels as today.
  2. **Map layers:** Dim map, Parcel lines, Roads & labels (17d; unavailable on Topo and Streets) and Light pollution, as toggle rows. See §7 Q2.
  3. **The terrain group:** 3D terrain with its exaggeration, Hillshade and Contours. This is `TerrainControls`, unchanged.
- **One panel at a time:** opening the map panel closes Info, and the reverse (§7 Q4).
- **The ⓘ attribution** stays alone in the top-right corner. The "Map ▾" button beside it is removed.
- **Info › Layers keeps** its Roads & labels and terrain toggles. They share their state with this panel, as 17d's do.
- **The basemap stays in `useMapLayerPrefs` (17d).** `MapTools` keeps the effects that apply prefs to the map; its menu markup moves to `components/Map/MapPanel.tsx`.

## 3. The click-through bug, and its e2e

**Reported:** picking a basemap in the native dropdown also clicks the toggle beneath it. A native `<select>`'s popup closes on mouse-up, and the click lands on the button under the pointer.

**The radio rows of §2 remove the native select,** and so the bug.

**The e2e** (`e2e/map-panel.spec.ts`, with the HAR replay aborting tiles as usual) opens the panel and clicks each basemap row in turn, on desktop and at 390 × 844 with touch. After each, it asserts:
- that basemap is the checked radio and its layers are visible;
- 3D terrain, Hillshade, Contours, Dim map, Parcel lines, Roads & labels and Light pollution all keep the `aria-pressed` and prefs they started with.

## 4. The phone sheet with no results

**With a parcel open and nothing run yet,** the sheet shows **only its header**: the name and acres, then the **Screen it** button, **vertically centred** in the header. No divider and no empty body.

Once a run starts, the sheet is as today: the steps, then the report.

## 5. §7b acceptance lines (in `phase-0.md`)

**Replace** "tap-select" with: "tap-select; tapping another parcel switches at once, with a 'kept in History — Back' toast when the left parcel has a screen, and Back reopens it with its overlays live (one of the last 3 screened) or the re-run note (older); no switch while a screen runs ('Screening — finish or Cancel first.'); × and Esc deselect."

**Replace** the Map line's basemap clause with: "the map panel (the right column's map button): five basemaps as radio rows, with no click-through to the toggles; the map layers; the terrain group."

**Add** under Mobile: "with no results, the sheet is the header only, with the Screen button centred."

## 6. Files

- **Changed:**
  - `components/Explore/exploreState.ts` (`decideTap`) and its test;
  - `components/Explore/useExploreController.ts` (switching, the toast, Esc, no `nudge`);
  - `components/Map/Toolbar.tsx` (the nudge removed);
  - `lib/client/useScreen.ts` and `components/Results/panel/ScreenIt.tsx` (the session LRU);
  - `lib/screen/worker-protocol.ts` and its test (`release`, the cap);
  - `components/Map/MapTools.tsx`, `MapControls.tsx` and `InfoPanel.tsx` (the panel);
  - `components/Explore/ExploreShell.tsx` and `app/globals.css` (the × and the sheet's empty state);
  - `docs/plans/phase-0.md` (§7b).
- **New:**
  - `components/Map/MapPanel.tsx`;
  - `components/Explore/SwitchToast.tsx`;
  - `e2e/map-panel.spec.ts`;
  - `e2e/switching.spec.ts`: Ferney, then Macks, then Back. Ferney's overlays are live with no new requests, and Macks running blocks a switch.
- **Not changed:** the pipeline, report text, `UserConfig`, the goldens.

## 7. Answers (owner, 2026-10-08)

1. **Neither deselects.** A tap inside the open parcel or on empty map leaves it open. Deselect with ×, Esc, or by opening another parcel.
2. **Yes:** Dim map, Parcel lines, Roads & labels and Light pollution go between the basemap radios and the terrain group.
3. **Cap by size:** keep up to 3 sessions, and evict the least recently used while their total is above about **150 MB**. Never evict the current parcel's session. The PR reports the measured sizes.
4. **One panel at a time** (map or Info), on desktop and phone.
5. **Yes:** × shows the same "kept in History — Back" toast when the parcel had a screen.
