/**
 * Step 11's new factors, added once to priorities saved before them (docs/plans/step-11-new-data.md §1, §5): each to
 * Don't care, unless an answer the person already gave clearly places it. Nothing else in the rubric moves, except
 * Hospital's split from Town (§2.1), which takes Town's place because Town graded the ER until then. Pure;
 * lib/client/factorsAdd.ts applies it at boot and keeps the notice's state.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { setBandEdge } from "./edit";
import type { InterviewAnswers } from "./interview/answers";
import { climateLimits } from "./interview/generate";
import type { RankedCard, RowKey, Rubric } from "./types";

/** The factors step 11 added, in the order they shipped (plan §11). Each factor's PR appends its own. */
export const NEW_FACTORS = [
  "hospital",
  "climate",
  "privacy",
  "longView",
] as const satisfies readonly RowKey[];
export type NewFactor = (typeof NEW_FACTORS)[number];

/** Each new factor's state: "new" until What matters has shown the notice, then "seen"; "undone" after its Undo. */
export type FactorsAdded = Partial<Record<NewFactor, "new" | "seen" | "undone">>;

/** Whether the rubric already places the factor: ranked, in Don't care, or as a limit. */
export const places = (r: Rubric, f: RowKey): boolean =>
  r.ranked.some((c) => c.factor === f) || r.wonts.includes(f) || r.musts.some((m) => m.factor === f);

/**
 * The interview question each factor's limits come from, where it's new in step 11 (plan §1): the notice links to it
 * ("Answer the new questions"). The factors placed from questions the interview already asked aren't listed.
 */
export const NEW_QUESTION: Partial<Record<NewFactor, keyof InterviewAnswers>> = { climate: "climate" };

/**
 * The rubric with the factor added, or null when it already has it. Hospital follows Town's card; the others are
 * placed from the person's answers (plan §5).
 */
export function withFactor(r: Rubric, f: NewFactor, answers: InterviewAnswers = {}): Rubric | null {
  if (places(r, f)) return null;
  switch (f) {
    case "hospital":
      return withHospital(r);
    case "climate":
      return withClimate(r, answers);
    case "privacy":
      return withPrivacy(r, answers);
    case "longView":
      return withLongView(r, answers);
  }
}

/**
 * Long view (plan §2.4, §5): question 3 places it, "View" at the bottom of Really want and "Both" at the bottom of Nice
 * to have; "Sun", "Neither", or no answer, Don't care. On explicit weights it stays Don't care.
 */
function withLongView(r: Rubric, a: InterviewAnswers): Rubric {
  const I = SCREEN_CONSTANTS.card.interview;
  const points = a.sunView ? I.choices.sunView[a.sunView].points.longView : 0;
  if (r.weights.mode === "rankSum" && points >= I.should.minPoints) return lastShould(r, "longView");
  if (r.weights.mode === "rankSum" && points >= 1) return lastCould(r, "longView");
  return { ...r, wonts: [...r.wonts, "longView"] };
}

/** A card at the bottom of Nice to have: the last card of all. */
const lastCould = (r: Rubric, factor: RowKey): Rubric => ({
  ...r,
  ranked: [...r.ranked, { factor, tier: "could" }],
});

/**
 * Privacy (plan §2.3, §5): question 8 places it, "See their lights" at the bottom of Nice to have and "Never know
 * they're there" at the bottom of Really want, at the answer's limits; "Wave from the porch", or no answer, Don't care.
 * Question 14's "Neighbor's house in view" walk-away is its limit, none in sight, and lifts it to at least Nice to
 * have, as the interview does. On explicit weights it stays Don't care, as Climate does.
 */
function withPrivacy(r: Rubric, a: InterviewAnswers): Rubric {
  const I = SCREEN_CONSTANTS.card.interview;
  let out: Rubric = { ...r, bands: { ...r.bands } };
  const effect = a.neighbors ? I.choices.neighbors[a.neighbors] : undefined;
  for (const [band, v] of Object.entries(effect?.edges ?? {}) as ["privacyFt" | "privacySight", number][])
    out = setBandEdge(out, band, v);
  const limit = !!a.walkAway?.chips.includes("neighborInView");
  if (limit && !out.musts.some((m) => m.factor === "privacy"))
    out = { ...out, musts: [...out.musts, { factor: "privacy", threshold: 0 }] };
  if (r.weights.mode !== "rankSum") return { ...out, wonts: [...out.wonts, "privacy"] };
  const points = Math.max(effect?.points.privacy ?? 0, limit ? 1 : 0);
  if (points >= I.should.minPoints) return lastShould(out, "privacy");
  if (points >= 1) return lastCould(out, "privacy");
  return { ...out, wonts: [...out.wonts, "privacy"] };
}

/** A card at the bottom of Really want: after the last Really want card. */
function lastShould(r: Rubric, factor: RowKey): Rubric {
  const at = r.ranked.findLastIndex((c) => c.tier === "should");
  const card: RankedCard = { factor, tier: "should" };
  return { ...r, ranked: [...r.ranked.slice(0, at + 1), card, ...r.ranked.slice(at + 1)] };
}

/**
 * Climate (plan §2.2, §5): question 1 answered with a year (not "Either") places it at the bottom of Really want, its
 * limits from the follow-ups or the year's preset; otherwise Don't care, at the starting list's limits. On explicit
 * weights (the starting list) it stays Don't care: a card there needs a weight the list doesn't have.
 */
function withClimate(r: Rubric, a: InterviewAnswers): Rubric {
  const I = SCREEN_CONSTANTS.card.interview;
  const { winter, summer } = climateLimits(a);
  let out: Rubric = { ...r, bands: { ...r.bands } };
  if (winter) out = setBandEdge(out, "janLowF", I.choices.winter[winter].edges.janLowF);
  if (summer) out = setBandEdge(out, "julHighF", I.choices.summer[summer].edges.julHighF);
  const placed = !!a.climate && a.climate !== "either" && r.weights.mode === "rankSum";
  return placed ? lastShould(out, "climate") : { ...out, wonts: [...out.wonts, "climate"] };
}

/**
 * The factor placed again from the answers, after the person answered its new question (the notice's link): taken out
 * of every list, then added as at first. Its limits move with the answers; nothing else does.
 */
export function placedAgain(r: Rubric, f: NewFactor, answers: InterviewAnswers): Rubric {
  const out: Rubric = {
    ...r,
    ranked: r.ranked.filter((c) => c.factor !== f),
    wonts: r.wonts.filter((k) => k !== f),
  };
  return withFactor(out, f, answers) ?? r;
}

/**
 * Hospital takes Town's place, as Town graded the ER until step 11 (plan §2.1, §5): just after Town's card in its tier
 * on rank-sum; on explicit weights (the starting list), Town's weight and card, with Town at 0 in Don't care, as the
 * new starting list has it. A limit on Town was an ER limit (Town's measure was the ER's drive), so it moves to
 * Hospital; left on Town it would read the grocery's minutes.
 */
function withHospital(r: Rubric): Rubric {
  const musts = r.musts.map((m) =>
    m.factor === "town" && m.threshold !== undefined ? { ...m, factor: "hospital" as const } : m,
  );
  const at = r.ranked.findIndex((c) => c.factor === "town");
  // Town in Don't care, or in no list: Hospital joins it there.
  if (at < 0) return { ...r, musts, wonts: [...r.wonts, "hospital"] };
  if (r.weights.mode === "explicit") {
    const of = r.weights.of;
    return {
      ...r,
      musts,
      ranked: r.ranked.map((c) => (c.factor === "town" ? { ...c, factor: "hospital" as const } : c)),
      wonts: [...r.wonts, "town"],
      weights: { mode: "explicit", of: { ...of, hospital: of.town, town: 0 } },
    };
  }
  const card: RankedCard = { factor: "hospital", tier: r.ranked[at]!.tier };
  return { ...r, musts, ranked: [...r.ranked.slice(0, at + 1), card, ...r.ranked.slice(at + 1)] };
}

/**
 * The notice's Undo: the factor back to Don't care. Hospital's explicit weight goes back to Town, with Town's card,
 * as before it. A limit stays where it is: it's the person's own.
 */
export function withoutFactor(r: Rubric, f: NewFactor): Rubric {
  if (f === "hospital" && r.weights.mode === "explicit" && r.ranked.some((c) => c.factor === "hospital")) {
    const of = r.weights.of;
    return {
      ...r,
      ranked: r.ranked.map((c) => (c.factor === "hospital" ? { ...c, factor: "town" as const } : c)),
      wonts: [...r.wonts.filter((k) => k !== "town"), "hospital"],
      weights: { mode: "explicit", of: { ...of, town: of.hospital, hospital: 0 } },
    };
  }
  return {
    ...r,
    ranked: r.ranked.filter((c) => c.factor !== f),
    wonts: r.wonts.includes(f) ? r.wonts : [...r.wonts, f],
    ...(r.weights.mode === "explicit"
      ? { weights: { mode: "explicit", of: { ...r.weights.of, [f]: 0 } } }
      : {}),
  };
}

/** The rubric with every factor not yet added (no mark) added; the factors it added, in NEW_FACTORS' order. */
export function withNewFactors(
  r: Rubric,
  marks: FactorsAdded,
  answers: InterviewAnswers = {},
): { rubric: Rubric; added: NewFactor[] } {
  let rubric = r;
  const added: NewFactor[] = [];
  for (const f of NEW_FACTORS) {
    if (marks[f]) continue;
    const next = withFactor(rubric, f, answers);
    if (!next) continue;
    rubric = next;
    added.push(f);
  }
  return { rubric, added };
}
