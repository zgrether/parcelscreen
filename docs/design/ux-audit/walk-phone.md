# Walkthrough: phone

The first-time user's own report, unedited (UX audit §3). Shot names refer to the walkthrough's screenshots; the ones the
audit cites are in this folder as `shot-<name>.jpg`.


Note on the harness: `locator.tap()` and `page.touchscreen.tap()` fail ("The page does not support tap"), so every
tap below is a mouse click at the same point, and sheet drags are mouse drags.

## Task 1. Find Mud Creek and find out whether it's any good for you

**Outcome:** done (with a detour; the parcel number search never worked).

**Steps:**
1. App opens on a satellite map of the region, with Map / Your list / What matters / More along the bottom and a
   hint "Tap a parcel to select it or Draw a custom parcel". (`phone-reset`)
2. Tapped the magnifier top left. A search box opens with a "Where to look" list of ranked areas (Highlands and
   Cashiers A-, Burnsville and Celo B+ ...). (`t01-search-open`)
3. Typed "63-A-62 Grayson County". Parcel numbers: "Zoom in on the county to search its parcel numbers." Places
   offered Grayson Drive, Illinois; a bank in Poland; Milwaukee. (`t01-type-parcel`)
4. Typed the coordinates "36.5854, -81.5620"; got "Go to 36.5854, -81.562". (`t01-type-coords`)
5. Tapped it. The map zooms way in to satellite with yellow parcel lines, but no pin shows where the point is.
   (`t01-go-coords`)
6. Now zoomed into Grayson, retried the parcel number "63-A-62": "No parcel numbers start with 63-A-62 in the
   counties in view." Places offered Turkey, Ohio, Vancouver. (`t01-parcel-zoomed`)
7. Typed "63" to see what format they use: the result list vanished entirely. (`t01-parcel-63`)
8. Gave up on search and tapped the parcel in the middle of the screen. It outlines in orange; a sheet says "6273,
   30.15 ac", Add to list, "Grade this parcel". (`t01-tap-parcel`)
9. The Details tab shows Parcel ID 6273, Grayson County, plus a "Road strip (not in acres)" note saying "The parcels
   are 12 m apart". (`t01-details`)
10. Tapped "Grade this parcel": button turns to "Grading..." with Cancel; site markers S1-S5, G1 appear on the map
    while it works. (`t01-grading`)
11. After ~33 s: "B Contender. Strong elevation and winter sun; 0.1 ac of garden ground, under your 0.25 ac; check
    first: septic." A "Legal road access: Frontage on Mud Creek Ln" line confirmed this is the right land.
    (`t01-graded`)
12. Scrolled and dragged the sheet up: Must have (Floodplain, Legal road access, Driveway pass; Septic warning) and
    Really want grades (Elevation A, Best homesite A, Room to build B...). (`t01-scroll-card`, `t01-sheet-up`)

**Wrong turns:** parcel number search (steps 3, 6, 7): three tries, nothing. Got back by using the coordinates and
tapping the map.

**Time to find:** 7 actions before the right parcel was selected (`t01-tap-parcel`); the answer itself was
immediately clear after grading (`t01-graded`).

**Your words:**
- "Grayson Drive in Illinois? A bank in Poland? I typed Grayson County."
- "It says zoom in on the county. I'm zoomed in on the county. Why doesn't 63-A-62 exist?"
- "I typed 63 and everything disappeared. Is it thinking?"
- "I went to the coordinates but where exactly is the point? There's no pin."
- "The parcel is called 6273, my listing says 63-A-62. Is this the same land? Oh, Mud Creek Ln, OK."
- "The parcels are 12 m apart? I tapped one parcel."

**Confusing things:**
- Parcel ID shown (6273) doesn't match the tax map number format on the listing (63-A-62), and search can't find
  the listing's number.
- Place search returns results from the whole world (Illinois, Poland, Turkey, Quebec) while I'm looking at
  Virginia.
- No pin at the searched coordinates.
- "Grading..." shows no progress for ~30 s (the markers appearing on the map are the only sign).
- After grading, the map's "Stand here" label is cut off at the right edge ("Sta"). (`t01-graded`)
- With the sheet dragged up, the floating "Boundary / + Mark / 30.15 ac" toolbar sits on top of the map buttons
  at the top of the screen, overlapping them. (`t01-sheet-up`)
- A trash-can button appeared in the floating toolbar after grading, right next to "+ Mark": easy to hit by
  mistake.
- "Road strip (not in acres)", "cell score 53", "S4", "G1", "E3": jargon on the map labels.

## Task 2. Macks Mountain: decide it's not for you and get it out of the way

**Outcome:** done (partly as intended: I could hide it, but not record "not for us").

**Steps:**
1. Searched "36.9349, -80.6314" and tapped "Go to". The screen looked unchanged: the Mud Creek sheet, dragged up,
   still covered the whole map. (`t02-go-macks`)
2. Tapped the sheet's ×: "Closed. Undo" toast; the map behind was at the new spot, no pin. (`t02-closed`)
3. Tapped the middle of the map: "35-3, 292.01 ac, Floyd County". The sheet opened already expanded on Details,
   scrolled down to Lines & marks. A "Zoom in to see parcel lines" pill sits over the top map buttons.
   (`t02-tap-macks`)
4. Looked in "..." for a way to say no: only "Report card (Grade it first)". (`t02-more-menu`)
5. Scrolled Details to Status: only "+ Walked" and "+ Offered". No "pass" or "not for us". (`t02-status`)
6. Tried Your list: Favorites empty; Recent empty: "The parcels you grade show up here for 30 days", yet I had
   graded Mud Creek. (`t02-your-list`, `t02-recent`)
7. Back on the map, graded Macks: "B Maybe ... check first: legal road access and septic." (`t02-back-map`,
   `t02-macks-graded`)
8. Your list > Recent now shows "35-3 · Floyd Co. B Maybe" with Add to list, Open on the map and an ×.
   (`t02-recent2`)
9. Tapped ×: "Removed from Recent. Undo". (`t02-removed`)
10. Map: Macks is no longer selected; the map is zoomed back out to the region. (`t02-map-after`)

**Wrong turns:** the "..." menu and the Status section (steps 4-5), and Your list before grading (step 6). Found the
way by grading first, then going back to Recent.

**Time to find:** 9 actions (`t02-recent2`).

**Your words:**
- "I searched and nothing happened." (the sheet was hiding the map)
- "Where do I say no to this one? There's Walked and Offered, but no Passed."
- "Recent is empty? I graded Mud Creek ten minutes ago. Did closing it throw it away?"
- "OK it's gone from Recent, but will I see it again if I tap it on the map? There's no 'not for us' mark."

**Confusing things:**
- Searching with a parcel sheet open moves the map behind the sheet; nothing visible changes.
- The sheet's × ("Closed.") appears to have also removed Mud Creek from Recent: it never showed up there, though I
  graded it. Nothing said so.
- No way to mark a parcel "ruled out" with a reason; removing it from Recent is a hide, not a decision. If I find it
  again on the map I'll have no memory of why I dropped it.
- The parcel sheet opens scrolled to the middle of Details (Lines & marks) rather than at the top.
- The "Zoom in to see parcel lines" pill overlaps the top map buttons when the sheet is up.

## Task 3. Keep Ferney Creek so you can come back to it

**Outcome:** done.

**Steps:**
1. Searched the coordinates, tapped "Go to": map shows Ferney Creek Road NW and parcel lines, no pin. (`t03-go-ferney`)
2. Tapped the middle of the screen: got "52-61, 124.24 ac": the wrong parcel (the listing says 52-47A). (`t03-tap-ferney`)
3. Closed it (×) and searched "52-47A": "Zoom in on the county to search its parcel numbers", and the map had
   jumped back out to the whole region. Places offered Bogota and Berlin. (`t03-search-pn`)
4. Went to the coordinates again, then searched "52-47A": this time "52-47A 51063" appeared under Parcel numbers.
   (`t03-search-pn2`)
5. Tapped it: "52-47A, 43.88 ac". (`t03-ferney-sel`)
6. Typed "Ferney Creek" in Name, tapped "Add to list": a panel "Add to favorites" with the name, "Favorites are
   shared with everyone in your household", Add / Cancel. (`t03-added`)
7. Tapped Add: the button became "★ On your list". (`t03-added2`)
8. Graded it too (for the comparison): "B Contender ... the nearest trailhead is 47 minutes away, past your 20-minute
   limit; check first: legal road access." (`t03-ferney-graded`)

**Wrong turns:** tapping the map centre picked the neighbour (step 2); parcel number search while zoomed out
(step 3). Back by going to the coordinates first and then searching the number.

**Time to find:** "Add to list" was visible at once; finding the right parcel took 5 actions (`t03-ferney-sel`).

**Your words:**
- "Is this the one? 52-61... no, mine is 52-47A."
- "I closed the parcel and the map flew all the way out again. Now it wants me to zoom in to the county."
- "What's 51063?"
- "I tapped Add to list and it says Add to favorites. Is that the same thing? And household: I don't have one set up."

**Confusing things:**
- Parcel number search only works when you're zoomed into that county, and the message ("Zoom in on the county")
  doesn't say which county or how far.
- Closing a parcel (×) zooms the map back out to the region, losing my place.
- "51063" next to the parcel number (a code, not a county name).
- "Add to list" vs "Add to favorites" vs "On your list" vs the tab "Favorites": four names for one thing.
- The "Your 20-minute limit" for trailheads is something I never set; the app has assumed it.

## Task 4. Compare Mud Creek, Ferney Creek and Roan Mountain side by side

**Outcome:** done.

**Steps:**
1. Closed Ferney, searched Roan's coordinates, "Go to": SR 143 and parcel lines. (`t04-go-roan`)
2. Searched "099 046.02": "099 046.02 Carter" under Parcel numbers (here the county is named; in Virginia it was a
   number). (`t04-search-roan`)
3. Selected it, typed "Roan Mountain" in Name; my combined step failed the first time because the sheet was still
   loading. (`t04-roan-add-failed`, `t04-roan-check`)
4. Named it, Add to list > Add, Grade: still "Grading..." after 45 s with no progress shown (`t04-roan-graded`);
   done at 55 s: "B Maybe ... check first: driveway on your land and septic". (`t04-roan-graded2`)
5. Mud Creek wasn't on my list. Went to its coordinates and searched "6273" (the number the app had shown me):
   found "6273 51077". (`t04-search-6273`)
6. Opened it: its grade from task 1 was gone; "Grade this parcel" again. (`t04-mud-sel`)
7. Named it Mud Creek, added it, re-graded (44 s): B Contender. (`t04-mud-graded`)
8. Your list > Favorites: three cards, each with a star, a "..." and an empty square box on the right. (`t04-list`)
9. Ticked the three boxes; a "Compare 3" button appeared top right. (`t04-checked`)
10. Compare: a table, one parcel column fits and a half; swiped sideways to Mud Creek; the row names stay put.
    (`t04-compare`, `t04-compare-right`)
11. Scrolled down: Dealbreakers (Floodplain, Legal road access, Driveway, Septic) then "What money can't add"
    (Elevation, Best homesite, Night sky, ...), with up/down arrows for best/worst in the row. (`t04-compare-down`)

**Wrong turns:** none in the compare itself; the work was getting Mud Creek back (steps 5-7) since its grade had
vanished.

**Time to find:** 2 actions once on Your list (`t04-checked`): the boxes were guessable.

**Your words:**
- "Why did Mud Creek lose its grade? I graded it an hour ago. Do I have to wait another 45 seconds?"
- "Is it stuck? It's been 45 seconds and it just says Grading."
- "The empty squares on the cards: are those for selecting? Oh, Compare 3 appeared."
- "Dealbreakers? On the parcel it said Must have. Same thing?"
- "What money can't add: what does that mean?"
- "I can only see one and a half parcels at a time; I have to swipe back and forth to compare."

**Confusing things:**
- A graded parcel that I closed without adding to the list loses its grade and isn't in Recent. Nothing warned me
  that closing would discard it.
- Grading takes 22-55 s and only shows "Grading..." (the "Steps" detail exists but only afterwards).
- The compare checkbox has no label on the card; it's a bare square.
- Section names differ between the parcel card ("Must have", "Really want") and the compare table
  ("Dealbreakers", "What money can't add").
- On the phone only ~1.5 parcel columns fit; comparing three means swiping.
- "Grade · verdict" as a row name; the footer says costs "say 'not yet' until the app prices them", but costs are
  shown.
- Parcel number results show a code (51063, 51077) for Virginia but a name ("Carter") for Tennessee.

## Task 5. Ask your partner about Mud Creek; answer as partner; see the answer

**Outcome:** done.

**Steps:**
1. More (bottom right): a sheet with "Profile: Profile 1 ▾", "Answer a few questions (about 4 min)", Where to look,
   Help, Settings. Nothing about a partner or household. (`t05-more`)
2. Settings: Export file, Import file, "Sync across devices", then Thresholds ("House site: min cell score"...).
   (`t05-settings`)
3. Sync across devices: "Start syncing this device" / "Join with a code". (`t05-sync`)
4. Start: a QR code and a 26-character code, with a warning "This code works like a password ... Use it only on your
   own devices". (`t05-sync-start`, `t05-sync-code`) Done: "This device is synced." (`t05-sync-done`)
5. **Partner (phone2):** More > Settings > Sync across devices > Join with a code: a code box. (`t05-p2-join`)
6. Typed the code, Join: "Join this synced space? ... It holds 3 parcels." Join again. (`t05-p2-joined`)
7. "Who's this? Pick yourself ... Profile 1 / I'm new here". (`t05-p2-joined2`)
8. I'm new here: "What should we call you?" plus a red-flag toast: "A change on this device wasn't saved: New
   member. It's kept on this device. Try again / Discard". (`t05-p2-new`) Try again: the toast went away.
   (`t05-p2-tryagain`)
9. Name "Alex", Continue: question 1 of 14 (climate). Tapped "Not now" and landed on the map. (`t05-p2-name`,
   `t05-p2-notnow`)
10. **Me (phone):** closed Settings (Cancel), Your list, Mud Creek's "...": Report card, Move up, Move down, Remove
    from favorites. No "ask". (`t05-close`, `t05-mud-menu`)
11. Tapped the Mud Creek card: a panel with "Added by Profile 1", Open on the map, "Archive...", + Walked, +
    Offered, Notes, then the full report card. (`t05-open-mud`)
12. Far down: "How Alex would rate it ... Answer as Alex here / Ask Alex", then "Your take: Yes / Maybe / No".
    (`t05-ask-section`)
13. Ask Alex: a note box. Typed "What do you think? Septic is the worry." and Ask: "Asked 10/23 ... it's in Alex's
    Waiting for you." (`t05-ask-tap`, `t05-asked`)
14. **Partner:** Your list shows a red "1" on the Your list tab, a "Waiting for you (1)" filter, and on the Mud
    Creek card "Profile 1 asked for your take: ...". (`t05-p2-list`)
15. Opened Mud Creek: the ask is quoted above Yes / Maybe / No. (`t05-p2-open-mud`) Picked Maybe, wrote "Love the
    elevation. Let's get a perc test before we decide.", Save my take: "Sent to Profile 1." (`t05-p2-answered`)
16. **Me:** within ~35 s, the open Mud Creek panel showed "Maybe Alex's take, 10/23" with the comment.
    (`t05-see-answer`) Back on the list, though, nothing on the Mud Creek card says Alex answered. (`t05-list-after`)

**Wrong turns:** More menu and the Mud Creek "..." menu (steps 1, 10) before finding it at the bottom of the open
parcel.

**Time to find:** getting Alex in: 3 actions (`t05-sync`), but only because I guessed "sync" would do it. The Ask:
7 actions (`t05-ask-section`).

**Your words:**
- "How do I add my partner? There's no 'household' or 'invite'. Maybe sync?"
- "'Use it only on your own devices' ... but I'm about to give it to Alex. Am I doing something wrong?"
- "A change wasn't saved: New member? I haven't done anything yet."
- "Who is Profile 1? Oh, that's me. I never got asked my name."
- "Ask Alex is at the very bottom of a very long page."
- "Profile 1 hasn't said what matters to them yet? I've been grading parcels for an hour with whatever the app
  picked."

**Confusing things:**
- There's no "invite your partner"; the only way in is a device-sync code whose warning tells you not to share it.
- I'm "Profile 1" everywhere ("Added by Profile 1", "Profile 1 asked for your take"); the app never asked my name on
  this device.
- The "change wasn't saved: New member" error on Alex's first screen.
- The Ask control lives at the bottom of the open parcel from Your list; it isn't on the map's parcel sheet or in the
  "..." menu.
- "Archive..." (useful for task 2) only appears here, not on the map sheet where I was deciding.
- The answer showed on my open panel without a refresh (good), but the list card has no marker that Alex answered.

## Task 6. Find which parts of the region would suit you

**Outcome:** done.

**Steps:**
1. More > "Where to look": a ranked list of areas, "Ranked by how well typical land here fits your priorities":
   #1 Highlands and Cashiers A-, #2 Burnsville and Celo B+, #3 Ashe County B+, Boone, Banner Elk... each with "What
   holds it back", a star and "Show me a parcel here". (`t06-where`, `t06-where2`) (I'd also seen this list on the
   very first search tap, `t01-search-open`.)
2. "Show me a parcel here" on Ashe County: the map opened a "Sample parcel 1 · Ashe County (West Jefferso..." with
   "B Not for us ... fails your must: no driveway route found." Two notices stack at the top ("Zoom in to see parcel
   lines" over "An example lot, not a listing"). (`t06-show-ashe`)
3. Closed it, opened Map layers: basemaps, Parcel lines, Light pollution, "Area outlines". (`t06-layers`)
4. Turned on Area outlines and closed the panel: nothing visible; I was zoomed in. (`t06-areas`)
5. Zoomed out twice: the areas appear as coloured shapes with grade chips (B, B+, C+...), but no names at this zoom.
   (`t06-zoomout`, `t06-zoomout2`)
6. Tapped a B+ area: a popup for Ashe County with the same text as the list. (`t06-tap-area`)
7. Tapped its star twice: it stayed hollow both times. (`t06-star`, `t06-star2`)
8. Back in More > Where to look, starred Ashe County there: it turned solid ("Starred"). (`t06-star-list`)

**Wrong turns:** "Show me a parcel here" (step 2) gave me a sample lot rather than the area; the star on the map
popup (step 7).

**Time to find:** 2 actions to the ranked list (`t06-where`); the map version took 6 more (`t06-zoomout2`).

**Your words:**
- "Highlands and Cashiers is near Georgia. I said southwest Virginia and the NC/TN corner. Why is it #1 for me?"
- "B but Not for us? Which is it?"
- "I turned on area outlines and nothing happened." (zoomed in too far)
- "The star doesn't do anything on the map."
- "Where's the close button on this popup? Oh, that tiny x in the corner."

**Confusing things:**
- The list includes areas outside the region I care about, at the top, with no way I could see to tell it my region.
- A sample parcel graded "B" with the verdict "Not for us" (a letter grade and a verdict that disagree).
- The map popup's star doesn't toggle; the list's star does.
- The map popup's close "x" is tiny (about 10 px), far below 44 px.
- Area outlines show grades but no names until you tap; the layer does nothing visible when you're zoomed in.
- The sample parcel's title is cut off ("Ashe County (West Jefferso...").

## Task 7. Correct something the app says about Mud Creek

What I picked: the app says "Check first: no soil on the parcel rates better than very limited for a septic field".
What I know: the seller has a county septic permit for a conventional system (perc test 2024).

**Outcome:** done (after one dead end).

**Steps:**
1. Your list > Mud Creek: the panel with the report card. (`t07-open-mud`)
2. Tapped the Septic line: a "Septic · Mud Creek" sheet explaining the soil (Conventional / Modified / Alternative
   strip, "Pigeonroost: very limited", what it means). Its footer says "A septic permit you mark passes it", but
   there's nothing here to mark one. (`t07-septic`, `t07-septic-snap`)
3. Closed it and tapped "Open on the map": same report card in the map's parcel sheet. (`t07-on-map`)
4. Tapped Septic there: the same sheet, but this one has "Adjust for this parcel: Count it as passed / Set aside
   for this parcel". (`t07-map-septic`)
5. Count it as passed: "Why? (required)" box. (`t07-count-passed`)
6. Wrote the permit reason and Save: "You count it as passed; the app says Check first. 'Seller has a county septic
   permit...' Remove adjustment". (`t07-saved`)
7. Closed: Septic now shows a pencil, a faded "!" and a green check with my reason; the summary reads "... With 1
   override: Septic". The grade stayed B Contender. (`t07-card-after`)

**Wrong turns:** the Septic sheet opened from Your list (step 2) has no adjust controls; found them by opening the
same parcel on the map.

**Time to find:** 5 actions (`t07-map-septic`).

**Your words:**
- "It says 'a septic permit you mark passes it'. Where do I mark it?"
- "Why is the same Septic box different here than on my list?"
- "Count it as passed: fine, but I wanted to say 'there IS a permit', not just overrule it."
- "Pigeonroost? Is that the soil? 'Soilswhat the ground will let you do', missing space."

**Confusing things:**
- The factor sheet from Your list lacks "Adjust for this parcel"; the one from the map has it.
- The help text promises a "septic permit you mark", but there's no permit control; you have to use a generic
  override with a reason.
- The septic row after the override shows both a faded "!" and a green check side by side: two signals, little
  explanation.
- Heading "Soils" runs into its subtitle ("Soilswhat the ground will let you do") in the accessible text; on screen
  it's fine.
- The sheet is long and technical (NRCS units, bedrock cm, "From the report ... 'overall' score mixes site quality
  with build cost").

## Task 8. Make a report on Mud Creek to send or print

**Outcome:** done.

**Steps:**
1. On the map sheet, "...": one item, "Report card". (`t08-menu`)
2. Tapped it: a Report card page with "One page / Full" tabs, "Print or save as PDF", and a preview of the printed
   page: map of the parcel with the best site, grade, costs, Must have / Really want tables, "Takes: Alex says
   Maybe ...", "Questions for the agent". (`t08-report`)
3. Tapped "Print or save as PDF": nothing visible happened in this browser (no print sheet appeared to me).
   (`t08-print`)

**Wrong turns:** none.

**Time to find:** 1 action (`t08-menu`).

**Your words:**
- "Report card. That must be it."
- "The preview is tiny. 'Pinch to zoom', OK, but I can't read anything at this size."
- "I tapped Print and nothing happened?"
- "There's no Share button. To send it to Alex I'd have to save a PDF and then find it."
- "My septic note isn't in it; it just has a pencil mark next to the check."

**Confusing things:**
- No Share/Send; only Print or save as PDF, which on this phone browser gave no visible response.
- The one-page preview is unreadable at phone width without pinching.
- The Septic row in the report shows "✓ ✎" next to the app's own text ("No soil ... rates better than very
  limited"), not my reason for overriding it, so the reader sees a pass next to a sentence that says it fails.
- "Questions for the agent: Nothing for the agent: every must was checked": my override silently dropped the perc
  test question that was there before.

## Task 9. Make the night sky matter more and see how the grades change

**Outcome:** done.

**Steps:**
1. From the report page there's no bottom bar; tapped "← Back" to return to the map. (`t09-back`)
2. "What matters" tab: an explanation of Must have / Really want / Nice to have / Don't care, then the lists. Night
   sky is 4th of 7 under Really want. A "Try it on: Mud Creek, B · Contender" bar is pinned at the bottom.
   (`t09-what-matters`)
3. Tapped Night sky: a sheet "A night sky of at least 21.2 mag/arcsec²", a slider, "How this item is graded: A 21.5+
   · B 21.2 ...", Move to (Must have / Nice to have / Don't care / Up / Down). (`t09-night-sky`)
4. Tapped Up three times: "Really want, #1 in the list". (`t09-up3`)
5. Closed it: the bottom bar now reads "Mud Creek: B → A · Contender. Night sky now counts more · Best homesite now
   counts less". (`t09-after`)
6. Your list: Mud Creek is now A ✎; Ferney and Roan stay B, and the factor lines now start with "Sky". (`t09-list`)

**Wrong turns:** none (one extra tap: the report page has no bottom navigation).

**Time to find:** 2 actions (`t09-night-sky`).

**Your words:**
- "21.2 mag per arcsecond squared? I just want to see the Milky Way."
- "Up, up, up. Nice that it tells me Mud Creek went B to A right away."
- "Is the A on Mud Creek because of the sky or because I overrode septic? The pencil makes me unsure."

**Confusing things:**
- "mag/arcsec²" and the slider's numbers mean nothing to a layperson; "How dark is it overhead?" (collapsed) is
  where the plain explanation lives.
- The sheet covers the list, so you can't watch the item move while you tap Up.
- "Try it on" only previews one parcel at a time; to see all three I had to go to Your list.
- The report page has no bottom bar, so getting anywhere else means Back first.

## Task 10. Draw the old logging track on Mud Creek and use it as the driveway

**Outcome:** done, but with a lot of fighting the map.

**Steps:**
1. Your list > Mud Creek > Open on the map: the sheet covers the map. (`t10-on-map`)
2. Details > Lines & marks > "Draw a line": the sheet drops, a toolbar "Track / Existing drive / Easement · Undo
   point · Finish" appears (Finish is cut off at the right edge), and the map is zoomed far out; the parcel is a
   tiny orange shape under the 3D button. (`t10-draw-line`)
3. Zoomed in on it and dragged the map down to see the parcel. (`t10-zoom`, `t10-pan`)
4. Tapped six points along the track: only the first counted. The second tap opened an "Grayson Highlands" area
   popup (the Area outlines layer from task 6 was still on) and the rest landed on the popup. (`t10-points`)
5. Closed the popup (tiny x) and tapped again: the point was added AND the popup opened again, and the map slid.
   (`t10-point2`)
6. Map layers > turned Area outlines off. (`t10-areas-off`) Then four taps worked: "6 points · 1,234 ft".
   (`t10-points2`)
7. Finish: the sheet shows "Grade again: lines changed" and "Track 1, pioneer · 1,234 ft" under Lines & marks.
   (`t10-finish`)
8. Opened Track 1: Name, What it is (Track / Easement / Existing drive), condition (Uncleared / Pioneer / Improved /
   Paved), Width, a note, Edit on the map. No "use as driveway". (`t10-track-tap`)
9. Renamed it "Old logging track" and tapped "Grade again": 50 s of "Grading..." (`t10-regraded`), then A Contender,
   but the best homesite still says "2,888 ft drive at 18%" (the app's own route, not mine). (`t10-regraded2`)
10. Lowered the sheet to look at the map: the parcel was off the bottom of the screen; panned to it: numbered sites,
    S4/S5, E2/E3, a "Stand here" label, a fan of thin lines from site 1, yellow switchbacks. I couldn't pick out my
    track. (`t10-sheet-down`, `t10-pan2`)
11. Details > Old logging track again: now it shows "1,234 ft · avg 29% · steepest 53% over 30 m" and a "Use as my
    driveway" button. (`t10-track-details`)
12. Tapped it: a green banner "Legal road access: ✓ → ! · Driveway on your land: ✓ → ! · Contender → Maybe"; the
    button became "Use the app's pick". (`t10-use-driveway`)
13. Grade tab: "Held at Maybe by: Legal road access and Driveway on your land"; "your route is steeper than your veto
    (53% vs 25%)"; Ready to build dropped to $75-205k. The Best homesite line still says "2,888 ft drive at 18%".
    (`t10-grade-after`)

**Wrong turns:** taps going to the area popup (steps 4-5); looking for "use as driveway" before re-grading (step 8);
hunting for the parcel on the map (step 10).

**Time to find:** about 17 actions to "Use as my driveway" (`t10-track-details`).

**Your words:**
- "Where's my parcel? It's a speck at the top behind the 3D button."
- "Every tap opens this Grayson Highlands box. I'm trying to draw!"
- "Is Finish the thing cut off on the right?"
- "Pioneer? What's a pioneer track?"
- "I drew it. How do I tell it this is my driveway?"
- "It still says 2,888 ft drive at 18% for the homesite. Is it using my track or not?"
- "The banner says Contender → Maybe but the grade badge still says A. A Maybe?"

**Confusing things:**
- Draw mode doesn't zoom to the parcel; it starts zoomed out with the parcel hidden behind the top buttons.
- With Area outlines on, every tap while drawing also opens an area popup that covers the map; drawing and the area
  layer fight.
- The draw toolbar's "Finish" is cut off at the right edge at 375 px.
- "Use as my driveway" only appears after a re-grade (about 50 s), and only inside the line's details on the
  Details tab.
- After using my track, the Best homesite still quotes the app's drive (2,888 ft at 18%), contradicting "the card
  scores its route as your driveway".
- Grade letter A next to the verdict "Maybe" (again a letter and a verdict that disagree).
- "Pioneer", "veto", "bank 19 ft", "bend 25°": jargon.
- After closing the sheet the map isn't centred on the parcel; the map is cluttered with labels (1-4, S4, S5, E2, E3,
  "Stand here", a fan of lines).

## Task 11. Find out what it would cost to build on Mud Creek

**Outcome:** done (with a caveat: the app gives the cost of everything except the house).

**Steps:**
1. On Mud Creek's Grade tab, "Cost to enjoy" shows "Ready to camp $0-1k plus the land" and "Ready to build
   $75-205k plus the land", with "Tap a line for its breakdown". Tapped Ready to build: a "Cost to enjoy" sheet.
   (`t11-build-cost`)
2. Read the breakdown: pioneer track and campsite clearing for camping; for building: finished driveway, "Upgrade
   the existing drive, 1,234 ft (pioneer) $48,300-117,700" (my logging track, including paving 1,033 ft of steep
   stretches), culverts, well $4.5-32k, "Septic, modified $7-20k", power 72 ft from the road, service hookup,
   clearing, house pad. "Published ranges, not a quote." Then a "Still unknown" checklist (deed restrictions,
   mineral rights, insurance...). (`t11-build-cost2`)

**Wrong turns:** none; the cost was on the card from the start (I'd seen it in task 1).

**Time to find:** 1 action (`t11-build-cost`).

**Your words:**
- "Ready to build $75-205k plus the land. Does that include the house? Oh: 'everything but the house'. So what does
  the house cost?"
- "Septic, modified, $7-20k. I just told it there's a permit for a conventional system."
- "'To lower it: Mark a septic permit with its class.' Where? I looked for that in task 7."
- "A Virginia parcel priced off an NRCS Tennessee schedule?"
- "Upgrade the existing drive: 1,234 ft × $14-25/ft is about $17-31k, but it says $48-118k. Oh, there's a second
  line about paving."

**Confusing things:**
- "Cost to build" excludes the house; there's no house estimate or a place to put one, so the headline number isn't
  what I'd call the cost to build.
- My septic override (conventional permit) didn't change the septic cost line; the hint to "Mark a septic permit"
  points to a control I never found.
- Each cost line shows a "×" formula whose numbers don't multiply to the total when a second sub-line (paving) is
  folded in.
- Sources named in-line (NRCS Tennessee for a VA parcel, "Mountain Electric Cooperative ... eff. Oct 2015") make the
  numbers feel less trustworthy, not more.
- "Still unknownnot in any dataset?" runs together in the heading.

## Task 12. Open the app on your second device and have your parcels there

**Outcome:** done (the device was already joined in task 5); one mismatch found.

**Steps:**
1. On phone2 (joined with the sync code in task 5, currently set to Alex), reloaded and opened Your list: all three
   parcels are there, Mud Creek with my driveway change (build $75-205k). Each card shows "You B ... · Profile 1 B".
   (`t12-p2-list`)
2. More: "Synced", Profile "Alex ▾"; opened it: Alex · current, Profile 1, Rename / Delete each, "Add a profile".
   (`t12-p2-switch`)
3. Tapped Profile 1 (me): the list now shows my grades and factor order (Sky first), a "New takes (1)" filter and a
   red 1 on Your list. But Mud Creek reads **B** ✎ Maybe here. (`t12-p2-as-me`)
4. On my phone, the same parcel for the same profile reads **A** ✎ Maybe. (`t12-phone-list`)
5. Opened Mud Creek on phone2: "B Maybe. Strong dark skies and elevation; check first: legal road access and
   driveway ... With 1 override: Septic." Same words as the phone, different letter. (`t12-p2-mud`)

**Wrong turns:** none.

**Time to find:** 2 actions to switch to me on phone2 (`t12-p2-switch`); the parcels were there without doing
anything.

**Your words:**
- "Good, they're all here."
- "To be me on this phone I switch profiles from Alex. So this is really a shared phone, not 'my second device'."
- "Mud Creek is A on my phone and B here. Which one is right?"
- "New takes (1): I already read Alex's take on the other phone."

**Confusing things:**
- Same parcel, same profile, two devices, two grades (A on phone, B on phone2) with identical text.
- "Seen" is per device: Alex's take shows as new again on the second device.
- The first device never asked my name, so I appear as "Profile 1" on every device and in Alex's view; Rename is
  hidden in the Profile switcher.
- The Your list filters differ between devices ("Waiting for you", "New takes", "Both like it" on phone2; only
  Filters on my phone), which makes the two look like different apps.

## Overall

**What I think the app is for:** checking whether a piece of rural mountain land is good for building a home (flood,
road access, septic, sun, elevation, sky, trails, cost of getting a site ready), keeping a shortlist, comparing,
and deciding with a partner.

**Easiest:** the report card after grading (a letter, a verdict, a one-line reason, then Must have / Really want);
"What matters" (tap a factor, Up, see B → A right away); the Report card page; asking Alex and seeing the answer
arrive.

**Hardest:** finding the parcel (parcel-number search only works when zoomed into the county; the map shows no pin at
the coordinates); drawing a line on the phone (map not centred, area popups stealing taps, "Use as my driveway"
hidden until after a ~50 s re-grade); getting a partner in (through a device-sync code that warns you not to share
it).

**Three things I'd most want changed:**
1. Finding a parcel: let the parcel number search work from anywhere (or say which county to zoom into), keep
   results local instead of worldwide, and drop a pin at searched coordinates. Don't throw away a graded parcel (or
   zoom out) when I close its sheet.
2. Drawing and driveway on the phone: zoom to the parcel when drawing starts, ignore area popups while drawing, keep
   "Finish" on screen, and offer "Use as my driveway" right when I finish the line; make the homesite line agree with
   the chosen driveway.
3. Partner and decisions: a real "invite my partner" flow and a name for me on first use (not "Profile 1"); a "not
   for us" decision with a reason available where I'm looking (the map sheet), and the same adjust controls in every
   copy of the factor sheet. And make the same profile's grade match across devices.
