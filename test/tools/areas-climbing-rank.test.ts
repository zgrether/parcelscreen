/**
 * The hand-back's re-rank report (roadmap step 17, docs/plans/step-17-climbing.md §5, §11 Q7), from the committed area
 * files, no network:
 *
 *   pnpm exec vitest run test/tools/areas-climbing-rank.test.ts --mode areas-climbing-rank
 *
 * The top 10 under the test rubric (the starting list on rank-sum weights: every factor at its default), then with
 * Climbing added as the last Really want at the 60-minute default; each area's rank, fit and climbMin median, and what
 * moved into or out of the top 10. Written to test-results/areas-climbing-rank.md.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { areaCard, rankAreas, rankOf } from "@/lib/areas/score";
import { AREA_FILE_VERSION, AreaFileSchema, type AreaFile } from "@/lib/areas/types";
import { defaultRubric } from "@/lib/rubric/default";
import { MINE, type Rubric } from "@/lib/rubric/types";

const DIR = join(process.cwd(), "public", "areas", `v${AREA_FILE_VERSION}`);

describe.runIf(import.meta.env.MODE === "areas-climbing-rank")(
  "the catalog's top 10, with and without Climbing",
  () => {
    it("writes the report", () => {
      const areas: AreaFile[] = readdirSync(DIR)
        .filter((f) => f.endsWith(".json") && f !== "index.json")
        .map((f) => AreaFileSchema.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))));
      const names = new Map(areas.map((a) => [a.id, a.name]));
      const before: Rubric = { ...defaultRubric(), weights: { mode: "rankSum" } };
      const after: Rubric = {
        ...before,
        wonts: before.wonts.filter((f) => f !== "climbing"),
        ranked: [...before.ranked, { factor: "climbing", tier: "should" }],
      };
      const rank = (R: Rubric) =>
        rankAreas(
          areas.map((a) => areaCard(a, { id: MINE, name: "Test", rubric: R })),
          names,
        );
      const b = rank(before);
      const a = rank(after);
      const bRank = rankOf(b);
      const climb = (id: string) => areas.find((x) => x.id === id)!.medians.climbMin;
      const table = (cards: typeof a, other?: Map<string, number>) => [
        "| # | Area | Fit | Rope area, median min |" + (other ? " Was |" : ""),
        "|---|---|---|---|" + (other ? "---|" : ""),
        ...cards
          .slice(0, 10)
          .map(
            (c, i) =>
              `| ${i + 1} | ${names.get(c.id)} | ${c.fit ?? "–"} | ${climb(c.id) ?? "–"} |` +
              (other ? ` ${other.get(c.id)} |` : ""),
          ),
      ];
      const top = (cards: typeof a) => new Set(cards.slice(0, 10).map((c) => c.id));
      const [tb, ta] = [top(b), top(a)];
      const into = [...ta].filter((id) => !tb.has(id)).map((id) => names.get(id));
      const outOf = [...tb].filter((id) => !ta.has(id)).map((id) => names.get(id));
      const md = [
        "**Before** (the starting list on rank-sum weights):",
        "",
        ...table(b),
        "",
        "**After** (Climbing added as the last Really want, B within 60 min):",
        "",
        ...table(a, bRank),
        "",
        `Into the top 10: ${into.join(", ") || "none"}. Out of it: ${outOf.join(", ") || "none"}.`,
      ].join("\n");
      mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
      writeFileSync(join(process.cwd(), "test-results", "areas-climbing-rank.md"), md + "\n");
      console.log(md);
      expect(a.length).toBe(areas.length);
    });
  },
);
