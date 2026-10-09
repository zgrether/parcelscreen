/**
 * A4 (owner, #87 review and re-scope, 2026-10-09): the driveway. Writes docs/studies/a4-driveway.md and its chart:
 * which form of the over-limit term separates a route needing 10.5% from one needing 22%, every ranked site's two
 * candidates and the one it is scored on, each site before (main's expected.json) and after, and the routing time.
 *
 *   pnpm a4:driveway
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { neededPct, siteDriveways, type OverLimitRoute, type SiteDriveway } from "@/lib/screen/driveway";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import { routeContext } from "@/lib/screen/index";
import { chooseDriveway, drivewayPoints, overLimitTerm } from "@/lib/screen/score";
import type { ScreenResult } from "@/lib/screen/types";
import { expectedPath } from "../support/expected";
import { FIXTURE_SLUGS, type FixtureSlug } from "../support/fixtures";
import { runFixture } from "../support/scenarios";

const C = SCREEN_CONSTANTS.score.drivewayCost;
const DOC = "docs/studies/a4-driveway.md";
const SVG = "docs/studies/a4-driveway-curve.svg";
const BASE = process.env.BASE ?? "origin/main";
const curve = (cost: number) => C.k * Math.log(1 + cost / C.c0);
/** The two forms the owner proposed for the over-limit term. */
/** The two forms proposed in #87 for the over-limit term: by length over the limit (not adopted), and by grade. */
const byLength = (overFt: number) => 10 * Math.min(1, overFt / 1000);
const byGrade = (needed: number, limit: number) => overLimitTerm(needed, limit);
const D = SCREEN_CONSTANTS.driveway;
const GRADES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22];

/**
 * Grayson's least-steep routes kept to the parcel with the engine-5 router (before follow-up 44, which skipped about
 * half its cells): the 22% routes the owner's example refers to. Measured once on d260905's lib/screen/driveway.ts;
 * that router isn't in this tree, so the numbers are recorded here.
 */
const ENGINE5_GRAYSON = [
  { rank: 1, needed: 22, overFt: 1959, lengthFt: 2114, cost: 223_000 },
  { rank: 2, needed: 22, overFt: 1063, lengthFt: 1264, cost: 186_000 },
  { rank: 3, needed: 22, overFt: 1772, lengthFt: 1787, cost: 205_000 },
  { rank: 4, needed: 22, overFt: 1939, lengthFt: 2101, cost: 227_000 },
];

type Site = NonNullable<ScreenResult["sites"]>[number];
interface Row {
  slug: string;
  site: Site;
  before: Site | null;
  within: SiteDriveway | null;
  onParcel: SiteDriveway | null;
  chosen: SiteDriveway;
}

function baseRun(slug: FixtureSlug): ScreenResult | null {
  const path = expectedPath(slug).replace(/\\/g, "/").split("/test/fixtures/")[1];
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${BASE}:test/fixtures/${path}`], { encoding: "utf8", maxBuffer: 1e9 }),
    ).run as ScreenResult;
  } catch {
    return null;
  }
}

const money = (x: number) => `$${Math.round(x / 1000)}k`;
const ft = (x: number) => Math.round(x).toLocaleString("en-US");
const routeCell = (d: SiteDriveway | null) => {
  if (!d?.route) return "none";
  const r = d.route;
  const grade = d.legal ? `≤ ${Math.round(r.maxGrade * 100)}%` : `needs ${neededPct(r as OverLimitRoute)}%`;
  return `${grade}${r.needsEasement ? ", easement" : ""}, ${ft(r.metrics.lengthFt)} ft, ${money(r.cost.mid)}, **${drivewayPoints(d).toFixed(1)}**`;
};

function svg(rows: Row[], synthetic: { cost: number; needed: number }[]): string {
  const W = 760,
    H = 560,
    L = 56,
    R = 20,
    T = 20,
    B = 168; // the legend sits under the plot
  const xMax = 500_000,
    yMax = 45;
  const x = (c: number) => L + (c / xMax) * (W - L - R);
  const y = (p: number) => T + (1 - p / yMax) * (H - T - B);
  const path = (off: number) =>
    Array.from({ length: 101 }, (_, i) => (i * xMax) / 100)
      .map((c, i) => `${i ? "L" : "M"}${x(c).toFixed(1)},${y(Math.min(C.max, curve(c) + off)).toFixed(1)}`)
      .join(" ");
  const colour: Record<string, string> = { ferney: "#1f77b4", macks: "#d62728", grayson: "#2ca02c" };
  const fx = (slug: string) => slug.split("-")[0]!;
  const diamond = (cx: number, cy: number, fill: string, stroke: string, title: string) =>
    `<path d="M${cx.toFixed(1)},${(cy - 7).toFixed(1)} l7,7 l-7,7 l-7,-7 z" fill="${fill}" stroke="${stroke}" stroke-width="2"><title>${title}</title></path>`;
  const square = (cx: number, cy: number, fill: string, title: string) =>
    `<rect x="${(cx - 6).toFixed(1)}" y="${(cy - 6).toFixed(1)}" width="12" height="12" fill="${fill}" stroke="#7b3fa0" stroke-width="2"><title>${title}</title></rect>`;
  const ticksX = [0, 100_000, 200_000, 300_000, 400_000, 500_000];
  const marks = rows.flatMap((r) => {
    const out: string[] = [];
    const c = colour[fx(r.slug)]!;
    for (const d of new Set([r.within, r.onParcel])) {
      if (!d?.route) continue;
      const scored = d === r.chosen;
      const t = `${fx(r.slug)} #${r.site.rank}: ${d.legal ? "within the limit" : `needs ${neededPct(d.route as OverLimitRoute)}%`}${d.route.needsEasement ? ", easement" : ""}, ${money(d.route.cost.mid)}, ${drivewayPoints(d).toFixed(1)} pts${scored ? " (scored)" : ""}`;
      const cx = x(d.route.cost.mid),
        cy = y(drivewayPoints(d));
      out.push(
        d.route.needsEasement
          ? diamond(cx, cy, scored ? c : "#fff", c, t)
          : d.legal
            ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="${scored ? c : "#fff"}" stroke="${c}" stroke-width="2"><title>${t}</title></circle>`
            : `<path d="M${(cx - 6).toFixed(1)},${(cy + 5).toFixed(1)} l6,-11 l6,11 z" fill="${scored ? c : "#fff"}" stroke="${c}" stroke-width="2"><title>${t}</title></path>`,
      );
    }
    return out;
  });
  // The synthetic over-limit sites: one route cost, needing each grade, labelled with the term.
  const synth = synthetic.flatMap((s) => {
    const p = Math.min(C.max, curve(s.cost) + byGrade(s.needed, 10));
    return [
      square(x(s.cost), y(p), "#7b3fa0", `needs ${s.needed}%: ${p.toFixed(1)} pts`),
      `<text x="${(x(s.cost) - 12).toFixed(1)}" y="${(y(p) + 4).toFixed(1)}" text-anchor="end" fill="#7b3fa0">needs ${s.needed}%: +${byGrade(s.needed, 10).toFixed(0)}${p >= C.max ? " (capped)" : ""}</text>`,
    ];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${W - R}" y="${T + 4}" text-anchor="end" font-weight="bold">Engine ${ENGINE_VERSION} (A4): both candidates per site</text>
${[0, 10, 20, 30, 40].map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#eee"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("\n")}
${ticksX.map((t) => `<text x="${x(t)}" y="${H - B + 18}" text-anchor="middle">$${t / 1000}k</text>`).join("\n")}
<line x1="${L}" x2="${W - R}" y1="${y(C.max)}" y2="${y(C.max)}" stroke="#999" stroke-dasharray="4 3"/>
<text x="${W - R}" y="${y(C.max) - 6}" text-anchor="end" fill="#666">cap ${C.max}</text>
<path d="${path(0)}" fill="none" stroke="#333" stroke-width="2"/>
<path d="${path(1)}" fill="none" stroke="#7b3fa0" stroke-width="1" stroke-dasharray="2 3"/>
<path d="${path(5)}" fill="none" stroke="#7b3fa0" stroke-width="1" stroke-dasharray="2 3"/>
<path d="${path(C.easement)}" fill="none" stroke="#333" stroke-width="1.5" stroke-dasharray="6 4"/>
<path d="${path(D.overLimitMaxPts)}" fill="none" stroke="#7b3fa0" stroke-width="1.5" stroke-dasharray="6 4"/>
${marks.join("\n")}
${synth.join("\n")}
<text x="${(L + W - R) / 2}" y="${H - B + 38}" text-anchor="middle">Route cost (mid estimate)</text>
<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Driveway points</text>
<g transform="translate(${L} ${H - B + 64})">
<line x1="0" x2="24" y1="0" y2="0" stroke="#333" stroke-width="2"/><text x="30" y="4">within the limit, on the parcel</text>
<line x1="0" x2="24" y1="18" y2="18" stroke="#7b3fa0" stroke-dasharray="2 3"/><text x="30" y="22">+1 (needs 11%), +5 (needs 15%), and +${D.overLimitMaxPts} (needs ${D.overLimitMaxAtPct}% and more), over a 10% limit</text>
<line x1="0" x2="24" y1="36" y2="36" stroke="#333" stroke-dasharray="6 4"/><text x="30" y="40">+${C.easement}: needs an easement (diamonds)</text>
<text x="0" y="62">● within the limit · ◆ needs an easement · ▲ kept to the parcel, over the limit · filled = scored</text>
<text x="0" y="80" fill="#7b3fa0">■ synthetic sites: one route cost, needing 11, 15, 18 and 22%</text>
${Object.entries(colour)
  .map(
    ([k, c], i) =>
      `<circle cx="${12 + i * 90}" cy="98" r="5" fill="${c}"/><text x="${22 + i * 90}" y="102">${k}</text>`,
  )
  .join("")}
</g>
</svg>
`;
}

describe.runIf(import.meta.env.MODE === "a4-driveway")("A4 driveway study", () => {
  it(
    "writes the study",
    async () => {
      const rows: Row[] = [];
      const timing: string[] = [];
      const overLimit: {
        slug: string;
        rank: number;
        needed: number;
        overFt: number;
        lengthFt: number;
        cost: number;
      }[] = [];
      for (const slug of FIXTURE_SLUGS) {
        const { result, session: s } = await runFixture(slug);
        const sites = result.sites ?? [];
        const t0 = performance.now();
        const routes = siteDriveways(
          routeContext(s),
          s.roads ?? [],
          s.parcel,
          sites.map((x) => x.ll),
          s.config.roadMaxGradePct,
        );
        timing.push(`${slug.split("-")[0]} ${((performance.now() - t0) / 1000).toFixed(2)} s`);
        const before = baseRun(slug)?.sites ?? [];
        sites.forEach((site, i) => {
          const r = routes[i]!;
          const key = site.ll.join(",");
          rows.push({
            slug,
            site,
            before: before.find((b) => b.ll.join(",") === key) ?? null,
            within: r.withinLimit,
            onParcel: r.onParcel,
            chosen: chooseDriveway(r),
          });
          const o = r.onParcel;
          if (o?.route && !o.legal) {
            const ol = o.route as OverLimitRoute;
            overLimit.push({
              slug,
              rank: site.rank,
              needed: neededPct(ol),
              overFt: ol.overFt,
              lengthFt: ol.metrics.lengthFt,
              cost: ol.cost.mid,
            });
          }
        });
      }

      const g1 = rows.find((r) => r.slug.startsWith("grayson") && r.site.rank === 1)!;
      const g1OverFt = g1.onParcel?.route ? (g1.onParcel.route as OverLimitRoute).overFt : 0;
      const synthetic = [11, 15, 18, 22].map((needed) => ({ cost: 200_000, needed }));
      writeFileSync(SVG, svg(rows, synthetic));

      const penaltyRows = [
        ...overLimit.map(
          (o) =>
            `| ${o.slug.split("-")[0]} #${o.rank} (now) | ${o.needed}% | ${ft(o.lengthFt)} | ${ft(o.overFt)} | ${byLength(o.overFt).toFixed(1)} | ${byGrade(o.needed, 10).toFixed(1)} |`,
        ),
        ...ENGINE5_GRAYSON.map(
          (o) =>
            `| grayson #${o.rank} (engine 5) | ${o.needed}% | ${ft(o.lengthFt)} | ${ft(o.overFt)} | ${byLength(o.overFt).toFixed(1)} | ${byGrade(o.needed, 10).toFixed(1)} |`,
        ),
      ];
      const siteRows = rows.map((r) => {
        const b = r.before;
        const moved = !b || b.rank !== r.site.rank || b.grade !== r.site.grade || b.score !== r.site.score;
        const scored = r.chosen === r.within ? "within the limit" : "kept to the parcel";
        const same = r.within && r.within === r.onParcel;
        return `| ${r.slug.split("-")[0]} | ${r.site.acres.toFixed(2)} ac${r.site.compact ? " shelf" : ""} | ${routeCell(r.within)} | ${same ? "same route" : routeCell(r.onParcel)} | ${same ? "—" : scored} | ${b ? `#${b.rank} ${b.grade} ${b.score}, ${b.c.driveway.toFixed(1)} pts` : "—"} | ${moved ? "**" : ""}#${r.site.rank} ${r.site.grade} ${r.site.score}, ${r.site.c.driveway.toFixed(1)} pts${moved ? "**" : ""} |`;
      });
      const gb = g1.before!;
      const md = `# A4: the driveway (engine ${ENGINE_VERSION})

Batch A, A4 (owner, #87 review and re-scope, 2026-10-09). Generated by \`pnpm a4:driveway\`
(\`test/tools/a4-driveway.test.ts\`): every fixture screened as the pipeline now runs, and compared with
\`${BASE}\`'s \`expected.json\`.

## 1. The over-limit term: by grade, not by length

When no route fits the grade limit, A3 added a flat +10. The owner asked (#87) for a term scaled by how far over the
limit the route goes, by whichever of two forms separates a route needing 10.5% from one needing 22%: by length,
10 × min(1, ft over the limit / 1000), or by the grade needed.

**Adopted (owner, #88 review): by grade.** Under a 10% limit: +${D.overLimitPtsPerPct} a percent over the limit up to
${D.practicalMaxPct}% (+${byGrade(D.practicalMaxPct, 10)}), then straight up to +${D.overLimitMaxPts} at ${D.overLimitMaxAtPct}% and above: past the
easement's +${C.easement}, so a grade that is in practice unpermittable loses to a route through the neighbours at a
similar cost. In \`config.ts\`: \`driveway.practicalMaxPct\` = ${D.practicalMaxPct}, \`overLimitPtsPerPct\` = ${D.overLimitPtsPerPct},
\`overLimitMaxAtPct\` = ${D.overLimitMaxAtPct}, \`overLimitMaxPts\` = ${D.overLimitMaxPts}. Per-county limits are follow-up 46.

| Needs | ${GRADES.map((p) => `${p}%`).join(" | ")} |
|---|${GRADES.map(() => "---").join("|")}|
| Points (10% limit) | ${GRADES.map((p) => `+${byGrade(p, 10)}`).join(" | ")} |

**The margin isn't a veto.** A route needing ${D.overLimitMaxAtPct}% or more is ${D.overLimitMaxPts - C.easement} points behind an easement route at the
same cost, so it still wins when the cost curve puts it more than ${D.overLimitMaxPts - C.easement} points ahead: a 22% route at $50k
(${(curve(50_000) + byGrade(22, 10)).toFixed(1)} points) beats an easement route at $300k (${(curve(300_000) + C.easement).toFixed(1)}).

**Why not by length.** Every route kept to the parcel that needs more than the 10% limit, on the three fixtures now,
and Grayson's with the engine-5 router (the 22% routes, before follow-up 44; measured once, since that router is no
longer in the tree):

| Site | Needs | Length (ft) | Ft over 10% | By length (not adopted) | By grade (adopted) |
|---|---|---|---|---|---|
${penaltyRows.join("\n")}

The length over the limit can't tell the two apart. It is measured on the route's own 3 m profile over a 15 m window,
which on these slopes finds "steeper than 10%" stretches even on a route the router held to 11%. Grayson's #1 kept to
the parcel needs 11% and has ${ft(g1OverFt)} ft over 10%, more than the ${ft(ENGINE5_GRAYSON[0]!.overFt)} ft of its
engine-5 route that needed 22%: both would take the full 10.

![Both candidates per site, and four synthetic over-limit sites](a4-driveway-curve.svg)

The synthetic sites (purple squares) are one $200k route needing 11, 15, 18 and 22%: +${byGrade(11, 10)}, +${byGrade(15, 10)},
+${byGrade(18, 10)} and +${byGrade(22, 10)} (at 22% the total is capped at ${C.max}). An easement route at the same cost sits on the
+${C.easement} line.

## 2. The scored route: the candidate with fewer points

Each ranked site has two candidates:

- **within the limit:** the cheapest route within the grade limit, wherever it goes, +${C.easement} when it needs an
  easement;
- **kept to the parcel:** the cheapest route that keeps to the parcel (outside land only at the entrance), within the
  limit when one is, else the least-steep one, with the over-limit term.

A route within the limit that needs no easement is on the owner's land already, so it is both ("same route"). The
site is scored on the candidate with fewer points; a tie goes to the route within the limit. Points in bold.

| Fixture | Site | Within the limit | Kept to the parcel | Scored | Before (${BASE}) | After |
|---|---|---|---|---|---|---|
${siteRows.join("\n")}

**Grayson's #1:** before, scored on the route within 10% through the neighbours (${ft(gb.driveFt ?? 0)} ft,
${gb.c.driveway.toFixed(1)} points: the cost curve + ${C.easement} for the easement), #${gb.rank} ${gb.grade} ${gb.score}.
After, scored on the route kept to the parcel (needs ${neededPct(g1.onParcel!.route as OverLimitRoute)}%, ${ft(g1.site.driveFt ?? 0)} ft,
${g1.site.c.driveway.toFixed(1)} points: the cost curve + 1), #${g1.site.rank} ${g1.site.grade} ${g1.site.score}. Its card
appends both, the scored one first. The driveway section is unchanged: it still recommends the route within the limit,
labelled "needs an easement".

## 3. Routing time

Every ranked site's two candidates, in one pass (\`siteDriveways\`, Node, replayed fixtures): ${timing.join(", ")}.
A3b's pass (one candidate) was 0.17, 0.44 and 0.06 s. The budget is 5 s.
`;
      writeFileSync(DOC, md);
    },
    20 * 60_000,
  );
});
