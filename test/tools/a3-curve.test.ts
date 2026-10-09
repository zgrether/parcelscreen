/**
 * A3's driveway curve (owner, 2026-10-09): points = k · ln(1 + cost / c0) (+ noRoute, + easement, capped), and
 * where every ranked site of the three fixtures sits on it, from the pipeline as it now runs (every site routed by
 * siteDriveways). Writes docs/studies/<CURVE_NAME>.md and .svg (a3b-driveway-curve by default; A3's engine-5 chart
 * is a3-driveway-curve, kept as it was, before the router fix).
 *
 *   pnpm a3:curve
 */
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { siteDriveways } from "@/lib/screen/driveway";
import { routeContext } from "@/lib/screen/index";
import { drivewayPoints } from "@/lib/screen/score";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import { FIXTURE_SLUGS } from "../support/fixtures";
import { runFixture } from "../support/scenarios";

const C = SCREEN_CONSTANTS.score.drivewayCost;
/** The chart's name and caption: A3's (engine 5, before the router fix) or A3b's (engine 6, after it). */
const NAME = process.env.CURVE_NAME ?? `a3b-driveway-curve`;
const CAPTION = process.env.CURVE_CAPTION ?? `Engine ${ENGINE_VERSION}, after the router fix (A3b)`;
const DOC = `docs/studies/${NAME}.md`;
const SVG = `docs/studies/${NAME}.svg`;
const curve = (cost: number) => C.k * Math.log(1 + cost / C.c0);

interface Point {
  fixture: string;
  rank: number;
  acres: number;
  shelf: boolean;
  cost: number | null;
  lengthFt: number | null;
  legal: boolean;
  easement: boolean;
  points: number;
}

function svg(points: Point[]): string {
  const W = 760,
    H = 420,
    L = 56,
    R = 20,
    T = 20,
    B = 48;
  const xMax = 500_000,
    yMax = 45;
  const x = (c: number) => L + (c / xMax) * (W - L - R);
  const y = (p: number) => T + (1 - p / yMax) * (H - T - B);
  const path = (off: number) =>
    Array.from({ length: 101 }, (_, i) => (i * xMax) / 100)
      .map((c, i) => `${i ? "L" : "M"}${x(c).toFixed(1)},${y(Math.min(C.max, curve(c) + off)).toFixed(1)}`)
      .join(" ");
  const colour: Record<string, string> = { ferney: "#1f77b4", macks: "#d62728", grayson: "#2ca02c" };
  const ticksX = [0, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000];
  const ticksY = [0, 10, 20, 30, 40];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${W - R}" y="${T + 4}" text-anchor="end" font-weight="bold">${CAPTION}</text>
${ticksY.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#eee"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("\n")}
${ticksX.map((t) => `<text x="${x(t)}" y="${H - B + 18}" text-anchor="middle">$${t / 1000}k</text>`).join("\n")}
<line x1="${L}" x2="${W - R}" y1="${y(C.max)}" y2="${y(C.max)}" stroke="#999" stroke-dasharray="4 3"/>
<text x="${W - R}" y="${y(C.max) - 6}" text-anchor="end" fill="#666">cap ${C.max}</text>
<path d="${path(0)}" fill="none" stroke="#333" stroke-width="2"/>
<path d="${path(C.noRoute)}" fill="none" stroke="#333" stroke-width="1.5" stroke-dasharray="6 4"/>
${points
  .filter((p) => p.cost != null)
  .map((p) =>
    p.easement
      ? `<path d="M${x(p.cost!).toFixed(1)},${(y(p.points) - 7).toFixed(1)} l7,7 l-7,7 l-7,-7 z" fill="${p.legal ? colour[p.fixture] : "#fff"}" stroke="${colour[p.fixture]}" stroke-width="2"><title>${p.fixture} #${p.rank}: ${Math.round(p.cost! / 1000)}k, ${p.points.toFixed(1)} pts, needs an easement</title></path>`
      : `<circle cx="${x(p.cost!).toFixed(1)}" cy="${y(p.points).toFixed(1)}" r="5" fill="${p.legal ? colour[p.fixture] : "#fff"}" stroke="${colour[p.fixture]}" stroke-width="2"><title>${p.fixture} #${p.rank}: ${Math.round(p.cost! / 1000)}k, ${p.points.toFixed(1)} pts</title></circle>`,
  )
  .join("\n")}
<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">Route cost (mid estimate)</text>
<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Driveway points</text>
<g transform="translate(${L + 12} ${T + 8})">
<line x1="0" x2="24" y1="0" y2="0" stroke="#333" stroke-width="2"/><text x="30" y="4">within the grade limit</text>
<line x1="0" x2="24" y1="18" y2="18" stroke="#333" stroke-dasharray="6 4"/><text x="30" y="22">+${C.noRoute}: no route within the limit (open), or the route needs an easement (diamonds)</text>
${Object.entries(colour)
  .map(
    ([k, c], i) =>
      `<circle cx="12" cy="${40 + i * 18}" r="5" fill="${c}"/><text x="30" y="${44 + i * 18}">${k}</text>`,
  )
  .join("")}
</g>
</svg>
`;
}

describe.runIf(import.meta.env.MODE === "a3-curve")("A3 driveway curve", () => {
  it(
    "places every fixture site on the curve",
    async () => {
      const points: Point[] = [];
      for (const slug of FIXTURE_SLUGS) {
        const { result, session: s } = await runFixture(slug);
        const sites = result.sites ?? [];
        const dw = siteDriveways(
          routeContext(s),
          s.roads ?? [],
          s.parcel,
          sites.map((x) => x.ll),
          s.config.roadMaxGradePct,
        );
        sites.forEach((site, i) => {
          const d = dw[i]!;
          points.push({
            fixture: slug.split("-")[0]!,
            rank: site.rank,
            acres: site.acres,
            shelf: !!site.compact,
            cost: d.route ? d.route.cost.mid : null,
            lengthFt: d.route ? d.route.metrics.lengthFt : null,
            legal: d.legal,
            easement: !!d.route?.needsEasement,
            points: drivewayPoints(d),
          });
        });
      }
      writeFileSync(SVG, svg(points));
      const marks = [10_000, 25_000, 50_000, 100_000, 150_000, 250_000, 400_000];
      const max = Math.max(...points.map((p) => p.points));
      const md = `# The driveway points curve: ${CAPTION}

Batch A, A3 (owner, 2026-10-09). Every ranked site's driveway is routed (\`siteDriveways\`), and its points come from
the route's cost estimate (mid):

**points = min(${C.max}, ${C.k} · ln(1 + cost / $${C.c0.toLocaleString("en-US")}) + ${C.noRoute} if no route fits the grade limit + ${C.easement} if the route needs an easement)**

When no route fits the limit, the least-steep route's cost is used. A site no route reaches at all takes the full
${C.max}. Generated by \`pnpm a3:curve\` (\`test/tools/a3-curve.test.ts\`) from the pipeline as it now runs.

**Choosing k and c0.** You asked for no ranked fixture site at the cap, and $10k, $50k and $150k clearly apart.
**c0 = $${C.c0.toLocaleString("en-US")}** sets where the curve turns, and **k = ${C.k}** sets its height. The costliest
site on the three fixtures has no route within the limit, so it takes the +${C.noRoute} too, and still lands at
${max.toFixed(1)} points, under the cap of ${C.max}. For comparison, today's linear rule (length / 100 ft) reaches its
30-point maximum at 3,000 ft. The curve keeps separating sites past that.

![The curve and every fixture site on it](${NAME}.svg)

| Route cost | ${marks.map((m) => `$${m / 1000}k`).join(" | ")} |
|---|${marks.map(() => "---").join("|")}|
| Points, within the limit | ${marks.map((m) => curve(m).toFixed(1)).join(" | ")} |
| Points, no route within the limit | ${marks.map((m) => Math.min(C.max, curve(m) + C.noRoute).toFixed(1)).join(" | ")} |

## Every ranked site on the three fixtures

| Fixture | Rank | Site | Route | Length (ft) | Cost (mid) | Points |
|---|---|---|---|---|---|---|
${points
  .map(
    (p) =>
      `| ${p.fixture} | #${p.rank} | ${p.acres.toFixed(2)} ac${p.shelf ? " shelf" : ""} | ${p.cost == null ? "none reaches it" : p.legal ? "within the limit" : "least-steep (over the limit)"}${p.easement ? ", needs an easement" : ""} | ${p.lengthFt == null ? "—" : Math.round(p.lengthFt)} | ${p.cost == null ? "—" : `$${Math.round(p.cost / 1000)}k`} | ${p.points.toFixed(1)} |`,
  )
  .join("\n")}
`;
      writeFileSync(DOC, md);
    },
    20 * 60_000,
  );
});
