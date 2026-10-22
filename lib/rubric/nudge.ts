/**
 * The learning nudge (step 12, docs/plans/step-12-raise-the-grade.md §3): after a person has set the same factor aside
 * on enough parcels, What matters offers once to move it down a tier. Pure.
 */
import type { Adjustment } from "../report/adjust";
import { SCREEN_CONSTANTS } from "../screen/config";
import { hasMinimum, moveCard } from "./edit";
import { GATE_KEYS, ROW_KEYS, type Factor, type Rubric } from "./types";
import { EDITOR_TITLES, isGate, TIER_NAMES, tierOf, type Tier } from "./words";

/** What happened to a factor's offer: shown once, then answered. A factor with a mark isn't offered again. */
export type NudgeMark = "offered" | "moved" | "declined" | "undone";
export type NudgeMarks = Partial<Record<Factor, NudgeMark>>;

export interface Nudge {
  factor: Factor;
  /** The parcels it's set aside on. */
  count: number;
}

/** The card's order, for ties. */
const ORDER: readonly Factor[] = [...GATE_KEYS, ...ROW_KEYS];

/**
 * The factor to offer: the one this person set aside on the most of the parcels still kept, at least `at` of them,
 * that has a tier to move down from and hasn't been offered before. Null when there's none.
 */
export function nudgeFor(
  adjusts: readonly Adjustment[],
  me: string,
  kept: ReadonlySet<string>,
  marks: NudgeMarks,
  r: Rubric,
  at: number = SCREEN_CONSTANTS.card.nudgeAfter,
): Nudge | null {
  const parcels = new Map<Factor, Set<string>>();
  for (const a of adjusts) {
    if (a.by !== me || a.kind !== "setAside" || !kept.has(a.parcel)) continue;
    parcels.set(a.factor, (parcels.get(a.factor) ?? new Set()).add(a.parcel));
  }
  const found = ORDER.flatMap((f): Nudge[] => {
    const n = parcels.get(f)?.size ?? 0;
    if (n < at || marks[f] || !canMoveDown(r, f)) return [];
    return [{ factor: f, count: n }];
  });
  return found.sort((x, y) => y.count - x.count)[0] ?? null;
}

const canMoveDown = (r: Rubric, f: Factor): boolean =>
  tierOf(r, f) !== "wont" || (!isGate(f) && hasMinimum(r, f));

/**
 * The rubric with the factor a tier lower: a limit is dropped (the row keeps its rank); a Must gate goes to Don't care
 * (it can't be ranked); Within budget as a Must to the top of Really want; Really want to the top of Nice to have;
 * Nice to have to Don't care. Returns the tier it lands in.
 */
export function moveDown(r: Rubric, f: Factor): { rubric: Rubric; to: Tier } {
  if (!isGate(f) && hasMinimum(r, f)) {
    const moved = moveCard(r, { kind: "minimum", factor: f }, "wont");
    return { rubric: moved.ok ? moved.rubric : r, to: tierOf(moved.ok ? moved.rubric : r, f) };
  }
  const from = tierOf(r, f);
  const to: Tier = from === "must" ? (isGate(f) ? "wont" : "should") : from === "should" ? "could" : "wont";
  const moved = moveCard(r, { kind: "factor", factor: f }, to, 0);
  return { rubric: moved.ok ? moved.rubric : r, to };
}

/** The offer: "You've set aside Night sky on 3 parcels. Move it down a tier?" */
export const nudgeWords = (n: Nudge): string =>
  `You've set aside ${EDITOR_TITLES[n.factor]} on ${n.count} parcels. Move it down a tier?`;

/** After moving: "Moved Night sky to Nice to have." */
export const movedWords = (f: Factor, to: Tier): string => `Moved ${EDITOR_TITLES[f]} to ${TIER_NAMES[to]}.`;
