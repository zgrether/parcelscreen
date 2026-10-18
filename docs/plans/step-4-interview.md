# Step 4: The interview

Roadmap step 4 (`PLAN.md`, Roadmap). The spec is `docs/design/workflow-review.md`: The interview, and Rubric
algorithm §1–4. Written 2026-10-18 under mission mode (`CLAUDE.md`). **Approved 2026-10-18 with the answers in §9.**
Step 3 (#173, with its UX round) is on main, so this plan uses its words: the page is "What matters to you" at
`/priorities` ("My priorities" in the menu), its columns are Must have, Really want, Nice to have and Don't care (Must,
Should, Could and Won't in the code, and in this plan's generator sections), a threshold is a "limit", the default
rubric is the "starting list", and its preview is the "Try it" strip. The mission runs on `step/4-interview`, branched
from main once this plan is merged.

Done when:
- A new profile starts with the interview: its name, then 14 screens, about four minutes, then a result screen.
- Each screen is one scene with a forced choice. "Either is fine" appears where the design lists it, and every screen
  has Skip and Back and shows progress. Question 14 (walk away / doesn't matter) comes last.
- A pure function, `rubricFromAnswers(answers)`, turns the answers into a rubric:
  - answers → importance points (0–3 per factor);
  - points → tiers (Really want 3–6, then Nice to have, then Don't care);
  - tiers → rank-sum weights (Nice to have ×0.75);
  - each answer marks its factor's B/C edge, which places the bands;
  - question 14's walk-away chips become Must haves, with limits where they have one.

  More than five walk-away chips shows "That will rule out most land."
- Every answer is stored raw on the profile, those about factors the app doesn't measure yet included (kept, not
  shown: owner, 10/18), and §5 says how a later step adds such a factor without overwriting the editor's changes.
- The result screen shows the priorities it made and Try it, then "Fine-tune in My priorities".
- A profile with no answers gets "Answer a few questions (about 4 min)" in the menu and on /priorities; after that the
  priorities page alone offers "Finish your questions (6 of 14)" or "Answer the questions again" (owner, 10/18). The page gets "Reset to my answers",
  next to "Reset to the starting list".
- Nothing asks about health, income, age or family.

## 0. What's already there (found while planning)

- **The rubric model needs no change.** `lib/rubric/types.ts` already holds everything the generator writes: Musts
  (gates, and minimums with a threshold), ranked Should/Could cards, Won'ts, bands, and `weights: { mode: "rankSum" }`.
  `rankSumShares` (Could ×0.75) is in `lib/rubric/weights.ts`, and `setBandEdge` in `lib/rubric/edit.ts` moves a
  band's B/C edge and shifts its other edges by the same amount. The generator reuses both.
- **The factors the card grades today:**
  - **Gates (Must have or Don't care):** Floodplain, Legal road access, Easement needed ("Driveway on your land" on
    the priorities page), Septic.
  - **Rows (ranked):** Elevation, Best homesite (winter sun, facing, slope), Night sky, Room to build, Trails and
    public land, Town and hospital (the ER and groceries, each with its own band), Garden ground.
- **What the design calls a factor but the card doesn't have yet:**
  - Hospital sits inside Town and hospital until step 10 splits it out. Its band (`erMin`) is already separate, so
    question 6 sets it today.
  - **Driveway:** the router measures the driveway, but no card row grades it. A Driveway row comes in step 6, fed by
    question 10's answer then (§9 Q5).
  - **Winter sun** is part of Best homesite, which grades a letter and had no number for a limit ("Best homesite …
    has no number to set a limit on"). This step gives it one: at least 3 h of December sun at the best site (§9 Q3).
  - Climate, Long view, Privacy, Bike to a long trail, Airport, Internet, HOA, the creek, Acreage and the budgets
    arrive in steps 9–10.
- **Profiles:** each profile's documents live in IndexedDB through the prefs module (`ps.rubrics`, `ps.parcels`…).
  The boot creates "Profile 1" on a first visit (`lib/client/profiles.ts`). "Add a profile" in the picker asks for a
  name inline.
- **The e2e** opens pages with `ps.debug` set, on a fresh profile each test. The onboarding must not get in their
  way (§6.1).

## 1. The screens

The order is fixed. One screen per question, apart from 14, which is two:

| Screen | Shown to |
| --- | --- |
| Name: "What should we call this profile?" | A new profile only |
| Questions 1–13 | Everyone |
| 14a: "Which of these would make you walk away from an otherwise perfect place?" | Everyone |
| 14b: "Which don't matter at all?" | Everyone |
| Result: your priorities and Try it | Everyone |

The scenes are as written in the design doc's table. The choices are its choices, in its order. Every screen has
**Back**, **Skip** and a progress line ("4 of 14").

- **A first answer moves on by itself,** after a short beat that shows the pick.
- **Back and Next** (owner, 10/18): a screen that already holds an answer (from Back, or resuming) opens with its pick
  highlighted and Next in Skip's place. Another pick only changes it; the same pick again, or Next, moves on. This
  holds on every screen: on the chip screens and question 13, Next saves what's on the screen.
- **Some screens need Continue** the first time: question 7 (two rows, once both are answered), question 13 (acres
  plus two optional numbers) and the two halves of 14 (chips).
- **Question 2:** "Out with a camera" adds its follow-up on the same screen: "A town's glow on one horizon: shrug, or
  spoils it?"
- **"Either is fine"** appears where the design lists "Either" (1, 5 and 12). The other screens' choices already
  include an indifferent one ("Inside by the fire", "Not trail people", "Neither", "Nothing").

## 2. The generator

`rubricFromAnswers(answers) → { rubric, points, why, later, mustNote }` is pure and lives in `lib/rubric/interview/`.
It runs in Node and in the browser, and it never sees a parcel.

1. **Answers become importance points,** 0–3 per factor, from the table in §3.
   - A factor that several screens touch takes its **highest** answer (§9 Q1): Town and hospital takes the more
     important of question 5 (groceries) and question 6 (the ER), and Night sky of questions 2 and 8.
   - A factor whose screens were all skipped, or that no screen asks about (Room to build), keeps its **default
     points**: Elevation, Best homesite, Room to build, Trails, Town and hospital 2; Night sky and Garden 1. These
     follow the design's default tiers (Should 2, Could 1).
   - A walk-away chip on a row gives that row at least 1 point, so its minimum always has a ranked card beside it
     (as in the editor).
2. **Points become tiers.** The rows are ordered by points, highest first. Ties go to the design's default order:
   Elevation, Best homesite, Room to build, Trails, Town and hospital, Night sky, Garden.
   - **Should:** every row with 2 or more points, kept to 3–6 (§9 Q2). With fewer than 3, it takes the next best
     rows that have any points; with more than 6, the seventh drops to Could.
   - **Could:** the other rows with 1 or more points.
   - **Won't:** rows with 0 points, and rows picked as "doesn't matter" in 14b.
3. **Rank becomes weight:** `weights: { mode: "rankSum" }`, the editor's own rule. First place counts n, the next
   n − 1, and so on; Could counts ×0.75; the total is 100.
4. **Each answer marks its factor's B/C edge** (the edge of "acceptable to you"), through `setBandEdge`. The other
   edges shift by the same step, so the band keeps its spacing. A factor its answers don't place keeps today's band.
5. **Musts:**
   - The four dealbreaker gates stay Musts unless 14b marks them "doesn't matter".
   - Each walk-away chip in 14a becomes a Must, with its threshold where it has one (§3, question 14).
   - **`mustNote`:** true when 14a has more than five chips picked (§9 Q6). The result screen then says "That will
     rule out most land."
6. **`why`:** each card's reason, quoting the person, never a question number: "You'd want an ER within 30 minutes" (the why column in §3). The card's sheet on the priorities page shows it.
7. **`later`:** the answers about factors the app doesn't measure yet, in words (§5).

**Skip everything,** and the generator returns the starting list unchanged, explicit weights and all (§9 Q8).
Nobody loses the list they had by skipping.

## 3. The answer table (every choice of every question)

Each row reads: the choice → the points it gives a factor → the B/C edge it sets (with the band that results, A / B /
C / D) → what's stored for a later factor. "—" means nothing. Today's bands, for comparison:

| Band | A | B | C | D |
| --- | --- | --- | --- | --- |
| Elevation (ft, at least) | 3,000 | 2,500 | 2,000 | 1,500 |
| Night sky (mag/arcsec², at least) | 21.5 | 21.2 | 20.9 | 20.5 |
| Trailhead drive (min, at most) | 10 | 20 | 35 | 50 |
| ER drive (min, at most) | 20 | 30 | 45 | 60 |
| Groceries drive (min, at most) | 10 | 20 | 30 | 45 |
| Garden ground (ac, at least) | 0.5 | 0.25 | 0.1 | 0 |

Open public land within 1 mi earns Trails a B.

**The why column** is what a card's sheet says about why the card is where it is, in the person's own terms, never a
question number (owner, 10/18). A card two answers touch (Town and hospital: questions 5 and 6; Night sky: 2 and 8)
shows both, the one that set its place first. A card no answer placed reads "On the starting list."; one the person
moved or changed on the priorities page reads "You moved this here.". The examples in quotes with "(the number
entered)" or "(the range picked)" show the person's own value.

### Question 1: "Which year sounds better…"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Cool and snowy | Elevation 3 | Elevation B at 3,000 ft (3,500 / 3,000 / 2,500 / 2,000) | Climate (cool and snowy) | "You'd like cool summer days and snowy winters" |
| In between | Elevation 2 | Today's (B at 2,500 ft) | Climate (in between) | "You'd like a climate in between" |
| Warm and mild | Elevation 0 → Don't care | — | Climate (warm and mild) | "You'd like hot summers and snow that rarely sticks" |
| Either | Elevation 1 | Today's | — | "You said either climate is fine" |

"Warm and mild" puts Elevation in Don't care, since the card has no "lower is better", and Climate (warm and mild)
goes on the quiet list (§9 Q13).

### Question 2: "It's a clear January night. Where are you?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Out with a camera, then "shrug" at a town's glow | Night sky 3 | Today's (B at 21.2) | — | "You'd be out with a camera on a clear January night" |
| Out with a camera, then "spoils it" | Night sky 3 | Night sky B at 21.5 (21.8 / 21.5 / 21.2 / 20.8) | — | "You'd be out with a camera, and a town's glow would spoil it" |
| Out for a minute to look | Night sky 1 | Night sky B at 20.9 (21.2 / 20.9 / 20.6 / 20.2) | — | "You'd step out for a minute to look at the stars" |
| Inside by the fire | Night sky 0 | — | — | "You'd rather be inside by the fire" |

The glow answer folds into the sky's band, since the card grades the zenith and a town's dome brightens it. With the
follow-up skipped, "Out with a camera" reads as "shrug".

### Question 3: "December morning: sun across the breakfast table, or a long view down the valley?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Sun | Best homesite 3 | — (a letter, no band) | — | "You'd rather have sun at breakfast than a long view" |
| View | Best homesite 1 | — | Long view (over winter sun) | "You'd rather have a long view than sun at breakfast" |
| Both | Best homesite 2 | — | Long view (as much as winter sun) | "You want both sun at breakfast and a long view" |
| Neither | Best homesite 1 | — | — | "You said neither morning sun nor a long view matters much" |

"Neither" still gives Best homesite 1, because the row also grades the site's slope and facing.

### Question 4: "Saturday morning. What's the plan?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Walk out the door into the woods | Trails 3 | Trailhead B at 15 min (5 / 15 / 30 / 45); public land within ¼ mi for a B | — | "You'd like to walk out the door into the woods" |
| Bike from home to a long trail | Trails 2 | Today's (B at 20 min) | Bike to a long trail | "You'd like to bike from home to a long trail" |
| Drive 20 min to the best trail | Trails 2 | Today's (B at 20 min) | — | "You'd drive 20 minutes to the best trail" |
| Not trail people | Trails 0 | — | — | "You said you're not trail people" |

"Walk out the door" puts the edge at 15 min rather than 10. A 10-minute edge would shift the A edge to 0 min, which
no parcel can reach. The same holds for question 5's "small and close".

### Question 5: "Groceries: a small market 10 minutes away, or a big store 40 minutes away once a week?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Small and close | Town and hospital 2 | Groceries B at 15 min (5 / 15 / 25 / 40) | — | "You'd rather have a small market 10 minutes away" |
| Big and far | Town and hospital 1 | Groceries B at 40 min (30 / 40 / 50 / 65) | — | "You'd rather drive 40 minutes to a big store once a week" |
| Either | Town and hospital 0 | Groceries B at 40 min | — | "You said either store is fine" |

### Question 6: "Someone gets hurt on a Sunday afternoon. What's the longest drive to the ER you'd be comfortable with?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| 15 min | Town and hospital 3 | ER B at 15 min (5 / 15 / 30 / 45) | — | "You'd want an ER within 15 minutes" |
| 30 min | Town and hospital 2 | Today's (B at 30 min) | — | "You'd want an ER within 30 minutes" |
| 45 min | Town and hospital 1 | ER B at 45 min (35 / 45 / 60 / 75) | — | "You'd want an ER within 45 minutes" |
| An hour or more | Town and hospital 0 | ER B at 60 min (50 / 60 / 75 / 90) | — | "You're fine with an hour or more to the ER" |

It asks for a comfort limit, never why. (Reworded 10/18 from "How far to the ER would feel too far?", whose last choice, "An hour is fine", answered a different question; the edges are unchanged.)

### Question 7: "Work and travel." Two single-choice rows on one screen (owner, 10/18)

"How often will you fly?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Rarely or never | — | — | — | "You rarely or never fly" |
| A few times a year | — | — | Airport (a few times a year) | "You fly a few times a year" |
| Monthly or more | — | — | Airport (monthly or more) | "You fly monthly or more" |

"Do you need internet for video calls from home?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Yes | — | — | Internet for video calls | "You need internet for video calls from home" |
| Not really | — | — | — | "You don't need internet for video calls" |

Continue appears once both rows are answered. (Until 10/18 this was one pick-any question, "Work and travel: what
applies?", with "Neither".)

### Question 8: "Neighbors: wave from the porch, see their lights at night, or never know they're there?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Wave | — | — | Privacy (close enough to wave) | "You'd like neighbors close enough to wave to" |
| See lights | — | — | Privacy (lights at night are fine) | "You don't mind seeing the neighbors' lights at night" |
| Never know | Night sky at least 1 | — | Privacy (never know they're there) | "You'd rather never know the neighbors are there" |

### Question 9: "It's August. What's on your table from your own ground?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Nothing | Garden 0 | — | — | "You don't plan to grow food" |
| Herbs and tomatoes | Garden 1 | Garden B at 0.1 ac (0.35 / 0.1 / 0 / 0) | — | "You'd grow herbs and tomatoes" |
| A real kitchen garden | Garden 2 | Today's (B at 0.25 ac) | Frost-free season | "You'd like a real kitchen garden" |
| Most of our produce, maybe chickens | Garden 3 | Garden B at 1 ac (1.25 / 1 / 0.85 / 0.75) | Frost-free season | "You'd grow most of your produce, maybe keep chickens" |

### Question 10: "Snowy morning. Which driveway would you happily live with?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Short and steep: 4WD some days | — | — | Driveway (steep is fine, up to 20%) | "You'd live with a short, steep driveway and 4WD some days" |
| Long and gentle | — | — | Driveway (gentle, up to 15%) | "You'd rather have a long, gentle driveway" |
| Whatever it takes, we'll build it | — | — | Driveway (we'll build it, up to 12%) | "You'd build whatever driveway it takes" |

The router's 20% limit is part of the screen (engine config), not the rubric, so this answer doesn't change it (§9 Q5).

### Question 11: "An HOA that stops neighbors clear-cutting, or no rules at all?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Rules that protect views are welcome | — | — | HOA (welcome) | "You'd welcome rules that protect the views" |
| Light rules are OK | — | — | HOA (light rules) | "You said light rules are OK" |
| No HOA or restrictions | — | — | No HOA (a must) | "You want no HOA and no restrictions" |

### Question 12: "A creek on the land: the best feature, or something to keep away from the house?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Best feature | — | — | A creek (the best feature) | "You said a creek would be the best feature" |
| Nice, not near the house | — | — | A creek (not near the house) | "You'd like a creek, just not near the house" |
| Rather not | — | — | No creek | "You'd rather not have a creek" |
| Either | — | — | — | — |

The Floodplain gate already keeps the house and the driveway out of the flood zone.

### Question 13: "How much land, and how much money?"

| Choice | Points | Edge it sets | Later | Why (the card's sheet) |
| --- | --- | --- | --- | --- |
| Under 5 · 5–20 · 20–50 · 50+ acres | — | — | Acreage (the range) | "You're looking for 20–50 acres (the range picked)" |
| The most you'd spend to start camping on it (optional) | — | — | Camp budget | "You'd spend up to $40,000 to start camping on it (the number entered)" |
| …and to be ready to build (optional) | — | — | Build budget | "You'd spend up to $250,000 to be ready to build (the number entered)" |

### Question 14a: "Which of these would make you walk away from an otherwise perfect place?"

| Chip | Becomes | Why (the card's sheet) |
| --- | --- | --- |
| Flood zone | Floodplain: Must have (already on the starting list; its why becomes the chip's) | "You'd walk away from a flood zone" |
| An HOA | Later: No HOA (a must) | "You'd walk away from an HOA" |
| Shared driveway | Later: No shared driveway (a must) (§9 Q4) | "You'd walk away from a shared driveway" |
| Below ___ ft | An Elevation limit at the number entered. It starts 500 ft under question 1's edge (2,500 ft after "Cool and snowy", else 2,000) | "You'd walk away from land below 2,500 ft (the number entered)" |
| Over ___ min to an ER | A Town and hospital limit (ER) at the number entered. It starts one step past question 6's answer (15 → 30, 30 → 45, 45 → 60, an hour → 75) | "You'd walk away from an ER more than 30 minutes away (the number entered)" |
| Neighbor's house in view | Later: Privacy, no house in view (a must) | "You'd walk away from a neighbor's house in view" |
| No winter sun | A Best homesite limit: at least 3 h of December sun at the best site (§9 Q3) | "You'd walk away from a place with no winter sun" |
| Alternative septic only | Septic: Must have (already on the starting list; its why becomes the chip's) | "You'd walk away if only an alternative septic system would work" |
| Over budget | Later: within budget (a must) | "You'd walk away from a place over budget" |

The two numbers use a stepper: 100 ft or 5 min a tap, within the editor's slider ranges.

### Question 14b: "Which don't matter at all?"

The same chips, without the ones picked in 14a:

| Chip | Becomes | Why (the card's sheet) |
| --- | --- | --- |
| Flood zone | Floodplain → Don't care | "You said a flood zone doesn't matter" |
| An HOA | Later: HOA (doesn't matter) | "You said an HOA doesn't matter" |
| Shared driveway | Driveway on your land (the easement gate) → Don't care | "You said a shared driveway doesn't matter" |
| Below ___ ft | Elevation → Don't care (0 points) | "You said elevation doesn't matter" |
| Over ___ min to an ER | ER B at 90 min, the slider's end, so the ER barely counts. It goes to Don't care once Hospital is its own factor (§9 Q12) | "You said the drive to an ER doesn't matter" |
| Neighbor's house in view | Later: Privacy (doesn't matter) | "You said a neighbor's house in view doesn't matter" |
| No winter sun | Best homesite → Don't care (0 points) | "You said winter sun doesn't matter" |
| Alternative septic only | Septic → Don't care | "You said an alternative septic system doesn't matter" |
| Over budget | Later: budgets (don't matter) | "You said the budget doesn't matter" |

Legal road access isn't a chip: it stays a Must have.

## 4. Two worked examples

**Person A** answers: Cool and snowy · camera, spoils it · Sun · Walk out the door · Small and close · 30 min ·
Rarely or never, and Yes (video calls) · Never know · A real kitchen garden · Long and gentle · No HOA · Best feature · 20–50 ac. In 14a they
pick Flood zone, An HOA, Below 2,500 ft and No winter sun.

| Rank | Card | Tier | Points | Weight | Band (B/C edge) |
| --- | --- | --- | --- | --- | --- |
| 1 | Elevation | Really want | 3 | 25.2% | 3,000 ft |
| 2 | Best homesite | Really want | 3 | 21.6% | — |
| 3 | Trails and public land | Really want | 3 | 18.0% | 15 min; public land within ¼ mi |
| 4 | Night sky | Really want | 3 | 14.4% | 21.5 |
| 5 | Room to build | Really want | 2 (default) | 10.8% | 2× |
| 6 | Town and hospital | Really want | 2 | 7.2% | ER 30 min, groceries 15 min |
| 7 | Garden ground | Nice to have | 2 | 2.7% | 0.25 ac |

- **Must have:** the four gates, plus the limits Elevation at least 2,500 ft and Best homesite at least 3 h of
  December sun.
- **Later:** Climate (cool and snowy) · Internet for video calls · Privacy (never know they're there) · Frost-free season · Driveway
  (gentle) · No HOA (a must) · A creek (the best feature) · Acreage (20–50 ac).
- Three walk-away chips, so no "rule out most land" note.

**Person B** answers: Warm and mild · Inside by the fire · View · Drive 20 min · Small and close · 15 min · Neither ·
Wave · Herbs and tomatoes · and skips 10–13. In 14a they pick Flood zone and Over 30 min to an ER. In 14b they pick
Below ___ ft.

| Rank | Card | Tier | Points | Weight | Band (B/C edge) |
| --- | --- | --- | --- | --- | --- |
| 1 | Town and hospital | Really want | 3 | 35.1% | ER 15 min, groceries 15 min |
| 2 | Room to build | Really want | 2 (default) | 28.1% | 2× |
| 3 | Trails and public land | Really want | 2 | 21.1% | 20 min |
| 4 | Best homesite | Nice to have | 1 | 10.5% | — |
| 5 | Garden ground | Nice to have | 1 | 5.3% | 0.1 ac |

- **Don't care:** Elevation, Night sky.
- **Must have:** the four gates, plus the limit ER within 30 min.
- **Later:** Climate (warm and mild) · Long view (over winter sun) · Privacy (close enough to wave).

## 5. Factors that don't exist yet

**Stored raw.** Each profile gets one more document, `ps.interview` (version 1, Zod-validated like the others):
```ts
{
  v: 1,
  state: "new" | "inProgress" | "done" | "notNow",
  at: number,                // the screen to resume on
  answers: InterviewAnswers, // every answer exactly as picked, the later factors' included
  skipped: QuestionId[],
  base: Rubric | null,       // the rubric the generator made, when the interview was finished
  doneAt?: string,
}
```
`InterviewAnswers` holds one field per question, typed by its choices: `climate: "cool" | "between" | "warm" |
"either"`, `er: 15 | 30 | 45 | 60`, `walkAway: { chips, belowFt?, erOverMin? }`, and so on. The rubric's own shape,
the screen schema and the export file don't change. The answers stay out of the export file until step 5, which
imports rubrics by file (§9 Q14).

**Kept, not shown** (owner, 10/18). The answers about factors the app doesn't measure yet ("Climate (cool and snowy)",
"No HOA (a must)", …; the generator's `later` list) are stored with the rest but shown nowhere: the result screen and
the priorities page had them as a quiet list ("Counts once the app measures it: …") until the owner's fix round. They
stay stored so that a later step's one-time arrival notice can say which factor joined and from which answer.

**How a later step adds a factor without overwriting the editor's changes** (the proposal, for steps 9–10). The
profile keeps `base`, the rubric the generator made from its answers. When step 10 adds Climate:

1. It runs the new generator over the same stored answers, giving `next`.
2. Each factor that's new in `next` is inserted into the person's rubric:
   - in `next`'s tier;
   - directly below the card that sits above it in `next` (or at the top of the tier, if that card isn't in the
     person's rubric);
   - with `next`'s bands and any Must from the walk-away chips.
3. Nothing else changes: the cards the person moved, the bands they slid, and the factors they dropped stay as they
   are. Rank-sum recomputes the weights.
4. `base` becomes `next`, and a one-time notice says what joined: "Climate now counts: added to Really want at #2,
   from your answer 'Cool and snowy'. Undo".
5. A profile that never took the interview has no answers, so nothing is added for it. Whether the starting list
   gains the new factor is that step's own numbers decision.

The rule a later step follows: add only, never touch an existing card. The editor's "why" stays true, because a card
that matches `base` quotes the answer that put it there, and any other reads "You moved this here.".

## 6. Onboarding, entry points and the editor

### 6.1 Who starts where
- **A new profile starts with the interview.**
  - On a first visit, the boot creates "Profile 1" as today and marks it `state: "new"`. Any page then opens
    `/interview`, whose first screen is the name (prefilled empty, placeholder "Your name or a nickname"). Skip keeps
    "Profile 1".
  - "Add a profile" in the picker no longer asks for the name inline. It creates the profile and opens `/interview`
    on the name screen.
- **"Not now"** sits on every screen of a new profile's interview, under Skip. It goes to the map with the
  starting list and keeps the draft (`state: "notNow"`). The app doesn't push the interview again; the menu offers it.
- **The e2e:** with `ps.debug` set, a new profile isn't sent to the interview, so today's specs keep working. The
  onboarding specs run without it.
- **The way in** (owner, 10/18): the ☰ menu offers "Answer a few questions (about 4 min)" only while the profile has no
  answers. After that the header of /priorities alone offers it: "Finish your questions (6 of 14)" while it's part
  done, else "Answer the questions again". A second run starts with the previous answers picked, so it reads as
  "redo".
- **Halfway:** every answer is saved as it's picked. Leave, and the interview opens again on the screen you left
  (`at`).

### 6.2 The result screen
- **Headed "What matters to you"**, as the priorities page is (owner, 10/18), **the answer first:**
  - Must have as plain lines ("No flood zone at the house or the driveway", "Elevation: at least 2,500 ft");
  - Really want and Nice to have in rank order, as the priorities page shows them (no weights: they're in the
    rulebook);
  - Don't care in one line;
  - "That will rule out most land." when `mustNote`.

  No quiet list and no line about Try it under the heading (owner, 10/18): Try it keeps its own words.
- **Try it** above it, as on the priorities page (the bottom bar on a phone), on the sample (Mud Creek) or the open
  parcel. Before is the list the profile had (the starting list for a new profile), and now is the result.
- **The buttons:**
  - "Fine-tune in My priorities" (primary) and "Done" (to the map);
  - Back returns to 14b, with its picks and Next.
- **When the list is saved** (§9 Q7):
  - A new profile, or a profile whose list is still the starting list or still its last `base`: saved on reaching
    the result screen.
  - A profile whose list was changed on the priorities page: the result screen asks "Replace the priorities you
    changed?" with "Replace with the new list" and "Keep my changes". Either way the answers are stored.

### 6.3 The priorities page
- **"Reset to my answers"**, next to "Reset to the starting list" and only when the profile has answers. It asks first
  in the same kind of dialog ("Reset to your answers? This undoes the changes you made since."), then sets the list to
  `rubricFromAnswers(answers)` and `base` to the same.
- **The card sheet's "why":**
  - the answer that put it there, in the person's terms, when the card matches `base`: "You'd want an ER within 30 minutes" (§3's why column; never a question number);
  - "You moved this here." when it doesn't;
  - "On the starting list." when there are no answers.

  These two replace step 3's "You changed it" and "From the starting list" (page text, not the report).
- **Best homesite can have a limit** (§9 Q3): dragging it onto Must have makes "Best homesite: at least 3 h of December
  sun", as the 14a chip does, with its slider in hours.

## 7. UX

### 7.1 Phone first (375 px)
- **One question per screen:**
  - the progress line and a thin bar at the top;
  - the scene in large type, one or two short sentences;
  - the choices as full-width buttons at least 56 px tall;
  - Back, Skip and (for a new profile) "Not now" along the bottom, at least 44 px.
- **No scrolling** on any question at 375 × 667, except 14a and 14b's chips, which wrap.
- **Desktop:** the same column, 560 px wide and centred. The result screen puts Try it above the summary, as on
  /priorities.

### 7.2 Scenes, not pictures
**No illustrations in this step** (§9 Q10). The scenes are short sentences, as the design writes them, and the
choices carry the picture ("Out with a camera"). Drawings would need an artist or a new dependency. They can be added
later without moving anything.

### 7.3 Keyboard and screen readers
- Each screen's choices are a radio group: the arrow keys move, and Enter or Space picks and continues.
- The number keys 1–4 pick the matching choice.
- Backspace or Alt+← goes back.
- Chips are checkboxes, followed by Continue.
- On each screen, focus moves to the question, which is announced as "Question 4 of 14: Saturday morning…".

### 7.4 States
- **Loading:** the interview reads `ps.interview` after the profile boot, as other pages do. Nothing is fetched.
- **Try it's sample** loads on the result screen only (step 3's lazy import).
- **Storage refused** (the in-memory profile): the interview still runs. The menu's existing line says nothing will
  be kept.

### 7.5 Words
- Plain, short and second person.
- The result screen's heading is "What matters to you", as the priorities page's.
- The note is "That will rule out most land."

## 8. Numbers and text that may change (the declaration)

- **`expected.json`, the screen schema (v9) and `ENGINE_VERSION`:** no change.
- **No grade changes** for a profile that doesn't take the interview: the starting list is untouched.
- **`config.ts`:**
  - gains `card.interview`: the points and the B/C edge for each choice in §3, so rule 4 holds (the numbers live in
    config, with the snapshot updated);
  - and the default points for skipped screens.
- **Best homesite's limit** (§9 Q3):
  - its row gains a measure (December sun hours at site #1, in hours) and a limit band (`card.editor` gains its
    slider range);
  - the priorities page's "has no number to set a limit on" message goes, which amends §9.50;
  - no card's grade or verdict changes unless a profile has that limit.
  - no change to the rubric's stored shape: the limit is a `threshold` on a Must card, like every other limit, and
    Best homesite's ranked card keeps no band.
- **Text:**
  - new: the interview's screens, the result screen, "Answer a few questions (about 4 min)", "Finish your questions
    (6 of 14)", "Answer the questions again", "Reset to my answers", and the why strings in §3's why column;
  - changed on the priorities page: the why lines "You changed it" → "You moved this here." and "From the starting
    list" → "On the starting list.";
  - nothing in the report or the card changes.
- **Storage:** one new per-profile document, `ps.interview`. No change to the rubric's shape, the profile record or
  the export file.

## 9. The owner's answers (Zach, 2026-10-18)

1. **Points per factor:** the highest answer.
2. **The Should cut (Really want):** rows with 2 or more points, kept to 3–6.
3. **"No winter sun":** yes, a Best homesite limit of at least 3 h of December sun. Dragging Best homesite onto Must
   have makes the same limit. §9.50 is amended.
4. **Shared driveway:** the quiet list, as proposed ("No shared driveway (a must)").
5. **The Driveway row:** added in step 6 (screening results), since the router already measures it; question 10's
   answer feeds it then. Noted in `PLAN.md`'s step 6. Until then, question 10's answer is on the quiet list.
6. **The note:** count only the 14a chips, and show it above five.
7. **A changed list:** ask "Replace the priorities you changed?" with "Replace with the new list" and "Keep my changes".
8. **Skip everything:** keep the starting list unchanged.
9. **The first visit:** the interview first, with "Not now" on every screen.
10. **Illustrations:** none in this step.
11. **15-minute edges** for "Walk out the door" and "Small and close": yes.
12. **"Over ___ min to an ER" in 14b:** the ER's edge moves to 90 min until Hospital is its own factor.
13. **"Warm and mild":** Elevation goes to Don't care, and Climate (warm and mild) goes on the quiet list.
14. **The export file:** the answers stay out until step 5.

## 10. Stop conditions (push what's there, say why, wait)

- A change would alter `expected.json`, a card's grade or verdict on a default rubric, or report text.
- The answer table needs a number this plan doesn't give, or a choice turns out to need a product decision.
- The same CI failure survives three attempts.
- The plan turns out wrong (for example, onboarding can't skip the e2e without a product-visible switch).

## 11. The PRs, into `step/4-interview`

| PR | What | Checks |
| --- | --- | --- |
| 1 | **The generator (pure):** `lib/rubric/interview/` (the questions and choices, the answer types and their Zod schema, `rubricFromAnswers`, the later list); `card.interview` in config; Best homesite's sun limit (§9.50 amended); §9.53 | Unit tests, one for every choice in §3, plus §4's two people; the config snapshot |
| 2 | **The interview (`/interview`):** the screens, Back and Skip, progress, auto-advance, the keyboard, saving and resuming through `ps.interview`, the result screen with Try it | e2e: a full run, a skip, Back, resume after a reload, the keyboard |
| 3 | **Onboarding and the editor:** a new profile starts with the interview; the picker's Add; the menu and /priorities entries; "Reset to my answers"; the why lines; the quiet list; §9.54 | e2e: the first visit, Add a profile, "Not now", Reset to my answers |
| 4 | **The phone, the screenshots and the docs:** the 375 px pass, `pnpm screenshots` for the interview, the fresh-eyes review (CLAUDE.md), REQUIREMENTS §3c, the hand-back | Full CI on the step branch's head |

## 12. Test plan outline

**Unit (CI):**
- every choice of every question gives the points, the edge and the later entry in §3;
- §4's two people give §4's rubrics, weights included;
- skipping everything gives the starting list;
- ties follow the default order;
- the Should cut holds at 3–6;
- a walk-away chip on a 0-point row lifts it to Nice to have;
- Best homesite's limit passes, fails or is unknown by December sun hours;
- `mustNote` turns on above five chips;
- the stored answers' schema accepts every choice and rejects a stranger.

**e2e (CI):**
- desktop: name, the 14 screens, the result; Back keeps the pick; Skip; question 2's follow-up; the chips' steppers;
- resuming after a reload; Back and Next (another pick waits, the same pick moves on);
- the menu's "Answer a few questions (about 4 min)" only without answers; the priorities page's "Finish your
  questions (6 of 14)" and "Answer the questions again";
- the why lines quote the answers, and no sheet shows a question number;
- Reset to my answers;
- a changed list asks "Replace the priorities you changed?" before it's replaced;
- phone: one question per screen, 44 px targets, nothing scrolls sideways.

**Screenshots (the hand-back), each at 1280 and 375 px:**
- the name screen;
- question 2 with its follow-up;
- question 6;
- question 13;
- 14a's chips with a stepper;
- 14b's chips;
- question 7's two rows; 14b back from the result, with Next;
- the result screen with Try it;
- the priorities page with "Reset to my answers" and the why line;
- the "Replace the priorities you changed?" question.

**Manual, on the preview (about 20 minutes, desktop then phone):**
1. Open the preview in a private window → the name screen. Type a name → question 1, "1 of 14".
2. Answer as §4's Person A, using Back once and Skip once → the result, "What matters to you", shows their
   priorities and Try it on the sample (Mud Creek).
3. "Fine-tune in My priorities" → the columns match the result; a card's sheet says "You'd want an ER within 30 minutes"; Must have holds "Best homesite: at least 3 h of December sun".
4. Drag a card, then "Reset to my answers" → the interview's list is back.
5. Open **Mud Creek**, **Macks Mountain**, **Ferney Creek** and **Roan Mountain** → each grades by the new list;
   nothing asks for a re-screen.
6. Close the tab on question 7, open the app again → it resumes on question 7.
7. Add a second profile → its name screen, then "Not now" → the map, with the starting list on all four fixtures.
8. Back in the first profile, drag a card, then on the priorities page "Answer the questions again" → finish it → the result asks "Replace the
   priorities you changed?"; "Keep my changes" keeps the dragged card.
9. Phone: steps 1, 2 and 6 at 375 px. One question per screen, the choices easy to tap, nothing scrolls sideways.

## 13. Decisions to record in `phase-0.md` §9 (in the PRs)

- **§9.50, amended:** Best homesite can have a limit, at least N h of December sun at the best site (Q3).
- **§9.53 The interview's generator:**
  - points by the highest answer (Q1);
  - the Should cut;
  - default points for skipped screens;
  - the edges in §3;
  - the walk-away and doesn't-matter mappings;
  - the later list and `ps.interview`;
  - the add-only rule for later factors (§5).
- **§9.54 Onboarding:**
  - a new profile starts with the interview (name first), with "Not now";
  - a changed list is replaced only after "Replace the priorities you changed?";
  - "Reset to my answers".
