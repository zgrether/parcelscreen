/**
 * How another household member would rate a parcel (step 6, docs/plans/step-6-household.md §3.2): the rows where their
 * card and mine differ most, from the same stored measurements under each rubric. Pure: no re-screen, no network.
 *
 * A Must that fails for them and not for me comes first. Then each graded row's share of the grade (its weight times
 * its points, over the counted rows' weights), ranked by how far their share is from mine; rows that don't differ
 * aren't listed. Each comes with their why line.
 */
import { weightsOf } from "../rubric/weights";
import type { Factor, Letter, Rubric } from "../rubric/types";
import { whyLine, type WhyContext } from "../rubric/words";
import type { Card } from "./card";

export interface Difference {
  key: Factor;
  label: string;
  /** What each card says: a letter, "fails", or "not counted" (a Won't). */
  mine: string;
  theirs: string;
  /** Their why line for the factor (their answers, else "On the starting list." / "You moved this here."). */
  why: string;
}

/** Rows whose shares differ by less than this (in grade points) are the same for this purpose. */
const SAME = 0.05;

/** Each counted row's share of the grade, in grade points; a row the rubric doesn't count has none. */
function shares(card: Card, rubric: Rubric): Map<string, number> {
  const w = weightsOf(rubric);
  const counted = card.rows.filter((r) => r.grade !== null && !rubric.wonts.includes(r.key));
  const total = counted.reduce((a, r) => a + w[r.key], 0);
  return new Map(
    counted.map((r) => [r.key, total > 0 ? (w[r.key] * rubric.points[r.grade as Letter]) / total : 0]),
  );
}

const shown = (letter: Letter | null, counted: boolean): string =>
  !counted ? "not counted" : (letter ?? "–");

export function differences(mine: Card, theirs: Card, theirWhy: WhyContext | null, max = 3): Difference[] {
  const myRubric = mine.rubric.rubric;
  const theirRubric = theirs.rubric.rubric;
  const out: Difference[] = [];
  for (const g of theirs.gates) {
    const my = mine.gates.find((x) => x.key === g.key);
    if (g.status === "fail" && my?.status !== "fail")
      out.push({
        key: g.key,
        label: g.label,
        mine: my?.status === "warn" ? "check" : "passes",
        theirs: "fails",
        why: whyLine(theirRubric, g.key, theirWhy),
      });
  }
  const a = shares(mine, myRubric);
  const b = shares(theirs, theirRubric);
  // Every row either card has: a row one of them doesn't count (a Won't) may be left off that card.
  const keys = [...new Set([...mine.rows, ...theirs.rows].map((r) => r.key))];
  const rows = keys
    .map((key) => ({ key, gap: Math.abs((b.get(key) ?? 0) - (a.get(key) ?? 0)) }))
    .filter((x) => x.gap >= SAME)
    .sort((x, y) => y.gap - x.gap);
  for (const { key } of rows) {
    const my = mine.rows.find((x) => x.key === key);
    const their = theirs.rows.find((x) => x.key === key);
    out.push({
      key,
      label: (their ?? my)!.label,
      mine: shown(my?.grade ?? null, a.has(key)),
      theirs: shown(their?.grade ?? null, b.has(key)),
      why: whyLine(theirRubric, key, theirWhy),
    });
  }
  return out.slice(0, max);
}
