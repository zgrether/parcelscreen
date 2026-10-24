/**
 * Divide's answer (step 14 §3.1, §3.3): divide.ts's count as Yes, Maybe or No, with the county's rules as the facts.
 * Yes: 2 lots or more. Maybe: the district wasn't read from a map (the rural default is assumed), the frontage wasn't
 * measured where the county has a frontage rule, the minimum lot size isn't online, or 1 lot by the frontage where the
 * acres would allow more and the county has a way around frontage (a private road, a right-of-way, a flag lot). No: 1
 * lot, or a county not covered. Exceptions are listed as "Could allow more", never counted. Pure.
 */
import { countyByFips, type CountyRules } from "../config/counties";
import type { PartialScreenResult } from "../screen/types";
import { divide, divideHeadline, divideLimit, type DivideResult } from "./divide";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { DIVIDE, MISSING, REPORT_DIVIDE, SOURCE } from "./words";

/** An exception that reaches a lot without its own frontage: what could make a frontage-limited count 2. */
const ACCESS_EXCEPTION = /private|right-of-way|flag|panhandle/i;

const slopePct = (r: PartialScreenResult): number | null =>
  r.terrain ? Math.tan((r.terrain.slopeMedDeg * Math.PI) / 180) * 100 : null;

/** The count's inputs from the result: its acres, frontage, slope, county and zoning district. */
export function divideOf(r: PartialScreenResult): DivideResult | null {
  if (!r.county) return null;
  return divide({
    acres: r.acres,
    publicFrontageFt: r.frontage?.publicFt ?? null,
    slopePct: slopePct(r),
    county: countyByFips(r.county.fips),
    district: r.county.zoning?.districts[0]?.code ?? null,
  });
}

const ruleFact = (
  label: string,
  f: { says: string; confidence: string; source: string; checked: string },
): Fact => ({
  label,
  value: DIVIDE.says(f.says, f.confidence),
  source: f.source,
  date: f.checked,
});

function countyFacts(r: PartialScreenResult, c: CountyRules): Fact[] {
  const districts = r.county?.zoning?.districts ?? [];
  const zoning: Fact = !c.zoning.value
    ? ruleFact(DIVIDE.zoningLabel, c.zoning)
    : districts.length
      ? { label: DIVIDE.zoningLabel, value: districts.map((d) => DIVIDE.district(d.code, d.name)).join(", ") }
      : {
          label: DIVIDE.zoningLabel,
          value: DIVIDE.assumedDefault,
          source: c.ruralDistrict.source,
          date: c.ruralDistrict.checked,
        };
  return [
    { label: DIVIDE.countyLabel, value: `${c.name}, ${c.state}` },
    ruleFact(DIVIDE.ordinanceLabel, c.ordinance),
    zoning,
    { label: DIVIDE.acresLabel, value: DIVIDE.acres(r.acres) },
    ruleFact(DIVIDE.minLotLabel, c.minLotAc),
    ruleFact(DIVIDE.frontageRuleLabel, c.frontageFt),
    r.frontage
      ? { label: DIVIDE.frontageLabel, value: DIVIDE.feet(r.frontage.publicFt), source: SOURCE.tiger }
      : { label: DIVIDE.frontageLabel, value: MISSING.frontage },
    ...c.exceptions.map((e) =>
      ruleFact(DIVIDE.exceptionLabel, { ...e, says: DIVIDE.couldAllowMore(e.says) }),
    ),
    ruleFact(DIVIDE.reviewLabel, c.review),
    ...(c.exemptOverAc.value !== null ? [ruleFact(DIVIDE.exemptLabel, c.exemptOverAc)] : []),
    ...c.notes.map((n) => ({ label: DIVIDE.noteLabel, value: n })),
  ];
}

/**
 * One page's Divide line (§7): "Can divide into up to 3 lots", or "Can't divide: limited by …". Only where the county is
 * covered and its minimum lot size is known; null otherwise.
 */
export function divideReportLine(r: PartialScreenResult): string | null {
  const d = divideOf(r);
  if (!d || d.kind !== "lots") return null;
  return d.lots >= 2 ? REPORT_DIVIDE.can(d.lots) : REPORT_DIVIDE.cant(divideLimit(d));
}

export function divideUse({ result: r }: UsesInput): UseAnswer {
  const d = divideOf(r);
  if (!d) return { answer: "maybe", reason: MISSING.county, decides: [] };
  if (d.kind === "notCovered")
    return {
      answer: "no",
      reason: DIVIDE.notCovered,
      decides: [{ label: DIVIDE.countyLabel, value: `${r.county!.name}, ${r.county!.state}` }],
    };
  const decides = countyFacts(r, d.county);
  const headline = divideHeadline(d);
  if (d.kind === "unknown") return { answer: "maybe", reason: headline, decides };
  if (d.publicFrontageFt === null && d.frontagePerLotFt !== null)
    return { answer: "maybe", reason: DIVIDE.withNote(headline, DIVIDE.noFrontage), decides };
  if (d.lots >= 2)
    return d.assumedDefault
      ? { answer: "maybe", reason: DIVIDE.withNote(headline, DIVIDE.assumedDefault), decides }
      : { answer: "yes", reason: headline, decides };
  const around = d.county.exceptions.find((e) => ACCESS_EXCEPTION.test(e.value));
  if (d.binding === "frontage" && d.byAcres >= 2 && around)
    return {
      answer: "maybe",
      reason: DIVIDE.withNote(headline, DIVIDE.couldAllowMore(around.value)),
      decides,
    };
  return { answer: "no", reason: headline, decides };
}
