# Inventory: every screen, and the way to each feature

From the code at the area-grades PR's head (#304), checked against the walkthroughs. UX audit §2. "D" is a desktop
(1280 wide); "P" is a 375 px phone in portrait. A tap count starts on the map with nothing open, and counts every tap
or click, but not typing.

## Breakpoints

The phone layout is `(max-width: 860px) and (orientation: portrait)`. It gives:
- the bottom tab bar with More;
- the results as a bottom sheet;
- Search as an icon.

Everything else, including a phone held sideways, gets the desktop layout: the 44 px top bar with ☰ and the docked
380 px panel.

Your list switches from its table to cards at 700 px, and that switch has no orientation test. So a portrait tablet
701–860 px wide gets the phone's tab bar and sheet with the desktop's table. Other rules switch at 860 (Recent's rows),
767 (the quick-filter chips) and 560/600 px.

## Places and screens

| Route or layer | What the person sees | For |
| --- | --- | --- |
| `/` | "Opening Parcel Screen…" | Sends you to Your list if you have favorites, otherwise the map |
| `/explore` | The map (no heading) | Kept mounted behind the other places |
| `/library` | "Your list": Favorites and Recent | Filters, sorts, the grid (desktop) or cards (phone), compare ticks |
| `/compare` | "Compare" | 2–3 favorites side by side |
| `/priorities` | "What matters to you" | The rubric: four columns, card sheets, Try it on |
| `/interview` | "A few questions", 14 of them, then the result screen | The first-run interview; `?ask=` a single new question |
| `/help` | "Help": Reading a parcel's report, How grades work | Two sections and a contents list |
| `/parcel/[key]/report` | "Report card": One page or Full, Print or save as PDF | The export. There's no nav bar here, only ← Back |
| `/link#code`, `/who` | "Sync across devices", "Who's this?" | Joining a synced space |
| Menu (☰ on a desktop, More on a phone) | Profile ▾, Answer a few questions*, Where to look, Help, Settings | *Only shown until the interview is answered |
| Settings dialog | Your data, Thresholds, Costs, Driveway estimate, Budget, Drive-time anchors, Data endpoints, Time zone; "Sync across devices" opens over it | |
| Where to look dialog | The area box, from the menu (#304) | |
| The parcel panel (docked on a desktop, a sheet on a phone) | Header (name, acres, grade, Add to list, ⋯, ×); Grade \| Details | The card, row panels, Full report ▸, Steps ▸ |
| Map layers | Basemap, On the map, Results on the map, What's on the map, Terrain preview | |
| Toolbar | Boundary ▾ (Parcel, Custom, Split), + Mark, Grade, trash, acres ▾ | Mark picker: Build, Ways in, Water & utilities, On the land |
| Ground viewer | "Standing at …" | Needs a shown result |

## Paths and tap counts

| Feature | D | P | Needs |
| --- | --- | --- | --- |
| Search (coordinates, number, place, listing link) | 1 (the box is always there) | 1 (the Search icon) | Parcel numbers only search **the counties in view** ("Zoom in on the county…"). A place, coordinates or a listing only moves the map; you still tap the parcel |
| Select a parcel | 1 | 1 | Not while a grade runs; "No parcel record here" otherwise |
| Draw a custom parcel | 1, then ≥3 corners, then Finish | same | The tab bar steps aside on a phone |
| Grade a parcel | 2 | 2 | Hidden on sample parcels. After a run it only shows with a reason ("Grade again: …") |
| A row's panel | 2 | 3 (raise the sheet) | A graded parcel |
| How grades work | 2, from the grade | 3 | Also from Help, Your list's count line, What matters |
| **Not for me / dismiss** | 2 (header ×) | 2 | **Only for a parcel you built that isn't on the list.** The × means "close and clear it from Recent", which only its tooltip says; its label is "Close this parcel" |
| Archive ("Not for us") | 4: Details → Status → Archive… → Not for us | 5 | **Favorites only** |
| Add to list | 3: parcel, Add to list, Add | 3 | |
| Your list | 1 | 1 | Remembers Favorites or Recent |
| Compare | 4: Your list, tick 2, Compare | 4 | Favorites tab only. The button shows at the first tick, top right |
| **Ask a member for a take** | 3: parcel, Ask X, Ask | 4 | **≥2 profiles, so the household must exist first; a built parcel; a result.** It sits at the foot of the Grade tab |
| See takes | Your list badge, a row's dot, the New takes chip | same | Favorites only. "Seen" is kept per device |
| Where to look | 0 (in the empty panel); 2 from the menu | 1 (Search icon), or 2 from More | The panel's box only shows with nothing open |
| Area outlines | 2 (Map layers, Area outlines); 3 to a card | same | |
| **Adjust a row (override)** | 4: parcel, row, choice, Save | 5 | **Your own grade, the map's panel only: not in Your list's detail, Compare or print** |
| Ways to raise this grade | 2–3 | 3–4 | Your own grade, when a suggestion exists |
| Export a report | 4: parcel, ⋯, Report card, Print | 4 | Graded, with a key. Print waits for the map's tiles |
| What matters | 1, then 2 to a card | same | |
| Change a priority and see grades | 2–3, then Map and the parcel (4–5) | same | Try it on shows one parcel |
| **Draw a track** | 3–4: parcel, + Mark (or Details, Draw a line), kind, points, Finish | same, 1 more to find the parcel | The map doesn't move to the parcel |
| **Use a track as the driveway** | Details, the line's row, Use as my driveway (+2) | same | **Only after a grade that included the line**, so another grade (40–55 s) first |
| Cost to build | 2: parcel, Ready to build | 3 | The driveway routed. Rates are in Settings → Costs |
| **Join a second device** | Menu, Settings, Sync across devices, Start syncing (4); on the other device Join with a code, the code, Join, Join, Who's this? (5+) | same | |
| **Household setup** | There's no screen for it. Menu, Profile ▾, Add a profile (3), or "I'm new here" after joining with the sync code | same | |
| Settings | 2 | 2 | |
| Help | 2 | 2 | |
| Map layers | 1 | 1 | |
| 3D / ground viewer | 1 / 2 | 1 / 3 | A shown result |
| Split | 3: parcel, Boundary ▾, Split, then 2 taps for the cut, 1 for the side | same | A derived parcel; not on samples |
| Listing import | Paste a link in Search (1), Go to (2), tap the parcel (3), the Attach chip (4) | same | |
| Your data (export, import) | 3 | 3 | |

**Reachability that depends on state** (bold above):
- **Ruling a parcel out.** The "not for me" × works only for a built parcel that isn't a favorite. Archive works only
  for a favorite. Nothing does it for a parcel that's only in Recent.
- **The household.** Asking for a take needs two profiles. The second profile comes from Add a profile (same device)
  or from joining through the device-sync code.
- **Adjusting a row** only works in the map's panel.
- **Use as my driveway** only appears after a grade that included the line.
- **Where to look** only shows in the empty panel, or from the menu (#304).

## Names: one thing, several words

1. **The list.** It's called "Your list" (the tab, the h1, "← Your list"). The button says "Add to list" / "On your
   list", but the sheet it opens is "Add to favorites", the star says "Add to favorites / In favorites", the tab is
   "Favorites" and so is Search's group. Elsewhere it's "Remove from favorites", "Re-screen all saved parcels", and
   "history" in the code for Recent.
2. **Priorities.** "What matters" (the tab), "What matters to you" (the page), "Your priorities" (the interview
   result's aria label), "Whose weights grade the parcel" / "Whose priorities rank the areas" (the same switch),
   "Replace my rubric too", "the starting list".
3. **Grade, screen and run.** "Grade this parcel", "Grading…" and "Grade again" sit beside "Tap a parcel to screen it",
   "Screening — finish or Cancel first", "The screen stopped", "Not screened yet", "Needs a re-screen", "Re-screen all",
   "run again to show" and "re-run".
4. **Grade, fit and score.** Areas show "Fit C+" under a chip that says "Your grade". A panel has "How it's scored", and
   the report has an "overall" score. "How Julie would rate it" vs "Julie's grade".
5. **Verdict words that mean other things.** The verdict "Not for us" (code: `Pass`) vs the × tooltip "Not for me" vs
   Archive's "Not for us". A Must's "Pass" is good; the verdict `Pass` is bad. "Maybe" is both a verdict and a take.
6. **A warning Must.** "Check first" (the card, Your list's key) vs "Warning" (row panels, Compare's key) vs "warns".
7. **Must have.** "Must have", "Must haves", "must-haves", "dealbreaker", "limit", "minimum", "every must"; Compare
   calls the section "Dealbreakers" and Really want "What money can't add".
8. **The easement factor.** The row reads "Driveway on your land", its panel is titled "Easement needed", the grid
   header says "Own drive", and the mark kind is "Easement".
9. **The report.** "Report card" names both the on-screen card and the print page. "Full report ▸" vs the print's
   "Full". "Still unknown" vs "Questions for the agent" vs "More to check that no dataset covers".
10. **Sun, sky and sites.** "Night sky" vs "Dark skies". "December sun" vs "Winter sun and the horizon". "Best
    homesite", "Best site and alternatives", "Other sites", "Site #N", "Where to build". "Drive times" vs "Getting
    there and getting out".
11. **Lines.** "Lines & marks", "Lines and marks", "Your lines and marks", "Your lines". To draw one: "Draw a line" or
    "+ Mark".
12. **Boundary.** "Draw a custom parcel" vs "Custom" vs "Draw the boundary instead". Combining is "Parcel" vs "Edit
    parcels" vs "Grade the combination".
13. **Delete vs Remove** for the same act ("Delete this parcel?" in the toolbar, "Remove this parcel…" in Details,
    "Remove from the list" in Your list). In Compare, "Remove" only drops the column.
14. **Asking.** "Ask Julie" and "Your take" vs "How Julie would rate it" vs "Julie's grade" vs "Julie says Yes".
15. **People.** "Profile", "Switch profile", "Add a profile", "New member", "one profile per person", "Household
    verdict", "Lowest of our grades".
16. **Areas.** "Where to look" vs "Areas that fit you". "Show me a parcel here" opens a "Sample parcel".
17. **"Try it"** means the rubric preview, and it also means trying a line as the driveway.
18. **Two budgets.** Settings' "Budget: ready to build" leaves the land out and drives the "no practical drive" rule.
    The interview's "Ready to build, all in" includes the land and is graded as "Within budget".
19. **Map layers.** Its button's title is "Basemap and map layers" and its close button says "Close the map panel".
    Its three groups are "On the map", "Results on the map" and "What's on the map".
20. **Help.** "How to read this" (the dialog) is the same text as "Reading a parcel's report" (the page). Grade help
    goes by "How grades work", "How it's scored" and "What does this mean?".

## The same thing in several places

- **"Grade again"** shows three times: the toolbar or sheet button, the card's stale banner, and "Grade again to
  restore the map overlays".
- **Removing a parcel:** the toolbar's trash, Details' "Remove this parcel…", and Your list's "Remove from the list".
- **Unstarring:** the header's "★ On your list", the row's star, and the row ⋯'s "Remove from favorites".
- **Every report section** is in the row panels and again in Full report.
- **"Still unknown"** is on the card, in Full report, and in the Cost to enjoy panel.
- **Choosing the driveway:** Details' "Use as my driveway", the Easement panel's Try it / Use it, and Ways to raise's
  Try it.
- **Where to look** is in five places: the docked panel, the phone's empty search, the menu dialog, the interview's
  result, and the map's popups.
- **The interview** has five ways in.
- **The report card** is drawn in four places: the map's panel, Your list's detail, Compare, and print. Only the map's
  copy can adjust a row.
- **The grade** shows in the header chip, the answer, the dock tab, and the phone's peek.
- **The sync state** shows in the top bar, the More sheet, the toast, and Settings.

## Glyphs and icon buttons

- **×** closes (panels, the picker, the viewer), dismisses (hints, chips), means "Not for me" (the header, which also
  clears Recent), deletes a line at once (Details), and removes from Recent.
- **✕** closes a row panel, and it's also the map's "site left out" pin.
- **★** means "on your list" for a parcel and "pin its outline" for an area.
- **›** reopens the panel, and also shows an area.
- **▸ and ▾** expand ("Full report ▸", "Steps ▸"), open a menu ("Boundary ▾", "Columns ▾"), and switch to Details
  ("acres ▾").
- **▲** is a sort direction, and also marks this parcel's value on a scale.
- **?** is help, and also an unknown Must.
- **–** means no grade, no data, and set aside.
- **!** is "check first" on Your list and "warning" in Compare.
- **"Best"** is ● in Your list's grid and ↑/↓ in Compare.
- **Missing labels:** the reverse-sort ⇅ has no title. The menu's ☰ has no aria-label: it has a screen-reader span on
  a desktop and "More" on a phone. The header × hides "Not for me" from its label.
- **Eye toggles:** the line row's eye uses `aria-pressed={hidden}` while AnalysisGroup's uses `aria-pressed={on}`.

## Empty, loading, error and slow states

| Screen | Missing or wrong |
| --- | --- |
| `/` | ProfileGate renders nothing until boot: the first paint is blank |
| Map | No loading state for the map itself (dynamic import with no `loading`). A grade shows only "Grading…" with "…" placeholders for 22–55 s on a phone, where the step list only appears afterwards |
| Map (phone) | "Tap a parcel to screen it" is effectively never visible (the sheet is hidden with nothing open) |
| Where to look | Its skeleton cards have no text |
| Your list | No loading state for the saved results: until IndexedDB answers, grades show "–" and a row's detail says "Not screened yet" |
| Compare | Cells say "not screened" while results load; there's no error state |
| Help / rulebook | "Screen a parcel from the map" also shows while results load |
| /who | No error state |
| Settings | No confirmation after Save; the dialog just closes |

Strings that are defined but never used: `AREA_WORDS.noRubric`, `AREA_WORDS.parcelScale`, `RESCREENS_ON_OPEN`.

## Navigation

- **Desktop:** a 44 px top bar with "Parcel Screen" (a link to `/`, which redirects), the tabs Map, Your list [badge]
  and What matters, then the sync state and ☰. Compare marks Your list; Help, /who and /link mark nothing.
- **Phone:** a bottom bar of Map, Your list [badge], What matters and More, with no brand. The bar steps aside while a
  map tool is on or a note is being typed.
- **The menu:** the one-time old-data note, the sync state (phone only), the profile picker, "Answer a few questions"
  (until answered), Where to look, Help, Settings.
- **The Your list badge** counts takes waiting for you plus new takes, favorites only.
