/**
 * A3's analysis (Batch A §4, owner 2026-10-09): the three fixtures ranked before and after each in-scope scoring
 * change, separately, without changing lib/screen. Each change re-scores every ranked site from its stored parts
 * (the same arithmetic as score.ts), then re-ranks and re-grades. Writes docs/studies/a3-scoring-analysis.md.
 *
 *   pnpm a3:analysis      (NRCS's limiting features are fetched from SDA once, into tmp/a3/; then offline)
 *
 * The changes: 19 (aspect 165°); septic and foundation without the map unit's slope; rock by depth; the sky's dome
 * penalty de-saturated; the driveway as a cost estimate (every ranked site routed). Out of scope: the 70/30 split.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { polygon } from "@turf/turf";
import type { Position } from "geojson";
import { describe, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { buildDriveway } from "@/lib/screen/driveway";
import { routeContext, type ScreenOutput } from "@/lib/screen/index";
import { grade } from "@/lib/screen/score";
import { frostCurve } from "@/lib/screen/sites";
import { soilAt } from "@/lib/screen/soils";
import type { Site, SoilRow } from "@/lib/screen/types";
import { lerp } from "@/lib/screen/util";
import { FIXTURE_SLUGS, type FixtureSlug } from "../support/fixtures";
import { fixtureParcel, runFixture } from "../support/scenarios";

const DIR = "tmp/a3";
const DOC = "docs/studies/a3-scoring-analysis.md";
const K = SCREEN_CONSTANTS.score;
const SU = SCREEN_CONSTANTS.suitability;
const SKY = SCREEN_CONSTANTS.sky;
const CFG = DEFAULT_USER_CONFIG;

/** The candidate values (owner's A3 scope, 2026-10-09). */
export const CANDIDATE = {
  aspectTargetDeg: 165,
  rock: { fullCm: 50, zeroCm: 150 },
  domeFullW: 8,
  /** Driveway points per dollar of the router's mid estimate, capped like today's driveway term with its over-grade. */
  drivewayDollarsPerPoint: 5000,
  drivewayMaxPoints: 40,
  noLegalRoutePoints: 10,
} as const;

interface Reason {
  rule: string;
  depth: number;
  reason: string;
  value: number | null;
}
interface Routed {
  ms: number;
  legal: boolean;
  lengthFt: number | null;
  costMid: number | null;
}
interface FixtureData {
  slug: FixtureSlug;
  sites: Site[];
  valleyFloorFt: number;
  sky: NonNullable<ScreenOutput["result"]["sky"]>;
  /** Per site (by today's rank): the soil row score.ts used, and NRCS's reasons under its component. */
  soils: { rank: number; row: SoilRow | null; reasons: Reason[] | null }[];
  routed: (Routed & { rank: number })[];
  /** Today's #1 was re-costed from its routed driveway (score.ts applyRoutedDriveway), which rounds first. */
  firstRouted: boolean;
}

async function nrcsReasons(cokey: string): Promise<Reason[]> {
  const live = (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;
  const http = createHttpClient({ env: "node", fetchImpl: live, clock: realClock });
  const query = `SELECT ci.mrulename, ci.ruledepth, ci.rulename, ci.interphr FROM cointerp ci
    WHERE ci.cokey = '${cokey}' AND ci.mrulename IN ('ENG - Septic Tank Absorption Fields', 'ENG - Dwellings W/O Basements')
    AND (ci.ruledepth = 0 OR (ci.ruledepth = 1 AND ci.interphr > 0))`;
  const r = await http.fetch(DEFAULT_ENDPOINTS.sda, {
    method: "POST",
    body: new URLSearchParams({ query, format: "JSON+COLUMNNAME" }),
    timeoutMs: 60_000,
  });
  const t = ((await r.json()) as { Table?: unknown[][] }).Table ?? [];
  return t.slice(1).map((row) => ({
    rule: String(row[0]),
    depth: Number(row[1]),
    reason: String(row[2]),
    value: row[3] == null ? null : Number(row[3]),
  }));
}

async function gather(slug: FixtureSlug, cache: Record<string, Reason[]>): Promise<FixtureData> {
  const out = await runFixture(slug);
  const { result, session: s } = out;
  const sites = result.sites ?? [];
  const soils = [];
  for (const site of sites) {
    const row = soilAt(s.units ?? null, s.rows ?? [], site.ll);
    let reasons: Reason[] | null = null;
    if (row?.cokey) reasons = cache[row.cokey] ??= await nrcsReasons(row.cokey);
    soils.push({ rank: site.rank, row, reasons });
  }
  const { polygon: geom } = await fixtureParcel(slug);
  // The screen's own outline is one polygon (the recipe bridges a multi-part record), as index.ts reads it.
  const parcel = polygon(geom.coordinates as Position[][]);
  const routed = [];
  for (const site of sites) {
    const t0 = performance.now();
    const d = buildDriveway(
      routeContext(s),
      s.roads ?? [],
      parcel,
      site.ll,
      `site #${site.rank}`,
      CFG.roadMaxGradePct,
    );
    const ms = performance.now() - t0;
    const rt = d.routes[0];
    const o = d.overLimit;
    routed.push({
      rank: site.rank,
      ms,
      legal: !!rt,
      lengthFt: rt ? rt.metrics.lengthFt : o ? o.metrics.lengthFt : null,
      costMid: rt ? rt.cost.mid : o ? o.cost.mid : null,
    });
  }
  return {
    slug,
    sites,
    valleyFloorFt: result.terrain!.valleyFloorFt,
    sky: result.sky!,
    soils,
    routed,
    firstRouted: !!result.driveway?.routes.length && !result.house,
  };
}

// ---- the re-scoring ----

type Change = "today" | "aspect" | "soilSlope" | "rock" | "sky" | "driveway" | "all";
export const CHANGES: { key: Change; label: string }[] = [
  { key: "today", label: "Today (re-scored)" },
  { key: "aspect", label: "19: aspect 165°" },
  { key: "soilSlope", label: "Septic and foundation without the map unit's slope" },
  { key: "rock", label: "Rock by depth" },
  { key: "sky", label: "Sky dome penalty full at w = 8" },
  { key: "driveway", label: "Driveway as a cost estimate" },
  { key: "all", label: "All five together" },
];

/** The NRCS class from its limiting features without slope: 1 → very limited, above 0 → somewhat, 0 → not. */
const rateWithoutSlope = (reasons: Reason[] | null, rule: string) => {
  const mine = (reasons ?? []).filter((r) => r.rule === rule);
  if (!mine.some((r) => r.depth === 0)) return "unrated" as const;
  const v = Math.max(
    0,
    ...mine.filter((r) => r.depth === 1 && !/^Slope/.test(r.reason)).map((r) => r.value ?? 0),
  );
  return v >= 1 ? ("poor" as const) : v > 0 ? ("workable" as const) : ("fine" as const);
};

/** Rock by depth: full points at ≤ fullCm of bedrock, none at ≥ zeroCm or with no bedrock reported. */
function rockPoints(row: SoilRow | null): number {
  const d = row?.brockdepmin != null && row.brockdepmin !== "" ? +row.brockdepmin : null;
  const { fullCm, zeroCm } = CANDIDATE.rock;
  return d == null ? 0 : K.rock * Math.max(0, Math.min(1, (zeroCm - d) / (zeroCm - fullCm)));
}

function skyScore(sky: FixtureData["sky"], fullW: number): number {
  const [m0, m1] = SKY.magRange;
  let score = Math.max(0, Math.min(1, (sky.mag - m0) / (m1 - m0))) * 100;
  if (sky.dome) score -= Math.min(SKY.domePenaltyMax, SKY.domePenaltyMax * Math.min(1, sky.dome.w / fullW));
  if (sky.coreClear <= 0) score -= SKY.coreBlockedPenalty;
  else if (sky.coreClear < SKY.coreLowDeg) score -= SKY.coreLowPenalty;
  return Math.max(0, Math.round(score));
}

export interface Scored {
  rank: number; // today's rank, the site's identity here
  newRank: number;
  score: number;
  grade: string;
  quality: number;
  cost: number;
  driveway: number;
}

export function rescore(f: FixtureData, change: Change): Scored[] {
  const on = (c: Change) => change === c || change === "all";
  const skyS = on("sky") ? skyScore(f.sky, CANDIDATE.domeFullW) : f.sky.score;
  const rows = f.sites.map((s) => {
    const target = on("aspect") ? CANDIDATE.aspectTargetDeg : K.siteAspectTargetDeg;
    const adiff = Math.min(Math.abs(s.aspectDeg - target), 360 - Math.abs(s.aspectDeg - target));
    const aspectS = s.slopeDeg < SU.flatBelowDeg ? 100 : lerp(adiff, SU.aspectCurve);
    const frostS = lerp(s.elevFt - f.valleyFloorFt, frostCurve(SU.frostHouse, CFG.thermalMinFt));
    const slopeS = lerp(s.slopeDeg, SU.slopeHouse);
    const W = K.weights;
    let quality =
      W.sun * 100 * (s.daylightH ? s.sunH / s.daylightH : 0) +
      W.aspect * aspectS +
      W.frost * frostS +
      W.slope * slopeS +
      W.sky * skyS;
    if (s.flood) quality *= K.sfhaQualityFactor;
    const soil = f.soils.find((x) => x.rank === s.rank)!;
    const c = { ...s.c };
    if (on("soilSlope")) {
      c.septic = K.septic[rateWithoutSlope(soil.reasons, "ENG - Septic Tank Absorption Fields")];
      c.foundation = K.foundation[rateWithoutSlope(soil.reasons, "ENG - Dwellings W/O Basements")];
    }
    if (on("rock")) c.rock = rockPoints(soil.row);
    if (on("driveway")) {
      const r = f.routed.find((x) => x.rank === s.rank)!;
      if (r.costMid != null)
        c.driveway =
          Math.min(
            CANDIDATE.drivewayMaxPoints - CANDIDATE.noLegalRoutePoints,
            r.costMid / CANDIDATE.drivewayDollarsPerPoint,
          ) + (r.legal ? 0 : CANDIDATE.noLegalRoutePoints);
    }
    const cost = Math.min(100, c.septic + c.foundation + c.rock + c.pad + c.driveway);
    // Today's routed #1 is scored as applyRoutedDriveway does: from its rounded quality and cost.
    const score =
      s.rank === 1 && f.firstRouted
        ? Math.round(K.overall.quality * Math.round(quality) + K.overall.cost * (100 - Math.round(cost)))
        : Math.round(K.overall.quality * quality + K.overall.cost * (100 - cost));
    return {
      rank: s.rank,
      newRank: 0,
      score,
      grade: grade(score),
      quality: Math.round(quality),
      cost: Math.round(cost),
      driveway: c.driveway,
    };
  });
  // The app's rerank: by score, descending, stable.
  [...rows].sort((a, b) => b.score - a.score).forEach((r, i) => (r.newRank = i + 1));
  return rows;
}

// ---- the report ----

const fmt = (x: number | null | undefined, d = 0) => (x == null ? "—" : x.toFixed(d));

function fixtureSection(f: FixtureData): string {
  const all = Object.fromEntries(CHANGES.map((c) => [c.key, rescore(f, c.key)])) as Record<Change, Scored[]>;
  const today = all.today;
  const mismatches = f.sites.filter((s) => today.find((x) => x.rank === s.rank)!.score !== s.score);
  const head = `| Site (today's #) | Acres | Today | ${CHANGES.slice(1)
    .map((c) => c.label)
    .join(" | ")} |`;
  const sep = `|---|---|---|${CHANGES.slice(1)
    .map(() => "---")
    .join("|")}|`;
  const cell = (r: Scored, base: Scored) => {
    const moved = r.newRank !== base.newRank || r.grade !== base.grade;
    const txt = `#${r.newRank} ${r.grade} ${r.score}`;
    return moved ? `**${txt}**` : txt;
  };
  const rows = f.sites.map((s) => {
    const base = today.find((x) => x.rank === s.rank)!;
    return `| #${s.rank}${s.compact ? " (shelf)" : ""} | ${s.acres.toFixed(2)} | #${s.rank} ${s.grade} ${s.score} | ${CHANGES.slice(
      1,
    )
      .map((c) =>
        cell(
          all[c.key].find((x) => x.rank === s.rank)!,
          base,
        ),
      )
      .join(" | ")} |`;
  });
  // #1 under each change, with its routed driveway.
  const first = CHANGES.map((c) => {
    const top = all[c.key].find((x) => x.newRank === 1)!;
    const site = f.sites.find((s) => s.rank === top.rank)!;
    const r = f.routed.find((x) => x.rank === top.rank)!;
    return `| ${c.label} | today's #${top.rank} (${site.acres.toFixed(2)} ac${site.compact ? ", shelf" : ""}) | ${top.grade} ${top.score} | ${fmt(r.lengthFt)} ft${r.legal ? "" : " (no route within the grade limit)"} | $${fmt((r.costMid ?? 0) / 1000)}k |`;
  });
  const parts = f.sites.map((s) => {
    const soil = f.soils.find((x) => x.rank === s.rank)!;
    const r = f.routed.find((x) => x.rank === s.rank)!;
    const sl = (rule: string) =>
      (soil.reasons ?? [])
        .filter((x) => x.rule === rule && x.depth === 1 && (x.value ?? 0) >= 0.5)
        .map((x) => x.reason.replace(/ -.*$/, "").replace(/,.*$/, "").toLowerCase())
        .join(", ") || "—";
    return `| #${s.rank} | ${soil.row?.compname ?? "—"} | ${s.c.septic} → ${K.septic[rateWithoutSlope(soil.reasons, "ENG - Septic Tank Absorption Fields")]} | ${sl("ENG - Septic Tank Absorption Fields")} | ${s.c.foundation} → ${K.foundation[rateWithoutSlope(soil.reasons, "ENG - Dwellings W/O Basements")]} | ${soil.row?.brockdepmin ?? "—"} | ${s.c.rock} → ${fmt(rockPoints(soil.row), 1)} | ${fmt(s.driveFt)} | ${fmt(r.lengthFt)}${r.legal ? "" : "*"} | $${fmt((r.costMid ?? 0) / 1000)}k | ${s.c.driveway.toFixed(1)} → ${all.driveway.find((x) => x.rank === s.rank)!.driveway.toFixed(1)} | ${Math.round(r.ms)} |`;
  });
  return `### ${f.slug}

${mismatches.length ? `**Re-scoring today's sites reproduces only ${f.sites.length - mismatches.length} of ${f.sites.length} stored scores:** ${mismatches.map((s) => `#${s.rank} differs by ${today.find((x) => x.rank === s.rank)!.score - s.score}`).join(", ")}.` : `Re-scoring today's sites reproduces all ${f.sites.length} stored scores exactly, so every difference below is the change's own.`}

Each cell: the site's rank, grade and score under that change alone; bold where its rank or grade moves.

${head}
${sep}
${rows.join("\n")}

#1 under each change, and its driveway (routed by the app's router to that site):

| Change | #1 | Grade, score | Driveway | Cost (mid) |
|---|---|---|---|---|
${first.join("\n")}

The parts that move, per site (today → changed). Septic and foundation points: 0 not limited, 20/10 somewhat, 40/25
very limited, 25/12 unrated. "NRCS's limits" are its limiting features at ≥ 0.5. Routed lengths marked * have no
route within the grade limit (the least-steep route's length and cost).

| Site | Soil | Septic | NRCS's septic limits | Foundation | Bedrock (cm) | Rock | Straight-line need (ft) | Routed (ft) | Route cost | Driveway points | Route time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|
${parts.join("\n")}
`;
}

/** Per change, per fixture: does #1 change, how many sites move rank or grade, and the mean score shift. */
function summary(data: FixtureData[]): string {
  const head = `| Change | ${data.map((f) => f.slug).join(" | ")} |`;
  const sep = `|---|${data.map(() => "---").join("|")}|`;
  const rows = CHANGES.slice(1).map((c) => {
    const cells = data.map((f) => {
      const base = rescore(f, "today");
      const now = rescore(f, c.key);
      const top0 = base.find((x) => x.newRank === 1)!.rank;
      const top1 = now.find((x) => x.newRank === 1)!.rank;
      const ranks = now.filter((x) => x.newRank !== base.find((y) => y.rank === x.rank)!.newRank).length;
      const grades = now.filter((x) => x.grade !== base.find((y) => y.rank === x.rank)!.grade).length;
      const shift =
        now.reduce((a, x) => a + x.score - base.find((y) => y.rank === x.rank)!.score, 0) / now.length;
      return `${top1 === top0 ? "same #1" : `**#1 becomes today's #${top1}**`}; ${ranks} rank${ranks === 1 ? "" : "s"}, ${grades} grade${grades === 1 ? "" : "s"} move; mean ${shift >= 0 ? "+" : ""}${shift.toFixed(1)}`;
    });
    return `| ${c.label} | ${cells.join(" | ")} |`;
  });
  return [head, sep, ...rows].join("\n");
}

function report(data: FixtureData[]): string {
  const times = data.flatMap((f) => f.routed.map((r) => r.ms));
  const meanMs = times.reduce((a, b) => a + b, 0) / times.length;
  const maxMs = Math.max(...times);
  return `# A3 scoring analysis: each change alone, on the three fixtures

Batch A, A3 stage 1 (owner, 2026-10-09). A draft for review: **no scoring code changes**, no \`expected.json\` change.
Generated by \`pnpm a3:analysis\` (\`test/tools/a3-analysis.test.ts\`). Each change re-scores every ranked site from its
stored parts with score.ts's arithmetic, then re-ranks and re-grades; the other changes stay as today.

**In scope** (owner): 19, aspect 165°; septic and foundation without the map unit's slope; rock by depth; the sky's
dome penalty de-saturated; the driveway as a cost estimate. **Out:** the 70/30 quality/cost split, which stays: weights
are a preference, not a fact, and become per-person rubric settings in follow-up 41.

## What moves what

${summary(data)}

## The changes as tested

| Change | Today | Candidate |
|---|---|---|
| 19: aspect | Distance from 160° (cells use 165°) | Distance from ${CANDIDATE.aspectTargetDeg}° |
| Septic, foundation | NRCS's class, which includes the map unit's representative slope | NRCS's class rebuilt from its limiting features **without** slope: any feature at 1 → very limited, any above 0 → somewhat, none → not limited; same points (septic 0/20/40, foundation 0/10/25; unrated 25/12). Slope stays in quality's slope term and cost's pad. |
| Rock | ${K.rock} points if bedrock < ${CFG.shallowBedrockCm} cm, else 0 | ${K.rock} × (${CANDIDATE.rock.zeroCm} − depth) / ${CANDIDATE.rock.zeroCm - CANDIDATE.rock.fullCm}, clamped: ${K.rock} at ≤ ${CANDIDATE.rock.fullCm} cm, 0 at ≥ ${CANDIDATE.rock.zeroCm} cm |
| Sky dome penalty | ${SKY.domePenaltyMax} × min(1, w / ${SKY.domePenaltyFullW}) | ${SKY.domePenaltyMax} × min(1, w / ${CANDIDATE.domeFullW}) |
| Driveway | Straight-line: min(${K.drivewayMax}, needed ft / ${K.drivewayFtPerPoint}) + ${K.drivewayOverGrade} if the straight line is over the grade limit; #1 alone re-costed from its routed length (+10 for an easement) | **Every ranked site routed** by the app's router; points = min(${CANDIDATE.drivewayMaxPoints - CANDIDATE.noLegalRoutePoints}, route cost (mid) / $${CANDIDATE.drivewayDollarsPerPoint.toLocaleString("en-US")}) + ${CANDIDATE.noLegalRoutePoints} when no route fits the grade limit (then the least-steep route's cost). $${CANDIDATE.drivewayDollarsPerPoint.toLocaleString("en-US")} a point puts a $150k driveway at the old ${K.drivewayMax}-point maximum. |

The dollars-per-point anchor is a judgment call, like the 70/30 split; tell me if you want a different one.

**Routing every ranked site** took ${Math.round(meanMs)} ms a site on average here (worst ${Math.round(maxMs)} ms), in Node on this
machine; with up to 8 ranked sites that's about ${((meanMs * 8) / 1000).toFixed(1)} s more per screen in the worker before a
phone's slowdown. Stage 2 would route them in the driveway step, which already routes #1.

${data.map(fixtureSection).join("\n")}

## Caveats

- Re-scored from the stored sites, not re-run: a change that would alter which benches the soils step vetoes, or
  how the router treats rock, isn't seen. None of these changes touches either.
- Under the non-driveway changes, the #1 site keeps today's routed driveway points when it's today's #1, and gets
  its straight-line points otherwise; in the app, the driveway step would route the new #1 and re-cost it. The
  driveway column shows that routed figure for whichever site is #1.
- NRCS's limiting features are fetched from SDA for the exact component score.ts used (its cokey), into
  \`tmp/a3/\`. Stage 2 would fetch them in the soils step (a new SDA request, recorded with \`pnpm record:port\`).
`;
}

describe.runIf(import.meta.env.MODE === "a3")("A3 analysis", () => {
  it(
    "ranks the fixtures under each change",
    async () => {
      mkdirSync(DIR, { recursive: true });
      const cachePath = `${DIR}/reasons.json`;
      const cache: Record<string, Reason[]> = existsSync(cachePath)
        ? JSON.parse(readFileSync(cachePath, "utf8"))
        : {};
      const data: FixtureData[] = [];
      for (const slug of FIXTURE_SLUGS) data.push(await gather(slug, cache));
      writeFileSync(cachePath, JSON.stringify(cache, null, 1));
      writeFileSync(DOC, report(data));
    },
    30 * 60_000,
  );
});
