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
import { CardPanel, FROM_THE_REPORT_NOTE } from "./CardPanel";
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
    expect(html).toContain(FROM_THE_REPORT_NOTE.replace("'overall'", "&#x27;overall&#x27;"));
  });

  it("each scale's sentences sit under its own bar, not merged (owner, #113 review)", () => {
    const result = expectedOf("grayson-mud-creek-6273", "run");
    const html = renderToStaticMarkup(
      <CardPanel
        panel="homesite"
        card={reportCard(result, "zach")}
        result={result}
        point={evaluationPoint(result)}
        onClose={() => {}}
      />,
    );
    const groups = html.split('class="scale-group"').slice(1);
    expect(groups).toHaveLength(4);
    // Winter sun's Solar line in the first group; Facing's in the second.
    expect(groups[0]).toContain("panels keep producing through December");
    expect(groups[0]).not.toContain("The slope tilts away from the winter sun");
    expect(groups[1]).toContain("The slope tilts away from the winter sun");
  });

  it("a row's own flags, and the foundation and basement at site #1 (VR3b)", () => {
    const result = expectedOf("grayson-mud-creek-6273", "run");
    const card = reportCard(result, "zach");
    const panel = (p: "septic" | "homesite" | "floodplain") =>
      renderToStaticMarkup(
        <CardPanel
          panel={p}
          card={card}
          result={result}
          point={evaluationPoint(result)}
          onClose={() => {}}
        />,
      );
    // The soils step's flags in the Septic panel, above the moved sections.
    const septic = panel("septic");
    const bedrock = result.flags.find((x) => x.step === "soils" && /^Bedrock under/.test(x.t))!;
    expect(septic.indexOf("panel-flags")).toBeGreaterThan(-1);
    expect(septic.indexOf(bedrock.t)).toBeLessThan(septic.indexOf("panel-from"));
    expect(panel("floodplain")).toContain("FEMA Special Flood Hazard Area");
    // The bottomland note goes with the homesites, not the septic field (owner, #114).
    const bottomland = result.flags.find((x) => x.t.startsWith("The largest flat ground is bottomland"))!;
    expect(bottomland.step).toBe("soils");
    const flagsOf = (html: string) => html.slice(html.indexOf("panel-flags"), html.indexOf('panel-from"'));
    expect(flagsOf(septic)).not.toContain(bottomland.t);
    expect(flagsOf(panel("homesite"))).toContain(bottomland.t);
    // Site #1's own soil isn't bottomland here: no pointer.
    expect(septic).not.toContain("own soil is bottomland");
    // Moved onto the excluded Codorus bench, it is: one line, pointing to Best homesite.
    const moved = structuredClone(result);
    moved.sites![0] = { ...moved.sites![0]!, ll: moved.excluded![0]!.ll };
    expect(
      renderToStaticMarkup(
        <CardPanel
          panel="septic"
          card={card}
          result={moved}
          point={evaluationPoint(moved)}
          onClose={() => {}}
        />,
      ),
    ).toContain(
      "The build site&#x27;s own soil is bottomland (Codorus: frequently flooded): see Best homesite.",
    );
    const home = panel("homesite");
    expect(home).toContain(
      "<b>Foundation at site #1:</b> walkout or garage-under; engineered design, since NRCS rates this soil very limited for houses.",
    );
    expect(home).toContain(
      "(1,500 sq ft, 8 ft deep): about $5,333 to dig in soil; about $26,636 with the rock at 94 cm, $21,303 more.",
    );
  });

  it("the How it's scored lines come from the config", () => {
    expect(panelText("elevation").howScored).toBe(
      "A at 3,000 ft and up, B from 2,500 ft, C from 2,000 ft, D from 1,500 ft; weight 25 (Zach) / 10 (Julie).",
    );
    expect(panelText("room").howScored).toBe(
      "Gentle ground (15% or less) within 300 ft of where the house goes on site #1, against the build footprint, 19,856 ft²: A at 3×, B from 2×, C from 1.25×, D when it fits; an F when the build doesn't fit on any homesite; weight 15 (Zach) / 10 (Julie).",
    );
    expect(panelText("trails").howScored).toBe(
      "A when the parcel adjoins open public land or a trailhead is within 3 mi; B with open public land within a mile, or a trailhead within 6 mi; C within 12 mi; D within 22 mi (straight line); weight 10 (Zach) / 25 (Julie). " +
        // Appended (follow-up 54; rule 7).
        "By road: the quickest drive from where the driveway meets the road to one of the 5 nearest trailheads, to its parking where OpenStreetMap tags one: A within 10 min, B within 20, C within 35, D within 50. The straight-line distances above count only when the drive times didn't load.",
    );
  });
});
