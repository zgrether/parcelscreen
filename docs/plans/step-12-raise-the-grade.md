# Step 12: Ways to raise the grade, and per-parcel adjustments

The owner pre-approved the brief and this plan's recommended answers (2026-10-22).

**Sources:**
- PLAN.md row 12;
- `docs/design/workflow-review.md`, "Ways to raise the grade" and "Per-parcel adjustments (owner decisions, 10/21)", which come from #252;
- `docs/plans/wf6-reroute.md`, WF6b's app side;
- `docs/plans/phase-0.md` §6 (WF6b paused 10/16).

**Decision:** §9.67, written in the docs PR.

**Mission mode:**
- The work runs on `step/12-raise-the-grade`, one PR per §11 row, each merged by me when CI is green on its head.
- The step ends with the hand-back to main, which Zach merges.

## 0. What's there today (found while planning)

- **The grade is computed at display time** by `reportCard(r, rubric, drawn, K, {at})` (`lib/report/card.ts`). It runs in two steps:
  - `cardFacts` builds the facts: gates, rows and cost.
  - `cardFor` turns them into the grade, verdict, lead and reason.
- **Every surface calls `reportCard` itself:** the card, the list and grid, Recent, Compare, Others, the export and the rubric preview. So whatever a person's adjustments change inside `reportCard` reaches all of them.
- **Each person's best homesite** is `rankSites`' first, which ranks by fewest fails, then site score. Any other site's card is `reportCard(…, {at: i})`.
- **No override, set-aside or adjustment code exists.** #128's WF4b design was never built:
  - it was one override per parcel for the whole household;
  - it barred touching a failed Must.

  The 10/21 decisions supersede it.
- **The engine half of the reroute is built and tested** (WF6a, #140): `reroute()`, the worker's `reroute` message, `ScreenInput.drivewayLine`, and the red-gate parity tests.
  - The page never calls it: `useScreen` has no `reroute`, and no run passes `drivewayLine`.
  - So a chosen route is still card-side only (WF5): the Driveway gates and row follow it, and the drives don't.
- **The live session** is the worker's in-memory run for the parcel, kept for the last 3 parcels opened (`SESSION_LIMIT`). It's gone after a reload.
- **Takes** are records in the shared `ps.household` doc (`{v:1, asks, takes}`). They sync through `sync_household (space, kind in ('ask','take'), key, record)`. RLS is enabled with no policies; only the server routes, holding the secret key, read or write it.
- **The septic gate never fails.** It warns when no soil on the parcel rates better than "very limited", and passes with a permit mark. A warn holds Contender only beyond `contenderMaxWarns` (1).
  - The interview's "Only an alternative septic system" walk-away chip records the person's refusal in `ps.interview`, not in the rubric.
- **Combining parcels exists:** the recipe model (`lib/geo/recipe.ts`) and the map's Edit parcels / combine mode. A combined boundary is a full re-grade.

## 1. The rules

- **Suggestions are display-time,** computed from the saved screen and the person's rubric. Only "Try it" runs anything, and nothing changes the grade until the person acts.
- **Adjustments are inputs to the person's grade, not to the screen.** The ScreenResult, schema v9 and `expected.json` are unchanged.
  - The one exception: Try it on a drawn line, which runs WF6a's existing engine path with `drivewayLine`.
  - Fixtures have no chosen line, so their `expected.json` and the determinism job stay byte-identical.
- **Personal:** a person's adjustments change only that person's grade.
  - Another member's grade, shown to you, uses that member's own adjustments, and is marked when it has any.
  - Your adjustments never reach their grade.
- **Additive storage:**
  - one new Supabase table (§4), created with RLS and no policies;
  - one optional field in `ps.household`;
  - one optional field in `ps.rubrics`.

  Nothing is dropped and nothing migrates. A saved list reads as before.

## 2. Ways to raise this grade (A)

**Where:** a section after the report card, before Still unknown (the design's order). It's titled **Ways to raise this grade**.
- At most three suggestions, then the neighbour button.
- On an A Contender, the section is hidden.
- With no suggestion and no button, it says "Nothing the app can try raises this grade."

**What counts:** a change is shown only if, for the current person, it raises the parcel's letter or its verdict (Not for us < Maybe < Contender), and lowers neither. Ties in the order below keep the order.

**Each line is cause and effect:**
1. what to do;
2. the rows that move, at most two;
3. the parcel's change;
4. the cost from step 10, where one applies.

For example: "Use your drawn track for access: Driveway D → B, parcel C → B · adds $18–31k to Ready to build".

**The changes, tried in this order (the first three that qualify are shown):**

### 2.1 A different homesite
- **Tried on:** every other ranked site, `reportCard(…, {at: i})`, under the person's rubric.
- **Shown:** the best one that raises the letter (the brief: letter only; a verdict-only gain doesn't count).
- **Wording:** "Build at site #3: Elevation B → A, Winter sun C → B, parcel C → B", plus the Ready to build change when it moves by more than $1k ("· Ready to build $5–9k less").
- **Action:** **Put the house here**, the existing house mark at that site. It runs the existing house move: from the live session if there is one, else a re-grade.

### 2.2 Your line as access (WF6b's app side)
- **Tried on:** each drawn track, existing drive or easement that isn't the parcel's chosen driveway.
- **The preview:** the card with that line chosen (WF5's card-side choice): the Access, Easement and Driveway gates and the Driveway row.
- **Shown:** when the preview raises the letter or verdict.
- **Wording:** "Use your drawn track for access: Driveway D → B, parcel C → B · adds $18–31k to Ready to build", with the cost of the route's pioneer track and the line's upgrade. The line's name replaces "your drawn track" when it has one.
- **The note under it:**
  - "Drive times aren't re-timed until you try it". The preview can't re-time drives; a reroute can.
  - Then which kind of run Try it will be: "Try it: quick, from this session" or "Try it: grades the parcel again (about a minute)".

**Try it:**
- **With a live session:** the worker's `reroute` (WF6a), from the session.
- **Without one:** a full run with `drivewayLine`.
- **Either way the result stays a suggestion.** The line shows the full effect, with the re-timed drives, under "Tried:". For example: "Tried: Driveway D → B, Town and groceries 22 → 18 min, parcel C → B".
- It offers **Use it** and **Discard**. Discarding leaves the parcel as it was.

**Use it:**
- sets the parcel's chosen driveway, `drivewayLine`, which already exists;
- saves the tried screen as the parcel's new screen. Screens are immutable, so this inserts a new one.

**From then on, every run passes the parcel's `drivewayLine`.** Re-grades keep timing drives from your route. This is WF6's intent, and a declared change for parcels that already have a WF5 choice: their next grade re-times the drives from the line.

**No new screen key.** The card tells that a screen's drives came from your route by comparing `driveFrom`'s start with your route's road end. WF6a guarantees every drive comes from it (§3, a test). WF6b's `keys.driveway` and export v6 aren't needed.

**WF6b's automatic reroute on every line edit stays out of this step** (§12 Q3). Try it is the trigger.

### 2.3 An alternative septic system
- **Tried when:** Septic is one of the person's Musts, and its gate warns because no soil on the parcel rates better than very limited. The brief's "failing on soil class" is this warn: the gate never fails.
- **Not tried when:** the person's interview has "Only an alternative septic system" among its walk-away chips. Their priorities don't allow it.
- **The preview:** the gate counted as a pass.
- **Wording:** "Plan on an alternative septic system: Septic ! → ✓, Maybe → Contender · septic $15–55k in Ready to build (Alternative)". The cost is the step 10 Alternative class range, from the person's `ps.costs`.
- **Action:** **Count it as passed.** This makes the adjustment §3 describes: an override of Septic to pass, with the reason prefilled "Planning on an alternative septic system", editable.

### 2.4 The parcel next door
- **Not a tried change:** its effect needs a full run, so it doesn't count toward the three, and it's never run automatically.
- **The button:** "Grade it with the parcel next door". It's shown under the suggestions when the parcel's state has county parcel lines (VA, NC, TN) and the grade isn't an A Contender.
- **It opens the map's combine mode** with this parcel selected, and a hint: "Tap the parcel next door, then Grade the combination".
- **The combination is graded as a new parcel** in History, named "{name} + next door". The original and its grade stay as they are (§12 Q5).

### 2.5 Set a row aside
- **Tried on:** each row and Must the person counts, one at a time, with that row set aside (§3).
- **Shown:** only when one set-aside alone moves the verdict or letter, as the brief's "the sole thing holding the verdict down". At most one is shown: the one with the biggest gain, verdict first, then letter, then points.
- **Wording:** "Set aside Night sky for this parcel: parcel C → B".
- **Action:** **Set it aside…**, which opens the adjust panel with the reason field focused.
- **Never suggested** (§12 Q4), though each can still be set aside by hand in its panel:
  - **Floodplain** and **Legal road access**: safety and legal access.
  - **Driveway on your land / Recorded easement:** legal access.
  - **Septic:** it has its own suggestion (§2.3), and a permit is a legal fact.
  - **Within budget:** money isn't a preference to drop on one parcel.

### 2.6 Tree clearing (12b, not built)
"Clear trees south of the house" waits for canopy heights from lidar first returns, which aren't confirmed yet. It isn't in this step.

## 3. Per-parcel adjustments (B)

**Kinds:**
- **Override:** a graded row is set to a letter (A–F), or a Must to passed or failed. A short reason is required, up to 200 characters.
- **Set aside:** a row or Must doesn't count for this parcel. A reason is required too (§12 Q2), because Full lists every adjustment with its reason.

**The record:**

```ts
interface Adjustment {
  key: string; // `${parcel}:${by}:${factor}`
  parcel: string;
  by: string; // the profile id
  factor: RowKey | GateKey | "budget";
  kind: "override" | "setAside";
  grade?: Letter; // a row's override
  status?: "pass" | "fail"; // a Must's override
  reason: string;
  was: string; // the app's letter or status when it was made
  at: number;
}
```

There's one adjustment per factor per parcel per person. A new one replaces the old.

**The grade:** `reportCard` gains `opts.adjust` (the person's adjustments for this parcel), applied between `cardFacts` and `cardFor`.
- **An overridden row** grades with its new letter, and keeps `adjusted: {was, reason}`.
- **An overridden Must:**
  - a gate takes the new status;
  - a threshold Must's `thresholdStatus` is replaced.
- **A set-aside row** is left out of the grade as a Don't care is, and stays on the card in its tier, reading "set aside for this parcel".
- **A set-aside Must** is left out of the Musts and the verdict, and stays listed in Must have as "set aside for this parcel".
- **After a re-grade:** when the app's own value has changed since the adjustment was made, the row adds "app now says B". The adjustment stays.

**The card:**
- **An overridden row** reads ~~D~~ **B** with the reason under it in quotes, and a small ✎ on the row.
- **An overridden Must** reads ~~!~~ **✓**.
- **A set-aside row** is greyed: "set aside for this parcel", with the reason.

**The answer line:** after the existing text, a set-aside Must is named: "You set aside a must-have: Elevation." Two or more read "You set aside 2 must-haves: Elevation, Night sky."

**The panel ("Adjust for this parcel"):** a new section in each row's slide-in panel, after the reading and before "How it's scored".
- **A graded row:** "Override the grade" (A–F chips) or "Set aside for this parcel".
- **A Must:** "Count it as passed", "Count it as failed" (offered when it passes), or "Set aside for this parcel".
- **The reason field** is required to save.
- **An existing adjustment** shows instead, with **Remove adjustment**. Removing shows a toast with Undo, as History's ✕ does.

**Where it's marked:** a small ✎ beside the grade, titled "Adjusted for this parcel", on:
- the grid and the phone cards;
- the phone strip, on the adjusted factor's letter;
- Recent;
- Compare's grade row;
- One page's grade.

Full gains a section, **Your adjustments**: each one with its factor, what it was, what it is, its reason and its date, for every person with any.

**Sync (§4):** like takes, in the shared space, with the profile id in each record. Every device sees every member's adjustments, so a member's grade is computed with that member's own adjustments.

**The learning nudge:**
- **When:** the same factor is set aside on 3 or more parcels by the person (counting parcels still in Favorites or History).
- **Where:** What matters offers it once: "You've set aside Night sky on 3 parcels. Move it down a tier?"
- **Buttons:** **Move it down** and **No thanks**.
- **Moving down:** Must → the top of Really want; Really want → the top of Nice to have; Nice to have → Don't care. It comes with Undo.
- **Stored:** the offer is kept per factor in `ps.rubrics.nudged` (optional): "offered", "moved" or "declined". A factor is offered only once.

## 4. Sync and storage

**Client:** `ps.household` gains `adjusts: Adjustment[]`, optional (absent reads as []). `withAdjust` and `withoutAdjust` sit beside `withTake`.

**Wire:** `HouseholdSave.kind` gains "adjust", and `Changes.household` carries them.

**Server:** a new table, so `sync_household`'s check constraint isn't altered. Altering it is a drop and recreate, and migrations are additive only.

```sql
create table public.sync_adjustments (
  space uuid not null references public.sync_spaces on delete cascade,
  key text not null,
  record jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (space, key)
);
alter table public.sync_adjustments enable row level security; -- no policies (step 5 §4)
create index sync_adjustments_changes on public.sync_adjustments (space, updated_at);
create trigger sync_adjustments_stamp before update on public.sync_adjustments for each row execute function public.sync_stamp();
```

The route sends `kind: "adjust"` saves there, and the changes query reads both tables.

**Checks, recorded in the sync PR:**
- the migration is applied through the Supabase connector to `parcelscreen` only;
- an anonymous read with the publishable key returns nothing, and an anonymous insert is refused;
- `get_advisors` shows no new security warning.

**The export file:** `ps.household` is already in it, and the optional `adjusts` is additive, so the export version doesn't change.

## 5. Where it shows

| Surface | Suggestions | Adjustments |
|---|---|---|
| The grade panel (desktop and phone sheet) | the section after the card | rows and Musts as above; the answer line's clause |
| Row panel | – | Adjust for this parcel |
| Favorites grid and phone cards, Recent | – | ✎ on the grade; adjusted cells marked |
| Compare | – | ✎ on the grade |
| One page | the top suggestion, one line (the design's "top ways to raise the grade") | ✎ on each person's grade |
| Full | Ways to raise this grade | Your adjustments |
| What matters | – | the nudge |

## 6. UX

- **The main flows:**
  - **Raise the grade:** read the suggestion, then tap its action: Put the house here, Try it → Use it, Count it as passed, or Set it aside…. That's one or two taps, plus a reason where one's needed.
  - **Adjust a row:** tap the row, then Adjust for this parcel, pick a letter or Set aside, type a reason, and Save. That's four taps and a few words.
- **What's seen first:** the grade and answer line, the card, then the suggestions. The cost and the "not re-timed" note come under each suggestion.
- **States:**
  - **No suggestions:** "Nothing the app can try raises this grade."
  - **While Try it runs:** the button reads "Trying…", with the step line the run already shows.
  - **Try it fails:** "Couldn't try it: {reason}. Try again", with the parcel unchanged.
  - **A slow full run:** the existing progress.
  - **An adjustment won't save** (sync): the existing "Not saved — Try again".
- **Plain words:** "Set aside for this parcel", "Override the grade", "Count it as passed", "Use it", "Discard"; no "adjustment" in buttons.
- **At 375 px:** suggestions stack, and their actions are full-width 44 px buttons. The letter chips are 44 px. The reason field is one line that grows.
- **Contrast:** the struck-through letter is in the muted ink at ≥ 4.5:1, and the ✎ mark is text, not color alone.

## 7. Settings and storage

| Key | Change |
|---|---|
| `ps.household` | gains optional `adjusts` |
| `ps.rubrics` | gains optional `nudged` |
| Supabase | `sync_adjustments`, new, with RLS and no policies |

No settings are added.

## 8. Strings (declared; rule 7, additive)

**New strings only.** Existing card, answer and report text is unchanged, except where an adjustment exists, and then text is appended or replaced only in that row.

- **The section title:** "Ways to raise this grade". Its empty line: "Nothing the app can try raises this grade."
- **The suggestions:**
  - "Build at site #{n}: {rows}, parcel {a} → {b}"
  - "Use {your drawn track | your existing drive | your recorded easement | {name}} for access: …"
  - "Plan on an alternative septic system: …"
  - "Set aside {factor} for this parcel: parcel {a} → {b}"
- **The rows that move:** "{factor} {a} → {b}". A Must reads "{factor} ! → ✓". The verdict reads "Maybe → Contender".
- **Costs:**
  - "adds ${a}–{b}k to Ready to build"
  - "Ready to build ${a}–{b}k less"
  - "septic ${a}–{b}k in Ready to build (Alternative)"
- **Try it:**
  - the note: "Drive times aren't re-timed until you try it."
  - the button's run: "Try it: quick, from this session" / "Try it: grades the parcel again (about a minute)"
  - "Trying…", "Tried: …", "Use it", "Discard", "Couldn't try it: {reason}. Try again"
- **The neighbour:** "Grade it with the parcel next door"; the map hint "Tap the parcel next door, then Grade the combination"; the new parcel's name "{name} + next door".
- **The actions:** "Put the house here", "Count it as passed", "Set it aside…"
- **The panel:**
  - "Adjust for this parcel", "Override the grade", "Count it as passed", "Count it as failed", "Set aside for this parcel"
  - the reason field's label "Why? (required)"
  - "Save", "Remove adjustment", "Adjustment removed" + "Undo"
- **The card:**
  - "set aside for this parcel"
  - the reason in quotes
  - "app now says {x}"
  - the mark's title "Adjusted for this parcel"
- **The answer line (appended):** "You set aside a must-have: {factor}." / "You set aside {n} must-haves: {factors}."
- **Full:** the section "Your adjustments", with lines like "{who}: {factor}, {was} → {now} ({set aside}), "{reason}", {date}".
- **The nudge:** "You've set aside {factor} on {n} parcels. Move it down a tier?", "Move it down", "No thanks", "Moved {factor} to {tier}." + "Undo".
- **Full's header comment and its test:** "Nothing here for ways to raise the grade (step 12)" is superseded. The test's absence check becomes a presence check.

**Numbers:**
- No threshold, weight or unit cost changes.
- `expected.json` doesn't change.
- Try it's runs reuse WF6a's engine path, whose parity tests already hold.

## 9. Stop conditions

- `expected.json`, or any existing verdict or flag text, changing beyond §8;
- a migration that would need to drop, rename or retype anything;
- the anonymous check reading or writing the new table;
- Mud Creek's red-gate line not raising the letter or verdict in the preview, so the e2e has no suggestion to try: I'll stop and ask before changing the test's premise;
- the same CI failure surviving 3 attempts;
- a product question this plan doesn't answer.

## 10. Test plan outline

**Unit:**
- **The filter:** a change that raises the letter is shown, one that raises only the points isn't, and one that raises the verdict but lowers the letter isn't. At most three are shown, in the order of §2.
- **The homesite suggestion:** a synthetic card where site #3's elevation lifts the letter is shown, and one that only matches it isn't.
- **The septic suggestion:**
  - a warned Must with two other warns is shown;
  - with "Only an alternative septic system" walked away from, it isn't;
  - with Septic in Don't care, it isn't.
- **The set-aside suggestion:**
  - the only row holding Maybe is shown;
  - Floodplain, Legal road access, the easement, Septic and Within budget never are;
  - only one is shown.
- **The recomputation:**
  - an override lifts the grade by the right points;
  - a Must overridden to pass clears a Pass verdict;
  - a set-aside row leaves the weights renormalised;
  - a set-aside Must leaves the verdict and the answer clause;
  - another member's grade ignores yours and uses theirs;
  - "app now says".
- **The nudge:** counts per person and factor over parcels still kept, offers at 3, never twice, and Move it down / Undo.
- **Sync:** the adjust record round-trips through wire, store and merge, and the household doc without `adjusts` reads as before.

**e2e:**
- **Try it on Mud Creek's red-gate line:** the suggestion is shown, then Try it → Tried with re-timed drives → Use it → the new screen and the chosen driveway. Discard leaves it unchanged.
- **Adjust a row:** override with a reason → the card, the grid mark and Full; Remove with Undo.
- **Set aside a Must:** the answer line's clause.
- **The nudge:** three set-asides → the offer → Move it down → Undo.
- **Grade it with the parcel next door:** the combine mode opens with the hint.

**Screenshots, at 1280 and 375:**
- suggestions on Mud Creek and on Macks;
- the adjust panel;
- an overridden row;
- a set-aside Must in the answer line;
- the grid mark;
- the nudge.

**The fresh-eyes review** before the hand-back. Its unfixed findings go to `polish.md`.

**Hand-back test plan:** about 25 minutes on the preview, desktop then phone, on Mud Creek, Macks, Ferney and Roan.

## 11. PRs, into `step/12-raise-the-grade`

| PR | What |
|---|---|
| 0 | This plan |
| 1 | Adjustments in the grade: the type, `reportCard`'s `opts.adjust`, the card's struck-through rows and set-asides, the answer clause, and the unit tests. Read from `ps.household.adjusts` (local only). |
| 2 | The adjust panel: Adjust for this parcel, Remove and Undo. |
| 3 | Sync: `sync_adjustments` (the migration, the anonymous check, advisors), wire, server, merge. |
| 4 | The marks: grid, phone strip, Recent, Compare, One page, and Full's Your adjustments. |
| 5 | The nudge. |
| 6 | Suggestions, display-time: the section, the filter, homesite, septic, set-aside. |
| 7 | Your line as access: `useScreen.reroute`, `drivewayLine` on runs, Try it / Use it / Discard, the red-gate e2e. |
| 8 | The parcel next door. |
| 9 | The fresh-eyes fixes and the docs: §9.67, PLAN row 12, REQUIREMENTS, CLAUDE.md if needed, polish.md. |

Then the hand-back from `step/12-raise-the-grade` to main.

## 12. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Personal or household?** Personal, per #252. A member's grade uses only their own adjustments; they sync in the shared space so each device can compute each member's grade.
2. **A reason for set-asides too?** Yes, required, so Full's list has a reason for every adjustment, as the brief says.
3. **WF6b's automatic reroute on every line edit?** Not in this step. Try it is the trigger, and Use it saves the screen. WF6b's export v6 and `keys.driveway` aren't needed, because the card reads the drive start (§2.2). The automatic reroute can follow if wanted.
4. **Which Musts are never suggested for setting aside?** Floodplain, Legal road access, and Driveway on your land / Recorded easement, for safety and legal access. Also Septic (its own suggestion) and Within budget. All can still be set aside by hand.
5. **The parcel next door: change this parcel or make a new one?** A new parcel in History, "{name} + next door", so this parcel's grade and screens stay.
6. **Septic's "failing":** the gate's warn ("no soil better than very limited"), since it never fails. Not offered when the person walked away from "Only an alternative septic system".
7. **Storage:** a new table `sync_adjustments` rather than widening `sync_household`'s check (§4), and optional fields in `ps.household` and `ps.rubrics`. No version bump and no clean break, because nothing existing changes shape.
8. **One page:** the top suggestion only, one line. Full lists all three and every adjustment.

## 13. Decision

phase-0.md §9.67, written in PR 9.
