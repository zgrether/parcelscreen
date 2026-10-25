/**
 * The answer (step 7 plan §1.1): the grade and verdict with one line of reason built from the person's rubric. Up to
 * two strengths (the rows they weigh most that grade A or B) and the biggest miss (the row that costs the grade most),
 * each against their own B/C edge: "Contender · B. Strong winter sun and trails; 38 minutes to an ER is past your 30-minute limit."
 * A Must comes first: a failed one, a limit not met, or something to check. Pure, from a card and its result.
 *
 * The card's own reason line ("Contender. Weakest part: …") is unchanged; it's in the Grade and verdict panel.
 */
import { fmt } from "../format";
import { REAL_GROCERY, type DriveEntry } from "../screen/driveList";
import type { PartialScreenResult } from "../screen/types";
import { weightsOf } from "../rubric/weights";
import type { RowKey } from "../rubric/types";
import { EDITOR_TITLES } from "../rubric/words";
import { listOf, lowerFirst, VERDICT_WORD, type Card, type Row } from "./card";
import { letterText, shownLetter } from "./adjust";

/** Each row as a strength, after "Strong". */
export const STRENGTH: Record<RowKey, string> = {
  elevation: "elevation",
  homesite: "winter sun",
  sky: "dark skies",
  room: "room to build",
  driveway: "driveway",
  trails: "trails",
  town: "groceries nearby",
  hospital: "ER access",
  climate: "climate",
  privacy: "privacy",
  longView: "a long view",
  airport: "airport access",
  longTrail: "a long trail nearby",
  internet: "a clear sky for a dish",
  garden: "garden ground",
  budget: "budget fit",
};

const KM_PER_MI = 1.609344;
const edge = (bands: readonly number[]): number => bands[1]!;

/** The grocery drive the Town row reads: the nearer of the real grocery and the closer one (card.ts town). */
function groceryMin(r: PartialScreenResult): number | null {
  const gs = [r.drives?.find((d) => d.label === REAL_GROCERY), r.closerGrocery].filter(
    (d): d is DriveEntry => !!d,
  );
  return gs.length ? Math.min(...gs.map((d) => d.min)) : null;
}

/** A row past its B/C edge, in the person's terms: "38 minutes to an ER is past your 30-minute limit". */
export function missLine(row: Row, card: Card, r: PartialScreenResult): string {
  const b = card.rubric.rubric.bands;
  const v = row.measure?.value;
  switch (row.key) {
    case "elevation":
      if (v !== undefined) return `${fmt(v)} ft is below your ${fmt(edge(b.elevationFt))} ft`;
      break;
    case "homesite":
      if (v !== undefined)
        return `the best homesite grades ${letterText(shownLetter(card, row.key))} (${fmt(v, 1)} h of December sun)`;
      break;
    case "sky":
      if (v !== undefined)
        return `the night sky (${fmt(v, 1)}) is brighter than your ${fmt(edge(b.skyMag), 1)}`;
      break;
    case "room":
      if (v !== undefined)
        return `gentle ground is ${fmt(v, v < 10 ? 1 : 0)}× the build footprint, under your ${fmt(edge(b.roomX), 2).replace(/\.?0+$/, "")}×`;
      break;
    case "driveway":
      if (v !== undefined)
        return `the driveway is ${fmt(v)}% at its steepest, past your ${fmt(edge(b.drivewayPct))}% limit`;
      break;
    case "trails":
      if (row.measure?.unit === "min" && v !== undefined)
        return `the nearest trailhead is ${fmt(v)} minutes away, past your ${fmt(edge(b.trailheadMin))}-minute limit`;
      if (row.measure?.unit === "km" && v !== undefined)
        return `the nearest trailhead is ${fmt(v / KM_PER_MI, 1)} mi away`;
      break;
    // Step 11 (plan §2.1): the ER's miss is Hospital's, in the words Town used for it.
    case "town": {
      const g = groceryMin(r);
      if (g !== null && g > edge(b.groceryMin))
        return `${fmt(g)} minutes to groceries is past your ${fmt(edge(b.groceryMin))}-minute limit`;
      break;
    }
    case "hospital":
      if (v !== undefined && v > edge(b.erMin))
        return `${fmt(v)} minutes to an ER is past your ${fmt(edge(b.erMin))}-minute limit`;
      break;
    case "privacy": {
      // Step 11: the houses in sight past the limit first, then the nearest house too near.
      const spot = r.house && !("outside" in r.house) ? r.house : r.sites?.[card.at];
      const near = spot?.privacy?.nearestFt ?? null;
      if (v !== undefined && v > edge(b.privacySight))
        return `${fmt(v)} ${v === 1 ? "house is" : "houses are"} in sight, past your limit of ${fmt(edge(b.privacySight))}`;
      if (near !== null && near < edge(b.privacyFt))
        return `the nearest house is ${fmt(near)} ft away, nearer than your ${fmt(edge(b.privacyFt))} ft`;
      break;
    }
    case "airport":
      if (v !== undefined && v > edge(b.airportMin))
        return `${fmt(v)} minutes to an airport is past your ${fmt(edge(b.airportMin))}-minute limit`;
      break;
    case "longTrail":
      if (v !== undefined && v > edge(b.longTrailMin))
        return `${fmt(v)} minutes to a long trail is past your ${fmt(edge(b.longTrailMin))}-minute limit`;
      break;
    case "internet":
      if (v !== undefined && v < edge(b.dishClearPct))
        return `the best dish spot has ${fmt(v)}% open sky, under your ${fmt(edge(b.dishClearPct))}%`;
      break;
    case "budget":
      // Within budget (step 10): the budgets at its worst, "ready to build $330–595k, over your $300k".
      if (row.budget) return row.budget.reason;
      break;
    case "garden":
      if (v !== undefined)
        return `${fmt(v, 2).replace(/\.?0+$/, "")} ac of garden ground, under your ${fmt(edge(b.gardenAc), 2).replace(/\.?0+$/, "")} ac`;
      break;
  }
  // No number to say it with ("no trailhead found", "no driveway route reaches site #3"): the row's own line.
  return row.detail;
}

/** The two the person weighs most among the rows graded A or B, heaviest first. */
export function strengths(card: Card): Row[] {
  const w = weightsOf(card.rubric.rubric);
  return card.rows
    .filter((x) => x.grade === "A" || x.grade === "B")
    .filter((x) => w[x.key] > 0)
    .sort((a, b) => w[b.key] - w[a.key] || card.rows.indexOf(a) - card.rows.indexOf(b))
    .slice(0, 2);
}

/** The row at C or worse that costs the grade most: its weight times the points it's short of a B. */
export function biggestMiss(card: Card): Row | null {
  const R = card.rubric.rubric;
  const w = weightsOf(R);
  const cost = (x: Row) => w[x.key] * (R.points.B - R.points[x.grade!]);
  return (
    card.rows
      .filter((x) => x.grade !== null && R.points[x.grade] < R.points.B && w[x.key] > 0)
      .sort(
        (a, b) => cost(b) - cost(a) || w[b.key] - w[a.key] || card.rows.indexOf(a) - card.rows.indexOf(b),
      )[0] ?? null
  );
}

/** "a", "a and b". */
const and = (xs: string[]): string => xs.join(" and ");
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What to check first, by name: the person's Musts that warn, and a build that doesn't fit, in the card's order
 * in the priorities page's words ("legal road access", "driveway on your land"). Their whole sentences are on the card's
 * Must rows.
 */
export function checks(card: Card): string[] {
  const R = card.rubric.rubric;
  const must = (k: string) => R.musts.some((m) => m.factor === k && m.threshold === undefined);
  return [
    ...card.gates.filter((g) => must(g.key) && g.status === "warn").map((g) => EDITOR_TITLES[g.key]),
    // Within budget as a Must (step 10), when its range straddles a budget.
    ...(card.budgetMust?.status === "warn" ? [EDITOR_TITLES.budget] : []),
    ...card.rows.filter((x) => x.checkFirst).map((x) => EDITOR_TITLES[x.key]),
  ].map((l) => l.charAt(0).toLowerCase() + l.slice(1));
}

/**
 * The answer's reason: strengths, then the miss, each optional (plan §1.1). The miss is, in order: a failed Must ("fails
 * your must: …") or a limit not met; what to check first, when that's what holds an A or B at Maybe; the row that costs
 * the grade most; else what to check first. What to check first closes the line when the miss didn't say it (the
 * fresh-eyes review: a Contender's warning was on its Must row alone), unless a Must already fails.
 */
export function answerReason(card: Card, r: PartialScreenResult): string {
  const strong = strengths(card).map((x) => STRENGTH[x.key]);
  const lead = card.lead;
  const toCheck = checks(card);
  const checkFirst = toCheck.length ? `check first: ${and(toCheck)}` : null;
  const held = (card.grade === "A" || card.grade === "B") && card.verdict === "Maybe";
  const m = biggestMiss(card);
  const miss =
    lead.kind === "fail"
      ? `fails your must: ${lead.text}`
      : lead.kind === "limit"
        ? lead.text
        : held && checkFirst
          ? checkFirst
          : m
            ? missLine(m, card, r)
            : checkFirst;
  const failed = lead.kind === "fail" || lead.kind === "limit";
  const also = !failed && checkFirst && miss !== checkFirst ? checkFirst : null;
  const parts = [strong.length ? `Strong ${and(strong)}` : null, miss, also].filter((x): x is string => !!x);
  const line = parts.length ? `${cap(parts.join("; "))}.` : "";
  const aside = asideMustsLine(card);
  return [line, aside].filter((x) => !!x).join(" ");
}

/**
 * The Musts the person set aside on this parcel (step 12, plan §3), named after the reason (rule 7: appended): "You set
 * aside a must-have: Elevation.", and the factors they overrode: "…, with 1 override: Night sky.", or "With 1 override:
 * Night sky." alone. Null when there are none.
 */
export function asideMustsLine(card: Card): string | null {
  const musts = (card.setAside ?? []).filter((x) => x.must).map((x) => EDITOR_TITLES[x.key]);
  // Step 12's parked question 1 (owner, 10/22): the overrides are named too, after the set-aside Musts.
  const overridden = [...card.gates, ...card.rows]
    .filter((x) => !!x.adjusted)
    .map((x) => EDITOR_TITLES[x.key]);
  const over = [...new Set(overridden)];
  const overWords = over.length
    ? `with ${over.length} override${over.length === 1 ? "" : "s"}: ${over.join(", ")}`
    : null;
  if (!musts.length) return overWords ? `${overWords.charAt(0).toUpperCase()}${overWords.slice(1)}.` : null;
  const aside =
    musts.length === 1
      ? `You set aside a must-have: ${musts[0]}`
      : `You set aside ${musts.length} must-haves: ${musts.join(", ")}`;
  return overWords ? `${aside}, ${overWords}.` : `${aside}.`;
}

/**
 * J-4 (Zach, UX part 2): the verdict leads and the letter follows, with a joining word when they part. A Must that
 * fails makes it Not for us whatever the rest is worth ("but misses a must"); a Contender's grade held at Maybe says by
 * what ("held by: septic"). The verdict is the decision; the letter is how good the rest is.
 */
export interface VerdictParts {
  verdict: string;
  grade: string;
  join: string | null;
}

export function verdictParts(card: Pick<Card, "verdict" | "grade" | "lead" | "heldBy">): VerdictParts {
  const misses =
    card.verdict === "Pass" &&
    card.grade !== null &&
    (card.lead?.kind === "fail" || card.lead?.kind === "limit");
  const held = card.verdict === "Maybe" && card.heldBy?.length ? card.heldBy : null;
  return {
    verdict: VERDICT_WORD[card.verdict],
    grade: card.grade ?? "–",
    join: misses ? "but misses a must" : held ? `held by: ${listOf(held.map(lowerFirst))}` : null,
  };
}

/** "Not for us · B, but misses a must", "Maybe · A, held by: septic", "Contender · B". */
export const verdictLine = (card: Pick<Card, "verdict" | "grade" | "lead" | "heldBy">): string => {
  const p = verdictParts(card);
  return `${p.verdict} · ${p.grade}${p.join ? `, ${p.join}` : ""}`;
};

/**
 * The answer, whole: "Contender · B. Strong winter sun and trails; 38 minutes to an ER is past your 30-minute limit."
 * The verdict first (J-4); the reason says what a joining word would, so there's none here.
 */
export function answerLine(card: Card, r: PartialScreenResult): string {
  const reason = answerReason(card, r);
  const p = verdictParts(card);
  return `${p.verdict} · ${p.grade}.${reason ? ` ${reason}` : ""}`;
}

/** What didn't load, for the line under the answer: "Incomplete: the FEMA flood map didn't load." */
export function incompleteLine(card: Card): string | null {
  const xs = card.incomplete;
  if (!xs.length) return null;
  const list = xs.length < 2 ? xs[0]! : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
  return `Incomplete: ${list} didn't load.`;
}
