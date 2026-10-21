# Step 10b: Favorites as a comparison grid

Zach's brief (10/21), pre-approved with this plan's recommended answers (§9). The list hides each factor's grade behind
a click, so parcels can't be compared side by side, and no screen shows price per acre. This step:
- turns the desktop Favorites list into a grid, one column per factor in your rubric's order;
- adds $/ac everywhere a price shows;
- gives each phone card a strip of factor letters;
- fixes the panel's duplicate factor rows.

No engine, `expected.json` or schema change. Grades don't change; the duplicate rows' fix is a declared display change
(§5).

## 1. The grid (desktop, Favorites)

**Columns, left to right:**
1. **Name**, with its star and, with two or more members, "Added by Zach" under it (`addedByLine`, as the detail panel
   says it).
2. **Your grade and verdict** ("B Contender"), then the other members' grades as today (`<Grades>`).
3. **Price**, **Acres**, **$/ac** (§3) and **Cost to build** (step 10).
4. **One column per factor, in your rubric's order**, Don't care hidden:
   - Musts first, as marks: ✓ pass, ! check first, ✗ fail, ? unknown. That's the gates you keep, Within budget as a Must,
     and each limit merged with its row (§4).
   - Then Really want, then Nice to have, as letters.
5. **State** and **Updated**, off by default (§1.4).

**Headers:**
- Short labels (§8), e.g. "Elev", "Sun", "Sky", "Drive".
- On hover or focus, the full name ("Elevation at the build site") as the header's title.
- A cell's title is the row's detail ("3,543 ft at site #1") or the Must's reason.

**Sort by any column:**
- A click on a header sorts by it; a second click reverses it. The header carries `aria-sort` and a ▲/▼.
- The Sort menu stays, listing the same sorts (the phone's only way, §2).
- Factor sorts put the best first: A before F, ✓ before ! before ✗. Unknowns ("?", "–") are always last, either
  direction.
- New sort keys: `name`, `pricePerAcre`, `state`, and `factor:<key>`.

**Best in column:**
- A subtle mark (a small ● after the value, and "best in this column" in its title and `aria-label`) on:
  - the best value in each factor column;
  - the lowest $/ac;
  - the lowest Cost to build.
- Compare's rule: marked only where at least two parcels have a value and they differ; ties for best all marked.
- Factor columns compare by the letter's points or the mark's order. $/ac and Cost to build compare only priced
  parcels, by the range's middle for Cost to build ("+ land" ones aren't compared).

**Layout:**
- **Sticky:** the header row, and the Name column, stay in place. The grid's own box scrolls both ways
  (`overflow: auto`, a max height of the window less the page's head). The table switches to
  `border-collapse: separate`, as Compare's does, so sticky cells keep their borders.
- **Compact rows:** about 36 px (`padding: 4px 8px`, one line; the name clamps to one line with its full text in the
  title).
  - The drag handle shows only under My order, as today.
  - A click on the row opens the detail panel, as today; the tick, ⋯ and star keep their own clicks.

**Columns ▾:**
- A small menu beside Sort, with a checkbox per column: Price, Acres, $/ac, Cost to build, each factor, State,
  Updated. It also has "All factors" and "No factors".
- Factor columns are on by default; State and Updated are off.
- Name, the grade and the ⋯ menu are always shown.
- Price, $/ac and Cost to build still hide when no row has one (polish #12), whatever the picker says.
- Remembered per profile in `ps.library` (already per profile), as `columns: { hidden: string[] }` with a default, so
  a stored view without it reads as the default.

## 2. The phone (375 px)

The card list stays. Each card gains:
- **A one-line strip of factor letters,** in rubric order with short labels.
  - Musts come first, as their marks: "Flood ✓ · Septic ! · Elev ✓B · Sun A · Sky B · Trails C · Drive B".
  - It's one line, clipped with an ellipsis. The whole strip is in its `aria-label`, and a tap on the card opens the
    detail as today.
- **$/ac under the price** in the facts line: "$185k · $6,310/ac · 29.3 ac · build $330–595k".
- **Factor sorts** in the Sort menu, after the existing ones ("Sort by Night sky"). Best first, unknowns last.

## 3. Price per acre

- **$/ac** is the asking price ÷ the listing's acres when the listing gives them, else the boundary's acres. Rounded to
  $10: "$6,310/ac". No price, no $/ac ("–").
- **When the two acreages differ by more than 5%** (the boundary's and the listing's), the cell is marked with a dotted
  underline and a "≠" after it. Its title gives both figures: "$6,500/ac on 45.6 listed ac; $7,640/ac on 38.8 boundary ac".
  The 5% is new (`card.perAcreDiffPct`, rule 4); the panel's existing "The listing says…" note stays at its 10%.
- **Where it shows:**
  - the grid's column;
  - the phone card;
  - Recent's rows (with the verdict word beside the letter: "B Contender");
  - the panel's listing line ("$185k · $6,310/ac · 52 ac listed");
  - Compare (a "$/ac" row after Asking price, lowest marked best);
  - One page's head ("29.31 ac · Asking $185,000 as of Oct 11, 2026 · $6,310/ac · Graded …").
- `lib/report/perAcre.ts` (pure) computes it, with both figures and the mark, for every surface.

## 4. One row per factor (the duplicate rows)

**Why it happens:** a factor can hold a Must and a ranked card at once (`lib/rubric/types.ts`, MustCard: "at least
3,000 ft" gates, "higher is better" ranks). The interview's walk-away chips make exactly that pair: "Elevation below
___ ft" adds a limit on Elevation and lifts its ranked card to at least Nice to have, and "ER over ___ min" does the
same for Town and hospital. That's what Zach's real profile shows.

The card then draws the factor twice:
- `mustLines` (`lib/report/cardLines.ts`) adds a Must line for every limit ("at least 1,800 ft · 2,855 ft", ✓);
- `rankedRows` lists every ranked card, the same factor again with its letter (B).

The print page (`lib/print/report.ts` `cardTiers`) does the same.

**The fix (recommended):** one row per factor.
- **Where:** a factor with a limit shows once, in **Must have**, with the Must's mark and its letter together:
  "✓ B · 2,855 ft, at least 1,800".
- **What:** its detail is the row's short value, then the limit's words. Its panel is the row's, as before.
- **The grade:** its weight and letter still count where the rubric ranks it. Only where it's drawn changes; Really want
  and Nice to have skip it.
- **The grid** does the same: one column, in the Musts group, "✓B".
- **Print:** the same, in `cardTiers`.
- **A declared display change (rule 7):** the limit's line gains the letter, and the ranked tier loses the repeated row.
  Grades, verdicts and every reason line are unchanged. The before/after strings go in the PR.

## 5. Text and numbers

- New strings only (§8), plus the duplicate rows' declared change (§4).
- No number changes, and no grade or verdict changes.
- The one new cutoff is `card.perAcreDiffPct` (5), with the config guard's snapshot updated (rule 4).
- `expected.json` and the goldens don't change. The five-golden leaf diff covers the report text.

## 6. UX

- **The main task:** open Your list on a desktop and read the grid across. A header click sorts; the ● marks say who's
  best at what; a row click opens its detail. On a phone, read the strips and sort by a factor in the Sort menu.
- **What you see first:** your grade and verdict, price and $/ac, then the factors in your order. Detail is in the
  titles and the row's panel.
- **States:**
  - **Not screened yet, or screened under earlier rules:** "–" in each factor column, with the row's existing
    "Not screened" or "Grade again" in the grade column.
  - **Grading:** the grade column's existing state.
  - **No favorites:** the existing empty state.
  - **One favorite:** no best marks (nothing to compare).
- **Plain labels:** the short headers are words, not codes (§8), each with its full name in the title. The Columns
  picker uses the full names.
- **The phone at 375 px:** the strip is 13 px on one line. The card's 44 px targets are unchanged. The Sort menu holds
  the factor sorts.
- **Wide screens (1920):** the grid fits without scrolling sideways for a typical list (11 factor columns at about
  56 px each). At 1280 it scrolls sideways with the Name column held.
- **Contrast and consistency:**
  - letters use the card's letter chips at a small size;
  - Must marks use the card's ✓ ! ✗ ? with their words in the title;
  - the ● mark isn't colour alone: it has its title and `aria-label`.

## 7. Settings and storage

- `ps.library` (per profile, synced as today) gains `columns.hidden`, with a default.
- The new sort keys join the stored view's refine (`readLibraryView`). An older stored view reads as before.
- No other storage changes.

## 8. New strings

- **The grid's short headers:**
  - Flood · Access · Own drive · Septic · Budget;
  - Elev · Sun · Sky · Room · Drive · Trails · Town · Garden;
  - $/ac · Cost to build · Your grade.
- **The grid's controls and marks:** Columns · All factors · No factors · best in this column · Added by {name}.
- **$/ac:** {$}/ac · "{$}/ac on {n} listed ac; {$}/ac on {n} boundary ac" · ≠
- **The phone:** Sort by {factor} (the full names).
- **The merged Must row:** "{mark} {letter} · {short}, {limit}", e.g. "✓ B · 2,855 ft, at least 1,800".

## 9. Questions, each answered with the recommendation (pre-approved; flagged in the hand-back)

1. **Where a factor with a limit shows:** once, in Must have, with its letter (recommended: the limit is the stronger
   statement, and the grid puts Musts first).
2. **Short labels:** the §8 list (recommended); Best homesite is "Sun", as the brief's example has it.
3. **Best in column:** Compare's rule, marks only where values differ, all ties for best marked (recommended).
4. **Cost to build's best:** priced parcels only, by the range's middle (recommended; "+ land" isn't comparable).
5. **$/ac rounding:** to $10 (recommended; the brief's examples).
6. **The 5% mark** is its own cutoff, and the listing note stays at 10% (recommended: the brief sets 5% for this mark,
   and the note is existing text).
7. **The Columns picker:** a checkbox per column, plus All / No factors (recommended).
8. **Sticky inside the grid's own scroll box** (recommended; the page around it doesn't scroll sideways).
9. **The phone strip clips at one line** with an ellipsis; the full strip is in its label (recommended).
10. **Recent's verdict word:** the card's own ("B Contender"), as Favorites shows it (recommended).
11. **Screenshots with Zach's three parcels:** they live in Zach's synced space, which this session can't read. They need
    an export file (Settings → Your data → Export) placed at `tmp/zach-parcels.json` (never committed), or their parcel
    IDs to screen locally. Until then the shots use the four fixtures. Asked in the report.

## 10. Stop conditions

- A change that would alter `expected.json`, a grade, a verdict, or report text beyond §4's declared change.
- The sticky grid can't hold its header and Name column alongside dnd-kit's row transforms in My order. Fallback to
  propose: sticky header only under My order.
- The same CI failure survives 3 attempts.

## 11. Test plan outline

- **Unit:**
  - `perAcre`: listing vs boundary, the 5% mark, rounding, no price;
  - factor cells: rubric order, Musts first, a limit merged with its row, Don't care hidden, unknowns;
  - sorting: each new key, unknowns last both ways;
  - best marks: differ, ties, one row;
  - the stored view with and without `columns`;
  - the card's merged row and its print twin.
- **e2e:**
  - the grid's columns and a header sort on the fixtures;
  - Columns ▾ hides and shows a factor, remembered after a reload;
  - the phone strip and a factor sort;
  - $/ac on Recent, Compare and One page;
  - a profile with a walk-away limit shows Elevation once.
- **The manual test plan** in the hand-back: desktop 1280 and 1920, then the phone. It uses Mud Creek ($185k), Macks,
  Ferney and Roan, with Zach's three parcels once provided.

## 12. PRs

| PR | What | Tests |
|---|---|---|
| 0 | This plan | – |
| 1 | **The data:** `perAcre`, factor cells and short labels, the merged Must row (panel and print), $/ac on Recent (with the verdict word), the panel's listing line, Compare and One page | unit; the print and Compare tests |
| 2 | **The desktop grid:** columns, header sorts, best marks, sticky header and Name, compact rows, Columns ▾ remembered | unit (sorts, view); e2e grid |
| 3 | **The phone strip and factor sorts, $/ac on cards;** screenshots at 1280, 1920 and 375; the fresh-eyes review; docs (REQUIREMENTS, phase-0 §9.64, PLAN row 10b, polish.md) | e2e phone; screenshots |

Then the hand-back from `step/10b-compare-grid` to main.

## 13. Decision

phase-0.md §9.64, written in PR 3.
