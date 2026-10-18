/**
 * "What matters to you" rendered (step 3, PR 2; the owner's words, 10/18): the starting list in four columns, each
 * card's title and plain line (no rank or weight), the empty columns' lines, the "limit" badge, and the first
 * reorder's notice.
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
  it("the starting list: four columns, each card's title and plain line, no rank or weight, the empty lines", () => {
    const html = renderToStaticMarkup(<RubricColumns rubric={D} move={noop} open={noop} />);
    for (const name of ["Must have", "Really want", "Nice to have", "Don&#x27;t care"])
      expect(html).toContain(`aria-label="${name}"`);
    expect(html).toContain("2,500 ft or higher");
    expect(html).toContain("Dark enough to see the Milky Way");
    expect(html).toContain("Driveway on your land");
    expect(html).not.toContain("Easement needed");
    expect(html).not.toMatch(/#\d+ · \d+%/);
    expect(html).toContain(emptyLine("could", columnsOf(D)));
    expect(html).toContain("Nothing ignored: everything counts. Move an item here to ignore it.");
    expect(html).not.toContain("rubric-min-badge");
  });

  it("a row with a limit: its card marked limit, the limit's card in Must have", () => {
    const out = moveCard(D, { kind: "factor", factor: "town" }, "must");
    if (!out.ok) throw new Error(out.reason);
    const html = renderToStaticMarkup(<RubricColumns rubric={out.rubric} move={noop} open={noop} />);
    expect(html).toContain('class="rubric-min-badge"');
    expect(html).toContain("Town and hospital: ER within 30 min");
  });

  it("Really want's empty line says where the grade comes from", () => {
    const empty = { ...columnsOf(D), should: [], could: [] };
    expect(emptyLine("should", empty)).toBe("Nothing counts toward the grade. Move an item here.");
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
