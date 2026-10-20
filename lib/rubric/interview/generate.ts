/**
 * The interview's answers as a rubric (step 4, docs/plans/step-4-interview.md §2; workflow-review.md, Rubric algorithm
 * §1–4). Pure: it never sees a parcel.
 * 1. Each answer gives the rows it touches importance points, 0–3 (config `card.interview`). A row takes its highest
 *    answer (owner Q1); a row no answer touches keeps its default points; a walk-away chip lifts its row to at least 1,
 *    so a limit always has a ranked card beside it; a "doesn't matter" chip puts its row at 0.
 * 2. Points become tiers: Really want is the rows with 2+ points, kept to 3–6; Nice to have the rest with any points;
 *    Don't care the rows with none. Ties go to the design's default order.
 * 3. Rank becomes weight: rank-sum, Nice to have at three quarters (lib/rubric/weights.ts).
 * 4. Each answer marks its row's B/C edge, and the band shifts with it (setBandEdge).
 * 5. The four dealbreakers stay Must haves unless 14b says they don't matter; 14a's chips add limits.
 * Skipping every question returns the starting list unchanged (owner Q8).
 */
import { SCREEN_CONSTANTS } from "../../screen/config";
import { defaultRubric } from "../default";
import { setBandEdge, setMinimum } from "../edit";
import {
  GATE_KEYS,
  ROW_KEYS,
  type Factor,
  type GateKey,
  type RankedCard,
  type RowKey,
  type Rubric,
} from "../types";
import type { BandKey } from "../words";
import { CHIPS, type Chip, type InterviewAnswers } from "./answers";
import { ACRES_WORDS, CHIP_WORDS, dollars, GLOW_QUESTION, QUESTIONS } from "./questions";

/** What one choice does, as config writes it. */
interface Effect {
  points?: Partial<Record<RowKey, number>>;
  edges?: Partial<Record<BandKey, number>>;
  openLandWithinFt?: number;
}

/** Ties between rows with the same points break in the design's default order (Factors table). */
export const TIE_ORDER: readonly RowKey[] = [
  "elevation",
  "homesite",
  // Step 7: the Factors table puts Driveway after Winter sun.
  "driveway",
  "room",
  "trails",
  "town",
  "sky",
  "garden",
];

export interface Generated {
  rubric: Rubric;
  /** Each row's importance points, after the walk-away and doesn't-matter chips. */
  points: Record<RowKey, number>;
  /**
   * Why each card is where it is, in the person's terms (never a question number: owner, 10/18). A row's or a
   * dealbreaker's answers, the one that set its place first; a limit's chip.
   */
  why: { cards: Partial<Record<Factor, string[]>>; limits: Partial<Record<RowKey, string>> };
  /** The quiet list: answers about factors the app doesn't measure yet, in words. */
  later: string[];
  /** More walk-away chips than `mustNoteAbove`: "That will rule out most land." */
  mustNote: boolean;
}

/** True when nothing was answered: every question skipped. */
export const answeredNothing = (a: InterviewAnswers): boolean =>
  Object.values(a).every((v) => v === undefined);

/** The walk-away numbers' starting values (§3, 14a): under question 1's edge, and one step past question 6's answer. */
export function walkAwayStarts(
  a: InterviewAnswers,
  C = SCREEN_CONSTANTS.card,
): { belowFt: number; erOverMin: number } {
  const I = C.interview;
  const climate = a.climate ? (I.choices.climate[a.climate] as Effect) : undefined;
  const edgeFt = climate?.edges?.elevationFt ?? C.rows.elevationFt[1]!;
  const erMin = a.er ? Number(a.er) : C.rows.erMin[1]!;
  return { belowFt: edgeFt - I.walkAway.belowFtUnderEdge, erOverMin: erMin + I.walkAway.erStepMin };
}

const choiceOf = (key: keyof InterviewAnswers, id: string) =>
  (
    QUESTIONS.find((q) => q.key === key)?.choices ??
    QUESTIONS.find((q) => q.second?.key === key)?.second?.choices
  )?.find((c) => c.id === id);

export function rubricFromAnswers(a: InterviewAnswers, C = SCREEN_CONSTANTS.card): Generated {
  const I = C.interview;
  const start = defaultRubric(C);
  const blank = { cards: {}, limits: {} };
  if (answeredNothing(a))
    return { rubric: start, points: { ...I.defaultPoints }, why: blank, later: [], mustNote: false };

  const heard = new Map<RowKey, { points: number; why: string | null }[]>();
  const edges: Partial<Record<BandKey, number>> = {};
  let openLand: number | undefined;
  const why: Generated["why"] = { cards: {}, limits: {} };
  const later: string[] = [];
  const note = (text: string | undefined) => text && !later.includes(text) && later.push(text);
  const say = (f: Factor, text: string | null) => text && (why.cards[f] ??= []).push(text);

  const apply = (effect: Effect | undefined, text: string | null) => {
    if (!effect) return;
    for (const [row, points] of Object.entries(effect.points ?? {}) as [RowKey, number][])
      heard.set(row, [...(heard.get(row) ?? []), { points, why: text }]);
    Object.assign(edges, effect.edges ?? {});
    if (effect.openLandWithinFt !== undefined) openLand = effect.openLandWithinFt;
  };
  const answer = <K extends keyof typeof I.choices>(
    key: K & keyof InterviewAnswers,
    id: string | undefined,
  ) => {
    if (id === undefined) return;
    const choice = choiceOf(key, id);
    apply((I.choices[key] as Record<string, Effect>)[id], choice?.why ?? null);
    note(choice?.later);
  };

  answer("climate", a.climate);
  if (a.sky) {
    // "Out with a camera" then "spoils it": one why for both, and the follow-up's stricter edge.
    const spoils = a.sky === "camera" && a.glow === "spoils";
    apply(
      I.choices.sky[a.sky] as Effect,
      spoils ? GLOW_QUESTION.choices[1]!.why : (choiceOf("sky", a.sky)?.why ?? null),
    );
    if (a.sky === "camera" && a.glow) apply(I.choices.glow[a.glow] as Effect, null);
  }
  answer("sunView", a.sunView);
  answer("trails", a.trails);
  answer("groceries", a.groceries);
  answer("er", a.er);
  for (const key of ["fly", "calls"] as const) if (a[key]) note(choiceOf(key, a[key])?.later);
  answer("neighbors", a.neighbors);
  answer("garden", a.garden);
  // Question 10 sets the Driveway row (step 7); it left the quiet list.
  answer("driveway", a.driveway);
  for (const key of ["hoa", "creek"] as const) if (a[key]) note(choiceOf(key, a[key])?.later);
  if (a.land?.acres) note(`Acreage (${ACRES_WORDS[a.land.acres]})`);
  if (a.land?.campBudget !== undefined) note(`Camp budget (${dollars(a.land.campBudget)})`);
  if (a.land?.buildBudget !== undefined) note(`Build budget (${dollars(a.land.buildBudget)})`);

  // Question 14a: the walk-away chips. Their rows are lifted to at least 1 point, and each limit keeps its why.
  const starts = walkAwayStarts(a, C);
  const numbers = {
    belowFt: a.walkAway?.belowFt ?? starts.belowFt,
    erOverMin: a.walkAway?.erOverMin ?? starts.erOverMin,
  };
  const walk = new Set<Chip>(a.walkAway?.chips ?? []);
  const floors = new Set<RowKey>();
  const limits: { row: RowKey; threshold: number }[] = [];
  const limitRow: Partial<Record<Chip, { row: RowKey; threshold: number }>> = {
    belowFt: { row: "elevation", threshold: numbers.belowFt },
    erOver: { row: "town", threshold: numbers.erOverMin },
    noWinterSun: { row: "homesite", threshold: SCREEN_CONSTANTS.bands.winterSunH[0]! },
  };
  const walkGate: Partial<Record<Chip, GateKey>> = { flood: "floodplain", altSeptic: "septic" };
  for (const chip of CHIPS) {
    if (!walk.has(chip)) continue;
    const text = CHIP_WORDS[chip].walkAway(numbers);
    const limit = limitRow[chip];
    if (limit) {
      floors.add(limit.row);
      limits.push(limit);
      why.limits[limit.row] = text;
    }
    const gate = walkGate[chip];
    if (gate) say(gate, text);
    note(CHIP_WORDS[chip].laterWalkAway);
  }

  // Question 14b: the chips that don't matter. A dealbreaker goes to Don't care; a row goes to 0 points.
  const off = new Set<Chip>(a.dontMatter ?? []);
  const dropGate: Partial<Record<Chip, GateKey>> = {
    flood: "floodplain",
    sharedDriveway: "easement",
    altSeptic: "septic",
  };
  const zeroRow: Partial<Record<Chip, RowKey>> = { belowFt: "elevation", noWinterSun: "homesite" };
  const dropped = new Set<GateKey>();
  const zeroed = new Set<RowKey>();
  for (const chip of CHIPS) {
    if (!off.has(chip)) continue;
    const text = CHIP_WORDS[chip].dontMatter;
    const gate = dropGate[chip];
    if (gate) {
      dropped.add(gate);
      say(gate, text);
    }
    const row = zeroRow[chip];
    if (row) {
      zeroed.add(row);
      say(row, text);
    }
    if (chip === "erOver") {
      edges.erMin = I.dontMatterErMin;
      say("town", text);
    }
    note(CHIP_WORDS[chip].laterDontMatter);
  }

  // 1. Points: the highest answer, else the default; a walk-away chip lifts to 1; "doesn't matter" is 0.
  const points = {} as Record<RowKey, number>;
  for (const row of ROW_KEYS) {
    const answers = heard.get(row) ?? [];
    const base = answers.length ? Math.max(...answers.map((x) => x.points)) : I.defaultPoints[row];
    points[row] = zeroed.has(row) ? 0 : floors.has(row) ? Math.max(base, 1) : base;
    // The answers' whys, the one that set the row's place first; then a walk-away chip's.
    const said = [...answers].sort((x, y) => y.points - x.points).map((x) => x.why);
    for (const text of said) if (text && !zeroed.has(row)) say(row, text);
  }

  // 2. Tiers.
  const order = [...TIE_ORDER].sort(
    (x, y) => points[y] - points[x] || TIE_ORDER.indexOf(x) - TIE_ORDER.indexOf(y),
  );
  const should = order.filter((r) => points[r] >= I.should.minPoints).slice(0, I.should.max);
  for (const r of order)
    if (should.length < I.should.min && points[r] >= 1 && !should.includes(r)) should.push(r);
  const could = order.filter((r) => points[r] >= 1 && !should.includes(r));
  const wonts = order.filter((r) => points[r] === 0);
  const ranked: RankedCard[] = [
    ...should.map((factor) => ({ factor, tier: "should" as const })),
    ...could.map((factor) => ({ factor, tier: "could" as const })),
  ];

  // 4–5. Bands, the Must haves, and rank-sum weights (3).
  let rubric: Rubric = {
    ...start,
    musts: [
      ...GATE_KEYS.filter((g) => !dropped.has(g)).map((factor) => ({ factor })),
      ...limits.map(({ row, threshold }) => ({ factor: row, threshold })),
    ],
    ranked,
    wonts,
    weights: { mode: "rankSum" },
  };
  for (const [band, value] of Object.entries(edges) as [BandKey, number][])
    rubric = setBandEdge(rubric, band, value);
  if (openLand !== undefined) rubric = { ...rubric, bands: { ...rubric.bands, openLandWithinFt: openLand } };
  for (const { row, threshold } of limits) rubric = setMinimum(rubric, row, threshold);

  return { rubric, points, why, later, mustNote: walk.size > I.mustNoteAbove };
}
