/**
 * Trails and walking woods (step 14 §3.1, §2.2): how much walking trail the gentle ground could hold, at one path every
 * uses.trailSpacingFt. Yes from uses.trailYesMi, Maybe from uses.trailMaybeMi, No under it. Pure.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import type { UseAnswer, UsesInput } from "./types";
import { MISSING, SOURCE, TRAILS } from "./words";

const K = SCREEN_CONSTANTS.uses;

export function trails({ result: r }: UsesInput): UseAnswer {
  const t = r.trails;
  const how = {
    label: TRAILS.howLabel,
    value: TRAILS.how(K.trailMaxGradePct, K.trailMinPatchAc, K.trailSpacingFt),
    source: SOURCE.lidar,
  };
  if (!t) return { answer: "maybe", reason: MISSING.trails, decides: [how] };
  const decides = [
    { label: TRAILS.gentleLabel(K.trailMaxGradePct), value: TRAILS.acres(t.gentleAc), source: SOURCE.lidar },
    { label: TRAILS.milesLabel, value: TRAILS.miles(t.miles), source: SOURCE.lidar },
    how,
  ];
  const estimate = TRAILS.estimate(t.miles, t.gentleAc, K.trailSpacingFt);
  if (t.miles >= K.trailYesMi) return { answer: "yes", reason: estimate, decides };
  if (t.miles >= K.trailMaybeMi) return { answer: "maybe", reason: estimate, decides };
  return { answer: "no", reason: TRAILS.steep(K.trailMaxGradePct), decides };
}
