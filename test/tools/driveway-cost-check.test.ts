/**
 * Driveway cost sanity check (owner, 2026-10-11; report only, the first part of follow-up 47). Writes
 * docs/studies/driveway-cost-check.md:
 *  1. each route's cost broken down: length, rise, switchbacks; earthwork in yd³, soil and rock, ordinary road and
 *     switchback benches; stone, fabric, culverts, clearing; cost per foot;
 *  2. the benches of Grayson's $873k route, each with its volume and assumptions, and one checked by hand;
 *  3. the ordinary road's earthwork, checked by hand at one sample;
 *  4. quantity corrections to consider, each one's effect (unit rates unchanged: follow-up 47 waits for the quote);
 *  5. Grayson's 1.28 ac site at 12% and 15% limits, and its route through the neighbours;
 *  6. a proposed rule for when the card should say "no practical route" instead of a six-figure gravel cost.
 * Nothing in lib/ changes.
 *
 *   pnpm dw:cost
 */
import { writeFileSync } from "node:fs";
import { along, length as turfLength } from "@turf/turf";
import { describe, it } from "vitest";
import * as UTM from "@/lib/geo/utm";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { utmToRC } from "@/lib/screen/dem";
import {
  bedrockDepth,
  overLimitSpans,
  routeDetail,
  siteDriveways,
  type RouteContext,
  type SiteDriveway,
  type SiteRoutes,
} from "@/lib/screen/driveway";
import { routeContext, type ScreenSession } from "@/lib/screen/index";
import { chooseDriveway } from "@/lib/screen/score";
import type { UserConfig } from "@/lib/screen/types";
import { M2FT } from "@/lib/screen/util";
import { runFixture } from "../support/scenarios";

const K = SCREEN_CONSTANTS.driveway;
const DOC = "docs/studies/driveway-cost-check.md";
const W = K.benchWidthM;
const YD = K.m3ToYd3;
/** value-ranking.md §4: stages 0–2 ("ready to build"). */
const READY_TO_BUILD = 300_000;
/** A side slope steeper than this needs a full bench: fill won't stand on it (about 1.7:1). */
const FULL_BENCH_DEG = 30;

type Route = NonNullable<SiteDriveway["route"]>;
type Dw = UserConfig["dw"];

interface Breakdown {
  lengthFt: number;
  riseFt: number;
  switchbacks: number;
  culverts: number;
  ordSoilYd: number;
  ordRockYd: number;
  benchSoilYd: number;
  benchRockYd: number;
  stoneT: number;
  fabricSf: number;
  clearAc: number;
  cost: Record<string, number>;
  total: number;
}

/** The engine's own quantities and cost for a route, split into the ordinary road and the switchback benches. */
function current(rt: Route, dw: Dw): Breakdown {
  const m = rt.metrics,
    det = routeDetail(rt);
  const benchYd = (det?.landings ?? []).reduce((t, x) => t + x.cutFillM3, 0) * YD,
    benchRockYd = (det?.landings ?? []).reduce((t, x) => t + x.rockM3, 0) * YD;
  const ordYd = m.earthYd - benchYd;
  const ordRockYd = m.rockYd - benchRockYd; // can exceed ordYd: the engine's rock share can top 100% (§4)
  const wooded = Math.min(1, Math.max(0, (dw.woodedPct || 100) / 100));
  const cost = {
    "Fixed (mobilise, entrance, erosion)": dw.mobilize + dw.entrance + dw.erosion,
    Clearing: m.clearAc * wooded * dw.clearPerAc,
    "Road cut, soil": (ordYd - ordRockYd) * dw.earthSoilPerYd,
    "Road cut, rock": ordRockYd * dw.earthRockPerYd,
    "Benches, soil": (benchYd - benchRockYd) * dw.earthSoilPerYd,
    "Benches, rock": benchRockYd * dw.earthRockPerYd,
    Stone: m.stoneTons * dw.stonePerTon,
    Fabric: m.fabricSf * dw.fabricPerSf,
    Culverts: m.culverts * dw.culvertEach,
  };
  const total = Object.values(cost).reduce((a, b) => a + b, 0);
  return {
    lengthFt: m.lengthFt,
    riseFt: m.riseFt,
    switchbacks: m.switchbacks,
    culverts: m.culverts,
    ordSoilYd: ordYd - ordRockYd,
    ordRockYd,
    benchSoilYd: benchYd - benchRockYd,
    benchRockYd,
    stoneT: m.stoneTons,
    fabricSf: m.fabricSf,
    clearAc: m.clearAc,
    cost,
    total,
  };
}

/** Per 3 m sample of a route: the cell's slope (degrees), soil class, depth to bedrock (m, NaN unknown). */
function samples(rt: Route, ctx: RouteContext, bedrockCm: Float32Array) {
  const d = ctx.dFine,
    soil = ctx.soilMask();
  const line = rt.line;
  const L = turfLength(line, { units: "meters" });
  const out: { slopeDeg: number; soil: number; bedrockM: number }[] = [];
  for (let s = 0; s <= L; s += K.profileStepM) {
    const p = along(line, s, { units: "meters" }).geometry.coordinates;
    const [x, y] = UTM.fwd(p[1]!, p[0]!);
    const [r, c] = utmToRC(d, x, y);
    if (r < 0 || c < 0 || r >= d.h || c >= d.w) continue;
    const i = r * d.w + c;
    if (Number.isNaN(d.z[i]!)) continue;
    out.push({ slopeDeg: ctx.slope[i] || 0, soil: soil[i]!, bedrockM: bedrockCm[i]! / 100 });
  }
  return out;
}

/** The share of a triangular cut of depth H (deepest at the hillside edge) that lies below bedrock at depth b. */
const belowBedrock = (H: number, b: number) => (Number.isFinite(b) && H > b ? ((H - b) / H) ** 2 : 0);

interface Correction {
  name: string;
  /** Applied on top of the ones before it. */
  apply(q: Breakdown, rt: Route, ss: ReturnType<typeof samples>, dw: Dw, flags: Set<string>): Breakdown;
}

/** Recomputes the ordinary road's cut from the samples under the corrections chosen so far. */
function ordinaryCut(ss: ReturnType<typeof samples>, flags: Set<string>, rockMask: boolean) {
  let soil = 0,
    rock = 0;
  for (const x of ss) {
    const t = Math.tan((x.slopeDeg * Math.PI) / 180);
    const half = flags.has("half") && x.slopeDeg < FULL_BENCH_DEG;
    const area = half ? (W * W * t) / 8 : (W * W * t) / 2; // m², a triangle: full bench, or half of it cut
    const H = (half ? W / 2 : W) * t; // its depth at the hillside edge
    const rockShare = flags.has("depth") ? belowBedrock(H, x.bedrockM) : rockMask && x.soil === 2 ? 1 : 0;
    rock += area * rockShare * K.profileStepM;
    soil += area * (1 - rockShare) * K.profileStepM;
  }
  return { soilYd: soil * YD, rockYd: rock * YD };
}

function rebuild(q: Breakdown, dw: Dw): Breakdown {
  const cost = {
    ...q.cost,
    "Road cut, soil": q.ordSoilYd * dw.earthSoilPerYd,
    "Road cut, rock": q.ordRockYd * dw.earthRockPerYd,
    Stone: q.stoneT * dw.stonePerTon,
    Fabric: q.fabricSf * dw.fabricPerSf,
  };
  return { ...q, cost, total: Object.values(cost).reduce((a, b) => a + b, 0) };
}

const CORRECTIONS: Correction[] = [
  {
    name: "Rock only below the bedrock depth",
    apply: (q, _rt, ss, dw, flags) => {
      flags.add("depth");
      const c = ordinaryCut(ss, flags, true);
      return rebuild({ ...q, ordSoilYd: c.soilYd, ordRockYd: c.rockYd }, dw);
    },
  },
  {
    name: `A balanced half bench on side slopes under ${FULL_BENCH_DEG}°`,
    apply: (q, _rt, ss, dw, flags) => {
      flags.add("half");
      const c = ordinaryCut(ss, flags, true);
      return rebuild({ ...q, ordSoilYd: c.soilYd, ordRockYd: c.rockYd }, dw);
    },
  },
  {
    name: "Stone 6 in deep, not 8 in",
    apply: (q, _rt, _ss, dw) => rebuild({ ...q, stoneT: q.stoneT * (6 / 8) }, dw),
  },
  {
    name: "Fabric only on bottomland",
    apply: (q, _rt, ss, dw) =>
      rebuild({ ...q, fabricSf: ss.filter((x) => x.soil === 1).length * K.profileStepM * W * K.m2ToSf }, dw),
  },
];

const k$ = (x: number) => `$${Math.round(x / 1000).toLocaleString("en-US")}k`;
const f0 = (x: number) => Math.round(x).toLocaleString("en-US");
const f1 = (x: number) => x.toFixed(1);
const perFt = (q: Breakdown) => `$${Math.round(q.total / q.lengthFt)}/ft`;

describe.runIf(import.meta.env.MODE === "dw-cost")("driveway cost sanity check", () => {
  it("writes the report", async () => {
    interface Pick {
      label: string;
      slug: "grayson-mud-creek-6273" | "macks-mountain-35-3" | "ferney-creek-52-47A";
      acres: [number, number];
      kind: "within" | "onParcel";
    }
    const PICKS: Pick[] = [
      {
        label: "Grayson 1.28 ac, kept to the parcel (scored)",
        slug: "grayson-mud-creek-6273",
        acres: [1.2, 1.3],
        kind: "onParcel",
      },
      {
        label: "Grayson 1.28 ac, within 10% via the neighbours",
        slug: "grayson-mud-creek-6273",
        acres: [1.2, 1.3],
        kind: "within",
      },
      {
        label: "Grayson 0.24 ac, within 10% via the neighbours (scored)",
        slug: "grayson-mud-creek-6273",
        acres: [0.2, 0.3],
        kind: "within",
      },
      {
        label: "Macks 1.02 ac (#2), within 10% (scored)",
        slug: "macks-mountain-35-3",
        acres: [1.0, 1.05],
        kind: "within",
      },
      {
        label: "Ferney 6.06 ac (#2), within 10% (scored)",
        slug: "ferney-creek-52-47A",
        acres: [6.0, 6.1],
        kind: "within",
      },
    ];
    const runs = new Map<
      string,
      {
        s: ScreenSession;
        ctx: RouteContext;
        routes: SiteRoutes[];
        sites: { acres: number; ll: [number, number]; rank: number }[];
        bedrock: Float32Array;
      }
    >();
    const get = async (slug: Pick["slug"]) => {
      if (!runs.has(slug)) {
        const { result, session: s } = await runFixture(slug);
        const ctx = routeContext(s);
        const sites = result.sites!;
        const routes = siteDriveways(
          ctx,
          s.roads ?? [],
          s.parcel,
          sites.map((x) => x.ll),
          s.config.roadMaxGradePct,
        );
        runs.set(slug, {
          s,
          ctx,
          routes,
          sites,
          bedrock: bedrockDepth(s.units ?? null, s.rows ?? null, s.dFine!, ctx.inside),
        });
      }
      return runs.get(slug)!;
    };

    const rows: {
      pick: Pick;
      rt: Route;
      q: Breakdown;
      steps: Breakdown[];
      ss: ReturnType<typeof samples>;
    }[] = [];
    for (const pick of PICKS) {
      const r = await get(pick.slug);
      const i = r.sites.findIndex((x) => x.acres > pick.acres[0] && x.acres < pick.acres[1]);
      const dw = pick.kind === "within" ? r.routes[i]!.withinLimit : r.routes[i]!.onParcel;
      const rt = dw!.route!;
      const q = current(rt, r.s.config.dw);
      const ss = samples(rt, r.ctx, r.bedrock);
      const flags = new Set<string>();
      const steps: Breakdown[] = [];
      let acc = q;
      for (const c of CORRECTIONS) {
        acc = c.apply(acc, rt, ss, r.s.config.dw, flags);
        steps.push(acc);
      }
      rows.push({ pick, rt, q, steps, ss });
    }

    const out: string[] = [];
    const main = rows[0]!;
    const share = (q: Breakdown, key: string) => `${Math.round((100 * q.cost[key]!) / q.total)}%`;
    out.push(
      "# Driveway cost sanity check (report only)",
      "",
      "Owner, 2026-10-11: Grayson's 1.28 ac site went from $382k (engine 9) to $873k (engine 10), about $147 a foot, and",
      "even $382k looked implausible. This checks the quantities behind the cost, not the unit rates: the Settings' rates",
      "stay until the local quote arrives (follow-up 47). Generated by `pnpm dw:cost` (`test/tools/driveway-cost-check.test.ts`)",
      "at engine 10. Nothing in the engine changes.",
      "",
      "## What drives the $873k",
      "",
      `- **The ordinary road's rock: ${k$(main.q.cost["Road cut, rock"]!)}, ${share(main.q, "Road cut, rock")} of it.** ` +
        `${f0(main.q.ordRockYd)} of its ${f0(main.q.ordRockYd + main.q.ordSoilYd)} yd³ of cut is priced as rock at ` +
        `$${runs.get("grayson-mud-creek-6273")!.s.config.dw.earthRockPerYd}/yd³. The engine prices a road's whole cut as rock wherever the soil map unit has bedrock ` +
        "shallower than `shallowBedrockCm` (100 cm). Pigeonroost, most of Grayson, is mapped with bedrock at 94 cm, so " +
        "almost every foot of the route counts as rock, however shallow the cut there.",
      `- **The cut itself is a full bench everywhere:** 12 ft wide, cut wholly into the hillside (W² tanθ / 2 per metre), ` +
        "with no fill. On the 17–27° slopes Grayson's route crosses, a builder would cut half and fill half on most of " +
        "it, a quarter of the excavation.",
      `- **The switchback benches: ${k$(main.q.cost["Benches, soil"]! + main.q.cost["Benches, rock"]!)}** for ` +
        `${main.q.switchbacks} landings, rock already counted only below the bedrock depth (since PR B).`,
      `- **Stone and fabric: ${k$(main.q.cost.Stone! + main.q.cost.Fabric!)}**: 8 in of stone over the whole 12 ft for the ` +
        "whole length, and fabric under all of it.",
      "",
      "## 1. The breakdown",
      "",
    );
    const keys = Object.keys(main.q.cost);
    out.push(
      `| | ${rows.map((r) => r.pick.label).join(" | ")} |`,
      `|---|${rows.map(() => "---").join("|")}|`,
      `| Length (ft) | ${rows.map((r) => f0(r.q.lengthFt)).join(" | ")} |`,
      `| Rise (ft) | ${rows.map((r) => f0(r.q.riseFt)).join(" | ")} |`,
      `| Switchbacks | ${rows.map((r) => r.q.switchbacks).join(" | ")} |`,
      `| Road cut, soil (yd³) | ${rows.map((r) => f0(r.q.ordSoilYd)).join(" | ")} |`,
      `| Road cut, rock (yd³) | ${rows.map((r) => f0(r.q.ordRockYd)).join(" | ")} |`,
      `| Benches, soil (yd³) | ${rows.map((r) => f0(r.q.benchSoilYd)).join(" | ")} |`,
      `| Benches, rock (yd³) | ${rows.map((r) => f0(r.q.benchRockYd)).join(" | ")} |`,
      `| Stone (tons) | ${rows.map((r) => f0(r.q.stoneT)).join(" | ")} |`,
      `| Fabric (sq ft) | ${rows.map((r) => f0(r.q.fabricSf)).join(" | ")} |`,
      `| Culverts | ${rows.map((r) => r.q.culverts).join(" | ")} |`,
      `| Clearing (acres) | ${rows.map((r) => r.q.clearAc.toFixed(2)).join(" | ")} |`,
      ...keys.map((key) => `| ${key} | ${rows.map((r) => k$(r.q.cost[key]!)).join(" | ")} |`),
      `| **Total (mid)** | ${rows.map((r) => `**${k$(r.q.total)}**`).join(" | ")} |`,
      `| **Per foot** | ${rows.map((r) => `**${perFt(r.q)}**`).join(" | ")} |`,
      "",
      "Unit rates (Settings): soil $12/yd³, rock $90/yd³, stone $38/ton, fabric $0.75/sq ft, culverts $3,500, clearing",
      "$6,000/acre (a 24 ft corridor), entrance $9,000, erosion $3,000, mobilisation $2,500. The totals match the engine's",
      "own cost to the dollar. (Macks #2's negative soil is the engine's rock share topping 100%: §4, correction 1.)",
      "",
    );

    // 2. The benches of the $873k route.
    const det = routeDetail(main.rt)!;
    const r0 = runs.get("grayson-mud-creek-6273")!;
    out.push(
      "## 2. The switchback benches of the $873k route",
      "",
      `Each landing: a ${K.switchbackRadiusFt} ft arc (centreline radius; ${f0(Math.PI * K.switchbackRadiusFt)} ft for a full ` +
        `reversal) then a straight leg of at least ${K.minLegFt} ft, graded so the road holds the limit, the ground at most ` +
        `${K.landingCutFillM} m above or below it. Its volume: at each sample, the depth between the ground and the graded road ` +
        `times a ${f1(W)} m (12 ft) bench, times the distance to the last sample (a prism, the road's own width, no side slopes ` +
        "of the cut or fill). Cut below the soils' depth to bedrock is rock. This is on top of the ordinary road's cut along " +
        "the same stretch (section 3).",
      "",
      "| Landing | At (ft) | Turn | Side slope | Cut and fill (yd³) | Of it rock (yd³) | Cost |",
      "|---|---|---|---|---|---|---|",
      ...det.landings.map(
        (x, n) =>
          `| ${n + 1} | ${f0(x.atM * M2FT)} | ${Math.round(det.path.landings[n]!.turnDeg)}° | ${Math.round(x.sideSlopeDeg)}° | ${f0(x.cutFillM3 * YD)} | ${f0(x.rockM3 * YD)} | ${k$(x.cost)} |`,
      ),
      "",
    );
    // The hand check: the largest bench.
    const big = det.landings.reduce((a, x, n) => (x.cutFillM3 > det.landings[a]!.cutFillM3 ? n : a), 0);
    const Lp = det.path.landings[big]!;
    const pts = det.path.pts;
    const d = r0.ctx.dFine;
    const lines: string[] = [];
    let m3 = 0,
      rock = 0,
      arcM = 0,
      legM = 0;
    for (let n = Lp.from + 1; n <= Lp.end; n++) {
      const a = pts[n - 1]!,
        b = pts[n]!;
      const seg = Math.hypot((b.c - a.c) * d.res, (b.r - a.r) * d.resY);
      const dz = b.z - (b.zd ?? b.z);
      const br = r0.bedrock[Math.round(b.r) * d.w + Math.round(b.c)]! / 100;
      const v = Math.abs(dz) * W * seg;
      const vr = dz > 0 && Number.isFinite(br) ? Math.max(0, dz - br) * W * seg : 0;
      m3 += v;
      rock += vr;
      if (n <= Lp.to) arcM += seg;
      else legM += seg;
      lines.push(
        `| ${n - Lp.from} | ${n <= Lp.to ? "arc" : "leg"} | ${f1(seg)} | ${b.z.toFixed(2)} | ${b.zd!.toFixed(2)} | ${dz >= 0 ? "cut" : "fill"} ${Math.abs(dz).toFixed(2)} | ${Number.isFinite(br) ? br.toFixed(2) : "—"} | ${f1(v)} | ${f1(vr)} |`,
      );
    }
    out.push(
      `**A bench checked by hand: landing ${big + 1}** (the largest). Arc ${f1(arcM)} m (${f0(arcM * M2FT)} ft), leg ${f1(legM)} m ` +
        `(${f0(legM * M2FT)} ft). Each row: the distance from the last sample, the ground, the graded road, the depth, the ` +
        `bedrock depth there, and depth × ${f1(W)} m × distance (m³).`,
      "",
      "| Sample | Part | Distance (m) | Ground (m) | Road (m) | Depth (m) | Bedrock (m) | Volume (m³) | Rock (m³) |",
      "|---|---|---|---|---|---|---|---|---|",
      ...lines,
      "",
      `Sum: ${f1(m3)} m³ = ${f0(m3 * YD)} yd³, of it rock ${f1(rock)} m³ = ${f0(rock * YD)} yd³; the engine has ` +
        `${f0(det.landings[big]!.cutFillM3 * YD)} and ${f0(det.landings[big]!.rockM3 * YD)} yd³. At $12 and $90: ` +
        `${k$((m3 - rock) * YD * 12 + rock * YD * 90)}.`,
      "",
    );

    // 3. The ordinary road, checked at one sample.
    const ss = main.ss;
    const sorted = [...ss].sort((a, b) => a.slopeDeg - b.slopeDeg);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    const t = Math.tan((med.slopeDeg * Math.PI) / 180);
    const H = W * t;
    const atSlope = (lo: number, hi: number) => ss.filter((x) => x.slopeDeg >= lo && x.slopeDeg < hi).length;
    out.push(
      "## 3. The ordinary road's cut",
      "",
      "The engine's rule (`driveway.ts` finish, from the prototype): every 3 m, a full bench across the road's 12 ft at the",
      "ground's slope there, W² tanθ / 2 m² of cross-section, all of it cut, none filled; θ is the terrain's steepest",
      "slope, not the slope across the road. The rock share is the share of the route's length on soil map units with",
      "bedrock shallower than 100 cm, applied to the whole cut (a 2 ft cut on such a unit is all rock).",
      "",
      `Slopes along the $873k route: ${atSlope(0, 15)} samples under 15°, ${atSlope(15, 20)} at 15–20°, ${atSlope(20, 25)} at ` +
        `20–25°, ${atSlope(25, 30)} at 25–30°, ${atSlope(30, 90)} at 30° or more (of ${ss.length}, every 3 m).`,
      "",
      `**Checked by hand at the median sample:** slope ${f1(med.slopeDeg)}°, tan ${t.toFixed(3)}. Cross-section ` +
        `${f1(W)}² × ${t.toFixed(3)} / 2 = ${((W * W * t) / 2).toFixed(2)} m²; over 3 m, ${((W * W * t * 3) / 2).toFixed(2)} m³ = ` +
        `${((W * W * t * 3 * YD) / 2).toFixed(2)} yd³. The cut is ${H.toFixed(2)} m deep at the hillside edge, 0 at the ` +
        `outer edge. Bedrock there: ${Number.isFinite(med.bedrockM) ? `${med.bedrockM.toFixed(2)} m` : "not mapped"}, so ` +
        `${Math.round(100 * belowBedrock(H, med.bedrockM))}% of the cut lies below it; the engine prices ` +
        `${med.soil === 2 ? "all of it" : "none of it"} as rock. As a balanced half bench (cut ${f1(W / 2)} m, fill the rest), ` +
        `${((W * W * t) / 8).toFixed(2)} m² (a quarter), ${((W / 2) * t).toFixed(2)} m deep, ` +
        `${Math.round(100 * belowBedrock((W / 2) * t, med.bedrockM))}% below bedrock.`,
      "",
    );

    // 4. Corrections.
    out.push(
      "## 4. Quantity corrections to consider",
      "",
      "Each applied on top of the ones above it, unit rates unchanged. For your decision; none is in the engine.",
      "",
      `1. **${CORRECTIONS[0]!.name}.** The road's cut is a triangle, deepest at the hillside edge; only the part deeper ` +
        "than the soils' depth to bedrock (`brockdepmin`, inside the parcel) is rock, as the benches already do. Outside " +
        "the parcel the soils aren't queried, so it's soil. (Also fixes the engine's rock share topping 100%: on Macks #2 " +
        "the rock was 4 yd³ more than the whole cut.)",
      `2. **${CORRECTIONS[1]!.name}.** Cut half the width and fill the other half with it, as a builder would on ` +
        `moderate slopes: a quarter of the excavation. Above ${FULL_BENCH_DEG}° fill won't stand, so a full bench stays.`,
      "3. **Stone 6 in deep, not 8 in** (4 in of base and 2 in of surface is a common gravel drive).",
      "4. **Fabric only on bottomland** (NRCS's flooded or wet units): on shallow rocky soils it isn't needed.",
      "5. **Not applied, and the other way: relief culverts.** The engine counts a culvert where the route crosses a " +
        "drainage of 2 ha or more, plus one. A long climbing road also needs cross-drains to take water off it, commonly " +
        "one every 200–400 ft on grades over 5%: about 15–30 on Grayson's 5,940 ft route, $50–100k at the $3,500 rate, " +
        "against today's 2 ($7k). Worth a quote line of its own.",
      "",
      `| Route | Today | ${CORRECTIONS.map((c, n) => `+ ${n + 1}`).join(" | ")} |`,
      `|---|---|${CORRECTIONS.map(() => "---").join("|")}|`,
      ...rows.map(
        (r) =>
          `| ${r.pick.label} | ${k$(r.q.total)} (${perFt(r.q)}) | ${r.steps.map((q) => `${k$(q.total)} (${perFt(q)})`).join(" | ")} |`,
      ),
      "",
      `With all four, the $873k route's road cut is ${f0(rows[0]!.steps.at(-1)!.ordSoilYd)} yd³ of soil and ` +
        `${f0(rows[0]!.steps.at(-1)!.ordRockYd)} yd³ of rock (from ${f0(main.q.ordSoilYd)} and ${f0(main.q.ordRockYd)}).`,
      "",
    );

    // 5. Sensitivity: Grayson's 1.28 ac site at 12% and 15%, and the easement route.
    const g = runs.get("grayson-mud-creek-6273")!;
    const site = g.sites.find((x) => x.acres > 1.2 && x.acres < 1.3)!;
    const sens: string[] = [];
    for (const limit of [10, 12, 15]) {
      const r = siteDriveways(g.ctx, g.s.roads ?? [], g.s.parcel, [site.ll], limit)[0]!;
      for (const [kind, dw] of [
        ["within the limit", r.withinLimit],
        ["kept to the parcel", r.onParcel === r.withinLimit ? null : r.onParcel],
      ] as const) {
        if (!dw?.route) continue;
        const rt = dw.route;
        const q = current(rt, g.s.config.dw);
        const flags = new Set<string>();
        let acc = q;
        const ssr = samples(rt, g.ctx, g.bedrock);
        for (const c of CORRECTIONS) acc = c.apply(acc, rt, ssr, g.s.config.dw, flags);
        const paved = overLimitSpans(rt.profile, 0.12).reduce((t2, [a, b]) => t2 + (b - a), 0) * M2FT;
        const chosen = chooseDriveway(r, g.s.config.roadVetoGradePct) === dw;
        sens.push(
          `| ${limit}% | ${kind}${rt.needsEasement ? " (easement)" : ""}${dw.legal ? "" : ` (over: ${Math.round(rt.maxGrade * 100)}%)`}${chosen ? " **(scored)**" : ""} | ${f0(q.lengthFt)} | ${q.switchbacks} | ${k$(q.total)} (${perFt(q)}) | ${k$(acc.total)} (${perFt(acc)}) | ${limit > 12 ? `${f0(paved)} ft, TBD` : "—"} |`,
        );
      }
    }
    out.push(
      "## 5. Grayson's 1.28 ac site at a steeper limit, and through the neighbours",
      "",
      "Routed again at 12% and 15%. Above 12% a drive is normally paved; there is no paving rate yet, so its length is " +
        'given and its cost is TBD (the ground over 15 m, so it reads high: §3 of the router report). "Corrected" is ' +
        "today's rates with all four corrections.",
      "",
      "| Limit | Route | Length (ft) | Switchbacks | Cost today | Corrected | Paving (over 12%) |",
      "|---|---|---|---|---|---|---|",
      ...sens,
      "",
      `The site sits ${f0(main.q.riseFt)} ft above the road. At 10% that needs at least ${f0(main.q.riseFt / 0.1)} ft of ` +
        `road, at 12% ${f0(main.q.riseFt / 0.12)} ft, at 15% ${f0(main.q.riseFt / 0.15)} ft.`,
      "",
    );

    // 6. The rule.
    const all: { label: string; dw: SiteDriveway; q: Breakdown; corrected: Breakdown }[] = [];
    for (const [slug, r] of runs)
      r.sites.forEach((site2, i) => {
        const dw = chooseDriveway(r.routes[i]!, r.s.config.roadVetoGradePct);
        if (!dw.route) return;
        const q = current(dw.route, r.s.config.dw);
        const flags = new Set<string>();
        let acc = q;
        const ssr = samples(dw.route, r.ctx, r.bedrock);
        for (const c of CORRECTIONS) acc = c.apply(acc, dw.route, ssr, r.s.config.dw, flags);
        all.push({
          label: `${slug.split("-")[0]} #${site2.rank} (${site2.acres.toFixed(2)} ac)`,
          dw,
          q,
          corrected: acc,
        });
      });
    out.push(
      '## 6. When the card should say "no practical route"',
      "",
      "Every fixture site's scored route, today and corrected, per foot and as a share of `budget.readyToBuild` " +
        `($${f0(READY_TO_BUILD)}, value-ranking.md §4):`,
      "",
      "| Site | Length (ft) | Switchbacks | Today | Per foot | Share of ready-to-build | Corrected | Per foot | Share |",
      "|---|---|---|---|---|---|---|---|---|",
      ...all.map(
        (x) =>
          `| ${x.label} | ${f0(x.q.lengthFt)} | ${x.q.switchbacks} | ${k$(x.q.total)} | ${perFt(x.q)} | ${Math.round((100 * x.q.total) / READY_TO_BUILD)}% | ${k$(x.corrected.total)} | ${perFt(x.corrected)} | ${Math.round((100 * x.corrected.total) / READY_TO_BUILD)}% |`,
      ),
      "",
    );
    const trips = (pct: number, which: "q" | "corrected") =>
      all.filter((x) => x[which].total > (pct / 100) * READY_TO_BUILD).map((x) => x.label);
    out.push(
      "**Per foot doesn't separate them:** a short drive carries the fixed $15k (entrance, erosion control, mobilisation) " +
        "over few feet, so Ferney's 439 ft route reads $59/ft corrected, as high as Grayson's worst. **A share of the " +
        "ready-to-build budget does.** Corrected, Grayson's three long routes are about 100% of it on their own, Macks #4 " +
        "is 58%, and nothing else passes 38%.",
      "",
      "**Proposed rule:** when the scored route's cost is over `driveway.impracticalShare` of `budget.readyToBuild`, the " +
        'card says *"No practical route: likely needs an easement or a steeper, paved drive"* in place of the gravel cost, ' +
        "and the gate panel names it. The routed cost stays in the details (it's the honest figure for that alignment), " +
        "and the 12% and 15% alternatives (§5) are what to price with a builder. Proposed `impracticalShare` = 75%.",
      "",
      `- at 75%, corrected quantities: ${trips(75, "corrected").join(", ") || "none"};`,
      `- at 50%, corrected: ${trips(50, "corrected").join(", ") || "none"};`,
      `- at 75% with today's quantities it would trip ${trips(75, "q").length} of ${all.length} sites (${trips(75, "q").join(", ")}), ` +
        "so the rule should follow the quantity corrections, not precede them.",
      "",
      "## 7. What a builder would build at Grayson's 1.28 ac site",
      "",
      "Probably not the 10% road. The site is 338 ft above Mud Creek Ln on a 17–27° hillside. Held to 10–11% it needs " +
        "about 6,000 ft and 12 switchback landings. Allowed 15% with the steep parts paved, it's 2,888 ft and 5 " +
        "switchbacks, about $117k of gravel work corrected plus paving on roughly 2,200 ft (TBD): the alternative to " +
        "price with a builder, if the county allows 15% (follow-up 46 checks Grayson's limit). Through the " +
        "neighbours at 12% it's 4,160 ft with 10 switchbacks and an easement. The screen should say so: the six-figure " +
        "10% cost is real arithmetic on an alignment nobody would choose.",
    );
    writeFileSync(DOC, out.join("\n"));
  }, 3_600_000);
});
