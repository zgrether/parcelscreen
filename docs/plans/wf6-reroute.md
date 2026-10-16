# WF6: the driveway re-run from the live session

Approved (owner, 2026-10-15), with the owner's additions folded in below. Spec: `docs/plans/parcel-workflow.md` §3.5.
When a drawn line changes, only the driveway is re-routed, from what the parcel's live worker session already holds,
instead of a full re-screen. With a line chosen as the driveway (WF5), the drives are timed from where that route
meets the road, and the route gets its own pioneer-track estimate.

## 1. Two PRs

- **WF6a, the engine and the worker:** `reroute()` in `lib/screen/index.ts`, the `reroute` worker message,
  `ScreenInput.drivewayLine`, the parity tests (§6), and the before/after table (§5): the engine is where the numbers
  change. No UI change, no report text.
- **WF6b, the page:**
  - the automatic reroute;
  - the saved screen's driveway key;
  - the card header's two lines and the banner's "Score it as the driveway" (rule 7, §7);
  - export version 6;
  - §9's entry (§7).

## 2. What a reroute does

`reroute(run, lines, drivewayLine)` takes a finished full run (its result and its session) and gives what a full run
would with those lines and that choice. The run time aside, the result is byte-identical to the full run's.

- **The session keeps the result as it stood after the rank step** (`s.ranked`, new). Rank doesn't read lines, and
  neither does any step before it except terrain's line grid and line measurements. So nothing before the driveway step
  runs again.
- **What the lines touch is rebuilt:** the line grid (`drawn`), the router's own land (`routeInside`), the soil, bedrock
  and wet-soil masks built on it, and `result.lines`. Flow accumulation and the flood grid don't depend on the lines,
  and stay.
- **The driveway step runs again from `s.ranked`.** It's the same function as a full run's: the step's body moves into
  a function both call.
- **The drive step runs again only when the drive start moved.** That's the only part of a reroute that touches the
  network: OSRM's table (or its per-destination fallback), the route out, and Overpass for trailhead parking.
  - When the start is unchanged, the drives, the closer grocery, the trailheads' drives, `driveFrom`'s snap and track
    miles, and the drive step's `noResponse` entries are carried over from the run.
  - Nothing else in a reroute makes a request. Tests count the requests: none when the start is unchanged (§6.5), and
    only OSRM and Overpass when it moves (§6.7), on recorded traffic (`pnpm record:port` records the red gate's start
    into Mud Creek's `network-port.har`).
- **Failures are handled as a full run handles them,** because it's the same step code. If OSRM or Overpass doesn't
  answer:
  - Trails is marked incomplete and the verdict is held at Maybe or below (follow-up 53);
  - `noResponse` gets the same entries;
  - `failed` lists `drive` if the step itself fails.
  - When only Overpass's parking lookup fails, the drives still run, timed to the trailhead points instead of their
    parking: `noResponse` gets `TRAILHEAD_PARKING`, Trails isn't marked incomplete, and the Trails row's detail gains
    "; timed to the trailhead, not its parking (the parking lookup didn't answer)" (#140 review). Before WF6a this was
    silent on the card. The note is appended (rule 7), and is the same in a reroute and a full run (a test).
- **The flags:** the driveway and drive steps' flags, and their `failed` and `noResponse` entries, are replaced. The
  others are kept in order. The verdict is recomputed from the flags, and the house's "No house site" rewrite is
  applied again, as at the end of `screen()`.

## 3. The choice as an input: `ScreenInput.drivewayLine`

The id of the drawn line whose route the household chose (WF5), or null.

- **What follows your route:**
  - **The drive start** (`driveFrom`, `drives`, `closerGrocery`, the trailheads' drives): from your route's road end,
    the far end of your line.
  - **Your route's pioneer-track estimate** (`track` on its route): `trackCost`, the same function and the same rates
    as the app's route.
  - **The card's driveway score:** the gates, the driveway scale and the Driveway section, as in WF5.
- **What follows the app's pick:**
  - the engine's driveway fields: `routes[0]` and `overLimit` as the scored route, `steepLanding`, `practical`, the
    note and `direct`;
  - the sites' and the house's driveway costs, and their ranking;
  - the engine's flags, and so `verdict`.
- **No field uses the other start.** A test asserts that, with a choice, every drive and `driveFrom` comes from your
  route's road end, and every engine driveway field equals the no-choice run's.
- **When the chosen line has no route in this run,** the choice does nothing to the engine: the result equals the
  no-choice run's, and the card says so (WF5's note).

**Pioneer track on your route.** The estimate prices only the route's new section, from your line's end to the site.
The line itself keeps #116's pricing as an existing drive to upgrade (`dw.upgradeStoneIn`, 3 in of stone), and no
pioneer track is shown over it.
- That's whatever the line's kind: the screen reads every line a route starts from as an existing drive (an existing
  drive reaches it as a track).
- So a chosen Existing drive keeps its upgrade pricing for the line, and gets a pioneer-track estimate only for any new
  section beyond it. When your route starts at the line's end and adds nothing new, there's no track row.

**Recorded with the screen.** The result's schema is frozen (v7), so the input is recorded in the saved screen's keys:
`keys.driveway`, the chosen line's id and a content hash of its `drawnInput` (id, kind, geometry and width). "" means
no choice.
- With `keys.lines` (the hash of every line) and the parcel's inputs, a saved screen is reproducible from its own record.
- The card reads `keys.driveway` to tell whether a screen's drives were timed from your route.
- The export file goes to version 6: each screen record's keys gain `driveway`, and a converter gives older records "".

## 4. Triggers (WF6b)

A reroute runs on its own when the parcel's live session is this parcel's run, and its boundary, house and settings
keys still match, and either key below changes:

- **`keys.lines`** (the hash of `drawnInput`): a line drawn, redrawn or deleted; its kind changed between line-kinds
  the router tells apart (Track or Existing drive ↔ Easement; an Existing drive reaches the screen as a track, so
  Track ↔ Existing drive changes nothing); an easement's width changed, since its corridor counts as the parcel's land.
- **`keys.driveway`**: the choice made or cleared, or the chosen line's content changed. When only the choice changed,
  the driveway step's output is the same and only the drive step can differ.

**Name, note, condition, a track's or a drive's width, and "Recorded in" don't reroute; they only re-render.**
- A name and "Recorded in" feed only the card's sentences.
- The condition and a track's or drive's width feed nothing yet: WF7 prices them.

Points and areas never reach the screen.

Without a live session (after a reload, more than `SESSION_LIMIT` (3) parcels opened since, or a worker restart),
today's banner shows (§7).

## 5. Numbers (WF6b's PR)

A reroute with a choice re-times the drives, so the Town and Trails minutes, their grades, and possibly the parcel's
grade and verdict can change. WF6a's PR has a before/after table, and WF6b's repeats it:
- the Town minutes, the Trails minutes, both rows' grades, the parcel grade and the verdict, for Zach and for Julie;
- for Mud Creek with the red-gate line chosen.

It's live: the recordings hold only the app's pick's drives. No other fixture has a line that moves the drive start.

No-choice runs stay byte-identical to `expected.json`. CI's `expected` and determinism jobs guard that; the PR
confirms they ran.

## 6. Parity tests (CI, all three fixtures)

A moved house is not a full run with that house: the prototype's setHouse re-evaluates the sun, the sky and the
driveway at the house, which is why the fixtures keep `setHouse` and `houseRun` apart. So a reroute is checked against
the operations the app actually performs. Written F(lines, choice) for a full run, H(h) for moving the house, and
R(lines, choice) for a reroute:

1. **R(L1) after F(L0) = F(L1)**, with Mud Creek's red-gate line, carried on to the boundary, on all three.
2. **Reroute, then move the house:** H(h) after R(L1) after F(L0) = H(h) after F(L1).
3. **Move the house, then reroute:** R(L1) after H(h) after F(L0) = H(h) after F(L1). The worker keeps the house moves
   made since the run, and re-applies them after the reroute.
4. **Delete the chosen line:** R([], null) after F(L1, red-gate) = F([], null), which equals `expected.json`'s run.
5. **A change that doesn't move the drive start** (Ferney's track moved a few metres, the app's pick unchanged): the
   drive step is skipped (no OSRM or Overpass request), and the result = F(L2).
6. **Two edits in quick succession,** through the worker: the first reroute is cancelled, and only the second's result
   is posted. On the page, only that one is saved.
7. **With a choice:** R(L1, red-gate) = F(L1, red-gate); every drive comes from the red-gate road end; every engine
   driveway field equals F(L1, null)'s.

**What differs between "move the house after a full run" and "a full run with that house"** (#140 review; measured
on each fixture with its own house; H(h) after F([]) on the left, F([], house h) on the right). Not fixed here:
follow-up 58.

- **The sky, Ferney Creek:** a full run with a house reads the sky at the house, and rank scores every site with that
  sky score; a move keeps the score read at site #1. So `sites[].q.sky` is 67 vs 57 on all five sites, and their
  `quality` and `score` differ by 1 or 2; the house's too (sky 67 vs 57, quality 70 vs 69, score 68 vs 67). On Macks
  and Grayson site #1's sky and the house's sky score are the same, so nothing follows.
- **The house's rounding, Macks and Grayson:** `setHouse` rounds the house to 6 decimals; a full run uses the input as
  given. So `focus.ll`, `point.ll` and `house.ll` differ by under 5e-7°, the sun's `noonAlt` and `noonClearance` and
  the sky's `coreAlt` and `coreClear` by under 5e-7°, and `house.roadGrade` and `house.roadRunFt` slightly (0.001
  points and 0.02 ft on Macks; 0.0004 and 0.02 ft on Grayson). Ferney's house is already at 6 decimals.
- **Site #1's `why`, Macks and Grayson:** a full run with a house appends site #1's routed-driveway line after the
  others (A3b's rewrite runs only without a house); a move rewrites it in place. 4 lines vs 5.
- **`driveFrom.kept`, all three:** true after a move (the drives were kept from the run), false in a full run.

That's why the parity tests compare a reroute with the operations the app performs, and keep `setHouse` and
`houseRun` apart.

## 7. Report and card text (rule 7, approved)

1. **The card header, while it works:** "Rerouting the driveway…".
2. **After a reroute that found a route from the line just drawn or changed:** "{line} has a route of its own now.",
   with **Score it as the driveway**. It goes away once scored, or when another line is drawn.
3. **Without a live session,** today's banner stays as it is, and gains **Score it as the driveway**: one full run with
   `drivewayLine` set to that line, not a run followed by a second step.
4. **Consequences, not rewords (phase-0.md §9):**
   - With your route chosen and re-timed, the Town and Trails note "Drive times start where the app's pick meets the
     road." stops appearing, because its condition is gone.
   - Getting There's existing start sentence names your route's road end.
   - The Driveway section's pioneer-track rows describe your route.

**WF5-era screens** (saved with a card-side choice, before `drivewayLine` existed) timed their drives from the app's
pick. Their `keys.driveway` is "".
- On open, they keep showing "Drive times start where the app's pick meets the road."
- There's no conversion, and no re-screen prompt beyond what exists today. When a live session is next run, the reroute
  re-times them.
- §9 says so.

## 8. The screen list

A moved house keeps every screen: each one is a new record, appended to the parcel's `screenIds`. A reroute does the
same: each is kept as a new screen with the keys it was run with. Superseded reroutes (§6.6) are never saved.

**Follow-up for Phase 1:** a parcel's screen list grows with every house move and reroute. Whether Phase 1 keeps every
screen, the last per key, or a capped history is its question (`screens` rows are immutable; REQUIREMENTS §3).

## 9. Files

- `lib/screen/index.ts`: the driveway and drive steps as functions; `s.ranked`; `reroute()`; `drivewayLine`.
- `lib/screen/drive.ts`: `driveStart` with the chosen line.
- `lib/screen/worker-protocol.ts`: `reroute`, its cancellation, and the house moves re-applied after it.
- `lib/screen/types.ts`: `ScreenInput.drivewayLine` (input only; the result's schema is unchanged).
- `lib/client/useScreen.ts`, `lib/client/screenKeys.ts`, `lib/client/screenStore.ts`, `lib/client/exportFile.ts`.
- `components/Results/panel/ScreenIt.tsx` and `components/Results/card/ReportCard.tsx`: the automatic reroute, the
  header lines, the banner's button.
- `lib/report/card.ts` and `lib/report/driveway.ts`: the drive-times note read from `keys.driveway`, and your route's
  pioneer track. In WF6a, `card.ts`'s Trails row says when the parking lookup didn't answer (§2).
- Tests: `lib/screen/reroute.test.ts` (new; §6.1–5, 7), `lib/screen/worker-protocol.test.ts` (§6.3, 6), and the client
  and e2e tests for the triggers and the header.
