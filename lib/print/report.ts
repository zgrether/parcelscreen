/**
 * The report card export's content (step 9, docs/plans/step-9-report-export.md §1–§2): what the print page says, from
 * a parcel, its saved screen and the household, with no DOM and no network. The page lays it out; this decides it.
 *
 * One page fits one US Letter page by shortening, never by dropping a section (§2): FIT_STEPS, applied in order.
 */
import { askingLine } from "../client/askingPrice";
import type { Household } from "../client/takes";
import { ANSWER_WORD, type Answer } from "../client/takes";
import { agentQuestions } from "../report/agent";
import { answerReason } from "../report/answer";
import { reportCard, type Card, type NamedRubric } from "../report/card";
import { GATE_MARK, mustLines, mustText, rankedRows } from "../report/cardLines";
import type { Drawn } from "../report/marks";
import type { ScreenResult } from "../screen/types";

/** The new strings (plan §8). */
export const REPORT_WORDS = {
  title: "Report card",
  onePage: "One page",
  full: "Full",
  print: "Print or save as PDF",
  back: "← Back",
  gradeFirst: "Grade it first",
  loading: "Loading the report card…",
  notHere: "This parcel isn't on this device.",
  notGraded: "This parcel hasn't been graded yet.",
  staleBoundary: "Graded on an earlier boundary.",
  takes: "Takes",
  questions: "Questions for the agent",
  noQuestions: "Nothing for the agent: every must was checked.",
} as const;

/** "Graded Oct 20, 2026", from the screen's own run; "Graded" when it has no date it can read. */
export function gradedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Graded";
  return `Graded ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/** A row of the report card as it prints: its label, its letter or mark, and its text (full and short). */
export interface PrintRow {
  key: string;
  label: string;
  /** A letter (A–F), a Must's mark (✓ ! ✗ ?), or "–" for a row without a grade. */
  mark: string;
  /** "grade" for a letter, "must" for a Must's mark. */
  kind: "grade" | "must";
  /** The status class for a Must (pass, warn, fail, unknown), or the letter's for a row (g-A…). */
  tone: string;
  text: string;
  /** The row's short value, for the fit's first step; the full text when it has none. */
  short: string;
}

export interface PrintTier {
  /** "Must have", "Really want", "Nice to have". */
  name: string;
  rows: PrintRow[];
}

export interface PrintGrade {
  who: string;
  card: Card;
  /** The answer's reason ("Strong elevation and winter sun; …"). */
  reason: string;
}

export interface PrintTake {
  who: string;
  answer: Answer;
  comment: string;
}

export interface ReportContent {
  name: string;
  acres: number | null;
  /** "asking $185,000 as of Oct 11, 2026", or null. */
  price: string | null;
  graded: string;
  stale: boolean;
  /** The viewer's card first, then each other member's who has priorities. */
  grades: PrintGrade[];
  /** The viewer's card, in their rubric's order. */
  tiers: PrintTier[];
  takes: PrintTake[];
  questions: string[];
}

export interface ReportInput {
  name: string;
  acres: number | null;
  askingPrice: number | null;
  askingPriceAt: string | null;
  result: ScreenResult;
  drawn?: Drawn;
  /** Every rubric the viewer grades with, their own first (profileRubrics()). */
  rubrics: readonly NamedRubric[];
  /** The one on show (viewedRubric()): its card orders the rows. */
  viewer: NamedRubric;
  /** A rubric's or a member's name as the page says it: the viewer's own profile name for theirs. */
  nameOf(id: string): string;
  household: Household;
  parcelKey: string;
  stale: boolean;
}

/** The tier names, as the card says them. */
const TIERS = { must: "Must have", should: "Really want", could: "Nice to have" } as const;

export function cardTiers(card: Card): PrintTier[] {
  const musts: PrintRow[] = mustLines(card).map((m) => ({
    key: `must-${m.key}-${m.label}`,
    label: m.label,
    mark: GATE_MARK[m.status],
    kind: "must",
    tone: m.status,
    text: mustText(m),
    short: mustText({ ...m, detail: m.first ?? m.detail }),
  }));
  const { should, could } = rankedRows(card);
  const ranked = (rows: typeof should): PrintRow[] =>
    rows.map((r) => ({
      key: r.key,
      label: r.label,
      mark: r.grade ?? "–",
      kind: "grade",
      tone: `g-${r.grade ?? "none"}`,
      text: r.detail,
      short: r.short ?? r.detail,
    }));
  return [
    { name: TIERS.must, rows: musts },
    { name: TIERS.should, rows: ranked(should) },
    { name: TIERS.could, rows: ranked(could) },
  ].filter((t) => t.rows.length > 0);
}

export function reportContent(i: ReportInput): ReportContent {
  const order = [i.viewer, ...i.rubrics.filter((r) => r.id !== i.viewer.id)];
  const grades = order.map((nr): PrintGrade => {
    const card = reportCard(i.result, nr, i.drawn);
    return { who: i.nameOf(nr.id), card, reason: answerReason(card, i.result) };
  });
  const mine = grades[0]!.card;
  const takes = i.household.takes
    .filter((t) => t.parcel === i.parcelKey)
    .map((t): PrintTake => ({ who: i.nameOf(t.by), answer: t.answer, comment: t.comment }));
  return {
    name: i.name,
    acres: i.acres,
    price:
      i.askingPrice !== null && i.askingPriceAt
        ? capitalize(askingLine(i.askingPrice, i.askingPriceAt))
        : null,
    graded: gradedOn(i.result.runAt),
    stale: i.stale,
    grades,
    tiers: cardTiers(mine),
    takes,
    questions: agentQuestions(mine).map((q) => q.question),
  };
}

/** "Julie says Maybe", the list's own words for a take. */
export const takeWords = (t: PrintTake): string => `${t.who} says ${ANSWER_WORD[t.answer]}`;

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One page's fit (plan §2): each step shortens one thing, kept while the next is tried, until the page fits. It never
 * drops a section. The page measures after each step.
 */
export const FIT_STEPS = ["shortRows", "oneLineComments", "smallerMap", "oneLineAnswers"] as const;
export type FitStep = (typeof FIT_STEPS)[number];

/** The steps in force at level `n` (0: none; FIT_STEPS.length: all). */
export const fitSteps = (n: number): ReadonlySet<FitStep> => new Set(FIT_STEPS.slice(0, Math.max(0, n)));

/** The Letter page's print area at 96 px per inch, 0.5 in margins: 7.5 × 10 in, less a safety line. */
export const PRINT_AREA = { width: 720, height: 960 - 12 } as const;

/** The next level to try, or null when it fits or nothing's left to shorten. */
export const nextFit = (level: number, height: number): number | null =>
  height <= PRINT_AREA.height || level >= FIT_STEPS.length ? null : level + 1;

/** The two presets, and the URL's and the pref's word for each. */
export type Preset = "one" | "full";
export const presetOf = (s: string | null | undefined): Preset | null =>
  s === "full" ? "full" : s === "one" ? "one" : null;
