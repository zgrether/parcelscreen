/**
 * The drift test (owner, 2026-10-15; docs/studies/driveway-validation.md §8): is a drawn drive's steepest 30 m grade
 * the drive, or the line drifting off the roadbed onto the slope beside it? On a fixture's 3 m lidar (the screen's own,
 * offline from its recording), along a line:
 *  - its 30 m grades, the stretch over the veto (25%) around the steepest, and its heading through it;
 *  - the cross-slope under the stretch (±2 m), and a few metres either side;
 *  - the line shifted ±2, ±4 and ±6 m perpendicular: its steepest 30 m and its length over the veto;
 *  - best-fitting lines: at every 3 m, the middle of the flattest 4 m band across, smoothed over 15 m.
 * The basis for snapping a drawn drive onto its roadbed (phase-0.md §8's follow-up). Report only: writes
 * tmp/study-drift/<fixture>-<line>.md.
 *
 *   pnpm study:drift grayson-mud-creek-6273 c          a road in driveway-validation.roads.json
 *   pnpm study:drift grayson-mud-creek-6273 my.geojson   a LineString, or a Feature of one, [lon, lat]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { along, length as turfLength, lineOffset, lineString } from "@turf/turf";
import type { Feature, LineString, Position } from "geojson";
import { describe, it } from "vitest";
import * as UTM from "@/lib/geo/utm";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { zBilinear } from "@/lib/screen/dem";
import type { Dem } from "@/lib/screen/types";
import { routeContext } from "@/lib/screen/index";
import { PROTOTYPE_FIXTURE_SLUGS, type PrototypeSlug } from "../support/fixtures";
import { runFixture } from "../support/scenarios";
import roads from "./driveway-validation.roads.json";

const STEP = SCREEN_CONSTANTS.driveway.profileStepM; // 3 m, as the screen samples a route
const WINDOW_M = SCREEN_CONSTANTS.driveway.gradeWindowsM.headline; // 30 m
const VETO = DEFAULT_USER_CONFIG.roadVetoGradePct; // 25%
const SHIFTS_M = [-6, -4, -2, 0, 2, 4, 6];
const FT = 3.28084;

type Prof = [number, number][];

/** The line named on the command line: a road of the study's, or a GeoJSON file. */
function lineOf(arg: string): Position[] {
  const road = (roads as Record<string, { coordinates?: Position[] }>)[arg];
  if (road?.coordinates) return road.coordinates;
  const g = JSON.parse(readFileSync(arg, "utf8")) as LineString | Feature<LineString>;
  const geom = "geometry" in g ? g.geometry : g;
  if (geom?.type !== "LineString") throw new Error(`${arg}: not a road in the study, nor a LineString`);
  return geom.coordinates;
}

function measure(dem: Dem, coords: Position[]) {
  const line = lineString(coords);
  const L = turfLength(line, { units: "meters" });
  const z = (p: Position) => {
    const [x, y] = UTM.fwd(p[1]!, p[0]!);
    return zBilinear(dem, x, y);
  };
  const profile = (cs: Position[]): Prof => {
    const l = lineString(cs);
    const len = turfLength(l, { units: "meters" });
    const out: Prof = [];
    for (let s = 0; s <= len; s += STEP) {
      const h = z(along(l, s, { units: "meters" }).geometry.coordinates);
      if (Number.isFinite(h)) out.push([s, h]);
    }
    return out;
  };
  /** The grade (%) over a window centred on each sample, shortened at the ends (the study's §2 reading). */
  const grades = (prof: Prof) =>
    prof.map(([s], i) => {
      let a = i,
        b = i;
      while (a > 0 && s - prof[a - 1]![0] <= WINDOW_M / 2) a--;
      while (b < prof.length - 1 && prof[b + 1]![0] - s <= WINDOW_M / 2) b++;
      const run = prof[b]![0] - prof[a]![0];
      return run > 0 ? (Math.abs(prof[b]![1] - prof[a]![1]) / run) * 100 : 0;
    });
  /** The point `d` m to the left of the line (travelling along it) at `s` m along. */
  const beside = (s: number, d: number): Position => {
    const at = (t: number) =>
      along(line, Math.min(L, Math.max(0, t)), { units: "meters" }).geometry.coordinates;
    const [x0, y0] = UTM.fwd(at(s - 3)[1]!, at(s - 3)[0]!);
    const [x1, y1] = UTM.fwd(at(s + 3)[1]!, at(s + 3)[0]!);
    const [x, y] = UTM.fwd(at(s)[1]!, at(s)[0]!);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const [lat, lon] = UTM.inv(x - ((y1 - y0) / len) * d, y + ((x1 - x0) / len) * d);
    return [lon, lat];
  };
  /** The ground's slope across the line (%, rising to the left) at `off` m beside it, over ±`half` m. */
  const across = (s: number, off: number, half: number) =>
    ((z(beside(s, off + half)) - z(beside(s, off - half))) / (2 * half)) * 100;
  const heading = (s: number) => {
    const [x0, y0] = UTM.fwd(
      ...(beside(s - 6, 0)
        .slice()
        .reverse() as [number, number]),
    );
    const [x1, y1] = UTM.fwd(
      ...(beside(s + 6, 0)
        .slice()
        .reverse() as [number, number]),
    );
    return (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
  };
  return { L, profile, grades, beside, across, heading };
}

/** Over the veto: one run around the steepest point, and in all, ft. */
function overVeto(prof: Prof, g: number[]) {
  const max = Math.max(...g);
  let a = g.indexOf(max),
    b = a;
  while (a > 0 && g[a - 1]! > VETO) a--;
  while (b < g.length - 1 && g[b + 1]! > VETO) b++;
  return {
    max,
    at: prof[g.indexOf(max)]![0],
    from: prof[a]![0],
    to: prof[b]![0],
    runFt: (prof[b]![0] - prof[a]![0]) * FT,
    allFt: g.filter((v) => v > VETO).length * STEP * FT,
    over30Ft: g.filter((v) => v > 30).length * STEP * FT,
  };
}

describe.runIf(import.meta.env.MODE === "study-drift")("the drift test", () => {
  it("writes tmp/study-drift/<fixture>-<line>.md", async () => {
    const fixture = (process.env.FIXTURE ?? "grayson-mud-creek-6273") as PrototypeSlug;
    const lineArg = process.env.LINE ?? "c";
    if (!PROTOTYPE_FIXTURE_SLUGS.includes(fixture))
      throw new Error(`FIXTURE: one of ${PROTOTYPE_FIXTURE_SLUGS.join(", ")}`);
    const coords = lineOf(lineArg);
    // The line drawn as an easement, so the screen's ground covers it; its lidar is the screen's fine DEM.
    const run = await runFixture(fixture, {
      lines: [{ id: "drift", kind: "easement", line: coords.map(([lon, lat]) => [lat!, lon!]), widthFt: 30 }],
    });
    const m = measure(routeContext(run.session).dFine, coords);
    const ft = (metres: number) => `${Math.round(metres * FT).toLocaleString("en-US")} ft`;
    const base = m.profile(coords);
    if (base.length < 2) throw new Error("the line is outside the fixture's lidar");
    const g = m.grades(base);
    const o = overVeto(base, g);
    const rise = base.at(-1)![1] - base[0]![1];
    const out: string[] = [
      `# Drift test: ${lineArg} on ${fixture}`,
      "",
      `Written by \`pnpm study:drift\` (test/tools/drift-study.test.ts). The ${ft(m.L)} line, its grades over ${WINDOW_M} m on the 3 m lidar; distances from its first point; "left" is travelling along it.`,
      "",
      `- **The line:** ${ft(m.L)}, a ${ft(Math.abs(rise))} ${rise >= 0 ? "climb" : "drop"}, ${((Math.abs(rise) / m.L) * 100).toFixed(1)}% on average.`,
      `- **Steepest ${WINDOW_M} m:** ${o.max.toFixed(1)}% at ${ft(o.at)}; over the ${VETO}% veto from ${ft(o.from)} to ${ft(o.to)} around it (${Math.round(o.runFt)} ft), ${Math.round(o.allFt)} ft in all; over 30%, ${Math.round(o.over30Ft)} ft.`,
      "",
      "## Across the line, through the stretch over the veto",
      "",
      "| Along | Across ±2 m | 8 m right | 4 m right | 4 m left | 8 m left | Heading |",
      "|---|---|---|---|---|---|---|",
    ];
    for (let s = o.from; s <= o.to + 0.1; s += STEP)
      out.push(
        `| ${ft(s)} | ${m.across(s, 0, 2).toFixed(0)}% | ${[-8, -4, 4, 8].map((off) => `${m.across(s, off, 1.5).toFixed(0)}%`).join(" | ")} | ${m.heading(s).toFixed(0)}° |`,
      );
    const tAcross = base.map(([s]) => Math.abs(m.across(s, 0, 2)));
    out.push(
      "",
      `Along the whole line, the ground falls more than 20% sideways for ${ft(tAcross.filter((v) => v > 20).length * STEP)} of ${ft(m.L)} (${(tAcross.reduce((t, x) => t + x, 0) / tAcross.length).toFixed(0)}% on average). The 3 m lidar barely resolves a 12 ft roadbed: a flat band shows only where the bench is wide.`,
      "",
      "## The line shifted sideways (plus is left)",
      "",
      `| Shift | Steepest ${WINDOW_M} m | Over ${VETO}% in all |`,
      "|---|---|---|",
    );
    const l = lineString(coords);
    for (const d of SHIFTS_M) {
      const cs =
        d === 0 ? coords : (lineOffset(l, d, { units: "meters" }).geometry.coordinates as Position[]);
      const p = m.profile(cs);
      const r = overVeto(p, m.grades(p));
      out.push(
        `| ${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)} m | ${r.max.toFixed(1)}% | ${Math.round(r.allFt)} ft |`,
      );
    }
    out.push(
      "",
      "## Best-fitting lines: the middle of the flattest 4 m band across, smoothed over 15 m",
      "",
      `| Fit | Steepest ${WINDOW_M} m | Over ${VETO}% in one run | in all | Over 30% | Across, on average |`,
      "|---|---|---|---|---|---|",
    );
    for (const [label, reach, pull] of [
      ["within ±10 m", 10, 0],
      ["within ±10 m, held near the line", 10, 0.3],
      ["within ±6 m", 6, 0],
    ] as const) {
      const samples: number[] = [];
      const offs: number[] = [];
      for (let s = 0; s <= m.L; s += STEP) {
        let best = 0,
          bestV = Infinity;
        for (let off = -reach; off <= reach; off += 0.5) {
          const v =
            (Math.abs(m.across(s, off - 1.5, 1.5)) +
              Math.abs(m.across(s, off, 1.5)) +
              Math.abs(m.across(s, off + 1.5, 1.5))) /
              3 +
            Math.abs(off) * pull;
          if (v < bestV) [bestV, best] = [v, off];
        }
        samples.push(s);
        offs.push(best);
      }
      const smooth = offs.map((_, i) => {
        const w = offs.slice(Math.max(0, i - 2), i + 3);
        return w.reduce((t, x) => t + x, 0) / w.length;
      });
      const fitted = samples.map((s, i) => m.beside(s, smooth[i]!));
      const p = m.profile(fitted);
      const r = overVeto(p, m.grades(p));
      const flat = samples.map((s, i) => Math.abs(m.across(s, smooth[i]!, 2)));
      out.push(
        `| ${label} | ${r.max.toFixed(1)}% | ${Math.round(r.runFt)} ft | ${Math.round(r.allFt)} ft | ${Math.round(r.over30Ft)} ft | ${(flat.reduce((t, x) => t + x, 0) / flat.length).toFixed(0)}% |`,
      );
    }
    mkdirSync("tmp/study-drift", { recursive: true });
    const path = `tmp/study-drift/${fixture}-${lineArg.replace(/[^\w.-]+/g, "_")}.md`;
    writeFileSync(path, out.join("\n") + "\n");
  }, 600_000);
});
