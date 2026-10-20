# Step 6: The household, on the synced space

Written 2026-10-20 under mission mode (`CLAUDE.md`) from Zach's brief, which he pre-approved along with this plan's
recommended answers (§11). It runs straight through on `step/6-household`: this plan is PR 0 into the step branch,
and Zach reviews it together with the hand-back. The stop conditions are §12's.

**The goal:** Julie can see the parcels Zach finds, see how each would grade by her priorities, and give her own take.
Zach sees her take beside his.

Done when:
- **Members:** the household is the profiles in a synced space (step 5). Julie joins with Show code on her own phone,
  then picks **I'm new here** to make her profile, or picks hers if it's there. The current profile stays per device,
  so her phone opens as her.
- **One shared list:** parcels and screens belong to the space, not a profile. Each parcel says who added it ("Added by
  Zach"). Settings, priorities and interview answers stay per profile.
- **Everyone's grade, no combined grade:**
  - Your list shows the current person's grade first, then the other members' small beside it ("B · Julie C").
  - The parcel's panel has **How Julie would rate it**: her grade, her verdict, and the two or three rows that differ
    most from Zach's, each with her why line. It's computed from her priorities over the stored measurements, with no
    re-screen.
  - A member with no priorities yet shows "Julie hasn't set her priorities yet", with a way to start her questions.
- **Ask for a take,** replacing "Send to confirm":
  - **Ask Julie** on a parcel, with an optional note, puts it in her **Waiting for you**, with a badge on Your list.
  - She answers **Yes / Maybe / No**, with an optional comment.
  - Her take shows on the parcel and in the list beside her predicted grade, and she can change it later.
  - In-app only: no email or push.
- **Sorting and filtering:** new filters **Waiting for you** and **Both like it** (no one's take is No, and every
  member's grade is C or better), and a new sort, **Lowest of our grades**. The existing sorts stay.
- **Sync:** takes and asks are records that sync like parcels: whole records, and the later save wins.

## 0. What's there today (found while planning)

- **Profiles** (step 1) each keep their own documents in IndexedDB (`lib/client/profileKv.ts`), including their own
  parcels (`ps.parcels`). Screens are stamped with the profile that kept them. A device's current profile is the
  device key `ps.profile`.
- **The synced space** (step 5) syncs every profile (name, settings, priorities, answers), each profile's built parcels
  (`sync_parcels`, with a `profile` column) and each kept screen (`sync_screens`, likewise). Joining replaces the
  device's data; the newest profile becomes current.
- **Other people's rubrics already grade:** a profile's `ps.rubrics` holds `mine` plus `others` (step 1 moved the old
  second weight set in as "Julie"). Your list has a grade column per rubric, a **Household** column (the lowest verdict,
  owner #128) whose verdict is the default filter, and sorts by each grade and by the household verdict. The card's
  rubric switch shows "My grade" or "Julie's grade".
- **Why lines** (`lib/rubric/words.ts` `whyLine`) come from a profile's interview answers (`lib/client/myAnswers.ts`
  `whyContext`). Any profile's can be built from its `ps.interview` document.
- **Grades from measurements:** `reportCard(result, rubric, drawn)` grades a kept screen for any rubric, at display
  time. Rows carry their letter; a rubric's weights come from its ranked cards (`weightsOf`).

## 1. One shared list (a clean break)

- **Shared documents:** the parcels (`ps.parcels`) and the new household document (`ps.household`, §4) belong to the
  device's data set, not a profile. They're kept under a reserved id, `_space`, in the same IndexedDB documents store,
  and read through the prefs module as before (`lib/client/prefs.ts`: a shared key reads the shared store). Each
  profile's `ps.cfg`, `ps.rubrics`, `ps.rubricView`, `ps.interview`, `ps.compare`, `ps.library`, `ps.recentMarks` and
  `ps.namesFromNotes` stay its own.
- **Screens** are stamped `_space`. Deleting a profile no longer deletes parcels or screens.
- **The clean break** (CLAUDE.md; no converter, as the brief says):
  - On the first load of this release, when there's no shared parcels document yet, every profile's own `ps.parcels`
    and every screen stamped with a profile are deleted. The menu says once: "Saved with an older version; screen it
    again."
  - The synced space's old per-profile parcel and screen rows are ignored (only `_space` rows are read), not deleted.
  - Parcels come back by Export file (on the old version, before the merge) → Import file (after it). The test plan
    does exactly that (§15).
- **Added by:** a parcel records the profile that first built it, `addedBy` (a profile id), when it's first kept.
  Imported parcels get the importing profile. The parcel's panel and its detail on Your list say "Added by Zach", and
  the list's row says it under the name on a phone. A parcel from before this field, or whose adder was deleted, says
  nothing. It's an optional field with a null default, so the parcel store keeps `v: 2` (REQUIREMENTS §3a's rule for
  added optional fields).
- **Sync:** parcels and screens go up with `profile = "_space"` (the server's columns are unchanged).

## 2. Members, and "I'm new here"

- **The members** are the device's profiles. On a joined device, they're the space's.
  - `lib/client/household.ts` loads every profile's name, `ps.rubrics` and `ps.interview` once the profile has booted,
    and again whenever another profile's documents change (an add, a rename, a sync).
  - Pages read it synchronously, as they read prefs, and hear `RUBRICS_CHANGED`.
- **The others' rubrics are the members' own:** `profileRubrics()` returns mine, then each other member's own rubric
  under their name. The step 1 `others` inside a profile's `ps.rubrics` are no longer read (they were stand-ins for the
  household, and stay in the stored document, unused).
- **Priorities set:** a member has them when their `ps.rubrics` holds their own rubric (their questions or the editor
  wrote it). One who hasn't gets no grade anywhere, and "Julie hasn't set her priorities yet" (§3.2).
- **Joining** (step 5's `/link` and Join with a code) ends on **Who's this?**:
  - each member, with a button;
  - **I'm new here**, which goes to the interview's name screen ("What should we call you?") and makes a new profile in
    the space.

  The chosen profile becomes this device's current one (`ps.profile`). A device that joins with no members in the
  space goes straight to I'm new here.
- **Switching who you are** later is the profile picker, as today.

## 3. Everyone's grade

### 3.1 Your list

- **One grade column, "Grades":** the current person's grade first, as today's card grade, then each other member's
  small beside it: "**B** · Julie C". Their take follows their grade when there is one: "Julie C · Yes".
- The **Household** column goes: no combined grade is shown (brief). The household verdict stays as the default filter
  and its sort ("Household verdict"), as before (owner #128), because the brief keeps the existing sorts and filters.
- **On a phone,** the card's grade line reads the same.
- **Sorts:** My order, Last changed, Price, Acres, Household verdict, each member's grade ("My grade", "Julie's
  grade"), and the new **Lowest of our grades**: by the worst letter across the members with priorities, best first; a
  parcel with no grade sorts last.
- **Filters:** the existing ones, plus:
  - **Waiting for you** (n): asks to the current person not yet answered since they were asked;
  - **Both like it:** no member's take is No, and every member with priorities grades it C or better.
- **The badge:** the Your list tab (and, on a phone, its tab bar icon) carries the count of asks waiting for the current
  person. There's none at 0.

### 3.2 The parcel's panel: "How Julie would rate it"

Under the report card, on the map's panel and in the parcel's detail on Your list, one section per other member:
- **With priorities:** "How Julie would rate it", then:
  - her grade and her verdict: "C · Maybe", with her verdict's reason line, as her own card would say it;
  - **the rows that differ most,** up to three. Each row's share of the grade is its weight times its points, under each
    rubric. The rows are ranked by how far Julie's share is from Zach's, and only those that differ are shown. A Must
    that fails for her and not for him comes first. Each reads "Elevation: you B, Julie C" with her why line under it
    ("She'd want to be above 3,000 ft", or "On the starting list.").
  - **her take,** when she's given one: "Julie: Yes, 10/20", with her comment.
- **Without priorities:** "Julie hasn't set her priorities yet." with "On her phone: More → Answer a few questions.",
  and a button, **Answer as Julie here**, which switches this device to her profile and opens the questions.
- It reads the stored screen and her rubric only: no re-screen and no network.

## 4. Asking for a take

- **The household document** (`ps.household`, shared), validated with Zod:
  - **Ask:** `{ key: "<parcel>:<to>", parcel, from, to, note, at }`. One open ask per parcel and person; asking again
    replaces it.
  - **Take:** `{ key: "<parcel>:<by>", parcel, by, answer: "yes" | "maybe" | "no", comment, at }`. One per parcel and
    person, and changing it replaces it.
  - **Waiting for you:** an ask to me with no take of mine made after it.
- **Ask Julie:** a button in Julie's section of the parcel's panel opens a small form: a note ("Optional: what to look
  at") and **Ask**. On Julie's device, after a fetch, the parcel is in her Waiting for you, and the badge shows.
- **Answering:** on Julie's device, the parcel's panel shows "Zach asked for your take" with his note, three buttons,
  **Yes**, **Maybe** and **No**, an optional comment, and **Save my take**. Her take, once saved, can be changed the
  same way. A take can also be given without an ask: "Your take" is always in the person's own section.
- **On Zach's side** the take shows in Julie's section and in the list.
- **Sync:** each ask and take is a whole record that syncs like a parcel. On the server it's one new table,
  `sync_household` (`space`, `key`, `kind` in ask/take, `record`, `deleted`, `updated_at`), with RLS on and no
  policies, the same `updated_at` trigger, and one additive migration (`0002_household.sql`), applied through the
  connector before the PR that needs it merges. The sync routes carry `takes` and `asks` alongside profiles, parcels and
  screens, each defaulting to empty.
- **Deleting a parcel** deletes its asks and takes.

## 5. Sync changes, in short

- Parcels and screens: `profile = "_space"` rows only, read and written.
- The household document syncs by record, `kind` and `key`, through the same diff-and-merge as parcels
  (`lib/sync/records.ts`). The later save wins.
- Joining ends on Who's this? (§2) instead of opening the newest profile.

## 6. What's not in this step

Email or push, a combined grade, notifications outside the app, changes to the report's text, takes in the export file
(§11 Q5), comments threads (one comment per take only), and follow-ups 59 and 60.

## 7. Security

- `sync_household` has RLS on with no policies, like step 5's tables. The anon-key check (`select` gets no rows,
  `insert` is refused) is run on it after the migration and recorded in the hand-back, with the advisors.
- Asks and takes are inside the space: anyone with the code sees them, as with everything else in it.

## 8. Tests

- **Unit:**
  - the shared-store keys;
  - the clean break's sweep;
  - `addedBy` on build and on import;
  - the members module (priorities or none);
  - "rows that differ most" (shares, Must first, at most three, none when equal);
  - Waiting for you (an ask, a later take, a re-ask);
  - Both like it;
  - Lowest of our grades;
  - the household records' diff and merge;
  - the server routes' new collections over the memory store.
- **e2e** (memory store, two browser contexts):
  - Zach starts syncing; Julie joins, picks I'm new here, and answers her questions;
  - Zach's list shows "B · Julie C";
  - the panel's Julie section names its rows;
  - Ask Julie with a note → Julie's badge and Waiting for you → she answers Maybe with a comment → Zach sees "Julie C ·
    Maybe" after a tab switch;
  - Both like it;
  - the clean break: old per-profile parcels dropped, with the one line.
- **Existing e2e** that assumed one list per profile (`profiles.spec.ts`: "a parcel kept in one isn't in the other") now
  show the opposite: a parcel added as one profile is on the shared list for the other.

## 9. UX

- **The main flows, in the fewest steps:**
  - Julie joins: scan → Join → **I'm new here** → her name → her questions → Your list, with Zach's parcels graded by
    her.
  - Zach asks: a parcel → **Ask Julie** → a note → **Ask**.
  - Julie answers: Your list (badge) → **Waiting for you** → the parcel → **Maybe**, a comment → **Save my take**.
  - Zach reads it: Your list, "Julie C · Maybe"; the parcel's Julie section has her comment.
- **What you see first:** your own grade, then the others' small; the panel's Julie section sits under your own card,
  and opens to her rows.
- **States:**
  - **empty:** a household of one shows no other grades, no Julie section and no Ask;
  - **no priorities:** the line in §3.2;
  - **a take still saving:** step 5's indicator and Not saved;
  - **a parcel never screened:** no grades for anyone, and "Grade this parcel" as today.
- **Plain labels:** Grades, Added by Zach, How Julie would rate it, Ask Julie, Waiting for you, Both like it, Lowest of
  our grades, Yes, Maybe, No, Save my take, Your take, Who's this?, I'm new here, Answer as Julie here.
- **Phone at 375 px:** the grade line wraps under the name on a card; the take buttons are three across, each at least
  44 px; the ask form is a sheet; the badge is legible on the tab bar.
- **Contrast and consistency:** the others' grades use the card's grade chips at the small size (today's
  `card-grade small`); takes use the verdict colours (Yes green, Maybe amber, No red), and pass AA on paper.

## 10. Numbers and text that may change (the declaration)

- **No numbers:** no `config.ts`, `expected.json`, engine or `ScreenResult` change. Schema v9 stays frozen.
- **No report, verdict or card text changes.** The Julie section quotes her card's existing reason line and her
  existing why lines. It adds no report text.
- **UI text, new:** every label in §9, the Julie section's lines, the ask form's note, and Waiting for you's count.
  **Gone:** the Household column header (the verdict filter and sort keep their labels).
- **Storage:**
  - shared documents under `_space` (`ps.parcels`, `ps.household`);
  - the clean break of per-profile parcels and screens (§1);
  - `addedBy` on parcels (optional, `v` unchanged);
  - one new server table (additive).

  The export file doesn't change (version 6). Its `profile` and `rubrics` are as before.

## 11. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Where the shared list lives:** under a reserved id in the same documents store (recommended: no IndexedDB
   change), rather than a new store.
2. **The step 1 `others` rubrics:** no longer read; the members' own rubrics take their place (recommended: they were
   the household's stand-in).
3. **The Household column:** removed from the list (no combined grade). Its verdict filter (the default) and its sort
   stay as they are (recommended: the brief keeps existing sorts and filters).
4. **A member without priorities:** no grade anywhere, the line, and **Answer as Julie here** for when she's at this
   device (recommended), besides the hint for her phone.
5. **Takes in the export file:** not in this step (recommended: export stays version 6; takes live in the space).
6. **Rows that differ most:** by each row's share of the grade (weight × points) under each rubric, Musts that fail
   first, up to three (recommended: matches how the grade is made).
7. **Waiting for you's badge:** on the Your list tab, with the count (recommended), not on the app's icon.
8. **A take without an ask:** allowed, from your own section (recommended: the brief's "her take" doesn't need an ask).
9. **The server:** one additive table, `sync_household`, for asks and takes (recommended) rather than storing them as
   parcels.

## 12. Stop conditions (push what's there, say why, wait)

- A product decision outside this brief.
- A change to report or verdict text, or to `expected.json`.
- A migration that isn't additive.
- The same CI failure surviving three attempts.

## 13. Setup

None from Zach: the migration goes through the connector to `parcelscreen` (additive), and nothing new is needed in
Vercel.

## 14. The PRs, into `step/6-household`

| PR | What | Checks |
| --- | --- | --- |
| 0 | This plan. | docs |
| 1 | **One shared list and the members:** shared documents under `_space`, the clean break, `addedBy`, screens stamped `_space`, `lib/client/household.ts`, the members' rubrics in place of `others`, **Who's this?** and **I'm new here** after joining, the sync's `_space` rows. | unit: shared keys, the sweep, `addedBy`, members; e2e: a parcel added as one profile is on the other's list; join → Who's this? → I'm new here; the clean break's line |
| 2 | **Everyone's grade:** the list's Grades column and its sorts (Lowest of our grades), the panel's How Julie would rate it, the no-priorities line and Answer as Julie here. | unit: rows that differ most, Lowest of our grades; e2e: "B · Julie C", the section's rows, a member without priorities |
| 3 | **Asking for a take:** `ps.household`, `0002_household.sql` (connector, anon check, advisors), the routes' takes and asks, Ask Julie, Waiting for you and its badge, answering and changing a take, takes in the list and the panel, Both like it. | unit: Waiting for you, Both like it, the records; server routes; e2e: ask → badge → answer → Zach sees it |
| 4 | **The screenshots, the fresh-eyes review, the docs and the hand-back:** each new screen at 1280 and 375; REQUIREMENTS §3f; `phase-0.md` §9.58; PLAN.md's step 6 row. | full CI on the step branch's head |

## 15. Test plan outline

**CI:** §8.

**Screenshots, at 1280 and 375:**
- the list with two grades;
- the parcel's Julie section;
- a member without priorities;
- Ask;
- Waiting for you with its badge;
- answering a take;
- Who's this?

**Fresh-eyes review (CLAUDE.md):** the screenshots only, with "You've never used this app. What is this page for,
and what's confusing?".

**Manual, on the preview** (two browser profiles, or the desktop and the phone, one as Zach and one as Julie), with
`preview-parcels.json`:
- Zach imports the fixtures and starts syncing;
- Julie joins and picks I'm new here, then answers her questions;
- both lists show both grades;
- Zach asks Julie about **Ferney Creek**; Julie sees the badge and answers;
- Zach sees her take;
- Both like it;
- Lowest of our grades.

**After the merge,** on production:
- before the merge, Zach exports on the old version;
- after it, the clean break's line shows; Zach imports the file;
- Zach gives Julie the code.

## 16. Decision to record

**§9.58 The household on the synced space:**
- one shared list under `_space`, with `addedBy`;
- members are the space's profiles, joined through Who's this? and I'm new here;
- the members' own rubrics replace `others`;
- everyone's grade, with no combined grade (the Household column gone; its verdict filter and sort kept);
- How Julie would rate it, by each row's share of the grade;
- asks and takes as synced records in `sync_household`;
- Waiting for you, Both like it, Lowest of our grades;
- the clean break of per-profile parcels.
