/**
 * What the rubric editor does to a rubric (step 3, docs/plans/step-3-rubric-editor.md §1–§4; phase-0.md §9.50). Pure:
 * every operation takes a rubric and returns a new one, or the reason it's refused; the editor saves the result, and a
 * rubric change never asks for a re-screen.
 *
 * - The columns: a dealbreaker is a Must or a Won't; a row is ranked (Should, Could) or a Won't, and can hold a minimum
 *   in Must besides (its ranked card stays, marked "min"); homesite can't (it has no measure).
 * - The weights stay explicit until the first change to the ranked order or a tier, which switches the rubric to
 *   rank-sum at once (owner, 10/17: no confirm; the editor shows what changed, with Undo).
 * - A slider moves a band's B/C edge, and the band's other edges move with it by the same amount.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { defaultRubric } from "./default";
import {
  bcEdge,
  FACTOR_LABELS,
  isGate,
  MINIMUM_BAND,
  minimumWords,
  tierOf,
  type BandKey,
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
  return {
    must: [
      ...gatesIn("must"),
      ...r.musts
        .filter((m) => m.threshold !== undefined)
        .map((m): EditorCard => ({ kind: "minimum", factor: m.factor as RowKey })),
    ],
    should: r.ranked.filter((c) => c.tier === "should").map((c) => ({ kind: "factor", factor: c.factor })),
    could: r.ranked.filter((c) => c.tier === "could").map((c) => ({ kind: "factor", factor: c.factor })),
    wont: [...gatesIn("wont"), ...r.wonts.map((factor): EditorCard => ({ kind: "factor", factor }))],
  };
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

export const DEALBREAKER_ONLY = "A dealbreaker is a Must or a Won't.";
export const NO_HOMESITE_MINIMUM =
  "Best homesite is graded by the site's quality: it has no number to set a minimum on.";
export const MINIMUM_STAYS = "A minimum stays in Must. Move the row's own card to rank it.";

const without = <T>(xs: readonly T[], x: T): T[] => xs.filter((y) => y !== x);

/** A rank as words: "#1 in Should". */
function placeWords(r: Rubric, row: RowKey): string {
  const tier = tierOf(r, row);
  const i = r.ranked.filter((c) => c.tier === tier).findIndex((c) => c.factor === row);
  return tier === "should" || tier === "could"
    ? `#${i + 1} in ${tier === "should" ? "Should" : "Could"}`
    : "in Won't";
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
  if (!band) return { ok: false, reason: NO_HOMESITE_MINIMUM };
  if (hasMinimum(r, row)) return { ok: true, rubric: r };
  const threshold = bcEdge(r.bands, band);
  const next = { ...r, musts: [...r.musts, { factor: row, threshold }] };
  const where =
    tierOf(r, row) === "wont" ? "it stays in Won't" : `its card stays at ${placeWords(r, row)}, marked min`;
  return {
    ok: true,
    rubric: next,
    message: `${FACTOR_LABELS[row]} is now a minimum too (${minimumWords(row, threshold)}): ${where}.`,
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

function clampTo(band: BandKey, v: number): number {
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
  const shifted = edges.map((e) => Number(Math.max(0, e + delta).toFixed(6)));
  return { ...r, bands: { ...r.bands, [band]: shifted } };
}

/** Back to today's card: explicit weights, today's bands, the four dealbreakers, no minimums. */
export const resetToDefault = (): Rubric => defaultRubric();

/** Each row's weight before and after, for the notice's table, in the default's row order. */
export function weightsTable(
  s: WeightsSwitch,
): { key: RowKey; label: string; before: number; after: number }[] {
  return ROW_KEYS.map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    before: s.before[key],
    after: s.after[key],
  }));
}
