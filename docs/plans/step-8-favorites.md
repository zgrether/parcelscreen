# Step 8: Favorites

Written 2026-10-20 under mission mode (`CLAUDE.md`) from Zach's brief, which he pre-approved along with this plan's
recommended answers (§11). It runs straight through on `step/8-favorites`: this plan is PR 0 into the step branch, and
Zach reviews it together with the hand-back. The stop conditions are §12's. Sources: `docs/design/workflow-review.md`
"History, favorites and the report card" and PLAN.md row 8, adjusted for step 6's shared list.

**The goal:** History keeps everything you graded, for you alone; Favorites holds what you star, for the household.

Done when:
- **Favorites** is the household's shared list as Your list is today, with the same behaviour: My order, the filters
  and sorts, Compare, Walked and Offered, Archived with a reason, asks and takes, Both like it.
- **History** is personal: every parcel the current person graded, newest first, following them across their devices
  and never shown to another member. Unstarred entries can be cleared, all at once (one confirm) or one at a time (✕).
- **A star** on the results panel and on each History row. Starring asks for a plain name, prefilled, and adds the
  parcel to Favorites ("Added by Zach").
- **Unstarring** asks once. For the adder the parcel goes back to their History; for the others it's gone, with its asks
  and takes.
- **"In progress" is gone:** a parcel is a favorite (active) or Archived, or it's in someone's History.
- **Your list** opens on a switch, **Favorites | History**, Favorites first. The badge stays on the tab.
- **The map's Search** finds your Favorites and your History by name or parcel number, above the place results.
- **Nothing is wiped:** Saved parcels become favorites, Archived stays Archived, and In progress parcels go to their
  adder's History, by a small one-time sort on first load.
- **Grading** adds a parcel to your History only, never to Favorites until starred.

## 0. What's there today (found while planning)

- **One shared store** (step 6): `ps.parcels` under `_space` holds every built parcel (`built`) and the device's open
  one. A parcel is *built* once anything changes it (a run, a note, a line, a status), and stays until Remove. Each has
  `addedBy` (step 6) and a status, `inProgress` (the default), `saved` or `archived` (WF2), with Walked and Offered
  beside it.
- **Your list** shows the built parcels: status filters default to In progress and Saved, and Archived shows by filter.
  The status controls (In progress, Saved, Archive…) are on the parcel's detail and in the map's Info panel
  (ParcelStanding).
- **Profiles' own documents** sync with the profile record (`lib/sync/records.ts` SYNCED_DOCS: settings, priorities,
  answers). The shared store syncs by record (`sync_parcels`, `profile = "_space"`).
- **The map** draws every built parcel's outline, and its Search already lists "Saved parcels" by name (all built
  ones).
- **Removing** a parcel drops its asks and takes (`householdDoc.ts` `dropParcel`).

## 1. The model

- **A favorite** is a shared parcel whose status is `saved` (active) or `archived`. The stored values stay as they are
  (no converter, CLAUDE.md): `saved` reads as a favorite, and `inProgress` now means "in History only, not a favorite".
  "In progress" and "Saved" leave the UI.
- **History** is a view, per person, over the same shared store:
  - the parcels that aren't favorites and were added by me (`addedBy`: I built them, by grading or by changing them;
    §11 Q3);
  - the favorites I graded, shown starred.

  A parcel that isn't a favorite and was added by someone else is in no view of mine: not in my History, not in
  Favorites, not on my map, not in my Search.
- **My History log,** a new profile document `ps.history`: `{ key, at }` per parcel, when I last graded it. It orders
  History (newest first; a parcel without an entry uses when it last changed) and records which favorites I graded. It
  syncs with my profile record (SYNCED_DOCS gains it), so it follows me across devices; no new table and no server
  change.
- **Grading** a parcel (a finished run kept) writes my log entry. It never stars.

## 2. Starring and unstarring

- **Star** (results panel and History rows): a small sheet, **Add to Favorites**, with **Name** prefilled (§11 Q15) and
  **Add**. It sets the name, makes the parcel a favorite (`saved`), and keeps its `addedBy` (the person starring is its
  adder: only their History shows an unstarred parcel). A parcel not yet built (a plain tap, no run) is built first.
- **Unstar:** "Remove from your household's favorites? It stays in your History." with **Remove from favorites** and
  **Keep**.
  - For the adder, it goes back to their History.
  - When someone else unstars, the confirm says "It goes back to Zach's History." (§11 Q6).
  - Its asks and takes are dropped, as Remove drops them. Walked and Offered stay on the parcel.
- **Archived** stays a favorite's state, with its reason and Restore (which now returns to a favorite).
- **Remove** (in a favorite's detail) still deletes it for everyone, as today.

## 3. History

- **Rows,** newest first:
  - the name, its acres, and when it was graded ("Graded Oct 20"; "Changed Oct 20" without a run);
  - your grade's chip;
  - the star;
  - **Open on the map**;
  - ✕ on an unstarred row.
- **✕** removes that parcel for good (it's yours alone), with **Undo** for a few seconds (§11 Q8).
- **Clear history** (shown when there's an unstarred row): "Clear your history? Your favorites stay." with **Clear** and
  **Keep**. It deletes every unstarred parcel in your History, and their kept screens. Favorites stay, in Favorites and
  starred in History.
- **Empty:** "Nothing here yet. Parcels you grade show up here; star one to add it to your household's favorites."

## 4. Favorites

- Today's list, limited to favorites. Its status filter becomes **Archived** alone: active favorites by default, and
  Archived when it's on. The household's verdict filter and every sort stay as they are.
- Each row has its star (filled): unstarring from here asks as in §2.
- **Empty:** "No favorites yet. Star a parcel on the map, or in History, to add it here."
- Waiting for you and Both like it count favorites only (§11 Q7).

## 5. The tab, the map and Search

- **Your list** keeps its name and its badge (§11 Q9). The page opens on **Favorites | History** (a segmented switch,
  44 px), Favorites first; the choice is remembered per profile (`ps.library`).
- **The results panel** has the star beside the grade in the header (the desktop panel, and the phone's peek): filled
  for a favorite.
- **The map** draws favorites and your History only.
- **Search** lists **Favorites** and **Your history** (by name, or by any piece's parcel number, ignoring spaces and
  dashes) above the place results, up to five each.

## 6. The one-time sort (no data wipe)

On first load of this release, once per device and idempotent:
- `saved` parcels are favorites already, and `archived` ones stay Archived (favorites), so nothing changes for them;
- `inProgress` parcels go to their adder's History: one with no `addedBy` gets the current profile.

The sort is a fill-in of `addedBy`, written once to the shared store. Asks and takes on parcels that go to History are
kept but not shown or counted (§11 Q7). If the sort needs a real converter after all, that's a stop (§12).

## 7. Sync, storage and export

- `ps.history` is a profile document, added to SYNCED_DOCS: profile records carry it, so no server change.
- The parcel store keeps `v: 2` (no field added or changed). The export file stays version 6; History logs aren't
  exported (§11 Q18).

## 8. Text (new UI strings only)

No report or verdict text changes, and no `expected.json` change.
- **The switch and its views:** "Favorites", "History", "Your history"; the two empty lines (§3, §4); "Graded {date}",
  "Changed {date}".
- **The star:**
  - "Add to Favorites", "Name", "Add", "Cancel";
  - the star's labels: "Add to favorites", "In favorites";
  - "Remove from your household's favorites? It stays in your History." / "… It goes back to {name}'s History.",
    "Remove from favorites", "Keep".
- **Clearing:** "Clear history", "Clear your history? Your favorites stay.", "Clear", "Remove from History", "Removed.
  Undo".
- **Search:** the groups "Favorites" and "Your history".
- **The name's prefill:** "{acres} ac on {road}, {county}" and "{acres} ac in {county}".
- **Gone:** "In progress" and "Saved", as status words and filter chips.

## 9. UX

- **The main flows, in the fewest steps:**
  - **Grade** a parcel: it's in History.
  - **Star** it: the name (prefilled) → **Add**. It's in Favorites for everyone.
  - **Unstar:** one confirm.
  - **Clear history:** one confirm.
  - **Find** a saved parcel: type its name or number in Search.
- **What you see first:** Favorites (the household's list), then History a tap away; on the panel, the star beside the
  grade.
- **States:**
  - **empty:** the lines in §3 and §4;
  - **loading:** today's list states;
  - **not yet graded:** a starred parcel with no run shows "Not screened yet" as today;
  - **errors:** a save that fails is step 5's "Not saved — Try again";
  - **the name sheet:** **Add** is disabled with an empty name.
- **Plain labels:** Favorites, History, Your history, Add to Favorites, Remove from favorites, Clear history, Remove
  from History.
- **Phone at 375 px:** the switch is full-width, two segments of at least 44 px. History rows are cards with the star
  and ✕ as 44 px buttons; the name sheet and the confirms are bottom sheets; the star sits in the peek's header.
- **Contrast and consistency:** the star uses the app's ink and its warning amber for filled, with AA contrast. The
  switch reuses the chip style. The confirms reuse ResetConfirm's.

## 10. Screenshots and the fresh-eyes review

At 1280 and 375:
- Favorites;
- History;
- the star and its name sheet;
- unstarring;
- Clear history;
- Search showing saved parcels;
- the phone's tab.

They go on `pr-assets/step-8`. Then a subagent that hasn't seen the code gets only those and "You've never used this
app. What is this page for, and what's confusing?"; every finding goes in the hand-back with what was done.

## 11. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Where History lives:** the shared store, with History a per-person view and a per-profile synced log (recommended:
   no new table and no sync change). A member's unstarred parcels are in the space's data but in none of the others'
   views. Storing them per profile instead would need per-profile parcel rows in sync: later, if wanted.
2. **The status values:** stored as they are (`saved` = favorite, `inProgress` = History only), with new labels
   (recommended: no converter).
3. **What enters History:** parcels you graded, and parcels you built without grading (a drawn boundary, a note), so
   nothing you made goes missing (recommended).
4. **History's order:** newest first, by when you last graded it, else when it last changed (recommended).
5. **Favorites you graded** show in your History, starred (recommended: "every parcel the person graded").
6. **Unstarring someone else's favorite:** it goes back to the adder's History, and the confirm names them
   (recommended).
7. **Asks and takes on History parcels** (from the sort): kept, not shown or counted (recommended: no deletion).
   Unstarring drops them, as the brief says.
8. **✕ on a History row:** at once, with Undo for 5 s (recommended: the app's line-delete pattern), rather than a
   confirm; Clear history confirms once.
9. **The tab's name:** stays "Your list", with the switch inside (recommended: both views are yours; the badge stays).
10. **Swipe to clear:** ✕ only, no swipe (recommended: a swipe fights the list's scroll and My order's drag).
11. **Favorites' status filter:** Archived alone (recommended).
12. **Remove** (delete for everyone) stays in a favorite's detail (recommended: unchanged behaviour).
13. **The map and Search** show only what you may see: favorites, and your History (recommended).
14. **Parcel numbers in Search:** any piece's, ignoring spaces and dashes (recommended).
15. **The name's prefill:** the parcel's own name if it has one; else the listing link's address; else "24.6 ac on Rte
    600, Grayson" (the entrance road from its last run, and the county); without a road, "24.6 ac in Grayson"
    (recommended).
16. **Starring a parcel not yet built:** builds it, so it's in your History too, then stars it (recommended).
17. **The switch's memory:** per profile, in `ps.library` (recommended).
18. **The export file:** unchanged; History logs aren't exported (recommended: a backup of the household's list).

## 12. Stop conditions (push what's there, say why, wait)

- The one-time sort needs a real converter.
- Any report or verdict text, or `expected.json`, change.
- A product decision outside this brief and §11.
- The same CI failure surviving three attempts.
- The plan turning out wrong.

## 13. Setup

None from Zach.

## 14. The PRs, into `step/8-favorites`

| PR | What | Checks |
| --- | --- | --- |
| 0 | This plan. | docs |
| 1 | **The model:** `lib/client/favorites.ts` (favorite, History for a person, star, unstar, clear, the log), `ps.history` synced with the profile, the one-time sort, grading writes the log, the map and Search limited to what you may see (Search adds parcel numbers), asks and takes counted on favorites only. | unit: History's rules, star and unstar, clear, the sort, the log, Search's matches |
| 2 | **The UI:** Your list's switch, the History view (star, ✕ with Undo, Clear history), Favorites without In progress, the star and its name sheet on the panel, the unstar confirm, ParcelStanding without In progress and Saved. | components; e2e: grade two, star one, Julie sees one, History has both, unstar, Clear history, Search |
| 3 | **The screenshots, the fresh-eyes review, the docs and the hand-back:** each screen at 1280 and 375; REQUIREMENTS §3h; `phase-0.md` §9.60; PLAN.md's step 8 row. | full CI on the step branch's head |

## 15. Test plan outline

**CI:** unit tests for the rules; e2e in two browser contexts on the memory store: Zach grades two parcels and stars one;
Julie sees only the starred one; Zach's History shows both; unstar → back in Zach's History, gone for Julie; Clear
history keeps favorites; Search finds a favorite by name.

**Manual, on the preview,** with `preview-parcels.json` and two profiles (Zach, Julie): the same flow by hand, plus the
phone's switch, the star in the peek, and ✕ with Undo.

## 16. Decision to record

**§9.60 Favorites and History:**
- Favorites, the household's shared list (the favorites and Archived);
- History, a per-person view over the shared store with a synced per-profile log;
- the star with its name sheet;
- unstarring back to the adder's History;
- Clear history;
- "In progress" gone (stored values kept);
- Search over favorites and your History;
- the one-time `addedBy` sort;
- §11's answers.
