/**
 * The priorities page's "Try it" strip (step 3, docs/plans/step-3-rubric-editor.md §4; the owner's words, 10/18): one
 * parcel's card under the list as it was and as it is now, and the factors that moved most, each as one plain sentence
 * ("Night sky now counts more", "Septic no longer checked"), with no points. Pure arithmetic over a stored screen
 * (reportCard), so it can follow a drag on every frame.
 */
import { breakdown } from "./breakdown";
import { reportCard, type Card } from "./card";
import type { Drawn } from "./marks";
import type { PartialScreenResult as Result } from "../screen/types";
import { EDITOR_TITLES, minimumWords, tierOf } from "../rubric/words";
import { thresholdStatus } from "../rubric/musts";
import { GATE_KEYS, ROW_KEYS, type Factor, type Rubric } from "../rubric/types";

export interface Moved {
  key: Factor;
  label: string;
  /** The change in the points this factor earns toward the grade (0 for a dealbreaker or a limit): the order only. */
  delta: number;
  /** What changed, as one plain sentence: "Night sky now counts more", "Septic no longer checked". */
  why: string;
}

export interface Preview {
  before: Card;
  now: Card;
  /** The factors that moved most, at most `n`: dealbreakers and minimums that decide the verdict first, then rows. */
  moved: Moved[];
}

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
    const label = EDITOR_TITLES[g];
    musts.push({
      key: g,
      label,
      delta: 0,
      why: is === "wont" ? `${label} no longer checked` : `${label} checked again`,
      decides: status !== "pass",
    });
  }
  for (const row of ROW_KEYS) {
    const was = before.musts.find((m) => m.factor === row && m.threshold !== undefined)?.threshold;
    const is = now.musts.find((m) => m.factor === row && m.threshold !== undefined)?.threshold;
    if (was === is) continue;
    const label = EDITOR_TITLES[row];
    const words = is === undefined ? "" : minimumWords(row, is);
    const status =
      is === undefined
        ? null
        : thresholdStatus({ factor: row, threshold: is }, a.rows.find((x) => x.key === row)?.measure);
    musts.push({
      key: row,
      label,
      delta: 0,
      why:
        status === null
          ? `${label} no longer has a limit`
          : status === "fail"
            ? `Out: ${label} misses its limit (${words})`
            : status === "pass"
              ? `${label} passes its minimum (${words})`
              : `${label}: new limit (${words}), not measured for this parcel`,
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
    const label = EDITOR_TITLES[row];
    const wasWont = tierOf(before, row) === "wont",
      isWont = tierOf(now, row) === "wont";
    const gradeB = b.rows.find((r) => r.key === row)?.grade,
      gradeA = a.rows.find((r) => r.key === row)?.grade;
    // One sentence per factor, the biggest change first: in or out of the grade, then its letter, then how much it counts.
    let why: string | null = null;
    if (wasWont !== isWont) why = isWont ? `${label} no longer counts` : `${label} counts again`;
    else if (gradeA && gradeB && gradeA !== gradeB)
      why = `${label} now gets a${gradeA === "A" || gradeA === "F" ? "n" : ""} ${gradeA}`;
    else if (x && y && Math.abs(x.share - y.share) >= 0.005)
      why = `${label} now counts ${y.share > x.share ? "more" : "less"}`;
    if (!why) continue;
    rows.push({ key: row, label, delta, why });
  }
  rows.sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
  const deciding = musts.filter((m) => m.decides).map(({ decides: _d, ...m }) => m);
  const quiet = musts.filter((m) => !m.decides).map(({ decides: _d, ...m }) => m);
  return [...deciding, ...rows, ...quiet];
}
