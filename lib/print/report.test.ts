import { describe, expect, it } from "vitest";
import { JULIE, ZACH } from "@/test/support/rubrics";
import { expectedOf } from "@/test/support/expected";
import { EMPTY_HOUSEHOLD } from "../client/takes";
import { agentQuestions } from "../report/agent";
import { answerReason } from "../report/answer";
import { reportCard } from "../report/card";
import { divideReportLine } from "../uses/divideUse";
import {
  FIT_STEPS,
  fitSteps,
  gradedOn,
  nextFit,
  PRINT_AREA,
  presetOf,
  reportContent,
  takeWords,
  type ReportInput,
} from "./report";

const FERNEY = { ...expectedOf("ferney-creek-52-47A", "run"), runAt: "2026-10-20T15:00:00.000Z" };

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  name: "Ferney Creek",
  acres: 43.88,
  askingPrice: 185000,
  askingPriceAt: "2026-10-11T12:00:00.000Z",
  result: FERNEY,
  rubrics: [ZACH, JULIE],
  viewer: ZACH,
  nameOf: (id) => (id === "zach" ? "Zach" : id === "julie" ? "Julie" : "?"),
  household: EMPTY_HOUSEHOLD,
  parcelKey: "k1",
  stale: false,
  ...over,
});

describe("the report card's content (step 9 plan §2)", () => {
  it("the head: name, acres, the asking price as the list says it, and the screen's own date", () => {
    const c = reportContent(input());
    expect(c.name).toBe("Ferney Creek");
    expect(c.price).toBe("Asking $185,000 as of Oct 11, 2026");
    expect(c.graded).toBe(gradedOn(FERNEY.runAt));
    expect(c.graded).toMatch(/^Graded [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(reportContent(input({ askingPrice: null })).price).toBeNull();
    expect(gradedOn("(not compared)")).toBe("Graded");
  });

  it("the grades: the viewer first, then each other member, each with their own answer's reason", () => {
    const c = reportContent(input({ viewer: JULIE }));
    expect(c.grades.map((g) => g.who)).toEqual(["Julie", "Zach"]);
    const julie = reportCard(FERNEY, JULIE);
    expect(c.grades[0]!.reason).toBe(answerReason(julie, FERNEY));
    expect(c.grades[0]!.card.grade).toBe(julie.grade);
  });

  it("the card's rows in the viewer's tiers, each with its mark and its text; questions from the viewer's card", () => {
    const c = reportContent(input());
    expect(c.tiers.map((t) => t.name)).toEqual(["Must have", "Really want"]);
    const must = c.tiers[0]!.rows;
    expect(must.every((r) => ["✓", "!", "✗", "?"].includes(r.mark))).toBe(true);
    const access = must.find((r) => r.label === "Legal road access")!;
    expect(access.text).toMatch(/^Check first: /);
    expect(access.short.length).toBeLessThanOrEqual(access.text.length);
    const ranked = c.tiers[1]!.rows;
    expect(ranked.every((r) => /^[A-F–]$/.test(r.mark))).toBe(true);
    expect(c.questions).toEqual(agentQuestions(reportCard(FERNEY, ZACH)).map((q) => q.question));
  });

  it("takes on this parcel only, by name, with their comments", () => {
    const household = {
      ...EMPTY_HOUSEHOLD,
      takes: [
        {
          key: "k1:julie",
          parcel: "k1",
          by: "julie",
          answer: "maybe" as const,
          comment: "Steep drive.",
          at: "x",
        },
        { key: "k2:julie", parcel: "k2", by: "julie", answer: "yes" as const, comment: "", at: "x" },
      ],
    };
    const c = reportContent(input({ household }));
    expect(c.takes).toEqual([{ who: "Julie", answer: "maybe", comment: "Steep drive." }]);
    expect(takeWords(c.takes[0]!)).toBe("Julie says Maybe");
  });

  it("step 14: One page's Divide line and Full's uses, at the viewer's card; the parcel's listing read", () => {
    const c = reportContent(input());
    expect(c.divide).toBe(divideReportLine(FERNEY));
    expect(c.uses.uses.map((u) => u.key)).toEqual([
      "camp",
      "build",
      "trails",
      "garden",
      "hunt",
      "ride",
      "divide",
    ]);
    const hoa = reportContent(input({ parcel: { markup: [], deedRestrictions: "", hoa: "yes" } }));
    expect(hoa.uses.limits).toContainEqual(expect.objectContaining({ label: "HOA", value: "Yes" }));
  });
});

describe("One page's fit (plan §2)", () => {
  it("shortens in order, rows first, and stops when it fits or nothing's left", () => {
    expect(FIT_STEPS).toEqual(["shortRows", "oneLineComments", "smallerMap", "oneLineAnswers"]);
    expect([...fitSteps(0)]).toEqual([]);
    expect([...fitSteps(2)]).toEqual(["shortRows", "oneLineComments"]);
    expect(nextFit(0, PRINT_AREA.height)).toBeNull();
    expect(nextFit(0, PRINT_AREA.height + 1)).toBe(1);
    expect(nextFit(FIT_STEPS.length, 5000)).toBeNull();
  });

  it("the preset from the URL or the pref", () => {
    expect(presetOf("full")).toBe("full");
    expect(presetOf("one")).toBe("one");
    expect(presetOf("other")).toBeNull();
    expect(presetOf(null)).toBeNull();
  });
});
