/**
 * "My rubric" rendered (step 3, PR 2): the default card in four columns, each card's words, rank and weight, the
 * empty columns' lines, the "min" badge, and the first reorder's notice.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultRubric } from "@/lib/rubric/default";
import { columnsOf, moveCard } from "@/lib/rubric/edit";
import { emptyLine, RubricColumns } from "./RubricColumns";
import { NOTICE_TEXT, WeightsNotice } from "./WeightsNotice";

const D = defaultRubric();
const noop = () => {};

describe("the columns", () => {
  it("the default: four columns, the cards' words, ranks and weights, and the empty columns' lines", () => {
    const html = renderToStaticMarkup(<RubricColumns rubric={D} move={noop} open={noop} />);
    for (const name of ["Must", "Should", "Could", "Won&#x27;t"])
      expect(html).toContain(`aria-label="${name}"`);
    expect(html).toContain("Build site at 2,500 ft or higher");
    expect(html).toContain("#1 · 25%");
    expect(html).toContain("#7 · 5%");
    expect(html).toContain(emptyLine("could", columnsOf(D)));
    expect(html).toContain("Everything counts. Move a card here to leave it out of your grade.");
    expect(html).not.toContain("rubric-min-badge");
  });

  it("a row with a minimum: its card marked min, the minimum's card in Must", () => {
    const out = moveCard(D, { kind: "factor", factor: "town" }, "must");
    if (!out.ok) throw new Error(out.reason);
    const html = renderToStaticMarkup(<RubricColumns rubric={out.rubric} move={noop} open={noop} />);
    expect(html).toContain('class="rubric-min-badge"');
    expect(html).toContain("Town and hospital: ER within 30 min");
  });

  it("Should's empty line says where the grade comes from", () => {
    const empty = { ...columnsOf(D), should: [], could: [] };
    expect(emptyLine("should", empty)).toBe("Nothing counts toward a grade: move a card to Should.");
  });
});

describe("the notice", () => {
  it("says the order sets the weights, with See what changed and Undo (the table opens on demand)", () => {
    const out = moveCard(D, { kind: "factor", factor: "sky" }, "should", 1);
    if (!out.ok || !out.switched) throw new Error("no switch");
    const html = renderToStaticMarkup(<WeightsNotice switched={out.switched} undo={noop} dismiss={noop} />);
    expect(html).toContain(NOTICE_TEXT);
    expect(html).toContain("See what changed");
    expect(html).toContain("Undo");
    expect(html).not.toContain("<table");
  });
});
