/**
 * Hunt (step 14 §3.1): room and cover to hunt on your own land, with the state's basics and the county's shooting rule
 * as facts, each with its source. Yes: uses.huntMinAc and uses.huntForestPct forest, or open public land next door, no
 * house within a quarter mile of the build site, and a county we cover. Maybe: smaller, thinner, houses near, or a
 * county not covered (or a measurement that didn't load). No: a county ban on shooting at the parcel; none of the ten
 * counties' rules is one, so it isn't reached today. Pure.
 */
import { countyByFips, STATE_HUNTING, type StateCode } from "../config/counties";
import { SCREEN_CONSTANTS } from "../screen/config";
import { adjoiningPublic, spotOf } from "./common";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { DIVIDE, HUNT, MISSING, SOURCE } from "./words";

const K = SCREEN_CONSTANTS.uses;

const isState = (s: string): s is StateCode => s === "VA" || s === "NC" || s === "TN";

export function hunt({ result: r, facts }: UsesInput): UseAnswer {
  const forest = r.cover?.forestPct ?? null;
  const publicLand = adjoiningPublic(r);
  const rules = r.county ? countyByFips(r.county.fips) : null;
  const state = r.county && isState(r.county.state) ? STATE_HUNTING[r.county.state] : null;
  const spot = spotOf(r, facts.at);
  const privacy = r.privacy?.outside ? undefined : spot?.privacy;

  const decides: Fact[] = [
    { label: HUNT.acresLabel, value: HUNT.acres(r.acres) },
    r.cover
      ? {
          label: HUNT.forestLabel,
          value: HUNT.pct(r.cover.forestPct),
          source: SOURCE.nlcd,
          date: String(r.cover.year),
        }
      : { label: HUNT.forestLabel, value: MISSING.cover("forest share") },
    {
      label: HUNT.publicLabel,
      value: publicLand ?? (publicLand === null ? HUNT.none : MISSING.protected),
      source: SOURCE.padus,
    },
    {
      label: HUNT.housesLabel,
      value: privacy ? HUNT.count(privacy.near) : MISSING.privacy,
      ...(privacy ? { source: SOURCE.footprints } : {}),
    },
    rules
      ? {
          label: HUNT.countyLabel(rules.name),
          value: DIVIDE.says(rules.discharge.says, rules.discharge.confidence),
          source: rules.discharge.source,
          date: rules.discharge.checked,
        }
      : { label: HUNT.countyNotCoveredLabel, value: r.county ? HUNT.notCoveredValue : MISSING.county },
    ...(state
      ? [
          [HUNT.licenseLabel, state.license] as const,
          [HUNT.sundayLabel, state.sunday] as const,
          [HUNT.orangeLabel, state.orange] as const,
          [HUNT.roadsLabel, state.distances] as const,
        ].map(([label, f]) => ({
          label,
          value: DIVIDE.says(f.says, f.confidence),
          source: f.source,
          date: f.checked,
        }))
      : []),
  ];
  const say = (answer: UseAnswer["answer"], reason: string): UseAnswer => ({ answer, reason, decides });

  // Open public land next door hunts as well as your own big woods.
  if (!publicLand) {
    if (r.acres < K.huntMinAc) return say("maybe", HUNT.small(r.acres, K.huntMinAc));
    if (forest === null) return say("maybe", MISSING.cover("forest share"));
    if (forest < K.huntForestPct) return say("maybe", HUNT.thin(forest, K.huntForestPct));
  }
  if (!privacy) return say("maybe", MISSING.privacy);
  if (privacy.near > 0) return say("maybe", HUNT.houses(privacy.near, spot!.label));
  if (!r.county) return say("maybe", MISSING.county);
  if (!rules) return say("maybe", HUNT.notCovered);
  return say("yes", publicLand ? HUNT.adjoins(publicLand) : HUNT.big(r.acres, forest!));
}
