/**
 * Forest carbon, the hunting lease, selective timber, split and resell, and camp sites (step 15 §2.3–§2.7): each reads
 * the screen and Panel 1's answers, and none gives a number the app can't stand behind (the program quotes carbon, a
 * cruise values timber, the county decides camping). Pure.
 */
import { countyByFips } from "../config/counties";
import { countyPayOf } from "../config/countyPay";
import {
  CARBON_PROGRAMS,
  HUNTING_LEASE,
  PAY_THRESHOLDS,
  STATE_CAMPGROUND,
  TIMBER_CRUISE,
} from "../config/programs";
import { MISSING } from "../uses/words";
import type { Fact, UseKey } from "../uses/types";
import { factOf, forestAcOf, whereOf } from "./common";
import type { PayInput, PayLine, PayOption } from "./types";
import { NUMBER, PAY_ASK, PAY_COST, PAY_NAME, REASON, SIGNAL } from "./words";

const T = PAY_THRESHOLDS;
const STATE_NAME = { VA: "Virginia", NC: "North Carolina", TN: "Tennessee" } as const;

const answerOf = (input: PayInput, key: UseKey) => input.land.uses.find((u) => u.key === key)!.answer;
const answerFact = (label: string, a: { answer: string; reason: string }): Fact => ({
  label,
  value: `${a.answer === "yes" ? "Yes" : a.answer === "maybe" ? "Maybe" : "No"}: ${a.reason}`,
});

const base = (key: PayOption["key"]) => ({
  key,
  name: PAY_NAME[key],
  cost: PAY_COST[key],
  ask: PAY_ASK[key],
});

// ---------- Forest carbon (§2.3) ----------

export function carbon(input: PayInput): PayOption {
  const r = input.uses.result;
  const where = whereOf(r);
  const forestAc = forestAcOf(r);
  const programs = where?.state ? CARBON_PROGRAMS.filter((p) => p.states.value.includes(where.state!)) : [];
  const signals: Fact[] = [
    {
      label: SIGNAL.forest,
      value:
        r.cover && forestAc !== null
          ? SIGNAL.forestValue(r.cover.forestPct, forestAc)
          : MISSING.cover("forest share"),
    },
    ...programs.flatMap((p) => [
      factOf(SIGNAL.program(p.name), p.states),
      factOf(SIGNAL.minimum(p.minForestAc.value), p.minForestAc),
    ]),
  ];
  const p = programs[0];
  const number: PayLine[] = [{ text: NUMBER.programQuotes }];
  const say = (eligibility: PayOption["eligibility"], reason: string): PayOption => ({
    ...base("carbon"),
    eligibility,
    reason,
    signals,
    number,
    ...(p ? { link: { label: p.name, href: p.url }, cost: `${PAY_COST.carbon}: ${p.contract.says}` } : {}),
  });
  if (!where) return say("maybe", MISSING.county);
  if (!p) return say("no", REASON.state(r.county!.state));
  if (forestAc === null) return say("maybe", MISSING.cover("forest share"));
  const min = p.minForestAc.value;
  // The program takes western Virginia and western North Carolina: the ten counties are, others may not be.
  if (!where.county && where.state !== "TN" && forestAc >= min)
    return say("maybe", REASON.carbonRegion(STATE_NAME[where.state!]));
  if (forestAc >= min) return say("eligible", REASON.carbonEligible(p.name, min));
  if (forestAc >= min * (1 - T.carbonNearPct.value / 100))
    return say("maybe", REASON.carbonNear(forestAc, min));
  return say("no", REASON.carbonSmall(forestAc, min));
}

// ---------- Hunting lease (§2.4) ----------

/** Rounded to $50: a lease is a round figure. */
const to50 = (n: number) => Math.round(n / 50) * 50;

export function lease(input: PayInput): PayOption {
  const r = input.uses.result;
  const hunt = answerOf(input, "hunt");
  const min = T.leaseMinAc.value;
  const range = HUNTING_LEASE.value;
  const signals: Fact[] = [
    answerFact(SIGNAL.hunt, hunt),
    { label: SIGNAL.acres, value: `${r.acres.toFixed(1)} ac` },
    factOf(SIGNAL.minimum(min), T.leaseMinAc),
  ];
  const number: PayLine[] = [
    {
      text: `${NUMBER.lease(to50(r.acres * range.low), to50(r.acres * range.high), r.acres, range)}: ${NUMBER.rough}`,
      firmness: "low",
      source: HUNTING_LEASE.source,
      asOf: HUNTING_LEASE.asOf,
      confidence: HUNTING_LEASE.confidence,
    },
    {
      text: HUNTING_LEASE.says,
      source: HUNTING_LEASE.source,
      asOf: HUNTING_LEASE.asOf,
      confidence: HUNTING_LEASE.confidence,
    },
  ];
  const say = (eligibility: PayOption["eligibility"], reason: string, withNumber = true): PayOption => ({
    ...base("lease"),
    eligibility,
    reason,
    signals,
    number: withNumber ? number : [],
  });
  if (hunt.answer === "no") return say("no", hunt.reason, false);
  // Under Hunt's own minimum there's nothing to lease.
  if (r.acres < 10) return say("no", REASON.leaseNo, false);
  if (hunt.answer === "maybe") return say("maybe", REASON.leaseHunt(hunt.reason));
  if (r.acres < min) return say("maybe", REASON.leaseSmallish(r.acres, min));
  return say("eligible", REASON.leaseEligible(r.acres));
}

// ---------- Selective timber (§2.5) ----------

export function timber(input: PayInput): PayOption {
  const r = input.uses.result;
  const forestAc = forestAcOf(r);
  const cruise = input.listing.timberCruise;
  const signals: Fact[] = [
    {
      label: SIGNAL.forest,
      value:
        r.cover && forestAc !== null
          ? SIGNAL.forestValue(r.cover.forestPct, forestAc)
          : MISSING.cover("forest share"),
    },
    factOf(SIGNAL.minimum(T.timberMinAc.value), T.timberMinAc),
  ];
  const number: PayLine[] = cruise
    ? [{ text: NUMBER.cruiseValued(cruise.value, cruise.date), firmness: "from your cruise" }]
    : [
        {
          text: NUMBER.cruise,
          source: TIMBER_CRUISE.source,
          asOf: TIMBER_CRUISE.asOf,
          confidence: TIMBER_CRUISE.confidence,
        },
      ];
  const say = (eligibility: PayOption["eligibility"], reason: string): PayOption => ({
    ...base("timber"),
    eligibility,
    reason,
    signals,
    number,
  });
  if (forestAc === null) return say("maybe", MISSING.cover("forest share"));
  if (forestAc >= T.timberMinAc.value) return say("eligible", REASON.timberEligible(forestAc));
  if (forestAc >= T.timberNoneAc.value)
    return say("maybe", REASON.timberSmall(forestAc, T.timberMinAc.value));
  return say("no", REASON.timberNone);
}

// ---------- Split and resell (§2.6) ----------

export function splitResell(input: PayInput): PayOption {
  const divide = answerOf(input, "divide");
  const number: PayLine[] = input.scenarios.length
    ? input.scenarios.map((s) => ({
        text:
          s.perAc !== null
            ? NUMBER.breakEven(s.name, s.soldWord.toLowerCase(), s.perAc)
            : NUMBER.breakEvenNoPrice(s.name),
        ...(s.perAc !== null ? { firmness: "your inputs" as const } : {}),
      }))
    : [{ text: NUMBER.trySplit }];
  const eligibility = divide.answer === "yes" ? "eligible" : divide.answer === "maybe" ? "maybe" : "no";
  return {
    ...base("split"),
    eligibility,
    reason: REASON.splitDivide(divide.reason),
    signals: [answerFact(SIGNAL.divide, divide)],
    number: divide.answer === "no" ? [] : number,
  };
}

// ---------- Camp sites (§2.7) ----------

export function campSites(input: PayInput): PayOption {
  const r = input.uses.result;
  const camp = answerOf(input, "camp");
  const where = whereOf(r);
  const rules = r.county ? countyByFips(r.county.fips) : null;
  const pay = r.county ? countyPayOf(r.county.fips) : null;
  const signals: Fact[] = [
    answerFact(SIGNAL.camp, camp),
    ...(pay
      ? [factOf(SIGNAL.county, pay.campground)]
      : where
        ? [{ label: SIGNAL.county, value: REASON.notCovered(where.label) }]
        : []),
    ...(where?.state ? [factOf(STATE_NAME[where.state], STATE_CAMPGROUND[where.state])] : []),
  ];
  return {
    ...base("camp"),
    eligibility: camp.answer === "no" ? "no" : "maybe",
    reason: camp.answer === "no" ? REASON.campNo(camp.reason) : REASON.campCounty,
    signals,
    number: [{ text: NUMBER.campNone }],
    ...(rules ? { link: { label: rules.ordinance.says, href: rules.ordinance.source } } : {}),
  };
}
