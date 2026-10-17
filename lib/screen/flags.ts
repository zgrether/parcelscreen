/**
 * The run's flags and the prototype's verdict, derived from a stored screen (step 1 plan §3.3; schema v8): each
 * step's flags from its stored data and the run's thresholds (`params`), in the run's order, by the same functions
 * the steps raise them with; any fatal makes the verdict fatal, else any warning marginal, else ok. A step that
 * didn't run, or failed, raises nothing. The sun, sky and driveway flags read what the result holds now: after a
 * re-evaluation or a marked house they describe that point, as the sections beside them do (the engine kept the
 * run's own; a deviation declared in step 1, PR 2).
 *
 * These derivations are engine code (phase-0.md §9.44): changing one is a numbers change, declared, with an
 * ENGINE_VERSION bump; test/fixtures/<slug>/grades-v7.json is the guard.
 */
import { floodFlags } from "./flood";
import { padusFlags } from "./padus";
import { roadFlag } from "./roads";
import { existingSteepLine, NO_PRACTICAL_ROUTE, noPracticalLineFor } from "./score";
import { siteFlags } from "./sites";
import { skyFlags } from "./sky";
import { bottomlandFlags, soilFlags } from "./soils";
import { sunFlags } from "./sun";
import { terrainFlags } from "./terrain";
import type { PartialScreenResult, RawFlag, ScreenResult, Step } from "./types";

type Flag = ScreenResult["flags"][number];

const tag = (step: Step, flags: readonly RawFlag[]): Flag[] => flags.map((f) => ({ ...f, step }));

export function flagsOf(R: PartialScreenResult): Flag[] {
  const ran = (step: Step) => !R.failed.includes(step);
  const P = R.params;
  const out: Flag[] = [];
  if (R.terrain && ran("terrain")) {
    const benches = R.benches ?? [];
    const relaxed = benches.length > 0 && R.houseMinUsed !== P.houseMin;
    out.push(
      ...tag("terrain", [
        ...siteFlags(
          {
            best: benches[0] ? { relaxed } : undefined,
            shelves: R.shelves ?? [],
            diag: R.terrain.diag,
            houseMin: R.houseMinUsed ?? P.houseMin,
          },
          P,
          !!R.house,
        ),
        ...terrainFlags(R.terrain.slopeP90Deg),
      ]),
    );
  }
  if (R.soils && ran("soils")) {
    const benches = R.benches ?? [];
    out.push(
      ...tag("soils", [
        ...(benches.length ? bottomlandFlags(benches.map((b) => ({ veto: b.veto ?? null }))) : []),
        ...soilFlags(R.soils, R.soilUnits ?? null, R.acres, P.shallowBedrockCm),
      ]),
    );
  }
  if (R.sun && R.focus && ran("sun"))
    out.push(...tag("sun", sunFlags(R.sun, R.focus.label, { az: R.sun.worstAz }, P.sunHoursWanted)));
  if (R.sky && ran("sky"))
    out.push(...tag("sky", skyFlags(R.sky, [R.sky.zone, R.sky.zoneWord], { w: R.sky.dome?.w ?? -1 })));
  if (R.flood && ran("flood")) out.push(...tag("flood", floodFlags(R.flood, R.acres)));
  if (R.protected && ran("padus")) out.push(...tag("padus", padusFlags(R.protected)));
  if (R.road && ran("near")) {
    const f = roadFlag(R.road, P.roadMaxGradePct);
    if (f) out.push(...tag("near", [f]));
  }
  if (R.driveway && ran("driveway")) {
    const d = R.driveway;
    const rt = d.routes[0];
    const flags: RawFlag[] = [];
    if (rt && d.note?.includes(NO_PRACTICAL_ROUTE))
      flags.push({
        lvl: "warn",
        t: `Driveway to ${d.toLabel}: ${noPracticalLineFor(rt.metrics.maxGradePct, P.roadVetoGradePct)}`,
      });
    const steep = existingSteepLine(rt?.existing ?? null);
    if (steep) flags.push({ lvl: "warn", t: `Driveway to ${d.toLabel}: ${steep}.` });
    out.push(...tag("driveway", flags));
  }
  // A fatal "No house site" is a warning when a house is marked (the orchestrator's rule).
  if (R.house) for (const f of out) if (f.lvl === "fatal" && /^No house site/.test(f.t)) f.lvl = "warn";
  return out;
}

/** The prototype's verdict, from every step's flags: any fatal, else any warning, else ok. */
export const verdictOf = (flags: readonly { lvl: RawFlag["lvl"] }[]): ScreenResult["verdict"] =>
  flags.some((f) => f.lvl === "fatal") ? "fatal" : flags.some((f) => f.lvl === "warn") ? "marginal" : "ok";
