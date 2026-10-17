/**
 * Driveway validation against real roads (owner, 2026-10-11; report only, no engine change). Writes
 * docs/studies/driveway-validation.md and its drawings:
 *  1. the real roads (test/tools/driveway-validation.roads.json): C, the neighbour's built gravel driveway, and
 *     A+B, the existing cut up Grayson 6273's hillside (approximate);
 *  2. each measured on the 3 m lidar: length, rise, the grade over 15, 30 and 60 m (max and average), switchbacks
 *     (a heading change of 100° or more over 30 m), and the share of its length over 10, 12 and 15%;
 *  3. the router between the same two ends at 10, 12 and 15% limits, measured the same way, drawn over the road;
 *  4. each real road priced with the engine's quantity model (a replica of driveway.ts `finish`, which isn't
 *     exported; checked against the engine on the router's own routes), next to the router's;
 *  5. the neighbour parcel screened as the app would, with its driveway section.
 * Live: it screens a rectangle around both roads and the neighbour parcel against the public services (3DEP, SDA,
 * NC OneMap, …). Nothing is recorded; DEM rasters are never kept.
 *
 *   pnpm dw:val
 */
import { readFileSync, writeFileSync } from "node:fs";
import { along, featureCollection, length as turfLength, lineString, polygon, union } from "@turf/turf";
import type { Feature, LineString, Polygon, Position } from "geojson";
import { describe, it } from "vitest";
import { scored } from "@/lib/screen/derive";
import * as UTM from "@/lib/geo/utm";
import { createHttpClient, realClock } from "@/lib/http";
import { drivewayView } from "@/lib/report/driveway";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { utmToRC, zBilinear } from "@/lib/screen/dem";
import {
  overLimitSpans,
  reliefCulverts,
  roadCut,
  routeDetail,
  routeManyFrom,
  type RouteContext,
} from "@/lib/screen/driveway";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import { routeContext, screen, type ScreenOutput } from "@/lib/screen/index";
import type { LatLon } from "@/lib/screen/util";
import { M2FT, M2_PER_ACRE } from "@/lib/screen/util";

const K = SCREEN_CONSTANTS.driveway;
const DOC = "docs/studies/driveway-validation.md";
const ROADS = "test/tools/driveway-validation.roads.json";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
/** The rectangle screened for the roads' lidar and soils: both roads and Grayson's hillside, with room around. */
const REGION = { S: 36.5822, W: -81.565, N: 36.5868, E: -81.5595 };
const LIMITS = [10, 12, 15];
const GRAYSON = "test/fixtures/grayson-mud-creek-6273";

type XY = [number, number];
type Profile = [number, number][];
const toXY = (p: Position): XY => UTM.fwd(p[1]!, p[0]!);
const llOf = (p: Position): LatLon => [p[1]!, p[0]!];

interface RoadSpec {
  name: string;
  source: string;
  approximate: boolean;
  coordinates: Position[];
}

// --- Measuring a line on the lidar ------------------------------------------------------------------------------

/** The line's ground profile, [m along, elevation m], every 3 m, the ground between cells interpolated. */
function profileOf(ctx: RouteContext, coords: Position[]): Profile {
  const line = lineString(coords);
  const L = turfLength(line, { units: "meters" });
  const out: Profile = [];
  for (let s = 0; s <= L; s += K.profileStepM) {
    const p = along(line, s, { units: "meters" }).geometry.coordinates;
    const [x, y] = toXY(p);
    const z = zBilinear(ctx.dFine, x, y);
    if (Number.isFinite(z)) out.push([s, z]);
  }
  return out;
}

/** The grade (%) over a window of `w` m centred on each sample (shortened at the ends). */
function windowGrades(prof: Profile, w: number): number[] {
  const half = w / 2;
  return prof.map(([s], i) => {
    let a = i,
      b = i;
    while (a > 0 && s - prof[a - 1]![0] <= half) a--;
    while (b < prof.length - 1 && prof[b + 1]![0] - s <= half) b++;
    const run = prof[b]![0] - prof[a]![0];
    return run > 0 ? (Math.abs(prof[b]![1] - prof[a]![1]) / run) * 100 : 0;
  });
}

/**
 * The owner's switchback (2026-10-10): a heading change of switchbackTurnDeg or more between the road turnWindowM
 * before a point and turnWindowM after it, read every 3 m; a run of such points is one (the router study's count).
 */
function spanSwitchbacks(line: Position[]): { count: number; atM: number[] } {
  const xy = line.map(toXY);
  const cum = [0];
  for (let i = 1; i < xy.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(xy[i]![0] - xy[i - 1]![0], xy[i]![1] - xy[i - 1]![1]));
  const L = cum.at(-1)!;
  const headingAt = (s: number) => {
    let k = 0;
    while (k < xy.length - 2 && cum[k + 1]! <= s) k++;
    while (k < xy.length - 2 && cum[k + 1]! - cum[k]! < 1e-9) k++;
    return Math.atan2(xy[k + 1]![1] - xy[k]![1], xy[k + 1]![0] - xy[k]![0]);
  };
  const W = K.turnWindowM;
  const marks: number[] = [];
  for (let s = W; s <= L - W; s += 3) {
    let d = Math.abs(headingAt(s + W) - headingAt(s - W)) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if ((d * 180) / Math.PI >= K.switchbackTurnDeg) marks.push(s);
  }
  const atM: number[] = [];
  let run: number[] = [];
  for (const s of marks) {
    if (run.length && s - run.at(-1)! > 3.01) {
      atM.push((run[0]! + run.at(-1)!) / 2);
      run = [];
    }
    run.push(s);
  }
  if (run.length) atM.push((run[0]! + run.at(-1)!) / 2);
  return { count: atM.length, atM };
}

interface Measured {
  lengthFt: number;
  riseFt: number;
  climbFt: number;
  grade: Record<15 | 30 | 60, { max: number; avg: number }>;
  overShare: Record<number, number>;
  switchbacks: { count: number; atM: number[] };
  profile: Profile;
}

function measure(ctx: RouteContext, coords: Position[], profile = profileOf(ctx, coords)): Measured {
  const L = profile.at(-1)![0];
  let climb = 0;
  for (let i = 1; i < profile.length; i++) climb += Math.max(0, profile[i]![1] - profile[i - 1]![1]);
  const g = (w: number) => {
    const xs = windowGrades(profile, w);
    return { max: Math.max(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length };
  };
  const g30 = windowGrades(profile, K.gradeWindowsM.headline);
  return {
    lengthFt: turfLength(lineString(coords), { units: "meters" }) * M2FT,
    riseFt: Math.abs(profile.at(-1)![1] - profile[0]![1]) * M2FT,
    climbFt: climb * M2FT,
    grade: { 15: g(15), 30: g(30), 60: g(60) },
    overShare: Object.fromEntries(LIMITS.map((p) => [p, g30.filter((x) => x > p).length / g30.length])),
    switchbacks: spanSwitchbacks(coords),
    profile: L > 0 ? profile : profile,
  };
}

// --- Pricing a line with the engine's quantity model ------------------------------------------------------------

interface Priced {
  earthYd: number;
  rockYd: number;
  stoneTons: number;
  fabricSf: number;
  clearAc: number;
  culverts: number;
  relief: number;
  cost: number;
  parts: Record<string, number>;
}

/**
 * driveway.ts `finish` without the router's landings (not exported; this replica is checked against it on the
 * router's own routes): every 3 m, the road's cut from the cell's side slope (half bench under fullBenchSlopeDeg,
 * rock below the soils' bedrock depth), geotextile on bottomland and poorly drained soils, a culvert where it
 * crosses a 2 ha drainage, plus the entrance's, relief culverts by grade, stone, clearing and the fixed costs.
 * A real road's switchbacks are already in its per-sample cut.
 */
function price(ctx: RouteContext, coords: Position[]): Priced {
  const d = ctx.dFine;
  const slope = ctx.slope,
    soil = ctx.soilMask(),
    acc = ctx.flowAcc(),
    bedrock = ctx.bedrockCm?.(),
    wet = ctx.wetSoil?.();
  const streamCells = Math.round(K.streamContributingM2 / (d.res * d.resY));
  const line = lineString(coords);
  const lenM = turfLength(line, { units: "meters" });
  const step = K.profileStepM,
    W = K.benchWidthM;
  const prof: Profile = [];
  let earth = 0,
    rock = 0,
    fabricM = 0,
    crossings = 0,
    prevAcc = 0;
  for (let s = 0; s <= lenM; s += step) {
    const p = along(line, s, { units: "meters" }).geometry.coordinates;
    const [x, y] = toXY(p);
    const [r, c] = utmToRC(d, x, y);
    if (r < 0 || c < 0 || r >= d.h || c >= d.w) continue;
    const i = r * d.w + c;
    const zz = d.z[i]!;
    if (Number.isNaN(zz)) continue;
    const zb = zBilinear(d, x, y);
    prof.push([s, Number.isNaN(zb) ? zz : zb]);
    const cut = roadCut(slope[i] || 0, bedrock?.[i] ?? NaN);
    earth += cut.m2 * step;
    rock += cut.rockM2 * step;
    if (soil[i] === 1 || wet?.[i] === 1) fabricM += step;
    if (acc[i]! >= streamCells && prevAcc < streamCells) crossings++;
    prevAcc = acc[i]!;
  }
  const u = ctx.dw;
  const q = {
    earthYd: earth * K.m3ToYd3,
    rockYd: rock * K.m3ToYd3,
    stoneTons: W * K.stoneDepthM * lenM * K.stoneTPerM3,
    fabricSf: W * fabricM * K.m2ToSf,
    clearAc: (K.clearingWidthM * lenM) / M2_PER_ACRE,
    culverts: crossings + 1,
    relief: reliefCulverts(prof),
  };
  const wooded = Math.min(1, Math.max(0, (u.woodedPct || 100) / 100));
  const parts = {
    "Fixed (mobilise, entrance, erosion)": u.mobilize + u.entrance + u.erosion,
    Clearing: q.clearAc * wooded * u.clearPerAc,
    "Earthwork, soil": (q.earthYd - q.rockYd) * u.earthSoilPerYd,
    "Earthwork, rock": q.rockYd * u.earthRockPerYd,
    Stone: q.stoneTons * u.stonePerTon,
    Fabric: q.fabricSf * u.fabricPerSf,
    Culverts: q.culverts * u.culvertEach,
    "Relief culverts": q.relief * u.reliefCulvertEach,
  };
  return { ...q, parts, cost: Object.values(parts).reduce((a, b) => a + b, 0) };
}

// --- The router between a road's two ends -----------------------------------------------------------------------

interface Routed {
  limit: number;
  coords: Position[];
  measured: Measured;
  landings: number;
  engineCost: number;
  replica: number;
  landingCost: number;
  label: string;
}

/** The cheaper of the engine's two styles at `limit` (buildDriveway's), from one end to the other; null: none. */
function routeAt(ctx: RouteContext, from: LatLon, to: LatLon, limit: number): Routed | null {
  const styles = [
    { maxGrade: limit / 100, wGrade: K.shortest.wGrade, label: K.shortest.label },
    {
      maxGrade: Math.min(K.gentlest.maxGrade, limit / 100),
      wGrade: K.gentlest.wGrade,
      label: K.gentlest.label,
    },
  ];
  let best: ReturnType<typeof routeManyFrom>[number] = null;
  for (const o of styles) {
    const f = routeManyFrom(ctx, [from], [to], o)[0] ?? null;
    if (f && (!best || f.rt.cost.mid < best.rt.cost.mid)) best = f;
  }
  if (!best) return null;
  const rt = best.rt;
  const coords = rt.line.geometry.coordinates;
  const landingCost = (routeDetail(rt)?.landings ?? []).reduce((t, x) => t + x.cost, 0);
  return {
    limit,
    coords,
    measured: measure(ctx, coords, rt.profile as Profile),
    landings: rt.metrics.switchbacks,
    engineCost: rt.cost.mid,
    replica: price(ctx, coords).cost + landingCost,
    landingCost,
    label: rt.label,
  };
}

// --- Drawings: a hillshade (embedded BMP) with the lines (the router study's) -------------------------------------

function bmpBase64(px: Uint8Array, W: number, H: number): string {
  const row = (W * 3 + 3) & ~3,
    size = 54 + row * H;
  const b = Buffer.alloc(size);
  b.write("BM", 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18);
  b.writeInt32LE(-H, 22); // top-down
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * H, 34);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = px[y * W + x]!,
        o = 54 + y * row + x * 3;
      b[o] = b[o + 1] = b[o + 2] = v;
    }
  return b.toString("base64");
}

function drawing(
  ctx: RouteContext,
  outlines: Position[][],
  title: string,
  lines: { pts: Position[]; colour: string; width?: number; dash?: string; label: string }[],
  marks: { ll: LatLon; colour: string }[],
): string {
  const all = lines.flatMap((l) => l.pts.map(toXY));
  const pad = 60;
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad,
    x1 = Math.max(...xs) + pad,
    y0 = Math.min(...ys) - pad,
    y1 = Math.max(...ys) + pad;
  const SIZE = 640;
  const scale = SIZE / Math.max(x1 - x0, y1 - y0);
  const Wpx = Math.round((x1 - x0) * scale),
    Hpx = Math.round((y1 - y0) * scale);
  const step = 2,
    gw = Math.ceil(Wpx / step),
    gh = Math.ceil(Hpx / step);
  const px = new Uint8Array(gw * gh);
  const zb = (x: number, y: number) => zBilinear(ctx.dFine, x, y);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const x = x0 + ((gx + 0.5) * step) / scale,
        y = y1 - ((gy + 0.5) * step) / scale;
      const e = 3;
      const nx = -2 * ((zb(x + e, y) - zb(x - e, y)) / (2 * e)),
        ny = -2 * ((zb(x, y + e) - zb(x, y - e)) / (2 * e)),
        nl = Math.hypot(nx, ny, 1);
      const shade = Math.max(0, (nx * -0.5 + ny * 0.5 + 0.707) / (nl * Math.hypot(0.5, 0.5, 0.707)));
      px[gy * gw + gx] = Number.isFinite(shade) ? Math.round(40 + 215 * shade) : 255;
    }
  const sx = (p: XY) => ((p[0] - x0) * scale).toFixed(1),
    sy = (p: XY) => ((y1 - p[1]) * scale).toFixed(1);
  const path = (pts: Position[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${sx(toXY(p))},${sy(toXY(p))}`).join(" ");
  const legend = lines.map(
    (l, i) =>
      `<line x1="${8 + (i % 3) * 215}" x2="${36 + (i % 3) * 215}" y1="${Hpx + 40 + Math.floor(i / 3) * 18}" y2="${Hpx + 40 + Math.floor(i / 3) * 18}" stroke="${l.colour}" stroke-width="3"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""}/><text x="${42 + (i % 3) * 215}" y="${Hpx + 44 + Math.floor(i / 3) * 18}">${l.label}</text>`,
  );
  const extra = Math.ceil(lines.length / 3) * 18 + 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wpx} ${Hpx + extra}" font-family="sans-serif" font-size="12">
<rect width="${Wpx}" height="${Hpx + extra}" fill="#fff"/>
<image href="data:image/bmp;base64,${bmpBase64(px, gw, gh)}" x="0" y="0" width="${Wpx}" height="${Hpx}" preserveAspectRatio="none" style="image-rendering:pixelated"/>
${outlines.map((ring) => `<path d="${path(ring)}" fill="none" stroke="#e08a00" stroke-width="1.5"/>`).join("\n")}
${lines.map((l) => `<path d="${path(l.pts)}" fill="none" stroke="${l.colour}" stroke-width="${l.width ?? 2.5}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""} stroke-linejoin="round"/>`).join("\n")}
${marks.map((m) => `<circle cx="${sx(UTM.fwd(m.ll[0], m.ll[1]))}" cy="${sy(UTM.fwd(m.ll[0], m.ll[1]))}" r="6" fill="none" stroke="${m.colour}" stroke-width="2"/>`).join("\n")}
<text x="8" y="${Hpx + 18}" font-weight="bold">${title}</text>
${legend.join("\n")}
<text x="8" y="${Hpx + extra - 8}" fill="#666">Hillshade of the 3 m lidar; parcel outlines orange; ${Math.round((x1 - x0) * M2FT)} ft across</text>
</svg>
`;
}

// --- The report -------------------------------------------------------------------------------------------------

const f0 = (x: number) => Math.round(x).toLocaleString("en-US");
const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const k$ = (x: number) => `$${Math.round(x / 1000)}k`;
const perFt = (cost: number, ft: number) => `$${Math.round(cost / ft)}/ft`;

function measuredRow(what: string, m: Measured, extra: string): string {
  return (
    `| ${what} | ${f0(m.lengthFt)} | ${f0(m.riseFt)} (${f0(m.climbFt)} climbed) | ` +
    `${f1(m.grade[15].max)} / ${f1(m.grade[30].max)} / ${f1(m.grade[60].max)} | ` +
    `${f1(m.grade[15].avg)} / ${f1(m.grade[30].avg)} / ${f1(m.grade[60].avg)} | ${m.switchbacks.count} | ` +
    `${LIMITS.map((p) => pct(m.overShare[p]!)).join(" / ")} | ${extra} |`
  );
}

type Pair = { real: Measured; routes: (Routed | null)[]; priced: Priced };

/** The conclusions: the numbers from this run, the readings mine (they are proposals; no engine change here). */
function conclusions(c: Pair, ab: Pair): string[] {
  const [c10, c12, c15] = c.routes,
    [ab10, ab12, ab15] = ab.routes;
  const legs = (m: Measured) =>
    m.switchbacks.atM.slice(1).map((x, i) => Math.round((x - m.switchbacks.atM[i]!) * M2FT));
  const landingShare = (r: Routed | null | undefined) => (r ? r.landingCost / r.engineCost : 0);
  const reliefShare = c.priced.parts["Relief culverts"]! / c.priced.cost;
  return [
    "## 6. Conclusions",
    "",
    "**Caveats first.** Every grade here is the bare ground under the line on the 3 m lidar, as the card reads it: a " +
      "built road's own grade reads about 1–4 points lower once cut and fill smooth it (the card's note; follow-up 48). " +
      "The lidar's date against the roads' is unknown, though both cuts show in it as benches. C was traced from the " +
      "orthophoto and A+B from the lidar alone, then both snapped onto their bench; a few metres of error across a " +
      "30° slope moves a 15 m grade a lot, so the 30 and 60 m windows are the ones to read.",
    "",
    "**What grade local practice builds here.** Far steeper than our 10% default.",
    `- C, the neighbour's built drive, climbs ${f0(c.real.riseFt)} ft in ${f0(c.real.lengthFt)} ft: ${f1(c.real.grade[30].avg)}% on ` +
      `average over 30 m, ${f1(c.real.grade[60].max)}% at its steepest over 60 m, with ${pct(c.real.overShare[15]!)} of its ` +
      "length over 15%. That's set by its two ends (the gate and the pad), not by the trace. You know it as gravel; in " +
      "the orthophoto its steepest stretches read dark, like asphalt or chip seal, which is worth a look on the visit.",
    `- A+B, the older cut up 6273, averages ${f1(ab.real.grade[30].avg)}% over 30 m with ${pct(ab.real.overShare[15]!)} of its ` +
      `length over 15%.`,
    "- **Both would fail our own 20% veto,** read the way the veto reads it (ground over 30 m): C at " +
      `${f1(c.real.grade[30].max)}%, A+B at ${f1(ab.real.grade[30].max)}%. Even allowing the 1–4 point ground-vs-road gap, C's ` +
      "steepest stretches are over 20%.",
    "- **Reading:** on this hillside, roads are built at 15–20% with short steeper pitches, not 10%. A 10% limit is a " +
      "comfort target (and a sensible one for a long gravel drive), not a description of what gets built.",
    "",
    "**Does the router's alignment look like the real road?** No, not at 10–12%.",
    `- C: the real road has ${c.real.switchbacks.count} switchback in ${f0(c.real.lengthFt)} ft. The router at 10% needs ` +
      `${c10 ? `${f0(c10.measured.lengthFt)} ft and ${c10.landings} landings` : "no route"}; at 12% ` +
      `${c12 ? `${f0(c12.measured.lengthFt)} ft and ${c12.landings}` : "none"}; at 15% ` +
      `${c15 ? `${f0(c15.measured.lengthFt)} ft and ${c15.landings}` : "none"}. The drawing shows why: under a hard cap the ` +
      "router builds ladders of short legs, where the real road takes one sweeping hairpin and climbs the pitches " +
      "directly.",
    `- A+B is closer at 15%: ${ab15 ? `${f0(ab15.measured.lengthFt)} ft with ${ab15.landings} landings` : "no route"}, ` +
      `against the real road's ${f0(ab.real.lengthFt)} ft and ${ab.real.switchbacks.count} switchbacks (legs of ` +
      `${legs(ab.real).join(", ")} ft). At 10% it's ${ab10 ? `${f0(ab10.measured.lengthFt)} ft with ${ab10.landings} landings` : "no route"}.`,
    "- **Reading:** at 15% the router resembles the old access road; at 10% it builds a road neither of these is.",
    "",
    "**Is the cost model plausible?** Per foot, yes; in total, only when the alignment is.",
    `- Priced with the engine's model, C comes to ${k$(c.priced.cost)} (${perFt(c.priced.cost, c.real.lengthFt)}) and A+B ` +
      `to ${k$(ab.priced.cost)} (${perFt(ab.priced.cost, ab.real.lengthFt)}). The router's routes run at a similar $45–80/ft; ` +
      "their totals (up to " +
      `${k$(Math.max(...[...c.routes, ...ab.routes].map((r) => r?.engineCost ?? 0)))}) come from their length, not the rates.`,
    `- Two things look high. Relief culverts are ${pct(reliefShare)} of C's price: at its grades the rule asks for one every ` +
      "150 ft, at the full culvert rate. Your quote's relief-pipe rate (`dw.reliefCulvertEach`) will tell. And the " +
      `router's landings: ${pct(landingShare(ab12))} of A+B's 12% route (${ab12 ? k$(ab12.landingCost) : "-"} for ${ab12?.landings ?? 0} ` +
      "landings) and " +
      `${pct(landingShare(c10))} of C's 10% route. A graded bench up to 3 m deep across the full 12 ft on a steep side ` +
      "slope prices each switchback at $3–16k; the real roads' hairpins are in their ordinary cut.",
    "- Not priced at all: paving. If C's steep stretches are surfaced, its real cost is above this.",
    "",
    "**Constants the comparison suggests changing** (proposals for you; nothing changed here):",
    "1. **The grade limit default: 10% → 15%** for screening this terrain, keeping 10% as an option. The over-limit term " +
      'and the "no practical drive" rule then start from what\'s actually built.',
    "2. **Short steep pitches:** let a route exceed its limit for a short stretch (e.g. up to limit + 5 for at most " +
      "30 m) at a cost, rather than forbidding it. C's shape (one hairpin, a few steep pitches) is out of the " +
      "router's reach today: its pitches are over the 20% veto, let alone a 10–15% cap.",
    "3. **Landings: fewer and cheaper.** Raise the landing's search cost (30 m now) so a ladder of short legs loses to " +
      "a longer, steadier line, and price a landing as a half bench like the ordinary road rather than a full-width " +
      "cut or fill up to 3 m. A+B has legs as short as 59 ft (an S-curve), so the 100 ft minimum leg is " +
      "not the constraint; the number of landings is.",
    "4. **The veto at 20% on ground grade** would reject the neighbour's real drive. Either read it on the road's " +
      "grade (follow-up 48) or raise it to about 25% until then.",
    "5. **Relief culverts:** keep the count, but price them with the quote's small-pipe rate.",
  ];
}

/**
 * The comparison at the defaults since #103's decisions (owner, 2026-10-11): the 15% limit, the 25% veto, paving over
 * paveAbovePct shown. The router itself didn't change, so its routes at 15% are the ones above; what changes is which
 * is the default, the veto, and what the card says.
 */
function atDefaults(c: Pair, ab: Pair): string[] {
  const L = DEFAULT_USER_CONFIG.roadMaxGradePct,
    V = DEFAULT_USER_CONFIG.roadVetoGradePct;
  const at = (p: Pair) => p.routes[LIMITS.indexOf(L)] ?? null;
  const paved = (prof: Profile) =>
    overLimitSpans(prof, K.paveAbovePct / 100).reduce((t, [a, b]) => t + (b - a), 0) * M2FT;
  const row = (name: string, p: Pair) => {
    const r = at(p);
    return (
      `| ${name} | ${f0(p.real.lengthFt)} ft, ${p.real.switchbacks.count} switchback${p.real.switchbacks.count === 1 ? "" : "s"}, ` +
      `~${f0(paved(p.real.profile))} ft over ${K.paveAbovePct}% | ` +
      (r
        ? `${f0(r.measured.lengthFt)} ft, ${r.landings} landings, ~${f0(paved(r.measured.profile))} ft over ${K.paveAbovePct}%, ` +
          `${k$(r.engineCost)} | ${pct(r.landingCost / r.engineCost)} | `
        : "no route | | ") +
      `${f1(p.real.grade[30].max)}% (${p.real.grade[30].max > V ? "vetoed" : "allowed"}) |`
    );
  };
  const ladder = (p: Pair) => (at(p)?.landings ?? 0) > p.real.switchbacks.count + 1;
  const share = (p: Pair) => {
    const r = at(p);
    return r ? r.landingCost / r.engineCost : 0;
  };
  const both = [c, ab];
  return [
    `## 7. At the new defaults (${L}% limit, ${V}% veto; engine ${ENGINE_VERSION})`,
    "",
    "The router is unchanged, so its routes at the default are the 15% rows above; what changed is the default, the " +
      "veto, and that every card now shows its length over the paving grade.",
    "",
    `| Road | The real road | The router at ${L}% | Landings' share of its cost | The real road's steepest 30 m, at the ${V}% veto |`,
    "|---|---|---|---|---|",
    row("C", c),
    row("A+B", ab),
    "",
    `- **Ladders:** ${both.some(ladder) ? `yes, still: C's route at ${L}% has ${at(c)?.landings ?? 0} landings where the real road has ${c.real.switchbacks.count} switchback` : "no longer"}. ` +
      `On A+B the router is close (${at(ab)?.landings ?? 0} landings against ${ab.real.switchbacks.count} switchbacks).`,
    `- **Landing share:** ${pct(share(c))} of C's route and ${pct(share(ab))} of A+B's, ` +
      `${both.every((p) => share(p) <= 0.4) ? "both under the owner's ~40% threshold" : "over the owner's ~40% threshold"}.`,
    `- **The veto:** both real roads still exceed ${V}% over 30 m on the ground (C ${f1(c.real.grade[30].max)}%, A+B ` +
      `${f1(ab.real.grade[30].max)}%); the gap between ground and road grade is follow-up 48's.`,
    `- **The owner's rule** (#103 decisions): ${both.some(ladder) || both.some((p) => share(p) > 0.4) ? "the router still builds ladders, so landing and pitch changes are proposed as a follow-up (in the PR)" : "neither condition holds; no follow-up needed"}.`,
  ];
}

describe.runIf(import.meta.env.MODE === "dw-val")("driveway validation against real roads", () => {
  it("writes the report", async () => {
    const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
      Symbol.for("parcelscreen.liveFetch")
    ]!;
    const withUA: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("User-Agent", BROWSER_UA);
      return live(input, { ...init, headers });
    };
    const http = createHttpClient({ env: "node", fetchImpl: withUA, clock: realClock });
    const roads = JSON.parse(readFileSync(ROADS, "utf8")) as {
      c: RoadSpec;
      ab: RoadSpec;
      neighbour: { name: string; parnos: string[] };
    };

    // The roads' lidar and soils: the rectangle around them, screened as a parcel would be.
    const { S, W, N, E } = REGION;
    const rect: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [W, S],
          [E, S],
          [E, N],
          [W, N],
          [W, S],
        ],
      ],
    };
    const region = await screen({ polygon: rect, config: DEFAULT_USER_CONFIG }, undefined, { http });
    const ctx = routeContext(region.session);

    // The neighbour parcel by PIN (outline only), screened as the app would.
    const q = new URLSearchParams({
      where: roads.neighbour.parnos.map((p) => `parno='${p}'`).join(" OR "),
      outFields: "parno",
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
    });
    const nc = (await (
      await http.fetch(`${DEFAULT_USER_CONFIG.endpoints.parcels[0]}/query?${q}`, { timeoutMs: 60_000 })
    ).json()) as { features: Feature<Polygon>[] };
    const pieces = nc.features.map((f) => polygon(f.geometry.coordinates));
    const merged = pieces.length > 1 ? union(featureCollection(pieces))! : pieces[0]!;
    if (merged.geometry.type !== "Polygon") throw new Error("the neighbour's pieces don't make one polygon");
    const neighbourPoly = merged.geometry as Polygon;
    const neighbour: ScreenOutput = await screen(
      { polygon: neighbourPoly, config: DEFAULT_USER_CONFIG },
      undefined,
      { http },
    );

    // Grayson 6273's site #1 and its scored routes (expected.json, this engine).
    const gray = JSON.parse(readFileSync(`${GRAYSON}/expected.json`, "utf8")) as {
      run: { sites: { ll: LatLon; acres: number }[]; driveway: Record<string, unknown> };
    };
    const grayInput = JSON.parse(readFileSync(`${GRAYSON}/input.json`, "utf8")) as {
      polygon: { geometry?: Polygon } & Polygon;
    };
    const grayRing = (grayInput.polygon.geometry ?? grayInput.polygon).coordinates[0]!;
    const grayDw = gray.run.driveway as {
      overLimit?: { line: Feature<LineString>; metrics: { lengthFt: number } };
      routes: { line: Feature<LineString>; metrics: { lengthFt: number } }[];
    };
    const graySite = gray.run.sites[0]!;

    const out: string[] = [
      "# Driveway validation against real roads",
      "",
      "Generated by `pnpm dw:val` (`test/tools/driveway-validation.test.ts`), live against the public services. Report " +
        "only: no engine change. The owner's request (2026-10-11): check the router and the cost model against a built " +
        "road on the hillside beside Grayson 6273.",
      "",
      "## 1. The roads",
      "",
    ];
    for (const r of [roads.c, roads.ab])
      out.push(
        `- **${r.name}**${r.approximate ? " (approximate)" : ""}: ${r.source} Start ${llOf(r.coordinates[0]!)
          .map((x) => x.toFixed(5))
          .join(", ")}, end ${llOf(r.coordinates.at(-1)!)
          .map((x) => x.toFixed(5))
          .join(", ")}.`,
      );
    out.push(
      "",
      `Neither is mapped in OpenStreetMap (checked 2026-10-11). The lidar and soils are the screen's own: a rectangle (${S}–${N}, ${W}–${E}) ` +
        `screened at ${region.result.demResM ? f1(region.result.demResM) : "?"} m, so the slope, soils, bedrock depth and drainage are what the ` +
        "engine reads.",
      "",
    );

    const sections: string[] = [];
    const drawings: string[] = [];
    const costRows: string[] = [];
    const checkRows: string[] = [];
    const summary: Record<string, { real: Measured; routes: (Routed | null)[]; priced: Priced }> = {};

    for (const [key, r] of [
      ["c", roads.c],
      ["ab", roads.ab],
    ] as const) {
      const real = measure(ctx, r.coordinates);
      const priced = price(ctx, r.coordinates);
      const from = llOf(r.coordinates[0]!),
        to = llOf(r.coordinates.at(-1)!);
      const routes = LIMITS.map((p) => routeAt(ctx, from, to, p));
      summary[key] = { real, routes, priced };
      sections.push(
        `### ${r.name}`,
        "",
        "| Line | Length (ft) | Rise (ft) | Max grade over 15 / 30 / 60 m (%) | Average over 15 / 30 / 60 m (%) | Switchbacks | Length over 10 / 12 / 15% (30 m) | Cost (engine's model) |",
        "|---|---|---|---|---|---|---|---|",
        measuredRow("**The real road**", real, `${k$(priced.cost)} (${perFt(priced.cost, real.lengthFt)})`),
        ...routes.map((rt, i) =>
          rt
            ? measuredRow(
                `Router at ${LIMITS[i]}% (${rt.label}; ${rt.landings} landing${rt.landings === 1 ? "" : "s"})`,
                rt.measured,
                `${k$(rt.engineCost)} (${perFt(rt.engineCost, rt.measured.lengthFt)})`,
              )
            : `| Router at ${LIMITS[i]}% | no route within the limit | | | | | | |`,
        ),
        "",
      );
      costRows.push(
        `| ${r.name} | ${f0(real.lengthFt)} | ${Object.values(priced.parts)
          .map((v) => k$(v))
          .join(" | ")} | **${k$(priced.cost)}** | ${perFt(priced.cost, real.lengthFt)} |`,
      );
      for (const rt of routes)
        if (rt)
          checkRows.push(
            `| ${key === "c" ? "C" : "A+B"} at ${rt.limit}% | ${k$(rt.engineCost)} | ${k$(rt.replica)} (of which landings ${k$(rt.landingCost)}) | ${f1(((rt.replica - rt.engineCost) / rt.engineCost) * 100)}% |`,
          );
      const colours = ["#1f6feb", "#2da44e", "#cf222e"];
      const lines = [
        {
          pts: r.coordinates,
          colour: "#111",
          width: 4,
          label: r.approximate ? "the real road (approximate)" : "the real road",
        },
        ...routes.flatMap((rt, i) =>
          rt
            ? [
                {
                  pts: rt.coords,
                  colour: colours[i]!,
                  dash: i ? "6 4" : undefined,
                  label: `router at ${LIMITS[i]}%`,
                },
              ]
            : [],
        ),
      ];
      if (key === "ab") {
        const scored = grayDw.overLimit ?? grayDw.routes[0];
        if (scored)
          lines.push({
            pts: scored.line.geometry.coordinates,
            colour: "#8250df",
            width: 2,
            dash: "2 3",
            label: `Grayson #1's scored route (${f0(scored.metrics.lengthFt)} ft)`,
          });
      }
      const file = `docs/studies/driveway-validation-${key}.svg`;
      writeFileSync(
        file,
        drawing(
          ctx,
          key === "c" ? [neighbourPoly.coordinates[0]!] : [grayRing, neighbourPoly.coordinates[0]!],
          r.name,
          lines,
          key === "ab" ? [{ ll: graySite.ll, colour: "#8250df" }] : [],
        ),
      );
      drawings.push(`![${r.name}](${file.replace("docs/studies/", "")})`, "");
    }

    out.push(
      "## 2. Measured on the lidar, against the router between the same ends",
      "",
      "Grades are the ground's under each line, between the cells, as the card reads them. Switchbacks are counted on " +
        `each line the same way: a heading change of ${K.switchbackTurnDeg}° or more over ${2 * K.turnWindowM} m. The ` +
        "router's own landing count is in brackets.",
      "",
      ...sections,
      "## 3. Drawings",
      "",
      ...drawings,
      "## 4. The real roads priced with the engine's quantity model",
      "",
      "Today's unit rates (Settings), the corrected quantities (#100); a real road's switchbacks are in its per-sample " +
        "cut, so no landing benches are added.",
      "",
      `| Road | Length (ft) | ${Object.keys(summary.c!.priced.parts).join(" | ")} | Total | Per ft |`,
      `|---|---|${Object.keys(summary.c!.priced.parts)
        .map(() => "---")
        .join("|")}|---|---|`,
      ...costRows,
      "",
      "**The replica against the engine,** on the router's own routes (the replica plus the engine's landing benches):",
      "",
      "| Route | Engine | Replica | Difference |",
      "|---|---|---|---|",
      ...checkRows,
      "",
    );

    // The neighbour, screened.
    const nr = scored(neighbour.result);
    const v = drivewayView(neighbour.result);
    out.push(
      "## 5. The neighbour parcel, screened",
      "",
      `${roads.neighbour.name}, PINs ${roads.neighbour.parnos.join(" + ")}: ${f1(nr.acres)} ac, verdict ${nr.verdict}. ` +
        `Sites: ${(nr.sites ?? []).map((x) => `#${x.rank} ${x.acres.toFixed(2)} ac, score ${x.score}${x.driveFt ? `, ${f0(x.driveFt)} ft of driveway` : ""}`).join("; ") || "none"}.`,
      "",
    );
    // Where the screen enters, against where the real drive ends (the pad).
    const cEnd = toXY(roads.c.coordinates.at(-1)!);
    const ftTo = (ll: LatLon) => {
      const [x, y] = UTM.fwd(ll[0], ll[1]);
      return f0(Math.hypot(x - cEnd[0], y - cEnd[1]) * M2FT);
    };
    const s1 = nr.sites?.[0];
    const e1 = nr.driveway?.entrances[0];
    if (s1 && e1)
      out.push(
        `The screen's site #1 is ${ftTo(s1.ll)} ft from the end of C (the pad), and its driveway comes from E1 ` +
          `(${e1.name}), ${ftTo(e1.ll)} ft from the pad, not up C from Mud Creek Rd: the Census roads include one ` +
          "at the top of this parcel. The card as it reads:",
        "",
      );
    if (v) {
      if (v.entrances) out.push(`> ${v.entrances}`, ">");
      if (v.note) out.push(`> ${v.note}`, ">");
      for (const rv of [...(v.overLimit ? [v.overLimit] : []), ...v.routes]) {
        out.push(`> **${rv.title}** ${rv.from} · ${rv.cost}`);
        for (const row of rv.rows)
          out.push(`> - ${row.label}: ${row.value}${row.strong ? ` **${row.strong}**` : ""}`);
        out.push(">");
      }
    }
    out.push("", ...conclusions(summary.c!, summary.ab!), "", ...atDefaults(summary.c!, summary.ab!), "");
    // Sections after the tool's own, from "## 8.", are written by hand (the drift test, owner 2026-10-15): kept.
    const old = readFileSync(DOC, "utf8");
    const at = old.indexOf("\n## 8.");
    writeFileSync(DOC, out.join("\n") + (at >= 0 ? old.slice(at) : ""));
  }, 900_000);
});
