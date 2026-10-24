/**
 * What you can do here (step 14, docs/plans/step-14-land-uses.md §3): every use's answer, in the panel's order, and What
 * limits you last. Display time only: it reads the result and the card's facts, and nothing reads it back (§1).
 */
import { build } from "./build";
import { campNow } from "./camp";
import { divideUse } from "./divideUse";
import { garden } from "./garden";
import { hunt } from "./hunt";
import { limits } from "./limits";
import { ride } from "./ride";
import { trails } from "./trails";
import type { Fact, UseAnswer, UseKey, UsesInput } from "./types";
import { USE_NAME } from "./words";

export type { Answer, Fact, UseAnswer, UseKey, UseLine, UseListing, UsesInput } from "./types";

const USES: readonly [UseKey, (input: UsesInput) => UseAnswer][] = [
  ["camp", campNow],
  ["build", build],
  ["trails", trails],
  ["garden", garden],
  ["hunt", hunt],
  ["ride", ride],
  ["divide", divideUse],
];

/** The uses in the panel's order (the loading rows name them before the answers come). */
export const USE_ORDER: readonly UseKey[] = USES.map(([key]) => key);

export interface LandUses {
  uses: { key: UseKey; name: string; answer: UseAnswer }[];
  limits: Fact[];
}

export function landUses(input: UsesInput): LandUses {
  return {
    uses: USES.map(([key, use]) => ({ key, name: USE_NAME[key], answer: use(input) })),
    limits: limits(input),
  };
}
