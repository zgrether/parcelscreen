/**
 * A3b (follow-up 44, owner 2026-10-09): the router's cost precision. Captures, per fixture, every ranked site's
 * route (within the limit or not, the grade cap it needs, length, cost, driveway points), the ranking, and the
 * routing time; then compares a capture before the fix with one after. Writes docs/studies/a3b-router-precision.md.
 *
 *   NAME=before pnpm a3b:router      (on the commit before the fix; STAGE=capture is the default)
 *   NAME=after pnpm a3b:router
 *   STAGE=report pnpm a3b:router
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { entranceCandidates, leastSteep, routeDriveway, siteDriveways } from "@/lib/screen/driveway";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { routeContext } from "@/lib/screen/index";
import { drivewayPoints } from "@/lib/screen/score";
import { FIXTURE_SLUGS } from "../support/fixtures";
import { runFixture } from "../support/scenarios";

const DIR = "tmp/a3b";
const DOC = "docs/studies/a3b-router-precision.md";

interface SiteRow {
  key: string; // the site's position: the same bench before and after
  acres: number;
  shelf: boolean;
  rank: number;
  grade: string;
  score: number;
  legal: boolean;
  capPct: number | null;
  lengthFt: number | null;
  cost: number | null;
  points: number;
  /** Kept to the parcel (the least-steep rule: outside land only at the entrance): "≤10" or the whole-percent cap needed. */
  inParcel?: string;
}
interface Capture {
  slug: string;
  sites: SiteRow[];
  passMs: number;
  screenMs: number;
  first: { key: string; legal: boolean; capPct: number | null; lengthFt: number | null; cost: number | null };
}

const keyOf = (ll: [number, number]) => `${ll[0].toFixed(6)},${ll[1].toFixed(6)}`;

async function capture(): Promise<Capture[]> {
  const out: Capture[] = [];
  for (const slug of FIXTURE_SLUGS) {
    const t0 = performance.now();
    const { result, session: s } = await runFixture(slug);
    const screenMs = performance.now() - t0;
    const sites = result.sites ?? [];
    const p0 = performance.now();
    const dw = siteDriveways(
      routeContext(s),
      s.roads ?? [],
      s.parcel,
      sites.map((x) => x.ll),
      s.config.roadMaxGradePct,
    ).map((r) => r.withinLimit ?? r.onParcel ?? { route: null, legal: false, entranceIndex: null }); // A3b's choice
    const passMs = performance.now() - p0;
    const ctx = routeContext(s);
    const limit = s.config.roadMaxGradePct;
    const ent = entranceCandidates(s.roads ?? [], s.parcel, ctx.dFine).entrances.slice(
      0,
      SCREEN_CONSTANTS.driveway.entrancesRouted,
    );
    const L = SCREEN_CONSTANTS.driveway.leastSteep;
    /** The grade a route kept to the parcel needs: within the limit, else leastSteep's cap. */
    const inParcel = (ll: [number, number]): string => {
      const within = ent.some((e) =>
        routeDriveway(ctx, e.ll, ll, {
          maxGrade: limit / 100,
          wGrade: L.wGrade,
          label: "x",
          insideExceptNearStartM: L.entranceM,
        }),
      );
      if (within) return `≤${limit}`;
      const o = leastSteep(ctx, ent, ll, limit);
      return o ? String(Math.round(o.maxGrade * 100)) : "none";
    };
    const rows = sites.map((x, i): SiteRow => {
      const d = dw[i]!;
      return {
        key: keyOf(x.ll),
        acres: x.acres,
        shelf: !!x.compact,
        rank: x.rank,
        grade: x.grade,
        score: x.score,
        legal: d.legal,
        capPct: d.route ? Math.round(d.route.maxGrade * 100) : null,
        lengthFt: d.route ? d.route.metrics.lengthFt : null,
        cost: d.route ? d.route.cost.mid : null,
        points: drivewayPoints(d),
        inParcel: inParcel(x.ll),
      };
    });
    const r = result.driveway?.routes[0] ?? result.driveway?.overLimit ?? null;
    out.push({
      slug,
      sites: rows,
      passMs,
      screenMs,
      first: {
        key: keyOf(sites[0]!.ll),
        legal: !!result.driveway?.routes[0],
        capPct: r ? Math.round(r.maxGrade * 100) : null,
        lengthFt: r ? r.metrics.lengthFt : null,
        cost: r ? r.cost.mid : null,
      },
    });
  }
  return out;
}

const fmt = (x: number | null, d = 0) => (x == null ? "—" : x.toFixed(d));

/** Whether a site's route needed an easement: its points less the curve (and the no-route term) leave the +10. */
function easementOf(r: SiteRow): boolean {
  const C = SCREEN_CONSTANTS.score.drivewayCost;
  if (r.cost == null || r.points >= C.max) return false;
  const base = C.k * Math.log(1 + r.cost / C.c0) + (r.legal ? 0 : C.noRoute);
  return r.points - base > C.easement / 2;
}
const money = (x: number | null) => (x == null ? "—" : `$${Math.round(x / 1000)}k`);

function report(before: Capture[], after: Capture[]): string {
  const sections = before.map((b) => {
    const a = after.find((x) => x.slug === b.slug)!;
    const rows = a.sites
      .slice()
      .sort((x, y) => x.rank - y.rank)
      .map((s) => {
        const o = b.sites.find((x) => x.key === s.key);
        const route = (r: SiteRow | undefined) =>
          !r
            ? "—"
            : r.cost == null
              ? "none"
              : `${r.legal ? "≤ 10%" : `needs ${r.capPct}%`}${easementOf(r) ? ", needs an easement" : ""}, ${fmt(r.lengthFt)} ft, ${money(r.cost)}`;
        const moved = !o || o.rank !== s.rank || o.grade !== s.grade;
        const now = `#${s.rank} ${s.grade} ${s.score}`;
        const cap = (x: string | undefined) =>
          x == null ? "—" : x.startsWith("≤") ? `${x}%` : x === "none" ? "none" : `needs ${x}%`;
        return `| ${s.acres.toFixed(2)} ac${s.shelf ? " shelf" : ""} | ${route(o)} | ${o ? o.points.toFixed(1) : "—"} | ${o ? `#${o.rank} ${o.grade} ${o.score}` : "—"} | ${route(s)} | ${s.points.toFixed(1)} | ${moved ? `**${now}**` : now} | ${cap(o?.inParcel)} → ${cap(s.inParcel)} |`;
      });
    return `### ${b.slug}

| Site | Route before | Pts before | Rank before | Route after | Pts after | Rank after | Kept to the parcel, before → after |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

#1's driveway: before ${b.first.legal ? "within the limit" : `needs ${b.first.capPct}%`}, ${fmt(b.first.lengthFt)} ft, ${money(b.first.cost)};
after ${a.first.legal ? "within the limit" : `needs ${a.first.capPct}%`}, ${fmt(a.first.lengthFt)} ft, ${money(a.first.cost)}${a.first.key === b.first.key ? "" : " (a different site is #1)"}.

Routing every ranked site: ${(b.passMs / 1000).toFixed(2)} s before, **${(a.passMs / 1000).toFixed(2)} s after**. The whole screen
(Node, replayed): ${(b.screenMs / 1000).toFixed(1)} s before, ${(a.screenMs / 1000).toFixed(1)} s after.
`;
  });
  return `# A3b: the router's cost precision (follow-up 44)

Batch A, A3b (owner, 2026-10-09). Generated by \`pnpm a3b:router\` (\`test/tools/a3b-router.test.ts\`): each fixture
screened and every ranked site routed by \`siteDriveways\`, on the commit before the fix and after it. Sites are matched
by position. "≤ 10%" means a route within the grade limit; "needs N%" is the least-steep route's whole-percent cap. A
route that leaves the parcel says "needs an easement" (owner, #87 review): it is never "within the limit" without it.

**Which route Grayson's #1 is scored on** (owner's question): the one within the 10% limit that crosses
neighbouring land, 5,176 ft at about $454k, with +10 points for the easement. Kept to the parcel, the same site needs
11% (the column at the right); that route isn't scored, because scoring takes the cheapest route within the limit.

The curve, with every fixture site on it at engine 6: \`a3b-driveway-curve.md\`. At engine 5, before this fix:
\`a3-driveway-curve.md\`.

${sections.join("\n")}`;
}

describe.runIf(import.meta.env.MODE === "a3b")("A3b router precision", () => {
  it(
    "captures or reports",
    async () => {
      mkdirSync(DIR, { recursive: true });
      if ((process.env.STAGE ?? "capture") === "capture") {
        const name = process.env.NAME ?? "after";
        writeFileSync(`${DIR}/${name}.json`, JSON.stringify(await capture(), null, 1));
      } else {
        const load = (n: string) => JSON.parse(readFileSync(`${DIR}/${n}.json`, "utf8")) as Capture[];
        writeFileSync(DOC, report(load("before"), load("after")));
      }
    },
    30 * 60_000,
  );
});
