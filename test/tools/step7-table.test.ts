/**
 * Step 7's hand-back table (docs/plans/step-7-results.md §7, §8): for every fixture and scenario, the grade, verdict
 * and the site graded, before the step and after it, under the starting list and under an interview's rubric.
 *
 *   pnpm step7-table                          the interview's rubric from the worked example's Person A
 *   ANSWERS=<file.json> pnpm step7-table      from a person's own interview answers (kept out of the repo)
 *
 * "Before" is the card as main grades it: at site #1 with no Driveway row. For the starting list that's the guard's
 * site-#1 card (lib/rubric/default.test.ts proves it's today's, byte for byte). For an interview's rubric it's the
 * generator with question 10 unanswered and no default points for Driveway, which leaves it Don't care and every
 * other card where main put it (step 7 added Driveway to the tie order after the rows main had). "After" is the
 * card at the person's best site, with the Driveway row. Each changed row says which of the two sources moved it.
 *
 * Writes test-results/step7-table.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { reportCard, siteLabel, type Card } from "@/lib/report/card";
import { defaultNamedRubric } from "@/lib/rubric/default";
import { rubricFromAnswers } from "@/lib/rubric/interview/generate";
import { InterviewAnswersSchema, type InterviewAnswers } from "@/lib/rubric/interview/answers";
import type { NamedRubric } from "@/lib/rubric/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { ScreenResult } from "@/lib/screen/types";
import { expectedOf } from "../support/expected";
import { ALL_SCENARIOS } from "../support/scenarios";

const OUT = "test-results/step7-table.md";

/** The worked example's Person A (step 4 plan §4), when no answers are given. */
const PERSON_A: InterviewAnswers = {
  climate: "cool",
  sky: "camera",
  glow: "spoils",
  sunView: "sun",
  trails: "door",
  groceries: "close",
  er: "30",
  fly: "rarely",
  calls: "yes",
  neighbors: "never",
  garden: "kitchen",
  driveway: "gentle",
  hoa: "none",
  creek: "best",
  land: { acres: "20to50" },
  walkAway: { chips: ["flood", "hoa", "belowFt", "noWinterSun"], belowFt: 2500 },
};

/** The interview's rubric as main made it: question 10 unanswered, and Driveway with no default points. */
function beforeStep7(a: InterviewAnswers): NamedRubric {
  const C = {
    ...SCREEN_CONSTANTS.card,
    interview: {
      ...SCREEN_CONSTANTS.card.interview,
      defaultPoints: { ...SCREEN_CONSTANTS.card.interview.defaultPoints, driveway: 0 },
    },
  };
  return { id: "before", name: "Before", rubric: rubricFromAnswers({ ...a, driveway: undefined }, C).rubric };
}

const graded = (c: Card, r: ScreenResult): string => {
  const house = !!r.house && !("outside" in r.house);
  const s = r.sites?.[c.at];
  return house ? "the marked house" : s ? siteLabel(s) : "none";
};

const cell = (c: Card) => `${c.grade ?? "–"} ${c.verdict}`;

/** Why the after card differs: the best site moved, the Driveway row counts, or both. */
function cause(before: Card, after: Card): string {
  const moved = before.at !== after.at;
  const driveway = after.rows.some((x) => x.key === "driveway");
  const changed = cell(before) !== cell(after) || before.points !== after.points;
  if (!changed && !moved) return "";
  return [moved ? "best site" : null, driveway ? "Driveway row" : null].filter(Boolean).join(" + ");
}

describe.runIf(import.meta.env.MODE === "step7-table")("step 7's hand-back table", () => {
  it("writes test-results/step7-table.md", () => {
    const path = process.env.ANSWERS;
    const answers = path ? InterviewAnswersSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : PERSON_A;
    const rubrics = [
      { title: "The starting list", before: defaultNamedRubric(), after: defaultNamedRubric() },
      {
        title: path ? "The interview's rubric (the given answers)" : "The interview's rubric (Person A)",
        before: beforeStep7(answers),
        after: { id: "after", name: "After", rubric: rubricFromAnswers(answers).rubric },
      },
    ];
    const lines: string[] = ["# Step 7: before and after", ""];
    for (const { title, before, after } of rubrics) {
      lines.push(
        `## ${title}`,
        "",
        "| Fixture | Scenario | Before | Points | Site | After | Points | Site | Why |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      );
      for (const { slug, scenario } of ALL_SCENARIOS) {
        const r = expectedOf(slug, scenario);
        const b = reportCard(r, before, undefined, undefined, { at: 0 });
        const a = reportCard(r, after);
        const pts = (c: Card) => (c.points === null ? "–" : c.points.toFixed(2));
        lines.push(
          `| ${slug} | ${scenario} | ${cell(b)} | ${pts(b)} | ${graded(b, r)} | ${cell(a)} | ${pts(a)} | ${graded(a, r)} | ${cause(b, a)} |`,
        );
      }
      lines.push("");
    }
    mkdirSync("test-results", { recursive: true });
    writeFileSync(OUT, lines.join("\n"));
  });
});
