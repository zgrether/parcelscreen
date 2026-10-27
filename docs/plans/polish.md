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
