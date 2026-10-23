/** The step 7 panel's sections, rendered with react-dom/server (plan §7, components). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import { reportCard } from "@/lib/report/card";
import { drawnOf } from "@/lib/report/marks";
import { DEFAULT_RATES } from "@/lib/config/costs";
import { defaultRubric } from "@/lib/rubric/default";
import type { NamedRubric } from "@/lib/rubric/types";
import { REPORT } from "../report";
import { ReportCard } from "../card/ReportCard";
import { AgentQuestions } from "./AgentQuestions";
import { BestHomesite, ordinal } from "./BestHomesite";
import { siteMeasures } from "@/lib/report/siteMeasures";
import { FullReport } from "./FullReport";

const FERNEY = expectedOf("ferney-creek-52-47A", "run");
const MUD = expectedOf("grayson-mud-creek-6273", "run");
const noop = () => {};
/** The visible text, tags dropped. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("the report card in priority order (plan §1.4)", () => {
  const html = (nr: NamedRubric = ZACH) =>
    renderToStaticMarkup(
      <ReportCard
        card={reportCard(FERNEY, nr)}
        result={FERNEY}
        running={false}
        rubrics={[nr]}
        setRubric={noop}
        onOpen={noop}
      />,
    );

  it("the answer first, then Must have and Really want; Don't care hidden", () => {
    const t = text(html());
    const at = (s: string) => t.indexOf(s);
    expect(at("Strong elevation and winter sun")).toBeGreaterThan(-1);
    expect(at("Must have")).toBeGreaterThan(at("Strong elevation"));
    expect(at("Really want")).toBeGreaterThan(at("Must have"));
    // Step 10: the pending row went; without the parcel's price and rates there's no Cost to enjoy section.
    expect(t).not.toContain("Cost to enjoy");
    // The starting list's Driveway row is Don't care: not on the card.
    expect(t).not.toContain("at its steepest");
    // The Must rows use the priorities page's titles (owner, #216).
    expect(t).toContain("Driveway on your land");
    expect(t).not.toContain("Easement needed");
    // The rows in rank order: Elevation and Best homesite (25), Room to build (15), then the 10s.
    expect(at("Elevation at the build site")).toBeLessThan(at("Room to build"));
    expect(at("Room to build")).toBeLessThan(at("Night sky"));
  });

  it("Cost to enjoy after the answer: each line against its budget (step 10 plan §4)", () => {
    const nr = { ...ZACH, rubric: { ...ZACH.rubric, budgets: { camp: 250_000, build: 300_000 } } };
    const drawn = drawnOf([], null, { askingPrice: 185_000, rates: DEFAULT_RATES });
    const t = text(
      renderToStaticMarkup(
        <ReportCard
          card={reportCard(MUD, nr, drawn)}
          result={MUD}
          running={false}
          rubrics={[nr]}
          setRubric={noop}
          onOpen={noop}
        />,
      ),
    );
    const at = (s: string) => t.indexOf(s);
    expect(at("Cost to enjoy")).toBeGreaterThan(-1);
    expect(at("Cost to enjoy")).toBeLessThan(at("Must have"));
    expect(t).toContain("Ready to camp $200–240k ✓ under your $250k");
    expect(t).toContain("Ready to build $330–595k ✗ over your $300k");
    // Without a price: the range plus the land, no mark.
    const unpriced = text(
      renderToStaticMarkup(
        <ReportCard
          card={reportCard(MUD, nr, drawnOf([], null, { askingPrice: null, rates: DEFAULT_RATES }))}
          result={MUD}
          running={false}
          rubrics={[nr]}
          setRubric={noop}
          onOpen={noop}
        />,
      ),
    );
    expect(unpriced).toMatch(/Ready to camp \$\d+–\d+k plus the land Ready to build/);
  });

  it("each Must says pass, check first, fail or unknown, with its reason", () => {
    const t = html();
    expect(t).toContain('aria-label="Legal road access: warn"');
    expect(text(t)).toContain("Check first: frontage on an unnamed road");
    expect(t).toContain('aria-label="Floodplain: pass"');
  });

  it("a Nice to have group when the rubric has one; a gate the person doesn't keep is gone", () => {
    const D = defaultRubric();
    const nr: NamedRubric = {
      id: "x",
      name: "x",
      rubric: {
        ...D,
        musts: D.musts.filter((m) => m.factor !== "septic"),
        ranked: D.ranked.map((c) => (c.factor === "garden" ? { ...c, tier: "could" as const } : c)),
        weights: { mode: "rankSum" },
      },
    };
    const t = text(html(nr));
    expect(t).toContain("Nice to have");
    expect(t.indexOf("Garden ground")).toBeGreaterThan(t.indexOf("Nice to have"));
    expect(t).not.toContain("Septic");
  });
});

describe("Best homesite (plan §1.2–§1.3)", () => {
  const html = (r = FERNEY, showing: string | null = null) =>
    renderToStaticMarkup(
      <BestHomesite
        card={reportCard(r, ZACH)}
        result={r}
        running={false}
        showing={showing}
        pick={noop}
        back={noop}
        show={noop}
      />,
    );

  it("names the best site and its measurements, never a letter (owner, 2026-10-22)", () => {
    const card = reportCard(FERNEY, ZACH);
    const line = siteMeasures(FERNEY, card.sites[0]!.index);
    expect(line).toBe(
      "8.7 h December sun · faces E · 2,729 ft · 4.3 ac gentle ground (9.4× footprint) · 478 ft drive at 5%",
    );
    const h = html();
    const t = text(h);
    expect(t).toContain("Best homesite");
    expect(t).toContain("Site #1");
    expect(t).toContain(line);
    // No letter beside any site: the card is the only place a row's letter shows.
    expect(h).not.toContain("card-grade");
  });

  it("the alternatives, then N more sites: each with its place in the order apart from its pin's number", () => {
    const t = text(html());
    expect(t).toContain("Other sites");
    expect(t).toMatch(/\d more sites/);
    expect(t).toMatch(/2nd Site #\d/);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
    ]);
  });

  it("says which site the map shows when it isn't the best", () => {
    expect(text(html(FERNEY, "site #4"))).toContain("Showing site #4 on the map Back to the best site");
    expect(text(html(FERNEY, "site #1"))).not.toContain("Showing");
  });

  it("a marked house is the build site", () => {
    const t = text(html(expectedOf("ferney-creek-52-47A", "setHouse")));
    expect(t).toContain("Your marked house");
  });

  it("says when the map's sections are for another site, and offers to evaluate the best (owner, #216)", () => {
    // Macks: the best site is #3; the screen ran at site #1. Evaluating #3 re-routes, so it's offered, not done.
    const t = text(html(expectedOf("macks-mountain-35-3", "run")));
    expect(t).toContain(
      "The map's sun, sky and driveway are for site #1, where the screen ran. Evaluate site #3",
    );
    // Ferney: the best site is where the screen ran.
    expect(text(html())).not.toContain("where the screen ran");
  });
});

describe("Still unknown (plan §1.5)", () => {
  it("a question per Must to check, Copy, Copy all; what didn't load apart, the grade button its Try again", () => {
    const r = structuredClone(MUD);
    delete r.flood;
    const t = text(
      renderToStaticMarkup(
        <AgentQuestions card={reportCard(r, ZACH)} name="Mud Creek" showChecklist={noop} />,
      ),
    );
    expect(t).toContain("Ask the listing agent:");
    expect(t).toContain("Has the land had a perc test or a soil evaluation?");
    expect(t).toContain(
      "Why we ask: no soil on the parcel rates better than very limited for a septic field.",
    );
    expect(t).toContain("Copy");
    expect(t).toContain("Didn't load: the FEMA flood map. Try again loads them.");
    expect(t).not.toContain("FEMA hasn't mapped");
  });

  it("nothing to ask", () => {
    const card = { ...reportCard(FERNEY, ZACH), gates: [] };
    const t = text(renderToStaticMarkup(<AgentQuestions card={card} name="Ferney" showChecklist={noop} />));
    expect(t).toContain("Nothing to ask the agent: the screen answered every must.");
    expect(t).toContain("More to check that no dataset covers");
  });
});

describe("Full report (plan §1.6)", () => {
  it("closed, the control alone; open, every section of the report under its heading", () => {
    const props = { result: FERNEY, point: null, drivewayLine: null, setOpen: noop, scrollTo: null };
    expect(text(renderToStaticMarkup(<FullReport {...props} open={false} />)).trim()).toBe("Full report ▸");
    const open = renderToStaticMarkup(<FullReport {...props} open />);
    const shown = REPORT.map((s) => s.heading(FERNEY, null).slug).filter((slug) =>
      open.includes(`data-key="${slug}"`),
    );
    expect(shown.length).toBeGreaterThanOrEqual(10);
    expect(open).toContain('data-key="still-unknown"');
  });
});
