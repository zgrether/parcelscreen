# Step 4b: Navigation

A short step between 4 and 5 (owner, 10/18), added to `PLAN.md`'s roadmap as "4b. Navigation". Written 2026-10-18
under mission mode (`CLAUDE.md`). **Waiting for approval: no code until then.** The mission runs on
`step/4b-navigation`, branched from main once this plan is approved and step 4's fix round (#184) is on main: this
step assumes that round's rule that the questions leave the menu once answered.

**The problem (Zach):** the ☰ menu lists Your list, Compare parcels, What the grade means, My priorities, Answer a few
questions, How to read this and Settings, with History and Export/Import above them. That mixes places, actions, help
and settings in one drawer, and on every page but the map it's reached through a "← Map" link first.

Done when:
- The app has **three places**, always one tap away: **Map**, **Your list** and **What matters**. On a phone they're a
  bottom tab bar; on a desktop, a slim top bar. The place you're in is clearly marked.
- **Compare** is an action on Your list (tick 2 or 3 parcels, then Compare); the page stays, reached from the list.
- **Help** is one page: how to read a parcel's report, then what a grade means. Every `/rulebook#rule-<panel>` link
  still lands on its rule.
- **Settings** gains **Your data**: Export file and Import file, out of the menu.
- The **☰ menu** holds only the profile picker, Help and Settings.
- On a phone at 375 × 667, with a screened parcel open, nothing overlaps: the tab bar, the results sheet, the parcel
  toolbar and the map's buttons each keep their own space.

## 0. What's there today (found while planning)

- **The drawer** (`components/Explore/Menu.tsx`) is opened by ☰, a floating button at the map's top left (on the map
  only). It holds:
  - the profile and its picker;
  - History (every parcel built in this profile, with Open and Remove) and Export file / Import file;
  - links to Your list, Compare parcels, What the grade means, My priorities and the questions;
  - buttons for How to read this (a dialog) and Settings (a dialog).
- **Pages:** `/explore` (the map), `/library` (Your list), `/compare`, `/priorities` (What matters to you), `/rulebook`
  (What the grade means), `/interview`. Each page but the map has a header with "← Map", its title and the profile
  picker.
- **Where the app opens** (`app/page.tsx`, owner #128): Your list when a parcel isn't archived, else the map.
- **Your list already does Compare:** its rows have a Compare tick, and "Compare 2" opens `/compare` with those
  parcels. The menu's "Compare parcels" link is a second way in, which opens every History parcel.
- **Your list already has every History parcel,** with Open on the map and Remove (in a parcel's detail). The
  menu's History is a second list of the same parcels.
- **Help is in two places:**
  - "How to read this", a dialog (`components/Help/HelpDialog.tsx`), with anchors `h-verdict`, `h-sun`, …, which each
    report section's "?" opens at its notes;
  - "What the grade means", the `/rulebook` page, with anchors `rule-<panel>`, which each card panel's "How it's
    scored" links to (`rulebookHref`).
- **Settings** is a dialog with Save and Cancel over a form (`components/Settings/SettingsDialog.tsx`).
- **The phone's map chrome** (portrait, ≤ 860 px):
  - The results panel is a **bottom sheet** over a full-height map. It snaps at 92 px (the peek), 46% and 88%, and
    below 110 px it's in map mode, with its content hidden.
  - The **parcel toolbar** floats 18 px above the sheet, and the map's hint above the toolbar.
  - The **map buttons:** ☰ and Search at the top left; a column at the right, from 52 px down (the compass, tilt and
    the map panel's button).
  - The **mark picker** and the **ground viewer** cover the screen from the bottom.
  - Every bottom offset is written as `calc(var(--sheet-h) + …)` inside `.explore`.

## 1. The places and their labels

| Place | Tab label | Page heading | Route | What it's for |
| --- | --- | --- | --- | --- |
| Map | **Map** | (the map) | `/explore` | Find, draw and screen a parcel. |
| Your list | **Your list** | Your list | `/library` | The parcels you've saved: their grades, status and order; Compare. |
| What matters to you | **What matters** | What matters to you | `/priorities` | What a parcel is graded on, and the questions behind it. |

- **"What matters"** is the tab's short form of the page's name, so the label and the heading agree (§11 Q2). "My
  priorities" goes from the UI.
- **Icons with the labels** on the phone's tabs: a map pin, a list, a slider. There are no icons on the desktop bar.
- **The place you're in:** its tab is ink-coloured with a 3 px bar (top edge on a phone, bottom edge on a desktop) and
  `aria-current="page"`. The others are muted. Compare counts as Your list; Help and Settings count as none.
- **Where the app opens** stays as today (§11 Q3): Your list once there are parcels, else the map. "Home" is the
  first tab, not the opening page.

## 2. A phone (375 px): the tab bar and the map

- **A bottom tab bar** with the three places and a fourth item, **More** (☰), which opens the menu (§4, §11 Q1). It's
  56 px tall plus the safe-area inset, opaque (paper) with a top rule, each tab a 25%-wide target.
- **The map gives up 56 px, not more.** The app's frame becomes "content above, tab bar below": `.explore` ends at the
  tab bar's top edge, so every offset written inside it (`--sheet-h`, the toolbar, the hint, the mark picker) stays
  right without being rewritten. The floating ☰ on the map goes (it's the More tab now), and Search moves into its
  place at the top left.
- **The results sheet sits on the tab bar,** not over it. Its peek (92 px) shows the parcel's one-line header just
  above the tabs, and its 88% snap stops below the top. Dragging the sheet never moves the tab bar.
- **The tab bar steps aside** (§11 Q8) while a map tool is in use (drawing, splitting, placing a mark or a line), as
  the sheet already does. The tool's own bar takes its place, and the tabs come back when the tool closes. The mark
  picker and the ground viewer cover it as they cover the sheet today.
- **The check at 375 × 667,** with a screened parcel open (Mud Creek):
  - the tab bar's 56 px;
  - the sheet at its peek (92 px) and at 46% of the space above the tabs;
  - the toolbar 18 px above the sheet;
  - Search at the top left (where ☰ was, it moves left) and the right-hand column of map buttons;
  - no two of them overlap, at either snap. The e2e measures this (§13).
- **The other pages** keep their headings, but lose "← Map" (the Map tab is there) and the profile picker (it's under
  More). Their content scrolls above the tab bar. What matters to you's Try it bar sits on the tab bar, the same way
  the sheet does.
- **The interview** has no tab bar (§11 Q7). It's a focused flow with its own Back, Skip and "Not now", and its result
  links to the map and to What matters to you.

## 3. A desktop (1280 px): the top bar

- **A slim top bar,** 44 px:
  - left: "Parcel Screen" (a link to the opening page), then the three places as text tabs;
  - right: ☰, which opens the same menu as a small panel (§4).
- **The map gives up 44 px.** The side panel and the map keep their layout below it.
- **The pages** lose "← Map" and their own profile picker, as on a phone.
- **The interview** has no top bar.

## 4. The ☰ menu

- **Three things:** the profile (the current one and the picker: switch, rename, delete, Add a profile), **Help**, and
  **Settings**.
- **On a phone** it's the More tab's sheet, rising from the bottom. On a desktop it's the drawer it is today, from the
  top bar's ☰.
- **Gone from it:**
  - History: Your list holds the same parcels, with Open on the map and Remove (§11 Q4);
  - Export file and Import file: they move to Settings (§7);
  - the links to the places, which are the tabs now;
  - Compare parcels: it's on Your list (§5);
  - the questions, as step 4's fix round already does once a profile has answers. A profile with none still gets
    "Answer a few questions (about 4 min)" here, until it answers.
- **The one-time "Saved with an older version" line** (step 2) stays at the top of the menu.

## 5. Your list and Compare

- **Compare is an action on Your list:**
  - Each row (each card on a phone) has a tick.
  - With 2 or 3 ticked, a **Compare** button shows the count ("Compare 3"); a fourth tick isn't offered (§11 Q5).
  - Compare opens `/compare` with those parcels.
- **The Compare page** stays as it is, under the Your list tab, with "← Your list" in place of "← Map". Opened with
  nothing ticked (an old link), it says "Tick 2 or 3 parcels on Your list to compare them", with a link back.
- **No other change to Your list.** Its empty state (no parcels yet) points to the Map tab: "Find a parcel on the
  map, screen it, and it's kept here."

## 6. Help

- **One page, `/help`, titled "Help",** in two sections:
  1. **Reading a parcel's report:** the text of "How to read this", unchanged, with its anchors (`h-verdict`, `h-sun`,
     …);
  2. **How grades work:** the rulebook's page, unchanged, with its anchors (`rule-<panel>`).
- **The old links keep working.** `/rulebook` redirects to `/help`, keeping its `#rule-<panel>` fragment (browsers
  carry a fragment across a redirect), so every "How it's scored" link lands on its rule. `rulebookHref` points at
  `/help#rule-<panel>` directly.
- **A report section's "?"** still opens its notes in place, in the dialog, so you don't leave the parcel (§11 Q6).
  The dialog gains one link at its foot: "All of Help".
- **Reached from** the ☰ menu's Help, the dialog's "All of Help", and What matters to you's "How grades work" link
  (which today says "What the grade means").

## 7. Settings: Your data

- **A last section, "Your data",** in the Settings dialog:
  - **Export file:** "Save every parcel in this profile to a file: a backup, or to move them to another browser."
  - **Import file:** "Add the parcels from an export file to this profile."
- **They act at once:** Export downloads, and Import runs today's import with its summary. They're not part of the
  form's Save and Cancel, and the section says so ("These don't wait for Save").
- **Nothing else in Settings changes.**

## 8. What matters to you: the questions and, later, the household

- **The questions** sit on this page only, once answered (step 4's fix round): one line under the intro, beside the
  two Reset buttons. It reads "Finish your questions (6 of 14)" while the interview is part done, else "Answer the
  questions again". It moves out of the page's header into that row, so the header holds only the heading (the
  profile picker leaves for More).
- **The household (step 5)** goes at the top of this page, above the intro: a row of names, "Yours · Julie's · Add
  someone". Choosing a name shows that person's list read-only, as step 5 will define. That row is step 5's to build;
  this step leaves room for it and builds nothing.

## 9. UX

- **The main flows, in the fewest steps:**
  - see your saved parcels: one tap (Your list);
  - change what you care about: one tap (What matters);
  - learn what a grade means: two taps (More, then Help), or one tap on a report's "?" or "How it's scored".
- **What you see first:** the tab you're in, marked; on the map, the map.
- **Plain labels, no jargon:** Map, Your list, What matters, More, Help, Settings, Your data, Export file, Import
  file, Compare. Gone: "Compare parcels", "What the grade means" (now a Help section, "How grades work"), "How to read
  this" (a section, "Reading a parcel's report"), "My priorities" and "History".
- **Phone at 375 px:** the tabs are each 25% wide and 56 px tall; More's sheet items are at least 44 px; nothing
  scrolls sideways. The 375 × 667 check is in §2.
- **Keyboard and screen readers:**
  - the tab bar and the top bar are a `<nav aria-label="Places">` of links, with `aria-current="page"` on the place
    you're in;
  - More and ☰ are buttons with `aria-expanded`, and their menu traps focus, closing with Escape.
- **States:** no profile data yet (a first visit) leaves the tabs as they are; a page loading shows its heading. The
  interview has no navigation (§2).
- **Contrast and consistency:** the bars use the paper and ink colours and the rule line; the active marker is the
  same green as the app's other active states.

## 10. Numbers and text that may change (the declaration)

- **No numbers:** no `config.ts`, expected.json, schema or engine change.
- **No report or card text changes.** The help text and the rulebook's text move to one page unchanged.
- **UI text:**
  - **new:** the tab labels, More, the page title "Help" and its two section headings, Settings' "Your data" and its
    two lines, "All of Help", Compare's "Tick 2 or 3 parcels…", Your list's empty-state line;
  - **gone:** the menu's place links, History, "Compare parcels", "My priorities", every page's "← Map" (Compare's
    becomes "← Your list"), What matters to you's "What the grade means" link (it becomes "How grades work").
- **Storage:** none. `ps.compare` stays as it is (the ticked parcels).

## 11. Questions for Zach

1. **The phone's menu:** a fourth tab, **More** (☰), so the profile, Help and Settings are one tap from every page
   (recommended)? Or keep ☰ as a floating button on the map only, and give the other pages none?
2. **The third tab's label:** "What matters" (recommended: the page's name, shortened to fit), or "Priorities"?
3. **Where the app opens:** keep "Your list once there are parcels, else the map" (recommended), or always the map?
4. **History leaves the menu:** Your list holds the same parcels with Open on the map and Remove, so is there no
   separate quick switcher (recommended)?
5. **Compare caps at 3 ticks** (recommended, as you proposed)? Today the list allows more.
6. **A report's "?"** keeps opening its notes in a dialog over the parcel, with "All of Help" at its foot
   (recommended)? Or should it go to the Help page?
7. **The interview has no tab bar** (recommended: a focused flow with its own way out)?
8. **The tab bar steps aside** while a map tool is in use (recommended, as the sheet does)?
9. **The URL `/help`,** with `/rulebook` redirecting (recommended)?

## 12. Stop conditions (push what's there, say why, wait)

- A change would alter expected.json, a grade, a verdict or report text.
- The 375 × 667 check can't be met without shrinking the sheet's snaps or the toolbar (a product decision).
- The same CI failure survives three attempts.
- The plan turns out wrong (for example, a `#rule-` link that the redirect can't keep).

## 13. The PRs, into `step/4b-navigation`

| PR | What | Checks |
| --- | --- | --- |
| 1 | **The frame:** the phone's tab bar (with More) and the desktop's top bar; the map's frame ending at the tab bar; the floating ☰ gone; the pages losing "← Map" and their profile picker; no bar on the interview; the tab bar stepping aside for map tools. | e2e: each place one tap away at 1280 and 375; `aria-current`; **no overlap at 375 × 667** with Mud Creek screened, the sheet at its peek and at 46% (bounding boxes of the tab bar, the sheet, the toolbar and the map buttons); a map tool hides the tabs. The e2e that reached pages through the menu go through the tabs. |
| 2 | **The menu and Settings:** ☰ / More with the profile, Help and Settings; Settings' Your data with Export and Import (moved from the menu); History gone (the profile e2e's History steps move to Your list). | e2e: the menu holds three things; Export and Import from Settings round-trip a profile; the profile picker from More. |
| 3 | **Help, Compare and What matters to you:** `/help` with its two sections and the `/rulebook` redirect keeping fragments; the "?" dialog's "All of Help"; Compare from Your list's ticks (2–3), its "← Your list" and its empty line; the questions' line on What matters to you. | e2e: a "How it's scored" link and an old `/rulebook#rule-trails` land on the rule; Compare with 2 and 3 ticks, and no fourth; the questions' line. |
| 4 | **The screenshots, the fresh-eyes review, the docs and the hand-back:** every page at 1280 and 375; the review (§14); REQUIREMENTS and §9.55. | Full CI on the step branch's head. |

## 14. Test plan outline

**e2e (CI):**
- the three places from each page, at 1280 and 375;
- the active place marked;
- the no-overlap check at 375 × 667;
- a map tool hides the tabs;
- the menu's three things;
- Export and Import from Settings;
- Help's sections and the `/rulebook#rule-…` redirect;
- Compare from the list (2–3);
- the questions' line on What matters to you.

**Screenshots (the hand-back), each at 1280 and 375:**
- the map with no parcel;
- the map with Mud Creek screened, the sheet at its peek and at 46%;
- Your list, with two ticked and Compare;
- Compare;
- What matters to you;
- Help, at the top and at a rule;
- Settings with Your data;
- the ☰ menu (More's sheet on a phone).

**Fresh-eyes review (CLAUDE.md):** a subagent that hasn't seen the code or the plan gets the screenshots and the
question "Where would you go to (a) see parcels you saved, (b) change what you care about, (c) learn what a grade
means?". Its answers, and what was fixed, go in the hand-back.

**Manual, on the preview (about 20 minutes, desktop then phone), using the fixture parcels by name:**
1. Open the preview with saved parcels (import the fixtures if needed) → it opens on Your list, its tab marked.
2. Tap Map → the map; screen **Mud Creek** → the sheet's peek sits on the tab bar; drag it to 46% and 88% → the tab bar
   doesn't move, and nothing overlaps.
3. Draw a boundary → the tabs step aside; finish → they're back.
4. Your list → tick **Mud Creek** and **Ferney** → Compare 2 → the table; tick a third → Compare 3; a fourth isn't
   offered.
5. What matters → the questions' line and the two Resets; "How grades work" → Help at its second section.
6. On **Macks**, a card panel's "How it's scored" → Help at that rule; open an old `/rulebook#rule-trails` link → Help
   at Trails.
7. More (☰) → Profile, Help, Settings only; Settings → Your data → Export file → a file downloads; Import it into a
   new profile → the parcels arrive.
8. Phone: steps 1–7 at 375 px; every tab and menu item easy to tap; nothing scrolls sideways.

## 15. Decisions to record in `phase-0.md` §9 (in the PRs)

- **§9.55 Navigation:**
  - three places as tabs (Map, Your list, What matters), plus More on a phone and ☰ on a desktop;
  - the menu reduced to the profile, Help and Settings;
  - History gone, Your list in its place;
  - Compare from the list (2–3);
  - one Help page with the `/rulebook` redirect;
  - Settings' Your data;
  - the tab bar stepping aside for map tools and absent from the interview.
