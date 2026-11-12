# Polish list

The fresh-eyes reviews' findings that are left as they were. Each is either pre-existing or outside the step that found it
(owner, 2026-10-20). One line each gives the screen, the problem and the fix in a few words.
- Every hand-back appends its own leftovers under its step.
- Zach schedules a polish pass every few steps.

Polish pass 2 (#360–#365, plan `docs/plans/polish-2.md`) triaged the whole list. It fixed or decided every item it
could, and the earlier lines and their fixes are in git and in that plan. What's below is only what was deferred, each
with its reason.

## Deferred by polish pass 2

### Map and toolbar
- **Pins overlap at the default zoom** ("2" and a garden pin, "E3" under "1"). A zoom separates them; collision nudging
  is real code for a rare case.
- **Places points under the map's controls.** Padding the map would shift every fit and fly-to; a pan shows them.
- **Icon-only map buttons.** Each has a title and an accessible name; captions would crowd the phone's row.
- **The house map's red-to-green ramp** isn't colour-blind safe. A palette across every overlay is a design job of its own.

### The parcel panel
- **"Grade again" twice**, the banner's and the toolbar's (or the sheet's). The banner's action is yours (polish #1:
  one banner, one action; #240: "as the toolbar's"). Drop it if you'd rather.
- **Amber "Maybe" beside a green B.** Two colours for two meanings, the verdict and the letter, by design.
- **Not for us** in Details › Status and the header; **+ Mark** in Details and the toolbar. Each is the reachable one
  where it sits: a phone's tall sheet hides the toolbar, and Status lists the parcel's standing.
- **FROM THE REPORT's score beside the letter**, and the Override row's **"Set aside for this parcel"**. The score is the
  report's own, and the block says so; the button's words are the card's (rule 7).
- **"held by"** in the verdict. The wrap that split it is fixed (#362); rewording it is report text you didn't ask for.
- **Long view:** "the longest" beside "1% open past 3 mi", and its caveat shown twice in the panel. Both fixes would
  remove report text, not add it.
- **The cost breakdown's out-of-state sources** (NRCS Tennessee, NC culverts) under a Virginia parcel. The regional
  ranges are deliberately the Blue Ridge's; `where` could be shown if it confuses in use.
- **Camp's Yes "within 300 ft of a road"** beside a private road. It needs the road's ownership in Uses.
- **Hunt's threshold.** "36% forest, under 50%" already says it. What changes "1 house within a quarter mile" is the
  county's rule, which the panel lists.
- **The routed driveway's "at ≤15%"** beside the measured 17.9% over 30 m. That line is the engine's (`lib/screen`,
  `expected.json`); worth fixing only with the next engine change.
- **"1.0 = half the sky's light is man-made"** in print. It's plain enough, and it's the prototype's parity text.
- **The parcel next door's hint, "Tap the parcel next door…"**, on a desktop. One word of report text (`raise.ts`).

### Your list and Compare
- **Short grid headers** ("Sun", "Own drive"). The plan's labels (step 10b §8), with the full name in each header's
  title.

### What matters and the interview
- **One way to move on.** The screen's Continue and the nav row's Next both show on a revisited multi-row question. One
  word for both would put two identical buttons on one screen.
- **"85% clear" vs "A from 95%".** The sheet's slider says "…85% for a B" (#337). The card's plain line follows the
  other rows.
- **The climate follow-ups' orders** (Winters: Mild first; Summer: Keep it cool first). Both run from the gentlest
  weather to the harshest. Q1's scene ("hot summer days") describes the place, and its choice names the preference.
- **"Profile 1".** The name is asked for at setup; only skipping keeps it, and the picker renames it.
- **The weights notice's "Nice to have 0"** didn't reproduce. The table is per item now, and the column's count is live.

### The report export
- **The elevation profile has no axes.** It's the prototype's drawing, kept by the parity test.

## Polish pass 2's fresh-eyes review (hand-back)

The review of the pass's after shots. The fixes are listed in #365; these are the findings it left, outside the pass or
for you to decide.

- **Best homesite and One page:** "1st · Site #1, 2nd · Site #2, 3rd · Site #4". The numbers are the map's pins in the
  app's rank, and the order is yours, so a gap reads as a missing site. Fix: say so in the list, or number by your order
  (it touches the pins' ids).
- **One page:** "Ways to raise this grade: Set aside Trails…: grade B → A" can read as gaming the score; "Can divide:
  up to 21 lots" sits without a heading; "43.88 ac · Graded" says no date. Report text and layout.
- **Grade › Cost to enjoy and Price and cost** repeat Ready to camp and Ready to build, and the note's "to build is
  everything but the house" sits beside "Ready to build". Report text (Z-4's design).
- **Best homesite's "as good", "8 points behind", "9.4× footprint"** use scales the panel doesn't define. Report text.
- **The interview's back link** says "← Map (answers kept)" even when it was opened from What matters; Q1's choice words
  ("Cool and snowy") differ from its scene ("frigid winter nights").
- **Settings' scoring thresholds** ("min cell score (0–100)", "shelf acres to rank as a cut-pad house site") are the
  advanced settings' own words. Fix: plain labels, or under an Advanced fold.
- **Details:** its headings are capitals where Grade's aren't, and the Listing box shows the parcel's name with Edit ▾,
  not what a listing is.
- **What matters on a phone:** the Try it on select is cut ("Ferney Creek, Floyd Co…"); Undo, Reset and the questions
  link share one row.
- **Your list on a phone:** the "?" beside the title doesn't say it opens the key.
- **The phone's tall sheet:** the map's floating buttons sit over the Stand here pin in the strip of map left.
- **"Ask someone"** in the header could say whom ("Ask the household").

## Step 15's fresh-eyes review (hand-back)

The review of the step's screenshots (How it could pay, the credit slider, a split's break-even, Roan). The fixes are
in the hand-back's PR 6; these are what it left, outside the step or for you to decide.

- **No summary over How it could pay** ("2 ways this could pay"), and "Uses" doesn't say money. A tally line like
  Grade's shortcut could lead it; it would be new UI.
- **"Not eligible" where a county has no program** (Grayson's use-value) can read as a judgment of the land. The
  reason says why; "None in this county" as a fourth chip word would be a product call.
- **Carbon at 29 ac is Maybe, at 8.9 ac Not eligible**: within 20% of the minimum is Maybe by design (ours).
- **Why houses near matter to hunting** isn't said in Hunt's reason (step 14's words).
- **Split and resell's reason is Divide's long sentence**, and its 30.15 ac is the county map's acres against the
  header's 29.31 (step 14, #311: Divide counts the map's or the listing's acres). The east piece failing frontage
  beside "up to 8 lots by frontage" is the piece's own frontage, not the whole parcel's.
- **The piece cards** (step 14): "Your grade", "not priced: the way in isn't routed yet", "Add this piece to the
  list", a D piece passing the county's rules while a B fails them, and the cards' buttons at different heights.
- **Every source line says "(to confirm)"**: one note under the heading now says what it means; the lines stay until
  the official pages are read (the network policy denied them).
- **The slider has no min and max labels.**
- **The header** ("held by", "Maybe" and "B" splitting on a phone, the tax map shown twice), "Terrain tiles didn't
  load", the map labels under the phone's buttons, the legend's "Second choice", the toolbar's bare trash icon, "Ask
  someone", and the Maybe chip's contrast: all outside the step.

## The existing-house step (hand-back)

- **A listing fact, "Forest carbon: enrolled"** (owner, 2026-11-10): it would turn the forest carbon row into
  "Enrolled — the contract runs with the land; get the contract".
- **The Full report titles a planned house site "The existing house"** (owner, #416 review): with the `existing` flag
  off, the house point is a planned site, but the section ("The existing house") and the Lines & marks layer
  ("Existing house") still say existing. "House site" would read right there.
- **The map key's "Rough lidar texture" row** is a fixed legend: when 3DEP fell back, the tips name the Terrain Tiles
  but the key doesn't.
- **The router's back-road speeds** (owner, 2026-11-11, plan §2b): the public OSRM server's car profile drives
  Virginia's back roads at 25 mph (Brumley Gap, Poor Valley), 15 (Tumbling Creek, Hidden Valley) and 9 on unpaved
  WMA roads, so its times run well past Google's (Laurel Bed Lake 51 min from 010-A-10's house against 20–30). Every
  back-road drive is slowed alike, so the order of places holds; changing it means another router or our own profile.
- **The area catalog's sample parcels have no other lakes** (§9.81): they're engine 37, and
  `SAMPLES_RESCREEN=1 pnpm areas:samples` (a full screen each, by hand) would add them.

- **Pruning trail lots OSM has dropped** (owner, #420 decision): the trail-lot pass merges each quarter cell with the
  lots already shipped, one per OSM id, so a lot deleted from OSM lingers. Prune a lot missing from N bakes in a row.
- **Bake 5 came back short of the trail-lot bar** (owner, #420: ship it with the merge and the override; the numbers on
  Zach's ask, #425). The bar is the larger of main's baseline and bake 2's: main had no trail lots (the pass is new), so
  bake 2's, 1,140 found and 594 kept.
  - Bake 5: 547 after merging with the shipped, **593 short** of 1,140; 430 kept after merging with the other
    trailheads, **164 short** of 594; plus the Hayters Gap override.
  - The merge baseline was the branch's committed places: main's plus bake 4's (its 122 trail lots, 185 trailheads
    beyond main). Bakes 2 and 3 couldn't be recovered: their lots were overwritten in the committed files, and the
    workflow keeps no artifacts.
  - 34 quarters answered with none where the shipped had some, 165 lots in all, every one kept by the merge (none failed
    or retried, so most likely Overpass answering empty without a remark): 34_-87/nw 9, 34_-87/ne 2, 34_-86/ne 16,
    34_-85/nw 4, 34_-85/ne 11, 34_-84/nw 5, 34_-84/ne 11, 34_-83/nw 8, 34_-83/ne 8, 34_-82/nw 10, 34_-82/ne 1,
    34_-80/se 1, 34_-79/sw 1, 34_-79/se 1, 34_-79/nw 1, 34_-78/sw 5, 34_-78/se 3, 34_-78/nw 1, 34_-77/nw 3,
    35_-87/ne 1, 35_-86/sw 5, 35_-86/se 12, 35_-86/ne 1, 35_-85/se 3, 35_-85/nw 3, 35_-85/ne 2, 35_-84/sw 10,
    35_-84/se 8, 35_-84/nw 1, 35_-84/ne 6, 37_-76/nw 1, 38_-80/se 9, 38_-80/nw 1, 38_-80/ne 1.
  - A later bake merges on top, so a good run fills them in. The trail-lot rule (#425) then drops the town lots, so
    the bar, set before the rule, overstates what a full bake should keep.
- **Town lots counted as trailheads**: decided (Zach, #425). A lot counts only on a hiking route of 2 mi or more, or
  within 400 m of public land of 100 ac or more (lib/places/qualify.ts), applied to the shipped places by the places
  workflow's `qualify` job; its report is docs/places/trail-lots-qualified.md.
- **From the fresh-eyes review** (the hand-back's screenshots of 010-A-10, house marked):
  - **Ready to camp priced a new driveway to the marked house**: done (Zach, #425). With "House already here" the drive
    in isn't priced: Ready to camp lists "Existing drive — walk it and check its condition", with a drawn existing
    drive's length and steepest grade.
  - **The house mark reads "Stand here"** on the map: the bulls-eye carries the view's label and nothing says it's the
    house. A "House" label, or the key's row, would say so.
  - **The set-aside rows' check-instead line** follows "set aside: a house is already here" with no lead-in, so Septic's
    "Get the health department's permit…" reads like a check still to do. "Instead, check:" would separate them.
  - **"2 set aside" doesn't name them**: the answer line could say which ("Septic and Room to build").
  - **Build-site words on the house's rows**: "Elevation at the build site … at the marked house", "Best homesite … the
    house" (with the "The existing house" title above).
