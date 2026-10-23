/**
 * Ways to raise this grade (step 12, docs/plans/step-12-raise-the-grade.md §2): the app tries a short list of changes on
 * the person's card and keeps those that raise their letter or their verdict and lower neither; at most three, in the
 * plan's order. Display-time: every candidate is a card graded from the saved screen. Pure.
 */
import type { LatLon } from "../geo/types";
import type { Factor, Letter, Rubric } from "../rubric/types";
import { EDITOR_TITLES } from "../rubric/words";
import type { PartialScreenResult } from "../screen/types";
import { adjustKey, type Adjustment, letterText, shownLetter } from "./adjust";
import { reportCard, VERDICT_WORD, type Card, type Verdict } from "./card";
import { mustLines } from "./cardLines";
import { costRange } from "./cost";
import type { Drawn } from "./marks";
import { SCREEN_CONSTANTS } from "../screen/config";

type Result = PartialScreenResult;

/** What a suggestion's action does, for the page to carry out. */
export type RaiseAction =
  | { kind: "house"; site: number; ll: LatLon }
  | { kind: "tryLine"; line: string }
  | { kind: "adjust"; factor: Factor; choice: "pass" | "setAside"; reason: string };

export interface Suggestion {
  kind: "homesite" | "access" | "septic" | "setAside";
  /** Cause and effect: "Build at site #3: Elevation B → A, parcel C → B". */
  text: string;
  /** The cost, where one applies: "Ready to build $5–9k less". */
  cost?: string;
  action: RaiseAction;
  /** The card it would give. */
  card: Card;
}

/** At most this many suggestions (the brief). */
export const MAX_SUGGESTIONS = 3;

/**
 * Musts never suggested for setting aside (plan §2.5, §12 Q4): safety and legal access, the septic system (its own
 * suggestion), and the budget. Each can still be set aside by hand in its panel.
 */
export const NEVER_SET_ASIDE: ReadonlySet<Factor> = new Set([
  "floodplain",
  "access",
  "easement",
  "septic",
  "budget",
]);

const VERDICT_RANK: Record<Verdict, number> = { Pass: 0, Maybe: 1, Contender: 2 };
const letterRank = (l: Letter | null): number => (l ? 5 - "ABCDF".indexOf(l) : 0);

/** Whether `b` raises the letter or the verdict over `a` and lowers neither. */
export function raises(a: Card, b: Card): boolean {
  const dl = letterRank(b.grade) - letterRank(a.grade);
  const dv = VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict];
  return dl >= 0 && dv >= 0 && dl + dv > 0;
}

/** How much `b` raises over `a`, for choosing among candidates: verdict first, then letter, then points. */
const gain = (a: Card, b: Card): number =>
  (VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict]) * 100 +
  (letterRank(b.grade) - letterRank(a.grade)) * 10 +
  ((b.points ?? 0) - (a.points ?? 0));

/** "Elevation B → A" for the rows that moved (at most two, the biggest first), then "parcel C → B", "Maybe → Contender". */
export function effectWords(a: Card, b: Card): string {
  const moved: { words: string; by: number }[] = [];
  for (const row of b.rows) {
    const was = a.rows.find((x) => x.key === row.key)?.grade ?? null;
    if (row.grade !== was && row.grade)
      moved.push({
        words: `${row.label} ${letterText(shownLetter(a, row.key))} → ${letterText(shownLetter(b, row.key))}`,
        by: letterRank(row.grade) - letterRank(was),
      });
  }
  const before = new Map(mustLines(a).map((m) => [m.key, m.status]));
  // Step 12's parked question 3 (owner, 10/22): a Must's state in words, letters only for grades.
  for (const m of mustLines(b)) {
    const was = before.get(m.key);
    if (was && was !== m.status) moved.push({ words: `${m.label} ${WOULD[m.status]}`, by: 5 });
  }
  const rows = moved
    .sort((x, y) => y.by - x.by)
    .slice(0, 2)
    .map((x) => x.words);
  const parcel = a.grade !== b.grade ? [`parcel ${a.grade ?? "–"} → ${b.grade ?? "–"}`] : [];
  const verdict = a.verdict !== b.verdict ? [`${VERDICT_WORD[a.verdict]} → ${VERDICT_WORD[b.verdict]}`] : [];
  return [...rows, ...parcel, ...verdict].join(" · ");
}

/** A Must's new state, said as a change the suggestion would make: "Septic would pass". */
const WOULD = {
  pass: "would pass",
  warn: "would need a check",
  fail: "would fail",
  unknown: "would be unknown",
} as const;

/** Ready to build's change between two cards, past $1k: "Ready to build $5–9k less", "adds $18–31k to Ready to build". */
export function buildCostWords(a: Card, b: Card): string | undefined {
  if (a.cost?.kind !== "priced" || b.cost?.kind !== "priced") return undefined;
  const low = b.cost.build.total.low - a.cost.build.total.low;
  const high = b.cost.build.total.high - a.cost.build.total.high;
  if (Math.abs(low) < 1000 && Math.abs(high) < 1000) return undefined;
  const r = { low: Math.min(Math.abs(low), Math.abs(high)), high: Math.max(Math.abs(low), Math.abs(high)) };
  return low + high < 0 ? `Ready to build ${costRange(r)} less` : `adds ${costRange(r)} to Ready to build`;
}

/** A card with one more adjustment of the person's, for a preview. */
function withPreview(r: Result, card: Card, drawn: Drawn | undefined, extra: Adjustment): Card {
  const id = card.rubric.id;
  const own = drawn?.adjust?.get(id) ?? [];
  const adjust = new Map(drawn?.adjust ?? []);
  adjust.set(id, [...own.filter((a) => a.factor !== extra.factor), extra]);
  return reportCard(r, card.rubric, { ...(drawn ?? { names: new Map(), marks: [] }), adjust } as Drawn);
}

const preview = (factor: Factor, a: Partial<Adjustment>): Adjustment => ({
  key: adjustKey("preview", "preview", factor),
  parcel: "preview",
  by: "preview",
  factor,
  kind: "override",
  reason: "preview",
  was: "–",
  at: "",
  ...a,
});

/** The septic system's reason, prefilled when the person counts it as passed (plan §2.3). */
export const ALT_SEPTIC_REASON = "Planning on an alternative septic system";

export interface RaiseOptions {
  /** The person walked away from "Only an alternative septic system" (interview, question 14a). */
  refusesAltSeptic?: boolean;
}

/** 2.1: the best other homesite that raises the letter. */
function homesite(r: Result, base: Card, drawn: Drawn | undefined): Suggestion[] {
  let best: { s: (typeof base.sites)[number]; card: Card } | null = null;
  for (const s of base.sites) {
    if (s.index === base.at) continue;
    const c = reportCard(r, base.rubric, drawn, SCREEN_CONSTANTS.card, { at: s.index });
    if (letterRank(c.grade) <= letterRank(base.grade) || VERDICT_RANK[c.verdict] < VERDICT_RANK[base.verdict])
      continue;
    if (!best || gain(base, c) > gain(base, best.card)) best = { s, card: c };
  }
  if (!best) return [];
  const cost = buildCostWords(base, best.card);
  return [
    {
      kind: "homesite",
      text: `Build at site #${best.s.rank}: ${effectWords(base, best.card)}`,
      ...(cost ? { cost } : {}),
      action: { kind: "house", site: best.s.index, ll: best.s.ll },
      card: best.card,
    },
  ];
}

/** "your drawn track", "your existing drive", "your easement", or the line's name (plan §8). */
function lineWords(id: string, kind: string, drawn: Drawn | undefined): string {
  const name = drawn?.names.get(id);
  if (name) return name;
  const own = drawn?.cost?.lines.find((l) => l.id === id)?.kind ?? kind;
  return own === "drive" ? "your existing drive" : own === "easement" ? "your easement" : "your drawn track";
}

/** 2.2: a drawn line as access, when the card with its route chosen raises the grade (WF5's choice, display-time). */
function access(r: Result, base: Card, drawn: Drawn | undefined): Suggestion[] {
  let best: { id: string; kind: string; card: Card } | null = null;
  for (const l of r.lines ?? []) {
    if (l.id === drawn?.driveway) continue;
    const c = reportCard(r, base.rubric, {
      ...(drawn ?? { names: new Map(), marks: [] }),
      driveway: l.id,
    } as Drawn);
    // No route from it in this screen: nothing to score.
    if (c.drivewayLine !== l.id || !raises(base, c)) continue;
    if (!best || gain(base, c) > gain(base, best.card)) best = { id: l.id, kind: l.kind, card: c };
  }
  if (!best) return [];
  const cost = buildCostWords(base, best.card);
  return [
    {
      kind: "access",
      text: `Use ${lineWords(best.id, best.kind, drawn)} for access: ${effectWords(base, best.card)}`,
      ...(cost ? { cost } : {}),
      action: { kind: "tryLine", line: best.id },
      card: best.card,
    },
  ];
}

/**
 * A tried line's outcome (plan §2.2), up or down: the rows and Musts that moved, the drive minutes it re-timed, the
 * parcel and the verdict; and, when a Must got worse, why, in its own words.
 */
export function triedWords(a: Card, b: Card): string {
  const minutes = b.rows.flatMap((row) => {
    const was = a.rows.find((x) => x.key === row.key)?.measure;
    const now = row.measure;
    if (now?.unit !== "min" || was?.unit !== "min" || Math.round(was.value) === Math.round(now.value))
      return [];
    return [`${row.label} ${Math.round(was.value)} → ${Math.round(now.value)} min`];
  });
  const worse = new Map(mustLines(a).map((m) => [m.key, m.status]));
  const rank = { pass: 3, warn: 2, unknown: 1, fail: 0 } as const;
  const why = mustLines(b).filter((m) => {
    const was = worse.get(m.key);
    return !!was && rank[m.status] < rank[was];
  });
  const effect = [effectWords(a, b), ...minutes].filter((x) => !!x).join(" · ") || "no change to the grade";
  // Why, in the Musts' own words: only what's new since the shown card, each once, the first two.
  const had = new Set(mustLines(a).flatMap((m) => clauses(m.detail)));
  const reasons = [...new Set(why.flatMap((m) => clauses(m.detail)).filter((c) => !had.has(c)))].slice(0, 2);
  return reasons.length ? `${effect}. Why: ${reasons.join("; ")}` : effect;
}

/** A reason's clauses, split at "; " outside parentheses: "…limit (21% avg, 41% steepest; a built road …)" stays whole. */
function clauses(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0 && text[i + 1] === " ") {
      out.push(text.slice(from, i));
      from = i + 2;
    }
  }
  out.push(text.slice(from));
  return out.map((c) => c.trim()).filter((c) => !!c);
}

/** 2.3: an alternative septic system, when Septic is a Must warned on the soils and the person allows it. */
function septic(r: Result, base: Card, drawn: Drawn | undefined, o: RaiseOptions): Suggestion[] {
  const R: Rubric = base.rubric.rubric;
  if (o.refusesAltSeptic || !R.musts.some((m) => m.factor === "septic" && m.threshold === undefined))
    return [];
  const gate = base.gates.find((g) => g.key === "septic");
  if (gate?.status !== "warn" || gate.adjusted) return [];
  const c = withPreview(r, base, drawn, preview("septic", { status: "pass" }));
  if (!raises(base, c)) return [];
  const rate = drawn?.cost?.rates["septic.alternative"];
  return [
    {
      kind: "septic",
      text: `Plan on an alternative septic system: ${effectWords(base, c)}`,
      ...(rate ? { cost: `septic ${costRange(rate)} in Ready to build (Alternative)` } : {}),
      action: { kind: "adjust", factor: "septic", choice: "pass", reason: ALT_SEPTIC_REASON },
      card: c,
    },
  ];
}

/** 2.5: the one row or Must whose set-aside alone raises the most, when any does. */
function setAside(r: Result, base: Card, drawn: Drawn | undefined): Suggestion[] {
  const R = base.rubric.rubric;
  const counted: Factor[] = [...R.musts.map((m) => m.factor), ...R.ranked.map((c) => c.factor)];
  const own = new Set((drawn?.adjust?.get(base.rubric.id) ?? []).map((a) => a.factor));
  let best: { f: Factor; card: Card } | null = null;
  for (const f of new Set(counted)) {
    if (NEVER_SET_ASIDE.has(f) || own.has(f)) continue;
    const c = withPreview(r, base, drawn, preview(f, { kind: "setAside" }));
    if (!raises(base, c)) continue;
    if (!best || gain(base, c) > gain(base, best.card)) best = { f, card: c };
  }
  if (!best) return [];
  const label = base.rows.find((x) => x.key === best.f)?.label ?? EDITOR_TITLES[best.f];
  return [
    {
      kind: "setAside",
      text: `Set aside ${label} for this parcel: ${effectWords(base, best.card)}`,
      action: { kind: "adjust", factor: best.f, choice: "setAside", reason: "" },
      card: best.card,
    },
  ];
}

/**
 * The suggestions for the person's card, in the plan's order, at most three; and whether "Grade it with the parcel next
 * door" is offered (plan §2.4: not an A Contender). An A Contender has nothing to raise.
 */
export function raiseSuggestions(
  r: Result,
  base: Card,
  drawn: Drawn | undefined,
  o: RaiseOptions = {},
): { suggestions: Suggestion[]; neighbour: boolean } {
  const top = base.grade === "A" && base.verdict === "Contender";
  if (top || base.grade === null) return { suggestions: [], neighbour: false };
  const suggestions = [
    ...homesite(r, base, drawn),
    ...access(r, base, drawn),
    ...septic(r, base, drawn, o),
    ...setAside(r, base, drawn),
  ].slice(0, MAX_SUGGESTIONS);
  return { suggestions, neighbour: true };
}

/** The section's words (plan §8). */
export const RAISE_WORDS = {
  title: "Ways to raise this grade",
  none: "Nothing the app can try raises this grade.",
  house: "Put the house here",
  pass: "Count it as passed",
  setAside: "Set it aside…",
  tryIt: "Try it",
  trying: "Trying…",
  tried: "Tried:",
  useIt: "Use it",
  discard: "Discard",
  notRetimed: "Drive times aren't re-timed until you try it.",
  quick: "Try it: quick, from this session",
  slow: "Try it: grades the parcel again (about a minute)",
  failed: (why: string) => `Couldn't try it: ${why}. Try again`,
} as const;

/** The parcel next door (plan §2.4, §8). */
export const NEIGHBOUR_WORDS = {
  button: "Grade it with the parcel next door",
  hint: "Tap the parcel next door, then Grade the combination",
  go: "Grade the combination",
  name: (name: string) => `${name} + next door`,
  /** What it does, beside the button (the fresh-eyes review). */
  what: "Adds the parcel next door to this one and grades them together as a new parcel; this one stays as it is.",
} as const;
