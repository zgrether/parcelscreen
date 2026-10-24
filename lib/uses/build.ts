/**
 * Build (step 14 §3.1): the card's own answer, restated plainly. Yes: the best site fits, its septic isn't poor and the
 * gates pass ("A 2.1 ac site at 3,640 ft, conventional septic likely"). Maybe: a gate warns or couldn't be checked, the
 * build doesn't fit, or the site's soil wants a modified or alternative septic system; the reason is the card's. No: a
 * gate fails, or there's no site. Pure.
 */
import { COST_ASSUMPTIONS } from "../config/costs";
import { septicClass, soilUnder } from "../report/derived";
import { feetTo } from "../report/marks";
import { spotOf, upperFirst } from "./common";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { BUILD, MISSING, SOURCE } from "./words";

export function build({ result: r, facts, marks }: UsesInput): UseAnswer {
  const spot = spotOf(r, facts.at);
  // A septic permit marked near the site says its class, as the cost reads it (lib/report/cost.ts).
  const permit = spot
    ? marks
        .filter((m) => m.kind === "septic" && feetTo(m, spot.ll) <= COST_ASSUMPTIONS.nearMarkFt)
        .map((m) => m.septicClass)
        .find((c) => !!c)
    : undefined;
  const soil = spot ? soilUnder(r, spot.ll) : null;
  const cls = permit ?? (soil ? septicClass(soil)?.toLowerCase() : null) ?? null;
  const decides: Fact[] = [
    ...(spot ? [{ label: BUILD.siteLabel, value: BUILD.site(spot.label, spot.acres, spot.elevFt) }] : []),
    ...facts.gates.map((g) => ({ label: g.label, value: g.reason })),
    ...(spot
      ? [
          {
            label: BUILD.septicLabel,
            value: cls ?? BUILD.septicUnknown,
            source: permit ? SOURCE.marks : SOURCE.nrcs,
          },
        ]
      : []),
  ];
  const say = (answer: UseAnswer["answer"], reason: string): UseAnswer => ({ answer, reason, decides });

  const failed = facts.gates.find((g) => g.status === "fail");
  if (failed) return say("no", failed.reason);
  if (spot === null) return say("no", BUILD.noSite);
  if (spot === undefined) return say("maybe", MISSING.sites);
  const warned =
    facts.gates.find((g) => g.status === "warn") ?? facts.gates.find((g) => g.status === "unknown");
  if (warned) return say("maybe", warned.reason);
  const check = facts.rows.find((x) => x.key === "room")?.checkFirst;
  if (check) return say("maybe", upperFirst(check));
  if (cls === "modified" || cls === "alternative") return say("maybe", BUILD.septicClass(cls, spot.label));
  const septic = permit ? BUILD.permit : cls === "conventional" ? BUILD.conventional : BUILD.septicUnknown;
  return say("yes", BUILD.yes(spot.acres, spot.elevFt, septic));
}
