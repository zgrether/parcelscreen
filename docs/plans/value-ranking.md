# Value ranking: the parcel report card, plain-language panels, and cost to enjoy (plan)

Status: **plan, for the owner's approval. No code until approved.** Written from the owner's consolidated
value-ranking spec (2026-10-09, replacing the original message and addenda 1–2) and the report-card message
(approved 2026-10-10, replacing the earlier "grading transparency" block). Order: A4b PR A (#94) → this plan → A4b PR
B (the router) → follow-up 47 (unit costs) → the implementation PRs in §11.

Every threshold, band edge, weight and unit cost below is a **proposal**. They all live in config, and the
calibration in §12 tunes them.

## 1. Purpose

A buying decision, not just a ranking. The user enters a parcel and its asking price, and the screen answers three
questions:

1. **Is it suitable** for what we want to do here?
2. **What does it cost to enjoy**, stage by stage, over the asking price?
3. **Why is parcel A worth more to us than parcel B**, even when B is cheaper to enjoy?

Question 1 is the report card (§3). Question 2 is the cost to enjoy (§4). Question 3 is the comparison table (§7),
which sets cost against the qualities money can't add.

## 2. Inputs and data

- **Asking price:** optional, entered by the user, stored on the History record (not in the screen result: a price
  changes without the land changing). Without a price, the stages show cost above purchase only.
- **Schema v3, a clean break** (owner, 2026-10-09). Old records aren't migrated or read: when the engine version
  bumps, a saved parcel is re-screened, or dropped if a re-screen isn't possible. Asking prices are entered again by
  hand. **To record as a §9 decision** in the first implementation PR (proposed text in §13).
- **What the screen already computes** and the card reads, with no new data source: the site's elevation, the
  homesite grade, the sky's zenith brightness, acres at or under 15% grade (`terrain.acresUnder15`), trailheads
  and public land (PAD-US access and distance), drive times to the hospital and the grocery, gardens and their soils,
  FEMA flood zones, the NRCS septic and dwelling ratings, the driveway's routes (after A4b: grade over 30 m, the
  veto, and PR B's lengths).
- **One new data source,** for Stage 1a's open ground (§4.2). Everything else is computed from what's already fetched.

## 3. Two levels of grading

### 3.1 The homesite grade: unchanged

Today's grade stays as it is, and its only job is **choosing the build spot** on a parcel. It's a microclimate and
build-cost score: quality (sun, aspect, frost, slope, sky) and cost (septic, foundation, rock, pad, driveway). It
ignores elevation, drive times, public land, room, gardens and price, which is why random parcels grade 78% A/B at
engine 6. It isn't meant to judge the parcel.

**No change to it** (owner, #95 review). Its build-cost part, the over-limit driveway points included, stays in the
homesite grade for choosing and ordering the build sites, and the A4b veto still applies. The parcel card reads only the
#1 site's **quality** grade (`qGrade`: sun, facing, frost, slope, sky) for its Best homesite row (§3.2), and Stage 2
prices the driveway for the cost to enjoy. Fixable items never reach the parcel grade (§3.3).

### 3.2 The parcel report card: the headline

**Dealbreakers** (pass / warn / fail). Any fail makes the verdict Pass.

| Gate | Data | Pass | Warn | Fail |
|---|---|---|---|---|
| **Floodplain** | FEMA NFHL, the build site and the parcel | no Special Flood Hazard Area on the parcel | an SFHA on the parcel, not at the build site | the build site is in an SFHA |
| **Legal road access** | Census TIGER roads, the driveway's entrances | frontage on a road (an entrance on the boundary) | no frontage found within 130 ft; routed from the nearest road point (deed or plat must show access) | no road within 400 m of the boundary (landlocked, or TIGER is wrong) |
| **Easement needed** | the scored driveway (A4, A4b) | the scored route stays on the parcel | the scored route needs an easement | no practical route (every candidate vetoed, A4b) |
| **Septic** | NRCS septic rating, every soil on the parcel | some soil rates better than "very limited" | no soil on the parcel rates better than "very limited" (the owner's rule) | — (never a fail: a soil evaluation on the spot decides) |

**Graded rows** (A–F each, weighted per user). Cutoffs and default weights are proposals, in config.

| Row | Question | Data | A | B | C | D | F | Weight, Zach / Julie |
|---|---|---|---|---|---|---|---|---|
| **Elevation at the build site** | High enough for the climate and the views we want? | 3DEP elevation at site #1 | ≥ 3,000 ft | 2,500–3,000 | 2,000–2,500 | 1,500–2,000 | < 1,500 | 25 / 10 |
| **Best homesite** | Is there a good place to build? | site #1's quality grade (`qGrade`: sun, facing, frost, slope, sky), not the full homesite grade with its build cost | A | B | C | D | F (or no site) | 25 / 15 |
| **Night sky** | How dark is it overhead? | Lorenz atlas zenith brightness (mag/arcsec²) | ≥ 21.5 | 21.2–21.5 | 20.9–21.2 | 20.5–20.9 | < 20.5 | 10 / 10 |
| **Room to build** | Does the whole build fit on gentle ground: the house, the garage, the turnaround and the septic field with its reserve? | the build footprint (§5.4) placed on ground at or under 15% grade: the pad on a homesite, the drainfield and reserve on the rest | gentle ground ≥ 3× the footprint | ≥ 2× | ≥ 1.25× | fits, under 1.25× | **doesn't fit** | 15 / 10 |
| **Trails and public land** | How close is the woods we can walk in? | PAD-US open-access land (adjoining, within a mile, nearest beyond); trailheads (straight-line until follow-up 39 adds drive times) | adjoins open public land, or a trailhead within 5 km | open land within a mile, or a trailhead within 10 km | trailhead within 20 km | within 35 km | farther | 10 / 25 |
| **Town and hospital** | How far to groceries, and to an emergency room? | OSRM drive times (the hospital with an ER where known; the nearest real grocery, or the closer one) | ER ≤ 20 min and grocery ≤ 10 | ≤ 30 and ≤ 20 | ≤ 45 and ≤ 30 | ≤ 60 and ≤ 45 | beyond | 5 / 10 |
| **Garden ground** | Is there ground to grow food on? | the gardens found, and their soils' NRCS farmland class | a garden ≥ 0.5 ac on prime or statewide-important soil | ≥ 0.25 ac | ≥ 0.1 ac | any garden | none | 10 / 20 |

**Weights.** Each person's weights sum to 100. The defaults above are a proposal from the household's stated
priorities: for Zach, passive-solar building and elevation; for Julie, recreation, self-sufficiency and remoteness.
The rubric work (follow-up 41) replaces them with each person's answers.

**Town and hospital vs remoteness.** Remoteness is one of Julie's priorities, and this row rewards being near town.
I propose to keep the row about **emergency care and supplies**, and give remoteness its own row only if the
calibration (§12) shows the card misses it. Open question 4 (§10).

**The parcel grade** is the weighted average of the rows (A 4, B 3, C 2, D 1, F 0), lettered A ≥ 3.5, B ≥ 2.5,
C ≥ 1.5, D ≥ 0.5, else F. It's shown per person: the weight switcher (§7) changes it, and nothing else.

**The verdict:**
- **Pass:** any fail, or a parcel grade below 1.75.
- **Contender:** a parcel grade of 2.75 or better, with at most one warn.
- **Maybe:** everything else.

**The one-line reason** comes from the weakest row or gate, by template. A fail beats a warn, and a warn beats the
lowest row. Examples: "Pass: the build site is in a FEMA flood zone." "Maybe: no soil on the parcel rates better than
very limited for a septic field." "Contender: the weakest part is town and hospital (D, a 48-minute drive to an ER)."

**What the fixtures would show** with these proposals, at engine 9 (illustration only, read from `expected.json`):

| | Ferney Creek 52-47A | Macks Mountain 35-3 | Grayson Mud Creek 6273 |
|---|---|---|---|
| Elevation at #1 | 2,729 ft: B | 3,251 ft: A | 3,543 ft (the 1.28 ac site, #1 once the footprint applies; §5.4): A |
| Best homesite (quality) | A (88) | A (84) | A (82, the 1.28 ac site) |
| Night sky | 21.39: B | 21.37: B | 21.52: A |
| Room to build | 18.7 ac gentle, 41× the footprint: A | 20.9 ac, 46×: A | 1.3 ac, 2.8×: B (§5.4) |
| Trails and public land | trailhead 10.4 km: C | adjoins restricted land; trailhead 14.5 km: C | trailhead 7.9 km: B |
| Town and hospital | ER 48 min, grocery 16: D | ER 48, grocery 61: F | ER 38, grocery 38: D |
| Garden ground | 2.48 ac (soil class to check): A or B | 0.34 ac: B | 0.10 ac: C |
| Gates | all pass | septic warn | floodplain warn, septic warn |

**Best homesite on quality alone** reads A on all three fixtures (88, 84 and 82): the #1 sites are good spots, and
the row won't separate these parcels unless calibration tightens its cutoffs.

**Not computed yet:** the grades, the verdicts and the farmland-class check. The implementation (§11, VR2) computes
them, and the calibration decides whether they're right.

### 3.3 What money can't add, and what it can fix

- **Can't add:** elevation, dark sky, view and horizon, sun, drive times to trails and towns, buildable room, flood
  risk, neighbours and HOA, soil for growing food. The parcel grade comes only from these.
- **Can fix with money:** the driveway, clearing, septic, the well, power. These never reach the parcel grade: they
  are stage costs. The homesite grade uses them only to pick the spot (§3.1).
- **No dollars for qualities.** The card never converts a quality into dollars. The comparison sets the two side by
  side: "B is $X cheaper to enjoy through Stage 2; A has [the qualities money can't add]."

## 4. Cost to enjoy, by stage

Each stage adds to the one before. Each shows low / mid / high, "+$y over asking", and a running total. Every line
item names its unit cost and its source. **Unit costs that aren't in today's Settings are TBD until follow-up 47;**
the plan sets the structure, and 47 sets the numbers.

### 4.1 The stages

| Stage | What it buys | Line items | Source today |
|---|---|---|---|
| **0, Purchase** | the land | asking price | the user |
| **1a, Camp today** | a tent and a vehicle on usable open ground near the road | hike-in or a rough track to the nearest open flat spot; light clearing; basic water. If there's no open ground: clearing the nearest flat spot | open ground: §4.2. Track: the pioneer-track model (`trackCost`, today's rates). Clearing and water: TBD (47) |
| **1b, Camp at the build site** | a pioneer track to the best combined camp and build site (the screen's pick or the user's) | the pioneer track on the **Stage 2 alignment**; site clearing | `trackCost` on the scored route (today's "On the driveway's alignment" estimate). The **carry-over** into Stage 2 is the rough-cut earthwork on that alignment, shown as a credit so it isn't counted twice |
| **2, Ready to build** | a durable driveway one person can maintain, a pad, septic, well and power | gravel driveway on the scored route (culverts, water bars); paving where the 30 m grade exceeds `driveway.paveAbovePct` = 12%; a yearly maintenance estimate; house pad and clearing; septic by class (§5.3); **well and power as unknowns with ranges** | driveway: today's route cost (after PR B's corrected lengths); paving, maintenance, pad, septic, well, power: TBD (47) |
| **3, Home** | the house | 1,200–1,700 sq ft 2-bed/2-bath plus a large garage (workshop, gym, golf sim / theatre, overflow sleeping) at a configurable $/sq ft; the foundation type's adder (§5.1); the dig cost in rock (§5.2) | house and garage $/sq ft and sizes: Settings (new, TBD values); dig cost: today's `earthSoilPerYd` / `earthRockPerYd` |

**Budget checks:**
- **Ready to build:** stages 0–2 ≤ `budget.readyToBuild` = $300k.
- **Total:** ≤ `budget.total` = $1M, with a target of $800k.
- **Bands:** each check reads "within", "tight" or "over". The "tight" band is a Settings value (proposed: within 10% of the limit).

### 4.2 Open ground for Stage 1a (a new data source)

**Proposed:** the USFS/MRLC **NLCD Tree Canopy Cover** (CONUS, 30 m, latest release) together with **NLCD Land
Cover** (30 m), read through MRLC's public ArcGIS ImageServer `exportImage` (the same pattern as 3DEP). It goes
through `lib/http` with a connector cadence, and is recorded once per fixture into `network-port.har`.

"Open ground" is the cells that meet all three tests:
- canopy below 20%, or land cover grassland, pasture or cultivated (classes 71, 81 and 82);
- the 3 m DEM slope under 15%;
- reachable from the road access point by the pioneer-track model.

The nearest such patch of at least 0.05 ac is the camp.

**How reliable it is:**
- **Resolution:** 30 m cells. A clearing smaller than about 0.2 ac (two or three cells) can be missed. A narrow
  logging road is invisible.
- **Canopy error:** canopy is a modelled percentage, typically within ±10–15 points per cell.
- **Age:** the products lag the ground by 2–4 years, so a recent cut or regrowth is wrong.
- **What the card says:** the panel states all of this, and says to check the state ortho (already on the map) before
  driving out.

**Alternative, if you prefer:** classify the state orthos (VBMP, NC OneMap) for open ground. It's sharper (1 ft) and
newer, but it needs an image classifier; I'd start with NLCD and keep this as an option.

### 4.3 Open question: unknowns (well, power) in the range

**Proposed:**
- **The headline:** the stage shows the known items' low–mid–high, plus "well and power unknown: +$A–B" as a separate,
  hatched segment on the range bar. The headline figure is the known mid.
- **The tooltip:** "the mid with typical well and power" is the known mid plus the unknowns' mid, so neither hides
  the other.

## 5. New computed outputs

### 5.1 Foundation type at the build site

**Rules (proposed, in config):** from the site's slope, the bedrock depth, and the NRCS rating "Dwellings Without
Basements" (already fetched since A3):
- slab or crawl space under 4°;
- walkout or garage-under from 4° to 10°;
- cut-and-fill and retaining walls from 10° to 16°;
- engineered piers at 16° and over.

**Overrides:**
- **Shallow bedrock:** under 50 cm of soil moves the type one step toward piers, or a pinned slab.
- **"Very limited" for dwellings:** adds "engineered design" to the type.

**Where it shows:** the type and a cost adder (TBD, 47) go into Stage 3.

### 5.2 Dig cost in rock

A basement for the Settings footprint (new: `house.footprintSqFt` = 1,500, `house.basementDepthFt` = 8). The
excavation is split into soil above the bedrock depth and rock below it, priced at today's Settings rates
(`earthSoilPerYd` = $12, `earthRockPerYd` = $90). The panel shows the extra over all-soil, and the dig cost goes
into Stage 3.

**The owner's example, checked against today's defaults:**
- **Volume:** 1,500 sq ft × 8 ft = 444 yd³.
- **All soil:** 444 × $12 = **$5,333**.
- **Cowee soil (77-29C), rock at 99 cm (3.25 ft):** 181 yd³ of soil × $12 + 264 yd³ of rock × $90 = **$25,909**.
- **Extra for rock:** about $20.6k.

Calibrated in follow-up 47 (swell factor, rock type).

### 5.3 Septic, plainly

**The panel explains:** NRCS is the USDA soil survey's rating of how well a soil takes a septic drainfield.

**Mapping (proposed, from each soil's rating and its limiting features, already fetched since A3):**
- **Conventional:** not limited, or somewhat limited.
- **Modified:** very limited by slow percolation or slope alone (a low-pressure or shallow system).
- **Alternative:** very limited by a high water table, bedrock or a restrictive layer within about 50 cm, or flooding.

**It always says:**
- An alternative system costs much more, and usually needs servicing every year.
- **"Get a soil evaluation on the spot before an offer."**

The class picks the septic line item in Stage 2. The gate in §3.2 is the owner's "very limited everywhere" rule.

### 5.4 The build footprint (owner, #94 review, 2026-10-10)

**Why.** #94 made Grayson's 0.24 ac shelf the #1 homesite, and it can't hold the build. The homesite grade has no
idea of the build's size. A **build footprint** in Settings fixes that, in two places: (a) which site can be #1, and
(b) the Room to build row.

**The footprint (Settings, proposed defaults, with sources):**

| Part | Default | Area | Source |
|---|---|---|---|
| House | 1,700 sq ft, single storey or walkout (the top of the owner's 1,200–1,700 range), as a 34 × 50 ft rectangle with a 15 ft working margin all round | 64 × 80 ft = **5,120 ft²** | the owner's spec; the 15 ft margin (excavation, forms, equipment) is a proposal |
| Large garage | 30 × 40 ft = 1,200 sq ft (workshop, gym, golf sim / theatre, overflow sleeping), with the same 15 ft margin | 60 × 70 ft = **4,200 ft²** | a golf simulator needs about 10–15 ft wide, 12–20 ft deep and 9–11 ft of ceiling ([Golfer's Authority](https://golfersauthority.com/how-much-room-do-you-need-for-a-golf-simulator/), [Austad's](https://austads.com/blogs/blog/how-much-space-do-you-really-need-for-a-golf-simulator)); the rest of the 30 × 40 holds a two-bay workshop, a gym corner and a sleeping room |
| Driveway turnaround | a 120 ft hammerhead, 20 ft wide | **2,400 ft²** | International Fire Code Appendix D, Table D103.4: a dead-end access over 150 ft needs a 120 ft hammerhead, a 60 ft "Y" or a 96 ft cul-de-sac ([Seattle's adoption of Appendix D](https://seattle.gov/documents/Departments/SDCI/Codes/SeattleFireCode/2021SFCAppendixD.pdf)). Whether a county applies it to one house's driveway is follow-up 46; until then this is the placeholder |
| Septic drainfield | 3 bedrooms (two, plus the garage's overflow sleeping: a room that can serve as a bedroom counts as one), conventional trenches at 60 min/in: 452 ft² of trench bottom a bedroom = 1,356 ft²; trenches 3 ft wide on 9 ft centres, so about 3× the trench area on the ground | **≈ 4,070 ft²** | Virginia Tech Extension SPES-580, Table 3, from 12VAC5-610 ([VT Extension](https://www.pubs.ext.vt.edu/content/pubs_ext_vt_edu/en/SPES/spes-580/spes-580.html)); NC sizes by 120 gal/day a bedroom over the soil's long-term acceptance rate, with similar results on clayey soils |
| Septic reserve | 100% of the drainfield | **≈ 4,070 ft²** | Virginia's state minimum is a 50% reserve where percolation is slower than 45 min/in ([12VAC5-610-710](https://law.lis.virginia.gov/admincode/title12/agency5/chapter610/section710/)); some Virginia counties require 100% or 200% (VT Extension, above); North Carolina requires a repair area on lots recorded since 1983. 100% is the cautious default |

**Totals:**
- **The pad on a homesite** (house, garage, turnaround): 11,720 ft², about 0.27 ac.
- **The whole footprint** (with the drainfield and reserve): about 19,860 ft², 0.46 ac.

**Caveats:**
- **Septic sizes vary.** Where the soils are "very limited", the system is likely alternative (§5.3), and its area can differ.
- **An estimate, not a plan.** The footprint is a screening estimate; the soil evaluation and the county decide the real one.

**(a) Which site can be #1.** Each ranked site gets a fit:
- **fits** when the pad fits on it: the pad's area, and a check that the house rectangle and its margin fit the site's shape;
- **"fits house only"** when the house and its margin fit but the pad doesn't;
- **"too small for your build"** when even the house doesn't.

A site that doesn't fit can't be #1. Sites that fit rank first in their own order, then the rest, labelled. The
homesite grade itself doesn't change: it still rates the spot. The label is added to the site's card (rule 7,
appended).

**"Garage under the house (walkout)"** (Settings toggle, owner, #95 review; off by default). When it's on, the garage
is the house's lower level: its area folds into the house's, and the footprint is the larger of the two (1,700 sq ft
by default), so the pad is the house rectangle with its margin plus the turnaround: 5,120 + 2,400 = **7,520 ft²**
(0.17 ac, against 11,720). The fit check then also needs a walkout's slope: a site fits as a walkout when the smaller
pad fits **and** its slope is in the foundation band for a walkout or garage-under (4–10°, §5.1). Outside that band
the separate-garage pad applies, so a flat or steep site isn't credited with a walkout it can't have. On Grayson, the
0.24 ac shelf would fit the walkout pad by area (10,444 ft² ≥ 7,520), but its slope is 11.3°, above the band, so it
stays "fits house only"; the 1.28 ac site (7.0°) fits either way. The drainfield, its reserve and the Room to build
row are unchanged by the toggle, except that the pad they're added to is smaller.

**(b) Room to build.** The row checks that the whole footprint fits on gentle ground (at or under 15% grade): the pad
on the #1 site, and the drainfield with its reserve on the remaining gentle ground near it (proposed: within 300 ft of
the pad). It's graded by how much gentle ground there is beyond the footprint (§3.2), and is an F when it doesn't fit.
It no longer grades total acres under 15%: 1.3 scattered acres can hold less than a single acre in one piece.

**(c) Grayson, before and after** (engine 9, the footprint above; the site areas are from `expected.json`):

| Site | Area | Before (engine 9) | Fit | After |
|---|---|---|---|---|
| 0.24 ac shelf | 10,444 ft² | **#1 C 64** | the house (5,120) fits, the pad (11,720) doesn't: **fits house only** | #4 C 64, labelled "fits house only" |
| 1.28 ac | 55,896 ft² | #2 C 63 | fits | **#1 C 63** (its route kept to the parcel: 4,228 ft) |
| 0.46 ac shelf | 20,212 ft² | #3 C 59 | fits | #2 C 59 |
| 0.63 ac shelf | 27,561 ft² | #4 C 55 | fits | #3 C 55 |

**Grayson's Room to build, before and after:**
- **Before:** 1.3 ac at or under 15%, a C on total acres.
- **After:** the pad on the 1.28 ac site leaves about 1.0 ac of gentle ground beside it for the 0.19 ac drainfield and
  reserve. That's 2.8× the footprint: a B.

**What it would show on the other fixtures:** Ferney's and Macks's #1 sites (18.8 ac and 9.6 ac) fit with room to
spare. Their smallest ranked sites (Ferney's 0.37 ac shelf, 16,017 ft²; Macks's 0.70 ac, 30,438 ft²) hold the pad
by area too, subject to the shape check, so nothing moves.

## 6. The report sheet and the slide-in panels

### 6.1 The top level

The top level shows **only** these, each row one line:
- the parcel grade and the verdict, with its reason line;
- the dealbreakers;
- the graded rows;
- the cost to enjoy.

**Everything in today's long report moves into the slide-in panel of the row it belongs to. Nothing is deleted:**

| Today's section | Moves into |
|---|---|
| Verdict and flags | the verdict line; each flag in its row's or gate's panel |
| Terrain | Room to build; Elevation |
| December sun, the horizon | Best homesite (the sun panel) |
| Dark skies | Night sky |
| Where to build, the existing house | Best homesite |
| Driveway | Easement gate; Stage 1b and 2 panels |
| Where to garden; Soils | Garden ground; Septic gate; Foundation (in Stage 3) |
| Floodplain | Floodplain gate |
| Public land within a mile; the trailheads | Trails and public land |
| Getting there and getting out | Town and hospital; Trails and public land |
| Still unknown | a "Still unknown" panel under the cost to enjoy (the unknowns' ranges) |

A test checks that every sentence today's report renders still renders in some panel. Rule 7: text moves, it isn't
replaced; the new plain-language text is added (§13).

### 6.2 One pattern for every panel

Every panel is written for someone who has just tapped a parcel:

- **(a) A plain question.** Example: "Will the house, the panels and the garden get enough sun in December?"
- **(b) A banded scale in everyday words,** with this parcel's marker on it. The owner's bands (edges are proposals,
  in config):

  | Scale | Bands |
  |---|---|
  | Winter sun | Shaded < 3 h · Workable 3–5 · Good 5–7 · Excellent 7+ |
  | Facing | Ideal S–SE · Fine · Cool · North-facing |
  | Frost belt | Pocket · Thermal belt 80–400 ft · Exposed · Windy |
  | Sky | Town glow · Rural · Dark |
  | Slope as foundation | Slab or crawl < 4° · Walkout or garage-under 4–10° · Cut-fill and walls 10–16° · Engineered piers 16°+ |
  | Septic | Conventional · Modified · Alternative (the panel's words follow §5.3: "somewhat limited" is conventional, possibly a larger field; not the mock's wording) |
  | Driveway | Easy ≤ 8% · Good gravel 8–12% · Pave or regrade 12–15% · Ice, washouts, fire access 15%+ |

  Proposed for the other rows:

  | Scale | Bands |
  |---|---|
  | Elevation | Valley < 1,500 ft · Foothill 1,500–2,500 · Mountain 2,500–3,000 · High 3,000+ |
  | Room to build (the footprint multiples of the row's cutoffs; no acre bands) | Doesn't fit · Tight under 1.25× · Enough 1.25–2× · Roomy 2–3× · Spacious 3×+ |
  | Trails | At the edge · A short drive · A drive · Far |
  | Town and hospital | Close · Practical · A haul · Remote |
  | Garden | None · Kitchen garden · Market garden · Small farm |

- **(c) "What it means for you",** split by solar, garden, house and driveway where each applies. The owner's tone
  example: north-facing slopes keep ice on the driveway for days, which matters for whoever is home alone. Each band
  has its sentences, written once in config, so the same band always says the same thing.
- **(d) One small "How it's scored" line,** generated from config. Example: "A at 3,000 ft and up, B from 2,500, C from
  2,000, D from 1,500; weight 25 (Zach) / 10 (Julie)."

Each panel then lists today's report text that moved there (§6.1), under the plain part, so nothing is lost.

## 7. The comparison table

- **Columns** are parcels: several at once, added and removed from History. **Rows** are stage costs, budget checks
  and the can't-add rows, in collapsible groups (Costs / Budget / Can't add).
- **The first column is fixed.** The parcel columns scroll sideways on a phone.
- **Each cell holds only a value and a status mark:** within budget / tight / over, and better / worse than the others
  in its row.
- **Tapping a cell opens its slide-in panel** (a side panel on desktop, a bottom sheet on phone) with the line items,
  sources, range, data source, and the generated summary: "B is $X cheaper to enjoy through Stage N; A has [the
  qualities money can't add]."
- **A weight switcher (Zach / Julie)** in the header changes the parcel grade and the verdict, and nothing else.

**Desktop:**

```
┌ Compare ─────────────────────────────────── Weights: [Zach] Julie ──┐
│                        │ 52-47A        │ 35-3          │ 6273      │
│ Grade · verdict        │ B · Contender │ B · Maybe     │ C · Maybe │
│ ▾ Costs                │               │               │           │
│   Stage 0 asking       │ $180k         │ $640k         │ $95k      │
│   Stage 1a camp today  │ +$4k   ↑      │ +$9k          │ +$6k      │
│   Stage 1b camp/build  │ +$12k         │ +$31k  ↓      │ +$22k     │
│   Stage 2 ready        │ +$96k  ↑      │ +$188k ↓      │ +$171k    │
│   Stage 3 home         │ +$640k        │ +$655k        │ +$660k    │
│ ▾ Budget               │               │               │           │
│   Ready ≤ $300k        │ ● $292k       │ ✗ $868k       │ ● $294k   │
│   Total ≤ $1M          │ ● $932k       │ ✗ $1.52M      │ ● $954k   │
│ ▾ Can't add            │               │               │           │
│   Elevation            │ B  2,729 ft   │ A  3,251 ft ↑ │ A 3,299 ↑ │
│   Night sky            │ B             │ B             │ A ↑       │
│   …                    │               │               │           │
└────────────────────────┴───────────────┴───────────────┴───────────┘
  ✓ within  ● tight  ✗ over   ↑ best in row  ↓ worst in row      (+ Add from History)
```

**Phone,** first column fixed, parcels scrolling:

```
┌───────────────┬──────────── ⇠ ⇢ ┐
│ Weights Zach ▾│ 52-47A │ 35-3    │
│ Grade         │ B ·Cont│ B ·Maybe│
│ ▸ Costs       │        │         │
│ ▾ Can't add   │        │         │
│  Elevation    │ B      │ A ↑     │
│  Sky          │ B      │ B       │
└───────────────┴────────┴─────────┘
 tap a cell → bottom sheet: question · scale · what it means · how scored
```

The figures in the wireframes are placeholders, not estimates.

**The report sheet for one parcel** (desktop card or phone sheet), top level only:

```
6273 · 30.1 ac · asking $95k              Grade C · Maybe ▸
"Maybe: the septic soils are all very limited."
Dealbreakers  Flood ⚠ · Access ✓ · Easement ✓ · Septic ⚠      ▸
Elevation A · Homesite C · Sky A · Room C · Trails B · Town D · Garden C   (each ▸)
Cost to enjoy  0 $95k → 1a +$6k → 1b +$22k → 2 +$171k → 3 +$660k   ▸
```

**A slide-in panel:**

```
Winter sun at site #1                                          ✕
Will the house, the panels and the garden get enough sun in December?
Shaded <3 h │ Workable 3–5 │ Good 5–7 │ Excellent 7+
                                        ▲ 8.3 h
What it means for you
 Solar: …   Garden: …   House: …   Driveway: …
How it's scored: sun 40 of the homesite's quality points; full at 5 h (Settings).
── From the report ──  (today's December-sun section, unchanged)
```

## 8. The rulebook page: "What the grade means"

- **Content:** a page made of the same panels, for both grades (the homesite grade's sun, facing, frost, slope, sky,
  septic, foundation, rock, pad and driveway; and the parcel card's gates and rows).
- **The breakdown bar:** for a chosen parcel, the points earned and lost per row, with the grade lines marked.
- **Generated from config:** every cutoff, band edge, weight and points value on the page comes from config.
  **A test renders the page and checks that every number on it comes from config** (each number on the page is
  matched against the config values and their derived forms, such as percent and feet).

## 9. Config

**New keys, proposed (all internal unless marked Settings):**
- **The card:** `card.rows.<row>.cutoffs`, `card.weights.{zach,julie}`, `card.gates.*` (the rules' numbers), `card.verdict.{contender, pass}` (2.75 / 1.75), `card.grade.cutoffs`.
- **The panels:** `bands.<scale>` (edges and words), `meaning.<scale>.<band>.{solar, garden, house, driveway}` (the sentences).
- **The stages and budgets:**
  - `stage.*` unit costs (TBD, 47);
  - `driveway.paveAbovePct` = 12;
  - `budget.readyToBuild` = 300,000 and `budget.total` = 1,000,000 (Settings);
  - `budget.target` = 800,000 (Settings);
  - `budget.tightPct` (Settings).
- **The house:** `house.footprintSqFt` = 1,500 and `house.basementDepthFt` = 8 (Settings); `house.sqFt` = 1,200–1,700, `house.garageSqFt`, `house.perSqFt` (Settings, TBD values).
- **Foundation:** `foundation.bandsDeg` (4 / 10 / 16), `foundation.shallowRockCm` (50).
- **The build footprint (Settings, §5.4):** `build.houseSqFt` 1,700, `build.houseRectFt` 34 × 50, `build.garageFt` 30 × 40, `build.marginFt` 15, `build.turnaround` hammerhead 120 × 20 ft, `build.bedrooms` 3, `build.percMinPerIn` 60, `build.reservePct` 100, `build.garageUnder` false (the walkout toggle); internal: `build.trenchSpacingFactor` 3, `build.drainfieldWithinFt` 300.
- **Open ground:** `openGround.{maxCanopyPct, maxSlopePct, minAcres}` (20 / 15 / 0.05).

## 10. Open questions, with proposed answers

1. **The default headline stage:** **Stage 2**, ready to build (the owner's lean). The table can switch.
2. **Unknown ranges (well, power):** the known range plus a hatched unknown segment (§4.3).
3. **History's order:** **both, through a quality-vs-cost chart** (parcel grade against Stage 2 cost, one dot per
   parcel). The list's default order is verdict, then Stage 2 cost.
4. **Remoteness:** as a row of its own, or folded into Town and hospital with Julie's weight inverted? **Proposed:**
   leave it out of the card until calibration shows it's needed (§3.2).
5. **The septic mapping** (§5.3) and **the foundation overrides** (§5.1): proposed rules, to confirm.
6. **The verdict thresholds** (2.75 / 1.75, at most one warn for Contender): proposed, to calibrate.
7. **Open ground:** NLCD (§4.2), or the state-ortho classifier later.
8. **The footprint's defaults** (§5.4): the 15 ft working margin, the 3-bedroom septic design, the 60 min/in percolation, and the 100% reserve are cautious proposals; the turnaround waits on follow-up 46. **Proposed:** keep them all in Settings, so a known parcel's real numbers can be entered.

## 11. Implementation, in PRs (after approval, PR B and follow-up 47)

| PR | Scope | Acceptance |
|---|---|---|
| **VR1** | Schema v3 (clean break), the engine bump, the re-screen-or-drop policy, the asking price on the History record; §9 decision | old records re-screen or drop with a message; a test of the policy; the asking price round-trips through export and import |
| **VR2** | The report card engine (pure, from the result + config + weights): gates, rows, parcel grade, verdict, reason | the card's values on the three fixtures; config-driven cutoffs (a changed cutoff changes the grade); per-user weights |
| **VR3** | Derived outputs: the build footprint and each site's fit (§5.4), foundation type, dig cost, the septic class; open ground (NLCD, recorded) | Grayson's 0.24 ac shelf labelled "fits house only" and the 1.28 ac site #1; the 77-29C dig-cost example ($5,333 / $25,909 at today's rates); the mapping's cases; open ground on the fixtures, with the reliability note |
| **VR4** | Cost to enjoy: the stages, ranges, carry-over, budgets, unknowns | the carry-over isn't counted twice; the budget bands; unknowns shown apart |
| **VR5** | The report sheet's top level and the slide-in panel (pattern a–d); every block moved into its panel | the test that every sentence of today's report still renders; phone and desktop screenshots |
| **VR6** | The comparison table, the History columns, the weight switcher | the fixed column; the phone scroll; the status marks; screenshots |
| **VR7** | The rulebook page and its breakdown bar | the test that every number comes from config |
| **VR8** | Calibration (§12) | the household's blind grades, the tuned cutoffs and weights, the disagreements and their causes |

Each is one PR with a plan paragraph where it adds report text (rule 7), a declared numbers change where
`expected.json` moves, and the engine version bumped where the result changes.

## 12. Acceptance: calibration

Zach and Julie each grade 8–10 parcels they know, blind, on the land only, with a one-line reason per grade. The row
cutoffs and the weights are tuned until the parcel grades match theirs. The report lists every remaining
disagreement and its cause. This is the calibration step from `batch-a.md` §5c, applied to the card.

**The septic warning's frequency** (owner, #95 review). The calibration report counts how many of the parcels get the
septic warning. Two of the three fixtures do (every soil on Macks and Grayson rates "very limited"), so it may fire on
most mountain parcels and stop telling them apart. If it does, the proposed narrower rule: warn only when the build
site's own soil **and** every soil within the drainfield distance of it (§5.4, 300 ft) rate "very limited". The
report shows both rules' counts side by side.

## 13. Decisions to record in `phase-0.md` §9 (in the implementation PRs)

- **Schema v3 is a clean break** (owner, 2026-10-09): no compatibility with old data. Records re-screen on an engine
  bump, or are dropped; asking prices are re-entered.
- **The report's restructure** (owner, 2026-10-10): the report sheet's top level is the card. Today's report text
  moves into the panels unchanged, and nothing is deleted. The panels' plain-language text is added. Rule 7 holds:
  moved, not replaced.
- **Money can fix vs can't add** (owner, 2026-10-09; #95 review): fixable items never reach the parcel grade; they are
  stage costs. The homesite grade keeps them, with the over-limit driveway points and the A4b veto, only to pick and
  order the build sites; the parcel card's Best homesite row reads the quality grade.

## 14. Later, not now

**A north–south ground slice** through the build site, from the elevation data. It would be labelled with the sun
line, the Milky Way core over the ridge, the 3,000 ft line, the valley floor, the house and the driveway.

**Dependencies:**
- PR B corrects the driveway lengths that Stage 2 prices.
- Follow-up 46 sets the counties' grade and fire-access limits, which feed the driveway bands.
- Follow-up 47 sets the unit costs.
