# Walkthrough: desktop

The first-time user's own report, unedited (UX audit §3). Shot names refer to the walkthrough's screenshots; the ones the
audit cites are in this folder as `shot-<name>.jpg`.


## Task 1: Find Mud Creek and find out whether it's any good for us

**Outcome:** done

**Steps:**
1. App opened on a satellite map of the region with a left panel "Where to look", ranking 30 areas (Highlands and Cashiers A-, ...). Search box at the top says "Coordinates, parcel number, place, listing link...". (`desktop-reset`)
2. Typed the tax parcel number "63-A-62". The dropdown said "Parcel numbers: Zoom in on the county to search its parcel numbers", and under Places offered a street in Turkey, a trail in Ohio, Vancouver, Quebec, Colombia. (`desktop-t01-search-parcel`)
3. Typed the coordinates "36.5854, -81.5620" instead; got "Go to 36.5854, -81.562". (`desktop-t01-search-coords`)
4. Picked it. The map zoomed in to contour lines and parcel lines next to "Mud Creek Lane", but no pin shows where my point is; the left panel still shows "Where to look". (`desktop-t01-go-coords`)
5. Clicked the middle of the map, guessing my point is the centre. A parcel outlined in orange, panel shows "6273, 30.15 ac" with a Details tab open (listing fields, notes, boundary: Grayson County, 29.31 ac plus a 0.61 ac road strip). Bottom bar has "Grade this parcel". (`desktop-t01-tap-parcel`)
6. Clicked "Grade this parcel". Map filled in with site markers (S1..S5, G1, "Stand here") while the panel stayed on Details. (`desktop-t01-grading`)
7. Switched to the Grade tab: a checklist of steps (Pull elevation ... Route drive times) with green dots, "Grading...", a best homesite. (`desktop-t01-grade-tab`)
8. After about 48 s: **B, Contender**. "Strong elevation and winter sun; 0.1 ac of garden ground, under your 0.25 ac; check first: septic." Cost to enjoy: ready to camp $15-53k, ready to build $145-410k plus the land. Must haves: flood pass, road access pass, driveway on your land pass, septic warn. (`desktop-t01-graded`, `desktop-t01-scroll`)

**Wrong turns:**
- Searched by tax parcel number first (that's what the listing gives). It wanted me to zoom in on the county first, and offered places in Turkey and Canada. Went back and used the coordinates.
- After "Go to" coordinates I had to guess where the point was: no pin dropped.

**Time to find:** 5 actions to the parcel (`desktop-t01-tap-parcel`), 7 to a grade (`desktop-t01-graded`).

**Your words:**
- "Zoom in on the county? I don't know where the county is on this map, I just have the parcel number." (`desktop-t01-search-parcel`)
- "Why is it offering me Kahramanmaraş?"
- "OK, it zoomed... but where's my point? Which of these parcels is it?" (`desktop-t01-go-coords`)
- "Parcel ID 6273? My listing says 63-A-62. Is this even the right one?" (`desktop-t01-tap-parcel`)
- "I pressed Grade but the panel is still showing me listing fields." (`desktop-t01-grading`)
- "What are the red lines shooting out from site 1 across the whole map? And the red X by the road?" (`desktop-t01-graded`)

**Confusing things:**
- Parcel-number search needs you to already be zoomed into the county; the hint doesn't say which county or offer to zoom.
- Place results from other countries for a numeric search; long place names wrap badly and are cut off at the right edge ("British", "Santa") (`desktop-t01-search-parcel`).
- No marker for a coordinates search.
- Parcel ID shown (6273) does not match the tax map number in listings (63-A-62).
- A newly picked parcel opens on Details, not Grade, and grading does not switch to the Grade tab.
- Lots of unexplained map marks after grading: E1/E2/E3, S4/S5, numbered 1-4, a red X, yellow winding line, two long red straight lines leaving the parcel. No legend except the "House high/low" colour bar.
- The bottom bar has a bare trash-can icon with no label next to the acreage.
- Site S1 marker hides under the "1" marker and "Stand here" label.

## Task 2: Macks Mountain is not for us; get it out of the way

**Outcome:** partly (removed it from "Recent", but found no way to mark it "not for us" or hide it on the map)

**Steps:**
1. Searched the coordinates "36.9349, -80.6314" and picked "Go to". The map moved, but the panel still showed Mud Creek's report. (`desktop-t02-go-macks`)
2. Clicked the map centre: parcel "35-3, 292.01 ac", Floyd County. A toast said "6273 is in Recent. Reopen it". (`desktop-t02-tap-macks`)
3. Graded it: B, Maybe. "Held at Maybe by: Legal road access and Septic." Best homesite is "Site #3", but "The map's sun, sky and driveway are for site #1, where the screen ran." (`desktop-t02-graded`, `desktop-t02-graded2`)
4. Opened the "..." menu looking for "not interested" / "hide": it only has "Report card". (`desktop-t02-more-menu`)
5. Pressed Escape to close the menu and switched to Details: the whole parcel closed and the panel went back to "Where to look". (`desktop-t02-status-failed`)
6. Tried searching the parcel number "35-3" while zoomed in on Floyd County: "No parcel numbers start with "35-3" in the counties in view." Places offered an elementary school in North Carolina and roads in West Virginia. (`desktop-t02-search-35-3`)
7. Went to Your list: Favorites empty; Recent shows only Mud Creek (6273). Macks, which I'd just graded, isn't there. (`desktop-t02-your-list`, `desktop-t02-recent`)
8. Went back to the map, searched the coordinates again, clicked: 35-3 opened ungraded ("Grade this parcel" again). The grade was lost. (`desktop-t02-reopen-macks`)
9. Looked through Details for a status like "Passed": the Status section only has "+ Walked" and "+ Offered". (`desktop-t02-status`)
10. Closed the parcel with the x: no message, nothing saved. (`desktop-t02-close`)
11. Menu (hamburger): Profile, "Answer a few questions", Where to look, Help, Settings. Help is about reading a report; nothing about hiding parcels. (`desktop-t02-menu`, `desktop-t02-help`)
12. Reopened Macks and tried "Add to list" in case the list has a "rejected" option; it opens "Add to favorites" with a name, which is the opposite of what I want, so I cancelled. (`desktop-t02-add-macks`)
13. Graded it again (second time), closed with x, checked Recent: still not there, even after a reload. (`desktop-t02-regrade`, `desktop-t02-recent2`, `desktop-t02-recent-reload`)
14. Back on the map, clicked Macks: ungraded again. Graded it a third time. (`desktop-t02-tap-again`, `desktop-t02-regrade2`)
15. Clicked outside the parcel, on the land north of it: the app selected a 13,339-acre parcel "109-1-43" and zoomed way out to somewhere else. (`desktop-t02-tap-neighbour`)
16. Now Recent shows "35-3 · Floyd Co. B Maybe". Clicked its x: "Removed from Recent. Undo". (`desktop-t02-recent3`, `desktop-t02-removed`)

**Wrong turns:**
- "..." menu (only "Report card").
- Escape closed the whole parcel, not just the menu, and threw away the grade.
- Parcel-number search for 35-3 failed even with Floyd County on screen.
- The Status section on Details (only Walked / Offered, no "Passed" or "Not for us").
- Help page.
- "Add to list" (it means favourite).
- Closing with x: a graded parcel closed with x never shows up in Recent; only replacing it with another parcel puts it there.

**Time to find:** about 16 actions to the x on Recent (`desktop-t02-recent3`). I never found a "not for us" control.

**Your words:**
- "Where's the 'not interested' button? The ... menu has one thing in it." (`desktop-t02-more-menu`)
- "Wait, I pressed Escape to close a menu and the whole parcel is gone." (`desktop-t02-status-failed`)
- "It says no parcel numbers start with 35-3, but the panel literally said Parcel ID 35-3 a minute ago." (`desktop-t02-search-35-3`)
- "I graded Macks. Why isn't it in Recent?" (`desktop-t02-recent`)
- "It forgot the grade? That took a minute." (`desktop-t02-reopen-macks`)
- "Add to list = Add to favorites. I don't want it as a favourite, I want it gone." (`desktop-t02-add-macks`)
- "I clicked next door and now I'm looking at 13,000 acres somewhere else?" (`desktop-t02-tap-neighbour`)
- "Removed from Recent... but if I click it on the map, it'll just come back. That's not 'out of my way'." (`desktop-t02-removed`)

**Confusing things:**
- No way to reject or hide a parcel; Status has only positive milestones.
- Closing a graded parcel (x or Escape) silently discards its grade and it never goes into Recent. Only opening another parcel moves the old one to Recent (with a toast). The grade cost about a minute each time; I graded Macks three times.
- Escape closes the open parcel, not just the menu.
- Parcel-number search doesn't find a parcel number the app itself shows.
- Clicking just outside a parcel can select a huge parcel (13,339 ac) and zoom the map far out.
- "Best homesite: Site #3" next to "The map's sun, sky and driveway are for site #1, where the screen ran" plus an "Evaluate site #3" button: why didn't it run on the best site?
- The map moves (pans) when you close a parcel.

## Task 3: Keep Ferney Creek to come back to

**Outcome:** done

**Steps:**
1. Map, searched "36.8874, -80.4546", Go to. The map moved but the panel still showed the 13,339-acre parcel from task 2. (`desktop-t03-go-ferney`)
2. Clicked the map centre: "52-47A, 43.88 ac", matches the listing. (`desktop-t03-tap-ferney`)
3. "Add to list" opens "Add to favorites" with a Name box (for Macks it had suggested "292.0 ac in Floyd"). Typed "Ferney Creek", Add. The header now shows "Ferney Creek" and a star "On your list". (`desktop-t03-added`)
4. Graded it while I was there: B Contender; "the nearest trailhead is 47 minutes away, past your 20-minute limit; check first: legal road access." (`desktop-t03-graded`)
5. Your list > Favorites: a table row "Ferney Creek, B Contender, 43.9 ac, $31-105k + land" with icons per column and a key underneath. (`desktop-t03-favorites`)

**Wrong turns:** none.

**Time to find:** 1 action ("Add to list" was already visible from task 2) (`desktop-t03-added`).

**Your words:**
- "Add to list... and the dialog says Add to favorites. Is 'list' the same as 'favorites'?"
- "Oh, now there's an 'Archive...' button under Status. It wasn't there for Macks. So you have to favourite something before you can throw it away?" (seen in the snapshot after adding; `desktop-t03-added`)
- "Favorites are shared with everyone in your household. What household? I haven't set one up."

**Confusing things:**
- "Add to list" vs "Add to favorites" vs "On your list" vs the "Your list" tab with "Favorites" and "Recent": four names for one idea.
- The Archive control (probably the answer to task 2) only appears once a parcel is a favourite.
- The table's column headers are abbreviated (Elev, Sun, Room, Sky, Hosp, "Own drive"); the key under the table helps but is in tiny grey text.

## Task 4: Compare Mud Creek, Ferney Creek and Roan Mountain side by side

**Outcome:** done

**Steps:**
1. Your list > Recent: clicked "Add to list" on "6273 · Grayson Co."; the dialog suggested "30.1 ac on Mud Creek Ln, Grayson". Renamed it "Mud Creek", Add. Recent then said "Nothing here yet". (`desktop-t04-add-mud`, `desktop-t04-mud-added`)
2. Map, searched "36.1867, -82.0752", Go to: SR 143 on screen, panel still on Ferney Creek. (`desktop-t04-go-roan`)
3. Clicked the centre: "Loading parcel..." for several seconds with Ferney still in the panel, then "099 046.02, 13.29 ac", owner of record shown. Matches the listing. (`desktop-t04-tap-roan`, `desktop-t04-roan-loaded`)
4. Add to list as "Roan Mountain", then graded: B Maybe, "check first: driveway on your land and septic". (`desktop-t04-roan-graded`)
5. Your list > Favorites: all three in one table already. Ticked the unlabelled checkbox on each row; a "Compare 3" button appeared at the top right. (`desktop-t04-list3`, `desktop-t04-ticked`)
6. Compare 3: a page with the three parcels as columns: grade and verdict, costs, budget, dealbreakers, "What money can't add", with up/down arrows on the best and worst. (`desktop-t04-compare`)

**Wrong turns:** none, though I had to add Mud Creek to favourites first (it was only in Recent) and find and grade Roan Mountain.

**Time to find:** 2 actions on the list page (tick boxes, "Compare 3") (`desktop-t04-ticked`).

**Your words:**
- "Isn't this table already a comparison? What does Compare add?" (`desktop-t04-list3`)
- "The checkbox column has no heading; I guessed it was for selecting." (`desktop-t04-list3`)
- "Compare 3 popped up way over on the right; I almost missed it." (`desktop-t04-ticked`)
- "'What money can't add'? Oh, things you can't buy your way out of. Cute, but it took me a second."
- "On the parcel it's 'Must have', here it's 'Dealbreakers'. Same thing?"

**Confusing things:**
- The "Compare" checkbox column has no visible header (only the screen-reader name).
- "Compare 3" appears in the top right corner, far from the checkboxes.
- Section names differ between the parcel report ("Must have", "Really want") and Compare ("Dealbreakers", "What money can't add").
- Adding to favourites removes the parcel from Recent, so Recent said "Nothing here yet" right after I added the only parcel in it. Fine, but surprising.
- Tennessee parcel took several seconds to load with only a small "Loading parcel..." chip while the old parcel stayed in the panel.

## Task 5: Ask my partner about Mud Creek; answer as Alex; see the answer

**Outcome:** done (after a detour; getting Alex in took most of the effort)

**Steps:**
1. Looked for "share" or "invite": Menu > Settings has "Export file", "Import file", "Sync across devices" and a long list of numeric "Thresholds". (`desktop-t05-settings`)
2. "Sync across devices": "Start syncing this device" or "Join with a code". It talks about "your other devices", not a partner, so I backed out. (`desktop-t05-sync`)
3. Menu > "Profile 1" > Switch profile: Profile 1 (current), Rename, Delete, "Add a profile". Not clear if a profile is a person or a set of settings. (`desktop-t05-profile`)
4. Opened Mud Creek from Compare; "..." menu has only "Report card"; Details has no share/ask. (`desktop-t05-open-mud`, `desktop-t05-more`, `desktop-t05-details`)
5. Went back to Settings > Sync > "Start syncing this device": a QR code and a code, with a warning: "This code works like a password... Use it only on your own devices... don't send it to anyone you wouldn't give a password." The header now says "Synced". "Done" led to a second "This device is synced" box I had to Close, then Cancel the Settings. (`desktop-t05-start-sync`, `desktop-t05-synced-failed`, `desktop-t05-synced`)
6. As Alex on desktop2: Menu > Settings > Sync across devices > Join with a code, typed the code, Join, then a confirm "It holds 3 parcels", Join. (`desktop2-t05-join`, `desktop2-t05-joined`)
7. Alex lands on "Who's this?": "Profile 1" or "I'm new here". Picked "I'm new here". (`desktop2-t05-joined2`)
8. A dark error bar appeared at once: "A change on this device wasn't saved: New member. It's kept on this device." with Try again / Discard. Try again made it go away. (`desktop2-t05-new-here`, `desktop2-t05-try-again`)
9. Named Alex, Continue; a 14-question interview started. Alex picked "Not now". (`desktop2-t05-alex-name`, `desktop2-t05-alex-notnow`)
10. As Sam, reloaded: Mud Creek's Grade tab now has "How Alex would rate it" with "Answer as Alex here" and "Ask Alex", and "Your take" (Yes / Maybe / No + comment). (`desktop-t05-after-join`, `desktop-t05-alex-section`)
11. "Ask Alex" opened "A note for Alex (optional)"; wrote a note, Ask. "Asked 10/23: ... it's in Alex's Waiting for you." (`desktop-t05-ask-alex`, `desktop-t05-asked`)
12. Alex (desktop2) after reload: red "1" badge on Your list; the list has "Waiting for you (1)" and the Mud Creek row says "Profile 1 asked for your take: ..." (cut off). (`desktop2-t05-alex-home`, `desktop2-t05-alex-list`)
13. Clicking the parcel name opened a side drawer; Alex had to scroll to the bottom to find "Your take" with my note, Yes / Maybe / No. Picked Maybe, wrote a comment, Save my take: "Sent to Profile 1." (`desktop2-t05-alex-open`, `desktop2-t05-alex-drawer-scroll`, `desktop2-t05-alex-answered`)
14. Back as Sam, waited about 30 s with Mud Creek open: "Maybe, Alex's take, 10/23" and the comment appeared under "How Alex would rate it". (`desktop-t05-sam-sees`)

**Wrong turns:**
- Settings > Sync first time (backed out because it says "your other devices" and warns it's like a password).
- Profile switcher ("Add a profile" might have been the way, but it didn't say).
- Parcel "..." menu and Details tab, looking for Share / Ask.
- The real path: sync first, then the partner says "I'm new here", and only then does "Ask Alex" appear on a parcel.

**Time to find:** about 8 actions before "Ask Alex" existed (`desktop-t05-alex-section`); for Alex, 3 actions from the badge to the answer box (`desktop2-t05-alex-drawer-scroll`).

**Your words:**
- "How do I invite my partner? There's no Share button anywhere." (`desktop-t05-more`)
- "Profile 1... is that me? Is a profile a person?" (`desktop-t05-profile`)
- "It says don't send it to anyone you wouldn't give a password. Can I give it to my partner? I guess so, we share everything." (`desktop-t05-start-sync`)
- "I clicked Done and got another box saying 'This device is synced'. Two boxes to close plus the Settings." (`desktop-t05-synced-failed`)
- "'A change on this device wasn't saved: New member'? Did joining fail?" (`desktop2-t05-new-here`)
- "Who's 'Profile 1'? Oh, that's me, I never named myself." (`desktop2-t05-alex-list`)
- "Alex hasn't said what matters to them yet: so the box called 'How Alex would rate it' has nothing to do with Alex's take?" (`desktop-t05-sam-sees`)

**Confusing things:**
- No "invite partner" or "share" anywhere; you have to discover that household = sync code + "I'm new here".
- The sync code warning says use it only on your own devices, which reads like "don't give it to your partner", though that's the only way in.
- The first person is called "Profile 1" everywhere ("Added by Profile 1", "Profile 1 asked for your take", "Ask Profile 1") because the app never asked me my name.
- A scary "wasn't saved" error right after "I'm new here"; Try again fixed it.
- On Alex's side, the answer box is at the very bottom of a long drawer, under the whole report.
- "How Alex would rate it" mixes two things: Alex's priorities (not set) and Alex's take (the answer).
- On Sam's side, no badge or toast when Alex answered; I only saw it because Mud Creek was open.
- The waiting note in the list row is truncated ("What do you thin...").

- Afterwards, Sam's Your list showed no trace of Alex's take: no badge, no dot, no "Alex: Maybe" on the Mud Creek row (maybe because I'd already seen it on the parcel). (`desktop-t05-sam-list`)

- Fixed "Profile 1": Menu > Profile 1 > Switch profile > Rename (first of two identical "Rename" buttons, one per person) > "Sam" > Save. Note that from my device I could also Rename or Delete Alex. (`desktop-t05-rename-failed`, `desktop-t05-renamed`)

## Task 6: Which parts of the region would suit us (no parcel in mind)

**Outcome:** done

**Steps:**
1. I remembered "Where to look" from the first screen. Menu > "Where to look" from the Your list page: first click did nothing visible (the menu stayed open), second click opened a "Where to look" dialog: 30 areas ranked "for you": Highlands and Cashiers A-, Burnsville and Celo B+, Ashe County B+, Boone and Blowing Rock B+, Banner Elk B+, "Show more". Each card has "What holds it back", a trade-off and "Show me a parcel here". (`desktop-t06-where-to-look`, `desktop-t06-where-to-look2`)
2. "Show me a parcel here" on Ashe County: the map jumped to "Sample parcel 1 · Ashe County", graded **B, Not for us**: "fails your must: no driveway route found." The panel opened scrolled halfway down, not at the top. A chip: "An example lot, not a listing: add it to your list to edit it." (`desktop-t06-show-ashe`)
3. Closed it ("Closed. Undo"), opened Map layers: basemaps, "On the map" toggles incl. "Area outlines", terrain preview. (`desktop-t06-layers`)
4. Turned on Area outlines and zoomed out: area names with grade chips on the map (Ashe County B+, Boone and Blowing Rock B+). (`desktop-t06-area-outlines`)
5. Zoomed out more: the whole set of areas as outlined patches with grade chips (A-, B+, B, B-, C+, C-, D+), but at this zoom there are no town or state names, so I can't tell what's Virginia and what's North Carolina. (`desktop-t06-region`)

**Wrong turns:**
- First "Where to look" click in the menu did nothing.
- "Show me a parcel here" took me to a sample lot that fails a must-have, which made the B+ area look bad.

**Time to find:** 2 actions to the ranked list (`desktop-t06-where-to-look2`); 3 more to the map view of areas (`desktop-t06-region`).

**Your words:**
- "Highlands and Cashiers is #1? That's way down in the southwest corner of North Carolina, not where we're looking. Can I limit it to our three corners of VA, NC and TN?" (`desktop-t06-where-to-look2`)
- "Show me a parcel here... and the parcel it shows me is 'Not for us'? Why show me that one?" (`desktop-t06-show-ashe`)
- "Oh, 'Not for us' is a verdict the app gives. So there IS a Not for us, I just can't set it myself (task 2)."
- "Which of these blobs is Floyd County? There are no labels." (`desktop-t06-region`)

**Confusing things:**
- The ranked list can't be narrowed to our region, and the map of areas isn't linked from the list (I found "Area outlines" in Map layers by poking around).
- No place or state labels at the zoom where all the areas fit.
- "Show me a parcel here" can show a sample that fails a must-have.
- The sample parcel's panel opens scrolled to the middle.
- The aerial basemap is a patchwork of differently coloured state imagery at this zoom, which looks like data (I first thought the grey patches meant something).

## Task 7: Correct something the app says about Mud Creek (septic)

What I know: the seller had a perc test and the county approved a conventional septic permit. The app says "Septic: Check first: no soil on the parcel rates better than very limited for a septic field."

**Outcome:** done

**Steps:**
1. Typed "Mud Creek" in the search: my favourite "Mud Creek 30.1 ac" at the top, then five creeks in Tennessee. Picked mine. The parcel opened in the panel but the map stayed zoomed out on the whole region (it didn't fly to the parcel). (`desktop-t07-search-mud`, `desktop-t07-open-mud`)
2. Clicked the Septic line under Must have: a "Septic" panel replaced the report: "Will the ground take a septic field?", Warning, a Conventional / Modified / Alternative scale, "What it means for you", and at the bottom "Adjust for this parcel" with "Count it as passed" and "Set aside for this parcel". (`desktop-t07-septic`, `desktop-t07-adjust`)
3. "Count it as passed" asked "Why? (required)". Typed the perc test / permit reason, Save. The panel now says "You count it as passed; the app says Check first." with my reason and "Remove adjustment". (`desktop-t07-passed`, `desktop-t07-saved`)
4. Closed the Septic panel: Septic now has a green check (next to a faded "!") with my reason in italics; the summary says "With 1 override: Septic"; "Still unknown" now says "Nothing to ask the agent". Grade stayed B Contender. (`desktop-t07-after`)

**Wrong turns:** none. Clicking the line I disagreed with was the obvious thing, and it worked.

**Time to find:** 2 actions (`desktop-t07-adjust`).

**Your words:**
- "Good: 'Count it as passed', and it wants a reason. That's exactly what I wanted."
- "It still says 'No soil on the parcel rates better than very limited' right next to the green check. Which is it?" (`desktop-t07-after`)
- "'Only your grade changes; others in your household keep theirs.' So Alex will still see the septic warning? Even though it's a fact, not an opinion?" (`desktop-t07-adjust`)
- "'Grade again to restore the map overlays and horizon fan'? What did I lose?" (seen at the bottom of the panel, `desktop-t07-after`)
- "Opening it from search didn't move the map to it; I'm still looking at the whole region." (`desktop-t07-open-mud`)

**Confusing things:**
- A correction of a fact (a septic permit exists) only applies to my grade, not my partner's; the app treats it as an opinion.
- The overridden line keeps the old wording plus a faded "!" next to the new check.
- "Pass" badge in the Septic panel header still followed by "No soil on the parcel rates better than very limited" (`desktop-t07-saved` snapshot).
- Opening a saved parcel from search doesn't zoom the map to it.
- "Grade again ... to restore the map overlays and horizon fan" appears with no explanation of why they were lost.
- "Count it as passed" vs "Set aside for this parcel": the difference took a re-read.

## Task 8: A report on Mud Creek to send or print

**Outcome:** done (the print dialog itself can't be seen in this headless browser)

**Steps:**
1. On Mud Creek, "..." > "Report card" (the only item in that menu, which I'd noticed in task 2). A new page: "Report card", tabs "One page" / "Full", "Print or save as PDF", "Back". (`desktop-t08-report`)
2. The one-page report: name, acres, graded date, an aerial map with the boundary and site 1, "B ✎ Contender · Sam: ... With 1 override: Septic", costs, ways to raise the grade, Must have and Really want tables, "Takes: Alex says Maybe: ..." and "Questions for the agent". (`desktop-t08-report`)
3. Clicked "Print or save as PDF": nothing visible changed here (a real browser would show its print dialog). (`desktop-t08-print`)

**Wrong turns:** none.

**Time to find:** 2 actions (`desktop-t08-report`).

**Your words:**
- "Nice, it's one page with a map. That's what I'd hand someone."
- "The septic row shows a check and a pencil, but my reason (the perc test and permit) isn't on the printout; it still says 'No soil on the parcel rates better than very limited'. Alex would read that and worry." (`desktop-t08-report`)
- "There's no way to just send a link to Alex; I'd have to save a PDF and email it."

**Confusing things:**
- The override's reason isn't printed; only the old text and a ✎.
- "B ✎": the pencil next to the grade isn't explained on the report.
- No share-link option; only print/PDF.

## Task 9: The night sky matters more than I first said; see how grades change

**Outcome:** done

**Steps:**
1. "What matters" tab: four columns, Must have (4), Really want (7, in order), Nice to have (0), Don't care (8), with a short explanation, and a "Try it on [parcel]: B · Contender" box. (`desktop-t09-what-matters`)
2. Picked Roan Mountain in "Try it on" (its sky was a C) and clicked "Night sky": a dialog with "A night sky of at least 21.2 mag/arcsec²", a slider, "How this item is graded: A 21.5+ · B 21.2 · C 20.9 · D 20.5", Move to Must have / Really want / Nice to have / Don't care, Up / Down. (`desktop-t09-night-sky`)
3. Pressed Up three times: "Really want, #1 in the list". Try it on Roan: still "B · Maybe", with notes "Night sky now counts more · Best homesite now counts less". (`desktop-t09-up3`)
4. Moved it to Must have: Try it on Roan now "B · Maybe → B · Not for us", "Out: Night sky misses its limit (at least 21.2)". A line says "Night sky is now a must have too (at least 21.2): it also stays at #1 in Really want." The dialog still said "Really want, #1 in the list". (`desktop-t09-must`)
5. Your list: Mud Creek went from B to **A ✎ Contender**; Ferney stays B Contender; Roan Mountain vanished from the table: "1 hidden by filters · Show all". (`desktop-t09-list`)

**Wrong turns:** none, though moving it up three places changed nothing visible on the parcel I tried it on.

**Time to find:** 2 actions to the Night sky control (`desktop-t09-night-sky`).

**Your words:**
- "mag/arcsec²? I have no idea what 21.2 means. Is higher darker?" (`desktop-t09-night-sky`)
- "I moved it to #1 and Roan is still B Maybe. Did it do anything?" (`desktop-t09-up3`)
- "'B · Not for us'. A B grade but not for us? Which do I believe?" (`desktop-t09-must`)
- "Must have AND it stays in Really want? Is it in both columns now?"
- "Where did Roan Mountain go? Oh, '1 hidden by filters'. I didn't set a filter." (`desktop-t09-list`)
- "So that's how you hide a parcel: make it fail a must-have. Not what I'd guess for task 2."

**Confusing things:**
- The sky threshold is in astronomers' units (mag/arcsec²) with no plain-language scale on the slider itself (there's a "How dark is it overhead?" expander I didn't open).
- Reordering within Really want didn't visibly change the parcel I was trying it on.
- A letter grade and a verdict that disagree ("B · Not for us"; "A ✎ Contender").
- The item ends up in two columns at once; the dialog's "Really want, #1" text didn't update after moving it to Must have.
- Parcels that become "Not for us" are hidden from the list by a filter I never set, with only a small "1 hidden by filters" line.

## Task 10: Draw the old logging track and have the app use it as the driveway

**Outcome:** done (with the caveat that the app then marks my driveway "check first" because the line I drew is steep)

**Steps:**
1. Your list > clicked Mud Creek > "Open on the map": the parcel opened, but the map stayed zoomed out on the whole region; I had to scroll-zoom in about 20 notches to find it. (`desktop-t10-open-mud`, `desktop-t10-zoom`, `desktop-t10-zoom2`)
2. Details tab > Lines & marks > "Draw a line". The map's site markers disappeared and the bottom bar became: Track / Existing drive / Easement, "Tap along the drive or trail", Undo point, Finish, Cancel. (`desktop-t10-draw-line`)
3. Clicked six points from Mud Creek Lane up to the house site. One click landed on a spot that opened a big "Grayson Highlands (Volney, Troutdale) B+" area popup over my drawing, and only 5 points registered ("5 points · 972 ft"). Closed the popup with its tiny ×. (`desktop-t10-drawn`, `desktop-t10-popup-closed`)
4. Finish: "Track 1, pioneer · 972 ft" in Lines & marks; the bottom bar now has an orange "Grade again: lines changed". (`desktop-t10-finished`)
5. Opened Track 1: name, Track / Easement / Existing drive, condition (Uncleared / Pioneer / Improved / Paved: "The condition doesn't change the cost yet"), width ("not used in costs yet"), note, "Edit on the map". No "use as driveway" here yet; "972 ft (run again to grade it)". (`desktop-t10-track-details`)
6. "Grade again" and waited 40 s: grade A Contender; drive cost unchanged in wording ("2,880 ft drive at 16%"), so it still used its own route. (`desktop-t10-regraded`)
7. Clicked my line on the map: tooltip "Track 1: 972 ft · avg 33% · steepest 49% over 30 m", and (again) the area popup on top. In the panel, Track 1 now shows "Use as my driveway". (`desktop-t10-click-track`)
8. "Use as my driveway": at once a green banner "Legal road access: ✓ → ! · Driveway on your land: ✓ → ! · Contender → Maybe"; the track now says "The card scores its route as your driveway" and "Use the app's pick". (`desktop-t10-use-driveway`)
9. Grade tab: **A Maybe**, "Held at Maybe by: Legal road access and Driveway on your land." Road access: "Track 1: verify it's a legal right-of-way; your route is steeper than your veto (49% vs 25%)". Costs dropped: ready to camp $1-2k, build $70-195k. But "Best homesite" still says "2,880 ft drive at 16%" (the app's route, not mine). (`desktop-t10-grade-after`)

**Wrong turns:**
- "Use as my driveway" isn't there until after a re-grade; I looked in the track details first and only found "run again to grade it".
- Area popups open whenever a click lands on certain spots, even while drawing.

**Time to find:** "Draw a line" 2 actions (`desktop-t10-draw-line`); "Use as my driveway" about 9 actions (`desktop-t10-click-track`).

**Your words:**
- "Why is the map showing the whole state? I just opened the parcel." (`desktop-t10-open-mud`)
- "Track, Existing drive or Easement? A logging track is... a track, I guess. But I want it to be a drive." (`desktop-t10-draw-line`)
- "Wait, why did a Grayson Highlands card pop up in the middle of my drawing?" (`desktop-t10-drawn`)
- "I drew the line. Now how do I tell it this is the driveway?" (`desktop-t10-track-details`)
- "Contender → Maybe just for using my own track? And my legal road access went from pass to check-first: the track starts at the same road." (`desktop-t10-use-driveway`)
- "33% average? The real track switchbacks; I clicked a straight-ish line. Okay, that's my fault, but it didn't warn me while drawing."
- "Cost dropped by $70k+ but the 'Best homesite' line still shows the old 2,880 ft drive. Which driveway is it using?" (`desktop-t10-grade-after`)

**Confusing things:**
- "Use as my driveway" only appears after a re-grade; nothing in the drawing flow points to it.
- Area popups from "Where to look" open on map clicks during drawing and when clicking a line.
- The line's grade (avg 33%) only shows after Finish; no live grade while drawing.
- Using my own track turned Legal road access from pass to warn, which I didn't expect (same road).
- Best homesite still lists the app's own drive length after I chose mine.
- "Ready to camp $1-2k": cheaper than I'd believe for a 49% track.
- The condition and width fields say they don't change anything yet.

## Task 11: What would it cost to build on Mud Creek?

**Outcome:** done (for site work; the app deliberately leaves out the house itself)

**Steps:**
1. On the Grade tab, "Cost to enjoy": "Ready to camp $1-2k plus the land; Ready to build $70-195k plus the land", with "Tap a line for its breakdown". Clicked "Ready to build". (`desktop-t10-grade-after`, `desktop-t11-build-cost`)
2. A "Cost to enjoy" panel: Ready to camp all in (pioneer track $300-1,200, clearing a campsite $300-900), then Ready to build: finished driveway $1,600-2,900, "Upgrade the existing drive, 972 ft (pioneer) $42,300-104,500", paving steep stretches, culverts $1.2-6k, well $4.5-32k, septic (modified) $7-20k, power $0-1.8k, service hookup, clearing the house site, house pad (sloped) $11-18k. Every line has a unit price, a source and "To lower it: ..." tips. (`desktop-t11-build-cost`, `desktop-t11-build-cost2`)
3. At the bottom: how the estimate is made ("published low-high rates (Settings → Costs) ... Your lines and marks lower it") and a "Still unknown" checklist (legal access, deed restrictions, mineral rights, utility quote, well depths, septic, RV occupancy, insurance, cell service). (`desktop-t11-build-cost3`)

**Wrong turns:** none.

**Time to find:** 1 action (the costs are on the front of the report card) (`desktop-t11-build-cost`).

**Your words:**
- "'Everything but the house'. OK, so where's the house? I want a rough total including a modest house." (`desktop-t11-build-cost`)
- "Septic, modified, $7-20k? I told it there's a conventional permit." (`desktop-t11-build-cost2`)
- "'Finished driveway (the track upgraded) 117 ft' AND 'Upgrade the existing drive, 972 ft'. Is that two driveways?" (`desktop-t11-build-cost`)
- "NRCS Tennessee payment schedule for a Virginia parcel?"
- "Ready to camp $1-2k but ready to build $70-195k: and before I drew my track it was $145-410k. My scribbled line saved $75k-215k? That makes me trust the numbers less."

**Confusing things:**
- No house cost or way to add one (budget shows "No budget given" on Compare, but I never saw where to give one).
- My septic override (permit exists) didn't change the septic cost line, which still prices a modified system and says "To lower it: Mark a septic permit with its class" (so there's a separate place to mark a permit; my override wasn't it).
- Two driveway lines (117 ft finished driveway and 972 ft existing drive upgrade) with no explanation of how they relate.
- Cost sources cite Tennessee and North Carolina rates for a Virginia parcel.
- The "Still unknown" checkbox list is useful, but it's at the bottom of the cost panel, which is an odd home for it.

## Task 12: Open the app on my second device and have my parcels there

**Outcome:** done (the device was already synced from task 5; I only had to switch to "Sam")

**Steps:**
1. Opened the app on desktop2: it opened on Your list as Alex (the last person used there), showing Mud Creek and Ferney Creek with "Grades: You B Maybe · Sam B ✎" and "1 hidden by filters". (`desktop2-t12-open`)
2. Menu > "Alex" > Switch profile: Alex (current), Sam, Add a profile. Picked Sam. (`desktop2-t12-switch`)
3. As Sam on desktop2: Your list shows my two favourites with my track and septic override, plus a red "1" badge and a "New takes (1)" filter (Alex's take, which I'd already read on the other device). (`desktop2-t12-as-sam`)
4. But here Mud Creek is **B ✎ Maybe**, while on my first device it's **A ✎ Maybe**, and there's an extra "Drive" column. (`desktop2-t12-as-sam`, `desktop-t12-desktop-list`)
5. What matters on desktop2 explained it: a banner "New: Driveway, at the bottom of Nice to have (you skipped the question about steep drives). Undo / OK". On desktop, Driveway is still in Don't care. (`desktop2-t12-sam-priorities`, `desktop-t12-desktop-priorities`)
6. Opened Mud Creek on desktop2: Track 1 is there; the map stayed zoomed out over the region again. (`desktop2-t12-mud-details`)

**Wrong turns:** none; the sync from task 5 already did the work. (Had I not done task 5, I'd have looked in Settings > Sync across devices, which I found in task 5.)

**Time to find:** 2 actions to be Sam on device 2 (`desktop2-t12-as-sam`).

**Your words:**
- "It opened as Alex. On my own laptop? Oh, it remembers whoever used it last." (`desktop2-t12-open`)
- "Same person, same parcel, two devices, two different grades. Which one is right?" (`desktop2-t12-as-sam`)
- "'You skipped the question about steep drives'? I never saw a question on this device." (`desktop2-t12-sam-priorities`)
- "The red badge says there's a new take, but I already read Alex's take on my other device."

**Confusing things:**
- The same profile has different priorities, so different grades, on two synced devices: on device 2 the app silently added "Driveway" to Nice to have and only says so on the What matters page.
- "Seen" for takes isn't shared between my devices.
- The second device opens as whoever used it last, with nothing on screen saying whose list you're looking at except the "Grades: You ... · Sam ..." column.
- "1 hidden by filters" also appears for Alex, who never made night sky a must-have (so it isn't clear what is hidden or why).

---

## Overall

**What I think the app is for:** checking rural land parcels from your desk before you drive out: it pulls slope, sun, soils, flood, sky darkness, drive times and site-work costs for a parcel, grades it against what you say matters, and lets a couple keep a shared shortlist with each person's grade and take.

**Easiest:** keeping a parcel (Add to list), comparing three side by side, correcting a line I knew was wrong (click the line > "Count it as passed" + reason), printing a one-page report card, and seeing the cost breakdown. The report card itself is clear and the plain-language explanations are good.

**Hardest:** getting my partner in (no "invite"; it's hidden behind "Sync across devices", a code that the app warns is like a password, and "I'm new here"), getting rid of a parcel I don't want (no "not for us" or hide; closing a graded parcel throws the grade away and it doesn't go to Recent), and making my drawn track the driveway (the button appears only after a re-grade).

**Three things I'd most want changed:**
1. A plain "Invite your partner" flow, and ask my name at the start so I'm not "Profile 1" to my partner.
2. A "Not for us / hide" action on any parcel (not only favourites, not only via a must-have), and never silently lose a grade when closing a parcel.
3. Make the map follow the parcel I open (from search, Your list or Compare), and stop "Where to look" area popups from opening while I click on a parcel or draw.

Also worth fixing: same profile showing different grades on two synced devices (`desktop2-t12-as-sam` vs `desktop-t12-desktop-list`); parcel-number search that can't find the tax number the app itself shows (`desktop-t02-search-35-3`); my septic correction not reaching the cost line or the printed report (`desktop-t11-build-cost2`, `desktop-t08-report`).
