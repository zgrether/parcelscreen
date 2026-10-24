# UX audit and redesign proposal (part 1)

**Status: decided (Zach, 2026-10-24).** He chose A on all six judgment calls, with the notes recorded in §6.10. This is
documents and mock-ups only; nothing in the app changes here. Part 2 builds the proposal as a normal mission (plan as
PR 0, step branch, hand-back). It starts once step 14's hand-back is on main. The bugs in §7 come first, as one PR into
main.

The material:
- this file;
- the mock-ups' source, `ux-audit/mockups.html`;
- the images in `ux-audit/`:
  - `after-*`: the proposal's mock-ups;
  - `shot-*`: screenshots from the walkthroughs;
  - `seeded-*`: screens shot with seeded parcels;
- the two walkthrough reports, unedited (`ux-audit/walk-desktop.md`, `ux-audit/walk-phone.md`);
- the inventory from the code (`ux-audit/inventory.md`).

## 0. In one page

**What we did.**
- Two first-time users worked through the 12 tasks on a production build: one on a desktop, one on a phone.
- Each was a subagent that hadn't seen the code, told only the household's goal and the four fixture parcels' listing
  facts (§1).
- A third agent mapped every screen and the path to every feature from the code.
- Every open item in `docs/plans/polish.md` is folded in (§5.2).

**What works.** Both users found these easy, and said so:
- the report card once graded: the letter, the verdict, one reason, then Must have and Really want;
- correcting a row they knew was wrong;
- What matters' live "B → A" preview;
- the cost breakdown;
- the one-page report.

**The five worst problems** (§5 ranks them all):
1. **Closing a graded parcel throws the grade away.**
   - × or Esc on a parcel that isn't on the list drops it from Recent, with nothing said.
   - Both users regraded parcels they had already graded. One graded Macks three times, at about a minute each.
2. **There's no way to say "not for us".**
   - The × that does it isn't labelled as doing it. Archive exists only for favorites, four taps deep.
   - Neither user found it.
3. **A partner can't be invited.**
   - The only way in is the device-sync code, which warns "Use it only on your own devices".
   - Then "I'm new here", which shows a "wasn't saved" error at once.
   - And the first person is "Profile 1" everywhere, because nothing asked their name.
4. **Finding the listing's parcel fails.**
   - Parcel-number search only covers the counties in view, and failed even then (Floyd's "35-3").
   - It offers places in Turkey and Poland.
   - Coordinates drop no pin.
   - The map doesn't move to a parcel opened from search, Your list or Compare.
5. **The same person gets two grades on two devices.**
   - A new factor was added to one device's priorities and not the other's.
   - So Mud Creek was A on one device and B on the other, for the same profile.
   - This is a bug, listed in §7 with the other bugs.

**The proposal in one paragraph.** Keep the three places (Map, Your list, What matters). Make the parcel panel lead
with its answer and keep its decisions in reach:
- one row of four actions: Add to list, Not for us, Ask, ⋯;
- three segments: Grade, Uses, Details. Uses holds step 14's "What you can do here" and step 15's "How it could pay".

Never lose a graded parcel. Give the list one name and three views (Shortlist, Recent, Ruled out). Make inviting a
person a Household screen, separate from linking your own device. Search the listing's own parcel number in every
covered county. Offer "Use as the driveway" the moment a track is finished. Use one word for each thing (§4.1). The
mock-ups are in §6.

**Decisions for Zach** (§6.10, each with two options and a recommendation):
- where Uses and "How it could pay" go;
- how a parcel is ruled out;
- how a partner is invited;
- which leads when the grade and the verdict disagree;
- whether a correction of a fact is shared with the household;
- whether Where to look is limited to a region.

**Bugs to fix whatever is decided** (§7): five here, plus the four area-popup ones already fixed in #304. They can go
as one fix PR into main before part 2.

## 1. Method

- **The build.** A production build (`next build`, `next start`) of main with #304 (the area grades) on top, a memory
  sync store, and live public data, so grading took 22–57 s, as it does for Zach. Every browser started empty.
- **The users.** Two subagents, each briefed as a first-time user (`ux-audit/walk-*.md` gives the brief's setting):
  - **The goal they were given:** a couple looking for rural land in SW Virginia, NW North Carolina and NE Tennessee,
    with four listings' facts (Mud Creek, Macks Mountain, Ferney Creek, Roan Mountain: county, tax parcel number, rough
    coordinates).
  - **No code:** they were told not to read any repository file, only to use the app, and to write down their thoughts
    as they had them.
  - **The devices:** one used a 1280 × 800 desktop with a second desktop as the partner and then the second device.
    The other used a 375 × 812 touch phone with a second phone.
  - **Time:** about 39 and 31 minutes of agent time.
- **The tasks**, in order:
  1. Find a parcel and judge it.
  2. Decide one isn't for you.
  3. Keep one.
  4. Compare three.
  5. Ask the partner and see the answer.
  6. Find areas that fit.
  7. Override a row.
  8. Export a report.
  9. Change a priority and see the grades move.
  10. Draw a track and use it as the driveway.
  11. Check the cost to build.
  12. Join a second device.

  The tasks were worded as goals, not in the app's words ("Decide it's not for you, and get it out of your way").
- **The inventory.** A code-reading agent listed every route, dialog and panel, the taps to every feature at both
  widths, and what each depends on, plus naming, duplication, glyphs and states (`ux-audit/inventory.md`). I checked
  its tap counts against the walkthroughs.
- **The limits:**
  - Agents aren't people. They read the accessibility tree as well as the screenshot, so a well-labelled control was
    easier for them than it would be for a person, and a visual-only cue was harder.
  - The phone's taps were mouse clicks, because the harness couldn't send touch.
  - The print dialog can't be seen headless.
  - Each user did the tasks in one session, so later tasks had what earlier ones taught.

## 2. Site map and reach

The inventory (`ux-audit/inventory.md`) has every screen and the tap count to every feature. The ones that matter here:

| Task | Fewest taps from the map, desktop / phone | Depends on |
| --- | --- | --- |
| 1. Find and grade a parcel | Search 1 + pick 1 + grade 1 = 3 / 3 | Parcel numbers only in the counties in view; a place or coordinates still need a tap on the parcel |
| 2. Rule a parcel out | × (2), only for a built parcel off the list; Archive (4), only for a favorite | **Nothing works for a parcel that's only in Recent** |
| 3. Keep a parcel | 3 / 3 | |
| 4. Compare three | 5 / 5 (Your list, 3 ticks, Compare) | Favorites only |
| 5. Ask the partner | 3 / 4 | **A second profile first**: Add a profile, or the partner joins with the device-sync code |
| 6. Areas that fit | 0 (the empty panel) / 1; 2 from the menu (#304) | The panel's box only shows with nothing open |
| 7. Override a row | 4 / 5 | **Only in the map's panel**: not in Your list, Compare or print |
| 8. Export a report | 4 / 4 | Graded, with a key |
| 9. Change a priority, see the grades | 3, then Your list / 3 | Try it on shows one parcel |
| 10. Track as the driveway | 6+ points / same, +1 to find the parcel | **"Use as my driveway" only after a grade that included the line** |
| 11. Cost to build | 2 / 3 | A routed driveway |
| 12. A second device | 4 on the first device, 5+ on the second | |

**Reachability that changes with state:**
- **Ruling out** needs the parcel to be a favorite, or to be built and not one.
- **Asking** needs a second profile.
- **Adjusting a row** works only on the map.
- **Using a track as the driveway** needs a grade with the track in it.
- **Where to look** shows only with nothing open, or from the menu since #304.
- **Phone layout:** the phone breakpoint is "≤ 860 px and portrait", but Your list's cards switch at 700 px, so a
  portrait tablet gets half of each.

## 3. The walkthroughs

### 3.1 Each task

The quotes are the users' own words, written down at the moment.

| Task | Desktop | Phone | The worst moment, in the user's words |
| --- | --- | --- | --- |
| 1. Find Mud Creek and judge it | Done. 5 actions to the parcel, 7 to its grade | Done, with a detour. 7 actions | "Zoom in on the county? I don't know where the county is on this map, I just have the parcel number." |
| 2. Macks isn't for us | **Partly.** About 16 actions; never found "not for us" | Done, but only as a hide. 9 actions | "Where's the 'not interested' button? The ... menu has one thing in it." |
| 3. Keep Ferney | Done. 1 action | Done. 5 actions (picking the right parcel) | "Add to list... and the dialog says Add to favorites. Is 'list' the same as 'favorites'?" |
| 4. Compare three | Done. 2 actions on Your list | Done. 2 actions, after regrading Mud Creek | "Why did Mud Creek lose its grade? I graded it an hour ago. Do I have to wait another 45 seconds?" |
| 5. Ask the partner, see the answer | Done after a detour. About 8 actions before Ask existed | Done. 7 actions | "'Use it only on your own devices' ... but I'm about to give it to Alex. Am I doing something wrong?" |
| 6. Areas that fit | Done. 2 actions | Done. 2 actions | "Highlands and Cashiers is #1? That's way down in the southwest corner of North Carolina, not where we're looking." |
| 7. Correct the septic row | Done. 2 actions | Done after a dead end. 5 actions | "Why is the same Septic box different here than on my list?" |
| 8. A report to send | Done. 2 actions | Done. 1 action | "My septic note isn't in it; it just has a pencil mark next to the check." |
| 9. The sky matters more | Done. 2 actions | Done. 2 actions | "'B · Not for us'. A B grade but not for us? Which do I believe?" |
| 10. A track as the driveway | Done, with caveats. About 9 actions to "Use as my driveway" | Done. About 17 actions | "Every tap opens this Grayson Highlands box. I'm trying to draw!" (fixed in #304) |
| 11. Cost to build | Done. 1 action | Done. 1 action | "'Everything but the house'. OK, so where's the house?" |
| 12. A second device | Done. 2 actions (already synced in task 5) | Done. 2 actions | "Same person, same parcel, two devices, two different grades. Which one is right?" |

### 3.2 The "where is…?" moments

- "Where's the 'not interested' button? The ... menu has one thing in it." (desktop, task 2)
- "Where do I say no to this one? There's Walked and Offered, but no Passed." (phone, task 2)
- "How do I invite my partner? There's no Share button anywhere." (desktop, task 5)
- "How do I add my partner? There's no 'household' or 'invite'. Maybe sync?" (phone, task 5)
- "OK, it zoomed... but where's my point? Which of these parcels is it?" (desktop, task 1)
- "Where's my parcel? It's a speck at the top behind the 3D button." (phone, task 10)
- "I drew the line. Now how do I tell it this is the driveway?" (desktop, task 10)
- "It says 'a septic permit you mark passes it'. Where do I mark it?" (phone, task 7)
- "'To lower it: Mark a septic permit with its class.' Where? I looked for that in task 7." (phone, task 11)
- "Where did Roan Mountain go? Oh, '1 hidden by filters'. I didn't set a filter." (desktop, task 9)
- "Why is the map showing the whole state? I just opened the parcel." (desktop, task 10)
- "Which of these blobs is Floyd County? There are no labels." (desktop, task 6)

### 3.3 What they'd change first

- **Desktop:**
  1. An "Invite your partner" flow, and being asked their name at the start.
  2. A "Not for us / hide" on any parcel, and never silently losing a grade.
  3. The map following the parcel they open, and no area popups while drawing.
- **Phone:**
  1. Parcel-number search from anywhere, local place results, a pin at coordinates, and no grade lost on close.
  2. Drawing that zooms to the parcel, keeps Finish on screen and offers the driveway at Finish.
  3. A real invite, their own name, a "not for us" with a reason where they are looking, the same adjust controls in
     every copy of a row, and the same grade on every device.

## 4. Consistency review

The details, with file references, are in `ux-audit/inventory.md`. The patterns:

### 4.1 Names

The same thing goes by up to six names. Both users stumbled on three of them: list vs favorites, Must have vs
Dealbreakers, and grade vs verdict. Proposed: one word each, used everywhere on screen and in report text.

| Thing | Today | One name |
| --- | --- | --- |
| The saved parcels | Your list, list, Favorites, favorites, saved, (code: history for Recent) | **Your list**, with **Shortlist** / **Recent** / **Ruled out** as its views; "Add to list", "On your list" |
| The person's priorities | What matters, What matters to you, priorities, weights, rubric, the starting list | **What matters** (the place), **your priorities** (in sentences) |
| Running the screen | Grade, Grading, screen, screening, Re-screen, run again, re-run | **Grade**: "Grade this parcel", "Grade again", "Not graded yet" |
| A must failing softly | Check first, Warning, warns, ! | **Check first** |
| The must tier | Must have, Must haves, must-haves, Dealbreakers, limit, minimum | **Must have**; a number on it is **your limit** |
| Really want in Compare | What money can't add | **Really want** |
| The verdict "Pass" | Not for us; also the × tooltip's "Not for me" and Archive's "Not for us" | **Not for us** stays the app's verdict; the person's decision is **Rule out** / **Ruled out** |
| People | Profile, member, household, person, Profile 1 | **Household** for the group, a **name** for each person; "profile" leaves the screen |
| Asking | Ask, take, rate, X's grade, X says | **Ask**, and the answer is a **take**; "X's grade" is the grade |
| The easement factor | Driveway on your land / Easement needed / Own drive | **Driveway on your land** (row and panel); the grid header "Own drive" only where space forces it |
| The report | Report card (on screen and print), Full report, Full | **Report** for the export ("Make a report"); the card stays "the card" |
| Still unknown | Still unknown / Questions for the agent / More to check… | **Questions for the agent** (print and screen) |
| Night sky | Night sky / Dark skies | **Night sky** |
| Remove a parcel | Delete / Remove / Remove from the list | **Remove from Your list** (it keeps the parcel's grade in Recent); **Delete** only for drawn things |

The renames that touch report text (the card, the print, verdict words) are report-text changes under CLAUDE.md
rule 7. Part 2's plan lists each one for Zach's approval, as #300 did for its Help correction. The rest are
interface labels.

### 4.2 Placement

- **The same decision in different places.**
  - Archive lives in Details, for favorites only. The × works only off the list.
  - The adjust controls are in the map's row panel only.
  - "Use as my driveway" is in Details, or in the Easement panel (as "Use it").
- **Ask is at the foot of the Grade tab.** It's the last thing on the longest scroll, and on the phone's map sheet it
  sits below Ways to raise.
- **Compare's button appears at the top right**, far from the ticks; its checkbox column has no header.
- **Settings holds three different kinds of thing:**
  - Your data;
  - the engine's thresholds;
  - Sync, which is where a partner gets in.

### 4.3 Duplication

These are not wrong in themselves, but they cost reading time:
- "Grade again" shows three ways.
- There are three ways to remove a parcel and three to choose the driveway.
- Where to look is in five places.
- The report card is drawn four times, and only one copy can adjust.

The proposal keeps one place for each decision (§6.2) and lets the others link to it.

### 4.4 Glyphs

- × means close, dismiss, "not for me", delete a line and remove from Recent.
- ★ means "on your list" for a parcel and "pin its outline" for an area.
- ▸/▾ mean expand, open a menu, and switch to Details.

The proposal:
- × closes (and clears the parcel from the map), never more;
- deleting and removing are words;
- an area gets a pin icon (polish #51).

### 4.5 States

- **The slowest moment has no progress.** A grade takes 22–57 s, and on a phone it shows only "Grading…"; the step
  list exists but only appears afterwards.
- **Loading looks like data.** Your list and Compare show "–" or "not screened" while saved results load.
- **The first paint is blank.**
- **Settings' Save says nothing.**

## 5. Findings, ranked

**Severity:**
- 4: a wrong answer, or lost work;
- 3: blocks a task, or forces a workaround;
- 2: slows or confuses;
- 1: cosmetic.

**Frequency:**
- 3: both users, in two or more tasks;
- 2: both users once, or one user in two or more tasks;
- 1: once.

The score is severity × frequency. The third column says where each finding goes: P-n is a proposal item (§6), B-n a
bug (§7).

| # | Finding | Goes to | S | F | Score |
| --- | --- | --- | --- | --- | --- |
| 1 | Closing a graded parcel off the list drops it from Recent with its grade, silently | P-4 | 4 | 3 | **12** |
| 2 | No way to rule a parcel out from where you're looking | P-4 | 3 | 3 | **9** |
| 3 | Parcel-number search fails: only counties in view, and "35-3" missed even in view; places worldwide | P-1, B-3 | 3 | 3 | **9** |
| 4 | The same profile, two devices, two grades | B-1 | 4 | 2 | **8** |
| 5 | No way to invite a partner; the sync code's warning reads "don't" | P-8 | 3 | 2 | **6** |
| 6 | "Profile 1": the first person is never asked their name | P-8 | 2 | 3 | **6** |
| 7 | Area popups take taps while drawing and over parcels | fixed in #304 | 3 | 2 | **6** |
| 8 | A drawn track is a driveway only after another grade, behind Details | P-9 | 3 | 2 | **6** |
| 9 | The map doesn't move to a parcel opened from search, Your list or Compare; × zooms out | P-1, B-5 | 2 | 3 | **6** |
| 10 | A correction (septic) doesn't reach the cost line or the printed report; adjusting works only in the map's copy | P-2, J-5 | 3 | 2 | **6** |
| 11 | The grade and the verdict disagree with no word between them ("B · Not for us", "A Maybe") | P-2, J-4 | 2 | 3 | **6** |
| 12 | Four names for the list; Must have vs Dealbreakers; other renames (§4.1) | P-0 | 2 | 3 | **6** |
| 13 | Best homesite still quotes the app's drive after you chose your own | B-6 | 3 | 2 | **6** |
| 14 | "A change on this device wasn't saved: New member" on joining | B-2 | 2 | 2 | **4** |
| 15 | Coordinates drop no pin; a tap at the centre picked the neighbour | P-1 | 2 | 2 | **4** |
| 16 | Grading shows no progress on a phone for up to a minute | P-2 | 2 | 2 | **4** |
| 17 | Ask sits at the foot of a long panel; takes aren't on the list's rows; "seen" is per device | P-2, P-5 | 2 | 2 | **4** |
| 18 | Where to look ranks areas outside the region first; a sample can fail a must | J-6 | 2 | 2 | **4** |
| 19 | The night sky in mag/arcsec² | P-7 | 2 | 2 | **4** |
| 20 | "Cost to build" leaves out the house, with nowhere to add one; out-of-state sources | P-3 note | 2 | 2 | **4** |
| 21 | Unexplained map marks after a grade (S4, G1, E2, the fan, red lines) | P-2 | 2 | 2 | **4** |
| 22 | Phone: the toolbar over the map buttons, Finish cut off, Stand here cut off, the report preview unreadable | P-9, B-7 | 2 | 2 | **4** |
| 23 | Esc on a menu closes the whole parcel (and so drops its grade) | B-4 | 3 | 1 | **3** |
| 24 | Compare: no header on the ticks, the button far away; 1½ columns on a phone | P-5, P-6 | 1 | 2 | **2** |
| 25 | Parcels hidden by a filter the person never set ("1 hidden by filters") | P-5 | 2 | 1 | **2** |

**Zach's friction list** (2026-10-24, §8). These are scored on the same scale. Frequency 3 means Zach meets it every
session.

| # | Finding | Goes to | S | F | Score |
| --- | --- | --- | --- | --- | --- |
| Z-2 | Opening a saved parcel takes three taps (Your list, the parcel, Open on the map) | P-5, Zach's call (§6.13) | 3 | 3 | **9** |
| Z-1 | No double-tap zoom on phones | P-10 (§6.13) | 2 | 3 | **6** |
| Z-3 | The list's detail panel wastes space (Open on the map at the top, a large Archive block, Remove at the foot) | Z-2 (the panel goes) | 2 | 3 | **6** |
| Z-4 | No price block: asking price, $/ac, the costs, the optional items, and what the land can cost within the budget | P-11 (§6.13) | 2 | 3 | **6** |
| Z-7 | The phone's list card is a mass of text | P-5, Zach's design (§6.13) | 2 | 3 | **6** |
| Z-8 | Recent's rows are heavy (buttons on every row) and it keeps 20 for 30 days | P-5, Zach's design (§6.13) | 2 | 3 | **6** |
| Z-9 | Grading shows no progress; the sheet's header is cluttered; B-7 confirmed on Zach's phone | P-2, Zach's call (§6.13); B-7 | 2 | 3 | **6** |
| Z-6 | The ✓ / ! marks and the letter badges don't share a column; ✎ pushes the verdict word | P-0 (§6.13) | 1 | 3 | **3** |
| Z-5 | No market reference for a land price (investigate only) | Part 2's plan: research into `docs/commercial-review.md` | — | — | — |

### 5.1 The evidence

**1. A closed parcel loses its grade.**
- Desktop: Macks reopened ungraded after × (left), and Recent without it after a reload (right).
- Phone: Recent was empty after grading Mud Creek and closing it (`walk-phone.md`, task 2).

![](ux-audit/shot-desktop-t02-reopen-macks.jpg) ![](ux-audit/shot-desktop-t02-recent2.jpg)

**2. No "not for us".** The parcel's ⋯ holds only Report card (desktop), and Details' Status has only Walked and
Offered (phone).

![](ux-audit/shot-desktop-t02-more-menu.jpg) ![](ux-audit/shot-phone-t02-status.jpg)

**3. Parcel-number search.**
- The listing's "63-A-62" gets "Zoom in on the county" and Turkish places.
- "35-3" isn't found with Floyd on screen, though the panel had just shown "35-3".

![](ux-audit/shot-desktop-t01-search-parcel.jpg) ![](ux-audit/shot-desktop-t02-search-35-3.jpg)
![](ux-audit/shot-phone-t01-type-parcel.jpg)

**4. Two grades.** Sam's list on the second device (B ✎ Maybe) and on the first (A ✎ Maybe). The second device's What
matters says "New: Driveway, at the bottom of Nice to have (you skipped the question…)"; the first device has no such
change.

![](ux-audit/shot-desktop2-t12-as-sam.jpg) ![](ux-audit/shot-desktop-t12-desktop-list.jpg)
![](ux-audit/shot-desktop2-t12-sam-priorities.jpg)

**5, 6 and 14. Getting a partner in.**
- The sync code's warning.
- The partner's first screen with "wasn't saved: New member".

![](ux-audit/shot-desktop-t05-start-sync.jpg) ![](ux-audit/shot-desktop2-t05-new-here.jpg)
![](ux-audit/shot-phone-t05-sync-start.jpg)

**7. Area popups over drawing.** This was fixed in #304: no popup at parcel zoom or with a tool on. The popup's star
and close were fixed there too.

![](ux-audit/shot-phone-t10-points.jpg) ![](ux-audit/shot-phone-t06-star.jpg)

**8 and 13. A track as the driveway.**
- The track drawn.
- After "Use as my driveway", Best homesite still says "2,880 ft drive at 16%".
- The phone's draw toolbar cuts off Finish.

![](ux-audit/shot-desktop-t10-drawn.jpg) ![](ux-audit/shot-desktop-t10-grade-after.jpg)
![](ux-audit/shot-phone-t10-draw-line.jpg)

**9. The map doesn't follow.** Mud Creek opened from Your list, and the map still shows the region.

![](ux-audit/shot-desktop-t10-open-mud.jpg)

**10. A correction stops at the card.**
- The septic override doesn't change "Septic (modified) $7–20k".
- The report prints ✓ ✎ beside "no soil rates better than very limited".
- Your list's copy of the panel has no Adjust (left); the map's does (right).

![](ux-audit/shot-desktop-t11-build-cost2.jpg) ![](ux-audit/shot-desktop-t08-report.jpg)
![](ux-audit/shot-phone-t07-septic.jpg) ![](ux-audit/shot-phone-t07-map-septic.jpg)

**11. The grade and the verdict.** "B · Maybe → B · Not for us" in Try it on, and an A held at Maybe on the list.

![](ux-audit/shot-desktop-t09-must.jpg) ![](ux-audit/shot-desktop-t09-list.jpg)

**12. Names.** "Add to list" opens "Add to favorites"; Compare says "Dealbreakers" and "What money can't add".

![](ux-audit/shot-phone-t03-added.jpg) ![](ux-audit/shot-desktop-t04-compare.jpg)

**15. No pin.** After "Go to 36.5854, −81.562" there's no mark at the point.

![](ux-audit/shot-phone-t01-go-coords.jpg)

**16. No progress.** "Grading…" at 45 s on a phone.

![](ux-audit/shot-phone-t04-roan-graded.jpg)

**17. Ask and takes.** The partner's answer box is at the foot of the drawer.

![](ux-audit/shot-desktop2-t05-alex-drawer-scroll.jpg)

**18. Where to look.** Highlands and Cashiers ranked first for a SW Virginia search, and the sample the app shows
fails a must.

![](ux-audit/shot-desktop-t06-where-to-look2.jpg) ![](ux-audit/shot-desktop-t06-show-ashe.jpg)

**19. The sky's units.**

![](ux-audit/shot-desktop-t09-night-sky.jpg) ![](ux-audit/shot-phone-t09-night-sky.jpg)

**21. The map after a grade.** S1–S5, G1, E1–E3, a numbered 1–4, a fan of rays and two red lines, with no key in
view.

![](ux-audit/shot-desktop-t01-graded.jpg)

**22. The phone's overlaps.** The toolbar over the map's buttons with the sheet up, and the report's one-page preview.

![](ux-audit/shot-phone-t01-sheet-up.jpg) ![](ux-audit/shot-phone-t08-report.jpg)

**23. Esc.** The parcel closed, and its grade went with it, when Esc was meant for the ⋯ menu.

![](ux-audit/shot-desktop-t02-status-failed.jpg)

### 5.2 The open polish items

Every open item in `docs/plans/polish.md`, numbered in the order they appear there, with where it goes. "Stays"
means it remains a polish item, untouched by this proposal.

| Polish item | Goes to |
| --- | --- |
| 1 Try it's "Pass" can read as "passes" | P-0 (Not for us / Rule out), J-4 |
| 2 Try it bar covers cards on a phone | P-7 |
| 3 Interview: one pattern for moving on | Stays (outside the 12 tasks) |
| 4 Older screens: pin codes, Stand here, toasts, toolbar, nav labels | P-2 (map key), P-0; the rest stays |
| 5 Favorites a table, History a list | P-5 |
| 6 "Your list" opens on two lists | P-5 (three named views) |
| 7 A line's row: condition and width read unfinished | Stays (VR4 prices conditions) |
| 8 "Past your 20-minute limit" with a B Contender | P-2, J-4 |
| 9 "Sam B" beside "Sam says Maybe" | P-0 (grade vs take), P-5 |
| 10 "Filters · 2 on" | P-5 |
| 11 The notice's table: "Nice to have 0" | Stays |
| 12 Map layers: "Shown" toggles, jargon | P-2 (map key) |
| 13 Pins overlap | P-2 |
| 14–21 The print's site order, rounding, acres, sun, driveway figures, jargon, units | Stays: report text (rule 7), a separate print pass |
| 22 Out-of-state cost sources | Finding 20: P-3 note |
| 23 Priced vs unpriced cost to build | P-5 (sort), stays otherwise |
| 24 Within budget's weight | Stays |
| 25 Phone grade heading, "Grade again" twice, two Driveway items, "Profile 1", the one-page preview | P-2, P-8, B-7 |
| 26 Best homesite repeats the card's letters | P-2 (numbers only there) |
| 27 Every fixture a B | J-4 |
| 28 Short headers | P-0 |
| 29 Grid scroll cue | P-5 |
| 30 Phone strip cut off | P-5 |
| 31 Compare's words differ from the card's | P-0, P-6 |
| 32 "3,543 ft, at least 1,800 ft" | P-0 ("your limit") |
| 33 Grade tab opens mid-card; "zone 3a"; "Grade again" twice; "Profile 1" | P-2, P-7, P-8 |
| 34–39 Long view, climate, privacy wording | Stays (report text) |
| 40 The ask-one interview page | Stays |
| 41 "85% clear" vs "A from 95%" | P-7 |
| 42 "Weight 5", DOIs; Try it's sheet over the columns; tilt tip | P-7; the rest stays |
| 43 The suggestions' shorthand | P-0 |
| 44 "Use as my driveway" beside "Use it" | P-9 (one way to commit) |
| 45 The struck letter | J-4 |
| 46 The answer line names a set-aside but not an override | P-2 |
| 47 "Grade the combination" disabled with no reason | Stays |
| 48 Easement panel's columns, E/S pins, "Veto" | P-2 (map key), P-0 |
| 49 Report score beside a letter; rows under the tabs; disabled Undo | P-2; the rest stays |
| 50 Two names for the area box | P-0 ("Where to look") |
| 51 Area star vs parcel star | P-0 (a pin for areas) |
| 52 Area names far out | Partly done in #304: a fit letter at every zoom, names where they fit; the "Zoom in to see parcel lines" hint still shows over outlines (P-2) |
| 53 A sample keeps "Sample parcel 1" as its name | Stays |
| 54 Toolbar status over the map buttons; the unlabelled bin; pins with no key | P-2, B-7 |

## 6. The proposal

### 6.0 Principles

1. **The answer first, then the detail.** Every place says what it concluded before how.
2. **The decisions in reach.** Each decision is one tap from where the person is looking: keep, rule out, ask,
   report.
3. **Nothing lost silently.** A grade is never thrown away by closing, and a hidden parcel says why.
4. **The map follows.** Opening a parcel, from anywhere, shows it.
5. **One word per thing** (§4.1), and the same controls in every copy of a panel.

### 6.1 P-1. The map with nothing open: search that finds the listing

![](ux-audit/after-map-desktop.jpg) ![](ux-audit/after-map-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t01-search-parcel.jpg) ![](ux-audit/shot-phone-t01-type-parcel.jpg)

- **Parcel numbers are searched in every covered county,** with the county named in each result ("Grayson Co., VA",
  not "51077"). The tax-map number a listing gives is searched alongside the record's own ID: Grayson's "63-A-62" is
  the parcel the record calls 6273.
- **Places are limited to the region around the map** (a bounding box), so Turkey and Poland don't appear.
- **Coordinates drop a pin** and open the parcel under it.
- **Opening a parcel from anywhere moves the map to it:** search, Your list, Compare, Recent. Closing doesn't zoom the
  map out.
- **Where to look stays under the box,** with its region (§6.10, J-6) and "See them on the map".

### 6.2 P-2. A parcel open: the answer, four actions, three segments

![](ux-audit/after-parcel-desktop.jpg) ![](ux-audit/after-parcel-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t01-graded.jpg) ![](ux-audit/shot-phone-t01-graded.jpg)

- **The header:** name, acres, county and tax-map number. Then the answer, with the verdict word first and the letter
  beside it (J-4), and its one-line reason.
- **One row of actions, each 44 px:**
  - **★ Add to list** / **On your list**;
  - **Not for us** (P-4);
  - **Ask Alex**, where there's a household (P-8);
  - **⋯**: Make a report, Copy summary, Remove from Your list.
- **Segments:** **Grade · Uses · Details** (Uses is step 14's third segment, with step 15 inside it; J-1).
- **The household's take sits under the actions**, with a "new" dot, not at the foot of the Grade tab.
- **Grading shows its steps while it runs** on a phone too: the sheet rises to show the step list, not just
  "Grading…".
- **The map key is a line under the map**, naming what's drawn ("1 Best homesite · the app's driveway · …"), with
  "All map marks" opening the full key. The pins outside the key stay off until asked for.
- **Every copy of a row's panel has the same controls,** Adjust included: the map's, Your list's, Compare's.
- **Best homesite shows numbers only** (polish 26); the letters stay on the card.

### 6.3 P-3. Uses: what you can do here, and how it could pay

![](ux-audit/after-uses-desktop.jpg) ![](ux-audit/after-uses-phone.jpg)
![](ux-audit/after-uses-pay-desktop.jpg) ![](ux-audit/after-uses-pay-phone.jpg)

- **Step 14's panel is the Uses segment.** The answers shown are PR 4's own, for Mud Creek.
- **Step 15's "How it could pay" is the second panel in the same segment,** under "What limits you", ending with the
  one not-advice line for both. (The rows shown illustrate the layout; step 15 writes them.)
- **A Grade shortcut:** Grade's answer gets one line, "What you can do here: 1 yes, 5 maybe, 2 no", which opens Uses.
- **Cost to build gets a note:** "Everything but the house: the house is yours to price" (finding 20). A house
  estimate isn't part of this proposal; it's a product question for later.

### 6.4 P-4. Not for us, and nothing lost

![](ux-audit/after-notforus-desktop.jpg) ![](ux-audit/after-notforus-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t02-more-menu.jpg) ![](ux-audit/shot-phone-t02-status.jpg)

- **Not for us works on any parcel,** from the header. It asks why (optional chips, an optional note), moves the
  parcel to **Ruled out** on Your list, and greys it on the map. Undo is there, and so is "Move back" from Ruled out.
- **× closes the parcel and clears it from the map; a graded parcel always stays in Recent for its 30 days** (J-2,
  Zach). Esc closes the topmost thing only.
- **Archive becomes Rule out,** so one decision has one name, wherever it's made.

### 6.5 P-5. Your list: one name, three views

![](ux-audit/after-list-desktop.jpg) ![](ux-audit/after-list-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t04-list3.jpg) ![](ux-audit/shot-phone-t04-list.jpg)

- **Views: Shortlist · Recent · Ruled out,** each with its count. "Favorites" goes.
- **One row style for all three** (polish 5). Recent and Ruled out rows say when and, for Ruled out, why.
- **Takes on the rows:** "Alex: Maybe" with a "new" dot; "Asked Alex 10/23" while waiting.
- **Compare:** the tick column is headed "Compare" (labelled on each card on a phone). The button sits in a bar along
  the bottom, next to what's ticked: "2 ticked · Compare 2 →".
- **Hidden parcels are said plainly:** "Roan Mountain is hidden: it misses your must-have Night sky · Show it"
  (finding 25), not "1 hidden by filters".

### 6.6 P-6. Compare: the card's own words

![](ux-audit/after-compare-desktop.jpg) ![](ux-audit/after-compare-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t04-compare.jpg) ![](ux-audit/shot-phone-t04-compare.jpg)

- **Sections are "Must have" and "Really want",** as on the card. The cells use "✓ pass" and "! check first".
- **On a phone, the three parcels fit across:** short column names and values that wrap, rather than one and a half
  columns and a sideways swipe.

### 6.7 P-7. What matters: plain words, a slim Try it

![](ux-audit/after-matters-desktop.jpg) ![](ux-audit/after-matters-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t09-night-sky.jpg) ![](ux-audit/shot-phone-t09-night-sky.jpg)

- **The night sky reads in what you'd see:** "The Milky Way clearly visible (zone 3b or darker)". The scale is
  A bright, B clearly visible, C faint, D washed out, and mag/arcsec² sits behind "what that means".
- **Try it on is one slim line at the top** (polish 2), not a bar over the cards on a phone.
- **Whose list it is is said** ("Sam's list: Alex has their own").

### 6.8 P-8. Household: invite a person, link a device

![](ux-audit/after-household-desktop.jpg) ![](ux-audit/after-household-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t05-start-sync.jpg) ![](ux-audit/shot-phone-t05-sync-start.jpg)

- **Household is its own item in the menu,** above Settings. It lists the members, with Rename.
- **"Invite someone":** a one-use link for a person. They open it, type their name, and join as a new member with
  their own priorities. The household's parcels are there.
- **"Link a device of yours":** today's sync code, worded for your own devices only.
- **The first run asks one thing, your name,** so nobody is ever "Profile 1".
- **"Ask Alex" appears** wherever a parcel's actions are, once there's a second member. With one member it reads
  "Ask someone" and opens Household.

### 6.9 P-9. Drawing a track and using it

![](ux-audit/after-draw-desktop.jpg) ![](ux-audit/after-draw-phone.jpg)

*Before:*

![](ux-audit/shot-desktop-t10-drawn.jpg) ![](ux-audit/shot-phone-t10-draw-line.jpg)

- **Starting a line moves the map to the parcel.** On a phone, the toolbar wraps onto two rows so Finish is always on
  screen.
- **At Finish the line's figures show** (length, average and steepest grade, against the limit), and the line asks:
  "Use it as the driveway?" (grade again, about 40 s) or "Just keep the line". That's one way to commit (polish 44).
- **After the grade, every line that quotes the driveway quotes the chosen one** (bug B-6).

### 6.10 The judgment calls

**Zach's decisions (2026-10-24): A on all six**, with these notes:
- **J-1.** Step 14's panel ships as the Uses segment, and step 15 then writes into Uses.
- **J-2.** **× closes the parcel and clears it from the map, but a graded parcel always stays in Recent for its 30
  days.** "Not for us" is the explicit header action: an optional reason, then Ruled out, greyed on the map, with
  Undo. **This supersedes 8c's "× means not for me"** (#253), by Zach's decision.
- **J-4.** The wording as proposed. Part 2's plan lists every changed string under rule 7.
- **J-5.** A correction of a fact becomes a shared mark; an opinion stays a personal override. Part 2's plan says which
  rows count as facts.

**J-1. Where step 14's Uses and step 15's "How it could pay" go.**
- **A (recommended): one Uses segment holding both panels,** so the segments are Grade · Uses · Details.
  - Three segments stay at least 110 px wide on a 375 px phone.
  - Both panels are "beyond the grade", and step 14's plan already chose a Uses segment.
  - Downside: a long scroll when both are full.
- **B: four segments, Grade · Uses · Pay · Details.**
  - Each panel has its own door.
  - The segments are 85 px on a phone, and "Pay" is a vague label.

**J-2. How a parcel is ruled out.**
- **A (recommended): "Not for us" on the header of any parcel,** with an optional reason. It goes to a Ruled out view
  on Your list, and the map greys it.
- **B: extend Details' Status to every parcel,** with "Not for us" beside Walked and Offered.
  - Smaller to build, but still four taps deep, where neither user looked first.

**J-3. How a partner is invited.**
- **A (recommended): a Household screen with "Invite someone"** (a one-use link for a person) and "Link a device of
  yours" (today's code), as two doors with two words.
- **B: keep the one sync code,** reword its warning ("for your devices and your household") and add an "Invite" entry
  that opens it.
  - Less to build, but a partner still joins through a device flow and picks "I'm new here".

**J-4. Which leads when the grade and the verdict disagree.**
- **A (recommended): the verdict leads, and the letter follows with a joining word when they part:** "Not for us · B,
  but misses a must"; "Maybe · A, held by: septic".
  - The verdict is the decision; the letter is how good the rest is.
- **B: no letter when a must fails ("—").** Simpler, but it hides how good the rest is, which Zach's household uses to
  compare.

**J-5. Whether a correction of a fact is shared with the household.**
- **A (recommended): the correction asks "Is this a fact about the parcel?"** If it is (a septic permit, a recorded
  right-of-way), it becomes a shared mark that every member's grade, the cost and the print read. If it isn't, it
  stays your override, as now.
  - The permit mark already exists (the cost's "Mark a septic permit" hint points to it).
- **B: keep overrides personal,** but print the reason and show others "Sam counts it as passed: …".
  - Less to build, but a fact stays an opinion, and each member must repeat it.

**J-6. Whether Where to look is limited to a region.**
- **A (recommended): a region, set once** ("SW Virginia, NW North Carolina, NE Tennessee" by default for this household;
  "change"). The ranking is within it, and "Show all 30" is one tap.
- **B: rank all 30 as now,** naming each area's state.
  - No setting, but the walkthrough's first reaction was "not where we're looking".

### 6.11 What this means for steps 14 and 15

- **Step 14 (in flight).** It ships its panel as the Uses segment (J-1 A, as its plan has it), with its strings as
  planned.
- **The order** (Zach, 2026-10-24):
  1. The bug-fix PR (§7) into main, B-1 first.
  2. Step 14 to its hand-back.
  3. Part 2, once that hand-back is on main.
  4. Step 15, writing its rows into the second panel of Uses, under the same not-advice line.

### 6.12 Part 2, roughly

For sizing only; the mission's plan sets the PRs. Its PR 0 (the plan) also carries the market-value research in
`docs/commercial-review.md` (Z-5), and new 375 px mock-ups for Z-2, Z-4, Z-6, Z-7 and Z-8.

| PR | What | From |
| --- | --- | --- |
| 1 | The names (§4.1) on screen; the report-text renames listed for approval (rule 7) | P-0 |
| 2 | Recent keeps every graded parcel; × closes and clears the map, never Recent; Esc closes the topmost; Not for us and Ruled out; one parcel panel everywhere (Z-2), the list's detail panel gone | P-4, P-5 |
| 3 | The parcel header and its actions; takes near the top; the map key line; the grading progress bar and a cleaner sheet header (Z-9); Adjust in every copy | P-2 |
| 4 | Search: parcel numbers everywhere with the county named, tax-map numbers, places in the region, a pin at coordinates, the map follows | P-1 |
| 5 | Household: the menu item, invite a person, link a device, the name at first run | P-8 |
| 6 | Drawing: move to the parcel, Finish in reach, "Use it as the driveway?" at Finish | P-9 |
| 7 | Your list's three views and the compare bar; the three-line phone card (Z-7); Recent's one-line rows, 50 for 60 days (Z-8); Compare's words and the phone layout; one column for marks and letters (Z-6) | P-5, P-6, P-0 |
| 8 | What matters: plain sky words, the slim Try it; double-tap zoom on phones (Z-1) | P-7, P-10 |
| 8b | The price block in Grade's Cost section: price, $/ac, camp and build, live toggles, the walk-away price (Z-4) | P-11 |
| 9 | Screenshots, the fresh-eyes review, the hand-back | |

### 6.13 What Zach's friction list changes (2026-10-24; his call wins)

- **P-2 (the parcel panel).** On a phone, grading shows a slim progress bar under the header ("Finding hospitals… 6
  of 11"), with the step list one tap away. The sheet doesn't rise to show the steps. The sheet's header is made
  cleaner.
- **P-5 (Your list).**
  - One parcel panel everywhere: a tap on a parcel in Your list, Recent, Compare or search opens it on the map, framed,
    with the standard panel. The list's own detail panel goes.
  - The phone's card is three lines: name, verdict and letter; price · $/ac · build cost; and the person's 3–4 top
    factors as chips, with failing Musts first. The legend sits behind a "?".
  - Recent is one compact line per row (name, letter, acres, $/ac, date), with ★ and ✕. It keeps 50 for 60 days.
- **P-0 (names, and now alignment).** Marks and letters share one fixed-width column in every row view, and ✎ never
  moves the verdict word.
- **P-10 (new: map gestures).** Double-tap zooms on a phone whenever no drawing tool is open (Z-1).
- **P-11 (new: the price block).** It goes in Grade's Cost section: the asking price, $/ac, Ready to camp and Ready to
  build, the optional items as live toggles, and the walk-away price for the land within the budget (Z-4).
- **Research.** Market references for land in the covered counties go into `docs/commercial-review.md`, for Zach to
  decide on later (Z-5).

## 7. Bugs found (fix whatever the proposal decides)

| Bug | What happens | Seen in |
| --- | --- | --- |
| B-1 | **The same profile grades differently on two synced devices.** Step 4's "new factor" notice (Driveway added to Nice to have "because you skipped the question") ran on the second device only, and the rubric didn't converge | `shot-desktop2-t12-sam-priorities`, task 12 on both |
| B-2 | **"A change on this device wasn't saved: New member"** right after "I'm new here" on a joined device; Try again clears it | `shot-desktop2-t05-new-here`, both |
| B-3 | **Parcel-number search misses a number in view:** "35-3" with Floyd County on screen | `shot-desktop-t02-search-35-3` |
| B-4 | **Esc closes the open parcel when a menu is open,** losing an unsaved grade | `shot-desktop-t02-status-failed` |
| B-5 | **Opening a saved parcel from search, Your list or Compare doesn't move the map to it;** closing a parcel zooms the map out | `shot-desktop-t10-open-mud`, both |
| B-6 | **After "Use as my driveway", Best homesite still quotes the app's own drive** (2,880 ft at 16%) | `shot-desktop-t10-grade-after`, both |
| B-7 | **Phone overlaps:** the draw toolbar cuts off Finish at 375 px; the toolbar sits over the map buttons with the sheet up; "Stand here" is cut off at the right edge; confirmed on Zach's phone (2026-10-24; his screenshot goes in the bug-fix PR once he posts it) | `shot-phone-t10-draw-line`, `shot-phone-t01-sheet-up` |
| (fixed) | Area popups over drawing and parcel taps; the popup's star; its 10 px close; its foot under the hint | #304, 6a2fba0 |

One more report, not reproduced: "Where to look" in the menu needing two clicks. One click opens it from Your list
and from the map.

## 8. Zach's friction list

Received 2026-10-24. Each item is in §5's table (Z-1 to Z-9) with its score. Where it changes the proposal, Zach's
call wins; §6.13 says what changes. Part 2's plan takes all of it, with new mock-ups at 375 px for Z-2, Z-4, Z-6, Z-7
and Z-8.

| # | Zach's item | Covered by |
| --- | --- | --- |
| Z-1 | Double-tap to zoom on phones | **New, P-10.** Today `ParcelTools` turns MapLibre's double-click zoom off, so a double-click can finish a drawn boundary; that also turns off double-tap zoom on a phone. A desktop's double-click still zooms, through the tilt-and-rotate handler (mouse only). Part 2 turns double-tap zoom on for touch whenever no drawing tool is open. Drawing already finishes by tapping the first corner or Finish, so nothing moves to another gesture; a double-tap only finishes a boundary while drawing one |
| Z-2 | Open a saved parcel in one tap | **Changes P-5.** One parcel panel everywhere: a tap on a parcel in Your list, Recent, Compare or search opens it on the map, with the map moved to it (B-5's fix) and the standard panel. The list's separate detail panel is deleted |
| Z-3 | The detail panel's space | Solved by Z-2. The status actions live in the header's actions and ⋯ (P-2, P-4) |
| Z-4 | A price block | **New, P-11.** It goes in Grade's Cost section (recommended over Uses: it sits beside Within budget, which it reads, and Uses stays about what the land can do and pay). It holds the asking price, $/ac on both acreages, Ready to camp and Ready to build in one block. The optional items are toggles that update the totals live: paving the steep stretches, an alternative or conventional septic, upgrading an existing drive, and others the plan finds. The walk-away price for the land is the ready-to-build budget minus the build costs without the land, shown as a range ("Pay at most $105–170k for the land to stay within your $300k budget") that moves with the toggles. With no budget, it isn't shown. Part 2's plan says whether the toggles change Within budget's grade or only the block's figures (recommendation: the block only; the grade reads the default) |
| Z-5 | Market value | **Investigate only.** Part 2's plan reports the sources that could give a defensible market reference in the covered counties (county assessed values and their reassessment years, recorded sales), with their terms, in `docs/commercial-review.md`. Zach decides later |
| Z-6 | Alignment | **Joins P-0.** The ✓ / ! marks and the letter badges share one fixed-width column, and ✎ sits beside the letter without moving the verdict word, in every view with rows: the card, the grid, the phone strip, Compare |
| Z-7 | The phone's list card | **Changes P-5.** Three lines: the name, then the verdict and letter; price · $/ac · build cost; and the 3–4 factors that matter most to this person as compact chips, with failing Musts first. The legend goes behind a "?". The desktop keeps the full strip |
| Z-8 | Recent | **Changes P-5.** One compact line per row: name, letter, acres, $/ac, date. A tap opens it (Z-2), ★ adds it to the list and ✕ removes it, with no Open on the map or Add to list buttons. It keeps 50 for 60 days (today 20 and 30, `RECENT_MAX` in `lib/client/favorites.ts`) |
| Z-9 | Grading progress, the sheet's header | **Changes P-2.** A slim progress bar under the header, with the current step in small text ("Finding hospitals… 6 of 11") and the step list one tap away. This replaces "the sheet rises to show the step list", by Zach's call. The sheet's header gets cleaner. B-7 (the toolbar over the map's buttons with the sheet up, the "Zoom in" hint) is confirmed on Zach's phone: it's fixed in the bug-fix PR |
