# Step 15: How it could pay

The owner pre-approved the brief (2026-10-27) and this plan's recommended answers (§12).

**Sources:**
- PLAN.md row 15;
- `docs/design/workflow-review.md`, "What the land can do, and what it can pay" (Panel 2 and the rules for both
  panels);
- Zach's brief of 2026-10-27.

**Decision:** §9.75, written in the last PR.

**Mission mode:**
- The work runs on `step/15-how-it-could-pays`, the branch name as the brief gives it. Each row of §11 is one PR into
  it, which I merge when CI is green on its head.
- The step ends with the hand-back to main, which Zach merges.
- **Proportionate verification** (CLAUDE.md, 10/25): one confirming screenshot per screen the brief names, unit tests
  for the arithmetic, and no extra recordings. Nothing here touches the engine, so `pnpm expected` isn't run.

## 0. What's there today (found while planning)

- **The place is ready.** `components/Parcel/Uses.tsx` ends with a comment marking where Panel 2 goes: under What
  limits you, above the not-advice line.
- **The not-advice line today** is Panel 1's: "Not advice: check with the county, a surveyor or a land-use attorney
  before acting." (`USE_WORDS.notAdvice`). It covers the whole Uses segment.
- **The uses are pure modules** (`lib/uses/*`). Each returns `{ answer, reason, decides: Fact[] }`, and `UseRow`
  draws one with its chip and What decides it in place. Panel 2 follows the same pattern in its own folder.
- **What Panel 2 can read from a screen:**
  - acres;
  - `cover.forestPct` (NLCD 2021);
  - `streams.perennialFt` and `intermittentFt` (NHD);
  - `protected[]` (PAD-US: name, manager, access, adjoins, distFt), where the Blue Ridge Parkway appears by name when
    it's within PAD-US's search;
  - `county` (FIPS, name, state);
  - Divide's lots (`divideOf`, which also reads the listing's acres and a survey);
  - Hunt's and Camp now's answers.
- **What it can't read:**
  - **No viewshed from public land.** Long view measures the view from the site, not the parcel as seen from the
    Parkway. The signal is "within a mile of the Parkway or public land", and a land trust decides the viewshed.
  - **No tree size or species.** Canopy is in the session only. So timber has no number without a cruise (the
    brief's rule anyway).
  - **No assessed value.** Parcel records keep no assessment, and Tennessee's only as a TPAD link (§5.2).
- **The fixtures:**

  | Fixture | County | Acres | Forest | Perennial stream |
  | --- | --- | --- | --- | --- |
  | Mud Creek | Grayson VA | 30.1 | 95% | none |
  | Macks Mountain | Floyd VA | 292 | 93% | none |
  | Ferney Creek | Floyd VA | 43.9 | 36% | none |
  | Roan (Hwy 143) | Carter TN | 13.3 | 67% | none |

  - None has a perennial stream inside, so the stream signal is unit-tested on synthetic inputs.
  - No North Carolina fixture exists, so NC's options are unit-tested and named in the hand-back's manual plan as "any
    parcel in Ashe".
- **The split scenario** (`lib/split/pieceRows.ts`) is one row per piece-level figure, and its header names step 15's
  break-even as the next row (step 14 §5.3).
- **Settings → Costs** (`lib/config/costs.ts`) has `easement.legal` (attorney, survey and recording for an access
  easement) but no division survey, deed or road.

## 0b. What PR 1's research found (2026-10-27)

The figures are in `lib/config/programs.ts`, `lib/config/countyPay.ts` and Settings → Costs' Splitting land group.

- **Everything is "to confirm" for now.**
  - The session's network policy denied every official host: law.lis.virginia.gov, tax.virginia.gov, ncleg.gov,
    ncdor.gov, comptroller.tn.gov, the county sites and the programs' own sites.
  - So each figure was read in a search excerpt of the page named, not on the page itself. Each fact keeps its kind
    (statute, agency, program, county), so confirming it is a one-word change once someone opens the page.
- **Virginia's credit:** 40% of the appraised value. You can use at most $20,000 a year (the Appropriation Act, from
  2024); unused credit carries forward 10 years. It can be sold, with a 5% fee, and Virginia issues at most $75M a year.
- **North Carolina has a credit again:** 25% of the appraised value, up to $250,000 for an individual ($500,000 for a
  business), carried forward 5 years. Reinstated in 2024 for donations from 2025, and extended through 2031 by the 2026
  farm bill (Zach confirmed, #376, 10/27).
  - Land under an easement also keeps present-use value without the production test.
  - So NC shows its credit, not "No state credit", with a slider like Virginia's that shows the cap (#376, 10/27).
- **Tennessee has no state credit.** Land under a perpetual easement can be Greenbelt open space (3 ac or more).
- **Federal:** 50% of AGI (100% for qualified farmers), carried forward 15 years.
- **Easement size (changes §2.1):**
  - No land trust publishes a minimum. The Blue Ridge Land Conservancy says there is none, and that a small parcel
    needs more conservation value.
  - VOF's guideline, quoted in the press, says easements under 50 ac must add to a designated conservation resource.
  - So the 20 ac minimum is dropped. Under 50 ac, forest alone isn't enough: Eligible needs public land, the Parkway
    or water.
- **Use-value in the Virginia counties:**
  - Floyd's program takes farm land only, not forest.
  - Grayson and Patrick have none.
  - Carroll takes forest, with hardwood at $230–405/ac by class.
  - So Mud Creek (Grayson) is Not eligible for use-value, with the reason.
- **Use-value in NC and TN:**
  - NC: statewide, with the Mountains' forest values at $55–395/ac (2026 manual).
  - TN: statewide, with use values unpublished, so no figure.
  - Johnson County's tax rate wasn't found from an official source, so it's null.
- **Forest carbon:** the Family Forest Carbon Program enrolls western VA, western NC and Tennessee: 30 ac of
  naturally regenerating forest, on a 20-year contract. Nothing else open to small tracts was confirmed.
- **Hunting lease:**
  - $3–10/ac/yr, from Maryland Extension (2021), the nearest current figure. VA, NC and TN surveys are from 1985 and
    1998.
  - The lease minimum (50 ac) stays ours.
- **Timber:**
  - A logger typically needs 10–20 ac (USDA Forest Service), so 10 ac is now that source's figure, not ours.
  - VDOF says get a cruise from a consulting forester.
- **Split costs:** survey and plat $1,200–6,000, deed and recording $500–1,500, road $0 (typed when needed). All are
  national figures, to confirm.
- **Campgrounds:**
  - Grayson needs a special use permit (§3-11), and Ashe a Planning Board permit for an RV park.
  - None was found for the other eight counties.
  - Virginia's health department permits 3 or more campsites (12VAC5-450).

## 1. The rules

- **Never in the grade.**
  - Panel 2 reads the result, the card's facts, Panel 1's answers and the parcel. Nothing reads Panel 2 back.
  - No grade, points, verdict or engine change. On every fixture the card oracle (`lib/rubric/default.test.ts`) holds
    byte for byte, and `expected.json` doesn't change.
- **Every option reads Eligible, Maybe: [why] or Not eligible: [why].** A tap opens its detail in place, as What
  decides it does. The detail holds:
  - **The signals:** the facts that decided it, each with its source and date where data drives it.
  - **The number:** a range or a formula, with its source, its as-of date and a confidence word. Or, where only an
    appraisal, a cruise or a quote can say, the words "Needs an appraisal", "Needs a timber cruise" or "The program
    quotes it", in place of a figure.
  - **What it costs you:** in use.
  - **Ask:** the one question for the professional that turns the range into a number.
- **Ranges, not promises.** A dollar figure never appears without its source, date and confidence word.
- **Config with dates.** Program rates, caps, minimum acres, county participation and tax rates live in
  `lib/config/programs.ts` and `lib/config/counties.ts`. Each is a `Fact` with its source, the date checked and a
  confidence word, as step 14's county rules are.
  - PR 1 researches them from official sources: statutes, the state agencies, the counties and the programs
    themselves.
  - Anything not read from an official source is marked "to confirm".
  - No number is guessed: a missing rate is null, and the panel says it isn't published.
- **The ten counties only.** Outside them, the county-specific rows say "Not covered here yet". State-level facts
  (the credit, the state's use-value law) still show where the state is VA, NC or TN.
- **Not advice.** The segment's one line gains a second sentence for Panel 2 (§12 Q1).

## 2. The options

The order is as the brief lists them.

### 2.1 Conservation easement
- **Signals:**
  - **Divisible lots given up:** Divide's count (N ≥ 2), since an easement's value is mostly the division and
    building rights it retires.
  - **Public land:** adjoining open public land (PAD-US), or the Blue Ridge Parkway or public land within 1 mi.
  - **Water:** a perennial stream inside (NHD), or an intermittent one.
  - **Forest:** at least `pay.easementForestPct` (50%) forest (NLCD).
  - **Size:** at least `pay.easementMinAc` acres. The working figure is 20 ac, from land trusts' published minimums,
    researched in PR 1 and marked "to confirm" unless a Virginia, NC or TN trust publishes one.
- **Answer:**
  - **Eligible:** large enough, with lots to give up and at least one conservation value (public land, water or
    forest).
  - **Maybe:** large enough with one signal, or lots to give up and no conservation value ("a land trust looks for a
    conservation value: …"). Also when a measurement didn't load.
  - **Not eligible:** under the size, with no signal.
- **The number, by state:**
  - **Virginia:** the Land Preservation Tax Credit, as a formula and a slider, "If the easement's appraised value were
    $X → a state credit of $Y". Y is the credit rate (40% today, from Va. Code §58.1-512) of X, with the caps as
    Virginia's official source states them: the yearly use limit, the carry-forward years, the transfer rule and any
    per-donation cap.
    - The slider runs from $0 to the asking price, or to $1,000,000 without one, in $5,000 steps.
    - It starts at $0, so no figure shows before you move it. That's the brief's "no figure without the slider".
    - The confidence word is "set by law" for the rate. The value itself "needs an appraisal".
  - **North Carolina and Tennessee:** whatever incentives exist today, from official sources. Where there's no state
    credit, it says "No state credit". (NC repealed its conservation credit in 2014, and Tennessee has no income tax;
    PR 1 confirms both, and any later program.)
  - **Federal, in one line:** the §170(h) income-tax deduction for a donated easement. Its AGI limits and
    carry-forward come from the IRS source PR 1 reads.
- **What it costs you:** permanent, a lower resale value, and limited building rights.
- **Ask a land trust:** "Would you hold an easement here, and what would its appraised value be?"

### 2.2 Use-value taxation (VA land use, NC Present-Use Value, TN Greenbelt)
- **Per county, from `counties.ts`'s new `useValue` facts:**
  - whether the county takes part (VA counties opt in; NC's and Tennessee's programs are statewide, but PR 1 still
    reads each county's page);
  - the minimum acres for forest (VA 20 by statute, NC 20 in production, TN 15; each county's own as PR 1 reads it);
  - the real-estate tax rate;
  - the use-value per forest acre, where the county or state publishes it.
- **Eligible:** the county takes part and the parcel's forest acres (acres × forest share) reach the minimum.
  - **Maybe:** acres reach the minimum but the forest share doesn't (open land may qualify as agricultural instead), or
    the county isn't covered (the state's minimum is shown), or a requirement the app can't see. Those are NC's four
    years of ownership and its forest management plan, and Virginia's and Tennessee's plan or application rules, each
    as PR 1 reads them.
  - **Not eligible:** too few acres, or the county doesn't take part.
- **The number:** today's tax beside the use-value tax, where both rates are published.
  - Today's tax is the assessed value × the rate. The assessed value is the Listing's new "Assessed value", if typed
    (§5.2). Otherwise it's the asking price, labelled "on the asking price; the county's assessment may differ".
    Without either, it asks for the assessment.
  - The use-value tax is the forest acres × the use-value per acre × the rate, plus the rest at its assessed share.
  - Where a county publishes no per-acre value, it shows the rate and the minimum, says "The county's use values
    aren't published", and gives no figure.
  - The confidence word is "from county rates", with the rate's date.
- **What it costs you:** rollback taxes if the use changes. Each state's rollback years and interest come from its
  statute, read in PR 1.
- **Ask the county's commissioner of the revenue or assessor:** "What would this parcel's use value be in the forest
  class?"

### 2.3 Forest carbon
- **Programs open to small family forests,** each a config entry with its states, its minimum forest acres and its
  source. They're researched in PR 1 from the programs' own pages: the Family Forest Carbon Program and any other
  open in VA, NC or TN with a small-forest minimum.
- **Eligible:** at least one program covers the state and the forest acres reach its minimum. The detail names each
  program and its minimum.
  - **Maybe:** forest acres within 20% of a minimum, or the cover didn't load.
  - **Not eligible:** no program covers the state, or the forest is too small for all of them.
- **The number:** none. "The program quotes the payment."
- **What it costs you:** a practice contract, often with limits on harvesting.
- **Ask the program:** "What would you pay for this forest, and what would the contract limit?"

### 2.4 Hunting lease
- **Applied only where Hunt makes sense:**
  - Eligible when step 14's Hunt is Yes and the parcel is at least `pay.leaseMinAc` acres (working figure 50, from the
    extension sources PR 1 reads; "to confirm" otherwise).
  - Maybe when Hunt is Maybe (its reason is said), or the acres fall between Hunt's 10 and the lease minimum.
  - Not eligible when Hunt's forest or acres rule it out ("Too small to lease").
- **The number:** a regional range in $/acre/year, from state extension services (Virginia Tech, NC State, UT
  Extension) or a state wildlife agency, dated.
  - The confidence word is always "low".
  - It shows the parcel's acres × the range, rounded to $50, with "a rough range, not a quote".
- **What it costs you:** your own use in season; liability and a written lease.
- **Ask a lease broker or the state's extension forester:** "What are leases on land like this getting near here?"

### 2.5 Selective timber
- **Eligibility:**
  - Eligible when the forest acres are at least `pay.timberMinAc` (working figure 10, from extension guidance on the
    smallest tract a logger will bid on; "to confirm").
  - Maybe when under that but some forest.
  - Not eligible when there's almost no forest (under 2 ac).
- **The number:** none without a cruise.
  - Listing/Details gains "Timber cruise value" ($) and its date (§5.1). When typed, the panel shows "A cruise valued
    the timber at $X (date)" with the confidence word "from your cruise".
  - Otherwise: "Needs a timber cruise: ask a consulting forester for a cruise."
- **What it costs you:** the woods look different for some years.
- **Ask a consulting forester:** "What would a cruise put this stand at, and when would a selective cut make sense?"

### 2.6 Split and resell
- **Eligibility is Divide's:**
  - Eligible when Divide says Yes;
  - Maybe when Divide says Maybe, with its reason;
  - Not eligible when Divide says No, with its reason;
  - "Not covered here yet" outside the ten counties.
- **The number:** on a split scenario (step 14 §5), the break-even price per acre for the piece sold (§4).
  - The panel's row shows each scenario's result, "Split 1: sell the North piece at $X/ac or more to break even". A
    tap goes to the scenario.
  - With no scenario: "Try a split to see its break-even". It's the same action as Divide's.
- **What it costs you:** less land and a neighbour. Covenants or an easement can protect your side.
- **Ask a surveyor and a land-use attorney:** "What will surveying, the plat and the deed cost for this split, and
  will the county approve it?"

### 2.7 Camp sites
- **Eligibility:**
  - Maybe when Camp now is Yes or Maybe: "The county's rules decide".
  - Not eligible when Camp now is No, with its reason.
  - Never Eligible, since the app doesn't know the county's campground rules.
- **The number:** none. A link to the county's rules: the ordinance from `counties.ts`, plus a campground fact where
  PR 1 finds one in the ordinance (for example a special-use permit). Outside the ten counties: "Not covered here
  yet".
- **What it costs you:** visitors on the land.
- **Ask the county's zoning office:** "What permits would paying campers here need?"

## 3. Data and config

- **`lib/config/programs.ts` (new), every value a `Fact` with its source, date checked and confidence word:**
  - **Virginia's Land Preservation Tax Credit:** the rate, the yearly use limit, the carry-forward years,
    transferability and any per-donation cap.
  - **NC and TN:** each a list of incentives, or "No state credit", with its source.
  - **Federal:** the §170(h) line's facts.
  - **Use-value by state:** the program's name, the forest minimum, the rollback years and interest, the ownership or
    plan requirements.
  - **Carbon programs:** the name, the states covered, the minimum acres, the URL.
  - **Hunting lease:** $/ac/yr low and high per state or region, its source and its date.
  - **The working thresholds:** `easementMinAc`, `easementForestPct`, `leaseMinAc`, `timberMinAc`. Each is labelled
    "ours" where no official source sets it.
- **`lib/config/counties.ts`, each county gains:**
  - `useValue`: takes part; the forest minimum; the use-value per forest acre (null if not published); the source.
  - `taxRate`: real-estate tax per $100 of assessed value, with its tax year.
  - `campground`: a fact, where PR 1 finds one; null otherwise.
- **Confidence words:**
  - On a fact's source, as step 14's: "from the ordinance" (or "from the statute", "from the program"), "from the
    county's summary", "to confirm".
  - On a dollar figure, the estimate's own word: "set by law", "from county rates", "low", "from your cruise".
- **Settings → Costs gains a "Splitting land" group:**
  - `split.survey`: a division survey and plat;
  - `split.legal`: the deed, attorney and recording;
  - `split.road`: a road for the sold piece. It defaults to $0–$0: a piece on a public road needs none, and you type
    one when it does.
  - Each is a sourced low–high range in `costs.ts`, like the others, and is a declared new default (rule 4).

## 4. The break-even arithmetic (`lib/pay/breakEven.ts`)

Pure, and unit-tested on round numbers.

**Inputs, per scenario:**

| Input | Symbol | Default |
| --- | --- | --- |
| The purchase price | P | The asking price; editable; asked for when there isn't one |
| The sold piece's share of the land | s | Its acres ÷ the whole; editable, since land isn't uniform |
| Years held before it sells | n | 2 |
| Interest rate | r | 7% a year |
| Survey, legal and road | C | The midpoints of Settings → Costs' three ranges; each editable |

**What it shows:**
- **Carried price:** P × (1 + r)ⁿ, compounded yearly. Interest stands for the loan's or the money's cost while you
  hold the land.
- **Break-even for the sold piece:** s × P × (1 + r)ⁿ + C, and per acre: ÷ the sold piece's acres.
- **The keep side's effective price:** the carried price + C − the sale.
  - At the break-even, that's (1 − s) × P × (1 + r)ⁿ.
  - An optional "If it sold for $/ac" shows the keep side's price at another sale price (§12 Q4).
- **The keep side per acre:** the effective price ÷ the kept acres.
- **Not counted, and said under the figures:** the agent's commission, closing costs, property tax while held and
  capital-gains tax.
- **Its confidence word is "your inputs".** The defaults are the app's: they're labelled "assumed", and each is
  editable.

**Storage:** the scenario's inputs are optional and default to the defaults above.
- `Scenario.breakEven: { price?, sharePct?, years?, ratePct?, survey?, legal?, road?, soldSide?, soldAt? }`.
- `.default({})` in the parcel schema, so the store stays `v: 2` (the `addedBy` precedent). It syncs with the
  scenario.
- `soldSide` defaults to the smaller piece.

## 5. New fields (optional; synced with the parcel)

### 5.1 Timber cruise value
- Listing/Details gains "Timber cruise value" ($) and "Cruise date", beside Deed restrictions.
- `timberCruise: { value: number; date: string } | null`, `.default(null)`.

### 5.2 Assessed value
- Listing/Details gains "Assessed value" ($), typed from the county's record, and its tax year.
- `assessed: { value: number; year: number | null } | null`, `.default(null)`.
- Tennessee's TPAD link, where the parcel has one, sits beside the field.
- §12 Q3: why a typed field, not a fetched one.

### 5.3 The scenario's break-even inputs
§4's `breakEven`.

None of these reaches the engine or the card.

## 6. Where it goes

- **Uses segment:** What you can do here → What limits you → **How it could pay** → Keep this, sell that (when there's
  a split) → the not-advice line (§12 Q2).
- **Panel 2's rows:**
  - Conservation easement;
  - Use-value tax;
  - Forest carbon;
  - Hunting lease;
  - Selective timber;
  - Split and resell;
  - Camp sites.

  Each row is the name, the chip (Eligible / Maybe / Not eligible) and the reason on one line. A tap opens the detail
  in place (§1).
- **The Virginia slider** sits inside the easement's detail, under the formula.
- **The scenario view:** each piece's rows gain "Break-even, if this piece sells". Under the two pieces comes a
  "Break-even" block with §4's inputs, folded open on the sold piece. The phone stacks the inputs.
- **The Full report:** a "How it could pay" section after "What you can do here".
  - Each option has its answer, reason, number line, cost and question.
  - The Virginia credit is the formula only: "40% of the easement's appraised value, up to …". An export has no slider.
  - The section ends with the not-advice line.
- **One page:** one line, only when an option is Eligible: "Could pay: use-value tax, forest carbon (eligible; see the
  full report)". It goes after the Divide line, and the one-Letter-page check (`report.spec.ts:65`) is watched.
- **Never on the card,** in the grade's tooltip, or in Compare's grid.

## 7. UX

**The main flow:**
- **See how it could pay** (1 tap from a graded parcel): Uses, then scroll past What limits you. Each option shows its
  answer and reason, and a tap opens the detail.
- **Try the Virginia credit** (2 taps and a drag): Conservation easement › drag "If the easement's appraised value
  were…" › the credit shows as you drag.
- **See a split's break-even** (from a scenario): open Keep this, sell that. The break-even shows under the pieces,
  with its inputs.

**What's seen first:**
- The answer: seven rows of name, chip and reason.
- The detail on demand: the range and its source, the cost, and the Ask question, in that order.

**States:**
- **Not graded:** Uses already says "Grade this parcel to see what you can do here", and Panel 2 doesn't show.
- **Grading:** the seven rows as skeletons, by name, as Panel 1's are.
- **A measurement didn't load** (cover, streams, protected, county): the option says what's missing, and its answer
  falls back to Maybe with that reason.
- **County not covered:**
  - Use-value: the state's rule shows, with "Not covered here yet" for the county's rates.
  - Camp sites: "Not covered here yet".
  - Split and resell: Divide's own reason.
- **No asking price:**
  - The slider runs to $1,000,000.
  - The break-even asks "Type the purchase price".
  - Use-value asks for the assessment.
- **No scenario yet:** Split and resell says "Try a split to see its break-even".
- **A rate not published:** "Not published by the county", with no figure.

**Plain words:**
- "Use-value tax" (not "preferential assessment"), "break-even", "your share of the land".
- "Interest while you hold it" (not "carrying cost"), and "the woods look different for some years".
- The programs keep their own names: "Land Preservation Tax Credit", "Present-Use Value", "Greenbelt".

**At 375 px:**
- The rows as Panel 1's: the chips at a fixed width so the names line up, and 44 px tap targets.
- The slider's thumb is 44 px, with its value above it in large type. The credit sits under the slider, not beside it.
- The break-even inputs stack one per row, with numeric keyboards (`inputMode="decimal"`).

**Contrast and consistency:**
- **The chips reuse the gate colours:** Eligible as pass, Maybe as warn, Not eligible as fail. The word is always
  there, so colour is never the only signal.
- **Sources** are `tiny muted` lines, as on Climate and What decides it.
- **The confidence word** sits beside its figure in the same muted style ("low", "set by law").

## 8. Strings (declared; rule 7, additive)

All new. No existing card, answer or report text changes, except the not-advice line's added second sentence.

- **Panel:**
  - "How it could pay", "Eligible", "Maybe", "Not eligible";
  - "What it costs you", "Ask", "The number";
  - "Not covered here yet" (Panel 1's, reused).
- **The not-advice line:** a second sentence after the existing one: "For how it could pay, talk to a tax advisor, a
  land trust or a forester before acting."
- **The options:**
  - "Conservation easement";
  - "Use-value tax";
  - "Forest carbon";
  - "Hunting lease";
  - "Selective timber";
  - "Split and resell";
  - "Camp sites".
- **Numbers:**
  - "If the easement's appraised value were {x}", "a state credit of {y}", "Needs an appraisal",
    "Needs a timber cruise: ask a consulting forester for a cruise";
  - "The program quotes the payment", "a rough range, not a quote", "Not published by the county";
  - "No state credit", "on the asking price; the county's assessment may differ", "Type the assessed value";
  - "A cruise valued the timber at {x} ({date})".
- **Confidence words:** "set by law", "from county rates", "low", "from your cruise", "your inputs", "assumed", "to
  confirm".
- **Costs:**
  - "Permanent: a lower resale value and limited building rights";
  - "Rollback taxes if the use changes";
  - "A practice contract, often with limits on harvesting";
  - "Your own use in season; liability and a lease";
  - "The woods look different for some years";
  - "Less land and a neighbour; covenants or an easement can protect your side";
  - "Visitors on the land".
- **Ask:** the seven questions in §2, as written there.
- **Break-even:**
  - "Break-even", "Break-even, if this piece sells", "Purchase price", "Its share of the land";
  - "Years held", "Interest while you hold it", "Survey", "Legal", "Road";
  - "If it sold for", "Your piece effectively costs", "Type the purchase price", "Try a split to see its
    break-even";
  - "Not counted: the agent's commission, closing costs, property tax while held and capital-gains tax".
- **Listing:** "Timber cruise value", "Cruise date", "Assessed value", "Tax year".
- **Settings → Costs:** "Splitting land", "Division survey and plat", "Deed, attorney and recording", "Road to the sold
  piece".
- **Report:**
  - "How it could pay" (Full's heading);
  - "Could pay: {options} (eligible; see the full report)" (One page);
  - "40% of the easement's appraised value, up to …" (the export's formula, with the caps as configured).
- **Each option's reason templates** are listed in `lib/pay/words.ts` and in the PR that adds them.

**Numbers (new config):**
- `pay.easementMinAc` 20 and `pay.easementForestPct` 50;
- `pay.leaseMinAc` 50, `pay.timberMinAc` 10 and `pay.timberNoneAc` 2;
- `pay.nearPublicMi` 1;
- the break-even defaults: 2 years, 7%.

Each is labelled "ours" unless PR 1 finds an official figure. No existing threshold, weight or cost changes.

## 9. Stop conditions
- Any fixture's grade, points or verdict changing, or `expected.json` changing at all.
- A program's or a county's terms forbidding the use, or its rates readable only behind a login.
- Most of a state's facts unreadable from official sources. They ship "to confirm", and it's said.
- The same CI failure surviving 3 attempts.
- A product question this plan doesn't answer.
- The plan turning out wrong. For example, Virginia's credit can't be stated as a formula, or the counties publish no
  use values at all, which makes 2.2's number a non-feature.

## 10. Test plan outline

**Unit (the brief's four, and the rest):**
- **Eligibility, as a table of synthetic inputs per option:**
  - each Eligible, Maybe and Not eligible path, including each "didn't load" fallback and a county not covered;
  - the stream and Parkway signals (no fixture has them).
- **The credit formula:**
  - the rate times the value;
  - the caps applied as configured;
  - $0 at the slider's start;
  - the slider's top at the asking price, or $1M without one.
- **The use-value comparison:**
  - today's tax vs the use-value tax on round numbers;
  - the asking-price fallback labelled;
  - a county with no published values gives no figure;
  - a county not taking part.
- **The break-even:**
  - s × P × (1 + r)ⁿ + C on round numbers (P = $100,000, s = 0.4, r = 5%, n = 2, C = $10,000 gives $54,100);
  - per acre;
  - the keep side at the break-even and at another sale price;
  - n = 0;
  - no price.
- **Config:**
  - every `programs.ts` and county fact has a source, a date and a confidence word;
  - a number without an official source is "to confirm".
- **Rules:**
  - the card oracle unchanged on every fixture;
  - `lib/screen` untouched (`expected-guard` in CI);
  - Panel 2's module doesn't import from the card's grading.

**e2e:**
- **Mud Creek's Uses:** How it could pay shows seven rows and the two-sentence not-advice line. Conservation easement's
  detail opens and the slider moves the credit.
- **Split Mud Creek:** the scenario shows the break-even, and changing the interest rate changes it.
- **One page** shows the Could pay line when an option is Eligible, and still fits one page. Full has the section.

**Screenshots, 1280 and 375:**
- Mud Creek's panel;
- the Virginia credit slider, moved;
- a split's break-even on Mud Creek;
- Roan (Tennessee) Uses with How it could pay.

**The fresh-eyes review,** then the hand-back with its 15–30 minute manual test plan.

## 11. PRs, into `step/15-how-it-could-pays`

| # | PR | What |
| --- | --- | --- |
| 0 | The plan | This file |
| 1 | The research | `lib/config/programs.ts`, the counties' `useValue`, `taxRate` and `campground`, Settings → Costs' three split rates with sources; §2's working figures confirmed or marked "to confirm"; config tests |
| 2 | The options | `lib/pay/*`: the seven options' eligibility, numbers, costs and questions; the credit formula; the use-value comparison; the break-even; unit tests |
| 3 | The panel | Panel 2 in Uses, the detail in place, the Virginia slider, the not-advice sentence; Listing's Timber cruise value and Assessed value; e2e |
| 4 | The break-even in the scenario | §4's inputs and figures in Keep this, sell that, the piece row, and storage; Settings → Costs' Splitting land group; e2e |
| 5 | The report | Full's section and One page's line; the page-fit check |
| 6 | Screenshots, the fresh-eyes review and docs | §9.75, PLAN row 15, REQUIREMENTS, polish.md's leftovers; then the hand-back to main |

## 12. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **The not-advice line:** one line for the segment, as now, with Panel 2's words as a second sentence after Panel
   1's. The text is additive, and the comment in `Uses.tsx` already says one line covers both panels.
2. **The order in Uses:** How it could pay comes after What limits you and before the split scenarios, so that it sits
   directly under What limits you, as the brief says. The scenarios stay last before the not-advice line because they
   belong to Divide and are long. Split and resell's row links down to them.
3. **The assessment is typed, not fetched.** The state parcel services' value fields differ by state and county, and
   aren't stored today. A typed field with the asking price as a labelled fallback works everywhere. If PR 1 finds an
   assessment field that VA's, NC's and TN's services all return, it prefills the field, and the hand-back says so.
4. **"If it sold for":** included, optional. "The keep side's resulting effective price" says little at the
   break-even alone, where it's just the kept share. With a sale price you see what your piece costs if the other
   piece sells high or low.
5. **The defaults:**
   - 2 years held and 7% interest, both labelled "assumed" and editable;
   - survey and legal at the midpoints of their ranges;
   - a road at $0 unless typed.
6. **The agent's commission isn't an input.** The brief's list is kept, and the commission is named under the figures
   as not counted. Add it as a field later if wanted.
7. **The working thresholds** (20 ac for an easement, 50 ac for a lease, 10 ac for timber) are ours where no official
   source sets them. Each is labelled, and PR 1 replaces it with a published figure where one exists.
8. **No NC fixture:** NC's paths are unit-tested, and the manual test plan uses any parcel in Ashe. No new recording,
   per proportionate verification.

## 13. Decision

§9.75, in PR 6.
