/**
 * Divide's answer (step 14 §3.1, §3.3): two numbers, each with what binds it (owner, #311). Without subdivision review,
 * by the county's own route (a farm division, a statute's exempt lots), where it has one; and with an approved
 * subdivision plat, by divide.ts's count of standard lots (lot size, road frontage). What decides it shows the parcel's
 * arithmetic, each line with the ordinance's section and its URL. Yes: either way gives 2 lots or more. Maybe: the plat's
 * count rests on an assumed district or unmeasured frontage, or 1 lot by frontage where the county has a way around it.
 * No: 1 lot both ways, or a county not covered. Pure.
 */
import { countyByFips, noReviewRoute, type CountyRules } from "../config/counties";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { PartialScreenResult } from "../screen/types";
import {
  divide,
  divideHeadline,
  divideLimit,
  noReviewCount,
  type DivideResult,
  type NoReviewCount,
} from "./divide";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { DIVIDE, MISSING, REPORT_DIVIDE, SOURCE } from "./words";

/** An exception that reaches a lot without its own frontage: what could make a frontage-limited count 2. */
const ACCESS_EXCEPTION = /private|right-of-way|flag|panhandle/i;

const slopePct = (r: PartialScreenResult): number | null =>
  r.terrain ? Math.tan((r.terrain.slopeMedDeg * Math.PI) / 180) * 100 : null;

/** The acres Divide counts on, and the two readings when the listing gives its own. */
export interface DivideAcres {
  acres: number;
  on: "listed" | "boundary";
  listed: number | null;
  boundary: number;
  /** They differ by more than $/ac's cutoff: the reason says so. */
  differs: boolean;
}

/**
 * Owner, #311: the listing's acres when they're entered, the same rule as $/ac (lib/report/perAcre.ts), else the county
 * map's boundary.
 */
export function divideAcres(
  boundary: number,
  listedAcres: number | null | undefined,
  pct: number = SCREEN_CONSTANTS.card.perAcreDiffPct,
): DivideAcres {
  const listed = listedAcres != null && listedAcres > 0 ? listedAcres : null;
  return {
    acres: listed ?? boundary,
    on: listed !== null ? "listed" : "boundary",
    listed,
    boundary,
    differs: listed !== null && Math.abs(listed - boundary) > (boundary * pct) / 100,
  };
}

/** The acres as the words say them: the listing's as typed ("24.7"), the boundary's to two places ("30.15"). */
const acresText = (a: DivideAcres): string =>
  (a.on === "listed" ? DIVIDE.listedAcres(a.acres) : DIVIDE.exactAcres(a.acres)).replace(/ ac$/, "");
const boundaryText = (a: DivideAcres): string => DIVIDE.exactAcres(a.boundary).replace(/ ac$/, "");

/** "…; on 24.7 listed ac (the county map shows 30.15)", when the two differ. */
const withAcres = (reason: string, a: DivideAcres): string =>
  a.differs ? DIVIDE.withNote(reason, DIVIDE.onListed(acresText(a), boundaryText(a))) : reason;

/** The count's inputs from the result: its acres (the listing's, when typed), frontage, slope, county and district. */
export function divideOf(r: PartialScreenResult, listedAcres: number | null = null): DivideResult | null {
  if (!r.county) return null;
  return divide({
    acres: divideAcres(r.acres, listedAcres).acres,
    publicFrontageFt: r.frontage?.publicFt ?? null,
    slopePct: slopePct(r),
    county: countyByFips(r.county.fips),
    district: r.county.zoning?.districts[0]?.code ?? null,
  });
}

/** The ordinance's section at the end of a fact's words: "(§4-6.3)", "(Art. 5)", "(TCA 13-3-401)". */
const sectionOf = (says: string): string | null => {
  const inParens = /\(([^()]*(?:§|Art\.|TCA|Table)[^()]*)\)\s*$/.exec(says)?.[1];
  // "(no public water or sewer; Table 4-2-0)": the part that names the section.
  return (
    inParens
      ?.split(";")
      .findLast((p) => /§|Art\.|TCA|Table/.test(p))
      ?.trim() ?? null
  );
};

const ruleFact = (
  label: string,
  f: { says: string; confidence: string; source: string; checked: string },
): Fact => ({
  label,
  value: DIVIDE.says(f.says, f.confidence),
  source: f.source,
  date: f.checked,
});

/** A line of the parcel's arithmetic, with the rule's section after it and the rule's URL as its source. */
const mathFact = (
  label: string,
  value: string,
  rule: { says: string; source: string; checked: string },
): Fact => {
  const section = sectionOf(rule.says);
  return { label, value: section ? `${value} (${section})` : value, source: rule.source, date: rule.checked };
};

/** What binds the plat's count, in words: "lot size", "road frontage", or both. */
const platBinds = (d: Extract<DivideResult, { kind: "lots" }>): string =>
  d.binding === "frontage"
    ? DIVIDE.bindsFrontage
    : d.binding === "both"
      ? DIVIDE.bindsBoth
      : DIVIDE.bindsSize;

/** Mud Creek's arithmetic, the plat's and the no-review route's, each line naming what binds. */
function arithmetic(a: DivideAcres, d: DivideResult, free: NoReviewCount | null): Fact[] {
  if (d.kind !== "lots") return [];
  const acres = acresText(a);
  const c = d.county;
  return [
    a.listed !== null
      ? {
          label: DIVIDE.acresLabel,
          value: DIVIDE.acresBoth(DIVIDE.listedAcres(a.listed).replace(/ ac$/, ""), boundaryText(a)),
          source: SOURCE.listing,
        }
      : { label: DIVIDE.acresLabel, value: DIVIDE.exactAcres(a.boundary), source: SOURCE.parcel },
    ...(free
      ? [
          mathFact(
            DIVIDE.withoutReviewLabel,
            `${DIVIDE.withoutReviewMath(acres, free.route.lotAc, free.route.inclusive, free.byAcres, free.route.maxLots)}; ${DIVIDE.binds(free.lots, free.capped ? DIVIDE.bindsCap : DIVIDE.bindsSize)}`,
            free.route,
          ),
        ]
      : []),
    mathFact(DIVIDE.bySizeLabel, DIVIDE.bySize(acres, d.minLotAc, d.byAcres), c.minLotAc),
    ...(d.byFrontage !== null && d.publicFrontageFt !== null && d.frontagePerLotFt !== null
      ? [
          mathFact(
            DIVIDE.byFrontageLabel,
            DIVIDE.byFrontage(d.publicFrontageFt, d.frontagePerLotFt, d.byFrontage),
            c.frontageFt,
          ),
        ]
      : []),
    { label: DIVIDE.withPlatLabel, value: DIVIDE.binds(d.lots, platBinds(d)) },
  ];
}

function countyFacts(
  r: PartialScreenResult,
  a: DivideAcres,
  c: CountyRules,
  d: DivideResult,
  free: NoReviewCount | null,
): Fact[] {
  const districts = r.county?.zoning?.districts ?? [];
  const zoning: Fact = !c.zoning.value
    ? ruleFact(DIVIDE.zoningLabel, c.zoning)
    : districts.length
      ? { label: DIVIDE.zoningLabel, value: districts.map((x) => DIVIDE.district(x.code, x.name)).join(", ") }
      : {
          label: DIVIDE.zoningLabel,
          value: DIVIDE.assumedDefault,
          source: c.ruralDistrict.source,
          date: c.ruralDistrict.checked,
        };
  const math = arithmetic(a, d, free);
  return [
    { label: DIVIDE.countyLabel, value: `${c.name}, ${c.state}` },
    ruleFact(DIVIDE.ordinanceLabel, c.ordinance),
    zoning,
    ...(math.length ? math : [{ label: DIVIDE.acresLabel, value: DIVIDE.acres(a.acres) }]),
    ruleFact(DIVIDE.minLotLabel, c.minLotAc),
    ruleFact(DIVIDE.frontageRuleLabel, c.frontageFt),
    r.frontage
      ? {
          label: DIVIDE.frontageLabel,
          value: DIVIDE.frontageMeasured(r.frontage.publicFt),
          source: SOURCE.tiger,
        }
      : { label: DIVIDE.frontageLabel, value: MISSING.frontage },
    // Owner, #311: the boundary the frontage is measured along is known to be off.
    ...(a.differs
      ? [
          {
            label: DIVIDE.noteLabel,
            value: DIVIDE.boundaryDisagrees(
              DIVIDE.listedAcres(a.listed!).replace(/ ac$/, ""),
              boundaryText(a),
            ),
          },
        ]
      : []),
    // Each as the county's own words: "could allow more" read wrong beside a count it doesn't reach (fresh-eyes review).
    ...c.exceptions.map((e) => ruleFact(DIVIDE.exceptionLabel, e)),
    ruleFact(DIVIDE.reviewLabel, c.review),
    ...(c.exemptOverAc.value !== null ? [ruleFact(DIVIDE.exemptLabel, c.exemptOverAc)] : []),
    ...c.notes.map((n) => ({ label: DIVIDE.noteLabel, value: n })),
  ];
}

/**
 * The two numbers in one line, each with what binds it; null when neither reaches 2 lots. The plat's count names a road
 * standard when its frontage binds and the county allows lots off a road built to its standard.
 */
function twoWays(
  d: Extract<DivideResult, { kind: "lots" }>,
  free: NoReviewCount | null,
  a: DivideAcres,
): string | null {
  const first =
    free && free.lots >= 2
      ? DIVIDE.withoutReview(
          free.lots,
          free.route.term,
          free.capped
            ? DIVIDE.noReviewByCap(free.route.maxLots!)
            : DIVIDE.noReviewBySize(acresText(a), free.route.lotAc, free.route.inclusive),
        )
      : null;
  const road =
    d.binding !== "size" && d.county.exceptions.some((e) => ACCESS_EXCEPTION.test(e.value))
      ? `; ${DIVIDE.roadStandard}`
      : "";
  const plat = d.lots >= 2 ? DIVIDE.withPlat(d.lots, `${divideLimit(d)}${road}`, !first) : null;
  return first && plat ? DIVIDE.bothWays(first, plat) : (first ?? plat);
}

/**
 * One page's Divide line (§7): "Can divide: up to 3 lots without subdivision review (…) · up to 8 with an approved
 * subdivision plat (…)", or "Can't divide: limited by …". Only where the county is covered and its minimum lot size is
 * known; null otherwise.
 */
export function divideReportLine(r: PartialScreenResult, listedAcres: number | null = null): string | null {
  const a = divideAcres(r.acres, listedAcres);
  const d = divideOf(r, listedAcres);
  if (!d || d.kind !== "lots") return null;
  const both = twoWays(d, noReviewCount(a.acres, noReviewRoute(d.county)), a);
  return both ? REPORT_DIVIDE.can(withAcres(both, a)) : REPORT_DIVIDE.cant(withAcres(divideLimit(d), a));
}

export function divideUse({ result: r, listing }: UsesInput): UseAnswer {
  const a = divideAcres(r.acres, listing.listingAcres);
  const d = divideOf(r, a.listed);
  const answer = divideAnswer(r, a, d);
  // Where the acres were counted, the reason says which acres when the two readings differ.
  return d?.kind === "lots" ? { ...answer, reason: withAcres(answer.reason, a) } : answer;
}

function divideAnswer(r: PartialScreenResult, a: DivideAcres, d: DivideResult | null): UseAnswer {
  if (!d) return { answer: "maybe", reason: MISSING.county, decides: [] };
  if (d.kind === "notCovered")
    return {
      answer: "no",
      reason: DIVIDE.notCovered,
      decides: [{ label: DIVIDE.countyLabel, value: `${r.county!.name}, ${r.county!.state}` }],
    };
  const free = noReviewCount(a.acres, noReviewRoute(d.county));
  const decides = countyFacts(r, a, d.county, d, free);
  const headline = divideHeadline(d);
  if (d.kind === "unknown") return { answer: "maybe", reason: headline, decides };
  const both = twoWays(d, free, a);
  const freeLots = free?.lots ?? 1;
  // The no-review route doesn't rest on the district or the frontage: 2 lots or more that way is a Yes whatever they are,
  // except on a parcel with no public road frontage at all, where each new lot's way in is the question (Roan).
  if (freeLots >= 2 && both && d.publicFrontageFt === 0)
    return { answer: "maybe", reason: DIVIDE.withNote(both, DIVIDE.needsAccess), decides };
  if (freeLots >= 2 && both) {
    const held =
      d.publicFrontageFt === null && d.frontagePerLotFt !== null
        ? DIVIDE.noFrontage
        : d.lots >= 2 && d.assumedDefault
          ? DIVIDE.assumedDefault
          : null;
    return { answer: "yes", reason: held ? DIVIDE.withNote(both, held) : both, decides };
  }
  if (d.publicFrontageFt === null && d.frontagePerLotFt !== null)
    return { answer: "maybe", reason: DIVIDE.withNote(headline, DIVIDE.noFrontage), decides };
  if (d.lots >= 2 && both)
    return d.assumedDefault
      ? { answer: "maybe", reason: DIVIDE.withNote(both, DIVIDE.assumedDefault), decides }
      : { answer: "yes", reason: both, decides };
  const around = d.county.exceptions.find((e) => ACCESS_EXCEPTION.test(e.value));
  if (d.binding === "frontage" && d.byAcres >= 2 && around)
    return {
      answer: "maybe",
      reason: DIVIDE.withNote(headline, DIVIDE.couldAllowMore(around.value)),
      decides,
    };
  return { answer: "no", reason: headline, decides };
}
