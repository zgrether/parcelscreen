/** The Driveway section (proto L1515–1532): entrances, routed alignments with costs, the pioneer track. */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { gradeOver } from "../screen/driveway";
import { NEEDS_EASEMENT, routeLabel } from "../screen/routeLabel";
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
  /** The grade over the shorter and longer windows, and how the ground reads against a road (A4b), behind a disclosure. */
  details: { rows: FactRow[]; note: string };
}

const WIN = SCREEN_CONSTANTS.driveway.gradeWindowsM;
/** The details' note (owner, A4b, 2026-10-10). */
export const GROUND_GRADE_NOTE =
  "Grades are measured on the ground under the route, between the DEM's cells. A built road's grade reads about 1–4 points lower, once cut and fill smooth the ground.";

/** The 15 and 60 m grades, from the route's profile. */
function gradeDetails(rt: { profile: readonly (readonly [number, number])[] }): RouteView["details"] {
  return {
    rows: [
      { label: `Grade over ${WIN.short} m`, value: `${gradeOver(rt.profile, WIN.short).toFixed(1)}%` },
      { label: `Grade over ${WIN.long} m`, value: `${gradeOver(rt.profile, WIN.long).toFixed(1)}%` },
    ],
    note: GROUND_GRADE_NOTE,
  };
}

export interface DrivewayView {
  note: string | null;
  entrances: string | null;
  routes: RouteView[];
  /**
   * When no route fits the limit: the least-steep one, shown as suspect (owner, after 15c). Since #88's follow-up
   * also when the route kept to the parcel over the limit is the one scored: it comes first, and the routes within
   * the limit are the alternatives.
   */
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
      r.label === GRADE_ROW
        ? {
            label: "Grade",
            value: `needs ${Math.round(o.maxGrade * 100)}% (limit ${fmt(o.limitPct)}%); about ${fmt(o.overFt)} ft over the limit in ${o.overSpans.length} stretch${o.overSpans.length === 1 ? "" : "es"} · over ${WIN.headline} m / average ${m.maxGradePct.toFixed(1)}% / ${m.avgGradePct.toFixed(1)}%`,
          }
        : r,
    ),
  };
}

/**
 * The scored route over the limit is shown first; the route within the limit that needs an easement is then the
 * alternative, titled in the owner's words (#88 review; an approved rule-7 exception, phase-0.md §9).
 */
export const viaNeighbours = (limitPct: number) =>
  `Within ${fmt(limitPct)}% only via neighbouring land — ${NEEDS_EASEMENT}`;

/** The grade row: over the headline window (30 m), no longer the steepest single 3 m step (A4b, owner 2026-10-10). */
const GRADE_ROW = `Grade over ${WIN.headline} m / average`;

function routeView(rt: Route, i: number, overLimitPct: number | null = null): RouteView {
  const m = rt.metrics;
  const rows: FactRow[] = [
    { label: "Length / rise", value: `${fmt(m.lengthFt)} ft / ${fmt(m.riseFt)} ft` },
    {
      label: GRADE_ROW,
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
    title:
      overLimitPct != null && i === 0 && rt.needsEasement
        ? viaNeighbours(overLimitPct)
        : `${i || overLimitPct != null ? "Alternative" : "Recommended"} — ${routeLabel(rt)}`,
    from: `from E${rt.entranceIndex + 1}`,
    cost: k$(rt.cost),
    rows,
    profile: profilePath(rt.profile),
    details: gradeDetails(rt),
  };
}

/** Null until the driveway step has run. */
export function drivewayView(r: PartialScreenResult): DrivewayView | null {
  const d = r.driveway;
  if (!d) return null;
  // The pioneer track follows the scored route: the over-limit one when it is scored (it then carries the track).
  const first = d.overLimit?.track ? d.overLimit : d.routes[0];
  const overLimitPct = d.overLimit && d.routes.length ? d.overLimit.limitPct : null;
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
    routes: d.routes.map((rt, i) => routeView(rt, i, overLimitPct)),
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
                    value: `${fmt(d.direct.metrics.lengthFt)} ft, ${d.direct.metrics.maxGradePct.toFixed(0)}% over ${WIN.headline} m · `,
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
