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
import { chooseDriveway, drivewayPoints } from "@/lib/screen/score";
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
const byLength = (overFt: number) => C.noRoute * Math.min(1, overFt / 1000);
const byGrade = (needed: number, limit: number) =>
  C.noRoute * Math.min(1, Math.max(0, needed - limit) / C.noRouteFullPct);

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

function svg(
  rows: Row[],
  synthetic: { label: string; cost: number; needed: number; overFt: number }[],
): string {
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
  // Each synthetic site: the term by grade (filled) and by length (open, drawn larger so a coinciding pair shows).
  const synth = synthetic.flatMap((s) => {
    const base = curve(s.cost);
    const g = base + byGrade(s.needed, 10),
      l = base + byLength(s.overFt);
    const label = (p: number, text: string) =>
      `<text x="${(x(s.cost) - 12).toFixed(1)}" y="${(y(p) + 4).toFixed(1)}" text-anchor="end" fill="#7b3fa0">${text}</text>`;
    return [
      square(x(s.cost), y(g), "#7b3fa0", `${s.label}: by grade, ${g.toFixed(1)} pts`),
      `<rect x="${(x(s.cost) - 8).toFixed(1)}" y="${(y(l) - 8).toFixed(1)}" width="16" height="16" fill="none" stroke="#7b3fa0" stroke-width="2"><title>${s.label}: by length, ${l.toFixed(1)} pts</title></rect>`,
      ...(Math.abs(g - l) < 0.05
        ? [label(g, `${s.label}: both forms`)]
        : [label(g, `${s.label}: by grade`), label(l, `${s.label}: by length`)]),
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
<path d="${path(C.noRoute)}" fill="none" stroke="#333" stroke-width="1.5" stroke-dasharray="6 4"/>
${marks.join("\n")}
${synth.join("\n")}
<text x="${(L + W - R) / 2}" y="${H - B + 38}" text-anchor="middle">Route cost (mid estimate)</text>
<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Driveway points</text>
<g transform="translate(${L} ${H - B + 64})">
<line x1="0" x2="24" y1="0" y2="0" stroke="#333" stroke-width="2"/><text x="30" y="4">within the limit, on the parcel</text>
<line x1="0" x2="24" y1="18" y2="18" stroke="#7b3fa0" stroke-dasharray="2 3"/><text x="30" y="22">+1 (needs 11%), +5 (needs 15%) over a 10% limit</text>
<line x1="0" x2="24" y1="36" y2="36" stroke="#333" stroke-dasharray="6 4"/><text x="30" y="40">+10: needs an easement (diamonds), or 20% and more over the limit</text>
<text x="0" y="62">● within the limit · ◆ needs an easement · ▲ kept to the parcel, over the limit · filled = scored</text>
<text x="0" y="80" fill="#7b3fa0">■ synthetic sites: filled = the term by grade (adopted), open = by length over the limit</text>
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
      const synthetic = [
        {
          label: "needs 11%",
          cost: 230_000,
          needed: 11,
          overFt: g1.onParcel?.route ? (g1.onParcel.route as OverLimitRoute).overFt : 0,
        },
        { label: "needs 22%", cost: 330_000, needed: 22, overFt: ENGINE5_GRAYSON[0]!.overFt },
      ];
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

When no route fits the grade limit, A3 added a flat +${C.noRoute}. The owner asked for a term scaled by how far over the
limit the route goes, by whichever of two forms separates a route needing 10.5% from one needing 22%:

- **by length:** ${C.noRoute} × min(1, ft over the limit / 1000);
- **by grade:** ${C.noRoute} × min(1, (needed % − limit %) / ${C.noRouteFullPct}).

Every route kept to the parcel that needs more than the 10% limit, on the three fixtures now, and Grayson's with the
engine-5 router (the 22% routes, before follow-up 44; measured once, since that router is no longer in the tree):

| Site | Needs | Length (ft) | Ft over 10% | By length | By grade |
|---|---|---|---|---|---|
${penaltyRows.join("\n")}

**Adopted: by grade.** The length over the limit can't tell the two apart. It is measured on the route's own 3 m
profile over a 15 m window, which on these slopes finds "steeper than 10%" stretches even on a route the router held
to 11%. Grayson's #1 kept to the parcel needs 11% and has ${ft(synthetic[0]!.overFt)} ft over 10%, more than the
${ft(ENGINE5_GRAYSON[0]!.overFt)} ft of its engine-5 route that needed 22%: both take the full ${C.noRoute}. By grade,
11% takes +1 and 22% the full +${C.noRoute}. In \`config.ts\`: \`drivewayCost.noRouteFullPct\` = ${C.noRouteFullPct}.

At 20% and over, the over-limit term equals the easement's (${C.easement}), so between a route kept to the parcel
that steep and one through the neighbours within the limit, the cost decides.

![Both candidates per site, and the two synthetic over-limit sites under each form](a4-driveway-curve.svg)

The synthetic sites (purple squares) are two routes, at $230k and $330k: one needing 11% (a 10.5% path), one needing
22%, with Grayson's measured lengths over the limit (above). By grade (filled) the 11% route takes +1 and the 22%
route +10; by length (open) both take +10.

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
