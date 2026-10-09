/** Writes docs/studies/grade-distribution.md from the screened parcels (grade study, STAGE=report). */
import { mkdirSync, writeFileSync } from "node:fs";
import type { StudyParcel } from "./grade-study.test";
import { dist, fmt, GRADES, gutPicks, tables } from "./gradeStudyReport";
import { whatIfs, type WhatIf } from "./gradeStudySim";
import { ENGINE_VERSION } from "@/lib/screen/engine";

export const DOC = "docs/studies/grade-distribution.md";

const pct = (k: number, n: number) => `${Math.round((100 * k) / n)}%`;
const shares = (ws: WhatIf[], pick: (w: WhatIf) => string) =>
  GRADES.map((g) => pct(ws.filter((w) => pick(w) === g).length, ws.length)).join(" | ");
const maps = (ll: [number, number]) =>
  `[satellite](https://www.google.com/maps/@${ll[0]},${ll[1]},700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=${ll[0]}&mlon=${ll[1]}#map=16/${ll[0]}/${ll[1]})`;

/**
 * The same parcels under an earlier engine and this one (owner, after A3b): grade shares, whether the top
 * compressed (the A and B share), and each parcel's #1 before and after.
 */
function compareRuns(prev: { parcels: StudyParcel[]; engine: number }, now: StudyParcel[]): string {
  const pairs = now
    .map((p) => ({ p, q: prev.parcels.find((x) => x.key === p.key) }))
    .filter(
      (x): x is { p: StudyParcel; q: StudyParcel } =>
        !!x.q && !!x.p.result.sites?.length && !!x.q.result.sites?.length,
    );
  const firsts = (side: "p" | "q") => pairs.map((x) => x[side].result.sites![0]!);
  const every = (side: "p" | "q") => pairs.flatMap((x) => x[side].result.sites!);
  const row = (label: string, sites: { grade: string }[]) =>
    `| ${label} | ${sites.length} | ${GRADES.map((g) => pct(sites.filter((s) => s.grade === g).length, sites.length)).join(" | ")} | ${pct(sites.filter((s) => s.grade === "A" || s.grade === "B").length, sites.length)} |`;
  const e0 = prev.engine || "earlier",
    e1 = ENGINE_VERSION;
  const b = firsts("q"),
    a = firsts("p");
  const scoreMedian = (xs: { score: number }[]) => fmt(dist(xs.map((x) => x.score))!.median, 0);
  const moved = pairs.filter((x) => x.q.result.sites![0]!.grade !== x.p.result.sites![0]!.grade);
  return `## 10. Since the last run: engine ${e0} → engine ${e1}

The same ${pairs.length} parcels, screened again with today's rules. Same selection (the seeded draws find the same
parcels), so every difference is the engine's.

| Grades | n | ${GRADES.join(" | ")} | A or B |
|---|---|---|---|---|---|---|---|
${row(`#1 site, engine ${e0}`, b)}
${row(`#1 site, engine ${e1}`, a)}
${row(`Every ranked site, engine ${e0}`, every("q"))}
${row(`Every ranked site, engine ${e1}`, every("p"))}

Median #1 score: ${scoreMedian(b)} → ${scoreMedian(a)}. ${moved.length} of ${pairs.length} parcels' #1 changed grade.

| Parcel | #1 at engine ${e0} | #1 at engine ${e1} |
|---|---|---|
${pairs.map(({ p, q }) => `| ${p.parcelId} (${p.county}) | ${q.result.sites![0]!.grade} ${q.result.sites![0]!.score} | ${p.result.sites![0]!.grade} ${p.result.sites![0]!.score} |`).join("\n")}

`;
}

export function writeReport(
  parcels: StudyParcel[],
  log: string,
  prev?: { parcels: StudyParcel[]; engine: number },
): void {
  const t = tables(parcels);
  const ws = whatIfs(parcels);
  const gut = gutPicks(parcels);
  const best = parcels.filter((p) => p.result.sites?.length).map((p) => p.result.sites![0]!);
  const n = best.length;
  const septic40 = best.filter((s) => s.c.septic === 40).length;
  const found25 = best.filter((s) => s.c.foundation === 25).length;
  const reasonCount = (rule: string, re: RegExp) =>
    parcels.filter((p) =>
      p.reasons?.some(
        (r) => r.rule.startsWith(rule) && r.depth === 1 && re.test(r.reason) && (r.value ?? 0) >= 1,
      ),
    ).length;
  const sitePct = dist(ws.map((w) => w.sitePct))!;
  const unitPct = dist(ws.map((w) => w.unitPct))!;
  const score = dist(best.map((s) => s.score))!;
  const quality = dist(best.map((s) => s.quality))!;
  const cost = dist(best.map((s) => s.costIdx))!;
  const domeFull = parcels.filter((p) => p.result.sky?.dome && p.result.sky.dome.w >= 3).length;
  const mag = dist(parcels.map((p) => p.result.sky?.mag ?? null))!;
  const sorted = [...best.map((s) => s.score)].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.round((sorted.length - 1) * f)]!;
  const date = "2026-10-09";

  const md = `# Grade distribution study (report only)

Batch A, before A3 (owner, ${date}). How Parcel Screen's site grades spread over real parcels in the six counties
the household is looking in, which factors carry the ranking, which barely vary, and what could replace them.
**No scoring code changes here**; A3 decides what to change.

- **Data:** ${parcels.length} parcels, screened ${date} with today's rules (engine ${ENGINE_VERSION}) and default settings.
- **Reproduce:** \`pnpm study:grades\` (live; picks and screens into \`tmp/study/\`), then \`STAGE=report pnpm study:grades\`
  (offline; writes this file). Tool: \`test/tools/grade-study.test.ts\`, \`gradeStudyReport.ts\`, \`gradeStudySim.ts\`,
  \`gradeStudyDoc.ts\`. The numbers in the prose are computed by the same run.
- **Your History:** not included. It lives in your browser's IndexedDB, which I can't read. Export it
  (History › Export) to \`tmp/study/history.json\` and I'll add those parcels to the next run.

## 1. The gut-grade sheet (not used)

These ${gut.length} were picked for blind gut grades: evenly through the tool's ranking, listed by parcel ID. **The
owner skipped the comparison (2026-10-09), so §8 has no grades**; the sheet stays so it can be done later without
re-picking. Grades are left blank on purpose.

| # | County | Parcel | Acres | Point | Maps | Gut grade | Note |
|---|---|---|---|---|---|---|---|
${gut.map((p, i) => `| G${i + 1} | ${p.county} | ${p.fixture ? `${p.parcelId} (fixture)` : p.parcelId} | ${fmt(p.acres)} | ${p.point[0]}, ${p.point[1]} | ${maps(p.point)} |  |  |`).join("\n")}

<details>
<summary><b>The study</b></summary>

## 2. Findings in brief

1. **No #1 site grades A; ${pct(best.filter((s) => s.grade === "B").length, n)} are B and ${pct(best.filter((s) => s.grade === "C").length, n)} C.** Scores
   run ${fmt(score.min, 0)}–${fmt(score.max, 0)} (median ${fmt(score.median, 0)}). Quality alone would make ${pct(best.filter((s) => s.quality >= 80).length, n)} of
   them A (median ${fmt(quality.median, 0)}), but cost alone is an F for ${pct(best.filter((s) => s.costIdx > 65).length, n)} (median cost index ${fmt(cost.median, 0)}
   of 100). With the 70/30 split an A needs quality ≈ 86+ **and** cost ≤ 35: none of these parcels gets there.
2. **The septic term is near-constant:** ${septic40} of ${n} #1 sites take the full 40 points ("Very limited"). NRCS's
   reasons: "Seepage, bottom layer" on ${reasonCount("ENG - Septic", /Seepage/)}, the map unit's slope (8 to >15%) on
   ${reasonCount("ENG - Septic", /^Slope/)}, shallow bedrock (100–180 cm) on ${reasonCount("ENG - Septic", /Bedrock/)}. **Foundation** is at its
   25-point maximum on ${found25}, almost all for the map unit's slope.
3. **Slope is counted three times:** in quality (slope), in cost (pad), and again inside both NRCS ratings through the
   map unit's representative slope (median ${fmt(unitPct.median, 0)}%, while the lidar bench itself is ${fmt(sitePct.median, 0)}%). Slope and pad correlate
   at −0.62 by construction, slope and foundation at −0.52.
4. **Using the site's own slope in the NRCS ratings changes little** (what-if A): the benches are ${fmt(sitePct.min, 0)}–${fmt(sitePct.max, 0)}% —
   still inside NRCS's 8–15% ramp — and seepage or bedrock keeps most septic ratings at the maximum.
5. **The sky term barely discriminates:** every parcel is ${fmt(mag.min, 2)}–${fmt(mag.max, 2)} mag/arcsec², and ${domeFull} of ${parcels.length} take the
   full 25-point light-dome penalty because its "full" threshold (w = 3) is met by almost any town 30–60 km south.
   Sky scores land at ${fmt(dist(best.map((s) => s.q.sky))!.min, 0)}–${fmt(dist(best.map((s) => s.q.sky))!.max, 0)}: C or D for everyone.
6. **Frost and slope sit near their ceilings** (${pct(best.filter((s) => s.q.frost >= 80).length, n)} and ${pct(best.filter((s) => s.q.slope >= 80).length, n)} A-band), as expected: the site search
   already prefers benches above the valley floor. They act as penalties for the exceptions, which is their job.
7. **Fixing the soil inputs lifts grades but doesn't spread them** (what-if B: ${shares(ws, (w) => w.b.grade).replace(/ \| /g, " / ")} for A/B/C/D/F). The
   spread is limited by quality's narrow range. Any grade letter that's meant to separate these parcels needs
   cutoffs calibrated on them against real judgment (§7); the gut-grade comparison that would do it was skipped (§8).

## 3. The parcels and how each was chosen

Six counties: Floyd, Carroll and Grayson (VA); Ashe, Watauga and Alleghany (NC). In each, points were drawn with a
fixed seed (the county's FIPS code) inside the Census TIGER county outline; the county parcel record under each
point was kept if it was 5–100 acres and not already kept, until four were kept. Plus the three fixtures (screened
from their recordings, so they equal \`expected.json\`; Macks Mountain falls in Floyd County by the Census outline).
Parcel IDs only; no owner names.

${t.parcels}

<details><summary>Every draw, kept or not (the selection log)</summary>

\`\`\`
${log.trim()}
\`\`\`

</details>

## 4. Grades

${t.grades}

Score percentiles of the #1 sites: p20 ${q(0.2)}, p40 ${q(0.4)}, p60 ${q(0.6)}, p80 ${q(0.8)}.

## 5. Per factor

The factors as stored on each parcel's #1 site (\`sites[0].q.*\` and \`.c.*\`). "A / B / C / D / F" is the share of
parcels whose factor lands in each grade band on the app's absolute cutoffs (80/65/50/35): quality factors on their
0–100 score, cost parts as 100 − points × 100 / max (0 points is 100). **Near-constant** flags a factor with two or
fewer values, one value on 70%+ of parcels, or a spread under 5% of its scale.

### #1 sites

${t.factorsBest}

### Every ranked site

${t.factorsAll}

### The cost parts' values

${t.costValues}

### Raw inputs (#1 sites)

${t.raw}

## 6. How the factors move together

Pearson's r across the #1 sites (|r| ≥ 0.5 in bold). With ${n} parcels, |r| under about 0.38 isn't distinguishable
from zero.

${t.corr}

${t.vsScore}

Reading it: **slope, pad and foundation are one signal** (pad is a function of slope; foundation's NRCS rating is
mostly the map unit's slope). **Frost and driveway** pull against each other (−0.47): higher benches have longer
driveways. Sun, aspect and sky are independent of everything else here.

## 7. Proposals

### Near-constant factors, and replacements from the soil properties

**Septic (85% at the maximum).** The NRCS class is a three-step summary of a fuzzy rating whose value is also 1.0 for
almost every site, so the continuous value doesn't help either. The limiting features underneath do vary:

${t.soil}

${t.septicVsSoil}

Proposed replacement (what-if B below): septic points = 40 × the worst of
- NRCS's own limitation values other than slope, each already 0–1 and graded by the soil property behind it:
  depth to bedrock or another restriction, slow water movement (the slowest layer's Ksat), large stones, filtering
  capacity;
- **the bench's lidar slope** through NRCS's slope ramp (8% → 0, 15% → 1), not the map unit's;
- "seepage, bottom layer" (fast lower layers: a design and setback issue more than a no) at **half** weight, shown
  as a note.

The properties in the table above (depth, Ksat, slope) are what those values are built from; using NRCS's values
keeps its thresholds rather than inventing ours.

**Foundation (63% at the maximum).** Drop the slope part (already in quality's slope and cost's pad); keep NRCS's
other limits (large stones, bedrock, wetness, shrink-swell).

**Rock (two values).** Scale by depth: 15 points at ≤ 50 cm to 0 at ≥ 150 cm, instead of 15 below 100 cm and 0 above.

**Sky's dome penalty (full for ${domeFull} of ${parcels.length}).** Saturate at w = 8 (the worst seen here) instead of w = 3, so a
town 30 km south costs more than one 60 km south.

### What those would do (report only)

Each what-if re-costs the #1 site from its stored parts; other sites aren't re-ranked.
**A:** the site's lidar slope in place of the map unit's in both NRCS ratings, rock by depth.
**B:** A, plus seepage at half weight, no slope in foundation, and the dome penalty full at w = 8.

| | A | B | C | D | F |
|---|---|---|---|---|---|
| Today | ${shares(ws, (w) => w.today.grade)} |
| What-if A | ${shares(ws, (w) => w.a.grade)} |
| What-if B | ${shares(ws, (w) => w.b.grade)} |

| Parcel | Site / unit slope (%) | NRCS septic limits besides slope | Septic today → A → B | Foundation today → B | Rock today → A | Sky today → B | Cost today → B | Score, grade today → B |
|---|---|---|---|---|---|---|---|---|
${ws.map((w) => `| ${parcels.find((p) => p.key === w.key)!.parcelId} | ${fmt(w.sitePct)} / ${fmt(w.unitPct, 0)} | ${w.septicWhy} | ${w.today.septic} → ${fmt(w.a.septic)} → ${fmt(w.b.septic)} | ${w.today.foundation} → ${fmt(w.b.foundation)} | ${w.today.rock} → ${fmt(w.a.rock)} | ${w.today.sky} → ${w.b.sky} | ${fmt(w.today.cost, 0)} → ${w.b.cost} | ${w.today.score} ${w.today.grade} → ${w.b.score} ${w.b.grade} |`).join("\n")}

### Absolute or relative cutoffs, per factor

"Absolute": fixed thresholds on the physical quantity, the same for every parcel and every year. "Relative": bands
by percentile among the parcels in your library, so a grade means "better than most of what we've looked at".

| Factor | Proposal | Why |
|---|---|---|
| Sun | Absolute | December hours of direct sun are physical, and they spread (67–94). |
| Aspect | Absolute | A south face is south anywhere. |
| Frost | Absolute | It's a hollow penalty; near-ceiling scores are the point. |
| Slope | Absolute | Construction cost follows degrees, not rank. |
| Sky | Absolute, re-anchored | The sky is the same everywhere in this region; a relative scale would invent differences of 0.8 mag. Fix the dome saturation instead. |
| Septic, foundation, rock | Absolute, continuous | Soil limits are physical; make them continuous so they separate parcels (above). |
| Pad, driveway | Absolute | They're dollars. |
| **The overall grade** | **Absolute, but calibrated once** on this set and your gut grades, then fixed | Relative grades would shift as the library grows (an A today becomes a B after a good find). Today's 80/65/50/35 were never calibrated: on these parcels nothing reaches 80. Calibrate them to where your grades fall, and show a parcel's rank in the library separately. |

## 8. Gut grades against the tool's: skipped

**Skipped by the owner (2026-10-09); A3 proceeds without it.** Nothing here was graded, and no grades were made up
in their place: a comparison against invented letters would only measure the invention. So the overall cutoffs keep
their current values until there's real judgment to calibrate them against (§7's last row). If the comparison is
done later: grade the sheet in §1 blind (and Julie separately, if she likes), and the report then gives exact and
within-one-letter matches, the rank correlation, the factor behind each disagreement, and the best-fitting cutoffs.

The owners' stated priorities (2026-10-09), for A3 and later work. These aren't grades:
- **Zach:** high-performance building concepts (passive solar: winter sun, south aspect, a compact foundation),
  and high elevation.
- **Julie:** proximity to recreation, no HOA, self-sufficiency (gardens, water, sun), and remoteness. HOA status
  isn't in any data source the app reads; county parcel records don't carry it.

<details><summary>The tool's grades for G1–G${gut.length}</summary>

| # | Parcel | Tool's #1 grade, score | Quality | Cost index | What-if B |
|---|---|---|---|---|---|
${gut
  .map((p, i) => {
    const s = p.result.sites![0]!;
    const w = ws.find((x) => x.key === p.key)!;
    return `| G${i + 1} | ${p.parcelId} | ${s.grade} ${s.score} | ${s.quality} | ${s.costIdx} | ${w.b.grade} ${w.b.score} |`;
  })
  .join("\n")}

</details>

## 9. Per-parcel soil under the #1 site

${t.soilPerParcel}

## 10. Caveats

- ${parcels.length} parcels is enough to see which factors don't vary and which move together; not enough to estimate small
  correlations (|r| < 0.38) or tail behaviour.
- One draw per county, 5–100 acres; no parcel over 100 acres except the Macks fixture (292 ac).
- Some runs had a failed step (shown in §3); a failed PAD-US or driveway step doesn't change site scores, but a
  failed driveway route leaves #1's driveway at its straight-line estimate.
- The soil properties are the dominant major component of the map unit under #1's point (SDA), at map-unit scale.
- The what-ifs re-cost #1 only and don't re-rank, and use NRCS's slope ramp as these map units report it.

</details>
`;
  mkdirSync("docs/studies", { recursive: true });
  // A re-run against an earlier one is its own file: the first run's findings stay as written.
  if (prev)
    writeFileSync(`docs/studies/grade-distribution-engine${ENGINE_VERSION}.md`, rerunDoc(prev, parcels, t));
  else writeFileSync(DOC, md);
}

/** The re-run's page: the comparison, then this engine's grade and factor tables (no prose written for the first run). */
function rerunDoc(
  prev: { parcels: StudyParcel[]; engine: number },
  parcels: StudyParcel[],
  t: Record<string, string>,
): string {
  const e = ENGINE_VERSION;
  return `# Grade distribution at engine ${e}: the study re-run

The parcels of \`grade-distribution.md\` (engine ${prev.engine || "earlier"}), screened again with today's rules after Batch A's
A3 and A3b. Report only. Reproduce: \`STUDY_DIR=tmp/study-e${e} pnpm study:grades\`, then the report stage with
\`PREV_DIR\` set to the earlier run. The first run's findings, proposals and caveats stay in \`grade-distribution.md\`.

**For the record (owner, #87 review, 2026-10-09):** at engine 6, randomly drawn parcels are 78% A/B and 0% F, so
the scale looks lenient at the bottom. The cutoffs (80/65/50/35) stay until they're calibrated against the owner's
gut grades (\`grade-distribution.md\` §1 and §8).

${compareRuns(prev, parcels)}## Grades at engine ${e}

${t.grades}

## Per factor at engine ${e} (#1 sites)

${t.factorsBest}

${t.costValues}

## How the factors move together at engine ${e}

${t.corr}
`;
}
