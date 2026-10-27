# Polish pass 2 (plan, PR 0)

The brief (Zach, 10/27) is pre-approved and runs like a step:
- the branch `polish/2` from main once 14e (#358) had merged;
- this plan as PR 0;
- PRs into the branch, merged on green;
- one hand-back to main for Zach, opened as the last action.

**Out of scope:**
- new features;
- engine or grade changes;
- report text, other than the declared fixes in §3 that Zach approves;
- step 15.

## 1. The triage

Every open line in `docs/plans/polish.md` was checked against main at 9bdb7a1 (after 14e). Each is one of:

- **Fix:** UI only. That means wording that isn't report text, layout, sizing, wrapping, rounding, tooltips, states, or phone overlaps.
- **Decide:** a small behaviour or naming choice with an obvious best answer. The hand-back lists each one with its reason.
- **Zach:** report or verdict text, or a meaningful behaviour. There are eight, in §3, each with a recommendation. The pass goes ahead on the recommendations unless Zach answers before this PR merges.
- **Not worth it:** the one-line reason is given beside the item.
- **Done:** fixed already, with the PR that fixed it.

Duplicates are merged, and the polish.md lines each item covers are in brackets. The ids (M1, P1, …) are used in the PRs and the hand-back.

### Already done (struck in polish.md by PR 5)

| Item | Fixed by |
| --- | --- |
| What matters, Try it's "Pass" (step 3) | #240: the verdict reads "Not for us" |
| What matters, the Try it bar on a phone (step 3); Try it on's sheet over the columns (steps 11, 12) | #337 (P-7): the slim inline strip |
| Favorites a table, History a list, with different date words (step 8) | #337 (Z-8): Shortlist · Recent · Ruled out. Recent's date word is L2 |
| "Your list" opens on two lists (step 8) | #337: three named tabs with counts |
| The phone's grid strip cut off after five or six factors (step 10b) | #337 (Z-7): the top four chips |
| Compare's "Dealbreakers" and "Pass"/"Warning" (step 10b) | #337 (P-6): the card's tier names and ✓ ! ✗ ? in words |
| The phone toolbar's status over the map's buttons (step 13) | #308 (B-7) and #240 |
| Steps ▸, ⠿ and ⋯ as small targets (UX part 2) | #337 and #240 |
| "5 to a grocery" with no unit (step 9) | #272: the grocery has its own row |
| The household's "Why, for Sam: On the starting list." (UX part 2) | #240. What matters' card sheet still has it: W5 |
| Best homesite repeating the card's letters (step 10) | #288: measurements only |
| The 29.31 / 30.1 acreage (steps 9, 10b, 14) | #313 (§9.71): 30.15 everywhere but Terrain's grid count (§3, Z7) and Compare's two decimals (L4) |
| Suggestions' Must marks "Septic ! → ✓" (step 12) | #287: "Septic would pass". The grade and verdict arrows are Z3 |
| "Use as my driveway" beside "Use it" (step 12) | #287: online, the column shows Try it only |
| "Older screens: a later UX pass, item by item" (step 7) | This pass: its items are the ones below |

### Map and toolbar (PR 1)

| Id | Item | Call |
| --- | --- | --- |
| M1 | Results on the map: "Shown"/"Hidden" buttons don't read as toggles; "Surface" and "Horizon fan" are jargon (pass 1) | **Fix.** The ✓ toggles On the map uses. **Decide:** "Surface" → "Shading", "Horizon fan" → "Skyline rays", in the key too (it's UI: `lib/render/keyLine.ts`) |
| M2 | The map's marks with no key on screen: Stand here, entrances, second choice, water (UX 2, steps 12, 13, 14) | **Fix.** The key line names each mark as it shows. Map layers' "What's on the map" gains Stand here |
| M3 | The legend's "Best homesite" against the pin's "Stand here"; "The app's driveway" (14e) | **Decide:** the key line gains "Stand here: the skyline and sun from this spot", the pin's own title. "Best homesite" is the card's name and stays |
| M4 | Search's results cover the area card on a desktop (UX 2) | **Fix.** The area card hides while results show, as on a phone |
| M5 | "Tap a parcel to select it" and "Tap parcels to add them" on a desktop (UX 2, step 12) | **Fix.** "Click" where the pointer can hover |
| M6 | The tilt tip beside an open dialog or Map layers; its × tiny (14e, UX 2) | **Fix.** The tip hides while a dialog or panel is open; its × is a 24 px target |
| M7 | "Boundary ▾" has no title (UX 2) | **Fix.** "Change the boundary: add parcels, draw, split" |
| M8 | Small targets: the map's ⓘ, Map layers' ×, the parcel sheet's × on a phone (14e, UX 2, step 14) | **Fix.** 24 px on a desktop, 44 px on a phone |
| M9 | Places clusters don't say what they group (14d) | **Fix.** The kind's icon beside the count |
| M10 | The legend's ghost box behind "The app's driveway"; the parcel-lines hint under the key line on a phone (14d) | **Fix.** The swatch's outline; the hint stacks above the key line |
| M11 | "Zoom in to see parcel lines" while area outlines show; outlines unnamed far out (step 13) | **Fix:** the hint hides while outlines show. **Decide:** the five suggested areas are named at every zoom, and the others keep the letter (the pile of names was the reason) |
| M12 | An area's ☆ looks like a parcel's ☆ (step 13) | **Decide:** a pin glyph, "Pin this area's outline" / "Pinned" |
| M13 | "Areas that fit you" after the interview, "Where to look" on the map: two names for one box (step 13) | **Decide:** "Where to look" in both, with "areas that fit your answers" under it after the interview |
| M14 | The offline strip is red, covers "‹ Your list" on a phone, and doesn't say whether this parcel is saved (14e) | **Fix:** a calm dark strip below the back chip. **Decide:** "This parcel is saved on this device" when it is |
| M15 | Map layers: "state ortho"; three aerials with no hint; no scroll cue on a desktop; radios and toggles share the selected fill (14e) | **Fix.** "Aerial (state, the sharpest: VA, NC, TN)", "Aerial (USGS, nationwide)", "Aerial (Esri, worldwide)"; the fade on a desktop too; radios show a dot, not the fill |
| M16 | Jargon: "Terrain preview (about 10 m…)", "Typical values: the middle of 200 sampled spots" (UX 2) | **Fix.** "Terrain preview (rougher than the grade's 3 m lidar)"; "Typical: the middle value of 200 spots sampled on rural land here" |
| M17 | Pins overlap at the default zoom (pass 1) | **Not worth it:** a zoom separates them, and collision nudging is real code for a rare case |
| M18 | Places points under the map's controls (14d) | **Not worth it:** padding the map shifts every fit and fly-to; a pan shows them |
| M19 | Icon-only map buttons (UX 2) | **Not worth it:** each has a title and a name; captions would crowd the phone's row |
| M20 | The house map's red-to-green ramp (UX 2) | **Not worth it this pass:** a colour-blind-safe palette across every overlay is a design job of its own (deferred) |

### The parcel panel: Grade, Uses, Details (PR 2)

| Id | Item | Call |
| --- | --- | --- |
| P1 | The grade header wraps "Maybe", the B and ", held by: …" apart (14d) | **Fix.** The verdict holds together. The words are §3, Z2 |
| P2 | "Grade again" twice: the banner's and the toolbar's (steps 10, 10b, UX 2) | **Decide:** one in view. The banner keeps its words and drops its button where the toolbar's shows (a desktop); a phone keeps the banner's, since its tall sheet hides the toolbar |
| P3 | Grade again while offline is the panel's most prominent control (14e) | **Fix.** Quiet (no amber) while offline; the tap's message stays |
| P4 | Rows scroll under the Grade · Uses · Details tabs with no edge; the Grade tab opens mid-card after a reload (steps 10, 10b, 12) | **Fix:** a rule under the tabs. **Decide:** a parcel opens at the top of its tab |
| P5 | The section "?" and the panel's inline links are small on a phone (14d) | **Fix.** 44 px targets |
| P6 | The app's own letter in the Override row looks disabled (14d) | **Fix.** Full ink with a dashed outline |
| P7 | The struck letter beside the new one reads as two grades (step 12) | **Fix.** The old letter smaller and grey, with a firm strike |
| P8 | The Easement panel's columns wrap "Steepest, raw ground" over three lines (step 12) | **Fix:** wider columns. **Decide:** "Scored on the card" (UI) → "Your driveway now" |
| P9 | Details › a line: "doesn't change the cost yet" reads as unfinished; the note box cuts its text (step 8b, UX 2) | **Decide:** "Kept with the line; costs don't read it yet" (VR4 prices it, Zach #23). **Fix:** the note grows as you type |
| P10 | Uses: "§" dates bare (", 2026-10-23"); the Yes and Maybe chips pale; the pieces stack on a phone (step 14) | **Fix:** "checked 2026-10-23" and darker chips. **Decide:** a phone's two pieces sit side by side in a compact row |
| P11 | A river launch's card has no drive time and says why nowhere (14d) | **Fix.** "Not timed: rivers are listed, not graded" (the Places layer's card, UI) |
| P12 | Best homesite #3 against "the map's … are for site #1" (step 14) | **Fix.** "The map's sun, sky and driveway are for site #1, where the grade ran; Best homesite is #3" |
| P13 | "Grade the combination" disabled with one parcel, with no reason (step 12) | **Fix.** "Add one more parcel to grade them together" |
| P14 | "You drew or changed a line after this screen" (UX 2) | **Fix.** "…after this grade" |
| P15 | Amber "Maybe" beside a green B (14d) | **Not worth it:** two colours for two meanings, the verdict and the letter, by design |
| P16 | Not for us in Details › Status and the header; + Mark in Details and the toolbar (UX 2) | **Not worth it:** each copy is the reachable one where it sits (a phone's tall sheet hides the toolbar; Status lists the parcel's standing) |
| P17 | FROM THE REPORT's score beside the letter; "Set aside for this parcel" (14d, step 12) | **Not worth it:** the score is the report's own, and the block says it's from the report; the button's words are the card's (rule 7) |

### Your list, Recent and Compare (PR 3)

| Id | Item | Call |
| --- | --- | --- |
| L1 | "Sam B" beside "Sam says Maybe" with no labels (pass 1) | **Fix.** Titles "Sam's grade" and "Sam's take" |
| L2 | Recent's bare date (step 8) | **Fix.** "Graded Oct 3" or "Opened Oct 3" |
| L3 | "Filters · 2 on" with Show all (pass 1) | **Decide:** "Filters · showing all" when everything shows; otherwise the count against the default |
| L4 | Compare: ≠ has no key; 29.31 ac where the list says 29.3; small Open links and checkboxes (UX 2, step 10b) | **Fix.** ≠ in Compare's key; one decimal; 24 px targets |
| L5 | The grid scrolls sideways at 1280 with no cue; the best-in-column dot sits between columns (steps 10b, UX 2) | **Fix.** A fade on the right edge while there's more; the dot before the letter |
| L6 | The grid's merged Must cell puts a ✗ beside an A (UX 2) | **Decide:** a failing or unknown Must shows its mark alone; the letter stays in the panel |
| L7 | Every fixture a B though Macks has two Fs (step 10b) | **Zach:** §3, Z8 |
| L8 | Short headers "Sun", "Own drive" (step 10b) | **Not worth it:** the plan's labels (§8), with the full name in each header's title |
| L9 | Settings › Offline: Delete has no confirm; a saved row doesn't open the parcel (14e) | **Fix:** Delete with Undo. **Decide:** the name opens the parcel on the map |

### What matters and the interview (PR 3)

| Id | Item | Call |
| --- | --- | --- |
| W1 | The interview: the 1–4 circles look like ranks; Skip beside a pick reads as dropping it; "← Map" doesn't say the answers are kept (step 4, 14d) | **Fix.** The circles only where there's a keyboard (hover); "Skip this question"; "← Map (answers kept)" |
| W2 | The interview: a tap, Continue, See my priorities and Next all move on (step 4) | **Decide:** a one-pick question still moves on at a tap (its hint says so); every button that moves on reads Continue, and the last reads See my priorities |
| W3 | Ask-one: no Continue above the fold on a phone (step 11) | **Fix.** Its Continue stays in view at the foot. "← What matters" is right there (it came from What matters) |
| W4 | The climate follow-ups pre-selected without saying so until after both rows (step 11) | **Fix.** The line goes above them. The orders stay: both run from the gentlest weather to the harshest |
| W5 | What matters' card sheet: "Why: On the starting list." (UX 2) | **Fix.** "It's where the starting list puts it" |
| W6 | "85% clear" in What matters vs "A from 95%" on the scale (step 11) | **Fix.** What matters' line says "…85% open sky (your B)", its own words, not the card's |
| W7 | Two Driveway items, "Driveway" and "Driveway on your land" (step 10) | **Decide:** What matters' title "Driveway from the road" (EDITOR_TITLES only; the card keeps "Driveway") |
| W8 | The weights notice's percentages to a decimal (pass 1) | **Fix.** Whole percents. The "Nice to have 0" didn't reproduce: the table is per item now, and the column count is live |
| W9 | What matters' disabled Undo is an empty box; the browser's pale placeholders (UX 2) | **Fix.** The disabled button keeps its border and ink at lower contrast; placeholders at the panel's second ink |
| W10 | "Profile 1" (steps 10, 10b) | **Not worth it:** the name is asked at setup; only skipping keeps it, and the picker renames it |

### The area catalog (PR 1, with the map)

| Id | Item | Call |
| --- | --- | --- |
| A1 | "No weak spots for you: every factor here is a B or better" beside "What holds it back: Night sky, B" (UX 2) | **Decide:** "What holds it back" lists only factors below a B, and goes when there are none |
| A2 | A sample added to the list keeps "Sample parcel 1 · Damascus" as its name (step 13) | **Decide:** it's offered as "23.7 ac near Damascus"; the panel's Sample tag stays |

### The report export (PR 4)

| Id | Item | Call |
| --- | --- | --- |
| R1 | Side by side's Rock column reads 1.9500000000000002 (step 9) | **Fix.** One decimal, as the other columns read (a number's rounding, declared in §3) |
| R2 | One page's key, "Filled: the best site", with no sample symbol beside an outlined grade box (steps 10, 10b) | **Fix.** A small drawn symbol before each key word |
| R3 | The phone's tiny One page preview (step 10) | **Fix.** A "Full size" switch that shows the sheet at 100%, scrolled |
| R4 | The elevation profile with no axes (step 9) | **Not worth it:** the prototype's drawing, kept by the parity test |
| R5 | The rest of step 9's list | **Zach:** §3, Z7 |

## 2. The PRs

| PR | What | Phone checks |
| --- | --- | --- |
| 1 | The map and toolbar, Map layers, the offline strip, the areas (M1–M16, A1–A2) | 375 × 667 and 360 × 780 |
| 2 | The parcel panel's UI (P1–P14) | the same |
| 3 | Your list, Recent, Compare, Settings › Offline, What matters and the interview (L1–L9, W1–W9) | the same |
| 4 | The declared text (§3, as answered) and the export's UI (R1–R3) | the same |
| 5 | The after shots, the fresh-eyes review's fixes, polish.md left with only the deferred items, and the hand-back | |

Each PR runs typecheck, lint and the changed tests locally, then lets CI gate. PR 4 runs `pnpm expected`, so CI's guard
sees the declared report-text diff.

## 3. For Zach (8): text and one behaviour, each with a recommendation

All but Z3 are **additive** (rule 7): new words after the existing ones, never in their place. The goldens move by
those words only. No grade, verdict, flag or number moves. ENGINE_VERSION and the schema stay.

- **Z1. The limit's edge, said where it's crossed** (pass 1; steps 10b, 11). Today the reason reads "past your 20-minute
  limit" and nothing says that's a ranked edge, not a Must. A D on Hospital doesn't say your limit, and "3,543 ft, at
  least 1,800 ft" reads as two measurements. *Recommend:*
  - the reason adds "(a ranked limit, not a must)" the first time;
  - a D or F row adds "; past your 30-minute limit";
  - a Must line adds "(your limit)".
- **Z2. The verdict line** (14d, step 12). *Recommend:*
  - add #128's note: "Contender · B, with 1 override";
  - keep "held by" as it is; P1 fixes the wrap, which was most of the trouble.
- **Z3. Suggestions' arrows** (step 12): "parcel B → A" can read as a parcel named B. This is the one replacement here. It's panel-only text in `lib/report/raise.ts`, not in the export or the goldens. *Recommend:* "grade B → A", "verdict Maybe → Contender", and a no-break space so "B →" never breaks from "A".
- **Z4. Glosses on the card's rows** (steps 10, 11, 14d; UX 2). *Recommend all five:*
  - with no asking price, the cost note adds "No asking price yet, so the land isn't in these.";
  - the climate's snow and frost line adds "(at the station, not the site)";
  - "check the river's class" adds "(how hard its rapids are)";
  - "zone 3a" adds "(the atlas's light-pollution zones run 0, darkest, to 7)";
  - Privacy's quarter-mile count adds "(shown, not graded)".
- **Z5. A row's weight** (steps 10, 14d): "weight 5." reads as a fragment, and a Within budget F weighs little, unseen. *Recommend:* How it's scored adds the share, "weight 5 (3% of your grade)". DOIs and station names stay: they're the sources.
- **Z6. Uses' words** (step 14). These are One page's too. *Recommend:*
  - Divide adds "; a right-of-way is the way around the frontage rule" where the county allows one;
  - Hunt's and Camp's reasons add the threshold, "(Yes from 50%)";
  - Camp adds the road's caveat when it's private;
  - the first "pioneer track" adds "(a rough track cut for a 4×4)";
  - a split's piece with no route shows Ready to camp and Ready to build as "not priced", not one other row. This is the one behaviour here.
- **Z7. The export's printed blocks** (step 9), additive. *Recommend:*
  - Full's list heading adds "(your order)" beside Where to build's engine order;
  - "House sites found 2" adds "· 2 compact sites ranked too";
  - December sun's "at the largest house site" adds "(site #N)" when it is one;
  - Terrain's "Of 30.1 ac" adds "(by the elevation grid)";
  - "routed driveway … at ≤15%" adds "(the route's limit)";
  - "(E1 best)" adds "; the route starts from E2, the better way to the site" when they differ;
  - "the bench" adds "(the flat ground the site sits on)";
  - the footer adds the cost scale, "$ least to build … $$$$ most";
  - and "as of the screen" with no date reads "date not recorded". This is a broken phrase, not a reword.
- **Z8. The grid's grade cell** (step 10b): every fixture reads B though Macks has two Fs. *Recommend:* the grade's title says "A weighted average of every row; its weakest: Driveway F". It's a tooltip that reads the card's existing reason, with nothing added to the cell.

**Left as they are, unless you say otherwise:**
- "held by" (Z2);
- "Set aside for this parcel" and FROM THE REPORT's score (P17);
- the Long view's "the longest" and its caveat shown twice: a removal, not an addition;
- the cost breakdown's out-of-state source names. Their `where` ("regional (TN)") could be shown, but the regional ranges are deliberately the Blue Ridge's.

## 4. Numbers

None change. There's no engine, grade, verdict, flag, schema or ENGINE_VERSION change. The goldens and `expected.json` move only
by §3's added words, all in PR 4, with the `pnpm expected` diff summarised in its description.

## 5. Verification (proportionate)

- **Before and after shots of the changed screens only,** at 1280 and 375. The shots also run at 360 × 780, the brief's second phone. `screenshots/polish-2.spec.ts` takes them, with POLISH_TAG `before` on main and `after` on the branch.
- **The fresh-eyes review** runs on the after shots. Its in-scope findings are fixed in PR 5, not added back to polish.md.
- **polish.md ends the pass with only the deferred items,** each with its reason. Those are M17–M20, P15–P17, L8, R4, W10 and §3's "left as they are". Every other line is struck through, with the PR that fixed it.

## 6. Stop conditions

These are the mission's own:
- a change would move `expected.json`, or verdict or flag text, beyond §3;
- a product decision comes up that isn't here;
- the same CI failure survives 3 attempts;
- the plan turns out wrong.
