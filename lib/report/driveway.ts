/** The Driveway section (proto L1515–1532): entrances, routed alignments with costs, the pioneer track. */
import { fmt } from "../format";
import { routeLabel } from "../screen/routeLabel";
import type { PartialScreenResult } from "../screen/types";
import type { FactRow } from "./facts";
import { said, type Heading, type Part } from "./parts";

export function drivewayHeading(r: PartialScreenResult): Heading {
  return {
    title: "Driveway",
    ...(r.driveway ? { sub: `routed to ${r.driveway.toLabel}` } : {}),
    slug: "driveway",
    help: "h-driveway",
  };
}

type Route = NonNullable<PartialScreenResult["driveway"]>["routes"][number];

export interface RouteView {
  title: string;
  /** "from E1" */
  from: string;
  /** "$12–18k" */
  cost: string;
  rows: FactRow[];
  /** The elevation profile, drawn in a 360 × 100 viewBox (proto L1527). */
  profile: string;
}

export interface DrivewayView {
  note: string | null;
  entrances: string | null;
  routes: RouteView[];
  /** When no route fits the limit: the least-steep one, shown as suspect (owner, after 15c). */
  overLimit: RouteView | null;
  track: { rows: FactRow[]; note: string } | null;
  caveat: Part[];
}

const k$ = (c: { low: number; high: number }) => `$${fmt(c.low / 1000)}–${fmt(c.high / 1000)}k`;

/** The profile line, stretched to the box: distance across, elevation 10–95 down (proto L1527, verbatim). */
export function profilePath(p: readonly (readonly [number, number])[]): string {
  if (!p.length) return "";
  const L = p[p.length - 1]![0] || 1;
  const zs = p.map((x) => x[1]);
  const z0 = Math.min(...zs),
    z1 = Math.max(...zs) || z0 + 1;
  return p
    .map(
      (x, k) =>
        `${k ? "L" : "M"}${((x[0] / L) * 360).toFixed(1)},${(95 - ((x[1] - z0) / (z1 - z0 + 1e-6)) * 85).toFixed(1)}`,
    )
    .join(" ");
}

/** The least-steep route: the same facts as a route, its grade against the real limit, titled as suspect. */
function overLimitView(o: NonNullable<NonNullable<PartialScreenResult["driveway"]>["overLimit"]>): RouteView {
  const v = routeView(o, 0);
  const m = o.metrics;
  return {
    ...v,
    title: "Over the limit — least steep (suspect)",
    rows: v.rows.map((r) =>
      r.label === "Grade, max / average"
        ? {
            label: "Grade",
            value: `needs ${Math.round(o.maxGrade * 100)}% (limit ${fmt(o.limitPct)}%); about ${fmt(o.overFt)} ft over the limit in ${o.overSpans.length} stretch${o.overSpans.length === 1 ? "" : "es"} · steepest 3 m step / average ${m.maxGradePct.toFixed(1)}% / ${m.avgGradePct.toFixed(1)}%`,
          }
        : r,
    ),
  };
}

function routeView(rt: Route, i: number): RouteView {
  const m = rt.metrics;
  const rows: FactRow[] = [
    { label: "Length / rise", value: `${fmt(m.lengthFt)} ft / ${fmt(m.riseFt)} ft` },
    {
      label: "Grade, max / average",
      value: `${m.maxGradePct.toFixed(1)}% / ${m.avgGradePct.toFixed(1)}% (limit ${(rt.maxGrade * 100).toFixed(0)}%)`,
    },
    { label: "Switchbacks", value: String(m.switchbacks) },
    {
      label: "Earthwork",
      value: `${fmt(m.earthYd)} yd³${m.rockYd > 0 ? ` (${fmt(m.rockYd)} yd³ in rock)` : ""}`,
    },
    { label: "Stone", value: `${fmt(m.stoneTons)} tons (12 ft × 8 in)` },
    { label: "Clearing corridor", value: `${fmt(m.clearAc, 2)} ac` },
    {
      label: "Culverts",
      value: `${m.culverts} (entrance + ${m.culverts - 1} drainage crossing${m.culverts - 1 === 1 ? "" : "s"})`,
    },
  ];
  if (rt.needsEasement)
    rows.push({
      label: "Leaves the boundary",
      value: "",
      strong: `${fmt(m.outsideFt)} ft outside the line — needs an easement`,
    });
  return {
    title: `${i ? "Alternative" : "Recommended"} — ${routeLabel(rt)}`,
    from: `from E${rt.entranceIndex + 1}`,
    cost: k$(rt.cost),
    rows,
    profile: profilePath(rt.profile),
  };
}

/** Null until the driveway step has run. */
export function drivewayView(r: PartialScreenResult): DrivewayView | null {
  const d = r.driveway;
  if (!d) return null;
  const first = d.routes[0];
  return {
    note: d.note,
    entrances: d.entrances.length
      ? `Entrance candidates on the frontage (E1 best): ${d.entrances
          .map(
            (e, i) =>
              `E${i + 1} ${e.name} — road ${e.roadGrade.toFixed(0)}%, bend ${e.bend.toFixed(0)}°, bank ${e.bankFt.toFixed(0)} ft`,
          )
          .join("; ")}.`
      : null,
    routes: d.routes.map(routeView),
    overLimit: d.overLimit ? overLimitView(d.overLimit) : null,
    track: first?.track
      ? {
          rows: [
            {
              label: "On the driveway's alignment (keeps the dozer work)",
              value: `~${fmt(first.track.hours)} machine hours, ${first.track.waterBars} water bars · `,
              strong: k$(first.track.cost),
            },
            ...(d.direct?.track
              ? [
                  {
                    label: "Direct line at ≤15% (red dotted; cheaper now, replaced later)",
                    value: `${fmt(d.direct.metrics.lengthFt)} ft, max ${d.direct.metrics.maxGradePct.toFixed(0)}% · `,
                    strong: k$(d.direct.track.cost),
                  },
                ]
              : []),
          ],
          note: "A track is blade width, native soil, water bars instead of ditches, a pipe or ford at crossings, stone only at the entrance. Building it on the final alignment means the earthwork carries forward; the direct line is money spent twice.",
        }
      : null,
    caveat: [
      // B12: the prototype said "3 m lidar" whatever the run's DEM cell size; the run's own is shown.
      said(
        `Least-cost route over the ${r.demResM != null ? `${fmt(r.demResM)} m ` : ""}lidar with a hard grade limit; it avoids bottomland and side-hill, and prices crossings as culverts. Costs use the unit rates in Settings, ±30%. Bare-earth DEM (no trees), county soils (not borings), and VDOT decides the entrance — this is a number to put in front of an excavator, not a bid.`,
      ),
    ],
  };
}
