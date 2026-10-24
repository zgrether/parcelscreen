/**
 * What limits you (step 14 §3.1): a list of facts, not an answer. The easements drawn, by their purpose; the deed's
 * restrictions and the HOA as typed in Listing; the flood zone's acres; the power lines (distance from the house site,
 * whether one crosses, its voltage). Distances and voltages only, no health claims (§1). Pure.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { feetToNearestLine } from "../screen/power";
import { spotOf } from "./common";
import type { Fact, UsesInput } from "./types";
import { EASEMENT_TYPE_WORD, HOA_WORD, LIMIT_WORDS, SOURCE } from "./words";

export function limits({ result: r, facts, lines, listing }: UsesInput): Fact[] {
  const easements = lines.filter((l) => l.kind === "easement");
  return [
    ...(easements.length
      ? easements.map((l) => ({
          label: l.name,
          value: LIMIT_WORDS.easement(
            l.easementType ? EASEMENT_TYPE_WORD[l.easementType] : null,
            l.recordedIn.trim(),
          ),
          source: SOURCE.lines,
        }))
      : [{ label: LIMIT_WORDS.easements, value: LIMIT_WORDS.noEasements, source: SOURCE.lines }]),
    {
      label: LIMIT_WORDS.deed,
      value: listing.deedRestrictions.trim() || LIMIT_WORDS.notKnown,
      source: listing.fromOriginal?.includes("deedRestrictions") ? SOURCE.original : SOURCE.listing,
    },
    {
      label: LIMIT_WORDS.hoa,
      value: HOA_WORD[listing.hoa],
      source: listing.fromOriginal?.includes("hoa") ? SOURCE.original : SOURCE.listing,
    },
    floodFact(r),
    ...powerFacts(r, facts.at),
  ];
}

function floodFact(r: UsesInput["result"]): Fact {
  const f = r.flood;
  const value = !f
    ? LIMIT_WORDS.floodMissing
    : !f.mapped
      ? LIMIT_WORDS.floodNotMapped
      : f.sfha && f.sfhaAcres > 0
        ? LIMIT_WORDS.floodAc(f.sfhaAcres)
        : LIMIT_WORDS.noFlood;
  return { label: LIMIT_WORDS.flood, value, ...(f ? { source: SOURCE.fema } : {}) };
}

function powerFacts(r: UsesInput["result"], at: number): Fact[] {
  const p = r.power;
  if (!p) return [{ label: LIMIT_WORDS.power, value: LIMIT_WORDS.powerMissing }];
  const source = {
    source: p.source === "hifld" ? SOURCE.hifld : SOURCE.osm,
    ...(p.date ? { date: p.date } : {}),
  };
  const spot = spotOf(r, at);
  // From the house site to the lines kept near the parcel; else the nearest one's distance from the boundary.
  const near = spot ? feetToNearestLine(spot.ll, p.lines) : null;
  const distance = near
    ? LIMIT_WORDS.fromSite(near.kV, near.ft)
    : p.nearestFt !== null && p.nearestFt > 0
      ? LIMIT_WORDS.fromBoundary(p.nearestKV, p.nearestFt)
      : p.nearestFt === null
        ? LIMIT_WORDS.noPower(SCREEN_CONSTANTS.power.searchKm)
        : null;
  return [
    ...(p.crosses
      ? [
          {
            label: LIMIT_WORDS.power,
            value: p.insideFt > 0 ? LIMIT_WORDS.crossesFt(p.insideFt) : LIMIT_WORDS.crosses,
            ...source,
          },
        ]
      : []),
    ...(distance ? [{ label: LIMIT_WORDS.power, value: distance, ...source }] : []),
  ];
}
