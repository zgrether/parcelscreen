/** The answer line (step 7 plan §1.1) and Still unknown's questions (§1.5). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import { defaultRubric } from "../rubric/default";
import { rubricFromAnswers } from "../rubric/interview/generate";
import type { NamedRubric, Rubric } from "../rubric/types";
import { reportCard } from "./card";
import { answerLine, biggestMiss, checks, incompleteLine, strengths } from "./answer";
import { AGENT_QUESTIONS, agentQuestions, copyAllText } from "./agent";

const FERNEY = expectedOf("ferney-creek-52-47A", "run");
const MACKS = expectedOf("macks-mountain-35-3", "run");
const MUD = expectedOf("grayson-mud-creek-6273", "run");
const named = (rubric: Rubric): NamedRubric => ({ id: "x", name: "x", rubric });
/** An interviewed person: a 15-minute trailhead, a 30-minute ER, a gentle driveway. */
const ANSWERED = named(
  rubricFromAnswers({ climate: "between", sky: "camera", trails: "door", er: "30", driveway: "gentle" })
    .rubric,
);

describe("the answer line", () => {
  it("names up to two strengths, the heaviest rows at A or B, and the row that costs the grade most", () => {
    const card = reportCard(FERNEY, ZACH);
    expect(strengths(card).map((x) => x.key)).toEqual(["elevation", "homesite"]);
    expect(biggestMiss(card)!.key).toBe("trails");
    expect(answerLine(card, FERNEY)).toBe(
      "B, Contender. Strong elevation and winter sun; the nearest trailhead is 47 minutes away, past your 20-minute limit; check first: legal road access.",
    );
  });

  it("measures the miss against the person's own edge", () => {
    const card = reportCard(FERNEY, ANSWERED);
    expect(answerLine(card, FERNEY)).toMatch(
      /; the nearest trailhead is 47 minutes away, past your 15-minute limit; /,
    );
  });

  it("ends with what to check first when the miss didn't say it (the fresh-eyes review)", () => {
    expect(answerLine(reportCard(FERNEY, ZACH), FERNEY)).toMatch(/; check first: legal road access\.$/);
    // Said once: where it's the miss itself, it isn't repeated.
    expect(answerLine(reportCard(MACKS, ZACH), MACKS).match(/check first/g)).toHaveLength(1);
  });

  it("says what to check first when that's what holds an A or B at Maybe", () => {
    const card = reportCard(MACKS, ZACH);
    expect([card.grade, card.verdict]).toEqual(["B", "Maybe"]);
    expect(checks(card)).toEqual(["legal road access", "septic"]);
    expect(answerLine(card, MACKS)).toBe(
      "B, Maybe. Strong elevation and winter sun; check first: legal road access and septic.",
    );
  });

  it("leads with a failed must", () => {
    const r = structuredClone(FERNEY);
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 3, mapped: true };
    for (const s of r.sites!) s.flood = true;
    expect(answerLine(reportCard(r, ZACH), r)).toMatch(
      /; fails your must: the build site is in a FEMA flood zone\.$/,
    );
  });

  it("each row's miss in plain words", () => {
    const card = reportCard(MUD, ZACH);
    expect(answerLine(card, MUD)).toBe(
      "B, Contender. Strong elevation and winter sun; 0.1 ac of garden ground, under your 0.25 ac; check first: septic.",
    );
    const r = structuredClone(MUD);
    const h = r.drives!.find((d) => d.er === "yes")!;
    h.min = 38;
    const er = named({
      ...defaultRubric(),
      weights: { mode: "explicit", of: { ...zeroWeights(), hospital: 100 } },
    });
    expect(answerLine(reportCard(r, er), r)).toBe(
      "C, Maybe. 38 minutes to an ER is past your 30-minute limit; check first: septic.",
    );
  });

  it("with no strength and no miss, the grade and verdict alone", () => {
    const card = { ...reportCard(MUD, ZACH), rows: [], gates: [] };
    expect(answerLine(card, MUD)).toBe("B, Contender.");
  });

  it("says what didn't load, apart from the reason", () => {
    const r = structuredClone(FERNEY);
    delete r.flood;
    delete r.sky;
    expect(incompleteLine(reportCard(r, ZACH))).toBe(
      "Incomplete: the FEMA flood map and the sky atlas didn't load.",
    );
    expect(incompleteLine(reportCard(FERNEY, ZACH))).toBeNull();
  });
});

function zeroWeights() {
  return {
    elevation: 0,
    homesite: 0,
    sky: 0,
    room: 0,
    driveway: 0,
    trails: 0,
    town: 0,
    hospital: 0,
    garden: 0,
    climate: 0,
    privacy: 0,
    longView: 0,
    airport: 0,
    longTrail: 0,
    internet: 0,
    budget: 0,
  };
}

describe("Still unknown's questions for the agent", () => {
  it("one per Must to check or unknown, with the gate's reason as why", () => {
    const qs = agentQuestions(reportCard(MACKS, ZACH));
    expect(qs.map((q) => q.key)).toEqual(["access", "septic"]);
    expect(qs[0]!.question).toBe(AGENT_QUESTIONS.access);
    expect(qs[1]!.why).toBe("No soil on the parcel rates better than very limited for a septic field");
  });

  it("an unmapped flood zone is a question; a mapped one touching the site isn't, nor data that didn't load", () => {
    const r = structuredClone(FERNEY);
    r.flood = { zones: [], sfha: false, sfhaAcres: 0, mapped: false };
    expect(agentQuestions(reportCard(r, ZACH)).map((q) => q.key)).toContain("floodplain");
    delete r.flood;
    expect(agentQuestions(reportCard(r, ZACH)).map((q) => q.key)).not.toContain("floodplain");
  });

  it("a gate the person doesn't care about asks nothing", () => {
    const D = defaultRubric();
    const loose = named({ ...D, musts: D.musts.filter((m) => m.factor !== "septic") });
    expect(agentQuestions(reportCard(MACKS, loose)).map((q) => q.key)).toEqual(["access"]);
  });

  it("Copy all: a numbered list under the parcel's name", () => {
    const qs = agentQuestions(reportCard(MACKS, ZACH));
    expect(copyAllText("Macks Mountain", qs)).toBe(
      `Questions about Macks Mountain:\n1. ${AGENT_QUESTIONS.access}\n2. ${AGENT_QUESTIONS.septic}`,
    );
  });
});
