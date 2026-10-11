/**
 * VR5's promise (value-ranking.md §6.1, rule 7): today's report moves into the card's panels unchanged, and
 * nothing is deleted. On every fixture result, each report section's rendered body, word for word and tag for tag,
 * appears in some panel, under its own heading.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { reportCard } from "@/lib/report/card";
import { panelText } from "@/lib/report/cardPanels";
import { evaluationPoint } from "../blocks/types";
import { REPORT } from "../report";
import { CardPanel } from "./CardPanel";
import { PANEL_KEYS, panelSections } from "./panelBlocks";

const RUNS = [
  ["ferney-creek-52-47A", "run"],
  ["ferney-creek-52-47A", "setHouse"],
  ["ferney-creek-52-47A", "houseRun"],
  ["macks-mountain-35-3", "run"],
  ["macks-mountain-35-3", "evaluateSite2"],
  ["grayson-mud-creek-6273", "run"],
  ["grayson-mud-creek-6273", "evaluateSite2"],
] as const;

describe("the report card's panels (VR5)", () => {
  it("every report section is in at least one panel", () => {
    const placed = new Set(PANEL_KEYS.flatMap((k) => panelSections(k).map((s) => s.Block)));
    for (const { Block } of REPORT) expect(placed.has(Block), Block.name).toBe(true);
  });

  it.each(RUNS)(
    "%s %s: every section renders in a panel, word for word, under its heading",
    (slug, scenario) => {
      const result = expectedOf(slug, scenario);
      const point = evaluationPoint(result);
      const card = reportCard(result, "zach");
      const panels = PANEL_KEYS.map((k) =>
        renderToStaticMarkup(
          <CardPanel panel={k} card={card} result={result} point={point} onClose={() => {}} />,
        ),
      ).join("\n");
      let shown = 0;
      for (const { Block, heading } of REPORT) {
        // Rendered as a component: a block may use a hook (the December sun's ground viewer button).
        const Body = () => <>{Block({ result, point, variant: "panel" })}</>;
        const body = renderToStaticMarkup(<Body />);
        if (body === "") continue;
        const h = heading(result, point);
        expect(panels, `${h.title}'s heading`).toContain(`data-key="${h.slug}"><h3>${h.title}`);
        expect(panels, `${h.title}'s body`).toContain(body);
        shown++;
      }
      expect(shown).toBeGreaterThan(8);
    },
  );

  it("each panel opens with its question, this parcel's reading and how it's scored", () => {
    const result = expectedOf("grayson-mud-creek-6273", "run");
    const html = renderToStaticMarkup(
      <CardPanel
        panel="sky"
        card={reportCard(result, "zach")}
        result={result}
        point={evaluationPoint(result)}
        onClose={() => {}}
      />,
    );
    const t = panelText("sky");
    expect(html).toContain(t.question);
    expect(html).toContain("rural dark sky (zone 3a).");
    expect(html).toContain(t.howScored);
  });

  it("the How it's scored lines come from the config", () => {
    expect(panelText("elevation").howScored).toBe(
      "A at 3,000 ft and up, B from 2,500 ft, C from 2,000 ft, D from 1,500 ft; weight 25 (Zach) / 10 (Julie).",
    );
    expect(panelText("room").howScored).toBe(
      "Gentle ground (15% or less) against the build footprint, 19,856 ft²: A at 3×, B from 2×, C from 1.25×, D when it fits; weight 15 (Zach) / 10 (Julie).",
    );
    expect(panelText("trails").howScored).toBe(
      "A when the parcel adjoins open public land or a trailhead is within 3.1 mi; B with open public land within a mile, or a trailhead within 6.2 mi; C within 12.4 mi; D within 21.7 mi (straight line); weight 10 (Zach) / 25 (Julie).",
    );
  });
});
