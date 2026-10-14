# The parcel workflow: from a listing to the household's list (plan)

The owner asked for this plan on 2026-10-13: the flow Zach and Julie want, from a parcel (often a Redfin or Zillow
listing) to a shared, ordered list of the land they're weighing. It replaces follow-up 56's separate plan ("use a
drawn line as my driveway"), which is §3.4 here, and it carries the pricing of a line by its condition. Docs only:
**Approved** by the owner on #128 (2026-10-14), with the answers in §10 applied below.

It spans two phases. What can run on this device, in the browser's store and the export file, comes first (§7).
Accounts, sync and Julie's own login are Phase 1, and §8 rewrites PLAN.md's Phase 1 section to match.

## 1. The flow, against what exists

| Step | Today | Gap |
|---|---|---|
| **1. Pick a parcel** | Tap a county outline (VA, NC, TN), search a place, combine parcels, split one, or draw a custom shape (13b–13e). | Start from a listing URL (§2). |
| **2. Rough grade** | Screen it: the report card's dealbreakers, graded rows and verdict, in Zach's or Julie's weights (VR2–VR5). | Cost to enjoy reads "pending" until VR4 and follow-up 47 (the builder quote). |
| **3. Add what the listing or a visit knows** | Drawn lines with a name, kind (track, easement, existing drive), condition, width and note (34, #127). The existing-house bulls-eye. | Point markers: spring or well, septic permit, building, power, and others (§3.2). Pricing by condition (§3.3). "Use as my driveway" (§3.4). |
| **4. Listing facts and a name** | The asking price, with the date entered (B2a), and Notes. The parcel's name is derived (the county parcel ID, or "Drawn parcel"). | The listing URL, listing acres, agent and a name of its own (§2). |
| **5. Updated grades, Zach's and Julie's** | The card follows the Zach / Julie switch. A drawn line shows the banner, and "Let the app consider it" runs the screen again. | Markers' effects (§3). Re-grading without a full run where the data allows (§3.5). Whether there's a household grade (§6). |
| **6. Save, keep in progress, or discard** | A changed ("built") parcel saves itself to History. Remove deletes it. | A status (§4). |
| **7. The master list** | History (in the menu: newest first, Open, Remove, the verdict's dot and the price) and Compare (VR6: parcels side by side, 4 by default). | One list with columns, filters, sorts and a drag-and-drop "My order", which works on a phone. The app opens to it (§5). |
| **8. Shared with Julie** | The export file, moved by hand between browsers (16b). | Phase 1: accounts, a household, sync (§7, §8). |

## 2. Listing facts

**Fields, all optional, stored with the parcel:**
- **Name:** typed, e.g. "Ferney Creek 43 ac". Until one is typed, today's derived name shows.
- **Listing URL:** stored as typed, shown as a link (opens in a new tab, `rel="noopener noreferrer"`).
- **Price:** today's asking price, with its date. In Phase 1 each entry becomes a `price_events` row (`listed`, source
  `me`), so a reduction is a new event, not an overwrite.
- **Listing acres:** what the listing claims. When it differs from the parcel's acres by more than 10% (owner, §10),
  the card says so: "The listing says 52 ac; this boundary is 43.9 ac." Listings round, include
  neighbouring lots, or describe a parcel that has since been split.
- **Agent:** free text (name, phone, email). It's a third party's contact, kept with the parcel only: never put in a
  URL, never sent to a service.
- **Notes:** as today.

**Where:** a Listing section at the top of the Info panel's Notes tab (it holds the asking price today), and on the
list's detail view (§5).

**No scraping.** The app never fetches the listing page, from the browser or a server. Redfin's and Zillow's terms
forbid automated access, and listing pages change their markup often enough that a scraper would break silently.
Everything comes from what the user types or pastes.

**Reading an address from the URL, to centre the map.** Several sites put the address in the path:

| Site | Path | What it gives |
|---|---|---|
| Zillow | `/homedetails/123-Ferney-Creek-Rd-Floyd-VA-24091/12345678_zpid/` | street, town, state, ZIP |
| Redfin | `/VA/Floyd/123-Ferney-Creek-Rd-24091/home/12345678` | state, town, street, ZIP |
| Realtor.com | `/realestateandhomes-detail/123-Ferney-Creek-Rd_Floyd_VA_24091_M12345-67890` | street, town, state, ZIP |
| LandWatch, Lands of America, Land.com | `/floyd-county-virginia-land-for-sale/pid/412345678`, `/property/43-acres-in-floyd-county-virginia/12345678` | county and state only |

The app parses these patterns locally, then geocodes the parsed text through Photon (already used, throttled by
`lib/http`). Only the address leaves the device, never the URL.

**Is it reliable enough?** To centre the map, yes. To pick the parcel, no:
- Vacant land is often listed as "0 Ferney Creek Rd", "Lot 7 Ridge Rd" or "TBD Mud Creek Ln". Those geocode to
  somewhere on the road, which can run for miles, or to the ZIP's centre.
- The land sites give only the county.
- So the map centres at a zoom that matches what was found: a street number at z15, a road or ZIP at z14 (where
  the parcel outlines appear, so it can be tapped; z13 in the first draft, changed in WF1), a county at z10. A hint says "Centred on 0 Ferney Creek Rd: tap the parcel." The user still taps the parcel; nothing is
  selected automatically.
- An unrecognised URL is stored and linked, with "Couldn't read an address from this link."

## 3. Markers

### 3.1 What each one does

Every marker is a layer in the Info panel's tree, as lines are since #127: tap it on the map or in the tree to see and
edit it, with Delete and its 5-second Undo. Points drag on the map like the house bulls-eye.

| Marker | Shape | Effect on the grade | Effect on costs (VR4) | How it re-grades (§3.5) |
|---|---|---|---|---|
| **Track** (an ATV track, a logging road) | line | as today: a route can start from its end, or follow it at a reduced cost | by condition (§3.3) | driveway re-run |
| **Existing drive** | line | as today; screened as a track | by condition (§3.3) | driveway re-run |
| **Easement** | line | as today: land inside it counts as legal access, "verify it's a legal right-of-way" | by condition (§3.3) | driveway re-run |
| **Spring or well** | point | none (water is money, not a quality), except that the Garden row appends "a spring is marked (your marker)" when a spring is within 300 ft of the garden ground | Stage 2's well: an existing well becomes "pump, tank and line" instead of a drilled well's range; a spring adds "develop the spring" as an option beside the drilled well | instant |
| **Septic permit or system** | point, or an area for the field | the Septic gate passes, appending "a septic permit is on file (your marker): get a copy, and check it hasn't expired"; when the permit's point or area is more than 200 ft from site #1, it also appends "the permit is {n} ft from site #1; it covers the spot that was tested" | Stage 2's septic: the permit's class (conventional, modified, alternative) if typed, else the soil's | instant |
| **Building or cabin** | point | none | Stage 1a: a shelter on site, so "camp today" needs only the access | instant |
| **Power** (a pole or line) | point | none | Stage 2's power: priced by the distance from the pole to the build site, instead of an unknown range | instant |
| **Clearing** | area | none | Stage 1a's open ground: overrides NLCD's guess (value-ranking §4.2); garden ground inside it is open, so it has no clearing cost (§3.7) | instant |
| **Campsite** | point | none | Stage 1a: the camp, instead of the nearest open patch | instant |
| **Gate** | point | none (a note on the map) | none | instant |
| **Note pin** | point | none: anything else (a spring seep, a dump, a survey pin, a view) | none | instant |

"Road", in the owner's list, is covered by Existing drive with the condition improved or paved. An **unmapped public
road** (a kind that would make frontage and pass the Access gate) is not now (owner, §10): Existing drive covers it.

Both appended sentences, on the Garden row and the Septic gate, are report text: WF4 opens with its rule 7 paragraph,
and they go after the existing text.

The existing house stays the bulls-eye it is today: it moves the build site to the house and re-evaluates there.

### 3.2 Storing them

Markers live with the parcel, in `Markup` (today's lines), which grows a geometry type: line, point or area. Each has
a name, numbered per kind ("Spring 1"), as lines are, and a note.

- **The store:** new optional fields with defaults, as `askingPrice` and `markup` were added, so `ps.parcels` keeps
  `v: 2`. REQUIREMENTS §3a gains them.
- **The screen:** only lines reach the screen (`drawnInput`). Points and areas are read by the card when it's drawn,
  by id, as line names are since the names PR. So none of them changes the stored result or the schema.

### 3.3 A line's cost by its condition

From the owner's addition to A (2026-10-13). Wherever a line is priced today (a route that starts from it or runs
along it), its condition sets the cost:

| Condition | Default for | What it costs to bring to the gravel standard |
|---|---|---|
| **Uncleared** | an easement | a new build: today's route cost, plus clearing at `dw.clearingPerFt` |
| **Pioneer** | a track | no clearing; a grade touch-up at `dw.pioneerGradePerFt`; the full 6 in of stone; culverts and relief pipes by grade |
| **Improved** | an existing drive | today's upgrade (#116): `dw.upgradeStoneIn` (3 in) of stone and relief culverts by grade |
| **Paved** | — | no road cost; repairs at `dw.pavedRepairPerFt` (may be 0) |

- `dw.clearingPerFt`, `dw.pioneerGradePerFt` and `dw.pavedRepairPerFt` are new, provisional, and labelled "provisional
  until the builder quote" until follow-up 47 sets them.
- **Stage 1b (VR4):** a pioneer, improved or paved line is access in place; an uncleared one needs a pioneer cut
  (clearing and a pioneer grade).
- **The driveway section says it:** "Gate lane: 868 ft, pioneer track. Bringing it up to gravel standard costs
  $X–Y." (Appended, rule 7.)
- **Steepness is unchanged by condition:** the raw-ground grade, the limit and the veto read the same.
- **The width** of an uncleared line sets its clearing area (length × width) (owner, §10). It's the first use of a
  track's or a drive's width.
- **Schema:** the condition reaches the screen, so `DrawnInput` and the stored line gain it. That's schema v8, a clean
  break (older results clear and re-screen when opened, as v3 to v7 did), recorded in phase-0.md §9. Lines saved
  before already have their kind's default condition (#127).

### 3.4 "Use as my driveway" (follow-up 56)

The route from a drawn line's end, along it and on to site #1 by the router, is already computed and stored: it's the
route from the line's entrance in `driveway.routes`. So choosing it is a **card-side** choice:
- **The choice** is stored with the parcel, as the line's id (or "the app's pick"). Not in the result: no schema change.
- **The card** scores the chosen route instead of `scoredRoute()`: the gates, the costs and the Driveway section.
  "Your route" is marked on the card and the map.
- **The Easement panel** shows the app's pick and your line side by side: length, cost range, steepest grade
  (designed and raw), landings, veto status. On a phone, the two stack.
- **A line over the veto** can still be chosen. The Easement and Access gates warn: "Your route is steeper than your
  veto (41% vs 25%)."
- **Deleting the line**, or a run that no longer has a route from it, returns the choice to the app's pick, and says
  so.
- **The banner's** second button, "Score it as the driveway", arrives with this.
- **Mixing** drawn and routed legs mid-route (leave the line partway): not now. The router joins a line at its ends only.

### 3.5 Re-grading without a full run

| Change | What runs | Network |
|---|---|---|
| A name, a note, a condition (until v8), a point or area marker, listing facts, the status, the driveway choice, an override | nothing: the card re-renders | none |
| The house moved | the re-evaluation at the house (today) | none, while the session is live |
| A line added, redrawn, deleted, or made an easement or not | the **driveway and drive steps only**, from the parcel's live session (new) | the drive-time services, only when the scored entrance moved |
| A boundary change (a part, a split); Settings the screen reads | a full run | all |
| Any of the above after the session is gone (a reload, or more than 3 parcels open since, `SESSION_LIMIT`) | a full run, as today's "Let the app consider it" | all |

The DEM is never persisted (CLAUDE.md), so the live session is the only cache for the ground. The new piece is a
worker message, "reroute", that re-runs the driveway step and the steps after it from the session, like today's
`evaluateAt`.

### 3.6 Your overrides (owner, #128 review)

When the household knows better than the data, a grade can be overridden, with a reason.

**What can be overridden:**
- **any graded row**, to any letter;
- **a dealbreaker that warns**, to pass.

**What can't:** a dealbreaker that **fails**. The fix is the input it reads: draw the easement, correct a line, add a
marker. The override control says so on a failed gate: "A failed dealbreaker can't be overridden. Fix what it reads
instead: draw the easement, correct a line, or add a marker."

**How it's stored:**
- With the parcel, not the screen result: no schema change. One override per row (or gate) per parcel, for the
  household: a row's letter is the same in Zach's weights and Julie's, so one override serves both.
- Each holds the letter (or "pass"), a **required** comment, when it was made, and the app's own grade at that time.
- **Phase 1:** each override, change and removal is an event recording who made it and when.

**The card:**
- The row reads "A (yours) · app says D", with the comment under it and a small override icon on the row.
- The parcel grade, the verdict and the breakdown bar use the override.
- When an override changed the verdict, the verdict line says so: "Contender, with 1 override".
- **After a re-screen** the override stays. When the app's own grade has changed since it was made, the row says "app
  now says B".
- **Remove override** returns the row to the app's grade, with the 5-second Undo.

**Elsewhere:**
- **The list:** an overridden grade (Zach's, Julie's, or the household verdict it changed) carries the same icon.
- **VR8:** the calibration report lists every override, with its comment, as a disagreement to look at.
- **The rulebook:** a short section, "Your overrides", explaining the rules above.

All of this is new card text: WF4b opens with its rule 7 paragraph, and nothing replaces existing text.

### 3.7 The garden: wooded ground counts, and clearing it is a cost (owner, #128 review)

The garden search reads the bare-earth lidar and the soil, not tree cover, so wooded flat ground already counts as
garden ground. Wording that implies otherwise is corrected:
- The Garden scale's **None** band: "No open, gentle, sunny ground for beds: terraces or raised beds on the slope."
  becomes "No gentle, sunny ground for beds, even after clearing: terraces or raised beds on the slope."
- That is the only such wording: the Garden row's detail, its "How it's scored", the panel's other bands and the
  rulebook don't say "open" or "cleared".
- An approved correction, recorded in phase-0.md §9. No numbers change. It lands in the line-names PR, the next code
  PR (after #127, which adds §9.38), so the two §9 entries don't collide.

**Clearing a garden is a cost** (VR4, with WF7's provisional rates until 47): "clear the garden ground (wooded)", a
line item in Stage 3 (home), for the garden patch the Garden row grades. Wooded or open is read from NLCD's tree canopy
(value-ranking §4.2, the same source as Stage 1a's open ground), and a Clearing marker over the patch overrides it
(open: no cost). Priced per acre at the clearing rate the driveway corridor uses.

## 4. Status

Three statuses (owner, §10: Discard merges into Archive):

| Status | Meaning | On the list | In History |
|---|---|---|---|
| **In progress** | the default for a built parcel: being looked at | shown | yes |
| **Saved** | a contender the household is keeping | shown | yes |
| **Archived** | done with it, for a reason | hidden by default; a filter shows it | yes |

- **Archive asks for a reason:** quick picks "Not for us", "Sold" and "Rejected: …" (which opens the text box), plus
  free text, e.g. "Rejected: the septic test failed". The reason and its date show on the list's archived rows.
- **Archive keeps everything:** the screens, markers, notes and price history. It's reversible: Restore puts the
  parcel back as it was (In progress or Saved).
- **Remove stays the only delete**, with its Undo, as today. Nothing expires (13e).
- A plain parcel (tapped, never changed) has no status: it isn't built, so it's in neither the list nor History.

**Milestones** (owner, §10): **Walked** and **Offered** are tags beside the status, each with its date ("Walked Oct 20",
"Offered Nov 2"). Set from the parcel's controls, removable, and shown on the list. They don't change the status.

**Phase 1:** a status change, a milestone, and an archive reason are events (who, when), so the household sees why a
parcel left the list. REQUIREMENTS' `parcels.status` enum (watching, contender, walked, offered, passed, ignored) is
replaced (§8): "contender" is the card's verdict now, and "walked" and "offered" are the milestones.

## 5. The list

**The page:** `/library`, the route CLAUDE.md already plans. The app opens to it when it has parcels, else to the
map (owner, §10). Tapping a row opens the parcel's report card with its controls: Open on the map, the status, the listing
facts, Archive, Remove.

**Columns (desktop):**

| My order | Name | Acres | Price | State | Status | Household | Zach's grade | Julie's grade | Updated |
|---|---|---|---|---|---|---|---|---|---|
| ⠿ | Ferney Creek 43 ac | 43.9 | $185k | VA | Saved · Walked Oct 20 | Maybe | B Contender | C Maybe | Oct 13 |

"State" is the US state, with the county in a tooltip. The Status cell carries the milestones (§4). An overridden
grade carries the override icon (§3.6). **Household** is
the household verdict (§6). A grade cell shows the letter and the verdict, as the card does, with "–" when there's
no current screen and "re-screen" when its screen is from older rules.

**Filters:** status (default: In progress and Saved; Archived shown by the filter), the household verdict (default:
Contender and Maybe, so a parcel either of you would pass on drops off), each person's verdict, the milestones, a
price range, the state. They're remembered per browser.

**Sorts:** My order (the default), price, acres, the household verdict, Zach's grade, Julie's grade, updated.
- **My order** is a drag-and-drop rank, stored with each parcel. Another sort is only a view: it never rewrites it.
- Dragging works only in My order; under another sort, the handles hide and "Switch to My order to rearrange" shows.
- A new parcel goes to the bottom of My order.
- The rank is a fractional index (a string between its neighbours), so a move writes one parcel, not all of them:
  that matters once the list syncs (Phase 1).
- **Drag on a phone:** a long press on the handle. Every row also has Move up and Move down in its menu, for the
  keyboard and for screen readers.
- **The library:** `@dnd-kit` (owner, §10): well known, accessible, with touch and keyboard sensors. Pinned to an exact
  version in the pnpm-workspace overrides and `pnpm check:pins`, as Turf and geotiff are, with its one-line
  justification in WF3's PR.

**Phone:** the table becomes cards, one per parcel: the name, status and milestones on the first line; the acres,
price and state on the second; the household verdict and the two grades as chips. The filter and sort controls fold into one bar at the top. Drag by the
handle on the card's left.

**Compare** stays VR6's table, opened from the list: tick the rows, then Compare.

**VR8, calibration, runs on the list** (§7): each person enters their own grade and a one-line reason per parcel,
blind (the app's grade is hidden from them until both have entered one). The calibration report compares those with
the card's grades, and the list's columns show the disagreements. It also lists every override (§3.6), with its
comment.

## 6. A household verdict, and both grades

The card grades each parcel twice, with Zach's weights and Julie's. The list could:

1. **Show both, and no household grade.** Sort by either. Nothing is hidden or averaged away.
2. **A household verdict: the lower of the two** ("Contender" only when both say Contender), shown beside both
   grades. The default filter could use it.
3. **A household grade: the mean of the two weighted scores**, as a letter. Simple to sort by, but a parcel one
   person loves and the other dislikes reads "C" for both.

**Decided** (owner, §10): both grades, plus a **household verdict, the lower of the two** (Contender only when both
say Contender; Pass when either says Pass), in its own column. The list's default filter uses it (§5). There's no
blended letter: the letters stay each person's.

## 7. Phasing

**Order** (owner, §10): #127 → the line-names PR (with the garden correction, §3.7) → WF1 → WF2 → WF3 → WF4 → WF4b →
WF5 → WF6. WF7 waits for the builder
quote, with follow-up 47 and VR4. VR8 starts once WF3 is in.

**Before Phase 1, on this device** (the browser's store, and the export file between browsers):
1. **WF1:** listing facts and a name (§2), with the URL's address centring the map.
2. **WF2:** the statuses, archive reasons and milestones (§4), and the list at `/library` with its columns (the
   household verdict among them), filters and sorts; the app opens to it when it has parcels.
3. **WF3:** My order, drag-and-drop (`@dnd-kit`, pinned), and the phone layout.
4. **WF4:** point and area markers (§3.1) in the Layers tree, with their card-side effects: the Septic gate and the
   Garden row (rule 7 paragraph first). Their cost effects wait for VR4.
5. **WF4b:** your overrides (§3.6): the card, the list's icon, the rulebook section (rule 7 paragraph first).
6. **WF5:** "Use as my driveway" (§3.4), card-side.
7. **WF6:** the driveway re-run from the live session (§3.5).
8. **WF7:** a line's cost by its condition (§3.3), and clearing the garden ground (§3.7): schema v8, with follow-up
   47's unit costs. It goes with 47 and VR4, when the builder quote arrives.
9. **VR8:** calibration, on the list, once WF3 is in. Zach and Julie can each enter blind grades on this device by
   switching the person, or on Julie's own phone once Phase 1 is in.

Each status, order, marker and override is in the export file (a new `version` and a converter where its shape changes), so
nothing is lost before sync.

**Needs Phase 1:**
- Julie's own login, the household, and sync: the list, statuses, milestones and My order shared. My order is one
  per household (owner, §10).
- Price history as events; comments; attachments (the plat, the listing's photos, a septic permit's scan).
- Shareable parcel links (phase-0.md §8, #121).

## 8. PLAN.md's Phase 1, rewritten

Applied to PLAN.md in this PR, replacing "Phase 1 — Accounts and Library". It keeps that section's decisions:
versioned, immutable screens; price history as events; comments; `parcel_shares`; the parcel page's blocks; the
prototype import. Two items move from Phase 2 to Phase 1, since the list is shared from the start: the household invite
and the comments thread. Julie, as a household member, sees the whole list, not "only shared parcels" (Phase 2's old
wording); `parcel_shares` stays for sharing outside the household. Phase 2 keeps the PDF export and the public link.

> ### Phase 1 — Accounts, the household's list, and sync
> Goal: Zach and Julie open the same list on their own phones; a parcel's page is the document.
> - Supabase Auth (magic link). RLS on every table, scoped to the household, from the first migration.
> - Household invite: Julie joins the household and sees its whole list. `parcel_shares` is for people outside it.
> - Tables: `households`, `memberships`, `parcels`, `markers`, `overrides`, `screens`, `attachments`,
>   `price_events`, `status_events`, `comments`, `parcel_shares` (see REQUIREMENTS).
> - `parcels` gains the listing facts (`listing_url`, `listing_acres`, `agent`), `status` (in progress, saved,
>   archived) with `archived_reason`, the milestones `walked_at` and `offered_at`, and `list_rank` (My order, one per
>   household, a fractional index).
> - `markers`: the drawn lines and points (kind, geometry, name, condition, width, note), one row each.
> - `overrides`: the household's grade overrides, one per row per parcel, each with its required comment; every
>   change is an event (who, when).
> - Screens are versioned and immutable: a re-run inserts `version = max + 1`, never an update. Screens computed by
>   an older engine (`ENGINE_VERSION`) re-run automatically (`docs/plans/batch-a.md` §6).
> - Price history as events: each asking price entered becomes a `price_events` row; a reduction is a new event.
> - The list (`/library`) reads from Supabase; the explorer saves to it. The browser's store and export file import
>   on first sign-in (REQUIREMENTS §3a), and the store stays as the offline cache.
> - Parcel page = computed blocks (from `screens.result`) + placeholders + user blocks.
> - The prototype's saved-parcels JSON export imports through the same import screen.
> - Comments thread per parcel (pinned "why I shared this", resolved flag). Attachments to Storage (PDF, images,
>   links).
> - `parcel_shares`: share a parcel outside the household.
> - Shareable parcel links: the parcel, map view and open panel in the URL, opening the sender's screen.
> - The weight switch defaults to the signed-in person.
> - **Acceptance:** Zach saves Macks Mountain with its listing URL, a spring marker, the plat PDF and two price events;
>   Julie signs in on her phone and sees it on the list in Zach's order, with both grades; she archives another
>   parcel as "Rejected: no winter sun", and Zach sees why. A reload shows everything without re-running the screen.

REQUIREMENTS §3's data model changes to match in Phase 1's own plan (`docs/plans/phase-1.md`): the `parcels`
columns above, the `markers`, `overrides` and `status_events` tables, and `price_events.source` keeping `me` for typed prices.

## 9. Files (WF1–WF6, WF4b)

- `lib/client/parcelStore.ts`: the listing fields, status, rank; marker geometry types; their defaults on load.
- `lib/client/listingUrl.ts` (new, pure): the URL patterns of §2, tested on examples of each.
- `components/Library/` (new): the list, its filters and sorts, the rows and cards, the drag.
- `app/library/page.tsx` (new); `app/page.tsx` opens to it.
- `components/Explore/layers.ts`, `components/Map/InfoPanel.tsx`: point and area markers in the tree.
- `lib/report/card.ts`: the gates read markers; the chosen driveway (§3.4); overrides applied to the rows, gates,
  grade and verdict (§3.6).
- `components/Results/card/`, `components/Rulebook/`: the override control, the row's "(yours) · app says", and the
  rulebook's "Your overrides".
- `lib/screen/worker.ts`, `lib/client/useScreen.ts`: the "reroute" message (§3.5).
- `lib/client/exportFile.ts`: the new fields, with a version and converter if the shape changes.
- `docs/REQUIREMENTS.md` §3a; `docs/plans/phase-0.md` §9 for each decision.

## 10. Questions, and the owner's answers (#128, 2026-10-14)

1. **A household grade** (§6): both grades, plus a household verdict that is the lower of the two, in its own column;
   the list's default filter uses it.
2. **An unmapped public road** (§3.1): not now. Existing drive covers it.
3. **Discard** (§4): merged into Archive. The statuses are In progress, Saved and Archived. Archive asks for a reason,
   with quick picks ("Not for us", "Sold", "Rejected: …") plus free text. Archived parcels are hidden by default,
   shown by a filter, and reversible. Remove stays the only delete.
4. **Milestones:** "Walked" and "Offered", as tags beside the status, each with a date, shown on the list.
5. **My order in Phase 1:** one per household.
6. **The opening page:** the list when it has parcels, otherwise the map.
7. **Drag library:** `@dnd-kit`, pinned per CLAUDE.md.
8. **A line's width:** yes, an uncleared line's width sets its clearing area (§3.3).
9. **The listing-acres warning:** when the difference is over 10%.

**Two changes to §3.1** (owner, same review), applied there:
- **Spring or well:** cost-only, but the Garden row appends "a spring is marked (your marker)" when a spring is within
  300 ft of the garden ground.
- **Septic permit:** when the permit's point or area is more than 200 ft from site #1, the Septic gate appends "the
  permit is {n} ft from site #1; it covers the spot that was tested".

**Two additions** (owner, #128, before merge), applied as §3.6 and §3.7:
- **Your overrides** (§3.6, WF4b after WF4): any graded row to any letter, a warning dealbreaker to pass, never a
  failing one; a required comment; stored with the parcel, one per row per parcel for the household; shown as "A
  (yours) · app says D"; kept after a re-screen ("app now says B"); Remove override; an icon on the list; listed by
  VR8; explained in the rulebook.
- **The garden** (§3.7): the None band's wording corrected (wooded flat ground already counts), recorded in §9; clearing
  a wooded garden is a Stage 3 cost, wooded or open from NLCD or a Clearing marker.

**Order:** #127 → the line-names PR (with the garden correction) → WF1 → WF2 → WF3 → WF4 → WF4b → WF5 → WF6. WF7 waits
for the builder quote, with 47 and VR4. VR8 calibration starts once WF3 is in.
