# Parcel Screen — Workflow Review & Design

Oct 16, 2026 · @Zach

## Summary

The app already does the middle of your workflow well (steps 5 and 7, most of 6) and none of the beginning (steps 1–4). The parcel tools, the screen and the library are built. What's missing is the part that makes the grade *yours*: the interview, your rubric, the area suggestions and the preview.

One change unlocks almost everything: **grades must be computed at display time from stored measurements plus the viewer's rubric**, not baked into the saved screen. Today the report card's seven rows, their cutoffs and the Zach/Julie weights live in the engine's config. Once grading is a separate step, the interview can write a rubric, dragging a factor between Must and Could regrades every saved parcel instantly, sample parcels can preview each user's grade, and two people can see the same parcel graded two ways without re-screening.

Recommendation:

- **Pause** driveway and data refinement (WF6b, 57, 46, cost labels, VR8). They polish numbers that move a grade by a point or two; the workflow moves grades by whole letters.
- **Build rubric-first:** profiles and the grading split, then Tennessee parcels, the rubric editor, the interview, household predictions, simpler results, favorites, the report card export, cost to enjoy, new data points, ways to raise the grade, and the area catalog. Each step runs as one unattended Claude Code mission that ends in a manual test plan.
- **Product questions:** settled 10/16. Anyone with the link gets a local profile, with nothing hard-coded to you and Julie. Tennessee joins the map and the catalog. Cost to enjoy stays, as a cost to camp and a cost to build. A household member's grade is a prediction from their rubric, not a combined verdict. Details under Roadmap.

## Gap review

Three of the eight steps are mostly built, two are partly built, and three are new. Status is as of #143 and the 10/15 handoff.

| Step | What exists today | What's missing or changes |
| --- | --- | --- |
| 1. Interview → MoSCoW | A 40-question bank (Claude Doc, 10/8), written for you and Julie, mostly open-ended | A 14-question forced-choice interview inside the app; answers saved per user |
| 2. Suggested areas | Your Mountain Town Assessment (Google Doc), 26 towns, mostly out West | An in-app catalog of Blue Ridge areas in VA, NC and eastern TN, scored by the user's rubric |
| 3. Rubric, drag to tweak | Report card with 7 fixed rows, 4 dealbreakers, Zach/Julie weights in config (Julie's are placeholders), /rulebook page | Per-user rubric (Must / Should / Could / Won't), drag between and within tiers, live regrade |
| 4. Preview a parcel in an area | Nothing | Pre-screened sample parcels per area, graded under the user's rubric at display time |
| 5. Free nav, build, name, attach | Built: map, combine/split/draw, markers, lines, listing URL ("Attach listing" chip), notes, statuses | A plain name field (today a name lands as a "Name:" notes line on import); image and PDF attachments, which need file storage |
| 6. Screen anytime, top sites, improve | Screen and Run again built; up to 9 homesites listed; driveway, sun, sky, soils all computed | Show the best 3 sites only; grade the parcel's highest capability under the user's rubric; "ways to raise this grade" |
| 7. History vs favorites | History (every screen), Library with In progress / Saved / Archived, My order, household verdict | Mostly naming: "Saved" becomes Favorites with a star; nothing enters Favorites unless starred |
| 8. Export report card | Copy summary (text); PDF export was planned for Phase 2 and parked | A print-ready report page the browser saves as PDF; no server-side PDF needed |

Two things in today's app work against the workflow. The 9-site list makes a first screen feel like homework rather than an answer. And grading appears to be fixed at screen time: every cutoff change so far (trails, sky, driveway) bumped ENGINE\_VERSION and asked for a re-screen. If that holds, any rubric change means re-screening, which is slow and needs the network. Claude Code should confirm which grade inputs are stored and which are computed on display.

## The interview

Fourteen screens, about four minutes, each a small scene with a forced choice. The answers never ask for a threshold; they set one. Every question maps to factors the app can measure today or with one of the new data points proposed below.

Interviewing techniques built in:

- **Trade-offs, not ratings.** Nobody rates sun a 2 out of 5. Choosing between two good things (sun or view, close store or big store) reveals which matters more.
- **Scenes, not abstractions.** "A clear January night" gets an honest answer; "rate the importance of night sky quality" gets a polite one.
- **What you'd do, not what you value.** Behaviour predicts satisfaction better than stated priorities.
- **"Either is fine" on every screen.** Indifference is information: it moves a factor toward Could or Won't.
- **Walk-away test last.** Musts come from one closing question, after the trade-offs have warmed the person up. A typical person should end with 2–4 Musts; more than 5 gets a gentle "that will rule out most land" note.
- **Nothing personal.** No health, income, age or family questions. The ER question asks how far feels too far, never why.
- **Reversible.** Skip any screen (its factors keep default tiers), go back, or redo it later from the rubric.

| # | The scene, as shown | Choices | What it sets |
| --- | --- | --- | --- |
| 1 | Which year sounds better: cool summer days and frigid winter nights, or hot summer days and snow that rarely sticks? | Cool and snowy · In between · Warm and mild · Either | Climate target (summer high, winter low), which also sets the elevation band |
| 2 | It's a clear January night. Where are you? | Out with a camera · Out for a minute to look · Inside by the fire | Night sky tier. First answer adds: "A town's glow on one horizon: shrug, or spoils it?" → light-dome tolerance |
| 3 | December morning: sun across the breakfast table, or a long view down the valley? | Sun · View · Both · Neither | Winter sun at the house vs long view, ranked against each other |
| 4 | Saturday morning. What's the plan? | Walk out the door into the woods · Bike from home to a long trail · Drive 20 min to the best trail · Not trail people | Trails and public land: adjoining public land, bike distance to a long trail, or drive minutes |
| 5 | Groceries: a small market 10 minutes away, or a big store 40 minutes away once a week? | Small and close · Big and far · Either | Town and groceries tier and cutoff |
| 6 | Someone gets hurt on a Sunday afternoon. How far to the ER would feel too far? | 15 min · 30 min · 45 min · An hour is fine | Hospital cutoff; a shorter answer raises its tier |
| 7 | Work and travel: what applies? (pick any) | Video calls from home · Fly a few times a year · Fly monthly or more · Neither | Internet (if video calls) and airport drive time |
| 8 | Neighbors: wave from the porch, see their lights at night, or never know they're there? | Wave · See lights · Never know | Privacy (nearest house distance) and light tolerance for the sky factor |
| 9 | It's August. What's on your table from your own ground? | Nothing · Herbs and tomatoes · A real kitchen garden · Most of our produce, maybe chickens | Garden ground tier, garden area needed, frost-free season |
| 10 | Snowy morning. Which driveway would you happily live with? | Short and steep: 4WD some days · Long and gentle · Whatever it takes, we'll build it | Driveway grade limit (20 / 15 / 12%) and the driveway factor's tier |
| 11 | An HOA that stops neighbors clear-cutting, or no rules at all? | Rules that protect views are welcome · Light rules are OK · No HOA or restrictions | HOA and restrictions; "no rules" becomes a Must |
| 12 | A creek on the land: the best feature, or something to keep away from the house? | Best feature · Nice, not near the house · Rather not · Either | Stream on the parcel (plus or minus) and flood distance tolerance |
| 13 | How much land, and how much money? | Acres: under 5 · 5–20 · 20–50 · 50+. Two optional numbers: the most you'd spend to start camping on it (land, access, a 4x4 track to a clearing), and to be ready to build | Acreage band; camp and build budgets for cost to enjoy |
| 14 | Which of these would make you walk away from an otherwise perfect place? Then: which don't matter at all? | Chips: flood zone · an HOA · shared driveway · below \_\_\_ ft · over \_\_\_ min to an ER · neighbor's house in view · no winter sun · alternative septic only · over budget | First set → Musts with their thresholds. Second set → Won't |

The old 40-question bank stays useful as the "go deeper" layer: after the first parcel, the rubric can offer two or three follow-ups only for factors that turned out to matter (plants by name, solar plans, water source).

## Factors

The rubric is built from 21 factors: 14 the screen measures today, 6 new data points, and one field you fill in from the listing. Each new data point is free public data or is derived from data the screen already fetches. The "Default tier" column is what a person gets for a factor if they skip every question that touches it.

| Factor | What it measures | Source | Status | Default tier |
| --- | --- | --- | --- | --- |
| Legal access | Road frontage or a usable recorded easement | Parcel lines, Census and OSM roads, your drawn lines | Have | Must |
| Flood | Flood zone touching the house or drive | FEMA | Have | Must |
| Septic | Soil class at the house site | NRCS soils | Have | Must |
| Room to build | House footprint fits on a buildable site | Lidar | Have | Must |
| Elevation | House-site elevation | USGS lidar | Have | Should |
| Winter sun | December sun hours at the house | Lidar horizon, sun model | Have | Should |
| Driveway | Length, grade and rough cost of the best route | Router | Have | Should |
| Trails and public land | Adjoining public land; drive minutes to the nearest trailheads | PAD-US, Forest Service, state parks, OSM, OSRM | Have | Should |
| Hospital | Drive minutes to the nearest ER | OSRM, hospital list | Have (inside Town and hospital) | Should |
| Cost to enjoy | Cost to camp and cost to build, each against its budget (below) | Asking price, router, markers, Settings rates | Have, as estimates | Should |
| Town and groceries | Drive minutes to groceries and a town | OSM, OSRM | Have | Could |
| Night sky | Sky brightness, light domes, Milky Way core over the south ridge | Light-pollution atlas, horizon | Have | Could |
| Garden ground | Gentle, deep-soil ground near the house; frost pocket position | Lidar, NRCS | Have | Could |
| Acreage | Acres in your range | Parcel record | Have | Could |
| **HOA and restrictions** | HOA, deed restrictions, one-residence limits | Entered by you from the listing or deed; unknown until then | New field | Could |
| **Climate** | 30-year normals at the site: July high, January low, frost-free days, snowfall | [PRISM](https://prism.oregonstate.edu/normals/) 800 m normals, or NOAA gridded normals | New | Should |
| **Long view** | How far you can see across the best 90° of skyline from the house | The 30 m, 6 km horizon profile the screen already stores | New, no new fetch | Could |
| **Privacy** | Distance from the house site to the nearest other house | Overture or Microsoft building footprints | New | Could |
| **Bike to a long trail** | Road miles from the parcel to a rail-trail or greenway | OSM cycle routes | New | Won't |
| **Airport** | Drive minutes to the nearest commercial airport | Fixed list of airports, OSRM | New | Won't |
| **Internet** | Best wired broadband offered at the address; open north sky for Starlink | FCC National Broadband Map; horizon | New | Won't |

Two factors are worth adding first. **Climate** turns question 1 from an elevation proxy into the real thing; at the same elevation, a north-facing hollow and a south bench can differ by several degrees. **Privacy** answers question 8, which today has no data behind it. Wildfire risk (USFS Wildfire Risk to Communities) was considered and left out: it's low across the Blue Ridge and would rarely change a grade.

Hospital becomes its own factor, separate from Town and groceries. People trade those two off very differently, as question 5 against question 6 shows.

**Cost to enjoy** bridges what you pay for the land and what it then takes to use it. It is two numbers, each graded against its budget from question 13:

- **Cost to camp:** asking price, plus what it takes for your 4x4 to reach a clearing you can camp on. That means access (a right-of-way, or work at the road), a pioneer track laid on the future driveway's line so the money isn't spent twice, and clearing if there's no open ground.
- **Cost to build:** the same, with the track upgraded to a finished driveway, plus well, septic and power at the build site.

The parcel's own state drives both, so nobody is asked how they'd phase it. An existing drive or track you've drawn, a clearing or spring marker, and road frontage near the site all cut the numbers. For example, a fully wooded parcel at $250k reads as a camp-first property, while one at $200k with a road and water already at the build site is close to ready to build. Rates come from Settings until a builder quote exists, and these rows say they're estimates.

## Rubric algorithm

A rubric is one ranked list of preferences plus a short list of minimums. Musts are pass/fail gates and never add points; Should and Could are ranked, and rank sets weight; Won't is ignored. That's how the report card already treats its four dealbreakers; the change is that each user now chooses their own.

**1. Answers become importance points.** Each choice adds points to the factors it touches, 0 to 3. "Out with a camera" gives Night sky 3; "Out for a minute" gives 1; "Inside by the fire" gives 0. A factor's points are summed across all 14 screens.

**2. Points become tiers.**

- **Must:** every chip picked in question 14, with its threshold, plus the four defaults (access, flood, septic, room to build). A Must card is a minimum, so a factor can hold a Must card and a Should card at once: "Elevation at least 3,000 ft" gates, while "Elevation, higher is better" ranks.
- **Should:** the highest-scoring factors with any points, at least 3 and at most 6.
- **Could:** the rest with any points.
- **Won't:** zero points, or picked as "doesn't matter" in question 14.

Ties break by the default order in the Factors table.

**3. Rank becomes weight (rank-sum).** With n ranked cards, first place counts n, second n − 1, down to 1. Could cards count at 75% of their rank value. Weights are then scaled to total 100%. Every card always outweighs the card below it, so a drag never has a surprising effect.

| Rank | Tier | Weight (5 Should, 5 Could) |
| --- | --- | --- |
| 1 | Should | 19.5% |
| 2 | Should | 17.6% |
| 3 | Should | 15.6% |
| 4 | Should | 13.7% |
| 5 | Should | 11.7% |
| 6 | Could | 7.3% |
| 7 | Could | 5.9% |
| 8 | Could | 4.4% |
| 9 | Could | 2.9% |
| 10 | Could | 1.5% |

Should carries 78% of the grade and Could 22%. A steeper scheme (rank-order centroid) was tried and left Could with about 11%, too little to notice.

**4. Each factor scores 0–100 on bands that the answers place.** The rule: your answer marks the B/C boundary, the edge of "acceptable to you". Bands then step by a factor-specific amount. For the hospital factor at a 30-minute answer: A ≤ 15 min, B ≤ 30, C ≤ 45, D ≤ 60, F beyond. Someone who answered "an hour is fine" gets the same bands shifted to B ≤ 60.

**5. Grade and verdict.**

```latex
\text{score} = \frac{\sum_{f\,\in\,\text{known}} w_f \, s_f}{\sum_{f\,\in\,\text{known}} w_f}
```

- The score maps to a letter on today's bands.
- Any Must fails → **Pass**, with the reason ("Fails your must: no HOA").
- Any Must unknown → at best **Maybe**, with "Check first: HOA".
- Otherwise A or B → **Contender**, C → **Maybe**, D or F → **Pass**.
- If unknown factors carry more than 30% of the weight, the grade shows as provisional, and each unknown becomes a question for the agent.

**6. The editor.** Four columns: Must, Should, Could, Won't. Drag a card between columns or up and down within one. Tap a card to see why it's there ("Question 6: 30 minutes") and move its threshold with a slider. A preview pane beside the columns shows one sample parcel's grade and verdict, updating as you drag. "Reset to my answers" undoes all edits.

**7. Household.** Every grade is yours first. A household is a list of people whose rubrics you hold, so the app can answer "How would Julie rate this?" without asking her.

- **Adding a member.** You add a spouse, a child or anyone else by name. They take the interview on your device, or on theirs and send you their rubric as a short code or a small file. Nothing is assumed about who is in a household.
- **The side-by-side.** A toggle on every grade shows each member's predicted grade and verdict beside yours, with the two or three factors that differ most ("HOA: your Could, her Must").
- **Predictions say so.** Each is labelled "predicted from Julie's answers of 10/16", because her rubric may have moved since.
- **Send to confirm.** Under a prediction: "Send to Julie to make sure she'd grade it an A?" Until accounts exist, that shares the parcel and its screen as a file or link she opens in her own profile. With accounts it becomes an in-app request she answers with her own grade and a comment.
- **No combined grade.** Favorites can still sort by the lowest predicted grade in the household, which is today's "lower of the two" as a sort rather than a verdict.

All of this is display-time arithmetic over stored measurements. It needs the screen to store raw values (minutes, hours, feet, classes) for every factor, and no grades.

## Area catalog

The catalog has 30 areas in Virginia, North Carolina and eastern Tennessee. Virginia and North Carolina parcel lines load today; Tennessee's arrive in roadmap step 2, ahead of the catalog, because so many saved parcels sit around Roan Mountain. Each area is scored by the user's rubric, using only the factors that make sense at area scale. The top five are offered as suggestions, each with one line on why it fits and one on the trade-off.

**Hand-entered numbers go stale, so the catalog stores none.** Each entry is a name, an outline and a two-line description. Everything else is computed by the same pipeline as a screen, and refreshed on a schedule. Example: Patrick County's hospital in Stuart reopened in January 2026 after eight years closed ([Cardinal News](https://cardinalnews.org/2026/01/06/stuart-community-hospital-opens-for-emergency-and-inpatient-care/)); a hand-built table from 2025 would show no hospital there.

**How an area is profiled.** Sample about 200 points on rural land inside the outline. At each, compute elevation, climate normals, sky brightness, drive minutes to the nearest ER, groceries and commercial airport, distance to public land and to a long bike trail, and broadband. The hospital list comes from CMS Hospital General Information, which records which hospitals have an ER.

**How an area is scored.** Apply the user's rubric to the area's median values, area-scale factors only. Parcel-scale factors (septic, winter sun, driveway, flood) are left out because they vary parcel by parcel. Musts become a share: "41% of rural land here is above 3,000 ft and within 30 minutes of an ER." An area where under 10% of land passes every Must isn't suggested.

**The suggestion box.** Five cards: area name, fit letter, the share of land passing your Musts, why, trade-off, and "Show me a parcel here" (step 4). "Show more" lists the rest of the catalog ranked. Starring an area pins it on the map.

The starting list (elevations and hospitals are approximate, from general knowledge and three spot checks, and will be replaced by computed values):

| Area | County, state | Typical land elevation (ft) | Nearest hospital | Airport | Fits people who want | Trade-off |
| --- | --- | --- | --- | --- | --- | --- |
| Grayson Highlands (Volney, Troutdale) | Grayson, VA | 2,800–4,000 | Twin County, Galax | TRI | Dark skies, Mount Rogers, high pastures | Far from care and airports |
| Whitetop and Konnarock | Grayson and Smyth, VA | 3,000–4,000 | Johnston Memorial, Abingdon | TRI | Creeper Trail by bike, the highest land in VA | Long, hard winters; remote |
| Independence and Fries | Grayson, VA | 2,300–2,900 | Twin County, Galax | GSO, ROA | New River, New River Trail | Lower and warmer |
| Floyd | Floyd, VA | 2,400–3,000 | Carilion New River Valley, Christiansburg | ROA | Parkway, music and arts community | No hospital in the county |
| Hillsville and Fancy Gap | Carroll, VA | 2,500–3,000 | Twin County, Galax | GSO, ROA | Parkway, quick I-77 access | Interstate noise and fog near Fancy Gap |
| Meadows of Dan | Patrick, VA | 2,800–3,200 | [Stuart Community](https://cardinalnews.org/2026/01/06/stuart-community-hospital-opens-for-emergency-and-inpatient-care/) (reopened 2026) | GSO | Parkway, quiet farmland | Small, newly reopened hospital |
| Sugar Grove and Marion | Smyth, VA | 2,100–3,000 | Smyth County Community, Marion | TRI | Mount Rogers' north side, Hungry Mother SP | I-81 corridor nearby |
| Damascus | Washington, VA | 1,900–2,600 | Johnston Memorial, Abingdon | TRI | Creeper Trail and the AT in town | Low valley, little winter sun |
| Burkes Garden | Tazewell, VA | 3,000–3,300 | Carilion Tazewell | TRI | A high bowl valley, very dark and quiet | Very little land comes up for sale |
| Highland County (Monterey) | Highland, VA | 2,800–3,500 | Bath Community, Hot Springs | CHO | Among the darkest skies in the East, deep quiet | Far from everything; harsh winters |
| Bath County | Bath, VA | 2,000–3,000 | Bath Community, Hot Springs | CHO | George Washington NF, hot springs | Few parcels; resort pricing |
| Nelson highlands (Montebello) | Nelson, VA | 2,500–3,800 | UVA, Charlottesville | CHO | A university hospital within reach, Parkway | HOAs common near Wintergreen; pricier |
| Blacksburg outskirts | Montgomery, VA | 2,000–2,600 | Carilion NRV, Christiansburg | ROA | University-town services, Huckleberry Trail | Busier, lower, brighter sky |
| Sparta | Alleghany, NC | 2,700–3,200 | Alleghany Memorial, Sparta | GSO | Parkway, New River, Stone Mountain SP | Small critical-access hospital |
| Ashe County (West Jefferson, Lansing) | Ashe, NC | 2,800–3,500 | Ashe Memorial, Jefferson | TRI, GSO | New River, Mount Jefferson, farm country | Gray winters |
| Boone and Blowing Rock | Watauga, NC | 3,000–3,800 | Watauga Medical Center, Boone | TRI, CLT | The high country's best services, App State | Busier, pricier, brighter sky |
| Banner Elk and Beech Mountain | Avery, NC | 3,500–5,000 | Cannon Memorial, Linville | TRI | The coolest summers in the region | Steep lots, HOAs, harsh winters |
| Spruce Pine and Little Switzerland | Mitchell, NC | 2,500–3,500 | Blue Ridge Regional, Spruce Pine | AVL, TRI | Roan Highlands, Parkway | Helene (2024) damage; check roads and slides |
| Burnsville and Celo | Yancey, NC | 2,800–3,500 | Blue Ridge Regional, Spruce Pine | AVL | Black Mountains, Mount Mitchell, crafts | Helene damage; no hospital in the county |
| Madison County (Mars Hill, Hot Springs) | Madison, NC | 2,000–3,000 | Mission, Asheville | AVL | AT, French Broad, near Asheville | Steep hollows; Helene damage |
| North Buncombe (Weaverville, Barnardsville) | Buncombe, NC | 2,200–3,000 | Mission, Asheville | AVL | City services and the airport in 30 minutes | Pricier, brighter sky |
| Haywood highlands (Waynesville) | Haywood, NC | 2,700–4,000 | Haywood Regional, Clyde | AVL | Smokies and the Parkway | Tourist traffic around Maggie Valley |
| Brevard and Pisgah | Transylvania, NC | 2,100–3,000 | Transylvania Regional, Brevard | AVL | Pisgah NF, waterfalls, mountain biking | Very wet |
| Highlands and Cashiers | Macon and Jackson, NC | 3,500–4,100 | Highlands-Cashiers Hospital | AVL | Cool summers, granite domes | Among the wettest places in the East; costly; HOAs |
| Franklin and Otto | Macon, NC | 2,000–3,000 | Angel Medical, Franklin | AVL | Nantahala NF, AT, lower land prices | Lower, warmer, more humid |

Eastern Tennessee, same columns:

| Area | County, state | Typical land elevation (ft) | Nearest hospital | Airport | Fits people who want | Trade-off |
| --- | --- | --- | --- | --- | --- | --- |
| Roan Mountain | Carter, TN | 2,800–4,500 | Sycamore Shoals, Elizabethton | TRI | Roan Highlands, the AT, Roan Mountain SP | Steep land; hard winters up high |
| Shady Valley and Mountain City | Johnson, TN | 2,400–3,000 | Johnson County Community, Mountain City | TRI | A quiet high valley, Cherokee NF, the Creeper Trail via Damascus | Remote; small hospital |
| Butler and Watauga Lake | Johnson and Carter, TN | 2,000–3,000 | Sycamore Shoals, Elizabethton | TRI | The lake, Cherokee NF, the AT | Lake-view pricing |
| Unicoi and Erwin | Unicoi, TN | 1,700–3,000 | Unicoi County Hospital, Erwin | TRI | The AT, Unaka Mountain, the Nolichucky | Helene (2024) flooding along the Nolichucky |
| Cosby | Cocke, TN | 1,500–3,000 | Newport area | TYS | The quiet side of the Smokies | Lower and more humid |

Worth adding once their parcel services are wired in: Blue Ridge (GA), and Canaan Valley and Pocahontas County (WV).

**Sample parcels (step 4).** For each area, Claude Code pre-screens two typical rural parcels (10–30 acres, no house) with the same engine the tests run in Node. Only their measurements ship with the app, with no owner fields (decision 23). The preview grades them under the user's rubric at display time, so no user waits on a screen and any rubric edit updates the preview instantly.

## Screening results

A screen should answer one question first: what is the best this parcel can be for you? Then show at most two alternatives and three ways to do better. The engine still finds every site it finds today; the results just stop listing them all.

The results panel, top to bottom:

1. **The answer.** Parcel grade and verdict for you (household members' predictions one tap away), with one line of reason, for example: "B, Contender. Strong winter sun and trails; 38 minutes to an ER is past your 30."
2. **Best homesite.** The bulls-eye on the map and its four or five numbers that matter to your rubric.
3. **Up to two alternatives.** Shown only if within 10 points of the best and at least 100 m away, so each is a real choice rather than the same bench twice. The rest sit behind "6 more spots".
4. **Report card.** One row per factor, in your rubric's order: Musts as pass, fail or unknown, then Should, then Could. Won't factors are hidden.
5. **Ways to raise this grade.** At most three (below).
6. **Still unknown.** Each unknown factor as a question for the agent, ready to copy.

**Highest capability.** Homesites are ranked by each person's rubric, using the factors that differ from site to site: winter sun, sky, view, privacy, garden ground, elevation, and the driveway to that site. The parcel's grade is taken at the best site, with the best access found, including access along lines you drew. Two people can get different best sites; a member's prediction uses the best site under their own rubric.

**Ways to raise the grade.** The app tries a short list of changes and shows only those that move the letter or the verdict, each with what it would take.

| Change | What the app recomputes | Ready today? |
| --- | --- | --- |
| Use a different homesite | Already computed for every site | Yes |
| Use your drawn track or a recorded easement for access | Driveway and drive times (WF6a's reroute) | Engine yes; app side was WF6b |
| Clear trees south of the house | Winter sun and sky with canopy removed in a wedge to the south | Needs canopy heights from lidar first returns; the viewer's canopy line suggests the data is close |
| Add the neighboring parcel | A combined screen (the recipe model already combines parcels) | Yes, but a full re-screen; offered as a button, not run automatically |
| Accept an alternative septic system | Septic Must becomes a pass with a cost note, if your rubric allows it | Yes |
| Ask to move a right-of-way | Driveway along a line you draw for the proposed route | Yes, as a drawn line; the legal side is a question for the agent |

Each suggestion reads as cause and effect, for example: "Clearing about half an acre south of site 1 adds 2.3 hours of December sun: Winter sun C → A, parcel B → B+." Costs appear only where the app has a rate; otherwise the line says what to ask.

## History, favorites and the report card

This is mostly renaming and simplifying what's built. History keeps every screen automatically; Favorites holds only what you star, and that's where comparing happens.

**History.** Every screen, newest first, as today. Unstarred parcels can be cleared in one tap. The current "In progress" status goes away, because that is what History is.

**Favorites.** A star on the results panel and on each History row. Starring asks for a name, prefilled from the listing address or a description such as "24.6 ac on Rte 600, Grayson". Favorites is today's Library: My order by drag, filters, sorting by your grade, a household member's predicted grade, price or acres, the compare table, Walked and Offered tags, and Archived with a reason.

**Attachments.** Listing photos, plats, perc letters and agent PDFs need file storage. Browser storage can hold them, but it is per device, can be cleared by the browser, and would bloat the export file. The better home is storage with accounts. Until then, links to the listing and to shared drives cover most of it.

**The report card export.** A "Report card" button on any screened parcel opens a print-ready page; the browser's Print → Save as PDF does the rest. No server-side PDF is needed: step 14 already made every report block render from the saved result alone, which is exactly what a print page needs. Two presets:

- **One page:** name, map with boundary and best site, grade and verdict for each person, the report card rows, top ways to raise the grade, and the questions for the agent.
- **Full:** everything the app knows, in this order: the one-page summary; the rubric it was graded against; best site and alternatives; access and driveway; winter sun and the horizon; night sky; soils, septic and flood; drive times; listing facts and notes; data sources with their dates and the engine version; and a closing line that this is a desk screen, not a survey, perc test or appraisal.

The map image needs one technical choice: capture the live map canvas, or render a static map for print. Claude Code should pick in the plan.

## What the land can do, and what it can pay

Two panels on every screened parcel, next to the report card but outside the grade. The grade answers "is this right for us?"; these answer "what could we do here?" and "how could it pay us back?". Money never enters the grade, as the value-ranking rule already says.

**Panel 1: What you can do here.** Uses the screen already supports, each with a yes, a maybe with its reason, or a no:

| Use | What decides it | Data |
| --- | --- | --- |
| Camp now | A clearing or open ground the 4x4 can reach; cost to camp | Lidar, canopy, router, step 9 |
| Build | Best site, septic class, room to build | The screen today |
| Trails and walking woods | Gentle ground under mature canopy, total trail length possible at ≤ 15% | Lidar slope and canopy height |
| Garden, orchard, animals | Garden ground, frost position, water | The screen today |
| Hunt | Acreage, forest cover, adjoining public land, county and state rules | PAD-US, acreage |
| Ride, ski, snowshoe from home | Bike distance to a long trail; adjoining corridors, which are private unless the neighbors agree | OSM, PAD-US |
| Divide | How many lots the county's rules allow: standard lots by frontage, large lots by easement | A county rules table, the Split tool |
| What limits you | Easements of record you enter (ROW, scenic, utility), the deed restrictions field, a power line's distance to the house | Listing fields, OSM power lines |

**Panel 2: How it could pay.** Each option shows eligibility from the screen, a range with its source and as-of date, and what it costs you in use. Each also gets the one question for the agent or professional that turns the range into a number.

| Option | Eligibility from the screen | The number shown | What it costs you |
| --- | --- | --- | --- |
| Conservation easement and Virginia tax credit | Divisible lots given up, Parkway or public-land viewshed, stream, forest | 40% state credit on an appraised value the app can't know; shows the formula and an "if the easement value were X" slider, not a figure | Permanent: lower resale value and limited building rights |
| Use-value (land use) tax | 20+ acres of forest; whether the county takes part | Today's tax vs the use-value tax, from county rates | A rollback tax if the use changes |
| Forest carbon | 30+ acres of naturally regenerating forest in an eligible region (Family Forest Carbon Program) | Eligible yes or no; the program quotes payment | A practice contract, often on harvesting |
| Hunting lease | Acreage, forest, access | A regional per-acre range, low confidence, dated | Your own use in season; liability and a lease |
| Selective timber | Mature hardwood from canopy height | Only from a timber cruise you enter; otherwise "ask for the cruise" | Woods look different for some years |
| Split and resell | Lots the county allows, frontage per lot, each piece screened on its own | The break-even price per acre for the piece sold, with price, years held, interest rate and costs as inputs | Less land, a neighbor; covenants or an easement can protect your side |
| Camp sites | Clearings, access, county rules | No number; links to the county's rules | Visitors on the land |

Rules for both panels:

- **Ranges, not promises.** Every dollar figure carries its source, date and a confidence word. Anything that needs an appraisal, cruise or quote says so instead of guessing.
- **Location-specific tables live in config with dates:** county division rules, use-value participation and rates, program eligibility. Starting with Floyd, Grayson and Carroll (VA), Ashe and Alleghany (NC), and Carter and Johnson (TN). Outside them, a panel row says "not covered here yet".
- **Not advice.** One line on each panel: talk to a tax advisor, a land trust or a forester before acting.
- **The Split tool becomes a scenario.** "Keep this piece, sell that one" screens both pieces and shows each panel for each.

Both panels go into the Full report card export.

## Roadmap

Each step is one unattended mission for Claude Code. You approve its plan once; it runs as many PRs as it needs while you're away; it hands back a report and a test plan you can run by hand. Fifteen steps; the first is the foundation for the rest.

**How a mission runs:**

- **Plan first.** Claude Code writes `docs/plans/<step>.md` with scope, the numbers it may change, and its stop conditions. You approve it once.
- **A step branch.** It branches `step/<n>-<name>` from main, opens each PR into that branch, and merges them itself when CI is green. Main stays yours: one final PR from the step branch to main, which you merge after running the test plan on its preview. Claude Code first confirms CI runs on PRs into step branches.
- **It stops and waits** when a change would alter expected.json or verdict text beyond what the plan declared, when a product decision is needed, when the same CI failure survives three attempts, or when the plan turns out wrong. It leaves the work on the branch and says why.
- **The hand-back:** what shipped, the PR list, any numbers change with its `diff:prototype` summary, deviations from the plan, questions it parked, and the test plan.
- **The test plan:** numbered steps on the preview URL, each "do this → expect that" with a pass/fail box, desktop first and then phone, using the fixture parcels by name (Mud Creek, Macks, Ferney, and a Roan Mountain one once it exists). About 15–30 minutes.

**The steps:**

1. **Profiles and the grading split.** Anyone opening the link creates a local profile; profiles can be added, switched and renamed, and all data is scoped to a profile. Today's data moves into a first profile. Saved screens store raw measurements; grades are computed on display from measurements plus the profile's rubric. The default rubric reproduces today's grades exactly on every fixture, so nothing visible changes except the profile picker.
2. **Tennessee.** Statewide parcel lines through the state's parcel program ([Comptroller parcel data](https://comptroller.tn.gov/office-functions/pa/gisredistricting/parcel-data-stewardship.html), served on [TNMap](https://tnmap.tn.gov/arcgis/rest/services/ADMINISTRATIVE_BOUNDARIES/COUNTY_BOUNDARIES_AND_CITY_BOUNDARIES/MapServer)); Claude Code confirms the parcel service, its fields and its terms first. Tennessee imagery, Tennessee trailhead sources, and a recorded fixture near Roan Mountain.
3. **Rubric editor.** The four columns, drag between and within, threshold sliders, live preview on the open parcel.
4. **Interview.** The 14 screens, the rubric generator, first-launch onboarding for a new profile, and "Redo the interview".
5. **Household.** Members, rubric import by code or file, "How would Julie rate this?", and "Send to confirm" as a shared file or link.
6. **Screening results.** The answer first, best site plus up to two alternatives, report card in rubric order, unknowns as agent questions.
7. **Favorites.** Star, name field, History and Favorites split.
8. **Report card export.** The print page with One page and Full presets.
9. **Cost to enjoy.** Cost to camp and cost to build from the parcel's state and markers, graded against the two budgets.
10. **New data points,** one PR each: Climate and Privacy first, then Long view, Airport, Bike to a long trail, Internet. Hospital becomes its own factor in the first.
11. **Ways to raise the grade.** Homesite, access, septic and combine first; tree clearing after canopy heights are confirmed.
12. **Area catalog.** The 30 areas, area profiling run headless on a schedule, scoring, the suggestion box, sample parcels.
13. **Accounts and attachments.** Sign-in that adopts existing local profiles, file storage for photos and PDFs, and in-app "Send to confirm".
14. **What the land can do.** Panel 1, the county rules table, power-line distance, and the Split tool as a keep / sell scenario. Can run any time after step 9.
15. **How it could pay.** Panel 2 with dated, sourced ranges; the easement slider; use-value tax; carbon eligibility; split break-even. After step 14.

**Paused:** WF6b (the engine half is merged; the app side waits), 57 (snap lines to lidar), 46 (county grade limits), the cost-label PR, VR8 calibration and Batch B. VR8's weight calibration is replaced by the interview and editor; its band cutoffs get a lighter sanity check after step 10.

**Decided 10/16:**

- **Users.** No accounts yet. Anyone with the link creates a local profile that holds their data in that browser. Nothing is hard-coded to Zach and Julie; accounts later adopt the profiles.
- **Cost to enjoy stays,** as cost to camp and cost to build, driven by the parcel's state (step 9). It's most sensitive to access: right-of-way, access work and the pioneer track.
- **Tennessee is in,** for parcels (step 2) and the catalog.
- **Household grades are predictions.** Each person grades for themselves; others' grades are predicted from their rubrics, with a prompt to send for confirmation. No combined household grade.
- **Phasing isn't asked.** The parcel's state shows it: wooded and expensive reads as camp first; a road and water already in reads as close to ready to build.

**Still open:** Georgia and West Virginia, after the catalog ships.
