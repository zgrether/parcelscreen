/**
 * A4b PR B (owner, #91 review and its answers, 2026-10-10): the router report. Writes
 * docs/studies/a4b-router-pr-b.md and its drawings (docs/studies/a4b-pr-b-*.svg):
 *  1. routing time per fixture (the whole driveway step: every ranked site, then site #1's own driveway), cold;
 *  2. each candidate's cost against the search without its speed-ups (`exact`);
 *  3. every candidate before (engine 9, docs/studies/a4b-router-before.json) and after: length, cost, switchbacks
 *     and the shortest leg between them;
 *  4. the landings: count, the graded benches' cut and fill, and their cost;
 *  5. the landings refused for a side slope over landingMaxSideSlopeDeg (a run with that limit lifted);
 *  6. before/after drawings on a hillshade for Grayson's #1 and #2 and Macks' #2 (engine 9's ranks).
 *
 *   pnpm a4b:router
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Feature, Polygon, Position } from "geojson";
import { describe, it } from "vitest";
import * as UTM from "@/lib/geo/utm";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { zBilinear as demZ } from "@/lib/screen/dem";
import {
  buildDriveway,
  routeDetail,
  siteDriveways,
  type RouteContext,
  type SiteDriveway,
  type SiteRoutes,
} from "@/lib/screen/driveway";
import { routeContext } from "@/lib/screen/index";
import { chooseDriveway } from "@/lib/screen/score";
import type { LatLon } from "@/lib/screen/util";
import { M2FT } from "@/lib/screen/util";
import { FIXTURE_SLUGS, type FixtureSlug } from "../support/fixtures";
import { runFixture } from "../support/scenarios";

const K = SCREEN_CONSTANTS.driveway;
const DOC = "docs/studies/a4b-router-pr-b.md";
const BEFORE = "docs/studies/a4b-router-before.json";
const SHORT: Record<FixtureSlug, string> = {
  "ferney-creek-52-47A": "ferney",
  "macks-mountain-35-3": "macks",
  "grayson-mud-creek-6273": "grayson",
};
/** Engine 9's ranks drawn (the owner's list). */
const DRAWN: Partial<Record<FixtureSlug, number[]>> = {
  "grayson-mud-creek-6273": [1, 2],
  "macks-mountain-35-3": [2],
};

type XY = [number, number];
const toXY = (p: Position): XY => UTM.fwd(p[1]!, p[0]!);

interface BeforeCand {
  lengthFt: number;
  cost: number;
  switchbacks: number;
  maxGradePct: number;
  legal: boolean;
  easement: boolean;
  same?: boolean;
  line?: Position[];
}
interface BeforeSite {
  rank: number;
  ll: LatLon;
  acres: number;
  within: BeforeCand | null;
  onParcel: BeforeCand | { same: true } | null;
}

// --- Switchbacks measured on a line, independently of the router: the 30 m span ---------------------------------

/**
 * The owner's definition (2026-10-10): a heading change of switchbackTurnDeg or more between the road turnWindowM
 * before a point and turnWindowM after it. Read on the line itself every 3 m, the heading being the direction of the
 * segment there. Runs of such points are one switchback each, placed at the run's middle.
 */
function spanSwitchbacks(line: Position[]): { count: number; atM: number[]; shortestLegFt: number | null } {
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
  const legs = atM.slice(1).map((s, i) => (s - atM[i]!) * M2FT);
  return { count: atM.length, atM, shortestLegFt: legs.length ? Math.min(...legs) : null };
}

/** The legs between the router's own landings: from one landing's turn end to the next one's start, along the path. */
function landingLegs(dw: SiteDriveway | null, ctx: RouteContext): number[] {
  const det = dw?.route ? routeDetail(dw.route) : undefined;
  if (!det) return [];
  const d = ctx.dFine;
  const p = det.path.pts;
  const cum = [0];
  for (let i = 1; i < p.length; i++)
    cum.push(cum[i - 1]! + Math.hypot((p[i]!.c - p[i - 1]!.c) * d.res, (p[i]!.r - p[i - 1]!.r) * d.resY));
  const L = det.path.landings;
  return L.slice(1).map((x, i) => (cum[x.from]! - cum[L[i]!.to]!) * M2FT);
}

// --- Drawings: a hillshade (embedded BMP), the parcel, and the routes (the #91 study's) --------------------------

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
  parcel: Feature<Polygon>,
  title: string,
  lines: { pts: Position[]; colour: string; dash?: string; label: string }[],
  marks: { ll: LatLon; colour: string }[],
): string {
  const all = lines.flatMap((l) => l.pts.map(toXY));
  const pad = 80;
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad,
    x1 = Math.max(...xs) + pad,
    y0 = Math.min(...ys) - pad,
    y1 = Math.max(...ys) + pad;
  const SIZE = 560;
  const scale = SIZE / Math.max(x1 - x0, y1 - y0);
  const Wpx = Math.round((x1 - x0) * scale),
    Hpx = Math.round((y1 - y0) * scale);
  // Hillshade at about 2 px per 3 m cell, sun from the north-west.
  const step = 2,
    gw = Math.ceil(Wpx / step),
    gh = Math.ceil(Hpx / step);
  const px = new Uint8Array(gw * gh);
  const zb = (x: number, y: number) => demZ(ctx.dFine, x, y);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const x = x0 + ((gx + 0.5) * step) / scale,
        y = y1 - ((gy + 0.5) * step) / scale;
      const e = 3;
      const dzdx = (zb(x + e, y) - zb(x - e, y)) / (2 * e);
      const dzdy = (zb(x, y + e) - zb(x, y - e)) / (2 * e);
      const nx = -2 * dzdx, // 2× vertical exaggeration, so the slopes read
        ny = -2 * dzdy,
        nz = 1,
        nl = Math.hypot(nx, ny, nz);
      const lx = -0.5,
        ly = 0.5,
        lz = 0.707,
        ll = Math.hypot(lx, ly, lz);
      const shade = Math.max(0, (nx * lx + ny * ly + nz * lz) / (nl * ll));
      px[gy * gw + gx] = Number.isFinite(shade) ? Math.round(40 + 215 * shade) : 255;
    }
  const sx = (p: XY) => ((p[0] - x0) * scale).toFixed(1),
    sy = (p: XY) => ((y1 - p[1]) * scale).toFixed(1);
  const path = (pts: Position[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${sx(toXY(p))},${sy(toXY(p))}`).join(" ");
  const ring = parcel.geometry.coordinates[0]!;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wpx} ${Hpx + 80}" font-family="sans-serif" font-size="12">
<rect width="${Wpx}" height="${Hpx + 80}" fill="#fff"/>
<image href="data:image/bmp;base64,${bmpBase64(px, gw, gh)}" x="0" y="0" width="${Wpx}" height="${Hpx}" preserveAspectRatio="none" style="image-rendering:pixelated"/>
<path d="${path(ring)}" fill="none" stroke="#e08a00" stroke-width="2"/>
${lines.map((l) => `<path d="${path(l.pts)}" fill="none" stroke="${l.colour}" stroke-width="2.5"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""}/>`).join("\n")}
${marks.map((m) => `<circle cx="${sx(UTM.fwd(m.ll[0], m.ll[1]))}" cy="${sy(UTM.fwd(m.ll[0], m.ll[1]))}" r="6" fill="none" stroke="${m.colour}" stroke-width="2"/>`).join("\n")}
<text x="8" y="${Hpx + 18}" font-weight="bold">${title}</text>
${lines.map((l, i) => `<line x1="${8 + i * 270}" x2="${36 + i * 270}" y1="${Hpx + 40}" y2="${Hpx + 40}" stroke="${l.colour}" stroke-width="3"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""}/><text x="${42 + i * 270}" y="${Hpx + 44}">${l.label}</text>`).join("\n")}
<text x="8" y="${Hpx + 66}" fill="#666">parcel outline orange; circles: switchback landings (after); ${Math.round((x1 - x0) * M2FT)} ft across</text>
</svg>
`;
}

// --- The report -------------------------------------------------------------------------------------------------

const f0 = (x: number) => Math.round(x).toLocaleString("en-US");
const f1 = (x: number) => x.toFixed(1);
const k$ = (x: number) => `$${Math.round(x / 1000)}k`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe.runIf(import.meta.env.MODE === "a4b-router")("A4b PR B router report", () => {
  it("writes the report", async () => {
    const before = JSON.parse(readFileSync(BEFORE, "utf8")) as { fixtures: Record<string, BeforeSite[]> };
    const out: string[] = [];
    const timeRows: string[] = [];
    const costRows: string[] = [];
    const candRows: string[] = [];
    const landRows: string[] = [];
    const refusedRows: string[] = [];
    const drawingsMd: string[] = [];
    let movedMost = { pct: 0, what: "" };

    for (const slug of FIXTURE_SLUGS) {
      const { result, session: s } = await runFixture(slug);
      const sites = result.sites ?? [];
      const limit = s.config.roadMaxGradePct;
      const lls = sites.map((x) => x.ll);
      const roads = s.roads ?? [];
      const cold = () => {
        const b = routeContext(s);
        return { ...b, inside: b.inside.slice(), slope: b.slope.slice() } as RouteContext;
      };
      const timed = (exact: boolean) => {
        const ctx = cold();
        const t0 = performance.now();
        const routes = siteDriveways(ctx, roads, s.parcel, lls, limit, { exact });
        buildDriveway(ctx, roads, s.parcel, lls[0]!, "site #1", limit, { exact });
        return { ms: performance.now() - t0, routes, ctx };
      };
      const normalRuns = [timed(false), timed(false), timed(false)];
      const exactRuns = [timed(true), timed(true)];
      const normal = normalRuns[0]!,
        exact = exactRuns[0]!;
      timeRows.push(
        `| ${SHORT[slug]} | ${sites.length} | ${f1(median(normalRuns.map((r) => r.ms)) / 1000)} s (${normalRuns.map((r) => f1(r.ms / 1000)).join(", ")}) | ${f1(median(exactRuns.map((r) => r.ms)) / 1000)} s |`,
      );

      // 2. Cost against the exact search.
      const pct = (a: number | undefined, b: number | undefined) =>
        a === undefined || b === undefined ? "—" : `${((a / b - 1) * 100).toFixed(1)}%`;
      sites.forEach((site, i) => {
        const n = normal.routes[i]!,
          e = exact.routes[i]!;
        for (const [kind, a, b] of [
          ["within", n.withinLimit?.route?.cost.mid, e.withinLimit?.route?.cost.mid],
          ["on parcel", n.onParcel?.route?.cost.mid, e.onParcel?.route?.cost.mid],
        ] as const) {
          if (a === undefined && b === undefined) continue;
          if (kind === "on parcel" && n.onParcel === n.withinLimit) continue;
          const p = a !== undefined && b !== undefined ? (a / b - 1) * 100 : 0;
          if (Math.abs(p) > Math.abs(movedMost.pct))
            movedMost = { pct: p, what: `${SHORT[slug]} #${site.rank} ${kind}` };
          costRows.push(
            `| ${SHORT[slug]} #${site.rank} ${kind} | ${a === undefined ? "—" : k$(a)} | ${b === undefined ? "—" : k$(b)} | ${pct(a, b)} |`,
          );
        }
      });

      // 3. Every candidate, before (engine 9) and after, matched by the site's position.
      const old = before.fixtures[slug] ?? [];
      const match = (ll: LatLon) =>
        old.find((o) => Math.abs(o.ll[0] - ll[0]) < 2e-6 && Math.abs(o.ll[1] - ll[1]) < 2e-6) ?? null;
      const ctx = normal.ctx;
      sites.forEach((site, i) => {
        const r: SiteRoutes = normal.routes[i]!;
        const o = match(site.ll);
        const chosen = chooseDriveway(r, s.config.roadVetoGradePct);
        for (const [kind, dw, ob] of [
          ["within", r.withinLimit, o?.within ?? null],
          [
            "on parcel",
            r.onParcel === r.withinLimit ? null : r.onParcel,
            o?.onParcel && "lengthFt" in o.onParcel ? o.onParcel : null,
          ],
        ] as const) {
          if (!dw?.route && !ob) continue;
          const rt = dw?.route;
          const legs = landingLegs(dw ?? null, ctx);
          const span = rt ? spanSwitchbacks(rt.line.geometry.coordinates) : null;
          candRows.push(
            `| ${SHORT[slug]} #${o?.rank ?? "–"} → #${site.rank} ${kind}${dw && dw === chosen ? " **(scored)**" : ""} | ` +
              `${ob ? f0(ob.lengthFt) : "—"} → ${rt ? f0(rt.metrics.lengthFt) : "—"} | ` +
              `${ob ? k$(ob.cost) : "—"} → ${rt ? k$(rt.cost.mid) : "—"} | ` +
              `${ob ? ob.switchbacks : "—"} → ${rt ? rt.metrics.switchbacks : "—"} | ` +
              `${span ? span.count : "—"} | ${legs.length ? f0(Math.min(...legs)) : "—"} | ` +
              `${rt ? (dw!.legal ? `≤${limit}%` : `${Math.round(rt.maxGrade * 100)}% (over)`) : "—"} | ${rt ? f1(rt.metrics.maxGradePct) : "—"} |`,
          );
          // 4. The landings.
          const det = rt ? routeDetail(rt) : undefined;
          if (det?.landings.length)
            landRows.push(
              `| ${SHORT[slug]} #${site.rank} ${kind} | ${det.landings.length} | ${f0(det.landings.reduce((t, x) => t + x.cutFillM3, 0))} | ${f0(det.landings.reduce((t, x) => t + x.rockM3, 0))} | ${k$(det.landings.reduce((t, x) => t + x.cost, 0))} | ${det.landings.map((x) => `${f0(x.atM * M2FT)} ft: ${f0(x.cutFillM3)} m³, ${Math.round(x.sideSlopeDeg)}°`).join("; ")} |`,
            );
        }
      });

      // 5. Landings refused for the side slope: route again with the limit lifted, and list those that would sit
      // on steeper ground.
      const lifted = siteDriveways(routeContext(s), roads, s.parcel, lls, limit, {
        landingMaxSideSlopeDeg: 90,
      });
      sites.forEach((site, i) => {
        for (const [kind, dwL, dwN] of [
          ["within", lifted[i]!.withinLimit, normal.routes[i]!.withinLimit],
          ["on parcel", lifted[i]!.onParcel, normal.routes[i]!.onParcel],
        ] as const) {
          const det = dwL?.route ? routeDetail(dwL.route) : undefined;
          for (const x of det?.landings ?? [])
            if (x.sideSlopeDeg > K.landingMaxSideSlopeDeg)
              refusedRows.push(
                `| ${SHORT[slug]} #${site.rank} ${kind} | ${f0(x.atM * M2FT)} ft | ${Math.round(x.sideSlopeDeg)}° | ${x.ll[0].toFixed(5)}, ${x.ll[1].toFixed(5)} | ${dwN?.route ? "the route goes around it" : "no route avoids it"} |`,
              );
        }
      });

      // 6. Drawings.
      for (const rank of DRAWN[slug] ?? []) {
        const o = old.find((x) => x.rank === rank)!;
        const i = sites.findIndex(
          (x) => Math.abs(x.ll[0] - o.ll[0]) < 2e-6 && Math.abs(x.ll[1] - o.ll[1]) < 2e-6,
        );
        const r = normal.routes[i]!;
        for (const [kind, key, dw, ob] of [
          ["within", "within", r.withinLimit, o.within],
          ["on parcel", "onParcel", r.onParcel, o.onParcel && "lengthFt" in o.onParcel ? o.onParcel : null],
        ] as const) {
          if (!dw?.route || !ob?.line) continue;
          if (key === "onParcel" && r.onParcel === r.withinLimit) continue;
          const rt = dw.route;
          const det = routeDetail(rt);
          const spanB = spanSwitchbacks(ob.line),
            spanA = spanSwitchbacks(rt.line.geometry.coordinates);
          const legs = landingLegs(dw, ctx);
          const title =
            `${SHORT[slug]} #${rank} (now #${sites[i]!.rank}), ${kind}: ${f0(ob.lengthFt)} → ${f0(rt.metrics.lengthFt)} ft; ` +
            `switchbacks ${spanB.count} → ${det?.landings.length ?? 0}; shortest leg ${spanB.shortestLegFt != null ? f0(spanB.shortestLegFt) : "—"} → ${legs.length ? f0(Math.min(...legs)) : "—"} ft`;
          const file = `a4b-pr-b-${SHORT[slug]}-${rank}-${key}.svg`;
          writeFileSync(
            `docs/studies/${file}`,
            drawing(
              ctx,
              s.parcel,
              title,
              [
                { pts: ob.line, colour: "#d62828", label: "before (engine 9)" },
                { pts: rt.line.geometry.coordinates, colour: "#1d4ed8", label: "after (this PR)" },
              ],
              (det?.landings ?? []).map((x) => ({ ll: x.ll, colour: "#1d4ed8" })),
            ),
          );
          drawingsMd.push(
            `**${title}.** 30 m-span switchbacks on the line: ${spanB.count} before, ${spanA.count} after.\n\n![${file}](${file})\n`,
          );
        }
      }
    }

    out.push(
      `# A4b PR B: the router, as built`,
      ``,
      `Generated by \`pnpm a4b:router\` (\`test/tools/a4b-router.test.ts\`) from the three fixtures at engine 10. The`,
      `"before" figures are engine 9's (\`${BEFORE}\`, written from main at 55ddad9 before this PR changed anything).`,
      ``,
      `## 1. Routing time (desktop, Node)`,
      ``,
      `The whole driveway step, cold (no estimate cached): every ranked site (both candidates), then site #1's own`,
      `driveway (its two kept routes, the direct track). Three runs each, median first. The exact search is the same`,
      `search without its speed-ups (no inflated or grade-aware estimate), for reference. The owner's budget: 5 s per`,
      `fixture on desktop Node (as A3 measured it); the phone is the owner's check from the preview build.`,
      ``,
      `| Fixture | Sites | Time | Exact search |`,
      `|---|---|---|---|`,
      ...timeRows,
      ``,
      `## 2. Cost against the exact search`,
      ``,
      `The screen's search inflates its A* estimate by ${K.estimateWeight} (\`estimateWeight\`), with the grade-aware`,
      `estimate. Each route's cost (mid) against the exact search's route to the same site. The largest difference:`,
      `${movedMost.what}, ${movedMost.pct.toFixed(1)}%.`,
      ``,
      `| Candidate | This PR | Exact search | Difference |`,
      `|---|---|---|---|`,
      ...costRows,
      ``,
      `## 3. Every candidate, before and after`,
      ``,
      `Matched by the site's position; "#9 → #10" is the site's rank at engine 9 and now. Switchbacks: engine 9's count`,
      `(its 15 m turn windows, halved) → the landings this router built. "30 m span": the owner's definition measured on`,
      `the drawn line itself (a heading change of ${K.switchbackTurnDeg}° or more between ${K.turnWindowM} m before and after`,
      `a point), an independent check of the landing count. "Shortest leg": between two landings, from one turn's end to`,
      `the next one's start, along the route (at least ${K.minLegFt} ft by construction).`,
      ``,
      `| Candidate | Length (ft) | Cost (mid) | Switchbacks | 30 m span | Shortest leg (ft) | Grade | 30 m grade (%) |`,
      `|---|---|---|---|---|---|---|---|`,
      ...candRows,
      ``,
      `## 4. Landings`,
      ``,
      `Each landing is a graded bench: the road holds the grade limit through its ${K.switchbackRadiusFt} ft arc and its`,
      `${K.minLegFt} ft leg, with at most ${K.landingCutFillM} m of cut or fill. Its volume is the cut or fill between the`,
      `ground and the road, a bench (${K.benchWidthM} m) wide; cut below the soils' depth to bedrock is rock. Priced at the`,
      `Settings' earthwork rates and included in the route's earthwork and cost.`,
      ``,
      `| Candidate | Landings | Cut and fill (m³) | Of it rock (m³) | Cost | Each (distance along, volume, side slope) |`,
      `|---|---|---|---|---|---|`,
      ...(landRows.length ? landRows : ["| (none) | | | | | |"]),
      ``,
      `## 5. Landings refused for the side slope`,
      ``,
      `No landing is built where the natural side slope under its arc is over ${K.landingMaxSideSlopeDeg}° (it would need`,
      `retaining walls). Routed again with that limit lifted, these landings would have been used:`,
      ``,
      `| Candidate | At | Side slope | Where | Without it |`,
      `|---|---|---|---|---|`,
      ...(refusedRows.length ? refusedRows : ["| (none on the fixtures) | | | | |"]),
      ``,
      `## 6. Drawings`,
      ``,
      `Hillshade from the 3 m DEM. Red: engine 9's route as drawn. Blue: this PR's, with its landings circled.`,
      ``,
      ...drawingsMd,
    );
    writeFileSync(DOC, out.join("\n"));
  }, 3_600_000);
});
