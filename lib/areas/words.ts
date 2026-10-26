/**
 * The area catalog's words (step 13, docs/plans/step-13-area-catalog.md §4.2–§4.3, §8: declared, new strings only):
 * a card's why and trade-off lines, its Must share, and the box's labels. Pure; the suggestion box and the tests read
 * them.
 */
import { fmt } from "../format";
import { listOf, zoneOfMag } from "../report/card";
import type { Letter } from "../rubric/types";
import { EDITOR_TITLES } from "../rubric/words";
import { weightsOf } from "../rubric/weights";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { AreaCard, AreaFactor } from "./score";
import type { AreaFile } from "./types";

type M = AreaFile["medians"];

/** A factor at its median, said as a reason to come: "dark skies (zone 2b)". Null when unmeasured. */
function good(f: AreaFactor, m: M): string | null {
  switch (f) {
    case "elevation":
      return m.elevFt === null ? null : `land at ${fmt(m.elevFt)} ft`;
    case "sky":
      return m.skyMag === null ? null : `dark skies (zone ${zoneOfMag(m.skyMag)[0]})`;
    case "trails":
      if (m.openLandFt !== null && m.openLandFt <= SCREEN_CONSTANTS.areas.adjoinFt)
        return "public land next door";
      return m.trailheadMin === null ? null : `a trailhead ${fmt(m.trailheadMin)} min away`;
    case "town":
      return m.groceryMin === null ? null : `groceries ${fmt(m.groceryMin)} min away`;
    case "hospital":
      return m.erMin === null ? null : `an ER ${fmt(m.erMin)} min away`;
    case "climate":
      return m.janLowF === null || m.julHighF === null
        ? null
        : `January lows of ${fmt(m.janLowF)} °F, July highs of ${fmt(m.julHighF)} °F`;
    case "longView":
      return m.viewOpenPct === null ? null : `long views (${fmt(m.viewOpenPct)}% open)`;
    case "airport":
      return m.airportMin === null ? null : `an airport ${fmt(m.airportMin)} min away`;
    case "longTrail":
      return m.longTrailMin === null ? null : `a long trail ${fmt(m.longTrailMin)} min away`;
    case "paddling":
      return m.paddleMin === null ? null : `a lake launch ${fmt(m.paddleMin)} min away`;
  }
}

/** A factor at its median, said as what it costs: "48 minutes to an ER". */
function cost(f: AreaFactor, m: M): string | null {
  switch (f) {
    case "elevation":
      return m.elevFt === null ? null : `land around ${fmt(m.elevFt)} ft`;
    case "sky":
      return m.skyMag === null ? null : `a brighter sky (zone ${zoneOfMag(m.skyMag)[0]})`;
    case "trails":
      return m.trailheadMin === null ? null : `${fmt(m.trailheadMin)} minutes to a trailhead`;
    case "town":
      return m.groceryMin === null ? null : `${fmt(m.groceryMin)} minutes to groceries`;
    case "hospital":
      return m.erMin === null ? null : `${fmt(m.erMin)} minutes to an ER`;
    case "climate":
      return good("climate", m);
    case "longView":
      return m.viewOpenPct === null ? null : `few long views (${fmt(m.viewOpenPct)}% open)`;
    case "airport":
      return m.airportMin === null ? null : `${fmt(m.airportMin)} minutes to an airport`;
    case "longTrail":
      return m.longTrailMin === null ? null : `${fmt(m.longTrailMin)} minutes to a long trail`;
    case "paddling":
      return m.paddleMin === null ? null : `${fmt(m.paddleMin)} minutes to a lake launch`;
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Why it fits (§4.3): the two heaviest factors in the person's rubric that earn an A or a B here, with their medians:
 * "Dark skies (zone 2b) and land at 3,400 ft." Null when none does.
 */
export function whyLine(card: AreaCard, area: AreaFile): string | null {
  const w = weightsOf(card.rubric.rubric);
  const top = card.rows
    .filter((r) => (r.grade === "A" || r.grade === "B") && w[r.key] > 0)
    .sort((a, b) => w[b.key] - w[a.key])
    .slice(0, 2)
    .map((r) => good(r.key, area.medians))
    .filter((x): x is string => !!x);
  return top.length ? `${capital(top.join(" and "))}.` : null;
}

/** The trade-off line when no counted factor costs points. */
export const NOTHING_BELOW_B = "No weak spots for you: every factor here is a B or better.";

/**
 * The trade-off (§4.3): the factor that costs the most points below a B (its weight times the points it misses):
 * "48 minutes to an ER."
 */
export function tradeOffLine(card: AreaCard, area: AreaFile): string {
  const R = card.rubric.rubric;
  const w = weightsOf(R);
  const missing = (g: Letter) => Math.max(0, R.points.B - R.points[g]);
  const worst = card.rows
    .filter(
      (r): r is typeof r & { grade: Letter } => r.grade !== null && w[r.key] > 0 && missing(r.grade) > 0,
    )
    .sort((a, b) => w[b.key] * missing(b.grade) - w[a.key] * missing(a.grade))[0];
  const line = worst ? cost(worst.key, area.medians) : null;
  return line ? `${capital(line)}.` : NOTHING_BELOW_B;
}

/** Each limit as the share sentence says it: "above 3,000 ft", "within 30 minutes of an ER". */
function limitWords(l: AreaCard["limits"][number]): string {
  const t = fmt(l.threshold);
  switch (l.factor) {
    case "elevation":
      return `at least ${t} ft up`;
    case "sky":
      return `darker than ${fmt(l.threshold, 1)} mag/arcsec²`;
    case "hospital":
      return `within ${t} minutes of an ER`;
    case "town":
      return `within ${t} minutes of groceries`;
    case "airport":
      return `within ${t} minutes of an airport`;
    case "trails":
      return `within ${t} minutes of a trailhead`;
    case "longTrail":
      return `within ${t} minutes of a long trail`;
    case "paddling":
      return `within ${t} minutes of a lake launch`;
    default:
      return "";
  }
}

/** Said when the person has no Must an area can measure. */
export const MUSTS_PARCEL_SCALE =
  "Your must-haves are about the parcel itself (flood, road access, septic), so they're checked on each parcel.";

/**
 * The Must share (§4.2), the brief's own sentence: "41% of rural land here is at least 3,000 ft up and within 30
 * minutes of an ER". "from N points" when the area is thin.
 */
export function mustShareLine(card: AreaCard, area: AreaFile): string {
  if (!card.limits.length) return MUSTS_PARCEL_SCALE;
  const pct = Math.round(card.mustShare * 100);
  const thin = area.thin ? ` (from ${card.sharePoints} points)` : "";
  return `${pct}% of rural land here is ${listOf(card.limits.map(limitWords).filter(Boolean))}${thin}.`;
}

/** The Must share split for the card's headline (owner, #298 answers): "41%", then the rest. Null with no limits. */
export function mustShareParts(card: AreaCard, area: AreaFile): { pct: string; rest: string } | null {
  if (!card.limits.length) return null;
  const line = mustShareLine(card, area);
  const at = line.indexOf(" ");
  return { pct: line.slice(0, at), rest: line.slice(at + 1) };
}

/** The fit with its rank (owner, 10/23): "C+ · #3 of 30 for you". */
export const rankLine = (fit: string | null, rank: number, total: number): string =>
  `${fit ?? "–"} · #${rank} of ${total} for you`;

/** What holds an area back (owner, 10/23): the Must failing on the most land, then the two weakest graded factors. */
export interface HoldsBack {
  /** "Only 12% of rural land here is within 15 minutes of a trailhead"; null with no limits, or when every limit passes everywhere. */
  must: string | null;
  /** "Trails and public land, D: 48 minutes to a trailhead", the two weakest, weakest first. */
  weakest: string[];
}

export function holdsBack(card: AreaCard, area: AreaFile): HoldsBack {
  const worstLimit = [...card.limitShares].sort((a, b) => a.share - b.share)[0];
  const pct = worstLimit ? Math.round(worstLimit.share * 100) : 100;
  const must =
    worstLimit && pct < 100
      ? pct === 0
        ? `None of the rural land here is ${limitWords(worstLimit)}.`
        : `Only ${pct}% of rural land here is ${limitWords(worstLimit)}.`
      : null;
  const R = card.rubric.rubric;
  const w = weightsOf(R);
  const weakest = card.rows
    .filter((r): r is typeof r & { grade: Letter } => r.grade !== null && w[r.key] > 0)
    .sort((a, b) => R.points[a.grade] - R.points[b.grade] || w[b.key] - w[a.key])
    .slice(0, 2)
    .map((r) => {
      const v = cost(r.key, area.medians);
      return `${EDITOR_TITLES[r.key]}, ${r.grade}${v ? `: ${v}` : ""}`;
    });
  return { must, weakest };
}

/** A limit as a name: "15-minute trailhead limit". */
export function limitName(l: AreaCard["limits"][number]): string {
  const t = fmt(l.threshold);
  switch (l.factor) {
    case "elevation":
      return `${t} ft elevation limit`;
    case "sky":
      return `dark-sky limit (${fmt(l.threshold, 1)} mag/arcsec²)`;
    case "hospital":
      return `${t}-minute ER limit`;
    case "town":
      return `${t}-minute grocery limit`;
    case "airport":
      return `${t}-minute airport limit`;
    case "trails":
      return `${t}-minute trailhead limit`;
    case "longTrail":
      return `${t}-minute long-trail limit`;
    case "paddling":
      return `${t}-minute lake-launch limit`;
    default:
      return "limit";
  }
}

/** The catalog-wide line (owner, 10/23): one Must rules out most of the region. */
export const regionLine = (l: AreaCard["limits"][number]): string =>
  `Your ${limitName(l)} rules out most of the region; that's why few areas fit.`;

/** Why a ranked area isn't among the five (owner, 10/23): under the 10% rule. */
export const notSuggestedReason = (card: AreaCard): string =>
  `only ${Math.round(card.mustShare * 100)}% passes your must-haves`;

/** The box's and the card's labels (§8). */
export const AREA_WORDS = {
  afterInterview: "Areas that fit you",
  onTheMap: "Where to look",
  showMore: "Show more",
  showFewer: "Show fewer",
  fit: (g: string) => `Fit ${g}`,
  showParcel: "Show me a parcel here",
  tradeOff: "Trade-off:",
  star: "Star this area",
  starred: "Starred",
  typical: (n: number) => `Typical values: the middle of ${n} sampled spots on rural land here.`,
  ranked: "Ranked by how well typical land here fits your priorities.",
  moreHeading: (n: number) => `${n} more ${n === 1 ? "area" : "areas"}, ranked`,
  parcelScale:
    "Parcel-scale must-haves (floodplain, road access, easement, septic) are checked parcel by parcel.",
  failed: (n: number) => `${n} ${n === 1 ? "area" : "areas"} didn't load.`,
  tryAgain: "Try again",
  noRubric: "Answer the questions first",
  noneSuggested: "No area passes your must-haves on 10% of its land.",
  showAll: "Show all ranked",
  outlines: "Area outlines",
  holdsBack: "What holds it back",
  legend:
    "Colour: your fit (green A–B, amber C, red D–F). A stronger fill: more of the land passes your must-haves.",
  changeIt: "Change it",
} as const;

/** A sample parcel's words (§5, §8). */
export const SAMPLE_WORDS = {
  tag: "Sample parcel",
  other: "Show the other sample",
  readOnly: "An example lot, not a listing: add it to your list to edit it",
  failed: "This sample didn't load.",
} as const;
