/**
 * What the rubric editor does to a rubric (step 3, docs/plans/step-3-rubric-editor.md §1–§4; phase-0.md §9.50). Pure:
 * every operation takes a rubric and returns a new one, or the reason it's refused; the editor saves the result, and a
 * rubric change never asks for a re-screen.
 *
 * - The columns: a dealbreaker is a Must or a Won't; a row is ranked (Should, Could) or a Won't, and can hold a limit
 *   in Must besides (its ranked card stays, badged "also a limit"). Best homesite's limit is hours of December sun
 *   (step 4, §9.50 amended).
 * - The weights stay explicit until the first change to the ranked order or a tier, which switches the rubric to
 *   rank-sum at once (owner, 10/17: no confirm; the editor shows what changed, with Undo).
 * - A slider moves a band's B/C edge, and the band's other edges move with it by the same amount.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { defaultRubric } from "./default";
import {
  bcEdge,
  EDITOR_TITLES,
  isGate,
  MINIMUM_BAND,
  minimumWords,
  tierOf,
  TIER_NAMES,
  type BandKey,
  type LimitKey,
  type Tier,
} from "./words";
import {
  GATE_KEYS,
  ROW_KEYS,
  type Factor,
  type GateKey,
  type RankedCard,
  type RowKey,
  type Rubric,
} from "./types";
import { weightsOf } from "./weights";

/** A card in the editor: a factor's main card, or a row's minimum (in Must). */
export type EditorCard = { kind: "factor"; factor: Factor } | { kind: "minimum"; factor: RowKey };

export type Columns = Record<Tier, EditorCard[]>;

/** The four columns as the editor shows them: Must (gates, then minimums), Should and Could in rank order, Won't. */
export function columnsOf(r: Rubric): Columns {
  const gatesIn = (tier: Tier) =>
    GATE_KEYS.filter((g) => tierOf(r, g) === tier).map((factor): EditorCard => ({ kind: "factor", factor }));
  // Within budget held as a Must (step 10): a card without a number, after the gates.
  const budgetMust: EditorCard[] = isBudgetMust(r) ? [{ kind: "factor", factor: "budget" }] : [];
  return {
    must: [
      ...gatesIn("must"),
      ...budgetMust,
      ...r.musts
        .filter((m) => m.threshold !== undefined)
        .map((m): EditorCard => ({ kind: "minimum", factor: m.factor as RowKey })),
    ],
    should: r.ranked.filter((c) => c.tier === "should").map((c) => ({ kind: "factor", factor: c.factor })),
    could: r.ranked.filter((c) => c.tier === "could").map((c) => ({ kind: "factor", factor: c.factor })),
    wont: [...gatesIn("wont"), ...r.wonts.map((factor): EditorCard => ({ kind: "factor", factor }))],
  };
}

/** Within budget is a Must (step 10): the interview's "Over budget" walk-away, a Must without a number. */
export const isBudgetMust = (r: Rubric): boolean =>
  r.musts.some((m) => m.factor === "budget" && m.threshold === undefined);

const withoutBudgetMust = (r: Rubric): Rubric => ({
  ...r,
  musts: r.musts.filter((m) => !(m.factor === "budget" && m.threshold === undefined)),
});

/**
 * Within budget's moves (step 10): to Must it leaves the ranked list and becomes a Must without a number; out of Must
 * it's ranked or Don't care like any row.
 */
function moveBudget(r: Rubric, to: Tier, index?: number): EditResult {
  if (to === "must") {
    if (isBudgetMust(r)) return { ok: true, rubric: r };
    const gates = r.musts.filter((m) => isGate(m.factor) && m.threshold === undefined);
    const rest = r.musts.filter((m) => !(isGate(m.factor) && m.threshold === undefined));
    return {
      ok: true,
      rubric: {
        ...r,
        musts: [...gates, { factor: "budget" }, ...rest],
        ranked: r.ranked.filter((c) => c.factor !== "budget"),
        wonts: without(r.wonts, "budget"),
      },
    };
  }
  const out = withoutBudgetMust(r);
  if (to === "wont")
    return {
      ok: true,
      rubric: {
        ...out,
        ranked: out.ranked.filter((c) => c.factor !== "budget"),
        wonts: [...without(out.wonts, "budget"), "budget"],
      },
    };
  return rank(out, "budget", to, index);
}

/** A row has a minimum in Must: its ranked card shows the "min" badge. */
export const hasMinimum = (r: Rubric, row: RowKey): boolean =>
  r.musts.some((m) => m.factor === row && m.threshold !== undefined);

/** The weights before and after a move that switched them to rank-sum: the notice's table (plan §3). */
export interface WeightsSwitch {
  before: Record<RowKey, number>;
  after: Record<RowKey, number>;
}

export type EditResult =
  | {
      ok: true;
      rubric: Rubric;
      /** What the move did, said once: "Elevation is now a minimum too (…)". */
      message?: string;
      /** Set when this move switched the weights from explicit to rank-sum. */
      switched?: WeightsSwitch;
    }
  | { ok: false; reason: string };

export const DEALBREAKER_ONLY = "This one is either a Must have or a Don't care.";
export const MINIMUM_STAYS = "A limit stays in Must have. Move the item itself to rank it.";

const without = <T>(xs: readonly T[], x: T): T[] => xs.filter((y) => y !== x);

/** A rank as words: "#1 in Really want". */
function placeWords(r: Rubric, row: RowKey): string {
  const tier = tierOf(r, row);
  const i = r.ranked.filter((c) => c.tier === tier).findIndex((c) => c.factor === row);
  return tier === "should" || tier === "could" ? `#${i + 1} in ${TIER_NAMES[tier]}` : `in ${TIER_NAMES.wont}`;
}

/**
 * Moves a card to a column, at `index` within it (the end when left out). Refused moves say why. A move that changes
 * the ranked order or a tier while the weights are explicit switches them to rank-sum and reports the switch.
 */
export function moveCard(r: Rubric, card: EditorCard, to: Tier, index?: number): EditResult {
  if (card.kind === "minimum") {
    if (to === "must") return { ok: true, rubric: r };
    if (to === "wont") return { ok: true, rubric: removeMinimum(r, card.factor) };
    return { ok: false, reason: MINIMUM_STAYS };
  }
  const f = card.factor;
  if (isGate(f)) return moveGate(r, f, to);
  if (f === "budget") return moveBudget(r, to, index);
  if (to === "must") return addMinimum(r, f);
  if (to === "wont") {
    if (tierOf(r, f) === "wont") return { ok: true, rubric: r };
    // Leaving the grade isn't a reorder: explicit weights stay (the row's weight is simply left out).
    return {
      ok: true,
      rubric: {
        ...removeMinimum(r, f),
        ranked: r.ranked.filter((c) => c.factor !== f),
        wonts: [...without(r.wonts, f), f],
      },
    };
  }
  return rank(r, f, to, index);
}

function moveGate(r: Rubric, g: GateKey, to: Tier): EditResult {
  if (to === "should" || to === "could") return { ok: false, reason: DEALBREAKER_ONLY };
  const kept = r.musts.filter((m) => !(m.factor === g && m.threshold === undefined));
  if (to === "wont") return { ok: true, rubric: { ...r, musts: kept } };
  // Back in Must, in the card's order among the gates, ahead of the minimums.
  const gates = GATE_KEYS.filter(
    (k) => k === g || kept.some((m) => m.factor === k && m.threshold === undefined),
  );
  const minimums = kept.filter((m) => m.threshold !== undefined);
  return { ok: true, rubric: { ...r, musts: [...gates.map((factor) => ({ factor })), ...minimums] } };
}

function addMinimum(r: Rubric, row: RowKey): EditResult {
  const band = MINIMUM_BAND[row];
  if (!band) return { ok: true, rubric: r };
  if (hasMinimum(r, row)) return { ok: true, rubric: r };
  const threshold = band === "sunH" ? SCREEN_CONSTANTS.bands.winterSunH[0]! : bcEdge(r.bands, band);
  const next = { ...r, musts: [...r.musts, { factor: row, threshold }] };
  const where =
    tierOf(r, row) === "wont" ? `it stays in ${TIER_NAMES.wont}` : `it also stays at ${placeWords(r, row)}`;
  return {
    ok: true,
    rubric: next,
    message: `${EDITOR_TITLES[row]} is now a must have too (${minimumWords(row, threshold)}): ${where}.`,
  };
}

function rank(r: Rubric, row: RowKey, to: "should" | "could", index?: number): EditResult {
  const rest = r.ranked.filter((c) => c.factor !== row);
  const should = rest.filter((c) => c.tier === "should"),
    could = rest.filter((c) => c.tier === "could");
  const target = to === "should" ? should : could;
  const at = Math.max(0, Math.min(index ?? target.length, target.length));
  target.splice(at, 0, { factor: row, tier: to });
  const ranked: RankedCard[] = [...should, ...could];
  const same =
    ranked.length === r.ranked.length &&
    ranked.every((c, i) => c.factor === r.ranked[i]!.factor && c.tier === r.ranked[i]!.tier);
  if (same) return { ok: true, rubric: r };
  const next: Rubric = { ...r, ranked, wonts: without(r.wonts, row) };
  if (r.weights.mode !== "explicit") return { ok: true, rubric: next };
  const switched: Rubric = { ...next, weights: { mode: "rankSum" } };
  return { ok: true, rubric: switched, switched: { before: weightsOf(r), after: weightsOf(switched) } };
}

/** Sets a row's minimum, clamped to its slider's range. */
export function setMinimum(r: Rubric, row: RowKey, value: number): Rubric {
  const band = MINIMUM_BAND[row];
  if (!band) return r;
  const v = clampTo(band, value);
  return {
    ...r,
    musts: r.musts.map((m) => (m.factor === row && m.threshold !== undefined ? { ...m, threshold: v } : m)),
  };
}

export function removeMinimum(r: Rubric, row: RowKey): Rubric {
  return { ...r, musts: r.musts.filter((m) => !(m.factor === row && m.threshold !== undefined)) };
}

const EDITOR = SCREEN_CONSTANTS.card.editor;

function clampTo(band: LimitKey, v: number): number {
  const { min, max, step } = EDITOR[band];
  const snapped = Math.round((v - min) / step) * step + min;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
}

/**
 * Moves a band's B/C edge to `value` (clamped to its slider), and its other edges by the same amount, so the band keeps
 * its steps (the design doc: "bands then step by a factor-specific amount"). An edge that would cross zero stops there.
 */
export function setBandEdge(r: Rubric, band: BandKey, value: number): Rubric {
  const edges = r.bands[band];
  const delta = clampTo(band, value) - edges[1]!;
  // No edge goes below 0, but a temperature's (step 11: a January low can be under 0 °F).
  const floor = band === "janLowF" ? -Infinity : 0;
  const shifted = edges.map((e) => Number(Math.max(floor, e + delta).toFixed(6)));
  return { ...r, bands: { ...r.bands, [band]: shifted } };
}

/** Back to today's card: explicit weights, today's bands, the four dealbreakers, no minimums. */
export const resetToDefault = (): Rubric => defaultRubric();

/** Each row's weight before and after, for the notice's table, in the default's row order. */
export function weightsTable(
  s: WeightsSwitch,
): { key: RowKey; label: string; before: number; after: number }[] {
  // Within budget only where it weighs something either side (step 10): it isn't on every list.
  return ROW_KEYS.filter((key) => key !== "budget" || s.before[key] > 0 || s.after[key] > 0).map((key) => ({
    key,
    label: EDITOR_TITLES[key],
    before: s.before[key],
    after: s.after[key],
  }));
}
