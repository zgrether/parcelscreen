/**
 * Step 11's new factors, added once to priorities saved before them (docs/plans/step-11-new-data.md §1, §5): each to
 * Don't care, unless an answer the person already gave clearly places it. Nothing else in the rubric moves, except
 * Hospital's split from Town (§2.1), which takes Town's place because Town graded the ER until then. Pure;
 * lib/client/factorsAdd.ts applies it at boot and keeps the notice's state.
 */
import type { RankedCard, RowKey, Rubric } from "./types";

/** The factors step 11 added, in the order they shipped (plan §11). Each factor's PR appends its own. */
export const NEW_FACTORS = ["hospital"] as const satisfies readonly RowKey[];
export type NewFactor = (typeof NEW_FACTORS)[number];

/** Each new factor's state: "new" until What matters has shown the notice, then "seen"; "undone" after its Undo. */
export type FactorsAdded = Partial<Record<NewFactor, "new" | "seen" | "undone">>;

/** Whether the rubric already places the factor: ranked, in Don't care, or as a limit. */
export const places = (r: Rubric, f: RowKey): boolean =>
  r.ranked.some((c) => c.factor === f) || r.wonts.includes(f) || r.musts.some((m) => m.factor === f);

/**
 * The rubric with the factor added, or null when it already has it. Hospital follows Town's card; the factors that
 * follow it in step 11 take the person's answers (plan §5).
 */
export function withFactor(r: Rubric, f: NewFactor): Rubric | null {
  if (places(r, f)) return null;
  switch (f) {
    case "hospital":
      return withHospital(r);
  }
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
export function withNewFactors(r: Rubric, marks: FactorsAdded): { rubric: Rubric; added: NewFactor[] } {
  let rubric = r;
  const added: NewFactor[] = [];
  for (const f of NEW_FACTORS) {
    if (marks[f]) continue;
    const next = withFactor(rubric, f);
    if (!next) continue;
    rubric = next;
    added.push(f);
  }
  return { rubric, added };
}
