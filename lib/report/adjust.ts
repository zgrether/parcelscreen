/**
 * Per-parcel adjustments (step 12, docs/plans/step-12-raise-the-grade.md §3): on one parcel, a person overrides a row's
 * letter or a Must's result, or sets a row or a Must aside, each with a reason. They're the person's own: applied to the
 * card's facts before that person's rubric grades them (card.ts reportCard), never to another member's grade. Pure.
 */
import { z } from "zod";
import { GATE_KEYS, ROW_KEYS, type Factor, type Letter, type Rubric } from "../rubric/types";
import { FACTOR_LABELS } from "../rubric/words";

/** A reason is required, and short (plan §3). */
export const ADJUST_REASON_MAX = 200;

export const AdjustmentSchema = z.object({
  /** `${parcel}:${by}:${factor}`: one adjustment per factor per parcel per person. */
  key: z.string(),
  parcel: z.string(),
  /** The profile id of the person it's for. */
  by: z.string(),
  factor: z.enum([...GATE_KEYS, ...ROW_KEYS]),
  kind: z.enum(["override", "setAside"]),
  /** A graded row's letter. */
  grade: z.enum(["A", "B", "C", "D", "F"]).optional(),
  /** A Must's result. */
  status: z.enum(["pass", "fail"]).optional(),
  reason: z.string().min(1).max(ADJUST_REASON_MAX),
  /** What the app said when it was made: a letter, or a Must's status ("warn"), or "–". */
  was: z.string(),
  at: z.string(),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const adjustKey = (parcel: string, by: string, factor: Factor): string => `${parcel}:${by}:${factor}`;

/** On a row or a Must the person overrode: what the app says now, what it says instead, and why. */
export interface Adjusted {
  /** The app's own value now: a letter, a Must's status, or "–". */
  from: string;
  /** The person's: a letter, or "pass" / "fail". */
  to: string;
  reason: string;
  /** The app's value when the person made it: when it differs from `from`, the card says "app now says …". */
  then: string;
  at: string;
}

/** A row or Must the person set aside on this parcel: off the card's grade, still listed where it was (plan §3). */
export interface SetAside {
  key: Factor;
  label: string;
  reason: string;
  /** One of the person's Musts: the answer line names it. */
  must: boolean;
  at: string;
}

/** The factors set aside among a person's adjustments. */
export const asideOf = (adj: readonly Adjustment[]): ReadonlySet<Factor> =>
  new Set(adj.filter((a) => a.kind === "setAside").map((a) => a.factor));

/** Is this factor one of the rubric's Musts, a gate or a limit (or Within budget)? */
export const isMustOf = (r: Rubric, f: Factor): boolean => r.musts.some((m) => m.factor === f);

/** The rubric with these factors left out as Don't care: what ranks this person's homesites on this parcel. */
export function withoutFactors(r: Rubric, aside: ReadonlySet<Factor>): Rubric {
  if (!aside.size) return r;
  return {
    ...r,
    musts: r.musts.filter((m) => !aside.has(m.factor)),
    ranked: r.ranked.filter((c) => !aside.has(c.factor)),
  };
}

/** The label a set-aside factor keeps: the card's own when it has one there, else the factor's. */
export const asideLabel = (f: Factor, own?: string): string => own ?? FACTOR_LABELS[f];

/** "D" or "–" for a row's letter; a Must's status as stored ("warn"). */
export const valueWords = (v: Letter | string | null | undefined): string => v ?? "–";
