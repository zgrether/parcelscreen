/**
 * The rubric editor's preview (step 3, docs/plans/step-3-rubric-editor.md §4): one parcel's card under the rubric as it
 * was and as it is now, and the factors that moved most. Pure arithmetic over a stored screen (reportCard), so it can
 * follow a drag on every frame.
 */
import { breakdown } from "./breakdown";
import { reportCard, type Card } from "./card";
import type { Drawn } from "./marks";
import type { PartialScreenResult as Result } from "../screen/types";
import { FACTOR_LABELS, minimumWords, tierOf } from "../rubric/words";
import { GATE_KEYS, ROW_KEYS, type Factor, type Rubric } from "../rubric/types";

export interface Moved {
  key: Factor;
  label: string;
  /** The change in the points this factor earns toward the grade (0 for a dealbreaker or a minimum). */
  delta: number;
  /** Why, in a few words: "weight 25% → 30%", "now a C", "now a Won't", "minimum: ER within 20 min". */
  why: string;
}

export interface Preview {
  before: Card;
  now: Card;
  /** The factors that moved most, at most `n`: dealbreakers and minimums that decide the verdict first, then rows. */
  moved: Moved[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The parcel's card under `before` and `now`, and the `n` factors that moved most between them. */
export function rubricPreview(result: Result, before: Rubric, now: Rubric, drawn?: Drawn, n = 2): Preview {
  const b = reportCard(result, { id: "before", name: "Before", rubric: before }, drawn);
  const a = reportCard(result, { id: "now", name: "Now", rubric: now }, drawn);
  return { before: b, now: a, moved: movedMost(b, a, before, now).slice(0, n) };
}

/** Every factor that moved, the ones that decide the verdict first, then by how many points they moved. */
export function movedMost(b: Card, a: Card, before: Rubric, now: Rubric): Moved[] {
  const musts: (Moved & { decides: boolean })[] = [];
  for (const g of GATE_KEYS) {
    const was = tierOf(before, g),
      is = tierOf(now, g);
    if (was === is) continue;
    const status = b.gates.find((x) => x.key === g)?.status;
    musts.push({
      key: g,
      label: FACTOR_LABELS[g],
      delta: 0,
      why: is === "wont" ? "now a Won't" : "a Must again",
      decides: status !== "pass",
    });
  }
  for (const row of ROW_KEYS) {
    const was = before.musts.find((m) => m.factor === row && m.threshold !== undefined)?.threshold;
    const is = now.musts.find((m) => m.factor === row && m.threshold !== undefined)?.threshold;
    if (was === is) continue;
    musts.push({
      key: row,
      label: FACTOR_LABELS[row],
      delta: 0,
      why: is === undefined ? "minimum removed" : `minimum: ${minimumWords(row, is)}`,
      decides: true,
    });
  }

  const earned = (c: Card) => new Map((breakdown(c)?.rows ?? []).map((x) => [x.key, x]));
  const eb = earned(b),
    ea = earned(a);
  const rows: Moved[] = [];
  for (const row of ROW_KEYS) {
    const x = eb.get(row),
      y = ea.get(row);
    const delta = (y?.earned ?? 0) - (x?.earned ?? 0);
    const whys: string[] = [];
    const wasWont = tierOf(before, row) === "wont",
      isWont = tierOf(now, row) === "wont";
    if (wasWont !== isWont) whys.push(isWont ? "now a Won't" : "back in the grade");
    const gradeB = b.rows.find((r) => r.key === row)?.grade,
      gradeA = a.rows.find((r) => r.key === row)?.grade;
    if (gradeA && gradeB && gradeA !== gradeB)
      whys.push(`now a${gradeA === "A" || gradeA === "F" ? "n" : ""} ${gradeA}`);
    if (x && y && Math.abs(x.share - y.share) >= 0.005) whys.push(`weight ${pct(x.share)} → ${pct(y.share)}`);
    if (Math.abs(delta) < 1e-9 && !whys.length) continue;
    rows.push({ key: row, label: FACTOR_LABELS[row], delta, why: whys.join(", ") || "weight unchanged" });
  }
  rows.sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
  const deciding = musts.filter((m) => m.decides).map(({ decides: _d, ...m }) => m);
  const quiet = musts.filter((m) => !m.decides).map(({ decides: _d, ...m }) => m);
  return [...deciding, ...rows, ...quiet];
}
