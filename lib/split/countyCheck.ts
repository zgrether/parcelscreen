/**
 * A piece's county check (step 14, plan §5.1): whether the piece, as one lot, meets the county's minimum lot size and its
 * road frontage per lot, by Divide's own reading of the rules (lib/uses/divide.ts). Pure, display time only.
 */
import type { PartialScreenResult } from "../screen/types";
import { divideHeadline } from "../uses/divide";
import { divideOf } from "../uses/divideUse";
import { DIVIDE, MISSING } from "../uses/words";
import { SPLIT_WORDS } from "./words";

export interface CountyCheck {
  /** True: it passes; false: it fails one rule or both; null: it can't be said (not covered, a rule not online). */
  pass: boolean | null;
  text: string;
}

/**
 * `county`: the parent parcel's county, when the piece's own screen didn't get one (the pieces lie in the same county:
 * the same parts).
 */
export function pieceCountyCheck(
  r: PartialScreenResult,
  county: PartialScreenResult["county"] = undefined,
): CountyCheck {
  const d = divideOf(r.county || !county ? r : { ...r, county });
  if (!d) return { pass: null, text: MISSING.county };
  if (d.kind !== "lots") return { pass: null, text: divideHeadline(d) };
  const lotOk = d.acres + 1e-9 >= d.minLotAc;
  const per = d.frontagePerLotFt,
    have = d.publicFrontageFt;
  const frontageOk = per === null || have === null ? null : have + 1e-9 >= per;
  const under = [
    ...(lotOk ? [] : [SPLIT_WORDS.minLot(d.minLotAc)]),
    ...(frontageOk === false ? [SPLIT_WORDS.frontagePerLot(per!)] : []),
  ];
  if (under.length) return { pass: false, text: SPLIT_WORDS.under(under.join(" and ")) };
  // A frontage rule, but the piece's frontage wasn't measured: the lot size passes, the frontage isn't known.
  if (per !== null && have === null)
    return { pass: null, text: DIVIDE.withNote(SPLIT_WORDS.passesLot, DIVIDE.noFrontage) };
  return { pass: true, text: per === null ? SPLIT_WORDS.passesLot : SPLIT_WORDS.passes };
}
